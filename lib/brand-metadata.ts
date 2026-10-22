import type { Metadata } from 'next';

/**
 * 브라우저 탭 · 아이폰 홈 화면에 보이는 이름과 아이콘 — 구역마다 다르다(2026-10-22 금윤호: "싱커에 들어갔으면 싱커 로고에 싱커,
 * 덕아웃에 들어갔으면 덕아웃 로고에 덕아웃"). 뿌리 레이아웃(app/layout.tsx)이 덕아웃을 깔고, 선수 화면 틀(app/(app)) · 운동 화면
 * (app/(session))이 싱커로 덮는다. 그림은 scripts/make-icons.mjs 가 만든다(public/icons/*-tab.png · *-apple.png).
 * 파일 규칙(app/favicon.ico · app/apple-icon.png)은 쓰지 않는다 — 사이트에 하나뿐이고 metadata 보다 이겨서 둘로 못 가른다.
 */
/**
 * 사파리는 탭 아이콘을 주소째 오래 붙들어 옛 B 가 남았다(?v= 를 달아도, 2026-10-22) — 그래서 그림 판을 파일 이름에 넣는다(-s1).
 * 그림을 바꾸면 scripts/make-icons.mjs 와 여기의 판을 같이 올린다. SVG 를 먼저, 낡은 브라우저용 PNG 32 · 64 를 뒤에.
 */
const icons = (name: 'sinker' | 'dugout'): Metadata['icons'] => ({
  icon: [
    { url: `/brand/${name}-s1.svg`, type: 'image/svg+xml', sizes: 'any' },
    { url: `/brand/${name}-s1-32.png`, type: 'image/png', sizes: '32x32' },
    { url: `/brand/${name}-s1-64.png`, type: 'image/png', sizes: '64x64' },
  ],
  apple: [{ url: `/brand/${name}-s1-apple.png`, sizes: '180x180' }],
});

export const DUGOUT_METADATA: Pick<Metadata, 'icons' | 'appleWebApp'> = {
  icons: icons('dugout'),
  appleWebApp: { title: '덕아웃', statusBarStyle: 'default' },
};

export const SINKER_METADATA: Metadata = {
  title: { default: '싱커', template: '%s · 싱커' },
  icons: icons('sinker'),
  appleWebApp: { title: '싱커', statusBarStyle: 'default' },
};
