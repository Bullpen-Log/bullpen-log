import {
  ageBand,
  effectiveAdjust,
  storedRate,
  type AgeBand,
} from '@/lib/nutrition/age';
import type { ActivityKey, GoalKey } from '@/lib/nutrition/meta';
import type { Targets } from '@/lib/nutrition/targets';
import { shiftDateKey } from '@/lib/pitch-stats';
import { round1, toWeight, type WeightUnit } from '@/lib/units';

/**
 * 체중 목표 — 체중 흐름을 읽어 계획(주당 속도)과 견주고, 확실할 때만 하루 ±100kcal 을 권한다(순수 계산).
 *
 * 영양 탭의 체중 카드가 쓴다. 저장하지 않고 볼 때마다 셈한다. 읽는 것:
 *
 *   체중 기록    고른 날까지 56일(영양 탭에 적은 값 · 체크인에 적은 값)
 *   영양 목표    목표(증량 · 유지 · 감량) · 주당 속도 · 목표 체중 · 받아들인 조정 · 계획을 시작한 날
 *   식사 기록    고른 날 전 14일 — 먹은 kcal 과 그날 목표. 권하기 전에 '목표만큼 먹었나'를 볼 때만 쓴다
 *
 * ■ 왜 이렇게 느린가
 *
 * 선수의 체중은 하루에도 1kg 쯤 오르내린다(물 · 잰 시각 · 훈련 직후). 주 0.25kg 의 변화는 그 흔들림의
 * 1/3 이다 — 이틀치를 견줘 "안 늘었네, 더 먹자"고 하면 거의 매번 틀린다. 그래서
 *
 *   · 추세는 56일 창의 직선(최소제곱)으로 읽고, 그 기울기가 얼마나 흔들릴 수 있는지(표준오차)를 같이 셈한다
 *   · 계획과의 차이가 0.10kg/주 를 넘고, 표준오차의 2.5배(내리기는 3배)도 넘을 때만 권한다
 *   · 목표를 바꾼 뒤 나흘(물 · 글리코겐이 계단처럼 움직이는 때)은 빼고, 그 뒤 2주가 쌓여야 견준다
 *
 * 매일 재도 첫 권유까지 6주쯤, 주 1회면 9주쯤 걸린다. 흔들림 ±0.6kg 에서 주 0.25kg 을 가려내는 데 드는
 * 정직한 시간이다 — 기다리는 동안 화면이 까닭과 남은 날을 말한다(goalCopy).
 *
 * ■ 자동으로 바꾸지 않는다
 *
 * 권유는 단추다. 누르면 하루 100kcal 이 움직이고 계획 시작일이 오늘로 바뀌어, 다음 비교는 18일 뒤다.
 * 한도는 나이마다 다르고(lib/nutrition/age.ts effectiveAdjust) 감량은 예전보다 깊어지지 않는다.
 * 성장기(만 13~17세)에게는 줄이라고 권하지 않는다 — 빨리 느는 것은 키가 크는 시기에 자연스러운 일이다.
 * 어린이(만 12세 이하)와 생년월일을 모르는 계정은 흐름만 본다.
 *
 * ■ 상수는 사전값이다
 *
 * 아래 숫자(하루 흔들림 = 체중의 0.8%, 하루 간격 상관 0.4, 문턱 2.5 · 3.0)는 일반적인 체중 자료와
 * 시뮬레이션에서 고른 값이고, 이 앱의 기록으로 잰 값이 아니다. 기록이 쌓이면 다시 재 볼 숫자들이다.
 *
 * 글은 단정하지 않는다 — 처방이 아니라 참고다.
 */

/* ─────────────────────────── 상수 ─────────────────────────── */

/** 추세 창(일). 주 1회 재는 사람은 30일로는 판정이 안 난다 */
export const TREND_DAYS = 56;
/** 흐름을 말할 수 있는 최소 — 기록 4번, 처음과 끝이 14일 이상 */
export const MIN_POINTS = 4;
export const MIN_SPAN_DAYS = 14;
/** 마지막 기록이 이보다 오래면 흐름을 말하지 않는다 */
export const STALE_DAYS = 10;
/** 계획을 바꾼 뒤 판정에서 빼는 날 — 먹는 양이 바뀌면 물 · 글리코겐이 먼저 계단처럼 움직인다 */
export const SETTLE_DAYS = 4;
/** 계획을 바꾼 뒤 다시 견주기까지(SETTLE_DAYS + MIN_SPAN_DAYS) */
export const WAIT_DAYS = SETTLE_DAYS + MIN_SPAN_DAYS;
/** 하루 흔들림의 사전값 = 체중의 0.8%, 0.3~0.8kg 사이 */
export const NOISE_FRACTION = 0.008;
export const NOISE_MIN = 0.3;
export const NOISE_MAX = 0.8;
/** 흐름에서 이만큼(흔들림의 배수) 벗어난 값은 뺀다 — 오타(87.5 ↔ 78.5), 탈수된 날 */
export const OUTLIER_SCALES = 3;
/** 끝까지 같은 쪽으로 이만큼 이어진 점은 이상값이 아니라 수준 변화로 보고 남긴다 */
export const LEVEL_SHIFT_POINTS = 3;
/** 하루 간격 상관 — 물 흔들림은 이틀쯤 이어진다. 매일 재면 점이 많아도 그만큼 덜 독립이다 */
export const AUTOCORR = 0.4;
/** '거의 그대로'라고 말할 수 있는 표준오차(kg/주) */
export const FLAT_SE = 0.12;
/** 죽은 구간 0.10kg/주 — 0.05kg 단위 정수로 센다. 계획과 이 안이면 아무것도 권하지 않는다 */
export const DEAD_BAND20 = 2;
/** 올리기 · 내리기를 권하려면 차이가 표준오차의 이만큼을 넘어야 한다. 내리기가 더 조심스럽다 */
export const RAISE_SE = 2.5;
export const LOWER_SE = 3.0;
/** '계획대로'라고 말할 수 있는 표준오차(kg/주) */
export const ONPACE_SE = 0.15;
/** 한 걸음(kcal). 죽은 구간(0.10kg/주) > 한 걸음(≈0.09kg/주)이라 올렸다 내렸다 하지 않는다 */
export const STEP_KCAL = 100;
/** 식사 확인 — 고른 날 전 14일 가운데 8일 이상 적어야 '먹은 양'을 믿는다 */
export const INTAKE_DAYS = 14;
export const INTAKE_MIN_DAYS = 8;
/** 그날 목표의 절반도 안 적은 날은 '적다 만 날'이라 세지 않는다 */
export const LOGGED_SHARE = 0.5;
/** 목표의 85% 도 못 먹었으면 올리지 않고 '먼저 채우기', 115% 넘게 먹었으면 내리지 않고 '목표에 맞추기' */
export const EAT_FIRST_RATIO = 0.85;
export const OVER_EAT_RATIO = 1.15;
/** 만 18세 밑: 체중의 0.5%/주 넘게 줄면 한 줄 알린다 */
export const MINOR_DROP_SHARE = 0.005;
/** 목표 체중의 범위 — 증량은 지금의 110%(성장기) · 115%(성인)까지, 감량은 90% 와 BMI 20 중 높은 쪽까지 */
export const TARGET_GAIN_MAX_PCT = { teen: 110, adult: 115 } as const;
export const TARGET_LOSE_MIN_PCT = 90;
export const TARGET_MIN_BMI = 20;
/** 목표 체중은 지금과 0.5kg 이상 떨어져야 한다(0.1kg 단위 정수) */
export const TARGET_MIN_GAP10 = 5;
/** '계획대로면 약 N주' — 한 해를 넘으면 말하지 않는다 */
export const ETA_MAX_WEEKS = 52;

