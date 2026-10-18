import { api, isCancel } from './api'

/** Statuses after which a note won't change again without the user doing something. */
export const SETTLED_STATUSES = new Set(['ready', 'failed', 'awaiting_transcript'])

/** An 'uploaded' note the server says can be retried has lost its job: it won't move on by itself. */
export function isStuck(note) {
  return note.status === 'uploaded' && Boolean(note.can_retry)
}

export function isSettled(note) {
  return SETTLED_STATUSES.has(note.status) || isStuck(note)
}

const FAST_MS = 2000
const SLOW_MS = 5000
const FAST_FOR_MS = 30000

/**
 * Watches one voice note for status changes and calls `onUpdate(note)` with each fresh copy, or `onError(error)`.
 * Returns a function that stops watching.
 *
 * This is the only place that knows updates arrive by polling: every 2 seconds for the first 30, then every 5,
 * paused while the tab is hidden, stopped once the note settles. A broadcast channel (e.g. Laravel Echo on
 * `voice-notes.{id}`) can replace it later with the same signature.
 */
export function watchNote(id, { onUpdate, onError }) {
  const startedAt = Date.now()
  let stopped = false
  let inFlight = false
  let timer = null
  let controller = null

  const schedule = () => {
    clearTimeout(timer)
    if (stopped || document.hidden) return
    timer = setTimeout(tick, Date.now() - startedAt < FAST_FOR_MS ? FAST_MS : SLOW_MS)
  }

  async function tick() {
    if (stopped || inFlight || document.hidden) return
    inFlight = true
    controller = new AbortController()
    try {
      const res = await api.get(`/voice-notes/${id}`, { signal: controller.signal })
      if (stopped) return
      onUpdate(res.data.data)
      if (isSettled(res.data.data)) {
        stop()
        return
      }
    } catch (error) {
      if (stopped || isCancel(error)) return
      onError(error)
      // A note that is gone, or a session that ended, won't come back by asking again; a network blip might.
      const status = error.response?.status
      if (status === 401 || status === 403 || status === 404) {
        stop()
        return
      }
    } finally {
      inFlight = false
    }
    schedule()
  }

  const onVisibility = () => {
    if (document.hidden) clearTimeout(timer)
    else tick()
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    controller?.abort()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  document.addEventListener('visibilitychange', onVisibility)
  tick()
  return stop
}
