import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { SentimentChip } from '../../components/StatusChip'
import { Alert, Button, EmptyState, ErrorState, LinkButton, LoadState, Skeleton } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api, errorMessage } from '../../lib/api'
import { formatDate, formatDay, formatShortDate, localToday } from '../../lib/format'

export default function ClientDetail() {
  const { id } = useParams()
  const today = localToday()
  const client = useResource((signal) => api.get(`/clients/${id}`, { params: { today }, signal }).then((res) => res.data), `${id}|${today}`)
  useDocumentTitle(client.data?.data?.name ?? 'Client')
  // Ticking tasks in the feed moves the open-task count without reloading the header.
  const [openDelta, setOpenDelta] = useState({ id, delta: 0 })
  const delta = openDelta.id === id ? openDelta.delta : 0

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/app/clients" className="font-semibold text-brand underline underline-offset-2">
          ← Clients
        </Link>
      </p>
      {client.loading ? (
        <div aria-busy="true">
          <span className="sr-only" role="status">
            Loading client…
          </span>
          <Skeleton className="h-12 w-64" />
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      ) : client.error ? (
        <ErrorState message={client.error} onRetry={client.reload} />
      ) : (
        <>
          <Header client={client.data.data} />
          <Stats stats={client.data.stats} openDelta={delta} />
          <Timeline key={id} clientId={id} clientName={client.data.data.name} onOpenChange={(d) => setOpenDelta((o) => ({ id, delta: (o.id === id ? o.delta : 0) + d }))} />
        </>
      )}
    </>
  )
}

function Header({ client }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-4xl sm:text-5xl">{client.name}</h1>
        {(client.company || client.email || client.phone) && (
          <p className="mt-2 break-words text-muted">{[client.company, client.email, client.phone].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton to={`/app/record?client=${client.id}`}>Record a note for this client</LinkButton>
        <LinkButton variant="secondary" to={`/app/clients/${client.id}/edit`}>
          Edit client
        </LinkButton>
      </div>
    </div>
  )
}

function Tile({ label, children }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-lg font-semibold">{children}</dd>
    </div>
  )
}

function Stats({ stats, openDelta }) {
  const open = Math.max(0, stats.open_tasks + openDelta)
  return (
    <dl className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Last contact">
        {stats.last_contact_at ? <time dateTime={stats.last_contact_at}>{formatShortDate(stats.last_contact_at)}</time> : <span className="text-muted">No calls yet</span>}
      </Tile>
      <Tile label="Latest sentiment">{stats.latest_sentiment ? <SentimentChip sentiment={stats.latest_sentiment} /> : <span className="text-muted">—</span>}</Tile>
      <Tile label="Open tasks">
        {open > 0 ? (
          <Link to="/app/tasks?view=upcoming" className="text-brand underline underline-offset-2" aria-label={`${open} open ${open === 1 ? 'task' : 'tasks'} for this client — open Tasks`}>
            {open}
          </Link>
        ) : (
          '0'
        )}
      </Tile>
      <Tile label="Next follow-up">
        {stats.next_follow_up ? (
          <>
            <time dateTime={stats.next_follow_up.date}>{formatDay(stats.next_follow_up.date)}</time>
            {stats.next_follow_up.phrase && <span className="block text-sm font-normal text-muted">“{stats.next_follow_up.phrase}”</span>}
          </>
        ) : (
          <span className="text-muted">None scheduled</span>
        )}
        {stats.needs_follow_up && (
          <span className="mt-1 block w-fit rounded-full bg-danger-tint px-2 py-0.5 text-xs font-semibold text-danger">
            Follow-up date passed
          </span>
        )}
      </Tile>
    </dl>
  )
}

function Timeline({ clientId, clientName, onOpenChange }) {
  const first = useResource((signal) => api.get(`/clients/${clientId}/timeline`, { signal }).then((res) => res.data), clientId)
  return (
    <section aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="mb-4 text-3xl">
        Call history
      </h2>
      <LoadState resource={first} label="Loading call history" rows={3}>
        {(page) => <Feed first={page} clientId={clientId} clientName={clientName} onOpenChange={onOpenChange} />}
      </LoadState>
    </section>
  )
}

function Feed({ first, clientId, clientName, onOpenChange }) {
  const [items, setItems] = useState(first.data)
  const [cursor, setCursor] = useState(first.meta.next_cursor)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (items.length === 0) {
    return (
      <EmptyState title="No calls logged yet" action={<LinkButton to={`/app/record?client=${clientId}`}>Record your first note</LinkButton>}>
        Record a note after your next call with {clientName}. Saved call logs show up here, newest first.
      </EmptyState>
    )
  }

  const loadMore = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.get(`/clients/${clientId}/timeline`, { params: { cursor } })
      setItems((prev) => [...prev, ...res.data.data.filter((e) => !prev.some((p) => p.id === e.id))])
      setCursor(res.data.meta.next_cursor)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ol className="space-y-4">
        {items.map((entry) => (
          <Entry key={entry.id} entry={entry} onOpenChange={onOpenChange} />
        ))}
      </ol>
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      {cursor && (
        <div className="mt-6 text-center">
          <Button variant="secondary" busy={busy} onClick={loadMore}>
            Load older calls
          </Button>
        </div>
      )}
    </>
  )
}

