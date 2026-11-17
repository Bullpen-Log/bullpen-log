import type { Prisma } from '@prisma/client';
import { hasPain, pickCheckinParts } from '@/lib/checkin';
import { parseProgram } from '@/lib/program/program';
import { withSwaps, type PlanSwap } from '@/lib/report/plan-swaps';
import { summarizeSets } from '@/lib/workout/summarize';
import { sessionEnd } from '@/lib/workout/stale';
import type { FrozenExercise } from '@/lib/workout/session-plan';
import { acceptsMass } from '@/lib/workout/load/contract';
import { contractOfFrozen, type FrozenLoadSource } from '@/lib/workout/load/frozen';
import { forSummary, gateRows, planContextOf } from '@/lib/workout/load/plan-gate';
import { normalizeSetLoad, type NormalizeRequest } from '@/lib/workout/load/recorded';
import { readSnapshot, snapshotOf, type LoadSnapshot } from '@/lib/workout/load/snapshot';
import { recommendedOf } from '@/lib/workout/target-override';
import { countObligations, programEffectKey, type SetFact } from '@/lib/workout/v2/obligations';
import { DURABLE_OUTCOMES, canonicalJson, payloadHash, validOperationId, type OutcomeCode } from '@/lib/workout/v2/operation';
import {
  PLAN_V2_KEY,
  PLAN_V2_PROTOCOL,
  adoptPlan,
  entryOf,
  newEntryId,
  plannedSetKey,
  prescribedSetCount,
  rawExercises,
  readPlanV2,
  type EntryMeta,
  type PlanV2,
  type Provenance,
  type RawExercise,
  type RawPlan,
  type SafetyState,
} from '@/lib/workout/v2/plan-v2';
import {
  PAIN_LOAD_TARGET_TEXT,
  activeOverride,
  applyTargetPatch,
  painIncrease,
  resolveRevision,
  type Override,
  type RevisionSnapshot,
  type TargetPatch,
} from '@/lib/workout/v2/revision';
import {
  advanceEnrollment,
  correctSet,
  deleteSetWithTombstone,
  findEffect,
  findReceipt,
  insertReceipt,
  insertRecovery,
  insertRevision,
  insertSet,
  lockOwner,
  readEnrollmentForUpdate,
  readRevision,
  readSessionForUpdate,
  setByClientId,
  setByIdForUpdate,
  setsOfSession,
  tombstoneOf,
  writeSession,
  type SessionRow,
  type SetRow,
} from '@/lib/workout/v2/store';

/**
 * EX-RX01 R2A — 운동 판 v2 명령 경계(설계 3절 · 13C–F).
 *
 * 한 명령 = 거래 하나:
 *   1) 선수(데이터 주인) 잠금 + 울타리 문맥(store.lockOwner) — 코치가 남겨도 선수 잠금
 *   2) 권한을 거래 안에서 다시 본다(authorize) — 기다리는 사이 코치 권한이 빠지면 쓰지 않는다
 *   3) 영수증: 같은 작업 번호 + 같은 내용 → 그때 결과(다시 쓰지 않음), 같은 번호 + 다른 내용 → INVALID
 *   4) 잠근 뒤 판을 새로 읽는다(FOR UPDATE). 남의 판은 없는 판(NOT_FOUND)
 *   5) 명령(handler)이 받은 판 JSON 을 고친다(모르는 칸은 그대로). 판 번호 +1, 같은 거래에서 영수증
 *
 * 거래 안에서 네트워크 · 영상 서명 · 화면 기다림을 하지 않는다. 라이브러리 값이 필요하면 부르는 쪽이 거래 밖에서 만들어 넘긴다.
 * 이 파일은 전역 prisma 를 쓰지 않는다 — 부르는 쪽이 db 를 넘긴다(시험이 격리 DB 로 같은 코드를 돈다).
 */

export type CommandDb = {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, opts?: { maxWait?: number; timeout?: number }): Promise<T>;
};
type TxClient = Prisma.TransactionClient;

export type CommandInput = {
  /** 로그인한 사람 */
  actorId: string;
  /** 선수(데이터 주인) — 자기 기록이면 actorId 와 같다. 코치 입력이면 서버가 명단에서 얻은 선수 */
  ownerId: string;
  operationId: string;
  type: string;
  sessionId: string | null;
  payload: unknown;
  /** 받은 세대(다시 열기 전 · 뒤를 가른다). 주면 다르면 CONFLICT */
  runGeneration?: number | null;
  /** 코치 입력처럼 actor ≠ owner 일 때 거래 안에서 다시 보는 권한 */
  authorize?: (tx: TxClient) => Promise<boolean>;
  now?: () => Date;
  /** EX-LOAD01 — 서버가 세트 무게 스냅샷 칸을 가졌는가(WORKOUT_LOAD_SCHEMA). 아니면 그 칸을 묻지 않는다 */
  loadStructured?: boolean;
};

export type CommandOutcome = {
  code: OutcomeCode;
  /** 같은 작업 번호의 재전송에 그때 결과를 돌려준 경우 */
  replay?: boolean;
  error?: string;
  field?: string;
  conflict?: string;
  result?: unknown;
  /** 지금(쓴 뒤) 판 번호 · 세대 — 화면은 이보다 오래된 응답으로 새 상태를 덮지 않는다 */
  stateVersion?: number | null;
  runGeneration?: number | null;
  receiptId?: string;
};

export class CommandAbort extends Error {
  outcome: CommandOutcome;
  constructor(outcome: CommandOutcome) {
    super(outcome.error ?? outcome.code);
    this.outcome = outcome;
  }
}

export type HandlerContext = {
  tx: TxClient;
  input: CommandInput;
  session: SessionRow;
  plan: RawPlan;
  v2: PlanV2 | null;
  now: Date;
};

export type HandlerResult = {
  code: OutcomeCode;
  error?: string;
  field?: string;
  conflict?: string;
  result?: unknown;
  /** 판에 쓸 것. 없으면 판을 안 쓴다 */
  write?: {
    plan?: RawPlan;
    status?: string;
    endedAt?: Date | null;
    activeSeconds?: number;
    runGeneration?: number;
    safetyEpoch?: number;
    mutationProtocolVersion?: number;
    mainStartedAt?: Date | null;
    warmup?: { outcome: string; doneIds: string[] };
  };
  effectKey?: string | null;
  effect?: unknown;
};

const RETRY_CODES = new Set(['P2034', '40001', '40P01']);
const TX_OPTS = { maxWait: 10_000, timeout: 30_000 };

function retryable(e: unknown): boolean {
  const any = e as { code?: string; meta?: { code?: string }; message?: string };
  if (any?.code && RETRY_CODES.has(any.code)) return true;
  if (any?.meta?.code && RETRY_CODES.has(any.meta.code)) return true;
  return /deadlock detected|could not serialize/i.test(any?.message ?? '');
}

