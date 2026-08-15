import 'server-only'
import { randomUUID } from 'node:crypto'

import { db } from './supabase'
import { encryptSecret } from '@/lib/mail/crypto'

/**
 * Mail store for the email management section.
 *
 * Ported from ClearLevel's lib/email.ts (raw `pg`) onto Supabase. The
 * multi-admin layer is gone: Workly has one admin, so every mailbox is visible
 * to the caller and the per-account access grants are dropped. Everything here
 * runs with the service-role key — never import it from a client component.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────── */

export type EmailFolder    = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'junk'
export type EmailDirection = 'inbound' | 'outbound'
export type ListView       = EmailFolder | 'starred'

export const EMAIL_FOLDERS: EmailFolder[] = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'junk']
export const LIST_VIEWS: ListView[] = ['inbox', 'starred', 'sent', 'drafts', 'archive', 'junk', 'trash']

/** Safe account shape (no credentials) — this is what the API/UI ever sees. */
export interface EmailAccount {
  id:             string
  address:        string
  display_name:   string | null
  is_active:      boolean
  imap_host:      string
  imap_port:      number
  smtp_host:      string
  smtp_port:      number
  username:       string
  sync_enabled:   boolean
  last_synced_at: string | null
  last_error:     string | null
  created_at:     string
  /** Derived, never the ciphertext itself. */
  has_password?:  boolean
}

/** Server-only: includes the encrypted password. Never serialize to the client. */
export interface EmailAccountSecret extends EmailAccount {
  password_enc: string | null
}

const SAFE_ACCOUNT_COLS =
  'id, address, display_name, is_active, imap_host, imap_port, smtp_host, smtp_port, ' +
  'username, sync_enabled, last_synced_at, last_error, created_at'

export interface EmailMessage {
  id:               string
  account_id:       string | null
  direction:        EmailDirection
  thread_id:        string
  rfc_message_id:   string | null
  in_reply_to:      string | null
  from_address:     string
  from_name:        string | null
  to_addresses:     string[]
  cc_addresses:     string[]
  subject:          string | null
  snippet:          string | null
  body_text:        string | null
  body_html:        string | null
  folder:           EmailFolder
  is_read:          boolean
  is_starred:       boolean
  status:           string | null
  provider_id:      string | null
  error:            string | null
  imap_uid:         number | null
  imap_uidvalidity: number | null
  imap_folder:      string | null
  flags_dirty:      boolean
  created_at:       string
  /* joined */
  account_address?: string | null
  attachments?:     EmailAttachment[]
}

export interface EmailAttachment {
  id:           string
  message_id:   string
  filename:     string | null
  content_type: string | null
  size_bytes:   number | null
  storage_path: string | null
  created_at:   string
}

/* ─────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeSnippet(text?: string | null, html?: string | null): string {
  const src = (text && text.trim()) || stripHtml(html)
  return src.slice(0, 140)
}

/**
 * PostgREST parses the `or=` argument as a comma-separated list, so commas,
 * parens and quotes in a search term would break out of the filter. `*` is its
 * wildcard alias for `%`; `%`/`_` are LIKE wildcards not worth honouring from
 * raw input.
 */
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()"*\\%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Rows come back with an embedded `account` object; flatten it for the UI. */
type JoinedRow = Record<string, unknown> & { account?: { address: string } | null }

function flattenMessage(row: JoinedRow): EmailMessage {
  const { account, ...rest } = row
  return { ...(rest as unknown as EmailMessage), account_address: account?.address ?? null }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Accounts
 * ──────────────────────────────────────────────────────────────────────── */

/** Credential-safe list. Never includes password_enc. */
export async function listAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await db()
    .from('email_accounts')
    .select(`${SAFE_ACCOUNT_COLS}, password_enc`)
    .order('address')
  if (error) throw error
  // Report whether a password exists without ever shipping the ciphertext.
  return (data ?? []).map((row) => {
    const { password_enc, ...safe } = row as EmailAccountSecret
    return { ...safe, has_password: Boolean(password_enc) } as EmailAccount
  })
}

