export function LogoMark({ className = 'size-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      <path d="M9 6v20" stroke="var(--color-accent)" strokeWidth="1.5" />
      <rect x="15" y="7" width="6" height="11" rx="3" fill="var(--color-paper)" />
      <path d="M12.5 15a5.5 5.5 0 0 0 11 0M18 20.5V24m-3 0h6" fill="none" stroke="var(--color-paper)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-2xl leading-none text-brand">Voice Note CRM</span>
    </span>
  )
}
