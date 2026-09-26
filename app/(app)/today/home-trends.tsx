'use client';

import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChartColumn } from 'lucide-react';
import { Segmented } from '@/components/segmented';
import { useSpeedUnit, useWeightUnit } from '@/components/use-units';
import { round1, speedLabel, toSpeed, toWeight } from '@/lib/units';
import { shiftDateKey } from '@/lib/pitch-stats';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { TrainingDaySummary } from '@/lib/report/training-history';
import { spokenDay, type CheckinDay, type NutritionDay } from './day-summary';

/**
 * 홈의 '기록 추이' — 이 앱에 쌓인 기록을 그래프 여섯 개로 한눈에 본다.
 *
 * 분석 칸 옆(넓은 화면)이나 밑(좁은 화면)에 선다. 분석은 '그날 어땠나'를 글과 지표로
 * 보여 주고, 여기는 '요즘 어떻게 흘러가나'를 모양으로 보여 준다 — 투구수 · 최고 구속 ·
 * 컨디션 · 체중 · 먹은 칼로리 · 운동.
 *
 * 새로 묻지 않는다. 홈 캘린더가 칸을 칠하려고 이미 들고 있는 날짜별 요약(투구 기록 ·
 * 체크인 · 영양 · 운동)을 모아 그린다 — 같은 날의 숫자가 캘린더와 그래프에서 다를 수
 * 없다. 체중만 캘린더가 안 쓰던 것이라 함께 받아 온다(app/(app)/today/page.tsx).
 *
 * 기간은 4주(날짜별)와 12주(주별). 그래프에 마우스를 올리면 그날(그 주) 값이 제목 줄에
 * 뜨고, 4주에서 누르면 캘린더가 그날을 고른다 — 그날 칸과 분석이 함께 그날로 바뀐다.
 * 휴대폰에서는 눌러서 값을 본다(누른다고 캘린더로 옮기지 않는다 — 캘린더가 화면 밖이다).
 */

