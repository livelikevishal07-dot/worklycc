import type { DepartmentScore } from '@/lib/db/performance'
import { cn } from '@/lib/utils'

/**
 * `departments.color` is inconsistent in the data: some rows hold a palette
 * name ("emerald"), others a raw hex ("#F97316"). Handle both — matching only
 * names silently dropped most departments onto a fallback colour that had
 * nothing to do with how they are shown everywhere else in the app.
 */
const BAR = {
  violet: 'bg-violet', sky: 'bg-sky', indigo: 'bg-indigo',
  coral: 'bg-coral', emerald: 'bg-emerald', amber: 'bg-amber',
} as const

const FALLBACK = ['bg-violet', 'bg-sky', 'bg-emerald', 'bg-coral', 'bg-indigo', 'bg-amber']

function barStyle(color: string | null, i: number): { className: string; style?: { background: string } } {
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) return { className: '', style: { background: color } }
  const named = color ? BAR[color as keyof typeof BAR] : undefined
  return { className: named ?? FALLBACK[i % FALLBACK.length] }
}

export function DepartmentBreakdown({ departments }: { departments: DepartmentScore[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">By department</h2>
        <span className="text-xs text-ink-soft">Avg score</span>
      </header>

      {departments.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          No scored employees this month yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {departments.map((d, i) => (
            <li key={d.department}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium">{d.department}</span>
                <span className="text-ink-muted">
                  {/* "scored", not "members" — this counts the people the
                      average is taken over, which excludes anyone with no
                      attendance recorded this month. Saying "members" would
                      read as department headcount and undercount it. */}
                  <span className="text-xs">
                    {d.members} scored
                  </span>
                  <span className="ml-3 font-semibold text-ink">{d.avg}%</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                {(() => {
                  const bar = barStyle(d.color, i)
                  return (
                    <div
                      className={cn('h-full rounded-full', bar.className)}
                      style={{ width: `${d.avg}%`, ...bar.style }}
                    />
                  )
                })()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
