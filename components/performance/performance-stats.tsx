import { TrendingUp, Crown, Sparkles, ClipboardList } from 'lucide-react'

import type { PerformanceOverview } from '@/lib/db/performance'
import { cn } from '@/lib/utils'

const ACCENT_BG = {
  violet: 'bg-violet/15 text-violet',
  emerald: 'bg-emerald/15 text-emerald',
  amber: 'bg-amber/15 text-amber',
  sky: 'bg-sky/15 text-sky',
} as const

interface CardProps {
  label: string
  value: string | number
  hint: string
  icon: typeof TrendingUp
  accent: keyof typeof ACCENT_BG
}

function Card({ label, value, hint, icon: Icon, accent }: CardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', ACCENT_BG[accent])}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{hint}</p>
    </div>
  )
}

export function PerformanceStats({ data }: { data: PerformanceOverview }) {
  const { avgScore, topPerformer, delta, tasksThisMonth, periodLabel } = data

  // Every value here is either measured or shown as "—". Nothing is invented:
  // an empty month should look empty rather than plausible.
  const deltaLabel =
    delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}%`

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label="Average score"
        value={avgScore === null ? '—' : `${avgScore}%`}
        hint={avgScore === null ? 'No attendance or task data yet' : `All employees · ${periodLabel}`}
        icon={TrendingUp}
        accent="violet"
      />
      <Card
        label="Top performer"
        value={topPerformer?.name ?? '—'}
        hint={
          topPerformer
            ? `${topPerformer.score}%${topPerformer.department ? ` — ${topPerformer.department}` : ''}`
            : 'Nobody scored this month'
        }
        icon={Crown}
        accent="amber"
      />
      <Card
        label="Change"
        value={deltaLabel}
        hint={delta === null ? 'No previous month to compare' : 'vs last month'}
        icon={Sparkles}
        accent={delta !== null && delta < 0 ? 'amber' : 'emerald'}
      />
      <Card
        label="Tasks completed"
        value={tasksThisMonth}
        hint={periodLabel}
        icon={ClipboardList}
        accent="sky"
      />
    </div>
  )
}
