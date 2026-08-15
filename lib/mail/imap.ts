import 'server-only'
import { ImapFlow, type ListResponse } from 'imapflow'

import { decryptSecret } from './crypto'
import type { EmailAccountSecret } from '@/lib/db/email'

/**
 * IMAP helpers shared by the send route (append to Sent) and the sync pass.
 * Node runtime only.
 */

export async function openImap(account: EmailAccountSecret): Promise<ImapFlow> {
  if (!account.password_enc) {
    throw new Error('This mailbox has no stored password.')
  }
  const client = new ImapFlow({
    host:   account.imap_host,
    port:   account.imap_port,
    secure: account.imap_port === 993,
    auth:   { user: account.username || account.address, pass: decryptSecret(account.password_enc) },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout:   20_000,
    socketTimeout:     60_000,
  })
  await client.connect()
  return client
}

export async function safeLogout(client: ImapFlow): Promise<void> {
  try { await client.logout() } catch { /* ignore */ }
  try { client.close() }        catch { /* ignore */ }
}

/**
 * Find a mailbox by its IMAP special-use flag (e.g. "\\Sent", "\\Trash").
 * Falls back to common folder names so we still work on servers that don't
 * advertise special-use.
 */
export async function findSpecialMailbox(
  client: ImapFlow,
  specialUse: string,
  fallbackNames: string[] = [],
): Promise<string | null> {
  const list = (await client.list()) as ListResponse[]
  const bySpecial = list.find((m) => m.specialUse === specialUse)
  if (bySpecial) return bySpecial.path
  for (const name of fallbackNames) {
    const hit = list.find(
      (m) => m.path.toLowerCase() === name.toLowerCase() || m.name.toLowerCase() === name.toLowerCase(),
    )
    if (hit) return hit.path
  }
  return null
}

/** Append already-built raw MIME bytes to the mailbox's Sent folder. */
export async function appendToSent(account: EmailAccountSecret, raw: Buffer): Promise<void> {
  const client = await openImap(account)
  try {
    const sent =
      (await findSpecialMailbox(client, '\\Sent', ['Sent', 'INBOX.Sent', 'Sent Items'])) ?? 'Sent'
    await client.append(sent, raw, ['\\Seen'])
  } finally {
    await safeLogout(client)
  }
}
