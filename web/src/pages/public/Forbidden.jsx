import { LinkButton } from '../../components/ui'
import { useDocumentTitle } from '../../hooks/useResource'

export default function Forbidden({ inApp = false }) {
  useDocumentTitle('Access denied')
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="font-display text-7xl text-brand">403</p>
      <h1 className="mt-3 text-3xl">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-muted">This area is for managers only.</p>
      <LinkButton to={inApp ? '/app/clients' : '/'} className="mt-6">
        {inApp ? 'Back to clients' : 'Go home'}
      </LinkButton>
    </div>
  )
}
