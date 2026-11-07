import type { Metadata } from 'next';

/**
 * 외부 영상 접수의 틀 — 초대 링크로 들어오는 사람의 화면이다. 싱커 · 덕아웃 틀을 안 쓴다(메뉴 · 탭 · 계정 없음). 로그인 확인도 없다 — 일부러다.
 * 지키는 것은 주소 조각의 초대 토큰이고, 서버는 API 마다 그것을 다시 본다.
 *
 * 링크 미리보기 · 검색: 토큰은 조각이라 서버가 모른다. 그래서 이 틀에는 사람을 알 수 있는 글이 들어갈 수 없고, 고정된 글만 보인다.
 */
export const metadata: Metadata = {
  title: { absolute: '영상 보내기' },
  description: '받은 링크로 투구 영상을 보내는 화면이에요.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
  openGraph: { title: '영상 보내기', description: '받은 링크로 투구 영상을 보내는 화면이에요.', type: 'website', locale: 'ko_KR' },
  twitter: { card: 'summary', title: '영상 보내기', description: '받은 링크로 투구 영상을 보내는 화면이에요.' },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-safe-area className="min-h-[var(--vvh,100dvh)] bg-page text-ink">
      {children}
    </div>
  );
}
