/**
 * 몸상태 체크인의 선택지와 검사.
 *
 * 체크인은 운동 처방과 리포트의 입력이 된다. 특히 '통증'은
 * 모든 운동 추천을 중단시키는 안전장치의 1차 관문이므로,
 * 여기 값을 바꿀 때는 통증 판정 로직(hasPain)도 함께 봐야 한다.
 */

import { toDateKey } from '@/lib/pitch-stats';
/* 타입만 읽는다 — 체크인 폼이 모든 화면에 실려서, 부위 설명 글까지 따라 들어오지 않게(아래 '팔 통증') */
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';

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
  /** 오늘 하고 싶은 운동 부위. 안 고르면 빈 배열이다. */
  preferredParts: string[];
  /** 오늘 하고 싶은 운동 종류. 안 고르면 null('추천대로'). */
  preferredWorkout?: string | null;
};

/**
 * 한 번에 고를 수 있는 부위 수.
 *
 * 다 고르는 것은 아무것도 안 고른 것과 같아서 상한을 둔다.
 * 넘겨도 오류를 내지 않고 앞에서부터 자른다 — 부위를 하나 더 눌렀다고
 * 체크인 저장이 막히면 안 된다.
 */
export const MAX_PREFERRED_PARTS = 3;

/* ─────────────────────── 오늘 하고 싶은 운동 종류 ─────────────────────── */

/**
 * 부위만으로는 부족해서 넣었다.
 *
 * "오늘 하체"까지는 골랐는데 그게 무거운 스쿼트인지 점프인지 가벼운 가동성인지
 * 알 길이 없었다. 세 가지는 몸에 걸리는 부담이 전혀 다르다.
 *
 * 부위와 같은 성격의 값이다 — 안전 규칙을 뚫는 것이 아니라, 통과한 후보 안에서
 * 순서와 테마를 바꾼다. 통증이 있는 날에는 무엇을 골랐든 회복으로 간다.
 */
export const WORKOUT_KINDS = [
  { name: '파워', desc: '점프·메디신볼처럼 빠르게 힘 쓰기' },
  { name: '웨이트', desc: '무게를 들어 근력 기르기' },
  { name: '회복', desc: '가동성·보강 위주로 가볍게' },
] as const;

export type WorkoutKind = (typeof WORKOUT_KINDS)[number]['name'];

/**
 * 아무것도 안 골랐을 때 화면에 보이는 이름.
 *
 * 저장은 null 로 한다 — '고르지 않음'을 값으로 저장하면, 나중에 목록을 고칠 때
 * 그 값이 무엇이었는지 다시 따져야 한다.
 */
export const NO_WORKOUT_KIND = '추천대로';

/** 폼에서 넘어온 값을 정리한다. 목록에 없으면 안 고른 것으로 본다. */
export function pickWorkoutKind(value: unknown): WorkoutKind | null {
  const name = typeof value === 'string' ? value.trim() : '';
  return (WORKOUT_KINDS as readonly { name: string }[]).some((k) => k.name === name)
    ? (name as WorkoutKind)
    : null;
}

/**
 * 고른 부위를 정리한다.
 *
 * 라이브러리에 실제로 있는 부위만 남긴다. 화면에 없는 값이 넘어왔다면
 * 오래된 화면이거나 손으로 만든 요청이고, 어느 쪽이든 무시하면 된다.
 * 여기서 걸러도 안전과는 무관하다 — 선호는 순서만 바꾸지, 위험한 운동을
 * 통과시키지 않는다.
 */
export function normalizePreferredParts(raw: string[], available: string[]): string[] {
  const allowed = new Set(available);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw) {
    const value = part.trim();
    if (!value || seen.has(value) || !allowed.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_PREFERRED_PARTS) break;
  }
  return out;
}

