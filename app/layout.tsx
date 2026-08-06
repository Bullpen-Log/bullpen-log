import type { Metadata } from "next";
import { Noto_Sans_KR, Bebas_Neue } from "next/font/google";
import Script from "next/script";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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
    // data-theme 은 아래 스크립트가 브라우저에서 붙인다. 서버가 그린 것과
    // 달라지는 게 정상이므로 그 경고만 끈다.
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${bebas.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans">
        {/*
         * 첫 페인트 전에 테마를 칠해 밝은 화면이 번쩍이지 않게 한다.
         * 평범한 <script>를 컴포넌트 안에 두면 리액트가 경고를 내므로
         * next/script 로 넣는다. beforeInteractive 는 처음 내려가는 HTML에
         * 그대로 박히고 다른 코드보다 먼저 실행된다.
         */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
