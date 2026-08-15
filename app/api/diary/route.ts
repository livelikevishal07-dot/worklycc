import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  createDiaryEntry,
  listDiaryEntries,
  DIARY_PAGE_SIZE,
} from '@/lib/db/diary'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const categoryEnum = z.enum(['work', 'meeting', 'idea', 'personal', 'issue'])

const querySchema = z.object({
  q:        z.string().trim().max(200).optional(),
  date:     z.string().regex(DATE_RE).optional(),
  from:     z.string().regex(DATE_RE).optional(),
  to:       z.string().regex(DATE_RE).optional(),
  category: categoryEnum.optional(),
  tag:      z.string().trim().max(50).optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional(),
  offset:   z.coerce.number().int().min(0).optional(),
})

const createSchema = z.object({
  entry_date: z.string().regex(DATE_RE),
  title:      z.string().trim().max(200).nullable().optional(),
  content:    z.string().trim().min(1).max(20_000),
  category:   categoryEnum.optional().default('work'),
  tags:       z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
})

/** Normalise tags: lowercase, de-duplicated, empties dropped. */
function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean)))
}

export async function GET(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    // Drop blank params so `?q=` doesn't fail the regex/enum checks.
    const raw = Object.fromEntries(
      Array.from(req.nextUrl.searchParams.entries()).filter(([, v]) => v !== ''),
    )
    const filters = querySchema.parse(raw)

    return ok(await listDiaryEntries({ limit: DIARY_PAGE_SIZE, ...filters }))
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')

    const input = createSchema.parse(body)
    const entry = await createDiaryEntry({
      ...input,
      title: input.title?.trim() || null,
      tags:  normalizeTags(input.tags),
    })
    return ok(entry, { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
