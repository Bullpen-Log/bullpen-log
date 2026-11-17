import {
  AMOUNT_LIMITS,
  formatPrescription,
  formatSeconds,
  minutesForSets,
  storedKg,
} from '@/lib/exercise-meta';
import { roundForDisplay, weightKindOf } from '@/lib/program/next-weight';
import { acceptsMass, type RecordingContract } from '@/lib/workout/load/contract';
import { contractOfFrozen } from '@/lib/workout/load/frozen';
import { projectWeightKg } from '@/lib/workout/load/recorded';
import {
  LOAD_TARGET_TEXT,
  PAIN_NO_LOAD_TARGET_TEXT,
  applyLoadPatch,
  loadTargetEditable,
  loadTargetMass,
  loadTargetState,
  loadTargetText,
  loadTargetUnsafeUnderPain,
  readLoadTarget,
  targetContractOf,
  type KgOp,
  type LoadOp,
  type LoadTarget,
  type LoadTargetInput,
} from '@/lib/workout/load/target';
import { fromWeight, round1, toWeight, type WeightUnit } from '@/lib/units';

/**
 * 운동 중 '내 목표' — 사용자가 이 판(세션)에서만 바꾼 세트 · 횟수(또는 버티는 시간) · 휴식 · 무게(EX-RX01).
 *
 * 세 층을 섞지 않는다.
 * - 라이브러리 기본(ExerciseVideo 의 sets/reps/holdSeconds/restSeconds) — 관리자가 검수한 모두의 값. 여기서 절대 안 바꾼다.
 * - 오늘 추천(FrozenExercise 의 plannedSets/plannedReps/plannedHoldSeconds/restSeconds/suggestedKg) — 목표 · 양 조절 ·
 *   무게 엔진이 세션을 열 때 얼린 값. 프로그램 넘기기 · 다음 무게 추천 · '추천 vs 실제'는 계속 이 값을 읽는다.
 * - 내 목표(FrozenExercise.userTarget) — 사용자가 직접 바꾼 칸만. 칸이 있으면 그 칸은 늘 이긴다(다시 열기 · 순서 바꾸기 ·
 *   새로고침 · 앱 다시 켜기에서도 — 판 JSON 안 운동 하나에 붙어 있어 readFrozenPlan · mergeReopened 가 그대로 옮긴다).
 *
 * 이 파일은 순수하다(DB · 서버 없음) — 서버 동작(lib/workout/target-edit.ts), 웹 운동 화면, 앱 운동 화면이 같은 검사를 쓴다.
 */

/**
 * 목표로 받을 수 있는 범위 — 관리자가 라이브러리에 처방을 적을 때의 범위(app/actions/content.ts readPrescription)와 같다.
 * 세트를 남길 때의 한도(AMOUNT_LIMITS)는 '실제로 한 것'이라 더 넓다(그건 그대로).
 * 휴식 0초는 사용자가 직접 고른 값일 때만(라이브러리도 0~600 을 받는다). 비어 있는 값을 0으로 지어내지는 않는다.
 */
export const TARGET_LIMITS = {
  sets: 10,
  reps: 100,
  holdSeconds: AMOUNT_LIMITS.holdSeconds,
  restSeconds: 600,
  weightKg: AMOUNT_LIMITS.weightKg,
} as const;

/** 무게 · 횟수를 적지 않는 분류(운동 화면의 NO_INPUT_CATEGORIES 와 같다) — 세트만 체크하므로 무게 목표가 없다 */
const NO_LOAD_CATEGORIES = new Set(['모빌리티', '워밍업']);

/** 판 JSON 의 운동 하나에 붙는 내 목표. 있는 칸만 바꾼 것이다(없는 칸은 오늘 추천을 따른다). */
export type UserTarget = {
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  kg?: number;
  /**
   * EX-LOAD01-R1 — 장비 목표(lib/workout/load/target.ts LoadTarget). 저장된 그대로 옮긴다 — 다른 판의 앱이 쓴 값(모르는 v · 해석기 ·
   * 카탈로그)일 수도 있어 unknown 이다. 쓸 때는 늘 loadTargetState 로 다시 읽는다(모르는 값은 쓰지도 지우지도 않는다).
   * kg 칸은 이 목표의 무게 성분 투영(projectWeightKg)과 같게 둔다(밴드만 · 양손 다른 무게면 kg 칸 없음).
   */
  load?: StoredLoadJson;
  /** 마지막으로 바꾼 때(ISO) */
  at: string;
};

/** 판 JSON 에 그대로 옮기는 값(JSON 으로 저장된 것) — 다른 판의 장비 목표도 이 모양으로 지나간다 */
export type StoredLoadJson = string | number | boolean | null | StoredLoadJson[] | { [k: string]: StoredLoadJson };

