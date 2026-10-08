/**
 * 영양 탭에서 쓰는 이름과 모양.
 *
 * 화면과 서버가 같이 읽는다. 여기에는 DB 도, 무거운 계산도 없다.
 *
 * 흐름은 다이어트 앱 '인아웃'에서 가져왔다 — 끼니 넷(아침·점심·저녁·간식)에
 * 먹은 것을 담고, 먹은 칼로리(IN)와 운동으로 쓴 칼로리(OUT)를 목표와 견준다.
 * 다만 이 앱은 살을 빼는 앱이 아니라 투수의 몸을 만드는 앱이라, 목표는
 * 증량·유지·감량 셋 가운데 고르고 단백질은 체중에 맞춰 잡는다.
 */

export const MEALS = [
  { key: 'breakfast', label: '아침' },
  { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' },
  { key: 'snack', label: '간식' },
] as const;

export type MealKey = (typeof MEALS)[number]['key'];

export function isMealKey(v: unknown): v is MealKey {
  return typeof v === 'string' && MEALS.some((m) => m.key === v);
}

export function mealLabel(key: MealKey) {
  return MEALS.find((m) => m.key === key)?.label ?? key;
}

/** 끼니 편집에서 고친 한 줄 — 양 · 끼니를 바꾸거나 지운다(고친 것만 싣는다) */
export type EntryEdit = {
  id: string;
  amount?: number;
  meal?: MealKey;
  remove?: boolean;
};

/**
 * 목표. 칼로리를 얼마나 더하고 빼나.
 *
 * 증량 +300 은 한 달에 0.5~1kg 쯤 붙는 속도다. 더 크게 잡으면 붙는 것의 대부분이
 * 지방이다. 감량 −400 도 같은 까닭으로 작게 잡았다 — 시즌 중에 크게 굶으면 구속과
 * 회복이 먼저 떨어진다.
 */
export const GOALS = [
  { key: 'gain', label: '증량', hint: '몸을 키워요 · 하루 +300kcal', kcalDelta: 300 },
  { key: 'maintain', label: '유지', hint: '지금 몸으로 시즌을 버텨요', kcalDelta: 0 },
  { key: 'lose', label: '감량', hint: '천천히 빼요 · 하루 −400kcal', kcalDelta: -400 },
] as const;

export type GoalKey = (typeof GOALS)[number]['key'];

export function isGoalKey(v: unknown): v is GoalKey {
  return typeof v === 'string' && GOALS.some((g) => g.key === v);
}

/**
 * 운동을 뺀 평소 움직임 — 기초대사량에 곱하는 수.
 *
 * 앱에 적은 운동과 투구는 그날 기록에서 따로 더한다(OUT). 그래서 여기서는 팀 훈련처럼
 * 앱에 안 적히는 움직임까지만 센다. 일반 계산기의 '운동 많이 함(1.725)'을 고르면
 * 적어 둔 운동을 두 번 세게 된다.
 */
export const ACTIVITIES = [
  { key: 'low', label: '적음', hint: '주로 앉아서 지내요 · 팀 훈련 없음', factor: 1.3 },
  { key: 'mid', label: '보통', hint: '주 3~4일 팀 훈련', factor: 1.5 },
  { key: 'high', label: '많음', hint: '거의 매일 팀 훈련', factor: 1.7 },
] as const;

export type ActivityKey = (typeof ACTIVITIES)[number]['key'];

export function isActivityKey(v: unknown): v is ActivityKey {
  return typeof v === 'string' && ACTIVITIES.some((a) => a.key === v);
}

/*
 * ── 인아웃식 온보딩(2026-10-08, docs/designs/inout-onboarding.md ④) ──
 *
 * 목표 카드는 다섯이지만 계산은 셋(GOALS)으로 접는다 — lib/nutrition/onboarding.ts foldGoalKind.
 * 근육 키우기 = 증량 + 단백질 높임, 군살만 빼기 = (성인) 감량 + 단백질 높임. 카드 설명은 나이마다 화면이 다듬는다.
 */
export const GOAL_KINDS = [
  { key: 'gain', label: '증량', hint: '몸을 키워요' },
  { key: 'muscle', label: '근육 키우기', hint: '단백질을 높여 천천히 키워요' },
  { key: 'maintain', label: '유지', hint: '지금 몸으로 시즌을 버텨요' },
  { key: 'lose', label: '감량', hint: '천천히 빼요' },
  { key: 'lean', label: '군살만 빼기', hint: '힘은 지키고 단백질을 높여요' },
] as const;

export type GoalKind = (typeof GOAL_KINDS)[number]['key'];

export function isGoalKind(v: unknown): v is GoalKind {
  return typeof v === 'string' && GOAL_KINDS.some((g) => g.key === v);
}

/**
 * 탄단지 나누기 — 지방 몫을 정한다. 단백질은 체중 1kg 당 g(나이 규칙), 탄수화물은 나머지라 지방 몫이 바뀌면 탄수화물이 움직인다.
 * 키토(탄수 제한) · 비건은 없다 — 던지는 날 탄수화물 원칙 · 성장기 보호와 맞지 않고, 비건은 '못 먹는 것'으로 푼다.
 * null(옛 줄 · 안 고름) = 균형(25%)이라 지금 숫자와 1kcal 도 안 다르다.
 */
export const MACRO_PRESETS = [
  { key: 'balanced', label: '균형', hint: '지방 25% · 기본', fatShare: 0.25 },
  {
    key: 'carb',
    label: '탄수화물 넉넉히',
    hint: '지방 20% · 던지는 날이 많은 시즌',
    fatShare: 0.2,
  },
  {
    key: 'protein',
    label: '단백질 넉넉히',
    hint: '체중 1kg 당 2.0g 이상 · 지방 25%',
    fatShare: 0.25,
  },
] as const;

export type MacroPreset = (typeof MACRO_PRESETS)[number]['key'];

export function isMacroPreset(v: unknown): v is MacroPreset {
  return typeof v === 'string' && MACRO_PRESETS.some((p) => p.key === v);
}

export const DEFAULT_FAT_SHARE = 0.25;

export function fatShareOf(preset: MacroPreset | null): number {
  return MACRO_PRESETS.find((p) => p.key === preset)?.fatShare ?? DEFAULT_FAT_SHARE;
}

/** '단백질 넉넉히' 프리셋의 체중 1kg 당 단백질 바닥(성인) — 성장기는 나이 범위로 당긴다 */
export const PROTEIN_PRESET_PER_KG = 2.0;

/** 직접 정하는 하루 지방(g)의 범위 — 계산값(체중 0.8g/kg 바닥 ~ 6,000kcal 의 25%)이 늘 이 안에 들게 */
export const FAT_G_MIN = 20;
export const FAT_G_MAX = 200;

/* 성별은 계정에 딸린 값이라 lib/profile.ts 에 있다. 영양 쪽에서도 같은 것을 쓴다. */
export { SEXES, isSex, type Sex } from '@/lib/profile';

/** 체중 1kg 당 단백질(g)로 저장할 수 있는 범위. 나이마다 고르는 칸은 lib/nutrition/age.ts */
export const PROTEIN_MIN = 1.2;
export const PROTEIN_MAX = 2.5;
/**
 * 직접 정하는 하루 단백질(g)의 범위 — 계산값이 늘 이 안에 들게 넓게 둔다: 가장 가벼운 어린이(20kg × 1.2g = 24g)부터
 * 가장 무거운 성인(200kg × 2.2g = 440g)까지. 좁히면 앱이 미리 채운 계산값이 저장에서 막힌다.
 */
export const PROTEIN_G_MIN = 10;
export const PROTEIN_G_MAX = 450;

/**
 * 먹은 양(인분). 버튼으로는 ¼ 인분씩 오르내리지만, 그램으로 적으면 더 잘게
 * 나뉜다(1인분 200g 에 20g → 0.1 인분). 그래서 바닥을 0.05 로 둔다.
 */
export const AMOUNT_MIN = 0.05;
export const AMOUNT_MAX = 20;

/** 한 가지 음식 1인분이 넘을 수 없는 값. 오타(3000 → 30000)를 막는 선이다. */
export const KCAL_MAX = 5000;
export const MACRO_MAX = 500;
export const FOOD_NAME_MAX = 60;

/** 음식이 어디서 왔나 */
/* barcode — 바코드로 찾은 제품(열쇠는 바코드 숫자, lib/nutrition/barcode.ts) */
export type FoodSource = 'basic' | 'mfds' | 'mine' | 'barcode';
export type EntrySource = FoodSource | 'free';

/** 받을 수 있는 출처 전부 — 서버 검사 · 읽기가 한곳에서 본다 */
export const ENTRY_SOURCES: EntrySource[] = [
  'basic',
  'mfds',
  'mine',
  'barcode',
  'free',
];

export const SOURCE_LABEL: Record<EntrySource, string> = {
  basic: '기본',
  mfds: '식약처',
  mine: '내 음식',
  barcode: '바코드',
  free: '직접 입력',
};

/**
 * 음식 한 가지. 어디서 왔든 같은 모양으로 다룬다.
 * 영양소는 1인분(servingLabel) 값이다. 모르는 칸은 null.
 *
 * '최근 먹은 것'에는 직접 입력한 것('free')도 섞여 나온다. 그것만 열쇠가 없다.
 */
export type Food = {
  source: EntrySource;
  /** 출처 안에서의 열쇠 — 기본 목록 key · 식약처 식품코드 · 내 음식 id. 직접 입력은 null. */
  id: string | null;
  name: string;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  /** 이름 옆에 작게 붙는 말 — 식약처는 제조사, 기본 목록은 분류 */
  note?: string;
};

/** 인기 순위에 든 음식 — 몇 위인지, 몇 번·몇 명이 담았는지 */
export type RankedFood = Food & { rank: number; picks: number; people: number };

export type Macros = { kcal: number; carbs: number; protein: number; fat: number };

export const ZERO: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 };