/** 어느 한 부위라도 통증이면 운동 처방을 멈추고 병원 안내로 보낸다. */
export function hasPain(checkin: Partial<CheckinParts>) {
  return CHECKIN_PARTS.some((p) => checkin[p.key] === '통증');
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
  raw: { condition: string; sleep: string } & Partial<Record<CheckinPartKey, string>>,
  /** 오늘 하고 싶은 부위 (선택). 라이브러리에 있는 것만 남긴다. */
  preferred: { raw: string[]; available: string[] } = { raw: [], available: [] }
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

  return {
    value: {
      ...parts,
      condition,
      sleep,
      preferredParts: normalizePreferredParts(preferred.raw, preferred.available),
    },
  };
}

/**
 * 체크인 날짜를 검사한다. YYYY-MM-DD 형식이어야 하고,
 * 한국 시간 기준 어제~내일까지만 허용한다.
 * (기록을 과거로 소급하거나 미래에 미리 쓰는 것을 막는다.)
 *
 * 서버가 UTC로 돌아도 기준은 한국 날짜다. 예전에는 서버 UTC 날짜로 쟀는데,
 * 한국 시간 새벽에 체크인하면 '내일'로 판정돼 거절되는 일이 있었다.
 */
export function validateCheckinDate(dateKey: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const candidate = Date.UTC(y, m - 1, d);
  if (Number.isNaN(candidate)) return false;

  const [ty, tm, td] = toDateKey(now).split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.abs(candidate - today) / 86_400_000;
  return diffDays <= 1;
}

/* ─────────────────────── 근육통 · 잔 시간 (간편 쪽 선택 칸) ─────────────────────── */

/*
 * 트레이닝 추천이 읽는 두 칸(2026-09-30 사용자: "수면 시간은 숫자로 선택할 수 있게, 근육통은 트레이닝에
 * 중요한 데이터니까 넣어둬 … 둘 다 트레이닝을 추천함에 있어서 필요한 데이터야").
 *
 * 상세가 아니라 간편 쪽에 둔다 — 기본이 간편이라 상세에 두면 대부분 영영 안 적고, 그러면 추천이 읽을 값이
 * 안 쌓인다. 다만 꼭 적게 하지는 않는다. 안 적은 날은 아무것도 바꾸지 않는다(안 적은 것과 '보통'은 다르다).
 *
 * 무엇을 바꾸는지(읽는 곳: lib/report/prescription.ts · theme.ts · auto-setup.ts · lib/armcare/routine.ts):
 *   근육통 '많이'  가장 센 운동만 뺀다(자동 맞춤은 시간도 한 단계, 파워 향상은 고르지 않는다)
 *   근육통 '심함'  회복·재생 데이 + 무게 드는 운동 제외 + 암케어 회복 루틴
 *   짧은 밤        가장 센 운동만 뺀다. 며칠 이어지면 자동 맞춤이 컨디셔닝으로(원래 있던 규칙)
 * 새 신호는 '더 가볍게'만 한다 — 통증 · 부하 규칙을 풀어 주지 못한다.
 */

/** 전신 근육통 1~5 — 팔 피로와 같은 보기. 클수록 심하다 */
export const SORENESS_LEVELS = ['없음', '조금', '보통', '많이', '심함'] as const;
/**
 * '많이'부터 운동을 가볍게 한다. '보통'(3)은 넘긴다 — 훈련한 다음 날의 정상 반응이라
 * 그것까지 줄이면 매일 줄어든다(팔 피로의 HIGH_ARM_FATIGUE 와 같은 눈금 · 같은 뜻).
 */
export const HIGH_SORENESS = 4;
/** '심함' — 그날은 회복 위주. 가만히 쉬는 것보다 가볍게 움직이는 편이 낫다 */
export const SEVERE_SORENESS = 5;

