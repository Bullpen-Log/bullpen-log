/**
 * EX-LOAD01 — 장비가 정하는 기록 계약(recording contract).
 *
 * 운동에 이미 고른 장비가 '무엇을 적는가'를 정한다. 사람이 운동마다 기록 방식을 따로 고르지 않는다(사용자 2026-11-16).
 *   - 맨몸 · 받침(박스 · 벤치 · TRX · 철봉 · 짐볼)뿐 → 횟수나 시간만. kg 칸이 없다(포고 홉에 kg 이 뜨던 것).
 *   - 바벨 · 덤벨 · 케틀벨 · 원판 → 실제 든 무게 + 그 뜻(바벨은 봉 포함 합계, 덤벨 · 케틀벨은 한 손/한 개, 원판만이면 든 원판 합).
 *   - 케이블 · 머신 → 기구에 적힌 무게(스택 설정). 잰 힘이 아니고, 같은 기구끼리만 견준다.
 *   - 메디신볼 · 플라이오볼 · 워터볼 · 워터백 → 도구 하나의 무게. 1RM · 총량 없음.
 *   - 밴드 → 상표 → 제품 계열 → 단계. 임의 kg 없음. 저항인가 보조인가.
 *
 * 순수 모듈이다(서버 · 웹 · 앱이 같이 쓴다 — 앱은 tsconfig 의 '@/*' 로 이 파일을 읽는다). DB · node 모듈을 부르지 않는다.
 * 지난 기록을 보고 판단하지 않는다 — 판단 근거는 고른 장비와 검토한 예외(overrides)뿐이다. 제목으로 가르지 않는다.
 *
 * 시험: scripts/load-contract-selftest.mts
 */

import { E1RM_ALLOWLIST } from '@/lib/workout/load/e1rm-allowlist';

export const RESOLVER_VERSION = 1;
export const E1RM_RULE_VERSION = 1;

/* ─────────────────────────── 장비 묶음 ─────────────────────────── */

/** 실제로 드는 무게(자유 중량) */
export const FREE_MASS_EQUIPMENT = ['바벨', '덤벨', '케틀벨', '원판'] as const;
/** 기구가 보여 주는 무게(스택 · 설정) */
export const INDICATED_EQUIPMENT = ['케이블', '머신'] as const;
/** 던지거나 드는 도구 하나의 무게 */
export const IMPLEMENT_EQUIPMENT = ['메디신볼', '플라이오볼', '워터볼', '워터백'] as const;
export const BAND_EQUIPMENT = ['밴드'] as const;
/** 몸을 받치거나 매다는 것 — 무게가 아니다. 이것만 있는 운동은 맨몸 운동이다 */
export const SUPPORT_EQUIPMENT = ['맨몸', '박스', '스텝박스', '벤치', 'TRX', '철봉', '짐볼'] as const;

type Family = 'free' | 'indicated' | 'implement' | 'band';

const FAMILY_OF: Readonly<Record<string, Family | 'support'>> = {
  ...Object.fromEntries(FREE_MASS_EQUIPMENT.map((e) => [e, 'free'])),
  ...Object.fromEntries(INDICATED_EQUIPMENT.map((e) => [e, 'indicated'])),
  ...Object.fromEntries(IMPLEMENT_EQUIPMENT.map((e) => [e, 'implement'])),
  ...Object.fromEntries(BAND_EQUIPMENT.map((e) => [e, 'band'])),
  ...Object.fromEntries(SUPPORT_EQUIPMENT.map((e) => [e, 'support'])),
};

/* ─────────────────────────── 계약 모양 ─────────────────────────── */

export type LoadMode =
  | 'none'
  | 'externalMass'
  | 'indicatedLoad'
  | 'implementMass'
  | 'band'
  | 'combined'
  | 'alternative'
  | 'unresolved';

