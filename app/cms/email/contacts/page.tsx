import { Topbar } from '@/components/topbar'
import { ContactsPanel } from '@/components/email/contacts-panel'
import { listContactCategories, listContacts } from '@/lib/db/email'

export const dynamic = 'force-dynamic'

export default async function EmailContactsPage() {
  const [contacts, categories] = await Promise.all([listContacts(), listContactCategories()])

  return (
    <>
      <Topbar
        title="Contacts"
        breadcrumb={[{ label: 'Home' }, { label: 'Email' }, { label: 'Contacts' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <ContactsPanel initialContacts={contacts} initialCategories={categories} />
      </main>
    </>
  )
}
