import { clearImpersonationCookie, clearSessionCookie } from '@/lib/auth'
import { ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function POST() {
  clearSessionCookie()
  // Also drop any impersonation marker, so a stale one can't outlive the
  // session it described and mislabel a later real login as impersonated.
  clearImpersonationCookie()
  return ok({ ok: true })
}
