import { isAdminAuthenticated } from '@/lib/auth-admin'
import { unreadCount } from '@/lib/db/email'
import { ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** Lightweight unread-inbox count for the sidebar badge. Never errors loudly —
    a failing badge must not break the CMS chrome. */
export async function GET() {
  try {
    if (!isAdminAuthenticated()) return ok({ count: 0 })
    return ok({ count: await unreadCount() })
  } catch {
    return ok({ count: 0 })
  }
}
