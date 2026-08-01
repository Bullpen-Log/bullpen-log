/**
 * 몸상태 체크인의 선택지와 검사.
 *
 * 체크인은 운동 처방과 리포트의 입력이 된다. 특히 '통증'은
 * 모든 운동 추천을 중단시키는 안전장치의 1차 관문이므로,
 * 여기 값을 바꿀 때는 통증 판정 로직(hasPain)도 함께 봐야 한다.
 */

export const BODY_FEELINGS = ['정상', '뻐근', '통증'] as const;
export const SLEEP_LEVELS = ['충분', '보통', '부족'] as const;

/** 전신 컨디션. 높을수록 좋다 — 1 안 좋음, 10 최상. */
export const MIN_CONDITION = 1;
export const MAX_CONDITION = 10;

export type CheckinInput = {
  shoulder: string;
  elbow: string;
  condition: number;
  sleep: string;
};

/** 어깨나 팔꿈치에 통증이 있는가. 있으면 운동 처방을 멈추고 병원 안내로 보낸다. */
export function hasPain(checkin: Pick<CheckinInput, 'shoulder' | 'elbow'>) {
  return checkin.shoulder === '통증' || checkin.elbow === '통증';
}

/** 폼에서 온 체크인 값을 검사한다. */
export function validateCheckin(raw: {
  shoulder: string;
  elbow: string;
  condition: string;
  sleep: string;
}): { error: string } | { value: CheckinInput } {
  const shoulder = raw.shoulder.trim();
  const elbow = raw.elbow.trim();
  const sleep = raw.sleep.trim();

  if (!(BODY_FEELINGS as readonly string[]).includes(shoulder)) {
    return { error: '어깨 상태를 선택해주세요.' };
  }
  if (!(BODY_FEELINGS as readonly string[]).includes(elbow)) {
    return { error: '팔꿈치 상태를 선택해주세요.' };
  }

  const condition = Number(raw.condition);
  if (
    !Number.isInteger(condition) ||
    condition < MIN_CONDITION ||
    condition > MAX_CONDITION
  ) {
    return {
      error: `컨디션은 ${MIN_CONDITION}~${MAX_CONDITION} 중에서 골라주세요.`,
    };
  }

  if (!(SLEEP_LEVELS as readonly string[]).includes(sleep)) {
    return { error: '수면 상태를 선택해주세요.' };
  }

  return { value: { shoulder, elbow, condition, sleep } };
}

/**
 * 체크인 날짜를 검사한다. YYYY-MM-DD 형식이어야 하고,
 * 시간대 차이를 감안해 서버 기준 어제~내일까지만 허용한다.
 * (기록을 과거로 소급하거나 미래에 미리 쓰는 것을 막는다.)
 */
export function validateCheckinDate(
  dateKey: string,
  now = new Date()
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const candidate = Date.UTC(y, m - 1, d);
  if (Number.isNaN(candidate)) return false;

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.abs(candidate - today) / 86_400_000;
  return diffDays <= 1;
}
