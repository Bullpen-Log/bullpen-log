/**
 * EX-LOAD01 R1-04 — 관리자가 고치는 운동의 '뜻 설정'(ExerciseVideo.loadSemantics). 순수 — 서버 · 웹 · 앱 · 시험이 같이 쓴다.
 *
 * 운동마다 기록 방식을 고르는 칸이 아니다. 기록 칸은 여전히 고른 장비가 저절로 정한다(contract.ts). 여기서 정하는 것은 장비만으로
 * 답이 안 나오는 진짜 예외뿐이다: 밴드 역할(저항 · 보조) · 밴드와 무게를 같이 쓰는가 하나를 고르는가 · 받침으로만 쓰는 장비 ·
 * 검토한 '무게를 더한 맨몸 변형' · 추정 1RM 켜고 끄기.
 *
 * ■ 저장 모양(판 1)
 *   { v: 1, overrides: SemanticOverrides, note?: string, by?: string, at?: string }
 *   DB NULL = 설정 없음(검토 표 · 장비로 정한다). 모르는 판 · 모양 · 모르는 칸은 읽지 않고 '미정'(unresolved, 'semantics-unsupported')으로 본다 —
 *   맨몸이나 1RM 가능한 근력 운동으로 짐작하지 않는다.
 *
 * ■ 앞서는 차례(위가 이긴다, 한 층이 통째로 정한다 — 칸마다 섞지 않는다)
 *   1. 잠근 코드 예외(overrides.ts LOAD_OVERRIDES[id].locked) — 검토로 굳힌 것. 저장된 값은 보지 않고, 관리자 쓰기도 거절한다(LOCKED).
 *   2. 저장된 loadSemantics.overrides — 관리자가 고친 것. 잠그지 않은 코드 예외를 통째로 갈음한다(빈 {} 도 '예외 없음'으로 갈음).
 *      칸마다 섞지 않는 까닭: 관리자가 코드 예외의 한 칸(예: 보조 밴드)을 지우려면 그 칸이 다시 살아나면 안 된다. 화면은 지금 쓰는 값을
 *      미리 채워 보여 주고, 관리자는 예외 묶음 전체를 저장한다.
 *   3. 잠그지 않은 코드 예외(LOAD_OVERRIDES[id]).
 *   4. 장비 기본값(예외 없음).
 *   저장된 값을 읽지 못하면(모르는 판 · 모양) 2 의 자리에서 '미정'이 된다 — 3 으로 내려가지 않는다(관리자가 바꾼 뜻을 몰래 무르지 않는다).
 *
 * ■ 스키마 스위치
 *   이 파일은 DB 를 부르지 않는다. 아래 DB 도우미는 부르는 쪽이 DB 를 넘겨줄 때만 돈다 — 부르는 쪽(library-cache · content 동작)이
 *   스키마 스위치(WORKOUT_LOAD_SCHEMA)가 켜져 있을 때만 부른다. 꺼져 있으면 loadSemantics 이름이 든 SQL 을 한 번도 보내지 않는다.
 *
 * 시험: scripts/load-r1-admin-selftest.mts
 */

import {
  BAND_EQUIPMENT,
  FREE_MASS_EQUIPMENT,
  IMPLEMENT_EQUIPMENT,
  INDICATED_EQUIPMENT,
  SUPPORT_EQUIPMENT,
  resolveRecordingContract,
  type BandRole,
  type EffectiveOverrides,
  type RecordingContract,
  type SemanticOverrides,
} from '@/lib/workout/load/contract';

export const LOAD_SEMANTICS_VERSION = 1;
/** 저장된 뜻 설정을 읽지 못했을 때 계약의 reason */
export const SEMANTICS_UNSUPPORTED = 'semantics-unsupported';
/** 메모 길이 상한 */
export const SEMANTICS_NOTE_MAX = 200;

export type StoredLoadSemantics = {
  v: typeof LOAD_SEMANTICS_VERSION;
  overrides: SemanticOverrides;
  note?: string;
  /** 저장한 관리자 id */
  by?: string;
  /** 저장한 때(ISO) */
  at?: string;
};

