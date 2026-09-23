import { ViewTransition } from 'react';
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
          {/*
           * 탭을 옮길 때 본문만 부드럽게 바뀐다.
           *
           * 방향을 주는 슬라이드(왼쪽으로 밀기 등)는 일부러 쓰지 않았다. 하단
           * 탭은 여섯 칸이 나란해서 어디로 가든 '옆으로 간다'는 느낌이라
           * 앞/뒤를 나눌 기준이 없고, 기준을 억지로 만들면 탭 순서를 바꿀 때마다
           * 애니메이션 방향이 같이 틀어진다. 같은 자리에서 내용만 갈리는
           * 크로스페이드가 이 화면 구조에 맞는다.
           *
           * 셸(사이드바·상단바·탭바)은 components/app-shell.tsx 에서 각자
           * 이름표를 달아 이 전환에서 빠진다. 그래야 내용만 바뀌고 틀은 가만히
           * 있는 것으로 읽힌다.
           *
           * default="none" 을 주면 안 된다. 관계없는 전환에서 빠지라는 뜻인데,
           * 탭 이동에는 따로 붙인 표시(transitionTypes)가 없어서 이 이동까지
           * '관계없는 것'으로 걸러진다. 실제로 그렇게 두었더니 리액트가
           * startViewTransition 을 아예 부르지 않아 아무 일도 일어나지 않았다.
           * 세어 보니 default 를 뺀 쪽만 한 번 불렸다.
           */}
          <ViewTransition name="app-main" share="page" enter="page" exit="page">
            {children}
          </ViewTransition>
        </main>
      </div>

      <MobileTabs tabs={MOBILE_TABS} />
    </div>
  );
}
