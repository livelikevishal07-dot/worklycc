import { NextRequest } from 'next/server'
import { z } from 'zod'

import { getStandings, setAward, clearAward } from '@/lib/db/employee-of-month'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

// Admin-only: middleware.ts default-denies anything under /api that is not
// explicitly listed. The employee's own view is served from /api/employee/
// so a member of staff never receives the full punctuality board.

const awardSchema = z.object({
  period:      z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  employee_id: z.string().uuid().nullable(),
  note:        z.string().trim().max(300).nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get('period') ?? undefined
    return ok(await getStandings(period))
  } catch (err) {
    return fromError(err)
  }
}

/** Award the month, or clear it by passing employee_id: null. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const parsed = awardSchema.safeParse(body)
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid input')

    const { period, employee_id, note } = parsed.data
    if (employee_id === null) {
      await clearAward(period)
      return ok({ cleared: true })
    }
    return ok(await setAward(period, employee_id, note), { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
