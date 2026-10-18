import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { Check, ChevronRight, Dumbbell, Play, ShieldPlus, Target, type LucideIcon } from '@/components/icon';
import { PAGE_TITLE_LINE } from '@/components/ui';
import { NavTitle } from '@/components/nav-title';
import { AnalysisLink } from '@/components/analysis-link';
import { OpenCheckinButton } from '@/components/notice-bell';
import {
  armcareCardData,
  mechanicsCardData,
  workoutCardData,
  type HomeUser,
  type TrainingCard,
} from '@/lib/report/training-home-data';
import { DrillThrowNoteCard } from './drill-throw-note';
import { toDateKey } from '@/lib/pitch-stats';
import { TRAINING_PART_HREF, type TrainingPart } from '@/lib/training-part';
import { StartWorkout } from './start-workout';
import { TrainingDayStrip } from './day-strip';
import { loadTrainingStrip } from '@/lib/training-week';
import { loadTrainingWeekCounts } from '@/lib/report/training-week-counts';

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
      {/*
        제목 · 분석을 한 줄에 — 영양 탭 머리(nutrition-view.tsx)와 같은 모양. 간이 달력은 밑 날짜 띠 끝 그림으로 옮겼다(2026-10-16).
        큰 제목이 가려지면 위 막대에 작은 제목(NavTitle) — PageHeading 과 같다.
      */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-3 pb-1 desk:items-end desk:pb-4 sm:gap-x-3">
        <div className="space-y-1">
          <h1 className={`text-heading page-title text-ink ${PAGE_TITLE_LINE}`}>트레이닝</h1>
          <NavTitle title="트레이닝" />
        </div>
        <div className="ml-auto">
          <AnalysisLink view="training" />
        </div>
      </header>
      {/* 제목 밑 날짜 띠(2026-10-15 사용자 — 영양과 같게). 칸 높이만큼 자리를 잡아 두어 카드가 밀려 내려가지 않는다 */}
      <Suspense fallback={<div className="h-15 desk:h-[3.375rem]" />}>
        <DayStripLoad userId={user.id} today={toDateKey(today)} />
      </Suspense>
      <div className="stack-block pad:grid pad:grid-cols-2 pad:min-[60rem]:grid-cols-3 pad:items-stretch pad:gap-(--gap-block) pad:[&>*]:mb-0!">{order.map((app) => cards[app])}</div>
      <Suspense fallback={<div className="h-12" />}>
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
    name: '오늘 운동',
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
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[28%] text-white ${a.button}`}>
      <Icon aria-hidden className="h-6 w-6" />
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

/*
 * 카드 셋의 판정(무엇을 보일지)은 lib/report/training-home-data.ts — 아이폰 앱 트레이닝 탭(app.loadAppTraining)과 같이 쓴다. 여기서는 그리기만.
 */
async function WorkoutCard({ user, today }: { user: HomeUser; today: Date }) {
  return <CardView card={await workoutCardData(user, today)} />;
}
async function ArmcareCard({ user, today }: { user: HomeUser; today: Date }) {
  return <CardView card={await armcareCardData(user, today)} />;
}
async function MechanicsCard({ userId }: { userId: string }) {
  return <CardView card={await mechanicsCardData(userId)} />;
}

function CardView({ card }: { card: TrainingCard }) {
  const { app, action } = card;
  const button =
    action?.kind === 'workout' ? (
      <StartWorkout compact program={action.program} resume={action.resume} />
    ) : action?.kind === 'link' ? (
      <StartLink app={app} href={action.href} label={action.label} />
    ) : action?.kind === 'checkin' ? (
      <OpenCheckinButton
        className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold text-white ${APPS[app].button}`}
      >
        {action.label}
      </OpenCheckinButton>
    ) : undefined;
  const bars = card.bars ? (
    <div className="grid grid-cols-12 gap-0.5" aria-label={card.bars.label}>
      {Array.from({ length: card.bars.total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full ${
            i < card.bars!.index ? APPS[app].bar : i === card.bars!.index ? APPS[app].barSoft : 'bg-surface-2'
          }`}
        />
      ))}
    </div>
  ) : null;
  const gap = card.gap ? (
    <Link
      href={card.gap.href}
      className={`relative z-10 -my-1 inline-flex min-h-10 items-center gap-0.5 text-xs font-semibold ${APPS[app].ink}`}
    >
      {card.gap.text}
      <ChevronRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  ) : null;
  /* 드릴로 던진 공을 투구 기록에 남기라는 한 줄(2026-10-16) — 남기거나 닫으면 사라진다 */
  const throwLine = card.throwNote ? <DrillThrowNoteCard note={card.throwNote} className="mt-3" /> : null;
  const below = bars || gap || throwLine ? (
    <>
      {bars}
      {gap}
      {throwLine}
    </>
  ) : undefined;
  /* 수준을 안 고른 메커니즘 카드는 예전처럼 드릴 한 줄만 밑에 따로(카드 밖) — 같은 자리라 그대로 안에 둔다 */
  return (
    <AppCard app={app} tone={card.tone} status={card.status} action={button}>
      {below}
    </AppCard>
  );
}

/* ─────────────────────────────── 날짜 띠 ─────────────────────────────── */

async function DayStripLoad({ userId, today }: { userId: string; today: string }) {
  const days = await loadTrainingStrip(userId, today, today);
  return <TrainingDayStrip days={days} date={today} today={today} />;
}

/* ─────────────────────────────── 이번 주 ─────────────────────────────── */

/** 이번 주(월요일부터) 앱마다 한 날 수 — 셋 다 '일'(2026-10-16 디자인 점검 — 운동만 '번'이라 단위가 섞였다) */
async function WeekStrip({ userId, today }: { userId: string; today: Date }) {
  /* 셈은 앱 트레이닝 탭과 같은 곳(lib/report/training-week-counts.ts) */
  const week = await loadTrainingWeekCounts(userId, today);

  const cells: { app: TrainingPart; value: number; unit: string }[] = [
    { app: 'today', value: week.today, unit: '일' },
    { app: 'armcare', value: week.armcare, unit: '일' },
    { app: 'mechanics', value: week.mechanics, unit: '일' },
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
              {/* 카드 이름 '오늘 운동'은 한 주 줄에 안 맞아 '운동'으로 */}
              {c.app === 'today' ? '운동' : APPS[c.app].name}{' '}
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
