import 'server-only'
import { db } from './supabase'

/**
 * The admin's own recurring monthly obligations — GST filing, salary payment,
 * hosting bills. Distinct from `recurring_tasks`, which is employee-assigned,
 * daily/weekly, and completed per date.
 *
 * A task is "done" for a month when a completion row exists for that month's
 * first day. The unique (task_id, period) constraint means ticking twice is a
 * no-op rather than a duplicate, so the checkbox is safe to double-click and
 * safe to call from two tabs.
 */

export type MonthlyCategory = 'compliance' | 'payment' | 'subscription' | 'other'
export type MonthlyStatus   = 'done' | 'overdue' | 'due_soon' | 'upcoming'

export interface MonthlyTask {
  id:          string
  title:       string
  description: string | null
  category:    MonthlyCategory
  due_day:     number
  amount:      number | null
  company_id:  string | null
  is_active:   boolean
  sort_order:  number
}

export interface MonthlyTaskView extends MonthlyTask {
  /** Actual due date in the selected month, after clamping. YYYY-MM-DD */
  due_date:     string
  status:       MonthlyStatus
  /** Negative when overdue. Null when the month is not the current one. */
  days_left:    number | null
  completed:    boolean
  completed_at: string | null
  note:         string | null
  amount_paid:  number | null
  company:      { id: string; name: string } | null
}

export interface MonthlySummary {
  period:      string   // YYYY-MM-01
  label:       string   // "September 2026"
  total:       number
  done:        number
  overdue:     number
  expected:    number   // sum of `amount` across active tasks
  paid:        number   // sum of amount_paid recorded this month
  tasks:       MonthlyTaskView[]
}

const TZ = process.env.WORKLY_TIMEZONE ?? 'Asia/Kolkata'

/** Today in the business timezone as YYYY-MM-DD — a bill due "today" in IST
 *  should not read as overdue because the server is on UTC. */
