import { RevealProvider } from '@/components/bookings/reveal-context'

/**
 * Wraps Analysis, Calendar and All Entries in one reveal scope, so unlocking
 * the money figures on any of them keeps them unlocked while moving between
 * the three. Locked again as soon as the tab is closed.
 */
export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  return <RevealProvider>{children}</RevealProvider>
}
