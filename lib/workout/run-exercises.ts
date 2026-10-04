import 'server-only';
import { exercisesByIds } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { recentAmounts } from '@/lib/report/exercise-recent';
import { exerciseNotes } from '@/lib/exercise-notes';
import { favoriteExerciseIds } from '@/lib/favorites';
import { priorBests } from '@/lib/workout/prior-bests';
import type { PriorBest } from '@/lib/workout/bests';
import type { DoneAmount } from '@/lib/exercise-meta';
import type { SlotKey } from '@/lib/report/theme';
import type { FrozenExercise, FrozenProgramSlot } from '@/lib/workout/session-plan';

/** 운동 화면(app/(session)/workout/run)이 그리는 운동 하나 */
export type RunExercise = {
  id: string;
  title: string;
  category: string;
  slot: SlotKey;
  prescription: string | null;
  plannedSets: number | null;
  /** 세트 사이 쉬는 시간(초). 처방에 없으면 null — 쉬는 시계가 목표 없이 올라가기만 한다 */
  restSeconds: number | null;
  perSide: boolean;
  needsWeight: boolean;
  isHold: boolean;
  /**
   * 시간을 분으로 받는가 (유산소).
   *
   * 자전거 10분을 '600초'로 치게 하면 헷갈리고 느리다. 받는 것은 분이지만
   * 저장은 다른 시간형 운동처럼 초로 한다 — 요약·부하 계산이 초를 읽는다.
   */
  inMinutes: boolean;
  equipment: string[];
  /** 운동 중에 자세를 확인하는 데 쓴다 */
  description: string;
  videoPath: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
  thumbUrl: string | null;
  last: (DoneAmount & { date: string }) | null;
  /** 이 운동에 남겨 둔 내 메모(운동마다 하나). 없으면 null */
  note: string | null;
  /** 이 사람이 별을 달아 둔 운동인가 — 라이브러리의 별과 같은 것 */
  favorite: boolean;
  /** 오늘 앞의 최고 기록 — 세트가 이것을 넘으면 '새 최고'(lib/workout/bests.ts). 처음 하는 운동은 null */
  best: PriorBest | null;
  /** 근력 · 파워 프로그램 날의 칸(session-plan.ts) — 프로그램이 아닌 날은 null */
  programSlot: FrozenProgramSlot | null;
  /** 프로그램 날 얼린 추천 무게(kg). '추천 담기'와 '몇 개 더?'가 쓴다. 숫자 없이 안내하는 날은 null */
  suggestedKg: number | null;
};

/**
 * 찍어 둔 운동에 화면에 필요한 것을 붙인다 — 설명·영상, 미리보기 주소,
 * 지난번 기록, 내 메모, 별.
 *
 * 운동 화면을 열 때(page.tsx)와, 운동 중에 바꾸거나 더한 운동을 돌려줄 때
 * (app/actions/workout.ts 의 changeSessionExercise) 같이 쓴다. 따로 만들면
 * 바꿔 넣은 운동에만 지난번 기록이나 메모가 빠진다.
 *
 * 설명과 영상은 찍어 둔 목록에 담지 않고 여기서 따로 읽는다. 얼려 두는 것은
 * '무엇을 할지'이지 '그 운동이 무엇인지'가 아니다. 설명은 길어서 찍어 두면
 * 세션 줄이 무거워지고, 영상 주소는 한 시간이면 죽는다. 목록은 캐시에 통째로
 * 올라와 있어(lib/library-cache.ts) DB 를 가지 않는다.
 */
export async function runExercises(
  userId: string,
  entries: readonly FrozenExercise[],
  /** 세션 날짜 — '지난번'은 이날 앞의 기록에서 찾는다 */
  sessionDate: Date
): Promise<RunExercise[]> {
  const ids = entries.map((e) => e.id);

  const [details, thumbUrls, past, notes, favorites, bests] = await Promise.all([
    exercisesByIds(ids),
    /* 서명 주소는 한 시간이면 죽는다. 찍어 두지 않고 그릴 때마다 발급한다. */
    createPlaybackUrls(entries.map((e) => e.thumbPath).filter((p): p is string => !!p)),
    /* '지난번 60kg × 8회' — 그릴 운동만 묻는다 */
    recentAmounts(userId, ids, sessionDate),
    /* 운동마다 남겨 둔 내 메모 */
    exerciseNotes(userId, ids),
    favoriteExerciseIds(userId),
    /* '새 최고'를 가를 기준 — 운동마다 가장 큰 값만 */
    priorBests(userId, ids, sessionDate),
  ]);
  const byId = new Map(details.map((d) => [d.id, d]));

  return entries.map((e) => {
    const d = byId.get(e.id);
    return {
      id: e.id,
      title: e.title,
      category: e.category,
      slot: e.slot,
      prescription: e.prescription,
      plannedSets: e.plannedSets,
      /* 처방을 찍기 전에 연 판(undefined)은 라이브러리 값으로 */
      restSeconds:
        e.restSeconds !== undefined ? e.restSeconds : (d?.restSeconds ?? null),
      perSide: e.perSide,
      needsWeight: e.needsWeight,
      isHold: e.isHold,
      /* 유산소는 분으로 받는다 — 10분을 '600초'로 치게 하지 않는다 */
      inMinutes: e.category === '유산소',
      equipment: e.equipment,
      /* 운동 중에 자세를 확인할 수 있게 — 설명과 영상 */
      description: d?.description ?? '',
      videoPath: d?.videoPath ?? null,
      referenceVideoId: d?.referenceVideoId ?? null,
      aspectRatio: d?.aspectRatio ?? null,
      thumbUrl: e.thumbPath ? (thumbUrls[e.thumbPath] ?? null) : null,
      /* 가장 최근 한 번만. 여러 개를 보여주면 무엇을 따라갈지 흐려진다. */
      last: past.get(e.id)?.[0] ?? null,
      note: notes.get(e.id) ?? null,
      favorite: favorites.has(e.id),
      best: bests.get(e.id) ?? null,
      programSlot: e.programSlot ?? null,
      suggestedKg: e.suggestedKg ?? null,
    };
  });
}
