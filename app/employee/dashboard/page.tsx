'use client'

import * as React from 'react'
import { EmployeeTopbar }    from '@/components/employee-dashboard/topbar'
import { WelcomeCard }       from '@/components/employee-dashboard/welcome-card'
import { QuickStats }        from '@/components/employee-dashboard/quick-stats'
import { MyTasks }           from '@/components/employee-dashboard/my-tasks'
import { WeekAttendance }    from '@/components/employee-dashboard/week-attendance'
import { LeaveOverview }     from '@/components/employee-dashboard/leave-overview'
import { RecentAttendance }  from '@/components/employee-dashboard/recent-attendance'
import { AnnouncementsFeed } from '@/components/employee-dashboard/announcements-feed'
import { PinnedAnnouncements } from '@/components/employee-dashboard/pinned-announcements'
import { LeaderboardWidget } from '@/components/leaderboard/leaderboard-widget'
import { TodayEvents }      from '@/components/employee-dashboard/today-events'
import { TaskDetailDrawer, type TaskDetail } from '@/components/employee-dashboard/task-detail-drawer'
import { TaskFormDrawer }    from '@/components/employee-dashboard/task-form-drawer'
import { DailyTasksSection } from '@/components/employee-dashboard/daily-tasks'
import { useEmployee }       from '@/app/employee/context'

const BOOKING_DEPARTMENTS = ['Sales', 'Operations']

export default function EmployeeDashboard() {
  const employee = useEmployee()
  const showBookings = Boolean(employee.department && BOOKING_DEPARTMENTS.includes(employee.department))
  const [detailTask,  setDetailTask]  = React.useState<TaskDetail | null>(null)
  const [detailOpen,  setDetailOpen]  = React.useState(false)
  const [formTask,    setFormTask]    = React.useState<TaskDetail | null>(null)
  const [formOpen,    setFormOpen]    = React.useState(false)
  const [taskVersion, setTaskVersion] = React.useState(0)

  function openDetail(t: TaskDetail) { setDetailTask(t); setDetailOpen(true) }
  function openForm(t?: TaskDetail)  { setFormTask(t ?? null); setFormOpen(true) }
  function onTaskUpdated(t: TaskDetail) { setDetailTask(t); setTaskVersion((v) => v + 1) }
  function onSaved() { setTaskVersion((v) => v + 1) }

  return (
    <>
      <EmployeeTopbar
        title="My Dashboard"
        breadcrumb={[{ label: 'Home' }, { label: 'Dashboard' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-6 sm:py-6">
        {/* Above everything, including the welcome card — a pinned notice is the
            one thing on this page the admin has said everyone must read. */}
        <PinnedAnnouncements />
        <WelcomeCard />
        <DailyTasksSection employeeId={employee.id} compact />
        <QuickStats />

        {showBookings && <TodayEvents />}

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <MyTasks
              key={taskVersion}
              onOpen={openDetail}
              onNew={() => openForm()}
            />
            <RecentAttendance />
          </div>
          <div className="space-y-5">
            <WeekAttendance />
            <LeaveOverview />
            <AnnouncementsFeed />
          </div>
        </div>

        {/* Leaderboard — full width below the two-column grid */}
        <LeaderboardWidget currentEmployeeId={employee.id} />
      </main>

      <TaskDetailDrawer
        task={detailTask}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={(t) => { setDetailOpen(false); openForm(t) }}
        onTaskUpdated={onTaskUpdated}
      />
      <TaskFormDrawer
        open={formOpen}
        task={formTask}
        onClose={() => setFormOpen(false)}
        onSaved={onSaved}
      />
    </>
  )
}
