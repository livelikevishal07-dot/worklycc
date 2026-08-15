import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

import { attachDocument, getByToken, inviteIsOpen, type LetterKind } from '@/lib/db/kyc'
import {
  ALLOWED_TYPES, MAX_UPLOAD_BYTES, extensionFor, putKycFile,
} from '@/lib/kyc/storage'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const KINDS = ['photo', 'aadhaar', 'letter'] as const
type Kind = (typeof KINDS)[number]

/**
 * Public, token-scoped document upload for the KYC form. Type and size are
 * checked server-side: this endpoint is reachable without a login, so the
 * client-side accept attribute is a convenience, not a control.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const row = await getByToken(params.token)
    if (!row) return fail(404, 'This form link is not valid.')

    const { open, reason } = inviteIsOpen(row)
    if (!open) return fail(410, reason ?? 'This form is closed.')

    const form = await req.formData()
    const file = form.get('file')
    const kind = String(form.get('kind') ?? '') as Kind
    const letterKind = String(form.get('letterKind') ?? 'offer') as LetterKind

    if (!KINDS.includes(kind))    return fail(400, 'Unknown document type.')
    if (!(file instanceof File))  return fail(400, 'No file provided.')
    if (file.size === 0)          return fail(400, 'That file is empty.')
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(413, `Files must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`)
    }

    const contentType = file.type || 'application/octet-stream'
    if (!ALLOWED_TYPES.includes(contentType as (typeof ALLOWED_TYPES)[number])) {
      return fail(415, 'Upload a JPG, PNG, WEBP or PDF file.')
    }
    // The photo is displayed inline in the CMS, so it must be an actual image.
    if (kind === 'photo' && !contentType.startsWith('image/')) {
      return fail(415, 'Your passport-size photo must be an image, not a PDF.')
    }

    const buf  = Buffer.from(await file.arrayBuffer())
    const ext  = extensionFor(contentType, file.name)
    const path = `${row.id}/${kind}-${randomUUID()}.${ext}`

    await putKycFile(path, buf, contentType)
    await attachDocument(params.token, kind, path, letterKind)

    return ok({ uploaded: kind, filename: file.name, sizeBytes: file.size })
  } catch (err) {
    return fromError(err)
  }
}
