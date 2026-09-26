'use client';

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import { ArrowDownRight, ArrowUpRight, ChartColumn, Minus } from 'lucide-react';
import { Segmented } from '@/components/segmented';
import { useSpeedUnit, useWeightUnit } from '@/components/use-units';
import { round1, speedLabel, toSpeed, toWeight } from '@/lib/units';
import { shiftDateKey } from '@/lib/pitch-stats';
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
 *   - 마우스를 올리면 그날(그 주) 값이 말풍선으로 뜨고, 4주에서 누르면 캘린더가 그날을
 *     고른다 — 그날 칸과 분석이 함께 그날로 바뀐다. 휴대폰은 눌러서 값만 본다.
 *
 * 새로 묻지 않는다. 홈 캘린더가 칸을 칠하려고 이미 들고 있는 날짜별 요약(투구 기록 ·
 * 체크인 · 영양 · 운동, 열세 달)을 모아 그린다 — 같은 날의 숫자가 캘린더와 그래프에서
 * 다를 수 없다. 체중만 캘린더가 안 쓰던 것이라 함께 받아 온다(app/(app)/today/page.tsx).
 */

const PERIODS = [
  { value: '4w', label: '4주' },
  { value: '12w', label: '12주' },
] as const;
type Period = (typeof PERIODS)[number]['value'];
const PERIOD_DAYS: Record<Period, number> = { '4w': 28, '12w': 84 };

/** 그래프의 한 칸 — 4주는 하루, 12주는 한 주(일곱 날) */
type Slot = { days: string[]; start: string; end: string };

