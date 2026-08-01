import { toDateKey } from '@/lib/pitch-stats';

/**
 * 회원의 신체 정보. 나이는 안전한 투구수 한도를 정하는 데 쓰이고,
 * 키는 영상에서 잰 길이(스트라이드 등)를 몸 크기로 나눠 비교할 때 쓴다.
 */

export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;

/** 이 범위를 벗어난 생년월일은 잘못 입력한 것으로 본다. */
export const MIN_AGE = 5;
export const MAX_AGE = 100;

/** 날짜만 저장하므로 시간대에 흔들리지 않게 UTC 자정으로 맞춘다. */
export function parseBirthDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // new Date는 2026-02-31 같은 값을 3월로 넘겨버리므로 되돌려 확인한다.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/** <input type="date">에 넣을 수 있는 YYYY-MM-DD */
export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** 만 나이 */
export function ageFromBirthDate(birthDate: Date, today = new Date()) {
  const [by, bm, bd] = toDateInputValue(birthDate).split('-').map(Number);
  const [ty, tm, td] = toDateKey(today).split('-').map(Number);

  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export type ProfileInput = {
  birthDate: Date | null;
  heightCm: number | null;
};

/**
 * 폼에서 온 생년월일·키를 검사한다.
 * 키는 선택 입력이라 비워두면 null로 지운다.
 */
export function validateProfile(
  rawBirthDate: string,
  rawHeight: string,
  { requireBirthDate }: { requireBirthDate: boolean }
): { error: string } | { value: ProfileInput } {
  const trimmedBirth = rawBirthDate.trim();

  let birthDate: Date | null = null;
  if (trimmedBirth) {
    birthDate = parseBirthDate(trimmedBirth);
    if (!birthDate) {
      return { error: '생년월일을 올바르게 입력해주세요.' };
    }

    const age = ageFromBirthDate(birthDate);
    if (age < MIN_AGE || age > MAX_AGE) {
      return { error: '생년월일을 다시 확인해주세요.' };
    }
  } else if (requireBirthDate) {
    return { error: '생년월일을 입력해주세요.' };
  }

  const trimmedHeight = rawHeight.trim();
  let heightCm: number | null = null;
  if (trimmedHeight) {
    const parsed = Number(trimmedHeight);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return { error: '키는 정수로 입력해주세요.' };
    }
    if (parsed < MIN_HEIGHT_CM || parsed > MAX_HEIGHT_CM) {
      return {
        error: `키는 ${MIN_HEIGHT_CM}~${MAX_HEIGHT_CM}cm 사이로 입력해주세요.`,
      };
    }
    heightCm = parsed;
  }

  return { value: { birthDate, heightCm } };
}