/** Server-only: full row incl. encrypted password (sync + send paths). */
export async function getAccountSecretById(id: string): Promise<EmailAccountSecret | null> {
  const { data, error } = await db()
    .from('email_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EmailAccountSecret) ?? null
}

/** Server-only: lookup by address (inbound routing). Includes secret columns. */
export async function getAccountByAddress(address: string): Promise<EmailAccountSecret | null> {
  const { data, error } = await db()
    .from('email_accounts')
    .select('*')
    .eq('address', address.toLowerCase().trim())
    .maybeSingle()
  if (error) throw error
  return (data as EmailAccountSecret) ?? null
}

/** Server-only: every mailbox the sync pass should poll. */
export async function listSyncableAccounts(): Promise<EmailAccountSecret[]> {
  const { data, error } = await db()
    .from('email_accounts')
    .select('*')
    .eq('is_active', true)
    .eq('sync_enabled', true)
    .not('password_enc', 'is', null)
    .order('address')
  if (error) throw error
  return (data ?? []) as EmailAccountSecret[]
}

/** Server-only: the mailbox to send system mail from (first active, by address). */
export async function getDefaultSender(): Promise<EmailAccountSecret | null> {
  const { data, error } = await db()
    .from('email_accounts')
    .select('*')
    .eq('is_active', true)
    .not('password_enc', 'is', null)
    .order('address')
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] as EmailAccountSecret) ?? null
}

export async function createAccount(d: {
  address:      string
  displayName?: string
  imapHost?:    string
  imapPort?:    number
  smtpHost?:    string
  smtpPort?:    number
  username?:    string
  password?:    string   // plaintext; encrypted here before storage
}): Promise<EmailAccount | null> {
  const address = d.address.toLowerCase().trim()
  const { data, error } = await db()
    .from('email_accounts')
    .insert({
      address,
      display_name: d.displayName?.trim() || null,
      imap_host:    d.imapHost?.trim() || 'imap.hostinger.com',
      imap_port:    d.imapPort ?? 993,
      smtp_host:    d.smtpHost?.trim() || 'smtp.hostinger.com',
      smtp_port:    d.smtpPort ?? 465,
      username:     d.username?.trim() || address,
      password_enc: d.password ? encryptSecret(d.password) : null,
    })
    .select(SAFE_ACCOUNT_COLS)
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return null   // address already exists
    throw error
  }
  // Supabase can't infer a row shape from a column list held in a const.
  return data as unknown as EmailAccount
}

export async function updateAccountCredentials(id: string, d: {
  displayName?: string
  imapHost?:    string
  imapPort?:    number
  smtpHost?:    string
  smtpPort?:    number
  username?:    string
  password?:    string   // plaintext; only updated when provided
}): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (d.displayName !== undefined) patch.display_name = d.displayName.trim() || null
  if (d.imapHost) patch.imap_host = d.imapHost.trim()
  if (d.imapPort) patch.imap_port = d.imapPort
  if (d.smtpHost) patch.smtp_host = d.smtpHost.trim()
  if (d.smtpPort) patch.smtp_port = d.smtpPort
  if (d.username) patch.username  = d.username.trim()
  if (d.password) patch.password_enc = encryptSecret(d.password)
  if (Object.keys(patch).length === 0) return

  const { error } = await db().from('email_accounts').update(patch).eq('id', id)
  if (error) throw error
}

export async function setAccountActive(id: string, active: boolean): Promise<void> {
  const { error } = await db().from('email_accounts').update({ is_active: active }).eq('id', id)
  if (error) throw error
}

export async function setAccountSync(id: string, enabled: boolean): Promise<void> {
  const { error } = await db().from('email_accounts').update({ sync_enabled: enabled }).eq('id', id)
  if (error) throw error
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await db().from('email_accounts').delete().eq('id', id)
  if (error) throw error
}

/* ─────────────────────────────────────────────────────────────────────────
 * Messages
 * ──────────────────────────────────────────────────────────────────────── */

export interface ListMessagesOpts {
  folder:     ListView
  accountId?: string
  search?:    string
  limit?:     number
  offset?:    number
}

