import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { exercisesByIds } from '@/lib/library-cache';
import { resolveRecordingContract, type RecordingContract } from '@/lib/workout/load/contract';
import { viewSetLoad, type LoadReadContext, type SetLoadView } from '@/lib/workout/load/gate';
import { ackOf, capabilityOf, type LoadAck, type LoadCapability } from '@/lib/workout/load/protocol';
import type { LoadStatus, RecordedLoad } from '@/lib/workout/load/recorded';
import { readSnapshot, snapshotOf, type LoadSnapshot } from '@/lib/workout/load/snapshot';
import { insertLoadRecoveryTx, writeSetSnapshot, type LoadRecoveryRow } from '@/lib/workout/load/store';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { contractOfFrozen, contractOfLibraryRow, hasFrozenContract } from '@/lib/workout/load/frozen';

/**
 * EX-LOAD01 — 서버 쪽 무게 기록 도우미.
 *
 * ■ 구조화 저장(밴드 · 섞인 무게 · 복구 기록)은 스키마를 적용한 뒤에만
 *   prisma/pending-migrations/20261116150000_ex_load01_recording_contract 의 칸 · 표는 아직 공유 DB 에 없다. 그래서 그 칸을 읽고 쓰는
 *   모든 길이 loadStructured() 뒤에 있고, 꺼져 있으면(기본) 새 칸 이름이 든 SQL 을 한 번도 보내지 않는다. 생성된 Prisma 클라이언트도
 *   바꾸지 않으므로(스키마 미적용) 새 칸은 $executeRaw/$queryRaw 로만 다룬다.
 */

/** 구조화한 무게를 저장할 수 있는가 — 스키마 적용 · 확인 뒤 WORKOUT_LOAD_SCHEMA=1 일 때만 */
export function loadStructured(): boolean {
  return process.env.WORKOUT_LOAD_SCHEMA === '1';
}

export function loadCapability(): LoadCapability {
  return capabilityOf(loadStructured());
}

/** 새 정규화로 저장을 마친 뒤에만 붙이는 확인 */
export function loadAck(): LoadAck {
  return ackOf(loadStructured());
}

/* 원래 요청의 지문 · 세트 쓰기 핵심은 DB 를 넘겨받는 store.ts(격리 시험이 같은 코드를 돈다) */
export { originalPayloadHash } from '@/lib/workout/load/store';

/**
 * 계약 판단 — 라이브러리 줄 하나(지금 장비). 판이 없는 옛 줄의 'current' 근거에 쓴다.
 * R1-04 — 줄에 실려 온 loadSemantics(스위치가 켜졌을 때만 lib/library-cache.ts 가 싣는다)도 앞서는 차례대로 쓴다.
 */
export function contractOfLibrary(ex: {
  id: string;
  equipment: string[];
  category: string;
  reps: number | null;
  holdSeconds: number | null;
  movementPattern?: string | null;
  loadSemantics?: unknown;
}): RecordingContract {
  return contractOfLibraryRow(ex);
}

/** 운동 id 들의 '지금 장비' 계약 — 라이브러리 캐시에서(DB 왕복 없음). 스위치가 켜졌으면 관리자 뜻 설정까지(줄에 실려 온다) */
export async function currentContracts(exerciseIds: readonly string[]): Promise<Map<string, RecordingContract>> {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return new Map();
  const rows = await exercisesByIds(ids);
  return new Map(rows.map((r) => [r.id, contractOfLibrary(r)]));
}

/**
 * 판(세션)마다 얼린 계약 — sessionId → (exerciseId → 근거 · 계약). 판 JSON 만 읽는다(구조화 칸 아님).
 * 이번 판부터는 찍힌 계약('contract'), 그 앞의 판은 그 판에 얼린 장비로 다시 푼 것('equipment').
 */
