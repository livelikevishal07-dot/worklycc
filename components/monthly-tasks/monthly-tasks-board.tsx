'use client'

import * as React from 'react'
import {
  CalendarClock, Check, ChevronLeft, ChevronRight, Plus, Trash2,
  Pencil, AlertTriangle, CircleCheck, X, IndianRupee, Loader2,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type Category = 'compliance' | 'payment' | 'subscription' | 'other'
type Status   = 'done' | 'overdue' | 'due_soon' | 'upcoming'

interface TaskView {
  id: string; title: string; description: string | null
  category: Category; due_day: number; amount: number | null
  due_date: string; status: Status; days_left: number | null
  completed: boolean; completed_at: string | null
  note: string | null; amount_paid: number | null
}

interface Overview {
  period: string; label: string
  total: number; done: number; overdue: number
  expected: number; paid: number
  tasks: TaskView[]
}

const CATEGORY_STYLE: Record<Category, { label: string; cls: string }> = {
  compliance:   { label: 'Compliance',   cls: 'bg-violet/12 text-violet' },
  payment:      { label: 'Payment',      cls: 'bg-emerald/12 text-emerald' },
  subscription: { label: 'Subscription', cls: 'bg-sky/12 text-sky' },
  other:        { label: 'Other',        cls: 'bg-amber/15 text-amber' },
}

function fmtINR(n: number) {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

function fmtDue(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Shift a YYYY-MM-01 period by n months. */
function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function statusChip(t: TaskView) {
  if (t.completed) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald/12 px-2 py-0.5 text-[11px] font-medium text-emerald">
      <CircleCheck className="size-3" /> Done
    </span>
  }
  if (t.status === 'overdue') {
    const late = t.days_left != null ? `${Math.abs(t.days_left)}d late` : 'Not done'
    return <span className="inline-flex items-center gap-1 rounded-full bg-coral/12 px-2 py-0.5 text-[11px] font-medium text-coral">
      <AlertTriangle className="size-3" /> {late}
    </span>
  }
  if (t.status === 'due_soon') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-medium text-amber">
      <CalendarClock className="size-3" />
      {t.days_left === 0 ? 'Due today' : `In ${t.days_left}d`}
    </span>
  }
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
    {t.days_left != null ? `In ${t.days_left}d` : 'Upcoming'}
  </span>
}

export function MonthlyTasksBoard() {
  const [period, setPeriod]   = React.useState<string | null>(null)
  const [data, setData]       = React.useState<Overview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId]   = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<TaskView | null>(null)
  const [adding, setAdding]   = React.useState(false)

  const load = React.useCallback(async (p?: string | null) => {
    setLoading(true)
    try {
      const qs  = p ? `?period=${encodeURIComponent(p)}` : ''
      const res = await fetch(`/api/monthly-tasks${qs}`, { cache: 'no-store' })
      if (res.ok) {
        const json: Overview = await res.json()
        setData(json)
        setPeriod(json.period)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  async function toggle(t: TaskView) {
    setBusyId(t.id)
    try {
      await fetch(`/api/monthly-tasks/${t.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ completed: !t.completed, period }),
      })
      await load(period)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: TaskView) {
    if (!confirm(`Remove "${t.title}" from every month? Past completions are removed too.`)) return
    setBusyId(t.id)
    try {
      await fetch(`/api/monthly-tasks/${t.id}`, { method: 'DELETE' })
      await load(period)
    } finally {
      setBusyId(null)
    }
  }

  const pct = data && data.total > 0 ? Math.round((data.done / data.total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Month switcher + progress */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => period && load(shiftPeriod(period, -1))}
            className="grid size-8 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-[10rem]">
            <h2 className="text-base font-semibold">{data?.label ?? '—'}</h2>
            <p className="text-xs text-ink-soft">
              {loading ? 'Loading…' : `${data?.done ?? 0} of ${data?.total ?? 0} done`}
            </p>
          </div>
          <button
            onClick={() => period && load(shiftPeriod(period, 1))}
            className="grid size-8 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>

          <button
            onClick={() => load()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2"
          >
            This month
          </button>

          <button
            onClick={() => setAdding(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            <Plus className="size-4" />
            Add task
          </button>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald' : 'bg-brand')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Done"     value={`${data?.done ?? 0}/${data?.total ?? 0}`} tone="text-emerald" />
          <Stat label="Overdue"  value={String(data?.overdue ?? 0)} tone={(data?.overdue ?? 0) > 0 ? 'text-coral' : 'text-ink'} />
          <Stat label="Expected" value={data?.expected ? fmtINR(data.expected) : '—'} tone="text-violet" />
          <Stat label="Recorded" value={data?.paid ? fmtINR(data.paid) : '—'} tone="text-sky" />
        </div>
      </div>

      {/* Task list */}
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        {loading && !data ? (
          <p className="p-8 text-center text-sm text-ink-soft">Loading…</p>
        ) : (data?.tasks.length ?? 0) === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No monthly tasks yet</p>
            <p className="mt-1 text-xs text-ink-soft">
              Add the things you repeat every month — GST filing, salary payment, hosting bills.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data!.tasks.map((t) => (
              <li key={t.id} className={cn('flex items-start gap-3 p-4', t.completed && 'bg-surface-2/40')}>
                <button
                  onClick={() => toggle(t)}
                  disabled={busyId === t.id}
                  className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition',
                    t.completed
                      ? 'border-emerald bg-emerald text-white'
                      : 'border-border hover:border-brand',
                  )}
                  aria-label={t.completed ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
                >
                  {busyId === t.id
                    ? <Loader2 className="size-3 animate-spin" />
                    : t.completed && <Check className="size-3.5" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('text-sm font-medium', t.completed && 'text-ink-soft line-through')}>
                      {t.title}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', CATEGORY_STYLE[t.category].cls)}>
                      {CATEGORY_STYLE[t.category].label}
                    </span>
                    {statusChip(t)}
                  </div>

                  {t.description && (
                    <p className="mt-0.5 truncate text-xs text-ink-soft">{t.description}</p>
                  )}

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3" />
                      Due {fmtDue(t.due_date)}
                    </span>
                    {t.amount != null && (
                      <span className="inline-flex items-center gap-1">
                        <IndianRupee className="size-3" />
                        {fmtINR(t.amount)} expected
                      </span>
                    )}
                    {t.completed && t.completed_at && (
                      <span>
                        Ticked {new Date(t.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {t.note && <span className="italic">“{t.note}”</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink"
                    aria-label={`Edit ${t.title}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-coral/10 hover:text-coral"
                    aria-label={`Delete ${t.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(adding || editing) && (
        <TaskDialog
          task={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={async () => { setAdding(false); setEditing(null); await load(period) }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2">
      <p className="text-[11px] text-ink-soft">{label}</p>
      <p className={cn('mt-0.5 text-base font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

// ── Add / edit dialog ─────────────────────────────────────────────────────────

function TaskDialog({
  task, onClose, onSaved,
}: {
  task: TaskView | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle]       = React.useState(task?.title ?? '')
  const [desc, setDesc]         = React.useState(task?.description ?? '')
  const [category, setCategory] = React.useState<Category>(task?.category ?? 'other')
  const [dueDay, setDueDay]     = React.useState(String(task?.due_day ?? 1))
  const [amount, setAmount]     = React.useState(task?.amount != null ? String(task.amount) : '')
  const [saving, setSaving]     = React.useState(false)
  const [error, setError]       = React.useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title:       title.trim(),
        description: desc.trim() || null,
        category,
        due_day:     Number(dueDay) || 1,
        amount:      amount.trim() === '' ? null : Number(amount),
      }
      const res = await fetch(
        task ? `/api/monthly-tasks/${task.id}` : '/api/monthly-tasks',
        {
          method:  task ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error ?? 'Could not save')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{task ? 'Edit task' : 'New monthly task'}</h3>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="GST filing" className={inputCls} required autoFocus />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">Description (optional)</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="File monthly GST return" className={inputCls} />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
              className={inputCls + ' cursor-pointer'}>
              <option value="compliance">Compliance</option>
              <option value="payment">Payment</option>
              <option value="subscription">Subscription</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Due day</span>
            <input type="number" min="1" max="31" value={dueDay}
              onChange={(e) => setDueDay(e.target.value)} className={inputCls} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Amount ₹</span>
            <input type="number" min="0" value={amount} placeholder="—"
              onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </label>
        </div>

        <p className="text-[11px] text-ink-soft">
          A due day past the end of a short month falls on that month&apos;s last day —
          set 31 for end-of-month tasks.
        </p>

        {error && <p className="text-xs text-coral">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink-muted hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={saving || !title.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : task ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </div>
  )
}
