import { NextRequest } from 'next/server'
import { z } from 'zod'

import { isAdminAuthenticated } from '@/lib/auth-admin'
import {
  AUTOMATION_KINDS, listSettings, recentLog, updateSetting, type AutomationKind,
} from '@/lib/db/automations'
import { runAutomations } from '@/lib/automations/run'
import { fail, fromError, ok } from '@/lib/http'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const kindEnum = z.enum(AUTOMATION_KINDS as [AutomationKind, ...AutomationKind[]])

const patchSchema = z.object({
  kind:       kindEnum,
  enabled:    z.boolean().optional(),
  send_email: z.boolean().optional(),
  send_push:  z.boolean().optional(),
  config:     z.record(z.unknown()).optional(),
})

const runSchema = z.object({
  run:  z.literal(true),
  kind: kindEnum.optional(),
})

export async function GET() {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const [settings, log] = await Promise.all([listSettings(), recentLog(40)])
    return ok({ settings, log })
  } catch (err) {
    return fromError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const { kind, ...patch } = patchSchema.parse(body)
    if (Object.keys(patch).length === 0) return fail(400, 'Nothing to update')
    await updateSetting(kind, patch)
    return ok({ ok: true })
  } catch (err) {
    return fromError(err)
  }
}

/** "Run now" from the settings panel — same engine and dedupe as the cron. */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated()) return fail(401, 'Not authorized')
    const body = await req.json().catch(() => null)
    if (!body) return fail(400, 'Invalid JSON body')
    const { kind } = runSchema.parse(body)
    return ok(await runAutomations(kind))
  } catch (err) {
    return fromError(err)
  }
}
