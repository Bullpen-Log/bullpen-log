/**
 * EX-LOAD01-R1(R1-02) — 판(세션) 안의 '내 목표' 가운데 장비 목표(load target). 순수 — 서버 · 웹 · 앱 · 시험이 같이 쓴다.
 *
 * 세트에 남긴 무게(RecordedLoad, 한 것)와 같은 모양 · 같은 정규화(normalizeSetLoad)를 쓰지만 **다른 것**이다:
 *   - 목표(이 판 · 이 운동에서 하려는 것) — 판 JSON 의 userTarget.load(r1)와 목표 판 스냅샷의 override.load(v2)에 산다. 새 DB 칸이 없어
 *     구조화 스키마가 꺼져 있어도(schema-off) 저장된다. 세트 기록에 밴드가 저장됐다는 뜻은 아니다.
 *   - 한 것(남긴 세트) — UserExerciseSet. 목표를 바꿔도 이미 남긴 세트는 그대로다.
 *
 * 받는 규칙(EX-LOAD01-R1-claude-outbox.md §2.2 그대로).
 *   - 권위는 판에 얼린 계약(FrozenExercise.load ?? contractOfFrozen) — 화면이 말한 '받을 수 있다'를 믿지 않는다.
 *   - status 'ok' 만 받는다(모르는 밴드 · 밴드 없음 · none 은 목표가 아니다). 밴드를 kg 으로 바꾸지 않는다.
 *   - 옛 kg 칸은 무게 성분 하나의 투영(projectWeightKg)뿐. 같이 온 kg 이 투영과 다르면 TARGET_LOAD_CONFLICT.
 *   - 부품 · 기구 이름 없는 순수 무게는 장비 목표로 남기지 않고 kg 숫자 하나로 접는다(표현이 하나뿐이게).
 *   - 다른 판(v · 해석기 · 카탈로그)의 저장 값은 'unsupported' — 쓰지도 지우지도 않는다('다른 앱 버전에서 저장한 목표').
 *   - 통증 날: 밴드가 들어간 바꿈은 세기 차례를 모르니(색 · 단계로 차례를 지어내지 않는다) 늘 막는다. 무게는 추천 이하만.
 */

import { storedKg } from '@/lib/exercise-meta';
import { BAND_CATALOG_REVISION, bandText, cleanBandComponent, type BandComponent } from '@/lib/workout/load/band-catalog';
import {
  BAND_ROLE_LABEL,
  RESOLVER_VERSION,
  acceptsBand,
  contractForVariant,
  type RecordingContract,
} from '@/lib/workout/load/contract';
import { contractOfFrozen } from '@/lib/workout/load/frozen';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import {
  normalizeSetLoad,
  projectWeightKg,
  readRecordedLoad,
  type BandRoleRecorded,
  type MassLoad,
  type RecordedLoad,
} from '@/lib/workout/load/recorded';

export const LOAD_TARGET_VERSION = 1 as const;

export type TargetLoadValue = Exclude<RecordedLoad, { kind: 'none' }>;

/** 저장되는 장비 목표 — 판(v) · 해석기 · 카탈로그 판을 같이 얼린다(다른 판이면 쓰지 않는다) */
export type LoadTarget = {
  v: typeof LOAD_TARGET_VERSION;
  resolver: number;
  catalog: string;
  /** alternative 계약에서 고른 변형. 그 밖에는 null */
  variant: 'band' | 'mass' | null;
  load: TargetLoadValue;
};

/** 화면이 보내는 장비 목표 — RecordedLoad 모양의 load 와(고르는 운동이면) 변형 */
export type LoadTargetInput = { variant?: 'band' | 'mass' | null; load: unknown };

export type LoadTargetCode =
  | 'TARGET_LOAD_VERSION'
  | 'TARGET_LOAD_INVALID'
  | 'TARGET_LOAD_NOT_ALLOWED'
  | 'TARGET_LOAD_CONFLICT'
  | 'TARGET_LOAD_REQUIRED';

export type LoadTargetError = { ok: false; code: LoadTargetCode; error: string };

