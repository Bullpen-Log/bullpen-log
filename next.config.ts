import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * 화면 전환 애니메이션(app/globals.css 의 ::view-transition-* 규칙)은 켜는
   * 스위치가 따로 없다.
   *
   * 16.2 까지는 experimental.viewTransition 으로 리액트의 <ViewTransition> 을
   * 라우트 이동에 물려주었는데, 16.3 부터 App Router 가 설정 없이 기본으로 해 준다.
   * 그 키를 남겨 두면 모르는 설정이라며 빌드(타입 검사)가 멈춘다.
   * (node_modules/next/dist/docs/01-app/02-guides/view-transitions.md)
   *
   * 브라우저가 못 받아주면 애니메이션만 건너뛰고 화면은 그대로 바뀐다.
   */
  /*
   * 탭을 오갈 때 30초 안이면 서버에 다시 묻지 않고 받아 둔 화면을 보인다(2026-10-04 '앱 틀을 네이티브처럼').
   *
   * 기본값(0초)이면 하단 탭을 누를 때마다 서버를 다녀와 회색 뼈대가 번쩍이고 맨 위로 돌아갔다 — 앱의 탭은 곧바로
   * 바뀐다. 30초면 '방금 본 탭으로 돌아가기'만 빨라지고 오래된 화면이 남지 않는다. 저장 · 체크는 서버 동작이
   * revalidatePath 로 받아 둔 화면을 비우고, 자료만 새로 받는 곳은 quietRefresh(router.refresh)라 이 값과 상관없다.
   * (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md)
   */
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  images: {
    remotePatterns: [
      // 유튜브 영상 썸네일
      { protocol: 'https', hostname: 'i.ytimg.com' },
    ],
  },
  // 메뉴를 개편하기 전 주소로 들어와도 새 위치로 보내준다.
  // (북마크나 예전에 공유한 링크가 끊기지 않도록)
  async redirects() {
    return [
      // 영상분석은 투구 일지 안으로 들어갔고, 그 투구 일지는 홈으로 들어갔다.
      { source: '/analysis', destination: '/today', permanent: false },
      /*
       * 투구 일지 화면은 홈 맨 앞의 달력이 되었다. 주소는 북마크와 예전에
       * 공유한 링크에 남아 있으므로 홈으로 보낸다.
       *
       * 날짜가 붙은 주소(/pitch-log/2026-09-24)는 그대로 살아 있다. 이 규칙은
       * 정확히 '/pitch-log' 만 걸러내므로 그쪽은 건드리지 않는다.
       */
      { source: '/pitch-log', destination: '/today', permanent: false },
      /*
       * 설정과 내 정보는 화면이 아니라 창이 되었다(components/app-shell.tsx).
       * 주소는 북마크와 예전 링크에 남아 있으므로 홈으로 보낸다 — 거기서
       * 오른쪽 위 톱니와 내 사진으로 연다.
       */
      { source: '/settings', destination: '/today', permanent: false },
      { source: '/profile', destination: '/today', permanent: false },
      { source: '/report', destination: '/coach', permanent: false },
      /*
       * /training 은 예전에 /library/training(운동 영상)으로 보내던 자리였다.
       * 지금은 트레이닝 화면이 실제로 거기 있으므로 그 줄을 지웠다. 남겨 두면
       * 새 화면이 열리지 않고 영상 목록으로 튕긴다 — 실제로 그렇게 됐었다.
       */
      { source: '/mechanics', destination: '/library/mechanics', permanent: false },
      /*
       * '더보기' 화면은 지웠다(2026-10-03 사용자) — 하단 '더보기'는 사이드바를 열어 이 화면으로 오는 길이 없었다.
       * 저장해 둔 주소는 홈으로.
       */
      { source: '/more', destination: '/today', permanent: false },
    ];
  },
};

export default nextConfig;