/** 기록 한 줄 — 1인분 값과 먹은 양 */
export type MealEntryView = {
  id: string;
  meal: MealKey;
  name: string;
  source: EntrySource;
  sourceId: string | null;
  servingLabel: string | null;
  servingGrams: number | null;
  amount: number;
  kcal: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  /**
   * 담은 시각(ISO). 던지는 날 가이드가 '던진 뒤에 담은 음식'을 셀 때 쓴다(lib/nutrition/guide.ts).
   * 방금 담아 아직 저장 중인 줄에는 없다.
   */
  loggedAt?: string;
};

export type MacroKey = 'carbs' | 'protein' | 'fat';

const MACRO_KEYS: readonly MacroKey[] = ['carbs', 'protein', 'fat'];
const MACRO_NAMES: Record<MacroKey, string> = {
  carbs: '탄수화물',
  protein: '단백질',
  fat: '지방',
};
const MACRO_SHORT: Record<MacroKey, string> = { carbs: '탄', protein: '단', fat: '지' };

/**
 * 정보가 없는 영양소.
 *
 * 식약처 '수집' 자료(프랜차이즈 · 카페 메뉴 등)는 원자료에 탄수화물 · 지방이 없는
 * 일이 많다(2026-09-30 표본 200개 중 132개). 합계에서는 0 으로 더해지므로(scaleMacros),
 * 화면이 '실제로는 더 먹었다'고 따로 알려야 숫자를 믿을 수 있다.
 */