/** 적은 무게가 무엇을 뜻하나 */
export type MassBasis =
  /** 바벨 — 봉을 포함한 합계 */
  | 'barbellTotal'
  /** 덤벨 · 케틀벨 — 한 손(한 개)의 무게. 두 개를 들어도 두 배로 적지 않는다 */
  | 'perImplement'
  /** 원판만 — 실제로 든 원판의 합 */
  | 'platesHeld'
  /** 메디신볼 · 워터백 같은 도구 하나 */
  | 'implement'
  /** 케이블 · 머신 — 기구에 적힌 설정값(잰 힘이 아님) */
  | 'stackSetting'
  /** 검토한 '무게를 더한 맨몸 변형'(조끼 · 벨트) — 더한 무게만 */
  | 'added';

export type BandRole = 'resistance' | 'assistance';

/**
 * 장비만으로 답이 안 나오는 곳의 작은 뜻 설정(검토한 예외). 운동마다 기록 방식을 고르는 칸이 아니다 — 대부분의 운동은 비어 있다.
 */
export type SemanticOverrides = {
  /** 밴드가 버티게 하는가(저항) · 도와주는가(보조) */
  bandRole?: BandRole;
  /** 밴드와 무게를 같이 쓰는가(combined) · 둘 중 하나를 고르는가(alternative) */
  use?: 'combined' | 'alternative';
  /** 무게로 쓰지 않고 받침으로만 쓰는 장비(예: 봉을 고정 받침으로) — 무게 묶음에서 뺀다 */
  fixedSupport?: string[];
  /** 검토한 '무게를 더한 맨몸 변형' — 더한 무게(basis 'added')를 받는다 */
  weightedVariation?: boolean;
  /** 추정 1RM 을 명시적으로 켜고 끈다(규칙표보다 우선) */
  e1rm?: boolean;
};

/**
 * EX-LOAD01 R1-04 — 해석기에 넘기는 예외(semantics.ts effectiveOverrides 가 만든다). 뜻 설정 칸들 + 저장값을 읽지 못했다는 표시.
 * unsupported 가 있으면 장비로 풀지 않고 '미정'(reason 'semantics-unsupported')이다 — 맨몸 · 1RM 가능 근력으로 짐작하지 않는다.
 * 계약의 overrides 칸에는 표시를 남기지 않는다(그 까닭은 reason 에).
 */
export type EffectiveOverrides = SemanticOverrides & { unsupported?: string };

export type ContractInput = {
  /** 운동 id — 검토한 1RM 허용 목록(E1RM_ALLOWLIST)을 찾는 열쇠. 없으면 1RM 은 꺼진다 */
  exerciseId?: string | null;
  equipment: readonly string[];
  category?: string | null;
  isHold?: boolean;
  movementPattern?: string | null;
  overrides?: EffectiveOverrides | null;
};

export type ContractVariant = { key: 'band' | 'mass'; contract: RecordingContract };

export type RecordingContract = {
  resolver: typeof RESOLVER_VERSION;
  /** 판단에 쓴 장비(정렬, 겹침 없음) */
  sourceEquipment: string[];
  overrides: SemanticOverrides | null;
  mode: LoadMode;
  massBasis: MassBasis | null;
  /**
   * 케이블 · 머신일 때 그 기구 '묶음'(케이블 · 머신) — 기구 하나의 정체가 아니다. 같은 묶음이라도 기구가 다르면 설정값을 견주지 않는다:
   * 세트마다 사용자가 붙인 기구 열쇠(setup)가 있어야 견줌 열쇠가 생긴다(recorded.ts).
   */
  apparatusFamily: string | null;
  /**
   * 밴드 역할 — 검토한 예외(override)가 말할 때만 정해진다. 장비 이름 '밴드'만으로는 저항인지 보조인지 모른다(기본값을 만들지 않는다).
   * null 이면 세트마다 사람이 고르고(저항 · 보조 · 모름), 모름은 견줌 · 진행 열쇠가 없다.
   */
  bandRole: BandRole | null;
  bandRoleSource: 'override' | null;
  /** 예전 needsWeight — 무게를 안 적으면 완료로 남길 수 없는가 */
  massRequired: boolean;
  e1rmEligible: boolean;
  readiness: 'ready' | 'unresolved';
  /** unresolved · 기본값을 쓴 까닭(관리자 검토용 짧은 열쇠) */
  reason: string | null;
  /** alternative 일 때만 — 고를 수 있는 변형 */
  variants: ContractVariant[] | null;
  /** 견줌 열쇠 — 같은 열쇠끼리만 최고 · 총량 · 진행을 견준다 */
  key: string;
};

