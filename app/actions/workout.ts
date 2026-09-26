'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { exercisesByIds, type CachedExercise } from '@/lib/library-cache';
import { loadTodayCore } from '@/lib/report/today-data';
import { selectCandidates } from '@/lib/report/prescription';
import { slotForTheme } from '@/lib/report/theme';
import { recentExerciseIds } from '@/lib/report/exercise-recent';
import { favoriteExerciseIds } from '@/lib/favorites';
import { toDateKey } from '@/lib/pitch-stats';
import { AMOUNT_LIMITS, formatPrescription, storedKg } from '@/lib/exercise-meta';
import { freezeExercise, freezePlan, readFrozenPlan } from '@/lib/workout/session-plan';
import { runExercises, type RunExercise } from '@/lib/workout/run-exercises';
import {
  placeExercise,
  similarExercises,
  swapMode,
  type SwapMode,
} from '@/lib/workout/swap';
import { clampRecordedAt } from '@/lib/workout/set-time';
import { dayStart, isAbandoned, sessionEnd } from '@/lib/workout/stale';
import { closeAbandoned, lastSetAt, summaryWrites } from '@/lib/workout/close-stale';
import { saveTrainingNote } from '@/app/actions/exercise-log';

/**
 * 실시간 운동 세션.
 *
 * ■ 세트를 저장할 때 revalidatePath 를 부르지 않는다
 *
 * 지금 체크 한 번이 /today·/training 두 개를 다시 그린다
 * (app/actions/exercise-log.ts). 세트마다 그러면 세트 열 개에 서른 번 다시
 * 그린다. 그보다 나쁜 것은, 서버가 다시 그릴 때마다 화면이 서버 값을 받아
 * 입력 중이던 숫자를 덮어쓸 수 있다는 것이다.
 *
 * 그래서 세트 저장은 바뀐 줄만 돌려주고, 다시 그리기는 종료할 때 한 번만
 * 한다.
 */

/* ------------------------------ 시작 ------------------------------ */

/**
 * 오늘의 운동을 연다.
 *
 * 이미 열어 둔 것이 있으면 그것을 이어서 연다 — 하루에 하나다. 오후에 다시
 * 들어왔다고 새 판을 열면 오전에 한 것과 합계가 갈린다.
 */
export async function startWorkout() {
  const user = await requireUser();
  const today = new Date();
  const core = await loadTodayCore(user, today);

  /* 통증이 있는 날은 목록이 비어 있다. 쉬는 화면으로 보낸다. */
  if (core.picked.halted) redirect('/workout/rest');

  const open = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId: user.id, date: core.midnight } },
  });
  if (open && open.status === 'ACTIVE') redirect('/workout/run');

  if (core.shownPicks.length === 0) {
    /* 만들어 둔 일정이 없다. 먼저 만들게 되돌려 보낸다. */
    redirect('/training?view=today');
  }

  /* 테마는 만들어 둔 일정에 적혀 있다 (lib/report/daily-plan.ts 의 DailyPlan) */
  const theme = core.savedPlan?.theme;
  if (!theme) redirect('/training?view=today');

  const details = await exercisesByIds(core.shownPicks.map((p) => p.exerciseId));
  const plan = freezePlan(
    theme.key,
    theme.label,
    core.shownPicks,
    new Map(details.map((ex) => [ex.id, ex]))
  );

  if (plan.exercises.length === 0) redirect('/training?view=today');

  /*
   * 워밍업 창을 건너뛰는 두 경우.
   *
   * 하나는 회복 데이다 — 그날 목록 자체가 가볍게 푸는 운동들이라, 그 앞에 또
   * 푸는 순서를 두면 할 일이 두 배가 된다 (lib/workout/warmup-kind.ts).
   *
   * 둘은 오늘 이미 한 번 지난 판을 다시 여는 경우다. 아침에 마치고 저녁에
   * 다시 들어왔다고 워밍업을 또 시킬 일은 아니다.
   */
  const noWarmup = plan.themeKey === 'recovery' || open?.warmupOutcome != null;

  /*
   * 다시 여는 판도 시각을 새로 찍는다.
   *
   * 휴식 시계가 이 값을 기준으로 '이 뒤에 남긴 세트'만 세기 때문이다
   * (app/(session)/workout/run/page.tsx). 아침 값을 그대로 두면 저녁에 들어와
   * '9시간째 쉬는 중'이 뜬다.
   */
  const mainStartedAt = noWarmup ? new Date() : null;

  await prisma.trainingSession.upsert({
    where: { userId_date: { userId: user.id, date: core.midnight } },
    create: {
      userId: user.id,
      date: core.midnight,
      themeKey: plan.themeKey,
      plan,
      status: 'ACTIVE',
      mainStartedAt,
    },
    update: {
      /* 한 번 닫은 판을 다시 열 때 — 목록을 새로 찍고 상태를 되돌린다 */
      themeKey: plan.themeKey,
      plan,
      status: 'ACTIVE',
      endedAt: null,
      mainStartedAt,
    },
  });

  redirect(mainStartedAt ? '/workout/run' : '/workout/warmup');
}

