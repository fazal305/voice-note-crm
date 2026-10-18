import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ClientPicker } from '../../components/ClientPicker'
import { Alert, Button, Card, LinkButton, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { Waveform } from '../../components/Waveform'
import { MAX_RECORDING_SECONDS, useRecorder } from '../../hooks/useRecorder'
import { useDocumentTitle, useOnline, useResource } from '../../hooks/useResource'
import { api, errorMessage, fieldErrors } from '../../lib/api'
import { formatBytes, formatDay, formatDuration, localToday } from '../../lib/format'
import { isRetryable, QueueFullError, sendVoiceNote } from '../../lib/pendingUploads'
import { useUploadQueue } from '../../lib/uploadQueue'

const MAX_BYTES = 25 * 1024 * 1024
const UPLOAD_EXTENSIONS = ['mp3', 'wav', 'm4a']

function checkFile(file) {
  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : ''
  if (!UPLOAD_EXTENSIONS.includes(extension)) return 'Choose an .mp3, .wav or .m4a file.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_BYTES) return `That file is ${formatBytes(file.size)}. The limit is 25 MB.`
  return null
}

export default function Record() {
  useDocumentTitle('Record')
  const navigate = useNavigate()
  const [clip, setClip] = useState(null)
  const [recordError, setRecordError] = useState(null)
  const fileInputRef = useRef(null)
  // "Record a note for this client" links here with ?client=<id>; the note starts out filed under that client.
  const [params] = useSearchParams()
  const presetId = /^\d+$/.test(params.get('client') ?? '') ? params.get('client') : null
  const preset = useResource(
    (signal) => (presetId ? api.get(`/clients/${presetId}`, { signal }).then((res) => res.data.data) : Promise.resolve(null)),
    presetId ?? '',
  )

  const recorder = useRecorder({
    onRecorded: ({ blob, duration, extension }) => {
      if (blob.size > MAX_BYTES) {
        setRecordError(`That recording is ${formatBytes(blob.size)}, over the 25 MB limit. Please record a shorter note.`)
        return
      }
      setClip({ blob, name: `recording.${extension}`, source: 'recording', duration, url: URL.createObjectURL(blob) })
    },
  })

  useEffect(() => {
    if (!clip) return
    return () => URL.revokeObjectURL(clip.url)
  }, [clip])

  const startRecording = () => {
    setRecordError(null)
    recorder.start()
  }

  const chooseFile = (file) => {
    setRecordError(null)
    setClip({ blob: file, name: file.name, source: 'upload', duration: null, url: URL.createObjectURL(file) })
  }

  const liveMessage =
    recorder.status === 'recording'
      ? 'Recording started.'
      : recorder.status === 'requesting'
        ? 'Asking for microphone access.'
        : clip?.source === 'recording'
          ? `Recording stopped. ${formatDuration(clip.duration)} recorded. Review it below.`
          : ''

  return (
    <>
      <PageHeader title="Record a note" description="Tap once, talk through the call while it's fresh, then upload. You can also upload a recording you already have." />
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      {presetId && <PresetClient preset={preset} />}

      {clip ? (
        <Review
          key={preset.data?.id ?? 'none'}
          clip={clip}
          presetClient={preset.data}
          onDiscard={() => setClip(null)}
          onSaved={(note) => navigate(`/app/notes/${note.id}`)}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Recorder recorder={recorder} error={recordError} onStart={startRecording} onUseFile={() => fileInputRef.current?.focus()} />
          <FilePicker inputRef={fileInputRef} disabled={recorder.status === 'recording' || recorder.status === 'requesting'} onChoose={chooseFile} />
        </div>
      )}

      {!clip && <HomeSummary />}
    </>
  )
}

function PresetClient({ preset }) {
  if (preset.loading) return <p className="mb-4 text-sm text-muted">Loading client…</p>
  if (preset.error) {
    return (
      <Alert tone="warn" className="mb-4">
        We couldn&apos;t load that client ({preset.error}) You can still pick one after recording.
      </Alert>
    )
  }
  return (
    <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm" role="status">
      This note will be filed under <span className="font-semibold">{preset.data.name}</span>. You can change the client before uploading.
    </p>
  )
}

/** The rep's own snapshot: open and overdue tasks and the next follow-ups. Sits below the recorder, never above it. */
function HomeSummary() {
  const today = localToday()
  const summary = useResource((signal) => api.get('/me/summary', { params: { today }, signal }).then((res) => res.data), today)

  if (summary.loading) {
    return (
      <div aria-busy="true" className="mt-6">
        <span className="sr-only" role="status">
          Loading your summary…
        </span>
        {summary.slow && (
          <Alert tone="warn" className="mb-4">
            This is taking longer than usual. Your connection may be slow — we&apos;re still trying.
          </Alert>
        )}
        <Skeleton className="h-28" />
      </div>
    )
  }
  if (summary.error) {
    return (
      <Alert tone="error" className="mt-6">
        Couldn&apos;t load your tasks and follow-ups. {summary.error}{' '}
        <button type="button" className="font-semibold underline underline-offset-2" onClick={summary.reload}>
          Try again
        </button>
      </Alert>
    )
  }

  const data = summary.data
  return (
    <Card className="mt-6" aria-labelledby="home-summary-heading">
      <h2 id="home-summary-heading" className="text-2xl">
        Your week
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center sm:max-w-md sm:text-left">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Notes this week</dt>
          <dd className="text-2xl font-semibold">{data.notes_this_week}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Open tasks</dt>
          <dd className="text-2xl font-semibold">
            <Link to="/app/tasks?view=upcoming" className="text-brand underline underline-offset-2">
              {data.open_tasks}
              <span className="sr-only"> open tasks</span>
            </Link>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Overdue</dt>
          <dd className={`text-2xl font-semibold ${data.overdue_tasks > 0 ? 'text-danger' : ''}`}>
            <Link to="/app/tasks?view=overdue" className="underline underline-offset-2">
              {data.overdue_tasks}
              <span className="sr-only"> overdue tasks</span>
            </Link>
          </dd>
        </div>
      </dl>
      <h3 className="mt-5 font-sans text-sm font-semibold">Next follow-ups</h3>
      {data.next_follow_ups.length ? (
        <ul className="mt-1 divide-y divide-line">
          {data.next_follow_ups.map((f, i) => (
            <li key={`${f.date}-${f.client?.id ?? 'none'}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
              {f.client ? (
                <Link to={`/app/clients/${f.client.id}`} className="min-w-0 break-words font-semibold text-brand underline underline-offset-2">
                  {f.client.name}
                </Link>
              ) : (
                <span className="font-semibold">A deleted client</span>
              )}
              <span className="text-muted">
                <time dateTime={f.date}>{formatDay(f.date)}</time>
                {f.phrase && <> · “{f.phrase}”</>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">No follow-ups scheduled. Dates mentioned on your calls show up here.</p>
      )}
    </Card>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}

function Recorder({ recorder, error, onStart, onUseFile }) {
  const { status, elapsed, analyser, stop } = recorder
  const recording = status === 'recording'
  const requesting = status === 'requesting'
  const blocked = status === 'unsupported'

  return (
    <Card className="flex flex-col items-center p-6 text-center sm:p-8">
      <div className="relative mt-2">
        {recording && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-accent/40 motion-safe:animate-ping" />}
        <button
          type="button"
          onClick={recording ? stop : onStart}
          disabled={requesting || blocked}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          className="relative flex size-28 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:size-32"
        >
          {requesting ? <Spinner /> : recording ? <span aria-hidden="true" className="size-9 rounded-md bg-white" /> : <MicIcon />}
        </button>
      </div>

      <p className="mt-5 font-display text-4xl tabular-nums" role="timer" aria-label="Recording time">
        {formatDuration(elapsed)}
      </p>
      <p className="mt-1 text-sm text-muted">
        {recording
          ? `Recording · tap the button to stop (up to ${formatDuration(MAX_RECORDING_SECONDS)})`
          : requesting
            ? 'Allow microphone access in the prompt to start.'
            : 'Tap to start recording'}
      </p>

      <div className="mt-6 w-full">
        <Waveform analyser={analyser} />
      </div>

      <MicStatus status={status} onRetry={onStart} onUseFile={onUseFile} />
      {error && (
        <Alert tone="error" className="mt-4 w-full text-left">
          {error}
        </Alert>
      )}
    </Card>
  )
}

function MicStatus({ status, onRetry, onUseFile }) {
  const useFile = (
    <button type="button" onClick={onUseFile} className="font-semibold underline underline-offset-2">
      upload a file instead
    </button>
  )

  if (status === 'denied') {
    return (
      <Alert tone="warn" title="Microphone access is blocked" className="mt-6 w-full text-left">
        <p>
          To turn it back on, open the site settings from the icon next to the address bar, set Microphone to Allow, then reload this page. On iPhone or
          iPad, also check Settings › your browser › Microphone.
        </p>
        <p className="mt-2">
          <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
            Try again
          </button>{' '}
          or {useFile}.
        </p>
      </Alert>
    )
  }
  if (status === 'unsupported') {
    const insecure = typeof window !== 'undefined' && !window.isSecureContext
    return (
      <Alert tone="warn" title="Recording isn't available here" className="mt-6 w-full text-left">
        {insecure
          ? 'Recording needs a secure (https) connection. '
          : "This browser can't record audio. A recent Chrome, Edge, Firefox or Safari can. "}
        You can still {useFile}.
      </Alert>
    )
  }
  if (status === 'nomic') {
    return (
      <Alert tone="warn" title="No microphone found" className="mt-6 w-full text-left">
        Connect a microphone or check it&apos;s switched on, then{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          try again
        </button>
        . Or {useFile}.
      </Alert>
    )
  }
  if (status === 'busy') {
    return (
      <Alert tone="warn" title="Microphone is busy" className="mt-6 w-full text-left">
        Another app may be using it. Close that app, then{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          try again
        </button>
        .
      </Alert>
    )
  }
  if (status === 'error') {
    return (
      <Alert tone="error" className="mt-6 w-full text-left">
        Recording stopped unexpectedly. Please{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          try again
        </button>{' '}
        or {useFile}.
      </Alert>
    )
  }
  return null
}

function FilePicker({ inputRef, disabled, onChoose }) {
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)

  const take = (file) => {
    if (!file) return
    const problem = checkFile(file)
    setError(problem)
    if (!problem) onChoose(file)
  }

  return (
    <Card className="flex flex-col">
      <h2 className="text-2xl">Upload a recording</h2>
      <p className="mt-1 text-sm text-muted">.mp3, .wav or .m4a, up to 25 MB.</p>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) take(e.dataTransfer.files?.[0])
        }}
        className={`mt-4 flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${
          dragging ? 'border-brand bg-brand-tint' : error ? 'border-danger' : 'border-line-strong hover:bg-sunken/60'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <svg viewBox="0 0 24 24" className="size-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
        </svg>
        <span className="font-semibold text-brand">Choose a file</span>
        <span className="hidden text-muted lg:inline">or drag it here</span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept=".mp3,.wav,.m4a,audio/*"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  )
}

const SLOW_UPLOAD_BYTES_PER_SECOND = 24 * 1024

function Review({ clip, presetClient, onDiscard, onSaved }) {
  const queue = useUploadQueue()
  const online = useOnline()
  // One id per clip: a retry of this same note (now or from the device queue) never creates a second one.
  const [clientUploadId] = useState(() => crypto.randomUUID())
  const [clientId, setClientId] = useState(presetClient ? String(presetClient.id) : '')
  const [clientName, setClientName] = useState(presetClient?.name ?? null)
  const [measured, setMeasured] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [slow, setSlow] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [saved, setSaved] = useState(false)
  const duration = clip.duration ?? measured

  const saveOnDevice = async () => {
    try {
      await queue.enqueue({
        id: clientUploadId,
        blob: clip.blob,
        mime: clip.blob.type,
        source: clip.source,
        durationSeconds: duration != null && Number.isFinite(duration) ? Math.round(duration) : null,
        clientId: clientId || null,
        clientName: clientId ? clientName : null,
        originalName: clip.name,
      })
      setSaved(true)
    } catch (err) {
      setMessage(
        err instanceof QueueFullError
          ? err.message
          : "We couldn't upload the note or save it on this device. Keep this page open and try again when you're back online.",
      )
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    setBusy(true)
    setProgress(0)
    setSlow(false)
    setErrors({})
    setMessage(null)
    if (navigator.onLine === false) {
      await saveOnDevice()
      return
    }
    const startedAt = performance.now()
    let loaded = 0
    // Checked on a timer too, so a stalled upload that sends no progress events still counts as slow.
    const watch = setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000
      if (seconds > 6 && loaded / seconds < SLOW_UPLOAD_BYTES_PER_SECOND) setSlow(true)
    }, 2000)
    try {
      const res = await sendVoiceNote(
        { blob: clip.blob, name: clip.name, source: clip.source, clientId, durationSeconds: duration, clientUploadId },
        {
          onUploadProgress: (e) => {
            loaded = e.loaded
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
          },
        },
      )
      onSaved(res.data.data)
    } catch (err) {
      // Network errors, timeouts and server errors go to the device queue; refusals (422, 429…) show here as before.
      if (isRetryable(err)) {
        await saveOnDevice()
        return
      }
      const fields = fieldErrors(err)
      setErrors(fields)
      setMessage(fields.audio || fields.source || fields.duration_seconds || (fields.client_id ? null : errorMessage(err)))
      setBusy(false)
    } finally {
      clearInterval(watch)
    }
  }

  if (saved) {
    const waiting = queue.entries.length
    return (
      <Card className="p-6 sm:p-8">
        <Alert tone="success" title="Saved on this device — we'll upload it when you're back online">
          {waiting > 1 ? `${waiting} notes are waiting to upload.` : 'It uploads by itself as soon as the connection is back.'}
        </Alert>
        {!queue.persistent && (
          <Alert tone="warn" className="mt-4">
            This browser won&apos;t let us store the note on the device, so it&apos;s only kept until you close or reload this tab.
          </Alert>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onDiscard}>Record another note</Button>
          <LinkButton variant="secondary" to="/app/notes">
            See notes waiting to upload
          </LinkButton>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-3xl">{clip.source === 'recording' ? 'Review your recording' : 'Review your file'}</h2>
      <p className="mt-1 truncate text-sm text-muted">
        {clip.source === 'upload' && <>{clip.name} · </>}
        {formatBytes(clip.blob.size)}
        {duration != null && Number.isFinite(duration) && <> · {formatDuration(duration)}</>}
      </p>
      <audio
        controls
        src={clip.url}
        className="mt-4 w-full"
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setMeasured(e.currentTarget.duration)
        }}
      >
        Your browser can&apos;t play this preview, but you can still upload it.
      </audio>

      <div className="mt-6">
        <ClientPicker
          value={clientId}
          onChange={(value, client) => {
            setClientId(value)
            setClientName(client?.name ?? null)
          }}
          selected={presetClient}
          error={errors.client_id}
          disabled={busy}
        />
      </div>

      {message && (
        <Alert tone="error" className="mt-6">
          {message}
        </Alert>
      )}

      {busy && (
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <span>Uploading…</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          {slow && (
            <p className="mt-2 text-sm text-warn" role="status">
              Your connection seems slow. The upload keeps going, and if it drops the note is saved on this device.
            </p>
          )}
        </div>
      )}

      {!online && !busy && (
        <p className="mt-6 text-sm text-muted" role="status">
          You&apos;re offline. The note will be saved on this device and upload by itself when you&apos;re back online.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button busy={busy} onClick={upload}>
          {online ? 'Upload note' : 'Save to upload later'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </Card>
  )
}
