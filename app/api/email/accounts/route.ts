import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { createAccount, listAccounts } from '@/lib/db/email'
import { hasEncryptionKey } from '@/lib/mail/crypto'
import { testMailbox } from '@/lib/mail/connection-test'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const createSchema = z.object({
  address:     z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().max(120).optional(),
  imapHost:    z.string().trim().min(1).optional(),
  imapPort:    z.coerce.number().int().min(1).max(65535).optional(),
  smtpHost:    z.string().trim().min(1).optional(),
  smtpPort:    z.coerce.number().int().min(1).max(65535).optional(),
  username:    z.string().trim().optional(),
  password:    z.string().min(1),
  skipTest:    z.boolean().optional().default(false),
})

export async function GET() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    return ok({ accounts: await listAccounts(), encryptionReady: hasEncryptionKey() })
  } catch (err) {
    return fromError(err)
  }
}

/** Add a mailbox with its IMAP/SMTP credentials. */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    if (!hasEncryptionKey()) {
      return fail(503, 'MAIL_ENCRYPTION_KEY is not set — cannot store a mailbox password.')
    }

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const d = createSchema.parse(body)

    const imapHost = d.imapHost ?? 'imap.hostinger.com'
    const imapPort = d.imapPort ?? 993
    const smtpHost = d.smtpHost ?? 'smtp.hostinger.com'
    const smtpPort = d.smtpPort ?? 465
    const username = d.username || d.address

    // Verify the credentials actually work before we store them.
    if (!d.skipTest) {
      const probe = await testMailbox({
        imapHost, imapPort, smtpHost, smtpPort, username, password: d.password,
      })
      if (!probe.ok) {
        return fail(400, 'Could not connect with these credentials.', {
          imap: probe.imap,
          smtp: probe.smtp,
        })
      }
    }

    const account = await createAccount({
      address:     d.address,
      displayName: d.displayName,
      imapHost, imapPort, smtpHost, smtpPort, username,
      password:    d.password,
    })
    if (!account) return fail(409, 'That address has already been added.')

    return ok({ account }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