/** 코드 검토 표의 한 줄(overrides.ts) — 잠금 표시 포함 */
export type CodeOverride = SemanticOverrides & { locked?: boolean };

export type ReadSemantics =
  | { kind: 'none' }
  | { kind: 'ok'; value: StoredLoadSemantics }
  | { kind: 'unsupported'; detail: string };

/** 어느 층이 이 운동의 예외를 정했나(화면 · 시험 · 인벤토리용) */
export type SemanticsSource = 'locked' | 'stored' | 'unsupported' | 'code' | 'default';

const OVERRIDE_KEYS = ['bandRole', 'use', 'fixedSupport', 'weightedVariation', 'e1rm'] as const;
const TOP_KEYS = new Set(['v', 'overrides', 'note', 'by', 'at']);

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

/* ─────────────────────────── 장비 묶음 ─────────────────────────── */

const FREE = new Set<string>(FREE_MASS_EQUIPMENT);
const INDICATED = new Set<string>(INDICATED_EQUIPMENT);
const IMPLEMENT = new Set<string>(IMPLEMENT_EQUIPMENT);
const BAND = new Set<string>(BAND_EQUIPMENT);
const SUPPORT = new Set<string>(SUPPORT_EQUIPMENT);

/** 무게로 셀 수 있는 장비(자유 중량 · 기구 · 도구) — 받침으로 돌릴 수 있는 것도 이것뿐이다 */
export function isMassEquipmentName(e: string): boolean {
  return FREE.has(e) || INDICATED.has(e) || IMPLEMENT.has(e);
}

function massFamiliesOf(equipment: readonly string[]): Set<'free' | 'indicated' | 'implement'> {
  const out = new Set<'free' | 'indicated' | 'implement'>();
  for (const e of equipment) {
    if (FREE.has(e)) out.add('free');
    else if (INDICATED.has(e)) out.add('indicated');
    else if (IMPLEMENT.has(e)) out.add('implement');
  }
  return out;
}

/** 이 장비에서 화면이 보여 줄 예외 칸 — 장비가 말하지 않는 것만(운동마다 방식을 고르는 칸을 만들지 않는다) */
export function applicableSemanticFields(
  equipment: readonly string[],
  fixedSupport: readonly string[] = []
): { bandRole: boolean; use: boolean; fixedSupport: boolean; weightedVariation: boolean } {
  const fixed = new Set(fixedSupport);
  const eq = equipment.filter((e) => !fixed.has(e));
  const hasBand = eq.some((e) => BAND.has(e));
  const families = massFamiliesOf(eq);
  return {
    bandRole: hasBand,
    use: hasBand && families.size === 1,
    fixedSupport: equipment.some(isMassEquipmentName),
    weightedVariation: !hasBand && families.size === 0,
  };
}

/* ─────────────────────────── 읽기(모양만) ─────────────────────────── */

/** 예외 묶음의 모양만 본다(장비와 맞는지는 validateSemanticOverrides). 틀리면 까닭 한 줄 */
function shapeIssue(o: unknown): string | null {
  if (!isPlainObject(o)) return 'overrides-not-object';
  for (const k of Object.keys(o)) {
    if (!(OVERRIDE_KEYS as readonly string[]).includes(k)) return `unknown-key:${k}`;
  }
  if (o.bandRole !== undefined && o.bandRole !== 'resistance' && o.bandRole !== 'assistance') return 'bandRole';
  if (o.use !== undefined && o.use !== 'combined' && o.use !== 'alternative') return 'use';
  if (o.fixedSupport !== undefined) {
    if (!Array.isArray(o.fixedSupport) || !o.fixedSupport.every((x) => typeof x === 'string' && x.length > 0)) return 'fixedSupport';
  }
  if (o.weightedVariation !== undefined && typeof o.weightedVariation !== 'boolean') return 'weightedVariation';
  if (o.e1rm !== undefined && typeof o.e1rm !== 'boolean') return 'e1rm';
  return null;
}