/* ─────────────────────────── 규칙 ─────────────────────────── */

/**
 * 추정 1RM 허용 목록(검토, E1RM_RULE_VERSION 1) — 운동 id. 지금 근력 프로그램이 본운동(큰 하체 · 힌지 · 밀기 · 머리 위 밀기 · 당기기)으로
 * 고르는 자유 중량 운동 가운데 장비 하나로 뜻이 정해지는 것(scripts/load-contract-inventory.mts 가 뽑은 후보 → 검토). 나머지는 다 꺼짐.
 * 채우는 곳: lib/workout/load/e1rm-allowlist.ts(인벤토리 결과를 검토해 손으로 적는다).
 */

function cleanOverrides(o: SemanticOverrides | null | undefined): SemanticOverrides | null {
  if (!o || typeof o !== 'object') return null;
  const out: SemanticOverrides = {};
  if (o.bandRole === 'resistance' || o.bandRole === 'assistance') out.bandRole = o.bandRole;
  if (o.use === 'combined' || o.use === 'alternative') out.use = o.use;
  if (Array.isArray(o.fixedSupport)) {
    const fs = [...new Set(o.fixedSupport.filter((x): x is string => typeof x === 'string'))].sort();
    if (fs.length) out.fixedSupport = fs;
  }
  if (o.weightedVariation === true) out.weightedVariation = true;
  if (typeof o.e1rm === 'boolean') out.e1rm = o.e1rm;
  return Object.keys(out).length ? out : null;
}

function keyOf(c: Pick<RecordingContract, 'mode' | 'massBasis' | 'apparatusFamily' | 'bandRole'>): string {
  return [c.mode, c.massBasis ?? '-', c.apparatusFamily ?? '-', c.bandRole ?? '-'].join(':');
}

function finish(
  base: Omit<RecordingContract, 'resolver' | 'key' | 'e1rmEligible'>,
  input: ContractInput
): RecordingContract {
  const o = base.overrides;
  /*
   * 추정 1RM — 검토한 허용 목록(E1RM_ALLOWLIST, 운동 id)이나 검토한 예외(e1rm: true)만. 범주 · 동작 이름으로 켜지 않는다.
   * 자유 중량(externalMass, 더한 무게 제외)이고 버티기가 아닐 때만 — 기구 설정값(케이블 · 머신)은 기구 정체가 없어 1RM 을 셈하지 않는다.
   */
  const shapeOk = base.readiness === 'ready' && base.mode === 'externalMass' && base.massBasis !== 'added' && !input.isHold;
  const listed = !!input.exerciseId && E1RM_ALLOWLIST.has(input.exerciseId);
  const e1rmEligible = o?.e1rm === false ? false : shapeOk && (listed || o?.e1rm === true);
  return { resolver: RESOLVER_VERSION, ...base, e1rmEligible, key: keyOf(base) };
}

