import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { listMessages, unreadCount, LIST_VIEWS, type ListView } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const sp     = req.nextUrl.searchParams
    const wanted = (sp.get('folder') ?? 'inbox') as ListView
    const folder: ListView = LIST_VIEWS.includes(wanted) ? wanted : 'inbox'

    const limit  = Number(sp.get('limit')  ?? 50)
    const offset = Number(sp.get('offset') ?? 0)

    const [messages, unread] = await Promise.all([
      listMessages({
        folder,
        accountId: sp.get('account') || undefined,
        search:    sp.get('q') || undefined,
        limit:     Number.isFinite(limit)  ? limit  : 50,
        offset:    Number.isFinite(offset) ? offset : 0,
      }),
      unreadCount(),
    ])

    return ok({ messages, unread })
  } catch (err) {
    return fromError(err)
  }
}
