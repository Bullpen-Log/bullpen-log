/**
 * 검수 근거자료(EX-REF04) 셀프테스트 — 지어낸 값 · 메모리 가짜 저장소 · 임시 폴더만 쓴다(네트워크 · 진짜 버킷 · DB 없음).
 * node --import ./scripts/alias-register.mjs scripts/review-evidence-selftest.mts
 *
 * 핵심 모듈(lib/review-evidence/*)은 고치지 않고 시험만 한다. 실패한 시험은 그대로 두고 까닭을 적는다.
 */
import { deepStrictEqual } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chmod, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkEvidenceUrl, identifiersFromUrl, MAX_URL_LENGTH, type UrlRejection } from '../lib/review-evidence/url.ts';
import {
  MAX_IMPORT_RECORDS,
  MAX_OP_BYTES,
  MAX_REGISTER_BYTES,
  OP_FOLDER,
  SCHEMA_OP,
  parseImport,
  parseRegister,
  parseStoredOp,
  parseWithdraw,
  type Actor,
  type ImportPayload,
  type Op,
  type RegisterPayload,
  type WithdrawPayload,
} from '../lib/review-evidence/model.ts';
import { opIdOf, payloadHashOf } from '../lib/review-evidence/hash.ts';
import { findSource, locateOp, materialize, opOutcome, type Library } from '../lib/review-evidence/materialize.ts';
import {
  checkedOp,
  LIST_PAGE,
  listAllOps,
  loadLibrary,
  loadOps,
  MAX_LIST_PAGES,
  MAX_OPS,
  MAX_TOTAL_BYTES,
  opKey,
  writeOp,
  type EvidenceObjectStore,
  type ListItem,
  type ListPageResult,
  type LoadFailure,
  type OpCache,
  type ReadResult,
  type Receipt,
  type WriteResult,
} from '../lib/review-evidence/store.ts';
import { localEvidenceStore } from '../lib/review-evidence/local-store.ts';
import { handleImport, handleList, handleRegister, type ApiDeps, type ApiViewer } from '../lib/review-evidence/api.ts';
import { isListV2Unsupported, LIST_V2_PREFIX, listOpsPageV2, type ListV2Client, type ListV2Options } from '../lib/review-evidence/bucket-list.ts';
import { LIST_FAILURE_TEXT } from '../lib/review-evidence/http.ts';
import { REGISTER_WITHDRAWN_NOTE, WITHDRAW_TEXT, registerResultOf, withdrawOutcomeOf, withdrawStepOf } from '../lib/review-evidence/view.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ' — ' + detail : ''}`);
}
function section(t: string) {
  console.log(`\n[${t}]`);
}

/* ─────────────── 지어낸 값 ─────────────── */

const NOW = new Date('2026-11-17T03:00:00.000Z');
let clockMs = NOW.getTime();
const nextNow = () => new Date((clockMs += 1000));

const ACTOR_A: Actor = { userId: 'user_a', label: '관리자 가' };
const ACTOR_B: Actor = { userId: 'user_b', label: '관리자 나' };

const PUBMED = 'https://pubmed.ncbi.nlm.nih.gov/12345678/';
const PMC = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/';

type Raw = Record<string, unknown>;

function regRaw(over: { requestKey?: unknown; source?: Raw; use?: Raw; extra?: Raw } = {}): Raw {
  const out: Raw = {
    source: {
      url: PUBMED,
      kind: 'systematic-review',
      title: 'Fake title for a fake study',
      authors: ['Kim A', 'Lee B'],
      container: 'Journal of Fake Things',
      year: 2020,
      summaryKo: '가짜 연구를 짧게 요약했어요.',
      summaryBasis: 'abstract',
      ...(over.source ?? {}),
    },
    use: {
      domain: 'exercise',
      reviewId: 'rev-ex-01',
      itemId: 'item-1',
      itemName: '가짜 운동',
      purpose: 'prescription',
      consultedOn: '2026-11-10',
      applicationKo: '세트 수를 정할 때 참고했어요.',
      limitationsKo: '대상이 성인이에요.',
      reading: 'abstract',
      ...(over.use ?? {}),
    },
    ...(over.extra ?? {}),
  };
  if (over.requestKey !== undefined) out.requestKey = over.requestKey;
  return out;
}

function reg(over: Parameters<typeof regRaw>[0] = {}): RegisterPayload {
  const p = parseRegister(regRaw(over), NOW);
  if (!p.ok) throw new Error('지어낸 등록 본문이 검사에 걸렸어요: ' + JSON.stringify(p.issues));
  return p.value;
}

function impRecord(over: { source?: Raw; use?: Raw; historical?: Raw } = {}): Raw {
  return {
    source: { url: PUBMED, title: 'Fake title for a fake study', ...(over.source ?? {}) },
    use: { domain: 'mechanics', reviewId: 'rev-me-01', itemId: 'drill-1', purpose: 'mechanism', applicationKo: '동작 원리를 설명할 때 참고했어요.', ...(over.use ?? {}) },
    historical: { reviewer: 'yunho', origins: ['mechanics-record'], recordedAt: '2026-11-01T09:00:00.000Z', ...(over.historical ?? {}) },
  };
}

function impRaw(records: Raw[], over: Raw = {}): Raw {
  return {
    requestKey: 'imp-snap-0001-chunk-0',
    snapshot: { id: 'snap-0001', inputs: [{ name: 'mechanics-records', sha256: 'b'.repeat(64) }] },
    chunk: { index: 0, total: 1 },
    records,
    ...over,
  };
}

function imp(records: Raw[], over: Raw = {}): ImportPayload {
  const p = parseImport(impRaw(records, over), NOW);
  if (!p.ok) throw new Error('지어낸 가져오기 본문이 검사에 걸렸어요: ' + JSON.stringify(p.issues));
  return p.value;
}

function mkOp(kind: 'register', actor: Actor, requestKey: string, payload: RegisterPayload, receivedAt: string): Op;
function mkOp(kind: 'import', actor: Actor, requestKey: string, payload: ImportPayload, receivedAt: string): Op;
function mkOp(kind: 'withdraw', actor: Actor, requestKey: string, payload: WithdrawPayload, receivedAt: string): Op;
function mkOp(kind: Op['kind'], actor: Actor, requestKey: string, payload: RegisterPayload | ImportPayload | WithdrawPayload, receivedAt: string): Op {
  return { schema: SCHEMA_OP, opId: opIdOf(kind, actor.userId, requestKey), kind, requestKey, payloadHash: payloadHashOf(payload), actor, receivedAt, payload } as Op;
}

function wd(useId: string, over: Raw = {}): WithdrawPayload {
  const p = parseWithdraw({ withdraw: { useId, reasonKo: '잘못 등록해서 거둬요.', ...over } }, NOW);
  if (!p.ok) throw new Error('지어낸 거두기 본문이 검사에 걸렸어요: ' + JSON.stringify(p.issues));
  return p.value;
}

const issueFields = (p: { ok: boolean; issues?: { field: string }[] }) => (p.ok ? [] : (p.issues ?? []).map((i) => i.field));

/* ─────────────── 메모리 가짜 저장소 ─────────────── */

type Stored = { body: string; etag: string; seq: number };
const tick = () => new Promise<void>((r) => setImmediate(r));

class FakeStore implements EvidenceObjectStore {
  objects = new Map<string, Stored>();
  seq = 0;
  calls = { create: 0, read: 0, list: 0 };
  readKeys: string[] = [];
  /** 서버가 한 쪽에 돌려주는 최대 개수(요청한 limit 와 상관없이) */
  pageCap = Infinity;
  /** 남은 횟수만큼: 저장은 했는데 응답을 잃음(던짐) */
  createThrowAfterSave = 0;
  /** 남은 횟수만큼: 저장하지 않고 'error' */
  createErrorNoSave = 0;
  readFail: ((key: string) => 'unavailable' | 'too_large' | null) | null = null;
  /** 이 열쇠를 읽으면 끝내 답하지 않음(저장소가 멈춘 흉내 — 읽는 쪽 기다림 한도를 시험한다) */
  readHang = new Set<string>();
  /** 남은 횟수만큼: 목록에는 있는데 읽으면 '없음'(열쇠마다 · Infinity 면 늘) */
  readMissing = new Map<string, number>();
  listFail = false;
  /** list 가 불릴 때(몇 번째인지 · 받은 다음 쪽 표) — 쪽 사이에 새 기록을 붙이는 데 쓴다 */
  onList: ((call: number, cursor: string | null) => void) | null = null;
  /** 남은 횟수만큼: 만들기를 늦춤 — saveAfterMs 뒤에 저장, answerAfterMs 뒤에 'created' 응답 */
  createLate: { saveAfterMs: number; answerAfterMs: number }[] = [];
  sizeOverride = new Map<string, number>();
  /** 열쇠마다 먼저 돌려줄 본문(아직 다 쓰이지 않은 본문 흉내) — 다 쓰면 진짜 본문 */
  readScript = new Map<string, string[]>();

  put(key: string, body: string) {
    this.objects.set(key, { body, etag: `e${this.seq}`, seq: this.seq++ });
  }
  bumpEtag(key: string) {
    const o = this.objects.get(key);
    if (o) o.etag = o.etag + 'x';
  }
  async createOnly(key: string, body: string): Promise<'created' | 'exists' | 'error'> {
    this.calls.create++;
    await tick();
    const late = this.createLate.shift();
    if (late) {
      /* 늦은 저장 — 저장은 saveAfterMs 뒤, 응답은 answerAfterMs 뒤(쓰는 쪽이 그사이 시간 초과로 다시 읽을 수 있다) */
      await new Promise((r) => setTimeout(r, late.saveAfterMs));
      const had = this.objects.has(key);
      if (!had) this.put(key, body);
      await new Promise((r) => setTimeout(r, Math.max(0, late.answerAfterMs - late.saveAfterMs)));
      return had ? 'exists' : 'created';
    }
    if (this.createErrorNoSave > 0) {
      this.createErrorNoSave--;
      return 'error';
    }
    if (this.objects.has(key)) return 'exists';
    this.put(key, body);
    if (this.createThrowAfterSave > 0) {
      this.createThrowAfterSave--;
      throw new Error('응답을 잃음(지어낸 오류)');
    }
    return 'created';
  }
  async read(key: string, maxBytes: number): Promise<ReadResult> {
    this.calls.read++;
    this.readKeys.push(key);
    if (this.readHang.has(key)) return new Promise<ReadResult>(() => {});
    await tick();
    const f = this.readFail?.(key);
    if (f) return { ok: false, reason: f };
    const miss = this.readMissing.get(key) ?? 0;
    if (miss > 0) {
      this.readMissing.set(key, miss - 1);
      return { ok: false, reason: 'missing' };
    }
    const scripted = this.readScript.get(key);
    if (scripted?.length && this.objects.has(key)) return { ok: true, text: scripted.shift()! };
    const o = this.objects.get(key);
    if (!o) return { ok: false, reason: 'missing' };
    if (Buffer.byteLength(o.body, 'utf8') > maxBytes) return { ok: false, reason: 'too_large' };
    return { ok: true, text: o.body };
  }
  /** 저장소 목록 약속(store.ts EvidenceObjectStore.list) 그대로 — 이름 차례 · 다음 쪽 표 뒤부터 · 하위 폴더 안은 세지 않음 */
  async list(cursor: string | null, limit: number): Promise<ListPageResult> {
    const call = ++this.calls.list;
    await tick();
    this.onList?.(call, cursor);
    if (this.listFail) return { ok: false, reason: 'unavailable' };
    const prefix = OP_FOLDER + '/';
    const rows = [...this.objects.entries()]
      .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map(([k, o]) => ({ k, o, name: k.slice(prefix.length) }))
      .filter((r) => cursor === null || r.name > cursor)
      .sort((a, b) => cmpName(a.name, b.name));
    const take = Math.min(limit, this.pageCap);
    const page = rows.slice(0, take);
    const hasNext = rows.length > take;
    return {
      ok: true,
      items: page.map(({ k, o, name }) => ({ name, size: this.sizeOverride.get(k) ?? Buffer.byteLength(o.body, 'utf8'), etag: o.etag })),
      nextCursor: hasNext ? page[page.length - 1].name : null,
      hasNext,
    };
  }
}

/** 글자 단위(코드 단위) 차례 — 저장소 목록 v2 의 이름 차례와 같은 뜻 */
const cmpName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function seedOp(store: FakeStore, op: Op) {
  store.put(opKey(op.opId), JSON.stringify(op));
}

/* ─────────────── 목록 v2 가짜 Supabase 클라이언트(R2) ─────────────── */

/** 시험에서 다시 묻기 · 다시 읽기 쉬는 시간을 줄인다(약속은 그대로) */
const FAST = { listBackoffMs: 5, missingRecheckMs: 5 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const V2_CREATED_AT = '2026-11-17T00:00:00.000Z';
/** 기록 이름 모양(64자 16진 + .json)의 결정적 이름 */
const hexName = (i: number) => createHash('sha256').update(`v2-obj-${i}`).digest('hex') + '.json';
/** 서버가 주는 다음 쪽 표 — 속을 모르는 글이어야 한다(여기서는 base64) */
const encodeCursor = (name: string) => Buffer.from('c:' + name, 'utf8').toString('base64');
const decodeCursor = (c: string): string | null => {
  const t = Buffer.from(c, 'base64').toString('utf8');
  return t.startsWith('c:') ? t.slice(2) : null;
};
const strictlyIncreasing = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x);

type V2Response = { data: unknown; error: unknown };
type V2Call = { cursor: string | null; hasCursorKey: boolean; limit: number };

/**
 * Supabase 목록 v2 흉내 — 이름 오름차순 keyset(이름 > 다음 쪽 표), 서버 한 쪽 상한(cap), 만든 시각은 모두 같다.
 * nameMode: full = name 에 전체 경로 · key = name 짧게 + key 전체 경로 · relative = name 짧게(key 없음).
 */
class FakeListV2Client implements ListV2Client {
  names = new Set<string>();
  cap = 1000;
  nameMode: 'full' | 'key' | 'relative' = 'full';
  calls: V2Call[] = [];
  badRequests: string[] = [];
  /** 옛 목록(v1) — 새 코드는 부르면 안 된다 */
  v1Calls = 0;
  onCall: ((n: number, cursorName: string | null) => void) | null = null;
  override: ((n: number, options: ListV2Options, signal: AbortSignal | undefined) => Promise<V2Response> | null) | null = null;

  async list(): Promise<V2Response> {
    this.v1Calls++;
    return { data: [], error: null };
  }
  async listV2(options: ListV2Options, parameters?: { signal?: AbortSignal }): Promise<V2Response> {
    const n = this.calls.push({ cursor: options.cursor ?? null, hasCursorKey: Object.prototype.hasOwnProperty.call(options, 'cursor'), limit: options.limit });
    await tick();
    if (options.prefix !== LIST_V2_PREFIX || options.with_delimiter !== false || options.sortBy?.column !== 'name' || options.sortBy?.order !== 'asc') {
      this.badRequests.push(JSON.stringify(options));
      return { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '400', message: 'bad request' } };
    }
    const cursorName = options.cursor === undefined ? null : decodeCursor(options.cursor);
    if (options.cursor !== undefined && cursorName === null) return { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '400', message: 'bad cursor' } };
    this.onCall?.(n, cursorName);
    const o = this.override?.(n, options, parameters?.signal);
    if (o) return o;
    const sorted = [...this.names].sort(cmpName);
    const after = cursorName === null ? sorted : sorted.filter((x) => x > cursorName);
    const take = Math.min(options.limit, this.cap);
    const page = after.slice(0, take);
    const hasNext = after.length > take;
    return { data: { hasNext, folders: [], objects: page.map((x) => this.obj(x)), ...(hasNext ? { nextCursor: encodeCursor(page[page.length - 1]) } : {}) }, error: null };
  }
  obj(name: string): Record<string, unknown> {
    const base = {
      id: 'id-' + name.slice(0, 12),
      created_at: V2_CREATED_AT,
      updated_at: V2_CREATED_AT,
      last_accessed_at: V2_CREATED_AT,
      metadata: { size: 100 + (name.length % 7), eTag: `"e-${name.slice(0, 8)}"`, mimetype: 'application/json' },
    };
    if (this.nameMode === 'full') return { ...base, name: LIST_V2_PREFIX + name };
    if (this.nameMode === 'key') return { ...base, name, key: LIST_V2_PREFIX + name };
    return { ...base, name };
  }
}

/** 목록 v2 클라이언트로 목록만 하는 저장소(쓰기 · 읽기는 시험에 쓰지 않음) */
const v2Store = (client: ListV2Client, timeoutMs = 2000): EvidenceObjectStore => ({
  async createOnly() {
    return 'error';
  },
  async read() {
    return { ok: false, reason: 'unavailable' };
  },
  list: (cursor, limit) => listOpsPageV2(client, cursor, limit, timeoutMs),
});

const namesOf = (r: Awaited<ReturnType<typeof listAllOps>>) => (r.ok ? r.items.map((i) => i.name) : []);
const reasonOf = (r: { ok: boolean; reason?: unknown }) => (r.ok ? 'ok' : String(r.reason));

const allUses = (lib: Library) => lib.sources.flatMap((s) => s.uses);

/* ═══════════════ 1. 링크 검사 ═══════════════ */

