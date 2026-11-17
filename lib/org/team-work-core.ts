/**
 * EX-LOAD01 R1-03 — 코치 기록(writeOrgWork)의 핵심. DB 를 넘겨받으므로 서버(lib/org/team-work-store.ts — 실제 prisma)와 격리 시험(PGlite,
 * scripts/load-r1-org-selftest.mts)이 **같은 코드**를 돈다. 'server-only' 를 걸지 않은 까닭이 이것이다 — 회원 번호를 받으므로 화면 · 서버 동작이
 * 직접 부르지 않는다(코치 권한 · 선수 공유 동의를 확인한 서버 코드만 — team-session-store applyTeamWork).
 *
 * ■ 지우기 · 넣기 전에 모든 줄을 먼저 본다
 *   운동 · 세트마다 수량(무게 · 횟수 · 초)과 무게 계약(normalizeSetLoad)을 **아무것도 지우기 전에** 검사한다. 하나라도 안 되면(모르는 운동 · 모르는 선수 ·
 *   올바르지 않은 수량 · 꼭 적어야 하는 무게가 없음 · 받지 않는 형식) 아무것도 쓰지 않고 그 운동 · 세트를 가리키는 실패를 돌려준다. 거래 안에서
 *   예기치 않게 던지면 거래가 통째로 되돌아간다(세트 지우기 · 넣기 · 판 · 요약이 함께).
 *   예전에는 정규화가 거절해도 보낸 kg 을 그대로 옛 칸에 넣었다(R1 검토 3) — 그 길을 없앴다.
 *
 * ■ 스키마 미적용(지금 운영)
 *   정규화가 받은 옛 쓰기(legacyUnchanged)는 예전 쓰기 그대로다 — 장비가 받지 않는 kg(맨몸 운동의 kg)도 옛 칸에 남고 읽기가 얼린 계약으로 뺀다.
 *   이것을 '새 정규화로 저장'이나 '복구 기록'이라 말하지 않는다(결과의 legacyUnchanged · incompatibleKept 로만 센다).
 *
 * ■ 스키마 적용 뒤
 *   정식 세트는 계약대로(맨몸 kg 은 비움), 원래 보낸 값은 같은 거래의 복구 기록(WorkoutLoadRecovery)으로, 세트 스냅샷도 같은 거래에서.
 *
 * ■ 어느 계약으로 보나
 *   그 선수의 그날 판에 이미 얼린 운동이면 **그 판의 계약**(읽기 관문이 그 세트를 볼 계약과 같게), 판에 없는 운동이면 지금 라이브러리로 새로 얼린 계약.
 *   화면이 보낸 장비 · 무게 가능 여부는 믿지 않는다.
 *
 * ■ 같은 활동을 다시 쓸 때 — 저장된 무게 기록을 잃지 않는다(R1-03 3차, GPT 실제 PostgreSQL 검사)
 *   바꾸기는 그 활동의 코치 세트를 지우고 다시 넣는다. 예전에는 무게 칸(load)이 없는 세트(옛 앱 · 무게를 안 고친 새 앱)를 '기존 값 없음'으로
 *   정규화해, 고른 밴드 · 섞인 무게 · 기구 이름 · 양손 무게가 '어느 밴드인지 모름' 같은 빈 기록으로 바뀌었다. 이제 구조화 저장이 켜져 있으면(v2 와 상관없이)
 *   선수 잠금(workout:<선수>, 세트 쓰기 · v2 와 같은 열쇠) 안에서 **지우기 전에** 이 활동의 코치 세트와 스냅샷을 잠가 읽고, 무게 칸이 없는 세트는
 *   맞는 기존 세트를 기존 값으로 다시 정규화한다(없음 = 그대로 — 운동 화면 persistSet 과 같은 규칙). 그대로 두는 결과면 저장된 스냅샷을 새 줄에 옮긴다.
 *   맞추는 법(prepareOrgWork 의 existing — matchOrgExisting):
 *     - 같은 운동 안의 세트 차례(번호 순 0 부터)끼리 — 화면이 보이는 'N세트'다. 줄 편집기는 세트 차례를 바꾸지 않는다.
 *     - 세트 수가 같으면 차례대로 짝짓는다.
 *     - 세트 수가 바뀌었으면(빼거나 더함) 기존 세트의 저장된 무게가 **모두 같을 때만**(한 줄을 여러 세트로 편 모양) 그 값을 잇는다 — 뺀 세트는 지워지고
 *       더한 세트는 같은 값을 받는다. 세트마다 값이 다르면 어느 세트의 것인지 알 수 없으므로 **지우기 전에 거절**한다(ORG_LOAD_AMBIGUOUS).
 *     - 맞는 세트의 저장된 스냅샷을 읽을 수 없으면 짐작하지 않고 지우기 전에 거절한다(ORG_LOAD_UNREADABLE). 두 거절 다 아무것도 쓰지 않았고,
 *       고칠 곳(운동 · 세트)과 할 일(무게 기록을 다시 골라 보내기)을 말한다 — 무게 칸을 실은 세트는 맞출 필요가 없다.
 *   무게 칸을 실은 세트는 그 값 그대로(명시적 지움 load:null 은 지움), 줄 · 운동을 뺀 것은 지움 — 뜻이 바뀌지 않는다.
 */
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AMOUNT_LIMITS } from '@/lib/exercise-meta';
import { slotForTheme } from '@/lib/report/theme';
import { contractOfFrozen, freezeExercise, readFrozenPlan, type FrozenExercise, type FrozenPlan } from '@/lib/workout/session-plan';
import type { RecordingContract } from '@/lib/workout/load/contract';
import { normalizeSetLoad, type NormalizeOk } from '@/lib/workout/load/recorded';
import type { LoadErrorCode } from '@/lib/workout/load/protocol';
import { readSnapshot, snapshotOf, type LoadSnapshot } from '@/lib/workout/load/snapshot';
import { insertLoadRecoveryTx, lockOwnerTx, originalPayloadHash, readSnapshotsTx, writeSetSnapshot } from '@/lib/workout/load/store';
import { canonicalJson } from '@/lib/workout/v2/operation';
import { insertRecovery, lockOwner, type Tx } from '@/lib/workout/v2/store';
import { applySummaryTx } from '@/lib/workout/summary-core';
import {
  ORG_SET_BASE,
  orgLoadFieldsError,
  readOrgLoadFields,
  isEmptyOrgPlan,
  orgPlan,
  withOrgExercises,
  withoutEmptyOrgExercises,
  type OrgSet,
  type OrgWorkItem,
} from '@/lib/org/team-work';

