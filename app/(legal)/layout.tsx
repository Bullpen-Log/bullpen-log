import Link from 'next/link';
import { Wordmark } from '@/components/logo';
import { SiteFooter } from '@/components/site-footer';
import { getSession } from '@/lib/session';
import { LegalBackLink } from './back-link';

/**
 * 약관과 개인정보 처리방침이 함께 쓰는 껍데기.
 *
 * 앱 안(app 그룹)에 두지 않는다. 가입하기 전에 읽어야 하는 글이라 로그인이
 * 필요하면 안 되고, 옆에 메뉴가 붙어 있으면 앱 화면처럼 보인다.
 */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  /*
   * '돌아가기'가 앞 기록이 없을 때 갈 곳 — 로그인했으면 홈, 아니면 로그인(back-link.tsx, 2026-10-03).
   * 쿠키의 로그인 표만 풀어 본다(DB 는 안 읽는다). 표가 남았는데 계정이 없으면 홈이 로그인으로 다시 보낸다.
   */
  const fallback = (await getSession()) ? '/today' : '/login';
  return (
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col bg-page">
      {/* 왼쪽 위 로고 · 오른쪽 위 '돌아가기'는 PC 의 작아진 크기 기준에서 뺀다(ui-chrome, globals.css) */}
      <header className="ui-chrome border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-2.5 sm:px-6 desk:py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Wordmark className="text-2xl text-ink" />
          </Link>
          <LegalBackLink fallback={fallback} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 pb-16 sm:px-6 sm:py-14">
        {children}
      </main>

      <SiteFooter width="max-w-3xl" />
    </div>
  );
}
