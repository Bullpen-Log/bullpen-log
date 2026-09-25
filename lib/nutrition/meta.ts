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

/**
 * 목표. 칼로리를 얼마나 더하고 빼나.
 *
 * 증량 +300 은 한 달에 0.5~1kg 쯤 붙는 속도다. 더 크게 잡으면 붙는 것의 대부분이
 * 지방이다. 감량 −400 도 같은 까닭으로 작게 잡았다 — 시즌 중에 크게 굶으면 구속과
 * 회복이 먼저 떨어진다.
 */
export const GOALS = [
  { key: 'gain', label: '증량', hint: '몸을 키운다 · 하루 +300kcal', kcalDelta: 300 },
  { key: 'maintain', label: '유지', hint: '지금 몸으로 시즌을 버틴다', kcalDelta: 0 },
  { key: 'lose', label: '감량', hint: '천천히 뺀다 · 하루 −400kcal', kcalDelta: -400 },
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
  { key: 'low', label: '적음', hint: '주로 앉아서 지낸다 · 팀 훈련 없음', factor: 1.3 },
  { key: 'mid', label: '보통', hint: '주 3~4일 팀 훈련', factor: 1.5 },
  { key: 'high', label: '많음', hint: '거의 매일 팀 훈련', factor: 1.7 },
] as const;

export type ActivityKey = (typeof ACTIVITIES)[number]['key'];

export function isActivityKey(v: unknown): v is ActivityKey {
  return typeof v === 'string' && ACTIVITIES.some((a) => a.key === v);
}

export const SEXES = [
  { key: 'M', label: '남' },
  { key: 'F', label: '여' },
] as const;

export type Sex = (typeof SEXES)[number]['key'];

export function isSex(v: unknown): v is Sex {
  return v === 'M' || v === 'F';
}

/** 체중 1kg 당 단백질(g). 선수에게 권하는 범위가 1.6~2.2 다. */
export const PROTEIN_CHOICES = [1.6, 1.8, 2.0, 2.2] as const;
export const PROTEIN_MIN = 1.2;
export const PROTEIN_MAX = 2.5;

/** 물 한 잔 */
export const WATER_CUP_ML = 250;
export const WATER_MAX_ML = 8000;

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
export type FoodSource = 'basic' | 'mfds' | 'mine';
export type EntrySource = FoodSource | 'free';

export const SOURCE_LABEL: Record<EntrySource, string> = {
  basic: '기본',
  mfds: '식약처',
  mine: '내 음식',
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
};

/** 1인분 값 × 먹은 양 */
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