/** 라이브러리 줄 하나 — freezeExercise 가 받는 모양(지금 장비) */
export type OrgLibraryRow = Parameters<typeof freezeExercise>[0];

export type OrgWorkRejectCode =
  | LoadErrorCode
  | 'ORG_UNKNOWN_EXERCISE'
  | 'ORG_UNKNOWN_OWNER'
  | 'ORG_INVALID_QUANTITY'
  /** 무게 칸 없이 다시 쓰는데 세트 수가 바뀌었고 기존 세트마다 저장된 무게가 달라 짝지을 수 없다 */
  | 'ORG_LOAD_AMBIGUOUS'
  /** 무게 칸 없이 다시 쓰는데 맞는 기존 세트의 저장된 무게 기록을 읽을 수 없다 */
  | 'ORG_LOAD_UNREADABLE';

/**
 * 코치 기록을 쓰지 않은 까닭 — 고칠 곳(운동 · 세트 차례 0 부터)을 가리킨다. 아무것도 쓰지 않았다.
 * 부르는 쪽은 기존 답 모양을 지키고 이 갈래만 더한다(app-team confirmTeamWork 의 선수 결과 · 웹 · 앱 화면의 한 줄).
 */
export type OrgWorkRejection = {
  ok: false;
  code: OrgWorkRejectCode;
  error: string;
  exerciseId: string | null;
  setIndex: number | null;
};

