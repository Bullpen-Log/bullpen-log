import { ARMCARE_CATEGORY, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { ARM_PAIN_ROUTINE_MIN_AGE } from '@/lib/checkin';
import { intensityLevel, minutesForSets } from '@/lib/exercise-meta';
import { canDo } from '@/lib/report/equipment';
import { withJosa } from '@/lib/korean';
import {
  areaLabel,
  type MoveSpec,
  REHAB_AREAS,
  REHAB_REGIONS,
  type RehabFeel,
  type RehabLeftover,
  type RehabMove,
  type RehabResult,
  type RehabSeverity,
  type RehabStage,
} from '@/lib/armcare/rehab-regions';
import { type RehabProgramLike } from '@/lib/armcare/rehab-progress';

/** 재활 규칙 — 병명 · 정도와 기간 · 단계별 운동 · 오늘 세션 짜기 · 세션 판정. 밖에서는 입구 '@/lib/armcare/rehab' 로 가져다 쓴다. */

/* ─────────────────────────────── 병명 6개 ─────────────────────────────── */

export type RehabConditionKey =
  | 'impingement'
  | 'cuff-tendinopathy'
  | 'slap'
  | 'ucl'
  | 'flexor-pronator'
  | 'posterior-impingement';

type ConditionSpec = {
  label: string;
  /** 바탕 부위 */
  area: ArmcareAreaKey;
  /** 1 · 2단계 허용 통증 — 없으면 바탕 부위의 것 */
  earlyPainLimit?: 2 | 3;
  /** 투구 복귀표까지 바닥(일) — 정도의 기간과 이것 중 긴 쪽, 앞당기기로 줄이지 않는다 */
  floorDays?: number;
  /** 정도가 이보다 가벼울 수 없다 — UCL 은 '보통 계획 이상'(가벼운 캐치볼도 하지 않는다) */
  minSeverity?: RehabSeverity;
  add?: Partial<Record<RehabStage, readonly MoveSpec[]>>;
  remove?: Partial<Record<RehabStage, readonly string[]>>;
  /** 바탕 부위의 피할 것에 더한다 */
  avoid?: readonly string[];
  /** 카드에 붙는 한 줄 */
  lines: readonly string[];
};

/** 병명별 차이(설계 5-2 · 가이드라인 4절) */
export const REHAB_CONDITIONS: Record<RehabConditionKey, ConditionSpec> = {
  impingement: { label: '어깨 충돌증후군', area: 'shoulder-top', lines: [] },
  'cuff-tendinopathy': {
    label: '회전근개 건염',
    area: 'shoulder-top',
    earlyPainLimit: 3,
    add: { 2: [['시티드 외회전 과부하 내리기', '가볍게']] },
    lines: [],
  },
  slap: {
    label: '관절와순 손상(SLAP)',
    area: 'shoulder-front',
    earlyPainLimit: 2,
    floorDays: 56,
    /* 1 · 2단계에 90/90 끝 범위 빼기 — 1단계에는 그런 운동이 없고, 2단계의 프론 로우 + 외회전이 그 자세다 */
    remove: { 2: ['프론 로우 + 외회전'] },
    add: {
      2: ['크로스바디 스트레칭'],
      3: [['밴드 하이 이두컬', '가볍게']],
    },
    avoid: ['팔을 끝까지 뒤로 젖히는 자세(90/90 끝, 1 · 2단계)'],
    lines: [
      '투수가 수술 없이 복귀한 경우는 약 40%예요. 나아지지 않으면 의사와 다시 상의하세요.',
    ],
  },
  ucl: {
    label: 'UCL 부분 손상',
    area: 'elbow-inner',
    earlyPainLimit: 2,
    floorDays: 42,
    minSeverity: 'moderate',
    lines: ['끝쪽(원위) · 고등급 파열이라고 들었다면 의사와 상의하세요.'],
  },
  'flexor-pronator': {
    label: '굴곡-회내근 손상',
    area: 'elbow-inner',
    earlyPainLimit: 3,
    floorDays: 14,
    lines: ['1년 안에 UCL 수술까지 간 투수가 19%라는 보고가 있어요.'],
  },
  'posterior-impingement': {
    label: '팔꿈치 후방 충돌',
    area: 'elbow-back',
    floorDays: 14,
    lines: [
      '18세 미만이면 피로골절이 아닌지 확인하세요(X-ray).',
      '걸려서 안 움직이거나 뼛조각이 걸리는 느낌이면 진료를 받으세요.',
    ],
  },
};

export const REHAB_CONDITION_KEYS = Object.keys(
  REHAB_CONDITIONS
) as RehabConditionKey[];

export function isRehabCondition(value: unknown): value is RehabConditionKey {
  return (
    typeof value === 'string' &&
    (REHAB_CONDITION_KEYS as readonly string[]).includes(value)
  );
}

/** 고른 부위에 맞는 병명 — 진단 칩(팔꿈치 안쪽 → UCL 부분 손상 · 굴곡-회내근 손상) */
export function conditionsFor(area: ArmcareAreaKey): RehabConditionKey[] {
  return REHAB_CONDITION_KEYS.filter((k) => REHAB_CONDITIONS[k].area === area);
}

/** 카드 제목 — 병명이 있으면 병명, 없으면 부위 */
export function rehabTitle(area: ArmcareAreaKey, condition: RehabConditionKey | null) {
  return condition ? REHAB_CONDITIONS[condition].label : areaLabel(area);
}

/* ─────────────────────────────── 정도 · 기간 ─────────────────────────────── */

export const SEVERITY_RANK: Record<RehabSeverity, number> = {
  mild: 0,
  moderate: 1,
  severe: 2,
};
export const SEVERITY_BY_RANK: readonly RehabSeverity[] = [
  'mild',
  'moderate',
  'severe',
];

/**
 * 정도 — 1편의 세 질문과 '지난 일주일 가장 아팠을 때'(0~10) 중 더 심한 쪽(가이드라인 3절).
 *   가벼움  던질 때만 · 3 이하
 *   보통    평소 움직일 때도 · 4~6
 *   심함    가만히 있어도 · 밤에도 · 7 이상
 * 병명이 정한 바닥보다 가볍지 않다(UCL 은 보통 이상).
 */
export function rehabSeverity({
  level,
  worst,
  condition = null,
}: {
  /** 1편의 정도 1~3 */
  level: 1 | 2 | 3;
  /** 지난 일주일 가장 아팠을 때 0~10 */
  worst: number;
  condition?: RehabConditionKey | null;
}): RehabSeverity {
  const byWorst = worst <= 3 ? 0 : worst <= 6 ? 1 : 2;
  const min = condition ? REHAB_CONDITIONS[condition].minSeverity : undefined;
  const rank = Math.max(level - 1, byWorst, min ? SEVERITY_RANK[min] : 0);
  return SEVERITY_BY_RANK[rank];
}

/** 병명의 바닥까지 올린 정도 — 진단을 나중에 붙일 때(UCL 이면 가벼움 → 보통) */
export function atLeastConditionSeverity(
  severity: RehabSeverity,
  condition: RehabConditionKey | null
): RehabSeverity {
  const min = condition ? REHAB_CONDITIONS[condition].minSeverity : undefined;
  return min && SEVERITY_RANK[min] > SEVERITY_RANK[severity] ? min : severity;
}

/** 시작 단계 — 예민도가 높으면 1, 중간이면 2, 낮으면 3단계부터(HSS 지침) */
export function startStage(severity: RehabSeverity): RehabStage {
  return severity === 'severe' ? 1 : severity === 'moderate' ? 2 : 3;
}

/**
 * 단계별 최소 기간(일) — 2026-10-04 사용자 "너무 보수적"으로 다시 맞춘 표(가이드라인 3절).
 * 0 은 '–'(그 정도는 그 단계부터 시작하지 않는다 — 낮춰서 내려왔을 때는 기간 없이 조건만 본다).
 */
export const STAGE_DAYS: Record<
  RehabSeverity,
  readonly [number, number, number, number]
> = {
  mild: [0, 0, 3, 4],
  moderate: [0, 7, 5, 5],
  severe: [7, 10, 7, 7],
};

/**
 * 단계를 올리는 데 필요한 깨끗한(초록) 세션 수 — 그 단계의 최소 기간 안에 할 수 있는 만큼(1단계 매일, 2~4단계 하루 걸러), 2~5번.
 *
 * 2026-10-04 고침: 처음 설계는 1단계 5 · 2단계 6 · 3단계 6 이었는데, 하루 걸러 하면 6번에 11일이 걸려 정도별 기간 표
 * (가벼움 3단계 3일 · 보통 2단계 7일)와 어긋났다 — '가벼움 약 1주'가 실제로는 3주 넘게 걸렸다. 기간이 시간을, 이 수가
 * 그 기간 동안 꾸준히 했는지를 본다. 최소 기간이 0 인 단계(그 정도는 이 단계부터 시작하지 않는다 — 낮춰 내려왔을 때)는 3번.
 */
export function cleanSessionsNeeded(
  program: Pick<
    RehabProgramLike,
    'severity' | 'condition' | 'stage' | 'stageShortenDays'
  >
): number {
  const days = stageMinDays(program);
  if (days === 0) return 3;
  const possible = program.stage === 1 ? days : Math.ceil(days / 2);
  return Math.min(5, Math.max(2, possible));
}

/** 병명 바닥(일) — 없으면 0 */
export function conditionFloorDays(condition: RehabConditionKey | null): number {
  return condition ? (REHAB_CONDITIONS[condition].floorDays ?? 0) : 0;
}

/**
 * 병명 바닥을 단계마다 나눈 몫. 정도의 기간 합(T)이 바닥(F)보다 짧으면 모자란 만큼을 단계 기간의 비율대로 나눠
 * 더한다 — 마지막 단계에 몰아 두면 UCL 인데 12일째부터 한 팔 공 던지기를 하게 된다. 누적으로 올림해 합이 정확히 F.
 */
function floorShare(
  severity: RehabSeverity,
  condition: RehabConditionKey | null,
  stage: RehabStage
): number {
  const floor = conditionFloorDays(condition);
  const days = STAGE_DAYS[severity];
  const total = days.reduce((a, b) => a + b, 0);
  if (floor <= total || total === 0) return 0;
  const before = days.slice(0, stage - 1).reduce((a, b) => a + b, 0);
  const upTo = before + days[stage - 1];
  return Math.ceil((floor * upTo) / total) - Math.ceil((floor * before) / total);
}

/**
 * 이 단계의 최소 기간(일) — 정도의 기간에서 앞당긴 날을 빼고(그 기간의 절반까지만), 병명 바닥의 몫과 견줘 긴 쪽.
 * 병명 바닥은 앞당기기로 줄지 않는다(가이드라인 10절).
 */
export function stageMinDays({
  severity,
  condition,
  stage,
  stageShortenDays = 0,
}: {
  severity: RehabSeverity;
  condition: RehabConditionKey | null;
  stage: RehabStage;
  stageShortenDays?: number;
}): number {
  const base = STAGE_DAYS[severity][stage - 1];
  const shorten = Math.min(
    Math.max(0, Math.floor(stageShortenDays)),
    Math.floor(base / 2)
  );
  return Math.max(base - shorten, floorShare(severity, condition, stage));
}

/** 시작부터 투구 복귀표까지 대략(일) — 정도의 기간 합과 병명 바닥 중 긴 쪽 */
export function rehabEstimateDays(
  severity: RehabSeverity,
  condition: RehabConditionKey | null
): number {
  const total = STAGE_DAYS[severity].reduce((a, b) => a + b, 0);
  return Math.max(total, conditionFloorDays(condition));
}

/** '약 2.5주' — 반 주 단위 */
export function weeksText(days: number): string {
  const weeks = Math.max(0.5, Math.round((days / 7) * 2) / 2);
  return `약 ${weeks}주`;
}

/* ─────────────────────────────── 시작 막기 ─────────────────────────────── */

/** 이 나이(만) 밑이면 18세 미만 성장기 규칙 */
export const REHAB_YOUTH_AGE = 18;

/**
 * 재활을 열지 않는 까닭 — 열어도 되면 null. 나이를 모르면 연다(1편과 같다 — 생년월일은 안 적어도 되는 칸이다).
 *   만 15세 미만                                  성장판 — 진료가 먼저
 *   18세 미만 + 팔꿈치 바깥쪽/뒤쪽 + 진단 없음     X-ray 먼저(연골 · 피로골절)
 */
export function rehabStartBlock({
  age,
  area,
  condition,
}: {
  age: number | null;
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
}): { kind: 'young' | 'xray'; text: string } | null {
  if (age != null && age < ARM_PAIN_ROUTINE_MIN_AGE) {
    return {
      kind: 'young',
      text: `만 ${ARM_PAIN_ROUTINE_MIN_AGE}세 미만은 재활 프로그램을 열지 않아요. 성장판이 다쳤을 수 있어 진료가 먼저예요.`,
    };
  }
  if (
    age != null &&
    age < REHAB_YOUTH_AGE &&
    REHAB_REGIONS[area].youthNeedsDiagnosis &&
    !condition
  ) {
    return {
      kind: 'xray',
      text: `18세 미만이 ${withJosa(areaLabel(area), '이/가')} 아프면 X-ray 를 먼저 찍어 보세요. 연골 · 피로골절일 수 있어요. 진단을 받으면 병명으로 시작할 수 있어요.`,
    };
  }
  return null;
}

/* ─────────────────────────────── 단계별 운동 ─────────────────────────────── */

const toMove = (spec: MoveSpec): RehabMove =>
  typeof spec === 'string' ? { name: spec } : { name: spec[0], note: spec[1] };

/** 이 단계의 운동 — 바탕 부위에 병명의 차이(빼기 → 더하기)를 얹는다 */
export function stageExercises(
  area: ArmcareAreaKey,
  condition: RehabConditionKey | null,
  stage: RehabStage
): RehabMove[] {
  const base = REHAB_REGIONS[area].stages[stage - 1].map(toMove);
  const c = condition ? REHAB_CONDITIONS[condition] : null;
  if (!c) return base;
  const remove = c.remove?.[stage] ?? [];
  const kept = base.filter((m) => !remove.includes(m.name));
  for (const spec of c.add?.[stage] ?? []) {
    const move = toMove(spec);
    const at = kept.findIndex((m) => m.name === move.name);
    if (at >= 0) kept[at] = move.note ? move : kept[at];
    else kept.push(move);
  }
  return kept;
}

/** 피할 것 — 부위 + 병명 */
export function rehabAvoid(area: ArmcareAreaKey, condition: RehabConditionKey | null) {
  return [
    ...REHAB_REGIONS[area].avoid,
    ...(condition ? (REHAB_CONDITIONS[condition].avoid ?? []) : []),
  ];
}

/** 카드에 붙는 한 줄들 — 부위의 주의 + 병명의 한 줄 */
export function rehabNotes(area: ArmcareAreaKey, condition: RehabConditionKey | null) {
  const note = REHAB_REGIONS[area].note;
  return [
    ...(note ? [note] : []),
    ...(condition ? REHAB_CONDITIONS[condition].lines : []),
  ];
}

/**
 * 한 팔로 하는 플라이오볼 운동 — 플라이오볼이 없으면 두 손 메디신볼 운동으로 바꾼다(설계 5절).
 * 메디신볼(2kg 이상)로 한 팔 던지기를 하면 무거워 오히려 위험하다(lib/exercise-meta.ts 의 '플라이오볼').
 */
export const ONE_ARM_PLYO = [
  '90/90 플라이오볼 벽 드리블',
  '프론 90/90 플라이오볼 드롭',
  '한 팔 90/90 플라이오볼 벽 던지기',
] as const;
export const TWO_HAND_MEDBALL = [
  '톨 닐링 메디신볼 체스트 패스',
  '톨 닐링 메디신볼 오버헤드 던지기',
] as const;

/** 설계에 적힌 운동 이름 전부 — 자가 시험이 라이브러리에 다 있는지 본다 */
export function allRehabExerciseNames(): string[] {
  const names = new Set<string>();
  for (const area of REHAB_AREAS) {
    for (const stage of [1, 2, 3, 4] as const) {
      for (const m of stageExercises(area, null, stage)) names.add(m.name);
    }
  }
  for (const key of REHAB_CONDITION_KEYS) {
    const c = REHAB_CONDITIONS[key];
    for (const stage of [1, 2, 3, 4] as const) {
      for (const m of stageExercises(c.area, key, stage)) names.add(m.name);
    }
  }
  for (const name of TWO_HAND_MEDBALL) names.add(name);
  return [...names];
}

/* ─────────────────────── 운동 기록 중 재활 체크 가려내기 ─────────────────────── */

/** 이 재활의 운동 이름 전부 — 네 단계 + 병명 차이 + 플라이오볼 대신 넣는 두 손 메디신볼 */
export function rehabExerciseNames(
  area: ArmcareAreaKey,
  condition: RehabConditionKey | null
): Set<string> {
  const names = new Set<string>();
  for (const stage of [1, 2, 3, 4] as const) {
    for (const m of stageExercises(area, condition, stage)) names.add(m.name);
  }
  for (const name of TWO_HAND_MEDBALL) names.add(name);
  return names;
}

/** 재활 한 번의 기간(시작한 날 ~ 끝낸 날, 진행 중이면 to null)과 그 재활의 운동 이름 */
export type RehabPeriod = {
  from: string;
  to: string | null;
  names: ReadonlySet<string>;
};

/**
 * 재활 체크로 보이는 운동 기록인가 — 재활 기간 안의, 그 재활의 운동 이름인 기록(UserExerciseLog 에는 어디서 체크했는지
 * 칸이 없어 이름과 날로 가린다). 트레이닝 회전(exerciseSessionsAgo · lastStrengthDates)과 운동 부하가 이것을 뺀다 —
 * 암케어 카테고리처럼(lib/report/gather.ts · lib/training-load.ts). 재활 운동은 카테고리가 여럿이라(모빌리티 크로스바디
 * 스트레칭 · 파워 메디신볼 던지기 · 상체 스트렝스 조트만 컬) 암케어 거름에 안 걸렸다. 그 기간에 같은 날 같은 운동을
 * 트레이닝에서도 했으면 함께 빠진다(기록이 하루 한 줄이라 가를 수 없다 — 재활 중에는 드물다).
 */
export function isRehabCheck(
  title: string,
  dateKey: string,
  periods: readonly RehabPeriod[]
): boolean {
  return periods.some(
    (p) => dateKey >= p.from && (p.to == null || dateKey <= p.to) && p.names.has(title)
  );
}

/* ─────────────────────────────── 오늘 세션 짜기 ─────────────────────────────── */

/** 재활 세션에 쓰는 라이브러리 줄 — 이만큼만 본다 */
export type RehabLibraryExercise = {
  id: string;
  title: string;
  category: string;
  intensity: string;
  equipment: string[];
  targetMuscles: string[];
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  perSide: boolean;
};

export type RehabSessionItem = {
  exerciseId: string;
  title: string;
  sets: number;
  /** 화면에 붙는 한마디('가볍게') */
  note?: string;
  /** 장비가 없어 대신 넣었으면 원래 운동 이름 */
  replaces?: string;
};

export type RehabSession = {
  /** 실제로 고른 운동의 단계 — 한 칸 낮춘 날은 아래 단계 */
  stage: RehabStage;
  lowered: boolean;
  items: RehabSessionItem[];
  /** 바꿔 넣은 것 · 뺀 것 · 세트를 줄인 까닭 — 한 줄씩 */
  notes: string[];
  estimatedMinutes: number;
};

/** 세트를 따로 안 적은 운동의 세트 — 암케어 강화 루틴과 같은 2세트 */
const DEFAULT_SETS = 2;
/** 운동을 바꾸는 데 드는 시간(분) — 암케어와 같다 */
const SWITCH_MINUTES = 0.5;

function sessionMinutes(ex: RehabLibraryExercise, sets: number): number {
  return (minutesForSets(ex, sets) ?? 3 * sets) + SWITCH_MINUTES;
}

/**
 * 오늘 재활 세션 — 그 단계(한 칸 낮춘 날은 아래 단계)의 운동을 라이브러리에서 **카테고리와 상관없이 이름으로** 찾는다.
 *
 *   가진 장비로 못 하는 운동
 *     한 팔 플라이오볼 운동  → 두 손 메디신볼 운동(톨 닐링 체스트 패스 → 오버헤드 던지기 차례로, 이미 든 것은 빼고)
 *     그 밖                  → 같은 주 근육 · 같거나 낮은 강도의 암케어 운동
 *     그래도 없으면          → 빼고 빠진 이름을 한 줄로
 *   라이브러리에 없는 이름 → 빼고 한 줄(자가 시험이 없게 지킨다)
 *   세트는 라이브러리 그대로, 심함은 1 · 2단계 세트 −1(최소 1)
 *
 * 가진 장비를 아직 안 골랐으면(빈 목록) 아무것도 빼지 않는다 — 안 고른 것과 없는 것은 다르다(lib/report/equipment.ts).
 */
export function buildRehabSession({
  area,
  condition,
  severity,
  stage,
  lowered,
  library,
  ownedEquipment,
}: {
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
  severity: RehabSeverity;
  /** 지금 단계 */
  stage: RehabStage;
  /** 한 칸 낮춘 날인가 — 아래 단계 운동으로(1단계는 그대로) */
  lowered: boolean;
  /** 보이는 라이브러리 운동(숨긴 것 빼고) */
  library: readonly RehabLibraryExercise[];
  ownedEquipment: readonly string[];
}): RehabSession {
  const effective = (lowered ? Math.max(1, stage - 1) : stage) as RehabStage;
  const byTitle = new Map(library.map((ex) => [ex.title, ex]));
  const owned = new Set(ownedEquipment);
  const doable = (ex: RehabLibraryExercise) =>
    ownedEquipment.length === 0 || canDo(ex, owned);

  const moves = stageExercises(area, condition, effective);
  const planned = new Set(moves.map((m) => m.name));
  const taken = new Set<string>();
  const items: RehabSessionItem[] = [];
  const missing: string[] = [];
  const dropped: string[] = [];
  const swapped: string[] = [];
  const lessSets = severity === 'severe' && effective <= 2;

  const put = (ex: RehabLibraryExercise, move: RehabMove, replaces?: string) => {
    const base = ex.sets ?? DEFAULT_SETS;
    items.push({
      exerciseId: ex.id,
      title: ex.title,
      sets: lessSets ? Math.max(1, base - 1) : base,
      ...(move.note && !replaces ? { note: move.note } : {}),
      ...(replaces ? { replaces } : {}),
    });
    taken.add(ex.id);
  };

  for (const move of moves) {
    const ex = byTitle.get(move.name);
    if (!ex) {
      missing.push(move.name);
      continue;
    }
    if (taken.has(ex.id)) continue;
    if (doable(ex)) {
      put(ex, move);
      continue;
    }
    let sub: RehabLibraryExercise | undefined;
    if ((ONE_ARM_PLYO as readonly string[]).includes(move.name)) {
      sub = TWO_HAND_MEDBALL.map((name) => byTitle.get(name)).find(
        (alt): alt is RehabLibraryExercise =>
          alt != null && !taken.has(alt.id) && !planned.has(alt.title) && doable(alt)
      );
    } else {
      const muscle = ex.targetMuscles[0];
      const level = intensityLevel(ex.intensity);
      sub = muscle
        ? library
            .filter(
              (alt) =>
                alt.category === ARMCARE_CATEGORY &&
                alt.id !== ex.id &&
                !taken.has(alt.id) &&
                !planned.has(alt.title) &&
                alt.targetMuscles[0] === muscle &&
                intensityLevel(alt.intensity) <= level &&
                doable(alt)
            )
            /* 원래 것에 가장 가까운 강도부터, 같으면 이름 차례 — 새로고침에 바뀌지 않게 */
            .sort(
              (a, b) =>
                intensityLevel(b.intensity) - intensityLevel(a.intensity) ||
                a.title.localeCompare(b.title, 'ko')
            )[0]
        : undefined;
    }
    if (sub) {
      put(sub, move, move.name);
      swapped.push(`${move.name} → ${sub.title}`);
    } else {
      dropped.push(move.name);
    }
  }

  const notes: string[] = [];
  if (lowered) {
    notes.push(
      stage === 1
        ? '오늘은 아파서 1단계 운동을 그대로, 아프지 않은 범위에서만 해요.'
        : `오늘은 한 칸 낮춰 ${effective}단계 운동으로 해요. 초록이 세 번 나오면 원래 단계로 돌아가요.`
    );
  }
  if (lessSets) {
    notes.push(
      '통증이 심한 편이라 세트를 하나씩 줄였어요. 버티기는 최대 힘의 절반 이하로 해요.'
    );
  }
  if (swapped.length > 0) {
    notes.push(`장비가 없어 바꿔 넣었어요(${swapped.join(' · ')}).`);
  }
  if (dropped.length > 0) {
    notes.push(`장비가 없어 ${withJosa(dropped.join(' · '), '은/는')} 뺐어요.`);
  }
  if (missing.length > 0) {
    notes.push(
      `라이브러리에 아직 없어 ${withJosa(missing.join(' · '), '은/는')} 뺐어요.`
    );
  }

  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const minutes = items.reduce(
    (sum, it) => sum + sessionMinutes(byId.get(it.exerciseId)!, it.sets),
    0
  );
  return {
    stage: effective,
    lowered,
    items,
    notes,
    estimatedMinutes: Math.max(1, Math.round(minutes)),
  };
}

/* ─────────────────────────────── 세션 판정 ─────────────────────────────── */

/** 이 통증부터 빨강 */
export const RED_PAIN = 5;

/**
 * 허용 통증(가이드라인 7절) — 1 · 2단계는 부위 · 병명(힘줄 · 근육형 3, 인대 · 불안정형 2), 3 · 4단계는 2(통증 없음).
 */
export function painAllowance({
  stage,
  area,
  condition,
}: {
  stage: RehabStage;
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
}): number {
  if (stage >= 3) return 2;
  const c = condition ? REHAB_CONDITIONS[condition] : null;
  return c?.earlyPainLimit ?? REHAB_REGIONS[area].earlyPainLimit;
}

/**
 * 세션 판정 — 3문항(남은 통증 · 가장 아팠던 정도 · 느낌)으로(가이드라인 7절).
 *   진료  저리거나 감각이 이상함 · 빠질 것 같음
 *   빨강  남은 통증이 계속 있었음 · 5 이상 · 3 · 4단계에서 관절이 찌르듯
 *   노랑  남은 통증이 하다 보니 사라짐 · 허용보다 높고 4 이하 · (1 · 2단계) 관절이 찌르듯
 *   초록  남은 통증 없음 + 허용 이하 + 근육 느낌
 */
export function judgeSession({
  leftover,
  pain,
  feel,
  stage,
  area,
  condition,
}: {
  leftover: RehabLeftover;
  pain: number;
  feel: RehabFeel;
  stage: RehabStage;
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
}): RehabResult {
  if (feel === 'tingle' || feel === 'slip') return 'refer';
  if (leftover === 2 || pain >= RED_PAIN || (stage >= 3 && feel === 'sharp'))
    return 'red';
  const allowed = painAllowance({ stage, area, condition });
  if (leftover === 1 || pain > allowed || feel !== 'muscle') return 'yellow';
  return 'green';
}

/** 세션 한 줄 — 판정 뒤처리 · 상태 계산이 보는 것 */
export type RehabSessionLike = {
  /** YYYY-MM-DD */
  date: string;
  stage: number;
  leftover: number;
  pain: number;
  feel: string;
  result: RehabResult;
  lowered: boolean;
};

/**
 * 빨강 · 진료 세션의 뒤처리(가이드라인 7절) — 그 밖은 null.
 *   남은 통증만으로 빨강  하루 쉬고 같은 것 [Fees 규칙 4]
 *   그 밖의 빨강          이틀 쉬고 한 칸 낮춤 [Fees 규칙 1 · 3]
 *   진료                  빨강처럼 이틀 쉬고 한 칸 낮춤 — 가이드라인이 정하지 않아 더 조심하는 쪽으로 [정리]
 */
export function afterBadSession(
  s: Pick<RehabSessionLike, 'result' | 'leftover' | 'pain' | 'feel' | 'stage'>
): { restDays: 1 | 2; lower: boolean } | null {
  if (s.result === 'refer') return { restDays: 2, lower: true };
  if (s.result !== 'red') return null;
  const leftoverOnly =
    s.leftover === 2 && s.pain < RED_PAIN && !(s.stage >= 3 && s.feel === 'sharp');
  return leftoverOnly ? { restDays: 1, lower: false } : { restDays: 2, lower: true };
}

/** 판정 한 줄 — 따라하기 끝에 보인다 */
export function sessionResultText(
  s: Pick<RehabSessionLike, 'result' | 'leftover' | 'pain' | 'feel' | 'stage'>
): string {
  const after = afterBadSession(s);
  switch (s.result) {
    case 'green':
      return '초록이에요. 잘했어요. 다음에도 이대로 해요.';
    case 'yellow':
      return '노랑이에요. 다음에도 같은 운동을 다시 해요. 아직 올리지 않아요.';
    case 'refer':
      return '저리거나 빠질 것 같은 느낌은 진료를 받아보세요. 이틀은 팔을 쉬어요.';
    case 'red':
      if (after && !after.lower)
        return '빨강이에요. 내일은 쉬고, 그다음에 같은 운동을 해요.';
      return s.stage <= 1
        ? '빨강이에요. 이틀 쉬어요. 1단계에서도 아프면 진료를 받아보세요.'
        : '빨강이에요. 이틀 쉬고, 한 칸 낮춘 운동으로 해요.';
  }
}
