import { NextRequest } from 'next/server'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { bulkAddContacts, createContact, listContacts } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /[^\s<>(),;]+@[^\s<>(),;]+\.[^\s<>(),;]+/

/** Parse a pasted block: "Name <a@b.com>", bare addresses, comma/newline separated. */
function parseBulk(text: string): { name?: string; email: string }[] {
  const out: { name?: string; email: string }[] = []
  for (const token of text.split(/[\n,;]+/)) {
    const t = token.trim()
    if (!t) continue
    const m = t.match(EMAIL_RE)
    if (!m) continue
    const email = m[0]
    const name  = t.replace(email, '').replace(/[<>"()]/g, '').trim() || undefined
    out.push({ name, email })
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const category = req.nextUrl.searchParams.get('category') || undefined
    return ok({ contacts: await listContacts(category) })
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const category = String(body.category ?? 'General')

    // Bulk paste mode
    if (typeof body.bulk === 'string' && body.bulk.trim()) {
      const parsed = parseBulk(body.bulk)
      if (parsed.length === 0) return fail(400, 'No valid email addresses found.')
      const added = await bulkAddContacts(category, parsed)
      return ok({ added, found: parsed.length })
    }

    // Single contact
    const email = String(body.email ?? '').trim()
    if (!EMAIL_RE.test(email)) return fail(400, 'A valid email address is required.')

    const contact = await createContact({
      name:  body.name  ? String(body.name)  : null,
      email,
      category,
      notes: body.notes ? String(body.notes) : null,
    })
    if (!contact) return fail(409, 'That contact already exists in this category.')

    return ok({ contact }, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
