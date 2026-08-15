import { NextRequest } from 'next/server'

import { findEmployeeByUsername } from '@/lib/db/employees'
import { employeeLoginSchema } from '@/lib/validators/employee'
import { setSessionCookie, verifyPassword } from '@/lib/auth'
import { checkRateLimit, clientIp, resetRateLimit } from '@/lib/rate-limit'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/**
 * The response says whether the username or the password was wrong, because
 * staff kept getting stuck on a generic message. That makes usernames
 * enumerable, so attempts are capped per IP — see lib/rate-limit.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers)
    const limit = checkRateLimit(`employee-login:${ip}`, 10, 10 * 60 * 1000)
    if (!limit.allowed) {
      return fail(
        429,
        `Too many sign-in attempts. Try again in about ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`,
      )
    }

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const { username, password } = employeeLoginSchema.parse(body)

    const employee = await findEmployeeByUsername(username)
    if (!employee) {
      return fail(401, 'No account found with that username.', { field: 'username' })
    }
    if (!employee.password) {
      return fail(403, 'This account has no password set yet. Ask your admin to set one.', {
        field: 'password',
      })
    }
    if (!verifyPassword(password, employee.password)) {
      return fail(401, 'That password is incorrect.', { field: 'password' })
    }
    if (employee.status === 'inactive') {
      return fail(403, 'This account is inactive. Please contact your admin.')
    }

    resetRateLimit(`employee-login:${ip}`)
    setSessionCookie(employee.id)
    return ok({ id: employee.id, full_name: employee.full_name })
  } catch (err) {
    return fromError(err)
  }
}
