import type { AgeBand } from '@/lib/nutrition/age';
import type { GoalKey, Macros, MealKey } from '@/lib/nutrition/meta';
import type { ThrowGuideKind } from '@/lib/nutrition/guide';

/**
 * 오늘의 영양 조언 — 홈 카드와 영양 탭 맨 위가 같이 쓰는 순수 계산(DB · 화면 없음).
 *
 * 왜 따로 두나(2026-10-07, 사용자): "실 사용자가 지속적으로 쓸 이유" — 기록을 전제로 한 추적기는 2주면 떠난다.
 * 홈에서는 기록 없이도 매일 10초 안에 끝나는 간단 관리(몇 g 더 먹을지 · 균형 점수), 탭에서는 지금처럼 세부 기록 ·
 * 식단 짜기. 그래서 입력은 '있는 것만' 받고(체크인 식사 칸 · 던지는 일정 · 오늘 운동 종류 · 적은 음식 · 체중 흐름),
 * 없는 것은 지어내지 않고 범위로 말한다.
 *
 * 규칙(사용자가 받아들인 것):
 *  - 목표 구속은 영양 계산에 넣지 않는다(근거 없음) — 동기 문구에만.
 *  - 운동 종류의 차이는 하루 총량이 아니라 '언제 무엇을'(운동 뒤 단백질 · 던지기 전 탄수화물)로 말한다.
 *  - 성장기(child · teen)에게는 '덜 먹어라'를 하지 않는다 — 질 조언만. 성인 감량에도 '굶' · '거르'는 없다.
 *  - 제품 · 상표 · 보충제 이름은 없다. 기본 음식(lib/nutrition/foods.ts 의 이름) 조합으로만.
 *  - 기록이 있으면 기록, 없으면 체크인 답, 둘 다 없으면 조언만(숫자 판단 안 함).
 *  - 할 일은 한 줄(headline, 60자 밑). 숫자는 5g · 10g 단위, 설명 없이 할 일만.
 *
 * 2차(2026-10-07, 메모 '클라우드 세션 할 일 — 영양 조언'을 메인이 함): 할 일을 상황표(HEADLINE_RULES — 던지기 × 운동 × 끼니 ×
 * 입맛 · 근육통 × 목표 × 시각)로, 20시 뒤에는 '자기 전 …', 범위는 사용자 목표가 밖이면 목표 쪽으로, 더 먹을 양 어림과 점수는
 * 시각(지금까지 먹었어야 할 몫 expectedShare)으로 보정 — 아침에 적은 기록이 '모자람'으로 벌을 받지 않게.
 *
 * 내보내는 타입을 바꾸면 홈 · 탭 화면이 같이 바뀌니 칸을 더할 때는 선택(?)으로만.
 */

/* ─────────────────────────── 입력 ─────────────────────────── */

/** 오늘 한 운동의 성격 — 트레이닝 세션 운동 목록의 분류(lib/categories.ts)를 넷으로 묶은 것 */
export type TrainingKind = 'power' | 'strength' | 'assist' | 'aerobic';

/** 체크인의 식사 칸(간편 쪽, 셋 다 안 적어도 된다) */
export type MealCheck = {
  /** 끼니 양 — '잘 먹음' · '보통' · '부족'(DailyCheckin.nutrition). 안 적었으면 null */
  amount: '잘 먹음' | '보통' | '부족' | null;
  /** 걸른 끼니(DailyCheckin.skippedMeals). 안 적었으면 빈 배열 */
  skipped: MealKey[];
};