/** 화면에 내보내는 내 목표 — 장비 목표는 이 판에서 쓸 수 있는 것만(다른 판의 값은 loadUnsupported 로 따로 알린다) */
export type TargetOverride = Omit<UserTarget, 'at' | 'load'> & { load?: LoadTarget };

/** 한 층의 값 — 비어 있는 칸은 null(그 층에 값이 없다는 뜻, 0 이 아니다) */
export type TargetValues = {
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  kg: number | null;
  /** EX-LOAD01-R1 — 장비 목표. 오늘 추천에는 없다(밴드 추천은 없다). 칸이 없으면 null 과 같다 */
  load?: LoadTarget | null;
};

/** 바꿀 수 있는 칸 — load: 장비 목표(밴드 · 섞임 · 고르기 · 기구 이름 · 양손 다른 무게). 옛 서버의 답에는 없다 */
export type TargetEditable = { sets: boolean; amount: boolean; rest: boolean; kg: boolean; load?: boolean };

/** 화면이 그리는 목표 정보 — 기본 · 추천 · 내 목표 · 실제로 따르는 값 */
export type TargetView = {
  /** 라이브러리 기본. 라이브러리에서 운동을 못 찾았으면 null */
  baseline: TargetValues | null;
  recommended: TargetValues;
  /** 사용자가 바꾼 칸만 담은 것. 바꾼 적 없으면 null */
  override: TargetOverride | null;
  overrideAt: string | null;
  /** 지금 따르는 값 = 내 목표 ?? 오늘 추천 */
  effective: TargetValues;
  editable: TargetEditable;
  /** 세트 · 횟수 · 무게를 못 바꾸는 까닭(프로그램 칸). 없으면 null */
  locked: string | null;
  /** 오늘 추천의 근거 한 줄씩 — 화면이 '왜 이 값인가'로 보인다 */
  basis: string[];
  /** 지금 목표로 한 번 다 할 때 걸리는 어림 시간(분, 휴식 포함). 셀 수 없으면 null */
  minutes: number | null;
  /** 오늘 추천으로 했을 때의 어림 시간(분) */
  recommendedMinutes: number | null;
  /** 어림 시간을 셀 때 쓰는 라이브러리 강도(화면이 고치는 중인 값으로 다시 셀 때 같은 값을 쓴다) */
  intensity: string;
  /**
   * 오늘 체크인에 통증이 있어 쉬어 둔 내 목표 칸(오늘 추천보다 높거나 추천이 없는 세트 · 횟수 · 시간 · 무게). 없으면 null.
   * 통증 전에 올려 둔 목표가 통증 날에도 이어지지 않게 읽을 때 한 번 더 막는다 — 이 칸은 effective · override 에서 빠져 있다.
   */
  painPaused?: (Partial<Pick<TargetValues, 'sets' | 'reps' | 'holdSeconds' | 'kg'>> & { load?: LoadTarget }) | null;
  /** EX-LOAD01-R1 — 다른 앱 버전이 저장한 장비 목표가 있다(쓰지 않고 지우지 않는다). 없으면 false · 없음 */
  loadUnsupported?: boolean;
};

/** 목표를 셀 때 필요한 운동의 성질 — 얼린 운동(FrozenExercise)이든 화면의 운동(RunExercise)이든 이 칸만 있으면 된다 */
export type TargetSubject = {
  /** 운동 번호 — 계약 없이 얼린 옛 판은 세트 기록과 같이 그 판의 장비 · 검토 예외로 계약을 다시 푼다(contractOfFrozen) */
  id?: string;
  category: string;
  intensity?: string;
  isHold: boolean;
  perSide: boolean;
  needsWeight: boolean;
  equipment: readonly string[];
  programSlot?: unknown;
  setTargets?: readonly unknown[] | null;
  suggestedKg?: number | null;
  /**
   * EX-LOAD01 — 판에 얼린 기록 계약(FrozenExercise.load · RunExercise.load). 있으면 무게 목표는 **이것만** 본다 — 세트 기록과 같은 계약이라
   * 받침 막대 인버티드 로우(맨몸)는 무게 목표가 없고, 무게를 더하는 친업(added)은 있다. 없으면 id 로 그 판의 장비에서 다시 풀고,
   * id 도 없으면(화면이 만든 옛 모양) 예전 장비 규칙.
   */
  load?: RecordingContract | null;
};

export const PROGRAM_LOCK_TEXT =
  '근력 · 파워 프로그램 칸은 세트 · 횟수 · 무게를 프로그램이 정해요(다음 일차 · 무게 추천에 쓰여요). 여기서는 휴식만 바꿀 수 있어요.';

