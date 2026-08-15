'use client'

import * as React from 'react'
import {
  CalendarDays, ChevronDown, Info, Megaphone, PartyPopper, Pin,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Pinned announcements, surfaced at the very top of the employee dashboard.
 *
 * The sidebar feed shows everything in date order, where a pinned item is just
 * one row among many. Anything the admin pins is meant to be read — so it gets
 * its own banner above the fold, and stays there until the admin unpins it.
 * Deliberately not dismissible: pinning is the admin saying "everyone sees this".
 */

type AnnouncementType = 'announcement' | 'event' | 'holiday' | 'info'

interface Announcement {
  id:         string
  title:      string
  body:       string | null
  type:       AnnouncementType
  pinned:     boolean
  created_at: string
}

const TYPE_META: Record<AnnouncementType, {
  icon:   React.ElementType
  label:  string
  accent: string   // left rule
  tint:   string   // card background
  chip:   string   // icon tile + badge
}> = {
  announcement: {
    icon: Megaphone, label: 'Announcement',
    accent: 'border-l-brand',   tint: 'bg-brand/[0.06]',   chip: 'bg-brand/15 text-brand',
  },
  event: {
    icon: PartyPopper, label: 'Event',
    accent: 'border-l-emerald', tint: 'bg-emerald/[0.06]', chip: 'bg-emerald/15 text-emerald',
  },
  holiday: {
    icon: CalendarDays, label: 'Holiday',
    accent: 'border-l-indigo',  tint: 'bg-indigo/[0.06]',  chip: 'bg-indigo/15 text-indigo',
  },
  info: {
    icon: Info, label: 'Info',
    accent: 'border-l-amber',   tint: 'bg-amber/[0.07]',   chip: 'bg-amber/20 text-amber',
  },
}

/** Bodies longer than this get a Read more toggle instead of pushing the page down. */
const CLAMP_CHARS = 180

/** Re-check periodically so a freshly pinned notice reaches dashboards that are already open. */
const POLL_MS = 60_000

function formatWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function PinnedAnnouncements() {
  const [pinned, setPinned] = React.useState<Announcement[]>([])

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const r = await fetch('/api/announcements', { cache: 'no-store' })
        if (!r.ok) return
        const data: Announcement[] = await r.json()
        if (cancelled || !Array.isArray(data)) return
        setPinned(data.filter((a) => a.pinned))
      } catch {
        // Silent: this is a supplementary banner, and the sidebar feed already
        // surfaces load failures.
      }
    }

    load()
    const id = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (pinned.length === 0) return null

  return (
    <section aria-label="Pinned announcements" className="space-y-2.5">
      {pinned.map((item) => (
        <PinnedCard key={item.id} item={item} />
      ))}
    </section>
  )
}

function PinnedCard({ item }: { item: Announcement }) {
  const meta = TYPE_META[item.type] ?? TYPE_META.announcement
  const Icon = meta.icon

  const body     = item.body ?? ''
  const isLong   = body.length > CLAMP_CHARS
  const [open, setOpen] = React.useState(false)

  return (
    <article
      className={cn(
        'animate-fade-in rounded-2xl border border-l-4 border-border p-4 shadow-card sm:p-5',
        meta.accent,
        meta.tint,
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', meta.chip)}>
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              meta.chip,
            )}>
              <Pin className="size-2.5" /> Pinned
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
              {meta.label}
            </span>
            <span className="text-[10px] text-ink-soft">· {formatWhen(item.created_at)}</span>
          </div>

          <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink sm:text-base">
            {item.title}
          </h2>

          {body && (
            <>
              <p className={cn(
                'mt-1 text-[13px] leading-relaxed text-ink-muted',
                open ? 'whitespace-pre-wrap' : 'line-clamp-2',
              )}>
                {body}
              </p>
              {isLong && (
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                >
                  {open ? 'Show less' : 'Read more'}
                  <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
