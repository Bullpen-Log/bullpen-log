import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { TabLocked } from '@/components/tab-locked';
import Loading from '@/app/(app)/loading';

/**
 * 트레이닝 판 — 주소가 이 탭이 아닐 때 서버는 이 탭을 그리지 않고 자리표시만 둔다(@home/default.tsx 와 같은 까닭). 하단 탭으로 처음 오면
 * tab-pager 가 이 탭 주소로 이동해 그때 그린다. 잠겨 있으면(첫 설정 전) 잠긴 판 — 그 탭의 하단 탭은 설정 주소로 간다.
 */
export default async function TrainingSlotDefault() {
  const user = await requireUser();
  if (featureLocks(user).training) return <TabLocked feature="training" />;
  return (
    <div data-panel-empty>
      <Loading />
    </div>
  );
}
