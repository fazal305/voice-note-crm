import { Link, useSearchParams } from 'react-router'
import { StatusChip } from '../../components/StatusChip'
import { Card, EmptyState, LinkButton, LoadState, PageHeader } from '../../components/ui'
import { useDocumentTitle, useResource } from '../../hooks/useResource'
import { api } from '../../lib/api'
import { formatDate, formatDay, formatShortDate, localToday } from '../../lib/format'

const RANGES = [7, 30, 90]

// Fixed order, positive → neutral → frustrated, so the bar reads as a scale centred on neutral.
const SENTIMENTS = [
  { key: 'Positive', fill: 'bg-chart-positive' },
  { key: 'Neutral', fill: 'bg-chart-neutral' },
  { key: 'Frustrated', fill: 'bg-chart-negative' },
]

const STATUSES = ['ready', 'awaiting_transcript', 'uploaded', 'transcribing', 'parsing', 'failed']

const number = new Intl.NumberFormat()

export default function Dashboard() {
  useDocumentTitle('Dashboard')
  const [params, setParams] = useSearchParams()
  const range = RANGES.includes(Number(params.get('range'))) ? Number(params.get('range')) : 30
  const today = localToday()
  const dashboard = useResource((signal) => api.get('/dashboard', { params: { range, today }, signal }).then((res) => res.data), `${range}|${today}`)

  return (
    <>
      <PageHeader title="Dashboard" description="How your team's calls and follow-ups are going." action={<RangePicker value={range} onChange={(r) => setParams({ range: String(r) }, { replace: true })} />} />
      <LoadState resource={dashboard} label="Loading dashboard" rows={4}>
        {(data) => <Overview data={data} />}
      </LoadState>
    </>
  )
}

function RangePicker({ value, onChange }) {
  return (
    <div role="group" aria-label="Date range" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-line-strong bg-surface p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={r === value}
          onClick={() => onChange(r)}
          className={`min-h-10 rounded-md px-3 text-sm font-semibold ${r === value ? 'bg-brand text-white' : 'text-muted hover:bg-sunken hover:text-ink'}`}
        >
          Last {r} days
        </button>
      ))}
    </div>
  )
}