/** 모양이 맞는 예외 묶음을 한 가지 꼴로(받침은 정렬 · 겹침 없이, false 인 무게 더한 변형은 뺀다) */
export function canonicalOverrides(o: SemanticOverrides): SemanticOverrides {
  const out: SemanticOverrides = {};
  if (o.bandRole) out.bandRole = o.bandRole;
  if (o.use) out.use = o.use;
  if (o.fixedSupport?.length) out.fixedSupport = [...new Set(o.fixedSupport)].sort();
  if (o.weightedVariation === true) out.weightedVariation = true;
  if (typeof o.e1rm === 'boolean') out.e1rm = o.e1rm;
  return out;
}

/**
 * DB 에서 읽은 값(JSONB) → 판단. 모르는 판 · 모양 · 칸은 'unsupported'(맨몸 · 1RM 가능으로 짐작하지 않는다).
 * 장비와 맞는지는 보지 않는다 — 장비는 나중에 바뀔 수 있고, 해석기는 맞지 않는 칸을 무시한다(밴드 없는 밴드 역할 등).
 */
export function readLoadSemantics(raw: unknown): ReadSemantics {
  if (raw === null || raw === undefined) return { kind: 'none' };
  if (!isPlainObject(raw)) return { kind: 'unsupported', detail: 'not-object' };
  if (raw.v !== LOAD_SEMANTICS_VERSION) return { kind: 'unsupported', detail: `version:${String(raw.v)}` };
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) return { kind: 'unsupported', detail: `unknown-top:${k}` };
  const issue = shapeIssue(raw.overrides);
  if (issue) return { kind: 'unsupported', detail: issue };
  for (const k of ['note', 'by', 'at'] as const) {
    if (raw[k] !== undefined && typeof raw[k] !== 'string') return { kind: 'unsupported', detail: k };
  }
  const value: StoredLoadSemantics = { v: LOAD_SEMANTICS_VERSION, overrides: canonicalOverrides(raw.overrides as SemanticOverrides) };
  if (typeof raw.note === 'string') value.note = raw.note;
  if (typeof raw.by === 'string') value.by = raw.by;
  if (typeof raw.at === 'string') value.at = raw.at;
  return { kind: 'ok', value };
}

/* ─────────────────────────── 앞서는 차례(합치기) ─────────────────────────── */

const stripLock = (c: CodeOverride): SemanticOverrides => {
  const { locked: _locked, ...rest } = c;
  void _locked;
  return rest;
};

/**
 * 코드 검토 표 한 줄 + 저장된 값 → 해석기에 넘길 예외. 위 머리말의 차례 그대로(한 층이 통째로).
 * stored 가 undefined 이면 '저장 칸을 읽지 않았다'(스키마 꺼짐 · 화면)는 뜻 — 코드 표만 쓴다(예전과 같다).
 */
export function effectiveOverrides(
  code: CodeOverride | null | undefined,
  stored: ReadSemantics | undefined
): { overrides: EffectiveOverrides | null; source: SemanticsSource } {
  if (code?.locked) return { overrides: stripLock(code), source: 'locked' };
  if (stored?.kind === 'ok') {
    const o = stored.value.overrides;
    return { overrides: Object.keys(o).length ? { ...o } : null, source: 'stored' };
  }
  if (stored?.kind === 'unsupported') return { overrides: { unsupported: SEMANTICS_UNSUPPORTED }, source: 'unsupported' };
  if (code) {
    const o = stripLock(code);
    return { overrides: Object.keys(o).length ? o : null, source: 'code' };
  }
  return { overrides: null, source: 'default' };
}

/* ─────────────────────────── 검사(쓰기 전) ─────────────────────────── */

export type SemanticsIssue = { field: (typeof OVERRIDE_KEYS)[number] | 'shape' | 'note'; code: string; message: string };

