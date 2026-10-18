/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** "2026-10-20" → "Tue, Oct 20, 2026", read as a calendar day in local time (not UTC midnight). */
export function formatDay(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '')
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
