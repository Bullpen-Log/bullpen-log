/**
 * EX-LOAD01 — 세트에 남기는 무게(RecordedLoad)와 하나뿐인 정규화(normalizeSetLoad).
 *
 * ■ kg 의 주인은 하나
 *   정규화가 낸 무게 성분이 유일한 kg 이다. 옛 칸 UserExerciseSet.weightKg 는 그 투영(projectWeightKg) — 무게(mass)와 섞임(combined)의
 *   무게 성분이 한 숫자로 말해질 때(같은 무게 도구들 · 바벨 합계 · 기구 설정값)만 그 kg, 서로 다른 무게 도구 · 밴드 · 없음이면 null.
 *   모든 쓰기(세트 남기기 · v2 명령 · 코치 기록)가 이 함수를 지난다. weightKg 와 구조화한 무게를 같이 보내고 둘이 다르면 거절한다.
 *
 * ■ 서로 다른 무게의 도구(unequal implements)
 *   덤벨 두 개가 다르면 한 kg 으로 말하지 않는다 — parts 에 무게 · 개수 · 쪽(왼 · 오)을 그대로. 평균 · 두 배 · 합치기를 하지 않고, 합계는
 *   개수를 아는 때만 knownTotalKg 로 따로 이름 붙여 셈한다.
 *
 * ■ 기구(케이블 · 머신)
 *   계약의 apparatusFamily 는 묶음일 뿐이다. 세트에 사용자가 붙인 기구 열쇠(setup)가 있어야 같은 기구끼리 견줄 수 있다(읽기 관문).
 *   모르면 기록은 되지만 최고 · 총량 · 1RM 견줌은 없다.
 *
 * ■ 밴드 역할
 *   계약이 역할을 정했으면(검토한 예외) 그대로, 아니면 세트마다 저항 · 보조 · 모름. 모름은 견줌 열쇠가 없다.
 *
 * ■ 없음(absent)과 지움(null)은 다르다
 *   요청에 load 칸이 없으면 이미 있는 밴드 · 섞인 무게를 그대로 둔다(RIR 만 고친 것 · 옛 앱의 재전송). load: null 은 '무게 없음'으로 지운다
 *   — 계약이 무게를 꼭 요구하지 않을 때만.
 *
 * ■ 옛 앱(loadProtocol 없음)
 *   장비가 받지 않는 kg(맨몸 운동의 kg 등)을 거절하지 않는다(옛 대기열은 거절된 세트를 지운다).
 *   - 구조화 저장이 켜져 있으면(enforce): 정식 세트는 횟수 · 시간만, kg 은 같은 거래의 복구 기록(원래 요청 그대로 · 지문)으로(recover).
 *   - 꺼져 있으면(지금 운영): **옛 쓰기를 한 글자도 바꾸지 않는다**(legacyUnchanged) — 원래 kg 이 그대로 옛 칸에 남는다. 이것을 '새 정규화로
 *     저장했다'고 말하지 않는다(답에 loadAck 를 싣지 않는다). 읽기는 얼린 계약으로 그 kg 을 계산에서 뺀다. 정식 정규화 + 원본 보존은
 *     스키마 적용이 필요한 출시 차단 항목이다(전달 문서).
 *
 * 순수 모듈 — 서버 · 웹 · 앱이 같이 쓴다(앱은 담기 전에 같은 검사를 먼저 한다).
 */

import { AMOUNT_LIMITS, storedKg } from '@/lib/exercise-meta';
import { BAND_CATALOG_REVISION, cleanBandComponent, MAX_BANDS, type BandComponent } from '@/lib/workout/load/band-catalog';
import {
  RESOLVER_VERSION,
  acceptsBand,
  acceptsMass,
  contractForVariant,
  type MassBasis,
  type RecordingContract,
} from '@/lib/workout/load/contract';
import { protocolKind, type LoadErrorCode, type LoadRejection } from '@/lib/workout/load/protocol';

