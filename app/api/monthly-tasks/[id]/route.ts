import { NextRequest } from 'next/server'
import { z } from 'zod'

import {
  updateMonthlyTask, deleteMonthlyTask,
  completeMonthlyTask, uncompleteMonthlyTask,
} from '@/lib/db/monthly-tasks'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  title:       z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category:    z.enum(['compliance', 'payment', 'subscription', 'other']).optional(),
  due_day:     z.coerce.number().int().min(1).max(31).optional(),
  amount:      z.coerce.number().min(0).nullable().optional(),
  company_id:  z.string().uuid().nullable().optional(),
  is_active:   z.boolean().optional(),
  sort_order:  z.coerce.number().int().optional(),

  // Ticking a month off is a PATCH on the task with a period, rather than a
  // separate endpoint — the UI only ever does one or the other.
  completed:   z.boolean().optional(),
  period:      z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  note:        z.string().trim().max(500).nullable().optional(),
  amount_paid: z.coerce.number().min(0).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid input')

    const { completed, period, note, amount_paid, ...fields } = parsed.data

    if (completed === true) {
      await completeMonthlyTask(params.id, period, { note, amount_paid })
    } else if (completed === false) {
      await uncompleteMonthlyTask(params.id, period)
    }

    if (Object.keys(fields).length > 0) {
      return ok(await updateMonthlyTask(params.id, fields))
    }
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteMonthlyTask(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