section('링크 검사 · 정규화 · 번호');
{
  const NUL = String.fromCharCode(0);
  const ZWSP = String.fromCharCode(0x200b);
  const table: [string, unknown, UrlRejection | 'ok'][] = [
    ['https 공식 PubMed', PUBMED, 'ok'],
    ['http 거절', 'http://pubmed.ncbi.nlm.nih.gov/1/', 'not_https'],
    ['ftp 거절', 'ftp://journal-site.org/a', 'not_https'],
    ['빈 글', '', 'not_string'],
    ['숫자', 123, 'not_string'],
    ['모양 틀림', 'not a url', 'unparsable'],
    ['계정 user:pass@', 'https://user:pw@journal-site.org/a', 'credentials'],
    ['빈 계정 https://@host', 'https://@journal-site.org/a', 'credentials'],
    ['계정 이름만', 'https://user@journal-site.org/a', 'credentials'],
    ['포트 8443', 'https://journal-site.org:8443/a', 'port'],
    ['기본 포트 443 은 받음', 'https://journal-site.org:443/a', 'ok'],
    ['IPv4', 'https://1.2.3.4/a', 'ip_host'],
    ['IPv6', 'https://[::1]/a', 'ip_host'],
    ['IPv6 긴 꼴', 'https://[2001:db8::1]/a', 'ip_host'],
    ['10진 IP', 'https://2130706433/a', 'ip_host'],
    ['16진 IP', 'https://0x7f.0.0.1/a', 'ip_host'],
    ['짧은 16진 IP', 'https://0x7f.1/a', 'ip_host'],
    ['localhost', 'https://localhost/a', 'internal_host'],
    ['.local', 'https://printer.local/a', 'internal_host'],
    ['.internal', 'https://svc.internal/a', 'internal_host'],
    ['example.com', 'https://example.com/a', 'internal_host'],
    ['www.example.com', 'https://www.example.com/a', 'internal_host'],
    ['우리 서비스 주소', 'https://bullpen-log.vercel.app/a', 'internal_host'],
    ['한 마디 이름', 'https://journal/a', 'bad_host'],
    ['supabase 서명 주소', 'https://abcd.supabase.co/storage/v1/object/sign/pitch-videos/x.mp4?token=abc', 'private_file_host'],
    ['supabase 공개 주소', 'https://abcd.supabase.co/storage/v1/object/public/x.json', 'private_file_host'],
    ['구글 드라이브', 'https://drive.google.com/file/d/abc/view', 'private_file_host'],
    ['구글 문서', 'https://docs.google.com/document/d/abc/edit', 'private_file_host'],
    ['드롭박스', 'https://www.dropbox.com/s/abc/x.pdf', 'private_file_host'],
    ['S3', 'https://bucket.s3.amazonaws.com/x.pdf', 'private_file_host'],
    ['token 쿼리', 'https://journal-site.org/a?token=abc', 'secret_query'],
    ['key 쿼리', 'https://journal-site.org/a?key=abc', 'secret_query'],
    ['sig 쿼리', 'https://journal-site.org/a?sig=abc', 'secret_query'],
    ['X-Amz-Signature 쿼리', 'https://journal-site.org/a?X-Amz-Signature=abc', 'secret_query'],
    ['access_token 쿼리', 'https://journal-site.org/a?access_token=abc', 'secret_query'],
    /* SEC-1: 비밀 이름 변형 · 주소 길 안의 세션 */
    ['auth_token 쿼리', 'https://journal-site.org/a?auth_token=abc', 'secret_query'],
    ['access-token 쿼리', 'https://journal-site.org/a?access-token=abc', 'secret_query'],
    ['sessionToken 쿼리', 'https://journal-site.org/a?sessionToken=abc', 'secret_query'],
    ['private_token 쿼리', 'https://journal-site.org/a?private_token=abc', 'secret_query'],
    ['accessKey 쿼리', 'https://journal-site.org/a?accessKey=abc', 'secret_query'],
    ['X-Auth-Token 쿼리', 'https://journal-site.org/a?X-Auth-Token=abc', 'secret_query'],
    ['X-Api-Key 쿼리', 'https://journal-site.org/a?X-Api-Key=abc', 'secret_query'],
    ['api_key 쿼리', 'https://journal-site.org/a?api_key=abc', 'secret_query'],
    ['code 쿼리(이름 전체)', 'https://journal-site.org/a?code=abc', 'secret_query'],
    ['state 쿼리(이름 전체)', 'https://journal-site.org/a?state=abc', 'secret_query'],
    [';jsessionid= 주소 길', 'https://journal.example-pub.com/article;jsessionid=ABCDEF0123456789', 'secret_query'],
    ['country_code 쿼리는 받음', 'https://journal-site.org/a?country_code=kr', 'ok'],
    ['keyword 쿼리는 받음', 'https://journal-site.org/a?keyword=pitching', 'ok'],
    ['us_state 쿼리는 받음', 'https://journal-site.org/a?us_state=ca', 'ok'],
    ['# 뒤 = ', 'https://journal-site.org/a#x=1', 'bad_fragment'],
    ['# 뒤 &', 'https://journal-site.org/a#a&b', 'bad_fragment'],
    ['# 뒤 이름은 받음', 'https://journal-site.org/a#section-2', 'ok'],
    ['NUL 글자', `https://journal-site.org/a${NUL}b`, 'control_chars'],
    ['보이지 않는 띄어쓰기', `https://journal-site.org/a${ZWSP}b`, 'control_chars'],
    ['너무 긺', 'https://journal-site.org/' + 'a'.repeat(MAX_URL_LENGTH), 'too_long'],
  ];
  for (const [name, input, want] of table) {
    const r = checkEvidenceUrl(input);
    const got = r.ok ? 'ok' : r.reason;
    check(`링크: ${name} → ${want}`, got === want, got !== want ? `실제 ${got}` : '');
  }

  const t = checkEvidenceUrl('https://journal-site.org/a?utm_source=x&b=2&fbclid=z&gclid=q#frag');
  check('추적 값 · # 를 뺀 보여 줄 링크', t.ok && t.href === 'https://journal-site.org/a?b=2', t.ok ? t.href : '');
  const n1 = checkEvidenceUrl('https://journal-site.org/a/?b=2&a=1');
  const n2 = checkEvidenceUrl('https://Journal-Site.org/a?a=1&b=2&utm_medium=y');
  check('정규화: 끝 / · 쿼리 차례 · 대문자 이름 · 추적 값이 달라도 같음', n1.ok && n2.ok && n1.normalized === n2.normalized, n1.ok && n2.ok ? `${n1.normalized} | ${n2.normalized}` : '');
  const n3 = checkEvidenceUrl('https://journal-site.org/a?a=2');
  check('정규화: 쿼리 값이 다르면 다름', n1.ok && n3.ok && n1.normalized !== n3.normalized);

  const ids = (u: string) => {
    const c = checkEvidenceUrl(u);
    return c.ok ? identifiersFromUrl(c) : null;
  };
  const idTable: [string, string, Record<string, string>][] = [
    ['pubmed 새 주소', 'https://pubmed.ncbi.nlm.nih.gov/12345678/', { pmid: '12345678' }],
    ['pubmed 옛 주소', 'https://www.ncbi.nlm.nih.gov/pubmed/12345678', { pmid: '12345678' }],
    ['PMC 새 주소', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/', { pmcid: 'PMC7654321' }],
    ['PMC 옛 주소 소문자', 'https://www.ncbi.nlm.nih.gov/pmc/articles/pmc7654321/', { pmcid: 'PMC7654321' }],
    ['Europe PMC', 'https://europepmc.org/article/PMC/PMC7654321', { pmcid: 'PMC7654321' }],
    ['doi.org 대문자 → 소문자', 'https://doi.org/10.1080/ABC.2020.12', { doi: '10.1080/abc.2020.12' }],
    ['dx.doi.org', 'https://dx.doi.org/10.1080/abc.2020.12', { doi: '10.1080/abc.2020.12' }],
    ['doi.org 인코딩한 / (%2F)', 'https://doi.org/10.1080%2Fabc', { doi: '10.1080/abc' }],
    ['출판사 주소 안 10.xxxx 는 추측 안 함', 'https://journal-site.org/doi/10.1080/abc', {}],
    ['pubmed 뒤에 더 붙은 주소는 번호 없음', 'https://pubmed.ncbi.nlm.nih.gov/12345678/similar', {}],
  ];
  for (const [name, u, want] of idTable) {
    const got = ids(u);
    let same = false;
    try {
      deepStrictEqual(got, want);
      same = true;
    } catch {
      same = false;
    }
    check(`번호: ${name}`, same, same ? '' : JSON.stringify(got));
  }
}

/* ═══════════════ 2. 등록 · 가져오기 본문 검사 ═══════════════ */

section('등록 본문 검사(parseRegister)');
{
  const ok = parseRegister(regRaw({ requestKey: 'req-test-0001' }), NOW);
  check('정상 본문 통과 · 요청 번호 그대로', ok.ok && ok.requestKey === 'req-test-0001');
  check('정상 본문: 링크는 정리된 href', ok.ok && ok.value.source.url === PUBMED);
  check('requestKey 없어도 통과(null)', (() => {
    const p = parseRegister(regRaw(), NOW);
    return p.ok && p.requestKey === null;
  })());

  const fails = (name: string, raw: Raw, field?: string) => {
    const p = parseRegister(raw, NOW);
    const fields = issueFields(p);
    check(`거절: ${name}`, !p.ok && (!field || fields.includes(field)), !p.ok ? fields.join(', ') : '통과해 버림');
  };
  fails('본문이 묶음이 아님', 'x' as unknown as Raw);
  fails('출처 링크 없음', regRaw({ source: { url: undefined } }), 'source.url');
  fails('검수 번호 없음', regRaw({ use: { reviewId: undefined } }), 'use.reviewId');
  fails('분야 없음', regRaw({ use: { domain: undefined } }), 'use.domain');
  fails('쓴 곳 없음', regRaw({ use: { purpose: undefined } }), 'use.purpose');
  fails('적용 내용 없음(등록은 필수)', regRaw({ use: { applicationKo: null } }), 'use.applicationKo');
  fails('적용 내용이 한국어가 아님', regRaw({ use: { applicationKo: 'used for sets only' } }), 'use.applicationKo');
  fails('요약이 한국어가 아님', regRaw({ source: { summaryKo: 'a short summary' } }), 'source.summaryKo');
  fails('한계가 한국어가 아님', regRaw({ use: { limitationsKo: 'adults only' } }), 'use.limitationsKo');
  fails('내부 경로 /Users/', regRaw({ use: { applicationKo: '기록은 /Users/x/notes 에 있어요.' } }), 'use.applicationKo');
  fails('내부 경로 docs/reviews', regRaw({ use: { applicationKo: 'docs/reviews/abc 를 참고했어요.' } }), 'use.applicationKo');
  fails('.json 파일 이름', regRaw({ use: { limitationsKo: '자세한 건 data.json 에 있어요.' } }), 'use.limitationsKo');
  fails('JWT 꼴 비밀 값', regRaw({ source: { summaryKo: '토큰 eyJhbGciOiJIUzI1NiIsInR5cCI6 이에요.' } }), 'source.summaryKo');
  fails('제목에 내부 경로', regRaw({ source: { title: 'see /Users/x/file' } }), 'source.title');
  fails('한국어 글 안의 링크', regRaw({ use: { applicationKo: '원문 https://journal-site.org/a 를 참고했어요.' } }), 'use.applicationKo');
  fails('미래 확인일', regRaw({ use: { consultedOn: '2026-12-31' } }), 'use.consultedOn');
  fails('이틀 뒤 확인일', regRaw({ use: { consultedOn: '2026-11-19' } }), 'use.consultedOn');
  check('하루 뒤 확인일은 시간대 여유로 받음', parseRegister(regRaw({ use: { consultedOn: '2026-11-18' } }), NOW).ok);
  fails('없는 날짜 2월 30일', regRaw({ use: { consultedOn: '2026-02-30' } }), 'use.consultedOn');
  fails('날짜 모양 틀림', regRaw({ use: { consultedOn: '2026/11/10' } }), 'use.consultedOn');
  fails('모르는 칸(맨 위)', regRaw({ extra: { foo: 1 } }), '.foo');
  fails('모르는 칸(출처)', regRaw({ source: { extra: 1 } }), 'source.extra');
  fails('모르는 칸(쓰임)', regRaw({ use: { extra: 1 } }), 'use.extra');
  fails('모르는 칸(번호)', regRaw({ source: { identifiers: { isbn: '123' } } }), 'source.identifiers.isbn');
  fails('공식 확인 없는 다른 링크', regRaw({ source: { altUrls: [PMC] } }), 'source.altUrls');
  check('공식 확인이 있으면 다른 링크 받음', (() => {
    const p = parseRegister(regRaw({ source: { altUrls: [PMC], verifiedBy: 'ncbi' } }), NOW);
    return p.ok && p.value.source.altUrls.length === 1;
  })());
  fails('요약 근거 없는 요약', regRaw({ source: { summaryBasis: undefined } }), 'source.summaryBasis');
  fails('요청 번호 모양 틀림', regRaw({ requestKey: 'short' }), 'requestKey');
  fails('출처 링크가 IP', regRaw({ source: { url: 'https://1.2.3.4/a' } }), 'source.url');
  fails('PMID 모양 틀림', regRaw({ source: { identifiers: { pmid: 'abc' } } }), 'source.identifiers.pmid');
  check('읽은 범위를 안 주면 unknown', (() => {
    const p = parseRegister(regRaw({ use: { reading: undefined } }), NOW);
    return p.ok && p.value.use.reading === 'unknown';
  })());
  check('확인일을 안 주면 null(가져온 시각으로 채우지 않음)', (() => {
    const p = parseRegister(regRaw({ use: { consultedOn: undefined } }), NOW);
    return p.ok && p.value.use.consultedOn === null;
  })());
}

section('가져오기 본문 검사(parseImport)');
{
  const ok = parseImport(impRaw([impRecord()]), NOW);
  check('정상 가져오기 통과', ok.ok && ok.requestKey === 'imp-snap-0001-chunk-0');
  const noKey = parseImport(impRaw([impRecord()], { requestKey: undefined }), NOW);
  check('요청 번호 없으면 거절', !noKey.ok && issueFields(noKey).includes('requestKey'));
  const empty = parseImport(impRaw([]), NOW);
  check('기록 0개 거절', !empty.ok && issueFields(empty).includes('records'));
  const many = parseImport(impRaw(Array.from({ length: MAX_IMPORT_RECORDS + 1 }, (_, i) => impRecord({ use: { itemId: `drill-${i}` } }))), NOW);
  check(`기록 ${MAX_IMPORT_RECORDS + 1}개 거절`, !many.ok && issueFields(many).includes('records'));
  const max = parseImport(impRaw(Array.from({ length: MAX_IMPORT_RECORDS }, (_, i) => impRecord({ use: { itemId: `drill-${i}` } }))), NOW);
  check(`기록 ${MAX_IMPORT_RECORDS}개는 받음`, max.ok && max.value.records.length === MAX_IMPORT_RECORDS);
  const noHist = parseImport(impRaw([{ source: impRecord().source, use: impRecord().use }]), NOW);
  check('과거 기록 표시 없으면 거절', !noHist.ok && issueFields(noHist).includes('records[0].historical'));
  const nullApp = parseImport(impRaw([impRecord({ use: { applicationKo: null } })]), NOW);
  check('가져오기는 적용 내용 null 허용', nullApp.ok && nullApp.value.records[0].use.applicationKo === null);
  const badChunk = parseImport(impRaw([impRecord()], { chunk: { index: 1, total: 1 } }), NOW);
  check('묶음 번호 넘침 거절', !badChunk.ok && issueFields(badChunk).includes('chunk'));
  const badSnap = parseImport(impRaw([impRecord()], { snapshot: { id: 'x', inputs: [] } }), NOW);
  check('가져오기 기준 모양 틀림 거절', !badSnap.ok && issueFields(badSnap).includes('snapshot'));
  const badReviewer = parseImport(impRaw([impRecord({ historical: { reviewer: 'someone' } })]), NOW);
  check('모르는 과거 검수자 거절', !badReviewer.ok);
}

section('쓴 사람 쪽 시각(notedAt) · 거두기 본문 검사');
{
  const okNoted = parseRegister(regRaw({ use: { notedAt: '2026-11-17T12:00:00+09:00' } }), NOW);
  check('notedAt 받음 · ISO(UTC)로 정리', okNoted.ok && okNoted.value.use.notedAt === '2026-11-17T03:00:00.000Z', okNoted.ok ? String(okNoted.value.use.notedAt) : issueFields(okNoted).join(','));
  const noNoted = parseRegister(regRaw(), NOW);
  check('notedAt 을 안 주면 null', noNoted.ok && noNoted.value.use.notedAt === null);
  const in23h = parseRegister(regRaw({ use: { notedAt: '2026-11-18T02:00:00.000Z' } }), NOW);
  check('notedAt 23시간 뒤는 시계 차이 여유로 받음', in23h.ok);
  const in25h = parseRegister(regRaw({ use: { notedAt: '2026-11-18T04:00:00.000Z' } }), NOW);
  check('notedAt 하루 넘게 앞섬 → 거절', !in25h.ok && issueFields(in25h).includes('use.notedAt'), issueFields(in25h).join(','));
  const before2020 = parseRegister(regRaw({ use: { notedAt: '2019-12-31T23:00:00.000Z' } }), NOW);
  check('notedAt 2020년 앞 → 거절', !before2020.ok && issueFields(before2020).includes('use.notedAt'));
  const badNoted = parseRegister(regRaw({ use: { notedAt: '어제 저녁' } }), NOW);
  check('notedAt 모양 틀림 → 거절', !badNoted.ok && issueFields(badNoted).includes('use.notedAt'));
  const dateOnly = parseRegister(regRaw({ use: { notedAt: '2026-11-17' } }), NOW);
  check('notedAt 날짜만(시각 없음) → 거절', !dateOnly.ok && issueFields(dateOnly).includes('use.notedAt'));
  const impNoted = parseImport(impRaw([impRecord({ use: { notedAt: '2026-11-10T00:00:00.000Z' } })]), NOW);
  check('과거 가져오기는 notedAt 을 받아도 null 로 둠', impNoted.ok && impNoted.value.records[0].use.notedAt === null, impNoted.ok ? String(impNoted.value.records[0].use.notedAt) : issueFields(impNoted).join(','));

  const USE_X = 'use_' + 'a'.repeat(24);
  const w = parseWithdraw({ requestKey: 'req-wd-000001', withdraw: { useId: USE_X, reasonKo: '잘못 등록했어요.' } }, NOW);
  check('거두기 정상 본문 통과 · 요청 번호 그대로', w.ok && w.requestKey === 'req-wd-000001' && w.value.useId === USE_X && w.value.notedAt === null);
  const wBadId = parseWithdraw({ withdraw: { useId: 'use_xyz', reasonKo: '잘못 등록했어요.' } }, NOW);
  check('거두기: 쓰임 번호 모양 틀림 → 거절', !wBadId.ok && issueFields(wBadId).includes('withdraw.useId'));
  const wNoReason = parseWithdraw({ withdraw: { useId: USE_X } }, NOW);
  check('거두기: 까닭 없음 → 거절', !wNoReason.ok && issueFields(wNoReason).includes('withdraw.reasonKo'));
  const wEn = parseWithdraw({ withdraw: { useId: USE_X, reasonKo: 'wrong source' } }, NOW);
  check('거두기: 까닭이 한국어가 아님 → 거절', !wEn.ok && issueFields(wEn).includes('withdraw.reasonKo'));
  const wFuture = parseWithdraw({ withdraw: { useId: USE_X, reasonKo: '잘못 등록했어요.', notedAt: '2026-11-19T03:00:00.000Z' } }, NOW);
  check('거두기: notedAt 하루 넘게 앞섬 → 거절', !wFuture.ok && issueFields(wFuture).includes('withdraw.notedAt'));
  const wExtra = parseWithdraw({ withdraw: { useId: USE_X, reasonKo: '잘못 등록했어요.', foo: 1 } }, NOW);
  check('거두기: 모르는 칸 → 거절', !wExtra.ok && issueFields(wExtra).includes('withdraw.foo'));
  const wMissing = parseWithdraw({ requestKey: 'req-wd-000002' }, NOW);
  check('거두기: withdraw 묶음 없음 → 거절', !wMissing.ok && issueFields(wMissing).includes('withdraw'));
}

/* ═══════════════ 3. 쓰기(writeOp) ═══════════════ */

section('쓰기 · 다시 보내기 · 충돌 · 잃은 응답');
{
  const store = new FakeStore();
  const payload = reg();
  const first = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-write-0001', payload }, nextNow());
  check('첫 쓰기: saved', first.status === 'saved');
  const r1 = first.status === 'saved' ? first.receipt : null;
  check('첫 쓰기: replayed false · visible true · placements 1', !!r1 && !r1.replayed && r1.visible && r1.placements.length === 1, JSON.stringify(r1 && { replayed: r1.replayed, visible: r1.visible, n: r1.placements.length }));
  check('첫 쓰기: 저장 객체 1개', store.objects.size === 1);
  check('저장 이름 = review-evidence/v1/ops/<opId>.json', !!r1 && store.objects.has(`${OP_FOLDER}/${r1.opId}.json`));

  const again = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-write-0001', payload }, nextNow());
  check('같은 요청 다시 보냄: saved · replayed true · 같은 opId', again.status === 'saved' && again.receipt.replayed && again.receipt.opId === r1?.opId);
  check('같은 요청 다시 보냄: 객체는 여전히 1개', store.objects.size === 1);
  check('다시 보낸 받음표의 받은 시각 = 처음 시각', again.status === 'saved' && again.receipt.receivedAt === r1?.receivedAt);

  const before = store.objects.get(`${OP_FOLDER}/${r1?.opId}.json`)?.body;
  const other = reg({ use: { applicationKo: '휴식 시간을 정할 때 참고했어요.' } });
  const conflict = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-write-0001', payload: other }, nextNow());
  check('같은 요청 번호 · 다른 내용 → conflict', conflict.status === 'conflict', conflict.status);
  check('충돌 뒤 원래 객체 그대로', store.objects.get(`${OP_FOLDER}/${r1?.opId}.json`)?.body === before && store.objects.size === 1);

  const otherActor = await writeOp(store, { kind: 'register', actor: ACTOR_B, requestKey: 'req-write-0001', payload: other }, nextNow());
  check('다른 계정은 같은 요청 번호라도 따로 저장', otherActor.status === 'saved' && !otherActor.receipt.replayed && store.objects.size === 2);

  const noKey1 = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: null, payload: reg({ use: { itemId: 'item-nokey' } }) }, nextNow());
  const noKey2 = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: null, payload: reg({ use: { itemId: 'item-nokey' } }) }, nextNow());
  check('요청 번호 없이 같은 내용 두 번 → 내용 지문으로 한 번만', noKey1.status === 'saved' && noKey2.status === 'saved' && noKey2.receipt.replayed && noKey1.receipt.opId === noKey2.receipt.opId && store.objects.size === 3);

  /* 잃은 응답: 저장은 됐는데 던짐 → 다시 읽어 확인 */
  const s2 = new FakeStore();
  s2.createThrowAfterSave = 1;
  const lost = await writeOp(s2, { kind: 'register', actor: ACTOR_A, requestKey: 'req-lost-0001', payload }, nextNow());
  check('잃은 응답: 다시 읽어 saved', lost.status === 'saved' && !lost.receipt.replayed && lost.receipt.visible, lost.status);
  check('잃은 응답: 객체 1개', s2.objects.size === 1);
  const lostRetry = await writeOp(s2, { kind: 'register', actor: ACTOR_A, requestKey: 'req-lost-0001', payload }, nextNow());
  check('잃은 응답 뒤 다시 보냄: saved · replayed', lostRetry.status === 'saved' && lostRetry.receipt.replayed && s2.objects.size === 1);

  /* 저장 안 됨('error') → 대기(save), 다시 보내면 성공 */
  const s3 = new FakeStore();
  s3.createErrorNoSave = 1;
  const pend = await writeOp(s3, { kind: 'register', actor: ACTOR_A, requestKey: 'req-err-00001', payload }, nextNow());
  check("저장 실패 'error' → pending(save)", pend.status === 'pending' && pend.reason === 'save', JSON.stringify(pend));
  check('저장 실패 뒤 객체 없음', s3.objects.size === 0);
  const pendRetry = await writeOp(s3, { kind: 'register', actor: ACTOR_A, requestKey: 'req-err-00001', payload }, nextNow());
  check('저장 실패 뒤 다시 보냄 → saved', pendRetry.status === 'saved' && !pendRetry.receipt.replayed && s3.objects.size === 1);

  /* 만들었는데 다시 읽기를 못 함 → pending(readback) */
  const s4 = new FakeStore();
  s4.readFail = () => 'unavailable';
  const t0 = Date.now();
  const rb = await writeOp(s4, { kind: 'register', actor: ACTOR_A, requestKey: 'req-rb-000001', payload }, nextNow());
  check('만든 뒤 읽기 실패 → pending(readback)', rb.status === 'pending' && rb.reason === 'readback', `${JSON.stringify(rb)} · ${Date.now() - t0}ms`);

  /* 저장 뒤 목록을 못 읽음 → saved 지만 visible false */
  const s5 = new FakeStore();
  s5.listFail = true;
  const invisible = await writeOp(s5, { kind: 'register', actor: ACTOR_A, requestKey: 'req-vis-00001', payload }, nextNow());
  check('저장 뒤 목록 실패 → saved · visible false', invisible.status === 'saved' && !invisible.receipt.visible && invisible.receipt.placements.length === 0);

  /* 가져오기 쓰기 */
  const s6 = new FakeStore();
  const ip = imp([impRecord(), impRecord({ use: { itemId: 'drill-2' } }), impRecord({ source: { url: PMC }, use: { itemId: 'drill-3' } })]);
  const iw = await writeOp(s6, { kind: 'import', actor: ACTOR_A, requestKey: 'imp-snap-0001-chunk-0', payload: ip }, nextNow());
  check('가져오기 쓰기: saved · records 3 · visible · placements 비움', iw.status === 'saved' && iw.receipt.records === 3 && iw.receipt.visible && iw.receipt.placements.length === 0, iw.status === 'saved' ? JSON.stringify(iw.receipt) : iw.status);

  /* CI-6: 다시 읽은 본문이 아직 다 쓰이지 않음(빈 글 · 끊긴 JSON) → 충돌로 굳히지 않고 다시 읽는다 */
  const s7 = new FakeStore();
  const k7 = 'req-partial-01';
  s7.readScript.set(opKey(opIdOf('register', ACTOR_A.userId, k7)), ['', '{"schema":"review-evid']);
  const partial = await writeOp(s7, { kind: 'register', actor: ACTOR_A, requestKey: k7, payload }, nextNow());
  check('다시 읽기: 빈 글 → 끊긴 JSON → 온전한 본문이면 saved(충돌 아님)', partial.status === 'saved' && !partial.receipt.replayed && partial.receipt.visible, JSON.stringify(partial));

  const s8 = new FakeStore();
  const k8 = 'req-partial-02';
  s8.readScript.set(opKey(opIdOf('register', ACTOR_A.userId, k8)), ['', '', '', '', '']);
  const stillPartial = await writeOp(s8, { kind: 'register', actor: ACTOR_A, requestKey: k8, payload }, nextNow());
  check('다시 읽기: 계속 빈 글 → pending(readback) · 충돌 아님', stillPartial.status === 'pending' && stillPartial.reason === 'readback', JSON.stringify(stillPartial));
  const afterPartial = await writeOp(s8, { kind: 'register', actor: ACTOR_A, requestKey: k8, payload }, nextNow());
  check('다시 읽기: 그 뒤 같은 요청을 다시 보내면 saved · replayed', afterPartial.status === 'saved' && afterPartial.receipt.replayed && s8.objects.size === 1, JSON.stringify(afterPartial));

  const s9 = new FakeStore();
  const k9 = 'req-partial-03';
  s9.readScript.set(opKey(opIdOf('register', ACTOR_A.userId, k9)), ['{"schema":"review-evidence/v1/op"}']);
  const wrongBody = await writeOp(s9, { kind: 'register', actor: ACTOR_A, requestKey: k9, payload }, nextNow());
  /* 검토(CI-6)의 고침안은 이 경우도 pending/'corrupt' 를 권했다 — 지금 핵심 모듈은 conflict. 판단은 담당에게 넘기고 값만 남긴다 */
  console.log(`  참고: 온전한 JSON 인데 기록 모양이 틀린 본문(다시 검사 실패)은 지금 ${wrongBody.status} 로 돌아옴`);
}

section('동시 쓰기');
{
  const store = new FakeStore();
  const payload = reg({ use: { itemId: 'item-con' } });
  const [a, b] = await Promise.all([
    writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-concur-01', payload }, nextNow()),
    writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-concur-01', payload }, nextNow()),
  ]);
  check('같은 요청 동시 두 번: 둘 다 saved', a.status === 'saved' && b.status === 'saved');
  check('같은 요청 동시 두 번: 객체 1개 · 같은 opId', store.objects.size === 1 && a.status === 'saved' && b.status === 'saved' && a.receipt.opId === b.receipt.opId);
  check('같은 요청 동시 두 번: 새로 만든 것은 하나(replayed false 1개)', [a, b].filter((r) => r.status === 'saved' && !r.receipt.replayed).length === 1);

  const store2 = new FakeStore();
  const inputs = Array.from({ length: 20 }, (_, i) => ({
    actor: i % 2 ? ACTOR_B : ACTOR_A,
    payload: reg({ use: { domain: i % 4 < 2 ? 'exercise' : 'mechanics', reviewId: 'rev-shared', itemId: `item-${i}` } }),
    key: `req-many-${String(i).padStart(4, '0')}`,
  }));
  const results = await Promise.all(inputs.map((x) => writeOp(store2, { kind: 'register', actor: x.actor, requestKey: x.key, payload: x.payload }, nextNow())));
  check('다른 쓰기 20개 동시: 모두 saved', results.every((r) => r.status === 'saved'));
  check('다른 쓰기 20개 동시: 객체 20개', store2.objects.size === 20);
  check('다른 쓰기 20개 동시: 각자 visible', results.every((r) => r.status === 'saved' && r.receipt.visible));
  const lib = await loadLibrary(store2);
  const uses = lib.ok ? allUses(lib.library) : [];
  check('다른 쓰기 20개 동시: 쓰임 20개 모두 보임(잃은 쓰기 없음)', uses.length === 20, String(uses.length));
  check('다른 쓰기 20개 동시: 출처는 하나로 묶임', lib.ok && lib.library.sources.length === 1);
  check('다른 쓰기 20개 동시: 분야별 10 · 10', lib.ok && lib.library.sources[0]?.useCounts.exercise === 10 && lib.library.sources[0]?.useCounts.mechanics === 10);
}

