/**
 * 식단 취향 · 운동 환경 — 목표 구체화와 식단 짜기(lib/nutrition/meal-plan.ts)가 읽는다.
 *
 * NutritionProfile 의 칸에 저장한다(goalEndDate · seasonPhase · dietStyle · mealPattern · avoidFoods · allowSupplements).
 * 비어 있으면 기본값으로 짠다 — 아무것도 안 정한 사람도 첫날부터 식단을 받는다.
 *
 * 그날마다 바뀌는 환경(더위 · 야외, 오늘 훈련 장소)은 여기 두지 않는다 — 식단을 짤 때 고르고 그날 계획(MealPlan.context)에 남는다.
 */

/** 시즌 단계 — 탄수화물 · 회복의 비중을 바꾼다 */
export const SEASON_PHASES = [
  { key: 'off', label: '비시즌', hint: '몸을 만드는 때라 목표 칼로리를 꾸준히 채워요' },
  {
    key: 'pre',
    label: '시즌 준비',
    hint: '훈련량이 느는 때라 탄수화물을 넉넉히 넣어요',
  },
  {
    key: 'in',
    label: '시즌 중',
    hint: '경기에 맞춰 익숙한 음식, 던지는 날엔 탄수화물을 넣어요',
  },
  {
    key: 'rehab',
    label: '재활',
    hint: '덜 움직이는 때라 단백질은 그대로, 단 음식은 줄여요',
  },
] as const;
export type SeasonPhase = (typeof SEASON_PHASES)[number]['key'];

/** 식단 스타일 — 어떤 끼니 틀을 먼저 고르나 */
export const DIET_STYLES = [
  { key: 'korean', label: '한식 위주', hint: '밥 · 국 · 반찬 중심' },
  { key: 'mixed', label: '골고루', hint: '한식 · 양식 · 분식을 섞어서' },
  { key: 'simple', label: '간편식 위주', hint: '도시락 · 편의점 · 바로 먹는 것' },
] as const;
export type DietStyle = (typeof DIET_STYLES)[number]['key'];

/** 끼니 구성 — 하루를 몇 번에 나눠 먹나 */
export const MEAL_PATTERNS = [
  { key: '3', label: '세 끼' },
  { key: '3+1', label: '세 끼 + 간식' },
  { key: '3+2', label: '세 끼 + 간식 둘' },
  { key: '2+1', label: '두 끼 + 간식' },
] as const;
export type MealPattern = (typeof MEAL_PATTERNS)[number]['key'];

/** 못 먹거나 안 먹는 것 — 식단 짜기가 이 꼬리표가 붙은 음식을 빼고 바꿔 넣는다 */
export const AVOIDS = [
  { key: 'dairy', label: '우유 · 유제품' },
  { key: 'egg', label: '달걀' },
  { key: 'seafood', label: '해산물' },
  { key: 'pork', label: '돼지고기' },
  { key: 'beef', label: '소고기' },
  { key: 'chicken', label: '닭고기' },
  { key: 'wheat', label: '밀가루' },
  { key: 'nuts', label: '견과류' },
  { key: 'spicy', label: '매운 음식' },
] as const;
export type AvoidKey = (typeof AVOIDS)[number]['key'];

export type DietPrefs = {
  /** 목표 날짜('YYYY-MM-DD') — 이때까지 목표 체중에. null 은 기간 없음 */
  goalEndDate: string | null;
  /** 시즌 단계. null 은 안 정함(식단 짜기는 '시즌 중'처럼 무난하게) */
  seasonPhase: SeasonPhase | null;
  dietStyle: DietStyle;
  mealPattern: MealPattern;
  avoid: AvoidKey[];
  /** 단백질 쉐이크 · 바를 식단에 넣어도 되나 */
  supplements: boolean;
};

export const DEFAULT_PREFS: DietPrefs = {
  goalEndDate: null,
  seasonPhase: null,
  dietStyle: 'mixed',
  mealPattern: '3+1',
  avoid: [],
  supplements: true,
};

