import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getEmployee } from '@/lib/db/employees'
import { getCompany } from '@/lib/db/companies'
import { recordLetter } from '@/lib/db/letters'
import { getAccountSecretById, listAccounts } from '@/lib/db/email'
import { sendFromAccount } from '@/lib/mail/send'
import { putBuffer } from '@/lib/mail/storage'
import { letterFilename, renderLetterPdf } from '@/lib/letters/pdf'
import { renderLetterEmailHtml, renderLetterEmailText } from '@/lib/letters/html'
import {
  LETTER_LABEL, checkLetterReadiness, formatLongDate, paragraphsFromText,
  type LetterCompany, type LetterDoc,
} from '@/lib/letters/content'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  employeeId:  z.string().uuid(),
  type:        z.enum(['offer', 'release']),
  referenceNo: z.string().trim().max(60).optional().default(''),
  subject:     z.string().trim().min(1).max(300),
  bodyText:    z.string().trim().min(1).max(20_000),
  salutation:  z.string().trim().max(200).optional(),
  closing:     z.string().trim().max(120).optional(),
  /** false = generate and store the PDF without emailing it. */
  sendEmail:     z.boolean().optional().default(true),
  fromAccountId: z.string().uuid().optional(),
  /** Recipients. Defaults to the employee's own address when omitted, and may
      carry extra addresses so one letter can reach a personal inbox too. */
  to:            z.string().trim().max(500).optional(),
  cc:            z.string().trim().max(500).optional(),
  /** Re-validated server-side so the readiness rules can't be bypassed. */
  overrides: z.object({
    designation:     z.string().trim().max(120).optional(),
    monthlySalary:   z.number().nonnegative().nullable().optional(),
    joiningDate:     z.string().regex(DATE_RE).optional(),
    lastWorkingDate: z.string().regex(DATE_RE).optional(),
  }).optional().default({}),
})

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

    // Letterhead and signatory come from current company settings; the wording
    // is whatever the admin approved in the editor.
    const doc: LetterDoc = {
      type:        input.type,
      referenceNo: input.referenceNo,
      dateLabel:   formatLongDate(new Date()),
      subject:     input.subject,
      recipient:   { name: employee.full_name, address: employee.address, email: employee.email },
      salutation:  input.salutation?.trim() || `Dear ${employee.full_name},`,
      paragraphs:  paragraphsFromText(input.bodyText),
      closing:     input.closing?.trim() || 'Yours sincerely,',
      company:     letterCompany,
      signatory: {
        name:        company.signatory_name?.trim() || company.name,
        designation: company.signatory_designation?.trim() || 'Authorised Signatory',
      },
    }

    if (doc.paragraphs.length === 0) return fail(400, 'The letter body is empty.')

    // Same readiness rules the drawer shows. Enforced here so a letter can never
    // go out missing its salary, joining date or letterhead, whatever the client
    // sent.
    const { blockers } = checkLetterReadiness(
      input.type,
      {
        fullName:      employee.full_name,
        email:         employee.email,
        address:       employee.address,
        designation:   employee.role?.name ?? null,
        department:    employee.department?.name ?? null,
        joiningDate:   employee.joining_date,
        monthlySalary: employee.monthly_salary,
      },
      letterCompany,
      input.overrides,
    )
    if (blockers.length > 0) {
      return fail(400, `This letter is not ready to issue: ${blockers[0]}`, { blockers })
    }

    // 1) Render + store the PDF. This is the artefact of record, so it happens
    //    whether or not the email goes out.
    const pdf         = await renderLetterPdf(doc)
    const filename    = letterFilename(doc)
    const storagePath = `letters/${randomUUID()}-${filename}`
    await putBuffer(storagePath, pdf, 'application/pdf')

    // 2) Optionally email it.
    if (!input.sendEmail) {
      const letter = await recordLetter({
        employeeId: employee.id, companyId: company.id, type: input.type,
        referenceNo: input.referenceNo || null, subject: input.subject, doc,
        employeeName: employee.full_name, employeeEmail: employee.email,
        companyName: company.name, status: 'draft', storagePath,
      })
      return ok({ letter, emailed: false }, { status: 201 })
    }

    // Recipients: whatever the admin typed, falling back to the employee's own
    // address. Lets one letter reach a work and a personal inbox at once.
    const toRaw = (input.to ?? '').trim() || employee.email || ''
    const to = toRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    if (to.length === 0) {
      return fail(400, `${employee.full_name} has no email address. Add a recipient, or generate the PDF without sending.`)
    }
    const badTo = to.find((a) => !EMAIL_RE.test(a))
    if (badTo) return fail(400, `Invalid recipient address: ${badTo}`)

    const accounts = await listAccounts()
    const chosen   = input.fromAccountId
      ? accounts.find((a) => a.id === input.fromAccountId)
      : accounts.find((a) => a.is_active && a.has_password)
    if (!chosen) return fail(400, 'No mailbox available to send from. Add one under Email → Mailboxes.')

    const account = await getAccountSecretById(chosen.id)
    if (!account?.password_enc) return fail(400, 'That mailbox has no saved password.')

    const cc = (input.cc ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    const badCc = cc.find((a) => !EMAIL_RE.test(a))
    if (badCc) return fail(400, `Invalid CC address: ${badCc}`)

    const message = await sendFromAccount(account, {
      to,
      cc,
      subject: `${LETTER_LABEL[input.type]} — ${company.name}`,
      html:    renderLetterEmailHtml(doc),
      text:    renderLetterEmailText(doc),
      attachments: [{
        storagePath,
        filename,
        contentType: 'application/pdf',
        sizeBytes:   pdf.length,
      }],
    })

    const failed = message.status === 'failed'
    const letter = await recordLetter({
      employeeId: employee.id, companyId: company.id, type: input.type,
      referenceNo: input.referenceNo || null, subject: input.subject, doc,
      employeeName: employee.full_name, employeeEmail: to.join(', '),
      companyName: company.name,
      status: failed ? 'failed' : 'sent',
      error:  failed ? (message.error ?? 'Send failed') : null,
      storagePath,
    })

    if (failed) {
      return fail(502, message.error ?? 'The letter was generated but could not be emailed.')
    }
    return ok({ letter, emailed: true, to: to.join(', ') }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
