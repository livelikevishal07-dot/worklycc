import 'server-only'
import { db } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Booking {
  id:               string
  employee_id:      string
  order_date:       string   // YYYY-MM-DD
  customer_name:    string
  customer_phone:   string
  city:             string
  event_date:       string   // YYYY-MM-DD
  total_amount:     number
  advance_paid:     number
  website:          string
  occasion:         string
  booking_platform: string
  external_order_id: string | null   // source site order no; NULL when typed in by hand
  created_at:       string
}

export interface BookingWithEmployee extends Booking {
  employee?: { full_name: string; department?: { name: string } | null } | null
}

// ── Type-safe coercion ───────────────────────────────────────────────────────
// Postgres `numeric` is returned by supabase-js as STRING ("49999.00") to
// preserve precision. JS math on strings silently breaks ("0" + "49999.00"
// is concat, not addition). Force-coerce to Number so every consumer
// downstream — charts, totals, sorting — gets real numbers.

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalize<T extends { total_amount?: unknown; advance_paid?: unknown }>(row: T): T {
  return {
    ...row,
    total_amount: num(row.total_amount),
    advance_paid: num(row.advance_paid),
  } as T
}

// ── Pagination ─────────────────────────────────────────────────────────────────
// Supabase's PostgREST API caps any single response at `max-rows` (default 1000)
// when no explicit range is given. A month can already exceed 1000 bookings, so
// fetch in batches with `.range()` and stitch the pages together — otherwise the
// admin list, analytics, and CSV export silently drop everything past row 1000.

const PAGE_SIZE = 1000

/**
 * Page through a PostgREST query in `PAGE_SIZE`-row batches until exhausted.
 * `build` must return a FRESH query each call (a builder is single-use once
 * awaited). Stops when a batch comes back short — i.e. the last page.
 */
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return all
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listBookings(params: {
  employee_id?: string
  from?: string
  to?: string
  event_from?: string
  event_to?: string
  limit?: number
  withEmployee?: boolean
}): Promise<BookingWithEmployee[]> {
  const select = params.withEmployee
    ? '*, employee:employees(full_name, department:departments(name))'
    : '*'

  const build = () => {
    let q = db()
      .from('bookings')
      .select(select)
      .order('order_date', { ascending: false })
      .order('created_at',  { ascending: false })
      .order('id',          { ascending: false })   // unique tiebreaker → stable paging

    if (params.employee_id) q = q.eq('employee_id', params.employee_id)
    if (params.from)        q = q.gte('order_date', params.from)
    if (params.to)          q = q.lte('order_date', params.to)
    if (params.event_from)  q = q.gte('event_date', params.event_from)
    if (params.event_to)    q = q.lte('event_date', params.event_to)
    return q
  }

  // An explicit limit means the caller wants a bounded result — honour it with a
  // single capped query and skip pagination.
  if (params.limit) {
    const { data, error } = await build().limit(params.limit)
    if (error) throw error
    // Dynamic select string defeats PostgREST's static typing — cast via unknown.
    return ((data ?? []) as unknown as BookingWithEmployee[]).map(normalize)
  }

  // No limit: page through everything so months > 1000 bookings aren't truncated.
  const rows = await fetchAll<any>(build)
  return (rows as unknown as BookingWithEmployee[]).map(normalize)
}

export async function createBooking(input: {
  employee_id:      string
  order_date:       string
  customer_name:    string
  customer_phone:   string
  city:             string
  event_date:       string
  total_amount:     number
  advance_paid:     number
  website:          string
  occasion:         string
  booking_platform: string
  external_order_id?: string | null
}): Promise<Booking> {
  const { data, error } = await db()
    .from('bookings')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return normalize(data as Booking)
}

/**
 * Look up a booking already imported from a website, by that site's own order
 * number. Lets the external endpoint answer a retry with the original row
 * instead of inserting a duplicate.
 */
export async function getBookingByExternalId(
  website: string,
  external_order_id: string,
): Promise<Booking | null> {
  const { data, error } = await db()
    .from('bookings')
    .select('*')
    .eq('website', website)
    .eq('external_order_id', external_order_id)
    .maybeSingle()
  if (error) throw error
  return data ? normalize(data as Booking) : null
}

export async function updateBooking(
  id: string,
  patch: Partial<{
    order_date:       string
    customer_name:    string
    customer_phone:   string
    city:             string
    event_date:       string
    total_amount:     number
    advance_paid:     number
    website:          string
    occasion:         string
    booking_platform: string
  }>,
): Promise<Booking> {
  const { data, error } = await db()
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return normalize(data as Booking)
}

export async function deleteBooking(id: string, employee_id: string): Promise<void> {
  const { error } = await db()
    .from('bookings')
    .delete()
    .eq('id', id)
    .eq('employee_id', employee_id)   // ensures employee can only delete own
  if (error) throw error
}

// ── Analytics helpers (admin only) ───────────────────────────────────────────

export async function getBookingSummary(params: { from: string; to: string }) {
  // Paginate — an analytics range can easily exceed the 1000-row API cap, which
  // would otherwise silently undercount every KPI on the analysis page.
  const rows = await fetchAll<any>(() =>
    db()
      .from('bookings')
      .select('order_date, total_amount, advance_paid, city, website, occasion, booking_platform, employee_id')
      .order('order_date', { ascending: false })
      .order('id',         { ascending: false })   // unique tiebreaker → stable paging
      .gte('order_date', params.from)
      .lte('order_date', params.to),
  )
  return rows.map((row: any) => ({
    ...row,
    total_amount: num(row.total_amount),
    advance_paid: num(row.advance_paid),
  }))
}
