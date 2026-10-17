import { LinkButton } from '../../components/ui'
import { useDocumentTitle } from '../../hooks/useResource'

export default function NotFound({ inApp = false }) {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="font-display text-7xl text-brand">404</p>
      <h1 className="mt-3 text-3xl">This page isn&apos;t in the notebook</h1>
      <p className="mt-2 text-muted">The link may be old or mistyped.</p>
      <LinkButton to={inApp ? '/app/clients' : '/'} className="mt-6">
        {inApp ? 'Back to clients' : 'Go home'}
      </LinkButton>
    </div>
  )
}
