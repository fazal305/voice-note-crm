import { useDocumentTitle } from '../../hooks/useResource'

export default function Terms() {
  useDocumentTitle('Terms')

  return (
    <article className="mx-auto max-w-2xl px-4 py-12 leading-relaxed sm:py-16">
      <h1 className="text-5xl text-brand">Terms</h1>
      <p className="mt-6 text-muted">Plain-language terms for using Voice Note CRM.</p>
      <ul className="mt-6 list-disc space-y-3 pl-5">
        <li>You must be 18 or older to create an account or be added to one.</li>
        <li>Your organization&apos;s data (clients, notes and team members) is visible only to people in your organization.</li>
        <li>Only add client details you are allowed to keep, and remove them when you no longer need them.</li>
        <li>Managers are responsible for who they add to their team and for deactivating people who leave.</li>
        <li>The demo organization is shared and contains made-up data. Don&apos;t enter real client information there.</li>
        <li>The service is provided as is while it is being built, and features may change.</li>
      </ul>
    </article>
  )
}
