import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { StatusChip } from '../../components/StatusChip'
import { Alert, Button, Card, ConfirmDialog, EmptyState, LinkButton, LoadState, PageHeader, Toast } from '../../components/ui'
import { useDocumentTitle, useOnline, useResource } from '../../hooks/useResource'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatBytes, formatDate, formatDuration } from '../../lib/format'
import { useUploadQueue } from '../../lib/uploadQueue'

export default function Notes() {
  useDocumentTitle('Notes')
  const { user } = useAuth()
  const notes = useResource((signal) => api.get('/voice-notes', { signal }).then((res) => res.data))
  const [toast, setToast] = useState(null)
  const clearToast = useCallback(() => setToast(null), [])

  // Notes the device queue just uploaded belong in the list below.
  const { uploadedVersion } = useUploadQueue()
  const seenVersion = useRef(uploadedVersion)
  const { reload } = notes
  useEffect(() => {
    if (uploadedVersion === seenVersion.current) return
    seenVersion.current = uploadedVersion
    reload()
  }, [uploadedVersion, reload])

  return (
    <>
      <PageHeader
        title="Notes"
        description={user?.role === 'manager' ? 'Voice notes from everyone in your organization, newest first.' : 'Your voice notes, newest first.'}
        action={<LinkButton to="/app/record">Record a note</LinkButton>}
      />
      <PendingUploads />
      <LoadState resource={notes} label="Loading notes">
        {(page) => <NoteList first={page} onDeleted={() => setToast('Note deleted.')} />}
      </LoadState>
      <Toast message={toast} onDone={clearToast} />
    </>
  )
}

