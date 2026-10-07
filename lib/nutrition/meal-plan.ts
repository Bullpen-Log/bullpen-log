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
 *               위에서 몇 개 중 하나를 고른다. 사람 · 끼니 · '다른 식단으로' 횟수로 정한 점을 날마다 황금비만큼 옮겨 고르고,
 *               그 주 월요일부터 이어 짜서 어제 · 그제 고른 틀은 피한다 — 같은 날 다시 열면 같은 식단이고, 이레 동안 한
 *               틀이 몰리지 않는다. 하루 안에서 같은 주재료를 되풀이하지 않는다.
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
  /**
   * 어제 · 그제 실제로 짠 식단의 틀 열쇠(저장된 MealPlan.context.meals[].template) — 0 이 어제. 없거나 null 인 날은 같은 조건의
   * 보통 날로 짜 본 것으로 대신한다. 어제 '다른 식단으로'를 눌렀거나 던지는 날 · 다른 장소였으면 짜 본 어제와 실제 어제가 달라서,
   * 실제 것을 넘기면 그런 날 다음에도 같은 틀이 이어지지 않는다.
   */
  recent?: (string[] | null)[];
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

/** 짤 끼니의 단백질이 kcal 에서 차지할 수 있는 몫의 위 */
const MAX_PROTEIN_SHARE = 0.35;

/** 몫이 이보다 작은 간식 칸은 빼고, 남은 kcal 이 이보다 작으면 한 끼로 모은다 */
const MIN_SNACK_KCAL = 120;
const NO_SNACK_KCAL = 600;
/** 몫이 이보다 작은 끼니는 간식 틀에서도 고른다 */
const SMALL_MEAL_KCAL = 400;
/** 먹은 뒤 끼니 몫이 이보다 작으면 간식을 뺀다 */
const MIN_MEAL_KCAL = 350;
const ONE_MEAL_KCAL = 550;

/**
 * 남은 몫이 작으면 칸을 줄인다 — 간식부터(뒤 간식부터) 빼고, 남은 kcal 이 한 끼 남짓이면 몫이 가장 큰 끼니(같으면 뒤 끼니)
 * 하나로. 아침 · 점심을 먹은 뒤 남은 250kcal 을 저녁 · 간식 둘에 나누면 칸마다 가장 작은 틀도 몫을 넘어 830kcal 이 됐다.
 * 먹은 뒤에는 끼니 몫이 작아도(아침을 크게 먹고 남은 687kcal 을 점심 · 저녁 · 간식에 나누면 끼니가 275kcal) 간식부터 뺀다.
 * 먹은 것이 없는 날은 끼니를 모으지 않는다(1,250kcal 하루의 아침 몫 300kcal 은 작아도 아침이다).
 */
function trimSlots(
  shares: [Slot, number][],
  kcal: number,
  afterEating: boolean
): [Slot, number][] & { trimmed?: 'snack' | 'one' } {
  const sumOf = (list: [Slot, number][]) => list.reduce((a, [, v]) => a + v, 0);
  let out = shares;
  let trimmed: 'snack' | 'one' | undefined;
  const small = (list: [Slot, number][], slot: Slot, min: number) =>
    list.some(([s, v]) => s === slot && (kcal * v) / sumOf(list) < min);
  const isMeal = ([s]: [Slot, number]) => s !== 'snack';
  /* 끼니가 남아 있으면 작은 간식을 뺀다. 간식만 남았으면 하나는 둔다 */
  while (
    out.filter(([s]) => s === 'snack').length > (out.some(isMeal) ? 0 : 1) &&
    (small(out, 'snack', MIN_SNACK_KCAL) ||
      kcal < NO_SNACK_KCAL ||
      (afterEating && out.some(([s]) => s !== 'snack' && small(out, s, MIN_MEAL_KCAL))))
  ) {
    const last = out.map(([s]) => s).lastIndexOf('snack');
    out = out.filter((_, i) => i !== last);
    trimmed = 'snack';
  }
  const meals = out.filter(isMeal);
  if (afterEating && meals.length > 1 && kcal < ONE_MEAL_KCAL) {
    const keep = meals.reduce((a, b) => (b[1] >= a[1] ? b : a));
    out = [keep];
    trimmed = 'one';
  }
  return Object.assign(out, { trimmed });
}

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

/**
 * 단백질 재료를 바꿔 넣을 때 1인분에 이만큼은 있어야 한다. 닭가슴살 샐러드(35g)를 그냥 샐러드(3g)로 바꾸면 단백질을 맞추려고
 * 샐러드를 스무 접시(3,000kcal)까지 늘렸다.
 */
const MIN_SUB_PROTEIN = 5;

