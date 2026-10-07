import { intensityLevel } from '@/lib/exercise-meta';
import { canDo } from '@/lib/report/equipment';
import { filterByLevel } from '@/lib/report/personalize';
import { withJosa } from '@/lib/korean';

/**
 * 근력 · 파워 프로그램 — 정의 · 시작 자격 · 운동 고정 · 오늘 판정 · 일차 넘기기. 순수 함수만(DB 를 모른다).
 *
 * 설계: docs/designs/pitcher-strength-power-programs.md (2 숫자표 · 3 고정 · 4~6 안전 · 던지는 일정 · 간격 · 9 진행 · 13 화면).
 * 재활(lib/armcare/rehab.ts)처럼 코드 상수 + 순수 함수로 두고, DB 와 화면은 이것을 읽기만 한다.
 * 무게 추천은 따로 둔다(lib/program/next-weight.ts).
 *
 *   첫 프로그램 '비시즌 근력 → 파워': 주 3번 × 8주 = 24회. 1~4주 근력, 5~8주 파워, 4 · 8주는 가볍게.
 *   날마다 다섯 칸(파워 · 큰 하체 · 밀기 또는 당기기 · 한쪽 하체 · 몸통), 고정하는 운동은 칸 × 변형 9개(U6).
 *
 * 화면 글은 해요체 · 줄표 없이(HANDOFF 2026-10-04).
 */

/** 기능 전체의 스위치 — 끄면 트레이닝 화면의 입구 · 카드가 사라진다. 진행 중이던 줄은 그대로 남는다. */
export const PROGRAMS_ENABLED = true;

/* ─────────────────────────────── 이름들 ─────────────────────────────── */

export type ProgramKey = 'offseason-strength-power';
export type SlotKind = 'power' | 'bigLower' | 'pushPull' | 'singleLeg' | 'core';
/** 고정하는 단위(U6) — 칸 × 변형 */
export type VariantKey =
  | 'squat'
  | 'hinge'
  | 'push'
  | 'pull'
  | 'singleLeg'
  | 'jump'
  | 'medball'
  | 'antiRotation'
  | 'rotationalThrow';

export const VARIANT_KEYS: readonly VariantKey[] = [
  'squat',
  'hinge',
  'push',
  'pull',
  'singleLeg',
  'jump',
  'medball',
  'antiRotation',
  'rotationalThrow',
];

export const VARIANT_LABELS: Record<VariantKey, string> = {
  squat: '큰 하체 A',
  hinge: '큰 하체 B',
  push: '밀기',
  pull: '당기기',
  singleLeg: '한쪽 하체',
  jump: '파워 점프',
  medball: '파워 메디신볼',
  antiRotation: '몸통 (1~4주)',
  rotationalThrow: '몸통 (5~8주)',
};

/** 무게 추천이 있는 칸 — '몇 개 더?'도 여기서만 묻는다(§13-7) */
export const WEIGHTED_SLOTS: readonly SlotKind[] = [
  'bigLower',
  'pushPull',
  'singleLeg',
];

export const DAYS_PER_WEEK = 3;
export const TOTAL_WEEKS = 8;
export const TOTAL_DAYS = DAYS_PER_WEEK * TOTAL_WEEKS;
export const LIGHT_WEEKS: readonly number[] = [4, 8];

export type ProgramMeta = {
  key: ProgramKey;
  name: string;
  /** 카드 부제 — '8주'로 약속하지 않는다(§13-15). 경기로 밀리면 늘어난다. */
  subtitle: string;
  /** 시작에 꼭 있어야 하는 장비(§1). 트랩바는 '바벨'에 들어간다(§13-21). */
  requiredEquipment: readonly string[];
};

export const FIRST_PROGRAM: ProgramMeta = {
  key: 'offseason-strength-power',
  name: '비시즌 근력 → 파워',
  subtitle: `${TOTAL_DAYS}회 · 주 ${DAYS_PER_WEEK}번 · 보통 8~10주`,
  requiredEquipment: ['바벨', '덤벨', '메디신볼'],
};

/** 이 앱이 아는 프로그램 — 지금은 하나. 시즌 중 · 성장기는 '곧 열려요' 한 줄로만 보인다. */
export function programMeta(key: string): ProgramMeta | null {
  return key === FIRST_PROGRAM.key ? FIRST_PROGRAM : null;
}

