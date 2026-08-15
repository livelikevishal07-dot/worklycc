'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowUpDown,
  ChevronDown,
  Eye,
  FileSignature,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { ImpersonateButton, useImpersonate } from './impersonate-button'
import { LetterDrawer, type LetterTarget } from '@/components/letters/letter-drawer'
import type { Employee, EmployeeStatus } from '@/lib/db/types'
import { cn } from '@/lib/utils'

const ROLE_TONE: Record<string, string> = {
  Admin: 'bg-coral/10 text-coral',
  Manager: 'bg-violet/15 text-violet',
  Senior: 'bg-indigo/15 text-indigo',
  Employee: 'bg-sky/15 text-sky',
  Intern: 'bg-amber/15 text-amber',
}

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'terminated', label: 'Terminated' },
]

const STATUS_TONE: Record<EmployeeStatus, { dot: string; bg: string; text: string; ring: string }> = {
  active:     { dot: 'bg-emerald',  bg: 'bg-emerald/10',   text: 'text-emerald',  ring: 'ring-emerald/20' },
  on_leave:   { dot: 'bg-amber',    bg: 'bg-amber/10',     text: 'text-amber',    ring: 'ring-amber/20' },
  inactive:   { dot: 'bg-ink-soft', bg: 'bg-ink-soft/15',  text: 'text-ink-muted',ring: 'ring-ink-soft/20' },
  terminated: { dot: 'bg-coral',    bg: 'bg-coral/10',     text: 'text-coral',    ring: 'ring-coral/20' },
}

function statusLabel(s: EmployeeStatus) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
}

interface Props {
  employees: Employee[]
  onRowClick: (employee: Employee) => void
  onStatusChange?: (employee: Employee) => void
  onDeleted?: (id: string) => void
}

