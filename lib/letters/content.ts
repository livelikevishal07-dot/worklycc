import 'server-only'

/**
 * Letter content, built once and rendered two ways (PDF attachment + HTML email
 * body). Keeping the wording here rather than in either renderer means the
 * document the employee reads in their inbox and the PDF they keep are always
 * the same words.
 */

export type LetterType = 'offer' | 'release'

export const LETTER_TYPES: LetterType[] = ['offer', 'release']

export const LETTER_LABEL: Record<LetterType, string> = {
  offer:   'Offer Letter',
  release: 'Relieving Letter',
}

export interface LetterCompany {
  name:                  string
  address:               string | null
  email:                 string | null
  phone:                 string | null
  website:               string | null
  signatoryName:         string | null
  signatoryDesignation:  string | null
  /** Brand token from companies.color (e.g. "coral", "violet") — accents the letterhead. */
  color?:                string | null
}

export interface LetterEmployee {
  fullName:       string
  email:          string | null
  address:        string | null
  designation:    string | null
  department:     string | null
  joiningDate:    string | null   // YYYY-MM-DD
  monthlySalary:  number | null
}

export interface LetterOverrides {
  designation?:     string
  monthlySalary?:   number | null
  joiningDate?:     string        // offer: date of joining
  lastWorkingDate?: string        // release: final day of employment
  reportingTime?:   string
  referenceNo?:     string
}

export interface LetterDoc {
  type:        LetterType
  referenceNo: string
  dateLabel:   string
  subject:     string
  recipient:   { name: string; address: string | null; email: string | null }
  salutation:  string
  paragraphs:  string[]
  closing:     string
  company:     LetterCompany
  signatory:   { name: string; designation: string }
}

/* ── Formatting helpers ───────────────────────────────────────────────────── */

/** "15 August 2026" — unambiguous, avoids the DD/MM vs MM/DD trap in a legal document. */
export function formatLongDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Indian digit grouping, e.g. INR 1,25,000. Spelled out rather than using the
 * ₹ glyph — the PDF renderer's base-14 Helvetica font has no Rupee sign, and
 * silently substitutes the wrong character (₹ → ¹) instead of failing loudly.
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  return `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')).trim()
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  if (n < 100) return twoDigits(n)
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`
}

/** Amount in words, Indian numbering — salary figures are stated both ways. */
export function amountInWords(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—'
  const n = Math.round(amount)
  if (n === 0) return 'Zero Rupees Only'

  const crore = Math.floor(n / 10_000_000)
  const lakh  = Math.floor((n % 10_000_000) / 100_000)
  const thou  = Math.floor((n % 100_000) / 1_000)
  const rest  = n % 1_000

  const parts: string[] = []
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh)  parts.push(`${threeDigits(lakh)} Lakh`)
  if (thou)  parts.push(`${threeDigits(thou)} Thousand`)
  if (rest)  parts.push(threeDigits(rest))
  return `${parts.join(' ')} Rupees Only`
}

function signatoryOf(company: LetterCompany): { name: string; designation: string } {
  return {
    name:        company.signatoryName?.trim() || company.name,
    designation: company.signatoryDesignation?.trim() || 'Authorised Signatory',
  }
}

/* ── Builders ─────────────────────────────────────────────────────────────── */