/** 무게 도구 한 묶음 — 같은 무게의 도구 count 개(모르면 null), 한쪽에만 들었으면 side */
export type MassPiece = { kg: number; count: number | null; side: 'left' | 'right' | null };

/** 사용자가 붙인 기구 열쇠(그 사람 안에서만 뜻이 있다) — 견줌 열쇠는 key, 화면은 그때의 label */
export type SetupRef = { key: string; label: string };

export type MassLoad = {
  basis: MassBasis;
  /** 케이블 · 머신 묶음(계약에서) */
  apparatusFamily: string | null;
  /** 같은 기구를 가리키는 사용자 열쇠 — 없으면 기구 견줌이 없다 */
  setup: SetupRef | null;
  /** 한 숫자로 말해질 때의 kg(같은 무게 도구들의 한 개 · 바벨 합계 · 기구 설정값). 서로 다르면 null */
  kg: number | null;
  /** 서로 다른 무게의 도구 · 개수를 밝힌 경우만(그 밖에는 null) */
  parts: MassPiece[] | null;
};

export type BandRoleRecorded = 'resistance' | 'assistance' | 'unknown';
export type BandPart = { role: BandRoleRecorded; bands: BandComponent[] };

export type RecordedLoad =
  | { kind: 'none' }
  | ({ kind: 'mass' } & MassLoad)
  | ({ kind: 'band' } & BandPart)
  | { kind: 'combined'; mass: MassLoad | null; band: BandPart };

/** 세트 무게의 상태 — 계산에 넣는가를 가른다 */
export type LoadStatus =
  /** 계약대로 받은 값 */
  | 'ok'
  /** 옛 앱이 장비가 받지 않는 kg 을 보냈다 — 횟수 · 시간만 정식, kg 은 복구 기록에만 */
  | 'legacyIncompatible'
  /** 밴드 운동인데 어느 밴드인지 모른다(옛 앱 · '모름') — 밴드 견줌 · 진행에서 뺀다 */
  | 'unknownBand';

export const MAX_MASS_PIECES = 4;
export const SETUP_TEXT_MAX = 40;

/** 옛 칸(weightKg)에 쓸 값 — kg 의 하나뿐인 투영 */
export function projectWeightKg(load: RecordedLoad): number | null {
  if (load.kind === 'mass') return load.kg;
  if (load.kind === 'combined') return load.mass?.kg ?? null;
  return null;
}

/** 개수를 다 알 때만 낸 합계(kg) — 따로 이름 붙인 파생 값. 기록한 한 손 무게를 덮지 않는다 */
export function knownTotalKg(m: MassLoad): number | null {
  if (m.parts && m.parts.length) {
    if (m.parts.some((p) => p.count == null)) return null;
    return Math.round(m.parts.reduce((t, p) => t + p.kg * (p.count ?? 0), 0) * 100) / 100;
  }
  if (m.basis === 'barbellTotal' || m.basis === 'platesHeld' || m.basis === 'stackSetting' || m.basis === 'implement' || m.basis === 'added') return m.kg;
  /* 한 손 무게만 알고 몇 개를 들었는지 모르면 합계를 만들지 않는다(두 배로 어림하지 않는다) */
  return null;
}

export type NormalizeInput = {
  /** 요청에 loadProtocol 칸이 있었는가 — 칸이 아예 없을 때만 옛 앱이다 */
  hasProtocol: boolean;
  /** 요청의 loadProtocol(가공 전) */
  protocol: unknown;
  /** 요청의 loadResolver(새 앱이 구조화 무게를 보낼 때 싣는다) — 있으면 이 서버의 해석기 판과 같아야 한다 */
  resolver?: unknown;
  /** 그 운동의 얼린 계약(판에 찍힌 것) */
  contract: RecordingContract;
  /** alternative 계약이면 고른 변형(band | mass) */
  variant?: unknown;
  /** 요청의 weightKg(가공 전) */
  weightKg: unknown;
  /** 요청에 load 칸이 있었는가(없음 ≠ null) */
  hasLoad: boolean;
  /** 요청의 load(가공 전) */
  load: unknown;
  /** 서버가 구조화한 무게를 저장할 수 있는가 — 새 규칙의 강제(enforce)도 이것이 켜져 있을 때만 */
  structured: boolean;
  /** 같은 세트가 이미 있으면 그 값(고치기 · 재전송) */
  existing?: { weightKg: number | null; load: RecordedLoad | null } | null;
};

