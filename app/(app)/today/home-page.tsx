import { appNow } from '@/lib/clock';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { loadTodayCoreCached } from '@/lib/report/today-data';
import { toDateKey } from '@/lib/pitch-stats';
import { keyOfDbDate } from '@/lib/nutrition/days';
import { Card, PageHeading } from '@/components/ui';
import { Skeleton } from '@/components/fallback';
import { armStatusOf } from '@/lib/report/arm-status';
import { GOOD_DAY_MIN, RATED_SESSION_TYPES } from '@/lib/pitch-satisfaction';
import { PitchLogPanel } from './pitch-log-panel';
import { TodayRings } from './today-rings';
import { Feed } from './feed';
import { FirstDayCard } from './first-day-card';
import { GoodDayNote } from './good-day-note';
import { todayOutingRole } from '@/lib/checkin';
import { loadPitchHistory, readDateParam } from './history';

/**
 * 홈 — 위는 '오늘', 캘린더 밑은 '달라진 것'.
 *
 * 예전에는 이 화면 하나가 체크인·투구 기록·운동 목록·근거 패널을 다 들고 있었다. '남기는 것'과 '하는 것'으로
 * 갈라 운동 목록은 트레이닝으로, 할 일 상자는 오른쪽 위 알림(종)으로 옮겼다.
 *
 * 2026-10-05 캘린더 밑을 다시 정리했다. 사용자: "분석이랑 돌아보기가 주구절절 작은 글씨로 잡다한 정보가 많아서
 * 읽어볼지 모르겠다 · 너무 길어지는 건 싫다". 분석 칸(리포트 · 투구 · 트레이닝)과 그래프는 분석 · 그래프 화면
 * (/coach)으로 옮기고, 돌아보기(부하 두 줄 · 이번 주 · 최근 기록)는 거기와 캘린더에 다 있는 것이라 뺐다. 홈에는
 * 링 밑 오늘 투구 한 줄과 하이라이트(평소와 달라진 것만, 많아야 셋, lib/report/highlights.ts)만 남는다.
 */

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return appNow();
}

type User = Awaited<ReturnType<typeof requireUser>>;

/*
 * 오늘 자료(투구 계획 · 부하 · 오늘 일정)는 위 요약 칸(feed.tsx)과 캘린더 밑 카드가 같이 쓴다 — 무거운 계산이라 한 요청 안에서는
 * 한 번만 돈다(lib/report/today-data.ts 의 loadTodayCoreCached, 같은 user 객체면 처음 것을 돌려준다).
 */

/** 기다리는 동안의 자리 — 카드 한 장 모양(하이라이트는 2026-10-13 위 요약 칸으로 옮겨 밑에는 조건부 카드만 남는다) */
function TodaySkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only">오늘 기록을 불러오는 중이에요</span>
      <Skeleton className="h-20 rounded-2xl" />
    </div>
  );
}

