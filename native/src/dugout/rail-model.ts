/**
 * 같이 연습 모임 카드 넘기기의 순수 규칙(자체 시험 native-home:test) — 고른 모임은 id 로 쥐고, 위치 점은 지금 자리 둘레 다섯 개까지.
 */

/** 고른 모임 id 를 새 목록에 맞춘다 — 있으면 그대로, 없으면(지워짐 · 지역 바뀜) 옛 자리 근처, 목록이 비면 null */
export function keepSelected(prev: readonly { id: string }[] | null, next: readonly { id: string }[], selected: string | null): string | null {
  if (!next.length) return null;
  if (selected && next.some((m) => m.id === selected)) return selected;
  const at = selected && prev ? prev.findIndex((m) => m.id === selected) : 0;
  return next[Math.min(Math.max(0, at), next.length - 1)].id;
}

/** 넘긴 자리(가로 굴린 거리) → 카드 번호(0 ~ n−1) */
export const railIndex = (x: number, step: number, n: number) => (step > 0 && n > 0 ? Math.min(n - 1, Math.max(0, Math.round(x / step))) : 0);

/** 보일 점의 처음 번호 — 지금 자리를 가운데 두되 양끝에서는 붙인다(점은 max 개까지) */
export const dotStart = (index: number, n: number, max: number) => Math.min(Math.max(0, index - Math.floor(max / 2)), Math.max(0, n - max));
