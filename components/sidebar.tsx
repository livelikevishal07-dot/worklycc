'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import {
  AtSign,
  BadgeCheck,
  Download,
  Mail,
  LayoutDashboard,
  Users,
  CheckSquare,
  CalendarDays,
  CalendarOff,
  Settings,
  FileText,
  BarChart3,
  Repeat2,
  UserCircle,
  Megaphone,
  NotebookPen,
  BookOpen,
  PieChart,
  ListOrdered,
  LogOut,
  Share,
  X,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { useAdminMobileMenu } from '@/app/cms/mobile-menu-context'

const APP_NAME = 'Workly'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ── Install App Button ────────────────────────────────────────────────────────

function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [isIos,          setIsIos]          = React.useState(false)
  const [installed,      setInstalled]      = React.useState(false)
  const [showIosModal,   setShowIosModal]   = React.useState(false)
  const [installing,     setInstalling]     = React.useState(false)

  React.useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    const ios    = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    if (ios && safari) setIsIos(true)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (installed)                   return null
  if (!isIos && !deferredPrompt)   return null

  async function handleClick() {
    if (isIos) { setShowIosModal(true); return }
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
      <button
        type="button"
        onClick={handleClick}
        disabled={installing}
        className="group relative flex w-full items-center gap-3 rounded-lg bg-brand/8 px-3 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-brand/15 disabled:opacity-60"
      >
        {installing
          ? <span className="size-[18px] animate-spin rounded-full border-2 border-brand border-t-transparent" />
          : isIos
            ? <Share   className="size-[18px] opacity-80" />
            : <Download className="size-[18px] opacity-80" />
        }
        <span>{installing ? 'Installing…' : 'Install App'}</span>
        {/* Pulsing dot */}
        <span className="ml-auto flex size-2 items-center justify-center">
          <span className="absolute inline-flex size-2 animate-ping rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-brand" />
        </span>
      </button>

      {/* iOS step-by-step modal */}
      {showIosModal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowIosModal(false)}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.svg" alt="" className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Install Workly Admin</p>
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
                        Share <Share className="size-3.5" />
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
                      Tap <span className="font-semibold text-ink">"Add"</span> — done!
                    </>
                  ),
                },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    {step}
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-ink-soft">{text}</p>
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

interface NavItem {
  href:      string
  label:     string
  icon:      LucideIcon
  children?: NavItem[]
}

const PRIMARY: NavItem[] = [
  { href: '/cms',               label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/cms/employees',     label: 'Employees',     icon: Users },
  { href: '/cms/kyc',           label: 'Employee KYC',  icon: BadgeCheck },
  { href: '/cms/tasks',         label: 'Tasks',         icon: CheckSquare },
  { href: '/cms/routine',       label: 'Routine',       icon: Repeat2 },
  { href: '/cms/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/cms/diary',         label: 'Daily Diary',   icon: NotebookPen },
  {
    href: '/cms/email', label: 'Email', icon: Mail,
    children: [
      { href: '/cms/email/templates', label: 'Templates', icon: FileText },
      { href: '/cms/email/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/cms/email/contacts',  label: 'Contacts',  icon: Users },
      { href: '/cms/email/mailboxes', label: 'Mailboxes', icon: AtSign },
    ],
  },
  {
    href: '/cms/bookings', label: 'Bookings', icon: BookOpen,
    children: [
      { href: '/cms/bookings/analysis', label: 'Analysis',    icon: PieChart },
      { href: '/cms/bookings/calendar', label: 'Calendar',    icon: CalendarDays },
      { href: '/cms/bookings/list',     label: 'All Entries', icon: ListOrdered },
    ],
  },
]

const SECONDARY: NavItem[] = [
  { href: '/cms/performance',  label: 'Performance',      icon: BarChart3 },
  { href: '/cms/attendance',   label: 'Attendance',       icon: CalendarDays },
  { href: '/cms/leave',        label: 'Leave Management', icon: CalendarOff },
  { href: '/cms/payroll',      label: 'Payroll',          icon: Wallet },
  { href: '/cms/reports',      label: 'Reports',          icon: FileText },
  { href: '/cms/settings',     label: 'Settings',         icon: Settings },
  { href: '/employee/dashboard', label: 'Employee Portal', icon: UserCircle },
]

export function Sidebar() {
  const pathname = usePathname()
  const { closeMenu } = useAdminMobileMenu()

  async function handleSignOut() {
    await fetch('/api/admin-auth/logout', { method: 'POST' })
    window.location.replace('/admin-login')
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      {/* Logo + close button */}
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm">
            <span className="text-sm font-bold">W</span>
          </div>
          <div className="min-w-0">
            <span className="block text-base font-semibold leading-tight tracking-tight">{APP_NAME}</span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-ink-soft">Admin Portal</span>
          </div>
        </div>
        <button
          type="button"
          onClick={closeMenu}
          aria-label="Close menu"
          className="lg:hidden grid size-8 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <NavGroup items={PRIMARY}   pathname={pathname} onNavClick={closeMenu} />
        <div className="mx-3 my-3 border-t border-border" />
        <NavGroup items={SECONDARY} pathname={pathname} onNavClick={closeMenu} />
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <InstallAppButton />
        <ThemeToggle />
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-coral"
        >
          <LogOut className="size-[18px] opacity-70" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

function NavGroup({
  items,
  pathname,
  onNavClick,
}: {
  items: NavItem[]
  pathname: string
  onNavClick: () => void
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <NavRow key={item.href} item={item} pathname={pathname} onNavClick={onNavClick} />
      ))}
    </ul>
  )
}

function NavRow({
  item,
  pathname,
  onNavClick,
}: {
  item: NavItem
  pathname: string
  onNavClick: () => void
}) {
  const { href, label, icon: Icon, children } = item

  // Parent considered "in section" if pathname starts with its href
  const inSection = href === '/cms' ? pathname === href : pathname.startsWith(href)

  // Direct active = path exactly matches OR (parent without children AND startsWith match)
  const directActive = children
    ? pathname === href
    : inSection

  return (
    <li>
      <Link
        href={href}
        onClick={onNavClick}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          directActive
            ? 'bg-brand text-brand-foreground shadow-sm'
            : inSection && children
              ? 'bg-surface-2 text-ink'
              : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
        )}
      >
        <Icon
          className={cn(
            'size-[18px]',
            directActive ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
          )}
        />
        <span>{label}</span>
      </Link>

      {/* Children — render only when in this section */}
      {children && inSection && (
        <ul className="mt-1 ml-3 space-y-0.5 border-l border-border pl-3">
          {children.map((child) => {
            const ChildIcon = child.icon
            const childActive = pathname.startsWith(child.href)
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavClick}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                    childActive
                      ? 'bg-brand/10 text-brand'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  )}
                >
                  <ChildIcon
                    className={cn(
                      'size-[15px]',
                      childActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                    )}
                  />
                  <span>{child.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
