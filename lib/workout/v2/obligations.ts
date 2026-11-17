import { setsNeeded } from '@/lib/program/program';
import type { PlanV2, ProgramObligations } from '@/lib/workout/v2/plan-v2';

/**
 * EX-RX01 R2A — 프로그램 일차 넘기기의 원래 의무 세기(순수).
 *
 * 지금 정책 그대로: 원래 필수 처방 세트 합의 절반(setsNeeded)만큼 남기면 넘긴다. 바꾸는 것은 분모 · 세는 법뿐이다.
 * - 분모 = 얼린 원래 의무(필수 자리의 처방 세트 열쇠 수). 운동을 빼거나 바꾸거나 목표를 줄여도 줄지 않는다.
 * - 원래 열쇠 하나는 남긴 세트 하나로만 채워진다(같은 의무를 두 번 세지 않는다). 더 한 세트 · 선택 운동 · 연결 안 된 코치 세트는 안 늘린다.
 * - 교체로 이어받은 자리의 세트는 원래 자리의 남은 열쇠를 차례로 채운다.
 * - 열쇠를 모르는 세트(옛 앱 · 열쇠 없이 들어온 세트)는 그 자리의 남은 열쇠를 차례로 채운다 — 자리 밖으로는 안 넘친다.
 * - 개인 목표를 바꿨다는 것만으로 넘기기를 막지 않는다(설계 13B 정정). 넘겼다는 것이 원래 처방을 다 했다는 뜻은 아니다.
 */

export type SetFact = {
  entryId: string | null;
  exerciseId: string;
  plannedSetKey: string | null;
  /** 코치가 남긴 세트 등 의무에 연결하지 않을 세트 */
  countsForObligation: boolean;
};

export type ObligationCount = { total: number; needed: number; filled: number; filledKeys: string[]; meets: boolean };

export function countObligations(ledger: ProgramObligations, v2: PlanV2, facts: readonly SetFact[]): ObligationCount {
  const required = ledger.slots.filter((s) => s.required);
  const total = required.reduce((n, s) => n + s.setKeys.length, 0);
  const needed = total > 0 ? setsNeeded(total) : 0;
  const filled = new Set<string>();
  /* 자리 → 그 자리를 이어받은(교체된) 자리들. 교체가 이어질 수 있어 끝까지 따라간다 */
  const heirs = new Map<string, string>();
  for (const s of v2.substitutions) heirs.set(s.toEntryId, s.fromEntryId);
  const rootOf = (entryId: string): string => {
    let cur = entryId;
    const seen = new Set<string>();
    while (heirs.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = heirs.get(cur)!;
    }
    return cur;
  };
  const slotByEntry = new Map(required.map((s) => [s.entryId, s]));
  const allKeys = new Set(required.flatMap((s) => s.setKeys));
  /* 1) 열쇠가 바로 원래 의무 열쇠인 세트부터 */
  const pending: { slotEntry: string }[] = [];
  for (const f of facts) {
    if (!f.countsForObligation || !f.entryId) continue;
    const root = rootOf(f.entryId);
    const slot = slotByEntry.get(root);
    if (!slot) continue;
    if (f.plannedSetKey && allKeys.has(f.plannedSetKey)) {
      /* 같은 열쇠의 두 번째 세트 · 다른 자리의 열쇠는 세지 않는다(한 의무는 한 번만) */
      if (slot.setKeys.includes(f.plannedSetKey) && !filled.has(f.plannedSetKey)) filled.add(f.plannedSetKey);
    } else {
      pending.push({ slotEntry: root });
    }
  }
  /* 2) 열쇠가 없거나(옛 세트) 이어받은 자리의 세트 · 그 자리에서 새로 붙인 열쇠는 그 원래 자리의 남은 열쇠를 차례로 */
  for (const p of pending) {
    const slot = slotByEntry.get(p.slotEntry)!;
    const free = slot.setKeys.find((k) => !filled.has(k));
    if (free) filled.add(free);
  }
  const filledKeys = [...filled];
  return { total, needed, filled: filledKeys.length, filledKeys, meets: total > 0 && filledKeys.length >= needed };
}

/** 프로그램 효과의 열쇠 — 한 회차의 한 일차에 결정은 하나(넘김 · 건너뜀 · 보류) */
export function programEffectKey(enrollmentId: string, day: number): string {
  return `program:${enrollmentId}:day:${day}`;
}
