import { useEffect, useRef, useState } from 'react'

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Live waveform from an AnalyserNode; a plain level meter instead when the user prefers reduced motion. */
export function Waveform({ analyser }) {
  const reduced = usePrefersReducedMotion()
  if (!analyser) return <div aria-hidden="true" className="h-20 w-full rounded-card border border-dashed border-line-strong" />
  return reduced ? <LevelMeter analyser={analyser} /> : <WaveCanvas analyser={analyser} />
}

function WaveCanvas({ analyser }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const samples = new Uint8Array(analyser.fftSize)
    const color = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-ink').trim() || '#b23c24'
    let frame = 0

    const draw = () => {
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth * ratio
      const height = canvas.clientHeight * ratio
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      analyser.getByteTimeDomainData(samples)
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 2 * ratio
      ctx.strokeStyle = color
      ctx.beginPath()
      const step = width / (samples.length - 1)
      for (let i = 0; i < samples.length; i++) {
        const y = (samples[i] / 255) * height
        if (i === 0) ctx.moveTo(0, y)
        else ctx.lineTo(i * step, y)
      }
      ctx.stroke()
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser])

  return <canvas ref={canvasRef} aria-hidden="true" className="h-20 w-full rounded-card border border-line bg-surface" />
}

function LevelMeter({ analyser }) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    const samples = new Uint8Array(analyser.fftSize)
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const value of samples) sum += ((value - 128) / 128) ** 2
      setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4))
    }, 250)
    return () => clearInterval(timer)
  }, [analyser])

  return (
    <div aria-hidden="true" className="flex h-20 w-full items-center rounded-card border border-line bg-surface px-4">
      <div className="h-3 w-full overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent-ink" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
    </div>
  )
}
