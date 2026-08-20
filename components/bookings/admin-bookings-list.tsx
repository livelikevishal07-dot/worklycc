'use client'

import * as React from 'react'
import {
  Search, Trash2, Download, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Calendar, Filter, RotateCcw,
  Pencil, Loader2, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReveal, maskedINR, MASK } from './reveal-context'
import { RevealToggle } from './reveal-toggle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Booking {
  id:               string
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
  created_at:       string
  employee?: { full_name: string; department?: { name: string } | null } | null
}

interface EmployeeOption {
  id:        string
  full_name: string
}

interface Props {
  employees: EmployeeOption[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Standard city list — 'Others' in the filter matches any city NOT in this set.
const CITIES = [
  'Bangalore','Delhi','Mumbai','Hyderabad','Pune','Kolkata','Chennai',
  'Gurgaon','Noida','Ghaziabad','Ahmedabad','Jaipur','Nagpur','Navi Mumbai',
  'Lucknow','Bhubaneshwar','Chandigarh','Vadodara','Surat','Kochi',
  'Indore','Bhopal','Patna','Agra','Visakhapatnam','Thane','Nashik','Meerut',
]

// Set for O(1) lookup in the "Other Cities" filter
const CITY_SET = new Set(CITIES)

// Sentinel value used in the city filter select
const OTHER_CITY = '__other__'

const OCCASIONS = [
  'Birthday','Romantic','Welcome Baby','Baby Shower','First Night',
  'Kids Birthday','Wedding Others','Corporate','Flowers','Cakes','Hampers','Others',
]

// Fallbacks — replaced by dynamic values from /api/booking-options
const FALLBACK_WEBSITES:  string[] = ['BalloonDekor', '7eventzz', 'Giftlaya']
const FALLBACK_PLATFORMS: string[] = ['WhatsApp', 'Website', 'Others']

const PAGE_SIZES = [25, 50, 100, 200]

const WEBSITE_COLORS: Record<string, string> = {
  BalloonDekor: '#6F5CFF',
  '7eventzz':   '#27C0DE',
  Giftlaya:     '#F47A6F',
}
const PLATFORM_COLORS: Record<string, string> = {
  WhatsApp: '#22C58B',
  Website:  '#6F5CFF',
  Others:   '#F2B544',
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

// Local date → YYYY-MM-DD (matches Postgres `date` storage).
// Avoid `toISOString()` because it returns UTC, off-by-one for non-UTC users.
function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoToday() {
  return localISO(new Date())
}
function isoOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localISO(d)
}
function startOfMonthISO(d = new Date()) {
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1))
}
function endOfMonthISO(d = new Date()) {
  return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
function startOfLastMonthISO() {
  const d = new Date()
  return localISO(new Date(d.getFullYear(), d.getMonth() - 1, 1))
}
function endOfLastMonthISO() {
  const d = new Date()
  return localISO(new Date(d.getFullYear(), d.getMonth(), 0))
}
function startOfWeekISO() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay()) // Sunday-first
  return localISO(d)
}
function startOfYearISO() {
  return localISO(new Date(new Date().getFullYear(), 0, 1))
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortKey = 'order_date' | 'event_date' | 'total_amount' | 'customer_name' | 'employee'
type SortDir = 'asc' | 'desc'

// ── Main List Component ───────────────────────────────────────────────────────

export function AdminBookingsList({ employees }: Props) {
  const { revealed } = useReveal()
  // ── Dynamic booking options ─────────────────────────────────────────────────
  const [websites,  setWebsites]  = React.useState<string[]>(FALLBACK_WEBSITES)
  const [platforms, setPlatforms] = React.useState<string[]>(FALLBACK_PLATFORMS)

  React.useEffect(() => {
    fetch('/api/booking-options')
      .then((r) => r.json())
      .then((d: { type: string; label: string }[]) => {
        if (!Array.isArray(d)) return
        const ws = d.filter((o) => o.type === 'website').map((o) => o.label)
        const ps = d.filter((o) => o.type === 'platform').map((o) => o.label)
        if (ws.length) setWebsites(ws)
        if (ps.length) setPlatforms(ps)
      })
      .catch(() => {})
  }, [])

  // ── Filter state ────────────────────────────────────────────────────────────
  const [from,      setFrom]      = React.useState(startOfMonthISO())
  const [to,        setTo]        = React.useState(endOfMonthISO())
  const [empFilter, setEmpFilter] = React.useState('')
  const [city,      setCity]      = React.useState('')
  const [website,   setWebsite]   = React.useState('')
  const [platform,  setPlatform]  = React.useState('')
  const [occasion,  setOccasion]  = React.useState('')
  const [search,    setSearch]    = React.useState('')
  const [minAmount, setMinAmount] = React.useState('')
  const [maxAmount, setMaxAmount] = React.useState('')

  // ── Pagination state ────────────────────────────────────────────────────────
  const [page,     setPage]     = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)

  // ── Sort state ──────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = React.useState<SortKey>('order_date')
  const [sortDir, setSortDir] = React.useState<SortDir>('desc')

  // ── Data state ──────────────────────────────────────────────────────────────
  const [bookings,  setBookings]  = React.useState<Booking[]>([])
  const [loading,   setLoading]   = React.useState(true)
  const [confirmId, setConfirmId] = React.useState<string | null>(null)
  const [deleting,  setDeleting]  = React.useState<string | null>(null)
  const [editing,   setEditing]   = React.useState<Booking | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ from, to, with_employee: '1' })
      if (empFilter) sp.set('employee_id', empFilter)
      const res = await fetch(`/api/bookings?${sp}`)
      const data = await res.json()
      // Defensive: coerce numeric fields to numbers (Postgres `numeric`
      // is returned as string by supabase-js — concat would silently break).
      const rows: Booking[] = Array.isArray(data)
        ? data.map((b: any) => ({
            ...b,
            total_amount: Number(b.total_amount) || 0,
            advance_paid: Number(b.advance_paid) || 0,
          }))
        : []
      setBookings(rows)
      setPage(1)
    } finally {
      setLoading(false)
    }
  }, [from, to, empFilter])

  React.useEffect(() => { load() }, [load])

  // ── Quick presets ───────────────────────────────────────────────────────────
  function setPreset(preset: string) {
    switch (preset) {
      case 'today':       setFrom(isoToday()); setTo(isoToday()); break
      case 'yesterday':   setFrom(isoOffset(-1)); setTo(isoOffset(-1)); break
      case 'week':        setFrom(startOfWeekISO()); setTo(isoToday()); break
      case 'month':       setFrom(startOfMonthISO()); setTo(endOfMonthISO()); break
      case 'lastmonth':   setFrom(startOfLastMonthISO()); setTo(endOfLastMonthISO()); break
      case 'year':        setFrom(startOfYearISO()); setTo(isoToday()); break
      case 'last30':      setFrom(isoOffset(-30)); setTo(isoToday()); break
    }
  }

  function clearAllFilters() {
    setFrom(startOfMonthISO()); setTo(endOfMonthISO())
    setEmpFilter(''); setCity(''); setWebsite(''); setPlatform(''); setOccasion('')
    setSearch(''); setMinAmount(''); setMaxAmount('')
  }

  // ── Client-side filter chain ────────────────────────────────────────────────
  const q = search.toLowerCase().trim()
  const min = minAmount ? Number(minAmount) : 0
  const max = maxAmount ? Number(maxAmount) : Infinity

  const filtered = bookings
    .filter(b => {
      // City filter: '__other__' = any city not in the standard list
      if (city === OTHER_CITY && CITY_SET.has(b.city)) return false
      if (city && city !== OTHER_CITY && b.city !== city) return false
      if (website  && b.website          !== website)  return false
      if (platform && b.booking_platform !== platform) return false
      if (occasion && b.occasion         !== occasion) return false
      if (b.total_amount < min || b.total_amount > max) return false
      if (q && !(
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.includes(q) ||
        b.city.toLowerCase().includes(q) ||
        (b.employee?.full_name ?? '').toLowerCase().includes(q)
      )) return false
      return true
    })
    .sort((a, b) => {
      let av: any, bv: any
      if (sortKey === 'employee') {
        av = a.employee?.full_name ?? ''
        bv = b.employee?.full_name ?? ''
      } else if (sortKey === 'total_amount') {
        av = a.total_amount; bv = b.total_amount
      } else {
        av = a[sortKey]; bv = b[sortKey]
      }
      return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0)
    })

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const pageRows = filtered.slice(startIdx, startIdx + pageSize)

  React.useEffect(() => { setPage(1) }, [pageSize, search, city, website, platform, occasion, minAmount, maxAmount, sortKey, sortDir])

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalRevenue = filtered.reduce((s, b) => s + b.total_amount, 0)
  const totalAdvance = filtered.reduce((s, b) => s + b.advance_paid, 0)
  const totalPending = totalRevenue - totalAdvance

  // ── Actions ─────────────────────────────────────────────────────────────────
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  async function handleDelete(b: Booking) {
    setDeleting(b.id)
    try {
      const r = await fetch(`/api/bookings/${b.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: b.employee_id }),
      })
      if (!r.ok) {
        // Surface the failure rather than silently desync local state
        const d = await r.json().catch(() => ({}))
        alert(`Failed to delete: ${d.error ?? r.statusText}`)
        return
      }
      setBookings(prev => prev.filter(x => x.id !== b.id))
      setConfirmId(null)
    } finally {
      setDeleting(null)
    }
  }

  function exportCSV() {
    const headers = [
      'Order Date','Customer','Phone','City','Event Date','Website',
      'Occasion','Platform','Total (₹)','Advance (₹)','Pending (₹)','Employee',
    ]
    const rows = filtered.map(b => [
      b.order_date, b.customer_name, b.customer_phone, b.city, b.event_date,
      b.website, b.occasion, b.booking_platform,
      ...(revealed
        ? [b.total_amount, b.advance_paid, b.total_amount - b.advance_paid]
        : [MASK, MASK, MASK]),
      b.employee?.full_name ?? '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bookings-${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeFilterCount = [empFilter, city, website, platform, occasion, search, minAmount, maxAmount]
    .filter(Boolean).length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Date range + Quick presets ── */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date range */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              <Calendar className="inline size-3 mr-1" /> From
            </label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              To
            </label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            <PresetBtn onClick={() => setPreset('today')}>Today</PresetBtn>
            <PresetBtn onClick={() => setPreset('yesterday')}>Yesterday</PresetBtn>
            <PresetBtn onClick={() => setPreset('week')}>This Week</PresetBtn>
            <PresetBtn onClick={() => setPreset('month')}>This Month</PresetBtn>
            <PresetBtn onClick={() => setPreset('lastmonth')}>Last Month</PresetBtn>
            <PresetBtn onClick={() => setPreset('last30')}>Last 30 Days</PresetBtn>
            <PresetBtn onClick={() => setPreset('year')}>This Year</PresetBtn>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <RevealToggle />
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-2 transition-colors">
                <RotateCcw className="size-3.5" />
                Reset ({activeFilterCount})
              </button>
            )}
            <button onClick={exportCSV}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 transition-opacity">
              <Download className="size-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label="Employee" value={empFilter} onChange={setEmpFilter}
            options={[{ v: '', l: 'All' }, ...employees.map(e => ({ v: e.id, l: e.full_name }))]} />
          <CityFilterSelect value={city} onChange={setCity} />
          <FilterSelect label="Website" value={website} onChange={setWebsite}
            options={[{ v: '', l: 'All Websites' }, ...websites.map(w => ({ v: w, l: w }))]} />
          <FilterSelect label="Platform" value={platform} onChange={setPlatform}
            options={[{ v: '', l: 'All Platforms' }, ...platforms.map(p => ({ v: p, l: p }))]} />
          <FilterSelect label="Occasion" value={occasion} onChange={setOccasion}
            options={[{ v: '', l: 'All Occasions' }, ...OCCASIONS.map(o => ({ v: o, l: o }))]} />

          {/* Amount range */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              Amount (₹)
            </label>
            <div className="flex items-center gap-1">
              <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)}
                placeholder="Min" min="0"
                className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
              <span className="text-ink-soft">–</span>
              <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)}
                placeholder="Max" min="0"
                className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-soft" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by customer name, phone, city, or employee…"
              className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-10 pr-3 text-sm placeholder:text-ink-soft focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Bookings" value={String(totalCount)} color="text-brand" />
        <MiniStat label="Total Revenue" value={maskedINR(totalRevenue, revealed)} color="text-violet" />
        <MiniStat label="Advance" value={maskedINR(totalAdvance, revealed)} color="text-emerald" />
        <MiniStat label="Pending" value={maskedINR(totalPending, revealed)} color="text-coral" />
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2/40">
              <tr>
                <SortTh label="Order Date" k="order_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Customer" k="customer_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <PlainTh label="Phone" />
                <PlainTh label="City" />
                <SortTh label="Event Date" k="event_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <PlainTh label="Website" />
                <PlainTh label="Occasion" />
                <PlainTh label="Platform" />
                <SortTh label="Total" k="total_amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <PlainTh label="Advance" align="right" />
                <PlainTh label="Pending" align="right" />
                <SortTh label="Employee" k="employee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <PlainTh label="Action" align="center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-sm text-ink-soft">Loading bookings…</td></tr>
              )}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center text-sm text-ink-soft">
                    <Filter className="mx-auto mb-2 size-8 opacity-30" />
                    No bookings match your filters
                  </td>
                </tr>
              )}
              {!loading && pageRows.map(b => {
                const pending = b.total_amount - b.advance_paid
                const isConfirm = confirmId === b.id
                return (
                  <tr key={b.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{b.order_date}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{b.customer_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft whitespace-nowrap">{b.customer_phone}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{b.city}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{b.event_date}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                        style={{ background: (WEBSITE_COLORS[b.website] ?? '#6F5CFF') + '22',
                                 color: WEBSITE_COLORS[b.website] ?? '#6F5CFF' }}>
                        {b.website}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{b.occasion}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                        style={{ background: (PLATFORM_COLORS[b.booking_platform] ?? '#6F5CFF') + '22',
                                 color: PLATFORM_COLORS[b.booking_platform] ?? '#6F5CFF' }}>
                        {b.booking_platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      {revealed ? `₹${fmt(b.total_amount)}` : MASK}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium whitespace-nowrap" style={{ color: '#22C58B' }}>
                      {revealed ? `₹${fmt(b.advance_paid)}` : MASK}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium whitespace-nowrap" style={{ color: '#F47A6F' }}>
                      {revealed ? `₹${fmt(pending)}` : MASK}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft whitespace-nowrap">
                      {b.employee?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isConfirm ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleDelete(b)} disabled={deleting === b.id}
                            className="rounded-md bg-coral px-2 py-0.5 text-[10px] font-bold text-white hover:bg-coral/90 disabled:opacity-50">
                            {deleting === b.id ? '…' : 'Delete'}
                          </button>
                          <button onClick={() => setConfirmId(null)}
                            className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium hover:bg-surface-2">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5">
                          <button onClick={() => setEditing(b)}
                            title="Edit booking"
                            className="grid size-7 place-items-center rounded-lg text-ink-muted hover:bg-brand/10 hover:text-brand transition-colors">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => setConfirmId(b.id)}
                            title="Delete booking"
                            className="grid size-7 place-items-center rounded-lg text-ink-muted hover:bg-coral/10 hover:text-coral transition-colors">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <span>Rows per page:</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              className="h-7 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink-muted focus:border-brand focus:outline-none">
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="ml-3">
              {totalCount === 0 ? '0 entries' :
                `${startIdx + 1}–${Math.min(startIdx + pageSize, totalCount)} of ${totalCount}`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <PageBtn onClick={() => setPage(1)} disabled={safePage === 1}>
              <ChevronsLeft className="size-4" />
            </PageBtn>
            <PageBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
              <ChevronLeft className="size-4" />
            </PageBtn>
            {/* Page numbers (compact) */}
            {getPageNumbers(safePage, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={i} className="px-2 text-xs text-ink-soft">…</span>
              ) : (
                <button key={i} onClick={() => setPage(p as number)}
                  className={cn(
                    'grid h-7 min-w-[28px] place-items-center rounded-md px-2 text-xs font-semibold transition-colors',
                    p === safePage
                      ? 'bg-brand text-brand-foreground'
                      : 'text-ink-muted hover:bg-surface'
                  )}>
                  {p}
                </button>
              )
            )}
            <PageBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
              <ChevronRight className="size-4" />
            </PageBtn>
            <PageBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>
              <ChevronsRight className="size-4" />
            </PageBtn>
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <EditBookingModal
          booking={editing}
          websites={websites}
          platforms={platforms}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setBookings(prev => prev.map(x => x.id === updated.id
              ? { ...updated, employee: x.employee }   // preserve embedded employee join
              : x))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditBookingModal({
  booking, onClose, onSaved, websites, platforms,
}: {
  booking:   Booking
  onClose:   () => void
  onSaved:   (updated: Booking) => void
  websites:  string[]
  platforms: string[]
}) {
  // Amounts stay in `form` so saving preserves them untouched while locked —
  // only their display and editability are gated.
  const { revealed } = useReveal()

  // If the stored city is not in the standard list, default to "Other City" mode
  const isOtherCity = !CITY_SET.has(booking.city)

  const [form, setForm] = React.useState({
    order_date:       booking.order_date,
    customer_name:    booking.customer_name,
    customer_phone:   booking.customer_phone,
    city:             booking.city,
    event_date:       booking.event_date,
    total_amount:     String(booking.total_amount),
    advance_paid:     String(booking.advance_paid),
    website:          booking.website,
    occasion:         booking.occasion,
    booking_platform: booking.booking_platform,
  })
  const [showCustomCity, setShowCustomCity] = React.useState(isOtherCity)
  const [saving, setSaving] = React.useState(false)
  const [err,    setErr]    = React.useState<string | null>(null)

  // Lock body scroll while modal open + ESC to close
  React.useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr(null)
    try {
      const r = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_date:       form.order_date,
          customer_name:    form.customer_name.trim(),
          customer_phone:   form.customer_phone.trim(),
          city:             form.city,
          event_date:       form.event_date,
          total_amount:     parseFloat(form.total_amount),
          advance_paid:     parseFloat(form.advance_paid),
          website:          form.website,
          occasion:         form.occasion,
          booking_platform: form.booking_platform,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? r.statusText)
      }
      const updated = await r.json()
      onSaved({
        ...updated,
        total_amount: Number(updated.total_amount) || 0,
        advance_paid: Number(updated.advance_paid) || 0,
      })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fade-in">
      <div onClick={onClose} className="absolute inset-0" />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Edit Booking</h3>
            <p className="text-xs text-ink-soft">
              For <span className="font-medium text-ink">{booking.customer_name}</span>
              {booking.employee?.full_name && <> · entered by {booking.employee.full_name}</>}
            </p>
          </div>
          <button onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}
          className="max-h-[calc(90vh-140px)] overflow-y-auto p-5 space-y-4">

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Order Date">
              <input type="date" value={form.order_date}
                onChange={e => set('order_date', e.target.value)} className={inputCls} required />
            </Field>
            <Field label="Customer Name">
              <input type="text" value={form.customer_name}
                onChange={e => set('customer_name', e.target.value)} className={inputCls} required />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer Phone">
              <input type="tel" value={form.customer_phone}
                onChange={e => set('customer_phone', e.target.value)} className={inputCls} required />
            </Field>
            <Field label="City">
              <select
                value={showCustomCity ? OTHER_CITY : form.city}
                onChange={e => {
                  if (e.target.value === OTHER_CITY) {
                    setShowCustomCity(true)
                    set('city', '')
                  } else {
                    setShowCustomCity(false)
                    set('city', e.target.value)
                  }
                }}
                className={inputCls + ' cursor-pointer'}
                required={!showCustomCity}
              >
                <option value="">Select city…</option>
                <optgroup label="Common Cities">
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
                <optgroup label="──────────────">
                  <option value={OTHER_CITY}>✦ Other City (type below)</option>
                </optgroup>
              </select>
              {showCustomCity && (
                <input
                  type="text"
                  autoFocus
                  placeholder="Type city name…"
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  className={inputCls + ' mt-2'}
                  required
                />
              )}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Event Date">
              <input type="date" value={form.event_date}
                onChange={e => set('event_date', e.target.value)} className={inputCls} required />
            </Field>
            <Field label="Total Amount (₹)">
              {revealed ? (
                <input type="number" min="0" value={form.total_amount}
                  onChange={e => set('total_amount', e.target.value)} className={inputCls} required />
              ) : (
                <input type="text" value={MASK} disabled readOnly className={inputCls + ' opacity-60 cursor-not-allowed'}
                  title="Unlock amounts to edit this" />
              )}
            </Field>
            <Field label="Advance Paid (₹)">
              {revealed ? (
                <input type="number" min="0" value={form.advance_paid}
                  onChange={e => set('advance_paid', e.target.value)} className={inputCls} required />
              ) : (
                <input type="text" value={MASK} disabled readOnly className={inputCls + ' opacity-60 cursor-not-allowed'}
                  title="Unlock amounts to edit this" />
              )}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website">
              <select value={form.website} onChange={e => set('website', e.target.value)}
                className={inputCls + ' cursor-pointer'} required>
                <option value="">Select website…</option>
                {websites.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </Field>
            <Field label="Occasion">
              <select value={form.occasion} onChange={e => set('occasion', e.target.value)}
                className={inputCls + ' cursor-pointer'} required>
                {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Booking Platform">
            <div className="flex flex-wrap gap-1.5">
              {platforms.map(p => (
                <button key={p} type="button" onClick={() => set('booking_platform', p)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
                    form.booking_platform === p
                      ? 'border-brand bg-brand text-brand-foreground'
                      : 'border-border bg-surface-2 text-ink-muted hover:border-brand/40'
                  )}>
                  {form.booking_platform === p && <Check className="mr-1 inline size-3" />}
                  {p}
                </button>
              ))}
            </div>
          </Field>

          {err && (
            <div className="rounded-lg border border-coral/30 bg-coral/5 px-3 py-2 text-xs text-coral">
              {err}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/30 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

// ── City Filter Select — uses optgroup to highlight "Other Cities" ─────────────

function CityFilterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
        City
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer"
      >
        <option value="">All Cities</option>
        <optgroup label="Common Cities">
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </optgroup>
        <optgroup label="──────────────">
          <option value={OTHER_CITY}>✦ Other Cities</option>
        </optgroup>
      </select>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function PresetBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand hover:text-brand transition-colors">
      {children}
    </button>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; l: string }[]
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold tracking-tight', color)}>{value}</p>
    </div>
  )
}

function PlainTh({ label, align = 'left' }: { label: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th className={cn(
      'px-4 py-3 text-xs font-medium text-ink-muted whitespace-nowrap',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
    )}>
      {label}
    </th>
  )
}

function SortTh({
  label, k, sortKey, sortDir, onSort, align = 'left',
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; align?: 'left' | 'right'
}) {
  const active = sortKey === k
  return (
    <th className={cn('px-4 py-3', align === 'right' ? 'text-right' : 'text-left')}>
      <button onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:text-ink transition-colors',
          align === 'right' && 'ml-auto',
          active ? 'text-brand' : 'text-ink-muted'
        )}>
        {label}
        <span className="text-[10px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

function PageBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
      {children}
    </button>
  )
}

// ── Helper: build compact pagination [1, ..., 4, 5, 6, ..., 20] ──────────────

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const result: (number | string)[] = []
  result.push(1)
  if (current > 3) result.push('...')
  const start = Math.max(2, current - 1)
  const end   = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) result.push(i)
  if (current < total - 2) result.push('...')
  result.push(total)
  return result
}
