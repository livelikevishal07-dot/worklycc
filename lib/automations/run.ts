import 'server-only'

import { db } from '@/lib/db/supabase'
import {
  AUTOMATION_KINDS, claimRun, finishRun, listSettings,
  type AutomationKind, type AutomationSetting,
} from '@/lib/db/automations'
import { getAccountSecretById, listAccounts } from '@/lib/db/email'
import { sendFromAccount } from '@/lib/mail/send'
import { sendPushToEmployees } from '@/lib/push'
import {
  anniversaryEmail, birthdayEmail, lateArrivalEmail, overdueTasksEmail,
  type BuiltEmail, type OverdueTask,
} from './templates'

/**
 * The automation engine.
 *
 * Safe to run repeatedly: every action is claimed in automation_log under a
 * UNIQUE (kind, subject, date) key before anything is sent, so a second run on
 * the same day is a no-op. That is what lets the same endpoint serve both
 * Vercel's once-a-day Hobby cron and a more frequent external scheduler.
 */

/** Business timezone — attendance dates and birthdays are local, not UTC. */
const TZ = process.env.WORKLY_TIMEZONE ?? 'Asia/Kolkata'

/** "today" in the business timezone, as YYYY-MM-DD. */
export function businessToday(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what the date columns use.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Minutes since local midnight in the business timezone. */
function minutesNow(now = new Date()): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** JS day number (1=Mon … 7=Sun) in the business timezone. */
function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay()          // 0=Sun
  return dow === 0 ? 7 : dow
}

