'use client'

import { ChevronDown } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { PERFORMANCE_TREND } from '@/lib/mock-data'

export function PerformanceTrend() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Performance trend</h2>
          <p className="text-xs text-ink-soft">Past 12 months</p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-ink-muted">
          All employees
          <ChevronDown className="size-3.5" />
        </button>
      </header>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={PERFORMANCE_TREND} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-you" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6F5CFF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6F5CFF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-team" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#27C0DE" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#27C0DE" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--ink-soft))' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--ink-soft))' }}
              domain={[60, 100]}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'hsl(var(--surface))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey="team" stroke="#27C0DE" strokeWidth={2} fill="url(#grad-team)" />
            <Area type="monotone" dataKey="you" stroke="#6F5CFF" strokeWidth={2.5} fill="url(#grad-you)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
