import { PALETTES_HIGH_CONTRAST } from '~/lib/design-tokens';
import { usePalette, type Palette } from '~/lib/ui';
import { compareBlackPalette } from '~/compare/immersive/palette';

/**
 * 비교 화면 팔레트(IM01, 2026-11-03) — 앱 테마(라이트 · 다크 · 네이비)와 상관없이 이 화면의 무대 · 도구 · 창 · 메모 편집이 같은 검은 판.
 * 비교 부품(compare/ui)만 쓴다 — 앱의 다른 화면은 그대로 usePalette. 폰 '대비 높이기'를 켜면 보조 글자 · 선을 더 밝게.
 */
const HIGH = new Set<Palette>(Object.values(PALETTES_HIGH_CONTRAST));
const cache = new WeakMap<Palette, Palette>();

export function useComparePalette(): Palette {
  const base = usePalette();
  let p = cache.get(base);
  if (!p) {
    p = compareBlackPalette(base, { highContrast: HIGH.has(base) });
    cache.set(base, p);
  }
  return p;
}
