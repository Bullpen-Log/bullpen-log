import { requireUser } from '@/lib/dal';
import { EmptyState, PageHeading } from '@/components/ui';
import { BackLink } from '@/components/back-link';
import { Target } from '@/components/icon';

/**
 * 타격 드릴 — 타격 카테고리의 드릴 칸(2026-10-21 김민: "투구는 운동 영상 + 투구 드릴, 타격은 운동 영상 + 타격 드릴 — 타격 드릴은 빈 칸만 먼저").
 * 영상이 아직 없어 준비 중 화면만. 드릴을 찍으면 어느 표에 둘지(투구 드릴 분류에 섞지 않게) 정해 올리기를 붙인다(docs/designs/hitting-restructure.md D5).
 * 주소가 /hitting/ 아래라 앱에서도 타격 하단바가 그대로 보인다.
 */
export default async function HittingDrillsPage() {
  await requireUser();
  return (
    <div className="stack-page">
      <BackLink href="/hitting">타격</BackLink>
      <PageHeading title="타격 드릴" />
      <EmptyState
        icon={<Target />}
        title="타격 드릴을 준비하고 있어요"
        description="스윙 · 타이밍 · 컨택 드릴 영상을 찍는 대로 여기에 올라와요."
      />
    </div>
  );
}
