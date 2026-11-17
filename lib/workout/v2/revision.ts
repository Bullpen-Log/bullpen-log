import { storedKg } from '@/lib/exercise-meta';
import type { FrozenExercise } from '@/lib/workout/session-plan';
import {
  PROGRAM_LOCK_TEXT,
  TARGET_LIMITS,
  editableOf,
  kgEditable,
  recommendedOf,
  type StoredLoadJson,
  type TargetValues,
} from '@/lib/workout/target-override';
import {
  PAIN_NO_LOAD_TARGET_TEXT,
  applyLoadPatch,
  loadTargetUnsafeUnderPain,
  readLoadTarget,
  sameLoadTarget,
  targetContractOf,
  type KgOp,
  type LoadOp,
  type LoadTargetCode,
  type LoadTargetInput,
} from '@/lib/workout/load/target';
import { projectWeightKg } from '@/lib/workout/load/recorded';
import { recommendedSetTargets, type PlannedSetTarget } from '@/lib/workout/v2/plan-v2';

/**
 * EX-RX01 R2A — 목표 판(target revision)의 순수 계산.
 *
 * 한 운동 자리의 목표를 바꿀 때마다 새 판을 만든다(이미 남긴 세트의 기준은 그 세트가 가리키는 옛 판에 그대로 남는다).
 * 판 = 오늘 추천(얼린 처방) + 내 목표(바꾼 칸만) + 계획 세트 열쇠마다 풀어 놓은 값.
 *
 * 받는 명령은 '바뀐 칸만'(sparse): 칸을 안 보내면 그대로 두고, set 은 그 값으로, follow 는 그 칸을 추천으로 되돌린다.
 * resetExercise 는 모든 칸을 추천으로. 빈 입력은 화면의 '아직 안 정함'이지 되돌리기가 아니다(설계 13J).
 */

export type FieldOp = { set: number } | { follow: true };
export type TargetField = 'sets' | 'reps' | 'holdSeconds' | 'restSeconds' | 'kg';
/** EX-LOAD01-R1 — 장비 목표 칸의 명령: 정함(LoadTargetInput) · 따름(지움). loadV:1 과 같이 와야 한다 */
export type LoadFieldOp = { set: LoadTargetInput } | { follow: true };
/** 목표 판에서 바뀐 칸 — 숫자 칸 + 장비 목표 */
export type ChangedField = TargetField | 'load';
/**
 * reset:true — 숫자 칸은 모두 추천으로. 장비 목표는 loadV:1 이 같이 와야 지운다(옛 클라이언트의 되돌리기는 모르는 장비 목표를 지우지 않는다).
 * fields.load — loadV:1 과 같이. 칸이 없으면 장비 목표는 그대로.
 */
export type TargetPatch = { reset?: true; loadV?: number; fields?: Partial<Record<TargetField, FieldOp>> & { load?: LoadFieldOp } };

/** 숫자 칸 + 장비 목표(받은 그대로 — 다른 판의 값도 지우지 않고 옮긴다) */
export type Override = Partial<Record<TargetField, number>> & { load?: StoredLoadJson };

/** 판에 남기는 단위 · 뜻 — 장비 이름이 바뀌어도 옛 무게의 뜻이 바뀌지 않게 같이 얼린다 */
export type TargetSemantics = {
  isHold: boolean;
  perSide: boolean;
  /** 무게 기준: 전체 무게(total) 인지 모름(unknown)인지. 손마다 · 덤벨 하나 기준은 아직 라이브러리 칸이 없어 unknown */
  loadBasis: 'total' | 'unknown';
  unit: 'kg';
  timeUnit: 'seconds';
  /** % 방식 · '+' 세트처럼 세트마다 다른 처방인가 */
  perSetPrescription: boolean;
};

export type RevisionSnapshot = {
  recommended: TargetValues;
  recommendedSets: PlannedSetTarget[];
  override: Override | null;
  /** 지금 목표로 풀어 놓은 세트(앞에서부터 N 개의 처방 열쇠). 늘린 세트는 새 열쇠 */
  resolvedSets: PlannedSetTarget[];
  restSeconds: number | null;
  semantics: TargetSemantics;
  /** 이 판에서 바뀐 칸(앞 판과 견줘) */
  changedFields: ChangedField[];
  policyVersion: 1;
};

