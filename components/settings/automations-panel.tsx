'use client'

import * as React from 'react'
import {
  Cake, Clock, Loader2, PartyPopper, Play, TriangleAlert, Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type Kind = 'birthday' | 'work_anniversary' | 'late_arrival' | 'task_overdue'

interface Setting {
  kind:       Kind
  enabled:    boolean
  send_email: boolean
  send_push:  boolean
  config:     Record<string, unknown>
}

interface LogRow {
  id: string; kind: string; ref_date: string; status: string
  channel: string | null; detail: string | null; created_at: string
}

const META: Record<Kind, { label: string; blurb: string; icon: React.ElementType; tone: string }> = {
  birthday: {
    label: 'Birthday wishes',
    blurb: 'Sends a greeting on the employee’s birthday.',
    icon: Cake, tone: 'bg-amber/15 text-amber',
  },
  work_anniversary: {
    label: 'Work anniversary',
    blurb: 'Congratulates them on each completed year, starting at one.',
    icon: PartyPopper, tone: 'bg-emerald/10 text-emerald',
  },
  late_arrival: {
    label: 'Late arrival nudge',
    blurb: 'Reminds anyone who hasn’t clocked in by their start time. Working days only.',
    icon: Clock, tone: 'bg-coral/10 text-coral',
  },
  task_overdue: {
    label: 'Overdue task reminder',
    blurb: 'One digest per person listing their tasks past deadline.',
    icon: TriangleAlert, tone: 'bg-violet/10 text-violet',
  },
}

const ORDER: Kind[] = ['birthday', 'work_anniversary', 'late_arrival', 'task_overdue']

export function AutomationsPanel() {
  const [settings, setSettings] = React.useState<Setting[]>([])
  const [log,      setLog]      = React.useState<LogRow[]>([])
  const [loading,  setLoading]  = React.useState(true)
  const [busy,     setBusy]     = React.useState<string | null>(null)
  const [error,    setError]    = React.useState<string | null>(null)
  const [result,   setResult]   = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/automations', { cache: 'no-store' })
      if (!r.ok) throw new Error('Could not load automations')
      const d = await r.json()
      setSettings(d.settings ?? [])
      setLog(d.log ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load automations.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  async function patch(kind: Kind, body: Partial<Setting>) {
    setBusy(kind)
    setError(null)
    // Optimistic: these are cheap toggles and the reload confirms them.
    setSettings((prev) => prev.map((s) => (s.kind === kind ? { ...s, ...body } as Setting : s)))
    try {
      const r = await fetch('/api/automations', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...body }),
      })
      if (!r.ok) throw new Error('Could not save that change')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function runNow(kind?: Kind) {
    setBusy(kind ?? 'all')
    setError(null)
    setResult(null)
    try {
      const r = await fetch('/api/automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run: true, ...(kind ? { kind } : {}) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Run failed')

      const sent = (d.results ?? []).reduce((n: number, x: { sent: number }) => n + x.sent, 0)
      const notes = (d.results ?? [])
        .filter((x: { notes: string[] }) => x.notes.length)
        .map((x: { kind: Kind; notes: string[] }) => `${META[x.kind]?.label ?? x.kind}: ${x.notes.join(' ')}`)
      setResult(
        sent > 0
          ? `Sent ${sent} message${sent === 1 ? '' : 's'}.`
          : `Nothing to send. ${notes.join(' · ')}`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Loading automations…
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Messages Workly sends on its own, so you don’t have to remember.
          </p>
        </div>
        <button
          type="button"
          onClick={() => runNow()}
          disabled={busy !== null}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
        >
          {busy === 'all' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run all now
        </button>
      </header>

      <div className="flex items-start gap-2 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-[12.5px] text-brand">
        <Zap className="mt-0.5 size-4 shrink-0" />
        <p>
          These run automatically once a day. Running them again — manually or on a
          shorter schedule — never sends anyone the same message twice.
        </p>
      </div>

      {error  && <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</div>}
      {result && <div className="rounded-xl border border-emerald/20 bg-emerald/5 px-4 py-3 text-sm text-emerald">{result}</div>}

      <ul className="space-y-3">
        {ORDER.map((kind) => {
          const s = settings.find((x) => x.kind === kind)
          if (!s) return null
          const m = META[kind]
          const Icon = m.icon
          const grace = Number((s.config as { graceMinutes?: number }).graceMinutes ?? 15)

          return (
            <li key={kind} className={cn(
              'rounded-xl border p-4 transition-colors',
              s.enabled ? 'border-border bg-surface-2/30' : 'border-border bg-surface-2/10',
            )}>
              <div className="flex flex-wrap items-start gap-3">
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', m.tone)}>
                  <Icon className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{m.label}</p>
                  <p className="text-xs text-ink-soft">{m.blurb}</p>
                </div>

                <Toggle
                  on={s.enabled}
                  busy={busy === kind}
                  onClick={() => patch(kind, { enabled: !s.enabled })}
                />
              </div>

              {s.enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Chip label="Email" on={s.send_email} onClick={() => patch(kind, { send_email: !s.send_email })} />
                  <Chip label="Push"  on={s.send_push}  onClick={() => patch(kind, { send_push: !s.send_push })} />

                  {kind === 'late_arrival' && (
                    <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
                      Grace
                      <input
                        type="number" min={0} max={240} defaultValue={grace}
                        onBlur={(e) => {
                          const v = Math.max(0, Math.min(240, Number(e.target.value) || 0))
                          if (v !== grace) patch(kind, { config: { ...s.config, graceMinutes: v } })
                        }}
                        className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-xs outline-none focus:border-brand"
                      />
                      min
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() => runNow(kind)}
                    disabled={busy !== null}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface disabled:opacity-50"
                  >
                    {busy === kind ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    Run now
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Recent activity */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
        {log.length === 0 ? (
          <p className="text-xs text-ink-soft">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {log.slice(0, 12).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  row.status === 'sent'   ? 'bg-emerald/10 text-emerald'
                : row.status === 'failed' ? 'bg-coral/10 text-coral'
                :                           'bg-surface-2 text-ink-muted',
                )}>
                  {row.status}
                </span>
                <span className="font-medium text-ink">
                  {META[row.kind as Kind]?.label ?? row.kind}
                </span>
                {row.channel && row.channel !== 'none' && (
                  <span className="text-ink-soft">via {row.channel}</span>
                )}
                {row.detail && <span className="truncate text-coral">{row.detail}</span>}
                <span className="ml-auto text-ink-soft">
                  {new Date(row.created_at).toLocaleString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
        on ? 'bg-brand' : 'bg-border',
      )}
    >
      <span className={cn(
        'inline-block size-5 rounded-full bg-white shadow-sm transition-transform',
        on ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  )
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
        on ? 'border-emerald/30 bg-emerald/10 text-emerald' : 'border-border text-ink-soft hover:bg-surface',
      )}
    >
      {label} {on ? 'on' : 'off'}
    </button>
  )
}
