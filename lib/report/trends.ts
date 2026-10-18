import { shiftDateKey } from '@/lib/pitch-stats';
import { round1, speedLabel, toSpeed, toWeight, type SpeedUnit, type WeightUnit } from '@/lib/units';

/**
 * 분석 · 그래프 화면의 '그래프' 셈 — 웹(app/(app)/today/home-trends.tsx)과 아이폰 앱(native/src/app/analysis.tsx)이 같이 쓴다.
 * 칸 나누기 · 한 칸으로 묶기 · 앞 기간과 견주기 · 눈금이 둘에서 따로 놀면 같은 날의 숫자가 화면마다 달라진다. 그리기는 각자.
 * 웹에서는 순수 계산만 떼어 왔다(2026-10-18) — 숨은 뜻 · 까닭은 그대로 아래 주석에.
 */

/** 그래프가 보여 줄 기간(YYYY-MM-DD, 양 끝 포함) */
export type Range = { from: string; to: string };

/** 그래프의 한 칸 — 하루, 또는 한 주(일곱 날) */
export type Slot = { days: string[]; start: string; end: string };

/** 두 날 사이가 며칠인가 (b − a) */
export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  );
}

/** 그 기간의 모든 날 */
export function daysOf({ from, to }: Range) {
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) =>
    shiftDateKey(from, i)
  );
}

/**
 * 기간을 그래프 칸으로 나눈다 — 45일까지는 하루씩, 그보다 길면 한 주씩.
 *
 * 한 주는 끝날에서 거꾸로 이레씩 묶는다(마지막 칸이 '이번 주'가 되게). 맨 앞 칸은 기간
 * 시작보다 앞선 날을 빼서 이레가 안 될 수 있다. 하루씩으로 석 달을 그리면 막대가 90개라
 * 한 칸이 실처럼 가늘어진다.
 */
export function slotsOf(range: Range): { slots: Slot[]; daily: boolean } {
  const span = daysBetween(range.from, range.to) + 1;
  if (span <= 45) {
    return {
      daily: true,
      slots: daysOf(range).map((d) => ({ days: [d], start: d, end: d })),
    };
  }
  const weeks = Math.ceil(span / 7);
  return {
    daily: false,
    slots: Array.from({ length: weeks }, (_, i) => {
      const end = shiftDateKey(range.to, -(weeks - 1 - i) * 7);
      const days = Array.from({ length: 7 }, (_, k) => shiftDateKey(end, k - 6)).filter(
        (d) => d >= range.from
      );
      return { days, start: days[0], end };
    }),
  };
}

export type MetricKey = 'pitches' | 'velocity' | 'condition' | 'weight' | 'kcal' | 'training';
export type Combine = 'sum' | 'avg' | 'max' | 'last';

/**
 * 그래프 한 장(그림 · 색은 화면이 붙인다).
 *
 * agg — 한 주를 한 칸으로 묶을 때: 투구수 · 운동은 더하고, 컨디션 · 체중 · 칼로리는
 * 적은 날의 평균, 구속은 그 주의 최고.
 * total — 기간 전체를 한 숫자로: 합 · 최고 · 평균 · 가장 최근(체중).
 * change — 앞 기간과 견주는 법: 양은 몇 % 달라졌나, 수치는 얼마나 달라졌나.
 */
export type MetricSpec = {
  key: MetricKey;
  label: string;
  kind: 'bar' | 'line';
  agg: Combine;
  total: Combine;
  change: 'pct' | 'diff';
};

export const METRIC_SPECS: MetricSpec[] = [
  { key: 'pitches', label: '투구수', kind: 'bar', agg: 'sum', total: 'sum', change: 'pct' },
  { key: 'velocity', label: '최고 구속', kind: 'line', agg: 'max', total: 'max', change: 'diff' },
  { key: 'condition', label: '컨디션', kind: 'line', agg: 'avg', total: 'avg', change: 'diff' },
  { key: 'weight', label: '체중', kind: 'line', agg: 'avg', total: 'last', change: 'diff' },
  { key: 'kcal', label: '먹은 칼로리', kind: 'bar', agg: 'avg', total: 'avg', change: 'pct' },
  { key: 'training', label: '운동', kind: 'bar', agg: 'sum', total: 'sum', change: 'pct' },
];

