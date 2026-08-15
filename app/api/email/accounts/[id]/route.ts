import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  deleteAccount, setAccountActive, setAccountSync, updateAccountCredentials,
} from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  is_active:    z.boolean().optional(),
  sync_enabled: z.boolean().optional(),
  displayName:  z.string().trim().max(120).optional(),
  imapHost:     z.string().trim().min(1).optional(),
  imapPort:     z.coerce.number().int().min(1).max(65535).optional(),
  smtpHost:     z.string().trim().min(1).optional(),
  smtpPort:     z.coerce.number().int().min(1).max(65535).optional(),
  username:     z.string().trim().optional(),
  password:     z.string().min(1).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const d = patchSchema.parse(body)
    if (Object.keys(d).length === 0) return fail(400, 'Nothing to update')

    if (d.is_active    !== undefined) await setAccountActive(params.id, d.is_active)
    if (d.sync_enabled !== undefined) await setAccountSync(params.id, d.sync_enabled)

    await updateAccountCredentials(params.id, {
      displayName: d.displayName,
      imapHost:    d.imapHost,
      imapPort:    d.imapPort,
      smtpHost:    d.smtpHost,
      smtpPort:    d.smtpPort,
      username:    d.username,
      password:    d.password,
    })

    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}

/** Remove a mailbox — cascades to its messages and attachment rows. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    await deleteAccount(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
