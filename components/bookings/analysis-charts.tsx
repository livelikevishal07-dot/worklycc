'use client'

/**
 * The recharts half of the bookings analysis page, split into its own chunk.
 * recharts is ~110 kB gzipped and was loading up front on a page that is
 * opened occasionally. See components/dashboard/dashboard-charts.tsx.
 */

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts'
import * as React from 'react'
import type { Booking } from './analysis-utils'
import { fmt, toISO, diffDays, parseISO } from './analysis-utils'
import { useReveal } from './reveal-context'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const WEBSITE_COLORS: Record<string, string> = {
  BalloonDekor: '#6F5CFF',
  '7eventzz':   '#27C0DE',
  Giftlaya:     '#F47A6F',
}

const OCCASION_COLORS = [
  '#6F5CFF','#27C0DE','#F47A6F','#22C58B',
  '#F2B544','#A855F7','#EC4899','#F97316',
  '#06B6D4','#84CC16','#EF4444','#8B5CF6',
]

function ChartTip({ active, payload, label }: any) {
  const { revealed } = useReveal()
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-xs shadow-pop">
      {label && <p className="mb-1.5 font-semibold text-ink">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-soft">{p.name}:</span>
          <span className="font-semibold">{revealed ? `₹${fmt(Number(p.value))}` : "••••••"}</span>
        </div>
      ))}
    </div>
  )
}

export function TrendChart({ bookings, from, to }: { bookings: Booking[]; from: string; to: string }) {
  const { revealed } = useReveal()
  const days = diffDays(from, to)
  const useMonthly = days > 62

  const data = React.useMemo(() => {
    const start = parseISO(from)
    const end = parseISO(to)
    if (useMonthly) {
      const map = new Map<string, { label: string; revenue: number; advance: number }>()
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cursor <= end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
        map.set(key, { label: `${MONTHS[cursor.getMonth()].slice(0, 3)} ${String(cursor.getFullYear()).slice(2)}`, revenue: 0, advance: 0 })
        cursor.setMonth(cursor.getMonth() + 1)
      }
      bookings.forEach(b => {
        const key = b.order_date.slice(0, 7)
        const cur = map.get(key)
        if (cur) {
          cur.revenue += b.total_amount
          cur.advance += b.advance_paid
        }
      })
      return [...map.values()]
    }
    const out: { label: string; revenue: number; advance: number }[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate())
      const day = bookings.filter(b => b.order_date === iso)
      out.push({
        label: days <= 31 ? String(d.getDate()) : `${d.getDate()}/${d.getMonth() + 1}`,
        revenue: day.reduce((s, b) => s + b.total_amount, 0),
        advance: day.reduce((s, b) => s + b.advance_paid, 0),
      })
    }
    return out
  }, [bookings, from, to, days, useMonthly])

  const interval = data.length > 30 ? Math.ceil(data.length / 12) : data.length > 14 ? 2 : 0

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{useMonthly ? 'Monthly Revenue Trend' : 'Daily Revenue Trend'}</h3>
          <p className="text-xs text-ink-soft">{from} → {to} — by booking date</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-violet" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-emerald" />
            Advance
          </span>
        </div>
      </div>
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <defs>
              <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6F5CFF" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6F5CFF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-adv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C58B" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22C58B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--ink-soft))' }}
              interval={interval}
            />
            <YAxis axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--ink-soft))' }}
              tickFormatter={v => revealed ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) : "•••"}
            />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="advance" name="Advance"
              stroke="#22C58B" strokeWidth={2} fill="url(#g-adv)" />
            <Area type="monotone" dataKey="revenue" name="Revenue"
              stroke="#6F5CFF" strokeWidth={2.5} fill="url(#g-rev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Website Revenue ───────────────────────────────────────────────────────────

export function WebsiteChart({ bookings }: { bookings: Booking[] }) {
  const { revealed } = useReveal()
  const sites = ['BalloonDekor', '7eventzz', 'Giftlaya']
  const data = sites.map(site => ({
    name: site,
    Revenue: bookings.filter(b => b.website === site).reduce((s, b) => s + b.total_amount, 0),
    Count:   bookings.filter(b => b.website === site).length,
  }))

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h3 className="text-base font-semibold">Revenue by Website</h3>
      <p className="text-xs text-ink-soft mb-4">Total booking value per brand</p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--ink-soft))' }} />
            <YAxis axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--ink-soft))' }}
              tickFormatter={v => revealed ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) : "•••"} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="Revenue" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {data.map(d => (
                <Cell key={d.name} fill={WEBSITE_COLORS[d.name] ?? '#6F5CFF'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: WEBSITE_COLORS[d.name] }} />
            <span className="text-xs text-ink-soft">{d.name}</span>
            <span className="text-xs font-bold">{d.Count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Occasion Donut ────────────────────────────────────────────────────────────

const RADIAN = Math.PI / 180
export function OccasionChart({ bookings }: { bookings: Booking[] }) {
  const map = new Map<string, number>()
  bookings.forEach(b => map.set(b.occasion, (map.get(b.occasion) ?? 0) + 1))
  const data = [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.06) return null
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle"
        dominantBaseline="central" fontSize={10} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h3 className="text-base font-semibold">Occasion Breakdown</h3>
      <p className="text-xs text-ink-soft mb-4">Count distribution across event types</p>
      {data.length === 0 ? (
        <div className="h-[200px] grid place-items-center text-sm text-ink-soft">No data</div>
      ) : (
        <>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={50} outerRadius={82}
                  labelLine={false} label={renderLabel}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={OCCASION_COLORS[i % OCCASION_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [v, 'Bookings']}
                  contentStyle={{
                    background: 'hsl(var(--surface))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 12, fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {data.slice(0, 10).map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 min-w-0">
                <span className="size-2 shrink-0 rounded-full"
                  style={{ background: OCCASION_COLORS[i % OCCASION_COLORS.length] }} />
                <span className="truncate text-[11px] text-ink-soft">{d.name}</span>
                <span className="ml-auto shrink-0 text-[11px] font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
