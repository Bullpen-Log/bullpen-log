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
   * 가벼운 유산소 — 실내 자전거·걷기 같은 것. 회복날 맨 앞에만 뽑힌다
   * (lib/report/theme.ts 의 회복날 구성). 영상이 올라오기 전까지는 비어 있고,
   * 그동안 회복날은 이 구간 없이 짜인다.
   *
   * 처방은 '1세트 × 600초'처럼 시간으로 적는다. 화면에는 '10분'으로 나가고,
   * 운동 중에는 분으로 받는다.
   */
  { name: '유산소', tone: 'recovery' },
] as const satisfies readonly { name: string; tone: CategoryTone }[];

/** 투구 메커니즘 하위 카테고리 */
export const MECHANICS_CATEGORIES = [
  { name: '스로잉 드릴', tone: 'power' },
  { name: '메디신볼 드릴', tone: 'core' },
  { name: '무브먼트 패턴 드릴', tone: 'mobility' },
] as const satisfies readonly { name: string; tone: CategoryTone }[];

export const TRAINING_CATEGORY_NAMES: readonly string[] = TRAINING_CATEGORIES.map(
  (c) => c.name
);
export const MECHANICS_CATEGORY_NAMES: readonly string[] = MECHANICS_CATEGORIES.map(
  (c) => c.name
);
