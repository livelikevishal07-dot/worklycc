import 'server-only'
import nodemailer from 'nodemailer'
import { randomUUID } from 'node:crypto'

import { decryptSecret } from './crypto'
import type { EmailAccountSecret } from '@/lib/db/email'

/**
 * SMTP sending via Nodemailer using a mailbox's own credentials.
 *
 * We build the raw MIME once with a stream transport, send those exact bytes,
 * and return them so the caller can APPEND the identical message to the IMAP
 * Sent folder (SMTP sending does not populate IMAP Sent on its own).
 */

export interface SmtpAttachment {
  filename:     string
  content:      Buffer
  contentType?: string
}

export interface SmtpSendInput {
  to:           string[]
  cc?:          string[]
  subject:      string
  text?:        string
  html?:        string
  inReplyTo?:   string      // parent rfc Message-ID, when replying
  references?:  string[]
  attachments?: SmtpAttachment[]
}

export interface SmtpSendResult {
  rfcMessageId: string      // the Message-ID we stamped on the message
  raw:          Buffer      // full RFC822 bytes (for IMAP append)
}

export async function smtpSend(
  account: EmailAccountSecret,
  input: SmtpSendInput,
): Promise<SmtpSendResult> {
  if (!account.password_enc) {
    throw new Error('This mailbox has no stored password. Re-add it from Mailboxes.')
  }
  const pass         = decryptSecret(account.password_enc)
  const domain       = account.address.split('@')[1] || 'localhost'
  const rfcMessageId = `<${randomUUID()}@${domain}>`

  const mailOptions = {
    from:      { name: account.display_name || account.address, address: account.address },
    to:        input.to,
    cc:        input.cc?.length ? input.cc : undefined,
    subject:   input.subject,
    text:      input.text || undefined,
    html:      input.html || undefined,
    inReplyTo: input.inReplyTo,
    references: input.references?.length ? input.references : undefined,
    messageId: rfcMessageId,
    attachments: input.attachments?.length
      ? input.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
      : undefined,
  }

  // 1) Build the raw MIME bytes (no network). streamTransport+buffer returns the
  //    full message as a Buffer, which nodemailer's SMTP types don't model.
  const builder = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const built = (await builder.sendMail(mailOptions)) as unknown as {
    message:  Buffer
    envelope: { from: string; to: string[] }
  }
  const raw = built.message

  // 2) Send those exact bytes over SMTP.
  const transport = nodemailer.createTransport({
    host:   account.smtp_host,
    port:   account.smtp_port,
    secure: account.smtp_port === 465,
    auth:   { user: account.username || account.address, pass },
    connectionTimeout: 20_000,
    greetingTimeout:   20_000,
    socketTimeout:     30_000,
  })
  try {
    await transport.sendMail({ envelope: built.envelope, raw })
  } finally {
    transport.close()
  }

  return { rfcMessageId, raw }
}
