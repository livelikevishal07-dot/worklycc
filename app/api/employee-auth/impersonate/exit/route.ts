import { clearImpersonationCookie, clearSessionCookie } from '@/lib/auth'
import { ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/**
 * Leave an impersonated session. Drops the employee session and the marker; the
 * admin's own CMS cookie was never touched, so the caller lands back in the CMS
 * still signed in.
 *
 * Deliberately unguarded: this only ever removes credentials, so the worst an
 * unauthenticated caller can do is log themselves out.
 */
export async function POST() {
  clearSessionCookie()
  clearImpersonationCookie()
  return ok({ ok: true })
}
