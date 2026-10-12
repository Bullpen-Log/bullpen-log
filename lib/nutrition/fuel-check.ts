import { EAT_FIRST_RATIO } from '@/lib/nutrition/weight-goal';

/**
 * 영양 추세 깃발 — 지난 7일에 '적게 먹음 · 몸무게가 줄어듦 · 컨디션이 낮음'이 함께 보이면 선다. 순수 함수(DB 를 모른다).
 * 트레이닝 추천 2판 P6-7(2026-10-13).
 *
 * 왜. 운동 무게는 '다 채우면 올린다'(lib/workout/free-weight.ts · lib/program/next-weight.ts)만 보고 오른다. 그런데 먹는 양이 모자라
 * 몸무게가 빠지고 컨디션까지 처지는 주에는 다 채운 것이 몸이 따라온 증거가 못 된다 — 그 주에 무게를 더 얹으면 회복이 못 따라오고
 * 다치기 쉽다(운동선수의 에너지 부족). 그래서 셋이 겹치는 주에는 무게 올리기만 멈추고(내림 · 쉰 기간 낮춤은 그대로), 영양 탭에서
 * 끼니부터 채우자고 말한다. 셋 중 하나나 둘은 흔하다(감량 중이면 적게 먹고 몸무게가 빠진다, 바쁜 주는 컨디션이 낮다) — 겹칠 때만
 * 선다.
 *
 *   ① 기록한 날 — 끼니를 둘 이상(FUEL_MIN_MEALS) 적은 날. 한 끼만 적은 날은 적게 먹은 날처럼 보여 기록한 날로 안 센다(정말 적게
 *      먹었는지 적기를 빼먹었는지 모른다). 7일 중 5일(FUEL_MIN_LOGGED_DAYS) 이상 기록해야 판단한다 — 그보다 적으면 깃발은 없다.
 *   ② 섭취 낮음 — 기록한 날 가운데 kcal 이 목표의 85%(EAT_FIRST_RATIO, 체중 목표의 '먼저 채우기'와 같은 선) 밑이거나 단백질이 목표의
 *      85% 밑인 날이 3일(FUEL_LOW_DAYS) 이상. 단백질을 모르는 음식이 섞인 날(protein null)은 단백질로는 낮다고 치지 않는다 — 모르는
 *      음식이 0g 으로 들어가 낮게 보인다. 목표는 운동 몫을 뺀 하루 기본 목표(Targets.base)로 받는다(부르는 쪽 fuel-load.ts) — 낮은
 *      쪽으로 재야 깃발이 덜 선다(놓치는 편이 잘못 서는 편보다 낫다).
 *   ③ 몸무게 감소 — 그 7일에 잰 몸무게(3번 이상, 처음과 마지막이 4일 이상 떨어짐)에 곧은 선을 맞춰 일주일에 0.5kg 이상 주는 흐름.
 *      영양 탭의 체중 흐름(weight-goal.ts, 56일 · 4번 · 14일)보다 짧다 — 이 깃발은 '이번 주'를 보는 것이고, 하루 흔들림(±0.6kg)은
 *      ② · ④ 가 함께 걸려야 하는 것으로 거른다.
 *   ④ 컨디션 낮음 — 그 7일 체크인 컨디션(1~10) 평균이 5 이하(3번 이상 남겼을 때만). 하루 낮은 날(LOW_CONDITION_THRESHOLD 4)은
 *      매일 일정이 따로 본다 — 여기는 한 주의 바닥.
 *
 * 7일은 어제까지(D-7..D-1)를 부르는 쪽이 넘긴다. 오늘은 아직 먹는 중이라 섭취가 낮게 보이고, 오늘 컨디션 · 몸무게는 오늘 일정이
 * 따로 읽는다. 깃발이 서면 why 에 까닭 세 줄(해요체 · 줄표 없음), holdText 에 무게 추천 글에 붙일 한 마디가 들어간다.
 */

