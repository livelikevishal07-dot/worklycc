'use client'

import * as React from 'react'
import { Crown, Loader2, RefreshCcw, Trophy } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useDashboardDataOptional } from '@/components/employee-dashboard/dashboard-data'

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'weekly' | 'monthly'

interface LeaderboardEntry {
  employee_id: string
  full_name: string
  avatar_url: string | null
  role: string | null
  department: string | null
  attendancePct: number
  deadlineHitRate: number
  tasksDone: number
  recurringDone: number
  score: number
  rank: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PODIUM_CONFIG = {
  1: {
    emoji: '🥇',
    podiumHeight: 'h-14',
    podiumBg: 'bg-amber/30',
    cardBg: 'bg-amber/8',
    border: 'border-amber/30',
    ring: 'ring-2 ring-amber/50 ring-offset-2 ring-offset-surface',
    text: 'text-amber',
    bar: 'bg-amber',
    avatarSize: 'lg' as const,
    order: 'order-2',
  },
  2: {
    emoji: '🥈',
    podiumHeight: 'h-10',
    podiumBg: 'bg-ink-soft/20',
    cardBg: 'bg-surface-2/40',
    border: 'border-border',
    ring: 'ring-2 ring-ink-soft/30 ring-offset-2 ring-offset-surface',
    text: 'text-ink-muted',
    bar: 'bg-ink-soft',
    avatarSize: 'md' as const,
    order: 'order-1',
  },
  3: {
    emoji: '🥉',
    podiumHeight: 'h-7',
    podiumBg: 'bg-coral/20',
    cardBg: 'bg-coral/5',
    border: 'border-coral/20',
    ring: 'ring-2 ring-coral/40 ring-offset-2 ring-offset-surface',
    text: 'text-coral',
    bar: 'bg-coral',
    avatarSize: 'md' as const,
    order: 'order-3',
  },
} as const

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-2', className)} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {/* Podium skeleton */}
      <div className="border-b border-border bg-amber/[0.02] px-6 py-6">
        <div className="flex items-end justify-center gap-4">
          {[2, 1, 3].map((r) => (
            <div key={r} className={cn('flex flex-col items-center gap-2', r === 1 ? 'order-2' : r === 2 ? 'order-1' : 'order-3')}>
              <Skeleton className={cn('rounded-full', r === 1 ? 'size-12' : 'size-9')} />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className={cn('w-20 rounded-t-lg', r === 1 ? 'h-14' : r === 2 ? 'h-10' : 'h-7')} />
            </div>
          ))}
        </div>
      </div>
      {/* List skeleton */}
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-1.5 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Podium card ───────────────────────────────────────────────────────────────

function PodiumCard({
  entry,
  config,
  isFirst,
}: {
  entry: LeaderboardEntry
  config: typeof PODIUM_CONFIG[keyof typeof PODIUM_CONFIG]
  isFirst: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center', config.order)}>
      {/* Content above podium block */}
      <div className={cn(
        'flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-3 shadow-sm transition-shadow hover:shadow-md',
        config.cardBg,
        config.border,
        isFirst ? 'w-[118px]' : 'w-[100px]'
      )}>
        {/* Crown for 1st */}
        {isFirst && (
          <Crown className="size-4 text-amber" strokeWidth={2.5} />
        )}

        {/* Rank emoji */}
        <span className="text-lg leading-none">{config.emoji}</span>

        {/* Avatar with ring */}
        <div className={config.ring}>
          <Avatar name={entry.full_name} size={config.avatarSize} />
        </div>

        {/* Name */}
        <div className="w-full text-center">
          <p className={cn(
            'truncate font-bold leading-tight',
            isFirst ? 'text-sm' : 'text-xs'
          )}>
            {entry.full_name.split(' ')[0]}
          </p>
          {entry.role && (
            <p className="truncate text-[10px] text-ink-soft leading-tight mt-0.5">
              {entry.role}
            </p>
          )}
        </div>

        {/* Score */}
        <span className={cn(
          'rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
          config.cardBg,
          config.border,
          'border',
          config.text
        )}>
          {entry.score}%
        </span>
      </div>

      {/* Podium block */}
      <div className={cn(
        'w-full rounded-t-xl',
        config.podiumHeight,
        config.podiumBg,
        'flex items-center justify-center'
      )}>
        <span className={cn('text-[10px] font-bold tracking-widest uppercase opacity-60', config.text)}>
          {entry.rank === 1 ? '1st' : entry.rank === 2 ? '2nd' : '3rd'}
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  currentEmployeeId?: string
}

export function LeaderboardWidget({ currentEmployeeId }: Props) {
  const [period, setPeriod]   = React.useState<Period>('monthly')
  const [entries, setEntries] = React.useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error,   setError]   = React.useState<string | null>(null)

  const load = React.useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/leaderboard?period=${p}`)
      if (!r.ok) throw new Error(`Server error ${r.status}`)
      const data: LeaderboardEntry[] = await r.json()
      setEntries(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // The employee dashboard's bundle already carries the monthly board, which
  // is what this opens on. Only a switch to weekly — or the CMS copy of this
  // widget, which has no bundle — costs a request of its own.
  const bundle       = useDashboardDataOptional()
  const fromBundle   = (bundle?.data?.leaderboard ?? null) as LeaderboardEntry[] | null
  const servedByBundle = Boolean(bundle) && period === 'monthly'

  React.useEffect(() => {
    if (servedByBundle) {
      if (fromBundle) { setEntries(fromBundle); setError(null); setLoading(false) }
      return
    }
    load(period)
  }, [load, period, servedByBundle, fromBundle])

  const reload = React.useCallback(
    () => (servedByBundle && bundle ? bundle.refresh() : load(period)),
    [servedByBundle, bundle, load, period],
  )

  // Find current employee's rank for the header badge
  const myEntry = currentEmployeeId
    ? entries.find((e) => e.employee_id === currentEmployeeId)
    : undefined

  const top3 = entries.slice(0, 3)

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber/15">
            <Trophy className="size-4 text-amber" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight">Top Performers</h2>
            <p className="text-[10px] text-ink-soft leading-tight">
              {period === 'monthly' ? 'This month' : 'Last 7 days'} · {entries.length} employees
            </p>
          </div>
          {myEntry && (
            <span className="ml-1 inline-flex items-center rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
              Your rank: #{myEntry.rank}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Period toggle */}
          <div className="flex items-center rounded-lg bg-surface-2 p-0.5">
            {(['monthly', 'weekly'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { if (p !== period) setPeriod(p) }}
                className={cn(
                  'rounded-md px-3 py-1 text-[11px] font-semibold capitalize transition-all',
                  period === p
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {p === 'monthly' ? 'Monthly' : 'Weekly'}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            title="Refresh"
            className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            {loading
              ? <Loader2 className="size-3.5 animate-spin" />
              : <RefreshCcw className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* ── States ─────────────────────────────────────────────────────────── */}
      {loading && entries.length === 0 ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="px-5 py-10 text-center">
          <Trophy className="mx-auto mb-2 size-8 text-ink-soft/30" />
          <p className="text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 text-xs font-medium text-brand hover:underline"
          >
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface-2">
            <Trophy className="size-7 text-ink-soft/40" />
          </span>
          <div className="text-center">
            <p className="text-sm font-medium text-ink">No data yet</p>
            <p className="text-xs text-ink-soft">Performance data will appear here once available.</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Podium — top 3 ──────────────────────────────────────────────── */}
          {top3.length > 0 && (
            <div className="border-b border-border bg-gradient-to-b from-amber/[0.04] to-transparent px-6 pb-0 pt-6">
              <div className="flex items-end justify-center gap-3">
                {/* Render order: 2, 1, 3 for classic podium look */}
                {[1, 0, 2].map((idx) => {
                  const e = top3[idx]
                  if (!e) return null
                  const config = PODIUM_CONFIG[e.rank as 1 | 2 | 3]
                  return (
                    <PodiumCard
                      key={e.employee_id}
                      entry={e}
                      config={config}
                      isFirst={e.rank === 1}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Full ranked list ─────────────────────────────────────────────── */}
          <div>
            {/* Section label */}
            <div className="px-5 pb-1 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
                All Employees
              </p>
            </div>

            <ol className="divide-y divide-border">
              {entries.map((e) => {
                const isMedal = e.rank <= 3
                const isMe    = e.employee_id === currentEmployeeId
                const cfg     = isMedal ? PODIUM_CONFIG[e.rank as 1 | 2 | 3] : null

                return (
                  <li
                    key={e.employee_id}
                    className={cn(
                      'relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/40',
                      isMe && 'bg-brand/[0.035]'
                    )}
                  >
                    {/* Left accent bar for current employee */}
                    {isMe && (
                      <span className="absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-brand" />
                    )}

                    {/* Rank */}
                    <span className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums',
                      isMedal && cfg
                        ? `${cfg.cardBg} ${cfg.text}`
                        : isMe
                          ? 'bg-brand/10 text-brand'
                          : 'bg-surface-2 text-ink-soft'
                    )}>
                      {isMedal
                        ? PODIUM_CONFIG[e.rank as 1 | 2 | 3].emoji
                        : e.rank}
                    </span>

                    {/* Avatar */}
                    <Avatar name={e.full_name} size="sm" />

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className={cn(
                          'truncate text-sm font-semibold',
                          isMe ? 'text-brand' : 'text-ink'
                        )}>
                          {e.full_name}
                        </p>
                        {isMe && (
                          <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[9px] font-bold text-brand uppercase tracking-wide">
                            you
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[10px] text-ink-soft">
                        {[e.role, e.department].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>

                    {/* Score + bar */}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn(
                        'text-sm font-bold tabular-nums',
                        e.rank === 1 ? 'text-amber'
                        : isMe ? 'text-brand'
                        : 'text-ink'
                      )}>
                        {e.score}%
                      </span>
                      {/* Progress bar */}
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            e.rank === 1 ? 'bg-amber'
                            : e.rank === 2 ? 'bg-ink-soft'
                            : e.rank === 3 ? 'bg-coral'
                            : isMe        ? 'bg-brand'
                            : 'bg-brand/40'
                          )}
                          style={{ width: `${e.score}%` }}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  )
}
