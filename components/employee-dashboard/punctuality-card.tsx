'use client'

import * as React from 'react'
import { Award, Clock, Download, Trophy, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The employee's own Employee of the Month standing.
 *
 * Shows their punctuality and where they sit, plus any month they have won with
 * a link to the certificate. Shows their own numbers and the leader's name only
 * — not everyone else's, which would make this a list of who is late.
 */

interface Standing {
  employee_id: string; full_name: string
  days: number; on_time: number; late: number
  on_time_pct: number; avg_early_mins: number
  eligible: boolean; rank: number
}

interface AwardRow {
  id: string; period: string; awarded_at: string
}

interface Payload {
  period: string; label: string
  me: Standing | null
  totalRanked: number
  leaderName: string | null
  awards: AwardRow[]
}

function monthLabel(period: string) {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export function PunctualityCard() {
  const [data, setData] = React.useState<Payload | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    fetch('/api/employee/of-the-month', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [])

  if (failed) return null
  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      </div>
    )
  }

  const me = data.me
  const won = data.awards.length > 0

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Trophy className="size-4 text-amber" />
            Employee of the Month
          </h2>
          <p className="text-xs text-ink-soft">Awarded on punctuality · {data.label}</p>
        </div>
        {me && me.rank === 1 && me.eligible && (
          <span className="shrink-0 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-semibold text-amber">
            Leading
          </span>
        )}
      </header>

      {/* Months already won */}
      {won && (
        <div className="mb-4 space-y-2">
          {data.awards.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber/30 bg-amber/5 px-3 py-2.5">
              {/* Full width on a narrow phone so the month isn't squeezed to
                  one word per line by the download button beside it. */}
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                <Award className="size-4 shrink-0 text-amber" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-amber">
                    Employee of the Month — {monthLabel(a.period)}
                  </p>
                  <p className="text-[11px] text-ink-soft">Congratulations!</p>
                </div>
              </div>
              <a
                href={`/api/employee/certificate?id=${a.id}`}
                target="_blank"
                rel="noopener"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber/40 px-2.5 py-1.5 text-[11px] font-semibold text-amber hover:bg-amber/10"
              >
                <Download className="size-3.5" />
                Certificate
              </a>
            </div>
          ))}
        </div>
      )}

      {!me || me.days === 0 ? (
        <p className="py-4 text-center text-sm text-ink-soft">
          No attendance recorded yet this month.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="On time"    value={`${me.on_time}/${me.days}`} tone="text-emerald" />
            <Stat label="Punctuality" value={`${me.on_time_pct}%`}      tone="text-violet" />
            <Stat
              label={me.avg_early_mins >= 0 ? 'Avg early' : 'Avg late'}
              value={`${Math.abs(me.avg_early_mins)}m`}
              tone={me.avg_early_mins >= 0 ? 'text-sky' : 'text-coral'}
            />
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn('h-full rounded-full', me.on_time_pct >= 90 ? 'bg-emerald' : me.on_time_pct >= 70 ? 'bg-amber' : 'bg-coral')}
              style={{ width: `${me.on_time_pct}%` }}
            />
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-soft">
            <Clock className="size-3.5" />
            {me.eligible
              ? <>You&apos;re <span className="font-semibold text-ink">#{me.rank}</span> of {data.totalRanked} this month.</>
              : <>Keep it up — a few more days attended and you&apos;re in the running.</>}
          </p>

          {me.rank !== 1 && data.leaderName && me.eligible && (
            <p className="mt-1 text-[11px] text-ink-soft">
              Currently leading: {data.leaderName}
            </p>
          )}

          <p className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2 text-[11px] leading-snug text-ink-soft">
            Arrive on time — or early — every day. The most punctual person each month
            receives the Employee of the Month certificate.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-center">
      <p className="text-[10px] text-ink-soft">{label}</p>
      <p className={cn('mt-0.5 text-base font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}
