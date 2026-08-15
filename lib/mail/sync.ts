import 'server-only'
import { randomUUID } from 'node:crypto'
import { simpleParser, type AddressObject, type Attachment } from 'mailparser'

import { openImap, safeLogout } from './imap'
import { putBuffer } from './storage'
import {
  getFolderState, upsertFolderState,
  findMessageByUid, findMessageByRfc, insertSyncedMessage, attachImapIdentity,
  getDirtyMessages, clearDirty, clearImapUidAfterMove, setAccountSynced,
  listFolderFlagRows, updateServerFlags, insertAttachment,
  listSyncableAccounts, threadForReply,
  type EmailAccountSecret, type EmailFolder,
} from '@/lib/db/email'

/**
 * Two-way IMAP sync for one mailbox.
 *   push:  panel changes (read/star/move) -> IMAP flags/folders
 *   pull:  new server messages -> DB (dedup by UID, then by Message-ID)
 *
 * Node runtime only. Driven by the manual "Sync now" button and the Vercel cron
 * route — Workly has no always-on worker, so both entry points call this.
 */

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** How many recent messages to pull per folder on the very first sync. Kept
    modest so a cold sync fits inside a serverless function's time limit. */
const INITIAL_LIMIT = 40

/** Folders we pull down (Drafts intentionally skipped). */
const PULL_FOLDERS: EmailFolder[] = ['inbox', 'sent', 'junk', 'archive', 'trash']

type FolderMap = Record<string, string | null>

export async function syncMailbox(account: EmailAccountSecret): Promise<void> {
  const client = await openImap(account)
  try {
    const folders = await resolveFolders(client)

    // 1) push local changes first so the pull below sees a consistent server.
    await pushDirty(client, account, folders)

    // 2) pull new messages folder by folder.
    for (const dbFolder of PULL_FOLDERS) {
      const imapPath = folders[dbFolder]
      if (!imapPath) continue
      try {
        await pullFolder(client, account, dbFolder, imapPath)
      } catch (e) {
        console.error(`[sync] pull ${account.address}/${dbFolder} failed:`, (e as Error).message)
      }
    }

    await setAccountSynced(account.id, null)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'sync failed'
    await setAccountSynced(account.id, msg)
    throw e
  } finally {
    await safeLogout(client)
  }
}

export interface SyncOutcome {
  address: string
  ok:      boolean
  error?:  string
}

/** Sync every active, sync-enabled mailbox. One bad mailbox never stops the
    others. Shared by the manual "Sync now" button and the cron route. */
export async function syncAllMailboxes(): Promise<SyncOutcome[]> {
  const accounts = await listSyncableAccounts()
  const results: SyncOutcome[] = []
  for (const account of accounts) {
    try {
      await syncMailbox(account)
      results.push({ address: account.address, ok: true })
    } catch (e) {
      results.push({
        address: account.address,
        ok:      false,
        error:   e instanceof Error ? e.message : 'sync failed',
      })
    }
  }
  return results
}

/* ── folder discovery ───────────────────────────────────── */

async function resolveFolders(client: Awaited<ReturnType<typeof openImap>>): Promise<FolderMap> {
  const list = await client.list()
  const find = (special: string, names: string[]): string | null => {
    const bySpecial = list.find((m) => m.specialUse === special)
    if (bySpecial) return bySpecial.path
    for (const n of names) {
      const hit = list.find(
        (m) => m.path.toLowerCase() === n.toLowerCase() || m.name.toLowerCase() === n.toLowerCase(),
      )
      if (hit) return hit.path
    }
    return null
  }
  return {
    inbox:   'INBOX',
    sent:    find('\\Sent',    ['Sent', 'INBOX.Sent', 'Sent Items']),
    drafts:  find('\\Drafts',  ['Drafts', 'INBOX.Drafts']),
    archive: find('\\Archive', ['Archive', 'INBOX.Archive']),
    trash:   find('\\Trash',   ['Trash', 'INBOX.Trash', 'Deleted', 'Deleted Messages']),
    junk:    find('\\Junk',    ['Junk', 'Spam', 'INBOX.Spam', 'Junk E-mail']),
  }
}