section('받음표 — 쓰기 번호(writeId)로 새로 저장(201) · 다시 보냄(200) 가르기(R2 P2)');
{
  /* 받은 시각이 같은 1/1000초여도 가를 수 있어야 한다 — 그래서 모든 시험에 같은 시각을 넣는다 */
  const FIXED = new Date('2026-11-17T04:00:00.000Z');
  const payload = reg({ use: { itemId: 'rcpt-1' } });
  const input = (requestKey: string) => ({ kind: 'register' as const, actor: ACTOR_A, requestKey, payload });

  const st = new FakeStore();
  const w1 = await writeOp(st, input('req-rcpt-seq-01'), FIXED);
  const w2 = await writeOp(st, input('req-rcpt-seq-01'), FIXED);
  check(
    '같은 1/1000초 · 같은 요청을 차례로 두 번: 첫째 새로 저장 · 둘째 다시 보냄 · 객체 1',
    w1.status === 'saved' && !w1.receipt.replayed && w2.status === 'saved' && w2.receipt.replayed && w1.receipt.receivedAt === w2.receipt.receivedAt && st.objects.size === 1,
    JSON.stringify([w1.status === 'saved' && w1.receipt.replayed, w2.status === 'saved' && w2.receipt.replayed]),
  );

  const sp = new FakeStore();
  const par = await Promise.all(Array.from({ length: 6 }, () => writeOp(sp, input('req-rcpt-par-01'), FIXED)));
  const fresh = par.filter((r) => r.status === 'saved' && !r.receipt.replayed).length;
  const replays = par.filter((r) => r.status === 'saved' && r.receipt.replayed).length;
  check('같은 1/1000초 · 같은 요청 6개 동시에: 모두 saved · 새로 저장 정확히 1 · 다시 보냄 5 · 객체 1', fresh === 1 && replays === 5 && sp.objects.size === 1, `새로 ${fresh} · 다시 ${replays}`);

  const si = new FakeStore();
  const wid = 'ab'.repeat(16);
  await writeOp(si, input('req-rcpt-wid-01'), FIXED, undefined, { newWriteId: () => wid });
  const sbody = JSON.parse(si.objects.get(opKey(opIdOf('register', ACTOR_A.userId, 'req-rcpt-wid-01')))?.body ?? '{}') as Record<string, unknown>;
  check(
    '본문에 넣은 쓰기 번호 그대로 · 내용 지문 · 기록 번호는 쓰기 번호와 상관없음',
    sbody.writeId === wid && sbody.payloadHash === payloadHashOf(payload) && sbody.opId === opIdOf('register', ACTOR_A.userId, 'req-rcpt-wid-01'),
    String(sbody.writeId),
  );
  const sb = new FakeStore();
  await writeOp(sb, input('req-rcpt-wid-02'), FIXED, undefined, { newWriteId: () => 'NOT-HEX' });
  const bbody = JSON.parse([...sb.objects.values()][0]?.body ?? '{}') as Record<string, unknown>;
  check('넣어 준 쓰기 번호 모양이 틀리면 무작위 번호로(소문자 16진 32자)', typeof bbody.writeId === 'string' && /^[0-9a-f]{32}$/.test(bbody.writeId) && bbody.writeId !== 'NOT-HEX');
  const twoIds = new Set<string>();
  for (const k of ['req-rcpt-rnd-01', 'req-rcpt-rnd-02']) {
    const sr = new FakeStore();
    await writeOp(sr, input(k), FIXED);
    twoIds.add(String((JSON.parse([...sr.objects.values()][0].body) as { writeId?: string }).writeId));
  }
  check('쓰기마다 다른 무작위 쓰기 번호', twoIds.size === 2);

  /* 저장소가 '이미 있음'이라고 분명히 답하면 쓰기 번호가 같아도(같은 번호를 넣어도) 늘 다시 보냄(200) — GPT 중간 설계 확인 */
  const sx = new FakeStore();
  const same = () => 'cd'.repeat(16);
  const x1 = await writeOp(sx, input('req-rcpt-exists-01'), FIXED, undefined, { newWriteId: same });
  const x2 = await writeOp(sx, input('req-rcpt-exists-01'), FIXED, undefined, { newWriteId: same });
  check(
    "같은 쓰기 번호를 넣어도 저장소가 '이미 있음'이면 둘째는 다시 보냄(replayed) · 첫째만 새로 저장 · 객체 1",
    x1.status === 'saved' && !x1.receipt.replayed && x2.status === 'saved' && x2.receipt.replayed && sx.objects.size === 1,
    JSON.stringify([x1.status === 'saved' && x1.receipt.replayed, x2.status === 'saved' && x2.receipt.replayed]),
  );

  const sl = new FakeStore();
  sl.createThrowAfterSave = 1;
  const wl = await writeOp(sl, input('req-rcpt-lost-01'), FIXED);
  check('저장은 됐는데 응답을 잃음(던짐) → 내 쓰기 번호를 다시 읽어 새로 저장(201)', wl.status === 'saved' && !wl.receipt.replayed, JSON.stringify(wl));

  const sls = new FakeStore();
  sls.createLate.push({ saveAfterMs: 10, answerAfterMs: 400 });
  const wls = await writeOp(sls, input('req-rcpt-late-01'), FIXED, undefined, { writeTimeoutMs: 60 });
  check('응답이 늦어 시간 초과지만 다시 읽기 전에 저장됨 → 새로 저장(201)', wls.status === 'saved' && !wls.receipt.replayed, JSON.stringify(wls));

  const stl = new FakeStore();
  stl.createLate.push({ saveAfterMs: 250, answerAfterMs: 300 });
  const p1 = await writeOp(stl, input('req-rcpt-late-02'), FIXED, undefined, { writeTimeoutMs: 30 });
  check('시간 초과 · 다시 읽을 때 아직 없음 → pending(save) · 그때 객체 0', p1.status === 'pending' && p1.reason === 'save' && stl.objects.size === 0, JSON.stringify(p1));
  await sleep(400);
  check('그 뒤 늦게 저장됨(객체 1)', stl.objects.size === 1);
  const p2 = await writeOp(stl, input('req-rcpt-late-02'), FIXED);
  check('같은 요청을 다시 보냄 → 다시 보냄(200 replayed) · 객체 1', p2.status === 'saved' && p2.receipt.replayed && stl.objects.size === 1, JSON.stringify(p2));

  const sc = new FakeStore();
  await writeOp(sc, input('req-rcpt-conf-01'), FIXED);
  const wc = await writeOp(sc, { kind: 'register', actor: ACTOR_A, requestKey: 'req-rcpt-conf-01', payload: reg({ use: { itemId: 'rcpt-other' } }) }, FIXED);
  check('같은 요청 번호 · 다른 내용 → conflict(쓰기 번호와 상관없이)', wc.status === 'conflict' && sc.objects.size === 1);

  const sg = new FakeStore();
  const legacy = mkOp('register', ACTOR_A, 'req-rcpt-legacy1', payload, FIXED.toISOString());
  seedOp(sg, legacy);
  const wg = await writeOp(sg, input('req-rcpt-legacy1'), FIXED);
  check('쓰기 번호 없는 옛 기록에 같은 요청(같은 받은 시각까지) → 다시 보냄(200 replayed)', wg.status === 'saved' && wg.receipt.replayed && wg.receipt.opId === legacy.opId && sg.objects.size === 1, JSON.stringify(wg));

  /* 저장된 기록 다시 읽기의 쓰기 번호 검사 */
  const raw = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>;
  const pLegacy = parseStoredOp(raw);
  check('옛 기록(쓰기 번호 없음) 그대로 읽힘 · writeId 없음', !!pLegacy && pLegacy.writeId === undefined && !('writeId' in pLegacy));
  const pWith = parseStoredOp({ ...raw, writeId: wid });
  check('맞는 쓰기 번호는 그대로 실림', pWith?.writeId === wid);
  for (const [n, v] of [
    ['대문자', 'AB'.repeat(16)],
    ['31자', 'a'.repeat(31)],
    ['33자', 'a'.repeat(33)],
    ['16진이 아님', 'g'.repeat(32)],
    ['null', null],
    ['숫자', 123],
  ] as [string, unknown][])
    check(`모양이 틀린 쓰기 번호(${n}) → 모양이 틀린 기록`, parseStoredOp({ ...raw, writeId: v }) === null);
  check('쓰기 번호는 내용 지문 · 기록 번호 검사에 안 들어감(checkedOp 통과)', checkedOp(JSON.stringify({ ...raw, writeId: wid }), legacy.opId)?.writeId === wid);
  const sbad = new FakeStore();
  seedMany(sbad, 2);
  sbad.put(opKey(legacy.opId), JSON.stringify({ ...raw, writeId: 'XYZ' }));
  const rbad = await loadOps(sbad, undefined, FAST);
  check('저장된 쓰기 번호 모양이 틀린 기록 → 읽을 때 skipped 로 셈', rbad.ok && rbad.skipped === 1 && rbad.ops.length === 2, reasonOf(rbad));

  /* API 로: 같은 시각 · 같은 본문 */
  const sa = new FakeStore();
  const depsA: ApiDeps = { store: () => sa, cache: new Map(), storeKind: 'local-fixture', now: () => FIXED, write: FAST };
  const OWNER_R: ApiViewer = { id: 'owner_r', role: 'ADMIN', nickname: '대표' };
  const post = (body: string) =>
    new Request('https://app.test/api/admin/review-evidence', { method: 'POST', headers: { host: 'app.test', 'content-type': 'application/json', 'x-review-evidence': '1' }, body });
  const rb = JSON.stringify(regRaw({ requestKey: 'req-rcpt-api-001', use: { itemId: 'rcpt-api' } }));
  const a1 = await handleRegister(post(rb), OWNER_R, depsA);
  const a2 = await handleRegister(post(rb), OWNER_R, depsA);
  check('API: 같은 1/1000초 · 같은 본문 두 번 → 201 다음 200', a1.status === 201 && a2.status === 200, `${a1.status}/${a2.status}`);
  const rb2 = JSON.stringify(regRaw({ requestKey: 'req-rcpt-api-002', use: { itemId: 'rcpt-api-2' } }));
  const statuses = (await Promise.all(Array.from({ length: 5 }, () => handleRegister(post(rb2), OWNER_R, depsA)))).map((r) => r.status);
  check('API: 같은 1/1000초 · 같은 본문 5개 동시에 → 201 하나 · 200 넷', statuses.filter((x) => x === 201).length === 1 && statuses.filter((x) => x === 200).length === 4, statuses.join(','));

  /*
   * 쓰기 번호가 가르는 경우(T4) — 저장소가 '이미 있음'을 분명히 답하지 못했는데(오류 · 시간 초과) 객체는 앞선 시도 · 다른 요청이 이미 만들어 둔 때.
   * 다시 읽은 본문의 쓰기 번호가 내 것이 아니므로 다시 보냄(200)이다. '이미 있음'만 보고 가르면(created === 'exists') 여기서 201 이 두 번 나온다.
   */
  const se = new FakeStore();
  const e1 = await writeOp(se, input('req-rcpt-amb-err1'), FIXED);
  se.createErrorNoSave = 1;
  const e2 = await writeOp(se, input('req-rcpt-amb-err1'), FIXED);
  check(
    "같은 요청을 다시 보냈는데 만들기가 '오류'(객체는 이미 있음) → 다시 보냄(replayed) · 객체 1",
    e1.status === 'saved' && !e1.receipt.replayed && e2.status === 'saved' && e2.receipt.replayed && se.calls.create === 2 && se.objects.size === 1,
    JSON.stringify([e1.status === 'saved' && e1.receipt.replayed, e2.status === 'saved' && e2.receipt.replayed]),
  );

  const sto = new FakeStore();
  const t1 = await writeOp(sto, input('req-rcpt-amb-tmo1'), FIXED);
  /* 객체가 이미 있어 늦게 '이미 있음'을 답하는 만들기 — 기다림 한도(60ms)가 먼저 와 '시간 초과'가 된다 */
  sto.createLate.push({ saveAfterMs: 10, answerAfterMs: 400 });
  const t0ms = Date.now();
  const t2 = await writeOp(sto, input('req-rcpt-amb-tmo1'), FIXED, undefined, { writeTimeoutMs: 60 });
  check(
    "같은 요청을 다시 보냈는데 만들기가 '시간 초과'(객체는 이미 있음) → 다시 보냄(replayed) · 객체 1",
    t1.status === 'saved' && !t1.receipt.replayed && t2.status === 'saved' && t2.receipt.replayed && sto.objects.size === 1 && Date.now() - t0ms < 390,
    `${JSON.stringify([t1.status === 'saved' && t1.receipt.replayed, t2.status === 'saved' && t2.receipt.replayed])} · ${Date.now() - t0ms}ms`,
  );
  await sleep(400);

  const spe = new FakeStore();
  spe.createErrorNoSave = 1;
  const pe = await Promise.all([writeOp(spe, input('req-rcpt-amb-par1'), FIXED), writeOp(spe, input('req-rcpt-amb-par1'), FIXED)]);
  check(
    "같은 1/1000초 · 같은 요청 둘 동시에, 하나는 만들기 '오류' · 하나는 만듦 → 새로 저장 정확히 1 · 다시 보냄 1 · 객체 1",
    pe.every((r) => r.status === 'saved') && pe.filter((r) => r.status === 'saved' && !r.receipt.replayed).length === 1 && spe.objects.size === 1,
    JSON.stringify(pe.map((r) => (r.status === 'saved' ? r.receipt.replayed : r.status))),
  );

  /* API 로: 오류 · 시간 초과 뒤 확인은 200, 내 쓰기가 늦게 저장된 것은 201 */
  const sx2 = new FakeStore();
  const depsX: ApiDeps = { store: () => sx2, cache: new Map(), storeKind: 'local-fixture', now: () => FIXED, write: { ...FAST, writeTimeoutMs: 60 } };
  const rbx = JSON.stringify(regRaw({ requestKey: 'req-rcpt-api-amb1', use: { itemId: 'rcpt-api-amb' } }));
  const x01 = await handleRegister(post(rbx), OWNER_R, depsX);
  sx2.createErrorNoSave = 1;
  const x02 = await handleRegister(post(rbx), OWNER_R, depsX);
  sx2.createLate.push({ saveAfterMs: 10, answerAfterMs: 400 });
  const x03 = await handleRegister(post(rbx), OWNER_R, depsX);
  check("API: 처음 201 · 만들기 '오류' 뒤 확인 200 · 만들기 '시간 초과' 뒤 확인 200 · 객체 1", x01.status === 201 && x02.status === 200 && x03.status === 200 && sx2.objects.size === 1, `${x01.status}/${x02.status}/${x03.status}`);
  await sleep(400);
  const sl2 = new FakeStore();
  sl2.createLate.push({ saveAfterMs: 10, answerAfterMs: 400 });
  const depsL: ApiDeps = { store: () => sl2, cache: new Map(), storeKind: 'local-fixture', now: () => FIXED, write: { ...FAST, writeTimeoutMs: 60 } };
  const xl = await handleRegister(post(JSON.stringify(regRaw({ requestKey: 'req-rcpt-api-late', use: { itemId: 'rcpt-api-late' } }))), OWNER_R, depsL);
  check('API: 내 쓰기가 응답보다 먼저 저장됨(시간 초과 뒤 다시 읽어 내 쓰기 번호) → 201', xl.status === 201 && sl2.objects.size === 1, String(xl.status));
  await sleep(400);
}

section('옛 기록(쓰기 번호 없음) — 중앙과 같은 모양의 가져오기 3건(R1 로컬 시험 폴더, 읽기만)');
{
  const synth = mkOp('import', ACTOR_A, 'imp-legacy-chunk-1', imp([impRecord(), impRecord({ use: { itemId: 'drill-legacy-2' } })]), NOW.toISOString());
  const synthOp = checkedOp(JSON.stringify(synth), synth.opId);
  check('합성 옛 가져오기(writeId 없음) → 그대로 읽힘', !!synthOp && synthOp.kind === 'import' && synthOp.writeId === undefined);
  const dirS2 = '/tmp/EX-REF04-claude/fixture-store-s2/review-evidence/v1/ops';
  if (!existsSync(dirS2)) console.log('  건너뜀 — R1 로컬 시험 폴더 없음');
  else {
    /* 파일은 읽기만 하고 메모리 가짜 저장소에 옮겨 시험한다(원래 폴더에는 쓰지 않음) */
    const fs2 = new FakeStore();
    for (const n of readdirSync(dirS2)) if (n.endsWith('.json')) fs2.put(`${OP_FOLDER}/${n}`, readFileSync(path.join(dirS2, n), 'utf8'));
    const before = fs2.objects.size;
    const r = await loadOps(fs2, undefined, FAST);
    const isImport = (o: Op): o is Extract<Op, { kind: 'import' }> => o.kind === 'import';
    const imports = r.ok ? r.ops.filter(isImport) : [];
    const recs = imports.reduce((a, o) => a + o.payload.records.length, 0);
    check(
      'R1 시험 폴더: 가져오기 3건 · 280줄 · 모두 쓰기 번호 없음 · 뺀 기록 0',
      r.ok && imports.length === 3 && recs === 280 && r.ops.every((o) => o.writeId === undefined) && r.skipped === 0,
      r.ok ? `가져오기 ${imports.length} · 줄 ${recs} · 뺌 ${r.skipped}` : reasonOf(r),
    );
    const first = imports[0];
    if (first) {
      const w = await writeOp(fs2, { kind: 'import', actor: first.actor, requestKey: first.requestKey, payload: first.payload }, NOW, undefined, FAST);
      check(
        '그 가져오기를 같은 요청으로 다시 보냄 → 다시 보냄(200 replayed) · 보임 · 객체 수 그대로',
        w.status === 'saved' && w.receipt.replayed && w.receipt.visible && w.receipt.records === first.payload.records.length && fs2.objects.size === before,
        JSON.stringify(w.status === 'saved' ? { r: w.receipt.replayed, v: w.receipt.visible, n: w.receipt.records } : w),
      );
    }
  }
}

/* ═══════════════ 4. 읽기(loadOps) ═══════════════ */

function seedMany(store: FakeStore, n: number, startAt = 0): Op[] {
  const out: Op[] = [];
  for (let i = startAt; i < startAt + n; i++) {
    const op = mkOp('register', ACTOR_A, `req-seed-${String(i).padStart(4, '0')}`, reg({ use: { itemId: `seed-${i}` } }), new Date(NOW.getTime() + i * 1000).toISOString());
    seedOp(store, op);
    out.push(op);
  }
  return out;
}

section('읽기 · 쪽 넘기기 · 실패는 전체 실패');
{
  const store = new FakeStore();
  store.pageCap = 3;
  const seeded = seedMany(store, 10);
  let appended: Op[] = [];
  let cursorAtAppend: string | null = null;
  store.onList = (call, cursor) => {
    if (call === 2) {
      appended = seedMany(store, 4, 100);
      cursorAtAppend = cursor;
    }
  };
  const r = await loadOps(store);
  const ids = new Set(r.ok ? r.ops.map((o) => o.opId) : []);
  check('쪽 상한 3 · 중간에 새 기록: 성공', r.ok);
  check('쪽 상한 3 · 중간에 새 기록: 앞의 10개 하나도 안 빠짐', seeded.every((o) => ids.has(o.opId)), `${ids.size}개`);
  /* 이름 차례로 넘기므로: 그때의 다음 쪽 표보다 뒤 이름은 나오고, 앞 이름은 안 나온다(약속한 뜻) */
  const ca = cursorAtAppend as string | null;
  const expectIn = appended.filter((o) => ca !== null && `${o.opId}.json` > ca);
  const expectOut = appended.filter((o) => ca !== null && `${o.opId}.json` < ca);
  check(
    '쪽 상한 3 · 중간에 새 기록: 다음 쪽 표 뒤에 생긴 것은 읽고, 앞에 생긴 것은 이번에 안 읽음',
    appended.length === 4 && ca !== null && expectIn.every((o) => ids.has(o.opId)) && expectOut.every((o) => !ids.has(o.opId)) && ids.size === 10 + expectIn.length,
    `뒤 ${expectIn.length} · 앞 ${expectOut.length} · 읽음 ${ids.size}`,
  );
  check('쪽 상한 3: 다음 쪽이 없을 때까지 여러 번 물음', store.calls.list >= Math.ceil((10 + expectIn.length) / 3), String(store.calls.list));

  const lf = new FakeStore();
  seedMany(lf, 3);
  lf.listFail = true;
  const rlf = await loadOps(lf);
  check('목록 실패 → unavailable', !rlf.ok && rlf.reason === 'unavailable');

  const rf = new FakeStore();
  const ops = seedMany(rf, 5);
  const badKey = opKey(ops[2].opId);
  rf.readFail = (k) => (k === badKey ? 'unavailable' : null);
  const rrf = await loadOps(rf);
  check('본문 하나 읽기 실패 → 전체 unavailable(일부만 보이지 않음)', !rrf.ok && rrf.reason === 'unavailable');
  const rlib = await loadLibrary(rf);
  check('loadLibrary 도 같은 실패', !rlib.ok && rlib.reason === 'unavailable');

  const tl = new FakeStore();
  const tops = seedMany(tl, 3);
  const tlKey = opKey(tops[1].opId);
  tl.readFail = (k) => (k === tlKey ? 'too_large' : null);
  const rtl = await loadOps(tl);
  check('본문이 너무 큼 → too_large', !rtl.ok && rtl.reason === 'too_large');

  const big = new FakeStore();
  const bops = seedMany(big, 2);
  big.sizeOverride.set(opKey(bops[0].opId), MAX_OP_BYTES + 1);
  const rbig = await loadOps(big);
  check('목록의 크기가 한도 넘음 → too_large(본문을 읽지 않음)', !rbig.ok && rbig.reason === 'too_large' && big.calls.read === 0);

  const pages = new FakeStore();
  pages.pageCap = 1;
  for (let i = 0; i < MAX_LIST_PAGES + 2; i++) pages.put(`${OP_FOLDER}/junk-${i}.txt`, 'x');
  const rp = await loadOps(pages);
  check(`쪽 수 ${MAX_LIST_PAGES} 넘음 → too_large`, !rp.ok && rp.reason === 'too_large');

  /* 기록 수 한도(MAX_OPS) — 쪽 수 한도(60쪽 × 1000)보다 먼저 걸린다. 본문은 읽지 않는다(T6) */
  const many = new FakeStore();
  many.pageCap = LIST_PAGE;
  for (let i = 0; i < MAX_OPS; i++) many.put(`${OP_FOLDER}/junk-${String(i).padStart(6, '0')}.txt`, 'x');
  const atCap = await listAllOps(many, FAST);
  check(`객체 정확히 ${MAX_OPS}개 → 성공(경계)`, atCap.ok && atCap.items.length === MAX_OPS && atCap.pages <= MAX_LIST_PAGES, reasonOf(atCap));
  many.put(`${OP_FOLDER}/junk-${String(MAX_OPS).padStart(6, '0')}.txt`, 'x');
  const overCap = await listAllOps(many, FAST);
  check(`객체 ${MAX_OPS + 1}개(쪽 수 한도 안) → too_large`, !overCap.ok && overCap.reason === 'too_large', reasonOf(overCap));
  const overCapOps = await loadOps(many, undefined, FAST);
  check(`객체 ${MAX_OPS + 1}개: loadOps 도 too_large · 본문을 읽지 않음`, !overCapOps.ok && overCapOps.reason === 'too_large' && many.calls.read === 0, `${reasonOf(overCapOps)} · 읽음 ${many.calls.read}`);
  /* 요청한 개수(limit)를 무시하고 한 쪽에 몽땅 주는 저장소 — 쪽 수 한도로는 막히지 않으므로 기록 수 한도가 막아야 한다 */
  const allNames = Array.from({ length: MAX_OPS + 1 }, (_, i) => `junk-${String(i).padStart(6, '0')}.txt`);
  let bigPageLimit = -1;
  const onePage: EvidenceObjectStore = {
    createOnly: async () => 'error',
    read: async () => ({ ok: false, reason: 'unavailable' }),
    list: async (_cursor, limit) => {
      bigPageLimit = limit;
      return { ok: true, items: allNames.map((name) => ({ name, size: 1, etag: null })), nextCursor: null, hasNext: false };
    },
  };
  const rOne = await listAllOps(onePage, FAST);
  check(`요청보다 큰 한 쪽(${MAX_OPS + 1}개 · limit ${LIST_PAGE}) → too_large`, !rOne.ok && rOne.reason === 'too_large' && bigPageLimit === LIST_PAGE, `${reasonOf(rOne)} · limit ${bigPageLimit}`);

  /* 본문 합계 한도(MAX_TOTAL_BYTES) — 목록의 크기만 보고 읽기 전에 막는다 */
  const perCap = Math.floor(MAX_TOTAL_BYTES / MAX_OP_BYTES);
  const total = new FakeStore();
  const tOps = seedMany(total, perCap + 1, 5000);
  for (const o of tOps) total.sizeOverride.set(opKey(o.opId), MAX_OP_BYTES);
  const rTot = await loadOps(total, undefined, FAST);
  check(
    `목록 크기 합계 ${perCap + 1} × ${MAX_OP_BYTES}(한도 ${MAX_TOTAL_BYTES} 넘음) → too_large · 본문을 읽지 않음`,
    !rTot.ok && rTot.reason === 'too_large' && total.calls.read === 0,
    `${reasonOf(rTot)} · 읽음 ${total.calls.read}`,
  );
  const lTot = await loadLibrary(total, undefined, FAST);
  check('본문 합계 한도: loadLibrary 도 too_large', !lTot.ok && lTot.reason === 'too_large');
  const exact = new FakeStore();
  const eOps = seedMany(exact, perCap, 6000);
  for (const o of eOps) exact.sizeOverride.set(opKey(o.opId), MAX_OP_BYTES);
  const rEx = await loadOps(exact, undefined, FAST);
  check(`목록 크기 합계가 한도와 정확히 같음(${perCap} × ${MAX_OP_BYTES}) → 성공(경계) · 모두 읽음`, rEx.ok && rEx.ops.length === perCap && exact.calls.read === perCap, `${reasonOf(rEx)} · 읽음 ${exact.calls.read}`);
}

