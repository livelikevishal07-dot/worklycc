import 'server-only'
import { db } from './supabase'
import { computeScores, type AttendanceRow, type TaskRow, type RecurringRow } from './scoring'

/**
 * Real numbers for /cms/performance.
 *
 * This page used to render `lib/mock-data.ts` — a hardcoded "average score 82",
 * a top performer named Esther Howard, departments (Engineering, Design, HR)
 * that this company does not have, and a 12-month trend line generated from
 * `Math.sin`. It looked authoritative and was entirely invented.
 *
 * The trend is derived rather than stored: no historical score snapshot exists,
 * but the raw attendance, task and routine rows it is computed from are all
 * still there, so each past month can be scored after the fact. One fetch
 * covers the whole window and the rows are bucketed by month in memory —
 * scoring 12 months with 12 round trips would be 36 queries for one page load.
 */

const MONTHS_BACK = 12
const PAGE_SIZE   = 1000

/** Business timezone — a session at 11pm IST belongs to that day, not the UTC one. */
const TZ = process.env.WORKLY_TIMEZONE ?? 'Asia/Kolkata'

export interface TrendPoint {
  /** YYYY-MM */
  key:      string
  /** "Aug 26" */
  label:    string
  /** Team average composite score, 0-100 */
  score:    number
  /** Team average attendance for the month, 0-100 */
  attendance: number
}

export interface DepartmentScore {
  department: string
  avg:        number
  members:    number
  color:      string | null
}

export interface PerformanceOverview {
  /** Null when there is not a single scored month yet. */
  avgScore:      number | null
  topPerformer:  { name: string; score: number; department: string | null } | null
  /** Percentage points vs the previous month. Null when there is no prior month. */
  delta:         number | null
  tasksThisMonth: number
  trend:         TrendPoint[]
  departments:   DepartmentScore[]
  /** Label of the month everything above is measured over, e.g. "August 2026". */
  periodLabel:   string
}

/** Page through a PostgREST query — it caps any un-ranged response at 1000 rows,
 *  and a year of attendance across 15 staff comfortably exceeds that. */
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return all
}

function monthKey(iso: string): string {
  return iso.slice(0, 7) // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short', year: '2-digit', timeZone: 'UTC',
  })
}

