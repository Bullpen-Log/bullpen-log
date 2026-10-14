import { shiftDateKey } from '@/lib/pitch-stats';
import { ACWR_ZONES, type AcwrZone } from '@/lib/pitch-stats';
import type { Highlight, HighlightChart } from '@/lib/report/highlights';

/**
 * 홈 요약 칸(우리끼리 '뉴스')의 여섯 장 — 순수 계산(DB 없음). 재료는 app/(app)/today/feed.tsx 가 읽어 넘기고, 그리기는 feed-card.tsx.
 *
 * 2026-10-14 사용자: "뉴스에 띄울 모든 기록을 다 띄운 상태에서, 기록이 없으면 '기록 없음', 오늘만 없으면 과거 기록으로 의미 있는 자료
 * (통계 · 그래프)를". 그래서 장은 늘 여섯(투구량 → 구속 → 부하 지수 → 컨디션 → 운동 → 영양)이고, 장마다 세 상태 가운데 하나다:
 *   today  오늘 값 + 그래프
 *   past   오늘은 없지만 창(투구 6주 · 체크인 두 달 · 운동 2주 · 식사 1주) 안에 기록이 있다 — 지난 기록의 통계 + 그래프
 *   none   창 안에 아무것도 없다 — '기록 없음 · 남기러 가기'
 * 하이라이트('달라진 것', lib/report/highlights.ts)는 장을 더하지 않고 해당 장의 문장 · 그래프 · 경고색을 바꾼다.
 */

export type FeedTone = 'today' | 'past' | 'none';

export type FeedItem = {
  key: 'pitches' | 'velocity' | 'load' | 'condition' | 'workout' | 'nutrition';
  /** 위 작은 이름표(투구량 · 구속 · 부하 지수 · 컨디션 · 운동 · 영양) */
  label: string;
  /** 문장. 구속은 {speed} · {diff} 자리로 — 단위(km/h · mph)는 이 기기 설정으로 */
  text: string;
  /** 밑 작은 줄 */
  sub?: string;
  speed?: number;
  diff?: number;
  /** 누르면 갈 곳. 없으면 누르지 않는 장(checkin 이면 체크인 흐름을 연다) */
  href: string | null;
  /** 체크인 흐름을 여는 장(OpenCheckinButton) */
  checkin?: boolean;
  /** 안전에 관한 것 — 경고색 */
  warn?: boolean;
  chart?: HighlightChart | null;
  /** 이름표 옆 아이콘(components/nav-icons.tsx 의 열쇠) */
  icon: 'baseball' | 'gauge' | 'shield' | 'dumbbell' | 'utensils';
  tone: FeedTone;
};

export type FeedInput = {
  /** 오늘 YYYY-MM-DD(한국 시각) */
  today: string;
  load: { zone: AcwrZone | null; ratio: number | null };
  /** 날짜별 던진 공 수 — 최근 42일 */
  pitchesByDay: Record<string, number>;
  /** 마지막으로 남긴 투구 기록 날(쉬는 날 포함). 없으면 null */
  lastLogDate: string | null;
  /** 날짜별 최고 구속(km/h) — 최근 42일 */
  velocityByDay: Record<string, number>;
  /** 최근 이레 앞의 역대 최고 구속(km/h). 없으면 null */
  bestBefore: number | null;
  /** 날짜별 컨디션(1~10) — 최근 두 달 */
  conditionByDay: Record<string, number>;
  /** 평소 컨디션(28일 중앙값, lib/report/facts.ts). 모르면 null */
  usualCondition: number | null;
  /** 체크인한 날 — 두 달 */
  checkinDays: string[];
  /** 운동한 날 — 최근 14일 */
  workoutDays: string[];
  /** 오늘 운동 일정 — 없거나 멈춘 날은 null */
  workout: {
    label: string;
    minutes: number;
    done: number;
    total: number;
    goal: string | null;
  } | null;
  nutrition: {
    /** 오늘 균형 점수(음식을 적었거나 식욕 · 끼니를 답한 날). 없으면 null */
    score: number | null;
    headline: string | null;
    /** '탄수화물 +30g · 단백질 충분 · 지방 20~30g' 같은 셋 */
    parts: string[];
    /** 오늘 먹은 kcal(0 이면 안 적음) */
    todayKcal: number;
    targetKcal: number;
    /** 최근 7일(오늘 뺌) 가운데 음식을 적은 날의 평균 kcal · 날 수. 없으면 null */
    week: { avgKcal: number; days: number } | null;
  };
  /** 하이라이트 — 홈 몫 전부(part 없이). 해당 장의 말을 바꾼다 */
  highlights: Highlight[];
};

