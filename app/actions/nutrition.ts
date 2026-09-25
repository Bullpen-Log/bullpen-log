'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { dbDate, isNutritionDate } from '@/lib/nutrition/days';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  FOOD_NAME_MAX,
  KCAL_MAX,
  MACRO_MAX,
  PROTEIN_MAX,
  PROTEIN_MIN,
  isActivityKey,
  isGoalKey,
  isMealKey,
  isSex,
  type EntrySource,
} from '@/lib/nutrition/meta';

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

const SOURCES: EntrySource[] = ['basic', 'mfds', 'mine', 'free'];

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
  if (source !== 'basic' && source !== 'mfds')
    return { ok: false, error: '잘못된 요청입니다.' };
  await prisma.userFood.deleteMany({
    where: { userId: user.id, source, sourceId: String(sourceId) },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export type ProfileInput = {
  sex: string | null;
  goal: string;
  activity: string;
  proteinPerKg: number;
  kcalTarget: number | null;
};

export async function saveNutritionProfile(
  input: ProfileInput
): Promise<NutritionResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;

  const sex = input.sex === null ? null : isSex(input.sex) ? input.sex : undefined;
  if (sex === undefined) return { ok: false, error: '성별을 다시 골라 주세요.' };
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

  const data = {
    sex,
    goal: input.goal,
    activity: input.activity,
    proteinPerKg: Math.round(input.proteinPerKg * 10) / 10,
    kcalTarget,
  };
  await prisma.nutritionProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });
  revalidatePath(PATH);
  return { ok: true };
}
