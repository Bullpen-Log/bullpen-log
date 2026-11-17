import { randomUUID } from 'node:crypto';
import { isOptionalProgramExercise } from '@/lib/program/program';
import type { FrozenExercise, SetTarget } from '@/lib/workout/session-plan';

/**
 * EX-RX01 R2A — 운동 판 JSON 의 v2 칸(순수). DB · 화면을 모른다.
 *
 * 판 JSON 은 그대로 두고 두 곳에만 더한다.
 * - 운동 객체마다 `entryId`(이 판 안의 운동 자리 하나 — 순서를 바꿔도 그대로, 교체하면 새 자리).
 * - 판 맨 위 `v2` — 자리마다 계획 세트 열쇠 · 현재 목표 번호, 빠진 자리 보관, 프로그램 원래 의무(ledger).
 *
 * 옛 쓰기(readFrozenPlan 으로 읽어 통째로 다시 쓰는 길)는 맨 위 `v2` 를 버린다. 그래서 v2 판은 옛 쓰기가 손대지 못하게
 * 막는다(gate.ts + DB 울타리 trigger). 읽기(readFrozenPlan)는 운동 객체를 통째로 지나가게 하므로 entryId 가 남는다.
 */

export const PLAN_V2_KEY = 'v2';
export const PLAN_V2_PROTOCOL = 2;

/** 이 판의 v2 칸을 어떻게 얻었나 — 시작 때 찍었나, 진행 중인 옛 판을 옮겨 왔나(그때 찍은 것이라고 말하지 않는다) */
export type Provenance = 'captured_at_start' | 'captured_on_adoption';

export type EntryMeta = {
  exerciseId: string;
  /** 처방 세트의 열쇠 — 차례가 곧 처방 차례. 세트 번호(setNo) · 화면 줄 번호와 무관하다 */
  plannedSetKeys: string[];
  /** 다음에 새 열쇠를 만들 번호(지운 열쇠를 다시 쓰지 않게) */
  nextKeyNo: number;
  currentRevisionId: string | null;
  /** 이 자리의 목표 판 번호(1부터). 같은 자리의 동시 저장을 가른다 */
  revisionSeq: number;
  /** 교체로 생긴 자리면 원래 자리 */
  replacedFrom?: string | null;
  createdAt: string;
};

export type ArchivedEntry = { entryId: string; exerciseId: string; reason: 'removed' | 'replaced'; at: string; snapshot: unknown };

/** 프로그램 원래 의무 — 판에 프로그램 처방을 붙인 순간 얼린다. 나중의 빼기 · 교체 · 개인 목표가 분모를 줄이지 못한다(설계 13B) */
export type ProgramObligations = {
  enrollmentId: string | null;
  programKey: string;
  day: number;
  policyVersion: 1;
  frozenAt: string;
  provenance: Provenance;
  slots: ObligationSlot[];
};

export type ObligationSlot = {
  slotKey: string;
  entryId: string;
  exerciseId: string;
  required: boolean;
  setKeys: string[];
};

export type SafetyState = {
  epoch: number;
  /** 알고 있는 마지막 판정. unknown = 체크인을 못 봤다(통증 없음이 아니다) */
  state: 'clear' | 'pain_no_increase' | 'stop' | 'unknown';
  source: string;
  at: string;
};

export type PlanV2 = {
  protocol: typeof PLAN_V2_PROTOCOL;
  provenance: Provenance;
  adoptedAt: string;
  entries: Record<string, EntryMeta>;
  /** 교체로 원래 자리를 이어받은 짝 — 의무 세기가 쓴다 */
  substitutions: { fromEntryId: string; toEntryId: string }[];
  archived: ArchivedEntry[];
  obligations: ProgramObligations | null;
  safety: SafetyState | null;
};

export type RawPlan = Record<string, unknown> & { exercises?: unknown };
export type RawExercise = Record<string, unknown> & { id?: unknown; entryId?: unknown };

export function newEntryId(): string {
  return `e_${randomUUID().replace(/-/g, '')}`;
}

export function plannedSetKey(entryId: string, n: number): string {
  return `${entryId}:s${n}`;
}

/** 처방 세트 수 — % 방식이면 세트마다 목표의 수, 아니면 plannedSets. 모르면 0(열쇠 없음 = 처방 세트 모름) */
export function prescribedSetCount(ex: Pick<FrozenExercise, 'plannedSets' | 'setTargets'>): number {
  if (ex.setTargets && ex.setTargets.length) return ex.setTargets.length;
  return ex.plannedSets != null && ex.plannedSets > 0 ? ex.plannedSets : 0;
}

export function readPlanV2(raw: unknown): PlanV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = (raw as RawPlan)[PLAN_V2_KEY];
  if (!v || typeof v !== 'object') return null;
  const p = v as Partial<PlanV2>;
  if (p.protocol !== PLAN_V2_PROTOCOL || !p.entries || typeof p.entries !== 'object') return null;
  return {
    protocol: PLAN_V2_PROTOCOL,
    provenance: p.provenance === 'captured_at_start' ? 'captured_at_start' : 'captured_on_adoption',
    adoptedAt: typeof p.adoptedAt === 'string' ? p.adoptedAt : '',
    entries: p.entries as Record<string, EntryMeta>,
    substitutions: Array.isArray(p.substitutions) ? p.substitutions : [],
    archived: Array.isArray(p.archived) ? p.archived : [],
    obligations: p.obligations ?? null,
    safety: p.safety ?? null,
  };
}

