import 'server-only';
import { createHash } from 'node:crypto';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { exercisesByIds } from '@/lib/library-cache';
import type { FrozenExercise } from '@/lib/workout/session-plan';
import type { CommandOutcome, LegacyLoadRecovery, LoadPrep } from '@/lib/workout/v2/command';
import { entryIdOfExercise, rawExercises, readPlanV2, type RawPlan } from '@/lib/workout/v2/plan-v2';
import type { FieldOp, TargetField, TargetPatch } from '@/lib/workout/v2/revision';
import { runOwn, withOwnerLock } from '@/lib/workout/v2/gate';
import { insertRecovery, type Tx } from '@/lib/workout/v2/store';

/**
 * EX-RX01 R2A — 옛 화면 · 옛 앱의 요청을 v2 판에 맞게 옮기는 길(어댑터). gate.isV2Session 이 참일 때만 부른다(기본 꺼짐이면 안 불린다).
 *
 * - 옛 클라이언트는 작업 번호 · 목표 판 · 계획 세트 열쇠를 모른다. 그래서 그 요청으로 남긴 세트는 목표 연결이 '모름'(null)이다 —
 *   지금 목표에 몰래 붙이지 않는다(설계 10절).
 * - 옛 클라이언트는 오류가 오면 기기에 쥔 세트를 버린다. 그러니 받을 수 없는 세트(지운 세트 되살리기 · 마친 판 · 다른 값 충돌)는
 *   먼저 복구함(WorkoutRecoveryItem)에 남기고 나서 '받았다'고 답한다 — 사실을 잃지 않게. 복구함은 사람이 보고 정리한다(다음 단계 화면).
 */

const LEGACY_SET_PREFIX = 'lg_';

/** 옛 화면의 (판, 운동, 세트 번호)는 그 화면에서 세트 하나를 가리킨다 — 같은 셋이면 같은 번호(다시 보내면 같은 세트) */
export function legacyClientSetId(sessionId: string, exerciseId: string, setNo: number, reuse = 0): string {
  return LEGACY_SET_PREFIX + createHash('sha256').update(`${sessionId}\u0000${exerciseId}\u0000${setNo}\u0000${reuse}`).digest('hex').slice(0, 40);
}

async function planOf(sessionId: string, userId: string): Promise<RawPlan | null> {
  const row = await prisma.trainingSession.findFirst({ where: { id: sessionId, userId }, select: { plan: true } });
  return row?.plan && typeof row.plan === 'object' ? (row.plan as RawPlan) : null;
}

async function keepAsRecovery(userId: string, source: string, fingerprint: string, sessionId: string, exerciseId: string | null, code: string, payload: unknown) {
  await withOwnerLock(userId, (tx) =>
    insertRecovery(tx as unknown as Tx, { ownerId: userId, actorId: userId, source, fingerprint, sessionId, exerciseId, conflictCode: code, payload })
  );
}

/**
 * EX-LOAD01 — legacyLoad: 옛 앱이 장비가 받지 않는 kg 을 보낸 세트의 원래 요청(지문 · 내용). weightKg 는 부르는 쪽이 이미 비웠다.
 * loadSnapshot: 세트 무게 스냅샷. 둘 다 v2 명령(set.record · set.correct)과 **같은 거래**에서 남는다(세트 · 복구 · 영수증 · 스냅샷이 함께).
 */
export type LegacySetInput = {
  exerciseId: string;
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  holdSeconds: number | null;
  rir?: number | null;
  recordedAt?: string;
  legacyLoad?: LegacyLoadRecovery | null;
  loadSnapshot?: unknown;
  /** 구조화 스키마 서버 — 명령 거래 안에서 지금 줄로 다시 정규화할 요청(있으면 loadSnapshot · legacyLoad 대신) */
  loadPrep?: LoadPrep | null;
};

/**
 * 옛 logSet. 옛 앱은 (운동, 세트 번호)로 세트 하나를 가리키고, 같은 번호를 다시 보내면 '고쳐 줘'라는 뜻이다(옛 upsert).
 * 1) 그 번호에 살아 있는 세트가 있으면 → 그 세트를 고친다(옮기기 전에 남긴 번호 없는 세트도 줄 번호로) — 새 세트를 만들지 않는다(검토 #12)
 * 2) 없으면 → 새로 남긴다. 그 번호의 세트를 지운 적이 있으면(표식):
 *    - 지운 값과 같으면 늦게 온 같은 세트로 보고 받기만 한다(되살리지 않음)
 *    - 값이 다르면 새 세트다 — 옛 앱은 지운 뒤 같은 번호를 다시 쓴다. 표식과 겹치지 않는 새 번호로 남긴다(검토 #6 · #11)
 * 받을 수 없는 것은 복구함에 남기고 '받음'으로 답한다(옛 앱은 오류면 버린다).
 */