export const LOAD_TARGET_TEXT: Readonly<Record<LoadTargetCode, string>> = {
  TARGET_LOAD_VERSION: '이 장비 목표는 다른 앱 버전의 방식이에요. 앱을 업데이트한 뒤 다시 정해 주세요.',
  TARGET_LOAD_INVALID: '장비 목표 값이 올바르지 않아요. 다시 골라 주세요.',
  TARGET_LOAD_NOT_ALLOWED: '이 운동은 장비 목표를 정하지 않아요.',
  TARGET_LOAD_CONFLICT: '무게 목표와 장비 목표가 서로 달라요. 장비 목표에서 다시 정해 주세요.',
  TARGET_LOAD_REQUIRED: '밴드로 할지 무게로 할지 골라 주세요.',
};

/** 다른 판의 앱이 저장한 장비 목표 — 쓰지도 지우지도 않고 알린다 */
export const LOAD_TARGET_UNSUPPORTED_TEXT = '다른 앱 버전에서 저장한 목표가 있어요. 이 화면에서는 쓰지 않고 그대로 둬요.';

/** 통증 날 장비 목표 — 밴드는 세기 차례를 정하지 않으니 바꾸지 않는다 */
export const PAIN_NO_LOAD_TARGET_TEXT =
  '오늘 체크인에 통증이 있어 밴드 · 장비 목표를 새로 정하거나 바꿀 수 없어요. 밴드는 세기를 차례로 견주지 않아요. 지우는 것은 돼요.';

const err = (code: LoadTargetCode, error?: string): LoadTargetError => ({ ok: false, code, error: error ?? LOAD_TARGET_TEXT[code] });

/** 무게 · 횟수를 적지 않는 분류(target-override.ts NO_LOAD_CATEGORIES 와 같다) */
const NO_LOAD_CATEGORIES = new Set(['모빌리티', '워밍업']);

/** 목표를 셀 때 필요한 운동의 성질(TargetSubject 의 일부) */
export type LoadTargetSubject = {
  id?: string;
  category: string;
  isHold: boolean;
  equipment: readonly string[];
  programSlot?: unknown;
  load?: RecordingContract | null;
};

/** 권위 계약 — 판에 얼린 것, 없으면 그 판의 장비로 다시 푼 것(세트 기록과 같은 길). 운동 번호도 없으면(화면이 만든 옛 모양) null */
export function targetContractOf(ex: LoadTargetSubject): RecordingContract | null {
  if (ex.load) return ex.load;
  if (!ex.id) return null;
  return contractOfFrozen({ id: ex.id, equipment: ex.equipment, category: ex.category, isHold: ex.isHold });
}

/**
 * 장비 목표를 받는 운동인가 — kg 숫자 하나로는 말이 안 되는 것만: 밴드가 들어가는 운동(밴드 · 섞임), 밴드/무게 중 고르기, 케이블 · 머신의
 * 기구 이름, 덤벨 · 케틀벨의 양손 다른 무게. 프로그램 칸은 kg 처럼 바꾸지 않는다(프로그램이 정한다).
 */
export function loadTargetEditable(ex: LoadTargetSubject): boolean {
  if (ex.programSlot) return false;
  if (NO_LOAD_CATEGORIES.has(ex.category)) return false;
  const c = targetContractOf(ex);
  if (!c) return false;
  if (c.mode === 'alternative') return true;
  if (acceptsBand(c)) return true;
  if (c.mode === 'indicatedLoad' && c.massBasis === 'stackSetting') return true;
  if (c.mode === 'externalMass' && c.massBasis === 'perImplement') return true;
  return false;
}

/** 정규화 결과 — target null 이면 kg 숫자 하나로 접힌 순수 무게(kg 만 쓴다) */
export type LoadTargetOk = { ok: true; target: LoadTarget | null; kg: number | null };

