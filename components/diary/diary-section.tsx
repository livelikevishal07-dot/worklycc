'use client'

import * as React from 'react'
import {
  Briefcase, CalendarDays, CalendarSearch, Flame, Lightbulb, Loader2,
  NotebookPen, Pencil, Plus, Search, SlidersHorizontal, Tag, Trash2,
  TriangleAlert, User, Users, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { DiaryCategory, DiaryEntry, DiaryStats } from '@/lib/db/diary'

// ── Meta ──────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<DiaryCategory, {
  label: string
  icon:  React.ElementType
  chip:  string
  bg:    string
  text:  string
}> = {
  work:     { label: 'Work',     icon: Briefcase,      chip: 'bg-brand/10 text-brand',     bg: 'bg-brand/10',   text: 'text-brand' },
  meeting:  { label: 'Meeting',  icon: Users,          chip: 'bg-indigo/10 text-indigo',   bg: 'bg-indigo/10',  text: 'text-indigo' },
  idea:     { label: 'Idea',     icon: Lightbulb,      chip: 'bg-amber/15 text-amber',     bg: 'bg-amber/15',   text: 'text-amber' },
  personal: { label: 'Personal', icon: User,           chip: 'bg-emerald/10 text-emerald', bg: 'bg-emerald/10', text: 'text-emerald' },
  issue:    { label: 'Issue',    icon: TriangleAlert,  chip: 'bg-coral/10 text-coral',     bg: 'bg-coral/10',   text: 'text-coral' },
}

const CATEGORY_OPTIONS: DiaryCategory[] = ['work', 'meeting', 'idea', 'personal', 'issue']

const PAGE_SIZE = 50

// ── Date helpers ──────────────────────────────────────────────────────────────
// Entry dates are plain YYYY-MM-DD strings, so everything here stays in the
// browser's local calendar — never `toISOString()`, which shifts by timezone.

function toDayString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function today(): string {
  return toDayString(new Date())
}

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return toDayString(d)
}

function monthStart(): string {
  const d = new Date()
  return toDayString(new Date(d.getFullYear(), d.getMonth(), 1))
}

function formatLongDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatShortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** "Today" / "Yesterday" / weekday name for the last week, else null. */
function relativeDayLabel(day: string): string | null {
  const t = today()
  if (day === t)                return 'Today'
  if (day === shiftDays(t, -1)) return 'Yesterday'
  const diff = Math.round(
    (new Date(`${t}T00:00:00`).getTime() - new Date(`${day}T00:00:00`).getTime()) / 86_400_000,
  )
  if (diff > 1 && diff < 7) {
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
  }
  return null
}

// ── Filter model ──────────────────────────────────────────────────────────────

type DateFilter =
  | { kind: 'all' }
  | { kind: 'day';   day: string }
  | { kind: 'range'; from: string; to: string }

interface Preset {
  key:   string
  label: string
  build: () => DateFilter
}

const PRESETS: Preset[] = [
  { key: 'all',       label: 'All time',    build: () => ({ kind: 'all' }) },
  { key: 'today',     label: 'Today',       build: () => ({ kind: 'day', day: today() }) },
  { key: 'yesterday', label: 'Yesterday',   build: () => ({ kind: 'day', day: shiftDays(today(), -1) }) },
  { key: '7d',        label: 'Last 7 days', build: () => ({ kind: 'range', from: shiftDays(today(), -6), to: today() }) },
  { key: 'month',     label: 'This month',  build: () => ({ kind: 'range', from: monthStart(), to: today() }) },
]

function sameFilter(a: DateFilter, b: DateFilter): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'day'   && b.kind === 'day')   return a.day === b.day
  if (a.kind === 'range' && b.kind === 'range') return a.from === b.from && a.to === b.to
  return true
}

// ── Keyword highlighting ──────────────────────────────────────────────────────

