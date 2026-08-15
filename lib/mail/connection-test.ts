import 'server-only'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'

/**
 * Live credential checks used when a mailbox is added or edited, so a wrong
 * password / host is caught before we store it. Node runtime only.
 */

export interface MailCredentials {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  username: string
  password: string
}

export interface ProbeResult {
  ok:     boolean
  error?: string
}

const TIMEOUT = 12_000

export async function testImap(c: {
  host: string; port: number; user: string; pass: string
}): Promise<ProbeResult> {
  const client = new ImapFlow({
    host:   c.host,
    port:   c.port,
    secure: c.port === 993,
    auth:   { user: c.user, pass: c.pass },
    logger: false,
    // Fail fast instead of hanging on a bad host.
    connectionTimeout: TIMEOUT,
    greetingTimeout:   TIMEOUT,
    socketTimeout:     TIMEOUT,
  })
  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'IMAP connection failed' }
  } finally {
    try { client.close() } catch { /* already closed */ }
  }
}

export async function testSmtp(c: {
  host: string; port: number; user: string; pass: string
}): Promise<ProbeResult> {
  const transport = nodemailer.createTransport({
    host:   c.host,
    port:   c.port,
    secure: c.port === 465,
    auth:   { user: c.user, pass: c.pass },
    connectionTimeout: TIMEOUT,
    greetingTimeout:   TIMEOUT,
    socketTimeout:     TIMEOUT,
  })
  try {
    await transport.verify()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'SMTP connection failed' }
  } finally {
    transport.close()
  }
}

export async function testMailbox(c: MailCredentials): Promise<{
  imap: ProbeResult
  smtp: ProbeResult
  ok:   boolean
}> {
  const [imap, smtp] = await Promise.all([
    testImap({ host: c.imapHost, port: c.imapPort, user: c.username, pass: c.password }),
    testSmtp({ host: c.smtpHost, port: c.smtpPort, user: c.username, pass: c.password }),
  ])
  return { imap, smtp, ok: imap.ok && smtp.ok }
}
