import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { listLetters } from '@/lib/db/letters'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** Issued-letter history, optionally scoped to one employee. */
export async function GET(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const employeeId = req.nextUrl.searchParams.get('employee') || undefined
    return ok({ letters: await listLetters(employeeId) })
  } catch (err) {
    return fromError(err)
  }
}