/** 잔 시간을 고르는 범위(시간) — 30분 단위 */
export const SLEEP_HOURS_MIN = 3;
export const SLEEP_HOURS_MAX = 12;
export const SLEEP_HOURS_STEP = 0.5;
/**
 * 이보다 적게 잤으면 '짧은 밤'. 연구들이 '수면 손실'로 치는 선과 거의 같다(하룻밤 6시간 이하면
 * 다음 날 기술 · 순발력이 먼저 떨어진다). 더 올리면 학생 선수 대부분이 매일 걸린다
 * (국내 고교생 평균이 6시간쯤) — 그래서 나이로 가르지 않고 하나로 둔다.
 */
export const SHORT_SLEEP_HOURS = 6;
/** 이만큼 잤으면 '충분'(성인 권고의 아래쪽) */
export const ENOUGH_SLEEP_HOURS = 7;

/** 30분 단위 · 고르는 범위 안으로 맞춘다 */
export function clampSleepHours(n: number) {
  const stepped = Math.round(n / SLEEP_HOURS_STEP) * SLEEP_HOURS_STEP;
  return Math.min(SLEEP_HOURS_MAX, Math.max(SLEEP_HOURS_MIN, stepped));
}

/**
 * 폼에서 온 잔 시간. 비었거나 숫자가 아니면 null(안 적음).
 * 범위 밖이어도 오류를 내지 않고 맞춘다 — 고르는 칸이라 잘못 칠 수 없고, 손도 안 댄 칸 때문에
 * 체크인 저장이 막히면 안 된다(예전에 0~16 으로 적은 기록이 돌아올 수도 있다).
 */
export function parseSleepHours(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? clampSleepHours(n) : null;
}

/** 잔 시간 → 잔 느낌. 화면이 시간을 고르면 충분/보통/부족을 따라 골라 준다 */
export function sleepLevelFromHours(hours: number): (typeof SLEEP_LEVELS)[number] {
  if (hours >= ENOUGH_SLEEP_HOURS) return '충분';
  return hours >= SHORT_SLEEP_HOURS ? '보통' : '부족';
}

/**
 * 짧은 밤인가 — 느낌이 '부족'이거나, 잔 시간이 6시간 미만.
 *
 * 둘 중 하나면 된다(시간은 '부족'을 더할 수만 있고 뺄 수는 없다). 시간을 안 적은 날은 느낌만 본다.
 * '최근 7일 중 잠이 부족한 날'(facts.condition.poorSleepDays)과 오늘의 판정이 이 함수 하나를 쓴다.
 */
export function isShortSleep(c: { sleep: string; sleepHours?: number | null }) {
  return (
    c.sleep === '부족' || (c.sleepHours != null && c.sleepHours < SHORT_SLEEP_HOURS)
  );
}

/** '6.5시간' — '6시간 30분'으로 풀어 적지 않는다(화면 · 기록 어디서나 같은 모양) */
export function formatSleepHours(hours: number) {
  return `${hours}시간`;
}

/** 근육통 숫자 → 말. 범위 밖이면 null */
export function sorenessWord(n: number | null | undefined): string | null {
  return n != null && Number.isInteger(n) ? (SORENESS_LEVELS[n - 1] ?? null) : null;
}

/* ─────────────────────── 식사 (간편 쪽 선택 칸, 2026-10-07) ─────────────────────── */

/*
 * 영양 조언(lib/nutrition/advice.ts — 홈 카드 · 영양 탭 맨 위)이 읽는 두 칸. 음식을 하나하나 적지 않아도 오늘 몇 g 더
 * 먹을지 · 균형 점수를 어림하려고 둔다(사용자 2026-10-07: "체크인에서 간단하게 식사를 잘 했는지, 부족했는지, 아침을
 * 걸렀는지"). 둘 다 안 적어도 된다 — 안 적은 날은 조언이 '모름'으로 본다(안 적은 것과 '보통'은 다르다). 음식을 적은 끼니가
 * 있으면 조언은 기록을 먼저 믿는다. 트레이닝 추천은 읽지 않는다.
 *
 * '끼니 양'은 2026-09-30 에 화면에서 뺀 DailyCheckin.nutrition 칸을 되살린 것(옛 값 '잘 먹음 · 보통 · 부족' 그대로).
 * '많이 먹음'은 두지 않는다 — 성장기에게 '덜 먹어라'를 하지 않는 규칙과 같은 까닭(많이 먹은 날은 음식 기록으로 안다).
 */