/** 이 운동에서 바꿀 수 있는 칸 */
export function editableOf(ex: TargetSubject): TargetEditable {
  /* 프로그램 칸은 일차 넘기기(처방 세트의 절반) · '몇 개 더?' · 다음 무게가 처방 값을 읽는다 — 휴식만 */
  if (ex.programSlot) return { sets: false, amount: false, rest: true, kg: false };
  /* EX-LOAD01-R1 — 장비 목표 칸은 받는 운동에만 붙인다(없으면 예전 모양 그대로 — 옛 화면 · 옛 답과 같은 모양) */
  return { sets: true, amount: true, rest: true, kg: kgEditable(ex), ...(loadTargetEditable(ex) ? { load: true } : {}) };
}

/**
 * 무게 목표를 받을 운동인가.
 * - 얼린 계약이 있으면(EX-LOAD01) 그 계약이 무게 성분을 받을 때만 — 무게 · 섞인 무게(무게 성분) · 무게를 더하는 변형. 고르는 운동(밴드 | 무게)은
 *   무게 변형이 있으면 그 변형의 목표로. 밴드 · 맨몸 · 받침 · 모름은 무게 목표가 없다(밴드 목표는 kg 이 아니다 — 세트마다 고른 밴드가 남는다).
 * - 계약이 없는 옛 판은 예전 규칙(무게를 적는 장비거나 추천 무게가 있는 운동).
 */
export function kgEditable(ex: TargetSubject): boolean {
  if (NO_LOAD_CATEGORIES.has(ex.category)) return false;
  const c = ex.load ?? (ex.id ? contractOfFrozen({ id: ex.id, equipment: ex.equipment, category: ex.category, isHold: ex.isHold }) : null);
  if (c) {
    if (c.mode === 'alternative') return !!c.variants?.some((v) => v.key === 'mass' && acceptsMass(v.contract));
    return acceptsMass(c);
  }
  return ex.needsWeight || ex.suggestedKg != null || weightKindOf(ex.equipment) !== 'none';
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function inRange(v: number, min: number, max: number) {
  return v >= min && v <= max;
}

/**
 * 판 JSON 에서 읽은 내 목표를 다시 검사한다 — 판 JSON 의 운동은 모양 검사 없이 통째로 지나가므로(readFrozenPlan)
 * 여기서 칸마다 거른다. 운동 종류에 안 맞는 칸(버티기 운동의 횟수 등) · 범위 밖 · 정수 아님은 버린다. 남는 칸이 없으면 null.
 */
export function readUserTarget(raw: unknown, ex: Pick<TargetSubject, 'isHold'> & Partial<TargetSubject>): UserTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: UserTarget = { at: typeof r.at === 'string' ? r.at : '' };
  const edit = ex.category != null ? editableOf(ex as TargetSubject) : null;
  if (isInt(r.sets) && inRange(r.sets, 1, TARGET_LIMITS.sets) && edit?.sets !== false) out.sets = r.sets;
  if (!ex.isHold && isInt(r.reps) && inRange(r.reps, 1, TARGET_LIMITS.reps) && edit?.amount !== false) out.reps = r.reps;
  if (ex.isHold && isInt(r.holdSeconds) && inRange(r.holdSeconds, 1, TARGET_LIMITS.holdSeconds) && edit?.amount !== false)
    out.holdSeconds = r.holdSeconds;
  if (isInt(r.restSeconds) && inRange(r.restSeconds, 0, TARGET_LIMITS.restSeconds)) out.restSeconds = r.restSeconds;
  if (
    typeof r.kg === 'number' &&
    Number.isFinite(r.kg) &&
    r.kg > 0 &&
    r.kg <= TARGET_LIMITS.weightKg &&
    edit?.kg !== false
  )
    out.kg = storedKg(r.kg);
  /* EX-LOAD01-R1 — 장비 목표는 받은 그대로 옮긴다(다른 판의 값도 — 지우지 않는다). 쓸지는 loadTargetState 가 정한다 */
  if (r.load !== undefined && r.load !== null) out.load = r.load as StoredLoadJson;
  return hasAnyField(out) ? out : null;
}

function hasAnyField(t: Partial<UserTarget>): boolean {
  return (
    t.sets != null || t.reps != null || t.holdSeconds != null || t.restSeconds != null || t.kg != null || (t.load !== undefined && t.load !== null)
  );
}

/** 내 목표에서 시각을 뺀 칸만 */
export function overrideFields(t: UserTarget | null): Omit<UserTarget, 'at'> | null {
  if (!t) return null;
  const { at: _at, ...rest } = t;
  void _at;
  return hasAnyField(rest) ? rest : null;
}

/** 오늘 추천 = 얼린 처방. 버티기 운동이면 횟수 칸은 비우고, 반대도 같다(한 운동에 둘 다 있지 않게). */
export function recommendedOf(
  ex: TargetSubject & {
    plannedSets: number | null;
    plannedReps?: number | null;
    plannedHoldSeconds?: number | null;
  },
  restSeconds: number | null
): TargetValues {
  return {
    sets: ex.plannedSets ?? null,
    reps: ex.isHold ? null : (ex.plannedReps ?? null),
    holdSeconds: ex.isHold ? (ex.plannedHoldSeconds ?? null) : null,
    restSeconds,
    /* % 방식(세트마다 무게가 다름)은 한 숫자로 줄이지 않는다 */
    kg: ex.setTargets && ex.setTargets.length ? null : (ex.suggestedKg ?? null),
    /* 밴드 · 장비 추천은 없다(load 칸 없음 = null) — 장비 목표는 사람이 정할 때만 */
  };
}