export function EmployeesTable({
  employees,
  onRowClick,
  onStatusChange,
  onDeleted,
}: Props) {
  const router = useRouter()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [errorFor, setErrorFor] = React.useState<{ id: string; message: string } | null>(null)
  const impersonation = useImpersonate()
  const [letterFor, setLetterFor] = React.useState<LetterTarget | null>(null)

  async function handleStatusChange(employee: Employee, next: EmployeeStatus) {
    if (next === employee.status) return
    setPendingId(employee.id)
    setErrorFor(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorFor({ id: employee.id, message: json?.error ?? 'Failed to update status' })
        return
      }
      onStatusChange?.(json as Employee)
    } catch (err) {
      setErrorFor({
        id: employee.id,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(employee: Employee) {
    const ok = window.confirm(
      `Permanently delete ${employee.full_name}? This cannot be undone.`
    )
    if (!ok) return
    setPendingId(employee.id)
    setErrorFor(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErrorFor({ id: employee.id, message: json?.error ?? 'Failed to delete' })
        return
      }
      onDeleted?.(employee.id)
    } catch (err) {
      setErrorFor({
        id: employee.id,
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {impersonation.error && (
        <div className="flex items-center justify-between gap-3 border-b border-coral/20 bg-coral/5 px-5 py-3 text-sm text-coral">
          {impersonation.error}
          <button type="button" onClick={impersonation.clearError} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-ink-soft">
              <Th><SortHeader>Employee</SortHeader></Th>
              <Th><SortHeader>Role</SortHeader></Th>
              <Th>Department</Th>
              <Th>Contact</Th>
              <Th><SortHeader>Joined</SortHeader></Th>
              <Th>Performance</Th>
              <Th>Status</Th>
              <Th className="text-right pr-5">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-ink-soft">
                  No employees yet. Click <span className="font-semibold">Add employee</span> to create the first one.
                </td>
              </tr>
            )}

            {employees.map((e) => (
              <tr
                key={e.id}
                className="group cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50"
                onClick={() => router.push(`/cms/employees/${e.id}`)}
              >
                <Td>
                  <Link
                    href={`/cms/employees/${e.id}`}
                    className="flex items-center gap-3"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <Avatar name={e.full_name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium hover:text-brand">{e.full_name}</p>
                      <p className="truncate text-xs text-ink-soft">{e.email ?? 'no email'}</p>
                    </div>
                  </Link>
                </Td>
                <Td>
                  {e.role ? (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                        ROLE_TONE[e.role.name] ?? 'bg-ink-soft/10 text-ink-muted'
                      )}
                    >
                      {e.role.name}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-soft">—</span>
                  )}
                </Td>
                <Td>{e.department?.name ?? '—'}</Td>
                <Td className="text-ink-muted">{e.phone ?? '—'}</Td>
                <Td className="text-ink-muted">
                  {e.joining_date ? formatDate(e.joining_date) : '—'}
                </Td>
                <Td>
                  <PerformanceBar value={e.performance} />
                </Td>
                <Td onClick={(ev) => ev.stopPropagation()}>
                  <StatusSelect
                    value={e.status}
                    disabled={pendingId === e.id}
                    onChange={(next) => handleStatusChange(e, next)}
                  />
                  {errorFor?.id === e.id && (
                    <p className="mt-1 text-[11px] text-coral">{errorFor.message}</p>
                  )}
                </Td>
                <Td
                  className="pr-5 text-right"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <ImpersonateButton
                      id={e.id}
                      name={e.full_name}
                      disabled={e.status === 'inactive'}
                      pending={impersonation.pendingId === e.id}
                      onClick={impersonation.impersonate}
                    />
                    <IconBtn
                      label="Issue letter"
                      onClick={() => setLetterFor({ id: e.id, full_name: e.full_name })}
                    >
                      <FileSignature className="size-4" />
                    </IconBtn>
                    <IconBtn label="View" onClick={() => router.push(`/cms/employees/${e.id}`)}>
                      <Eye className="size-4" />
                    </IconBtn>
                    <IconBtn label="Edit" onClick={() => onRowClick(e)}>
                      <Pencil className="size-4" />
                    </IconBtn>
                    <IconBtn
                      label="Delete"
                      tone="danger"
                      disabled={pendingId === e.id}
                      onClick={() => handleDelete(e)}
                    >
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LetterDrawer
        open={letterFor !== null}
        employee={letterFor}
        onClose={() => setLetterFor(null)}
      />
    </div>
  )
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: EmployeeStatus
  onChange: (next: EmployeeStatus) => void
  disabled?: boolean
}) {
  const tone = STATUS_TONE[value]
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as EmployeeStatus)}
        aria-label="Change status"
        className={cn(
          'h-7 appearance-none rounded-full pl-6 pr-7 text-xs font-medium ring-1 ring-inset focus:outline-none focus:ring-2 disabled:opacity-60',
          tone.bg,
          tone.text,
          tone.ring
        )}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-2 top-1/2 size-1.5 -translate-y-1/2 rounded-full',
          tone.dot
        )}
      />
      <ChevronDown
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2',
          tone.text
        )}
      />
      <span className="sr-only">Current: {statusLabel(value)}</span>
    </div>
  )
}

function PerformanceBar({ value }: { value: number }) {
  const tone = value >= 85 ? 'bg-emerald' : value >= 70 ? 'bg-sky' : 'bg-coral'
  return (
    <div className="flex w-32 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-7 text-right text-xs font-semibold text-ink">{value}</span>
    </div>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  tone = 'default',
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40',
        tone === 'danger' && 'hover:bg-coral/10 hover:text-coral'
      )}
    >
      {children}
    </button>
  )
}

function SortHeader({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
      {children}
      <ArrowUpDown className="size-3 opacity-60" />
    </span>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-3 text-left font-medium ${className}`}>{children}</th>
}

function Td({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void
}) {
  return (
    <td className={`px-5 py-3 align-middle ${className}`} onClick={onClick}>
      {children}
    </td>
  )
}

function formatDate(d: string) {
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
