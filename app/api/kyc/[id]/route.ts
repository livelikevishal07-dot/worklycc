import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  deleteSubmission, getSubmission, revealAadhaar, setStatus,
} from '@/lib/db/kyc'
import { removeKycFiles } from '@/lib/kyc/storage'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum(['invited', 'submitted', 'approved', 'rejected']).optional(),
  note:   z.string().trim().max(1000).nullable().optional(),
  /** Explicit, deliberate action — never included in list responses. */
  revealAadhaar: z.boolean().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const submission = await getSubmission(params.id)
    if (!submission) return fail(404, 'KYC submission not found')
    return ok({ submission })
  } catch (err) {
    return fromError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = patchSchema.parse(body)

    if (input.revealAadhaar) {
      return ok({ aadhaar: await revealAadhaar(params.id) })
    }
    if (input.status) {
      await setStatus(params.id, input.status, input.note ?? null)
    }
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}

/** Remove a submission and its uploaded documents. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const sub = await getSubmission(params.id)
    if (!sub) return fail(404, 'KYC submission not found')

    // Best effort: a stuck object must not block deleting the record.
    try {
      await removeKycFiles([sub.photo_path, sub.aadhaar_path, sub.letter_path]
        .filter((p): p is string => Boolean(p)))
    } catch (e) {
      console.error('KYC file cleanup failed:', (e as Error).message)
    }

    await deleteSubmission(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