/* ----------------------------- 워밍업 ----------------------------- */

/**
 * 워밍업 창을 나간다. 여기서부터 본운동 시간이다.
 *
 * 체크한 것은 이름만 남기고 UserExerciseLog 에는 줄을 만들지 않는다. 줄이
 * 생기면 운동 부하·부위별 세트 수·'최근에 한 운동'·달력의 개수까지 오염된다
 * (prisma/schema.prisma 의 warmupDoneIds 주석).
 *
 * 건너뛰어도 체크한 것은 그대로 담는다. 셋 중 둘만 하고 넘어가는 날이 있고,
 * 그날을 '아무것도 안 함'으로 적어 두면 사실과 다르다.
 */
export async function finishWarmup(input: {
  skipped: boolean;
  doneIds: string[];
}): Promise<{ error: string } | never> {
  const user = await requireUser();
  const session = await activeSession(user.id);
  if (!session) redirect('/training?view=today');

  /* 이미 지난 창이다. 두 번 누르거나 뒤로가기로 들어와도 시각을 덮지 않는다. */
  if (session.mainStartedAt) redirect('/workout/run', RedirectType.replace);

  const doneIds = Array.isArray(input.doneIds)
    ? [...new Set(input.doneIds.filter((v) => typeof v === 'string' && v))].slice(0, 50)
    : [];

  await prisma.trainingSession.update({
    where: { id: session.id },
    data: {
      mainStartedAt: new Date(),
      warmupOutcome: input.skipped ? 'SKIPPED' : 'DONE',
      warmupDoneIds: doneIds,
    },
  });

  redirect('/workout/run', RedirectType.replace);
}

/* ------------------------------ 세트 ------------------------------ */

export type SetInput = {
  /**
   * 어느 판의 세트인가.
   *
   * 신호가 없어 폰에 담아 둔 세트는 한참 뒤에 보내질 수 있다 (lib/workout/
   * outbox.ts). 그사이 판이 바뀌었으면 엉뚱한 판에 붙으면 안 되므로, 담을 때의
   * 판을 함께 보낸다. 안 주면 지금 열려 있는 판이다.
   */
  sessionId?: string;
  exerciseId: string;
  /**
   * 세트 번호. 화면이 정해서 보낸다.
   *
   * 번호를 주면 (판, 운동, 번호)로 덮어쓰므로, 응답을 못 받아 같은 세트를
   * 다시 보내도 한 줄로 남는다. 안 주면 그 운동의 다음 번호로 붙는데, 그러면
   * 다시 보낼 때마다 한 줄씩 늘어난다.
   */
  setNo?: number;
  weightKg?: number | null;
  reps?: number | null;
  holdSeconds?: number | null;
  /** 누른 순간(ISO). 늦게 보내도 이 시각으로 남긴다. 없으면 받은 시각. */
  recordedAt?: string;
};

export type SavedSet = {
  setNo: number;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  recordedAt: string;
};