function Entry({ entry, onOpenChange }) {
  const [tasks, setTasks] = useState(entry.tasks)
  return (
    <li className="min-w-0 rounded-card border border-line bg-surface p-5">
      <article aria-label={`Call on ${formatDate(entry.created_at)}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            <time dateTime={entry.created_at} className="font-semibold text-ink">
              {formatDate(entry.created_at)}
            </time>{' '}
            · {entry.author.is_you ? 'logged by you' : `logged by ${entry.author.name}`}
          </p>
          <SentimentChip sentiment={entry.sentiment} />
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{entry.summary}</p>
        {entry.follow_up.date && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Follow up </span>
            <time dateTime={entry.follow_up.date}>{formatDay(entry.follow_up.date)}</time>
            {entry.follow_up.phrase && <span className="text-muted"> · “{entry.follow_up.phrase}”</span>}
          </p>
        )}
        {tasks.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="font-sans text-sm font-semibold">Tasks from this call</h3>
            <ul className="mt-2 space-y-2">
              {tasks.map((task) => (
                <TaskCheck
                  key={task.id}
                  task={task}
                  onChange={(next) => setTasks((prev) => prev.map((t) => (t.id === next.id ? next : t)))}
                  onOpenChange={onOpenChange}
                />
              ))}
            </ul>
          </div>
        )}
        {entry.voice_note_id && (
          <Link to={`/app/notes/${entry.voice_note_id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-2">
            Open the source note
          </Link>
        )}
      </article>
    </li>
  )
}

/** The same optimistic tick as the Tasks page: it changes straight away and is put back if the server refuses. */
function TaskCheck({ task, onChange, onOpenChange }) {
  const id = useId()
  const [error, setError] = useState(null)

  const toggle = async () => {
    const before = task
    const next = { ...task, done: !task.done }
    setError(null)
    onChange(next)
    onOpenChange(next.done ? -1 : 1)
    try {
      const res = await api.patch(`/tasks/${task.id}`, { done: next.done })
      onChange({ ...next, done: res.data.data.done })
    } catch (err) {
      onChange(before)
      onOpenChange(next.done ? 1 : -1)
      setError(errorMessage(err, "Couldn't update the task. Please try again."))
    }
  }

  return (
    <li className="flex items-start gap-3 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={task.done}
        onChange={toggle}
        className="mt-0.5 size-5 shrink-0 accent-brand"
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={`block break-words font-medium ${task.done ? 'text-muted line-through' : ''}`}>
          {task.title}
          <span className="sr-only">{task.done ? ' (done)' : ''}</span>
        </label>
        <span className="block text-xs text-muted">
          {task.owner === 'client' ? 'Client’s commitment' : task.assignee.is_you ? 'Yours' : `${task.assignee.name}’s`}
          {task.due_date && (
            <>
              {' '}
              · due <time dateTime={task.due_date}>{formatDay(task.due_date)}</time>
            </>
          )}
        </span>
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}
