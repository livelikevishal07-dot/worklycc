'use client'

import * as React from 'react'
import {
  CheckCircle2, FileText, Image as ImageIcon, Loader2, Lock, Upload, X,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Public onboarding form. Rendered for anyone holding the invite link, with no
 * login — so it must stand on its own: clear sections, plain language, and
 * validation messages a non-technical person can act on.
 */

type DocKind = 'photo' | 'aadhaar' | 'letter'

interface FormState {
  open:             boolean
  reason?:          string
  alreadySubmitted: boolean
  company:          { name: string } | null
  prefill:          Record<string, string>
  uploaded:         Record<DocKind, boolean>
}

const FIELD =
  'h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none placeholder:text-ink-soft focus:border-brand focus:ring-2 focus:ring-brand/20'

export function KycForm({ token }: { token: string }) {
  const [state,   setState]   = React.useState<FormState | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving,  setSaving]  = React.useState(false)
  const [done,    setDone]    = React.useState(false)
  const [error,   setError]   = React.useState<string | null>(null)

  const [f, setF] = React.useState<Record<string, string>>({})
  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }))

  const [uploaded, setUploaded] = React.useState<Record<DocKind, boolean>>({
    photo: false, aadhaar: false, letter: false,
  })
  const [letterKind, setLetterKind] = React.useState<'offer' | 'release'>('offer')

  React.useEffect(() => {
    fetch(`/api/kyc/form/${token}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d as { error?: string }).error ?? 'This form link is not valid.')
        return d as FormState
      })
      .then((d) => {
        setState(d)
        setF(d.prefill ?? {})
        setUploaded(d.uploaded)
        if (d.alreadySubmitted) setDone(true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this form.'))
      .finally(() => setLoading(false))
  }, [token])

  async function upload(kind: DocKind, file: File) {
    setError(null)
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    if (kind === 'letter') form.append('letterKind', letterKind)

    const r = await fetch(`/api/kyc/form/${token}/upload`, { method: 'POST', body: form })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Upload failed')
    setUploaded((prev) => ({ ...prev, [kind]: true }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/kyc/form/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(f),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        const zod = (d as { details?: { fieldErrors?: Record<string, string[]> } }).details?.fieldErrors
        const first = zod ? Object.values(zod).flat()[0] : undefined
        throw new Error(first ?? (d as { error?: string }).error ?? 'Could not submit the form')
      }
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the form.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-muted">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (error && !state) return <Centered title="Link not valid">{error}</Centered>
  if (state && !state.open && !done) {
    return <Centered title="Form closed">{state.reason ?? 'This form is no longer accepting responses.'}</Centered>
  }
  if (done) {
    return (
      <Centered title="Thank you — we have your details" tone="success">
        Your onboarding form has been submitted{state?.company ? ` to ${state.company.name}` : ''}.
        Someone will be in touch shortly. You can close this page.
      </Centered>
    )
  }

  const brand = state?.company?.name ?? 'Workly'

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <header className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="h-2 bg-brand" />
        <div className="p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Employee onboarding</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Welcome to {brand}. Please fill in your details and upload the documents below.
            It takes about three minutes.
          </p>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-soft">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Your information is sent securely and is visible only to the {brand} admin team.
          </p>
        </div>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <Section title="Your details" required>
          <Field label="Full name" required>
            <input value={f.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} required placeholder="As it appears on your Aadhaar" className={FIELD} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email address" required>
              <input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} required placeholder="you@example.com" className={FIELD} />
            </Field>
            <Field label="Phone number" required>
              <input type="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} required placeholder="+91 98765 43210" className={FIELD} />
            </Field>
            <Field label="Alternate phone">
              <input type="tel" value={f.alt_phone ?? ''} onChange={(e) => set('alt_phone', e.target.value)} className={FIELD} />
            </Field>
            <Field label="Date of birth">
              <input type="date" value={f.date_of_birth ?? ''} onChange={(e) => set('date_of_birth', e.target.value)} className={FIELD} />
            </Field>
          </div>
        </Section>

        <Section title="Address" required>
          <Field label="Street address" required>
            <textarea
              value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} required rows={2}
              placeholder="House / flat, street, area"
              className="w-full rounded-xl border border-border bg-surface p-3 text-[15px] outline-none placeholder:text-ink-soft focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City"><input value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} className={FIELD} /></Field>
            <Field label="State"><input value={f.state ?? ''} onChange={(e) => set('state', e.target.value)} className={FIELD} /></Field>
            <Field label="PIN code"><input value={f.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} inputMode="numeric" className={FIELD} /></Field>
          </div>
        </Section>

        <Section title="Aadhaar">
          <Field label="Aadhaar number" hint="12 digits. Stored encrypted — only the last 4 digits are shown in our system.">
            <input
              value={f.aadhaarNumber ?? ''} onChange={(e) => set('aadhaarNumber', e.target.value)}
              inputMode="numeric" placeholder="1234 5678 9012" maxLength={14} className={FIELD}
            />
          </Field>
        </Section>

        <Section title="Emergency contact">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name"><input value={f.emergency_name ?? ''} onChange={(e) => set('emergency_name', e.target.value)} className={FIELD} /></Field>
            <Field label="Phone"><input type="tel" value={f.emergency_phone ?? ''} onChange={(e) => set('emergency_phone', e.target.value)} className={FIELD} /></Field>
            <Field label="Relationship"><input value={f.emergency_relation ?? ''} onChange={(e) => set('emergency_relation', e.target.value)} placeholder="e.g. Father" className={FIELD} /></Field>
          </div>
        </Section>

        <Section title="Role">
          <Field label="Position you are joining as" hint="If you are not sure, leave this blank.">
            <input value={f.designation ?? ''} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Sales Executive" className={FIELD} />
          </Field>
        </Section>

        <Section title="Documents" required>
          <UploadRow
            kind="photo" label="Passport-size photo" required accept="image/*"
            hint="A clear head-and-shoulders photo. JPG or PNG, up to 8 MB."
            icon={ImageIcon} uploaded={uploaded.photo} onUpload={upload} onError={setError}
          />
          <UploadRow
            kind="aadhaar" label="Aadhaar card" required accept="image/*,application/pdf"
            hint="Photo or scan of your Aadhaar card. Image or PDF, up to 8 MB."
            icon={FileText} uploaded={uploaded.aadhaar} onUpload={upload} onError={setError}
          />

          <div className="rounded-xl border border-border bg-surface-2/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold">Offer or relieving letter</span>
              <span className="text-[11px] text-ink-soft">Optional</span>
              <div className="ml-auto flex gap-1.5">
                {(['offer', 'release'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLetterKind(k)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      letterKind === k ? 'border-brand/30 bg-brand/10 text-brand' : 'border-border text-ink-muted hover:bg-surface-2',
                    )}
                  >
                    {k === 'offer' ? 'Offer letter' : 'Relieving letter'}
                  </button>
                ))}
              </div>
            </div>
            <UploadRow
              kind="letter" label={letterKind === 'offer' ? 'Offer letter' : 'Relieving letter'}
              accept="image/*,application/pdf" bare
              hint="From your previous or current employer. Image or PDF, up to 8 MB."
              icon={FileText} uploaded={uploaded.letter} onUpload={upload} onError={setError}
            />
          </div>
        </Section>

        {error && (
          <div className="rounded-xl border border-coral/30 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>
        )}

        <div className="flex flex-wrap items-center gap-3 pb-10">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-7 text-[15px] font-medium text-brand-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? 'Submitting…' : 'Submit form'}
          </button>
          <span className="text-[12px] text-ink-soft">
            The photo and Aadhaar card are required.
          </span>
        </div>
      </form>
    </main>
  )
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function Centered({ title, children, tone = 'neutral' }: {
  title: string; children: React.ReactNode; tone?: 'neutral' | 'success'
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-4">
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className={cn('h-2', tone === 'success' ? 'bg-emerald' : 'bg-brand')} />
        <div className="p-8 text-center">
          {tone === 'success' && (
            <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald" />
          )}
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</p>
        </div>
      </div>
    </main>
  )
}

function Section({ title, required, children }: {
  title: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 className="text-[15px] font-semibold">
        {title}
        {required && <span className="ml-1 text-coral">*</span>}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}{required && <span className="ml-0.5 text-coral">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-soft">{hint}</span>}
    </label>
  )
}

function UploadRow({
  kind, label, hint, accept, required, uploaded, icon: Icon, onUpload, onError, bare,
}: {
  kind:     DocKind
  label:    string
  hint:     string
  accept:   string
  required?: boolean
  uploaded: boolean
  icon:     React.ElementType
  onUpload: (kind: DocKind, file: File) => Promise<void>
  onError:  (msg: string) => void
  bare?:    boolean
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState<string | null>(null)

  async function handle(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      await onUpload(kind, file)
      setName(file.name)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className={cn(!bare && 'rounded-xl border border-border bg-surface-2/30 p-4')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          uploaded ? 'bg-emerald/10 text-emerald' : 'bg-surface-2 text-ink-soft',
        )}>
          {uploaded ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">
            {label}{required && <span className="ml-0.5 text-coral">*</span>}
          </p>
          <p className="text-[11px] text-ink-soft">
            {uploaded ? (name ? `Uploaded — ${name}` : 'Uploaded') : hint}
          </p>
        </div>

        <input ref={ref} type="file" accept={accept} className="hidden"
               onChange={(e) => handle(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-4 text-[13px] font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploaded ? 'Replace' : 'Upload'}
        </button>
      </div>
    </div>
  )
}
