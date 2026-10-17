import { useOnline } from '../hooks/useResource'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="bg-ink px-4 py-2 text-center text-sm text-paper">
      You&apos;re offline. Changes can&apos;t be saved until your connection is back.
    </div>
  )
}