type SetResult = { sets: SavedSet[] } | { error: string };

/** 1 이상 limit 이하의 정수만. 아니면 null. */
function whole(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 1 && n <= limit ? n : null;
}

/**
 * 무게는 kg 소수 둘째 자리까지(storedKg). 0 이하면 '안 적음'으로 본다.
 *
 * 0.5kg 자리로 맞추던 때가 있었다. lb 로 적은 값이 그 반올림에 걸려
 * 되돌렸을 때 다른 숫자가 됐다(135lb → 134.5lb).
 */
function weight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = storedKg(value);
  return n > 0 && n <= AMOUNT_LIMITS.weightKg ? n : null;
}

async function activeSession(userId: string) {
  return prisma.trainingSession.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { date: 'desc' },
  });
}

/**
 * 세트를 붙일 판.
 *
 * 화면이 판 번호를 주면 그 판이 이 사람 것이고 아직 열려 있을 때만 쓴다.
 * 이미 마친 판에 세트를 더하면 요약(운동기록)과 세트가 어긋나므로 받지 않는다.
 */
async function sessionForSet(userId: string, sessionId: unknown) {
  if (typeof sessionId !== 'string' || !sessionId) return activeSession(userId);
  const s = await prisma.trainingSession.findFirst({
    where: { id: sessionId, userId },
  });
  return s?.status === 'ACTIVE' ? s : null;
}

async function setsOf(sessionId: string): Promise<SavedSet[]> {
  const rows = await prisma.userExerciseSet.findMany({
    where: { sessionId },
    orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }],
    select: {
      setNo: true,
      exerciseId: true,
      weightKg: true,
      reps: true,
      holdSeconds: true,
      recordedAt: true,
    },
  });
  return rows.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() }));
}

/**
 * 세트 하나를 남긴다.
 *
 * 같은 번호로 다시 보내면 덮어쓴다. 신호가 끊겼다 다시 보내는 경우가
 * 그렇다 — 두 번 쌓이면 부하가 두 배가 된다.
 */
export async function logSet(input: SetInput): Promise<SetResult> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, input.sessionId);
  if (!session) return { error: '이미 마친 운동이라 이 세트는 저장하지 못했습니다.' };

  const plan = readFrozenPlan(session.plan);
  const ex = plan?.exercises.find((e) => e.id === input.exerciseId);
  if (!ex) return { error: '오늘 목록에 없는 운동입니다.' };

  const w = weight(input.weightKg);
  const reps = whole(input.reps, AMOUNT_LIMITS.reps);
  const hold = whole(input.holdSeconds, AMOUNT_LIMITS.holdSeconds);

  /* 바벨·덤벨은 무게를 안 적으면 남길 수 없다 — 몇 kg 을 들었는지가 곧 그날의 운동이다 */
  if (ex.needsWeight && w == null) return { error: '무게를 적어주세요.' };
  if (reps == null && hold == null) {
    return { error: ex.isHold ? '버틴 시간을 적어주세요.' : '횟수를 적어주세요.' };
  }

  let setNo = whole(input.setNo, AMOUNT_LIMITS.sets);
  if (setNo == null) {
    const last = await prisma.userExerciseSet.findFirst({
      where: { sessionId: session.id, exerciseId: ex.id },
      orderBy: { setNo: 'desc' },
      select: { setNo: true },
    });
    setNo = (last?.setNo ?? 0) + 1;
    if (setNo > AMOUNT_LIMITS.sets) return { error: '세트가 너무 많습니다.' };
  }

  const at = clampRecordedAt(input.recordedAt, session.startedAt);

  /*
   * 어젯밤 판에 오늘 세트가 붙지 않게 한다.
   *
   * 운동 화면을 켜 둔 채 두었다가 다음 날 그 화면에서 세트를 남기면, 그 세트가
   * 어제 날짜의 판에 들어갔다. 판의 날짜가 지났고, 이 세트가 그 판에서 마지막으로
   * 무언가 한 뒤 3시간도 더 지나 남긴 것이면 그 판은 떠난 판이다(lib/workout/
   * stale.ts). 닫고 — 앞서 남긴 세트는 기록으로 접힌다 — 오늘 판을 새로 열게 한다.
   *
   * 신호가 없어 폰에 담아 두었다가 늦게 보내는 세트는 남긴 시각(at)이 그 판의
   * 시간 안이라 그대로 받는다. 자정을 넘겨 이어 하는 판도 마찬가지다.
   */
  if (session.date.getTime() < dayStart(new Date()).getTime()) {
    const last = await lastSetAt(session.id);
    if (isAbandoned(session, last, at)) {
      await closeAbandoned(user.id, session, last, new Date());
      return {
        error:
          '지난번 운동은 종료를 누르지 않은 채 남아 있어서 닫아 두었습니다. 오늘 운동은 트레이닝에서 새로 시작해 주세요.',
      };
    }
  }

  await prisma.userExerciseSet.upsert({
    where: {
      sessionId_exerciseId_setNo: { sessionId: session.id, exerciseId: ex.id, setNo },
    },
    create: {
      sessionId: session.id,
      userId: user.id,
      exerciseId: ex.id,
      /* 세션이 정한 날짜를 베껴 쓴다. 자정을 넘겨도 안 갈린다. */
      date: session.date,
      setNo,
      weightKg: w,
      reps,
      holdSeconds: hold,
      recordedAt: at,
    },
    update: { weightKg: w, reps, holdSeconds: hold, recordedAt: at },
  });

  /* 일부러 revalidatePath 를 안 부른다 (맨 위 설명 참고) */
  return { sets: await setsOf(session.id) };
}

