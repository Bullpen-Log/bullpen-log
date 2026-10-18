'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Dumbbell,
  Flame,
  Gauge,
  HeartPulse,
  Minus,
  Scale,
  type LucideIcon,
} from '@/components/icon';
import { Baseball } from '@/components/baseball-icon';
import { haptic } from '@/lib/haptics';
import { smoothPath } from '@/lib/smooth-path';
import { useBoxSize } from '@/components/use-box-size';
import { MiniCalendar } from '@/components/mini-calendar';
import { Segmented } from '@/components/segmented';
import { useSpeedUnit, useWeightUnit } from '@/components/use-units';
import { shiftDateKey } from '@/lib/pitch-stats';
import {
  CONDITION_DOMAIN,
  METRIC_SPECS,
  barDomain,
  daysBetween,
  daysOf,
  formatMetric,
  lineDomain,
  shortDate,
  slotsOf,
  tickText,
  trendCardOf,
  trendValues,
  withAnd,
  xTickText,
  xTicksOf,
  type Change,
  type Domain,
  type MetricKey,
  type Range,
  type Slot,
} from '@/lib/report/trends';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { TrainingDaySummary } from '@/lib/report/training-history';
import { spokenDay, type CheckinDay, type NutritionDay } from './day-summary';

/**
 * 홈의 '그래프' — 이 앱에 쌓인 기록이 어떻게 흘러왔는지 여섯 장의 그래프로 본다.
 *
 * 분석 칸 옆(넓은 화면)이나 밑(좁은 화면)에 선다. 분석은 '그날 어땠나'를 글과 지표로,
 * 여기는 '요즘 어떻게 바뀌어 왔나'를 모양으로 보여 준다 — 투구수 · 최고 구속 · 컨디션 ·
 * 체중 · 먹은 칼로리 · 운동.
 *
 * 한 장에 담는 것:
 *   - 기간을 한 숫자로(합 · 최고 · 평균 · 가장 최근)와 바로 앞 같은 길이의 기간보다
 *     얼마나 달라졌나(↗ 12%) — 그래프를 읽기 전에 방향부터 보인다.
 *   - 세로 눈금 세 줄과 숫자, 가로 날짜 눈금 — 막대 높이를 어림이 아니라 값으로 읽는다.
 *   - 점선의 평균 — 요즘 값이 평소보다 높은지 낮은지.
 *   - 가장 최근 칸은 진하게(막대) 또는 크게 찍고 값을 붙인다(선).
 *   - 마우스를 올리면 그날(그 주) 값이 말풍선으로 뜨고, 날짜별일 때 누르면 캘린더가 그날을
 *     고른다 — 그날 칸과 분석이 함께 그날로 바뀐다. 휴대폰은 눌러서 값만 본다.
 *
 * 새로 묻지 않는다. 홈 캘린더가 칸을 칠하려고 이미 들고 있는 날짜별 요약(투구 기록 ·
 * 체크인 · 영양 · 운동, 열세 달)을 모아 그린다 — 같은 날의 숫자가 캘린더와 그래프에서
 * 다를 수 없다. 체중만 캘린더가 안 쓰던 것이라 함께 받아 온다(app/(app)/today/page.tsx).
 */

