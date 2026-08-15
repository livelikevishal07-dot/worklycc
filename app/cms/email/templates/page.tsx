import { Topbar } from '@/components/topbar'
import { TemplatesPanel } from '@/components/email/templates-panel'
import { listTemplates } from '@/lib/db/email'

export const dynamic = 'force-dynamic'

export default async function EmailTemplatesPage() {
  const templates = await listTemplates()

  return (
    <>
      <Topbar
        title="Email Templates"
        breadcrumb={[{ label: 'Home' }, { label: 'Email' }, { label: 'Templates' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <TemplatesPanel initialTemplates={templates} />
      </main>
    </>
  )
}