export function businessToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Normalise any YYYY-MM or YYYY-MM-DD to that month's first day. */
export function toPeriod(input?: string | null): string {
  const base = input && /^\d{4}-\d{2}/.test(input) ? input : businessToday()
  return `${base.slice(0, 7)}-01`
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

/**
 * The due date for a task in a given month.
 * A task due on the 31st still has a due date in February — clamped to the
 * last day rather than rolling into March, which is what "end of month"
 * obligations like GST actually mean.
 */
export function dueDateFor(period: string, dueDay: number): string {
  const [y, m] = period.split('-').map(Number)
  const day = Math.min(dueDay, daysInMonth(y, m))
  return `${period.slice(0, 7)}-${String(day).padStart(2, '0')}`
}

function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getMonthlyOverview(periodInput?: string): Promise<MonthlySummary> {
  const period = toPeriod(periodInput)
  const today  = businessToday()

  const [{ data: tasks, error: tErr }, { data: comps, error: cErr }] = await Promise.all([
    db().from('admin_monthly_tasks')
      .select('*, company:companies(id, name)')
      .eq('is_active', true)
      .order('sort_order').order('due_day').order('title'),
    db().from('admin_monthly_task_completions')
      .select('task_id, completed_at, note, amount_paid')
      .eq('period', period),
  ])
  if (tErr) throw tErr
  if (cErr) throw cErr

  const byTask = new Map((comps ?? []).map((c: any) => [c.task_id, c]))
  // Status is only meaningful relative to today for the CURRENT month. Looking
  // back at August, an unticked task is simply "not done", not "due in 3 days".
  const isCurrentMonth = period.slice(0, 7) === today.slice(0, 7)
  const isPastMonth    = period.slice(0, 7) < today.slice(0, 7)

  const views: MonthlyTaskView[] = (tasks ?? []).map((t: any) => {
    const due  = dueDateFor(period, t.due_day)
    const done = byTask.get(t.id)
    const left = isCurrentMonth ? diffDays(today, due) : null

    let status: MonthlyStatus
    if (done)              status = 'done'
    else if (isPastMonth)  status = 'overdue'
    else if (!isCurrentMonth) status = 'upcoming'      // a future month
    else if (left! < 0)    status = 'overdue'
    else if (left! <= 3)   status = 'due_soon'
    else                   status = 'upcoming'

    return {
      id: t.id, title: t.title, description: t.description,
      category: t.category, due_day: t.due_day,
      amount: num(t.amount), company_id: t.company_id,
      is_active: t.is_active, sort_order: t.sort_order,
      due_date: due,
      status,
      days_left: left,
      completed:    Boolean(done),
      completed_at: done?.completed_at ?? null,
      note:         done?.note ?? null,
      amount_paid:  num(done?.amount_paid),
      company:      t.company ?? null,
    }
  })

  return {
    period,
    label:    monthLabel(period),
    total:    views.length,
    done:     views.filter((v) => v.completed).length,
    overdue:  views.filter((v) => v.status === 'overdue').length,
    expected: views.reduce((s, v) => s + (v.amount ?? 0), 0),
    paid:     views.reduce((s, v) => s + (v.amount_paid ?? 0), 0),
    tasks:    views,
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createMonthlyTask(input: {
  title: string; description?: string | null; category?: MonthlyCategory
  due_day?: number; amount?: number | null; company_id?: string | null
}): Promise<MonthlyTask> {
  const { data: last } = await db().from('admin_monthly_tasks')
    .select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await db().from('admin_monthly_tasks')
    .insert({
      title:       input.title.trim(),
      description: input.description?.trim() || null,
      category:    input.category ?? 'other',
      due_day:     input.due_day ?? 1,
      amount:      input.amount ?? null,
      company_id:  input.company_id ?? null,
      sort_order,
    })
    .select().single()
  if (error) throw error
  return data as MonthlyTask
}

export async function updateMonthlyTask(
  id: string,
  patch: Partial<Pick<MonthlyTask, 'title' | 'description' | 'category' | 'due_day' | 'amount' | 'company_id' | 'is_active' | 'sort_order'>>,
): Promise<MonthlyTask> {
  const { data, error } = await db().from('admin_monthly_tasks')
    .update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as MonthlyTask
}

export async function deleteMonthlyTask(id: string): Promise<void> {
  const { error } = await db().from('admin_monthly_tasks').delete().eq('id', id)
  if (error) throw error
}

/** Tick a task for a month. Idempotent: repeating it updates the note/amount
 *  rather than erroring on the unique constraint. */
export async function completeMonthlyTask(
  taskId: string,
  periodInput: string | undefined,
  extras: { note?: string | null; amount_paid?: number | null } = {},
): Promise<void> {
  const period = toPeriod(periodInput)
  const { error } = await db()
    .from('admin_monthly_task_completions')
    .upsert(
      {
        task_id:     taskId,
        period,
        note:        extras.note?.trim() || null,
        amount_paid: extras.amount_paid ?? null,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'task_id,period' },
    )
  if (error) throw error
}

/** Untick — removes the completion for that month. */
export async function uncompleteMonthlyTask(taskId: string, periodInput?: string): Promise<void> {
  const { error } = await db()
    .from('admin_monthly_task_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('period', toPeriod(periodInput))
  if (error) throw error
}

/** Last 6 months of completion counts, for the "history" strip. */
export async function getRecentHistory(months = 6): Promise<
  { period: string; label: string; done: number; total: number }[]
> {
  const today = businessToday()
  const [ty, tm] = today.split('-').map(Number)

  const periods: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1 - i, 1))
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`)
  }

  const [{ count: total }, { data: comps, error }] = await Promise.all([
    db().from('admin_monthly_tasks').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db().from('admin_monthly_task_completions').select('period').in('period', periods),
  ])
  if (error) throw error

  const counts = new Map<string, number>()
  for (const c of comps ?? []) {
    const p = String((c as any).period).slice(0, 10)
    counts.set(p, (counts.get(p) ?? 0) + 1)
  }

  return periods.map((p) => ({
    period: p,
    label:  monthLabel(p),
    done:   counts.get(p) ?? 0,
    total:  total ?? 0,
  }))
}
