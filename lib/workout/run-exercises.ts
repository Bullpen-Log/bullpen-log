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
import type {
  FrozenExercise,
  FrozenProgramSlot,
  SetTarget,
} from '@/lib/workout/session-plan';
import type { PlanVolume } from '@/lib/report/volume';
import { basisOf, targetView, type TargetView } from '@/lib/workout/target-override';
import type { RecordingContract } from '@/lib/workout/load/contract';
import { contractOfFrozen } from '@/lib/workout/load/frozen';
import type { LoadTarget } from '@/lib/workout/load/target';

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
  /** 프로그램이 아닌 날에도 마지막 세트 뒤에 '몇 개 더?'를 묻는가(session-plan.ts askReserve). 옛 서버 답에는 없다 */
  askReserve?: boolean;
  /** 워밍업 계단 한 줄(session-plan.ts warmupNote) — 추천 무게 밑에 보인다. 옛 서버 답에는 없다 */
  warmupNote?: string;
  /** 얼린 추천 무게(kg) — 프로그램 날(next-weight.ts) · 자유 운동(free-weight.ts). '추천 담기'와 '몇 개 더?'가 쓴다. 숫자 없이 안내하는 날은 null */
  suggestedKg: number | null;
  /** 자유 운동 추천의 까닭 한 줄 — 추천 단추 밑에 적는다. 프로그램 날 · 추천 없는 운동은 null */
  suggestNote: string | null;
  /** 세트마다 다른 처방(% 방식) — 그 세트의 무게 · 횟수 · '+'. 그 밖은 null */
  setTargets: SetTarget[] | null;
  /**
   * EX-LOAD01 — 이 판에 얼린 장비 기록 계약(lib/workout/load/contract.ts). 운동 화면은 이것만 보고 입력 칸을 고른다 —
   * 맨몸 · 받침이면 kg 칸 없음, 바벨 '봉 포함', 덤벨 '한 손', 케이블 '케이블 머신 설정값', 밴드면 상표 → 계열 → 단계.
   * 이 칸을 모르는 옛 화면은 예전처럼 needsWeight 만 본다.
   */
  load: RecordingContract;
  /**
   * 지금 따르는 횟수 · 버티는 시간(EX-RX01) — 내 목표가 있으면 그것, 없으면 오늘 추천. 처방 글을 읽어 맞히지 않게 숫자로도 싣는다.
   * 이 칸을 모르는 옛 화면은 그냥 지나친다(옛 판에도 값이 있다 — 얼린 plannedReps · plannedHoldSeconds).
   */
  plannedReps?: number | null;
  plannedHoldSeconds?: number | null;
  /** 내 목표 무게(kg) — 사용자가 정했을 때만. 화면이 추천 무게보다 먼저 '목표 담기'로 쓴다. 없으면 null */
  targetKg?: number | null;
  /**
   * EX-LOAD01-R1 — 지금 따르는 장비 목표(밴드 · 섞임 · 고른 변형 · 기구 이름 · 양손 다른 무게, lib/workout/load/target.ts). 통증 날 쉬어 둔 것 ·
   * 다른 앱 버전이 저장한 것은 빼고 null. 화면은 손대지 않은 다음 세트 칸만 이것으로 채운다(남긴 세트 · 고치던 칸은 그대로).
   * 이 칸을 모르는 옛 화면은 지나친다.
   */
  targetLoad?: LoadTarget | null;
  /**
   * 목표 세 층(라이브러리 기본 · 오늘 추천 · 내 목표)과 바꿀 수 있는 칸 · 근거 · 어림 시간(lib/workout/target-override.ts).
   * 위 prescription · plannedSets · restSeconds 는 이미 '지금 따르는 값'으로 맞춰 둔다 — 쉬는 시계 · 진행 · 세트 점이 같은 값을 본다.
   */
  target?: TargetView;
};

/** 목표 근거를 만들 때 쓰는 판 쪽 정보 — 없으면 운동 하나의 정보만으로 */
export type RunPlanContext = {
  goal?: string | null;
  volume?: PlanVolume | null;
  /** 그 판 날짜 체크인에 통증이 있나(lib/workout/target-edit.ts loadPainToday) — 있으면 올려 둔 내 목표 칸을 쉬어 둔다 */
  painToday?: boolean | Promise<boolean>;
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
  sessionDate: Date,
  /** 목표 근거(오늘 목표 · 양 조절 까닭) — 판에서 넘긴다 */
  plan?: RunPlanContext
): Promise<RunExercise[]> {
  const ids = entries.map((e) => e.id);
  const painToday = (await plan?.painToday) === true;

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
    /* EX-LOAD01 — 무게 최고는 이 판의 견줌 열쇠와 같은 기록만(다른 뜻 · 다른 기구와 안 견줌) */
    priorBests(userId, ids, sessionDate, new Map(entries.map((e) => [e.id, contractOfFrozen(e).key]))),
  ]);
  const byId = new Map(details.map((d) => [d.id, d]));

  return entries.map((e) => {
    const d = byId.get(e.id);
    /* 처방을 찍기 전에 연 판(undefined)은 라이브러리 값으로 */
    const recRest = e.restSeconds !== undefined ? e.restSeconds : (d?.restSeconds ?? null);
    /* 라이브러리 기본 — 관리자가 검수한 모두의 값(읽기만). 버티기 운동이면 횟수 칸은 비운다 */
    const baseline = d
      ? {
          sets: d.sets ?? null,
          reps: e.isHold ? null : (d.reps ?? null),
          holdSeconds: e.isHold ? (d.holdSeconds ?? null) : null,
          restSeconds: d.restSeconds ?? null,
          kg: null,
        }
      : null;
    const t = targetView(
      e,
      recRest,
      baseline,
      basisOf({
        suggestNote: e.suggestNote,
        volumeWhy: plan?.volume?.setDelta ? plan.volume.why : null,
        programLine: !!e.programSlot,
        goal: plan?.goal ?? null,
        cautious: !e.programSlot && /\d+개 남기고/.test(e.prescription ?? ''),
      }),
      { painToday }
    );
    return {
      id: e.id,
      title: e.title,
      category: e.category,
      slot: e.slot,
      /* 내 목표가 있으면 그 값으로 다시 쓴 줄, 없으면 얼린 줄 그대로(옛 판과 같다) */
      prescription: t.prescription,
      plannedSets: t.plannedSets,
      restSeconds: t.restSeconds,
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
      ...(e.askReserve === true ? { askReserve: true } : {}),
      ...(typeof e.warmupNote === 'string' ? { warmupNote: e.warmupNote } : {}),
      suggestedKg: e.suggestedKg ?? null,
      suggestNote: e.suggestNote ?? null,
      setTargets: e.setTargets ?? null,
      load: contractOfFrozen(e),
      plannedReps: t.view.effective.reps,
      plannedHoldSeconds: t.view.effective.holdSeconds,
      targetKg: t.targetKg,
      targetLoad: t.targetLoad,
      target: t.view,
    };
  });
}
