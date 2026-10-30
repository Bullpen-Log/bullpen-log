import 'server-only';
import { prisma } from '@/lib/prisma';
import type { getCurrentUser } from '@/lib/dal';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { dayLabel, isLightWeek, parseProgram, weekOfDay } from '@/lib/program/program';
import { withJosa } from '@/lib/korean';
import { weightKindOf } from '@/lib/program/next-weight';
import { exercisesByIds } from '@/lib/library-cache';
import { programOutcomeOf, noteOutcomeOf, type NoteOutcome, type ProgramOutcome } from '@/lib/workout/finish';
import { summarizeSets, totalVolumeKg } from '@/lib/workout/summarize';
import { priorBests } from '@/lib/workout/prior-bests';
import { newRecord } from '@/lib/workout/bests';
import { toDateKey } from '@/lib/pitch-stats';
import { appNow } from '@/lib/clock';
import { workoutNutritionLine, type NutritionLine } from '@/lib/nutrition/nudge';
import type { DoneRow } from '@/app/(session)/workout/done/done-client';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 축하 화면의 재료 — 웹 /workout/done(page.tsx)과 앱(native/src/app/workout-done.tsx, app-workout.loadAppWorkoutDone)이 같이 쓴다 */
export type WorkoutDone = {
  program: {
    headline: string;
    note: string | null;
    lifts: { title: string; suggested: number; actual: number | null; rir: number | null }[];
    /** 결과 갈래(lib/workout/finish-state.ts) — 기준 미달과 '아직 처리 안 됨'을 가른다. 옛 웹 화면은 headline 만 읽는다 */
    outcome: ProgramOutcome;
  } | null;
  nutritionLine: NutritionLine | null;
  themeLabel: string;
  dateLabel: string;
  minutes: number;
  setCount: number;
  volumeKg: number;
  rows: DoneRow[];
  askEffort: { sessionId: string } | null;
  /** 이 판 번호 — 앱 완료 화면의 강도 저장 · 다시 확인이 쓴다 */
  sessionId: string;
  /** 그날 실제 강도 · 메모(없으면 null) — 있으면 숫자로 읽기만, 없을 때만 슬라이더로 묻는다 */
  dailyNote: { intensity: number; memo: string | null } | null;
  /** 마치기 창에서 제출한 강도 · 메모가 실제로 남았는지(saved · pending · none) */
  noteOutcome: NoteOutcome;
};

/**
 * 운동을 마친 순간 — 축하 화면.
 *
 * 예전에는 [운동 마치기]를 누르면 곧바로 트레이닝 목록으로 돌아갔다. 한 시간을 쓰고 나서 받는 것이 화면
 * 바뀜뿐이었다. 애플 워치의 운동 요약처럼 링이 그려지며 체크가 뜨고, 세 숫자 · 새 최고 기록 · 한 운동을
 * 보이고 [완료] 하나로 끝낸다(2026-10-01 사용자 '애플처럼 감성있게').
 *
 * 숫자는 트레이닝의 완료 카드(done-card.tsx)와 같은 함수로 접는다 — 여기서 본 숫자와 돌아가서 보는 숫자가
 * 같아야 한다. 새 최고는 운동 중 세트 줄의 '새 최고'와 같은 함수다(lib/workout/bests.ts).
 *
 * 마친 판만 연다. 주소를 직접 쳐서 남의 판이나 아직 하는 판을 열 수 없다. 세트가 하나도 없으면 축하할
 * 것이 없으니 트레이닝으로 보낸다.
 *
 * 힘듦 한 번 누르기(2판 P2): 그날 DailyTrainingNote 가 없으면 [완료] 위에 칩 넷을 둔다. 마치기 창에서 강도를 골랐으면
 * (줄이 있음) 묻지 않는다 — 서버에서 줄 유무만 읽어 넘긴다.
 */
