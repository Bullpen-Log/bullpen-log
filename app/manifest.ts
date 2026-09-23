import type { MetadataRoute } from 'next';

/**
 * 홈 화면에 앱으로 추가할 때 폰이 읽는 설명서 (웹 앱 매니페스트).
 *
 * 이게 없으면 '홈 화면에 추가'를 해도 사파리·크롬 즐겨찾기처럼 뜬다 — 주소창이
 * 그대로 있고, 아이콘은 화면을 찍은 그림이다. 있으면 주소창 없이 앱처럼 열리고
 * 안드로이드 크롬은 '앱 설치'를 띄운다.
 *
 * 서비스 워커(오프라인 캐시)는 두지 않는다. 설치에는 필요 없고(Next.js 안내서:
 * node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md), 잘못
 * 두면 옛 화면이 폰에 붙어 배포한 것이 안 보인다. 운동 중 신호가 끊기는 문제는
 * 세트를 폰에 맡겨 두는 쪽(lib/workout/outbox.ts)이 따로 맡는다.
 *
 * 아이콘은 지금 로고로 만든 임시판이다 (scripts/make-icons.mjs).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /*
     * 앱을 구별하는 이름표. 안 적으면 start_url 로 정해지는데, 나중에 첫 화면을
     * 바꾸면 폰이 다른 앱으로 알아 두 번 깔린다. 그래서 따로 못박는다.
     */
    id: '/',
    name: 'Bullpen Log',
    /* 홈 화면 아이콘 밑 글자. 길면 잘리는데 11자라 들어간다. */
    short_name: 'Bullpen Log',
    description: '투수를 위한 트레이닝 · 투구 기록',
    lang: 'ko',
    /*
     * 앱으로 열면 곧장 홈(/today)이다. '/'는 처음 온 사람을 위한 소개 화면이라,
     * 앱을 열 때마다 소개부터 보게 된다. 로그인 전이면 /today 가 알아서 로그인
     * 화면으로 보낸다.
     */
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    /* 앱이 뜨기 전 잠깐 보이는 바탕 — 밝은 화면의 바탕색(app/globals.css) */
    background_color: '#f4f7fb',
    theme_color: '#f4f7fb',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      /* 안드로이드가 원·둥근 네모로 잘라 쓰는 판 — 공이 가운데 62% 안에 있다 */
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
