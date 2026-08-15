/**
 * Mailbox password encryption.
 *
 * The implementation moved to lib/crypto.ts once Aadhaar numbers needed the same
 * primitive; this re-export keeps the mail modules' imports unchanged and avoids
 * a second copy of the cipher code.
 */
export { decryptSecret, encryptSecret, hasEncryptionKey } from '@/lib/crypto'