export async function loadWorkoutDone(user: SessionUser, id: unknown): Promise<{ to: string } | WorkoutDone> {
  if (typeof id !== 'string' || !id) return { to: '/training' };

  const session = await prisma.trainingSession.findFirst({
    where: { id, userId: user.id, status: 'FINISHED' },
    select: { id: true, date: true, plan: true, activeSeconds: true },
  });
  if (!session) return { to: '/training' };

  const [sets, note] = await Promise.all([
    prisma.userExerciseSet.findMany({
      where: { sessionId: session.id },
      orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }],
      select: {
        exerciseId: true,
        setNo: true,
        weightKg: true,
        reps: true,
        holdSeconds: true,
        rir: true,
      },
    }),
    /* 그날 힘듦 — 날짜는 saveTrainingNote 와 같은 꼴(세션 날짜의 UTC 자정) */
    prisma.dailyTrainingNote.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: new Date(`${toDateKey(session.date)}T00:00:00.000Z`),
        },
      },
      select: { intensity: true, memo: true },
    }),
  ]);
  if (sets.length === 0) return { to: '/training' };

  const plan = readFrozenPlan(session.plan);
  const frozen = plan?.exercises ?? [];
  const order = new Map(frozen.map((e, i) => [e.id, i]));
  const byId = new Map(frozen.map((e) => [e.id, e]));
  const doneIds = [...new Set(sets.map((s) => s.exerciseId))];
  const [bests, library] = await Promise.all([
    priorBests(user.id, doneIds, session.date),
    /* 목록에서 뺀 운동(얼린 목록에 없음)의 이름 · 수행량 읽는 법 — 캐시라 DB 를 가지 않는다 */
    exercisesByIds(doneIds.filter((id) => !byId.has(id))),
  ]);
  const libById = new Map(library.map((e) => [e.id, e]));

  /* 목록 순서대로 — 운동할 때 찍어 둔 목록의 차례. 목록에서 뺀 운동의 세트는 맨 뒤에 */
  const rows: DoneRow[] = summarizeSets(sets)
    .sort((a, b) => (order.get(a.exerciseId) ?? 999) - (order.get(b.exerciseId) ?? 999))
    .map((summary) => {
      const ex = byId.get(summary.exerciseId);
      const prior = bests.get(summary.exerciseId) ?? null;
      const record = ex
        ? newRecord(
            ex,
            sets.filter((s) => s.exerciseId === summary.exerciseId),
            prior
          )
        : null;
      const lib = libById.get(summary.exerciseId);
      const equipment = ex?.equipment ?? lib?.equipment ?? [];
      const isHold = ex?.isHold ?? (lib ? lib.holdSeconds != null && lib.reps == null : false);
      return {
        id: summary.exerciseId,
        title: ex?.title ?? lib?.title ?? '목록에서 뺀 운동',
        summary,
        sets: sets
          .filter((x) => x.exerciseId === summary.exerciseId)
          .map((x) => ({ setNo: x.setNo, weightKg: x.weightKg, reps: x.reps, holdSeconds: x.holdSeconds, rir: x.rir })),
        meta: {
          perHand: weightKindOf(equipment) === 'dumbbell',
          perSide: ex?.perSide ?? false,
          isHold,
          inMinutes: (ex?.category ?? lib?.category) === '유산소',
          needsWeight: ex?.needsWeight ?? false,
        },
        record: record && {
          ...record,
          /* 넘기 전의 최고 — '100 → 102.5kg' 처럼 얼마나 넘었는지 */
          before:
            record.kind === 'weight'
              ? (prior?.weightKg ?? null)
              : record.kind === 'reps'
                ? (prior?.reps ?? null)
                : (prior?.holdSeconds ?? null),
        },
      };
    });

  /*
   * 근력 · 파워 프로그램 날이면 — 일차를 넘겼는지, 다음 일차, 운동별 '추천 → 실제 · 여유'(설계 §13-9).
   * 넘기기는 [종료]가 이미 했다(lib/program/advance.ts). 여기서는 결과를 읽기만 한다.
   */
  const programPlan = plan?.program ? parseProgram(plan.program.key) : null;
  const program = plan?.program && programPlan
    ? await (async () => {
        const tag = plan.program as NonNullable<typeof plan.program>;
        const pp = programPlan;
        const last = tag.day >= pp.totalDays;
        /* 결과는 lib/workout/finish.ts 한 곳에서 — 이 판의 회차(rowId)만 본다. 읽기만 한다(넘기기는 [종료]가 했다) */
        const outcome = await programOutcomeOf({ ...session, userId: user.id, status: 'FINISHED' });
        const advanced = outcome.state === 'advanced' || outcome.state === 'done';
        const nextWeek = weekOfDay(pp, tag.day + 1);
        const lifts = frozen
          .filter((e) => e.programSlot && e.suggestedKg != null)
          .map((e) => {
            const mine = sets.filter((x) => x.exerciseId === e.id);
            const lastSet = mine[mine.length - 1];
            /* 추천은 본 세트(가장 무거운 세트) 무게 — 실제도 가장 무거운 세트로 견준다 */
            const heaviest = mine.reduce<number | null>(
              (m, x) => (x.weightKg != null && (m == null || x.weightKg > m) ? x.weightKg : m),
              null
            );
            return {
              title: e.title,
              suggested: e.suggestedKg as number,
              actual: heaviest,
              rir: lastSet?.rir ?? null,
            };
          })
          .filter((l) => l.actual != null);
        return {
          headline:
            outcome.state === 'done' || (last && advanced)
              ? '프로그램을 다 마쳤어요'
              : advanced
                ? `${dayLabel(pp, tag.day)} 완료 · 다음 ${dayLabel(pp, tag.day + 1)}`
                : outcome.state === 'below'
                  ? `절반이 안 돼 ${withJosa(dayLabel(pp, tag.day), '을/를')} 다시 해요`
                  : '프로그램 진행을 아직 확인하지 못했어요',
          outcome,
          note: !advanced
            ? null
            : last
              ? '트레이닝 화면에서 다음 프로그램을 골라요.'
              : isLightWeek(pp, nextWeek) && !isLightWeek(pp, tag.week)
                ? '다음 주는 가벼운 주예요. 무게가 낮은 게 맞아요.'
                : nextWeek !== tag.week
                  ? (pp.def.weekNotes?.[nextWeek] ?? null)
                  : null,
          lifts,
        };
      })()
    : null;

  /* 운동 뒤 단백질 한 줄 — 오늘 마친 웨이트 · 파워 세션일 때만(lib/nutrition/nudge.ts). 세트를 남긴 운동의 분류로 본다 */
  const now = appNow();
  const nutritionLine = await workoutNutritionLine(user, {
    date: toDateKey(session.date),
    today: toDateKey(now),
    now,
    categories: [...new Set(sets.map((s) => byId.get(s.exerciseId)?.category ?? ''))],
  });

  return {
    program,
    nutritionLine,
    themeLabel: plan?.themeLabel ?? '오늘의 운동',
    dateLabel: new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      timeZone: 'UTC',
    }).format(session.date),
    minutes: Math.round(session.activeSeconds / 60),
    setCount: sets.length,
    volumeKg: totalVolumeKg(sets),
    rows,
    /* 강도를 이미 남긴 날(마치기 창 · 트레이닝 탭)은 안 묻는다 */
    askEffort: note ? null : { sessionId: session.id },
    sessionId: session.id,
    dailyNote: note ? { intensity: note.intensity, memo: note.memo } : null,
    noteOutcome: await noteOutcomeOf({ ...session, userId: user.id, status: 'FINISHED' }),
  };
}
