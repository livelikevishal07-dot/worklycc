import { NextRequest } from 'next/server'

import { runAutomations } from '@/lib/automations/run'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * Scheduled automations: birthday wishes, work anniversaries, late-arrival
 * nudges and overdue-task reminders.
 *
 * Safe to call as often as you like — every action is claimed under a
 * UNIQUE (kind, subject, date) key before sending, so repeat calls send nothing.
 * Vercel's Hobby plan fires cron once a day, which is enough for greetings; for
 * near real-time late/overdue alerts, point any external scheduler
 * (cron-job.org, GitHub Actions, an always-on box) at this same URL with the
 * same Authorization header.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return fail(503, 'CRON_SECRET is not configured.')
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return fail(401, 'Not authorized')
    }

    const summary = await runAutomations()
    const sent = summary.results.reduce((n, r) => n + r.sent, 0)
    return ok({ ...summary, totalSent: sent })
  } catch (err) {
    return fromError(err)
  }
}
