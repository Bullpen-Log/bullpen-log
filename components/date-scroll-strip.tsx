'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@/components/icon';
import { haptic } from '@/lib/haptics';

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
/** 칸 폭(px) · 사이(px) — 가운데 맞추기 · 한 주씩 넘기기가 같이 쓴다 */
const CELL = 44;
const GAP = 4;

/**
 * 제목 밑 날짜 띠 — 최근 날들을 옆으로 굴리는 한 줄(영양 · 트레이닝 공용, 2026-10-15 사용자 "좌우로 긴 것 스크롤 가능하게").
 *
 * 처음 그릴 때와 고른 날이 바뀔 때 그 날을 가운데로 굴려 둔다(오늘이면 오른쪽 끝). 손가락으로 밀면 스크롤, 칸을 누르면 그날.
 * 달이 바뀌는 1일은 요일 대신 'N월'. 양끝이 옅어져 더 있다는 게 보인다(옅어지는 폭만큼 안쪽 여백 — 끝 칸 오늘이 흐려지지 않게). PC 는 양끝 화살표로 한 주씩(마우스로 옆 스크롤이 어려워서).
 * 가로로 넘치는 칸이라 탭 쓸기(components/tab-pager.tsx)는 이 위에서 시작한 손가락을 안 받는다.
 *
 * 칸 얼굴의 밑줄(막대 · 점)은 부르는 쪽이 그린다(mark) — 영양은 먹은 양 막대, 트레이닝은 한 것 점.
 * 오늘은 파란 테두리 + 굵은 숫자, 고른 날은 파란 채움(달력 둘과 같은 말, month-calendar todayMarkClass).
 * end = 띠 오른쪽 끝에 붙는 것(2026-10-16 — 제목 옆 달력을 여기 작은 아이콘으로 옮김).
 */
export function DateScrollStrip({
  days,
  date,
  today,
  hrefOf,
  labelOf,
  mark,
  end,
  className = '',
}: {
  /** 띠의 날들(오래된 → 최근, lib/date-strip.ts stripDays) */
  days: string[];
  /** 고른 날 */
  date: string;
  today: string;
  hrefOf: (day: string) => string;
  /** 화면 읽기 프로그램이 읽을 그날 한 줄(예: '먹은 1,240kcal') */
  labelOf: (day: string) => string;
  /** 칸 밑 표시 — 고른 칸이면 흰색으로 그려 달라고 selected 를 준다 */
  mark: (day: string, selected: boolean) => ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLOListElement>(null);
  const first = days[0];

  /* 고른 날을 가운데로 — 그리기 전에 맞춰 두어야 오른쪽 끝에서 미끄러져 오는 게 안 보인다 */
  useLayoutEffect(() => {
    const el = scroller.current;
    const cell = el?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!el || !cell) return;
    /* 띠 안 자리는 화면 자리 차로 잰다 — offsetLeft 는 판 넘기기 트랙 기준이라 옆 판에서는 판 폭만큼 어긋났다 */
    const left = cell.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = left - (el.clientWidth - cell.offsetWidth) / 2;
  }, [date, first]);

  const page = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * 7 * (CELL + GAP), behavior: 'smooth' });
  const edge =
    'hidden w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink desk:flex';

  return (
    <nav aria-label="날짜" className={`flex min-w-0 items-stretch gap-1 ${className}`}>
      <button type="button" aria-label="이전 날들" onClick={() => page(-1)} className={edge}>
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </button>
      <ol
        ref={scroller}
        className="no-scrollbar flex min-w-0 flex-1 snap-x scroll-px-3 gap-1 overflow-x-auto overscroll-x-contain px-3 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
      >
        {days.map((d) => {
          const selected = d === date;
          const isToday = d === today;
          const [, m, dayNo] = d.split('-').map(Number);
          const weekday = WEEKDAY_SHORT[new Date(`${d}T00:00:00.000Z`).getUTCDay()];
          return (
            <li key={d} className="w-11 shrink-0 snap-center">
              <Link
                href={hrefOf(d)}
                scroll={false}
                data-nav="none"
                onClick={() => {
                  if (!selected) haptic('selection');
                }}
                aria-current={selected ? 'date' : undefined}
                aria-label={`${m}월 ${dayNo}일 ${weekday}요일, ${labelOf(d)}`}
                className={`flex flex-col items-center rounded-xl py-1.5 transition-[background-color,transform] duration-200 motion-safe:active:scale-95 ${
                  selected
                    ? 'bg-sky shadow-sm'
                    : isToday
                      ? 'ring-[1.5px] ring-inset ring-sky hover:bg-surface-2'
                      : 'hover:bg-surface-2'
                }`}
              >
                <span
                  className={`text-caption ${
                    selected ? 'text-white/80' : dayNo === 1 ? 'font-semibold text-sky' : 'text-muted'
                  }`}
                >
                  {dayNo === 1 ? `${m}월` : weekday}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    selected ? 'text-white' : isToday ? 'font-bold text-sky' : 'text-ink'
                  }`}
                >
                  {dayNo}
                </span>
                {mark(d, selected)}
              </Link>
            </li>
          );
        })}
      </ol>
      <button type="button" aria-label="다음 날들" onClick={() => page(1)} className={edge}>
        <ChevronRight aria-hidden className="h-4 w-4" />
      </button>
      {end && <div className="flex shrink-0 items-center">{end}</div>}
    </nav>
  );
}
