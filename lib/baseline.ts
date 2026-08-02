/**
 * 가입 문진 — "평소 얼마나 던지는지" 3문항.
 *
 * 부하 지수는 원래 4주치 기록이 쌓여야 나오는데, 그동안 빈 화면을
 * 보여주는 대신 이 답으로 평소 부하를 추정해 첫날부터 지수를 낸다.
 * 실제 기록이 쌓일수록 추정치의 비중은 자동으로 줄어든다.
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
};

/** 세 답이 모두 목록의 값인지 검사한다. */
export function validateBaseline(raw: {
  baselineFreq: string;
  baselineVolume: string;
  baselineIntensity: string;
}): { error: string } | { value: BaselineAnswers } {
  const baselineFreq = raw.baselineFreq.trim();
  const baselineVolume = raw.baselineVolume.trim();
  const baselineIntensity = raw.baselineIntensity.trim();

  if (!BASELINE_FREQ_NAMES.includes(baselineFreq)) {
    return { error: '평소 던지는 횟수를 선택해주세요.' };
  }
  if (!BASELINE_VOLUME_NAMES.includes(baselineVolume)) {
    return { error: '한 번에 던지는 양을 선택해주세요.' };
  }
  if (!BASELINE_INTENSITY_NAMES.includes(baselineIntensity)) {
    return { error: '평소 던지는 강도를 선택해주세요.' };
  }

  return { value: { baselineFreq, baselineVolume, baselineIntensity } };
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
