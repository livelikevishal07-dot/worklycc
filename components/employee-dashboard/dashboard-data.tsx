'use client'

import * as React from 'react'

/**
 * One fetch of /api/employee/dashboard, shared by every card on the page.
 *
 * Each card used to fetch for itself — about fourteen requests, several of them
 * duplicating each other (leave entitlements twice, the month's attendance
 * twice, announcements twice). On a phone that is fourteen round trips before
 * the page settles.
 *
 * Cards read their slice from here. Anything that mutates (punching in, ticking
 * a task) calls refresh() so the whole page reflects the change at once, rather
 * than each card re-fetching its own corner and drifting out of step.
 */

export interface DashboardBundle {
  generatedAt: string
  today:       string
  ranges:      { attFrom: string; weekStart: string; monthStart: string }
  taskStats:   any
  tasks:       any[]
  attendance:  any[]
  leave:       { balances: any[]; requests: any[] }
  announcements: any[]
  holidays:    any[]
  recurring:   any[]
  eotm:        any
  leaderboard: any[]
}

interface Ctx {
  data:    DashboardBundle | null
  loading: boolean
  /** Null until the first successful load; set when the fetch itself failed. */
  error:   string | null
  refresh: () => Promise<void>
}

const DashboardCtx = React.createContext<Ctx | null>(null)

/** Cards that can also appear outside the dashboard fall back to their own
 *  fetch when this returns null, rather than throwing. */
export function useDashboardDataOptional(): Ctx | null {
  return React.useContext(DashboardCtx)
}

export function useDashboardData(): Ctx {
  const ctx = React.useContext(DashboardCtx)
  if (!ctx) throw new Error('useDashboardData must be used inside <DashboardDataProvider>')
  return ctx
}

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData]       = React.useState<DashboardBundle | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch('/api/employee/dashboard', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
      setError(null)
    } catch (e) {
      // Keep whatever was already on screen — a failed refresh should not blank
      // a dashboard someone is reading.
      setError(e instanceof Error ? e.message : 'Could not refresh')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()

    // Poll while the tab is in front only. The old per-card polls kept running
    // in background tabs.
    let id: ReturnType<typeof setInterval> | undefined
    const stop  = () => { if (id) clearInterval(id); id = undefined }
    const start = () => { stop(); id = setInterval(refresh, 60_000) }
    const onVisibility = () => {
      if (document.hidden) { stop(); return }
      refresh(); start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [refresh])

  const value = React.useMemo(
    () => ({ data, loading, error, refresh }),
    [data, loading, error, refresh],
  )

  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>
}

// ── Slice helpers ─────────────────────────────────────────────────────────────
// The bundle carries one attendance range covering today, this week and this
// month; cards take the slice they render rather than each asking the server
// for an overlapping window.

export function attendanceBetween(rows: any[], from: string, to: string): any[] {
  return rows.filter((r) => r.date >= from && r.date <= to)
}
