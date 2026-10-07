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
 *  - 성장기(child · teen)에게는 '덜 먹어라'를 하지 않는다 — 질 조언만.
 *  - 제품 · 상표 추천은 없다. 기본 음식 조합으로만.
 *  - 기록이 있으면 기록, 없으면 체크인 답, 둘 다 없으면 조언만(숫자 판단 안 함).
 *  - 할 일은 한 줄(headline). 숫자는 범위로, 소수점 없이.
 *
 * 이 파일은 계약(타입)과 첫 구현이다. 규칙표 · 문구 · 격자 시험은 클라우드 세션이 깊게 한다
 * (docs/claude/geum-yunho.md 4절 '클라우드 세션 할 일 — 영양 조언'). 내보내는 타입을 바꾸면 홈 · 탭 화면이 같이 바뀌니
 * 칸을 더할 때는 선택(?)으로만.
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
 * 타이밍을 말한다). 체중을 모르면 목표 kcal 에서 비율로 거꾸로 센다.
 */
export const CARB_PER_KG: Record<'rest' | 'train' | 'throw', MacroRange> = {
  rest: { lo: 3, hi: 5 },
  train: { lo: 5, hi: 7 },
  throw: { lo: 5, hi: 7 },
};
export const PROTEIN_PER_KG: MacroRange = { lo: 1.6, hi: 2.2 };
export const FAT_PER_KG: MacroRange = { lo: 0.8, hi: 1.2 };

/** 운동 뒤 · 던진 뒤 단백질 한 끼 — 체중 1kg 당 0.3g 을 20~40g 안에서(어린이 15~30g) */
export const AFTER_PROTEIN_PER_KG = 0.3;

/** 체크인 '끼니 양'으로 어림한 '먹은 비율' — 기록이 없는 날의 더 먹을 양에 쓴다 */
export const AMOUNT_EATEN_SHARE: Record<NonNullable<MealCheck['amount']>, number> = {
  '잘 먹음': 0.95,
  보통: 0.8,
  부족: 0.6,
};

/* ─────────────────────────── 계산 ─────────────────────────── */

const round10 = (n: number) => Math.max(0, Math.round(n / 10) * 10);
const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

function ranges(input: AdviceInput): Advice['range'] {
  const kg = input.body.weightKg;
  const active =
    input.throwKind !== null ? 'throw' : input.training.length > 0 ? 'train' : 'rest';
  if (kg != null && kg > 0) {
    const c = CARB_PER_KG[active];
    return {
      carbs: { lo: round10(c.lo * kg), hi: round10(c.hi * kg) },
      protein: {
        lo: round5(PROTEIN_PER_KG.lo * kg),
        hi: round5(PROTEIN_PER_KG.hi * kg),
      },
      fat: { lo: round5(FAT_PER_KG.lo * kg), hi: round5(FAT_PER_KG.hi * kg) },
    };
  }
  /* 체중을 모르면 목표에서 ±10% */
  const t = input.target;
  const band = (v: number, step: (n: number) => number) => ({
    lo: step(v * 0.9),
    hi: step(v * 1.1),
  });
  return {
    carbs: band(t.carbs, round10),
    protein: band(t.protein, round5),
    fat: band(t.fat, round5),
  };
}

