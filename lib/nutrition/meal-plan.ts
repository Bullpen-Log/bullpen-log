import { basicFood } from '@/lib/nutrition/foods';
import {
  avoidsOf,
  MEAL_TEMPLATES,
  SUBSTITUTES,
  SUPPLEMENTS,
} from '@/lib/nutrition/meal-templates';
import type {
  MealTemplate,
  Place,
  Role,
  Slot,
  Tag,
} from '@/lib/nutrition/meal-templates';
import type { AgeBand } from '@/lib/nutrition/age';
import type { DietPrefs, MealPattern } from '@/lib/nutrition/diet-prefs';
import { AVOIDS } from '@/lib/nutrition/diet-prefs';
import {
  AMOUNT_MAX,
  isMealKey,
  mealLabel,
  scaleMacros,
  sumMacros,
  type EntrySource,
  type Food,
  type GoalKey,
  type Macros,
  type MealKey,
  ENTRY_SOURCES,
} from '@/lib/nutrition/meta';

/**
 * 오늘에 맞춘 식단 짜기 — 순수 계산(AI 없음, 사용자 결정 2026-10-01).
 *
 * 읽는 것: 오늘 목표(kcal · 단백질 — 운동한 만큼 이미 더해져 있다), 목표(증량 · 유지 · 감량), 나이 칸, 식단 취향(시즌 단계 ·
 * 스타일 · 끼니 구성 · 못 먹는 것 · 보충식품), 그날 환경(훈련 장소 · 더운 날 야외), 체크인 · 투구 기록의 신호(던지는 일정 · 식욕 ·
 * 근육통), 이미 먹은 끼니.
 *
 *   1. 끼니 칸   끼니 구성대로(세 끼 · +간식 …). 이미 먹은 끼니는 짜지 않고, 남은 양을 남은 끼니에 나눈다.
 *               던지는 날은 던지기 전 끼니(점심)에, 등판 전날은 저녁에 몫을 조금 더.
 *   2. 틀 고르기 식단 틀(meal-templates.ts) 가운데 그 끼니 · 장소에 맞고 못 먹는 것이 없는(바꿔 넣을 수 있는) 것에 점수를 매겨
 *               위에서 몇 개 중 하나를 고른다. 날짜 · 사람 · '다른 식단으로' 횟수로 정해서, 같은 날 다시 열면 같은 식단이고
 *               다른 날은 다르다. 하루 안에서 같은 주재료를 되풀이하지 않는다.
 *   3. 양 맞추기 단백질 몫은 단백질 재료로, kcal 몫은 밥 · 면 같은 탄수화물로 맞춘다(0.25 · 0.5 · 1 단위, 너무 많거나 적지 않게).
 *   4. 하루 맞추기 합이 목표의 ±8% 밖이면 탄수화물을 늘리고 줄이고, 단백질이 9할 밑이면 간식에 단백질 음식을 더한다.
 *   5. 까닭     왜 이렇게 짰는지 몇 줄(해요체).
 */

export const PLAN_PLACES = [
  { key: 'home', label: '집' },
  { key: 'gym', label: '헬스장' },
  { key: 'team', label: '팀 · 학교' },
  { key: 'out', label: '밖 · 이동 중' },
] as const satisfies readonly { key: Place; label: string }[];

export function isPlace(v: unknown): v is Place {
  return typeof v === 'string' && PLAN_PLACES.some((p) => p.key === v);
}

/** 던지는 날의 종류 — 영양 가이드(guide.ts)와 같은 말: 등판 전날 · 던지는 날 · 던진 뒤 */
export type ThrowKind = 'eve' | 'today' | 'after' | null;

/** 식욕이 이 밑이면 '입맛 없는 날'(guide.ts 와 같은 기준), 근육통이 이 위면 '많이'(lib/checkin.ts HIGH_SORENESS) */
const LOW_APPETITE = 2;
const HIGH_SORENESS = 4;

export type PlanInput = {
  date: string;
  /** 사람마다 다른 식단이 나오게 — 사용자 열쇠 */
  seed: string;
  /** '다른 식단으로'를 누른 횟수 */
  variant: number;
  /** 오늘 목표(운동 몫 포함) */
  targets: { kcal: number; protein: number };
  goal: GoalKey;
  ageBand: AgeBand;
  prefs: DietPrefs;
  place: Place;
  hot: boolean;
  throwKind: ThrowKind;
  appetite: number | null;
  soreness: number | null;
  /** 이미 먹은 것(끼니별 합) — 그 끼니는 짜지 않는다 */
  eaten: { meal: MealKey; kcal: number; protein: number }[];
};

