import { type NextRequest, NextResponse } from 'next/server'

// Inlined here to avoid pulling node:crypto into the Edge runtime bundle.
// Keep in sync with lib/auth-admin.ts and lib/auth.ts.
const ADMIN_COOKIE    = 'officely_admin_session'
const EMPLOYEE_COOKIE = 'officely_employee_session'
const SESSION_SEP     = '.'

// ── Edge-compatible HMAC verify ───────────────────────────────────────────────
// Mirrors the node:crypto signing in lib/auth-admin.ts / lib/auth.ts using the
// Web Crypto API, which is what the Edge runtime provides. If you change this,
// re-check that both produce identical signatures — a mismatch locks out every
// employee and the admin, and does it silently.

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

// ── Content Security Policy ───────────────────────────────────────────────────
//
// Nonce-based, regenerated per request. Next.js reads the nonce out of the CSP
// header we set on the *request* and stamps it onto its own <script> tags, so
// its hydration scripts run while an injected one does not.
//
// `strict-dynamic` means the browser ignores host allowlists for scripts and
// trusts only the nonce plus whatever the nonced bootstrap loads. That is the
// whole point: an attacker who manages to inject a <script> into a page cannot
// guess the nonce, so it never executes. This app has no inline scripts of its
// own and no next/script, which is what makes it practical here.
//
// Where it is deliberately loose:
// - style-src 'unsafe-inline' — React style={{…}} attributes and Next's own
//   injected styles. Nonces cannot cover style attributes, and CSS injection is
//   a far smaller problem than script injection.
// - img-src https: — the mail client renders real emails, which reference
//   images on arbitrary hosts. Locking this down would break every newsletter
//   in the inbox to prevent a threat images do not really pose. Employee
//   avatars and KYC scans come from Supabase Storage over https too.
// - 'unsafe-eval' in development only — the dev server's HMR needs it.

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development'
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.supabase.co`,
    // The mail client shows message bodies in a sandbox="" srcDoc iframe, and
    // letter previews render generated PDFs from blob: URLs.
    `frame-src 'self' blob: data:`,
    `worker-src 'self' blob:`,          // push notifications register /sw.js
    `manifest-src 'self'`,              // PWA manifest
    `base-uri 'self'`,                  // stop <base> rewriting relative URLs
    `form-action 'self'`,               // logins cannot be posted to another host
    `frame-ancestors 'self'`,           // clickjacking, and it outranks X-Frame-Options
    `object-src 'none'`,                // no Flash/Java/embed vectors
    `upgrade-insecure-requests`,
  ].join('; ')
}

function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

// ── API route classification ──────────────────────────────────────────────────
//
// DEFAULT DENY: anything under /api that isn't explicitly listed as public
// requires an admin session, so a route added later is protected before anyone
// remembers to protect it.

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

  // ── API: auth only. A CSP on a JSON response protects nothing. ─────────────
  if (isApi) {
    if (PUBLIC_API_EXACT.has(pathname)) return NextResponse.next()
    if (matchesPrefix(pathname, PUBLIC_API_PREFIX)) return NextResponse.next()

    if (await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value ?? '')) {
      return NextResponse.next()
    }

    if (matchesPrefix(pathname, EMPLOYEE_API_PREFIX)) {
      if (await verifyEmployeeToken(req.cookies.get(EMPLOYEE_COOKIE)?.value ?? '')) {
        return NextResponse.next()
      }
    }

    // JSON, not a redirect — the caller is fetch(), not a browser navigation.
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  // ── Pages: CSP for all of them, plus the admin gate on /cms ────────────────
  const nonce = makeNonce()
  const csp   = buildCsp(nonce)

  const isCms = pathname === '/cms' || pathname.startsWith('/cms/')
  if (isCms && !(await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value ?? ''))) {
    const loginUrl    = req.nextUrl.clone()
    loginUrl.pathname = '/admin-login'
    loginUrl.search   = `?from=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(loginUrl)
  }

  // Next.js parses the nonce out of the CSP header on the REQUEST to stamp its
  // own script tags; the header on the RESPONSE is what the browser enforces.
  // Both are required — setting only one silently produces a page whose scripts
  // are all blocked.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, which need no CSP and would only pay the
     * middleware round trip. Kept broad on purpose: the CSP has to reach the
     * employee portal, the login screens and the public KYC forms, not just /cms.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|json)$).*)',
  ],
}