/* ─────────────────────────── 타입 ─────────────────────────── */

export type WeightPoint = { date: string; kg: number };

/** 흐름을 아직 말할 수 없다 — 까닭과 무엇이 더 필요한지 */
export type TrendMiss = {
  ok: false;
  /** none 기록 없음 · stale 마지막 기록이 오래됨 · few 기록이 적음 · short 기간이 짧음 */
  reason: 'none' | 'stale' | 'few' | 'short';
  n: number;
  needPoints: number;
  needDays: number;
  staleDays: number;
  lastKg: number | null;
};

export type TrendOk = {
  ok: true;
  /** 주당 변화, 0.05kg 단위 정수(+5 = 주 +0.25kg) — 화면 숫자와 판정이 같은 값을 쓴다 */
  rate20: number;
  ratePerWeek: number;
  /** 주당 변화의 표준오차(kg/주) */
  se: number;
  n: number;
  spanDays: number;
  /** 흐름 계산에서 뺀 날짜 */
  dropped: string[];
  fromDate: string;
  toDate: string;
  /** 추세선의 양 끝(kg) — 끝은 마지막 기록 날의 값이다(고른 날까지 늘이지 않는다) */
  startKg: number;
  currentKg: number;
  /** 하루 흔들림(kg) */
  sigma: number;
  /** up · down 확실히 움직임 · flat 거의 그대로 · noisy 아직 또렷하지 않음 */
  kind: 'up' | 'down' | 'flat' | 'noisy';
  /** 남긴 기록의 마지막 · 최소 · 최대 */
  lastKg: number;
  lowKg: number;
  highKg: number;
};

export type Trend = TrendOk | TrendMiss;

export type IntakeDay = { kcal: number; target: number };

export type IntakeCheck = {
  /** 적은 날이 8일 이상인가 */
  trusted: boolean;
  days: number;
  /** 적은 날들의 먹은 kcal ÷ 목표 kcal */
  ratio: number | null;
  /** 적은 날 평균 (먹은 것 − 목표), 10kcal 단위 */
  gapKcal: number | null;
};

/**
 * off 계획 없음(흐름만) · wait 견줄 기록이 모자람 · unsure 아직 모름 · onPace 계획대로 ·
 * low 체중이 계획보다 아래로 감(더 먹기 쪽: 증량이 느림 · 감량이 빠름 · 유지 중 빠짐) · high 그 반대 ·
 * reached 목표 체중에 닿음
 */
export type GoalStatus =
  'off' | 'wait' | 'unsure' | 'onPace' | 'low' | 'high' | 'reached';

/** 권하지 않는 까닭 */
export type GoalHold =
  | 'past' /** 지난 날을 보고 있다 */
  | 'manual' /** 하루 칼로리를 직접 정했다 */
  | 'eatFirst' /** 목표만큼 못 먹고 있다 — 올리기보다 채우기가 먼저 */
  | 'cap' /** 올릴 수 있는 한도에 닿았다 */
  | 'keep' /** 성장기 — 줄이라고 권하지 않는다 */
  | 'overEating' /** 목표보다 많이 먹고 있다 — 내리기보다 맞추기가 먼저 */
  | 'floor' /** 더 내릴 수 없다 */
  | 'needLog'; /** 식사 기록이 적어 내리기를 권하지 않는다 */

export type WeightGoal = {
  status: GoalStatus;
  /** 카드와 그래프가 그리는 단 하나의 추세 — 판정에 쓴 것이 있으면 그것, 없으면 56일 전체 */
  trend: Trend;
  /** trend 가 판정 구간(계획을 시작한 뒤)의 것인가 */
  judged: boolean;
  /** status 'wait' 일 때 판정 구간이 모자란 까닭 */
  wait: TrendMiss | null;
  /** 계획 속도(kg/주, 크기만). 유지는 0, 계획 없음은 null */
  paceKg: number | null;
  targetKg: number | null;
  remainingKg: number | null;
  etaWeeks: number | null;
  /** unsure 일 때 어느 쪽으로 기울었나(−1 low 쪽 · +1 high 쪽) */
  lean: -1 | 0 | 1;
  /** 권유 — 오늘을 볼 때, 확실할 때만 */
  suggestion: { step: number; nextAdjust: number; logs: 'ok' | 'few' } | null;
  hold: GoalHold | null;
  intake: IntakeCheck;
  /** 계획을 시작한 지 며칠째(모르면 null) */
  planDays: number | null;
  /** 만 18세 밑인데 체중이 확실히 줄고 있다 */
  minorDrop: boolean;
};

/* ─────────────────────────── 작은 도구 ─────────────────────────── */

const DAY_MS = 86_400_000;
const dayDiff = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS
  );

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/** 하루 흔들림의 사전값(kg) — 체중의 0.8%, 0.3~0.8kg 사이 */
export function noiseFloor(kg: number) {
  return Math.min(NOISE_MAX, Math.max(NOISE_MIN, NOISE_FRACTION * kg));
}

/* ─────────────────────────── 추세 ─────────────────────────── */

type Gate = Pick<TrendMiss, 'reason' | 'needPoints' | 'needDays' | 'staleDays'>;