export type NormalizeOk = {
  ok: true;
  /** 옛 칸에 쓸 kg(투영). legacyUnchanged 이면 옛 요청의 kg 그대로(예전 쓰기) */
  weightKg: number | null;
  /** 구조화 칸에 쓸 값 — undefined 면 그대로 둔다(없음), 꺼져 있으면 늘 undefined */
  load: RecordedLoad | undefined;
  status: LoadStatus;
  /** 원래 보낸 요청을 복구 기록에 남겨야 하는가(켜져 있을 때 부르는 쪽이 같은 거래에서) */
  recover: boolean;
  /**
   * 구조화 저장이 꺼져 있어 옛 앱의 요청을 예전 쓰기 그대로 둔다 — 새 정규화를 했다고 말하지 않는다(loadAck 없음).
   * 맞지 않는 kg 이 옛 칸에 남았으면 incompatibleKept.
   */
  legacyUnchanged: boolean;
  incompatibleKept: boolean;
  /** 실제로 쓴 변형(alternative 만) */
  variant: 'band' | 'mass' | null;
  /** 이 세트에 실제로 쓴 계약(alternative 면 고른 변형의 계약) — 스냅샷에 얼린다 */
  contract: RecordingContract;
  /**
   * 이 결과를 만든 요청(같은 세트의 기존 값은 뺀 것). 새 정규화를 한 결과(legacyUnchanged 아님)에만 붙는다.
   * 쓰는 쪽은 쓰기 거래 안에서 **지금 줄**을 잠근 뒤 이 요청으로 다시 정규화한다 — 거래 밖에서 읽은 기존 값으로 만든 결과가
   * 그사이 바뀐 최신 값(다른 밴드 · 기구 이름 · 무게)을 되돌리지 않게(GPT 서브1 사전 점검: 오래된 읽기의 덮어쓰기).
   */
  request?: NormalizeRequest;
};

/** 다시 정규화할 때 쓰는 요청 — NormalizeInput 에서 기존 값만 뺀 것(JSON 으로 옮길 수 있다) */
export type NormalizeRequest = Omit<NormalizeInput, 'existing'>;

export type NormalizeResult = NormalizeOk | ({ ok: false } & LoadRejection) | { ok: false; error: string; code: LoadErrorCode; actionRequired: false };

const MESSAGES: Record<LoadErrorCode, string> = {
  LOAD_NOT_ALLOWED: '이 운동은 무게 없이 횟수 · 시간으로 기록해요.',
  LOAD_UNSUPPORTED: '이 기록(밴드 · 서로 다른 무게 · 기구 이름)은 아직 저장할 수 없어요. 업데이트 뒤에 다시 보내 주세요.',
  LOAD_CONFLICT: '같은 세트에 서로 다른 무게가 들어 있어요. 다시 적어 주세요.',
  LOAD_INVALID: '무게 · 밴드 값이 올바르지 않아요.',
  LOAD_REQUIRED: '무게를 적어 주세요.',
  LOAD_VERSION: '이 기록은 다른 판의 앱에서 보냈어요. 앱을 업데이트한 뒤 다시 보내 주세요.',
};

