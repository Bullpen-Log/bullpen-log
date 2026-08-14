/** 트레이닝 하위 카테고리 — 이 순서대로 페이지에 노출된다. */
export const TRAINING_CATEGORIES = [
  { name: '하체 스트렝스' },
  { name: '상체 스트렝스' },
  { name: '모빌리티' },
  { name: '파워' },
  { name: '코어' },
  { name: '암케어' },
  { name: '회복 및 보강' },
] as const;

/** 투구 메커니즘 하위 카테고리 */
export const MECHANICS_CATEGORIES = [
  { name: '스로잉 드릴' },
  { name: '메디신볼 드릴' },
  { name: '무브먼트 패턴 드릴' },
] as const;

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number]['name'];
export type MechanicsCategory = (typeof MECHANICS_CATEGORIES)[number]['name'];

export const TRAINING_CATEGORY_NAMES: readonly string[] = TRAINING_CATEGORIES.map(
  (c) => c.name
);
export const MECHANICS_CATEGORY_NAMES: readonly string[] = MECHANICS_CATEGORIES.map(
  (c) => c.name
);