/** 잘못 적은 세트를 지운다. 번호는 다시 매기지 않는다 — 화면에서 순서대로 센다. */
export async function deleteSet(input: {
  sessionId?: string;
  exerciseId: string;
  setNo: number;
}): Promise<SetResult> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, input.sessionId);
  if (!session) return { error: '이미 마친 운동이라 지울 수 없습니다.' };

  await prisma.userExerciseSet.deleteMany({
    where: {
      sessionId: session.id,
      exerciseId: input.exerciseId,
      setNo: input.setNo,
    },
  });
  return { sets: await setsOf(session.id) };
}

/* ------------------------------ 종료 ------------------------------ */

/**
 * 운동을 닫는다.
 *
 * 세트에서 운동별 요약을 다시 계산해 UserExerciseLog 에 채운다. 부하 지수·
 * 부위별 세트 수·달력이 전부 그 표를 읽으므로, 여기까지 해야 오늘 한 것이
 * 앱 전체에 반영된다.
 *
 * 세트가 하나도 없는 운동은 건드리지 않는다. 열었다가 아무것도 안 한 운동을
 * '했다'로 남길 수는 없다.
 */
export async function finishWorkout(input: {
  /**
   * 마칠 판. 운동 화면이 들고 있는 판 번호를 보낸다.
   *
   * 예전에는 '가장 최근에 열린 판'을 닫았다. 어제 종료를 안 누른 판이 남아 있는
   * 채로, 오늘 판을 마친 응답이 끊겨 한 번 더 누르면 — 오늘 판은 이미 닫혔으니 —
   * 어제 판이 닫히고 오늘 고른 강도·느낀점이 어제 날짜에 덮였다. 판을 콕 집으면
   * 그럴 일이 없다. 안 주면(옛 화면) 예전처럼 열린 판을 찾는다.
   */
  sessionId?: string;
  intensity?: number | null;
  memo?: string | null;
}): Promise<{ error: string } | never> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, input.sessionId);
  if (!session) redirect('/training?view=today');

  /*
   * 본운동을 시작한 뒤로 흐른 시간. 워밍업은 안 들어간다.
   *
   * 마지막 세트 뒤로 3시간 넘게 지나서 누른 종료면, 그 마지막 세트가 끝이다
   * (lib/workout/stale.ts 의 sessionEnd). 아침 판의 종료를 저녁에야 눌렀다고
   * 그 사이가 운동 시간이 되지는 않는다.
   */
  const { endedAt, segmentSeconds } = sessionEnd(
    session,
    await lastSetAt(session.id),
    new Date()
  );

  await prisma.$transaction([
    ...(await summaryWrites(user.id, session)),
    prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        status: 'FINISHED',
        endedAt,
        /*
         * 이 구간의 운동 시간을 더한다. 다시 열어 이어 한 판이면 앞 구간에
         * 쌓이고, 처음 마치는 판이면 0 에 더해진다 (스키마의 activeSeconds).
         */
        activeSeconds: { increment: segmentSeconds },
      },
    }),
  ]);

  /* 체감 강도는 세션 날짜로 남긴다 — 자정을 넘겨도 세트와 짝이 맞게 */
  if (typeof input.intensity === 'number') {
    await saveTrainingNote(input.intensity, input.memo ?? '', toDateKey(session.date));
  }

  revalidatePath('/today');
  revalidatePath('/training');
  redirect('/training?view=today', RedirectType.replace);
}

