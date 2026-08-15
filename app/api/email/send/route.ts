import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { deleteMessageRow, getAccountSecretById, listAccounts } from '@/lib/db/email'
import { sendFromAccount } from '@/lib/mail/send'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Accepts either an array or a comma/semicolon separated string. */
function parseAddressList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return []
}

const attachmentSchema = z.object({
  storagePath: z.string().min(1),
  filename:    z.string().min(1),
  contentType: z.string().optional(),
  sizeBytes:   z.number().optional(),
})

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')

    const to      = parseAddressList(body.to)
    const cc      = parseAddressList(body.cc)
    const subject = String(body.subject ?? '').trim()
    const html    = typeof body.html === 'string' ? body.html : undefined
    const text    = typeof body.text === 'string' ? body.text : undefined

    if (to.length === 0)  return fail(400, 'At least one recipient is required.')
    const bad = [...to, ...cc].find((a) => !EMAIL_RE.test(a))
    if (bad)              return fail(400, `Invalid email address: ${bad}`)
    if (!subject)         return fail(400, 'Subject is required.')
    if (!html && !text)   return fail(400, 'Message body is required.')

    const attachments = z.array(attachmentSchema).max(20).optional().default([])
      .parse(Array.isArray(body.attachments) ? body.attachments : [])

    // Resolve the sending mailbox.
    const accounts = await listAccounts()
    const chosen   = body.fromAccountId
      ? accounts.find((a) => a.id === String(body.fromAccountId))
      : accounts.find((a) => a.is_active)
    if (!chosen)           return fail(400, 'No mailbox available to send from. Add one under Mailboxes.')
    if (!chosen.is_active) return fail(400, 'That mailbox is deactivated.')

    const account = await getAccountSecretById(chosen.id)
    if (!account)               return fail(404, 'Mailbox not found.')
    if (!account.password_enc)  return fail(400, 'This mailbox has no saved password. Re-add it from Mailboxes.')

    const msg = await sendFromAccount(account, {
      to, cc, subject, html, text,
      inReplyTo: body.inReplyTo ? String(body.inReplyTo) : null,
      threadId:  body.threadId  ? String(body.threadId)  : null,
      attachments,
    })

    if (msg.status === 'failed') {
      return fail(502, msg.error ?? 'Failed to send.')
    }

    // A draft that has now been sent should not linger in Drafts.
    if (body.draftId) {
      try { await deleteMessageRow(String(body.draftId)) } catch { /* non-fatal */ }
    }

    return ok({ message: msg }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
