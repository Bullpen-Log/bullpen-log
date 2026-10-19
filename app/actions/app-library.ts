'use server';

import { getCurrentUser } from '@/lib/dal';
import { loadDrillLibrary, loadExerciseLibrary, type LibraryExercise } from '@/lib/library-load';
import type { WarmupFolder } from '@/app/(app)/library/training/training-client';
import type { GuideItem } from '@/app/(app)/library/mechanics/mechanics-client';

/**
 * 아이폰 앱(native/src/app/library.tsx)의 운동 영상 · 투구 드릴 라이브러리를 열 때 — 웹 /library/training · /library/mechanics 와 같은 목록
 * (lib/library-load.ts). 앱은 보기 · 별 · 지난 기록만 하고, 관리자의 등록 · 수정 · 숨기기는 웹에서 한다 — 그래서 늘 숨긴 것을 뺀 목록이다.
 * /api/rpc/app-library.loadAppExerciseLibrary · loadAppDrillLibrary 로 부른다.
 */
export async function loadAppExerciseLibrary(): Promise<
  { ok: true; exercises: LibraryExercise[]; warmupFolders: WarmupFolder[]; warmupCommon: WarmupFolder | null } | { ok: false; to: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  return { ok: true, ...(await loadExerciseLibrary(user.id, false)) };
}

export async function loadAppDrillLibrary(): Promise<{ ok: true; drills: GuideItem[] } | { ok: false; to: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  return { ok: true, drills: await loadDrillLibrary(user.id) };
}