function moreToEat(input: AdviceInput): MoreToEat | null {
  const t = input.target;
  if (input.eaten) {
    /* 기록에서 뺀 값은 음수도 그대로 — 목표를 넘겼으면 그만큼(화면은 0 밑을 '충분'으로 보인다) */
    const step = (n: number, unit: number) => Math.round(n / unit) * unit;
    return {
      carbs: step(t.carbs - input.eaten.carbs, 10),
      protein: step(t.protein - input.eaten.protein, 5),
      fat: step(t.fat - input.eaten.fat, 5),
      basis: 'logged',
    };
  }
  const amount = input.checkin?.meals.amount ?? null;
  if (amount === null) return null;
  /* 끼니 양으로 어림 — 걸른 끼니가 있으면 그만큼 덜 먹은 것으로(끼니 하나 ≈ 하루의 3할) */
  const skipped = input.checkin?.meals.skipped.length ?? 0;
  const share = Math.max(0.3, AMOUNT_EATEN_SHARE[amount] - skipped * 0.25);
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

/**
 * 할 일 한 줄 — 위가 이긴다. 던진 뒤 회복식 → 던지기 전 탄수화물 → 운동 뒤 단백질 → 걸른 끼니 → 더 먹을 양 → 기본.
 * 성장기에게 '덜 먹어라'는 없다.
 */
function headlineOf(
  input: AdviceInput,
  more: MoreToEat | null
): { headline: string; why: string } {
  const { body, checkin, throwKind, training, hour } = input;
  const minor = body.ageBand !== 'adult';
  const after = afterProtein(body.weightKg, body.ageBand);

  if (throwKind === 'after') {
    return {
      headline: `던진 뒤 1시간 안에 단백질 ${fmtRange(after)} · 우유 2컵 + 바나나`,
      why: '던진 뒤 바로 단백질과 탄수화물을 같이 먹으면 팔이 빨리 회복돼요.',
    };
  }
  if (throwKind === 'today') {
    return hour < 12
      ? {
          headline: '던지기 3시간 전 밥 한 공기 · 기름진 것은 빼고',
          why: '던지기 전에는 소화가 빠른 탄수화물이 힘이 돼요.',
        }
      : {
          headline: `던진 뒤 1시간 안에 단백질 ${fmtRange(after)}`,
          why: '던진 뒤 바로 단백질을 먹으면 팔이 빨리 회복돼요.',
        };
  }
  if (throwKind === 'eve') {
    return {
      headline: '저녁에 밥 · 면 · 고구마 한 가지 더',
      why: '내일 등판이라 오늘 저녁 탄수화물이 내일 힘이 돼요.',
    };
  }
  const strength = training.find((t) => t.kind === 'strength' || t.kind === 'power');
  if (strength) {
    return {
      headline: `운동 뒤 1시간 안에 단백질 ${fmtRange(after)} · 달걀 2개 + 우유`,
      why:
        strength.kind === 'power'
          ? '파워 운동 뒤 단백질이 근육을 지켜요.'
          : '웨이트 뒤 단백질이 근육을 키워요.',
    };
  }
  const aerobic = training.find((t) => t.kind === 'aerobic');
  if (aerobic && aerobic.minutes >= 45) {
    return {
      headline: '운동 뒤 바나나 · 주스로 탄수화물 보충',
      why: '유산소를 오래 하면 탄수화물이 먼저 비어요.',
    };
  }
  const skipped = checkin?.meals.skipped ?? [];
  if (skipped.includes('breakfast') && hour < 11) {
    return {
      headline: '지금 우유 한 컵 + 바나나 · 점심을 든든히',
      why: '아침을 걸렀으면 점심 전에 조금이라도 채우는 게 좋아요.',
    };
  }
  if (more && more.protein >= 20) {
    return {
      headline: `오늘 단백질 ${more.protein}g 더 · 닭가슴살 한 조각 또는 달걀 2개`,
      why:
        more.basis === 'logged'
          ? '적은 것으로 보면 단백질이 아직 모자라요.'
          : '끼니가 부족했다고 하셔서 어림한 양이에요.',
    };
  }
  if (more && more.carbs >= 80) {
    return {
      headline: `오늘 탄수화물 ${more.carbs}g 더 · 밥 한 공기쯤`,
      why:
        more.basis === 'logged'
          ? '적은 것으로 보면 탄수화물이 아직 모자라요.'
          : '끼니가 부족했다고 하셔서 어림한 양이에요.',
    };
  }
  if (!minor && more && more.basis === 'logged' && more.carbs <= -80) {
    return {
      headline: '오늘은 충분히 먹었어요 · 저녁은 가볍게',
      why: '목표보다 많이 먹었어요.',
    };
  }
  if (body.goal === 'gain') {
    return {
      headline: '끼니마다 밥 반 공기 더 · 자기 전 우유',
      why: '증량 중이라 끼니 사이를 채우는 게 핵심이에요.',
    };
  }
  return {
    headline: '끼니마다 단백질 한 가지 · 밥은 평소대로',
    why: '오늘은 특별히 더할 게 없어요. 평소대로 챙기면 돼요.',
  };
}

/**
 * 균형 점수 0~100. 자료가 있는 부분만 센다(없는 부분은 빼고 평균) — 기록 없이 체크인만 한 날도 점수가 나온다.
 * 아무 자료도 없으면 null.
 */
function scoreOf(input: AdviceInput): { score: number | null; parts: Advice['parts'] } {
  const parts: Advice['parts'] = [];
  const t = input.target;
  const closeness = (got: number, want: number) => {
    if (want <= 0) return 100;
    const r = got / want;
    /* 85~115% 가 만점, 그 밖은 10% 마다 20점씩 */
    const off = r < 0.85 ? 0.85 - r : r > 1.15 ? r - 1.15 : 0;
    return Math.max(0, Math.round(100 - off * 200));
  };
  if (input.eaten) {
    parts.push({
      key: 'kcal',
      label: '열량',
      score: closeness(input.eaten.kcal, t.kcal),
      note: `${Math.round(input.eaten.kcal)} / ${t.kcal}kcal`,
    });
    parts.push({
      key: 'protein',
      label: '단백질',
      score: closeness(input.eaten.protein, t.protein),
      note: `${Math.round(input.eaten.protein)} / ${t.protein}g`,
    });
    parts.push({
      key: 'carbs',
      label: '탄수화물',
      score: closeness(input.eaten.carbs, t.carbs),
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
    const score = Math.max(0, base - meals.skipped.length * 20);
    const note =
      meals.skipped.length > 0
        ? `${meals.skipped.length}끼 걸렀어요`
        : (meals.amount ?? '적음');
    parts.push({ key: 'meals', label: '끼니', score, note });
  }
  if (parts.length === 0) return { score: null, parts };
  const score = Math.round(parts.reduce((a, p) => a + p.score, 0) / parts.length);
  return { score, parts };
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
    input.checkin?.meals.amount === '부족';
  return { headline, why, range, more, score, parts, highlight };
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
