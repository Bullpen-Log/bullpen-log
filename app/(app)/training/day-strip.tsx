'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight } from '@/components/icon';
import { shiftDateKey } from '@/lib/pitch-stats';
import { TRAINING_HOME_HREF } from '@/lib/training-part';
import type { TrainingStripDay } from '@/lib/training-week';

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
/** 얼마나 뒤까지 넘겨 볼 수 있나 — 그 앞은 홈 캘린더에서 */
const BACK_DAYS = 365;

/** 오늘은 트레이닝 홈, 지난날은 그날 운동 기록 */
const hrefOf = (d: string, today: string) =>
  d === today ? TRAINING_HOME_HREF : `/training/day/${d}`;

/** 점 셋 — 앱 카드와 같은 색(globals.css --color-app-*) */
const DOTS: { key: 'workout' | 'armcare' | 'drill'; name: string; color: string }[] = [
  { key: 'workout', name: '운동', color: 'bg-app-training' },
  { key: 'armcare', name: '암케어', color: 'bg-app-armcare' },
  { key: 'drill', name: '메커니즘', color: 'bg-app-mechanics' },
];

/**
 * 트레이닝 날짜 띠 — 영양 탭 제목 밑의 날짜 띠와 같은 모양 · 같은 몸짓(2026-10-15 사용자 "둘 다 추가").
 *
 * 고른 날이 든 한 주(일~토). 칸 밑의 점은 그날 한 것(운동 · 암케어 · 메커니즘). 칸을 누르면 그날 기록, 양끝 겹화살표 ·
 * 휴대폰은 옆으로 밀면 한 주씩. 오늘은 트레이닝 홈이다.
 */
export function TrainingDayStrip({
  days,
  date,
  today,
}: {
  days: TrainingStripDay[];
  /** 고른 날(홈이면 오늘) */
  date: string;
  today: string;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const back = shiftDateKey(date, -7);
  const prevWeek = back >= shiftDateKey(today, -BACK_DAYS) ? back : null;
  /* 다음 주가 아직 안 왔으면 오늘로 — 오늘이 이 띠에 없을 때만 */
  const ahead = shiftDateKey(date, 7);
  const nextWeek =
    ahead <= today ? ahead : days.some((d) => d.date === today) ? null : today;

  const go = (d: string | null) => {
    if (d) router.push(hrefOf(d, today), { scroll: false });
  };
  const edge =
    'flex w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink';
  const cell =
    'flex flex-col items-center rounded-xl py-1.5 transition-[background-color,transform] duration-200 motion-safe:active:scale-95';

  return (
    <nav
      aria-label="날짜"
      data-no-swipe
      className="flex touch-pan-y items-stretch gap-1 sm:max-w-xl"
      onPointerDown={(e) => {
        swiped.current = false;
        start.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(e.clientY - s.y) < 40) {
          swiped.current = true;
          go(dx > 0 ? prevWeek : nextWeek);
        }
      }}
      /* 밀었을 때는 손가락이 떨어진 칸이 눌린 것으로 치지 않는다 */
      onClickCapture={(e) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {prevWeek ? (
        <Link href={hrefOf(prevWeek, today)} scroll={false} data-nav="none" aria-label="한 주 전" className={edge}>
          <ChevronsLeft aria-hidden className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${edge} opacity-30`}>
          <ChevronsLeft className="h-4 w-4" />
        </span>
      )}

      <ol className="grid flex-1 grid-cols-7 gap-1">
        {days.map((d) => {
          const future = d.date > today;
          const selected = d.date === date;
          const isToday = d.date === today;
          const [, m, dayNo] = d.date.split('-').map(Number);
          const weekday = WEEKDAY_SHORT[new Date(`${d.date}T00:00:00.000Z`).getUTCDay()];
          const done = DOTS.filter((x) => d[x.key]);
          const face = (
            <>
              <span className={`text-caption ${selected ? 'text-white/80' : 'text-muted'}`}>{weekday}</span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  selected ? 'text-white' : isToday ? 'text-sky' : 'text-ink'
                }`}
              >
                {dayNo}
              </span>
              <span aria-hidden className="mt-1 flex h-1.5 items-center gap-0.5">
                {done.map((x) => (
                  <span
                    key={x.key}
                    className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : x.color}`}
                  />
                ))}
              </span>
            </>
          );
          return (
            <li key={d.date}>
              {future ? (
                <span aria-disabled className={`${cell} opacity-35`}>
                  {face}
                </span>
              ) : (
                <Link
                  href={hrefOf(d.date, today)}
                  scroll={false}
                  data-nav="none"
                  aria-current={selected ? 'date' : undefined}
                  aria-label={`${m}월 ${dayNo}일 ${weekday}요일, ${
                    done.length ? done.map((x) => x.name).join(' · ') : '기록 없음'
                  }`}
                  className={`${cell} ${
                    selected
                      ? 'bg-sky shadow-sm'
                      : isToday
                        ? 'ring-1 ring-sky/40 hover:bg-surface-2'
                        : 'hover:bg-surface-2'
                  }`}
                >
                  {face}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {nextWeek ? (
        <Link
          href={hrefOf(nextWeek, today)}
          scroll={false}
          data-nav="none"
          aria-label={nextWeek === today ? '오늘로' : '한 주 뒤'}
          className={edge}
        >
          <ChevronsRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-hidden className={`${edge} opacity-30`}>
          <ChevronsRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
