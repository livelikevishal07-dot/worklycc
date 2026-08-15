import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { testMailbox } from '@/lib/mail/connection-test'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const schema = z.object({
  address:  z.string().trim().toLowerCase().default(''),
  imapHost: z.string().trim().min(1).optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpHost: z.string().trim().min(1).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().trim().optional(),
  password: z.string().min(1),
})

/** Probe IMAP + SMTP credentials without saving anything. */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const d = schema.parse(body)

    return ok(await testMailbox({
      imapHost: d.imapHost ?? 'imap.hostinger.com',
      imapPort: d.imapPort ?? 993,
      smtpHost: d.smtpHost ?? 'smtp.hostinger.com',
      smtpPort: d.smtpPort ?? 465,
      username: d.username || d.address,
      password: d.password,
    }))
  } catch (err) {
    return fromError(err)
  }
}
