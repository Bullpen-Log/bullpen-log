'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate, isNutritionDate, keyOfDbDate } from '@/lib/nutrition/days';
import {
  effectiveGoal,
  effectiveRate,
  paceChoices,
  storedRate,
} from '@/lib/nutrition/age';
import { loadNutritionDay, recentWeightKg } from '@/lib/nutrition/load';
import { ageOn } from '@/lib/nutrition/targets';
import { STEP_KCAL, checkTargetWeight, planOnSave } from '@/lib/nutrition/weight-goal';
import { cleanDietPrefs } from '@/lib/nutrition/diet-prefs';
import {
  buildMealPlan,
  isPlace,
  parsePlanItems,
  recentTemplates,
} from '@/lib/nutrition/meal-plan';
import {
  COMBO_ITEMS_MAX,
  COMBO_MAX,
  COMBO_NAME_MAX,
  comboSignature,
  parseComboItems,
  type ComboItem,
} from '@/lib/nutrition/combos';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  FOOD_NAME_MAX,
  KCAL_MAX,
  MACRO_MAX,
  PROTEIN_G_MAX,
  PROTEIN_G_MIN,
  PROTEIN_MAX,
  PROTEIN_MIN,
  isActivityKey,
  isGoalKey,
  isMealKey,
  isSex,
  type EntrySource,
  ENTRY_SOURCES,
} from '@/lib/nutrition/meta';
import { cleanBarcode } from '@/lib/nutrition/barcode';

/**
 * 영양 탭의 저장.
 *
 * 폼이 아니라 화면이 바로 부른다 — 음식 하나를 담을 때마다 폼을 다시 그리면
 * 느리다. 화면은 먼저 바뀐 모습을 보여 주고(낙관적 갱신), 여기서 실패하면
 * 되돌린다. 그래서 결과는 성공/실패와 사람이 읽을 까닭만 돌려준다.
 *
 * 남의 기록을 고치지 못하게, 고치고 지울 때는 늘 userId 를 같이 걸어 찾는다.
 */

export type NutritionResult = { ok: true } | { ok: false; error: string };

const PATH = '/nutrition';
const NEED_LOGIN: NutritionResult = { ok: false, error: '로그인이 필요합니다.' };
const BAD_DATE: NutritionResult = {
  ok: false,
  error: '날짜가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.',
};

const SOURCES: EntrySource[] = ENTRY_SOURCES;

export type FoodInput = {
  source: EntrySource;
  sourceId: string | null;
  name: string;
  servingLabel: string | null;
  servingGrams: number | null;
  kcal: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function optMacro(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isNum(v) || v < 0 || v > MACRO_MAX) return undefined;
  return Math.round(v * 10) / 10;
}

/** 화면에서 온 음식 값을 믿지 않고 하나씩 본다. 틀리면 까닭을 글로 돌려준다. */
function cleanFood(raw: unknown): FoodInput | string {
  const f = raw as Partial<FoodInput> | null;
  if (!f || typeof f !== 'object') return '음식 정보가 없습니다.';

  const name = typeof f.name === 'string' ? f.name.trim() : '';
  if (!name) return '음식 이름을 적어 주세요.';
  if (name.length > FOOD_NAME_MAX)
    return `음식 이름은 ${FOOD_NAME_MAX}자까지 적을 수 있습니다.`;

  if (!f.source || !SOURCES.includes(f.source)) return '음식 출처가 올바르지 않습니다.';
  const sourceId =
    typeof f.sourceId === 'string' && f.sourceId.length <= 80 ? f.sourceId : null;
  /* 바코드 음식의 열쇠는 바코드 숫자 — 내 음식에서 같은 바코드를 다시 찾는 데 쓰므로 검사 숫자까지 맞아야 */
  if (f.source === 'barcode' && cleanBarcode(sourceId) !== sourceId)
    return '바코드 숫자가 맞지 않습니다.';

  if (!isNum(f.kcal) || f.kcal < 0 || f.kcal > KCAL_MAX) {
    return `칼로리는 0~${KCAL_MAX.toLocaleString('ko-KR')} 사이로 적어 주세요.`;
  }
  const carbs = optMacro(f.carbs);
  const protein = optMacro(f.protein);
  const fat = optMacro(f.fat);
  if (carbs === undefined || protein === undefined || fat === undefined) {
    return `탄수화물·단백질·지방은 0~${MACRO_MAX}g 사이로 적어 주세요.`;
  }

  const servingLabel =
    typeof f.servingLabel === 'string' && f.servingLabel.trim()
      ? f.servingLabel.trim().slice(0, 40)
      : null;
  const servingGrams =
    isNum(f.servingGrams) && f.servingGrams > 0 && f.servingGrams <= 5000
      ? Math.round(f.servingGrams * 10) / 10
      : null;

  return {
    source: f.source,
    sourceId: f.source === 'free' ? null : sourceId,
    name,
    servingLabel,
    servingGrams,
    kcal: Math.round(f.kcal * 10) / 10,
    carbs,
    protein,
    fat,
  };
}

