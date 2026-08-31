import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { exerciseMinutes, type LoggedExercise } from '@/lib/training-load';
import {
  ARM_CARE_CATEGORY,
  GROUP_OF,
  type VolumeGroupKey,
} from '@/lib/training-volume';

/**
 * 트레이닝 돌아보기 — 분석 화면의 트레이닝 칸에 쓴다.
 *
 * 그 칸에는 '이번 주' 이야기만 있었다. 며칠 했는지, 이번 주 부위별 세트가
 * 몇인지. 한 주만 보면 이번 주가 원래 그런 주인지 요즘 계속 그런지 알 수 없고,
 * "암케어를 3주째 안 하고 있다" 같은 것은 아예 안 보인다.
 *
 * 여기서 세 가지를 낸다.
 *
 *   주별 흐름   최근 4주, 주마다 며칠·몇 분·평균 강도
 *   부위 추이   같은 4주를 부위별 세트로
 *   무게 변화   적어 둔 톱세트가 늘었는가
 *
 * 무게는 지금까지 어디에서도 안 보여줬다. 적으라고 해놓고 보여주지 않으면
 * 적을 이유가 없다.
 */

/** 몇 주를 보여주는가 */
export const REVIEW_WEEKS = 4;
/**
 * 얼마나 거슬러 읽는가.
 *
 * 주별 흐름은 4주면 되지만 무게 변화는 그보다 길게 봐야 한다. 4주 안에 같은
 * 운동을 두 번 이상 하고 무게까지 적은 경우가 생각보다 드물어서, 그 창으로만
 * 보면 대부분 "견줄 것이 없음"이 된다.
 */
export const REVIEW_DAYS = 56;

/** 무게 변화를 말하려면 적어도 이만큼은 적혀 있어야 한다 */
const MIN_WEIGHT_RECORDS = 2;
/** 화면에 몇 개까지 */
const MAX_WEIGHT_ROWS = 6;

export type ReviewWeek = {
  /** 0 = 이번 주(오늘 포함 7일), 1 = 그 직전 7일 … */
  ago: number;
  label: string;
  /** 이 주의 첫날·마지막 날 (YYYY-MM-DD) */
  from: string;
  to: string;
  /** 운동을 하나라도 마친 날 수 */
  days: number;
  /** 마친 운동 수 */
  count: number;
  minutes: number;
  /** 강도를 적은 날의 평균. 아무도 안 적었으면 null */
  intensity: number | null;
  /** 부위 묶음별 세트 수 */
  parts: Partial<Record<VolumeGroupKey, number>>;
  armCare: number;
};

export type WeightChange = {
  exerciseId: string;
  title: string;
  category: string;
  /** 가장 최근에 적은 톱세트 */
  latestKg: number;
  latestDate: string;
  /** 이 기간 처음에 적은 톱세트 */
  firstKg: number;
  firstDate: string;
  /** 무게를 적은 날 수 */
  records: number;
};

export type TrainingReview = {
  weeks: ReviewWeek[];
  /** 무게가 달라진 순으로. 변화가 없는 운동은 뒤로 간다. */
  weights: WeightChange[];
  /** 이 기간에 무게를 적은 날이 하나라도 있었는가 */
  hasAnyWeight: boolean;
};

/** n일 전 날짜 키 */
const dayBefore = (today: Date, n: number) =>
  toDateKey(new Date(today.getTime() - n * 86400000));

function weekLabel(ago: number) {
  return ago === 0 ? '이번 주' : `${ago}주 전`;
}