/** 흐름을 말할 만큼 기록이 있나 — 없으면 까닭 */
function gate(points: WeightPoint[], to: string): Gate | null {
  if (points.length === 0) {
    return { reason: 'none', needPoints: MIN_POINTS, needDays: 0, staleDays: 0 };
  }
  const first = points[0].date;
  const last = points[points.length - 1].date;
  const staleDays = dayDiff(last, to);
  if (staleDays > STALE_DAYS) {
    return { reason: 'stale', needPoints: 0, needDays: 0, staleDays };
  }
  if (points.length < MIN_POINTS) {
    return {
      reason: 'few',
      needPoints: MIN_POINTS - points.length,
      needDays: 0,
      staleDays,
    };
  }
  if (dayDiff(first, last) < MIN_SPAN_DAYS) {
    /* needDays 0 = 날은 찼는데 끝 쪽 기록이 없다 — 오늘 재면 된다 */
    return {
      reason: 'short',
      needPoints: 0,
      needDays: Math.max(0, MIN_SPAN_DAYS - dayDiff(first, to)),
      staleDays,
    };
  }
  return null;
}

/**
 * from~to 의 체중 흐름.
 *
 * 1. 이상값을 뺀다 — 모든 두 점 사이 기울기의 중앙값(Theil–Sen)으로 거친 선을 긋고, 거기서 흔들림의 3배 넘게
 *    벗어난 점을 큰 것부터 다섯에 하나까지. 오타 하나가 직선을 끌고 가지 못하게 한다. 끝에 같은 쪽으로
 *    세 점 넘게 이어진 것은 빼지 않는다(실제 변화다).
 * 2. 남은 점에 직선을 맞춘다(최소제곱). 기울기 × 7 이 주당 변화다.
 * 3. 표준오차 — 하루 흔들림은 잔차와 사전값(체중의 0.8%) 중 큰 쪽(점 넷이 우연히 한 줄에 서도 확실한 척
 *    하지 않게), 촘촘히 잰 점은 서로 닮았으니 그만큼 부풀린다(하루 간격 상관 0.4).
 */
export function weightTrend(points: WeightPoint[], from: string, to: string): Trend {
  let pts = points
    .filter((p) => p.date >= from && p.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastKg = pts.length > 0 ? pts[pts.length - 1].kg : null;
  let miss = gate(pts, to);
  if (miss) return { ok: false, n: pts.length, lastKg, ...miss };

  /* ── 이상값 ── */
  {
    const t0 = pts[0].date;
    const xs = pts.map((p) => dayDiff(t0, p.date));
    const ys = pts.map((p) => p.kg);
    const slopes: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
      }
    }
    const slope = median(slopes);
    const base = median(ys.map((y, i) => y - slope * xs[i]));
    const signed = ys.map((y, i) => y - (base + slope * xs[i]));
    const residuals = signed.map(Math.abs);
    const scale = Math.max(noiseFloor(median(ys)), 1.4826 * median(residuals));
    const far = (i: number) => residuals[i] > OUTLIER_SCALES * scale;
    /*
     * 끝까지 같은 쪽으로 이어진 세 점 이상은 이상값이 아니라 몸이 실제로 바뀐 것이다(일주일 새 3kg 이 빠진
     * 선수) — 그것을 버리면 가장 최근 기록 여덟 개를 지우고 "잘 유지하고 있어요"라고 말하게 된다.
     * 혼자 튄 점과 이틀짜리(탈수)만 버린다.
     */
    const lastIndex = pts.length - 1;
    let tail = pts.length;
    while (tail > 0 && far(tail - 1) && signed[tail - 1] * signed[lastIndex] > 0)
      tail--;
    if (pts.length - tail < LEVEL_SHIFT_POINTS) tail = pts.length;
    const out = residuals
      .map((r, i) => ({ i, r }))
      .filter((o) => far(o.i) && o.i < tail)
      .sort((a, b) => b.r - a.r)
      .slice(0, Math.floor(pts.length / 5))
      .map((o) => o.i);
    if (out.length > 0) {
      const dropped = out.map((i) => pts[i].date).sort();
      const lastDate = pts[lastIndex].date;
      pts = pts.filter((_, i) => !out.includes(i));
      miss = gate(pts, to);
      if (miss) {
        /*
         * 가장 최근 기록을 뺀 탓에 '오래됐다 · 끝 쪽 기록이 없다'가 됐다 — 방금 잰 사람에게 "오늘 한 번 재
         * 볼까요?"라고 하면 거짓말이다. "1번 더 재면"이라고 말한다(다음 한 번으로 실제로 풀린다).
         * 남은 kg 은 뺀 값이 아니라 남긴 마지막 기록으로 셈하게 lastKg 도 그것으로 준다.
         */
        const lostLast = dropped.includes(lastDate);
        const retry =
          lostLast &&
          (miss.reason === 'stale' || (miss.reason === 'short' && miss.needDays === 0));
        return {
          ok: false,
          n: pts.length,
          lastKg: pts.length > 0 ? pts[pts.length - 1].kg : lastKg,
          ...(retry
            ? {
                reason: 'few' as const,
                needPoints: 1,
                needDays: 0,
                staleDays: dayDiff(lastDate, to),
              }
            : miss),
        };
      }
      return fit(pts, dropped);
    }
  }
  return fit(pts, []);
}

function fit(pts: WeightPoint[], dropped: string[]): TrendOk {
  const n = pts.length;
  const t0 = pts[0].date;
  const xs = pts.map((p) => dayDiff(t0, p.date));
  const ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (a + b * xs[i])) ** 2;
  const sigma = Math.max(Math.sqrt(sse / (n - 2)), noiseFloor(median(ys)));

  const gaps: number[] = [];
  for (let i = 1; i < n; i++) gaps.push(xs[i] - xs[i - 1]);
  const phi = Math.pow(AUTOCORR, median(gaps));
  const inflate = Math.sqrt((1 + phi) / (1 - phi));
  const se = (7 * sigma * inflate) / Math.sqrt(sxx);

  /* || 0 — Math.round(-0.2) 는 −0 이다 */
  const rate20 = Math.round(7 * b * 20) || 0;
  const ratePerWeek = rate20 / 20;
  const kind =
    Math.abs(ratePerWeek) > 2 * se
      ? ratePerWeek > 0
        ? 'up'
        : 'down'
      : se <= FLAT_SE && Math.abs(rate20) <= DEAD_BAND20
        ? 'flat'
        : 'noisy';

  return {
    ok: true,
    rate20,
    ratePerWeek,
    se,
    n,
    spanDays: xs[n - 1],
    dropped,
    fromDate: pts[0].date,
    toDate: pts[n - 1].date,
    startKg: a,
    currentKg: a + b * xs[n - 1],
    sigma,
    kind,
    lastKg: ys[n - 1],
    lowKg: Math.min(...ys),
    highKg: Math.max(...ys),
  };
}