/** 지금 따르는 값 — 바꾼 칸은 내 목표, 나머지는 오늘 추천 */
export function effectiveOf(recommended: TargetValues, t: TargetOverride | null): TargetValues {
  if (!t) return { ...recommended };
  return {
    sets: t.sets ?? recommended.sets,
    reps: t.reps ?? recommended.reps,
    holdSeconds: t.holdSeconds ?? recommended.holdSeconds,
    restSeconds: t.restSeconds ?? recommended.restSeconds,
    kg: t.kg ?? recommended.kg,
    /* 장비 목표가 있을 때만 칸을 붙인다(없으면 예전 모양 그대로) */
    ...(t.load ? { load: t.load } : {}),
  };
}

/** '· 3개 남기고'처럼 추천이 붙인 꼬리(free-weight.ts cautiousPrescription · 프로그램 줄) */
const RESERVE_TAIL = /\s*·\s*\d+개 남기고/;
/** 처방 줄의 휴식 조각 — '· 세트 사이 2분 휴식'(lib/prescription.ts formatPrescription) */
const REST_CLAUSE = /\s*·\s*세트 사이 [^·]*?휴식/;

/**
 * 처방 한 줄 — 내 목표가 없으면 얼린 줄 그대로(옛 판과 글자까지 같다), 있으면 지금 따르는 값으로 다시 만든다.
 * 추천이 붙인 '· N개 남기고'는 그대로 남긴다(무게를 고를 때의 여유라 목표를 바꿔도 같은 뜻이다).
 */
export function targetPrescription(
  ex: TargetSubject & { prescription: string | null },
  effective: TargetValues,
  overridden: boolean,
  override?: TargetOverride | null
): string | null {
  if (!overridden) return ex.prescription;
  /*
   * 휴식만 바꿨거나 프로그램 칸이면 추천 줄을 그대로 두고 휴식 조각만 갈아 끼운다 — 프로그램 줄('3×5 · 70%' · '5회+')을
   * 일반 '세트 × 회' 줄로 바꾸면 그날 처방의 뜻이 사라진다.
   */
  const onlyRest = override != null && override.sets == null && override.reps == null && override.holdSeconds == null && override.kg == null;
  if ((onlyRest || ex.programSlot) && ex.prescription) {
    const rest = effective.restSeconds == null ? '' : formatRestClause(effective.restSeconds);
    return REST_CLAUSE.test(ex.prescription) ? ex.prescription.replace(REST_CLAUSE, rest) : ex.prescription + rest;
  }
  const line = formatPrescription({
    category: ex.category,
    sets: effective.sets,
    reps: effective.reps,
    holdSeconds: effective.holdSeconds,
    restSeconds: effective.restSeconds,
    perSide: ex.perSide,
  });
  if (line == null) return ex.prescription;
  const tail = ex.prescription?.match(RESERVE_TAIL)?.[0] ?? '';
  return line + tail;
}

/** formatPrescription 이 쓰는 휴식 조각과 같은 꼴 */
function formatRestClause(restSeconds: number): string {
  const probe = formatPrescription({ category: '_', sets: 1, reps: 1, holdSeconds: null, restSeconds, perSide: false });
  return probe?.match(REST_CLAUSE)?.[0] ?? '';
}

/** 지금 목표로 한 번 다 할 때 걸리는 어림 시간(분) — 트레이닝 카드의 어림과 같은 셈(minutesForSets) */
export function targetMinutes(ex: TargetSubject, v: TargetValues): number | null {
  if (v.sets == null) return null;
  const m = minutesForSets(
    {
      category: ex.category,
      intensity: ex.intensity ?? '중간',
      sets: v.sets,
      reps: v.reps,
      holdSeconds: v.holdSeconds,
      restSeconds: v.restSeconds,
      perSide: ex.perSide,
    },
    v.sets
  );
  return m == null ? null : Math.max(1, Math.round(m));
}

