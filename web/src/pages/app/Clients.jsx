import { useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Button, EmptyState, LinkButton, LoadState, PageHeader } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api, errorMessage } from '../../lib/api'
import { formatShortDate, localToday } from '../../lib/format'

/** The list's query: search, sort, and the overdue follow-up filter (measured against this device's day). */
function listParams(search, sort, followUp) {
  return {
    ...(search ? { search } : {}),
    ...(sort === 'last_contact' ? { sort } : {}),
    ...(followUp ? { needs_follow_up: 1, today: localToday() } : {}),
  }
}

export default function Clients() {
  useDocumentTitle('Clients')
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const sort = params.get('sort') === 'last_contact' ? 'last_contact' : 'name'
  const followUp = params.get('follow_up') === '1'
  const [draft, setDraft] = useState(search)
  const sortId = useId()

  const update = (changes) =>
    setParams(
      (p) => {
        const copy = new URLSearchParams(p)
        Object.entries(changes).forEach(([key, value]) => (value ? copy.set(key, value) : copy.delete(key)))
        return copy
      },
      { replace: true },
    )

  useEffect(() => {
    const value = draft.trim()
    if (value === search) return
    const timer = setTimeout(
      () =>
        setParams(
          (p) => {
            const copy = new URLSearchParams(p)
            if (value) copy.set('search', value)
            else copy.delete('search')
            return copy
          },
          { replace: true },
        ),
      300,
    )
    return () => clearTimeout(timer)
  }, [draft, search, setParams])

  const key = `${search}|${sort}|${followUp}`
  const clients = useResource((signal) => api.get('/clients', { params: listParams(search, sort, followUp), signal }).then((res) => res.data), key)

  return (
    <>
      <PageHeader title="Clients" description="Everyone your team talks to. Shared across your organization." action={<LinkButton to="/app/clients/new">Add client</LinkButton>} />

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mb-3">
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
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor={sortId} className="text-sm font-semibold">
            Sort by
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => update({ sort: e.target.value === 'last_contact' ? 'last_contact' : null })}
            className="min-w-0 rounded-lg border border-line-strong bg-surface px-3 py-2 text-base"
          >
            <option value="name">Name</option>
            <option value="last_contact">Last contact</option>
          </select>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={followUp} onChange={(e) => update({ follow_up: e.target.checked ? '1' : null })} className="size-5 accent-brand" />
          Needs follow-up
        </label>
      </div>

      <LoadState resource={clients} label="Loading clients">
        {(page) => <ClientList key={key} first={page} search={search} sort={sort} followUp={followUp} onClear={() => setDraft('')} onShowAll={() => update({ follow_up: null })} />}
      </LoadState>
    </>
  )
}

function ClientList({ first, search, sort, followUp, onClear, onShowAll }) {
  const [items, setItems] = useState(first.data)
  const [meta, setMeta] = useState(first.meta)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (items.length === 0) {
    if (followUp) {
      return (
        <EmptyState title="No follow-ups overdue" action={<Button variant="secondary" onClick={onShowAll}>Show all clients</Button>}>
          {search ? <>No client matching &ldquo;{search}&rdquo; is past their follow-up date.</> : 'No client is past the follow-up date set on their latest call.'}
        </EmptyState>
      )
    }
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
      const res = await api.get('/clients', { params: { ...listParams(search, sort, followUp), page: meta.current_page + 1 } })
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
        {followUp && <> past their follow-up date</>}
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {items.map((client) => (
          <li key={client.id}>
            <Link to={`/app/clients/${client.id}`} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 hover:bg-sunken/60">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{client.name}</span>
                {client.company && <span className="block truncate text-sm text-muted">{client.company}</span>}
              </span>
              <span className="min-w-0 truncate text-sm text-muted">
                {client.last_contact_at ? (
                  <>
                    Last contact <time dateTime={client.last_contact_at}>{formatShortDate(client.last_contact_at)}</time>
                  </>
                ) : (
                  client.email || client.phone || ''
                )}
              </span>
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
