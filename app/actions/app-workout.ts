'use server';

import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { openRunSession, runPayload, type RunPayload } from '@/lib/workout/run-load';

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
