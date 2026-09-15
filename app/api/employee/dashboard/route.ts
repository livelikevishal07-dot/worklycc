import { getSessionEmployeeId } from '@/lib/auth'
import { getEmployeeTaskStats, listTasksByEmployee } from '@/lib/db/tasks'
import { listAttendance } from '@/lib/db/attendance'
import { getLeaveBalances } from '@/lib/db/leave-entitlements'
import { listLeaveRequests } from '@/lib/db/leave-requests'
import { listAnnouncements } from '@/lib/db/announcements'
import { listHolidays } from '@/lib/db/holidays'
import { listRecurringTasksForEmployee } from '@/lib/db/recurring-tasks'
import { getEmployeeStanding } from '@/lib/db/employee-of-month'
import { getLeaderboard } from '@/lib/db/leaderboard'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Everything the employee dashboard needs, in one request.
 *
 * It previously made about fourteen, several of them fetching the same thing
 * twice: leave entitlements for both the stats strip and the leave card, the
 * month's attendance for both the week chart and the recent list, announcements
 * for both the pinned banner and the feed. Every one of those is a separate
 * round trip from a phone, and a separate query on a free-tier database.
 *
 * Attendance is fetched once over a range wide enough to cover today, the
 * current week and the current month, and sliced client-side. The week can
 * start in the previous month, so the range is the earlier of the two — not
 * the month start.
 *
 * Scoped entirely to the signed-in employee. The leaderboard is the one shared
 * thing here and it is the same board the widget already showed.
 */

const TZ = process.env.WORKLY_TIMEZONE ?? 'Asia/Kolkata'

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET() {
  try {
    const employeeId = getSessionEmployeeId()
    if (!employeeId) return fail(401, 'Not signed in')

    const today = todayISO()
    const now   = new Date(`${today}T00:00:00`)

    const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1))
    // Monday-based, matching the week the cards draw.
    const dow        = now.getDay()            // 0 = Sunday
    const weekStart  = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (dow === 0 ? -6 : 1 - dow)))
    // The week can begin in the previous month — take whichever is earlier so
    // one fetch covers both views.
    const attFrom = weekStart < monthStart ? weekStart : monthStart

    const [
      taskStats, tasks, attendance, balances, leaveRequests,
      announcements, holidays, recurring, eotm, leaderboard,
    ] = await Promise.all([
      getEmployeeTaskStats(employeeId),
      listTasksByEmployee(employeeId, { scope: 'dashboard' }),
      listAttendance({ employee_id: employeeId, from: attFrom, to: today }),
      getLeaveBalances(employeeId),
      listLeaveRequests({ employee_id: employeeId, limit: 5 }),
      listAnnouncements(),
      listHolidays({}),
      listRecurringTasksForEmployee(employeeId, today),
      getEmployeeStanding(employeeId),
      // Monthly: the period the widget opens on.
      getLeaderboard('monthly'),
    ])

    return ok({
      generatedAt: new Date().toISOString(),
      today,
      ranges: { attFrom, weekStart, monthStart },
      taskStats,
      tasks,
      attendance,
      leave: { balances, requests: leaveRequests },
      announcements,
      holidays,
      recurring,
      eotm,
      leaderboard,
    })
  } catch (err) {
    return fromError(err)
  }
}
