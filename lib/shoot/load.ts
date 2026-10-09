import 'server-only';
import { allExercises } from '@/lib/library-cache';
import { formatPrescription } from '@/lib/exercise-meta';
import { prisma } from '@/lib/prisma';
import { referenceThumbUrl } from '@/lib/reference-video';
import { createPlaybackUrls } from '@/lib/storage';
import {
  carriedOver,
  isShootStatus,
  weekItems,
  type ShootCheckView,
} from '@/lib/shoot/progress';
import { SHOOT_PLAN, weekOf } from '@/lib/shoot/plan';
import type { PlanItem, PlanWeek } from '@/lib/shoot/schedule';

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

/** 한 주 화면(주차 시간표 · 촬영 모드)이 받는 것 — 그 주 계획 · 앞 주에서 넘어온 것 · 운동 정보 · 모든 체크 */
export type ShootWeekData = {
  week: PlanWeek;
  /** 앞 주에서 아직 못 찍은 것(대기 · 다시 · 미룸) — 그 주 끝에 이어 찍는다 */
  carried: { week: number; item: PlanItem }[];
  infos: Record<string, ShootExerciseInfo>;
  checks: ShootCheckView[];
  /** 고를 수 있는 주차들 */
  weeks: number[];
};

export async function loadShootWeek(n: number): Promise<ShootWeekData | null> {
  const week = weekOf(n);
  if (!week) return null;
  const checks = await loadShootChecks();
  const map = new Map(checks.map((c) => [c.exerciseId, c]));
  const carriedItems = new Set(
    carriedOver(SHOOT_PLAN, n, map).map((it) => it.exerciseId)
  );
  const carried = SHOOT_PLAN.weeks
    .filter((w) => w.week < n)
    .flatMap((w) =>
      weekItems(w)
        .filter((it) => carriedItems.has(it.exerciseId))
        .map((item) => ({ week: w.week, item }))
    );
  const ids = [
    ...weekItems(week).map((it) => it.exerciseId),
    ...carried.map((c) => c.item.exerciseId),
  ];
  const infos = await loadShootExercises(ids);
  return {
    week,
    carried,
    infos: Object.fromEntries(infos),
    checks,
    weeks: SHOOT_PLAN.weeks.map((w) => w.week),
  };
}
