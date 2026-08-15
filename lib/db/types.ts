// Shared types: row shapes returned by the data layer.
// Keep these in sync with supabase/migrations/001_init.sql.

export type EmployeeStatus = 'active' | 'on_leave' | 'inactive' | 'terminated'

export interface Department {
  id: string
  name: string
  description: string | null
  lead_name: string | null
  color: string
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  color: string
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  name: string
  slug: string
  industry: string | null
  description: string | null
  color: string

  /** Letterhead details — used when issuing offer and relieving letters. */
  address: string | null
  email: string | null
  phone: string | null
  website: string | null
  signatory_name: string | null
  signatory_designation: string | null

  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  birthday: string | null // YYYY-MM-DD
  joining_date: string | null // YYYY-MM-DD

  role_id: string | null
  department_id: string | null
  company_id: string | null

  working_hours_start: string | null // HH:MM[:SS]
  working_hours_end: string | null
  working_days: number[] // 1=Mon..7=Sun

  status: EmployeeStatus
  performance: number
  avatar_url: string | null
  monthly_salary: number | null

  username: string | null
  /**
   * Plain-text password (admin-visible by design). password_hash is kept on
   * the row for now but is no longer read or written by the app.
   */
  password: string | null
  password_hash?: string | null

  created_at: string
  updated_at: string

  // Joined relations (when present)
  role?: Pick<Role, 'id' | 'name' | 'color'> | null
  department?: Pick<Department, 'id' | 'name' | 'color'> | null
  company?: Pick<Company, 'id' | 'name'> | null
}

// ── Payslip ───────────────────────────────────────────────────────────────────

export type PayslipStatus = 'draft' | 'published'

export interface Payslip {
  id: string
  employee_id: string
  month: number
  year: number

  monthly_salary: number
  company_name: string

  total_working_days: number
  present_days: number
  paid_leave_days: number
  absent_days: number

  per_day_salary: number
  base_pay: number
  da: number
  travel_allowance: number
  gross_salary: number
  deduction: number
  emergency_leave_days: number
  emergency_deduction: number
  net_salary: number

  override_net_salary: number | null
  admin_note: string | null

  status: PayslipStatus
  created_at: string
  updated_at: string

  // Joined
  employee?: Pick<Employee, 'id' | 'full_name' | 'email' | 'department'> | null
}

export interface ApiError {
  error: string
  details?: unknown
}
