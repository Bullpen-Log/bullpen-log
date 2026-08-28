import {
  computeAcwr,
  toDateKey,
  type AcwrResult,
  type AcwrZone,
} from '@/lib/pitch-stats';
import {
  intensityLevel,
  isCompound,
  minutesForSets,
  type Prescription,
} from '@/lib/exercise-meta';

/**
 * 운동 부하.
 *
 * 세트 하나를 단위로 센다.
 *
 *   운동 부하 = Σ (실제 세트 × 운동 계수) × 그날 강도 배수
 *
 * 나온 값의 단위는 '환산 세트'다 — 데드리프트 한 세트를 1로 놓았을 때 몇 세트
 * 만큼 했는가. 숫자가 무엇을 뜻하는지 한 문장으로 말할 수 있어야 한다는 뜻이다.
 *
 * ── 왜 시간으로 안 세나 ─────────────────────────────────────────
 *
 * 처음에는 시간 × 강도였다(session-RPE, Foster 2001). 그 방식은 지구력·구기
 * 종목에서 검증됐는데, 웨이트에는 맞지 않는다. 실제로 재보니 이랬다.
 *
 *   데드리프트 한 세트 220초 = 수행 40초 + 휴식 180초
 *   → 부하의 82%가 '가만히 있는 시간'에서 나온다
 *
 *   데드리프트(매우 높음) 1.00 = 밀리터리 프레스(높음) 1.00
 *   → 둘 다 휴식 180초라, 라이브러리에 붙여 둔 강도가 사라진다
 *
 *   피전 포즈(스트레칭) 0.36 vs 사이드 레터럴 레이즈 0.41
 *   → 스트레칭과 어깨 운동이 거의 같은 부하가 된다
 *
 * 시간을 버리고 세트로 세면 이 셋이 한 번에 풀린다. 세트 수는 근력 문헌에서
 * 용량 변수로 널리 쓰는 값이기도 하다(주당 세트 수 — Schoenfeld 계열 메타분석).
 *
 * ── 투구 부하와는 합치지 않는다 ──────────────────────────────────
 *
 * 투구는 '투구수 × 강도'라 단위가 다르다. 합치려면 공 하나에 몇 초인지를
 * 정해야 하는데 그 값을 재본 적이 없다. 지수는 '평소 대비 몇 배'라 단위가
 * 없으므로, 둘을 나란히 두고 읽으면 된다.
 */

/** 부하를 세는 데 쓰는 최소 정보 */
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
 * 부하 계산에는 더 이상 쓰지 않는다. 화면에서 "이번 주 471분"처럼 보여주는
 * 데만 쓴다 — 사람은 분을 이해하지, 환산 세트를 처음부터 이해하지는 않는다.
 *
 * 세트를 안 적었으면 계획 세트로 센다. 완료 표시를 했다는 것은 했다는 뜻이고,
 * 그때 가장 그럴듯한 값은 우리가 짜 준 세트 수다.
 */
export function exerciseMinutes(ex: LoggedExercise): number {
  return minutesForSets(ex, ex.setsDone ?? undefined) ?? 0;
}

/* ───────────────────── 세트 하나가 요구하는 크기 ───────────────────── */

/**
 * 동원 근육량 계수.
 *
 * 그 운동 한 세트가 몸 전체에 얼마나 요구하는가. 데드리프트를 1로 놓는다.
 *
 * 연구에서 그대로 가져온 숫자가 아니다 — 근력 문헌은 보통 중량(볼륨 로드)이나
 * 세트 수로 세지, 종목 간 가중치를 정해 두지 않는다. 여기 값은 우리 판단이고,
 * 근거는 하나다: 한 세트에 동원되는 근육량과 회복에 걸리는 시간.
 * 그래서 세트 사이 휴식을 정할 때 쓴 것과 같은 기준(다관절/단관절)을 쓴다.
 */
const MASS_FACTOR: Record<string, number> = {
  파워: 1.0, // 전신 + 신경계. 무게는 가벼워도 회복은 오래 걸린다
  코어: 0.45,
  암케어: 0.35,
  '회복 및 보강': 0.3,
  모빌리티: 0.15,
};

/** 스트렝스는 다관절이냐 단관절이냐로 갈린다 */
const COMPOUND_MASS = 1.0;
const ISOLATION_MASS = 0.55;

