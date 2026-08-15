'use client'

import * as React from 'react'
import { LogIn, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Opens an employee's dashboard as them, without needing their password.
 * Admin-only; the server re-checks the CMS session before minting anything.
 */
export function useImpersonate() {
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [error,     setError]     = React.useState<string | null>(null)

  const impersonate = React.useCallback(async (id: string, name: string) => {
    if (!window.confirm(
      `Open the employee dashboard as ${name}?\n\n` +
      `You'll be signed in as them until you press "Back to admin". ` +
      `Anything you do there is saved to their account.`,
    )) return

    setPendingId(id)
    setError(null)
    try {
      const r = await fetch(`/api/employees/${id}/impersonate`, { method: 'POST' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Could not open that dashboard')
      }
      // Full navigation so the new session cookie is picked up server-side.
      window.location.assign('/employee/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that dashboard.')
      setPendingId(null)
    }
  }, [])

  return { impersonate, pendingId, error, clearError: () => setError(null) }
}

export function ImpersonateButton({
  id, name, disabled, pending, onClick, variant = 'icon',
}: {
  id:        string
  name:      string
  disabled?: boolean
  pending:   boolean
  onClick:   (id: string, name: string) => void
  variant?:  'icon' | 'full'
}) {
  const title = disabled
    ? 'Inactive employees cannot be opened'
    : `Open dashboard as ${name}`

  if (variant === 'full') {
    return (
      <button
        type="button"
        title={title}
        disabled={disabled || pending}
        onClick={() => onClick(id, name)}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
        Log in as
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled || pending}
      onClick={() => onClick(id, name)}
      className={cn(
        'grid size-8 place-items-center rounded-lg transition-colors',
        'text-ink-muted hover:bg-surface-2 hover:text-brand',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted',
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
    </button>
  )
}