/* ─────────────────────────── 식사 확인 ─────────────────────────── */

/**
 * 목표만큼 먹었나 — 권유를 막는 데만 쓴다(크기에는 안 쓴다).
 *
 * 식사 기록은 빠진 날이 많고, 적은 날도 10~20% 는 덜 적힌다. 그래서 8일 이상 적었을 때만 믿고,
 * 문턱도 그 덜 적힘보다 바깥(85% · 115%)에 둔다.
 */
export function intakeCheck(days: IntakeDay[]): IntakeCheck {
  const logged = days.filter((d) => d.target > 0 && d.kcal >= LOGGED_SHARE * d.target);
  const n = logged.length;
  if (n === 0) return { trusted: false, days: 0, ratio: null, gapKcal: null };
  const eaten = logged.reduce((s, d) => s + d.kcal, 0);
  const target = logged.reduce((s, d) => s + d.target, 0);
  return {
    trusted: n >= INTAKE_MIN_DAYS,
    days: n,
    ratio: eaten / target,
    gapKcal: round10((eaten - target) / n) || 0,
  };
}

/* ─────────────────────────── 목표 체중 ─────────────────────────── */

/**
 * '계획대로면 약 N주' — 정수로 나눈다. 실수로 나누면 2.1 ÷ 0.35 가 6.000000000000001 이 되어 7주가 된다.
 * 한 해를 넘거나 남은 것이 없으면 null.
 */
export function etaWeeks(remainingKg: number, paceKg: number): number | null {
  const r10 = Math.round(remainingKg * 10);
  const p20 = Math.round(paceKg * 20);
  if (p20 <= 0 || r10 <= 0) return null;
  const weeks = Math.ceil((r10 * 2) / p20);
  return weeks > ETA_MAX_WEEKS ? null : weeks;
}

/**
 * 예상 체중 선 — 지금부터 목표까지 주마다 속도만큼(직선). 온보딩 '추천 계획'과 영양 탭 '내 계획'이 그린다.
 * 한 해를 넘거나 남은 것이 없으면 빈 배열. 마지막 점은 목표 체중(속도로 나눠떨어지지 않아도 거기서 끝난다).
 */
export function forecastWeights(
  nowKg: number,
  targetKg: number,
  paceKg: number
): { week: number; kg: number }[] {
  const weeks = etaWeeks(Math.abs(targetKg - nowKg), paceKg);
  if (weeks === null) return [];
  const up = targetKg >= nowKg;
  const out: { week: number; kg: number }[] = [];
  for (let k = 0; k <= weeks; k++) {
    const raw = nowKg + (up ? 1 : -1) * paceKg * k;
    const kg =
      k === weeks ? targetKg : up ? Math.min(targetKg, raw) : Math.max(targetKg, raw);
    out.push({ week: k, kg: Math.round(kg * 10) / 10 });
  }
  return out;
}

/**
 * 목표 체중을 정할 수 있는 나이 · 목표인가 — 증량(성장기 · 성인)과 감량(성인)만.
 * 미성년자에게는 내려갈 숫자를 주지 않는다. 생년월일을 모르면 성인으로 치지 않는다.
 */
export function targetAllowed(goal: GoalKey, age: number | null) {
  if (age === null) return false;
  const band = ageBand(age);
  return (goal === 'gain' && band !== 'child') || (goal === 'lose' && band === 'adult');
}

export type TargetRange =
  | { ok: true; min: number; max: number }
  | { ok: false; why: 'age' | 'band' | 'weight' | 'height' | 'light' };

/**
 * 정할 수 있는 목표 체중의 범위(kg, 0.1 단위 — 정수로 셈한다).
 *
 *   증량  지금 +0.5kg ~ 지금의 110%(성장기) · 115%(성인)
 *   감량  지금의 90% 와 BMI 20 중 높은 쪽 ~ 지금 −0.5kg. 키를 모르면 못 정한다(BMI 바닥을 못 본다)
 */
export function targetRange(
  goal: GoalKey,
  age: number | null,
  refKg: number | null,
  heightCm: number | null
): TargetRange {
  if (age === null) return { ok: false, why: 'age' };
  if (!targetAllowed(goal, age)) return { ok: false, why: 'band' };
  if (refKg === null) return { ok: false, why: 'weight' };
  const r10 = Math.round(refKg * 10);
  if (goal === 'gain') {
    const pct = TARGET_GAIN_MAX_PCT[ageBand(age) === 'teen' ? 'teen' : 'adult'];
    const max10 = Math.floor((r10 * pct) / 100);
    const min10 = r10 + TARGET_MIN_GAP10;
    if (min10 > max10) return { ok: false, why: 'weight' };
    return { ok: true, min: min10 / 10, max: max10 / 10 };
  }
  if (heightCm === null) return { ok: false, why: 'height' };
  /* BMI 20 의 체중(kg) = 20 × (cm/100)² → 0.1kg 단위로는 cm² ÷ 50 */
  const bmiFloor10 = (TARGET_MIN_BMI * heightCm * heightCm) / 1000;
  const min10 = Math.ceil(Math.max((r10 * TARGET_LOSE_MIN_PCT) / 100, bmiFloor10));
  const max10 = r10 - TARGET_MIN_GAP10;
  if (min10 > max10) return { ok: false, why: 'light' };
  return { ok: true, min: min10 / 10, max: max10 / 10 };
}

/**
 * 저장할 목표 체중을 본다.
 *
 * 정할 수 없는 나이 · 목표면 조용히 비운다(오류가 아니다 — 유지로 바꾸면 목표 체중은 뜻이 없다).
 * 이미 저장된 값과 같으면 범위를 묻지 않는다: 체중이 움직여 범위가 밀린 옛 목표 때문에 다른 저장이 막히면 안 된다.
 */
