import { redirect } from 'next/navigation'

import { getSessionEmployeeId } from '@/lib/auth'
import { getEmployee } from '@/lib/db/employees'
import { getOrStartEmployeeSubmission } from '@/lib/db/kyc'

export const dynamic = 'force-dynamic'

/**
 * Re-KYC for a signed-in employee.
 *
 * Resolves (or starts) their own submission server-side and hands them straight
 * to the same form new joiners use, so there is only one form to maintain.
 */
export default async function EmployeeKycPage() {
  const employeeId = getSessionEmployeeId()
  if (!employeeId) redirect('/employee-login')

  const employee = await getEmployee(employeeId)
  if (!employee) redirect('/employee-login')

  const submission = await getOrStartEmployeeSubmission({
    id:         employee.id,
    full_name:  employee.full_name,
    email:      employee.email,
    company_id: employee.company_id,
  })

  redirect(`/kyc/${submission.token}`)
}
