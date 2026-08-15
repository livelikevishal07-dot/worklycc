import 'server-only'
import { db } from '@/lib/db/supabase'

/**
 * Attachment blob storage on Supabase Storage.
 *
 * ClearLevel kept these bytes in S3; Workly has no S3, so the private
 * 'email-attachments' bucket (created in migration 016) stands in. Only the
 * service-role key can reach it — downloads go through a short-lived signed URL
 * issued by an authenticated route, never a public link.
 */

export const ATTACHMENT_BUCKET = 'email-attachments'

/** Seconds a download link stays valid. */
const SIGNED_URL_TTL = 60

export async function putBuffer(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await db()
    .storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, body, { contentType, upsert: true })
  if (error) throw error
}

export async function getBuffer(path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(ATTACHMENT_BUCKET).download(path)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

/** Short-lived download URL. `filename` makes the browser save rather than render. */
export async function signedDownloadUrl(
  path: string,
  filename?: string,
): Promise<string> {
  const { data, error } = await db()
    .storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL, filename ? { download: filename } : undefined)
  if (error) throw error
  return data.signedUrl
}

export async function removeObject(path: string): Promise<void> {
  const { error } = await db().storage.from(ATTACHMENT_BUCKET).remove([path])
  if (error) throw error
}