/**
 * 제목은 곧바로, 나머지는 뒤따라.
 *
 * 예전에는 이 함수가 13번의 DB 조회를 모두 기다린 뒤에야 무언가를 내보냈다. 재보니 누른 뒤 340ms 동안 회색 덩어리만
 * 보였다. 사용자는 레이아웃이 이미 읽어 둔 것이라(lib/dal.ts 의 cache) 이 await 는 DB 를 안 간다 — 제목과 각 칸의
 * 자리는 기다릴 것 없이 바로 나간다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  // 그날 화면에서 '달력으로 돌아가기'로 들어오면 그 날짜를 짚어 둔다.
  const initialDate = readDateParam(params.date);

  /* 예전 홈 분석 칸 주소(?analysis=…)는 분석 화면으로 — 분석 · 그래프는 /coach 로 옮겼다 */
  if (typeof params.analysis === 'string') {
    redirect(
      `/coach?view=${encodeURIComponent(params.analysis)}${initialDate ? `&date=${initialDate}` : ''}`
    );
  }

  const today = toDateKey(now());
  /*
   * 어느 탭이 잠겨 있나(lib/feature-locks.ts, 2026-10-09) — 투구 기록이 잠긴 사람(첫 설정 전)에게는 홈의 투구 링과
   * 첫날 카드가 오늘 기록 창 대신 첫 설정 화면으로 보낸다. 운동 · 영양 링은 그대로 그 탭으로 — 잠겨 있으면 그 탭이
   * 설정 화면으로 보낸다.
   */
  const locks = featureLocks(user);

  return (
    <div className="stack-page">
      {/*
        제목 — 다른 탭과 같은 모양. 매일 여는 화면이라 인사 · 안내는 뺐다. loading.tsx 도 똑같이 그려, 불러오는
        동안과 다 온 뒤에 자리가 바뀌지 않는다.
      */}
      {/*
        휴대폰은 제목을 화면에 안 그린다 — 앱 이름은 위 막대 왼쪽, 날짜는 뺐다(2026-10-13 김민 "날짜 아예 빼고 여백 맞춰").
        화면 읽기 · 위 막대 작은 제목용으로만 남고, 링 카드가 본문 위 여백(24px) 바로 밑에서 시작한다. PC 는 예전 그대로.
      */}
      <div className="sr-only mb-0! desk:not-sr-only desk:mb-(--gap-page)!">
        <PageHeading eyebrow="Home" title="홈" />
      </div>

      {/*
        오늘 — 체크인 · 투구 · 운동 · 영양 링(아이폰 피트니스처럼). 그 밑 '오늘(내일) N구까지' 한 줄은 뺐다(2026-10-13 김민).
      */}
      <Suspense
        fallback={<Skeleton className="h-[13.5rem] rounded-2xl desk:h-[10.5rem]" />}
      >
        <TodayRings user={user} today={today} pitchLocked={locks.pitch} />
      </Suspense>

      {/*
        요약 칸(우리끼리 '뉴스' — 화면에는 그 말이 없다, feed.tsx · feed-card.tsx, 2026-10-13). 예전 영양 카드 자리다.
        하이라이트(평소와 달라진 것 — 투구 · 운동 · 홈 몫 모두) · 부하 지수 · 오늘 운동 · 영양 한 줄을 3초마다 한 장씩 돌려 보이고,
        누르면 그 탭으로 간다. 예전 영양 카드(10.5rem)보다 조금 길다(사용자 "하단 길이를 조금만 늘려줘").
      */}
      <Suspense
        fallback={<Skeleton className="h-[11.25rem] rounded-2xl desk:h-[9rem]" />}
      >
        <Feed user={user} today={today} />
      </Suspense>

      {/*
        달력. 아래 하이라이트와 울타리를 따로 둔다 — 달력은 기록만 읽으면 그려지지만 아래는 오늘 계획 · 부하를
        셈한다. 한 울타리면 달력이 다 준비되고도 아래를 기다리느라 회색으로 남는다.
      */}
      <Suspense fallback={<Skeleton className="h-[26rem] rounded-2xl" />}>
        <PitchLogSection user={user} initialDate={initialDate} />
      </Suspense>

      <Suspense fallback={<TodaySkeleton />}>
        <TodayBody user={user} today={today} pitchLocked={locks.pitch} />
      </Suspense>
    </div>
  );
}

/** 달력 — 지난 기록 열세 달(history.ts). 그날의 수치 · 영상은 /pitch-log/<날짜> 가 따로 읽는다 */
async function PitchLogSection({
  user,
  initialDate,
}: {
  user: User;
  initialDate: string | null;
}) {
  const [h, events] = await Promise.all([
    /* 체중은 홈 캘린더가 안 쓴다(분석 화면 그래프만) — 그 조회를 건너뛴다 */
    loadPitchHistory(user, { weights: false }),
    /*
     * 일정 — 사람마다 많지 않아 전부 읽는다(지난 달 · 앞 달을 넘겨도 바로 보이게).
     * 관리자는 다른 관리자의 일정도 함께 본다(읽기만 — 고치기 · 알림은 제 것만).
     */
    prisma.calendarEvent.findMany({
      where: user.role === 'ADMIN' ? { user: { role: 'ADMIN' } } : { userId: user.id },
      orderBy: { date: 'asc' },
      take: 3000,
      select: {
        id: true,
        date: true,
        title: true,
        time: true,
        memo: true,
        remindMin: true,
        userId: true,
        user: { select: { nickname: true } },
      },
    }),
  ]);
  return (
    <PitchLogPanel
      today={toDateKey(now())}
      initialLogs={h.logs}
      initialDate={initialDate}
      loadedFrom={h.loadedFrom}
      trainingByDay={h.training}
      planByDay={h.plans}
      featuredByDay={h.featuredByDay}
      nutritionByDay={h.nutritionByDay}
      velocityByDay={h.velocityByDay}
      checkinByDay={h.checkinByDay}
      initialEvents={events.map(({ userId, user: owner, ...e }) => ({
        ...e,
        date: keyOfDbDate(e.date),
        ...(userId === user.id ? {} : { owner: owner.nickname }),
      }))}
    />
  );
}