/** 보는 날 수 — 어제까지 7일 */
export const FUEL_WINDOW_DAYS = 7;
/** 판단에 필요한 기록한 날(①) */
export const FUEL_MIN_LOGGED_DAYS = 5;
/** 기록한 날로 치는 끼니 수(①) */
export const FUEL_MIN_MEALS = 2;
/** 적게 먹은 날의 선(②) — 체중 목표의 '먼저 채우기'와 같은 85% */
export const FUEL_LOW_RATIO = EAT_FIRST_RATIO;
/** 섭취 낮음으로 치는 날 수(②) */
export const FUEL_LOW_DAYS = 3;
/** 몸무게 감소로 치는 일주일 변화(③, kg) */
export const FUEL_WEIGHT_DROP_KG = 0.5;
/** 몸무게 흐름을 재는 최소 횟수 · 처음과 마지막 사이(③) */
export const FUEL_MIN_WEIGHINS = 3;
export const FUEL_MIN_WEIGH_SPAN_DAYS = 4;
/** 컨디션 낮음의 평균 선(④, 1~10) · 최소 체크인 수 */
export const FUEL_CONDITION_AVG = 5;
export const FUEL_MIN_CHECKINS = 3;

/** 무게 추천 글에 붙는 한 마디 — 깃발이 섰을 때 무게를 올리지 않은 까닭(free-weight.ts ⑦ · next-weight.ts 'held') */
export const FUEL_HOLD_TEXT = '먹는 양이 모자라 보여 이번엔 올리지 않았어요';

export type FuelDay = {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 그날 먹은 kcal(양을 곱한 합) */
  kcal: number;
  /** 그날 먹은 단백질(g) — 단백질을 모르는 음식이 섞였으면 null */
  protein: number | null;
  /** 그날 잰 몸무게 — 안 쟀으면 null */
  weightKg: number | null;
  /** 그날 체크인 컨디션(1~10) — 체크인이 없으면 null */
  condition: number | null;
  /** 끼니를 FUEL_MIN_MEALS 이상 적었나(①) */
  logged: boolean;
};

/** 하루 기본 목표 — 단백질 목표를 모르면 null(그러면 kcal 로만 본다) */
export type FuelTargets = { kcal: number; protein: number | null };

export type FuelCheck = {
  /** 셋이 함께 보여 무게 올리기를 멈추는가 */
  flag: boolean;
  /** 깃발이 섰을 때만 까닭 세 줄(섭취 · 몸무게 · 컨디션) — 안 섰으면 빈 줄 */
  why: string[];
  /** 깃발이 섰을 때 무게 추천에 넘길 글(FUEL_HOLD_TEXT), 아니면 null */
  holdText: string | null;
  /** 기록한 날 수(①) */
  loggedDays: number;
  /** 적게 먹은 날 수(②) */
  lowDays: number;
  /** 몸무게 일주일 변화(kg, 늘면 +) — 잴 수 없으면 null */
  kgPerWeek: number | null;
  /** 컨디션 평균 — 체크인이 모자라면 null */
  conditionAvg: number | null;
};

/** 깃발이 없는 결과 — 부르는 쪽이 읽을 것이 없을 때(영양 목표 줄이 없음 등) 같은 모양을 돌려준다 */
export const NO_FUEL_CHECK: FuelCheck = {
  flag: false,
  why: [],
  holdText: null,
  loggedDays: 0,
  lowDays: 0,
  kgPerWeek: null,
  conditionAvg: null,
};

