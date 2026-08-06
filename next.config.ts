import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // 유튜브 영상 썸네일
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  // 메뉴를 개편하기 전 주소로 들어와도 새 위치로 보내준다.
  // (북마크나 예전에 공유한 링크가 끊기지 않도록)
  async redirects() {
    return [
      // 영상분석은 투구 일지 안으로 들어갔다.
      { source: "/analysis", destination: "/pitch-log", permanent: false },
      { source: "/report", destination: "/coach", permanent: false },
      { source: "/training", destination: "/library/training", permanent: false },
      { source: "/mechanics", destination: "/library/mechanics", permanent: false },
    ];
  },
};

export default nextConfig;
