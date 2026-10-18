import { Link } from 'react-router'
import { LegalPage } from '../../components/Legal'
import { useDocumentTitle } from '../../hooks/useResource'
import { CONTACT_EMAIL, REPO_URL } from '../../lib/site'

export default function Terms() {
  useDocumentTitle('Terms of Service')

  return (
    <LegalPage
      title="Terms of Service"
      updated="18 October 2026"
      intro="Plain-language terms for using Voice Note CRM. It is a portfolio project run by one person, Fazal Abbas, offered free and as is. By creating an account or using the demo you agree to these terms."
    >
      <h2>Who can use it</h2>
      <ul>
        <li>Voice Note CRM is a business tool. You must be 18 or older to create an account or be added to one.</li>
        <li>
          Managers are responsible for who they add to their team and for deactivating people who leave. Your organization&apos;s data (clients,
          notes, call logs and tasks) is visible only to people in your organization.
        </li>
      </ul>

      <h2>Recording and client information</h2>
      <ul>
        <li>
          The app records your own spoken summary after a call, not the call itself. Don&apos;t use it to record other people without their
          consent, and don&apos;t upload recordings of calls you weren&apos;t allowed to make.
        </li>
        <li>
          You are responsible for following the laws and agreements that apply to you when you record, transcribe and summarise what was said in a
          conversation, and for only keeping client details you are allowed to keep. Remove them when you no longer need them.
        </li>
        <li>
          Audio and transcripts are sent to outside speech-to-text and language-model services to be processed. The{' '}
          <Link to="/privacy">Privacy Policy</Link> names them and explains how data on your device is handled, including recordings that are
          waiting to upload.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don&apos;t:</p>
      <ul>
        <li>upload anything unlawful, or anything you don&apos;t have the right to share;</li>
        <li>try to reach another organization&apos;s data, get around rate limits, or probe, overload or attack the service;</li>
        <li>use it to send spam or to process data about people for purposes they wouldn&apos;t expect;</li>
        <li>share your sign-in with someone else instead of adding them to your team.</li>
      </ul>
      <p>Accounts that break these rules may be suspended or deleted.</p>

      <h2>Your content</h2>
      <p>
        You own what you put in: your recordings, transcripts, client records, call logs and tasks. You give Voice Note CRM permission to store,
        process and display that content only to provide the service to you and your organization, including sending it to the processors named in
        the Privacy Policy. That permission ends when the content is deleted.
      </p>

      <h2>AI output can be wrong</h2>
      <p>
        Transcripts and summaries are produced automatically and can mishear names, miss details or get dates wrong. Nothing is saved as a call log
        until you have reviewed it, and you are responsible for checking it before you save it or act on it.
      </p>

      <h2>The demo</h2>
      <p>
        The demo organization is shared by everyone who tries it and contains made-up clients. Anything you add there can be seen and changed by
        other visitors, and voice notes and tasks created there are deleted after 24 hours. Don&apos;t enter real client information in the demo.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind. It may change, go down or be
        shut down at any time, and data may be lost. Keep your own copy of anything important.
      </p>

      <h2>Limit of liability</h2>
      <p>
        To the extent the law allows, Fazal Abbas is not liable for any indirect or consequential loss, lost profits or lost data arising from your
        use of Voice Note CRM, and total liability for any claim is limited to the amount you paid to use it, which is zero.
      </p>

      <h2>The code</h2>
      <p>
        The source code is published at <a href={REPO_URL}>github.com/fazal305/voice-note-crm</a> under the PolyForm Noncommercial License 1.0.0.
        You may use, study and modify it for noncommercial purposes. Commercial use needs a separate commercial license: email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If these terms change, the date at the top changes with them. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>&copy; 2026 Fazal Abbas. All rights reserved, except as granted by the code license above.</p>
    </LegalPage>
  )
}
