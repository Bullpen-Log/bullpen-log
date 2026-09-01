'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKeyOf, toDateKey } from '@/lib/pitch-stats';

/**
 * 한 달 달력.
 *
 * 투구 일지와 트레이닝이 함께 쓴다. 둘 다 "언제 무엇을 했는지 한눈에 보고,
 * 날짜를 눌러 그날을 연다"가 하는 일이라 달력을 두 벌 두면 한쪽만 고쳐진다.
 *
 * 날마다 무엇을 칠할지는 부르는 쪽이 정한다(marks). 이 파일은 날짜를 늘어놓고
 * 누른 날을 알려주는 일까지만 한다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export type DayMark = {
  /**
   * 칸 색을 정하는 값 1~10.
   *
   * null 이면 색을 채우지 않고 점선 테두리만 준다 — "남겼는데 강도랄 것이
   * 없는 날"(쉬는 날, 강도를 안 적은 날)이다. 아무것도 안 남긴 날과는 다르다.
   */
  intensity: number | null;
  /** 칸에 적는 짧은 말 — '20구', '6개', '휴식' */
  label: string;
  /** 오른쪽 위 작은 점 — 영상이나 메모가 있는 날 */
  dot?: boolean;
  /** 화면 낭독기가 읽을 말. 숫자만 보이면 눈으로 안 보는 사람은 고를 수 없다. */
  spoken: string;
};

/** 강도에 따라 칸 배경 진하기를 다르게 준다. */
function intensityClass(intensity: number) {
  if (intensity >= 8) return 'bg-sky/70 text-white';
  if (intensity >= 5) return 'bg-sky/40 text-ink';
  return 'bg-sky/15 text-ink';
}

/** 색을 안 채우는 날 — 남긴 것은 있다는 뜻으로 점선만 준다. */
const OUTLINE_CLASS = 'border-dashed border-line-strong bg-surface-2 text-muted';

export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  marks,
  children,
}: {
  month: Date;
  /**
   * 달을 옮긴다. 바뀔 값이 아니라 '바꾸는 방법'을 넘긴다.
   *
   * 예전에는 눌린 순간의 달에서 계산한 Date 를 그대로 넘겼다. 그러면 화면이
   * 다시 그려지기 전에 여러 번 누른 클릭이 전부 같은 값을 계산한다 — 1년 전으로
   * 가려고 화살표를 연타하면 한 달만 갔다. 실제로 빠르게 세 번 눌러도 한 달만
   * 움직였다.
   *
   * 지금 값에서 계산하게 하면 눌린 만큼 정확히 옮겨진다.
   */
  onMonthChange: (update: (prev: Date) => Date) => void;
  /** 지금 열려 있는 날짜. 아무것도 안 열었으면 null */
  selected: string | null;
  onSelect: (dateKey: string) => void;
  /** 날짜(YYYY-MM-DD)마다 무엇을 칠할지 */
  marks: Record<string, DayMark>;
  /** 달력 아래 범례 */
  children?: ReactNode;
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
            onClick={() =>
              onMonthChange(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
              )
            }
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() =>
              onMonthChange(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
              )
            }
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
          const mark = marks[key];
          const isSelected = key === selected;
          const isToday = key === todayKey;
          /*
           * 아직 안 온 날.
           *
           * 투구도 운동도 지나간 일을 적는 곳이라 앞날에는 남길 수 없다. 그런데
           * 예전에는 앞날 칸이 '기록 없는 지난 날'과 똑같이 회색으로 열려 있어서,
           * 눌러서 "앞으로 올 날짜에는 기록할 수 없습니다"를 봐야 알았다.
           * 누르고 나서 알려주는 것과 보면 아는 것은 다르다.
           */
          const isFuture = key > todayKey;

          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(key)}
              aria-label={
                isFuture
                  ? `${monthIndex + 1}월 ${day}일, 아직 오지 않은 날`
                  : mark
                    ? `${monthIndex + 1}월 ${day}일, ${mark.spoken}`
                    : `${monthIndex + 1}월 ${day}일${isToday ? ', 오늘' : ''}, 기록 없음`
              }
              aria-pressed={isSelected}
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors sm:min-h-[4.5rem] ${
                isFuture
                  ? 'cursor-default border-transparent bg-transparent text-muted/35'
                  : isSelected
                    ? 'border-sky ring-1 ring-sky'
                    : mark && mark.intensity == null
                      ? OUTLINE_CLASS
                      : 'border-transparent hover:border-line-strong'
              } ${
                isFuture
                  ? ''
                  : mark?.intensity != null
                    ? intensityClass(mark.intensity)
                    : mark
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
              {mark && (
                <span className="max-w-full truncate px-0.5 text-[10px] leading-none opacity-80 sm:text-[11px]">
                  {mark.label}
                </span>
              )}
              {mark?.dot && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sky-strong ring-1 ring-surface"
                />
              )}
            </button>
          );
        })}
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-[11px] text-muted">
          {children}
        </div>
      )}
    </div>
  );
}

/** 두 화면이 같은 범례를 쓰도록 조각을 함께 둔다. */
export function LegendSwatch({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={className} />
      {children}
    </span>
  );
}
