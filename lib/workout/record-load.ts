import 'server-only';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { trainingDay } from '@/lib/report/training-history';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { parseProgram, dayLabel } from '@/lib/program/program';
import { weightKindOf } from '@/lib/program/next-weight';
import {
  applyRecordSets,
  recordEditable,
  recordTotals,
  type RecordExercise,
  type RecordNote,
  type WorkoutRecord,
} from '@/lib/workout/record-model';

export async function readRecordNote(
  userId: string,
  date: string
): Promise<RecordNote | null> {
  const n = await prisma.dailyTrainingNote.findUnique({
    where: { userId_date: { userId, date: new Date(`${date}T00:00:00Z`) } },
    select: { intensity: true, memo: true, updatedAt: true },
  });
  return n
    ? { intensity: n.intensity, memo: n.memo, version: n.updatedAt.toISOString() }
    : null;
}

export async function loadWorkoutRecord(
  userId: string,
  date: string,
  kind: WorkoutRecord['kind']
): Promise<WorkoutRecord> {
  const today = toDateKey(appNow());
  const editable = recordEditable(date, today);
  const at = new Date(`${date}T00:00:00Z`);
  if (kind !== 'training') {
    const exercises: RecordExercise[] =
      kind === 'armcare'
        ? (
            await prisma.userExerciseLog.findMany({
              where: {
                userId,
                date: at,
                completed: true,
                exercise: { category: '암케어' },
              },
              orderBy: { exerciseId: 'asc' },
              include: { exercise: true },
            })
          ).map((r) => ({
            id: r.exerciseId,
            title: r.exercise.title,
            category: r.exercise.category,
            planned: null,
            done: true,
            setsDone: r.setsDone,
            repsDone: r.repsDone,
            holdSecondsDone: r.holdSecondsDone,
            weightKg: r.weightKg,
            sets: [],
            meta: {
              perHand: weightKindOf(r.exercise.equipment) === 'dumbbell',
              perSide: r.exercise.perSide,
              inMinutes: false,
            },
            method: 'exercise',
            canToggle: false,
          }))
        : (
            await prisma.userDrillLog.findMany({
              where: { userId, date: at, done: true },
              orderBy: { guideId: 'asc' },
              include: { guide: true },
            })
          ).map((r) => ({
            id: r.guideId,
            title: r.guide.title,
            category: '메커니즘',
            planned: null,
            done: true,
            setsDone: null,
            repsDone: null,
            holdSecondsDone: null,
            weightKg: null,
            sets: [],
            meta: { perHand: false, perSide: false, inMinutes: false },
            method: 'drill',
            canToggle: false,
          }));
    return {
      date,
      today,
      kind,
      editable: false,
      title: kind === 'armcare' ? '암케어' : '메커니즘',
      programLabel: null,
      session: null,
      minutes: null,
      setCount: null,
      volumeKg: null,
      exercises,
      note: null,
      setsKnown: true,
      noteKnown: true,
    };
  }
  const [base, session, note, raw] = await Promise.all([
    trainingDay(userId, date, { skipNote: true }),
    prisma.trainingSession.findUnique({
      where: { userId_date: { userId, date: at } },
      select: { id: true, status: true, plan: true, activeSeconds: true },
    }),
    readRecordNote(userId, date).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null })
    ),
    prisma.userExerciseSet
      .findMany({
        where: { userId, date: at },
        orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }],
        include: { exercise: true },
      })
      .then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, value: [] })
      ),
  ]);
  const frozen = readFrozenPlan(session?.plan);
  const byId = new Map(base.exercises.map((e) => [e.id, e]));
  const ids = new Set([
    ...(frozen?.exercises.filter((e) => e.category !== '암케어').map((e) => e.id) ??
      []),
    ...byId.keys(),
    ...raw.value
      .filter((r) => r.exercise.category !== '암케어')
      .map((r) => r.exerciseId),
  ]);
  const exercises = [...ids].map((id) => {
    const f = frozen?.exercises.find((e) => e.id === id);
    const b = byId.get(id);
    const r = raw.value.find((s) => s.exerciseId === id)?.exercise;
    return applyRecordSets(
      {
        id,
        title: f?.title ?? b?.title ?? r?.title ?? '운동',
        category: f?.category ?? b?.category ?? r?.category ?? '',
        planned: f?.prescription ?? b?.planned ?? null,
        done: b?.done ?? false,
        setsDone: b?.setsDone ?? null,
        repsDone: b?.repsDone ?? null,
        holdSecondsDone: b?.holdSecondsDone ?? null,
        weightKg: b?.weightKg ?? null,
        meta: {
          perHand: weightKindOf(f?.equipment ?? r?.equipment ?? []) === 'dumbbell',
          perSide: f?.perSide ?? r?.perSide ?? false,
          inMinutes: (f?.category ?? r?.category ?? b?.category) === '유산소',
        },
        method: 'exercise',
      },
      raw.ok
        ? raw.value
            .filter((s) => s.exerciseId === id)
            .map((s) => ({
              setNo: s.setNo,
              weightKg: s.weightKg,
              reps: s.reps,
              holdSeconds: s.holdSeconds,
              rir: s.rir,
            }))
        : null,
      editable,
      session?.status === 'ACTIVE'
    );
  });
  const pp = frozen?.program ? parseProgram(frozen.program.key) : null;
  return {
    date,
    today,
    kind,
    editable,
    title: frozen?.themeLabel ?? '운동 기록',
    programLabel:
      pp && frozen?.program
        ? `${pp.def.name} · ${dayLabel(pp, frozen.program.day)}`
        : null,
    session: session ? { id: session.id, status: session.status } : null,
    minutes:
      session?.status !== 'ACTIVE' && session?.activeSeconds
        ? Math.round(session.activeSeconds / 60)
        : null,
    ...recordTotals(exercises, raw.ok),
    exercises,
    note: note.value,
    setsKnown: raw.ok,
    noteKnown: note.ok,
  };
}
