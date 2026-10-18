import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { StatusChip } from '../../components/StatusChip'
import { Alert, Button, Card, ErrorState, Field, Skeleton } from '../../components/ui'
import { useNoteStatus } from '../../hooks/useNoteStatus'
import { useDocumentTitle } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { formatDate, formatDay, formatDuration } from '../../lib/format'

const STEPS = ['Uploaded', 'Transcribing', 'Analyzing', 'Ready']
const STEP_INDEX = { uploaded: 0, transcribing: 1, awaiting_transcript: 1, parsing: 2, ready: 3 }
const MIN_TRANSCRIPT = 20
const MAX_TRANSCRIPT = 20000

const SENTIMENT = {
  Positive: 'bg-positive-tint text-positive',
  Neutral: 'bg-neutral-tint text-neutral',
  Frustrated: 'bg-negative-tint text-negative',
}

const PROGRESS_MESSAGE = {
  uploaded: 'Your note is uploaded and queued for transcription.',
  transcribing: 'Turning your recording into text…',
  parsing: 'Writing the summary and picking out action items…',
}

export default function NoteDetail() {
  const { id } = useParams()
  const status = useNoteStatus(id)
  const { note } = status
  const title = note ? note.original_name || (note.source === 'recording' ? 'Recording' : 'Uploaded file') : 'Note'
  useDocumentTitle(title)

  return (
    <>
      <Link to="/app/notes" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> All notes
      </Link>

      {status.loading ? (
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only" role="status">
            Loading note…
          </span>
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : !note ? (
        <ErrorState
          title={status.notFound ? 'Note not found' : "Couldn't load this note"}
          message={status.notFound ? 'It may have been deleted, or it belongs to someone else.' : status.error}
          onRetry={status.notFound ? undefined : status.restart}
        />
      ) : (
        <NoteView note={note} title={title} status={status} />
      )}
    </>
  )
}

function NoteView({ note, title, status }) {
  const duration = formatDuration(note.duration_seconds)
  const refreshed = (fresh) => {
    status.replace(fresh)
    status.restart()
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-4xl sm:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">
            <time dateTime={note.created_at}>{formatDate(note.created_at)}</time>
            {duration && <> · {duration}</>}
            {!note.owner.is_you && <> · by {note.owner.name}</>}
          </p>
        </div>
        <StatusChip status={note.status} className="mt-2" />
      </header>

      {note.status !== 'ready' && <Steps status={note.status} transcribed={Boolean(note.transcript)} />}

      {status.error && (
        <Alert tone="warn" className="mb-6">
          {status.error} We&apos;ll keep checking.
        </Alert>
      )}

      {PROGRESS_MESSAGE[note.status] && (
        <Card className="mb-6">
          <p className="font-semibold" role="status" aria-live="polite">
            {PROGRESS_MESSAGE[note.status]}
          </p>
          <p className="mt-1 text-sm text-muted">You can leave this page; processing carries on and the note will be ready in your list.</p>
          {status.slow && (
            <Alert tone="warn" className="mt-4">
              This is taking longer than usual. The transcription service may be busy. We&apos;ll keep checking.
            </Alert>
          )}
        </Card>
      )}

      {note.status === 'awaiting_transcript' && (
        <Card className="mb-6">
          <h2 className="text-2xl">Add the transcript</h2>
          <p className="mt-1 text-sm text-muted">
            Automatic transcription isn&apos;t set up on this server. Type or paste what you said in the note, and we&apos;ll write the summary and
            action items from it.
          </p>
          <TranscriptForm noteId={note.id} onSubmitted={refreshed} />
        </Card>
      )}

      {note.status === 'failed' && <Failed note={note} onRetried={refreshed} />}

      {note.status === 'ready' && note.ai_payload && <Parsed note={note} />}

      {note.transcript && (
        <details className="group rounded-card border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-5 py-3 font-semibold">
            Transcript
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <p className="whitespace-pre-wrap break-words border-t border-line px-5 py-4 text-sm leading-relaxed">{note.transcript}</p>
        </details>
      )}
    </>
  )
}

function Steps({ status, transcribed }) {
  const current = status === 'failed' ? (transcribed ? 2 : 1) : (STEP_INDEX[status] ?? 0)
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Processing steps">
      {STEPS.map((label, i) => {
        const done = i < current || status === 'ready'
        const active = i === current && status !== 'ready'
        const stuck = active && (status === 'awaiting_transcript' || status === 'failed')
        return (
          <li key={label} className="min-w-0" aria-current={active ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${done ? 'bg-positive' : active ? (stuck ? 'bg-accent' : 'bg-warn motion-safe:animate-pulse') : 'bg-sunken'}`} />
            <p className={`mt-1.5 truncate text-xs font-semibold sm:text-sm ${done || active ? 'text-ink' : 'text-muted'}`}>
              {i === 1 && status === 'awaiting_transcript' ? 'Transcript' : label}
              <span className="sr-only">{done ? ' (done)' : stuck ? ' (needs you)' : active ? ' (in progress)' : ''}</span>
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function Failed({ note, onRetried }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const retry = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post(`/voice-notes/${note.id}/retry`)
      onRetried(res.data.data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Alert tone="error" title="Processing didn't finish" className="mb-6">
        <p>{note.error || 'Something went wrong while processing this note.'}</p>
        {note.can_retry ? (
          <Button variant="secondary" className="mt-3" busy={busy} onClick={retry}>
            Try again
          </Button>
        ) : (
          <p className="mt-2">This note can&apos;t be processed again. Record or upload it as a new note.</p>
        )}
        {error && <p className="mt-2 font-semibold">{error}</p>}
      </Alert>
      {!note.transcript && note.can_retry && (
        <Card className="mb-6">
          <h2 className="text-2xl">Or type the transcript</h2>
          <p className="mt-1 text-sm text-muted">If the recording is hard to make out, type or paste what you said instead.</p>
          <TranscriptForm noteId={note.id} onSubmitted={onRetried} />
        </Card>
      )}
    </>
  )
}

function TranscriptForm({ noteId, onSubmitted }) {
  const [text, setText] = useState('')
  const [fieldError, setFieldError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const length = text.trim().length

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)
    const problem =
      length === 0
        ? 'Type or paste what was said in the note.'
        : length < MIN_TRANSCRIPT
          ? 'That is too short to analyze. Add a little more detail.'
          : length > MAX_TRANSCRIPT
            ? 'Keep the transcript under 20,000 characters.'
            : null
    setFieldError(problem)
    if (problem) return

    setBusy(true)
    try {
      const res = await api.post(`/voice-notes/${noteId}/transcript`, { transcript: text })
      onSubmitted(res.data.data)
    } catch (err) {
      const fields = fieldErrors(err)
      setFieldError(fields.transcript ?? null)
      setMessage(fields.transcript ? null : errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mt-4">
      <Field
        label="Transcript"
        multiline
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={fieldError}
        hint={`${length.toLocaleString()} / ${MAX_TRANSCRIPT.toLocaleString()} characters`}
        disabled={busy}
        placeholder="Just spoke with… They asked for… I'll send… We'll talk again next Tuesday."
      />
      {message && (
        <Alert tone="error" className="mt-4">
          {message}
        </Alert>
      )}
      <Button type="submit" className="mt-4" busy={busy}>
        Analyze transcript
      </Button>
    </form>
  )
}

function Parsed({ note }) {
  const ai = note.ai_payload
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl">Summary</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SENTIMENT[ai.sentiment] ?? SENTIMENT.Neutral}`}>
              <span className="sr-only">Client sentiment: </span>
              {ai.sentiment}
            </span>
          </div>
          <p className="mt-2 break-words leading-relaxed">{ai.summary}</p>
          {ai.engine === 'rules' && (
            <p className="mt-3 rounded-lg bg-warn-tint px-3 py-2 text-sm text-warn">Parsed with basic rules — review carefully.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-2xl">Action items</h2>
          {ai.action_items.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No action items were found. Check the transcript below.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {ai.action_items.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded border-2 border-line-strong" />
                  <span className="min-w-0 flex-1 break-words">{item.text}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${item.owner === 'client' ? 'bg-brand-tint text-brand-strong' : 'bg-sunken text-ink'}`}
                  >
                    {item.owner === 'client' ? 'Client' : 'You'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <h2 className="text-2xl">Follow-ups</h2>
          {ai.follow_ups.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No dates were mentioned.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {ai.follow_ups.map((f, i) => (
                <li key={i} className="min-w-0">
                  <p className="font-semibold">
                    <time dateTime={f.date}>{formatDay(f.date)}</time>
                  </p>
                  <p className="break-words text-sm text-muted">
                    “{f.phrase}”{f.description && <> · {f.description}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-2xl">Client</h2>
          <ClientMatch note={note} />
        </Card>
      </div>
    </div>
  )
}

function ClientMatch({ note }) {
  if (note.client) {
    return <p className="mt-2 break-words">{note.client.name}</p>
  }
  if (note.suggested_client) {
    return (
      <>
        <p className="mt-2 text-sm text-muted">Suggested from the names in this note:</p>
        <p className="mt-1 break-words font-semibold">{note.suggested_client.name}</p>
        <p className="mt-2 text-xs text-muted">Confirming the client is coming soon.</p>
      </>
    )
  }
  if (note.match_candidates.length > 0) {
    return (
      <>
        <p className="mt-2 text-sm text-muted">This note could be about:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {note.match_candidates.map((c) => (
            <li key={c.id} className="break-words">
              {c.name}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Choosing the client is coming soon.</p>
      </>
    )
  }
  return <p className="mt-2 text-sm text-muted">No client in your list was mentioned.</p>
}
