'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKeyOf, toDateKey } from '@/lib/pitch-stats';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export type DaySummary = {
  pitches: number;
  maxIntensity: number;
  hasVideo: boolean;
  /** 그날 기록이 전부 '쉬는 날'인가 — 던진 날과 다르게 보여야 한다 */
  rested: boolean;
};

/** 강도에 따라 셀 배경 진하기를 다르게 준다. */
function intensityClass(intensity: number) {
  if (intensity >= 8) return 'bg-sky/70 text-white';
  if (intensity >= 5) return 'bg-sky/40 text-ink';
  return 'bg-sky/15 text-ink';
}

/*
 * 쉬는 날은 색을 채우지 않고 테두리만 준다.
 *
 * '안 던진 날'과 '아직 아무것도 안 남긴 날'은 전혀 다른 뜻인데, 둘 다 빈칸이면
 * 구별이 안 된다. 기록률이 이 앱에서 가장 값어치 있는 것이라, 남겼다는 사실
 * 자체가 눈에 보여야 한다.
 */
const RESTED_CLASS = 'border-dashed border-line-strong bg-surface-2 text-muted';

export function PitchCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  summaries,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  /** 지금 열려 있는 날짜. 창을 닫으면 null 이라 아무 데도 표시가 안 남는다. */
  selected: string | null;
  onSelect: (dateKey: string) => void;
  summaries: Record<string, DaySummary>;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();
  const todayKey = toDateKey(new Date());

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-display text-2xl text-ink">
          {year}. {String(monthIndex + 1).padStart(2, '0')}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`pb-1 text-center text-[11px] font-medium ${
              i === 0 ? 'text-red-600/70' : i === 6 ? 'text-blue-400/70' : 'text-muted'
            }`}
          >
            {w}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;

          const key = dateKeyOf(year, monthIndex, day);
          const summary = summaries[key];
          const marked = Boolean(summary);
          const isSelected = key === selected;
          const isToday = key === todayKey;

          /*
           * 화면에는 숫자만 보이지만, 눈으로 보지 않는 사람에게는
           * 며칠인지·그날 뭐가 있었는지가 들려야 고를 수 있다.
           */
          const spoken = [
            `${monthIndex + 1}월 ${day}일`,
            isToday ? '오늘' : null,
            summary
              ? summary.rested
                ? '쉬는 날로 남김'
                : `${summary.pitches}구`
              : '기록 없음',
            summary?.hasVideo ? '영상 있음' : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={spoken}
              aria-pressed={isSelected}
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors sm:min-h-[4.5rem] ${
                isSelected
                  ? 'border-sky ring-1 ring-sky'
                  : summary?.rested
                    ? RESTED_CLASS
                    : 'border-transparent hover:border-line-strong'
              } ${
                marked && summary && !summary.rested
                  ? intensityClass(summary.maxIntensity)
                  : marked
                    ? ''
                    : 'bg-surface-2 text-muted hover:text-ink'
              }`}
            >
              <span
                className={
                  isToday ? 'font-bold underline underline-offset-4' : 'font-medium'
                }
              >
                {day}
              </span>
              {marked && summary && (
                <span className="max-w-full truncate px-0.5 text-[10px] leading-none opacity-80 sm:text-[11px]">
                  {summary.rested ? '휴식' : `${summary.pitches}구`}
                </span>
              )}
              {/* 달력이 영상으로 가는 유일한 입구가 되었으니, 어느 날에
                  영상이 있는지 한눈에 보여야 한다. 읽어주는 이름에도 들어간다. */}
              {summary?.hasVideo && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-strong ring-1 ring-surface"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-[11px] text-muted">
        <span>강도</span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-sky/15" /> 낮음
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-sky/40" /> 보통
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-sky/70" /> 높음
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded border border-dashed border-line-strong" />{' '}
          쉬는 날
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-strong" /> 영상
        </span>
      </div>
    </div>
  );
}