/* ---------------------------- 목록 고치기 ---------------------------- */

/**
 * 운동하는 도중에 오늘 순서를 바꾸거나 뺀다.
 *
 * 받은 순서 그대로 다시 쓰고, 목록에 없는 것은 오늘 안 하는 것으로 본다.
 * 헬스장에서는 기구가 차 있어서 순서를 바꾸는 일이 잦고, 그때마다 화면을
 * 나가 일정을 고치고 다시 들어오게 할 수는 없다.
 *
 * 고치는 것은 세션뿐이다. 트레이닝 화면의 일정은 그대로 둔다 — 세션은
 * '오늘 실제로 하는 순서'이고 일정은 '처방받은 것'이라 성격이 다르다.
 * 뺀 운동은 기록이 안 남으므로 저절로 '안 함'이 된다.
 */
export async function reorderSession(
  exerciseIds: string[],
  /** 고칠 판 — 운동 화면이 들고 있는 판 번호. 안 주면 열려 있는 판(finishWorkout 과 같은 까닭) */
  sessionId?: string
): Promise<{ ids: string[] } | { error: string }> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, sessionId);
  if (!session) return { error: '열려 있는 운동이 없습니다.' };

  const plan = readFrozenPlan(session.plan);
  if (!plan) return { error: '오늘 목록을 읽지 못했습니다.' };

  /* 중복은 버리고, 목록에 실제로 있는 것만 남긴다 */
  const want = exerciseIds.filter((id, i) => exerciseIds.indexOf(id) === i);
  const byId = new Map(plan.exercises.map((e) => [e.id, e]));
  const next = want.flatMap((id) => {
    const found = byId.get(id);
    return found ? [found] : [];
  });

  if (next.length === 0) return { error: '운동을 모두 뺄 수는 없습니다.' };

  /*
   * 이미 세트를 남긴 운동은 못 뺀다.
   *
   * 빼면 기록이 붕 뜬다 — 목록에는 없는데 세트는 남아 있고, 종료할 때
   * 그것까지 요약으로 접힌다. 지우려면 세트를 먼저 지우게 한다.
   */
  const dropped = plan.exercises.filter((e) => !want.includes(e.id)).map((e) => e.id);
  if (dropped.length > 0) {
    const has = await prisma.userExerciseSet.findFirst({
      where: { sessionId: session.id, exerciseId: { in: dropped } },
      select: { exerciseId: true },
    });
    if (has) return { error: '이미 기록을 남긴 운동은 뺄 수 없습니다.' };
  }

  await prisma.trainingSession.update({
    where: { id: session.id },
    data: { plan: { ...plan, exercises: next } as unknown as Prisma.InputJsonValue },
  });

  /* 화면은 이미 운동 정보를 들고 있다. 순서만 돌려주면 된다. */
  return { ids: next.map((e) => e.id) };
}

/* ---------------------------- 운동 바꾸기 ---------------------------- */