export async function frozenContracts(
  sessionIds: readonly string[]
): Promise<Map<string, Map<string, { contract: RecordingContract; evidence: 'contract' | 'equipment' }>>> {
  const ids = [...new Set(sessionIds)].filter(Boolean);
  const out = new Map<string, Map<string, { contract: RecordingContract; evidence: 'contract' | 'equipment' }>>();
  if (ids.length === 0) return out;
  const rows = await prisma.trainingSession.findMany({ where: { id: { in: ids } }, select: { id: true, plan: true } });
  for (const r of rows) {
    const plan = readFrozenPlan(r.plan);
    if (!plan) continue;
    const m = new Map<string, { contract: RecordingContract; evidence: 'contract' | 'equipment' }>();
    for (const e of plan.exercises) {
      if (!e || typeof e.id !== 'string') continue;
      m.set(e.id, { contract: contractOfFrozen(e), evidence: hasFrozenContract(e) ? 'contract' : 'equipment' });
    }
    out.set(r.id, m);
  }
  return out;
}

/**
 * 읽기 관문의 근거를 고른다 — 그 판에 얼린 것이 있으면 그것, 없으면 지금 장비('current'). 둘 다 없으면 맨몸(none)으로 본다
 * (지운 운동 — 모르는 장비의 kg 을 계산에 넣지 않는다).
 */
export function readContextOf(
  exerciseId: string,
  sessionId: string | null | undefined,
  frozen: Map<string, Map<string, { contract: RecordingContract; evidence: 'contract' | 'equipment' }>>,
  current: Map<string, RecordingContract>
): LoadReadContext {
  const f = sessionId ? frozen.get(sessionId)?.get(exerciseId) : undefined;
  if (f) return { exerciseId, contract: f.contract, evidence: f.evidence };
  const c = current.get(exerciseId);
  if (c) return { exerciseId, contract: c, evidence: 'current' };
  return { exerciseId, contract: resolveRecordingContract({ equipment: ['__missing__'] }), evidence: 'current' };
}

/** 세트 · 요약 줄들의 읽기 근거를 한 번에(판 JSON 한 번 + 라이브러리 캐시) */
export async function readContextsFor(rows: readonly { exerciseId: string; sessionId?: string | null }[]) {
  const [frozen, current] = await Promise.all([
    frozenContracts(rows.map((r) => r.sessionId ?? '').filter(Boolean)),
    currentContracts(rows.map((r) => r.exerciseId)),
  ]);
  return (exerciseId: string, sessionId?: string | null) => readContextOf(exerciseId, sessionId, frozen, current);
}

/* ─────────────────────── 구조화 저장(스키마 적용 뒤에만) ─────────────────────── */

type Tx = Prisma.TransactionClient;

/** 세트 줄의 무게 스냅샷(실제 계약 · 변형 · 값 · 상태 · 출처)을 쓴다 — 같은 거래 안에서. 꺼져 있으면 아무것도 안 한다 */
export async function writeSetLoad(
  tx: Tx,
  setId: string,
  value: { load: RecordedLoad; status: LoadStatus; contract: RecordingContract; variant: 'band' | 'mass' | null; provenance: string }
): Promise<void> {
  if (!loadStructured()) return;
  await writeSetSnapshot(tx, setId, snapshotOf(value));
}

/** 세트들의 무게 스냅샷을 읽는다 — 꺼져 있으면 빈 지도(새 칸을 묻지 않는다). 계약까지 그대로 돌려준다(읽는 쪽의 권위) */
export async function readSetLoads(setIds: readonly string[]): Promise<Map<string, LoadSnapshot>> {
  const out = new Map<string, LoadSnapshot>();
  if (!loadStructured() || setIds.length === 0) return out;
  const rows = await prisma.$queryRaw<{ id: string; load: unknown }[]>`SELECT "id", "load" FROM "UserExerciseSet" WHERE "id" IN (${Prisma.join([...new Set(setIds)])}) AND "load" IS NOT NULL`;
  for (const r of rows) {
    const snap = readSnapshot(r.load);
    if (snap) out.set(r.id, snap);
  }
  return out;
}

