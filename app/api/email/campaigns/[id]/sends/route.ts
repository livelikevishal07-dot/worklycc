import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { campaignSendStatus } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** Live progress for a campaign run (polled by the UI). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    return ok(await campaignSendStatus(params.id))
  } catch (err) {
    return fromError(err)
  }
}