export function rawExercises(raw: RawPlan): RawExercise[] {
  return Array.isArray(raw.exercises) ? (raw.exercises as RawExercise[]) : [];
}

/** 판의 운동 하나를 자리 번호로 — 없으면 null */
export function entryOf(raw: RawPlan, entryId: string): RawExercise | null {
  return rawExercises(raw).find((e) => e?.entryId === entryId) ?? null;
}

/** 지금 판에서 그 운동(exerciseId)을 하는 자리 — 한 운동에 자리는 하나(지금 규칙 그대로) */
export function entryIdOfExercise(raw: RawPlan, exerciseId: string): string | null {
  const e = rawExercises(raw).find((x) => x?.id === exerciseId);
  return typeof e?.entryId === 'string' ? e.entryId : null;
}

/**
 * 옛 판을 v2 로 옮긴다(순수) — 운동마다 자리 번호 · 계획 세트 열쇠를 붙이고, 프로그램 판이면 원래 의무를 얼린다.
 * 이미 v2 면 그대로 돌려준다. 받은 판의 다른 칸은 그대로 둔다(모르는 칸도 버리지 않는다).
 *
 * 시작 때 바로 v2 로 만든 판이면 provenance 'captured_at_start', 진행 중인 옛 판을 옮기면 'captured_on_adoption' —
 * 그 경우 이미 한 운동 · 빼거나 바꾼 운동의 원래 처방은 알 수 없으므로 의무는 '옮긴 때 판에 남은 프로그램 운동'으로만 얼리고 그렇게 적는다.
 */
export function adoptPlan(
  raw: RawPlan,
  opts: { provenance: Provenance; now: string; enrollmentId?: string | null; idGen?: () => string }
): { plan: RawPlan; v2: PlanV2; changed: boolean } {
  const existing = readPlanV2(raw);
  if (existing) return { plan: raw, v2: existing, changed: false };
  const gen = opts.idGen ?? newEntryId;
  const entries: Record<string, EntryMeta> = {};
  const exercises = rawExercises(raw).map((e) => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string') return e;
    const entryId = typeof e.entryId === 'string' && e.entryId ? e.entryId : gen();
    const n = prescribedSetCount(e as unknown as FrozenExercise);
    entries[entryId] = {
      exerciseId: e.id,
      plannedSetKeys: Array.from({ length: n }, (_, i) => plannedSetKey(entryId, i + 1)),
      nextKeyNo: n + 1,
      currentRevisionId: null,
      revisionSeq: 0,
      replacedFrom: null,
      createdAt: opts.now,
    };
    return { ...e, entryId };
  });
  const v2: PlanV2 = {
    protocol: PLAN_V2_PROTOCOL,
    provenance: opts.provenance,
    adoptedAt: opts.now,
    entries,
    substitutions: [],
    archived: [],
    obligations: null,
    safety: null,
  };
  const next: RawPlan = { ...raw, exercises };
  v2.obligations = freezeObligations(next, v2, { now: opts.now, provenance: opts.provenance, enrollmentId: opts.enrollmentId ?? null });
  next[PLAN_V2_KEY] = v2;
  return { plan: next, v2, changed: true };
}

/** 판의 프로그램 표시(program)와 프로그램 운동으로 원래 의무를 얼린다. 프로그램 판이 아니면 null */
export function freezeObligations(
  raw: RawPlan,
  v2: PlanV2,
  opts: { now: string; provenance: Provenance; enrollmentId: string | null }
): ProgramObligations | null {
  const program = raw.program as { key?: unknown; day?: unknown; rowId?: unknown } | null | undefined;
  if (!program || typeof program.key !== 'string' || typeof program.day !== 'number') return null;
  const slots: ObligationSlot[] = [];
  for (const e of rawExercises(raw)) {
    const ex = e as unknown as FrozenExercise & { entryId?: string };
    if (!ex?.programSlot || typeof ex.entryId !== 'string') continue;
    const meta = v2.entries[ex.entryId];
    if (!meta) continue;
    slots.push({
      slotKey: `${ex.programSlot.slot}:${ex.programSlot.variant}`,
      entryId: ex.entryId,
      exerciseId: ex.id,
      required: !isOptionalProgramExercise(ex),
      setKeys: [...meta.plannedSetKeys],
    });
  }
  return {
    enrollmentId: opts.enrollmentId ?? (typeof program.rowId === 'string' ? program.rowId : null),
    programKey: program.key,
    day: program.day,
    policyVersion: 1,
    frozenAt: opts.now,
    provenance: opts.provenance,
    slots,
  };
}

/** 처방 세트마다의 목표(% 방식 · '+' · 남기기 뜻을 그대로) — 같은 세트면 모두 같은 값 */
export type PlannedSetTarget = {
  key: string;
  reps: number | null;
  holdSeconds: number | null;
  kg: number | null;
  plus: boolean;
  reserve: number | null;
};

export function recommendedSetTargets(ex: FrozenExercise, keys: readonly string[]): PlannedSetTarget[] {
  const reserve = ex.programSlot?.reserve ?? null;
  const per: (SetTarget | null)[] = ex.setTargets && ex.setTargets.length ? ex.setTargets : [];
  return keys.map((key, i) => {
    const t = per[i] ?? null;
    return {
      key,
      reps: ex.isHold ? null : t ? t.reps : (ex.plannedReps ?? null),
      holdSeconds: ex.isHold ? (ex.plannedHoldSeconds ?? null) : null,
      kg: t ? t.kg : ex.setTargets && ex.setTargets.length ? null : (ex.suggestedKg ?? null),
      plus: t?.plus === true,
      reserve,
    };
  });
}
