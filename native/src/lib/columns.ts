/**
 * 두 칸으로 나눌지 — 순수(시험: scripts/native-columns-selftest.mts). lib/layout.tsx 의 TwoColumns · useColumns 가 쓴다.
 *
 * 2026-10-26 아이패드 점검: 예전엔 창 폭(useWindowDimensions)으로 정해, 창보다 좁은 시트(아이패드의 그날 창은 가운데 뜬 창이라 창 폭의 절반쯤)
 * 안에서도 두 칸이 억지로 들어갔다. 이제 그 칸이 실제로 받은 폭(contentWidth)으로 정한다:
 * - contentWidth ≥ min — 기존 기준(창 900pt · 옆 여백 16 → 본문 868pt)과 같은 자리. 화면마다 근거가 있으면 바꾼다.
 * - 좁은 쪽 칸이 minColumn × 글자 배율 이상 — 큰 글씨(접근성)면 칸이 그만큼 넓어야 글이 안 잘린다. 모자라면 한 칸.
 * 기기 이름 · 아이패드 여부로는 가르지 않는다(분할 화면 · 창 크기 바꾸기 · 큰 아이폰 가로).
 */
export const TWO_COLUMN_CONTENT_MIN = 900 - 32;
/** 좁은 쪽 칸이 적어도 이만큼(글자 배율 1) — 카드 하나가 휴대폰 화면처럼 읽히는 폭 */
export const MIN_COLUMN = 320;

export type ColumnRule = { min?: number; minColumn?: number; ratio?: readonly [number, number]; gap?: number };

export function columnsFor(contentWidth: number, fontScale: number, { min = TWO_COLUMN_CONTENT_MIN, minColumn = MIN_COLUMN, ratio = [3, 2], gap = 20 }: ColumnRule = {}): 1 | 2 {
  if (!(contentWidth >= min)) return 1;
  const narrow = ((contentWidth - gap) * Math.min(ratio[0], ratio[1])) / (ratio[0] + ratio[1]);
  return narrow >= minColumn * Math.max(1, fontScale) ? 2 : 1;
}

/** 두 칸일 때 칸마다 폭 — 3D · 영상처럼 폭을 알아야 높이를 정하는 것 */
export function columnWidths(contentWidth: number, two: boolean, { ratio = [3, 2], gap = 20 }: ColumnRule = {}): [number, number] {
  if (!two) return [contentWidth, contentWidth];
  const inner = Math.max(0, contentWidth - gap);
  const sum = ratio[0] + ratio[1];
  return [(inner * ratio[0]) / sum, (inner * ratio[1]) / sum];
}
