import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { LogoMark, Wordmark } from '../components/Logo'
import { OfflineBanner } from '../components/OfflineBanner'
import { Button } from '../components/ui'
import { useOnline } from '../hooks/useResource'
import { useAuth } from '../lib/auth'
import { UploadQueueProvider, useUploadQueue } from '../lib/uploadQueue'

const NAV = [
  { to: '/app/record', label: 'Record', icon: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21' },
  { to: '/app/notes', label: 'Notes', icon: 'M7 3.5h10A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5M9 8.5h6M9 12h6M9 15.5h3.5' },
  { to: '/app/tasks', label: 'Tasks', icon: 'M9 6.5h10.5M9 12h10.5M9 17.5h10.5M4 6.5l1 1 2-2M4 12l1 1 2-2M4.5 17.5h1.5' },
  { to: '/app/clients', label: 'Clients', icon: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.4M15.5 4.6a3 3 0 0 1 0 5.8' },
  { to: '/app/dashboard', label: 'Dashboard', managerOnly: true, icon: 'M4 20h16M6.5 16.5V11M11 16.5V6.5M15.5 16.5v-4M20 16.5V9' },
  { to: '/app/team', label: 'Team', managerOnly: true, icon: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9.5 12l2 2 3.5-4' },
  { to: '/app/settings', label: 'Settings', managerOnly: true, icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.3L4.6 10l2-3.4 1.9.7a7 7 0 0 1 2-1.2L10.8 3h4l.3 2.4a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.3' },
]

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export default function AppLayout() {
  const { user } = useAuth()
  return (
    <UploadQueueProvider key={user.device_key} userId={user.device_key}>
      <Shell />
    </UploadQueueProvider>
  )
}

function NavBadge({ count }) {
  if (!count) return null
  return (
    <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-xs leading-5 font-semibold text-white tabular-nums">
      {count}
      <span className="sr-only"> waiting to upload</span>
    </span>
  )
}

function Shell() {
  const { user, signOut } = useAuth()
  const queue = useUploadQueue()
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const pending = queue.entries.length
  const requestSignOut = () => (pending ? setConfirmingSignOut(true) : signOut())

  // Notes holds the "Waiting to upload" list; fetch its code now so it still opens if the connection drops.
  useEffect(() => {
    import('../pages/app/Notes').catch(() => {})
  }, [])

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
              {item.to === '/app/notes' && <NavBadge count={pending} />}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-xs text-muted">
            {roleLabel} · {user?.organization?.name}
          </p>
          <Button variant="ghost" className="mt-2 -ml-2 min-h-9 px-2" onClick={requestSignOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <OfflineBanner />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link to="/app/record" aria-label="Voice Note CRM home" className="shrink-0">
              <LogoMark />
            </Link>
            <span className="truncate text-sm text-muted">
              {user?.name} · {roleLabel}
            </span>
          </div>
          <Button variant="ghost" onClick={requestSignOut}>
            Sign out
          </Button>
        </header>
        {user?.organization?.is_demo && (
          <aside aria-label="Demo notice" className="border-b border-warn/20 bg-warn-tint px-4 py-2 text-center text-xs text-warn sm:px-6">
            <p>Demo organization with made-up sample data. Anyone trying the demo can see and change these clients.</p>
          </aside>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
          <Outlet />
        </main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-xs text-muted sm:px-8">
          <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy
          </Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms" className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>
          <span aria-hidden="true"> · </span>
          <Link to="/faq" className="underline underline-offset-2 hover:text-ink">
            FAQ
          </Link>
        </footer>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}
          >
            <span className="relative">
              <NavIcon d={item.icon} />
              {item.to === '/app/notes' && pending > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-accent px-1 text-center text-[0.625rem] leading-4 text-white tabular-nums">
                  {pending}
                  <span className="sr-only"> waiting to upload</span>
                </span>
              )}
            </span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <SignOutDialog open={confirmingSignOut} count={pending} onClose={() => setConfirmingSignOut(false)} />
    </div>
  )
}

/** Sign-out with notes still on the device: upload them first, keep them for the next sign-in, or discard them. */
function SignOutDialog({ open, count, onClose }) {
  const { signOut } = useAuth()
  const queue = useUploadQueue()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const uploadFirst = () => {
    queue.retryNow()
    onClose()
  }
  const discardAndSignOut = async () => {
    setBusy(true)
    try {
      await queue.discardAll()
    } finally {
      setBusy(false)
    }
    signOut()
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
      aria-labelledby="sign-out-title"
    >
      <div className="p-6">
        <h2 id="sign-out-title" className="text-2xl">
          {count === 1 ? '1 recording hasn’t uploaded yet' : `${count} recordings haven’t uploaded yet`}
        </h2>
        <p className="mt-2 text-sm text-muted">
          They&apos;re saved on this device. If you sign out anyway, they stay here and upload the next time you sign in on this browser.
          {!online && ' You’re offline, so they can’t upload right now.'}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="secondary" onClick={onClose} className="sm:mr-auto">
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={discardAndSignOut}>
            Discard and sign out
          </Button>
          <Button variant="secondary" disabled={busy} onClick={signOut}>
            Sign out anyway
          </Button>
          <Button disabled={!online || busy} onClick={uploadFirst}>
            Upload first
          </Button>
        </div>
      </div>
    </dialog>
  )
}
