import 'server-only';
import { appNow } from '@/lib/clock';
import type { TrainingSession } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  mergeReopened,
  readFrozenPlan,
  type FrozenPlan,
} from '@/lib/workout/session-plan';

/**
 * 이어서 할 수 있는 열린 판인가 — ACTIVE 이고 찍어 둔 목록을 읽을 수 있고 비어 있지 않다.
 *
 * 목록을 못 읽는 ACTIVE 판은 '열린 판'으로 보지 않는다. 그렇게 보면 [운동 시작]이 운동 화면으로 보내고, 운동 화면은
 * 목록이 없어 트레이닝으로 되돌려 보내 둘 사이를 맴돌았다(2026-10-16 점검 12). 운동 화면이 그 판을 닫고(ABANDONED),
 * 여기서는 없는 셈 쳐 upsert 가 새 목록으로 다시 연다.
 */
export function isOpenSession(
  open: Pick<TrainingSession, 'status' | 'plan'> | null
): boolean {
  if (open?.status !== 'ACTIVE') return false;
  const plan = readFrozenPlan(open.plan);
  return plan != null && plan.exercises.length > 0;
}

/**
 * 오늘 판을 연다(새로 만들거나, 닫은 판을 다시 연다). 갈 화면을 돌려준다.
 *
 * 트레이닝의 [운동 시작](app/actions/workout.ts 의 startWorkout)과 프로그램의 [운동 시작](app/actions/program.ts)이
 * 같이 쓴다 — 둘이 따로 열면 다시 열기 · 워밍업 건너뛰기 규칙이 갈린다.
 */
export async function openSession(
  userId: string,
  midnight: Date,
  plan: FrozenPlan,
  open: TrainingSession | null
): Promise<'/workout/run' | '/workout/warmup'> {
  /*
   * 워밍업 창을 건너뛰는 두 경우.
   *
   * 하나는 회복 데이다 — 그날 목록 자체가 가볍게 푸는 운동들이라, 그 앞에 또
   * 푸는 순서를 두면 할 일이 두 배가 된다 (lib/workout/warmup-kind.ts).
   *
   * 둘은 오늘 이미 한 번 지난 판을 다시 여는 경우다. 아침에 마치고 저녁에
   * 다시 들어왔다고 워밍업을 또 시킬 일은 아니다.
   */
  const noWarmup = plan.themeKey === 'recovery' || open?.warmupOutcome != null;

  /*
   * 다시 여는 판도 시각을 새로 찍는다.
   *
   * 휴식 시계가 이 값을 기준으로 '이 뒤에 남긴 세트'만 세기 때문이다
   * (app/(session)/workout/run/page.tsx). 아침 값을 그대로 두면 저녁에 들어와
   * '9시간째 쉬는 중'이 뜬다.
   */
  const mainStartedAt = noWarmup ? appNow() : null;

  /* 다시 여는 판은 그 판이 쓰던 목록을 지킨다(mergeReopened) */
  const sessionPlan = mergeReopened(open ? readFrozenPlan(open.plan) : null, plan);

  await prisma.trainingSession.upsert({
    where: { userId_date: { userId, date: midnight } },
    create: {
      userId,
      date: midnight,
      themeKey: plan.themeKey,
      plan,
      status: 'ACTIVE',
      mainStartedAt,
    },
    update: {
      /* 한 번 닫은 판을 다시 열 때 — 쓰던 목록(위 sessionPlan)으로 상태를 되돌린다 */
      themeKey: sessionPlan.themeKey,
      plan: sessionPlan,
      status: 'ACTIVE',
      endedAt: null,
      mainStartedAt,
    },
  });

  return mainStartedAt ? '/workout/run' : '/workout/warmup';
}
