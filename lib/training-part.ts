/**
 * 트레이닝 탭의 두 칸 — [트레이닝 | 암케어].
 *
 * 2026-09-26 사용자분과 정했다: 트레이닝과 암케어는 서로 독립이다. 암케어는 운동
 * 일정에 붙여 하는 것이 아니라 투구 전이든 집에서든 따로든 언제든 하는 것이라,
 * 아래 탭의 '트레이닝'을 누르면 **마지막으로 보던 칸**이 열린다. 암케어만 하는 사람이
 * 매번 칸을 바꾸지 않게. 예전의 [기록] 칸은 뺐다 — 지난 운동은 홈 캘린더에서 날짜를
 * 누르면 그날 화면(/training/day/<날짜>)으로 간다.
 *
 *   /training               마지막으로 본 칸 (쿠키, 없으면 트레이닝)
 *   /training?view=today    트레이닝 칸 — 운동을 마치고 돌아오는 곳처럼 '운동'을 뜻하는 길
 *   /training?view=armcare  암케어 칸
 *
 * 쿠키를 적는 것은 화면 쪽(view-switch.tsx)이다 — 서버 화면은 쿠키를 쓸 수 없다. 읽는
 * 것은 서버(page.tsx)다. 주소에 칸이 적혀 있으면 그것이 먼저다.
 *
 * 이름을 'use client' 파일이 아니라 여기 둔다. 그런 파일에서 내보낸 값을 서버에서
 * 읽으면 진짜 값이 아니라 화면 쪽을 가리키는 표만 온다.
 */

export type TrainingPart = 'today' | 'armcare';

export const TRAINING_PART_COOKIE = 'bl-training-part';

/** 칸마다 가는 길 — 칸이 적혀 있어 쿠키와 상관없이 그 칸이 열린다 */
export const TRAINING_PART_HREF: Record<TrainingPart, string> = {
  today: '/training?view=today',
  armcare: '/training?view=armcare',
};

/** 주소나 쿠키에서 온 값 — 두 칸이 아니면 null */
export function readTrainingPart(
  value: string | null | undefined
): TrainingPart | null {
  return value === 'today' || value === 'armcare' ? value : null;
}
