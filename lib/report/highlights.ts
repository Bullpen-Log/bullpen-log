import { shiftDateKey, type AcwrZone } from '@/lib/pitch-stats';
import { LOW_CONDITION_THRESHOLD } from '@/lib/report/theme';

/**
 * 홈 캘린더 밑 '하이라이트' — 평소와 달라진 것만 문장 하나로(2026-10-05 홈 정리).
 *
 * 사용자: "주구절절 작은 글씨로 잡다한 정보가 많아서 사용자가 읽어볼지 모르겠다 · 너무 길어지는 건 싫다".
 * 그래서 숫자를 늘어놓지 않는다. '이번 주 182구' 같은 합계는 많은 건지 적은 건지 모른다 — 평소 · 지난주와
 * 견줘 달라진 것만 말한다. 차례는 안전 → 성장 → 꾸준함, 많아야 셋. 아무 일 없으면 한 장만 조용히.
 * 날마다 내용이 바뀌어 홈을 열 까닭이 되고, 자세한 숫자는 누르면 가는 분석 화면(/coach)에 그대로 있다.
 *
 * 순수 함수다(DB 를 모른다) — 자료는 홈(app/(app)/today/page.tsx)이 모아 넘긴다. 시험: npm run highlights:test.
 */

export type HighlightChart =
  /** 주별 합 — 마지막 칸이 이번 주(최근 이레) */
  | { kind: 'bars'; values: number[] }
  /**
   * 날짜 · 주별 값 — null 은 기록이 없는 칸. minSpan: 위아래 폭을 적어도 이만큼(값의 단위) — 1km/h 차이가
   * 바닥에서 꼭대기까지 솟아 보이지 않게
   */
  | { kind: 'line'; values: (number | null)[]; minSpan: number }
  /** 최근 이레 — 한 날인가(마지막이 오늘) */
  | { kind: 'dots'; values: boolean[] };

export type Highlight = {
  key:
    | 'load'
    | 'condition'
    | 'gap'
    | 'velocity'
    | 'training'
    | 'streak'
    | 'steady'
    | 'away';
  /** 안전에 관한 것 — 경고색으로 */
  warn: boolean;
  /** 위 작은 이름표 */
  label: string;
  /** 문장. 구속은 단위(km/h · mph)를 화면이 정하므로 {speed} · {diff} 자리로 둔다 */
  text: string;
  /** {speed} 에 들어갈 값(km/h) */
  speed?: number;
  /** {diff} 에 들어갈 값(km/h) */
  diff?: number;
  /** 누르면 갈 곳. 없으면 누르지 않는 카드 */
  href: string | null;
  chart: HighlightChart | null;
};

export type HighlightInput = {
  /** 오늘 YYYY-MM-DD(한국 시각) */
  today: string;
  /** 투구 부하 지수(lib/report/facts.ts 의 load) */
  load: { zone: AcwrZone | null; ratio: number | null };
  /** 날짜별 던진 공 수 — 최근 28일 이상 */
  pitchesByDay: Record<string, number>;
  /** 가장 최근에 남긴 투구 기록 날(쉬는 날로 남긴 것도). 없으면 null */
  lastLogDate: string | null;
  /** 날짜별 최고 구속(km/h) — 최근 42일 이상 */
  velocityByDay: Record<string, number>;
  /** 최근 이레(오늘 포함) 앞의 역대 최고 구속(km/h). 없으면 null */
  bestBefore: number | null;
  /** 날짜별 컨디션(1~10) — 최근 이레 이상 */
  conditionByDay: Record<string, number>;
  /** 체크인한 날 — 연속 일수를 셀 만큼(두 달) */
  checkinDays: string[];
  /** 운동한 날 — 최근 14일 이상 */
  workoutDays: string[];
};

export const MAX_HIGHLIGHTS = 3;
/** 투구 기록이 이만큼 비면 남기라고 한다 — 안 남긴 날은 쉰 날로 쳐서 부하가 틀어진다 */
export const GAP_DAYS = 3;
/** 이보다 오래 비었으면 잔소리 대신 '오랜만이에요' */
export const AWAY_DAYS = 30;
/** 체크인 연속은 이레마다 한 번 말한다(매일 같은 말이면 '변화'가 아니다) */
export const STREAK_EVERY = 7;

const ANALYSIS = '/coach';

function daysAgo(today: string, key: string) {
  const ms = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(today) - ms(key)) / 86_400_000);
}

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

/** start 부터 하루씩 거슬러 ok 인 날이 이어진 수 */
function runBack(start: string, ok: (key: string) => boolean) {
  let n = 0;
  for (let k = start; ok(k); k = shiftDateKey(k, -1)) n++;
  return n;
}

