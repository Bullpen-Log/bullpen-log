import { randomBytes } from 'node:crypto';
import { defaultRequestKey, opIdOf, payloadHashOf } from '@/lib/review-evidence/hash';
import { locateOp, materialize, opOutcome, type Library, type SupersededBy, type UseState } from '@/lib/review-evidence/materialize';
import { MAX_OP_BYTES, OP_FOLDER, OP_NAME, SCHEMA_OP, WRITE_ID, parseStoredOp, type Actor, type ImportPayload, type Op, type RegisterPayload, type WithdrawPayload } from '@/lib/review-evidence/model';

/**
 * EX-REF04 — 저장 · 읽기 순서(순수: 진짜 저장소는 밖에서 넣는다 — 시험이 가짜 저장소 · 실패 · 늦은 응답으로 돈다).
 *
 * 쓰기: 기록 한 건 = 저장소 객체 한 개(review-evidence/v1/ops/<opId>.json), '없을 때만 만들기'로 쓴다(덮어쓰기 없음).
 *  - 쓰기마다 무작위 쓰기 번호(writeId)를 본문에 넣는다(내용 지문 · 기록 번호에는 들어가지 않음).
 *  - 만들었으면 · 이미 있으면 · 오류 · 시간 초과 — 어느 경우든 다시 읽어 확인한다.
 *    같은 계정 · 같은 종류 · 같은 내용 지문이면 성공, 다른 내용이면 충돌(요청 번호를 다른 내용에 다시 씀),
 *    읽어도 없으면 '대기'(저장되지 않았을 수 있다 — 같은 요청 번호로 다시 보내면 안전).
 *  - 새로 저장했나(201) · 앞서 저장된 같은 요청인가(200, replayed)는 다시 읽은 본문의 쓰기 번호로만 가른다:
 *    내 쓰기 번호와 같으면 새로 저장(응답을 잃었거나 늦게 저장된 경우도), 다르거나 없으면(옛 기록) 앞서 저장된 것.
 *    받은 시각은 쓰지 않는다 — 같은 1/1000초에 겹친 요청도 하나만 201 이다.
 *  - 저장을 확인한 뒤 목록 전체를 다시 모아 이 기록이 실제로 화면에 들어갔는지 본다(visible). 목록을 못 읽으면 저장은 됐지만 '보이는지 미확인'.
 *    이 확인은 내가 만든 뒤에 시작하므로 내 기록은 늘 아래 '목록을 모으는 동안' 앞부터 있던 것이다.
 *  - 같은 다시 모은 목록에서 이 기록이 가리키는 쓰임의 상태(useState)와, 효과를 내지 못했으면 무엇에 밀렸는지(supersededBy)도 싣는다(R2, 더하기만).
 *    다른 컴퓨터의 더 늦은 거두기 · 다시 등록에 밀린 옛 거두기는 저장은 되지만 효과가 없다 — '확인 못 함'이 아니라 끝난 결과로 알 수 있게.
 *
 * 읽기(목록 모으기 listAllOps): 이름 차례(글자 단위 오름차순)로 '다음 쪽 표(cursor) 다음부터'를 쪽마다 묻는다(keyset).
 *  - 지켜야 하는 것: 이름이 앞 이름보다 늘 크다(쪽 안 · 쪽 사이 — 겹침도 막힌다), 다음 쪽이 있으면 비지 않은 새 다음 쪽 표가 있다,
 *    쪽 수 · 기록 수 한도. 하나라도 어기면 일부만 돌려주지 않고 전체를 실패로 돌린다(fail closed, 'inconsistent').
 *  - 시간 초과 · 잠시 못 닿음은 같은 다음 쪽 표로 그 쪽만 몇 번 다시 묻는다(실패한 쪽의 일부는 쓰지 않음). 목록 v2 없음('unsupported') ·
 *    약속 밖 응답('unexpected')은 다시 묻지 않는다.
 *  - 보장하는 것: 목록을 모으는 동안(첫 쪽을 묻기 전 ~ 마지막 쪽을 받은 뒤) 내내 있던 객체는 정확히 한 번 나온다
 *    (저장소가 '이름 > 다음 쪽 표'를 이름 차례로 돌려준다는 목록 v2 의 약속을 믿는다 — 차례 · 겹침 · 멈춤은 여기서 다시 확인한다).
 *    그동안 새로 생기거나 지워진 객체는 나올 수도, 안 나올 수도 있다(이미 지나간 이름 앞에 생긴 것은 안 나오고, 뒤에 생긴 것은 나온다).
 *    한 순간을 통째로 찍은 사진(snapshot)은 아니다.
 *  - 기록은 바뀌지 않으므로(이름 = 번호) 이름 · eTag · 크기가 같으면 이미 읽은 본문을 다시 쓴다(cache).
 *  - 목록에 있었는데 읽을 때 없으면 잠시 뒤 한 번 더 읽고, 그래도 없으면 전체 실패('inconsistent' — 조용히 빠지지 않는다).
 *    본문 모양이 틀린 기록은 skippedOps 로 세어 화면 · API 에 보인다. 기록 이름이 아닌 객체는 foreignObjects 로 센다
 *    (빈 폴더 표시 '.emptyFolderPlaceholder' 만 빼고).
 * 여러 컴퓨터 · 여러 사람이 동시에 써도 서로 다른 객체라 잃는 쓰기가 없다. 같은 요청이 동시에 오면 하나만 만들어지고 모두 같은 기록을 확인한다.
 */

