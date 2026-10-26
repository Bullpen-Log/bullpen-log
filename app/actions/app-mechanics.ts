'use server';

import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadMechanicsPlay, type MechanicsPlay } from '@/lib/mechanics/play-load';

/**
 * 아이폰 앱(native/src/app/mechanics.tsx)의 메카닉 따라 하기를 열 때 — 웹 화면(app/(session)/mechanics/play/page.tsx)이 그리는 것과
 * 같은 세션 · 이어서 할 자리 · 아픈 날 접기(lib/mechanics/play-load.ts). 웹은 할 드릴이 없으면 redirect 하지만 앱은 그 주소(to)를 받아
 * 화면을 닫고 웹을 그리로 보낸다. anyway 는 웹 주소의 ?anyway=1 그대로('1' 일 때만 펼친다). /api/rpc/app-mechanics.loadAppMechanicsPlay 로 부른다.
 */
export async function loadAppMechanicsPlay(
  anyway: string | null
): Promise<({ ok: true } & MechanicsPlay) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  return loadMechanicsPlay(user, anyway);
}
