/**
 * EX-LOAD01 — 운동 화면(웹)이 세트를 담기 전에 쓰는 무게 기록 도우미. 순수 — React · DB 를 부르지 않는다.
 *
 * 입력 칸은 운동의 기록 계약(RunExercise.load, lib/workout/load/contract.ts)과 서버의 약속(loadCapability)만 보고 정한다:
 *   - 맨몸 · 받침(none) · 장비 확인 중(unresolved) → kg 칸 없음(횟수 · 시간만)
 *   - 바벨 · 덤벨 · 케틀벨 · 원판 · 케이블 · 머신 · 도구 → kg 칸(이름은 massFieldLabel — '무게(한 손 · 한 개)' · '케이블 머신 설정값'),
 *     꼭 적어야 하는 것은 계약의 massRequired 뿐
 *   - 밴드 → 상표 → 계열 → 단계(구조화 저장이 될 때만, 아니면 '업데이트 뒤에' 한 줄과 횟수 · 시간만)
 *   - 밴드 + 무게(combined) → 둘 다 / 둘 중 하나(alternative) → 세트마다 고른다
 * 담기 전에 서버와 같은 정규화(normalizeSetLoad)로 먼저 걸러, 서버가 받지 않을 세트를 대기열에 넣지 않는다.
 */

import { equipmentDisplayName } from '@/lib/exercise-meta';
import {
  BAND_CATALOG_REVISION,
  MAX_BANDS,
  bandText,
  cleanBandComponent,
  type BandComponent,
} from '@/lib/workout/load/band-catalog';
import {
  BAND_ROLE_LABEL,
  RESOLVER_VERSION,
  acceptsBand,
  acceptsMass,
  contractForVariant,
  massFieldLabel,
  resolveRecordingContract,
  type RecordingContract,
} from '@/lib/workout/load/contract';
import { overridesFor } from '@/lib/workout/load/overrides';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import {
  SETUP_TEXT_MAX,
  normalizeSetLoad,
  type BandRoleRecorded,
  type MassLoad,
  type RecordedLoad,
} from '@/lib/workout/load/recorded';

/** 세트 하나에 담을 무게 기록의 화면 쪽 값(kg 은 이미 kg 으로 바꾼 값) */
export type LoadDraft = {
  /** 밴드/무게 중 고르는 운동(alternative)에서 고른 것 */
  variant: 'band' | 'mass' | null;
  /** 계약이 역할을 정하지 않은 밴드 운동에서 이 세트의 역할(저항 · 보조 · 모름). 안 골랐으면 null */
  role: BandRoleRecorded | null;
  /** 이 세트에 쓴 밴드(1~MAX_BANDS) */
  bands: BandComponent[];
  /** 케이블 · 머신의 '기구 이름'(선택) — 같은 이름끼리만 견준다 */
  setupLabel: string;
  /** 덤벨 · 케틀벨을 양손 다른 무게로 들었다 */
  unequal: boolean;
  leftKg: number | null;
  rightKg: number | null;
};

export const EMPTY_LOAD_DRAFT: LoadDraft = {
  variant: null,
  role: null,
  bands: [],
  setupLabel: '',
  unequal: false,
  leftKg: null,
  rightKg: null,
};

/**
 * 운동의 계약 — 서버가 실어 보낸 것(RunExercise.load)이 먼저. 그 칸을 모르는 옛 답이면 같은 해석기를 같은 장비로 돌린다
 * (서버와 같은 순수 함수 · 같은 검토 예외라 같은 답이 나온다).
 */
export function contractOfExercise(ex: {
  id: string;
  equipment: readonly string[];
  isHold: boolean;
  category?: string | null;
  load?: RecordingContract | null;
}): RecordingContract {
  return (
    ex.load ??
    resolveRecordingContract({
      exerciseId: ex.id,
      equipment: ex.equipment,
      category: ex.category ?? null,
      isHold: ex.isHold,
      overrides: overridesFor(ex.id),
    })
  );
}