const PERIODS = [
  { value: '4w', label: '4주' },
  { value: '12w', label: '12주' },
  { value: 'custom', label: '기간 설정' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

/*
 * 고른 기간을 이 기기에 적어 둔다 — 홈을 다시 열어도 그 기간으로.
 *
 * 브라우저 저장소를 화면 바깥의 가게로 보고 읽는다(useSyncExternalStore). 저장소를 쓸 수
 * 없는 곳(사생활 보호 창 등)에서도 기간은 바뀌어야 하므로 값은 늘 여기(memo)에도 들고,
 * 저장소에는 되는 만큼만 적는다. 다른 탭에서 바꾸면(storage 알림) 따라 바뀐다.
 */
const RANGE_KEY = 'bullpen-trends-range';
const listeners = new Set<() => void>();
let memo: string | null | undefined;

function readSaved(): string | null {
  if (memo === undefined) {
    try {
      memo = localStorage.getItem(RANGE_KEY);
    } catch {
      memo = null;
    }
  }
  return memo;
}

function writeSaved(value: { period: Period } & Range) {
  memo = JSON.stringify(value);
  try {
    localStorage.setItem(RANGE_KEY, memo);
  } catch {
    /* 적을 수 없으면 이 창에서만 쓴다 */
  }
  listeners.forEach((l) => l());
}

function subscribeSaved(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== RANGE_KEY) return;
    memo = e.newValue;
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** 적어 둔 글에서 기간을 꺼낸다 — 없거나 틀리면 최근 4주 */
function readRange(
  saved: string | null,
  earliest: string,
  today: string
): { period: Period; custom: Range } {
  const fallback: Range = { from: shiftDateKey(today, -27), to: today };
  try {
    const s = JSON.parse(saved ?? 'null') as
      ({ period?: string } & Partial<Range>) | null;
    if (!s) return { period: '4w', custom: fallback };
    const period = PERIODS.some((p) => p.value === s.period)
      ? (s.period as Period)
      : '4w';
    const ok =
      !!s.from && !!s.to && s.from >= earliest && s.from <= s.to && s.to <= today;
    return { period, custom: ok ? { from: s.from!, to: s.to! } : fallback };
  } catch {
    return { period: '4w', custom: fallback };
  }
}

/** 그래프 한 장 — 셈(lib/report/trends.ts METRIC_SPECS)에 카드 제목 앞 그림 · 글자색 토큰을 붙인다. 그래프는 currentColor 로 칠한다 */
const ICONS: Record<MetricKey, LucideIcon> = {
  pitches: Baseball,
  velocity: Gauge,
  condition: HeartPulse,
  weight: Scale,
  kcal: Flame,
  training: Dumbbell,
};
const METRICS = METRIC_SPECS.map((m) => ({ ...m, tone: 'text-sky', icon: ICONS[m.key] }));

export type { MetricKey };

export function HomeTrends({
  today,
  earliest,
  logs,
  trainingByDay,
  nutritionByDay,
  checkinByDay,
  weightByDay,
  metrics: only,
  onJump,
}: {
  today: string;
  /** 홈이 받아 온 기록의 가장 이른 날 — 이보다 앞은 고를 수 없다(열세 달 전 그달 1일) */
  earliest: string;
  logs: Log[];
  trainingByDay: Record<string, TrainingDaySummary>;
  nutritionByDay: Record<string, NutritionDay>;
  checkinByDay: Record<string, CheckinDay>;
  /** 날짜별 체중(kg) — 영양 탭에 적은 것이 체크인보다 앞선다 */
  weightByDay: Record<string, number>;
  /** 그릴 그래프 — 투구 분석은 투구수 · 최고 구속, 트레이닝 분석은 운동만(2026-10-14). 안 주면 여섯 장 다 */
  metrics?: MetricKey[];
  /** 캘린더가 그날을 고른다 */
  onJump: (date: string) => void;
}) {
  const shownMetrics = only ? METRICS.filter((m) => only.includes(m.key)) : METRICS;
  const speedUnit = useSpeedUnit();
  const weightUnit = useWeightUnit();

  /*
   * 고른 기간 — 이 기기에 적어 둔 것(없으면 최근 4주). 서버는 이 값을 모르므로 처음 그림은
   * 4주이고, 화면이 뜬 뒤 적어 둔 기간으로 바뀐다. 받아 온 기록 밖이거나 앞뒤가 뒤집힌
   * 기간은 버린다.
   */
  const saved = useSyncExternalStore(subscribeSaved, readSaved, () => null);
  const { period, custom } = useMemo(
    () => readRange(saved, earliest, today),
    [saved, earliest, today]
  );

  /* 날짜 → 값. 기록이 없는 날은 null(0 과 다르다 — '쉰 날'과 '안 적은 날'은 다르다) */
  const valueOf = useMemo(
    () => trendValues({ logs, checkinByDay, weightByDay, nutritionByDay, trainingByDay }),
    [logs, checkinByDay, weightByDay, nutritionByDay, trainingByDay]
  );

  /* 기록이 하나라도 있는 날 — 기간 고르는 작은 달력에 점을 찍는다 */
  const hasRecord = (day: string) => shownMetrics.some((m) => valueOf(m.key, day) != null);

  /* 보여 줄 기간 — 4주 · 12주는 오늘로 끝나고, '기간 설정'은 고른 대로 */
  const range: Range =
    period === '4w'
      ? { from: shiftDateKey(today, -27), to: today }
      : period === '12w'
        ? { from: shiftDateKey(today, -83), to: today }
        : custom;
  const span = daysBetween(range.from, range.to) + 1;
  const { slots, daily } = useMemo(
    () => slotsOf({ from: range.from, to: range.to }),
    [range.from, range.to]
  );
  const days = useMemo(
    () => daysOf({ from: range.from, to: range.to }),
    [range.from, range.to]
  );

  /*
   * 견줄 바로 앞 기간(같은 길이). 홈이 받아 온 기록보다 앞으로 넘어가면 견주지 않는다 —
   * 반쪽만 읽은 기간과 견주면 '늘었다'가 거짓이 된다.
   */
  const before = useMemo(() => {
    const from = shiftDateKey(range.from, -span);
    return from < earliest ? null : daysOf({ from, to: shiftDateKey(range.from, -1) });
  }, [range.from, span, earliest]);

  /** 값을 화면 글자로 — 단위는 고른 것(km/h · mph, kg · lb)을 따른다 */
  const format = (key: MetricKey, v: number) => formatMetric(key, v, speedUnit, weightUnit);

  const periodName = period === '4w' ? '4주' : period === '12w' ? '12주' : `${span}일`;
  const endsToday = range.to === today;

  const pickPeriod = (next: Period) => writeSaved({ period: next, ...custom });
  const pickRange = (next: Range) => writeSaved({ period: 'custom', ...next });

  return (
    /*
      분석 밑에 쌓인다(2026-10-14) — 예전엔 분석 옆에서 그 높이만큼 늘어났는데, 장 수가 한두 장이면 카드 하나가 900px 넘게
      늘어나 장 수를 고른 화면(metrics)은 카드 높이를 못박는다.
    */
    <section
      aria-labelledby="trends-title"
      className="@container flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="trends-title"
            className="text-heading flex items-center gap-2 text-xl text-ink"
          >
            그래프
          </h2>
          <p className="mt-1 text-sm text-muted">
            <b className="font-semibold text-ink">
              {period === 'custom' ? '고른 기간' : `최근 ${periodName}`}
            </b>
            {daily ? ' · 날짜별' : ' · 주별'}
            {before && (
              <span className="hidden @md:inline">
                {' '}
                ·{' '}
                {withAnd(
                  period === 'custom' ? `앞 ${periodName}` : `이전 ${periodName}`
                )}{' '}
                비교
              </span>
            )}
          </p>
        </div>
        <Segmented
          label="기간"
          value={period}
          onChange={pickPeriod}
          options={PERIODS}
          tone="raised"
          itemClassName="px-3.5 py-1.5"
        />
      </div>

      {/*
        기간 설정 — 시작과 끝을 작은 달력에서 고른다. 기록이 있는 날에는 점이 찍혀 있다.
        45일까지는 날짜별, 그보다 길면 주별로 그린다.
      */}
      {period === 'custom' && (
        <div className="motion-safe:animate-fade-in flex flex-wrap items-center gap-2">
          <RangeEnd
            label="시작"
            value={custom.from}
            min={earliest}
            max={custom.to}
            today={today}
            marked={hasRecord}
            align="left"
            onPick={(from) => pickRange({ ...custom, from })}
          />
          <span aria-hidden className="text-sm text-muted">
            ~
          </span>
          <RangeEnd
            label="끝"
            value={custom.to}
            min={custom.from}
            max={today}
            today={today}
            marked={hasRecord}
            align="right"
            onPick={(to) => pickRange({ ...custom, to })}
          />
          <span className="text-xs tabular-nums text-muted">
            {span}일 · {daily ? '날짜별' : '주별'}
          </span>
        </div>
      )}

      {/*
        여섯 장은 따로 떨어진 둥근 카드 — 건강 앱의 요약 카드처럼(2026-10-04 '앱 느낌'). 예전엔 한 상자 안을 1px 선으로
        나눠 표처럼 보였다. 좁으면 두 장씩, 상자가 넓으면(48rem 이상) 세 장씩. 화면이 아니라 이 상자의 폭을
        본다(@container) — 분석 옆에 설 때와 밑에 설 때 폭이 두 배 가까이 다르다.

        기간을 바꾸면 새로 그린다(key) — 막대가 다시 솟고 선이 다시 그어진다.
      */}
      <div
        key={`${range.from}~${range.to}`}
        className={`grid gap-3 ${
          shownMetrics.length === 1
            ? 'auto-rows-[12rem] grid-cols-1 desk:auto-rows-[14rem]'
            : shownMetrics.length === 2
              ? 'auto-rows-[12rem] grid-cols-2 desk:auto-rows-[14rem]'
              : 'min-h-0 flex-1 auto-rows-fr grid-cols-2 @3xl:grid-cols-3'
        }`}
      >
        {shownMetrics.map((m) => {
          const fmt = (v: number) => format(m.key, v);
          const card = trendCardOf(m, valueOf, days, before, slots, fmt, periodName);
          return (
            <TrendCell
              key={m.key}
              label={m.label}
              icon={m.icon}
              kind={m.kind}
              tone={m.tone}
              slots={slots}
              points={card.points}
              value={card.value}
              note={card.note}
              change={card.change}
              format={fmt}
              fixedDomain={m.key === 'condition' ? CONDITION_DOMAIN : null}
              daily={daily}
              endsToday={endsToday}
              onJump={onJump}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * 기간의 한쪽 끝(시작 · 끝) — 누르면 밑에 작은 달력이 펴진다.
 *
 * 창(dialog)이 아니라 제자리에 붙는 작은 판이다(영양 탭의 날짜 고르개와 같은 모양). 바깥을
 * 누르거나 Esc 면 닫힌다. 끝 쪽 판은 오른쪽에 맞춰 편다 — 휴대폰에서 화면 밖으로 나가지
 * 않게.
 */
function RangeEnd({
  label,
  value,
  min,
  max,
  today,
  marked,
  align,
  onPick,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  today: string;
  marked: (day: string) => boolean;
  align: 'left' | 'right';
  onPick: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /* 판을 펴는 쪽 — 끝 칸이 줄바꿈돼 왼쪽 끝에 오면 오른쪽 맞춤 판이 화면 왼쪽 밖으로 나간다 */
  const [side, setSide] = useState(align);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          const r = box.current?.getBoundingClientRect();
          /* 판 폭 18.5rem 을 버튼 오른쪽 끝에서 왼쪽으로 펼 자리가 없으면 왼쪽에 맞춘다 */
          const fits = r ? r.right - 18.5 * 16 >= 8 : true;
          setSide(align === 'right' && !fits ? 'left' : align);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} ${spokenDay(value)}, 다른 날 고르기`}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold tabular-nums text-ink transition-colors ${
          open
            ? 'border-sky bg-sky-tint'
            : 'border-line-strong bg-surface hover:border-sky'
        }`}
      >
        <CalendarDays
          aria-hidden
          className={`h-4 w-4 ${open ? 'text-sky' : 'text-muted'}`}
        />
        <span className="text-xs font-medium text-muted">{label}</span>
        {spokenDay(value)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${label} 고르기`}
          className={`motion-safe:animate-fade-in absolute top-full z-30 mt-2 w-[18.5rem] rounded-2xl border border-line bg-surface p-3 shadow-lg ${
            side === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
          }`}
        >
          <MiniCalendar
            value={value}
            today={today}
            min={min}
            max={max}
            marked={marked}
            onPick={(day) => {
              setOpen(false);
              if (day !== value) onPick(day);
            }}
          />
        </div>
      )}
    </span>
  );
}

function TrendCell({
  label,
  icon: Icon,
  kind,
  tone,
  slots,
  points,
  value,
  note,
  change,
  format,
  fixedDomain,
  daily,
  endsToday,
  onJump,
}: {
  label: string;
  icon: LucideIcon;
  kind: 'bar' | 'line';
  tone: string;
  slots: Slot[];
  points: (number | null)[];
  value: [string, string] | null;
  note: string;
  change: Change | null;
  format: (v: number) => [string, string];
  fixedDomain: Domain | null;
  daily: boolean;
  /** 기간이 오늘로 끝나나 — 마지막 눈금을 '오늘' · '이번 주'로 적는다 */
  endsToday: boolean;
  onJump: (date: string) => void;
}) {
  const Arrow =
    change?.dir === 1 ? ArrowUpRight : change?.dir === -1 ? ArrowDownRight : Minus;
  /*
   * 그래프를 가리키는(손가락으로 훑는) 칸 — 그동안 큰 숫자 자리가 그날 값 · 날짜로 바뀐다. 건강 앱처럼 위의 숫자가
   * 바뀌고 그래프 위에는 세로선만 선다(2026-10-04). 예전 말풍선은 그래프 위에 떠 숫자 · 막대를 가렸다.
   */
  const [hover, setHover] = useState<number | null>(null);
  const picked = hover == null ? undefined : points[hover];
  const shownValue =
    picked === undefined ? value : picked == null ? null : format(picked);
  const shownNote =
    hover == null
      ? note
      : daily
        ? spokenDay(slots[hover].end)
        : `${shortDate(slots[hover].start)}~${shortDate(slots[hover].end)}`;
  return (
    /* 카드 하나 — 휴대폰은 테두리 없이 흰 면(globals.css 카드 규칙), PC 는 테두리 */
    <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`flex min-w-0 items-center gap-1 text-xs font-semibold ${tone}`}>
          <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </h3>
        {change && hover == null && (
          <span
            title={change.spoken}
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-current/10 px-1.5 py-0.5 text-caption font-semibold tabular-nums ${tone}`}
          >
            <Arrow aria-hidden className="h-3 w-3" strokeWidth={2.5} />
            {change.text}
            <span className="sr-only">{change.spoken}</span>
          </span>
        )}
      </div>
      <p
        className={`mt-1 truncate text-xl font-bold tabular-nums ${hover == null ? 'text-ink' : tone}`}
      >
        {shownValue ? shownValue[0] : '—'}
        {shownValue && (
          <span className="ml-0.5 text-xs font-medium text-muted">{shownValue[1]}</span>
        )}
      </p>
      {/* 숫자 밑 한 줄 — 며칠 · 평균(예전엔 숫자 옆에 붙어 좁은 칸에서 잘렸다). 훑는 동안은 그 날짜 */}
      <p className="min-h-4 truncate text-caption leading-4 text-muted">{shownNote}</p>
      <Chart
        kind={kind}
        tone={tone}
        slots={slots}
        points={points}
        spoken={`${label}, ${value ? value.join('') : '기록 없음'}${note ? `, ${note}` : ''}${change ? `, ${change.spoken}` : ''}`}
        fixedDomain={fixedDomain}
        daily={daily}
        endsToday={endsToday}
        onJump={onJump}
        hover={hover}
        setHover={setHover}
      />
    </div>
  );
}

/* ─────────────────────────── 그래프 그리기 ─────────────────────────── */

function Chart({
  kind,
  tone,
  slots,
  points,
  spoken,
  fixedDomain,
  daily,
  endsToday,
  onJump,
  hover,
  setHover,
}: {
  kind: 'bar' | 'line';
  tone: string;
  slots: Slot[];
  points: (number | null)[];
  spoken: string;
  fixedDomain: Domain | null;
  daily: boolean;
  endsToday: boolean;
  onJump: (date: string) => void;
  /** 가리키는 칸 — 카드(TrendCell)가 쥐고 큰 숫자 자리에 그 값을 보인다 */
  hover: number | null;
  setHover: (i: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  /* 마우스로 누를 때만 캘린더로 옮긴다 — 손가락은 값을 보려고 누른다 */
  const pointer = useRef('mouse');
  /* 손가락을 뗀 뒤 말풍선을 걷는 때 */
  const hideTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const gradient = `trend-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const n = points.length;
  const got = points.filter(
    (v): v is number => v != null && (kind === 'line' || v > 0)
  );
  const empty = got.length === 0;

  /* ── 자리 셈 ── */
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  /* 세로 눈금 숫자는 오른쪽에 — 건강 앱처럼(2026-10-04). 좁은 칸은 숫자 없이 */
  const showY = w >= 190;
  const padL = 4;
  const padR = showY ? 30 : 6;
  const padT = 12;
  const padB = 18;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const slotW = plotW / n;
  const base = padT + plotH;
  const x = (i: number) => padL + slotW * (i + 0.5);
  const dom: Domain = empty
    ? { lo: 0, hi: 1, ticks: [] }
    : kind === 'bar'
      ? barDomain(Math.max(...got))
      : (fixedDomain ?? lineDomain(Math.min(...got), Math.max(...got)));
  const y = (v: number) => padT + plotH * (1 - (v - dom.lo) / (dom.hi - dom.lo));
  const last = n - 1;

  /* 가로 눈금 — 처음 · 4분의 1 · 가운데 · 4분의 3 · 끝, 좁으면 처음과 끝만(lib/report/trends.ts) */
  const xTicks = xTicksOf(n, w < 190);
  const xText = (i: number) => xTickText(i, slots, daily, endsToday);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(
      last,
      Math.max(0, Math.floor((e.clientX - r.left - padL) / slotW))
    );
    window.clearTimeout(hideTimer.current);
    /* 손가락으로 훑으면 칸을 넘을 때마다 '톡' — 건강 앱 그래프처럼 */
    if (e.pointerType !== 'mouse' && i !== hover && points[i] != null)
      haptic('selection');
    setHover(i);
  };

  const linePoints: [number, number, number][] = points.flatMap((v, i) =>
    v == null ? [] : [[x(i), y(v), i] as [number, number, number]]
  );
  const latest = linePoints[linePoints.length - 1];

  return (
    <div
      ref={box}
      role="img"
      aria-label={spoken}
      className={`relative mt-2 min-h-[5rem] flex-1 touch-pan-y select-none ${tone} ${
        daily && !empty ? 'cursor-pointer' : ''
      }`}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
        if (!empty) pick(e);
      }}
      onPointerMove={(e) => {
        /* 마우스는 올린 대로, 손가락은 누른 채 옆으로 훑는 대로(세로로 밀면 화면이 굴러 pointercancel) */
        if (empty) return;
        if (e.pointerType === 'mouse' || e.buttons > 0) pick(e);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHover(null);
      }}
      onPointerUp={(e) => {
        /* 손가락을 떼면 잠깐 남겼다가 걷는다 — 톡 친 것도 값을 읽을 틈이 있게 */
        if (e.pointerType === 'mouse') return;
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setHover(null), 1500);
      }}
      onPointerCancel={() => setHover(null)}
      onClick={() => {
        if (daily && hover != null && pointer.current === 'mouse')
          onJump(slots[hover].end);
      }}
    >
      {empty ? (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-muted/70">
          기록 없음
        </p>
      ) : (
        size && (
          <svg
            aria-hidden
            width={w}
            height={h}
            className="absolute inset-0 overflow-visible"
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* 세로 눈금 — 옅은 실선 셋(바닥만 진하게)과 오른쪽 숫자. 예전 점선은 서류의 표처럼 보였다 */}
            {dom.ticks.map((t, k) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={y(t)}
                  y2={y(t)}
                  className="stroke-line"
                  strokeOpacity={k === 0 ? 1 : 0.6}
                />
                {showY && (
                  <text
                    x={w - padR + 6}
                    y={y(t)}
                    textAnchor="start"
                    dominantBaseline="middle"
                    className="fill-muted text-caption tabular-nums"
                  >
                    {tickText(t)}
                  </text>
                )}
              </g>
            ))}

            {/* 가로 날짜 눈금 */}
            {xTicks.map((i) => (
              <text
                key={i}
                x={i === 0 ? padL : i === last ? w - padR : x(i)}
                y={h - 3}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                className="fill-muted text-caption tabular-nums"
              >
                {xText(i)}
              </text>
            ))}

            {kind === 'bar'
              ? /* 막대 — 밑에서 솟는다. 지난 칸은 조금 옅게, 가장 최근 칸은 진하게. */
                points.map((v, i) => {
                  if (!v) return null;
                  /* 막대는 위쪽만 둥글게, 모두 같은 진하기 — 훑는 동안만 고른 칸 밖을 옅게(건강 앱처럼) */
                  const bw = Math.max(2, Math.min(slotW * 0.62, 22));
                  const top = y(v);
                  const r = Math.min(3, bw / 2, Math.max(0, base - top));
                  const left = x(i) - bw / 2;
                  return (
                    <path
                      key={i}
                      d={`M${left},${base} V${top + r} Q${left},${top} ${left + r},${top} H${left + bw - r} Q${left + bw},${top} ${left + bw},${top + r} V${base} Z`}
                      className={`origin-bottom fill-current transition-opacity duration-150 [transform-box:fill-box] motion-safe:animate-[trend-rise_560ms_cubic-bezier(0.22,1,0.36,1)_both] ${
                        hover != null && hover !== i ? 'opacity-35' : ''
                      }`}
                      style={{ animationDelay: `${Math.round((i / n) * 260)}ms` }}
                    />
                  );
                })
              : /* 선 — 부드러운 곡선 밑에 옅은 색을 깔고, 왼쪽에서 오른쪽으로 그어진다 */
                linePoints.length > 0 && (
                  <g>
                    {linePoints.length > 1 && (
                      <path
                        d={`${smoothPath(linePoints.map(([px, py]) => [px, py]))} L${latest[0]},${base} L${linePoints[0][0]},${base} Z`}
                        fill={`url(#${gradient})`}
                        className="motion-safe:animate-[trend-fade_700ms_ease-out_250ms_both]"
                      />
                    )}
                    <path
                      d={smoothPath(linePoints.map(([px, py]) => [px, py]))}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray="1"
                      className="motion-safe:animate-[trend-draw_900ms_cubic-bezier(0.22,1,0.36,1)_both]"
                    />
                    {linePoints.map(([px, py, i]) => (
                      <circle
                        key={i}
                        cx={px}
                        cy={py}
                        r={hover === i ? 4 : i === latest[2] ? 3.5 : 2.25}
                        strokeWidth={1.5}
                        className="fill-current stroke-surface transition-[r] duration-150 motion-safe:animate-[trend-fade_300ms_ease-out_both]"
                        style={{ animationDelay: `${Math.round((px / w) * 700)}ms` }}
                      />
                    ))}
                  </g>
                )}

            {/*
              평균 점선 · '평균 38' 이름표 · 마지막 값 숫자는 뺐다(2026-10-04 '앱 느낌') — 작은 칸에서 막대 · 선과 겹쳐 지저분했다.
              평균은 큰 숫자 밑 한 줄이, 그날 값은 눌러서 훑는 말풍선이 보인다.
            */}
            {/* 가리킨 칸 — 세로 안내선 */}
            {hover != null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT - 6}
                y2={base}
                className="stroke-ink/30"
              />
            )}
          </svg>
        )
      )}
    </div>
  );
}
