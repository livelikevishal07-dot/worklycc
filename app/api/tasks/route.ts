import { NextRequest } from 'next/server'
import { z } from 'zod'

import { createTask, getEmployeeTaskStats, getTaskStats, listTasks, listTasksByEmployee, type TaskRow } from '@/lib/db/tasks'
import { fail, fromError, ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
const statusSchema = z.enum(['todo', 'in_progress', 'review', 'done', 'blocked'])

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: prioritySchema,
  status: statusSchema.optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  employee_ids: z.array(z.string().uuid()).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const employeeId = sp.get('employee_id')

    // Employee-scoped stats
    if (sp.get('stats') === '1' && employeeId) {
      return ok(await getEmployeeTaskStats(employeeId))
    }
    // Global stats
    if (sp.get('stats') === '1') {
      return ok(await getTaskStats())
    }
    // Employee-scoped task list (dashboard widget + My Tasks page)
    if (employeeId) {
      return ok(
        await listTasksByEmployee(employeeId, {
          status: (sp.get('status') as TaskRow['status'] | null) ?? undefined,
          priority: (sp.get('priority') as TaskRow['priority'] | null) ?? undefined,
          search: sp.get('search') ?? undefined,
          // Dashboard card asks for the recent window; the My Tasks page does not.
          scope: sp.get('scope') === 'dashboard' ? 'dashboard' : 'all',
        })
      )
    }
    // Admin-level full list
    return ok(
      await listTasks({
        status: (sp.get('status') as TaskRow['status'] | null) ?? undefined,
        priority: (sp.get('priority') as TaskRow['priority'] | null) ?? undefined,
        company_id: sp.get('company_id') ?? undefined,
        limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      })
    )
  } catch (err) {
    return fromError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const input = createSchema.parse(body)
    return ok(await createTask(input), { status: 201 })
  } catch (err) {
    return fromError(err)
  }
}
