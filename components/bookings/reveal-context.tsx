'use client'

import * as React from 'react'

/**
 * Whether money figures are currently unlocked on the bookings screens.
 *
 * Locked is the default on every page load. The unlock is kept in
 * sessionStorage so it carries across Analysis / Calendar / All Entries while
 * the tab is open, and is gone when the tab closes — closing the browser
 * should re-lock, otherwise "masked by default" quietly stops being true.
 *
 * The stored value is only a UI flag, never the passcode: the passcode is
 * checked by /api/finance/reveal and never reaches the browser.
 */

const STORAGE_KEY = 'workly.finance.revealed'

interface RevealState {
  revealed: boolean
  busy:     boolean
  error:    string | null
  unlock:   (passcode: string) => Promise<boolean>
  lock:     () => void
  clearError: () => void
}

const Ctx = React.createContext<RevealState | null>(null)

export function RevealProvider({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false)
  const [busy, setBusy]         = React.useState(false)
  const [error, setError]       = React.useState<string | null>(null)

  // Read after mount, not during render: sessionStorage does not exist on the
  // server, and seeding state from it directly would be a hydration mismatch.
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') setRevealed(true)
    } catch {
      // Private mode or blocked storage — stay locked, which is the safe side.
    }
  }, [])

  const unlock = React.useCallback(async (passcode: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/reveal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ passcode }),
        cache:   'no-store',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? 'Could not verify the passcode')
        return false
      }
      setRevealed(true)
      try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}
      return true
    } catch {
      setError('Network error — could not verify the passcode')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const lock = React.useCallback(() => {
    setRevealed(false)
    setError(null)
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  const clearError = React.useCallback(() => setError(null), [])

  const value = React.useMemo(
    () => ({ revealed, busy, error, unlock, lock, clearError }),
    [revealed, busy, error, unlock, lock, clearError],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useReveal(): RevealState {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('useReveal must be used inside <RevealProvider>')
  return ctx
}

/**
 * For components rendered both inside and outside the bookings section.
 * The calendar is shared with the employee portal, which has no provider —
 * there it reports `revealed: true` so nothing changes, and the portal keeps
 * hiding amounts through its own `hideAmounts` prop as before.
 * `inScope` tells a component whether the unlock control belongs on the page.
 */
export function useRevealSafe(): { revealed: boolean; inScope: boolean } {
  const ctx = React.useContext(Ctx)
  return { revealed: ctx ? ctx.revealed : true, inScope: ctx !== null }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** The mask. Fixed width so unlocking doesn't reflow the table. */
export const MASK = '••••••'

export function formatINR(n: number): string {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

/**
 * Render a rupee figure, masked unless unlocked.
 * `plain` drops the ₹ prefix for cells that render it separately.
 */
export function Money({ value, plain = false }: { value: number; plain?: boolean }) {
  const { revealed } = useReveal()
  if (!revealed) return <span className="select-none tracking-wider text-ink-soft">{MASK}</span>
  return <>{plain ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value) : formatINR(value)}</>
}

/** Same rule for strings built outside JSX (CSV cells, chart tooltips, labels). */
export function maskedINR(value: number, revealed: boolean): string {
  return revealed ? formatINR(value) : MASK
}