export type ListItem = { name: string; size: number | null; etag: string | null };
export type ReadResult = { ok: true; text: string } | { ok: false; reason: 'missing' | 'unavailable' | 'too_large' };

/** 목록 한 쪽의 실패 — unsupported: 저장소에 목록 v2 가 없음(운영 준비 조건) · unavailable: 잠시 못 닿음 · unexpected: 약속 밖 응답 */
export type ListFailure = 'unsupported' | 'unavailable' | 'unexpected';
export type ListPageResult = { ok: true; items: ListItem[]; nextCursor: string | null; hasNext: boolean } | { ok: false; reason: ListFailure };

export type EvidenceObjectStore = {
  /** 없을 때만 만든다. 이미 있으면 'exists'. 그 밖의 실패는 'error'(던져도 된다) */
  createOnly(key: string, body: string): Promise<'created' | 'exists' | 'error'>;
  read(key: string, maxBytes: number): Promise<ReadResult>;
  /**
   * OP_FOLDER 바로 아래 객체 이름(OP_FOLDER/ 뒤의 이름)을 글자 단위 오름차순으로, cursor 보다 큰 것부터 limit 개까지.
   * cursor 가 null 이면 처음부터. 다음 쪽이 있으면 hasNext true 와 다음에 넘길 nextCursor.
   */
  list(cursor: string | null, limit: number): Promise<ListPageResult>;
};

export type OpCache = Map<string, Op | null>;

export const LIST_PAGE = 1000;
export const MAX_LIST_PAGES = 60;
export const MAX_OPS = 20_000;
export const MAX_TOTAL_BYTES = 96 * 1024 * 1024;
const READ_CONCURRENCY = 8;
export const WRITE_TIMEOUT_MS = 12_000;
export const READ_TIMEOUT_MS = 10_000;
/** 한 쪽을 다시 묻는 횟수(시간 초과 · 잠시 못 닿음만) · 다시 묻기 전 쉬는 시간(번째마다 늘어남) */
export const LIST_RETRIES = 2;
export const LIST_BACKOFF_MS = 250;
/** 목록에 있던 기록이 읽을 때 없으면 한 번 더 읽기 전 쉬는 시간 */
export const MISSING_RECHECK_MS = 300;
/** Supabase 가 빈 폴더를 만들 때 두는 표시 — 다른 객체 수에 세지 않는다(이름이 정확히 같을 때만) */
export const PLACEHOLDER_NAME = '.emptyFolderPlaceholder';

export const opKey = (opId: string) => `${OP_FOLDER}/${opId}.json`;

/**
 * 모으기 실패 — unavailable: 잠시 못 닿음 · too_large: 한도 넘음 · unsupported: 목록 v2 없음(운영 준비 조건) ·
 * inconsistent: 목록 차례 · 다음 쪽 표가 약속과 다르거나 목록에 있던 기록이 없음 · unexpected: 약속 밖 응답(자리 밖 · 하위 폴더)
 */
export type LoadFailure = 'unavailable' | 'too_large' | 'unsupported' | 'inconsistent' | 'unexpected';
export type LoadResult = { ok: true; library: Library; ops: Op[] } | { ok: false; reason: LoadFailure };