/** 쓴 결과 — 무엇을 실제로 했는지 그대로(새 정규화를 하지 않은 옛 쓰기를 정규화했다고 말하지 않는다) */
export type OrgWorkDone = {
  ok: true;
  /** saved: 세트를 썼다 · deferred: v2 판이라 복구함에 보냈다(세트 안 씀) */
  outcome: 'saved' | 'deferred';
  sessionId: string | null;
  /** 쓴 코치 세트 수 */
  sets: number;
  /** 스키마 미적용의 옛 쓰기 그대로 남긴 세트 수(정규화 · 복구 없음) — 그 가운데 장비가 받지 않는 kg 이 옛 칸에 남은 수 */
  legacyUnchanged: number;
  incompatibleKept: number;
  /** 스키마 적용 뒤 원래 값을 복구 기록에 남긴 세트 수 */
  recovered: number;
};

export type OrgWorkResult = OrgWorkDone | OrgWorkRejection;

export type OrgWorkDeps = {
  db: PrismaClient;
  /** 운동 번호 → 라이브러리 줄(지금 장비). 서버는 lib/library-cache exercisesByIds */
  exercisesByIds: (ids: readonly string[]) => Promise<readonly OrgLibraryRow[]>;
  /** 판에 없는 운동의 요약 근거 — 서버는 lib/workout/load/server currentContracts */
  currentContracts: (ids: readonly string[]) => Promise<ReadonlyMap<string, RecordingContract>>;
  /** 구조화 저장(스키마 적용 · 스위치 켬) — 서버는 loadStructured() */
  structured: boolean;
  /** v2 칸이 있는가 — 서버는 workoutV2SchemaApplied() */
  v2Applied: boolean;
  now: () => Date;
};

export type OrgWorkInput = {
  userId: string;
  dateKey: string;
  orgEventId: string;
  enteredById: string;
  items: readonly OrgWorkItem[];
};

/* ─────────────────────────── 거래 전 · 순수 검사 ─────────────────────────── */

const QUANTITY_ERROR = '값이 올바르지 않아요. 다시 적어 주세요.';

/** 세트 하나의 수량이 받을 수 있는 모양인가(없음 = null 은 '안 적음') — 숫자 아님 · 범위 밖 · 0 이하는 거절 */
export function orgSetQuantityOk(s: unknown): s is OrgSet {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  const kg = o.weightKg;
  const reps = o.reps;
  const hold = o.holdSeconds;
  if (kg != null && !(typeof kg === 'number' && Number.isFinite(kg) && kg > 0 && kg <= AMOUNT_LIMITS.weightKg)) return false;
  if (reps != null && !(typeof reps === 'number' && Number.isInteger(reps) && reps >= 1 && reps <= AMOUNT_LIMITS.reps)) return false;
  if (hold != null && !(typeof hold === 'number' && Number.isInteger(hold) && hold >= 1 && hold <= AMOUNT_LIMITS.holdSeconds)) return false;
  return true;
}