/** 목표를 사람이 읽는 한 줄로 — '3세트 × 10회(한쪽씩) · 쉬기 1분 30초 · 20kg'. 되돌리기 확인 · 기본/추천 줄에 쓴다. */
export function describeTarget(
  v: TargetValues,
  ex: Pick<TargetSubject, 'perSide' | 'isHold'> & { inMinutes?: boolean },
  kgText?: (kg: number) => string
): string {
  const parts: string[] = [];
  const amount =
    v.holdSeconds != null
      ? ex.inMinutes
        ? `${Math.round(v.holdSeconds / 60)}분`
        : `${formatSeconds(v.holdSeconds)}`
      : v.reps != null
        ? `${v.reps}회`
        : null;
  const side = ex.perSide && amount ? '(한쪽씩)' : '';
  if (v.sets != null && amount) parts.push(`${v.sets}세트 × ${amount}${side}`);
  else if (v.sets != null) parts.push(`${v.sets}세트`);
  else if (amount) parts.push(`${amount}${side}`);
  if (v.restSeconds != null) parts.push(v.restSeconds === 0 ? '쉬지 않고' : `쉬기 ${formatSeconds(v.restSeconds)}`);
  /* EX-LOAD01-R1 — 장비 목표가 무게 성분을 말하면 그 글에 kg 이 들어 있다(두 번 적지 않는다) */
  const loadHasMass = !!v.load && loadTargetMass(v.load) != null;
  if (v.kg != null && !loadHasMass) parts.push(kgText ? kgText(v.kg) : `${v.kg}kg`);
  if (v.load) parts.push(loadTargetText(v.load, kgText));
  return parts.length ? parts.join(' · ') : '정해진 값 없음';
}

/** 좌우 운동의 뜻을 한 줄로 — 횟수 · 시간은 한쪽 기준, 양쪽을 다 하면 1세트(라이브러리 perSide 그대로, 목표로 바꾸지 않는다) */
export const PER_SIDE_MEANING = '횟수 · 시간은 한쪽 기준이에요. 양쪽을 다 하면 1세트예요.';

/** 통증 날 안내 — 올릴 수 없고, 아프면 멈춘다 */
export const PAIN_NO_INCREASE_TEXT = '오늘 체크인에 통증이 있어 목표를 오늘 추천보다 올릴 수 없어요. 하다가 아프면 바로 멈추세요.';

/** 화면이 보내는 목표. 칸이 null · 없음이면 그 칸은 오늘 추천을 따른다. 모든 칸이 비면 '추천으로 되돌리기'와 같다. */
export type TargetInput = {
  sets?: number | null;
  reps?: number | null;
  holdSeconds?: number | null;
  restSeconds?: number | null;
  kg?: number | null;
  /**
   * EX-LOAD01-R1 — 장비 목표. 칸이 없으면(undefined) 저장된 장비 목표를 그대로 둔다(옛 화면은 이 칸을 모른다). null 은 지움이고
   * loadV:1 과 같이 와야 한다. 정할 때도 loadV:1. 옛 화면의 '추천으로 되돌리기'(target null · 숫자 칸만)는 장비 목표를 지우지 않는다.
   */
  load?: LoadTargetInput | null;
  loadV?: number;
};

export type TargetCheck =
  | { ok: true; target: Omit<UserTarget, 'at'> | null }
  | { ok: false; error: string; field?: keyof TargetInput; code?: string };

/**
 * 받은 목표를 검사한다 — 서버 경계(lib/workout/target-edit.ts)와 두 화면이 같은 함수를 쓴다.
 *
 * - 정수 · 유한 값 · 범위(TARGET_LIMITS)만. 무게는 kg 소수 둘째 자리(storedKg), 0 초과.
 * - 횟수 운동에 버티는 시간, 버티기 운동에 횟수를 보내면 거절(조용히 하나를 고르지 않는다).
 * - 프로그램 칸은 휴식만.
 * - 오늘 체크인에 통증이 있으면(painToday) 세트 · 횟수 · 시간 · 무게를 오늘 추천보다 올릴 수 없다. 추천이 비어 있는 칸은 새로 정할 수 없다.
 * - 오늘 추천과 같은 값은 '바꾸지 않은 칸'으로 접는다(추천이 나중에 같아도 같은 뜻).
 */
