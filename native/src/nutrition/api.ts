import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Food, MealEntryView, MealKey } from '@/lib/nutrition/meta';
import type { PlanContext, PlanItem } from '@/lib/nutrition/meal-plan';
import type { Place } from '@/lib/nutrition/meal-templates';
import { rpc } from '~/lib/rpc';
import { cacheGet, cacheSet } from '~/lib/store';
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
};
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

export async function refreshDay(date: string): Promise<void> {
  const prev = days.get(date) ?? EMPTY;
  if (!prev.day)
    void cacheGet(`nutrition:${date}`).then((v) => {
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
    if (!res.ok) days.set(date, { ...prev, error: res.error, to: res.to ?? null, loading: false });
    else {
      days.set(date, { day: res, error: null, to: null, loading: false });
      void cacheSet(`nutrition:${date}`, res);
    }
  } catch (e) {
    days.set(date, { ...prev, error: e instanceof Error ? e.message : '불러오지 못했어요.', loading: false });
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

/** 서버 동작 하나 — 실패 글은 그대로, 성공하면 그날을 다시 받는다. 이름은 '<파일>.<함수>' 글자 그대로(npm run native-api:test 가 찾는다) */
async function act(date: string, name: string, ...args: unknown[]): Promise<string | null> {
  try {
    const res = await rpc<Result>(name, ...args);
    if (!res.ok) return res.error;
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
export const setAmount = (date: string, id: string, amount: number) => act(date, 'nutrition.updateMealAmount', id, amount);
export const removeEntry = (date: string, id: string) => act(date, 'nutrition.deleteMealEntry', id);
export const saveWeight = (date: string, kg: number | null) => act(date, 'nutrition.setWeight', date, kg);
/* 식단 짜기(오늘만) — 웹과 같은 서버 셈(lib/nutrition/meal-plan.ts). variant 를 올리면 다른 식단 */
export const makePlan = (date: string, place: Place, hot: boolean, variant: number) =>
  act(date, 'nutrition.makeMealPlan', date, { place, hot, variant });
/** 계획 줄을 먹은 기록으로 — 같은 줄을 두 번 눌러도 한 번 */
export const eatPlan = (date: string, keys: string[]) => act(date, 'nutrition.eatPlanItems', date, keys);
export const clearPlan = (date: string) => act(date, 'nutrition.clearMealPlan', date);

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
