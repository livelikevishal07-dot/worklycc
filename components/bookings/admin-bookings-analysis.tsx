'use client'

import * as React from 'react'
import {
  BookOpen, IndianRupee, Wallet, Clock,
  TrendingUp, CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReveal, maskedINR } from './reveal-context'
import { RevealToggle } from './reveal-toggle'
import dynamic from 'next/dynamic'
import { fmt, toISO, diffDays } from './analysis-utils'
import type { Booking } from './analysis-utils'

// recharts loads on demand rather than up front. ssr: false because recharts
// sizes itself off the DOM and only ever renders client-side anyway.
function ChartSkeleton({ h }: { h: number }) {
  return <div className="animate-pulse rounded-xl bg-surface-2" style={{ height: h }} />
}
const TrendChart = dynamic(
  () => import('./analysis-charts').then((m) => m.TrendChart),
  { ssr: false, loading: () => <ChartSkeleton h={260} /> },
)
const WebsiteChart = dynamic(
  () => import('./analysis-charts').then((m) => m.WebsiteChart),
  { ssr: false, loading: () => <ChartSkeleton h={220} /> },
)
const OccasionChart = dynamic(
  () => import('./analysis-charts').then((m) => m.OccasionChart),
  { ssr: false, loading: () => <ChartSkeleton h={220} /> },
)


interface EmployeeOption {
  id:        string
  full_name: string
}

interface Props {
  employees: EmployeeOption[]
}

const PLATFORM_COLORS: Record<string, string> = {
  WhatsApp: '#22C58B',
  Website:  '#6F5CFF',
  Others:   '#F2B544',
}


// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, bgCls, textCls, icon: Icon,
}: {
  label: string; value: string; sub?: string
  bgCls: string; textCls: string; icon: React.ElementType
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className={cn('grid size-10 place-items-center rounded-xl', bgCls, textCls)}>
        <Icon className="size-[18px]" />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{label}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </div>
  )
}


// ── Platform Breakdown ────────────────────────────────────────────────────────

