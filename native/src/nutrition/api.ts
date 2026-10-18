import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { EntryEdit, Food, MealEntryView, MealKey, RankedFood } from '@/lib/nutrition/meta';
import type { ComboItem, MealComboView } from '@/lib/nutrition/combos';
import type { FoodCategory } from '@/lib/nutrition/foods';
import type { PlanContext, PlanItem } from '@/lib/nutrition/meal-plan';
import type { Place } from '@/lib/nutrition/meal-templates';
import type { AgeBand } from '@/lib/nutrition/age';
import type { AvoidKey } from '@/lib/nutrition/diet-prefs';
import { rpc } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { call } from '~/pitch/api';

/**
 * 앱 영양 자료 — 그날 칸은 app.loadAppNutrition(웹과 같은 loadNutritionDay), 담기 · 양 · 지우기 · 체중은 웹과 같은 nutrition.* 서버 동작,
 * 식약처 검색 · 바코드는 웹과 같은 /api/nutrition/* 주소. 그날 칸은 투구 달처럼 쥐고 있다가 먼저 그린다(폰에도 남김).
 */
export type NutritionDay = {
  date: string;
  today: string;
  targets: { kcal: number; protein: number; carbs: number; fat: number; burn: number; base: number };
  entries: MealEntryView[];
  weightKg: number | null;
  recent: Food[];
  mine: Food[];
  mfds: boolean;
  mealPlan: { items: PlanItem[]; context: PlanContext } | null;
  /** 끼니 단백질 목표용 — 이 칸을 모르는 옛 서버 · 폰에 남은 옛 자료는 없다 */
  ageBand?: AgeBand;
  avoid?: AvoidKey[];
  checkinAnswers?: NutritionAnswer | null;
  yesterday?: MealEntryView[];
  /** 제목 밑 날짜 띠(최근 6주) — 옛 서버 · 폰에 남은 옛 자료는 없다 */
  strip?: { date: string; kcal: number; target: number }[];
  calendar?: Record<string, number>;
  adjust?: number;
  assumed?: string[];
  hasProfile?: boolean;
  advice?: { headline: string | null; score: number | null; highlight: boolean } | null;
  guide?: { badge: string; title: string; lines: string[]; notes: string[]; hint: string | null } | null;
  /** 음식 담기 — 자주 먹는 조합 · 분류 둘러보기의 세부 칸 수 · 인기(웹 food-sheet). 옛 서버 · 폰에 남은 옛 자료는 없다 */
  combos?: MealComboView[];
  browseSubs?: Record<string, Record<string, number>>;
  popular?: RankedFood[];
  favorites?: string[];
  /** 식단 짜기 카드의 오늘 상태 · 취향 한 줄(웹 PlanCard state) */
  planState?: string[];
};
export type NutritionAnswer = { appetite: number | null; mealAmount: string | null; skippedMeals: string[] };
type Result = { ok: true } | { ok: false; error: string };

class NutritionError extends Error {
  constructor(
    message: string,
    readonly to?: string
  ) {
    super(message);
  }
}
export { NutritionError };

type Entry = { day: NutritionDay | null; error: string | null; to: string | null; loading: boolean };
const days = new Map<string, Entry>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const EMPTY: Entry = { day: null, error: null, to: null, loading: false };

/* 날마다 마지막으로 보낸 읽기 번호 — 저장 전에 떠난 읽기가 저장 뒤 읽기보다 늦게 와 옛 목표 · 식단으로 덮지 않게 */
const seq = new Map<string, number>();