function reject(code: LoadErrorCode, modern: boolean, message?: string): NormalizeResult {
  return modern
    ? { ok: false, error: message ?? MESSAGES[code], code, actionRequired: true }
    : { ok: false, error: message ?? MESSAGES[code], code, actionRequired: false };
}

/** 무게 숫자 — 소수 둘째 자리(storedKg). 0 이하 · 없음은 '안 적음'(null). 숫자 아님 · 범위 밖은 'bad' */
export function readKg(v: unknown): number | null | 'bad' {
  if (v == null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'bad';
  const n = storedKg(v);
  if (n <= 0) return null;
  return n <= AMOUNT_LIMITS.weightKg ? n : 'bad';
}

/** 예전 서버의 무게 읽기 그대로(옛 앱 · 꺼짐 길) — 숫자가 아니거나 범위 밖이면 '안 적음' */
function legacyKg(v: unknown): number | null {
  const k = readKg(v);
  return k === 'bad' ? null : k;
}

function readBands(raw: unknown): BandComponent[] | 'bad' | 'version' {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_BANDS) return 'bad';
  const out: BandComponent[] = [];
  for (const r of raw) {
    /* 다른 판의 카탈로그로 고른 단계는 받지 않는다(같은 id 라도 뜻이 바뀌었을 수 있다) */
    const cat = r && typeof r === 'object' ? (r as { catalog?: unknown }).catalog : undefined;
    if (cat !== undefined && cat !== BAND_CATALOG_REVISION) return 'version';
    const b = cleanBandComponent(r);
    if (!b) return 'bad';
    out.push(b);
  }
  return out;
}

function readSetup(raw: unknown): SetupRef | null | 'bad' {
  if (raw == null) return null;
  if (typeof raw !== 'object') return 'bad';
  const label = (raw as { label?: unknown }).label;
  if (typeof label !== 'string') return 'bad';
  const text = Array.from(label.replace(/\s+/g, ' ').trim()).slice(0, SETUP_TEXT_MAX).join('');
  if (!text) return null;
  /* 열쇠는 글자를 고르게 다듬은 것 — 같은 사람이 같은 이름을 쓰면 같은 기구 */
  return { key: text.normalize('NFC').toLowerCase(), label: text };
}

function readPieces(raw: unknown): MassPiece[] | null | 'bad' {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MASS_PIECES) return 'bad';
  const out: MassPiece[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') return 'bad';
    const o = r as Record<string, unknown>;
    const kg = readKg(o.kg);
    if (kg === 'bad' || kg == null) return 'bad';
    const count = o.count == null ? null : typeof o.count === 'number' && Number.isInteger(o.count) && o.count >= 1 && o.count <= 10 ? o.count : 'bad';
    if (count === 'bad') return 'bad';
    const side = o.side == null ? null : o.side === 'left' || o.side === 'right' ? o.side : 'bad';
    if (side === 'bad') return 'bad';
    out.push({ kg, count, side });
  }
  return out;
}

/** 무게 성분을 읽는다 — kg 하나(같은 무게) 또는 pieces(서로 다른 무게 · 개수). 서로 다르면 kg 은 null */
function readMass(
  raw: Record<string, unknown>,
  c: RecordingContract,
  structured: boolean
): { mass: MassLoad } | { code: LoadErrorCode; message?: string } {
  if (raw.basis != null && raw.basis !== c.massBasis) return { code: 'LOAD_CONFLICT', message: '무게의 뜻(한 손 · 합계)이 이 운동과 달라요.' };
  const pieces = readPieces(raw.parts);
  if (pieces === 'bad') return { code: 'LOAD_INVALID' };
  const setup = readSetup(raw.setup);
  if (setup === 'bad') return { code: 'LOAD_INVALID' };
  if ((pieces || setup) && !structured) return { code: 'LOAD_UNSUPPORTED' };
  if (setup && c.massBasis !== 'stackSetting') return { code: 'LOAD_INVALID', message: '기구 이름은 케이블 · 머신 운동에만 붙여요.' };
  const one = readKg(raw.kg);
  if (one === 'bad') return { code: 'LOAD_INVALID' };
  let kg: number | null = one;
  if (pieces) {
    const uniform = pieces.every((p) => p.kg === pieces[0].kg);
    const pieceKg = uniform ? pieces[0].kg : null;
    if (one != null && one !== pieceKg) return { code: 'LOAD_CONFLICT' };
    kg = pieceKg;
  }
  if (kg == null && !pieces) return { code: 'LOAD_INVALID' };
  return { mass: { basis: c.massBasis!, apparatusFamily: c.apparatusFamily, setup, kg, parts: pieces } };
}