export type AdviceInput = {
  /** 'YYYY-MM-DD' — 오늘인지(지난 날은 조언을 하지 않는다) */
  date: string;
  today: string;
  /** 그날 목표(운동한 만큼 더한 것 — computeTargets) */
  target: Macros;
  /** 적은 음식의 합. 하나도 안 적었으면 null(0 이 아니다 — '안 적음'과 '안 먹음'은 다르다) */
  eaten: Macros | null;
  /** 끼니별로 적은 kcal(적은 끼니만) — 아침을 적었는지 같은 판단에 쓴다 */
  eatenMeals: Partial<Record<MealKey, number>>;
  body: {
    weightKg: number | null;
    ageBand: AgeBand;
    goal: GoalKey;
  };
  /** 오늘 체크인 */
  checkin: {
    meals: MealCheck;
    /** 식욕 1~5. 안 적었으면 null */
    appetite: number | null;
    /** 전신 근육통 1~5. 안 적었으면 null */
    soreness: number | null;
  } | null;
  /** 던지는 날의 종류(lib/nutrition/guide.ts throwDayKind) — 아닌 날은 null */
  throwKind: ThrowGuideKind | null;
  /** 오늘 트레이닝 — 한 운동(done)의 분류를 묶은 것. 운동이 없으면 빈 배열 */
  training: { kind: TrainingKind; minutes: number }[];
  /** 체중 흐름 판정(lib/nutrition/weight-goal.ts) — 카드에 한 줄 덧붙일 때만 쓴다 */
  weight: { status: string; suggestion: { step: number } | null } | null;
  /** 지금 시각(한국, 0~23시) — 저녁에 "아침을 챙기세요"라고 하지 않게 */
  hour: number;
};

/* ─────────────────────────── 출력 ─────────────────────────── */

/** 더 먹을 양 — 적은 기록이 있으면 '정확', 체크인으로 어림했으면 '어림', 둘 다 없으면 null */
export type MoreToEat = {
  /** g — 'logged' 는 목표를 넘겼으면 음수(그만큼 많이 먹음), 'estimate' 는 0 이상 */
  carbs: number;
  protein: number;
  fat: number;
  /** 'logged' 기록에서 뺀 값 · 'estimate' 체크인 답으로 어림한 값 */
  basis: 'logged' | 'estimate';
};

/** 오늘 권하는 양 — 범위로(체중 1kg 당 계산, 10g 단위) */
export type MacroRange = { lo: number; hi: number };

export type Advice = {
  /** 할 일 한 줄 — 홈 카드의 제목. 없으면 null(지난 날) */
  headline: string | null;
  /** 할 일의 짧은 까닭(한 줄, 해요체). 홈에는 안 보이고 탭에서 보인다 */
  why: string | null;
  /** 오늘 권하는 양 */
  range: { carbs: MacroRange; protein: MacroRange; fat: MacroRange };
  /** 지금까지 적은 것 · 체크인으로 본, 더 먹을 양. 모르면 null */
  more: MoreToEat | null;
  /** 균형 점수 0~100. 아무 자료도 없으면 null */
  score: number | null;
  /** 점수를 이룬 것 — 탭의 세부. 홈에는 안 보인다 */
  parts: {
    key: 'kcal' | 'protein' | 'carbs' | 'meals' | 'timing';
    label: string;
    score: number;
    note: string;
  }[];
  /** 오늘을 강조해 보일 날인가(던지는 날 · 운동 종류가 바뀐 날 · '부족'이 이어진 날) */
  highlight: boolean;
};

/* ─────────────────────────── 기준 ─────────────────────────── */

/**
 * 체중 1kg 당 하루 권장 범위(g). 투수 · 야구 선수 연구의 중간값들이다 — 운동 종류로 늘리지 않는다(총량이 아니라
 * 타이밍을 말한다). 체중을 모르면 목표에서 ±10%. 사용자 목표(computeTargets — 직접 정한 kcal · 단백질 포함)가 이 범위
 * 밖이면 목표 쪽으로 당긴다(목표 ±10%) — 사용자가 직접 정한 목표가 이긴다.
 */
