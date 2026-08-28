import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { formatPrescription } from '@/lib/exercise-meta';

/**
 * 지난 운동 기록을 날짜별로 읽는다.
 *
 * 달력에는 하루 한 줄만 있으면 된다 — 몇 개 했는지, 강도가 몇이었는지.
 * 운동 하나하나까지 통째로 내려보내면, 하루 열 개씩 한 해를 쌓았을 때
 * 삼천 줄이 화면 열 때마다 따라온다. 자세한 것은 날짜를 눌렀을 때만 부른다.
 */

export type TrainingDaySummary = {
  /** 그날 마친 운동 수 */
  count: number;
  /** 그날 적은 운동 강도 1~10. 안 적었으면 null */
  intensity: number | null;
  /** 느낀점을 남겼는가 */
  hasMemo: boolean;
};

/** 달력에 채울 요약. 키는 YYYY-MM-DD. */
export async function trainingSummaries(
  userId: string
): Promise<Record<string, TrainingDaySummary>> {
  const [byDay, notes] = await Promise.all([
    prisma.userExerciseLog.groupBy({
      by: ['date'],
      where: { userId, completed: true },
      _count: { exerciseId: true },
    }),
    prisma.dailyTrainingNote.findMany({
      where: { userId },
      select: { date: true, intensity: true, memo: true },
    }),
  ]);

  const out: Record<string, TrainingDaySummary> = {};
  for (const row of byDay) {
    out[toDateKey(row.date)] = {
      count: row._count.exerciseId,
      intensity: null,
      hasMemo: false,
    };
  }
  /*
   * 운동은 하나도 체크 안 했는데 강도만 적은 날도 있다. 그런 날도 달력에
   * 표시해야 한다 — 남긴 것이 있는데 빈칸으로 보이면 저장이 안 된 줄 안다.
   */
  for (const note of notes) {
    const key = toDateKey(note.date);
    const prev = out[key] ?? { count: 0, intensity: null, hasMemo: false };
    out[key] = {
      ...prev,
      intensity: note.intensity,
      hasMemo: Boolean(note.memo?.trim()),
    };
  }
  return out;
}

export type TrainingDayDetail = {
  date: string;
  exercises: {
    id: string;
    title: string;
    category: string;
    /** 계획된 세트·횟수 — '3세트 × 10회 · 세트 사이 3분 휴식' */
    planned: string | null;
    /** 실제로 적은 만큼. 안 적었으면 null */
    setsDone: number | null;
    repsDone: number | null;
    holdSecondsDone: number | null;
  }[];
  intensity: number | null;
  memo: string | null;
};

/** 날짜 하나의 자세한 내용. 달력에서 그 날을 눌렀을 때만 부른다. */
export async function trainingDay(
  userId: string,
  dateKey: string
): Promise<TrainingDayDetail> {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  const [logs, note] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, date, completed: true },
      select: {
        exerciseId: true,
        setsDone: true,
        repsDone: true,
        holdSecondsDone: true,
        exercise: {
          select: {
            title: true,
            category: true,
            sets: true,
            reps: true,
            holdSeconds: true,
            restSeconds: true,
            perSide: true,
          },
        },
      },
    }),
    prisma.dailyTrainingNote.findUnique({
      where: { userId_date: { userId, date } },
      select: { intensity: true, memo: true },
    }),
  ]);

  return {
    date: dateKey,
    exercises: logs.map((l) => ({
      id: l.exerciseId,
      title: l.exercise.title,
      category: l.exercise.category,
      planned: formatPrescription(l.exercise),
      setsDone: l.setsDone,
      repsDone: l.repsDone,
      holdSecondsDone: l.holdSecondsDone,
    })),
    intensity: note?.intensity ?? null,
    memo: note?.memo ?? null,
  };
}
