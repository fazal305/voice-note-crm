import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * Warns before unsaved changes are lost: the browser's own prompt on reload or tab close, and a router blocker
 * for in-app navigation. Returns the blocker so the caller can show its own confirmation while it is 'blocked'.
 */
export function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
}