export const CARB_PER_KG: Record<'rest' | 'train' | 'throw', MacroRange> = {
  rest: { lo: 3, hi: 5 },
  train: { lo: 5, hi: 7 },
  throw: { lo: 5, hi: 7 },
};
export const PROTEIN_PER_KG: MacroRange = { lo: 1.6, hi: 2.2 };
export const FAT_PER_KG: MacroRange = { lo: 0.8, hi: 1.2 };
/** 범위가 목표를 이만큼 넘게 비켜 있으면 목표 쪽으로 당긴다 */
export const RANGE_SLACK = 0.1;

/** 운동 뒤 · 던진 뒤 단백질 한 끼 — 체중 1kg 당 0.3g 을 20~40g 안에서(어린이 15~30g) */
export const AFTER_PROTEIN_PER_KG = 0.3;

/**
 * 체크인 '끼니 양'을 '지금까지 먹었어야 할 몫(expectedShare)'에 곱하는 계수 — 기록이 없는 날의 더 먹을 양에 쓴다.
 * 아침 10시에 '보통'이면 하루의 2할쯤만 먹은 것이다(시각 보정, 2차).
 */
export const AMOUNT_EATEN_SHARE: Record<NonNullable<MealCheck['amount']>, number> = {
  '잘 먹음': 1,
  보통: 0.85,
  부족: 0.65,
};

/** 끼니 하나가 하루에서 차지하는 몫 — 걸른 끼니를 뺄 때 */
export const MEAL_SHARE: Record<MealKey, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};
/** 이 시각이 지나면 그 끼니는 '지난 끼니'(걸렀다는 말이 뜻을 가진다 — 영양 가이드와 같은 선) */
export const MEAL_OVER_HOUR: Record<MealKey, number> = {
  breakfast: 10,
  lunch: 14,
  dinner: 20,
  snack: 24,
};

/** 이 시각부터는 '운동 뒤 1시간 안' 대신 '자기 전 …' */
export const LATE_HOUR = 20;
/** 이 아래면 입맛이 없는 날(거의 없음 · 적음) — 영양 가이드 · 식단 짜기와 같은 선 */
export const LOW_APPETITE = 2;
/** 이 위면 근육통이 많은 날 — 트레이닝 추천(lib/checkin.ts HIGH_SORENESS)과 같은 선 */
export const HIGH_SORENESS = 4;

/**
 * 지금까지 먹었어야 할 하루 몫(0~1) — 시각으로. 아침 7~10시 · 점심 12~14시 · 저녁 18~20시에 오르고 사이는 조금씩.
 * 기록과 체크인 어림이 둘 다 이것에 견준다: 아침에 적은 기록이 '모자람'으로 벌을 받지 않게, 10시에 '보통'이면 2할쯤.
 */
export function expectedShare(hour: number): number {
  const h = Math.min(24, Math.max(0, hour));
  const points: [number, number][] = [
    [0, 0],
    [7, 0],
    [10, 0.25],
    [12, 0.3],
    [14, 0.6],
    [18, 0.7],
    [20, 0.95],
    [24, 1],
  ];
  for (let i = 1; i < points.length; i++) {
    const [h0, s0] = points[i - 1];
    const [h1, s1] = points[i];
    if (h <= h1) return s0 + ((s1 - s0) * (h - h0)) / (h1 - h0);
  }
  return 1;
}

/* ─────────────────────────── 계산 ─────────────────────────── */

const roundTo = (n: number, unit: number) => Math.round(n / unit) * unit;
const round10 = (n: number) => Math.max(0, roundTo(n, 10));
const round5 = (n: number) => Math.max(0, roundTo(n, 5));

/** 범위가 목표를 비켜 있으면 목표 ±10% 로(사용자 목표가 이긴다) */
function pullToTarget(r: MacroRange, target: number, unit: number): MacroRange {
  if (target <= 0) return r;
  if (target < r.lo * (1 - RANGE_SLACK) || target > r.hi * (1 + RANGE_SLACK)) {
    return {
      lo: Math.min(
        Math.max(0, roundTo(target * 0.9, unit)),
        Math.floor(target / unit) * unit
      ),
      hi: Math.max(roundTo(target * 1.1, unit), Math.ceil(target / unit) * unit),
    };
  }
  return r;
}

