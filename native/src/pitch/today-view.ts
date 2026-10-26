/**
 * 투구 탭 '오늘' 카드(pitch/today-card.tsx)가 무엇을 보이고 어디로 가는지 — 순수(시험: scripts/native-today-card-selftest.mts).
 * 오늘은 껍데기가 서버에 물은 날(한국 자정 · 다음 날 복귀 때 다시 묻고, 시험 계정은 서버의 시험 날짜, 꺼진 망이면 폰의 한국 날짜)이다.
 * 받아 둔 값이 다른 날 것이면 팔 상태는 숨기고 '오늘 기록' 단추만 — 가는 곳은 늘 오늘(2026-10-26: 자정을 넘긴 뒤 어제 화면을 열었다).
 */
export type TodayView = { show: 'none' | 'button' | 'full'; go: string };

export function todayView(data: { today: string } | null, today: string): TodayView {
  const go = `/pitch/${today}`;
  if (!data) return { show: 'none', go };
  return { show: data.today === today ? 'full' : 'button', go };
}
