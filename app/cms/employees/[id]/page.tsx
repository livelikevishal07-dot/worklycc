import { notFound } from 'next/navigation'

import { Topbar } from '@/components/topbar'
import { getEmployeeProfile } from '@/lib/db/employee-profile'
import { ProfileHeader } from '@/components/employees/profile/profile-header'
import { ProfileStats } from '@/components/employees/profile/profile-stats'
import { LiveTasks } from '@/components/employees/profile/live-tasks'
import { CompletedTasks } from '@/components/employees/profile/completed-tasks'
import { ActivityTimeline } from '@/components/employees/profile/activity-timeline'
import { AttendanceLog } from '@/components/employees/profile/attendance-log'
import { CompletionTrend } from '@/components/employees/profile/completion-trend'
import { TaskStreak } from '@/components/employees/profile/task-streak'
import { TodayAttendance } from '@/components/employees/profile/today-attendance'
import { LetterHistory } from '@/components/employees/profile/letter-history'

export const dynamic = 'force-dynamic'

export default async function EmployeeDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await getEmployeeProfile(params.id)
  if (!profile) notFound()

  return (
    <>
      <Topbar
        title={profile.employee.full_name}
        breadcrumb={[
          { label: 'Home' },
          { label: 'Employees' },
          { label: profile.employee.full_name },
        ]}
      />

      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        {/* Identity + contact */}
        <ProfileHeader employee={profile.employee} />

        {/* KPI cards: tasks completed, in progress, deadline hit rate, monthly attendance */}
        <ProfileStats
          task={profile.taskMetrics}
          attendance={profile.attendanceMetrics}
          monthly={profile.monthlyAttendance}
        />

        {/* Today's attendance quick-look */}
        <TodayAttendance row={profile.todayAttendance} />

        {/* Main content grid */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Left 2/3: tasks + trends + attendance log */}
          <div className="space-y-5 lg:col-span-2">
            {/* Live task status */}
            <LiveTasks assignments={profile.assignments} />

            {/* 7-day streak */}
            <TaskStreak
              last7={profile.taskStreak.last7}
              currentStreak={profile.taskStreak.currentStreak}
            />

            {/* 6-month completion trend (project + daily routine) */}
            <CompletionTrend
              assignments={profile.assignments}
              recurringCompletions={profile.recurringCompletions}
            />

            {/* Attendance table: last 30 days with late punch-in */}
            <AttendanceLog rows={profile.attendance} />
          </div>

          {/* Right 1/3: timeline + recent completions */}
          <div className="space-y-5">
            <ActivityTimeline
              assignments={profile.assignments}
              attendance={profile.attendance}
            />
            <CompletedTasks assignments={profile.assignments} />
            <LetterHistory employeeId={profile.employee.id} />
          </div>
        </div>
      </main>
    </>
  )
}
