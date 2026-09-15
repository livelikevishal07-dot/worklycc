'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Clock, LogIn, LogOut, MapPin } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useEmployee } from '@/app/employee/context'
import { useDashboardData } from './dashboard-data'

// ── Types ─────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'late' | 'absent' | 'half_day' | 'leave' | 'holiday'

interface AttendanceRow {
  id: string
  date: string
  login_at: string | null
  logout_at: string | null
  total_minutes: number | null
  status: AttendanceStatus
  notes: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtElapsed(startIso: string): string {
  const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000)
  const h    = Math.floor(secs / 3600)
  const m    = Math.floor((secs % 3600) / 60)
  const s    = secs % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtMinutes(m: number): string {
  const h   = Math.floor(m / 60)
  const min = m % 60
  return min > 0 ? `${h}h ${min}m` : `${h}h`
}

/** How many minutes past the scheduled start (negative = still early) */
function minsLateNow(workingStart: string): number {
  const [sh, sm] = workingStart.split(':').map(Number)
  const now = new Date()
  const scheduled = new Date(now)
  scheduled.setHours(sh, sm, 0, 0)
  return Math.floor((now.getTime() - scheduled.getTime()) / 60_000)
}

function minsLateAt(loginIso: string, workingStart: string): number {
  const [sh, sm] = workingStart.split(':').map(Number)
  const login = new Date(loginIso)
  const scheduled = new Date(login)
  scheduled.setHours(sh, sm, 0, 0)
  return Math.max(0, Math.floor((login.getTime() - scheduled.getTime()) / 60_000))
}

function fmtLate(mins: number): string {
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h} hour${h !== 1 ? 's' : ''}`
}

/** Determine check-in status: present if within grace, else late */
function deriveStatus(workingStart: string): AttendanceStatus {
  const [sh, sm] = workingStart.split(':').map(Number)
  const now = new Date()
  const scheduledStart = new Date(now)
  scheduledStart.setHours(sh, sm, 0, 0)
  const graceMins = 15
  const lateThreshold = new Date(scheduledStart.getTime() + graceMins * 60_000)
  return now <= lateThreshold ? 'present' : 'late'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = React.useState<string | null>(null)
  const [weekday, setWeekday] = React.useState<string | null>(null)

  React.useEffect(() => {
    function tick() {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setWeekday(new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(now))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-2 text-center tabular-nums">
      <p className="text-xl font-bold tracking-tight text-ink" suppressHydrationWarning>
        {time ?? '——:——:——'}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-ink-soft" suppressHydrationWarning>
        {weekday ?? '—————'}
      </p>
    </div>
  )
}

/** Ticking elapsed time display while session is active */
function ElapsedTimer({ startIso }: { startIso: string }) {
  const [elapsed, setElapsed] = React.useState(() => fmtElapsed(startIso))
  React.useEffect(() => {
    const id = setInterval(() => setElapsed(fmtElapsed(startIso)), 1000)
    return () => clearInterval(id)
  }, [startIso])
  return <span className="tabular-nums font-mono">{elapsed}</span>
}

// ── Late Warning Banner ───────────────────────────────────────────────────────

function LateWarningBanner({
  type,
  scheduledStart,
  minsLate,
  loginAt,
}: {
  type: 'pre-checkin' | 'active' | 'done'
  scheduledStart: string
  minsLate: number
  loginAt?: string | null
}) {
  const messages = {
    'pre-checkin': {
      title: "You're running late!",
      body: `Your shift started at ${scheduledStart}. You are currently ${fmtLate(minsLate)} late — please check in immediately.`,
    },
    active: {
      title: 'Late check-in recorded',
      body: `You checked in at ${loginAt ? new Date(loginAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'} — ${fmtLate(minsLate)} after your scheduled start (${scheduledStart}).`,
    },
    done: {
      title: 'Late attendance noted',
      body: `Your check-in was ${fmtLate(minsLate)} late today (scheduled ${scheduledStart}). This has been recorded in your attendance.`,
    },
  }
  const { title, body } = messages[type]

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/8 px-4 py-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-amber/20 text-amber">
        <AlertTriangle className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{body}</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function WelcomeCard() {
  const employee = useEmployee()

  const [record,   setRecord]   = React.useState<AttendanceRow | null>(null)
  const [loading,  setLoading]  = React.useState(true)
  const [actioning, setActioning] = React.useState(false)
  const [error,    setError]    = React.useState<string | null>(null)
  // Reactive minutes-late counter (updates every minute before check-in)
  const [nowLate, setNowLate] = React.useState(() => minsLateNow(employee.working_hours_start))
  React.useEffect(() => {
    const id = setInterval(() => setNowLate(minsLateNow(employee.working_hours_start)), 60_000)
    return () => clearInterval(id)
  }, [employee.working_hours_start])

  // Today's row rides in the shared dashboard bundle, on the server's day —
  // the same day the attendance log and week chart are drawn from.
  const bundle = useDashboardData()
  const today  = bundle.data?.today ?? new Date().toISOString().slice(0, 10)

  const bundleRow = React.useMemo(() => {
    const b = bundle.data
    if (!b) return undefined                       // undefined = not loaded yet
    return (b.attendance as AttendanceRow[]).find((r) => r.date === b.today) ?? null
  }, [bundle.data])

  React.useEffect(() => {
    if (bundleRow === undefined) return
    setRecord((prev) => {
      // A punch can outrun a poll that was already in flight; don't let the
      // older answer undo the button the employee just pressed.
      if (prev && !bundleRow) return prev
      if (prev?.logout_at && bundleRow && !bundleRow.logout_at) return prev
      return bundleRow
    })
    setLoading(false)
  }, [bundleRow])

  // ── Check In ─────────────────────────────────────────────────────────────
  async function checkIn() {
    if (!employee.id) return
    setActioning(true); setError(null)
    const now    = new Date().toISOString()
    const status = deriveStatus(employee.working_hours_start)
    try {
      const r = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.id,
          date: today,
          status,
          login_at: now,
          logout_at: null,
        }),
      })
      if (!r.ok) throw new Error('Failed to check in')
      const data: AttendanceRow = await r.json()
      setRecord(data)
      bundle.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed')
    } finally {
      setActioning(false)
    }
  }

  // ── Check Out ────────────────────────────────────────────────────────────
  async function checkOut() {
    if (!record?.id) return
    setActioning(true); setError(null)
    const now = new Date().toISOString()
    try {
      const r = await fetch(`/api/attendance/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logout_at: now }),
      })
      if (!r.ok) throw new Error('Failed to check out')
      const data: AttendanceRow = await r.json()
      setRecord(data)
      bundle.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-out failed')
    } finally {
      setActioning(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const hasCheckedIn  = Boolean(record?.login_at)
  const hasCheckedOut = Boolean(record?.logout_at)
  const isLate        = record?.status === 'late'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">

      {/* ── Top row: identity + clock ── */}
      <div className="flex flex-wrap items-center gap-4 px-6 pt-5 pb-4">
        <Avatar name={employee.full_name} size="lg" className="size-14 text-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted">{greeting()}</p>
          <h2 className="text-xl font-bold tracking-tight">{employee.full_name}</h2>
          <p className="text-sm text-ink-soft">
            {[employee.role, employee.department].filter(Boolean).join(' · ') || 'Employee'}
          </p>
        </div>
        <LiveClock />
      </div>

      {/* ── Divider ── */}
      <div className="mx-6 border-t border-border" />

      {/* ── Check-in / Check-out action area ── */}
      <div className="px-6 py-5">

        {loading ? (
          /* Loading skeleton */
          <div className="flex items-center justify-center py-6">
            <div className="size-6 animate-spin rounded-full border-2 border-border border-t-brand" />
          </div>

        ) : !hasCheckedIn ? (
          /* ─── NOT CHECKED IN ─── */
          <div className="space-y-3">
            {nowLate > 15 && (
              <LateWarningBanner
                type="pre-checkin"
                scheduledStart={employee.working_hours_start}
                minsLate={nowLate}
              />
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Work Session</p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Shift: <span className="font-medium text-ink">{employee.working_hours_start}</span>
                  {' '}–{' '}
                  <span className="font-medium text-ink">{employee.working_hours_end}</span>
                </p>
              </div>
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                nowLate > 15
                  ? 'border-coral/20 bg-coral/10 text-coral'
                  : 'border-amber/20 bg-amber/10 text-amber'
              )}>
                <span className={cn('size-1.5 animate-pulse rounded-full', nowLate > 15 ? 'bg-coral' : 'bg-amber')} />
                {nowLate > 15 ? 'Overdue' : 'Not started'}
              </span>
            </div>

            {/* BIG CHECK IN BUTTON */}
            <button
              type="button"
              onClick={checkIn}
              disabled={actioning}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-emerald py-5 text-white shadow-lg transition-all hover:shadow-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
            >
              {/* Subtle shimmer */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

              {actioning ? (
                <span className="size-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <LogIn className="size-7 shrink-0" />
              )}
              <div className="text-left">
                <p className="text-lg font-bold tracking-tight">CHECK IN</p>
                <p className="text-sm font-normal opacity-80">Tap to start your work session</p>
              </div>
            </button>
          </div>

        ) : !hasCheckedOut ? (
          /* ─── CHECKED IN — SESSION ACTIVE ─── */
          <div className="space-y-3">
            {isLate && (
              <LateWarningBanner
                type="active"
                scheduledStart={employee.working_hours_start}
                minsLate={minsLateAt(record!.login_at!, employee.working_hours_start)}
                loginAt={record!.login_at}
              />
            )}
            {/* Session header */}
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
                isLate
                  ? 'border-amber/25 bg-amber/10 text-amber'
                  : 'border-emerald/25 bg-emerald/10 text-emerald'
              )}>
                <span className={cn('size-2 animate-pulse rounded-full', isLate ? 'bg-amber' : 'bg-emerald')} />
                {isLate ? 'Working (Late)' : 'Working'}
              </span>

              <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                <LogIn className="size-4 text-emerald" />
                Checked in at <span className="font-semibold text-ink">{fmtTime(record!.login_at)}</span>
              </span>

              <span className="ml-auto flex items-center gap-1.5 text-sm font-medium text-brand">
                <Clock className="size-4" />
                <ElapsedTimer startIso={record!.login_at!} />
              </span>
            </div>

            {/* Shift progress bar */}
            {(() => {
              const [sh, sm] = employee.working_hours_start.split(':').map(Number)
              const [eh, em] = employee.working_hours_end.split(':').map(Number)
              const now = new Date()
              const startOfDay = new Date(now); startOfDay.setHours(sh, sm, 0, 0)
              const endOfDay   = new Date(now); endOfDay.setHours(eh, em, 0, 0)
              const total = endOfDay.getTime() - startOfDay.getTime()
              const elapsed = Math.max(0, now.getTime() - startOfDay.getTime())
              const pct = Math.min(Math.round((elapsed / total) * 100), 100)
              return (
                <div>
                  <div className="mb-1 flex justify-between text-[10px] text-ink-soft">
                    <span>{employee.working_hours_start}</span>
                    <span className="text-brand">{pct}% of shift complete</span>
                    <span>{employee.working_hours_end}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })()}

            {/* BIG CHECK OUT BUTTON */}
            <button
              type="button"
              onClick={checkOut}
              disabled={actioning}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-coral/30 bg-coral/10 py-5 text-coral shadow-sm transition-all hover:bg-coral hover:text-white hover:shadow-lg active:scale-[0.99] disabled:opacity-60"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

              {actioning ? (
                <span className="size-6 animate-spin rounded-full border-2 border-current/40 border-t-current" />
              ) : (
                <LogOut className="size-7 shrink-0" />
              )}
              <div className="text-left">
                <p className="text-lg font-bold tracking-tight">CHECK OUT</p>
                <p className="text-sm font-normal opacity-70">End your work session</p>
              </div>
            </button>
          </div>

        ) : (
          /* ─── SESSION COMPLETE ─── */
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald" />
              <p className="text-sm font-semibold text-emerald">Session complete — great work today!</p>
            </div>
            {isLate && (
              <LateWarningBanner
                type="done"
                scheduledStart={employee.working_hours_start}
                minsLate={minsLateAt(record!.login_at!, employee.working_hours_start)}
                loginAt={record!.login_at}
              />
            )}

            {/* Summary card */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryTile icon={LogIn} label="Check In" value={fmtTime(record!.login_at)} iconColor="text-emerald" />
              <SummaryTile icon={LogOut} label="Check Out" value={fmtTime(record!.logout_at)} iconColor="text-coral" />
              <SummaryTile
                icon={Clock}
                label="Total Time"
                value={record!.total_minutes ? fmtMinutes(record!.total_minutes) : '—'}
                iconColor="text-brand"
                accent
              />
            </div>

            {/* Status + location row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-ink-soft">
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                isLate ? 'bg-amber/10 text-amber' : 'bg-emerald/10 text-emerald'
              )}>
                <span className={cn('size-1.5 rounded-full', isLate ? 'bg-amber' : 'bg-emerald')} />
                {isLate ? 'Late' : 'Present'}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> Office
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {employee.working_hours_start} – {employee.working_hours_end}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mt-3 rounded-xl border border-coral/20 bg-coral/5 px-4 py-2 text-sm text-coral">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Summary tile ──────────────────────────────────────────────────────────────

function SummaryTile({
  icon: Icon, label, value, iconColor, accent,
}: {
  icon: React.ElementType
  label: string
  value: string
  iconColor: string
  accent?: boolean
}) {
  return (
    <div className={cn(
      'flex flex-col items-center gap-1 rounded-xl border py-3 text-center',
      accent ? 'border-brand/20 bg-brand/5' : 'border-border bg-surface-2/40'
    )}>
      <Icon className={cn('size-5', iconColor)} />
      <p className={cn('text-base font-bold tabular-nums', accent ? 'text-brand' : 'text-ink')}>{value}</p>
      <p className="text-[10px] text-ink-soft">{label}</p>
    </div>
  )
}
