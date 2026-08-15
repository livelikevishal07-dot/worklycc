import type { Metadata } from 'next'

import { KycForm } from '@/components/kyc/kyc-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Employee onboarding',
  // An invite link should never surface in search results.
  robots: { index: false, follow: false },
}

/**
 * Public onboarding form. Sits outside /cms and /employee so the middleware and
 * the employee layout leave it alone — the joiner has no account yet.
 */
export default function KycFormPage({ params }: { params: { token: string } }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <KycForm token={params.token} />
    </div>
  )
}
