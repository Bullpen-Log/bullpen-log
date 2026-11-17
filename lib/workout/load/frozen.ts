/**
 * EX-LOAD01 — 얼린 운동(판 JSON 의 운동 하나)의 기록 계약. 순수 — 서버 · 시험 · 앱이 같이 쓴다.
 *
 * 이번 판부터는 찍어 둔 계약(load)을 그대로, 그 앞의 판은 그 판에 얼린 장비(equipment)로 같은 규칙을 다시 푼다 — 지금 라이브러리
 * 장비가 아니라 그때 장비라서, 장비를 나중에 바꿔도 지난 판의 세트 뜻이 바뀌지 않는다.
 */

import { RESOLVER_VERSION, resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { overridesFor } from '@/lib/workout/load/overrides';

export type FrozenLoadSource = {
  id: string;
  equipment?: unknown;
  category?: unknown;
  isHold?: unknown;
  load?: unknown;
};

/** 찍어 둔 계약이 이 해석기 판의 것인가 */
export function hasFrozenContract(e: Pick<FrozenLoadSource, 'load'>): e is { load: RecordingContract } {
  const l = e.load as Partial<RecordingContract> | null | undefined;
  return !!l && typeof l === 'object' && l.resolver === RESOLVER_VERSION && typeof l.mode === 'string' && typeof l.key === 'string';
}

export function contractOfFrozen(e: FrozenLoadSource): RecordingContract {
  if (hasFrozenContract(e)) return e.load;
  /* 계약을 찍기 전의 옛 판 — 그때 장비 + 코드 검토 표만. 관리자 뜻 설정(나중에 저장한 값)으로 지난 판의 뜻을 바꾸지 않는다(R1-04) */
  return resolveRecordingContract({
    exerciseId: typeof e.id === 'string' ? e.id : null,
    equipment: Array.isArray(e.equipment) ? (e.equipment as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    category: typeof e.category === 'string' ? e.category : null,
    isHold: e.isHold === true,
    overrides: overridesFor(e.id),
  });
}

/**
 * 라이브러리 줄 하나(지금 장비)의 계약 — 판이 없는 옛 줄의 'current' 근거 · 화면의 대비책. 운동 번호를 꼭 넘긴다(검토한 1RM 허용 목록 ·
 * 검토 예외가 번호로 붙는다 — 빠지면 모든 줄의 1RM 이 꺼졌다, GPT 서브1 사전 점검).
 *
 * EX-LOAD01 R1-04 — 줄에 loadSemantics 칸이 실려 있으면(스키마 스위치가 켜졌을 때만 lib/library-cache.ts 가 싣는다) 관리자 뜻 설정까지
 * 앞서는 차례대로 쓴다. 칸이 없으면(undefined — 스위치 꺼짐) 코드 검토 표만 — 예전과 같은 값.
 */
export function contractOfLibraryRow(ex: {
  id: string;
  equipment: string[];
  category: string;
  reps: number | null;
  holdSeconds: number | null;
  movementPattern?: string | null;
  loadSemantics?: unknown;
}): RecordingContract {
  return resolveRecordingContract({
    exerciseId: ex.id,
    equipment: ex.equipment,
    category: ex.category,
    isHold: ex.holdSeconds != null && ex.reps == null,
    movementPattern: ex.movementPattern ?? null,
    overrides: overridesFor(ex.id, ex.loadSemantics),
  });
}
