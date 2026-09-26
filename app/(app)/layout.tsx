import { ViewTransition } from 'react';
import { requireUser } from '@/lib/dal';
import { isSex, toDateInputValue } from '@/lib/profile';
import { toDateKey } from '@/lib/pitch-stats';
import { createAvatarUrl } from '@/lib/storage';
import { MOBILE_TABS, quickTabs, visibleGroups } from '@/lib/nav';
import { AppNav } from '@/components/app-shell';
import { CheckinGate } from '@/components/checkin-gate';
import { RefreshOnReturn } from '@/components/refresh-on-return';
import type { CheckinData } from '@/components/checkin-form';
import { prisma } from '@/lib/prisma';
import { pickCheckinDetail, pickCheckinParts } from '@/lib/checkin';
import { visibleExercises } from '@/lib/library-cache';
import { availableParts } from '@/lib/report/today-pick';
import { QUIET_REFRESH } from '@/lib/transition-types';

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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 이 레이아웃 아래의 모든 페이지는 로그인이 필요하다.
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';
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
  const [avatarUrl, recentCheckins, library, recentPitchDays] = await Promise.all([
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
  ]);
  const gateCheckins: CheckinData[] = recentCheckins.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ...pickCheckinParts(c),
    condition: c.condition,
    sleep: c.sleep,
    preferredParts: c.preferredParts,
    preferredWorkout: c.preferredWorkout,
    ...pickCheckinDetail(c),
  }));

  return (
    <div className="min-h-screen">
      <AppNav
        groups={visibleGroups(isAdmin)}
        quick={quickTabs()}
        tabs={MOBILE_TABS}
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
        }}
      />

      {/*
        체크인 관문 — 그날 체크인을 안 했으면 어느 화면으로 들어오든 먼저 뜬다.
        화면 맨 위 칸(top layer)에 뜨는 창이라 여기 두어도 모든 것 위에 선다.
      */}
      <CheckinGate
        checkedDays={gateCheckins.map((c) => c.date)}
        recent={gateCheckins}
        parts={availableParts(library)}
      />

      {/* 오래 비워 둔 탭으로 돌아오면 새로 받는다 — 다른 기기에서 바꾼 사진·정보가 보이게 */}
      <RefreshOnReturn />

      {/*
        위쪽만 비운다.

        메뉴가 세로 막대였을 때는 그 폭만큼 좌우를 같이 비워야 본문이 화면
        한가운데에 놓였다. 이제 로고와 메뉴가 둘 다 위쪽 한 줄에 있으므로,
        좌우는 아무것도 차지하지 않는다 — 비우면 오히려 본문이 좁아진다.
        본문은 저 스스로 가운데 정렬(mx-auto)이라 그대로 화면 한가운데다.

        위쪽 4rem 은 그 줄의 자리다. 로고와 아이콘은 고정이라 자리를 차지하지
        않으므로, 여기서 비워주지 않으면 첫 줄이 그 밑으로 들어간다.
      */}
      <div className="desk:pt-16">
        <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:pt-8 desk:pb-12">
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
           *
           * 거꾸로 자료만 새로 받는 전환(router.refresh)에는 표시를 붙여 여기서 뺀다
           * (update 의 QUIET_REFRESH → none, lib/quiet-refresh.ts). 같은 화면에서 새로
           * 받을 뿐인데 본문 전체가 페이드해, 알림(종)을 누를 때마다 깜빡였다. 표시가
           * 없는 전환(탭 이동)은 default 로 예전처럼 페이드한다.
           */}
          <ViewTransition
            name="app-main"
            share="page"
            enter="page"
            exit="page"
            update={{ [QUIET_REFRESH]: 'none', default: 'auto' }}
          >
            {children}
          </ViewTransition>
        </main>
      </div>
    </div>
  );
}
