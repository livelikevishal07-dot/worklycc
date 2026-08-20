'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Users, ListTodo, CalendarOff,
  TrendingUp, RefreshCw, ArrowRight, AlertCircle, Clock,
  CheckCircle2, CalendarDays, Megaphone, Award,
  ChevronRight, BookOpen, ListChecks,
  CalendarCheck, MapPin, PartyPopper, Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardSnapshot } from '@/lib/db/dashboard'
import dynamic from 'next/dynamic'
import { COLORS } from './chart-palette'

// recharts (~110 kB gzipped) loads as its own chunk instead of blocking first
// paint of the page the admin opens every morning. ssr: false is correct here —
// recharts measures the DOM to size itself, so it only ever renders client-side.
function ChartSkeleton({ h }: { h: number }) {
  return <div className="animate-pulse rounded-xl bg-surface-2" style={{ height: h }} />
}
const TaskTrendChart = dynamic(
  () => import('./dashboard-charts').then((m) => m.TaskTrendChart),
  { ssr: false, loading: () => <ChartSkeleton h={240} /> },
)
const AttendanceDonut = dynamic(
  () => import('./dashboard-charts').then((m) => m.AttendanceDonut),
  { ssr: false, loading: () => <ChartSkeleton h={180} /> },
)
const AttendanceTrendChart = dynamic(
  () => import('./dashboard-charts').then((m) => m.AttendanceTrendChart),
  { ssr: false, loading: () => <ChartSkeleton h={180} /> },
)

interface Props {
  initial: DashboardSnapshot
}


// ── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)        return 'just now'
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, hint, gradient, icon: Icon, href, delta,
}: {
  label: string; value: string; hint?: string
  gradient: string; icon: React.ElementType
  href?: string
  delta?: { value: string; positive?: boolean }
}) {
  const Wrapper: any = href ? Link : 'div'
  const props = href ? { href } : {}
  return (
    <Wrapper {...props}
      className={cn(
        'group relative overflow-hidden rounded-2xl p-5 shadow-card text-white block transition-transform',
        gradient,
        href && 'hover:-translate-y-0.5 hover:shadow-pop'
      )}>
      <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-12 right-10 size-28 rounded-full bg-white/10" />
      <div className="relative flex flex-col h-full">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
            {hint && <p className="text-[11px] opacity-70 mt-0.5">{hint}</p>}
          </div>
          <span className="grid size-10 place-items-center rounded-full bg-white/95 text-ink shadow-sm">
            <Icon className="size-5" />
          </span>
        </div>
        <div className="mt-5 flex items-end justify-between">
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {delta && (
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
              delta.positive ? 'bg-white/25' : 'bg-black/15'
            )}>
              {delta.value}
            </span>
          )}
        </div>
        {href && (
          <div className="mt-2 flex items-center gap-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            View details <ArrowRight className="size-3" />
          </div>
        )}
      </div>
    </Wrapper>
  )
}

// ── Card primitive ────────────────────────────────────────────────────────────

