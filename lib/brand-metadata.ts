import type { Metadata } from 'next';

/**
 * 브라우저 탭 · 아이폰 홈 화면에 보이는 이름과 아이콘 — 구역마다 다르다(2026-10-22 금윤호: "싱커에 들어갔으면 싱커 로고에 싱커,
 * 덕아웃에 들어갔으면 덕아웃 로고에 덕아웃"). 뿌리 레이아웃(app/layout.tsx)이 덕아웃을 깔고, 선수 화면 틀(app/(app)) · 운동 화면
 * (app/(session))이 싱커로 덮는다. 그림은 scripts/make-icons.mjs 가 만든다(public/icons/*-tab.png · *-apple.png).
 * 파일 규칙(app/favicon.ico · app/apple-icon.png)은 쓰지 않는다 — 사이트에 하나뿐이고 metadata 보다 이겨서 둘로 못 가른다.
 */
export const DUGOUT_METADATA: Pick<Metadata, 'icons' | 'appleWebApp'> = {
  icons: {
    icon: [{ url: '/icons/dugout-tab.png', type: 'image/png', sizes: '64x64' }],
    apple: [{ url: '/icons/dugout-apple.png', sizes: '180x180' }],
  },
  appleWebApp: { title: '덕아웃', statusBarStyle: 'default' },
};

export const SINKER_METADATA: Metadata = {
  title: { default: '싱커', template: '%s · 싱커' },
  icons: {
    icon: [{ url: '/icons/sinker-tab.png', type: 'image/png', sizes: '64x64' }],
    apple: [{ url: '/icons/sinker-apple.png', sizes: '180x180' }],
  },
  appleWebApp: { title: '싱커', statusBarStyle: 'default' },
};