const MAP_CODE: Record<string, LoadTargetCode> = {
  LOAD_VERSION: 'TARGET_LOAD_VERSION',
  LOAD_CONFLICT: 'TARGET_LOAD_CONFLICT',
  LOAD_NOT_ALLOWED: 'TARGET_LOAD_NOT_ALLOWED',
  LOAD_REQUIRED: 'TARGET_LOAD_REQUIRED',
  LOAD_INVALID: 'TARGET_LOAD_INVALID',
  LOAD_UNSUPPORTED: 'TARGET_LOAD_INVALID',
};

/**
 * 받은 장비 목표를 권위 계약으로 정규화한다. kgAlongside: 같이 온 kg 숫자(없음 · null 이면 보지 않는다) — 투영과 다르면 충돌.
 * 세트 정규화(normalizeSetLoad)를 structured:true 로 그대로 쓴다(목표는 판 JSON 이라 새 칸이 필요 없다).
 */
export function normalizeLoadTarget(input: unknown, contract: RecordingContract, kgAlongside?: number | null): LoadTargetOk | LoadTargetError {
  if (!input || typeof input !== 'object') return err('TARGET_LOAD_INVALID');
  const i = input as { variant?: unknown; load?: unknown };
  if (contract.mode === 'none' || contract.mode === 'unresolved') return err('TARGET_LOAD_NOT_ALLOWED');
  let variant: 'band' | 'mass' | null = null;
  if (contract.mode === 'alternative') {
    variant = i.variant === 'band' || i.variant === 'mass' ? i.variant : null;
    if (!variant) return err('TARGET_LOAD_REQUIRED');
  } else if (i.variant != null) {
    return err('TARGET_LOAD_INVALID', '이 운동에는 고를 변형이 없어요.');
  }
  if (!i.load || typeof i.load !== 'object') return err('TARGET_LOAD_INVALID');
  const r = normalizeSetLoad({
    hasProtocol: true,
    protocol: LOAD_PROTOCOL,
    resolver: RESOLVER_VERSION,
    contract,
    variant,
    weightKg: null,
    hasLoad: true,
    load: i.load,
    structured: true,
  });
  if (!r.ok) return err(MAP_CODE[r.code] ?? 'TARGET_LOAD_INVALID', r.code === 'LOAD_VERSION' ? undefined : r.error);
  if (r.status === 'unknownBand') return err('TARGET_LOAD_INVALID', '목표로 쓸 밴드를 골라 주세요.');
  if (r.status !== 'ok') return err('TARGET_LOAD_INVALID');
  const load = r.load;
  if (!load || load.kind === 'none') return err('TARGET_LOAD_INVALID', '목표로 쓸 장비를 골라 주세요.');
  const kg = projectWeightKg(load);
  if (kgAlongside != null && (typeof kgAlongside !== 'number' || !Number.isFinite(kgAlongside) || storedKg(kgAlongside) !== kg))
    return err('TARGET_LOAD_CONFLICT');
  /* 부품 · 기구 이름 없는 순수 무게 — kg 숫자 하나로(장비 목표를 따로 두지 않는다) */
  if (load.kind === 'mass' && !load.parts && !load.setup) return { ok: true, target: null, kg };
  return { ok: true, target: { v: LOAD_TARGET_VERSION, resolver: RESOLVER_VERSION, catalog: BAND_CATALOG_REVISION, variant, load }, kg };
}

/**
 * 저장된 값 읽기 — 없음(null) · 이 판의 장비 목표 · 모르는 판/모양('unsupported'). 'unsupported' 는 쓰지 않고 지우지도 않는다.
 * 계약에 맞는지는 loadTargetState 가 따로 본다.
 */
export function readLoadTarget(raw: unknown): LoadTarget | 'unsupported' | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') return 'unsupported';
  const o = raw as Record<string, unknown>;
  if (o.v !== LOAD_TARGET_VERSION || o.resolver !== RESOLVER_VERSION || o.catalog !== BAND_CATALOG_REVISION) return 'unsupported';
  const variant = o.variant == null ? null : o.variant === 'band' || o.variant === 'mass' ? o.variant : undefined;
  if (variant === undefined) return 'unsupported';
  const load = readRecordedLoad(o.load);
  if (!load || load.kind === 'none') return 'unsupported';
  const bands = load.kind === 'band' ? load.bands : load.kind === 'combined' ? load.band.bands : [];
  for (const b of bands) if (!cleanBandComponent(b)) return 'unsupported';
  return { v: LOAD_TARGET_VERSION, resolver: RESOLVER_VERSION, catalog: BAND_CATALOG_REVISION, variant, load };
}

