import { Link } from 'react-router'
import { LegalPage } from '../../components/Legal'
import { useDocumentTitle } from '../../hooks/useResource'
import { CONTACT_EMAIL } from '../../lib/site'

const QUESTIONS = [
  {
    q: 'What does Voice Note CRM do?',
    a: (
      <>
        After a client call, you record a short spoken debrief. The app turns it into a transcript (or you paste one in), drafts a call log
        (summary, client sentiment, action items and a follow-up date) and suggests which client it was about. You check the draft, fix anything, and save it. Action items and follow-ups
        become tasks, and each client gets a timeline of past calls.
      </>
    ),
  },
  {
    q: 'Does it record my phone calls?',
    a: (
      <>
        No. It never listens to the call. It records only what you say into your own microphone afterwards, or an audio file you choose to upload.
      </>
    ),
  },
  {
    q: 'Which audio formats can I use, and how big can a file be?',
    a: (
      <>
        Recording in the browser works in current Chrome, Edge, Firefox and Safari. You can also upload MP3, WAV or M4A files. Each note can be up to
        25 MB, which is about 50 minutes of speech at the quality the in-browser recorder uses.
      </>
    ),
  },
  {
    q: 'What happens if I lose signal while recording?',
    a: (
      <>
        Keep going. If a note can&apos;t upload, it is saved in your browser on this device and uploads by itself when the connection is back. The
        Notes page shows what is still waiting. Until it uploads, that audio is stored unencrypted on your device; see{' '}
        <Link to="/privacy#storage">storage on your device</Link>.
      </>
    ),
  },
  {
    q: 'Where does my data go?',
    a: (
      <>
        When transcription is turned on, audio is sent to Groq for speech-to-text and the transcript to an OpenRouter model for the summary. If
        a server doesn&apos;t have those configured, you paste or type the transcript and a simpler rule-based parser fills in the fields
        without calling an outside model. Everything is stored
        in a Supabase database and storage bucket, with audio, transcripts and summaries encrypted. The <Link to="/privacy">Privacy Policy</Link>{' '}
        has the details.
      </>
    ),
  },
  {
    q: 'How accurate are the summaries?',
    a: (
      <>
        Usually close, but not perfect: names, numbers and dates are the most common mistakes, and a noisy recording makes things worse. That is why
        nothing becomes a call log until you have read the draft, fixed what it got wrong, and saved it. The transcript is shown next to the
        draft so you can check it against what you said.
      </>
    ),
  },
  {
    q: 'How do roles work?',
    a: (
      <>
        Whoever creates the account is the manager. Managers add reps, see the whole team&apos;s notes, tasks and dashboard, and can set custom
        instructions for how notes are summarised. Reps record notes and see their own notes, logs and tasks, plus the shared client list.
      </>
    ),
  },
  {
    q: 'Is the demo reset?',
    a: (
      <>
        Yes. The demo organization is shared by everyone who tries it and uses made-up clients. Voice notes and tasks created there are deleted after
        24 hours, and some changes (like adding reps or editing the summary instructions) are turned off. Don&apos;t put real client details in it.
      </>
    ),
  },
  {
    q: 'Is this a real product?',
    a: (
      <>
        It is a working portfolio project built and run by one developer, Fazal Abbas. It is free, comes with no guarantees, and isn&apos;t meant for
        real client data. Questions or feedback: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </>
    ),
  },
]

export default function Faq() {
  useDocumentTitle('FAQ')

  return (
    <LegalPage title="Frequently asked questions" intro="Short answers about recording, your data and how the app works.">
      {QUESTIONS.map(({ q, a }) => (
        <section key={q} className="pt-2">
          <h2>{q}</h2>
          <p className="mt-2">{a}</p>
        </section>
      ))}
    </LegalPage>
  )
}