/* ───────────────────────────── 숫자표(§2) ───────────────────────────── */

type WeekRx = {
  sets: number;
  reps: number;
  /** 목표 여유 횟수(T) — 정수. 파워 · 몸통은 없다(null). 7주 '여유1~2'는 1(U1.1). */
  reserve: number | null;
};

const rx = (sets: number, reps: number, reserve: number | null = null): WeekRx => ({
  sets,
  reps,
  reserve,
});

/** 칸 × 주(1~8) — 설계 2의 표 그대로. 바꾸면 근거 문서와 셀프테스트를 같이 고친다. */
const WEEK_TABLE: Record<SlotKind, readonly WeekRx[]> = {
  power: [
    rx(3, 3),
    rx(3, 3),
    rx(3, 3),
    rx(2, 3),
    rx(4, 3),
    rx(4, 3),
    rx(4, 3),
    rx(2, 3),
  ],
  bigLower: [
    rx(3, 8, 3),
    rx(4, 6, 2),
    rx(4, 5, 2),
    rx(2, 5, 4),
    rx(4, 4, 2),
    rx(4, 3, 2),
    rx(5, 3, 1),
    rx(2, 3, 4),
  ],
  pushPull: [
    rx(3, 10, 3),
    rx(3, 8, 2),
    rx(4, 6, 2),
    rx(2, 8, 4),
    rx(3, 5, 2),
    rx(3, 5, 2),
    rx(4, 4, 2),
    rx(2, 5, 4),
  ],
  singleLeg: [
    rx(3, 8, 3),
    rx(3, 8, 2),
    rx(3, 6, 2),
    rx(2, 6, 4),
    rx(3, 5, 2),
    rx(3, 5, 2),
    rx(3, 5, 2),
    rx(2, 5, 4),
  ],
  core: [
    rx(3, 10),
    rx(3, 10),
    rx(3, 10),
    rx(2, 10),
    rx(3, 5),
    rx(3, 5),
    rx(3, 5),
    rx(2, 5),
  ],
};

/** 세트 사이 쉬는 시간(초) — 파워는 '충분히 쉬고', 큰 운동은 길게 */
const REST_SECONDS: Record<SlotKind, number> = {
  power: 120,
  bigLower: 180,
  pushPull: 120,
  singleLeg: 90,
  core: 60,
};

export function weekOfDay(day: number): number {
  return Math.min(TOTAL_WEEKS, Math.max(1, Math.ceil(day / DAYS_PER_WEEK)));
}

export function isLightWeek(week: number): boolean {
  return LIGHT_WEEKS.includes(week);
}

/** 1~4주 근력 블록, 5~8주 파워 블록 */
export function isPowerBlock(week: number): boolean {
  return week >= 5;
}

export type SlotRx = WeekRx & {
  slot: SlotKind;
  variant: VariantKey;
  week: number;
  light: boolean;
  restSeconds: number;
};

/** 칸 하나의 그 주 처방 — 운동 중 [교체]도 이 값을 쓴다(U3) */
export function slotPrescription(
  slot: SlotKind,
  variant: VariantKey,
  week: number
): SlotRx {
  const w = WEEK_TABLE[slot][Math.min(TOTAL_WEEKS, Math.max(1, week)) - 1];
  return {
    ...w,
    slot,
    variant,
    week,
    light: isLightWeek(week),
    restSeconds: REST_SECONDS[slot],
  };
}

/**
 * 세트 기록 화면의 처방 한 줄(§13-3) — '4세트 × 5회 · 2개 남기고'.
 * 가벼운 주는 '가볍게 · 4개 남기고', 파워는 '최대 속도 · 충분히 쉬고'.
 */
export function prescriptionLine(rxs: SlotRx, perSide = false): string {
  const side = perSide ? ' (좌우 각각)' : '';
  const base = `${rxs.sets}세트 × ${rxs.reps}회${side}`;
  if (rxs.slot === 'power') return `${base} · 최대 속도 · 충분히 쉬고`;
  if (rxs.reserve == null) return base;
  return rxs.light
    ? `${base} · 가볍게 · ${rxs.reserve}개 남기고`
    : `${base} · ${rxs.reserve}개 남기고`;
}

/* ─────────────────────────── 하루 만들기 ─────────────────────────── */