function PlatformChart({ bookings }: { bookings: Booking[] }) {
  const { revealed } = useReveal()
  const platforms = ['WhatsApp', 'Website', 'Others']
  const total = bookings.length || 1
  const data = platforms.map(p => ({
    name: p,
    count:   bookings.filter(b => b.booking_platform === p).length,
    revenue: bookings.filter(b => b.booking_platform === p).reduce((s, b) => s + b.total_amount, 0),
    color:   PLATFORM_COLORS[p],
  }))

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h3 className="text-base font-semibold">Booking Platform</h3>
      <p className="text-xs text-ink-soft mb-5">How customers are reaching you</p>
      <div className="space-y-4">
        {data.map(d => (
          <div key={d.name}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-sm font-medium">{d.name}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-ink-soft">{maskedINR(d.revenue, revealed)}</span>
                <span className="text-sm font-bold">{d.count}
                  <span className="ml-1 text-xs font-normal text-ink-soft">
                    ({Math.round((d.count / total) * 100)}%)
                  </span>
                </span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round((d.count / total) * 100)}%`, background: d.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Employee Leaderboard ──────────────────────────────────────────────────────

function EmployeeLeaderboard({ bookings }: { bookings: Booking[] }) {
  const { revealed } = useReveal()
  const map = new Map<string, { name: string; count: number; revenue: number }>()
  bookings.forEach(b => {
    const name = b.employee?.full_name ?? 'Unknown'
    const prev = map.get(b.employee_id) ?? { name, count: 0, revenue: 0 }
    map.set(b.employee_id, {
      name, count: prev.count + 1,
      revenue: prev.revenue + b.total_amount,
    })
  })
  const rows = [...map.values()].sort((a, b) => b.count - a.count)
  const maxCount = Math.max(1, ...rows.map(r => r.count))
  const rankColors = ['#F2B544', '#9CA3AF', '#CD7C2A']

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h3 className="text-base font-semibold">Employee Leaderboard</h3>
      <p className="text-xs text-ink-soft mb-5">Bookings recorded per team member</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No data for this period</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => (
            <div key={r.name}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0 grid size-6 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: rankColors[i] ?? '#6F5CFF' }}>
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{r.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-ink-soft">{maskedINR(r.revenue, revealed)}</span>
                  <span className="text-sm font-bold">{r.count}
                    <span className="ml-1 text-xs font-normal text-ink-soft">entries</span>
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brand transition-all duration-500"
                  style={{ width: `${Math.round((r.count / maxCount) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Analysis Component ───────────────────────────────────────────────────

type RangeMode = 'today' | 'week' | 'month' | '6months' | 'custom'

const RANGE_LABELS: Record<RangeMode, string> = {
  today:    'Today',
  week:     'Last 7 days',
  month:    'Last 30 days',
  '6months': 'Last 6 months',
  custom:   'Custom',
}

function todayISO() {
  const d = new Date()
  return toISO(d.getFullYear(), d.getMonth(), d.getDate())
}

function computeRange(mode: RangeMode, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  const to = todayISO()
  if (mode === 'today') return { from: to, to }
  if (mode === 'week') {
    const s = new Date(now); s.setDate(now.getDate() - 6)
    return { from: toISO(s.getFullYear(), s.getMonth(), s.getDate()), to }
  }
  if (mode === 'month') {
    const s = new Date(now); s.setDate(now.getDate() - 29)
    return { from: toISO(s.getFullYear(), s.getMonth(), s.getDate()), to }
  }
  if (mode === '6months') {
    const s = new Date(now); s.setMonth(now.getMonth() - 6); s.setDate(s.getDate() + 1)
    return { from: toISO(s.getFullYear(), s.getMonth(), s.getDate()), to }
  }
  if (customFrom && customTo) {
    return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom }
  }
  return { from: to, to }
}

export function AdminBookingsAnalysis({ employees }: Props) {
  const { revealed } = useReveal()
  const [rangeMode, setRangeMode] = React.useState<RangeMode>('month')
  const [customFrom, setCustomFrom] = React.useState(todayISO())
  const [customTo, setCustomTo]   = React.useState(todayISO())

  const { from, to } = React.useMemo(
    () => computeRange(rangeMode, customFrom, customTo),
    [rangeMode, customFrom, customTo],
  )
  const totalDays = Math.max(1, diffDays(from, to))

  const [empFilter,  setEmpFilter]  = React.useState('')
  const [siteFilter, setSiteFilter] = React.useState('')
  const [platFilter, setPlatFilter] = React.useState('')

  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading,  setLoading]  = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ from, to, with_employee: '1' })
      if (empFilter) sp.set('employee_id', empFilter)
      const res = await fetch(`/api/bookings?${sp}`)
      const data = await res.json()
      // Defensive: ensure numeric fields are real numbers even if the
      // backend ever sends them as strings (Postgres `numeric` quirk).
      const rows: Booking[] = Array.isArray(data)
        ? data.map((b: any) => ({
            ...b,
            total_amount: Number(b.total_amount) || 0,
            advance_paid: Number(b.advance_paid) || 0,
          }))
        : []
      setBookings(rows)
    } finally {
      setLoading(false)
    }
  }, [from, to, empFilter])

  React.useEffect(() => { load() }, [load])

  const filtered = bookings.filter(b =>
    (!siteFilter || b.website          === siteFilter) &&
    (!platFilter || b.booking_platform === platFilter)
  )

  const totalBookings = filtered.length
  const totalRevenue  = filtered.reduce((s, b) => s + b.total_amount, 0)
  const totalAdvance  = filtered.reduce((s, b) => s + b.advance_paid, 0)
  const totalPending  = totalRevenue - totalAdvance
  const avgOrderValue = totalBookings > 0 ? totalRevenue / totalBookings : 0
  const avgPerDay     = totalBookings / totalDays

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5 shadow-card">
          <CalendarRange className="size-4 text-ink-muted" />
          <select value={rangeMode}
            onChange={e => setRangeMode(e.target.value as RangeMode)}
            className="bg-transparent text-sm font-semibold text-ink focus:outline-none cursor-pointer">
            {(Object.keys(RANGE_LABELS) as RangeMode[]).map(k => (
              <option key={k} value={k}>{RANGE_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {rangeMode === 'custom' && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-card">
            <input type="date" value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-transparent text-sm focus:outline-none cursor-pointer" />
            <span className="text-ink-soft text-xs">→</span>
            <input type="date" value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-transparent text-sm focus:outline-none cursor-pointer" />
          </div>
        )}

        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
          className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-ink-muted shadow-card focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer">
          <option value="">All Employees</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>

        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-ink-muted shadow-card focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer">
          <option value="">All Websites</option>
          {['BalloonDekor', '7eventzz', 'Giftlaya'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select value={platFilter} onChange={e => setPlatFilter(e.target.value)}
          className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-ink-muted shadow-card focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer">
          <option value="">All Platforms</option>
          {['WhatsApp', 'Website', 'Others'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {loading && (
          <span className="text-xs text-ink-soft animate-pulse">Loading…</span>
        )}

        <RevealToggle className="ml-auto" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Total Bookings" value={String(totalBookings)}
          sub={RANGE_LABELS[rangeMode]}
          bgCls="bg-brand/10" textCls="text-brand" icon={BookOpen}
        />
        <StatCard
          label="Total Revenue" value={maskedINR(totalRevenue, revealed)}
          sub="all orders combined"
          bgCls="bg-violet/10" textCls="text-violet" icon={IndianRupee}
        />
        <StatCard
          label="Avg Order Value" value={maskedINR(avgOrderValue, revealed)}
          sub={`across ${fmt(totalBookings)} order${totalBookings === 1 ? '' : 's'}`}
          bgCls="bg-amber/10" textCls="text-amber" icon={TrendingUp}
        />
        <StatCard
          label="Avg Bookings / Day" value={avgPerDay.toFixed(avgPerDay >= 10 ? 0 : 1)}
          sub={`over ${totalDays} day${totalDays === 1 ? '' : 's'}`}
          bgCls="bg-sky/10" textCls="text-sky" icon={CalendarRange}
        />
        <StatCard
          label="Advance Collected" value={maskedINR(totalAdvance, revealed)}
          sub={revealed ? `${totalRevenue ? Math.round((totalAdvance / totalRevenue) * 100) : 0}% collected` : "collected"}
          bgCls="bg-emerald/10" textCls="text-emerald" icon={Wallet}
        />
        <StatCard
          label="Balance Pending" value={maskedINR(totalPending, revealed)}
          sub="yet to collect"
          bgCls="bg-coral/10" textCls="text-coral" icon={Clock}
        />
      </div>

      <TrendChart bookings={filtered} from={from} to={to} />

      <div className="grid gap-5 lg:grid-cols-2">
        <WebsiteChart  bookings={filtered} />
        <OccasionChart bookings={filtered} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PlatformChart       bookings={filtered} />
        <EmployeeLeaderboard bookings={filtered} />
      </div>
    </div>
  )
}
