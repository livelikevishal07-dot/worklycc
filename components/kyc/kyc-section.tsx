'use client'

import * as React from 'react'
import {
  BadgeCheck, Copy, Eye, FileText, Image as ImageIcon, Link2, Loader2, Mail,
  Plus, Search, Trash2, UserPlus, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Company, Department, Role } from '@/lib/db/types'

type KycStatus = 'invited' | 'submitted' | 'approved' | 'rejected'

export interface KycRow {
  id:            string
  token:         string
  status:        KycStatus
  invited_name:  string | null
  invited_email: string | null
  sent_at:       string | null
  full_name:     string | null
  email:         string | null
  phone:         string | null
  alt_phone:     string | null
  date_of_birth: string | null
  address:       string | null
  city:          string | null
  state:         string | null
  pincode:       string | null
  emergency_name:     string | null
  emergency_phone:    string | null
  emergency_relation: string | null
  designation:   string | null
  aadhaar_last4: string | null
  photo_path:    string | null
  aadhaar_path:  string | null
  letter_path:   string | null
  letter_kind:   'offer' | 'release' | null
  submitted_at:  string | null
  employee_id:   string | null
  created_at:    string
  company?:      { id: string; name: string } | null
}

const STATUS_META: Record<KycStatus, { label: string; chip: string }> = {
  invited:   { label: 'Invited',   chip: 'bg-surface-2 text-ink-muted' },
  submitted: { label: 'Submitted', chip: 'bg-amber/15 text-amber' },
  approved:  { label: 'Added',     chip: 'bg-emerald/10 text-emerald' },
  rejected:  { label: 'Rejected',  chip: 'bg-coral/10 text-coral' },
}

const FILTERS: (KycStatus | 'all')[] = ['all', 'submitted', 'invited', 'approved', 'rejected']

interface Props {
  initialRows: KycRow[]
  companies:   Company[]
  roles:       Role[]
  departments: Department[]
}

