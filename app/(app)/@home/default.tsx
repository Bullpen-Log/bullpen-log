import Loading from '@/app/(app)/@home/today/loading';

/**
 * 홈 판 — 주소가 /today 가 아닐 때(다른 탭으로 처음 열었을 때 · 하위 화면) 서버는 홈을 그리지 않고 자리표시만 둔다.
 * 하단 탭으로 처음 오면 tab-pager 가 /today 로 이동해 그때 그리고, 그 뒤로는 판이 그대로 산다(2026-10-16 — 탭 넷을 늘 같이 그려
 * 화면 하나 · 새로고침 하나마다 서버 일이 네 배였다). `data-panel-empty` 가 '아직 안 그린 판' 표시다.
 */
export default function HomeSlotDefault() {
  return (
    <div data-panel-empty>
      <Loading />
    </div>
  );
}
