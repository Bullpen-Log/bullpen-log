/**
 * 앱 색(native/src/lib/design-tokens.ts) 글자 대비 시험. 실행: npm run native-palette:test
 * 2026-10-27 HIG 검토: 글자는 바탕 · 카드 · 칩 위 4.5:1(accessibility.md › Vision), '대비 높이기' 팔레트는 보통보다 낮아지지 않게.
 * 채움색 sky · action 은 글자로 쓰지 않으니(글자는 link) 견주지 않는다 — 대신 흰 글자를 얹은 대비만 본다.
 */
import assert from 'node:assert/strict';
import { PALETTES, PALETTES_HIGH_CONTRAST, type Palette } from '~/lib/design-tokens';

const lum = (hex: string) =>
  [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = ['ink', 'muted', 'link', 'danger', 'ok'] as const;
const SURFACES = ['page', 'card', 'chip'] as const;
const pairs = (p: Palette): [string, number][] => [
  ...TEXT.flatMap((t) => SURFACES.map((s) => [`${t}/${s}`, ratio(p[t], p[s])] as [string, number])),
  ['warn/warnBg', ratio(p.warn, p.warnBg)],
  ['skyStrong/skyTint', ratio(p.skyStrong, p.skyTint)],
  ['onAction/action', ratio(p.onAction, p.action)],
];

let n = 0;
for (const theme of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
  const base = new Map(pairs(PALETTES[theme]));
  for (const [k, v] of base) {
    assert.ok(v >= 4.5, `${theme} ${k} ${v.toFixed(2)} < 4.5`);
    n++;
  }
  for (const [k, v] of pairs(PALETTES_HIGH_CONTRAST[theme])) {
    assert.ok(v >= 4.5 && v >= base.get(k)! - 0.01, `${theme} 대비 높이기 ${k} ${v.toFixed(2)} (보통 ${base.get(k)!.toFixed(2)})`);
    n++;
  }
}
console.log(`앱 색 글자 대비 ${n}개 통과`);
