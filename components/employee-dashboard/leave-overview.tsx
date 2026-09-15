'use client'

import * as React from 'react'
import {
  CalendarDays, CalendarOff, Check, ChevronDown,
  Clock, Loader2, Plus, Repeat2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmployee } from '@/app/employee/context'
import { useDashboardData } from './dashboard-data'

// ── Types ─────────────────────────────────────────────────────────────────────

type LeaveType    = 'casual' | 'sick' | 'annual' | 'maternity' | 'paternity' | 'unpaid' | 'other' | 'emergency'
type LeaveStatus  = 'pending' | 'approved' | 'rejected' | 'cancelled'
type AccrualType  = 'fixed' | 'monthly'
type HolidayType  = 'public' | 'company' | 'optional'

interface LeaveBalance {
  leave_type:   LeaveType
  total_days:   number
  used_days:    number
  pending_days: number
  remaining:    number
  accrual_type: AccrualType
}

interface LeaveRequest {
  id:        string
  type:      LeaveType
  from_date: string
  to_date:   string
  days:      number
  reason:    string | null
  status:    LeaveStatus
  created_at: string
}

interface Holiday {
  id:        string
  name:      string
  date:      string
  type:      HolidayType
  recurring: boolean
}

// ── Style maps ────────────────────────────────────────────────────────────────

const BALANCE_STYLE: Record<LeaveType, { bar: string; chip: string; dot: string }> = {
  casual:    { bar: 'bg-sky',      chip: 'bg-sky/10 text-sky',                 dot: 'bg-sky'      },
  sick:      { bar: 'bg-coral',    chip: 'bg-coral/10 text-coral',             dot: 'bg-coral'    },
  annual:    { bar: 'bg-emerald',  chip: 'bg-emerald/10 text-emerald',         dot: 'bg-emerald'  },
  unpaid:    { bar: 'bg-amber',    chip: 'bg-amber/10 text-amber',             dot: 'bg-amber'    },
  maternity: { bar: 'bg-violet',   chip: 'bg-violet/10 text-violet',           dot: 'bg-violet'   },
  paternity: { bar: 'bg-indigo',   chip: 'bg-indigo/10 text-indigo',           dot: 'bg-indigo'   },
  other:     { bar: 'bg-brand',    chip: 'bg-brand/10 text-brand',             dot: 'bg-brand'    },
  emergency: { bar: 'bg-red-500',  chip: 'bg-red-100 text-red-600',            dot: 'bg-red-500'  },
}

const STATUS_META: Record<LeaveStatus, { label: string; chip: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   chip: 'bg-amber/10 text-amber',      icon: Clock  },
  approved:  { label: 'Approved',  chip: 'bg-emerald/10 text-emerald',  icon: Check  },
  rejected:  { label: 'Rejected',  chip: 'bg-coral/10 text-coral',      icon: X      },
  cancelled: { label: 'Cancelled', chip: 'bg-surface-2 text-ink-muted', icon: X      },
}

const HOLIDAY_CHIP: Record<HolidayType, string> = {
  public:   'bg-emerald/10 text-emerald',
  company:  'bg-brand/10 text-brand',
  optional: 'bg-amber/10 text-amber',
}