function massOf(
  families: Set<Family>,
  eq: ReadonlySet<string>
): { mode: LoadMode; basis: MassBasis | null; apparatus: string | null; required: boolean; reason: string | null } | null {
  /* apparatus 는 여기서 '기구 묶음'(케이블 · 머신)이다 — 계약의 apparatusFamily */
  if (families.has('free')) {
    const bar = eq.has('바벨');
    const hand = eq.has('덤벨') || eq.has('케틀벨');
    const plate = eq.has('원판');
    const required = eq.has('바벨') || eq.has('덤벨');
    if (bar && hand) return { mode: 'unresolved', basis: null, apparatus: null, required: false, reason: 'barbell+handheld' };
    if (bar) return { mode: 'externalMass', basis: 'barbellTotal', apparatus: null, required, reason: null };
    if (hand && plate) return { mode: 'unresolved', basis: null, apparatus: null, required: false, reason: 'handheld+plate' };
    if (hand) return { mode: 'externalMass', basis: 'perImplement', apparatus: null, required, reason: null };
    return { mode: 'externalMass', basis: 'platesHeld', apparatus: null, required: false, reason: null };
  }
  if (families.has('indicated')) {
    const cable = eq.has('케이블');
    const machine = eq.has('머신');
    if (cable && machine) return { mode: 'unresolved', basis: null, apparatus: null, required: false, reason: 'cable+machine' };
    return { mode: 'indicatedLoad', basis: 'stackSetting', apparatus: cable ? '케이블' : '머신', required: false, reason: null };
  }
  if (families.has('implement')) return { mode: 'implementMass', basis: 'implement', apparatus: null, required: false, reason: null };
  return null;
}

/**
 * 장비 → 기록 계약. 같은 입력이면 늘 같은 계약이다(서버 · 웹 · 앱이 따로 셈해도 같다).
 */
