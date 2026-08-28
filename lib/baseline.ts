/**
 * 가입 문진.
 *
 * 부하 지수는 원래 4주치 기록이 쌓여야 나오는데, 그동안 빈 화면을 보여주는
 * 대신 이 답으로 평소 부하를 추정해 첫날부터 지수를 낸다. 실제 기록이 쌓일수록
 * 추정치의 비중은 자동으로 줄어든다.
 *
 * 문항은 여덟 개다. 늘릴 때마다 가입에서 그만큼 사람이 빠지므로, 받는 값마다
 * 쓰이는 곳이 분명해야 한다.
 *
 *   생년월일       나이별 안전 투구수 한도 (lib/report/plan.ts)
 *   키             영상에서 잰 스트라이드를 몸 크기로 나눠 비교 (lib/pose)
 *   던지는 손       폼 분석에서 어느 팔을 볼지
 *   투구 3문항      투구 부하 지수의 시작 기준선
 *   웨이트 빈도     운동 부하 지수의 시작 기준선
 *   수준           지금은 쓰지 않는다. 나중에 또래와 견주기 위해 모은다.
 */

export const BASELINE_FREQ = [
  { name: '주 0~1회', sessionsPerWeek: 0.5 },
  { name: '주 2~3회', sessionsPerWeek: 2.5 },
  { name: '주 4회 이상', sessionsPerWeek: 4.5 },
] as const;

export const BASELINE_VOLUME = [
  { name: '30구 이하', pitches: 20 },
  { name: '30~60구', pitches: 45 },
  { name: '60구 이상', pitches: 75 },
] as const;

export const BASELINE_INTENSITY = [
  { name: '캐치볼 위주', intensity: 3 },
  { name: '절반 전력', intensity: 6 },
  { name: '전력 투구 위주', intensity: 8 },
] as const;

/**
 * 평소 웨이트 빈도 → 주당 운동 세션 수.
 *
 * 운동 부하는 '환산 세트'로 센다(lib/training-load.ts). 여기에 하루 운동
 * 시간을 곱하면 주당 부하가 나온다.
 */
export const BASELINE_WORKOUT_FREQ = [
  { name: '거의 안 함', sessionsPerWeek: 0.5 },
  { name: '주 1~2회', sessionsPerWeek: 1.5 },
  { name: '주 3~4회', sessionsPerWeek: 3.5 },
  { name: '주 5회 이상', sessionsPerWeek: 5.5 },
] as const;

/**
 * 운동 1분이 만드는 환산 세트.
 *
 * 지어낸 값이 아니라 실제로 재서 넣었다. 우리가 만드는 스트렝스 일정을
 * 30·45·60·90분으로 뽑아 환산 세트를 세어보니 분당 0.164~0.187로 일정했다.
 *
 *   하체 45분 → 9종목 8.4 환산 세트 (분당 0.187)
 *   상체 90분 → 16종목 14.8 환산 세트 (분당 0.164)
 *
 * 문진에 답하는 사람은 웨이트를 하는 사람이므로 스트렝스 쪽 값을 쓴다.
 * 회복·보조 위주 일정은 분당 0.10쯤인데, 그건 우리가 몸 상태를 보고 내주는
 * 날이지 본인이 "평소 주 3회 웨이트"라고 답할 때 떠올리는 날이 아니다.
 */
const EQUIVALENT_SETS_PER_MINUTE = 0.17;

/** 던지는 손. 폼 분석에서 어느 팔을 보는지 정한다. */
export const THROWING_HANDS = ['우투', '좌투'] as const;

/**
 * 어디서 야구를 하는지.
 *
 * 이 값으로 무엇을 강제로 바꾸지 않는다 — 나이는 생년월일로 이미 알고 있고
 * 안전 한도도 거기서 나온다. 나중에 "고등학교 투수들은 보통 어떤지"를 보려고
 * 모으는 값이다.
 */
export const COMPETITION_LEVELS = [
  '초등학교',
  '중학교',
  '고등학교',
  '대학교',
  '실업·프로',
  '사회인·동호회',
] as const;

export const BASELINE_WORKOUT_FREQ_NAMES: readonly string[] =
  BASELINE_WORKOUT_FREQ.map((o) => o.name);

export const BASELINE_FREQ_NAMES: readonly string[] = BASELINE_FREQ.map((o) => o.name);
export const BASELINE_VOLUME_NAMES: readonly string[] = BASELINE_VOLUME.map(
  (o) => o.name
);
export const BASELINE_INTENSITY_NAMES: readonly string[] = BASELINE_INTENSITY.map(
  (o) => o.name
);

export type BaselineAnswers = {
  baselineFreq: string;
  baselineVolume: string;
  baselineIntensity: string;
  baselineWorkoutFreq: string;
  throwingHand: string;
  /** 안 골라도 되는 값이라 빈 문자열이면 null 로 저장한다 */
  competitionLevel: string | null;
};

