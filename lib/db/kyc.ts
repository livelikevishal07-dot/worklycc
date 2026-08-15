import 'server-only'
import { randomBytes } from 'node:crypto'

import { db } from './supabase'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

export type KycStatus = 'invited' | 'submitted' | 'approved' | 'rejected'
export type LetterKind = 'offer' | 'release'

/**
 * How the submission was started.
 *   invite   — one-off link emailed to a named person
 *   public   — someone opened the shared "general" link
 *   employee — an existing employee re-filling their own KYC
 *
 * This is what stops a re-KYC creating a duplicate employee on approval.
 */
export type KycSource = 'invite' | 'public' | 'employee'

export interface KycSubmission {
  id:            string
  token:         string
  status:        KycStatus
  source:        KycSource
  link_id:       string | null

  invited_name:  string | null
  invited_email: string | null
  company_id:    string | null
  invited_at:    string
  expires_at:    string | null
  sent_at:       string | null

  full_name:          string | null
  email:              string | null
  phone:              string | null
  alt_phone:          string | null
  date_of_birth:      string | null
  address:            string | null
  city:               string | null
  state:              string | null
  pincode:            string | null
  emergency_name:     string | null
  emergency_phone:    string | null
  emergency_relation: string | null
  designation:        string | null

  aadhaar_last4: string | null
  /** Ciphertext. Never send this to the client — use revealAadhaar(). */
  aadhaar_enc:   string | null

  photo_path:   string | null
  aadhaar_path: string | null
  letter_path:  string | null
  letter_kind:  LetterKind | null

  submitted_at: string | null
  reviewed_at:  string | null
  review_note:  string | null
  employee_id:  string | null

  created_at: string
  updated_at: string
}

/** Safe shape for the CMS list — no ciphertext. */
export type KycSummary = Omit<KycSubmission, 'aadhaar_enc'> & {
  company?: { id: string; name: string } | null
}

const LIST_SELECT =
  'id, token, status, source, link_id, invited_name, invited_email, company_id, invited_at, expires_at, sent_at, ' +
  'full_name, email, phone, alt_phone, date_of_birth, address, city, state, pincode, ' +
  'emergency_name, emergency_phone, emergency_relation, designation, aadhaar_last4, ' +
  'photo_path, aadhaar_path, letter_path, letter_kind, submitted_at, reviewed_at, review_note, ' +
  'employee_id, created_at, updated_at, company:companies ( id, name )'

/** Invite links live for this long unless overridden. */
const INVITE_TTL_DAYS = 30

