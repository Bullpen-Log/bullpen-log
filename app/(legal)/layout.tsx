import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BaseballMark } from '@/components/logo';

/**
 * 약관과 개인정보 처리방침이 함께 쓰는 껍데기.
 *
 * 앱 안(app 그룹)에 두지 않는다. 가입하기 전에 읽어야 하는 글이라 로그인이
 * 필요하면 안 되고, 옆에 메뉴가 붙어 있으면 앱 화면처럼 보인다.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BaseballMark className="h-7 w-7" />
            <span className="text-display text-lg leading-none text-ink">
              BULLPEN LOG
            </span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            돌아가기
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 pb-24 sm:px-6 sm:py-14">
        {children}
      </main>
    </div>
  );
}
