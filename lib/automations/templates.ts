import 'server-only'

/**
 * Email bodies for the scheduled automations.
 *
 * Same constraints as the letter emails: tables and inline styles, because
 * Outlook ignores <style> blocks and modern CSS. One shared shell keeps every
 * automated message looking like it came from the same company.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface ShellOptions {
  brand:    string
  accent:   string
  heading:  string
  body:     string[]
  footer?:  string
}

function shell({ brand, accent, heading, body, footer }: ShellOptions): string {
  const paragraphs = body.map((p) => `<p style="margin:0 0 14px;">${p}</p>`).join('')
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;
              font-family:Helvetica,Arial,sans-serif;color:#1f2430;font-size:15px;line-height:1.65;">
  <tr><td style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 32px 8px;">
    <div style="font-size:13px;font-weight:bold;color:#8b929e;letter-spacing:0.4px;text-transform:uppercase;">${esc(brand)}</div>
    <h1 style="margin:6px 0 16px;font-size:22px;line-height:1.3;color:#111827;">${heading}</h1>
  </td></tr>
  <tr><td style="padding:0 32px 24px;">${paragraphs}</td></tr>
  ${footer ? `<tr><td style="padding:0 32px 26px;">
    <div style="border-top:1px solid #e2e5ea;padding-top:12px;font-size:12px;color:#8b929e;">${footer}</div>
  </td></tr>` : ''}
</table></td></tr></table></body></html>`
}

function toText(heading: string, body: string[], brand: string): string {
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  return [brand, '', strip(heading), '', ...body.map(strip), ''].join('\n')
}

export interface BuiltEmail {
  subject: string
  html:    string
  text:    string
}

/* ── Birthday ─────────────────────────────────────────────────────────────── */

export function birthdayEmail(name: string, brand: string): BuiltEmail {
  const heading = `Happy birthday, ${esc(name.split(' ')[0])}! 🎉`
  const body = [
    `Wishing you a wonderful day and a brilliant year ahead.`,
    `Thank you for everything you bring to the team — we are glad to have you with us.`,
    `Have a great one!`,
  ]
  return {
    subject: `Happy Birthday, ${name.split(' ')[0]}! 🎂`,
    html: shell({ brand, accent: '#F2B544', heading, body, footer: `With warm wishes from everyone at ${esc(brand)}.` }),
    text: toText(heading, body, brand),
  }
}

/* ── Work anniversary ─────────────────────────────────────────────────────── */

export function anniversaryEmail(name: string, years: number, brand: string): BuiltEmail {
  const label   = years === 1 ? '1 year' : `${years} years`
  const heading = `${esc(years === 1 ? 'One year' : `${years} years`)} with ${esc(brand)} 🎊`
  const body = [
    `Congratulations, ${esc(name.split(' ')[0])} — today marks <strong>${esc(label)}</strong> since you joined us.`,
    `Thank you for the work, the consistency and the part you have played in getting us here.`,
    `Here's to the year ahead.`,
  ]
  return {
    subject: `Congratulations on ${label} at ${brand}!`,
    html: shell({ brand, accent: '#22C58B', heading, body, footer: `From the whole team at ${esc(brand)}.` }),
    text: toText(heading, body, brand),
  }
}

/* ── Late arrival ─────────────────────────────────────────────────────────── */

export function lateArrivalEmail(
  name: string, brand: string, expectedTime: string, graceMinutes: number,
): BuiltEmail {
  const heading = `We haven't seen you clock in yet`
  const body = [
    `Hi ${esc(name.split(' ')[0])},`,
    `Our records show no attendance entry for today, and your day was due to start at <strong>${esc(expectedTime)}</strong> ` +
    `(we allow ${graceMinutes} minutes past that before this reminder goes out).`,
    `If you are already at work, please remember to mark your attendance in the Workly app so your hours are recorded correctly.`,
    `If you are running late or unwell, let your manager know.`,
  ]
  return {
    subject: `Attendance reminder — ${brand}`,
    html: shell({ brand, accent: '#F47A6F', heading, body, footer: 'This is an automated reminder. If you have already clocked in, please ignore it.' }),
    text: toText(heading, body, brand),
  }
}

/* ── Overdue tasks ────────────────────────────────────────────────────────── */

export interface OverdueTask {
  title:    string
  deadline: string | null
  priority: string
}

export function overdueTasksEmail(
  name: string, brand: string, tasks: OverdueTask[],
): BuiltEmail {
  const rows = tasks.map((t) => {
    const due = t.deadline
      ? new Date(t.deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—'
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eef0f4;">
        <div style="font-weight:bold;">${esc(t.title)}</div>
        <div style="font-size:12px;color:#8b929e;">Was due ${esc(due)} &middot; ${esc(t.priority)} priority</div>
      </td></tr>`
  }).join('')

  const heading = tasks.length === 1
    ? `A task has passed its deadline`
    : `${tasks.length} tasks have passed their deadline`

  const body = [
    `Hi ${esc(name.split(' ')[0])},`,
    `The following ${tasks.length === 1 ? 'task is' : 'tasks are'} past the deadline and still open:`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;">${rows}</table>`,
    `Please update ${tasks.length === 1 ? 'it' : 'them'} in Workly, or speak to your manager if the deadline needs to move.`,
  ]

  return {
    subject: tasks.length === 1
      ? `Overdue task — ${brand}`
      : `${tasks.length} overdue tasks — ${brand}`,
    html: shell({ brand, accent: '#F47A6F', heading, body, footer: 'This is an automated reminder from Workly.' }),
    text: toText(heading, [...body.slice(0, 2), ...tasks.map((t) => `- ${t.title}`), body[3]], brand),
  }
}
