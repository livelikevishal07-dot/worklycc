import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getSubmission, setStatus } from '@/lib/db/kyc'
import { createEmployee } from '@/lib/db/employees'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  role_id:        z.string().uuid().nullable().optional(),
  department_id:  z.string().uuid().nullable().optional(),
  company_id:     z.string().uuid().nullable().optional(),
  joining_date:   z.string().regex(DATE_RE).nullable().optional(),
  monthly_salary: z.number().nonnegative().nullable().optional(),
  username:       z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  password:       z.string().min(4).max(100).optional(),
})

/**
 * Promote a submitted KYC form into a real employee record.
 *
 * The joiner's own answers become the employee's personal details; the
 * employment terms (role, department, salary, login) are the admin's to set
 * here — a candidate should never get to choose their own salary or role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const sub = await getSubmission(params.id)
    if (!sub) return fail(404, 'KYC submission not found')
    if (sub.status === 'approved' && sub.employee_id) {
      return fail(409, 'This submission has already been added to the employee list.')
    }
    if (sub.status !== 'submitted' && sub.status !== 'rejected') {
      return fail(400, 'This form has not been submitted yet.')
    }
    if (!sub.full_name) return fail(400, 'This submission has no name on it.')

    const body = await req.json().catch(() => ({}))
    const input = schema.parse(body ?? {})

    // Compose the full postal address from the parts the form collected.
    const addressLine = [sub.address, sub.city, sub.state, sub.pincode]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(', ') || null

    const employee = await createEmployee({
      full_name:     sub.full_name,
      email:         sub.email,
      phone:         sub.phone,
      address:       addressLine,
      birthday:      sub.date_of_birth,
      joining_date:  input.joining_date ?? null,
      role_id:       input.role_id ?? null,
      department_id: input.department_id ?? null,
      company_id:    input.company_id ?? sub.company_id ?? null,
      working_days:  [1, 2, 3, 4, 5],
      status:        'active',
      performance:   0,
      monthly_salary: input.monthly_salary ?? null,
      username:      input.username ?? null,
      password:      input.password,
    })

    await setStatus(params.id, 'approved', null, employee.id)

    return ok({ employee, submissionId: params.id }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