/** 계획 한 줄 — 먹었어요를 누르면 이 값 그대로 MealEntry 가 된다 */
export type PlanItem = {
  key: string;
  meal: MealKey;
  /** 어디서 온 음식인가 — 짠 것은 늘 기본 목록, 사용자가 바꿔 넣으면 식약처 · 내 음식 · 직접 입력일 수 있다 */
  source: EntrySource;
  /** 원래 음식의 열쇠. 직접 입력으로 바꿔 넣었으면 빈 글 */
  sourceId: string;
  name: string;
  servingLabel: string;
  servingGrams: number | null;
  /** 1인분 값 */
  kcal: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  amount: number;
  done: boolean;
};

export type PlanMeal = { meal: MealKey; title: string; template: string };

export type MealPlanResult = {
  items: PlanItem[];
  meals: PlanMeal[];
  reasons: string[];
  /** 이미 먹어서 짜지 않은 끼니 */
  skipped: MealKey[];
  /** 짠 끼니들이 맞추려던 몫(남은 목표) */
  target: { kcal: number; protein: number };
};

/* ─────────────────────────── 끼니 칸 ─────────────────────────── */

/** 끼니 구성 → 칸과 kcal 몫(합 1). 간식 둘은 같은 '간식' 끼니에 둘 */
const PATTERN_SHARES: Record<MealPattern, [Slot, number][]> = {
  '3': [
    ['breakfast', 0.3],
    ['lunch', 0.35],
    ['dinner', 0.35],
  ],
  '3+1': [
    ['breakfast', 0.25],
    ['lunch', 0.3],
    ['dinner', 0.3],
    ['snack', 0.15],
  ],
  '3+2': [
    ['breakfast', 0.24],
    ['lunch', 0.27],
    ['dinner', 0.27],
    ['snack', 0.11],
    ['snack', 0.11],
  ],
  '2+1': [
    ['lunch', 0.4],
    ['dinner', 0.4],
    ['snack', 0.2],
  ],
};

function slotShares(input: PlanInput): [Slot, number][] {
  let shares = PATTERN_SHARES[input.prefs.mealPattern].map(
    ([s, v]) => [s, v] as [Slot, number]
  );
  /* 입맛 없는 날 — 간식이 없는 구성이면 하나 더해 양을 나눈다 */
  if (lowAppetite(input) && !shares.some(([s]) => s === 'snack')) {
    shares = shares.map(([s, v]) => [s, v * 0.87]);
    shares.push(['snack', 0.13]);
  }
  const bump = (slot: Slot, by: number) => {
    const others = shares.filter(([s]) => s !== slot && s !== 'snack');
    if (!shares.some(([s]) => s === slot) || others.length === 0) return;
    shares = shares.map(([s, v]) =>
      s === slot
        ? [s, v + by]
        : others.some(([o]) => o === s)
          ? [s, v - by / others.length]
          : [s, v]
    );
  };
  if (input.throwKind === 'today') bump('lunch', 0.04);
  if (input.throwKind === 'eve') bump('dinner', 0.04);
  return shares;
}

const lowAppetite = (i: PlanInput) => i.appetite !== null && i.appetite <= LOW_APPETITE;
const highSoreness = (i: PlanInput) =>
  i.soreness !== null && i.soreness >= HIGH_SORENESS;
const minorBand = (i: PlanInput) => i.ageBand !== 'adult';

/* ─────────────────────────── 틀 고르기 ─────────────────────────── */

type Prepared = {
  template: MealTemplate;
  items: { food: Food; amount: number; role: Role }[];
};

function blocked(foodId: string, input: PlanInput) {
  if (SUPPLEMENTS.has(foodId) && (!input.prefs.supplements || minorBand(input)))
    return true;
  return avoidsOf(foodId).some((a) => input.prefs.avoid.includes(a));
}