section('모양이 틀린 기록 · 다른 이름');
{
  const store = new FakeStore();
  const good = seedMany(store, 3);
  const garbageName = `${OP_FOLDER}/${'c'.repeat(64)}.json`;
  store.put(garbageName, '{ 망가진 JSON');
  const tampered = mkOp('register', ACTOR_B, 'req-tamper-01', reg({ use: { itemId: 'tamper' } }), NOW.toISOString());
  store.put(opKey(tampered.opId), JSON.stringify({ ...tampered, payloadHash: 'd'.repeat(64) }));
  const mismatch = mkOp('register', ACTOR_B, 'req-mismatch-1', reg({ use: { itemId: 'mismatch' } }), NOW.toISOString());
  store.put(`${OP_FOLDER}/${'e'.repeat(64)}.json`, JSON.stringify(mismatch));
  const forged = mkOp('register', ACTOR_B, 'req-forged-01', reg({ use: { itemId: 'forged' } }), NOW.toISOString());
  /* opId 를 바꾸고 그 이름으로 저장 — 이름과 opId 는 맞지만 opIdOf(종류 · 계정 · 요청 번호)와 다름 */
  const fakeId = 'f'.repeat(64);
  store.put(`${OP_FOLDER}/${fakeId}.json`, JSON.stringify({ ...forged, opId: fakeId }));
  const changedPayload = mkOp('register', ACTOR_B, 'req-changed-1', reg({ use: { itemId: 'changed' } }), NOW.toISOString());
  store.put(opKey(changedPayload.opId), JSON.stringify({ ...changedPayload, payload: reg({ use: { itemId: 'changed-later' } }) }));
  store.put(`${OP_FOLDER}/notes.txt`, 'hello');
  store.put(`${OP_FOLDER}/.emptyFolderPlaceholder`, '');
  store.put(`${OP_FOLDER}/sub/${'a'.repeat(64)}.json`, '{}');

  let r: Awaited<ReturnType<typeof loadOps>> | null = null;
  let threw = '';
  try {
    r = await loadOps(store);
  } catch (e) {
    threw = String(e);
  }
  check('망가진 기록이 있어도 던지지 않음', !threw && !!r?.ok, threw);
  const ids = new Set(r?.ok ? r.ops.map((o) => o.opId) : []);
  check('정상 기록 3개만 받음', ids.size === 3 && good.every((o) => ids.has(o.opId)), String(ids.size));
  check('망가진 JSON · 지문 바뀜 · 이름 다름 · 위조 opId · 바뀐 본문 → 뺌', ![tampered.opId, mismatch.opId, fakeId, changedPayload.opId].some((x) => ids.has(x)));
  check('뺀 기록 수에 망가진 기록 5개가 들어감', !!r?.ok && r.skipped >= 5, r?.ok ? `skipped ${r.skipped}` : '');
  check('기록 이름이 아닌 파일은 읽지 않음', !store.readKeys.some((k) => k.endsWith('notes.txt') || k.endsWith('.emptyFolderPlaceholder') || k.includes('/sub/')));
  const lib = await loadLibrary(store);
  check('목록 skippedOps 가 loadOps skipped 와 같음', lib.ok && !!r?.ok && lib.library.skippedOps === r.skipped);
  check('기록 이름이 아닌 파일(notes.txt · .emptyFolderPlaceholder)은 skippedOps 에 세지 않음 — 정확히 5', !!r?.ok && r.skipped === 5, r?.ok ? `skipped ${r.skipped}` : '');
  check('기록 이름이 아닌 객체는 foreign 으로 셈(notes.txt 1 · 빈 폴더 표시는 빼고)', !!r?.ok && r.foreign === 1, r?.ok ? `foreign ${r.foreign}` : '');
  check('목록 foreignObjects 가 loadOps foreign 과 같음', lib.ok && !!r?.ok && lib.library.foreignObjects === r.foreign);
  const onlyJunk = new FakeStore();
  onlyJunk.put(`${OP_FOLDER}/.emptyFolderPlaceholder`, '');
  onlyJunk.put(`${OP_FOLDER}/readme.md`, '# x');
  const oj = await loadLibrary(onlyJunk);
  check('기록 이름이 아닌 파일만 있으면 skippedOps 0 · 기록 0', oj.ok && oj.library.skippedOps === 0 && oj.library.opCount === 0 && onlyJunk.calls.read === 0);
  check('기록 이름이 아닌 파일만 있으면 foreignObjects 1(readme.md)', oj.ok && oj.library.foreignObjects === 1, oj.ok ? String(oj.library.foreignObjects) : '');
  const onlyPlaceholder = new FakeStore();
  onlyPlaceholder.put(`${OP_FOLDER}/.emptyFolderPlaceholder`, '');
  const op0 = await loadLibrary(onlyPlaceholder);
  check('빈 폴더 표시만 있으면 foreignObjects 0', op0.ok && op0.library.foreignObjects === 0);
}

section('읽은 본문 다시 쓰기(cache)');
{
  const store = new FakeStore();
  const ops = seedMany(store, 6);
  const cache: OpCache = new Map();
  const a = await loadOps(store, cache);
  const readsAfterFirst = store.calls.read;
  check('첫 읽기: 6개 모두 읽음', a.ok && readsAfterFirst === 6);
  const b = await loadOps(store, cache);
  check('두 번째 읽기: 본문을 다시 읽지 않음', b.ok && b.ops.length === 6 && store.calls.read === readsAfterFirst, String(store.calls.read - readsAfterFirst));
  store.bumpEtag(opKey(ops[3].opId));
  const c = await loadOps(store, cache);
  check('eTag 가 바뀐 하나만 다시 읽음', c.ok && c.ops.length === 6 && store.calls.read === readsAfterFirst + 1 && store.readKeys.at(-1) === opKey(ops[3].opId));
  const junk = new FakeStore();
  junk.put(`${OP_FOLDER}/${'c'.repeat(64)}.json`, '{bad');
  const jc: OpCache = new Map();
  await loadOps(junk, jc);
  const j2 = await loadOps(junk, jc);
  check('망가진 기록도 기억해 다시 읽지 않고 뺀 수로 셈', j2.ok && j2.skipped === 1 && junk.calls.read === 1);
}

/* ═══════════════ 4-2. 목록 — 이름 차례 + 다음 쪽 표(R2 P1) ═══════════════ */

section('목록 — 옛 방식 재현(만든 시각 차례 + offset + 조용한 겹침 지우기) · 새 방식 비교');
{
  /*
   * 옛 방식 재현 — R1 store.ts listAllOps 의 알고리즘을 비교용으로 그대로 옮긴 것(제품 코드 아님, 지금 코드는 쓰지 않음).
   * 만든 시각이 모두 같으면 같은 시각끼리의 차례는 정해져 있지 않다 — 둘째 쪽부터 차례가 거꾸로 와도 서버로서는 맞는 동작.
   */
  type OldPage = { ok: true; items: ListItem[] } | { ok: false };
  async function oldOffsetListAll(list: (offset: number, limit: number) => Promise<OldPage>): Promise<{ ok: true; items: ListItem[] } | { ok: false; reason: string }> {
    const seen = new Map<string, ListItem>();
    let offset = 0;
    for (let page = 0; ; page++) {
      if (page >= MAX_LIST_PAGES) return { ok: false, reason: 'too_large' };
      const res = await list(offset, LIST_PAGE);
      if (!res.ok) return { ok: false, reason: 'unavailable' };
      if (!res.items.length) break;
      for (const it of res.items) if (!seen.has(it.name)) seen.set(it.name, it);
      offset += res.items.length;
      if (seen.size > MAX_OPS) return { ok: false, reason: 'too_large' };
    }
    return { ok: true, items: [...seen.values()] };
  }
  const names = Array.from({ length: 2000 }, (_, i) => hexName(i)).sort(cmpName);
  let call = 0;
  const createdAtServer = async (offset: number, limit: number): Promise<OldPage> => {
    call++;
    const order = call === 1 ? names : [...names].reverse();
    return { ok: true, items: order.slice(offset, offset + Math.min(limit, 1000)).map((name) => ({ name, size: 100, etag: null })) };
  };
  const old = await oldOffsetListAll(createdAtServer);
  check('옛 방식 재현: 만든 시각이 같은 2000개 중 1000개만 모으고도 ok:true(조용히 빠짐)', old.ok && old.items.length === 1000, old.ok ? `${old.items.length}/2000` : old.reason);

  const client = new FakeListV2Client();
  for (const n of names) client.names.add(n);
  const now = await listAllOps(v2Store(client), FAST);
  const got = namesOf(now);
  check(
    '새 방식(목록 v2): 같은 2000개 → 2000개 모두 정확히 한 번 · 이름 차례',
    now.ok && got.length === 2000 && new Set(got).size === 2000 && strictlyIncreasing(got) && got.every((x, i) => x === names[i]),
    now.ok ? String(got.length) : reasonOf(now),
  );
}

section('목록 v2 — 2500개 · 서버 한 쪽 상한이 요청보다 작음 · 만든 시각 모두 같음');
for (const mode of ['full', 'key', 'relative'] as const) {
  const client = new FakeListV2Client();
  client.cap = 400;
  client.nameMode = mode;
  const names = Array.from({ length: 2500 }, (_, i) => hexName(10_000 + i)).sort(cmpName);
  for (const n of names) client.names.add(n);
  const r = await listAllOps(v2Store(client), FAST);
  const got = namesOf(r);
  check(
    `이름 모양 ${mode}: 2500개(서버 한 쪽 400 < 요청 ${LIST_PAGE}) → 모두 정확히 한 번 · 늘 커지는 차례`,
    r.ok && got.length === 2500 && new Set(got).size === 2500 && strictlyIncreasing(got) && got.every((x, i) => x === names[i]),
    r.ok ? String(got.length) : reasonOf(r),
  );
  check(
    `이름 모양 ${mode}: 7쪽 · 첫 쪽은 cursor 칸 없음 · 그 뒤는 앞 쪽이 준 표 · 늘 ${LIST_PAGE}개를 청함`,
    client.calls.length === 7 && !client.calls[0].hasCursorKey && client.calls.slice(1).every((c) => c.hasCursorKey && c.cursor !== null) && client.calls.every((c) => c.limit === LIST_PAGE),
    JSON.stringify(client.calls.map((c) => c.hasCursorKey)),
  );
  check(`이름 모양 ${mode}: 요청 모양(prefix · 폴더 묶기 없음 · 이름 오름차순) 맞음 · 옛 목록(v1)은 한 번도 안 부름`, client.badRequests.length === 0 && client.v1Calls === 0, client.badRequests[0] ?? '');
  check(`이름 모양 ${mode}: 크기 · eTag 를 실어 옴`, r.ok && r.items.every((i) => typeof i.size === 'number' && typeof i.etag === 'string'));
}

section('목록 v2 — 쪽 사이에 새 객체(다음 쪽 표 앞 · 뒤)');
{
  const client = new FakeListV2Client();
  client.cap = 250;
  const pad = (i: number) => String(i).padStart(5, '0');
  const pre = Array.from({ length: 1200 }, (_, i) => `obj-${pad(i)}0.json`);
  for (const n of pre) client.names.add(n);
  const before: string[] = [];
  const after: string[] = [];
  client.onCall = (n, cursorName) => {
    if (!cursorName) return;
    const idx = Number(cursorName.slice(4, 9));
    /* 이미 지나간 자리(표 앞)와 아직 안 온 자리(표 뒤)에 하나씩 새로 만든다 */
    if (idx >= 3) {
      const b = `obj-${pad(idx - 3)}5.json`;
      before.push(b);
      client.names.add(b);
    }
    const a = `obj-${pad(idx + 3)}5.json`;
    after.push(a);
    client.names.add(a);
  };
  const r = await listAllOps(v2Store(client), FAST);
  const got = namesOf(r);
  const count = (x: string) => got.filter((g) => g === x).length;
  check('넘기는 사이 새 객체: 성공', r.ok, reasonOf(r));
  check('넘기는 사이 새 객체: 앞부터 있던 1200개는 모두 정확히 한 번', pre.every((x) => count(x) === 1), `${got.length}`);
  check('넘기는 사이 새 객체: 표 뒤에 생긴 것은 정확히 한 번 나옴', after.length > 0 && after.every((x) => count(x) === 1), `${after.length}개`);
  check('넘기는 사이 새 객체: 표 앞에 생긴 것은 이번에 안 나옴(약속한 뜻)', before.length > 0 && before.every((x) => count(x) === 0), `${before.length}개`);
  check('넘기는 사이 새 객체: 겹침 없음 · 늘 커지는 차례', new Set(got).size === got.length && strictlyIncreasing(got) && got.length === pre.length + after.length);
}

section('목록 v2 — 시간 초과 · 다시 묻기(같은 표로) · 끝내 안 되면 전체 실패');
{
  const mk = () => {
    const c = new FakeListV2Client();
    c.cap = 300;
    for (let i = 0; i < 900; i++) c.names.add(hexName(20_000 + i));
    return c;
  };
  /* 끊김을 받을 때까지 기다리는 응답 — storage-js 가 끊김을 StorageUnknownError 로 돌려주는 모양 */
  const hangUntilAbort = (signal: AbortSignal | undefined) =>
    new Promise<V2Response>((resolve) => {
      if (!signal) return;
      signal.addEventListener('abort', () => resolve({ data: null, error: { name: 'StorageUnknownError', message: 'The operation was aborted due to timeout' } }), { once: true });
    });

  const c1 = mk();
  c1.override = (n, _o, signal) => (n === 2 ? hangUntilAbort(signal) : null);
  const r1 = await listAllOps(v2Store(c1, 40), FAST);
  check('둘째 쪽 한 번 시간 초과(끊김) → 같은 표로 다시 물어 성공 · 900개 정확히 한 번', r1.ok && namesOf(r1).length === 900 && new Set(namesOf(r1)).size === 900, reasonOf(r1));
  check('다시 물을 때 같은 다음 쪽 표', c1.calls.length === 4 && c1.calls[1].cursor !== null && c1.calls[1].cursor === c1.calls[2].cursor, JSON.stringify(c1.calls.map((c) => c.cursor?.slice(0, 6))));

  const c2 = mk();
  c2.override = (n) => (n === 2 ? Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) : null);
  const r2 = await listAllOps(v2Store(c2), FAST);
  check('둘째 쪽 한 번 던짐(TimeoutError) → 다시 물어 성공', r2.ok && namesOf(r2).length === 900, reasonOf(r2));

  /* 끊김을 모르는 저장소 — listAllOps 자체의 기다림 한도 */
  const base = new FakeStore();
  base.pageCap = 2;
  seedMany(base, 5);
  let attempts = 0;
  const hanging: EvidenceObjectStore = {
    createOnly: (k, b) => base.createOnly(k, b),
    read: (k, m) => base.read(k, m),
    list: (cursor, limit) => {
      attempts++;
      return attempts === 2 ? new Promise<ListPageResult>(() => {}) : base.list(cursor, limit);
    },
  };
  const r3 = await listAllOps(hanging, { ...FAST, listTimeoutMs: 40 });
  check('저장소가 답하지 않는 쪽 한 번(기다림 한도) → 다시 물어 5개 모두', r3.ok && r3.items.length === 5 && attempts === 4, `${reasonOf(r3)} · 물음 ${attempts}`);

  const c4 = mk();
  c4.override = (n, _o, signal) => (n >= 2 ? hangUntilAbort(signal) : null);
  const r4 = await listAllOps(v2Store(c4, 30), FAST);
  check('둘째 쪽이 계속 시간 초과 → 전체 실패 unavailable(첫 쪽만 돌려주지 않음)', !r4.ok && r4.reason === 'unavailable' && !('items' in r4), reasonOf(r4));
  check('계속 시간 초과: 그 쪽은 정해진 만큼만 다시 물음(1 + 2번)', c4.calls.length === 1 + 3, String(c4.calls.length));

  const c5 = mk();
  c5.override = (n) => (n >= 2 ? Promise.resolve({ data: null, error: { name: 'StorageApiError', status: 500, statusCode: '500', message: 'internal' } }) : null);
  const r5 = await listAllOps(v2Store(c5), FAST);
  check('서버 오류 500 이 계속 → unavailable · 정해진 만큼만 다시 물음', !r5.ok && r5.reason === 'unavailable' && c5.calls.length === 4, `${reasonOf(r5)} · ${c5.calls.length}`);

  const c6 = mk();
  c6.override = (n) => (n === 1 ? Promise.resolve({ data: null, error: { name: 'StorageUnknownError', message: 'fetch failed: getaddrinfo ENOTFOUND abcd.supabase.co' } }) : null);
  const r6 = await listAllOps(v2Store(c6), FAST);
  check("이름 찾기 실패(ENOTFOUND)는 '없는 기능'이 아니라 잠시 못 닿음 → 다시 물어 성공", r6.ok && namesOf(r6).length === 900, reasonOf(r6));
}

section('목록 v2 — 약속을 어기는 서버 · 없는 기능은 전체 실패');
{
  const mk = () => {
    const c = new FakeListV2Client();
    c.cap = 100;
    for (let i = 0; i < 350; i++) c.names.add(hexName(30_000 + i));
    return c;
  };
  const sorted = (c: FakeListV2Client) => [...c.names].sort(cmpName);
  const page = (c: FakeListV2Client, items: string[], extra: Record<string, unknown>): Promise<V2Response> =>
    Promise.resolve({ data: { hasNext: true, folders: [], objects: items.map((x) => c.obj(x)), ...extra }, error: null });
  const cases: [string, (c: FakeListV2Client) => FakeListV2Client['override'], LoadFailure][] = [
    ['다음 쪽 표를 무시하고 같은 쪽 · 같은 표를 다시 줌', (c) => (n) => (n >= 2 ? page(c, sorted(c).slice(0, 100), { nextCursor: encodeCursor(sorted(c)[99]) }) : null), 'inconsistent'],
    ['다음 쪽 표를 무시하고 같은 쪽 · 새 표를 줌', (c) => (n) => (n >= 2 ? page(c, sorted(c).slice(0, 100), { nextCursor: `fresh-${n}` }) : null), 'inconsistent'],
    ['다음 쪽이 있다면서 표가 없음', (c) => (n) => (n === 1 ? page(c, sorted(c).slice(0, 100), {}) : null), 'inconsistent'],
    ['다음 쪽이 있다면서 빈 표', (c) => (n) => (n === 1 ? page(c, sorted(c).slice(0, 100), { nextCursor: '' }) : null), 'inconsistent'],
    ['쪽 안의 이름이 거꾸로', (c) => (n) => (n === 1 ? page(c, sorted(c).slice(0, 100).reverse(), { nextCursor: encodeCursor(sorted(c)[99]) }) : null), 'inconsistent'],
    ['쪽 안에 같은 이름 두 번', (c) => (n) => (n === 1 ? page(c, [sorted(c)[0], sorted(c)[0], sorted(c)[1]], { nextCursor: encodeCursor(sorted(c)[1]) }) : null), 'inconsistent'],
    ['다음 쪽이 앞 쪽보다 작은 이름부터', (c) => (n) => (n === 2 ? page(c, sorted(c).slice(50, 150), { nextCursor: encodeCursor(sorted(c)[149]) }) : null), 'inconsistent'],
    [
      '자리 밖 열쇠(key 가 다른 폴더)',
      () => (n) => (n === 1 ? Promise.resolve({ data: { hasNext: false, folders: [], objects: [{ name: 'x.json', key: 'other/x.json', metadata: null }] }, error: null }) : null),
      'unexpected',
    ],
    [
      '자리 밖 열쇠(버킷 맨 위 · 경로에 / 없음)',
      () => (n) => (n === 1 ? Promise.resolve({ data: { hasNext: false, folders: [], objects: [{ name: `${'b'.repeat(64)}.json`, key: `${'b'.repeat(64)}.json`, metadata: null }] }, error: null }) : null),
      'unexpected',
    ],
    [
      '자리 밖 열쇠(같은 이름으로 시작하는 옆 폴더)',
      () => (n) => (n === 1 ? Promise.resolve({ data: { hasNext: false, folders: [], objects: [{ name: 'x.json', key: 'review-evidence/v1/ops-old/x.json', metadata: null }] }, error: null }) : null),
      'unexpected',
    ],
    ['폴더 칸이 비지 않음', (c) => (n) => (n === 1 ? page(c, sorted(c).slice(0, 3), { hasNext: false, folders: [{ name: 'sub' }] }) : null), 'unexpected'],
    [
      '하위 폴더 안의 객체(이름에 /)',
      () => (n) => (n === 1 ? Promise.resolve({ data: { hasNext: false, folders: [], objects: [{ name: `${LIST_V2_PREFIX}sub/${'a'.repeat(64)}.json`, metadata: null }] }, error: null }) : null),
      'unexpected',
    ],
    [
      '한 쪽에 전체 경로와 짧은 이름이 섞임',
      (c) => (n) =>
        n === 1
          ? Promise.resolve({ data: { hasNext: false, folders: [], objects: [{ name: LIST_V2_PREFIX + sorted(c)[0], metadata: null }, { name: sorted(c)[1], metadata: null }] }, error: null })
          : null,
      'unexpected',
    ],
    ['응답 모양이 틀림(objects 없음)', () => (n) => (n === 1 ? Promise.resolve({ data: { hasNext: false, folders: [] }, error: null }) : null), 'unexpected'],
  ];
  for (const [name, mkOverride, want] of cases) {
    const c = mk();
    c.override = mkOverride(c);
    const r = await listAllOps(v2Store(c), FAST);
    check(`${name} → ${want}(일부만 돌려주지 않음)`, !r.ok && r.reason === want && c.v1Calls === 0, `${reasonOf(r)} · 물음 ${c.calls.length}`);
  }

  for (const [label, err] of [
    ['404 · 경로 없음', { name: 'StorageApiError', status: 404, statusCode: '404', message: 'Route POST:/object/list-v2/pitch-videos not found' }],
    ['HTTP 400 에 본문 statusCode 404', { name: 'StorageApiError', status: 400, statusCode: '404', message: 'not found' }],
    ['405', { name: 'StorageApiError', status: 405, statusCode: '405', message: 'Method Not Allowed' }],
    ['501', { name: 'StorageApiError', status: 501, statusCode: '501', message: 'Not Implemented' }],
  ] as [string, Record<string, unknown>][]) {
    const c = mk();
    c.override = () => Promise.resolve({ data: null, error: err });
    const r = await listAllOps(v2Store(c), FAST);
    check(`목록 v2 없음(${label}) → unsupported · 다시 묻지 않음 · 옛 목록(v1)으로 돌아가지 않음`, !r.ok && r.reason === 'unsupported' && c.calls.length === 1 && c.v1Calls === 0, `${reasonOf(r)} · 물음 ${c.calls.length} · v1 ${c.v1Calls}`);
  }
  const thrown404 = mk();
  thrown404.override = () => Promise.reject(Object.assign(new Error('Route POST:/object/list-v2/pitch-videos not found'), { status: 404, statusCode: '404' }));
  const rt = await listAllOps(v2Store(thrown404), FAST);
  check('던진 404(오류를 던지는 설정) → unsupported', !rt.ok && rt.reason === 'unsupported' && thrown404.v1Calls === 0, reasonOf(rt));

  const table: [string, unknown, boolean][] = [
    ['404 숫자', { status: 404 }, true],
    ['statusCode 501 글자', { statusCode: '501' }, true],
    ['경로 없음 글', { message: 'Route POST:/object/list-v2/b not found' }, true],
    ['500', { status: 500, message: 'internal' }, false],
    ['ENOTFOUND', { message: 'getaddrinfo ENOTFOUND host' }, false],
    ['TimeoutError', { name: 'TimeoutError', message: 'aborted' }, false],
    ['null', null, false],
  ];
  for (const [n, e, want] of table) check(`없는 기능 판정: ${n} → ${want}`, isListV2Unsupported(e) === want);
}