function ranges(input: AdviceInput): Advice['range'] {
  const kg = input.body.weightKg;
  const t = input.target;
  const active =
    input.throwKind !== null ? 'throw' : input.training.length > 0 ? 'train' : 'rest';
  let r: Advice['range'];
  if (kg != null && kg > 0) {
    const c = CARB_PER_KG[active];
    r = {
      carbs: { lo: round10(c.lo * kg), hi: round10(c.hi * kg) },
      protein: {
        lo: round5(PROTEIN_PER_KG.lo * kg),
        hi: round5(PROTEIN_PER_KG.hi * kg),
      },
      fat: { lo: round5(FAT_PER_KG.lo * kg), hi: round5(FAT_PER_KG.hi * kg) },
    };
  } else {
    /* 체중을 모르면 목표에서 ±10% */
    r = {
      carbs: { lo: round10(t.carbs * 0.9), hi: round10(t.carbs * 1.1) },
      protein: { lo: round5(t.protein * 0.9), hi: round5(t.protein * 1.1) },
      fat: { lo: round5(t.fat * 0.9), hi: round5(t.fat * 1.1) },
    };
  }
  return {
    carbs: pullToTarget(r.carbs, t.carbs, 10),
    protein: pullToTarget(r.protein, t.protein, 5),
    fat: pullToTarget(r.fat, t.fat, 5),
  };
}

/** 체크인으로 어림한 '지금까지 먹은 하루 몫'(0~1). 끼니 양을 안 적었으면 null */
export function estimatedEatenShare(
  meals: MealCheck | null | undefined,
  hour: number
): number | null {
  if (!meals || meals.amount === null) return null;
  let share = expectedShare(hour) * AMOUNT_EATEN_SHARE[meals.amount];
  /* 걸른 끼니는 그 몫만큼 뺀다 — 아직 안 지난 끼니는 기대 몫에도 없으니 안 뺀다 */
  for (const m of new Set(meals.skipped)) {
    if (hour >= MEAL_OVER_HOUR[m]) share -= MEAL_SHARE[m];
  }
  return Math.min(1, Math.max(0, share));
}

function moreToEat(input: AdviceInput): MoreToEat | null {
  const t = input.target;
  if (input.eaten) {
    /* 기록에서 뺀 값은 음수도 그대로 — 목표를 넘겼으면 그만큼(화면은 0 밑을 '충분'으로 보인다) */
    return {
      carbs: roundTo(t.carbs - input.eaten.carbs, 10),
      protein: roundTo(t.protein - input.eaten.protein, 5),
      fat: roundTo(t.fat - input.eaten.fat, 5),
      basis: 'logged',
    };
  }
  const share = estimatedEatenShare(input.checkin?.meals, input.hour);
  if (share === null) return null;
  return {
    carbs: round10(t.carbs * (1 - share)),
    protein: round5(t.protein * (1 - share)),
    fat: round5(t.fat * (1 - share)),
    basis: 'estimate',
  };
}

/** 운동 뒤 · 던진 뒤 단백질 한 끼(g) */
export function afterProtein(weightKg: number | null, band: AgeBand): MacroRange {
  const cap = band === 'child' ? { lo: 15, hi: 30 } : { lo: 20, hi: 40 };
  if (weightKg == null) return cap;
  const g = round5(AFTER_PROTEIN_PER_KG * weightKg);
  return {
    lo: Math.min(cap.hi, Math.max(cap.lo, g)),
    hi: Math.min(cap.hi, Math.max(cap.lo, g + 10)),
  };
}

const fmtRange = (r: MacroRange) => (r.lo === r.hi ? `${r.lo}g` : `${r.lo}~${r.hi}g`);

/* ─────────────────────────── 할 일 상황표 ─────────────────────────── */

