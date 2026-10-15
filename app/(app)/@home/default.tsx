import HomePage from '@/app/(app)/today/home-page';

/** 홈 판 — 주소가 /today 가 아니어도(다른 탭 · 하위 화면) 판 넘기기 자리에 늘 떠 있다(components/tab-pager.tsx). 홈은 잠금이 없다 */
export default function HomeSlotDefault() {
  return <HomePage searchParams={Promise.resolve({})} />;
}
