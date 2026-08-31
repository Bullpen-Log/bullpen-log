/**
 * 카테고리마다의 색 이름.
 *
 * 색값이 아니라 이름만 둔다. 실제 색은 app/globals.css 의 토큰이고, 밝은
 * 화면과 어두운 화면에서 값이 다르다. 여기에 색값을 적어두면 어두운 화면에서
 * 가라앉는다.
 */
export type CategoryTone =
  | 'lower'
  | 'upper'
  | 'mobility'
  | 'power'
  | 'core'
  | 'armcare'
  | 'recovery';

/** 트레이닝 하위 카테고리 — 이 순서대로 페이지에 노출된다. */
export const TRAINING_CATEGORIES = [
  { name: '하체 스트렝스', tone: 'lower' },
  { name: '상체 스트렝스', tone: 'upper' },
  { name: '모빌리티', tone: 'mobility' },
  { name: '파워', tone: 'power' },
  { name: '코어', tone: 'core' },
  { name: '암케어', tone: 'armcare' },
  { name: '회복 및 보강', tone: 'recovery' },
] as const satisfies readonly { name: string; tone: CategoryTone }[];

/** 투구 메커니즘 하위 카테고리 */
export const MECHANICS_CATEGORIES = [
  { name: '스로잉 드릴', tone: 'power' },
  { name: '메디신볼 드릴', tone: 'core' },
  { name: '무브먼트 패턴 드릴', tone: 'mobility' },
] as const satisfies readonly { name: string; tone: CategoryTone }[];

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number]['name'];
export type MechanicsCategory = (typeof MECHANICS_CATEGORIES)[number]['name'];

export const TRAINING_CATEGORY_NAMES: readonly string[] = TRAINING_CATEGORIES.map(
  (c) => c.name
);
export const MECHANICS_CATEGORY_NAMES: readonly string[] = MECHANICS_CATEGORIES.map(
  (c) => c.name
);