export async function runCommand(
  db: CommandDb,
  input: CommandInput,
  handler: (ctx: HandlerContext) => Promise<HandlerResult>,
  opts: { allowLegacySession?: boolean; tries?: number } = {}
): Promise<CommandOutcome> {
  if (!validOperationId(input.operationId)) return { code: 'INVALID', error: '작업 번호가 올바르지 않아요.' };
  if (!input.ownerId || !input.actorId) return { code: 'INVALID', error: '누구의 기록인지 알 수 없어요.' };
  const hash = payloadHash(input.type, { sessionId: input.sessionId, payload: input.payload, runGeneration: input.runGeneration ?? null });
  const tries = opts.tries ?? 3;
  let last: unknown = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await lockOwner(tx, input.ownerId);
        if (input.authorize && !(await input.authorize(tx))) return { code: 'NOT_FOUND', error: '기록을 찾지 못했어요.' };

        const prior = await findReceipt(tx, input.ownerId, input.operationId);
        if (prior) {
          if (prior.payloadHash !== hash || prior.commandType !== input.type)
            return { code: 'INVALID', error: '같은 작업 번호로 다른 내용을 보냈어요. 새 작업 번호로 보내 주세요.', conflict: 'OPERATION_ID_REUSED' };
          const cur = prior.sessionId ? await readSessionForUpdate(tx, prior.sessionId, input.ownerId) : null;
          return {
            code: prior.resultCode as OutcomeCode,
            replay: true,
            result: prior.result,
            stateVersion: cur?.stateVersion ?? prior.stateVersion,
            runGeneration: cur?.runGeneration ?? null,
            receiptId: prior.id,
          };
        }

        if (!input.sessionId) throw new CommandAbort({ code: 'INVALID', error: '운동 판을 찾지 못했어요.' });
        const session = await readSessionForUpdate(tx, input.sessionId, input.ownerId);
        if (!session) return { code: 'NOT_FOUND', error: '운동 판을 찾지 못했어요. 화면을 다시 열어 주세요.' };
        if (!opts.allowLegacySession && session.mutationProtocolVersion < PLAN_V2_PROTOCOL)
          return { code: 'CONFLICT', conflict: 'NOT_V2', error: '이 운동 판은 아직 새 저장 방식이 아니에요.' };
        if (input.runGeneration != null && input.runGeneration !== session.runGeneration)
          return {
            code: 'CONFLICT',
            conflict: 'GENERATION',
            error: '운동을 다시 연 뒤라 예전 화면의 변경을 적용하지 못했어요.',
            stateVersion: session.stateVersion,
            runGeneration: session.runGeneration,
          };

        const plan = (session.plan && typeof session.plan === 'object' ? session.plan : {}) as RawPlan;
        const now = (input.now ?? (() => new Date()))();
        const res = await handler({ tx, input, session, plan, v2: readPlanV2(plan), now });
        if (!DURABLE_OUTCOMES.has(res.code)) {
          /* 받지 못한 결과(충돌 · 잘못)는 아무것도 남기지 않는다 — 거래를 되돌린다 */
          throw new CommandAbort({
            code: res.code,
            error: res.error,
            field: res.field,
            conflict: res.conflict,
            result: res.result,
            stateVersion: session.stateVersion,
            runGeneration: session.runGeneration,
          });
        }
        let version = session.stateVersion;
        let generation = session.runGeneration;
        if (res.code === 'APPLIED' && res.write) {
          const n = await writeSession(tx, session, res.write);
          if (n !== 1) throw Object.assign(new Error('stateVersion moved under lock'), { code: '40001' });
          version = session.stateVersion + 1;
          generation = res.write.runGeneration ?? session.runGeneration;
        }
        const receiptId = await insertReceipt(tx, {
          ownerId: input.ownerId,
          actorId: input.actorId,
          operationId: input.operationId,
          sessionId: session.id,
          runGeneration: generation,
          commandType: input.type,
          payloadHash: hash,
          resultCode: res.code,
          stateVersion: version,
          result: res.result ?? null,
          effectKey: res.effectKey ?? null,
          effect: res.effect,
        });
        return { code: res.code, result: res.result, stateVersion: version, runGeneration: generation, receiptId };
      }, TX_OPTS);
    } catch (e) {
      if (e instanceof CommandAbort) return e.outcome;
      if (retryable(e) && attempt < tries - 1) {
        last = e;
        continue;
      }
      if (retryable(e)) return { code: 'RETRYABLE', error: '잠시 뒤 다시 시도해 주세요.' };
      throw e;
    }
  }
  void last;
  return { code: 'RETRYABLE', error: '잠시 뒤 다시 시도해 주세요.' };
}

/* ───────────────────────────── 안전(체크인) ───────────────────────────── */

/**
 * 지금 있는 규칙만 다시 쓴다(새 의료 판정을 만들지 않는다).
 * - 판 날짜 체크인에 통증(hasPain, 다섯 부위) → 'pain_no_increase' (r1 · checkTargetInput 와 같은 기준)
 * - 그날 체크인이 없고 최근 7일에 통증 → 'unknown' + 올리기 막음 (selectCandidates 의 painStateUnknown 과 같은 조건)
 * - 그날 체크인이 있고 통증 없음 → 'clear'. 체크인도 최근 통증도 없음 → 'unknown'(통증 없음으로 단정하지 않는다)
 * 'stop'(멈춤)은 지금 운동 중 규칙에 없다 — 이 단계에서 만들지 않는다.
 */