/** 못 먹는 것 · 보충식품을 바꿔 넣은 틀. 바꿀 수 없는 주재료가 있으면 null */
function prepare(template: MealTemplate, input: PlanInput): Prepared | null {
  const items: Prepared['items'] = [];
  for (const it of template.items) {
    if (!blocked(it.food.id!, input)) {
      items.push({ ...it });
      continue;
    }
    const subId = (SUBSTITUTES[it.food.id!] ?? []).find(
      (s) => basicFood(s) && !blocked(s, input)
    );
    const sub = subId ? basicFood(subId) : null;
    if (sub) {
      /* 같은 역할의 몫이 비슷하게 — 단백질 재료는 단백질로, 그 밖은 kcal 로 양을 맞춘다 */
      const by =
        it.role === 'protein'
          ? (it.food.protein ?? 0) / Math.max(1, sub.protein ?? 0)
          : it.food.kcal / Math.max(1, sub.kcal);
      items.push({
        food: sub,
        amount: it.role === 'side' ? 1 : it.amount * by,
        role: it.role,
      });
    } else if (it.role !== 'side') {
      return null;
    }
  }
  /* 바꿔 넣다 같은 음식이 둘이 되면 하나로 */
  const merged: Prepared['items'] = [];
  for (const it of items) {
    const same = merged.find((m) => m.food.id === it.food.id);
    if (same) same.amount += it.amount;
    else merged.push(it);
  }
  return merged.length > 0 ? { template, items: merged } : null;
}

/** 이 끼니에 무엇을 바라나 — 꼬리표마다 더하는 점수 */
function wants(
  slot: Slot,
  input: PlanInput,
  snackIndex: number
): Partial<Record<Tag, number>> {
  const w: Partial<Record<Tag, number>> = {};
  const add = (tag: Tag, n: number) => (w[tag] = (w[tag] ?? 0) + n);
  if (input.goal === 'gain') {
    add('dense', 2);
    add('lean', -1);
  }
  if (input.goal === 'lose') {
    add('lean', 2);
    add('dense', -2);
  }
  switch (input.prefs.seasonPhase) {
    case 'off':
      if (input.goal === 'gain') add('dense', 1);
      break;
    case 'pre':
      add('pre', 1);
      break;
    case 'rehab':
      add('lean', 2);
      add('dense', -1);
      break;
  }
  if (input.throwKind === 'today') {
    if (slot === 'lunch') add('pre', 5);
    if (slot === 'breakfast') add('pre', 1);
    if (slot === 'snack') add('pre', 2);
    if (slot === 'dinner') add('rec', 3);
  }
  if (input.throwKind === 'eve' && slot === 'dinner') add('pre', 3);
  if (input.throwKind === 'after') {
    if (slot === 'dinner') add('rec', 4);
    if (slot === 'snack') add('rec', 3);
  }
  if (input.hot) add('heat', slot === 'lunch' || slot === 'snack' ? 3 : 2);
  if (lowAppetite(input)) {
    add('light', 3);
    add('dense', -1);
  }
  if (highSoreness(input)) {
    if (slot === 'snack') add('bed', 3);
    if (slot === 'dinner') add('rec', 2);
  }
  /* 둘째 간식은 저녁 뒤라 자기 전 것으로 */
  if (slot === 'snack' && snackIndex > 0) add('bed', 1);
  return w;
}

/** 이 끼니를 그날 장소에서 먹나 — 점심 · 간식은 그날 훈련 장소, 아침 · 저녁은 집(밖에서 하루를 보내면 저녁도 밖) */
function placeFor(slot: Slot, input: PlanInput): Place {
  if (slot === 'lunch' || slot === 'snack') return input.place;
  if (slot === 'dinner' && input.place === 'out') return 'out';
  return 'home';
}

function styleScore(t: MealTemplate, input: PlanInput) {
  switch (input.prefs.dietStyle) {
    case 'korean':
      return t.styles.includes('korean') ? 3 : 0;
    case 'simple':
      return t.styles.includes('simple') ? 3 : t.styles.includes('korean') ? 0.5 : 0;
    default:
      /* 골고루 — 한식 · 양식 · 간편식이 고루 나오게 같은 점수(시즌 중엔 익숙한 한식에 조금 더) */
      return (
        1 + (input.prefs.seasonPhase === 'in' && t.styles.includes('korean') ? 0.5 : 0)
      );
  }
}

/** 주재료(단백질 · 한 그릇) — 하루 안에서 되풀이하지 않으려고 */
const mainsOf = (p: Prepared) =>
  p.items
    .filter((i) => i.role === 'protein' || i.role === 'dish')
    .map((i) => i.food.id!);

