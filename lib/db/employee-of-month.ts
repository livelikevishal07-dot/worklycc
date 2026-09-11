import 'server-only'
import { db } from './supabase'

/**
 * Employee of the Month, ranked on punctuality.
 *
 * The scheme the admin asked for: whoever turns up on time — or early — wins.
 * So the ranking is on-time rate first, and average earliness as the decider,
 * which is what separates people who merely scrape in before the bell from
 * people who are consistently there ahead of it.
 *
 * Standings are recomputed from attendance on every read rather than stored, so
 * a corrected attendance row corrects the ranking immediately. Only the admin's
 * award decision is persisted.
 */

const TZ = process.env.WORKLY_TIMEZONE ?? 'Asia/Kolkata'

/**
 * Minimum attended days before someone can win.
 *
 * Without this, one person who showed up once, on time, outranks someone with a
 * flawless twenty-day month. The month is still ranked for everyone — they are
 * just marked ineligible rather than hidden, so the admin can see why.
 */
export const MIN_DAYS_FOR_AWARD = 8

export interface StandingRow {
  employee_id:    string
  full_name:      string
  avatar_url:     string | null
  department:     string | null
  days:           number
  on_time:        number
  late:           number
  on_time_pct:    number
  /** Positive = clocks in before their start time, on average. */
  avg_early_mins: number
  eligible:       boolean
  rank:           number
}

export interface Award {
  id:             string
  period:         string
  employee_id:    string
  employee_name:  string | null
  on_time_days:   number | null
  total_days:     number | null
  avg_early_mins: number | null
  note:           string | null
  awarded_at:     string
}

export interface MonthStandings {
  period:    string    // YYYY-MM-01
  label:     string    // "September 2026"
  isCurrent: boolean
  standings: StandingRow[]
  award:     Award | null
}

function businessToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function toPeriod(input?: string | null): string {
  const base = input && /^\d{4}-\d{2}/.test(input) ? input : businessToday()
  return `${base.slice(0, 7)}-01`
}

function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function endOfMonth(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** Ranked punctuality for one month. */
export async function getStandings(periodInput?: string): Promise<MonthStandings> {
  const period = toPeriod(periodInput)
  const from   = period
  const to     = endOfMonth(period)

  const { data: employees, error: eErr } = await db()
    .from('employees')
    .select('id, full_name, avatar_url, working_hours_start, department:departments(name)')
    .in('status', ['active', 'on_leave'])
  if (eErr) throw eErr

  const staff = (employees ?? []) as unknown as {
    id: string; full_name: string; avatar_url: string | null
    working_hours_start: string | null
    department: { name: string } | null
  }[]
  if (staff.length === 0) {
    return { period, label: monthLabel(period), isCurrent: period.slice(0, 7) === businessToday().slice(0, 7), standings: [], award: null }
  }

  const ids = staff.map((s) => s.id)
  const { data: rows, error: aErr } = await db()
    .from('attendance_sessions')
    .select('employee_id, status, login_at, date')
    .in('employee_id', ids)
    .gte('date', from)
    .lte('date', to)
  if (aErr) throw aErr

  type Acc = { days: number; onTime: number; late: number; earlySum: number; earlyN: number }
  const acc = new Map<string, Acc>(ids.map((id) => [id, { days: 0, onTime: 0, late: 0, earlySum: 0, earlyN: 0 }]))
  const startById = new Map(staff.map((s) => [s.id, s.working_hours_start]))

  for (const r of (rows ?? []) as { employee_id: string; status: string; login_at: string | null }[]) {
    const a = acc.get(r.employee_id)
    if (!a) continue
    // Leave and holidays are not attendance — they neither help nor hurt.
    if (r.status !== 'present' && r.status !== 'late') continue
    a.days++
    if (r.status === 'present') a.onTime++
    else a.late++

    const start = startById.get(r.employee_id)
    if (r.login_at && start) {
      // login_at is UTC; working_hours_start is a local wall-clock time, so the
      // comparison has to happen in the business timezone or everyone looks
      // 5.5 hours late.
      const local = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(r.login_at))
      const [lh, lm] = local.split(':').map(Number)
      const [sh, sm] = start.split(':').map(Number)
      a.earlySum += (sh * 60 + sm) - (lh * 60 + lm)   // positive = early
      a.earlyN++
    }
  }

  const standings: StandingRow[] = staff.map((s) => {
    const a = acc.get(s.id)!
    return {
      employee_id: s.id,
      full_name:   s.full_name,
      avatar_url:  s.avatar_url,
      department:  s.department?.name ?? null,
      days:        a.days,
      on_time:     a.onTime,
      late:        a.late,
      on_time_pct: a.days > 0 ? Math.round((a.onTime / a.days) * 100) : 0,
      avg_early_mins: a.earlyN > 0 ? Math.round(a.earlySum / a.earlyN) : 0,
      eligible:    a.days >= MIN_DAYS_FOR_AWARD,
      rank:        0,
    }
  })
  .filter((r) => r.days > 0)   // nobody who never showed up belongs on the board
  .sort((x, y) =>
    Number(y.eligible) - Number(x.eligible) ||
    y.on_time_pct - x.on_time_pct ||
    y.avg_early_mins - x.avg_early_mins ||
    y.days - x.days ||
    x.full_name.localeCompare(y.full_name),
  )
  .map((r, i) => ({ ...r, rank: i + 1 }))

  return {
    period,
    label:     monthLabel(period),
    isCurrent: period.slice(0, 7) === businessToday().slice(0, 7),
    standings,
    award:     await getAward(period),
  }
}