export async function legacyLogSet(userId: string, sessionId: string, input: LegacySetInput): Promise<{ ok: true; outcome: CommandOutcome } | { error: string }> {
  const plan = await planOf(sessionId, userId);
  const entryId = plan ? entryIdOfExercise(plan, input.exerciseId) : null;
  if (!plan || !entryId) return { error: '오늘 목록에 없는 운동이에요.' };
  const values = { weightKg: input.weightKg, reps: input.reps, holdSeconds: input.holdSeconds, ...(input.rir !== undefined ? { rir: input.rir } : {}) };
  /* EX-LOAD01 — 같은 거래에서 남길 원래 요청 · 스냅샷(없으면 예전 명령과 같은 내용) */
  const extras = {
    ...(input.legacyLoad ? { legacyLoad: input.legacyLoad } : {}),
    ...(input.loadSnapshot !== undefined && input.loadSnapshot !== null ? { loadSnapshot: input.loadSnapshot } : {}),
    ...(input.loadPrep ? { loadPrep: input.loadPrep } : {}),
  };
  const valueHash = createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);

  const live = await prisma.$queryRaw<{ id: string; clientSetId: string | null; recordVersion: number }[]>`
    SELECT "id", "clientSetId", "recordVersion" FROM "UserExerciseSet"
     WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} AND "exerciseId" = ${input.exerciseId} AND "setNo" = ${input.setNo}`;
  if (live[0]) {
    const ref = live[0].clientSetId ? { clientSetId: live[0].clientSetId } : { setId: live[0].id };
    const fix = await runOwn(userId, 'set.correct', sessionId, { ...ref, expectedRecordVersion: live[0].recordVersion, fields: values, ...extras });
    if (fix.code === 'APPLIED' || fix.code === 'NO_CHANGE') return { ok: true, outcome: fix };
    if (fix.code === 'INVALID' && !fix.conflict) return { error: fix.error ?? '세트를 저장하지 못했어요.' };
    await keepAsRecovery(userId, 'legacy.logSet', `legacy-fix:${live[0].id}:${valueHash}`, sessionId, input.exerciseId, fix.conflict ?? fix.code, input);
    return { ok: true, outcome: { code: 'DEFERRED' } };
  }

  for (let n = 0; n < 10; n++) {
    const clientSetId = legacyClientSetId(sessionId, input.exerciseId, input.setNo, n);
    const rec = await runOwn(userId, 'set.record', sessionId, {
      clientSetId,
      entryId,
      plannedSetKey: null,
      targetRevisionId: null,
      values,
      performedAt: input.recordedAt ?? appNow().toISOString(),
      preferredSetNo: input.setNo,
      ...extras,
    });
    if (rec.code === 'APPLIED' || rec.code === 'NO_CHANGE' || rec.code === 'DEFERRED') return { ok: true, outcome: rec };
    if (rec.conflict === 'DELETED') {
      const was = (rec.result as { deletedValues?: { weightKg: number | null; reps: number | null; holdSeconds: number | null } | null } | undefined)?.deletedValues;
      if (was && was.weightKg === values.weightKg && was.reps === values.reps && was.holdSeconds === values.holdSeconds)
        return { ok: true, outcome: { code: 'NO_CHANGE', conflict: 'DELETED_REPLAY' } };
      continue;
    }
    if (rec.code === 'INVALID' && !rec.conflict) return { error: rec.error ?? '세트를 저장하지 못했어요.' };
    await keepAsRecovery(userId, 'legacy.logSet', `legacy-set:${clientSetId}:${rec.conflict ?? rec.code}:${valueHash}`, sessionId, input.exerciseId, rec.conflict ?? rec.code, input);
    return { ok: true, outcome: { code: 'DEFERRED' } };
  }
  await keepAsRecovery(userId, 'legacy.logSet', `legacy-set:${sessionId}:${input.exerciseId}:${input.setNo}:many-deletes:${valueHash}`, sessionId, input.exerciseId, 'TOO_MANY_DELETES', input);
  return { ok: true, outcome: { code: 'DEFERRED' } };
}

/** 옛 deleteSet → set.delete. 번호 없는 옛 세트도 옛 앱이 가리키는 번호(lg_…)로 표식을 남긴다 — 늦게 온 같은 세트가 되살아나지 않게 */
export async function legacyDeleteSet(userId: string, sessionId: string, exerciseId: string, setNo: number): Promise<{ ok: true } | { error: string }> {
  const meta = await prisma.$queryRaw<{ id: string; clientSetId: string | null; recordVersion: number }[]>`
    SELECT "id", "clientSetId", "recordVersion" FROM "UserExerciseSet"
     WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} AND "exerciseId" = ${exerciseId} AND "setNo" = ${setNo}`;
  if (!meta[0]) return { ok: true };
  const ref = meta[0].clientSetId ? { clientSetId: meta[0].clientSetId } : { setId: meta[0].id, tombstoneAs: legacyClientSetId(sessionId, exerciseId, setNo, 0) };
  const out = await runOwn(userId, 'set.delete', sessionId, { ...ref, expectedRecordVersion: meta[0].recordVersion });
  if (out.code === 'APPLIED' || out.code === 'NO_CHANGE') return { ok: true };
  return { error: out.error ?? '세트를 지우지 못했어요. 다시 시도해 주세요.' };
}

