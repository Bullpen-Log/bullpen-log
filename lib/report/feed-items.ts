import { shiftDateKey } from '@/lib/pitch-stats';
import { ACWR_TARGET_MAX, MISSING_DAYS_WARNING } from '@/lib/pitch-stats';
import { loadSignalOf, type LoadLike } from '@/lib/report/arm-status';
import { SLEEP_QUALITY_LEVELS } from '@/lib/checkin';
import { ADULT_AGE } from '@/lib/report/plan';
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

/**
 * 한 장이 보여줄 수 있는 말 하나(2026-10-14 사용자: "그 파트에서 보여줄 만한 유용한 정보를 랜덤하게, 보여줄 수 있는 것만").
 * 장은 variants 를 여럿 갖고 화면(feed-card.tsx)이 세 장 지날 때마다 다음 것을 고른다. variants[0] 은 장의 기본 글이자
 * 첫 라운드(하이라이트 · 통증이 있으면 그것이 맨 앞 — 안전 먼저).
 */
export type FeedVariant = {
  id: string;
  text: string;
  sub?: string;
  /** 셋째 줄(작고 흐림) — 정보 한 줄 더 */
  detail?: string;
  speed?: number;
  diff?: number;
  /** text · sub 의 {best} 자리 구속(km/h) — 화면이 이 기기 단위로 바꿔 넣는다(sub 에 단위를 박지 않게) */
  best?: number;
  warn?: boolean;
  chart?: HighlightChart | null;
};

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
  /** text · sub 의 {best} 자리 구속(km/h) */
  best?: number;
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
  /** 보여줄 수 있는 말들 — [0] 은 위 text · sub · … 와 같다. 기록 없음 장은 하나뿐 */
  variants: FeedVariant[];
};