export function checkTargetWeight(
  goal: GoalKey,
  age: number | null,
  refKg: number | null,
  heightCm: number | null,
  targetKg: number | null,
  prevKg: number | null
): { ok: true; kg: number | null } | { ok: false; error: string } {
  if (targetKg === null) return { ok: true, kg: null };
  if (!targetAllowed(goal, age)) return { ok: true, kg: null };
  if (!Number.isFinite(targetKg)) {
    return { ok: false, error: '목표 체중을 숫자로 적어 주세요.' };
  }
  const kg = Math.round(targetKg * 10) / 10;
  if (prevKg !== null && Math.abs(kg - prevKg) < 0.05) return { ok: true, kg };
  const range = targetRange(goal, age, refKg, heightCm);
  if (!range.ok) return { ok: false, error: '지금은 목표 체중을 정할 수 없어요.' };
  if (kg < range.min || kg > range.max) {
    return {
      ok: false,
      error: `목표 체중은 ${range.min}~${range.max}kg 사이로 적어 주세요.`,
    };
  }
  return { ok: true, kg };
}

/* ─────────────────────────── 목표를 저장할 때 ─────────────────────────── */

type PlanKeys = {
  goal: GoalKey;
  activity: ActivityKey;
  weeklyRateKg: number | null;
  kcalTarget: number | null;
};

/**
 * 목표 창을 저장할 때 조정과 계획 시작일을 어떻게 둘까 — 목표 창의 미리보기와 서버가 같이 쓴다
 * (저장 전에 본 숫자 = 저장 뒤 숫자).
 *
 * 칼로리 계획이 바뀌면(목표 · 평소 움직임 · 속도 · 직접 칼로리) 조정은 0 으로 돌아가고 계획이 새로 시작된다.
 * 그 조정은 옛 계획에서 배운 것이라 새 계획에 그대로 얹으면 두 번 셈하게 된다. 하나만 남긴다: 증량 → 유지로
 * 바꿀 때 올려 둔 조정(그 사람의 유지 칼로리가 계산보다 높다는 뜻이다 — 지우면 벌크 뒤에 600kcal 이 한꺼번에 빠진다).
 *
 * 속도는 '기본 속도 = null'로 맞춰 견준다(저장값 null 과 화면에서 고른 기본 속도는 같은 것이다).
 */
export function planOnSave(
  prev: (PlanKeys & { kcalAdjust: number | null }) | null,
  next: PlanKeys & { clearAdjust?: boolean },
  age: number | null
): { kcalAdjust: number | null; restart: boolean } {
  const had = prev?.kcalAdjust ?? null;
  const changed =
    !prev ||
    prev.goal !== next.goal ||
    prev.activity !== next.activity ||
    storedRate(prev.weeklyRateKg, age, prev.goal) !==
      storedRate(next.weeklyRateKg, age, next.goal) ||
    prev.kcalTarget !== next.kcalTarget;
  if (!changed) {
    if (next.clearAdjust && (had ?? 0) !== 0)
      return { kcalAdjust: null, restart: true };
    return { kcalAdjust: had, restart: false };
  }
  const gainToMaintain =
    !!prev &&
    prev.goal === 'gain' &&
    next.goal === 'maintain' &&
    prev.activity === next.activity &&
    prev.kcalTarget === next.kcalTarget;
  const keep = gainToMaintain && !next.clearAdjust && (had ?? 0) > 0;
  return { kcalAdjust: keep ? had : null, restart: true };
}

/* ─────────────────────────── 판정 ─────────────────────────── */

export type WeightGoalInput = {
  /** 고른 날 */
  date: string;
  isToday: boolean;
  /** 영양 목표를 한 번이라도 저장했나 */
  hasProfile: boolean;
  /** 고른 날까지 56일의 체중(하루 한 점) */
  points: WeightPoint[];
  profile: { targetWeightKg: number | null; planSince: string | null };
  /** 고른 날의 목표 계산 결과(운동은 상관없다) */
  targets: Pick<Targets, 'ageBand' | 'goal' | 'paceKg' | 'manual' | 'adjust' | 'delta'>;
  /** 진짜 나이 — 모르면 null(짐작 나이를 넣지 않는다) */
  age: number | null;
  /** 고른 날 전 14일의 먹은 kcal 과 그날 목표 */
  intake: IntakeDay[];
};

