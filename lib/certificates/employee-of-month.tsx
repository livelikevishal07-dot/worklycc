import 'server-only'
import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Svg, Path, Circle, Polygon, renderToBuffer,
} from '@react-pdf/renderer'

/**
 * Employee of the Month certificate — landscape, navy and gold, matching the
 * template the admin supplied: wave banding top-left and bottom-right, a gold
 * rosette, the recipient's name large and script-like, and a signatory line.
 *
 * The name uses Times-BoldItalic. A true script face would mean registering and
 * bundling a font file into the serverless deploy; of the base-14 fonts this is
 * the closest to the template without shipping binaries for one document.
 *
 * Per the admin: signed "Vishal Gupta", with no blank signature gap — these are
 * issued digitally, so a ruled line waiting for ink would be wrong.
 */

const NAVY   = '#12466E'
const GOLD   = '#F2B33D'
const CREAM  = '#EFE6C8'
const INK    = '#12181F'

export interface CertificateInput {
  employeeName: string
  /** e.g. "September 2026" */
  periodLabel:  string
  companyName:  string | null
  signatoryName:        string
  signatoryDesignation: string
  /** Optional line of praise; a sensible default is used when absent. */
  message?:     string | null
  /** Shown as a small footnote when present, e.g. "10 of 10 days on time". */
  statLine?:    string | null
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    color: INK,
    position: 'relative',
  },
  /* The waves and border are absolutely positioned so the text block can be
     centred independently of them. */
  art: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  body: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    paddingTop: 92, paddingHorizontal: 110, paddingBottom: 70,
    alignItems: 'center',
  },

  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 23,
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  awardedTo: { fontFamily: 'Times-Roman', fontSize: 11.5, marginTop: 44, textAlign: 'center' },

  name: {
    fontFamily: 'Times-BoldItalic',
    fontSize: 40,
    marginTop: 16,
    textAlign: 'center',
  },
  nameRule: { marginTop: 10, width: 330, height: 1, backgroundColor: '#C9CDD3' },

  message: {
    fontFamily: 'Times-Roman',
    fontSize: 11.5,
    lineHeight: 1.65,
    marginTop: 26,
    textAlign: 'center',
    maxWidth: 430,
  },
  stat: { fontFamily: 'Helvetica', fontSize: 9, color: '#5A6472', marginTop: 12, textAlign: 'center' },

  signBlock: { position: 'absolute', bottom: 74, left: 0, right: 0, alignItems: 'center' },
  signName:  { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  signRole:  { fontFamily: 'Helvetica', fontSize: 9, color: '#5A6472', marginTop: 2 },
  signRule:  { width: 210, height: 1, backgroundColor: '#3A4350', marginBottom: 6 },
})

/** A4 landscape in points. */
const W = 841.89
const H = 595.28

function Artwork() {
  return (
    <Svg style={styles.art} viewBox={`0 0 ${W} ${H}`}>
      {/* Navy frame */}
      <Path d={`M0 0 H${W} V${H} H0 Z`} fill={NAVY} />
      <Path d={`M14 14 H${W - 14} V${H - 14} H14 Z`} fill="#FFFFFF" />

      {/* Top-left wave stack */}
      <Path d={`M14 14 H${W * 0.60} C ${W * 0.42} 92, ${W * 0.30} 120, 14 128 Z`} fill={NAVY} />
      <Path d={`M14 14 H${W * 0.64} C ${W * 0.44} 104, ${W * 0.31} 134, 14 142 Z`} fill={GOLD} />
      <Path d={`M14 14 H${W * 0.60} C ${W * 0.40} 116, ${W * 0.28} 150, 14 158 Z`} fill={CREAM} />
      <Path d={`M14 14 H${W * 0.50} C ${W * 0.34} 104, ${W * 0.24} 128, 14 134 Z`} fill={NAVY} />

      {/* Bottom-right wave stack (mirror) */}
      <Path d={`M${W - 14} ${H - 14} H${W * 0.40} C ${W * 0.58} ${H - 92}, ${W * 0.70} ${H - 120}, ${W - 14} ${H - 128} Z`} fill={NAVY} />
      <Path d={`M${W - 14} ${H - 14} H${W * 0.36} C ${W * 0.56} ${H - 104}, ${W * 0.69} ${H - 134}, ${W - 14} ${H - 142} Z`} fill={GOLD} />
      <Path d={`M${W - 14} ${H - 14} H${W * 0.40} C ${W * 0.60} ${H - 116}, ${W * 0.72} ${H - 150}, ${W - 14} ${H - 158} Z`} fill={CREAM} />
      <Path d={`M${W - 14} ${H - 14} H${W * 0.50} C ${W * 0.66} ${H - 104}, ${W * 0.76} ${H - 128}, ${W - 14} ${H - 134} Z`} fill={NAVY} />

      {/* Gold rosette, top right */}
      <Polygon points={`${W - 148},150 ${W - 128},186 ${W - 108},150`} fill={GOLD} />
      <Polygon points={`${W - 118},150 ${W - 98},186 ${W - 78},150`} fill="#D9962B" />
      <Circle cx={W - 113} cy={118} r={40} fill="#D9962B" />
      <Circle cx={W - 113} cy={118} r={34} fill={GOLD} />
      <Circle cx={W - 113} cy={118} r={26} fill="#F6C863" />
    </Svg>
  )
}

export function CertificateDoc(input: CertificateInput) {
  const message = input.message?.trim() ||
    `Your consistent punctuality and dedication set the standard for the team. ` +
    `Thank you for the example you set${input.companyName ? ` at ${input.companyName}` : ''}.`

  return (
    <Document
      title={`Employee of the Month — ${input.employeeName}`}
      author={input.companyName ?? 'Workly'}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Artwork />

        <View style={styles.body}>
          <Text style={styles.title}>EMPLOYEE OF THE MONTH</Text>
          <Text style={{ fontFamily: 'Helvetica', fontSize: 10, letterSpacing: 2, marginTop: 6, color: NAVY }}>
            {input.periodLabel.toUpperCase()}
          </Text>

          <Text style={styles.awardedTo}>This certificate is awarded to</Text>
          <Text style={styles.name}>{input.employeeName}</Text>
          <View style={styles.nameRule} />

          <Text style={styles.message}>{message}</Text>
          {input.statLine && <Text style={styles.stat}>{input.statLine}</Text>}
        </View>

        {/* No blank signature gap — issued digitally, so the name is the sign-off. */}
        <View style={styles.signBlock}>
          <View style={styles.signRule} />
          <Text style={styles.signName}>{input.signatoryName}</Text>
          <Text style={styles.signRole}>{input.signatoryDesignation}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderCertificatePdf(input: CertificateInput): Promise<Buffer> {
  return renderToBuffer(<CertificateDoc {...input} />)
}

export function certificateFilename(name: string, periodLabel: string): string {
  const safe = (s: string) => s.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
  return `employee-of-the-month-${safe(name)}-${safe(periodLabel)}.pdf`.toLowerCase()
}