export function resolveRecordingContract(input: ContractInput): RecordingContract {
  const overrides = cleanOverrides(input.overrides);
  const fixed = new Set(overrides?.fixedSupport ?? []);
  const source = [...new Set((input.equipment ?? []).filter((e): e is string => typeof e === 'string' && e.length > 0))].sort();
  const eq = new Set(source.filter((e) => !fixed.has(e)));
  const families = new Set<Family>();
  const unknown: string[] = [];
  for (const e of eq) {
    const f = FAMILY_OF[e];
    if (f === undefined) unknown.push(e);
    else if (f !== 'support') families.add(f);
  }
  const blank = {
    sourceEquipment: source,
    overrides,
    massBasis: null,
    apparatusFamily: null,
    bandRole: null,
    bandRoleSource: null,
    massRequired: false,
    variants: null,
  } as const;

  /* 저장된 뜻 설정을 읽지 못했다(모르는 판 · 모양) — 장비로 짐작하지 않고 미정. 1RM · 무게 필수도 끈다 */
  if (typeof input.overrides?.unsupported === 'string' && input.overrides.unsupported.length > 0) {
    return finish({ ...blank, overrides: null, mode: 'unresolved', readiness: 'unresolved', reason: input.overrides.unsupported }, input);
  }

  if (unknown.length) {
    return finish({ ...blank, mode: 'unresolved', readiness: 'unresolved', reason: `unknown-equipment` }, input);
  }

  const hasBand = families.has('band');
  const massFamilies = new Set([...families].filter((f) => f !== 'band'));

  /* 무게 묶음이 둘 이상(자유 중량 + 도구 등) — 장비만으로는 같이 쓰는지 고르는지 모른다 */
  if (massFamilies.size > 1) {
    return finish({ ...blank, mode: 'unresolved', readiness: 'unresolved', reason: 'multiple-mass-families' }, input);
  }

  const mass = massOf(massFamilies, eq);
  /* 역할은 검토한 예외만 정한다 — 없으면 null(세트마다 사람이 고름). 받침 장비는 이 판단을 바꾸지 않는다 */
  const role: BandRole | null = overrides?.bandRole ?? null;
  const roleSource = overrides?.bandRole ? ('override' as const) : null;

  if (!hasBand) {
    if (!mass) {
      /* 맨몸 · 받침뿐 — 검토한 '무게를 더한 맨몸 변형'만 더한 무게를 받는다 */
      if (overrides?.weightedVariation) {
        return finish({ ...blank, mode: 'externalMass', massBasis: 'added', readiness: 'ready', reason: null }, input);
      }
      return finish({ ...blank, mode: 'none', readiness: 'ready', reason: null }, input);
    }
    if (mass.mode === 'unresolved') return finish({ ...blank, mode: 'unresolved', readiness: 'unresolved', reason: mass.reason }, input);
    return finish(
      { ...blank, mode: mass.mode, massBasis: mass.basis, apparatusFamily: mass.apparatus, massRequired: mass.required, readiness: 'ready', reason: null },
      input
    );
  }

  /* 밴드뿐 */
  if (!mass) {
    return finish(
      { ...blank, mode: 'band', bandRole: role, bandRoleSource: roleSource, readiness: 'ready', reason: role ? null : 'band-role-per-set' },
      input
    );
  }
  if (mass.mode === 'unresolved') return finish({ ...blank, mode: 'unresolved', readiness: 'unresolved', reason: mass.reason }, input);

  /* 밴드 + 무게 하나 — 같이(combined) 쓰는지 하나를 고르는지(alternative)는 검토한 설정만이 말한다 */
  if (overrides?.use === 'combined') {
    return finish(
      {
        ...blank,
        mode: 'combined',
        massBasis: mass.basis,
        apparatusFamily: mass.apparatus,
        bandRole: role,
        bandRoleSource: roleSource,
        massRequired: mass.required,
        readiness: 'ready',
        reason: role ? null : 'band-role-per-set',
      },
      input
    );
  }
  if (overrides?.use === 'alternative') {
    /* 밴드로 하는 변형 = 무게 장비를 뺀 것, 무게로 하는 변형 = 밴드를 뺀 것. 각자 같은 규칙으로 다시 푼다 */
    const bandOnly = resolveRecordingContract({ ...input, equipment: source.filter((e) => !isMassEquipment(e)), overrides: { ...(overrides.bandRole ? { bandRole: overrides.bandRole } : {}), ...(overrides.fixedSupport ? { fixedSupport: overrides.fixedSupport } : {}) } });
    const massOnly = resolveRecordingContract({ ...input, equipment: source.filter((e) => e !== '밴드'), overrides: { ...(overrides.e1rm != null ? { e1rm: overrides.e1rm } : {}), ...(overrides.fixedSupport ? { fixedSupport: overrides.fixedSupport } : {}) } });
    return finish(
      {
        ...blank,
        mode: 'alternative',
        readiness: 'ready',
        reason: null,
        variants: [
          { key: 'band', contract: bandOnly },
          { key: 'mass', contract: massOnly },
        ],
      },
      input
    );
  }
  return finish({ ...blank, mode: 'unresolved', readiness: 'unresolved', reason: 'band+mass-needs-use' }, input);
}

function isMassEquipment(e: string): boolean {
  const f = FAMILY_OF[e];
  return f === 'free' || f === 'indicated' || f === 'implement';
}

/** 고른 변형의 계약 — alternative 가 아니면 그대로. 모르는 변형이면 null(받지 않는다) */
export function contractForVariant(c: RecordingContract, variant: string | null | undefined): RecordingContract | null {
  if (c.mode !== 'alternative') return variant == null ? c : null;
  if (variant == null) return null;
  return c.variants?.find((v) => v.key === variant)?.contract ?? null;
}

/* ─────────────────────────── 모드 묻기 ─────────────────────────── */

export const MASS_MODES: ReadonlySet<LoadMode> = new Set(['externalMass', 'indicatedLoad', 'implementMass']);

/** 이 계약이 kg 숫자를 받는가(combined 는 무게 성분을 받는다) */
export function acceptsMass(c: RecordingContract): boolean {
  return MASS_MODES.has(c.mode) || c.mode === 'combined';
}