const keyIn =
  <T extends string>(list: readonly { key: T }[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && list.some((x) => x.key === v);

export const isSeasonPhase = keyIn(SEASON_PHASES);
export const isDietStyle = keyIn(DIET_STYLES);
export const isMealPattern = keyIn(MEAL_PATTERNS);
export const isAvoidKey = keyIn(AVOIDS);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** 목표 날짜는 2년 안까지 — 그보다 먼 계획은 체중 흐름과 견줄 수 없다 */
export const GOAL_END_MAX_DAYS = 730;

const dayNumber = (key: string) => Date.parse(`${key}T00:00:00.000Z`) / 86_400_000;

/** DB 줄 → 취향. 칸이 없거나 틀린 값이면 기본값(이 칸들이 생기기 전의 줄도 받는다) */
export function toDietPrefs(
  row: {
    goalEndDate?: Date | null;
    seasonPhase?: string | null;
    dietStyle?: string | null;
    mealPattern?: string | null;
    avoidFoods?: string[] | null;
    allowSupplements?: boolean | null;
  } | null
): DietPrefs {
  if (!row) return DEFAULT_PREFS;
  return {
    goalEndDate: row.goalEndDate ? row.goalEndDate.toISOString().slice(0, 10) : null,
    /* 시즌은 2026-10-10 에 묻지 않기로 했다(사용자: "시즌 정하는 건 다 빼") — 옛 줄에 남은 값도 계산에 안 쓴다 */
    seasonPhase: null,
    dietStyle: isDietStyle(row.dietStyle) ? row.dietStyle : DEFAULT_PREFS.dietStyle,
    mealPattern: isMealPattern(row.mealPattern)
      ? row.mealPattern
      : DEFAULT_PREFS.mealPattern,
    avoid: [...new Set((row.avoidFoods ?? []).filter(isAvoidKey))],
    supplements: row.allowSupplements ?? DEFAULT_PREFS.supplements,
  };
}

/**
 * 화면에서 온 취향을 하나씩 본다(서버 저장 전). 틀리면 까닭을 글로 돌려준다.
 * 목표 날짜는 오늘 뒤 · 2년 안. 지난 날짜는 받지 않는다 — 그날이 지나면 화면이 '날짜가 지났어요'로 다시 정하게 한다.
 */
export function cleanDietPrefs(raw: unknown, todayKey: string): DietPrefs | string {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) return '식단 취향이 올바르지 않아요.';

  let goalEndDate: string | null = null;
  if (o.goalEndDate !== null && o.goalEndDate !== undefined) {
    if (typeof o.goalEndDate !== 'string' || !DATE_KEY.test(o.goalEndDate)) {
      return '목표 날짜가 올바르지 않아요.';
    }
    const days = dayNumber(o.goalEndDate) - dayNumber(todayKey);
    if (!Number.isFinite(days) || days < 1 || days > GOAL_END_MAX_DAYS) {
      return '목표 날짜는 내일부터 2년 안으로 정해 주세요.';
    }
    goalEndDate = o.goalEndDate;
  }
  if (!isDietStyle(o.dietStyle)) return '식단 스타일을 다시 골라 주세요.';
  if (!isMealPattern(o.mealPattern)) return '끼니 구성을 다시 골라 주세요.';
  if (
    !Array.isArray(o.avoid) ||
    o.avoid.length > AVOIDS.length ||
    !o.avoid.every(isAvoidKey)
  ) {
    return '못 먹는 것을 다시 골라 주세요.';
  }
  if (typeof o.supplements !== 'boolean') return '보충식품 설정이 올바르지 않아요.';

  return {
    goalEndDate,
    seasonPhase: null,
    dietStyle: o.dietStyle,
    mealPattern: o.mealPattern,
    avoid: [...new Set(o.avoid)],
    supplements: o.supplements,
  };
}
