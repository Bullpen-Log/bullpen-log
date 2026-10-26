/**
 * 두 칸 판단(native/src/lib/columns.ts — lib/layout.tsx TwoColumns · useColumns 가 쓴다) 시험. 실행: npm run native-columns:test
 * 폭은 그 칸이 실제로 받은 폭(본문 상자 · 옆 여백 뺀 것)이다. 실제 아이패드 화면 · 회전은 이 시험이 보지 못한다.
 */
import assert from 'node:assert/strict';
import { columnsFor, columnWidths, MIN_COLUMN, TWO_COLUMN_CONTENT_MIN } from '~/lib/columns';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
/* 창 폭 → 본문 상자 폭(옆 여백 16 · 최대 1120) — 화면이 하는 셈 */
const body = (w: number, max = 1120) => Math.min(w, max) - 32;

/* 1. 기존 기준과 같은 자리 — 창 900pt 부터 두 칸(예전 useTwoColumns 와 같음) */
eq(columnsFor(body(899), 1), 1, '창 899 — 한 칸');
eq(columnsFor(body(900), 1), 2, '창 900 — 두 칸');
eq(TWO_COLUMN_CONTENT_MIN, 868, '본문 868 = 창 900 - 옆 여백 32');

/* 2. 기기 · 창 크기 */
eq(columnsFor(body(390), 1), 1, '아이폰 세로');
eq(columnsFor(body(932), 1), 2, '큰 아이폰 가로(932) — 두 칸');
eq(columnsFor(body(834), 1), 1, '아이패드 11 세로(834) — 한 칸');
eq(columnsFor(body(1194), 1), 2, '아이패드 11 가로');
eq(columnsFor(body(1366), 1), 2, '아이패드 13 가로(본문 1120 에서 멈춤)');
eq(columnsFor(body(694), 1), 1, '분할 화면 절반(694)');
eq(columnsFor(body(507), 1), 1, '분할 화면 1/3');

/* 3. 창보다 좁은 시트 · 칸 — 창이 넓어도 받은 폭으로(예전엔 창 폭이라 시트 안에서도 두 칸) */
eq(columnsFor(704 - 32, 1), 1, '아이패드 가운데 시트(704) 안 — 한 칸');

/* 4. 큰 글씨 — 좁은 쪽 칸이 글자 배율만큼 넓어야(3 : 2 기본) */
const ipadLand = body(1194);
eq(columnsFor(ipadLand, 1.0), 2, '보통 글씨');
eq(columnsFor(ipadLand, 1.3), 2, '조금 큰 글씨 — 좁은 칸 ' + Math.round(((ipadLand - 20) * 2) / 5) + 'pt');
eq(columnsFor(ipadLand, 1.6), 1, '아주 큰 글씨 — 한 칸');
eq(columnsFor(ipadLand, 1.6, { ratio: [1, 1] }), 2, '반반이면 좁은 칸이 넓어 두 칸');
eq(columnsFor(ipadLand, 0.8), 2, '작은 글씨는 1 로 본다');

/* 5. 화면마다 기준을 바꿀 수 있다 */
eq(columnsFor(840, 1, { min: 700 }), 2, '기준을 낮춘 화면(좁은 칸 328)');
eq(columnsFor(800, 1, { min: 700 }), 1, '기준을 낮춰도 좁은 칸이 312 면 한 칸');
eq(columnsFor(1000, 1, { minColumn: 480, ratio: [1, 1] }), 2, '칸 최소 480 반반 — 490');
eq(columnsFor(1000, 1, { minColumn: 520, ratio: [1, 1] }), 1, '칸 최소 520 — 모자람');
eq(columnsFor(Number.NaN, 1), 1, '못 잼 — 한 칸');

/* 6. 칸 폭 */
eq(columnWidths(1000, true), [588, 392], '3 : 2 · 사이 20');
eq(columnWidths(600, false), [600, 600], '한 칸이면 둘 다 전체');
eq(MIN_COLUMN, 320, '좁은 칸 최소 320');

console.log(`두 칸 판단 ${n}개 통과`);