export type FeedInput = {
  /** 오늘 YYYY-MM-DD(한국 시각) */
  today: string;
  /** 투구 부하 지수(facts.load) — 색 · 글은 arm-status.ts loadSignalOf(팔 상태와 같은 판정) */
  load: LoadLike;
  /** 날짜별 던진 공 수 — 최근 42일 */
  pitchesByDay: Record<string, number>;
  /** 마지막으로 남긴 투구 기록 날(쉬는 날 포함). 없으면 null */
  lastLogDate: string | null;
  /** 날짜별 최고 구속(km/h) — 최근 42일 */
  velocityByDay: Record<string, number>;
  /** 최근 이레 앞의 역대 최고 구속(km/h). 없으면 null */
  bestBefore: number | null;
  /** 그 기록을 낸 날 YYYY-MM-DD. 없으면 null */
  bestBeforeDate: string | null;
  /** 마지막으로 던진 날의 전력 환산 투구수(facts.patterns.lastOutingAdjusted). 없으면 null */
  lastOutingAdjusted: number | null;
  /** 최근 4주 가운데 기록이 아예 없는 날 수(facts.patterns.missingDays) */
  missingDays: number;
  /** 만 나이(facts.profile.age) — 성장기 · 모름이면 '더 늘려도 되는 몫' 장을 안 보인다. 안 주면 모름 */
  age?: number | null;
  /** 날짜별 컨디션(1~10) — 최근 두 달 */
  conditionByDay: Record<string, number>;
  /** 평소 컨디션(28일 중앙값, lib/report/facts.ts). 모르면 null */
  usualCondition: number | null;
  /** 체크인한 날 — 두 달 */
  checkinDays: string[];
  /** 날짜별 어젯밤 수면의 질 1~5(체크인 3판) — 두 달. 안 적은 날은 없다 */
  sleepByDay: Record<string, number>;
  /** 오늘을 뺀 최근 7일 체크인에서 '통증'이라고 한 부위 이름(어깨 · 팔꿈치 …). 없으면 빈 목록 */
  painRecentParts: string[];
  /** 오늘 체크인에 통증이 있는가 */
  painToday: boolean;
  /** 운동한 날 — 최근 14일 */
  workoutDays: string[];
  /** 오늘 운동 일정 — 없거나 멈춘 날은 null */
  workout: {
    label: string;
    minutes: number;
    done: number;
    total: number;
    goal: string | null;
    /** 근력 · 파워 프로그램의 몇 번째 세션인가. 매일 판이면 null */
    programDay: number | null;
    /** 아직 안 한 운동의 어림 분 */
    leftMinutes: number;
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
    /** 오늘 먹은 단백질 g · 목표 g */
    protein: number;
    targetProtein: number;
    /** 오늘 음식을 적은 끼니 수 */
    mealsToday: number;
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
    variants: [],
  });

  /* ── 1. 투구량 ── */
  const weekBars: Ctx['weekBars'] = {
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
      variants: [],
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
      variants: [],
    };
  } else {
    pitches = none('pitches', '투구량', 'baseball', `/pitch-log/${today}`);
  }

  /* ── 2. 구속 ── */
  const velocityLine: Ctx['velocityLine'] = {
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
      variants: [],
    };
    /* 역대 최고는 {best} 자리로 — 단위(km/h · mph)는 화면이 이 기기 설정으로 붙인다(2026-10-16 베타: mph 를 골라도 km/h 였다) */
    velocity.sub =
      bestEver != null && bestEver > v ? '역대 최고 {best}' : '오늘이 역대 최고예요';
    if (bestEver != null && bestEver > v) velocity.best = round1(bestEver);
  } else if (recentBest != null) {
    velocity = {
      key: 'velocity',
      label: '구속',
      icon: 'baseball',
      text: '최근 6주 최고 {speed}',
      speed: recentBest,
      sub: bestEver != null ? '역대 최고 {best}' : undefined,
      best: bestEver != null ? round1(bestEver) : undefined,
      href: ANALYSIS,
      chart: velocityLine,
      tone: 'past',
      variants: [],
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
      variants: [],
    };
  } else {
    velocity = none('velocity', '구속', 'baseball', `/pitch-log/${today}`);
  }

  /* ── 3. 부하 지수 ── */
  let loadItem: FeedItem;
  if (load.ratio != null && load.zone != null) {
    /* 판정은 팔 상태와 같은 함수 — 홈이 '위험', 투구 탭이 '안전'으로 서로 다른 말을 하던 것(2026-10-16 베타 100명, 42명) */
    const ls = loadSignalOf(load);
    loadItem = {
      key: 'load',
      label: '부하 지수',
      icon: 'gauge',
      text: `${load.ratio.toFixed(2)} · ${ls.label}`,
      sub: ls.plain,
      href: `${ANALYSIS}?view=pitch`,
      warn: ls.level !== 'safe',
      chart: null,
      tone: (pitchesByDay[today] ?? 0) > 0 ? 'today' : 'past',
      variants: [],
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
      variants: [],
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
      variants: [],
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
      variants: [],
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
      variants: [],
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
      variants: [],
    };
  } else if (n.headline) {
    /* 아무것도 안 적어도 오늘 할 일 한 줄은 보인다 — 기록 없는 사람 대부분이 '기록 없음' · '최근 7일 평균'만 보고 조언은 숨었다(2026-10-16 베타 100명). 7일 평균은 다음 후보로 돈다, 점수는 자료가 있을 때만 */
    nutrition = {
      key: 'nutrition',
      label: '영양',
      icon: 'utensils',
      text: n.headline,
      sub: '적으면 더 맞춰 드려요',
      href: '/nutrition',
      chart: null,
      tone: 'today',
      variants: [],
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
      variants: [],
    };
  } else {
    nutrition = none('nutrition', '영양', 'utensils', '/nutrition');
  }

  const ctx: Ctx = {
    week,
    weekBars,
    monthPitches,
    velocityLine,
    bestEver,
    weekDots,
    workDots,
    worked,
  };
  const items: FeedItem[] = [
    pitches,
    velocity,
    loadItem,
    condition,
    workout,
    nutrition,
  ];

  /*
   * 하이라이트 — 장을 더하지 않고 그 장의 말을 바꾼다(한 장에 둘이면 먼저 온 것, 안전 → 성장 → 꾸준함). 바꾸기 전에 장의 기본 글을 떠 둔다 —
   * 예전엔 덮은 뒤에 기본 글을 만들어 하이라이트 글이 두 번 돌고 원래 숫자 줄('1.62 · 위험' · '마지막 투구 80구')이 사라졌다(2026-10-16 베타 100명, 94명).
   */
  const bases = new Map(items.map((it) => [it.key, baseVariant(it, 'base')]));
  /* 기록 없던 장을 하이라이트가 채웠으면 '기록 없음' 기본 글은 돌리지 않는다(첫 구속 기록 뒤에 '기록 없음'이 따라 나오게 된다) */
  const wasNone = new Set(items.filter((it) => it.tone === 'none').map((it) => it.key));
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
    it.variants = [baseVariant(it, 'highlight')];
  }

  /* 후보 — 자료가 있는 것만. 기본 글(지금 fields)이 [0](하이라이트가 있으면 그 뒤), 통증은 맨 앞 */
  for (const it of items) {
    const base = wasNone.has(it.key) && it.variants.length ? [] : [bases.get(it.key)!];
    const more = it.tone === 'none' ? [] : extraVariants(it.key, input, ctx);
    const pain =
      it.key === 'condition' && it.tone !== 'none' ? painVariant(input) : null;
    const list = [...it.variants, ...base, ...more];
    if (pain) {
      list.splice(it.variants.length ? 1 : 0, 0, pain);
      /* 통증이 첫 라운드 — 장의 글도 그것으로 */
      if (!it.variants.length)
        Object.assign(it, {
          text: pain.text,
          sub: pain.sub,
          warn: pain.warn,
          chart: pain.chart,
        });
    }
    it.variants = list;
  }
  return items;
}

