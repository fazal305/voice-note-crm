import { useOnline } from '../hooks/useResource'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="bg-ink px-4 py-2 text-center text-sm text-paper">
      You&apos;re offline. You can keep recording: notes are saved on this device and upload when your connection is back. Other changes can&apos;t be
      saved until then.
    </div>
  )
}
