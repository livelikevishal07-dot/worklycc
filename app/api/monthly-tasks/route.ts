import { NextRequest } from 'next/server'
import { z } from 'zod'

import { createMonthlyTask, getMonthlyOverview } from '@/lib/db/monthly-tasks'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

// Admin-only: middleware.ts default-denies anything under /api that is not
// explicitly listed as public or employee-reachable, and this is neither.

const createSchema = z.object({
  title:       z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category:    z.enum(['compliance', 'payment', 'subscription', 'other']).optional(),
  due_day:     z.coerce.number().int().min(1).max(31).optional(),
  amount:      z.coerce.number().min(0).nullable().optional(),
  company_id:  z.string().uuid().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get('period') ?? undefined
    return ok(await getMonthlyOverview(period))
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid input')
    return ok(await createMonthlyTask(parsed.data), { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
