import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { deleteCampaign, getCampaign, updateCampaign } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name:     z.string().trim().min(1).max(150).optional(),
  subject:  z.string().trim().max(300).optional(),
  bodyHtml: z.string().max(500_000).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const campaign = await getCampaign(params.id)
    if (!campaign) return fail(404, 'Campaign not found')
    return ok({ campaign })
  } catch (err) {
    return fromError(err)
  }
}

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
    await updateCampaign(params.id, d)
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
    await deleteCampaign(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