/** 시험이 시간 · 다시 묻기를 줄이려고 넣는다(빼면 위 기본값) */
export type ReadOptions = {
  listTimeoutMs?: number;
  listRetries?: number;
  listBackoffMs?: number;
  readTimeoutMs?: number;
  missingRecheckMs?: number;
};

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<'timeout'>((res) => (timer = setTimeout(() => res('timeout'), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 한 쪽 묻기 — 시간 초과 · 잠시 못 닿음만 같은 다음 쪽 표로 몇 번 더 묻는다 */
async function listPage(store: EvidenceObjectStore, cursor: string | null, opts: ReadOptions): Promise<ListPageResult> {
  const retries = Math.max(0, opts.listRetries ?? LIST_RETRIES);
  const backoff = opts.listBackoffMs ?? LIST_BACKOFF_MS;
  const timeoutMs = opts.listTimeoutMs ?? READ_TIMEOUT_MS;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoff * attempt);
    let res: ListPageResult | 'timeout';
    try {
      res = await withTimeout(store.list(cursor, LIST_PAGE), timeoutMs);
    } catch {
      res = { ok: false, reason: 'unavailable' };
    }
    if (res === 'timeout') continue;
    if (res.ok) return res;
    if (res.reason !== 'unavailable') return res;
  }
  return { ok: false, reason: 'unavailable' };
}

/** 목록 전체를 이름 차례로 모은다(위 '읽기' 설명의 약속). 하나라도 어긋나면 전체 실패 */
export async function listAllOps(store: EvidenceObjectStore, opts: ReadOptions = {}): Promise<{ ok: true; items: ListItem[]; pages: number } | { ok: false; reason: LoadFailure }> {
  const items: ListItem[] = [];
  let cursor: string | null = null;
  let last: string | null = null;
  let pages = 0;
  for (;;) {
    if (pages >= MAX_LIST_PAGES) return { ok: false, reason: 'too_large' };
    const res = await listPage(store, cursor, opts);
    pages++;
    if (!res.ok) return res;
    for (const it of res.items) {
      if (typeof it.name !== 'string' || !it.name || it.name.includes('/')) return { ok: false, reason: 'unexpected' };
      /* 이름이 늘 커져야 한다 — 같은 이름(겹침) · 거꾸로 · 다음 쪽 표를 무시한 같은 쪽은 여기서 막힌다 */
      if (last !== null && !(it.name > last)) return { ok: false, reason: 'inconsistent' };
      last = it.name;
      items.push(it);
      if (items.length > MAX_OPS) return { ok: false, reason: 'too_large' };
    }
    if (!res.hasNext) break;
    if (!res.nextCursor || res.nextCursor === cursor) return { ok: false, reason: 'inconsistent' };
    cursor = res.nextCursor;
  }
  return { ok: true, items, pages };
}

export async function loadOps(
  store: EvidenceObjectStore,
  cache?: OpCache,
  opts: ReadOptions = {},
): Promise<{ ok: true; ops: Op[]; skipped: number; foreign: number } | { ok: false; reason: LoadFailure }> {
  const listed = await listAllOps(store, opts);
  if (!listed.ok) return listed;
  /* 기록 이름이 아닌 것은 읽지 않고 foreign 으로만 센다(빈 폴더 표시는 빼고). '모양이 틀린 기록'은 기록 이름인데 본문이 틀린 것만 */
  const items: ListItem[] = [];
  let foreign = 0;
  for (const it of listed.items) {
    if (OP_NAME.test(it.name)) items.push(it);
    else if (it.name !== PLACEHOLDER_NAME) foreign++;
  }
  let skipped = 0;
  let total = 0;
  for (const it of items) {
    if (it.size != null && it.size > MAX_OP_BYTES) return { ok: false, reason: 'too_large' };
    total += it.size ?? 0;
  }
  if (total > MAX_TOTAL_BYTES) return { ok: false, reason: 'too_large' };

  const readTimeout = opts.readTimeoutMs ?? READ_TIMEOUT_MS;
  const recheck = opts.missingRecheckMs ?? MISSING_RECHECK_MS;
  const readOnce = async (key: string): Promise<ReadResult | 'timeout'> => {
    try {
      return await withTimeout(store.read(key, MAX_OP_BYTES), readTimeout);
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  const ops: Op[] = [];
  let failed: LoadFailure | null = null;
  let next = 0;
  const worker = async () => {
    while (!failed && next < items.length) {
      const it = items[next++];
      const ck = `${it.name}|${it.etag ?? ''}|${it.size ?? ''}`;
      if (cache?.has(ck)) {
        const hit = cache.get(ck);
        if (hit) ops.push(hit);
        else skipped++;
        continue;
      }
      const key = `${OP_FOLDER}/${it.name}`;
      let r = await readOnce(key);
      /* 목록에 있던 기록이 없다 — 잠시 뒤 한 번 더. 그래도 없으면 조용히 빼지 않고 전체 실패 */
      if (r !== 'timeout' && !r.ok && r.reason === 'missing') {
        await sleep(recheck);
        r = await readOnce(key);
        if (r !== 'timeout' && !r.ok && r.reason === 'missing') {
          failed = 'inconsistent';
          return;
        }
      }
      if (r === 'timeout') {
        failed = 'unavailable';
        return;
      }
      if (!r.ok) {
        failed = r.reason === 'too_large' ? 'too_large' : 'unavailable';
        return;
      }
      const op = checkedOp(r.text, it.name.slice(0, -5));
      cache?.set(ck, op);
      if (op) ops.push(op);
      else skipped++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, items.length) }, worker));
  if (failed) return { ok: false, reason: failed };
  return { ok: true, ops, skipped, foreign };
}

/** 본문을 읽어 모양 · 번호 · 내용 지문을 확인한다(저장 이름과 번호가 다르거나 지문이 틀리면 뺀다) */
export function checkedOp(text: string, expectedOpId: string): Op | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const op = parseStoredOp(raw);
  if (!op || op.opId !== expectedOpId) return null;
  if (payloadHashOf(op.payload) !== op.payloadHash) return null;
  if (opIdOf(op.kind, op.actor.userId, op.requestKey) !== op.opId) return null;
  return op;
}

