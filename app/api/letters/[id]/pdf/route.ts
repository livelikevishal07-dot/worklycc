import { NextRequest, NextResponse } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getLetter } from '@/lib/db/letters'
import { signedDownloadUrl } from '@/lib/mail/storage'
import { letterFilename, renderLetterPdf } from '@/lib/letters/pdf'
import { fail, fromError } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * Download an issued letter. Serves the exact stored PDF when one exists; falls
 * back to re-rendering from the snapshotted body so an older record is still
 * downloadable, and so the wording never silently changes.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const letter = await getLetter(params.id)
    if (!letter) return fail(404, 'Letter not found')

    if (letter.storage_path) {
      const filename = letterFilename(letter.body)
      return NextResponse.redirect(await signedDownloadUrl(letter.storage_path, filename))
    }

    const pdf = await renderLetterPdf(letter.body)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${letterFilename(letter.body)}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return fromError(err)
  }
}