/**
 * 그날의 다섯 칸과 변형.
 *
 * 큰 하체는 A(스쿼트) · B(힌지)를 날마다 번갈아, 밀기 · 당기기도 번갈아(A 날 밀기, B 날 당기기).
 * 파워는 날마다 하나 — A 날 점프, B 날 메디신볼(§13-24). 몸통은 1~4주 항회전, 5~8주 회전 던지기.
 */
export function dayVariants(day: number): Record<SlotKind, VariantKey> {
  const a = day % 2 === 1;
  const week = weekOfDay(day);
  return {
    power: a ? 'jump' : 'medball',
    bigLower: a ? 'squat' : 'hinge',
    pushPull: a ? 'push' : 'pull',
    singleLeg: 'singleLeg',
    core: isPowerBlock(week) ? 'rotationalThrow' : 'antiRotation',
  };
}

/**
 * 그날 하는 차례.
 *
 * 1~4주 · 8주는 파워가 맨 앞(오늘 정한 차례 규칙, lib/report/exercise-order.ts 와 같다).
 * 5~7주는 대비 훈련 — 큰 하체 바로 뒤에 파워를 짝으로 붙인다(이때만 '파워 먼저'를 넘는다).
 */
export function daySlotOrder(day: number): SlotKind[] {
  const week = weekOfDay(day);
  const contrast = isPowerBlock(week) && !isLightWeek(week);
  return contrast
    ? ['bigLower', 'power', 'pushPull', 'singleLeg', 'core']
    : ['power', 'bigLower', 'pushPull', 'singleLeg', 'core'];
}

/** 대비 짝인가 — 화면에 '바로 이어서 · 큰 하체 뒤 2~3분 쉬고'를 붙인다 */
export function isContrastPower(day: number): boolean {
  const week = weekOfDay(day);
  return isPowerBlock(week) && !isLightWeek(week);
}

export function dayLabel(day: number): string {
  const week = weekOfDay(day);
  const inWeek = ((day - 1) % DAYS_PER_WEEK) + 1;
  return `${week}주차 · ${inWeek}일차`;
}

/* ─────────────────────────── 시작 자격(§1) ─────────────────────────── */

export type ProgramSeason = 'off' | 'pre';
export type SeasonAnswer = ProgramSeason | 'in' | 'rehab';

export const PROGRAM_MIN_AGE = 18;

export type EligibilityInput = {
  /** 만 나이. 생년월일이 없으면 null */
  age: number | null;
  /** 경력 이름(입문 · 초급 · 중급 · 상급). 안 골랐으면 null */
  trainingLevel: string | null;
  /** 시작 화면에서 고른 시즌. 아직이면 null */
  season: SeasonAnswer | null;
  /** 가진 장비. 비어 있으면 아직 안 고른 것(§13-21 — '모두'로 보지 않는다) */
  ownedEquipment: readonly string[];
};

export type EligibilityStep = 'birth' | 'level' | 'season' | 'equipment';

export type Eligibility =
  | { ok: true }
  /** 시작 흐름에서 마저 받으면 되는 것 */
  | { ok: false; kind: 'ask'; step: EligibilityStep; message: string }
  /** 이 프로그램은 안 되는 사람 — 까닭 한 줄 + 할 일 하나 */
  | { ok: false; kind: 'blocked'; reason: string; action: string };

/**
 * 시작할 수 있는가. 묻는 차례는 시작 시트의 차례(§13-12)와 같다 — 생년월일 · 경력 · 시즌 · 장비.
 * 고르기 카드는 프로필로 이미 아는 막힘만 보고(나이 · 경력), 나머지는 시트에서 받는다.
 */
