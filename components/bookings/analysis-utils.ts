/**
 * Formatting and date helpers shared by the bookings analysis page and its
 * chart bundle.
 *
 * Separate module so the (chart-free) stat cards, leaderboard and filter bar
 * can use them without importing the chart module and dragging recharts back
 * into the initial bundle.
 */

/**
 * The booking shape this page renders. Declared here rather than imported from
 * lib/db/bookings so both the page and its chart chunk share one definition
 * without either importing the other.
 */
export interface Booking {
  id:               string
  employee_id:      string
  order_date:       string
  customer_name:    string
  customer_phone:   string
  city:             string
  event_date:       string
  total_amount:     number
  advance_paid:     number
  website:          string
  occasion:         string
  booking_platform: string
  created_at:       string
  employee?: { full_name: string; department?: { name: string } | null } | null
}

export function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

export function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function diffDays(from: string, to: string) {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86400000) + 1
}
