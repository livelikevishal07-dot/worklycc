import 'server-only'
import { randomUUID } from 'node:crypto'

import { smtpSend, type SmtpAttachment } from './smtp'
import { appendToSent } from './imap'
import { getBuffer } from './storage'
import {
  recordOutbound,
  threadForReply,
  insertAttachment,
  type EmailMessage,
  type EmailAccountSecret,
} from '@/lib/db/email'

export interface AttachmentRef {
  storagePath:  string
  filename:     string
  contentType?: string
  sizeBytes?:   number
}

export interface ComposeInput {
  to:           string[]
  cc?:          string[]
  subject:      string
  text?:        string
  html?:        string
  inReplyTo?:   string | null   // parent rfc Message-ID, when replying
  threadId?:    string | null   // existing thread, when replying
  attachments?: AttachmentRef[]
}

/**
 * Full send pipeline for one message:
 *   1. SMTP send via the mailbox's own credentials
 *   2. APPEND the same bytes to the IMAP Sent folder (best effort)
 *   3. record it in the DB (always, even on failure, so the user sees it)
 */
export async function sendFromAccount(
  account: EmailAccountSecret,
  input: ComposeInput,
): Promise<EmailMessage> {
  // Keep replies in the same conversation; otherwise start a new thread.
  const threadId   = input.threadId || (await threadForReply(input.inReplyTo)) || randomUUID()
  const references = input.inReplyTo ? [input.inReplyTo] : undefined

  // Pull attachment bytes back out of storage to attach to the outgoing message.
  const refs = input.attachments ?? []
  const smtpAttachments: SmtpAttachment[] = []
  for (const ref of refs) {
    try {
      const content = await getBuffer(ref.storagePath)
      smtpAttachments.push({ filename: ref.filename, content, contentType: ref.contentType })
    } catch (e) {
      console.error('attachment fetch failed:', ref.storagePath, (e as Error).message)
    }
  }

  let status: 'sent' | 'failed' = 'sent'
  let error:  string | null = null
  let rfcMessageId: string | null = null
  let raw: Buffer | null = null

  try {
    const result = await smtpSend(account, {
      to:        input.to,
      cc:        input.cc,
      subject:   input.subject,
      text:      input.text,
      html:      input.html,
      inReplyTo: input.inReplyTo ?? undefined,
      references,
      attachments: smtpAttachments.length ? smtpAttachments : undefined,
    })
    rfcMessageId = result.rfcMessageId
    raw          = result.raw
  } catch (e) {
    status = 'failed'
    error  = e instanceof Error ? e.message : 'Failed to send.'
  }

  // Mirror to IMAP Sent so webmail/phone show it too. Never fail the send for this.
  if (status === 'sent' && raw) {
    try {
      await appendToSent(account, raw)
    } catch (e) {
      console.error('IMAP Sent append failed:', e)
    }
  }

  const msg = await recordOutbound({
    accountId:   account.id,
    fromAddress: account.address,
    fromName:    account.display_name,
    to:          input.to,
    cc:          input.cc,
    subject:     input.subject,
    html:        input.html,
    text:        input.text,
    threadId,
    inReplyTo:   input.inReplyTo ?? null,
    rfcMessageId,
    status,
    error,
  })

  // Link the (already-uploaded) attachments to the stored Sent message.
  for (const ref of refs) {
    try {
      await insertAttachment({
        messageId:   msg.id,
        filename:    ref.filename,
        contentType: ref.contentType ?? null,
        sizeBytes:   ref.sizeBytes ?? null,
        storagePath: ref.storagePath,
      })
    } catch (e) {
      console.error('attachment record failed:', (e as Error).message)
    }
  }

  return msg
}