export function checkEligibility(
  input: EligibilityInput,
  meta = FIRST_PROGRAM
): Eligibility {
  if (input.age == null) {
    return { ok: false, kind: 'ask', step: 'birth', message: '생년월일을 알려 주세요' };
  }
  if (input.age < PROGRAM_MIN_AGE) {
    return {
      ok: false,
      kind: 'blocked',
      reason: '이 프로그램은 만 18세부터 해요.',
      action: '직접 고르기의 가벼운 운동으로 자세부터 익혀요.',
    };
  }
  if (input.trainingLevel == null) {
    return {
      ok: false,
      kind: 'ask',
      step: 'level',
      message: '운동 경력을 골라 주세요',
    };
  }
  if (input.trainingLevel === '입문') {
    return {
      ok: false,
      kind: 'blocked',
      reason: '웨이트를 6개월 넘게 한 사람에게 맞춘 프로그램이에요.',
      action: '직접 고르기로 기본 동작을 먼저 익혀요.',
    };
  }
  if (input.season == null) {
    return {
      ok: false,
      kind: 'ask',
      step: 'season',
      message: '지금 시즌을 골라 주세요',
    };
  }
  if (input.season === 'in') {
    return {
      ok: false,
      kind: 'blocked',
      reason: '시즌 중 유지 프로그램은 곧 열려요.',
      action: '지금은 자동 맞춤으로 가볍게 이어 가요.',
    };
  }
  if (input.season === 'rehab') {
    return {
      ok: false,
      kind: 'blocked',
      reason: '재활 중에는 재활을 먼저 해요.',
      action: '암케어의 재활 카드에서 이어 가요.',
    };
  }
  const missing = missingEquipment(input.ownedEquipment, meta);
  if (input.ownedEquipment.length === 0) {
    return {
      ok: false,
      kind: 'ask',
      step: 'equipment',
      message: '가진 장비를 골라 주세요',
    };
  }
  if (missing.length > 0) {
    return {
      ok: false,
      kind: 'blocked',
      reason: `${withJosa(missing.join(', '), '이/가')} 있어야 할 수 있어요.`,
      action: '장비가 생기면 다시 시작해요.',
    };
  }
  return { ok: true };
}

export function missingEquipment(
  owned: readonly string[],
  meta = FIRST_PROGRAM
): string[] {
  const has = new Set(owned);
  return meta.requiredEquipment.filter((e) => !has.has(e));
}

/* ─────────────────────────── 운동 고정(§3 · U6) ─────────────────────────── */

export type PinnableExercise = {
  id: string;
  title: string;
  category: string;
  movementPattern: string | null;
  equipment: string[];
  intensity: string;
  difficulty: string | null;
  perSide: boolean;
};

/*
 * 몸통 칸은 라이브러리에 동작 계열이 없다(코어는 movementPattern 이 비어 있다). 그래서 이름으로 고른다.
 * 항회전 = 돌아가지 않게 버티기, 회전 던지기 = 메디신볼로 돌려 던지기(없으면 돌리는 코어로 대신).
 */
const ANTI_ROTATION_WORDS = ['팔로프', '안티 로테이션', '찹', '리프트'];
/* 밴드 · 케이블이 없는 사람의 대신 — 한쪽으로 들고 걷기(돌아가지 않게 버틴다) · 플랭크 계열 */
const ANTI_ROTATION_FALLBACK_WORDS = ['캐리', '사이드 플랭크', '버드독', '데드버그'];
const ROTATION_WORDS = ['로테이션', '트위스트', '회전'];

const BARBELL_FIRST = (ex: PinnableExercise) => (ex.equipment.includes('바벨') ? 0 : 1);

type VariantRule = {
  /** 후보인가 */
  match: (ex: PinnableExercise) => boolean;
  /** 앞에 올수록 먼저 고른다(작을수록 앞) */
  rank: (ex: PinnableExercise) => number[];
};

const isWeighted = (ex: PinnableExercise) =>
  ex.equipment.some((e) => ['바벨', '덤벨', '케틀벨', '원판', '케이블'].includes(e));

