const STATUS = {
  uploaded: { label: 'Uploaded', className: 'bg-neutral-tint text-neutral' },
  transcribing: { label: 'Transcribing', className: 'bg-warn-tint text-warn' },
  awaiting_transcript: { label: 'Needs transcript', className: 'bg-brand-tint text-brand-strong' },
  parsing: { label: 'Analyzing', className: 'bg-warn-tint text-warn' },
  ready: { label: 'Ready', className: 'bg-positive-tint text-positive' },
  failed: { label: 'Failed', className: 'bg-danger-tint text-danger' },
}

export function StatusChip({ status, className = '' }) {
  const { label, className: tone } = STATUS[status] ?? STATUS.uploaded
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone} ${className}`}>{label}</span>
}
