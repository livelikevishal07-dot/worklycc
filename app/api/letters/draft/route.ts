import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getEmployee } from '@/lib/db/employees'
import { getCompany } from '@/lib/db/companies'
import { countLettersThisYear } from '@/lib/db/letters'
import { listAccounts } from '@/lib/db/email'
import {
  buildOfferLetter, buildReferenceNo, buildReleaseLetter, checkLetterReadiness,
  type LetterCompany, type LetterEmployee,
} from '@/lib/letters/content'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  employeeId: z.string().uuid(),
  type:       z.enum(['offer', 'release']),
  overrides: z.object({
    designation:     z.string().trim().max(120).optional(),
    monthlySalary:   z.number().nonnegative().nullable().optional(),
    joiningDate:     z.string().regex(DATE_RE).optional(),
    lastWorkingDate: z.string().regex(DATE_RE).optional(),
    reportingTime:   z.string().trim().max(60).optional(),
  }).optional().default({}),
})

/**
 * Build a letter draft for review. Nothing is stored or sent here — the admin
 * edits the wording and then posts it to /api/letters/send.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const { employeeId, type, overrides } = schema.parse(body)

    const employee = await getEmployee(employeeId)
    if (!employee) return fail(404, 'Employee not found')

    if (!employee.company_id) {
      return fail(400, `${employee.full_name} is not assigned to a company. Set one before issuing a letter.`)
    }
    const company = await getCompany(employee.company_id)
    if (!company) return fail(404, 'The company on this employee no longer exists.')

    const letterCompany: LetterCompany = {
      name:                 company.name,
      address:              company.address,
      email:                company.email,
      phone:                company.phone,
      website:              company.website,
      signatoryName:        company.signatory_name,
      signatoryDesignation: company.signatory_designation,
    }

    const letterEmployee: LetterEmployee = {
      fullName:      employee.full_name,
      email:         employee.email,
      address:       employee.address,
      designation:   employee.role?.name ?? null,
      department:    employee.department?.name ?? null,
      joiningDate:   employee.joining_date,
      monthlySalary: employee.monthly_salary,
    }

    const seq         = await countLettersThisYear(company.id, type) + 1
    const referenceNo = buildReferenceNo(company.name, type, seq)

    const doc = type === 'offer'
      ? buildOfferLetter(letterEmployee, letterCompany, { ...overrides, referenceNo })
      : buildReleaseLetter(letterEmployee, letterCompany, { ...overrides, referenceNo })

    // Hard stops vs advisories. The send route enforces the same blockers.
    const { blockers, warnings } = checkLetterReadiness(type, letterEmployee, letterCompany, overrides)

    if (!company.signatory_name) {
      warnings.push(`No signatory set for ${company.name} — the letter will be signed as “Authorised Signatory”.`)
    }

    const mailboxes = await listAccounts()
    const sendable  = mailboxes.filter((m) => m.is_active && m.has_password)
    if (sendable.length === 0) {
      warnings.push('No mailbox is connected, so the letter cannot be emailed yet. Add one under Email → Mailboxes.')
    }

    return ok({
      doc,
      blockers,
      warnings,
      employee: {
        id: employee.id, full_name: employee.full_name, email: employee.email,
        designation: employee.role?.name ?? null,
        joining_date: employee.joining_date, monthly_salary: employee.monthly_salary,
      },
      company:   { id: company.id, name: company.name },
      mailboxes: sendable.map((m) => ({ id: m.id, address: m.address })),
    })
  } catch (err) {
    return fromError(err)
  }
}
