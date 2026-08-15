import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { setImpersonationCookie, setSessionCookie } from '@/lib/auth'
import { getEmployee } from '@/lib/db/employees'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/**
 * Open an employee's dashboard as that employee, without their password.
 *
 * Admin-only. This mints a normal employee session for the target plus a marker
 * cookie so the portal can show a "viewing as" banner and an exit route. The
 * admin's own CMS session cookie is left untouched, so leaving impersonation is
 * just clearing the employee session — no re-login needed.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const employee = await getEmployee(params.id)
    if (!employee) return fail(404, 'Employee not found')

    // The employee layout bounces inactive accounts straight back to the login
    // screen, so impersonating one would look like a broken button.
    if (employee.status === 'inactive') {
      return fail(400, 'This employee is inactive — reactivate them first.')
    }

    setSessionCookie(employee.id)
    setImpersonationCookie(employee.id)

    return ok({ id: employee.id, full_name: employee.full_name })
  } catch (err) {
    return fromError(err)
  }
}