function Highlight({ text, term }: { text: string; term: string }) {
  const needle = term.trim()
  if (!needle) return <>{text}</>

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts   = text.split(new RegExp(`(${escaped})`, 'gi'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber/30 px-0.5 text-ink">{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
}

// ── Editor drawer ─────────────────────────────────────────────────────────────

interface DrawerProps {
  open:      boolean
  entry:     DiaryEntry | null       // null = create mode
  defaultDate: string
  onClose:   () => void
  onSaved:   () => void
}

function DiaryDrawer({ open, entry, defaultDate, onClose, onSaved }: DrawerProps) {
  const isEdit = Boolean(entry)

  const [date,     setDate]     = React.useState(defaultDate)
  const [title,    setTitle]    = React.useState('')
  const [content,  setContent]  = React.useState('')
  const [category, setCategory] = React.useState<DiaryCategory>('work')
  const [tagsText, setTagsText] = React.useState('')
  const [saving,   setSaving]   = React.useState(false)
  const [error,    setError]    = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    if (entry) {
      setDate(entry.entry_date)
      setTitle(entry.title ?? '')
      setContent(entry.content)
      setCategory(entry.category)
      setTagsText(entry.tags.join(', '))
    } else {
      setDate(defaultDate)
      setTitle('')
      setContent('')
      setCategory('work')
      setTagsText('')
    }
    setError(null)
  }, [open, entry, defaultDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) { setError('Write something first'); return }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        entry_date: date,
        title:      title.trim() || null,
        content:    content.trim(),
        category,
        tags:       tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      }
      const r = await fetch(isEdit ? `/api/diary/${entry!.id}` : '/api/diary', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Something went wrong')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">{isEdit ? 'Edit Entry' : 'New Diary Entry'}</h2>
            <p className="text-xs text-ink-soft">{formatLongDate(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="space-y-5 p-6">

            {/* Date + quick jumps */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                Date <span className="text-coral">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={() => setDate(today())}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDate(shiftDays(today(), -1))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2"
                >
                  Yesterday
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-ink-muted">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((c) => {
                  const m = CATEGORY_META[c]
                  const Icon = m.icon
                  const active = category === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                        active
                          ? cn(m.chip, 'border-transparent ring-2 ring-brand/30 ring-offset-1 shadow-sm')
                          : 'border-border text-ink-muted opacity-60 hover:opacity-100',
                      )}
                    >
                      <Icon className="size-3.5" />
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                Title <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Client onboarding + payroll review"
                className="h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Content */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                What did you do? <span className="text-coral">*</span>
              </label>
              <textarea
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                autoFocus
                placeholder={'Write today\'s work…\n\n• Finished the payroll run for August\n• Met the design team about the new booking flow\n• Fixed the attendance export bug'}
                className="w-full resize-y rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              />
              <p className="mt-1 text-right text-[11px] text-ink-soft">{content.length} characters</p>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                Tags <span className="font-normal text-ink-soft">(comma separated)</span>
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="payroll, client, urgent"
                className="h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-auto border-t border-border p-6 pt-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Save Entry'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────

interface Props {
  initialEntries: DiaryEntry[]
  initialTotal:   number
  initialStats:   DiaryStats
  initialTags:    string[]
}

export function DiarySection({ initialEntries, initialTotal, initialStats, initialTags }: Props) {
  const [entries, setEntries] = React.useState<DiaryEntry[]>(initialEntries)
  const [total,   setTotal]   = React.useState(initialTotal)
  const [stats,   setStats]   = React.useState(initialStats)
  const [tags,    setTags]    = React.useState(initialTags)

  const [search,     setSearch]     = React.useState('')
  const [debounced,  setDebounced]  = React.useState('')
  const [dateFilter, setDateFilter] = React.useState<DateFilter>({ kind: 'all' })
  const [category,   setCategory]   = React.useState<DiaryCategory | ''>('')
  const [tag,        setTag]        = React.useState('')
  const [showFilters, setShowFilters] = React.useState(false)

  const [loading,     setLoading]     = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error,       setError]       = React.useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [editEntry,  setEditEntry]  = React.useState<DiaryEntry | null>(null)
  const [deleting,   setDeleting]   = React.useState<string | null>(null)

  // Debounce the search box so typing doesn't fire a request per keystroke.
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(id)
  }, [search])

  const buildParams = React.useCallback((offset: number) => {
    const p = new URLSearchParams()
    if (debounced.trim()) p.set('q', debounced.trim())
    if (dateFilter.kind === 'day')   p.set('date', dateFilter.day)
    if (dateFilter.kind === 'range') { p.set('from', dateFilter.from); p.set('to', dateFilter.to) }
    if (category) p.set('category', category)
    if (tag)      p.set('tag', tag)
    p.set('limit',  String(PAGE_SIZE))
    p.set('offset', String(offset))
    return p
  }, [debounced, dateFilter, category, tag])

  // Guards against a slow early response overwriting a newer one.
  const requestId = React.useRef(0)

  const fetchPage = React.useCallback(async (offset: number) => {
    const id = ++requestId.current
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const r = await fetch(`/api/diary?${buildParams(offset).toString()}`)
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to load entries')
      }
      const data: { entries: DiaryEntry[]; total: number } = await r.json()
      if (id !== requestId.current) return          // a newer request already won
      setTotal(data.total)
      setEntries((prev) => (offset === 0 ? data.entries : [...prev, ...data.entries]))
    } catch (err) {
      if (id === requestId.current) {
        setError(err instanceof Error ? err.message : 'Failed to load entries')
      }
    } finally {
      if (id === requestId.current) { setLoading(false); setLoadingMore(false) }
    }
  }, [buildParams])

  // Re-query whenever a filter changes — the initial page comes from the server.
  const firstRun = React.useRef(true)
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    fetchPage(0)
  }, [fetchPage])

  /** Header stats + tag list — refreshed after any write. */
  const refreshMeta = React.useCallback(async () => {
    try {
      const r = await fetch('/api/diary/meta')
      if (!r.ok) return
      const data: { stats: DiaryStats; tags: string[] } = await r.json()
      setStats(data.stats)
      setTags(data.tags)
    } catch {
      // Non-fatal — the entry list itself is already up to date.
    }
  }, [])

  const hasFilters =
    Boolean(debounced.trim()) || dateFilter.kind !== 'all' || Boolean(category) || Boolean(tag)

  const activeFilterCount =
    (dateFilter.kind !== 'all' ? 1 : 0) + (category ? 1 : 0) + (tag ? 1 : 0)

  function clearFilters() {
    setSearch('')
    setDateFilter({ kind: 'all' })
    setCategory('')
    setTag('')
  }

  function openCreate() {
    setEditEntry(null)
    setDrawerOpen(true)
  }

  function openEdit(entry: DiaryEntry) {
    setEditEntry(entry)
    setDrawerOpen(true)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this diary entry? This cannot be undone.')) return
    setDeleting(id)
    try {
      const r = await fetch(`/api/diary/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setEntries((prev) => prev.filter((e) => e.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      void refreshMeta()
    } catch {
      setError('Could not delete that entry. Try again.')
    } finally {
      setDeleting(null)
    }
  }

  async function handleSaved() {
    await Promise.all([fetchPage(0), refreshMeta()])
  }

  // Group the flat list into date buckets, preserving server order.
  const groups = React.useMemo(() => {
    const out: Array<{ day: string; items: DiaryEntry[] }> = []
    for (const e of entries) {
      const last = out[out.length - 1]
      if (last && last.day === e.entry_date) last.items.push(e)
      else out.push({ day: e.entry_date, items: [e] })
    }
    return out
  }, [entries])

  const defaultDate = dateFilter.kind === 'day' ? dateFilter.day : today()

  return (
    <div className="space-y-4">

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={NotebookPen}  label="Total entries" value={stats.total} tone="text-brand"   bg="bg-brand/10" />
        <StatCard icon={CalendarDays} label="This month"    value={stats.thisMonth} tone="text-indigo" bg="bg-indigo/10" />
        <StatCard icon={CalendarSearch} label="Days logged" value={stats.daysLogged} tone="text-emerald" bg="bg-emerald/10" />
        <StatCard icon={Flame}        label="Day streak"    value={stats.streak} tone="text-amber"  bg="bg-amber/15" />
      </div>

      {/* ── Toolbar ── */}
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-card">

        {/* Row 1 — search + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your diary by keyword…"
              className="h-10 w-full rounded-xl border border-transparent bg-surface-2 pl-9 pr-9 text-sm placeholder:text-ink-soft focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-soft" />
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((f) => !f)}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors',
              showFilters || activeFilterCount > 0
                ? 'border-brand/30 bg-brand/10 text-brand'
                : 'border-border text-ink-muted hover:bg-surface-2',
            )}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="size-4" />
            New Entry
          </button>
        </div>

        {/* Row 2 — date presets + exact-day picker */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const active = sameFilter(dateFilter, p.build())
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setDateFilter(p.build())}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border text-ink-muted hover:bg-surface-2',
                )}
              >
                {p.label}
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs font-medium text-ink-soft">Jump to date</label>
            <input
              type="date"
              value={dateFilter.kind === 'day' ? dateFilter.day : ''}
              onChange={(e) =>
                setDateFilter(e.target.value ? { kind: 'day', day: e.target.value } : { kind: 'all' })
              }
              className="h-9 rounded-lg border border-border bg-surface-2/50 px-2.5 text-xs outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        {/* Row 3 — expandable filters */}
        {showFilters && (
          <div className="animate-fade-in space-y-3 rounded-xl border border-border bg-surface-2/30 p-3">

            {/* Custom range */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">Date range</span>
              <input
                type="date"
                value={dateFilter.kind === 'range' ? dateFilter.from : ''}
                onChange={(e) =>
                  setDateFilter({
                    kind: 'range',
                    from: e.target.value,
                    to:   dateFilter.kind === 'range' ? dateFilter.to : today(),
                  })
                }
                className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              />
              <span className="text-xs text-ink-soft">to</span>
              <input
                type="date"
                value={dateFilter.kind === 'range' ? dateFilter.to : ''}
                onChange={(e) =>
                  setDateFilter({
                    kind: 'range',
                    from: dateFilter.kind === 'range' ? dateFilter.from : monthStart(),
                    to:   e.target.value,
                  })
                }
                className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Category */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-ink-muted">Category</span>
              <button
                type="button"
                onClick={() => setCategory('')}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === ''
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border text-ink-muted hover:bg-surface',
                )}
              >
                All
              </button>
              {CATEGORY_OPTIONS.map((c) => {
                const m = CATEGORY_META[c]
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(category === c ? '' : c)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      category === c
                        ? cn(m.chip, 'border-transparent')
                        : 'border-border text-ink-muted hover:bg-surface',
                    )}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>

            {/* Tag + clear */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">Tag</span>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              >
                <option value="">Any tag</option>
                {tags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface hover:text-coral"
                >
                  <X className="size-3.5" />
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Result summary ── */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-ink-muted">
          <span>
            <span className="font-semibold text-ink">{total}</span>{' '}
            {total === 1 ? 'entry' : 'entries'} found
          </span>
          {debounced.trim() && <span className="text-ink-soft">for “{debounced.trim()}”</span>}
          {dateFilter.kind === 'day' && (
            <span className="text-ink-soft">on {formatShortDate(dateFilter.day)}</span>
          )}
          {dateFilter.kind === 'range' && (
            <span className="text-ink-soft">
              between {formatShortDate(dateFilter.from)} and {formatShortDate(dateFilter.to)}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      )}

      {/* ── Entries ── */}
      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-20 text-sm text-ink-muted shadow-card">
          <Loader2 className="size-4 animate-spin" /> Loading entries…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-20 shadow-card">
          <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">
            <NotebookPen className="size-6 text-ink-soft" />
          </div>
          <p className="text-sm font-medium text-ink-muted">
            {hasFilters ? 'No entries match your search.' : 'Your diary is empty.'}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2"
            >
              <X className="size-4" /> Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90"
            >
              <Plus className="size-4" /> Write today&apos;s entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(({ day, items }) => {
            const relative = relativeDayLabel(day)
            return (
              <section key={day} className="space-y-2">
                {/* Date header */}
                <div className="flex items-center gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-brand">
                      <CalendarDays className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-tight text-ink">
                        {formatLongDate(day)}
                      </p>
                      <p className="text-[11px] text-ink-soft">
                        {relative ? `${relative} · ` : ''}
                        {items.length} {items.length === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Entries for the day */}
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  <ul className="divide-y divide-border">
                    {items.map((e) => {
                      const m = CATEGORY_META[e.category]
                      const Icon = m.icon
                      return (
                        <li key={e.id} className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2/40">
                          <span className={cn('mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl', m.bg, m.text)}>
                            <Icon className="size-5" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', m.chip)}>
                                {m.label}
                              </span>
                              {e.tags.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => { setTag(t); setShowFilters(true) }}
                                  title={`Filter by #${t}`}
                                  className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-muted hover:bg-brand/10 hover:text-brand"
                                >
                                  <Tag className="size-2.5" />
                                  {t}
                                </button>
                              ))}
                            </div>

                            {e.title && (
                              <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">
                                <Highlight text={e.title} term={debounced} />
                              </p>
                            )}
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
                              <Highlight text={e.content} term={debounced} />
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => openEdit(e)}
                              title="Edit"
                              className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(e.id)}
                              title="Delete"
                              disabled={deleting === e.id}
                              className="grid size-8 place-items-center rounded-lg text-ink-muted opacity-60 transition-all hover:bg-coral/10 hover:text-coral hover:opacity-100 disabled:opacity-30"
                            >
                              {deleting === e.id
                                ? <Loader2 className="size-4 animate-spin" />
                                : <Trash2 className="size-4" />}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>
            )
          })}

          {/* Load more */}
          {entries.length < total && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => fetchPage(entries.length)}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink-muted shadow-card hover:bg-surface-2 disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="size-4 animate-spin" />}
                Load more ({total - entries.length} left)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Drawer */}
      <DiaryDrawer
        open={drawerOpen}
        entry={editEntry}
        defaultDate={defaultDate}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, tone, bg,
}: {
  icon:  React.ElementType
  label: string
  value: number
  tone:  string
  bg:    string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', bg, tone)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-ink">{value}</p>
        <p className="truncate text-[11px] text-ink-soft">{label}</p>
      </div>
    </div>
  )
}
