import { Suspense, cache } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { loadTodayCore } from '@/lib/report/today-data';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { dbDate } from '@/lib/nutrition/days';
import { Card, PageHeading } from '@/components/ui';
import { Skeleton } from '@/components/fallback';
import {
  dailyPitchCap,
  intensityRangeText,
  pitchRangeText,
  type PitchPlan,
} from '@/lib/report/plan';
import { buildHighlights } from '@/lib/report/highlights';
import { PitchLogPanel } from './pitch-log-panel';
import { TodayRings } from './today-rings';
import { FirstDayCard } from './first-day-card';
import { Highlights } from './highlights';
import { HomeTitleArt } from './home-title';
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
  return new Date();
}

type User = Awaited<ReturnType<typeof requireUser>>;

/*
 * 오늘 자료(투구 계획 · 부하 · 오늘 일정) — 링 밑 한 줄과 아래 하이라이트가 같이 쓴다. 무거운 계산이라 한 요청 안에서는
 * 한 번만 돈다(React cache — 같은 user 객체면 처음 것을 돌려준다. user 는 레이아웃이 읽어 둔 그 객체다).
 */
const homeCore = cache((user: User) => loadTodayCore(user, now()));

/** 기다리는 동안의 자리 — 하이라이트 두 장과 '더 보기' 줄 모양 */
function TodaySkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only">오늘 기록을 불러오는 중이에요</span>
      <Skeleton className="h-7 w-28 rounded-lg" />
      <Skeleton className="h-20 rounded-2xl" />
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

  return (
    <div className="stack-page">
      {/*
        제목 — 다른 탭과 같은 모양. 매일 여는 화면이라 인사 · 안내는 뺐다. loading.tsx 도 똑같이 그려, 불러오는
        동안과 다 온 뒤에 자리가 바뀌지 않는다.
      */}
      {/* 휴대폰은 큰 제목 자리에 불펜로그 로고 + 오늘 날짜(home-title.tsx), PC 는 예전 그대로 */}
      <PageHeading eyebrow="Home" title="홈" titleArt={<HomeTitleArt />} />

      {/*
        오늘 — 체크인 · 투구 · 운동 · 영양 링(아이폰 피트니스처럼) + 그 밑 오늘 투구 한 줄.
        링은 그날 요약 하나만 읽으면 그려지고, 한 줄은 투구 계획을 셈하느라 더 걸려 따로 울타리를 둔다.
      */}
      <Suspense
        fallback={<Skeleton className="h-[13.5rem] rounded-2xl desk:h-[10.5rem]" />}
      >
        <TodayRings
          user={user}
          today={today}
          footer={
            <Suspense
              fallback={<div className="mt-3 h-11 border-t border-line desk:h-9" />}
            >
              <PlanLine user={user} />
            </Suspense>
          }
        />
      </Suspense>

      {/*
        달력. 아래 하이라이트와 울타리를 따로 둔다 — 달력은 기록만 읽으면 그려지지만 아래는 오늘 계획 · 부하를
        셈한다. 한 울타리면 달력이 다 준비되고도 아래를 기다리느라 회색으로 남는다.
      */}
      <Suspense fallback={<Skeleton className="h-[26rem] rounded-2xl" />}>
        <PitchLogSection user={user} initialDate={initialDate} />
      </Suspense>

      <Suspense fallback={<TodaySkeleton />}>
        <TodayBody user={user} today={today} />
      </Suspense>
    </div>
  );
}

/** 달력 — 지난 기록 열세 달(history.ts). 그날의 수치 · 영상 · 폼 분석은 /pitch-log/<날짜> 가 따로 읽는다 */
async function PitchLogSection({
  user,
  initialDate,
}: {
  user: User;
  initialDate: string | null;
}) {
  const h = await loadPitchHistory(user);
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
      reportDays={h.reportDays}
    />
  );
}

/**
 * 링 밑 한 줄 — 오늘(이미 던졌으면 내일) 알맞은 투구.
 *
 * 앱에서 가장 중요한 안전 안내인데, 예전에는 꺼 둔 AI 리포트 칸 안에 숨어 있었다. 숫자는 투구 계획(lib/report/plan.ts)
 * 그대로라 그날 투구 창 · 분석과 같다. 누르면 분석의 투구 칸(근거)으로. 처음 온 사람은 첫날 카드가 같은 숫자를 크게
 * 보여 주므로 여기서는 비운다.
 */
async function PlanLine({ user }: { user: User }) {
  const core = await homeCore(user);
  const line = core.everLogged ? planLine(core.plan) : null;
  if (!line) return null;
  return (
    <Link
      href="/coach?view=pitch"
      className="mx-1 mt-3 flex min-h-11 items-center gap-2 border-t border-line pt-3 text-sm transition-opacity hover:opacity-80 desk:min-h-9"
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-ink">{line.main}</span>
        {line.sub && <span className="text-muted"> · {line.sub}</span>}
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-line-strong" />
    </Link>
  );
}

