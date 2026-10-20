import { Suspense } from 'react';
import { requireUser } from '@/lib/dal';
import HittingPage from '@/app/(app)/hitting/hitting-page';
import Loading from '@/app/(app)/@hitting/hitting/loading';

/**
 * 타격 판(2026-10-20 하단 탭 셋째, 트레이닝 자리) — 주소가 /hitting 이 아니어도 판 넘기기 자리에 늘 떠 있다(components/tab-pager.tsx).
 * 잠금 · 첫 설정 없이 바로 타격 기록(2026-10-20 김민: 시작 질문 뺌). Suspense 로 감싸 처음 연 탭이 먼저 뜬다(@home/default.tsx).
 */
export default async function HittingSlotDefault() {
  await requireUser();
  return (
    <Suspense fallback={<Loading />}>
      <HittingPage />
    </Suspense>
  );
}