export async function refreshDay(date: string): Promise<void> {
  const prev = days.get(date) ?? EMPTY;
  const e = cacheEpoch();
  const n = (seq.get(date) ?? 0) + 1;
  seq.set(date, n);
  /* 로그아웃(세대가 바뀜) 뒤에 온 것 · 더 새 읽기가 있는 것은 버린다 */
  const current = () => e === cacheEpoch() && seq.get(date) === n;
  if (!prev.day)
    void cacheGet(`nutrition:${date}`).then((v) => {
      if (e !== cacheEpoch()) return;
      const now = days.get(date) ?? EMPTY;
      if (!now.day && v) {
        days.set(date, { ...now, day: v as NutritionDay });
        emit();
      }
    });
  days.set(date, { ...prev, loading: true });
  emit();
  try {
    const res = await rpc<({ ok: true } & NutritionDay) | { ok: false; error: string; to?: string }>('app.loadAppNutrition', date);
    if (!current()) return;
    const now = days.get(date) ?? EMPTY;
    if (!res.ok) days.set(date, { ...now, error: res.error, to: res.to ?? null, loading: false });
    else {
      days.set(date, { day: res, error: null, to: null, loading: false });
      void cacheSet(`nutrition:${date}`, res);
    }
  } catch (err) {
    if (!current()) return;
    const now = days.get(date) ?? EMPTY;
    days.set(date, { ...now, error: err instanceof Error ? err.message : '불러오지 못했어요.', loading: false });
  }
  emit();
}

export function useNutritionDay(date: string) {
  const entry = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => days.get(date) ?? EMPTY
  );
  useEffect(() => {
    void refreshDay(date);
  }, [date]);
  return { ...entry, reload: useCallback(() => refreshDay(date), [date]) };
}

export function resetNutritionStore() {
  days.clear();
  emit();
}

/**
 * 목표를 바꾼 뒤(목표 · 통계 화면) — 보던 날만 다시 받고(다시 받는 동안 지난 칸은 그대로), 받아 둔 다른 날은 버린다. 그날 칸마다 목표가 들어 있어
 * 옛 목표로 남으면 안 되고, 다 다시 받으면 저장마다 날 수만큼 서버를 불렀다. 버린 날은 다시 볼 때 받는다(useNutritionDay).
 */
export function refreshNutritionDays(date: string) {
  for (const d of [...days.keys()]) if (d !== date) days.delete(d);
  void refreshDay(date);
}

/** 서버 동작 하나 — 실패 글은 그대로, 성공하면 그날을 다시 받는다. 이름은 '<파일>.<함수>' 글자 그대로(npm run native-api:test 가 찾는다) */
async function act(date: string, name: string, ...args: unknown[]): Promise<string | null> {
  try {
    const res = await rpc<Result>(name, ...args);
    /* 실패해도 그날을 다시 받는다 — '식단이 방금 바뀌었어요'(동시 누름 막기) 뒤 옛 계획이 남아 다시 눌러도 같은 오류였다(2026-10-18 점검) */
    if (!res.ok) {
      void refreshDay(date);
      return res.error;
    }
    await refreshDay(date);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : '저장하지 못했어요.';
  }
}

/* 서버(cleanFood)는 출처 열쇠를 sourceId 로 읽는다 — 화면 음식(Food)의 id 를 옮겨 준다(웹 nutrition/shared.ts toFoodInput 과 같다).
   빠뜨리면 즐겨찾기 · 인기 순위 · 다시 고르기가 그 음식을 못 알아본다 */
export const toFoodInput = (food: Food) => ({ ...food, sourceId: food.id });
export const addFoods = (date: string, meal: MealKey, items: { food: Food; amount: number }[]) =>
  act(
    date,
    'nutrition.addMealEntries',
    date,
    meal,
    items.map((it) => ({ food: toFoodInput(it.food), amount: it.amount }))
  );
/** 끼니 편집의 '완료' — 고친 줄만 한 번에(웹과 같은 서버 동작) */
export const editEntries = (date: string, edits: EntryEdit[]) => act(date, 'nutrition.editMealEntries', edits);
/** 바꾸기 — 먹은 줄 · 식단 줄을 다른 음식으로(끼니 · 날짜 · 줄 이름은 그대로, 웹과 같은 서버 동작) */
export const replaceEntry = (date: string, id: string, food: Food, amount: number) =>
  act(date, 'nutrition.replaceMealEntry', id, toFoodInput(food), amount);