/** 이 세트에 쓸 계약 — alternative 면 고른 변형의 것, 아직 안 골랐으면 null. 그 밖에는 그대로 */
export function activeContract(c: RecordingContract, variant: 'band' | 'mass' | null): RecordingContract | null {
  if (c.mode !== 'alternative') return c;
  return variant ? contractForVariant(c, variant) : null;
}

/** 입력 칸의 모양 — 운동 화면이 그대로 그린다 */
export type LoadForm = {
  /** kg 칸 — 없음 · 비워도 됨 · 꼭 */
  kg: 'none' | 'optional' | 'required';
  /** kg 칸 이름('무게(봉 포함)' · '케이블 머신 설정값' …) */
  kgLabel: string | null;
  /** 밴드 고르기 — 없음 · 고르기 · '업데이트 뒤에' 안내 */
  band: 'none' | 'picker' | 'notice';
  /** 계약이 정한 밴드 역할(있으면 고르는 칩 대신 이름만) */
  fixedRole: 'resistance' | 'assistance' | null;
  /** 기구 이름 칸(케이블 · 머신, 구조화 저장이 될 때만) */
  setup: boolean;
  /** '양손 무게가 달라요'(덤벨 · 케틀벨, 구조화 저장이 될 때만) */
  split: boolean;
  /** 밴드/무게 고르기(alternative) */
  variants: boolean;
  /** 장비 확인 중(unresolved) — 횟수 · 시간만 */
  unresolved: boolean;
};

export function loadForm(
  c: RecordingContract,
  variant: 'band' | 'mass' | null,
  structured: boolean,
  displayApparatus: (name: string) => string = equipmentDisplayName
): LoadForm {
  const variants = c.mode === 'alternative';
  const a = activeContract(c, variant);
  const none: LoadForm = {
    kg: 'none',
    kgLabel: null,
    band: 'none',
    fixedRole: null,
    setup: false,
    split: false,
    variants,
    unresolved: c.mode === 'unresolved',
  };
  if (!a || a.mode === 'none' || a.mode === 'unresolved') return { ...none, unresolved: a?.mode === 'unresolved' || none.unresolved };
  const mass = acceptsMass(a);
  const band = acceptsBand(a);
  return {
    ...none,
    kg: mass ? (a.massRequired ? 'required' : 'optional') : 'none',
    kgLabel: mass ? massFieldLabel(a, displayApparatus) : null,
    band: band ? (structured ? 'picker' : 'notice') : 'none',
    fixedRole: band ? a.bandRole : null,
    setup: structured && a.mode === 'indicatedLoad' && a.massBasis === 'stackSetting',
    split: structured && a.mode === 'externalMass' && a.massBasis === 'perImplement',
  };
}

/** 계약이 정한 밴드 역할(검토한 예외) — 밴드/무게를 고르는 운동이면 밴드 변형의 것. 없으면 null(세트마다 고른다) */
export function fixedBandRole(c: RecordingContract): 'resistance' | 'assistance' | null {
  if (c.mode === 'alternative') return contractForVariant(c, 'band')?.bandRole ?? null;
  return c.bandRole;
}

/** 운동을 열 때 첫 칸이 무게인가(꼭 적어야 하는 무게가 있을 때만) */
export function startsWithWeight(c: RecordingContract, variant: 'band' | 'mass' | null = null): boolean {
  const a = activeContract(c, variant);
  return !!a && acceptsMass(a) && a.massRequired;
}

/** 기구 이름 → 저장 열쇠(서버 readSetup 과 같은 다듬기) */
export function setupRefOf(label: string): { key: string; label: string } | null {
  const text = Array.from(label.replace(/\s+/g, ' ').trim()).slice(0, SETUP_TEXT_MAX).join('');
  if (!text) return null;
  return { key: text.normalize('NFC').toLowerCase(), label: text };
}

/** 대기열에 담을 무게 칸들(weightKg 와 함께) */
export type SetLoadPayload = {
  weightKg: number | null;
  load?: RecordedLoad;
  variant?: 'band' | 'mass';
  loadResolver?: number;
};