export async function listMessages(opts: ListMessagesOpts): Promise<EmailMessage[]> {
  const limit  = Math.min(opts.limit ?? 50, 200)
  const offset = opts.offset ?? 0

  let q = db()
    .from('email_messages')
    .select('*, account:email_accounts ( address )')

  // "starred" is a virtual folder: any starred message except in Trash.
  if (opts.folder === 'starred') {
    q = q.eq('is_starred', true).neq('folder', 'trash')
  } else {
    q = q.eq('folder', opts.folder)
  }

  if (opts.accountId) q = q.eq('account_id', opts.accountId)

  const term = opts.search ? sanitizeSearchTerm(opts.search) : ''
  if (term) {
    q = q.or(
      `subject.ilike.%${term}%,from_address.ilike.%${term}%,snippet.ilike.%${term}%`,
    )
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data ?? []).map((r) => flattenMessage(r as JoinedRow))
}

export async function getMessage(id: string): Promise<EmailMessage | null> {
  const { data, error } = await db()
    .from('email_messages')
    .select('*, account:email_accounts ( address )')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const msg = flattenMessage(data as JoinedRow)
  const attMap = await getAttachmentsForMessages([msg.id])
  msg.attachments = attMap[msg.id] ?? []
  return msg
}

/** All messages in a conversation, oldest first, with attachments. */
export async function getThread(threadId: string): Promise<EmailMessage[]> {
  const { data, error } = await db()
    .from('email_messages')
    .select('*, account:email_accounts ( address )')
    .eq('thread_id', threadId)
    .neq('folder', 'trash')
    .order('created_at', { ascending: true })
  if (error) throw error

  const msgs   = (data ?? []).map((r) => flattenMessage(r as JoinedRow))
  const attMap = await getAttachmentsForMessages(msgs.map((m) => m.id))
  return msgs.map((m) => ({ ...m, attachments: attMap[m.id] ?? [] }))
}

/* Panel-initiated flag changes set flags_dirty so the next sync pushes them back
   to IMAP. The sync pass's own writes use updateServerFlags(), which never sets
   the dirty flag — that prevents a push/pull loop. */

export async function markRead(id: string, read = true): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ is_read: read, flags_dirty: true })
    .eq('id', id)
  if (error) throw error
}

export async function setStar(id: string, starred: boolean): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ is_starred: starred, flags_dirty: true })
    .eq('id', id)
  if (error) throw error
}

export async function moveToFolder(id: string, folder: EmailFolder): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ folder, flags_dirty: true })
    .eq('id', id)
  if (error) throw error
}

/** Unread inbox count, for the sidebar badge. */
export async function unreadCount(): Promise<number> {
  const { count, error } = await db()
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('folder', 'inbox')
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

/** Resolve the thread for a reply from the parent's rfc Message-ID. */
export async function threadForReply(inReplyTo?: string | null): Promise<string | null> {
  if (!inReplyTo) return null
  const { data, error } = await db()
    .from('email_messages')
    .select('thread_id')
    .eq('rfc_message_id', inReplyTo)
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] as { thread_id: string } | undefined)?.thread_id ?? null
}

export interface RecordOutboundInput {
  accountId:    string
  fromAddress:  string
  fromName?:    string | null
  to:           string[]
  cc?:          string[]
  subject:      string
  html?:        string | null
  text?:        string | null
  threadId:     string
  inReplyTo?:   string | null
  rfcMessageId: string | null
  status:       'sent' | 'failed'
  error?:       string | null
}

