import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { putBuffer } from '@/lib/mail/storage'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024

/**
 * Upload one file for an outgoing message. Returns a ref the compose form keeps
 * and sends with the message; the file is linked to the Sent record on send.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return fail(400, 'No file provided.')
    if (file.size > MAX_BYTES)   return fail(413, 'File exceeds the 25 MB limit.')

    const buf         = Buffer.from(await file.arrayBuffer())
    const safe        = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
    const path        = `outbound/${randomUUID()}-${safe}`
    const contentType = file.type || 'application/octet-stream'

    await putBuffer(path, buf, contentType)

    return ok({
      storagePath: path,
      filename:    file.name,
      contentType,
      sizeBytes:   file.size,
    })
  } catch (err) {
    return fromError(err)
  }
}
