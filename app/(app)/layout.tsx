import { SiteHeader } from '@/components/site-header';
import { requireUser } from '@/lib/dal';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 이 레이아웃 아래의 모든 페이지는 로그인이 필요하다.
  await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      {/* 모바일 하단 내비게이션에 가리지 않도록 여백을 준다. */}
      <footer className="border-t border-line pb-16 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <span className="text-xs text-muted">
            ⚾ Bullpen Log — 투수를 위한 트레이닝 &amp; 기록 플랫폼
          </span>
        </div>
      </footer>
    </div>
  );
}