/* FNV-1a — 같은 글이면 늘 같은 0~1 수 */
function unit(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

const TOP_K = 6;

/**
 * 틀의 크기가 이 끼니 몫과 맞나 — 처음 양으로 셈한 kcal · 단백질이 몫에서 멀수록 점수를 뺀다. 양을 늘리고 줄여 맞추긴 하지만,
 * 어린이 간식에 닭가슴살 팩이나 1,600kcal 하루에 돼지국밥이 뽑히면 맞추다 끝내 넘친다. 단백질은 넘칠 때만 뺀다(모자라면 더해 채운다).
 */
function sizePenalty(p: Prepared, kcal: number, protein: number) {
  const est = sumMacros(p.items.map((i) => scaleMacros(i.food, i.amount)));
  const kcalOff = Math.abs(Math.log(Math.max(1, est.kcal) / Math.max(1, kcal)));
  const proteinOver = Math.log(Math.max(1, est.protein) / Math.max(1, protein));
  return 3 * Math.max(0, kcalOff - 0.3) + 2 * Math.max(0, proteinOver - 0.4);
}

function pickTemplate(
  slot: Slot,
  input: PlanInput,
  used: { templates: Set<string>; mains: Set<string> },
  snackIndex: number,
  /** 이 끼니의 몫 */
  aim: { kcal: number; protein: number },
  /** 같은 끼니에 이미 담은 음식(간식 둘) — 겹치는 틀은 안 고른다 */
  taken: Set<string>
): Prepared | null {
  const want = wants(slot, input, snackIndex);
  const place = placeFor(slot, input);
  const pool = MEAL_TEMPLATES.filter(
    (t) => t.slots.includes(slot) && !used.templates.has(t.key)
  )
    .map((t) => prepare(t, input))
    .filter((p): p is Prepared => p !== null)
    .filter((p) => !p.items.some((i) => taken.has(i.food.id!)));
  /* 그 장소에서 먹을 수 있는 것 — 없으면(못 먹는 것이 많아서) 장소를 풀어 준다 */
  const atPlace = pool.filter((p) => p.template.places.includes(place));
  const choices = atPlace.length > 0 ? atPlace : pool;
  if (choices.length === 0) return null;

  const scored = choices
    .map((p) => {
      let score = 1 + styleScore(p.template, input);
      for (const tag of p.template.tags) score += want[tag] ?? 0;
      if (mainsOf(p).some((m) => used.mains.has(m))) score -= 3;
      score -= sizePenalty(p, aim.kcal, aim.protein);
      return { p, score };
    })
    .sort(
      (a, b) => b.score - a.score || a.p.template.key.localeCompare(b.p.template.key)
    )
    .slice(0, TOP_K);
  const floor = Math.min(...scored.map((s) => s.score));
  const weights = scored.map((s) => s.score - floor + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r =
    unit(`${input.seed}|${input.date}|${input.variant}|${slot}|${snackIndex}`) * total;
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r < 0) return scored[i].p;
  }
  return scored[scored.length - 1].p;
}

/* ─────────────────────────── 양 맞추기 ─────────────────────────── */

/** 낱개로 세는 음식(달걀 · 팩 · 병)은 1, 과일 · 고구마 · 우유 같은 것은 ½, 나머지는 ¼ 단위 */
const STEP_ONE = new Set([
  'egg',
  'egg-fried',
  'egg-white',
  'cheese-slice',
  'white-bread',
  'protein-bar',
  'triangle-gimbap',
  'sandwich',
  'gimbap',
  'tuna-gimbap',
  'soy-milk',
  'choco-milk',
  'banana-milk',
  'sports-drink',
  'chicken-breast-pack',
  'tuna-can',
  'kiwi',
  'mandarin',
]);
const STEP_HALF = new Set([
  'banana',
  'apple',
  'orange',
  'sweet-potato',
  'potato',
  'corn',
  'bagel',
  'garaetteok',
  'protein-shake',
  'milk',
  'milk-lowfat',
  'yogurt',
  'greek-yogurt',
  'dumplings',
  'tofu',
  'oatmeal',
]);
export function amountStep(foodId: string) {
  return STEP_ONE.has(foodId) ? 1 : STEP_HALF.has(foodId) ? 0.5 : 0.25;
}

/** 역할마다 처음 양의 몇 배까지 */
const BOUNDS: Record<Role, [number, number]> = {
  carb: [0.5, 3],
  protein: [0.5, 3],
  dish: [0.5, 1.5],
  side: [1, 1],
};

type Line = { food: Food; amount: number; role: Role; base: number };

