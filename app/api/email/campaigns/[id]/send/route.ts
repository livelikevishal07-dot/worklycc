import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  getAccountSecretById, getCampaign, listAccounts, queueCampaignSends,
} from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 500

function parseRecipients(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String)
    : typeof v === 'string' ? v.split(/[\s,;]+/)
    : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of raw) {
    const e = r.trim().toLowerCase()
    if (e && EMAIL_RE.test(e) && !seen.has(e)) { seen.add(e); out.push(e) }
  }
  return out
}

/**
 * Queue a campaign run. This only writes the recipient list; the actual sending
 * is drained in batches by POST .../send/run, because a serverless function is
 * killed the moment it responds and could not finish a long run in the
 * background.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const campaign = await getCampaign(params.id)
    if (!campaign)                    return fail(404, 'Campaign not found')
    if (!campaign.subject.trim())     return fail(400, 'Add a subject before sending.')
    if (!campaign.body_html.trim())   return fail(400, 'The campaign has no content.')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')

    const recipients = parseRecipients(body.recipients)
    if (recipients.length === 0) return fail(400, 'Add at least one valid recipient.')
    if (recipients.length > MAX_RECIPIENTS) {
      return fail(400, `Max ${MAX_RECIPIENTS} recipients per run. Split into batches.`)
    }

    const accounts = await listAccounts()
    const chosen   = body.fromAccountId
      ? accounts.find((a) => a.id === String(body.fromAccountId))
      : accounts.find((a) => a.is_active)
    if (!chosen) return fail(400, 'No mailbox available to send from.')

    const account = await getAccountSecretById(chosen.id)
    if (!account?.password_enc) return fail(400, 'That mailbox has no saved password.')

    const total = await queueCampaignSends(params.id, recipients, account.id)
    return ok({ queued: total, total })
  } catch (err) {
    return fromError(err)
  }
}