export function newToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function createInvite(input: {
  name?:      string | null
  email?:     string | null
  companyId?: string | null
  ttlDays?:   number
}): Promise<KycSubmission> {
  const ttl = input.ttlDays ?? INVITE_TTL_DAYS
  const { data, error } = await db()
    .from('kyc_submissions')
    .insert({
      token:         newToken(),
      status:        'invited',
      invited_name:  input.name?.trim() || null,
      invited_email: input.email?.trim().toLowerCase() || null,
      company_id:    input.companyId ?? null,
      expires_at:    new Date(Date.now() + ttl * 86_400_000).toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error
  return data as KycSubmission
}

/* ── Reusable "general" link ──────────────────────────────────────────────── */

export interface KycPublicLink {
  id:         string
  token:      string
  label:      string | null
  company_id: string | null
  is_active:  boolean
  uses:       number
  created_at: string
}

export async function listPublicLinks(): Promise<KycPublicLink[]> {
  const { data, error } = await db()
    .from('kyc_public_links')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as KycPublicLink[]
}

export async function createPublicLink(input: {
  label?: string | null; companyId?: string | null
}): Promise<KycPublicLink> {
  const { data, error } = await db()
    .from('kyc_public_links')
    .insert({
      token:      newToken(),
      label:      input.label?.trim() || null,
      company_id: input.companyId ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as KycPublicLink
}

export async function setPublicLinkActive(id: string, active: boolean): Promise<void> {
  const { error } = await db()
    .from('kyc_public_links')
    .update({ is_active: active })
    .eq('id', id)
  if (error) throw error
}

export async function deletePublicLink(id: string): Promise<void> {
  const { error } = await db().from('kyc_public_links').delete().eq('id', id)
  if (error) throw error
}

export async function getPublicLinkByToken(token: string): Promise<KycPublicLink | null> {
  const { data, error } = await db()
    .from('kyc_public_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  return (data as KycPublicLink) ?? null
}

/**
 * Mint a private submission for someone who opened the shared link, so each
 * person fills their own form and never sees anyone else's answers.
 */
export async function startSubmissionFromLink(link: KycPublicLink): Promise<KycSubmission> {
  const { data, error } = await db()
    .from('kyc_submissions')
    .insert({
      token:      newToken(),
      status:     'invited',
      source:     'public',
      link_id:    link.id,
      company_id: link.company_id,
      expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error

  // Usage count is informational; a failure here must not lose the submission.
  try {
    await db().from('kyc_public_links')
      .update({ uses: link.uses + 1 })
      .eq('id', link.id)
  } catch { /* ignore */ }

  return data as KycSubmission
}

/* ── Re-KYC for an existing employee ──────────────────────────────────────── */

/**
 * The employee's own in-flight KYC, creating one if they have none open.
 * A partial unique index keeps this to one open row per employee.
 */
export async function getOrStartEmployeeSubmission(employee: {
  id: string; full_name: string; email: string | null; company_id: string | null
}): Promise<KycSubmission> {
  const { data: existing, error: findErr } = await db()
    .from('kyc_submissions')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('source', 'employee')
    .in('status', ['invited', 'submitted'])
    .maybeSingle()
  if (findErr) throw findErr
  if (existing) return existing as KycSubmission

  const { data, error } = await db()
    .from('kyc_submissions')
    .insert({
      token:         newToken(),
      status:        'invited',
      source:        'employee',
      employee_id:   employee.id,
      invited_name:  employee.full_name,
      invited_email: employee.email,
      company_id:    employee.company_id,
      // No expiry: staff should be able to finish their own KYC in their own time.
      expires_at:    null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as KycSubmission
}

/** Most recent finished KYC for an employee, for the "last updated" line. */
export async function latestEmployeeSubmission(employeeId: string): Promise<KycSubmission | null> {
  const { data, error } = await db()
    .from('kyc_submissions')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('source', 'employee')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return ((data ?? [])[0] as KycSubmission) ?? null
}

export async function listSubmissions(status?: KycStatus): Promise<KycSummary[]> {
  let q = db().from('kyc_submissions').select(LIST_SELECT)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  return (data ?? []) as unknown as KycSummary[]
}

export async function getSubmission(id: string): Promise<KycSummary | null> {
  const { data, error } = await db()
    .from('kyc_submissions')
    .select(LIST_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as KycSummary) ?? null
}

/** Token lookup for the public form. Returns null for unknown tokens. */
export async function getByToken(token: string): Promise<KycSubmission | null> {
  const { data, error } = await db()
    .from('kyc_submissions')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  return (data as KycSubmission) ?? null
}

export function inviteIsOpen(row: KycSubmission): { open: boolean; reason?: string } {
  if (row.status === 'approved') return { open: false, reason: 'This form has already been processed.' }
  if (row.status === 'rejected') return { open: false, reason: 'This form is no longer accepting responses.' }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { open: false, reason: 'This link has expired. Ask your contact for a new one.' }
  }
  return { open: true }
}

export interface KycSubmitInput {
  full_name:           string
  email:               string
  phone:               string
  alt_phone?:          string | null
  date_of_birth?:      string | null
  address:             string
  city?:               string | null
  state?:              string | null
  pincode?:            string | null
  emergency_name?:     string | null
  emergency_phone?:    string | null
  emergency_relation?: string | null
  designation?:        string | null
  aadhaarNumber?:      string | null
}

export async function saveSubmission(
  token: string, input: KycSubmitInput,
): Promise<KycSubmission> {
  const digits = (input.aadhaarNumber ?? '').replace(/\D/g, '')

  const { data, error } = await db()
    .from('kyc_submissions')
    .update({
      status:             'submitted',
      full_name:          input.full_name.trim(),
      email:              input.email.trim().toLowerCase(),
      phone:              input.phone.trim(),
      alt_phone:          input.alt_phone?.trim() || null,
      date_of_birth:      input.date_of_birth || null,
      address:            input.address.trim(),
      city:               input.city?.trim() || null,
      state:              input.state?.trim() || null,
      pincode:            input.pincode?.trim() || null,
      emergency_name:     input.emergency_name?.trim() || null,
      emergency_phone:    input.emergency_phone?.trim() || null,
      emergency_relation: input.emergency_relation?.trim() || null,
      designation:        input.designation?.trim() || null,
      // Only the last four digits stay readable; the rest is encrypted at rest.
      aadhaar_last4:      digits ? digits.slice(-4) : null,
      aadhaar_enc:        digits ? encryptSecret(digits) : null,
      submitted_at:       new Date().toISOString(),
    })
    .eq('token', token)
    .select('*')
    .single()
  if (error) throw error
  return data as KycSubmission
}

/** Record an uploaded document against the submission. */
export async function attachDocument(
  token: string,
  kind: 'photo' | 'aadhaar' | 'letter',
  path: string,
  letterKind?: LetterKind,
): Promise<void> {
  const patch: Record<string, unknown> =
    kind === 'photo'   ? { photo_path: path }
  : kind === 'aadhaar' ? { aadhaar_path: path }
  :                      { letter_path: path, letter_kind: letterKind ?? 'offer' }

  const { error } = await db().from('kyc_submissions').update(patch).eq('token', token)
  if (error) throw error
}

export async function setStatus(
  id: string, status: KycStatus, note?: string | null, employeeId?: string | null,
): Promise<void> {
  const { error } = await db()
    .from('kyc_submissions')
    .update({
      status,
      review_note: note ?? null,
      reviewed_at: new Date().toISOString(),
      ...(employeeId !== undefined ? { employee_id: employeeId } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function markInviteSent(id: string): Promise<void> {
  const { error } = await db()
    .from('kyc_submissions')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSubmission(id: string): Promise<void> {
  const { error } = await db().from('kyc_submissions').delete().eq('id', id)
  if (error) throw error
}

/** Full Aadhaar number, for the explicit admin-only reveal action. */
export async function revealAadhaar(id: string): Promise<string | null> {
  const { data, error } = await db()
    .from('kyc_submissions')
    .select('aadhaar_enc')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  const enc = (data as { aadhaar_enc: string | null } | null)?.aadhaar_enc
  return enc ? decryptSecret(enc) : null
}