/** 같은 운동이 여러 줄이면 세트를 차례대로 잇는다(세트 번호가 겹치지 않게 — 예전에는 둘째 줄이 같은 번호로 부딪혀 거래가 실패했다) */
export function mergeOrgItems(items: readonly OrgWorkItem[]): OrgWorkItem[] {
  const out = new Map<string, OrgSet[]>();
  for (const it of items) out.set(it.exerciseId, [...(out.get(it.exerciseId) ?? []), ...(Array.isArray(it.sets) ? it.sets : [])]);
  return [...out].map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

export type PreparedOrgSet = {
  exerciseId: string;
  /** 그 운동 안의 세트 차례(0 부터) */
  index: number;
  set: OrgSet;
  contract: RecordingContract;
  norm: NormalizeOk;
  /** 다시 쓸 때 그대로 옮길 저장된 스냅샷(DB 의 값 그대로) — norm.load 가 없을(그대로 둠) 때만 쓴다 */
  carry?: unknown;
};

/** 바꾸기 전 이 활동의 코치 세트 한 줄 — 거래 안에서 선수 잠금 · 줄 잠금으로 읽은 것(load 는 DB 의 값 그대로) */
export type OrgExistingRow = { exerciseId: string; setNo: number; weightKg: number | null; load: unknown };

const REPICK = '앱을 업데이트한 뒤 무게 기록을 다시 골라 보내 주세요.';

/**
 * 무게 칸 없이 온 세트(같은 운동의 pos 번째, 그 운동의 세트 수 count)에 맞는 기존 세트 — 머리 주석의 '같은 활동을 다시 쓸 때' 규칙. 순수.
 * was 는 그 운동의 기존 코치 세트(번호 순). null 이면 맞출 저장 값이 없다(새 세트처럼).
 */
export function matchOrgExisting(
  was: readonly OrgExistingRow[],
  count: number,
  pos: number
): { row: OrgExistingRow; snap: LoadSnapshot | null } | { code: 'ORG_LOAD_AMBIGUOUS' | 'ORG_LOAD_UNREADABLE'; message: string } | null {
  if (!was.some((w) => w.load != null)) return null;
  const unreadable = { code: 'ORG_LOAD_UNREADABLE' as const, message: `저장된 무게 기록을 읽을 수 없어요. ${REPICK}` };
  if (count === was.length) {
    const row = was[pos];
    if (!row || row.load == null) return null;
    const snap = readSnapshot(row.load);
    return snap ? { row, snap } : unreadable;
  }
  /* 세트 수가 바뀌었다 — 저장된 값이 모두 같을 때만(한 줄을 여러 세트로 편 모양) 잇는다 */
  if (was.some((w) => w.load != null && !readSnapshot(w.load))) return unreadable;
  const kinds = new Set(was.map((w) => (w.load == null ? '' : canonicalJson(readSnapshot(w.load)!.value))));
  if (kinds.size !== 1)
    return { code: 'ORG_LOAD_AMBIGUOUS', message: `세트 수가 바뀌었는데 세트마다 저장된 무게 기록이 달라 어느 세트의 기록인지 알 수 없어요. ${REPICK}` };
  const row = was[Math.min(pos, was.length - 1)];
  return { row, snap: readSnapshot(row.load) };
}

const reject = (code: OrgWorkRejectCode, error: string, exerciseId: string | null, setIndex: number | null): OrgWorkRejection => ({
  ok: false,
  code,
  error,
  exerciseId,
  setIndex,
});

/**
 * 모든 운동 · 세트를 쓰기 전에 본다 — 순수. contractOf 는 그 운동의 권위 있는 계약(판에 얼린 것 · 없으면 새로 얼린 것), titleOf 는 고칠 곳을 말할 이름.
 * 하나라도 안 되면 그 실패 하나를 돌려준다(아무것도 쓰지 않게). 무게 기록 칸(loadProtocol · load · variant)을 실은 세트는 새 화면의 약속으로,
 * 칸이 없는 세트는 옛 길(hasProtocol false — kg 숫자 하나, alternative 의 변형은 kg 유무로)로 정규화한다.
 * existing(쓰기 거래가 잠가 읽은 이 활동의 코치 세트)을 주면, 구조화 저장에서 load 칸이 없는 세트는 맞는 기존 세트를 기존 값으로 정규화한다
 * (없음 = 그대로 — 머리 주석). 세트의 차례는 같은 운동 안에서 items 를 따라 센다(쓰기는 mergeOrgItems 로 합친 items 를 넘긴다).
 */
export function prepareOrgWork(
  items: readonly OrgWorkItem[],
  contractOf: (exerciseId: string) => RecordingContract | null,
  titleOf: (exerciseId: string) => string | null,
  structured: boolean,
  existing: readonly OrgExistingRow[] = []
): { ok: true; rows: PreparedOrgSet[] } | OrgWorkRejection {
  const rows: PreparedOrgSet[] = [];
  const byEx = new Map<string, OrgExistingRow[]>();
  for (const e of existing) byEx.set(e.exerciseId, [...(byEx.get(e.exerciseId) ?? []), e]);
  for (const list of byEx.values()) list.sort((x, y) => x.setNo - y.setNo);
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.exerciseId, (counts.get(it.exerciseId) ?? 0) + (Array.isArray(it.sets) ? it.sets.length : 0));
  const seen = new Map<string, number>();
  for (const it of items) {
    const contract = contractOf(it.exerciseId);
    const title = titleOf(it.exerciseId);
    if (!contract || title == null) return reject('ORG_UNKNOWN_EXERCISE', '없는 운동이 섞여 있어요. 다시 골라 주세요.', it.exerciseId, null);
    for (const [index, s] of (Array.isArray(it.sets) ? it.sets : []).entries()) {
      if (!orgSetQuantityOk(s)) return reject('ORG_INVALID_QUANTITY', `${title} ${index + 1}세트: ${QUANTITY_ERROR}`, it.exerciseId, index);
      /*
       * EX-LOAD01 R1-03 — 세트가 실은 약속 그대로 정규화한다: 무게 기록 칸(loadProtocol · loadResolver · load · variant)이 있으면 새 화면의 세트
       * (운동 화면과 같은 규칙 — 모르는 판은 거절, 스키마 미적용이면 밴드 · 섞인 무게 · 기구 이름 · 서로 다른 무게는 LOAD_UNSUPPORTED 로 거절,
       * 고른 밴드를 '어느 밴드인지 모름'으로 낮추지 않는다), 없으면 옛 길(kg 숫자만 — 예전 그대로). 무엇을 하든 지우기 · 넣기 전이다.
       */
      const lf = readOrgLoadFields(s as Record<string, unknown>);
      if ('error' in lf) return reject('LOAD_INVALID', `${title} ${index + 1}세트: ${lf.error}`, it.exerciseId, index);
      /* 새 칸을 실었는데 약속 번호가 없으면 옛 길로 낮추지 않는다(스키마 미적용의 옛 쓰기는 load 를 말없이 버린다) */
      const shape = orgLoadFieldsError(lf);
      if (shape) return reject('LOAD_INVALID', `${title} ${index + 1}세트: ${shape}`, it.exerciseId, index);
      const pos = seen.get(it.exerciseId) ?? 0;
      seen.set(it.exerciseId, pos + 1);
      /* 무게 칸이 없는 세트 — 맞는 기존 세트가 있으면 그 값으로(그대로 둠). 짝을 정할 수 없거나 저장 값을 못 읽으면 지우기 전에 거절 */
      const m = structured && lf.load === undefined ? matchOrgExisting(byEx.get(it.exerciseId) ?? [], counts.get(it.exerciseId) ?? 0, pos) : null;
      if (m && 'code' in m) return reject(m.code, `${title} ${index + 1}세트: ${m.message}`, it.exerciseId, index);
      const norm = normalizeSetLoad({
        hasProtocol: lf.loadProtocol !== undefined,
        protocol: lf.loadProtocol,
        resolver: lf.loadResolver,
        contract,
        variant: lf.variant,
        weightKg: s.weightKg,
        hasLoad: lf.load !== undefined,
        load: lf.load,
        structured,
        existing: m ? { weightKg: m.row.weightKg, load: m.snap?.value ?? null } : null,
      });
      if (!norm.ok) return reject(norm.code, `${title} ${index + 1}세트: ${norm.error}`, it.exerciseId, index);
      rows.push({
        exerciseId: it.exerciseId,
        index,
        set: { weightKg: s.weightKg ?? null, reps: s.reps ?? null, holdSeconds: s.holdSeconds ?? null, ...lf },
        contract,
        norm,
        ...(m && m.snap && norm.load === undefined ? { carry: m.row.load } : {}),
      });
    }
  }
  return { ok: true, rows };
}