export function weightGoal(input: WeightGoalInput): WeightGoal {
  const { date, points, profile, targets, age } = input;
  const from = shiftDateKey(date, -(TREND_DAYS - 1));
  const display = weightTrend(points, from, date);
  const band = targets.ageBand;
  const goal = targets.goal;
  const since = profile.planSince;
  const intake = intakeCheck(input.intake);

  const result: WeightGoal = {
    status: 'off',
    trend: display,
    judged: false,
    wait: null,
    paceKg: null,
    targetKg: null,
    remainingKg: null,
    etaWeeks: null,
    lean: 0,
    suggestion: null,
    hold: null,
    intake,
    planDays: since && since <= date ? dayDiff(since, date) : null,
    /* 상태와 상관없이 본다 — 어린이 카드에도, 계획이 없는 성장기 선수에게도 뜬다 */
    minorDrop:
      age !== null &&
      band !== 'adult' &&
      display.ok &&
      display.kind === 'down' &&
      -display.ratePerWeek >= MINOR_DROP_SHARE * display.currentKg,
  };

  /* ── 견줄 계획이 있나 ── */
  const paceKg = targets.paceKg;
  const planned =
    input.hasProfile &&
    age !== null &&
    band !== 'child' &&
    paceKg !== null &&
    /* 고른 날이 계획을 시작하기 전이면 그날의 계획을 모른다 */
    !(since && since > date);
  if (!planned || paceKg === null) return result;

  const targetKg = targetAllowed(goal, age) ? profile.targetWeightKg : null;

  /*
   * 판정 구간 — 계획을 시작하고 나흘 뒤부터. 시작일을 모르면(이 기능이 생기기 전에 정한 목표) 56일 전체.
   * 카드의 숫자 · 그래프 · 판정이 늘 같은 추세를 본다: 판정 구간이 차면 그것, 아직이면 56일 전체를 보이되
   * 그것으로는 아무것도 권하지 않는다(목표를 저장할 때마다 카드가 2주씩 비지 않게).
   */
  let decision = display;
  if (since) {
    const start = shiftDateKey(since, SETTLE_DAYS);
    decision = weightTrend(points, start > from ? start : from, date);
  }
  /*
   * 그래프는 56일을 다 그린다 — 판정 구간보다 앞에서 뺀 값(계획을 바꾸기 전의 오타)도 '뺀 값'으로 같이 내려야
   * 그 한 점이 그래프의 세로 범위를 차지하지 않는다. 판정(decision)은 건드리지 않는다.
   */
  const shown: Trend = !decision.ok
    ? display
    : display.ok && since
      ? {
          ...decision,
          dropped: [
            ...new Set([
              ...display.dropped.filter((d) => d < decision.fromDate),
              ...decision.dropped,
            ]),
          ].sort(),
        }
      : decision;
  result.trend = shown;
  result.judged = decision.ok;
  result.paceKg = paceKg;
  result.targetKg = targetKg;

  /* ── 남은 양 · 닿았나 ── */
  const dir = goal === 'gain' ? 1 : goal === 'lose' ? -1 : 0;
  const nowKg = shown.ok ? shown.currentKg : shown.lastKg;
  if (targetKg !== null && nowKg !== null) {
    const t10 = Math.round(targetKg * 10);
    const now10 = Math.round(nowKg * 10);
    result.remainingKg = Math.max(0, dir * (t10 - now10)) / 10;
    result.etaWeeks = etaWeeks(result.remainingKg, paceKg);
    /* 추세와 마지막 기록이 둘 다 넘어야 한다 — 물 한 컵으로 '닿았어요'가 뜨지 않게 */
    if (
      shown.ok &&
      dir * (now10 - t10) >= 0 &&
      dir * (Math.round(shown.lastKg * 10) - t10) >= 0
    ) {
      result.status = 'reached';
      result.remainingKg = 0;
      result.etaWeeks = null;
      return result;
    }
  }

  if (!decision.ok) {
    result.status = 'wait';
    result.wait = decision;
    return result;
  }

  /* ── 계획과 견준다(0.05kg/주 단위 정수) ── */
  const plan20 = dir * Math.round(paceKg * 20);
  const gap20 = decision.rate20 - plan20;
  const raiseAt = Math.max(DEAD_BAND20, RAISE_SE * decision.se * 20);
  const lowerAt = Math.max(DEAD_BAND20, LOWER_SE * decision.se * 20);
  if (gap20 < -raiseAt) result.status = 'low';
  else if (gap20 > lowerAt) result.status = 'high';
  else if (decision.se <= ONPACE_SE && Math.abs(gap20) <= DEAD_BAND20) {
    result.status = 'onPace';
  } else {
    result.status = 'unsure';
    result.lean = gap20 < -DEAD_BAND20 ? -1 : gap20 > DEAD_BAND20 ? 1 : 0;
  }
  if (result.status !== 'low' && result.status !== 'high') return result;

  /*
   * ── 권할까 · 왜 안 권하나(먼저 맞는 것이 이긴다) ──
   *
   * 성장기가 계획보다 위로 갈 때는 무엇보다 먼저 '줄이지 않는다'고 말한다 — 지난 날을 보든 칼로리를 직접
   * 정했든 같다. "오늘 화면에서 바꾸면 돼요"라고 하면 없는 '줄이기'가 있는 것처럼 읽힌다.
   * '지난 날'은 오늘이라면 권유가 나왔을 자리에서만 말한다(오늘도 막혔을 상태면 그 까닭을 말한다).
   */
  if (result.status === 'high' && band !== 'adult') return { ...result, hold: 'keep' };
  if (targets.manual) return { ...result, hold: 'manual' };
  const adjust = targets.adjust;

  if (result.status === 'low') {
    if (intake.trusted && intake.ratio !== null && intake.ratio < EAT_FIRST_RATIO) {
      return { ...result, hold: 'eatFirst' };
    }
    const next = effectiveAdjust(adjust + STEP_KCAL, age, goal, targets.delta);
    if (next === adjust) return { ...result, hold: 'cap' };
    if (!input.isToday) return { ...result, hold: 'past' };
    return {
      ...result,
      suggestion: {
        step: STEP_KCAL,
        nextAdjust: next,
        logs: intake.trusted ? 'ok' : 'few',
      },
    };
  }

  if (intake.trusted && intake.ratio !== null && intake.ratio > OVER_EAT_RATIO) {
    return { ...result, hold: 'overEating' };
  }
  const next = effectiveAdjust(adjust - STEP_KCAL, age, goal, targets.delta);
  if (next === adjust) return { ...result, hold: 'floor' };
  /* 덜 먹으라는 말은 먹은 양을 확인했을 때만 한다 */
  if (!intake.trusted) return { ...result, hold: 'needLog' };
  if (!input.isToday) return { ...result, hold: 'past' };
  return { ...result, suggestion: { step: -STEP_KCAL, nextAdjust: next, logs: 'ok' } };
}

/* ─────────────────────────── 화면의 글 ─────────────────────────── */

/** '주 +0.25kg' · '주 0kg' · '주 −0.4kg' — 부호는 늘 붙인다(빼기는 U+2212) */
export function fmtRate(rate20: number, unit: WeightUnit) {
  const value = round1Or2(toWeight(rate20 / 20, unit), unit);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `주 ${sign}${Math.abs(value)}${unit}`;
}

/* kg 은 0.05 단위라 소수 둘째 자리까지(0.25), lb 는 첫째 자리까지 */
const round1Or2 = (n: number, unit: WeightUnit) =>
  unit === 'kg' ? Number(n.toFixed(2)) : round1(n);

const fmtKg = (kg: number, unit: WeightUnit) => `${round1(toWeight(kg, unit))}${unit}`;
const kcalAbs = (n: number) => Math.abs(Math.round(n)).toLocaleString('ko-KR');

/** 카드 밑 한 줄 — 단추가 없을 때 */
export const WEIGHT_FOOT =
  '참고용이에요. 체중은 하루에도 1kg쯤 오르내려요. 주 2~3번, 같은 시간에 재면 충분해요.';
/** 단추가 있을 때 — 던지는 날 가이드와 같은 말(lib/nutrition/guide.ts GUIDE_DISCLAIMER) */
export const WEIGHT_FOOT_ACTION =
  '참고용 안내예요. 몸 상태와 팀 · 지도자의 지침이 먼저예요.';

