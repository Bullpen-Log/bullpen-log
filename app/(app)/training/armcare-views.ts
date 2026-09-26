import 'server-only';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import type { CachedExercise } from '@/lib/library-cache';
import { methodOf } from '@/lib/armcare/methods';
import type { ArmcareExerciseView } from './armcare-media';

/**
 * 라이브러리 줄을 암케어 화면에 그릴 모양으로.
 *
 * 맞춤 루틴 · 내 루틴 · 부위별 보강 · 내 루틴 만들기 · 루틴 따라하기가 모두 쓴다.
 *
 * 미리보기는 한 번에 몰아서 받는다(lib/storage.ts 가 잠시 돌려 쓴다). 참고 영상은
 * 유튜브 미리보기를 그대로 쓴다 — 우리 저장소에 담긴 것이 없어 받을 주소도 없다.
 */
export async function toArmcareViews(
  list: CachedExercise[],
  /** 운동마다 할 세트 — 루틴은 운동에 적힌 세트와 다를 수 있다 */
  sets?: Map<string, number>
): Promise<ArmcareExerciseView[]> {
  const thumbs = await createPlaybackUrls(
    list.map((ex) => ex.thumbPath).filter((p): p is string => !!p)
  );
  return list.map((ex) => ({
    id: ex.id,
    title: ex.title,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    /* 마이그레이션 전에 캐시에 담긴 줄에는 이 칸이 없을 수 있다(lib/library-cache.ts) */
    targetMuscles: ex.targetMuscles ?? [],
    prescription: formatPrescription({ ...ex, sets: sets?.get(ex.id) ?? ex.sets }),
    thumbUrl: ex.referenceVideoId
      ? referenceThumbUrl(ex.referenceVideoId)
      : ex.thumbPath
        ? (thumbs[ex.thumbPath] ?? null)
        : null,
    videoPath: ex.videoPath,
    referenceVideoId: ex.referenceVideoId,
    aspectRatio: ex.aspectRatio,
    isReference: ex.source === 'REFERENCE',
    method: methodOf(ex.title)?.key ?? null,
  }));
}
