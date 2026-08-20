'use client'

import * as React from 'react'
import { Eye, EyeOff, Lock, X } from 'lucide-react'

import { useReveal } from './reveal-context'
import { cn } from '@/lib/utils'

/**
 * Lock / unlock control for the money figures. Sits in the header of each
 * bookings screen. Unlocking on one screen unlocks all three for the tab.
 */
export function RevealToggle({ className }: { className?: string }) {
  const { revealed, busy, error, unlock, lock, clearError } = useReveal()
  const [open, setOpen] = React.useState(false)
  const [code, setCode] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setCode('')
    clearError()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    const okNow = await unlock(code.trim())
    if (okNow) close()
  }

  if (revealed) {
    return (
      <button
        type="button"
        onClick={lock}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5',
          'text-xs font-medium text-ink-muted transition hover:text-ink',
          className,
        )}
        title="Hide amounts again"
      >
        <EyeOff className="size-3.5" />
        Hide amounts
      </button>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5',
          'text-xs font-medium text-ink-muted transition hover:text-ink',
        )}
        title="Enter the passcode to show amounts"
      >
        <Eye className="size-3.5" />
        Show amounts
      </button>

      {open && (
        <>
          {/* Click-away layer. Keeps the popover from being trapped open. */}
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <form
            onSubmit={submit}
            className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-pop"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Lock className="size-3.5" />
                Passcode
              </span>
              <button
                type="button"
                onClick={close}
                className="text-ink-soft transition hover:text-ink"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(e) => { setCode(e.target.value); if (error) clearError() }}
              placeholder="Enter passcode"
              className={cn(
                'w-full rounded-lg border bg-surface-2 px-2.5 py-1.5 text-sm outline-none',
                'focus:border-violet',
                error ? 'border-coral' : 'border-border',
              )}
            />

            {error && <p className="mt-1.5 text-[11px] text-coral">{error}</p>}

            <button
              type="submit"
              disabled={busy || !code.trim()}
              className={cn(
                'mt-2 w-full rounded-lg bg-violet px-3 py-1.5 text-xs font-semibold text-white',
                'transition disabled:opacity-50',
              )}
            >
              {busy ? 'Checking…' : 'Show amounts'}
            </button>

            <p className="mt-2 text-[10px] leading-snug text-ink-soft">
              Stays unlocked in this tab only. Closing the browser re-hides them.
            </p>
          </form>
        </>
      )}
    </div>
  )
}