/* ── push: DB -> IMAP ───────────────────────────────────── */

async function pushDirty(
  client: Awaited<ReturnType<typeof openImap>>,
  account: EmailAccountSecret,
  folders: FolderMap,
): Promise<void> {
  const dirty = await getDirtyMessages(account.id)
  for (const m of dirty) {
    if (!m.imap_folder || m.imap_uid == null) continue
    const uidStr    = String(m.imap_uid)
    const target    = folders[m.folder]
    const needsMove = Boolean(target) && target !== m.imap_folder
    try {
      const lock = await client.getMailboxLock(m.imap_folder)
      try {
        if (m.is_read) await client.messageFlagsAdd(uidStr, ['\\Seen'], { uid: true })
        else           await client.messageFlagsRemove(uidStr, ['\\Seen'], { uid: true })
        if (m.is_starred) await client.messageFlagsAdd(uidStr, ['\\Flagged'], { uid: true })
        else              await client.messageFlagsRemove(uidStr, ['\\Flagged'], { uid: true })
        if (needsMove) await client.messageMove(uidStr, target!, { uid: true })
      } finally {
        lock.release()
      }
      // After a move the UID is stale; the destination pull re-links it by Message-ID.
      if (needsMove) await clearImapUidAfterMove(m.id, target!)
      else           await clearDirty(m.id)
    } catch (e) {
      console.error(`[sync] push ${account.address}/${m.id} failed:`, (e as Error).message)
      // leave flags_dirty set so we retry next cycle
    }
  }
}

/* ── pull: IMAP -> DB ───────────────────────────────────── */

async function pullFolder(
  client: Awaited<ReturnType<typeof openImap>>,
  account: EmailAccountSecret,
  dbFolder: EmailFolder,
  imapPath: string,
): Promise<void> {
  const lock = await client.getMailboxLock(imapPath)
  try {
    const mb = client.mailbox
    if (!mb || typeof mb === 'boolean') return
    const uidValidity = Number(mb.uidValidity)
    const uidNext     = Number(mb.uidNext) || 1

    const state = await getFolderState(account.id, imapPath)
    let since = state && Number(state.uidvalidity) === uidValidity ? Number(state.last_uid) : 0
    // First sync (or UIDVALIDITY reset): only take the most recent slice.
    if (since === 0) since = Math.max(0, uidNext - 1 - INITIAL_LIMIT)

    if (mb.exists === 0) {
      await upsertFolderState(account.id, imapPath, uidValidity, since)
      return
    }

    let maxUid = since
    for await (const msg of client.fetch(
      `${since + 1}:*`,
      { uid: true, flags: true, source: true },
      { uid: true },
    )) {
      const uid = Number(msg.uid)
      if (uid <= since) continue
      maxUid = Math.max(maxUid, uid)
      try {
        await ingest(account, dbFolder, imapPath, uidValidity, uid, msg.source, msg.flags)
      } catch (e) {
        console.error(`[sync] ingest ${account.address}/${imapPath}#${uid} failed:`, (e as Error).message)
      }
    }
    await upsertFolderState(account.id, imapPath, uidValidity, maxUid)

    // Reconcile read/star changes made on already-synced messages elsewhere.
    await reconcileFlags(client, account, imapPath)
  } finally {
    lock.release()
  }
}

/** Pull server flag state for messages we already have, updating non-dirty rows
    so a read/star toggled in webmail or on a phone reflects in the panel. */
