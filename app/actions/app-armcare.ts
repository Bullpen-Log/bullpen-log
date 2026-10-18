'use server';

import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadArmcarePlay, type ArmcarePlay } from '@/lib/armcare/play-load';

/**
 * 아이폰 앱(native/src/app/armcare/[id].tsx)의 암케어 따라 하기를 열 때 — 웹 화면(app/(session)/armcare/play/[id]/page.tsx)이 그리는 것과
 * 같은 루틴 · 체크 · 경고(lib/armcare/play-load.ts). 웹은 열 루틴이 없으면 redirect 하지만 앱은 그 주소(to)를 받아 화면을 닫고 웹을 그리로 보낸다.
 * /api/rpc/app-armcare.loadAppArmcarePlay 로 부른다.
 */
export async function loadAppArmcarePlay(
  id: string,
  d: string | null,
  areas: string | null
): Promise<({ ok: true } & ArmcarePlay) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  if (typeof id !== 'string') return { ok: false, to: '/training?view=armcare' };
  const play = await loadArmcarePlay(user, id, d, areas);
  return play.ok ? play : { ok: false, to: play.to };
}
