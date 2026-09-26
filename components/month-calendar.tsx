'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChartLine, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
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

const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

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

/** 칸을 직접 그릴 때 넘겨받는 것 — renderDay */
export type DayCell = {
  /** YYYY-MM-DD */
  key: string;
  day: number;
  isToday: boolean;
  isSelected: boolean;
  isFuture: boolean;
};

/** 강도에 따라 칸 배경 진하기를 다르게 준다. 투구 기록 캘린더(app/(app)/videos)도 같은 색을 쓴다. */
export function intensityClass(intensity: number) {
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
  compact = false,
  renderDay,
  size = 'normal',
  emptySpoken = '기록 없음',
  flags,
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
  /**
   * 칸의 높이를 줄인다. 홈에서 날짜를 골라 옆과 밑에 그날 칸이 펴질 때 쓴다 —
   * 캘린더가 자리를 내주며 위아래로도 줄어든다(칸 높이가 부드럽게 바뀐다).
   */
  compact?: boolean;
  /**
   * 칸 속을 직접 그린다. 주면 강도로 칠하지 않고 이것을 그린다 — 영상 캘린더가 칸마다
   * 그날 영상의 한 장면을 채운다. 화면 낭독기가 읽을 말은 그대로 marks 의 spoken 이다.
   */
  renderDay?: (cell: DayCell) => ReactNode;
  /** 칸 크기. large 는 한 장면을 담을 만큼 큰 칸(영상 캘린더) */
  size?: 'normal' | 'large';
  /** 칠할 것이 없는 날을 화면 낭독기가 읽는 말 — 영상 캘린더는 '영상 없음' */
  emptySpoken?: string;
  /**
   * 왼쪽 위 작은 그래프 표시 — 칠한 것과 따로 붙는 표시(날짜 → 화면 낭독기가 덧붙여 읽을 말).
   * 홈은 분석 리포트가 있는 날에 붙인다. 투구를 안 한 날에도 붙는다.
   */
  flags?: Record<string, string>;
  /** 달력 아래 범례 */
  children?: ReactNode;
}) {
  const monthTime = month.getTime();
  const todayKey = toDateKey(new Date());

  /*
   * 달이 바뀐 방향과, 떠나는 달.
   *
   * 옛 달을 한 프레임에 지워 버리면 새 달이 아무리 부드럽게 들어와도 '뚝' 바뀐
   * 것처럼 보인다. 그래서 옛 달을 잠깐 붙잡아 두고(leaving), 새 달이 들어오는
   * 동안 반대쪽으로 흘려 내보낸다.
   *
   * 방향은 시간이 흐르는 쪽이다. 다음 달이면 1 — 새 달이 오른쪽에서 들어오고 옛
   * 달은 왼쪽으로 나간다. 이전 달이면 -1. 화살표로 한 달씩 넘기든 빠른 이동으로
   * 몇 해를 건너뛰든 같은 규칙이다.
   *
   * 바뀐 것을 알아채는 자리는 effect 가 아니라 여기(그리는 도중)다. effect 에서
   * 고치면 새 달이 한 번 옛 방향으로 그려진 뒤에야 고쳐져, 첫 장면이 반대로 튄다.
   * React 가 권하는 '받은 값이 바뀌었을 때 상태를 맞추는' 방식이다.
   */
  const [prevTime, setPrevTime] = useState(monthTime);
  const [direction, setDirection] = useState(0);
  const [leaving, setLeaving] = useState<{ time: number; dir: number } | null>(null);
  if (monthTime !== prevTime) {
    const dir = monthTime > prevTime ? 1 : -1;
    setDirection(dir);
    setLeaving({ time: prevTime, dir });
    setPrevTime(monthTime);
  }

  /*
   * 높이도 부드럽게 바꾼다.
   *
   * 달마다 주 수가 다르다 — 2월은 4주, 5월·8월은 6주, 나머지는 5주. 5주 달에서
   * 6주 달로 가면 달력이 한 줄만큼 길어지는데, 그게 한 프레임에 일어나면 밑에
   * 있는 범례와 그날 요약이 통째로 툭 밀려난다. 칸이 아무리 부드럽게 들어와도
   * 이 한 번의 튐 때문에 급하게 느껴졌다.
   *
   * CSS 만으로는 'auto' 높이 사이를 오갈 수 없다(크롬 최신판만 된다 — 아이폰은
   * 안 된다). 그래서 옛 높이를 숫자로 박고, 새 높이로 옮긴 뒤, 다 끝나면 다시
   * 풀어 둔다. 풀어 두어야 창 크기가 바뀌어 칸 크기가 달라져도 따라간다.
   *
   * 옛 높이는 바뀌기 '전'에 재 둬야 한다. 이 effect 가 돌 때는 이미 새 달이
   * 그려진 뒤라, 그때 재면 새 높이가 나온다. 그래서 가만히 있을 때의 높이를
   * ResizeObserver 로 늘 적어 둔다.
   */
  const stageRef = useRef<HTMLDivElement>(null);
  const enterRef = useRef<HTMLDivElement>(null);
  const settledHeight = useRef<number | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => {
      /* 움직이는 중에는 적지 않는다. 그때 높이는 가는 도중의 값이다. */
      if (!stage.style.height)
        settledHeight.current = stage.getBoundingClientRect().height;
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const enter = enterRef.current;
    if (!stage || !enter) return;

    const to = enter.offsetHeight;
    /* 움직이는 도중에 또 넘겼으면, 가던 도중의 높이에서 이어 간다 */
    const from = stage.style.height
      ? stage.getBoundingClientRect().height
      : settledHeight.current;
    /*
     * 다음 번에 출발할 높이를 여기서 바로 적어 둔다.
     *
     * ResizeObserver 에만 맡기면, 처음 그린 직후 그것이 한 번도 불리기 전에
     * 달을 넘겼을 때 옛 높이를 몰라 툭 튄다. 실제로 재 보니 그랬다.
     * ResizeObserver 는 가만히 있는 동안 창 크기가 바뀐 것만 맡는다.
     */
    settledHeight.current = to;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (from == null || Math.abs(from - to) < 1 || reduce) {
      stage.style.height = '';
      return;
    }

    stage.style.height = `${from}px`;
    /* 방금 박은 숫자를 브라우저가 지금 계산하게 한다 — 그래야 거기서부터 움직인다 */
    stage.getBoundingClientRect();
    stage.style.height = `${to}px`;

    const done = (e: TransitionEvent) => {
      if (e.target !== stage || e.propertyName !== 'height') return;
      stage.style.height = '';
      stage.removeEventListener('transitionend', done);
    };
    stage.addEventListener('transitionend', done);
    return () => stage.removeEventListener('transitionend', done);
  }, [monthTime]);

  const grid = {
    marks,
    selected,
    onSelect,
    todayKey,
    compact,
    renderDay,
    size,
    emptySpoken,
    flags,
  };

  return (
    <div className="space-y-4">
      {/*
        제목 줄 밑에도 선을 긋는다 — 맨 아래 범례 위의 선과 같은 굵기 · 같은 간격이다.
        위아래 두 선이 날짜 칸을 감싸서, 제목 · 칸 · 범례가 한 덩이로 읽힌다.
      */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <MonthJump
          month={month}
          dir={direction}
          onPick={(next) => onMonthChange(() => next)}
        />
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

      <div>
        {/*
          요일 줄은 달이 바뀌어도 가만히 둔다. 예전에는 칸과 한 덩이라 같이
          미끄러졌는데, 안 바뀌는 것까지 흔들리면 무엇이 바뀌었는지 흐려진다.
        */}
        <div className="mb-1 grid grid-cols-7 gap-1 sm:mb-1.5 sm:gap-1.5">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`pb-1 text-center text-[11px] font-medium ${
                i === 0
                  ? 'text-red-600/70'
                  : i === 6
                    ? 'text-blue-400/70'
                    : 'text-muted'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        <div
          ref={stageRef}
          className="relative motion-safe:transition-[height] motion-safe:duration-[380ms] motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
        >
          {/*
            떠나는 달. 새 달 위에 겹쳐 두고 반대쪽으로 흘려 내보낸다.

            누를 수 없게 막는다(inert) — 사라지는 중인 칸을 눌러 엉뚱한 날이
            열리면 안 된다. 움직임을 줄인 사람에게는 아예 그리지 않는다.
          */}
          {leaving && (
            <div
              key={`out-${leaving.time}`}
              aria-hidden
              inert
              style={{ '--dir': leaving.dir } as React.CSSProperties}
              className="pointer-events-none absolute inset-x-0 top-0 hidden motion-safe:block motion-safe:animate-month-out"
              onAnimationEnd={(e) => {
                if (
                  e.target === e.currentTarget &&
                  e.animationName === 'month-slide-out'
                ) {
                  setLeaving(null);
                }
              }}
            >
              <DayGrid month={new Date(leaving.time)} {...grid} />
            </div>
          )}

          {/*
            들어오는 달. key 가 바뀌어야 애니메이션이 처음부터 다시 돈다.
            처음 열 때(direction 0)는 움직이지 않는다 — 화면 전환이 이미 있다.
          */}
          <div
            ref={enterRef}
            key={monthTime}
            style={{ '--dir': direction } as React.CSSProperties}
            className={direction === 0 ? undefined : 'motion-safe:animate-month-in'}
          >
            <DayGrid month={month} {...grid} />
          </div>
        </div>
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-[11px] text-muted">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * 한 달치 날짜 칸.
 *
 * 달이 바뀌는 동안에는 떠나는 달과 들어오는 달 두 벌이 잠깐 함께 그려진다.
 * 그래서 칸 그리는 일을 떼어 두 곳에서 같이 쓴다.
 */
function DayGrid({
  month,
  marks,
  selected,
  onSelect,
  todayKey,
  compact,
  renderDay,
  size,
  emptySpoken,
  flags,
}: {
  month: Date;
  marks: Record<string, DayMark>;
  selected: string | null;
  onSelect: (dateKey: string) => void;
  todayKey: string;
  compact: boolean;
  renderDay?: (cell: DayCell) => ReactNode;
  size: 'normal' | 'large';
  emptySpoken: string;
  flags?: Record<string, string>;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
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
        const flag = isFuture ? undefined : flags?.[key];
        const label =
          (isFuture
            ? `${monthIndex + 1}월 ${day}일, 아직 오지 않은 날`
            : mark
              ? `${monthIndex + 1}월 ${day}일, ${mark.spoken}`
              : `${monthIndex + 1}월 ${day}일${isToday ? ', 오늘' : ''}, ${emptySpoken}`) +
          (flag ? `, ${flag}` : '');

        /* 칸 속을 부르는 쪽이 그린다(영상 캘린더). 테두리와 고른 표시만 여기서 준다. */
        if (renderDay) {
          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => onSelect(key)}
              aria-label={label}
              aria-pressed={isSelected}
              className={`group relative overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-200 ${
                size === 'large'
                  ? 'h-[4.25rem] sm:h-20'
                  : 'min-h-[3.25rem] sm:min-h-[4rem]'
              } ${
                isFuture
                  ? 'cursor-default border-transparent'
                  : isSelected
                    ? 'border-sky ring-2 ring-sky'
                    : 'border-line hover:border-line-strong'
              }`}
            >
              {renderDay({ key, day, isToday, isSelected, isFuture })}
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            disabled={isFuture}
            onClick={() => onSelect(key)}
            aria-label={label}
            aria-pressed={isSelected}
            className={`relative flex flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-[color,background-color,border-color,min-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              compact
                ? 'min-h-[2.75rem] sm:min-h-[3rem]'
                : 'min-h-[3.25rem] sm:min-h-[4rem]'
            } ${
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
            {/* 흰 바탕을 깔아 둔다 — 진한 칸(강도 높음) 위에서도 보이게 */}
            {flag && (
              <span
                aria-hidden
                className="absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface/90 shadow-sm"
              >
                <ChartLine className="h-2.5 w-2.5 text-cat-core" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 제목의 '년 · 월' — 숫자(Bebas) 옆에 붙는 본문 서체의 글자.
 *
 * 크기는 잉크 높이로 맞춘다. 재 보니 Bebas 24px 숫자는 기준선 위 17px · 아래 1px(18px)
 * 이고, Pretendard 한글은 20px 일 때 위 16px · 아래 2px(18px)다. 예전 15px 은 14px 짜리라
 * 숫자보다 눈에 띄게 작았다. 1px 올려(-top-px) 위아래 끝까지 숫자와 같게 한다.
 */
const UNIT_CLASS =
  'relative -top-px ml-0.5 font-sans text-xl font-extrabold tracking-normal';

/**
 * '2026년 9월'을 누르면 펼쳐지는 빠른 이동.
 *
 * 화살표만 있을 때는 1년 전으로 가려면 열두 번을 눌러야 했다. 해를 고르고
 * 달을 누르면 한 번에 간다. 날짜 칸은 그대로 캘린더에서 누른다 — 날짜까지 여기서
 * 고르게 하면 칸마다 붙은 기록 표시(강도·구수)를 못 보고 고르게 된다.
 *
 * 판은 두 쪽이다. 처음에는 달 쪽(1월~12월)이 열리고, 위의 '2026년'을 누르면 해
 * 쪽(12년씩)으로 넘어간다. 해를 누르면 그 해의 달 쪽으로 돌아온다. 몇 해 전으로
 * 가려고 '이전 해'를 여러 번 누를 일이 없다.
 *
 * 아직 안 온 해와 달은 고를 수 없게 흐리게 둔다. 캘린더가 앞날 칸을 막아 두어서,
 * 골라 봐야 전부 막힌 칸만 보인다.
 *
 * 창(dialog)이 아니라 제자리에 펼쳐지는 작은 판이다. 달 하나 고르자고 화면을
 * 덮으면 무엇을 고르던 중이었는지 가려진다.
 *
 * 바깥을 누르거나 Esc 를 누르면 닫힌다. 열 때마다 지금 보는 달의 해·달 쪽에서
 * 시작한다 — 지난번에 다른 해를 훑다 닫았어도 다음에는 제자리에서 연다.
 */
function MonthJump({
  month,
  dir,
  onPick,
}: {
  month: Date;
  /** 캘린더가 넘어간 방향. 제목도 같은 쪽에서 들어온다. 0 이면 움직이지 않는다. */
  dir: number;
  onPick: (next: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'month' | 'year'>('month');
  const [pickYear, setPickYear] = useState(month.getFullYear());
  const [pageStart, setPageStart] = useState(month.getFullYear());
  const boxRef = useRef<HTMLDivElement>(null);

  const currentYear = month.getFullYear();
  const currentMonth = month.getMonth();
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  /*
   * 해 쪽의 한 쪽(12년)이 어디서 시작하는지.
   *
   * 쪽의 끝이 올해에 딱 맞게 자른다 — 첫 쪽은 '올해까지 12년'이다. 가운데를
   * 기준으로 자르면 첫 쪽의 뒤 몇 칸이 아직 안 온 해로 채워져, 고를 수 없는
   * 칸이 자리만 차지한다.
   */
  const pageStartFor = (year: number) =>
    thisYear - 11 - 12 * Math.max(0, Math.floor((thisYear - year) / 12));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (next: Date) => {
    onPick(next);
    setOpen(false);
  };

  const arrowClass =
    'rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-sky disabled:pointer-events-none disabled:opacity-30';

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setPickYear(currentYear);
          setView('month');
          setOpen((v) => !v);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${currentYear}년 ${currentMonth + 1}월, 달 고르기`}
        className="text-display rounded-lg text-2xl text-ink transition-colors hover:text-sky"
      >
        {/*
          제목도 캘린더와 같은 쪽에서 살짝 밀려 들어온다. 칸만 움직이고 제목이
          뚝 바뀌면 둘이 따로 노는 것처럼 보인다.

          완전히 사라졌다 나타나지는 않는다(0.35 에서 시작). 글자 몇 개가
          깜빡이면 움직임이 아니라 떨림으로 읽힌다.

          '2026년 9월'로 적는다. 숫자 서체(Bebas)에는 한글이 없어서 '년 · 월'은 본문
          서체로 붙인다 — 그대로 두면 기기 글꼴(맑은 고딕 등)로 떨어져 기기마다 모양이
          달라진다. 글자 높이는 숫자와 같게 맞춘다(UNIT_CLASS).
        */}
        <span
          key={`${currentYear}-${currentMonth}`}
          style={{ '--dir': dir } as React.CSSProperties}
          className={`inline-flex items-baseline ${dir === 0 ? '' : 'motion-safe:animate-month-title'}`}
        >
          {currentYear}
          <span className={UNIT_CLASS}>년</span>
          <span className="ml-2">{currentMonth + 1}</span>
          <span className={UNIT_CLASS}>월</span>
        </span>
      </button>

      {open && (
        <div className="motion-safe:animate-fade-in absolute left-0 top-full z-20 mt-2 w-64 origin-top-left rounded-2xl border border-line bg-surface p-3 shadow-lg">
          {/*
            두 쪽이 바뀔 때도 살짝 떠오르게 한다(key). 판 속 글자만 뚝 바뀌면
            무엇을 눌렀는지 놓친다.
          */}
          <div key={view} className="motion-safe:animate-fade-in">
            {view === 'month' ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="이전 해"
                    onClick={() => setPickYear((y) => y - 1)}
                    className={arrowClass}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {/* 해를 누르면 해 쪽으로 — 여기가 몇 해를 한 번에 건너는 문이다 */}
                  <button
                    type="button"
                    onClick={() => {
                      setPageStart(pageStartFor(pickYear));
                      setView('year');
                    }}
                    aria-label={`${pickYear}년, 해 고르기`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 hover:text-sky"
                  >
                    {pickYear}년
                    <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted" />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 해"
                    disabled={pickYear >= thisYear}
                    onClick={() => setPickYear((y) => y + 1)}
                    className={arrowClass}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1">
                  {MONTHS.map((label, i) => {
                    const on = pickYear === currentYear && i === currentMonth;
                    const future =
                      pickYear > thisYear || (pickYear === thisYear && i > thisMonth);
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={on}
                        disabled={future}
                        onClick={() => pick(new Date(pickYear, i, 1))}
                        className={`rounded-lg py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:text-muted/35 ${
                          on ? 'bg-sky text-white' : 'text-ink hover:bg-surface-2'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="이전 12년"
                    onClick={() => setPageStart((y) => y - 12)}
                    className={arrowClass}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold text-ink">
                    {pageStart} – {pageStart + 11}
                  </span>
                  <button
                    type="button"
                    aria-label="다음 12년"
                    disabled={pageStart + 11 >= thisYear}
                    onClick={() => setPageStart((y) => y + 12)}
                    className={arrowClass}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 12 }, (_, i) => pageStart + i).map((year) => {
                    const on = year === pickYear;
                    return (
                      <button
                        key={year}
                        type="button"
                        aria-pressed={on}
                        disabled={year > thisYear}
                        onClick={() => {
                          setPickYear(year);
                          setView('month');
                        }}
                        className={`rounded-lg py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:text-muted/35 ${
                          on
                            ? 'bg-sky text-white'
                            : year === thisYear
                              ? 'text-sky hover:bg-surface-2'
                              : 'text-ink hover:bg-surface-2'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => pick(new Date(thisYear, thisMonth, 1))}
            className="mt-2 w-full rounded-lg border border-line py-1.5 text-xs font-medium text-muted transition-colors hover:border-sky hover:text-sky"
          >
            오늘로
          </button>
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
