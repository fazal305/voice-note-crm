import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../lib/api'
import { SETTLED_STATUSES, watchNote } from '../lib/noteUpdates'

const SLOW_AFTER_MS = 20000

/**
 * The live state of one voice note while it is processed: { note, error, loading, slow, settled }.
 * `restart()` watches again (after a retry or a typed transcript); `replace(note)` shows a copy the caller
 * already has, such as the one returned by that request.
 */
export function useNoteStatus(id) {
  const [state, setState] = useState({ id, note: null, error: null, loading: true, slow: false })
  const [run, setRun] = useState(0)

  useEffect(() => {
    const slowTimer = setTimeout(() => setState((s) => ({ ...s, slow: true })), SLOW_AFTER_MS)
    const stop = watchNote(id, {
      onUpdate: (note) => setState((s) => ({ ...s, id, note, error: null, loading: false })),
      onError: (error) => setState((s) => ({ ...s, id, error: errorMessage(error), notFound: error.response?.status === 404, loading: false })),
    })
    return () => {
      stop()
      clearTimeout(slowTimer)
    }
  }, [id, run])

  const restart = useCallback(() => {
    setState((s) => ({ ...s, error: null, slow: false }))
    setRun((n) => n + 1)
  }, [])

  const replace = useCallback((note) => setState((s) => ({ ...s, note })), [])

  // Navigating to another note shows the loading state straight away.
  const stale = state.id !== id
  const note = stale ? null : state.note
  return {
    note,
    error: stale ? null : state.error,
    notFound: !stale && Boolean(state.notFound),
    loading: stale || (state.loading && !note),
    slow: state.slow && Boolean(note) && !SETTLED_STATUSES.has(note.status),
    restart,
    replace,
  }
}