/** 한 세트의 지금 스냅샷 값(고치기 · 재전송의 '이미 있는 값') — 꺼져 있으면 null */
export async function readSetLoad(tx: Tx, setId: string): Promise<RecordedLoad | null> {
  if (!loadStructured()) return null;
  const rows = await tx.$queryRaw<{ load: unknown }[]>`SELECT "load" FROM "UserExerciseSet" WHERE "id" = ${setId}`;
  return readSnapshot(rows[0]?.load)?.value ?? null;
}

/** 옛 앱이 보낸 원래 요청을 복구 기록에 — 정식 세트와 같은 거래 안에서(같은 지문은 한 줄). 꺼져 있으면 아무것도 안 한다 */
export async function insertLoadRecovery(tx: Tx, r: LoadRecoveryRow): Promise<void> {
  if (!loadStructured()) return;
  await insertLoadRecoveryTx(tx, r);
}

/**
 * 지난 세트로 진행 · 추천 · 기준 무게를 셈하는 곳의 kg 읽기 — 지금 운동의 견줌 열쇠와 같은 기록만.
 *   - 'metric': 최고 · 다음 무게 추천 · 총량에 쓸 무게(자유 중량 · 같은 기구 열쇠의 기구 설정값)
 *   - 'e1rm'  : 추정 1RM 을 셈할 무게(검토한 허용 목록의 자유 중량만)
 * 케이블 · 머신은 기구 열쇠(setup)가 지금 운동과 같아야 하는데, 지금 열쇠를 모르는 추천 자리에서는 늘 null 이다(GPT 서브1 결정 —
 * 기구 정체 없는 지난 설정값으로 미리 채우기 · 추천 조정 · 자동 진행을 하지 않는다). 확인 전 · 맞지 않는 kg 도 null.
 */
export async function historyKgReader(
  rows: readonly { id?: string; sessionId: string | null; exerciseId: string }[],
  mode: 'metric' | 'e1rm'
): Promise<(row: { id?: string; sessionId: string | null; exerciseId: string; weightKg: number | null }) => number | null> {
  const [ctxOf, current, snaps] = await Promise.all([
    readContextsFor(rows.map((r) => ({ exerciseId: r.exerciseId, sessionId: r.sessionId }))),
    currentContracts(rows.map((r) => r.exerciseId)),
    readSetLoads(rows.map((r) => r.id).filter((x): x is string => typeof x === 'string')),
  ]);
  return (row) => {
    const v = viewSetLoad(ctxOf(row.exerciseId, row.sessionId), { weightKg: row.weightKg, snapshot: row.id ? (snaps.get(row.id) ?? null) : null });
    const kg = mode === 'metric' ? v.metricKg : v.e1rmKg;
    if (kg == null || v.key == null) return null;
    const now = current.get(row.exerciseId);
    return now && now.key === v.key ? kg : null;
  };
}

/**
 * 하루 요약 줄(UserExerciseLog)의 kg 을 읽기 관문으로 본다 — 그날 판(얼린 계약 · 장비)이 근거, 판이 없으면 '확인 전'.
 * 부하 · 기록 목록 · 요약 화면이 같은 규칙을 쓰게 한곳에 둔다.
 */
export async function logViewReader(
  userId: string,
  logs: readonly { exerciseId: string; date: Date }[]
): Promise<(log: { exerciseId: string; date: Date; weightKg: number | null }) => SetLoadView> {
  const days = logs.length
    ? await prisma.trainingSession.findMany({
        where: { userId, date: { in: [...new Set(logs.map((l) => l.date.getTime()))].map((t) => new Date(t)) } },
        select: { id: true, date: true },
      })
    : [];
  const sessionOfDay = new Map(days.map((d) => [d.date.getTime(), d.id]));
  const ctxOf = await readContextsFor(logs.map((l) => ({ exerciseId: l.exerciseId, sessionId: sessionOfDay.get(l.date.getTime()) ?? null })));
  return (log) => viewSetLoad(ctxOf(log.exerciseId, sessionOfDay.get(log.date.getTime()) ?? null), { weightKg: log.weightKg });
}
