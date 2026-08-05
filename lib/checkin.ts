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

/**
 * 체크인에서 묻는 부위.
 *
 * 던지는 팔만 다치는 게 아니다. 허리와 하체는 투구에서 힘을 만드는
 * 곳이라 여기가 상하면 폼이 먼저 무너진다. 부위를 늘리면 통증을 더
 * 일찍 잡을 수 있고, 운동 처방에서 뺄 부위도 정확해진다.
 */
export const CHECKIN_PARTS = [
  { key: 'shoulder', label: '어깨' },
  { key: 'elbow', label: '팔꿈치' },
  { key: 'wrist', label: '손목·전완' },
  { key: 'lowerBack', label: '허리' },
  { key: 'lowerBody', label: '하체' },
] as const;

export type CheckinPartKey = (typeof CHECKIN_PARTS)[number]['key'];

export type CheckinParts = Record<CheckinPartKey, string>;

export type CheckinInput = CheckinParts & {
  condition: number;
  sleep: string;
};

/** 어느 한 부위라도 통증이면 운동 처방을 멈추고 병원 안내로 보낸다. */
export function hasPain(checkin: Partial<CheckinParts>) {
  return CHECKIN_PARTS.some((p) => checkin[p.key] === '통증');
}

/** 통증이 있는 부위 이름들 — 안내 문구에 그대로 쓴다. */
export function painfulParts(checkin: Partial<CheckinParts>): string[] {
  return CHECKIN_PARTS.filter((p) => checkin[p.key] === '통증').map((p) => p.label);
}

/** 뻐근한 부위 이름들 */
export function stiffParts(checkin: Partial<CheckinParts>): string[] {
  return CHECKIN_PARTS.filter((p) => checkin[p.key] === '뻐근').map((p) => p.label);
}

/**
 * DB 행이나 폼 값에서 부위 값만 뽑는다.
 * 부위를 늘려도 호출부를 고칠 일이 없게 여기 한 곳에서 처리한다.
 * 예전 기록처럼 값이 없으면 '정상'으로 본다.
 */
export function pickCheckinParts(
  row: Partial<Record<CheckinPartKey, string>>
): CheckinParts {
  const parts = {} as CheckinParts;
  for (const p of CHECKIN_PARTS) parts[p.key] = row[p.key] ?? '정상';
  return parts;
}

/** '어깨 뻐근, 허리 통증'처럼 정상이 아닌 부위만 한 줄로 만든다. */
export function summarizeParts(checkin: Partial<CheckinParts>): string {
  const notable = CHECKIN_PARTS.filter(
    (p) => checkin[p.key] && checkin[p.key] !== '정상'
  ).map((p) => `${p.label} ${checkin[p.key]}`);
  return notable.length > 0 ? notable.join(', ') : '전 부위 정상';
}

/** 폼에서 온 체크인 값을 검사한다. */
export function validateCheckin(
  raw: { condition: string; sleep: string } & Partial<Record<CheckinPartKey, string>>
): { error: string } | { value: CheckinInput } {
  const parts = {} as CheckinParts;

  for (const part of CHECKIN_PARTS) {
    const value = (raw[part.key] ?? '').trim();
    if (!(BODY_FEELINGS as readonly string[]).includes(value)) {
      return { error: `${part.label} 상태를 선택해주세요.` };
    }
    parts[part.key] = value;
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

  const sleep = raw.sleep.trim();
  if (!(SLEEP_LEVELS as readonly string[]).includes(sleep)) {
    return { error: '수면 상태를 선택해주세요.' };
  }

  return { value: { ...parts, condition, sleep } };
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
