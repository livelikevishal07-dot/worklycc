'use client'

import * as React from 'react'
import { CheckCircle2, Circle, RefreshCw, Loader2, Flame, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  recurrenceLabel,
  todayLocalIso,
  type RecurringTaskForEmployee,
} from '@/lib/recurring-tasks-shared'
import { useDashboardDataOptional } from './dashboard-data'

const PRIORITY_CONFIG: Record<string, { bar: string; label: string; chip: string }> = {
  urgent: { bar: 'bg-coral',    label: 'Urgent', chip: 'bg-coral/10 text-coral' },
  high:   { bar: 'bg-amber',    label: 'High',   chip: 'bg-amber/10 text-amber' },
  medium: { bar: 'bg-brand',    label: 'Medium', chip: 'bg-brand/10 text-brand' },
  low:    { bar: 'bg-ink-soft', label: 'Low',    chip: 'bg-surface-2 text-ink-soft' },
}

interface Props {
  employeeId: string
  compact?: boolean  // true = dashboard widget mode (fewer rows), false = full page
}

export function DailyTasksSection({ employeeId, compact = false }: Props) {
  // Use local-time today so the "date" we send matches isActiveToday's local
  // weekday check on the server (otherwise around midnight a completion gets
  // stored under a date the user doesn't consider "today").
  const today = todayLocalIso()
  const [tasks, setTasks]     = React.useState<RecurringTaskForEmployee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [toggling, setToggling] = React.useState<Set<string>>(new Set())

  // On the dashboard this list rides in the shared bundle. On the tasks page
  // there is no bundle, so it still fetches for itself.
  const bundle     = useDashboardDataOptional()
  const fromBundle = (bundle?.data?.recurring ?? null) as RecurringTaskForEmployee[] | null

  React.useEffect(() => {
    if (bundle) {
      if (fromBundle) { setTasks(fromBundle); setLoading(false) }
      return
    }
    if (!employeeId) return
    setLoading(true)
    fetch(`/api/recurring-tasks?employee_id=${employeeId}&date=${today}`)
      .then((r) => r.json())
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [bundle, fromBundle, employeeId, today])

  async function toggleDone(task: RecurringTaskForEmployee) {
    if (toggling.has(task.id)) return
    setToggling((s) => new Set(s).add(task.id))
    const wasCompleted = task.completed_today
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed_today: !wasCompleted } : t))
    try {
      await fetch(`/api/recurring-tasks/${task.id}/complete`, {
        method: wasCompleted ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, date: today }),
      })
    } catch {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed_today: wasCompleted } : t))
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(task.id); return n })
    }
  }

  // Don't render if no tasks and not loading
  if (!loading && tasks.length === 0) return null

  const doneCount  = tasks.filter((t) => t.completed_today).length
  const totalCount = tasks.length
  const pct        = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)
  const allDone    = totalCount > 0 && doneCount === totalCount
  const displayTasks = compact ? tasks.slice(0, 4) : tasks

  // Fixed locale prevents server (en-GB-style "Wednesday, 29 Apr") vs client
  // (en-US-style "Wednesday, Apr 29") hydration mismatch which discards the
  // server tree and leaves the page in a perma-loading state.
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/20 bg-surface shadow-card">

      {/* ── Header ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-5 py-4">
        {/* decorative rings */}
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-brand/8" />
        <div className="pointer-events-none absolute -right-2 -top-2 size-12 rounded-full bg-brand/10" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15">
              <RefreshCw className="size-4 text-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink">Today's Daily Tasks</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                  <Flame className="size-2.5" /> Daily
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-soft">{dateLabel}</p>
            </div>
          </div>

          {/* Progress pill */}
          {!loading && (
            <div className="shrink-0 text-right">
              {allDone ? (
                <div className="flex items-center gap-1 rounded-full bg-emerald/15 px-3 py-1.5 text-xs font-bold text-emerald">
                  <Trophy className="size-3.5" /> All done!
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 shadow-sm">
                  <span className="text-sm font-bold text-ink">{doneCount}</span>
                  <span className="text-xs text-ink-soft">/ {totalCount}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {!loading && totalCount > 0 && (
          <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-brand/15">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                allDone ? 'bg-emerald' : 'bg-brand'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Task list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : allDone ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald/10">
            <Trophy className="size-6 text-emerald" />
          </div>
          <p className="text-sm font-semibold text-ink">Great work! All {totalCount} tasks completed.</p>
          <p className="text-xs text-ink-soft">You're all caught up for today 🎉</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {displayTasks.map((task) => {
            const pc = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
            const isToggling = toggling.has(task.id)
            return (
              <li
                key={task.id}
                className={cn(
                  'group relative flex items-start gap-3 px-5 py-3.5 transition-colors',
                  task.completed_today ? 'bg-surface-2/30' : 'hover:bg-brand/3'
                )}
              >
                {/* Priority left bar */}
                {!task.completed_today && (
                  <div className={cn('absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full opacity-60', pc.bar)} />
                )}

                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleDone(task)}
                  disabled={isToggling}
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full transition-all',
                    isToggling && 'opacity-50'
                  )}
                >
                  {task.completed_today
                    ? <CheckCircle2 className="size-5 text-emerald" />
                    : <Circle className="size-5 text-border group-hover:text-brand transition-colors" />}
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'text-sm font-medium leading-snug',
                    task.completed_today ? 'line-through text-ink-soft' : 'text-ink'
                  )}>
                    {task.title}
                  </p>
                  {task.description && !task.completed_today && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{task.description}</p>
                  )}
                </div>

                {/* Badges */}
                {!task.completed_today && (
                  <div className="flex shrink-0 items-center gap-1.5 mt-0.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', pc.chip)}>
                      {pc.label}
                    </span>
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                      {recurrenceLabel(task)}
                    </span>
                  </div>
                )}
              </li>
            )
          })}

          {/* "X more" hint in compact mode */}
          {compact && tasks.length > 4 && (
            <li className="px-5 py-2.5 text-xs text-ink-soft text-center">
              +{tasks.length - 4} more daily tasks · <a href="/employee/tasks" className="font-medium text-brand hover:underline">View all</a>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
