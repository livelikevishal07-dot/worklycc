import { NextRequest } from 'next/server'
import { z } from 'zod'

import { deleteCompany, getCompany, updateCompany } from '@/lib/db/companies'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(140).optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(20).optional(),
  address:               z.string().trim().max(400).nullable().optional(),
  email:                 z.string().trim().max(200).nullable().optional(),
  phone:                 z.string().trim().max(40).nullable().optional(),
  website:               z.string().trim().max(200).nullable().optional(),
  signatory_name:        z.string().trim().max(120).nullable().optional(),
  signatory_designation: z.string().trim().max(120).nullable().optional(),
})

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const company = await getCompany(params.id)
    if (!company) return fail(404, 'Company not found')
    return ok(company)
  } catch (err) {
    return fromError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = updateSchema.parse(body)
    return ok(
      await updateCompany(params.id, {
        ...input,
        slug: input.slug
          ? slugify(input.slug)
          : input.name
            ? slugify(input.name)
            : undefined,
      })
    )
  } catch (err) {
    return fromError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteCompany(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
