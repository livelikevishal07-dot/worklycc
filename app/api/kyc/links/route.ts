import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  createPublicLink, deletePublicLink, listPublicLinks, setPublicLinkActive,
} from '@/lib/db/kyc'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  label:     z.string().trim().max(120).optional(),
  companyId: z.string().uuid().optional(),
})

const patchSchema = z.object({
  id:        z.string().uuid(),
  is_active: z.boolean().optional(),
  remove:    z.boolean().optional(),
})

/** Reusable KYC links — share one with a whole team instead of inviting each person. */
export async function GET() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    return ok({ links: await listPublicLinks() })
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = createSchema.parse(body)
    const link = await createPublicLink({ label: input.label, companyId: input.companyId })
    return ok({ link }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = patchSchema.parse(body)

    if (input.remove) {
      await deletePublicLink(input.id)
      return ok({ ok: true, removed: true })
    }
    if (input.is_active !== undefined) {
      await setPublicLinkActive(input.id, input.is_active)
    }
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
