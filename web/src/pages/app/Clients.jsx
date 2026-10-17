import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Button, EmptyState, LinkButton, LoadState, PageHeader } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api, errorMessage } from '../../lib/api'

export default function Clients() {
  useDocumentTitle('Clients')
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const [draft, setDraft] = useState(search)

  useEffect(() => {
    const value = draft.trim()
    if (value === search) return
    const timer = setTimeout(() => setParams(value ? { search: value } : {}, { replace: true }), 300)
    return () => clearTimeout(timer)
  }, [draft, search, setParams])

  const clients = useResource(
    (signal) => api.get('/clients', { params: search ? { search } : {}, signal }).then((res) => res.data),
    search,
  )

  return (
    <>
      <PageHeader title="Clients" description="Everyone your team talks to. Shared across your organization." action={<LinkButton to="/app/clients/new">Add client</LinkButton>} />

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-6">
        <label htmlFor="client-search" className="sr-only">
          Search clients by name or company
        </label>
        <input
          id="client-search"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by name or company"
          maxLength={120}
          className="block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base placeholder:text-muted/80 focus:border-brand"
        />
      </form>

      <LoadState resource={clients} label="Loading clients">
        {(page) => <ClientList key={search} first={page} search={search} onClear={() => setDraft('')} />}
      </LoadState>
    </>
  )
}

function ClientList({ first, search, onClear }) {
  const [items, setItems] = useState(first.data)
  const [meta, setMeta] = useState(first.meta)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (items.length === 0) {
    return search ? (
      <EmptyState title="No matching clients" action={<Button variant="secondary" onClick={onClear}>Clear search</Button>}>
        Nothing matches &ldquo;{search}&rdquo;. Try a different name or company.
      </EmptyState>
    ) : (
      <EmptyState title="No clients yet" action={<LinkButton to="/app/clients/new">Add your first client</LinkButton>}>
        Add the people you call so your notes and follow-ups have somewhere to live.
      </EmptyState>
    )
  }

  const loadMore = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.get('/clients', { params: { ...(search ? { search } : {}), page: meta.current_page + 1 } })
      setItems((prev) => [...prev, ...res.data.data])
      setMeta(res.data.meta)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-3 text-sm text-muted" role="status">
        {meta.total} {meta.total === 1 ? 'client' : 'clients'}
        {search && <> matching &ldquo;{search}&rdquo;</>}
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {items.map((client) => (
          <li key={client.id}>
            <Link to={`/app/clients/${client.id}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 hover:bg-sunken/60">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{client.name}</span>
                {client.company && <span className="block truncate text-sm text-muted">{client.company}</span>}
              </span>
              <span className="min-w-0 truncate text-sm text-muted">{client.email || client.phone || ''}</span>
            </Link>
          </li>
        ))}
      </ul>
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      {meta.current_page < meta.last_page && (
        <div className="mt-6 text-center">
          <Button variant="secondary" busy={busy} onClick={loadMore}>
            Show more
          </Button>
        </div>
      )}
    </>
  )
}
