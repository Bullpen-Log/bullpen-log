/**
 * EX-LOAD01 — 세트마다 얼리는 무게 스냅샷(UserExerciseSet.load JSONB, 스키마 적용 뒤). 순수 — 서버 · v2 명령 · 시험이 같이 쓴다.
 *
 * 스냅샷에는 그 세트를 받을 때의 **실제 계약**(alternative 면 고른 변형의 계약), 고른 변형, 정규화한 무게, 상태, 출처가 들어 있다.
 * 읽는 쪽은 이 계약을 권위로 쓴다 — 나중에 라이브러리 장비 · 예외 · 카탈로그 글이 바뀌어도, 판(세션)에 얼린 계약이 달라도 그 세트의
 * 뜻은 이것이다(GPT 서브1 점검 3).
 */

import { RESOLVER_VERSION, type BandRole, type LoadMode, type MassBasis, type RecordingContract } from '@/lib/workout/load/contract';
import { readRecordedLoad, type LoadStatus, type RecordedLoad } from '@/lib/workout/load/recorded';

export const LOAD_SNAPSHOT_VERSION = 1;

export type SnapshotContract = {
  resolver: number;
  mode: LoadMode;
  basis: MassBasis | null;
  apparatusFamily: string | null;
  role: BandRole | null;
  key: string;
  e1rm: boolean;
  massRequired: boolean;
  readiness: 'ready' | 'unresolved';
};

export type LoadSnapshot = {
  v: typeof LOAD_SNAPSHOT_VERSION;
  contract: SnapshotContract;
  variant: 'band' | 'mass' | null;
  value: RecordedLoad;
  status: LoadStatus;
  provenance: string;
};

export function snapshotOf(value: { load: RecordedLoad; status: LoadStatus; contract: RecordingContract; variant: 'band' | 'mass' | null; provenance: string }): LoadSnapshot {
  const c = value.contract;
  return {
    v: LOAD_SNAPSHOT_VERSION,
    contract: {
      resolver: c.resolver,
      mode: c.mode,
      basis: c.massBasis,
      apparatusFamily: c.apparatusFamily,
      role: c.bandRole,
      key: c.key,
      e1rm: c.e1rmEligible,
      massRequired: c.massRequired,
      readiness: c.readiness,
    },
    variant: value.variant,
    value: value.load,
    status: value.status,
    provenance: value.provenance,
  };
}

const MODES: ReadonlySet<string> = new Set(['none', 'externalMass', 'indicatedLoad', 'implementMass', 'band', 'combined', 'alternative', 'unresolved']);

/** 저장된 JSON → 스냅샷. 모르는 판 · 모양이면 null(읽는 쪽은 그 줄을 '확인 전'으로 본다) */
export function readSnapshot(raw: unknown): LoadSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== LOAD_SNAPSHOT_VERSION) return null;
  const c = o.contract as Record<string, unknown> | null;
  if (!c || typeof c !== 'object' || typeof c.mode !== 'string' || !MODES.has(c.mode) || typeof c.key !== 'string') return null;
  const value = readRecordedLoad(o.value);
  if (!value) return null;
  const status: LoadStatus = o.status === 'legacyIncompatible' || o.status === 'unknownBand' ? o.status : 'ok';
  return {
    v: LOAD_SNAPSHOT_VERSION,
    contract: {
      resolver: typeof c.resolver === 'number' ? c.resolver : 0,
      mode: c.mode as LoadMode,
      basis: typeof c.basis === 'string' ? (c.basis as MassBasis) : null,
      apparatusFamily: typeof c.apparatusFamily === 'string' ? c.apparatusFamily : null,
      role: c.role === 'resistance' || c.role === 'assistance' ? c.role : null,
      key: c.key,
      e1rm: c.e1rm === true,
      massRequired: c.massRequired === true,
      readiness: c.readiness === 'unresolved' ? 'unresolved' : 'ready',
    },
    variant: o.variant === 'band' || o.variant === 'mass' ? o.variant : null,
    value,
    status,
    provenance: typeof o.provenance === 'string' ? o.provenance : 'unknown',
  };
}

/** 스냅샷의 계약을 읽기 관문이 쓰는 계약 모양으로(장비 목록은 없다 — 판단은 이미 끝났다) */
export function contractFromSnapshot(s: SnapshotContract): RecordingContract {
  return {
    resolver: RESOLVER_VERSION,
    sourceEquipment: [],
    overrides: null,
    mode: s.mode,
    massBasis: s.basis,
    apparatusFamily: s.apparatusFamily,
    bandRole: s.role,
    bandRoleSource: s.role ? 'override' : null,
    massRequired: s.massRequired,
    e1rmEligible: s.e1rm,
    readiness: s.readiness,
    reason: null,
    variants: null,
    key: s.key,
  };
}