export function checkTargetInput(
  input: unknown,
  ex: TargetSubject,
  recommended: TargetValues,
  ctx: {
    painToday: boolean;
    /**
     * EX-LOAD01-R1 — 지금 저장된 장비 목표(판 JSON 의 userTarget.load, 받은 그대로). 서버는 늘 넘긴다 — 칸이 없는 요청(옛 화면)이
     * 이 값을 지우지 않게. 화면의 미리 검사는 보이는 목표(override.load)를 넘긴다.
     */
    prevLoad?: unknown;
  }
): TargetCheck {
  /* 옛 화면의 '추천으로 되돌리기'(null) — 숫자 칸은 모두 추천으로, 장비 목표는 그대로(지우려면 loadV:1 + load:null) */
  if (input != null && typeof input !== 'object') return { ok: false, error: '목표 값을 읽지 못했어요.' };
  const r = (input ?? {}) as Record<string, unknown>;
  const edit = editableOf(ex);
  const out: Omit<UserTarget, 'at'> = {};

  const present = (k: keyof TargetInput) => r[k] !== undefined && r[k] !== null;

  if (ex.isHold && present('reps')) return { ok: false, error: '시간으로 버티는 운동이라 횟수 대신 시간을 정해 주세요.', field: 'reps' };
  if (!ex.isHold && present('holdSeconds'))
    return { ok: false, error: '횟수로 하는 운동이라 시간 대신 횟수를 정해 주세요.', field: 'holdSeconds' };

  const intField = (k: 'sets' | 'reps' | 'holdSeconds' | 'restSeconds', min: number, max: number, label: string) => {
    if (!present(k)) return null;
    const v = r[k];
    if (!isInt(v) || !inRange(v, min, max)) return `${label}은(는) ${min}~${max} 사이의 정수로 정해 주세요.`;
    return null;
  };

  const errs: [keyof TargetInput, string | null][] = [
    ['sets', intField('sets', 1, TARGET_LIMITS.sets, '세트')],
    ['reps', intField('reps', 1, TARGET_LIMITS.reps, '횟수')],
    ['holdSeconds', intField('holdSeconds', 1, TARGET_LIMITS.holdSeconds, '시간(초)')],
    ['restSeconds', intField('restSeconds', 0, TARGET_LIMITS.restSeconds, '휴식(초)')],
  ];
  for (const [field, e] of errs) if (e) return { ok: false, error: e, field };

  if (present('kg')) {
    const v = r.kg;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > TARGET_LIMITS.weightKg)
      return { ok: false, error: `무게는 0보다 크고 ${TARGET_LIMITS.weightKg}kg 이하로 정해 주세요.`, field: 'kg' };
  }

  if (!edit.sets && present('sets')) return { ok: false, error: PROGRAM_LOCK_TEXT, field: 'sets' };
  if (!edit.amount && (present('reps') || present('holdSeconds')))
    return { ok: false, error: PROGRAM_LOCK_TEXT, field: ex.isHold ? 'holdSeconds' : 'reps' };
  if (!edit.kg && present('kg'))
    return {
      ok: false,
      error: ex.programSlot ? PROGRAM_LOCK_TEXT : '이 운동은 무게 목표를 정하지 않아요.',
      field: 'kg',
    };

  /* ── EX-LOAD01-R1 — 장비 목표: 칸 없음 = 그대로, null + loadV:1 = 지움, 값 + loadV:1 = 정함 ── */
  let loadOp: LoadOp = { op: 'keep' };
  if (r.load !== undefined) {
    if (r.loadV !== 1) return { ok: false, error: LOAD_TARGET_TEXT.TARGET_LOAD_VERSION, field: 'load', code: 'TARGET_LOAD_VERSION' };
    loadOp = r.load === null ? { op: 'clear' } : { op: 'set', input: r.load };
  } else if (r.loadV !== undefined && r.loadV !== 1) {
    return { ok: false, error: LOAD_TARGET_TEXT.TARGET_LOAD_VERSION, field: 'load', code: 'TARGET_LOAD_VERSION' };
  }
  const kgOp: KgOp = present('kg') ? { op: 'set', kg: storedKg(r.kg as number) } : { op: 'follow' };
  const lp = applyLoadPatch({
    prevRaw: ctx.prevLoad,
    op: loadOp,
    kgOp,
    contract: targetContractOf(ex),
    editable: edit.load === true,
    lockText: ex.programSlot ? PROGRAM_LOCK_TEXT : null,
  });
  if (!lp.ok) return { ok: false, error: lp.error, field: lp.code === 'TARGET_LOAD_CONFLICT' && loadOp.op !== 'set' ? 'kg' : 'load', code: lp.code };

  const take = <K extends 'sets' | 'reps' | 'holdSeconds' | 'restSeconds'>(k: K) => {
    if (!present(k)) return;
    const v = r[k] as number;
    if (v !== recommended[k]) out[k] = v;
  };
  take('sets');
  take('reps');
  take('holdSeconds');
  take('restSeconds');
  if (lp.kg === 'asInput') {
    if (present('kg')) {
      const kg = storedKg(r.kg as number);
      if (kg !== recommended.kg) out.kg = kg;
    }
  } else if (lp.kg != null && lp.kg !== recommended.kg) {
    /* 장비 목표의 무게 성분이 kg 칸의 주인이다(투영) */
    out.kg = lp.kg;
  }
  if (lp.load !== undefined) out.load = lp.load as StoredLoadJson;

  if (ctx.painToday) {
    const over = (k: 'sets' | 'reps' | 'holdSeconds' | 'kg') => {
      const v = out[k];
      if (v == null) return false;
      /* 바꾸지 않은 장비 목표에서 온 kg 은 새로 올린 칸이 아니다(읽을 때 쉬어 두고, 저장해도 지우지 않는다) */
      if (k === 'kg' && lp.kgFromKeptLoad) return false;
      const rec = recommended[k];
      return rec == null || v > rec;
    };
    for (const k of ['sets', 'reps', 'holdSeconds', 'kg'] as const) {
      if (over(k)) return { ok: false, error: PAIN_NO_INCREASE_TEXT, field: k };
    }
    /* 장비 목표를 새로 정하거나 바꿨다 — 밴드가 들어가면 차례를 모르니 늘 막고, 무게는 추천 이하만. 지움은 된다 */
    if (lp.loadChanged && lp.load !== undefined) {
      const t = readLoadTarget(lp.load);
      if (t && t !== 'unsupported' && loadTargetUnsafeUnderPain(t, recommended.kg))
        return { ok: false, error: PAIN_NO_LOAD_TARGET_TEXT, field: 'load', code: 'PAIN_NO_INCREASE' };
    }
  }

  return { ok: true, target: hasAnyField(out) ? out : null };
}

