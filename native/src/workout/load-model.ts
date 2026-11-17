import AsyncStorage from '@react-native-async-storage/async-storage';
import { storedKg } from '@/lib/exercise-meta';
import { formatWeight, fromWeight, round1, toWeight, type WeightUnit } from '@/lib/units';
import {
  BAND_ROLE_LABEL,
  RESOLVER_VERSION,
  acceptsBand,
  acceptsMass,
  contractForVariant,
  massFieldLabel,
  type RecordingContract,
} from '@/lib/workout/load/contract';
import { BAND_CATALOG_REVISION, MAX_BANDS, bandText, cleanBandComponent, seriesById, type BandComponent } from '@/lib/workout/load/band-catalog';
import { SETUP_TEXT_MAX, type BandRoleRecorded, type MassPiece, type RecordedLoad } from '@/lib/workout/load/recorded';
import { seedOfLoadTarget, type LoadTarget } from '@/lib/workout/load/target';

/**
 * EX-LOAD01 — 운동 화면 장비 기록 칸의 셈(화면 없이 · node 시험이 그대로 부른다: scripts/native-outbox-selftest.mts). 그리는 부분은 load-input.tsx.
 * 무엇을 적는지는 그 판에 얼린 기록 계약(RunExercise.load)과 서버 능력(loadCapability.structured)만 정한다.
 */

/* ───────────────────────────── 셈 ───────────────────────────── */

/** 다음 세트에 쓸 장비 고름 — 운동마다 따로(운동 화면이 초안처럼 들고 다닌다). 이미 남긴 세트는 이것을 바꿔도 안 바뀐다 */
export type LoadDraft = {
  /** 밴드 · 무게 중 하나를 고르는 운동(alternative)에서 이번 세트에 쓴 것 — 고르기 전에는 null */
  variant: 'band' | 'mass' | null;
  /** 계약이 역할을 정하지 않은 밴드 운동에서 고른 역할 — 안 골랐으면 null('모름'으로 보낸다) */
  role: BandRoleRecorded | null;
  bands: BandComponent[];
  /** 케이블 · 머신의 기구 이름(선택) — 같은 이름끼리만 견준다 */
  setup: string;
  /** 덤벨 · 케틀벨 양손 무게가 다른가 — 켜면 kg 칸 대신 왼손 · 오른손 */
  unequal: boolean;
  /** 왼손 · 오른손 무게(고른 단위 글자) */
  left: string;
  right: string;
};

export const EMPTY_LOAD_DRAFT: LoadDraft = { variant: null, role: null, bands: [], setup: '', unequal: false, left: '', right: '' };

/** 운동의 얼린 계약 — 옛 서버의 답에는 칸이 없다(null 이면 예전 needsWeight 규칙) */
export function contractOf(ex: { load?: RecordingContract | null }): RecordingContract | null {
  return ex.load ?? null;
}

/** 이번 세트에 실제로 쓰는 계약 — 고르는 운동이면 고른 변형의 계약(안 골랐으면 null) */
export function activeContract(c: RecordingContract | null, variant: 'band' | 'mass' | null | undefined): RecordingContract | null {
  if (!c) return null;
  if (c.mode !== 'alternative') return c;
  return variant ? contractForVariant(c, variant) : null;
}

/** kg 칸을 보이나 — 계약이 무게 성분을 받을 때만. 옛 서버(계약 없음)는 예전처럼 늘 */
export function showsKg(c: RecordingContract | null, variant: 'band' | 'mass' | null | undefined): boolean {
  if (!c) return true;
  const a = activeContract(c, variant);
  return !!a && acceptsMass(a);
}

/** 무게를 꼭 적어야 하나(예전 needsWeight) — 계약이 있으면 계약이 정한다 */
export function kgRequired(ex: { needsWeight: boolean; load?: RecordingContract | null }, variant: 'band' | 'mass' | null | undefined): boolean {
  const c = contractOf(ex);
  if (!c) return ex.needsWeight;
  return activeContract(c, variant)?.massRequired ?? false;
}

/** 케이블은 화면에서 '케이블 머신'(라이브러리 표기와 같게) */
const displayApparatus = (name: string) => (name === '케이블' ? '케이블 머신' : name);

/** kg 칸 이름 — '무게(봉 포함)' · '무게(한 손 · 한 개)' · '케이블 머신 설정값' · '도구 무게' */
export function kgLabel(c: RecordingContract | null, variant: 'band' | 'mass' | null | undefined): string {
  const a = activeContract(c, variant);
  return a ? massFieldLabel(a, displayApparatus) : '무게';
}

/** 계약이 정한 밴드 역할 — 없으면 세트마다 고른다(null) */
export const fixedRole = (a: RecordingContract | null) => a?.bandRole ?? null;