export type PatchError = {
  error: string;
  code: 'INVALID' | 'PER_SET_EDITOR_REQUIRED' | 'PAIN_NO_INCREASE' | 'STOP' | LoadTargetCode;
  field?: ChangedField;
};

const FIELDS: TargetField[] = ['sets', 'reps', 'holdSeconds', 'restSeconds', 'kg'];

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function semanticsOf(ex: FrozenExercise): TargetSemantics {
  return {
    isHold: ex.isHold,
    perSide: ex.perSide,
    loadBasis: ex.needsWeight || ex.suggestedKg != null ? 'total' : 'unknown',
    unit: 'kg',
    timeUnit: 'seconds',
    perSetPrescription: !!(ex.setTargets && ex.setTargets.length) || !!ex.setTargets?.some((t) => t.plus),
  };
}

/**
 * 앞 판의 내 목표 + 받은 칸 → 다음 내 목표. 모양 · 범위 · 횟수/시간 배타 · 세트마다 처방(%) 보호를 본다.
 * 추천과 같은 값은 '바꾸지 않은 칸'으로 접는다.
 */
export function applyTargetPatch(
  prev: Override | null,
  patch: unknown,
  ex: FrozenExercise,
  recommended: TargetValues
): { ok: true; override: Override | null } | ({ ok: false } & PatchError) {
  if (!patch || typeof patch !== 'object') return { ok: false, code: 'INVALID', error: '목표 값을 읽지 못했어요.' };
  const p = patch as TargetPatch;
  if (p.loadV !== undefined && p.loadV !== 1)
    return { ok: false, code: 'TARGET_LOAD_VERSION', error: '이 장비 목표는 다른 앱 버전의 방식이에요. 앱을 업데이트한 뒤 다시 정해 주세요.', field: 'load' };
  const contract = targetContractOf(ex);
  const loadEditable = editableOf(ex).load === true;
  if (p.reset === true) {
    if (p.fields && Object.keys(p.fields).length) return { ok: false, code: 'INVALID', error: '되돌리기와 칸 바꾸기를 같이 보낼 수 없어요.' };
    /* EX-LOAD01-R1 — loadV:1 이 없는 되돌리기(옛 클라이언트)는 장비 목표를 지우지 않는다. 숫자 칸만 추천으로(kg 은 그 투영) */
    if (p.loadV === 1) return { ok: true, override: null };
    const kept = applyLoadPatch({ prevRaw: prev?.load, op: { op: 'keep' }, kgOp: { op: 'follow' }, contract, editable: loadEditable });
    if (!kept.ok || kept.load === undefined) return { ok: true, override: null };
    const next: Override = { load: kept.load as StoredLoadJson };
    if (typeof kept.kg === 'number' && kept.kg !== recommended.kg) next.kg = kept.kg;
    return { ok: true, override: next };
  }
  const fields = (p.fields ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(fields))
    if (!FIELDS.includes(k as TargetField) && k !== 'load') return { ok: false, code: 'INVALID', error: `모르는 칸이에요: ${k}` };
  const next: Override = { ...(prev ?? {}) };
  const perSet = semanticsOf(ex).perSetPrescription;
  let kgOp: KgOp = { op: 'absent' };

  for (const f of FIELDS) {
    const op = fields[f];
    if (op === undefined) continue;
    if (!op || typeof op !== 'object') return { ok: false, code: 'INVALID', error: '목표 값을 읽지 못했어요.', field: f };
    if ('follow' in op) {
      if ((op as { follow: unknown }).follow !== true) return { ok: false, code: 'INVALID', error: '목표 값을 읽지 못했어요.', field: f };
      delete next[f];
      if (f === 'kg') kgOp = { op: 'follow' };
      continue;
    }
    const v = (op as { set?: unknown }).set;
    if (f === 'reps' && ex.isHold) return { ok: false, code: 'INVALID', error: '시간으로 버티는 운동이라 횟수 대신 시간을 정해 주세요.', field: f };
    if (f === 'holdSeconds' && !ex.isHold) return { ok: false, code: 'INVALID', error: '횟수로 하는 운동이라 시간 대신 횟수를 정해 주세요.', field: f };
    if (f === 'kg') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > TARGET_LIMITS.weightKg)
        return { ok: false, code: 'INVALID', error: `무게는 0보다 크고 ${TARGET_LIMITS.weightKg}kg 이하로 정해 주세요.`, field: f };
      if (perSet) return { ok: false, code: 'PER_SET_EDITOR_REQUIRED', error: '세트마다 무게가 다른 처방이라 한 숫자로 바꿀 수 없어요. 세트별 편집이 필요해요.', field: f };
      /* 무게를 다루지 않는 운동(모빌리티 · 워밍업 · 맨몸)에 무게 목표를 만들지 않는다 — r1 과 같은 규칙(검토 #9) */
      if (!kgEditable(ex)) return { ok: false, code: 'INVALID', error: '이 운동은 무게 목표를 정하지 않아요.', field: f };
      const kg = storedKg(v);
      kgOp = { op: 'set', kg };
      if (kg === recommended.kg) delete next.kg;
      else next.kg = kg;
      continue;
    }
    const [min, max] =
      f === 'sets' ? [1, TARGET_LIMITS.sets] : f === 'reps' ? [1, TARGET_LIMITS.reps] : f === 'holdSeconds' ? [1, TARGET_LIMITS.holdSeconds] : [0, TARGET_LIMITS.restSeconds];
    if (!isInt(v) || v < min || v > max) return { ok: false, code: 'INVALID', error: `${min}~${max} 사이의 정수로 정해 주세요.`, field: f };
    if (f === 'reps' && perSet) return { ok: false, code: 'PER_SET_EDITOR_REQUIRED', error: '세트마다 횟수가 다른 처방이라 한 숫자로 바꿀 수 없어요. 세트별 편집이 필요해요.', field: f };
    if (f === 'sets' && perSet && recommended.sets != null && v > recommended.sets)
      return { ok: false, code: 'PER_SET_EDITOR_REQUIRED', error: '세트마다 다른 처방에 세트를 더하려면 더하는 세트의 값을 따로 정해야 해요.', field: f };
    if (v === recommended[f]) delete next[f];
    else next[f] = v;
  }

  /* ── EX-LOAD01-R1 — 장비 목표(r1 checkTargetInput 과 같은 규칙: lib/workout/load/target.ts applyLoadPatch) ── */
  let loadOp: LoadOp = { op: 'keep' };
  const lop = fields.load;
  if (lop !== undefined) {
    if (p.loadV !== 1)
      return { ok: false, code: 'TARGET_LOAD_VERSION', error: '이 장비 목표는 다른 앱 버전의 방식이에요. 앱을 업데이트한 뒤 다시 정해 주세요.', field: 'load' };
    if (!lop || typeof lop !== 'object') return { ok: false, code: 'INVALID', error: '목표 값을 읽지 못했어요.', field: 'load' };
    if ('follow' in lop) {
      if ((lop as { follow: unknown }).follow !== true) return { ok: false, code: 'INVALID', error: '목표 값을 읽지 못했어요.', field: 'load' };
      loadOp = { op: 'clear' };
    } else loadOp = { op: 'set', input: (lop as { set?: unknown }).set };
  }
  const lp = applyLoadPatch({ prevRaw: prev?.load, op: loadOp, kgOp, contract, editable: loadEditable, lockText: ex.programSlot ? PROGRAM_LOCK_TEXT : null });
  if (!lp.ok) return { ok: false, code: lp.code, error: lp.error, field: lp.code === 'TARGET_LOAD_CONFLICT' && loadOp.op !== 'set' ? 'kg' : 'load' };
  if (lp.load === undefined) delete next.load;
  else next.load = lp.load as StoredLoadJson;
  if (lp.kg !== 'asInput') {
    if (lp.kg != null && perSet && loadOp.op === 'set')
      return { ok: false, code: 'PER_SET_EDITOR_REQUIRED', error: '세트마다 무게가 다른 처방이라 한 숫자로 바꿀 수 없어요. 세트별 편집이 필요해요.', field: 'load' };
    if (lp.kg == null || lp.kg === recommended.kg) delete next.kg;
    else next.kg = lp.kg;
  }
  return { ok: true, override: Object.keys(next).length ? next : null };
}

