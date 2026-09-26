'use client';

import { useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKeyOf } from '@/lib/pitch-stats';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 한 판에 늘 여섯 줄 — 달마다 주 수가 달라도(4~6주) 판의 높이가 들썩이지 않게 */
const CELLS = 42;

/**
 * 작은 달력 — 날짜 하나를 고른다.
 *
 * 영양 탭의 날짜 고르개와 가입의 생년월일 고르개로 쓴다. 예전에는 브라우저의 날짜 고르개를 띄웠는데, 기기마다
 * 모양이 달랐고(아이폰은 굴리는 바퀴, 크롬은 회색 표) 앱의 다른 달력과 따로 놀았다.
 * 무엇보다 어느 날에 적었는지가 안 보여서, 빠뜨린 날을 찾으려면 하루씩 열어 봐야 했다.
 *
 * 홈의 큰 달력과 같은 말을 쓴다 — 요일 줄, 오늘은 하늘색 글자, 고른 날은 하늘색으로
 * 채움, 고를 수 없는 날은 흐리게 막음. 달을 넘기면 같은 쪽에서 미끄러져 들어온다.
 * 기록이 있는 날은 숫자 밑에 점을 찍는다.
 */
export function MiniCalendar({
  value,
  today,
  min,
  max,
  marked,
  onPick,
  viewFrom,
  pickYear = false,
}: {
  /** 고른 날 (YYYY-MM-DD). 아직 안 골랐으면 빈 문자열 */
  value: string;
  /** 오늘 (YYYY-MM-DD) */
  today: string;
  /** 고를 수 있는 가장 이른 날 */
  min: string;
  /** 고를 수 있는 가장 늦은 날 */
  max: string;
  /** 기록이 있는 날인가 — 숫자 밑에 점을 찍는다 */
  marked: (dateKey: string) => boolean;
  onPick: (dateKey: string) => void;
  /** 아직 고른 날이 없을 때 처음 펼 달의 날짜(YYYY-MM-DD). 없으면 오늘의 달 */
  viewFrom?: string;
  /**
   * 연 · 월을 곧장 고르는 칸을 둔다(가운데 제목 자리).
   *
   * 생년월일처럼 몇십 년 전으로 가야 하는 곳에서 쓴다. 달 넘기기만 있으면 2008년까지
   * 이백 번 넘게 눌러야 한다. 연도는 고를 수 있는 범위(min~max) 안의 것만 둔다.
   */
  pickYear?: boolean;
}) {
  /* 보고 있는 달. 처음에는 고른 날의 달, 안 골랐으면 viewFrom · 오늘의 달이다. */
  const [view, setView] = useState(() => {
    const [y, m] = (value || viewFrom || today).split('-').map(Number);
    return { y, m: m - 1 };
  });
  /* 넘긴 쪽 — 다음 달이면 1(오른쪽에서 들어온다), 이전 달이면 -1 */
  const [dir, setDir] = useState(0);

  const first = dateKeyOf(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const last = dateKeyOf(view.y, view.m, daysInMonth);
  const lead = new Date(view.y, view.m, 1).getDay();
  const canPrev = first > min;
  const canNext = last < max;

  const move = (delta: -1 | 1) => {
    const d = new Date(view.y, view.m + delta, 1);
    setDir(delta);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  /* 연 · 월로 곧장 — 앞뒤로 넘긴 것과 같은 쪽에서 들어온다 */
  const jump = (y: number, m: number) => {
    setDir(y * 12 + m > view.y * 12 + view.m ? 1 : -1);
    setView({ y, m });
  };
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const pickCls =
    'cursor-pointer appearance-none rounded-lg bg-transparent px-2 py-1 text-sm font-bold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-sky';

  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!canPrev}
          aria-label="이전 달"
          className={arrow}
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        {pickYear ? (
          <div className="flex items-center">
            <select
              aria-label="연도"
              value={view.y}
              onChange={(e) => jump(Number(e.target.value), view.m)}
              className={pickCls}
            >
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                )
              )}
            </select>
            <select
              aria-label="월"
              value={view.m}
              onChange={(e) => jump(view.y, Number(e.target.value))}
              className={pickCls}
            >
              {Array.from({ length: 12 }, (_, m) => (
                <option key={m} value={m}>
                  {m + 1}월
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p
            key={first}
            aria-live="polite"
            style={{ '--dir': dir } as CSSProperties}
            className={`text-sm font-bold text-ink ${dir ? 'motion-safe:animate-month-title' : ''}`}
          >
            {view.y}년 {view.m + 1}월
          </p>
        )}
        <button
          type="button"
          onClick={() => move(1)}
          disabled={!canNext}
          aria-label="다음 달"
          className={arrow}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`pb-1 text-center text-[11px] font-medium ${
              i === 0 ? 'text-red-600/70' : i === 6 ? 'text-blue-400/70' : 'text-muted'
            }`}
          >
            {w}
          </span>
        ))}
      </div>

      {/* 달이 바뀔 때마다 새로 그려, 넘긴 쪽에서 미끄러져 들어온다 */}
      <div
        key={first}
        style={{ '--dir': dir } as CSSProperties}
        className={`grid grid-cols-7 gap-0.5 ${dir ? 'motion-safe:animate-month-in' : ''}`}
      >
        {Array.from({ length: CELLS }, (_, i) => {
          const day = i - lead + 1;
          if (day < 1 || day > daysInMonth) return <span key={i} className="h-10" />;
          const key = dateKeyOf(view.y, view.m, day);
          const off = key < min || key > max;
          const picked = key === value;
          const isToday = key === today;
          const has = !off && marked(key);
          return (
            <button
              key={i}
              type="button"
              disabled={off}
              onClick={() => onPick(key)}
              aria-pressed={picked}
              aria-label={`${view.m + 1}월 ${day}일${isToday ? ', 오늘' : ''}${
                has ? ', 기록 있음' : ''
              }`}
              className={`relative flex h-10 flex-col items-center justify-center rounded-lg text-sm tabular-nums transition-[background-color,color,transform] duration-150 motion-safe:active:scale-90 disabled:pointer-events-none ${
                off
                  ? 'text-muted/35'
                  : picked
                    ? 'bg-sky font-bold text-white shadow-sm'
                    : isToday
                      ? 'font-bold text-sky hover:bg-surface-2'
                      : 'text-ink hover:bg-surface-2'
              }`}
            >
              {day}
              <span
                aria-hidden
                className={`absolute bottom-1 h-1 w-1 rounded-full transition-colors ${
                  has ? (picked ? 'bg-white' : 'bg-sky') : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
