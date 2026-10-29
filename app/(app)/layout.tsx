import type { Metadata } from 'next';
import { SINKER_METADATA } from '@/lib/brand-metadata';
import { appNow, appNowMs } from '@/lib/clock';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel, isNativeUserAgent } from '@/lib/app-env';
import { DugoutTopBar } from '@/components/dugout/dugout-topbar';
import { MorphIn } from '@/components/shell-morph';
import { usesSinker } from '@/lib/brand';
import { countUnread } from '@/lib/market/load';
import { countUnreadNotifications } from '@/lib/notify';
import { isSex, toDateInputValue } from '@/lib/profile';
import { toDateKey } from '@/lib/pitch-stats';
import { createAvatarUrl } from '@/lib/storage';
import {
  APP_TABS,
  APP_TABS_LEVEL,
  MOBILE_TABS,
  SPORT_BARS,
  applyLocks,
  applyLocksToGroups,
  quickTabs,
  visibleGroups,
  withoutDugoutTab,
  withoutDugoutTabGroups,
} from '@/lib/nav';
import { featureLocks } from '@/lib/feature-locks';
import { countryOf, forCountry, forCountryGroups, hasHitting } from '@/lib/country';
import { AppNav } from '@/components/app-shell';
import { CheckinGate } from '@/components/checkin-gate';
import { RefreshOnReturn } from '@/components/refresh-on-return';
import { SendPendingSets } from '@/components/send-pending-sets';
import { LibrarySync } from '@/components/library-sync';
import { prisma } from '@/lib/prisma';
import { contextFrom } from '@/lib/checkin-flow-load';
import { MainTransition } from '@/components/main-transition';
import { SiteFooter } from '@/components/site-footer';
import { AppSplash } from '@/components/app-splash';
import { TabPager } from '@/components/tab-pager';
import { BetaHome } from '@/components/beta/beta-home';
import { applyBetaLocks, betaGroups } from '@/lib/nav';
import { isRestrictedNow, releaseAccessFor } from '@/lib/release-gate';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function todayKey() {
  return toDateKey(appNow());
}

/**
 * 체크인 관문이 볼 최근 체크인의 시작 — 사흘 전.
 *
 * 서버(UTC)가 보는 오늘과 사용자(한국)가 보는 오늘이 하루 어긋날 수 있어 넉넉히
 * 가져온다. 어느 날이 '오늘'인지는 화면이 사용자 시계로 정한다.
 */
function checkinWindowStart() {
  return new Date(appNowMs() - 3 * 86_400_000);
}

/** '며칠 연속 체크인'을 셀 만큼 — 두 달. 날짜만 읽는다(체크인 관문의 완료 화면) */
function streakWindowStart() {
  return new Date(appNowMs() - 62 * 86_400_000);
}

/** 탭 이름 · 아이콘은 싱커(lib/brand-metadata.ts — 뿌리는 덕아웃) */
export const metadata: Metadata = SINKER_METADATA;

