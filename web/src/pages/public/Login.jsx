import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Alert, Button, Field } from '../../components/ui'
import { useDocumentTitle } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { useAuth } from '../../lib/auth'

export default function Login() {
  useDocumentTitle('Sign in')
  const { status, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  if (status === 'authed' && !busy) return <Navigate to="/app/clients" replace />

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    try {
      const res = await api.post('/auth/login', form)
      signIn(res.data.token, res.data.user)
      navigate(location.state?.from || '/app/clients', { replace: true })
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setMessage(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-5xl text-brand">Sign in</h1>
      {location.state?.expired && (
        <Alert tone="warn" className="mt-6">
          Your session has expired. Please sign in again.
        </Alert>
      )}
      {message && (
        <Alert tone="error" className="mt-6">
          {message}
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="mt-8 space-y-5">
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Field label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={errors.password} />
        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        New here?{' '}
        <Link to="/register" className="font-semibold text-brand underline underline-offset-2">
          Create your team&apos;s account
        </Link>
      </p>
    </div>
  )
}
