/**
 * 트레이닝 탭의 두 칸 — [트레이닝 | 암케어].
 *
 * 2026-09-26 사용자분과 정했다: 트레이닝과 암케어는 서로 독립이다. 암케어는 운동
 * 일정에 붙여 하는 것이 아니라 투구 전이든 집에서든 따로든 언제든 하는 것이라,
 * 아래 탭의 '트레이닝'을 누르면 **마지막으로 보던 칸**이 열린다. 암케어만 하는 사람이
 * 매번 칸을 바꾸지 않게. 예전의 [기록] 칸은 뺐다 — 지난 운동은 홈 캘린더에서 날짜를
 * 누르면 그날 화면(/training/day/<날짜>)으로 간다.
 *
 *   /training               트레이닝 칸 — 늘 운동이다
 *   /training?view=armcare  암케어 칸
 *   /training?view=last     마지막으로 본 칸 (쿠키, 없으면 트레이닝) — 아래 탭·메뉴만 쓴다
 *
 * 처음에는 그냥 /training 이 마지막 칸을 열게 했다. 그랬더니 운동을 뜻하는 길(운동 판을
 * 마치고 돌아오기, 홈 캘린더의 오늘 운동 …)마다 ?view=today 를 붙여야 했고, 앞으로 누가
 * redirect('/training') 을 새로 쓰면 암케어를 마지막으로 본 사람은 말없이 암케어로 갔다
 * (2026-09-26 검토). 그래서 '마지막 칸'을 메뉴의 길 하나로 좁혔다.
 *
 * 쿠키를 적는 것은 화면 쪽(view-switch.tsx)이다 — 서버 화면은 쿠키를 쓸 수 없다. 읽는
 * 것은 서버(page.tsx)다.
 *
 * 이름을 'use client' 파일이 아니라 여기 둔다. 그런 파일에서 내보낸 값을 서버에서
 * 읽으면 진짜 값이 아니라 화면 쪽을 가리키는 표만 온다.
 */

export type TrainingPart = 'today' | 'armcare';

export const TRAINING_PART_COOKIE = 'bl-training-part';

/** 칸마다 가는 길 */
export const TRAINING_PART_HREF: Record<TrainingPart, string> = {
  today: '/training',
  armcare: '/training?view=armcare',
};

/** 아래 탭·메뉴의 '트레이닝' — 마지막으로 본 칸 (lib/nav.ts) */
export const TRAINING_LAST_HREF = '/training?view=last';

/** 주소나 쿠키에서 온 값 — 두 칸이 아니면 null */
export function readTrainingPart(
  value: string | null | undefined
): TrainingPart | null {
  return value === 'today' || value === 'armcare' ? value : null;
}