/** 못 먹는 것 · 보충식품을 바꿔 넣은 틀. 바꿀 수 없는 주재료가 있으면 null */
function prepare(template: MealTemplate, input: PlanInput): Prepared | null {
  const items: Prepared['items'] = [];
  for (const it of template.items) {
    if (!blocked(it.food.id!, input)) {
      items.push({ ...it });
      continue;
    }
    const subId = (SUBSTITUTES[it.food.id!] ?? []).find((s) => {
      const food = basicFood(s);
      return (
        food &&
        !blocked(s, input) &&
        (it.role !== 'protein' || (food.protein ?? 0) >= MIN_SUB_PROTEIN)
      );
    });
    const sub = subId ? basicFood(subId) : null;
    if (sub) {
      /* 같은 역할의 몫이 비슷하게 — 단백질 재료는 단백질로, 그 밖은 kcal 로 양을 맞춘다 */
      const by =
        it.role === 'protein'
          ? (it.food.protein ?? 0) / Math.max(1, sub.protein ?? 0)
          : it.food.kcal / Math.max(1, sub.kcal);
      /*
       * 그 음식의 단위로 — 찐만두 1인분을 달걀 2.06개로 두면 '가장 적은 양'이 2개로 올림돼 줄일 수 없었다. 한 끼 상한까지만 —
       * 쉐이크(단백질 24g)를 우유(6.5g)로 바꾸면 3.5컵이 되고, 그 반이 하한이 되어 묶음 상한(우유류 2컵)을 넘겼다.
       */
      const step = amountStep(subId!);
      items.push({
        food: sub,
        amount:
          it.role === 'side'
            ? 1
            : Math.min(
                MAX_PER_MEAL[subId!] ?? Infinity,
                Math.max(step, Math.round((it.amount * by) / step) * step)
              ),
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

type Wants = Partial<Record<Tag, number>>;

/**
 * 이 끼니에 무엇을 바라나 — 꼬리표마다 더하는 점수. steady 는 날마다 같은 것(목표 · 시즌 · 둘째 간식), today 는 그날에만
 * 있는 것(던지는 일정 · 더위 · 식욕 · 근육통) — 어제 고른 틀을 피할지 정할 때 today 만 본다(pickTemplate).
 */
function wants(
  slot: Slot,
  input: PlanInput,
  snackIndex: number
): { steady: Wants; today: Wants } {
  const steady: Wants = {};
  const today: Wants = {};
  let w = steady;
  const add = (tag: Tag, n: number) => (w[tag] = (w[tag] ?? 0) + n);
  /* 둘째 간식은 저녁 뒤라 자기 전 것으로 */
  if (slot === 'snack' && snackIndex > 0) add('bed', 1);
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
  w = today;
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
  return { steady, today };
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
const MAINS = new WeakMap<Prepared, string[]>();
const mainsOf = (p: Prepared) => {
  let v = MAINS.get(p);
  if (!v) {
    v = p.items
      .filter((i) => i.role === 'protein' || i.role === 'dish')
      .map((i) => i.food.id!);
    MAINS.set(p, v);
  }
  return v;
};

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

/** 1970-01-01 부터 며칠째인가 — 날짜가 틀렸으면 0 */
function dayNumber(date: string) {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : 0;
}

/** 황금비의 소수 부분 — 날마다 이만큼 건너뛰면 이레 동안 0~1 이 고르게 채워진다 */
const GOLDEN = 0.6180339887498949;

/** 그날의 주재료 · 어제 · 그제 고른 틀을 피하다 그날에만 있는 점수(크기 벌점을 뺀)가 이만큼 넘게 낮아지면 피하지 않는다 */
const RECENT_SLACK = 2;

/**
 * 틀의 크기가 이 끼니 몫과 맞나 — 처음 양으로 셈한 kcal · 단백질이 몫에서 멀수록 점수를 뺀다. 양을 늘리고 줄여 맞추긴 하지만,
 * 어린이 간식에 닭가슴살 팩이나 1,600kcal 하루에 돼지국밥이 뽑히면 맞추다 끝내 넘친다. 단백질은 넘칠 때만 뺀다(모자라면 더해 채운다).
 */
/** 처음 양의 영양 — 틀마다 한 번만 셈한다 */
const ESTS = new WeakMap<Prepared, ReturnType<typeof sumMacros>>();
function estOf(p: Prepared) {
  let v = ESTS.get(p);
  if (!v) {
    v = sumMacros(p.items.map((i) => scaleMacros(i.food, i.amount)));
    ESTS.set(p, v);
  }
  return v;
}

/** 가장 줄였을 때의 kcal — 밥 · 단백질은 처음 양의 반, 한 그릇은 반(낱개는 하나), 곁들이는 그대로. 틀마다 한 번만 셈한다 */
const FLOORS = new WeakMap<Prepared, number>();
function floorKcal(p: Prepared) {
  let v = FLOORS.get(p);
  if (v === undefined) {
    v = p.items.reduce(
      (a, i) => a + i.food.kcal * limits({ ...i, base: i.amount }).min,
      0
    );
    FLOORS.set(p, v);
  }
  return v;
}

/**
 * 가장 줄여도 끼니 몫의 이만큼을 넘는 틀은 다른 틀이 있으면 고르지 않는다. 김밥 한 줄(380kcal)은 반 줄로 못 줄여서, 목표가 낮은 날
 * 간식 몫(140~170kcal)에 뽑히면 간식이 하루의 4할이 됐다(점수만 깎아서는 한식 취향 +3 에 밀렸다).
 */
const FLOOR_LIMIT = 1.3;

/** 가장 줄였을 때의 단백질 — floorKcal 과 같은 양으로 */
const FLOOR_PROTEIN = new WeakMap<Prepared, number>();
function floorProtein(p: Prepared) {
  let v = FLOOR_PROTEIN.get(p);
  if (v === undefined) {
    v = p.items.reduce(
      (a, i) => a + (i.food.protein ?? 0) * limits({ ...i, base: i.amount }).min,
      0
    );
    FLOOR_PROTEIN.set(p, v);
  }
  return v;
}

/**
 * 이 틀을 가장 줄이고 모자란 단백질(하한 9할까지)을 기름 적은 것(1g 에 5.5kcal)으로 채우면 더해질 kcal — 베이글 · 두유 간식을
 * 남은 250kcal · 단백질 22g 저녁으로 고르면 닭가슴살 한 팩이 얹혀 375kcal 이 됐고, 우동 · 만두 저녁(줄여도 375kcal · 단백질
 * 14g)에 단백질 34g 을 맞추면 520kcal 이 됐다.
 */
function topUpKcal(p: Prepared, aim: { kcal: number; protein: number }) {
  return Math.max(0, aim.protein * 0.9 - floorProtein(p)) * 5.5;
}
/**
 * 먹은 뒤 한 끼만 남은 날 — 넘친 것을 다른 끼니에서 덜 수 없어, 가장 줄이고 단백질을 채운 어림이 몫을 넘지 않는 틀만. 1.1배까지
 * 두면 설렁탕 · 우동 저녁이 낱개 걸음(반 그릇 · 달걀 하나)에 걸려 몫보다 10% 넘게 나왔다.
 */
const LAST_FLOOR_LIMIT = 1.0;
/** 단백질이 빠듯한 끼니 — 가장 줄이고 단백질을 채운 어림이 몫의 이만큼 안 */
const HEAVY_FLOOR_LIMIT = 1.2;

function sizePenalty(p: Prepared, kcal: number, protein: number) {
  const est = estOf(p);
  const kcalOff = Math.abs(Math.log(Math.max(1, est.kcal) / Math.max(1, kcal)));
  const proteinOver = Math.log(Math.max(1, est.protein) / Math.max(1, protein));
  /*
   * 가장 줄여도 몫을 크게 넘는 틀 — 김밥 한 줄(380kcal)은 반 줄로 못 줄여서, 목표가 낮은 날 간식 몫(170kcal)에 뽑히면 간식 둘이
   * 하루의 4할이 됐다.
   */
  const floorOver = Math.log(Math.max(1, floorKcal(p)) / Math.max(1, kcal));
  /*
   * 단백질이 kcal 의 3할 넘게를 차지해야 하는 끼니는 기름진 틀(설렁탕 · 목살 — kcal 의 절반이 지방)을 더 깎는다. 단백질을 맞추면
   * 1,250kcal 하루가 1,670kcal 이 됐다.
   */
  const fatShare = (est.fat * 9) / Math.max(1, est.kcal);
  const need = (protein * 4) / Math.max(1, kcal);
  const proteinHeavy = need > 0.3;
  /*
   * 그런 끼니에 단백질이 적은 틀(베이글 · 두유)은 닭가슴살을 얹어야 해서 넘친다 — 먹은 뒤 남은 250kcal 저녁이 375kcal 이 됐다.
   */
  const proteinGap = need - (est.protein * 4) / Math.max(1, est.kcal);
  return (
    3 * Math.max(0, kcalOff - 0.3) +
    2 * Math.max(0, proteinOver - 0.4) +
    4 * Math.max(0, floorOver - 0.2) +
    (proteinHeavy
      ? 10 * Math.max(0, fatShare - 0.3) + 20 * Math.max(0, proteinGap - 0.1)
      : 0)
  );
}

/**
 * 한 번 짜는 동안 되풀이되는 셈을 기억해 둔다 — 이레를 이어 짜면 같은 사람 · 같은 몫으로 틀마다 바꿔 넣기 · 크기 점수를 열네
 * 번씩 다시 셈했다(한 번 짜는 데 3.6ms).
 */
type Ranked = { p: Prepared; score: number; today: number; fit: number }[];
type Memo = {
  prepared: Map<string, Prepared | null>;
  /** 끼니 몫('kcal|단백질')마다 틀의 크기 점수 */
  penalty: Map<string, Map<Prepared, number>>;
  /** 끼니 · 몫 · 그날 조건마다 점수 차례 — 지난날은 조건이 같아 이레 동안 한 번만 셈한다 */
  ranked: Map<string, { ranked: Ranked; pool: () => Ranked } | null>;
};

function pickTemplate(
  memo: Memo,
  slot: Slot,
  input: PlanInput,
  used: { templates: Set<string>; mains: Set<string> },
  snackIndex: number,
  /** 이 끼니의 몫 */
  aim: { kcal: number; protein: number },
  /** 같은 끼니에 이미 담은 음식(간식 둘) — 겹치는 틀은 안 고른다 */
  taken: Set<string>,
  /** 어제 · 그제 고른 틀 — 되도록 피한다 */
  recent: Set<string>[],
  /** 먹은 뒤 남은 것이 한 끼뿐인 날 */
  small = false
): Prepared | null {
  const key = [
    slot,
    snackIndex,
    small ? 1 : 0,
    aim.kcal,
    aim.protein,
    input.throwKind,
    input.hot,
    input.appetite,
    input.soreness,
  ].join('|');
  if (!memo.ranked.has(key)) memo.ranked.set(key, rankFor());
  const cached = memo.ranked.get(key);
  if (!cached) return null;
  const { ranked } = cached;

  function rankFor() {
    const want = wants(slot, input, snackIndex);
    /* 단백질이 kcal 의 3할을 넘게 차지해야 하는 끼니(감량 · 높은 단백질)는 가벼운 틀로 — 기름진 틀은 단백질을 맞추면 kcal 이 넘친다 */
    if ((aim.protein * 4) / Math.max(1, aim.kcal) > 0.3) {
      want.steady.lean = (want.steady.lean ?? 0) + 2;
      want.steady.dense = (want.steady.dense ?? 0) - 2;
    }
    const place = placeFor(slot, input);
    /*
     * 먹은 뒤 남은 것이 한 끼뿐인 날(저녁만 남았거나 한 끼로 모은 날), 그 몫이 작으면(남은 250kcal 같은) 간식 틀도 — 끼니 틀은
     * 가장 줄여도 300kcal 을 넘는다. 먹은 것이 없는 날은 몫이 작아도 끼니 틀만(1,250kcal 하루의 저녁이 '고구마 · 이온음료'가 됐다).
     */
    const from: Slot[] =
      small && slot !== 'snack' && aim.kcal < SMALL_MEAL_KCAL
        ? [slot, 'snack']
        : [slot];
    const pool = MEAL_TEMPLATES.filter((t) => t.slots.some((s) => from.includes(s)))
      .map((t) => {
        if (!memo.prepared.has(t.key)) memo.prepared.set(t.key, prepare(t, input));
        return memo.prepared.get(t.key)!;
      })
      .filter((p): p is Prepared => p !== null);
    const aimKey = `${Math.round(aim.kcal)}|${Math.round(aim.protein)}`;
    const penalties = memo.penalty.get(aimKey) ?? new Map<Prepared, number>();
    memo.penalty.set(aimKey, penalties);
    const penaltyOf = (p: Prepared) => {
      let v = penalties.get(p);
      if (v === undefined) {
        v = sizePenalty(p, aim.kcal, aim.protein);
        penalties.set(p, v);
      }
      return v;
    };
    /* 그 장소에서 먹을 수 있는 것 — 없으면(못 먹는 것이 많아서) 장소를 풀어 준다 */
    const atPlace = pool.filter((p) => p.template.places.includes(place));
    const anywhere = atPlace.length > 0 ? atPlace : pool;
    /*
     * 던지는 일정에 맞춰야 하는 끼니는 그 꼬리표 틀이 이 장소에 있으면 그 가운데서만 — 점수만 더해서는 입맛 · 더위 점수에 밀려
     * 던지는 날 점심의 4할이 던지기 전 끼니가 아니었다(까닭 줄은 '탄수화물 위주로 가볍게'라고 했다).
     */
    const must = requiredTag(slot, input);
    const tagged = must ? anywhere.filter((p) => p.template.tags.includes(must)) : [];
    const placed = tagged.length > 0 ? tagged : anywhere;
    if (placed.length === 0) return null;
    /* 가장 줄여도 몫을 크게 넘는 틀은 빼고 — 다 넘으면 그대로(점수가 작은 것을 고른다) */
    /*
     * 단백질이 kcal 의 3할 넘게를 차지해야 하는 끼니는 가장 줄이고 모자란 단백질까지 채운 어림으로 본다 — 줄인 크기만 보면
     * 설렁탕(가장 줄여도 380kcal · 단백질 20g)이 350kcal · 31g 점심에 뽑혀, 닭가슴살을 얹고 나면 하루가 더 줄 데 없이 +11% 였다.
     */
    const heavy = (aim.protein * 4) / Math.max(1, aim.kcal) > 0.3;
    const limit = small ? LAST_FLOOR_LIMIT : heavy ? HEAVY_FLOOR_LIMIT : FLOOR_LIMIT;
    const sized = placed.filter(
      (p) => floorKcal(p) + (small || heavy ? topUpKcal(p, aim) : 0) <= aim.kcal * limit
    );
    const choices = sized.length > 0 ? sized : placed;

    /*
     * 점수는 그날 다른 끼니에 무엇을 골랐는지와 상관없이 매긴다 — 같은 조건이면 날마다 같은 차례여야 아래의 점이 고루 퍼진다
     * (아침에 고른 주재료로 저녁의 차례가 날마다 바뀌면 같은 저녁이 나흘씩 나왔다). 그날 이미 고른 틀 · 주재료와 겹치는 것은
     * 고른 뒤에 건너뛴다.
     */
    const rank = (list: Prepared[]) =>
      list
        .map((p) => {
          let today = 0;
          for (const tag of p.template.tags) today += want.today[tag] ?? 0;
          let score = 1 + styleScore(p.template, input) + today;
          for (const tag of p.template.tags) score += want.steady[tag] ?? 0;
          const penalty = penaltyOf(p);
          score -= penalty;
          return { p, score, today, fit: today - penalty };
        })
        .sort(
          (a, b) =>
            b.score - a.score || a.p.template.key.localeCompare(b.p.template.key)
        );
    /* 장소 · 크기를 풀어 주는 마지막 길 — 드물어서 쓸 때 셈한다 */
    let all: Ranked | null = null;
    return { ranked: rank(choices), pool: () => (all ??= rank(pool)) };
  }
  /*
   * 0~1 의 점 하나로 고른다. 사람 · 끼니 · '다른 식단으로' 횟수로 출발점을 정하고, 날마다 황금비만큼 옮긴다 — 같은 조건이
   * 이어지는 이레 동안 점이 고루 퍼져서 한 틀만 되풀이되지 않는다(날마다 따로 뽑으면 같은 틀이 사흘 넘게 이어지곤 했다).
   */
  const start = unit(`${input.seed}|${input.variant}|${slot}|${snackIndex}`);
  const point = (start + dayNumber(input.date) * GOLDEN) % 1;
  const draw = (list: Ranked) => {
    const top = list.slice(0, TOP_K);
    if (top.length === 0) return null;
    const floor = Math.min(...top.map((s) => s.score));
    const weights = top.map((s) => s.score - floor + 1);
    let r = point * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < top.length; i++) {
      r -= weights[i];
      if (r < 0) return top[i].p;
    }
    return top[top.length - 1].p;
  };

  /*
   * 겹치지 않는 틀 가운데서 같은 점으로 — 겹친 틀만 빼고 다시 나누면 몫이 고르게 늘어난다(겹칠 때마다 바로 다음 틀로 넘기면
   * 그 틀에 몰렸다). 먼저 그날 고른 주재료와도, 어제 · 그제 고른 틀과도 안 겹치는 것. 모자라면 그제 것 → 주재료 → 어제 것
   * 순으로 푼다(주재료를 어제 것보다 먼저 풀어야 주재료 없는 '견과류 · 사과' 간식이 날마다 나오지 않았다).
   * 뽑는 위 몇 개에서는 그날에만 있는 점수(던지는 일정 · 더위 · 식욕 · 근육통)가 가장 좋은 틀보다 RECENT_SLACK 넘게 낮은
   * 것을 뺀다 — 던지는 날 점심의 던지기 전 끼니처럼 그날 꼭 맞는 틀을 '아침에 달걀을 먹었다' · '어제 먹었다'로 놓치지
   * 않게. 날마다 같은 점수(증량의 열량 밀도 · 한식 취향 · 어린이에 맞는 크기)로는 빼지 않는다 — 그러면 그 점수가 높은 틀
   * 하나가 날마다 나왔다. 그날 점수에서는 크기 벌점을 뺀다(fit) — 입맛 없는 날의 가산(+3)만 보면 몫(395kcal)에 맞는 닭가슴살
   * 샐러드가 빠지고 가장 줄여도 몫보다 큰 설렁탕 · 우동만 남아 하루가 +30% 였다.
   */
  const free = (p: Prepared) =>
    !used.templates.has(p.template.key) && !p.items.some((i) => taken.has(i.food.id!));
  const fresh = (p: Prepared) => !mainsOf(p).some((m) => used.mains.has(m));
  const notWithin = (days: number) => (p: Prepared) =>
    recent.slice(0, days).every((keys) => !keys.has(p.template.key));
  const open = ranked.filter((s) => free(s.p));
  const bestToday = Math.max(...open.map((s) => s.fit));
  const near = (keep: (p: Prepared) => boolean) => {
    /* 남길 것 가운데 위 TOP_K 개에서, 그날 점수(크기 벌점을 뺀)가 가장 좋은 것보다 RECENT_SLACK 넘게 낮은 것은 뺀다 */
    const list: Ranked = [];
    let seen = 0;
    for (const s of open) {
      if (!keep(s.p)) continue;
      if (s.fit >= bestToday - RECENT_SLACK) list.push(s);
      if (++seen === TOP_K) break;
    }
    return list.length > 0 ? draw(list) : null;
  };
  return (
    near((p) => fresh(p) && notWithin(2)(p)) ??
    near((p) => fresh(p) && notWithin(1)(p)) ??
    near(notWithin(1)) ??
    near(fresh) ??
    draw(open) ??
    draw(cached.pool().filter((s) => free(s.p)))
  );
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
  /* 단백질 몫을 맞추다 돈가스 2.25인분(1,460kcal) · 갈비탕 세 그릇이 되지 않게 */
  tonkatsu: 1.25, galbitang: 1.25, seolleongtang: 1.5, yukgaejang: 1.5, 'sundubu-jjigae': 1.5,
  'chicken-salad': 2, dumplings: 2, 'pasta-tomato': 1.5,
};

/*
 * 한 끼에 비슷한 것이 쌓이지 않게 묶음으로도 센다 — 음식마다 상한만 보면 두유 2 + 우유 2 로 한 끼 네 컵이 됐다. 간식 둘은 같은
 * '간식' 끼니라 함께 센다(화면에서 한 칸에 보인다). 흰자 둘은 달걀 하나로 센다.
 */
const FOOD_GROUPS: { cap: number; weight: Record<string, number> }[] = [
  /* 우유류(컵) */
  {
    cap: 2,
    weight: {
      milk: 1,
      'milk-lowfat': 1,
      'soy-milk': 1,
      'choco-milk': 1,
      'banana-milk': 1,
    },
  },
  /* 두부류 */
  { cap: 2, weight: { tofu: 1, 'braised-tofu': 1, 'sundubu-jjigae': 1 } },
  /* 달걀류(개) */
  { cap: 3, weight: { egg: 1, 'egg-fried': 1, 'egg-roll': 1, 'egg-white': 0.5 } },
  /* 밥류(공기) */
  { cap: 2, weight: { rice: 1, 'brown-rice': 1, 'multigrain-rice': 1 } },
];

/** 같은 끼니의 다른 줄을 두고 이 음식을 얼마까지 담을 수 있나(묶음 상한) — 묶음에 없으면 Infinity */
function groupMax(id: string, others: Line[]) {
  let max = Infinity;
  for (const g of FOOD_GROUPS) {
    const w = g.weight[id];
    if (!w) continue;
    const used = others.reduce((a, l) => a + (g.weight[l.food.id!] ?? 0) * l.amount, 0);
    max = Math.min(max, (g.cap - used) / w);
  }
  return max;
}

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
/** kcal 하나에 단백질이 얼마나 — 높을수록 기름이 적다(닭가슴살 0.19 · 두부 0.10 · 돼지 목살 0.075) */
const leanness = (f: Food) => (f.protein ?? 0) / Math.max(1, f.kcal);
const totalOf = (lines: Line[]) => sumMacros(lines.map(lineMacros));

/**
 * 하루 맞추기가 끼니를 몫의 이 사이로만 늘리고 줄인다 — 하루 합만 보고 맞추면 아침이 몫의 절반(오트밀 반 · 우유 반)이 되고
 * 저녁이 1.75배(설렁탕 + 쉐이크 1.5)가 됐다. 곁들이(이온음료 · 주스)를 빼는 것만 몫의 절반까지 둔다.
 */
const MEAL_RATIO_LO = 0.6;
const MEAL_RATIO_HI = 1.5;
const SIDE_DROP_LO = 0.5;
/** 한 끼 맞추기에서 단백질 재료를 늘려도 그 끼니가 몫의 이만큼을 넘지 않게 */
const PROTEIN_GROW_LIMIT = 1.25;

/**
 * 한 끼를 몫에 맞춘다 — 단백질은 단백질 재료로, kcal 는 탄수화물(없으면 한 그릇 요리)로. 단백질은 기름이 적은 재료로
 * 맞춘다(1인분 단백질이 많은 것부터 늘리면 돼지 목살 · 계란말이가 늘어 kcal 이 넘쳤다).
 */
function fitMeal(lines: Line[], kcal: number, protein: number, others: Line[] = []) {
  /* 묶음 상한까지만 — 같은 끼니(간식 둘)에 이미 담은 것까지 센다 */
  const fit = (l: Line, amount: number) => {
    const max = groupMax(l.food.id!, [...others, ...lines.filter((x) => x !== l)]);
    const { step, min } = limits(l);
    l.amount = Math.max(
      min,
      Math.min(clampAmount(l, amount), Math.floor(max / step + 1e-9) * step)
    );
  };
  for (const l of lines) fit(l, l.amount);
  const prot = lines
    .filter((l) => l.role === 'protein' && (l.food.protein ?? 0) > 0)
    .sort((a, b) => leanness(b.food) - leanness(a.food))[0];
  if (prot) {
    const short = protein - totalOf(lines).protein;
    /*
     * 그 끼니가 몫의 1.25배를 넘도록 늘리지는 않는다 — 모자란 것은 하루 맞추기가 기름 적은 것으로 채운다. 단백질이 적은 요거트 ·
     * 두유 간식(1g 에 20~28kcal)으로 간식 단백질 몫(12g)을 채우려 두 배로 늘려, 1,250kcal 하루에 간식 둘이 510kcal(38%)이었다.
     */
    const room =
      (kcal * PROTEIN_GROW_LIMIT - totalOf(lines).kcal) / Math.max(1, prot.food.kcal);
    const amount = Math.min(
      prot.amount + short / (prot.food.protein ?? 1),
      Math.max(prot.amount, prot.amount + room)
    );
    fit(prot, amount);
  }
  const carb =
    lines.find((l) => l.role === 'carb' && l.food.kcal > 0) ??
    lines.find((l) => l.role === 'dish' && l.food.kcal > 0);
  if (carb) {
    const gap = kcal - totalOf(lines).kcal;
    fit(carb, carb.amount + gap / carb.food.kcal);
  }
}

/**
 * 하루 단백질이 모자랄 때 더하는 것 — 앞에서부터 쓸 수 있는 것. 간식(없으면 저녁)에 더하고, 고기 · 생선(MEAT_BOOST)은 저녁에.
 * 유제품 · 닭고기를 못 먹으면 달걀 · 두부 · 두유뿐이라, 그것들이 이미 식단에 있으면 단백질이 목표의 8할에서 멈췄다.
 */
export const PROTEIN_BOOST = [
  'greek-yogurt',
  'milk',
  'egg',
  'tofu',
  'chicken-breast-pack',
  'soy-milk',
  'protein-shake',
  'tuna-can',
  'chicken-breast',
  'beef-lean',
  'pork-tenderloin',
];
/* 익힌 닭가슴살은 ¼ 단위라 몇 g 모자랄 때 팩(23g)을 통째로 얹지 않아도 된다 — 끼니(점심 · 저녁)에만 */
const MEAT_BOOST = new Set([
  'tuna-can',
  'chicken-breast',
  'beef-lean',
  'pork-tenderloin',
]);
/** kcal 하나에 단백질이 이만큼 넘으면 기름이 적은 단백질(닭가슴살 · 참치 · 살코기 · 흰자) */
const LEAN_FOOD = 0.15;
/**
 * 이만큼 밑이면 넘칠 때 기름 적은 것과 맞바꿀 단백질 — 기름진 것(달걀 · 우유 · 두유 · 고등어 · 순두부찌개)에 두부 · 연어까지
 * (단백질 1g 에 9~10kcal, 닭가슴살의 두 배)
 */
const SWAP_FOOD = 0.11;
/** 하루 kcal 이 모자랄 때(탄수화물을 더 못 늘릴 때) */
export const KCAL_BOOST = ['banana', 'sweet-potato', 'rice', 'garaetteok', 'oatmeal'];

/* ─────────────────────────── 짜기 ─────────────────────────── */

/** 던지는 일정에 꼭 맞춰야 하는 끼니의 꼬리표 — 오늘 던지면 점심은 던지기 전 · 저녁은 회복식, 내일 등판이면 저녁은 던지기 전 */
function requiredTag(slot: Slot, input: PlanInput): Tag | null {
  switch (input.throwKind) {
    case 'today':
      return slot === 'lunch' ? 'pre' : slot === 'dinner' ? 'rec' : null;
    case 'eve':
      return slot === 'dinner' ? 'pre' : null;
    case 'after':
      return slot === 'dinner' ? 'rec' : null;
    default:
      return null;
  }
}

/**
 * 이레를 한 줄로 이어 짠다 — 지난주 월요일부터 어제까지를 짜 보고, 어제 · 그제 고른 틀을 오늘은 피한다. 늘 지난주 월요일부터
 * 다시 셈하므로 같은 날을 다시 열어도 같은 식단이다(이번 주 월요일부터 셈하면 월요일에 일요일 틀이 되풀이됐다 — 한 주 앞에서
 * 시작하면 두 줄이 그사이 맞물린다). 지난 날은 보통 날로 짠다 — 목표 · 취향 · 장소는 오늘 그대로, 던지는 일정 ·
 * 더위 · 식욕 · 근육통 · 먹은 것 · '다른 식단으로'는 없이(지난 날도 던지는 날로 짜 보면 얼마 없는 던지기 전 점심을 지난
 * 날이 다 써 버려 정작 오늘 못 골랐다).
 */
export function buildMealPlan(input: PlanInput): MealPlanResult {
  const day = dayNumber(input.date);
  /* 1970-01-01 은 목요일 — (날 수 + 3) 을 7 로 나눈 나머지가 월요일부터 며칠째인가 */
  const monday = day - ((day + 3) % 7) - 7;
  let recent: Set<string>[] = [];
  const memo: Memo = { prepared: new Map(), penalty: new Map(), ranked: new Map() };
  for (let d = monday; d < day; d++) {
    const past = planDay(
      memo,
      {
        ...input,
        date: new Date(d * 86_400_000).toISOString().slice(0, 10),
        variant: 0,
        hot: false,
        throwKind: null,
        appetite: null,
        soreness: null,
        eaten: [],
      },
      recent,
      true
    );
    recent = [new Set(past.meals.map((m) => m.template)), ...recent].slice(0, 2);
  }
  input.recent?.slice(0, 2).forEach((keys, k) => {
    if (keys) recent[k] = new Set(keys);
  });
  return planDay(memo, input, recent);
}

/**
 * 오늘 짤 몫 — 먹은 것을 뺀 남은 kcal · 단백질(kcal 의 35% 까지로 묶음)과 끼니 칸마다의 몫. 식단 짜기와 시험이 같이 쓴다.
 */
export function planAims(input: PlanInput) {
  const eatenMeals = new Set(input.eaten.filter((e) => e.kcal > 0).map((e) => e.meal));
  const eatenTotal = input.eaten.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein }),
    { kcal: 0, protein: 0 }
  );
  const leftKcal = Math.max(0, input.targets.kcal - eatenTotal.kcal);
  /*
   * 단백질은 짤 kcal 로 채울 수 있는 만큼까지(kcal 의 35%) — 단백질이 적은 아침 · 점심을 먹은 뒤 남은 250kcal 에 단백질 60g 을
   * 채우려다 830kcal 이 됐고, 1,250kcal 에 121g(39%)인 감량 목표는 단백질을 채우다 kcal 이 37% 넘쳤다. 밥 · 국 · 반찬 끼니로
   * 맞출 수 있는 위쪽이 이쯤이다(닭가슴살만 먹으면 7할이지만 그건 끼니가 아니다).
   */
  const left = {
    kcal: leftKcal,
    protein: Math.min(
      Math.max(0, input.targets.protein - eatenTotal.protein),
      (leftKcal * MAX_PROTEIN_SHARE) / 4
    ),
  };

  const shares = trimSlots(
    slotShares(input).filter(([slot]) => !eatenMeals.has(slot)),
    left.kcal,
    eatenMeals.size > 0
  );
  const shareSum = shares.reduce((a, [, v]) => a + v, 0);
  /* 단백질은 끼니마다 고르게(간식은 끼니의 반) — 몰아 먹는 것보다 근육이 잘 쓴다(meal-protein.ts) */
  const pWeight = (slot: Slot) => (slot === 'snack' ? 0.5 : 1);
  const pSum = shares.reduce((a, [slot]) => a + pWeight(slot), 0);
  const aims = shares.map(([slot, share]) => ({
    slot,
    kcal: (left.kcal * share) / shareSum,
    protein: (left.protein * pWeight(slot)) / pSum,
  }));
  return { eatenMeals, eatenTotal, left, shares, aims };
}

function planDay(
  memo: Memo,
  input: PlanInput,
  recent: Set<string>[],
  /** 지난날 — 고른 틀만 쓰므로 양 맞추기는 건너뛴다(틀 고르기는 양 맞추기와 상관없다) */
  picksOnly = false
): MealPlanResult {
  const { eatenMeals, eatenTotal, left, shares, aims } = planAims(input);
  const skipped = [...eatenMeals].filter(isMealKey);
  const reasons: string[] = [];
  if (skipped.length > 0) {
    reasons.push(
      `이미 먹은 ${skipped.map(mealLabel).join(' · ')}은 빼고, 남은 ${Math.round(left.kcal).toLocaleString('ko-KR')}kcal 을 나눠 짰어요.`
    );
  }
  if (shares.length > 0 && left.kcal >= 150) {
    const wanted = Math.max(0, input.targets.protein - eatenTotal.protein);
    if (left.protein < wanted * 0.95) {
      reasons.push(
        `단백질은 남은 열량으로 채울 수 있는 ${Math.round(left.protein)}g 까지 넣었어요.`
      );
    }
    const dropped = shares.trimmed;
    if (dropped === 'one') reasons.push('남은 양이 적어 한 끼로 짰어요.');
    /* 3+2 에서 하나만 뺐거나 간식만 남아 하나를 두었으면 '빼고'가 아니다 */
    if (dropped === 'snack')
      reasons.push(
        shares.some(([s]) => s === 'snack')
          ? '남은 양에 맞춰 간식을 하나로 줄였어요.'
          : '남은 양이 적어 간식은 빼고 짰어요.'
      );
  }
  if (shares.length === 0 || left.kcal < 150) {
    return {
      items: [],
      meals: [],
      reasons: [...reasons, '오늘 목표를 거의 채웠어요. 더 짤 끼니가 없어요.'],
      skipped,
      target: left,
    };
  }

  const used = { templates: new Set<string>(), mains: new Set<string>() };
  const meals: {
    slot: Slot;
    template: MealTemplate;
    lines: Line[];
    kcal: number;
    protein: number;
  }[] = [];
  let snackIndex = 0;
  for (const { slot, kcal, protein } of aims) {
    const before = meals.filter((m) => m.slot === slot).flatMap((m) => m.lines);
    const taken = new Set(before.map((l) => l.food.id!));
    /* 묶음이 거의 찬 것(한 컵도 못 더 담는 우유류 같은)도 같은 끼니의 둘째 간식에서는 뺀다 */
    for (const g of FOOD_GROUPS)
      for (const id of Object.keys(g.weight))
        if (groupMax(id, before) < 1) taken.add(id);
    const picked = pickTemplate(
      memo,
      slot,
      input,
      used,
      slot === 'snack' ? snackIndex : 0,
      { kcal, protein },
      taken,
      recent,
      eatenMeals.size > 0 && shares.length === 1
    );
    if (slot === 'snack') snackIndex++;
    if (!picked) continue;
    used.templates.add(picked.template.key);
    for (const m of mainsOf(picked)) used.mains.add(m);
    const lines: Line[] = picked.items.map((i) => ({ ...i, base: i.amount }));
    for (const l of lines) l.amount = clampAmount(l, l.amount);
    fitMeal(lines, kcal, protein, before);
    meals.push({ slot, template: picked.template, lines, kcal, protein });
  }
  if (picksOnly) {
    return {
      items: [],
      meals: meals.map((m) => ({
        meal: m.slot,
        title: m.template.name,
        template: m.template.key,
      })),
      reasons,
      skipped,
      target: left,
    };
  }

  /* ── 하루 맞추기 — 단백질은 9할~1.3배, kcal 는 ±8% 안으로. 한 번에 한 걸음씩 ── */
  const all = () => meals.flatMap((m) => m.lines);
  /*
   * 덧붙이는 음식은 몫에서 가장 모자란 끼니에, 한 끼에 둘까지 — 늘 간식에 몰아 '달걀 셋 · 그릭요거트 · 우유 · 두부'처럼
   * 1,000kcal 넘는 간식이 되던 것. 고기 · 생선은 점심 · 저녁에만.
   */
  /* 간식 둘은 같은 '간식' 끼니라 한도도 끼니(slot)로 센다. 몫을 25% 넘게 채운 끼니에는 더하지 않는다 */
  const added = new Map<Slot, number>();
  const shortest = (
    of: (m: (typeof meals)[number]) => number,
    ok: (m: (typeof meals)[number]) => boolean = () => true
  ) => {
    const open = meals.filter(
      (m) =>
        ok(m) && (added.get(m.slot) ?? 0) < 2 && totalOf(m.lines).kcal < m.kcal * 1.25
    );
    const pool = open.length > 0 ? open : meals.filter(ok);
    return pool.sort((x, y) => of(y) - of(x))[0];
  };
  const addLine = (m: (typeof meals)[number], id: string, role: Role, amount = 1) => {
    /* 처음 양이 1 밑이면 하한도 그만큼 — 줄이려다 오히려 늘지 않게 */
    m.lines.push({ food: basicFood(id)!, amount, role, base: Math.min(1, amount * 2) });
    added.set(m.slot, (added.get(m.slot) ?? 0) + 1);
  };
  /** 모자란 단백질(g)을 채우는 가장 작은 양 — 한 단위(1)까지 */
  const sizeFor = (id: string, need: number) => {
    const food = basicFood(id)!;
    const step = amountStep(id);
    const units = need / Math.max(0.1, food.protein ?? 0);
    return Math.min(1, Math.max(step, Math.ceil(units / step - 1e-9) * step));
  };
  /** 모자란 단백질(g)을 다 덮는 양의 kcal — 한 단위로 막지 않는다 */
  const coverKcal = (id: string, need: number) => {
    const food = basicFood(id)!;
    const step = amountStep(id);
    return (
      Math.ceil(need / Math.max(0.1, food.protein ?? 0) / step - 1e-9) *
      step *
      food.kcal
    );
  };
  /*
   * 단백질이 kcal 의 4분의 1을 넘게 차지해야 하는 날(감량 · 높은 단백질), 먹은 뒤 한 끼만 남은 날(넘친 것을 다른 끼니에서 덜
   * 수 없다)은 기름이 적은 것부터 더한다 — 어린이의 남은 저녁 309kcal 에 두유를 두 팩으로 늘려 423kcal 이 됐다.
   */
  const tight =
    (left.protein * 4) / Math.max(1, left.kcal) > 0.25 ||
    (eatenMeals.size > 0 && shares.length === 1);
  const boostOrder = tight
    ? PROTEIN_BOOST.filter((x) => basicFood(x)).sort(
        (a, b) => leanness(basicFood(b)!) - leanness(basicFood(a)!)
      )
    : PROTEIN_BOOST;
  /** 같은 끼니(간식 둘은 함께)의 다른 줄 */
  const slotOthers = (slot: Slot, except?: Line) =>
    meals
      .filter((m) => m.slot === slot)
      .flatMap((m) => m.lines.filter((l) => l !== except));
  /** 끼니가 제 몫의 몇 배인가 */
  const mealRatio = (m: (typeof meals)[number], add = 0) =>
    (totalOf(m.lines).kcal + add) / Math.max(1, m.kcal);
  /** 맞바꾸기는 중간 걸음을 막지 않고 끝난 모양만 본다 */
  let wholeOnly = false;
  /** 이만큼 kcal 을 더하거나 빼도 끼니가 몫의 0.6~1.5배 안에 있나(밖에 있던 끼니는 안쪽으로 가는 걸음만). 한 끼만 남은 날은 보지 않는다 */
  const keepsRatio = (m: (typeof meals)[number], delta: number, lo = MEAL_RATIO_LO) => {
    if (wholeOnly || meals.length === 1) return true;
    const next = mealRatio(m, delta);
    if (delta > 0) return next <= MEAL_RATIO_HI || next <= mealRatio(m);
    return next >= lo || next >= mealRatio(m);
  };
  /** 한 걸음 늘리거나 줄인다 — 상한 · 하한 · 묶음 상한 · 끼니 몫 가드에 막히면 false */
  const nudge = (line: Line, dir: 1 | -1) => {
    const next = clampAmount(line, line.amount + dir * limits(line).step);
    if (next === line.amount) return false;
    const meal = meals.find((m) => m.lines.includes(line))!;
    if (dir > 0 && next > groupMax(line.food.id!, slotOthers(meal.slot, line)) + 1e-9)
      return false;
    if (!keepsRatio(meal, (next - line.amount) * line.food.kcal)) return false;
    line.amount = next;
    return true;
  };
  /** 이 끼니에 이 음식을 한 개 더 담을 자리가 있나(묶음 상한) */
  const roomFor = (m: (typeof meals)[number], id: string) =>
    groupMax(id, slotOthers(m.slot)) >= 1 - 1e-9;
  const proteinShort = (m: (typeof meals)[number]) =>
    m.protein - totalOf(m.lines).protein;
  /** 단백질 음식 하나를 단백질이 가장 모자란 끼니에 — 고기 · 생선은 점심 · 저녁에 */
  const addBoost = (id: string, need?: number) => {
    const amount = need === undefined ? 1 : sizeFor(id, need);
    const fits = (m: (typeof meals)[number]) =>
      roomFor(m, id) && keepsRatio(m, amount * basicFood(id)!.kcal);
    const meal = MEAT_BOOST.has(id)
      ? (shortest(
          proteinShort,
          (m) => fits(m) && (m.slot === 'lunch' || m.slot === 'dinner')
        ) ?? shortest(proteinShort, fits))
      : shortest(proteinShort, fits);
    if (!meal || !fits(meal)) return false;
    addLine(meal, id, 'protein', amount);
    return true;
  };
  /** 더할 수 있는 단백질 음식 — 못 먹는 것이 아니고, 아직 없고, 담을 자리(묶음 상한)가 있는 끼니가 있다 */
  const canBoost = (id: string) =>
    !!basicFood(id) &&
    !blocked(id, input) &&
    !all().some((l) => l.food.id === id) &&
    meals.some((m) => roomFor(m, id));
  /** 끼니 몫 가드 없이 해 본다 — 맞바꾸기에서 늘리는 걸음은 끝난 모양만 본다 */
  const freely = <T>(f: () => T) => {
    wholeOnly = true;
    try {
      return f();
    } finally {
      wholeOnly = false;
    }
  };
  /*
   * 넘치는데 단백질이 하한에 걸렸으면 기름이 적은 것(닭가슴살 · 참치)을 더하고, 그만큼 덜 담백한 단백질(두유 · 우유 · 달걀 ·
   * 고등어 · 두부 · 연어)을 단백질이 처음보다 줄지 않을 때까지 줄인다. kcal 이 줄 때만 둔다 — 입맛 없는 날 가벼운 틀의 두유 ·
   * 우유가 늘어 1,250kcal 하루가 1,660kcal 이 됐다. 우동 · 만두 저녁의 두부(1g 에 9.6kcal)도 돼지 안심(5.6kcal)으로 바꿔야
   * 한 끼 남은 374kcal 에 449kcal 이 아니었다.
   */
  const swapLean = () => {
    const before = totalOf(all());
    const ratios = meals.map((m) => mealRatio(m));
    /* 끼니마다 몫의 0.6~1.5배 안이거나, 밖에 있던 끼니는 더 멀어지지 않았나 */
    const ratiosKept = () =>
      meals.every((m, i) => {
        const r = mealRatio(m);
        return (
          (r <= MEAL_RATIO_HI || r <= ratios[i] + 1e-9) &&
          (r >= MEAL_RATIO_LO || r >= ratios[i] - 1e-9)
        );
      });
    const snapshot = () =>
      meals.map((m) => ({
        m,
        n: m.lines.length,
        amounts: m.lines.map((l) => l.amount),
        added: added.get(m.slot),
      }));
    const restore = (state: ReturnType<typeof snapshot>) => {
      for (const { m, n, amounts, added: was } of state) {
        m.lines.length = n;
        m.lines.forEach((l, i) => (l.amount = amounts[i]));
        if (was === undefined) added.delete(m.slot);
        else added.set(m.slot, was);
      }
    };
    const saved = snapshot();
    const growLean = () =>
      freely(() =>
        all()
          .filter((l) => l.role === 'protein' && leanness(l.food) >= LEAN_FOOD)
          .sort((x, y) => leanness(y.food) - leanness(x.food))
          .find((l) => nudge(l, 1))
      );
    /* 기름진 줄을 기름진 것부터, 단백질이 처음보다 줄지 않는 데까지 줄인다 */
    const cutFatty = () => {
      const fatty = all()
        .filter(
          (l) => l.role === 'protein' && l.amount > 0 && leanness(l.food) < SWAP_FOOD
        )
        .sort((x, y) => leanness(x.food) - leanness(y.food));
      for (const l of fatty) {
        for (;;) {
          const amount = l.amount;
          if (!nudge(l, -1)) break;
          if (totalOf(all()).protein < before.protein) {
            l.amount = amount;
            break;
          }
        }
      }
    };
    /*
     * 기름 적은 것을 새로 더한다 — 기름진 줄 한 걸음이 내주는 단백질만큼을 가장 적은 kcal 로. 닭가슴살 팩 하나를 통째로 얹으면
     * 세 끼 먹고 156kcal 남은 날이 198kcal(+27%) 이 됐다.
     */
    const addLean = () => {
      const gives = all()
        .filter(
          (l) =>
            l.role === 'protein' &&
            l.amount > 0 &&
            leanness(l.food) < SWAP_FOOD &&
            l.amount - limits(l).step >= limits(l).min - 1e-9
        )
        .map((l) => limits(l).step * (l.food.protein ?? 0));
      if (gives.length === 0) return false;
      const give = Math.min(...gives);
      const lean = boostOrder
        .filter((x) => canBoost(x) && leanness(basicFood(x)!) >= LEAN_FOOD)
        .sort((a, b) => coverKcal(a, give) - coverKcal(b, give));
      return freely(() => lean.some((x) => addBoost(x, give)));
    };
    /*
     * 기름 적은 것을 한 걸음 늘리거나 새로 더할 때마다 기름진 것을 줄여 보고, kcal 이 가장 적었던 때로 돌아간다. 하루가 8% 안에
     * 들면 멈춘다. 기름진 줄 한 걸음이 내주는 단백질(설렁탕 ¼ 그릇 8g)이 기름 적은 것 한 걸음(돼지 안심 ¼ 7g)보다 크면 두 걸음을
     * 늘려야 한 걸음을 줄일 수 있다 — 한 걸음만 늘려 보고 멈춰, 설렁탕 저녁이 몫의 1.3배로 남았다. 늘릴 것(단백질 쉐이크 반 개
     * 60kcal)보다 새로 더할 것(돼지 안심 ¼ 36kcal)이 작으면 그쪽이 낫다.
     */
    let best: ReturnType<typeof snapshot> | null = null;
    let bestKcal = before.kcal - 10;
    let at = saved;
    for (let k = 0; k < 6; k++) {
      let pick: {
        kcal: number;
        ok: boolean;
        state: ReturnType<typeof snapshot>;
      } | null = null;
      for (const move of [() => growLean() !== undefined, addLean]) {
        restore(at);
        if (!move()) continue;
        cutFatty();
        const kcal = totalOf(all()).kcal;
        const ok = ratiosKept();
        if (!pick || (ok && !pick.ok) || (ok === pick.ok && kcal < pick.kcal))
          pick = { kcal, ok, state: snapshot() };
      }
      if (!pick) break;
      restore(pick.state);
      at = pick.state;
      if (pick.ok && pick.kcal < bestKcal) {
        bestKcal = pick.kcal;
        best = pick.state;
      }
      if (pick.kcal <= left.kcal * 1.08) break;
    }
    restore(best ?? saved);
    return best !== null;
  };
  /*
   * 단백질이 kcal 의 3할을 넘게 차지해야 하는 날(1,250kcal 에 단백질 120g 같은)은 둘을 다 맞추지 못할 때가 있다. 밥 · 면 ·
   * 곁들이를 다 줄여도 kcal 이 넘치면 그날은 단백질을 8할 6푼까지로 내리고 기름진 단백질 재료부터 줄인다 — 9할까지 채우다
   * 1,250kcal 하루가 1,800kcal 이 됐다. 한 번 내리면 그날은 그대로(다시 채우다 넘치기를 되풀이하지 않게).
   */
  let proteinFloor = 0.9;
  for (let round = 0; round < 60 && meals.length > 0; round++) {
    const t = totalOf(all());
    if (t.protein < left.protein * proteinFloor) {
      /* 이미 있는 단백질 재료를 늘리고, 다 막혔으면 간식(없으면 저녁)에 단백질 음식을 하나 더한다 */
      const id = boostOrder.find(canBoost);
      /*
       * 단백질이 빠듯한 날은 기름진 재료(순두부찌개 · 달걀 · 두유)를 늘리기보다 훨씬 기름이 적은 것(닭가슴살)을 먼저 더한다 —
       * 입맛 없는 날 가벼운 틀의 순두부 · 두유를 늘려 1,250kcal 하루가 1,770kcal 이 됐다.
       */
      const leanFirst =
        tight && id !== undefined && leanness(basicFood(id)!) >= LEAN_FOOD;
      /* 한 걸음에 단백질이 1.3배를 넘으면 그 걸음은 건너뛴다 — 닭가슴살 팩 하나를 더했다 뺐다 되풀이하며 멈춰 있었다 */
      const grow = (onlyShort: boolean) =>
        meals
          .filter((m) => !onlyShort || proteinShort(m) > 0)
          .flatMap((m) => m.lines)
          .filter((l) => l.role === 'protein' && (l.food.protein ?? 0) > 0)
          .filter((l) => !leanFirst || leanness(l.food) >= LEAN_FOOD)
          .sort((x, y) => leanness(y.food) - leanness(x.food))
          .find((l) => {
            const amount = l.amount;
            if (!nudge(l, 1)) return false;
            if (totalOf(all()).protein <= left.protein * 1.3) return true;
            l.amount = amount;
            return false;
          });
      /*
       * 단백질이 모자란 끼니의 재료부터 늘리고, 거기 늘릴 것이 없으면 그 끼니에 하나 더하고, 그래도 안 되면 아무 끼니나 —
       * 가장 담백한 줄(저녁의 닭가슴살 팩)부터 늘리면 정작 모자란 던지기 전 점심 대신 저녁이 커지고, 넘친 만큼 점심이
       * 깎여 던지는 날 점심이 그날 가장 가벼운 끼니가 됐다.
       */
      if (grow(true)) continue;
      /*
       * 모자란 만큼만 더한다(한 단위까지). 빠듯한 날은 모자란 만큼을 다 덮는 양의 kcal 이 적은 것부터 — 남은 저녁 하나에
       * 단백질 6g 이 모자라 닭가슴살 팩(115kcal)을 통째로 얹으면 +12% 였다. 한 단위로 막아 견주면 14.7g 이 모자란데 못 덮는
       * 달걀 1(78kcal)이 다 덮는 닭가슴살 0.5(83kcal)보다 앞서, 달걀을 더하고도 또 모자라 보충이 쌓였다. 한 끼에 몰리는 것은
       * 끼니 몫 가드(keepsRatio)가 막는다.
       */
      const need = left.protein * proteinFloor - t.protein;
      const kcalFor = (x: string) => coverKcal(x, need);
      const order = tight
        ? boostOrder.filter(canBoost).sort((a, b) => kcalFor(a) - kcalFor(b))
        : boostOrder.filter(canBoost);
      if (order.some((x) => addBoost(x, need))) continue;
      if (grow(false)) continue;
    } else if (t.protein > left.protein * 1.3) {
      /* 하한 밑으로는 줄이지 않는다 — 작은 간식 하나(16g)에서 소고기 ¼ 을 빼면 하한 밑이라 다시 닭가슴살을 더해 +14% 였다 */
      const shrink = all()
        .filter((l) => l.role === 'protein')
        .sort((x, y) => leanness(x.food) - leanness(y.food))
        .find((l) => {
          const amount = l.amount;
          if (!nudge(l, -1)) return false;
          if (totalOf(all()).protein >= left.protein * proteinFloor) return true;
          l.amount = amount;
          return false;
        });
      if (shrink) continue;
    }
    const gap = left.kcal - t.kcal;
    if (Math.abs(gap) <= left.kcal * 0.08) break;
    /*
     * 몫에서 가장 멀어진 끼니의 탄수화물(없으면 한 그릇 요리)부터 한 걸음 — 하루 차이가 줄어들 때만. 삼각김밥(200kcal) 하나를
     * 72kcal 모자란 저녁에 더하면 넘쳐서 다음 걸음에 도로 빼기를 되풀이했고, 그사이 바나나 반 개를 더할 차례가 오지 않았다.
     */
    const moved = meals
      .map((m) => ({ m, gap: m.kcal - totalOf(m.lines).kcal }))
      .sort((x, y) => (gap > 0 ? y.gap - x.gap : x.gap - y.gap))
      .some(({ m }) =>
        m.lines
          .filter((l) => l.role === 'carb' || l.role === 'dish')
          .some((l) => {
            const amount = l.amount;
            if (!nudge(l, gap > 0 ? 1 : -1)) return false;
            if (Math.abs(left.kcal - totalOf(all()).kcal) < Math.abs(gap)) return true;
            l.amount = amount;
            return false;
          })
      );
    if (moved) continue;
    if (gap < 0) {
      /*
       * 밥 · 면을 다 줄였는데도 넘치면 — 단백질이 목표를 넘는 동안 기름진 단백질 재료부터 한 걸음, 그다음 kcal 큰 곁들이
       * (이온음료 · 주스 · 잡채 같은 것)를 뺀다. 끼니마다 하나는 남긴다. 목표 kcal 이 낮은 날 곁들이 · 단백질만으로 넘쳤다.
       */
      const trim = all()
        .filter((l) => l.role === 'protein' && l.amount > 0)
        .sort((x, y) => leanness(x.food) - leanness(y.food))
        .find((l) => {
          const before = l.amount;
          if (!nudge(l, -1)) return false;
          /* 보통은 단백질이 목표를 넘는 동안만, 하한을 내린 날은 그 하한까지 */
          if (
            totalOf(all()).protein >=
            left.protein * (proteinFloor < 0.9 ? proteinFloor : 1)
          )
            return true;
          l.amount = before;
          return false;
        });
      if (trim) continue;
      const side = meals
        .flatMap((m) =>
          m.lines.filter((l) => l.amount > 0).length > 1
            ? m.lines.filter(
                (l) =>
                  l.role === 'side' &&
                  l.amount > 0 &&
                  keepsRatio(m, -lineMacros(l).kcal, SIDE_DROP_LO)
              )
            : []
        )
        .filter((l) => lineMacros(l).kcal >= 40)
        .sort((x, y) => lineMacros(y).kcal - lineMacros(x).kcal)[0];
      if (side) {
        side.amount = 0;
        continue;
      }
      if (swapLean()) continue;
      if (gap < -left.kcal * 0.1 && proteinFloor > 0.86) {
        proteinFloor = 0.86;
        continue;
      }
    }
    if (gap > 0) {
      /*
       * 가장 모자란 끼니부터, 끼니 몫의 1.5배를 넘지 않는 양으로 — 넘으면 줄이고, 한 걸음도 안 들어가면 다음 끼니로. 덧붙인 것이
       * 둘인 끼니는 다른 끼니가 다 막혔을 때만. 3,948kcal 하루에 간식만 열려 있어 밥 한 공기가 막히자 맞추기가 멈춰 −21% 였다.
       */
      const short = (m: (typeof meals)[number]) => m.kcal - totalOf(m.lines).kcal;
      const open = meals
        .filter(
          (m) => (added.get(m.slot) ?? 0) < 2 && totalOf(m.lines).kcal < m.kcal * 1.25
        )
        .sort((x, y) => short(y) - short(x));
      const rest = meals
        .filter((m) => !open.includes(m))
        .sort((x, y) => short(y) - short(x));
      const boosted = [...open, ...rest].some((target) => {
        const id = KCAL_BOOST.find(
          (x) =>
            basicFood(x) &&
            !blocked(x, input) &&
            /* 간식 둘은 같은 '간식' 끼니 — 둘 다 보고 겹치지 않게 */
            !meals.some(
              (m) => m.slot === target.slot && m.lines.some((l) => l.food.id === x)
            ) &&
            roomFor(target, x) &&
            /* 가장 적게 더해도 지금보다 멀어지지 않는 것 */
            amountStep(x) * basicFood(x)!.kcal < 2 * gap
        );
        if (!id) return false;
        /* 모자란 만큼에 가까운 양으로(한 단위까지) */
        const step = amountStep(id);
        const units = Math.round(gap / basicFood(id)!.kcal / step) * step;
        let amount = Math.min(1, Math.max(step, units));
        while (
          amount > step + 1e-9 &&
          !keepsRatio(target, amount * basicFood(id)!.kcal)
        )
          amount -= step;
        if (!keepsRatio(target, amount * basicFood(id)!.kcal)) return false;
        addLine(target, id, 'carb', amount);
        return true;
      });
      if (boosted) continue;
    }
    break;
  }

  /*
   * 던지는 날 점심(던지기 전 끼니)이 그날 가장 가벼운 끼니가 되면, 가장 무거운 끼니에서 한 걸음 빼고 점심에 한 걸음 더한다 — 밥 ·
   * 면 · 뺐던 곁들이(바나나 · 이온음료) · 담백한 단백질(같은 음식으로 옮김) 가운데, 하루 차이가 8%(이미 넘쳤으면 그만큼) 밖으로
   * 나가지 않고 단백질이 하한 밑으로 내려가지 않는 짝을 고른다. 넘친 날 줄이기에서 점심의 바나나를 빼 점심(345kcal)이 아침(370) ·
   * 저녁(396)보다 가벼웠고, 단백질이 모자란 끼니를 채우다 저녁의 닭가슴살이 두 팩이 되며 점심 두부가 깎였다.
   */
  const lunch = meals.find((m) => m.slot === 'lunch');
  const mains = meals.filter((m) => m.slot !== 'lunch' && m.slot !== 'snack');
  if (input.throwKind === 'today' && lunch && mains.length > 0) {
    type Undo = () => void;
    type Move = () => Undo | null;
    const kcalOf = (m: (typeof meals)[number]) => totalOf(m.lines).kcal;
    /** 점심이 가장 가벼운 다른 끼니보다 얼마나 무거운가 */
    const lead = () => kcalOf(lunch) - Math.min(...mains.map(kcalOf));
    const stepMove =
      (l: Line, dir: 1 | -1): Move =>
      () => {
        const amount = l.amount;
        return nudge(l, dir) ? () => (l.amount = amount) : null;
      };
    const setMove =
      (m: (typeof meals)[number], l: Line, amount: number, lo?: number): Move =>
      () => {
        const was = l.amount;
        if (!keepsRatio(m, (amount - was) * l.food.kcal, lo)) return null;
        l.amount = amount;
        return () => (l.amount = was);
      };
    for (let k = 0; k < 8 && lead() <= 0; k++) {
      const heavy = [...mains].sort((x, y) => kcalOf(y) - kcalOf(x))[0];
      const now = totalOf(all());
      const band = Math.max(left.kcal * 0.08, Math.abs(left.kcal - now.kcal));
      const floor = Math.min(now.protein, left.protein * proteinFloor);
      /* 단백질은 1.3배(이미 넘었으면 지금)에서 목표의 5% 넘게 더 늘리지 않는다 — 가래떡 반 줄의 2g 까지 막지 않게 */
      const ceiling = Math.max(now.protein, left.protein * 1.3) + left.protein * 0.05;
      const ups: Move[] = [
        ...lunch.lines
          .filter((l) => (l.role === 'carb' || l.role === 'dish') && l.amount > 0)
          .map((l) => stepMove(l, 1)),
        ...lunch.lines
          .filter((l) => l.role === 'side' && l.amount === 0)
          .map((l) => setMove(lunch, l, 1)),
        ...lunch.lines
          .filter(
            (l) => l.role === 'protein' && l.amount > 0 && leanness(l.food) >= SWAP_FOOD
          )
          .map((l) => stepMove(l, 1)),
        /* 밥 · 고구마가 한 끼 상한이면 바나나 · 밥 같은 것을 새로(하루 맞추기가 모자란 끼니에 더하는 것과 같은 목록) */
        ...KCAL_BOOST.filter(
          (x) =>
            basicFood(x) &&
            !blocked(x, input) &&
            !lunch.lines.some((l) => l.food.id === x) &&
            roomFor(lunch, x)
        ).map((x): Move => () => {
          const food = basicFood(x)!;
          const amount = amountStep(x);
          if (!keepsRatio(lunch, amount * food.kcal)) return null;
          lunch.lines.push({
            food,
            amount,
            role: 'carb',
            base: Math.min(1, amount * 2),
          });
          return () => void lunch.lines.pop();
        }),
        /* 무거운 끼니의 담백한 단백질을 같은 음식으로, 또는 기름 적은 단백질(닭가슴살 · 참치)을 새로 점심에 */
        ...[
          ...new Set([
            ...heavy.lines
              .filter(
                (l) =>
                  l.role === 'protein' && l.amount > 0 && leanness(l.food) >= SWAP_FOOD
              )
              .map((l) => l.food.id!),
            ...boostOrder.filter(
              (x) =>
                basicFood(x) &&
                !blocked(x, input) &&
                leanness(basicFood(x)!) >= LEAN_FOOD
            ),
          ]),
        ].map((id): Move => {
          const there = lunch.lines.find((x) => x.food.id === id);
          if (there) return stepMove(there, 1);
          return () => {
            const food = basicFood(id)!;
            const step = amountStep(id);
            if (groupMax(id, slotOthers('lunch')) < step) return null;
            if (!keepsRatio(lunch, step * food.kcal)) return null;
            lunch.lines.push({
              food,
              amount: step,
              role: 'protein',
              base: Math.min(1, step * 2),
            });
            return () => void lunch.lines.pop();
          };
        }),
      ];
      const downs: Move[] = [
        ...heavy.lines
          .filter((l) => l.role !== 'side' && l.amount > 0)
          .map((l) => stepMove(l, -1)),
        ...(heavy.lines.filter((l) => l.amount > 0).length > 1
          ? heavy.lines
              .filter((l) => l.role === 'side' && l.amount > 0)
              .map((l) => setMove(heavy, l, 0, SIDE_DROP_LO))
          : []),
      ];
      const leadNow = lead();
      let pick: { up?: Move; down?: Move; score: [number, number] } | null = null;
      for (const up of [undefined, ...ups]) {
        const undoUp = up ? up() : null;
        if (up && !undoUp) continue;
        for (const down of [undefined, ...downs]) {
          if (!up && !down) continue;
          const undoDown = down ? down() : null;
          if (down && !undoDown) continue;
          const t = totalOf(all());
          const after = lead();
          if (
            Math.abs(left.kcal - t.kcal) <= band + 1e-9 &&
            t.protein >= floor - 1e-9 &&
            t.protein <= ceiling + 1e-9 &&
            after > leadNow + 1e-9
          ) {
            /* 점심이 가장 가볍지 않게 되는 짝 가운데 하루 차이가 가장 작은 것, 없으면 점심이 가장 많이 따라잡는 것 */
            const score: [number, number] =
              after > 0 ? [1, -Math.abs(left.kcal - t.kcal)] : [0, after];
            if (
              !pick ||
              score[0] > pick.score[0] ||
              (score[0] === pick.score[0] && score[1] > pick.score[1])
            )
              pick = { up, down, score };
          }
          undoDown?.();
        }
        undoUp?.();
      }
      if (!pick) break;
      pick.up?.();
      pick.down?.();
    }
  }

  /*
   * 못 먹는 것이 많아 단백질 재료가 모두 상한에 닿았으면(소 · 닭 · 유제품을 못 먹고 211g) 묶은 목표가 아니라 실제로 넣은 양을
   * 말한다 — '211g 까지 넣었어요' 라면서 164g 이었다.
   */
  const got = totalOf(all()).protein;
  if (meals.length > 0 && got < left.protein * 0.85) {
    const line = `단백질은 넣을 수 있는 ${Math.round(got)}g 까지만 넣었어요.`;
    const i = reasons.findIndex((l) => l.startsWith('단백질은 남은 열량으로'));
    if (i >= 0) reasons[i] = line;
    else reasons.push(line);
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
      meals.map((m) => ({ slot: m.slot, template: m.template })),
      /* 두유 · 두부 간식에 '유제품 단백질'이라고 쓰지 않게 */
      meals.some(
        (m) =>
          m.slot === 'snack' &&
          m.lines.some((l) => l.amount > 0 && avoidsOf(l.food.id!).includes('dairy'))
      ),
      /* 더운 날 틀의 국 · 과일 · 음료(곁들이)가 kcal 줄이기로 다 빠졌으면 '수분과 나트륨을 챙겼어요' 라고 하지 않게 */
      meals.some(
        (m) =>
          m.template.tags.includes('heat') &&
          (!m.lines.some((l) => l.role === 'side') ||
            m.lines.some((l) => l.role === 'side' && l.amount > 0))
      )
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
function whyLines(
  input: PlanInput,
  meals: { slot: Slot; template: MealTemplate }[],
  snackDairy: boolean,
  heatKept: boolean
): string[] {
  const lines: string[] = [];
  const has = (s: Slot) => meals.some((m) => m.slot === s);
  /* 실제로 고른 틀의 꼬리표를 보고 말한다 — 던지기 전 틀이 없는 점심에 '탄수화물 위주로 가볍게'라고 하지 않게 */
  const tagged = (s: Slot, tag: Tag) =>
    meals.some((m) => m.slot === s && m.template.tags.includes(tag));
  if (input.throwKind === 'today') {
    const pre = tagged('lunch', 'pre');
    const rec = tagged('dinner', 'rec');
    if (pre && rec) {
      lines.push(
        '오늘 던지는 날이라 점심을 탄수화물 위주로 가볍게, 저녁은 회복식으로 짰어요.'
      );
    } else if (pre) {
      lines.push('오늘 던지는 날이라 점심을 탄수화물 위주로 가볍게 짰어요.');
    } else if (rec) {
      lines.push('오늘 던지는 날이라 저녁은 회복식으로 짰어요.');
    }
  } else if (input.throwKind === 'eve' && tagged('dinner', 'pre')) {
    lines.push('내일 등판이라 저녁에 탄수화물을 넉넉히 넣었어요.');
  } else if (input.throwKind === 'after') {
    const where = (['dinner', 'snack'] as const).filter((s) => tagged(s, 'rec'));
    if (where.length > 0) {
      lines.push(
        `던진 뒤라 ${where.map(mealLabel).join(' · ')}에 단백질과 탄수화물을 같이 넣었어요.`
      );
    }
  }
  if (lowAppetite(input)) {
    const soft =
      meals.filter((m) => m.template.tags.includes('light')).length * 2 >= meals.length;
    /* 간식이 없는 구성이라 입맛 없는 날 더한 간식 */
    const extra =
      has('snack') &&
      !PATTERN_SHARES[input.prefs.mealPattern].some(([s]) => s === 'snack');
    if (soft && extra) {
      lines.push('입맛이 없는 날이라 부드러운 것 위주로, 간식을 더해 양을 나눴어요.');
    } else if (soft) {
      lines.push('입맛이 없는 날이라 부드러운 것 위주로 짰어요.');
    } else if (extra) {
      lines.push('입맛이 없는 날이라 간식을 더해 양을 나눴어요.');
    }
  }
  if (highSoreness(input) && tagged('snack', 'bed')) {
    lines.push(
      `근육통이 많은 날이라 간식에 ${snackDairy ? '유제품 ' : ''}단백질을 한 번 더 넣었어요.`
    );
  }
  if (input.hot && heatKept)
    lines.push('더운 날 야외라 국 · 과일 · 음료로 수분과 나트륨을 챙겼어요.');
  if (input.place === 'gym' && (has('lunch') || has('snack')))
    lines.push('헬스장에서 먹을 점심 · 간식은 바로 먹는 것으로 골랐어요.');
  if (input.place === 'team' && has('lunch'))
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

/**
 * 식단 취향이 바뀌었을 때 오늘 계획에서 이제 못 먹는 음식 · 끈 보충식품을 뺀다(app/actions/nutrition.ts saveDietPrefs).
 * 계획 줄은 '먹었어요'를 누르면 그대로 기록되는 길이라, 취향을 바꾼 뒤에도 남아 있으면 못 먹는 것이 기록까지 간다(2026-10-04 검토).
 * 먹은 줄은 둔다(이미 기록됐다). 기본 목록 음식만 안다 — 사용자가 직접 바꿔 넣은 식약처 · 내 음식은 그대로.
 */
export function dropAvoided(
  items: PlanItem[],
  prefs: Pick<DietPrefs, 'avoid' | 'supplements'>
): { kept: PlanItem[]; removed: PlanItem[] } {
  const avoid = new Set(prefs.avoid);
  const kept: PlanItem[] = [];
  const removed: PlanItem[] = [];
  for (const it of items) {
    const bad =
      !it.done &&
      it.source === 'basic' &&
      (avoidsOf(it.sourceId).some((a) => avoid.has(a)) ||
        (!prefs.supplements && SUPPLEMENTS.has(it.sourceId)));
    (bad ? removed : kept).push(it);
  }
  return { kept, removed };
}

/**
 * 어제 · 그제 저장한 식단의 틀 열쇠 → PlanInput.recent(0 이 어제). 그날 계획이 없거나 틀 열쇠가 하나도 없으면 null(식단 짜기가
 * 같은 조건의 보통 날로 짜 본 것으로 대신한다). 서버 동작(makeMealPlan)이 DB 에서 읽은 줄을 넘긴다 — 날짜는 'YYYY-MM-DD'.
 */
export function recentTemplates(
  date: string,
  rows: { date: string; context: unknown }[]
): (string[] | null)[] {
  const day = Date.parse(`${date}T00:00:00.000Z`);
  return [1, 2].map((n) => {
    const key = new Date(day - n * 86_400_000).toISOString().slice(0, 10);
    const row = rows.find((r) => r.date === key);
    if (!row) return null;
    const keys = parsePlanContext(row.context)
      .meals.map((m) => m.template)
      .filter((k) => k.length > 0);
    return keys.length > 0 ? keys : null;
  });
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