/** 기구 이름 다듬기 — 서버(recorded.ts readSetup)와 같게: 빈칸 하나로 · 앞뒤 빈칸 없이 · 40자까지. 열쇠는 NFC 소문자 */
export function setupRef(label: string): { key: string; label: string } | null {
  const text = Array.from(label.replace(/\s+/g, ' ').trim()).slice(0, SETUP_TEXT_MAX).join('');
  return text ? { key: text.normalize('NFC').toLowerCase(), label: text } : null;
}

/** 고른 단위 글자 → kg(소수 둘째 자리). 비었거나 0 이하 · 숫자 아님은 null */
function kgOf(text: string, unit: WeightUnit): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return storedKg(fromWeight(n, unit));
}

/** 화면에 보일 계획 — 어떤 칸 · 안내를 낼지(계약 · 서버 능력으로만) */
export type LoadPlan = {
  /** [밴드 | 무게] 고르기(alternative) */
  variantPicker: boolean;
  /** 저항 · 보조 · 모름(계약이 역할을 정하지 않은 밴드) */
  roleChips: boolean;
  /** 계약이 정한 역할 이름(보이기만) */
  roleText: string | null;
  bandPicker: boolean;
  /** 케이블 · 머신의 기구 이름 */
  setup: boolean;
  /** 덤벨 · 케틀벨 양손 무게가 다름 */
  unequal: boolean;
  /** 한 줄 안내 — 장비 확인 중 · 밴드 기록은 업데이트 뒤에 */
  notice: string | null;
};

export function loadPlan(c: RecordingContract | null, variant: 'band' | 'mass' | null | undefined, structured: boolean): LoadPlan {
  const none: LoadPlan = { variantPicker: false, roleChips: false, roleText: null, bandPicker: false, setup: false, unequal: false, notice: null };
  if (!c) return none;
  if (c.mode === 'unresolved') return { ...none, notice: '장비 확인 중인 운동이라 횟수 · 시간만 적어요' };
  const a = activeContract(c, variant);
  const plan: LoadPlan = { ...none, variantPicker: c.mode === 'alternative' };
  if (!a) return { ...plan, notice: c.mode === 'alternative' ? '밴드로 했는지 무게로 했는지 골라 주세요' : null };
  if (acceptsBand(a)) {
    if (!structured)
      return {
        ...plan,
        notice: a.mode === 'combined' ? '밴드 기록은 업데이트 뒤에 저장돼요. 지금은 무게 · 횟수만 적어요' : '밴드 기록은 업데이트 뒤에 저장돼요. 지금은 횟수 · 시간만 적어요',
      };
    const role = fixedRole(a);
    return { ...plan, bandPicker: true, roleChips: role == null, roleText: role ? BAND_ROLE_LABEL[role] : null };
  }
  if (!structured) return plan;
  return {
    ...plan,
    setup: a.mode === 'indicatedLoad',
    unequal: a.mode === 'externalMass' && a.massBasis === 'perImplement',
  };
}

/** 보낼 무게 — weightKg 는 옛 칸(서버가 아는 칸), load 는 구조화 무게(서버가 저장할 수 있을 때만) */
export type BuiltLoad =
  | { ok: true; weightKg: number | null; load?: RecordedLoad; loadResolver?: number; variant?: 'band' | 'mass' }
  | { ok: false; error: string; field?: 'weight' };

/**
 * 이번 세트의 무게를 계약 · 고름에서 만든다. 무게만 적는 세트는 load 를 싣지 않는다(weightKg 만 — 옛 서버도 그대로 받는다).
 * 밴드 · 섞임 · 양손 다른 무게 · 기구 이름만 load 로(서버가 저장할 수 있을 때만).
 */
