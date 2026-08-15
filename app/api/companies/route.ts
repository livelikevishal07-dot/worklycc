import { NextRequest } from 'next/server'
import { z } from 'zod'

import { createCompany, listCompanies } from '@/lib/db/companies'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(140).optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(20).default('violet'),
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

export async function GET() {
  try {
    return ok(await listCompanies())
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = createSchema.parse(body)
    return ok(
      await createCompany({
        ...input,
        slug: input.slug ? slugify(input.slug) : slugify(input.name),
      }),
      { status: 201 }
    )
  } catch (err) {
    return fromError(err)
  }
}
