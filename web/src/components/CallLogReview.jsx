import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ClientPicker } from './ClientPicker'
import { Alert, Button, Card, ConfirmDialog, Field } from './ui'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { api, errorMessage, fieldErrors } from '../lib/api'
import { formatDate, formatDay } from '../lib/format'

const SENTIMENTS = ['Positive', 'Neutral', 'Frustrated']

const SENTIMENT_STYLE = {
  Positive: 'bg-positive-tint text-positive',
  Neutral: 'bg-neutral-tint text-neutral',
  Frustrated: 'bg-negative-tint text-negative',
}

const MAX_SUMMARY = 1000
const MAX_ITEM = 300
const MAX_ITEMS = 30
const MAX_PHRASE = 120

let lastKey = 0
const newKey = () => `item-${++lastKey}`

// An item that names one of the dates mentioned ("by Friday") starts out due on that date.
function dueFor(text, followUps) {
  const lower = text.toLowerCase()
  return followUps.find((f) => lower.includes(f.phrase.toLowerCase()))?.date ?? ''
}

function initialForm(note) {
  const ai = note.ai_payload
  const preset = note.client ?? note.suggested_client
  return {
    client: preset ? { type: 'existing', id: preset.id, name: preset.name } : null,
    summary: ai.summary.slice(0, MAX_SUMMARY),
    sentiment: SENTIMENTS.includes(ai.sentiment) ? ai.sentiment : 'Neutral',
    items: ai.action_items.map((item) => ({ key: newKey(), text: item.text, owner: item.owner, due: dueFor(item.text, ai.follow_ups), include: true })),
    followUpDate: ai.follow_ups[0]?.date ?? '',
    followUpPhrase: ai.follow_ups[0]?.phrase ?? '',
  }
}

/** The same rules as the API, so most mistakes are caught before a round trip. Keys match the API's 422 keys. */
function validate(form) {
  const errors = {}
  if (!form.client) errors.client_id = 'Choose the client this call was with, or add a new one.'
  else if (form.client.type === 'new' && !form.client.name.trim()) errors['new_client.name'] = "Enter the new client's name."
  if (!form.summary.trim()) errors.summary = 'Write a short summary of the call.'
  else if (form.summary.trim().length > MAX_SUMMARY) errors.summary = 'Keep the summary under 1,000 characters.'
  form.items.forEach((item, i) => {
    if (!item.include) return
    if (!item.text.trim()) errors[`action_items.${i}.text`] = 'Describe the action item, or untick it.'
    else if (item.text.trim().length > MAX_ITEM) errors[`action_items.${i}.text`] = 'Keep each action item under 300 characters.'
  })
  return errors
}

/** Moves focus to the first field marked invalid, after the errors have rendered. */
function useFocusFirstError(formRef) {
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (attempt) formRef.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [attempt, formRef])
  return () => setAttempt((n) => n + 1)
}

function LeaveGuard({ blocker }) {
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      confirmLabel="Leave page"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      Your changes to this call log haven&apos;t been saved.
    </ConfirmDialog>
  )
}

