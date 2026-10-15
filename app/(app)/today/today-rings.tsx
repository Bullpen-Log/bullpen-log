import { appNow } from '@/lib/clock';
import Link from 'next/link';
import { Check, HeartPulse, type LucideIcon } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { loadDayDetailCached } from '@/lib/day-detail';
import { SETUP_PATH } from '@/lib/feature-locks';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { dbDate } from '@/lib/nutrition/days';
import { parsePlanItems } from '@/lib/nutrition/meal-plan';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { NAV_ICONS } from '@/components/nav-icons';
import { OpenCheckinButton } from '@/components/notice-bell';
import { Card } from '@/components/ui';
import { RingsStage } from './all-done';

/**
 * 홈 맨 위 '오늘' — 체크인 · 투구 · 운동 · 영양을 링 넷으로 한눈에.
 *
 * 아이폰 피트니스의 활동 링처럼 오늘 한 만큼 링이 찬다(2026-10-01 사용자 '애플처럼 감성있게'). 색은 하나(sky) —
 * 링마다 색을 달리하면 구별이 안 된다는 사용자 규칙(그림은 색 적게)이라, 다 찬 링만 가운데 아이콘이 파래진다.
 *
 * - 체크인 · 투구는 했나 안 했나(링이 비거나 가득). 투구는 쉬는 날로 남긴 것도 한 것이다.
 * - 운동은 오늘 일정 가운데 체크한 수, 영양은 오늘의 균형 점수(lib/nutrition/advice.ts — 음식을 적었거나 체크인에 식사를
 *   적은 날)이고, 아무것도 안 적은 날은 예전처럼 목표 칼로리 가운데 먹은 만큼(달력 밑 그날 칸이 쓰는 lib/day-detail.ts).
 * - 링을 누르면 그 일을 하는 곳으로 — 체크인은 그 자리에서 창, 투구는 오늘 기록 창, 운동 · 영양은 그 탭.
 *   투구 기록이 잠겨 있으면(첫 설정 전, lib/feature-locks.ts) 투구 링은 첫 설정 화면으로 — 기록 창이 어차피 거기로
 *   보내므로 한 번 덜 튄다. 운동 · 영양 링은 그 탭이 스스로 보낸다.
 *
 * 할 일 알림(종)은 '남은 것'을, 이 카드는 '한 만큼'을 보여 준다.
 */
export async function TodayRings({
  user,
  today,
  pitchLocked = false,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  /** 오늘 'YYYY-MM-DD'(한국 시각) */
  today: string;
  /** 투구 기록이 잠겨 있다(첫 설정 전) — 투구 링이 설정 화면으로 간다 */
  pitchLocked?: boolean;
}) {
  const [detail, logs, advice, mealPlan] = await Promise.all([
    loadDayDetailCached(user, today),
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: dbDate(today) },
      select: { sessionType: true, pitchCount: true },
    }),
    loadAdvice(user, today, today, serviceHour(now())),
    /* 오늘 식단 계획(영양 탭 '식단 짜기') — 짜 두기만 해도 영양 링이 찬다(2026-10-13 사용자) */
    prisma.mealPlan.findUnique({
      where: { userId_date: { userId: user.id, date: dbDate(today) } },
      select: { items: true },
    }),
  ]);
  const planned = mealPlan != null && parsePlanItems(mealPlan.items).length > 0;

  const exercises = detail.training.exercises;
  const doneCount = exercises.filter((e) => e.done).length;
  const rested =
    logs.length > 0 && logs.every((l) => l.sessionType === REST_SESSION_TYPE);
  const pitches = logs.reduce((n, l) => n + l.pitchCount, 0);
  const { kcal, target } = detail.nutrition;

  const items: RingItem[] = [
    {
      key: 'checkin',
      label: '체크인',
      icon: HeartPulse,
      value: detail.checkin ? 1 : 0,
      caption: detail.checkin ? `컨디션 ${detail.checkin.condition}` : '남기기',
    },
    {
      key: 'pitch',
      label: '투구',
      icon: NAV_ICONS.baseball,
      value: logs.length > 0 ? 1 : 0,
      caption:
        logs.length === 0
          ? pitchLocked
            ? '설정하기'
            : '남기기'
          : rested
            ? '휴식'
            : `${pitches}구`,
      href: pitchLocked ? SETUP_PATH.pitch : `/pitch-log/${today}`,
    },
    {
      key: 'training',
      label: '운동',
      icon: NAV_ICONS.dumbbell,
      value: exercises.length > 0 ? doneCount / exercises.length : 0,
      caption: exercises.length > 0 ? `${doneCount}/${exercises.length}` : '일정 없음',
      href: '/training',
    },
    {
      key: 'nutrition',
      label: '영양',
      icon: NAV_ICONS.utensils,
      /* 오늘 식단 계획을 짜 두었으면 다 찬 것 — 아니면 예전처럼 균형 점수 · 먹은 칼로리 */
      value: planned
        ? 1
        : advice.score !== null
          ? advice.score / 100
          : target.kcal > 0
            ? kcal / target.kcal
            : 0,
      caption: planned
        ? '계획 완료'
        : advice.score !== null
          ? `균형 ${advice.score}`
          : kcal > 0
            ? `${kcal.toLocaleString('ko-KR')}kcal`
            : '남기기',
      href: '/nutrition',
    },
  ];

  return (
    <RingsCard
      items={items}
      checkinDone={detail.checkin != null}
      day={today}
    />
  );
}

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다(홈 page.tsx 와 같다) */
function now() {
  return appNow();
}

