'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TrendPoint } from '@/lib/db/performance'

/**
 * Team performance over the last months that actually have data.
 *
 * This used to plot `Math.sin` — a decorative curve that drew the same shape
 * forever regardless of what anyone did. It now plots the real composite score,
 * recomputed per month from the attendance, task and routine rows of that month.
 *
 * Months before the system was in use are omitted rather than drawn as zero: a
 * flat line at the bottom reads as "the team scored nothing", which is worse
 * than an honest gap.
 */
export function PerformanceTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Performance trend</h2>
          <p className="text-xs text-ink-soft">
            {data.length === 0
              ? 'No scored months yet'
              : data.length === 1
                ? '1 month of data'
                : `Last ${data.length} months`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: '#6F5CFF' }} />
            Score
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: '#27C0DE' }} />
            Attendance
          </span>
        </div>
      </header>

      {data.length === 0 ? (
        <div className="grid h-[260px] place-items-center text-sm text-ink-soft">
          Once attendance and tasks are recorded, the trend appears here.
        </div>
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-score" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6F5CFF" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6F5CFF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-att" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#27C0DE" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#27C0DE" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--ink-soft))' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--ink-soft))' }}
                domain={[0, 100]}
              />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
                contentStyle={{
                  background: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [`${v}%`, name]}
              />
              <Area
                type="monotone" dataKey="attendance" name="Attendance"
                stroke="#27C0DE" strokeWidth={2} fill="url(#grad-att)"
              />
              <Area
                type="monotone" dataKey="score" name="Score"
                stroke="#6F5CFF" strokeWidth={2.5} fill="url(#grad-score)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
