import { Topbar } from '@/components/topbar'
import { MonthlyTasksBoard } from '@/components/monthly-tasks/monthly-tasks-board'

export const dynamic = 'force-dynamic'

export default function MonthlyTasksPage() {
  return (
    <>
      <Topbar
        title="Monthly Tasks"
        breadcrumb={[{ label: 'Home' }, { label: 'Monthly Tasks' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <MonthlyTasksBoard />
      </main>
    </>
  )
}
