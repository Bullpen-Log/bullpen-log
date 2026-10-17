'use server';

import { appNow } from '@/lib/clock';
import { getCurrentUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadTrainingToday, type TrainingToday } from '@/lib/report/training-today-data';

/**
 * 아이폰 앱(native/src/app/training-today.tsx)의 트레이닝 '운동' 화면을 열 때 — 웹 /training(기본 칸, app/(app)/training/training-page.tsx)이
 * 그리는 것과 같은 오늘 셈 · 프로그램 날 · 일정 카드(lib/report/training-today-data.ts). 웹처럼 첫 설정 전이면 그 화면으로(to).
 * /api/rpc/app-training.loadAppTrainingToday 로 부른다.
 */
export async function loadAppTrainingToday(): Promise<({ ok: true } & TrainingToday) | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  if (featureLocks(user).training) return { ok: false, to: SETUP_PATH.training };
  return { ok: true, ...(await loadTrainingToday(user, appNow())) };
}
