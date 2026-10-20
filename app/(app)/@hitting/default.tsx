import { Suspense } from 'react';
import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { TabLocked } from '@/components/tab-locked';
import HittingPage from '@/app/(app)/hitting/hitting-page';
import Loading from '@/app/(app)/@hitting/hitting/loading';

/**
 * 타격 판(2026-10-20 하단 탭 셋째, 트레이닝 자리) — 주소가 /hitting 이 아니어도 판 넘기기 자리에 늘 떠 있다(components/tab-pager.tsx).
 * 잠겨 있으면(타격 첫 설정 전) '타격 시작하기'. Suspense 로 감싸 처음 연 탭이 먼저 뜬다(@home/default.tsx).
 */
export default async function HittingSlotDefault() {
  const user = await requireUser();
  if (featureLocks(user).hit) return <TabLocked feature="hit" />;
  return (
    <Suspense fallback={<Loading />}>
      <HittingPage />
    </Suspense>
  );
}
