import 'server-only'

import { db } from './supabase'

export type AutomationKind =
  | 'birthday'
  | 'work_anniversary'
  | 'late_arrival'
  | 'task_overdue'

export const AUTOMATION_KINDS: AutomationKind[] = [
  'birthday', 'work_anniversary', 'late_arrival', 'task_overdue',
]

export const AUTOMATION_META: Record<AutomationKind, { label: string; description: string }> = {
  birthday: {
    label: 'Birthday wishes',
    description: 'Emails the employee a birthday greeting on the day.',
  },
  work_anniversary: {
    label: 'Work anniversary',
    description: 'Congratulates the employee on each completed year, starting at one.',
  },
  late_arrival: {
    label: 'Late arrival nudge',
    description: 'Emails an employee who has not clocked in by their start time plus the grace period, on their working days only.',
  },
  task_overdue: {
    label: 'Overdue task reminder',
    description: 'Reminds assignees about tasks whose deadline has passed and are not done.',
  },
}

export interface AutomationSetting {
  kind:       AutomationKind
  enabled:    boolean
  send_email: boolean
  send_push:  boolean
  config:     Record<string, unknown>
  updated_at: string
}

export interface AutomationLogRow {
  id:          string
  kind:        string
  subject_id:  string
  employee_id: string | null
  ref_date:    string
  status:      'sent' | 'failed' | 'skipped'
  channel:     string | null
  detail:      string | null
  created_at:  string
}

export async function listSettings(): Promise<AutomationSetting[]> {
  const { data, error } = await db().from('automation_settings').select('*').order('kind')
  if (error) throw error
  return (data ?? []) as AutomationSetting[]
}

export async function getSetting(kind: AutomationKind): Promise<AutomationSetting | null> {
  const { data, error } = await db()
    .from('automation_settings')
    .select('*')
    .eq('kind', kind)
    .maybeSingle()
  if (error) throw error
  return (data as AutomationSetting) ?? null
}

export async function updateSetting(
  kind: AutomationKind,
  patch: Partial<Pick<AutomationSetting, 'enabled' | 'send_email' | 'send_push' | 'config'>>,
): Promise<void> {
  const { error } = await db()
    .from('automation_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('kind', kind)
  if (error) throw error
}

/**
 * Claim the right to act on (kind, subject, date).
 *
 * Returns false if this combination was already handled — the UNIQUE constraint
 * does the work, so two overlapping runs cannot both send. Always call this
 * BEFORE sending, and record the outcome with `finishRun`.
 */
export async function claimRun(
  kind: AutomationKind, subjectId: string, refDate: string, employeeId: string | null,
): Promise<string | null> {
  const { data, error } = await db()
    .from('automation_log')
    .insert({
      kind, subject_id: subjectId, ref_date: refDate,
      employee_id: employeeId, status: 'skipped', channel: 'none',
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = already claimed by an earlier run. Not an error condition.
    if ((error as { code?: string }).code === '23505') return null
    throw error
  }
  return (data as { id: string }).id
}

export async function finishRun(
  id: string,
  status: 'sent' | 'failed' | 'skipped',
  channel: string,
  detail?: string | null,
): Promise<void> {
  const { error } = await db()
    .from('automation_log')
    .update({ status, channel, detail: detail ?? null })
    .eq('id', id)
  if (error) throw error
}

export async function recentLog(limit = 50): Promise<AutomationLogRow[]> {
  const { data, error } = await db()
    .from('automation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AutomationLogRow[]
}