export type ValidateContext = {
  exerciseId?: string | null;
  /** 저장할(또는 지금) 장비 — 쓰기와 같은 거래의 값 */
  equipment: readonly string[];
  category?: string | null;
  isHold?: boolean;
  movementPattern?: string | null;
};

export type ValidateResult =
  | { ok: true; overrides: SemanticOverrides; contract: RecordingContract }
  | { ok: false; issues: SemanticsIssue[] };

const MASS_HINT = '바벨 · 덤벨 · 케틀벨 · 원판 · 케이블 · 머신 · 메디신볼 같은 무게 장비';

/**
 * 관리자가 보낸 예외 묶음을 장비와 맞춰 본다 — 맞지 않는 조합은 무엇을 고칠지 한국어로 돌려준다(서버가 최종 판단, 화면은 미리 본다).
 * 통과하면 한 가지 꼴의 예외와 그 예외로 푼 계약(미리보기 · 되읽기와 같은 값)을 돌려준다.
 */
export function validateSemanticOverrides(raw: unknown, ctx: ValidateContext): ValidateResult {
  const issues: SemanticsIssue[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: 'shape', code: 'shape', message: '뜻 설정 모양이 맞지 않아요. 화면을 새로 고친 뒤 다시 저장해 주세요.' }] };
  }
  for (const k of Object.keys(raw)) {
    if (!(OVERRIDE_KEYS as readonly string[]).includes(k)) {
      issues.push({ field: 'shape', code: 'unknown-key', message: `알 수 없는 설정이에요(${k}). 밴드 역할 · 같이/골라 쓰기 · 받침 · 무게 더한 맨몸 · 추정 1RM 만 정할 수 있어요.` });
    }
  }
  const equipment = [...new Set(ctx.equipment.filter((e): e is string => typeof e === 'string' && e.length > 0))];
  const has = (e: string) => equipment.includes(e);

  /* 받침 */
  let fixed: string[] = [];
  if (raw.fixedSupport !== undefined) {
    if (!Array.isArray(raw.fixedSupport) || !raw.fixedSupport.every((x) => typeof x === 'string' && x.length > 0)) {
      issues.push({ field: 'fixedSupport', code: 'invalid', message: '받침으로 둘 장비를 다시 골라 주세요.' });
    } else {
      fixed = [...new Set(raw.fixedSupport as string[])];
      for (const e of fixed) {
        if (!has(e)) issues.push({ field: 'fixedSupport', code: 'not-in-equipment', message: `받침으로 둔 '${e}'이(가) 필요 장비에 없어요. 필요 장비에 넣거나 받침에서 빼 주세요.` });
        else if (SUPPORT.has(e)) issues.push({ field: 'fixedSupport', code: 'already-support', message: `'${e}'은(는) 이미 받침 장비예요. 받침에서 빼 주세요.` });
        else if (BAND.has(e)) issues.push({ field: 'fixedSupport', code: 'band-not-support', message: '밴드는 받침으로 둘 수 없어요. 밴드 역할을 골라 주세요.' });
        else if (!isMassEquipmentName(e)) issues.push({ field: 'fixedSupport', code: 'unknown-equipment', message: `'${e}'은(는) 목록에 없는 장비예요.` });
      }
    }
  }
  const rest = equipment.filter((e) => !fixed.includes(e));
  const restHasBand = rest.some((e) => BAND.has(e));
  const families = massFamiliesOf(rest);

  /* 밴드 역할 */
  if (raw.bandRole !== undefined) {
    if (raw.bandRole !== 'resistance' && raw.bandRole !== 'assistance') {
      issues.push({ field: 'bandRole', code: 'invalid', message: '밴드 역할은 저항 · 보조 중에서 골라 주세요.' });
    } else if (!restHasBand) {
      issues.push({ field: 'bandRole', code: 'no-band', message: '밴드 역할은 필요 장비에 밴드가 있을 때만 정할 수 있어요. 밴드를 넣거나 역할을 비워 주세요.' });
    }
  }

  /* 같이/골라 쓰기 */
  if (raw.use !== undefined) {
    if (raw.use !== 'combined' && raw.use !== 'alternative') {
      issues.push({ field: 'use', code: 'invalid', message: '밴드와 무게는 함께 · 골라 쓰기 중에서 골라 주세요.' });
    } else if (!restHasBand || families.size === 0) {
      issues.push({ field: 'use', code: 'needs-band-and-mass', message: `함께 · 골라 쓰기는 밴드와 ${MASS_HINT}가 같이 있을 때만 정할 수 있어요.` });
    } else if (families.size > 1) {
      issues.push({ field: 'use', code: 'multiple-mass-families', message: '무게 장비가 두 종류 넘게 섞여 있어요. 하나를 받침으로 두거나 장비를 줄여 주세요.' });
    }
  }

  /* 무게를 더한 맨몸 */
  if (raw.weightedVariation !== undefined) {
    if (typeof raw.weightedVariation !== 'boolean') {
      issues.push({ field: 'weightedVariation', code: 'invalid', message: '무게를 더한 맨몸은 켜기 · 끄기만 돼요.' });
    } else if (raw.weightedVariation) {
      if (families.size > 0) {
        issues.push({ field: 'weightedVariation', code: 'has-mass', message: `이미 ${MASS_HINT}를 드는 운동이라 '무게를 더한 맨몸'으로 볼 수 없어요. 든 무게를 그대로 적어요.` });
      } else if (restHasBand) {
        issues.push({ field: 'weightedVariation', code: 'has-band', message: "밴드 운동은 '무게를 더한 맨몸'으로 볼 수 없어요. 밴드 역할을 골라 주세요." });
      }
    }
  }

  /* 추정 1RM */
  if (raw.e1rm !== undefined && typeof raw.e1rm !== 'boolean') {
    issues.push({ field: 'e1rm', code: 'invalid', message: '추정 1RM 은 켜기 · 끄기 · 규칙대로 중에서 골라 주세요.' });
  }

  if (issues.length) return { ok: false, issues };

  const overrides = canonicalOverrides(raw as SemanticOverrides);
  const contract = resolveRecordingContract({
    exerciseId: ctx.exerciseId ?? null,
    equipment,
    category: ctx.category ?? null,
    isHold: ctx.isHold === true,
    movementPattern: ctx.movementPattern ?? null,
    overrides,
  });
  if (overrides.e1rm === true) {
    /* 골라 쓰기면 무게로 하는 변형이 1RM 을 받는다(해석기가 e1rm 을 그 변형에만 넘긴다) */
    const shape = contract.mode === 'alternative' ? (contract.variants?.find((v) => v.key === 'mass')?.contract ?? contract) : contract;
    const shapeOk = shape.readiness === 'ready' && shape.mode === 'externalMass' && shape.massBasis !== 'added' && ctx.isHold !== true;
    if (!shapeOk) {
      return {
        ok: false,
        issues: [{ field: 'e1rm', code: 'not-free-weight', message: '추정 1RM 은 바벨 · 덤벨 · 케틀벨 · 원판을 실제로 드는 운동(버티기 · 더한 무게 아님)에만 켤 수 있어요.' }],
      };
    }
  }
  return { ok: true, overrides, contract };
}

