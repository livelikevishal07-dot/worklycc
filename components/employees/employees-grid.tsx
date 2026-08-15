'use client'

import { Mail, Phone } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { ImpersonateButton, useImpersonate } from './impersonate-button'
import type { Employee } from '@/lib/db/types'

interface Props {
  employees: Employee[]
  onCardClick: (employee: Employee) => void
}

export function EmployeesGrid({ employees, onCardClick }: Props) {
  const impersonation = useImpersonate()

  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface py-12 text-center text-sm text-ink-soft">
        No employees yet. Click <span className="font-semibold">Add employee</span> to create the first one.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {impersonation.error && (
        <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
          {impersonation.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {employees.map((e) => (
          // The card body is a click target and so is the "Log in as" action, so
          // the card can't be one big <button> — nested buttons are invalid.
          // A positioned overlay button carries the card click instead.
          <div
            key={e.id}
            className="group relative rounded-2xl border border-border bg-surface p-5 shadow-card transition-shadow hover:shadow-pop"
          >
            <button
              type="button"
              onClick={() => onCardClick(e)}
              aria-label={`Edit ${e.full_name}`}
              className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />

            <div className="pointer-events-none relative z-10">
              <div className="flex items-start gap-3">
                <Avatar name={e.full_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{e.full_name}</h3>
                  <p className="text-xs text-ink-soft">
                    {e.role?.name ?? 'No role'} · {e.department?.name ?? 'No dept'}
                  </p>
                </div>
                <span className="pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <ImpersonateButton
                    id={e.id}
                    name={e.full_name}
                    disabled={e.status === 'inactive'}
                    pending={impersonation.pendingId === e.id}
                    onClick={impersonation.impersonate}
                  />
                </span>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-ink-muted">
                  <Mail className="size-3.5 shrink-0 text-ink-soft" />
                  <dd className="truncate">{e.email ?? '—'}</dd>
                </div>
                <div className="flex items-center gap-2 text-ink-muted">
                  <Phone className="size-3.5 shrink-0 text-ink-soft" />
                  <dd>{e.phone ?? '—'}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <StatusPill status={e.status} />
                <div className="text-right">
                  <p className="text-xs text-ink-soft">Performance</p>
                  <p className="text-sm font-semibold">{e.performance}%</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
