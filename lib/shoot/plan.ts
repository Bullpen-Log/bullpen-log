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

/**
 * 촬영 계획을 뽑을 때 이미 있던 우리 영상(약 한 달 전에 찍은 것) — 이번 촬영으로 다시 찍어 바꾼다. 아직 그 영상 그대로면
 * '직접 촬영'으로 세지 않는다(2026-10-10 사용자: "한 달 전에 찍은 운동 영상은 다시 교체할 거라 직접 촬영한 영상에서 제외").
 */
export const OLD_OWN_VIDEOS: ReadonlySet<string> = new Set(
  SHOOT_PLAN.weeks.flatMap((w) =>
    w.stations.flatMap((s) => s.items.flatMap((it) => (it.oldVideo ? [it.oldVideo] : [])))
  )
);

export const PLAN_EXERCISE_IDS: ReadonlySet<string> = new Set(
  SHOOT_PLAN.weeks.flatMap((w) =>
    w.stations.flatMap((s) => s.items.map((it) => it.exerciseId))
  )
);