/** 추천의 근거 — 얼린 운동 · 판에 이미 있는 글만 모은다(새 판정을 지어내지 않는다) */
export function basisOf(input: {
  suggestNote?: string | null;
  volumeWhy?: string | null;
  programLine?: boolean;
  goal?: string | null;
  cautious?: boolean;
}): string[] {
  const out: string[] = [];
  if (input.programLine) out.push('근력 · 파워 프로그램의 오늘 일차 처방이에요.');
  else if (input.goal) out.push(`오늘 목표(${input.goal})에 맞춘 세트 · 횟수예요.`);
  if (input.volumeWhy) out.push(input.volumeWhy);
  if (input.suggestNote) out.push(input.suggestNote);
  if (input.cautious) out.push('무게는 몇 개를 남기고 끝낼 만큼만 골라요.');
  if (!out.length) out.push('라이브러리 기본 처방을 그대로 쓴 값이에요.');
  return out;
}

/**
 * 통증 날 읽기 — 저장된 내 목표 가운데 오늘 추천보다 높은(또는 추천이 없는) 세트 · 횟수 · 시간 · 무게 칸은 쓰지 않고 따로 알린다.
 * 휴식은 그대로(쉬는 시간을 늘리는 것은 부담을 올리지 않는다). 저장 때의 막기(checkTargetInput)와 같은 기준이다.
 */
export function pausePainIncreases(
  override: TargetOverride | null,
  recommended: TargetValues,
  painToday: boolean
): { override: TargetOverride | null; paused: TargetView['painPaused'] } {
  if (!override || !painToday) return { override, paused: null };
  const keep: TargetOverride = { ...override };
  const paused: NonNullable<TargetView['painPaused']> = {};
  for (const k of ['sets', 'reps', 'holdSeconds', 'kg'] as const) {
    const v = override[k];
    if (v == null) continue;
    const rec = recommended[k];
    if (rec == null || v > rec) {
      paused[k] = v;
      delete keep[k];
    }
  }
  /*
   * EX-LOAD01-R1 — 장비 목표: 밴드가 들어간 목표 · 추천보다 무거운 무게 목표는 쉬어 둔다(지우지 않는다 — 저장해도 그대로 남는다).
   * 그 목표에서 나온 kg 칸(투영)도 같이 쉰다(밴드 없이 무게만 남기지 않는다).
   */
  if (override.load && loadTargetUnsafeUnderPain(override.load, recommended.kg ?? null)) {
    paused.load = override.load;
    delete keep.load;
    const p = projectWeightKg(override.load.load);
    if (keep.kg != null && keep.kg === p) {
      paused.kg = keep.kg;
      delete keep.kg;
    }
  }
  return { override: hasAnyField(keep) ? keep : null, paused: Object.keys(paused).length ? paused : null };
}

/** 저장된 내 목표(받은 그대로) → 화면이 쓰는 목표. 장비 목표는 이 판의 계약에 맞는 것만, kg 칸은 그 투영과 같게 */
function displayOverride(
  fields: Omit<UserTarget, 'at'> | null,
  ex: TargetSubject,
  recommended: TargetValues
): { override: TargetOverride | null; loadUnsupported: boolean } {
  if (!fields) return { override: null, loadUnsupported: false };
  const { load: raw, ...nums } = fields;
  const st = loadTargetState(raw, targetContractOf(ex));
  const out: TargetOverride = { ...nums };
  if (st.target) {
    out.load = st.target;
    const p = projectWeightKg(st.target.load);
    if (p != null && p !== recommended.kg) out.kg = p;
    else delete out.kg;
  }
  return { override: hasAnyField(out) ? out : null, loadUnsupported: st.unsupported };
}

