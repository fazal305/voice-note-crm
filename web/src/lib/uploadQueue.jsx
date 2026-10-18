import axios from 'axios'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { errorMessage } from './api'
import { addPending, isRetryable, listPending, onPendingChange, removeAllPending, removePending, sendVoiceNote, storageReady, updatePending } from './pendingUploads'

const QueueContext = createContext(null)

const BACKOFF_MS = [15000, 30000, 60000, 120000, 300000]
const LOCK_NAME = 'vnc-upload-queue'
const LEASE_KEY = 'vnc_upload_lease'
const LEASE_MS = 45000
const TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())

function readLease() {
  try {
    return JSON.parse(localStorage.getItem(LEASE_KEY))
  } catch {
    return null
  }
}

function writeLease(lease) {
  try {
    if (lease) localStorage.setItem(LEASE_KEY, JSON.stringify(lease))
    else localStorage.removeItem(LEASE_KEY)
  } catch {
    // storage blocked: tabs may both try, and client_upload_id keeps that from creating duplicates
  }
}

/** Runs `work` only if no other tab is uploading: a Web Lock where supported, else a renewed localStorage lease. */
async function withQueueLock(work) {
  if (navigator.locks?.request) {
    return navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => (lock ? work() : null))
  }
  const lease = readLease()
  if (lease && lease.owner !== TAB_ID && lease.until > Date.now()) return null
  const hold = () => writeLease({ owner: TAB_ID, until: Date.now() + LEASE_MS })
  hold()
  const renew = setInterval(hold, LEASE_MS / 3)
  try {
    return await work()
  } finally {
    clearInterval(renew)
    if (readLease()?.owner === TAB_ID) writeLease(null)
  }
}

/**
 * Uploads notes saved on this device, oldest first and one at a time, with each note's own client_upload_id so a
 * retry never creates a second note. Runs on start, when the connection comes back, when the tab is shown again,
 * and on a backoff (15s up to 5 min) while notes are still waiting. Mounted once in the app shell per signed-in user.
 */
export function UploadQueueProvider({ userId, children }) {
  const [entries, setEntries] = useState([])
  const [persistent, setPersistent] = useState(true)
  const [uploadingId, setUploadingId] = useState(null)
  const [uploaded, setUploaded] = useState({ count: 0, version: 0 })
  const alive = useRef(false)
  const running = useRef(false)
  const stopped = useRef(false)
  const timer = useRef(null)
  const attempt = useRef(0)
  const controller = useRef(null)
  const runRef = useRef(null)

  const refresh = useCallback(async () => {
    const list = await listPending(userId).catch(() => [])
    if (alive.current) setEntries(list)
    return list
  }, [userId])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    const delay = BACKOFF_MS[Math.min(attempt.current, BACKOFF_MS.length - 1)]
    attempt.current += 1
    timer.current = setTimeout(() => runRef.current(), delay)
  }, [])

  const run = useCallback(async () => {
    clearTimeout(timer.current)
    if (running.current || !alive.current || stopped.current) return
    if (navigator.onLine === false) return // the 'online' event starts the next run
    running.current = true
    let sent = 0
    try {
      await withQueueLock(async () => {
        while (alive.current && !stopped.current) {
          const next = (await listPending(userId)).find((e) => e.status === 'waiting')
          if (!next) return
          setUploadingId(next.id)
          controller.current = new AbortController()
          try {
            await sendVoiceNote(
              {
                blob: next.blob,
                name: next.originalName,
                source: next.source,
                clientId: next.clientId,
                durationSeconds: next.durationSeconds,
                clientUploadId: next.id,
              },
              { signal: controller.current.signal },
            )
            await removePending(next.id)
            sent += 1
            attempt.current = 0
          } catch (err) {
            if (axios.isCancel(err)) return
            const status = err.response?.status
            if (status === 401) {
              // The session is over: keep everything for this user's next sign-in.
              stopped.current = true
              return
            }
            const patch = { attempts: next.attempts + 1, lastError: errorMessage(err) }
            if (isRetryable(err) || status === 429) {
              await updatePending(next.id, patch)
              return
            }
            // The server refused this note (e.g. invalid audio): stop retrying it until the user asks.
            await updatePending(next.id, { ...patch, status: 'failed' })
          }
        }
      })
    } catch {
      // storage trouble; the backoff below tries again
    } finally {
      running.current = false
      controller.current = null
      if (alive.current) {
        setUploadingId(null)
        if (sent) setUploaded((u) => ({ count: sent, version: u.version + 1 }))
        const list = await refresh()
        if (!stopped.current && list.some((e) => e.status === 'waiting')) schedule()
      }
    }
  }, [userId, refresh, schedule])

  useEffect(() => {
    runRef.current = run
  })

  useEffect(() => {
    alive.current = true
    stopped.current = false
    storageReady().then((ok) => alive.current && setPersistent(ok))
    refresh()
    run()

    const online = () => {
      attempt.current = 0
      run()
    }
    const visible = () => {
      if (!document.hidden) run()
    }
    const unsubscribe = onPendingChange(() => refresh())
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visible)
    return () => {
      alive.current = false
      clearTimeout(timer.current)
      controller.current?.abort()
      unsubscribe()
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [run, refresh])

  /** Saves a note that couldn't upload now. Throws QueueFullError (or a storage error) if it can't be kept. */
  const enqueue = useCallback(
    async (entry) => {
      const record = await addPending({ ...entry, userId })
      await refresh()
      // Offline: the 'online' event picks it up. Online but failing: give the server a moment first.
      if (navigator.onLine !== false && !running.current) schedule()
      return record
    },
    [userId, refresh, schedule],
  )

  /** Tries now. A failed entry passed by id goes back to waiting first. Returns false when offline. */
  const retryNow = useCallback(
    async (id) => {
      if (id) {
        const entry = entries.find((e) => e.id === id)
        if (entry?.status === 'failed') await updatePending(id, { status: 'waiting', lastError: null })
      }
      if (navigator.onLine === false) return false
      attempt.current = 0
      stopped.current = false
      await run()
      return true
    },
    [entries, run],
  )

  const uploadingIdRef = useRef(null)
  useEffect(() => {
    uploadingIdRef.current = uploadingId
  }, [uploadingId])

  const discard = useCallback(async (id) => {
    if (id === uploadingIdRef.current) controller.current?.abort()
    await removePending(id)
  }, [])

  const discardAll = useCallback(async () => {
    controller.current?.abort()
    await removeAllPending(userId)
  }, [userId])

  const value = useMemo(
    () => ({ entries, persistent, uploadingId, uploadedVersion: uploaded.version, enqueue, retryNow, discard, discardAll }),
    [entries, persistent, uploadingId, uploaded.version, enqueue, retryNow, discard, discardAll],
  )

  return (
    <QueueContext.Provider value={value}>
      {children}
      <UploadedToast uploaded={uploaded} />
    </QueueContext.Provider>
  )
}

function UploadedToast({ uploaded }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6">
      {uploaded.version > 0 && <UploadedMessage key={uploaded.version} count={uploaded.count} />}
    </div>
  )
}

function UploadedMessage({ count }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(t)
  }, [])
  if (!visible) return null
  return (
    <p className="pointer-events-auto rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-lg">
      Uploaded {count} saved {count === 1 ? 'note' : 'notes'}.{' '}
      <Link to="/app/notes" className="font-semibold underline underline-offset-2">
        View notes
      </Link>
    </p>
  )
}

// eslint-disable-next-line react/only-export-components
export function useUploadQueue() {
  return useContext(QueueContext)
}