// ── Awards ────────────────────────────────────────────────────────────────────

export async function getAward(periodInput?: string): Promise<Award | null> {
  const { data, error } = await db()
    .from('employee_of_month_awards')
    .select('*, employee:employees(full_name)')
    .eq('period', toPeriod(periodInput))
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as any
  return { ...row, employee_name: row.employee?.full_name ?? null }
}

export async function getAwardById(id: string): Promise<Award | null> {
  const { data, error } = await db()
    .from('employee_of_month_awards')
    .select('*, employee:employees(full_name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as any
  return { ...row, employee_name: row.employee?.full_name ?? null }
}

/** Award the month to someone, replacing any existing winner for that month. */
export async function setAward(
  periodInput: string | undefined,
  employeeId: string,
  note?: string | null,
): Promise<Award> {
  const period = toPeriod(periodInput)

  // Snapshot the numbers that justified it — attendance can be edited later,
  // and a certificate should keep saying what it said when it was issued.
  const { standings } = await getStandings(period)
  const row = standings.find((s) => s.employee_id === employeeId)

  const { error } = await db()
    .from('employee_of_month_awards')
    .upsert({
      period,
      employee_id:    employeeId,
      on_time_days:   row?.on_time ?? null,
      total_days:     row?.days ?? null,
      avg_early_mins: row?.avg_early_mins ?? null,
      note:           note?.trim() || null,
      awarded_at:     new Date().toISOString(),
    }, { onConflict: 'period' })
  if (error) throw error

  const award = await getAward(period)
  if (!award) throw new Error('Award was not saved')
  return award
}

export async function clearAward(periodInput?: string): Promise<void> {
  const { error } = await db()
    .from('employee_of_month_awards')
    .delete()
    .eq('period', toPeriod(periodInput))
  if (error) throw error
}

/** Every month this employee has won — drives their dashboard badge. */
export async function getAwardsForEmployee(employeeId: string): Promise<Award[]> {
  const { data, error } = await db()
    .from('employee_of_month_awards')
    .select('*, employee:employees(full_name)')
    .eq('employee_id', employeeId)
    .order('period', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({ ...r, employee_name: r.employee?.full_name ?? null }))
}

/**
 * One employee's own view: where they stand this month, and what they have won.
 * Their rank is included but not the rest of the board — this feeds a personal
 * dashboard card, not a public league table of who is late.
 */
export async function getEmployeeStanding(employeeId: string): Promise<{
  period: string; label: string
  me: StandingRow | null
  totalRanked: number
  leaderName: string | null
  awards: Award[]
}> {
  const { period, label, standings } = await getStandings()
  const me = standings.find((s) => s.employee_id === employeeId) ?? null
  return {
    period, label, me,
    totalRanked: standings.length,
    leaderName:  standings[0]?.full_name ?? null,
    awards:      await getAwardsForEmployee(employeeId),
  }
}
