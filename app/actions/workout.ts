'use server';

import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { Prisma } from '@prisma/client';
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
  if (!session) redirect('/training');

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

  /* 본운동을 시작한 뒤로 흐른 시간. 워밍업은 안 들어간다. */
  const endedAt = new Date();
  const segmentSeconds = Math.max(
    0,
    Math.floor(
      (endedAt.getTime() - (session.mainStartedAt ?? session.startedAt).getTime()) /
        1000
    )
  );

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
  revalidatePath('/dashboard');
  redirect('/training', RedirectType.replace);
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
  exerciseIds: string[]
): Promise<{ ids: string[] } | { error: string }> {
  const user = await requireUser();
  const session = await activeSession(user.id);
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