export type GoalCopy = {
  /** 작은 제목 — '최근 6주 흐름' */
  label: string | null;
  /** 큰 숫자 하나 — '주 +0.25kg' */
  number: string | null;
  /** 작은 줄 — '계획 주 +0.25kg · 목표 82kg까지 2kg · 계획대로면 약 8주' */
  sub: string | null;
  sentence: string | null;
  /** 큰 단추: raise 하루 +100kcal 올리기 · lower 하루 −100kcal 내리기 · maintain 유지로 바꾸기 */
  action: 'raise' | 'lower' | 'maintain' | null;
  /** 단추 밑 작은 글 */
  actionNote: string | null;
  /** 덧말 */
  note: string | null;
  /** 만 18세 밑인데 체중이 줄 때 한 줄 */
  minor: string | null;
  foot: string;
};

export type GoalCopyContext = {
  goal: GoalKey;
  band: AgeBand;
  /** 생년월일을 아는가 */
  ageKnown: boolean;
  hasProfile: boolean;
  unit: WeightUnit;
  isToday: boolean;
};

const MINOR_DROP_LINE =
  '최근 체중이 줄고 있어요. 끼니를 거르지 않는 게 먼저예요. 계속되면 보호자 · 지도자와 이야기해 보세요.';

/** 흐름을 아직 못 읽을 때 — tail 은 '흐름이 보여요' 또는 '계획과 비교해요' */
function missText(miss: TrendMiss, tail: string, isToday: boolean) {
  switch (miss.reason) {
    case 'none':
      return tail === '흐름이 보여요'
        ? '체중을 적으면 흐름을 읽어 드려요. 2주 동안 4번이면 돼요.'
        : '체중을 적으면 계획과 비교해 드려요. 2주 동안 4번이면 돼요.';
    case 'few':
      return `${miss.needPoints}번 더 ${tail === '흐름이 보여요' ? '적으면' : '재면'} ${tail}. 주 2~3번이면 충분해요.`;
    case 'short':
      return miss.needDays > 0
        ? `${miss.needDays}일 더 지나면 ${tail}.`
        : `${isToday ? '오늘' : '한 번 더'} 재면 ${tail}.`;
    case 'stale':
      return isToday
        ? `마지막 기록이 ${miss.staleDays}일 전이에요. 오늘 한 번 재 볼까요?`
        : `마지막 기록이 이날보다 ${miss.staleDays}일 전이에요.`;
  }
}

/** 계획이 없을 때 흐름만 말한다 */
function trendText(trend: Trend, unit: WeightUnit, isToday: boolean) {
  if (!trend.ok) return missText(trend, '흐름이 보여요', isToday);
  switch (trend.kind) {
    case 'up':
      return '늘고 있어요.';
    case 'down':
      return '줄고 있어요.';
    case 'flat':
      return '거의 그대로예요.';
    case 'noisy':
      return `아직 흐름이 또렷하지 않아요. 최근 ${weeksOf(trend)}주 ${round1(toWeight(trend.lowKg, unit))}~${fmtKg(trend.highKg, unit)} 사이예요.`;
  }
}

const weeksOf = (trend: TrendOk) => Math.max(2, Math.round(trend.spanDays / 7));

/**
 * 체중 카드의 글 — 상태 하나에 숫자 하나 · 문장 하나 · 단추 하나.
 *
 * 숫자에 색을 입히지 않고 칭찬도 하지 않는다(체중은 성적이 아니다). 기다리는 상태는 까닭과 남은 날을 말한다.
 * '오차' · '보정' · '한도' · '%' 같은 말은 쓰지 않는다.
 */