export default async function AppLayout({
  children,
  modal,
  home,
  videos,
  hitting,
}: {
  children: React.ReactNode;
  /** 팝업 자리 — 앱 안에서 날짜 화면으로 가면 여기에 투구 기록 팝업이 뜬다(@modal) */
  modal: React.ReactNode;
  /**
   * 탭 판 넷(@home · @videos · @training · @community, 2026-10-15 판 넘기기 · 넷째는 2026-10-20 영양 → 커뮤니티) — 주소가 그 탭이 아니어도 각 자리의 default.tsx 가
   * 그 탭을 그려 늘 넷이 떠 있고, components/tab-pager.tsx 가 옆으로 민다. 탭 주소의 본문(children)은 빈 쪽이다.
   */
  home: React.ReactNode;
  videos: React.ReactNode;
  /** 셋째 판 — 트레이닝 → 타격(2026-10-20). 트레이닝은 이제 종목 하단바 안의 하위 화면이다 */
  hitting: React.ReactNode;
}) {
  // 이 레이아웃 아래의 모든 페이지는 로그인이 필요하다.
  const user = await requireUser();
  /*
   * 출시 전 베타(2026-10-29, lib/release-gate.ts) — 일반 · 준관리자는 투구 3D 만. 잠긴 주소는 사람을 읽을 때(requireUser) 이미 베타 홈으로 보냈다.
   * 여기서는 틀을 줄인다: 탭 판(홈 · 투구 · 타격)을 그리지 않고(그 판이 예전 통계 · 기록을 읽는다), 체크인 관문 · 대기열 보내기도 안 둔다.
   */
  if (isRestrictedNow(user)) return <BetaAppLayout user={user}>{children}</BetaAppLayout>;
  /* 마스터 계정(팀 · 레슨장)은 선수 기능이 없다 — 선수 화면 전체가 /manage 로 간다(2026-10-20 결정 2). 관리자는 둘 다 본다 */
  if (user.accountType === 'MASTER' && user.role !== 'ADMIN') redirect('/manage');
  const isAdmin = user.role === 'ADMIN';
  /* 앱(스마트폰 껍데기) 안인가 — 구속 측정 메뉴는 앱이면 누구나, 웹이면 관리자만(lib/nav.ts) */
  const userAgent = (await headers()).get('user-agent');
  const isNative = isNativeUserAgent(userAgent);
  /* 앱 하단 탭 — 새 앱(판 13+)은 홈 · 투구 · 트레이닝 · 기록 · 덕아웃, 옛 앱은 더보기가 있는 옛 탭(lib/nav.ts APP_TABS) */
  const appTabs = expoLevel(userAgent) >= APP_TABS_LEVEL ? APP_TABS : MOBILE_TABS;
  /* 웹(브라우저)의 싱커 틀 — 덕아웃 탭 대신 홈 왼쪽의 원형 뒤로가기(2026-10-21 금윤호). 앱은 탭 그대로(김민 몫) */
  const back = isNative ? null : { href: '/', label: '덕아웃' };
  /* 나라(lib/country.ts) — 미국 · 일본은 투수 전용이라 타격 탭 · 메뉴가 빠진다 */
  const country = countryOf(user.country);
  const tabsOf = <T extends { href: string }>(items: T[]) =>
    forCountry(isNative ? items : withoutDugoutTab(items), country);
  const groupsOf = <G extends { items: { href: string }[] }>(groups: G[]) =>
    forCountryGroups(isNative ? groups : withoutDugoutTabGroups(groups), country);

  /* PC 브라우저의 선수 화면은 덕아웃 틀 안(2026-10-21 2단계, docs/designs/sinker-dugout.md 5-1) — 위 막대 하나, 앱(싱커 웹뷰)은 안 그린다 */
  const [unread, alerts] = isNative
    ? [0, 0]
    : await Promise.all([countUnread(user.id), countUnreadNotifications(user.id)]);
  /*
   * 어느 탭이 잠겨 있나(lib/feature-locks.ts, 2026-10-09) — 처음 가입한 사람은 투구 기록 · 트레이닝 · 영양이 잠겨 있고,
   * 막대 · 탭에서는 흐리게 + 자물쇠로 보이되 누르면 그 탭의 첫 설정 화면으로 간다(lib/nav.ts applyLocks). 홈의 기능
   * 링크 · 알림(종)도 같은 값을 본다. 설정을 마치면 revalidatePath('/', 'layout') 으로 여기까지 새로 읽힌다.
   */
  const locks = featureLocks(user);
  /*
   * 프로필 사진은 비공개 저장소에 있어 볼 때마다 임시 주소를 만든다.
   *
   * 아바타가 막대와 상단 바에 늘 있으므로 레이아웃에서 한 번만 만들어 내려
   * 보낸다. 주소는 만들어 둔 것을 돌려쓰므로(lib/storage.ts) 화면을 옮길
   * 때마다 저장소에 묻지 않는다.
   */
  /*
   * 체크인 관문에 줄 것 — 최근 체크인과, 상세 체크인에서 고를 운동 부위.
   * 운동 목록은 누가 보든 같아서 캐시에서 꺼낸다(lib/library-cache.ts).
   */
  /*
   * 오른쪽 위 알림(종)에 줄 것 — 최근 며칠 동안 투구를 남긴 날. 날짜만 읽는다.
   * 같은 날 여러 번 남겼어도 한 줄이면 된다(distinct). 체크인은 위 목록을 같이 쓴다.
   */
  const [avatarUrl, recentCheckins, recentPitchDays, streakCheckins] =
    await Promise.all([
      createAvatarUrl(user.avatarPath),
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: checkinWindowStart() } },
        orderBy: { date: 'desc' },
      }),
      prisma.pitchLog.findMany({
        where: { userId: user.id, date: { gte: checkinWindowStart() } },
        select: { date: true },
        distinct: ['date'],
      }),
      /* 체크인을 마치면 'N일 연속'을 보여 준다(체크인 관문) — 날짜만 */
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: streakWindowStart() } },
        /* 컨디션도 — 흐름의 '평소 컨디션'(28일 중앙값)을 같은 줄에서 센다 */
        select: { date: true, condition: true },
      }),
    ]);
  /* 최근 며칠 투구를 남긴 날 — 종의 할 일과 체크인 창의 '어제 등판 · 몇 구' 줄이 같이 쓴다 */
  const pitchDays = recentPitchDays.map((p) => p.date.toISOString().slice(0, 10));
  /* 체크인 흐름(3판)의 둘레 — 관문과 종이 같은 것을 받는다(components/checkin-flow/types.ts) */
  const flow = contextFrom(user.nickname, recentCheckins, streakCheckins);
  const checkinDays = flow.recent.map((c) => c.date);

  return (
    /* 세로로 쌓는 틀 — 본문이 짧은 화면에서도 맨 밑 정보(SiteFooter)가 화면 바닥에 붙는다 */
    /* 패드는 왼쪽 탭 막대(--rail, components/app-shell.tsx 의 MobileTabs)만큼 통째로 비킨다 — 위 막대와 본문이 같이 */
    <div className="flex min-h-dvh flex-col pad:pl-(--rail)">
      {/*
        시작 연출 — 로그인한 채 사이트를 열면(처음 · 다시) 테마 바탕 위 B → 이름(components/app-splash.tsx). 문서를 처음
        그릴 때 한 번. 아이폰 앱 안은 제 시작 연출(MainViewController.swift)이 같은 장면을 하므로 뺀다.
      */}
      {!isNative && <AppSplash />}
      {!isNative && <MorphIn />}
      {!isNative && (
        <DugoutTopBar
          user={{ nickname: user.nickname }}
          unread={unread}
          alerts={alerts}
          sinker={usesSinker(user)}
          manage={isAdmin}
          current="sinker"
          brand="sinker"
          sticky={false}
          className="hidden md:block"
        />
      )}
      <AppNav
        groups={groupsOf(applyLocksToGroups(visibleGroups(user.role, isNative), locks))}
        quick={tabsOf(applyLocks(quickTabs(), locks))}
        tabs={tabsOf(applyLocks(MOBILE_TABS, locks))}
        appTabs={isNative ? tabsOf(applyLocks(appTabs, locks)) : undefined}
        back={back}
        sportBars={{
          pitch: applyLocks(SPORT_BARS.pitch, locks),
          hit: applyLocks(SPORT_BARS.hit, locks),
        }}
        nickname={user.nickname}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        /*
         * 막대 아래 '내 정보' 창에서 고칠 값들.
         *
         * 이 레이아웃은 어차피 사용자를 읽고 있으므로(requireUser) 조회가
         * 늘지 않는다. 창을 열 때 받아 오게 하면 누르고 나서 잠깐 빈 창을 본다.
         */
        profile={{
          email: user.email,
          nickname: user.nickname,
          birthDate: user.birthDate ? toDateInputValue(user.birthDate) : '',
          sex: isSex(user.sex) ? user.sex : null,
          heightCm: user.heightCm,
          weightKg: user.weightKg,
          targetVelocity: user.targetVelocity,
          isAdmin,
        }}
        today={todayKey()}
        /*
         * 알림(종) — 오늘 체크인·투구 기록을 했나. '오늘'은 화면이 사용자 시계로 정하므로
         * 여기서는 최근 며칠의 목록만 준다(자정을 넘겨도 서버를 다시 부르지 않고 맞다).
         * 체크인을 저장하면 레이아웃을 새로 그리고(app/actions/checkin.ts), 투구를 남기면
         * 화면이 router.refresh 로 새로 받는다 — 둘 다 이 목록이 곧바로 새로워진다.
         */
        todo={{
          checkinDays,
          pitchDays,
          flow,
          /* 투구 기록이 잠겨 있으면 종의 '기록하기' 대신 첫 설정으로 가는 단추 하나(components/notice-bell.tsx) */
          pitchLocked: locks.pitch,
        }}
      />

      {/* 앱 기본 사용법 투어(TourGate)는 2026-10-12 에 뺐다 — 사용자: "가입 완료 후 나오는 튜토리얼 삭제" */}
      {/*
        체크인 관문 — 그날 체크인을 안 했으면 어느 화면으로 들어오든 먼저 뜬다.
        화면 맨 위 칸(top layer)에 뜨는 창이라 여기 두어도 모든 것 위에 선다.
      */}
      <CheckinGate checkedDays={checkinDays} flow={flow} />

      {/* 오래 비워 둔 탭으로 돌아오면 새로 받는다 — 다른 기기에서 바꾼 사진·정보가 보이게 */}
      <RefreshOnReturn />

      {/* 신호 없이 남겨 폰에 담긴 운동 세트를 어느 화면에서든 이어서 보낸다 */}
      <SendPendingSets />
      {isNative && <LibrarySync />}

      {/*
        팝업 자리. 본문(children) 밖에 둔다 — 팝업이 떠도 밑의 화면은 그대로 남고, 본문의
        화면 전환(app-main)에도 끼지 않는다. 창은 맨 위 칸(top layer)에 뜨므로 자리는 어디든
        상관없다.

        popup-slot(globals.css) — Next 는 이 레이아웃의 loading.tsx(페이지 뼈대)를 팝업 자리의 로딩으로도
        쓴다. 팝업을 여는 1초 남짓 그 뼈대가 위 막대와 본문 사이에 끼어 화면을 밀어냈다. 뼈대는 숨기고
        화면 위에 가는 로딩 막대만 보인다.
      */}
      <div className="popup-slot contents">{modal}</div>

      {/*
        위쪽만 비운다.

        메뉴가 세로 막대였을 때는 그 폭만큼 좌우를 같이 비워야 본문이 화면
        한가운데에 놓였다. 이제 로고와 메뉴가 둘 다 위쪽 한 줄에 있으므로,
        좌우는 아무것도 차지하지 않는다 — 비우면 오히려 본문이 좁아진다.
        본문은 저 스스로 가운데 정렬(mx-auto)이라 그대로 화면 한가운데다.

        PC 의 위 여백(--page-top, globals.css '크기 기준')은 그 줄의 자리와 그 밑의 빈 곳을
        합친 것이다. 로고와 아이콘은 고정이라 자리를 차지하지 않으므로, 여기서 비워주지 않으면
        첫 줄이 그 밑으로 들어간다. 모든 탭 · 모든 PC 가 같은 값이다 — 예전에는 노트북(desk-low)만
        위 여백을 줄여 본문이 막대에 붙어 있었다.

        본문 폭은 화면이 클수록 넓힌다(1024 → 1152 → 1280px). 예전에는 어느 모니터에서나
        1024px 에 묶여 큰 모니터의 양옆이 비었고, 모든 것이 세로로만 쌓여 스크롤이 길었다.
        넓어진 자리에는 캘린더 옆 그날 칸처럼 나란히 놓는 배치가 들어선다. 더 넓히지는 않는다
        — 글줄이 너무 길어지면 읽기 어렵다.
      */}
      <div className="flex flex-1 flex-col">
        {/* 밑 여백은 본문과 맨 밑 정보 사이의 틈이다. 휴대폰 하단 탭만큼 비우는 일은 SiteFooter 가 한다. */}
        {/* 양옆은 노치 자리와 견줘 큰 쪽 — 가로로 돌린 사파리에서 글이 노치 밑에 들어갔다(2026-10-03). 세로 · PC 는 그 값이 0 이라 예전 여백 그대로 */}
        <main
          data-morph-main
          /* touch-pan-y — 세로는 브라우저가 굴리고, 가로는 탭 쓸기(components/tab-pager.tsx)가 받는다. pinch-zoom 을 같이 둬야
             사파리에서 두 손가락 확대가 된다(pan-y 만이면 막혔다) */
          className="mx-auto w-full max-w-5xl flex-1 touch-pan-y touch-pinch-zoom py-6 pb-10 pl-[max(calc(var(--spacing)*4),env(safe-area-inset-left))] pr-[max(calc(var(--spacing)*4),env(safe-area-inset-right))] sm:pl-[max(calc(var(--spacing)*6),env(safe-area-inset-left))] sm:pr-[max(calc(var(--spacing)*6),env(safe-area-inset-right))] sm:pt-6 xl:max-w-6xl 2xl:max-w-7xl desk:pt-(--page-top) desk:pb-32 pad:max-w-5xl pad:pl-8 pad:pr-[max(2rem,env(safe-area-inset-right))]"
        >
          {/*
           * 탭을 옮길 때 본문만 바뀐다. 틀(사이드바 · 상단바 · 탭바)은 components/app-shell.tsx 에서 각자 이름표를 달아
           * 이 전환에서 빠진다 — 내용만 바뀌고 틀은 가만히 있는 것으로 읽힌다. 언제 · 어떻게 움직이는지는 MainTransition.
           */}
          <TabPager
            tabs={tabsOf(applyLocks(MOBILE_TABS, locks))}
            camera={
              /* 잠긴 사람(투구 첫 설정 전)은 설정 화면 주소라 구속 측정 전환(zoom)을 걸면 안 된다 */
              applyLocksToGroups(visibleGroups(user.role, isNative), locks)
                .flatMap((g) => g.items)
                .find((i) => i.icon === 'radar' && !i.locked) ?? null
            }
            /* 타격이 없는 나라는 판 둘 — 차례(order)도 같이 줄인다 */
            panels={hasHitting(country) ? [home, videos, hitting] : [home, videos]}
            order={hasHitting(country) ? undefined : ['/today', '/videos']}
          >
            <MainTransition>{children}</MainTransition>
          </TabPager>
        </main>

        <SiteFooter tabBar brand="sinker" />
      </div>
    </div>
  );
}