/** 상황표 한 줄이 보는 것 */
type Situation = {
  input: AdviceInput;
  more: MoreToEat | null;
  /** 20시 뒤 */
  late: boolean;
  minor: boolean;
  /** 운동 뒤 · 던진 뒤 단백질 한 끼 */
  after: MacroRange;
  skipped: MealKey[];
  appetite: number | null;
  soreness: number | null;
};

export type HeadlineRule = {
  key: string;
  /** 이 줄이 맞는 상황인가 */
  when: (s: Situation) => boolean;
  /** 할 일 한 줄 · 까닭 — 시각(late)에 따라 다를 수 있다 */
  say: (s: Situation) => { headline: string; why: string };
};

const AFTER_SNACK = '우유 2컵 + 바나나';
const LATE_PROTEIN = '자기 전 우유 · 요거트';

/**
 * 할 일 상황표 — 위가 이긴다. 던진 뒤 회복식 → 던지는 날(오전 던지기 전 · 오후 던진 뒤) → 등판 전날 → 운동 뒤 단백질(파워 ·
 * 웨이트) → 긴 유산소 → 걸른 끼니(지금 채우기) → 입맛 없음 → 근육통 → 더 먹을 양(단백질 → 탄수화물) → 많이 먹음(성인만) →
 * 목표별 기본. 20시 뒤(late)에는 '1시간 안' 대신 '자기 전 …'.
 *
 * 글 규칙: 해요체 · 줄표 없음 · 60자 밑 · 음식은 기본 음식 이름 · 상표 · 보충제 없음. 성장기에게는 '덜' · '가볍게' · '줄이' ·
 * '빼고' · '적게 먹'이 없고(아래 시험이 격자로 본다), 성인 감량에도 '굶' · '거르'는 없다.
 */