/**
 * 판 하나를 풀어 놓는다. 세트 수 N 이면 처방 열쇠 앞에서부터 N 개(가장 잘한 세트를 고르지 않는다). 처방보다 늘리면
 * 같은 값의 새 열쇠를 붙인다(세트마다 다른 처방은 위에서 이미 막았다).
 */
export function resolveRevision(
  ex: FrozenExercise,
  keys: readonly string[],
  override: Override | null,
  restSeconds: number | null,
  allocKey: (n: number) => string,
  nextKeyNo: number,
  prevOverride: Override | null
): { snapshot: RevisionSnapshot; keys: string[]; nextKeyNo: number } {
  const recommended = recommendedOf(ex, restSeconds);
  const recSets = recommendedSetTargets(ex, keys);
  const sets = override?.sets ?? recommended.sets ?? keys.length;
  let allKeys = [...keys];
  let n = nextKeyNo;
  while (allKeys.length < sets) allKeys = [...allKeys, allocKey(n++)];
  const base: PlannedSetTarget = recSets[recSets.length - 1] ?? {
    key: '',
    reps: ex.isHold ? null : (ex.plannedReps ?? null),
    holdSeconds: ex.isHold ? (ex.plannedHoldSeconds ?? null) : null,
    kg: ex.suggestedKg ?? null,
    plus: false,
    reserve: ex.programSlot?.reserve ?? null,
  };
  const resolvedSets = allKeys.slice(0, sets).map((key, i) => {
    const r = recSets[i] ?? { ...base, key, plus: false };
    return {
      ...r,
      key,
      reps: override?.reps ?? r.reps,
      holdSeconds: override?.holdSeconds ?? r.holdSeconds,
      kg: override?.kg ?? r.kg,
    };
  });
  const changedFields: ChangedField[] = FIELDS.filter((f) => (prevOverride?.[f] ?? null) !== (override?.[f] ?? null));
  if (!sameLoadTarget(prevOverride?.load, override?.load)) changedFields.push('load');
  return {
    snapshot: {
      recommended,
      recommendedSets: recSets,
      override,
      resolvedSets,
      restSeconds: override?.restSeconds ?? recommended.restSeconds,
      semantics: semanticsOf(ex),
      changedFields,
      policyVersion: 1,
    },
    keys: allKeys,
    nextKeyNo: n,
  };
}

