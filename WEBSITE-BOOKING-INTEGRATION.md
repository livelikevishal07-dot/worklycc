# Website → Workly booking intake

How Giftlaya, BalloonDekor and 7eventzz push orders straight into Workly's
Bookings module, so nobody re-types them.

---

## 1. The endpoint

```
POST https://www.workly.cc/api/external/bookings
Authorization: Bearer <BOOKINGS_API_TOKEN>
Content-Type: application/json
```

| Response | Meaning |
|---|---|
| `201` | Booking created |
| `200` | This `external_order_id` was already imported — the original row is returned. **Not an error.** |
| `400` | Bad payload. `details` lists what was allowed. |
| `401` | Wrong/missing token |
| `500` | Token not configured on the Workly side |

### Fields

Only `website` and `total_amount` are required. Everything else has a sensible
fallback, because a booking that lands with `city: "Unknown"` is fixable in the
CMS, while a booking rejected at checkout is gone forever.

| Field | Required | Default if omitted |
|---|---|---|
| `website` | **yes** | — one of `Giftlaya`, `BalloonDekor`, `7eventzz`, `Gift Hamper`, `Name Board` (case/space-insensitive) |
| `total_amount` | **yes** | — accepts `2548`, `"2548"`, `"2,548.00"` |
| `external_order_id` | strongly recommended | none — **omit it and retries create duplicates** |
| `advance_paid` | no | `0` |
| `order_date` | no | today, Asia/Kolkata |
| `event_date` | no | same as `order_date` |
| `customer_name` | no | `"Customer"` |
| `customer_phone` | no | `"0000000000"` |
| `city` | no | `"Unknown"` |
| `occasion` | no | `"-"` |
| `booking_platform` | no | `"Website"` |
| `employee_id` | no | the **Website Auto** pseudo-employee |

### Why `external_order_id` matters

It is the site's own order number. Workly stores it and enforces one booking per
`(website, order_id)`. That makes the endpoint **idempotent** — safe to call
twice, safe to retry, safe to replay after an outage. Without it, every retry
becomes a second booking and inflates the revenue figures on
`/cms/bookings/analysis`.

---

## 2. Drop this into each website

`lib/workly.ts` — identical in all three repos; only the env vars differ.

```ts
import 'server-only'

/**
 * Push a completed order into Workly's Bookings module.
 *
 * Never throws. A reporting integration must not be able to fail a customer's
 * checkout — if Workly is unreachable the order still completes and we log it
 * for a manual replay.
 */
export async function sendBookingToWorkly(order: {
  orderId:  string | number
  name?:    string | null
  phone?:   string | null
  city?:    string | null
  total:    number | string
  advance?: number | string | null
  occasion?:  string | null
  eventDate?: string | null   // 'YYYY-MM-DD'
}): Promise<{ ok: boolean; status?: number }> {
  const endpoint = process.env.WORKLY_BOOKINGS_URL
    ?? 'https://www.workly.cc/api/external/bookings'
  const token   = process.env.WORKLY_BOOKINGS_TOKEN
  const website = process.env.WORKLY_WEBSITE_NAME   // 'Giftlaya' | 'BalloonDekor' | '7eventzz'

  if (!token || !website) {
    console.error('[workly] WORKLY_BOOKINGS_TOKEN / WORKLY_WEBSITE_NAME not set')
    return { ok: false }
  }

  const body = {
    website,
    external_order_id: String(order.orderId),
    total_amount:      order.total,
    advance_paid:      order.advance ?? undefined,
    customer_name:     order.name?.trim()  || undefined,
    customer_phone:    order.phone?.trim() || undefined,
    city:              order.city?.trim()  || undefined,
    occasion:          order.occasion?.trim() || undefined,
    event_date:        order.eventDate || undefined,
  }

  // Two attempts. The endpoint is idempotent on external_order_id, so a retry
  // after an ambiguous timeout cannot double-book.
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Never let a slow third party hold a checkout response open.
    const abort = AbortSignal.timeout(4000)
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body:   JSON.stringify(body),
        signal: abort,
        cache:  'no-store',
      })

      // 200 = already imported, 201 = created. Both are success.
      if (res.ok) return { ok: true, status: res.status }

      // 4xx is our bug (bad payload / bad token) — retrying cannot fix it.
      if (res.status >= 400 && res.status < 500) {
        console.error('[workly] rejected', res.status, await res.text().catch(() => ''))
        return { ok: false, status: res.status }
      }
    } catch (err) {
      console.error(`[workly] attempt ${attempt} failed`, err)
    }
  }

  // Log loudly enough that the order can be replayed by hand.
  console.error('[workly] GAVE UP — order not in Workly:', order.orderId)
  return { ok: false }
}
```

### Call it where the order is confirmed

Put this **after** the order is saved and payment is confirmed — never before,
or failed payments end up in the bookings report.

```ts
// app/api/checkout/confirm/route.ts  (or wherever the order is finalised)
import { sendBookingToWorkly } from '@/lib/workly'

const order = await saveOrder(...)          // your existing code

await sendBookingToWorkly({
  orderId:   order.id,
  name:      order.customerName,
  phone:     order.phone,
  city:      order.shippingCity,
  total:     order.total,
  advance:   order.amountPaid,
  occasion:  order.occasion,
  eventDate: order.deliveryDate,            // 'YYYY-MM-DD'
})

return Response.json({ ok: true, orderId: order.id })
```

**`await` it — don't fire and forget.** On Vercel the serverless function is
killed the moment it responds, so an un-awaited promise is silently dropped.
The call is capped at 4s and cannot throw, so awaiting is safe. If your platform
supports it, `waitUntil(sendBookingToWorkly(...))` is the better option.

### Env vars on each website

```
WORKLY_BOOKINGS_TOKEN=<the shared token>
WORKLY_WEBSITE_NAME=Giftlaya        # or BalloonDekor / 7eventzz
```

Set them in `.env.local` **and** in the site's Vercel production environment.

---

## 3. Testing an integration

```bash
curl -i -X POST https://www.workly.cc/api/external/bookings \
  -H "Authorization: Bearer $WORKLY_BOOKINGS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"website":"Giftlaya","external_order_id":"SMOKE-1","total_amount":100}'
```

Run it **twice**. First call returns `201`, second returns `200` with the same
`id`. That proves auth and de-duplication in one go. Delete the row from
`/cms/bookings/list` afterwards.

---

## 4. If something breaks

| Symptom | Cause |
|---|---|
| `401` | Token mismatch between the site and Workly's `BOOKINGS_API_TOKEN`. Remember Vercel needs a **redeploy** after an env change. |
| `400 Unknown website` | `WORKLY_WEBSITE_NAME` isn't in Settings → Booking Options. |
| `500 BOOKINGS_API_TOKEN is not configured` | The env var is missing on Workly's Vercel project. |
| Orders missing, no errors | The call is un-awaited and being killed. See above. |
| Duplicates | `external_order_id` isn't being sent. |
