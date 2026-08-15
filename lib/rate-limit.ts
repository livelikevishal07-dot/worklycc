import 'server-only'

/**
 * Best-effort in-memory rate limiter for login endpoints.
 *
 * Memory is per serverless instance and resets on cold start, so this is a
 * speed bump rather than a guarantee. It still defeats the realistic attack —
 * a script hammering one endpoint — which matters more now that the employee
 * login says whether the username or the password was wrong. A precise error
 * message makes usernames enumerable, so the number of attempts has to be
 * capped.
 */

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Stop the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 500) return
  for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key)
}

export interface RateLimitResult {
  allowed:       boolean
  remaining:     number
  retryAfterSec: number
}

export function checkRateLimit(
  key: string,
  maxAttempts = 10,
  windowMs = 10 * 60 * 1000,
): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSec: 0 }
  }

  bucket.count++
  if (bucket.count > maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }
  return { allowed: true, remaining: maxAttempts - bucket.count, retryAfterSec: 0 }
}

/** Call after a successful sign-in so a legitimate user isn't left throttled. */
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}
