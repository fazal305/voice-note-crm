import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-11 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:cursor-not-allowed'

const buttonVariants = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:brightness-95',
}

export function Button({ variant = 'primary', busy = false, className = '', children, onClick, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
      aria-disabled={busy || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      {...props}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

export function LinkButton({ variant = 'primary', className = '', ...props }) {
  return <Link className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />
}

export function Spinner() {
  return <span aria-hidden="true" className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
}

const alertTones = {
  error: 'border-danger/30 bg-danger-tint text-danger',
  warn: 'border-warn/30 bg-warn-tint text-warn',
  success: 'border-positive/30 bg-positive-tint text-positive',
  info: 'border-line-strong bg-surface text-ink',
}

export function Alert({ tone = 'info', title, children, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${alertTones[tone]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  )
}

/** Polite live region that shows `message` briefly. `onDone` must be stable. */
export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDone, 4000)
    return () => clearTimeout(timer)
  }, [message, onDone])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6"
    >
      {message && <p className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-lg">{message}</p>}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />
}

/** Renders loading (skeleton), slow-network, and error states around a resource. */
export function LoadState({ resource, label = 'Loading', rows = 3, children }) {
  if (resource.loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only" role="status">
          {label}…
        </span>
        {resource.slow && (
          <Alert tone="warn" className="mb-4">
            This is taking longer than usual. Your connection may be slow — we&apos;re still trying.
          </Alert>
        )}
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />
  return children(resource.data)
}

export function ErrorState({ title = "Couldn't load this", message, onRetry }) {
  return (
    <div role="alert" className="rounded-card border border-line bg-surface px-6 py-10 text-center">
      <p className="font-display text-2xl">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      <p className="font-display text-2xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-4xl sm:text-5xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface p-5 ${className}`} {...props}>
      {children}
    </section>
  )
}

const inputBase =
  'mt-1.5 block w-full min-w-0 rounded-lg border bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-brand'

/** Labelled input or textarea with an inline error tied to it via aria-describedby. */
export function Field({ label, error, hint, multiline = false, className = '', ...props }) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const Input = multiline ? 'textarea' : 'input'
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      )}
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${inputBase} ${error ? 'border-danger' : 'border-line-strong'} ${multiline ? 'min-h-28' : ''}`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Checkbox({ error, children, ...props }) {
  const id = useId()
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-brand"
          {...props}
        />
        <label htmlFor={id} className="text-sm leading-snug">
          {children}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 pl-8 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', busy, onConfirm, onCancel }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
      aria-labelledby="confirm-title"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-2xl">
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
