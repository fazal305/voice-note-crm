import { Navigate, useLocation } from 'react-router'
import { ErrorState, Skeleton } from '../components/ui'
import { useAuth } from '../lib/auth'
import Forbidden from '../pages/public/Forbidden'

export function RequireAuth({ children }) {
  const { status, retry, expired } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy="true">
        <span className="sr-only" role="status">
          Loading your account…
        </span>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (status === 'unreachable') {
    return (
      <div className="mx-auto max-w-lg p-6 pt-20">
        <ErrorState title="Can't reach Voice Note CRM" message="We couldn't contact the server to restore your session. Check your connection and try again." onRetry={retry} />
      </div>
    )
  }
  if (status !== 'authed') {
    return <Navigate to="/login" replace state={{ from: location.pathname, expired }} />
  }
  return children
}

export function RequireManager({ children }) {
  const { user } = useAuth()
  return user?.role === 'manager' ? children : <Forbidden inApp />
}
