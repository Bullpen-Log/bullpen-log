import { Suspense } from 'react';
import HomePage from '@/app/(app)/today/home-page';
import Loading from '@/app/(app)/@home/today/loading';

/**
 * 홈 판 — 주소가 /today 가 아니어도(다른 탭 · 하위 화면) 판 넘기기 자리에 늘 떠 있다(components/tab-pager.tsx). 홈은 잠금이 없다.
 * Suspense 로 감싸 처음 연 탭이 먼저 뜨고 이 판은 뒤따라 들어온다(2026-10-16 — 처음 연 탭만 그리던 것을 되돌림, 사용자: "처음 접속하면 탭 사이 이동이 길다").
 */
export default function HomeSlotDefault() {
  return (
    <Suspense fallback={<Loading />}>
      <HomePage searchParams={Promise.resolve({})} />
    </Suspense>
  );
}
