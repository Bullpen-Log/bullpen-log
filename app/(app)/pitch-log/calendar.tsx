'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export type DaySummary = {
  count: number;
  pitches: number;
  maxIntensity: number;
};

/** 로컬 시간대 기준 YYYY-MM-DD 문자열 */
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 강도에 따라 셀 배경 진하기를 다르게 준다. */
function intensityClass(intensity: number) {
  if (intensity >= 8) return 'bg-gold/70 text-ink';
  if (intensity >= 5) return 'bg-gold/40 text-cream';
  return 'bg-gold/15 text-cream';
}

export function PitchCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  summaries,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  selected: string;
  onSelect: (dateKey: string) => void;
  summaries: Record<string, DaySummary>;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const todayKey = toDateKey(new Date());

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-display text-2xl text-cream">
          {year}. {String(monthIndex + 1).padStart(2, '0')}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-gold hover:text-gold"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-gold hover:text-gold"
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
              i === 0 ? 'text-red-400/70' : i === 6 ? 'text-blue-400/70' : 'text-muted'
            }`}
          >
            {w}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;

          const key = toDateKey(new Date(year, monthIndex, day));
          const summary = summaries[key];
          const isSelected = key === selected;
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                isSelected
                  ? 'border-gold ring-1 ring-gold'
                  : 'border-transparent hover:border-line-strong'
              } ${
                summary
                  ? intensityClass(summary.maxIntensity)
                  : 'bg-surface-2 text-muted hover:text-cream'
              }`}
            >
              <span className={isToday ? 'font-bold underline underline-offset-4' : ''}>
                {day}
              </span>
              {summary && (
                <span className="max-w-full truncate px-0.5 text-[9px] leading-none opacity-80 sm:text-[10px]">
                  {summary.pitches}구
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-[11px] text-muted">
        <span>강도</span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-gold/15" /> 낮음
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-gold/40" /> 보통
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-gold/70" /> 높음
        </span>
      </div>
    </div>
  );
}
