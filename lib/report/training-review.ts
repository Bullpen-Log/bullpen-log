import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { exerciseMinutes, type LoggedExercise } from '@/lib/training-load';
import { ARM_CARE_CATEGORY } from '@/lib/training-volume';

/**
 * 트레이닝 돌아보기 — 분석 화면의 트레이닝 칸에 쓴다.
 *
 * 그 칸에는 '이번 주' 이야기만 있었다. 며칠 했는지, 이번 주 부위별 세트가
 * 몇인지. 한 주만 보면 이번 주가 원래 그런 주인지 요즘 계속 그런지 알 수 없고,
 * "암케어를 3주째 안 하고 있다" 같은 것은 아예 안 보인다.
 *
 * 여기서 두 가지를 낸다.
 *
 *   주별 흐름   최근 4주, 주마다 며칠·몇 분·평균 강도
 *   투구와 운동  같은 4주를 날마다, 던진 날과 운동한 날을 겹쳐서
 *
 * 한동안 뒤쪽이 '부위별 세트 추이'였다. 그런데 이 앱을 쓰는 사람은 투구를 먼저
 * 적고 운동은 나중에 적는다 — 넉 달치를 세어 보니 던진 날은 스물셋인데 운동을
 * 마쳤다고 누른 날은 셋이었다. 그 상태에서 부위별 세트는 무엇을 그려도 빈 표다.
 *
 * 빈 표에서는 아무 말도 안 나오지만, 던진 날 옆에 놓으면 그 빈칸이 곧 할 말이
 * 된다 — "열세 번 던지는 동안 암케어를 한 번도 안 했다". 세트 표가 절대 할 수
 * 없던 말이고, 투구와 운동을 한곳에 적는 이 앱만 할 수 있는 말이다.
 */

/** 몇 주를 보여주는가 */
export const REVIEW_WEEKS = 4;
/** 읽어 오는 기간 */
export const REVIEW_DAYS = REVIEW_WEEKS * 7;

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
};

/** 하루치. 던졌는지와 운동했는지를 나란히 둔다. */
export type ReviewDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = 오늘, 1 = 어제 … */
  ago: number;
  /** 그날 던진 투구수. 0 이면 안 던진 날 */
  pitches: number;
  /** 운동을 하나라도 마쳤다고 표시했는가 */
  trained: boolean;
  /** 그중 암케어가 있었는가 */
  armCare: boolean;
};

export type TrainingReview = {
  weeks: ReviewWeek[];
  /** 최근 4주를 하루씩. 오래된 날이 앞이다 */
  days: ReviewDay[];
  totals: {
    pitchedDays: number;
    trainedDays: number;
    armCareDays: number;
    /** 던지고 운동도 한 날 */
    bothDays: number;
  };
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

  const [logs, notes, pitchLogs] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: { gte: since } },
      select: {
        date: true,
        setsDone: true,
        exerciseId: true,
        exercise: {
          select: {
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
    /* 던진 날을 같이 읽는다 — 운동을 안 한 것이 문제인지 아닌지는 이쪽이 정한다 */
    prisma.pitchLog.findMany({
      where: { userId, date: { gte: since }, pitchCount: { gt: 0 } },
      select: { date: true, pitchCount: true },
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

  type Bucket = { days: Set<string>; count: number; minutes: number };
  const buckets = new Map<number, Bucket>(
    bounds.map((b) => [b.ago, { days: new Set<string>(), count: 0, minutes: 0 }])
  );

  /* 날마다의 상태. 던진 날·운동한 날·암케어 한 날을 여기에 모은다. */
  type DayMark = { pitches: number; trained: boolean; armCare: boolean };
  const marks = new Map<string, DayMark>();
  const markOf = (key: string) => {
    const found = marks.get(key) ?? { pitches: 0, trained: false, armCare: false };
    marks.set(key, found);
    return found;
  };

  for (const log of pitchLogs) {
    markOf(toDateKey(log.date)).pitches += log.pitchCount;
  }

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

    const mark = markOf(key);
    mark.trained = true;
    if (log.exercise.category === ARM_CARE_CATEGORY) mark.armCare = true;
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
    const written = intensitiesByWeek.get(b.ago) ?? [];
    return {
      ago: b.ago,
      label: weekLabel(b.ago),
      from: b.from,
      to: b.to,
      days: bucket.days.size,
      count: bucket.count,
      minutes: Math.round(bucket.minutes),
      intensity: written.length
        ? Math.round((written.reduce((a, c) => a + c, 0) / written.length) * 10) / 10
        : null,
    };
  });

  /* 오래된 날이 앞 — 왼쪽에서 오른쪽으로 읽는 것이 시간 순이다 */
  const days: ReviewDay[] = Array.from({ length: REVIEW_DAYS }, (_, i) => {
    const ago = REVIEW_DAYS - 1 - i;
    const date = dayBefore(today, ago);
    const mark = marks.get(date);
    return {
      date,
      ago,
      pitches: mark?.pitches ?? 0,
      trained: mark?.trained ?? false,
      armCare: mark?.armCare ?? false,
    };
  });

  return {
    weeks,
    days,
    totals: {
      pitchedDays: days.filter((d) => d.pitches > 0).length,
      trainedDays: days.filter((d) => d.trained).length,
      armCareDays: days.filter((d) => d.armCare).length,
      bothDays: days.filter((d) => d.pitches > 0 && d.trained).length,
    },
  };
}
