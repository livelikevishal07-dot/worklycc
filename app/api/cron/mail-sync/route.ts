import { NextRequest } from 'next/server'

import { syncAllMailboxes } from '@/lib/mail/sync'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduled IMAP pull, invoked by the Vercel cron entry in vercel.json.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is set;
 * we require it so the route can't be triggered by anyone who finds the URL.
 * Without CRON_SECRET configured the route refuses to run rather than sitting
 * open — set it in the Vercel project env alongside the schedule.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return fail(503, 'CRON_SECRET is not configured.')
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return fail(401, 'Not authorized')
    }

    const results = await syncAllMailboxes()
    const failed  = results.filter((r) => !r.ok)
    return ok({ synced: results.length, failed: failed.length, results })
  } catch (err) {
    return fromError(err)
  }
}
