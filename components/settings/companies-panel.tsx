'use client'

import * as React from 'react'
import { Building2, FileSignature, Pencil, Plus, Trash2, X } from 'lucide-react'

import { COLOR_OPTIONS, COLOR_TONE, type AccentColor as DepartmentColor } from '@/lib/colors'
import type { Company } from '@/lib/db/types'
import { cn } from '@/lib/utils'

type Draft = {
  name: string
  industry: string
  description: string
  color: DepartmentColor
  // Letterhead — appears on offer and relieving letters issued for this company.
  address: string
  email: string
  phone: string
  website: string
  signatoryName: string
  signatoryDesignation: string
}

const emptyDraft: Draft = {
  name: '',
  industry: '',
  description: '',
  color: 'violet',
  address: '',
  email: '',
  phone: '',
  website: '',
  signatoryName: '',
  signatoryDesignation: '',
}

export function CompaniesPanel() {
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [draft, setDraft] = React.useState<Draft>(emptyDraft)
  const [editing, setEditing] = React.useState<Company | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCompanies(await request<Company[]>('/api/companies'))
    } catch (err) {
      setError(messageFrom(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setFormOpen(true)
  }

  function openEdit(company: Company) {
    setEditing(company)
    setDraft({
      name: company.name,
      industry: company.industry ?? '',
      description: company.description ?? '',
      color: colorOrDefault(company.color),
      address: company.address ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
      website: company.website ?? '',
      signatoryName: company.signatory_name ?? '',
      signatoryDesignation: company.signatory_designation ?? '',
    })
    setFormOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: draft.name.trim(),
        industry: draft.industry.trim() || null,
        description: draft.description.trim() || null,
        color: draft.color,
        address: draft.address.trim() || null,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        website: draft.website.trim() || null,
        signatory_name: draft.signatoryName.trim() || null,
        signatory_designation: draft.signatoryDesignation.trim() || null,
      }
      const saved = editing
        ? await request<Company>(`/api/companies/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await request<Company>('/api/companies', {
            method: 'POST',
            body: JSON.stringify(payload),
          })

      setCompanies((prev) =>
        editing
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
      )
      setFormOpen(false)
      setEditing(null)
      setDraft(emptyDraft)
    } catch (err) {
      setError(messageFrom(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(company: Company) {
    if (!window.confirm(`Delete ${company.name}? Existing tasks will keep running without this company.`)) {
      return
    }
    setError(null)
    try {
      await request(`/api/companies/${company.id}`, { method: 'DELETE' })
      setCompanies((prev) => prev.filter((item) => item.id !== company.id))
      if (editing?.id === company.id) {
        setEditing(null)
        setFormOpen(false)
      }
    } catch (err) {
      setError(messageFrom(err))
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Companies</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Add and manage the businesses that tasks can be assigned to.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (formOpen ? setFormOpen(false) : openCreate())}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
        >
          {formOpen ? <X className="size-4" /> : <Plus className="size-4" />}
          {formOpen ? 'Cancel' : 'Add company'}
        </button>
      </header>

      {error && <Notice tone="danger">{error}</Notice>}

      {formOpen && (
        <form
          onSubmit={save}
          className="mb-5 rounded-xl border border-border bg-surface-2/50 p-5"
        >
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="size-4 text-ink-soft" />
            <h3 className="text-sm font-semibold">
              {editing ? 'Edit company' : 'New company'}
            </h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Wedlift"
              />
            </Field>
            <Field label="Industry">
              <Input
                value={draft.industry}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, industry: e.target.value }))
                }
                placeholder="e.g. Event management"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                rows={2}
                placeholder="What does this company do?"
                className="w-full rounded-lg border border-border bg-surface p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </Field>
            <ColorField
              value={draft.color}
              onChange={(color) => setDraft((d) => ({ ...d, color }))}
            />
          </div>

          {/* ── Letterhead ── */}
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2">
              <FileSignature className="size-4 text-ink-soft" />
              <h4 className="text-sm font-semibold">Letterhead</h4>
              <span className="text-[11px] text-ink-soft">
                Printed on offer &amp; relieving letters issued for this company
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Registered address" className="sm:col-span-2">
                <textarea
                  value={draft.address}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                  rows={2}
                  placeholder={'123 MG Road, Indiranagar\nBengaluru, Karnataka 560038'}
                  className="w-full rounded-lg border border-border bg-surface p-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </Field>
              <Field label="Contact email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder="hr@company.com"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </Field>
              <Field label="Website">
                <Input
                  value={draft.website}
                  onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                  placeholder="www.company.com"
                />
              </Field>
              <Field label="Signatory name">
                <Input
                  value={draft.signatoryName}
                  onChange={(e) => setDraft((d) => ({ ...d, signatoryName: e.target.value }))}
                  placeholder="Leave blank for “Authorised Signatory”"
                />
              </Field>
              <Field label="Signatory designation" className="sm:col-span-2">
                <Input
                  value={draft.signatoryDesignation}
                  onChange={(e) => setDraft((d) => ({ ...d, signatoryDesignation: e.target.value }))}
                  placeholder="e.g. Director / HR Manager"
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-ink-muted hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="size-4" />
              {saving ? 'Saving...' : editing ? 'Save company' : 'Add company'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <Notice>Loading companies...</Notice>
      ) : companies.length === 0 ? (
        <Notice>No companies yet.</Notice>
      ) : (
        <ul className="space-y-3">
          {companies.map((company) => (
            <CompanyRow
              key={company.id}
              company={company}
              onEdit={() => openEdit(company)}
              onDelete={() => void remove(company)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function CompanyRow({
  company,
  onEdit,
  onDelete,
}: {
  company: Company
  onEdit: () => void
  onDelete: () => void
}) {
  const tone = COLOR_TONE[colorOrDefault(company.color)]
  return (
    <li className="group flex items-center gap-4 rounded-xl border border-border bg-surface-2/40 p-4">
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-xl font-bold text-white',
          tone.bg
        )}
      >
        {company.name[0]?.toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{company.name}</h3>
          {company.industry && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                tone.chip
              )}
            >
              {company.industry}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {company.description || 'No description'}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Slug: {company.slug} - Added {formatDate(company.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn label="Edit" onClick={onEdit}>
          <Pencil className="size-4" />
        </IconBtn>
        <IconBtn label="Delete" tone="danger" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconBtn>
      </div>
    </li>
  )
}

function ColorField({
  value,
  onChange,
}: {
  value: DepartmentColor
  onChange: (value: DepartmentColor) => void
}) {
  return (
    <Field label="Color" className="sm:col-span-2">
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map((color) => {
          const tone = COLOR_TONE[color]
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={cn(
                'size-9 rounded-lg ring-2 transition',
                tone.bg,
                value === color ? 'ring-ink' : 'ring-transparent hover:ring-border'
              )}
              aria-label={color}
            />
          )
        })}
      </div>
    </Field>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
    />
  )
}

function IconBtn({
  children,
  label,
  tone,
  onClick,
}: {
  children: React.ReactNode
  label: string
  tone?: 'danger'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink',
        tone === 'danger' && 'hover:bg-coral/10 hover:text-coral'
      )}
    >
      {children}
    </button>
  )
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: 'danger'
}) {
  return (
    <div
      className={cn(
        'mb-4 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm text-ink-muted',
        tone === 'danger' && 'border-coral/30 bg-coral/10 text-coral'
      )}
    >
      {children}
    </div>
  )
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error ?? 'Request failed')
  }
  return data as T
}

function messageFrom(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function colorOrDefault(value: string): DepartmentColor {
  return COLOR_OPTIONS.includes(value as DepartmentColor)
    ? (value as DepartmentColor)
    : 'violet'
}