section('목록에 있었는데 읽을 때 없음 · 모양이 틀린 기록은 보이게');
{
  const s1 = new FakeStore();
  const ops1 = seedMany(s1, 6);
  const gone = opKey(ops1[3].opId);
  s1.readMissing.set(gone, Infinity);
  const r1 = await loadOps(s1, undefined, FAST);
  check('목록에 있던 기록을 끝내 못 읽음 → 전체 실패 inconsistent(조용히 빠지지 않음)', !r1.ok && r1.reason === 'inconsistent', reasonOf(r1));
  check('없음 → 잠시 뒤 한 번 더 읽음(그 열쇠 2번)', s1.readKeys.filter((k) => k === gone).length === 2, String(s1.readKeys.filter((k) => k === gone).length));
  const l1 = await loadLibrary(s1, undefined, FAST);
  check('loadLibrary 도 inconsistent', !l1.ok && l1.reason === 'inconsistent');

  const s2 = new FakeStore();
  const ops2 = seedMany(s2, 4);
  s2.readMissing.set(opKey(ops2[1].opId), 1);
  const r2 = await loadOps(s2, undefined, FAST);
  check('잠깐만 없음(한 번 더 읽으면 있음) → 성공 · 4개 모두', r2.ok && r2.ops.length === 4, reasonOf(r2));

  const s3 = new FakeStore();
  seedMany(s3, 2);
  s3.put(`${OP_FOLDER}/${'9'.repeat(64)}.json`, '{"schema":"review-evidence/v1/op"');
  const deps3: ApiDeps = { store: () => s3, cache: new Map(), storeKind: 'local-fixture', now: nextNow, write: FAST };
  const lr = await handleList(new Request('https://app.test/api/admin/review-evidence?view=summary', { headers: { host: 'app.test' } }), { id: 'owner_x', role: 'ADMIN' }, deps3);
  const lj = (await lr.json()) as { counts?: { skippedOps?: number; ops?: number } };
  check('모양이 틀린 기록은 skippedOps 로 API 에 보임(1) · 정상 기록 2', lr.status === 200 && lj.counts?.skippedOps === 1 && lj.counts?.ops === 2, JSON.stringify(lj.counts));

  /* 목록에 있던 기록을 읽는데 저장소가 끝내 답하지 않음(T5) — 기다림 한도 뒤 전체 실패, 그 기록만 빼고 성공하지 않는다 */
  const HANG = { ...FAST, readTimeoutMs: 40 };
  const sh = new FakeStore();
  const hops = seedMany(sh, 5);
  sh.readHang.add(opKey(hops[2].opId));
  const th0 = Date.now();
  const rh = await loadOps(sh, undefined, HANG);
  check('목록에 있던 기록 읽기가 멈춤 → loadOps 전체 실패 unavailable(조용히 빠지지 않음) · 빨리 끝남', !rh.ok && rh.reason === 'unavailable' && Date.now() - th0 < 2000, `${reasonOf(rh)} · ${Date.now() - th0}ms`);
  const lh = await loadLibrary(sh, undefined, HANG);
  check('읽기 멈춤 → loadLibrary 도 unavailable', !lh.ok && lh.reason === 'unavailable', reasonOf(lh));
  const hr = await handleList(new Request('https://app.test/api/admin/review-evidence', { headers: { host: 'app.test' } }), { id: 'owner_h', role: 'ADMIN' }, { store: () => sh, cache: new Map(), storeKind: 'local-fixture', now: nextNow, write: HANG });
  const hj = (await hr.json()) as Record<string, unknown>;
  check('읽기 멈춤 → API 목록 503 · reason unavailable · 그 글', hr.status === 503 && hj.error === 'unavailable' && hj.reason === 'unavailable' && hj.message === LIST_FAILURE_TEXT.unavailable, JSON.stringify(hj));

  /* 저장 뒤 다시 읽기가 멈춤 → '저장했는지 확인 못 함(readback)'. 저장됐다고(saved) 말하지 않는다 */
  const swh = new FakeStore();
  swh.readHang.add(opKey(opIdOf('register', ACTOR_A.userId, 'req-hang-rb-001')));
  const wh = await writeOp(swh, { kind: 'register', actor: ACTOR_A, requestKey: 'req-hang-rb-001', payload: reg({ use: { itemId: 'hang-rb' } }) }, nextNow(), undefined, HANG);
  check('만든 뒤 다시 읽기가 멈춤 → pending(readback) · saved 아님', wh.status === 'pending' && wh.reason === 'readback' && swh.objects.size === 1, JSON.stringify(wh));
}

/* ═══════════════ 5. 모으기(materialize) ═══════════════ */

