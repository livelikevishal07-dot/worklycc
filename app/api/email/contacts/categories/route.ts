import { isAdminAuthenticated } from '@/lib/auth-admin'
import { listContactCategories } from '@/lib/db/email'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    return ok({ categories: await listContactCategories() })
  } catch (err) {
    return fromError(err)
  }
}
