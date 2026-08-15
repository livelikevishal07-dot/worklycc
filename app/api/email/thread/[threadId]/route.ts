import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getThread } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    return ok({ messages: await getThread(params.threadId) })
  } catch (err) {
    return fromError(err)
  }
}