export async function recordOutbound(i: RecordOutboundInput): Promise<EmailMessage> {
  const { data, error } = await db()
    .from('email_messages')
    .insert({
      account_id:     i.accountId,
      direction:      'outbound',
      thread_id:      i.threadId,
      rfc_message_id: i.rfcMessageId,
      in_reply_to:    i.inReplyTo ?? null,
      from_address:   i.fromAddress,
      from_name:      i.fromName ?? null,
      to_addresses:   i.to,
      cc_addresses:   i.cc ?? [],
      subject:        i.subject,
      snippet:        makeSnippet(i.text, i.html),
      body_text:      i.text ?? stripHtml(i.html),
      body_html:      i.html ?? null,
      folder:         'sent',
      is_read:        true,
      status:         i.status,
      provider_id:    i.rfcMessageId,
      error:          i.error ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as EmailMessage
}

/* ─── Drafts (stored in email_messages with folder='drafts') ─── */

export async function saveDraft(d: {
  draftId?:   string
  accountId:  string
  to:         string[]
  cc?:        string[]
  subject:    string
  html:       string
  text:       string
  inReplyTo?: string | null
  threadId?:  string | null
}): Promise<EmailMessage> {
  const account     = await getAccountSecretById(d.accountId)
  const fromAddress = account?.address ?? ''
  const fromName    = account?.display_name ?? null

  const shared = {
    to_addresses: d.to,
    cc_addresses: d.cc ?? [],
    subject:      d.subject,
    body_html:    d.html,
    body_text:    d.text,
    snippet:      makeSnippet(d.text, d.html),
    in_reply_to:  d.inReplyTo ?? null,
    from_address: fromAddress,
    from_name:    fromName,
  }

  if (d.draftId) {
    const { data, error } = await db()
      .from('email_messages')
      .update({ ...shared, created_at: new Date().toISOString() })
      .eq('id', d.draftId)
      .eq('folder', 'drafts')
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (data) return data as EmailMessage
    // Fall through and insert if the draft row vanished (e.g. already sent).
  }

  const { data, error } = await db()
    .from('email_messages')
    .insert({
      ...shared,
      account_id: d.accountId,
      direction:  'outbound',
      thread_id:  d.threadId || randomUUID(),
      folder:     'drafts',
      is_read:    true,
      status:     'draft',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as EmailMessage
}

/** Hard-delete a row (discarding a draft, or clearing one after it is sent). */
export async function deleteMessageRow(id: string): Promise<void> {
  const { error } = await db().from('email_messages').delete().eq('id', id)
  if (error) throw error
}

/* ─────────────────────────────────────────────────────────────────────────
 * Attachments
 * ──────────────────────────────────────────────────────────────────────── */

export async function insertAttachment(a: {
  messageId:   string
  filename:    string | null
  contentType: string | null
  sizeBytes:   number | null
  storagePath: string
}): Promise<void> {
  const { error } = await db().from('email_attachments').insert({
    message_id:   a.messageId,
    filename:     a.filename,
    content_type: a.contentType,
    size_bytes:   a.sizeBytes,
    storage_path: a.storagePath,
  })
  if (error) throw error
}

export async function getAttachmentsForMessages(
  messageIds: string[],
): Promise<Record<string, EmailAttachment[]>> {
  if (messageIds.length === 0) return {}
  const { data, error } = await db()
    .from('email_attachments')
    .select('*')
    .in('message_id', messageIds)
    .order('created_at')
  if (error) throw error

  const map: Record<string, EmailAttachment[]> = {}
  for (const r of (data ?? []) as EmailAttachment[]) {
    (map[r.message_id] ??= []).push(r)
  }
  return map
}

export async function getAttachment(id: string): Promise<EmailAttachment | null> {
  const { data, error } = await db()
    .from('email_attachments')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EmailAttachment) ?? null
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sync support (used by lib/mail/sync.ts)
 * ──────────────────────────────────────────────────────────────────────── */

export interface FolderState {
  account_id:  string
  imap_folder: string
  uidvalidity: number
  last_uid:    number
}

export async function getFolderState(
  accountId: string, imapFolder: string,
): Promise<FolderState | null> {
  const { data, error } = await db()
    .from('email_folder_state')
    .select('*')
    .eq('account_id', accountId)
    .eq('imap_folder', imapFolder)
    .maybeSingle()
  if (error) throw error
  return (data as FolderState) ?? null
}

export async function upsertFolderState(
  accountId: string, imapFolder: string, uidvalidity: number, lastUid: number,
): Promise<void> {
  const { error } = await db()
    .from('email_folder_state')
    .upsert(
      {
        account_id:  accountId,
        imap_folder: imapFolder,
        uidvalidity: uidvalidity,
        last_uid:    lastUid,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'account_id,imap_folder' },
    )
  if (error) throw error
}

/** Dedup: existing row for a specific server message. */
export async function findMessageByUid(
  accountId: string, imapFolder: string, uid: number,
): Promise<EmailMessage | null> {
  const { data, error } = await db()
    .from('email_messages')
    .select('*')
    .eq('account_id', accountId)
    .eq('imap_folder', imapFolder)
    .eq('imap_uid', uid)
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] as EmailMessage) ?? null
}

/** Dedup by RFC Message-ID within an account (links our locally-sent copy, and
    avoids re-inserting after a folder move). */
export async function findMessageByRfc(
  accountId: string, rfcMessageId: string,
): Promise<EmailMessage | null> {
  const { data, error } = await db()
    .from('email_messages')
    .select('*')
    .eq('account_id', accountId)
    .eq('rfc_message_id', rfcMessageId)
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] as EmailMessage) ?? null
}

