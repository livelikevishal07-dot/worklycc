import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  campaignSendStatus, getAccountSecretById, getCampaign, listAccounts,
} from '@/lib/db/email'
import { runCampaignBatch } from '@/lib/mail/campaign'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * Drain one batch of a campaign's queue. The client calls this repeatedly until
 * `done` comes back true — each call sends what fits inside the function's time
 * limit and leaves the rest queued.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const campaign = await getCampaign(params.id)
    if (!campaign) return fail(404, 'Campaign not found')

    const body = await req.json().catch(() => ({}))

    const accounts = await listAccounts()
    const chosen   = body?.fromAccountId
      ? accounts.find((a) => a.id === String(body.fromAccountId))
      : accounts.find((a) => a.is_active)
    if (!chosen) return fail(400, 'No mailbox available to send from.')

    const account = await getAccountSecretById(chosen.id)
    if (!account?.password_enc) return fail(400, 'That mailbox has no saved password.')

    const result = await runCampaignBatch(account, {
      id:        campaign.id,
      subject:   campaign.subject,
      body_html: campaign.body_html,
    })

    // Return exact counts so the UI's progress bar is accurate.
    const status = await campaignSendStatus(params.id)
    return ok({ ...result, remaining: status.queued, status })
  } catch (err) {
    return fromError(err)
  }
}
