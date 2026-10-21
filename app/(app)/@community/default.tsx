import { Suspense } from 'react';
import DugoutHome from '@/app/(dugout)/page';
import Loading from '@/app/(app)/@community/community/loading';

/**
 * 커뮤니티 판(2026-10-20 하단 탭 넷째, 영양 자리) — 주소가 /community 가 아니어도 판 넘기기 자리에 늘 떠 있다(components/tab-pager.tsx).
 * 2026-10-21 사용자 "커뮤니티를 누르면 바로 덕아웃으로": 판의 내용은 덕아웃 홈(app/(dugout)/page.tsx — 장터 · 소통 · 레슨 · 장소 · 장비).
 * 글 목록은 하위 화면 /community/feed. 잠금 없음. Suspense 로 감싸 처음 연 탭이 먼저 뜨고 이 판은 뒤따라 들어온다(@home/default.tsx).
 */
export default function CommunitySlotDefault() {
  return (
    <Suspense fallback={<Loading />}>
      <DugoutHome />
    </Suspense>
  );
}
