'use client'

import * as React from 'react'
import {
  CheckCircle2, Loader2, Mail, Plus, RefreshCw, Trash2, TriangleAlert, X, XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Account } from './mail-client'

interface FullAccount extends Account {
  imap_host:      string
  imap_port:      number
  smtp_host:      string
  smtp_port:      number
  username:       string
  sync_enabled:   boolean
  last_synced_at: string | null
  last_error:     string | null
}

interface ProbeResult { ok: boolean; error?: string }

interface Props {
  initialAccounts: FullAccount[]
  encryptionReady: boolean
}

const DEFAULTS = {
  imapHost: 'imap.hostinger.com',
  imapPort: 993,
  smtpHost: 'smtp.hostinger.com',
  smtpPort: 465,
}

export function MailboxesPanel({ initialAccounts, encryptionReady }: Props) {
  const [accounts, setAccounts] = React.useState<FullAccount[]>(initialAccounts)
  const [showForm, setShowForm] = React.useState(initialAccounts.length === 0)
  const [busy,     setBusy]     = React.useState<string | null>(null)

  async function refresh() {
    const r = await fetch('/api/email/accounts', { cache: 'no-store' })
    if (r.ok) {
      const d = await r.json()
      setAccounts(d.accounts ?? [])
    }
  }

  async function toggle(a: FullAccount, field: 'is_active' | 'sync_enabled') {
    setBusy(a.id)
    try {
      await fetch(`/api/email/accounts/${a.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [field]: !a[field] }),
      })
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  async function remove(a: FullAccount) {
    if (!window.confirm(
      `Remove ${a.address}?\n\nEvery stored message for this mailbox is deleted from Workly. ` +
      `Mail on the server itself is untouched.`,
    )) return
    setBusy(a.id)
    try {
      await fetch(`/api/email/accounts/${a.id}`, { method: 'DELETE' })
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {!encryptionReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-amber">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="text-[13px]">
            <p className="font-semibold">MAIL_ENCRYPTION_KEY is not set</p>
            <p className="mt-0.5 opacity-90">
              Mailbox passwords are encrypted with this key before they touch the database.
              Add a long random string to <code className="rounded bg-surface-2 px-1">.env.local</code> and
              restart the dev server — and set the same value in the Vercel project env before deploying.
            </p>
          </div>
        </div>
      )}

      {/* Existing mailboxes */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">
              <Mail className="size-6 text-ink-soft" />
            </div>
            <p className="text-sm font-medium text-ink-muted">No mailbox connected yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <span className={cn(
                  'mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl',
                  a.is_active ? 'bg-brand/10 text-brand' : 'bg-surface-2 text-ink-soft',
                )}>
                  <Mail className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{a.address}</p>
                    {!a.is_active && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                        Inactive
                      </span>
                    )}
                    {!a.has_password && (
                      <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[10px] font-semibold text-coral">
                        No password
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {a.display_name ? `${a.display_name} · ` : ''}
                    IMAP {a.imap_host}:{a.imap_port} · SMTP {a.smtp_host}:{a.smtp_port}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    {a.last_error
                      ? <span className="text-coral">Last sync failed: {a.last_error}</span>
                      : a.last_synced_at
                        ? `Last synced ${new Date(a.last_synced_at).toLocaleString('en-GB')}`
                        : 'Never synced'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <ToggleChip
                    label="Sync"
                    on={a.sync_enabled}
                    busy={busy === a.id}
                    onClick={() => toggle(a, 'sync_enabled')}
                  />
                  <ToggleChip
                    label="Active"
                    on={a.is_active}
                    busy={busy === a.id}
                    onClick={() => toggle(a, 'is_active')}
                  />
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    disabled={busy === a.id}
                    title="Remove mailbox"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add form */}
      {showForm ? (
        <AddMailboxForm
          disabled={!encryptionReady}
          onCancel={() => setShowForm(false)}
          onAdded={async () => { setShowForm(false); await refresh() }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="size-4" /> Add mailbox
        </button>
      )}
    </div>
  )
}

function ToggleChip({ label, on, busy, onClick }: {
  label: string; on: boolean; busy: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40',
        on
          ? 'border-emerald/30 bg-emerald/10 text-emerald'
          : 'border-border text-ink-muted hover:bg-surface-2',
      )}
    >
      {label} {on ? 'on' : 'off'}
    </button>
  )
}

/* ── Add form ─────────────────────────────────────────────────────────────── */

function AddMailboxForm({ disabled, onCancel, onAdded }: {
  disabled: boolean
  onCancel: () => void
  onAdded:  () => void
}) {
  const [address,     setAddress]     = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [username,    setUsername]    = React.useState('')
  const [password,    setPassword]    = React.useState('')
  const [imapHost,    setImapHost]    = React.useState(DEFAULTS.imapHost)
  const [imapPort,    setImapPort]    = React.useState(String(DEFAULTS.imapPort))
  const [smtpHost,    setSmtpHost]    = React.useState(DEFAULTS.smtpHost)
  const [smtpPort,    setSmtpPort]    = React.useState(String(DEFAULTS.smtpPort))

  const [testing, setTesting] = React.useState(false)
  const [saving,  setSaving]  = React.useState(false)
  const [probe,   setProbe]   = React.useState<{ imap: ProbeResult; smtp: ProbeResult } | null>(null)
  const [error,   setError]   = React.useState<string | null>(null)

  function payload() {
    return {
      address:  address.trim().toLowerCase(),
      displayName: displayName.trim() || undefined,
      username: username.trim() || undefined,
      password,
      imapHost, imapPort: Number(imapPort),
      smtpHost, smtpPort: Number(smtpPort),
    }
  }

  async function runTest() {
    setTesting(true)
    setError(null)
    setProbe(null)
    try {
      const r = await fetch('/api/email/accounts/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload()),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Connection test failed')
      setProbe({ imap: d.imap, smtp: d.smtp })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection test failed.')
    } finally {
      setTesting(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/email/accounts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload()),
      })
      const d = await r.json()
      if (!r.ok) {
        if (d.details?.imap || d.details?.smtp) setProbe({ imap: d.details.imap, smtp: d.details.smtp })
        throw new Error(d.error ?? 'Could not add the mailbox')
      }
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the mailbox.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add a mailbox</h3>
        <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Email address <span className="text-coral">*</span>
          </span>
          <input
            type="email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="admin@workly.cc"
            required
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Display name <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Workly Admin"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Username <span className="font-normal text-ink-soft">(defaults to the address)</span>
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin@workly.cc"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Mailbox password <span className="text-coral">*</span>
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-[1fr_88px] gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">IMAP host</span>
            <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Port</span>
            <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" className={inputClass} />
          </label>
        </div>

        <div className="grid grid-cols-[1fr_88px] gap-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">SMTP host</span>
            <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Port</span>
            <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" className={inputClass} />
          </label>
        </div>
      </div>

      <p className="text-[11px] text-ink-soft">
        The password is encrypted with MAIL_ENCRYPTION_KEY before it is stored, and is never sent back to the browser.
        It is saved only after the IMAP and SMTP logins both succeed.
      </p>

      {probe && (
        <div className="flex flex-wrap gap-2">
          <ProbeChip label="IMAP" result={probe.imap} />
          <ProbeChip label="SMTP" result={probe.smtp} />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runTest}
          disabled={testing || !address || !password || disabled}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Test connection
        </button>
        <button
          type="submit"
          disabled={saving || !address || !password || disabled}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Test &amp; save mailbox
        </button>
      </div>
    </form>
  )
}

function ProbeChip({ label, result }: { label: string; result: ProbeResult }) {
  return (
    <span className={cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium',
      result.ok ? 'bg-emerald/10 text-emerald' : 'bg-coral/10 text-coral',
    )}>
      {result.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <XCircle className="size-3.5 shrink-0" />}
      {label}: <span className="truncate font-normal">{result.ok ? 'connected' : result.error}</span>
    </span>
  )
}
