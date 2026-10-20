import type { Food } from '@/lib/nutrition/meta';

/**
 * 바코드 화면이 찾은 음식을 담기 화면에 건넨다(스택 화면끼리 — 돌아오면 담기 화면이 한 번 가져간다). from: 어디서 찾았나(웹 barcode-panel 의
 * '전에 적어 둔 바코드예요.' · '공개 자료에서 찾았어요…' 한 줄) — 방금 손으로 적은 것은 'new'.
 */
export type Scanned = { food: Food; from: 'mine' | 'off' | 'new' };
let slot: Scanned | null = null;
export const putScanned = (food: Food, from: Scanned['from']) => {
  slot = { food, from };
};
export function takeScanned(): Scanned | null {
  const f = slot;
  slot = null;
  return f;
}
/** 로그아웃 — 앞사람이 찍은 바코드 음식이 다음 사람 담기 화면에 안 넘어가게 */
export const resetScanned = () => {
  slot = null;
};
