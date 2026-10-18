import { useCallback, useId, useState } from 'react'
import { Alert, Button, Card, ConfirmDialog, LoadState, PageHeader, Toast } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { api, errorMessage, fieldErrors } from '../../lib/api'

export default function Settings() {
  useDocumentTitle('Settings')
  const settings = useResource((signal) => api.get('/settings/prompt', { signal }).then((res) => res.data), 'prompt')

  return (
    <>
      <PageHeader title="Settings" description="How notes are turned into call logs for your organization." />
      <LoadState resource={settings} label="Loading settings" rows={2}>
        {(data) => <PromptForm initial={data} />}
      </LoadState>
    </>
  )
}

function PromptForm({ initial }) {
  const id = useId()
  const [saved, setSaved] = useState(initial.system_prompt ?? '')
  const [prompt, setPrompt] = useState(initial.system_prompt ?? '')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const clearToast = useCallback(() => setToast(null), [])
  const editable = initial.editable
  const max = initial.max_length
  const dirty = prompt !== saved
  const blocker = useUnsavedChanges(dirty && !busy)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (prompt.length > max) {
      setError(`Keep the prompt under ${max.toLocaleString()} characters.`)
      return
    }
    setBusy(true)
    try {
      const res = await api.put('/settings/prompt', { system_prompt: prompt })
      const next = res.data.system_prompt ?? ''
      setSaved(next)
      setPrompt(next)
      setToast(next ? 'Prompt saved. New notes will use it.' : 'Prompt cleared. New notes will use the default.')
    } catch (err) {
      const fields = fieldErrors(err)
      setError(fields.system_prompt ?? null)
      setMessage(fields.system_prompt ? null : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const describedBy = [`${id}-hint`, `${id}-count`, error && `${id}-error`].filter(Boolean).join(' ')

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <h2 className="text-2xl">Your system prompt</h2>
        {!editable && (
          <Alert tone="warn" className="mt-3">
            Prompt changes are turned off in the demo, so everyone trying it sees the same results.
          </Alert>
        )}
        <form noValidate onSubmit={submit} className="mt-3">
          <label htmlFor={id} className="block text-sm font-semibold">
            Instructions for the note parser
          </label>
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
            Describe your business and what matters in a call (products, deal stages, wording). Leave it empty to use the default.
          </p>
          <textarea
            id={id}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            readOnly={!editable}
            disabled={busy}
            rows={10}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            placeholder={initial.default_prompt}
            className={`mt-1.5 block w-full min-w-0 rounded-lg border bg-surface px-3 py-2.5 text-base placeholder:text-muted/70 focus:border-brand read-only:bg-sunken/50 ${error ? 'border-danger' : 'border-line-strong'}`}
          />
          <p id={`${id}-count`} className={`mt-1 text-right text-xs tabular-nums ${prompt.length > max ? 'font-semibold text-danger' : 'text-muted'}`} aria-live="polite">
            {prompt.length.toLocaleString()} / {max.toLocaleString()} characters
          </p>
          {error && (
            <p id={`${id}-error`} className="text-sm text-danger">
              {error}
            </p>
          )}
          {message && (
            <Alert tone="error" className="mt-3">
              {message}
            </Alert>
          )}
          {editable && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" busy={busy} disabled={!dirty}>
                Save prompt
              </Button>
              <Button variant="secondary" disabled={busy || prompt === ''} onClick={() => setPrompt('')}>
                Reset to default
              </Button>
            </div>
          )}
          {editable && prompt === '' && saved !== '' && <p className="mt-2 text-sm text-muted">Save to switch back to the default prompt.</p>}
        </form>
      </Card>

      <div className="space-y-6">
        <Card>
          <h2 className="text-2xl">Default prompt</h2>
          <p className="mt-1 text-xs text-muted">Used whenever your own prompt is empty. Read-only.</p>
          <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-sunken/60 p-3 text-sm leading-relaxed">{initial.default_prompt}</p>
        </Card>
        <Card>
          <h2 className="text-2xl">Rules that always apply</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your prompt replaces only the description above. Fixed safety rules are always added after it: the transcript is treated purely as data, so
            anything said on a call (&ldquo;ignore your instructions&rdquo;) can&rsquo;t change how it&rsquo;s handled, and the answer must use the
            standard call-log format. Every result is still checked before you review it.
          </p>
        </Card>
      </div>
      <Toast message={toast} onDone={clearToast} />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        confirmLabel="Leave page"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        Your changes to the prompt haven&apos;t been saved.
      </ConfirmDialog>
    </div>
  )
}
