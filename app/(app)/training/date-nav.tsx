'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from '@/components/icon';
import { MiniCalendar } from '@/components/mini-calendar';
import { shiftDateKey } from '@/lib/pitch-stats';
import { TRAINING_CALENDAR_BACK_DAYS, trainingDayHref } from '@/lib/training-part';
import { trainingMarkedDays } from '@/app/actions/training-days';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** ['10월 15일', '(수)'] */
function dayParts(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return [`${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`, `(${WEEKDAYS[d.getUTCDay()]})`] as const;
}
const dayTitle = (date: string) => dayParts(date).join(' ');

/**
 * 트레이닝 제목 옆 간이 달력 — 영양 탭 제목 옆 날짜(nutrition-view.tsx DateNav)와 같은 모양 · 같은 몸짓
 * (2026-10-15 사용자 "트레이닝 제목 옆에도 영양처럼 간이 캘린더").
 *
 * 날짜를 누르면 제목 밑에 작은 달력 판이 붙어 펴진다(창이 아니라 판 — 바깥을 누르거나 Esc 면 닫힘). 무엇이든 한 날
 * (운동 · 암케어 · 메커니즘)에 점이 찍힌다. 점은 판을 처음 열 때 서버에 한 번 묻는다 — 홈을 그릴 때 1년치를 읽으면
 * 탭이 그만큼 늦게 뜬다. 하루씩 옮기는 화살표는 없다 — 바로 밑 날짜 띠가 옆 날을 맡는다.
 *
 * iconOnly — 날짜가 이미 큰 제목인 그날 기록 화면에서는 달력 그림만.
 */
export function TrainingDateNav({
  date,
  today,
  iconOnly = false,
}: {
  date: string;
  today: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [picker, setPicker] = useState<'closed' | 'open' | 'closing'>('closed');
  const [marked, setMarked] = useState<Set<string> | null>(null);
  const asked = useRef(false);
  const box = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setPicker((p) => (p === 'open' ? 'closing' : p));

  const open = () => {
    setPicker('open');
    if (asked.current) return;
    asked.current = true;
    trainingMarkedDays()
      .then((days) => setMarked(new Set(days)))
      /* 점을 못 받아도 날짜는 고를 수 있다 — 다음에 열 때 다시 묻는다 */
      .catch(() => {
        asked.current = false;
      });
  };

  useEffect(() => {
    if (picker !== 'open') return;
    const shut = () => setPicker((p) => (p === 'open' ? 'closing' : p));
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') shut();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  /*
   * 판이 화면 밖으로 나가면 안으로 민다 — 제목 옆 단추 밑 가운데에 펴는데, 좁은 휴대폰(320)에서는 판(296px)이 오른쪽으로 넘쳤다.
   * 그린 뒤 한 번 재서 옆으로만 옮긴다(위아래는 그대로).
   */
  useLayoutEffect(() => {
    const el = panel.current;
    if (picker !== 'open' || !el) return;
    el.style.marginLeft = '';
    const r = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
    if (r.left + dx < pad) dx = pad - r.left;
    if (dx) el.style.marginLeft = `${dx}px`;
  }, [picker]);

  /* 닫을 때도 빠르게(0.12초) 옅어진다 — 들어올 때보다 짧게 */
  useEffect(() => {
    if (picker !== 'closing') return;
    const timer = window.setTimeout(() => setPicker('closed'), 120);
    return () => window.clearTimeout(timer);
  }, [picker]);

  return (
    <span ref={box} className="relative">
      <button
        type="button"
        onClick={() => (picker === 'open' ? close() : open())}
        aria-expanded={picker === 'open'}
        aria-haspopup="dialog"
        aria-label={`${dayTitle(date)}, 다른 날짜 고르기`}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-ink tabular-nums transition-colors ${
          iconOnly ? 'h-10 w-10' : 'min-h-10 min-w-10 px-2 py-1.5'
        } ${picker === 'open' ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
      >
        <CalendarDays
          aria-hidden
          className={`transition-colors ${iconOnly ? 'h-5 w-5' : 'h-4 w-4'} ${
            picker === 'open' ? 'text-sky' : 'text-muted'
          }`}
        />
        {/* 좁은 휴대폰(360 밑)은 그림만 — 제목 · 분석 단추와 한 줄에 서게 */}
        {!iconOnly && (
          <span className="max-[359px]:sr-only">
            {dayParts(date)[0]}
            <span className="max-sm:hidden"> {dayParts(date)[1]}</span>
          </span>
        )}
      </button>
      {picker !== 'closed' && (
        <div
          ref={panel}
          role="dialog"
          aria-label="날짜 고르기"
          data-mini-calendar
          data-no-swipe
          className={`absolute top-full z-30 mt-2 w-[18.5rem] origin-top rounded-2xl border border-line bg-surface p-3 shadow-lg ${
            iconOnly ? 'right-0' : 'left-1/2 -translate-x-1/2'
          } ${
            picker === 'closing'
              ? 'pointer-events-none motion-safe:animate-[month-fade-out_120ms_ease-in_both]'
              : 'motion-safe:animate-fade-in'
          }`}
        >
          <MiniCalendar
            value={date}
            today={today}
            min={shiftDateKey(today, -TRAINING_CALENDAR_BACK_DAYS)}
            max={today}
            marked={(d) => marked?.has(d) ?? false}
            onPick={(d) => {
              close();
              if (d !== date) router.push(trainingDayHref(d, today), { scroll: false });
            }}
          />
        </div>
      )}
    </span>
  );
}
