import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { createCampaign, listCampaigns } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name:     z.string().trim().min(1).max(150),
  subject:  z.string().trim().max(300).optional().default(''),
  bodyHtml: z.string().max(500_000).optional().default(''),
})

export async function GET() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    return ok({ campaigns: await listCampaigns() })
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const d = createSchema.parse(body)
    return ok({ campaign: await createCampaign(d) }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