export function goalCopy(plan: WeightGoal, ctx: GoalCopyContext): GoalCopy {
  const { goal, band, unit, isToday } = ctx;
  const trend = plan.trend;
  const minor = plan.minorDrop ? MINOR_DROP_LINE : null;
  const empty: GoalCopy = {
    label: null,
    number: null,
    sub: null,
    sentence: null,
    action: null,
    actionNote: null,
    note: null,
    minor,
    foot: WEIGHT_FOOT,
  };
  /* 어린이 카드는 예전 그대로 — 적는 칸과 그래프, 줄어들 때의 한 줄뿐 */
  if (band === 'child' && ctx.ageKnown) return empty;

  const label = trend.ok
    ? `${isToday ? '최근' : '이날까지'} ${weeksOf(trend)}주 흐름`
    : '체중 흐름';
  const decided =
    plan.status === 'onPace' || plan.status === 'low' || plan.status === 'high';
  const number =
    trend.ok && (trend.kind !== 'noisy' || decided)
      ? fmtRate(trend.rate20, unit)
      : null;

  /* ── 계획 없음: 흐름만 ── */
  if (plan.status === 'off') {
    return {
      ...empty,
      label,
      number,
      sentence: trendText(trend, unit, isToday),
      note:
        !ctx.ageKnown && ctx.hasProfile
          ? '생년월일을 내 정보에 적으면 계획과 비교해 드려요.'
          : null,
    };
  }

  /* ── 작은 줄: 계획 · 남은 양 · 약 N주 ── */
  const dir = goal === 'gain' ? 1 : goal === 'lose' ? -1 : 0;
  const pace = plan.paceKg ?? 0;
  const subParts: string[] = [];
  if (dir !== 0 && pace > 0) {
    subParts.push(`계획 ${fmtRate(dir * Math.round(pace * 20), unit)}`);
    if (plan.targetKg !== null && plan.remainingKg !== null && plan.remainingKg > 0) {
      subParts.push(
        `목표 ${fmtKg(plan.targetKg, unit)}까지 ${fmtKg(plan.remainingKg, unit)}`
      );
      if (plan.etaWeeks !== null) subParts.push(`계획대로면 약 ${plan.etaWeeks}주`);
    }
  }
  const base: GoalCopy = {
    ...empty,
    label,
    number,
    sub: subParts.length > 0 ? subParts.join(' · ') : null,
  };

  if (plan.status === 'reached' && plan.targetKg !== null && trend.ok) {
    return {
      ...base,
      label: `목표 ${fmtKg(plan.targetKg, unit)}`,
      number: fmtKg(trend.currentKg, unit),
      sub: null,
      sentence: isToday
        ? '목표 체중에 닿았어요. 이제 유지로 바꿀까요?'
        : '목표 체중에 닿았어요.',
      action: isToday ? 'maintain' : null,
      foot: isToday ? WEIGHT_FOOT_ACTION : WEIGHT_FOOT,
    };
  }

  if (plan.status === 'wait') {
    const days = plan.planDays;
    /*
     * 체중 기록이 없거나 오래됐으면 "N일 뒤에 비교해요"는 지켜지지 않는 약속이다 — 재야 비교할 수 있다고 말한다
     * (wait 일 때 trend 는 56일 전체의 흐름이다).
     */
    const noRecord = !trend.ok && (trend.reason === 'none' || trend.reason === 'stale');
    const sentence = noRecord
      ? missText(trend, '계획과 비교해요', isToday)
      : days !== null && days < WAIT_DAYS
        ? days === 0
          ? `${isToday ? '오늘' : '이날'} 목표를 바꿨어요. ${WAIT_DAYS}일 뒤에 계획과 비교해요.`
          : `새 목표로 ${days}일째예요. ${WAIT_DAYS - days}일 뒤에 계획과 비교해요.`
        : missText(plan.wait ?? missOf(trend), '계획과 비교해요', isToday);
    return { ...base, sentence };
  }

  /* 감량이 목표인데 체중이 그대로이거나 는다 — '천천히 빠져요'는 숫자와 반대되는 말이다 */
  const notLosing = goal === 'lose' && trend.ok && trend.rate20 >= 0;
  const rising = notLosing && trend.ok && trend.rate20 > DEAD_BAND20;

  if (plan.status === 'unsure') {
    const lean =
      plan.lean === 0
        ? null
        : goal === 'gain'
          ? plan.lean < 0
            ? '계획보다 조금 느린 듯해요.'
            : '계획보다 조금 빠른 듯해요.'
          : goal === 'lose'
            ? plan.lean < 0
              ? '계획보다 조금 빨리 빠지는 듯해요.'
              : notLosing
                ? '체중이 줄지 않는 듯해요.'
                : '계획보다 조금 천천히 빠지는 듯해요.'
            : plan.lean < 0
              ? '조금 빠지는 듯해요.'
              : '조금 느는 듯해요.';
    return {
      ...base,
      sentence: lean
        ? `${lean} 아직 확실하지 않아 1~2주 더 볼게요.`
        : '아직 흔들림이 커서 1~2주 더 볼게요.',
    };
  }

  if (plan.status === 'onPace') {
    return {
      ...base,
      sentence:
        goal === 'maintain'
          ? '잘 유지하고 있어요. 지금처럼 먹으면 돼요.'
          : plan.minorDrop
            ? '계획대로예요.'
            : '계획대로예요. 지금처럼 먹으면 돼요.',
    };
  }

  const gap = kcalAbs(plan.intake.gapKcal ?? 0);
  const held =
    plan.hold === 'manual'
      ? '하루 칼로리를 직접 정해 둬서 제안은 쉬어요.'
      : plan.hold === 'past'
        ? '바꾸려면 오늘 화면에서 하면 돼요.'
        : null;

  if (plan.status === 'low') {
    const first =
      goal === 'gain'
        ? trend.ok && trend.rate20 < -DEAD_BAND20
          ? '증량이 목표인데 체중이 줄고 있어요.'
          : '계획보다 느려요.'
        : goal === 'lose'
          ? '계획보다 빨리 빠져요.'
          : '유지가 목표인데 체중이 빠지고 있어요.';
    if (plan.suggestion) {
      return {
        ...base,
        sentence: `${first} 하루 ${STEP_KCAL}kcal 올려 볼까요? 바나나 1개쯤이에요.`,
        action: 'raise',
        actionNote: '올리면 3주쯤 뒤에 다시 비교해요.',
        note:
          plan.suggestion.logs === 'few'
            ? `식사 기록이 ${INTAKE_DAYS}일 중 ${plan.intake.days}일뿐이라 먹은 양은 확인하지 못했어요.`
            : null,
        foot: WEIGHT_FOOT_ACTION,
      };
    }
    const rest =
      held ??
      (plan.hold === 'eatFirst'
        ? `기록으로는 목표보다 하루 ${gap}kcal쯤 덜 먹었어요. 목표는 그대로 두고 먼저 채워 보세요.`
        : goal === 'lose'
          ? '이미 유지만큼 먹는 목표예요. 계속 빠지면 팀 · 지도자와 이야기해 보세요.'
          : `조정은 +${band === 'teen' ? 200 : 300}kcal까지예요. 식단을 팀 · 지도자와 같이 봐 주세요.`);
    return { ...base, sentence: `${first} ${rest}` };
  }

  /* high */
  const first =
    goal === 'gain'
      ? '계획보다 빨라요.'
      : goal === 'lose'
        ? rising
          ? '감량이 목표인데 체중이 늘고 있어요.'
          : notLosing
            ? '감량이 목표인데 체중이 줄지 않고 있어요.'
            : '계획보다 천천히 빠져요.'
        : '유지가 목표인데 체중이 늘고 있어요.';
  /* 줄고는 있을 때만 덧붙인다 — 안 줄고 있는데 "천천히 가도 괜찮아요"는 맞지 않는다 */
  const slowOk = notLosing ? '' : ' 천천히 가도 괜찮아요.';
  if (plan.suggestion) {
    return {
      ...base,
      sentence: `${first} 하루 ${STEP_KCAL}kcal 줄여 볼까요? 밥 1/3공기쯤이에요.`,
      action: 'lower',
      actionNote: '내리면 3주쯤 뒤에 다시 비교해요.',
      foot: WEIGHT_FOOT_ACTION,
    };
  }
  const rest =
    held ??
    (plan.hold === 'keep'
      ? goal === 'lose'
        ? `성장기라 더 줄이지 않아요.${slowOk}`
        : '키가 크는 시기엔 자연스러운 일이에요. 목표는 그대로 둘게요.'
      : plan.hold === 'overEating'
        ? `기록으로는 목표보다 하루 ${gap}kcal쯤 더 먹었어요. 목표에 맞추면 돼요.`
        : plan.hold === 'needLog'
          ? `식사 기록이 적어서 목표는 그대로 둘게요. 2주에 ${INTAKE_MIN_DAYS}일 이상 적으면 다시 봐요.`
          : goal === 'lose'
            ? `목표는 더 낮추지 않아요.${slowOk}`
            : goal === 'gain'
              ? '조정은 −200kcal까지예요. 목표는 그대로 둘게요.'
              : '목표는 그대로 둘게요.');
  return { ...base, sentence: `${first} ${rest}` };
}

/** wait 인데 까닭이 비어 있을 때(있을 수 없지만 타입을 위해) 추세에서 만든다 */
function missOf(trend: Trend): TrendMiss {
  if (!trend.ok) return trend;
  return {
    ok: false,
    reason: 'short',
    n: trend.n,
    needPoints: 0,
    needDays: 0,
    staleDays: 0,
    lastKg: trend.lastKg,
  };
}