/*
 * 한 끼에 먹을 만한 양의 위 — 몫을 맞추려고 양을 늘리다 '달걀 5개 · 두유 6팩'이 되지 않게. 여기 없는 것은 역할의 배수(BOUNDS)만 본다.
 * 모자란 몫은 다른 음식을 더해 채운다(하루 맞추기).
 */
/* prettier-ignore */
export const MAX_PER_MEAL: Record<string, number> = {
  egg: 3, 'egg-fried': 3, 'egg-white': 4, 'egg-roll': 2,
  milk: 2, 'milk-lowfat': 2, 'soy-milk': 2, 'choco-milk': 1, 'banana-milk': 1, yogurt: 2, 'greek-yogurt': 2,
  'cheese-slice': 2, 'protein-shake': 1.5, 'protein-bar': 1,
  'triangle-gimbap': 2, gimbap: 1.5, 'tuna-gimbap': 1.5, sandwich: 1.5,
  oatmeal: 2, 'white-bread': 3, bagel: 1.5,
  banana: 2, apple: 1, orange: 1, kiwi: 2, mandarin: 3, watermelon: 1.5, blueberry: 1.5, strawberry: 1.5, grape: 1.5,
  'sweet-potato': 2, potato: 2, corn: 1.5, garaetteok: 2,
  'mixed-nuts': 1, almond: 1, 'peanut-butter': 2, honey: 1, 'sports-drink': 1, 'orange-juice': 1,
  rice: 2, 'brown-rice': 2, 'multigrain-rice': 2,
  'chicken-breast': 2, 'chicken-breast-pack': 2, 'chicken-thigh': 2, 'beef-lean': 2, 'beef-sirloin': 1.75,
  'pork-tenderloin': 2, 'pork-neck': 1, salmon: 2, mackerel: 1.5, 'tuna-can': 1.5, tofu: 2, 'braised-tofu': 2,
  bulgogi: 1.75, jeyuk: 1.5, dakbokkeumtang: 1.5,
};

function limits(line: Line) {
  const step = amountStep(line.food.id!);
  const [lo, hi] = BOUNDS[line.role];
  const cap = MAX_PER_MEAL[line.food.id!] ?? Infinity;
  const min = Math.ceil(Math.max(step, Math.min(line.base * lo, cap)) / step) * step;
  const max = Math.max(
    min,
    Math.floor(Math.min(AMOUNT_MAX, cap, Math.max(min, line.base * hi)) / step) * step
  );
  return { step, min, max };
}

function clampAmount(line: Line, amount: number) {
  const { step, min, max } = limits(line);
  return Math.min(max, Math.max(min, Math.round(amount / step) * step));
}

const lineMacros = (l: Line) => scaleMacros(l.food, l.amount);
const totalOf = (lines: Line[]) => sumMacros(lines.map(lineMacros));

/** 한 끼를 몫에 맞춘다 — 단백질은 단백질 재료로, kcal 는 탄수화물(없으면 한 그릇 요리)로 */
function fitMeal(lines: Line[], kcal: number, protein: number) {
  const prot = lines
    .filter((l) => l.role === 'protein' && (l.food.protein ?? 0) > 0)
    .sort((a, b) => (b.food.protein ?? 0) - (a.food.protein ?? 0))[0];
  if (prot) {
    const short = protein - totalOf(lines).protein;
    prot.amount = clampAmount(prot, prot.amount + short / (prot.food.protein ?? 1));
  }
  const carb =
    lines.find((l) => l.role === 'carb' && l.food.kcal > 0) ??
    lines.find((l) => l.role === 'dish' && l.food.kcal > 0);
  if (carb) {
    const gap = kcal - totalOf(lines).kcal;
    carb.amount = clampAmount(carb, carb.amount + gap / carb.food.kcal);
  }
}

/** 하루 단백질이 모자랄 때 간식(없으면 저녁)에 더하는 것 — 앞에서부터 쓸 수 있는 것 */
const PROTEIN_BOOST = [
  'greek-yogurt',
  'milk',
  'egg',
  'tofu',
  'chicken-breast-pack',
  'soy-milk',
  'protein-shake',
];
/** 하루 kcal 이 모자랄 때(탄수화물을 더 못 늘릴 때) */
const KCAL_BOOST = ['banana', 'sweet-potato', 'rice', 'garaetteok', 'oatmeal'];

/* ─────────────────────────── 짜기 ─────────────────────────── */

const PRE_MEAL: Partial<Record<NonNullable<ThrowKind>, Slot>> = {
  today: 'lunch',
  eve: 'dinner',
};

