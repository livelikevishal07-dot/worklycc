import { NextRequest, NextResponse } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getSubmission } from '@/lib/db/kyc'
import { kycSignedUrl } from '@/lib/kyc/storage'
import { fail, fromError } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS = ['photo', 'aadhaar', 'letter'] as const
type Kind = (typeof KINDS)[number]

/**
 * View or download a KYC document. The bucket is private, so this checks the
 * admin session and then redirects to a short-lived signed URL — links can't be
 * shared or bookmarked meaningfully.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; kind: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const kind = params.kind as Kind
    if (!KINDS.includes(kind)) return fail(400, 'Unknown document type.')

    const sub = await getSubmission(params.id)
    if (!sub) return fail(404, 'KYC submission not found')

    const path =
      kind === 'photo'   ? sub.photo_path
    : kind === 'aadhaar' ? sub.aadhaar_path
    :                      sub.letter_path

    if (!path) return fail(404, 'That document was not uploaded.')

    const download = req.nextUrl.searchParams.get('download') === '1'
    return NextResponse.redirect(await kycSignedUrl(path, download))
  } catch (err) {
    return fromError(err)
  }
}
