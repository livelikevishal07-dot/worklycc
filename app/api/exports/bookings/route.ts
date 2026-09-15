import { NextRequest, NextResponse } from 'next/server'

import { listBookings } from '@/lib/db/bookings'
import { fail, fromError } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * Full booking export as CSV, for a date range.
 *
 * Built on the server rather than in the browser because the ranges people
 * actually want are large — six months is ~4,900 rows today. The existing
 * in-page export can only cover what the list already loaded; this does not
 * depend on that.
 *
 * Deliberately NOT under /api/bookings: that prefix is employee-reachable in
 * middleware.ts, so an export living there would hand any member of staff every
 * customer record and every amount. Under /api/exports it falls to the default
 * deny and is admin-only.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** RFC 4180: quote everything, double any embedded quote. Keeps commas,
 *  newlines and apostrophes in customer names from breaking the columns. */
function cell(v: unknown): string {
  if (v == null) return '""'
  return `"${String(v).replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const from = sp.get('from') ?? ''
    const to   = sp.get('to') ?? ''
    if (!DATE.test(from) || !DATE.test(to)) {
      return fail(400, 'from and to are required, as YYYY-MM-DD')
    }
    if (from > to) return fail(400, 'from must not be after to')

    // Money is included only when the caller says the figures are unlocked,
    // matching the on-screen mask. That mask is a privacy screen rather than
    // access control — an admin can always unlock it — so this mirrors the UI
    // rather than pretending to enforce something stronger.
    const withAmounts = sp.get('amounts') === '1'
    const employeeId  = sp.get('employee_id') || undefined

    const rows = await listBookings({
      from, to,
      employee_id: employeeId,
      withEmployee: true,
    })

    const headers = [
      'Order Date', 'Customer', 'Phone', 'City', 'Event Date',
      'Website', 'Occasion', 'Platform',
      ...(withAmounts ? ['Total', 'Advance', 'Pending'] : []),
      'Employee', 'Source Order ID', 'Recorded At',
    ]

    const lines = [headers.map(cell).join(',')]
    for (const b of rows) {
      lines.push([
        b.order_date, b.customer_name, b.customer_phone, b.city, b.event_date,
        b.website, b.occasion, b.booking_platform,
        ...(withAmounts
          ? [b.total_amount, b.advance_paid, b.total_amount - b.advance_paid]
          : []),
        b.employee?.full_name ?? '',
        b.external_order_id ?? '',
        b.created_at,
      ].map(cell).join(','))
    }

    // BOM so Excel opens it as UTF-8 — without it, ₹ and Indian names in the
    // customer column arrive as mojibake on a default Windows Excel.
    const csv = '﻿' + lines.join('\r\n') + '\r\n'

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bookings-${from}-to-${to}.csv"`,
        'Cache-Control':       'no-store',
        'X-Row-Count':         String(rows.length),
      },
    })
  } catch (err) {
    return fromError(err)
  }
}
