import { NextRequest, NextResponse } from 'next/server'

import { getAward, getAwardById, toPeriod } from '@/lib/db/employee-of-month'
import { getEmployee } from '@/lib/db/employees'
import { getCompany } from '@/lib/db/companies'
import { renderCertificatePdf, certificateFilename } from '@/lib/certificates/employee-of-month'
import { fail, fromError } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * The certificate PDF for an awarded month.
 *
 * Rendered on demand from the award row rather than stored — the wording is
 * derived entirely from data already snapshotted on the award, so regenerating
 * it later produces the same document.
 *
 * Admin-only via middleware's default-deny. The employee's own copy is served
 * from /api/employee/certificate, which checks their session and only ever
 * renders an award that belongs to them.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const id     = sp.get('id')
    const period = sp.get('period') ?? undefined

    const award = id ? await getAwardById(id) : await getAward(period)
    if (!award) {
      return fail(404, 'No Employee of the Month has been awarded for that month yet.')
    }
    return certificateResponse(award)
  } catch (err) {
    return fromError(err)
  }
}

/** Shared by the admin and employee routes so both produce an identical file. */
export async function certificateResponse(award: {
  id: string; period: string; employee_id: string
  on_time_days: number | null; total_days: number | null; avg_early_mins: number | null
  note: string | null
}) {
  const employee = await getEmployee(award.employee_id)
  if (!employee) return fail(404, 'That employee no longer exists.')

  const company = employee.company_id ? await getCompany(employee.company_id) : null

  const [y, m] = award.period.split('-').map(Number)
  const periodLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })

  // Say what actually earned it, using the snapshot taken when it was awarded.
  const bits: string[] = []
  if (award.on_time_days != null && award.total_days != null) {
    bits.push(`${award.on_time_days} of ${award.total_days} days on time`)
  }
  if (award.avg_early_mins != null && award.avg_early_mins > 0) {
    bits.push(`arriving ${award.avg_early_mins} minutes early on average`)
  }

  const pdf = await renderCertificatePdf({
    employeeName: employee.full_name,
    periodLabel,
    companyName:  company?.name ?? null,
    // Signed by the founder, per the admin. Falls back to the company's own
    // signatory when one is configured.
    signatoryName:        company?.signatory_name ?? 'Vishal Gupta',
    signatoryDesignation: company?.signatory_designation ?? 'Founder',
    message:  award.note,
    statLine: bits.length ? bits.join(' · ') : null,
  })

  return new NextResponse(pdf as any, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${certificateFilename(employee.full_name, periodLabel)}"`,
      'Cache-Control':       'no-store',
    },
  })
}