section('모으기 · 같은 출처 묶기');
{
  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  /* (1) 지금 등록(register)이 적은 '공식 확인' · 번호는 묶지 않는다 — PMC 링크 + 적은 PMID 와 PubMed 링크는 따로 */
  const pmcClaimed = mkOp('register', ACTOR_A, 'req-mat-0001', reg({ source: { url: PMC, verifiedBy: 'ncbi', identifiers: { pmid: '12345678', pmcid: 'PMC7654321' } }, use: { itemId: 'm1' } }), t(1));
  const pubmedPlain = mkOp('register', ACTOR_B, 'req-mat-0002', reg({ source: { url: PUBMED }, use: { itemId: 'm2', domain: 'mechanics' } }), t(2));
  const lib1 = materialize([pmcClaimed, pubmedPlain]);
  check('등록이 적은 verifiedBy · PMID 로는 PMC 와 PubMed 를 묶지 않음 → 출처 2개', lib1.sources.length === 2, String(lib1.sources.length));
  const claimedSrc = lib1.sources.find((s) => s.primaryHref === PMC);
  const pubmedSrc = lib1.sources.find((s) => s.primaryHref === PUBMED);
  check('등록이 공식 확인이라 적은 출처: metadataStatus claimed', claimedSrc?.metadataStatus === 'claimed', String(claimedSrc?.metadataStatus));
  check('등록이 적은 번호는 보여 주기만(PMID 표시)', !!claimedSrc?.identifiers.pmid.includes('12345678') && !!claimedSrc?.identifiers.pmcid.includes('PMC7654321'));
  check('사람이 서지만 넣은 출처: metadataStatus entered', pubmedSrc?.metadataStatus === 'entered', String(pubmedSrc?.metadataStatus));
  check('등록 PMC 출처의 다른 번호(aliasIds)에 PubMed 열쇠가 없음', !!claimedSrc && !!pubmedSrc && !claimedSrc.aliasIds.includes(pubmedSrc.id) && claimedSrc.id !== pubmedSrc.id);
  const pmcAlt = mkOp('register', ACTOR_A, 'req-mat-0012', reg({ source: { url: 'https://journal-site.org/p/alt', verifiedBy: 'publisher-page', altUrls: [PUBMED] }, use: { itemId: 'm3' } }), t(3));
  check('등록이 적은 다른 링크(altUrls)로도 묶지 않음', materialize([pmcAlt, pubmedPlain]).sources.length === 2);
  const bare = mkOp('register', ACTOR_A, 'req-mat-0013', reg({ source: { url: 'https://journal-site.org/p/bare', title: undefined, authors: undefined, container: undefined, year: undefined }, use: { itemId: 'm4' } }), t(4));
  check('서지 없이 링크만 → metadataStatus unverified', materialize([bare]).sources[0]?.metadataStatus === 'unverified', String(materialize([bare]).sources[0]?.metadataStatus));

  const pmcPlain = mkOp('register', ACTOR_A, 'req-mat-0003', reg({ source: { url: PMC, identifiers: { pmid: '12345678', pmcid: 'PMC7654321' } }, use: { itemId: 'm1' } }), t(1));
  const lib2 = materialize([pmcPlain, pubmedPlain]);
  check('공식 확인 없이 적은 번호는 묶지 않음 → 출처 2개', lib2.sources.length === 2, String(lib2.sources.length));

  /* (2) 과거 가져오기(import)의 공식 서지 번호는 묶는다 — 그 뒤 지금 등록한 PMC 링크도 링크 모양의 PMCID 로 같은 출처에 붙는다 */
  const impVerified = mkOp(
    'import',
    ACTOR_A,
    'imp-mat-verified-1',
    imp([impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', identifiers: { pmid: '12345678', pmcid: 'PMC7654321' }, title: 'Official Title' } })]),
    t(5),
  );
  const libImp = materialize([impVerified, pubmedPlain]);
  check('가져오기 공식 확인 + PubMed 등록 → 출처 1개 · 공식 확인 상태', libImp.sources.length === 1 && libImp.sources[0].metadataStatus === 'verified', `${libImp.sources.length} ${libImp.sources[0]?.metadataStatus}`);
  const livePmc = mkOp('register', ACTOR_B, 'req-mat-0014', reg({ source: { url: PMC, title: undefined }, use: { itemId: 'm5' } }), t(6));
  const libJoin = materialize([impVerified, pubmedPlain, livePmc]);
  check('그 뒤 지금 등록한 PMC 링크(번호 안 적음)도 링크 모양 PMCID 로 같은 출처', libJoin.sources.length === 1 && libJoin.sources[0].uses.length === 3, `${libJoin.sources.length} 출처 · ${libJoin.sources[0]?.uses.length} 쓰임`);
  check('묶인 출처: 번호 PMID · PMCID 둘 다 · 링크 2개', !!libJoin.sources[0]?.identifiers.pmid.includes('12345678') && !!libJoin.sources[0]?.identifiers.pmcid.includes('PMC7654321') && libJoin.sources[0]?.links.length === 2);
  check('묶인 출처의 제목은 가져오기의 공식 제목', libJoin.sources[0]?.title === 'Official Title', String(libJoin.sources[0]?.title));
  const impVerifiedAlt = mkOp(
    'import',
    ACTOR_A,
    'imp-mat-verified-2',
    imp([impRecord({ source: { url: 'https://journal-site.org/p/official', verifiedBy: 'publisher-page', altUrls: ['https://other-journal.org/mirror/1'] } })]),
    t(7),
  );
  const mirrorLive = mkOp('register', ACTOR_A, 'req-mat-0015', reg({ source: { url: 'https://other-journal.org/mirror/1' }, use: { itemId: 'm6' } }), t(8));
  check('가져오기 공식 확인의 다른 링크(altUrls)는 묶음', materialize([impVerifiedAlt, mirrorLive]).sources.length === 1);
  const impUnverified = mkOp('import', ACTOR_A, 'imp-mat-unverif-1', imp([impRecord({ source: { url: 'https://journal-site.org/p/u1', identifiers: { pmid: '12345678' } } })]), t(9));
  check('가져오기라도 공식 확인이 없으면 적은 번호로 묶지 않음', materialize([impUnverified, pubmedPlain]).sources.length === 2);

  /* (3) SEC-2: 등록이 기존 공식 확인 자료의 PMID 를 잘못 적어도 합치거나 제목을 바꾸지 않는다 */
  const realPub = 'https://pubmed.ncbi.nlm.nih.gov/11111111/';
  const realImp = mkOp('import', ACTOR_A, 'imp-sec2-real-01', imp([impRecord({ source: { url: realPub, verifiedBy: 'ncbi', identifiers: { pmid: '11111111' }, title: 'Real Title A' } })]), t(10));
  const forgedReg = mkOp(
    'register',
    ACTOR_B,
    'req-sec2-forge1',
    reg({ source: { url: 'https://unrelated-journal.org/x', verifiedBy: 'publisher-page', identifiers: { pmid: '11111111' }, title: 'Wrong Title B' }, use: { reviewId: 'rev-r2' } }),
    t(11),
  );
  const sec2 = materialize([realImp, forgedReg]);
  const realSrc = sec2.sources.find((s) => s.links.some((l) => l.href === realPub));
  check('SEC-2: 다른 링크가 같은 PMID 를 적어도 출처 2개', sec2.sources.length === 2, String(sec2.sources.length));
  check('SEC-2: 공식 확인 자료의 제목 · 대표 링크 그대로', realSrc?.title === 'Real Title A' && realSrc?.primaryHref === realPub && realSrc.uses.length === 1, `${realSrc?.title} ${realSrc?.primaryHref}`);
  const samePageWrong = mkOp('register', ACTOR_B, 'req-sec2-forge2', reg({ source: { url: realPub, verifiedBy: 'ncbi', title: 'Wrong Title C' }, use: { reviewId: 'rev-r3' } }), t(12));
  for (const order of [
    [realImp, samePageWrong],
    [samePageWrong, realImp],
  ] as Op[][]) {
    const m = materialize(order);
    check(
      `SEC-2: 같은 PubMed 링크에 틀린 제목을 '공식 확인'으로 등록해도 제목은 가져오기의 공식 값(${order[0] === realImp ? '가져오기 먼저' : '등록 먼저'})`,
      m.sources.length === 1 && m.sources[0].title === 'Real Title A' && m.sources[0].metadataStatus === 'verified',
      `${m.sources.length} ${m.sources[0]?.title}`,
    );
  }

  const doi1 = mkOp('register', ACTOR_A, 'req-mat-0004', reg({ source: { url: 'https://doi.org/10.1080/ABC.2020.12' }, use: { itemId: 'd1' } }), t(3));
  const doi2 = mkOp('register', ACTOR_B, 'req-mat-0005', reg({ source: { url: 'https://dx.doi.org/10.1080/abc.2020.12' }, use: { itemId: 'd2' } }), t(4));
  const lib3 = materialize([doi1, doi2]);
  check('doi.org · dx.doi.org 같은 DOI → 출처 1개', lib3.sources.length === 1 && lib3.sources[0].uses.length === 2);

  const slash1 = mkOp('register', ACTOR_A, 'req-mat-0006', reg({ source: { url: 'https://journal-site.org/paper/1/?b=2&a=1' }, use: { itemId: 's1' } }), t(5));
  const slash2 = mkOp('register', ACTOR_A, 'req-mat-0007', reg({ source: { url: 'https://journal-site.org/paper/1?a=1&b=2&utm_source=x' }, use: { itemId: 's2' } }), t(6));
  check('정규화 링크가 같으면 묶음', materialize([slash1, slash2]).sources.length === 1);
  const title1 = mkOp('register', ACTOR_A, 'req-mat-0008', reg({ source: { url: 'https://journal-site.org/p/1', title: '같은 제목' }, use: { itemId: 't1' } }), t(7));
  const title2 = mkOp('register', ACTOR_A, 'req-mat-0009', reg({ source: { url: 'https://other-journal.org/p/9', title: '같은 제목' }, use: { itemId: 't2' } }), t(8));
  check('제목만 같으면 묶지 않음', materialize([title1, title2]).sources.length === 2);

  /* 예전 번호로 찾기: DOI 하나만 있을 때의 번호 → PubMed(공식 DOI 확인)와 묶인 뒤에도 찾음 */
  const doiOnly = mkOp('register', ACTOR_A, 'req-mat-0010', reg({ source: { url: 'https://doi.org/10.5555/fake.1' }, use: { itemId: 'a1' } }), t(9));
  const oldId = materialize([doiOnly]).sources[0].id;
  const pubWithDoi = mkOp('import', ACTOR_B, 'imp-mat-0011-chunk', imp([impRecord({ source: { url: 'https://pubmed.ncbi.nlm.nih.gov/22222222/', verifiedBy: 'ncbi', identifiers: { doi: '10.5555/fake.1' } }, use: { itemId: 'a2' } })]), t(10));
  const merged = materialize([doiOnly, pubWithDoi]);
  const found = findSource(merged, oldId);
  check('묶이기 전 번호로도 같은 출처를 찾음(aliasIds)', merged.sources.length === 1 && !!found && found.id === merged.sources[0].id && found.id !== oldId);
  check('지금 번호로도 찾음', findSource(merged, merged.sources[0].id)?.id === merged.sources[0].id);
  check('없는 번호는 null', findSource(merged, 'src_000000000000000000000000') === null);

  check('locateOp: 그 기록의 출처 · 쓰임', locateOp(lib1, pubmedPlain.opId).length === 1 && locateOp(lib1, pubmedPlain.opId)[0].sourceId === pubmedSrc?.id);
  check('citationsByOp: 기록마다 1', lib1.citationsByOp[pmcClaimed.opId] === 1 && lib1.citationsByOp[pubmedPlain.opId] === 1);
  const impOp = mkOp('import', ACTOR_A, 'imp-mat-chunk-01', imp([impRecord(), impRecord({ use: { itemId: 'drill-2' } })]), t(11));
  check('citationsByOp: 가져오기 묶음은 줄 수만큼', materialize([impOp]).citationsByOp[impOp.opId] === 2);
}

section('모으기 · 같은 쓰임의 고침 · 쓰임 나누기');
{
  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  const v1 = mkOp('register', ACTOR_A, 'req-rev-00001', reg({ use: { consultedOn: '2026-11-10', reading: 'full-text', limitationsKo: '대상이 성인이에요.' } }), t(1));
  const v2 = mkOp(
    'register',
    ACTOR_A,
    'req-rev-00002',
    reg({ source: { url: 'https://pubmed.ncbi.nlm.nih.gov/12345678' }, use: { consultedOn: '2026-11-01', reading: undefined, limitationsKo: undefined, applicationKo: '고친 적용 내용이에요.' } }),
    t(2),
  );
  const lib = materialize([v1, v2]);
  const u = allUses(lib);
  check('같은 쓴 사람 · 검수 · 항목 · 쓴 곳 · 링크 → 쓰임 1개', u.length === 1, String(u.length));
  check('확인일은 되돌아가지 않음(늦은 기록의 이른 날짜 무시)', u[0]?.consultedOn === '2026-11-10' && u[0]?.firstConsultedOn === '2026-11-01', `${u[0]?.consultedOn} / ${u[0]?.firstConsultedOn}`);
  check('읽은 범위 unknown 은 앞의 값을 지우지 않음', u[0]?.reading === 'full-text');
  check('빈 한계 글은 앞의 글을 지우지 않음', u[0]?.limitationsKo === '대상이 성인이에요.');
  check('적용 글은 가장 늦은 값', u[0]?.applicationKo === '고친 적용 내용이에요.');
  check('고친 횟수 2 · 이력 2', u[0]?.revisions === 2 && u[0]?.history.length === 2 && u[0]?.history[0].opId === v1.opId);

  /* 과거 기록: 늦은 기록의 빈 적용 글은 앞을 지우지 않음 */
  const h1 = mkOp('import', ACTOR_A, 'imp-rev-chunk-01', imp([impRecord({ use: { applicationKo: '처음 적은 적용 글이에요.', limitationsKo: '처음 한계예요.' } })]), t(3));
  const h2 = mkOp('import', ACTOR_A, 'imp-rev-chunk-02', imp([impRecord({ use: { applicationKo: null, limitationsKo: null }, historical: { origins: ['mechanics-handoff'] } })]), t(4));
  const hl = materialize([h1, h2]);
  const hu = allUses(hl);
  check('과거 기록 같은 쓰임 → 1개', hu.length === 1);
  check('과거 기록: 빈 적용 글이 앞의 글을 지우지 않음', hu[0]?.applicationKo === '처음 적은 적용 글이에요.' && hu[0]?.limitationsKo === '처음 한계예요.');
  check('과거 기록: 가져온 곳은 합집합', hu[0]?.historical?.origins.join(',') === 'mechanics-handoff,mechanics-record', hu[0]?.historical?.origins.join(','));
  check('과거 기록: 확인일은 null 그대로', hu[0]?.consultedOn === null && hu[0]?.reading === 'unknown');

  const byA = mkOp('register', ACTOR_A, 'req-two-00001', reg(), t(5));
  const byB = mkOp('register', ACTOR_B, 'req-two-00002', reg({ use: { applicationKo: '다른 사람이 적은 글이에요.' } }), t(6));
  const two = allUses(materialize([byA, byB]));
  check('다른 계정 · 같은 검수/항목/쓴 곳/링크 → 쓰임 2개(덮지 않음)', two.length === 2 && new Set(two.map((x) => x.applicationKo)).size === 2);

  const live = mkOp('register', ACTOR_A, 'req-live-0001', reg({ use: { domain: 'mechanics', reviewId: 'rev-me-01', itemId: 'drill-1', purpose: 'mechanism' } }), t(7));
  const hist = mkOp('import', ACTOR_A, 'imp-live-chunk-1', imp([impRecord()]), t(8));
  const lh = allUses(materialize([live, hist]));
  check('과거 기록 쓰임과 지금 쓰임은 따로', lh.length === 2 && lh.some((x) => x.scope === 'user') && lh.some((x) => x.scope === 'historical'));
  check('과거 기록 쓰임의 쓴 사람 표시', lh.find((x) => x.scope === 'historical')?.reviewerLabel === '금윤호(과거 기록)');

  /* 차례를 섞어도 같은 결과 */
  const all: Op[] = [
    v1,
    v2,
    h1,
    h2,
    byA,
    byB,
    live,
    hist,
    mkOp('register', ACTOR_B, 'req-mix-00001', reg({ source: { url: PMC, verifiedBy: 'ncbi', identifiers: { pmid: '12345678', pmcid: 'PMC7654321' } }, use: { itemId: 'mix' } }), t(9)),
    mkOp('register', ACTOR_A, 'req-mix-00002', reg({ source: { url: 'https://doi.org/10.1080/abc.2020.12' }, use: { itemId: 'mix2' } }), t(10)),
    mkOp('register', ACTOR_A, 'req-mix-00003', reg({ source: { url: 'https://journal-site.org/x' }, use: { itemId: 'mix3' } }), t(10)),
  ];
  const base = materialize(all, 2);
  let rng = 12345;
  const rand = () => ((rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let allSame = true;
  let firstDiff = '';
  for (let k = 0; k < 12; k++) {
    const sh = [...all];
    for (let i = sh.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [sh[i], sh[j]] = [sh[j], sh[i]];
    }
    try {
      deepStrictEqual(materialize(sh, 2), base);
    } catch (e) {
      allSame = false;
      firstDiff = String(e).slice(0, 200);
      break;
    }
  }
  check('기록 차례를 12번 섞어도 결과가 똑같음', allSame, firstDiff);
  check('skippedOps 가 그대로 실림', base.skippedOps === 2 && base.opCount === all.length);
}

section('모으기 · 늦게 다시 보낸 옛 요청(CI-1) · 쓴 사람 쪽 시각');
{
  const T_OLD = '2026-11-16T01:00:00.000Z';
  const T_NEW = '2026-11-16T02:00:00.000Z';
  const store = new FakeStore();
  /* 고친 요청이 먼저 저장되고(받은 때 앞), 대기열에 남았던 옛 요청이 뒤에 다시 보내져 저장됨(받은 때 뒤 · 쓴 때 앞) */
  const newer = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-ci1-new-01', payload: reg({ use: { applicationKo: '고친 적용 내용이에요.', notedAt: T_NEW } }) }, nextNow());
  const older = await writeOp(store, { kind: 'register', actor: ACTOR_A, requestKey: 'req-ci1-old-01', payload: reg({ use: { applicationKo: '옛 적용 내용이에요.', notedAt: T_OLD } }) }, nextNow());
  check('CI-1: 두 요청 모두 saved', newer.status === 'saved' && older.status === 'saved');
  const lib = await loadLibrary(store);
  const u = lib.ok ? allUses(lib.library) : [];
  check('CI-1: 같은 쓰임 하나 · 기록 2', u.length === 1 && u[0].revisions === 2, `${u.length} · ${u[0]?.revisions}`);
  check('CI-1: 늦게 받은 옛 요청이 뒤의 고침을 덮지 않음', u[0]?.applicationKo === '고친 적용 내용이에요.', String(u[0]?.applicationKo));
  check('CI-1: 받은 때 기록은 그대로(가장 늦은 받은 때 = 옛 요청)', older.status === 'saved' && u[0]?.lastReceivedAt === older.receipt.receivedAt);

  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  const a = mkOp('register', ACTOR_A, 'req-ci1-null-01', reg({ use: { applicationKo: '먼저 받은 글이에요.' } }), t(1));
  const b = mkOp('register', ACTOR_A, 'req-ci1-null-02', reg({ use: { applicationKo: '나중에 받은 글이에요.' } }), t(2));
  check('notedAt 이 없으면 받은 때 차례(나중 값)', allUses(materialize([b, a]))[0]?.applicationKo === '나중에 받은 글이에요.');
  const n1 = mkOp('register', ACTOR_A, 'req-ci1-nt-001', reg({ use: { applicationKo: '쓴 때 늦은 글이에요.', notedAt: t(50) } }), t(5));
  const n2 = mkOp('register', ACTOR_A, 'req-ci1-nt-002', reg({ use: { applicationKo: '쓴 때 이른 글이에요.', notedAt: t(40), limitationsKo: undefined } }), t(6));
  const nu = allUses(materialize([n1, n2]))[0];
  check('쓴 때 차례: 늦게 쓴 글이 이김', nu?.applicationKo === '쓴 때 늦은 글이에요.', String(nu?.applicationKo));
  check('쓴 때 차례: 이력은 받은 때 차례 그대로', nu?.history[0].opId === n1.opId && nu?.history[1].opId === n2.opId);
}

section('모으기 · 쓰임의 정체(같은 자료의 다른 링크)');
{
  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  const ids = { pmid: '12345678', pmcid: 'PMC7654321' };
  const both = mkOp(
    'import',
    ACTOR_A,
    'imp-ident-chunk-01',
    imp([impRecord({ source: { url: PMC, verifiedBy: 'ncbi', identifiers: ids } }), impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', identifiers: ids } })]),
    t(1),
  );
  const lib = materialize([both]);
  const u = allUses(lib);
  check('가져오기의 PMC · PubMed(같은 공식 자료 · 같은 검수/항목/쓴 곳) → 출처 1 · 쓰임 1', lib.sources.length === 1 && u.length === 1, `${lib.sources.length} · ${u.length}`);
  check('한 쓰임에 다른 링크(otherHrefs) 1개 · 기록 2', u[0]?.otherHrefs.length === 1 && [u[0].href, ...u[0].otherHrefs].sort().join(' ') === [PMC, PUBMED].sort().join(' ') && u[0].revisions === 2, JSON.stringify(u[0] && { href: u[0].href, other: u[0].otherHrefs, rev: u[0].revisions }));
  check('같은 쓰임으로 센 수: 쓰임 수 1', lib.useCount === 1 && lib.sources[0].useCounts.mechanics === 1);
  const twoPurposes = mkOp(
    'import',
    ACTOR_A,
    'imp-ident-chunk-02',
    imp([impRecord({ source: { url: PMC, verifiedBy: 'ncbi', identifiers: ids } }), impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', identifiers: ids }, use: { purpose: 'safety' } })]),
    t(2),
  );
  check('쓴 곳이 다르면 쓰임 2', allUses(materialize([twoPurposes])).length === 2);
  const otherReviewer = mkOp(
    'import',
    ACTOR_A,
    'imp-ident-chunk-03',
    imp([impRecord({ source: { url: PMC, verifiedBy: 'ncbi', identifiers: ids } }), impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', identifiers: ids }, historical: { reviewer: 'kimmin' } })]),
    t(3),
  );
  check('과거 검수자가 다르면 쓰임 2', allUses(materialize([otherReviewer])).length === 2);
  const noVerify = mkOp('import', ACTOR_A, 'imp-ident-chunk-04', imp([impRecord({ source: { url: PMC } }), impRecord({ source: { url: PUBMED } })]), t(4));
  const nv = materialize([noVerify]);
  check('공식 확인 없는 PMC · PubMed 는 출처 2 · 쓰임 2', nv.sources.length === 2 && allUses(nv).length === 2);

  /* 참고: 지금 등록한 PubMed · PMC 두 링크는(같은 공식 자료로 묶인 뒤에도) 각 인용의 가장 강한 열쇠가 PMID · PMCID 로 달라 쓰임 2 */
  const liveA = mkOp('register', ACTOR_A, 'req-ident-live1', reg({ source: { url: PUBMED }, use: { domain: 'mechanics', reviewId: 'rev-me-01', itemId: 'drill-1', purpose: 'mechanism' } }), t(5));
  const liveB = mkOp('register', ACTOR_A, 'req-ident-live2', reg({ source: { url: PMC }, use: { domain: 'mechanics', reviewId: 'rev-me-01', itemId: 'drill-1', purpose: 'mechanism' } }), t(6));
  const liveLib = materialize([both, liveA, liveB]);
  console.log(`  참고: 같은 사람이 지금 등록한 PubMed · PMC 링크(같은 검수 · 쓴 곳, 공식 자료로 묶인 출처) → 지금 쓰임 ${liveLib.sources.flatMap((s) => s.uses).filter((x) => x.scope === 'user').length}개 · 출처 ${liveLib.sources.length}개`);
}

section('모으기 · 서지 칸의 등급(CI-5)');
{
  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  const entered = mkOp('register', ACTOR_A, 'req-tier-00001', reg({ source: { title: 'Entered Title', authors: ['Kim A'], container: 'Entered Journal', year: 2019 } }), t(1));
  const verifiedNoTitle = mkOp(
    'import',
    ACTOR_A,
    'imp-tier-chunk-01',
    imp([impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', identifiers: { pmid: '12345678' }, title: null, year: 2021 } })]),
    t(2),
  );
  for (const order of [
    [entered, verifiedNoTitle],
    [verifiedNoTitle, entered],
  ] as Op[][]) {
    const s = materialize(order).sources;
    const tag = order[0] === entered ? '등록 먼저' : '가져오기 먼저';
    check(`제목 없는 공식 확인 가져오기가 사람이 넣은 제목을 지우지 않음(${tag})`, s.length === 1 && s[0].title === 'Entered Title' && s[0].metadataStatus === 'verified', `${s[0]?.title} ${s[0]?.metadataStatus}`);
    check(`칸마다: 저자 · 학술지는 넣은 값, 연도는 공식 값(${tag})`, s[0]?.authors.join(',') === 'Kim A' && s[0]?.container === 'Entered Journal' && s[0]?.year === 2021, JSON.stringify(s[0] && { a: s[0].authors, c: s[0].container, y: s[0].year }));
  }
  const verifiedTitle = mkOp('import', ACTOR_A, 'imp-tier-chunk-02', imp([impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', title: 'Verified Title' } })]), t(3));
  const enteredLater = mkOp('register', ACTOR_B, 'req-tier-00002', reg({ source: { title: 'Later Entered Title' } }), t(4));
  check('공식 확인 제목이 있으면 그 뒤에 사람이 넣은 제목보다 앞섬', materialize([entered, verifiedTitle, enteredLater]).sources[0]?.title === 'Verified Title');
  const claimedLater = mkOp('register', ACTOR_B, 'req-tier-00003', reg({ source: { title: 'Claimed Title', verifiedBy: 'ncbi' } }), t(5));
  check('등록이 공식 확인이라 적은 제목도 가져오기의 공식 제목보다 뒤', materialize([verifiedTitle, claimedLater]).sources[0]?.title === 'Verified Title');
  check('등록 사이에서는: 공식 확인이라 적은 제목이 사람이 넣은 제목보다 앞섬(claimed)', (() => {
    const s = materialize([claimedLater, enteredLater]).sources[0];
    return s?.title === 'Claimed Title' && s.metadataStatus === 'claimed';
  })());

  /* 분류 · 요약: 지금 등록한 값이 가져오기 값보다 먼저(받은 차례와 상관없이) */
  const impKind = (s: number, key: string) =>
    mkOp(
      'import',
      ACTOR_A,
      key,
      imp([impRecord({ source: { url: PUBMED, verifiedBy: 'ncbi', kind: 'original-research', summaryKo: '가져온 요약이에요.', summaryBasis: 'review-notes' } })]),
      t(s),
    );
  const live = mkOp('register', ACTOR_A, 'req-tier-kind-1', reg(), t(10));
  for (const [name, ops] of [
    ['가져오기가 뒤', [live, impKind(20, 'imp-tier-kind-c1')]],
    ['가져오기가 앞', [impKind(1, 'imp-tier-kind-c2'), live]],
  ] as [string, Op[]][]) {
    const s = materialize(ops).sources[0];
    check(`분류 · 요약은 지금 등록한 값(${name})`, s?.kind === 'systematic-review' && s?.summaryKo === '가짜 연구를 짧게 요약했어요.' && s?.summaryBasis === 'abstract', JSON.stringify(s && { k: s.kind, sum: s.summaryKo }));
  }
  const onlyImp = materialize([impKind(1, 'imp-tier-kind-c3')]).sources[0];
  check('지금 등록이 없으면 가져오기의 분류 · 요약', onlyImp?.kind === 'original-research' && onlyImp?.summaryKo === '가져온 요약이에요.');
  const liveNoKind = mkOp('register', ACTOR_A, 'req-tier-kind-2', reg({ source: { kind: undefined, summaryKo: undefined, summaryBasis: undefined } }), t(30));
  const mixed = materialize([impKind(1, 'imp-tier-kind-c4'), live, liveNoKind]).sources[0];
  check('늦은 등록의 빈 분류 · 요약은 앞의 등록 값을 지우지 않음', mixed?.kind === 'systematic-review' && mixed?.summaryKo === '가짜 연구를 짧게 요약했어요.');
}

section('모으기 · 쓰임 거두기(withdraw)');
{
  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  const regA = mkOp('register', ACTOR_A, 'req-wd-reg-0001', reg({ use: { itemId: 'w1' } }), t(1));
  const useId = allUses(materialize([regA]))[0].useId;
  const wA = mkOp('withdraw', ACTOR_A, 'req-wd-a-00001', wd(useId), t(2));
  const l1 = materialize([regA, wA]);
  const s1 = l1.sources[0];
  const u1 = s1?.uses[0];
  check('내 쓰임 거둠: withdrawn 표시(지우지 않음)', s1?.uses.length === 1 && !!u1?.withdrawn && u1.withdrawn.opId === wA.opId && u1.withdrawn.reasonKo === '잘못 등록해서 거둬요.' && u1.withdrawn.byLabel === ACTOR_A.label, JSON.stringify(u1?.withdrawn));
  check('거둔 쓰임은 세지 않음: useCounts 0 · useCount 0 · withdrawnCount 1 · withdrawnUses 1', s1?.useCounts.exercise === 0 && l1.useCount === 0 && l1.withdrawnCount === 1 && s1.withdrawnUses === 1, JSON.stringify({ c: s1?.useCounts, u: l1.useCount, w: l1.withdrawnCount }));
  check('거둔 쓰임은 최근 확인일 · 분야에서 빠짐', s1?.latestConsultedOn === null && s1?.latestByDomain.exercise === null && s1?.domains.length === 0);
  check('거두기 기록도 화면 위치를 찾음(locateOp · citationsByOp 1)', locateOp(l1, wA.opId).length === 1 && locateOp(l1, wA.opId)[0].useId === useId && l1.citationsByOp[wA.opId] === 1);
  check('거둔 쓰임 · 거두기 무시 0', l1.ignoredWithdrawals === 0);

  const revive = mkOp('register', ACTOR_A, 'req-wd-reg-0002', reg({ use: { itemId: 'w1', applicationKo: '다시 확인하고 쓴 글이에요.' } }), t(3));
  const l2 = materialize([regA, wA, revive]);
  const u2 = allUses(l2)[0];
  check('거둔 뒤 다시 등록(뒤 시각) → 다시 살아남', allUses(l2).length === 1 && u2.withdrawn === null && l2.useCount === 1 && l2.withdrawnCount === 0 && u2.applicationKo === '다시 확인하고 쓴 글이에요.');
  const staleRetry = mkOp('register', ACTOR_A, 'req-wd-reg-0003', reg({ use: { itemId: 'w1', notedAt: t(1) } }), t(4));
  check('거둔 뒤에 받았지만 쓴 때가 거두기보다 앞인 옛 요청 → 계속 거둔 상태', !!allUses(materialize([regA, wA, staleRetry]))[0].withdrawn);

  const wB = mkOp('withdraw', ACTOR_B, 'req-wd-b-00001', wd(useId), t(2));
  const l3 = materialize([regA, wB]);
  check('다른 계정의 거두기 → 무시(ignoredWithdrawals 1) · 효과 없음', l3.ignoredWithdrawals === 1 && allUses(l3)[0].withdrawn === null && l3.useCount === 1 && l3.citationsByOp[wB.opId] === undefined, JSON.stringify({ ig: l3.ignoredWithdrawals, u: l3.useCount }));
  const wUnknown = mkOp('withdraw', ACTOR_A, 'req-wd-unk-0001', wd('use_' + '0'.repeat(24)), t(2));
  const l4 = materialize([regA, wUnknown]);
  check('없는 쓰임 번호 거두기 → 무시', l4.ignoredWithdrawals === 1 && l4.useCount === 1 && locateOp(l4, wUnknown.opId).length === 0);
  const wEarly = mkOp('withdraw', ACTOR_A, 'req-wd-early-001', wd(useId), t(0));
  check('쓰임보다 앞선 거두기는 적용하지 않음', allUses(materialize([regA, wEarly]))[0].withdrawn === null);

  const h = mkOp('import', ACTOR_A, 'imp-wd-chunk-0001', imp([impRecord()]), t(1));
  const hUse = allUses(materialize([h]))[0].useId;
  const hw = mkOp('withdraw', ACTOR_B, 'req-wd-hist-0001', wd(hUse), t(2));
  const l5 = materialize([h, hw]);
  check('과거 기록 쓰임은 어느 대표관리자든 거둠', !!allUses(l5)[0].withdrawn && allUses(l5)[0].withdrawn?.byLabel === ACTOR_B.label && l5.ignoredWithdrawals === 0 && l5.useCount === 0);

  const all = [regA, wA, wB, wUnknown, h, hw, revive];
  const base = materialize(all);
  let same = true;
  for (const order of [[...all].reverse(), [hw, revive, h, wA, regA, wUnknown, wB]]) {
    try {
      deepStrictEqual(materialize(order), base);
    } catch {
      same = false;
    }
  }
  check('거두기가 섞여도 차례와 상관없이 같은 결과', same);
}

section('받음표 — 쓰임 상태(useState) · 효과(applied) · 밀림(supersededBy)(R2 STOR-1)');
{
  /* 쓴 사람 쪽 시각은 NOW 한 시간 전부터 분 단위로 — 받은 시각(nextNow)과는 따로 */
  const at = (min: number) => new Date(NOW.getTime() - 3_600_000 + min * 60_000).toISOString();
  const rc = (w: WriteResult): Receipt | null => (w.status === 'saved' ? w.receipt : null);
  const show = (r: Receipt | null) => JSON.stringify(r && { useState: r.useState, applied: r.applied, supersededBy: r.supersededBy, visible: r.visible, replayed: r.replayed });
  const regIn = (requestKey: string, itemId: string, notedAt: string | undefined, actor: Actor = ACTOR_A, extra: Raw = {}) => ({
    kind: 'register' as const,
    actor,
    requestKey,
    payload: reg({ use: { itemId, ...(notedAt ? { notedAt } : {}), ...extra } }),
  });
  const wdIn = (requestKey: string, useId: string, notedAt: string, actor: Actor = ACTOR_A, reasonKo = '잘못 등록해서 거둬요.') => ({ kind: 'withdraw' as const, actor, requestKey, payload: wd(useId, { notedAt, reasonKo }) });

  /* 새 등록 */
  const s1 = new FakeStore();
  const r1 = rc(await writeOp(s1, regIn('req-rs-reg-0001', 'rs-1', at(0)), nextNow()));
  check('새 등록 → useState active · applied true · supersededBy null(visible 과 applied 같음)', r1?.useState === 'active' && r1.applied === true && r1.visible === true && r1.supersededBy === null && !r1.replayed, show(r1));
  const use1 = r1?.placements[0]?.useId ?? '';

  /* 다른 컴퓨터(맥 나)가 더 늦은 시각으로 거둠 → 효과를 냄 */
  const b1 = rc(await writeOp(s1, wdIn('req-rs-wd-b-001', use1, at(30), ACTOR_A, '맥 나에서 거둬요.'), nextNow()));
  check('거두기(효과를 냄) → useState withdrawn · applied true · supersededBy null', b1?.useState === 'withdrawn' && b1.applied === true && b1.visible === true && b1.supersededBy === null, show(b1));

  /* 맥 가가 끊겨 있던 동안 대기에 둔 더 이른 거두기를 나중에 보냄(재시도 세 번) → 저장은 되지만 효과가 없다는 끝난 결과 */
  const staleA: (Receipt | null)[] = [];
  for (let i = 0; i < 3; i++) staleA.push(rc(await writeOp(s1, wdIn('req-rs-wd-a-001', use1, at(20), ACTOR_A, '맥 가에서 거둬요.'), nextNow())));
  check(
    '더 늦은 거두기 뒤 옛 거두기 → applied false · visible false · useState withdrawn · supersededBy withdraw(첫 201 · 뒤 200 모두 같음)',
    staleA.every((r, i) => r !== null && r.applied === false && r.visible === false && r.useState === 'withdrawn' && r.supersededBy === 'withdraw' && r.replayed === i > 0),
    staleA.map(show).join(' '),
  );
  /* 같은 시각의 거두기 둘 — 모으기가 하나만 효과를 내게 고르고, 다른 하나는 'withdraw' 에 밀림 */
  const c1 = rc(await writeOp(s1, wdIn('req-rs-wd-c-001', use1, at(30), ACTOR_A, '맥 다에서 같은 시각에 거둬요.'), nextNow()));
  const b1again = rc(await writeOp(s1, wdIn('req-rs-wd-b-001', use1, at(30), ACTOR_A, '맥 나에서 거둬요.'), nextNow()));
  const pair = [c1, b1again];
  check(
    '같은 시각의 거두기 둘 → 정확히 하나 applied · 다른 하나 supersededBy withdraw · 둘 다 withdrawn',
    pair.every((r) => r?.useState === 'withdrawn') && pair.filter((r) => r?.applied === true && r.supersededBy === null).length === 1 && pair.filter((r) => r?.applied === false && r.supersededBy === 'withdraw').length === 1,
    pair.map(show).join(' '),
  );

  /* 거둔 뒤 더 늦은 시각의 다시 등록이 쓰임을 살렸고, 그보다 이른 거두기가 늦게 도착 → 'register' 에 밀림 */
  const s2 = new FakeStore();
  const r2 = rc(await writeOp(s2, regIn('req-rs-reg-0002', 'rs-2', at(0)), nextNow()));
  const use2 = r2?.placements[0]?.useId ?? '';
  const rev = rc(await writeOp(s2, regIn('req-rs-reg-0003', 'rs-2', at(40), ACTOR_A, { applicationKo: '다시 확인하고 고친 글이에요.' }), nextNow()));
  check('같은 쓰임을 고친 다시 등록 → 같은 쓰임 · active', rev?.useState === 'active' && rev.placements[0]?.useId === use2 && rev.supersededBy === null, show(rev));
  const late2: (Receipt | null)[] = [];
  for (let i = 0; i < 2; i++) late2.push(rc(await writeOp(s2, wdIn('req-rs-wd-0002', use2, at(20)), nextNow())));
  check(
    '더 늦게 적힌 등록 뒤 도착한 옛 거두기 → applied false · useState active · supersededBy register(다시 보내도 같음)',
    late2.every((r, i) => r !== null && r.applied === false && r.visible === false && r.useState === 'active' && r.supersededBy === 'register' && r.replayed === i > 0),
    late2.map(show).join(' '),
  );
  const tie2 = rc(await writeOp(s2, wdIn('req-rs-wd-0003', use2, at(40)), nextNow()));
  check('마지막 등록과 같은 시각의 거두기 → supersededBy register(같은 시각은 등록이 이긴다)', tie2?.applied === false && tie2.useState === 'active' && tie2.supersededBy === 'register', show(tie2));
  const fresh2 = rc(await writeOp(s2, wdIn('req-rs-wd-0004', use2, at(41)), nextNow()));
  check('그 뒤 더 늦은 시각으로 다시 거둠 → applied · withdrawn', fresh2?.applied === true && fresh2.useState === 'withdrawn' && fresh2.supersededBy === null, show(fresh2));

  /* 같은 컴퓨터: 끊겨 있던 동안 거두기를 대기에 두고, 그 뒤 같은 쓰임을 고쳐 다시 등록(먼저 도착) → 대기의 거두기가 나중에 도착 */
  const s3 = new FakeStore();
  const r3 = rc(await writeOp(s3, regIn('req-rs-reg-0005', 'rs-3', at(0)), nextNow()));
  const use3 = r3?.placements[0]?.useId ?? '';
  await writeOp(s3, regIn('req-rs-reg-0006', 'rs-3', at(50), ACTOR_A, { applicationKo: '같은 컴퓨터에서 고쳐 다시 등록했어요.' }), nextNow());
  const q3 = rc(await writeOp(s3, wdIn('req-rs-wd-0005', use3, at(45)), nextNow()));
  check('같은 컴퓨터 · 대기의 거두기가 고친 다시 등록보다 늦게 도착 → supersededBy register', q3?.applied === false && q3.useState === 'active' && q3.supersededBy === 'register', show(q3));

  /* 다시 보낸 등록인데 그 쓰임은 그 뒤 거둔 상태 */
  const s4 = new FakeStore();
  const r4 = rc(await writeOp(s4, regIn('req-rs-reg-0007', 'rs-4', at(0)), nextNow()));
  const use4 = r4?.placements[0]?.useId ?? '';
  await writeOp(s4, wdIn('req-rs-wd-0006', use4, at(10)), nextNow());
  const r4again = rc(await writeOp(s4, regIn('req-rs-reg-0007', 'rs-4', at(0)), nextNow()));
  check(
    '다시 보낸 등록 · 그 쓰임이 뒤에 거둔 상태 → replayed · visible · applied true · useState withdrawn · supersededBy withdraw',
    r4again?.replayed === true && r4again.visible === true && r4again.applied === true && r4again.useState === 'withdrawn' && r4again.supersededBy === 'withdraw',
    show(r4again),
  );
  const stale4 = rc(await writeOp(s4, regIn('req-rs-reg-0008', 'rs-4', at(5), ACTOR_A, { applicationKo: '거두기보다 이른 시각의 고침이에요.' }), nextNow()));
  check('거두기보다 이른 시각의 새 등록 → 새로 저장(201) · useState withdrawn · supersededBy withdraw', stale4?.replayed === false && stale4.useState === 'withdrawn' && stale4.supersededBy === 'withdraw', show(stale4));

  /* 저장 뒤 목록을 못 읽음 → unknown */
  const s5 = new FakeStore();
  const r5 = rc(await writeOp(s5, regIn('req-rs-reg-0009', 'rs-5', at(0)), nextNow()));
  const use5 = r5?.placements[0]?.useId ?? '';
  s5.listFail = true;
  const r5again = rc(await writeOp(s5, regIn('req-rs-reg-0009', 'rs-5', at(0)), nextNow(), undefined, FAST));
  check('저장 뒤 목록 실패 · 등록 → useState unknown · applied false · supersededBy null', r5again?.useState === 'unknown' && r5again.applied === false && r5again.visible === false && r5again.supersededBy === null, show(r5again));
  const w5 = rc(await writeOp(s5, wdIn('req-rs-wd-0007', use5, at(10)), nextNow(), undefined, FAST));
  check('저장 뒤 목록 실패 · 거두기 → useState unknown · applied false · supersededBy null', w5?.useState === 'unknown' && w5.applied === false && w5.supersededBy === null, show(w5));
  s5.listFail = false;
  const w5ok = rc(await writeOp(s5, wdIn('req-rs-wd-0007', use5, at(10)), nextNow()));
  check('목록이 돌아온 뒤 같은 거두기를 다시 보냄 → replayed · applied · withdrawn', w5ok?.replayed === true && w5ok.applied === true && w5ok.useState === 'withdrawn', show(w5ok));

  /* 없는 쓰임 · 거둘 수 없는 사람(API 는 저장 전에 막는다 — 저장 단계만 시험) */
  const s6 = new FakeStore();
  const r6 = rc(await writeOp(s6, regIn('req-rs-reg-0010', 'rs-6', at(0)), nextNow()));
  const use6 = r6?.placements[0]?.useId ?? '';
  const w6none = rc(await writeOp(s6, wdIn('req-rs-wd-0008', 'use_' + '0'.repeat(24), at(10)), nextNow()));
  check('없는 쓰임을 가리키는 거두기 → useState unknown · applied false · supersededBy null', w6none?.useState === 'unknown' && w6none.applied === false && w6none.supersededBy === null, show(w6none));
  const w6other = rc(await writeOp(s6, wdIn('req-rs-wd-0009', use6, at(10), ACTOR_B), nextNow()));
  check('다른 계정의 거두기(무시됨) → useState active · applied false · supersededBy null', w6other?.useState === 'active' && w6other.applied === false && w6other.supersededBy === null, show(w6other));

  /* 가져오기 — 쓰임이 여럿이라 useState null */
  const s7 = new FakeStore();
  const i7 = rc(await writeOp(s7, { kind: 'import', actor: ACTOR_A, requestKey: 'imp-rs-chunk-0001', payload: imp([impRecord(), impRecord({ use: { itemId: 'drill-rs-2' } })]) }, nextNow()));
  check('가져오기 → useState null · supersededBy null · applied = visible(true)', i7?.useState === null && i7.supersededBy === null && i7.applied === true && i7.visible === true, show(i7));

  /* 모으기 결과와 맞는가(무작위 기록 묶음 300개) — 받음표의 판단이 모으기 규칙에서 바로 나온다 */
  /* 결정적 무작위(mulberry32) — 같은 씨앗이면 늘 같은 묶음 */
  let seed = 0x5eed_0007;
  const rnd = (n: number) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296 * n) | 0;
  };
  const usePid = allUses(materialize([mkOp('register', ACTOR_A, 'req-prop-base-0', reg({ use: { itemId: 'prop-1' } }), at(0))]))[0].useId;
  let propOk = 0;
  let propBad = '';
  let mutated = false;
  const kinds = { applied: 0, withdraw: 0, register: 0, ignored: 0, regWithdrawn: 0 };
  for (let trial = 0; trial < 300; trial++) {
    const ops: Op[] = [];
    const nReg = 1 + rnd(3);
    for (let i = 0; i < nReg; i++) {
      const noted = rnd(4) === 0 ? undefined : at(rnd(10) * 5);
      ops.push(mkOp('register', ACTOR_A, `req-prop-${trial}-r${i}`, reg({ use: { itemId: 'prop-1', ...(noted ? { notedAt: noted } : {}), applicationKo: `고친 글 ${i}번이에요.` } }), at(rnd(12) * 5)));
    }
    const nWd = rnd(4);
    for (let i = 0; i < nWd; i++) ops.push(mkOp('withdraw', ACTOR_A, `req-prop-${trial}-w${i}`, wd(usePid, { notedAt: at(rnd(10) * 5), reasonKo: `거두는 까닭 ${i}번이에요.` }), at(rnd(12) * 5)));
    if (rnd(3) === 0) ops.push(mkOp('withdraw', ACTOR_B, `req-prop-${trial}-wb`, wd(usePid, { notedAt: at(rnd(10) * 5) }), at(rnd(12) * 5)));
    const lib = materialize(ops);
    const before = JSON.stringify(lib);
    const u = allUses(lib).find((x) => x.useId === usePid);
    if (!u) {
      propBad ||= `trial ${trial}: 쓰임 없음`;
      continue;
    }
    const effOf = (o: Op) => (o.kind === 'register' ? (o.payload.use.notedAt ?? o.receivedAt) : o.kind === 'withdraw' ? (o.payload.notedAt ?? o.receivedAt) : '');
    let good = true;
    for (const o of ops) {
      const out = opOutcome(lib, o);
      const state = u.withdrawn ? 'withdrawn' : 'active';
      if (!out || out.useState !== state) good = false;
      else if (o.kind === 'register') {
        if (out.supersededBy !== (u.withdrawn ? 'withdraw' : null)) good = false;
        if (u.withdrawn) kinds.regWithdrawn++;
      } else if (o.kind === 'withdraw') {
        if (o.actor.userId !== ACTOR_A.userId) {
          if (out.supersededBy !== null) good = false;
          kinds.ignored++;
        } else if (u.withdrawn?.opId === o.opId) {
          if (out.supersededBy !== null) good = false;
          kinds.applied++;
        } else if (u.withdrawn) {
          const winner = ops.find((x) => x.opId === u.withdrawn?.opId)!;
          if (out.supersededBy !== 'withdraw' || !(effOf(winner) >= effOf(o))) good = false;
          kinds.withdraw++;
        } else {
          const regs = ops.filter((x) => x.kind === 'register' && u.history.some((h) => h.opId === x.opId));
          if (out.supersededBy !== 'register' || !regs.some((x) => effOf(x) >= effOf(o))) good = false;
          kinds.register++;
        }
      }
    }
    if (JSON.stringify(lib) !== before) mutated = true;
    if (good) propOk++;
    else propBad ||= `trial ${trial}`;
  }
  check(
    '무작위 기록 묶음 300개: 받음표 판단이 모으기 결과 · 시각 규칙과 맞음(밀린 거두기는 늘 같거나 늦은 거두기 · 등록이 있음)',
    propOk === 300 && kinds.applied > 0 && kinds.withdraw > 0 && kinds.register > 0 && kinds.ignored > 0 && kinds.regWithdrawn > 0,
    `${propOk}/300 ${propBad} ${JSON.stringify(kinds)}`,
  );
  check('받음표 판단은 모으기 결과를 바꾸지 않음(읽기만)', !mutated);

  /* API 로 — 받음표 칸이 응답 JSON 에 그대로 실림(더하기만) */
  const sa = new FakeStore();
  const FX = new Date('2026-11-17T05:00:00.000Z');
  const depsS: ApiDeps = { store: () => sa, cache: new Map(), storeKind: 'local-fixture', now: () => FX, write: FAST };
  const OWN: ApiViewer = { id: ACTOR_A.userId, role: 'ADMIN', nickname: '관리자 가' };
  const postJ = (b: unknown) => new Request('https://app.test/api/admin/review-evidence', { method: 'POST', headers: { host: 'app.test', 'content-type': 'application/json', 'x-review-evidence': '1' }, body: JSON.stringify(b) });
  const call = async (b: unknown) => {
    const r = await handleRegister(postJ(b), OWN, depsS);
    return { status: r.status, j: (await r.json()) as { receipt?: Record<string, unknown> } & Record<string, unknown> };
  };
  const ar = await call(regRaw({ requestKey: 'req-rs-api-reg01', use: { itemId: 'rs-api', notedAt: '2026-11-17T04:00:00.000Z' } }));
  const apiUse = ((ar.j.receipt?.placements as { useId: string }[] | undefined) ?? [])[0]?.useId ?? '';
  const wdApi = (requestKey: string, notedAt: string) => ({ requestKey, withdraw: { useId: apiUse, reasonKo: '잘못 등록해서 거둬요.', notedAt } });
  const aw1 = await call(wdApi('req-rs-api-wd-b1', '2026-11-17T04:30:00.000Z'));
  const aw2 = await call(wdApi('req-rs-api-wd-a1', '2026-11-17T04:20:00.000Z'));
  const aw3 = await call(wdApi('req-rs-api-wd-a1', '2026-11-17T04:20:00.000Z'));
  const pick = (x: { status: number; j: { receipt?: Record<string, unknown> } }) => ({ s: x.status, u: x.j.receipt?.useState, a: x.j.receipt?.applied, sb: x.j.receipt?.supersededBy, v: x.j.receipt?.visible });
  check(
    'API: 등록 201(active) · 거두기 201(applied) · 더 이른 거두기 201 · 다시 보냄 200(둘 다 supersededBy withdraw · applied false)',
    ar.status === 201 &&
      ar.j.receipt?.useState === 'active' &&
      ar.j.receipt?.applied === true &&
      ar.j.receipt?.supersededBy === null &&
      aw1.status === 201 &&
      aw1.j.receipt?.applied === true &&
      aw1.j.receipt?.useState === 'withdrawn' &&
      aw2.status === 201 &&
      aw3.status === 200 &&
      [aw2, aw3].every((x) => x.j.receipt?.applied === false && x.j.receipt?.visible === false && x.j.receipt?.supersededBy === 'withdraw' && x.j.receipt?.useState === 'withdrawn'),
    JSON.stringify([ar, aw1, aw2, aw3].map(pick)),
  );
  check(
    'API 받음표: 칸 모두 있음(useState · applied · supersededBy) · 계정 번호 없음',
    [ar, aw1, aw2].every((x) => x.j.receipt && 'useState' in x.j.receipt && 'applied' in x.j.receipt && 'supersededBy' in x.j.receipt) && !JSON.stringify([ar, aw1, aw2, aw3]).includes(ACTOR_A.userId),
  );
}

/* ═══════════════ 6. API 처리 ═══════════════ */

section('API 처리(가짜 저장소 · 보는 사람)');
{
  const store = new FakeStore();
  let storeCalls = 0;
  const deps: ApiDeps = {
    store: () => {
      storeCalls++;
      return store;
    },
    cache: new Map(),
    storeKind: 'local-fixture',
    now: nextNow,
  };
  const OWNER: ApiViewer = { id: 'owner_1', role: 'ADMIN', nickname: '대표' };
  const responses: Response[] = [];
  const keep = (r: Response) => (responses.push(r), r);
  const URL_BASE = 'https://app.test/api/admin/review-evidence';
  const post = (body: BodyInit | null, headers: Record<string, string | null> = {}, url = URL_BASE) => {
    const h: Record<string, string> = { host: 'app.test', 'content-type': 'application/json', 'x-review-evidence': '1' };
    for (const [k, v] of Object.entries(headers)) {
      if (v === null) delete h[k];
      else h[k] = v;
    }
    const init: RequestInit & { duplex?: 'half' } = { method: 'POST', headers: h, body };
    if (body instanceof ReadableStream) init.duplex = 'half';
    return new Request(url, init);
  };
  const get = (q = '') => new Request(URL_BASE + q, { headers: { host: 'app.test' } });
  const json = async (r: Response) => (await r.clone().json()) as Record<string, unknown>;
  const body = JSON.stringify(regRaw({ requestKey: 'req-api-00001' }));

  /* 문지기 — 저장소를 묻기 전에 막는다 */
  for (const [name, viewer, status] of [
    ['로그인 안 함', null, 401],
    ['일반 회원 USER', { id: 'u1', role: 'USER' }, 403],
    ['준관리자 MANAGER', { id: 'm1', role: 'MANAGER' }, 403],
    ['로그인 확인 오류', 'gate-error', 403],
  ] as [string, ApiViewer, number][]) {
    const before = storeCalls;
    const rl = keep(await handleList(get(), viewer, deps));
    const rr = keep(await handleRegister(post(body), viewer, deps));
    const ri = keep(await handleImport(post(JSON.stringify(impRaw([impRecord()]))), viewer, deps));
    check(`${name} → ${status}(목록 · 등록 · 가져오기)`, rl.status === status && rr.status === status && ri.status === status, `${rl.status}/${rr.status}/${ri.status}`);
    check(`${name}: 저장소를 묻지 않음`, storeCalls === before);
  }
  check('막은 요청 뒤 저장소 호출 0 · 객체 0', store.calls.create + store.calls.read + store.calls.list === 0 && store.objects.size === 0);

  /* 요청 출처 · 형식 · 크기 */
  const expectErr = async (name: string, req: Request, status: number, code: string) => {
    const before = storeCalls;
    const r = keep(await handleRegister(req, OWNER, deps));
    const j = await json(r);
    check(`${name} → ${status} ${code}`, r.status === status && j.error === code, `${r.status} ${String(j.error)}`);
    check(`${name}: 저장소를 묻지 않음`, storeCalls === before);
  };
  await expectErr('x-review-evidence 머리 없음', post(body, { 'x-review-evidence': null }), 403, 'missing_header');
  await expectErr('Origin 다른 사이트', post(body, { origin: 'https://evil.example' }), 403, 'bad_origin');
  await expectErr("Origin 'null'", post(body, { origin: 'null' }), 403, 'bad_origin');
  await expectErr('sec-fetch-site cross-site', post(body, { 'sec-fetch-site': 'cross-site' }), 403, 'bad_origin');
  await expectErr('sec-fetch-site same-site', post(body, { 'sec-fetch-site': 'same-site' }), 403, 'bad_origin');
  await expectErr('text/plain', post(body, { 'content-type': 'text/plain' }), 415, 'unsupported_type');
  await expectErr('content-length 한도 넘음', post(body, { 'content-length': String(MAX_REGISTER_BYTES + 1) }), 413, 'too_large');
  const bigStream = new ReadableStream<Uint8Array>({
    start(c) {
      const chunk = new TextEncoder().encode('x'.repeat(8 * 1024));
      for (let i = 0; i < 6; i++) c.enqueue(chunk);
      c.close();
    },
  });
  await expectErr('길이 없이 흘려 보낸 본문이 한도 넘음', post(bigStream), 413, 'too_large');
  await expectErr('JSON 모양 틀림', post('{ 망가짐'), 400, 'bad_json');
  {
    const r = keep(await handleRegister(post(JSON.stringify({ source: {}, use: {} })), OWNER, deps));
    const j = await json(r);
    check('모양이 틀린 본문 → 400 invalid · issues', r.status === 400 && j.error === 'invalid' && Array.isArray(j.issues) && (j.issues as unknown[]).length > 0);
  }

  /* 같은 사이트 Origin 은 받음 · 성공 · 다시 보냄 */
  const ok1 = keep(await handleRegister(post(body, { origin: 'https://app.test', 'sec-fetch-site': 'same-origin' }), OWNER, deps));
  const j1 = await json(ok1);
  check('같은 사이트 Origin · same-origin → 201', ok1.status === 201 && j1.ok === true && j1.store === 'local-fixture', String(ok1.status));
  const rec1 = j1.receipt as { opId: string; replayed: boolean; visible: boolean } | undefined;
  check('201 받음표: replayed false · visible true', !!rec1 && !rec1.replayed && rec1.visible);
  const ok2 = keep(await handleRegister(post(body), OWNER, deps));
  const j2 = await json(ok2);
  const rec2 = j2.receipt as { opId: string; replayed: boolean } | undefined;
  check('같은 본문 다시 보냄 → 200 · replayed · 같은 opId', ok2.status === 200 && !!rec2 && rec2.replayed && rec2.opId === rec1?.opId, String(ok2.status));
  check('다시 보내도 객체 1개', store.objects.size === 1);
  const okFwd = keep(await handleRegister(post(JSON.stringify(regRaw({ requestKey: 'req-api-00002', use: { itemId: 'fwd' } })), { origin: 'https://app.example-host.net', host: 'internal-host:3000', 'x-forwarded-host': 'app.example-host.net' }), OWNER, deps));
  check('x-forwarded-host 와 같은 Origin 은 받음', okFwd.status === 201, String(okFwd.status));
  const conf = keep(await handleRegister(post(JSON.stringify(regRaw({ requestKey: 'req-api-00001', use: { applicationKo: '바꾼 적용 글이에요.' } }))), OWNER, deps));
  check('같은 요청 번호 · 다른 내용 → 409 conflict', conf.status === 409 && (await json(conf)).error === 'conflict');

  const impRes = keep(await handleImport(post(JSON.stringify(impRaw([impRecord(), impRecord({ use: { itemId: 'drill-9' } })])), {}, URL_BASE + '/import'), OWNER, deps));
  const ij = await json(impRes);
  check('가져오기 201 · records 2', impRes.status === 201 && (ij.receipt as { records?: number } | undefined)?.records === 2, String(impRes.status));
  const impNoKey = keep(await handleImport(post(JSON.stringify(impRaw([impRecord()], { requestKey: undefined })), {}, URL_BASE + '/import'), OWNER, deps));
  check('가져오기 요청 번호 없음 → 400', impNoKey.status === 400);

  /* 목록 */
  const lr = keep(await handleList(get(), OWNER, deps));
  const lj = await json(lr);
  const counts = lj.counts as Record<string, unknown> | undefined;
  const srcs = lj.sources as { id: string; uses: { useId: string; scope: string }[]; links: string[] }[] | undefined;
  check('GET 목록 200 · counts · sources', lr.status === 200 && lj.ok === true && !!counts && Array.isArray(srcs), String(lr.status));
  check('GET 목록: 쓰임 4개(지금 2 · 과거 2)', !!srcs && srcs.flatMap((s) => s.uses).length === 4 && counts?.uses === 4, JSON.stringify(counts));
  check('GET 목록: 요약 · 적용 글은 보내지 않음', !JSON.stringify(lj).includes('세트 수를 정할 때') && !JSON.stringify(lj).includes('가짜 연구를 짧게'));
  const sr = keep(await handleList(get('?view=summary'), OWNER, deps));
  const sj = await json(sr);
  check('GET ?view=summary: counts 만', sr.status === 200 && !!sj.counts && sj.sources === undefined);
  check('GET 목록: 쓰임의 계정 번호(ownerUserId)는 내보내지 않음', !JSON.stringify(lj).includes('ownerUserId') && !JSON.stringify(lj).includes('owner_1'));

  /* 거두기 — 같은 등록 주소에 { withdraw } 본문 */
  const wdBody = (useId: string, requestKey: string) => JSON.stringify({ requestKey, withdraw: { useId, reasonKo: '잘못 등록해서 거둬요.' } });
  const writesBefore = () => ({ objects: store.objects.size, creates: store.calls.create });
  {
    const before = writesBefore();
    const r = keep(await handleRegister(post(wdBody('use_' + '0'.repeat(24), 'req-api-wd-0001')), OWNER, deps));
    const j = await json(r);
    check('거두기: 없는 쓰임 번호 → 400 invalid · 저장 안 함', r.status === 400 && j.error === 'invalid' && store.objects.size === before.objects && store.calls.create === before.creates, `${r.status} ${String(j.error)}`);
  }
  {
    const r = keep(await handleRegister(post(JSON.stringify({ withdraw: { useId: 'use_bad', reasonKo: '잘못 등록했어요.' } })), OWNER, deps));
    check('거두기: 쓰임 번호 모양 틀림 → 400', r.status === 400 && (await json(r)).error === 'invalid');
  }
  seedOp(store, mkOp('register', ACTOR_B, 'req-api-other-01', reg({ use: { itemId: 'other-acc' } }), nextNow().toISOString()));
  const libNow = await loadLibrary(store);
  const usesNow = libNow.ok ? allUses(libNow.library) : [];
  const otherUse = usesNow.find((x) => x.itemId === 'other-acc');
  const ownUse = usesNow.find((x) => x.scope === 'user' && x.ownerUserId === 'owner_1' && x.itemId === 'item-1');
  const histUse = usesNow.find((x) => x.scope === 'historical');
  check('거두기 준비: 다른 계정 · 내 것 · 과거 기록 쓰임을 찾음', !!otherUse && !!ownUse && !!histUse && usesNow.length === 5, String(usesNow.length));
  if (otherUse) {
    const before = writesBefore();
    const r = keep(await handleRegister(post(wdBody(otherUse.useId, 'req-api-wd-0002')), OWNER, deps));
    const j = await json(r);
    check('거두기: 다른 계정의 쓰임 → 403 · 저장 안 함', r.status === 403 && j.error === 'forbidden' && store.objects.size === before.objects && store.calls.create === before.creates, `${r.status} ${String(j.error)}`);
  }
  if (ownUse) {
    const r = keep(await handleRegister(post(wdBody(ownUse.useId, 'req-api-wd-0003')), OWNER, deps));
    const j = await json(r);
    const rc = j.receipt as { kind?: string; visible?: boolean; replayed?: boolean; placements?: { useId: string }[] } | undefined;
    check('거두기: 내 쓰임 → 201 · visible · 그 쓰임 위치', r.status === 201 && rc?.kind === 'withdraw' && rc.visible === true && rc.placements?.length === 1 && rc.placements[0].useId === ownUse.useId, `${r.status} ${JSON.stringify(rc)}`);
    const again = keep(await handleRegister(post(wdBody(ownUse.useId, 'req-api-wd-0003')), OWNER, deps));
    check('거두기: 같은 요청 다시 보냄 → 200 replayed', again.status === 200 && (((await json(again)).receipt as { replayed?: boolean } | undefined)?.replayed ?? false));
    const after = await json(keep(await handleList(get(), OWNER, deps)));
    check('거두기 뒤 목록: 쓰임 수에서 빠짐(5 → 4)', (after.counts as { uses?: number } | undefined)?.uses === 4, JSON.stringify(after.counts));
  }
  if (histUse) {
    const r = keep(await handleRegister(post(wdBody(histUse.useId, 'req-api-wd-0004')), OWNER, deps));
    check('거두기: 과거 기록 쓰임은 대표관리자가 거둠 → 201', r.status === 201, String(r.status));
  }

  store.listFail = true;
  const fr = keep(await handleList(get(), OWNER, deps));
  check('저장소 목록 실패 → 503 unavailable', fr.status === 503 && (await json(fr)).error === 'unavailable');
  store.listFail = false;

  check(
    `응답 ${responses.length}개 모두 Cache-Control no-store · nosniff`,
    responses.every((r) => /no-store/.test(r.headers.get('cache-control') ?? '') && r.headers.get('x-content-type-options') === 'nosniff'),
  );
}

section('API 목록 v2 칸(apiVersion · mine · historicalReviewer · foreignObjects) · 목록 실패 까닭');
{
  const store = new FakeStore();
  const t = (s: number) => new Date(NOW.getTime() - 86_400_000 + s * 1000).toISOString();
  seedOp(store, mkOp('register', ACTOR_A, 'req-v2view-a-01', reg({ use: { itemId: 'v2-a' } }), t(1)));
  seedOp(store, mkOp('register', ACTOR_B, 'req-v2view-b-01', reg({ use: { itemId: 'v2-b' } }), t(2)));
  seedOp(
    store,
    mkOp('import', ACTOR_A, 'imp-v2view-chunk-1', imp([impRecord({ use: { itemId: 'v2-h1' } }), impRecord({ use: { itemId: 'v2-h2' }, historical: { reviewer: 'kimmin' } })]), t(3)),
  );
  store.put(`${OP_FOLDER}/notes.txt`, 'x');
  store.put(`${OP_FOLDER}/.emptyFolderPlaceholder`, '');
  store.put(`${OP_FOLDER}/${'c'.repeat(64)}.json`, '{bad');
  const deps: ApiDeps = { store: () => store, cache: new Map(), storeKind: 'local-fixture', now: nextNow, write: FAST };
  const getReq = (q = '') => new Request('https://app.test/api/admin/review-evidence' + q, { headers: { host: 'app.test' } });
  type U = { itemId: string | null; scope: string; mine: unknown; historicalReviewer: unknown };
  const usesFor = async (viewer: ApiViewer) => {
    const r = await handleList(getReq(), viewer, deps);
    const text = await r.clone().text();
    const j = JSON.parse(text) as { apiVersion?: unknown; counts?: Record<string, unknown>; sources?: { uses: U[] }[] };
    return { r, text, j, uses: (j.sources ?? []).flatMap((s) => s.uses) };
  };
  const byItem = (us: U[], id: string) => us.find((u) => u.itemId === id);

  const A = await usesFor({ id: ACTOR_A.userId, role: 'ADMIN', nickname: '관리자 가' });
  check('GET 목록: apiVersion 2', A.r.status === 200 && A.j.apiVersion === 2, String(A.j.apiVersion));
  check('GET 목록: counts.foreignObjects 1(빈 폴더 표시 빼고) · skippedOps 1', A.j.counts?.foreignObjects === 1 && A.j.counts?.skippedOps === 1, JSON.stringify(A.j.counts));
  check('모든 쓰임에 mine(참 · 거짓) · historicalReviewer 칸', A.uses.length === 4 && A.uses.every((u) => typeof u.mine === 'boolean' && 'historicalReviewer' in u), String(A.uses.length));
  check('가가 볼 때: 가의 쓰임 mine true · 나의 쓰임 false', byItem(A.uses, 'v2-a')?.mine === true && byItem(A.uses, 'v2-b')?.mine === false);
  check(
    '과거 기록 쓰임은 가져온 사람이 봐도 mine false · historicalReviewer yunho · kimmin',
    byItem(A.uses, 'v2-h1')?.mine === false && byItem(A.uses, 'v2-h1')?.historicalReviewer === 'yunho' && byItem(A.uses, 'v2-h2')?.mine === false && byItem(A.uses, 'v2-h2')?.historicalReviewer === 'kimmin',
  );
  check('지금 등록한 쓰임은 historicalReviewer null', byItem(A.uses, 'v2-a')?.historicalReviewer === null && byItem(A.uses, 'v2-b')?.historicalReviewer === null);
  check(
    '계정 번호는 내보내지 않음(ownerUserId · 보는 사람 · 쓴 사람 id 없음)',
    !A.text.includes('ownerUserId') && !A.text.includes(ACTOR_A.userId) && !A.text.includes(ACTOR_B.userId) && !A.text.includes('"actor"'),
  );
  const B = await usesFor({ id: ACTOR_B.userId, role: 'ADMIN', nickname: '관리자 나' });
  check('나가 볼 때: 나의 쓰임 mine true · 가의 쓰임 false', byItem(B.uses, 'v2-b')?.mine === true && byItem(B.uses, 'v2-a')?.mine === false && !B.text.includes(ACTOR_B.userId));
  const C = await usesFor({ id: 'user_c', role: 'ADMIN' });
  check('아무것도 등록하지 않은 대표관리자: 모두 mine false', C.uses.length === 4 && C.uses.every((u) => u.mine === false));
  const sumR = await handleList(getReq('?view=summary'), { id: ACTOR_A.userId, role: 'ADMIN' }, deps);
  const sumJ = (await sumR.json()) as { apiVersion?: unknown; counts?: Record<string, unknown>; sources?: unknown };
  check('GET ?view=summary: apiVersion 2 · counts(foreignObjects 포함)만', sumR.status === 200 && sumJ.apiVersion === 2 && sumJ.counts?.foreignObjects === 1 && sumJ.sources === undefined);

  /* 목록 실패 — 늘 503 unavailable 에 까닭(reason)과 그 글 */
  const noV2 = new FakeListV2Client();
  noV2.override = () => Promise.resolve({ data: null, error: { name: 'StorageApiError', status: 404, statusCode: '404', message: 'Route POST:/object/list-v2/pitch-videos not found' } });
  const depsU: ApiDeps = { store: () => v2Store(noV2), cache: new Map(), storeKind: 'central', now: nextNow, write: FAST };
  const ru = await handleList(getReq(), { id: 'owner_u', role: 'ADMIN' }, depsU);
  const ju = (await ru.json()) as Record<string, unknown>;
  check(
    '목록 v2 없는 저장소 → 503 · error unavailable · reason unsupported · 그 글',
    ru.status === 503 && ju.error === 'unavailable' && ju.reason === 'unsupported' && ju.message === LIST_FAILURE_TEXT.unsupported,
    JSON.stringify(ju),
  );
  check('목록 실패 응답도 저장 금지', /no-store/.test(ru.headers.get('cache-control') ?? '') && ru.headers.get('x-content-type-options') === 'nosniff');
  check('목록 v2 없음: 옛 목록(v1)으로 돌아가지 않음', noV2.v1Calls === 0);

  const gone = new FakeStore();
  const gops = seedMany(gone, 3);
  gone.readMissing.set(opKey(gops[0].opId), Infinity);
  const ri = await handleList(getReq(), { id: 'owner_u', role: 'ADMIN' }, { store: () => gone, cache: new Map(), storeKind: 'local-fixture', now: nextNow, write: FAST });
  const ji = (await ri.json()) as Record<string, unknown>;
  check('목록에 있던 기록을 못 읽음 → 503 · reason inconsistent · 그 글', ri.status === 503 && ji.reason === 'inconsistent' && ji.message === LIST_FAILURE_TEXT.inconsistent, JSON.stringify(ji));
  check('목록 실패 글: 다섯 까닭 모두 한국어 · 줄표(—) 없음', Object.values(LIST_FAILURE_TEXT).length === 5 && Object.values(LIST_FAILURE_TEXT).every((x) => /[가-힣]/.test(x) && !x.includes('—')));

  /* 거두기도 목록을 먼저 모은다 — 같은 까닭으로 막힘 */
  const wdReq = new Request('https://app.test/api/admin/review-evidence', {
    method: 'POST',
    headers: { host: 'app.test', 'content-type': 'application/json', 'x-review-evidence': '1' },
    body: JSON.stringify({ requestKey: 'req-v2view-wd-01', withdraw: { useId: 'use_' + 'a'.repeat(24), reasonKo: '잘못 등록했어요.' } }),
  });
  const rw = await handleRegister(wdReq, { id: 'owner_u', role: 'ADMIN' }, depsU);
  const jw = (await rw.json()) as Record<string, unknown>;
  check('거두기: 목록 v2 없음 → 503 reason unsupported · 저장하지 않음', rw.status === 503 && jw.reason === 'unsupported', JSON.stringify(jw));
  const wo = withdrawOutcomeOf(rw.status, jw);
  check('거두기 화면: 목록 v2 없음 → 저장하지 않았다는 목록 실패 상태 · 서버의 까닭 글(확인 못 함이 아님)', wo.kind === 'list-failed' && wo.message === LIST_FAILURE_TEXT.unsupported, JSON.stringify(wo));
}

section('거두기 화면 판단(withdraw-form · withdrawOutcomeOf, R2 API-2)');
{
  const rcp = (over: Record<string, unknown>) => ({ ok: true, store: 'local-fixture', receipt: { opId: 'x', replayed: false, visible: true, placements: [], records: 1, ...over } });
  const table: [string, number, unknown, string][] = [
    ['효과를 냄(applied true)', 201, rcp({ applied: true, useState: 'withdrawn', supersededBy: null }), 'done'],
    ['다시 보냄 · 효과를 냄', 200, rcp({ replayed: true, applied: true, useState: 'withdrawn', supersededBy: null }), 'done'],
    ['다른 거두기가 효과를 냄', 201, rcp({ visible: false, applied: false, useState: 'withdrawn', supersededBy: 'withdraw' }), 'already'],
    ['더 나중에 적힌 등록', 200, rcp({ visible: false, applied: false, useState: 'active', supersededBy: 'register' }), 'newer'],
    ['저장됐지만 확인 못 함(목록 실패)', 201, rcp({ visible: false, applied: false, useState: 'unknown', supersededBy: null }), 'unconfirmed'],
    ['옛 서버 받음표 · visible true', 201, rcp({}), 'done'],
    ['옛 서버 받음표 · visible false', 201, rcp({ visible: false }), 'unconfirmed'],
    ['applied 가 visible 보다 먼저(applied false · visible true)', 201, rcp({ visible: true, applied: false, supersededBy: null }), 'unconfirmed'],
    ['저장 확인 못 함(503 pending)', 503, { ok: false, error: 'pending', reason: 'save', message: '…' }, 'unsure'],
    ['모르는 까닭의 503', 503, { ok: false, error: 'unavailable', reason: 'weird', message: '…' }, 'unsure'],
    ['그 밖의 5xx', 500, null, 'unsure'],
    ['받음표 없는 200', 200, { ok: true }, 'unsure'],
    ['400 invalid', 400, { ok: false, error: 'invalid' }, 'error'],
    ['403 forbidden', 403, { ok: false, error: 'forbidden' }, 'error'],
    ['409 conflict', 409, { ok: false, error: 'conflict' }, 'error'],
  ];
  for (const [name, status, data, want] of table) {
    const got = withdrawOutcomeOf(status, data);
    check(`거두기 화면: ${name} → ${want}`, got.kind === want, got.kind);
  }
  for (const reason of Object.keys(LIST_FAILURE_TEXT) as (keyof typeof LIST_FAILURE_TEXT)[]) {
    const got = withdrawOutcomeOf(503, { ok: false, error: 'unavailable', reason, message: LIST_FAILURE_TEXT[reason] });
    check(`거두기 화면: 목록 실패 ${reason} → 서버 글 그대로`, got.kind === 'list-failed' && got.message === LIST_FAILURE_TEXT[reason]);
  }
  const noMsg = withdrawOutcomeOf(503, { ok: false, error: 'unavailable', reason: 'inconsistent' });
  check('거두기 화면: 목록 실패인데 글이 없으면 그 까닭의 기본 글', noMsg.kind === 'list-failed' && noMsg.message === LIST_FAILURE_TEXT.inconsistent);

  /*
   * 끝에서 끝: 등록한 기기 시계가 앞서(2시간 · 3분) 쓴 사람 쪽 시각이 브라우저 거두기보다 늦은 쓰임 — 거두기는 저장되지만 효과가 없다.
   * 예전 화면은 '거뒀어요'를 보였다. 지금은 'newer'(더 나중에 적힌 등록)로 알리고, 시계가 같으면 'done'.
   */
  const WNOW = new Date('2026-11-20T12:00:00.000Z');
  const scenario = async (label: string, regNoted: string) => {
    const st = new FakeStore();
    const deps: ApiDeps = { store: () => st, cache: new Map(), storeKind: 'local-fixture', now: () => WNOW, write: FAST };
    const owner: ApiViewer = { id: 'owner_wf', role: 'ADMIN', nickname: '대표' };
    const req = (b: unknown) => new Request('https://app.test/api/admin/review-evidence', { method: 'POST', headers: { host: 'app.test', 'content-type': 'application/json', 'x-review-evidence': '1' }, body: JSON.stringify(b) });
    const rr = await handleRegister(req(regRaw({ requestKey: `req-wf-reg-${label}`, use: { itemId: `wf-${label}`, notedAt: regNoted } })), owner, deps);
    const useId = (((await rr.json()) as { receipt?: { placements?: { useId: string }[] } }).receipt?.placements ?? [])[0]?.useId ?? '';
    const body = { requestKey: `rk-ui-wd-${label}`, withdraw: { useId, reasonKo: '잘못 등록했어요.', notedAt: WNOW.toISOString() } };
    const w1 = await handleRegister(req(body), owner, deps);
    const o1 = withdrawOutcomeOf(w1.status, await w1.json());
    const w2 = await handleRegister(req(body), owner, deps);
    const o2 = withdrawOutcomeOf(w2.status, await w2.json());
    const lib = await loadLibrary(st, undefined, FAST);
    const u = lib.ok ? allUses(lib.library).find((x) => x.useId === useId) : undefined;
    return { s: [w1.status, w2.status], o: [o1.kind, o2.kind], withdrawn: !!u?.withdrawn };
  };
  const same = await scenario('same', '2026-11-20T11:00:00.000Z');
  check('거두기 화면 끝에서 끝: 같은 시계 → 201 done · 다시 보냄 200 done · 실제로 거둔 상태', same.s.join() === '201,200' && same.o.join() === 'done,done' && same.withdrawn, JSON.stringify(same));
  for (const [label, noted] of [
    ['plus2h', '2026-11-20T14:00:00.000Z'],
    ['plus3m', '2026-11-20T12:03:00.000Z'],
  ] as [string, string][]) {
    const r = await scenario(label, noted);
    check(`거두기 화면 끝에서 끝: 등록한 기기 시계가 앞섬(${label}) → 'newer'(거뒀어요 아님) · 다시 보내도 같음 · 쓰임은 살아 있음`, r.s.join() === '201,200' && r.o.join() === 'newer,newer' && !r.withdrawn, JSON.stringify(r));
  }

  /* 화면 파일이 이 판단을 쓰는가(정적 검사) — 받음표만 보고 '거뒀어요'를 보이지 않는다 */
  const wfSrc = readFileSync(path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), 'app', '(app)', 'admin', 'review-evidence', '[id]', 'withdraw-form.tsx'), 'utf8');
  check('withdraw-form 은 withdrawStepOf(withdrawOutcomeOf(…)) 로만 상태를 정함', wfSrc.includes('withdrawStepOf(withdrawOutcomeOf(res.status, data))') && !/res\.ok && data\?\.receipt\)\s*\{\s*setState\(\{ kind: 'done' \}/.test(wfSrc));
  /* 재검토(R2 뒤): 폼이 결과마다 상태를 따로 고르면(예: newer → done) 순수 판단 시험이 못 잡는다 — 폼은 step 을 그대로 쓰고 글도 표에서만 가져온다 */
  check(
    'withdraw-form 은 상태를 따로 고르지 않음(kind 는 idle · saving · shown 뿐 · 글자 그대로의 거뒀어요 없음)',
    !/kind:\s*'(done|already|newer|unconfirmed|unsure|list-failed|error)'/.test(wfSrc.replace("withdrawStepOf({ kind: 'unsure' })", '')) && !wfSrc.includes('거뒀어요') && wfSrc.includes("setState({ kind: 'shown', step, message })") && !wfSrc.includes('—'),
  );
  /* 결과 → 할 일(순수) — '거뒀어요'와 단추 끄기는 done 에서만, 새 요청은 newer 에서만 */
  const steps = (['done', 'already', 'newer', 'unconfirmed', 'unsure', 'error'] as const).map((k) => [k, withdrawStepOf({ kind: k })] as const);
  const lf = withdrawStepOf({ kind: 'list-failed', message: LIST_FAILURE_TEXT.unavailable });
  check(
    "withdrawStepOf: '거뒀어요'는 done 뿐 · 단추 끔은 done · already 뿐 · 새 요청은 newer 뿐",
    steps.every(([k, st]) => (st.message === WITHDRAW_TEXT.done) === (k === 'done') && st.view === k) &&
      steps.every(([k, st]) => st.finished === (k === 'done' || k === 'already') && st.resetRequest === (k === 'newer')) &&
      lf.view === 'list-failed' && !lf.finished && lf.resend && lf.message === `${LIST_FAILURE_TEXT.unavailable} ${WITHDRAW_TEXT.listFailedTail}`,
    JSON.stringify(steps),
  );
  check(
    'withdrawStepOf: 다시 보내기는 unconfirmed · unsure · list-failed 뿐 · 저장된 결과(done · already · newer)만 화면을 새로 읽음 · error 글은 부르는 쪽',
    steps.every(([k, st]) => st.resend === (k === 'unconfirmed' || k === 'unsure') && st.refresh === (k === 'done' || k === 'already' || k === 'newer')) &&
      steps.find(([k]) => k === 'error')![1].message === null && steps.find(([k]) => k === 'done')![1].tone === 'ok' && steps.filter(([, st]) => st.tone === 'ok').length === 1,
  );
  check("withdrawStepOf('newer') 글은 시계 차이와 다시 거둬도 같을 수 있음을 알림 · 줄표 없음", /시계/.test(WITHDRAW_TEXT.newer) && /다시 거둬도 같아요/.test(WITHDRAW_TEXT.newer) && !Object.values(WITHDRAW_TEXT).some((t) => t.includes('—')));
  /* 등록 폼 머리 — 거둔 상태 그대로인 쓰임에 '저장했어요'로 시작하지 않음 */
  const rw = registerResultOf({ replayed: false, visible: true, useState: 'withdrawn' });
  const rwRe = registerResultOf({ replayed: true, visible: true, useState: 'withdrawn' });
  const ra = registerResultOf({ replayed: false, visible: true, useState: 'active' });
  const rOld = registerResultOf({ replayed: true, visible: true });
  const rPend = registerResultOf({ replayed: false, visible: false, useState: 'unknown' });
  check(
    "registerResultOf: 거둔 상태 그대로면 warn · '저장했어요'로 시작하지 않음 · 시계 차이 안내",
    rw.tone === 'warn' && rwRe.tone === 'warn' && !rw.headline.startsWith('저장했어요') && rw.note === REGISTER_WITHDRAWN_NOTE && /시계/.test(REGISTER_WITHDRAWN_NOTE),
    JSON.stringify([rw, rwRe]),
  );
  check(
    'registerResultOf: 살아 있음 · 옛 서버는 예전 글(저장했어요 · 이미 저장된 같은 요청) · 목록 확인 전은 pending',
    ra.tone === 'ok' && ra.headline === '저장했어요.' && ra.note === null && rOld.tone === 'ok' && rOld.headline === '이미 저장된 같은 요청이에요.' && rPend.tone === 'pending' && rPend.note !== null,
  );
  const rfSrc = readFileSync(path.join(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), 'app', '(app)', 'admin', 'review-evidence', 'new', 'register-form.tsx'), 'utf8');
  check('register-form 은 registerResultOf 로 머리 글을 정함(머리 글을 따로 쓰지 않음)', rfSrc.includes('registerResultOf(r)') && rfSrc.includes('{view.headline}') && !rfSrc.includes("'저장했어요.'"));
}

/* ═══════════════ 7. 폴더 저장소(local-store) ═══════════════ */

section('폴더 저장소(local-store)');
{
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ex-ref04-local-'));
  try {
    const ls = localEvidenceStore(dir);
    const key = opKey('a'.repeat(64));
    const res = await Promise.all(Array.from({ length: 10 }, (_, i) => ls.createOnly(key, `{"n":${i}}`)));
    check('같은 열쇠 10번 동시에 → created 정확히 1개', res.filter((r) => r === 'created').length === 1 && res.filter((r) => r === 'exists').length === 9, res.join(','));
    const rd = await ls.read(key, 1000);
    check('만든 것 읽힘', rd.ok);
    const opsDir = path.join(dir, ...OP_FOLDER.split('/'));
    const leftovers = readdirSync(opsDir).filter((n) => n.startsWith('.tmp-'));
    check('동시 만들기 뒤 임시 파일(.tmp-)이 남지 않음', leftovers.length === 0, leftovers.join(','));
    const winner = rd.ok ? (JSON.parse(rd.text) as { n: number }).n : -1;
    check('남은 본문은 온전한 한 요청의 본문(섞이지 않음)', rd.ok && /^\{"n":\d\}$/.test(rd.text) && winner >= 0 && winner < 10, rd.ok ? rd.text : '');
    writeFileSync(path.join(opsDir, '.tmp-999-deadbeefdeadbeef'), '{"half":');
    const withTmp = await ls.list(null, 100);
    check('목록은 임시 파일(.tmp-)을 무시', withTmp.ok && withTmp.items.length === 1 && !withTmp.items.some((i) => i.name.startsWith('.tmp-')), withTmp.ok ? withTmp.items.map((i) => i.name).join(',') : '');
    for (const bad of ['review-evidence/v1/ops/../escape.json', `review-evidence/v1/ops/../../${'b'.repeat(64)}.json`, `other/${'b'.repeat(64)}.json`, `review-evidence/v1/ops/sub/${'b'.repeat(64)}.json`, 'review-evidence/v1/ops/notes.txt', `/etc/${'b'.repeat(64)}.json`]) {
      const c = await ls.createOnly(bad, '{}');
      const r = await ls.read(bad, 1000);
      check(`폴더 밖 · 틀린 열쇠 거절: ${bad.slice(0, 40)}`, c === 'error' && !r.ok && r.reason === 'missing', `${c} ${r.ok ? 'ok' : r.reason}`);
    }
    check('폴더 밖에 파일이 생기지 않음', !existsSync(path.join(dir, 'escape.json')) && !existsSync(path.join(dir, 'other')) && !existsSync(path.join(dir, 'review-evidence', 'escape.json')));
    const lst = await ls.list(null, 100);
    check('목록: 만든 것 1개', lst.ok && lst.items.length === 1 && lst.items[0].name === 'a'.repeat(64) + '.json');
    const tl = await ls.read(key, 2);
    check('한도보다 크면 too_large', !tl.ok && tl.reason === 'too_large');

    /* 폴더 저장소로 쓰기 · 다시 읽기 한 바퀴 */
    const w = await writeOp(ls, { kind: 'register', actor: ACTOR_A, requestKey: 'req-local-0001', payload: reg() }, nextNow());
    const w2 = await writeOp(ls, { kind: 'register', actor: ACTOR_A, requestKey: 'req-local-0001', payload: reg() }, nextNow());
    check('폴더 저장소: 쓰기 saved · visible, 다시 보냄 replayed', w.status === 'saved' && w.receipt.visible && w2.status === 'saved' && w2.receipt.replayed);
    const empty = localEvidenceStore(path.join(dir, 'none'));
    const el = await empty.list(null, 10);
    check('폴더가 없으면 빈 목록', el.ok && el.items.length === 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

section('폴더 저장소 — 항목을 확인하지 못하면 조용히 빼지 않음(R2 STOR-2)');
{
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ex-ref04-r2-stat-'));
  const opsDir = path.join(dir, ...OP_FOLDER.split('/'));
  try {
    const ls = localEvidenceStore(dir);
    const seeded: Op[] = [];
    for (let i = 0; i < 5; i++) {
      const w = await writeOp(ls, { kind: 'register', actor: ACTOR_A, requestKey: `req-stat-${String(i).padStart(4, '0')}`, payload: reg({ use: { itemId: `stat-${i}` } }) }, nextNow());
      if (w.status === 'saved') seeded.push(mkOp('register', ACTOR_A, w.receipt.requestKey, reg({ use: { itemId: `stat-${i}` } }), w.receipt.receivedAt));
    }
    const base = await loadLibrary(ls, undefined, FAST);
    check('준비: 기록 5개 · 쓰임 5개', seeded.length === 5 && base.ok && base.library.opCount === 5 && base.library.useCount === 5, reasonOf(base));

    /* 스스로를 가리키는 링크(고리) — 기록 이름 모양. stat 이 ELOOP → 그 쪽 전체 실패 */
    const loop = `${'d'.repeat(64)}.json`;
    await symlink(loop, path.join(opsDir, loop));
    const lp = await ls.list(null, 100);
    check('기록 이름의 고리 링크 → list 실패 unavailable(조용히 빼지 않음)', !lp.ok && lp.reason === 'unavailable', JSON.stringify(lp.ok ? { n: lp.items.length } : lp));
    const ll = await loadLibrary(ls, undefined, FAST);
    check('고리 링크 → loadLibrary 도 unavailable(빈 · 일부 목록을 성공으로 내지 않음)', !ll.ok && ll.reason === 'unavailable', reasonOf(ll));
    await rm(path.join(opsDir, loop));

    /* 가리키는 곳이 없는 링크 — stat 은 ENOENT 지만 이름은 그대로 있다(그새 사라진 파일이 아님) */
    const dangling = `${'e'.repeat(64)}.json`;
    await symlink(path.join(dir, 'nowhere.json'), path.join(opsDir, dangling));
    const dg = await listAllOps(ls, FAST);
    check('가리키는 곳이 없는 링크 → 전체 실패 unavailable', !dg.ok && dg.reason === 'unavailable', reasonOf(dg));
    await rm(path.join(opsDir, dangling));

    const back = await loadLibrary(ls, undefined, FAST);
    check('링크를 치우면 다시 5개 모두', back.ok && back.library.opCount === 5, reasonOf(back));

    /* 폴더는 읽히지만 들어갈 수 없음(r--) → 항목마다 stat EACCES. 관리자 권한으로 돌면 권한 검사가 없어 건너뛴다 */
    if (typeof process.getuid === 'function' && process.getuid() === 0) console.log('  건너뜀 — 관리자 권한으로 실행 중(권한 시험 불가)');
    else {
      await chmod(opsDir, 0o644);
      try {
        const pl = await listAllOps(ls, FAST);
        check('들어갈 수 없는 폴더(r--) → 전체 실패 unavailable(0개 성공이 아님)', !pl.ok && pl.reason === 'unavailable', reasonOf(pl));
        const pb = await loadLibrary(ls, undefined, FAST);
        check('들어갈 수 없는 폴더 → loadLibrary unavailable(기록 0 · 뺌 0 · 다른 객체 0 성공이 아님)', !pb.ok && pb.reason === 'unavailable', reasonOf(pb));
        const ph = await handleList(new Request('https://app.test/api/admin/review-evidence', { headers: { host: 'app.test' } }), { id: 'owner_s', role: 'ADMIN' }, { store: () => ls, cache: new Map(), storeKind: 'local-fixture', now: nextNow, write: FAST });
        const pj = (await ph.json()) as Record<string, unknown>;
        check('들어갈 수 없는 폴더 → API 목록 503 reason unavailable', ph.status === 503 && pj.reason === 'unavailable', JSON.stringify(pj));
      } finally {
        await chmod(opsDir, 0o755);
      }
    }

    /* 하위 폴더는 예전처럼 세지 않고 조용히 지나간다(약속 그대로) */
    mkdirSync(path.join(opsDir, 'subdir-keep'));
    const sd = await loadLibrary(ls, undefined, FAST);
    check('하위 폴더는 세지 않고 성공(예전 약속 그대로)', sd.ok && sd.library.opCount === 5 && sd.library.foreignObjects === 0, reasonOf(sd));
  } finally {
    await chmod(opsDir, 0o755).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

section('폴더 저장소 — 이름 차례 쪽 넘기기(2000개 넘게 · 넘기는 사이 새 파일)');
{
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ex-ref04-r2-local-'));
  try {
    const ls = localEvidenceStore(dir);
    const opsDir = path.join(dir, ...OP_FOLDER.split('/'));
    mkdirSync(opsDir, { recursive: true });
    const names = Array.from({ length: 2100 }, (_, i) => hexName(50_000 + i)).sort(cmpName);
    for (const n of names) writeFileSync(path.join(opsDir, n), '{}');
    writeFileSync(path.join(opsDir, '.tmp-1-abcdef0123456789'), '{"half":');
    mkdirSync(path.join(opsDir, 'subdir'));
    const plain = await listAllOps(ls, FAST);
    const got = namesOf(plain);
    check('폴더 2100개(+ 임시 파일 · 하위 폴더): 2100개 정확히 한 번 · 이름 차례', plain.ok && got.length === 2100 && new Set(got).size === 2100 && strictlyIncreasing(got) && got.every((x, i) => x === names[i]), plain.ok ? String(got.length) : reasonOf(plain));
    check(`폴더: 쪽 ${Math.ceil(2100 / LIST_PAGE)}번`, plain.ok && plain.pages === Math.ceil(2100 / LIST_PAGE), plain.ok ? String(plain.pages) : '');

    const before: string[] = [];
    const after: string[] = [];
    const wrapped: EvidenceObjectStore = {
      createOnly: (k, b) => ls.createOnly(k, b),
      read: (k, m) => ls.read(k, m),
      list: async (cursor, limit) => {
        if (cursor !== null) {
          /* 표 바로 앞(이미 지나감)과 바로 뒤(아직 안 옴)에 새 파일 — 다음 쪽을 묻기 직전에 */
          const stem = cursor.slice(0, -'.json'.length);
          const b = `${stem}-a.json`;
          const a = `${cursor}z`;
          writeFileSync(path.join(opsDir, b), '{}');
          writeFileSync(path.join(opsDir, a), '{}');
          before.push(b);
          after.push(a);
        }
        return ls.list(cursor, limit);
      },
    };
    const conc = await listAllOps(wrapped, FAST);
    const cg = namesOf(conc);
    const count = (x: string) => cg.filter((g) => g === x).length;
    check('폴더 · 넘기는 사이 새 파일: 성공 · 겹침 없음 · 늘 커지는 차례', conc.ok && new Set(cg).size === cg.length && strictlyIncreasing(cg), reasonOf(conc));
    check('폴더 · 넘기는 사이 새 파일: 앞부터 있던 2100개 모두 정확히 한 번', names.every((x) => count(x) === 1));
    check('폴더 · 넘기는 사이 새 파일: 표 뒤 새 파일은 나오고, 표 앞 새 파일은 이번에 안 나옴', after.length === 2 && after.every((x) => count(x) === 1) && before.every((x) => count(x) === 0), `뒤 ${after.length} · 앞 ${before.length}`);
    const again = await listAllOps(ls, FAST);
    check('폴더 · 다음 번 모으기에는 그 새 파일이 모두 나옴', again.ok && [...before, ...after].every((x) => namesOf(again).includes(x)) && namesOf(again).length === 2100 + 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ═══════════════ 8. 학습 자료실 보존 · 화면 정적 검사 ═══════════════ */

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

section('관리자 참고자료(EX-REF02) 파일 보존');
{
  const manifest = '/tmp/EX-REF04-study-preserve-sha256.json';
  if (!existsSync(manifest)) console.log('  건너뜀 — 보존 목록 파일 없음');
  else {
    const want = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, string>;
    for (const [rel, sha] of Object.entries(want)) {
      const p = path.join(ROOT, rel);
      const got = existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : '(없음)';
      check(`그대로: ${rel}`, got === sha, got === sha ? '' : `sha256 ${got.slice(0, 12)}…`);
    }
  }
}

section('화면 정적 검사(app/(app)/admin/review-evidence)');
{
  const uiDir = path.join(ROOT, 'app', '(app)', 'admin', 'review-evidence');
  if (!existsSync(uiDir)) console.log('  건너뜀 — 화면 파일이 아직 없음');
  else {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(n)) files.push(p);
      }
    };
    walk(uiDir);
    const pages = files.filter((f) => path.basename(f).startsWith('page.'));
    if (!pages.length) console.log('  참고: page 파일이 아직 없음');
    for (const p of pages) check(`requireAdmin: ${path.relative(ROOT, p)}`, readFileSync(p, 'utf8').includes('requireAdmin'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const rel = path.relative(ROOT, f);
      check(`dangerouslySetInnerHTML 없음: ${rel}`, !src.includes('dangerouslySetInnerHTML'));
      check(`iframe · video 없음: ${rel}`, !/<iframe|<video/i.test(src));
      let bad = 0;
      let at = src.indexOf('target="_blank"');
      while (at !== -1) {
        const start = src.lastIndexOf('<', at);
        let end = at;
        while (end < src.length && !(src[end] === '>' && src[end - 1] !== '=')) end++;
        if (!src.slice(start, end).includes('rel="noopener noreferrer"')) bad++;
        at = src.indexOf('target="_blank"', at + 1);
      }
      check(`새 창 링크에 rel="noopener noreferrer": ${rel}`, bad === 0, bad ? `${bad}곳 빠짐` : '');
    }
  }
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed) process.exit(1);
