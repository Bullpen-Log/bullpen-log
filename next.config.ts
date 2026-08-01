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
      { source: "/report", destination: "/coach", permanent: false },
      { source: "/training", destination: "/library/training", permanent: false },
      { source: "/mechanics", destination: "/library/mechanics", permanent: false },
    ];
  },
};

export default nextConfig;