/** 먹은 양은 0.05 인분 단위로 맞춘다 — 그램으로 적으면 긴 소수가 된다 */
function cleanAmount(v: unknown): number | null {
  if (!isNum(v)) return null;
  const a = Math.round(v * 20) / 20;
  return a >= AMOUNT_MIN && a <= AMOUNT_MAX ? a : null;
}

/** 끼니에 음식을 담는다. 여러 개를 한 번에 담을 수 있다(지난 끼니 불러오기). */
export async function addMealEntries(
  date: string,
  meal: string,
  items: { food: unknown; amount: unknown }[]
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!isNutritionDate(date)) return BAD_DATE;
  if (!isMealKey(meal)) return { ok: false, error: '끼니가 올바르지 않습니다.' };
  if (!Array.isArray(items) || items.length === 0 || items.length > 40) {
    return { ok: false, error: '담을 음식이 없습니다.' };
  }

  const rows = [];
  for (const item of items) {
    const food = cleanFood(item.food);
    if (typeof food === 'string') return { ok: false, error: food };
    const amount = cleanAmount(item.amount);
    if (amount === null) {
      return {
        ok: false,
        error: `먹은 양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
      };
    }
    rows.push({ userId: user.id, date: dbDate(date), meal, amount, ...food });
  }

  await prisma.mealEntry.createMany({ data: rows });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateMealAmount(
  id: string,
  amount: number
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  const clean = cleanAmount(amount);
  if (clean === null) {
    return {
      ok: false,
      error: `먹은 양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
    };
  }
  const { count } = await prisma.mealEntry.updateMany({
    where: { id: String(id), userId: user.id },
    data: { amount: clean },
  });
  if (count === 0) return { ok: false, error: '이미 지워진 기록입니다.' };
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 끼니 편집을 한 번에 저장한다 — 양 바꾸기 · 다른 끼니로 옮기기 · 지우기. 하나라도 틀리면 아무것도 안 바꾼다
 * (한 묶음으로 저장 — 절반만 저장되면 화면과 기록이 어긋난다).
 */
export async function editMealEntries(edits: unknown): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 60) {
    return { ok: false, error: '고칠 것이 없습니다.' };
  }
  const ops = [];
  for (const raw of edits) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : '';
    if (!id) return { ok: false, error: '고칠 기록을 찾지 못했습니다.' };
    if (e.remove === true) {
      ops.push(prisma.mealEntry.deleteMany({ where: { id, userId: user.id } }));
      continue;
    }
    const data: { amount?: number; meal?: string } = {};
    if (e.amount !== undefined) {
      const amount = cleanAmount(e.amount);
      if (amount === null) {
        return {
          ok: false,
          error: `먹은 양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
        };
      }
      data.amount = amount;
    }
    if (e.meal !== undefined) {
      if (!isMealKey(e.meal)) return { ok: false, error: '끼니가 올바르지 않습니다.' };
      data.meal = e.meal;
    }
    if (data.amount !== undefined || data.meal !== undefined) {
      ops.push(prisma.mealEntry.updateMany({ where: { id, userId: user.id }, data }));
    }
  }
  if (ops.length > 0) await prisma.$transaction(ops);
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 먹은 기록을 다른 음식으로 바꾼다 — 끼니 편집에서 음식 이름을 눌러 찾은 것. 끼니 · 날짜 · 기록의 이름(id)은 그대로,
 * 음식 값(찍어 둔 1인분 값)과 양만 바뀐다.
 */
export async function replaceMealEntry(
  id: string,
  raw: unknown,
  amount: unknown
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  const food = cleanFood(raw);
  if (typeof food === 'string') return { ok: false, error: food };
  const clean = cleanAmount(amount);
  if (clean === null) {
    return {
      ok: false,
      error: `먹은 양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
    };
  }
  const { count } = await prisma.mealEntry.updateMany({
    where: { id: String(id), userId: user.id },
    data: { ...food, amount: clean },
  });
  if (count === 0) return { ok: false, error: '이미 지워진 기록입니다.' };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteMealEntry(id: string): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  await prisma.mealEntry.deleteMany({ where: { id: String(id), userId: user.id } });
  revalidatePath(PATH);
  return { ok: true };
}

