'use client'

import dynamic from 'next/dynamic'

/**
 * Defers recharts (~110 kB gzipped) out of this page's initial bundle.
 * See the note in components/performance/performance-trend.tsx — same reasoning.
 *
 * The props type is re-declared rather than imported so that pulling in this
 * wrapper does not also pull in the chart module's imports at build time.
 */
export const CompletionTrend = dynamic(
  () => import('./completion-trend.chart').then((m) => m.CompletionTrend),
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