/**
 * 교체 창에 늘어놓는 운동 한 줄 — 추천·즐겨찾기·최근·찾기가 같이 쓴다.
 *
 * 창에 그리는 것만 싣는다. 찾기용으로 400개 넘게 한꺼번에 보내는 모양이라,
 * 약한 신호에서 창이 늦게 뜨지 않게 가볍게 둔다.
 */
export type SwapPick = {
  id: string;
  title: string;
  category: string;
  equipment: string[];
  /** '3세트 × 10회 · 세트 사이 2분 휴식'. 안 채운 운동은 null */
  prescription: string | null;
};

export type SwapChoices = {
  /** 통증 등으로 오늘은 운동을 더하거나 바꿀 수 없으면 그 까닭 */
  halted: string | null;
  /** 비슷한 운동 — 오늘 장비·경력·몸 상태를 모두 통과한 것만, 이유 한 줄과 함께 */
  similar: { id: string; reason: string }[];
  /** 오늘 몸 상태로는 넣을 수 없는 운동 (찾기·즐겨찾기·최근에서 막아 둔다) */
  blockedIds: string[];
  favoriteIds: string[];
  /** 최근에 한 운동, 가장 최근 것부터 */
  recentIds: string[];
  /**
   * 찾기에 쓰는 전체 목록. 누가 보든 같고 400개가 넘어, 화면이 처음 한 번만
   * 달라고 한다(withLibrary). 나머지는 창을 열 때마다 새로 받는다 — 그사이
   * 체크인을 고쳤을 수 있다.
   */
  library: SwapPick[] | null;
};

const toSwapPick = (ex: CachedExercise): SwapPick => ({
  id: ex.id,
  title: ex.title,
  category: ex.category,
  equipment: ex.equipment,
  prescription: formatPrescription(ex),
});

const HALTED_MESSAGE = '오늘은 통증 신호가 있어 운동을 더하거나 바꿀 수 없습니다.';

/**
 * 운동 화면의 [교체] 창에 늘어놓을 것.
 *
 * 추천은 오늘 장비로 할 수 있고, 경력에 맞고, 오늘 몸 상태로 해도 되는 것 중에
 * 고른다 — 일정을 만들 때와 같은 거르기(lib/report/today-data.ts)를 지난
 * 후보에서 비슷한 것을 찾는다(lib/workout/swap.ts).
 *
 * 찾기·즐겨찾기·최근에서는 본인이 고르는 것이라 장비와 경력은 따지지 않는다.
 * 몸 상태만은 막는다 — 뻐근하다고 한 어깨에 무거운 프레스를 넣게 두지 않는다.
 * 넣을 때 서버가 한 번 더 본다(changeSessionExercise).
 */
export async function swapChoices(input: {
  sessionId?: string;
  exerciseId: string;
  withLibrary: boolean;
}): Promise<SwapChoices | { error: string }> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, input.sessionId);
  if (!session) return { error: '이미 마친 운동이라 바꿀 수 없습니다.' };

  const plan = readFrozenPlan(session.plan);
  const target = plan?.exercises.find((e) => e.id === input.exerciseId);
  if (!plan || !target) return { error: '오늘 목록에 없는 운동입니다.' };

  const now = new Date();
  const [core, favorites, recentIds] = await Promise.all([
    loadTodayCore(user, now),
    favoriteExerciseIds(user.id),
    recentExerciseIds(user.id, now),
  ]);

  /* 몸 상태만 본 목록 — 장비·경력으로 거르기 전의 전체에 안전 규칙만 댄다 */
  const safety = selectCandidates({
    facts: core.facts,
    plan: core.plan,
    library: core.library,
  });
  const safeIds = new Set(safety.candidates.map((ex) => ex.id));

  /* 동작 계열은 찍어 둔 목록에 없어서 라이브러리에서 읽는다(숨긴 운동이면 없음) */
  const pattern =
    core.library.find((ex) => ex.id === target.id)?.movementPattern ?? null;
  const similar = safety.halted
    ? []
    : similarExercises(
        {
          id: target.id,
          category: target.category,
          bodyParts: target.bodyParts,
          equipment: target.equipment,
          intensity: target.intensity,
          movementPattern: pattern,
        },
        core.picked.candidates,
        new Set(plan.exercises.map((e) => e.id))
      );

  return {
    halted: safety.halted ? (safety.haltReason ?? HALTED_MESSAGE) : null,
    similar: similar.map((s) => ({ id: s.exercise.id, reason: s.reason })),
    blockedIds: core.library.filter((ex) => !safeIds.has(ex.id)).map((ex) => ex.id),
    favoriteIds: [...favorites],
    recentIds,
    library: input.withLibrary ? core.library.map(toSwapPick) : null,
  };
}

