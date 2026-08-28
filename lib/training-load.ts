import {
  computeAcwr,
  toDateKey,
  type AcwrResult,
  type AcwrZone,
} from '@/lib/pitch-stats';
import {
  INTENSITY_LEVELS,
  intensityLevel,
  minutesForSets,
  type Prescription,
} from '@/lib/exercise-meta';
import { MAX_CONDITION } from '@/lib/checkin';

/**
 * 운동 부하.
 *
 * 투구와 같은 방식으로 센다 — 지속 시간 × 강도(session-RPE, Foster 2001).
 * 다만 단위가 다르다. 투구는 '투구수 × 강도'이고 운동은 '분 × 강도'다.
 *
 *   두 값을 더하지 않는다.
 *
 * 더하려면 투구수를 분으로 바꿔야 하는데, 구당 몇 초인지를 우리가 재본 적이
 * 없다. 재보지 않은 숫자로 두 부하를 섞으면, 나온 지수가 무엇을 뜻하는지
 * 아무도 설명할 수 없게 된다. 그래서 투구 지수와 운동 지수를 따로 낸다.
 * 지수는 '평소 대비 몇 배'라 단위가 없어서, 나란히 두고 읽을 수 있다.
 */

/** 운동 시간을 재는 데 쓰는 최소 정보 */
export type LoggedExercise = {
  category: string;
  intensity: string;
} & Prescription & {
    /** 실제로 한 세트 수. 안 적었으면 null */
    setsDone: number | null;
  };

/**
 * 이 운동에 실제로 쓴 시간(분).
 *
 * 세트를 안 적었으면 계획 세트로 센다. 완료 표시를 했다는 것은 했다는 뜻이고,
 * 그때 가장 그럴듯한 값은 우리가 짜 준 세트 수다. 0으로 두면 실제로 한 운동이
 * 계산에서 사라진다 — 안 한 것을 한 것으로 세는 것만큼이나 틀린 일이다.
 *
 * 다만 추정한 것은 추정이라고 화면에 밝힌다(estimatedCount).
 */
export function exerciseMinutes(ex: LoggedExercise): number {
  return minutesForSets(ex, ex.setsDone ?? undefined) ?? 0;
}

/**
 * 운동 자체의 강도를 1~10 눈금으로 바꾼다.
 *
 * 사용자가 그날 강도를 안 적었을 때만 쓴다. 라이브러리의 강도는 5단계
 * (매우 낮음~매우 높음)라 두 배 해서 맞춘다 — 매우 높음이 10(전력)이 되는데,
 * 최대에 가까운 무게를 드는 세트라면 그만한 값이 맞다.
 */
export function exerciseIntensityScore(intensity: string): number {
  const level = intensityLevel(intensity);
  return Math.min(MAX_CONDITION, level * 2);
}

/** 강도를 안 적은 날도 계산하는가를 부르는 쪽이 알 수 있게 함께 돌려준다. */
export type TrainingDayLoad = {
  /** 그날 부하 (분 × 강도) */
  load: number;
  /** 그날 실제로 쓴 시간(분) */
  minutes: number;
  /** 쓴 강도. 사용자가 적은 값이거나, 운동에서 뽑은 추정값 */
  intensity: number;
  /** 강도를 사용자가 적었는가 */
  intensityRecorded: boolean;
  /** 세트를 안 적어 계획값으로 센 운동 수 */
  estimatedCount: number;
  /** 그날 마친 운동 수 */
  exerciseCount: number;
};

/**
 * 하루치 운동 부하.
 *
 * 강도를 적었으면 (총 시간 × 그 강도)다. 안 적었으면 운동마다 자기 강도를
 * 써서 더한다 — 11분짜리 데드리프트(강도 10)와 3분짜리 스트레칭(강도 2)을
 * 단순 평균 내면 둘 다 6이 되는데, 그건 어느 쪽도 아니다.
 */
export function trainingDayLoad(
  exercises: LoggedExercise[],
  recordedIntensity: number | null
): TrainingDayLoad {
  let minutes = 0;
  let weighted = 0;
  let estimatedCount = 0;

  for (const ex of exercises) {
    const m = exerciseMinutes(ex);
    minutes += m;
    weighted += m * exerciseIntensityScore(ex.intensity);
    if (ex.setsDone == null) estimatedCount++;
  }

  if (minutes === 0) {
    return {
      load: 0,
      minutes: 0,
      intensity: recordedIntensity ?? 0,
      intensityRecorded: recordedIntensity != null,
      estimatedCount,
      exerciseCount: exercises.length,
    };
  }

  const intensity = recordedIntensity ?? weighted / minutes;
  return {
    load: minutes * intensity,
    minutes,
    intensity,
    intensityRecorded: recordedIntensity != null,
    estimatedCount,
    exerciseCount: exercises.length,
  };
}

/**
 * 운동 부하 구간별 조언.
 *
 * 투구 쪽 문구(ACWR_ZONES.advice)를 그대로 쓸 수 없다. "투구량을 확실히
 * 줄이세요"가 운동 부하 밑에 붙으면, 운동을 많이 한 사람에게 던지는 것을 줄이라고
 * 말하는 꼴이 된다. 실제로 그렇게 나오는 것을 보고 나눴다.
 */
