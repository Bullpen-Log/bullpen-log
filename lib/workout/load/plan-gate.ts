/**
 * EX-LOAD01 — 판(세션)을 이미 읽은 곳이 쓰는 읽기 관문 도우미. 순수 — 서버 · v2 명령 · 시험이 같이 쓴다.
 *
 * 판 JSON 의 운동마다 얼린 계약(이번 판부터) · 얼린 장비(옛 판)를 근거로 줄을 본다. 판에 없는 운동은 부르는 쪽이 준 '지금 계약'
 * (근거 'current' — 그 kg 은 늘 확인 전)으로, 그것도 없으면 모르는 장비(계산에서 뺀다). 세트 스냅샷이 있으면 그것이 이긴다.
 */

import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { contractOfFrozen, hasFrozenContract, type FrozenLoadSource } from '@/lib/workout/load/frozen';
import { viewSetLoad, type LoadReadContext, type SetLoadView } from '@/lib/workout/load/gate';
import type { LoadSnapshot } from '@/lib/workout/load/snapshot';

const MISSING = resolveRecordingContract({ equipment: ['__missing__'] });

export function planContextOf(
  planExercises: readonly FrozenLoadSource[] | null | undefined,
  current?: ReadonlyMap<string, RecordingContract> | null
): (exerciseId: string) => LoadReadContext {
  const frozen = new Map<string, LoadReadContext>();
  for (const e of planExercises ?? []) {
    if (!e || typeof e.id !== 'string') continue;
    frozen.set(e.id, { exerciseId: e.id, contract: contractOfFrozen(e), evidence: hasFrozenContract(e) ? 'contract' : 'equipment' });
  }
  return (exerciseId) =>
    frozen.get(exerciseId) ?? { exerciseId, contract: current?.get(exerciseId) ?? MISSING, evidence: 'current' };
}

/** 줄들에 관문을 씌운다 — view 를 붙여 돌려준다(원래 weightKg 는 그대로 둔다) */
export function gateRows<T extends { exerciseId: string; weightKg: number | null; id?: string }>(
  rows: readonly T[],
  ctxOf: (exerciseId: string) => LoadReadContext,
  snapshots?: ReadonlyMap<string, LoadSnapshot> | null
): (T & { view: SetLoadView })[] {
  return rows.map((r) => ({
    ...r,
    view: viewSetLoad(ctxOf(r.exerciseId), { weightKg: r.weightKg, snapshot: r.id ? (snapshots?.get(r.id) ?? null) : null }),
  }));
}

/** 요약(UserExerciseLog)에 접을 줄 — kg 은 보일 값만(확인 전 · 맞지 않는 kg 은 요약에 올리지 않는다. 원래 세트 줄은 그대로) */
export function forSummary<T extends { weightKg: number | null; view: SetLoadView }>(rows: readonly T[]): (T & { weightKg: number | null })[] {
  return rows.map((r) => ({ ...r, weightKg: r.view.displayKg }));
}

/** kg 총량에 넣을 줄 — 견줄 수 있는 무게만(metricKg) */
export function forTonnage<T extends { weightKg: number | null; view: SetLoadView }>(rows: readonly T[]): (T & { weightKg: number | null })[] {
  return rows.map((r) => ({ ...r, weightKg: r.view.metricKg }));
}
