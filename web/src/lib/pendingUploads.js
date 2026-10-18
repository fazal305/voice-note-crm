import { api } from './api'

/**
 * Notes waiting to upload, kept on this device until the server has them (NFR-5.5).
 *
 * Privacy: the audio sits unencrypted in this browser's IndexedDB, on the rep's own device, only until it uploads
 * (the server stores it encrypted). Each entry's `userId` is the signed-in user's `device_key` (an opaque per-user
 * value from /me); entries are only ever listed or uploaded for that user, so a different account on the same
 * browser never sees or sends them.
 *
 * When IndexedDB can't be used (some private modes, blocked storage) entries live in memory instead and are lost
 * on reload; `isPersistent()` says which.
 *
 * Entry: { id, blob, mime, source, durationSeconds, clientId, clientName, originalName, createdAt, attempts,
 *          lastError, status: 'waiting' | 'failed', userId }. `id` is also the upload's client_upload_id.
 */

const DB_NAME = 'voice-note-crm'
const STORE = 'pending-uploads'
export const MAX_ENTRIES = 10
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024
const CHANNEL = 'vnc-pending-uploads'

export class QueueFullError extends Error {}

const memory = new Map()
let dbPromise = null
let persistent = true

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable')
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
        request.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    }).then((db) => {
      persistent = Boolean(db)
      return db
    })
  }
  return dbPromise
}

async function withStore(mode, run) {
  const db = await openDb()
  if (!db) return run(null)
  const tx = db.transaction(STORE, mode)
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  const [result] = await Promise.all([run(tx.objectStore(STORE)), done])
  return result
}

async function all() {
  return withStore('readonly', (store) => (store ? promisify(store.getAll()) : [...memory.values()]))
}

// Other tabs and the shell's hook listen for this to refresh their lists.
let channel = null
try {
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
} catch {
  channel = null
}

function changed() {
  window.dispatchEvent(new CustomEvent('pending-uploads-changed'))
  channel?.postMessage('changed')
}

export function onPendingChange(listener) {
  window.addEventListener('pending-uploads-changed', listener)
  channel?.addEventListener('message', listener)
  return () => {
    window.removeEventListener('pending-uploads-changed', listener)
    channel?.removeEventListener('message', listener)
  }
}

/** Resolves once storage has been tried, so `isPersistent()` is accurate. */
export async function storageReady() {
  await openDb()
  return persistent
}

export function isPersistent() {
  return persistent
}

/** This user's entries, oldest first. */
export async function listPending(userId) {
  const entries = await all()
  return entries.filter((e) => e.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function addPending(entry) {
  const entries = await all()
  // The cap is for the whole device, but the message never says how many belong to someone else.
  const total = entries.reduce((sum, e) => sum + (e.blob?.size ?? 0), 0)
  if (entries.length >= MAX_ENTRIES || total + entry.blob.size > MAX_TOTAL_BYTES) {
    throw new QueueFullError(
      `This device is already holding as many notes as it can (${MAX_ENTRIES} notes or 200 MB). Upload or discard the ones waiting on the Notes page, then try again.`,
    )
  }
  const record = { attempts: 0, lastError: null, status: 'waiting', createdAt: new Date().toISOString(), ...entry }
  try {
    await withStore('readwrite', (store) => (store ? promisify(store.put(record)) : memory.set(record.id, record)))
  } catch (err) {
    if (err?.name === 'QuotaExceededError') {
      throw new QueueFullError("This device is out of storage space, so the note couldn't be saved. Free up some space and try again.")
    }
    throw err
  }
  changed()
  return record
}

export async function updatePending(id, patch) {
  await withStore('readwrite', async (store) => {
    const current = store ? await promisify(store.get(id)) : memory.get(id)
    if (!current) return
    const next = { ...current, ...patch }
    if (store) store.put(next)
    else memory.set(id, next)
  })
  changed()
}

export async function removePending(id) {
  await withStore('readwrite', (store) => (store ? promisify(store.delete(id)) : memory.delete(id)))
  changed()
}

export async function removeAllPending(userId) {
  const mine = await listPending(userId)
  await withStore('readwrite', (store) => {
    for (const entry of mine) {
      if (store) store.delete(entry.id)
      else memory.delete(entry.id)
    }
  })
  changed()
}

/** POSTs a note. `clientUploadId` makes a retry of an upload the server already has return that note. */
export function sendVoiceNote({ blob, name, source, clientId, durationSeconds, clientUploadId }, config = {}) {
  const form = new FormData()
  form.append('audio', blob, name)
  form.append('source', source)
  form.append('client_upload_id', clientUploadId)
  if (clientId) form.append('client_id', clientId)
  if (durationSeconds != null && Number.isFinite(durationSeconds)) form.append('duration_seconds', String(Math.round(durationSeconds)))
  return api.post('/voice-notes', form, { timeout: 5 * 60 * 1000, ...config })
}

/** Network errors, timeouts and server errors are worth trying again later; anything else the server refused. */
export function isRetryable(error) {
  const status = error?.response?.status
  return !status || status === 408 || status >= 500
}
