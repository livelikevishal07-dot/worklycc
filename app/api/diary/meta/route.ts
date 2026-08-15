import { isAdminAuthenticated } from '@/lib/auth-admin'
import { getDiaryStats, listDiaryTags } from '@/lib/db/diary'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** Header stats + the distinct tag list that powers the tag filter. */
export async function GET() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const [stats, tags] = await Promise.all([getDiaryStats(), listDiaryTags()])
    return ok({ stats, tags })
  } catch (err) {
    return fromError(err)
  }
}