/**
 * 운동 중에 운동을 바꾸거나 더한다.
 *
 * 세트를 남긴 운동은 바꾸지 않고 바로 뒤에 더한다(lib/workout/swap.ts 의
 * swapMode). 화면이 '바꾸기'를 보냈어도 서버에 세트가 있으면 더한다 — 돌려주는
 * mode 가 실제로 한 일이다.
 *
 * 고치는 것은 세션뿐이다. 트레이닝 화면의 일정은 그대로 둔다 — 순서 바꾸기
 * (reorderSession)와 같은 까닭이다.
 */
export async function changeSessionExercise(input: {
  sessionId?: string;
  fromId: string;
  toId: string;
  mode: SwapMode;
}): Promise<{ exercise: RunExercise; mode: SwapMode } | { error: string }> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, input.sessionId);
  if (!session) return { error: '이미 마친 운동이라 바꿀 수 없습니다.' };

  const plan = readFrozenPlan(session.plan);
  if (!plan) return { error: '오늘 목록을 읽지 못했습니다.' };
  const from = plan.exercises.find((e) => e.id === input.fromId);
  if (!from) return { error: '오늘 목록에 없는 운동입니다.' };
  if (plan.exercises.some((e) => e.id === input.toId)) {
    return { error: '이미 오늘 목록에 있는 운동입니다.' };
  }

  const core = await loadTodayCore(user, new Date());
  /* 숨긴 운동은 새로 넣지 않는다 — 라이브러리에서 안 보이는 운동이다 */
  const to = core.library.find((ex) => ex.id === input.toId);
  if (!to) return { error: '운동을 찾을 수 없습니다.' };

  /* 몸 상태는 서버가 다시 본다 — 창을 연 뒤에 체크인을 고쳤을 수 있다 */
  const safety = selectCandidates({
    facts: core.facts,
    plan: core.plan,
    library: [to],
  });
  if (safety.halted) return { error: HALTED_MESSAGE };
  if (safety.candidates.length === 0) {
    return { error: '오늘 몸 상태에는 권하지 않는 운동이라 넣지 않았습니다.' };
  }

  const hasSets = await prisma.userExerciseSet.findFirst({
    where: { sessionId: session.id, exerciseId: from.id },
    select: { id: true },
  });
  const mode = swapMode(input.mode === 'add' ? 'add' : 'replace', hasSets != null);

  /*
   * 바꿀 때는 그 자리(구간)를 이어받는다. 더할 때는 그 운동이 오늘 날에
   * 어울리는 구간을 따른다 — 트레이닝의 '운동 추가'와 같다(slotForTheme).
   */
  const entry = freezeExercise(
    to,
    mode === 'replace' ? from.slot : slotForTheme(to, plan.themeKey)
  );
  const next = placeExercise(plan.exercises, from.id, entry, mode);
  if (!next) return { error: '운동을 넣지 못했습니다. 목록을 다시 열어 주세요.' };

  await prisma.trainingSession.update({
    where: { id: session.id },
    data: { plan: { ...plan, exercises: next } as unknown as Prisma.InputJsonValue },
  });

  /* 화면이 바로 그릴 수 있게 — 설명·영상·지난번 기록·메모·별까지 붙여 준다 */
  const [exercise] = await runExercises(user.id, [entry], session.date);
  return { exercise, mode };
}
