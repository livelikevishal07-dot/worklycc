import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { deleteContact, updateContact } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name:     z.string().trim().max(150).nullable().optional(),
  email:    z.string().trim().toLowerCase().email().optional(),
  category: z.string().trim().min(1).max(60).optional(),
  notes:    z.string().trim().max(1000).nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const d = patchSchema.parse(body)
    if (Object.keys(d).length === 0) return fail(400, 'Nothing to update')
    await updateContact(params.id, d)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    await deleteContact(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