/** 직접 입력한 음식을 내 음식으로(웹 addCustom 의 saveMine — 바코드가 아니면 출처 'mine') */
export const saveMyFood = async (food: Food): Promise<string | null> => {
  try {
    const res = await rpc<Result>('nutrition.saveUserFood', toFoodInput({ ...food, source: 'mine' }));
    return res.ok ? null : res.error;
  } catch (e) {
    return e instanceof Error ? e.message : '저장하지 못했어요.';
  }
};
/** '오늘 식욕 · 끼니는요?' 카드 저장(웹과 같은 서버 동작 — DailyNutrition, 조언 · 가이드 · 식단 짜기가 읽는다) */
export const saveNutritionAnswer = (date: string, a: NutritionAnswer) =>
  act(date, 'day-cards.saveNutritionCheckin', { date, appetite: a.appetite, mealAmount: a.mealAmount, skippedMeals: a.skippedMeals });
export const replacePlan = (date: string, key: string, food: Food, amount: number) =>
  act(date, 'nutrition.replacePlanItem', date, key, toFoodInput(food), amount);
export const saveWeight = (date: string, kg: number | null) => act(date, 'nutrition.setWeight', date, kg);
/* 식단 짜기(오늘만) — 웹과 같은 서버 셈(lib/nutrition/meal-plan.ts). variant 를 올리면 다른 식단 */
export const makePlan = (date: string, place: Place, hot: boolean, variant: number) =>
  act(date, 'nutrition.makeMealPlan', date, { place, hot, variant });
/** 계획 줄을 먹은 기록으로 — 같은 줄을 두 번 눌러도 한 번 */
export const eatPlan = (date: string, keys: string[]) => act(date, 'nutrition.eatPlanItems', date, keys);
export const clearPlan = (date: string) => act(date, 'nutrition.clearMealPlan', date);

/** ★ 내 음식에 두기 · 풀기(웹 toggleFavorite — 같은 서버 동작) · 내 음식 지우기(웹 removeMine) */
export const favoriteFood = (date: string, food: Food) => act(date, 'nutrition.saveUserFood', toFoodInput(food));
export const unfavoriteFood = (date: string, food: Food) => act(date, 'nutrition.unfavoriteFood', food.source, food.id);
export const deleteMyFood = (date: string, id: string) => act(date, 'nutrition.deleteUserFood', id);
/** 조합 — 저장 · 지우기 · 담은 횟수(웹과 같은 서버 동작 nutrition.saveMealCombo · deleteMealCombo · markComboUsed) */
export const saveCombo = (date: string, name: string, meal: MealKey, items: ComboItem[]) => act(date, 'nutrition.saveMealCombo', { name, meal, items });
export const deleteCombo = (date: string, id: string) => act(date, 'nutrition.deleteMealCombo', id);
export const markComboUsed = (id: string) => rpc('nutrition.markComboUsed', id).catch(() => undefined);

/** 식약처 품목대표 둘러보기 — 웹 음식 창 [전체 음식]과 같은 /api/nutrition/browse(40줄씩, 분류 · 세부 칸) */
export type BrowsePage = { items: { food: Food; category: FoodCategory }[]; total: number; next: number | null };
export const browseMfds = (cat: FoodCategory | 'all', offset: number, sub: string | null) =>
  call<BrowsePage>(`/api/nutrition/browse?cat=${encodeURIComponent(cat)}&offset=${offset}${sub ? `&sub=${encodeURIComponent(sub)}` : ''}`, { method: 'GET' });

/** 식약처 — 품목대표(바로) 먼저, 상품까지는 뒤에(1~13초) */
export const searchMfdsReps = (q: string) =>
  call<{ foods: Food[] }>(`/api/nutrition/search?part=reps&q=${encodeURIComponent(q)}`, { method: 'GET' }).then((r) => r.foods);
export const searchMfds = (q: string) =>
  call<{ foods: Food[] }>(`/api/nutrition/search?q=${encodeURIComponent(q)}`, { method: 'GET' }).then((r) => r.foods);

/** 웹 lib/nutrition/barcode-lookup.ts BarcodeLookup 과 같다 — food 가 null 이면 못 찾음(name 은 이름만 알 때) */
export type BarcodeResult =
  | { ok: true; food: Food; from: 'mine' | 'off' }
  | { ok: true; food: null; name: string | null }
  | { ok: false; error: string };
export const lookupBarcode = (code: string) =>
  call<BarcodeResult>(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`, { method: 'GET' }).catch(
    (e: unknown): BarcodeResult => ({ ok: false, error: e instanceof Error ? e.message : '바코드를 찾지 못했어요.' })
  );
