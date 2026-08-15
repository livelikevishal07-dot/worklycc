import 'server-only'
import nodemailer from 'nodemailer'
import { randomUUID } from 'node:crypto'

import { decryptSecret } from './crypto'
import {
  nextQueuedSends,
  recordCampaignSendResult,
  touchCampaignSent,
  type EmailAccountSecret,
} from '@/lib/db/email'

/**
 * Send one HTML campaign to many recipients from a single mailbox.
 *
 * ClearLevel fired this off in the background and let it run for minutes on its
 * VPS. On Vercel the function is killed as soon as it responds, so the run is
 * drained in bounded batches instead: each call to runCampaignBatch() sends what
 * it can inside `budgetMs` and returns how many recipients remain, and the
 * client keeps calling until the queue is empty. Progress survives between calls
 * because it lives in email_campaign_sends.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Pause between messages, to stay inside the provider's rate limits. */
const THROTTLE_MS = Number(process.env.MAIL_CAMPAIGN_DELAY_MS ?? 600)

/** Wall-clock budget for one batch — comfortably inside a 60s function limit. */
const DEFAULT_BUDGET_MS = 40_000

/** Hard ceiling on messages per batch, whatever the clock says. */
const MAX_PER_BATCH = 40

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface BatchResult {
  processed: number
  sent:      number
  failed:    number
  remaining: number
  done:      boolean
}

export async function runCampaignBatch(
  account: EmailAccountSecret,
  campaign: { id: string; subject: string; body_html: string },
  budgetMs: number = DEFAULT_BUDGET_MS,
): Promise<BatchResult> {
  if (!account.password_enc) {
    throw new Error('That mailbox has no saved password.')
  }

  const queue = await nextQueuedSends(campaign.id, MAX_PER_BATCH)
  if (queue.length === 0) {
    await touchCampaignSent(campaign.id)
    return { processed: 0, sent: 0, failed: 0, remaining: 0, done: true }
  }

  const pass   = decryptSecret(account.password_enc)
  const domain = account.address.split('@')[1] || 'localhost'
  const text   = stripHtml(campaign.body_html)

  const transport = nodemailer.createTransport({
    host:   account.smtp_host,
    port:   account.smtp_port,
    secure: account.smtp_port === 465,
    auth:   { user: account.username || account.address, pass },
    pool:   true,
    maxConnections: 1,
    maxMessages:    50,
    connectionTimeout: 20_000,
    socketTimeout:     30_000,
  })

  const startedAt = Date.now()
  let sent = 0
  let failed = 0
  let processed = 0

  try {
    for (const row of queue) {
      // Stop cleanly before the function's time limit; the rest stays queued.
      if (Date.now() - startedAt > budgetMs) break

      let status: 'sent' | 'failed' = 'sent'
      let error: string | null = null
      try {
        await transport.sendMail({
          from:      { name: account.display_name || account.address, address: account.address },
          to:        row.recipient,
          subject:   campaign.subject,
          html:      campaign.body_html,
          text,
          messageId: `<${randomUUID()}@${domain}>`,
        })
        sent++
      } catch (e) {
        status = 'failed'
        error  = e instanceof Error ? e.message : 'send failed'
        failed++
      }
      processed++

      try {
        await recordCampaignSendResult(row.id, status, error)
      } catch {
        // Logging must never stop the run.
      }
      await sleep(THROTTLE_MS)
    }
  } finally {
    transport.close()
  }

  const stillQueued = await nextQueuedSends(campaign.id, 1)
  const done = stillQueued.length === 0
  if (done) {
    try { await touchCampaignSent(campaign.id) } catch { /* ignore */ }
  }

  return {
    processed,
    sent,
    failed,
    remaining: done ? 0 : -1,   // exact count comes from the status endpoint
    done,
  }
}
