import 'server-only'

import { LETTER_LABEL, type LetterDoc } from './content'

/**
 * The same letter as an HTML email body, so the employee can read it in their
 * inbox without opening the PDF attachment.
 *
 * Written with tables and inline styles on purpose: email clients (Outlook in
 * particular) ignore <style> blocks, flexbox and modern CSS. Keep it boring.
 */

/** Same brand tokens as lib/letters/pdf.tsx — kept in sync by hand since one
 *  lives in a react-pdf StyleSheet and the other in raw HTML strings. */
const ACCENT_BY_TOKEN: Record<string, string> = {
  coral:   '#F47A6F',
  violet:  '#6F5CFF',
  sky:     '#27C0DE',
  indigo:  '#5B7BFF',
  emerald: '#22C58B',
  amber:   '#F2B544',
}
const DEFAULT_ACCENT = '#C0392B'

function accentOf(doc: LetterDoc): string {
  return (doc.company.color && ACCENT_BY_TOKEN[doc.company.color]) || DEFAULT_ACCENT
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderLetterEmailHtml(doc: LetterDoc): string {
  const accent = accentOf(doc)
  const contact = [doc.company.phone, doc.company.email, doc.company.website]
    .filter(Boolean).map((v) => esc(String(v))).join(' &middot; ')

  const address = doc.company.address
    ? esc(doc.company.address).replace(/\n/g, ', ')
    : ''

  const paragraphs = doc.paragraphs
    .map((p) => `<p style="margin:0 0 14px;">${esc(p)}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:640px;background:#ffffff;border-radius:10px;overflow:hidden;
                    font-family:Helvetica,Arial,sans-serif;color:#1f2430;font-size:14px;line-height:1.65;">

        <!-- Letterhead -->
        <tr><td style="padding:26px 32px 16px;border-bottom:2px solid ${accent};">
          <div style="font-size:22px;font-weight:bold;color:${accent};">${esc(doc.company.name)}</div>
          ${address ? `<div style="font-size:12px;color:#5b6270;margin-top:4px;">${address}</div>` : ''}
          ${contact ? `<div style="font-size:12px;color:#5b6270;margin-top:2px;">${contact}</div>` : ''}
        </td></tr>

        <!-- Reference + date -->
        <tr><td style="padding:16px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:12px;color:#5b6270;">${doc.referenceNo ? `Ref: ${esc(doc.referenceNo)}` : ''}</td>
              <td align="right" style="font-size:12px;color:#5b6270;">Date: ${esc(doc.dateLabel)}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:18px 32px 8px;">
          <div style="font-weight:bold;">${esc(doc.recipient.name)}</div>
          ${doc.recipient.email ? `<div style="font-size:12px;color:#5b6270;">${esc(doc.recipient.email)}</div>` : ''}

          <p style="margin:18px 0 14px;font-weight:bold;text-decoration:underline;text-align:center;text-transform:uppercase;">
            ${esc(doc.subject)}
          </p>

          <p style="margin:0 0 14px;">${esc(doc.salutation)}</p>
          ${paragraphs}

          <!-- Signature -->
          <div style="margin-top:28px;">
            <div>${esc(doc.closing)}</div>
            <div style="height:28px;"></div>
            <div style="font-weight:bold;">${esc(doc.signatory.name)}</div>
            <div style="font-size:12px;color:#5b6270;">${esc(doc.signatory.designation)}</div>
            ${doc.signatory.name !== doc.company.name
              ? `<div style="font-size:12px;color:#5b6270;">${esc(doc.company.name)}</div>`
              : ''}
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;">
          <div style="border-top:1px solid #e2e5ea;padding-top:12px;font-size:11px;color:#8b929e;text-align:center;">
            A signed PDF copy of this ${esc(LETTER_LABEL[doc.type].toLowerCase())}${
              doc.type === 'offer' ? ', including the terms and conditions of employment,' : ''
            } is attached.<br>
            This is a computer-generated letter issued by ${esc(doc.company.name)}.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Plain-text alternative, for clients that refuse HTML. */
export function renderLetterEmailText(doc: LetterDoc): string {
  const lines = [
    doc.company.name,
    doc.company.address ? doc.company.address.replace(/\n/g, ', ') : '',
    '',
    doc.referenceNo ? `Ref: ${doc.referenceNo}` : '',
    `Date: ${doc.dateLabel}`,
    '',
    doc.recipient.name,
    doc.recipient.email ?? '',
    '',
    `Subject: ${doc.subject}`,
    '',
    doc.salutation,
    '',
    ...doc.paragraphs.flatMap((p) => [p, '']),
    doc.closing,
    '',
    doc.signatory.name,
    doc.signatory.designation,
    // Omitted when the signatory fell back to the company name.
    doc.signatory.name !== doc.company.name ? doc.company.name : '',
  ]
  return lines.filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