export const MEAL_AMOUNTS = ['잘 먹음', '보통', '부족'] as const;
export type MealAmount = (typeof MEAL_AMOUNTS)[number];
/** 걸를 수 있는 끼니 — 간식은 거르는 것이 아니다 */
export const SKIPPABLE_MEALS = [
  { key: 'breakfast', label: '아침' },
  { key: 'lunch', label: '점심' },
  { key: 'dinner', label: '저녁' },
] as const;
export type SkippableMeal = (typeof SKIPPABLE_MEALS)[number]['key'];

export type CheckinBody = {
  /** 어젯밤 잔 시간(시간, 0.5 단위). 안 적었으면 null */
  sleepHours: number | null;
  /** 전신 근육통 1~5. 안 적었으면 null */
  soreness: number | null;
  /** 끼니 양(DailyCheckin.nutrition). 안 적었으면 null */
  nutrition: MealAmount | null;
  /** 걸른 끼니(DailyCheckin.skippedMeals). 안 적었으면 [] */
  skippedMeals: SkippableMeal[];
};

const isMealAmount = (v: unknown): v is MealAmount =>
  typeof v === 'string' && (MEAL_AMOUNTS as readonly string[]).includes(v);
const isSkippable = (v: unknown): v is SkippableMeal =>
  typeof v === 'string' && SKIPPABLE_MEALS.some((m) => m.key === v);

/**
 * 폼에서 온 네 칸 — 어느 것도 오류를 내지 않는다(목록 · 범위 밖은 안 적은 것으로).
 * 걸른 끼니는 여러 개라 getAll 로 받는다(옛 호출처럼 안 넘기면 빈 것으로).
 */
export function parseCheckinBody(
  get: (name: string) => string,
  getAll: (name: string) => string[] = () => []
): CheckinBody {
  const s = Number(get('soreness'));
  const amount = get('mealAmount').trim();
  const skipped = [...new Set(getAll('skippedMeals').map((v) => v.trim()))].filter(
    isSkippable
  );
  return {
    sleepHours: parseSleepHours(get('sleepHours')),
    soreness: Number.isInteger(s) && s >= 1 && s <= SORENESS_LEVELS.length ? s : null,
    nutrition: isMealAmount(amount) ? amount : null,
    skippedMeals: skipped,
  };
}

/** DB 행에서 네 칸만 뽑는다. 예전 기록처럼 비어 있으면 null · []. 목록 밖 값(옛 자료)은 안 적은 것으로 */
export function pickCheckinBody(row: {
  sleepHours?: number | null;
  soreness?: number | null;
  nutrition?: string | null;
  skippedMeals?: string[] | null;
}): CheckinBody {
  return {
    sleepHours: row.sleepHours ?? null,
    soreness: row.soreness ?? null,
    nutrition: isMealAmount(row.nutrition) ? row.nutrition : null,
    skippedMeals: (row.skippedMeals ?? []).filter(isSkippable),
  };
}