/** 체중(kg). null 이면 그날 적은 것을 지운다. */
export async function setWeight(
  date: string,
  kg: number | null
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!isNutritionDate(date)) return BAD_DATE;
  let weightKg: number | null = null;
  if (kg !== null) {
    if (!isNum(kg) || kg < 20 || kg > 250) {
      return { ok: false, error: '체중은 20~250kg 사이로 적어 주세요.' };
    }
    weightKg = Math.round(kg * 10) / 10;
  }

  await prisma.dailyNutrition.upsert({
    where: { userId_date: { userId: user.id, date: dbDate(date) } },
    update: { weightKg },
    create: { userId: user.id, date: dbDate(date), weightKg },
  });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 내 음식에 넣는다 — 직접 만든 음식, 또는 기본 목록·식약처 음식의 즐겨찾기.
 * 같은 음식을 두 번 즐겨찾기하면 새로 만들지 않는다.
 */
export async function saveUserFood(raw: unknown): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  const food = cleanFood(raw);
  if (typeof food === 'string') return { ok: false, error: food };

  const source = food.source === 'free' ? 'mine' : food.source;
  if (source !== 'mine' && food.sourceId) {
    const existing = await prisma.userFood.findFirst({
      where: { userId: user.id, source, sourceId: food.sourceId },
      select: { id: true },
    });
    if (existing) return { ok: true };
  }
  const count = await prisma.userFood.count({ where: { userId: user.id } });
  if (count >= 300) {
    return {
      ok: false,
      error: '내 음식은 300개까지 둘 수 있습니다. 안 쓰는 것을 지워 주세요.',
    };
  }

  await prisma.userFood.create({
    data: {
      userId: user.id,
      name: food.name,
      source,
      sourceId: source === 'mine' ? null : food.sourceId,
      servingLabel: food.servingLabel ?? '1인분',
      servingGrams: food.servingGrams,
      kcal: food.kcal,
      carbs: food.carbs,
      protein: food.protein,
      fat: food.fat,
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteUserFood(id: string): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  await prisma.userFood.deleteMany({ where: { id: String(id), userId: user.id } });
  revalidatePath(PATH);
  return { ok: true };
}

/** 즐겨찾기 풀기 — 원래 음식의 열쇠로 찾아 지운다 */
export async function unfavoriteFood(
  source: string,
  sourceId: string
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (source !== 'basic' && source !== 'mfds' && source !== 'barcode')
    return { ok: false, error: '잘못된 요청입니다.' };
  await prisma.userFood.deleteMany({
    where: { userId: user.id, source, sourceId: String(sourceId) },
  });
  revalidatePath(PATH);
  return { ok: true };
}

/* ─────────────────────────── 식단 짜기(lib/nutrition/meal-plan.ts) ─────────────────────────── */

/**
 * 오늘 식단을 짠다(다시 짜기도 이것). 화면이 보낸 것은 그날 환경(훈련 장소 · 더운 날 야외)과 '다른 식단으로' 횟수뿐 —
 * 목표 · 취향 · 신호 · 이미 먹은 것은 서버가 다시 읽는다(화면이 보낸 숫자로 짜지 않는다). 계획은 먹은 기록과 따로 둔다.
 */
export async function makeMealPlan(
  date: string,
  options: { place: unknown; hot: unknown; variant: unknown }
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (date !== toDateKey(new Date())) {
    return { ok: false, error: '식단은 오늘 것만 짤 수 있어요.' };
  }
  if (!isPlace(options?.place))
    return { ok: false, error: '훈련 장소를 다시 골라 주세요.' };
  const variant =
    isNum(options.variant) && options.variant >= 0 && options.variant < 1000
      ? Math.floor(options.variant)
      : 0;
  const hot = options.hot === true;

  /*
   * 어제 · 그제 실제로 짠 식단 — 그 틀을 피해서 짠다. 안 넘기면 어제 '다른 식단으로'를 눌렀거나 던지는 날이었던 다음 날, 짜 본
   * 어제와 실제 어제가 달라 약 12% 가 어제와 같은 틀이었다(클라우드 식단 작업의 남은 일, 2026-10-04).
   */
  const today0 = dbDate(date);
  const [day, pastPlans] = await Promise.all([
    loadNutritionDay(user, date),
    prisma.mealPlan.findMany({
      where: {
        userId: user.id,
        date: {
          gte: new Date(today0.getTime() - 2 * 86_400_000),
          lt: today0,
        },
      },
      select: { date: true, context: true },
    }),
  ]);
  const eaten = new Map<string, { kcal: number; protein: number }>();
  for (const e of day.entries) {
    const sum = eaten.get(e.meal) ?? { kcal: 0, protein: 0 };
    sum.kcal += e.kcal * e.amount;
    sum.protein += (e.protein ?? 0) * e.amount;
    eaten.set(e.meal, sum);
  }
  const plan = buildMealPlan({
    date,
    seed: user.id,
    variant,
    targets: { kcal: day.targets.kcal, protein: day.targets.protein },
    goal: day.targets.goal,
    ageBand: day.targets.ageBand,
    prefs: day.prefs,
    place: options.place,
    hot,
    throwKind: day.planSignals?.throwKind ?? null,
    appetite: day.planSignals?.appetite ?? null,
    soreness: day.planSignals?.soreness ?? null,
    eaten: [...eaten].flatMap(([meal, v]) => (isMealKey(meal) ? [{ meal, ...v }] : [])),
    recent: recentTemplates(
      date,
      pastPlans.map((p) => ({ date: keyOfDbDate(p.date), context: p.context }))
    ),
  });
  const context = {
    place: options.place,
    hot,
    variant,
    reasons: plan.reasons,
    meals: plan.meals,
    target: plan.target,
  };
  await prisma.mealPlan.upsert({
    where: { userId_date: { userId: user.id, date: dbDate(date) } },
    update: { items: plan.items, context },
    create: { userId: user.id, date: dbDate(date), items: plan.items, context },
  });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 계획 줄을 먹었다 — 그 값 그대로 먹은 기록(MealEntry)을 만들고 계획 줄은 '먹음'으로. 한 묶음으로 저장한다.
 * 이미 먹은 줄 · 없는 줄은 건너뛴다(두 번 눌러도 한 번만 기록된다).
 */
export async function eatPlanItems(
  date: string,
  keys: unknown
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!isNutritionDate(date)) return BAD_DATE;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 80) {
    return { ok: false, error: '먹은 것을 다시 골라 주세요.' };
  }
  const where = { userId_date: { userId: user.id, date: dbDate(date) } };
  const row = await prisma.mealPlan.findUnique({ where, select: { items: true } });
  if (!row) return { ok: false, error: '식단이 없어요. 새로고침해 주세요.' };
  const items = parsePlanItems(row.items);
  const want = new Set(keys.filter((k): k is string => typeof k === 'string'));
  const eat = items.filter((i) => want.has(i.key) && !i.done);
  if (eat.length === 0) return { ok: true };

  const rows = [];
  for (const i of eat) {
    const food = cleanFood({
      source: i.source,
      sourceId: i.sourceId || null,
      name: i.name,
      servingLabel: i.servingLabel,
      servingGrams: i.servingGrams,
      kcal: i.kcal,
      carbs: i.carbs,
      protein: i.protein,
      fat: i.fat,
    });
    const amount = cleanAmount(i.amount);
    if (typeof food === 'string' || amount === null) continue;
    rows.push({ userId: user.id, date: dbDate(date), meal: i.meal, amount, ...food });
  }
  const done = new Set(eat.map((i) => i.key));
  await prisma.$transaction([
    prisma.mealEntry.createMany({ data: rows }),
    prisma.mealPlan.update({
      where,
      data: { items: items.map((i) => (done.has(i.key) ? { ...i, done: true } : i)) },
    }),
  ]);
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 계획 줄을 다른 음식으로 바꾼다 — 끼니 칸에서 식단 줄의 이름을 눌러 찾은 음식(기본 · 식약처 · 내 음식 · 직접 입력).
 * 끼니와 줄 이름(key)은 그대로라 편집 중인 다른 줄에 영향이 없다. 이미 먹은 줄은 못 바꾼다(그건 먹은 기록에서 바꾼다).
 */
export async function replacePlanItem(
  date: string,
  key: string,
  raw: unknown,
  amount: unknown
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!isNutritionDate(date)) return BAD_DATE;
  const food = cleanFood(raw);
  if (typeof food === 'string') return { ok: false, error: food };
  const clean = cleanAmount(amount);
  if (clean === null) {
    return {
      ok: false,
      error: `양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
    };
  }
  const where = { userId_date: { userId: user.id, date: dbDate(date) } };
  const row = await prisma.mealPlan.findUnique({ where, select: { items: true } });
  if (!row) return { ok: false, error: '식단이 없어요. 새로고침해 주세요.' };
  const items = parsePlanItems(row.items);
  const target = items.find((i) => i.key === String(key));
  if (!target || target.done) {
    return { ok: false, error: '이미 먹었거나 없는 식단이에요. 새로고침해 주세요.' };
  }
  await prisma.mealPlan.update({
    where,
    data: {
      items: items.map((i) =>
        i.key === target.key
          ? {
              ...i,
              source: food.source,
              sourceId: food.sourceId ?? '',
              name: food.name,
              servingLabel: food.servingLabel ?? '1인분',
              servingGrams: food.servingGrams,
              kcal: food.kcal,
              carbs: food.carbs,
              protein: food.protein,
              fat: food.fat,
              amount: clean,
            }
          : i
      ),
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

/** 계획 줄 고치기 — 끼니 편집의 '완료'에서 양 바꾸기 · 빼기(아직 안 먹은 줄만) */
export async function editPlanItems(
  date: string,
  edits: unknown
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!isNutritionDate(date)) return BAD_DATE;
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 80) {
    return { ok: false, error: '고칠 것이 없습니다.' };
  }
  const where = { userId_date: { userId: user.id, date: dbDate(date) } };
  const row = await prisma.mealPlan.findUnique({ where, select: { items: true } });
  if (!row) return { ok: false, error: '식단이 없어요. 새로고침해 주세요.' };
  const by = new Map<string, Record<string, unknown>>();
  for (const raw of edits) {
    const e = (raw ?? {}) as Record<string, unknown>;
    if (typeof e.key === 'string') by.set(e.key, e);
  }
  const next = [];
  for (const i of parsePlanItems(row.items)) {
    const e = by.get(i.key);
    if (!e || i.done) {
      next.push(i);
      continue;
    }
    if (e.remove === true) continue;
    if (e.amount !== undefined) {
      const amount = cleanAmount(e.amount);
      if (amount === null) {
        return {
          ok: false,
          error: `양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
        };
      }
      next.push({ ...i, amount });
    } else next.push(i);
  }
  await prisma.mealPlan.update({ where, data: { items: next } });
  revalidatePath(PATH);
  return { ok: true };
}

