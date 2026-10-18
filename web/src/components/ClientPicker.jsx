import { useEffect, useId, useState } from 'react'
import { api, errorMessage } from '../lib/api'

/**
 * A search box that narrows a plain select of the organization's clients. "" is the empty choice ("Decide later"
 * unless `emptyLabel` says otherwise). `onChange(value, client)` also passes the chosen client, or null. `selected` is
 * the client already chosen ({ id, name, company }), so it shows even if it isn't in the first page of results.
 */
export function ClientPicker({
  value,
  onChange,
  error,
  disabled,
  legend = 'Client (optional)',
  hint = 'Pick who this call was with, or decide later.',
  emptyLabel = 'Decide later',
  selected = null,
}) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [state, setState] = useState({ clients: [], loading: true, error: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, loading: true, error: null }))
      api
        .get('/clients', { params: search.trim() ? { search: search.trim() } : {}, signal: controller.signal })
        .then((res) => setState({ clients: res.data.data, loading: false, error: null }))
        .catch((err) => {
          if (!controller.signal.aborted) setState({ clients: [], loading: false, error: errorMessage(err) })
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, nonce])

  // Keep the chosen client listed even when the search no longer matches it.
  const [chosen, setChosen] = useState(selected)
  const options = chosen && !state.clients.some((c) => c.id === chosen.id) ? [chosen, ...state.clients] : state.clients

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-search`} className="sr-only">
            Search clients
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients"
            maxLength={120}
            className="block w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base placeholder:text-muted/80 focus:border-brand"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-select`} className="sr-only">
            Client
          </label>
          <select
            id={`${id}-select`}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || state.error ? `${id}-error` : undefined}
            onChange={(e) => {
              const client = options.find((c) => String(c.id) === e.target.value) ?? null
              setChosen(client)
              onChange(e.target.value, client)
            }}
            className={`block w-full min-w-0 rounded-lg border bg-surface px-3 py-2.5 text-base focus:border-brand ${error ? 'border-danger' : 'border-line-strong'}`}
          >
            <option value="">{emptyLabel}</option>
            {options.map((client) => (
              <option key={client.id} value={String(client.id)}>
                {client.company ? `${client.name} · ${client.company}` : client.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 min-h-5 text-xs text-muted" aria-live="polite">
        {state.loading ? 'Loading clients…' : !state.error && search.trim() && `${state.clients.length} matching`}
      </p>
      {(error || state.error) && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error || state.error}{' '}
          {state.error && !error && (
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setNonce((n) => n + 1)}>
              Retry
            </button>
          )}
        </p>
      )}
    </fieldset>
  )
}
