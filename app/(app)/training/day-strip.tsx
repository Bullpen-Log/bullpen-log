'use client';

import { DateScrollStrip } from '@/components/date-scroll-strip';
import { trainingDayHref } from '@/lib/training-part';
import type { TrainingStripDay } from '@/lib/training-week';

/** 점 셋 — 앱 카드와 같은 색(globals.css --color-app-*) */
const DOTS: { key: 'workout' | 'armcare' | 'drill'; name: string; color: string }[] = [
  { key: 'workout', name: '운동', color: 'bg-app-training' },
  { key: 'armcare', name: '암케어', color: 'bg-app-armcare' },
  { key: 'drill', name: '메커니즘', color: 'bg-app-mechanics' },
];

/**
 * 트레이닝 날짜 띠 — 영양 탭 제목 밑의 날짜 띠와 같은 한 줄(components/date-scroll-strip.tsx, 2026-10-15 사용자 "둘 다").
 *
 * 최근 6주를 옆으로 굴린다. 칸 밑의 점은 그날 한 것(운동 · 암케어 · 메커니즘). 칸을 누르면 그날 기록, 오늘은 트레이닝 홈.
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
  const byDate = new Map(days.map((d) => [d.date, d]));
  const doneOf = (day: string) => {
    const d = byDate.get(day);
    return d ? DOTS.filter((x) => d[x.key]) : [];
  };
  return (
    <DateScrollStrip
      days={days.map((d) => d.date)}
      date={date}
      today={today}
      hrefOf={(d) => trainingDayHref(d, today)}
      labelOf={(d) => {
        const done = doneOf(d);
        return done.length ? done.map((x) => x.name).join(' · ') : '기록 없음';
      }}
      mark={(d, selected) => (
        <span aria-hidden className="mt-1 flex h-1.5 items-center gap-0.5">
          {doneOf(d).map((x) => (
            <span
              key={x.key}
              className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : x.color}`}
            />
          ))}
        </span>
      )}
    />
  );
}
