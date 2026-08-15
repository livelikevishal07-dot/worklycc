'use client'

import * as React from 'react'
import { Eye, Loader2, LogOut } from 'lucide-react'

/**
 * Persistent reminder that this dashboard is being viewed by an admin rather
 * than the employee themselves — anything done here is recorded against their
 * account, so it should never be ambiguous.
 */
export function ImpersonationBanner({ employeeName }: { employeeName: string }) {
  const [leaving, setLeaving] = React.useState(false)

  async function exit() {
    setLeaving(true)
    try {
      await fetch('/api/employee-auth/impersonate/exit', { method: 'POST' })
    } finally {
      // Full reload so the server drops the employee session from every cache.
      window.location.replace('/cms/employees')
    }
  }

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-amber px-4 py-2 text-center text-[13px] font-medium text-[#3b2a00] shadow-sm">
      <span className="inline-flex items-center gap-1.5">
        <Eye className="size-4 shrink-0" />
        Viewing as <span className="font-bold">{employeeName}</span> — actions here are saved to their account.
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b2a00]/85 px-3 py-1 text-[12px] font-semibold text-amber transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {leaving ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
        Back to admin
      </button>
    </div>
  )
}
