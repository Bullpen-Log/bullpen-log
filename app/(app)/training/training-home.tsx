import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { Check, ChevronRight, Dumbbell, Play, ShieldPlus, Target, type LucideIcon } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { PageHeading, todayKicker } from '@/components/ui';
import { OpenCheckinButton } from '@/components/notice-bell';
import { loadTodayCore, type UserForToday } from '@/lib/report/today-data';
import { loadArmcareToday, type UserForArmcare } from '@/lib/armcare/today';
import { ARMCARE_KIND_TEXT } from '@/lib/armcare/routine';
import { ARMCARE_AREAS, ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { loadArmcareCoverage } from '@/lib/armcare/coverage-load';
import { visibleExercises } from '@/lib/library-cache';
import { loadMechanicsProgram } from '@/lib/mechanics/load';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { TRAINING_PART_HREF, type TrainingPart } from '@/lib/training-part';
import { StartWorkout } from './start-workout';

type HomeUser = UserForToday & UserForArmcare & { id: string };

/**
 * 트레이닝 홈 — 트레이닝 · 암케어 · 메커니즘을 앱 카드 셋으로(2026-10-04).
 *
 * 사용자분: "불펜로그라는 하나의 앱 안에 아주 높은 퀄리티의 각각의 앱들이 들어 있는 것을 원한다 — 지금은 한눈에 잘 안
 * 들어온다." 예전에는 아래 탭이 마지막으로 본 칸을 바로 열고 셋이 [트레이닝 | 암케어 | 메커니즘] 고르개를 같이 써서,
 * 한 화면의 탭처럼 보였다. 이제 앱마다 얼굴(아이콘 · 색 — globals.css --color-app-*)과 오늘 할 것 한 줄, [시작]을 둔다 —
 * 아래 탭에서 두 번 누르면 운동이 시작된다. 카드를 누르면 그 앱의 전체 화면(‹ 트레이닝).
 *
 * 카드마다 읽는 것이 달라(운동 일정 · 암케어 오늘 · 메커니즘 프로그램) 따로 기다린다 — 먼저 온 카드부터 보인다.
 * 마지막으로 쓴 앱(쿠키)이 맨 위다.
 */
export function TrainingHome({
  user,
  today,
  lastApp,
}: {
  user: HomeUser;
  today: Date;
  lastApp: TrainingPart | null;
}) {
  const cards: Record<TrainingPart, ReactNode> = {
    today: (
      <Suspense key="today" fallback={<CardSkeleton app="today" />}>
        <SafeCard app="today">
          {() => WorkoutCard({ user, today })}
        </SafeCard>
      </Suspense>
    ),
    armcare: (
      <Suspense key="armcare" fallback={<CardSkeleton app="armcare" />}>
        <SafeCard app="armcare">
          {() => ArmcareCard({ user, today })}
        </SafeCard>
      </Suspense>
    ),
    mechanics: (
      <Suspense key="mechanics" fallback={<CardSkeleton app="mechanics" />}>
        <SafeCard app="mechanics">
          {() => MechanicsCard({ userId: user.id })}
        </SafeCard>
      </Suspense>
    ),
  };
  const order: TrainingPart[] = ['today', 'armcare', 'mechanics'];
  if (lastApp) order.sort((a, b) => Number(b === lastApp) - Number(a === lastApp));

  return (
    <div className="stack-page">
      <PageHeading eyebrow="Training" kicker={todayKicker(today)} title="트레이닝" />
      <div className="space-y-3">{order.map((app) => cards[app])}</div>
      <Suspense fallback={<div className="h-20" />}>
        <WeekStrip userId={user.id} today={today} />
      </Suspense>
    </div>
  );
}

/* ─────────────────────────────── 앱의 얼굴 ─────────────────────────────── */

const APPS: Record<
  TrainingPart,
  { name: string; icon: LucideIcon; tile: string; ink: string; button: string; bar: string; barSoft: string }
> = {
  today: {
    name: '트레이닝',
    icon: Dumbbell,
    tile: 'bg-app-training/12',
    ink: 'text-app-training',
    button: 'bg-app-training',
    bar: 'bg-app-training',
    barSoft: 'bg-app-training/35',
  },
  armcare: {
    name: '암케어',
    icon: ShieldPlus,
    tile: 'bg-app-armcare/12',
    ink: 'text-app-armcare',
    button: 'bg-app-armcare',
    bar: 'bg-app-armcare',
    barSoft: 'bg-app-armcare/35',
  },
  mechanics: {
    name: '메커니즘',
    icon: Target,
    tile: 'bg-app-mechanics/12',
    ink: 'text-app-mechanics',
    button: 'bg-app-mechanics',
    bar: 'bg-app-mechanics',
    barSoft: 'bg-app-mechanics/35',
  },
};

function AppIcon({ app }: { app: TrainingPart }) {
  const a = APPS[app];
  const Icon = a.icon;
  return (
    /* 칠한 네모 + 흰 그림 — 아이폰 앱 아이콘처럼. 옅은 색 네모 위 색 그림은 AI 템플릿의 기능 카드 같았다(2026-10-04) */
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-white ${a.button}`}>
      <Icon aria-hidden className="h-6 w-6" strokeWidth={2.1} />
    </span>
  );
}

/**
 * 앱 카드 한 장 — 카드 전체가 그 앱으로 가는 링크이고, [시작]은 그 위에 따로 선다(링크 안에 단추를 넣지 않는다).
 */
function AppCard({
  app,
  status,
  tone = 'normal',
  action,
  children,
}: {
  app: TrainingPart;
  /** 오늘 할 것 한 줄 */
  status: ReactNode;
  tone?: 'normal' | 'done' | 'warn';
  /** 오른쪽 단추 — [시작] 등. 없으면 › */
  action?: ReactNode;
  /** 카드 밑 한 줄 · 막대 */
  children?: ReactNode;
}) {
  const a = APPS[app];
  return (
    <div className="relative rounded-2xl bg-surface p-(--block-pad) transition-colors has-[a.app-link:hover]:bg-surface-2">
      <div className="flex items-center gap-3">
        <AppIcon app={app} />
        <div className="min-w-0 flex-1">
          <Link
            href={TRAINING_PART_HREF[app]}
            className="app-link text-base font-bold text-ink after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {a.name}
          </Link>
          <p
            className={`mt-0.5 flex items-center gap-1 text-sm break-keep ${
              tone === 'warn' ? 'text-warn' : tone === 'done' ? a.ink : 'text-muted'
            }`}
          >
            {tone === 'done' && <Check aria-hidden className="h-4 w-4 shrink-0" />}
            <span>{status}</span>
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          {action ?? <ChevronRight aria-hidden className="h-5 w-5 text-muted" />}
        </div>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** [시작] 알약 — 링크 */
function StartLink({ app, href, label = '시작' }: { app: TrainingPart; href: string; label?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center gap-1 rounded-full px-4 text-sm font-bold text-white transition-transform motion-safe:active:scale-[0.97] ${APPS[app].button}`}
    >
      <Play aria-hidden className="h-3.5 w-3.5" fill="currentColor" />
      {label}
    </Link>
  );
}

