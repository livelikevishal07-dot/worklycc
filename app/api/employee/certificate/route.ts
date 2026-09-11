import { NextRequest } from 'next/server'

import { getSessionEmployeeId } from '@/lib/auth'
import { getAwardById } from '@/lib/db/employee-of-month'
import { certificateResponse } from '@/app/api/employee-of-month/certificate/route'
import { fail, fromError } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * An employee downloading their own Employee of the Month certificate.
 *
 * Renders through the same function the admin route uses, so both produce an
 * identical document — but only after checking the award actually belongs to
 * the signed-in employee. Without that check, any award id would hand out any
 * colleague's certificate.
 */
export async function GET(req: NextRequest) {
  try {
    const employeeId = getSessionEmployeeId()
    if (!employeeId) return fail(401, 'Not signed in')

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return fail(400, 'Which certificate?')

    const award = await getAwardById(id)
    if (!award) return fail(404, 'Certificate not found')
    if (award.employee_id !== employeeId) return fail(403, 'That certificate is not yours.')

    return certificateResponse(award)
  } catch (err) {
    return fromError(err)
  }
}