const VARIANT_RULES: Record<VariantKey, VariantRule> = {
  /* 큰 하체는 두 발로, 무게를 들고, 강도 '높음' 이상 — 바벨을 먼저 */
  squat: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '스쿼트' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    rank: (ex) => [BARBELL_FIRST(ex)],
  },
  hinge: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '힌지' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    /* 데드리프트 · RDL 이 큰 힌지다 — 힙 쓰러스트는 보조라 뒤로 */
    rank: (ex) => [/데드리프트|RDL/.test(ex.title) ? 0 : 1, BARBELL_FIRST(ex)],
  },
  push: {
    match: (ex) =>
      ex.category === '상체 스트렝스' &&
      ex.movementPattern === '밀기' &&
      !ex.perSide &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 4,
    rank: (ex) => [BARBELL_FIRST(ex)],
  },
  /* 당기기는 무거운 것이 적어 '중간'까지 받는다. 덤벨 · 바벨 로우를 철봉보다 먼저(무게 흐름을 보려고) */
  pull: {
    match: (ex) =>
      ex.category === '상체 스트렝스' &&
      ex.movementPattern === '당기기' &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 3,
    rank: (ex) => [ex.perSide ? 1 : 0, -intensityLevel(ex.intensity)],
  },
  singleLeg: {
    match: (ex) =>
      ex.category === '하체 스트렝스' &&
      ex.movementPattern === '런지' &&
      isWeighted(ex) &&
      intensityLevel(ex.intensity) >= 3,
    /* 스플릿 스쿼트 · 리버스 런지가 무게를 올려 가기 좋은 한쪽 하체다 */
    rank: (ex) => [
      /스플릿 스쿼트|리버스 런지/.test(ex.title) ? 0 : 1,
      ex.equipment.includes('덤벨') ? 0 : 1,
      -intensityLevel(ex.intensity),
    ],
  },
  /* 파워 점프는 맨몸 · 박스로 뛰는 것 — 두 발 점프를 먼저 */
  jump: {
    match: (ex) =>
      ex.category === '파워' &&
      (ex.movementPattern === '스쿼트' || ex.movementPattern === '런지') &&
      ex.equipment.every((e) => e === '맨몸' || e === '박스'),
    rank: (ex) => [ex.perSide ? 1 : 0, ex.title.includes('점프') ? 0 : 1],
  },
  medball: {
    match: (ex) => ex.category === '파워' && ex.equipment.includes('메디신볼'),
    /* 던지기(밀기 · 당기기 계열)를 먼저, 회전은 5~8주 몸통 칸이 쓰므로 뒤로, 뛰며 던지는 것은 맨 뒤 */
    rank: (ex) => [
      ex.movementPattern === '밀기' || ex.movementPattern === '당기기'
        ? 0
        : ex.movementPattern === '회전'
          ? 1
          : 2,
    ],
  },
  antiRotation: {
    match: (ex) =>
      ex.category === '코어' &&
      [...ANTI_ROTATION_WORDS, ...ANTI_ROTATION_FALLBACK_WORDS].some((w) =>
        ex.title.includes(w)
      ),
    rank: (ex) => [
      ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w)) ? 0 : 1,
      ex.title.includes('팔로프') ? 0 : ex.title.includes('캐리') ? 1 : 2,
    ],
  },
  /* 회전 던지기 — 메디신볼을 먼저, 없으면 돌리는 코어 */
  rotationalThrow: {
    match: (ex) =>
      (ex.category === '파워' &&
        ex.equipment.includes('메디신볼') &&
        ex.movementPattern === '회전') ||
      (ex.category === '코어' &&
        ROTATION_WORDS.some((w) => ex.title.includes(w)) &&
        !ANTI_ROTATION_WORDS.some((w) => ex.title.includes(w))),
    rank: (ex) => [ex.category === '파워' ? 0 : 1],
  },
};

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 한 변형의 후보 — 가진 장비로 할 수 있고, 경력에 맞는 것을 고를 차례대로.
 * 시작 시트의 '바꾸기'와 '고정 운동 바꾸기'(§13-17)가 이 목록을 보여 준다.
 * 그날 몸 상태 규칙은 쓰지 않는다(§3 — 고정은 장비 · 경력만으로).
 */
export function variantCandidates<T extends PinnableExercise>(
  variant: VariantKey,
  library: readonly T[],
  owned: readonly string[],
  trainingLevel: string | null
): T[] {
  const ownedSet = new Set(owned);
  const rule = VARIANT_RULES[variant];
  const usable = library.filter((ex) => rule.match(ex) && canDo(ex, ownedSet));
  const leveled = filterByLevel(usable, trainingLevel).pool;
  /* filterByLevel 이 경력 순으로 세운 것을 지키며, 같은 경력 안에서 변형 규칙의 차례로 */
  const levelRank = new Map(leveled.map((ex, i) => [ex.id, i]));
  return [...leveled].sort(
    (a, b) =>
      compareRank(rule.rank(a), rule.rank(b)) ||
      (levelRank.get(a.id) ?? 0) - (levelRank.get(b.id) ?? 0)
  );
}

export type Pinned = Partial<Record<VariantKey, string>>;

