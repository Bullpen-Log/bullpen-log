import type { requireUser } from '@/lib/dal';
import { loadHomeFeed } from '@/lib/report/home-today';
import { FeedCard } from './feed-card';

type HomeUser = Awaited<ReturnType<typeof requireUser>>;

/**
 * 홈 요약 칸 — 그리기는 feed-card.tsx, 재료 모으기는 lib/report/home-today.ts(앱 홈과 같이 쓴다), 장을 만드는 셈은 lib/report/feed-items.ts. 우리끼리 '뉴스'라 부르는 칸이다(화면에는
 * 그 말이 없다).
 *
 * 2026-10-14 부터 장은 늘 여섯(투구량 → 구속 → 부하 지수 → 컨디션 → 운동 → 영양). 오늘 기록이 없으면 지난 기록의 통계 · 그래프를, 아예
 * 없으면 '기록 없음 · 남기러 가기'를 보인다. 하이라이트('달라진 것')는 장을 더하지 않고 그 장의 말을 바꾼다.
 *
 * 오늘 자료는 한 요청에 한 번만(loadTodayCoreCached — 캘린더 밑 카드(page.tsx)와 같은 cache 를 같은 user 객체로 부른다).
 */

export async function Feed({ user, today }: { user: HomeUser; today: string }) {
  return <FeedCard items={await loadHomeFeed(user, today)} />;
}
