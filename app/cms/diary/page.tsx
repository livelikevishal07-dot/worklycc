import { Topbar } from '@/components/topbar'
import { DiarySection } from '@/components/diary/diary-section'
import { getDiaryStats, listDiaryEntries, listDiaryTags } from '@/lib/db/diary'

export const dynamic = 'force-dynamic'

export default async function DiaryPage() {
  const [page, stats, tags] = await Promise.all([
    listDiaryEntries(),
    getDiaryStats(),
    listDiaryTags(),
  ])

  return (
    <>
      <Topbar
        title="Daily Diary"
        breadcrumb={[{ label: 'Home' }, { label: 'Daily Diary' }]}
      />
      <main className="space-y-5 px-4 py-4 sm:px-8 sm:py-6">
        <DiarySection
          initialEntries={page.entries}
          initialTotal={page.total}
          initialStats={stats}
          initialTags={tags}
        />
      </main>
    </>
  )
}
