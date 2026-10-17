import type { Food } from '@/lib/nutrition/meta';

/** 바코드 화면이 찾은 음식을 담기 화면에 건넨다(스택 화면끼리 — 돌아오면 담기 화면이 한 번 가져간다) */
let slot: Food | null = null;
export const putScanned = (food: Food) => {
  slot = food;
};
export function takeScanned(): Food | null {
  const f = slot;
  slot = null;
  return f;
}