export const HEADLINE_RULES: readonly HeadlineRule[] = [
  {
    key: 'after-throw',
    when: (s) => s.input.throwKind === 'after',
    say: (s) =>
      s.late
        ? {
            headline: `던진 뒤라 ${LATE_PROTEIN}로 단백질 ${fmtRange(s.after)}`,
            why: '던진 날 밤의 단백질이 팔 회복을 돕고 잠도 깊게 해요.',
          }
        : {
            headline: `던진 뒤 1시간 안에 단백질 ${fmtRange(s.after)} · ${AFTER_SNACK}`,
            why: '던진 뒤 바로 단백질과 탄수화물을 같이 먹으면 팔이 빨리 회복돼요.',
          },
  },
  {
    key: 'throw-today',
    when: (s) => s.input.throwKind === 'today',
    say: (s) =>
      s.late
        ? {
            headline: `던졌으면 ${LATE_PROTEIN}로 단백질 ${fmtRange(s.after)}`,
            why: '늦게 던진 날은 자기 전 단백질이 회복식이에요.',
          }
        : s.input.hour < 12
          ? {
              headline: '던지기 3시간 전 밥 한 공기 · 담백한 반찬으로',
              why: '던지기 전에는 소화가 빠른 탄수화물이 힘이 돼요.',
            }
          : {
              headline: `던진 뒤 1시간 안에 단백질 ${fmtRange(s.after)} · ${AFTER_SNACK}`,
              why: '던진 뒤 바로 단백질과 탄수화물을 같이 먹으면 팔이 빨리 회복돼요.',
            },
  },
  {
    key: 'throw-eve',
    when: (s) => s.input.throwKind === 'eve',
    say: (s) =>
      s.late
        ? {
            headline: '자기 전 바나나 한 개 + 우유 한 컵',
            why: '내일 등판이라 오늘 밤 탄수화물이 내일 힘이 돼요.',
          }
        : {
            headline: '저녁에 밥 · 면 · 고구마 한 가지 더',
            why: '내일 등판이라 오늘 저녁 탄수화물이 내일 힘이 돼요.',
          },
  },
  {
    key: 'strength',
    when: (s) =>
      s.input.training.some((t) => t.kind === 'strength' || t.kind === 'power'),
    say: (s) => {
      const power = s.input.training.some((t) => t.kind === 'power');
      return s.late
        ? {
            headline: `${LATE_PROTEIN}로 단백질 ${fmtRange(s.after)}`,
            why: power
              ? '파워 운동 뒤 단백질이 근육을 지켜요. 늦었으면 자기 전에.'
              : '웨이트 뒤 단백질이 근육을 키워요. 늦었으면 자기 전에.',
          }
        : {
            headline: `운동 뒤 1시간 안에 단백질 ${fmtRange(s.after)} · 달걀 2개 + 우유`,
            why: power
              ? '파워 운동 뒤 단백질이 근육을 지켜요.'
              : '웨이트 뒤 단백질이 근육을 키워요.',
          };
    },
  },
  {
    key: 'aerobic',
    when: (s) => s.input.training.some((t) => t.kind === 'aerobic' && t.minutes >= 45),
    say: (s) =>
      s.late
        ? {
            headline: '자기 전 바나나 한 개 + 우유 한 컵',
            why: '유산소를 오래 하면 탄수화물이 먼저 비어요.',
          }
        : {
            headline: '운동 뒤 바나나 · 주스로 탄수화물 보충',
            why: '유산소를 오래 하면 탄수화물이 먼저 비어요.',
          },
  },
  {
    key: 'skipped-breakfast',
    when: (s) => s.skipped.includes('breakfast') && s.input.hour < 11,
    say: () => ({
      headline: '지금 우유 한 컵 + 바나나 · 점심을 든든히',
      why: '아침을 걸렀으면 점심 전에 조금이라도 채우는 게 좋아요.',
    }),
  },
  {
    key: 'skipped-lunch',
    when: (s) => s.skipped.includes('lunch') && s.input.hour >= 13 && s.input.hour < 17,
    say: () => ({
      headline: '지금 삼각김밥 + 우유 · 저녁을 든든히',
      why: '점심을 걸렀으면 저녁 전에 조금이라도 채우는 게 좋아요.',
    }),
  },
  {
    key: 'low-appetite',
    when: (s) => s.appetite !== null && s.appetite <= LOW_APPETITE,
    say: (s) =>
      s.late
        ? {
            headline: '자기 전 우유 · 요거트처럼 잘 넘어가는 것 한 가지',
            why: '입맛이 없는 날은 한 번에 많이보다 조금씩 자주가 나아요.',
          }
        : {
            headline: '조금씩 자주 · 우유 · 바나나 · 요거트처럼 잘 넘어가는 것',
            why: '입맛이 없는 날은 한 번에 많이보다 조금씩 자주가 나아요.',
          },
  },
  {
    key: 'soreness',
    when: (s) => s.soreness !== null && s.soreness >= HIGH_SORENESS,
    say: (s) =>
      s.late
        ? {
            headline: `${LATE_PROTEIN}로 단백질 한 번 더`,
            why: '근육통이 많은 날은 자기 전 단백질이 회복을 도와요.',
          }
        : {
            headline: '저녁과 자기 전에 단백질 한 번 더 · 우유 · 요거트',
            why: '근육통이 많은 날은 단백질을 한 번 더 나눠 먹는 게 좋아요.',
          },
  },
  {
    key: 'more-protein',
    when: (s) => s.more !== null && s.more.protein >= 20,
    say: (s) => {
      const g = s.more!.protein;
      const basis =
        s.more!.basis === 'logged'
          ? '적은 것으로 보면 단백질이 아직 모자라요.'
          : '체크인의 끼니 양으로 어림한 양이에요.';
      return s.late
        ? {
            headline: `${LATE_PROTEIN}로 단백질 ${Math.min(30, g)}g`,
            why: basis,
          }
        : {
            headline: `오늘 단백질 ${g}g 더 · 닭가슴살 한 조각 또는 달걀 2개`,
            why: basis,
          };
    },
  },
  {
    key: 'more-carbs',
    when: (s) => s.more !== null && s.more.carbs >= 80,
    say: (s) => {
      const basis =
        s.more!.basis === 'logged'
          ? '적은 것으로 보면 탄수화물이 아직 모자라요.'
          : '체크인의 끼니 양으로 어림한 양이에요.';
      return s.late
        ? { headline: '자기 전 바나나 한 개 + 우유 한 컵', why: basis }
        : { headline: `오늘 탄수화물 ${s.more!.carbs}g 더 · 밥 한 공기쯤`, why: basis };
    },
  },
  {
    key: 'over',
    when: (s) =>
      !s.minor && s.more !== null && s.more.basis === 'logged' && s.more.carbs <= -80,
    say: (s) =>
      s.late
        ? {
            headline: '오늘은 충분히 먹었어요 · 물 한 컵',
            why: '목표보다 많이 먹었어요.',
          }
        : {
            headline: '오늘은 충분히 먹었어요 · 저녁은 가볍게',
            why: '목표보다 많이 먹었어요.',
          },
  },
  {
    key: 'gain',
    when: (s) => s.input.body.goal === 'gain',
    say: (s) =>
      s.late
        ? {
            headline: '자기 전 우유 한 컵 + 바나나',
            why: '증량 중이라 자기 전 한 끼가 하루를 채워요.',
          }
        : {
            headline: '끼니마다 밥 반 공기 더 · 자기 전 우유',
            why: '증량 중이라 끼니 사이를 채우는 게 핵심이에요.',
          },
  },
  {
    key: 'lose',
    when: (s) => !s.minor && s.input.body.goal === 'lose',
    say: (s) =>
      s.late
        ? {
            headline: '자기 전엔 물 한 컵 · 배고프면 요거트 하나',
            why: '감량 중이어도 끼니는 다 챙기고 밤 간식만 가볍게.',
          }
        : {
            headline: '끼니마다 단백질 한 가지 · 채소를 먼저',
            why: '감량 중에는 단백질과 채소를 먼저 먹으면 배가 덜 고파요.',
          },
  },
  {
    key: 'default',
    when: () => true,
    say: (s) =>
      s.late
        ? {
            headline: '오늘 몫은 다 챙겼어요 · 자기 전 우유 한 컵',
            why: '오늘은 특별히 더할 게 없어요.',
          }
        : {
            headline: '끼니마다 단백질 한 가지 · 밥은 평소대로',
            why: '오늘은 특별히 더할 게 없어요. 평소대로 챙기면 돼요.',
          },
  },
];

