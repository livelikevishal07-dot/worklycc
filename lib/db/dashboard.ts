import 'server-only'
import { db } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardSnapshot {
  range: { from: string; to: string }
  generatedAt: string

  employeeStats: {
    total: number
    active: number
    onLeave: number
    inactive: number
  }

  taskStats: {
    total: number
    todo: number
    inProgress: number
    done: number
    overdue: number
    completedThisWeek: number
    completedToday: number
  }

  attendanceToday: {
    date: string
    present: number
    late: number
    absent: number
    leave: number
    notMarked: number
  }

  attendanceTrend: { date: string; present: number; late: number; absent: number; leave: number }[]
  taskTrend:       { date: string; created: number; completed: number }[]

  leaveStats: {
    pending: number
    approved: number
    rejected: number
  }
  pendingLeaves: {
    id: string
    employee_name: string
    type: string
    from_date: string
    to_date: string
    days: number
    created_at: string
  }[]

  bookingStats: {
    monthCount:    number
    monthRevenue:  number
    monthAdvance:  number
    monthPending:  number
    todayCount:    number
    todayRevenue:  number
  }

  todayEvents: {
    id:               string
    customer_name:    string
    customer_phone:   string
    city:             string
    event_date:       string
    occasion:         string
    website:          string
    total_amount:     number
    advance_paid:     number
    employee_name:    string
  }[]

  departmentBreakdown: {
    name: string
    color: string | null
    total: number
    active: number
    onLeave: number
  }[]

  topPerformers: {
    id: string
    name: string
    department: string | null
    completed: number
    avatar_url: string | null
  }[]

  activity: {
    id: string
    kind: 'task' | 'leave' | 'booking' | 'announcement' | 'attendance'
    title: string
    subtitle: string | null
    actor: string | null
    when: string
    href?: string | null
  }[]

  upcomingHolidays: {
    id: string
    name: string
    date: string
    type: string | null
  }[]

  recentAnnouncements: {
    id: string
    title: string
    body: string
    created_at: string
    author: string | null
  }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfMonthISO() {
  const d = new Date()
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1))
}
function endOfMonthISO() {
  const d = new Date()
  return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
function daysAgoISO(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISO(d)
}
function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const today    = localISO(new Date())
  const monthStart = startOfMonthISO()
  const monthEnd   = endOfMonthISO()
  const trendStart = daysAgoISO(13)         // last 14 days
  const weekStart  = daysAgoISO(6)          // last 7 days

  const supa = db()

  // Run all queries in parallel — single network round-trip wave
  const [
    employeesQ,
    countsQ,
    attendanceTodayQ,
    attendanceTrendQ,
    taskCreatedQ,
    taskDoneTrendQ,
    pendingLeavesQ,
    bookingsMonthQ,
    departmentsQ,
    holidaysQ,
    announcementsQ,
    recentTasksQ,
    recentLeavesQ,
    recentBookingsQ,
    todayEventsQ,
  ] = await Promise.all([
    // Employees with department for grouping
    supa.from('employees')
      .select('id, full_name, status, avatar_url, department:departments(id, name, color)'),

    // Task counts, leave counts and the top-5 performers, aggregated in
    // Postgres. These used to be three unbounded selects — every task, every
    // assignment and every leave row — transferred just to be counted here.
    supa.rpc('dashboard_counts', {
      p_today:      today,
      p_week_start: weekStart,
      p_last30:     daysAgoISO(30),
    }),

    // Today's attendance
    supa.from('attendance_sessions')
      .select('status, employee_id')
      .eq('date', today),

    // 14-day attendance trend
    supa.from('attendance_sessions')
      .select('date, status')
      .gte('date', trendStart)
      .lte('date', today),

    // Tasks created in trend window
    supa.from('tasks')
      .select('created_at')
      .gte('created_at', trendStart),

    // Tasks completed in trend window
    supa.from('tasks')
      .select('completed_at')
      .gte('completed_at', trendStart)
      .not('completed_at', 'is', null),

    // Pending leave requests with employee
    supa.from('leave_requests')
      .select('id, type, from_date, to_date, days, created_at, employee:employees(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(8),

    // Month bookings
    supa.from('bookings')
      .select('order_date, total_amount, advance_paid, customer_name, employee:employees(full_name)')
      .gte('order_date', monthStart)
      .lte('order_date', monthEnd)
      .order('created_at', { ascending: false }),

    // Departments
    supa.from('departments').select('id, name, color').order('name'),

    // Upcoming holidays in next 60 days
    supa.from('company_holidays')
      .select('id, name, date, type')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(6),

    // Recent announcements (no FK to employees, so author is just from text)
    supa.from('announcements')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(3),

    // Activity feed sources
    supa.from('tasks')
      .select('id, title, status, completed_at, created_at, priority')
      .order('created_at', { ascending: false })
      .limit(5),

    supa.from('leave_requests')
      .select('id, type, status, from_date, to_date, created_at, employee:employees(full_name)')
      .order('created_at', { ascending: false })
      .limit(5),

    supa.from('bookings')
      .select('id, customer_name, city, occasion, created_at, employee:employees(full_name)')
      .order('created_at', { ascending: false })
      .limit(5),

    // Today's events (bookings with event_date = today)
    supa.from('bookings')
      .select('id, customer_name, customer_phone, city, event_date, occasion, website, total_amount, advance_paid, employee:employees(full_name)')
      .eq('event_date', today)
      .order('created_at', { ascending: true }),
  ])

  // ── Process employees ───────────────────────────────────────────────────────
  const employees = (employeesQ.data ?? []) as unknown as Array<{
    id: string; full_name: string; status: string; avatar_url: string | null
    department: { id: string; name: string; color: string | null } | null
  }>

  const employeeStats = {
    total:    employees.length,
    active:   employees.filter(e => e.status === 'active').length,
    onLeave:  employees.filter(e => e.status === 'on_leave').length,
    inactive: employees.filter(e => e.status === 'inactive').length,
  }

  // ── Process tasks ───────────────────────────────────────────────────────────
  /**
   * Counts from the dashboard_counts() Postgres function. Zeroed if the call
   * fails so one bad aggregate cannot blank the whole dashboard — the rest of
   * the page is built from independent queries.
   */
  const counts = (countsQ.data ?? {}) as {
    tasks?: {
      total: number; todo: number; inProgress: number; done: number
      overdue: number; completedToday: number; completedThisWeek: number
    }
    leave?: { pending: number; approved: number; rejected: number }
    topPerformers?: Array<{ employee_id: string; completed: number }>
  }

  const taskStats = counts.tasks ?? {
    total: 0, todo: 0, inProgress: 0, done: 0,
    overdue: 0, completedToday: 0, completedThisWeek: 0,
  }

  // ── Today's attendance ──────────────────────────────────────────────────────
  const todayAtt = (attendanceTodayQ.data ?? []) as Array<{ status: string }>
  const present  = todayAtt.filter(a => a.status === 'present').length
  const late     = todayAtt.filter(a => a.status === 'late').length
  const absent   = todayAtt.filter(a => a.status === 'absent').length
  const leave    = todayAtt.filter(a => a.status === 'leave').length
  const notMarked = Math.max(0, employeeStats.active - (present + late + absent + leave))

  // ── 14-day attendance trend ─────────────────────────────────────────────────
  const trendDays: string[] = []
  for (let i = 13; i >= 0; i--) trendDays.push(daysAgoISO(i))
  const attTrendRows = (attendanceTrendQ.data ?? []) as Array<{ date: string; status: string }>
  const attendanceTrend = trendDays.map(d => {
    const day = attTrendRows.filter(r => r.date === d)
    return {
      date: d,
      present: day.filter(r => r.status === 'present').length,
      late:    day.filter(r => r.status === 'late').length,
      absent:  day.filter(r => r.status === 'absent').length,
      leave:   day.filter(r => r.status === 'leave').length,
    }
  })

  // ── 14-day task trend ───────────────────────────────────────────────────────
  const created = (taskCreatedQ.data ?? []) as Array<{ created_at: string }>
  const completed = (taskDoneTrendQ.data ?? []) as Array<{ completed_at: string | null }>
  const taskTrend = trendDays.map(d => ({
    date: d,
    created:   created.filter(c   => c.created_at.slice(0, 10) === d).length,
    completed: completed.filter(c => c.completed_at?.slice(0, 10) === d).length,
  }))

  // ── Leave stats ────────────────────────────────────────────────────────────
  const leaveStats = counts.leave ?? { pending: 0, approved: 0, rejected: 0 }

  const pending = (pendingLeavesQ.data ?? []) as any[]
  const pendingLeaves = pending.map(l => ({
    id: l.id,
    employee_name: l.employee?.full_name ?? 'Unknown',
    type: l.type,
    from_date: l.from_date,
    to_date:   l.to_date,
    days:      l.days,
    created_at: l.created_at,
  }))

  // ── Bookings ────────────────────────────────────────────────────────────────
  const bookings = (bookingsMonthQ.data ?? []) as unknown as Array<{
    order_date: string
    total_amount: unknown
    advance_paid: unknown
    customer_name: string
    employee: { full_name: string } | null
  }>
  const monthRevenue = bookings.reduce((s, b) => s + num(b.total_amount), 0)
  const monthAdvance = bookings.reduce((s, b) => s + num(b.advance_paid), 0)
  const todayBookings = bookings.filter(b => b.order_date === today)
  const bookingStats = {
    monthCount:   bookings.length,
    monthRevenue,
    monthAdvance,
    monthPending: monthRevenue - monthAdvance,
    todayCount:   todayBookings.length,
    todayRevenue: todayBookings.reduce((s, b) => s + num(b.total_amount), 0),
  }

  // ── Department breakdown ────────────────────────────────────────────────────
  const departments = (departmentsQ.data ?? []) as Array<{ id: string; name: string; color: string | null }>
  const departmentBreakdown = departments.map(d => {
    const inDept = employees.filter(e => e.department?.id === d.id)
    return {
      name: d.name,
      color: d.color,
      total:    inDept.length,
      active:   inDept.filter(e => e.status === 'active').length,
      onLeave:  inDept.filter(e => e.status === 'on_leave').length,
    }
  })

  // ── Top performers (by completed-task assignments in last 30 days) ─────────
  // Ranked and capped in SQL; previously every assignment row was transferred
  // so this Map could be built in memory.
  const completionMap = new Map<string, number>(
    (counts.topPerformers ?? []).map((p) => [p.employee_id, p.completed]),
  )
  const topPerformers = employees
    .map(e => ({
      id: e.id,
      name: e.full_name,
      department: e.department?.name ?? null,
      completed: completionMap.get(e.id) ?? 0,
      avatar_url: e.avatar_url,
    }))
    .filter(e => e.completed > 0)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5)

  // ── Activity feed ──────────────────────────────────────────────────────────
  type Activity = DashboardSnapshot['activity'][number]
  const activity: Activity[] = []

  for (const t of (recentTasksQ.data ?? []) as any[]) {
    activity.push({
      id: `task-${t.id}`,
      kind: 'task',
      title: t.completed_at ? `Completed: ${t.title}` : `Created: ${t.title}`,
      subtitle: `Priority ${t.priority}`,
      actor: null,
      when: t.completed_at ?? t.created_at,
      href: `/cms/tasks`,
    })
  }
  for (const l of (recentLeavesQ.data ?? []) as any[]) {
    activity.push({
      id: `leave-${l.id}`,
      kind: 'leave',
      title: `${l.employee?.full_name ?? 'Someone'} requested ${l.type} leave`,
      subtitle: `${l.from_date} → ${l.to_date} · ${l.status}`,
      actor: l.employee?.full_name ?? null,
      when: l.created_at,
      href: `/cms/leave`,
    })
  }
  for (const b of (recentBookingsQ.data ?? []) as any[]) {
    activity.push({
      id: `booking-${b.id}`,
      kind: 'booking',
      title: `${b.employee?.full_name ?? 'Someone'} added booking for ${b.customer_name}`,
      subtitle: [b.city, b.occasion].filter(Boolean).join(' · ') || null,
      actor: b.employee?.full_name ?? null,
      when: b.created_at,
      href: `/cms/bookings/calendar`,
    })
  }
  activity.sort((a, b) => (a.when < b.when ? 1 : -1))

  // ── Upcoming holidays ──────────────────────────────────────────────────────
  const upcomingHolidays = ((holidaysQ.data ?? []) as any[]).map(h => ({
    id: h.id, name: h.name, date: h.date, type: h.type,
  }))

  // ── Announcements ──────────────────────────────────────────────────────────
  const recentAnnouncements = ((announcementsQ.data ?? []) as any[]).map(a => ({
    id: a.id,
    title: a.title,
    body: a.body,
    created_at: a.created_at,
    author: null,
  }))

  // ── Today's events ─────────────────────────────────────────────────────────
  const todayEventsRaw = (todayEventsQ.data ?? []) as unknown as Array<{
    id: string
    customer_name: string
    customer_phone: string
    city: string
    event_date: string
    occasion: string
    website: string
    total_amount: unknown
    advance_paid: unknown
    employee: { full_name: string } | null
  }>
  const todayEvents = todayEventsRaw.map(e => ({
    id:            e.id,
    customer_name: e.customer_name,
    customer_phone: e.customer_phone,
    city:          e.city,
    event_date:    e.event_date,
    occasion:      e.occasion,
    website:       e.website,
    total_amount:  num(e.total_amount),
    advance_paid:  num(e.advance_paid),
    employee_name: e.employee?.full_name ?? 'Unknown',
  }))

  return {
    range: { from: monthStart, to: monthEnd },
    generatedAt: new Date().toISOString(),
    employeeStats,
    taskStats,
    attendanceToday: {
      date: today, present, late, absent, leave, notMarked,
    },
    attendanceTrend,
    taskTrend,
    leaveStats,
    pendingLeaves,
    bookingStats,
    todayEvents,
    departmentBreakdown,
    topPerformers,
    activity: activity.slice(0, 12),
    upcomingHolidays,
    recentAnnouncements,
  }
}
