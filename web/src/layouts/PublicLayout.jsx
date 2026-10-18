import { Link, Outlet } from 'react-router'
import { Wordmark } from '../components/Logo'
import { OfflineBanner } from '../components/OfflineBanner'
import { useAuth } from '../lib/auth'
import { REPO_URL } from '../lib/site'

const FOOTER_LINKS = [
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/faq', 'FAQ'],
]

export default function PublicLayout() {
  const { status } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <OfflineBanner />
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" aria-label="Voice Note CRM home">
            <Wordmark />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1 text-sm font-semibold">
            {status === 'authed' ? (
              <Link to="/app/record" className="rounded-lg px-3 py-2 text-brand hover:bg-sunken">
                Open app
              </Link>
            ) : (
              <Link to="/login" className="rounded-lg px-3 py-2 text-brand hover:bg-sunken">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6">
          <p>&copy; 2026 Fazal Abbas</p>
          <nav aria-label="Legal and project links">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {FOOTER_LINKS.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="underline underline-offset-2 hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  )
}