/**
 * 라이브러리에 붙여 둔 강도(5단계) → 배수.
 *
 * 이 값이 사라지지 않게 하는 것이 이번 개편의 핵심이다. 예전 방식에서는
 * 강도가 다른 두 운동이 휴식이 같다는 이유로 같은 부하가 됐다.
 */
const LEVEL_FACTOR: Record<number, number> = {
  5: 1.0, // 매우 높음
  4: 0.8, // 높음
  3: 0.55, // 중간
  2: 0.35, // 낮음
  1: 0.2, // 매우 낮음
};

/**
 * 좌우를 따로 하는 운동의 배수.
 *
 * "3세트"라고 적어도 실제로는 좌우 여섯 세트를 한다. 그렇다고 두 배로 세지는
 * 않는다 — 한쪽씩 하면 한 세트에 쓰는 무게가 양쪽으로 할 때보다 가볍다.
 * 시간과 볼륨은 늘지만 전신에 걸리는 부담은 두 배가 아니라고 보고 1.5로 둔다.
 */
const PER_SIDE_FACTOR = 1.5;

/**
 * 운동 한 세트의 부하 계수.
 *
 * 데드리프트(다관절 · 매우 높음) 한 세트가 1.0이다.
 */
export function setFactor(ex: {
  category: string;
  intensity: string;
  bodyParts?: readonly string[];
  perSide?: boolean | null;
}): number {
  const mass =
    MASS_FACTOR[ex.category] ??
    (isCompound(ex.bodyParts ?? []) ? COMPOUND_MASS : ISOLATION_MASS);
  const level = LEVEL_FACTOR[intensityLevel(ex.intensity)] ?? 0.55;
  return mass * level * (ex.perSide ? PER_SIDE_FACTOR : 1);
}

/**
 * 그날 강도(1~10) → 전체에 곱하는 배수.
 *
 * 운동 계수가 이미 "이 운동이 얼마나 무거운가"를 담고 있으므로, 그날 강도는
 * 조절만 한다. 그대로 곱하면 스트레칭에도 '강도 8'이 통째로 붙는다.
 *
 *   강도 1 → 0.5   강도 6 → 1.0   강도 10 → 1.4
 *
 * 안 적은 날은 1.0이다. 계수대로 했다고 보는 것이며, 예전처럼 따로 추정하는
 * 규칙을 두지 않는다 — 운동별 강도는 이미 계수 안에 들어가 있다.
 */
export function intensityFactor(recorded: number | null): number {
  if (recorded == null) return 1;
  return 0.4 + recorded / 10;
}

/** 강도를 안 적은 날도 계산하는가를 부르는 쪽이 알 수 있게 함께 돌려준다. */
export type TrainingDayLoad = {
  /** 그날 부하 — 환산 세트 (데드리프트 한 세트 = 1) */
  load: number;
  /** 그날 실제로 쓴 시간(분). 화면 표시용 */
  minutes: number;
  /** 강도 배수를 빼고 센 환산 세트 */
  sets: number;
  /** 쓴 강도. 안 적었으면 null */
  intensity: number | null;
  /** 강도를 사용자가 적었는가 */
  intensityRecorded: boolean;
  /** 세트를 안 적어 계획값으로 센 운동 수 */
  estimatedCount: number;
  /** 그날 마친 운동 수 */
  exerciseCount: number;
};

/** 하루치 운동 부하. */
export function trainingDayLoad(
  exercises: LoggedExercise[],
  recordedIntensity: number | null
): TrainingDayLoad {
  let minutes = 0;
  let sets = 0;
  let estimatedCount = 0;

  for (const ex of exercises) {
    minutes += exerciseMinutes(ex);
    /*
     * 세트를 안 적었으면 계획 세트로 센다. 체크했다는 것은 했다는 뜻이고,
     * 0으로 두면 실제로 한 운동이 계산에서 사라진다.
     */
    const count = ex.setsDone ?? ex.sets ?? 0;
    sets += count * setFactor(ex);
    if (ex.setsDone == null) estimatedCount++;
  }

  return {
    load: sets * intensityFactor(recordedIntensity),
    minutes,
    sets,
    intensity: recordedIntensity,
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

/** 계산 방법 한 줄 — 화면의 "이 숫자가 뭔가요"에 그대로 쓴다. */
export const TRAINING_LOAD_NOTE =
  '운동 부하 = 세트 수 × 운동별 계수 × 그날 강도. 계수는 데드리프트 한 세트를 1로 놓고, 동원하는 근육량과 라이브러리에 붙은 강도로 정합니다.';

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