function baseVariant(it: FeedItem, id: string): FeedVariant {
  return {
    id,
    text: it.text,
    sub: it.sub,
    speed: it.speed,
    diff: it.diff,
    best: it.best,
    warn: it.warn,
    chart: it.chart,
  };
}

/** 장 밖에서도 쓰는 셈 — buildFeedItems 안에서 만든 것들 */
type Ctx = {
  week: string[];
  weekBars: { kind: 'bars'; values: number[] };
  monthPitches: number;
  velocityLine: { kind: 'line'; values: (number | null)[]; minSpan: number };
  bestEver: number | null;
  weekDots: HighlightChart;
  workDots: HighlightChart;
  worked: Set<string>;
};

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function weekday(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 오늘 아프거나, 오늘을 뺀 최근 7일에 통증이 있었으면 — 안전이라 첫 라운드 */
function painVariant(input: FeedInput): FeedVariant | null {
  if (input.painToday)
    return {
      id: 'pain-today',
      text: '오늘 통증이 있어요',
      sub: '무거운 운동은 빼고, 아픈 날은 던지지 않아요',
      warn: true,
      chart: null,
    };
  if (input.painRecentParts.length)
    return {
      id: 'pain-recent',
      text: `최근 7일 통증 · ${input.painRecentParts.join(' · ')}`,
      sub: '그 부위 무거운 운동은 며칠 빼요',
      detail: '오늘 괜찮아도 체크인에 남기면 일정이 맞춰요',
      warn: true,
      chart: null,
    };
  return null;
}

function extraVariants(key: FeedItem['key'], input: FeedInput, c: Ctx): FeedVariant[] {
  const { today, pitchesByDay, velocityByDay, conditionByDay } = input;
  const out: FeedVariant[] = [];
  const push = (v: FeedVariant | null | false | undefined) => {
    if (v) out.push(v);
  };

  if (key === 'pitches') {
    const thisWeek = c.weekBars.values[3];
    const lastWeek = c.weekBars.values[2];
    if (lastWeek > 0 && thisWeek > 0) {
      const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
      push({
        id: 'week-vs-last',
        text:
          pct === 0
            ? '이번 주, 지난 주와 같아요'
            : `이번 주 ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
        sub: `이번 주 ${thisWeek}구 · 지난 주 ${lastWeek}구`,
        detail: `최근 4주 ${c.monthPitches}구`,
        chart: c.weekBars,
      });
    }
    const month = days(today, -27, 0).filter((k) => (pitchesByDay[k] ?? 0) > 0);
    if (month.length >= 2) {
      const top = month.reduce((a, b) => (pitchesByDay[b] > pitchesByDay[a] ? b : a));
      push({
        id: 'month-max',
        text: `4주 최다 ${monthDay(top)} · ${pitchesByDay[top]}구`,
        sub: `던진 날 ${month.length}일 · 하루 평균 ${Math.round(c.monthPitches / month.length)}구`,
        chart: c.weekBars,
      });
    }
    const streak = runBack(today, (k) => (pitchesByDay[k] ?? 0) > 0);
    let lastRest: string | null = null;
    for (let i = 0; i <= 41; i++) {
      const k = shiftDateKey(today, -i);
      if ((pitchesByDay[k] ?? 0) === 0) {
        lastRest = k;
        break;
      }
    }
    if (streak >= 2)
      push({
        id: 'streak',
        text: `${streak}일 연속 던졌어요`,
        sub: lastRest ? `마지막 휴식 ${monthDay(lastRest)}` : undefined,
        detail: streak >= 4 ? '쉬는 날을 하루 넣어 보세요' : undefined,
        warn: streak >= 5,
        chart: c.weekBars,
      });
    if (input.lastOutingAdjusted != null && input.lastOutingAdjusted > 0)
      push({
        id: 'adjusted',
        text: `전력 환산 ${Math.round(input.lastOutingAdjusted)}구`,
        sub: '마지막 등판을 경기 강도로 바꾼 값',
        detail: '휴식 일수는 이 값으로 정해요',
        chart: c.weekBars,
      });
  }

  if (key === 'velocity') {
    const line = c.velocityLine.values;
    const firstIdx = line.findIndex((v) => v != null);
    const lastIdx = line.length - 1 - [...line].reverse().findIndex((v) => v != null);
    if (firstIdx >= 0 && lastIdx - firstIdx >= 2) {
      const d = round1(line[lastIdx]! - line[firstIdx]!);
      push({
        id: 'trend',
        text:
          d === 0
            ? `${lastIdx - firstIdx}주 전과 같아요`
            : `${lastIdx - firstIdx}주 전보다 ${d > 0 ? '+' : '−'}{diff}`,
        diff: Math.abs(d),
        sub: '주 최고 구속끼리 견줌',
        chart: c.velocityLine,
      });
    }
    if (input.bestBefore != null && input.bestBeforeDate)
      push({
        id: 'best-day',
        text: '역대 최고 {speed}',
        speed: c.bestEver ?? input.bestBefore,
        sub:
          c.bestEver != null && c.bestEver > input.bestBefore
            ? '최근 이레 안에 세웠어요'
            : `${monthDay(input.bestBeforeDate)}에 세웠어요`,
        chart: c.velocityLine,
      });
    const measured = Object.keys(velocityByDay);
    if (measured.length >= 2) {
      const avg = round1(
        measured.reduce((a, k) => a + velocityByDay[k], 0) / measured.length
      );
      push({
        id: 'measured',
        text: `6주 동안 ${measured.length}번 쟀어요`,
        sub: '날 최고의 평균 {best}',
        best: avg,
        chart: c.velocityLine,
      });
    }
    const over = measured.filter((k) => velocityByDay[k] >= 130).length;
    if (over > 0)
      push({
        id: 'over-130',
        text: `{best} 넘긴 날 ${over}일`,
        best: 130,
        sub: '최근 6주',
        chart: c.velocityLine,
      });
  }

  if (key === 'load') {
    /*
     * 실제 던진 공 수로 — 예전엔 부하 단위(투구수 × 강도)를 '주 2,400구'처럼 공 수로 적어, 주 60구 던진 사람이 제 기록과 못 맞췄다
     * (2026-10-16 베타 100명). 지수의 비율은 강도까지 곱한 값이라 이 두 숫자의 비와 다를 수 있다 — 밑줄이 그렇게 말한다.
     */
    if (input.load.ratio != null && c.monthPitches > 0)
      push({
        id: 'acute-chronic',
        text: `최근 7일 ${fmt(c.weekBars.values[3])}구`,
        sub: `4주 평균 주 ${fmt(c.monthPitches / 4)}구`,
        detail: '부하 지수는 강도까지 곱해 셈해요',
        chart: null,
      });
    /*
     * '적정 상한까지 +N%' — 지수가 적정(0.8~1.3)이고 성인이고 기록이 고를 때만. 지수가 낮은 것은 대개 기록을 빼먹어서라
     * '+222% · 늘리면 몸이 따라와요'가 10세 · 15세에게도 떴다(2026-10-16 베타 시뮬). 성장기는 늘리는 몫을 권하지 않는다.
     */
    if (
      input.load.ratio != null &&
      input.load.zone === 'optimal' &&
      input.load.ratio < ACWR_TARGET_MAX &&
      input.age != null &&
      input.age >= ADULT_AGE &&
      input.missingDays < 7
    ) {
      const room = Math.round(
        ((ACWR_TARGET_MAX - input.load.ratio) / input.load.ratio) * 100
      );
      push({
        id: 'room',
        text: `적정 상한까지 +${room}%`,
        sub: `지수 ${input.load.ratio.toFixed(2)} → ${ACWR_TARGET_MAX}`,
        detail: '이 안에서 늘리면 몸이 따라와요',
        chart: null,
      });
    }
    /* 분석 화면 경고와 같은 문턱(열흘) — 일주일쯤 빠뜨린 것까지 말하면 잔소리가 된다(2026-10-16 베타 100명) */
    if (input.missingDays >= MISSING_DAYS_WARNING)
      push({
        id: 'missing',
        text: `28일 중 ${input.missingDays}일 기록이 없어요`,
        sub: '빈 날은 0구로 쳐서 지수가 낮게 나와요',
        chart: null,
      });
  }

  if (key === 'condition') {
    const scored = c.week.filter((k) => conditionByDay[k] != null);
    if (scored.length >= 3) {
      const hi = scored.reduce((a, b) =>
        conditionByDay[b] > conditionByDay[a] ? b : a
      );
      const lo = scored.reduce((a, b) =>
        conditionByDay[b] < conditionByDay[a] ? b : a
      );
      push({
        id: 'week-hi-lo',
        text: `이번 주 최고 ${conditionByDay[hi]}(${weekday(hi)}) · 최저 ${conditionByDay[lo]}(${weekday(lo)})`,
        sub: `${scored.length}일 적었어요`,
        chart: c.weekDots,
      });
    }
    const sleepToday = input.sleepByDay[today];
    const sleptWell = c.week.filter((k) => (input.sleepByDay[k] ?? 0) >= 4).length;
    const sleptAny = c.week.filter((k) => input.sleepByDay[k] != null).length;
    if (sleepToday != null || sleptAny >= 3)
      push({
        id: 'sleep',
        text:
          sleepToday != null
            ? `어젯밤 ${SLEEP_QUALITY_LEVELS[sleepToday - 1] ?? '보통'}`
            : `7일 중 잘 잔 날 ${sleptWell}일`,
        sub:
          sleepToday != null
            ? `7일 중 잘 잔 날 ${sleptWell}일`
            : `${sleptAny}일 적었어요`,
        detail:
          sleepToday != null && sleepToday <= 2
            ? '오늘 가장 센 운동은 빼요'
            : undefined,
        chart: c.weekDots,
      });
    const monthStart = today.slice(0, 8) + '01';
    const thisMonth = input.checkinDays.filter(
      (k) => k >= monthStart && k <= today
    ).length;
    if (thisMonth >= 2)
      push({
        id: 'month-checkins',
        text: `이번 달 체크인 ${thisMonth}일`,
        sub: `${Number(today.slice(8, 10))}일 중`,
        chart: c.weekDots,
      });
  }

  if (key === 'workout') {
    const w = input.workout;
    if (w && w.programDay != null)
      push({
        id: 'program',
        text: `${w.label} ${w.programDay}번 세션`,
        sub: w.goal ?? undefined,
        chart: c.workDots,
      });
    if (w && w.total > 0 && w.done < w.total)
      push({
        id: 'left',
        text: `남은 운동 ${w.total - w.done}개`,
        sub: w.leftMinutes > 0 ? `약 ${w.leftMinutes}분` : undefined,
        chart: c.workDots,
      });
    const streak = runBack(c.worked.has(today) ? today : shiftDateKey(today, -1), (k) =>
      c.worked.has(k)
    );
    const lastWork = [...input.workoutDays].sort().at(-1) ?? null;
    if (streak >= 2)
      push({
        id: 'streak',
        text: `${streak}일 연속 운동했어요`,
        sub: '최근 14일 기준',
        chart: c.workDots,
      });
    else if (lastWork && lastWork !== today)
      push({
        id: 'last',
        text: `마지막 운동 ${monthDay(lastWork)}`,
        sub: `최근 14일 중 ${input.workoutDays.length}일`,
        chart: c.workDots,
      });
    const thisWeek = c.week.filter((k) => c.worked.has(k)).length;
    const lastWeek = days(today, -13, -7).filter((k) => c.worked.has(k)).length;
    if (thisWeek + lastWeek >= 2)
      push({
        id: 'week-vs-last',
        text: `이번 주 ${thisWeek}일 · 지난 주 ${lastWeek}일`,
        sub: '운동한 날',
        chart: c.workDots,
      });
  }

  if (key === 'nutrition') {
    const n = input.nutrition;
    if (n.todayKcal > 0 && n.targetKcal > 0) {
      const left = n.targetKcal - n.todayKcal;
      push({
        id: 'left-kcal',
        text:
          left > 0
            ? `오늘 ${fmt(left)}kcal 남았어요`
            : `목표보다 ${fmt(-left)}kcal 더 먹었어요`,
        sub: `먹은 ${fmt(n.todayKcal)} · 목표 ${fmt(n.targetKcal)}`,
        chart: null,
      });
    }
    if (n.todayKcal > 0 && n.targetProtein > 0)
      push({
        id: 'protein',
        text: `단백질 ${fmt(n.protein)}g / ${fmt(n.targetProtein)}g`,
        sub:
          n.protein >= n.targetProtein
            ? '오늘 목표를 채웠어요'
            : `${fmt(n.targetProtein - n.protein)}g 더 먹어요`,
        chart: null,
      });
    if (n.week && (n.todayKcal > 0 || n.headline)) {
      const pct =
        n.targetKcal > 0 ? Math.round((n.week.avgKcal / n.targetKcal) * 100) : null;
      push({
        id: 'week-avg',
        text: `최근 7일 평균 ${fmt(n.week.avgKcal)}kcal`,
        sub:
          pct != null
            ? `목표의 ${pct}% · ${n.week.days}일 기록`
            : `${n.week.days}일 기록`,
        chart: null,
      });
    }
    if (n.mealsToday > 0)
      push({
        id: 'meals',
        text: `오늘 ${n.mealsToday}끼 적었어요`,
        sub: n.todayKcal > 0 ? `${fmt(n.todayKcal)}kcal` : undefined,
        chart: null,
      });
  }
  return out;
}