/** 저장할 값 — 검사를 통과한 예외 + 메모 · 누가 · 언제 */
export function buildStoredSemantics(
  overrides: SemanticOverrides,
  meta: { note?: string | null; by?: string | null; at?: string | null } = {}
): StoredLoadSemantics {
  const out: StoredLoadSemantics = { v: LOAD_SEMANTICS_VERSION, overrides: canonicalOverrides(overrides) };
  const note = meta.note?.trim();
  if (note) out.note = note.slice(0, SEMANTICS_NOTE_MAX);
  if (meta.by) out.by = meta.by;
  if (meta.at) out.at = meta.at;
  return out;
}

/* ─────────────────────────── 폼 → 결정 ─────────────────────────── */

/** 관리자 폼이 보내는 칸 이름(exercise-form.tsx 와 서버가 같이 쓴다) */
export const SEMANTICS_FORM = {
  /** 이 칸이 있을 때만 서버가 뜻 설정을 읽고 쓴다(고칠 수 있을 때만 화면이 넣는다) */
  marker: 'loadSemanticsEdit',
  /** 'default' = 검토 기본값으로(저장 칸 비움) · 'custom' = 이 운동만 예외 */
  mode: 'ls_mode',
  bandRole: 'ls_bandRole',
  use: 'ls_use',
  fixedSupport: 'ls_fixedSupport',
  weightedVariation: 'ls_weightedVariation',
  /** '' = 규칙대로 · 'on' · 'off' */
  e1rm: 'ls_e1rm',
  note: 'ls_note',
} as const;

