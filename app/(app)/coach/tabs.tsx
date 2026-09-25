/**
 * 예전 분석 화면(/coach?view=)의 세 칸 이름.
 *
 * 분석은 홈 캘린더 밑의 칸으로 옮겼다(app/(app)/today/analysis-block.tsx). 그 칸을
 * 고르던 줄(CoachTabs)은 쓸 곳이 없어져 지웠다. 이름만 남긴다 — 옛 주소
 * /coach?view=training 을 저장해 둔 사람을 홈의 같은 칸으로 넘겨줄 때(coach/page.tsx)
 * 읽고, 분석 칸이 무엇을 그릴지(coach/overview.tsx) 정할 때 쓴다.
 */
export type CoachView = 'pitch' | 'training' | 'report';

/** 주소에서 온 값을 세 칸 중 하나로 못박는다. 모르는 값은 투구로 본다. */
export function readCoachView(raw: string | string[] | undefined): CoachView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'training' || value === 'report' ? value : 'pitch';
}
