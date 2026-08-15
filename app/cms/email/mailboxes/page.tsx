import { Topbar } from '@/components/topbar'
import { MailboxesPanel } from '@/components/email/mailboxes-panel'
import { listAccounts } from '@/lib/db/email'
import { hasEncryptionKey } from '@/lib/mail/crypto'

export const dynamic = 'force-dynamic'

export default async function MailboxesPage() {
  const accounts = await listAccounts()

  return (
    <>
      <Topbar
        title="Mailboxes"
        breadcrumb={[{ label: 'Home' }, { label: 'Email' }, { label: 'Mailboxes' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        {/* listAccounts() returns every connection column; the panel needs them all. */}
        <MailboxesPanel
          initialAccounts={accounts as never}
          encryptionReady={hasEncryptionKey()}
        />
      </main>
    </>
  )
}
