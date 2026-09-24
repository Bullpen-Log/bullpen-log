/**
 * 몸상태 체크인의 선택지와 검사.
 *
 * 체크인은 운동 처방과 리포트의 입력이 된다. 특히 '통증'은
 * 모든 운동 추천을 중단시키는 안전장치의 1차 관문이므로,
 * 여기 값을 바꿀 때는 통증 판정 로직(hasPain)도 함께 봐야 한다.
 */

import { toDateKey } from '@/lib/pitch-stats';

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

/* ─────────────────────────── 상세 체크인 ─────────────────────────── */

/*
 * 간편 체크인은 위의 몸 상태·컨디션·수면만 받는다. 매일 쓰는 것이라 몇 초 안에
 * 끝나야 한다 — 길어지면 건너뛰기만 누르게 된다.
 *
 * 상세는 더 적고 싶은 날에만 채운다. 전부 고르지 않아도 되고, 비어 있으면 그날은
 * 안 적은 것이다(0 이나 '보통'으로 채우지 않는다 — 안 적은 것과 보통인 것은 다르다).
 *
 * 무엇을 묻는지: 운동선수 컨디션 점검에서 흔히 쓰는 것(피로·근육통·스트레스·기분·
 * 수면)에, 투수라서 따로 봐야 하는 팔 피로, 그리고 숫자로 남겨야 흐름이 보이는 것
 * (잔 시간·몸무게·아침 심박)과 먹고 마신 것을 더했다.
 */

/**
 * 1~5 로 고르는 것들.
 *
 * 보기를 말로 적는다. 숫자만 있으면 3이 좋은 건지 나쁜 건지 매번 헷갈린다.
 * 피로·근육통·스트레스는 클수록 그 느낌이 강하고, 기분만 클수록 좋다.
 */
export const DETAIL_SCALES = [
  {
    key: 'fatigue',
    label: '전신 피로',
    options: ['없음', '조금', '보통', '많이', '심함'],
  },
  {
    key: 'armFatigue',
    label: '팔 피로',
    options: ['없음', '조금', '보통', '많이', '심함'],
  },
  {
    key: 'soreness',
    label: '근육통',
    options: ['없음', '조금', '보통', '많이', '심함'],
  },
  {
    key: 'stress',
    label: '스트레스',
    options: ['없음', '조금', '보통', '많이', '심함'],
  },
  {
    key: 'mood',
    label: '기분',
    options: ['나쁨', '별로', '보통', '좋음', '아주 좋음'],
  },
] as const;

export type DetailScaleKey = (typeof DETAIL_SCALES)[number]['key'];

export const HYDRATION_LEVELS = ['충분', '보통', '부족'] as const;
export const NUTRITION_LEVELS = ['잘 먹음', '보통', '부족'] as const;

export const SLEEP_HOURS_MAX = 16;
export const RESTING_HR_MIN = 30;
export const RESTING_HR_MAX = 150;
export const CHECKIN_NOTE_MAX = 500;
/* 몸무게 범위는 내 정보의 몸무게와 같다 */
export const CHECKIN_WEIGHT_MIN_KG = 20;
export const CHECKIN_WEIGHT_MAX_KG = 200;

export type CheckinDetail = Record<DetailScaleKey, number | null> & {
  sleepHours: number | null;
  bodyWeightKg: number | null;
  restingHr: number | null;
  hydration: string | null;
  nutrition: string | null;
  note: string | null;
};

/** 상세 칸이 하나라도 채워졌는가 — 창을 열 때 상세 쪽을 펼쳐 둘지 정한다 */
export function hasDetail(d: Partial<CheckinDetail>) {
  return (
    DETAIL_SCALES.some((s) => d[s.key] != null) ||
    d.sleepHours != null ||
    d.bodyWeightKg != null ||
    d.restingHr != null ||
    d.hydration != null ||
    d.nutrition != null ||
    Boolean(d.note)
  );
}

/**
 * 폼에서 온 상세 값을 정리한다.
 *
 * 비어 있으면 null. 고르는 칸(척도·수분·식사)에 목록에 없는 값이 오면 안 고른
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

  const sleepHours = num('sleepHours');
  if (
    sleepHours !== null &&
    (Number.isNaN(sleepHours) || sleepHours < 0 || sleepHours > SLEEP_HOURS_MAX)
  ) {
    return { error: `잔 시간은 0~${SLEEP_HOURS_MAX}시간 사이로 적어주세요.` };
  }

  const bodyWeightKg = num('bodyWeightKg');
  if (
    bodyWeightKg !== null &&
    (Number.isNaN(bodyWeightKg) ||
      bodyWeightKg < CHECKIN_WEIGHT_MIN_KG ||
      bodyWeightKg > CHECKIN_WEIGHT_MAX_KG)
  ) {
    return { error: '몸무게를 다시 확인해주세요.' };
  }

  const restingHr = num('restingHr');
  if (
    restingHr !== null &&
    (Number.isNaN(restingHr) ||
      !Number.isInteger(restingHr) ||
      restingHr < RESTING_HR_MIN ||
      restingHr > RESTING_HR_MAX)
  ) {
    return {
      error: `아침 심박은 ${RESTING_HR_MIN}~${RESTING_HR_MAX} 사이의 정수로 적어주세요.`,
    };
  }

  const pickFrom = (list: readonly string[], raw: string) =>
    list.includes(raw.trim()) ? raw.trim() : null;

  const note = get('note').trim();
  if (note.length > CHECKIN_NOTE_MAX) {
    return { error: `메모는 ${CHECKIN_NOTE_MAX}자까지 적을 수 있습니다.` };
  }

  return {
    value: {
      ...scales,
      /* 0.5 시간 단위로 맞춘다 — 7.3 시간 같은 값은 기록으로서 뜻이 없다 */
      sleepHours: sleepHours === null ? null : Math.round(sleepHours * 2) / 2,
      bodyWeightKg: bodyWeightKg === null ? null : Math.round(bodyWeightKg * 10) / 10,
      restingHr,
      hydration: pickFrom(HYDRATION_LEVELS, get('hydration')),
      nutrition: pickFrom(NUTRITION_LEVELS, get('nutrition')),
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
    sleepHours: row.sleepHours ?? null,
    fatigue: row.fatigue ?? null,
    armFatigue: row.armFatigue ?? null,
    soreness: row.soreness ?? null,
    stress: row.stress ?? null,
    mood: row.mood ?? null,
    bodyWeightKg: row.bodyWeightKg ?? null,
    restingHr: row.restingHr ?? null,
    hydration: row.hydration ?? null,
    nutrition: row.nutrition ?? null,
    note: row.note ?? null,
  };
}