/** 시작할 때 9개를 고른다. 후보가 없는 변형은 비워 둔다 — 그 칸은 그날 대체 규칙으로 간다. */
export function pickPinned<T extends PinnableExercise>(
  library: readonly T[],
  owned: readonly string[],
  trainingLevel: string | null,
  keep: Pinned = {}
): Pinned {
  const out: Pinned = {};
  for (const v of VARIANT_KEYS) {
    const candidates = variantCandidates(v, library, owned, trainingLevel);
    const kept = keep[v];
    if (kept && candidates.some((c) => c.id === kept)) {
      out[v] = kept;
      continue;
    }
    if (candidates[0]) out[v] = candidates[0].id;
  }
  return out;
}

/** 저장된 pinned 를 읽는다(Json). 모르는 키 · 문자열이 아닌 값은 버린다. */
export function readPinned(value: unknown): Pinned {
  if (!value || typeof value !== 'object') return {};
  const out: Pinned = {};
  for (const v of VARIANT_KEYS) {
    const id = (value as Record<string, unknown>)[v];
    if (typeof id === 'string' && id) out[v] = id;
  }
  return out;
}

/* ─────────────────────────── 오늘 판정(§4~6 · §13) ─────────────────────────── */

/** 회복 데이로 바뀐 까닭(지금 규칙의 이름을 이 모양으로 옮겨 받는다) */
export type RecoveryReason = 'loadRisk' | 'soreSevere' | 'lowCondition';

export type TodaySignals = {
  /** 다음에 할 일차(1~24, 25면 다 끝남) */
  nextDay: number;
  /** 오늘 · 마지막 프로그램 세션 날짜 'YYYY-MM-DD' */
  today: string;
  lastProgramDate: string | null;
  /** 오늘 체크인이 있는가 — 없으면 일정을 만들지 않는다(지금 규칙) */
  checkedIn: boolean;
  /** 오늘 다른 방식(자동 맞춤 · 직접 고르기)으로 이미 운동을 시작했는가 */
  otherWorkoutStarted: boolean;
  /** 오늘 통증으로 운동이 멈췄는가(halted) */
  halted: boolean;
  /** 던지는 일정 */
  gameToday: boolean;
  gameTomorrow: boolean;
  gameYesterday: boolean;
  bullpenToday: boolean;
  /** 세게 던진 불펜 · 라이브(강도 9~10 · 30구+) 당일 또는 다음 날 */
  hardThrowRecent: boolean;
  /** 경기 때문에 쉬는 날을 '그래도 오늘 할래요'로 넘겼는가(D24) */
  override: boolean;
  /** 안전 신호 */
  recovery: RecoveryReason | null;
  loadCaution: boolean;
  soreMany: boolean;
  sleepShort: boolean;
  /** 부하 지수 모름 · 메모 통증 확인 전 · 상하체 함께 통증(D22) */
  uncertain: boolean;
  /** 특정 부위 통증 · 뻐근 · 재활 관절로 그날 대체할 칸 */
  painSlots: readonly SlotKind[];
};

export type RestReason = 'gameToday' | 'gameTomorrow' | 'gameYesterday';

export type CautionCode =
  | 'gameOverride'
  | 'recovery'
  | 'hardThrow'
  | 'uncertain'
  | 'lighter'
  | 'restGap'
  | 'lightWeek';

export type SlotAdjust =
  /** 그날 칸을 뺀다 */
  | { kind: 'drop'; reason: string }
  /** 추천 −10% · 세트 −1 (D19) */
  | { kind: 'lighter' }
  /** 같은 칸 · 같은 계열로 그날 대체(§3 (a)) */
  | { kind: 'substitute'; reason: string };