export type SemanticsDecision =
  /** 폼이 뜻 설정 칸을 보내지 않았다 — 저장 칸을 건드리지 않는다 */
  | { kind: 'absent' }
  /** 검토 기본값으로 되돌린다 — 저장 칸을 비운다(NULL) */
  | { kind: 'default' }
  /** 이 운동만 예외 — 검사 전의 날것 */
  | { kind: 'custom'; raw: Record<string, unknown>; note: string | null };

/** 폼 칸 → 결정. 고를 수 있는 값만 옮긴다(검사는 validateSemanticOverrides) */
export function semanticsDecisionOf(form: { get(name: string): unknown; getAll(name: string): unknown[] }): SemanticsDecision {
  if (form.get(SEMANTICS_FORM.marker) !== '1') return { kind: 'absent' };
  const str = (n: string) => {
    const v = form.get(n);
    return typeof v === 'string' ? v.trim() : '';
  };
  if (str(SEMANTICS_FORM.mode) !== 'custom') return { kind: 'default' };
  const raw: Record<string, unknown> = {};
  const role = str(SEMANTICS_FORM.bandRole);
  if (role) raw.bandRole = role;
  const use = str(SEMANTICS_FORM.use);
  if (use) raw.use = use;
  const fixed = form.getAll(SEMANTICS_FORM.fixedSupport).filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (fixed.length) raw.fixedSupport = fixed;
  if (str(SEMANTICS_FORM.weightedVariation) === 'on') raw.weightedVariation = true;
  const e1 = str(SEMANTICS_FORM.e1rm);
  if (e1 === 'on') raw.e1rm = true;
  else if (e1 === 'off') raw.e1rm = false;
  else if (e1) raw.e1rm = e1; /* 모르는 값은 그대로 넘겨 검사가 거절하게 한다 */
  const note = str(SEMANTICS_FORM.note);
  return { kind: 'custom', raw, note: note || null };
}

/* ─────────────────────────── 쓰기 결정(권한 · 스위치 · 잠금 · 검사) ─────────────────────────── */

export type SemanticsWriteError = {
  ok: false;
  code: 'FORBIDDEN' | 'SCHEMA_OFF' | 'LOCKED' | 'INVALID';
  error: string;
  issues?: SemanticsIssue[];
};
export type SemanticsWritePlan =
  | { ok: true; write: 'none' }
  | { ok: true; write: 'clear' }
  | { ok: true; write: 'set'; value: StoredLoadSemantics; contract: RecordingContract }
  | SemanticsWriteError;

export const SCHEMA_OFF_MESSAGE = '뜻 설정 저장 칸이 아직 적용되지 않았어요. 스키마 적용 뒤에 바꿀 수 있어요.';

/**
 * 관리자 쓰기 결정 — DB 를 부르기 전에 권한 · 스위치 · 잠금 · 검사를 모두 본다. 거절이면 아무것도 쓰지 않는다.
 * 서버 동작(app/actions/content.ts)이 이것을 그대로 부르고, 결과가 'set' · 'clear' 일 때만 같은 거래 안에서 writeStoredSemantics 를 부른다.
 */
