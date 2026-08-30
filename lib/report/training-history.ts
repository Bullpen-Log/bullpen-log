import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
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

/**
 * 달력에 채울 요약. 키는 YYYY-MM-DD.
 *
 * 최근 열세 달만 읽는다. 투구 일지와 같은 이유다 — 매일 남기는 사람이라면
 * 몇 해 뒤에는 천 줄이 화면 열 때마다 따라온다. 열세 달이면 이번 시즌과
 * 작년 같은 시기까지 넘겨봐도 끊기지 않는다.
 *
 * 그보다 옛날 달로 넘기면 그 달은 빈 달력으로 보인다. 투구 일지처럼 그때
 * 받아 오게 하려면 이 함수도 기간을 받아야 하는데, 운동 기록은 하루 한 줄이라
 * (groupBy) 투구 기록만큼 무겁지 않다. 필요해지면 그때 나눈다.
 */
const SUMMARY_MONTHS = 13;

export async function trainingSummaries(
  userId: string
): Promise<Record<string, TrainingDaySummary>> {
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SUMMARY_MONTHS, 1)
  );

  const [byDay, notes] = await Promise.all([
    prisma.userExerciseLog.groupBy({
      by: ['date'],
      where: { userId, completed: true, date: { gte: since } },
      _count: { exerciseId: true },
    }),
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: { gte: since } },
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
  /** 이 날짜를 아직 고칠 수 있는가 (일주일 안) */
  editable: boolean;
  exercises: {
    id: string;
    title: string;
    category: string;
    /** 계획된 세트·횟수 — '3세트 × 10회 · 세트 사이 3분 휴식' */
    planned: string | null;
    /**
     * 마친 것으로 표시했는가.
     *
     * 그날 일정에는 있었지만 체크 안 한 운동도 함께 내려보낸다. 예전에는 완료한
     * 것만 보여줘서, 체크를 깜빡한 날은 목록이 비어 있고 손댈 방법도 없었다.
     */
    done: boolean;
    /** 실제로 적은 만큼. 안 적었으면 null */
    setsDone: number | null;
    repsDone: number | null;
    holdSecondsDone: number | null;
    /**
     * 실제로 든 무게(kg). 안 적었거나 맨몸이면 null.
     *
     * 적는 자리는 있는데 다시 볼 자리가 없었다. 무게는 부하 계산에 쓰이는
     * 값이기도 하지만, 사용자에게는 "지난주에 몇 kg 들었지"가 더 중요하다 —
     * 그걸 모르면 조금씩 올릴 수가 없다.
     */
    weightKg: number | null;
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

  const [logs, note, setup] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, date, completed: true },
      select: {
        exerciseId: true,
        setsDone: true,
        repsDone: true,
        holdSecondsDone: true,
        weightKg: true,
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
    /*
     * 그날 만들어 둔 일정. 체크 안 한 운동을 보여주려면 이것이 있어야 한다 —
     * 완료 기록만으로는 "무엇을 하기로 했었나"를 알 수 없다.
     */
    prisma.dailyTrainingSetup.findUnique({
      where: { userId_date: { userId, date } },
      select: { plan: true },
    }),
  ]);

  const doneIds = new Set(logs.map((l) => l.exerciseId));

  /*
   * 그날 일정에는 있었지만 체크 안 한 운동.
   *
   * 완료한 것 뒤에 붙인다. 한 일이 먼저 보이고, 빠뜨린 것이 그 아래 남는다.
   */
  const plannedIds = readPlanExerciseIds(setup?.plan).filter(
    (id) => !doneIds.has(id)
  );
  const missed = plannedIds.length
    ? await prisma.exerciseVideo.findMany({
        where: { id: { in: plannedIds } },
        select: {
          id: true,
          title: true,
          category: true,
          sets: true,
          reps: true,
          holdSeconds: true,
          restSeconds: true,
          perSide: true,
        },
      })
    : [];

  const todayKey = toDateKey(new Date());

  return {
    date: dateKey,
    /* 앞날은 애초에 못 열고, 일주일이 지나면 고칠 수 없다(exercise-log.ts). */
    editable: dateKey <= todayKey && dateKey >= shiftDateKey(todayKey, -EDITABLE_DAYS),
    exercises: [
      ...logs.map((l) => ({
        id: l.exerciseId,
        title: l.exercise.title,
        category: l.exercise.category,
        planned: formatPrescription(l.exercise),
        done: true,
        setsDone: l.setsDone,
        repsDone: l.repsDone,
        holdSecondsDone: l.holdSecondsDone,
        weightKg: l.weightKg,
      })),
      ...missed.map((ex) => ({
        id: ex.id,
        title: ex.title,
        category: ex.category,
        planned: formatPrescription(ex),
        done: false,
        setsDone: null,
        repsDone: null,
        holdSecondsDone: null,
        weightKg: null,
      })),
    ],
    intensity: note?.intensity ?? null,
    memo: note?.memo ?? null,
  };
}

/** 며칠 전 것까지 고칠 수 있는가. app/actions/exercise-log.ts 와 같은 값이어야 한다. */
const EDITABLE_DAYS = 7;

/**
 * 저장해 둔 일정에서 운동 id 만 꺼낸다.
 *
 * plan 은 Json 이라 모양을 믿을 수 없다. 옛 일정이 남아 있을 수도 있어,
 * 기대한 모양이 아니면 조용히 빈 목록으로 둔다 — 화면이 깨지는 것보다 낫다.
 */
function readPlanExerciseIds(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') return [];
  const picks = (plan as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];
  return picks
    .map((p) => (p as { exerciseId?: unknown })?.exerciseId)
    .filter((id): id is string => typeof id === 'string');
}
