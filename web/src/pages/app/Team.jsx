import { useCallback, useState } from 'react'
import { Alert, Button, Card, ConfirmDialog, Field, LoadState, PageHeader, Toast } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { useAuth } from '../../lib/auth'

export default function Team() {
  useDocumentTitle('Team')
  const { user } = useAuth()
  const isDemo = user?.organization?.is_demo
  const team = useResource((signal) => api.get('/team', { signal }).then((res) => res.data.data))
  const [toast, setToast] = useState(null)
  const clearToast = useCallback(() => setToast(null), [])

  const done = (text) => {
    setToast(text)
    team.reload()
  }

  return (
    <>
      <PageHeader title="Team" description="Add the reps in your organization and manage their access." />
      {isDemo && (
        <Alert tone="warn" className="mb-6">
          Team changes are turned off in the demo, so the demo accounts keep working for everyone.
        </Alert>
      )}
      <LoadState resource={team} label="Loading team">
        {(members) => (
          <ul className="space-y-3">
            {members.map((member) => (
              <Member key={member.id} member={member} readOnly={isDemo} onChanged={done} />
            ))}
          </ul>
        )}
      </LoadState>
      {!isDemo && <AddRep onAdded={(name) => done(`${name} was added.`)} />}
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}

function Member({ member, readOnly, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const canManage = !readOnly && member.role === 'rep' && member.active

  const deactivate = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/team/${member.id}/deactivate`)
      setConfirming(false)
      onChanged(`${member.name} was deactivated.`)
    } catch (err) {
      setConfirming(false)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="min-w-0 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {member.name}
            {member.is_you && <span className="font-normal text-muted"> (you)</span>}
          </p>
          <p className="truncate text-sm text-muted">{member.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${member.role === 'manager' ? 'bg-brand-tint text-brand' : 'bg-neutral-tint text-neutral'}`}>
            {member.role === 'manager' ? 'Manager' : 'Rep'}
          </span>
          {!member.active && <span className="rounded-full bg-danger-tint px-2.5 py-0.5 text-xs font-semibold text-danger">Deactivated</span>}
          {canManage && !editing && (
            <>
              <Button variant="secondary" className="min-h-9" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="ghost" className="min-h-9 text-danger" onClick={() => setConfirming(true)}>
                Deactivate
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
      {editing && (
        <EditRep
          member={member}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged('Changes saved.')
          }}
        />
      )}
      <ConfirmDialog open={confirming} title={`Deactivate ${member.name}?`} confirmLabel="Deactivate" busy={busy} onConfirm={deactivate} onCancel={() => setConfirming(false)}>
        They will be signed out and won&apos;t be able to sign in again. Their clients stay with your organization.
      </ConfirmDialog>
    </li>
  )
}

function EditRep({ member, onCancel, onSaved }) {
  const [form, setForm] = useState({ name: member.name, email: member.email })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      await api.put(`/team/${member.id}`, form)
      onSaved()
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setMessage(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mt-4 space-y-4 border-t border-line pt-4">
      {message && <Alert tone="error">{message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} />
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

const EMPTY = { name: '', email: '', password: '' }

function AddRep({ onAdded }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      await api.post('/team', form)
      setForm(EMPTY)
      onAdded(form.name.trim())
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-10" aria-labelledby="add-rep">
      <h2 id="add-rep" className="text-3xl">
        Add a rep
      </h2>
      <p className="mt-1 text-sm text-muted">Share the temporary password with them directly. They sign in with their email.</p>
      {message && (
        <Alert tone="error" className="mt-4">
          {message}
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" autoComplete="off" value={form.name} onChange={set('name')} error={errors.name} />
          <Field label="Email" type="email" autoComplete="off" value={form.email} onChange={set('email')} error={errors.email} />
        </div>
        <Field
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        <Button type="submit" busy={busy}>
          Add rep
        </Button>
      </form>
    </Card>
  )
}