function Overview({ data }) {
  const { totals } = data
  const period = `${formatDay(data.since)} – today`

  if (totals.notes === 0 && totals.logs === 0 && totals.overdue_tasks === 0 && data.frustrated_clients.length === 0) {
    return (
      <EmptyState title="Nothing to show yet" action={<LinkButton to="/app/record">Record a note</LinkButton>}>
        No notes or calls in the last {data.range} days. Once your team records notes and saves call logs, their numbers show up here.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Showing <span className="font-semibold text-ink">{period}</span>. Overdue tasks and &ldquo;needs attention&rdquo; are as of today.
      </p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Notes captured" value={totals.notes} />
        <Stat label="Calls logged" value={totals.logs} />
        <Stat label="Overdue tasks" value={totals.overdue_tasks} tone={totals.overdue_tasks > 0 ? 'danger' : null} />
        <Stat label="Failed notes" value={totals.failed_notes} tone={totals.failed_notes > 0 ? 'danger' : null} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PeopleTable people={data.people} range={data.range} />
        <SentimentBreakdown counts={data.sentiment} total={totals.logs} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NeedsAttention clients={data.frustrated_clients} failed={data.failed_notes} />
        <Processing counts={data.processing} />
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 text-3xl font-semibold ${tone === 'danger' ? 'text-danger' : ''}`}>{number.format(value)}</dd>
    </div>
  )
}

function PeopleTable({ people, range }) {
  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      {/* Scrolls inside the card on narrow screens rather than widening the page. */}
      <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="Activity by person (scrolls sideways)">
        <table className="w-full min-w-[22rem] text-left text-sm">
          <caption className="px-5 pt-5 pb-3 text-left font-display text-2xl">
            By person
            <span className="block font-sans text-xs font-normal text-muted">Last {range} days; overdue tasks as of today</span>
          </caption>
          <thead className="border-y border-line bg-sunken/50 text-xs text-muted">
            <tr>
              <th scope="col" className="px-5 py-2 font-semibold">
                Person
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Notes
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Calls logged
              </th>
              <th scope="col" className="px-5 py-2 text-right font-semibold">
                Overdue tasks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {people.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="px-5 py-3 font-semibold">
                  {p.name}
                  {(p.role === 'manager' || !p.active) && (
                    <span className="block text-xs font-normal text-muted">{[p.role === 'manager' && 'Manager', !p.active && 'Deactivated'].filter(Boolean).join(' · ')}</span>
                  )}
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{number.format(p.notes)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{number.format(p.logs)}</td>
                <td className={`px-5 py-3 text-right tabular-nums ${p.overdue_tasks > 0 ? 'font-semibold text-danger' : ''}`}>{number.format(p.overdue_tasks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SentimentBreakdown({ counts, total }) {
  const percent = (n) => (total ? Math.round((n / total) * 100) : 0)
  return (
    <Card>
      <h2 className="text-2xl">Client sentiment</h2>
      <p className="text-xs text-muted">Across {number.format(total)} logged {total === 1 ? 'call' : 'calls'}</p>
      {total === 0 ? (
        <p className="mt-4 text-sm text-muted">No calls logged in this range.</p>
      ) : (
        <>
          {/* Decorative: the list below carries the same numbers as text. */}
          <div aria-hidden="true" className="mt-4 flex h-4 gap-0.5">
            {SENTIMENTS.filter((s) => counts[s.key] > 0).map((s) => (
              <div
                key={s.key}
                title={`${s.key}: ${counts[s.key]} (${percent(counts[s.key])}%)`}
                className={`${s.fill} min-w-1 first:rounded-l last:rounded-r`}
                style={{ flexGrow: counts[s.key], flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {SENTIMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={`size-3 shrink-0 rounded-sm ${s.fill}`} />
                <span className="flex-1">{s.key}</span>
                <span className="font-semibold tabular-nums">{number.format(counts[s.key])}</span>
                <span className="w-12 text-right text-muted tabular-nums">{percent(counts[s.key])}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function NeedsAttention({ clients, failed }) {
  return (
    <Card>
      <h2 className="text-2xl">Needs attention</h2>
      <h3 className="mt-4 font-sans text-sm font-semibold">Latest call was frustrated</h3>
      {clients.length ? (
        <ul className="mt-2 divide-y divide-line">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
              <Link to={`/app/clients/${c.id}`} className="min-w-0 break-words font-semibold text-brand underline underline-offset-2">
                {c.name}
              </Link>
              <span className="text-muted">
                last contact <time dateTime={c.last_contact_at}>{formatShortDate(c.last_contact_at)}</time>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">No clients whose latest call was frustrated.</p>
      )}

      <h3 className="mt-5 font-sans text-sm font-semibold">Notes that failed to process</h3>
      {failed.length ? (
        <ul className="mt-2 divide-y divide-line">
          {failed.map((n) => (
            <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
              <Link to={`/app/notes/${n.id}`} className="font-semibold text-brand underline underline-offset-2">
                {n.owner}&rsquo;s note
              </Link>
              <time dateTime={n.created_at} className="text-muted">
                {formatDate(n.created_at)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">No failed notes in this range.</p>
      )}
    </Card>
  )
}

function Processing({ counts }) {
  return (
    <Card>
      <h2 className="text-2xl">Processing</h2>
      <p className="text-xs text-muted">Where this range&rsquo;s notes are now</p>
      <dl className="mt-3 divide-y divide-line">
        {STATUSES.map((status) => (
          <div key={status} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt>
              <StatusChip status={status} />
            </dt>
            <dd className={`font-semibold tabular-nums ${status === 'failed' && counts.failed > 0 ? 'text-danger' : ''}`}>{number.format(counts[status] ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
