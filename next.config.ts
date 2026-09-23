import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * 화면 전환 애니메이션(app/globals.css 의 ::view-transition-* 규칙).
   *
   * 리액트의 <ViewTransition> 을 라우트 이동에 물려주는 스위치다. 이 줄이
   * 없으면 컴포넌트는 그려지지만 이동할 때 아무 일도 일어나지 않는다.
   *
   * experimental 이지만 리액트 쪽 기능이고, 브라우저가 못 받아주면 애니메이션만
   * 건너뛰고 화면은 그대로 바뀐다 — 못 켜는 기기에서 화면이 깨지지 않는다.
   */
  experimental: {
    viewTransition: true,
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
      { source: '/report', destination: '/coach', permanent: false },
      /*
       * /training 은 예전에 /library/training(운동 영상)으로 보내던 자리였다.
       * 지금은 트레이닝 화면이 실제로 거기 있으므로 그 줄을 지웠다. 남겨 두면
       * 새 화면이 열리지 않고 영상 목록으로 튕긴다 — 실제로 그렇게 됐었다.
       */
      { source: '/mechanics', destination: '/library/mechanics', permanent: false },
    ];
  },
};

export default nextConfig;
