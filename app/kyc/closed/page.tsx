import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Onboarding form',
  robots: { index: false, follow: false },
}

/** Shown when a shared KYC link is switched off, unknown, or rate-limited. */
export default function KycClosedPage({
  searchParams,
}: {
  searchParams: { reason?: string }
}) {
  const busy = searchParams.reason === 'busy'

  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-4">
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="h-2 bg-brand" />
          <div className="p-8 text-center">
            <h1 className="text-xl font-semibold">
              {busy ? 'Just a moment' : 'This link is not active'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {busy
                ? 'This form has been opened several times from your connection recently. Please wait a little while and try again.'
                : 'This onboarding link has been closed or is no longer valid. Please ask your contact for a current link.'}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