export const TRAINING_ADVICE: Record<AcwrZone, string> = {
  low: '최근 운동량이 평소보다 적습니다. 회복 중이라면 정상이며, 다시 올릴 때는 한 번에 늘리지 말고 조금씩 올리세요.',
  optimal: '평소 쌓아온 양에 맞는 운동량입니다. 지금 흐름을 유지해도 좋습니다.',
  caution: '최근 운동량이 평소보다 빠르게 올랐습니다. 이번 주는 세트 수나 강도를 조금 낮추는 편이 안전합니다.',
  danger: '평소 감당하던 양을 크게 넘었습니다. 무게를 다루는 운동을 줄이고 회복에 시간을 주세요. 던지는 날이 겹치면 특히 조심하세요.',
};

/** 강도 눈금 설명 — 화면에서 "이 숫자가 뭔가요"에 그대로 쓴다. */
export const TRAINING_INTENSITY_FALLBACK_NOTE = `강도를 안 적은 날은 운동마다 붙은 강도(${INTENSITY_LEVELS.map(
  (l) => l.name
).join('·')})를 시간만큼 반영해 대신 셉니다.`;

/* ─────────────────────────── 부하 지수 ─────────────────────────── */

/**
 * 여기까지가 DB를 모르는 부분이다.
 *
 * 조회는 lib/report/training-acwr.ts 가 맡는다. 날짜별로 묶는 일은 틀리기
 * 쉬운데(시간대, 하루 여러 줄), 조회와 붙어 있으면 시험에서 확인할 수가 없다.
 */

export type TrainingLoad = AcwrResult & {
  /** 최근 7일에 마친 운동 수 */
  recentCount: number;
  /** 최근 7일 운동 시간(분) */
  recentMinutes: number;
  /** 최근 7일에 운동한 날 수 */
  recentDays: number;
  /** 최근 7일 중 강도를 안 적어 추정한 날 수 */
  estimatedIntensityDays: number;
  /** 최근 7일 중 세트를 안 적어 계획값으로 센 운동 수 */
  estimatedSetsCount: number;
};

/** DB에서 읽어 온 줄. 시험에서는 이 모양을 손으로 만들어 넣는다. */
export type ExerciseLogRow = {
  date: Date;
  setsDone: number | null;
  exercise: Omit<LoggedExercise, 'setsDone'>;
};
export type TrainingNoteRow = { date: Date; intensity: number };

/**
 * 읽어 온 줄로 지수를 낸다.
 *
 * DB에 손대는 부분과 나눠 두었다. 날짜별로 묶는 일은 틀리기 쉬운데(시간대,
 * 하루 여러 줄), 조회와 붙어 있으면 시험에서 확인할 수가 없다.
 */
export function buildTrainingLoad(
  logs: ExerciseLogRow[],
  notes: TrainingNoteRow[],
  today = new Date(),
  /** 가입 문진으로 추정한 하루 평균 운동 부하. 없으면 28일이 쌓여야 지수가 나온다. */
  seedDailyLoad: number | null = null
): TrainingLoad {
  const byDay = new Map<string, LoggedExercise[]>();
  for (const log of logs) {
    const key = toDateKey(log.date);
    const list = byDay.get(key) ?? [];
    list.push({ ...log.exercise, setsDone: log.setsDone });
    byDay.set(key, list);
  }

  const intensityByDay = new Map(
    notes.map((n) => [toDateKey(n.date), n.intensity])
  );

  /*
   * 운동을 하나도 체크 안 했는데 강도만 적은 날이 있다. 그런 날은 시간이 0이라
   * 부하도 0이 되는데, 그건 맞다 — 얼마나 했는지 알 길이 없으면 셀 수가 없다.
   * 대신 달력에는 표시된다(training-history.ts).
   */
  const dailyLoads = new Map<string, number>();
  const detail = new Map<string, ReturnType<typeof trainingDayLoad>>();
  for (const [key, exercises] of byDay) {
    const day = trainingDayLoad(exercises, intensityByDay.get(key) ?? null);
    dailyLoads.set(key, day.load);
    detail.set(key, day);
  }

  const acwr = computeAcwr(dailyLoads, today, { seedDailyLoad });

  /* 최근 7일 — 화면에서 "이번 주 운동"으로 쓴다. */
  const todayKey = toDateKey(today);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const fromKey = toDateKey(weekAgo);

  let recentCount = 0;
  let recentMinutes = 0;
  let recentDays = 0;
  let estimatedIntensityDays = 0;
  let estimatedSetsCount = 0;
  for (const [key, day] of detail) {
    if (key < fromKey || key > todayKey) continue;
    if (day.exerciseCount === 0) continue;
    recentDays++;
    recentCount += day.exerciseCount;
    recentMinutes += day.minutes;
    if (!day.intensityRecorded) estimatedIntensityDays++;
    estimatedSetsCount += day.estimatedCount;
  }

  return {
    ...acwr,
    recentCount,
    recentMinutes: Math.round(recentMinutes),
    recentDays,
    estimatedIntensityDays,
    estimatedSetsCount,
  };
}
