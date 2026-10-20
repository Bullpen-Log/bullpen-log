'use server';

import { appNow } from '@/lib/clock';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import {
  APPETITE_LEVELS,
  MEAL_AMOUNTS,
  NO_WORKOUT_KIND,
  SKIPPABLE_MEALS,
  normalizePreferredParts,
  parseThrowPlan,
  pickWorkoutKind,
  validateCheckinDate,
} from '@/lib/checkin';
import { availableParts } from '@/lib/report/today-pick';
import { goalForUnchosen, validFocus } from '@/lib/report/personalize';
import { visibleExercises } from '@/lib/library-cache';

/**
 * 탭에서 하루 한 번 묻는 카드 셋(체크인 3판, 2026-10-13) — 체크인에서 뺀 질문들의 새 집.
 *
 *   트레이닝  오늘 하고 싶은 운동 종류 · 부위  → DailyTrainingSetup.preferredWorkout / preferredParts
 *   영양      오늘 식욕 · 끼니 양 · 걸른 끼니   → DailyNutrition.appetite / mealAmount / skippedMeals (+ answeredAt)
 *   투구 기록 오늘 던지는 일정                → DailyCheckin.throwPlan (칸은 그대로 — 읽는 곳 다섯이 다 거기를 본다)
 *
 * 체크인은 컨디션 · 수면의 질 · 불편한 곳 · 메모만 받는다(lib/checkin.ts 신호 셋). 답은 그 탭에 들어왔을 때 한 번 묻고,
 * 카드 셸(components/day-card.tsx)이 '나중에'를 그날 하루 기억한다. 저장은 모두 오늘 · 어제 · 내일(validateCheckinDate) 안에서만.
 */

export type DayCardResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** 오늘 체크인이 없어 저장할 자리가 없다 — 카드가 '체크인하기'를 보인다 */
      needCheckin?: boolean;
    };

const NEED_LOGIN = { ok: false, error: '로그인이 필요해요.' } as const;
const BAD_DATE = {
  ok: false,
  error: '날짜가 올바르지 않아요. 새로고침한 뒤 다시 해 주세요.',
} as const;

const dayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);

/**
 * 트레이닝 탭 — 오늘 하고 싶은 운동 종류(파워 · 웨이트 · 회복 · 추천대로) · 부위.
 *
 * '추천대로'는 답하지 않은 것이 아니라 "앱이 고르게" 한 답이라 글자 그대로(NO_WORKOUT_KIND) 저장한다 — null 은 '아직 안 물었다'.
 * 읽는 쪽(lib/report/gather.ts)은 pickWorkoutKind 로 걸러 null 로 본다. 부위는 라이브러리에 실제로 있는 것만(normalizePreferredParts).
 * 장비 칸은 비워 둔다 — 빈 목록은 '안 고름'이라 가진 것을 다 쓴다(lib/report/equipment.ts equipmentForToday).
 */
export async function saveTrainingPrefs(input: {
  date: string;
  workout: string | null;
  parts: string[];
  /**
   * 오늘 할 부위(GOAL_FOCUSES 열쇠 — 하체 · 상체 · 상체 밀기 · 상체 당기기, 2026-10-20 '직접 고르기'에서 옮김). 칸을 새로 안 만들고 preferredParts
   * 맨 앞에 열쇠로 담는다 — 읽는 쪽은 todayPrefsOf(lib/report/facts.ts)가 갈라 낸다. 고른 종류의 목표에 없는 부위는 버린다.
   */
  focus?: string | null;
}): Promise<DayCardResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (typeof input.date !== 'string' || !validateCheckinDate(input.date))
    return BAD_DATE;
  const library = await visibleExercises();
  const workout = pickWorkoutKind(input.workout);
  const parts = normalizePreferredParts(
    Array.isArray(input.parts) ? input.parts.map(String) : [],
    availableParts(library)
  );
  const focus = validFocus(goalForUnchosen(workout), typeof input.focus === 'string' ? input.focus : null);
  const date = dayOf(input.date);
  const saved = {
    preferredWorkout: workout ?? NO_WORKOUT_KIND,
    preferredParts: workout === '회복' || !focus ? parts : [focus, ...parts],
  };
  await prisma.dailyTrainingSetup.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: saved,
    create: { userId: user.id, date, availableEquipment: [], ...saved },
  });
  revalidatePath('/training');
  revalidatePath('/today');
  revalidatePath('/');
  return { ok: true };
}

/**
 * 영양 탭 — 오늘 식욕(1~5) · 끼니 양 · 걸른 끼니. 아무것도 안 골라도 '답했다'(answeredAt)로 둔다 — 카드가 다시 묻지 않게.
 * 범위 밖은 안 적은 것으로(화면으로는 못 만든다). 홈 영양 카드 · 영양 조언 · 식단 짜기가 읽는다(lib/nutrition/advice-load.ts · load.ts).
 */
export async function saveNutritionCheckin(input: {
  date: string;
  appetite: number | null;
  mealAmount: string | null;
  skippedMeals: string[];
}): Promise<DayCardResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (typeof input.date !== 'string' || !validateCheckinDate(input.date))
    return BAD_DATE;
  const appetite =
    typeof input.appetite === 'number' &&
    Number.isInteger(input.appetite) &&
    input.appetite >= 1 &&
    input.appetite <= APPETITE_LEVELS.length
      ? input.appetite
      : null;
  const mealAmount =
    typeof input.mealAmount === 'string' &&
    (MEAL_AMOUNTS as readonly string[]).includes(input.mealAmount)
      ? input.mealAmount
      : null;
  const skippedMeals = [
    ...new Set(
      (Array.isArray(input.skippedMeals) ? input.skippedMeals : []).map(String)
    ),
  ].filter((k) => SKIPPABLE_MEALS.some((m) => m.key === k));
  const date = dayOf(input.date);
  const saved = { appetite, mealAmount, skippedMeals, answeredAt: appNow() };
  await prisma.dailyNutrition.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: saved,
    create: { userId: user.id, date, ...saved },
  });
  revalidatePath('/nutrition');
  revalidatePath('/');
  return { ok: true };
}

/**
 * 투구 기록 탭 — 오늘 던지는 일정(lib/checkin.ts THROW_PLANS). null 은 지우기('모름').
 *
 * 칸은 체크인 줄(DailyCheckin.throwPlan)에 그대로 있다 — 매일 일정 · 투구 계획 · 프로그램 · 영양 · 암케어가 모두 그 줄을
 * 읽는다. 체크인 줄은 컨디션 없이 만들 수 없어, 오늘 체크인이 없으면 저장하지 않고 '먼저 체크인'을 돌려준다(needCheckin).
 */
export async function setThrowPlan(input: {
  date: string;
  plan: string | null;
}): Promise<DayCardResult> {
  const user = await getCurrentUser();
  if (!user) return NEED_LOGIN;
  if (typeof input.date !== 'string' || !validateCheckinDate(input.date))
    return BAD_DATE;
  const plan = parseThrowPlan(input.plan);
  const updated = await prisma.dailyCheckin.updateMany({
    where: { userId: user.id, date: dayOf(input.date) },
    data: { throwPlan: plan },
  });
  if (updated.count === 0) {
    return {
      ok: false,
      needCheckin: true,
      error: '오늘 체크인을 먼저 남기면 저장돼요.',
    };
  }
  revalidatePath('/videos');
  revalidatePath('/training');
  revalidatePath('/today');
  revalidatePath('/nutrition');
  revalidatePath('/', 'layout');
  return { ok: true };
}
