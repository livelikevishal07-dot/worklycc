'use client'

import dynamic from 'next/dynamic'

import type { TrendPoint } from '@/lib/db/performance'

/**
 * Loads the recharts implementation only once this page is on screen.
 *
 * recharts is ~110 kB gzipped and was being bundled into the initial JS of
 * every page that showed a chart, which on a free-tier host is the difference
 * between a snappy first paint and a visibly slow one. `ssr: false` is safe
 * here: the chart is decorative, sits behind the admin login, and recharts
 * measures the DOM to size itself, so it renders on the client regardless.
 */
export const PerformanceTrend = dynamic<{ data: TrendPoint[] }>(
  () => import('./performance-trend.chart').then((m) => m.PerformanceTrend),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="mb-4 h-10" />
        <div className="h-[260px] animate-pulse rounded-xl bg-surface-2" />
      </div>
    ),
  },
)