function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export async function getPerformanceOverview(): Promise<PerformanceOverview> {
  const today = todayInTz()
  const [ty, tm] = today.split('-').map(Number)

  // Window start = first day of the month, MONTHS_BACK - 1 months ago.
  const startDate = new Date(Date.UTC(ty, tm - 1 - (MONTHS_BACK - 1), 1))
  const from = startDate.toISOString().slice(0, 10)
  const to   = today

  const { data: employees, error: eErr } = await db()
    .from('employees')
    .select('id, full_name, department:departments(name, color)')
    .in('status', ['active', 'on_leave'])
  if (eErr) throw eErr

  const staff = (employees ?? []) as unknown as {
    id: string; full_name: string; department: { name: string; color: string | null } | null
  }[]

  const empty: PerformanceOverview = {
    avgScore: null, topPerformer: null, delta: null, tasksThisMonth: 0,
    trend: [], departments: [], periodLabel: monthLabel(monthKey(today)),
  }
  if (staff.length === 0) return empty

  const ids = staff.map((e) => e.id)

  const [attendance, tasks, recurring] = await Promise.all([
    fetchAll<{ employee_id: string; status: string; date: string }>(() =>
      db().from('attendance_sessions')
        .select('employee_id, status, date')
        .in('employee_id', ids).gte('date', from).lte('date', to)
        .order('date', { ascending: true }).order('employee_id', { ascending: true })),

    fetchAll<{ employee_id: string; completed_at: string; task: any }>(() =>
      db().from('task_assignments')
        .select('employee_id, completed_at, task:tasks(deadline)')
        .in('employee_id', ids).eq('status', 'done')
        .not('completed_at', 'is', null)
        .gte('completed_at', `${from}T00:00:00Z`).lte('completed_at', `${to}T23:59:59Z`)
        .order('completed_at', { ascending: true }).order('employee_id', { ascending: true })),

    fetchAll<{ employee_id: string; date: string }>(() =>
      db().from('recurring_task_completions')
        .select('employee_id, date')
        .in('employee_id', ids).gte('date', from).lte('date', to)
        .order('date', { ascending: true }).order('employee_id', { ascending: true })),
  ])

  // ── Bucket every row by the month it belongs to ────────────────────────────

  type Bucket = { att: AttendanceRow[]; tasks: TaskRow[]; rec: RecurringRow[] }
  const buckets = new Map<string, Bucket>()
  const bucket = (k: string): Bucket => {
    let b = buckets.get(k)
    if (!b) { b = { att: [], tasks: [], rec: [] }; buckets.set(k, b) }
    return b
  }

  for (const r of attendance) {
    bucket(monthKey(r.date)).att.push({ employee_id: r.employee_id, status: r.status })
  }
  for (const r of tasks) {
    // PostgREST returns the embedded row as an object or a single-element array
    // depending on the relationship it infers — normalise both shapes.
    const t = Array.isArray(r.task) ? r.task[0] : r.task
    bucket(monthKey(r.completed_at)).tasks.push({
      employee_id: r.employee_id,
      completed_at: r.completed_at,
      deadline: t?.deadline ?? null,
    })
  }
  for (const r of recurring) {
    bucket(monthKey(r.date)).rec.push({ employee_id: r.employee_id })
  }

  // ── Score each month that actually has data ───────────────────────────────
  // Months before the system was in use would otherwise plot as a flat zero and
  // read as "the team scored nothing", which is worse than not drawing them.

  const scoredMonths = [...buckets.keys()].sort().map((key) => {
    const b = buckets.get(key)!
    const scores = computeScores(ids, b.att, b.tasks, b.rec)
    const withAttendance = scores.filter((s) => s.attendancePct > 0)
    return { key, scores, hasData: b.att.length > 0 || b.tasks.length > 0 || b.rec.length > 0, withAttendance }
  }).filter((m) => m.hasData)

  const trend: TrendPoint[] = scoredMonths.map((m) => {
    // Average over people who were actually present that month. Including staff
    // who had not joined yet would drag the team line down for no reason.
    const pool = m.withAttendance.length > 0 ? m.withAttendance : m.scores
    return {
      key:   m.key,
      label: monthLabel(m.key),
      score: Math.round(pool.reduce((s, x) => s + x.score, 0) / pool.length),
      attendance: Math.round(pool.reduce((s, x) => s + x.attendancePct, 0) / pool.length),
    }
  })

  const current  = scoredMonths[scoredMonths.length - 1]
  const previous = scoredMonths[scoredMonths.length - 2]
  if (!current) return empty

  const nameById = new Map(staff.map((e) => [e.id, e]))
  const currentPool = current.withAttendance.length > 0 ? current.withAttendance : current.scores

  const avgScore = Math.round(currentPool.reduce((s, x) => s + x.score, 0) / currentPool.length)

  const best = [...currentPool].sort((a, b) => b.score - a.score)[0]
  const bestEmp = best ? nameById.get(best.id) : undefined

  let delta: number | null = null
  if (previous) {
    const prevPool = previous.withAttendance.length > 0 ? previous.withAttendance : previous.scores
    const prevAvg = Math.round(prevPool.reduce((s, x) => s + x.score, 0) / prevPool.length)
    delta = avgScore - prevAvg
  }

  // ── Department breakdown, from the real departments table ─────────────────

  const byDept = new Map<string, { total: number; members: number; color: string | null }>()
  for (const s of currentPool) {
    const emp = nameById.get(s.id)
    const name = emp?.department?.name ?? 'Unassigned'
    const d = byDept.get(name) ?? { total: 0, members: 0, color: emp?.department?.color ?? null }
    d.total += s.score
    d.members += 1
    byDept.set(name, d)
  }

  const departments: DepartmentScore[] = [...byDept.entries()]
    .map(([department, d]) => ({
      department, members: d.members, color: d.color,
      avg: Math.round(d.total / d.members),
    }))
    .sort((a, b) => b.avg - a.avg || a.department.localeCompare(b.department))

  return {
    avgScore,
    topPerformer: bestEmp
      ? { name: bestEmp.full_name, score: best!.score, department: bestEmp.department?.name ?? null }
      : null,
    delta,
    tasksThisMonth: current.scores.reduce((s, x) => s + x.tasksDone, 0),
    trend,
    departments,
    periodLabel: monthLabel(current.key),
  }
}
