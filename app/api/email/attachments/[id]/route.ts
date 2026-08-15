import { NextRequest, NextResponse } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getAttachment } from '@/lib/db/email'
import { signedDownloadUrl } from '@/lib/mail/storage'
import { fail, fromError } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Authenticated download. The bucket is private, so this checks the admin
 * session and then redirects to a short-lived signed URL that forces a save.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const att = await getAttachment(params.id)
    if (!att || !att.storage_path) return fail(404, 'Attachment not found')

    const url = await signedDownloadUrl(att.storage_path, att.filename ?? undefined)
    return NextResponse.redirect(url)
  } catch (err) {
    return fromError(err)
  }
}
