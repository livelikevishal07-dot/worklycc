import 'server-only'
import { db } from '@/lib/db/supabase'

/**
 * KYC document storage — ID scans and photos, in their own private bucket so
 * they are never mixed with mail attachments and can be wiped independently.
 */

export const KYC_BUCKET = 'kyc-documents'

/** Signed download links are short-lived; these documents are sensitive. */
const SIGNED_URL_TTL = 60

/** Aadhaar scans and letters may be a photo or a PDF. */
export const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
] as const

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024   // 8 MB

export function extensionFor(contentType: string, fallbackName: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'application/pdf': 'pdf',
  }
  if (map[contentType]) return map[contentType]
  const guess = fallbackName.split('.').pop()?.toLowerCase()
  return guess && /^[a-z0-9]{1,5}$/.test(guess) ? guess : 'bin'
}

export async function putKycFile(
  path: string, body: Buffer, contentType: string,
): Promise<void> {
  const { error } = await db()
    .storage.from(KYC_BUCKET)
    .upload(path, body, { contentType, upsert: true })
  if (error) throw error
}

export async function kycSignedUrl(path: string, download = false): Promise<string> {
  const { data, error } = await db()
    .storage.from(KYC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL, download ? { download: true } : undefined)
  if (error) throw error
  return data.signedUrl
}

export async function removeKycFiles(paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean)
  if (clean.length === 0) return
  const { error } = await db().storage.from(KYC_BUCKET).remove(clean)
  if (error) throw error
}