/** 목표 정보를 한 번에 만든다 — 서버(runExercises)와 시험이 쓴다 */
export function targetView(
  ex: TargetSubject & {
    plannedSets: number | null;
    plannedReps?: number | null;
    plannedHoldSeconds?: number | null;
    prescription: string | null;
    userTarget?: unknown;
  },
  restSeconds: number | null,
  baseline: TargetValues | null,
  basis: string[],
  ctx: { painToday?: boolean } = {}
): {
  view: TargetView;
  prescription: string | null;
  plannedSets: number | null;
  restSeconds: number | null;
  targetKg: number | null;
  /** EX-LOAD01-R1 — 지금 따르는 장비 목표(통증 날 쉬어 둔 것 · 다른 판의 값은 빼고). 다음 세트 칸을 채울 수 있다 */
  targetLoad: LoadTarget | null;
} {
  const recommended = recommendedOf(ex, restSeconds);
  const ut = readUserTarget(ex.userTarget, ex);
  const shown = displayOverride(overrideFields(ut), ex, recommended);
  const { override, paused } = pausePainIncreases(shown.override, recommended, ctx.painToday === true);
  const effective = effectiveOf(recommended, override);
  const view: TargetView = {
    baseline,
    recommended,
    override,
    overrideAt: ut?.at || null,
    effective,
    editable: editableOf(ex),
    locked: ex.programSlot ? PROGRAM_LOCK_TEXT : null,
    basis,
    minutes: targetMinutes(ex, effective),
    recommendedMinutes: targetMinutes(ex, recommended),
    intensity: ex.intensity ?? '중간',
    painPaused: paused,
    ...(shown.loadUnsupported ? { loadUnsupported: true } : {}),
  };
  return {
    view,
    prescription: targetPrescription(ex, effective, override != null, override),
    plannedSets: effective.sets,
    restSeconds: effective.restSeconds,
    targetKg: override?.kg ?? null,
    targetLoad: override?.load ?? null,
  };
}

/**
 * 무게 칸 하나를 화면 단위로 보일 값 — 내가 정한 목표(mine)는 정한 값 그대로(소수 한 자리), 추천은 원판 · 덤벨 눈금에 맞춰
 * (roundForDisplay). 목표 창이 보인 숫자와 '목표 담기'가 채우는 숫자가 같아야 한다(EX-RX01).
 */
export function displayKg(kg: number, unit: WeightUnit, equipment: readonly string[], mine: boolean): number {
  if (unit === 'kg') return kg;
  return mine ? round1(toWeight(kg, 'lb')) : roundForDisplay(kg, 'lb', weightKindOf(equipment));
}

/**
 * 목표 창에 적은 무게(화면 단위) → 저장할 kg. 창이 보여 준 추천 · 내 목표 숫자를 그대로 적었으면 그 kg 을 그대로 보낸다 —
 * lb 로 반올림해 보인 값을 다시 kg 으로 바꾸면 조금 커져서 통증 날 '추천보다 올림'으로 막히고 같은 값이 '바꾼 칸'이 된다.
 */
export function storedKgFromDisplay(value: number, unit: WeightUnit, known: readonly (number | null | undefined)[]): number {
  if (unit === 'kg') return storedKg(value);
  for (const kg of known) if (kg != null && round1(toWeight(kg, unit)) === value) return kg;
  return storedKg(fromWeight(value, unit));
}

/** 통증 날 쉬어 둔 내 목표 한 줄 — '통증이 있어 오늘은 올려 둔 목표(5세트 · 40kg)를 쓰지 않고 오늘 추천대로 해요.' */
export function pausedText(
  paused: NonNullable<TargetView['painPaused']>,
  ex: Pick<TargetSubject, 'perSide' | 'isHold'> & { inMinutes?: boolean },
  kgText?: (kg: number) => string
): string {
  const parts: string[] = [];
  if (paused.sets != null) parts.push(`${paused.sets}세트`);
  if (paused.reps != null) parts.push(`${paused.reps}회`);
  if (paused.holdSeconds != null) parts.push(ex.inMinutes ? `${Math.round(paused.holdSeconds / 60)}분` : formatSeconds(paused.holdSeconds));
  /* EX-LOAD01-R1 — 장비 목표에서 나온 kg 은 장비 목표 글에 들어 있다(두 번 적지 않는다) */
  const kgFromLoad = paused.load != null && paused.kg != null && projectWeightKg(paused.load.load) === paused.kg;
  if (paused.kg != null && !kgFromLoad) parts.push(kgText ? kgText(paused.kg) : `${paused.kg}kg`);
  const lines: string[] = [];
  if (parts.length) lines.push(`통증이 있어 오늘은 올려 둔 목표(${parts.join(' · ')})를 쓰지 않고 오늘 추천대로 해요. 저장하면 이 칸은 지워져요.`);
  /* 장비 목표는 지우지 않는다 — 통증이 없는 날 다시 쓴다 */
  if (paused.load)
    lines.push(`통증이 있어 오늘은 장비 목표(${loadTargetText(paused.load, kgText)})를 쓰지 않아요. 지우지 않고 그대로 둬요.`);
  return lines.join(' ');
}