/** 링 하나의 내용 */
export type RingItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 0~1 — 넘쳐도 링은 한 바퀴까지 */
  value: number;
  /** 링 밑 한 줄 — '42구' · '3/6' · '남기기' */
  caption: string;
  /** 누르면 갈 곳. 없으면 체크인 창을 연다 */
  href?: string;
};

/** 링 넷 카드 — 그리기만(숫자는 TodayRings 가 모은다) */
export function RingsCard({
  items,
  checkinDone,
  day,
}: {
  items: RingItem[];
  checkinDone: boolean;
  /** 오늘(YYYY-MM-DD) — 넷이 다 찬 날의 축하가 하루 한 번(all-done.tsx). 없으면 축하 안 함 */
  day?: string;
}) {
  return (
    <Card className="px-2 desk:px-(--block-pad) pad:flex pad:flex-col pad:justify-center">
      {/* 넷이 다 차면 축하(웹은 카드 안에서 링이 위로 빠지고 체크, 앱은 화면 가운데) — all-done.tsx */}
      <RingsStage
        allDone={day != null && items.every((it) => it.value >= 1)}
        day={day ?? ''}
      >
        <div className="grid grid-cols-4 gap-1">
          {items.map((it) => {
            const face = (
              <>
                <Ring value={it.value} icon={it.icon} />
                <span className="mt-2 text-footnote font-semibold text-ink">
                  {it.label}
                </span>
                {/* 링 밑 작은 글(컨디션 7 · 40구 · 3/5 · 균형 80)은 뺐다(2026-10-13 김민 "완료 표시 밑 한 줄 다 없애") — 화면 읽기 글(aria-label)에만 남김 */}
              </>
            );
            const cls =
              'flex min-w-0 flex-col items-center rounded-2xl py-1 transition-opacity hover:opacity-80';
            return it.href ? (
              <Link
                key={it.key}
                href={it.href}
                className={cls}
                aria-label={`${it.label} ${it.caption}`}
              >
                {face}
              </Link>
            ) : (
              <OpenCheckinButton key={it.key} className={cls}>
                {face}
                <span className="sr-only">
                  {checkinDone ? ', 고치기' : ', 지금 남기기'}
                </span>
              </OpenCheckinButton>
            );
          })}
        </div>
      </RingsStage>
    </Card>
  );
}

/**
 * 링 하나 — 오늘 한 만큼 찬다(처음 보일 때 0 에서 차오른다, globals.css 'ring-grow'). 넘쳐도(영양 120%) 링은 한 바퀴까지만.
 *
 * 다 차면 체크인 완료 화면과 같은 움직임(2026-10-13 사용자: "체크인 끝에 나오는 가운데 체크처럼") — 링이 한 바퀴 그려지고
 * (done-ring 0.7초) 그 끝에 가운데가 파랗게 차며 흰 체크가 톡 뜬다(finish-pop · done-check). 움직임 줄이기면 처음부터 다 보인다.
 */
function Ring({ value, icon: Icon }: { value: number; icon: LucideIcon }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const full = pct >= 100;
  return (
    <span className="relative grid h-16 w-16 place-items-center desk:h-14 desk:w-14">
      <svg aria-hidden viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          strokeWidth="7"
          className="stroke-ink/8"
        />
        {pct > 0 && (
          <circle
            cx="32"
            cy="32"
            r="27"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={full ? undefined : 100 - pct}
            className={full ? 'done-ring stroke-sky' : 'ring-grow stroke-sky'}
          />
        )}
      </svg>
      {full ? (
        <span
          aria-hidden
          className="finish-pop done-check absolute inset-[22%] grid place-items-center rounded-full bg-sky text-white"
        >
          <Check className="h-5 w-5 desk:h-4 desk:w-4" />
        </span>
      ) : (
        <Icon aria-hidden className="h-5 w-5 text-muted" />
      )}
    </span>
  );
}
