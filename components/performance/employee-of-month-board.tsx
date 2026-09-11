'use client'

import * as React from 'react'
import {
  Award, ChevronLeft, ChevronRight, Download, Loader2, Trophy, X, Clock,
} from 'lucide-react'

import { cn } from '@/lib/utils'

interface Standing {
  employee_id: string; full_name: string; department: string | null
  days: number; on_time: number; late: number
  on_time_pct: number; avg_early_mins: number
  eligible: boolean; rank: number
}

interface AwardRow {
  id: string; period: string; employee_id: string; employee_name: string | null
  on_time_days: number | null; total_days: number | null; avg_early_mins: number | null
  note: string | null; awarded_at: string
}

interface Payload {
  period: string; label: string; isCurrent: boolean
  standings: Standing[]
  award: AwardRow | null
}

function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const MEDAL = ['text-amber', 'text-ink-soft', 'text-coral']

export function EmployeeOfMonthBoard() {
  const [data, setData]       = React.useState<Payload | null>(null)
  const [period, setPeriod]   = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy]       = React.useState<string | null>(null)

  const load = React.useCallback(async (p?: string | null) => {
    setLoading(true)
    try {
      const qs = p ? `?period=${encodeURIComponent(p)}` : ''
      const r  = await fetch(`/api/employee-of-month${qs}`, { cache: 'no-store' })
      if (r.ok) {
        const d: Payload = await r.json()
        setData(d)
        setPeriod(d.period)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function award(employeeId: string | null) {
    setBusy(employeeId ?? 'clear')
    try {
      await fetch('/api/employee-of-month', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ period, employee_id: employeeId }),
      })
      await load(period)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => period && load(shiftPeriod(period, -1))}
            className="grid size-8 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => period && load(shiftPeriod(period, 1))}
            className="grid size-8 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Trophy className="size-4 text-amber" />
            Employee of the Month
          </h2>
          <p className="text-xs text-ink-soft">
            Ranked on punctuality · {data?.label ?? '—'}
            {loading && ' · loading…'}
          </p>
        </div>
      </header>

      {/* Current winner */}
      {data?.award && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3">
          {/* Name and actions share a row on desktop; on a narrow screen the
              name takes the full width instead of being squeezed to one word
              per line by the buttons beside it. */}
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
            <Award className="size-5 shrink-0 text-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber">
                {data.award.employee_name} — {data.label}
              </p>
              {data.award.on_time_days != null && data.award.total_days != null && (
                <p className="text-[11px] text-ink-soft">
                  {data.award.on_time_days} of {data.award.total_days} days on time
                  {data.award.avg_early_mins != null && data.award.avg_early_mins > 0 &&
                    ` · ${data.award.avg_early_mins} min early on average`}
                </p>
              )}
            </div>
          </div>
          <a
            href={`/api/employee-of-month/certificate?id=${data.award.id}`}
            target="_blank" rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Download className="size-3.5" />
            Certificate
          </a>
          <button
            onClick={() => award(null)}
            disabled={busy !== null}
            className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-coral disabled:opacity-50"
            title="Remove this award"
          >
            {busy === 'clear' ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </button>
        </div>
      )}

      {(data?.standings.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">
          {loading ? 'Loading…' : 'No attendance recorded for this month yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data!.standings.map((s) => {
            const isWinner = data!.award?.employee_id === s.employee_id
            return (
              <li key={s.employee_id} className={cn('flex items-center gap-3 py-2.5', isWinner && 'bg-amber/5')}>
                <span className={cn(
                  'w-6 shrink-0 text-center text-sm font-bold tabular-nums',
                  s.eligible ? (MEDAL[s.rank - 1] ?? 'text-ink-soft') : 'text-ink-soft/50',
                )}>
                  {s.rank}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.full_name}</span>
                    {!s.eligible && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-soft"
                        title="Too few days attended this month to qualify">
                        not enough days
                      </span>
                    )}
                    {isWinner && <Award className="size-3.5 text-amber" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-soft">
                    <span>{s.on_time}/{s.days} on time</span>
                    {s.late > 0 && <span className="text-coral">{s.late} late</span>}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {s.avg_early_mins >= 0
                        ? `${s.avg_early_mins} min early avg`
                        : `${Math.abs(s.avg_early_mins)} min late avg`}
                    </span>
                    {s.department && <span>{s.department}</span>}
                  </div>
                </div>

                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {s.on_time_pct}%
                </span>

                {!isWinner && s.eligible && (
                  <button
                    onClick={() => award(s.employee_id)}
                    disabled={busy !== null}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    {busy === s.employee_id ? <Loader2 className="size-3.5 animate-spin" /> : 'Award'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {data?.isCurrent && (
        <p className="mt-3 text-[11px] text-ink-soft">
          This month is still running — standings move as attendance is recorded.
          Award it once the month is over.
        </p>
      )}
    </div>
  )
}