function CardSkeleton({ app }: { app: TrainingPart }) {
  return (
    <div className="rounded-2xl bg-surface p-(--block-pad)" aria-busy>
      <div className="flex items-center gap-3">
        <AppIcon app={app} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-base font-bold text-ink">{APPS[app].name}</p>
          <span className="block h-3.5 w-40 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/**
 * 카드 하나가 실패해도 홈 전체가 오류 화면이 되지 않게 — 그 카드만 '불러오지 못했어요'로 남는다. 세 앱의 자료를 한
 * 화면에 모으므로, 한 앱의 문제가 나머지 둘까지 가리면 안 된다. 카드를 눌러 그 앱으로 가는 길은 남는다.
 * 카드 함수를 여기서 직접 부른다 — <WorkoutCard /> 로 넘기면 그리기가 뒤로 미뤄져 이 try 가 오류를 못 잡는다.
 */
async function SafeCard({
  app,
  children,
}: {
  app: TrainingPart;
  children: () => Promise<ReactNode> | ReactNode;
}) {
  try {
    return await children();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[트레이닝 홈] ${APPS[app].name} 카드`, err);
    return <AppCard app={app} tone="warn" status="지금은 불러오지 못했어요. 눌러서 열어 보세요" />;
  }
}

/* ─────────────────────────────── 카드 셋 ─────────────────────────────── */

/** 트레이닝 — 오늘 일정 한 줄과 [시작](운동 판으로 곧장) */
async function WorkoutCard({ user, today }: { user: HomeUser; today: Date }) {
  const core = await loadTodayCore(user, today);
  const session = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId: user.id, date: core.midnight } },
    select: { status: true },
  });
  const count = core.shownPicks.length;

  if (session?.status === 'FINISHED') {
    return <AppCard app="today" tone="done" status="오늘 운동을 마쳤어요" />;
  }
  if (core.picked.halted) {
    return <AppCard app="today" tone="warn" status="오늘은 운동을 처방하지 않았어요" />;
  }
  if (!core.savedPlan) {
    return <AppCard app="today" status="오늘 일정을 아직 안 만들었어요" />;
  }
  if (count === 0) {
    return <AppCard app="today" status="일정에 남은 운동이 없어요" />;
  }
  return (
    <AppCard
      app="today"
      status={`${core.savedPlan.theme.label} · ${count}종목 · 약 ${core.shownMinutes}분`}
      action={<StartWorkout compact resume={session?.status === 'ACTIVE'} />}
    />
  );
}

/**
 * 암케어 — 오늘 루틴(재활 중이면 재활) 한 줄과 [시작](따라 하기로 곧장). 밑에 내 팔 지도의 '2주째 안 한 곳'을 한 줄
 * 띄우고 누르면 부위별 보강(내 팔 지도)으로 간다(lib/armcare/coverage-load.ts — 아픈 곳은 뺀다).
 */
async function ArmcareCard({ user, today }: { user: HomeUser; today: Date }) {
  const data = await loadArmcareToday(user, today);
  const map = await loadArmcareCoverage(user.id, data.todayKey, await visibleExercises());
  const gapLine =
    map.gaps.length > 0 && data.decision.kind !== 'rest' ? (
      <Link
        href="/training?view=armcare&tab=guide"
        className={`relative z-10 inline-flex min-h-8 items-center gap-0.5 text-xs font-semibold ${APPS.armcare.ink}`}
      >
        {map.coverage.total === 0 ? '여기부터 해 보세요' : '2주째 안 한 곳'}:{' '}
        {map.gaps.map((key) => ARMCARE_AREAS.find((a) => a.key === key)?.label ?? key).join(' · ')}
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    ) : null;

  if (data.rehab) {
    return <AppCard app="armcare" status="재활 중이에요 · 오늘 재활 보기" />;
  }
  if (!data.hasCheckinToday) {
    return (
      <AppCard
        app="armcare"
        status="체크인을 남기면 오늘 루틴을 짜요"
        action={
          <OpenCheckinButton
            className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold text-white ${APPS.armcare.button}`}
          >
            체크인
          </OpenCheckinButton>
        }
      >
        {gapLine}
      </AppCard>
    );
  }
  if (data.decision.kind === 'rest') {
    return <AppCard app="armcare" tone="warn" status="오늘은 팔을 쉬는 날이에요" />;
  }
  if (!data.routine) {
    return (
      <AppCard app="armcare" status="오늘 루틴을 아직 안 만들었어요">
        {gapLine}
      </AppCard>
    );
  }
  const items = data.routine.items;
  const done = items.filter((it) => data.doneToday.has(it.exerciseId)).length;
  const label = ARMCARE_KIND_TEXT[data.routine.kind].label;
  if (items.length > 0 && done >= items.length) {
    return (
      <AppCard app="armcare" tone="done" status={`오늘 ${label}를 마쳤어요`}>
        {gapLine}
      </AppCard>
    );
  }
  return (
    <AppCard
      app="armcare"
      status={`${label} · ${items.length}개 · 약 ${data.routine.estimatedMinutes}분`}
      action={
        <StartLink
          app="armcare"
          href={`/armcare/play/today?d=${data.todayKey}`}
          label={done > 0 ? '이어서' : '시작'}
        />
      }
    >
      {gapLine}
    </AppCard>
  );
}

