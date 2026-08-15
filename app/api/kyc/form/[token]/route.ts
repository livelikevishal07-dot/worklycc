import { NextRequest } from 'next/server'
import { z } from 'zod'

import { getByToken, inviteIsOpen, saveSubmission } from '@/lib/db/kyc'
import { getCompany } from '@/lib/db/companies'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The public KYC form endpoint. Deliberately unauthenticated — the joiner has no
 * account yet. The token in the URL is the only credential, and it scopes every
 * read and write to exactly one submission row.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const submitSchema = z.object({
  full_name: z.string().trim().min(2, 'Please enter your full name').max(120),
  email:     z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone:     z.string().trim().min(6, 'Enter a valid phone number').max(20),
  alt_phone: z.string().trim().max(20).optional(),
  date_of_birth: z.string().regex(DATE_RE).optional().or(z.literal('')),
  address:   z.string().trim().min(5, 'Please enter your address').max(500),
  city:      z.string().trim().max(80).optional(),
  state:     z.string().trim().max(80).optional(),
  pincode:   z.string().trim().max(12).optional(),
  emergency_name:     z.string().trim().max(120).optional(),
  emergency_phone:    z.string().trim().max(20).optional(),
  emergency_relation: z.string().trim().max(60).optional(),
  designation:        z.string().trim().max(120).optional(),
  aadhaarNumber: z.string().trim()
    .refine((v) => v === '' || /^\d{12}$/.test(v.replace(/\s/g, '')), 'Aadhaar must be 12 digits')
    .optional(),
})

/** Form state: who it is for, what has been uploaded, whether it is still open. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const row = await getByToken(params.token)
    if (!row) return fail(404, 'This form link is not valid.')

    const { open, reason } = inviteIsOpen(row)
    const company = row.company_id ? await getCompany(row.company_id) : null

    return ok({
      open,
      reason,
      alreadySubmitted: row.status === 'submitted',
      company: company ? { name: company.name } : null,
      prefill: {
        full_name: row.full_name ?? row.invited_name ?? '',
        email:     row.email ?? row.invited_email ?? '',
        phone:     row.phone ?? '',
        alt_phone: row.alt_phone ?? '',
        date_of_birth: row.date_of_birth ?? '',
        address:   row.address ?? '',
        city:      row.city ?? '',
        state:     row.state ?? '',
        pincode:   row.pincode ?? '',
        emergency_name:     row.emergency_name ?? '',
        emergency_phone:    row.emergency_phone ?? '',
        emergency_relation: row.emergency_relation ?? '',
        designation:        row.designation ?? '',
      },
      uploaded: {
        photo:   Boolean(row.photo_path),
        aadhaar: Boolean(row.aadhaar_path),
        letter:  Boolean(row.letter_path),
      },
    })
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const row = await getByToken(params.token)
    if (!row) return fail(404, 'This form link is not valid.')

    const { open, reason } = inviteIsOpen(row)
    if (!open) return fail(410, reason ?? 'This form is closed.')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid form data')
    const input = submitSchema.parse(body)

    // Documents are uploaded before submit, so they can be required here.
    const fresh = await getByToken(params.token)
    if (!fresh?.photo_path)   return fail(400, 'Please upload your passport-size photo.')
    if (!fresh?.aadhaar_path) return fail(400, 'Please upload your Aadhaar card.')

    await saveSubmission(params.token, {
      ...input,
      date_of_birth: input.date_of_birth || null,
    })

    return ok({ submitted: true })
  } catch (err) {
    return fromError(err)
  }
}