export function buildMealPlan(input: PlanInput): MealPlanResult {
  const eatenMeals = new Set(input.eaten.filter((e) => e.kcal > 0).map((e) => e.meal));
  const eatenTotal = input.eaten.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein }),
    { kcal: 0, protein: 0 }
  );
  const left = {
    kcal: Math.max(0, input.targets.kcal - eatenTotal.kcal),
    protein: Math.max(0, input.targets.protein - eatenTotal.protein),
  };

  const shares = slotShares(input).filter(([slot]) => !eatenMeals.has(slot));
  const skipped = [...eatenMeals].filter(isMealKey);
  const reasons: string[] = [];
  if (skipped.length > 0) {
    reasons.push(
      `이미 먹은 ${skipped.map(mealLabel).join(' · ')}은 빼고, 남은 ${Math.round(left.kcal).toLocaleString('ko-KR')}kcal 을 나눠 짰어요.`
    );
  }
  if (shares.length === 0 || left.kcal < 150) {
    return {
      items: [],
      meals: [],
      reasons: [...reasons, '오늘 목표를 거의 채웠어요 — 더 짤 끼니가 없어요.'],
      skipped,
      target: left,
    };
  }

  const shareSum = shares.reduce((a, [, v]) => a + v, 0);
  /* 단백질은 끼니마다 고르게(간식은 끼니의 반) — 몰아 먹는 것보다 근육이 잘 쓴다(meal-protein.ts) */
  const pWeight = (slot: Slot) => (slot === 'snack' ? 0.5 : 1);
  const pSum = shares.reduce((a, [slot]) => a + pWeight(slot), 0);

  const used = { templates: new Set<string>(), mains: new Set<string>() };
  const meals: {
    slot: Slot;
    template: MealTemplate;
    lines: Line[];
    kcal: number;
    protein: number;
  }[] = [];
  let snackIndex = 0;
  for (const [slot, share] of shares) {
    const kcal = (left.kcal * share) / shareSum;
    const protein = (left.protein * pWeight(slot)) / pSum;
    const taken = new Set(
      meals
        .filter((m) => m.slot === slot)
        .flatMap((m) => m.lines.map((l) => l.food.id!))
    );
    const picked = pickTemplate(
      slot,
      input,
      used,
      slot === 'snack' ? snackIndex : 0,
      { kcal, protein },
      taken
    );
    if (slot === 'snack') snackIndex++;
    if (!picked) continue;
    used.templates.add(picked.template.key);
    for (const m of mainsOf(picked)) used.mains.add(m);
    const lines: Line[] = picked.items.map((i) => ({ ...i, base: i.amount }));
    for (const l of lines) l.amount = clampAmount(l, l.amount);
    fitMeal(lines, kcal, protein);
    meals.push({ slot, template: picked.template, lines, kcal, protein });
  }

  /* ── 하루 맞추기 — 단백질은 9할~1.3배, kcal 는 ±8% 안으로. 한 번에 한 걸음씩 ── */
  const all = () => meals.flatMap((m) => m.lines);
  const boostMeal = () =>
    meals.find((m) => m.slot === 'snack') ??
    meals.find((m) => m.slot === 'dinner') ??
    meals[meals.length - 1];
  /** 한 걸음 늘리거나 줄인다 — 상한 · 하한에 막히면 false */
  const nudge = (line: Line, dir: 1 | -1) => {
    const next = clampAmount(line, line.amount + dir * limits(line).step);
    if (next === line.amount) return false;
    line.amount = next;
    return true;
  };
  for (let round = 0; round < 40 && meals.length > 0; round++) {
    const t = totalOf(all());
    if (t.protein < left.protein * 0.9) {
      /* 이미 있는 단백질 재료를 늘리고, 다 막혔으면 간식(없으면 저녁)에 단백질 음식을 하나 더한다 */
      const grow = meals
        .flatMap((m) => m.lines)
        .filter((l) => l.role === 'protein')
        .sort((x, y) => (y.food.protein ?? 0) - (x.food.protein ?? 0))
        .find((l) => nudge(l, 1));
      if (grow) continue;
      const target = boostMeal();
      const id = PROTEIN_BOOST.find(
        (x) => basicFood(x) && !blocked(x, input) && !all().some((l) => l.food.id === x)
      );
      if (id) {
        target.lines.push({
          food: basicFood(id)!,
          amount: 1,
          role: 'protein',
          base: 1,
        });
        continue;
      }
    } else if (t.protein > left.protein * 1.3) {
      const shrink = all()
        .filter((l) => l.role === 'protein')
        .sort(
          (x, y) =>
            scaleMacros(y.food, y.amount).protein -
            scaleMacros(x.food, x.amount).protein
        )
        .find((l) => nudge(l, -1));
      if (shrink) continue;
    }
    const gap = left.kcal - t.kcal;
    if (Math.abs(gap) <= left.kcal * 0.08) break;
    /* 몫에서 가장 멀어진 끼니의 탄수화물(없으면 한 그릇 요리)부터 한 걸음 */
    const moved = meals
      .map((m) => ({ m, gap: m.kcal - totalOf(m.lines).kcal }))
      .sort((x, y) => (gap > 0 ? y.gap - x.gap : x.gap - y.gap))
      .some(({ m }) =>
        m.lines
          .filter((l) => l.role === 'carb' || l.role === 'dish')
          .some((l) => nudge(l, gap > 0 ? 1 : -1))
      );
    if (moved) continue;
    if (gap > 0) {
      const target = meals
        .map((m) => ({ m, short: m.kcal - totalOf(m.lines).kcal }))
        .sort((x, y) => y.short - x.short)[0].m;
      const id = KCAL_BOOST.find(
        (x) =>
          basicFood(x) &&
          !blocked(x, input) &&
          /* 간식 둘은 같은 '간식' 끼니 — 둘 다 보고 겹치지 않게 */
          !meals.some(
            (m) => m.slot === target.slot && m.lines.some((l) => l.food.id === x)
          )
      );
      if (id) {
        target.lines.push({ food: basicFood(id)!, amount: 1, role: 'carb', base: 1 });
        continue;
      }
    }
    break;
  }

  /* ── 결과 ── */
  const items: PlanItem[] = [];
  for (const m of meals) {
    m.lines.forEach((l, i) => {
      if (!(l.amount > 0)) return;
      items.push({
        key: `${m.slot}-${items.length}-${i}-${l.food.id}`,
        meal: m.slot,
        source: 'basic',
        sourceId: l.food.id!,
        name: l.food.name,
        servingLabel: l.food.servingLabel,
        servingGrams: l.food.servingGrams,
        kcal: l.food.kcal,
        carbs: l.food.carbs,
        protein: l.food.protein,
        fat: l.food.fat,
        amount: Math.round(l.amount * 100) / 100,
        done: false,
      });
    });
  }

  reasons.push(
    ...whyLines(
      input,
      meals.map((m) => m.slot)
    )
  );
  return {
    items,
    meals: meals.map((m) => ({
      meal: m.slot,
      title: m.template.name,
      template: m.template.key,
    })),
    reasons: reasons.slice(0, 4),
    skipped,
    target: { kcal: Math.round(left.kcal), protein: Math.round(left.protein) },
  };
}

