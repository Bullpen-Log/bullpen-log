import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // 유튜브 영상 썸네일
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