export async function loadLibrary(store: EvidenceObjectStore, cache?: OpCache, opts?: ReadOptions): Promise<LoadResult> {
  const r = await loadOps(store, cache, opts);
  if (!r.ok) return r;
  return { ok: true, ops: r.ops, library: materialize(r.ops, r.skipped, r.foreign) };
}

/* ───────── 쓰기 ───────── */

export type WriteInput =
  | { kind: 'register'; actor: Actor; requestKey: string | null; payload: RegisterPayload }
  | { kind: 'import'; actor: Actor; requestKey: string; payload: ImportPayload }
  | { kind: 'withdraw'; actor: Actor; requestKey: string | null; payload: WithdrawPayload };

export type Receipt = {
  opId: string;
  requestKey: string;
  kind: Op['kind'];
  receivedAt: string;
  replayed: boolean;
  /** 목록을 다시 모아 이 기록이 실제로 보였는가 */
  visible: boolean;
  /** 등록: 보인 출처 · 쓰임 번호. 가져오기: 보인 줄 수 */
  placements: { sourceId: string; useId: string }[];
  records: number;
  /**
   * R2(더하기만 — 옛 서버의 받음표에는 없다). 저장 뒤 다시 모은 목록에서 이 기록이 가리키는 쓰임의 상태:
   * 등록은 들어간 쓰임, 거두기는 대상 쓰임. 목록을 못 읽었거나 쓰임을 못 찾으면 'unknown'. 가져오기는 null.
   */
  useState: UseState | null;
  /** 등록: 그 줄이 목록에 세어졌는가 · 거두기: 지금 효과를 내는 거두기가 이것인가 · 가져오기: 모든 줄이 세어졌는가 — 늘 visible 과 같다 */
  applied: boolean;
  /**
   * 효과를 내지 못한 까닭(materialize.ts opOutcome). 거두기가 적용되지 않음: 다른 거두기가 효과를 냄 'withdraw' ·
   * 이 거두기 시각 이후(같은 시각 포함)의 등록으로 쓰임이 살아 있음 'register'. 등록인데 그 쓰임이 거둔 상태: 'withdraw'. 그 밖은 null.
   */
  supersededBy: SupersededBy | null;
};

export type WriteResult =
  | { status: 'saved'; receipt: Receipt }
  | { status: 'conflict' }
  | { status: 'pending'; reason: 'save' | 'readback' }
  | { status: 'too_large' };

/** 쓰기 번호 — 소문자 16진 32자(무작위 16바이트) */
export const newWriteId = () => randomBytes(16).toString('hex');

/** 시험이 쓰기 번호 · 시간을 넣는다(빼면 기본값) */
export type WriteOptions = ReadOptions & { newWriteId?: () => string; writeTimeoutMs?: number };

