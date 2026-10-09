'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/dal';
import { clearLibraryCache } from '@/lib/library-cache';
import { prisma } from '@/lib/prisma';
import { deleteVideos, isLibraryPath } from '@/lib/storage';
import { PLAN_EXERCISE_IDS } from '@/lib/shoot/plan';
import {
  isShootStatus,
  type ShootCheckView,
  type ShootStatus,
} from '@/lib/shoot/progress';
import { loadShootChecks } from '@/lib/shoot/load';

/**
 * 트레이닝 영상 촬영 체크 — 관리자만(/admin/shoot).
 *
 * 화면이 바로 부른다(폼이 아니다). 먼저 화면을 바꾸고(낙관적) 여기서 실패하면 되돌린다. 성공하면 모든 체크를 돌려준다 —
 * 같이 찍는 두 사람의 폰이 서로의 체크를 받는 길이기도 하다(fetchShootChecks 를 15초마다 부른다).
 */

export type ShootResult =
  { ok: true; checks: ShootCheckView[] } | { ok: false; error: string };

const NOT_ADMIN = { ok: false as const, error: '관리자만 할 수 있습니다.' };
const NOTE_MAX = 200;

async function requireAdminUser() {
  const user = await getCurrentUser();
  return user && user.role === 'ADMIN' ? user : null;
}

function revalidate() {
  revalidatePath('/admin/shoot', 'layout');
}

/**
 * 한 운동의 상태를 바꾼다. status null = 되돌리기(줄을 지운다 → 대기).
 * note 를 안 주면(undefined) 적어 둔 메모를 그대로 둔다. 빈 글은 메모를 지운다.
 */
export async function setShootStatus(
  exerciseId: string,
  status: ShootStatus | null,
  note?: string | null
): Promise<ShootResult> {
  const user = await requireAdminUser();
  if (!user) return NOT_ADMIN;
  if (typeof exerciseId !== 'string' || !PLAN_EXERCISE_IDS.has(exerciseId)) {
    return { ok: false, error: '촬영 계획에 없는 운동이에요. 새로고침해 주세요.' };
  }
  if (status !== null && !isShootStatus(status)) {
    return { ok: false, error: '상태가 올바르지 않아요.' };
  }
  let memo: string | null | undefined = undefined;
  if (note !== undefined) {
    if (note !== null && typeof note !== 'string')
      return { ok: false, error: '메모가 올바르지 않아요.' };
    const t = (note ?? '').trim();
    if (t.length > NOTE_MAX)
      return { ok: false, error: `메모는 ${NOTE_MAX}자까지예요.` };
    memo = t || null;
  }

  if (status === null) {
    await prisma.shootCheck.deleteMany({ where: { exerciseId } });
  } else {
    const prev = await prisma.shootCheck.findUnique({ where: { exerciseId } });
    /* 메모만 고친 것이면 시각은 그대로 — 날별 속도 · 계획 대비가 흔들리지 않게 */
    const sameStatus = prev?.status === status;
    await prisma.shootCheck.upsert({
      where: { exerciseId },
      update: {
        status,
        userId: user.id,
        ...(sameStatus ? {} : { checkedAt: new Date() }),
        ...(memo !== undefined ? { note: memo } : {}),
      },
      create: { exerciseId, status, userId: user.id, note: memo ?? null },
    });
  }
  revalidate();
  return { ok: true, checks: await loadShootChecks() };
}

/** 촬영 모드에서 올린 영상 — 라이브러리 저장소 경로와 영상 비율(가로 ÷ 세로) */
export type ShootClip = {
  videoPath: string;
  thumbPath: string | null;
  aspectRatio: number;
};

function validClip(clip: ShootClip): string | null {
  if (!clip || typeof clip !== 'object') return '영상 정보가 없어요.';
  const { videoPath, thumbPath, aspectRatio } = clip;
  if (typeof videoPath !== 'string' || !isLibraryPath(videoPath) || !videoPath.endsWith('.mp4')) {
    return '영상 경로가 올바르지 않아요.';
  }
  if (
    thumbPath !== null &&
    (typeof thumbPath !== 'string' || !isLibraryPath(thumbPath) || !/\.jpe?g$/.test(thumbPath))
  ) {
    return '첫 장면 이미지 경로가 올바르지 않아요.';
  }
  if (typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio) || aspectRatio < 0.2 || aspectRatio > 5) {
    return '영상 비율이 올바르지 않아요.';
  }
  return null;
}