/**
 * 출시 전 베타의 싱커 틀(2026-10-29) — 생김새(위 막대 · 하단 탭 · 메뉴 · 테마)는 그대로, 탭은 잠긴 칸에 자물쇠, 메뉴는 열린 항목 · 기존 권한의 관리 업무만.
 * 홈(/today)은 베타 홈, 그 밖의 열린 주소(투구 3D · 고객센터 · 관리 업무)는 그 화면. 계정 종류(MASTER 포함)는 바꾸지 않고 /manage 로도 보내지 않는다.
 * 예전 홈 판 · 체크인 · 알림 수 · 투구 기록 조회는 하지 않는다.
 */
async function BetaAppLayout({
  user,
  children,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  children: React.ReactNode;
}) {
  const access = releaseAccessFor(user);
  const h = await headers();
  const userAgent = h.get('user-agent');
  const isNative = isNativeUserAgent(userAgent);
  const path = (h.get('x-bp-path') ?? '').split('?')[0];
  const appTabs = expoLevel(userAgent) >= APP_TABS_LEVEL ? APP_TABS : MOBILE_TABS;
  const country = countryOf(user.country);
  const tabsOf = <T extends { href: string }>(items: T[]) => forCountry(isNative ? items : withoutDugoutTab(items), country);
  const groups = forCountryGroups(betaGroups(visibleGroups(user.role, isNative), access), country);
  const avatarUrl = await createAvatarUrl(user.avatarPath);
  const isHome = path === '/today' || path === '' || path === '/dashboard';
  return (
    <div className="flex min-h-dvh flex-col pad:pl-(--rail)">
      {!isNative && <AppSplash />}
      <AppNav
        groups={groups}
        quick={tabsOf(applyBetaLocks(quickTabs(), access))}
        tabs={tabsOf(applyBetaLocks(MOBILE_TABS, access))}
        /* 앱에 보내는 탭은 주소를 그대로 — 앱이 주소로 탭을 가린다. 잠김 까닭('beta')만 단다 */
        appTabs={isNative ? tabsOf(applyBetaLocks(appTabs, access, { keepHref: true })) : undefined}
        back={isNative ? null : { href: '/', label: '덕아웃' }}
        sportBars={{ pitch: applyBetaLocks(SPORT_BARS.pitch, access), hit: applyBetaLocks(SPORT_BARS.hit, access) }}
        nickname={user.nickname}
        avatarUrl={avatarUrl}
        isAdmin={false}
        profile={{
          email: user.email,
          nickname: user.nickname,
          birthDate: user.birthDate ? toDateInputValue(user.birthDate) : '',
          sex: isSex(user.sex) ? user.sex : null,
          heightCm: user.heightCm,
          weightKg: user.weightKg,
          targetVelocity: user.targetVelocity,
          isAdmin: false,
        }}
        today={todayKey()}
        todo={{ checkinDays: [], pitchDays: [], flow: contextFrom(user.nickname, [], []), pitchLocked: true }}
      />
      <div className="flex flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 py-6 pb-10 pl-[max(calc(var(--spacing)*4),env(safe-area-inset-left))] pr-[max(calc(var(--spacing)*4),env(safe-area-inset-right))] sm:pl-[max(calc(var(--spacing)*6),env(safe-area-inset-left))] sm:pr-[max(calc(var(--spacing)*6),env(safe-area-inset-right))] desk:pt-(--page-top) desk:pb-32 pad:pl-8">
          <MainTransition>{isHome ? <BetaHome user={user} /> : children}</MainTransition>
        </main>
        <SiteFooter tabBar brand="sinker" />
      </div>
    </div>
  );
}
