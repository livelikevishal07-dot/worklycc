import { Topbar } from '@/components/topbar'
import { MailClient } from '@/components/email/mail-client'
import { listAccounts, listTemplates } from '@/lib/db/email'
import { hasEncryptionKey } from '@/lib/mail/crypto'

export const dynamic = 'force-dynamic'

export default async function EmailPage() {
  const [accounts, templates] = await Promise.all([listAccounts(), listTemplates()])

  return (
    <>
      <Topbar title="Email" breadcrumb={[{ label: 'Home' }, { label: 'Email' }]} />
      <main className="px-4 py-4 sm:px-8 sm:py-6">
        <MailClient
          initialAccounts={accounts}
          initialTemplates={templates}
          encryptionReady={hasEncryptionKey()}
        />
      </main>
    </>
  )
}
