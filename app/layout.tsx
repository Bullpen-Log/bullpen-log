import type { Metadata, Viewport } from 'next';
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
  /*
   * 아이폰 홈 화면에 앱으로 추가했을 때의 이름과 상태바 (app/manifest.ts 와 함께).
   *
   * 상태바는 기본형(불투명)이다. 투명형(black-translucent)은 화면을 상태바
   * 밑까지 끌어올리는데, 앱 틀(components/app-shell.tsx)은 위쪽 노치 여백을
   * 따로 비우지 않아 제목이 시계·배터리 밑으로 들어간다. 운동 화면은 여백을
   * 스스로 비우지만(app/(session)), 앱 전체는 아니다.
   */
  appleWebApp: { title: 'Bullpen Log', statusBarStyle: 'default' },
};

/*
 * 주소창·상태바 색을 화면 바탕색에 맞춘다 (app/globals.css 의 --color-page).
 * 앱으로 열었을 때 위쪽 띠가 파랗거나 하얗게 따로 놀지 않게 한다.
 *
 * 폰의 밝기 설정을 따른다. 앱 안에서 테마를 따로 바꿨으면 띠만 폰 설정대로
 * 남는다 — 이 태그는 폰 설정밖에 읽지 못한다.
 *
 * 운동 화면은 자기 viewport(노치까지 쓰기 등)를 따로 내는데, Next.js 가 칸별로
 * 합치므로 이 색은 거기서도 그대로 산다.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
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
