'use client'

import * as React from 'react'
import { useDashboardData, attendanceBetween } from './dashboard-data'
import { Loader2, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmployee } from '@/app/employee/context'

// ── Types ─────────────────────────────────────────────────────────────────────

type AttStatus = 'present' | 'late' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'weekend' | 'none'

interface AttRow {
  id: string
  date: string
  login_at: string | null
  logout_at: string | null
  total_minutes: number | null
  status: 'present' | 'late' | 'absent' | 'half_day' | 'leave' | 'holiday'
  notes: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<AttStatus, { bg: string; dot: string; label: string }> = {
  present:  { bg: 'bg-emerald/10 border-emerald/25', dot: 'bg-emerald',       label: 'Present'  },
  late:     { bg: 'bg-amber/10 border-amber/25',     dot: 'bg-amber',         label: 'Late'     },
  absent:   { bg: 'bg-coral/10 border-coral/25',     dot: 'bg-coral',         label: 'Absent'   },
  half_day: { bg: 'bg-sky/10 border-sky/25',         dot: 'bg-sky',           label: 'Half Day' },
  leave:    { bg: 'bg-violet/10 border-violet/25',   dot: 'bg-violet',        label: 'Leave'    },
  holiday:  { bg: 'bg-indigo/10 border-indigo/25',   dot: 'bg-indigo',        label: 'Holiday'  },
  weekend:  { bg: 'bg-surface-2 border-border',      dot: 'bg-ink-soft/30',   label: 'Weekend'  },
  none:     { bg: 'bg-surface-2/40 border-border/40',dot: 'bg-border',        label: 'No record'},
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  return min > 0 ? `${h}h ${min}m` : `${h}h`
}

/** Returns YYYY-MM-DD strings for Mon–Sun of the week containing `base` */
function getWeekDates(base = new Date()): string[] {
  const day = base.getDay() // 0 = Sun
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(base)
  mon.setDate(base.getDate() + diffToMon)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function toMonthStart(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function toDateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WeekAttendance() {
  // Both ranges are slices of the one attendance range in the shared bundle;
  // this card used to make two requests of its own for them.
  const bundle  = useDashboardData()
  const loading = bundle.loading && !bundle.data

  const { weekRows, monthRows } = React.useMemo(() => {
    const b = bundle.data
    if (!b) return { weekRows: [] as AttRow[], monthRows: [] as AttRow[] }
    const weekDates = getWeekDates(new Date())
    return {
      weekRows:  attendanceBetween(b.attendance, weekDates[0], weekDates[6]) as AttRow[],
      monthRows: attendanceBetween(b.attendance, b.ranges.monthStart, b.today) as AttRow[],
    }
  }, [bundle.data])

  // ── Derived values ─────────────────────────────────────────────────────────

  const now        = new Date()
  const today      = toDateStr(now)
  const weekDates  = getWeekDates(now)
  const rowByDate  = new Map(weekRows.map((r) => [r.date, r]))
  const todayRow   = rowByDate.get(today) ?? null

  // Week display: 7 slots Mon–Sun
  const weekSlots = weekDates.map((date, i) => {
    const row      = rowByDate.get(date) ?? null
    const isWeekend = i >= 5
    const isFuture  = date > today
    const isToday   = date === today

    let status: AttStatus = 'none'
    if (isWeekend)   status = 'weekend'
    else if (row)    status = row.status as AttStatus

    const shortDate = new Date(date + 'T12:00:00').getDate()
    const title = row
      ? `${STATUS_META[status].label} · In: ${fmtTime(row.login_at)}${row.logout_at ? ' · Out: ' + fmtTime(row.logout_at) : ''}${row.total_minutes ? ' · ' + fmtMinutes(row.total_minutes) : ''}`
      : STATUS_META[status].label

    return { label: DAY_LABELS[i], shortDate, status, isToday, isFuture, title, row }
  })

  // Month stats
  let present = 0, late = 0, absent = 0, totalMins = 0
  for (const r of monthRows) {
    if (r.status === 'present')  present++
    if (r.status === 'late')     late++
    if (r.status === 'absent')   absent++
    if (r.total_minutes)         totalMins += r.total_minutes
  }
  const eligible  = present + late + absent
  const pct       = eligible === 0 ? 0 : Math.round(((present + late) / eligible) * 100)
  const avgMins   = (present + late) > 0 ? Math.round(totalMins / (present + late)) : 0

  const weekLabel = [weekDates[0], weekDates[6]]
    .map((d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
    .join(' – ')

  const monthName = now.toLocaleDateString('en-GB', { month: 'long' })

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">This Week</h2>
          <p className="text-xs text-ink-soft">{weekLabel}</p>
        </div>
        <button
          type="button"
          onClick={bundle.refresh}
          disabled={loading}
          title="Refresh"
          className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          {loading
            ? <Loader2 className="size-3.5 animate-spin" />
            : <RefreshCcw className="size-3.5" />}
        </button>
      </header>

      {loading && weekRows.length === 0 ? (
        /* Skeleton */
        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
          <div className="h-8 animate-pulse rounded-xl bg-surface-2" />
        </div>
      ) : (
        <>
          {/* Day strip */}
          <div className="grid grid-cols-7 gap-1.5 px-4 pt-4 pb-3">
            {weekSlots.map(({ label, shortDate, status, isToday, title }) => {
              const s = STATUS_META[status]
              return (
                <div
                  key={label}
                  title={title}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border py-3 text-center transition-shadow',
                    s.bg,
                    isToday && 'ring-2 ring-brand ring-offset-1 ring-offset-surface'
                  )}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-soft">
                    {label}
                  </span>
                  <span className={cn('size-2.5 rounded-full', s.dot)} />
                  <span className="text-[9px] font-medium text-ink-soft">{shortDate}</span>
                </div>
              )
            })}
          </div>

          {/* Today's status strip */}
          {todayRow?.login_at ? (
            <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2.5">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-brand" />
              <p className="text-xs text-ink-muted">
                <span className="font-semibold text-brand">Today: </span>
                Checked in at {fmtTime(todayRow.login_at)}
                {todayRow.logout_at
                  ? ` · Checked out at ${fmtTime(todayRow.logout_at)}`
                  : todayRow.total_minutes
                    ? ` · ${fmtMinutes(todayRow.total_minutes)} elapsed`
                    : ' · Session active'}
              </p>
            </div>
          ) : (
            <div className="mx-4 mb-4 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
              <span className="size-2 shrink-0 rounded-full bg-ink-soft/40" />
              <p className="text-xs text-ink-muted">Not checked in today</p>
            </div>
          )}

          {/* Month summary */}
          <div className="border-t border-border px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {monthName}
              </span>
              <span className={cn(
                'text-xs font-bold',
                pct >= 90 ? 'text-emerald' : pct >= 75 ? 'text-amber' : 'text-coral'
              )}>
                {eligible === 0 ? 'No data' : `${pct}% attendance`}
              </span>
            </div>
            <div className="mb-4 h-2 rounded-full bg-surface-2">
              <div
                className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-emerald' : pct >= 75 ? 'bg-amber' : 'bg-coral')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Present',   value: String(present), color: 'text-emerald' },
                { label: 'Late',      value: String(late),    color: 'text-amber'   },
                { label: 'Total hrs', value: totalMins > 0 ? fmtMinutes(totalMins) : '—', color: 'text-brand' },
                { label: 'Daily avg', value: avgMins > 0 ? fmtMinutes(avgMins) : '—',     color: 'text-ink'   },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-border bg-surface-2/40 px-3 py-2">
                  <p className={cn('text-sm font-bold tabular-nums', m.color)}>{m.value}</p>
                  <p className="text-[10px] text-ink-soft">{m.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border px-5 py-3">
            {(['present', 'late', 'absent', 'leave'] as AttStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-[10px] text-ink-soft">
                <span className={cn('size-2 rounded-full', STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
