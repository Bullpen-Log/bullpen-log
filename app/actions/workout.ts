'use server';

import { appNow } from '@/lib/clock';
import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { exercisesByIds, type CachedExercise } from '@/lib/library-cache';
import { loadTodayCore } from '@/lib/report/today-data';
import { readDailyPlan } from '@/lib/report/daily-plan';
import { withSwaps, type PlanSwap } from '@/lib/report/plan-swaps';
import { selectCandidates } from '@/lib/report/prescription';
import { holdsWeight, planPrescription } from '@/lib/report/volume';
import { slotForTheme } from '@/lib/report/theme';
import { recentExerciseIds } from '@/lib/report/exercise-recent';
import { favoriteExerciseIds } from '@/lib/favorites';
import { toDateKey } from '@/lib/pitch-stats';
import { AMOUNT_LIMITS, formatPrescription, storedKg } from '@/lib/exercise-meta';
import {
  freezeExercise,
  freezePlan,
  programSwapEntry,
  programSwapRx,
  readFrozenPlan,
  sessionRxBasis,
  volumeToFreeze,
  type FrozenExercise,
  type FrozenPlan,
} from '@/lib/workout/session-plan';
import { activeProgram, programHistory, trainingMaxes } from '@/lib/program/load';
import { weighItem } from '@/lib/program/next-weight';
import type { ItemRx } from '@/lib/program/program';
import { isOpenSession, openSession } from '@/lib/workout/open-session';
import { withFreeWeights } from '@/lib/workout/free-weight-load';
import { loadHoldProgress } from '@/lib/nutrition/fuel-load';
import { liftCautious } from '@/lib/workout/free-weight';
import { advanceProgramDay } from '@/lib/program/advance';
import { runExercises, type RunExercise } from '@/lib/workout/run-exercises';
import {
  placeExercise,
  similarExercises,
  swapMode,
  type SwapMode,
} from '@/lib/workout/swap';
import { clampRecordedAt } from '@/lib/workout/set-time';
import { dayStart, isAbandoned, sessionEnd, STALE_AFTER_MS } from '@/lib/workout/stale';
import { closeAbandoned, lastSetAt, summaryWrites } from '@/lib/workout/close-stale';
import { warmupIdsOf } from '@/lib/workout/warmup-load';
import { intensityOfEffort } from '@/lib/workout/effort';
import { finishReceipt, recoverFollowUps, writeDailyNote, type FinishReceipt } from '@/lib/workout/finish';
import { startProgramWorkout } from '@/app/actions/program';

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
 * 그래서 세트 저장 · 지우기는 바뀐 줄만 돌려주고, 다시 그리기는 종료(finishWorkout)와 힘듦 칩(rateWorkoutEffort)에서
 * 한 번만 — 홈 · 트레이닝 · 영양(소모) · 분석이 다 읽으므로 레이아웃째 revalidatePath('/', 'layout')
 * (docs/architecture/04-interfaces.md). 안 부르는 쓰기는 staleTimes 30초 동안 다른 화면이 옛 값을 보인다 — 세트는 그래도 된다.
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
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 — 시작만 막고 진행 중인 판은 건드리지 않는다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const today = appNow();
  const core = await loadTodayCore(user, today);

  /* 통증이 있는 날은 목록이 비어 있다. 쉬는 화면으로 보낸다. */
  if (core.picked.halted) redirect('/workout/rest');

  const open = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId: user.id, date: core.midnight } },
  });
  /* 목록을 못 읽는 ACTIVE 판은 열린 판이 아니다 — 아래 openSession 이 새 목록으로 다시 연다(isOpenSession 주석) */
  if (isOpenSession(open)) redirect('/workout/run');

  /*
   * 근력 프로그램 날의 일정(2판 P6-3, 사용자 결정 D6 — 그날 일정 = 프로그램 운동 그대로)이면 매일 판으로 열지 않고 프로그램 시작에 맡긴다.
   * 매일 판으로 열면 프로그램 처방(% · 세트마다 무게) · 일차 태그가 빠져 일차가 안 넘어가고, 프로그램은 '다른 운동을 먼저 시작'으로
   * 밀린다. 프로그램 시작이 오늘 판 없음 + 하는 날이면 새로 열고, 오늘 마친 프로그램 판이면 그 판을 다시 연다(같은 규칙 한 곳).
   */
  if (core.savedPlan?.program) return startProgramWorkout();

  if (core.shownPicks.length === 0) {
    /* 만들어 둔 일정이 없다. 먼저 만들게 되돌려 보낸다. */
    redirect('/training');
  }

  /* 테마는 만들어 둔 일정에 적혀 있다 (lib/report/daily-plan.ts 의 DailyPlan) */
  const theme = core.savedPlan?.theme;
  if (!theme) redirect('/training');

  const details = await exercisesByIds(core.shownPicks.map((p) => p.exerciseId));
  const plan = freezePlan(
    theme.key,
    theme.label,
    core.shownPicks,
    new Map(details.map((ex) => [ex.id, ex])),
    /* 세트 · 횟수는 오늘 목표 · 양 조절에 맞춰 찍는다 — 트레이닝 화면 목록과 같은 값(처방 한 길, lib/report/volume.ts) */
    core.savedPlan?.goal ?? null,
    /* 다시 여는 판은 그 판의 양 조절로 — 붙는 운동이 그 판과 같은 세트로 찍힌다(openSession 의 mergeReopened) */
    volumeToFreeze(open ? readFrozenPlan(open.plan) : null, core.savedPlan?.volume)
  );

  if (plan.exercises.length === 0) redirect('/training');

  /*
   * 프로그램이 아닌 무게 운동의 추천 — 지난번 세트로(lib/workout/free-weight.ts). 다시 여는 판은 제 목록을 지킨다.
   * 양 조절이 실린 판(세트 −1, 또는 2판 P5 검토부터 몸 신호로 강도만 −1)이면 무게는 올리지 않는다(holdsWeight, 2판 P5-d). 성장기 · 입문은 올려도 한 단위 · 처방 줄에
   * '· 3개 남기고'(liftCautious, 2판 P5-g). 영양 추세 깃발이 선 주는 올림만 멈춘다(loadHoldProgress, 2판 P6-7 — 프로그램 날 무게와 같은 읽기).
   */
  const weighed = {
    ...plan,
    exercises: await withFreeWeights(user.id, plan.exercises, core.midnight, {
      hold: holdsWeight(plan),
      cautious: liftCautious(core.facts.profile),
      holdProgress: await loadHoldProgress(user.id, core.todayKey),
    }),
  };

  redirect(await openSession(user.id, core.midnight, weighed, open));
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
  /** 워밍업 창이 연 판(2026-10-30) — 주면 그 판만. 그사이 판이 바뀌었으면(어제 판이 닫히고 새 판) 덮지 않는다. 안 주면 옛 앱처럼 열린 판 */
  sessionId?: string;
}): Promise<{ error: string } | never> {
  const user = await requireUser();
  const session =
    typeof input.sessionId === 'string' && input.sessionId
      ? await prisma.trainingSession.findFirst({ where: { id: input.sessionId, userId: user.id } })
      : await activeSession(user.id);
  if (!session || session.status !== 'ACTIVE') {
    if (session?.status === 'FINISHED') return { error: '이미 마친 운동이에요. 트레이닝에서 다시 열어 주세요.' };
    redirect('/training');
  }

  /* 이미 지난 창이다. 두 번 누르거나 뒤로가기로 들어와도 시각을 덮지 않는다. */
  if (session.mainStartedAt) redirect('/workout/run', RedirectType.replace);

  /* 체크한 것 중 이 판의 워밍업 루틴에 있는 운동만 — 루틴이 비어 이름만 있는 워밍업(lib/shoot/warmups.ts)도 그 id 로 받는다 */
  const known = await warmupIdsOf(session);
  const doneIds = Array.isArray(input.doneIds)
    ? [...new Set(input.doneIds.filter((v) => typeof v === 'string' && v && (known.size === 0 || known.has(v))))].slice(0, 50)
    : [];

  /*
   * 시작 시각이 아직 없을 때만 찍는다(조건부 한 번 쓰기) — 두 기기 · 끊긴 응답에 다시 누름이 거의 같이 오면 예전엔 둘 다 '아직 없음'을 읽고
   * 뒤에 온 쪽이 시각과 건너뜀 여부를 덮었다. 0 건이면 다른 쪽이 먼저 넘긴 것 — 그 시각 그대로 본운동으로.
   */
  await prisma.trainingSession.updateMany({
    where: { id: session.id, userId: user.id, status: 'ACTIVE', mainStartedAt: null },
    data: {
      mainStartedAt: appNow(),
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
  /**
   * 근력 · 파워 프로그램의 '몇 개 더 할 수 있었나요?'(0~4) — 마지막 세트를 같은 번호로 다시 보내며 붙인다(설계 §13-7).
   * 안 보내면(undefined) 저장된 값을 그대로 둔다. null 이면 지운다.
   */
  rir?: number | null;
};

export type SavedSet = {
  setNo: number;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  recordedAt: string;
  /** 프로그램의 '몇 개 더?'(0~4) — 안 답했으면 null */
  rir?: number | null;
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

/**
 * 늦게 온 세트를 받을 수 있는, 저절로 닫힌 판.
 *
 * 신호가 없는 곳에서 남긴 세트는 폰에 담겨 있다가 나중에 보내진다(lib/workout/outbox.ts). 그런데 다음 날 앱을 열면
 * 서버가 화면을 그리기 전에 '종료를 안 누른 판'을 먼저 닫는다(lib/workout/close-stale.ts) — 서버가 가진 세트만 보고.
 * 그 뒤에 폰이 보낸 세트는 '이미 마친 운동'으로 거절되고 폰에서도 지워져, 신호 없이 한 세트가 통째로 사라졌다.
 * 그래서 저절로 닫힌 판(ABANDONED)은 그 판에 담아 둔 세트를 받는다 — 판 번호는 담을 때의 것이라 그 판의 세트가 맞다.
 * 사람이 [종료]를 누른 판(FINISHED)은 받지 않는다 — 종료는 못 보낸 세트가 있으면 막힌다.
 */
async function abandonedSessionForSet(userId: string, sessionId: unknown) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  return prisma.trainingSession.findFirst({
    where: { id: sessionId, userId, status: 'ABANDONED' },
  });
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
      rir: true,
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
  const session =
    (await sessionForSet(user.id, input.sessionId)) ??
    (await abandonedSessionForSet(user.id, input.sessionId));
  if (!session) return { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.' };
  /* 저절로 닫힌 뒤에 늦게 온 세트(위 abandonedSessionForSet) */
  const late = session.status === 'ABANDONED';

  const plan = readFrozenPlan(session.plan);
  const ex = plan?.exercises.find((e) => e.id === input.exerciseId);
  if (!ex) return { error: '오늘 목록에 없는 운동이에요.' };

  const w = weight(input.weightKg);
  const reps = whole(input.reps, AMOUNT_LIMITS.reps);
  const hold = whole(input.holdSeconds, AMOUNT_LIMITS.holdSeconds);
  /* '몇 개 더?'는 프로그램 칸의 운동에만 받는다 — 0~4 밖은 버린다 */
  const rir =
    input.rir === undefined || !ex.programSlot
      ? undefined
      : input.rir === null
        ? null
        : typeof input.rir === 'number' &&
            Number.isInteger(input.rir) &&
            input.rir >= 0 &&
            input.rir <= 4
          ? input.rir
          : undefined;

  /* 바벨·덤벨은 무게를 안 적으면 남길 수 없다 — 몇 kg 을 들었는지가 곧 그날의 운동이다 */
  if (ex.needsWeight && w == null) return { error: '무게를 적어 주세요.' };
  if (reps == null && hold == null) {
    return { error: ex.isHold ? '버틴 시간을 적어 주세요.' : '횟수를 적어 주세요.' };
  }

  let setNo = whole(input.setNo, AMOUNT_LIMITS.sets);
  if (setNo == null) {
    const last = await prisma.userExerciseSet.findFirst({
      where: { sessionId: session.id, exerciseId: ex.id },
      orderBy: { setNo: 'desc' },
      select: { setNo: true },
    });
    setNo = (last?.setNo ?? 0) + 1;
    if (setNo > AMOUNT_LIMITS.sets) return { error: '세트가 너무 많아요.' };
  }

  const at = clampRecordedAt(input.recordedAt, session.startedAt);
  /*
   * 늦게 온 세트는 그 판을 하던 때의 것만 — 닫힌 끝 시각(마지막으로 무언가 한 때)에서 3시간 안. 그보다 뒤라면 그 판을
   * 하던 중이 아니다(3시간 넘게 아무 일이 없으면 떠난 판으로 친다, lib/workout/stale.ts).
   */
  /*
   * 다만 끝 시각은 서버가 아는 마지막 세트 기준이라, 신호 없이 오래 한 운동(세트가 하나도 안 올라간 채 3시간 넘게)은
   * 그 뒤 세트가 모두 거절되어 폰 대기열에서 조용히 사라졌다(2026-10-16 점검 A1). 그래서 판의 날짜 안에 남긴 세트
   * (남긴 시각에서 3시간을 빼도 아직 그 날짜)도 받는다 — 자정을 넘긴 판의 늦은 세트와 같은 기준이다.
   */
  const onSessionDay =
    toDateKey(new Date(at.getTime() - STALE_AFTER_MS)) <= toDateKey(session.date);
  if (
    late &&
    !onSessionDay &&
    at.getTime() > (session.endedAt ?? session.startedAt).getTime() + STALE_AFTER_MS
  ) {
    return { error: '이미 마친 운동이라 이 세트는 저장하지 못했어요.' };
  }

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
  if (!late && session.date.getTime() < dayStart(appNow()).getTime()) {
    const last = await lastSetAt(session.id);
    if (isAbandoned(session, last, at)) {
      await closeAbandoned(user.id, session, last, appNow());
      return {
        error:
          '지난번 운동은 종료를 누르지 않은 채 남아 있어서 닫아 두었어요. 오늘 운동은 트레이닝에서 새로 시작해 주세요.',
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
      rir: rir ?? null,
    },
    update: {
      weightKg: w,
      reps,
      holdSeconds: hold,
      recordedAt: at,
      ...(rir !== undefined ? { rir } : {}),
    },
  });

  /*
   * 닫힌 판에 늦게 온 세트 — 운동 기록(요약)을 세트에서 다시 접고, 이 세트가 닫힌 끝보다 뒤면 끝 시각 · 운동 시간을
   * 그만큼 늘린다. 닫을 때와 같은 쓰기라 두 번 돌아도 달라지지 않는다.
   */
  if (late) {
    const end = session.endedAt ?? at;
    const extra = Math.max(0, Math.floor((at.getTime() - end.getTime()) / 1000));
    await prisma.$transaction([
      ...(await summaryWrites(user.id, session)),
      ...(extra > 0
        ? [
            prisma.trainingSession.update({
              where: { id: session.id },
              data: { endedAt: at, activeSeconds: { increment: extra } },
            }),
          ]
        : []),
    ]);
    /* 늦은 세트로 처방 세트의 절반을 넘겼으면 프로그램 일차를 넘긴다(U4 — 한 번만 넘는다) */
    await advanceProgramDay(session.id).catch(() => false);
  }

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
  if (!session) return { error: '이미 마친 운동이라 지울 수 없어요.' };

  await prisma.userExerciseSet.deleteMany({
    where: {
      sessionId: session.id,
      exerciseId: input.exerciseId,
      setNo: input.setNo,
    },
  });
  /* 세트 저장과 같은 까닭으로 revalidatePath 를 안 부른다 (맨 위 설명 참고) */
  return { sets: await setsOf(session.id) };
}

/* ------------------------------ 종료 ------------------------------ */

type FinishInput = {
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
};

/** 마치기 창의 강도 · 메모 — 강도는 1~10 정수(선택), 메모는 1000자. 메모만은 받지 않는다(강도와 같이 남는 계약) */
function finishNoteInput(input: FinishInput): { intensity: number | null; memo: string | null } | { error: string } {
  const raw = input.intensity;
  const intensity =
    raw == null ? null : typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : NaN;
  if (Number.isNaN(intensity)) return { error: '운동 강도를 1~10 중에서 골라 주세요.' };
  const memo = typeof input.memo === 'string' ? input.memo.trim().slice(0, 1000) || null : null;
  if (memo && intensity == null) return { error: '느낀점을 남기려면 강도도 골라 주세요.' };
  return { intensity: intensity as number | null, memo };
}

/**
 * 판을 닫는다(조건부) — 닫기 · 시간 더하기 · 요약 · 제출한 강도 · 메모(판 줄의 finishNote)를 한 트랜잭션으로. 닫았으면 true.
 * 0 건이면 다른 요청이 먼저 닫은 것 — 시간을 두 번 더하지 않는다(2026-10-16 점검 15b).
 */
async function closeSession(
  userId: string,
  session: NonNullable<Awaited<ReturnType<typeof activeSession>>>,
  note: { intensity: number | null; memo: string | null }
): Promise<boolean> {
  /*
   * 본운동을 시작한 뒤로 흐른 시간. 워밍업은 안 들어간다.
   * 마지막 세트 뒤로 3시간 넘게 지나서 누른 종료면, 그 마지막 세트가 끝이다(lib/workout/stale.ts 의 sessionEnd).
   */
  const { endedAt, segmentSeconds } = sessionEnd(session, await lastSetAt(session.id), appNow());
  const raw = session.plan && typeof session.plan === 'object' ? (session.plan as Record<string, unknown>) : {};
  const results = await prisma.$transaction([
    ...(await summaryWrites(userId, session)),
    prisma.trainingSession.updateMany({
      where: { id: session.id, status: 'ACTIVE' },
      data: {
        status: 'FINISHED',
        endedAt,
        /* 이 구간의 운동 시간을 더한다. 다시 열어 이어 한 판이면 앞 구간에 쌓인다(스키마의 activeSeconds) */
        activeSeconds: { increment: segmentSeconds },
        /* 무엇을 제출했는지 — 응답을 못 받아도 · 뒤처리가 실패해도 다시 확인할 수 있게(lib/workout/finish.ts) */
        plan: { ...raw, finishNote: { ...note, at: appNow().toISOString() } } as Prisma.InputJsonValue,
      },
    }),
  ]);
  return (results[results.length - 1] as Prisma.BatchPayload).count > 0;
}

/**
 * 운동을 닫는다(웹 · 옛 앱) — 마치면 축하 화면으로 보낸다.
 *
 * 세트에서 운동별 요약을 다시 계산해 UserExerciseLog 에 채운다. 부하 지수·부위별 세트 수·달력이 전부 그 표를 읽는다.
 * 닫은 뒤 일차 넘기기 · 그날 강도는 lib/workout/finish.ts 가 따로 하고 따로 확인한다 — 이미 닫힌 판을 다시 누르면(응답이 끊겨) 닫기는 건너뛰고
 * 그 뒤처리만 다시 해 본다(예전엔 바로 트레이닝으로 보내 실패한 뒤처리를 다시 할 길이 없었다).
 */
export async function finishWorkout(input: FinishInput): Promise<{ error: string } | never> {
  const user = await requireUser();
  const note = finishNoteInput(input);
  if ('error' in note) return note;
  const any =
    typeof input.sessionId === 'string' && input.sessionId
      ? await prisma.trainingSession.findFirst({ where: { id: input.sessionId, userId: user.id } })
      : await activeSession(user.id);
  if (!any || any.status === 'ABANDONED') redirect('/training');
  if (any.status === 'ACTIVE') await closeSession(user.id, any, note);
  const closed = await prisma.trainingSession.findUnique({ where: { id: any.id } });
  if (closed?.status === 'FINISHED') await recoverFollowUps(closed);
  /* 홈 · 트레이닝 · 영양(소모) · 분석이 다 읽는다 — 레이아웃째 한 번(맨 위 설명) */
  revalidatePath('/', 'layout');
  /* 축하 화면으로 — 바꿔 넣는다(replace) · 뒤로 가기로 닫힌 운동 화면에 돌아가지 않게 */
  redirect(`/workout/done?id=${encodeURIComponent(any.id)}`, RedirectType.replace);
}

/**
 * 운동을 닫고 영수증을 돌려준다(앱, 2026-10-30 확정 시안 08). 화면은 이 답으로 축하 화면(09)으로 가고, 답을 못 받으면 finishStatus 로 판 상태부터 본다.
 *   - 열린 판이면 닫고 뒤처리(일차 · 강도)를 한다.
 *   - 이미 마친 판이면(앞 요청이 닫았는데 답만 못 받음) 다시 닫지 않고 뒤처리만 한 번 더 해 본다 — 같은 제출로, 일차 · 시간은 한 번만.
 *   - 저절로 닫힌 판(ABANDONED)은 마칠 수 없다(state 'closed').
 * 오류는 { error, state } — 'active' 면 판은 아직 열려 있다(재시도해도 된다).
 */
export async function finishSession(
  input: FinishInput
): Promise<{ ok: true; receipt: FinishReceipt } | { error: string; state: 'active' | 'missing' | 'closed' }> {
  const user = await requireUser();
  const note = finishNoteInput(input);
  if ('error' in note) return { ...note, state: 'active' };
  if (typeof input.sessionId !== 'string' || !input.sessionId) return { error: '운동을 찾지 못했어요.', state: 'missing' };
  const session = await prisma.trainingSession.findFirst({ where: { id: input.sessionId, userId: user.id } });
  if (!session) return { error: '운동을 찾지 못했어요.', state: 'missing' };
  if (session.status === 'ABANDONED') return { error: '오래 멈춰 있던 운동이라 이미 기록으로 닫혔어요.', state: 'closed' };
  if (session.status === 'ACTIVE') await closeSession(user.id, session, note);
  const closed = await prisma.trainingSession.findUnique({ where: { id: session.id } });
  if (!closed || closed.status !== 'FINISHED') return { error: '운동을 마치지 못했어요. 다시 눌러 주세요.', state: 'active' };
  const receipt = await recoverFollowUps(closed);
  revalidatePath('/', 'layout');
  return { ok: true, receipt };
}

/** 마치기의 답을 못 받았을 때 — 판 상태만 읽는다(쓰지 않는다). 마친 판이면 세 결과까지 */
export async function finishStatus(input: { sessionId: string }): Promise<
  { state: 'ACTIVE' | 'ABANDONED' | 'missing' } | { state: 'FINISHED'; receipt: FinishReceipt }
> {
  const user = await requireUser();
  if (typeof input?.sessionId !== 'string' || !input.sessionId) return { state: 'missing' };
  const session = await prisma.trainingSession.findFirst({ where: { id: input.sessionId, userId: user.id } });
  if (!session) return { state: 'missing' };
  if (session.status === 'FINISHED') return { state: 'FINISHED', receipt: await finishReceipt(session) };
  return { state: session.status === 'ACTIVE' ? 'ACTIVE' : 'ABANDONED' };
}

/** 마친 판의 뒤처리(일차 · 강도)를 다시 해 본다 — 축하 화면의 '다시 확인'. 몇 번을 눌러도 한 번만 반영된다 */
export async function recoverFinish(input: { sessionId: string }): Promise<{ ok: true; receipt: FinishReceipt } | { error: string }> {
  const user = await requireUser();
  if (typeof input?.sessionId !== 'string' || !input.sessionId) return { error: '운동을 찾지 못했어요.' };
  const session = await prisma.trainingSession.findFirst({ where: { id: input.sessionId, userId: user.id } });
  if (!session || session.status !== 'FINISHED') return { error: '마친 운동을 찾지 못했어요.' };
  const receipt = await recoverFollowUps(session);
  revalidatePath('/', 'layout');
  return { ok: true, receipt };
}

/**
 * 이 판에 서버가 가진 세트 — 마치기 창이 '못 보낸 세트'를 빼기 전에 같은 열쇠(판 · 운동 · 번호)로 견준다(시안 08 — 답만 못 받아 서버에는 있는
 * 세트를 '없다'고 빼지 않게). 본인 판만, 읽기만.
 */
export async function sessionSets(input: { sessionId: string }): Promise<{ sets: SavedSet[] } | { error: string }> {
  const user = await requireUser();
  if (typeof input?.sessionId !== 'string' || !input.sessionId) return { error: '운동을 찾지 못했어요.' };
  const session = await prisma.trainingSession.findFirst({ where: { id: input.sessionId, userId: user.id }, select: { id: true } });
  if (!session) return { error: '운동을 찾지 못했어요.' };
  return { sets: await setsOf(session.id) };
}

/* ---------------------------- 힘듦 한 번 ---------------------------- */

/**
 * 축하 화면의 강도 — 마치기 창에서 강도를 안 고른 날, 마친 뒤 그날 DailyTrainingNote 로 남긴다.
 * 2026-10-30 부터 1~10 정수(intensity)를 그대로 받는다(시안 09 슬라이더 — 4 · 6 · 8 · 10 도 그대로). 옛 칩(effort 'light' · 'normal' · 'hard' · 'max' → 3 · 5 · 7 · 9)도 받는다.
 *
 * - 본인 판이면 된다(FINISHED 조건 없음) — 힘듦은 날짜마다 한 줄이라 판 상태와 무관하다.
 * - 그새 적은 줄이 있으면(트레이닝 탭 · 다른 기기) 덮지 않고 그 값을 돌려준다(existing). 화면은 돌려받은 값을 보인다. 메모는 건드리지 않는다.
 * - 날짜는 세션 날짜 — finishWorkout 과 같은 규칙. 7일 넘은 판은 거절하고 화면이 한 줄로 알린다.
 */
export async function rateWorkoutEffort(input: {
  sessionId: string;
  effort?: string;
  intensity?: number;
}): Promise<{ ok: true; intensity: number; existing?: boolean } | { error: string }> {
  const user = await requireUser();
  const intensity =
    input?.intensity !== undefined
      ? typeof input.intensity === 'number' && Number.isInteger(input.intensity) && input.intensity >= 1 && input.intensity <= 10
        ? input.intensity
        : null
      : intensityOfEffort(input?.effort);
  if (intensity == null) return { error: '얼마나 힘들었는지 1~10 중에서 골라 주세요.' };
  if (typeof input.sessionId !== 'string' || !input.sessionId) {
    return { error: '운동을 찾지 못했어요.' };
  }
  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, userId: user.id },
    select: { date: true },
  });
  if (!session) return { error: '운동을 찾지 못했어요.' };

  const dateKey = toDateKey(session.date);
  const existing = await prisma.dailyTrainingNote.findUnique({
    where: {
      userId_date: { userId: user.id, date: new Date(`${dateKey}T00:00:00.000Z`) },
    },
    select: { intensity: true },
  });
  if (existing) return { ok: true, intensity: existing.intensity, existing: true };

  const res = await writeDailyNote(user.id, dateKey, intensity, null);
  if ('error' in res) return res;
  /* 힘듦은 날 종류(R2) · 홈 요약이 읽는다 — 다른 탭이 30초 옛 값을 보이지 않게 레이아웃째(맨 위 설명) */
  revalidatePath('/', 'layout');
  return { ok: true, intensity: res.intensity, existing: false };
}

/* ---------------------------- 목록 고치기 ---------------------------- */

/**
 * 세션 판을 새 목록으로 쓰고, 뺀 · 바꾼 기록(entries)을 세션 판과 그날 일정에 같이 남긴다(P2, lib/report/plan-swaps.ts).
 *
 * 일정(DailyTrainingSetup.plan)의 목록(picks)은 그대로다 — 세션은 '오늘 실제로 하는 순서'이고 일정은 '처방받은 것'이라
 * 성격이 다르다. 적는 것은 기록(swaps)뿐이고, 일정 줄이 있을 때만 적는다(프로그램 날은 줄이 없어 세션 판이 유일한 기록).
 * 둘 다 되거나 둘 다 안 되게 한 트랜잭션으로. 일정은 오늘이 아니라 세션 날짜(session.date)의 줄 — 자정을 넘긴 판은
 * 세트와 같은 규칙으로 그 판의 날에 적는다. 기록이 없으면(순서만 바꿈) 세션 판만 쓰고 swaps 키도 더하지 않는다.
 */
async function writeSessionList(
  session: { id: string; userId: string; date: Date },
  plan: FrozenPlan,
  next: FrozenExercise[],
  entries: PlanSwap[]
) {
  const sessionWrite = () =>
    prisma.trainingSession.update({
      where: { id: session.id },
      data: {
        plan: {
          ...withSwaps(plan, entries),
          exercises: next,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  if (entries.length === 0) {
    await sessionWrite();
    return;
  }
  const where = { userId_date: { userId: session.userId, date: session.date } };
  const setup = await prisma.dailyTrainingSetup.findUnique({
    where,
    select: { plan: true },
  });
  const daily = readDailyPlan(setup?.plan);
  if (!daily) {
    await sessionWrite();
    return;
  }
  await prisma.$transaction([
    sessionWrite(),
    prisma.dailyTrainingSetup.update({
      where,
      data: { plan: withSwaps(daily, entries) as unknown as Prisma.InputJsonValue },
    }),
  ]);
}

/**
 * 운동하는 도중에 오늘 순서를 바꾸거나 뺀다.
 *
 * 받은 순서 그대로 다시 쓰고, 목록에 없는 것은 오늘 안 하는 것으로 본다.
 * 헬스장에서는 기구가 차 있어서 순서를 바꾸는 일이 잦고, 그때마다 화면을
 * 나가 일정을 고치고 다시 들어오게 할 수는 없다.
 *
 * 고치는 것은 세션뿐이다. 트레이닝 화면의 일정은 그대로 둔다 — 세션은
 * '오늘 실제로 하는 순서'이고 일정은 '처방받은 것'이라 성격이 다르다.
 * 뺀 운동은 기록이 안 남으므로 저절로 '안 함'이 된다. 다만 뺐다는 사실은
 * 세션 판과 그날 일정의 swaps 에 남긴다(P2) — 다음 추천이 읽는다.
 */
export async function reorderSession(
  exerciseIds: string[],
  /** 고칠 판 — 운동 화면이 들고 있는 판 번호. 안 주면 열려 있는 판(finishWorkout 과 같은 까닭) */
  sessionId?: string
): Promise<{ ids: string[] } | { error: string }> {
  const user = await requireUser();
  const session = await sessionForSet(user.id, sessionId);
  if (!session) return { error: '열려 있는 운동이 없어요.' };

  const plan = readFrozenPlan(session.plan);
  if (!plan) return { error: '오늘 목록을 읽지 못했어요.' };

  /* 중복은 버리고, 목록에 실제로 있는 것만 남긴다 */
  const want = exerciseIds.filter((id, i) => exerciseIds.indexOf(id) === i);
  const byId = new Map(plan.exercises.map((e) => [e.id, e]));
  const next = want.flatMap((id) => {
    const found = byId.get(id);
    return found ? [found] : [];
  });

  if (next.length === 0) return { error: '운동을 모두 뺄 수는 없어요.' };

  /*
   * 이미 세트를 남긴 운동은 못 뺀다.
   *
   * 빼면 기록이 붕 뜬다 — 목록에는 없는데 세트는 남아 있고, 종료할 때
   * 그것까지 요약으로 접힌다. 지우려면 세트를 먼저 지우게 한다.
   */
  const dropped = plan.exercises.filter((e) => !want.includes(e.id));
  if (dropped.length > 0) {
    const has = await prisma.userExerciseSet.findFirst({
      where: { sessionId: session.id, exerciseId: { in: dropped.map((e) => e.id) } },
      select: { exerciseId: true },
    });
    if (has) return { error: '이미 기록을 남긴 운동은 뺄 수 없어요.' };
  }

  const at = appNow().toISOString();
  await writeSessionList(
    session,
    plan,
    next,
    dropped.map((e) => ({
      from: e.id,
      to: null,
      kind: 'remove' as const,
      where: 'session' as const,
      slot: e.slot,
      at,
    }))
  );

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
  /** 오늘 몸 상태에는 권하지 않는 운동 (막지 않고 주의만 보인다) */
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

/* 처방이 멈추는 것은 최근에 아팠는데 오늘 체크인이 없는 날뿐이다(2026-10-03 — prescription.ts) */
const HALTED_MESSAGE =
  '최근 통증 기록이 있는데 오늘 체크인이 없어 운동을 더하거나 바꿀 수 없어요. 체크인을 먼저 남겨 주세요.';

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
  if (!session) return { error: '이미 마친 운동이라 바꿀 수 없어요.' };

  const plan = readFrozenPlan(session.plan);
  const target = plan?.exercises.find((e) => e.id === input.exerciseId);
  if (!plan || !target) return { error: '오늘 목록에 없는 운동이에요.' };

  const now = appNow();
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
  /* 목록의 처방은 넣을 때 찍는 처방과 같은 기준으로(sessionRxBasis — 목표는 판, 옛 판은 오늘 일정 · 양 조절은 판의 것만) */
  const rxBasis = sessionRxBasis(plan, core.savedPlan?.goal);

  return {
    halted: safety.halted ? (safety.haltReason ?? HALTED_MESSAGE) : null,
    similar: similar.map((s) => ({ id: s.exercise.id, reason: s.reason })),
    blockedIds: core.library.filter((ex) => !safeIds.has(ex.id)).map((ex) => ex.id),
    favoriteIds: [...favorites],
    recentIds,
    /* 넣은 뒤 운동 화면에 보일 횟수와 같게 — 오늘 목표 · 양 조절에 맞춘다(처방 한 길, lib/report/volume.ts) */
    library: input.withLibrary
      ? core.library.map((ex) =>
          /* 프로그램 날은 넣을 때 그 칸 · 그 주의 처방이 정해진다(U3) — 목록에 다른 횟수를 보이지 않는다 */
          plan.program
            ? { ...toSwapPick(ex), prescription: null }
            : toSwapPick(planPrescription(ex, rxBasis))
        )
      : null,
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
  if (!session) return { error: '이미 마친 운동이라 바꿀 수 없어요.' };

  const plan = readFrozenPlan(session.plan);
  if (!plan) return { error: '오늘 목록을 읽지 못했어요.' };
  const from = plan.exercises.find((e) => e.id === input.fromId);
  if (!from) return { error: '오늘 목록에 없는 운동이에요.' };
  if (plan.exercises.some((e) => e.id === input.toId)) {
    return { error: '이미 오늘 목록에 있는 운동이에요.' };
  }

  const core = await loadTodayCore(user, appNow());
  /* 숨긴 운동은 새로 넣지 않는다 — 라이브러리에서 안 보이는 운동이다 */
  const to = core.library.find((ex) => ex.id === input.toId);
  if (!to) return { error: '운동을 찾을 수 없어요.' };

  /* 몸 상태는 서버가 다시 본다 — 창을 연 뒤에 체크인을 고쳤을 수 있다 */
  const safety = selectCandidates({
    facts: core.facts,
    plan: core.plan,
    library: [to],
  });
  if (safety.halted) return { error: HALTED_MESSAGE };
  /* 오늘 몸 상태에 맞지 않는 운동도 막지 않는다 — 창이 주의를 보이고 본인이 고른다(2026-10-19 사용자 결정) */

  const hasSets = await prisma.userExerciseSet.findFirst({
    where: { sessionId: session.id, exerciseId: from.id },
    select: { id: true },
  });
  const mode = swapMode(input.mode === 'add' ? 'add' : 'replace', hasSets != null);

  /*
   * 바꿀 때는 그 자리(구간)를 이어받는다. 더할 때는 그 운동이 오늘 날에
   * 어울리는 구간을 따른다 — 트레이닝의 '운동 추가'와 같다(slotForTheme).
   */
  /*
   * 프로그램 날의 프로그램 칸에서 '바꾸기'를 누르면(세트를 남긴 뒤여도) 그 칸의 처방 · 추천 무게를 이어받는다(U3).
   * 일부러 '더하기'를 고른 것은 덤이라 지금처럼 오늘 목표 처방이다.
   */
  const loggedFrom = hasSets
    ? await prisma.userExerciseSet.count({
        where: { sessionId: session.id, exerciseId: from.id },
      })
    : 0;
  const program =
    input.mode !== 'add' && plan.program && from.programSlot
      ? programSwapEntry(
          plan,
          from,
          to,
          loggedFrom,
          await swapWeigher(
            user.id,
            programSwapRx(plan, from, loggedFrom)?.rx ?? null,
            plan.program.gapDays ?? null,
            from,
            to,
            session.date
          )
        )
      : null;

  const entry =
    program?.entry ??
    /* 자유 운동의 무게 추천도 운동 시작 때와 같이(free-weight.ts) */
    (
      await withFreeWeights(
        user.id,
        [
          freezeExercise(
            /* 처음 찍은 목록과 같은 목표 · 양 조절로 — 옛 판(목표 없음)은 오늘 일정의 목표, 양 조절은 판의 것만(sessionRxBasis) */
            planPrescription(to, sessionRxBasis(plan, core.savedPlan?.goal)),
            /* 코치 운동만 있는 판('org')은 다시 열 때 새 판의 날 종류를 받아 여기 올 일이 거의 없다 — 오면 프로그램 날처럼 'lower' 칸으로 */
            mode === 'replace' ? from.slot : slotForTheme(to, plan.themeKey === 'org' ? 'lower' : plan.themeKey)
          ),
        ],
        session.date,
        /* 판이 양을 줄였으면 바꿔 넣는 운동도 무게를 올리지 않는다 — 처음 찍은 운동과 같은 규칙(holdsWeight, 2판 P5-d · liftCautious P5-g) */
        {
          hold: holdsWeight(plan),
          cautious: liftCautious(core.facts.profile),
          /* 영양 추세 깃발의 올림 멈춤도 처음 찍은 운동과 같이(2판 P6-7) */
          holdProgress: await loadHoldProgress(user.id, toDateKey(session.date)),
        }
      )
    )[0];
  const list =
    program?.fromPlannedSets != null
      ? plan.exercises.map((e) =>
          e.id === from.id ? { ...e, plannedSets: program.fromPlannedSets } : e
        )
      : plan.exercises;
  const next = placeExercise(list, from.id, entry, mode);
  if (!next) return { error: '운동을 넣지 못했어요. 목록을 다시 열어 주세요.' };

  /* 무엇을 무엇으로 바꿨는지(또는 더했는지)를 세션 판 · 그날 일정에 남긴다(P2) — kind 는 실제로 한 mode */
  await writeSessionList(session, plan, next, [
    {
      from: from.id,
      to: entry.id,
      kind: mode,
      where: 'session',
      slot: from.slot,
      at: appNow().toISOString(),
    },
  ]);

  /* 화면이 바로 그릴 수 있게 — 설명·영상·지난번 기록·메모·별까지 붙여 준다 */
  const [exercise] = await runExercises(user.id, [entry], session.date);
  return { exercise, mode };
}

/**
 * [교체]로 넣는 운동의 무게 — 그 운동 자신의 기록으로(없으면 숫자 없이, §3). 카드 · 운동 시작과 같은 weighItem.
 * 쉰 기간은 운동 시작 때 판에 실은 값(카드와 같다), % 방식의 기준 무게는 진행 중인 줄을 시작한 날로. 무게 없는 칸은 묻지 않는다.
 */
async function swapWeigher(
  userId: string,
  rx: ItemRx | null,
  gapDays: number | null,
  from: FrozenExercise,
  to: CachedExercise,
  sessionDate: Date
): Promise<(rx: ItemRx) => { suggestedKg: number | null; kgs: (number | null)[] | null }> {
  if (!rx || rx.mode === 'none') return () => ({ suggestedKg: null, kgs: null });
  const todayKey = toDateKey(sessionDate);
  const [row, history, holdProgress] = await Promise.all([
    activeProgram(userId),
    programHistory(userId, [to.id], todayKey),
    /* 영양 추세 깃발이 선 주면 올림만 멈춘다 — 카드(program/load.ts)와 같은 읽기(2판 P6-7) */
    loadHoldProgress(userId, todayKey),
  ]);
  const tms =
    rx.mode === 'pct'
      ? await trainingMaxes(userId, [to.id], toDateKey(row?.startedAt ?? sessionDate), todayKey)
      : new Map<string, number>();
  return (r) => {
    const { suggestion, kgs } = weighItem(r, to, {
      adjusted: from.programSlot?.adjusted === true,
      gapDays,
      history: history.get(to.id) ?? [],
      tmKg: tms.get(to.id) ?? null,
      holdProgress,
    });
    return { suggestedKg: suggestion?.kg ?? null, kgs };
  };
}