const LEAVE_LABELS: Record<LeaveType, string> = {
  casual: 'Casual', sick: 'Sick', annual: 'Annual',
  maternity: 'Maternity', paternity: 'Paternity', unpaid: 'Unpaid', other: 'Other',
  emergency: 'Emergency',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtDateFull(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function daysUntil(iso: string): number {
  const t = new Date(today()); const d = new Date(iso + 'T12:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

// ── Apply Form ────────────────────────────────────────────────────────────────

function ApplyForm({
  employeeId,
  availableTypes,
  onSuccess,
  onCancel,
}: {
  employeeId:     string
  availableTypes: LeaveType[]
  onSuccess:      () => void
  onCancel:       () => void
}) {
  const [type,   setType]   = React.useState<LeaveType>(availableTypes[0] ?? 'sick')
  const [from,   setFrom]   = React.useState('')
  const [to,     setTo]     = React.useState('')
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error,  setError]  = React.useState<string | null>(null)

  const days = React.useMemo(() => {
    if (!from || !to) return 0
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
    return diff < 0 ? 0 : Math.round(diff) + 1
  }, [from, to])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!from || !to || days < 1) { setError('Select valid dates'); return }
    setSaving(true); setError(null)
    try {
      const r = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, type, from_date: from, to_date: to, days, reason: reason || null }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed')
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-b border-border bg-brand/[0.02] px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-brand">Apply for Leave</p>

      {/* Leave type */}
      <div className="relative">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
          className="w-full appearance-none rounded-xl border border-border bg-surface px-3 py-2 pr-8 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
        >
          {availableTypes.map((t) => (
            <option key={t} value={t}>{LEAVE_LABELS[t]} Leave</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-ink-soft" />
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink-soft">From</label>
          <input type="date" value={from} min={today()}
            onChange={(e) => { setFrom(e.target.value); if (!to || e.target.value > to) setTo(e.target.value) }}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
            required />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink-soft">To</label>
          <input type="date" value={to} min={from || today()}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
            required />
        </div>
      </div>

      {days > 0 && (
        <p className="text-[11px] text-ink-muted">
          <span className="font-semibold text-ink">{days} day{days !== 1 ? 's' : ''}</span> leave request
        </p>
      )}

      <textarea value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)" rows={2}
        className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
      />

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving || days < 1}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50">
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Submit Request
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-2">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LeaveOverview() {
  const employee = useEmployee()

  // Balances, requests and holidays all ride in the shared dashboard bundle.
  // The entitlements call this card used to make was the same one the stats
  // strip above it was already making.
  const bundle  = useDashboardData()
  const loading = bundle.loading && !bundle.data
  const load    = bundle.refresh

  const [showApply, setShowApply] = React.useState(false)

  const { balances, requests, holidays } = React.useMemo(() => {
    const b = bundle.data
    if (!b) return { balances: [] as LeaveBalance[], requests: [] as LeaveRequest[], holidays: [] as Holiday[] }
    const bArr = (b.leave.balances ?? []) as LeaveBalance[]
    // Only show leave types that exist in the current policy
    const activeTypes = new Set(bArr.map((x) => x.leave_type))
    return {
      balances: bArr,
      // Show requests for active policy types AND emergency leave (which is always allowed)
      requests: ((b.leave.requests ?? []) as LeaveRequest[])
        .filter((r) => r.type === 'emergency' || activeTypes.has(r.type)),
      // Only keep upcoming holidays (from today inclusive, next 4 max)
      holidays: ((b.holidays ?? []) as Holiday[])
        .filter((h) => h.date >= b.today)
        .slice(0, 4),
    }
  }, [bundle.data])

  const totalRemaining = balances.reduce((s, b) => s + b.remaining, 0)
  const availableTypes = balances.map((b) => b.leave_type)

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (loading && balances.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-5 py-4">
          <div className="h-5 w-32 animate-pulse rounded bg-surface-2" />
          <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="space-y-4 px-5 py-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <div className="h-5 w-20 animate-pulse rounded-full bg-surface-2" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
              </div>
              <div className="h-2 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
        <div className="border-t border-border px-5 py-4">
          <div className="mb-3 h-3 w-28 animate-pulse rounded bg-surface-2" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-2 h-12 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">

      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Leave & Holidays</h2>
          <p className="text-xs text-ink-soft">
            {balances.length > 0
              ? `${totalRemaining} day${totalRemaining !== 1 ? 's' : ''} remaining this year`
              : 'No leave policies configured'}
          </p>
        </div>
        {availableTypes.length > 0 && (
          <button
            type="button"
            onClick={() => setShowApply((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
              showApply
                ? 'border-coral/30 bg-coral/10 text-coral'
                : 'border-border text-ink-muted hover:border-brand/30 hover:text-brand',
            )}
          >
            {showApply ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showApply ? 'Cancel' : 'Apply'}
          </button>
        )}
      </header>

      {/* ── Apply form ── */}
      {showApply && (
        <ApplyForm
          employeeId={employee.id}
          availableTypes={availableTypes}
          onSuccess={() => { setShowApply(false); load() }}
          onCancel={() => setShowApply(false)}
        />
      )}

      {/* ── Leave Balance ── */}
      {balances.length > 0 && (
        <section className="px-5 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-ink-soft">Leave Balance</p>
          <div className="space-y-3.5">
            {balances.map((b) => {
              const style      = BALANCE_STYLE[b.leave_type]
              const usedPct    = b.total_days > 0 ? Math.min(100, Math.round((b.used_days    / b.total_days) * 100)) : 0
              const pendingPct = b.total_days > 0 ? Math.min(100 - usedPct, Math.round((b.pending_days / b.total_days) * 100)) : 0
              const isMonthly  = b.accrual_type === 'monthly'
              const monthNo    = new Date().getMonth() + 1

              return (
                <div key={b.leave_type}>
                  {/* Label row */}
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('size-2 rounded-full', style.dot)} />
                      <span className="text-xs font-semibold text-ink">
                        {LEAVE_LABELS[b.leave_type]} Leave
                      </span>
                      {isMonthly && (
                        <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9px] font-semibold text-brand">
                          {monthNo}/12 mo
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      <span className="font-semibold text-ink">{b.remaining}</span>
                      /{b.total_days} left
                      {b.pending_days > 0 && (
                        <span className="ml-1 text-amber">· {b.pending_days} pending</span>
                      )}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn('absolute inset-y-0 left-0 rounded-full transition-all', style.bar)}
                      style={{ width: `${usedPct}%` }}
                    />
                    {pendingPct > 0 && (
                      <div
                        className={cn('absolute inset-y-0 rounded-full opacity-40 transition-all', style.bar)}
                        style={{ left: `${usedPct}%`, width: `${pendingPct}%` }}
                      />
                    )}
                  </div>

                  {/* Sub-label */}
                  <p className="mt-1 text-[10px] text-ink-soft">
                    {b.used_days > 0 ? `${b.used_days} used` : '0 used'} · {b.total_days} {isMonthly ? 'accrued so far' : 'total this year'}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Upcoming Holidays ── */}
      <section className={cn('px-5 py-4', balances.length > 0 && 'border-t border-border')}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Upcoming Holidays</p>
          {holidays.length > 0 && (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
              {holidays.length}
            </span>
          )}
        </div>

        {holidays.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3">
            <CalendarDays className="size-4 text-ink-soft/40" />
            <p className="text-xs text-ink-soft">No upcoming holidays this year</p>
          </div>
        ) : (
          <div className="space-y-2">
            {holidays.map((h) => {
              const diff    = daysUntil(h.date)
              const isToday = diff === 0

              return (
                <div
                  key={h.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3.5 py-2.5',
                    isToday
                      ? 'border-brand/20 bg-brand/[0.04]'
                      : 'border-border bg-surface-2/30',
                  )}
                >
                  {/* Date tile */}
                  <div className={cn(
                    'flex w-10 shrink-0 flex-col items-center rounded-lg border py-1.5',
                    isToday ? 'border-brand/30 bg-brand/10' : 'border-border bg-surface',
                  )}>
                    <span className={cn('text-sm font-bold leading-none', isToday ? 'text-brand' : 'text-ink')}>
                      {new Date(h.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric' })}
                    </span>
                    <span className={cn('mt-0.5 text-[9px] font-semibold uppercase', isToday ? 'text-brand/70' : 'text-ink-soft')}>
                      {new Date(h.date + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' })}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <p className="text-xs font-semibold text-ink">{h.name}</p>
                      {isToday && (
                        <span className="rounded-full bg-brand/15 px-1.5 py-px text-[9px] font-bold uppercase text-brand">
                          Today
                        </span>
                      )}
                      {h.recurring && (
                        <Repeat2 className="size-3 text-ink-soft/60" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={cn('rounded-full px-1.5 py-px text-[9px] font-semibold capitalize', HOLIDAY_CHIP[h.type])}>
                        {h.type}
                      </span>
                      <span className="text-[10px] text-ink-soft">
                        {isToday ? 'Today' : diff === 1 ? 'Tomorrow' : `in ${diff} days`}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Recent Leave Requests ── */}
      <section className="border-t border-border px-5 py-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-ink-soft">My Requests</p>

        {requests.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3">
            <CalendarOff className="size-4 text-ink-soft/40" />
            <p className="text-xs text-ink-soft">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => {
              const s     = STATUS_META[req.status]
              const Icon  = s.icon
              const style = BALANCE_STYLE[req.type] ?? BALANCE_STYLE.other
              const dateLabel = req.from_date === req.to_date
                ? fmtDate(req.from_date)
                : `${fmtDate(req.from_date)} – ${fmtDate(req.to_date)}`

              return (
                <div
                  key={req.id}
                  className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 transition-colors hover:bg-surface-2/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold', style.chip)}>
                        {LEAVE_LABELS[req.type] ?? req.type}
                      </span>
                      <span className="text-xs font-medium text-ink">
                        {req.days} day{req.days !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-ink-soft">{dateLabel}</p>
                  </div>
                  <span className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    s.chip,
                  )}>
                    <Icon className="size-3" />
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
