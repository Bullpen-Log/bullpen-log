'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { isNutritionDate } from '@/lib/nutrition/days';
import { loadNutritionDay, type NutritionDay } from '@/lib/nutrition/load';
import { toDateKey } from '@/lib/pitch-stats';

/** 앱 '목표 · 통계' 화면이 그리는 칸 — 웹 영양 탭 통계 열(체중 카드 · 최근 7일 · 내 계획)과 목표 창이 읽는 것만 */
export type AppNutritionStats = Pick<
  NutritionDay,
  | 'date'
  | 'profile'
  | 'prefs'
  | 'hasProfile'
  | 'onboarded'
  | 'targets'
  | 'weightKg'
  | 'weightFrom'
  | 'week'
  | 'weights'
  | 'plan'
  | 'body'
  | 'todayBody'
> & { today: string };

/**
 * 아이폰 앱 영양 '목표 · 통계'(native/src/app/nutrition/stats.tsx) — 웹 영양 탭과 같은 그날 자료(lib/nutrition/load.ts loadNutritionDay)에서
 * 통계 열 · 목표 창이 쓰는 칸만. 목표 저장 · 체중 권유 단추는 웹과 같은 서버 동작(nutrition.saveNutritionProfile · saveDietPrefs ·
 * applyWeightStep)을 앱이 바로 부른다. date 가 없거나 틀리거나 오늘 뒤면 오늘. 로그인 · 첫 설정 전이면 { ok: false, to }.
 * /api/rpc/app-nutrition.loadAppNutritionStats 로 부른다.
 */
export async function loadAppNutritionStats(
  date: string | null
): Promise<({ ok: true } & AppNutritionStats) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).nutrition) return { ok: false, to: SETUP_PATH.nutrition };
  const today = toDateKey(appNow());
  const day = await loadNutritionDay(user, typeof date === 'string' && isNutritionDate(date) ? date : today);
  return {
    ok: true,
    today,
    date: day.date,
    profile: day.profile,
    prefs: day.prefs,
    hasProfile: day.hasProfile,
    onboarded: day.onboarded,
    targets: day.targets,
    weightKg: day.weightKg,
    weightFrom: day.weightFrom,
    week: day.week,
    weights: day.weights,
    plan: day.plan,
    body: day.body,
    todayBody: day.todayBody,
  };
}