/** 저장된 값을 이 운동의 계약으로 — 쓸 수 있는 목표 · 다른 판이라 안 쓰는 것(unsupported) · 없음 */
export function loadTargetState(raw: unknown, contract: RecordingContract | null): { target: LoadTarget | null; unsupported: boolean } {
  const t = readLoadTarget(raw);
  if (t === null) return { target: null, unsupported: false };
  if (t === 'unsupported' || !contract) return { target: null, unsupported: true };
  const re = normalizeLoadTarget({ variant: t.variant, load: t.load }, contract, undefined);
  if (!re.ok || !re.target) return { target: null, unsupported: true };
  return { target: re.target, unsupported: false };
}

/** 키 차례에 상관없는 같은 값 견주기(같은 목표인가) */
function stable(v: unknown): string {
  if (v === undefined) return 'u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

export function sameLoadTarget(a: unknown, b: unknown): boolean {
  return stable(a ?? null) === stable(b ?? null);
}

export function loadTargetMass(t: LoadTarget): MassLoad | null {
  return t.load.kind === 'mass' ? t.load : t.load.kind === 'combined' ? t.load.mass : null;
}

export function loadTargetInvolvesBand(t: LoadTarget): boolean {
  return t.load.kind === 'band' || t.load.kind === 'combined';
}

/** 무게 성분의 가장 큰 kg(양손 다르면 무거운 쪽). 무게 성분이 없으면 null */
export function loadTargetMaxKg(t: LoadTarget): number | null {
  const m = loadTargetMass(t);
  if (!m) return null;
  if (m.parts && m.parts.length) return Math.max(...m.parts.map((p) => p.kg));
  return m.kg;
}

/**
 * 통증 날 이 목표가 '올림'일 수 있는가 — 밴드가 들어가면 차례를 모르니 늘 그렇다고 본다(색 · 단계로 지어내지 않는다).
 * 무게만이면 추천 이하일 때만 아니다. 추천이 없으면 새로 정할 수 없다(숫자 칸과 같은 규칙).
 */
export function loadTargetUnsafeUnderPain(t: LoadTarget, recommendedKg: number | null): boolean {
  if (loadTargetInvolvesBand(t)) return true;
  const k = loadTargetMaxKg(t);
  return k == null || recommendedKg == null || k > recommendedKg;
}

/**
 * 옛 화면이 kg 숫자만 고쳤다(장비 목표를 모르는 화면) — 같은 무게 하나(parts 없음)면 그 무게만 바꾸고 밴드 · 기구 이름은 그대로.
 * 무게 성분 없는 섞임은 무게 성분을 더한다. 양손 다른 무게 · 밴드만 · 밴드 변형이면 충돌(조용히 하나를 고르지 않는다).
 */
export function patchLoadTargetKg(t: LoadTarget, kg: number, contract: RecordingContract): LoadTarget | LoadTargetError {
  const c = t.variant ? contractForVariant(contract, t.variant) : contract;
  if (!c) return err('TARGET_LOAD_CONFLICT');
  let load: TargetLoadValue;
  if (t.load.kind === 'mass') {
    if (t.load.parts) return err('TARGET_LOAD_CONFLICT', '양손 무게가 다른 목표라 무게 하나로 바꿀 수 없어요. 장비 목표에서 다시 정해 주세요.');
    load = { ...t.load, kg };
  } else if (t.load.kind === 'combined') {
    const m = t.load.mass;
    if (m?.parts) return err('TARGET_LOAD_CONFLICT', '양손 무게가 다른 목표라 무게 하나로 바꿀 수 없어요. 장비 목표에서 다시 정해 주세요.');
    if (!c.massBasis) return err('TARGET_LOAD_CONFLICT');
    load = {
      kind: 'combined',
      mass: m ? { ...m, kg } : { basis: c.massBasis, apparatusFamily: c.apparatusFamily, setup: null, kg, parts: null },
      band: t.load.band,
    };
  } else {
    return err('TARGET_LOAD_CONFLICT');
  }
  const re = normalizeLoadTarget({ variant: t.variant, load }, contract, kg);
  if (!re.ok) return re;
  if (!re.target) return err('TARGET_LOAD_CONFLICT');
  return re.target;
}

/* ─────────────────────────── 한 번에 고치기(r1 · v2 공통) ─────────────────────────── */

/** 장비 목표에 대한 요청 — 그대로(칸 없음) · 지움(loadV:1 + null/follow) · 정함 */
export type LoadOp = { op: 'keep' } | { op: 'clear' } | { op: 'set'; input: unknown };
/** 같이 온 kg 숫자 — 없음(r1 은 따름과 같다) · 정함 · 따름(추천으로) */
export type KgOp = { op: 'absent' } | { op: 'set'; kg: number } | { op: 'follow' };

export type LoadPatchOk = {
  ok: true;
  /** 판에 남길 장비 목표(그대로 옮기는 다른 판의 값일 수도 있다). undefined = 없음 */
  load: unknown;
  /** kg 숫자 칸의 결과 — 'asInput' 이면 부르는 쪽의 숫자 규칙 그대로, 숫자 · null 이면 투영(null = kg 칸 없음) */
  kg: number | null | 'asInput';
  /** 장비 목표가 실제로 바뀌었는가(통증 검사 · 바뀐 칸) */
  loadChanged: boolean;
  /** kg 이 바꾸지 않은 장비 목표의 투영에서 왔는가 — 통증 날에도 '새로 올린 칸'이 아니다 */
  kgFromKeptLoad: boolean;
};

/**
 * 앞 목표(prevRaw) + 요청 → 다음 장비 목표와 kg 칸. r1(checkTargetInput) · v2(applyTargetPatch)가 같은 규칙을 쓴다.
 * - keep: 다른 판의 값은 그대로 옮긴다. 이 판의 목표에 kg 만 오면 같은 무게 하나를 바꾸거나 충돌. kg 따름(빈 칸)은 옛 화면이
 *   '안 건드림'과 구별하지 못하므로 목표를 그대로 두고 kg 은 투영으로 둔다(현대 목표를 모호한 신호로 바꾸지 않는다).
 * - clear: 지운다(kg 은 받은 그대로).
 * - set: 정규화한다. kg 은 그 투영(순수 무게로 접히면 그 kg).
 */
export function applyLoadPatch(a: {
  prevRaw: unknown;
  op: LoadOp;
  kgOp: KgOp;
  contract: RecordingContract | null;
  editable: boolean;
  /** 프로그램 칸이면 막는 글 */
  lockText?: string | null;
}): LoadPatchOk | LoadTargetError {
  const { prevRaw, op, kgOp, contract } = a;
  if (op.op === 'clear') {
    return { ok: true, load: undefined, kg: 'asInput', loadChanged: prevRaw !== undefined && prevRaw !== null, kgFromKeptLoad: false };
  }
  if (op.op === 'set') {
    if (!a.editable || !contract) return err('TARGET_LOAD_NOT_ALLOWED', a.lockText ?? undefined);
    const kgAlongside = kgOp.op === 'set' ? kgOp.kg : undefined;
    const r = normalizeLoadTarget(op.input, contract, kgAlongside);
    if (!r.ok) return r;
    const load = r.target ?? undefined;
    return { ok: true, load, kg: r.kg, loadChanged: !sameLoadTarget(prevRaw, load), kgFromKeptLoad: false };
  }
  /* keep */
  if (prevRaw === undefined || prevRaw === null) return { ok: true, load: undefined, kg: 'asInput', loadChanged: false, kgFromKeptLoad: false };
  const st = loadTargetState(prevRaw, contract);
  if (!st.target) return { ok: true, load: prevRaw, kg: 'asInput', loadChanged: false, kgFromKeptLoad: false };
  const t = st.target;
  const p = projectWeightKg(t.load);
  if (kgOp.op === 'set' && kgOp.kg !== p) {
    const next = patchLoadTargetKg(t, kgOp.kg, contract!);
    if ('ok' in next) return next;
    return { ok: true, load: next, kg: kgOp.kg, loadChanged: true, kgFromKeptLoad: false };
  }
  return { ok: true, load: prevRaw, kg: p, loadChanged: false, kgFromKeptLoad: true };
}

/* ─────────────────────────── 화면 말 ─────────────────────────── */

const roleWord = (role: BandRoleRecorded) => (role === 'unknown' ? '역할 모름' : BAND_ROLE_LABEL[role]);

/** 장비 목표 한 줄 — '20kg + 저항 밴드 · 노랑 · …' · '왼손 12kg · 오른손 10kg' · '15kg · 2층 케이블 왼쪽' */
export function loadTargetText(t: LoadTarget, fmt: (kg: number) => string = (kg) => `${kg}kg`): string {
  const massText = (m: MassLoad | null): string | null => {
    if (!m) return null;
    const head =
      m.parts && m.parts.length
        ? m.parts.map((p) => `${p.side === 'left' ? '왼손 ' : p.side === 'right' ? '오른손 ' : ''}${fmt(p.kg)}${p.count && p.count > 1 ? ` × ${p.count}개` : ''}`).join(' · ')
        : m.kg != null
          ? fmt(m.kg)
          : null;
    return [head, m.setup?.label ?? null].filter(Boolean).join(' · ') || null;
  };
  const bandPart = (role: BandRoleRecorded, bands: readonly BandComponent[]) => `${roleWord(role)} · ${bands.map((b) => bandText(b)).join(' + ')}`;
  if (t.load.kind === 'band') return bandPart(t.load.role, t.load.bands);
  if (t.load.kind === 'mass') return massText(t.load) ?? '무게';
  const m = massText(t.load.mass);
  const b = bandPart(t.load.band.role, t.load.band.bands);
  return m ? `${m} + ${b}` : b;
}

/* ─────────────────────────── 다음 세트 칸 채우기 ─────────────────────────── */

/** 장비 목표 → 다음 세트 칸의 값(웹 · 앱이 제 모양으로 옮긴다) */
export type LoadTargetSeed = {
  variant: 'band' | 'mass' | null;
  role: BandRoleRecorded | null;
  bands: BandComponent[];
  setupLabel: string;
  unequal: boolean;
  leftKg: number | null;
  rightKg: number | null;
  /** 같은 무게 하나일 때의 kg(투영) */
  kg: number | null;
};

export function seedOfLoadTarget(t: LoadTarget): LoadTargetSeed {
  const band = t.load.kind === 'band' ? t.load : t.load.kind === 'combined' ? t.load.band : null;
  const m = loadTargetMass(t);
  const left = m?.parts?.find((p) => p.side === 'left') ?? null;
  const right = m?.parts?.find((p) => p.side === 'right') ?? null;
  return {
    variant: t.variant,
    role: band ? band.role : null,
    bands: band ? [...band.bands] : [],
    setupLabel: m?.setup?.label ?? '',
    unequal: !!(left && right),
    leftKg: left?.kg ?? null,
    rightKg: right?.kg ?? null,
    kg: projectWeightKg(t.load),
  };
}

export type LoadDraftSource = 'draft' | 'target' | 'memory' | 'previous' | 'empty';

/**
 * 다음 세트 칸을 무엇으로 채우나 — 사람이 고치던 칸(draft) > 내가 정한 목표(target) > 이 기기의 지난 고름(memory) > 지난 세트(previous).
 * 목표는 손대지 않은 칸만 채우고, 고치던 칸 · 남긴 세트는 바꾸지 않는다. 기기 기억은 맞는 목표가 있으면 이기지 못한다.
 */
export function pickLoadDraftSource(a: { touched: boolean; target: boolean; memory: boolean; previous: boolean }): LoadDraftSource {
  if (a.touched) return 'draft';
  if (a.target) return 'target';
  if (a.memory) return 'memory';
  if (a.previous) return 'previous';
  return 'empty';
}
