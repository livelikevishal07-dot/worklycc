import { isAdminAuthenticated } from '@/lib/auth-admin'
import { syncAllMailboxes } from '@/lib/mail/sync'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * Manual "Sync now" — runs an IMAP pass inline for every syncable mailbox.
 * The cron route does the same on a schedule; this just lets the admin pull
 * immediately while looking at the inbox.
 */
export async function POST() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const results = await syncAllMailboxes()
    return ok({ synced: results.length, results })
  } catch (err) {
    return fromError(err)
  }
}
