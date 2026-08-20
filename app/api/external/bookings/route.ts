import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createBooking, getBookingByExternalId } from '@/lib/db/bookings'
import { getBookingOptions } from '@/lib/db/booking-options'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/**
 * Public intake for bookings placed on the group's own websites
 * (Giftlaya, BalloonDekor, 7eventzz, …).
 *
 * Design notes:
 * - Auth is a shared bearer token from the environment. It was previously a
 *   literal in this file, which is committed to a PUBLIC repo — anyone could
 *   read it and post bookings into production.
 * - The endpoint is IDEMPOTENT when `external_order_id` is supplied: a retry
 *   returns the booking created the first time (200) instead of duplicating it.
 *   Checkout handlers retry, so without this every network blip inflates
 *   revenue reporting.
 * - Only `website` and one of amount/customer are genuinely required. Every
 *   other field falls back to the same placeholders the earlier integration
 *   used ("Customer" / "0000000000" / "Unknown" / "-"), because a booking
 *   landing with a placeholder city is recoverable, and a booking rejected
 *   with a 400 at checkout time is lost for good.
 */

/** The pseudo-employee website bookings are filed under — `bookings.employee_id`
 *  is NOT NULL, and no real person should be credited with an online order. */
const FALLBACK_EMPLOYEE_ID =
  process.env.WEBSITE_BOOKINGS_EMPLOYEE_ID ?? '3798f06d-83fe-4efa-9a43-e2ea10d409e8'

/** Business timezone — an order placed 11pm IST belongs to that day, not the UTC one. */
const TZ = process.env.WORKLY_TIMEZONE ?? 'Asia/Kolkata'

function businessToday(): string {
  // en-CA formats as YYYY-MM-DD, matching the date columns exactly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Accepts "1548", 1548, "1,548.00" — checkout payloads are inconsistent about this. */
const AMOUNT = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s₹]/g, ''))
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid amount' })
    return z.NEVER
  }
  return n
})

const createSchema = z.object({
  website:           z.string().trim().min(1).max(100),
  external_order_id: z.string().trim().min(1).max(100).optional(),
  employee_id:       z.string().uuid().optional(),
  order_date:        DATE.optional(),
  event_date:        DATE.optional(),
  customer_name:     z.string().trim().min(1).max(200).optional(),
  customer_phone:    z.string().trim().min(1).max(30).optional(),
  city:              z.string().trim().min(1).max(100).optional(),
  occasion:          z.string().trim().min(1).max(100).optional(),
  booking_platform:  z.string().trim().min(1).max(100).optional(),
  total_amount:      AMOUNT,
  advance_paid:      AMOUNT.optional(),
})

function checkAuth(req: NextRequest, expected: string): boolean {
  const header = req.headers.get('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return false
  const token = header.slice(7).trim()
  // Constant-time compare to avoid timing leaks
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/** Resolve a caller-supplied label against the configured options, ignoring
 *  case and spacing, and return the CANONICAL label so the DB stays clean
 *  ("giftlaya" and "Gift Laya" both store as "Giftlaya"). */
function canonical(labels: string[], value: string): string | null {
  const key = value.toLowerCase().replace(/\s+/g, '')
  return labels.find((l) => l.toLowerCase().replace(/\s+/g, '') === key) ?? null
}

export async function POST(req: NextRequest) {
  try {
    // Trim: secrets pasted into a dashboard, or piped into `vercel env add`
    // from a CRLF file, routinely arrive with trailing whitespace. Comparing
    // raw gives a 401 that looks exactly like a wrong token.
    const expected = process.env.BOOKINGS_API_TOKEN?.trim()
    // Fail closed: an unset token must never mean "no auth required".
    if (!expected) return fail(500, 'BOOKINGS_API_TOKEN is not configured')
    if (!checkAuth(req, expected)) return fail(401, 'Unauthorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = createSchema.parse(body)

    const options   = await getBookingOptions()
    const websites  = options.filter((o) => o.type === 'website').map((o) => o.label)
    const platforms = options.filter((o) => o.type === 'platform').map((o) => o.label)

    const website = canonical(websites, input.website)
    if (!website) {
      return fail(400, `Unknown website "${input.website}"`, { allowed: websites })
    }

    const platform = canonical(platforms, input.booking_platform ?? 'Website')
    if (!platform) {
      return fail(400, `Unknown platform "${input.booking_platform}"`, { allowed: platforms })
    }

    // Idempotency: a retry of an order already imported returns the original.
    if (input.external_order_id) {
      const existing = await getBookingByExternalId(website, input.external_order_id)
      if (existing) return ok(existing, { status: 200 })
    }

    const order_date = input.order_date ?? businessToday()

    try {
      const booking = await createBooking({
        employee_id:       input.employee_id ?? FALLBACK_EMPLOYEE_ID,
        website,
        booking_platform:  platform,
        external_order_id: input.external_order_id ?? null,
        order_date,
        // A gifting order with no chosen delivery date is fulfilled against the
        // order date — never leave event_date null, the calendar view keys on it.
        event_date:        input.event_date ?? order_date,
        customer_name:     input.customer_name  ?? 'Customer',
        customer_phone:    input.customer_phone ?? '0000000000',
        city:              input.city           ?? 'Unknown',
        occasion:          input.occasion       ?? '-',
        total_amount:      input.total_amount,
        advance_paid:      input.advance_paid ?? 0,
      })
      return ok(booking, { status: 201 })
    } catch (err) {
      // Two concurrent retries of the same order both clear the pre-check above;
      // the partial unique index settles it. Return the winner, not a 409.
      if ((err as { code?: string })?.code === '23505' && input.external_order_id) {
        const existing = await getBookingByExternalId(website, input.external_order_id)
        if (existing) return ok(existing, { status: 200 })
      }
      throw err
    }
  } catch (err) {
    return fromError(err)
  }
}