export function missingMacros(per: {
  carbs: number | null;
  protein: number | null;
  fat: number | null;
}): MacroKey[] {
  return MACRO_KEYS.filter((k) => per[k] === null);
}

/** '탄·지 모름' — 음식 한 줄 옆에. '없음'이라 적으면 0g 으로 읽힌다 */
export function missingText(keys: MacroKey[]) {
  return `${keys.map((k) => MACRO_SHORT[k]).join('·')} 모름`;
}

/** 영양소마다 정보가 빠진 음식 수, 그리고 하나라도 빠진 음식 수 */
export type MacroGaps = Record<MacroKey, number> & { foods: number };

export function macroGaps(entries: MealEntryView[]): MacroGaps {
  const gaps: MacroGaps = { carbs: 0, protein: 0, fat: 0, foods: 0 };
  for (const e of entries) {
    const miss = missingMacros(e);
    for (const k of miss) gaps[k] += 1;
    if (miss.length > 0) gaps.foods += 1;
  }
  return gaps;
}

/** '탄수화물·지방' — 빠진 것이 있는 영양소 이름 */
export function gapNames(gaps: MacroGaps) {
  return MACRO_KEYS.filter((k) => gaps[k] > 0)
    .map((k) => MACRO_NAMES[k])
    .join('·');
}

/**
 * 1인분 값 × 먹은 양.
 * 모르는 칸(null)은 0 으로 셈한다 — 빠졌다는 표시는 missingMacros 로 따로 한다.
 */
export function scaleMacros(
  per: {
    kcal: number;
    carbs: number | null;
    protein: number | null;
    fat: number | null;
  },
  amount: number
): Macros {
  return {
    kcal: per.kcal * amount,
    carbs: (per.carbs ?? 0) * amount,
    protein: (per.protein ?? 0) * amount,
    fat: (per.fat ?? 0) * amount,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      carbs: acc.carbs + m.carbs,
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
    }),
    ZERO
  );
}

export function entryMacros(e: MealEntryView): Macros {
  return scaleMacros(e, e.amount);
}

/** 먹은 양을 사람 말로 — '1.5인분', '½인분' */
export function amountText(amount: number) {
  const frac: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  if (frac[amount]) return `${frac[amount]}인분`;
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2).replace(/0$/, '')}인분`;
}

/** 칼로리 숫자 — 1,234 */
export function kcalText(n: number) {
  return Math.round(n).toLocaleString('ko-KR');
}

/** 그램 숫자 — 소수 한 자리까지, 필요할 때만 */
export function gramText(n: number) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