/* ─────────────────────────── 쓰기 ─────────────────────────── */

/* 거래 안에서 검사에 걸리면 던져 거래를 끝낸다(아무것도 안 썼지만 같은 길로 되돌림을 보장) — 바깥에서 실패 갈래로 바꾼다 */
class OrgWorkRejected extends Error {
  readonly rejection: OrgWorkRejection;
  constructor(rejection: OrgWorkRejection) {
    super(rejection.error);
    this.rejection = rejection;
  }
}

/**
 * 한 활동(orgEventId)의 코치 세트를 통째로 바꾼다 — items 가 비면 그 활동의 코치 세트를 다 지운다(되돌리기 · 일지 지우기).
 * 판이 없으면 'org' 판(마친 상태)을 만들고, 코치 운동만 있던 판에 세트가 하나도 안 남으면 판째 지운다. 요약(UserExerciseLog)은 **같은 거래**에서
 * 세트로부터 다시 셈한다(lib/workout/summary-core.ts — 마침 · 저절로 닫힘과 같은 계산).
 */
export async function writeOrgWorkCore(deps: OrgWorkDeps, a: OrgWorkInput): Promise<OrgWorkResult> {
  const date = new Date(`${a.dateKey}T00:00:00.000Z`);
  const items = mergeOrgItems(a.items);
  const details = await deps.exercisesByIds(items.map((i) => i.exerciseId));
  const libById = new Map(details.map((d) => [d.id, d]));
  /* 판에 없을 때 쓸 새로 얼린 운동 — 예전처럼 슬롯은 'lower' 기준(코치 운동은 판의 차례를 바꾸지 않는다) */
  const fresh = new Map<string, FrozenExercise>(details.map((ex) => [ex.id, freezeExercise(ex, slotForTheme(ex, 'lower'))]));

  try {
    return await deps.db.$transaction(async (tx) => {
      /*
       * EX-RX01 R2A — v2 를 켜면 선수(데이터 주인) 잠금 안에서 돈다(코치가 써도 선수 잠금). 검사보다 먼저 잠가, 읽은 판이 검사 · 쓰기 사이에 바뀌지 않게.
       * EX-LOAD01 R1-03 — 구조화 저장이 켜져 있으면 v2 가 아니어도 같은 열쇠(workout:<선수>)로 잠근다: 아래에서 기존 세트의 스냅샷을 읽고 옮기는
       * 사이에 운동 화면(persistSet) · 다른 코치 쓰기가 끼어들지 않게.
       */
      if (deps.v2Applied) await lockOwner(tx as unknown as Tx, a.userId);
      else if (deps.structured) await lockOwnerTx(tx, a.userId);

      /*
       * 모르는 선수 — 회원 번호가 가리키는 계정이 없으면 세트 · 판을 만들지 않는다(관계 없는 표라 DB 가 막지 않는다). 빈 목록(이 활동의 코치 세트
       * 빼기)은 새로 만드는 것이 없어 묻지 않는다 — 주인 없는 옛 줄도 뺄 수 있게.
       */
      if (items.length) {
        const owner = await tx.user.findUnique({ where: { id: a.userId }, select: { id: true } });
        if (!owner) throw new OrgWorkRejected(reject('ORG_UNKNOWN_OWNER', '선수 계정을 찾을 수 없어요.', null, null));
      }

      const existing = await tx.trainingSession.findUnique({ where: { userId_date: { userId: a.userId, date } }, select: { id: true, plan: true } });
      const plan: FrozenPlan | null = readFrozenPlan(existing?.plan);
      const inPlan = new Map((plan?.exercises ?? []).filter((e) => e && typeof e.id === 'string').map((e) => [e.id, e]));
      /* 권위 있는 계약 — 그 판에 이미 얼린 운동이면 그 판의 계약, 아니면 새로 얼린 계약. 라이브러리에 없는 운동은 판에 있어도 모르는 운동이다 */
      const contractOf = (id: string): RecordingContract | null => {
        if (!libById.has(id)) return null;
        const frozen = inPlan.get(id) ?? fresh.get(id);
        return frozen ? contractOfFrozen(frozen) : null;
      };
      const titleOf = (id: string) => libById.get(id)?.title ?? null;
      /*
       * 지우기 전에 이 활동 · 이 선수의 코치 세트를 줄 잠금으로 읽어, 무게 칸이 없는 세트는 맞는 기존 세트로 정규화한다(머리 주석).
       * 새 칸(load)은 구조화 저장이 켜져 있을 때만 SQL 에 나온다.
       */
      const before =
        deps.structured && existing
          ? await tx.$queryRaw<OrgExistingRow[]>`
              SELECT "exerciseId", "setNo", "weightKg", "load" FROM "UserExerciseSet"
               WHERE "sessionId" = ${existing.id} AND "userId" = ${a.userId} AND "orgEventId" = ${a.orgEventId} AND "enteredById" IS NOT NULL
               ORDER BY "exerciseId", "setNo" FOR UPDATE`
          : [];
      const prepared = prepareOrgWork(items, contractOf, titleOf, deps.structured, before);
      if (!prepared.ok) throw new OrgWorkRejected(prepared);
      const rows = prepared.rows;

      /*
       * EX-RX01 R2A — 그 날 판이 v2 면 코치 세트를 통째로 지우고 다시 넣지 않는다(세트 번호 · 목표 연결이 사라지므로). 보낸 것을 복구함에
       * 그대로 남기고(잃지 않음) 맞추기는 다음 단계의 화면에서 한다. 검사를 지난 것만 복구함에 간다.
       */
      if (deps.v2Applied) {
        const v = await tx.$queryRaw<{ id: string; p: number }[]>`
          SELECT "id", "mutationProtocolVersion" AS p FROM "TrainingSession" WHERE "userId" = ${a.userId} AND "date" = ${date}`;
        if (v[0] && v[0].p >= 2) {
          await insertRecovery(tx as unknown as Tx, {
            ownerId: a.userId,
            actorId: a.enteredById,
            source: 'org.writeOrgWork',
            fingerprint: `org:${a.orgEventId}:${a.dateKey}:${createHash('sha256').update(JSON.stringify(a.items)).digest('hex').slice(0, 24)}`,
            sessionId: v[0].id,
            exerciseId: null,
            conflictCode: 'ORG_REPLACE_ON_V2_SESSION',
            payload: { orgEventId: a.orgEventId, dateKey: a.dateKey, items: a.items },
          });
          return { ok: true, outcome: 'deferred', sessionId: v[0].id, sets: 0, legacyUnchanged: 0, incompatibleKept: 0, recovered: 0 } satisfies OrgWorkDone;
        }
      }

      const touched = items.filter((i) => libById.has(i.exerciseId)).map((i) => i.exerciseId);
      let session = existing;
      if (!session) {
        if (rows.length === 0 && items.length === 0) return done(null, rows);
        const now = deps.now();
        session = await tx.trainingSession.create({
          data: {
            userId: a.userId,
            date,
            themeKey: 'org',
            plan: orgPlan(touched.map((id) => fresh.get(id)!)) as unknown as Prisma.InputJsonValue,
            status: 'FINISHED',
            startedAt: now,
            mainStartedAt: now,
            endedAt: now,
          },
          select: { id: true, plan: true },
        });
      }
      const id = session.id;

      /* 이 활동의 코치 세트를 통째로 지우고 다시 넣는다. 다른 활동의 코치 세트(같은 날 두 번 · 같은 운동)는 그 번호 뒤부터 */
      /* 코치 세트만 — 선수가 그 일정에서 직접 한 세트(enteredById 없음, 계약 9-6 ③-2)는 건드리지 않는다 */
      await tx.userExerciseSet.deleteMany({ where: { sessionId: id, orgEventId: a.orgEventId, enteredById: { not: null } } });
      const others = await tx.userExerciseSet.groupBy({
        by: ['exerciseId'],
        where: { sessionId: id, setNo: { gt: ORG_SET_BASE }, exerciseId: { in: touched } },
        _max: { setNo: true },
      });
      const start = new Map(others.map((o) => [o.exerciseId, o._max.setNo ?? ORG_SET_BASE]));
      const numbered = rows.map((r) => ({ ...r, setNo: (start.get(r.exerciseId) ?? ORG_SET_BASE) + r.index + 1 }));
      /*
       * kg 은 정규화가 낸 값만(옛 칸 투영). 스키마 미적용의 옛 쓰기(legacyUnchanged)는 예전 쓰기 그대로의 kg, 적용 뒤에는 계약대로(맨몸이면 비움 —
       * 원래 값은 아래 복구 기록). 거절된 줄은 여기까지 오지 않는다.
       */
      if (numbered.length)
        await tx.userExerciseSet.createMany({
          data: numbered.map((r) => ({
            sessionId: id,
            userId: a.userId,
            exerciseId: r.exerciseId,
            date,
            setNo: r.setNo,
            weightKg: r.norm.weightKg,
            reps: r.set.reps,
            holdSeconds: r.set.holdSeconds,
            enteredById: a.enteredById,
            orgEventId: a.orgEventId,
          })),
        });
      if (deps.structured) {
        for (const r of numbered) {
          if (!r.norm.load && !r.norm.recover && r.carry === undefined) continue;
          const made = await tx.userExerciseSet.findUnique({
            where: { sessionId_exerciseId_setNo: { sessionId: id, exerciseId: r.exerciseId, setNo: r.setNo } },
            select: { id: true },
          });
          if (!made) throw new Error('코치 세트를 다시 읽지 못했어요');
          if (r.norm.load) {
            await writeSetSnapshot(tx, made.id, snapshotOf({ load: r.norm.load, status: r.norm.status, contract: r.norm.contract, variant: r.norm.variant, provenance: 'org' }));
          } else if (r.carry !== undefined) {
            /* 그대로 둔 무게 — 지운 줄에 있던 스냅샷을 새 줄에 그대로(읽어서 확인한 값, DB 의 모양 그대로) */
            await writeSetSnapshot(tx, made.id, r.carry as LoadSnapshot);
          }
          if (r.norm.recover) {
            /* 원래 보낸 값 그대로 — 무게 기록 칸을 실었으면 그것까지(지문에 들어간다) */
            const { loadProtocol, loadResolver, load, variant } = r.set;
            const original = {
              kind: 'org.writeOrgWork',
              orgEventId: a.orgEventId,
              exerciseId: r.exerciseId,
              setNo: r.setNo,
              weightKg: r.set.weightKg,
              reps: r.set.reps,
              holdSeconds: r.set.holdSeconds,
              ...(loadProtocol !== undefined ? { loadProtocol } : {}),
              ...(loadResolver !== undefined ? { loadResolver } : {}),
              ...(load !== undefined ? { load } : {}),
              ...(variant !== undefined ? { variant } : {}),
            };
            await insertLoadRecoveryTx(tx, {
              ownerId: a.userId,
              actorId: a.enteredById,
              setId: made.id,
              sessionId: id,
              exerciseId: r.exerciseId,
              setNo: r.setNo,
              originalHash: originalPayloadHash(original),
              original,
              reason: 'ORG_UNSUPPORTED_LOAD',
              protocol: typeof r.set.loadProtocol === 'number' ? r.set.loadProtocol : null,
            });
          }
        }
      }

      /* 판 목록 — 새 코치 운동은 뒤에 붙이고, 세트가 안 남은 코치 운동은 뺀다(그 요약 줄도) */
      const current = readFrozenPlan(session.plan);
      if (current) {
        const left = await tx.userExerciseSet.findMany({ where: { sessionId: id }, select: { exerciseId: true }, distinct: ['exerciseId'] });
        const { plan: next, dropped } = withoutEmptyOrgExercises(
          withOrgExercises(current, touched.map((x) => fresh.get(x)!).filter(Boolean)),
          new Set(left.map((l) => l.exerciseId))
        );
        if (dropped.length)
          await tx.userExerciseLog.deleteMany({ where: { userId: a.userId, date, exerciseId: { in: dropped }, setsDone: { not: null } } });
        if (isEmptyOrgPlan(next)) {
          await tx.trainingSession.delete({ where: { id } });
          return done(null, numbered);
        }
        if (next !== current) await tx.trainingSession.update({ where: { id }, data: { plan: next as unknown as Prisma.InputJsonValue } });
      }
      /* 목록을 못 읽는 판은 목록을 건드리지 않는다 — 세트 · 요약만 */
      await applySummaryTx(
        tx,
        {
          snapshots: (ids) => (deps.structured ? readSnapshotsTx(tx, ids) : Promise.resolve(new Map())),
          current: deps.currentContracts,
          planExercises: (p) => readFrozenPlan(p)?.exercises,
        },
        a.userId,
        { id, date }
      );
      return done(id, numbered);
    });
  } catch (e) {
    if (e instanceof OrgWorkRejected) return e.rejection;
    throw e;
  }
}

function done(sessionId: string | null, rows: readonly PreparedOrgSet[]): OrgWorkDone {
  return {
    ok: true,
    outcome: 'saved',
    sessionId,
    sets: rows.length,
    legacyUnchanged: rows.filter((r) => r.norm.legacyUnchanged).length,
    incompatibleKept: rows.filter((r) => r.norm.incompatibleKept).length,
    recovered: rows.filter((r) => r.norm.recover).length,
  };
}
