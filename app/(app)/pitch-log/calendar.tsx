'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toDateKey } from '@/lib/pitch-stats';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export type DaySummary = {
  pitches: number;
  maxIntensity: number;
  hasVideo: boolean;
};

/** 강도에 따라 셀 배경 진하기를 다르게 준다. */
function intensityClass(intensity: number) {
  if (intensity >= 8) return 'bg-sky/70 text-white';
  if (intensity >= 5) return 'bg-sky/40 text-ink';
  return 'bg-sky/15 text-ink';
}

export function PitchCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  summaries,
  /** 영상이 있는 날만 강조하고 싶을 때 사용 (영상분석 화면) */
  videoOnly = false,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  selected: string;
  onSelect: (dateKey: string) => void;
  summaries: Record<string, DaySummary>;
  videoOnly?: boolean;
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

          const key = toDateKey(new Date(year, monthIndex, day));
          const summary = summaries[key];
          const marked = videoOnly ? summary?.hasVideo : Boolean(summary);
          const isSelected = key === selected;
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                isSelected
                  ? 'border-sky ring-1 ring-sky'
                  : 'border-transparent hover:border-line-strong'
              } ${
                marked && summary
                  ? intensityClass(summary.maxIntensity)
                  : 'bg-surface-2 text-muted hover:text-ink'
              }`}
            >
              <span className={isToday ? 'font-bold underline underline-offset-4' : ''}>
                {day}
              </span>
              {marked && summary && (
                <span className="max-w-full truncate px-0.5 text-[9px] leading-none opacity-80 sm:text-[10px]">
                  {videoOnly ? `영상 ${summary.hasVideo ? '●' : ''}` : `${summary.pitches}구`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-[11px] text-muted">
        {videoOnly ? (
          <span>영상이 있는 날만 표시됩니다</span>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
