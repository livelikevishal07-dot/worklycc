import { type NextRequest, NextResponse } from 'next/server'

// Inlined here to avoid pulling node:crypto into the Edge runtime bundle.
// Keep in sync with lib/auth-admin.ts and lib/auth.ts.
const ADMIN_COOKIE    = 'officely_admin_session'
const EMPLOYEE_COOKIE = 'officely_employee_session'
const SESSION_SEP     = '.'

// ── Edge-compatible HMAC verify ───────────────────────────────────────────────
// Mirrors the node:crypto signing in lib/auth-admin.ts / lib/auth.ts using the
// Web Crypto API, which is what the Edge runtime provides.

async function hmacBase64Url(secretVal: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secretVal), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') // base64url
}

/** Constant-time string compare. */
function sameSig(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(SESSION_SEP)
    if (parts.length !== 3) return false
    const [role, expStr, sig] = parts
    if (role !== 'admin') return false

    const exp = Number(expStr)
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false

    const secretVal = process.env.ADMIN_AUTH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    if (!secretVal) return false

    return sameSig(sig, await hmacBase64Url(secretVal, `${role}${SESSION_SEP}${expStr}`))
  } catch {
    return false
  }
}

async function verifyEmployeeToken(token: string): Promise<boolean> {
  try {
    const parts = token.split(SESSION_SEP)
    if (parts.length !== 3) return false
    const [employeeId, expStr, sig] = parts
    if (!employeeId) return false

    const exp = Number(expStr)
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false

    // Mirrors lib/auth.ts: EMPLOYEE_AUTH_SECRET is unset in production and
    // falls back to the service-role key. Changing that logs everyone out.
    const secretVal = process.env.EMPLOYEE_AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!secretVal) return false

    return sameSig(sig, await hmacBase64Url(secretVal, `${employeeId}${SESSION_SEP}${expStr}`))
  } catch {
    return false
  }
}

// ── API route classification ──────────────────────────────────────────────────
//
// Until now only /cms pages were guarded, which left ~50 API routes reachable by
// anyone on the internet — /api/employees, /api/payroll, /api/reports and the
// rest returned live data with no session at all. The guard below is DEFAULT
// DENY: anything under /api that isn't explicitly listed as public requires an
// admin session, so a route added later is protected before anyone remembers to
// protect it.

/** Genuinely public — these carry their own auth or are the login endpoints. */
const PUBLIC_API_EXACT = new Set([
  '/api/admin-auth/login',
  '/api/admin-auth/logout',
  '/api/employee-auth/login',
  '/api/employee-auth/logout',
  '/api/external/bookings',   // bearer token, checked in the route
])

const PUBLIC_API_PREFIX = [
  '/api/cron/',       // CRON_SECRET bearer, checked in the route
  '/api/kyc/form/',   // public KYC form, authorised by the token in the URL
]

/**
 * Reachable with EITHER an employee session or an admin session — these back
 * the employee portal. Everything not listed here is admin-only.
 */
const EMPLOYEE_API_PREFIX = [
  '/api/announcements',
  '/api/attendance',
  '/api/booking-options',
  '/api/bookings',
  '/api/employee/',
  '/api/employee-auth/impersonate/',
  '/api/employees',          // portal reads the colleague list
  '/api/holidays',
  '/api/leaderboard',
  '/api/leave-entitlements',
  '/api/leave-policy',
  '/api/leave-requests',
  '/api/notes',
  '/api/push/',
  '/api/recurring-tasks',
  '/api/tasks',
]

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p))
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isApi = pathname.startsWith('/api/')
  const isCms = pathname === '/cms' || pathname.startsWith('/cms/')
  if (!isApi && !isCms) return NextResponse.next()

  if (isApi) {
    if (PUBLIC_API_EXACT.has(pathname)) return NextResponse.next()
    if (matchesPrefix(pathname, PUBLIC_API_PREFIX)) return NextResponse.next()

    const adminOk = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value ?? '')
    if (adminOk) return NextResponse.next()

    if (matchesPrefix(pathname, EMPLOYEE_API_PREFIX)) {
      const employeeOk = await verifyEmployeeToken(req.cookies.get(EMPLOYEE_COOKIE)?.value ?? '')
      if (employeeOk) return NextResponse.next()
    }

    // JSON, not a redirect — the caller is fetch(), not a browser navigation.
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  // CMS pages: redirect to the login form, preserving the requested path.
  if (!(await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value ?? ''))) {
    const loginUrl    = req.nextUrl.clone()
    loginUrl.pathname = '/admin-login'
    loginUrl.search   = `?from=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/cms', '/cms/:path*', '/api/:path*'],
}
