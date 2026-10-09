import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { ageFromBirthDate, isSex, toDateInputValue } from '@/lib/profile';
import { toDateKey } from '@/lib/pitch-stats';
import { createAvatarUrl } from '@/lib/storage';
import {
  MOBILE_TABS,
  applyLocks,
  applyLocksToGroups,
  quickTabs,
  visibleGroups,
} from '@/lib/nav';
import { featureLocks, hasSeenTutorial, tourKeyFor } from '@/lib/feature-locks';
import { AppNav } from '@/components/app-shell';
import { CheckinGate } from '@/components/checkin-gate';
import { TourGate } from '@/components/tutorial/tour-gate';
import { RefreshOnReturn } from '@/components/refresh-on-return';
import { SendPendingSets } from '@/components/send-pending-sets';
import type { CheckinData } from '@/components/checkin-form';
import { prisma } from '@/lib/prisma';
import {
  pickArmPain,
  pickCheckinBody,
  pickCheckinDetail,
  pickCheckinParts,
} from '@/lib/checkin';
import { visibleExercises } from '@/lib/library-cache';
import { availableParts } from '@/lib/report/today-pick';
import { MainTransition } from '@/components/main-transition';
import { SiteFooter } from '@/components/site-footer';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { AppSplash } from '@/components/app-splash';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function todayKey() {
  return toDateKey(new Date());
}

/**
 * 체크인 관문이 볼 최근 체크인의 시작 — 사흘 전.
 *
 * 서버(UTC)가 보는 오늘과 사용자(한국)가 보는 오늘이 하루 어긋날 수 있어 넉넉히
 * 가져온다. 어느 날이 '오늘'인지는 화면이 사용자 시계로 정한다.
 */
function checkinWindowStart() {
  return new Date(Date.now() - 3 * 86_400_000);
}

