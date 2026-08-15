import { Topbar } from '@/components/topbar'
import { KycSection, type KycRow } from '@/components/kyc/kyc-section'
import { listSubmissions } from '@/lib/db/kyc'
import { listCompanies } from '@/lib/db/companies'
import { listRoles } from '@/lib/db/roles'
import { listDepartments } from '@/lib/db/departments'

export const dynamic = 'force-dynamic'

export default async function KycPage() {
  const [submissions, companies, roles, departments] = await Promise.all([
    listSubmissions(),
    listCompanies(),
    listRoles(),
    listDepartments(),
  ])

  return (
    <>
      <Topbar
        title="Employee KYC"
        breadcrumb={[{ label: 'Home' }, { label: 'Employee KYC' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <KycSection
          initialRows={submissions as unknown as KycRow[]}
          companies={companies}
          roles={roles}
          departments={departments}
        />
      </main>
    </>
  )
}