const ANALYSIS = '/coach';

/** today+from ~ today+to(포함) 날짜 키, 오래된 것부터 */
function days(today: string, from: number, to: number) {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(shiftDateKey(today, i));
  return out;
}

function maxOf(values: (number | undefined)[]) {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.max(...nums) : null;
}

/** '10월 3일' */
function monthDay(key: string) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일`;
}

function runBack(start: string, ok: (key: string) => boolean) {
  let n = 0;
  for (let k = start; ok(k); k = shiftDateKey(k, -1)) n++;
  return n;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 하이라이트 열쇠 → 장. 없는 열쇠(away · steady 의 '이번 주')는 투구량 장에 */
const SLOT_OF: Record<Highlight['key'], FeedItem['key']> = {
  load: 'load',
  condition: 'condition',
  gap: 'pitches',
  away: 'pitches',
  steady: 'pitches',
  velocity: 'velocity',
  training: 'workout',
  streak: 'condition',
};

export function buildFeedItems(input: FeedInput): FeedItem[] {
  const { today, load, pitchesByDay, velocityByDay, conditionByDay } = input;
  const week = days(today, -6, 0);
  const none = (
    key: FeedItem['key'],
    label: string,
    icon: FeedItem['icon'],
    href: string | null,
    checkin = false
  ): FeedItem => ({
    key,
    label,
    icon,
    text: '기록 없음',
    sub: '남기러 가기',
    href,
    checkin: checkin || undefined,
    chart: null,
    tone: 'none',
  });

  /* ── 1. 투구량 ── */
  const weekBars: HighlightChart = {
    kind: 'bars',
    values: [3, 2, 1, 0].map((w) =>
      days(today, -6 - 7 * w, -7 * w).reduce((n, k) => n + (pitchesByDay[k] ?? 0), 0)
    ),
  };
  const monthPitches = weekBars.values.reduce((a, b) => a + b, 0);
  const pitchDays = Object.keys(pitchesByDay).filter((k) => (pitchesByDay[k] ?? 0) > 0);
  const lastPitchDay = pitchDays.length ? pitchDays.sort().at(-1)! : null;
  let pitches: FeedItem;
  if ((pitchesByDay[today] ?? 0) > 0) {
    const w = week.reduce((n, k) => n + (pitchesByDay[k] ?? 0), 0);
    pitches = {
      key: 'pitches',
      label: '투구량',
      icon: 'baseball',
      text: `오늘 ${pitchesByDay[today]}구 던졌어요.`,
      sub: `최근 7일 ${w}구 · 4주 ${monthPitches}구`,
      href: `/pitch-log/${today}`,
      chart: weekBars,
      tone: 'today',
    };
  } else if (lastPitchDay) {
    pitches = {
      key: 'pitches',
      label: '투구량',
      icon: 'baseball',
      text: `마지막 투구 ${monthDay(lastPitchDay)} · ${pitchesByDay[lastPitchDay]}구`,
      sub: `최근 4주 ${monthPitches}구`,
      href: `${ANALYSIS}?view=pitch`,
      chart: weekBars,
      tone: 'past',
    };
  } else {
    pitches = none('pitches', '투구량', 'baseball', `/pitch-log/${today}`);
  }

  /* ── 2. 구속 ── */
  const velocityLine: HighlightChart = {
    kind: 'line',
    values: [5, 4, 3, 2, 1, 0].map((w) =>
      maxOf(days(today, -6 - 7 * w, -7 * w).map((k) => velocityByDay[k]))
    ),
    minSpan: 6,
  };
  const recentBest = maxOf(Object.values(velocityByDay));
  const bestEver = maxOf([input.bestBefore ?? undefined, recentBest ?? undefined]);
  const prev3 = maxOf(days(today, -27, -7).map((k) => velocityByDay[k]));
  let velocity: FeedItem;
  if (velocityByDay[today] != null) {
    const v = velocityByDay[today];
    const d = prev3 != null ? round1(v - prev3) : null;
    velocity = {
      key: 'velocity',
      label: '구속',
      icon: 'baseball',
      text:
        d == null
          ? '오늘 최고 {speed}'
          : d >= 0
            ? '오늘 최고 {speed} · 지난 3주보다 +{diff}'
            : '오늘 최고 {speed} · 지난 3주보다 −{diff}',
      speed: v,
      diff: d == null ? undefined : Math.abs(d),
      href: ANALYSIS,
      chart: velocityLine,
      tone: 'today',
    };
    /* 역대 최고는 문장에 {speed} 가 하나뿐이라 숫자로 적는다(단위는 화면이 붙인다 — sub 는 단위 자리가 없어 km/h 그대로) */
    velocity.sub =
      bestEver != null && bestEver > v
        ? `역대 최고 ${round1(bestEver)}km/h`
        : '오늘이 역대 최고예요';
  } else if (recentBest != null) {
    velocity = {
      key: 'velocity',
      label: '구속',
      icon: 'baseball',
      text: '최근 6주 최고 {speed}',
      speed: recentBest,
      sub: bestEver != null ? `역대 최고 ${round1(bestEver)}km/h` : undefined,
      href: ANALYSIS,
      chart: velocityLine,
      tone: 'past',
    };
  } else if (input.bestBefore != null) {
    velocity = {
      key: 'velocity',
      label: '구속',
      icon: 'baseball',
      text: '역대 최고 {speed} · 최근 6주는 기록이 없어요',
      speed: input.bestBefore,
      href: ANALYSIS,
      chart: null,
      tone: 'past',
    };
  } else {
    velocity = none('velocity', '구속', 'baseball', `/pitch-log/${today}`);
  }

  /* ── 3. 부하 지수 ── */
  let loadItem: FeedItem;
  if (load.ratio != null && load.zone != null) {
    const z = ACWR_ZONES[load.zone];
    loadItem = {
      key: 'load',
      label: '부하 지수',
      icon: 'gauge',
      text: `${load.ratio.toFixed(2)} · ${z.label}`,
      sub: z.meaning,
      href: `${ANALYSIS}?view=pitch`,
      warn: z.tone === 'warn' || z.tone === 'bad',
      chart: null,
      tone: (pitchesByDay[today] ?? 0) > 0 ? 'today' : 'past',
    };
  } else {
    loadItem = {
      ...none('load', '부하 지수', 'gauge', `/pitch-log/${today}`),
      text: '28일 기록이 없어 못 재요',
    };
  }

  /* ── 4. 컨디션 ── */
  const checked = new Set(input.checkinDays);
  const weekDots: HighlightChart = {
    kind: 'dots',
    values: week.map((k) => checked.has(k)),
  };
  const streak = runBack(checked.has(today) ? today : shiftDateKey(today, -1), (k) =>
    checked.has(k)
  );
  const weekCond = week
    .map((k) => conditionByDay[k])
    .filter((v): v is number => v != null);
  let condition: FeedItem;
  if (conditionByDay[today] != null) {
    const c = conditionByDay[today];
    const u = input.usualCondition;
    condition = {
      key: 'condition',
      label: '컨디션',
      icon: 'shield',
      text: `오늘 컨디션 ${c}/10`,
      sub:
        u != null
          ? c > u
            ? `평소 ${u}보다 좋아요 · 체크인 ${streak}일째`
            : c < u
              ? `평소 ${u}보다 낮아요 · 체크인 ${streak}일째`
              : `평소와 같아요 · 체크인 ${streak}일째`
          : `체크인 ${streak}일째`,
      href: null,
      checkin: true,
      chart: weekDots,
      tone: 'today',
    };
  } else if (weekCond.length > 0 || input.checkinDays.length > 0) {
    const avg = weekCond.length
      ? round1(weekCond.reduce((a, b) => a + b, 0) / weekCond.length)
      : null;
    condition = {
      key: 'condition',
      label: '컨디션',
      icon: 'shield',
      text: avg != null ? `최근 7일 평균 ${avg}/10` : '오늘 체크인을 아직 안 했어요',
      sub:
        streak > 0 ? `체크인 ${streak}일 연속 · 오늘은 아직` : '오늘 체크인을 남겨요',
      href: null,
      checkin: true,
      chart: weekDots,
      tone: 'past',
    };
  } else {
    condition = none('condition', '컨디션', 'shield', null, true);
  }

  /* ── 5. 운동 ── */
  const worked = new Set(input.workoutDays);
  const workDots: HighlightChart = {
    kind: 'dots',
    values: week.map((k) => worked.has(k)),
  };
  const twoWeeks = input.workoutDays.length;
  let workout: FeedItem;
  if (input.workout) {
    const w = input.workout;
    workout = {
      key: 'workout',
      label: '오늘 운동',
      icon: 'dumbbell',
      text: `${w.label} · ${w.minutes}분`,
      sub:
        w.total > 0 && w.done > 0
          ? w.done >= w.total
            ? '오늘 운동을 다 마쳤어요'
            : `${w.total}개 중 ${w.done}개 했어요`
          : (w.goal ?? undefined),
      href: '/training',
      chart: workDots,
      tone: 'today',
    };
  } else if (twoWeeks > 0) {
    workout = {
      key: 'workout',
      label: '운동',
      icon: 'dumbbell',
      text: `최근 14일 중 ${twoWeeks}일 운동했어요.`,
      sub: '오늘 일정은 아직 안 만들었어요',
      href: '/training',
      chart: workDots,
      tone: 'past',
    };
  } else {
    workout = none('workout', '운동', 'dumbbell', '/training');
  }

  /* ── 6. 영양 ── */
  const n = input.nutrition;
  let nutrition: FeedItem;
  if (n.todayKcal > 0 || n.score != null) {
    nutrition = {
      key: 'nutrition',
      label: n.score != null ? `영양 · 균형 ${n.score}` : '영양',
      icon: 'utensils',
      text:
        n.headline ??
        (n.todayKcal > 0
          ? `오늘 ${n.todayKcal.toLocaleString('ko-KR')}kcal`
          : '오늘 권하는 양이에요'),
      sub: n.parts.join(' · '),
      href: '/nutrition',
      chart: null,
      tone: 'today',
    };
  } else if (n.week) {
    const pct =
      n.targetKcal > 0 ? Math.round((n.week.avgKcal / n.targetKcal) * 100) : null;
    nutrition = {
      key: 'nutrition',
      label: '영양',
      icon: 'utensils',
      text: `최근 7일 평균 ${Math.round(n.week.avgKcal).toLocaleString('ko-KR')}kcal`,
      sub:
        pct != null
          ? `목표의 ${pct}% · ${n.week.days}일 기록 · 오늘은 아직`
          : `${n.week.days}일 기록 · 오늘은 아직`,
      href: '/nutrition',
      chart: null,
      tone: 'past',
    };
  } else {
    nutrition = none('nutrition', '영양', 'utensils', '/nutrition');
  }

  const items: FeedItem[] = [
    pitches,
    velocity,
    loadItem,
    condition,
    workout,
    nutrition,
  ];

  /* 하이라이트 — 장을 더하지 않고 그 장의 말을 바꾼다(한 장에 둘이면 먼저 온 것, 안전 → 성장 → 꾸준함) */
  const taken = new Set<FeedItem['key']>();
  for (const h of input.highlights) {
    const slot = SLOT_OF[h.key];
    if (taken.has(slot)) continue;
    taken.add(slot);
    const it = items.find((i) => i.key === slot)!;
    it.text = h.text;
    it.sub = undefined;
    it.speed = h.speed;
    it.diff = h.diff;
    it.warn = h.warn;
    if (h.chart) it.chart = h.chart;
    if (h.href) {
      it.href = h.href;
      it.checkin = undefined;
    }
    if (it.tone === 'none') it.tone = 'past';
  }
  return items;
}
