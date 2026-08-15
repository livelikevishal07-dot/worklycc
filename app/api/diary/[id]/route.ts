import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import { deleteDiaryEntry, updateDiaryEntry } from '@/lib/db/diary'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const categoryEnum = z.enum(['work', 'meeting', 'idea', 'personal', 'issue'])

const patchSchema = z.object({
  entry_date: z.string().regex(DATE_RE).optional(),
  title:      z.string().trim().max(200).nullable().optional(),
  content:    z.string().trim().min(1).max(20_000).optional(),
  category:   categoryEnum.optional(),
  tags:       z.array(z.string().trim().min(1).max(50)).max(20).optional(),
})

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean)))
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')

    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')

    const input = patchSchema.parse(body)
    if (Object.keys(input).length === 0) return fail(400, 'Nothing to update')

    return ok(
      await updateDiaryEntry(params.id, {
        ...input,
        ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
        ...(input.tags  !== undefined ? { tags: normalizeTags(input.tags) }    : {}),
      }),
    )
  } catch (err) {
    return fromError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    await deleteDiaryEntry(params.id)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}
