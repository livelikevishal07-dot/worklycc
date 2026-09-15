'use client'

import * as React from 'react'
import {
  AlertCircle, CheckCircle2, Circle, Clock, MessageSquare,
  Plus, Tag, Users, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmployee } from '@/app/employee/context'
import { AvatarStack } from '@/components/ui/avatar'
import { type TaskDetail as Task } from '@/components/employee-dashboard/task-detail-drawer'

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority   = 'urgent' | 'high' | 'medium' | 'low'
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'

// ── Meta ──────────────────────────────────────────────────────────────────────

const PRIORITY_META: Record<Priority, { label: string; dot: string; chip: string; border: string }> = {
  urgent: { label: 'Urgent', dot: 'bg-coral',   chip: 'bg-coral/10 text-coral',   border: 'border-l-coral' },
  high:   { label: 'High',   dot: 'bg-amber',   chip: 'bg-amber/10 text-amber',   border: 'border-l-amber' },
  medium: { label: 'Medium', dot: 'bg-sky',     chip: 'bg-sky/10 text-sky',       border: 'border-l-sky' },
  low:    { label: 'Low',    dot: 'bg-ink-soft', chip: 'bg-surface-2 text-ink-soft', border: 'border-l-border' },
}

const STATUS_META: Record<TaskStatus, { label: string; chip: string }> = {
  todo:        { label: 'To Do',       chip: 'bg-surface-2 text-ink-muted' },
  in_progress: { label: 'In Progress', chip: 'bg-brand/10 text-brand' },
  review:      { label: 'In Review',   chip: 'bg-violet/10 text-violet' },
  done:        { label: 'Done',        chip: 'bg-emerald/10 text-emerald' },
  blocked:     { label: 'Blocked',     chip: 'bg-coral/10 text-coral' },
}

// ── Deadline urgency bar ──────────────────────────────────────────────────────
// Returns the % of time REMAINING (100 = fresh, 0 = expired).
// This bar depletes as deadline approaches — employees see it "running out".

interface UrgencyInfo {
  remainingPct: number   // 0–100 for the bar width
  barColor:     string
  textColor:    string
  label:        string   // "4d left" | "Due today" | "2d overdue"
  urgent:       boolean  // true when ≤25% remaining or overdue
}