export async function trainingReview(
  userId: string,
  today = new Date()
): Promise<TrainingReview> {
  const since = new Date(today);
  since.setDate(since.getDate() - REVIEW_DAYS);

  const [logs, notes] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: since } },
      select: {
        date: true,
        setsDone: true,
        weightKg: true,
        exerciseId: true,
        exercise: {
          select: {
            title: true,
            category: true,
            intensity: true,
            bodyParts: true,
            sets: true,
            reps: true,
            holdSeconds: true,
            restSeconds: true,
            perSide: true,
          },
        },
      },
    }),
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, intensity: true },
    }),
  ]);

  /* ── 주 나누기 ────────────────────────────────────────────
   * 달력의 주가 아니라 오늘부터 7일씩 거슬러 나눈다. 앱의 다른 곳이 모두
   * '최근 7일 / 직전 7일'로 말하고 있어서, 여기만 월요일 기준으로 두면 같은
   * 주를 두 가지로 부르게 된다.
   */
  const bounds = Array.from({ length: REVIEW_WEEKS }, (_, ago) => ({
    ago,
    from: dayBefore(today, ago * 7 + 6),
    to: dayBefore(today, ago * 7),
  }));
  const weekOf = (key: string) =>
    bounds.find((b) => key >= b.from && key <= b.to) ?? null;

  type Bucket = {
    days: Set<string>;
    count: number;
    minutes: number;
    parts: Map<VolumeGroupKey, number>;
    armCare: number;
  };
  const buckets = new Map<number, Bucket>(
    bounds.map((b) => [
      b.ago,
      { days: new Set<string>(), count: 0, minutes: 0, parts: new Map(), armCare: 0 },
    ])
  );

  for (const log of logs) {
    const key = toDateKey(log.date);
    const week = weekOf(key);
    if (!week) continue;
    const bucket = buckets.get(week.ago)!;

    bucket.days.add(key);
    bucket.count++;
    bucket.minutes += exerciseMinutes({
      ...log.exercise,
      setsDone: log.setsDone,
    } as LoggedExercise);

    const sets = log.setsDone ?? log.exercise.sets ?? 0;
    if (sets <= 0) continue;

    /*
     * 한 운동이 같은 묶음에 두 부위로 걸릴 수 있다(가슴+어깨+삼두는 모두
     * '가슴·어깨'). 묶음을 먼저 추려 두 번 세지 않는다.
     */
    const groups = new Set<VolumeGroupKey>();
    for (const part of log.exercise.bodyParts) {
      for (const g of GROUP_OF.get(part) ?? []) groups.add(g);
    }
    for (const g of groups) bucket.parts.set(g, (bucket.parts.get(g) ?? 0) + sets);

    if (log.exercise.category === ARM_CARE_CATEGORY) bucket.armCare += sets;
  }

  /* 강도는 하루에 하나라 따로 모은다 — 운동 수만큼 세면 안 된다 */
  const intensitiesByWeek = new Map<number, number[]>();
  for (const note of notes) {
    const week = weekOf(toDateKey(note.date));
    if (!week) continue;
    const list = intensitiesByWeek.get(week.ago) ?? [];
    list.push(note.intensity);
    intensitiesByWeek.set(week.ago, list);
  }

  const weeks: ReviewWeek[] = bounds.map((b) => {
    const bucket = buckets.get(b.ago)!;
    const marks = intensitiesByWeek.get(b.ago) ?? [];
    return {
      ago: b.ago,
      label: weekLabel(b.ago),
      from: b.from,
      to: b.to,
      days: bucket.days.size,
      count: bucket.count,
      minutes: Math.round(bucket.minutes),
      intensity: marks.length
        ? Math.round((marks.reduce((a, c) => a + c, 0) / marks.length) * 10) / 10
        : null,
      parts: Object.fromEntries(bucket.parts) as Partial<
        Record<VolumeGroupKey, number>
      >,
      armCare: bucket.armCare,
    };
  });

  /* ── 무게 변화 ────────────────────────────────────────────
   * 하루에 여러 줄이 있을 수 있으니 운동+날짜로 가장 무거운 것만 남긴다.
   */
  type Mark = { date: string; kg: number };
  const marksBy = new Map<
    string,
    { title: string; category: string; byDay: Map<string, number> }
  >();
  for (const log of logs) {
    if (log.weightKg == null || log.weightKg <= 0) continue;
    const entry = marksBy.get(log.exerciseId) ?? {
      title: log.exercise.title,
      category: log.exercise.category,
      byDay: new Map<string, number>(),
    };
    const key = toDateKey(log.date);
    entry.byDay.set(key, Math.max(entry.byDay.get(key) ?? 0, log.weightKg));
    marksBy.set(log.exerciseId, entry);
  }

  const weights: WeightChange[] = [];
  for (const [exerciseId, entry] of marksBy) {
    const marks: Mark[] = [...entry.byDay]
      .map(([date, kg]) => ({ date, kg }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (marks.length < MIN_WEIGHT_RECORDS) continue;
    const first = marks[0];
    const latest = marks[marks.length - 1];
    weights.push({
      exerciseId,
      title: entry.title,
      category: entry.category,
      latestKg: latest.kg,
      latestDate: latest.date,
      firstKg: first.kg,
      firstDate: first.date,
      records: marks.length,
    });
  }

  /*
   * 많이 오른 것부터. 오른 것이 없으면 그대로거나 내려간 것이 오는데, 그것도
   * 알아야 하는 정보다 — 무게를 줄인 주가 이어지면 몸이 힘들다는 뜻일 수 있다.
   */
  weights.sort((a, b) => {
    const da = a.latestKg - a.firstKg;
    const db = b.latestKg - b.firstKg;
    if (db !== da) return db - da;
    return b.records - a.records;
  });

  return {
    weeks,
    weights: weights.slice(0, MAX_WEIGHT_ROWS),
    hasAnyWeight: marksBy.size > 0,
  };
}
