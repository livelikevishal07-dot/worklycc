'use client'

import * as React from 'react'
import {
  CheckCircle2, Download, FileText, Loader2, Mail, Send, TriangleAlert, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export type LetterType = 'offer' | 'release'

const LABEL: Record<LetterType, string> = {
  offer:   'Offer Letter',
  release: 'Relieving Letter',
}

interface Mailbox { id: string; address: string }

interface DraftDoc {
  referenceNo: string
  subject:     string
  salutation:  string
  paragraphs:  string[]
  closing:     string
}

interface DraftResponse {
  doc:       DraftDoc
  blockers:  string[]
  warnings:  string[]
  employee:  { id: string; full_name: string; email: string | null; designation: string | null }
  company:   { id: string; name: string }
  mailboxes: Mailbox[]
}

export interface LetterTarget {
  id:        string
  full_name: string
}

interface Props {
  open:     boolean
  employee: LetterTarget | null
  onClose:  () => void
}

const inputClass =
  'h-10 w-full rounded-xl border border-border bg-surface-2/50 px-3 text-sm outline-none placeholder:text-ink-soft focus:border-brand/50 focus:ring-2 focus:ring-brand/20'

export function LetterDrawer({ open, employee, onClose }: Props) {
  const [type, setType] = React.useState<LetterType>('offer')

  const [loading, setLoading] = React.useState(false)
  const [draft,   setDraft]   = React.useState<DraftResponse | null>(null)
  const [error,   setError]   = React.useState<string | null>(null)
  const [done,    setDone]    = React.useState<string | null>(null)

  // Editable fields
  const [referenceNo, setReferenceNo] = React.useState('')
  const [subject,     setSubject]     = React.useState('')
  const [bodyText,    setBodyText]    = React.useState('')

  // Overrides that change the generated wording
  const [designation,     setDesignation]     = React.useState('')
  const [monthlySalary,   setMonthlySalary]   = React.useState('')
  const [joiningDate,     setJoiningDate]     = React.useState('')
  const [lastWorkingDate, setLastWorkingDate] = React.useState('')

  const [fromAccountId, setFromAccountId] = React.useState('')
  const [toField,       setToField]       = React.useState('')
  const [cc,            setCc]            = React.useState('')
  const [busy,          setBusy]          = React.useState<'preview' | 'send' | 'save' | null>(null)

  /** Ask the server to compose a draft from employee + company data. */
  const buildDraft = React.useCallback(async (t: LetterType) => {
    if (!employee) return
    setLoading(true)
    setError(null)
    setDone(null)
    try {
      const r = await fetch('/api/letters/draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          type: t,
          overrides: {
            ...(designation.trim()   ? { designation: designation.trim() } : {}),
            ...(monthlySalary.trim() ? { monthlySalary: Number(monthlySalary) } : {}),
            ...(joiningDate          ? { joiningDate } : {}),
            ...(lastWorkingDate      ? { lastWorkingDate } : {}),
          },
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Could not build the letter')

      const data = d as DraftResponse
      setDraft(data)
      setReferenceNo(data.doc.referenceNo)
      setSubject(data.doc.subject)
      setBodyText(data.doc.paragraphs.join('\n\n'))
      setFromAccountId((prev) => prev || data.mailboxes[0]?.id || '')
      setToField((prev) => prev || data.employee.email || '')
      if (!designation && data.employee.designation) setDesignation(data.employee.designation)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the letter.')
      setDraft(null)
    } finally {
      setLoading(false)
    }
    // Overrides are applied on an explicit Regenerate, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee])

  // Compose a fresh draft whenever the drawer opens or the letter type changes.
  React.useEffect(() => {
    if (!open || !employee) return
    setDone(null)
    buildDraft(type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee, type])

  // Reset per-employee state when the drawer closes.
  React.useEffect(() => {
    if (open) return
    setDraft(null); setError(null); setDone(null)
    setDesignation(''); setMonthlySalary(''); setJoiningDate(''); setLastWorkingDate('')
    setCc(''); setToField(''); setType('offer')
  }, [open])

  function payload() {
    return {
      employeeId: employee!.id,
      type,
      referenceNo,
      subject,
      bodyText,
      salutation: draft?.doc.salutation,
      closing:    draft?.doc.closing,
    }
  }

  async function previewPdf() {
    setBusy('preview')
    setError(null)
    try {
      const r = await fetch('/api/letters/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Could not render the preview')
      }
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      // Give the new tab time to load before releasing the object URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not render the preview.')
    } finally {
      setBusy(null)
    }
  }

  async function submit(sendEmail: boolean) {
    if (sendEmail && !window.confirm(
      `Email this ${LABEL[type].toLowerCase()} to ${toField}?\n\n` +
      `It will be sent from ${draft?.mailboxes.find((m) => m.id === fromAccountId)?.address ?? 'your mailbox'} ` +
      `with the signed PDF attached.`,
    )) return

    setBusy(sendEmail ? 'send' : 'save')
    setError(null)
    setDone(null)
    try {
      const r = await fetch('/api/letters/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload(),
          sendEmail,
          fromAccountId: fromAccountId || undefined,
          to: toField,
          cc,
          overrides: {
            ...(designation.trim()   ? { designation: designation.trim() } : {}),
            ...(monthlySalary.trim() ? { monthlySalary: Number(monthlySalary) } : {}),
            ...(joiningDate          ? { joiningDate } : {}),
            ...(lastWorkingDate      ? { lastWorkingDate } : {}),
          },
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Something went wrong')
      setDone(sendEmail
        ? `${LABEL[type]} emailed to ${d.to}.`
        : `${LABEL[type]} generated and saved. Download it from the employee's letter history.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  if (!open || !employee) return null

  const blockers   = draft?.blockers ?? []
  const isReady    = blockers.length === 0
  const canSend    = isReady && Boolean(toField.trim()) && (draft?.mailboxes.length ?? 0) > 0

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Issue a letter</h2>
            <p className="truncate text-xs text-ink-soft">
              {employee.full_name}
              {draft?.company ? ` · ${draft.company.name}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Type */}
          <div className="flex gap-2">
            {(['offer', 'release'] as LetterType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                  type === t
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border text-ink-muted hover:bg-surface-2',
                )}
              >
                <FileText className="size-4" />
                {LABEL[t]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Composing the letter…
            </div>
          ) : !draft ? (
            error ? (
              <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>
            ) : null
          ) : (
            <>
              {/* Blockers — the letter cannot be issued until these are fixed */}
              {blockers.length > 0 && (
                <div className="rounded-xl border border-coral/30 bg-coral/5 px-4 py-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-coral">
                    <TriangleAlert className="size-4" /> Complete these before issuing
                  </p>
                  <ul className="ml-5 list-disc space-y-0.5 text-[12px] text-coral/90">
                    {blockers.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-coral/80">
                    Fill the fields below and press <span className="font-semibold">Regenerate wording</span>.
                  </p>
                </div>
              )}

              {/* Warnings */}
              {draft.warnings.length > 0 && (
                <div className="rounded-xl border border-amber/30 bg-amber/5 px-4 py-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-amber">
                    <TriangleAlert className="size-4" /> Before you send
                  </p>
                  <ul className="ml-5 list-disc space-y-0.5 text-[12px] text-amber/90">
                    {draft.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Details that change the wording */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Designation</span>
                  <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Executive" className={inputClass} />
                </label>
                {type === 'offer' ? (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Monthly salary (₹)</span>
                      <input value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} inputMode="numeric" placeholder="From the employee record" className={inputClass} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Date of joining</span>
                      <input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className={inputClass} />
                    </label>
                  </>
                ) : (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Last working date</span>
                    <input type="date" value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)} className={inputClass} />
                  </label>
                )}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => buildDraft(type)}
                    className="h-10 w-full rounded-xl border border-border text-sm font-medium text-ink-muted hover:bg-surface-2"
                  >
                    Regenerate wording
                  </button>
                </div>
              </div>

              {/* Reference + subject */}
              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Reference no.</span>
                  <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Subject</span>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
                </label>
              </div>

              {/* Body */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
                  Letter body <span className="font-normal text-ink-soft">— blank line between paragraphs</span>
                </span>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={14}
                  className="w-full resize-y rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
                />
                <span className="mt-1 block text-[11px] text-ink-soft">
                  The letterhead, date, salutation and signature are added automatically from{' '}
                  {draft.company.name}&apos;s settings.
                </span>
              </label>

              {/* Delivery */}
              <div className="space-y-3 rounded-xl border border-border bg-surface-2/30 p-4">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Mail className="size-4 text-ink-soft" /> Delivery
                </p>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    Send to <span className="font-normal text-ink-soft">— comma separated for more than one</span>
                  </span>
                  <input
                    value={toField}
                    onChange={(e) => setToField(e.target.value)}
                    placeholder="employee@example.com, personal@gmail.com"
                    className={inputClass}
                  />
                  {!draft.employee.email && (
                    <span className="mt-1 block text-[11px] text-amber">
                      No email on this employee&apos;s record — type one here, or generate the PDF without sending.
                    </span>
                  )}
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-ink-muted">Send from</span>
                    <select
                      value={fromAccountId}
                      onChange={(e) => setFromAccountId(e.target.value)}
                      disabled={draft.mailboxes.length === 0}
                      className={inputClass}
                    >
                      {draft.mailboxes.length === 0 && <option value="">No mailbox connected</option>}
                      {draft.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.address}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-ink-muted">
                      Cc <span className="font-normal text-ink-soft">(optional)</span>
                    </span>
                    <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="hr@company.com" className={inputClass} />
                  </label>
                </div>
              </div>

              {done && (
                <div className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3 text-sm text-emerald">
                  <p className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {done}
                  </p>
                  <p className="mt-1 pl-6 text-[11px] text-emerald/80">
                    You can change the details and send again — each issue is recorded separately.
                  </p>
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {draft && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
            <button
              type="button"
              onClick={previewPdf}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
            >
              {busy === 'preview' ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Preview PDF
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy !== null || !isReady}
              title={isReady ? undefined : 'Complete the required details first'}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Generate without sending
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={busy !== null || !canSend}
              title={
                !isReady ? 'Complete the required details first'
                  : !toField.trim() ? 'Add at least one recipient'
                  : (draft?.mailboxes.length ?? 0) === 0 ? 'Connect a mailbox under Email → Mailboxes'
                  : undefined
              }
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'send' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {busy === 'send' ? 'Sending…' : 'Send to employee'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