/**
 * 세트 하나의 무게를 계약에 맞춰 정한다. 이 함수만이 kg 을 정한다.
 */
export function normalizeSetLoad(input: NormalizeInput): NormalizeResult {
  const r = normalizeOnce(input);
  if (!r.ok || r.legacyUnchanged) return r;
  const { existing: _existing, ...request } = input;
  void _existing;
  return { ...r, request };
}

/** 기존 값이 있으면 그 줄을 기준으로 — 쓰는 쪽은 이 결과를 거래 밖에서 미리 보고, 거래 안에서 지금 줄로 다시 부른다 */
function normalizeOnce(input: NormalizeInput): NormalizeResult {
  const kind = protocolKind(input.hasProtocol, input.protocol);
  if (kind === 'unknown') return reject('LOAD_VERSION', true);
  const modern = kind === 'modern';
  if (modern && input.resolver !== undefined && input.resolver !== RESOLVER_VERSION) return reject('LOAD_VERSION', true);

  /* ── 옛 앱 + 구조화 저장 꺼짐: 예전 쓰기를 그대로(새 정규화를 하지 않는다 — 출시 차단 항목) ── */
  if (!modern && !input.structured) {
    const kg = legacyKg(input.weightKg);
    /* 예전 needsWeight 검사(바벨 · 덤벨 '무게를 적어 주세요')는 그대로 — 그 운동의 그때 계약에서 */
    const base = input.contract.mode === 'alternative' ? (kg != null ? contractForVariant(input.contract, 'mass') : contractForVariant(input.contract, 'band')) : input.contract;
    if (base?.massRequired && kg == null) return reject('LOAD_REQUIRED', false);
    const incompatible = kg != null && (!base || !acceptsMass(base));
    return {
      ok: true,
      weightKg: kg,
      load: undefined,
      status: incompatible ? 'legacyIncompatible' : 'ok',
      recover: false,
      legacyUnchanged: true,
      incompatibleKept: incompatible,
      variant: input.contract.mode === 'alternative' ? (kg != null ? 'mass' : 'band') : null,
      contract: base ?? input.contract,
    };
  }

  const kgRaw = readKg(input.weightKg);
  if (kgRaw === 'bad' && modern) return reject('LOAD_INVALID', true, '무게 값이 올바르지 않아요.');
  /* 옛 앱(켜짐)의 범위 밖 숫자는 예전처럼 '안 적음'으로 받고 원래 값은 복구로 */
  const badLegacy = kgRaw === 'bad';
  const kg = kgRaw === 'bad' ? null : kgRaw;

  /* 변형 — alternative 계약은 변형을 골라야 한다. 옛 앱은 kg 을 보냈으면 무게 변형, 아니면 밴드 변형으로 본다 */
  let variant: 'band' | 'mass' | null = null;
  let c: RecordingContract = input.contract;
  if (c.mode === 'alternative') {
    const asked = input.variant === 'band' || input.variant === 'mass' ? input.variant : null;
    variant = asked ?? (modern ? null : kg != null ? 'mass' : 'band');
    if (!variant) return reject('LOAD_REQUIRED', modern, '밴드로 했는지 무게로 했는지 골라 주세요.');
    const v = contractForVariant(c, variant);
    if (!v) return reject('LOAD_INVALID', modern);
    c = v;
  } else if (input.variant != null && modern) {
    return reject('LOAD_INVALID', modern, '이 운동에는 고를 변형이 없어요.');
  }

  const ok = (o: Partial<NormalizeOk> & Pick<NormalizeOk, 'weightKg'>): NormalizeOk => ({
    ok: true,
    load: undefined,
    status: 'ok',
    recover: badLegacy,
    legacyUnchanged: false,
    incompatibleKept: false,
    variant,
    contract: c,
    ...o,
  });

  const existing = input.existing ?? null;
  const existingModern = existing?.load && (existing.load.kind === 'band' || existing.load.kind === 'combined') ? existing.load : null;
  const store = <T extends RecordedLoad>(l: T): T | undefined => (input.structured ? l : undefined);

  /* ── 요청에 구조화한 무게가 있다(새 앱) ── */
  if (input.hasLoad && input.load !== undefined) {
    if (!modern) return reject('LOAD_INVALID', false);
    if (input.load === null || (typeof input.load === 'object' && (input.load as { kind?: unknown }).kind === 'none')) {
      /* 지움 — 무게를 꼭 적는 운동은 못 지운다 */
      if (c.massRequired) return reject('LOAD_REQUIRED', true);
      if (kg != null) return reject('LOAD_CONFLICT', true);
      return ok({ weightKg: null, load: store({ kind: 'none' }) });
    }
    const l = input.load as Record<string, unknown>;
    if (typeof l !== 'object' || typeof l.kind !== 'string') return reject('LOAD_INVALID', true);
    if (l.kind === 'mass') {
      if (!acceptsMass(c) || c.mode === 'combined') return reject('LOAD_NOT_ALLOWED', true);
      const m = readMass(l, c, input.structured);
      if ('code' in m) return reject(m.code, true, m.message);
      if (kg != null && kg !== m.mass.kg) return reject('LOAD_CONFLICT', true);
      return ok({ weightKg: m.mass.kg, load: store({ kind: 'mass', ...m.mass }) });
    }
    if (l.kind === 'band' || l.kind === 'combined') {
      if (!acceptsBand(c)) return reject('LOAD_NOT_ALLOWED', true, '이 운동은 밴드로 기록하지 않아요.');
      if (!input.structured) return reject('LOAD_UNSUPPORTED', true);
      const bandRaw = ((l.kind === 'band' ? l : l.band) ?? {}) as Record<string, unknown>;
      const asked = bandRaw.role;
      let role: BandRoleRecorded;
      if (c.bandRole) {
        if (asked != null && asked !== c.bandRole) return reject('LOAD_CONFLICT', true, '밴드의 역할(저항 · 보조)이 이 운동과 달라요.');
        role = c.bandRole;
      } else {
        if (asked != null && asked !== 'resistance' && asked !== 'assistance' && asked !== 'unknown') return reject('LOAD_INVALID', true);
        role = (asked as BandRoleRecorded | undefined) ?? 'unknown';
      }
      const bands = readBands(bandRaw.bands);
      if (bands === 'version') return reject('LOAD_VERSION', true);
      if (bands === 'bad') return reject('LOAD_INVALID', true, '모르는 밴드가 들어 있어요. 다시 골라 주세요.');
      const band: BandPart = { role, bands };
      const status: LoadStatus = bands.length === 0 ? 'unknownBand' : 'ok';
      if (c.mode === 'band') {
        if (l.kind !== 'band') return reject('LOAD_CONFLICT', true);
        if (kg != null) return reject('LOAD_NOT_ALLOWED', true, '밴드 운동은 kg 을 적지 않아요.');
        return ok({ weightKg: null, load: { kind: 'band', ...band }, status });
      }
      /* combined — 무게 성분은 따로, 둘을 더한 kg 은 만들지 않는다 */
      let mass: MassLoad | null = null;
      if (l.kind === 'combined' && l.mass != null) {
        if (typeof l.mass !== 'object') return reject('LOAD_INVALID', true);
        const m = readMass(l.mass as Record<string, unknown>, c, true);
        if ('code' in m) return reject(m.code, true, m.message);
        if (kg != null && kg !== m.mass.kg) return reject('LOAD_CONFLICT', true);
        mass = m.mass;
      } else if (kg != null) {
        mass = { basis: c.massBasis!, apparatusFamily: c.apparatusFamily, setup: null, kg, parts: null };
      }
      if (c.massRequired && !mass) return reject('LOAD_REQUIRED', true);
      return ok({ weightKg: mass?.kg ?? null, load: { kind: 'combined', mass, band }, status });
    }
    return reject('LOAD_INVALID', true);
  }

  /* ── 구조화한 무게 없이 weightKg 만(새 앱의 무게 운동 · 옛 앱(켜짐) 전부) ── */
  if (acceptsMass(c)) {
    if (c.mode === 'combined') {
      /* 밴드 성분은 그대로 두고 무게 성분만 — 옛 앱의 kg 이 있던 무게와 다르면 바꾸지 않고 복구로(현대 기록을 지우지 않는다) */
      if (existingModern && existingModern.kind === 'combined') {
        const was = existingModern.mass?.kg ?? null;
        if (!modern && kg !== was) return ok({ weightKg: was, load: undefined, recover: kg != null || badLegacy, status: 'ok' });
        if (c.massRequired && kg == null) return reject('LOAD_REQUIRED', modern);
        const mass = kg == null ? null : { ...(existingModern.mass ?? { basis: c.massBasis!, apparatusFamily: c.apparatusFamily, setup: null, parts: null }), kg, parts: null };
        return ok({ weightKg: kg, load: store({ ...existingModern, mass }) });
      }
      if (c.massRequired && kg == null) return reject('LOAD_REQUIRED', modern);
      return ok({
        weightKg: kg,
        load: store({ kind: 'combined', mass: kg == null ? null : { basis: c.massBasis!, apparatusFamily: c.apparatusFamily, setup: null, kg, parts: null }, band: { role: c.bandRole ?? 'unknown', bands: [] } }),
        status: 'unknownBand',
      });
    }
    /*
     * 저장된 무게에 양손 무게(parts) · 기구 이름(setup)이 있는데 요청이 load 를 빼고 왔다(RIR · 횟수만 고친 재전송, 옛 앱) —
     * 없음은 '그대로'다. kg 가 같거나(양손이 다른 세트는 한 숫자가 없어 null) 같으면 저장된 무게를 건드리지 않는다.
     * 옛 앱이 다른 kg 을 보내면: 양손 무게는 옛 앱이 볼 수 없는 값이라 덮지 않고 원래 요청을 복구로, 기구 이름은 같은 기구의 새 숫자로.
     * 새 앱이 load 없이 다른 kg 을 보내면 그것은 단순 무게다(기구 이름 · 양손을 아는 새 앱은 load 를 싣는다).
     */
    const exMass = existing?.load?.kind === 'mass' ? existing.load : null;
    if (exMass && (exMass.parts || exMass.setup)) {
      if (kg === exMass.kg || (kg == null && exMass.parts && exMass.kg == null)) return ok({ weightKg: exMass.kg, load: undefined });
      if (!modern && exMass.parts) return ok({ weightKg: exMass.kg, load: undefined, recover: true });
      if (!modern && kg != null) return ok({ weightKg: kg, load: store({ ...exMass, kg, parts: null }) });
    }
    if (c.massRequired && kg == null) return reject('LOAD_REQUIRED', modern);
    return ok({
      weightKg: kg,
      load: store(kg == null ? { kind: 'none' } : { kind: 'mass', basis: c.massBasis!, apparatusFamily: c.apparatusFamily, setup: null, kg, parts: null }),
    });
  }

  /* 장비가 kg 을 받지 않는다(맨몸 · 받침 · 밴드 · 모름) */
  const bandish = c.mode === 'band';
  if (kg != null) {
    if (modern) return reject('LOAD_NOT_ALLOWED', true, bandish ? '밴드 운동은 kg 을 적지 않아요.' : undefined);
    /* 옛 앱(켜짐) — 거절하지 않는다. 횟수 · 시간은 정식, kg 은 같은 거래의 복구 기록으로 */
    /* EX-LOAD01-R1 — 명시적으로 지운 밴드(none)도 저장된 기록이다. 옛 앱의 kg 이 그 지움을 '모르는 밴드'로 바꾸지 않는다 */
    if (existingModern || existing?.load?.kind === 'none') return ok({ weightKg: null, load: undefined, recover: true, status: 'legacyIncompatible' });
    return ok({
      weightKg: null,
      load: bandish ? { kind: 'band', role: c.bandRole ?? 'unknown', bands: [] } : { kind: 'none' },
      recover: true,
      status: 'legacyIncompatible',
    });
  }
  if (bandish) {
    /* 밴드 운동, kg 없음 — 있던 밴드는 그대로(없음 ≠ 지움). 새로 남기면 '어느 밴드인지 모름' */
    /* EX-LOAD01-R1 — 명시적으로 지운 줄(none)도 그대로: 끼어든 지움 뒤에 온 RIR 만 고친 재전송이 '모르는 밴드'를 만들지 않는다 */
    if (existingModern || existing?.load?.kind === 'none') return ok({ weightKg: null, load: undefined });
    return ok({ weightKg: null, load: store({ kind: 'band', role: c.bandRole ?? 'unknown', bands: [] }), status: input.structured ? 'unknownBand' : 'ok' });
  }
  return ok({ weightKg: null, load: existingModern ? undefined : store({ kind: 'none' }) });
}

