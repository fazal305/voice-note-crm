import { useCallback, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ClientPicker } from '../../components/ClientPicker'
import { Alert, Button, EmptyState, Field, LinkButton, LoadState, PageHeader, Toast } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatDay, localToday } from '../../lib/format'

const VIEWS = [
  { id: 'overdue', label: 'Overdue', params: { status: 'open', due: 'overdue' } },
  { id: 'today', label: 'Today', params: { status: 'open', due: 'today' } },
  { id: 'upcoming', label: 'Upcoming', params: { status: 'open', due: 'upcoming' } },
  { id: 'done', label: 'Done', params: { status: 'done' } },
]

const EMPTY = {
  overdue: ['Nothing overdue', "You're all caught up."],
  today: ['Nothing due today', 'Tasks due today will show here.'],
  upcoming: ['Nothing coming up', 'Save a call log to turn its action items into tasks, or add one yourself.'],
  done: ['Nothing done yet', 'Tasks you tick off will show here.'],
}

/** Which open-task tab a task belongs in, or 'done'. */
function bucket(task, today) {
  if (task.done) return 'done'
  if (!task.due_date || task.due_date > today) return 'upcoming'
  return task.due_date < today ? 'overdue' : 'today'
}

export default function Tasks() {
  useDocumentTitle('Tasks')
  const { user } = useAuth()
  const manager = user?.role === 'manager'
  const [params, setParams] = useSearchParams()
  const view = VIEWS.find((v) => v.id === params.get('view')) ?? VIEWS[1]
  const assignee = manager ? (params.get('assignee') ?? '') : ''
  const today = localToday()
  const tasks = useResource(
    (signal) => api.get('/tasks', { params: { ...view.params, today, ...(assignee ? { assignee_id: assignee } : {}) }, signal }).then((res) => res.data),
    `${view.id}|${assignee}|${today}`,
  )
  const [counts, setCounts] = useState(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(null)
  const [toast, setToast] = useState(null)
  const clearToast = useCallback(() => setToast(null), [])

  // Server counts on each load, then adjusted locally as tasks are ticked, redated or added.
  const [countsFrom, setCountsFrom] = useState(null)
  if (tasks.data && tasks.data !== countsFrom) {
    setCountsFrom(tasks.data)
    setCounts(tasks.data.counts)
  }

  const select = (next) =>
    setParams(
      (p) => {
        const copy = new URLSearchParams(p)
        Object.entries(next).forEach(([key, value]) => (value ? copy.set(key, value) : copy.delete(key)))
        return copy
      },
      { replace: true },
    )

  // Moves a task between tab counts after it is ticked, unticked, redated or added.
  const recount = useCallback(
    (before, after) => {
      setCounts((c) => {
        if (!c) return c
        const next = { ...c }
        if (before && before !== 'done') next[before] = Math.max(0, next[before] - 1)
        if (after && after !== 'done') next[after] += 1
        return next
      })
    },
    [],
  )

  return (
    <>
      <PageHeader
        title="Tasks"
        description={manager ? 'Follow-ups and action items for everyone in your organization.' : 'Your follow-ups and action items from saved calls.'}
        action={
          <Button onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            {adding ? 'Close' : 'Add task'}
          </Button>
        }
      />

      {adding && (
        <AddTask
          onAdded={(task) => {
            setAdding(false)
            setToast('Task added.')
            recount(null, bucket(task, today))
            if (bucket(task, today) === view.id) setAdded(task)
          }}
        />
      )}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label="Show tasks" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-line-strong bg-surface p-1">
          {VIEWS.map((v) => {
            const count = counts?.[v.id]
            const active = v.id === view.id
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={active}
                onClick={() => select({ view: v.id })}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${active ? 'bg-brand text-white' : 'text-muted hover:bg-sunken hover:text-ink'}`}
              >
                {v.id === 'overdue' && count > 0 && <WarnIcon />}
                {v.label}
                {count != null && v.id !== 'done' && (
                  <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-sunken'}`}>
                    {count}
                    <span className="sr-only"> tasks</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {manager && <AssigneeFilter value={assignee} onChange={(value) => select({ assignee: value })} />}
      </div>

      <LoadState resource={tasks} label="Loading tasks" rows={4}>
        {(page) => (
          <TaskList
            key={`${view.id}|${assignee}`}
            first={page}
            assignee={assignee}
            view={view.id}
            today={page.today ?? today}
            added={added}
            showAssignee={manager}
            onRecount={recount}
          />
        )}
      </LoadState>
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 2.5 20h19zM12 10v4.5M12 17.5v.01" />
    </svg>
  )
}

function AssigneeFilter({ value, onChange }) {
  const id = useId()
  const team = useResource((signal) => api.get('/team', { signal }).then((res) => res.data.data), 'team')
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-muted">
        Assigned to
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={team.loading}
        className="mt-1 block w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 py-2 text-base sm:w-56"
      >
        <option value="">Everyone</option>
        {(team.data ?? []).map((member) => (
          <option key={member.id} value={String(member.id)}>
            {member.is_you ? `${member.name} (you)` : member.name}
            {member.active ? '' : ' (deactivated)'}
          </option>
        ))}
      </select>
      {team.error && <p className="mt-1 text-xs text-danger">{team.error}</p>}
    </div>
  )
}

function TaskList({ first, view, assignee, today, added, showAssignee, onRecount }) {
  const [items, setItems] = useState(first.data)
  const [meta, setMeta] = useState(first.meta)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // A task added on this tab joins the list without a reload.
  const [seen, setSeen] = useState(added)
  if (added !== seen) {
    setSeen(added)
    if (added && !items.some((t) => t.id === added.id)) setItems((prev) => [added, ...prev])
  }

  const replace = (task) => setItems((prev) => prev.map((t) => (t.id === task.id ? task : t)))

  if (items.length === 0) {
    const [title, text] = EMPTY[view]
    return (
      <EmptyState title={title} action={view === 'upcoming' ? <LinkButton to="/app/record">Record a note</LinkButton> : null}>
        {text}
      </EmptyState>
    )
  }

  const loadMore = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.get('/tasks', {
        params: { ...VIEWS.find((v) => v.id === view).params, today, page: meta.current_page + 1, ...(assignee ? { assignee_id: assignee } : {}) },
      })
      setItems((prev) => [...prev, ...res.data.data.filter((t) => !prev.some((p) => p.id === t.id))])
      setMeta(res.data.meta)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {items.map((task) => (
          <TaskRow key={task.id} task={task} today={today} showAssignee={showAssignee} onChange={replace} onRecount={onRecount} />
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

function TaskRow({ task, today, showAssignee, onChange, onRecount }) {
  const id = useId()
  const [error, setError] = useState(null)
  const [editingDate, setEditingDate] = useState(false)
  const [date, setDate] = useState(task.due_date ?? '')
  const [dateError, setDateError] = useState(null)
  const [saving, setSaving] = useState(false)
  const overdue = !task.done && task.due_date && task.due_date < today

  // Optimistic: the box ticks straight away and is put back if the server refuses.
  const toggle = async () => {
    const before = task
    const next = { ...task, done: !task.done }
    setError(null)
    onChange(next)
    onRecount(bucket(before, today), bucket(next, today))
    try {
      const res = await api.patch(`/tasks/${task.id}`, { done: next.done })
      onChange(res.data.data)
    } catch (err) {
      onChange(before)
      onRecount(bucket(next, today), bucket(before, today))
      setError(errorMessage(err, "Couldn't update the task. Please try again."))
    }
  }

  const saveDate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setDateError(null)
    try {
      const res = await api.patch(`/tasks/${task.id}`, { due_date: date || null })
      onRecount(bucket(task, today), bucket(res.data.data, today))
      onChange(res.data.data)
      setEditingDate(false)
    } catch (err) {
      setDateError(fieldErrors(err).due_date ?? errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className={`min-w-0 rounded-card border bg-surface p-4 ${overdue ? 'border-danger/40 border-l-4 border-l-danger' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <input
          id={`${id}-done`}
          type="checkbox"
          checked={task.done}
          onChange={toggle}
          className="mt-0.5 size-5 shrink-0 accent-brand"
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-done`} className={`block break-words font-semibold ${task.done ? 'text-muted line-through' : ''}`}>
            {task.title}
            <span className="sr-only">{task.done ? ' (done)' : ''}</span>
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-tint px-2 py-0.5 text-xs font-semibold text-danger">
                <WarnIcon />
                Overdue
              </span>
            )}
            {task.owner === 'client' && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-strong">Client&apos;s commitment</span>}
            {!editingDate && (
              <span>
                {task.due_date ? (
                  <>
                    Due <time dateTime={task.due_date}>{formatDay(task.due_date)}</time>
                  </>
                ) : (
                  'No due date'
                )}
                {!task.done && (
                  <button
                    type="button"
                    className="ml-2 min-h-9 font-semibold text-brand underline underline-offset-2"
                    onClick={() => {
                      setDate(task.due_date ?? '')
                      setDateError(null)
                      setEditingDate(true)
                    }}
                  >
                    Change<span className="sr-only"> due date for {task.title}</span>
                  </button>
                )}
              </span>
            )}
            {task.client && (
              <Link to={`/app/clients/${task.client.id}`} className="font-semibold text-brand underline underline-offset-2">
                {task.client.name}
              </Link>
            )}
            {task.voice_note_id && (
              <Link to={`/app/notes/${task.voice_note_id}`} className="underline underline-offset-2">
                From call note
              </Link>
            )}
            {showAssignee && !task.assignee.is_you && <span>Assigned to {task.assignee.name}</span>}
          </div>
          {editingDate && (
            <form noValidate onSubmit={saveDate} className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-0">
                <label htmlFor={`${id}-due`} className="block text-xs font-semibold text-muted">
                  Due date<span className="sr-only"> for {task.title}</span>
                </label>
                <input
                  id={`${id}-due`}
                  type="date"
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by the user's own "Change" click
                  autoFocus
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={dateError ? true : undefined}
                  aria-describedby={dateError ? `${id}-due-error` : undefined}
                  className={`mt-1 block min-h-9 rounded-lg border bg-surface px-2 py-1.5 text-sm ${dateError ? 'border-danger' : 'border-line-strong'}`}
                />
              </div>
              <Button type="submit" className="min-h-9" busy={saving}>
                Save
              </Button>
              <Button variant="ghost" className="min-h-9" onClick={() => setEditingDate(false)} disabled={saving}>
                Cancel
              </Button>
              {dateError && (
                <p id={`${id}-due-error`} className="w-full text-sm text-danger">
                  {dateError}
                </p>
              )}
            </form>
          )}
          {error && (
            <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function AddTask({ onAdded }) {
  const [form, setForm] = useState({ title: '', due: '', client: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)
    if (!form.title.trim()) {
      setErrors({ title: 'Describe the task.' })
      e.currentTarget.querySelector('input')?.focus()
      return
    }
    setBusy(true)
    const target = e.currentTarget
    try {
      const res = await api.post('/tasks', { title: form.title.trim(), due_date: form.due || null, client_id: form.client ? Number(form.client) : null })
      onAdded(res.data.data)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      setMessage(Object.keys(fields).length ? null : errorMessage(err))
      setBusy(false)
      target.querySelector('[aria-invalid="true"]')?.focus()
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mb-6 space-y-4 rounded-card border border-line bg-surface p-5" aria-label="Add a task">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Task" maxLength={300} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} error={errors.title} disabled={busy} />
        <Field label="Due date (optional)" type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} error={errors.due_date} disabled={busy} />
      </div>
      <ClientPicker
        legend="Client (optional)"
        hint={null}
        emptyLabel="No client"
        value={form.client}
        onChange={(value) => setForm((f) => ({ ...f, client: value }))}
        error={errors.client_id}
        disabled={busy}
      />
      {message && <Alert tone="error">{message}</Alert>}
      <Button type="submit" busy={busy}>
        Add task
      </Button>
    </form>
  )
}
