'use client';

import { useEffect, useState } from 'react';

/**
 * 차트 색을 CSS 토큰에서 읽어온다.
 *
 * Chart.js는 캔버스에 직접 그리기 때문에 CSS 클래스가 닿지 않는다.
 * 색을 코드에 박아두면 다크 모드에서 격자와 눈금이 보이지 않으므로,
 * 화면과 같은 토큰을 읽어 쓰고 테마가 바뀌면 다시 읽는다.
 */

export type ChartTheme = {
  /** 눈금·범례 글자 */
  tick: string;
  /** 격자선 */
  grid: string;
  /** 축선 */
  border: string;
  /** 포인트 색 */
  accent: string;
  accentStrong: string;
  /** 툴팁 */
  tooltipBg: string;
  tooltipTitle: string;
  tooltipBody: string;
  /** 카드 바탕 — 점 테두리처럼 배경색과 같아야 하는 곳에 쓴다 */
  surface: string;
};

const FALLBACK: ChartTheme = {
  tick: '#6e6e73',
  grid: 'rgba(199, 199, 204, 0.5)',
  border: 'rgba(199, 199, 204, 0.9)',
  accent: '#0a84d6',
  accentStrong: '#0369a1',
  tooltipBg: '#1d1d1f',
  tooltipTitle: '#ffffff',
  tooltipBody: '#c7c7cc',
  surface: '#ffffff',
};

function token(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function readChartTheme(): ChartTheme {
  if (typeof window === 'undefined') return FALLBACK;

  const styles = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.theme === 'dark';

  const muted = token(styles, '--color-muted', FALLBACK.tick);
  const line = token(styles, '--color-line', '#e5e5ea');
  const lineStrong = token(styles, '--color-line-strong', '#c7c7cc');
  const surface = token(styles, '--color-surface', '#ffffff');

  return {
    tick: muted,
    grid: line,
    border: lineStrong,
    accent: token(styles, '--color-sky', FALLBACK.accent),
    // sky-strong 은 이미 모드별로 뒤집어 정의해 두었다.
    // 라이트에서는 진한 파랑, 다크에서는 옅은 하늘색이 나온다.
    accentStrong: token(styles, '--color-sky-strong', FALLBACK.accentStrong),
    tooltipBg: dark ? token(styles, '--color-surface-2', '#2c2c2e') : '#1d1d1f',
    tooltipTitle: dark ? token(styles, '--color-ink', '#f5f5f7') : '#ffffff',
    tooltipBody: muted,
    surface,
  };
}

export function useChartTheme(): ChartTheme {
  // 서버에서는 CSS를 읽을 수 없으므로 라이트 값으로 그린 뒤 붙고 나서 맞춘다.
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    const sync = () => setTheme(readChartTheme());
    sync();

    // 테마 전환은 <html data-theme> 이 바뀌는 것으로 알 수 있다.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