export function buildOfferLetter(
  employee: LetterEmployee,
  company: LetterCompany,
  o: LetterOverrides = {},
): LetterDoc {
  const designation = (o.designation ?? employee.designation ?? 'Team Member').trim()
  const salary      = o.monthlySalary !== undefined ? o.monthlySalary : employee.monthlySalary
  const joining     = o.joiningDate ?? employee.joiningDate
  const reporting   = o.reportingTime?.trim()

  const paragraphs: string[] = [
    `We are pleased to offer you the position of ${designation} at ${company.name}. ` +
    `We were impressed with your profile and believe you will be a valuable addition to our team. ` +
    `This letter outlines the terms and conditions of your employment with us.`,

    joining
      ? `You will be employed as a ${designation}. Your date of joining will be ${formatLongDate(joining)}` +
        `${employee.department ? `, as part of the ${employee.department} department` : ''}. ` +
        `You will report to the management team of ${company.name}${
          reporting ? `, with a standard reporting time of ${reporting}` : ''
        }.`
      : `You will be employed as a ${designation}${
          employee.department ? `, as part of the ${employee.department} department` : ''
        }. Your date of joining will be confirmed separately.`,
  ]

  if (salary != null) {
    paragraphs.push(
      `Your fixed compensation will be ${formatINR(salary)} (${amountInWords(salary)}) in hand per month, ` +
      `amounting to ${formatINR(salary * 12)} per annum. Salary will be credited on a monthly basis to your ` +
      `registered bank account, subject to statutory deductions as applicable. Salary revisions will be based ` +
      `on your performance and will be at the discretion of the management.`,
    )
  }

  paragraphs.push(
    `This offer is subject to verification of the documents and information provided by you. ` +
    `Your employment will be governed by the policies of ${company.name}, as amended from time to time — ` +
    `including the terms and conditions set out on the following page, which form part of this offer.`,

    `Please confirm your acceptance by replying to this letter${
      company.email ? ` at ${company.email}` : ''
    } on or before your date of joining.`,

    `We are excited to welcome you to the ${company.name} family and look forward to a long and successful association.`,
  )

  return {
    type:        'offer',
    referenceNo: o.referenceNo ?? '',
    dateLabel:   formatLongDate(new Date()),
    subject:     `Offer of Employment — ${designation}`,
    recipient:   { name: employee.fullName, address: employee.address, email: employee.email },
    salutation:  `Dear ${employee.fullName},`,
    paragraphs,
    closing:     'Yours sincerely,',
    company,
    signatory:   signatoryOf(company),
  }
}

/* ── Static Terms & Conditions (offer letters) ───────────────────────────────
 * Appended as its own PDF page for every offer letter, regardless of company —
 * the same employment terms for everyone, so this is deliberately NOT part of
 * the editable paragraph body. Only the company name is substituted.
 */
export interface TermsSection {
  heading: string
  body:    string[]
}

export function buildOfferTerms(companyName: string): TermsSection[] {
  return [
    {
      heading: 'Working Hours and Working Days',
      body: [
        'Your regular working days will be Monday to Saturday, with working hours from 10:00 AM to 7:30 PM. ' +
        'Given the nature of the business, you may be required to work on a roster basis, including on weekends ' +
        'or festival days when business demand is high. In such cases, compensatory offs or adjusted schedules ' +
        'will be provided as per company policy.',
      ],
    },
    {
      heading: 'Leave Policy',
      body: [
        'You will be entitled to 12 paid sick leaves in a year, accrued at 1 paid sick leave per month, in ' +
        'addition to declared festival and office holidays. Including sick leaves, festival holidays, and ' +
        'declared office holidays, you will receive approximately 20 to 25 paid leaves in a year.',
        'Leaves must be applied for in advance wherever possible and approved by your reporting manager. ' +
        'Uninformed absence may be treated as leave without pay.',
      ],
    },
    {
      heading: 'Probation and Confirmation',
      body: [
        'You will be on probation for a period of 3 months from your date of joining. Based on your ' +
        'performance during this period, your employment will be confirmed. The management may extend the ' +
        'probation period at its discretion if required.',
      ],
    },
    {
      heading: 'Notice Period',
      body: [
        'Either party may terminate this employment by providing 1 month of written notice. In case you wish ' +
        'to resign, you will be required to serve the full notice period and complete a proper handover of ' +
        'your responsibilities. The company reserves the right to terminate employment without notice in cases ' +
        'of misconduct, breach of company policy, or unsatisfactory performance during probation.',
      ],
    },
    {
      heading: 'Confidentiality',
      body: [
        `During your employment, you will have access to confidential information including customer data, ` +
        `vendor details, pricing, business processes, and marketing strategies. You agree not to disclose, ` +
        `share, or use this information for any purpose other than the discharge of your duties at ${companyName}, ` +
        `both during and after your employment.`,
      ],
    },
    {
      heading: 'Code of Conduct',
      body: [
        'You are expected to maintain professional behaviour with customers, vendors, and colleagues at all ' +
        'times. You will comply with all company policies, processes, and instructions issued by the ' +
        'management from time to time. Any conduct that harms the reputation or interests of the company may ' +
        'lead to disciplinary action, including termination.',
      ],
    },
    {
      heading: 'General Terms',
      body: [
        'This offer is contingent upon the verification of your documents, which you are required to submit ' +
        'on or before your joining date (ID proof, address proof, educational certificates, and bank details).',
        `Your employment will be governed by the policies of ${companyName}, as amended from time to time. ` +
        `This offer letter supersedes all prior discussions and communications regarding your employment.`,
      ],
    },
  ]
}