/**
 * 안전 상태로 오늘 쓰는 목표(active)를 고른다 — 내 목표(intent)는 지우지 않는다(설계 7절).
 * - stop: 처방 없음(null). 추천으로 돌아가는 것도 '해도 된다'는 뜻이 되어 안 된다.
 * - pain_no_increase: 추천보다 높거나 추천이 없는 세트 · 횟수 · 시간 · 무게 칸은 쉬어 둔다(휴식은 그대로).
 */
export function activeOverride(
  intent: Override | null,
  recommended: TargetValues,
  safety: 'clear' | 'pain_no_increase' | 'stop' | 'unknown'
): { active: Override | null; paused: Override | null; stopped: boolean } {
  if (safety === 'stop') return { active: null, paused: intent, stopped: true };
  if (!intent) return { active: intent, paused: null, stopped: false };
  /* EX-LOAD01-R1 — 다른 판의 장비 목표는 쓰지 않는다(지우지도 않는다 — intent 에 남는다) */
  const lt = readLoadTarget(intent.load);
  const usable: Override = { ...intent };
  if (intent.load !== undefined && (lt === null || lt === 'unsupported')) delete usable.load;
  if (safety !== 'pain_no_increase') return { active: Object.keys(usable).length ? usable : null, paused: null, stopped: false };
  const active: Override = { ...usable };
  const paused: Override = {};
  for (const k of ['sets', 'reps', 'holdSeconds', 'kg'] as const) {
    const v = intent[k];
    if (v == null) continue;
    const rec = recommended[k];
    if (rec == null || v > rec) {
      paused[k] = v;
      delete active[k];
    }
  }
  /* 밴드가 들어간 목표 · 추천보다 무거운 무게 목표는 쉬어 둔다. 그 투영 kg 도 같이(밴드 없이 무게만 남기지 않는다) */
  if (lt && lt !== 'unsupported' && active.load !== undefined && loadTargetUnsafeUnderPain(lt, recommended.kg ?? null)) {
    paused.load = intent.load;
    delete active.load;
    const p = projectWeightKg(lt.load);
    if (active.kg != null && active.kg === p) {
      paused.kg = active.kg;
      delete active.kg;
    }
  }
  return { active: Object.keys(active).length ? active : null, paused: Object.keys(paused).length ? paused : null, stopped: false };
}

