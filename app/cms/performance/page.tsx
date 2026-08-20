import { Topbar } from '@/components/topbar'
import { PerformanceStats } from '@/components/performance/performance-stats'
import { PerformanceTrend } from '@/components/performance/performance-trend'
import { Leaderboard } from '@/components/performance/leaderboard'
import { DepartmentBreakdown } from '@/components/performance/department-breakdown'
import { getPerformanceOverview } from '@/lib/db/performance'

export const dynamic = 'force-dynamic'

export default async function PerformancePage() {
  // Every figure on this page is computed from attendance, task and routine
  // rows. It previously rendered lib/mock-data.ts and showed invented people
  // and departments that do not exist in this company.
  const data = await getPerformanceOverview()

  return (
    <>
      <Topbar
        title="Performance"
        breadcrumb={[{ label: 'Home' }, { label: 'Performance' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <PerformanceStats data={data} />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PerformanceTrend data={data.trend} />
          </div>
          <DepartmentBreakdown departments={data.departments} />
        </div>

        <Leaderboard />
      </main>
    </>
  )
}
