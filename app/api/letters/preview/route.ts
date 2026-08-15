import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getEmployee } from '@/lib/db/employees'
import { getCompany } from '@/lib/db/companies'
import { letterFilename, renderLetterPdf } from '@/lib/letters/pdf'
import {
  formatLongDate, paragraphsFromText, type LetterDoc,
} from '@/lib/letters/content'
import { fail, fromError } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const schema = z.object({
  employeeId:  z.string().uuid(),
  type:        z.enum(['offer', 'release']),
  referenceNo: z.string().trim().max(60).optional().default(''),
  subject:     z.string().trim().min(1).max(300),
  bodyText:    z.string().trim().min(1).max(20_000),
  salutation:  z.string().trim().max(200).optional(),
  closing:     z.string().trim().max(120).optional(),
})

/** Render the current draft to a PDF for on-screen review. Stores nothing. */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const raw = await req.json().catch(() => null)
    if (!raw) return fail(400, 'Invalid JSON body')
    const input = schema.parse(raw)

    const employee = await getEmployee(input.employeeId)
    if (!employee) return fail(404, 'Employee not found')
    if (!employee.company_id) return fail(400, 'This employee is not assigned to a company.')

    const company = await getCompany(employee.company_id)
    if (!company) return fail(404, 'Company not found')

    const doc: LetterDoc = {
      type:        input.type,
      referenceNo: input.referenceNo,
      dateLabel:   formatLongDate(new Date()),
      subject:     input.subject,
      recipient:   { name: employee.full_name, address: employee.address, email: employee.email },
      salutation:  input.salutation?.trim() || `Dear ${employee.full_name},`,
      paragraphs:  paragraphsFromText(input.bodyText),
      closing:     input.closing?.trim() || 'Yours sincerely,',
      company: {
        name:                 company.name,
        address:              company.address,
        email:                company.email,
        phone:                company.phone,
        website:              company.website,
        signatoryName:        company.signatory_name,
        signatoryDesignation: company.signatory_designation,
      },
      signatory: {
        name:        company.signatory_name?.trim() || company.name,
        designation: company.signatory_designation?.trim() || 'Authorised Signatory',
      },
    }

    if (doc.paragraphs.length === 0) return fail(400, 'The letter body is empty.')

    const pdf = await renderLetterPdf(doc)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${letterFilename(doc)}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return fromError(err)
  }
}