export type BuildResult =
  | ({ ok: true } & SetLoadPayload)
  | { ok: false; error: string; field: 'weight' | 'band' | 'variant' | 'split' };

const massOf = (c: RecordingContract, over: Partial<MassLoad>): MassLoad => ({
  basis: c.massBasis!,
  apparatusFamily: c.apparatusFamily,
  setup: null,
  kg: null,
  parts: null,
  ...over,
});

/**
 * 화면 값 → 세트에 실을 칸. 무게만인 세트는 weightKg 만(load 칸 없음 — 옛 서버도 그대로 받는다). 구조화한 무게(밴드 · 섞임 ·
 * 양손 다른 무게 · 기구 이름)는 서버가 저장할 수 있을 때만(structured) 싣는다.
 */
export function buildSetLoad(a: {
  contract: RecordingContract;
  structured: boolean;
  /** 화면의 kg 칸(이미 kg) — 칸이 없거나 비었으면 null */
  weightKg: number | null;
  draft: LoadDraft;
  /** 고치기(이미 남긴 세트)인가 — 밴드를 안 골라도 '어느 밴드인지 모름'으로 남길 수 있다 */
  editing?: boolean;
}): BuildResult {
  const c = a.contract;
  const variant = c.mode === 'alternative' ? a.draft.variant : null;
  if (c.mode === 'alternative' && !variant) {
    return { ok: false, error: '밴드로 했는지 무게로 했는지 골라 주세요.', field: 'variant' };
  }
  const act = activeContract(c, variant);
  if (!act) return { ok: false, error: '밴드로 했는지 무게로 했는지 골라 주세요.', field: 'variant' };
  const withVariant = variant ? { variant } : {};
  const form = loadForm(c, variant, a.structured);

  /* 무게를 받지 않는 운동 — kg 은 보내지 않는다(칸도 없다) */
  const mass = acceptsMass(act);
  let kg = mass ? a.weightKg : null;

  /* 양손 다른 무게(덤벨 · 케틀벨) — 구조화 저장이 될 때만 */
  let massLoad: MassLoad | null = null;
  if (form.split && a.draft.unequal) {
    const l = a.draft.leftKg;
    const r = a.draft.rightKg;
    if (l == null || r == null || l <= 0 || r <= 0) {
      return { ok: false, error: '왼손 · 오른손 무게를 둘 다 적어 주세요.', field: 'split' };
    }
    const same = l === r;
    kg = same ? l : null;
    massLoad = massOf(act, {
      kg,
      parts: [
        { kg: l, count: 1, side: 'left' },
        { kg: r, count: 1, side: 'right' },
      ],
    });
  }
  if (mass && act.massRequired && kg == null && !massLoad) {
    return { ok: false, error: '무게를 적어 주세요.', field: 'weight' };
  }
  /* 기구 이름 — 무게가 있을 때만 붙인다(이름만 있는 세트는 견줄 것이 없다) */
  const setup = form.setup ? setupRefOf(a.draft.setupLabel) : null;
  if (setup && kg != null && !massLoad) massLoad = massOf(act, { kg, setup });

  if (!acceptsBand(act)) {
    if (massLoad) return { ok: true, weightKg: kg, load: { kind: 'mass', ...massLoad }, loadResolver: RESOLVER_VERSION, ...withVariant };
    return { ok: true, weightKg: kg, ...withVariant };
  }

  /* 밴드가 들어가는 운동 — 서버가 아직 저장할 수 없으면 무게(combined 의 무게 성분)와 횟수 · 시간만 */
  if (form.band !== 'picker') return { ok: true, weightKg: kg, ...withVariant };

  const role: BandRoleRecorded | null = act.bandRole ?? a.draft.role;
  if (!role) {
    return { ok: false, error: '밴드가 버티게 했는지(저항) 도와줬는지(보조) 골라 주세요. 모르면 모름을 골라요.', field: 'band' };
  }
  const bands = a.draft.bands.slice(0, MAX_BANDS);
  if (bands.length === 0 && !a.editing) {
    return { ok: false, error: '쓴 밴드를 골라 주세요.', field: 'band' };
  }
  const band = { role, bands };
  if (act.mode === 'band') {
    return { ok: true, weightKg: null, load: { kind: 'band', ...band }, loadResolver: RESOLVER_VERSION, ...withVariant };
  }
  /* combined — 무게 성분과 밴드를 따로. 둘을 더한 kg 은 만들지 않는다 */
  const m = massLoad ?? (kg != null ? massOf(act, { kg }) : null);
  return {
    ok: true,
    weightKg: m?.kg ?? null,
    load: { kind: 'combined', mass: m, band },
    loadResolver: RESOLVER_VERSION,
    ...withVariant,
  };
}

