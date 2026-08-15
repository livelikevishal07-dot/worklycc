import { getSessionEmployeeId } from '@/lib/auth'
import { getEmployee } from '@/lib/db/employees'
import { getOrStartEmployeeSubmission, latestEmployeeSubmission } from '@/lib/db/kyc'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The signed-in employee's own KYC form.
 *
 * Scoped entirely to the session — an employee can only ever reach their own
 * submission, never another person's, and never the CMS review data.
 */
export async function GET() {
  try {
    const employeeId = getSessionEmployeeId()
    if (!employeeId) return fail(401, 'Not signed in')

    const employee = await getEmployee(employeeId)
    if (!employee) return fail(404, 'Employee not found')

    const latest = await latestEmployeeSubmission(employeeId)

    return ok({
      status: latest?.status ?? null,
      submittedAt: latest?.submitted_at ?? null,
      hasOpenForm: latest ? ['invited', 'submitted'].includes(latest.status) : false,
    })
  } catch (err) {
    return fromError(err)
  }
}

/** Start (or resume) this employee's KYC and hand back its form token. */
export async function POST() {
  try {
    const employeeId = getSessionEmployeeId()
    if (!employeeId) return fail(401, 'Not signed in')

    const employee = await getEmployee(employeeId)
    if (!employee) return fail(404, 'Employee not found')

    const submission = await getOrStartEmployeeSubmission({
      id:         employee.id,
      full_name:  employee.full_name,
      email:      employee.email,
      company_id: employee.company_id,
    })

    return ok({ token: submission.token, status: submission.status })
  } catch (err) {
    return fromError(err)
  }
}