export type TodayDecision =
  | { kind: 'done' }
  | { kind: 'needCheckin'; day: number }
  | { kind: 'painWait'; day: number }
  | { kind: 'otherMode'; day: number }
  | { kind: 'spacing'; day: number }
  | { kind: 'rest'; day: number; reason: RestReason; canOverride: true }
  | {
      kind: 'go';
      day: number;
      week: number;
      caution: CautionCode | null;
      adjust: Partial<Record<SlotKind, SlotAdjust>>;
      /** 마지막 프로그램 세션 뒤 쉰 날 수(무게 추천의 '쉰 기간'에 쓴다) */
      gapDays: number | null;
    };

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00.000Z`);
  const b = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 오늘 프로그램 날인가, 무엇을 바꾸는가.
 *
 * 프로그램은 스스로 진행한다(D22). 기다리는 것은 통증 멈춤 · 경기 앞뒤(넘길 수 있음) · 어제 프로그램 날뿐이고,
 * 나머지 나쁜 날은 진행하되 주의 한 줄과 칸 조정으로 알린다(§4 · §5 · §6).
 */
export function decideToday(s: TodaySignals): TodayDecision {
  const day = s.nextDay;
  if (day > TOTAL_DAYS) return { kind: 'done' };
  if (s.halted) return { kind: 'painWait', day };
  if (!s.checkedIn) return { kind: 'needCheckin', day };
  if (s.otherWorkoutStarted) return { kind: 'otherMode', day };

  const gapDays = s.lastProgramDate ? daysBetween(s.lastProgramDate, s.today) : null;
  /* 프로그램 날은 하루 한 번, 어제가 프로그램 날이면 오늘은 아님(§6). 오늘 이미 했으면 여기 오지 않는다. */
  if (gapDays === 1) return { kind: 'spacing', day };

  const restReason: RestReason | null = s.gameToday
    ? 'gameToday'
    : s.gameTomorrow
      ? 'gameTomorrow'
      : s.gameYesterday
        ? 'gameYesterday'
        : null;
  if (restReason && !s.override) {
    return { kind: 'rest', day, reason: restReason, canOverride: true };
  }

  const week = weekOfDay(day);
  const variants = dayVariants(day);
  const adjust: Partial<Record<SlotKind, SlotAdjust>> = {};

  /* 칸 조정 — 회복 데이(컨디션 4 이하)는 큰 하체 · 파워를 가볍게(D19 · D25) */
  if (s.recovery === 'lowCondition') {
    adjust.bigLower = { kind: 'lighter' };
    adjust.power = { kind: 'lighter' };
  }
  /* 근육통 '많이' · 잠 부족 — 가장 센 칸(큰 하체)만 가볍게 */
  if (s.soreMany || s.sleepShort) adjust.bigLower = { kind: 'lighter' };
  /* 부하 '주의' — 파워 칸을 뺀다 */
  if (s.loadCaution) adjust.power = { kind: 'drop', reason: '부하 주의' };
  /* 불펜 날 — 회전 던지기 칸을 뺀다 */
  if (s.bullpenToday && variants.core === 'rotationalThrow') {
    adjust.core = { kind: 'drop', reason: '오늘 불펜' };
  }
  /* 부위 통증 — 그 칸은 그날 대체(없으면 화면이 '오늘 뺌'으로) */
  for (const slot of s.painSlots) {
    if (adjust[slot]?.kind !== 'drop')
      adjust[slot] = { kind: 'substitute', reason: '통증 부위' };
  }

  return {
    kind: 'go',
    day,
    week,
    caution: pickCaution(s, week, gapDays),
    adjust,
    gapDays,
  };
}

/**
 * 맨 위 주의는 한 줄만 — 우선순위(§13-6). 칸에만 해당하는 것은 줄 표시로 간다.
 * 경기 날 넘김 > 회복 데이 > 센 불펜 · 라이브 > 부하 모름 · 통증 확인 전 > 부하 주의 · 근육통 · 잠 > 오래 쉼 > 가벼운 주.
 */
export function pickCaution(
  s: TodaySignals,
  week: number,
  gapDays: number | null
): CautionCode | null {
  if (s.override && (s.gameToday || s.gameTomorrow || s.gameYesterday))
    return 'gameOverride';
  if (s.recovery) return 'recovery';
  if (s.hardThrowRecent) return 'hardThrow';
  if (s.uncertain) return 'uncertain';
  if (s.loadCaution || s.soreMany || s.sleepShort) return 'lighter';
  if (gapDays != null && gapDays >= 8) return 'restGap';
  if (isLightWeek(week)) return 'lightWeek';
  return null;
}

/** 주의 한 줄 문구 — 해요체, 줄표 없이 */
export const CAUTION_TEXT: Record<CautionCode, string> = {
  gameOverride: '경기 날이에요. 가볍게 하고, 아프면 바로 멈춰요.',
  recovery: '몸이 지쳐 있어요. 무리하지 말고 천천히 해요.',
  hardThrow: '최근에 많이 던졌어요. 무리하지 마요.',
  uncertain: '오늘 상태를 다 알지 못해요. 조심해서 해요.',
  lighter: '오늘은 조금 가볍게 했어요.',
  restGap: '오래 쉬었어요. 무게를 낮춰 다시 시작해요.',
  lightWeek: '가벼운 주예요. 무게가 낮은 게 맞아요.',
};

export const REST_TEXT: Record<RestReason, string> = {
  gameToday: '경기 날이에요',
  gameTomorrow: '내일 경기예요',
  gameYesterday: '경기 다음 날이에요',
};

/* ─────────────────────────── 일차 넘기기(§9 · U2 · U4) ─────────────────────────── */

export type SessionProgramTag = { key: string; day: number; week: number };

/** 얼린 목록의 program 을 읽는다. 모양이 아니면 null(프로그램 아닌 날) */
export function readSessionProgram(value: unknown): SessionProgramTag | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<SessionProgramTag>;
  if (
    typeof v.key !== 'string' ||
    !Number.isInteger(v.day) ||
    !Number.isInteger(v.week)
  ) {
    return null;
  }
  return { key: v.key, day: v.day as number, week: v.week as number };
}

/** 다음 일차로 가려면 처방 세트의 절반(올림) 이상 */
export function setsNeeded(plannedTotal: number): number {
  return Math.ceil(plannedTotal / 2);
}

export type AdvanceInput = {
  /** 세션 얼린 목록의 program(없으면 프로그램 아닌 날) */
  program: SessionProgramTag | null;
  /** 진행 중인 프로그램의 nextDay. 진행 중이 아니면 null */
  nextDay: number | null;
  /** programSlot 이 있는 운동들의 처방 세트 합 */
  plannedSets: number;
  /** 그 운동들에 남긴 세트 수(대체 운동 세트 포함) */
  loggedSets: number;
};

/**
 * 이 세션으로 일차를 넘기는가. 넘기는 쓰기는 'nextDay = program.day 일 때만 +1'(조건부 한 번 쓰기, U2)이라
 * [종료] · 저절로 닫기 · 늦은 세트(U4) 세 곳에서 불러도 한 번만 넘어간다.
 */
export function shouldAdvance(a: AdvanceInput): boolean {
  if (!a.program || a.nextDay == null) return false;
  if (a.program.day !== a.nextDay) return false;
  if (a.plannedSets <= 0) return false;
  return a.loggedSets >= setsNeeded(a.plannedSets);
}

/* ─────────────────────────── 진행 · 끝(§13-13 · 15) ─────────────────────────── */

export function progressLine(completed: number, skipped: number): string {
  return `완료 ${completed} · 건너뜀 ${skipped} / ${TOTAL_DAYS}`;
}

/**
 * 끝내기 창의 한 줄(§13-9) — '16세트 중 7세트. 8세트를 하면 다음 일차로 가요'.
 * 넘었으면 '2일차를 마쳐요'.
 */
export function finishLine(
  day: number,
  plannedSets: number,
  loggedSets: number
): string {
  const need = setsNeeded(plannedSets);
  if (loggedSets >= need) return `${day}일차를 마쳐요`;
  return `${plannedSets}세트 중 ${loggedSets}세트. ${need}세트를 하면 다음 일차로 가요`;
}

/** 준비 세트 한 줄(§13-8) — 바벨 큰 운동만. 빈 봉 20kg 에서 60% · 80% 를 2.5kg 단위로. */
export function warmupLine(targetKg: number | null, unit = 2.5): string | null {
  if (targetKg == null || targetKg < 40) return null;
  const round = (kg: number) => Math.round(kg / unit) * unit;
  const steps = [
    { kg: 20, reps: 8 },
    { kg: round(targetKg * 0.6), reps: 5 },
    { kg: round(targetKg * 0.8), reps: 3 },
  ].filter((s, i, all) => i === 0 || (s.kg > all[i - 1].kg && s.kg < targetKg));
  const text = steps
    .map((s, i) => (i === 0 ? `빈 봉×${s.reps}` : `${formatKg(s.kg)}×${s.reps}`))
    .join(' → ');
  return `${text} · 적지 않아도 돼요`;
}

function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}