/** 통증 날 저장 검사 — 이번에 새로 올린 칸만 본다(이미 쉬어 둔 칸을 다시 보내지 않아도 저장된다) */
export function painIncrease(prev: Override | null, next: Override | null, recommended: TargetValues): ChangedField | null {
  for (const k of ['sets', 'reps', 'holdSeconds', 'kg'] as const) {
    const v = next?.[k];
    if (v == null || v === prev?.[k]) continue;
    const rec = recommended[k];
    if (rec == null || v > rec) return k;
  }
  /*
   * EX-LOAD01-R1 — 장비 목표를 새로 정하거나 바꿨다: 밴드가 들어가면 세기 차례를 모르니 늘 막는다(색 · 단계로 차례를 짓지 않는다).
   * 무게만이면 추천 이하만. 지움 · 그대로는 막지 않는다.
   */
  if (next?.load !== undefined && !sameLoadTarget(prev?.load, next.load)) {
    const t = readLoadTarget(next.load);
    if (t && t !== 'unsupported' && loadTargetUnsafeUnderPain(t, recommended.kg ?? null)) return 'load';
  }
  return null;
}

/** 통증 날 장비 목표 거절 글(명령이 칸이 'load' 일 때 쓴다) */
export const PAIN_LOAD_TARGET_TEXT = PAIN_NO_LOAD_TARGET_TEXT;

/**
 * EX-LOAD01-R1 — r1 목표 창의 입력(전체 칸 · 빈 칸 = 추천)을 v2 명령으로. lib/workout/v2/legacy.ts legacyTarget 과 같은 숫자 규칙에
 * 장비 목표만 더했다: 칸이 없으면 그대로, null + loadV:1 은 지움, 값 + loadV:1 은 정함. 숫자 칸이 다 비고 장비 목표를 지우면 reset + loadV:1.
 */
export function patchOfTargetInput(
  target: (Partial<Record<TargetField, number | null>> & { load?: LoadTargetInput | null; loadV?: number }) | null
): TargetPatch {
  if (!target) return { reset: true };
  const numericEmpty = (['sets', 'reps', 'holdSeconds', 'restSeconds', 'kg'] as const).every((f) => target[f] == null);
  const loadV = target.loadV;
  /* 장비 목표 칸이 없는 되돌리기 — 장비 목표는 그대로(loadV 가 와도 지움이 아니다) */
  if (numericEmpty && target.load === undefined) return { reset: true };
  /* 지움은 loadV:1 일 때만 reset 으로 — 아니면 아래 fields.load 로 보내 명령이 판 번호를 따져 거절한다 */
  if (numericEmpty && target.load === null && loadV === 1) return { reset: true, loadV: 1 };
  const fields: NonNullable<TargetPatch['fields']> = {};
  for (const f of ['sets', 'reps', 'holdSeconds', 'restSeconds', 'kg'] as const) {
    if (!(f in target)) continue;
    const v = target[f];
    fields[f] = v == null ? { follow: true } : { set: v };
  }
  if (target.load !== undefined) fields.load = target.load === null ? { follow: true } : { set: target.load };
  return loadV === undefined ? { fields } : { fields, loadV };
}