function Card({
  title, subtitle, action, children, className,
}: {
  title?: React.ReactNode; subtitle?: string
  action?: React.ReactNode; children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-5 shadow-card', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-base font-semibold">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Department Breakdown ──────────────────────────────────────────────────────

const DEPT_PALETTE: Record<string, string> = {
  violet:  COLORS.violet,
  sky:     COLORS.sky,
  indigo:  COLORS.indigo,
  coral:   COLORS.coral,
  emerald: COLORS.emerald,
  amber:   COLORS.amber,
}

function DepartmentList({ data }: { data: DashboardSnapshot['departmentBreakdown'] }) {
  const max = Math.max(1, ...data.map(d => d.total))
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-soft">No departments yet</p>
  }
  return (
    <div className="space-y-3">
      {data.map(d => {
        const color = DEPT_PALETTE[d.color ?? 'violet'] ?? COLORS.violet
        return (
          <Link key={d.name} href={`/cms/employees`}
            className="block group">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: color }} />
                <span className="text-sm font-medium group-hover:text-brand transition-colors">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-soft">
                  {d.active}/{d.total} active
                </span>
                <ChevronRight className="size-3.5 text-ink-soft opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(d.total / max) * 100}%`, background: color }} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Pending Leaves Card ───────────────────────────────────────────────────────

function PendingLeaves({ data }: { data: DashboardSnapshot['pendingLeaves'] }) {
  if (data.length === 0) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald opacity-50" />
        <p className="text-sm text-ink-soft">No pending leave requests</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {data.slice(0, 5).map(l => (
        <Link key={l.id} href="/cms/leave"
          className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-surface-2/50 hover:border-brand/30 transition-colors">
          <div className="size-9 grid place-items-center rounded-full bg-violet/10 text-violet shrink-0">
            <CalendarOff className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{l.employee_name}</p>
            <p className="text-[11px] text-ink-soft truncate">
              {l.type} · {l.days} day{l.days !== 1 ? 's' : ''} · from {l.from_date}
            </p>
          </div>
          <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold text-amber whitespace-nowrap">
            Pending
          </span>
        </Link>
      ))}
    </div>
  )
}

// ── Top Performers ────────────────────────────────────────────────────────────

function TopPerformers({ data }: { data: DashboardSnapshot['topPerformers'] }) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-soft">No completed tasks in last 30 days</p>
  }
  const max = Math.max(1, ...data.map(p => p.completed))
  const ranks = ['#F2B544', '#94a3b8', '#CD7C2A', '#94a3b8', '#94a3b8']
  return (
    <div className="space-y-3">
      {data.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3">
          <div className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white shrink-0"
            style={{ background: ranks[i] }}>
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <span className="text-sm font-bold whitespace-nowrap">
                {p.completed} <span className="text-[10px] font-normal text-ink-soft">tasks</span>
              </span>
            </div>
            {p.department && <p className="text-[11px] text-ink-soft">{p.department}</p>}
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${(p.completed / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

const KIND_STYLE: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  task:         { bg: 'bg-brand/10',   text: 'text-brand',   icon: ListTodo },
  leave:        { bg: 'bg-violet/10',  text: 'text-violet',  icon: CalendarOff },
  booking:      { bg: 'bg-emerald/10', text: 'text-emerald', icon: BookOpen },
  attendance:   { bg: 'bg-sky/10',     text: 'text-sky',     icon: CalendarDays },
  announcement: { bg: 'bg-amber/15',   text: 'text-amber',   icon: Megaphone },
}

function ActivityFeed({ data }: { data: DashboardSnapshot['activity'] }) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-soft">No recent activity</p>
  }
  return (
    <div className="space-y-2">
      {data.map(a => {
        const style = KIND_STYLE[a.kind] ?? KIND_STYLE.task
        const Icon = style.icon
        const Wrapper: any = a.href ? Link : 'div'
        const wrapperProps = a.href ? { href: a.href } : {}
        return (
          <Wrapper key={a.id} {...wrapperProps}
            className={cn(
              'flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
              a.href ? 'hover:bg-surface-2/50 cursor-pointer' : ''
            )}>
            <div className={cn('grid size-8 place-items-center rounded-lg shrink-0', style.bg, style.text)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug truncate">{a.title}</p>
              {a.subtitle && <p className="text-[11px] text-ink-soft truncate">{a.subtitle}</p>}
            </div>
            <span className="text-[10px] text-ink-soft whitespace-nowrap shrink-0 mt-0.5">{timeAgo(a.when)}</span>
          </Wrapper>
        )
      })}
    </div>
  )
}

// ── Holidays + Announcements ─────────────────────────────────────────────────

function HolidaysAndAnnouncements({
  holidays, announcements,
}: {
  holidays: DashboardSnapshot['upcomingHolidays']
  announcements: DashboardSnapshot['recentAnnouncements']
}) {
  return (
    <div className="space-y-5">
      {/* Holidays */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Upcoming Holidays</h4>
          <Link href="/cms/leave" className="text-[10px] text-brand hover:underline">View all</Link>
        </div>
        {holidays.length === 0 ? (
          <p className="text-sm text-ink-soft">No upcoming holidays</p>
        ) : (
          <div className="space-y-1.5">
            {holidays.slice(0, 4).map(h => {
              const d = new Date(h.date + 'T12:00:00')
              return (
                <div key={h.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="grid size-10 place-items-center rounded-lg bg-coral/10 text-coral shrink-0">
                    <span className="text-base font-bold leading-none">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{h.name}</p>
                    <p className="text-[11px] text-ink-soft">
                      {d.toLocaleDateString('en-GB', { weekday: 'long', month: 'short' })}
                    </p>
                  </div>
                  {h.type && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                      {h.type}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Latest Announcements</h4>
            <Link href="/cms/announcements" className="text-[10px] text-brand hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {announcements.slice(0, 2).map(a => (
              <Link key={a.id} href="/cms/announcements"
                className="block rounded-lg border border-border px-3 py-2 hover:border-brand/40 hover:bg-surface-2/30 transition-colors">
                <div className="flex items-start gap-2">
                  <Megaphone className="size-3.5 mt-0.5 text-amber shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-[11px] text-ink-soft line-clamp-2">{a.body}</p>
                    <p className="mt-1 text-[10px] text-ink-soft">{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Booking Card ──────────────────────────────────────────────────────────────

function BookingMiniCard({ stats }: { stats: DashboardSnapshot['bookingStats'] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-border bg-surface-2/40 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">This Month</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{stats.monthCount}</p>
        <p className="text-[11px] text-ink-soft">bookings</p>
      </div>
      <div className="rounded-xl border border-border bg-surface-2/40 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Today</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{stats.todayCount}</p>
        <p className="text-[11px] text-ink-soft">today</p>
      </div>
      <Link
        href="/cms/bookings/calendar"
        className="col-span-2 flex items-center justify-between gap-2 rounded-xl bg-gradient-to-br from-brand to-violet p-3 text-white transition-opacity hover:opacity-90"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="size-4" />
          View today&apos;s bookings
        </span>
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

function TodayEventsCard({ events }: { events: DashboardSnapshot['todayEvents'] }) {
  if (events.length === 0) {
    return (
      <div className="py-6 text-center">
        <CalendarCheck className="mx-auto mb-2 size-8 text-ink-soft/40" />
        <p className="text-sm text-ink-soft">No events scheduled for today</p>
      </div>
    )
  }

  const cities = new Set(events.map((e) => e.city)).size

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-surface-2/40 px-2.5 py-2 text-center">
          <p className="text-lg font-bold text-brand tabular-nums">{events.length}</p>
          <p className="text-[10px] text-ink-soft">Events today</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2/40 px-2.5 py-2 text-center">
          <p className="text-lg font-bold text-emerald tabular-nums">{cities}</p>
          <p className="text-[10px] text-ink-soft">{cities === 1 ? 'City' : 'Cities'}</p>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {events.map((ev, i) => (
          <div
            key={ev.id}
            className="rounded-xl border border-border bg-surface-2/30 px-3 py-2.5 transition-colors hover:border-brand/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="truncate text-sm font-semibold">{ev.customer_name}</p>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-2.5" />{ev.city}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <PartyPopper className="size-2.5" />{ev.occasion}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-ink">by {ev.employee_name}</span>
                </div>
              </div>
              <a
                href={`tel:${ev.customer_phone}`}
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-surface text-ink-soft hover:border-brand/30 hover:text-brand transition-colors"
                title={ev.customer_phone}
              >
                <Phone className="size-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminDashboard({ initial }: Props) {
  const [data,    setData]    = React.useState<DashboardSnapshot>(initial)
  const [loading, setLoading] = React.useState(false)
  const [lastUpdated, setLastUpdated] = React.useState<string>(initial.generatedAt)

  async function refresh() {
    setLoading(true)
    try {
      const r = await fetch('/api/dashboard', { cache: 'no-store' })
      if (r.ok) {
        const fresh: DashboardSnapshot = await r.json()
        setData(fresh)
        setLastUpdated(fresh.generatedAt)
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch fresh data immediately on mount (clears any stale router-cache snapshot),
  // then keep auto-refreshing every 60s.
  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">

      {/* Refresh strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <span className={cn('size-2 rounded-full', loading ? 'bg-amber animate-pulse' : 'bg-emerald')} />
          <span>Live · auto-refresh every 60s</span>
          <span className="opacity-60">· last update {timeAgo(lastUpdated)}</span>
        </div>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active Employees"
          value={String(data.employeeStats.active)}
          hint={`of ${data.employeeStats.total} total · ${data.employeeStats.onLeave} on leave`}
          gradient="bg-gradient-to-br from-violet to-[#8B7CFF]"
          icon={Users}
          href="/cms/employees"
        />
        <KpiCard
          label="Open Tasks"
          value={String(data.taskStats.todo + data.taskStats.inProgress)}
          hint={`${data.taskStats.overdue} overdue · ${data.taskStats.completedToday} done today`}
          gradient="bg-gradient-to-br from-sky to-[#5BD3EA]"
          icon={ListTodo}
          href="/cms/tasks"
        />
        <KpiCard
          label="Pending Leaves"
          value={String(data.leaveStats.pending)}
          hint={`${data.leaveStats.approved} approved · ${data.leaveStats.rejected} rejected`}
          gradient="bg-gradient-to-br from-coral to-[#FF9C92]"
          icon={CalendarOff}
          href="/cms/leave"
        />
        <KpiCard
          label="Today's Bookings"
          value={String(data.bookingStats.todayCount)}
          hint={`${data.bookingStats.monthCount} this month · view calendar`}
          gradient="bg-gradient-to-br from-emerald to-[#5BD9A4]"
          icon={CalendarDays}
          href="/cms/bookings/calendar"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Task Activity"
          subtitle="Created vs completed — last 14 days"
          action={
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand" />Created
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald" />Completed
              </span>
            </div>
          }>
          <TaskTrendChart data={data.taskTrend} />
        </Card>

        <Card title="Today's Attendance" subtitle={`${data.attendanceToday.date}`}>
          <AttendanceDonut data={data.attendanceToday} />
        </Card>
      </div>

      {/* ── Today's Events ── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-brand" />
            Today&apos;s Events
            {(data.todayEvents?.length ?? 0) > 0 && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand tabular-nums">
                {data.todayEvents.length}
              </span>
            )}
          </span>
        }
        subtitle="Bookings with events scheduled for today"
        action={
          <Link href="/cms/bookings/calendar" className="text-xs text-brand hover:underline flex items-center gap-1">
            Open Calendar <ArrowRight className="size-3" />
          </Link>
        }
      >
        <TodayEventsCard events={data.todayEvents ?? []} />
      </Card>

      {/* ── Triple row: Departments / Bookings / Leave ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Department Breakdown" subtitle={`${data.departmentBreakdown.length} departments`}
          action={
            <Link href="/cms/employees" className="text-xs text-brand hover:underline flex items-center gap-1">
              All <ArrowRight className="size-3" />
            </Link>
          }>
          <DepartmentList data={data.departmentBreakdown} />
        </Card>

        <Card title="Bookings Snapshot"
          action={
            <Link href="/cms/bookings/analysis" className="text-xs text-brand hover:underline flex items-center gap-1">
              Analysis <ArrowRight className="size-3" />
            </Link>
          }>
          <BookingMiniCard stats={data.bookingStats} />
        </Card>

        <Card title="Pending Approvals" subtitle={`${data.pendingLeaves.length} leave request${data.pendingLeaves.length !== 1 ? 's' : ''}`}
          action={
            data.pendingLeaves.length > 0 && (
              <Link href="/cms/leave" className="text-xs text-brand hover:underline flex items-center gap-1">
                Review <ArrowRight className="size-3" />
              </Link>
            )
          }>
          <PendingLeaves data={data.pendingLeaves} />
        </Card>
      </div>

      {/* ── Attendance trend + Top performers ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"
          title="Attendance Trend"
          subtitle="Daily check-ins — last 14 days"
          action={
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald" />Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber" />Late
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-violet" />Leave
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-coral" />Absent
              </span>
            </div>
          }>
          <AttendanceTrendChart data={data.attendanceTrend} />
        </Card>

        <Card title="Top Performers" subtitle="Tasks completed in last 30 days"
          action={<Award className="size-4 text-amber" />}>
          <TopPerformers data={data.topPerformers} />
        </Card>
      </div>

      {/* ── Activity feed + Holidays/Announcements ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"
          title="Recent Activity"
          subtitle="Latest events across tasks, leaves, bookings"
          action={<ListChecks className="size-4 text-ink-soft" />}>
          <ActivityFeed data={data.activity} />
        </Card>

        <Card title="What's Coming Up">
          <HolidaysAndAnnouncements
            holidays={data.upcomingHolidays}
            announcements={data.recentAnnouncements}
          />
        </Card>
      </div>
    </div>
  )
}