/** end 로 끝나는 기간의 칸들 */
function slotsFor(period: Period, end: string): Slot[] {
  if (period === '4w') {
    return Array.from({ length: 28 }, (_, i) => {
      const day = shiftDateKey(end, i - 27);
      return { days: [day], start: day, end: day };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const last = shiftDateKey(end, -(11 - i) * 7);
    const days = Array.from({ length: 7 }, (_, k) => shiftDateKey(last, k - 6));
    return { days, start: days[0], end: last };
  });
}

type MetricKey = 'pitches' | 'velocity' | 'condition' | 'weight' | 'kcal' | 'training';
type Combine = 'sum' | 'avg' | 'max' | 'last';

/**
 * 그래프 한 장.
 *
 * agg — 한 주를 한 칸으로 묶을 때: 투구수 · 운동은 더하고, 컨디션 · 체중 · 칼로리는
 * 적은 날의 평균, 구속은 그 주의 최고.
 * total — 기간 전체를 한 숫자로: 합 · 최고 · 평균 · 가장 최근(체중).
 * change — 앞 기간과 견주는 법: 양은 몇 % 달라졌나, 수치는 얼마나 달라졌나.
 * tone — 글자색 토큰. 그래프는 currentColor 로 칠해 칸마다 색 하나만 정하면 된다.
 * 라이브러리 카테고리 색을 빌려 쓴다(컨디션 = 회복의 초록 등).
 */
const METRICS: {
  key: MetricKey;
  label: string;
  kind: 'bar' | 'line';
  agg: Combine;
  total: Combine;
  change: 'pct' | 'diff';
  tone: string;
}[] = [
  {
    key: 'pitches',
    label: '투구수',
    kind: 'bar',
    agg: 'sum',
    total: 'sum',
    change: 'pct',
    tone: 'text-sky',
  },
  {
    key: 'velocity',
    label: '최고 구속',
    kind: 'line',
    agg: 'max',
    total: 'max',
    change: 'diff',
    tone: 'text-cat-power',
  },
  {
    key: 'condition',
    label: '컨디션',
    kind: 'line',
    agg: 'avg',
    total: 'avg',
    change: 'diff',
    tone: 'text-cat-recovery',
  },
  {
    key: 'weight',
    label: '체중',
    kind: 'line',
    agg: 'avg',
    total: 'last',
    change: 'diff',
    tone: 'text-cat-mobility',
  },
  {
    key: 'kcal',
    label: '먹은 칼로리',
    kind: 'bar',
    agg: 'avg',
    total: 'avg',
    change: 'pct',
    tone: 'text-cat-armcare',
  },
  {
    key: 'training',
    label: '운동',
    kind: 'bar',
    agg: 'sum',
    total: 'sum',
    change: 'pct',
    tone: 'text-cat-lower',
  },
];

function combine(values: (number | null)[], how: Combine): number | null {
  const got = values.filter((v): v is number => v != null);
  if (got.length === 0) return null;
  switch (how) {
    case 'sum':
      return got.reduce((a, b) => a + b, 0);
    case 'avg':
      return got.reduce((a, b) => a + b, 0) / got.length;
    case 'max':
      return Math.max(...got);
    case 'last':
      return got[got.length - 1];
  }
}

/** 큰 숫자 옆의 작은 말 — 그 숫자가 무엇을 센 것인지 */
function noteOf(key: MetricKey, got: number[]) {
  switch (key) {
    case 'pitches':
      return `${got.filter((v) => v > 0).length}일 던짐`;
    case 'velocity':
      return `${got.length}일 잼`;
    case 'condition':
      return `${got.length}일 평균`;
    case 'weight':
      return '가장 최근';
    case 'kcal':
      return `하루 평균 · ${got.length}일`;
    case 'training':
      return `${got.length}일 운동`;
  }
}

/** 9/3 */
function shortDate(key: string) {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

export function HomeTrends({
  today,
  logs,
  trainingByDay,
  nutritionByDay,
  checkinByDay,
  weightByDay,
  onJump,
}: {
  today: string;
  logs: Log[];
  trainingByDay: Record<string, TrainingDaySummary>;
  nutritionByDay: Record<string, NutritionDay>;
  checkinByDay: Record<string, CheckinDay>;
  /** 날짜별 체중(kg) — 영양 탭에 적은 것이 체크인보다 앞선다 */
  weightByDay: Record<string, number>;
  /** 캘린더가 그날을 고른다 */
  onJump: (date: string) => void;
}) {
  const [period, setPeriod] = useState<Period>('4w');
  const speedUnit = useSpeedUnit();
  const weightUnit = useWeightUnit();

  /* 날짜 → 값. 기록이 없는 날은 null(0 과 다르다 — '쉰 날'과 '안 적은 날'은 다르다) */
  const valueOf = useMemo(() => {
    const pitches: Record<string, number> = {};
    const velocity: Record<string, number> = {};
    for (const l of logs) {
      const day = l.date.slice(0, 10);
      pitches[day] = (pitches[day] ?? 0) + l.pitchCount;
      if (l.maxVelocity != null) {
        velocity[day] = Math.max(velocity[day] ?? 0, l.maxVelocity);
      }
    }
    return (key: MetricKey, day: string): number | null => {
      switch (key) {
        case 'pitches':
          return pitches[day] ?? null;
        case 'velocity':
          return velocity[day] ?? null;
        case 'condition':
          return checkinByDay[day]?.condition ?? null;
        case 'weight':
          return weightByDay[day] ?? null;
        case 'kcal':
          return nutritionByDay[day]?.kcal || null;
        case 'training':
          return trainingByDay[day]?.count || null;
      }
    };
  }, [logs, checkinByDay, weightByDay, nutritionByDay, trainingByDay]);

  /* 이번 기간의 칸들과, 견줄 바로 앞 기간(같은 길이) */
  const slots = useMemo(() => slotsFor(period, today), [period, today]);
  const before = useMemo(
    () => slotsFor(period, shiftDateKey(today, -PERIOD_DAYS[period])),
    [period, today]
  );

  /** 값을 화면 글자로 — 단위는 고른 것(km/h · mph, kg · lb)을 따른다 */
  const format = (key: MetricKey, v: number): [string, string] => {
    switch (key) {
      case 'pitches':
        return [Math.round(v).toLocaleString('ko-KR'), '구'];
      case 'velocity':
        return [String(round1(toSpeed(v, speedUnit))), speedLabel(speedUnit)];
      case 'condition':
        return [String(round1(v)), '/10'];
      case 'weight':
        return [String(round1(toWeight(v, weightUnit))), weightUnit];
      case 'kcal':
        return [Math.round(v).toLocaleString('ko-KR'), 'kcal'];
      case 'training':
        return [String(Math.round(v)), '개'];
    }
  };

  const periodName = period === '4w' ? '4주' : '12주';

  return (
    /*
      h-full · flex-col — 옆의 분석 칸과 위아래 끝을 맞춘다. 두 칸은 한 줄(grid)에서 같은
      높이로 늘어나고, 그래프 상자가 남는 높이를 채운다(flex-1 · 줄은 똑같이 나눈다).
      분석이 길면 그래프가 그만큼 커진다.
    */
    <section
      aria-labelledby="trends-title"
      className="@container flex h-full flex-col gap-4 pt-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="trends-title"
            className="text-heading flex items-center gap-2 text-xl text-ink"
          >
            <ChartColumn aria-hidden className="h-5 w-5 text-sky" />
            그래프
          </h2>
          <p className="mt-1 text-sm text-muted">
            <b className="font-semibold text-ink">최근 {periodName}</b>
            {period === '4w' ? ' · 날짜별' : ' · 주별'}
            <span className="hidden @md:inline"> · 이전 {periodName}와 비교</span>
          </p>
        </div>
        <Segmented
          label="기간"
          value={period}
          onChange={setPeriod}
          options={PERIODS}
          tone="raised"
          itemClassName="px-4 py-1.5"
        />
      </div>

      {/*
        여섯 장은 한 상자 안에 — 칸 사이 선은 1px 틈에 깔린 바탕색이다(gap-px + bg-line).
        좁으면 두 장씩, 상자가 넓으면(48rem 이상) 세 장씩. 화면이 아니라 이 상자의 폭을
        본다(@container) — 분석 옆에 설 때와 밑에 설 때 폭이 두 배 가까이 다르다.

        기간을 바꾸면 새로 그린다(key) — 막대가 다시 솟고 선이 다시 그어진다.
      */}
      <div
        key={period}
        className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line @3xl:grid-cols-3"
      >
        {METRICS.map((m) => {
          const days = slots.flatMap((s) => s.days.map((d) => valueOf(m.key, d)));
          const got = days.filter((v): v is number => v != null);
          const now = combine(days, m.total);
          const then = combine(
            before.flatMap((s) => s.days.map((d) => valueOf(m.key, d))),
            m.total
          );
          const fmt = (v: number) => format(m.key, v);
          return (
            <TrendCell
              key={m.key}
              label={m.label}
              kind={m.kind}
              tone={m.tone}
              slots={slots}
              points={slots.map((s) =>
                combine(
                  s.days.map((d) => valueOf(m.key, d)),
                  m.agg
                )
              )}
              value={now == null ? null : fmt(now)}
              note={got.length > 0 ? noteOf(m.key, got) : ''}
              change={changeOf(m.change, now, then, fmt, periodName)}
              format={fmt}
              fixedDomain={m.key === 'condition' ? CONDITION_DOMAIN : null}
              daily={period === '4w'}
              onJump={onJump}
            />
          );
        })}
      </div>
    </section>
  );
}

type Change = { dir: -1 | 0 | 1; text: string; spoken: string };

/** 앞 기간보다 얼마나 달라졌나. 어느 한쪽이라도 기록이 없으면 견주지 않는다. */
function changeOf(
  how: 'pct' | 'diff',
  now: number | null,
  then: number | null,
  fmt: (v: number) => [string, string],
  periodName: string
): Change | null {
  if (now == null || then == null) return null;
  let dir: -1 | 0 | 1;
  let text: string;
  if (how === 'pct') {
    if (then <= 0) return null;
    const pct = Math.round(((now - then) / then) * 100);
    dir = pct > 0 ? 1 : pct < 0 ? -1 : 0;
    text = `${Math.abs(pct)}%`;
  } else {
    const [shown, unit] = fmt(Math.abs(now - then));
    dir = Number(shown) === 0 ? 0 : now > then ? 1 : -1;
    text = unit === '/10' ? shown : `${shown}${unit}`;
  }
  const verb = dir > 0 ? '늘었어요' : dir < 0 ? '줄었어요' : '같아요';
  return {
    dir,
    text,
    spoken: `이전 ${periodName}보다 ${dir === 0 ? '' : `${text} `}${verb}`,
  };
}

function TrendCell({
  label,
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
  onJump,
}: {
  label: string;
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
  onJump: (date: string) => void;
}) {
  const Arrow =
    change?.dir === 1 ? ArrowUpRight : change?.dir === -1 ? ArrowDownRight : Minus;
  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-surface px-4 pb-2 pt-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold text-muted">{label}</h3>
        {change && (
          <span
            title={change.spoken}
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
          >
            <Arrow aria-hidden className="h-3 w-3" strokeWidth={2.5} />
            {change.text}
            <span className="sr-only">{change.spoken}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-xl font-bold tabular-nums text-ink">
          {value ? value[0] : '—'}
          {value && (
            <span className="ml-0.5 text-xs font-medium text-muted">{value[1]}</span>
          )}
        </span>
        {note && <span className="truncate text-[11px] text-muted">{note}</span>}
      </p>
      <Chart
        kind={kind}
        tone={tone}
        slots={slots}
        points={points}
        spoken={`${label} — ${value ? value.join('') : '기록 없음'}${note ? `, ${note}` : ''}${change ? `, ${change.spoken}` : ''}`}
        format={format}
        fixedDomain={fixedDomain}
        daily={daily}
        onJump={onJump}
      />
    </div>
  );
}

/* ─────────────────────────── 그래프 그리기 ─────────────────────────── */

type Domain = { lo: number; hi: number; ticks: number[] };

/** 컨디션은 늘 0~10 — 칸마다 눈금이 달라지면 높낮이를 견줄 수 없다 */
const CONDITION_DOMAIN: Domain = { lo: 0, hi: 10, ticks: [0, 5, 10] };

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** 막대 — 0 부터, 가장 큰 값을 덮는 반듯한 숫자까지(눈금 0 · 가운데 · 끝) */
function barDomain(max: number): Domain {
  const mag = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  const hi = (NICE.find((k) => k * mag >= max) ?? 10) * mag;
  return { lo: 0, hi, ticks: [0, hi / 2, hi] };
}

const STEPS = [
  0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000,
];

/**
 * 선 — 값이 있는 범위만 확대한다(0 부터 그리면 체중 82kg 의 1kg 변화가 안 보인다).
 * 반듯한 간격 두 칸으로 가장 작은 값과 큰 값을 덮는다. 너무 확대해 작은 흔들림이 크게
 * 보이지 않게, 간격은 값의 1%(최소 0.5)보다 작아지지 않는다.
 */
function lineDomain(min: number, max: number): Domain {
  const floor = Math.max(Math.abs(max) * 0.01, 0.5);
  for (const step of STEPS) {
    if (step < floor) continue;
    const lo = Math.floor(min / step) * step;
    if (lo + 2 * step >= max)
      return { lo, hi: lo + 2 * step, ticks: [lo, lo + step, lo + 2 * step] };
  }
  return { lo: min, hi: max + 1, ticks: [min, max + 1] };
}

/**
 * 그래프 위 글자의 테두리 — 바탕색으로 두껍게 한 번 긋고 그 위에 글자를 칠한다
 * (paintOrder="stroke"). 평균 이름표와 최근 값이 선 · 막대와 겹쳐도 읽힌다.
 */
const HALO = 'stroke-surface';

/** 눈금 숫자 — 1,500 · 82.5 */
function tickText(v: number) {
  const r = round1(v);
  return Number.isInteger(r) ? r.toLocaleString('ko-KR') : String(r);
}

/**
 * 점들을 잇는 부드러운 곡선(단조 3차) — 점과 점 사이에서 위아래로 넘치지 않는다.
 * 그냥 곡선으로 이으면 오르다 내리는 자리에서 실제로 없던 봉우리가 생긴다.
 */
function smoothPath(p: [number, number][]) {
  if (p.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  if (p.length === 1) return `M${f(p[0][0])},${f(p[0][1])}`;
  const n = p.length;
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    m.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  }
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    d += ` C${f(p[i][0] + h)},${f(p[i][1] + t[i] * h)} ${f(p[i + 1][0] - h)},${f(
      p[i + 1][1] - t[i + 1] * h
    )} ${f(p[i + 1][0])},${f(p[i + 1][1])}`;
  }
  return d;
}

/**
 * 그래프 칸의 실제 크기(px). 그래프를 화면 픽셀 그대로 그려야 점이 찌그러지지 않고 글자
 * 크기가 칸마다 같다. 처음 크기는 그리기 전에 바로 재고(칸이 비어 보이는 틈이 없다),
 * 그 뒤로는 칸이 달라질 때마다(창 크기, 옆 분석의 길이) 다시 잰다.
 */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function Chart({
  kind,
  tone,
  slots,
  points,
  spoken,
  format,
  fixedDomain,
  daily,
  onJump,
}: {
  kind: 'bar' | 'line';
  tone: string;
  slots: Slot[];
  points: (number | null)[];
  spoken: string;
  format: (v: number) => [string, string];
  fixedDomain: Domain | null;
  daily: boolean;
  onJump: (date: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [hover, setHover] = useState<number | null>(null);
  /* 마우스로 누를 때만 캘린더로 옮긴다 — 손가락은 값을 보려고 누른다 */
  const pointer = useRef('mouse');
  const gradient = `trend-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const n = points.length;
  const got = points.filter(
    (v): v is number => v != null && (kind === 'line' || v > 0)
  );
  const empty = got.length === 0;

  /* ── 자리 셈 ── */
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const showY = w >= 190;
  const padL = showY ? 30 : 4;
  const padR = 6;
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
  const avg = got.length > 1 ? got.reduce((a, b) => a + b, 0) / got.length : null;
  const last = n - 1;

  /* 가로 눈금 — 4주는 한 주마다, 12주는 넉 주마다. 좁으면 처음과 끝만. */
  const xTicks = w < 190 ? [0, last] : daily ? [0, 7, 14, 21, last] : [0, 4, 8, last];
  const xText = (i: number) =>
    i === last ? (daily ? '오늘' : '이번 주') : shortDate(slots[i].start);

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - padL) / slotW);
    setHover(Math.min(last, Math.max(0, i)));
  };

  const linePoints: [number, number, number][] = points.flatMap((v, i) =>
    v == null ? [] : [[x(i), y(v), i] as [number, number, number]]
  );
  const latest = linePoints[linePoints.length - 1];
  /* 막대 중 가장 최근에 값이 있는 칸 — 진하게 칠하고 값을 붙인다 */
  const lastBar = points.reduce<number>((at, v, i) => (v ? i : at), -1);

  const hovered = hover == null ? null : points[hover];
  const tipText =
    hover == null
      ? ''
      : daily
        ? spokenDay(slots[hover].end)
        : `${shortDate(slots[hover].start)}~${shortDate(slots[hover].end)}`;

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
        if (e.pointerType === 'mouse' && !empty) pick(e);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setHover(null);
      }}
      onClick={() => {
        if (daily && hover != null && pointer.current === 'mouse')
          onJump(slots[hover].end);
      }}
    >
      {empty ? (
        <p className="absolute inset-0 mb-1.5 flex items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-muted">
          이 기간 기록이 없어요
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

            {/* 세로 눈금 — 가로줄 셋과 숫자. 맨 아래(바닥)만 실선. */}
            {dom.ticks.map((t, k) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={y(t)}
                  y2={y(t)}
                  className="stroke-line"
                  strokeDasharray={k === 0 ? undefined : '3 4'}
                />
                {showY && (
                  <text
                    x={padL - 6}
                    y={y(t)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-muted text-[10px] tabular-nums"
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
                className="fill-muted text-[10px] tabular-nums"
              >
                {xText(i)}
              </text>
            ))}

            {kind === 'bar'
              ? /* 막대 — 밑에서 솟는다. 지난 칸은 조금 옅게, 가장 최근 칸은 진하게. */
                points.map((v, i) => {
                  if (!v) return null;
                  const bw = Math.max(2, Math.min(slotW * 0.62, 22));
                  return (
                    <rect
                      key={i}
                      x={x(i) - bw / 2}
                      y={y(v)}
                      width={bw}
                      height={Math.max(1, base - y(v))}
                      rx={Math.min(3, bw / 2)}
                      className={`origin-bottom fill-current transition-opacity duration-150 [transform-box:fill-box] motion-safe:animate-[trend-rise_560ms_cubic-bezier(0.22,1,0.36,1)_both] ${
                        hover != null
                          ? hover === i
                            ? ''
                            : 'opacity-30'
                          : i === lastBar
                            ? ''
                            : 'opacity-60'
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
                    {/* 가장 최근 값 — 점 옆에 숫자를 붙인다 */}
                    <text
                      x={latest[0] - 7}
                      y={latest[1] - 8 < padT ? latest[1] + 16 : latest[1] - 8}
                      textAnchor="end"
                      strokeWidth={3}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                      className={`fill-current text-[10px] font-bold tabular-nums motion-safe:animate-[trend-fade_400ms_ease-out_700ms_both] ${HALO}`}
                    >
                      {format(points[latest[2]] as number)[0]}
                    </text>
                  </g>
                )}

            {/* 막대의 가장 최근 값 — 막대 위에 숫자를 붙인다 */}
            {kind === 'bar' && lastBar >= 0 && (
              <text
                x={x(lastBar)}
                y={Math.max(y(points[lastBar] as number) - 5, 9)}
                textAnchor="middle"
                strokeWidth={3}
                paintOrder="stroke"
                strokeLinejoin="round"
                className={`fill-current text-[10px] font-bold tabular-nums motion-safe:animate-[trend-fade_400ms_ease-out_600ms_both] ${HALO}`}
              >
                {format(points[lastBar] as number)[0]}
              </text>
            )}

            {/* 평균 — 점선과 이름표(왼쪽 끝). 요즘 값이 평소보다 높은지 낮은지. */}
            {avg != null && (
              <g className="motion-safe:animate-[trend-fade_500ms_ease-out_500ms_both]">
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={y(avg)}
                  y2={y(avg)}
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeDasharray="4 3"
                />
                <text
                  x={padL + 3}
                  y={y(avg) - 4 < padT + 2 ? y(avg) + 11 : y(avg) - 4}
                  strokeWidth={3}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  className={`fill-current text-[10px] font-semibold tabular-nums ${HALO}`}
                >
                  평균 {format(avg)[0]}
                </text>
              </g>
            )}

            {/* 마우스가 가리키는 칸 — 세로 안내선 */}
            {hover != null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT}
                y2={base}
                className="stroke-ink/25"
                strokeDasharray="2 3"
              />
            )}
          </svg>
        )
      )}

      {/* 말풍선 — 가리킨 칸의 날짜(주)와 값 */}
      {size && hover != null && !empty && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-center text-[11px] leading-snug text-surface shadow-lg"
          style={{
            left: Math.min(Math.max(x(hover), 46), w - 46),
            top: (hovered != null ? y(hovered) : base) - 8,
          }}
        >
          <span className="block opacity-70">{tipText}</span>
          <span className="block font-semibold tabular-nums">
            {hovered != null ? format(hovered).join('') : '기록 없음'}
          </span>
        </div>
      )}
    </div>
  );
}
