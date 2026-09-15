import 'server-only'

import { db } from './supabase'
import { mapTaskStatusToAssignmentStatus } from '@/lib/metrics'
import { sendPushToEmployees } from '@/lib/push'

export interface TaskRow {
  id: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'
  deadline: string | null
  company_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface AssignmentRow {
  id: string
  task_id: string
  employee_id: string
  status: 'not_started' | 'in_progress' | 'done' | 'blocked'
  started_at: string | null
  completed_at: string | null
  hours_logged: number
  notes: string | null
  task: TaskRow & {
    company: { id: string; name: string; color: string } | null
  }
}

export interface TaskItem {
  id: string
  title: string
  completed: boolean
  sort_order: number
}

export interface TaskWithDetails extends TaskRow {
  company: { id: string; name: string; color: string } | null
  assignments: Array<{
    id: string
    employee_id: string
    status: AssignmentRow['status']
    hours_logged: number
    employee: { id: string; full_name: string } | null
  }>
  items: TaskItem[]
}

const ASSIGNMENT_SELECT =
  '*, task:tasks ( *, company:companies ( id, name, color ) )'

const TASK_DETAIL_SELECT =
  '*, company:companies ( id, name, color ), assignments:task_assignments ( id, employee_id, status, hours_logged, employee:employees ( id, full_name ) ), items:task_items ( id, title, completed, sort_order )'

// ── Notification helpers ──────────────────────────────────────────────────
// Build a single, consistent push body that surfaces priority and deadline.
// Kept pure so create + update paths produce identical-looking notifications.

const PRIORITY_TAG: Record<TaskRow['priority'], string> = {
  urgent: '🔴 URGENT',
  high:   '🟠 High',
  medium: '🟡 Medium',
  low:    '🟢 Low',
}

function formatDeadlineHint(deadlineIso: string | null | undefined): string | null {
  if (!deadlineIso) return null
  const due = new Date(deadlineIso)
  if (Number.isNaN(due.getTime())) return null
  const now = new Date()
  const sameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow =
    due.getFullYear() === tomorrow.getFullYear() &&
    due.getMonth() === tomorrow.getMonth() &&
    due.getDate() === tomorrow.getDate()
  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay)   return `Due today · ${time}`
  if (isTomorrow) return `Due tomorrow · ${time}`
  const date = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `Due ${date} · ${time}`
}

function buildAssignmentPush(task: {
  title: string
  priority: TaskRow['priority']
  deadline: string | null
}): { title: string; body: string; url: string } {
  const lines = [PRIORITY_TAG[task.priority], formatDeadlineHint(task.deadline)].filter(Boolean) as string[]
  const body = lines.length > 0 ? `${task.title}\n${lines.join(' · ')}` : task.title
  return {
    title: '📋 New task assigned',
    body,
    url: '/employee/tasks',
  }
}

// ── List / Get ─────────────────────────────────────────────────────────────

export interface ListTasksParams {
  status?: TaskRow['status']
  priority?: TaskRow['priority']
  company_id?: string
  limit?: number
}

export async function listTasks(
  params: ListTasksParams = {}
): Promise<TaskWithDetails[]> {
  let q = db()
    .from('tasks')
    .select(TASK_DETAIL_SELECT)
    .order('created_at', { ascending: false })

  if (params.status) q = q.eq('status', params.status)
  if (params.priority) q = q.eq('priority', params.priority)
  if (params.company_id) q = q.eq('company_id', params.company_id)
  if (params.limit) q = q.limit(params.limit)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as TaskWithDetails[]
}

