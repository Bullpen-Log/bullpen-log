'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadAppArmcareTab, type AppArmcareGuideTab, type AppArmcareTodayTab } from '@/lib/armcare/today-load';
import { loadAppMechanicsTab, type AppMechanicsElementsTab, type AppMechanicsProgramTab } from '@/lib/mechanics/home-load';

/**
 * 아이폰 앱의 암케어 · 메커니즘 전체 화면(native/src/app/training-armcare.tsx · training-mechanics.tsx)을 열 때 — 웹 트레이닝의
 * ?view=armcare · ?view=mechanics 칸(app/(app)/training/training-page.tsx)이 그리는 것과 같은 자료(lib/armcare/today-load.ts ·
 * lib/mechanics/home-load.ts). 웹처럼 첫 설정을 안 마쳤으면 그 설정 화면으로(to). /api/rpc/app-training-parts.<함수> 로 부른다.
 */
type Closed = { ok: false; to: string };

export async function loadAppArmcare(tab: unknown): Promise<({ ok: true } & (AppArmcareTodayTab | AppArmcareGuideTab)) | Closed> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  const data = await loadAppArmcareTab(user, tab === 'guide' ? 'guide' : 'today', appNow());
  return { ok: true, ...data };
}

export async function loadAppMechanics(tab: unknown): Promise<({ ok: true } & (AppMechanicsProgramTab | AppMechanicsElementsTab)) | Closed> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  const data = await loadAppMechanicsTab(user, tab === 'elements' ? 'elements' : 'program');
  return { ok: true, ...data };
}
