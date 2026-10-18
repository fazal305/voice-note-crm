import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Button, ConfirmDialog, Field, LoadState, PageHeader } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const EMPTY = { name: '', company: '', email: '', phone: '', notes: '' }

export default function ClientForm() {
  const { id } = useParams()
  useDocumentTitle(id ? 'Edit client' : 'Add client')

  if (!id) return <Editor initial={EMPTY} />
  return <ExistingClient id={id} />
}

function ExistingClient({ id }) {
  const client = useResource((signal) => api.get(`/clients/${id}`, { signal }).then((res) => res.data.data), id)

  return (
    <LoadState resource={client} label="Loading client" rows={4}>
      {(data) => (
        <Editor
          id={id}
          initial={Object.fromEntries(Object.keys(EMPTY).map((key) => [key, data[key] ?? '']))}
        />
      )}
    </LoadState>
  )
}

function Editor({ id, initial }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() === '' ? null : value.trim()]))
    try {
      if (id) await api.put(`/clients/${id}`, payload)
      else await api.post('/clients', payload)
      navigate(id ? `/app/clients/${id}` : '/app/clients')
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      setMessage(Object.keys(fields).length ? 'Please fix the highlighted fields.' : errorMessage(err))
      setBusy(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await api.delete(`/clients/${id}`)
      navigate('/app/clients', { replace: true })
    } catch (err) {
      setConfirming(false)
      setDeleting(false)
      setMessage(errorMessage(err))
    }
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to={id ? `/app/clients/${id}` : '/app/clients'} className="font-semibold text-brand underline underline-offset-2">
          {id ? `← ${initial.name || 'Client'}` : '← Clients'}
        </Link>
      </p>
      <PageHeader title={id ? initial.name || 'Edit client' : 'Add client'} />
      {message && (
        <Alert tone="error" className="mb-6">
          {message}
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="max-w-2xl space-y-5">
        <Field label="Name" autoComplete="off" value={form.name} onChange={set('name')} error={errors.name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Company (optional)" autoComplete="off" value={form.company} onChange={set('company')} error={errors.company} />
          <Field label="Phone (optional)" type="tel" autoComplete="off" value={form.phone} onChange={set('phone')} error={errors.phone} />
        </div>
        <Field label="Email (optional)" type="email" autoComplete="off" value={form.email} onChange={set('email')} error={errors.email} />
        <Field label="Notes (optional)" multiline maxLength={2000} value={form.notes} onChange={set('notes')} error={errors.notes} />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" busy={busy}>
            {id ? 'Save changes' : 'Add client'}
          </Button>
          <Link to={id ? `/app/clients/${id}` : '/app/clients'} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
            Cancel
          </Link>
          {id && user?.role === 'manager' && (
            <Button variant="ghost" className="ml-auto text-danger" onClick={() => setConfirming(true)}>
              Delete client
            </Button>
          )}
        </div>
      </form>
      {id && (
        <ConfirmDialog
          open={confirming}
          title="Delete this client?"
          confirmLabel="Delete client"
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        >
          {initial.name} will be removed for everyone in your organization. This can&apos;t be undone.
        </ConfirmDialog>
      )}
    </>
  )
}
