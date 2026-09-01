import type { Metadata } from 'next';
import { Bebas_Neue } from 'next/font/google';
import Script from 'next/script';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * 숫자 전용 서체.
 *
 * 구속·투구수·부하 지수처럼 크게 보여주는 숫자에만 쓴다. 한글을 지원하지
 * 않으므로 제목에는 쓸 수 없다 — 예전에는 display 로 지정해 두고 정작 한글
 * 제목은 본문과 같은 서체로 나왔다.
 */
const bebas = Bebas_Neue({
  variable: '--font-bebas',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Bullpen Log — 투수를 위한 트레이닝 & 기록 플랫폼',
  description:
    '투수 전용 운동 가이드, 투구 메커니즘 분석, 날짜별 투구 기록 관리와 스포츠 과학 자료실을 한 곳에서.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme 은 아래 스크립트가 브라우저에서 붙인다. 서버가 그린 것과
    // 달라지는 게 정상이므로 그 경고만 끈다.
    <html lang="ko" className={`${bebas.variable} h-full`} suppressHydrationWarning>
      <head>
        {/*
         * Pretendard — 본문과 제목을 함께 맡는다.
         *
         * 한글 글꼴은 통째로 받으면 2MB가 넘는다. 글자 조각을 92개로 나눠 두고
         * 브라우저가 화면에 실제로 쓰이는 조각만 받아가는 방식(unicode-range)을
         * 쓴다. 한 조각이 34KB라, 보통 한 화면에 몇 개만 내려온다.
         *
         * next/font 로는 이 방식을 다룰 수 없어(파일이 여럿이고 범위가 나뉜다)
         * 평범한 스타일시트로 넣는다. font-display: swap 이라 글꼴을 기다리며
         * 화면이 비는 일은 없다.
         */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
      </head>
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
