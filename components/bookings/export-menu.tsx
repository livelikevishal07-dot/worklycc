'use client'

import * as React from 'react'
import { Check, ChevronDown, Download, Loader2, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useReveal } from './reveal-context'

/**
 * CSV download for bookings.
 *
 * Two different things people want, kept in one menu so there is one obvious
 * place to download from:
 *  - the view they are looking at, with their filters applied (built here from
 *    rows already loaded)
 *  - a whole date range, regardless of the current view (built on the server,
 *    because six months is thousands of rows)
 *
 * Amounts follow the on-screen lock: masked in the export while masked on
 * screen, or the lock would be one click away from being pointless.
 */

/** The fields the export writes. Structural, so the page's own richer Booking
 *  type satisfies it without either side importing the other. */
export interface ExportableBooking {
  order_date:       string
  customer_name:    string
  customer_phone:   string
  city:             string
  event_date:       string
  website:          string
  occasion:         string
  booking_platform: string
  total_amount:     number
  advance_paid:     number
  employee?:        { full_name: string } | null
}

export interface CurrentViewExport {
  /** Rows currently visible after filters, already in display order. */
  rows: ExportableBooking[]
  filename: string
}

type Preset = { key: string; label: string; months?: number; lastMonth?: boolean }

const PRESETS: Preset[] = [
  { key: 'last-month', label: 'Last month',    lastMonth: true },
  { key: '3m',         label: 'Last 3 months', months: 3 },
  { key: '6m',         label: 'Last 6 months', months: 6 },
]

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Resolve a preset to an inclusive from/to pair. */
function rangeFor(p: Preset): { from: string; to: string } {
  const now = new Date()
  if (p.lastMonth) {
    // The previous calendar month, not "the last 30 days" — when someone says
    // "last month" for a booking report they mean August, all of it.
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: iso(first), to: iso(last) }
  }
  const start = new Date(now.getFullYear(), now.getMonth() - (p.months ?? 3), now.getDate())
  return { from: iso(start), to: iso(now) }
}

export function ExportMenu({ currentView }: { currentView: CurrentViewExport }) {
  const { revealed } = useReveal()
  const [open, setOpen]       = React.useState(false)
  const [busy, setBusy]       = React.useState<string | null>(null)
  const [custom, setCustom]   = React.useState(false)
  const [cFrom, setCFrom]     = React.useState('')
  const [cTo, setCTo]         = React.useState('')
  const [error, setError]     = React.useState<string | null>(null)

  function close() {
    setOpen(false); setCustom(false); setError(null)
  }

  /** Server-side range export. */
  async function downloadRange(from: string, to: string, key: string) {
    setBusy(key)
    setError(null)
    try {
      const sp = new URLSearchParams({ from, to })
      if (revealed) sp.set('amounts', '1')
      const res = await fetch(`/api/exports/bookings?${sp}`, { cache: 'no-store' })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error ?? 'Could not build the export')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `bookings-${from}-to-${to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      close()
    } catch {
      setError('Network error — could not download')
    } finally {
      setBusy(null)
    }
  }

  /** The filtered view, built from rows already in the page. */
  function downloadCurrentView() {
    const headers = [
      'Order Date', 'Customer', 'Phone', 'City', 'Event Date',
      'Website', 'Occasion', 'Platform',
      ...(revealed ? ['Total', 'Advance', 'Pending'] : []),
      'Employee',
    ]
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [headers.map(cell).join(',')]
    for (const r of currentView.rows) {
      lines.push([
        r.order_date, r.customer_name, r.customer_phone, r.city, r.event_date,
        r.website, r.occasion, r.booking_platform,
        ...(revealed ? [r.total_amount, r.advance_paid, r.total_amount - r.advance_paid] : []),
        r.employee?.full_name ?? '',
      ].map(cell).join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = currentView.filename
    a.click()
    URL.revokeObjectURL(url)
    close()
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
      >
        <Download className="size-4" />
        Download CSV
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-surface p-2 shadow-pop">
            {!custom ? (
              <>
                <MenuItem
                  label="Current view"
                  hint={`${currentView.rows.length} row${currentView.rows.length === 1 ? '' : 's'} · filters applied`}
                  onClick={downloadCurrentView}
                />

                <div className="my-1 border-t border-border" />

                {PRESETS.map((p) => {
                  const { from, to } = rangeFor(p)
                  return (
                    <MenuItem
                      key={p.key}
                      label={p.label}
                      hint={`${from} → ${to}`}
                      busy={busy === p.key}
                      onClick={() => downloadRange(from, to, p.key)}
                    />
                  )
                })}

                <div className="my-1 border-t border-border" />

                <MenuItem label="Custom range…" onClick={() => { setCustom(true); setError(null) }} />
              </>
            ) : (
              <div className="p-1.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Custom range</span>
                  <button onClick={() => setCustom(false)} className="text-ink-soft hover:text-ink" aria-label="Back">
                    <X className="size-3.5" />
                  </button>
                </div>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[11px] text-ink-muted">From</span>
                  <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm outline-none focus:border-brand" />
                </label>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[11px] text-ink-muted">To</span>
                  <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface-2 px-2.5 text-sm outline-none focus:border-brand" />
                </label>
                <button
                  disabled={!cFrom || !cTo || cFrom > cTo || busy !== null}
                  onClick={() => downloadRange(cFrom, cTo, 'custom')}
                  className="w-full rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                >
                  {busy === 'custom' ? 'Preparing…' : 'Download'}
                </button>
                {cFrom && cTo && cFrom > cTo && (
                  <p className="mt-1.5 text-[11px] text-coral">From date is after the to date.</p>
                )}
              </div>
            )}

            {error && <p className="px-2 pb-1 pt-2 text-[11px] text-coral">{error}</p>}

            {!revealed && (
              <p className="mt-1 rounded-lg bg-surface-2/60 px-2 py-1.5 text-[10px] leading-snug text-ink-soft">
                Amounts are hidden, so the file will omit them. Unlock amounts first to include
                totals, advance and pending.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  label, hint, onClick, busy,
}: {
  label: string; hint?: string; onClick: () => void; busy?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink-soft">{hint}</span>}
      </span>
      {busy
        ? <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-soft" />
        : <Check className="size-3.5 shrink-0 opacity-0" />}
    </button>
  )
}