export async function safetyOf(tx: TxClient, userId: string, sessionDate: Date): Promise<{ state: SafetyState['state']; blocksIncrease: boolean; source: string }> {
  const day = new Date(`${sessionDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const from = new Date(day.getTime() - 6 * 86_400_000);
  const rows = await tx.dailyCheckin.findMany({
    where: { userId, date: { gte: from, lte: day } },
    select: { date: true, shoulder: true, elbow: true, wrist: true, lowerBack: true, lowerBody: true },
  });
  const today = rows.find((r) => r.date.getTime() === day.getTime()) ?? null;
  if (today) {
    return hasPain(pickCheckinParts(today))
      ? { state: 'pain_no_increase', blocksIncrease: true, source: 'checkin:session-date' }
      : { state: 'clear', blocksIncrease: false, source: 'checkin:session-date' };
  }
  const recentPain = rows.some((r) => hasPain(pickCheckinParts(r)));
  return { state: 'unknown', blocksIncrease: recentPain, source: recentPain ? 'checkin:recent-pain-no-today' : 'checkin:none' };
}

/* ───────────────────────────── 판 · 자리 도우미 ───────────────────────────── */

function exOf(e: RawExercise): FrozenExercise {
  return e as unknown as FrozenExercise;
}

function withV2(plan: RawPlan, v2: PlanV2): RawPlan {
  return { ...plan, [PLAN_V2_KEY]: v2 };
}

function replaceEntry(plan: RawPlan, entryId: string, next: RawExercise): RawPlan {
  return { ...plan, exercises: rawExercises(plan).map((e) => (e?.entryId === entryId ? next : e)) };
}

async function currentSnapshot(tx: TxClient, meta: EntryMeta): Promise<RevisionSnapshot | null> {
  if (!meta.currentRevisionId) return null;
  const row = await readRevision(tx, meta.currentRevisionId);
  return row ? (row.snapshot as RevisionSnapshot) : null;
}

/** 자리 하나의 새 목표 판을 쓰고, 판 JSON(자리 · 호환 userTarget)을 고친 판을 돌려준다 */
async function writeRevision(
  ctx: HandlerContext,
  v2: PlanV2,
  entryId: string,
  override: Override | null,
  prevOverride: Override | null,
  source: string,
  restSeconds: number | null,
  plan: RawPlan,
  generation: number = ctx.session.runGeneration
): Promise<{ plan: RawPlan; v2: PlanV2; revisionId: string; snapshot: RevisionSnapshot; seq: number }> {
  const raw = entryOf(plan, entryId)!;
  const ex = exOf(raw);
  const meta = v2.entries[entryId];
  const { snapshot, keys, nextKeyNo } = resolveRevision(
    ex,
    meta.plannedSetKeys,
    override,
    restSeconds,
    (n) => plannedSetKey(entryId, n),
    meta.nextKeyNo,
    prevOverride
  );
  const seq = meta.revisionSeq + 1;
  const revisionId = await insertRevision(ctx.tx, {
    userId: ctx.session.userId,
    sessionId: ctx.session.id,
    entryId,
    exerciseId: ex.id,
    runGeneration: generation,
    seq,
    source,
    snapshot,
    changedFields: snapshot.changedFields,
    policyVersion: snapshot.policyVersion,
    operationId: ctx.input.operationId,
    actorId: ctx.input.actorId,
  });
  const nextMeta: EntryMeta = { ...meta, plannedSetKeys: keys, nextKeyNo, currentRevisionId: revisionId, revisionSeq: seq };
  const nextV2: PlanV2 = { ...v2, entries: { ...v2.entries, [entryId]: nextMeta } };
  /* r1 화면 · 읽기가 쓰는 호환 칸 — 목표 판과 같은 거래에서만 쓴다(따로 쓰는 길 없음) */
  const { userTarget: _old, ...keep } = raw;
  void _old;
  const nextRaw: RawExercise = override ? { ...keep, userTarget: { ...override, at: ctx.now.toISOString() } } : keep;
  return { plan: withV2(replaceEntry(plan, entryId, nextRaw), nextV2), v2: nextV2, revisionId, snapshot, seq };
}

function restOf(ex: FrozenExercise, libraryRest: Record<string, number | null> | undefined): number | null {
  if (ex.restSeconds !== undefined) return ex.restSeconds ?? null;
  return libraryRest?.[ex.id] ?? null;
}

/* ───────────────────────────── 명령들 ───────────────────────────── */

export type PromotePayload = { provenance?: Provenance; libraryRest?: Record<string, number | null> };

/**
 * 판을 v2 로 올린다 — 자리 번호 · 계획 세트 열쇠 · 프로그램 원래 의무를 얼리고, 자리마다 기준 목표 판(source 'adoption' | 'start')을 만든다.
 * 이미 남긴 세트는 그대로(열쇠 · 목표 연결은 모름 = null). 이미 v2 면 NO_CHANGE.
 */
export async function promoteHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.input.payload ?? {}) as PromotePayload;
  if (ctx.v2 && ctx.session.mutationProtocolVersion >= PLAN_V2_PROTOCOL) return { code: 'NO_CHANGE', result: { promoted: false } };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 마친 운동은 옮기지 않아요.' };
  const provenance: Provenance = p.provenance === 'captured_at_start' ? 'captured_at_start' : 'captured_on_adoption';
  /* 회차 번호 없는 옛 프로그램 판 — 옛 advance 와 같이 '진행 중인 같은 키'의 회차로(검토 #17). 찾은 길을 장부에 남긴다 */
  const tag = ctx.plan.program as { key?: unknown; rowId?: unknown } | null | undefined;
  let enrollmentId: string | null = typeof tag?.rowId === 'string' ? tag.rowId : null;
  if (!enrollmentId && tag && typeof tag.key === 'string') {
    const row = await ctx.tx.userTrainingProgram.findFirst({
      where: { userId: ctx.session.userId, programKey: tag.key, status: 'active' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    enrollmentId = row?.id ?? null;
  }
  const adopted = adoptPlan(ctx.plan, { provenance, now: ctx.now.toISOString(), enrollmentId });
  let plan = adopted.plan;
  let v2 = adopted.v2;
  const revisions: Record<string, string> = {};
  for (const e of rawExercises(plan)) {
    if (typeof e?.entryId !== 'string') continue;
    const ex = exOf(e);
    /* 옛 r1 userTarget 은 기준 판의 내 목표로 옮긴다(지우지 않는다). 다시 검사해 범위 밖 칸은 버린다 */
    const legacy = legacyOverride(e.userTarget, ex);
    const w = await writeRevision(ctx, v2, e.entryId, legacy, null, provenance === 'captured_at_start' ? 'start' : 'adoption', restOf(ex, p.libraryRest), plan);
    plan = w.plan;
    v2 = w.v2;
    revisions[e.entryId] = w.revisionId;
  }
  const safety = await safetyOf(ctx.tx, ctx.session.userId, ctx.session.date);
  v2 = { ...v2, safety: { epoch: ctx.session.safetyEpoch + 1, state: safety.state, source: safety.source, at: ctx.now.toISOString() } };
  return {
    code: 'APPLIED',
    result: { promoted: true, entries: Object.keys(v2.entries), revisions, obligations: v2.obligations },
    write: { plan: withV2(plan, v2), mutationProtocolVersion: PLAN_V2_PROTOCOL, safetyEpoch: ctx.session.safetyEpoch + 1 },
  };
}

function legacyOverride(raw: unknown, ex: FrozenExercise): Override | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: Override = {};
  const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (int(r.sets, 1, 10)) out.sets = r.sets as number;
  if (!ex.isHold && int(r.reps, 1, 100)) out.reps = r.reps as number;
  if (ex.isHold && int(r.holdSeconds, 1, 1800)) out.holdSeconds = r.holdSeconds as number;
  if (int(r.restSeconds, 0, 600)) out.restSeconds = r.restSeconds as number;
  if (typeof r.kg === 'number' && Number.isFinite(r.kg) && r.kg > 0 && r.kg <= 500) out.kg = r.kg;
  /* EX-LOAD01-R1 — 장비 목표는 받은 그대로 기준 판으로 옮긴다(다른 판의 값도 — 쓰지는 않고 지우지도 않는다) */
  if (r.load !== undefined && r.load !== null) out.load = r.load as Override['load'];
  return Object.keys(out).length ? out : null;
}

export type TargetPatchPayload = {
  entryId: string;
  /** 화면을 열 때 본 목표 판. 그 사이 다른 기기가 같은 자리를 바꿨으면 CONFLICT(초안은 화면에 남는다) */
  expectedRevisionId: string | null;
  patch: TargetPatch;
  libraryRest?: Record<string, number | null>;
};

export async function targetPatchHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as TargetPatchPayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 마친 운동이라 목표를 바꾸지 못했어요.' };
  if (!p || typeof p.entryId !== 'string') return { code: 'INVALID', error: '어느 운동인지 알 수 없어요.' };
  const raw = entryOf(ctx.plan, p.entryId);
  const meta = ctx.v2.entries[p.entryId];
  if (!raw || !meta) return { code: 'NOT_FOUND', error: '오늘 목록에 없는 운동이에요.' };
  const current = await currentSnapshot(ctx.tx, meta);
  if ((p.expectedRevisionId ?? null) !== (meta.currentRevisionId ?? null))
    return {
      code: 'CONFLICT',
      conflict: 'STALE_TARGET',
      error: '다른 곳에서 이 운동의 목표가 바뀌었어요. 지금 값을 확인하고 다시 저장해 주세요.',
      result: { currentRevisionId: meta.currentRevisionId, current },
    };
  const ex = exOf(raw);
  const rest = restOf(ex, p.libraryRest);
  const recommended = recommendedOf(ex, rest);
  const prev = current?.override ?? null;
  const applied = applyTargetPatch(prev, p.patch, ex, recommended);
  if (!applied.ok) return { code: 'INVALID', error: applied.error, field: applied.field, conflict: applied.code };
  const safety = await safetyOf(ctx.tx, ctx.session.userId, ctx.session.date);
  if (safety.blocksIncrease) {
    const up = painIncrease(prev, applied.override, recommended);
    if (up)
      return {
        code: 'INVALID',
        conflict: 'PAIN_NO_INCREASE',
        field: up,
        /* EX-LOAD01-R1 — 장비 목표는 '올림'인지 차례를 모른다(밴드) — 그 까닭을 따로 말한다 */
        error: up === 'load' ? PAIN_LOAD_TARGET_TEXT : '최근 통증 기록이 있어 목표를 오늘 추천보다 올릴 수 없어요. 하다가 아프면 바로 멈추세요.',
      };
  }
  if (sameOverride(prev, applied.override)) return { code: 'NO_CHANGE', result: { revisionId: meta.currentRevisionId, current } };
  const w = await writeRevision(ctx, ctx.v2, p.entryId, applied.override, prev, 'user', rest, ctx.plan);
  const gate = activeOverride(applied.override, recommended, safety.state === 'pain_no_increase' || safety.blocksIncrease ? 'pain_no_increase' : 'clear');
  return {
    code: 'APPLIED',
    result: { revisionId: w.revisionId, seq: w.seq, snapshot: w.snapshot, active: gate.active, paused: gate.paused, safety: safety.state },
    write: { plan: w.plan },
  };
}

function sameOverride(a: Override | null, b: Override | null): boolean {
  const ka = a ?? {};
  const kb = b ?? {};
  const keys = new Set([...Object.keys(ka), ...Object.keys(kb)]);
  for (const k of keys) {
    /* EX-LOAD01-R1 — 장비 목표는 값으로 견준다(키 차례 · 다시 만든 객체는 같은 목표) */
    if (k === 'load') {
      if (canonicalJson(ka.load ?? null) !== canonicalJson(kb.load ?? null)) return false;
      continue;
    }
    if ((ka as Record<string, unknown>)[k] !== (kb as Record<string, unknown>)[k]) return false;
  }
  return true;
}

export type ReorderPayload = { order: string[] };

/** 순서 바꾸기 — 지금 자리 전부의 순열이어야 한다(그 사이 더해진 자리를 '뺀 것'으로 치지 않는다) */
export async function reorderHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as ReorderPayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 마친 운동이에요.' };
  const list = rawExercises(ctx.plan);
  const ids = list.map((e) => e.entryId as string);
  if (!Array.isArray(p?.order) || p.order.length !== ids.length || new Set(p.order).size !== ids.length || !p.order.every((id) => ids.includes(id)))
    return { code: 'CONFLICT', conflict: 'STALE_LIST', error: '다른 곳에서 운동 목록이 바뀌었어요. 화면을 새로 고친 뒤 다시 옮겨 주세요.', result: { order: ids } };
  if (p.order.every((id, i) => id === ids[i])) return { code: 'NO_CHANGE', result: { order: ids } };
  const byId = new Map(list.map((e) => [e.entryId as string, e]));
  return { code: 'APPLIED', result: { order: p.order }, write: { plan: { ...ctx.plan, exercises: p.order.map((id) => byId.get(id)!) } } };
}

export type RemovePayload = { entryId: string };

/** 빼기 — 세트가 남은 자리는 빼지 않는다(기록이 주인 없는 세트가 되지 않게). 뺀 자리는 보관(원래 의무는 그대로 남는다) */
export async function removeHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as RemovePayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 마친 운동이에요.' };
  const raw = entryOf(ctx.plan, p?.entryId);
  if (!raw) return { code: 'NO_CHANGE', result: { removed: false } };
  const sets = await setsOfSession(ctx.tx, ctx.session.id);
  if (sets.some((s) => s.entryId === p.entryId || (s.entryId == null && s.exerciseId === raw.id)))
    return { code: 'CONFLICT', conflict: 'HAS_SETS', error: '이미 남긴 세트가 있는 운동은 뺄 수 없어요.' };
  const at = ctx.now.toISOString();
  const swap: PlanSwap = { from: raw.id as string, to: null, kind: 'remove', where: 'session', slot: exOf(raw).slot, at };
  const { [p.entryId]: _gone, ...entries } = ctx.v2.entries;
  void _gone;
  const v2: PlanV2 = { ...ctx.v2, entries, archived: [...ctx.v2.archived, { entryId: p.entryId, exerciseId: raw.id as string, reason: 'removed', at, snapshot: raw }] };
  const plan = withSwaps({ ...ctx.plan, exercises: rawExercises(ctx.plan).filter((e) => e.entryId !== p.entryId) } as RawPlan & { swaps?: PlanSwap[] }, [swap]);
  return { code: 'APPLIED', result: { removed: true }, write: { plan: withV2(plan, v2) } };
}

export type ChangePayload = {
  /** replace = 그 자리를 바꾼다(새 자리, 원래 자리와 이어짐), add = 그 자리 뒤에 더한다 */
  mode: 'replace' | 'add';
  fromEntryId: string;
  /** 부르는 쪽이 거래 밖에서 라이브러리로 만든 얼린 운동(교체 처방 포함) */
  exercise: FrozenExercise;
  libraryRest?: Record<string, number | null>;
};

export async function changeHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as ChangePayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 마친 운동이에요.' };
  const from = entryOf(ctx.plan, p?.fromEntryId);
  if (!from || !p.exercise || typeof p.exercise.id !== 'string') return { code: 'NOT_FOUND', error: '오늘 목록에 없는 운동이에요.' };
  if (rawExercises(ctx.plan).some((e) => e.id === p.exercise.id))
    return { code: 'CONFLICT', conflict: 'ALREADY_IN_LIST', error: '이미 오늘 목록에 있는 운동이에요.' };
  if (p.mode === 'replace') {
    const sets = await setsOfSession(ctx.tx, ctx.session.id);
    if (sets.some((s) => s.entryId === p.fromEntryId || (s.entryId == null && s.exerciseId === from.id)))
      return { code: 'CONFLICT', conflict: 'HAS_SETS', error: '이미 세트를 남긴 운동은 바꿀 수 없어요. 더하기로 넣어 주세요.' };
  }
  const entryId = newEntryId();
  const at = ctx.now.toISOString();
  const n = prescribedSetCount(p.exercise);
  const meta: EntryMeta = {
    exerciseId: p.exercise.id,
    plannedSetKeys: Array.from({ length: n }, (_, i) => plannedSetKey(entryId, i + 1)),
    nextKeyNo: n + 1,
    currentRevisionId: null,
    revisionSeq: 0,
    replacedFrom: p.mode === 'replace' ? p.fromEntryId : null,
    createdAt: at,
  };
  const newRaw = { ...(p.exercise as unknown as RawExercise), entryId };
  const list = rawExercises(ctx.plan);
  const idx = list.findIndex((e) => e.entryId === p.fromEntryId);
  let exercises: RawExercise[];
  let v2: PlanV2 = { ...ctx.v2, entries: { ...ctx.v2.entries, [entryId]: meta } };
  if (p.mode === 'replace') {
    exercises = list.map((e, i) => (i === idx ? newRaw : e));
    const { [p.fromEntryId]: _gone, ...rest } = v2.entries;
    void _gone;
    v2 = {
      ...v2,
      entries: rest,
      substitutions: [...v2.substitutions, { fromEntryId: p.fromEntryId, toEntryId: entryId }],
      archived: [...v2.archived, { entryId: p.fromEntryId, exerciseId: from.id as string, reason: 'replaced', at, snapshot: from }],
    };
  } else {
    exercises = [...list.slice(0, idx + 1), newRaw, ...list.slice(idx + 1)];
  }
  const swap: PlanSwap = { from: from.id as string, to: p.exercise.id, kind: p.mode, where: 'session', slot: exOf(from).slot, at };
  let plan = withSwaps({ ...ctx.plan, exercises } as RawPlan & { swaps?: PlanSwap[] }, [swap]) as RawPlan;
  const w = await writeRevision({ ...ctx, plan }, v2, entryId, null, null, p.mode === 'replace' ? 'swap' : 'add', restOf(p.exercise, p.libraryRest), plan);
  plan = w.plan;
  return { code: 'APPLIED', result: { entryId, revisionId: w.revisionId }, write: { plan } };
}

export type SetValues = { weightKg: number | null; reps: number | null; holdSeconds: number | null; rir?: number | null };
export type RecordPayload = {
  clientSetId: string;
  entryId: string;
  plannedSetKey: string | null;
  targetRevisionId: string | null;
  values: SetValues;
  /** 사람이 한 때(기기 시각) — 서버 받은 때와 따로 둔다 */
  performedAt: string;
  /** 코치가 남긴 세트면 그 코치 — 의무 세기에 연결하지 않는다(명시 연결 전까지) */
  enteredById?: string | null;
  /** 옛 클라이언트 길(legacy.ts)만 — 그 화면이 쓰는 세트 번호. 비어 있으면 쓰고, 차 있으면 서버가 다음 번호를 고른다 */
  preferredSetNo?: number | null;
  /**
   * EX-LOAD01 — 옛 앱이 장비가 받지 않는 kg 을 보낸 세트: values.weightKg 는 비우고(정식은 횟수 · 시간만) 원래 요청을 이 명령과 **같은 거래**
   * 에서 복구함에 남긴다(세트 · 복구 · 영수증이 함께 남거나 함께 없다). 지문은 원래 요청의 지문.
   */
  legacyLoad?: LegacyLoadRecovery | null;
  /** EX-LOAD01 — 세트 무게 스냅샷(lib/workout/load/snapshot.ts) — 같은 거래에서 세트 줄에 쓴다. 구조화 스키마를 적용한 서버만 싣는다 */
  loadSnapshot?: unknown;
  /**
   * EX-LOAD01 — 구조화 스키마를 적용한 서버의 옛 logSet 길: 미리 본 결과 대신 정규화 요청을 싣는다. 명령 거래 안에서 잠근 **지금 줄**로
   * 다시 정규화해 kg(옛 칸) · 스냅샷 · 원래 요청 복구를 정한다 — 거래 밖에서 읽은 옛 값이 그사이 바뀐 밴드 · 기구 이름을 되돌리지 않게.
   * 있으면 loadSnapshot · legacyLoad 보다 이긴다.
   */
  loadPrep?: LoadPrep | null;
};

export type LegacyLoadRecovery = { originalHash: string; original: unknown };
export type LoadPrep = { request: NormalizeRequest; provenance: string; original: LegacyLoadRecovery };

type LoadPlan = { weightKg?: number | null; loadSnapshot?: unknown; legacyLoad?: LegacyLoadRecovery | null };

/**
 * EX-LOAD01 — 이 명령 거래 안에서 쓸 무게. loadPrep 이 있고 구조화 스키마를 적용한 서버면 지금 줄(잠근 것)로 다시 정규화한다.
 * weightKg 는 다시 정한 값(옛 칸 투영) — 없으면(prep 없음) 요청 값 그대로. 받을 수 없으면 { error }.
 */
async function loadPlanInTx(ctx: HandlerContext, p: { loadPrep?: LoadPrep | null; loadSnapshot?: unknown; legacyLoad?: LegacyLoadRecovery | null }, row: SetRow | null): Promise<LoadPlan | { error: string }> {
  if (!p.loadPrep || !ctx.input.loadStructured) return { loadSnapshot: p.loadSnapshot, legacyLoad: p.legacyLoad };
  const snap = row ? (await setSnapshotsInTx(ctx, [row.id])).get(row.id) : undefined;
  const r = normalizeSetLoad({ ...p.loadPrep.request, existing: row ? { weightKg: row.weightKg, load: snap?.value ?? null } : null });
  if (!r.ok) return { error: r.error };
  return {
    weightKg: r.weightKg,
    loadSnapshot: r.load ? snapshotOf({ load: r.load, status: r.status, contract: r.contract, variant: r.variant, provenance: p.loadPrep.provenance }) : undefined,
    legacyLoad: r.recover ? p.loadPrep.original : null,
  };
}

/**
 * EX-LOAD01 — 같은 거래 안에서 세트 스냅샷을 읽는다. 구조화 스키마를 적용한 서버만(ctx.input.loadStructured) — 아니면 새 칸을 묻지 않는다.
 */
async function setSnapshotsInTx(ctx: HandlerContext, ids: readonly string[]): Promise<Map<string, LoadSnapshot>> {
  const out = new Map<string, LoadSnapshot>();
  if (!ctx.input.loadStructured || ids.length === 0) return out;
  const rows = await ctx.tx.$queryRaw<{ id: string; load: unknown }[]>`SELECT "id", "load" FROM "UserExerciseSet" WHERE "id" = ANY(${[...ids]}::text[]) AND "load" IS NOT NULL`;
  for (const r of rows) {
    const snap = readSnapshot(r.load);
    if (snap) out.set(r.id, snap);
  }
  return out;
}

/** EX-LOAD01 R1 — 스냅샷의 뜻만(무게 값 · 상태 · 변형 · 계약 열쇠 · 모드) 견준다. 출처 · 시각은 뜻이 아니다 */
function snapshotMeaning(s: LoadSnapshot | null | undefined): string | null {
  if (!s) return null;
  return canonicalJson({ value: s.value, status: s.status, variant: s.variant, key: s.contract.key, mode: s.contract.mode });
}

/**
 * EX-LOAD01 R1(통합 점검) — 이번 명령이 세트 무게 스냅샷을 **실제로 바꾸는가**. 횟수 · 무게 숫자는 같고 밴드만 바뀐 고치기(노랑 → 빨강)를
 * NO_CHANGE 로 답하면 기록 판(recordVersion)이 안 올라, 같은 판 번호를 든 오래된 기기가 새 밴드를 덮었다(잃어버린 고침).
 * 구조화 스키마가 꺼진 서버는 새 칸을 묻지 않는다 — 그때 스냅샷을 실었으면(실제로는 안 실린다) 바뀐 것으로 본다(판을 올리는 쪽이 안전하다).
 */
async function loadSnapshotChanges(ctx: HandlerContext, row: SetRow, loadSnapshot: unknown): Promise<boolean> {
  if (loadSnapshot === undefined || loadSnapshot === null) return false;
  if (!ctx.input.loadStructured) return true;
  const next = readSnapshot(loadSnapshot);
  const cur = (await setSnapshotsInTx(ctx, [row.id])).get(row.id) ?? null;
  if (!next) return true;
  return snapshotMeaning(cur) !== snapshotMeaning(next);
}

/** EX-LOAD01 — 같은 거래 안에서 원래 요청을 복구함에 · 스냅샷을 세트 줄에 */
async function persistLoadExtras(ctx: HandlerContext, setId: string, exerciseId: string, p: { legacyLoad?: LegacyLoadRecovery | null; loadSnapshot?: unknown }): Promise<void> {
  if (p.loadSnapshot !== undefined && p.loadSnapshot !== null) {
    await ctx.tx.$executeRaw`UPDATE "UserExerciseSet" SET "load" = ${JSON.stringify(p.loadSnapshot)}::jsonb WHERE "id" = ${setId}`;
  }
  if (p.legacyLoad && typeof p.legacyLoad.originalHash === 'string') {
    await insertRecovery(ctx.tx, {
      ownerId: ctx.session.userId,
      actorId: ctx.input.actorId,
      source: 'legacy.logSet.load',
      fingerprint: `legacy-load:${p.legacyLoad.originalHash.slice(0, 48)}`,
      sessionId: ctx.session.id,
      exerciseId,
      conflictCode: 'LEGACY_UNSUPPORTED_LOAD',
      payload: { setId, original: p.legacyLoad.original },
    });
  }
}

const CLIENT_SET_ID = /^[A-Za-z0-9_-]{16,80}$/;

function validValues(ex: FrozenExercise, v: SetValues): string | null {
  const intIn = (x: unknown, max: number) => x == null || (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max);
  if (!v || typeof v !== 'object') return '세트 값을 읽지 못했어요.';
  if (!intIn(v.reps, 200) || !intIn(v.holdSeconds, 1800)) return '횟수 · 시간 값이 올바르지 않아요.';
  if (v.weightKg != null && (typeof v.weightKg !== 'number' || !Number.isFinite(v.weightKg) || v.weightKg <= 0 || v.weightKg > 500)) return '무게 값이 올바르지 않아요.';
  if (v.rir != null && !(Number.isInteger(v.rir) && v.rir >= 0 && v.rir <= 4)) return '남긴 개수 값이 올바르지 않아요.';
  if (ex.isHold && v.reps != null) return '시간으로 버티는 운동이라 횟수 대신 시간을 적어 주세요.';
  if (!ex.isHold && v.holdSeconds != null) return '횟수로 하는 운동이라 시간 대신 횟수를 적어 주세요.';
  if (v.reps == null && v.holdSeconds == null) return '횟수나 시간을 적어 주세요.';
  /*
   * EX-LOAD01 — 무게는 얼린 장비 계약대로(lib/workout/load/frozen.ts). 맨몸 · 받침 · 밴드 운동은 kg 을 받지 않는다 — 옛 앱의
   * 맞지 않는 kg 은 legacy.ts 에 오기 전에 logSet 이 걸러(복구함에 원래 값) 이 검사에 닿지 않는다.
   */
  const c = contractOfFrozen(ex);
  if (v.weightKg != null && !acceptsMass(c)) return '이 운동은 무게 없이 횟수 · 시간으로 기록해요.';
  if (c.massRequired && v.weightKg == null) return '무게를 적어 주세요.';
  return null;
}

/**
 * 세트 남기기. 자리 → 운동 → 계획 열쇠 → 목표 판 → 세대를 모두 맞춰 본다. 목표 판이 없으면(옛 화면) 연결 없이(모름) 남긴다 —
 * 지금 판에 몰래 붙이지 않는다. 지운 세트의 번호로 다시 오면 되살리지 않는다(표식).
 */
export async function recordSetHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as RecordPayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (!p || !CLIENT_SET_ID.test(p.clientSetId ?? '')) return { code: 'INVALID', error: '세트 번호가 올바르지 않아요.' };
  const tomb = await tombstoneOf(ctx.tx, ctx.session.userId, p.clientSetId);
  if (tomb) return { code: 'CONFLICT', conflict: 'DELETED', error: '이미 지운 세트예요.', result: { deletedValues: tomb.values } };
  const raw = entryOf(ctx.plan, p.entryId);
  const meta = ctx.v2.entries[p.entryId];
  if (!raw || !meta) return { code: 'INVALID', conflict: 'UNKNOWN_ENTRY', error: '오늘 목록에 없는 운동이에요.' };
  const ex = exOf(raw);
  const existing = await setByClientId(ctx.tx, ctx.session.userId, p.clientSetId);
  /* EX-LOAD01 — 무게는 잠근 지금 줄로 다시 정한다(prep 이 있을 때만 — 없으면 요청 값 그대로) */
  const lp = await loadPlanInTx(ctx, p, existing && existing.sessionId === ctx.session.id ? existing : null);
  if ('error' in lp) return { code: 'INVALID', error: lp.error };
  const values: SetValues = lp.weightKg !== undefined ? { ...p.values, weightKg: lp.weightKg } : p.values;
  const extras = { legacyLoad: lp.legacyLoad, loadSnapshot: lp.loadSnapshot };
  const bad = validValues(ex, values);
  if (bad) return { code: 'INVALID', error: bad };
  if (existing) {
    /* 같은 세트의 그대로 재전송만 NO_CHANGE — RIR · 연결이 다르면 고치기로(검토 #5 · #21: RIR 답이 조용히 사라지던 것) */
    const same =
      existing.sessionId === ctx.session.id &&
      existing.weightKg === (values.weightKg ?? null) &&
      existing.reps === (values.reps ?? null) &&
      existing.holdSeconds === (values.holdSeconds ?? null) &&
      (values.rir === undefined || existing.rir === (values.rir ?? null)) &&
      existing.entryId === p.entryId &&
      existing.plannedSetKey === (p.plannedSetKey ?? null) &&
      existing.targetRevisionId === (p.targetRevisionId ?? null) &&
      /* EX-LOAD01 R1 — 숫자는 같아도 밴드 · 섞인 무게가 다르면 같은 재전송이 아니다(조용히 버리고 NO_CHANGE 라 하지 않는다) */
      !(await loadSnapshotChanges(ctx, existing, extras.loadSnapshot));
    if (same) {
      /* 같은 세트의 재전송 — 원래 요청의 복구는 지문이 같으면 한 줄(멱등), 다르면 따로 남는다(정식 세트는 하나) */
      await persistLoadExtras(ctx, existing.id, ex.id, { legacyLoad: extras.legacyLoad });
      return { code: 'NO_CHANGE', result: { setId: existing.id, recordVersion: existing.recordVersion } };
    }
    return { code: 'CONFLICT', conflict: 'CLIENT_SET_EXISTS', error: '같은 세트를 다른 값으로 다시 보냈어요. 고치기로 보내 주세요.', result: { recordVersion: existing.recordVersion } };
  }
  if (ctx.session.status !== 'ACTIVE') {
    /* 마친 · 닫힌 판에 늦게 온 세트 — 지금 판에 몰래 붙이지 않고 복구함에 남긴다(설계 10절 · 13F). 받았다는 응답은 한다 */
    const id = await insertRecovery(ctx.tx, {
      ownerId: ctx.session.userId,
      actorId: ctx.input.actorId,
      source: 'v2.set.record',
      /* 지문에 값까지 — 같은 번호로 고친 값이 오면 따로 남는다(처음 값만 남고 고친 값이 사라지지 않게, 검토 #2) */
      fingerprint: `set:${p.clientSetId}:${payloadHash('set.record', p.values).slice(0, 24)}`,
      sessionId: ctx.session.id,
      exerciseId: ex.id,
      conflictCode: ctx.session.status === 'FINISHED' ? 'SESSION_FINISHED' : 'SESSION_ABANDONED',
      payload: p,
    });
    return { code: 'DEFERRED', result: { recoveryId: id } };
  }
  let key: string | null = null;
  let revisionId: string | null = null;
  if (p.plannedSetKey != null) {
    if (!meta.plannedSetKeys.includes(p.plannedSetKey)) return { code: 'INVALID', conflict: 'UNKNOWN_PLANNED_SET', error: '이 운동의 계획 세트가 아니에요.' };
    key = p.plannedSetKey;
  }
  if (p.targetRevisionId != null) {
    const rev = await readRevision(ctx.tx, p.targetRevisionId);
    if (!rev || rev.sessionId !== ctx.session.id || rev.entryId !== p.entryId || rev.userId !== ctx.session.userId)
      return { code: 'INVALID', conflict: 'UNKNOWN_REVISION', error: '목표 기록을 찾지 못했어요.' };
    if (rev.runGeneration !== ctx.session.runGeneration)
      return { code: 'CONFLICT', conflict: 'GENERATION', error: '운동을 다시 연 뒤라 예전 목표에 붙일 수 없어요.' };
    /* 계획 세트 열쇠는 그 목표 판이 가진 열쇠여야 한다(다른 판의 열쇠와 섞지 않는다, 검토 #8) */
    if (key) {
      const snap = rev.snapshot as RevisionSnapshot;
      const known = new Set([...(snap?.resolvedSets ?? []), ...(snap?.recommendedSets ?? [])].map((s) => s.key));
      if (!known.has(key)) return { code: 'INVALID', conflict: 'UNKNOWN_PLANNED_SET', error: '이 목표의 계획 세트가 아니에요.' };
    }
    revisionId = rev.id;
  }
  const sets = await setsOfSession(ctx.tx, ctx.session.id);
  if (key && sets.some((s) => s.entryId === p.entryId && s.plannedSetKey === key))
    return { code: 'CONFLICT', conflict: 'PLANNED_SET_TAKEN', error: '이 계획 세트에는 이미 기록이 있어요. 고치기로 보내 주세요.' };
  const used = new Set(sets.filter((s) => s.exerciseId === ex.id).map((s) => s.setNo));
  const pref = p.preferredSetNo;
  const setNo =
    pref != null && Number.isInteger(pref) && pref >= 1 && pref <= 30 && !used.has(pref)
      ? pref
      : sets.filter((s) => s.exerciseId === ex.id && s.setNo < 101).reduce((m, s) => Math.max(m, s.setNo), 0) + 1;
  if (setNo > 30) return { code: 'INVALID', error: '한 운동에 남길 수 있는 세트를 넘었어요.' };
  const at = new Date(p.performedAt);
  const performed = Number.isFinite(at.getTime()) ? new Date(Math.min(Math.max(at.getTime(), ctx.session.startedAt.getTime()), ctx.now.getTime())) : ctx.now;
  const setId = await insertSet(ctx.tx, {
    sessionId: ctx.session.id,
    userId: ctx.session.userId,
    exerciseId: ex.id,
    date: ctx.session.date,
    setNo,
    weightKg: values.weightKg ?? null,
    reps: values.reps ?? null,
    holdSeconds: values.holdSeconds ?? null,
    rir: values.rir ?? null,
    recordedAt: performed,
    enteredById: p.enteredById ?? null,
    entryId: p.entryId,
    plannedSetKey: key,
    targetRevisionId: revisionId,
    clientSetId: p.clientSetId,
    /* 세대를 아는 요청(세대를 보냈거나 목표 판이 세대를 말함)만 적는다 — 모르면 모름(null), 검토 #10 */
    runGeneration: ctx.input.runGeneration != null || revisionId != null ? ctx.session.runGeneration : null,
  });
  await persistLoadExtras(ctx, setId, ex.id, extras);
  /* 세트도 판 상태의 일부 — 판 번호를 올려 늦은 옛 응답이 새 상태를 덮지 않게 한다 */
  return { code: 'APPLIED', result: { setId, setNo, plannedSetKey: key, targetRevisionId: revisionId, recordVersion: 0 }, write: { plan: ctx.plan } };
}

/** 세트를 가리키는 법 — 새 클라이언트는 clientSetId, 옮기기 전에 남긴 옛 세트는 서버 줄 번호(setId) */
export type SetRef = { clientSetId?: string; setId?: string };
export type CorrectPayload = SetRef & {
  expectedRecordVersion: number;
  fields: Partial<SetValues>;
  /** EX-LOAD01 — RecordPayload 와 같다(같은 거래에서 복구 · 스냅샷 · 지금 줄로 다시 정규화) */
  legacyLoad?: LegacyLoadRecovery | null;
  loadSnapshot?: unknown;
  loadPrep?: LoadPrep | null;
};

async function setOfRef(ctx: HandlerContext, ref: SetRef): Promise<SetRow | null> {
  if (typeof ref?.clientSetId === 'string' && ref.clientSetId) {
    const row = await setByClientId(ctx.tx, ctx.session.userId, ref.clientSetId);
    return row && row.sessionId === ctx.session.id ? row : null;
  }
  if (typeof ref?.setId === 'string' && ref.setId) return setByIdForUpdate(ctx.tx, ctx.session.userId, ctx.session.id, ref.setId);
  return null;
}

/** 고치기 — 바꾼 칸만(RIR 만 보낸 것이 옛 횟수 · 무게를 다시 쓰지 않게). 목표 연결은 그대로 */
export async function correctSetHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as CorrectPayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '마친 운동의 기록 고치기는 따로 해야 해요.' };
  const row = await setOfRef(ctx, p);
  if (!row) return { code: 'NOT_FOUND', error: '세트를 찾지 못했어요.' };
  if (row.recordVersion !== p.expectedRecordVersion)
    return { code: 'CONFLICT', conflict: 'STALE_RECORD', error: '다른 곳에서 이 세트가 바뀌었어요.', result: { recordVersion: row.recordVersion, row: publicSet(row) } };
  const lp = await loadPlanInTx(ctx, p, row);
  if ('error' in lp) return { code: 'INVALID', error: lp.error };
  const extras = { legacyLoad: lp.legacyLoad, loadSnapshot: lp.loadSnapshot };
  const f: Partial<SetValues> = lp.weightKg !== undefined && p.fields && 'weightKg' in p.fields ? { ...p.fields, weightKg: lp.weightKg } : (p.fields ?? {});
  const next = {
    weightKg: 'weightKg' in f ? (f.weightKg ?? null) : row.weightKg,
    reps: 'reps' in f ? (f.reps ?? null) : row.reps,
    holdSeconds: 'holdSeconds' in f ? (f.holdSeconds ?? null) : row.holdSeconds,
    rir: 'rir' in f ? (f.rir ?? null) : row.rir,
  };
  const ex = entryOf(ctx.plan, row.entryId ?? '') ?? rawExercises(ctx.plan).find((e) => e.id === row.exerciseId);
  if (ex) {
    const bad = validValues(exOf(ex), next);
    if (bad) return { code: 'INVALID', error: bad };
  }
  /*
   * EX-LOAD01 R1(통합 점검) — 무게 스냅샷만 바뀐 고치기도 고치기다: 기록 판을 올리고(correctSet) APPLIED 로 답한다. 숫자와 무게의 뜻이
   * 모두 같을 때만 NO_CHANGE — 그때는 스냅샷을 다시 쓰지 않는다(뜻이 같다). 원래 요청 복구는 지문이 같으면 한 줄이라 그대로 남긴다.
   */
  const loadDiff = await loadSnapshotChanges(ctx, row, extras.loadSnapshot);
  if (!loadDiff && next.weightKg === row.weightKg && next.reps === row.reps && next.holdSeconds === row.holdSeconds && next.rir === row.rir) {
    await persistLoadExtras(ctx, row.id, row.exerciseId, { legacyLoad: extras.legacyLoad });
    return { code: 'NO_CHANGE', result: { recordVersion: row.recordVersion } };
  }
  const n = await correctSet(ctx.tx, row, next);
  if (n !== 1) return { code: 'CONFLICT', conflict: 'STALE_RECORD' };
  await persistLoadExtras(ctx, row.id, row.exerciseId, extras);
  return { code: 'APPLIED', result: { recordVersion: row.recordVersion + 1, targetRevisionId: row.targetRevisionId }, write: { plan: ctx.plan } };
}

/** tombstoneAs — 번호 없는 옛 세트(setId 로 지움)를 옛 앱이 가리키는 번호(lg_…)로 표식할 때만(legacy.ts) */
export type DeletePayload = SetRef & { expectedRecordVersion: number; tombstoneAs?: string | null };

/** 지우기 — 표식(tombstone)을 남겨 늦게 온 같은 세트 남기기가 되살리지 못하게 */
export async function deleteSetHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = ctx.input.payload as DeletePayload;
  if (!ctx.v2) return { code: 'CONFLICT', conflict: 'NOT_V2' };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '마친 운동의 기록 지우기는 따로 해야 해요.' };
  if (p?.clientSetId) {
    const tomb = await tombstoneOf(ctx.tx, ctx.session.userId, p.clientSetId);
    if (tomb) return { code: 'NO_CHANGE', result: { deleted: true } };
  }
  const row = await setOfRef(ctx, p);
  if (!row) return { code: 'NOT_FOUND', error: '세트를 찾지 못했어요.' };
  if (row.recordVersion !== p.expectedRecordVersion) return { code: 'CONFLICT', conflict: 'STALE_RECORD', result: { recordVersion: row.recordVersion } };
  const as = typeof p.tombstoneAs === 'string' && /^lg_[a-f0-9]{40}$/.test(p.tombstoneAs) ? p.tombstoneAs : null;
  await deleteSetWithTombstone(ctx.tx, row, ctx.input.operationId, as);
  return { code: 'APPLIED', result: { deleted: true, plannedSetKey: row.plannedSetKey }, write: { plan: ctx.plan } };
}

function publicSet(r: SetRow) {
  return { clientSetId: r.clientSetId, weightKg: r.weightKg, reps: r.reps, holdSeconds: r.holdSeconds, rir: r.rir, recordVersion: r.recordVersion };
}

export type FinishPayload = { intensity?: number | null; memo?: string | null };

/**
 * 마치기(핵심) — 한 거래에서 상태 · 끝난 때 · 운동 시간 · 요약(이 거래가 읽은 세트로) · 프로그램 효과 · 영수증.
 * 하루 메모(DailyTrainingNote)는 따로(부르는 쪽의 기존 writeNote · recoverFollowUps — 나중 메모를 덮지 않는 기존 규칙 그대로).
 * 다시 마치기는 영수증으로 같은 결과. 마친 판에 늦게 온 목표 변경은 ENDED.
 */
export async function finishHandler(ctx: HandlerContext): Promise<HandlerResult> {
  if (ctx.session.status === 'FINISHED') return { code: 'NO_CHANGE', result: { status: 'FINISHED' } };
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 닫힌 운동이에요.' };
  return closeCore(ctx, 'FINISHED', (ctx.input.payload ?? {}) as FinishPayload);
}

/**
 * 저절로 닫기(오래 멈춘 판) — 마치기와 같은 핵심(요약 · 프로그램 효과 · 시간)을 한 거래로, 상태만 ABANDONED, 강도 · 메모 없음.
 * 옛 closeAbandoned 와 같은 뜻(검토 #16 — v2 판이 영영 열려 있던 것).
 */
export async function abandonHandler(ctx: HandlerContext): Promise<HandlerResult> {
  if (ctx.session.status !== 'ACTIVE') return { code: 'NO_CHANGE', result: { status: ctx.session.status } };
  return closeCore(ctx, 'ABANDONED', {});
}

async function closeCore(ctx: HandlerContext, status: 'FINISHED' | 'ABANDONED', p: FinishPayload): Promise<HandlerResult> {
  const sets = await setsOfSession(ctx.tx, ctx.session.id);
  const last = sets.reduce<Date | null>((m, s) => (!m || s.recordedAt > m ? s.recordedAt : m), null);
  const { endedAt, segmentSeconds } = sessionEnd(ctx.session, last, ctx.now);

  /* 요약 — 이 거래가 읽은 세트로(밖에서 읽은 판 · 세트로 만든 쓰기를 쓰지 않는다) */
  const withSets = new Set(sets.map((s) => s.exerciseId));
  const emptied = rawExercises(ctx.plan)
    .map((e) => e.id as string)
    .filter((id) => !withSets.has(id));
  if (emptied.length)
    await ctx.tx.userExerciseLog.deleteMany({ where: { userId: ctx.session.userId, date: ctx.session.date, exerciseId: { in: emptied }, setsDone: { not: null } } });
  /*
   * EX-LOAD01 — 요약의 kg 은 이 판에 얼린 계약 · 장비로 거른 보일 무게만(close-stale summaryWrites 와 같은 규칙). 세트 스냅샷이 있는
   * 줄은 그 스냅샷이 권위다(스키마 적용 뒤 — 이 거래에서 함께 읽는다).
   */
  const snaps = await setSnapshotsInTx(ctx, sets.map((s) => s.id));
  const summaryRows = forSummary(gateRows(sets, planContextOf(rawExercises(ctx.plan) as unknown as FrozenLoadSource[]), snaps));
  for (const s of summarizeSets(summaryRows)) {
    const data = { completed: true, setsDone: s.setsDone, repsDone: s.repsDone, holdSecondsDone: s.holdSecondsDone, weightKg: s.weightKg };
    await ctx.tx.userExerciseLog.upsert({
      where: { userId_exerciseId_date: { userId: ctx.session.userId, exerciseId: s.exerciseId, date: ctx.session.date } },
      create: { userId: ctx.session.userId, exerciseId: s.exerciseId, date: ctx.session.date, ...data },
      update: data,
    });
  }

  /* 프로그램 효과 — 원래 의무로 센다(지금 목록 · 줄인 목표로 분모를 줄이지 않는다). 개인 목표를 바꿨다는 것만으로 막지 않는다 */
  let effect: unknown = null;
  let effectKey: string | null = null;
  const ledger = ctx.v2?.obligations ?? null;
  if (ledger && ctx.v2) {
    const facts: SetFact[] = sets.map((s) => ({
      entryId: s.entryId ?? entryIdForLegacy(ctx.v2!, s.exerciseId),
      exerciseId: s.exerciseId,
      plannedSetKey: s.plannedSetKey,
      countsForObligation: s.enteredById == null && s.setNo < 101,
    }));
    const count = countObligations(ledger, ctx.v2, facts);
    const safetyHeld = ctx.v2.safety?.state === 'stop';
    if (!ledger.enrollmentId) effect = { outcome: 'no_enrollment', count };
    else if (safetyHeld) effect = { outcome: 'held_safety', count };
    else if (!count.meets) effect = { outcome: 'not_met', count };
    else {
      const key = programEffectKey(ledger.enrollmentId, ledger.day);
      const prior = await findEffect(ctx.tx, key);
      const row = await readEnrollmentForUpdate(ctx.tx, ledger.enrollmentId, ctx.session.userId);
      if (prior) effect = { outcome: 'already_decided', by: prior.operationId, count };
      else if (!row || row.status !== 'active' || row.programKey !== ledger.programKey) effect = { outcome: 'enrollment_mismatch', count };
      else if (row.nextDay !== ledger.day) effect = { outcome: 'day_mismatch', nextDay: row.nextDay, count };
      else {
        const total = parseProgram(ledger.programKey)?.totalDays ?? null;
        const moved = await advanceEnrollment(ctx.tx, row.id, ledger.day, ctx.session.date, total, ctx.now);
        effect = { outcome: moved ? 'advanced' : 'day_mismatch', enrollmentId: row.id, day: ledger.day, policy: 'setsNeeded-v1', count };
        if (moved) effectKey = key;
      }
    }
  }
  const finishNote = p.intensity != null || p.memo != null ? { intensity: p.intensity ?? null, memo: p.memo ?? null, at: ctx.now.toISOString() } : undefined;
  return {
    code: 'APPLIED',
    result: { status, endedAt: endedAt.toISOString(), activeSeconds: ctx.session.activeSeconds + segmentSeconds, effect, notePending: finishNote != null },
    write: {
      plan: finishNote ? { ...ctx.plan, finishNote } : ctx.plan,
      status,
      endedAt,
      activeSeconds: ctx.session.activeSeconds + segmentSeconds,
    },
    effectKey,
    effect,
  };
}

/** 열쇠 없는 옛 세트의 자리 — 그 운동을 하는 지금 자리, 없으면 보관된 자리 */
function entryIdForLegacy(v2: PlanV2, exerciseId: string): string | null {
  for (const [id, m] of Object.entries(v2.entries)) if (m.exerciseId === exerciseId) return id;
  const a = [...v2.archived].reverse().find((x) => x.exerciseId === exerciseId);
  return a?.entryId ?? null;
}

/** 다시 열기 — 세대 +1. 자리 · 계획 열쇠는 그대로, 남긴 세트도 그대로(옛 세대 표시) */
export async function reopenHandler(ctx: HandlerContext): Promise<HandlerResult> {
  if (ctx.session.status === 'ACTIVE') return { code: 'NO_CHANGE', result: { runGeneration: ctx.session.runGeneration } };
  const { finishNote: _n, ...rest } = ctx.plan as RawPlan & { finishNote?: unknown };
  void _n;
  const generation = ctx.session.runGeneration + 1;
  let plan = rest as RawPlan;
  /*
   * 이어 하는 세대의 목표 판 — 값은 그대로(같은 내 목표), 세대만 새로(source 'continuation'). 그래야 다시 연 뒤에 남긴 세트가
   * 목표 판에 이어질 수 있다(옛 세대 판에 붙이면 GENERATION 충돌, 검토 #7). 옛 세대 세트의 기준은 그대로 옛 판에 남는다.
   */
  let v2 = ctx.v2;
  const revisions: Record<string, string> = {};
  if (v2) {
    for (const [entryId, meta] of Object.entries(v2.entries)) {
      const raw = entryOf(plan, entryId);
      if (!raw) continue;
      const cur = await currentSnapshot(ctx.tx, meta);
      const ex = exOf(raw);
      const w = await writeRevision(ctx, v2, entryId, cur?.override ?? null, cur?.override ?? null, 'continuation', cur?.recommended.restSeconds ?? ex.restSeconds ?? null, plan, generation);
      plan = w.plan;
      v2 = w.v2;
      revisions[entryId] = w.revisionId;
    }
  }
  return {
    code: 'APPLIED',
    result: { runGeneration: generation, revisions },
    write: { plan, status: 'ACTIVE', endedAt: null, runGeneration: generation, mainStartedAt: ctx.now },
  };
}

export type WarmupPayload = { skipped: boolean; doneIds: string[] };

/** 워밍업 끝 — 본운동 시작 시각을 아직 없을 때만 한 번 찍는다(옛 finishWarmup 의 조건부 쓰기와 같은 뜻) */
export async function warmupHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.input.payload ?? {}) as WarmupPayload;
  if (ctx.session.status !== 'ACTIVE') return { code: 'ENDED', error: '이미 마친 운동이에요.' };
  if (ctx.session.mainStartedAt) return { code: 'NO_CHANGE', result: { mainStartedAt: ctx.session.mainStartedAt.toISOString() } };
  const doneIds = Array.isArray(p.doneIds) ? [...new Set(p.doneIds.filter((v) => typeof v === 'string' && v))].slice(0, 50) : [];
  return {
    code: 'APPLIED',
    result: { mainStartedAt: ctx.now.toISOString() },
    write: { mainStartedAt: ctx.now, warmup: { outcome: p.skipped ? 'SKIPPED' : 'DONE', doneIds } },
  };
}

export const HANDLERS = {
  'session.promote': promoteHandler,
  'target.patch': targetPatchHandler,
  'plan.reorder': reorderHandler,
  'plan.remove': removeHandler,
  'plan.change': changeHandler,
  'set.record': recordSetHandler,
  'set.correct': correctSetHandler,
  'set.delete': deleteSetHandler,
  'session.finish': finishHandler,
  'session.reopen': reopenHandler,
  'session.warmup': warmupHandler,
  'session.abandon': abandonHandler,
} as const;

export type CommandType = keyof typeof HANDLERS;

/** 명령 하나를 돈다 — 종류에 맞는 handler 로. promote 만 옛 판(protocol 1)을 받는다 */
export function execute(db: CommandDb, input: CommandInput & { type: CommandType }): Promise<CommandOutcome> {
  const handler = HANDLERS[input.type];
  if (!handler) return Promise.resolve({ code: 'INVALID', error: '모르는 명령이에요.' });
  return runCommand(db, input, handler, { allowLegacySession: input.type === 'session.promote' });
}
