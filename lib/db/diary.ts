import 'server-only'
import { db } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiaryCategory = 'work' | 'meeting' | 'idea' | 'personal' | 'issue'

export const DIARY_CATEGORIES: DiaryCategory[] = [
  'work',
  'meeting',
  'idea',
  'personal',
  'issue',
]

export interface DiaryEntry {
  id:         string
  entry_date: string          // YYYY-MM-DD
  title:      string | null
  content:    string
  category:   DiaryCategory
  tags:       string[]
  created_at: string
  updated_at: string
}

export interface DiaryFilters {
  /** Free-text keyword matched against title + content. */
  q?:        string
  /** Exact day (YYYY-MM-DD). Takes precedence over from/to. */
  date?:     string
  from?:     string
  to?:       string
  category?: DiaryCategory
  tag?:      string
  limit?:    number
  offset?:   number
}

export interface DiaryPage {
  entries: DiaryEntry[]
  total:   number
}

export interface DiaryStats {
  total:      number
  thisMonth:  number
  daysLogged: number
  streak:     number
}

export const DIARY_PAGE_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * PostgREST parses the `or=` argument as a comma-separated list, so commas,
 * parentheses and quotes inside a search term would break out of the filter.
 * `*` is PostgREST's wildcard alias for `%`, and `%`/`_` are SQL LIKE wildcards
 * — none of them should be honoured from raw user input.
 */
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()"*\\%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listDiaryEntries(filters: DiaryFilters = {}): Promise<DiaryPage> {
  const {
    q, date, from, to, category, tag,
    limit  = DIARY_PAGE_SIZE,
    offset = 0,
  } = filters

  let query = db()
    .from('diary_entries')
    .select('*', { count: 'exact' })

  if (date) {
    query = query.eq('entry_date', date)
  } else {
    if (from) query = query.gte('entry_date', from)
    if (to)   query = query.lte('entry_date', to)
  }

  if (category) query = query.eq('category', category)
  if (tag)      query = query.contains('tags', [tag])

  const term = q ? sanitizeSearchTerm(q) : ''
  if (term) {
    query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`)
  }

  // Newest day first; within a day, newest entry first.
  const { data, error, count } = await query
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  return { entries: (data ?? []) as DiaryEntry[], total: count ?? 0 }
}

export async function getDiaryStats(): Promise<DiaryStats> {
  const { data, error } = await db()
    .from('diary_entries')
    .select('entry_date')
    .order('entry_date', { ascending: false })
  if (error) throw error

  const dates = (data ?? []).map((r) => (r as { entry_date: string }).entry_date)
  const unique = Array.from(new Set(dates))          // already sorted desc

  const monthPrefix = new Date().toISOString().slice(0, 7)
  const thisMonth = dates.filter((d) => d.startsWith(monthPrefix)).length

  // Streak: consecutive days ending today or yesterday (so a not-yet-written
  // today doesn't wipe out an otherwise unbroken run).
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = addDays(today, -1)
  let streak = 0
  if (unique[0] === today || unique[0] === yesterday) {
    let cursor = unique[0]
    for (const d of unique) {
      if (d !== cursor) break
      streak++
      cursor = addDays(cursor, -1)
    }
  }

  return { total: dates.length, thisMonth, daysLogged: unique.length, streak }
}

/** Distinct tags across all entries, alphabetically sorted — powers the tag filter. */
export async function listDiaryTags(): Promise<string[]> {
  const { data, error } = await db().from('diary_entries').select('tags')
  if (error) throw error
  const all = (data ?? []).flatMap((r) => (r as { tags: string[] | null }).tags ?? [])
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b))
}

export async function createDiaryEntry(input: {
  entry_date: string
  title?:     string | null
  content:    string
  category?:  DiaryCategory
  tags?:      string[]
}): Promise<DiaryEntry> {
  const { data, error } = await db()
    .from('diary_entries')
    .insert({
      entry_date: input.entry_date,
      title:      input.title ?? null,
      content:    input.content,
      category:   input.category ?? 'work',
      tags:       input.tags ?? [],
    })
    .select('*')
    .single()
  if (error) throw error
  return data as DiaryEntry
}

export async function updateDiaryEntry(
  id: string,
  patch: Partial<{
    entry_date: string
    title:      string | null
    content:    string
    category:   DiaryCategory
    tags:       string[]
  }>,
): Promise<DiaryEntry> {
  const { data, error } = await db()
    .from('diary_entries')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as DiaryEntry
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  const { error } = await db().from('diary_entries').delete().eq('id', id)
  if (error) throw error
}