/** 저장된 JSON 을 다시 읽는다 — 모르는 모양이면 null */
export function readRecordedLoad(raw: unknown): RecordedLoad | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const mass = (m: unknown): MassLoad | null => {
    if (!m || typeof m !== 'object') return null;
    const x = m as Record<string, unknown>;
    if (typeof x.basis !== 'string') return null;
    const parts = Array.isArray(x.parts)
      ? (x.parts.filter((p) => p && typeof p === 'object' && typeof (p as MassPiece).kg === 'number') as MassPiece[])
      : null;
    const setup =
      x.setup && typeof x.setup === 'object' && typeof (x.setup as SetupRef).key === 'string'
        ? { key: (x.setup as SetupRef).key, label: String((x.setup as SetupRef).label ?? '') }
        : null;
    return {
      basis: x.basis as MassBasis,
      apparatusFamily: typeof x.apparatusFamily === 'string' ? x.apparatusFamily : null,
      setup,
      kg: typeof x.kg === 'number' ? x.kg : null,
      parts: parts && parts.length ? parts : null,
    };
  };
  const band = (b: unknown): BandPart | null => {
    if (!b || typeof b !== 'object') return null;
    const x = b as Record<string, unknown>;
    const role = x.role === 'resistance' || x.role === 'assistance' ? x.role : 'unknown';
    const bands = Array.isArray(x.bands) ? (x.bands.filter((y) => y && typeof y === 'object') as BandComponent[]) : [];
    return { role, bands };
  };
  switch (o.kind) {
    case 'none':
      return { kind: 'none' };
    case 'mass': {
      const m = mass(o);
      return m ? { kind: 'mass', ...m } : null;
    }
    case 'band': {
      const b = band(o);
      return b ? { kind: 'band', ...b } : null;
    }
    case 'combined': {
      const b = band(o.band);
      return b ? { kind: 'combined', mass: mass(o.mass), band: b } : null;
    }
    default:
      return null;
  }
}
