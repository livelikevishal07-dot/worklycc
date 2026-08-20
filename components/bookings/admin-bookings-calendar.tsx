'use client'

import * as React from 'react'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, MapPin,
  PencilLine, Phone, RefreshCcw, User, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRevealSafe } from './reveal-context'
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

interface EmployeeOption { id: string; full_name: string }

interface Props {
  employees:    EmployeeOption[]
  hideAmounts?: boolean   // employee view — hide revenue/balance figures
}

// ── Date utils ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayISO() { return localISO(new Date()) }

function buildMonthGrid(year: number, month: number) {
  // Returns 6 rows × 7 cols of Date objects covering the month, padded with
  // prev/next month days so the grid is always 42 cells.
  const first      = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const start      = new Date(year, month, 1 - startWeekday)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    cells.push(d)
  }
  return cells
}

function fmtINR(n: number) {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function AdminBookingsCalendar({ employees, hideAmounts = false }: Props) {
  const { revealed, inScope } = useRevealSafe()
  // Employee portal keeps its own hideAmounts prop; the CMS adds the passcode lock.
  const hideMoney = hideAmounts || !revealed
  const now = new Date()
  const [year,  setYear]  = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth())
  const [employeeFilter, setEmployeeFilter] = React.useState<string>('all')
  const [websiteFilter,  setWebsiteFilter]  = React.useState<string>('all')
  const [websites, setWebsites] = React.useState<string[]>([])
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading,  setLoading]  = React.useState(true)
  const [selectedDate, setSelectedDate] = React.useState<string>(todayISO())
  const [editingId,    setEditingId]    = React.useState<string | null>(null)
  const [editDate,     setEditDate]     = React.useState<string>('')
  const [savingId,     setSavingId]     = React.useState<string | null>(null)
  const [editError,    setEditError]    = React.useState<string | null>(null)

  const monthStart = localISO(new Date(year, month, 1))
  const monthEnd   = localISO(new Date(year, month + 1, 0))

  // Load website options — refresh whenever the tab regains focus so admin
  // additions (Gift Hamper, etc.) appear without a manual reload.
  const loadWebsites = React.useCallback(() => {
    fetch('/api/booking-options', { cache: 'no-store' })
      .then(r => r.json())
      .then((opts: { type: string; label: string }[]) => {
        if (!Array.isArray(opts)) return
        setWebsites(opts.filter(o => o.type === 'website').map(o => o.label))
      })
      .catch(() => {})
  }, [])

  // Bookings fetch — bypasses HTTP cache and re-runs on focus / visibility
  // change so the calendar always reflects the latest entries.
  const loadBookings = React.useCallback(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      event_from:   monthStart,
      event_to:     monthEnd,
      with_employee:'1',
      limit:        '500',
    })
    if (employeeFilter !== 'all') params.set('employee_id', employeeFilter)
    fetch(`/api/bookings?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { if (!cancelled) setBookings(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setBookings([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [monthStart, monthEnd, employeeFilter])

  React.useEffect(() => { loadWebsites() }, [loadWebsites])
  React.useEffect(() => loadBookings(), [loadBookings])

  // Refetch when user switches back to the tab so two open windows (e.g.
  // admin entering a booking, employee viewing the calendar) stay in sync.
  React.useEffect(() => {
    function onFocus() {
      if (document.visibilityState === 'visible') {
        loadBookings()
        loadWebsites()
      }
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadBookings, loadWebsites])

  // Apply website filter client-side
  const filtered = React.useMemo(
    () => websiteFilter === 'all' ? bookings : bookings.filter(b => b.website === websiteFilter),
    [bookings, websiteFilter],
  )

  // Group bookings by event_date for fast cell lookups
  const byDate = React.useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of filtered) {
      const list = map.get(b.event_date) ?? []
      list.push(b)
      map.set(b.event_date, list)
    }
    return map
  }, [filtered])

  const cells = React.useMemo(() => buildMonthGrid(year, month), [year, month])

  // Month-level totals (after website filter)
  const totalOrders  = filtered.length
  const totalRevenue = filtered.reduce((s, b) => s + (Number(b.total_amount) || 0), 0)
  const peakDay = React.useMemo(() => {
    let max = 0; let date = ''
    for (const [d, list] of byDate) {
      if (list.length > max) { max = list.length; date = d }
    }
    return { date, count: max }
  }, [byDate])

  const selectedBookings = byDate.get(selectedDate) ?? []
  const selectedRevenue  = selectedBookings.reduce((s, b) => s + (Number(b.total_amount) || 0), 0)

  function startEdit(b: Booking) {
    setEditingId(b.id)
    setEditDate(b.event_date)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDate('')
    setEditError(null)
  }

  async function saveEdit(b: Booking) {
    if (!editDate || editDate === b.event_date) { cancelEdit(); return }
    setSavingId(b.id)
    setEditError(null)
    try {
      const r = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ event_date: editDate }),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e?.error ?? 'Update failed')
      }
      const newDate = editDate
      cancelEdit()
      loadBookings()
      // Jump to the new event date so the user sees where the booking moved
      setSelectedDate(newDate)
      const d = new Date(newDate + 'T12:00:00')
      setYear(d.getFullYear())
      setMonth(d.getMonth())
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }
  function goToday() {
    const d = new Date()
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelectedDate(todayISO())
  }

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_360px]">
      {/* ── Calendar ── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {/* Header */}
        <div className="space-y-3 border-b border-border px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Next month"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => { loadBookings(); loadWebsites() }}
              aria-label="Refresh"
              title="Refresh"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
            <div className="min-w-0 flex-1 sm:ml-2">
              <h2 className="truncate text-sm font-semibold text-ink sm:text-base">{MONTHS[month]} {year}</h2>
              <p className="truncate text-[11px] text-ink-soft sm:text-xs">
                {loading
                  ? 'Loading…'
                  : `${totalOrders} order${totalOrders !== 1 ? 's' : ''}${hideMoney ? '' : ` · ${fmtINR(totalRevenue)}`}${peakDay.count > 0 ? ` · peak ${peakDay.count} on ${new Date(peakDay.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
                }
              </p>
            </div>
            {inScope && <RevealToggle className="shrink-0" />}
            {loading && <Loader2 className="size-4 shrink-0 animate-spin text-brand" />}
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={websiteFilter}
              onChange={(e) => setWebsiteFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:border-brand focus:outline-none sm:flex-initial"
            >
              <option value="all">All websites</option>
              {websites.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:border-brand focus:outline-none sm:flex-initial"
            >
              <option value="all">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-border bg-surface-2/30">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const iso       = localISO(d)
            const inMonth   = d.getMonth() === month
            const list      = byDate.get(iso) ?? []
            const count     = list.length
            const revenue   = list.reduce((s, b) => s + (Number(b.total_amount) || 0), 0)
            const isToday   = iso === todayISO()
            const isSelected = iso === selectedDate
            const intensity = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4

            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={cn(
                  'relative flex min-h-[56px] flex-col items-stretch border-b border-r border-border p-1 text-left transition-colors sm:min-h-[88px] sm:p-1.5',
                  !inMonth && 'bg-surface-2/20 text-ink-soft/60',
                  inMonth  && 'hover:bg-surface-2/40',
                  isSelected && 'ring-2 ring-inset ring-brand/60',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={cn(
                    'inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold sm:size-6 sm:text-xs',
                    isToday    && 'bg-brand text-brand-foreground',
                    !isToday && inMonth  && 'text-ink',
                    !isToday && !inMonth && 'text-ink-soft/60',
                  )}>
                    {d.getDate()}
                  </span>
                  {count > 0 && (
                    <span className={cn(
                      'rounded px-1 py-px text-[9px] font-bold sm:rounded-md sm:px-1.5 sm:text-[10px]',
                      intensity === 1 && 'bg-brand/10 text-brand',
                      intensity === 2 && 'bg-brand/20 text-brand',
                      intensity === 3 && 'bg-brand/35 text-brand',
                      intensity === 4 && 'bg-brand text-brand-foreground',
                    )}>
                      {count}
                    </span>
                  )}
                </div>
                {count > 0 && (
                  <div className="mt-auto hidden space-y-0.5 text-[10px] sm:block">
                    <p className="truncate text-ink-muted">
                      {count} order{count !== 1 ? 's' : ''}
                    </p>
                    {!hideMoney && (
                      <p className="truncate font-medium text-ink-soft">{fmtINR(revenue)}</p>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Selected day panel ── */}
      <aside className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        <div className="border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-brand" />
            <h3 className="text-sm font-semibold text-ink">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </h3>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {selectedBookings.length === 0
              ? 'No orders scheduled'
              : `${selectedBookings.length} order${selectedBookings.length !== 1 ? 's' : ''}${hideMoney ? '' : ` · ${fmtINR(selectedRevenue)}`}`}
          </p>
        </div>

        <div className="max-h-[60vh] overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
          {selectedBookings.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <CalendarDays className="size-8 text-ink-soft/30" />
              <p className="text-sm text-ink-soft">Pick a day with orders to see details.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {selectedBookings.map((b) => {
                const total     = Number(b.total_amount) || 0
                const balance   = total - (Number(b.advance_paid) || 0)
                const isEditing = editingId === b.id
                const isSaving  = savingId === b.id
                return (
                  <li key={b.id} className="space-y-2 px-4 py-3 sm:px-5 sm:py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                          <User className="size-3.5 text-ink-soft" />
                          <span className="truncate">{b.customer_name}</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
                          <Phone className="size-3" />
                          {b.customer_phone}
                          <span className="text-ink-soft/40">·</span>
                          <MapPin className="size-3" />
                          {b.city}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                        {b.occasion}
                      </span>
                    </div>

                    {/* Event date — read-only with edit affordance, or inline editor */}
                    {isEditing ? (
                      <div className="space-y-1.5 rounded-lg border border-brand/30 bg-brand/[0.04] p-2">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5 text-brand" />
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            disabled={isSaving}
                            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(b)}
                            disabled={isSaving || !editDate}
                            aria-label="Save"
                            className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-brand-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={isSaving}
                            aria-label="Cancel"
                            className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-ink-muted hover:bg-surface-2"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        {editError && (
                          <p className="text-[10px] text-coral">{editError}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-ink-soft transition-colors hover:border-brand/40 hover:bg-brand/[0.04] hover:text-ink"
                        title="Change event date"
                      >
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          Event {new Date(b.event_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <PencilLine className="size-3 text-ink-soft/60" />
                      </button>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded-full border border-border px-2 py-0.5 text-ink-muted">
                        {b.website}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-ink-muted">
                        {b.booking_platform}
                      </span>
                      {b.employee?.full_name && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-soft">
                          by {b.employee.full_name}
                        </span>
                      )}
                    </div>

                    {!hideMoney && (
                      <div className="flex items-center justify-between rounded-lg bg-surface-2/40 px-3 py-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-ink-soft">
                          <Wallet className="size-3" /> Total
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-ink">{fmtINR(total)}</span>
                          <span className={cn('text-[10px]', balance > 0 ? 'text-coral' : 'text-emerald')}>
                            {balance > 0 ? `${fmtINR(balance)} due` : 'Paid'}
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
