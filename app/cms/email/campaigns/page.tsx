import { Topbar } from '@/components/topbar'
import { CampaignsPanel } from '@/components/email/campaigns-panel'
import { listAccounts, listCampaigns, listContactCategories } from '@/lib/db/email'

export const dynamic = 'force-dynamic'

export default async function EmailCampaignsPage() {
  const [campaigns, accounts, categories] = await Promise.all([
    listCampaigns(),
    listAccounts(),
    listContactCategories(),
  ])

  return (
    <>
      <Topbar
        title="Campaigns"
        breadcrumb={[{ label: 'Home' }, { label: 'Email' }, { label: 'Campaigns' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <CampaignsPanel
          initialCampaigns={campaigns}
          accounts={accounts}
          contactCategories={categories}
        />
      </main>
    </>
  )
}
