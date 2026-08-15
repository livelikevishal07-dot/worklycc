import 'server-only'

import { db } from './supabase'
import type { LetterDoc, LetterType } from '@/lib/letters/content'

export interface EmployeeLetter {
  id:             string
  employee_id:    string | null
  company_id:     string | null
  type:           LetterType
  reference_no:   string | null
  subject:        string
  body:           LetterDoc
  employee_name:  string | null
  employee_email: string | null
  company_name:   string | null
  status:         'draft' | 'sent' | 'failed'
  sent_at:        string | null
  error:          string | null
  storage_path:   string | null
  created_at:     string
  updated_at:     string
}

/** How many letters of this type the company has already issued this year —
    drives the annual reference-number sequence. */
export async function countLettersThisYear(
  companyId: string | null, type: LetterType,
): Promise<number> {
  const yearStart = `${new Date().getFullYear()}-01-01T00:00:00.000Z`
  let q = db()
    .from('employee_letters')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .gte('created_at', yearStart)

  // Letters issued before any company was set still need a stable sequence.
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null)

  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function listLetters(employeeId?: string): Promise<EmployeeLetter[]> {
  let q = db().from('employee_letters').select('*')
  if (employeeId) q = q.eq('employee_id', employeeId)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []) as EmployeeLetter[]
}

export async function getLetter(id: string): Promise<EmployeeLetter | null> {
  const { data, error } = await db()
    .from('employee_letters')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as EmployeeLetter) ?? null
}

export async function recordLetter(input: {
  employeeId:    string
  companyId:     string | null
  type:          LetterType
  referenceNo:   string | null
  subject:       string
  doc:           LetterDoc
  employeeName:  string
  employeeEmail: string | null
  companyName:   string | null
  status:        'draft' | 'sent' | 'failed'
  error?:        string | null
  storagePath?:  string | null
}): Promise<EmployeeLetter> {
  const { data, error } = await db()
    .from('employee_letters')
    .insert({
      employee_id:    input.employeeId,
      company_id:     input.companyId,
      type:           input.type,
      reference_no:   input.referenceNo,
      subject:        input.subject,
      body:           input.doc,
      employee_name:  input.employeeName,
      employee_email: input.employeeEmail,
      company_name:   input.companyName,
      status:         input.status,
      sent_at:        input.status === 'sent' ? new Date().toISOString() : null,
      error:          input.error ?? null,
      storage_path:   input.storagePath ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as EmployeeLetter
}

export async function deleteLetter(id: string): Promise<void> {
  const { error } = await db().from('employee_letters').delete().eq('id', id)
  if (error) throw error
}