/** 그 분석의 그래프 — 투구는 투구수 · 최고 구속, 트레이닝은 운동만(2026-10-14 '투구만 · 트레이닝만') */
export const ANALYSIS_METRICS: Record<'pitch' | 'training', MetricKey[]> = {
  pitch: ['pitches', 'velocity'],
  training: ['training'],
};

export function combine(values: (number | null)[], how: Combine): number | null {
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

/** 그래프가 읽는 날짜별 재료 — 홈 캘린더가 칸을 칠하려고 이미 든 요약(app/(app)/today/history.ts) */
export type TrendSource = {
  logs: { date: string; pitchCount: number; maxVelocity: number | null }[];
  checkinByDay?: Record<string, { condition: number | null } | undefined>;
  weightByDay?: Record<string, number>;
  nutritionByDay?: Record<string, { kcal: number } | undefined>;
  trainingByDay?: Record<string, { count: number } | undefined>;
};

/** 날짜 → 값. 기록이 없는 날은 null(0 과 다르다 — '쉰 날'과 '안 적은 날'은 다르다) */
export function trendValues(src: TrendSource) {
  const pitches: Record<string, number> = {};
  const velocity: Record<string, number> = {};
  for (const l of src.logs) {
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
        return src.checkinByDay?.[day]?.condition ?? null;
      case 'weight':
        return src.weightByDay?.[day] ?? null;
      case 'kcal':
        return src.nutritionByDay?.[day]?.kcal || null;
      case 'training':
        return src.trainingByDay?.[day]?.count || null;
    }
  };
}

/** 값을 화면 글자로 — 단위는 고른 것(km/h · mph, kg · lb)을 따른다 */
export function formatMetric(
  key: MetricKey,
  v: number,
  speedUnit: SpeedUnit,
  weightUnit: WeightUnit
): [string, string] {
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
}