/**
 * 촬영 모드에서 찍어 자른(소리 없는) 영상을 그 운동의 라이브러리 영상으로 붙이고 '찍음'으로 체크한다.
 *
 * 운동(ExerciseVideo)이든 투구 드릴(MechanicsGuide)이든 같은 자리를 바꾼다 — 라이브러리 관리자 화면에서 영상을 바꿀 때
 * (app/actions/content.ts tryUpdateExercise · tryUpdateGuide)와 같다: videoPath · thumbPath, 출처 OWN, 유튜브 번호 지움
 * (재생기가 유튜브를 먼저 보므로), 그리고 비율(세로로 찍었으면 세로 틀). 유튜브 번호는 lib/shoot/refs.json 에 남아 있어
 * 촬영 화면은 다시 찍을 때도 참고 영상을 보인다. 예전 우리 영상(다시 찍기)은 DB 를 바꾼 뒤에 지운다.
 */
export async function attachShootClip(
  exerciseId: string,
  clip: ShootClip
): Promise<ShootResult> {
  const user = await requireAdminUser();
  if (!user) return NOT_ADMIN;
  if (typeof exerciseId !== 'string' || !PLAN_EXERCISE_IDS.has(exerciseId)) {
    return { ok: false, error: '촬영 계획에 없는 운동이에요. 새로고침해 주세요.' };
  }
  const bad = validClip(clip);
  if (bad) return { ok: false, error: bad };
  const data = {
    videoPath: clip.videoPath,
    thumbPath: clip.thumbPath,
    aspectRatio: Math.round(clip.aspectRatio * 1000) / 1000,
    source: 'OWN' as const,
    referenceVideoId: null,
  };

  const select = { videoPath: true, thumbPath: true } as const;
  const exercise = await prisma.exerciseVideo.findUnique({ where: { id: exerciseId }, select });
  const guide = exercise
    ? null
    : await prisma.mechanicsGuide.findUnique({ where: { id: exerciseId }, select });
  const before = exercise ?? guide;
  if (!before) return { ok: false, error: '라이브러리에서 이 운동을 찾지 못했어요.' };
  if (exercise) await prisma.exerciseVideo.update({ where: { id: exerciseId }, data });
  else await prisma.mechanicsGuide.update({ where: { id: exerciseId }, data });

  const prev = await prisma.shootCheck.findUnique({ where: { exerciseId } });
  await prisma.shootCheck.upsert({
    where: { exerciseId },
    update: {
      status: 'done',
      userId: user.id,
      ...(prev?.status === 'done' ? {} : { checkedAt: new Date() }),
    },
    create: { exerciseId, status: 'done', userId: user.id },
  });

  // DB 를 먼저 바꾼 뒤에 옛 파일을 지운다 — 반대 순서면 실패할 때 영상이 사라진다
  const old = [before.videoPath, before.thumbPath].filter(
    (p): p is string => !!p && isLibraryPath(p) && p !== clip.videoPath && p !== clip.thumbPath
  );
  if (old.length) await deleteVideos(old);

  clearLibraryCache();
  revalidatePath(exercise ? '/library/training' : '/library/mechanics');
  revalidate();
  return { ok: true, checks: await loadShootChecks() };
}

/**
 * 올렸지만 붙이지 못한 파일 지우기 — 붙이기가 실패해 저장소에 주인 없는 파일이 남지 않게. 어느 운동 · 드릴도 쓰지 않는
 * 라이브러리 경로만 지운다(쓰고 있는 것은 그대로).
 */
export async function discardShootUpload(paths: string[]): Promise<{ ok: boolean }> {
  if (!(await requireAdminUser())) return { ok: false };
  const want = (Array.isArray(paths) ? paths : [])
    .filter((p): p is string => typeof p === 'string' && isLibraryPath(p))
    .slice(0, 4);
  if (!want.length) return { ok: true };
  const [ex, gd] = await Promise.all([
    prisma.exerciseVideo.findMany({
      where: { OR: [{ videoPath: { in: want } }, { thumbPath: { in: want } }] },
      select: { videoPath: true, thumbPath: true },
    }),
    prisma.mechanicsGuide.findMany({
      where: { OR: [{ videoPath: { in: want } }, { thumbPath: { in: want } }] },
      select: { videoPath: true, thumbPath: true },
    }),
  ]);
  const used = new Set([...ex, ...gd].flatMap((r) => [r.videoPath, r.thumbPath]));
  const orphan = want.filter((p) => !used.has(p));
  if (orphan.length) await deleteVideos(orphan);
  return { ok: true };
}

/** 지금 체크 — 촬영 화면이 15초마다 · 다시 볼 때 부른다(다른 사람이 찍은 것을 받으려고) */
export async function fetchShootChecks(): Promise<ShootResult> {
  if (!(await requireAdminUser())) return NOT_ADMIN;
  return { ok: true, checks: await loadShootChecks() };
}