/** 짠 식단 지우기 — 이미 먹어서 기록이 된 것은 그대로 남는다 */
export async function clearMealPlan(date: string): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (!isNutritionDate(date)) return BAD_DATE;
  await prisma.mealPlan.deleteMany({ where: { userId: user.id, date: dbDate(date) } });
  revalidatePath(PATH);
  return { ok: true };
}

/* ─────────────────────────── 식단 취향(lib/nutrition/diet-prefs.ts) ─────────────────────────── */

/**
 * 식단 취향 · 시즌 단계 · 목표 날짜 저장. 칼로리 계획(목표 · 속도 · 조정)과 따로 저장한다 — 이것을 바꿔도
 * 체중 흐름을 견주는 계획 시작일(planSince)이 다시 시작되지 않는다.
 */
export async function saveDietPrefs(raw: unknown): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  const prefs = cleanDietPrefs(raw, toDateKey(new Date()));
  if (typeof prefs === 'string') return { ok: false, error: prefs };
  const data = {
    goalEndDate: prefs.goalEndDate ? dbDate(prefs.goalEndDate) : null,
    seasonPhase: prefs.seasonPhase,
    dietStyle: prefs.dietStyle,
    mealPattern: prefs.mealPattern,
    avoidFoods: prefs.avoid,
    allowSupplements: prefs.supplements,
  };
  await prisma.nutritionProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });
  revalidatePath(PATH);
  return { ok: true };
}