/** 요약 한 칸 — '부족 · 아침 걸름' · '잘 먹음' · '점심 · 저녁 걸름'. 둘 다 안 적었으면 null */
export function mealSummary(
  amount: string | null | undefined,
  skipped: readonly string[] | null | undefined
): string | null {
  const names = SKIPPABLE_MEALS.filter((m) => skipped?.includes(m.key)).map(
    (m) => m.label
  );
  const parts = [
    ...(isMealAmount(amount) ? [amount] : []),
    ...(names.length > 0 ? [`${names.join(' · ')} 걸름`] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : null;
}

/* ─────────────────────── 팔 통증 — 아픈 자리 · 정도 ─────────────────────── */

/*
 * 팔 통증 안내(2026-10-03, 재활 1편). 어깨 · 팔꿈치를 '통증'으로 고른 날만 그 줄 밑에 두 줄이 더 열린다 —
 * '어디가 아파요?'(그 관절의 자리 넷, 여러 개)와 '얼마나 아파요?'(셋 중 하나). 둘 다 안 골라도 저장된다.
 *
 * 읽는 곳: 암케어(lib/armcare/routine.ts 의 decideArmcare — 정도 1 + 자리 있음 + 만 15세 이상이면 '통증 루틴',
 * 그 밖은 지금처럼 쉬기)와 안내 시트(app/(app)/training/arm-pain-guide.tsx). 자리 값은 암케어 부위 키
 * (lib/armcare/anatomy.ts)라 부위의 흔한 부상 · 증상을 그대로 꺼내 쓴다.
 *
 * 정도를 안 고른 날은 쉬는 쪽으로 본다 — 모르면 보수적으로. 트레이닝 일정 · 투구 계획은 이 두 칸을 읽지 않는다
 * (통증이면 지금처럼 관절 단위로 피하고 멈춘다).
 */

/** 정도 셋 — 클수록 심하다. 저장은 숫자(1~3) */
export const ARM_PAIN_LEVELS = [
  { value: 1, label: '던질 때만' },
  { value: 2, label: '평소 움직일 때도' },
  { value: 3, label: '가만히 있어도 · 밤에도' },
] as const;

/**
 * 관절마다 고를 수 있는 자리 — 부위별 보강의 여덟 부위 그대로, 이름만 쉬운 말로.
 *   chip   그 관절 줄 밑의 칩 글('안쪽')
 *   label  안내 시트 · 암케어 까닭에 쓰는 이름('팔꿈치 안쪽')
 * 부위 이름('팔꿈치 내측')을 그대로 쓰지 않는다 — 아픈 곳을 짚는 자리라 몸에서 바로 찾을 말이 낫다.
 */
export const ARM_PAIN_SPOTS = {
  shoulder: [
    { key: 'shoulder-back', chip: '뒤쪽', label: '어깨 뒤쪽' },
    { key: 'shoulder-front', chip: '앞쪽', label: '어깨 앞쪽' },
    { key: 'shoulder-top', chip: '위쪽', label: '어깨 위쪽' },
    { key: 'scapula', chip: '날개뼈', label: '날개뼈(견갑)' },
  ],
  elbow: [
    { key: 'elbow-inner', chip: '안쪽', label: '팔꿈치 안쪽' },
    { key: 'elbow-outer', chip: '바깥쪽', label: '팔꿈치 바깥쪽' },
    { key: 'elbow-back', chip: '뒤쪽', label: '팔꿈치 뒤쪽' },
    { key: 'elbow-front', chip: '앞쪽', label: '팔꿈치 앞쪽' },
  ],
} as const satisfies Record<
  'shoulder' | 'elbow',
  readonly { key: ArmcareAreaKey; chip: string; label: string }[]
>;

export type ArmPainJoint = keyof typeof ARM_PAIN_SPOTS;

/**
 * 이 나이(만) 밑이면 통증 루틴을 주지 않고 진료만 권한다 — 성장판 부상이 섞여 있어 운동으로 다룰 일이
 * 아니다. 투구 계획이 성장기로 보는 선(lib/report/plan.ts 의 YOUTH_AGE_THRESHOLD)과 같다.
 */
export const ARM_PAIN_ROUTINE_MIN_AGE = 15;

export type ArmPain = {
  /** 아픈 자리 — '통증'인 관절의 자리만, ARM_PAIN_SPOTS 차례로 */
  armPainSpots: ArmcareAreaKey[];
  /** 정도 1~3. 안 골랐으면 null */
  armPainLevel: number | null;
};

const ARM_PAIN_SPOT_LIST = [...ARM_PAIN_SPOTS.shoulder, ...ARM_PAIN_SPOTS.elbow];

/** '팔꿈치 안쪽' — 모르는 값이면 null */
export function armPainSpotLabel(key: string): string | null {
  return ARM_PAIN_SPOT_LIST.find((s) => s.key === key)?.label ?? null;
}

/** '던질 때만' — 1~3 밖이면 null */
export function armPainLevelLabel(level: number | null | undefined): string | null {
  return ARM_PAIN_LEVELS.find((l) => l.value === level)?.label ?? null;
}

/** 정도는 1~3 정수만 — 그 밖(빈 값 · 글자 · 소수)은 안 고른 것 */
function pickArmPainLevel(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= ARM_PAIN_LEVELS.length ? n : null;
}

/**
 * 오늘 '통증'인 관절의 자리만 남긴다. 목록에 없는 값 · 겹친 값은 버리고, 차례는 ARM_PAIN_SPOTS(어깨 → 팔꿈치).
 *
 * 저장할 때(parseArmPain)와 읽을 때(lib/armcare/today.ts) 같은 규칙이다. 읽을 때도 거르는 것은, 이 칸을
 * 모르는 옛 화면으로 팔꿈치를 '정상'으로 고쳐 저장하면 자리 칸은 그대로 남기 때문이다.
 */
export function armPainSpotsFor(
  parts: { shoulder?: string; elbow?: string } | null | undefined,
  raw: readonly string[]
): ArmcareAreaKey[] {
  const picked = new Set(raw.map((s) => s.trim()));
  const out: ArmcareAreaKey[] = [];
  for (const joint of ['shoulder', 'elbow'] as const) {
    if (parts?.[joint] !== '통증') continue;
    for (const spot of ARM_PAIN_SPOTS[joint]) {
      if (picked.has(spot.key)) out.push(spot.key);
    }
  }
  return out;
}

/**
 * 폼에서 온 두 칸 — 오류를 내지 않는다(목록 · 범위 밖은 안 고른 것으로). 체크박스라 값이 여럿이어서
 * 한 이름의 값을 모두 받는다(getAll).
 *
 * 어깨 · 팔꿈치 둘 다 '통증'이 아니면 빈 값이다 — 어제 고른 자리가 오늘 저장에 남지 않게 지운다.
 */
export function parseArmPain(
  getAll: (name: string) => string[],
  parts: { shoulder?: string; elbow?: string }
): ArmPain {
  if (parts.shoulder !== '통증' && parts.elbow !== '통증') {
    return { armPainSpots: [], armPainLevel: null };
  }
  return {
    armPainSpots: armPainSpotsFor(parts, getAll('armPainSpots')),
    armPainLevel: pickArmPainLevel(getAll('armPainLevel')[0] ?? ''),
  };
}

/** DB 행에서 두 칸만 뽑는다. 칸이 생기기 전의 기록처럼 비어 있으면 [] · null */
export function pickArmPain(row: {
  armPainSpots?: readonly string[] | null;
  armPainLevel?: number | null;
}): ArmPain {
  const known = new Set(row.armPainSpots ?? []);
  return {
    armPainSpots: ARM_PAIN_SPOT_LIST.filter((s) => known.has(s.key)).map((s) => s.key),
    armPainLevel: pickArmPainLevel(row.armPainLevel ?? ''),
  };
}

/**
 * 오늘 통증 루틴을 해도 되는가 — 자리를 하나 이상 골랐고, 정도가 1(던질 때만)이고, 나이를 알면 만 15세 이상.
 *
 * 암케어의 결정(decideArmcare)과 안내 시트의 '오늘은'이 이 함수 하나를 본다. 둘이 따로 따지면 시트는
 * '가벼운 루틴을 해요'라는데 암케어 탭은 쉬라고 하는 날이 생긴다. 나이를 모르면 막지 않는다(대상이 고등학생
 * 이상이고, 생년월일은 안 적어도 되는 칸이다).
 */
export function canDoPainRoutine({
  spots,
  level,
  age,
}: {
  spots: readonly string[];
  level: number | null;
  age: number | null;
}): boolean {
  return (
    spots.length > 0 && level === 1 && (age == null || age >= ARM_PAIN_ROUTINE_MIN_AGE)
  );
}

/* ─────────────────────────── 상세 체크인 ─────────────────────────── */

/*
 * 간편 체크인은 위의 몸 상태·컨디션·수면(과 선택 칸인 근육통 · 잔 시간)만 받는다. 매일 쓰는 것이라
 * 몇 초 안에 끝나야 한다 — 길어지면 건너뛰기만 누르게 된다.
 *
 * 상세는 더 적고 싶은 날에만 채운다. 전부 고르지 않아도 되고, 비어 있으면 그날은
 * 안 적은 것이다(0 이나 '보통'으로 채우지 않는다 — 안 적은 것과 보통인 것은 다르다).
 *
 * 무엇을 묻는지: **앱이 실제로 쓰는 것만.** 팔 피로(암케어 루틴이 본다), 몸무게(영양 목표 ·
 * 홈 그래프), 식욕 · 던지는 일정(영양 가이드), 그리고 메모.
 *
 * 2026-09-30 에 뺐다(사용자: "사용하지 않는 굳이 필요없는 건 빼줘") — 전신 피로 · 스트레스 · 기분 ·
 * 아침 심박 · 수분 · 식사. 어느 계산도 읽지 않고 홈 달력에 보이기만 하던 칸들이다(먹은 것은 영양 탭이
 * 끼니별로 받는다). 잔 시간 · 근육통도 같이 뺐다가 같은 날 되살렸다 — 트레이닝 추천이 읽게 연결해서
 * (위 구간). DB 칸(DailyCheckin 의 fatigue · stress · mood · restingHr · hydration · nutrition)과 그동안
 * 적은 값은 그대로 있다 — 여기서 읽지도 쓰지도 않을 뿐이라, 저장해도 예전 값이 지워지지 않는다.
 * 다시 쓰려면 아래 목록과 폼(components/checkin-form.tsx)에 칸을 되살리면 된다.
 */

/**
 * 1~5 로 고르는 것들.
 *
 * 보기를 말로 적는다. 숫자만 있으면 3이 좋은 건지 나쁜 건지 매번 헷갈린다.
 * 클수록 그 느낌이 강하다.
 */
export const DETAIL_SCALES = [
  {
    key: 'armFatigue',
    label: '팔 피로',
    options: ['없음', '조금', '보통', '많이', '심함'],
  },
] as const;

export type DetailScaleKey = (typeof DETAIL_SCALES)[number]['key'];

/*
 * 영양 가이드에 쓰는 두 칸(2026-09-30 사용자: "영양 가이드에 필요한 정보가 있다면 체크인에도").
 *
 * 식욕은 1~5, 클수록 입맛이 돈다(다른 척도처럼 '클수록 그 느낌이 강하다'). 입맛이 없는
 * 날은 한 번에 많이보다 적게 자주 — 증량 중인 선수에게 특히 중요하다.
 *
 * 던지는 일정은 탄수화물을 언제 늘릴지 정한다. 투구 기록은 던진 뒤에야 생겨서, 등판
 * 전날 저녁 · 당일 아침에 챙길 것을 미리 알려면 여기서 받아야 한다.
 */
export const APPETITE_LEVELS = ['거의 없음', '적음', '보통', '좋음', '왕성'] as const;

/**
 * 컨디션(1~10)이 이 값 이하면 '낮은 날' — 매일 운동 계획은 회복 테마(lib/report/theme.ts), 안전 거름은 무게 드는 운동을
 * 뺌(lib/report/prescription.ts), 암케어는 회복 루틴(lib/armcare/routine.ts), 프로그램은 조정(lib/program/load.ts).
 * 2026-10-09 전에는 세 파일에 4 가 따로 적혀 있었다 — 한 곳만 바꾸면 셋이 어긋난다.
 */
export const LOW_CONDITION_THRESHOLD = 4;
export const THROW_PLANS = ['오늘 등판', '오늘 불펜', '내일 등판', '없음'] as const;

export const CHECKIN_NOTE_MAX = 500;
/* 몸무게 범위는 내 정보의 몸무게와 같다 */
export const CHECKIN_WEIGHT_MIN_KG = 20;
export const CHECKIN_WEIGHT_MAX_KG = 200;

export type CheckinDetail = Record<DetailScaleKey, number | null> & {
  bodyWeightKg: number | null;
  appetite: number | null;
  throwPlan: string | null;
  note: string | null;
};

/** 상세 칸이 하나라도 채워졌는가 — 창을 열 때 상세 쪽을 펼쳐 둘지 정한다 */
export function hasDetail(d: Partial<CheckinDetail>) {
  return (
    DETAIL_SCALES.some((s) => d[s.key] != null) ||
    d.bodyWeightKg != null ||
    d.appetite != null ||
    d.throwPlan != null ||
    Boolean(d.note)
  );
}

/**
 * 폼에서 온 상세 값을 정리한다.
 *
 * 비어 있으면 null. 고르는 칸(척도 · 식욕 · 던지는 일정)에 목록에 없는 값이 오면 안 고른
 * 것으로 본다 — 화면에서는 나올 수 없는 값이고, 그것 때문에 체크인 전체를 막을
 * 일이 아니다. 숫자는 범위를 벗어나면 알려 준다. 사람이 직접 친 값이라 잘못 친
 * 것일 수 있다.
 */
export function parseCheckinDetail(
  get: (name: string) => string
): { error: string } | { value: CheckinDetail } {
  const scales = {} as Record<DetailScaleKey, number | null>;
  for (const s of DETAIL_SCALES) {
    const n = Number(get(s.key));
    scales[s.key] = Number.isInteger(n) && n >= 1 && n <= s.options.length ? n : null;
  }

  const num = (name: string) => {
    const raw = get(name).trim();
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  const bodyWeightKg = num('bodyWeightKg');
  if (
    bodyWeightKg !== null &&
    (Number.isNaN(bodyWeightKg) ||
      bodyWeightKg < CHECKIN_WEIGHT_MIN_KG ||
      bodyWeightKg > CHECKIN_WEIGHT_MAX_KG)
  ) {
    return { error: '몸무게를 다시 확인해주세요.' };
  }

  const pickFrom = (list: readonly string[], raw: string) =>
    list.includes(raw.trim()) ? raw.trim() : null;

  const appetiteNum = Number(get('appetite'));
  const appetite =
    Number.isInteger(appetiteNum) &&
    appetiteNum >= 1 &&
    appetiteNum <= APPETITE_LEVELS.length
      ? appetiteNum
      : null;

  const note = get('note').trim();
  if (note.length > CHECKIN_NOTE_MAX) {
    return { error: `메모는 ${CHECKIN_NOTE_MAX}자까지 적을 수 있어요.` };
  }

  return {
    value: {
      ...scales,
      bodyWeightKg: bodyWeightKg === null ? null : Math.round(bodyWeightKg * 10) / 10,
      appetite,
      throwPlan: pickFrom(THROW_PLANS, get('throwPlan')),
      note: note || null,
    },
  };
}

/**
 * DB 행에서 상세 값만 뽑는다. 화면(체크인 창·관문)으로 넘길 때 쓴다.
 * 예전 기록처럼 칸이 비어 있으면 null — 안 적은 것이다.
 */
export function pickCheckinDetail(row: Partial<CheckinDetail>): CheckinDetail {
  return {
    armFatigue: row.armFatigue ?? null,
    bodyWeightKg: row.bodyWeightKg ?? null,
    appetite: row.appetite ?? null,
    throwPlan: row.throwPlan ?? null,
    note: row.note ?? null,
  };
}
