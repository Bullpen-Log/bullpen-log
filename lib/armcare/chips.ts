/**
 * 근육 칩 줄에서 보일 칩 — components/muscle-chips.tsx 의 max.
 *
 * 진하게 칠할 근육(highlight)부터 max 개까지 채우고, 남은 자리를 원래 차례(크게 쓰는
 * 차례)로 채운 뒤 원래 차례대로 돌려놓는다. 부위 카드의 운동은 그 부위 근육 때문에 거기
 * 있는데, 앞에서 둘만 자르면 정작 그 근육이 '+1' 뒤로 숨었다(2026-09-26 검토 — 어깨 후방의
 * T 레이즈에서 후면 삼각근). 자체 시험(scripts/training-selftest.mts)이 부위 카드마다 본다.
 */
export function visibleChips(
  muscles: readonly string[],
  highlight: readonly string[] | undefined,
  max: number | undefined
): string[] {
  if (max == null || muscles.length <= max) return [...muscles];
  const keep = new Set<string>();
  for (const m of muscles) if (keep.size < max && highlight?.includes(m)) keep.add(m);
  for (const m of muscles) if (keep.size < max) keep.add(m);
  return muscles.filter((m) => keep.has(m));
}
