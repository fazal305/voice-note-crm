import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_RECORDING_SECONDS = 20 * 60

// Chrome and Firefox record WebM/Opus, Safari MP4/AAC. The API accepts each of these for recordings.
const TYPES = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'mp4'],
  ['audio/ogg;codecs=opus', 'ogg'],
  ['audio/ogg', 'ogg'],
]

function extensionFor(mimeType) {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function supportStatus() {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') return 'unsupported'
  return 'idle'
}

/**
 * Microphone recording with a live analyser for the waveform.
 * status: idle | requesting | recording | denied | nomic | busy | unsupported | error
 * Everything (recorder, animation frames, AudioContext, mic tracks) is released on stop and on unmount.
 */
export function useRecorder({ onRecorded }) {
  const [status, setStatus] = useState(supportStatus)
  const [elapsed, setElapsed] = useState(0)
  const [analyser, setAnalyser] = useState(null)
  const live = useRef({})
  const onRecordedRef = useRef(onRecorded)
  useEffect(() => {
    onRecordedRef.current = onRecorded
  })

  const release = useCallback(() => {
    const { stream, context, timer } = live.current
    clearInterval(timer)
    stream?.getTracks().forEach((track) => track.stop())
    if (context && context.state !== 'closed') context.close().catch(() => {})
    live.current = {}
    setAnalyser(null)
  }, [])

  // Shows the denied state up front when the browser already knows the answer, without prompting.
  useEffect(() => {
    if (supportStatus() !== 'idle' || !navigator.permissions?.query) return
    let permission
    let active = true
    const sync = () =>
      setStatus((s) => {
        if (permission.state === 'denied') return s === 'idle' ? 'denied' : s
        return s === 'denied' ? 'idle' : s
      })
    navigator.permissions
      .query({ name: 'microphone' })
      .then((result) => {
        if (!active) return
        permission = result
        sync()
        permission.addEventListener('change', sync)
      })
      .catch(() => {})
    return () => {
      active = false
      permission?.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => () => {
    const { recorder } = live.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    release()
  }, [release])

  const stop = useCallback(() => {
    const { recorder } = live.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const start = useCallback(async () => {
    if (supportStatus() === 'unsupported') {
      setStatus('unsupported')
      return
    }
    setStatus('requesting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (err) {
      const name = err?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('nomic')
      else if (name === 'NotReadableError' || name === 'AbortError') setStatus('busy')
      else setStatus('error')
      return
    }

    try {
      const [mimeType] = TYPES.find(([type]) => MediaRecorder.isTypeSupported(type)) ?? ['']
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 })
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const context = new AudioContextClass()
      const node = context.createAnalyser()
      node.fftSize = 2048
      context.createMediaStreamSource(stream).connect(node)

      const chunks = []
      const startedAt = performance.now()
      const seconds = () => (performance.now() - startedAt) / 1000
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const duration = seconds()
        release()
        setStatus('idle')
        setElapsed(0)
        const blob = new Blob(chunks, { type })
        if (blob.size === 0) {
          setStatus('error')
          return
        }
        onRecordedRef.current({ blob, duration, extension: extensionFor(type) })
      }
      recorder.onerror = () => {
        release()
        setStatus('error')
      }

      const timer = setInterval(() => {
        const s = seconds()
        setElapsed(s)
        if (s >= MAX_RECORDING_SECONDS && recorder.state !== 'inactive') recorder.stop()
      }, 250)

      live.current = { stream, context, recorder, timer }
      recorder.start(1000)
      setElapsed(0)
      setAnalyser(node)
      setStatus('recording')
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      release()
      setStatus('error')
    }
  }, [release])

  return { status, elapsed, analyser, start, stop }
}