/** FR-3.2 / FR-3.1: the parsed note as an editable log, saved only when the user confirms it. */
export function ReviewForm({ note, onSaved }) {
  const [initial] = useState(() => initialForm(note))
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef(null)
  const focusFirstError = useFocusFirstError(formRef)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const blocker = useUnsavedChanges(dirty && !busy)
  const ai = note.ai_payload

  // Editing a field clears its error; the rest stay until the next save attempt.
  const clearError = (...keys) => setErrors((e) => (keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e))
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    clearError(key, key === 'client' ? 'client_id' : null, key === 'client' ? 'new_client.name' : null)
  }
  const setItem = (index, changes) => {
    setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === index ? { ...item, ...changes } : item)) }))
    clearError(`action_items.${index}.text`, `action_items.${index}.owner`, `action_items.${index}.due_date`)
  }
  // Errors are keyed by position, so removing an item clears them rather than pointing at the wrong row.
  const removeItem = (index) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => !key.startsWith('action_items.'))))
  }
  const [focusKey, setFocusKey] = useState(null)
  const addItem = () => {
    const key = newKey()
    setForm((f) => ({ ...f, items: [...f.items, { key, text: '', owner: 'rep', due: '', include: true }] }))
    setFocusKey(key)
  }

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)
    const problems = validate(form)
    setErrors(problems)
    if (Object.keys(problems).length) {
      setMessage('Please fix the highlighted fields.')
      focusFirstError()
      return
    }

    setBusy(true)
    const { client } = form
    try {
      const res = await api.post(`/voice-notes/${note.id}/call-log`, {
        ...(client.type === 'new'
          ? { new_client: { name: client.name.trim(), company: client.company.trim() || null } }
          : { client_id: client.id }),
        summary: form.summary.trim(),
        sentiment: form.sentiment,
        action_items: form.items.map((item) => ({ text: item.text.trim(), owner: item.owner, due_date: item.due || null, include: item.include })),
        follow_up: { date: form.followUpDate || null, phrase: form.followUpPhrase.trim() || null },
      })
      onSaved(res.data.data)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      const count = Object.keys(fields).length
      setMessage(count ? (fields['action_items'] ?? 'Please fix the highlighted fields.') : errorMessage(err, err.response?.data?.message))
      setBusy(false)
      if (count) focusFirstError()
    }
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="mb-6 space-y-6" aria-labelledby="review-heading">
      <div>
        <h2 id="review-heading" className="text-3xl">
          Review and save
        </h2>
        <p className="mt-1 text-sm text-muted">Check what we picked out of your note. Nothing is saved to the client until you press Save log.</p>
        {ai.engine === 'rules' && (
          <p className="mt-3 rounded-lg bg-warn-tint px-3 py-2 text-sm text-warn">Parsed with basic rules — review carefully.</p>
        )}
      </div>

      <Card>
        <ClientChooser
          note={note}
          value={form.client}
          onChange={(client) => set('client', client)}
          error={errors.client_id}
          newErrors={{ name: errors['new_client.name'], company: errors['new_client.company'] }}
          disabled={busy}
        />
      </Card>

      <Card className="space-y-5">
        <Field
          label="Summary"
          multiline
          rows={5}
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          error={errors.summary}
          hint={`${form.summary.trim().length.toLocaleString()} / ${MAX_SUMMARY.toLocaleString()} characters`}
          disabled={busy}
        />
        <SentimentControl value={form.sentiment} onChange={(value) => set('sentiment', value)} error={errors.sentiment} disabled={busy} />
      </Card>

      <Card>
        <h3 className="text-2xl">Action items</h3>
        <p className="mt-1 text-sm text-muted">Ticked items become tasks. Items without a date are due on the follow-up date.</p>
        {form.items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No action items. Add one if something was agreed.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {form.items.map((item, i) => (
              <ActionItem
                key={item.key}
                item={item}
                number={i + 1}
                errors={{
                  text: errors[`action_items.${i}.text`],
                  owner: errors[`action_items.${i}.owner`],
                  due: errors[`action_items.${i}.due_date`],
                }}
                onChange={(changes) => setItem(i, changes)}
                onRemove={() => removeItem(i)}
                autoFocus={item.key === focusKey}
                disabled={busy}
              />
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-4" onClick={addItem} disabled={busy || form.items.length >= MAX_ITEMS}>
          <span aria-hidden="true">+</span> Add item
        </Button>
      </Card>

      <Card>
        <h3 className="text-2xl">Follow-up</h3>
        <p className="mt-1 text-sm text-muted">A reminder to follow up is added on this date unless an action item already covers it.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Date (optional)"
            type="date"
            value={form.followUpDate}
            onChange={(e) => set('followUpDate', e.target.value)}
            error={errors['follow_up.date']}
            disabled={busy}
          />
          <Field
            label="What was said (optional)"
            value={form.followUpPhrase}
            maxLength={MAX_PHRASE}
            onChange={(e) => set('followUpPhrase', e.target.value)}
            error={errors['follow_up.phrase']}
            placeholder="next Tuesday"
            disabled={busy}
          />
        </div>
        {ai.follow_ups.length > 1 && (
          <p className="mt-3 text-sm text-muted">
            Also mentioned:{' '}
            {ai.follow_ups.slice(1).map((f, i) => (
              <span key={f.date + f.phrase}>
                {i > 0 && ', '}“{f.phrase}” (<time dateTime={f.date}>{formatDay(f.date)}</time>)
              </span>
            ))}
          </p>
        )}
      </Card>

      {message && <Alert tone="error">{message}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" busy={busy}>
          Save log
        </Button>
        {dirty && !busy && <p className="text-sm text-muted">You have unsaved changes.</p>}
      </div>
      <LeaveGuard blocker={blocker} />
    </form>
  )
}

function ClientChooser({ note, value, onChange, error, newErrors, disabled }) {
  const id = useId()
  const preset = note.client ?? note.suggested_client
  const [mode, setMode] = useState(preset ? 'preset' : note.match_candidates.length ? 'candidates' : 'search')
  const choose = (next) => {
    setMode(next)
    onChange(next === 'new' ? { type: 'new', name: '', company: '' } : null)
  }

  if (mode === 'preset') {
    return (
      <div>
        <p className="text-sm font-semibold">Client</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="min-w-0 rounded-full bg-brand-tint px-3 py-1.5 text-sm text-brand-strong">
            {note.client ? 'Chosen when you uploaded: ' : 'Suggested from your note: '}
            <strong className="break-words font-semibold">{preset.name}</strong>
          </p>
          <Button variant="secondary" className="min-h-9" disabled={disabled} onClick={() => choose(note.match_candidates.length ? 'candidates' : 'search')}>
            Change
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'new') {
    return (
      <fieldset className="min-w-0" disabled={disabled}>
        <legend className="text-sm font-semibold">New client</legend>
        <p className="mt-0.5 text-xs text-muted">They&apos;ll be added to your organization&apos;s client list when you save.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Name" autoComplete="off" maxLength={120} value={value?.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value })} error={newErrors.name} />
          <Field
            label="Company (optional)"
            autoComplete="off"
            maxLength={120}
            value={value?.company ?? ''}
            onChange={(e) => onChange({ ...value, company: e.target.value })}
            error={newErrors.company}
          />
        </div>
        <Button variant="ghost" className="mt-3 -ml-2 min-h-9 px-2" onClick={() => choose('search')}>
          Choose an existing client instead
        </Button>
      </fieldset>
    )
  }

  if (mode === 'candidates') {
    const errorId = `${id}-error`
    return (
      <fieldset className="min-w-0" disabled={disabled}>
        <legend className="text-sm font-semibold">Which client was this?</legend>
        <p className="mt-0.5 text-xs text-muted">More than one client in your list matches the names in this note.</p>
        <div className="mt-3 space-y-2">
          {note.match_candidates.map((c, i) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
              <input
                type="radio"
                name={`${id}-client`}
                className="size-4 shrink-0 accent-brand"
                checked={value?.type === 'existing' && value.id === c.id}
                onChange={() => onChange({ type: 'existing', id: c.id, name: c.name })}
                aria-invalid={error && i === 0 ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              <span className="min-w-0 break-words">{c.name}</span>
            </label>
          ))}
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-2">
          <Button variant="ghost" className="-ml-2 min-h-9 px-2" onClick={() => choose('search')}>
            Someone else
          </Button>
          <Button variant="ghost" className="min-h-9 px-2" onClick={() => choose('new')}>
            Add new client
          </Button>
        </div>
      </fieldset>
    )
  }

  return (
    <div>
      <ClientPicker
        legend="Client"
        hint="Required. Search your organization's clients."
        emptyLabel="Choose a client"
        value={value?.type === 'existing' ? String(value.id) : ''}
        onChange={(selected, client) => onChange(selected ? { type: 'existing', id: Number(selected), name: client?.name ?? '' } : null)}
        error={error}
        disabled={disabled}
      />
      <div className="mt-1 flex flex-wrap gap-x-2">
        <Button variant="ghost" className="-ml-2 min-h-9 px-2" disabled={disabled} onClick={() => choose('new')}>
          <span aria-hidden="true">+</span> Add new client
        </Button>
        {preset && (
          <Button
            variant="ghost"
            className="min-h-9 px-2"
            disabled={disabled}
            onClick={() => {
              setMode('preset')
              onChange({ type: 'existing', id: preset.id, name: preset.name })
            }}
          >
            Use {preset.name}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Three options as a native radio group: arrow keys move between them, and the group has one tab stop. */
export function SentimentControl({ value, onChange, error, disabled }) {
  const id = useId()
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-sm font-semibold">How did the client feel?</legend>
      <div className="mt-1.5 inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line-strong bg-surface p-1">
        {SENTIMENTS.map((option) => (
          <label
            key={option}
            className="flex min-h-10 cursor-pointer items-center rounded-md px-3.5 text-sm font-semibold text-muted hover:bg-sunken has-[:checked]:bg-brand has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
          >
            <input
              type="radio"
              name={`${id}-sentiment`}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              aria-invalid={error ? true : undefined}
              className="sr-only"
            />
            {option}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </fieldset>
  )
}

function ActionItem({ item, number, errors, onChange, onRemove, autoFocus, disabled }) {
  const id = useId()
  return (
    <li className={`min-w-0 rounded-lg border p-3 ${item.include ? 'border-line-strong bg-surface' : 'border-dashed border-line bg-sunken/40'}`}>
      <div className="flex items-start gap-3">
        <input
          id={`${id}-include`}
          type="checkbox"
          checked={item.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          disabled={disabled}
          className="mt-3 size-5 shrink-0 accent-brand"
        />
        <label htmlFor={`${id}-include`} className="sr-only">
          Create a task for item {number}
        </label>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-text`} className="sr-only">
            Action item {number}
          </label>
          <input
            id={`${id}-text`}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- only the row the user just added, so they can type straight away
            autoFocus={autoFocus}
            value={item.text}
            maxLength={MAX_ITEM}
            onChange={(e) => onChange({ text: e.target.value })}
            disabled={disabled}
            placeholder="What needs doing?"
            aria-invalid={errors.text ? true : undefined}
            aria-describedby={errors.text ? `${id}-text-error` : undefined}
            className={`block w-full min-w-0 rounded-lg border bg-surface px-3 py-2.5 text-base focus:border-brand ${errors.text ? 'border-danger' : 'border-line-strong'} ${item.include ? '' : 'text-muted line-through'}`}
          />
          {errors.text && (
            <p id={`${id}-text-error`} className="mt-1 text-sm text-danger">
              {errors.text}
            </p>
          )}
          {!item.include && <p className="mt-1 text-xs text-muted">Left out — no task will be created.</p>}
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <fieldset className="min-w-0" disabled={disabled}>
              <legend className="text-xs font-semibold text-muted">
                For<span className="sr-only"> item {number}</span>
              </legend>
              <div className="mt-1 inline-flex gap-1 rounded-lg border border-line-strong bg-surface p-0.5">
                {[
                  ['rep', 'You'],
                  ['client', 'Client'],
                ].map(([owner, label]) => (
                  <label
                    key={owner}
                    className="flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-semibold text-muted hover:bg-sunken has-[:checked]:bg-brand has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
                  >
                    <input
                      type="radio"
                      name={`${id}-owner`}
                      value={owner}
                      checked={item.owner === owner}
                      onChange={() => onChange({ owner })}
                      aria-invalid={errors.owner ? true : undefined}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="min-w-0">
              <label htmlFor={`${id}-due`} className="block text-xs font-semibold text-muted">
                Due<span className="sr-only"> date for item {number}</span>
              </label>
              <input
                id={`${id}-due`}
                type="date"
                value={item.due}
                onChange={(e) => onChange({ due: e.target.value })}
                disabled={disabled}
                aria-invalid={errors.due ? true : undefined}
                className={`mt-1 block min-h-9 min-w-0 rounded-lg border bg-surface px-2 py-1.5 text-sm ${errors.due ? 'border-danger' : 'border-line-strong'}`}
              />
            </div>
            <Button variant="ghost" className="ml-auto min-h-9 px-2 text-danger" onClick={onRemove} disabled={disabled}>
              Remove<span className="sr-only"> item {number}</span>
            </Button>
          </div>
          {(errors.owner || errors.due) && <p className="mt-1 text-sm text-danger">{errors.owner || errors.due}</p>}
        </div>
      </div>
    </li>
  )
}

/** The saved log, read-only until "Edit log". Its tasks live on the Tasks page from here on. */
export function SavedLog({ note, onUpdated }) {
  const log = note.call_log
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <EditLogForm
        log={log}
        onCancel={() => setEditing(false)}
        onSaved={(fresh) => {
          setEditing(false)
          onUpdated(fresh)
        }}
      />
    )
  }

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl">Call log</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SENTIMENT_STYLE[log.sentiment] ?? SENTIMENT_STYLE.Neutral}`}>
            <span className="sr-only">Client sentiment: </span>
            {log.sentiment}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          With{' '}
          {log.client ? (
            <Link to={`/app/clients/${log.client.id}`} className="font-semibold text-brand underline underline-offset-2">
              {log.client.name}
            </Link>
          ) : (
            'a deleted client'
          )}{' '}
          · saved {log.author.is_you ? 'by you' : `by ${log.author.name}`} <time dateTime={log.created_at}>{formatDate(log.created_at)}</time>
        </p>
        <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{log.summary}</p>
        {log.follow_up.date && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Follow up </span>
            <time dateTime={log.follow_up.date}>{formatDay(log.follow_up.date)}</time>
            {log.follow_up.phrase && <span className="text-muted"> · “{log.follow_up.phrase}”</span>}
          </p>
        )}
        {log.can_edit && (
          <Button variant="secondary" className="mt-4" onClick={() => setEditing(true)}>
            Edit log
          </Button>
        )}
      </Card>

      <Card>
        <h2 className="text-2xl">Tasks from this call</h2>
        {log.tasks?.length ? (
          <ul className="mt-3 space-y-2">
            {log.tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className={`mt-0.5 ${task.done ? 'text-positive' : 'text-muted'}`}>
                  {task.done ? '✓' : '○'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`break-words ${task.done ? 'text-muted line-through' : ''}`}>{task.title}</span>
                  {task.done && <span className="sr-only"> (done)</span>}
                  <span className="block text-xs text-muted">
                    {task.owner === 'client' ? 'Client’s commitment' : 'Yours'}
                    {task.due_date && (
                      <>
                        {' '}
                        · due <time dateTime={task.due_date}>{formatDay(task.due_date)}</time>
                      </>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No tasks were created from this call.</p>
        )}
        <Link to="/app/tasks" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-2">
          Open Tasks
        </Link>
      </Card>
    </div>
  )
}

function EditLogForm({ log, onCancel, onSaved }) {
  const [initial] = useState(() => ({
    summary: log.summary,
    sentiment: log.sentiment,
    followUpDate: log.follow_up.date ?? '',
    followUpPhrase: log.follow_up.phrase ?? '',
  }))
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef(null)
  const focusFirstError = useFocusFirstError(formRef)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const blocker = useUnsavedChanges(dirty && !busy)
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)
    const problems = validate({ client: true, summary: form.summary, items: [] })
    setErrors(problems)
    if (Object.keys(problems).length) {
      setMessage('Please fix the highlighted fields.')
      focusFirstError()
      return
    }
    setBusy(true)
    try {
      const res = await api.put(`/call-logs/${log.id}`, {
        summary: form.summary.trim(),
        sentiment: form.sentiment,
        follow_up: { date: form.followUpDate || null, phrase: form.followUpPhrase.trim() || null },
      })
      onSaved(res.data.data)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      setMessage(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(err))
      setBusy(false)
      focusFirstError()
    }
  }

  return (
    <Card className="mb-6">
      <form ref={formRef} noValidate onSubmit={submit} className="space-y-5" aria-labelledby="edit-log-heading">
        <div>
          <h2 id="edit-log-heading" className="text-2xl">
            Edit call log
          </h2>
          <p className="mt-1 text-sm text-muted">Tasks already created stay as they are; change them on the Tasks page.</p>
        </div>
        <Field
          label="Summary"
          multiline
          rows={5}
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          error={errors.summary}
          hint={`${form.summary.trim().length.toLocaleString()} / ${MAX_SUMMARY.toLocaleString()} characters`}
          disabled={busy}
        />
        <SentimentControl value={form.sentiment} onChange={(value) => set('sentiment', value)} error={errors.sentiment} disabled={busy} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Follow-up date (optional)" type="date" value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} error={errors['follow_up.date']} disabled={busy} />
          <Field
            label="What was said (optional)"
            value={form.followUpPhrase}
            maxLength={MAX_PHRASE}
            onChange={(e) => set('followUpPhrase', e.target.value)}
            error={errors['follow_up.phrase']}
            disabled={busy}
          />
        </div>
        {message && <Alert tone="error">{message}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" busy={busy}>
            Save changes
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
      <LeaveGuard blocker={blocker} />
    </Card>
  )
}
