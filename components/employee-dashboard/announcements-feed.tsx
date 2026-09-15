'use client'

import * as React from 'react'
import { useDashboardData } from './dashboard-data'
import { Bell, CalendarDays, Info, Loader2, Megaphone, PartyPopper, Pin, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type AnnouncementType = 'announcement' | 'event' | 'holiday' | 'info'

interface Announcement {
  id: string
  title: string
  body: string | null
  type: AnnouncementType
  pinned: boolean
  created_at: string
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const TYPE_META: Record<AnnouncementType, {
  icon: React.ElementType
  bg: string
  text: string
  label: string
}> = {
  announcement: { icon: Megaphone,    bg: 'bg-brand/10',   text: 'text-brand',    label: 'Announcement' },
  event:        { icon: PartyPopper,  bg: 'bg-emerald/10', text: 'text-emerald',  label: 'Event' },
  holiday:      { icon: CalendarDays, bg: 'bg-indigo/10',  text: 'text-indigo',   label: 'Holiday' },
  info:         { icon: Info,         bg: 'bg-amber/15',   text: 'text-amber',    label: 'Info' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnnouncementsFeed() {
  const [expanded, setExpanded] = React.useState<string | null>(null)

  // Served from the shared dashboard bundle — this used to be its own request,
  // fetching the same announcements the pinned banner had already fetched.
  const bundle  = useDashboardData()
  const items   = (bundle.data?.announcements ?? []) as Announcement[]
  const loading = bundle.loading && !bundle.data
  const error   = bundle.data ? null : bundle.error

  const visible = items.slice(0, 6)   // show up to 6; more via "View all"
  const [showAll, setShowAll] = React.useState(false)
  const displayed = showAll ? items : visible

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Announcements</h2>
          {items.length > 0 && (
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-foreground">
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={bundle.refresh}
          disabled={loading}
          title="Refresh"
          className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          {loading
            ? <Loader2 className="size-3.5 animate-spin" />
            : <RefreshCcw className="size-3.5" />}
        </button>
      </header>

      {/* Body */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : error ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={bundle.refresh}
            className="mt-2 text-xs font-medium text-brand hover:underline"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <Bell className="size-8 text-ink-soft/30" />
          <p className="text-sm text-ink-soft">No announcements yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {displayed.map((item) => {
            const m    = TYPE_META[item.type] ?? TYPE_META.announcement
            const Icon = m.icon
            const isExpanded = expanded === item.id
            const hasBody = Boolean(item.body)

            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-3 px-5 py-3.5 transition-colors',
                  item.pinned && 'bg-brand/[0.03]',
                  hasBody && 'cursor-pointer hover:bg-surface-2/40'
                )}
                onClick={() => hasBody && setExpanded(isExpanded ? null : item.id)}
              >
                {/* Icon */}
                <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl', m.bg, m.text)}>
                  <Icon className="size-4" />
                </span>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.pinned && (
                        <Pin className="size-2.5 shrink-0 text-brand" />
                      )}
                      <p className="text-sm font-semibold leading-snug text-ink">
                        {item.title}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-ink-soft whitespace-nowrap">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>

                  {/* Type badge */}
                  <span className={cn(
                    'mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    m.bg, m.text
                  )}>
                    {m.label}
                  </span>

                  {/* Body — shown expanded or truncated */}
                  {hasBody && (
                    <p className={cn(
                      'mt-1 text-xs leading-relaxed text-ink-muted transition-all',
                      isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                    )}>
                      {item.body}
                    </p>
                  )}
                  {hasBody && !isExpanded && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpanded(item.id) }}
                      className="mt-0.5 text-[10px] font-medium text-brand hover:underline"
                    >
                      Read more
                    </button>
                  )}
                  {hasBody && isExpanded && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpanded(null) }}
                      className="mt-0.5 text-[10px] font-medium text-brand hover:underline"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Footer */}
      {items.length > 6 && (
        <div className="flex justify-center border-t border-border py-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium text-brand hover:underline"
          >
            {showAll ? 'Show less ↑' : `View all ${items.length} announcements →`}
          </button>
        </div>
      )}
    </div>
  )
}