/** 이 계약이 밴드를 받는가 */
export function acceptsBand(c: RecordingContract): boolean {
  return c.mode === 'band' || c.mode === 'combined';
}

/** kg 총량(무게 × 횟수)과 '가장 무거운 무게' 최고 기록에 넣는가 — 자유 중량과 같은 기구의 설정값만 */
export function countsTonnage(c: RecordingContract): boolean {
  return c.readiness === 'ready' && (c.mode === 'externalMass' || c.mode === 'indicatedLoad');
}

/* ───────────────────── 옛 판단의 호환 투영(경쟁 규칙 없음) ───────────────────── */

const byEquipment = (equipment: readonly string[]) => resolveRecordingContract({ equipment });

/** 예전 usesWeight — 무게 숫자를 받는 장비인가(이제 계약에서 나온다: 케이블도 받는다) */
export function contractUsesWeight(equipment: readonly string[]): boolean {
  return MASS_MODES.has(byEquipment(equipment).mode);
}

/** 예전 needsWeight — 무게를 안 적으면 완료로 남길 수 없는가(바벨 · 덤벨) */
export function contractNeedsWeight(equipment: readonly string[]): boolean {
  return byEquipment(equipment).massRequired;
}

export type ProgramWeightKind = 'barbell' | 'dumbbell' | 'machine' | 'none';

/**
 * 예전 next-weight weightKindOf — 프로그램 무게 단위. 바벨 · 원판 → barbell, 덤벨 · 케틀벨 → dumbbell, 케이블 → machine,
 * 그 밖(머신 · 밴드 · 섞임 · 모름 · 맨몸 · 도구)은 none. 머신을 none 으로 두는 것은 예전과 같다(프로그램은 머신을 안 쓴다).
 */
export function contractWeightKind(equipment: readonly string[]): ProgramWeightKind {
  const c = byEquipment(equipment);
  if (c.mode === 'externalMass') {
    if (c.massBasis === 'barbellTotal' || c.massBasis === 'platesHeld') return 'barbell';
    if (c.massBasis === 'perImplement') return 'dumbbell';
    return 'none';
  }
  if (c.mode === 'indicatedLoad' && c.apparatusFamily === '케이블') return 'machine';
  return 'none';
}

/* ─────────────────────────── 화면 말 ─────────────────────────── */

export const BASIS_LABEL: Readonly<Record<MassBasis, { ko: string; en: string; ja: string }>> = {
  barbellTotal: { ko: '봉 포함 합계', en: 'Total incl. bar', ja: 'バー込み合計' },
  perImplement: { ko: '한 손 · 한 개', en: 'Per hand / each', ja: '片手・1個' },
  platesHeld: { ko: '든 원판 합계', en: 'Plates held', ja: '持ったプレート合計' },
  implement: { ko: '도구 무게', en: 'Implement mass', ja: '用具の重さ' },
  stackSetting: { ko: '기구 설정값', en: 'Machine setting', ja: 'マシン設定値' },
  added: { ko: '더한 무게', en: 'Added load', ja: '追加重量' },
};

/** 무게 칸 이름 — '무게(한 손)' · '케이블 머신 설정값' 처럼. 기구 값은 잰 힘이라고 말하지 않는다 */
export function massFieldLabel(c: RecordingContract, displayApparatus: (name: string) => string = (n) => n): string {
  switch (c.massBasis) {
    case 'barbellTotal':
      return '무게(봉 포함)';
    case 'perImplement':
      return '무게(한 손 · 한 개)';
    case 'platesHeld':
      return '무게(든 원판 합)';
    case 'implement':
      return '도구 무게';
    case 'stackSetting':
      return `${displayApparatus(c.apparatusFamily ?? '기구')} 설정값`;
    case 'added':
      return '더한 무게';
    default:
      return '무게';
  }
}

export const BAND_ROLE_LABEL: Readonly<Record<BandRole, string>> = { resistance: '저항 밴드', assistance: '보조 밴드' };
