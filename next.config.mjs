/**
 * Baseline security headers. Applied to every route.
 *
 * Deliberately NOT setting a Content-Security-Policy here. Next.js injects
 * inline hydration scripts, so a useful CSP needs per-request nonces, and the
 * mail client renders untrusted email HTML in an iframe that would need its own
 * rules. Getting that wrong breaks pages silently, and this admin UI has never
 * been clicked through end to end. It is worth doing as a follow-up, with the
 * screens actually exercised — not blind.
 */
const securityHeaders = [
  // Browsers refuse plain HTTP for this host for a year, including subdomains.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Stop the browser guessing a response is a script when the server said it isn't.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Clickjacking: nothing outside this origin may frame the CMS or the portal.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Don't leak CMS paths (which contain employee ids) to external sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app uses none of these; deny them outright.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework and version to anyone fingerprinting the host.
  poweredByHeader: false,

  // Barrel-file imports pull far more than they use. lucide-react is the worst
  // offender here — every icon import reaches a module that re-exports ~1,500 of
  // them. This rewrites them to direct per-icon imports at build time.
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },

  async headers() {
    return [
      {
        // Service workers must be served with these headers:
        // - Service-Worker-Allowed: / → grants root scope even though file is at /sw.js
        // - Cache-Control: no-cache  → browser always revalidates so SW updates are picked up
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
export default nextConfig
