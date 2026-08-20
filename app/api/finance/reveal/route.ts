import { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, fromError, ok } from '@/lib/http'
import { checkRateLimit, clientIp, resetRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Checks the passcode that unlocks the money figures on the bookings screens.
 *
 * The check is server-side on purpose. Putting it in the client bundle — via a
 * NEXT_PUBLIC_ variable or a literal — would mean shipping the passcode to
 * every browser and publishing it in a public GitHub repo, which is exactly
 * how the old bookings API token leaked.
 *
 * Scope, stated plainly: this hides figures on screen. It is a privacy screen
 * against someone glancing at the monitor or a shared screen, not access
 * control. The booking rows still travel to the browser so the charts can be
 * drawn, so anyone with the admin session and devtools can still read them.
 *
 * Admin-only by default: middleware.ts denies anything under /api that is not
 * explicitly listed as public or employee-reachable, and /api/finance is neither.
 */

const schema = z.object({ passcode: z.string().min(1).max(64) })

/** Constant-time compare so the response time doesn't leak digits. */
function matches(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  try {
    // Trimmed: a passcode set from a dashboard or piped from a CRLF file
    // arrives with trailing whitespace and fails in a way that looks like a
    // wrong code. Same trap the bookings token fell into.
    const expected = process.env.BOOKINGS_REVEAL_PASSCODE?.trim()
    if (!expected) return fail(500, 'BOOKINGS_REVEAL_PASSCODE is not configured')

    // Six digits is a small space. The caller is already an authenticated
    // admin, so this is a backstop rather than the main defence.
    const ip = clientIp(req.headers)
    const limit = checkRateLimit(`finance-reveal:${ip}`, 10, 10 * 60 * 1000)
    if (!limit.allowed) {
      return fail(429, `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`)
    }

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const { passcode } = schema.parse(body)

    if (!matches(passcode.trim(), expected)) {
      return fail(401, 'Incorrect passcode')
    }

    resetRateLimit(`finance-reveal:${ip}`)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
