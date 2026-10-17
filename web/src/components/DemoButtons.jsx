import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Alert, Button } from './ui'

export function DemoButtons() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const start = async (role) => {
    setBusy(role)
    setError(null)
    try {
      const res = await api.post('/demo/login', { role })
      signIn(res.data.token, res.data.user)
      navigate('/app/clients')
    } catch (err) {
      setError(err.response?.status === 404 ? 'The demo is not available right now.' : errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Button busy={busy === 'rep'} disabled={busy === 'manager'} onClick={() => start('rep')}>
          Try the demo as a rep
        </Button>
        <Button variant="secondary" busy={busy === 'manager'} disabled={busy === 'rep'} onClick={() => start('manager')}>
          Try it as a manager
        </Button>
      </div>
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
    </div>
  )
}
