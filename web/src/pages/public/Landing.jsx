import { Link } from 'react-router'
import { DemoButtons } from '../../components/DemoButtons'
import { useDocumentTitle } from '../../hooks/useResource'

const STEPS = [
  ['Talk', 'Right after a client call, record a short voice note while it is fresh.'],
  ['Transcribe', 'The note is transcribed, then summarised: sentiment, action items and follow-up dates.'],
  ['Check', 'You read the draft, fix anything it got wrong, and save. Follow-ups become tasks.'],
]

export default function Landing() {
  useDocumentTitle(null)

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">For sales reps and their managers</p>
          <h1 className="mt-3 text-5xl text-brand sm:text-6xl">
            Say it after the call. <em className="italic">Keep it</em> in the CRM.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Voice Note CRM turns a quick spoken debrief into tidy call notes and follow-up tasks, so nothing a client said is lost between
            meetings. Managers see the whole team&apos;s pipeline in one place.
          </p>
          <div className="mt-8">
            <DemoButtons />
          </div>
          <p className="mt-4 text-sm text-muted">
            The demo uses a shared organization with made-up clients. Or{' '}
            <Link to="/register" className="font-semibold text-brand underline underline-offset-2">
              create your team&apos;s account
            </Link>
            .
          </p>
        </div>

        <figure className="relative min-w-0 rounded-card border border-line bg-surface p-5 pl-10 shadow-sm" aria-label="Example call note">
          <span aria-hidden="true" className="absolute inset-y-0 left-6 w-px bg-margin" />
          <figcaption className="font-display text-2xl">Call with a fictional client</figcaption>
          <div className="ruled mt-2 text-sm">
            <p>
              <span className="font-semibold">Summary:</span> keen on the 200-unit order, worried about lead time.
            </p>
            <p>
              <span className="font-semibold">Sentiment:</span> <span className="rounded bg-positive-tint px-1.5 text-positive">positive</span>
            </p>
            <p>
              <span className="font-semibold">Next:</span> send revised quote by Friday.
            </p>
          </div>
        </figure>
      </div>

      <section aria-labelledby="how" className="mt-20">
        <h2 id="how" className="text-3xl">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-card border border-line bg-surface p-5">
              <p className="font-display text-3xl text-brand">
                {i + 1}. {title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">
          A working portfolio project by Fazal Abbas. Speech is transcribed by Groq and summarised by a language model through OpenRouter, and
          you check every draft before it is saved. See the{' '}
          <Link to="/faq" className="font-semibold text-brand underline underline-offset-2">
            FAQ
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="font-semibold text-brand underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
