import { Link } from 'react-router'
import { LegalPage } from '../../components/Legal'
import { useDocumentTitle } from '../../hooks/useResource'
import { CONTACT_EMAIL } from '../../lib/site'

export default function Privacy() {
  useDocumentTitle('Privacy Policy')

  return (
    <LegalPage
      title="Privacy Policy"
      updated="18 October 2026"
      intro="What Voice Note CRM keeps about you and your clients, where it goes, and how to get it removed. Voice Note CRM is a portfolio project run by one person, Fazal Abbas, not a company with a support team, so please don't use it for real client work."
    >
      <h2>Who runs this</h2>
      <p>
        Voice Note CRM is built and operated by Fazal Abbas. For anything about your data, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What the app records (and what it doesn&apos;t)</h2>
      <p>
        Voice Note CRM does not record phone or video calls. It records you: the short debrief you speak into your own microphone after a call,
        or an audio file you choose to upload. If what you dictate includes things a client told you, you are responsible for being allowed to
        keep and summarise that information under the laws and agreements that apply to you and your client.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your name, email address, role (manager or rep), your organization&apos;s name and your password, which
          is stored only as a one-way hash.
        </li>
        <li>
          <strong>Client records you enter:</strong> names, company, email, phone and any notes your team types in.
        </li>
        <li>
          <strong>Voice notes:</strong> the audio, its file name, length and size.
        </li>
        <li>
          <strong>What is made from them:</strong> the transcript, the AI-extracted fields (summary, sentiment, action items, follow-up date and
          suggested client), the call logs you save, and the tasks created from them.
        </li>
        <li>
          <strong>Organization settings:</strong> a manager&apos;s custom instructions for the summarising model, if they write any.
        </li>
      </ul>
      <p>We use this only to run the app for your organization: to show your notes, logs, tasks and dashboard to the people in it.</p>

      <h2>How it is stored</h2>
      <ul>
        <li>Everything lives in a PostgreSQL database and a private storage bucket, both hosted by Supabase.</li>
        <li>
          Audio is encrypted by the app with AES-256-GCM before it is stored, and decrypted only when someone in your organization plays it.
        </li>
        <li>
          Transcripts, AI-extracted fields, call log summaries and task titles are encrypted by the app before they are written to the database.
        </li>
        <li>
          Client details, people's names, sentiment labels and dates are stored as entered (Supabase encrypts its disks, but the app adds no extra layer for these fields).
        </li>
        <li>Each organization&apos;s data is visible only to signed-in members of that organization. Reps see their own notes; managers see the team&apos;s.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <p>When speech-to-text and the language model are enabled, your data is sent to these services to turn speech into a call log:</p>
      <ul>
        <li>
          <strong>Speech to text — Groq.</strong> The audio of each voice note is sent to Groq&apos;s Whisper transcription API, which returns the
          transcript.
        </li>
        <li>
          <strong>Summaries — OpenRouter.</strong> The transcript (with the recording date and any custom instructions your manager wrote) is sent
          through OpenRouter to a language model, which returns the summary and other fields. Your client list is not sent: matching a note to a
          client happens on our own server. OpenRouter passes
          the request to whichever provider hosts the chosen model. The demo uses a free model; free models can come with provider terms that let
          them log prompts, which is another reason not to put real client details in.
        </li>
      </ul>
      <p>
        Whoever runs a copy of this app can point it at any other OpenAI-compatible speech or language API instead, or turn either off. When
        transcription is off you type the transcript yourself; when the model is off, notes are summarised by simple rules on the server and
        nothing leaves it.
      </p>
      <p>The app is hosted by:</p>
      <ul>
        <li>
          <strong>Vercel</strong> for the web app you are reading,
        </li>
        <li>
          <strong>Render</strong> for the API that does the work,
        </li>
        <li>
          <strong>Supabase</strong> for the database and audio storage.
        </li>
      </ul>
      <p>We don&apos;t sell your data or share it with anyone else.</p>

      <h2>IP addresses and logs</h2>
      <p>
        The app uses your IP address only to rate-limit sign-in, the demo, uploads and reprocessing, so one visitor can&apos;t run up costs or guess
        passwords. It keeps a hashed form of the address as a short-lived counter that expires within a day. It is not saved with your account, in
        your notes, or in the app&apos;s own logs. Vercel and Render keep their own short-term request logs, which include IP addresses, under their
        own privacy policies.
      </p>

      <h2 id="storage">Cookies and storage on your device</h2>
      <p>The app sets no cookies. There are no analytics, ads, trackers or session recordings, so there is no cookie banner: nothing to consent to.</p>
      <p>It does keep a few things in your browser so it works:</p>
      <ul>
        <li>
          <strong>Your sign-in token</strong> in local storage, so you stay signed in. It expires after 7 days and is removed when you sign out.
        </li>
        <li>
          <strong>Recordings waiting to upload.</strong> If a note can&apos;t upload because the connection dropped, its audio is kept unencrypted in this
          browser&apos;s storage (IndexedDB) on your device until it uploads, and only for the account that recorded it. Signing out lets you discard
          it. Once uploaded, it is stored encrypted on the server and removed from the device.
        </li>
        <li>
          <strong>A small note</strong> in local storage that stops two open tabs from uploading the same recording at once.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>The demo:</strong> the shared demo organization is cleaned up automatically. Voice notes (with their audio, transcripts and call
          logs) and tasks created there are deleted 24 hours after they were made. Its sample clients are shared by everyone trying the demo and
          anyone can change them.
        </li>
        <li>
          <strong>Your own organization:</strong> kept until you delete it. You can delete voice notes and clients in the app; deleting a note
          deletes its audio. Managers can deactivate reps, which signs them out everywhere.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of the data held about you, ask for it to be corrected, or ask for your account or your whole organization to be
        deleted. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address on the account and it will be handled by hand,
        usually within a week.
      </p>

      <h2>Age</h2>
      <p>Voice Note CRM is a business tool for adults. You must be 18 or older to use it.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top changes with it. See also the <Link to="/terms">Terms of Service</Link> and the{' '}
        <Link to="/faq">FAQ</Link>.
      </p>
    </LegalPage>
  )
}