async function reconcileFlags(
  client: Awaited<ReturnType<typeof openImap>>,
  account: EmailAccountSecret,
  imapPath: string,
): Promise<void> {
  const rows = await listFolderFlagRows(account.id, imapPath)
  if (rows.length === 0) return
  const byUid   = new Map(rows.map((r) => [Number(r.imap_uid), r]))
  const uidList = [...byUid.keys()].join(',')

  for await (const msg of client.fetch(uidList, { uid: true, flags: true }, { uid: true })) {
    const row = byUid.get(Number(msg.uid))
    if (!row) continue
    const isRead    = msg.flags?.has('\\Seen')    ?? false
    const isStarred = msg.flags?.has('\\Flagged') ?? false
    if (isRead !== row.is_read || isStarred !== row.is_starred) {
      await updateServerFlags(row.id, isRead, isStarred)
    }
  }
}

async function ingest(
  account: EmailAccountSecret,
  dbFolder: EmailFolder,
  imapPath: string,
  uidValidity: number,
  uid: number,
  source: Buffer | undefined,
  flags: Set<string> | undefined,
): Promise<void> {
  if (await findMessageByUid(account.id, imapPath, uid)) return   // already have it here
  if (!source) return

  const parsed = await simpleParser(source)
  const rfc    = parsed.messageId ?? null

  // Dedup across the account by Message-ID: links our locally-sent copy, or a
  // message moved between folders, instead of inserting a duplicate.
  if (rfc) {
    const existing = await findMessageByRfc(account.id, rfc)
    if (existing) {
      await attachImapIdentity(existing.id, uid, uidValidity, imapPath)
      return
    }
  }

  const flagSet   = flags ?? new Set<string>()
  const from      = parsed.from?.value?.[0]
  const direction = dbFolder === 'sent' ? 'outbound' : 'inbound'
  const inReplyTo = parsed.inReplyTo ?? null
  const threadId  = (await threadForReply(inReplyTo)) || randomUUID()

  const inserted = await insertSyncedMessage({
    accountId:       account.id,
    direction,
    threadId,
    rfcMessageId:    rfc,
    inReplyTo,
    fromAddress:     (from?.address ?? '').toLowerCase(),
    fromName:        from?.name || null,
    to:              addrList(parsed.to),
    cc:              addrList(parsed.cc),
    subject:         parsed.subject ?? null,
    text:            parsed.text ?? null,
    html:            typeof parsed.html === 'string' ? parsed.html : null,
    folder:          dbFolder,
    isRead:          flagSet.has('\\Seen'),
    isStarred:       flagSet.has('\\Flagged'),
    imapUid:         uid,
    imapUidvalidity: uidValidity,
    imapFolder:      imapPath,
    createdAt:       parsed.date ? parsed.date.toISOString() : null,
  })

  await storeAttachments(inserted.id, parsed.attachments)
}

/** Upload a message's attachments to Supabase Storage. Best effort — one bad
    file never blocks the rest, and never fails the message ingest. */
async function storeAttachments(messageId: string, attachments?: Attachment[]): Promise<void> {
  if (!attachments?.length) return
  for (const att of attachments) {
    try {
      if (!att.content || !att.filename) continue        // skip inline parts with no name
      const size = att.size ?? att.content.length
      if (size > MAX_ATTACHMENT_BYTES) continue
      const safe = att.filename.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
      const path = `inbound/${messageId}/${randomUUID()}-${safe}`
      await putBuffer(path, att.content, att.contentType || 'application/octet-stream')
      await insertAttachment({
        messageId,
        filename:    att.filename,
        contentType: att.contentType ?? null,
        sizeBytes:   size,
        storagePath: path,
      })
    } catch (e) {
      console.error(`[sync] attachment store failed for ${messageId}:`, (e as Error).message)
    }
  }
}

function addrList(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return []
  const groups = Array.isArray(a) ? a : [a]
  const out: string[] = []
  for (const g of groups) {
    for (const v of g.value ?? []) {
      if (v.address) out.push(v.address)
    }
  }
  return out
}