export function KycSection({ initialRows, companies, roles, departments }: Props) {
  const [rows,    setRows]    = React.useState(initialRows)
  const [filter,  setFilter]  = React.useState<KycStatus | 'all'>('all')
  const [search,  setSearch]  = React.useState('')
  const [invite,  setInvite]  = React.useState(false)
  const [review,  setReview]  = React.useState<KycRow | null>(null)
  const [error,   setError]   = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    const r = await fetch('/api/kyc', { cache: 'no-store' })
    if (r.ok) setRows((await r.json()).submissions ?? [])
  }, [])

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return [r.full_name, r.invited_name, r.email, r.invited_email, r.phone]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [rows, filter, search])

  const pending = rows.filter((r) => r.status === 'submitted').length

  async function remove(row: KycRow) {
    if (!window.confirm(
      `Delete this KYC submission?\n\n${row.full_name ?? row.invited_email ?? 'Unnamed'}\n\n` +
      `The uploaded photo, Aadhaar and letter are permanently deleted. This cannot be undone.`,
    )) return
    setError(null)
    try {
      const r = await fetch(`/api/kyc/${row.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setRows((prev) => prev.filter((x) => x.id !== row.id))
    } catch {
      setError('Could not delete that submission.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or phone…"
              className="h-10 w-full rounded-xl border border-transparent bg-surface-2 pl-9 pr-4 text-sm placeholder:text-ink-soft focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setInvite(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="size-4" /> Send KYC form
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border text-ink-muted hover:bg-surface-2',
              )}
            >
              {f === 'all' ? 'All' : STATUS_META[f].label}
              {f === 'submitted' && pending > 0 && (
                <span className="ml-1.5 rounded-full bg-amber px-1.5 text-[10px] font-bold text-[#3b2a00]">{pending}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">
              <BadgeCheck className="size-6 text-ink-soft" />
            </div>
            <p className="text-sm font-medium text-ink-muted">
              {rows.length === 0 ? 'No KYC forms yet.' : 'Nothing matches this filter.'}
            </p>
            {rows.length === 0 && (
              <button
                type="button"
                onClick={() => setInvite(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
              >
                <Plus className="size-4" /> Send your first KYC form
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const meta = STATUS_META[row.status]
              const name = row.full_name ?? row.invited_name ?? 'Awaiting response'
              return (
                <li key={row.id} className="group flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/40">
                  {row.photo_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/kyc/${row.id}/file/photo`}
                      alt=""
                      className="size-11 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-soft">
                      <ImageIcon className="size-5" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{name}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.chip)}>
                        {meta.label}
                      </span>
                      {row.company && (
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                          {row.company.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {row.email ?? row.invited_email ?? '—'}
                      {row.phone ? ` · ${row.phone}` : ''}
                      {row.aadhaar_last4 ? ` · Aadhaar ••••${row.aadhaar_last4}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-soft">
                      {row.submitted_at
                        ? `Submitted ${new Date(row.submitted_at).toLocaleString('en-GB')}`
                        : row.sent_at
                          ? `Invite sent ${new Date(row.sent_at).toLocaleDateString('en-GB')}`
                          : `Created ${new Date(row.created_at).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {row.status === 'invited' && (
                      <CopyLinkButton token={row.token} />
                    )}
                    {row.status !== 'invited' && (
                      <button
                        type="button"
                        onClick={() => setReview(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-brand"
                      >
                        <Eye className="size-3.5" /> Review
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      title="Delete submission and documents"
                      className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-coral/10 hover:text-coral"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {invite && (
        <InviteDialog
          companies={companies}
          onClose={() => setInvite(false)}
          onCreated={async () => { await refresh() }}
        />
      )}

      {review && (
        <ReviewDrawer
          row={review}
          companies={companies}
          roles={roles}
          departments={departments}
          onClose={() => setReview(null)}
          onChanged={async () => { await refresh(); setReview(null) }}
        />
      )}
    </div>
  )
}

/* ── Copy link ────────────────────────────────────────────────────────────── */

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/kyc/${token}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-brand"
    >
      {copied ? <BadgeCheck className="size-3.5 text-emerald" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

/* ── Invite ───────────────────────────────────────────────────────────────── */

function InviteDialog({ companies, onClose, onCreated }: {
  companies: Company[]
  onClose:   () => void
  onCreated: () => Promise<void>
}) {
  const [name,      setName]      = React.useState('')
  const [email,     setEmail]     = React.useState('')
  const [companyId, setCompanyId] = React.useState('')
  const [sendEmail, setSendEmail] = React.useState(true)
  const [busy,      setBusy]      = React.useState(false)
  const [result,    setResult]    = React.useState<{ url: string; emailed: boolean; warning?: string } | null>(null)
  const [error,     setError]     = React.useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/kyc', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:      name.trim() || undefined,
          email:     email.trim() || undefined,
          companyId: companyId || undefined,
          sendEmail: sendEmail && Boolean(email.trim()),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Could not create the invite')
      setResult({ url: d.url, emailed: d.emailed, warning: d.warning })
      await onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the invite.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-base font-semibold">Send KYC form</h3>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
              <X className="size-4" />
            </button>
          </div>

          {result ? (
            <div className="space-y-4 p-5">
              <div className={cn(
                'rounded-xl border px-4 py-3 text-sm',
                result.emailed ? 'border-emerald/20 bg-emerald/5 text-emerald' : 'border-amber/30 bg-amber/5 text-amber',
              )}>
                {result.emailed
                  ? 'The form link has been emailed.'
                  : result.warning ?? 'Link created. Share it manually.'}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink-muted">Form link</p>
                <div className="flex gap-2">
                  <input readOnly value={result.url} className={cn(inputClass, 'font-mono text-[11px]')} />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(result.url)}
                    className="shrink-0 rounded-xl border border-border px-3 text-xs font-medium text-ink-muted hover:bg-surface-2"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">
                  Anyone with this link can fill the form once. It expires in 30 days.
                </p>
              </div>

              <button type="button" onClick={onClose} className="w-full rounded-xl bg-brand py-2.5 text-sm font-medium text-brand-foreground hover:opacity-90">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={create} className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Their name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Their email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" className={inputClass} />
                <span className="mt-1 block text-[11px] text-ink-soft">
                  Leave blank to just generate a link you can share yourself.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Joining which company</span>
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
                  <option value="">Decide later</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              {email.trim() && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="size-4 accent-[hsl(var(--brand))]" />
                  <Mail className="size-3.5 text-ink-soft" />
                  Email the link to them now
                </label>
              )}

              {error && <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>}

              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                  Create link
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Review + promote ─────────────────────────────────────────────────────── */

function ReviewDrawer({ row, companies, roles, departments, onClose, onChanged }: {
  row:         KycRow
  companies:   Company[]
  roles:       Role[]
  departments: Department[]
  onClose:     () => void
  onChanged:   () => Promise<void>
}) {
  const [roleId,       setRoleId]       = React.useState('')
  const [departmentId, setDepartmentId] = React.useState('')
  const [companyId,    setCompanyId]    = React.useState(row.company?.id ?? '')
  const [joiningDate,  setJoiningDate]  = React.useState('')
  const [salary,       setSalary]       = React.useState('')
  const [username,     setUsername]     = React.useState('')
  const [password,     setPassword]     = React.useState('')

  const [busy,    setBusy]    = React.useState<'approve' | 'reject' | null>(null)
  const [error,   setError]   = React.useState<string | null>(null)
  const [aadhaar, setAadhaar] = React.useState<string | null>(null)

  const alreadyAdded = row.status === 'approved' && Boolean(row.employee_id)

  async function reveal() {
    setError(null)
    try {
      const r = await fetch(`/api/kyc/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revealAadhaar: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Could not reveal')
      setAadhaar(d.aadhaar ?? 'Not provided')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reveal the number.')
    }
  }

  async function approve() {
    setBusy('approve')
    setError(null)
    try {
      const r = await fetch(`/api/kyc/${row.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id:        roleId || null,
          department_id:  departmentId || null,
          company_id:     companyId || null,
          joining_date:   joiningDate || null,
          monthly_salary: salary.trim() ? Number(salary) : null,
          username:       username.trim() || undefined,
          password:       password.trim() || undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Could not add the employee')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the employee.')
    } finally {
      setBusy(null)
    }
  }

  async function reject() {
    if (!window.confirm('Mark this submission as rejected? The documents are kept.')) return
    setBusy('reject')
    try {
      await fetch(`/api/kyc/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{row.full_name ?? 'KYC submission'}</h2>
            <p className="text-xs text-ink-soft">
              {row.submitted_at ? `Submitted ${new Date(row.submitted_at).toLocaleString('en-GB')}` : 'Not yet submitted'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {alreadyAdded && (
            <div className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3 text-sm text-emerald">
              This person is already in the employee list.
            </div>
          )}

          {/* Their answers */}
          <section className="rounded-2xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Submitted details</h3>
            <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
              <Detail label="Full name" value={row.full_name} />
              <Detail label="Email" value={row.email} />
              <Detail label="Phone" value={row.phone} />
              <Detail label="Alternate phone" value={row.alt_phone} />
              <Detail label="Date of birth" value={row.date_of_birth} />
              <Detail label="Position" value={row.designation} />
              <Detail
                label="Address"
                value={[row.address, row.city, row.state, row.pincode].filter(Boolean).join(', ') || null}
                wide
              />
              <Detail
                label="Emergency contact"
                value={row.emergency_name
                  ? `${row.emergency_name}${row.emergency_relation ? ` (${row.emergency_relation})` : ''}${row.emergency_phone ? ` · ${row.emergency_phone}` : ''}`
                  : null}
                wide
              />
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Aadhaar</dt>
                <dd className="flex items-center gap-2 text-ink">
                  {aadhaar ?? (row.aadhaar_last4 ? `•••• •••• ${row.aadhaar_last4}` : '—')}
                  {row.aadhaar_last4 && !aadhaar && (
                    <button type="button" onClick={reveal} className="text-[11px] font-medium text-brand hover:underline">
                      Reveal
                    </button>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Documents */}
          <section className="rounded-2xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">Documents</h3>
            <div className="flex flex-wrap gap-2">
              <DocLink id={row.id} kind="photo"   label="Passport photo" present={Boolean(row.photo_path)} />
              <DocLink id={row.id} kind="aadhaar" label="Aadhaar card"   present={Boolean(row.aadhaar_path)} />
              <DocLink
                id={row.id} kind="letter" present={Boolean(row.letter_path)}
                label={row.letter_kind === 'release' ? 'Relieving letter' : 'Offer letter'}
              />
            </div>
          </section>

          {/* Employment terms */}
          {!alreadyAdded && (
            <section className="rounded-2xl border border-border p-4">
              <h3 className="mb-1 text-sm font-semibold">Add to employee list</h3>
              <p className="mb-3 text-[11px] text-ink-soft">
                Their personal details carry over automatically. These are yours to set.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Company</span>
                  <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Role</span>
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Department</span>
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass}>
                    <option value="">None</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Joining date</span>
                  <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Monthly salary (₹)</span>
                  <input value={salary} onChange={(e) => setSalary(e.target.value)} inputMode="numeric" className={inputClass} />
                </label>
                <div />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Login username</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="priya.sharma" className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Login password</span>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank for no login yet" className={inputClass} />
                </label>
              </div>
            </section>
          )}

          {error && <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>}
        </div>

        {!alreadyAdded && (
          <div className="flex items-center gap-2 border-t border-border p-4">
            <button
              type="button"
              onClick={reject}
              disabled={busy !== null}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'approve' ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Add to employee list
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function Detail({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-ink">{value || '—'}</dd>
    </div>
  )
}

function DocLink({ id, kind, label, present }: {
  id: string; kind: 'photo' | 'aadhaar' | 'letter'; label: string; present: boolean
}) {
  if (!present) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] text-ink-soft">
        <FileText className="size-3.5" /> {label} — not uploaded
      </span>
    )
  }
  return (
    <a
      href={`/api/kyc/${id}/file/${kind}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-surface-2 hover:text-brand"
    >
      <FileText className="size-3.5 text-brand" /> {label}
    </a>
  )
}
