'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Archive, ChevronDown, CornerUpLeft, DownloadCloud, FileText, Forward, Inbox,
  Loader2, Mail, Maximize2, Megaphone, Minimize2, Paperclip, Plus, RefreshCw,
  Search, Send, Settings, ShieldAlert, Star, Trash2, TriangleAlert, Users, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { RichTextEditor, escapeHtml, htmlToText } from './rich-text-editor'

/* ─────────────────────────────────────────────────────────────
 * Types (mirror the API shapes from lib/db/email.ts)
 * ───────────────────────────────────────────────────────────── */

export type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'junk' | 'trash'

export interface Account {
  id:            string
  address:       string
  display_name:  string | null
  is_active:     boolean
  has_password?: boolean
}

export interface AttachmentMeta {
  id:           string
  filename:     string | null
  content_type: string | null
  size_bytes:   number | null
}

export interface Message {
  id:               string
  account_id:       string | null
  direction:        'inbound' | 'outbound'
  thread_id:        string
  rfc_message_id:   string | null
  from_address:     string
  from_name:        string | null
  to_addresses:     string[]
  cc_addresses:     string[]
  subject:          string | null
  snippet:          string | null
  body_text:        string | null
  body_html:        string | null
  folder:           Folder
  is_read:          boolean
  is_starred:       boolean
  status:           string | null
  error:            string | null
  created_at:       string
  account_address?: string | null
  attachments?:     AttachmentMeta[]
}

export interface Template {
  id:        string
  name:      string
  subject:   string | null
  body_html: string
}

interface AttachmentRef {
  storagePath:  string
  filename:     string
  contentType?: string
  sizeBytes?:   number
}

