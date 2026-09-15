'use client'

import * as React from 'react'
import { useDashboardData, attendanceBetween } from './dashboard-data'
import { Clock, Loader2, LogIn, LogOut, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmployee } from '@/app/employee/context'

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'present' | 'late' | 'absent' | 'half_day' | 'leave' | 'holiday'

interface AttRow {
  id: string
  date: string
  login_at: string | null
  logout_at: string | null
  total_minutes: number | null
  status: Status
  notes: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<Status, { label: string; chip: string; dot: string }> = {
  present:  { label: 'Present',  chip: 'bg-emerald/15 text-emerald', dot: 'bg-emerald' },
  late:     { label: 'Late',     chip: 'bg-amber/15 text-amber',     dot: 'bg-amber'   },
  absent:   { label: 'Absent',   chip: 'bg-coral/15 text-coral',     dot: 'bg-coral'   },
  half_day: { label: 'Half Day', chip: 'bg-sky/15 text-sky',         dot: 'bg-sky'     },
  leave:    { label: 'Leave',    chip: 'bg-violet/15 text-violet',   dot: 'bg-violet'  },
  holiday:  { label: 'Holiday',  chip: 'bg-indigo/15 text-indigo',   dot: 'bg-indigo'  },
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtMinutes(m: number): string {
  const h   = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  return min > 0 ? `${h}h ${min}m` : `${h}h`
}

function fmtDate(isoDate: string): { display: string; weekday: string; isToday: boolean } {
  const today = new Date().toISOString().slice(0, 10)
  const d     = new Date(isoDate + 'T12:00:00')
  const display = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (isoDate === today) return { display, weekday: 'Today', isToday: true }
  return { display, weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }), isToday: false }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecentAttendance() {
  // This month's rows come from the shared bundle — the same range the week
  // chart needs, previously fetched twice.
  const bundle  = useDashboardData()
  const loading = bundle.loading && !bundle.data
  const error   = bundle.data ? null : bundle.error

  const { rows, totalMins } = React.useMemo(() => {
    const b = bundle.data
    if (!b) return { rows: [] as AttRow[], totalMins: 0 }
    const month = attendanceBetween(b.attendance, b.ranges.monthStart, b.today) as AttRow[]
    // Newest first, whichever way the bundle happens to be ordered.
    const desc = [...month].sort((x, y) => (x.date < y.date ? 1 : -1))
    return {
      rows: desc.slice(0, 10),
      totalMins: month.reduce((s, row) => s + (row.total_minutes ?? 0), 0),
    }
  }, [bundle.data])

  const load = bundle.refresh

  const totalLabel = totalMins > 0 ? `${fmtMinutes(totalMins)} this month` : '—'

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Attendance Log</h2>
          <p className="text-xs text-ink-soft">Current month</p>
        </div>
        <div className="flex items-center gap-3">
          {totalMins > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Clock className="size-3.5 text-brand" />
              {totalLabel}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            {loading
              ? <Loader2 className="size-3.5 animate-spin" />
              : <RefreshCcw className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* States */}
      {loading && rows.length === 0 ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="space-y-1.5">
                <div className="h-3 w-14 animate-pulse rounded bg-surface-2" />
                <div className="h-2.5 w-8 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-12 animate-pulse rounded bg-surface-2" />
              <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 text-xs font-medium text-brand hover:underline"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <Clock className="size-8 text-ink-soft/30" />
          <p className="text-sm text-ink-soft">No attendance records this month.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-ink-soft">
                <Th>Date</Th>
                <Th>Check In</Th>
                <Th>Check Out</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const m                         = STATUS_META[row.status]
                const { display, weekday, isToday } = fmtDate(row.date)
                const isActive                  = Boolean(row.login_at && !row.logout_at)
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border last:border-0 transition-colors hover:bg-surface-2/40',
                      isToday && 'bg-brand/[0.04]'
                    )}
                  >
                    <Td>
                      <p className={cn('font-semibold', isToday && 'text-brand')}>{display}</p>
                      <p className="text-[10px] text-ink-soft">{weekday}</p>
                    </Td>
                    <Td>
                      {row.login_at ? (
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <LogIn className="size-3.5 text-emerald shrink-0" />
                          {fmtTime(row.login_at)}
                        </span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.logout_at ? (
                        <span className="flex items-center gap-1.5 text-ink-muted">
                          <LogOut className="size-3.5 text-coral shrink-0" />
                          {fmtTime(row.logout_at)}
                        </span>
                      ) : isActive ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
                          <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                          Ongoing
                        </span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.total_minutes ? (
                        <span className="font-medium tabular-nums">
                          {fmtMinutes(row.total_minutes)}
                        </span>
                      ) : row.notes ? (
                        <span className="text-[11px] italic text-ink-soft">{row.notes}</span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                        m.chip
                      )}>
                        <span className={cn('size-1.5 rounded-full', m.dot)} />
                        {m.label}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center border-t border-border py-3">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs font-medium text-brand hover:underline disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh →'}
        </button>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 text-left font-medium">{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3 align-middle">{children}</td>
}