function parseHhmm(value: string | null): number | null {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export interface AutomationResult {
  kind:      AutomationKind
  ran:       boolean
  considered: number
  sent:      number
  skipped:   number
  failed:    number
  notes:     string[]
}

export interface AutomationRunSummary {
  date:    string
  results: AutomationResult[]
}

interface EmployeeRow {
  id: string
  full_name: string
  email: string | null
  birthday: string | null
  joining_date: string | null
  status: string
  working_hours_start: string | null
  working_days: number[] | null
  company: { name: string } | null
}

const EMPLOYEE_SELECT =
  'id, full_name, email, birthday, joining_date, status, working_hours_start, working_days, company:companies ( name )'

/** Sender mailbox, resolved once per run. Null means email is unavailable. */
async function resolveSender() {
  const accounts = await listAccounts()
  const chosen = accounts.find((a) => a.is_active && a.has_password)
  if (!chosen) return null
  const secret = await getAccountSecretById(chosen.id)
  return secret?.password_enc ? secret : null
}

type Sender = Awaited<ReturnType<typeof resolveSender>>

/**
 * Deliver one automated message. Email and push are independent: an employee
 * with no email address still gets the push, which matters here because most
 * employee records have no email yet.
 */
async function deliver(
  sender: Sender,
  setting: AutomationSetting,
  employee: { id: string; full_name: string; email: string | null },
  mail: BuiltEmail,
  pushUrl: string,
): Promise<{ channel: string; error?: string }> {
  const channels: string[] = []
  let error: string | undefined

  if (setting.send_email && sender && employee.email) {
    try {
      const msg = await sendFromAccount(sender, {
        to: [employee.email], subject: mail.subject, html: mail.html, text: mail.text,
      })
      if (msg.status === 'failed') error = msg.error ?? 'send failed'
      else channels.push('email')
    } catch (e) {
      error = e instanceof Error ? e.message : 'send failed'
    }
  }

  if (setting.send_push) {
    try {
      await sendPushToEmployees([employee.id], {
        title: mail.subject,
        body:  mail.text.split('\n').filter(Boolean)[2] ?? mail.subject,
        url:   pushUrl,
      })
      channels.push('push')
    } catch {
      // Push is best-effort; never fail the run over it.
    }
  }

  return { channel: channels.join('+') || 'none', error }
}

/* ── Birthdays & anniversaries ────────────────────────────────────────────── */

async function runGreetings(
  kind: 'birthday' | 'work_anniversary',
  setting: AutomationSetting,
  sender: Sender,
  today: string,
): Promise<AutomationResult> {
  const res: AutomationResult = { kind, ran: true, considered: 0, sent: 0, skipped: 0, failed: 0, notes: [] }
  const column = kind === 'birthday' ? 'birthday' : 'joining_date'

  const { data, error } = await db()
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('status', 'active')
    .not(column, 'is', null)
  if (error) throw error

  const [, todayMonth, todayDay] = today.split('-')

  for (const row of (data ?? []) as unknown as EmployeeRow[]) {
    const value = kind === 'birthday' ? row.birthday : row.joining_date
    if (!value) continue
    const [year, month, day] = value.split('-')
    if (month !== todayMonth || day !== todayDay) continue

    let years = 0
    if (kind === 'work_anniversary') {
      years = Number(today.split('-')[0]) - Number(year)
      // Skip the joining day itself; anniversaries start at one year.
      if (years < 1) continue
    }

    res.considered++
    const logId = await claimRun(kind, row.id, today, row.id)
    if (!logId) { res.skipped++; continue }

    const brand = row.company?.name ?? 'Workly'
    const mail = kind === 'birthday'
      ? birthdayEmail(row.full_name, brand)
      : anniversaryEmail(row.full_name, years, brand)

    const { channel, error: err } = await deliver(sender, setting, row, mail, '/employee/dashboard')
    if (err)                 { res.failed++;  await finishRun(logId, 'failed', channel, err) }
    else if (channel === 'none') { res.skipped++; await finishRun(logId, 'skipped', channel, 'No email address and push disabled') }
    else                     { res.sent++;    await finishRun(logId, 'sent', channel) }
  }

  if (res.considered === 0) res.notes.push('Nobody matches today.')
  return res
}

/* ── Late arrival ─────────────────────────────────────────────────────────── */

async function runLateArrival(
  setting: AutomationSetting, sender: Sender, today: string,
): Promise<AutomationResult> {
  const res: AutomationResult = { kind: 'late_arrival', ran: true, considered: 0, sent: 0, skipped: 0, failed: 0, notes: [] }

  const grace   = Number((setting.config as { graceMinutes?: number }).graceMinutes ?? 15)
  const nowMins = minutesNow()
  const weekday = isoWeekday(today)

  const { data, error } = await db()
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('status', 'active')
  if (error) throw error

  const employees = (data ?? []) as unknown as EmployeeRow[]

  // Who has already clocked in today.
  const { data: att, error: attErr } = await db()
    .from('attendance_sessions')
    .select('employee_id')
    .eq('date', today)
  if (attErr) throw attErr
  const clockedIn = new Set((att ?? []).map((a) => (a as { employee_id: string }).employee_id))

  for (const row of employees) {
    const workingDays = row.working_days?.length ? row.working_days : [1, 2, 3, 4, 5]
    if (!workingDays.includes(weekday)) continue          // not a working day for them

    const start = parseHhmm(row.working_hours_start ?? '09:00')
    if (start == null) continue
    if (nowMins < start + grace) continue                 // still within grace
    if (clockedIn.has(row.id)) continue                   // already marked attendance

    res.considered++
    const logId = await claimRun('late_arrival', row.id, today, row.id)
    if (!logId) { res.skipped++; continue }

    const brand = row.company?.name ?? 'Workly'
    const mail = lateArrivalEmail(row.full_name, brand, row.working_hours_start ?? '09:00', grace)

    const { channel, error: err } = await deliver(sender, setting, row, mail, '/employee/attendance')
    if (err)                 { res.failed++;  await finishRun(logId, 'failed', channel, err) }
    else if (channel === 'none') { res.skipped++; await finishRun(logId, 'skipped', channel, 'No email address and push disabled') }
    else                     { res.sent++;    await finishRun(logId, 'sent', channel) }
  }

  if (res.considered === 0) res.notes.push('Nobody is late right now.')
  return res
}

/* ── Overdue tasks ────────────────────────────────────────────────────────── */

async function runOverdueTasks(
  setting: AutomationSetting, sender: Sender, today: string,
): Promise<AutomationResult> {
  const res: AutomationResult = { kind: 'task_overdue', ran: true, considered: 0, sent: 0, skipped: 0, failed: 0, notes: [] }

  const { data, error } = await db()
    .from('tasks')
    .select('id, title, deadline, priority, status, assignments:task_assignments ( employee_id, status )')
    .not('deadline', 'is', null)
    .lt('deadline', new Date().toISOString())
    .neq('status', 'done')
  if (error) throw error

  type TaskRow = {
    id: string; title: string; deadline: string | null; priority: string; status: string
    assignments: { employee_id: string; status: string }[]
  }

  // One digest per person rather than one email per task.
  const byEmployee = new Map<string, OverdueTask[]>()
  for (const t of (data ?? []) as unknown as TaskRow[]) {
    for (const a of t.assignments ?? []) {
      if (a.status === 'done') continue
      const list = byEmployee.get(a.employee_id) ?? []
      list.push({ title: t.title, deadline: t.deadline, priority: t.priority })
      byEmployee.set(a.employee_id, list)
    }
  }
  if (byEmployee.size === 0) {
    res.notes.push('No overdue tasks.')
    return res
  }

  const { data: emps, error: empErr } = await db()
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .in('id', [...byEmployee.keys()])
    .eq('status', 'active')
  if (empErr) throw empErr

  for (const row of (emps ?? []) as unknown as EmployeeRow[]) {
    const tasks = byEmployee.get(row.id)
    if (!tasks?.length) continue

    res.considered++
    const logId = await claimRun('task_overdue', row.id, today, row.id)
    if (!logId) { res.skipped++; continue }

    const brand = row.company?.name ?? 'Workly'
    const mail  = overdueTasksEmail(row.full_name, brand, tasks)

    const { channel, error: err } = await deliver(sender, setting, row, mail, '/employee/tasks')
    if (err)                 { res.failed++;  await finishRun(logId, 'failed', channel, err) }
    else if (channel === 'none') { res.skipped++; await finishRun(logId, 'skipped', channel, 'No email address and push disabled') }
    else                     { res.sent++;    await finishRun(logId, 'sent', channel) }
  }

  return res
}

/* ── Entry point ──────────────────────────────────────────────────────────── */

export async function runAutomations(only?: AutomationKind): Promise<AutomationRunSummary> {
  const today    = businessToday()
  const settings = await listSettings()
  const sender   = await resolveSender()
  const byKind   = new Map(settings.map((s) => [s.kind, s]))

  const results: AutomationResult[] = []

  for (const kind of AUTOMATION_KINDS) {
    if (only && only !== kind) continue

    const setting = byKind.get(kind)
    if (!setting || !setting.enabled) {
      results.push({ kind, ran: false, considered: 0, sent: 0, skipped: 0, failed: 0, notes: ['Turned off.'] })
      continue
    }

    try {
      const r =
        kind === 'birthday' || kind === 'work_anniversary'
          ? await runGreetings(kind, setting, sender, today)
        : kind === 'late_arrival'
          ? await runLateArrival(setting, sender, today)
          : await runOverdueTasks(setting, sender, today)

      if (setting.send_email && !sender) {
        r.notes.push('No mailbox connected — push only.')
      }
      results.push(r)
    } catch (e) {
      results.push({
        kind, ran: true, considered: 0, sent: 0, skipped: 0, failed: 0,
        notes: [`Failed: ${e instanceof Error ? e.message : 'unknown error'}`],
      })
    }
  }

  return { date: today, results }
}