/* ─────────────────────────── 자주 먹는 조합(lib/nutrition/combos.ts) ─────────────────────────── */

export type ComboResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * 조합 저장. 음식 값은 담을 때와 같은 검사(cleanFood · cleanAmount)를 거친다.
 * 같은 조합(음식과 양이 같음)이 이미 있으면 새로 만들지 않고 그것을 돌려준다 — 저장을 두 번 눌러도 하나다.
 */
export async function saveMealCombo(input: {
  name: unknown;
  meal: unknown;
  items: unknown;
}): Promise<ComboResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: '조합 이름을 적어 주세요.' };
  if (name.length > COMBO_NAME_MAX) {
    return {
      ok: false,
      error: `조합 이름은 ${COMBO_NAME_MAX}자까지 적을 수 있습니다.`,
    };
  }
  const meal = isMealKey(input.meal) ? input.meal : null;
  const raw = input.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: '조합에 넣을 음식이 없습니다.' };
  }
  if (raw.length > COMBO_ITEMS_MAX) {
    return {
      ok: false,
      error: `조합에는 음식을 ${COMBO_ITEMS_MAX}가지까지 넣을 수 있습니다.`,
    };
  }
  const items: ComboItem[] = [];
  for (const r of raw) {
    const food = cleanFood(r);
    if (typeof food === 'string') return { ok: false, error: food };
    const amount = cleanAmount((r as { amount?: unknown } | null)?.amount);
    if (amount === null) {
      return {
        ok: false,
        error: `양은 ${AMOUNT_MIN}~${AMOUNT_MAX}인분 사이로 적어 주세요.`,
      };
    }
    items.push({ ...food, amount });
  }

  const existing = await prisma.mealCombo.findMany({
    where: { userId: user.id },
    select: { id: true, items: true },
  });
  const sig = comboSignature(items);
  const same = existing.find((c) => comboSignature(parseComboItems(c.items)) === sig);
  if (same) return { ok: true, id: same.id };
  if (existing.length >= COMBO_MAX) {
    return {
      ok: false,
      error: `조합은 ${COMBO_MAX}개까지 둘 수 있습니다. 안 쓰는 것을 지워 주세요.`,
    };
  }

  const row = await prisma.mealCombo.create({
    data: { userId: user.id, name, meal, items },
    select: { id: true },
  });
  revalidatePath(PATH);
  return { ok: true, id: row.id };
}

