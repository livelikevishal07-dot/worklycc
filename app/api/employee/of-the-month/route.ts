import { getSessionEmployeeId } from '@/lib/auth'
import { getEmployeeStanding } from '@/lib/db/employee-of-month'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The signed-in employee's own Employee of the Month standing.
 *
 * Deliberately returns only their own row, their rank, how many people are
 * ranked, and the current leader's name — not the full board. Publishing who is
 * late, to everyone, would turn a recognition scheme into a public shaming one.
 */
export async function GET() {
  try {
    const employeeId = getSessionEmployeeId()
    if (!employeeId) return fail(401, 'Not signed in')
    return ok(await getEmployeeStanding(employeeId))
  } catch (err) {
    return fromError(err)
  }
}