/** 큰 숫자 옆의 작은 말 — 그 숫자가 무엇을 센 것인지 */
export function noteOf(key: MetricKey, got: number[], fmt: (v: number) => [string, string]) {
  /* 평균은 그래프 위 이름표 대신 여기 글로 — 건강 앱이 '일평균'을 숫자 밑에 쓰듯(2026-10-04) */
  const mean = (vs: number[]) => vs.reduce((a, b) => a + b, 0) / vs.length;
  switch (key) {
    case 'pitches': {
      const thrown = got.filter((v) => v > 0);
      /* 쉰 날만 적었으면 평균이 없다('평균 NaN구'가 떴다) */
      if (thrown.length === 0) return '0일 던짐';
      return `${thrown.length}일 던짐 · 평균 ${fmt(mean(thrown)).join('')}`;
    }
    case 'velocity':
      return `${got.length}일 잼 · 평균 ${fmt(mean(got)).join('')}`;
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

/** '이전 4주와' · '앞 83일과' — 마지막 글자에 받침이 있으면 '과', 없으면 '와' */
export function withAnd(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasFinal ? '과' : '와'}`;
}

/** 9/3 */
export function shortDate(key: string) {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * '9월 24일 (수)'.
 *
 * UTC 로 읽는 이유: 날짜 키는 그냥 달력의 칸 이름이지 시각이 아니다. 지역
 * 시간으로 새 Date 를 만들면 시간대에 따라 하루 밀려 요일이 틀어진다.
 */
export function spokenDay(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** '오늘' · '어제' · '3일 전' · '2주 전' — 오늘에서 얼마나 떨어졌나 */
export function agoText(date: string, today: string) {
  if (date === today) return '오늘';
  const days = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) /
      86_400_000
  );
  /* 앞날 — 홈 캘린더는 일정을 적으러 앞날도 연다 */
  if (days === -1) return '내일';
  if (days < 0) return -days < 60 ? `${-days}일 뒤` : `${Math.floor(-days / 30)}달 뒤`;
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 60) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}달 전`;
}

export type Change = { dir: -1 | 0 | 1; text: string; spoken: string };

/** 앞 기간보다 얼마나 달라졌나. 어느 한쪽이라도 기록이 없으면 견주지 않는다. */
export function changeOf(
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

/** 카드 한 장의 숫자 — 큰 숫자 · 밑 한 줄 · 앞 기간과 견줌 · 칸마다 값 */
export type TrendCard = {
  value: [string, string] | null;
  note: string;
  change: Change | null;
  points: (number | null)[];
};

/**
 * 카드 한 장 — 기간 전체를 한 숫자로(total), 바로 앞 같은 길이(before, 없으면 견주지 않는다)와 견주고, 칸(slots)마다 묶는다(agg).
 */
export function trendCardOf(
  m: MetricSpec,
  valueOf: (key: MetricKey, day: string) => number | null,
  days: string[],
  before: string[] | null,
  slots: Slot[],
  fmt: (v: number) => [string, string],
  periodName: string
): TrendCard {
  const values = days.map((d) => valueOf(m.key, d));
  const got = values.filter((v): v is number => v != null);
  const now = combine(values, m.total);
  const then = before ? combine(before.map((d) => valueOf(m.key, d)), m.total) : null;
  return {
    value: now == null ? null : fmt(now),
    note: got.length > 0 ? noteOf(m.key, got, fmt) : '',
    change: changeOf(m.change, now, then, fmt, periodName),
    points: slots.map((s) => combine(s.days.map((d) => valueOf(m.key, d)), m.agg)),
  };
}

/* ─────────────────────────── 눈금 ─────────────────────────── */

export type Domain = { lo: number; hi: number; ticks: number[] };

/** 컨디션은 늘 0~10 — 칸마다 눈금이 달라지면 높낮이를 견줄 수 없다 */
export const CONDITION_DOMAIN: Domain = { lo: 0, hi: 10, ticks: [0, 5, 10] };

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** 막대 — 0 부터, 가장 큰 값을 덮는 반듯한 숫자까지(눈금 0 · 가운데 · 끝) */
export function barDomain(max: number): Domain {
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
export function lineDomain(min: number, max: number): Domain {
  const floor = Math.max(Math.abs(max) * 0.01, 0.5);
  for (const step of STEPS) {
    if (step < floor) continue;
    const lo = Math.floor(min / step) * step;
    if (lo + 2 * step >= max)
      return { lo, hi: lo + 2 * step, ticks: [lo, lo + step, lo + 2 * step] };
  }
  return { lo: min, hi: max + 1, ticks: [min, max + 1] };
}

/** 그래프의 세로 범위 — 기록이 없으면 null */
export function domainOf(
  kind: 'bar' | 'line',
  key: MetricKey,
  points: (number | null)[]
): Domain | null {
  const got = points.filter((v): v is number => v != null && (kind === 'line' || v > 0));
  if (got.length === 0) return null;
  if (kind === 'bar') return barDomain(Math.max(...got));
  return key === 'condition' ? CONDITION_DOMAIN : lineDomain(Math.min(...got), Math.max(...got));
}

/** 눈금 숫자 — 1,500 · 82.5 */
export function tickText(v: number) {
  const r = round1(v);
  return Number.isInteger(r) ? r.toLocaleString('ko-KR') : String(r);
}

/**
 * 가로 눈금 — 처음 · 4분의 1 · 가운데 · 4분의 3 · 끝(4주면 대략 한 주마다). 좁으면 처음과
 * 끝만. 기간이 오늘로 끝나면 끝 눈금은 '오늘' · '이번 주'.
 */
export function xTicksOf(n: number, narrow: boolean) {
  const last = n - 1;
  return narrow || n < 5
    ? [...new Set([0, last])]
    : [
        ...new Set([
          0,
          Math.round(last / 4),
          Math.round(last / 2),
          Math.round((last * 3) / 4),
          last,
        ]),
      ];
}

export function xTickText(i: number, slots: Slot[], daily: boolean, endsToday: boolean) {
  return i === slots.length - 1
    ? endsToday
      ? daily
        ? '오늘'
        : '이번 주'
      : shortDate(slots[i].end)
    : shortDate(slots[i].start);
}