export async function deleteMealCombo(id: string): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  await prisma.mealCombo.deleteMany({ where: { id: String(id), userId: user.id } });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 조합을 담았다 — 횟수만 센다(자주 담은 것을 위로). 음식은 화면이 addMealEntries 로 따로 담는다.
 * 화면을 다시 그리지 않는다(revalidatePath 없음) — 담기가 이미 그 일을 하고, 세는 것은 다음에 열 때 보이면 된다.
 */
export async function markComboUsed(id: string): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  await prisma.mealCombo.updateMany({
    where: { id: String(id), userId: user.id },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  return { ok: true };
}

/*
 * 성별은 여기서 고르지 않는다 — 계정(User.sex)에 있고 내 정보에서 고친다.
 * NutritionProfile.sex 칸은 스키마에서 뺐다(2026-10-03) — DB 칸도 곧 지운다.
 *
 * 다만 배포 전에 열어 둔 영양 화면은 아직 성별 칸을 보낸다(legacySex). 계정의
 * 성별이 비어 있을 때만 그 값으로 채운다 — 버리면 고른 것이 사라지고, 비어 있지
 * 않은데 덮으면 내 정보에서 새로 고른 것을 옛 화면의 값이 되돌린다.
 */
export type ProfileInput = {
  goal: string;
  activity: string;
  proteinPerKg: number;
  kcalTarget: number | null;
  /** 직접 정한 하루 단백질(g). null 은 계산으로. 배포 전에 열어 둔 화면은 안 보낸다(undefined → 저장된 값 그대로) */
  proteinTargetG?: number | null;
  /*
   * 체중 목표(lib/nutrition/weight-goal.ts). 배포 전에 열어 둔 화면은 이 칸들을 안 보낸다(undefined) —
   * 그때는 목표가 그대로면 저장된 값을 두고, 목표를 바꿨으면 비운다.
   *
   * 조정(kcalAdjust)과 계획 시작일(planSince)은 받지 않는다 — 서버가 정한다. 조정은 체중 카드의 단추
   * (applyWeightStep)로만 움직이고, 여기서는 지우는 것만 된다(clearAdjust).
   */
  /** 목표 체중(kg). null 은 안 정함 */
  targetWeightKg?: number | null;
  /** 주당 속도(kg). null 은 나이별 기본 속도 */
  weeklyRateKg?: number | null;
  /** 받아들여 둔 체중 흐름 조정을 지운다 */
  clearAdjust?: boolean;
};

export async function saveNutritionProfile(
  input: ProfileInput
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;

  if (!isGoalKey(input.goal)) return { ok: false, error: '목표를 다시 골라 주세요.' };
  if (!isActivityKey(input.activity))
    return { ok: false, error: '평소 움직임을 다시 골라 주세요.' };
  if (
    !isNum(input.proteinPerKg) ||
    input.proteinPerKg < PROTEIN_MIN ||
    input.proteinPerKg > PROTEIN_MAX
  ) {
    return {
      ok: false,
      error: `단백질은 체중 1kg 당 ${PROTEIN_MIN}~${PROTEIN_MAX}g 사이로 골라 주세요.`,
    };
  }
  let kcalTarget: number | null = null;
  if (input.kcalTarget !== null) {
    if (
      !isNum(input.kcalTarget) ||
      input.kcalTarget < 1000 ||
      input.kcalTarget > 6000
    ) {
      return { ok: false, error: '하루 칼로리는 1,000~6,000 사이로 적어 주세요.' };
    }
    kcalTarget = Math.round(input.kcalTarget);
  }
  let proteinTargetG: number | null | undefined = undefined;
  if (input.proteinTargetG === null) proteinTargetG = null;
  else if (input.proteinTargetG !== undefined) {
    if (
      !isNum(input.proteinTargetG) ||
      input.proteinTargetG < PROTEIN_G_MIN ||
      input.proteinTargetG > PROTEIN_G_MAX
    ) {
      return {
        ok: false,
        error: `하루 단백질은 ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g 사이로 적어 주세요.`,
      };
    }
    proteinTargetG = Math.round(input.proteinTargetG);
  }

  /* ── 체중 목표: 속도 · 목표 체중은 나이와 지금 체중으로 본다 ── */
  const prev = await prisma.nutritionProfile.findUnique({ where: { userId: user.id } });
  const today = toDateKey(new Date());
  const age = ageOn(user.birthDate, today);
  /* 어린이의 감량은 유지로 셈한다 — 속도와 목표 체중도 그 목표로 본다 */
  const goal = effectiveGoal(input.goal, age);
  const sameGoal = prev !== null && prev.goal === input.goal;
  const refKg = (await recentWeightKg(user.id, today)) ?? user.weightKg;

  let weeklyRateKg: number | null = null;
  if (input.weeklyRateKg === undefined) {
    weeklyRateKg = sameGoal ? prev.weeklyRateKg : null;
  } else if (isNum(input.weeklyRateKg)) {
    /*
     * 고를 수 있는 속도이거나, 이미 저장해 둔 속도 그대로(체중이 70kg 아래로 내려가도 다른 저장이 막히지 않게)일
     * 때만 받는다. 그 밖은 거절하지 않고 기본 속도로 둔다 — 지난 날을 보며 연 목표 창은 그날 나이로 셈한 속도를
     * 보내는데(만 18세 생일 전날의 0.2), 거절하면 고를 칸도 없는 화면에서 저장이 통째로 막힌다.
     * 어느 쪽이든 storedRate 가 오늘 나이의 선택지 안으로 당긴다.
     */
    const kept = sameGoal && prev.weeklyRateKg === input.weeklyRateKg;
    const picked = effectiveRate(input.weeklyRateKg, age, goal);
    const usable =
      kept || (picked !== null && paceChoices(age, goal, refKg).includes(picked));
    weeklyRateKg = storedRate(usable ? input.weeklyRateKg : null, age, goal);
  }

  let targetWeightKg: number | null = null;
  if (input.targetWeightKg === undefined) {
    targetWeightKg = sameGoal ? prev.targetWeightKg : null;
  } else {
    const checked = checkTargetWeight(
      goal,
      age,
      refKg,
      user.heightCm,
      input.targetWeightKg,
      sameGoal ? prev.targetWeightKg : null
    );
    if (!checked.ok) return checked;
    targetWeightKg = checked.kg;
  }

  /* 칼로리 계획이 바뀌면 조정은 0 으로, 계획은 오늘부터 — 목표 창의 미리보기와 같은 규칙 */
  const plan = planOnSave(
    prev && {
      goal: isGoalKey(prev.goal) ? prev.goal : 'maintain',
      activity: isActivityKey(prev.activity) ? prev.activity : 'mid',
      weeklyRateKg: prev.weeklyRateKg,
      kcalTarget: prev.kcalTarget,
      kcalAdjust: prev.kcalAdjust,
    },
    {
      goal: input.goal,
      activity: input.activity,
      weeklyRateKg,
      kcalTarget,
      clearAdjust: input.clearAdjust === true,
    },
    age
  );

  const data = {
    goal: input.goal,
    activity: input.activity,
    proteinPerKg: Math.round(input.proteinPerKg * 10) / 10,
    kcalTarget,
    /* 안 보낸 화면(undefined)은 저장된 값을 건드리지 않는다 */
    ...(proteinTargetG !== undefined ? { proteinTargetG } : {}),
    targetWeightKg,
    weeklyRateKg,
    kcalAdjust: plan.kcalAdjust,
    /*
     * 계획이 안 바뀐 저장(단백질만 고침)은 시작일을 그대로 둔다. 시작일이 없던 옛 줄은 여기서 '마지막으로
     * 저장한 날'로 굳힌다 — 이 저장이 updatedAt 을 오늘로 밀면 읽는 쪽(toProfile)이 오늘을 시작일로 읽는다.
     */
    ...(plan.restart
      ? { planSince: dbDate(today) }
      : prev && prev.planSince === null
        ? { planSince: dbDate(toDateKey(prev.updatedAt)) }
        : {}),
  };
  await prisma.nutritionProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  const legacySex = (input as { sex?: unknown }).sex;
  if (user.sex === null && isSex(legacySex)) {
    await prisma.user.update({ where: { id: user.id }, data: { sex: legacySex } });
    /* 내 정보 창의 성별도 따라 바뀌게(그 값은 레이아웃이 내려보낸다) */
    revalidatePath('/', 'layout');
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 체중 흐름을 보고 권한 한 걸음(하루 ±100kcal)을 받아들인다 — 체중 카드의 단추.
 *
 * 화면이 보낸 숫자를 믿지 않는다. 서버가 오늘의 권유를 다시 셈해 같은 걸음일 때만 저장한다: 그래야 한도를
 * 넘는 값이나 권하지 않은 걸음이 들어오지 못하고, 두 번 눌러도 한 번만 움직인다(저장하면 계획이 오늘부터
 * 새로 시작되어 권유가 사라진다).
 */
export async function applyWeightStep(step: number): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (step !== STEP_KCAL && step !== -STEP_KCAL) {
    return { ok: false, error: '잘못된 요청입니다.' };
  }
  const today = toDateKey(new Date());
  const day = await loadNutritionDay(user, today);
  const suggestion = day.plan.suggestion;
  if (!suggestion || suggestion.step !== step) {
    return { ok: false, error: '이미 반영됐어요. 새로고침해 주세요.' };
  }
  /* 권유는 목표를 저장한 사람에게만 나온다 — 줄이 늘 있다. 그사이 지워졌으면 아무것도 바꾸지 않는다 */
  const { count } = await prisma.nutritionProfile.updateMany({
    where: { userId: user.id },
    data: { kcalAdjust: suggestion.nextAdjust, planSince: dbDate(today) },
  });
  if (count === 0) return { ok: false, error: '목표를 먼저 저장해 주세요.' };
  revalidatePath(PATH);
  return { ok: true };
}
