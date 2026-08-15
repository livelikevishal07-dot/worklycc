import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { listAccounts, saveDraft } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return []
}

/** Create or update a draft. */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')

    const accounts = await listAccounts()
    const chosen   = body.fromAccountId
      ? accounts.find((a) => a.id === String(body.fromAccountId))
      : accounts.find((a) => a.is_active)
    if (!chosen) return fail(400, 'No mailbox to save the draft under.')

    const draft = await saveDraft({
      draftId:   body.draftId ? String(body.draftId) : undefined,
      accountId: chosen.id,
      to:        parseList(body.to),
      cc:        parseList(body.cc),
      subject:   String(body.subject ?? ''),
      html:      typeof body.html === 'string' ? body.html : '',
      text:      typeof body.text === 'string' ? body.text : '',
      inReplyTo: body.inReplyTo ? String(body.inReplyTo) : null,
      threadId:  body.threadId  ? String(body.threadId)  : null,
    })
    return ok({ draft })
  } catch (err) {
    return fromError(err)
  }
}