/**
 * 옛 reorderSession → 빠진 운동은 plan.remove(세트가 없을 때만 — 옛 규칙과 같은 거절 글), 남은 것은 plan.reorder.
 * 원래 프로그램 의무는 빼도 장부에 남는다(분모가 줄지 않는다). 받은 목록에 모르는 운동이 있으면 오래된 화면이다.
 */
export async function legacyReorder(userId: string, sessionId: string, exerciseIds: readonly string[]): Promise<{ ids: string[] } | { error: string }> {
  const plan = await planOf(sessionId, userId);
  if (!plan || !readPlanV2(plan)) return { error: '오늘 목록을 읽지 못했어요.' };
  const order = exerciseIds.map((id) => entryIdOfExercise(plan, id));
  if (order.some((e) => !e)) return { error: '다른 곳에서 운동 목록이 바뀌었어요. 화면을 새로 고쳐 주세요.' };
  if (order.length === 0) return { error: '운동을 모두 뺄 수는 없어요.' };
  const keep = new Set(order as string[]);
  const dropped = rawExercises(plan)
    .map((e) => e.entryId)
    .filter((id): id is string => typeof id === 'string' && !keep.has(id));
  for (const entryId of dropped) {
    const r = await runOwn(userId, 'plan.remove', sessionId, { entryId });
    if (r.conflict === 'HAS_SETS') return { error: '이미 기록을 남긴 운동은 뺄 수 없어요.' };
    if (r.code !== 'APPLIED' && r.code !== 'NO_CHANGE') return { error: r.error ?? '운동을 빼지 못했어요.' };
  }
  const out = await runOwn(userId, 'plan.reorder', sessionId, { order });
  if (out.code === 'APPLIED' || out.code === 'NO_CHANGE') return { ids: [...exerciseIds] };
  return { error: out.error ?? '순서를 바꾸지 못했어요.' };
}

/** r1 목표 창(전체 칸을 보냄) → target.patch(바뀐 칸만). 빈 칸 = 추천 따르기. 옛 창은 판 번호를 모르므로 지금 판 위에 쓴다 */
export async function legacyTarget(
  userId: string,
  sessionId: string,
  exerciseId: string,
  target: Partial<Record<TargetField, number | null>> | null
): Promise<CommandOutcome> {
  const plan = await planOf(sessionId, userId);
  const v2 = plan ? readPlanV2(plan) : null;
  const entryId = plan ? entryIdOfExercise(plan, exerciseId) : null;
  if (!plan || !v2 || !entryId) return { code: 'NOT_FOUND', error: '오늘 목록에 없는 운동이에요.' };
  const libraryRest = await libraryRestOf([exerciseId]);
  let patch: TargetPatch;
  if (!target || Object.values(target).every((v) => v == null)) patch = { reset: true };
  else {
    const fields: Partial<Record<TargetField, FieldOp>> = {};
    for (const f of ['sets', 'reps', 'holdSeconds', 'restSeconds', 'kg'] as const) {
      if (!(f in target)) continue;
      const v = target[f];
      fields[f] = v == null ? { follow: true } : { set: v };
    }
    patch = { fields };
  }
  return runOwn(userId, 'target.patch', sessionId, { entryId, expectedRevisionId: v2.entries[entryId]?.currentRevisionId ?? null, patch, libraryRest });
}

/** 옛 교체 · 더하기 → plan.change. 얼린 운동(교체 처방 · 무게)은 부르는 쪽이 지금과 같은 길로 만든 것을 넘긴다 */
export async function legacyChange(userId: string, sessionId: string, mode: 'replace' | 'add', fromExerciseId: string, exercise: FrozenExercise): Promise<CommandOutcome> {
  const plan = await planOf(sessionId, userId);
  const fromEntryId = plan ? entryIdOfExercise(plan, fromExerciseId) : null;
  if (!plan || !fromEntryId) return { code: 'NOT_FOUND', error: '오늘 목록에 없는 운동이에요.' };
  return runOwn(userId, 'plan.change', sessionId, { mode, fromEntryId, exercise, libraryRest: await libraryRestOf([exercise.id]) });
}

export function legacyAbandon(userId: string, sessionId: string): Promise<CommandOutcome> {
  return runOwn(userId, 'session.abandon', sessionId, {});
}

export function legacyFinish(userId: string, sessionId: string, note: { intensity: number | null; memo: string | null }): Promise<CommandOutcome> {
  return runOwn(userId, 'session.finish', sessionId, note);
}

export function legacyReopen(userId: string, sessionId: string): Promise<CommandOutcome> {
  return runOwn(userId, 'session.reopen', sessionId, {});
}

async function libraryRestOf(ids: string[]): Promise<Record<string, number | null>> {
  const rows = await exercisesByIds(ids);
  return Object.fromEntries(rows.map((r) => [r.id, r.restSeconds ?? null]));
}
