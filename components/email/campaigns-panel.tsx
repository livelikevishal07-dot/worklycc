'use client'

import * as React from 'react'
import {
  CheckCircle2, Loader2, Megaphone, Pencil, Plus, Send, Trash2, TriangleAlert, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { RichTextEditor } from './rich-text-editor'
import type { Account } from './mail-client'

export interface Campaign {
  id:           string
  name:         string
  subject:      string
  body_html:    string
  last_sent_at: string | null
}

interface SendStatus {
  queued:  number
  sent:    number
  failed:  number
  total:   number
  results: { recipient: string; status: string; error: string | null }[]
}

interface Props {
  initialCampaigns:  Campaign[]
  accounts:          Account[]
  contactCategories: { category: string; count: number }[]
}

export function CampaignsPanel({ initialCampaigns, accounts, contactCategories }: Props) {
  const [items,    setItems]    = React.useState(initialCampaigns)
  const [editing,  setEditing]  = React.useState<Campaign | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [sending,  setSending]  = React.useState<Campaign | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  async function refresh() {
    const r = await fetch('/api/email/campaigns', { cache: 'no-store' })
    if (r.ok) setItems((await r.json()).campaigns ?? [])
  }

  async function remove(c: Campaign) {
    if (!window.confirm(`Delete the campaign “${c.name}”?`)) return
    setDeleting(c.id)
    try {
      await fetch(`/api/email/campaigns/${c.id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter((x) => x.id !== c.id))
    } finally {
      setDeleting(null)
    }
  }

  const formOpen = creating || editing !== null

  return (
    <div className="space-y-4">
      {!formOpen && !sending && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="size-4" /> New campaign
        </button>
      )}

      {formOpen && (
        <CampaignForm
          campaign={editing}
          onCancel={() => { setCreating(false); setEditing(null) }}
          onSaved={async () => { setCreating(false); setEditing(null); await refresh() }}
        />
      )}

      {sending && (
        <SendPanel
          campaign={sending}
          accounts={accounts}
          contactCategories={contactCategories}
          onClose={async () => { setSending(null); await refresh() }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">
              <Megaphone className="size-6 text-ink-soft" />
            </div>
            <p className="text-sm font-medium text-ink-muted">No campaigns yet.</p>
            <p className="max-w-sm text-center text-xs text-ink-soft">
              A campaign is one HTML email sent to many recipients, with a per-recipient delivery log.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.id} className="group flex flex-wrap items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2/40">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet">
                  <Megaphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{c.subject || '(no subject)'}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">
                    {c.last_sent_at
                      ? `Last sent ${new Date(c.last_sent_at).toLocaleString('en-GB')}`
                      : 'Never sent'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setSending(c); setEditing(null); setCreating(false) }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-brand"
                  >
                    <Send className="size-3.5" /> Send
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(c); setSending(null) }}
                    title="Edit"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    disabled={deleting === c.id}
                    title="Delete"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                  >
                    {deleting === c.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── Editor ───────────────────────────────────────────────────────────────── */

function CampaignForm({ campaign, onCancel, onSaved }: {
  campaign: Campaign | null
  onCancel: () => void
  onSaved:  () => void
}) {
  const [name,    setName]    = React.useState(campaign?.name ?? '')
  const [subject, setSubject] = React.useState(campaign?.subject ?? '')
  const [html,    setHtml]    = React.useState(campaign?.body_html ?? '')
  const [saving,  setSaving]  = React.useState(false)
  const [error,   setError]   = React.useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(
        campaign ? `/api/email/campaigns/${campaign.id}` : '/api/email/campaigns',
        {
          method:  campaign ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, subject, bodyHtml: html }),
        },
      )
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Could not save the campaign')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the campaign.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{campaign ? 'Edit campaign' : 'New campaign'}</h3>
        <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Campaign name <span className="text-coral">*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="August newsletter" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's new at Workly" className={inputClass} />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Body</span>
        <RichTextEditor value={html} onChange={setHtml} minHeight="260px" />
      </div>

      {error && <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {campaign ? 'Save changes' : 'Create campaign'}
        </button>
      </div>
    </form>
  )
}

/* ── Send panel ───────────────────────────────────────────────────────────── */

function SendPanel({ campaign, accounts, contactCategories, onClose }: {
  campaign:  Campaign
  accounts:  Account[]
  contactCategories: { category: string; count: number }[]
  onClose:   () => void
}) {
  const [fromAccountId, setFromAccountId] = React.useState(
    accounts.find((a) => a.is_active)?.id ?? accounts[0]?.id ?? '',
  )
  const [recipients, setRecipients] = React.useState('')
  const [running,    setRunning]    = React.useState(false)
  const [status,     setStatus]     = React.useState<SendStatus | null>(null)
  const [error,      setError]      = React.useState<string | null>(null)
  const abort = React.useRef(false)

  /** Pull every address in a contact category into the recipient box. */
  async function addCategory(category: string) {
    const r = await fetch(`/api/email/contacts?category=${encodeURIComponent(category)}`, { cache: 'no-store' })
    if (!r.ok) return
    const { contacts } = await r.json()
    const emails = (contacts as { email: string }[]).map((c) => c.email)
    setRecipients((prev) => {
      const have = new Set(prev.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))
      const add  = emails.filter((e) => !have.has(e.toLowerCase()))
      return [prev.trim(), ...add].filter(Boolean).join('\n')
    })
  }

  async function start() {
    setRunning(true)
    setError(null)
    abort.current = false
    try {
      // 1) Queue every recipient.
      const q = await fetch(`/api/email/campaigns/${campaign.id}/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipients, fromAccountId }),
      })
      const qd = await q.json().catch(() => ({}))
      if (!q.ok) throw new Error((qd as { error?: string }).error ?? 'Could not queue the send')
      setStatus({ queued: qd.total, sent: 0, failed: 0, total: qd.total, results: [] })

      // 2) Drain it batch by batch. Serverless functions die when they respond,
      //    so the loop lives here in the browser rather than on the server.
      for (;;) {
        if (abort.current) break
        const r = await fetch(`/api/email/campaigns/${campaign.id}/send/run`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fromAccountId }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Send failed partway through')
        if (d.status) setStatus(d.status)
        if (d.done) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.')
    } finally {
      setRunning(false)
    }
  }

  const pct = status && status.total > 0
    ? Math.round(((status.sent + status.failed) / status.total) * 100)
    : 0

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Send “{campaign.name}”</h3>
          <p className="text-xs text-ink-soft">{campaign.subject || '(no subject)'}</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-amber">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <p className="text-[13px]">Connect a mailbox first — campaigns send through your own SMTP.</p>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Send from</span>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              disabled={running}
              className="h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.is_active}>{a.address}</option>
              ))}
            </select>
          </label>

          {contactCategories.length > 0 && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Add from contacts</span>
              <div className="flex flex-wrap gap-1.5">
                {contactCategories.map((c) => (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => addCategory(c.category)}
                    disabled={running}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
                  >
                    + {c.category} ({c.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
              Recipients <span className="font-normal text-ink-soft">(one per line — max 500 per run)</span>
            </span>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              disabled={running}
              rows={6}
              placeholder={'someone@example.com\nanother@example.com'}
              className="w-full resize-y rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 font-mono text-xs leading-relaxed outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {/* Progress */}
          {status && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">
                  {status.sent + status.failed} of {status.total} processed
                </span>
                <span className="text-ink-soft">
                  {status.sent} sent
                  {status.failed > 0 && <span className="text-coral"> · {status.failed} failed</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn('h-full rounded-full transition-all', status.failed > 0 ? 'bg-amber' : 'bg-emerald')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {!running && status.queued === 0 && status.total > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald">
                  <CheckCircle2 className="size-3.5" /> Run complete.
                </p>
              )}
              {status.results.some((r) => r.status === 'failed') && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-muted">Show failures</summary>
                  <ul className="mt-1.5 space-y-1">
                    {status.results.filter((r) => r.status === 'failed').map((r) => (
                      <li key={r.recipient} className="text-coral">
                        {r.recipient} — {r.error ?? 'unknown error'}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {error && <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>}

          <p className="text-[11px] text-ink-soft">
            Sending runs in batches from this browser tab, pausing between messages to respect your
            provider&apos;s rate limits. Keep the tab open until the run finishes — if you close it,
            whatever is still queued resumes the next time you press Send.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
            >
              Close
            </button>
            {running ? (
              <button
                type="button"
                onClick={() => { abort.current = true }}
                className="inline-flex items-center gap-2 rounded-xl border border-coral/30 px-4 py-2.5 text-sm font-medium text-coral hover:bg-coral/10"
              >
                <Loader2 className="size-4 animate-spin" /> Stop after this batch
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={!recipients.trim() || !fromAccountId}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Send className="size-4" /> Start sending
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
