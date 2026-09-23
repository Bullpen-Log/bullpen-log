'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { exercisesByIds } from '@/lib/library-cache';
import { loadTodayCore } from '@/lib/report/today-data';
import { toDateKey } from '@/lib/pitch-stats';
import { AMOUNT_LIMITS, WEIGHT_PRECISION } from '@/lib/exercise-meta';
import { freezePlan, readFrozenPlan } from '@/lib/workout/session-plan';
import { summarizeSets } from '@/lib/workout/summarize';
import { saveTrainingNote } from '@/app/actions/exercise-log';

/**
 * 실시간 운동 세션.
 *
 * ■ 세트를 저장할 때 revalidatePath 를 부르지 않는다
 *
 * 지금 체크 한 번이 /today·/training·/dashboard 세 개를 다시 그린다
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
    new Map(details.map((ex) => [ex.id, ex]))
  );

  if (plan.exercises.length === 0) redirect('/training');

  await prisma.trainingSession.upsert({
    where: { userId_date: { userId: user.id, date: core.midnight } },
    create: {
      userId: user.id,
      date: core.midnight,
      themeKey: plan.themeKey,
      plan,
      status: 'ACTIVE',
      /*
       * 워밍업 창이 아직 없다. 지금은 본운동으로 곧장 들어가므로 시작 시각과
       * 같다. 워밍업 창을 붙이면 거기서 [본운동 시작]을 누를 때 찍는다.
       */
      mainStartedAt: new Date(),
    },
    update: {
      /* 한 번 닫은 판을 다시 열 때 — 목록을 새로 찍고 상태를 되돌린다 */
      themeKey: plan.themeKey,
      plan,
      status: 'ACTIVE',
      endedAt: null,
      mainStartedAt: new Date(),
    },
  });

  redirect('/workout/run');
}

/* ------------------------------ 세트 ------------------------------ */

export type SetInput = {
  exerciseId: string;
  /** 없으면 그 운동의 다음 번호로 붙인다 */
  setNo?: number;
  weightKg?: number | null;
  reps?: number | null;
  holdSeconds?: number | null;
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

/** 무게는 0.5kg 자리까지. 0 이하면 '안 적음'으로 본다. */
function weight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.round(value / WEIGHT_PRECISION) * WEIGHT_PRECISION;
  return n > 0 && n <= AMOUNT_LIMITS.weightKg ? Number(n.toFixed(1)) : null;
}

async function activeSession(userId: string) {
  return prisma.trainingSession.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { date: 'desc' },
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
  const session = await activeSession(user.id);
  if (!session) return { error: '열려 있는 운동이 없습니다.' };

  const plan = readFrozenPlan(session.plan);
  const ex = plan?.exercises.find((e) => e.id === input.exerciseId);
  if (!ex) return { error: '오늘 목록에 없는 운동입니다.' };

  const w = weight(input.weightKg);
  const reps = whole(input.reps, AMOUNT_LIMITS.reps);
  const hold = whole(input.holdSeconds, AMOUNT_LIMITS.holdSeconds);

  /* 바벨·덤벨은 무게를 안 적으면 남길 수 없다 (트레이닝 화면과 같은 규칙) */
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
      recordedAt: new Date(),
    },
    update: { weightKg: w, reps, holdSeconds: hold, recordedAt: new Date() },
  });

  /* 일부러 revalidatePath 를 안 부른다 (맨 위 설명 참고) */
  return { sets: await setsOf(session.id) };
}

/** 잘못 적은 세트를 지운다. 번호는 다시 매기지 않는다 — 화면에서 순서대로 센다. */
export async function deleteSet(input: {
  exerciseId: string;
  setNo: number;
}): Promise<SetResult> {
  const user = await requireUser();
  const session = await activeSession(user.id);
  if (!session) return { error: '열려 있는 운동이 없습니다.' };

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
  intensity?: number | null;
  memo?: string | null;
}): Promise<{ error: string } | never> {
  const user = await requireUser();
  const session = await activeSession(user.id);
  if (!session) redirect('/training');

  const rows = await prisma.userExerciseSet.findMany({
    where: { sessionId: session.id },
    select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
  });

  const summaries = summarizeSets(rows);

  await prisma.$transaction([
    ...summaries.map((s) =>
      prisma.userExerciseLog.upsert({
        where: {
          userId_exerciseId_date: {
            userId: user.id,
            exerciseId: s.exerciseId,
            date: session.date,
          },
        },
        create: {
          userId: user.id,
          exerciseId: s.exerciseId,
          date: session.date,
          completed: true,
          setsDone: s.setsDone,
          repsDone: s.repsDone,
          holdSecondsDone: s.holdSecondsDone,
          weightKg: s.weightKg,
        },
        update: {
          completed: true,
          setsDone: s.setsDone,
          repsDone: s.repsDone,
          holdSecondsDone: s.holdSecondsDone,
          weightKg: s.weightKg,
        },
      })
    ),
    prisma.trainingSession.update({
      where: { id: session.id },
      data: { status: 'FINISHED', endedAt: new Date() },
    }),
  ]);

  /* 체감 강도는 세션 날짜로 남긴다 — 자정을 넘겨도 세트와 짝이 맞게 */
  if (typeof input.intensity === 'number') {
    await saveTrainingNote(input.intensity, input.memo ?? '', toDateKey(session.date));
  }

  revalidatePath('/today');
  revalidatePath('/training');
  revalidatePath('/dashboard');
  redirect('/training', RedirectType.replace);
}