const PERIODS = [
  { value: '4w', label: '4주' },
  { value: '12w', label: '12주' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

/** 그래프의 한 칸 — 4주는 하루, 12주는 한 주(일곱 날) */
type Slot = { days: string[]; start: string; end: string };

function slotsFor(period: Period, today: string): Slot[] {
  if (period === '4w') {
    return Array.from({ length: 28 }, (_, i) => {
      const day = shiftDateKey(today, i - 27);
      return { days: [day], start: day, end: day };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const end = shiftDateKey(today, -(11 - i) * 7);
    const days = Array.from({ length: 7 }, (_, k) => shiftDateKey(end, k - 6));
    return { days, start: days[0], end };
  });
}

type MetricKey = 'pitches' | 'velocity' | 'condition' | 'weight' | 'kcal' | 'training';

/**
 * 그래프 하나.
 *
 * agg — 한 주를 한 칸으로 묶을 때: 투구수 · 운동은 더하고, 컨디션 · 체중 · 칼로리는
 * 적은 날의 평균, 구속은 그 주의 최고.
 *
 * tone — 글자색 토큰. 그래프는 currentColor 로 칠해 칸마다 색 하나만 정하면 된다.
 * 라이브러리 카테고리 색을 빌려 쓴다(컨디션 = 회복의 초록 등).
 */
const METRICS: {
  key: MetricKey;
  label: string;
  kind: 'bar' | 'line';
  agg: 'sum' | 'avg' | 'max';
  tone: string;
}[] = [
  { key: 'pitches', label: '투구수', kind: 'bar', agg: 'sum', tone: 'text-sky' },
  {
    key: 'velocity',
    label: '최고 구속',
    kind: 'line',
    agg: 'max',
    tone: 'text-cat-power',
  },
  {
    key: 'condition',
    label: '컨디션',
    kind: 'line',
    agg: 'avg',
    tone: 'text-cat-recovery',
  },
  { key: 'weight', label: '체중', kind: 'line', agg: 'avg', tone: 'text-cat-mobility' },
  {
    key: 'kcal',
    label: '먹은 칼로리',
    kind: 'bar',
    agg: 'avg',
    tone: 'text-cat-armcare',
  },
  { key: 'training', label: '운동', kind: 'bar', agg: 'sum', tone: 'text-cat-lower' },
];

function aggregate(values: (number | null)[], agg: 'sum' | 'avg' | 'max') {
  const got = values.filter((v): v is number => v != null);
  if (got.length === 0) return null;
  if (agg === 'max') return Math.max(...got);
  const sum = got.reduce((a, b) => a + b, 0);
  return agg === 'sum' ? sum : sum / got.length;
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

  const slots = useMemo(() => slotsFor(period, today), [period, today]);

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

  return (
    <section aria-labelledby="trends-title" className="@container space-y-4 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="trends-title"
            className="text-heading flex items-center gap-2 text-xl text-ink"
          >
            <ChartColumn aria-hidden className="h-5 w-5 text-sky" />
            기록 추이
          </h2>
          <p className="mt-1 text-sm text-muted">
            <b className="font-semibold text-ink">
              {period === '4w' ? '최근 4주' : '최근 12주'}
            </b>
            {period === '4w' ? ' · 날짜별' : ' · 주별'}
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
        여섯 칸은 한 상자 안에 — 칸 사이 선은 1px 틈에 깔린 바탕색이다(gap-px + bg-line).
        좁으면 두 칸씩, 상자가 넓으면(48rem 이상) 세 칸씩. 화면이 아니라 이 상자의 폭을
        본다(@container) — 분석 옆에 설 때와 밑에 설 때 폭이 두 배 가까이 다르다.

        기간을 바꾸면 새로 그린다(key) — 막대가 다시 솟고 선이 다시 그어진다.
      */}
      <div
        key={period}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line @3xl:grid-cols-3"
      >
        {METRICS.map((m) => {
          const all = slots.flatMap((s) => s.days.map((d) => valueOf(m.key, d)));
          const points = slots.map((s) =>
            aggregate(
              s.days.map((d) => valueOf(m.key, d)),
              m.agg
            )
          );
          return (
            <TrendCell
              key={m.key}
              label={m.label}
              kind={m.kind}
              tone={m.tone}
              slots={slots}
              points={points}
              summary={summaryOf(m.key, all, format, weightUnit)}
              format={(v) => format(m.key, v)}
              fixedDomain={m.key === 'condition' ? [1, 10] : null}
              daily={period === '4w'}
              onJump={onJump}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * 기간 전체를 한 줄로 — 칸 제목 밑의 큰 숫자와 오른쪽 작은 말.
 *
 * 투구수 · 운동은 기간 합, 구속은 최고, 컨디션 · 칼로리는 적은 날의 평균, 체중은 가장
 * 최근 값과 기간 처음보다 얼마나 달라졌나.
 */
function summaryOf(
  key: MetricKey,
  all: (number | null)[],
  format: (key: MetricKey, v: number) => [string, string],
  weightUnit: string
): { value: [string, string] | null; note: string } {
  const got = all.filter((v): v is number => v != null);
  if (got.length === 0) return { value: null, note: '' };
  const sum = got.reduce((a, b) => a + b, 0);
  switch (key) {
    case 'pitches':
      return {
        value: format(key, sum),
        note: `${got.filter((v) => v > 0).length}일 던짐`,
      };
    case 'velocity':
      return { value: format(key, Math.max(...got)), note: `${got.length}일 잼` };
    case 'condition':
      return { value: format(key, sum / got.length), note: `평균 · ${got.length}일` };
    case 'weight': {
      const last = got[got.length - 1];
      const change = got.length > 1 ? last - got[0] : null;
      if (change == null) return { value: format(key, last), note: '1일 기록' };
      const [shown] = format(key, Math.abs(change));
      return {
        value: format(key, last),
        note:
          Number(shown) === 0
            ? '변화 없음'
            : `처음보다 ${change > 0 ? '+' : '−'}${shown}${weightUnit}`,
      };
    }
    case 'kcal':
      return {
        value: format(key, sum / got.length),
        note: `하루 평균 · ${got.length}일`,
      };
    case 'training':
      return { value: format(key, sum), note: `${got.length}일 운동` };
  }
}

function TrendCell({
  label,
  kind,
  tone,
  slots,
  points,
  summary,
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
  summary: { value: [string, string] | null; note: string };
  format: (v: number) => [string, string];
  /** 세로 눈금을 고정할 때(컨디션 1~10) — 없으면 값의 범위에 맞춘다 */
  fixedDomain: [number, number] | null;
  /** 4주(날짜별)인가 — 누르면 캘린더가 그날을 고른다 */
  daily: boolean;
  onJump: (date: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  /* 마우스로 누를 때만 캘린더로 옮긴다 — 손가락은 값을 보려고 누른다 */
  const pointer = useRef<string>('mouse');
  const n = points.length;
  const got = points.filter((v): v is number => v != null && v > 0);
  const empty = got.length === 0;

  const x = (i: number) => ((i + 0.5) / n) * 100;

  /* 막대는 0 부터, 선은 값의 범위(위아래로 조금 띄워서) */
  const barMax = Math.max(1, ...got);
  const [lo, hi] = (() => {
    if (fixedDomain) return fixedDomain;
    if (empty) return [0, 1];
    const min = Math.min(...got);
    const max = Math.max(...got);
    const pad = Math.max((max - min) * 0.25, Math.abs(max) * 0.02, 0.5);
    return [min - pad, max + pad];
  })();
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;

  const pickAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * n);
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const shown = hover == null ? null : points[hover];
  const slot = hover == null ? null : slots[hover];
  const slotText = slot
    ? daily
      ? spokenDay(slot.end)
      : `${shortDate(slot.start)}~${shortDate(slot.end)}`
    : null;
  const [valueText, unitText] =
    hover != null
      ? shown != null
        ? format(shown)
        : ['—', '']
      : (summary.value ?? ['—', '']);
  const lineCoords = points
    .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <div className="min-w-0 bg-surface px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="shrink-0 text-xs font-semibold text-muted">{label}</h3>
        <span className="min-w-0 truncate text-[11px] tabular-nums text-muted">
          {slotText ?? summary.note}
        </span>
      </div>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-ink">
        {valueText}
        {unitText && (
          <span className="ml-0.5 text-xs font-medium text-muted">{unitText}</span>
        )}
      </p>

      {empty ? (
        <p className="mt-2 flex h-14 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-muted">
          이 기간 기록이 없어요
        </p>
      ) : (
        <div
          role="img"
          aria-label={`${label} — ${summary.value ? summary.value.join('') : '기록 없음'}${summary.note ? `, ${summary.note}` : ''}`}
          className={`relative mt-2 h-14 touch-pan-y ${tone} ${daily ? 'cursor-pointer' : ''}`}
          onPointerDown={(e) => {
            pointer.current = e.pointerType;
            pickAt(e);
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') pickAt(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setHover(null);
          }}
          onClick={() => {
            if (daily && hover != null && pointer.current === 'mouse') {
              onJump(slots[hover].end);
            }
          }}
        >
          {kind === 'bar' ? (
            /*
              막대 — 밑에서 솟는다(한 칸씩 조금씩 늦게). 값이 바뀌면(기록을 남기면) 높이가
              그 자리에서 이어서 바뀐다.
            */
            <div aria-hidden className="absolute inset-0 flex items-end gap-px">
              {points.map((v, i) => (
                <span key={i} className="flex h-full min-w-0 flex-1 items-end">
                  <span
                    className={`block w-full origin-bottom rounded-t-[3px] bg-current transition-[height,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:animate-[trend-rise_560ms_cubic-bezier(0.22,1,0.36,1)_both] ${
                      hover != null && hover !== i ? 'opacity-35' : ''
                    }`}
                    style={{
                      height: v ? `${Math.max(6, (v / barMax) * 100)}%` : '0%',
                      animationDelay: `${Math.round((i / n) * 240)}ms`,
                    }}
                  />
                </span>
              ))}
            </div>
          ) : (
            /* 선 — 왼쪽에서 오른쪽으로 그어진다(clip-path). 적은 날마다 점을 찍는다. */
            <div
              aria-hidden
              className="absolute inset-0 motion-safe:animate-[trend-reveal_700ms_cubic-bezier(0.22,1,0.36,1)_both]"
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                <polyline
                  points={lineCoords}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.85}
                />
              </svg>
              {points.map((v, i) =>
                v == null ? null : (
                  <span
                    key={i}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface transition-[width,height] duration-150 ${
                      hover === i ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'
                    }`}
                    style={{ left: `${x(i)}%`, top: `${y(v)}%` }}
                  />
                )
              )}
            </div>
          )}
          {hover != null && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-ink/15"
              style={{ left: `${x(hover)}%` }}
            />
          )}
        </div>
      )}

      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted">
        <span>{shortDate(slots[0].start)}</span>
        <span>{daily ? '오늘' : '이번 주'}</span>
      </div>
    </div>
  );
}