export interface SyncedMessageInput {
  accountId:       string
  direction:       EmailDirection
  threadId:        string
  rfcMessageId:    string | null
  inReplyTo:       string | null
  fromAddress:     string
  fromName:        string | null
  to:              string[]
  cc:              string[]
  subject:         string | null
  text:            string | null
  html:            string | null
  folder:          EmailFolder
  isRead:          boolean
  isStarred:       boolean
  imapUid:         number
  imapUidvalidity: number
  imapFolder:      string
  createdAt?:      string | null   // original message date
}

export async function insertSyncedMessage(i: SyncedMessageInput): Promise<EmailMessage> {
  const { data, error } = await db()
    .from('email_messages')
    .insert({
      account_id:       i.accountId,
      direction:        i.direction,
      thread_id:        i.threadId,
      rfc_message_id:   i.rfcMessageId,
      in_reply_to:      i.inReplyTo,
      from_address:     i.fromAddress,
      from_name:        i.fromName,
      to_addresses:     i.to,
      cc_addresses:     i.cc,
      subject:          i.subject,
      snippet:          makeSnippet(i.text, i.html),
      body_text:        i.text,
      body_html:        i.html,
      folder:           i.folder,
      is_read:          i.isRead,
      is_starred:       i.isStarred,
      imap_uid:         i.imapUid,
      imap_uidvalidity: i.imapUidvalidity,
      imap_folder:      i.imapFolder,
      created_at:       i.createdAt ?? new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error
  return data as EmailMessage
}

/** Link an existing row (e.g. one we sent locally) to its IMAP identity. */
export async function attachImapIdentity(
  id: string, uid: number, uidvalidity: number, imapFolder: string,
): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ imap_uid: uid, imap_uidvalidity: uidvalidity, imap_folder: imapFolder })
    .eq('id', id)
  if (error) throw error
}

/** Rows changed in the panel that still need pushing to IMAP (have a UID). */
export async function getDirtyMessages(accountId: string): Promise<EmailMessage[]> {
  const { data, error } = await db()
    .from('email_messages')
    .select('*')
    .eq('account_id', accountId)
    .eq('flags_dirty', true)
    .not('imap_uid', 'is', null)
  if (error) throw error
  return (data ?? []) as EmailMessage[]
}

export async function clearDirty(id: string): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ flags_dirty: false })
    .eq('id', id)
  if (error) throw error
}

/** After moving a message to another IMAP folder, drop its old UID so the next
    pull of the destination re-links it (dedup by rfc Message-ID). */
export async function clearImapUidAfterMove(id: string, newImapFolder: string): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ imap_uid: null, imap_folder: newImapFolder, flags_dirty: false })
    .eq('id', id)
  if (error) throw error
}

export async function setAccountSynced(accountId: string, err: string | null): Promise<void> {
  const { error } = await db()
    .from('email_accounts')
    .update({ last_synced_at: new Date().toISOString(), last_error: err })
    .eq('id', accountId)
  if (error) throw error
}

export interface FlagRow {
  id:         string
  imap_uid:   number
  is_read:    boolean
  is_starred: boolean
}

/** Stored, non-dirty messages in a folder — for reconciling flag changes made
    elsewhere (webmail, phone) back into the panel. Capped to recent rows. */
