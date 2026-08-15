import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Reversible encryption for mailbox passwords.
 *
 * IMAP/SMTP need the plaintext password to authenticate, so we cannot hash —
 * we encrypt with AES-256-GCM and decrypt only server-side (the sync + send
 * paths). The key comes from MAIL_ENCRYPTION_KEY.
 *
 * Stored format: base64( iv[12] | authTag[16] | ciphertext ).
 *
 * SECURITY: keep MAIL_ENCRYPTION_KEY out of the database and out of version
 * control. A leak of BOTH the DB and this key exposes mailbox passwords.
 */

const IV_LEN  = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const raw = process.env.MAIL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'MAIL_ENCRYPTION_KEY is not set. Add a long random string to .env.local (and to the Vercel project env).',
    )
  }
  // Derive a fixed 32-byte key from whatever string is provided.
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function encryptSecret(plain: string): string {
  const key    = getKey()
  const iv     = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct     = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptSecret(enc: string): string {
  const key      = getKey()
  const buf      = Buffer.from(enc, 'base64')
  const iv       = buf.subarray(0, IV_LEN)
  const tag      = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct       = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** True if a usable key is configured (for health checks / setup UI). */
export function hasEncryptionKey(): boolean {
  return Boolean(process.env.MAIL_ENCRYPTION_KEY)
}