/**
 * 서버와 같은 정규화로 먼저 거른다 — 받지 않을 세트를 대기열에 넣지 않는다(새 앱 규칙). 통과하면 null, 아니면 화면에 보일 말.
 */
export function checkSetLoad(contract: RecordingContract, structured: boolean, p: SetLoadPayload): string | null {
  const r = normalizeSetLoad({
    hasProtocol: true,
    protocol: LOAD_PROTOCOL,
    resolver: p.load !== undefined ? p.loadResolver : undefined,
    contract,
    variant: p.variant ?? null,
    weightKg: p.weightKg,
    hasLoad: p.load !== undefined,
    load: p.load,
    structured,
  });
  return r.ok ? null : r.error;
}

/* ───────────────────── 화면 말 ───────────────────── */

/** 남긴 세트의 무게 기록을 한 줄로(밴드 · 양손 다른 무게 · 기구 이름). 무게만인 세트는 null — 화면이 weightKg 로 그린다 */
export function loadLine(load: RecordedLoad | null | undefined, fmt: (kg: number) => string): string | null {
  if (!load || load.kind === 'none') return null;
  const massLine = (m: MassLoad | null): string | null => {
    if (!m) return null;
    const parts =
      m.parts && m.parts.length
        ? m.parts
            .map((p) => `${p.side === 'left' ? '왼손 ' : p.side === 'right' ? '오른손 ' : ''}${fmt(p.kg)}${p.count && p.count > 1 ? ` × ${p.count}개` : ''}`)
            .join(' · ')
        : m.kg != null
          ? fmt(m.kg)
          : null;
    return [parts, m.setup ? m.setup.label : null].filter(Boolean).join(' · ') || null;
  };
  const bandLine = (role: BandRoleRecorded, bands: readonly BandComponent[]) => {
    const who = role === 'unknown' ? '밴드(역할 모름)' : BAND_ROLE_LABEL[role];
    return bands.length ? `${who} ${bands.map((b) => bandText(b)).join(' + ')}` : `${who} · 어느 밴드인지 모름`;
  };
  if (load.kind === 'mass') {
    /* 한 숫자 무게만이면 화면의 weightKg 줄로 충분하다 */
    if (!load.parts && !load.setup) return null;
    return massLine(load);
  }
  if (load.kind === 'band') return bandLine(load.role, load.bands);
  return [massLine(load.mass), bandLine(load.band.role, load.band.bands)].filter(Boolean).join(' + ');
}

/* ───────────────────── 지난 밴드 기억(이 기기 · 계정마다) ───────────────────── */

/*
 * 계정마다 따로(owner|운동|역할) — 한 기기에서 계정을 바꾸면 앞 사람의 밴드 · 역할 · 기구 이름을 미리 채우지 않는다(앱 load-model 과 같은 경계).
 * 계정을 모르면(null) 기억하지도 꺼내지도 않는다. 계정 표시가 없던 v1 기억은 누구의 것인지 몰라 읽지 않는다(판을 v2 로 올림).
 */
