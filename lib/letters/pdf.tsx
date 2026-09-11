import 'server-only'
import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'

import { LETTER_LABEL, buildOfferTerms, type LetterDoc } from './content'

/**
 * Renders a LetterDoc to a PDF buffer, for attaching to the outgoing email and
 * for re-download later. Uses the built-in Helvetica family — registering a
 * custom font would mean shipping font files into the serverless bundle for no
 * real gain on a plain business letter.
 */

/** companies.color is one of the app's brand tokens, not a raw hex value —
 *  same palette as tailwind.config.ts, so a letter picks up its company's
 *  own accent instead of one fixed colour for every letterhead. */
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

const styles = StyleSheet.create({
  page: {
    paddingTop: 48, paddingBottom: 56, paddingHorizontal: 56,
    fontFamily: 'Helvetica', fontSize: 10.5, lineHeight: 1.6, color: '#1f2430',
  },

  /* Letterhead */
  header:        { borderBottomWidth: 2, paddingBottom: 12, marginBottom: 22 },
  companyName:   { fontFamily: 'Helvetica-Bold', fontSize: 21, letterSpacing: 0.3 },
  companyMeta:   { fontSize: 8.5, color: '#5b6270', marginTop: 2, lineHeight: 1.5 },

  /* Reference row */
  refRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  refText: { fontSize: 9, color: '#5b6270' },

  /* Recipient + subject */
  recipient:      { marginBottom: 16 },
  recipientName:  { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  recipientLine:  { fontSize: 9.5, color: '#5b6270' },
  subject:        {
    fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 18,
    textDecoration: 'underline', textAlign: 'center', textTransform: 'uppercase',
  },

  salutation: { marginBottom: 12 },
  paragraph:  { marginBottom: 11, textAlign: 'justify' },

  /* Signature. No blank space for a handwritten signature — these letters are
     issued digitally and go out as-is. */
  signature:      { marginTop: 26 },
  signatoryName:  { fontFamily: 'Helvetica-Bold', marginTop: 10 },
  signatoryRole:  { fontSize: 9.5, color: '#5b6270' },

  /* Terms & Conditions page */
  termsTitle:   {
    fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 18,
    textAlign: 'center', textTransform: 'uppercase',
  },
  termsSection: { marginBottom: 13 },
  termsHeading: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, marginBottom: 4 },
  termsBody:    { marginBottom: 6, textAlign: 'justify' },

  /* Footer */
  footer: {
    position: 'absolute', bottom: 26, left: 56, right: 56,
    borderTopWidth: 1, borderTopColor: '#d8dce3', paddingTop: 7,
    fontSize: 7.5, color: '#8b929e', textAlign: 'center',
  },
})

function Footer({ doc }: { doc: LetterDoc }) {
  return (
    <Text style={styles.footer} fixed>
      This is a computer-generated letter issued by {doc.company.name}
      {doc.referenceNo ? ` · Ref ${doc.referenceNo}` : ''}
    </Text>
  )
}

function Letterhead({ doc, accent }: { doc: LetterDoc; accent: string }) {
  const contactLine = [doc.company.phone, doc.company.email, doc.company.website]
    .filter(Boolean)
    .join('  ·  ')
  return (
    <View style={[styles.header, { borderBottomColor: accent }]}>
      <Text style={[styles.companyName, { color: accent }]}>{doc.company.name}</Text>
      {doc.company.address && (
        <Text style={styles.companyMeta}>{doc.company.address.replace(/\s*\n\s*/g, ', ')}</Text>
      )}
      {contactLine ? <Text style={styles.companyMeta}>{contactLine}</Text> : null}
    </View>
  )
}

function LetterPdf({ doc }: { doc: LetterDoc }) {
  const accent = accentOf(doc)
  const terms  = doc.type === 'offer' ? buildOfferTerms(doc.company.name) : []

  return (
    <Document
      title={`${LETTER_LABEL[doc.type]} — ${doc.recipient.name}`}
      author={doc.company.name}
      subject={doc.subject}
    >
      <Page size="A4" style={styles.page}>
        <Letterhead doc={doc} accent={accent} />

        {/* Reference + date */}
        <View style={styles.refRow}>
          <Text style={styles.refText}>{doc.referenceNo ? `Ref: ${doc.referenceNo}` : ' '}</Text>
          <Text style={styles.refText}>Date: {doc.dateLabel}</Text>
        </View>

        {/* Recipient */}
        <View style={styles.recipient}>
          <Text style={styles.recipientName}>{doc.recipient.name}</Text>
          {doc.recipient.address
            ? doc.recipient.address.split(/\n/).map((line, i) => (
                <Text key={i} style={styles.recipientLine}>{line.trim()}</Text>
              ))
            : null}
          {doc.recipient.email ? <Text style={styles.recipientLine}>{doc.recipient.email}</Text> : null}
        </View>

        <Text style={styles.subject}>{doc.subject}</Text>
        <Text style={styles.salutation}>{doc.salutation}</Text>

        {doc.paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>{p}</Text>
        ))}

        {/* Signature block. Company-side sign-off only — these letters go out
            issued digitally, with no employee acceptance/signature block. */}
        <View style={styles.signature} wrap={false}>
          <Text>{doc.closing}</Text>
          <Text style={styles.signatoryName}>{doc.signatory.name}</Text>
          <Text style={styles.signatoryRole}>{doc.signatory.designation}</Text>
          {/* Skipped when no signatory is configured — the name already falls
              back to the company, and printing it twice looks like a bug. */}
          {doc.signatory.name !== doc.company.name && (
            <Text style={styles.signatoryRole}>{doc.company.name}</Text>
          )}
        </View>

        <Footer doc={doc} />
      </Page>

      {/* Terms & Conditions — static, identical for every offer letter
          regardless of company, so it lives here rather than in the editable
          paragraph body. */}
      {terms.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Letterhead doc={doc} accent={accent} />
          <Text style={styles.termsTitle}>Terms and Conditions</Text>

          {terms.map((section, i) => (
            <View key={i} style={styles.termsSection} wrap={false}>
              <Text style={[styles.termsHeading, { color: accent }]}>
                {i + 1}. {section.heading}
              </Text>
              {section.body.map((b, j) => (
                <Text key={j} style={styles.termsBody}>{b}</Text>
              ))}
            </View>
          ))}

          <Footer doc={doc} />
        </Page>
      )}
    </Document>
  )
}

export async function renderLetterPdf(doc: LetterDoc): Promise<Buffer> {
  return renderToBuffer(<LetterPdf doc={doc} />)
}

/** Safe, descriptive filename for the attachment. */
export function letterFilename(doc: LetterDoc): string {
  const who  = doc.recipient.name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'employee'
  const kind = doc.type === 'offer' ? 'Offer-Letter' : 'Relieving-Letter'
  return `${kind}-${who}.pdf`
}