function headlineOf(
  input: AdviceInput,
  more: MoreToEat | null
): { headline: string; why: string; rule: string } {
  const s: Situation = {
    input,
    more,
    late: input.hour >= LATE_HOUR,
    minor: input.body.ageBand !== 'adult',
    after: afterProtein(input.body.weightKg, input.body.ageBand),
    skipped: input.checkin?.meals.skipped ?? [],
    appetite: input.checkin?.appetite ?? null,
    soreness: input.checkin?.soreness ?? null,
  };
  const rule = HEADLINE_RULES.find((r) => r.when(s))!;
  return { ...rule.say(s), rule: rule.key };
}

/* ─────────────────────────── 균형 점수 ─────────────────────────── */

/** 점수 조각의 무게 — 열량 · 단백질 1, 탄수화물 0.5, 끼니(체크인) 1 */
const PART_WEIGHT: Record<Advice['parts'][number]['key'], number> = {
  kcal: 1,
  protein: 1,
  carbs: 0.5,
  meals: 1,
  timing: 1,
};

/**
 * 85~115% 가 만점, 그 밖은 10% 마다 20점씩. 오늘을 보는 중이면 '지금까지 먹었어야 할 몫'에 견준다 — 아침에 적은 기록이
 * '모자람'으로 벌을 받지 않게(기록을 벌주지 않는다). 지난 날은 하루 전체.
 */
