import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { LogoMark, Wordmark } from '../components/Logo'
import { OfflineBanner } from '../components/OfflineBanner'
import { Button, ErrorState, Skeleton } from '../components/ui'
import { useAuth } from '../lib/auth'
import Forbidden from '../pages/public/Forbidden'

const NAV = [
  { to: '/app/record', label: 'Record', icon: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21' },
  { to: '/app/notes', label: 'Notes', icon: 'M7 3.5h10A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5M9 8.5h6M9 12h6M9 15.5h3.5' },
  { to: '/app/tasks', label: 'Tasks', icon: 'M9 6.5h10.5M9 12h10.5M9 17.5h10.5M4 6.5l1 1 2-2M4 12l1 1 2-2M4.5 17.5h1.5' },
  { to: '/app/clients', label: 'Clients', icon: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 4.6a3 3 0 0 1 0 5.8' },
  { to: '/app/team', label: 'Team', managerOnly: true, icon: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9.5 12l2 2 3.5-4' },
]

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

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

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const nav = NAV.filter((item) => !item.managerOnly || user?.role === 'manager')
  const roleLabel = user?.role === 'manager' ? 'Manager' : 'Rep'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      <aside className="hidden border-r border-line bg-surface/70 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link to="/app/record" className="px-5 py-5" aria-label="Voice Note CRM home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-brand-tint text-brand-strong' : 'text-muted hover:bg-sunken hover:text-ink'}`
              }
            >
              <NavIcon d={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-xs text-muted">
            {roleLabel} · {user?.organization?.name}
          </p>
          <Button variant="ghost" className="mt-2 -ml-2 min-h-9 px-2" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <OfflineBanner />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
          <Link to="/app/record" aria-label="Voice Note CRM home" className="flex min-w-0 items-center gap-2.5">
            <LogoMark />
            <span className="truncate text-sm text-muted">
              {user?.name} · {roleLabel}
            </span>
          </Link>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </header>
        {user?.organization?.is_demo && (
          <p role="note" className="border-b border-warn/20 bg-warn-tint px-4 py-2 text-center text-xs text-warn sm:px-6">
            Demo organization with made-up sample data. Anyone trying the demo can see and change these clients.
          </p>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}
          >
            <NavIcon d={item.icon} />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