const BAND_MEMO = 'bullpen-log:band-last:v2';
const ROLE_MEMO = 'bullpen-log:band-role-last:v2';
const SETUP_MEMO = 'bullpen-log:setup-last:v2';
const ownedKey = (owner: string | null | undefined, ...parts: string[]): string | null => (owner ? [owner, ...parts].join('|') : null);

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const local = (): Store | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

function readMap(key: string, store: Store | null): Record<string, unknown> {
  try {
    const raw = store?.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, map: Record<string, unknown>, store: Store | null) {
  try {
    store?.setItem(key, JSON.stringify(map));
  } catch {
    /* 사생활 보호 모드 등 — 기억만 못 할 뿐 */
  }
}

/**
 * 마지막에 쓴 밴드 — 같은 운동 · 같은 역할일 때만 다시 꺼낸다(보조로 쓴 밴드를 저항 운동에 미리 채우지 않는다). 다른 판의 카탈로그로
 * 고른 단계 · 모르는 단계는 버린다(서버가 받지 않는다).
 */
export function recallBands(owner: string | null | undefined, exerciseId: string, role: BandRoleRecorded | null, store: Store | null = local()): BandComponent[] {
  if (role !== 'resistance' && role !== 'assistance') return [];
  const key = ownedKey(owner, exerciseId, role);
  if (!key) return [];
  const raw = readMap(BAND_MEMO, store)[key];
  if (!Array.isArray(raw)) return [];
  const out: BandComponent[] = [];
  for (const r of raw.slice(0, MAX_BANDS)) {
    const cat = r && typeof r === 'object' ? (r as { catalog?: unknown }).catalog : undefined;
    if (cat !== undefined && cat !== BAND_CATALOG_REVISION) return [];
    const b = cleanBandComponent(r);
    if (!b) return [];
    out.push(b);
  }
  return out;
}

export function rememberBands(
  owner: string | null | undefined,
  exerciseId: string,
  role: BandRoleRecorded | null,
  bands: readonly BandComponent[],
  store: Store | null = local()
) {
  if ((role !== 'resistance' && role !== 'assistance') || bands.length === 0) return;
  const key = ownedKey(owner, exerciseId, role);
  if (!key) return;
  const map = readMap(BAND_MEMO, store);
  map[key] = bands;
  writeMap(BAND_MEMO, map, store);
}

/** 역할을 세트마다 고르는 운동에서 지난번 고른 역할(미리 골라 두기만 — 바꿀 수 있다) */
export function recallRole(owner: string | null | undefined, exerciseId: string, store: Store | null = local()): BandRoleRecorded | null {
  const key = ownedKey(owner, exerciseId);
  if (!key) return null;
  const v = readMap(ROLE_MEMO, store)[key];
  return v === 'resistance' || v === 'assistance' || v === 'unknown' ? v : null;
}

export function rememberRole(owner: string | null | undefined, exerciseId: string, role: BandRoleRecorded | null, store: Store | null = local()) {
  const key = ownedKey(owner, exerciseId);
  if (!role || !key) return;
  const map = readMap(ROLE_MEMO, store);
  map[key] = role;
  writeMap(ROLE_MEMO, map, store);
}

/** 케이블 · 머신 운동마다 지난번 적은 기구 이름(미리 채우기만 — 지울 수 있다) */
export function recallSetup(owner: string | null | undefined, exerciseId: string, store: Store | null = local()): string {
  const key = ownedKey(owner, exerciseId);
  if (!key) return '';
  const v = readMap(SETUP_MEMO, store)[key];
  return typeof v === 'string' ? Array.from(v).slice(0, SETUP_TEXT_MAX).join('') : '';
}

export function rememberSetup(owner: string | null | undefined, exerciseId: string, label: string, store: Store | null = local()) {
  const key = ownedKey(owner, exerciseId);
  if (!key) return;
  const map = readMap(SETUP_MEMO, store);
  const ref = setupRefOf(label);
  if (ref) map[key] = ref.label;
  else delete map[key];
  writeMap(SETUP_MEMO, map, store);
}