export function buildSetLoad(input: {
  contract: RecordingContract | null;
  draft: LoadDraft;
  structured: boolean;
  /** 큰 kg 칸에 적은 값(kg). 칸이 없으면 null */
  kg: number | null;
  unit: WeightUnit;
}): BuiltLoad {
  const { contract: c, draft, structured, kg, unit } = input;
  if (!c) return { ok: true, weightKg: kg };
  const variant = c.mode === 'alternative' ? draft.variant : null;
  if (c.mode === 'alternative' && !variant) return { ok: false, error: '밴드로 했는지 무게로 했는지 골라 주세요.' };
  const a = activeContract(c, variant);
  if (!a) return { ok: false, error: '이 운동의 장비를 읽지 못했어요. 앱을 업데이트해 주세요.' };
  const v = variant ? { variant } : {};
  const role: BandRoleRecorded = fixedRole(a) ?? draft.role ?? 'unknown';

  if (a.mode === 'band') {
    if (!structured) return { ok: true, weightKg: null, ...v };
    return { ok: true, weightKg: null, load: { kind: 'band', role, bands: draft.bands }, loadResolver: RESOLVER_VERSION, ...v };
  }
  if (a.mode === 'combined') {
    if (!structured) return { ok: true, weightKg: kg, ...v };
    const mass = kg != null ? { basis: a.massBasis!, apparatusFamily: a.apparatusFamily, setup: null, kg, parts: null } : null;
    return { ok: true, weightKg: kg, load: { kind: 'combined', mass, band: { role, bands: draft.bands } }, loadResolver: RESOLVER_VERSION, ...v };
  }
  if (!acceptsMass(a)) return { ok: true, weightKg: null, ...v };

  /* 양손 무게가 다르다 — 한 kg 로 말하지 않는다(평균 · 두 배 · 합치기 없음). 같으면 그 한 개의 무게 */
  if (structured && draft.unequal && a.mode === 'externalMass' && a.massBasis === 'perImplement') {
    const left = kgOf(draft.left, unit);
    const right = kgOf(draft.right, unit);
    if (left == null || right == null) return { ok: false, error: '왼손 · 오른손 무게를 모두 적어 주세요.' };
    const parts: MassPiece[] = [
      { kg: left, count: 1, side: 'left' },
      { kg: right, count: 1, side: 'right' },
    ];
    const one = left === right ? left : null;
    return {
      ok: true,
      weightKg: one,
      load: { kind: 'mass', basis: a.massBasis, apparatusFamily: a.apparatusFamily, setup: null, kg: one, parts },
      loadResolver: RESOLVER_VERSION,
      ...v,
    };
  }
  /* 케이블 · 머신의 기구 이름 — 무게를 적었을 때만 붙인다(이름만으로는 남길 것이 없다) */
  const setup = structured && a.mode === 'indicatedLoad' ? setupRef(draft.setup) : null;
  if (setup && kg != null)
    return {
      ok: true,
      weightKg: kg,
      load: { kind: 'mass', basis: a.massBasis!, apparatusFamily: a.apparatusFamily, setup, kg, parts: null },
      loadResolver: RESOLVER_VERSION,
      ...v,
    };
  return { ok: true, weightKg: kg, ...v };
}

/** 남긴 세트 하나 → 고칠 때의 고름(그 세트의 밴드 · 역할 · 기구 이름 · 양손 무게 · 변형) */
export function loadDraftOfSet(
  set: { weightKg: number | null; load?: RecordedLoad | null; variant?: 'band' | 'mass' | null },
  c: RecordingContract | null,
  unit: WeightUnit
): LoadDraft {
  const l = set.load ?? null;
  const band = l?.kind === 'band' ? l : l?.kind === 'combined' ? l.band : null;
  const mass = l?.kind === 'mass' ? l : l?.kind === 'combined' ? l.mass : null;
  const variant =
    c?.mode === 'alternative' ? (set.variant ?? (l?.kind === 'band' ? 'band' : set.weightKg != null || l?.kind === 'mass' ? 'mass' : null)) : null;
  const left = mass?.parts?.find((p) => p.side === 'left');
  const right = mass?.parts?.find((p) => p.side === 'right');
  const shown = (kg: number) => String(round1(toWeight(kg, unit)));
  return {
    variant,
    role: band ? band.role : null,
    bands: band ? [...band.bands] : [],
    setup: mass?.setup?.label ?? '',
    unequal: !!(left && right),
    left: left ? shown(left.kg) : '',
    right: right ? shown(right.kg) : '',
  };
}

/**
 * EX-LOAD01-R1 — 내 장비 목표 → 다음 세트 칸(고름). 운동 화면은 아직 손대지 않은 칸만 이것으로 채우고(고치던 칸 · 남긴 세트는 그대로),
 * 목표 창은 지금 목표로 칸을 열 때 쓴다. 양손 무게는 고른 단위 글자로.
 */
export function loadDraftOfTarget(t: LoadTarget | null | undefined, unit: WeightUnit): LoadDraft | null {
  if (!t) return null;
  const s = seedOfLoadTarget(t);
  const shown = (kg: number | null) => (kg == null ? '' : String(round1(toWeight(kg, unit))));
  return { variant: s.variant, role: s.role, bands: s.bands, setup: s.setupLabel, unequal: s.unequal, left: shown(s.leftKg), right: shown(s.rightKg) };
}

/** 밴드 하나를 짧게 — 줄 · 요약에. 카탈로그 단계는 '노랑 밴드' · '노랑 튜브', 다른 상표는 '상표 · 단계' */
export function bandShortText(b: BandComponent): string {
  if ('custom' in b) return `${b.custom.brand} ${b.custom.level}`;
  const s = seriesById(b.seriesId);
  return `${b.label.ko} ${s?.kind === 'tubing' ? '튜브' : '밴드'}`;
}

const roleWord = (role: BandRoleRecorded) => (role === 'unknown' ? '역할 모름' : BAND_ROLE_LABEL[role]);

