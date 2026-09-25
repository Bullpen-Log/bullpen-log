import { toDateKey } from '@/lib/pitch-stats';

/**
 * 회원의 신체 정보. 나이는 안전한 투구수 한도를 정하는 데 쓰이고,
 * 키는 영상에서 잰 길이(스트라이드 등)를 몸 크기로 나눠 비교할 때 쓴다.
 */

export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;

/**
 * 몸무게(kg)와 윙스팬(cm)의 허용 범위.
 *
 * 넉넉하게 잡는다. 여기서 막으려는 것은 '73'을 몸무게 칸이 아니라 키 칸에
 * 적는 것 같은 실수이지 남다른 체격이 아니다 — 초등학생부터 성인까지 한 앱을
 * 쓴다.
 *
 * 윙스팬은 보통 키와 비슷하거나 조금 길다. 그래도 키와 같은 범위로 두지 않고
 * 위를 조금 넓혔다 — 팔이 긴 투수는 키보다 10cm 넘게 길기도 하다.
 */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 200;
export const MIN_WINGSPAN_CM = 100;
export const MAX_WINGSPAN_CM = 260;

/**
 * 비워둘 수 있는 숫자 칸 하나를 확인한다.
 *
 * 빈 칸은 '지운다'는 뜻이라 null 로 통과시킨다. 값이 있으면 숫자인지와 범위를
 * 본다 — 몸무게와 윙스팬이 같은 모양이라 한 곳에 모은다.
 */
export function checkOptionalNumber(
  raw: string,
  { label, min, max, unit }: { label: string; min: number; max: number; unit: string }
): { value: number | null } | { error: string } {
  const text = raw.trim();
  if (text === '') return { value: null };

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { error: `${label}은(는) 숫자로 입력해주세요.` };
  }
  if (parsed < min || parsed > max) {
    return { error: `${label}은(는) ${min}~${max}${unit} 사이로 입력해주세요.` };
  }
  /* 소수 한 자리까지만 남긴다. 저장 단위는 언제나 kg·cm 다. */
  return { value: Number(parsed.toFixed(1)) };
}

/**
 * 성별 — 계정에 딸린 값(User.sex). 가입할 때 고르고 내 정보에서 바꾼다.
 *
 * 영양 목표의 기초대사량 식(남녀 상수가 다르다)에 쓴다. 처음에는 영양 목표 창에서
 * 따로 골랐는데, 몸에 대한 사실이라 키·생년월일처럼 계정에 두는 편이 맞다 —
 * 영양 탭에서 한 번, 다른 곳에서 또 한 번 묻게 되면 둘이 어긋난다.
 *
 * 가입 화면과 내 정보는 클라이언트 컴포넌트라, DB 를 모르는 이 파일에 둔다.
 */
export const SEXES = [
  { key: 'M', label: '남' },
  { key: 'F', label: '여' },
] as const;

export type Sex = (typeof SEXES)[number]['key'];

export function isSex(v: unknown): v is Sex {
  return v === 'M' || v === 'F';
}

/** 폼의 라디오 단추용 — 보이는 글자('남')와 보내는 값('M')이 다르다 */
export const SEX_OPTIONS = SEXES.map((s) => ({ name: s.label, value: s.key }));

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