export async function writeOp(store: EvidenceObjectStore, input: WriteInput, now: Date, cache?: OpCache, opts: WriteOptions = {}): Promise<WriteResult> {
  const payloadHash = payloadHashOf(input.payload);
  const requestKey = input.requestKey ?? defaultRequestKey(input.kind, input.payload);
  const opId = opIdOf(input.kind, input.actor.userId, requestKey);
  const injected = opts.newWriteId?.();
  const writeId = injected && WRITE_ID.test(injected) ? injected : newWriteId();
  const op = {
    schema: SCHEMA_OP,
    opId,
    kind: input.kind,
    requestKey,
    payloadHash,
    actor: input.actor,
    receivedAt: now.toISOString(),
    writeId,
    payload: input.payload,
  } as Op;
  const body = JSON.stringify(op);
  if (new TextEncoder().encode(body).length > MAX_OP_BYTES) return { status: 'too_large' };

  let created: 'created' | 'exists' | 'error' | 'timeout';
  try {
    created = await withTimeout(store.createOnly(opKey(opId), body), opts.writeTimeoutMs ?? WRITE_TIMEOUT_MS);
  } catch {
    created = 'error';
  }

  /* 무엇이 돌아왔든 다시 읽어 확인한다 — 응답을 잃었어도, 늦게 저장됐어도 같은 판단 */
  const readTimeout = opts.readTimeoutMs ?? READ_TIMEOUT_MS;
  let stored: Op | null = null;
  let seen = false;
  for (let attempt = 0; attempt < 3 && !seen; attempt++) {
    let r: ReadResult | 'timeout';
    try {
      r = await withTimeout(store.read(opKey(opId), MAX_OP_BYTES), readTimeout);
    } catch {
      r = { ok: false, reason: 'unavailable' };
    }
    if (r !== 'timeout' && r.ok) {
      /* 아직 다 쓰이지 않은 본문(빈 글 · 끊긴 JSON)은 '못 봄'으로 — 충돌로 굳히지 않고 다시 읽는다 */
      if (!parsesAsJson(r.text)) {
        await sleep(150 * (attempt + 1));
        continue;
      }
      seen = true;
      stored = checkedOp(r.text, opId);
      break;
    }
    if (r !== 'timeout' && !r.ok && r.reason === 'missing' && created !== 'created') break;
    await sleep(150 * (attempt + 1));
  }
  if (!seen) return { status: 'pending', reason: created === 'created' ? 'readback' : 'save' };
  if (!stored || stored.kind !== input.kind || stored.actor.userId !== input.actor.userId || stored.payloadHash !== payloadHash) return { status: 'conflict' };

  /*
   * 새로 저장했나(받은 시각 비교 없음):
   *  - 저장소가 '이미 있음(exists)'이라고 분명히 답했으면 늘 앞서 저장된 같은 요청(200) — 쓰기 번호가 같아도(시험에서 같은 번호를 넣어도) 마찬가지.
   *  - 그 밖(만듦 · 오류 · 시간 초과)은 다시 읽은 본문의 쓰기 번호로 가른다. 내 번호면 내가 만든 것(만듦 · 응답을 잃음 · 늦게 저장됨),
   *    다른 번호 · 번호 없음(옛 기록)이면 앞서 저장된 같은 요청.
   */
  const replayed = created === 'exists' || !(stored.writeId && stored.writeId === writeId);
  const records = stored.kind === 'import' ? stored.payload.records.length : 1;
  let placements: Receipt['placements'] = [];
  let visible = false;
  /* 목록을 못 읽으면 쓰임 상태는 모름(가져오기는 쓰임이 여럿이라 늘 null) */
  let useState: Receipt['useState'] = stored.kind === 'import' ? null : 'unknown';
  let supersededBy: Receipt['supersededBy'] = null;
  const lib = await loadLibrary(store, cache, opts);
  if (lib.ok) {
    placements = locateOp(lib.library, opId);
    visible = (lib.library.citationsByOp[opId] ?? 0) === records && placements.length > 0;
    const outcome = opOutcome(lib.library, stored);
    if (outcome) {
      useState = outcome.useState;
      /* 효과를 내는 거두기에는 밀린 까닭이 없다(모으기 규칙상 늘 그렇지만 받음표끼리 어긋나지 않게 한 번 더) */
      supersededBy = stored.kind === 'withdraw' && visible ? null : outcome.supersededBy;
    }
  }
  return {
    status: 'saved',
    receipt: {
      opId,
      requestKey,
      kind: stored.kind,
      receivedAt: stored.receivedAt,
      replayed,
      visible,
      placements: stored.kind === 'import' ? [] : placements,
      records,
      useState,
      applied: visible,
      supersededBy,
    },
  };
}

function parsesAsJson(text: string): boolean {
  if (!text.trim()) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