/** 캘린더 밑 — 알림 카드 · 첫날 카드 · 잘 던진 날 메모(하이라이트 · '분석 · 그래프 더 보기' 줄은 2026-10-13 뺌 — 하이라이트는 위 요약 칸으로) */
async function TodayBody({
  user,
  today,
  pitchLocked,
}: {
  user: User;
  today: string;
  /** 투구 기록이 잠겨 있다(첫 설정 전) — 첫날 카드가 숫자 대신 설정으로 가는 단추를 낸다 */
  pitchLocked: boolean;
}) {
  /*
   * 셋 다 서로 기다리지 않는다. 하이라이트는 위 요약 칸(feed.tsx)이 보이고, 여기서는 마지막 기록 날만 쓴다 — 예전엔 그 하나를 얻으려고
   * 하이라이트 재료(조회 다섯)를 통째로 읽었다. 그중 이 날을 낸 조회(lib/report/highlights-load.ts 의 lastLog — 쉬는 날 포함 가장 최근 줄)만 그대로 묻는다.
   */
  const [core, lastLog, goodDay] = await Promise.all([
    loadTodayCoreCached(user),
    prisma.pitchLog.findFirst({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
    /* 만족도가 높았던 날의 메모 — 5점 먼저, 같은 점수면 최근 것(good-day-note.tsx) */
    prisma.pitchLog.findFirst({
      where: {
        userId: user.id,
        sessionType: { in: [...RATED_SESSION_TYPES] },
        satisfaction: { gte: GOOD_DAY_MIN },
        memo: { not: null },
      },
      orderBy: [{ satisfaction: 'desc' }, { date: 'desc' }, { createdAt: 'desc' }],
      select: {
        date: true,
        sessionType: true,
        satisfaction: true,
        memo: true,
        cuesGood: true,
      },
    }),
  ]);
  const { facts, plan, picked } = core;
  /*
   * 잘 던진 날 메모는 오늘 던지기 전에만 — 오늘 할 일이 등판 · 불펜이고 오늘 투구 기록(쉬는 날 포함)이 아직 없을 때.
   * 기록을 남기면 그날은 거둔다. '오늘 등판 · 불펜인가'는 투구 계획 · 매일 일정 · 암케어와 같은 함수(lib/checkin.ts
   * todayOutingRole)로 같은 facts 의 답을 읽는다 — 글자를 따로 견주면 어제 '내일 등판' + 오늘 답 없음(C4)만 홈에서 빠졌다.
   */
  const throwsToday =
    todayOutingRole(
      facts.condition.throwPlanToday,
      facts.condition.throwPlanYesterday
    ) != null;
  const loggedToday = lastLog != null && toDateKey(lastLog.date) === today;
  const goodNote =
    goodDay?.memo && goodDay.satisfaction != null && throwsToday && !loggedToday
      ? { ...goodDay, memo: goodDay.memo, satisfaction: goodDay.satisfaction }
      : null;

  return (
    <>
      {/*
        최근 메모에 통증 같은 표현이 있었던 경우.
        알림 창에 넣기에는 긴 이야기라, 홈에 그대로 둔다.
      */}
      {plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-2 border-warn-line bg-warn-bg">
          <p className="text-sm font-bold text-warn">지금 통증이 있으신가요?</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 투구 일지 메모에 {`‘${facts.condition.painWordsInMemo.join(', ')}’`}{' '}
            같은 말이 있었어요. 통증인지 알 수 없어서, 확인될 때까지 투구는 쉬고 운동은
            회복 · 가동성만 골랐어요.
          </p>
          <p className="text-sm leading-relaxed text-warn">
            통증이 있다면 던지지 말고 전문의와 상담하세요. 통증이 아니라면 오른쪽 위
            알림(종)에서 오늘 체크인을 남겨 주세요. 바로 평소 계획으로 돌아가요.
          </p>
        </Card>
      )}

      {/* 최근 체크인에 통증이 있었던 경우. */}
      {plan.recovering && !plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-1 border-warn-line bg-warn-bg">
          <p className="text-sm font-bold text-warn">오늘은 회복 운동만 골랐어요</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 체크인에 통증이 있어서 무게 운동은 빼고 회복 · 가동성 운동만 골랐어요.
            다시 아프면 오른쪽 위 알림(종)에서 오늘 체크인에 남겨 주세요.
          </p>
        </Card>
      )}

      {/*
        처음 온 사람에게 어디부터인지 알려준다 — 지금 팔 상태(위험 · 주의 · 안전) + 바로 누르는 단추(first-day-card.tsx).

        투구 기록이 하나도 없을 때만 낸다. 한 번이라도 남긴 사람에게는 잔소리가 되고, 매일 뜨는
        안내는 곧 안 읽게 된다. 예전엔 오늘 알맞은 투구('30~40구')를 냈다(2026-10-14 사용자: 몇 구를 던지라고 하지 말고
        위험한지 안전한지만). 투구 기록이 잠겨 있으면(첫 설정 전) 상태 없이 설정으로 가는 단추 하나다.
      */}
      {!core.everLogged && (
        <FirstDayCard
          today={today}
          pitchLocked={pitchLocked}
          status={armStatusOf(facts)}
        />
      )}

      {goodNote && (
        <GoodDayNote
          date={toDateKey(goodNote.date)}
          sessionType={goodNote.sessionType}
          satisfaction={goodNote.satisfaction}
          memo={goodNote.memo}
          cuesGood={goodNote.cuesGood}
        />
      )}
    </>
  );
}
