import { basicFood } from '@/lib/nutrition/foods';
import { avoidsOf } from '@/lib/nutrition/meal-templates';
import type { AgeBand } from '@/lib/nutrition/age';
import type { AvoidKey } from '@/lib/nutrition/diet-prefs';
import type { MealEntryView, MealKey } from '@/lib/nutrition/meta';

/**
 * 끼니별 단백질(영양 로드맵 5번).
 *
 * 하루 단백질을 다 채워도 한 끼에 몰아 먹으면 근육이 덜 쓴다 — 몸이 한 번에 근육으로 돌리는 양에
 * 한계가 있어서, 끼니마다 고르게 나눠 먹을 때 더 잘 쓰인다(국제스포츠영양학회 ISSN 2017 ·
 * Schoenfeld & Aragon 2018: 한 끼 체중 1kg 당 0.4g 쯤을 하루 네 번).
 *
 *   한 끼 목표   하루 단백질 목표 ÷ 4 를 5g 단위로, 20~40g 사이(어린이 15~30g).
 *               네 번 = 아침 · 점심 · 저녁 + 간식(회복식 · 쉐이크). 하루 목표가 1.6g/kg 이면
 *               딱 0.4g/kg 이다. 사용자가 정한 하루 목표를 따라가므로 두 숫자가 어긋나지 않는다.
 *   채웠다      목표의 8할 — 던진 날 회복식과 같은 기준(딱 맞춰 먹는 사람은 없다).
 *   간식        숫자만 보이고 견주지 않는다. 안 먹는 사람도 많고, 간식에 35g 을 권하면 잔소리다.
 *
 * 모자란 끼니에는 기본 음식으로 채우는 예시를 하나 붙인다(달걀 2개 · 우유 1컵처럼).
 */

/** 한 끼 단백질의 아래 · 위 — 어린이(만 12세 이하)는 몸이 작아 한 단계 낮게. 던진 날 회복식도 같은 범위다 */
export const MEAL_PROTEIN_RANGE: Record<AgeBand, [number, number]> = {
  child: [15, 30],
  teen: [20, 40],
  adult: [20, 40],
};
/** 하루 단백질을 나누는 횟수 — 세 끼 + 간식 */
export const MEAL_PROTEIN_SPLIT = 4;
/** 담은 단백질이 목표의 이만큼이면 채운 것으로 본다 */
export const MEAL_PROTEIN_DONE_RATIO = 0.8;

/** 견주는 끼니 — 간식은 숫자만 */
export const MAIN_MEALS: readonly MealKey[] = ['breakfast', 'lunch', 'dinner'];

const round5 = (n: number) => Math.round(n / 5) * 5;

/** 한 끼 단백질 목표(g) */
export function mealProteinGoal(dailyProtein: number, band: AgeBand) {
  const [lo, hi] = MEAL_PROTEIN_RANGE[band];
  return Math.min(hi, Math.max(lo, round5(dailyProtein / MEAL_PROTEIN_SPLIT)));
}

export type MealProtein = {
  /** 담은 단백질(g, 반올림) — 단백질을 모르는 음식은 0 으로 셌다 */
  protein: number;
  /** 단백질을 모르는 음식이 있다 — 실제로는 더 먹었다('+') */
  unknown: boolean;
  /** 한 끼 목표. 간식은 null */
  goal: number | null;
  /** 목표의 8할을 넘겼다 */
  done: boolean;
  /** 모자란 g(목표 − 담은 것). 채웠거나 · 간식이거나 · 비었거나 · 모르는 음식이 있으면 0 */
  short: number;
  /** 모자란 만큼을 채우는 예시 */
  tip: ProteinTip | null;
};

/**
 * 한 끼의 단백질. 화면에 보이는 값(반올림한 g)으로 견준다 — '28 / 35g'인데 아직이라고 하지 않게.
 *
 * 모르는 음식이 섞인 끼니는 모자란다고 하지 않는다. 그 음식에 단백질이 얼마나 들었는지 몰라서,
 * 실제로는 채웠을 수도 있다. 채운 것은 아는 값만으로 넘겼을 때만 말한다.
 */
export function mealProtein(
  meal: MealKey,
  entries: MealEntryView[],
  dailyProtein: number,
  band: AgeBand,
  avoid: readonly AvoidKey[] = []
): MealProtein {
  const mine = entries.filter((e) => e.meal === meal);
  const protein = Math.round(
    mine.reduce((sum, e) => sum + (e.protein ?? 0) * e.amount, 0)
  );
  const unknown = mine.some((e) => e.protein === null);
  const goal = MAIN_MEALS.includes(meal) ? mealProteinGoal(dailyProtein, band) : null;
  const done = goal !== null && protein >= goal * MEAL_PROTEIN_DONE_RATIO;
  const short =
    goal === null || done || unknown || mine.length === 0 ? 0 : goal - protein;
  return {
    protein,
    unknown,
    goal,
    done,
    short,
    tip: short > 0 ? proteinTip(short, avoid) : null,
  };
}

/* ─────────────────────────── 채우는 예시 ─────────────────────────── */

export type ProteinTip = {
  /** '달걀 2개 · 우유 1컵' */
  label: string;
  /** 그 예시의 단백질(g, 반올림) */
  protein: number;
  /** 모자란 만큼을 다 채운다 — 가장 큰 예시로도 모자라면 false */
  covers: boolean;
};

