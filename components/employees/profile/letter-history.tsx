'use client'

import * as React from 'react'
import {
  Download, FileText, Loader2, MailCheck, FileWarning, FilePen,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Letters already issued for this employee.
 *
 * The API (`GET /api/letters?employee=…`) and the download route both existed,
 * but nothing ever called them — so an issued letter was unreachable after the
 * drawer closed, even though the drawer's own success message tells you to
 * "download it from the employee's letter history". This is that history.
 */

type LetterType   = 'offer' | 'release'
type LetterStatus = 'draft' | 'sent' | 'failed'

interface Letter {
  id:             string
  type:           LetterType
  reference_no:   string | null
  subject:        string
  employee_email: string | null
  company_name:   string | null
  status:         LetterStatus
  sent_at:        string | null
  error:          string | null
  created_at:     string
}

const TYPE_LABEL: Record<LetterType, string> = {
  offer:   'Offer Letter',
  release: 'Relieving Letter',
}

const STATUS: Record<LetterStatus, { label: string; cls: string; Icon: typeof MailCheck }> = {
  sent:   { label: 'Emailed',       cls: 'bg-emerald/12 text-emerald', Icon: MailCheck },
  draft:  { label: 'Generated',     cls: 'bg-sky/12 text-sky',         Icon: FilePen },
  failed: { label: 'Send failed',   cls: 'bg-coral/12 text-coral',     Icon: FileWarning },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function LetterHistory({ employeeId }: { employeeId: string }) {
  const [letters, setLetters] = React.useState<Letter[] | null>(null)
  const [error,   setError]   = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/letters?employee=${encodeURIComponent(employeeId)}`, {
        cache: 'no-store',
      })
      if (!r.ok) {
        const b = await r.json().catch(() => null)
        throw new Error(b?.error ?? 'Could not load the letter history')
      }
      const d = await r.json()
      setLetters(d.letters ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the letter history')
      setLetters([])
    }
  }, [employeeId])

  React.useEffect(() => { load() }, [load])

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Documents issued</h2>
          <p className="text-xs text-ink-soft">Offer and relieving letters</p>
        </div>
        {letters && letters.length > 0 && (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            {letters.length}
          </span>
        )}
      </header>

      {letters === null ? (
        <p className="flex items-center gap-2 py-6 text-sm text-ink-soft">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : error ? (
        <p className="py-6 text-center text-sm text-coral">{error}</p>
      ) : letters.length === 0 ? (
        <div className="py-8 text-center">
          <FileText className="mx-auto mb-2 size-6 text-ink-soft" />
          <p className="text-sm font-medium">No documents yet</p>
          <p className="mt-1 text-xs text-ink-soft">
            Issue one from the letter icon on the employee list.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {letters.map((l) => {
            const s = STATUS[l.status] ?? STATUS.draft
            return (
              <li key={l.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-soft">
                  <FileText className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{TYPE_LABEL[l.type] ?? l.type}</span>
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', s.cls)}>
                      <s.Icon className="size-3" /> {s.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">{l.subject}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-soft">
                    {l.reference_no && <span className="font-mono">{l.reference_no}</span>}
                    <span>{fmtDate(l.created_at)}</span>
                    {l.company_name && <span>{l.company_name}</span>}
                    {l.status === 'sent' && l.employee_email && <span>to {l.employee_email}</span>}
                  </div>
                  {/* A failed send still produced a PDF — say why it didn't go out. */}
                  {l.status === 'failed' && l.error && (
                    <p className="mt-1 text-[11px] text-coral">{l.error}</p>
                  )}
                </div>

                <a
                  href={`/api/letters/${l.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                  title="Download the PDF"
                >
                  <Download className="size-3.5" />
                  PDF
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