export async function getTask(id: string): Promise<TaskWithDetails | null> {
  const { data, error } = await db()
    .from('tasks')
    .select(TASK_DETAIL_SELECT)
    .eq('id', id)
    .single()
  if (error) return null
  return data as unknown as TaskWithDetails
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createTask(input: {
  title: string
  description?: string | null
  priority: TaskRow['priority']
  status?: TaskRow['status']
  deadline?: string | null
  company_id?: string | null
  employee_ids?: string[]
}): Promise<TaskWithDetails> {
  const { employee_ids, ...taskInput } = input
  const { data, error } = await db()
    .from('tasks')
    .insert(taskInput)
    .select(TASK_DETAIL_SELECT)
    .single()
  if (error) throw error

  // Insert assignments — mirror the task's initial status so the two
  // enums never start out of sync.
  if (employee_ids && employee_ids.length > 0) {
    const created = data as { id: string; status: TaskRow['status']; completed_at: string | null }
    const taskId = created.id
    const assignmentStatus = mapTaskStatusToAssignmentStatus(created.status)
    const completedAt =
      created.status === 'done'
        ? (created.completed_at ?? new Date().toISOString())
        : null

    const { error: aErr } = await db()
      .from('task_assignments')
      .insert(
        employee_ids.map((eid) => ({
          task_id: taskId,
          employee_id: eid,
          status: assignmentStatus,
          completed_at: completedAt,
        }))
      )
      .select('id')
    if (aErr) throw aErr

    // Re-fetch with assignments populated
    const { data: full, error: fErr } = await db()
      .from('tasks')
      .select(TASK_DETAIL_SELECT)
      .eq('id', taskId)
      .single()
    if (fErr) throw fErr

    // Fire push notifications to every assigned employee — best-effort,
    // never throws so a push failure never breaks task creation.
    const created2 = data as { title: string; priority: TaskRow['priority']; deadline: string | null }
    sendPushToEmployees(
      employee_ids,
      buildAssignmentPush({
        title: created2.title,
        priority: created2.priority,
        deadline: created2.deadline,
      }),
    ).catch(() => {})

    return full as unknown as TaskWithDetails
  }

  return data as unknown as TaskWithDetails
}

export async function updateTask(
  id: string,
  input: Partial<{
    title: string
    description: string | null
    priority: TaskRow['priority']
    status: TaskRow['status']
    deadline: string | null
    company_id: string | null
    completed_at: string | null
    employee_ids: string[]
  }>
): Promise<TaskWithDetails> {
  const { employee_ids, ...taskInput } = input

  // Auto-set completed_at when moving to done
  const patch: typeof taskInput & { completed_at?: string | null } = { ...taskInput }
  if (taskInput.status === 'done' && !taskInput.completed_at) {
    patch.completed_at = new Date().toISOString()
  }
  if (taskInput.status && taskInput.status !== 'done' && taskInput.completed_at === undefined) {
    patch.completed_at = null
  }

  const { error } = await db()
    .from('tasks')
    .update(patch)
    .eq('id', id)
  if (error) throw error

  // ── Mirror status to all task_assignments ────────────────────────────────
  // Without this, admin-side `tasks.status` and per-employee
  // `task_assignments.status` drift apart and downstream metrics
  // (admin profile KPIs, streak, deadline hit rate) under-report.
  if (taskInput.status !== undefined) {
    const assignmentStatus = mapTaskStatusToAssignmentStatus(taskInput.status)

    if (taskInput.status === 'done') {
      const completedIso = patch.completed_at ?? new Date().toISOString()
      // Set status on all assignments
      await db()
        .from('task_assignments')
        .update({ status: 'done' })
        .eq('task_id', id)
      // Set completed_at only where it's still null (preserve existing values)
      await db()
        .from('task_assignments')
        .update({ completed_at: completedIso })
        .eq('task_id', id)
        .is('completed_at', null)
    } else if (
      taskInput.status === 'in_progress' ||
      taskInput.status === 'review'
    ) {
      // Active work: clear completed_at, set status, stamp started_at if null
      const nowIso = new Date().toISOString()
      await db()
        .from('task_assignments')
        .update({ status: assignmentStatus, completed_at: null })
        .eq('task_id', id)
      await db()
        .from('task_assignments')
        .update({ started_at: nowIso })
        .eq('task_id', id)
        .is('started_at', null)
    } else {
      // todo or blocked: clear completed_at, mirror status
      await db()
        .from('task_assignments')
        .update({ status: assignmentStatus, completed_at: null })
        .eq('task_id', id)
    }
  }

  // Sync assignments if employee_ids provided
  if (employee_ids !== undefined) {
    // Get current assignees
    const { data: current } = await db()
      .from('task_assignments')
      .select('id, employee_id')
      .eq('task_id', id)
    const currentIds = (current ?? []).map((r: { employee_id: string }) => r.employee_id)

    // Add new ones — mirror the task's current status so new assignees
    // don't immediately drift back out of sync.
    const toAdd = employee_ids.filter((eid) => !currentIds.includes(eid))
    if (toAdd.length > 0) {
      // Fetch the task's current status + completed_at so we can defaults
      // the new assignment rows correctly.
      const { data: taskRow } = await db()
        .from('tasks')
        .select('status, completed_at')
        .eq('id', id)
        .single()

      const taskStatus = (taskRow?.status as TaskRow['status'] | undefined) ?? 'todo'
      const assignmentStatus = mapTaskStatusToAssignmentStatus(taskStatus)
      const completedAt =
        taskStatus === 'done'
          ? ((taskRow?.completed_at as string | null) ?? new Date().toISOString())
          : null

      await db()
        .from('task_assignments')
        .insert(
          toAdd.map((eid) => ({
            task_id: id,
            employee_id: eid,
            status: assignmentStatus,
            completed_at: completedAt,
          }))
        )

      // Notify only the newly-added assignees — existing assignees should
      // not get spammed every time the admin edits the task.
      const { data: notifyTask } = await db()
        .from('tasks')
        .select('title, priority, deadline')
        .eq('id', id)
        .single()
      if (notifyTask) {
        const t = notifyTask as { title: string; priority: TaskRow['priority']; deadline: string | null }
        sendPushToEmployees(toAdd, buildAssignmentPush(t)).catch(() => {})
      }
    }

    // Remove dropped ones
    const toRemove = currentIds.filter((eid) => !employee_ids.includes(eid))
    if (toRemove.length > 0) {
      await db()
        .from('task_assignments')
        .delete()
        .eq('task_id', id)
        .in('employee_id', toRemove)
    }
  }

  // Return full task with updated assignments
  const { data: full, error: fErr } = await db()
    .from('tasks')
    .select(TASK_DETAIL_SELECT)
    .eq('id', id)
    .single()
  if (fErr) throw fErr
  return full as unknown as TaskWithDetails
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await db().from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── Stats ─────────────────────────────────────────────────────────────────

export interface TaskStats {
  total: number
  inProgress: number
  completedToday: number
  overdue: number
}

export async function getTaskStats(): Promise<TaskStats> {
  const { data, error } = await db()
    .from('tasks')
    .select('status, deadline, completed_at')
  if (error) throw error

  const tasks = (data ?? []) as Pick<TaskRow, 'status' | 'deadline' | 'completed_at'>[]
  const todayIso = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()

  return {
    total: tasks.length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completedToday: tasks.filter(
      (t) => t.completed_at && t.completed_at.slice(0, 10) === todayIso
    ).length,
    overdue: tasks.filter(
      (t) => t.status !== 'done' && t.deadline && t.deadline < nowIso
    ).length,
  }
}

// ── Employee-scoped task list ──────────────────────────────────────────────

/** How many days of completed work the dashboard card keeps. */
const DASHBOARD_DONE_WINDOW_DAYS = 30

export async function listTasksByEmployee(
  employeeId: string,
  params: {
    status?: TaskRow['status']
    priority?: TaskRow['priority']
    search?: string
    /**
     * 'dashboard' returns everything still open, plus work completed in the
     * last 30 days — instead of every task the employee has ever been assigned.
     *
     * The dashboard card was pulling all of them with full detail: company,
     * every assignment with its nested employee, and every checklist item. For
     * one employee that is 179 tasks and 104 kB on each load, of which 171 were
     * finished months ago. Most staff open this on mobile data.
     *
     * Open tasks are kept regardless of age, so nothing actionable can drop off
     * the list just because it is old — only finished work ages out.
     */
    scope?: 'all' | 'dashboard'
  } = {}
): Promise<TaskWithDetails[]> {
  // Step 1: get all task IDs assigned to this employee
  const { data: assignments, error: aErr } = await db()
    .from('task_assignments')
    .select('task_id')
    .eq('employee_id', employeeId)
  if (aErr) throw aErr

  const taskIds = (assignments ?? []).map((a: { task_id: string }) => a.task_id)
  if (taskIds.length === 0) return []

  // Step 2: fetch those tasks with full details (including all other assignees = team members)
  let q = db()
    .from('tasks')
    .select(TASK_DETAIL_SELECT)
    .in('id', taskIds)
    .order('created_at', { ascending: false })

  if (params.scope === 'dashboard') {
    const since = new Date(Date.now() - DASHBOARD_DONE_WINDOW_DAYS * 86400000).toISOString()
    q = q.or(`status.neq.done,completed_at.gte.${since}`)
  }

  if (params.status) q = q.eq('status', params.status)
  if (params.priority) q = q.eq('priority', params.priority)
  if (params.search) {
    const safe = params.search.replace(/[%_]/g, ' ').trim()
    q = q.ilike('title', `%${safe}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as TaskWithDetails[]
}

export interface EmployeeTaskStats {
  total: number
  inProgress: number
  todo: number
  done: number
  overdue: number
  dueToday: number
}

export async function getEmployeeTaskStats(employeeId: string): Promise<EmployeeTaskStats> {
  const tasks = await listTasksByEmployee(employeeId)
  const todayStr = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  return {
    total: tasks.length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter(
      (t) => t.status !== 'done' && t.deadline && t.deadline < nowIso
    ).length,
    dueToday: tasks.filter(
      (t) => t.status !== 'done' && t.deadline && t.deadline.slice(0, 10) === todayStr
    ).length,
  }
}

// ── Employee assignments (kept from before) ───────────────────────────────

export async function listAssignmentsByEmployee(
  employeeId: string
): Promise<AssignmentRow[]> {
  const { data, error } = await db()
    .from('task_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('employee_id', employeeId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as AssignmentRow[]
}

// Re-export pure derivation from shared metrics module so client and server
// share one canonical implementation.
export {
  deriveTaskMetrics,
  type EmployeeTaskMetrics,
} from '@/lib/metrics'
