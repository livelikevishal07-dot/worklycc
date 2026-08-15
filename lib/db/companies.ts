import 'server-only'

import { db } from './supabase'
import type { Company } from './types'

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await db()
    .from('companies')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []) as Company[]
}

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await db()
    .from('companies')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Company | null
}

/** Letterhead fields shared by create and update. */
export interface CompanyLetterhead {
  address?:               string | null
  email?:                 string | null
  phone?:                 string | null
  website?:               string | null
  signatory_name?:        string | null
  signatory_designation?: string | null
}

export async function createCompany(input: {
  name: string
  slug: string
  industry?: string | null
  description?: string | null
  color?: string
} & CompanyLetterhead): Promise<Company> {
  const { data, error } = await db()
    .from('companies')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Company
}

export async function updateCompany(
  id: string,
  input: Partial<{
    name: string
    slug: string
    industry: string | null
    description: string | null
    color: string
  }> & CompanyLetterhead
): Promise<Company> {
  const { data, error } = await db()
    .from('companies')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Company
}

export async function deleteCompany(id: string): Promise<void> {
  const { error } = await db().from('companies').delete().eq('id', id)
  if (error) throw error
}