/** 왜 이렇게 짰나 — 앞에 둔 것이 더 중요한 까닭(화면은 넷까지) */
function whyLines(input: PlanInput, slots: Slot[]): string[] {
  const lines: string[] = [];
  const has = (s: Slot) => slots.includes(s);
  const pre = input.throwKind ? PRE_MEAL[input.throwKind] : undefined;
  if (input.throwKind === 'today' && pre && has(pre)) {
    lines.push(
      '오늘 던지는 날이라 점심을 탄수화물 위주로 가볍게, 저녁은 회복식으로 짰어요.'
    );
  } else if (input.throwKind === 'eve' && has('dinner')) {
    lines.push('내일 등판이라 저녁에 밥 · 면으로 탄수화물을 넉넉히 넣었어요.');
  } else if (input.throwKind === 'after' && (has('dinner') || has('snack'))) {
    lines.push('던진 뒤라 저녁 · 간식에 단백질과 탄수화물을 같이 넣었어요.');
  }
  if (lowAppetite(input)) {
    lines.push('입맛이 없는 날이라 부드러운 것 위주로, 간식을 더해 양을 나눴어요.');
  }
  if (highSoreness(input) && has('snack')) {
    lines.push('근육통이 많은 날이라 간식에 유제품 단백질을 한 번 더 넣었어요.');
  }
  if (input.hot)
    lines.push('더운 날 야외라 국 · 과일 · 음료로 수분과 나트륨을 챙겼어요.');
  if (input.place === 'gym')
    lines.push('헬스장에서 먹을 점심 · 간식은 바로 먹는 것으로 골랐어요.');
  if (input.place === 'team')
    lines.push('팀 · 학교에서 먹을 점심은 급식 · 도시락 모양으로 골랐어요.');
  if (input.place === 'out')
    lines.push('밖에서 먹을 끼니는 식당 · 편의점에서 고를 수 있는 것으로 골랐어요.');
  if (input.prefs.seasonPhase === 'rehab') {
    lines.push(
      '재활 중이라 단 것은 줄이고 살코기 · 채소 위주로, 단백질은 그대로 챙겼어요.'
    );
  } else if (input.goal === 'gain') {
    lines.push('증량 중이라 밥 · 고구마 · 유제품으로 열량을 채웠어요.');
  } else if (input.goal === 'lose') {
    lines.push('감량 중이라 살코기 · 채소 위주로 배부르게 짰어요.');
  }
  const avoid = input.prefs.avoid.flatMap((a) => {
    const label = AVOIDS.find((x) => x.key === a)?.label;
    return label ? [label] : [];
  });
  if (avoid.length > 0)
    lines.push(`${withTopic(avoid.join(' · '))} 빼고 다른 것으로 바꿔 짰어요.`);
  if (lines.length === 0) {
    lines.push('오늘 목표에 맞춰 끼니마다 단백질을 고르게, 밥 · 반찬은 골고루 짰어요.');
  }
  return lines;
}