export function planSemanticsWrite(a: {
  actor: { id?: string | null; role?: string | null } | null | undefined;
  structured: boolean;
  decision: SemanticsDecision;
  code: CodeOverride | null | undefined;
  ctx: ValidateContext;
  now?: Date;
}): SemanticsWritePlan {
  if (!a.actor || a.actor.role !== 'ADMIN') return { ok: false, code: 'FORBIDDEN', error: '관리자만 뜻 설정을 바꿀 수 있어요.' };
  if (a.decision.kind === 'absent') return { ok: true, write: 'none' };
  if (!a.structured) return { ok: false, code: 'SCHEMA_OFF', error: SCHEMA_OFF_MESSAGE };
  if (a.code?.locked) return { ok: false, code: 'LOCKED', error: '검토로 잠근 운동이라 여기서 뜻 설정을 바꿀 수 없어요.' };
  if (a.decision.kind === 'default') return { ok: true, write: 'clear' };
  if (a.decision.note && a.decision.note.length > SEMANTICS_NOTE_MAX) {
    return { ok: false, code: 'INVALID', error: `메모는 ${SEMANTICS_NOTE_MAX}자까지 적을 수 있어요.`, issues: [{ field: 'note', code: 'too-long', message: `메모는 ${SEMANTICS_NOTE_MAX}자까지예요.` }] };
  }
  const v = validateSemanticOverrides(a.decision.raw, a.ctx);
  if (!v.ok) return { ok: false, code: 'INVALID', error: v.issues.map((i) => i.message).join(' '), issues: v.issues };
  const value = buildStoredSemantics(v.overrides, { note: a.decision.note, by: a.actor.id ?? null, at: (a.now ?? new Date()).toISOString() });
  return { ok: true, write: 'set', value, contract: v.contract };
}

/* ─────────────────────────── DB 도우미(부르는 쪽이 DB 를 넘긴다 · 스위치가 켜졌을 때만) ─────────────────────────── */

/** $queryRaw · $executeRaw 를 tagged template 으로 부를 수 있는 DB(PrismaClient · 거래 클라이언트) */
export type SemanticsDb = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<number>;
};

/** 저장된 뜻 설정이 있는 줄만(id → 날것). 스위치가 켜졌을 때만 부른다 */
export async function readStoredSemanticsRows(db: SemanticsDb): Promise<[string, unknown][]> {
  const rows = await db.$queryRaw<{ id: string; loadSemantics: unknown }[]>`SELECT "id", "loadSemantics" FROM "ExerciseVideo" WHERE "loadSemantics" IS NOT NULL`;
  return rows.map((r) => [r.id, r.loadSemantics]);
}

/** 한 운동의 뜻 설정을 쓴다(null = 비움). 바뀐 줄 수를 돌려준다(0 = 그 운동이 없다). 스위치가 켜졌을 때만 부른다 */
export async function writeStoredSemantics(db: SemanticsDb, exerciseId: string, value: StoredLoadSemantics | null): Promise<number> {
  if (value === null) return db.$executeRaw`UPDATE "ExerciseVideo" SET "loadSemantics" = NULL WHERE "id" = ${exerciseId}`;
  return db.$executeRaw`UPDATE "ExerciseVideo" SET "loadSemantics" = ${JSON.stringify(value)}::jsonb WHERE "id" = ${exerciseId}`;
}

/* ─────────────────────────── 화면 말 ─────────────────────────── */

export const SEMANTICS_SOURCE_LABEL: Readonly<Record<SemanticsSource, string>> = {
  locked: '검토로 잠근 예외',
  stored: '관리자가 정한 예외',
  unsupported: '읽지 못한 저장값(판 · 모양이 달라요)',
  code: '검토한 예외(코드)',
  default: '예외 없음 · 장비로 정해요',
};

export const BAND_ROLE_CHOICE: ReadonlyArray<{ value: '' | BandRole; label: string }> = [
  { value: '', label: '세트마다 골라요' },
  { value: 'resistance', label: '저항' },
  { value: 'assistance', label: '보조' },
];
