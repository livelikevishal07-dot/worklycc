'use client'

import * as React from 'react'
import { BadgeCheck, Copy, Link2, Loader2, Plus, Power, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Company } from '@/lib/db/types'

interface PublicLink {
  id:         string
  token:      string
  label:      string | null
  company_id: string | null
  is_active:  boolean
  uses:       number
}

/**
 * Reusable KYC links. One link can go to a whole team — each person who opens it
 * gets their own private submission, so nobody sees anyone else's answers.
 */
export function GeneralLinkCard({ companies }: { companies: Company[] }) {
  const [links,   setLinks]   = React.useState<PublicLink[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy,    setBusy]    = React.useState<string | null>(null)
  const [error,   setError]   = React.useState<string | null>(null)
  const [label,   setLabel]   = React.useState('')
  const [company, setCompany] = React.useState('')
  const [copied,  setCopied]  = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/kyc/links', { cache: 'no-store' })
      if (r.ok) setLinks((await r.json()).links ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  async function create() {
    setBusy('new')
    setError(null)
    try {
      const r = await fetch('/api/kyc/links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || undefined, companyId: company || undefined }),
      })
      if (!r.ok) throw new Error('Could not create the link')
      setLabel(''); setCompany('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the link.')
    } finally {
      setBusy(null)
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    try {
      await fetch('/api/kyc/links', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  function urlFor(token: string) {
    return `${window.location.origin}/kyc/start/${token}`
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(urlFor(token))
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-1 flex items-center gap-2">
        <Link2 className="size-4 text-ink-soft" />
        <h2 className="text-sm font-semibold">General KYC link</h2>
      </header>
      <p className="mb-4 text-xs text-ink-muted">
        Share one link with everyone — in a WhatsApp group, an email, anywhere. Each
        person who opens it fills their own private form.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-coral/20 bg-coral/5 px-4 py-2.5 text-sm text-coral">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Loading links…
        </div>
      ) : (
        <>
          {links.length > 0 && (
            <ul className="mb-4 space-y-2">
              {links.map((l) => (
                <li key={l.id} className={cn(
                  'flex flex-wrap items-center gap-2 rounded-xl border p-3',
                  l.is_active ? 'border-border bg-surface-2/30' : 'border-border bg-surface-2/10 opacity-70',
                )}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold">{l.label || 'Shared link'}</p>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        l.is_active ? 'bg-emerald/10 text-emerald' : 'bg-surface-2 text-ink-muted',
                      )}>
                        {l.is_active ? 'Active' : 'Off'}
                      </span>
                      <span className="text-[11px] text-ink-soft">
                        {l.uses} {l.uses === 1 ? 'open' : 'opens'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink-soft">
                      /kyc/start/{l.token}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => copy(l.token)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface hover:text-brand"
                  >
                    {copied === l.token
                      ? <><BadgeCheck className="size-3.5 text-emerald" /> Copied</>
                      : <><Copy className="size-3.5" /> Copy</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(l.id, { is_active: !l.is_active })}
                    disabled={busy === l.id}
                    title={l.is_active ? 'Switch off' : 'Switch on'}
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40"
                  >
                    <Power className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this shared link? Forms already submitted through it are kept.')) {
                        patch(l.id, { remove: true })
                      }
                    }}
                    disabled={busy === l.id}
                    title="Delete link"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[160px] flex-1">
              <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Label</span>
              <input
                value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. All staff re-KYC 2026" className={inputClass}
              />
            </label>
            <label className="min-w-[150px]">
              <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Company</span>
              <select value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass}>
                <option value="">Any</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={create}
              disabled={busy === 'new'}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
            >
              {busy === 'new' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create link
            </button>
          </div>
        </>
      )}
    </section>
  )
}
