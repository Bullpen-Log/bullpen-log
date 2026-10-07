/**
 * 분석 · 그래프 화면(/coach?view=)의 두 칸 이름 — 처음 펼 칸을 주소에서 읽을 때(coach/page.tsx)와 분석 칸이
 * 무엇을 그릴지(coach/overview.tsx) 정할 때 쓴다. 2026-10-05 홈 정리로 분석 칸이 홈 캘린더 밑에서 다시 이 주소로 왔다.
 */
export type CoachView = 'pitch' | 'training';

/**
 * 주소에서 온 값을 두 칸 중 하나로 못박는다. 모르는 값은 투구로 본다 — 저장해 둔 옛 주소 ?view=report(2026-10-07
 * 리포트 칸을 지움)도 투구로 열린다.
 */
export function readCoachView(raw: string | string[] | undefined): CoachView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'training' ? value : 'pitch';
}
