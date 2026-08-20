'use client'

/**
 * The recharts half of the admin dashboard, split out so it loads as its own
 * chunk. recharts is ~110 kB gzipped and was sitting in the initial JS of
 * /cms — the page the admin opens every morning.
 *
 * `dayLabel` and `Tip` live here rather than in admin-dashboard.tsx because
 * nothing outside these three charts uses them.
 */

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts'
import type { DashboardSnapshot } from '@/lib/db/dashboard'
import { COLORS } from './chart-palette'

function dayLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5 text-xs shadow-pop">
      {label && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-soft">{p.name}:</span>
          <span className="font-semibold">{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  )
}

// ── Task Activity Trend (combined area chart) ────────────────────────────────

export function TaskTrendChart({ data }: { data: DashboardSnapshot['taskTrend'] }) {
  const display = data.map(d => ({ ...d, label: dayLabel(d.date) }))
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={display} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="tt-c" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.brand} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.brand} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="tt-d" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--ink-soft))' }} interval={2} />
          <YAxis axisLine={false} tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--ink-soft))' }} allowDecimals={false} />
          <Tooltip content={<Tip />} />
          <Area type="monotone" dataKey="created"   name="Created"   stroke={COLORS.brand}   strokeWidth={2} fill="url(#tt-c)" />
          <Area type="monotone" dataKey="completed" name="Completed" stroke={COLORS.emerald} strokeWidth={2} fill="url(#tt-d)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Today Attendance Donut ────────────────────────────────────────────────────

export function AttendanceDonut({ data }: { data: DashboardSnapshot['attendanceToday'] }) {
  const slices = [
    { name: 'Present',    value: data.present,   color: COLORS.emerald },
    { name: 'Late',       value: data.late,      color: COLORS.amber },
    { name: 'On Leave',   value: data.leave,     color: COLORS.violet },
    { name: 'Absent',     value: data.absent,    color: COLORS.coral },
    { name: 'Not Marked', value: data.notMarked, color: '#94a3b8' },
  ].filter(s => s.value > 0)
  const total = slices.reduce((s, x) => s + x.value, 0) || 1

  return (
    <div className="flex flex-col">
      <div className="relative h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" cx="50%" cy="50%"
              innerRadius={56} outerRadius={84} paddingAngle={2}>
              {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{data.present + data.late}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-soft">In Office</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {slices.map(s => (
          <div key={s.name} className="flex items-center justify-between rounded-lg bg-surface-2/50 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-xs font-medium">{s.name}</span>
            </div>
            <span className="text-xs font-bold">
              {s.value}
              <span className="ml-1 text-[10px] font-normal text-ink-soft">
                {Math.round((s.value / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Attendance Trend (stacked bar) ────────────────────────────────────────────

export function AttendanceTrendChart({ data }: { data: DashboardSnapshot['attendanceTrend'] }) {
  const display = data.map(d => ({ ...d, label: dayLabel(d.date) }))
  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={display} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false}
            tick={{ fontSize: 10, fill: 'hsl(var(--ink-soft))' }} interval={2} />
          <YAxis axisLine={false} tickLine={false}
            tick={{ fontSize: 10, fill: 'hsl(var(--ink-soft))' }} allowDecimals={false} />
          <Tooltip content={<Tip />} />
          <Bar dataKey="present" name="Present" stackId="a" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
          <Bar dataKey="late"    name="Late"    stackId="a" fill={COLORS.amber} />
          <Bar dataKey="leave"   name="Leave"   stackId="a" fill={COLORS.violet} />
          <Bar dataKey="absent"  name="Absent"  stackId="a" fill={COLORS.coral} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
