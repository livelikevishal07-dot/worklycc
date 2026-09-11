import 'server-only'

/**
 * Refuses to send to domains that are one typo away from a major provider.
 *
 * Why this exists: an employee record held `bj087508@gmil.com` — "gmil.com",
 * a character short of gmail.com. That domain is registered, has a live MX
 * (mail.yaxmail.net) and accepts mail, so nothing bounced and nothing looked
 * broken. Twenty-two messages were quietly delivered to a stranger over three
 * weeks: daily attendance reminders naming the employee and his employer, and
 * a birthday email addressed to him by name.
 *
 * A bounce is a bad address announcing itself. A typo-squatted domain is a bad
 * address staying silent, which is why this needs a check rather than waiting
 * for a delivery failure that never comes.
 *
 * Deliberately a small, curated list of lookalikes for providers that actually
 * appear in this data — not a general spell-checker. A false positive here
 * blocks a real person's mail, so the bar for adding an entry is that the
 * domain is a plausible typo AND not a legitimate mail destination.
 */

const LOOKALIKE_DOMAINS = new Set([
  // gmail.com
  'gmil.com', 'gmai.com', 'gmial.com', 'gamil.com', 'gmaill.com', 'gmali.com',
  'gnail.com', 'gmail.co', 'gmail.cm', 'gmail.con', 'gmaail.com', 'ggmail.com',
  // yahoo.com
  'yaho.com', 'yahooo.com', 'yahoo.co', 'yhaoo.com', 'yahoo.con',
  // hotmail.com
  'hotmai.com', 'hotmial.com', 'hotmail.co', 'hotmail.con', 'hotmall.com',
  // outlook.com
  'outlok.com', 'outllook.com', 'outlook.co', 'outlook.con', 'oulook.com',
  // rediffmail.com — common in India
  'rediffmail.co', 'redifmail.com', 'rediffmial.com',
])

export interface AddressCheck {
  ok:      boolean
  /** Addresses that must not be sent to, with the reason. */
  blocked: { address: string; reason: string }[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function domainOf(address: string): string {
  return address.trim().toLowerCase().split('@')[1] ?? ''
}

/** True when the domain is a known lookalike of a major provider. */
export function isLookalikeDomain(address: string): boolean {
  return LOOKALIKE_DOMAINS.has(domainOf(address))
}

/**
 * Check every recipient before a send. Returns the offenders rather than
 * throwing, so the caller can record a useful failure the admin will see.
 */
export function checkRecipients(addresses: string[]): AddressCheck {
  const blocked: { address: string; reason: string }[] = []
  for (const raw of addresses) {
    const address = raw.trim()
    if (!address) continue
    if (!EMAIL_RE.test(address)) {
      blocked.push({ address, reason: 'not a valid email address' })
      continue
    }
    if (isLookalikeDomain(address)) {
      const domain = domainOf(address)
      blocked.push({
        address,
        reason: `"${domain}" looks like a typo of a well-known provider and is not a domain this system will send to. Correct the address on the employee record.`,
      })
    }
  }
  return { ok: blocked.length === 0, blocked }
}

/** One-line summary for the message row's error column. */
export function describeBlocked(blocked: { address: string; reason: string }[]): string {
  return `Blocked before sending — ${blocked.map((b) => `${b.address}: ${b.reason}`).join('; ')}`
}
