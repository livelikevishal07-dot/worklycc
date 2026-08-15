import { NextRequest, NextResponse } from 'next/server'

import { getPublicLinkByToken, startSubmissionFromLink } from '@/lib/db/kyc'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Entry point for the shared "general" KYC link.
 *
 * The shared token is not a form in itself — opening it mints a fresh private
 * submission and redirects there, so several people can use the same link
 * without ever seeing each other's answers. Rate-limited per IP because this is
 * the one public endpoint that creates rows.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const origin = req.nextUrl.origin

  const link = await getPublicLinkByToken(params.token)
  if (!link || !link.is_active) {
    return NextResponse.redirect(`${origin}/kyc/closed`)
  }

  const limit = checkRateLimit(`kyc-start:${clientIp(req.headers)}`, 5, 60 * 60 * 1000)
  if (!limit.allowed) {
    return NextResponse.redirect(`${origin}/kyc/closed?reason=busy`)
  }

  const submission = await startSubmissionFromLink(link)
  return NextResponse.redirect(`${origin}/kyc/${submission.token}`)
}
