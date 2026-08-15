import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { createInvite, listSubmissions, markInviteSent, type KycStatus } from '@/lib/db/kyc'
import { getCompany } from '@/lib/db/companies'
import { getAccountSecretById, listAccounts } from '@/lib/db/email'
import { sendFromAccount } from '@/lib/mail/send'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const STATUSES: KycStatus[] = ['invited', 'submitted', 'approved', 'rejected']

const inviteSchema = z.object({
  name:      z.string().trim().max(120).optional(),
  email:     z.string().trim().toLowerCase().email().optional(),
  companyId: z.string().uuid().optional(),
  /** false = just mint a link to share manually. */
  sendEmail: z.boolean().optional().default(true),
  fromAccountId: z.string().uuid().optional(),
})

function formUrl(req: NextRequest, token: string): string {
  // Prefer the real request origin so the link works on workly.cc and previews.
  const origin = req.nextUrl.origin.replace(/\/$/, '')
  return `${origin}/kyc/${token}`
}

export async function GET(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const raw = req.nextUrl.searchParams.get('status')
    const status = raw && STATUSES.includes(raw as KycStatus) ? (raw as KycStatus) : undefined
    return ok({ submissions: await listSubmissions(status) })
  } catch (err) {
    return fromError(err)
  }
}

/** Create a KYC invite and optionally email the form link to the joiner. */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = inviteSchema.parse(body)

    const invite = await createInvite({
      name:      input.name,
      email:     input.email,
      companyId: input.companyId,
    })
    const url = formUrl(req, invite.token)

    if (!input.sendEmail || !input.email) {
      return ok({ invite, url, emailed: false }, { status: 201 })
    }

    const company  = input.companyId ? await getCompany(input.companyId) : null
    const brand    = company?.name ?? 'Workly'
    const accounts = await listAccounts()
    const chosen   = input.fromAccountId
      ? accounts.find((a) => a.id === input.fromAccountId)
      : accounts.find((a) => a.is_active && a.has_password)

    if (!chosen) {
      // The link is still valid — surface it so it can be shared by hand.
      return ok({ invite, url, emailed: false, warning: 'No mailbox connected, so the link was not emailed.' }, { status: 201 })
    }

    const account = await getAccountSecretById(chosen.id)
    if (!account?.password_enc) {
      return ok({ invite, url, emailed: false, warning: 'That mailbox has no saved password.' }, { status: 201 })
    }

    const greeting = input.name?.trim() ? `Hi ${input.name.trim()},` : 'Hello,'
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;font-family:Helvetica,Arial,sans-serif;color:#1f2430;font-size:14px;line-height:1.65;">
<tr><td style="padding:26px 32px 8px;font-size:19px;font-weight:bold;">${brand}</td></tr>
<tr><td style="padding:0 32px 22px;">
  <p style="margin:0 0 14px;">${greeting}</p>
  <p style="margin:0 0 14px;">
    Welcome aboard. Before your first day, please complete your onboarding form —
    it takes a couple of minutes and asks for your basic details, a passport-size
    photo and a copy of your Aadhaar card.
  </p>
  <p style="margin:0 0 22px;">
    <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold;">
      Open the form
    </a>
  </p>
  <p style="margin:0 0 6px;font-size:12px;color:#5b6270;">
    If the button does not work, copy this link into your browser:
  </p>
  <p style="margin:0 0 14px;font-size:12px;color:#4f46e5;word-break:break-all;">${url}</p>
  <p style="margin:0;font-size:12px;color:#8b929e;">
    This link is personal to you — please do not forward it.
  </p>
</td></tr></table></td></tr></table></body></html>`

    const text =
      `${greeting}\n\nWelcome aboard. Please complete your onboarding form before your first day:\n\n${url}\n\n` +
      `It asks for your basic details, a passport-size photo and a copy of your Aadhaar card.\n` +
      `This link is personal to you — please do not forward it.`

    const message = await sendFromAccount(account, {
      to:      [input.email],
      subject: `Complete your onboarding — ${brand}`,
      html,
      text,
    })

    if (message.status === 'failed') {
      return ok(
        { invite, url, emailed: false, warning: message.error ?? 'The link was created but the email failed.' },
        { status: 201 },
      )
    }

    await markInviteSent(invite.id)
    return ok({ invite, url, emailed: true, to: input.email }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