/** 다음 세트에 쓸 밴드 고름을 한 줄로(아래 막대) — '저항 밴드 · 노랑 밴드' / '밴드 아직 안 고름' */
export function draftBandSummary(c: RecordingContract | null, draft: LoadDraft): string | null {
  const a = activeContract(c, draft.variant);
  if (!a || !acceptsBand(a)) return null;
  const role = fixedRole(a) ?? draft.role;
  const bands = draft.bands.length ? draft.bands.map(bandShortText).join(' + ') : '밴드 아직 안 고름';
  return role && role !== 'unknown' ? `${BAND_ROLE_LABEL[role]} · ${bands}` : bands;
}

/**
 * 남긴 세트 줄에 쓸 무게 글 — kg(받는 운동만) · 양손 다른 무게 · 밴드 · 기구 이름. 받지 않는 운동의 옛 kg(포고 홉의 시험 kg 등)은 지우지 않고
 * excludedKg 로 따로 돌려준다(줄에 '계산에서 뺐어요'로 흐리게).
 */
export function setLoadText(
  set: { weightKg: number | null; load?: RecordedLoad | null; variant?: 'band' | 'mass' | null },
  c: RecordingContract | null,
  unit: WeightUnit
): { kg: string | null; detail: string | null; excludedKg: number | null } {
  const l = set.load ?? null;
  const variant = c?.mode === 'alternative' ? (set.variant ?? (l?.kind === 'band' ? 'band' : set.weightKg != null ? 'mass' : null)) : null;
  const kgOk = showsKg(c, variant);
  const mass = l?.kind === 'mass' ? l : l?.kind === 'combined' ? l.mass : null;
  const band = l?.kind === 'band' ? l : l?.kind === 'combined' ? l.band : null;
  let kg: string | null = null;
  if (mass?.parts && mass.parts.length && mass.kg == null) {
    kg = mass.parts.map((p) => `${p.side === 'left' ? '왼' : p.side === 'right' ? '오' : ''}${p.side ? ' ' : ''}${formatWeight(p.kg, unit)}`).join(' · ');
  } else if (set.weightKg != null && kgOk) kg = formatWeight(set.weightKg, unit);
  const detail: string[] = [];
  if (band) detail.push(`${roleWord(band.role)} · ${band.bands.length ? band.bands.map((b) => bandText(b)).join(' + ') : '어느 밴드인지 모름'}`);
  if (mass?.setup?.label) detail.push(mass.setup.label);
  return { kg, detail: detail.length ? detail.join(' · ') : null, excludedKg: !kgOk && set.weightKg != null ? set.weightKg : null };
}

/* ───────────────────────────── 기억 ───────────────────────────── */

/*
 * 마지막에 쓴 밴드 — 계정 · 운동 · 역할마다(AsyncStorage). 다른 판의 카탈로그로 고른 것 · 이제 없는 단계는 맞지 않는 고름이라 지운다.
 * 못 읽고 못 써도 운동은 그대로(기억은 편의일 뿐).
 */
const bandsKey = (owner: string, exerciseId: string, role: BandRoleRecorded) => `bullpen-band-last:v1:${owner}:${exerciseId}:${role}`;
const roleKey = (owner: string, exerciseId: string) => `bullpen-band-role:v1:${owner}:${exerciseId}`;

export async function rememberBands(owner: string, exerciseId: string, role: BandRoleRecorded, bands: readonly BandComponent[]): Promise<void> {
  try {
    if (bands.length) await AsyncStorage.setItem(bandsKey(owner, exerciseId, role), JSON.stringify({ catalog: BAND_CATALOG_REVISION, bands }));
  } catch {
    /* 기억은 편의 — 못 써도 그만 */
  }
}

export async function recallBands(owner: string, exerciseId: string, role: BandRoleRecorded): Promise<BandComponent[] | null> {
  const key = bandsKey(owner, exerciseId, role);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as { catalog?: unknown; bands?: unknown };
    const list = Array.isArray(o.bands) ? o.bands : [];
    const clean = list.map((b) => cleanBandComponent(b));
    const fits = o.catalog === BAND_CATALOG_REVISION && clean.length > 0 && clean.length <= MAX_BANDS && clean.every((b) => b != null);
    if (!fits) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return clean as BandComponent[];
  } catch {
    return null;
  }
}

export async function rememberRole(owner: string, exerciseId: string, role: BandRoleRecorded): Promise<void> {
  try {
    await AsyncStorage.setItem(roleKey(owner, exerciseId), role);
  } catch {
    /* 기억은 편의 */
  }
}

export async function recallRole(owner: string, exerciseId: string): Promise<BandRoleRecorded | null> {
  try {
    const v = await AsyncStorage.getItem(roleKey(owner, exerciseId));
    return v === 'resistance' || v === 'assistance' || v === 'unknown' ? v : null;
  } catch {
    return null;
  }
}
