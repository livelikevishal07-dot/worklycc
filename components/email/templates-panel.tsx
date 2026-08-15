'use client'

import * as React from 'react'
import { FileText, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

import { RichTextEditor } from './rich-text-editor'
import type { Template } from './mail-client'

interface Props { initialTemplates: Template[] }

export function TemplatesPanel({ initialTemplates }: Props) {
  const [items,    setItems]    = React.useState<Template[]>(initialTemplates)
  const [editing,  setEditing]  = React.useState<Template | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  async function refresh() {
    const r = await fetch('/api/email/templates', { cache: 'no-store' })
    if (r.ok) setItems((await r.json()).templates ?? [])
  }

  async function remove(t: Template) {
    if (!window.confirm(`Delete the template “${t.name}”?`)) return
    setDeleting(t.id)
    try {
      await fetch(`/api/email/templates/${t.id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter((x) => x.id !== t.id))
    } finally {
      setDeleting(null)
    }
  }

  const open = creating || editing !== null

  return (
    <div className="space-y-4">
      {!open && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="size-4" /> New template
        </button>
      )}

      {open && (
        <TemplateForm
          template={editing}
          onCancel={() => { setCreating(false); setEditing(null) }}
          onSaved={async () => { setCreating(false); setEditing(null); await refresh() }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">
              <FileText className="size-6 text-ink-soft" />
            </div>
            <p className="text-sm font-medium text-ink-muted">No templates yet.</p>
            <p className="max-w-sm text-center text-xs text-ink-soft">
              Templates appear in the composer as one-click inserts — useful for replies you send often.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((t) => (
              <li key={t.id} className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2/40">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-indigo/10 text-indigo">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{t.name}</p>
                  {t.subject && <p className="mt-0.5 truncate text-xs text-ink-muted">Subject: {t.subject}</p>}
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
                    {t.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || '(empty)'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    title="Edit"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    disabled={deleting === t.id}
                    title="Delete"
                    className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                  >
                    {deleting === t.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
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

function TemplateForm({ template, onCancel, onSaved }: {
  template: Template | null
  onCancel: () => void
  onSaved:  () => void
}) {
  const [name,    setName]    = React.useState(template?.name ?? '')
  const [subject, setSubject] = React.useState(template?.subject ?? '')
  const [html,    setHtml]    = React.useState(template?.body_html ?? '')
  const [saving,  setSaving]  = React.useState(false)
  const [error,   setError]   = React.useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(
        template ? `/api/email/templates/${template.id}` : '/api/email/templates',
        {
          method:  template ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, subject: subject || null, bodyHtml: html }),
        },
      )
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Could not save the template')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the template.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{template ? 'Edit template' : 'New template'}</h3>
        <button type="button" onClick={onCancel} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Name <span className="text-coral">*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Welcome reply" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
            Default subject <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Thanks for reaching out" className={inputClass} />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Body</span>
        <RichTextEditor value={html} onChange={setHtml} minHeight="200px" />
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
          {template ? 'Save changes' : 'Create template'}
        </button>
      </div>
    </form>
  )
}