/*
 * 예시는 끼니에 바로 곁들일 수 있는 것만, 단백질이 적은 것부터. 모자란 양을 넘는 가장 작은 것을 고른다
 * — 조금 모자라는데 닭가슴살 두 팩을 권하지 않게. 단백질 값은 기본 음식 목록(foods.ts)에서 읽어,
 * 사용자가 그 음식을 담았을 때 늘어나는 숫자와 똑같다.
 */
const TIP_PLANS: { label: string; items: [id: string, count: number][] }[] = [
  { label: '달걀 1개', items: [['egg', 1]] },
  { label: '그릭요거트 100g', items: [['greek-yogurt', 1]] },
  { label: '달걀 2개', items: [['egg', 2]] },
  { label: '두부 반 모', items: [['tofu', 1]] },
  {
    label: '달걀 2개 · 우유 1컵',
    items: [
      ['egg', 2],
      ['milk', 1],
    ],
  },
  { label: '닭가슴살 1팩', items: [['chicken-breast-pack', 1]] },
  { label: '참치캔 1캔', items: [['tuna-can', 1]] },
  {
    label: '닭가슴살 1팩 · 달걀 1개',
    items: [
      ['chicken-breast-pack', 1],
      ['egg', 1],
    ],
  },
  {
    label: '닭가슴살 1팩 · 달걀 2개',
    items: [
      ['chicken-breast-pack', 1],
      ['egg', 2],
    ],
  },
];

/** 기본 음식 조합의 단백질(g) — 음식 목록(foods.ts)의 값 그대로 */
export function foodsProtein(items: readonly (readonly [id: string, count: number])[]) {
  return items.reduce(
    (sum, [id, count]) => sum + (basicFood(id)?.protein ?? 0) * count,
    0
  );
}

/** 이 조합에 못 먹는 것이 들었나 — 식단 짜기와 같은 꼬리표(meal-templates.ts avoidsOf) */
export function hasAvoided(
  items: readonly (readonly [id: string, count: number])[],
  avoid: readonly AvoidKey[]
) {
  return (
    avoid.length > 0 &&
    items.some(([id]) => avoidsOf(id).some((a) => avoid.includes(a)))
  );
}

const PLANS = TIP_PLANS.map((p) => ({
  label: p.label,
  items: p.items,
  protein: foodsProtein(p.items),
}))
  .filter((p) => p.protein > 0)
  .sort((a, b) => a.protein - b.protein);

/** 모자란 g 을 채우는 예시(못 먹는 것이 든 것은 뺀다). 모자란 것이 없으면 null */
export function proteinTip(
  short: number,
  avoid: readonly AvoidKey[] = []
): ProteinTip | null {
  const plans = PLANS.filter((p) => !hasAvoided(p.items, avoid));
  if (!(short > 0) || plans.length === 0) return null;
  const plan = plans.find((p) => p.protein >= short) ?? plans[plans.length - 1];
  return {
    label: plan.label,
    protein: Math.round(plan.protein),
    covers: plan.protein >= short,
  };
}

/* ─────────────────────────── 글 속 예시 음식 ─────────────────────────── */

/**
 * 조언 · 가이드 글 속 예시 음식 — 못 먹는 것(식단 취향)을 피해서. 2026-10-16 점검: 달걀 · 유제품을 뺀 사람(알레르기 포함)에게도
 * 홈 · 탭 · 순간 한 줄이 매일 '달걀 2개 + 우유'를 권했다(식단 짜기만 막고 있었다).
 *
 * 콩(두유 · 두부)은 막는 꼬리표가 없어 대신 쓰는 자리다. 삼각김밥은 참치마요 · 달걀이 흔해(꼬리표 해산물 · 달걀) 고구마로 바꾼다.
 * 아무것도 안 뺀 사람의 글은 예전과 한 글자도 같다.
 */
export function exampleWords(avoid: readonly AvoidKey[] = []) {
  const no = (k: AvoidKey) => avoid.includes(k);
  const dairy = no('dairy');
  const proteins = [
    !no('chicken') && '닭가슴살 한 조각',
    !no('egg') && '달걀 2개',
    !no('seafood') && '생선 한 토막',
    '두부 반 모',
  ].filter((w): w is string => typeof w === 'string');
  return {
    /** 마시는 것 한 컵 */
    milk: dairy ? '두유' : '우유',
    /** 배고플 때 하나 */
    cup: dairy ? '두유' : '요거트',
    /** 단단한 단백질 한 가지 */
    solid: no('egg') ? '두부 반 모' : '달걀 2개',
    /** 단백질 둘 중 하나 */
    proteinOr: proteins.slice(0, 2).join(' 또는 '),
    /** 자기 전 단백질 */
    late: dairy ? '자기 전 두유' : '자기 전 우유 · 요거트',
    /** 입맛 없는 날 잘 넘어가는 것 */
    soft: dairy ? '두유 · 바나나' : '우유 · 바나나 · 요거트',
    /** 들고 다니는 탄수화물 */
    grab: hasAvoided([['triangle-gimbap', 1]], avoid) ? '고구마' : '삼각김밥',
    /** 저녁 탄수화물 한 가지 */
    carbs: no('wheat') ? '밥 · 감자 · 고구마' : '밥 · 면 · 고구마',
    /** 던지기 1시간 전 가벼운 것 */
    light: no('wheat') ? '바나나나 가래떡' : '바나나나 식빵',
    /** 성장기 '평소 먹던 음식' */
    everyday: [dairy ? '두유' : '우유', no('egg') ? '두부' : '달걀', '고기', '밥'].join(
      ' · '
    ),
  };
}
