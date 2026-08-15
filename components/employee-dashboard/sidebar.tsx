'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import {
  BookOpen,
  CalendarDays,
  CalendarOff,
  Download,
  LayoutDashboard,
  CheckSquare,
  LogOut,
  Share,
  StickyNote,
  Wallet,
  X,
  type LucideIcon,
  BadgeCheck,
} from 'lucide-react'

import { Avatar }        from '@/components/ui/avatar'
import { ThemeToggle }   from '@/components/theme-toggle'
import { cn }            from '@/lib/utils'
import { useEmployee }   from '@/app/employee/context'
import { useMobileMenu } from '@/app/employee/mobile-menu-context'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  href:  string
  label: string
  icon:  LucideIcon
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ── Nav config ────────────────────────────────────────────────────────────────

const PRIMARY: NavItem[] = [
  { href: '/employee/dashboard',  label: 'Dashboard', icon: LayoutDashboard },
  { href: '/employee/tasks',      label: 'My Tasks',  icon: CheckSquare     },
  { href: '/employee/attendance', label: 'Attendance',icon: CalendarDays    },
  { href: '/employee/leave',      label: 'Leave',     icon: CalendarOff     },
  { href: '/employee/payslips',   label: 'Payslips',  icon: Wallet          },
  { href: '/employee/notes',      label: 'My Notes',  icon: StickyNote      },
]

const BOOKING_DEPARTMENTS = ['Sales', 'Operations']

// ── Install App Button ────────────────────────────────────────────────────────

function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [isIos,          setIsIos]          = React.useState(false)
  const [installed,      setInstalled]      = React.useState(false)
  const [showIosModal,   setShowIosModal]   = React.useState(false)
  const [installing,     setInstalling]     = React.useState(false)

  React.useEffect(() => {
    // Already running as installed PWA — hide button
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    // iOS detection
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    if (ios && safari) setIsIos(true)

    // Android / Chrome — capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Hide if already installed
  if (installed) return null

  // Hide on non-iOS if no install prompt available yet
  // (browser will fire it once criteria are met)
  if (!isIos && !deferredPrompt) return null

  async function handleClick() {
    if (isIos) {
      setShowIosModal(true)
      return
    }
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
    } finally {
      setInstalling(false)
      setDeferredPrompt(null)
    }
  }

  return (
    <>
      {/* ── Install button ── */}
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          'bg-brand/8 text-brand hover:bg-brand/15',
        )}
      >
        {installing
          ? <span className="size-[18px] animate-spin rounded-full border-2 border-brand border-t-transparent" />
          : isIos
            ? <Share className="size-[18px] opacity-80" />
            : <Download className="size-[18px] opacity-80" />
        }
        <span>{installing ? 'Installing…' : 'Install App'}</span>

        {/* Pulsing dot to draw attention */}
        <span className="ml-auto flex size-2 items-center justify-center">
          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-brand" />
        </span>
      </button>

      {/* ── iOS instruction modal ── */}
      {showIosModal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowIosModal(false)}
          />

          {/* Sheet */}
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.svg" alt="" className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Install Workly</p>
                  <p className="text-[11px] text-ink-soft">Add to your home screen</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-surface-2"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Steps */}
            <div className="space-y-3 px-5 py-4">
              {[
                {
                  step: '1',
                  text: (
                    <>
                      Tap the{' '}
                      <span className="inline-flex items-center gap-1 font-semibold text-brand">
                        Share
                        <Share className="size-3.5" />
                      </span>{' '}
                      button at the bottom of Safari
                    </>
                  ),
                },
                {
                  step: '2',
                  text: (
                    <>
                      Scroll down and tap{' '}
                      <span className="font-semibold text-ink">"Add to Home Screen"</span>
                    </>
                  ),
                },
                {
                  step: '3',
                  text: (
                    <>
                      Tap <span className="font-semibold text-ink">"Add"</span> in the top right — done!
                    </>
                  ),
                },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    {step}
                  </span>
                  <p className="pt-0.5 text-sm text-ink-soft leading-relaxed">{text}</p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-surface-2/40 px-5 py-3">
              <p className="text-center text-[11px] text-ink-soft">
                Works offline · No App Store needed · Instant access
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function EmployeeSidebar() {
  const pathname = usePathname()
  const employee = useEmployee()
  const { closeMenu } = useMobileMenu()

  const showBookings = Boolean(
    employee.department && BOOKING_DEPARTMENTS.includes(employee.department),
  )
  const primaryNav = showBookings
    ? [
        ...PRIMARY,
        { href: '/employee/bookings',          label: 'Bookings',         icon: BookOpen     },
        { href: '/employee/bookings/calendar', label: 'Booking Calendar', icon: CalendarDays },
      ]
    : PRIMARY

  async function handleSignOut() {
    await fetch('/api/employee-auth/logout', { method: 'POST' })
    window.location.replace('/employee-login')
  }

  function handleNavClick() {
    closeMenu()
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface sticky top-0">

      {/* ── Logo + mobile close button ── */}
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="grid size-8 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm">
          <span className="text-sm font-bold">W</span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight leading-tight">Workly</span>
          <span className="block text-[10px] font-medium text-ink-soft uppercase tracking-wider">Employee Portal</span>
        </div>
        {/* Close button — visible on mobile only */}
        <button
          type="button"
          onClick={closeMenu}
          aria-label="Close menu"
          className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* ── Employee card ── */}
      <div className="mx-3 mb-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={employee.full_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{employee.full_name}</p>
            <p className="truncate text-[11px] text-ink-soft">
              {employee.role ?? employee.department ?? 'Employee'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
        <NavGroup items={primaryNav} pathname={pathname} onNavClick={handleNavClick} />
      </nav>

      {/* ── Bottom: install + theme + sign out ── */}
      <div className="border-t border-border p-3 space-y-1">
        <InstallAppButton />
        <ThemeToggle />
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-coral transition-colors"
        >
          <LogOut className="size-[18px] opacity-70" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

// ── Nav group ─────────────────────────────────────────────────────────────────

function NavGroup({
  items, pathname, onNavClick,
}: {
  items:      NavItem[]
  pathname:   string
  onNavClick: () => void
}) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/employee/dashboard'
          ? pathname === href
          : pathname.startsWith(href)
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavClick}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand text-brand-foreground shadow-sm'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon className={cn('size-[18px]', active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} />
              {label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
