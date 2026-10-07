import type { ReactNode } from 'react';
import Link from 'next/link';
import { Check, HeartPulse, type LucideIcon } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import type { requireUser } from '@/lib/dal';
import { loadDayDetailCached } from '@/lib/day-detail';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';
import { dbDate } from '@/lib/nutrition/days';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { NAV_ICONS } from '@/components/nav-icons';
import { OpenCheckinButton } from '@/components/notice-bell';
import { Card } from '@/components/ui';

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
 *
 * 할 일 알림(종)은 '남은 것'을, 이 카드는 '한 만큼'을 보여 준다.
 */
export async function TodayRings({
  user,
  today,
  footer,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  /** 오늘 'YYYY-MM-DD'(한국 시각) */
  today: string;
  /** 링 밑 한 줄 — 따로 기다리는 것이라 홈이 Suspense 로 감싸 넘긴다 */
  footer?: ReactNode;
}) {
  const [detail, logs, advice] = await Promise.all([
    loadDayDetailCached(user, today),
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: dbDate(today) },
      select: { sessionType: true, pitchCount: true },
    }),
    loadAdvice(user, today, today, serviceHour(now())),
  ]);

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
      caption: logs.length === 0 ? '남기기' : rested ? '휴식' : `${pitches}구`,
      href: `/pitch-log/${today}`,
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
      value:
        advice.score !== null
          ? advice.score / 100
          : target.kcal > 0
            ? kcal / target.kcal
            : 0,
      caption:
        advice.score !== null
          ? `균형 ${advice.score}`
          : kcal > 0
            ? `${kcal.toLocaleString('ko-KR')}kcal`
            : '남기기',
      href: '/nutrition',
    },
  ];

  return (
    <RingsCard items={items} checkinDone={detail.checkin != null} footer={footer} />
  );
}

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다(홈 page.tsx 와 같다) */
function now() {
  return new Date();
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
  footer,
}: {
  items: RingItem[];
  checkinDone: boolean;
  /** 링 밑 한 줄 — 오늘 투구 안내(홈 page.tsx 의 PlanLine) */
  footer?: ReactNode;
}) {
  return (
    <Card className="px-2 desk:px-(--block-pad)">
      <div className="grid grid-cols-4 gap-1">
        {items.map((it) => {
          const face = (
            <>
              <Ring value={it.value} icon={it.icon} />
              <span className="mt-2 text-[13px] font-semibold text-ink">
                {it.label}
              </span>
              <span
                className={`mt-0.5 max-w-full truncate text-xs tabular-nums ${
                  it.value >= 1 ? 'font-semibold text-sky' : 'text-muted'
                }`}
              >
                {it.caption}
              </span>
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
      {footer}
    </Card>
  );
}

/**
 * 링 하나 — 오늘 한 만큼 찬다(처음 보일 때 0 에서 차오른다, globals.css 'ring-grow'). 다 차면 가운데 아이콘이
 * 체크가 되어 파래진다. 넘쳐도(영양 120%) 링은 한 바퀴까지만.
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
            strokeDashoffset={100 - pct}
            className="ring-grow stroke-sky"
          />
        )}
      </svg>
      {full ? (
        <Check aria-hidden className="h-6 w-6 text-sky" strokeWidth={3} />
      ) : (
        <Icon aria-hidden className="h-5 w-5 text-muted" />
      )}
    </span>
  );
}
