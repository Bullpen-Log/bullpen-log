'use server';

import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { openRunSession, runPayload, type RunPayload } from '@/lib/workout/run-load';
import { loadWarmup } from '@/lib/workout/warmup-load';
import { loadWorkoutDone, type WorkoutDone } from '@/lib/workout/done-load';
import type { WarmupCard } from '@/app/(session)/workout/warmup/warmup-client';

/**
 * 아이폰 앱(native/src/app/workout.tsx)의 운동 진행 화면을 열 때 — 웹 운동 화면(app/(session)/workout/run/page.tsx)이 그리는 것과 같은
 * 판 · 목록 · 세트(lib/workout/run-load.ts). 웹은 열 판이 없으면 redirect 하지만 앱은 그 주소(to)를 받아 화면을 닫고 웹을 그리로 보낸다.
 * /api/rpc/app-workout.loadAppWorkout 로 부른다.
 */
export async function loadAppWorkout(): Promise<
  ({ ok: true } & RunPayload) | { ok: false; error: string; to?: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.', to: '/login' };
  if (featureLocks(user).training)
    return { ok: false, error: '트레이닝 첫 설정을 먼저 마쳐 주세요.', to: SETUP_PATH.training };

  const open = await openRunSession(user.id);
  if (!open.ok) return { ok: false, error: open.error, to: open.to };
  return { ok: true, ...(await runPayload(user.id, open.session, open.plan)) };
}

/**
 * 아이폰 앱(native/src/app/warmup.tsx)의 워밍업 창을 열 때 — 웹 /workout/warmup 과 같은 재료(lib/workout/warmup-load.ts). 열 수 없으면
 * 갈 곳(to)을 돌려준다 — '/workout/run' 이면 앱이 운동 화면으로, 나머지는 웹으로. 마치기는 웹과 같은 workout.finishWarmup(→ '/workout/run').
 */
export async function loadAppWarmup(): Promise<
  { ok: true; themeLabel: string; cards: WarmupCard[] } | { ok: false; to: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  const got = await loadWarmup(user);
  if ('to' in got) return { ok: false, to: got.to };
  return { ok: true, ...got };
}

/**
 * 아이폰 앱(native/src/app/workout-done.tsx)의 축하 화면 — 웹 /workout/done 과 같은 재료(lib/workout/done-load.ts). 마친 판이 아니면(남의 판 ·
 * 아직 하는 판 · 세트 없음) 갈 곳(to)을 돌려준다. 힘듦 칩은 웹과 같은 workout.rateWorkoutEffort.
 */
export async function loadAppWorkoutDone(id: unknown): Promise<({ ok: true } & WorkoutDone) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  const got = await loadWorkoutDone(user, id);
  if ('to' in got) return { ok: false, to: got.to };
  return { ok: true, ...got };
}