export function buildReleaseLetter(
  employee: LetterEmployee,
  company: LetterCompany,
  o: LetterOverrides = {},
): LetterDoc {
  const designation = (o.designation ?? employee.designation ?? 'Team Member').trim()
  const joining     = o.joiningDate ?? employee.joiningDate
  const lastDay     = o.lastWorkingDate

  const tenure = joining && lastDay
    ? `from ${formatLongDate(joining)} to ${formatLongDate(lastDay)}`
    : joining
      ? `from ${formatLongDate(joining)}`
      : lastDay
        ? `until ${formatLongDate(lastDay)}`
        : ''

  const paragraphs: string[] = [
    `This is to certify that ${employee.fullName} was employed with ${company.name} as ${designation}` +
    `${employee.department ? ` in the ${employee.department} department` : ''}${tenure ? ` ${tenure}` : ''}.`,

    lastDay
      ? `${employee.fullName} has been relieved from their duties with effect from the close of business on ${formatLongDate(lastDay)}.`
      : `${employee.fullName} has been relieved from their duties.`,

    `During the tenure with us, their conduct and performance were found to be satisfactory.`,

    `All dues payable have been settled, and no company property remains outstanding against their name.`,

    `We thank ${employee.fullName} for their contribution and wish them success in their future endeavours.`,
  ]

  return {
    type:        'release',
    referenceNo: o.referenceNo ?? '',
    dateLabel:   formatLongDate(new Date()),
    subject:     `Relieving Letter — ${employee.fullName}`,
    recipient:   { name: employee.fullName, address: employee.address, email: employee.email },
    salutation:  'To Whomsoever It May Concern,',
    paragraphs,
    closing:     'Yours sincerely,',
    company,
    signatory:   signatoryOf(company),
  }
}

/* ── Readiness ────────────────────────────────────────────────────────────── */

export interface LetterReadiness {
  /** Must be resolved before the letter can be issued at all. */
  blockers: string[]
  /** Worth knowing, but the letter is still valid without them. */
  warnings: string[]
}

/**
 * A letter goes out under the company's name and states someone's pay, so it is
 * only issued once the details that belong in it are actually present. These are
 * hard stops rather than advisories — the send route enforces the same list, so
 * a hand-crafted request can't skip them.
 */
export function checkLetterReadiness(
  type: LetterType,
  employee: LetterEmployee,
  company: LetterCompany,
  o: LetterOverrides = {},
): LetterReadiness {
  const blockers: string[] = []
  const warnings: string[] = []

  const designation = o.designation ?? employee.designation
  const salary      = o.monthlySalary !== undefined ? o.monthlySalary : employee.monthlySalary
  const joining     = o.joiningDate ?? employee.joiningDate

  if (!designation?.trim()) blockers.push('Set a designation for this letter.')
  if (!company.address?.trim()) {
    blockers.push(`${company.name} has no registered address — add it in Settings → Companies so the letterhead is complete.`)
  }

  if (type === 'offer') {
    if (salary == null)  blockers.push('Set the monthly salary — an offer letter must state the remuneration.')
    if (!joining)        blockers.push('Set the date of joining.')
  } else {
    if (!o.lastWorkingDate) blockers.push('Set the last working date.')
    if (!joining)           warnings.push('No joining date on record, so the letter will not state a tenure period.')
  }

  if (!company.email?.trim() && !company.phone?.trim()) {
    warnings.push(`${company.name} has no contact email or phone on its letterhead.`)
  }

  return { blockers, warnings }
}

/**
 * Reference number, e.g. GIF/OL/2026/0007. `seq` is the count of letters of this
 * type already issued for the company this year, so numbering restarts annually.
 */
export function buildReferenceNo(companyName: string, type: LetterType, seq: number): string {
  const prefix = companyName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CMP'
  const kind   = type === 'offer' ? 'OL' : 'RL'
  return `${prefix}/${kind}/${new Date().getFullYear()}/${String(seq).padStart(4, '0')}`
}

/** Blank-line separated text -> paragraphs, for the editable body in the UI. */
export function paragraphsFromText(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean)
}

export function textFromParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n')
}