function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function numText(n: number): string {
  const r = round1(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 몸무게 흐름(③) — 곧은 선의 기울기 × 7. 잰 횟수 · 사이가 모자라면 null */
export function weeklyWeightChange(
  points: readonly { date: string; kg: number }[]
): number | null {
  if (points.length < FUEL_MIN_WEIGHINS) return null;
  const xs = points.map((p) => dayIndex(p.date));
  if (Math.max(...xs) - Math.min(...xs) < FUEL_MIN_WEIGH_SPAN_DAYS) return null;
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.kg, 0) / n;
  let sxy = 0;
  let sxx = 0;
  points.forEach((p, i) => {
    sxy += (xs[i] - mx) * (p.kg - my);
    sxx += (xs[i] - mx) ** 2;
  });
  return sxx === 0 ? null : (sxy / sxx) * 7;
}

/** 적게 먹은 날인가(②) — 기록한 날만 */
function lowIntake(d: FuelDay, t: FuelTargets): boolean {
  if (!d.logged) return false;
  const kcalLow = t.kcal > 0 && d.kcal < t.kcal * FUEL_LOW_RATIO;
  const proteinLow =
    t.protein != null &&
    t.protein > 0 &&
    d.protein != null &&
    d.protein < t.protein * FUEL_LOW_RATIO;
  return kcalLow || proteinLow;
}

export function fuelCheckOf(input: {
  days: readonly FuelDay[];
  targets: FuelTargets;
}): FuelCheck {
  /* 날짜로 다시 세워 마지막 7일만 — 부르는 쪽이 더 넘겨도 같은 창을 본다 */
  const days = [...input.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-FUEL_WINDOW_DAYS);

  const loggedDays = days.filter((d) => d.logged).length;
  const lowDays = days.filter((d) => lowIntake(d, input.targets)).length;

  const weighed = days
    .filter(
      (d): d is FuelDay & { weightKg: number } => d.weightKg != null && d.weightKg > 0
    )
    .map((d) => ({ date: d.date, kg: d.weightKg }));
  const change = weeklyWeightChange(weighed);

  const conditions = days.map((d) => d.condition).filter((c): c is number => c != null);
  const conditionAvg =
    conditions.length >= FUEL_MIN_CHECKINS
      ? conditions.reduce((a, b) => a + b, 0) / conditions.length
      : null;

  const enough = loggedDays >= FUEL_MIN_LOGGED_DAYS;
  const intakeLow = lowDays >= FUEL_LOW_DAYS;
  const weightDown = change != null && change <= -FUEL_WEIGHT_DROP_KG;
  const conditionLow = conditionAvg != null && conditionAvg <= FUEL_CONDITION_AVG;
  const flag = enough && intakeLow && weightDown && conditionLow;

  return {
    flag,
    why: flag
      ? [
          `지난 ${FUEL_WINDOW_DAYS}일 중 ${lowDays}일은 목표의 ${Math.round(FUEL_LOW_RATIO * 100)}%보다 적게 먹었어요.`,
          `몸무게가 일주일에 ${numText(-(change as number))}kg씩 줄고 있어요.`,
          `컨디션이 평균 ${numText(conditionAvg as number)}/10이에요.`,
        ]
      : [],
    holdText: flag ? FUEL_HOLD_TEXT : null,
    loggedDays,
    lowDays,
    kgPerWeek: change == null ? null : round1(change),
    conditionAvg: conditionAvg == null ? null : round1(conditionAvg),
  };
}

export type FuelCard = {
  title: string;
  /** 까닭 세 줄(FuelCheck.why) */
  lines: string[];
  /** 무게를 어떻게 하는가 */
  hold: string;
  /** 진료 안내 — 성장기는 보호자 · 지도자부터 */
  care: string;
};

/**
 * 영양 탭 카드의 글 — 깃발이 섰을 때만. 성장기(만 18세 밑 — 영양의 나이 칸 child · teen)는 보호자 · 지도자와 먼저 이야기하게
 * 한다(체중 목표의 성장기 감소 안내와 같은 뜻).
 */
export function fuelCardOf(check: FuelCheck, youth: boolean): FuelCard | null {
  if (!check.flag) return null;
  return {
    title: '먹는 양이 모자라 보여요',
    lines: check.why,
    hold: '무게 올리기는 잠시 멈추고, 끼니부터 채워요.',
    care: youth
      ? '보호자나 지도자와 이야기해 보고, 이런 날이 이어지면 진료를 받아 보세요.'
      : '이런 날이 2주 넘게 이어지거나 어지럽고 자주 아프면 진료를 받아 보세요.',
  };
}

/**
 * 날마다 몸무게 하나 — 영양 탭에 적은 값이 체크인보다 앞선다(나중에 따로 고쳐 적은 값이다). 영양 탭 읽기(load.ts)와 영양 추세
 * 읽기(fuel-load.ts)가 같은 규칙을 쓰게 한 곳에 둔다.
 */
export function mergeDayWeights(
  checkins: readonly { date: string; kg: number | null }[],
  daily: readonly { date: string; kg: number | null }[]
): Map<string, { kg: number; from: 'nutrition' | 'checkin' }> {
  const out = new Map<string, { kg: number; from: 'nutrition' | 'checkin' }>();
  for (const c of checkins) {
    if (c.kg !== null) out.set(c.date, { kg: c.kg, from: 'checkin' });
  }
  for (const d of daily) {
    if (d.kg !== null) out.set(d.date, { kg: d.kg, from: 'nutrition' });
  }
  return out;
}
