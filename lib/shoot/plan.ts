import data from '@/lib/shoot/plan-data.json';
import type { PlanItem, PlanWeek, ShootPlan } from '@/lib/shoot/schedule';

/**
 * 고정해 둔 촬영 계획(scripts/shoot-plan.mts 가 뽑은 lib/shoot/plan-data.json).
 *
 * 서버 쪽에서만 읽는다 — 136KB 라 화면 묶음에 통째로 싣지 않고, 화면에는 그 주 몫만 넘긴다.
 */
export const SHOOT_PLAN = data as ShootPlan;

export function weekOf(n: number): PlanWeek | null {
  return SHOOT_PLAN.weeks.find((w) => w.week === n) ?? null;
}

export function itemOf(exerciseId: string): { week: number; item: PlanItem } | null {
  for (const w of SHOOT_PLAN.weeks)
    for (const s of w.stations)
      for (const it of s.items)
        if (it.exerciseId === exerciseId) return { week: w.week, item: it };
  return null;
}

export const PLAN_EXERCISE_IDS: ReadonlySet<string> = new Set(
  SHOOT_PLAN.weeks.flatMap((w) =>
    w.stations.flatMap((s) => s.items.map((it) => it.exerciseId))
  )
);
