import type { Metadata } from "next";
import { Noto_Sans_KR, Bebas_Neue } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Bullpen Log — 투수를 위한 트레이닝 & 기록 플랫폼",
  description:
    "투수 전용 운동 가이드, 투구 메커니즘 분석, 날짜별 투구 기록 관리와 스포츠 과학 자료실을 한 곳에서.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${bebas.variable} h-full`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
