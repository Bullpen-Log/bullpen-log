import 'server-only';
import { allMfdsReps } from '@/lib/nutrition/mfds-reps';
import {
  browsePage,
  buildBrowseIndex,
  type BrowseIndex,
} from '@/lib/nutrition/mfds-category';
import { FOOD_CATEGORIES, type FoodCategory } from '@/lib/nutrition/foods';

/**
 * 식약처 품목대표 둘러보기 — 음식 창 [전체 음식]의 '식약처' 목록이 부른다(app/api/nutrition/browse).
 * 분류는 mfds-category.ts(순수 계산). 목록은 서버가 처음 부를 때 한 번 만들어 둔다(8,800줄 → 수 밀리초).
 */

let index: BrowseIndex | null = null;

/** 한 번에 보내는 줄 수 — 화면이 내려가며 더 묻는다 */
export const BROWSE_PAGE = 40;

export function isBrowseCategory(v: unknown): v is FoodCategory | 'all' {
  return v === 'all' || FOOD_CATEGORIES.some((c) => c === v);
}

export function browseMfds(category: FoodCategory | 'all', offset: number) {
  index ??= buildBrowseIndex([...allMfdsReps()]);
  return browsePage(index, category, offset, BROWSE_PAGE);
}