function deadlineUrgency(createdAt: string, deadline: string | null, status: TaskStatus): UrgencyInfo | null {
  if (!deadline || status === 'done') return null

  const created  = new Date(createdAt).getTime()
  const due      = new Date(deadline).getTime()
  const now      = Date.now()
  const total    = Math.max(due - created, 1)
  const remaining = due - now
  const remainingPct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)))
  const days     = Math.ceil(remaining / 86_400_000)

  // Overdue
  if (remaining < 0) {
    return {
      remainingPct: 0,
      barColor:  'bg-coral',
      textColor: 'text-coral',
      label: `${Math.abs(days)}d overdue`,
      urgent: true,
    }
  }
  // Due today
  if (days === 0) {
    return { remainingPct, barColor: 'bg-coral', textColor: 'text-coral', label: 'Due today!', urgent: true }
  }
  // ≤ 25% time left
  if (remainingPct <= 25) {
    return { remainingPct, barColor: 'bg-coral',  textColor: 'text-coral',  label: `${days}d left`, urgent: true }
  }
  // ≤ 50% time left
  if (remainingPct <= 50) {
    return { remainingPct, barColor: 'bg-amber',  textColor: 'text-amber',  label: `${days}d left`, urgent: false }
  }
  // Plenty of time
  return { remainingPct, barColor: 'bg-emerald', textColor: 'text-emerald', label: `${days}d left`, urgent: false }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <ul className="divide-y divide-border">
      {[1, 2, 3].map((i) => (
        <li key={i} className="space-y-2 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="size-5 animate-pulse rounded-full bg-surface-2" />
            <div className="h-4 flex-1 animate-pulse rounded bg-surface-2" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-surface-2" />
          </div>
          <div className="ml-8 h-2 w-full animate-pulse rounded-full bg-surface-2" />
          <div className="ml-8 flex gap-2">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onOpen?: (task: Task) => void
  onNew?:  () => void
}

export function MyTasks({ onOpen, onNew }: Props) {
  const employee = useEmployee()
  const [filter, setFilter] = React.useState<'active' | 'all' | 'done'>('active')
  const [tasks,  setTasks]  = React.useState<Task[]>([])
  const [loading, setLoading] = React.useState(true)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    if (!employee.id) { setLoading(false); return }
    setLoading(true)
    try {
      const r    = await fetch(`/api/tasks?employee_id=${employee.id}&scope=dashboard`)
      const data: Task[] = await r.json()
      setTasks(Array.isArray(data) ? data : [])
    } catch { /* keep previous */ }
    finally { setLoading(false) }
  }, [employee.id])

  React.useEffect(() => { load() }, [load])

  // ── Optimistic toggle done ────────────────────────────────────────────────
  async function toggleDone(task: Task) {
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    setTasks((p) => p.map((t) => t.id === task.id ? { ...t, status: next } : t))
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
    } catch {
      setTasks((p) => p.map((t) => t.id === task.id ? { ...t, status: task.status } : t))
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const visible = tasks.filter((t) =>
    filter === 'active' ? t.status !== 'done'
    : filter === 'done' ? t.status === 'done'
    : true
  )
  const doneCount   = tasks.filter((t) => t.status === 'done').length
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0
  const overdueCount = tasks.filter((t) =>
    t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date()
  ).length

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">

      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">My Tasks</h2>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 px-2 py-0.5 text-[10px] font-bold text-coral">
                <Zap className="size-2.5" />{overdueCount} overdue
              </span>
            )}
          </div>
          {/* The card now loads open tasks plus the last 30 days of completed
              work, not the whole history, so the count is labelled for that
              window rather than reading as an all-time total. */}
          <p className="text-xs text-ink-soft">
            {loading ? 'Loading…' : `${doneCount} of ${tasks.length} completed · last 30 days`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          <div className="flex h-8 items-center rounded-lg border border-border bg-surface-2/40 p-0.5">
            {(['active', 'all', 'done'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={cn(
                  'h-7 rounded-md px-3 text-xs font-medium capitalize transition-colors',
                  filter === f ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                )}
              >{f}</button>
            ))}
          </div>
          <button type="button" onClick={onNew}
            className="grid size-8 place-items-center rounded-lg border border-border text-ink-soft hover:border-brand/30 hover:text-brand"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </header>

      {/* ── Overall progress bar ── */}
      {!loading && tasks.length > 0 && (
        <div className="border-b border-border px-5 py-2.5">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-soft">Overall progress</span>
            <span className={cn('font-semibold', progressPct === 100 ? 'text-emerald' : 'text-brand')}>
              {progressPct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-2">
            <div
              className={cn('h-full rounded-full transition-all duration-500',
                progressPct === 100 ? 'bg-emerald' : 'bg-brand')}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Task list ── */}
      {loading ? <Skeleton /> : (
        <ul className="divide-y divide-border">
          {visible.map((task) => {
            const pm   = PRIORITY_META[task.priority]
            const sm   = STATUS_META[task.status]
            const urg  = deadlineUrgency(task.created_at, task.deadline, task.status)
            const over = task.deadline && task.status !== 'done' && new Date(task.deadline) < new Date()

            const itemsDone  = task.items.filter((i) => i.completed).length
            const itemsTotal = task.items.length
            const subPct     = itemsTotal > 0 ? Math.round((itemsDone / itemsTotal) * 100) : null

            const teammates = task.assignments
              .filter((a) => a.employee_id !== employee.id && a.employee)
              .map((a) => a.employee!.full_name)

            return (
              <li
                key={task.id}
                className={cn(
                  'group relative border-l-4 transition-colors hover:bg-surface-2/40',
                  task.status === 'done' ? 'border-l-border opacity-55' : pm.border,
                  urg?.urgent && task.status !== 'done' ? 'bg-coral/[0.03]' : ''
                )}
              >
                <div className="flex items-start gap-3 px-4 py-3.5">

                  {/* ── Toggle done button ── */}
                  <button
                    type="button"
                    onClick={() => toggleDone(task)}
                    className="mt-0.5 shrink-0"
                    aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.status === 'done'
                      ? <CheckCircle2 className="size-5 text-emerald" />
                      : over
                        ? <AlertCircle className="size-5 text-coral" />
                        : <Circle className="size-5 text-border transition-colors hover:text-brand" />}
                  </button>

                  {/* ── Task body (click to open detail) ── */}
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpen?.(task)}>

                    {/* Title row */}
                    <div className="flex flex-wrap items-start gap-2">
                      <p className={cn(
                        'flex-1 text-sm font-semibold leading-snug',
                        task.status === 'done' ? 'line-through text-ink-soft' : 'text-ink'
                      )}>
                        {task.title}
                      </p>
                      {/* Priority */}
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', pm.chip)}>
                        <span className={cn('size-1.5 rounded-full', pm.dot)} />
                        {pm.label}
                      </span>
                    </div>

                    {/* Description */}
                    {task.description && task.status !== 'done' && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                        {task.description}
                      </p>
                    )}

                    {/* ── DEADLINE URGENCY BAR ── */}
                    {urg && task.status !== 'done' && (
                      <div className="mt-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ink-soft">
                            {urg.remainingPct > 0 ? 'Time remaining' : 'Deadline passed'}
                          </span>
                          <span className={cn('text-[10px] font-semibold', urg.textColor)}>
                            {urg.label}
                          </span>
                        </div>
                        {/* Depleting bar — shrinks toward zero as deadline approaches */}
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', urg.barColor)}
                            style={{ width: `${urg.remainingPct}%` }}
                          />
                          {/* Pulse animation when urgent */}
                          {urg.urgent && urg.remainingPct > 0 && (
                            <div
                              className={cn('absolute inset-y-0 left-0 animate-pulse rounded-full opacity-40', urg.barColor)}
                              style={{ width: `${urg.remainingPct}%` }}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Sub-task checklist progress ── */}
                    {subPct !== null && task.status !== 'done' && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-brand transition-all"
                            style={{ width: `${subPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-ink-soft tabular-nums">
                          {itemsDone}/{itemsTotal} steps
                        </span>
                      </div>
                    )}

                    {/* ── Meta row ── */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {/* Status */}
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', sm.chip)}>
                        {sm.label}
                      </span>

                      {/* Company */}
                      {task.company && (
                        <span className="flex items-center gap-1 text-[10px] text-ink-soft">
                          <Tag className="size-2.5" />
                          {task.company.name}
                        </span>
                      )}

                      {/* Team count */}
                      {teammates.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-ink-soft">
                          <Users className="size-2.5" />
                          {teammates.length} teammate{teammates.length !== 1 ? 's' : ''}
                        </span>
                      )}

                      {/* Created date */}
                      <span className="text-[10px] text-ink-soft/70">
                        Created {new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>

                  {/* ── Right column: team avatars ── */}
                  {teammates.length > 0 && (
                    <div className="shrink-0 pt-0.5">
                      <AvatarStack names={teammates} max={3} size="sm" />
                    </div>
                  )}
                </div>
              </li>
            )
          })}

          {visible.length === 0 && (
            <li className="py-14 text-center">
              <CheckCircle2 className="mx-auto mb-2 size-8 text-ink-soft/30" />
              <p className="text-sm text-ink-soft">
                {filter === 'done' ? 'No completed tasks yet.' : '🎉 All tasks complete!'}
              </p>
            </li>
          )}
        </ul>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-xs text-ink-soft">
          {tasks.filter((t) => t.status === 'in_progress').length} in progress
        </span>
        <a href="/employee/tasks" className="text-xs font-medium text-brand hover:underline">
          View all tasks →
        </a>
      </div>
    </div>
  )
}
