'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadAppArmcareTab, type AppArmcareGuideTab, type AppArmcareTodayTab } from '@/lib/armcare/today-load';
import { loadAppMechanicsTab, type AppMechanicsElementsTab, type AppMechanicsProgramTab } from '@/lib/mechanics/home-load';
import { loadRoutineBuilder, type RoutineBuilderData } from '@/lib/armcare/routine-builder-load';
import { toDateKey } from '@/lib/pitch-stats';
import { trainingDay, type TrainingDayDetail } from '@/lib/report/training-history';
import { loadTrainingStrip, type TrainingStripDay } from '@/lib/training-week';

/**
 * 아이폰 앱의 암케어 · 메카닉 전체 화면(native/src/app/training-armcare.tsx · training-mechanics.tsx)을 열 때 — 웹 트레이닝의
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

/**
 * 내 루틴 만들기 · 고치기(native/src/app/training/routine/[id].tsx) — 웹 /training/routine/<id> 와 같은 자료(lib/armcare/routine-builder-load.ts).
 * id 는 'new' 또는 루틴 번호. 없는 루틴이면 routine null(웹은 notFound). 저장 · 지우기는 웹과 같은 armcare.saveMyArmcareRoutine · deleteMyArmcareRoutine.
 */
export async function loadAppRoutine(id: unknown, add: unknown): Promise<{ ok: true; routine: RoutineBuilderData | null } | Closed> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  return { ok: true, routine: typeof id === 'string' ? await loadRoutineBuilder(user.id, id, add) : null };
}

export type AppTrainingDay = { today: string; detail: TrainingDayDetail; strip: TrainingStripDay[] };

/**
 * 지난 날 운동 기록(native/src/app/training/day/[date].tsx) — 웹 /training/day/<날짜>(app/(app)/training/day/[date]/page.tsx)와 같은
 * trainingDay · loadTrainingStrip. 없는 날짜(2026-02-31 같은 것)면 day null(웹은 notFound). 체크는 웹과 같은 exercise-log.setExerciseDone.
 */
export async function loadAppTrainingDay(date: unknown): Promise<{ ok: true; day: AppTrainingDay | null } | Closed> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: true, day: null };
  /* Date 는 없는 날짜를 조용히 다음 달로 넘긴다 — 되돌려 찍어 본다(웹 page.tsx 와 같다) */
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) return { ok: true, day: null };
  const today = toDateKey(appNow());
  const [detail, strip] = await Promise.all([trainingDay(user.id, date), loadTrainingStrip(user.id, date, today)]);
  return { ok: true, day: { today, detail, strip } };
}