export function buildHighlights(input: HighlightInput): Highlight[] {
  const { today, load, pitchesByDay, velocityByDay, conditionByDay } = input;
  const week = days(today, -6, 0);
  const lastWeek = days(today, -13, -7);
  const out: Highlight[] = [];

  /* ── 안전 ── */

  /* 투구 부담이 평소(4주)보다 크게 늘었다 — 부하 지수의 주의 · 위험 구간 */
  if ((load.zone === 'caution' || load.zone === 'danger') && load.ratio != null) {
    const pct = Math.max(1, Math.round((load.ratio - 1) * 100));
    out.push({
      key: 'load',
      warn: true,
      label: '투구량',
      text: `최근 1주 투구 부담이 평소보다 ${pct}% 커요. ${
        load.zone === 'danger' ? '며칠은 쉬거나 줄여요.' : '며칠은 가볍게 던져요.'
      }`,
      href: `${ANALYSIS}?view=pitch`,
      chart: {
        kind: 'bars',
        values: [3, 2, 1, 0].map((w) =>
          days(today, -6 - 7 * w, -7 * w).reduce(
            (n, k) => n + (pitchesByDay[k] ?? 0),
            0
          )
        ),
      },
    });
  }

  /* 컨디션이 며칠째 낮다 — 오늘 체크인이 없으면 어제부터 센다 */
  const low = (k: string) =>
    conditionByDay[k] != null && conditionByDay[k] <= LOW_CONDITION_THRESHOLD;
  const lowRun = runBack(
    conditionByDay[today] != null ? today : shiftDateKey(today, -1),
    low
  );
  if (lowRun >= 2) {
    out.push({
      key: 'condition',
      warn: true,
      label: '컨디션',
      text: `컨디션이 ${lowRun}일째 낮아요. 오늘은 가볍게 해요.`,
      href: ANALYSIS,
      chart: {
        kind: 'line',
        values: week.map((k) => conditionByDay[k] ?? null),
        minSpan: 6,
      },
    });
  }

  /* 투구 기록이 비었다 — 안 남긴 날은 쉰 날로 쳐서 부하 지수가 틀어진다 */
  const gap = input.lastLogDate ? daysAgo(today, input.lastLogDate) : null;
  if (gap != null && gap >= GAP_DAYS && gap <= AWAY_DAYS) {
    out.push({
      key: 'gap',
      warn: false,
      label: '투구 기록',
      text: `${gap}일째 투구 기록이 없어요. 안 던진 날도 남겨야 부하가 맞아요.`,
      href: `/pitch-log/${today}`,
      chart: null,
    });
  }

  /* ── 성장 ── */

  const bestWeek = maxOf(week.map((k) => velocityByDay[k]));
  if (bestWeek != null) {
    const velocityChart: HighlightChart = {
      kind: 'line',
      values: [5, 4, 3, 2, 1, 0].map((w) =>
        maxOf(days(today, -6 - 7 * w, -7 * w).map((k) => velocityByDay[k]))
      ),
      minSpan: 6,
    };
    const prev3 = maxOf(days(today, -27, -7).map((k) => velocityByDay[k]));
    if (input.bestBefore == null || bestWeek > input.bestBefore) {
      out.push({
        key: 'velocity',
        warn: false,
        label: '구속',
        text:
          input.bestBefore == null
            ? '첫 구속 기록이에요. {speed}'
            : '최고 구속 {speed}, 새 기록이에요.',
        speed: bestWeek,
        href: ANALYSIS,
        chart: velocityChart,
      });
    } else if (prev3 != null && bestWeek - prev3 >= 1) {
      out.push({
        key: 'velocity',
        warn: false,
        label: '구속',
        text: '최고 구속이 지난 3주보다 {diff} 올랐어요.',
        diff: Math.round((bestWeek - prev3) * 10) / 10,
        href: ANALYSIS,
        chart: velocityChart,
      });
    }
  }

  /* ── 꾸준함 ── */

  const worked = new Set(input.workoutDays);
  const thisWeek = week.filter((k) => worked.has(k)).length;
  const prevWeek = lastWeek.filter((k) => worked.has(k)).length;
  if (thisWeek >= 2 && thisWeek > prevWeek) {
    out.push({
      key: 'training',
      warn: false,
      label: '운동',
      text: `이번 주 운동 ${thisWeek}번, 지난주보다 ${thisWeek - prevWeek}번 더 했어요.`,
      href: `${ANALYSIS}?view=training`,
      chart: { kind: 'dots', values: week.map((k) => worked.has(k)) },
    });
  }

  /* 투구가 평소보다 적다 — 쉬다 돌아온 사람은 한꺼번에 늘리면 다친다 */
  if (load.zone === 'low') {
    out.push({
      key: 'load',
      warn: false,
      label: '투구량',
      text: '최근 1주 투구가 평소보다 적어요. 다시 늘릴 땐 조금씩 올려요.',
      href: `${ANALYSIS}?view=pitch`,
      chart: null,
    });
  }

  const checked = new Set(input.checkinDays);
  const streak = runBack(checked.has(today) ? today : shiftDateKey(today, -1), (k) =>
    checked.has(k)
  );
  if (streak >= STREAK_EVERY && streak % STREAK_EVERY === 0) {
    out.push({
      key: 'streak',
      warn: false,
      label: '체크인',
      text: `체크인 ${streak}일 연속이에요.`,
      href: null,
      chart: { kind: 'dots', values: week.map((k) => checked.has(k)) },
    });
  }

  if (out.length > 0) return out.slice(0, MAX_HIGHLIGHTS);

  /* ── 달라진 게 없을 때 ── */

  if (gap != null && gap > AWAY_DAYS) {
    return [
      {
        key: 'away',
        warn: false,
        label: '투구 기록',
        text: '오랜만이에요. 오늘 기록부터 남겨 볼까요?',
        href: `/pitch-log/${today}`,
        chart: null,
      },
    ];
  }
  const weekPitches = week.reduce((n, k) => n + (pitchesByDay[k] ?? 0), 0);
  if (weekPitches === 0 && thisWeek === 0) return [];
  return [
    {
      key: 'steady',
      warn: false,
      label: '이번 주',
      text: `이번 주 투구 ${weekPitches}구 · 운동 ${thisWeek}번이에요. 크게 달라진 건 없어요.`,
      href: ANALYSIS,
      chart: null,
    },
  ];
}