export async function listFolderFlagRows(
  accountId: string, imapFolder: string,
): Promise<FlagRow[]> {
  const { data, error } = await db()
    .from('email_messages')
    .select('id, imap_uid, is_read, is_starred')
    .eq('account_id', accountId)
    .eq('imap_folder', imapFolder)
    .not('imap_uid', 'is', null)
    .eq('flags_dirty', false)
    .order('imap_uid', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as FlagRow[]
}

/** Apply server-side read/star state. Re-checks flags_dirty so a panel change
    made during the sync cycle is not clobbered. */
export async function updateServerFlags(
  id: string, isRead: boolean, isStarred: boolean,
): Promise<void> {
  const { error } = await db()
    .from('email_messages')
    .update({ is_read: isRead, is_starred: isStarred })
    .eq('id', id)
    .eq('flags_dirty', false)
  if (error) throw error
}

/* ─────────────────────────────────────────────────────────────────────────
 * Templates
 * ──────────────────────────────────────────────────────────────────────── */

export interface EmailTemplate {
  id:         string
  name:       string
  subject:    string | null
  body_html:  string
  created_at: string
  updated_at: string
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await db().from('email_templates').select('*').order('name')
  if (error) throw error
  return (data ?? []) as EmailTemplate[]
}

export async function createTemplate(d: {
  name: string; subject?: string | null; bodyHtml: string
}): Promise<EmailTemplate> {
  const { data, error } = await db()
    .from('email_templates')
    .insert({ name: d.name.trim(), subject: d.subject?.trim() || null, body_html: d.bodyHtml })
    .select('*')
    .single()
  if (error) throw error
  return data as EmailTemplate
}

export async function updateTemplate(id: string, d: {
  name?: string; subject?: string | null; bodyHtml?: string
}): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (d.name !== undefined)     patch.name      = d.name.trim()
  if (d.subject !== undefined)  patch.subject   = d.subject?.trim() || null
  if (d.bodyHtml !== undefined) patch.body_html = d.bodyHtml
  if (Object.keys(patch).length === 0) return

  const { error } = await db().from('email_templates').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await db().from('email_templates').delete().eq('id', id)
  if (error) throw error
}

/* ─────────────────────────────────────────────────────────────────────────
 * Campaigns
 * ──────────────────────────────────────────────────────────────────────── */

export interface EmailCampaign {
  id:           string
  name:         string
  subject:      string
  body_html:    string
  last_sent_at: string | null
  created_at:   string
  updated_at:   string
}

export async function listCampaigns(): Promise<EmailCampaign[]> {
  const { data, error } = await db()
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmailCampaign[]
}

export async function getCampaign(id: string): Promise<EmailCampaign | null> {
  const { data, error } = await db()
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EmailCampaign) ?? null
}

export async function createCampaign(d: {
  name: string; subject: string; bodyHtml: string
}): Promise<EmailCampaign> {
  const { data, error } = await db()
    .from('email_campaigns')
    .insert({ name: d.name.trim(), subject: d.subject, body_html: d.bodyHtml })
    .select('*')
    .single()
  if (error) throw error
  return data as EmailCampaign
}

export async function updateCampaign(id: string, d: {
  name?: string; subject?: string; bodyHtml?: string
}): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (d.name !== undefined)     patch.name      = d.name.trim()
  if (d.subject !== undefined)  patch.subject   = d.subject
  if (d.bodyHtml !== undefined) patch.body_html = d.bodyHtml
  if (Object.keys(patch).length === 0) return

  const { error } = await db().from('email_campaigns').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await db().from('email_campaigns').delete().eq('id', id)
  if (error) throw error
}

/* ─── Send queue ───────────────────────────────────────────────────────────
   A campaign run is drained in batches by the /send/run route rather than a
   background loop: on Vercel the function is killed the moment it responds, so
   fire-and-forget (which worked on ClearLevel's always-on VPS) would silently
   stop partway through. */

export interface CampaignSendRow {
  id:        string
  recipient: string
  status:    'queued' | 'sent' | 'failed'
  error:     string | null
}

/** Replace any prior run with a fresh queue of recipients. */
export async function queueCampaignSends(
  campaignId: string, recipients: string[], accountId: string,
): Promise<number> {
  const del = await db().from('email_campaign_sends').delete().eq('campaign_id', campaignId)
  if (del.error) throw del.error
  if (recipients.length === 0) return 0

  const { error } = await db().from('email_campaign_sends').insert(
    recipients.map((recipient) => ({
      campaign_id: campaignId,
      recipient,
      status:      'queued',
      account_id:  accountId,
    })),
  )
  if (error) throw error
  return recipients.length
}

