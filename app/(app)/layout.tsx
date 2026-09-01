import { requireUser } from '@/lib/dal';
import { MOBILE_TABS, visibleGroups } from '@/lib/nav';
import { MobileTabs, MobileTopBar, Sidebar } from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 이 레이아웃 아래의 모든 페이지는 로그인이 필요하다.
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="min-h-screen">
      <Sidebar
        groups={visibleGroups(isAdmin)}
        nickname={user.nickname}
        isAdmin={isAdmin}
      />
      <MobileTopBar nickname={user.nickname} />

      {/* 사이드바(PC) 폭과 하단 탭바(모바일) 높이만큼 비워둔다. */}
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-12">
          {children}
        </main>
      </div>

      <MobileTabs tabs={MOBILE_TABS} />
    </div>
  );
}