const FOLDERS: { key: Folder; label: string; icon: typeof Inbox }[] = [
  { key: 'inbox',   label: 'Inbox',   icon: Inbox },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'sent',    label: 'Sent',    icon: Send },
  { key: 'drafts',  label: 'Drafts',  icon: FileText },
  { key: 'archive', label: 'Archive', icon: Archive },
  { key: 'junk',    label: 'Junk',    icon: ShieldAlert },
  { key: 'trash',   label: 'Trash',   icon: Trash2 },
]

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function formatBytes(n: number | null | undefined): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtTime(iso: string): string {
  const d     = new Date(iso)
  const now   = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function displayFrom(m: Message): string {
  return m.from_name?.trim() || m.from_address || '(unknown)'
}

function initials(name: string): string {
  const clean = name.replace(/[<>"]/g, '').trim()
  const parts = clean.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** Stable per-sender colour, picked from the theme accents. */
const AVATAR_TONES = [
  'bg-brand/12 text-brand',
  'bg-indigo/12 text-indigo',
  'bg-emerald/12 text-emerald',
  'bg-amber/15 text-amber',
  'bg-violet/12 text-violet',
  'bg-sky/12 text-sky',
  'bg-coral/12 text-coral',
]

function avatarTone(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

function defaultFromId(accounts: Account[], accountFilter: string): string {
  if (accountFilter !== 'all' && accounts.some((a) => a.id === accountFilter)) return accountFilter
  return accounts.find((a) => a.is_active)?.id ?? accounts[0]?.id ?? ''
}

async function readError(r: Response, fallback: string): Promise<string> {
  const body = await r.json().catch(() => ({}))
  return (body as { error?: string }).error ?? fallback
}

/* ═════════════════════════════════════════════════════════════
 * Mail client
 * ═════════════════════════════════════════════════════════════ */

interface Props {
  initialAccounts:  Account[]
  initialTemplates: Template[]
  encryptionReady:  boolean
}

export function MailClient({ initialAccounts, initialTemplates, encryptionReady }: Props) {
  const [accounts,      setAccounts]      = React.useState<Account[]>(initialAccounts)
  const [templates]                       = React.useState<Template[]>(initialTemplates)
  const [folder,        setFolder]        = React.useState<Folder>('inbox')
  const [accountFilter, setAccountFilter] = React.useState('all')

  const [messages, setMessages] = React.useState<Message[]>([])
  const [selected, setSelected] = React.useState<Message | null>(null)
  const [loading,  setLoading]  = React.useState(true)
  const [error,    setError]    = React.useState<string | null>(null)
  const [unread,   setUnread]   = React.useState(0)

  const [searchInput, setSearchInput] = React.useState('')
  const [search,      setSearch]      = React.useState('')

  const [compose,    setCompose]    = React.useState<ComposeState | null>(null)
  const [syncing,    setSyncing]    = React.useState(false)
  const [syncMsg,    setSyncMsg]    = React.useState('')
  const [fullscreen, setFullscreen] = React.useState(false)

  const hasMailbox = accounts.length > 0

  /* Esc exits full screen (unless the composer is open). */
  React.useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !compose) setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, compose])

  /* ── load messages for the active folder/filter ── */
  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ folder })
      if (accountFilter !== 'all') qs.set('account', accountFilter)
      if (search) qs.set('q', search)
      const r = await fetch(`/api/email?${qs}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(await readError(r, 'Failed to load mail'))
      const data = await r.json()
      setMessages(data.messages ?? [])
      setUnread(data.unread ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mail.')
    } finally {
      setLoading(false)
    }
  }, [folder, accountFilter, search])

  React.useEffect(() => { load() }, [load])

  /* Clear the open message when switching folders/mailboxes. */
  React.useEffect(() => { setSelected(null) }, [folder, accountFilter])

  const syncNow = React.useCallback(async (quiet = false) => {
    setSyncing(true)
    if (!quiet) setSyncMsg('')
    try {
      const r    = await fetch('/api/email/sync', { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (!quiet) setSyncMsg((data as { error?: string }).error ?? 'Sync failed.')
      } else if (data.synced === 0) {
        if (!quiet) setSyncMsg('No mailboxes to sync yet.')
      } else {
        const failed = (data.results ?? []).filter((x: { ok: boolean }) => !x.ok)
        if (failed.length) {
          setSyncMsg(`Synced with ${failed.length} error(s): ${failed[0].error ?? ''}`)
        } else if (!quiet) {
          setSyncMsg('Synced.')
        }
      }
    } catch {
      if (!quiet) setSyncMsg('Sync failed — network error.')
    } finally {
      setSyncing(false)
      load()
    }
  }, [load])

  /* Pull once on open so the inbox isn't stale — Workly has no always-on
     worker, so opening the page is the main sync trigger alongside cron. */
  const didAutoSync = React.useRef(false)
  React.useEffect(() => {
    if (didAutoSync.current || !hasMailbox) return
    didAutoSync.current = true
    syncNow(true)
  }, [hasMailbox, syncNow])

  /* ── message actions ── */

  async function patchMessage(id: string, body: Record<string, unknown>) {
    await fetch(`/api/email/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
  }

  async function openMessage(m: Message) {
    setSelected(m)
    try {
      const r = await fetch(`/api/email/${m.id}`, { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json()
      setSelected(data.message)
      if (!m.is_read) {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)))
        setUnread((u) => Math.max(0, u - 1))
      }
    } catch {
      // Keep the list-row version.
    }
  }

  function onRowClick(m: Message) {
    if (folder === 'drafts') startEditDraft(m)
    else openMessage(m)
  }

  async function toggleStar(m: Message, e?: React.MouseEvent) {
    e?.stopPropagation()
    const next = !m.is_starred
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_starred: next } : x)))
    setSelected((s) => (s && s.id === m.id ? { ...s, is_starred: next } : s))
    await patchMessage(m.id, { is_starred: next })
  }

  async function moveMessage(m: Message, to: Folder) {
    await patchMessage(m.id, { folder: to })
    if (folder !== to) setMessages((prev) => prev.filter((x) => x.id !== m.id))
    if (selected?.id === m.id) setSelected(null)
  }

  async function markUnread(m: Message) {
    await patchMessage(m.id, { is_read: false })
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: false } : x)))
    setUnread((u) => u + 1)
    setSelected(null)
  }

  async function discardDraft(m: Message) {
    if (!window.confirm('Discard this draft?')) return
    await fetch(`/api/email/${m.id}`, { method: 'DELETE' })
    setMessages((prev) => prev.filter((x) => x.id !== m.id))
    setSelected(null)
  }

  /* ── compose entry points ── */

  function startCompose() {
    setCompose({
      fromAccountId: defaultFromId(accounts, accountFilter),
      to: '', cc: '', subject: '', html: '', showCc: false, attachments: [],
    })
  }

  function startEditDraft(m: Message) {
    setCompose({
      fromAccountId: m.account_id ?? defaultFromId(accounts, accountFilter),
      to:      m.to_addresses.join(', '),
      cc:      m.cc_addresses.join(', '),
      subject: m.subject ?? '',
      html:    m.body_html || (m.body_text ? `<p>${escapeHtml(m.body_text).replace(/\n/g, '<br>')}</p>` : ''),
      showCc:  m.cc_addresses.length > 0,
      threadId: m.thread_id,
      draftId:  m.id,
      attachments: [],
    })
  }

  function startReply(m: Message) {
    const from = m.account_id && accounts.some((a) => a.id === m.account_id)
      ? m.account_id
      : defaultFromId(accounts, accountFilter)
    const quote =
      `<p></p><blockquote>On ${escapeHtml(new Date(m.created_at).toLocaleString('en-GB'))}, ` +
      `${escapeHtml(displayFrom(m))} wrote:<br>` +
      `${m.body_html || escapeHtml(m.body_text || m.snippet || '').replace(/\n/g, '<br>')}</blockquote>`
    setCompose({
      fromAccountId: from,
      to:      m.from_address,
      cc:      '',
      subject: m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? ''}`,
      html:    quote,
      showCc:  false,
      inReplyTo: m.rfc_message_id ?? undefined,
      threadId:  m.thread_id,
      attachments: [],
    })
  }

  function startForward(m: Message) {
    const from = m.account_id && accounts.some((a) => a.id === m.account_id)
      ? m.account_id
      : defaultFromId(accounts, accountFilter)
    const header =
      `<p>---------- Forwarded message ----------<br>` +
      `From: ${escapeHtml(displayFrom(m))} &lt;${escapeHtml(m.from_address)}&gt;<br>` +
      `Date: ${escapeHtml(new Date(m.created_at).toLocaleString('en-GB'))}<br>` +
      `Subject: ${escapeHtml(m.subject ?? '')}<br>` +
      `To: ${escapeHtml(m.to_addresses.join(', '))}</p>`
    const body = m.body_html
      || `<p>${escapeHtml(m.body_text || m.snippet || '').replace(/\n/g, '<br>')}</p>`
    setCompose({
      fromAccountId: from,
      to: '', cc: '',
      subject: m.subject?.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject ?? ''}`,
      html: `<p></p>${header}${body}`,
      showCc: false,
      attachments: [],
      // Forward starts a fresh conversation (no inReplyTo / threadId).
    })
  }

  const shellClass = fullscreen
    ? 'fixed inset-0 z-[60] flex flex-col overflow-hidden bg-canvas p-4'
    : ''

  return (
    <div className={shellClass}>
      {/* ── Header ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-foreground shadow-sm">
            <Mail className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-tight">Mail</h2>
            <p className="text-[11px] leading-tight text-ink-soft">
              {accounts.length === 0
                ? 'No mailbox connected'
                : accounts.length === 1
                  ? accounts[0].address
                  : `${accounts.length} mailboxes`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <HeaderLink href="/cms/email/templates" title="Templates"><FileText className="size-4" /></HeaderLink>
          <HeaderLink href="/cms/email/campaigns" title="Campaigns"><Megaphone className="size-4" /></HeaderLink>
          <HeaderLink href="/cms/email/contacts"  title="Contacts"><Users className="size-4" /></HeaderLink>
          <HeaderLink href="/cms/email/mailboxes" title="Mailboxes"><Settings className="size-4" /></HeaderLink>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
            className="grid size-9 place-items-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => syncNow()}
            disabled={syncing || !hasMailbox}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <DownloadCloud className={cn('size-4', syncing && 'animate-pulse')} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      {/* ── Setup notices ── */}
      {!encryptionReady && (
        <Notice tone="warn" icon={TriangleAlert} title="MAIL_ENCRYPTION_KEY is not set">
          Mailbox passwords are stored encrypted with this key. Add a long random string to
          <code className="mx-1 rounded bg-surface-2 px-1 py-0.5 text-[11px]">.env.local</code>
          (and the Vercel project env) before connecting a mailbox.
        </Notice>
      )}
      {encryptionReady && !hasMailbox && !loading && (
        <Notice tone="info" icon={Mail} title="No mailbox connected yet">
          Add <span className="font-medium">admin@workly.cc</span> under{' '}
          <Link href="/cms/email/mailboxes" className="font-medium text-brand underline">Mailboxes</Link>{' '}
          to start sending and receiving.
        </Notice>
      )}
      {error && (
        <Notice tone="error" icon={TriangleAlert} title="Something went wrong">{error}</Notice>
      )}
      {syncMsg && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-2.5 text-[12.5px] text-brand">
          {syncMsg}
          <button type="button" onClick={() => setSyncMsg('')} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── 3-pane workspace ── */}
      <div
        className={cn(
          'grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-card',
          'lg:grid-cols-[212px_minmax(300px,400px)_1fr]',
          fullscreen ? 'min-h-0 flex-1' : 'h-[calc(100dvh-220px)] min-h-[460px]',
        )}
      >
        {/* Folder rail */}
        <div className="hidden flex-col border-r border-border bg-surface-2/40 p-3 lg:flex">
          <button
            type="button"
            onClick={startCompose}
            disabled={!hasMailbox}
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13.5px] font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="size-4" strokeWidth={2.5} /> Compose
          </button>

          <nav className="flex flex-col gap-0.5">
            {FOLDERS.map((f) => {
              const Icon   = f.icon
              const active = folder === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFolder(f.key)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                    active
                      ? 'bg-brand/10 font-semibold text-brand'
                      : 'font-medium text-ink-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1 text-left">{f.label}</span>
                  {f.key === 'inbox' && unread > 0 && (
                    <span className={cn(
                      'grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-bold',
                      active ? 'bg-brand text-brand-foreground' : 'bg-surface-2 text-ink-muted',
                    )}>
                      {unread}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {accounts.length > 1 && (
            <div className="mt-auto pt-3">
              <p className="mb-1 px-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">Mailbox</p>
              <div className="relative">
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border bg-surface py-2 pl-2.5 pr-7 text-[12.5px] outline-none focus:border-brand"
                >
                  <option value="all">All mailboxes</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.address}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft" />
              </div>
            </div>
          )}
        </div>

        {/* List pane */}
        <div className={cn('min-h-0 flex-col border-r border-border', selected ? 'hidden lg:flex' : 'flex')}>
          <div className="flex shrink-0 items-center gap-2 border-b border-border p-2.5">
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value as Folder)}
              className="rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] outline-none lg:hidden"
            >
              {FOLDERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>

            <form
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()) }}
              className="relative flex-1"
            >
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search mail"
                className="h-9 w-full rounded-lg border border-transparent bg-surface-2 pl-9 pr-8 text-[13px] outline-none placeholder:text-ink-soft focus:border-brand focus:bg-surface"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setSearch('') }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </form>

            <button
              type="button"
              onClick={load}
              title="Reload"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="grid h-full place-items-center text-ink-soft">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <Mail className="mx-auto mb-3 size-10 text-ink-soft/50" />
                  <p className="text-sm font-semibold text-ink">Nothing here</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {search ? 'No messages match that search.'
                      : folder === 'inbox' ? 'Your inbox is empty.'
                      : `No ${folder} messages.`}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {messages.map((m) => {
                  const isSel      = selected?.id === m.id
                  const unreadRow  = folder === 'inbox' && !m.is_read
                  const who        = m.direction === 'outbound' ? (m.to_addresses[0] ?? '?') : displayFrom(m)
                  return (
                    <li key={m.id} className="relative">
                      <button
                        type="button"
                        onClick={() => onRowClick(m)}
                        className={cn(
                          'flex w-full gap-3 border-l-2 py-3 pl-3 pr-10 text-left transition-colors',
                          isSel
                            ? 'border-brand bg-brand/[0.07]'
                            : 'border-transparent hover:bg-surface-2/50',
                        )}
                      >
                        <span className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold',
                          avatarTone(who),
                        )}>
                          {initials(who)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {unreadRow && <span className="size-2 shrink-0 rounded-full bg-brand" />}
                            <span className={cn(
                              'truncate text-[13px]',
                              unreadRow ? 'font-bold text-ink' : 'font-semibold text-ink',
                            )}>
                              {m.direction === 'outbound'
                                ? `To: ${m.to_addresses.join(', ') || '—'}`
                                : who}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] text-ink-soft">
                              {fmtTime(m.created_at)}
                            </span>
                          </span>

                          <span className={cn(
                            'mt-0.5 block truncate text-[12.5px]',
                            unreadRow ? 'font-semibold text-ink' : 'text-ink-muted',
                          )}>
                            {m.subject || '(no subject)'}
                          </span>

                          <span className="block truncate text-[11.5px] text-ink-soft">
                            {m.status === 'failed' && <span className="font-semibold text-coral">Failed · </span>}
                            {m.snippet || '—'}
                          </span>

                          {accounts.length > 1 && m.account_address && (
                            <span className="mt-1 inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                              {m.account_address}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Star sits outside the row button — nesting buttons is invalid HTML. */}
                      <button
                        type="button"
                        onClick={(e) => toggleStar(m, e)}
                        title={m.is_starred ? 'Unstar' : 'Star'}
                        className="absolute right-2.5 top-3 grid size-7 place-items-center rounded-lg hover:bg-surface-2"
                      >
                        <Star className={cn(
                          'size-4',
                          m.is_starred ? 'fill-amber text-amber' : 'text-ink-soft/60',
                        )} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Reader pane */}
        <div className={cn('min-h-0', selected ? 'flex flex-col' : 'hidden lg:flex')}>
          {selected ? (
            <MessageReader
              message={selected}
              folder={folder}
              onClose={() => setSelected(null)}
              onReply={() => startReply(selected)}
              onForward={() => startForward(selected)}
              onTrash={() => moveMessage(selected, 'trash')}
              onArchive={() => moveMessage(selected, 'archive')}
              onInbox={() => moveMessage(selected, 'inbox')}
              onStar={() => toggleStar(selected)}
              onMarkUnread={() => markUnread(selected)}
              onDiscardDraft={() => discardDraft(selected)}
            />
          ) : (
            <div className="hidden h-full w-full place-items-center bg-surface-2/20 px-8 text-center lg:grid">
              <div>
                <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand/10">
                  <Mail className="size-8 text-brand/60" />
                </div>
                <p className="text-sm font-semibold text-ink-muted">Select a conversation</p>
                <p className="mt-1 text-xs text-ink-soft">Choose a message from the list to read it here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {compose && (
        <ComposeModal
          state={compose}
          setState={setCompose}
          accounts={accounts}
          templates={templates}
          onClose={() => setCompose(null)}
          onSent={() => { setCompose(null); load() }}
        />
      )}
    </div>
  )
}

/* ── Small shared pieces ──────────────────────────────────────────────────── */

function HeaderLink({ href, title, children }: {
  href: string; title: string; children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      title={title}
      className="grid size-9 place-items-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-2 hover:text-brand"
    >
      {children}
    </Link>
  )
}

function Notice({ tone, icon: Icon, title, children }: {
  tone: 'info' | 'warn' | 'error'
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  const tones = {
    info:  'border-brand/20 bg-brand/5 text-brand',
    warn:  'border-amber/30 bg-amber/5 text-amber',
    error: 'border-coral/20 bg-coral/5 text-coral',
  }
  return (
    <div className={cn('mb-3 flex items-start gap-3 rounded-xl border px-4 py-3', tones[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="text-[13px]">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 opacity-90">{children}</p>
      </div>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════
 * Reader
 * ═════════════════════════════════════════════════════════════ */

function MessageReader({
  message, folder, onClose, onReply, onForward, onTrash, onArchive, onInbox,
  onStar, onMarkUnread, onDiscardDraft,
}: {
  message:  Message
  folder:   Folder
  onClose:  () => void
  onReply:  () => void
  onForward: () => void
  onTrash:   () => void
  onArchive: () => void
  onInbox:   () => void
  onStar:    () => void
  onMarkUnread:   () => void
  onDiscardDraft: () => void
}) {
  const isOutbound = message.direction === 'outbound'
  const isDraft    = folder === 'drafts'
  const canArchive = folder === 'inbox' || folder === 'junk' || folder === 'starred'
  const canRestore = folder === 'trash' || folder === 'archive' || folder === 'junk'

  const [thread,   setThread]   = React.useState<Message[]>([message])
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set([message.id]))

  React.useEffect(() => {
    setThread([message])
    setExpanded(new Set([message.id]))
    let cancelled = false
    fetch(`/api/email/thread/${message.thread_id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.messages?.length) return
        const msgs = d.messages as Message[]
        setThread(msgs)
        setExpanded(new Set([message.id, msgs[msgs.length - 1].id]))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [message])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const iconBtn = 'grid size-9 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink'

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        <button type="button" onClick={onClose} title="Back" className={cn(iconBtn, 'mr-0.5 lg:hidden')}>
          <CornerUpLeft className="size-4" />
        </button>

        {!isOutbound && (
          <button
            type="button"
            onClick={onReply}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            <CornerUpLeft className="size-3.5" /> Reply
          </button>
        )}
        {!isDraft && (
          <button
            type="button"
            onClick={onForward}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2"
          >
            <Forward className="size-3.5" /> Forward
          </button>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={onStar} title="Star" className={iconBtn}>
            <Star className={cn('size-4', message.is_starred && 'fill-amber text-amber')} />
          </button>
          {folder === 'inbox' && (
            <button type="button" onClick={onMarkUnread} title="Mark unread" className={iconBtn}>
              <Mail className="size-4" />
            </button>
          )}
          {canArchive && (
            <button type="button" onClick={onArchive} title="Archive" className={iconBtn}>
              <Archive className="size-4" />
            </button>
          )}
          {canRestore && (
            <button
              type="button"
              onClick={onInbox}
              title="Move to Inbox"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-ink-muted hover:bg-surface-2"
            >
              <Inbox className="size-3.5" /> Inbox
            </button>
          )}
          <button
            type="button"
            onClick={isDraft ? onDiscardDraft : onTrash}
            title={isDraft ? 'Discard draft' : 'Delete'}
            className="grid size-9 place-items-center rounded-lg text-coral transition-colors hover:bg-coral/10"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="shrink-0 border-b border-border px-5 pb-3 pt-4">
        <h3 className="text-[19px] font-semibold leading-snug text-ink">
          {message.subject || '(no subject)'}
        </h3>
        <div className="mt-1.5 flex items-center gap-2">
          {thread.length > 1 && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
              {thread.length} messages
            </span>
          )}
          {message.account_address && (
            <span className="text-[11px] text-ink-soft">{message.account_address}</span>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-surface-2/20 px-4 py-4">
        {thread.map((m) => {
          const open  = expanded.has(m.id)
          const isOut = m.direction === 'outbound'
          const who   = isOut ? 'You' : displayFrom(m)
          return (
            <div
              key={m.id}
              className={cn(
                'rounded-xl border bg-surface transition-shadow',
                open ? 'border-border shadow-card' : 'border-border/60',
              )}
            >
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
              >
                <span className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold',
                  avatarTone(isOut ? 'you' : m.from_address),
                )}>
                  {initials(isOut ? (m.from_name || 'You') : who)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink">{who}</span>
                    <span className="truncate text-[11.5px] text-ink-soft">
                      {isOut ? `to ${m.to_addresses.join(', ') || '—'}` : `<${m.from_address}>`}
                    </span>
                    {m.is_starred && <Star className="size-3.5 shrink-0 fill-amber text-amber" />}
                    <span className="ml-auto shrink-0 text-[11px] text-ink-soft">{fmtTime(m.created_at)}</span>
                  </span>

                  {open ? (
                    m.cc_addresses.length > 0 && (
                      <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                        Cc: {m.cc_addresses.join(', ')}
                      </span>
                    )
                  ) : (
                    <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{m.snippet || '—'}</span>
                  )}
                </span>

                <ChevronDown className={cn(
                  'mt-1 size-4 shrink-0 text-ink-soft transition-transform',
                  open && 'rotate-180',
                )} />
              </button>

              {open && (
                <div className="px-3.5 pb-3.5">
                  {m.status === 'failed' && (
                    <div className="mb-2 rounded-lg bg-coral/10 px-3 py-2 text-[12px] text-coral">
                      Delivery failed: {m.error || 'unknown error'}
                    </div>
                  )}
                  <div className="border-t border-border pt-3">
                    <MessageBody message={m} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      {!isDraft && (
        <div className="flex shrink-0 gap-2 border-t border-border bg-surface px-4 py-3">
          {!isOutbound && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13.5px] font-medium text-brand-foreground transition-opacity hover:opacity-90"
            >
              <CornerUpLeft className="size-4" /> Reply
            </button>
          )}
          <button
            type="button"
            onClick={onForward}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-surface-2"
          >
            <Forward className="size-4" /> Forward
          </button>
        </div>
      )}
    </div>
  )
}

function MessageBody({ message }: { message: Message }) {
  const atts = message.attachments ?? []
  return (
    <>
      {message.body_html ? (
        // sandbox="" strips scripts, forms, popups and same-origin access, so a
        // hostile HTML email can't reach the CMS session around it.
        <iframe
          title="Message body"
          sandbox=""
          srcDoc={message.body_html}
          className="min-h-[280px] w-full rounded-lg border border-border bg-white"
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-ink">
          {message.body_text || message.snippet || '(empty message)'}
        </pre>
      )}

      {atts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {atts.map((a) => (
            <a
              key={a.id}
              href={`/api/email/attachments/${a.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex max-w-[240px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] transition-colors hover:bg-surface-2"
            >
              <Paperclip className="size-4 shrink-0 text-brand" />
              <span className="truncate font-medium">{a.filename || 'attachment'}</span>
              {a.size_bytes ? (
                <span className="shrink-0 text-ink-soft">{formatBytes(a.size_bytes)}</span>
              ) : null}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

/* ═════════════════════════════════════════════════════════════
 * Compose
 * ═════════════════════════════════════════════════════════════ */

interface ComposeState {
  fromAccountId: string
  to:            string
  cc:            string
  subject:       string
  html:          string
  showCc:        boolean
  inReplyTo?:    string
  threadId?:     string
  draftId?:      string
  attachments:   AttachmentRef[]
}

function ComposeModal({
  state, setState, accounts, templates, onClose, onSent,
}: {
  state:     ComposeState
  setState:  (s: ComposeState | null) => void
  accounts:  Account[]
  templates: Template[]
  onClose:   () => void
  onSent:    () => void
}) {
  const [sending,   setSending]   = React.useState(false)
  const [saving,    setSaving]    = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error,     setError]     = React.useState<string | null>(null)
  const [showTemplates, setShowTemplates] = React.useState(false)

  const fileRef = React.useRef<HTMLInputElement>(null)
  const patch   = (p: Partial<ComposeState>) => setState({ ...state, ...p })

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    // Accumulate locally: `state` is a closure snapshot, so writing it once per
    // file inside the loop would keep only the last upload.
    const added: AttachmentRef[] = []
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const r = await fetch('/api/email/attachments/upload', { method: 'POST', body: form })
        if (!r.ok) throw new Error(await readError(r, `Could not upload ${file.name}`))
        added.push(await r.json())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      if (added.length) setState({ ...state, attachments: [...state.attachments, ...added] })
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveDraft() {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/email/drafts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId:       state.draftId,
          fromAccountId: state.fromAccountId,
          to:            state.to,
          cc:            state.cc,
          subject:       state.subject,
          html:          state.html,
          text:          htmlToText(state.html),
          inReplyTo:     state.inReplyTo,
          threadId:      state.threadId,
        }),
      })
      if (!r.ok) throw new Error(await readError(r, 'Could not save the draft'))
      const { draft } = await r.json()
      patch({ draftId: draft.id, threadId: draft.thread_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the draft.')
    } finally {
      setSaving(false)
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const r = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: state.fromAccountId,
          to:            state.to,
          cc:            state.showCc ? state.cc : '',
          subject:       state.subject,
          html:          state.html,
          text:          htmlToText(state.html),
          inReplyTo:     state.inReplyTo,
          threadId:      state.threadId,
          draftId:       state.draftId,
          attachments:   state.attachments,
        }),
      })
      if (!r.ok) throw new Error(await readError(r, 'Failed to send'))
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send.')
    } finally {
      setSending(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h3 className="text-base font-semibold">
              {state.draftId ? 'Edit Draft' : state.inReplyTo ? 'Reply' : 'New Message'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={send} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {/* From */}
              <Field label="From">
                <select
                  value={state.fromAccountId}
                  onChange={(e) => patch({ fromAccountId: e.target.value })}
                  className={inputClass}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.is_active}>
                      {a.display_name ? `${a.display_name} <${a.address}>` : a.address}
                      {a.is_active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </Field>

              {/* To */}
              <Field label="To">
                <div className="flex gap-2">
                  <input
                    value={state.to}
                    onChange={(e) => patch({ to: e.target.value })}
                    placeholder="name@example.com, another@example.com"
                    className={inputClass}
                  />
                  {!state.showCc && (
                    <button
                      type="button"
                      onClick={() => patch({ showCc: true })}
                      className="shrink-0 rounded-xl border border-border px-3 text-xs font-medium text-ink-muted hover:bg-surface-2"
                    >
                      Cc
                    </button>
                  )}
                </div>
              </Field>

              {state.showCc && (
                <Field label="Cc">
                  <input
                    value={state.cc}
                    onChange={(e) => patch({ cc: e.target.value })}
                    placeholder="cc@example.com"
                    className={inputClass}
                  />
                </Field>
              )}

              {/* Subject + templates */}
              <Field label="Subject">
                <div className="flex gap-2">
                  <input
                    value={state.subject}
                    onChange={(e) => patch({ subject: e.target.value })}
                    placeholder="Subject"
                    className={inputClass}
                  />
                  {templates.length > 0 && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowTemplates((v) => !v)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-ink-muted hover:bg-surface-2"
                      >
                        <FileText className="size-3.5" /> Template
                      </button>
                      {showTemplates && (
                        <div className="absolute right-0 top-full z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop">
                          {templates.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                patch({
                                  subject: t.subject || state.subject,
                                  html:    state.html ? `${state.html}${t.body_html}` : t.body_html,
                                })
                                setShowTemplates(false)
                              }}
                              className="block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-2"
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Field>

              {/* Body */}
              <RichTextEditor
                value={state.html}
                onChange={(html) => patch({ html })}
                minHeight="240px"
              />

              {/* Attachments */}
              {state.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {state.attachments.map((a) => (
                    <span
                      key={a.storagePath}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-1.5 text-[12px]"
                    >
                      <Paperclip className="size-3.5 shrink-0 text-brand" />
                      <span className="max-w-[160px] truncate font-medium">{a.filename}</span>
                      {a.sizeBytes ? <span className="text-ink-soft">{formatBytes(a.sizeBytes)}</span> : null}
                      <button
                        type="button"
                        onClick={() => patch({
                          attachments: state.attachments.filter((x) => x.storagePath !== a.storagePath),
                        })}
                        className="text-ink-soft hover:text-coral"
                        aria-label={`Remove ${a.filename}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border p-4">
              <input
                ref={fileRef}
                type="file"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Attach files"
                className="grid size-10 place-items-center rounded-xl border border-border text-ink-muted hover:bg-surface-2 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              </button>

              <button
                type="button"
                onClick={saveDraft}
                disabled={saving || sending}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save draft
              </button>

              <button
                type="submit"
                disabled={sending || !state.to.trim() || !state.subject.trim()}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-medium text-brand-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <label className="w-16 shrink-0 text-xs font-semibold text-ink-muted">{label}</label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
