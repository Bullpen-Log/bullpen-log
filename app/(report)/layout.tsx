import { Wordmark } from '@/components/logo';

/**
 * 보호자 리포트의 틀 — 로그인 없이 보는 공개 주소(토큰 + 네 자리 코드, app/(report)/report/[token]). 선수 껍데기 · 마스터 껍데기 어느 쪽도
 * 안 쓴다. 여기에는 requireUser 가 없다 — 일부러다. 지키는 것은 페이지의 토큰 · 코드 · 쿠키 확인이다.
 */
export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-safe-area className="min-h-[var(--vvh,100dvh)] bg-page text-ink">
      <header className="flex min-h-14 items-center gap-2 border-b border-line bg-surface px-4">
        <Wordmark className="text-lg text-ink" />
        <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-semibold text-muted">보호자 리포트</span>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
