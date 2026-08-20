import 'server-only'

/**
 * The one definition of an employee performance score.
 *
 * Pure function, no database access — callers fetch the rows for whatever
 * period they care about and pass them in. The leaderboard scores the current
 * week or month; the performance page scores each of the last several months
 * from a single wider fetch. Both go through here so the number on one screen
 * can never drift from the number on the other.
 */

export interface AttendanceRow { employee_id: string; status: string }
export interface TaskRow       { employee_id: string; completed_at: string | null; deadline: string | null }
export interface RecurringRow  { employee_id: string }

export interface ScoredEmployee {
  id:              string
  attendancePct:   number
  deadlineHitRate: number
  tasksDone:       number
  recurringDone:   number
  score:           number
}

/** Weights: attendance 40% | deadline hit rate 25% | tasks 20% | recurring 15%. */
export function computeScores(
  employeeIds: string[],
  attendance: AttendanceRow[],
  tasks: TaskRow[],
  recurring: RecurringRow[],
): ScoredEmployee[] {
  type AttAcc  = { present: number; late: number; eligible: number }
  type TaskAcc = { done: number; onTime: number; withDeadline: number }

  const attMap  = new Map<string, AttAcc>()
  const taskMap = new Map<string, TaskAcc>()
  const recMap  = new Map<string, number>()

  for (const id of employeeIds) {
    attMap.set(id,  { present: 0, late: 0, eligible: 0 })
    taskMap.set(id, { done: 0, onTime: 0, withDeadline: 0 })
    recMap.set(id,  0)
  }

  for (const r of attendance) {
    const m = attMap.get(r.employee_id)
    if (!m) continue
    if      (r.status === 'present') { m.present++; m.eligible++ }
    else if (r.status === 'late')    { m.late++;    m.eligible++ }
    else if (r.status === 'absent')  {              m.eligible++ }
    // leave / holiday → not an eligible working day
  }

  for (const r of tasks) {
    const m = taskMap.get(r.employee_id)
    if (!m) continue
    m.done++
    if (r.deadline) {
      m.withDeadline++
      if (r.completed_at && new Date(r.completed_at) <= new Date(r.deadline)) m.onTime++
    }
  }

  for (const r of recurring) {
    if (recMap.has(r.employee_id)) recMap.set(r.employee_id, (recMap.get(r.employee_id) ?? 0) + 1)
  }

  const raw = employeeIds.map((id) => {
    const att = attMap.get(id)!
    const tk  = taskMap.get(id)!
    const rec = recMap.get(id) ?? 0

    // present = 100%, late = 70%, absent = 0%
    const attendancePct = att.eligible === 0
      ? 0
      : Math.min(100, Math.round(((att.present + att.late * 0.7) / att.eligible) * 100))

    // No deadlined tasks completed: neutral if nothing was done at all,
    // perfect if work was done but none of it carried a deadline.
    const deadlineHitRate = tk.withDeadline === 0
      ? (tk.done === 0 ? 50 : 100)
      : Math.round((tk.onTime / tk.withDeadline) * 100)

    return { id, attendancePct, deadlineHitRate, tasksDone: tk.done, recurringDone: rec }
  })

  // Productivity is graded on a curve against the best performer in the same
  // period — an absolute task count means nothing without knowing the workload.
  const maxTasks = Math.max(...raw.map((r) => r.tasksDone), 1)
  const maxRec   = Math.max(...raw.map((r) => r.recurringDone), 1)

  return raw.map((r) => ({
    ...r,
    score: Math.round(
      r.attendancePct                     * 0.40 +
      r.deadlineHitRate                   * 0.25 +
      (r.tasksDone     / maxTasks) * 100  * 0.20 +
      (r.recurringDone / maxRec)   * 100  * 0.15
    ),
  }))
}
