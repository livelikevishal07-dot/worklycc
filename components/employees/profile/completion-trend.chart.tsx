'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AssignmentRow } from '@/lib/db/tasks'
import type { RecurringCompletionRow } from '@/lib/db/recurring-tasks'

// Use fixed locale to prevent server/client hydration mismatch
function monthLabel(date: Date) {
  return date.toLocaleDateString('en-GB', { month: 'short' })
}

interface Bucket {
  label: string
  key: string
  /** Project / one-off task assignments completed in this month. */
  project: number
  /** Recurring (daily routine) completions in this month. */
  routine: number
}

function buildSeries(
  assignments: AssignmentRow[],
  recurringCompletions: RecurringCompletionRow[]
): Bucket[] {
  const now = new Date()
  const buckets: Bucket[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      label: monthLabel(d),
      key: `${d.getFullYear()}-${d.getMonth()}`,
      project: 0,
      routine: 0,
    })
  }

  const idx = new Map(buckets.map((b) => [b.key, b]))

  for (const a of assignments) {
    if (!a.completed_at) continue
    const c = new Date(a.completed_at)
    const k = `${c.getFullYear()}-${c.getMonth()}`
    const b = idx.get(k)
    if (!b) continue
    b.project += 1
  }

  for (const rc of recurringCompletions) {
    // rc.date is YYYY-MM-DD (calendar date)
    const [y, m] = rc.date.split('-').map(Number)
    const k = `${y}-${m - 1}`
    const b = idx.get(k)
    if (!b) continue
    b.routine += 1
  }

  return buckets
}

export function CompletionTrend({
  assignments,
  recurringCompletions = [],
}: {
  assignments: AssignmentRow[]
  recurringCompletions?: RecurringCompletionRow[]
}) {
  const data = buildSeries(assignments, recurringCompletions)
  const totalProject = data.reduce((s, d) => s + d.project, 0)
  const totalRoutine = data.reduce((s, d) => s + d.routine, 0)
  const grandTotal = totalProject + totalRoutine

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Completion trend</h2>
          <p className="text-xs text-ink-soft">
            Project tasks &amp; daily routine completions, last 6 months
          </p>
        </div>
        <span className="rounded-xl border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-ink-muted">
          {grandTotal} total
        </span>
      </header>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
              vertical={false}
            />
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
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--surface-2))' }}
              contentStyle={{
                background: 'hsl(var(--surface))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                value,
                name === 'project' ? 'Project tasks' : 'Daily routine',
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
              formatter={(name) =>
                name === 'project' ? 'Project tasks' : 'Daily routine'
              }
            />
            <Bar
              dataKey="project"
              stackId="completions"
              fill="hsl(var(--brand))"
              radius={[0, 0, 0, 0]}
              maxBarSize={48}
            />
            <Bar
              dataKey="routine"
              stackId="completions"
              fill="#34D399"
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
