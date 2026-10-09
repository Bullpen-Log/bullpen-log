import 'server-only';
import { allExercises, allGuides } from '@/lib/library-cache';
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
import { SHOOT_PLAN, itemOf, weekOf } from '@/lib/shoot/plan';
import refsData from '@/lib/shoot/refs.json';
import { WARMUP_ROUTINE_LABEL, isWarmupId, warmupOf, warmupRowId } from '@/lib/shoot/warmups';
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

/**
 * 유튜브 참고 영상 — 라이브러리의 지금 번호가 먼저, 우리 영상을 올려 지워진 뒤에는 저장소에 남겨 둔 번호
 * (scripts/shoot-refs.mts).
 */
const REFS = refsData as Record<string, { yt: string; ar?: number }>;

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
  /** 모델이 볼 참고 영상(유튜브) — 우리 영상을 올린 뒤에도 남는다 */
  youtube: { id: string; aspectRatio: number | null } | null;
  /** 올린 우리 영상 — 아직이면 null */
  own: { path: string; thumbUrl: string | null; aspectRatio: number | null } | null;
  /**
   * 이번 촬영에서 우리 영상을 올렸나 — 우리 영상이 있고, 계획을 뽑을 때 이미 있던 영상(PlanItem.oldVideo)과 다르다. 예전에 찍은 영상만
   * 있으면 아니다(다시 찍는다). 게이지 '올림' · '다시 찍기' 단추가 이것을 본다.
   */
  uploaded: boolean;
};

/** 라이브러리 한 줄(운동 · 드릴 · 만든 워밍업)을 촬영 화면 정보로 — 공통 모양 */
type MediaRow = {
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  equipment: string[];
  intensity: string;
  difficulty: string | null;
  prescription: string | null;
  source: 'OWN' | 'REFERENCE';
  referenceVideoId: string | null;
  videoPath: string | null;
  thumbPath: string | null;
  aspectRatio: number | null;
  hidden: boolean;
};

function toInfo(
  id: string,
  refKey: string,
  r: MediaRow,
  thumbs: Record<string, string>
): ShootExerciseInfo {
  const ref = REFS[refKey];
  return {
    id,
    title: r.title,
    category: r.category,
    description: r.description,
    bodyParts: r.bodyParts,
    equipment: r.equipment,
    intensity: r.intensity,
    difficulty: r.difficulty,
    prescription: r.prescription,
    source: r.source,
    referenceVideoId: r.referenceVideoId,
    videoPath: r.videoPath,
    thumbUrl: r.referenceVideoId
      ? referenceThumbUrl(r.referenceVideoId)
      : r.thumbPath
        ? (thumbs[r.thumbPath] ?? null)
        : null,
    aspectRatio: r.aspectRatio,
    hidden: r.hidden,
    // 라이브러리에 지금 유튜브 번호가 있으면 그것(관리자가 바꿨을 수 있다), 우리 영상으로 바뀌어 지워졌으면 남겨 둔 번호
    youtube: r.referenceVideoId
      ? { id: r.referenceVideoId, aspectRatio: r.aspectRatio }
      : ref
        ? { id: ref.yt, aspectRatio: ref.ar ?? null }
        : null,
    uploaded: r.source === 'OWN' && !!r.videoPath && r.videoPath !== itemOf(id)?.item.oldVideo,
    own:
      r.source === 'OWN' && r.videoPath
        ? {
            path: r.videoPath,
            thumbUrl: r.thumbPath ? (thumbs[r.thumbPath] ?? null) : null,
            aspectRatio: r.aspectRatio,
          }
        : null,
  };
}

/** 띄어쓰기 없이 견준다 */
const norm = (t: string) => t.replace(/\s+/g, '');

/**
 * 촬영 계획의 id → 화면 정보. 운동(ExerciseVideo) · 투구 드릴(MechanicsGuide) · 이름만 있는 워밍업(lib/shoot/warmups.ts —
 * 영상을 올려 만든 같은 이름의 '워밍업' 운동이 있으면 그것) 셋 다.
 */
export async function loadShootExercises(
  ids: readonly string[],
  { withMedia = true }: { withMedia?: boolean } = {}
): Promise<Map<string, ShootExerciseInfo>> {
  const want = new Set(ids);
  const [exercises, guides] = await Promise.all([allExercises(), allGuides()]);
  const rows: { id: string; refKey: string; row: MediaRow }[] = [];
  for (const ex of exercises) {
    if (!want.has(ex.id)) continue;
    rows.push({
      id: ex.id,
      refKey: ex.id,
      row: {
        ...ex,
        prescription: formatPrescription({
          sets: ex.sets,
          reps: ex.reps,
          holdSeconds: ex.holdSeconds,
          restSeconds: ex.restSeconds,
          perSide: ex.perSide,
          category: ex.category,
        }),
        hidden: ex.hiddenAt != null,
      },
    });
  }
  for (const g of guides) {
    if (!want.has(g.id)) continue;
    rows.push({
      id: g.id,
      refKey: g.id,
      row: {
        title: g.title,
        category: g.category,
        description: g.description,
        bodyParts: g.focusPoints,
        equipment: g.equipment,
        intensity: '',
        difficulty: g.stage,
        prescription: null,
        source: g.source,
        referenceVideoId: g.referenceVideoId,
        videoPath: g.videoPath,
        thumbPath: g.thumbPath,
        aspectRatio: g.aspectRatio,
        hidden: g.hiddenAt != null,
      },
    });
  }
  /* 손으로 먼저 만든 같은 이름의 '워밍업' 운동 — 등록순으로 첫 것(올리기 attachShootClip 과 같은 규칙) */
  const madeWarmups = new Map<string, (typeof exercises)[number]>();
  for (const e of exercises) {
    if (e.category === '워밍업' && !madeWarmups.has(norm(e.title))) madeWarmups.set(norm(e.title), e);
  }
  const byExerciseId = new Map(exercises.map((e) => [e.id, e]));
  for (const id of want) {
    const w = isWarmupId(id) ? warmupOf(id) : null;
    if (!w) continue;
    // 미리 정한 id 로 만든 운동이 먼저(라이브러리에서 이름을 고쳐도 이어진다), 없으면 같은 이름
    const rowId = warmupRowId(id);
    const made = (rowId ? byExerciseId.get(rowId) : undefined) ?? madeWarmups.get(norm(w.title));
    rows.push({
      id,
      refKey: made?.id ?? id,
      row: made
        ? {
            ...made,
            prescription: null,
            hidden: made.hiddenAt != null,
          }
        : {
            title: w.title,
            category: '워밍업',
            description: `${WARMUP_ROUTINE_LABEL[w.routine]}에 넣을 동작이에요. 아직 라이브러리에 없어요 — 영상을 올리면 이 이름의 '워밍업' 운동이 숨긴 채 만들어지고, 설명을 채워 보이게 한 뒤 루틴에 넣어요.`,
            bodyParts: w.bodyParts,
            equipment: w.equipment,
            intensity: '낮음',
            difficulty: null,
            prescription: null,
            source: 'REFERENCE',
            referenceVideoId: null,
            videoPath: null,
            thumbPath: null,
            aspectRatio: null,
            hidden: true,
          },
    });
  }
  const thumbs = withMedia
    ? await createPlaybackUrls(
        rows
          .filter((r) => r.row.source === 'OWN' && r.row.thumbPath)
          .map((r) => r.row.thumbPath!)
      )
    : {};
  return new Map(rows.map((r) => [r.id, toInfo(r.id, r.refKey, r.row, thumbs)]));
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