/** 메커니즘 — 고른 수준의 다음 세션과 12칸 진행(수준을 안 골랐으면 고르라고) */
async function MechanicsCard({ userId }: { userId: string }) {
  const { program, session, doneToday } = await loadMechanicsProgram(userId);
  if (!program?.level) {
    return <AppCard app="mechanics" status="수준을 골라 투구 메커니즘 프로그램을 시작해 보세요" />;
  }
  const level = mechanicsLevel(program.level);
  const done = new Set(program.finishedToday ? [] : doneToday);
  const started = session.some((s) => done.has(s.guideId));
  const completed = program.week == null;
  const bars = (
    <div className="grid grid-cols-12 gap-0.5" aria-label={`${level.name} ${program.total}번 중 ${program.index}번 마침`}>
      {Array.from({ length: program.total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full ${
            i < program.index ? APPS.mechanics.bar : i === program.index ? APPS.mechanics.barSoft : 'bg-surface-2'
          }`}
        />
      ))}
    </div>
  );
  return (
    <AppCard
      app="mechanics"
      tone={program.finishedToday || completed ? 'done' : 'normal'}
      status={
        completed
          ? `${level.name} 프로그램을 마쳤어요`
          : program.finishedToday
            ? '오늘 세션을 마쳤어요'
            : `${level.name} ${program.week}주차 ${program.day}번째 · 드릴 ${session.length}개 · 15~20분`
      }
      action={
        session.length > 0 ? (
          <StartLink
            app="mechanics"
            href="/mechanics/play"
            label={program.finishedToday ? '하나 더' : started ? '이어서' : '시작'}
          />
        ) : undefined
      }
    >
      {bars}
    </AppCard>
  );
}

/* ─────────────────────────────── 이번 주 ─────────────────────────────── */

/** 이번 주(월요일부터) 앱마다 한 날 · 번 수 */
async function WeekStrip({ userId, today }: { userId: string; today: Date }) {
  const todayKey = toDateKey(today);
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const monday = dbDate(shiftDateKey(todayKey, -((dow + 6) % 7)));

  const armcareIds = (await visibleExercises())
    .filter((ex) => ex.category === ARMCARE_CATEGORY)
    .map((ex) => ex.id);
  const [workouts, armcareLogs, drillLogs] = await Promise.all([
    prisma.trainingSession.count({
      where: { userId, status: 'FINISHED', date: { gte: monday } },
    }),
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: monday }, exerciseId: { in: armcareIds } },
      select: { date: true },
    }),
    prisma.userDrillLog.findMany({
      where: { userId, done: true, date: { gte: monday } },
      select: { date: true },
    }),
  ]);
  const days = (rows: { date: Date }[]) => new Set(rows.map((r) => keyOfDbDate(r.date))).size;

  const cells: { app: TrainingPart; value: number; unit: string }[] = [
    { app: 'today', value: workouts, unit: '번' },
    { app: 'armcare', value: days(armcareLogs), unit: '일' },
    { app: 'mechanics', value: days(drillLogs), unit: '일' },
  ];
  /*
   * 한 줄 요약 — 예전엔 똑같은 칸 셋('0번 · 0일 · 0일')이 나란했다. 대시보드 템플릿처럼 보였고, 다 0 인 주에는 큰 0 셋이
   * 먼저 눈에 들어왔다(2026-10-04 'AI 티 줄이기'). 한 줄 글로 쓰고, 아무것도 안 한 주는 그렇게 말한다.
   */
  const none = cells.every((c) => c.value === 0);
  return (
    <section className="rounded-2xl bg-surface px-(--block-pad) py-3.5 text-sm text-muted">
      <h2 className="sr-only">이번 주</h2>
      {none ? (
        '이번 주는 아직 기록이 없어요.'
      ) : (
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-semibold text-ink">이번 주</span>
          {cells.map((c) => (
            <span key={c.app}>
              {APPS[c.app].name}{' '}
              <span className="font-semibold tabular-nums text-ink">
                {c.value}
                {c.unit}
              </span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