function closeness(got: number, want: number) {
  if (want <= 0) return 100;
  const r = got / want;
  const off = r < 0.85 ? 0.85 - r : r > 1.15 ? r - 1.15 : 0;
  return Math.max(0, Math.round(100 - off * 200));
}

function scoreOf(input: AdviceInput): { score: number | null; parts: Advice['parts'] } {
  const parts: Advice['parts'] = [];
  const t = input.target;
  const isToday = input.date === input.today;
  /* 아침 7시 전에 적은 것은 몫 0 에 견줄 수 없다 — 적어도 하루의 15% 에 견준다 */
  const pace = isToday ? Math.max(0.15, expectedShare(input.hour)) : 1;
  const paceNote = isToday && pace < 1 ? ` (지금까지 ${Math.round(pace * 100)}%)` : '';
  if (input.eaten) {
    parts.push({
      key: 'kcal',
      label: '열량',
      score: closeness(input.eaten.kcal, t.kcal * pace),
      note: `${Math.round(input.eaten.kcal)} / ${t.kcal}kcal${paceNote}`,
    });
    parts.push({
      key: 'protein',
      label: '단백질',
      score: closeness(input.eaten.protein, t.protein * pace),
      note: `${Math.round(input.eaten.protein)} / ${t.protein}g`,
    });
    parts.push({
      key: 'carbs',
      label: '탄수화물',
      score: closeness(input.eaten.carbs, t.carbs * pace),
      note: `${Math.round(input.eaten.carbs)} / ${t.carbs}g`,
    });
  }
  const meals = input.checkin?.meals;
  if (meals && (meals.amount !== null || meals.skipped.length > 0)) {
    const base =
      meals.amount === '잘 먹음'
        ? 100
        : meals.amount === '보통'
          ? 75
          : meals.amount === '부족'
            ? 45
            : 80;
    const skipped = new Set(meals.skipped).size;
    const score = Math.max(0, base - skipped * 20);
    const note = skipped > 0 ? `${skipped}끼 걸렀어요` : (meals.amount ?? '적음');
    parts.push({ key: 'meals', label: '끼니', score, note });
  }
  if (parts.length === 0) return { score: null, parts };
  const weight = parts.reduce((a, p) => a + PART_WEIGHT[p.key], 0);
  const score = Math.round(
    parts.reduce((a, p) => a + p.score * PART_WEIGHT[p.key], 0) / weight
  );
  return { score: Math.min(100, Math.max(0, score)), parts };
}

export function buildAdvice(input: AdviceInput): Advice {
  const range = ranges(input);
  if (input.date !== input.today) {
    const { score, parts } = scoreOf(input);
    return {
      headline: null,
      why: null,
      range,
      more: null,
      score,
      parts,
      highlight: false,
    };
  }
  const more = moreToEat(input);
  const { headline, why } = headlineOf(input, more);
  const { score, parts } = scoreOf(input);
  const highlight =
    input.throwKind !== null ||
    input.training.some((t) => t.kind === 'power' || t.kind === 'strength') ||
    input.checkin?.meals.amount === '부족' ||
    (input.checkin?.meals.skipped.length ?? 0) > 0;
  return { headline, why, range, more, score, parts, highlight };
}

/** 어느 줄이 골라졌나 — 시험 · 디버그용(화면은 쓰지 않는다) */
export function headlineRuleOf(input: AdviceInput): string | null {
  if (input.date !== input.today) return null;
  return headlineOf(input, moreToEat(input)).rule;
}

/** 트레이닝 세션의 운동 분류(lib/categories.ts 이름) → 넷 */
export function trainingKindOf(category: string): TrainingKind | null {
  if (category === '파워') return 'power';
  if (category === '하체 스트렝스' || category === '상체 스트렝스') return 'strength';
  if (category === '유산소') return 'aerobic';
  if (
    category === '회복 및 보강' ||
    category === '코어' ||
    category === '암케어' ||
    category === '모빌리티'
  )
    return 'assist';
  return null;
}
