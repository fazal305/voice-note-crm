import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Alert, Button, Checkbox, Field } from '../../components/ui'
import { useDocumentTitle } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { useAuth } from '../../lib/auth'

const EMPTY = { organization: '', name: '', email: '', password: '', age_confirmed: false, terms_accepted: false }

export default function Register() {
  useDocumentTitle('Create an account')
  const { status, signIn } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  if (status === 'authed' && !busy) return <Navigate to="/app/record" replace />

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      const res = await api.post('/auth/register', form)
      signIn(res.data.token, res.data.user)
      navigate('/app/record', { replace: true })
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setMessage(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-5xl text-brand">Create your team&apos;s account</h1>
      <p className="mt-3 text-muted">You&apos;ll be the manager. You can add your reps afterwards.</p>
      {message && (
        <Alert tone="error" className="mt-6">
          {message}
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Team or company name" autoComplete="organization" value={form.organization} onChange={set('organization')} error={errors.organization} />
        <Field label="Your name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        <div className="space-y-3 pt-1">
          <Checkbox checked={form.age_confirmed} onChange={set('age_confirmed')} error={errors.age_confirmed}>
            I am 18 or older.
          </Checkbox>
          <Checkbox checked={form.terms_accepted} onChange={set('terms_accepted')} error={errors.terms_accepted}>
            I accept the{' '}
            <Link to="/terms" target="_blank" className="font-semibold text-brand underline underline-offset-2">
              terms
            </Link>{' '}
            and have read the{' '}
            <Link to="/privacy" target="_blank" className="font-semibold text-brand underline underline-offset-2">
              privacy policy
            </Link>
            .
          </Checkbox>
        </div>
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  )
}