export async function nextQueuedSends(
  campaignId: string, limit: number,
): Promise<CampaignSendRow[]> {
  const { data, error } = await db()
    .from('email_campaign_sends')
    .select('id, recipient, status, error')
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
    .order('created_at')
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CampaignSendRow[]
}

export async function recordCampaignSendResult(
  sendId: string, status: 'sent' | 'failed', err: string | null,
): Promise<void> {
  const { error } = await db()
    .from('email_campaign_sends')
    .update({ status, error: err, sent_at: new Date().toISOString() })
    .eq('id', sendId)
  if (error) throw error
}

export async function touchCampaignSent(id: string): Promise<void> {
  const { error } = await db()
    .from('email_campaigns')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export interface CampaignStatus {
  queued:  number
  sent:    number
  failed:  number
  total:   number
  results: { recipient: string; status: string; error: string | null }[]
}

export async function campaignSendStatus(campaignId: string): Promise<CampaignStatus> {
  const { data, error } = await db()
    .from('email_campaign_sends')
    .select('recipient, status, error')
    .eq('campaign_id', campaignId)
    .order('created_at')
  if (error) throw error

  const rows = (data ?? []) as { recipient: string; status: string; error: string | null }[]
  return {
    queued:  rows.filter((r) => r.status === 'queued').length,
    sent:    rows.filter((r) => r.status === 'sent').length,
    failed:  rows.filter((r) => r.status === 'failed').length,
    total:   rows.length,
    results: rows,
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Contacts
 * ──────────────────────────────────────────────────────────────────────── */

export interface EmailContact {
  id:         string
  name:       string | null
  email:      string
  category:   string
  notes:      string | null
  created_at: string
}

export async function listContacts(category?: string): Promise<EmailContact[]> {
  let q = db().from('email_contacts').select('*')
  if (category) q = q.eq('category', category)
  const { data, error } = await q.order('category').order('name', { nullsFirst: false }).order('email')
  if (error) throw error
  return (data ?? []) as EmailContact[]
}

export async function listContactCategories(): Promise<{ category: string; count: number }[]> {
  const { data, error } = await db().from('email_contacts').select('category')
  if (error) throw error

  const counts = new Map<string, number>()
  for (const r of (data ?? []) as { category: string }[]) {
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

export async function createContact(d: {
  name?: string | null; email: string; category: string; notes?: string | null
}): Promise<EmailContact | null> {
  const { data, error } = await db()
    .from('email_contacts')
    .insert({
      name:     d.name?.trim() || null,
      email:    d.email.toLowerCase().trim(),
      category: d.category.trim() || 'General',
      notes:    d.notes?.trim() || null,
    })
    .select('*')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return null   // already in this category
    throw error
  }
  return data as EmailContact
}

export async function updateContact(id: string, d: {
  name?: string | null; email?: string; category?: string; notes?: string | null
}): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (d.name !== undefined)  patch.name     = d.name?.trim() || null
  if (d.email)               patch.email    = d.email.toLowerCase().trim()
  if (d.category)            patch.category = d.category.trim()
  if (d.notes !== undefined) patch.notes    = d.notes?.trim() || null
  if (Object.keys(patch).length === 0) return

  const { error } = await db().from('email_contacts').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await db().from('email_contacts').delete().eq('id', id)
  if (error) throw error
}

/** Bulk add to a category (pasted list). Returns how many new rows landed. */
export async function bulkAddContacts(
  category: string,
  contacts: { name?: string | null; email: string }[],
): Promise<number> {
  const cat = category.trim() || 'General'

  // De-dupe within the payload first — a repeated address in one insert would
  // trip the (email, category) unique constraint against itself.
  const seen = new Map<string, string | null>()
  for (const c of contacts) {
    const email = c.email.toLowerCase().trim()
    if (email && !seen.has(email)) seen.set(email, c.name?.trim() || null)
  }
  if (seen.size === 0) return 0

  const { data, error } = await db()
    .from('email_contacts')
    .upsert(
      [...seen.entries()].map(([email, name]) => ({ email, name, category: cat })),
      { onConflict: 'email,category', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw error
  return (data ?? []).length
}