function NoteList({ first, onDeleted }) {
  const [items, setItems] = useState(first.data)
  const [meta, setMeta] = useState(first.meta)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (items.length === 0) {
    return (
      <EmptyState title="No notes yet" action={<LinkButton to="/app/record">Record your first note</LinkButton>}>
        Record a quick note after your next call, or upload one you already have.
      </EmptyState>
    )
  }

  const loadMore = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.get('/voice-notes', { params: { page: meta.current_page + 1 } })
      setItems((prev) => [...prev, ...res.data.data.filter((note) => !prev.some((p) => p.id === note.id))])
      setMeta(res.data.meta)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-3 text-sm text-muted" role="status">
        {meta.total} {meta.total === 1 ? 'note' : 'notes'}
      </p>
      <ul className="space-y-3">
        {items.map((note) => (
          <Note
            key={note.id}
            note={note}
            onDeleted={() => {
              setItems((prev) => prev.filter((n) => n.id !== note.id))
              setMeta((m) => ({ ...m, total: m.total - 1 }))
              onDeleted()
            }}
          />
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

function Note({ note, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const title = note.original_name || (note.source === 'recording' ? 'Recording' : 'Uploaded file')
  const duration = formatDuration(note.duration_seconds)

  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      await api.delete(`/voice-notes/${note.id}`)
      setConfirming(false)
      onDeleted()
    } catch (err) {
      setConfirming(false)
      setDeleting(false)
      setError(errorMessage(err))
    }
  }

  return (
    <li className="min-w-0 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            <Link to={`/app/notes/${note.id}`} className="underline-offset-2 hover:underline">
              {title}
            </Link>
          </p>
          <p className="text-sm text-muted">
            {note.client ? note.client.name : 'No client yet'}
            {!note.owner.is_you && <> · by {note.owner.name}</>}
          </p>
          <p className="text-sm text-muted">
            <time dateTime={note.created_at}>{formatDate(note.created_at)}</time>
            {duration && <> · {duration}</>} · {formatBytes(note.size_bytes)}
          </p>
        </div>
        <StatusChip status={note.status} />
      </div>
      {note.status === 'failed' && note.error && <p className="mt-2 text-sm text-danger">{note.error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Player note={note} title={title} />
        <Button variant="ghost" className="min-h-9 text-danger" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
      <ConfirmDialog open={confirming} title="Delete this note?" confirmLabel="Delete note" busy={deleting} onConfirm={remove} onCancel={() => setConfirming(false)}>
        The recording will be permanently removed. This can&apos;t be undone.
      </ConfirmDialog>
    </li>
  )
}

/** Fetches the audio through the authenticated API only when asked, and frees it on unmount. */
function Player({ note, title }) {
  const [state, setState] = useState({ url: null, loading: false, error: null })

  useEffect(() => {
    if (!state.url) return
    return () => URL.revokeObjectURL(state.url)
  }, [state.url])

  const load = async () => {
    setState({ url: null, loading: true, error: null })
    try {
      const res = await api.get(`/voice-notes/${note.id}/audio`, { responseType: 'blob', timeout: 2 * 60 * 1000 })
      setState({ url: URL.createObjectURL(res.data), loading: false, error: null })
    } catch (err) {
      // A blob response hides the JSON error body, so fall back to the status-based message.
      setState({ url: null, loading: false, error: errorMessage(err, "Couldn't load the audio. Please try again.") })
    }
  }

  if (state.url) {
    return (
      <audio controls autoPlay src={state.url} aria-label={`Play ${title}`} className="w-full sm:w-80">
        Your browser can&apos;t play this audio.
      </audio>
    )
  }

  return (
    <>
      <Button variant="secondary" className="min-h-9" busy={state.loading} onClick={load} aria-label={`Play ${title}`}>
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" />
        </svg>
        Play
      </Button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
    </>
  )
}

const PENDING_STATUS = {
  waiting: { label: 'Waiting', className: 'bg-neutral-tint text-neutral' },
  uploading: { label: 'Uploading', className: 'bg-warn-tint text-warn' },
  failed: { label: 'Failed', className: 'bg-danger-tint text-danger' },
}

/** Notes saved on this device because they couldn't upload yet. Only the signed-in user's are listed. */
function PendingUploads() {
  const queue = useUploadQueue()
  const online = useOnline()
  if (!queue.entries.length) return null

  return (
    <Card className="mb-8" aria-labelledby="pending-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="pending-heading" className="text-2xl">
          Waiting to upload
        </h2>
        <span className="text-sm text-muted">{queue.entries.length} on this device</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {online
          ? 'These upload by themselves, oldest first. Keep this browser open to let them finish.'
          : "You're offline. These upload by themselves when your connection is back."}
      </p>
      {!queue.persistent && (
        <Alert tone="warn" className="mt-3">
          This browser won&apos;t let us store notes on the device, so these are only kept until you close or reload this tab.
        </Alert>
      )}
      <ul className="mt-3 divide-y divide-line">
        {queue.entries.map((entry) => (
          <PendingEntry key={entry.id} entry={entry} uploading={queue.uploadingId === entry.id} online={online} />
        ))}
      </ul>
    </Card>
  )
}

function PendingEntry({ entry, uploading, online }) {
  const queue = useUploadQueue()
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState(null)
  const [url, setUrl] = useState(null)
  const status = uploading ? 'uploading' : entry.status
  const chip = PENDING_STATUS[status] ?? PENDING_STATUS.waiting
  const title = entry.source === 'upload' && entry.originalName ? entry.originalName : 'Recording'
  const duration = formatDuration(entry.durationSeconds)

  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  const retry = async () => {
    setNotice(null)
    const started = await queue.retryNow(entry.id)
    if (!started) setNotice("You're offline. It will upload when your connection is back.")
  }

  return (
    <li className="min-w-0 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="text-sm text-muted">{entry.clientName || 'No client yet'}</p>
          <p className="text-sm text-muted">
            Saved <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
            {duration && <> · {duration}</>} · {formatBytes(entry.blob?.size ?? 0)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
      </div>
      {entry.status === 'failed' && entry.lastError && (
        <p className="mt-2 text-sm text-danger">
          The server didn&apos;t accept this note: {entry.lastError}
        </p>
      )}
      {entry.status === 'waiting' && entry.lastError && !uploading && (
        <p className="mt-2 text-sm text-muted">
          Last try: {entry.lastError} We&apos;ll try again automatically.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {url ? (
          <audio controls autoPlay src={url} aria-label={`Play ${title}`} className="w-full sm:w-80">
            Your browser can&apos;t play this audio.
          </audio>
        ) : (
          <Button variant="secondary" className="min-h-9" onClick={() => setUrl(URL.createObjectURL(entry.blob))} aria-label={`Play ${title}`}>
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
            Play
          </Button>
        )}
        <Button variant="secondary" className="min-h-9" busy={uploading} disabled={!online && !uploading} onClick={retry}>
          Retry now
        </Button>
        <Button variant="ghost" className="min-h-9 text-danger" onClick={() => setConfirming(true)}>
          Discard
        </Button>
      </div>
      {notice && (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title="Discard this note?"
        confirmLabel="Discard note"
        onConfirm={async () => {
          setConfirming(false)
          await queue.discard(entry.id)
        }}
        onCancel={() => setConfirming(false)}
      >
        It hasn&apos;t uploaded, so this is the only copy. Discarding removes it from this device for good.
      </ConfirmDialog>
    </li>
  )
}