/**
 * 문진 답이 모두 목록 안의 값인지 검사한다.
 *
 * 목록에 없는 값이 넘어오면 오래된 화면이거나 손으로 만든 요청이고, 어느
 * 쪽이든 저장하면 안 된다 — 이 값들로 부하 기준선이 만들어진다.
 *
 * 수준(competitionLevel)만 안 골라도 통과시킨다. 지금 아무 계산에도 안 쓰는
 * 값이라 이것 때문에 가입이 막히면 잃는 쪽이 크다.
 */
export function validateBaseline(raw: {
  baselineFreq: string;
  baselineVolume: string;
  baselineIntensity: string;
  baselineWorkoutFreq: string;
  throwingHand: string;
  competitionLevel: string;
}): { error: string } | { value: BaselineAnswers } {
  const baselineFreq = raw.baselineFreq.trim();
  const baselineVolume = raw.baselineVolume.trim();
  const baselineIntensity = raw.baselineIntensity.trim();
  const baselineWorkoutFreq = raw.baselineWorkoutFreq.trim();
  const throwingHand = raw.throwingHand.trim();
  const competitionLevel = raw.competitionLevel.trim();

  if (!BASELINE_FREQ_NAMES.includes(baselineFreq)) {
    return { error: '평소 던지는 횟수를 선택해주세요.' };
  }
  if (!BASELINE_VOLUME_NAMES.includes(baselineVolume)) {
    return { error: '한 번에 던지는 양을 선택해주세요.' };
  }
  if (!BASELINE_INTENSITY_NAMES.includes(baselineIntensity)) {
    return { error: '평소 던지는 강도를 선택해주세요.' };
  }
  if (!BASELINE_WORKOUT_FREQ_NAMES.includes(baselineWorkoutFreq)) {
    return { error: '평소 웨이트 횟수를 선택해주세요.' };
  }
  if (!(THROWING_HANDS as readonly string[]).includes(throwingHand)) {
    return { error: '던지는 손을 선택해주세요.' };
  }
  if (
    competitionLevel !== '' &&
    !(COMPETITION_LEVELS as readonly string[]).includes(competitionLevel)
  ) {
    return { error: '어디서 야구를 하시는지 다시 선택해주세요.' };
  }

  return {
    value: {
      baselineFreq,
      baselineVolume,
      baselineIntensity,
      baselineWorkoutFreq,
      throwingHand,
      competitionLevel: competitionLevel || null,
    },
  };
}

/**
 * 문진 답 → 하루 평균 부하 추정치.
 * 부하 = 투구수 × 강도이므로, 주당 (회수 × 구수 × 강도)를 7로 나눈다.
 * 답이 하나라도 없으면 추정하지 않는다(null).
 */
export function estimateDailyLoad(answers: {
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
}): number | null {
  const freq = BASELINE_FREQ.find((o) => o.name === answers.baselineFreq);
  const volume = BASELINE_VOLUME.find((o) => o.name === answers.baselineVolume);
  const intensity = BASELINE_INTENSITY.find(
    (o) => o.name === answers.baselineIntensity
  );
  if (!freq || !volume || !intensity) return null;

  return (freq.sessionsPerWeek * volume.pitches * intensity.intensity) / 7;
}

/**
 * 문진 답 → 하루 평균 운동 부하 추정치(환산 세트).
 *
 * 주당 (회수 × 세션 분 × 분당 환산 세트)를 7로 나눈다. 세션 시간은 본인이
 * 고른 하루 운동 시간을 쓴다 — 우리가 그 시간에 맞춰 일정을 짜므로 실제와
 * 가장 가깝다.
 *
 * 강도는 곱하지 않는다. 환산 세트에는 운동마다 붙은 강도가 이미 들어 있고,
 * 그날 강도 배수는 '평소처럼 했으면 1.0'이라 평균으로는 1이다.
 *
 * 답이 없으면 추정하지 않는다(null). 그러면 운동 지수는 28일이 쌓여야 나온다.
 */
export function estimateTrainingDailyLoad(answers: {
  baselineWorkoutFreq: string | null;
  dailyWorkoutMinutes: number | null;
}): number | null {
  const freq = BASELINE_WORKOUT_FREQ.find(
    (o) => o.name === answers.baselineWorkoutFreq
  );
  if (!freq) return null;

  const minutes = answers.dailyWorkoutMinutes ?? DEFAULT_SESSION_MINUTES;
  return (freq.sessionsPerWeek * minutes * EQUIVALENT_SETS_PER_MINUTE) / 7;
}

/**
 * 하루 운동 시간을 아직 안 고른 사람의 기본값.
 *
 * lib/report/theme.ts 의 DEFAULT_WORKOUT_MINUTES 와 같은 값이다. 그쪽을
 * 그대로 가져오면 이 파일이 화면 쪽 모듈에 얽히므로 숫자만 적어 둔다.
 * 한쪽을 바꾸면 다른 쪽도 바꿔야 한다 — 자가 시험이 둘이 같은지 본다.
 */
export const DEFAULT_SESSION_MINUTES = 45;