/** '며칠 연속 체크인'을 셀 만큼 — 두 달. 날짜만 읽는다(체크인 관문의 완료 화면) */
function streakWindowStart() {
  return new Date(Date.now() - 62 * 86_400_000);
}

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /** 팝업 자리 — 앱 안에서 날짜 화면으로 가면 여기에 투구 기록 팝업이 뜬다(@modal) */
  modal: React.ReactNode;
}) {
  // 이 레이아웃 아래의 모든 페이지는 로그인이 필요하다.
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';
  /* 앱(스마트폰 껍데기) 안인가 — 구속 측정 메뉴는 앱이면 누구나, 웹이면 관리자만(lib/nav.ts) */
  const isNative = isNativeUserAgent((await headers()).get('user-agent'));
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
  const [avatarUrl, recentCheckins, library, recentPitchDays, streakCheckins] =
    await Promise.all([
      createAvatarUrl(user.avatarPath),
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: checkinWindowStart() } },
        orderBy: { date: 'desc' },
      }),
      visibleExercises(),
      prisma.pitchLog.findMany({
        where: { userId: user.id, date: { gte: checkinWindowStart() } },
        select: { date: true },
        distinct: ['date'],
      }),
      /* 체크인을 마치면 'N일 연속'을 보여 준다(체크인 관문) — 날짜만 */
      prisma.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: streakWindowStart() } },
        select: { date: true },
      }),
    ]);
  const gateCheckins: CheckinData[] = recentCheckins.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ...pickCheckinParts(c),
    condition: c.condition,
    sleep: c.sleep,
    preferredParts: c.preferredParts,
    preferredWorkout: c.preferredWorkout,
    /* 근육통 · 잔 시간 — 간편 쪽 선택 칸. 체크인 창이 저장된 값으로 다시 채운다 */
    ...pickCheckinBody(c),
    ...pickCheckinDetail(c),
    /* 팔 통증 자리 · 정도 — 어깨 · 팔꿈치 '통증'인 날 고른 것. 체크인 창과 요약의 통증 안내가 쓴다 */
    ...pickArmPain(c),
  }));

  return (
    /* 세로로 쌓는 틀 — 본문이 짧은 화면에서도 맨 밑 정보(SiteFooter)가 화면 바닥에 붙는다 */
    <div className="flex min-h-dvh flex-col">
      {/*
        시작 연출 — 로그인한 채 사이트를 열면(처음 · 다시) 테마 바탕 위 B → 이름(components/app-splash.tsx). 문서를 처음
        그릴 때 한 번. 아이폰 앱 안은 제 시작 연출(MainViewController.swift)이 같은 장면을 하므로 뺀다.
      */}
      {!isNative && <AppSplash />}
      <AppNav
        groups={applyLocksToGroups(visibleGroups(isAdmin, isNative), locks)}
        quick={applyLocks(quickTabs(), locks)}
        tabs={applyLocks(MOBILE_TABS, locks)}
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
          wingspanCm: user.wingspanCm,
          targetVelocity: user.targetVelocity,
          dailyWorkoutMinutes: user.dailyWorkoutMinutes,
          baseline: {
            baselineFreq: user.baselineFreq,
            baselineVolume: user.baselineVolume,
            baselineIntensity: user.baselineIntensity,
            baselineWorkoutFreq: user.baselineWorkoutFreq,
            throwingHand: user.throwingHand,
            competitionLevel: user.competitionLevel,
          },
          isAdmin,
        }}
        /* '설정' 창에서 고칠 값들. 여기서 이미 읽은 사용자라 조회가 늘지 않는다. */
        settings={{
          trainingLevel: user.trainingLevel,
          ownedEquipment: user.ownedEquipment,
        }}
        today={todayKey()}
        /*
         * 알림(종) — 오늘 체크인·투구 기록을 했나. '오늘'은 화면이 사용자 시계로 정하므로
         * 여기서는 최근 며칠의 목록만 준다(자정을 넘겨도 서버를 다시 부르지 않고 맞다).
         * 체크인을 저장하면 레이아웃을 새로 그리고(app/actions/checkin.ts), 투구를 남기면
         * 화면이 router.refresh 로 새로 받는다 — 둘 다 이 목록이 곧바로 새로워진다.
         */
        todo={{
          checkinDays: gateCheckins.map((c) => c.date),
          pitchDays: recentPitchDays.map((p) => p.date.toISOString().slice(0, 10)),
          recentCheckins: gateCheckins,
          parts: availableParts(library),
          /* 만 나이 — 체크인 요약의 팔 통증 안내가 쓴다(만 15세 미만은 루틴 대신 진료). 모르면 null */
          age: user.birthDate ? ageFromBirthDate(user.birthDate) : null,
          /* 투구 기록이 잠겨 있으면 종의 '기록하기' 대신 첫 설정으로 가는 단추 하나(components/notice-bell.tsx) */
          pitchLocked: locks.pitch,
        }}
      />

      {/*
        앱 기본 사용법 투어 — 처음 한 번(User.tutorialsDone 에 tour:web · tour:app). 웹과 앱(아이폰 웹뷰)은 막대 · 메뉴
        생김새가 달라 따로 본다. 차례는 시작 연출(AppSplash) → 투어 → 체크인 관문 — 관문은 투어가 떠 있는 동안
        (<html data-tour>) 기다린다(components/checkin-gate.tsx). 설정 › 정보 '사용 안내 다시 보기'로 다시 볼 수 있다.

        홈(/today) 페이지가 아니라 여기 둔다. 가입은 /today 로 보내므로(app/actions/auth.ts) 새 계정은 첫 홈에서 본다.
          · 관문과 같은 레이아웃에 있어야 차례가 지켜진다. 페이지에 두면 첫 화면을 그릴 때 틀(관문)이 본문보다 먼저 올 수
            있어(loading.tsx 뼈대), 연출이 없는 앱에서는 관문이 표시(data-tour)를 못 보고 먼저 열린다.
          · '사용 안내 다시 보기'는 설정 창이 뜨는 어느 화면에서나 눌린다 — 홈에만 있으면 다른 화면에서는 아무 일도 없다.
          · 레이아웃은 화면을 옮겨도 그대로라, 한 번 닫으면 다른 화면으로 가도 다시 뜨지 않는다(새로 열 때만).
        저절로는 홈(/today)에서만 연다(tour-gate.tsx HOME_PATH) — 탭 튜토리얼(투구 기록 · 트레이닝 · 영양, 그 페이지들의
        TabTutorial)은 탭 화면에서 뜨므로 둘이 한 화면에 겹치지 않는다. 다시 보기는 지금 화면에서 연다.
      */}
      <TourGate
        open={!hasSeenTutorial(user, tourKeyFor(isNative))}
        variant={isNative ? 'app' : 'web'}
      />

      {/*
        체크인 관문 — 그날 체크인을 안 했으면 어느 화면으로 들어오든 먼저 뜬다.
        화면 맨 위 칸(top layer)에 뜨는 창이라 여기 두어도 모든 것 위에 선다.
      */}
      <CheckinGate
        checkedDays={gateCheckins.map((c) => c.date)}
        streakDays={streakCheckins.map((c) => c.date.toISOString().slice(0, 10))}
        recent={gateCheckins}
        parts={availableParts(library)}
      />

      {/* 오래 비워 둔 탭으로 돌아오면 새로 받는다 — 다른 기기에서 바꾼 사진·정보가 보이게 */}
      <RefreshOnReturn />

      {/* 탭 첫 화면에서 아래로 당기면 새로 받는다 — 아이폰 앱만(components/pull-to-refresh.tsx) */}
      <PullToRefresh />

      {/* 신호 없이 남겨 폰에 담긴 운동 세트를 어느 화면에서든 이어서 보낸다 */}
      <SendPendingSets />

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
          data-ptr-target
          className="mx-auto w-full max-w-5xl flex-1 py-6 pb-10 pl-[max(calc(var(--spacing)*4),env(safe-area-inset-left))] pr-[max(calc(var(--spacing)*4),env(safe-area-inset-right))] sm:pl-[max(calc(var(--spacing)*6),env(safe-area-inset-left))] sm:pr-[max(calc(var(--spacing)*6),env(safe-area-inset-right))] sm:pt-6 xl:max-w-6xl 2xl:max-w-7xl desk:pt-(--page-top) desk:pb-32"
        >
          {/*
           * 탭을 옮길 때 본문만 바뀐다. 틀(사이드바 · 상단바 · 탭바)은 components/app-shell.tsx 에서 각자 이름표를 달아
           * 이 전환에서 빠진다 — 내용만 바뀌고 틀은 가만히 있는 것으로 읽힌다. 언제 · 어떻게 움직이는지는 MainTransition.
           */}
          <MainTransition>{children}</MainTransition>
        </main>

        <SiteFooter tabBar />
      </div>
    </div>
  );
}
