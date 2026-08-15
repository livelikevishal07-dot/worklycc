'use client'

import * as React from 'react'
import {
  ClipboardPaste, Loader2, Pencil, Plus, Search, Trash2, Users, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export interface Contact {
  id:       string
  name:     string | null
  email:    string
  category: string
  notes:    string | null
}

interface Props {
  initialContacts:   Contact[]
  initialCategories: { category: string; count: number }[]
}

export function ContactsPanel({ initialContacts, initialCategories }: Props) {
  const [contacts,   setContacts]   = React.useState(initialContacts)
  const [categories, setCategories] = React.useState(initialCategories)
  const [category,   setCategory]   = React.useState('')
  const [search,     setSearch]     = React.useState('')
  const [mode,       setMode]       = React.useState<'none' | 'single' | 'bulk'>('none')
  const [editing,    setEditing]    = React.useState<Contact | null>(null)
  const [deleting,   setDeleting]   = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    const [c, cats] = await Promise.all([
      fetch(`/api/email/contacts${category ? `?category=${encodeURIComponent(category)}` : ''}`, { cache: 'no-store' }),
      fetch('/api/email/contacts/categories', { cache: 'no-store' }),
    ])
    if (c.ok)    setContacts((await c.json()).contacts ?? [])
    if (cats.ok) setCategories((await cats.json()).categories ?? [])
  }, [category])

  React.useEffect(() => { refresh() }, [refresh])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) => c.email.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q),
    )
  }, [contacts, search])

  async function remove(c: Contact) {
    if (!window.confirm(`Remove ${c.email} from ${c.category}?`)) return
    setDeleting(c.id)
    try {
      await fetch(`/api/email/contacts/${c.id}`, { method: 'DELETE' })
      setContacts((prev) => prev.filter((x) => x.id !== c.id))
      await refresh()
    } finally {
      setDeleting(null)
    }
  }

  const total = categories.reduce((n, c) => n + c.count, 0)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="h-10 w-full rounded-xl border border-transparent bg-surface-2 pl-9 pr-4 text-sm placeholder:text-ink-soft focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <button
            type="button"
            onClick={() => { setMode('bulk'); setEditing(null) }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-ink-muted hover:bg-surface-2"
          >
            <ClipboardPaste className="size-4" /> Bulk add
          </button>
          <button
            type="button"
            onClick={() => { setMode('single'); setEditing(null) }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="size-4" /> Add contact
          </button>
        </div>

        {/* Category chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory('')}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              category === '' ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border text-ink-muted hover:bg-surface-2',
            )}
          >
            All ({total})
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => setCategory(category === c.category ? '' : c.category)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                category === c.category ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border text-ink-muted hover:bg-surface-2',
              )}
            >
              {c.category} ({c.count})
            </button>
          ))}
        </div>
      </div>

      {(mode !== 'none' || editing) && (
        <ContactForm
          mode={mode === 'bulk' && !editing ? 'bulk' : 'single'}
          contact={editing}
          categories={categories.map((c) => c.category)}
          defaultCategory={category || 'General'}
          onCancel={() => { setMode('none'); setEditing(null) }}
          onSaved={async () => { setMode('none'); setEditing(null); await refresh() }}
        />
      )}

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">
              <Users className="size-6 text-ink-soft" />
            </div>
            <p className="text-sm font-medium text-ink-muted">
              {search ? 'No contacts match that search.' : 'No contacts yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => (
              <li key={c.id} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-[12px] font-bold text-brand">
                  {(c.name || c.email).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.name || c.email}</p>
                  {c.name && <p className="truncate text-xs text-ink-muted">{c.email}</p>}
                  {c.notes && <p className="truncate text-[11px] text-ink-soft">{c.notes}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                  {c.category}
                </span>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => { setEditing(c); setMode('none') }}
                    title="Edit"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    disabled={deleting === c.id}
                    title="Remove"
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

function ContactForm({ mode, contact, categories, defaultCategory, onCancel, onSaved }: {
  mode:     'single' | 'bulk'
  contact:  Contact | null
  categories: string[]
  defaultCategory: string
  onCancel: () => void
  onSaved:  () => void
}) {
  const [name,     setName]     = React.useState(contact?.name ?? '')
  const [email,    setEmail]    = React.useState(contact?.email ?? '')
  const [category, setCategory] = React.useState(contact?.category ?? defaultCategory)
  const [notes,    setNotes]    = React.useState(contact?.notes ?? '')
  const [bulk,     setBulk]     = React.useState('')
  const [saving,   setSaving]   = React.useState(false)
  const [error,    setError]    = React.useState<string | null>(null)
  const [result,   setResult]   = React.useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const url    = contact ? `/api/email/contacts/${contact.id}` : '/api/email/contacts'
      const method = contact ? 'PATCH' : 'POST'
      const body   = mode === 'bulk'
        ? { bulk, category }
        : { name: name || null, email, category, notes: notes || null }

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Could not save')

      if (mode === 'bulk') {
        setResult(`Added ${d.added} of ${d.found} addresses to ${category}.`)
        setBulk('')
        // Keep the form open so the count is visible, but refresh the list behind it.
        onSaved()
        return
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {contact ? 'Edit contact' : mode === 'bulk' ? 'Bulk add contacts' : 'Add contact'}
        </h3>
        <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>

      {mode === 'bulk' ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Paste addresses <span className="font-normal text-ink-soft">(one per line, or comma separated)</span>
          </span>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={7}
            placeholder={'Asha Rao <asha@example.com>\nvikram@example.com\nteam@example.com'}
            className="w-full resize-y rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 font-mono text-xs leading-relaxed outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
          />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Rao" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
              Email <span className="text-coral">*</span>
            </span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="asha@example.com" className={inputClass} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Met at the Bangalore expo" className={inputClass} />
          </label>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Category</span>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="contact-categories"
          placeholder="General"
          className={inputClass}
        />
        <datalist id="contact-categories">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </label>

      {result && <div className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3 text-sm text-emerald">{result}</div>}
      {error  && <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || (mode === 'bulk' ? !bulk.trim() : !email.trim())}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {contact ? 'Save changes' : mode === 'bulk' ? 'Add all' : 'Add contact'}
        </button>
      </div>
    </form>
  )
}
