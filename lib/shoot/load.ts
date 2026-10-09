import 'server-only';
import { allExercises } from '@/lib/library-cache';
import { formatPrescription } from '@/lib/exercise-meta';
import { prisma } from '@/lib/prisma';
import { referenceThumbUrl } from '@/lib/reference-video';
import { createPlaybackUrls } from '@/lib/storage';
import { isShootStatus, type ShootCheckView } from '@/lib/shoot/progress';

/**
 * 촬영 관리자 화면이 읽는 것 — 체크(DB ShootCheck)와 운동 정보(라이브러리 캐시).
 * 계획 자체는 lib/shoot/plan.ts(고정 JSON).
 */

/** 모든 체크 — 312줄을 넘지 않는다(운동 하나에 하나) */
export async function loadShootChecks(): Promise<ShootCheckView[]> {
  const rows = await prisma.shootCheck.findMany({ orderBy: { checkedAt: 'desc' } });
  const ids = [...new Set(rows.map((r) => r.userId))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, nickname: true },
      })
    : [];
  const name = new Map(users.map((u) => [u.id, u.nickname]));
  return rows
    .filter((r) => isShootStatus(r.status))
    .map((r) => ({
      exerciseId: r.exerciseId,
      status: r.status as ShootCheckView['status'],
      at: r.checkedAt.toISOString(),
      by: name.get(r.userId) ?? null,
      note: r.note,
    }));
}

/** 촬영 화면에 보일 운동 정보 — 영상 · 설명 · 처방 · 지금 출처(우리 영상으로 바뀌었나) */
export type ShootExerciseInfo = {
  id: string;
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  equipment: string[];
  intensity: string;
  difficulty: string | null;
  /** 앱 처방 한 줄('3세트 × 10회 (좌우 각각) · …') — 모델이 원래 어떻게 하는 운동인지 */
  prescription: string | null;
  /** 지금 출처 — OWN 이면 우리 영상으로 이미 바뀌었다(올림) */
  source: 'OWN' | 'REFERENCE';
  referenceVideoId: string | null;
  videoPath: string | null;
  thumbUrl: string | null;
  aspectRatio: number | null;
  hidden: boolean;
};

export async function loadShootExercises(
  ids: readonly string[],
  { withMedia = true }: { withMedia?: boolean } = {}
): Promise<Map<string, ShootExerciseInfo>> {
  const want = new Set(ids);
  const rows = (await allExercises()).filter((ex) => want.has(ex.id));
  const thumbs = withMedia
    ? await createPlaybackUrls(
        rows
          .filter((ex) => ex.source === 'OWN' && ex.thumbPath)
          .map((ex) => ex.thumbPath!)
      )
    : {};
  return new Map(
    rows.map((ex) => [
      ex.id,
      {
        id: ex.id,
        title: ex.title,
        category: ex.category,
        description: ex.description,
        bodyParts: ex.bodyParts,
        equipment: ex.equipment,
        intensity: ex.intensity,
        difficulty: ex.difficulty,
        prescription: formatPrescription({
          sets: ex.sets,
          reps: ex.reps,
          holdSeconds: ex.holdSeconds,
          restSeconds: ex.restSeconds,
          perSide: ex.perSide,
          category: ex.category,
        }),
        source: ex.source,
        referenceVideoId: ex.referenceVideoId,
        videoPath: ex.videoPath,
        thumbUrl: ex.referenceVideoId
          ? referenceThumbUrl(ex.referenceVideoId)
          : ex.thumbPath
            ? (thumbs[ex.thumbPath] ?? null)
            : null,
        aspectRatio: ex.aspectRatio,
        hidden: ex.hiddenAt != null,
      },
    ])
  );
}