/** '해산물은' · '돼지고기는' — 마지막 글자에 받침이 있으면 '은' */
function withTopic(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasFinal ? '은' : '는'}`;
}

/* ─────────────────────────── 저장한 계획 읽기 ─────────────────────────── */

export type PlanContext = {
  place: Place;
  hot: boolean;
  variant: number;
  reasons: string[];
  meals: PlanMeal[];
  target: { kcal: number; protein: number };
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const PLAN_SOURCES: EntrySource[] = ENTRY_SOURCES;

/** DB 의 items(Json)를 하나씩 다시 본다 — 틀린 줄은 버린다(손으로 고친 줄 하나가 화면을 넘어뜨리지 않게) */
export function parsePlanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const r of raw.slice(0, 80)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const kcal = num(o.kcal);
    const amount = num(o.amount);
    if (
      typeof o.key !== 'string' ||
      !isMealKey(o.meal) ||
      typeof o.sourceId !== 'string' ||
      typeof o.name !== 'string' ||
      kcal === null ||
      kcal < 0 ||
      amount === null ||
      amount <= 0
    ) {
      continue;
    }
    const macro = (v: unknown) => {
      const n = num(v);
      return n !== null && n >= 0 ? n : null;
    };
    out.push({
      key: o.key,
      meal: o.meal,
      /* 출처 칸이 생기기 전의 계획은 모두 기본 목록이었다 */
      source: PLAN_SOURCES.find((x) => x === o.source) ?? 'basic',
      sourceId: o.sourceId,
      name: o.name,
      servingLabel: typeof o.servingLabel === 'string' ? o.servingLabel : '1인분',
      servingGrams: macro(o.servingGrams),
      kcal,
      carbs: macro(o.carbs),
      protein: macro(o.protein),
      fat: macro(o.fat),
      amount: Math.min(AMOUNT_MAX, amount),
      done: o.done === true,
    });
  }
  return out;
}

export function parsePlanContext(raw: unknown): PlanContext {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const meals = Array.isArray(o.meals)
    ? o.meals.flatMap((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return isMealKey(x.meal) && typeof x.title === 'string'
          ? [
              {
                meal: x.meal,
                title: x.title,
                template: typeof x.template === 'string' ? x.template : '',
              },
            ]
          : [];
      })
    : [];
  const t = (o.target ?? {}) as Record<string, unknown>;
  return {
    place: isPlace(o.place) ? o.place : 'home',
    hot: o.hot === true,
    variant: num(o.variant) ?? 0,
    reasons: Array.isArray(o.reasons)
      ? o.reasons.filter((x): x is string => typeof x === 'string').slice(0, 6)
      : [],
    meals,
    target: { kcal: num(t.kcal) ?? 0, protein: num(t.protein) ?? 0 },
  };
}

/** 계획의 합(아직 안 먹은 줄만) */
export function planMacros(items: PlanItem[]): Macros {
  return sumMacros(items.filter((i) => !i.done).map((i) => scaleMacros(i, i.amount)));
}
