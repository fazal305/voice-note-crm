import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/api'

const SLOW_AFTER_MS = 4000

/**
 * Loads data with loading, slow-network and error states.
 * `fetcher` receives an AbortSignal and must return a promise of the data; it reruns when `key` changes.
 */
export function useResource(fetcher, key = '') {
  const [state, setState] = useState({ data: null, error: null, loading: true, slow: false, key })
  const [nonce, setNonce] = useState(0)
  const fetcherRef = useRef(fetcher)
  useLayoutEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => setState((s) => ({ ...s, slow: true })), SLOW_AFTER_MS)

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false, slow: false, key })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setState((s) => ({ ...s, error: errorMessage(err), loading: false, slow: false, key }))
      })
      .finally(() => clearTimeout(timer))

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [nonce, key])

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, slow: false, error: null }))
    setNonce((n) => n + 1)
  }, [])

  // A new key shows the loading state straight away, before the effect has fetched.
  const stale = state.key !== key
  return { ...state, loading: state.loading || stale, error: stale ? null : state.error, reload }
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Voice Note CRM` : 'Voice Note CRM'
  }, [title])
}
