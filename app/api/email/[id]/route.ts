import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  EMAIL_FOLDERS, deleteMessageRow, getMessage, markRead, moveToFolder, setStar,
  type EmailFolder,
} from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  is_read:    z.boolean().optional(),
  is_starred: z.boolean().optional(),
  folder:     z.enum(EMAIL_FOLDERS as [EmailFolder, ...EmailFolder[]]).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const msg = await getMessage(params.id)
    if (!msg) return fail(404, 'Message not found')

    // Opening an inbound message marks it read.
    if (msg.direction === 'inbound' && !msg.is_read) {
      await markRead(params.id, true)
      msg.is_read = true
    }
    return ok({ message: msg })
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
    if (Object.keys(input).length === 0) return fail(400, 'Nothing to update')

    const msg = await getMessage(params.id)
    if (!msg) return fail(404, 'Message not found')

    if (input.is_read    !== undefined) await markRead(params.id, input.is_read)
    if (input.is_starred !== undefined) await setStar(params.id, input.is_starred)
    if (input.folder     !== undefined) await moveToFolder(params.id, input.folder)

    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}

/** Hard delete — used for discarding drafts. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    await deleteMessageRow(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
