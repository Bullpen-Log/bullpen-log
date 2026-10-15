/**
 * 카테고리마다의 색 이름.
 *
 * 색값이 아니라 이름만 둔다. 실제 색은 app/globals.css 의 토큰이고, 밝은
 * 화면과 어두운 화면에서 값이 다르다. 여기에 색값을 적어두면 어두운 화면에서
 * 가라앉는다.
 */
export type CategoryTone =
  'lower' | 'upper' | 'mobility' | 'power' | 'core' | 'armcare' | 'recovery';

/** 트레이닝 하위 카테고리 — 이 순서대로 페이지에 노출된다. */
export const TRAINING_CATEGORIES = [
  /*
   * 워밍업은 하루 일정에 뽑히지 않는다.
   *
   * 어느 테마의 구성(lib/report/theme.ts 의 COMPOSITIONS)에도 이 이름이 없어서
   * 저절로 빠진다. 따로 막는 코드가 없는 것은 실수가 아니라 이 구조 때문이다.
   *
   * 워밍업은 고정 루틴 넷(하체·상체 밀기·상체 당기기·전신)에 담아 두고,
   * 운동을 시작할 때 그날 목적에 맞는 것과 전신 것을 보여준다.
   */
  { name: '워밍업', tone: 'mobility' },
  { name: '하체 스트렝스', tone: 'lower' },
  { name: '상체 스트렝스', tone: 'upper' },
  { name: '모빌리티', tone: 'mobility' },
  { name: '파워', tone: 'power' },
  { name: '코어', tone: 'core' },
  { name: '암케어', tone: 'armcare' },
  { name: '회복 및 보강', tone: 'recovery' },
  /*
   * 유산소 — 실내 자전거·걷기·가벼운 달리기·로잉 같은 것. 두 날에 뽑힌다
   * (lib/report/theme.ts): 회복날 맨 앞에 가볍게 하나, 컨디셔닝 날에 하나.
   * 영상이 올라오기 전까지는 비어 있고, 그동안 두 날 모두 이 구간 없이 짜인다.
   *
   * 회복날은 강도 '낮음' 이하만 받는다(isRecoveryLight). 컨디셔닝용으로 숨이
   * 차는 것을 올릴 때는 강도를 '중간' 이상으로 적어 두면 회복날에는 안 나온다.
   * 줄넘기처럼 뛰는 것은 여기 넣지 않는다 — 컨디셔닝은 점프를 빼는 날이다.
   *
   * 처방은 '1세트 × 600초'처럼 시간으로 적는다. 화면에는 '10분'으로 나가고,
   * 운동 중에는 분으로 받는다.
   */
  { name: '유산소', tone: 'recovery' },
  /*
   * 나중에 촬영 — 영상이 아직 없어 뒤로 미룬 운동(2026-10-14 사용자). 워밍업처럼 어느 테마의 구성에도 없어 일정에 안 뽑히고,
   * 새 일정 · 암케어 · 재활 · 루틴이 보는 visibleExercises(lib/library-cache.ts)에서도 빠진다. 운동 영상 화면에만 이 칸으로 보인다.
   * 원래 분류는 lib/shoot/later.json — 찍으면 scripts/library-later-2026-10-14.mjs --restore 로 되돌린다.
   */
  { name: '나중에 촬영', tone: 'recovery' },
] as const satisfies readonly { name: string; tone: CategoryTone }[];

/** 나중에 촬영할 운동의 분류 이름 — 추천 · 루틴에서 빠진다 */
export const LATER_CATEGORY = '나중에 촬영';

/** 투구 메커니즘 하위 카테고리 */
export const MECHANICS_CATEGORIES = [
  { name: '스로잉 드릴', tone: 'power' },
  { name: '메디신볼 드릴', tone: 'core' },
  { name: '무브먼트 패턴 드릴', tone: 'mobility' },
  /*
   * 나중에 촬영 — 영상이 아직 없어 뒤로 미룬 드릴(2026-10-14 사용자, 운동의 같은 칸과 같은 뜻). 드릴 영상 화면에는 이 칸으로 보이고,
   * 트레이닝(메커니즘 프로그램 · 요소별 드릴 · 3D 결과 화면의 드릴)이 보는 trainingGuides(lib/library-cache.ts)에서는 빠진다.
   * 원래 분류는 lib/shoot/later-drills.json — 찍으면 scripts/drills-later-2026-10-14.mjs --restore 로 되돌린다.
   */
  { name: '나중에 촬영', tone: 'recovery' },
] as const satisfies readonly { name: string; tone: CategoryTone }[];

export const TRAINING_CATEGORY_NAMES: readonly string[] = TRAINING_CATEGORIES.map(
  (c) => c.name
);
export const MECHANICS_CATEGORY_NAMES: readonly string[] = MECHANICS_CATEGORIES.map(
  (c) => c.name
);

/**
 * 두 분류에 함께 드는 운동 — DB 의 분류(category)는 하나라 더 드는 분류를 여기 적는다(2026-10-16 김민: "박스 스쿼트는 스트렝스 · 파워 공통").
 * 근력 프로그램의 본운동 칸(lib/program/program.ts VARIANT_RULES)이 inCategory 로 본다. 매일 일정(lib/report/theme.ts)은 아직 DB 분류만 본다.
 */
export const ALSO_IN: Readonly<Record<string, readonly string[]>> = {
  '박스 스쿼트': ['하체 스트렝스'],
};

export function inCategory(ex: { title: string; category: string }, category: string): boolean {
  return ex.category === category || (ALSO_IN[ex.title]?.includes(category) ?? false);
}
