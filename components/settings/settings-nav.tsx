'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Building2,
  Building,
  SlidersHorizontal,
  Bell,
  ShieldCheck,
  KeyRound,
  BookOpen,
  type LucideIcon,
  Zap,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export const SETTINGS_TABS = [
  { key: 'companies',       label: 'Companies',       icon: Building2,        hint: 'Manage businesses'              },
  { key: 'departments',     label: 'Departments',     icon: Building,         hint: 'Group employees by team'        },
  { key: 'roles',           label: 'Roles',           icon: ShieldCheck,      hint: 'Permissions & access'           },
  { key: 'booking-options', label: 'Booking Options', icon: BookOpen,         hint: 'Websites & platforms for forms' },
  { key: 'general',         label: 'General',         icon: SlidersHorizontal,hint: 'Workspace preferences'          },
  { key: 'notifications',   label: 'Notifications',   icon: Bell,             hint: 'Email & in-app alerts'          },
  { key: 'automations',     label: 'Automations',     icon: Zap,              hint: 'Birthdays, lateness, deadlines' },
  { key: 'sessions',        label: 'Sessions',        icon: KeyRound,         hint: 'Active devices'                 },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]['key']

export function useSettingsTab(): SettingsTab {
  const searchParams = useSearchParams()
  const t = searchParams.get('tab') as SettingsTab | null
  const valid = SETTINGS_TABS.find((x) => x.key === t)
  return valid?.key ?? 'companies'
}

interface ItemProps {
  active: boolean
  label: string
  hint: string
  icon: LucideIcon
  onClick: () => void
}

function Item({ active, label, hint, icon: Icon, onClick }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
        active ? 'bg-brand/10 text-ink' : 'text-ink-muted hover:bg-surface-2'
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
          active ? 'bg-brand text-brand-foreground' : 'bg-surface-2 text-ink-muted'
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', active && 'text-ink')}>
          {label}
        </span>
        <span className="block text-xs text-ink-soft">{hint}</span>
      </span>
    </button>
  )
}

export function SettingsNav() {
  const router = useRouter()
  const pathname = usePathname()
  const active = useSettingsTab()

  function setTab(t: SettingsTab) {
    const url = new URL(window.location.href)
    if (t === 'companies') url.searchParams.delete('tab')
    else url.searchParams.set('tab', t)
    router.replace(`${pathname}${url.search}`, { scroll: false })
  }

  return (
    <nav className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2 shadow-card">
      {SETTINGS_TABS.map((t) => (
        <Item
          key={t.key}
          active={active === t.key}
          label={t.label}
          hint={t.hint}
          icon={t.icon}
          onClick={() => setTab(t.key)}
        />
      ))}
    </nav>
  )
}
