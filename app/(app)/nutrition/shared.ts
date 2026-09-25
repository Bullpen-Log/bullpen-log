import type { MouseEvent } from 'react';
import type { Food } from '@/lib/nutrition/meta';
import type { FoodInput } from '@/app/actions/nutrition';

/** 창이 날아 나올 자리 — 누른 단추의 한가운데(components/modal.tsx 의 origin) */
export type Origin = { x: number; y: number };

export function originOf(e: MouseEvent<HTMLElement>): Origin {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 화면의 음식 → 저장 동작에 넘길 값 */
export function toFoodInput(food: Food): FoodInput {
  return {
    source: food.source,
    sourceId: food.id,
    name: food.name,
    servingLabel: food.servingLabel,
    servingGrams: food.servingGrams,
    kcal: food.kcal,
    carbs: food.carbs,
    protein: food.protein,
    fat: food.fat,
  };
}

/** 이징 — 앱의 다른 곳(캘린더·창)과 같은 곡선 */
export const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
