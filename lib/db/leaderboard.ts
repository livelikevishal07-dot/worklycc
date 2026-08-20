import 'server-only'
import { db } from './supabase'
import { computeScores } from './scoring'

// ── Types ──────────────────────────────────────────────────────────────────────

export type LeaderboardPeriod = 'weekly' | 'monthly'

export interface LeaderboardEntry {
  employee_id: string
  full_name: string
  avatar_url: string | null
  role: string | null
  department: string | null
  // raw metrics (displayed in detail rows)
  attendancePct: number     // 0-100
  deadlineHitRate: number   // 0-100
  tasksDone: number         // absolute count in period
  recurringDone: number     // absolute count in period
  // composite
  score: number             // 0-100
  rank: number              // 1-based
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPeriodDates(period: LeaderboardPeriod): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().slice(0, 10) // YYYY-MM-DD

  if (period === 'weekly') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    return { start: d.toISOString().slice(0, 10), end }
  }

  // monthly = current calendar month
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  return { start, end }
}

// ── Main query ─────────────────────────────────────────────────────────────────

export async function getLeaderboard(
  period: LeaderboardPeriod
): Promise<LeaderboardEntry[]> {
  const { start, end } = getPeriodDates(period)

  // 1. All active/on-leave employees
  const { data: employees, error: eErr } = await db()
    .from('employees')
    .select('id, full_name, avatar_url, role:roles(name), department:departments(name)')
    .in('status', ['active', 'on_leave'])
    .order('full_name', { ascending: true })

  if (eErr) throw eErr
  if (!employees || employees.length === 0) return []

  const ids = (employees as { id: string }[]).map((e) => e.id)

  // 2. Parallel data fetch
  const [attRes, taskRes, recRes] = await Promise.all([
    // Attendance sessions in period
    db()
      .from('attendance_sessions')
      .select('employee_id, status')
      .in('employee_id', ids)
      .gte('date', start)
      .lte('date', end),

    // Completed task assignments in period (with task deadline for on-time check)
    db()
      .from('task_assignments')
      .select('employee_id, completed_at, task:tasks(deadline)')
      .in('employee_id', ids)
      .eq('status', 'done')
      .not('completed_at', 'is', null)
      .gte('completed_at', `${start}T00:00:00Z`)
      .lte('completed_at', `${end}T23:59:59Z`),

    // Recurring completions in period
    db()
      .from('recurring_task_completions')
      .select('employee_id')
      .in('employee_id', ids)
      .gte('date', start)
      .lte('date', end),
  ])

  // ── Score ───────────────────────────────────────────────────────────────────
  // The formula lives in ./scoring so this and /cms/performance stay identical.

  const scored = computeScores(
    ids,
    (attRes.data ?? []) as { employee_id: string; status: string }[],
    (taskRes.data ?? []).map((r: any) => {
      // PostgREST returns the embedded task as an object or a one-element array
      // depending on the relationship it infers — normalise both shapes.
      const t = Array.isArray(r.task) ? r.task[0] : r.task
      return {
        employee_id:  r.employee_id,
        completed_at: r.completed_at,
        deadline:     t?.deadline ?? null,
      }
    }),
    (recRes.data ?? []) as { employee_id: string }[],
  )

  // Sort descending
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  const empById = new Map<string, Record<string, unknown>>(
    (employees as Record<string, unknown>[]).map((e) => [e.id as string, e])
  )

  return scored.map((s, idx): LeaderboardEntry => {
    const e = empById.get(s.id)!
    return {
      employee_id:     s.id,
      full_name:       e.full_name as string,
      avatar_url:      (e.avatar_url as string | null) ?? null,
      role:            (e.role as { name: string } | null)?.name ?? null,
      department:      (e.department as { name: string } | null)?.name ?? null,
      attendancePct:   s.attendancePct,
      deadlineHitRate: s.deadlineHitRate,
      tasksDone:       s.tasksDone,
      recurringDone:   s.recurringDone,
      score:           s.score,
      rank:            idx + 1,
    }
  })
}