/** '오늘 35~45구까지' · '강도 5~7' / '오늘은 쉬어요' · 까닭 */
function planLine(plan: PitchPlan): { main: string; sub: string } | null {
  const day = plan.threwToday ? plan.tomorrow : plan.today;
  if (!day) return null;
  const when = plan.threwToday ? '내일' : '오늘';
  if (!day.throwing) return { main: `${when}은 쉬어요`, sub: day.reason };
  const range = pitchRangeText(day);
  if (!range) return null;
  return {
    main: `${when} ${range.endsWith('이하') ? range : `${range}까지`}${day.recovery ? ' 가볍게' : ''}`,
    sub: intensityRangeText(day),
  };
}

/** 캘린더 밑 — 알림 카드 · 첫날 카드 · 하이라이트 · 더 보기 */
async function TodayBody({ user, today }: { user: User; today: string }) {
  /*
   * 하이라이트 재료 — 모두 하루 한 줄로 가볍게 읽는다. 투구는 6주(구속 선 · 투구 막대), 체크인은 두 달(연속 일수),
   * 운동은 2주(지난주와 견줌).
   */
  const [core, logs, before, checkins, workouts, lastLog] = await Promise.all([
    homeCore(user),
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: dbDate(shiftDateKey(today, -41)) } },
      select: { date: true, pitchCount: true, maxVelocity: true, sessionType: true },
    }),
    /* 최근 이레 앞의 역대 최고 구속 — '새 기록'을 가른다 */
    prisma.pitchLog.aggregate({
      where: { userId: user.id, date: { lt: dbDate(shiftDateKey(today, -6)) } },
      _max: { maxVelocity: true },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId: user.id, date: { gte: dbDate(shiftDateKey(today, -61)) } },
      select: { date: true, condition: true },
    }),
    prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        completed: true,
        date: { gte: dbDate(shiftDateKey(today, -13)) },
      },
      select: { date: true },
      distinct: ['date'],
    }),
    /* 마지막으로 남긴 투구 기록(쉬는 날 포함) — 기록이 며칠째 비었나 */
    prisma.pitchLog.findFirst({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);
  const { facts, plan, picked } = core;

  const pitchesByDay: Record<string, number> = {};
  const velocityByDay: Record<string, number> = {};
  for (const l of logs) {
    const key = toDateKey(l.date);
    if (l.sessionType !== REST_SESSION_TYPE) {
      pitchesByDay[key] = (pitchesByDay[key] ?? 0) + l.pitchCount;
    }
    if (l.maxVelocity != null)
      velocityByDay[key] = Math.max(velocityByDay[key] ?? 0, l.maxVelocity);
  }
  const conditionByDay: Record<string, number> = {};
  for (const c of checkins) {
    if (c.condition != null) conditionByDay[toDateKey(c.date)] = c.condition;
  }

  const highlights = buildHighlights({
    today,
    load: { zone: facts.load.zone, ratio: facts.load.ratio },
    pitchesByDay,
    lastLogDate: lastLog ? toDateKey(lastLog.date) : null,
    velocityByDay,
    bestBefore: before._max.maxVelocity ?? null,
    conditionByDay,
    checkinDays: checkins.map((c) => toDateKey(c.date)),
    workoutDays: workouts.map((w) => toDateKey(w.date)),
  });

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
        처음 온 사람에게 어디부터인지 알려준다 — 오늘 던져도 되는 양 + 바로 누르는 단추(first-day-card.tsx).

        투구 기록이 하나도 없을 때만 낸다. 한 번이라도 남긴 사람에게는 잔소리가 되고, 매일 뜨는
        안내는 곧 안 읽게 된다. 숫자는 투구 계획(lib/report/plan.ts)의 오늘 몫 그대로다 — 기록이
        없으면 나이 한도의 절반에서 시작하고 아직 부하를 몰라 한 번 더 낮춘다.
      */}
      {!core.everLogged && (
        <FirstDayCard
          today={today}
          range={
            !plan.halted && plan.today?.throwing
              ? pitchRangeText(plan.today) || null
              : null
          }
          intensity={plan.today ? intensityRangeText(plan.today) : ''}
          note={
            plan.recovering
              ? null
              : facts.profile.age != null
                ? `만 ${facts.profile.age}세 하루 한도 ${dailyPitchCap(facts.profile.age)}구에서, 처음이라 절반쯤으로 잡았어요.`
                : '처음이라 낮게 잡았어요. 생년월일을 넣으면 나이에 맞춰요.'
          }
        />
      )}

      <Highlights items={highlights} />

      {/* 분석 칸 · 그래프는 따로 한 화면으로(/coach) — 지운 것 없이 거기에 그대로 있다 */}
      <Link
        href="/coach"
        className="flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-(--block-pad) text-[15px] text-ink transition-colors hover:bg-surface-2/60"
      >
        분석 · 그래프 더 보기
        <ChevronRight aria-hidden className="h-4 w-4 text-line-strong" />
      </Link>
    </>
  );
}
