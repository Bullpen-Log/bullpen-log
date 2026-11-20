/**
 * EX-REF04 R2 — 검수 근거자료 운영 연결 끝-끝 시험(내 컴퓨터 시험 서버만).
 *   node --import ./scripts/alias-register.mjs scripts/review-evidence-ops-selftest.mts
 *
 * 무엇을 보나: 진짜 등록 도구(scripts/review-evidence-registrar.mjs)를 자식 프로세스로 부르고, 진짜 API 처리
 * (lib/review-evidence/api.ts 의 handleList · handleRegister · handleImport)를 127.0.0.1 의 아무 포트에 올린 시험 서버로
 * 받는다. 저장소는 임시 폴더의 시험 저장소(localEvidenceStore, storeKind 'local-fixture')다. 중앙 저장소 · DB · 바깥 네트워크 ·
 * 진짜 로그인 표(LoginTicket)에는 닿지 않는다. 시험 저장소에 들어간 것은 중앙 등록이 아니다 — 이 시험의 어떤 이름 · 기록 · 출력도
 * 그것을 중앙 등록으로 적지 않는다.
 *
 * 시험 서버의 약속(진짜와 같게):
 *  - 보는 사람은 쿠키 session=<표> 하나로만 정한다. 표는 이 시험 서버가 낸다. 모르는 표 · 거둔 표면 보는 사람 없음(401),
 *    일반 회원이면 403. 역할은 그때그때 사람 표에서 읽는다(진짜 getCurrentUser 처럼 — 로그인 뒤 역할이 바뀌면 바로 먹는다).
 *  - 코드 로그인은 app/actions/login-ticket.ts 와 같은 차례: POST /api/rpc/login-ticket.createLoginTicket · .claimLoginTicket,
 *    x-bullpen-app 머리(lib/app-api.ts 의 판 규칙), 8자 코드(lib/login-ticket.ts), 상태 waiting · approved · expired · used,
 *    승인되면 Set-Cookie session. 승인은 시험이 부르는 함수(로그인한 브라우저에서 사람이 승인하는 자리 대신)다.
 *  - 도구가 보낸 요청의 머리(host · sec-fetch-* · origin 등)를 더하거나 빼지 않고 그대로 WHATWG Request 로 옮긴다 —
 *    요청 출처 검사(checkWriteRequest)는 도구의 진짜 요청으로 지나가야 한다.
 *
 * 흉내 낸 컴퓨터: 상태 폴더(REVIEW_EVIDENCE_STATE_DIR)를 따로 둔 yunho-macmini · yunho-macbook · kimmin-mac(그리고 시험용 둘).
 * 같은 컴퓨터 안의 폴더 둘이라 실제 두 번째 맥에서 받고 쓰는 것을 확인한 것은 아니다.
 * 도구는 진짜 상태 폴더(<git 공통 폴더>/review-evidence-registrar-v1 · ~/.bullpen-review-evidence-v1)를 쓰지 않는다 — 끝에 확인한다.
 *
 * R2 보완(자체 검토 뒤): 대기에만 있는 인용의 audit(6) · 다른 검수 번호의 같은 링크(10) · 같은 맥에서 거둔 뒤 다시 등록 · 되살린 뒤 다시
 * 거두기(16) · 다른 맥의 늦은 거두기 · 늦은 등록은 밀림, 이미 거둔 쓰임, 옛 내용 다시 등록은 새 시각으로 한 번(17 — 진짜 받음표의
 * useState · applied · supersededBy).
 *
 * REVIEW_EVIDENCE_OPS_REPORT=<파일> 이면 가린(표 · 지어낸 비밀 글자 없음) 기록 · 장부를 그 파일에 JSON 으로 남긴다.
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleImport, handleList, handleRegister, type ApiDeps, type ApiViewer } from '../lib/review-evidence/api.ts';
import { LIST_FAILURE_TEXT } from '../lib/review-evidence/http.ts';
import { localEvidenceStore } from '../lib/review-evidence/local-store.ts';
import { OP_FOLDER } from '../lib/review-evidence/model.ts';
import { checkedOp, type EvidenceObjectStore, type OpCache } from '../lib/review-evidence/store.ts';
import { isTicketCode, makeTicketCode, normalizeTicketCode, ticketStateOf, TICKET_TTL_MS } from '../lib/login-ticket.ts';
import { appApiLevelOf, MIN_APP_API, minAppApiForAction } from '../lib/app-api.ts';

/* 도구가 내는 JSON 은 모양이 명령마다 달라 느슨하게 읽는다(값은 시험마다 하나씩 확인한다) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CLI = path.join(HERE, 'review-evidence-registrar.mjs');
const ALIAS_REGISTER = path.join(HERE, 'alias-register.mjs');
const API_PATH = '/api/admin/review-evidence';
const IMPORT_PATH = '/api/admin/review-evidence/import';

/* 지어낸 비공개 서명 링크 — 이 글자가 출력 · 상태 폴더 · 시험 저장소 · 서버가 받은 본문 어디에도 나오면 안 된다 */
const SECRET_MARK = 'SECRETTOKEN0123456789';
const SECRET_URL = `https://abcdefgh.supabase.co/storage/v1/object/sign/pitch-videos/a.mp4?token=${SECRET_MARK}`;

/* 지어낸 PubMed 번호(시험 출처). 바깥에 묻지 않는다(--lookup-ncbi 를 쓰지 않음) */
const pm = (n: number) => `https://pubmed.ncbi.nlm.nih.gov/${n}/`;
const U1 = pm(39000001); // 쓰임 A(yunho · EX-OPS-001 · ITEM-A) — 다른 컴퓨터 · 다른 사람 · 다른 분야 시험의 중심
const U_LOST = pm(39000002);
const U_SLOW = pm(39000003);
const U_DOWN = pm(39000004);
const U5 = pm(39000005); // kimmin 만 등록
const U_REVOKE = pm(39000006);
const U_OUTAGE = pm(39000007);
const U_LISTFAIL = pm(39000008);
const U9 = pm(39000009); // 아무도 등록하지 않음
const U_MEMBER = pm(39000010);
/* R2 보완(REG-1): 거두기 · 되살리기 · 다른 맥의 늦은 요청 */
const U_W1 = pm(39000011);
const U_W2 = pm(39000012);
const U_W3 = pm(39000013);
const U_W4 = pm(39000014);
const U_W5 = pm(39000015);
const U_W6 = pm(39000016);

/* ───────── 확인 · 기록 ───────── */

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` · ${detail}` : ''}`);
  }
  console.log(`  ${cond ? 'OK  ' : '실패'} ${name}${!cond && detail ? ` · ${detail}` : ''}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ───────── 시험 계정 · 표 · 코드 로그인(진짜 DB 대신 메모리) ───────── */

type Role = 'ADMIN' | 'USER';
type FxUser = { key: string; id: string; role: Role; nickname: string };
const USERS: Record<'yunho' | 'kimmin' | 'member', FxUser> = {
  yunho: { key: 'yunho', id: 'fx-user-yunho', role: 'ADMIN', nickname: '금윤호' },
  kimmin: { key: 'kimmin', id: 'fx-user-kimmin', role: 'ADMIN', nickname: '김민' },
  member: { key: 'member', id: 'fx-user-member', role: 'USER', nickname: '일반회원' },
};
type UserKey = keyof typeof USERS;
const userById = (id: string) => Object.values(USERS).find((u) => u.id === id) ?? null;

type FxSession = { userKey: UserKey; revoked: boolean; via: 'device-code' | 'stdin' | 'harness' };
const SESSIONS = new Map<string, FxSession>();
/** 이 시험 서버가 낸 모든 표 — 도구 출력 · 저장 파일에 나오면 안 된다(session.json 만 예외) */
const ISSUED_TOKENS: string[] = [];

function issueToken(userKey: UserKey, via: FxSession['via']): string {
  const token = `fx.${randomBytes(18).toString('base64url')}.${randomBytes(18).toString('base64url')}`;
  SESSIONS.set(token, { userKey, revoked: false, via });
  ISSUED_TOKENS.push(token);
  return token;
}

type FxTicket = { code: string; expiresAt: Date; userId: string | null; claimedAt: Date | null };
const TICKETS = new Map<string, FxTicket>();
const cryptoRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** 로그인한 브라우저에서 사람이 /link/<코드> 를 승인하는 자리 대신(approveLoginTicket 과 같은 조건) */
function approveTicket(rawCode: string, userKey: UserKey): boolean {
  const code = normalizeTicketCode(rawCode);
  const t = TICKETS.get(code);
  if (!isTicketCode(code) || !t || t.userId !== null || t.claimedAt !== null || t.expiresAt.getTime() <= Date.now()) return false;
  t.userId = USERS[userKey].id;
  return true;
}

/** claimLoginTicket 과 같은 판정 — 승인된 코드를 한 번만 세션으로 바꾼다 */
function claimTicket(input: unknown): { state: 'waiting' | 'approved' | 'expired' | 'used'; token?: string } {
  const raw = input && typeof input === 'object' ? (input as { code?: unknown }).code : undefined;
  const code = normalizeTicketCode(String(raw ?? ''));
  if (!isTicketCode(code)) return { state: 'expired' };
  const now = new Date();
  const t = TICKETS.get(code);
  if (!t) return { state: 'expired' };
  const state = ticketStateOf(t, now);
  if (state !== 'approved' || !t.userId) return { state };
  if (t.claimedAt) return { state: 'used' };
  t.claimedAt = now;
  const user = userById(t.userId);
  if (!user) return { state: 'expired' };
  return { state: 'approved', token: issueToken(user.key as UserKey, 'device-code') };
}

function viewerFromCookie(cookie: string | undefined): ApiViewer {
  const token = /(?:^|;\s*)session=([^;]*)/.exec(cookie ?? '')?.[1];
  if (!token) return null;
  const s = SESSIONS.get(token);
  if (!s || s.revoked) return null;
  const u = USERS[s.userKey];
  return { id: u.id, role: u.role, nickname: u.nickname };
}

/* ───────── 시험 서버(진짜 API 처리 + 시험 저장소) ───────── */

type Fault = { kind: 'drop-after-write' } | { kind: 'delay-then-handle'; ms: number };
type StoreMode = 'ok' | 'list-unavailable' | 'list-unsupported' | 'outage';
type ReqLog = {
  server: string;
  method: string;
  path: string;
  status: number | 'dropped' | 'late';
  user: string | null;
  xReviewEvidence: string | null;
  contentType: string | null;
  origin: string | null;
  secFetchSite: string | null;
  secFetchMode: string | null;
  cacheControl: string | null;
  bodyHasSecret: boolean;
};

function readAll(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 도구가 보낸 요청을 그대로(머리 더하기 · 빼기 없이) WHATWG Request 로 */
function toRequest(req: http.IncomingMessage, body: Buffer): Request {
  const headers = new Headers();
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = new Uint8Array(body);
  return new Request(`http://${req.headers.host ?? '127.0.0.1'}${req.url ?? '/'}`, init);
}

async function sendResponse(res: http.ServerResponse, response: Response): Promise<void> {
  const buf = Buffer.from(await response.arrayBuffer());
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });
  res.writeHead(response.status, headers);
  res.end(buf);
}

function sendJson(res: http.ServerResponse, status: number, obj: unknown, extra: Record<string, string | string[]> = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(obj));
}

class FixtureServer {
  name: string;
  dir: string;
  cache: OpCache = new Map();
  port = 0;
  server: http.Server | null = null;
  storeMode: StoreMode = 'ok';
  faults: Fault[] = [];
  log: ReqLog[] = [];
  inflight = new Set<Promise<void>>();

  constructor(name: string, dir: string) {
    this.name = name;
    this.dir = dir;
  }

  get base() {
    return `http://127.0.0.1:${this.port}`;
  }

  /** 시험 저장소 — 모드에 따라 목록만 · 전부 실패하게 감싼다(실패한 쪽 객체는 건드리지 않음) */
  store(): EvidenceObjectStore {
    const real = localEvidenceStore(this.dir);
    if (this.storeMode === 'list-unavailable') return { ...real, list: async () => ({ ok: false, reason: 'unavailable' }) };
    if (this.storeMode === 'list-unsupported') return { ...real, list: async () => ({ ok: false, reason: 'unsupported' }) };
    if (this.storeMode === 'outage')
      return {
        createOnly: async () => 'error',
        read: async () => ({ ok: false, reason: 'unavailable' }),
        list: async () => ({ ok: false, reason: 'unavailable' }),
      };
    return real;
  }

  start(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        res.on('error', () => {});
        const p = this.handle(req, res).catch(() => {
          try {
            if (!res.headersSent && !res.destroyed) sendJson(res, 500, { ok: false, error: 'server' });
          } catch {
            /* 이미 닫힘 */
          }
        });
        this.inflight.add(p);
        void p.finally(() => this.inflight.delete(p));
      });
      srv.once('error', reject);
      srv.listen(port, '127.0.0.1', () => {
        this.server = srv;
        this.port = (srv.address() as net.AddressInfo).port;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    const srv = this.server;
    if (!srv) return;
    this.server = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
      srv.closeAllConnections();
    });
  }

  async settle(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const method = req.method ?? 'GET';
    const body = await readAll(req);
    const viewer = viewerFromCookie(req.headers.cookie);
    const entry: ReqLog = {
      server: this.name,
      method,
      path: url.pathname,
      status: 0,
      user: viewer && viewer !== 'gate-error' ? (userById(viewer.id)?.key ?? null) : null,
      xReviewEvidence: (req.headers['x-review-evidence'] as string | undefined) ?? null,
      contentType: (req.headers['content-type'] as string | undefined) ?? null,
      origin: (req.headers.origin as string | undefined) ?? null,
      secFetchSite: (req.headers['sec-fetch-site'] as string | undefined) ?? null,
      secFetchMode: (req.headers['sec-fetch-mode'] as string | undefined) ?? null,
      cacheControl: null,
      bodyHasSecret: body.includes(SECRET_MARK),
    };
    this.log.push(entry);

    /* 코드 로그인(app/api/rpc/[action]/route.ts 의 판 검사 + app/actions/login-ticket.ts 의 차례) */
    if (url.pathname.startsWith('/api/rpc/')) {
      const action = url.pathname.slice('/api/rpc/'.length);
      const level = appApiLevelOf((req.headers['x-bullpen-app'] as string | undefined) ?? null);
      if (method !== 'POST') return void sendJson(res, (entry.status = 405), { ok: false });
      if (level < MIN_APP_API || level < minAppApiForAction(action)) return void sendJson(res, (entry.status = 426), { ok: false, error: 'update', min: MIN_APP_API });
      let args: unknown[];
      try {
        const parsed = JSON.parse(body.toString('utf8')) as { args?: unknown };
        args = Array.isArray(parsed.args) ? parsed.args : [];
      } catch {
        return void sendJson(res, (entry.status = 400), { ok: false, error: 'bad-body' });
      }
      if (action === 'login-ticket.createLoginTicket') {
        const code = makeTicketCode(cryptoRandom);
        const t: FxTicket = { code, expiresAt: new Date(Date.now() + TICKET_TTL_MS), userId: null, claimedAt: null };
        TICKETS.set(code, t);
        return void sendJson(res, (entry.status = 200), { ok: true, result: { code, expiresAt: t.expiresAt.toISOString() } });
      }
      if (action === 'login-ticket.claimLoginTicket') {
        const r = claimTicket(args[0]);
        const extra: Record<string, string[]> = {};
        if (r.token) extra['set-cookie'] = [`session=${r.token}; Path=/; Expires=${new Date(Date.now() + 30 * 864e5).toUTCString()}; HttpOnly; SameSite=lax`];
        return void sendJson(res, (entry.status = 200), { ok: true, result: { state: r.state } }, extra);
      }
      return void sendJson(res, (entry.status = 404), { ok: false, error: 'unknown-action' });
    }

    if (url.pathname !== API_PATH && url.pathname !== IMPORT_PATH) return void sendJson(res, (entry.status = 404), { ok: false, error: 'not_found' });
    const deps: ApiDeps = { store: () => this.store(), storeKind: 'local-fixture', cache: this.cache };
    const request = toRequest(req, body);
    let response: Response;
    if (url.pathname === API_PATH && method === 'GET') response = await handleList(request, viewer, deps);
    else if (url.pathname === API_PATH && method === 'POST') {
      const fault = this.faults.shift();
      if (fault?.kind === 'delay-then-handle') {
        /* 도구가 기다림을 그만둔 뒤에야 처리한다(늦게 저장됨). 응답은 닫힌 연결에 쓰지 않는다 */
        await sleep(fault.ms);
        response = await handleRegister(request, viewer, deps);
        entry.status = 'late';
        entry.cacheControl = response.headers.get('cache-control');
        if (res.destroyed || req.socket.destroyed) return;
        await sendResponse(res, response);
        return;
      }
      response = await handleRegister(request, viewer, deps);
      if (fault?.kind === 'drop-after-write') {
        /* 저장은 끝났는데 응답이 가지 않음 */
        entry.status = 'dropped';
        entry.cacheControl = response.headers.get('cache-control');
        req.socket.destroy();
        return;
      }
    } else if (url.pathname === IMPORT_PATH && method === 'POST') response = await handleImport(request, viewer, deps);
    else return void sendJson(res, (entry.status = 405), { ok: false, error: 'method' });
    entry.status = response.status;
    entry.cacheControl = response.headers.get('cache-control');
    await sendResponse(res, response);
  }
}

/* ───────── 흉내 낸 컴퓨터 · 도구 부르기 ───────── */

type Machine = { name: string; stateDir: string; home: string; repo: string };
type CliResult = { code: number | null; out: Loose; stdout: string; stderr: string };
type Transcript = { machine: string; args: string[]; code: number | null; stdout: string; stderr: string };
const TRANSCRIPT: Transcript[] = [];

let TMP = '';
function machine(name: string): Machine {
  const base = path.join(TMP, 'machines', name);
  const m = { name, stateDir: path.join(base, 'state'), home: path.join(base, 'home'), repo: path.join(base, 'repo') };
  fs.mkdirSync(m.home, { recursive: true });
  fs.mkdirSync(m.repo, { recursive: true });
  return m;
}

/** 자식 프로세스 환경 — 물려받지 않고 필요한 것만(NODE_OPTIONS 등 이 시험의 설정이 도구로 새지 않게) */
const childEnv = (extra: Record<string, string>) => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', ...extra }) as unknown as NodeJS.ProcessEnv;

function cli(m: Machine, args: string[], opts: { stdin?: string; onStderr?: (all: string) => void } = {}): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: m.repo,
      env: childEnv({ HOME: m.home, LANG: 'ko_KR.UTF-8', REVIEW_EVIDENCE_STATE_DIR: m.stateDir, REVIEW_EVIDENCE_POLL_MS: '100' }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
      opts.onStderr?.(stderr);
    });
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
    else child.stdin.end();
    child.on('close', (code) => {
      const line = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
      let out: Loose = null;
      try {
        out = JSON.parse(line);
      } catch {
        out = null;
      }
      TRANSCRIPT.push({ machine: m.name, args, code, stdout, stderr });
      resolve({ code, out, stdout, stderr });
    });
  });
}

/** 코드 로그인 — 도구가 오류 출력에 보인 코드를 읽어 시험 함수로 승인한다(사람이 승인하는 자리 대신) */
async function deviceLogin(m: Machine, base: string, userKey: UserKey, act: (code: string) => void = (code) => void approveTicket(code, userKey)) {
  let seen: string | null = null;
  const r = await cli(m, ['login', '--base', base], {
    onStderr: (all) => {
      const hit = /\/link\/([A-Z2-9]{8})\b/.exec(all);
      if (hit && !seen) {
        seen = hit[1];
        act(hit[1]);
      }
    },
  });
  return { ...r, code8: seen as string | null };
}

const stdinLogin = (m: Machine, base: string, token: string) => cli(m, ['login', '--base', base, '--session-stdin'], { stdin: `${token}\n` });

/* ───────── 시험 저장소 · 상태 폴더 읽기 ───────── */

let FIXTURE_DIR = '';
const opsDir = () => path.join(FIXTURE_DIR, ...OP_FOLDER.split('/'));
function opFiles(): string[] {
  try {
    return fs.readdirSync(opsDir()).filter((n) => /^[0-9a-f]{64}\.json$/.test(n));
  } catch {
    return [];
  }
}
const opsCount = () => opFiles().length;
type OpRow = { name: string; requestKey: string; userId: string; kind: string; parsed: boolean };
function opRows(): OpRow[] {
  return opFiles().map((name) => {
    const text = fs.readFileSync(path.join(opsDir(), name), 'utf8');
    const op = checkedOp(text, name.slice(0, -5));
    return { name, requestKey: op?.requestKey ?? '', userId: op?.actor.userId ?? '', kind: op?.kind ?? '', parsed: !!op };
  });
}
const opsForKey = (requestKey: string) => opRows().filter((r) => r.requestKey === requestKey).length;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const n of names) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) walk(p);
      else if (n.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out;
}
const countJson = (dir: string) => {
  try {
    return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).length;
  } catch {
    return 0;
  }
};
const pendingCount = (m: Machine) => countJson(path.join(m.stateDir, 'pending'));
const rejectedCount = (m: Machine) => countJson(path.join(m.stateDir, 'rejected'));
const fixtureReceiptCount = (m: Machine) => countJson(path.join(m.stateDir, 'fixture-receipts'));
const modeOf = (p: string) => fs.statSync(p).mode & 0o777;

/* ───────── 시험이 직접 묻는 목록(시험용 표, 도구와 별개) ───────── */

const HARNESS_TOKENS = new Map<UserKey, string>();
async function apiGet(server: FixtureServer, userKey: UserKey | null, summary = false): Promise<{ status: number; json: Loose; cacheControl: string | null }> {
  let token: string | undefined;
  if (userKey) {
    token = HARNESS_TOKENS.get(userKey);
    if (!token) {
      token = issueToken(userKey, 'harness');
      HARNESS_TOKENS.set(userKey, token);
    }
  }
  const r = await fetch(`${server.base}${API_PATH}${summary ? '?view=summary' : ''}`, { headers: token ? { cookie: `session=${token}` } : {} });
  const json = (await r.json().catch(() => null)) as Loose;
  return { status: r.status, json, cacheControl: r.headers.get('cache-control') };
}
async function apiPost(server: FixtureServer, userKey: UserKey | null, p: string, body: string, headers: Record<string, string>) {
  let token: string | undefined;
  if (userKey) {
    token = HARNESS_TOKENS.get(userKey);
    if (!token) {
      token = issueToken(userKey, 'harness');
      HARNESS_TOKENS.set(userKey, token);
    }
  }
  const r = await fetch(`${server.base}${p}`, { method: 'POST', body, headers: { ...headers, ...(token ? { cookie: `session=${token}` } : {}) } });
  return { status: r.status, json: (await r.json().catch(() => null)) as Loose };
}

const allUses = (lib: Loose): Loose[] => (Array.isArray(lib?.sources) ? lib.sources.flatMap((s: Loose) => (Array.isArray(s.uses) ? s.uses.map((u: Loose) => ({ ...u, sourceId: s.id, latestConsultedOn: s.latestConsultedOn })) : [])) : []);
const useById = (lib: Loose, useId: string) => allUses(lib).find((u) => u.useId === useId) ?? null;

/* ───────── 도구 출력 안의 금지 글자 ───────── */

const CENTRAL_SUCCESS = [/"central"\s*:\s*true/, /"store"\s*:\s*"central"/, /"status"\s*:\s*"(registered|already-registered|withdrawn|already-withdrawn)"/];
const leaksIn = (text: string) => ({ token: ISSUED_TOKENS.some((t) => text.includes(t)), secret: text.includes(SECRET_MARK) });

/* ───────── 등록 인자 ───────── */

type RegisterArgs = {
  url: string;
  domain?: 'exercise' | 'mechanics';
  review: string;
  item?: string;
  purpose?: string;
  consulted?: string;
  application?: string;
  fixtureOk?: boolean;
  extra?: string[];
};
function registerArgs(a: RegisterArgs): string[] {
  const out = [
    'register',
    '--url',
    a.url,
    '--domain',
    a.domain ?? 'exercise',
    '--review',
    a.review,
    '--purpose',
    a.purpose ?? 'description',
    '--application',
    a.application ?? '시험: 설명 문장의 근거로 확인했어요.',
    '--consulted',
    a.consulted ?? '2026-11-18',
    '--reading',
    'abstract',
    '--kind',
    'original-research',
  ];
  if (a.item) out.push('--item', a.item);
  if (a.fixtureOk) out.push('--fixture-ok');
  if (a.extra) out.push(...a.extra);
  return out;
}

/** 시험마다 시험 저장소 기록 수가 몇 늘었나(장부) */
type LedgerRow = { scenario: string; before: number; after: number; delta: number; expected: number; ok: boolean; note: string };
const LEDGER: LedgerRow[] = [];

async function scenario(name: string, expected: number, note: string, servers: FixtureServer[], fn: () => Promise<void>) {
  console.log(`\n[${name}]`);
  for (const s of servers) await s.settle();
  const before = opsCount();
  try {
    await fn();
  } catch (e) {
    check(`${name}: 시험 코드가 멈추지 않고 끝남`, false, String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | '));
  }
  for (const s of servers) await s.settle();
  const after = opsCount();
  const ok = after - before === expected;
  check(`${name}: 시험 저장소 기록 수가 ${expected} 늘어남(장부)`, ok, `before ${before} · after ${after}`);
  LEDGER.push({ scenario: name, before, after, delta: after - before, expected, ok, note });
}

/** 다른 프로세스에서 같은 시험 폴더를 다시 읽는다(서버 메모리 · 캐시와 무관하게 파일에 남았나) */
function readbackInChild(): Loose {
  const script = path.join(TMP, 'readback.mjs');
  fs.writeFileSync(
    script,
    [
      `import { localEvidenceStore } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'lib/review-evidence/local-store.ts')).href)};`,
      `import { loadLibrary } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'lib/review-evidence/store.ts')).href)};`,
      'const r = await loadLibrary(localEvidenceStore(process.argv[2]));',
      "console.log(JSON.stringify(r.ok ? { ok: true, ops: r.ops.length, uses: r.library.useCount, sources: r.library.sources.length, skippedOps: r.library.skippedOps, useIds: r.library.sources.flatMap((s) => s.uses.map((u) => u.useId)).sort() } : { ok: false, reason: r.reason }));",
    ].join('\n'),
  );
  const out = execFileSync(process.execPath, ['--import', pathToFileURL(ALIAS_REGISTER).href, script, FIXTURE_DIR], { cwd: ROOT, encoding: 'utf8', env: childEnv({ HOME: TMP }), stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.trim().split('\n').pop() ?? 'null');
}

function refused(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', (e: NodeJS.ErrnoException) => resolve(e.code === 'ECONNREFUSED'));
  });
}

function writeRecords(file: string, records: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(records, null, 2));
}

/* ───────── 시험 ───────── */

async function main() {
  const t0 = Date.now();
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-ref04-ops-'));
  FIXTURE_DIR = path.join(TMP, 'fixture-store');
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  /* 진짜 상태 폴더 — 시험 전에도 없어야 하고 끝에도 없어야 한다 */
  let gitCommon: string | null = null;
  try {
    gitCommon = path.resolve(ROOT, execFileSync('git', ['-C', ROOT, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    gitCommon = null;
  }
  const REAL_STATE_DIRS = [gitCommon ? path.join(gitCommon, 'review-evidence-registrar-v1') : null, path.join(os.homedir(), '.bullpen-review-evidence-v1')].filter((p): p is string => !!p);
  const realBefore = REAL_STATE_DIRS.map((p) => fs.existsSync(p));

  const S = new FixtureServer('main', FIXTURE_DIR);
  await S.start();
  const BASE = S.base;
  const macmini = machine('yunho-macmini');
  const macbook = machine('yunho-macbook');
  const kimminMac = machine('kimmin-mac');
  const memberMac = machine('member-mac');
  const strangerMac = machine('stranger-mac');
  const probe = machine('login-probe');
  const MACHINES = [macmini, macbook, kimminMac, memberMac, strangerMac, probe];
  console.log(`시험 서버 ${BASE}(store local-fixture) · 임시 폴더 준비`);

  /* 쓰임 A 의 번호들(시험 3 에서 정함) */
  let useA = '';
  let sourceA = '';
  let rkS4 = '';
  let macminiToken = '';

  /* 1. 코드 로그인 */
  await scenario('1 코드 로그인(yunho-macmini) · status', 0, '로그인 · 확인만', [S], async () => {
    const r = await deviceLogin(macmini, BASE, 'yunho');
    check('1.1 코드가 오류 출력에 보이고 8자 코드 규칙을 지킴', !!r.code8 && isTicketCode(r.code8 ?? ''));
    check('1.2 로그인 끝 번호 0 · logged-in', r.code === 0 && r.out?.status === 'logged-in', `code ${r.code} · ${r.out?.status}`);
    check('1.3 로그인 출력: store local-fixture · central false · viewerLabel 금윤호', r.out?.store === 'local-fixture' && r.out?.central === false && r.out?.viewerLabel === '금윤호');
    check('1.4 로그인이 중앙 저장소가 아니라고 알림', /중앙 저장소가 아니라/.test(r.stderr));
    const sessFile = path.join(macmini.stateDir, 'session.json');
    const sess = JSON.parse(fs.readFileSync(sessFile, 'utf8')) as { base: string; session: string };
    macminiToken = sess.session;
    const s = SESSIONS.get(sess.session);
    check('1.5 저장한 세션이 이 시험 서버가 코드 로그인으로 낸 yunho 표', s?.userKey === 'yunho' && s?.via === 'device-code' && sess.base === BASE);
    check('1.6 session.json 0600 · 상태 폴더 0700', modeOf(sessFile) === 0o600 && modeOf(macmini.stateDir) === 0o700, `${modeOf(sessFile).toString(8)} · ${modeOf(macmini.stateDir).toString(8)}`);
    check('1.7 표가 표준 출력 · 오류 출력에 없음', !leaksIn(r.stdout + r.stderr).token);
    const st = await cli(macmini, ['status']);
    check('1.8 status 끝 번호 0', st.code === 0, `code ${st.code}`);
    check(
      '1.9 status: store local-fixture · central false · apiVersion 2 · auditSupported · perMachine · loopback',
      st.out?.store === 'local-fixture' && st.out?.central === false && st.out?.apiVersion === 2 && st.out?.auditSupported === true && st.out?.perMachine === true && st.out?.loopback === true,
      JSON.stringify({ store: st.out?.store, central: st.out?.central, apiVersion: st.out?.apiVersion, audit: st.out?.auditSupported }),
    );
    check('1.10 status 의 상태 폴더 = 이 컴퓨터의 시험 폴더', st.out?.stateDir === macmini.stateDir);
    check('1.11 status 출력에 표가 없음', !leaksIn(st.stdout + st.stderr).token);

    /* 코드가 지남 · 이미 쓴 코드 — 세션을 저장하지 않는다 */
    const exp = await deviceLogin(probe, BASE, 'yunho', (code) => {
      const t = TICKETS.get(code);
      if (t) t.expiresAt = new Date(Date.now() - 1000);
    });
    check('1.12 지난 코드 → 끝 번호 4 · login-failed expired · 세션 저장 없음', exp.code === 4 && exp.out?.status === 'login-failed' && exp.out?.error === 'expired' && !fs.existsSync(path.join(probe.stateDir, 'session.json')), `code ${exp.code} · ${exp.out?.error}`);
    const used = await deviceLogin(probe, BASE, 'yunho', (code) => {
      approveTicket(code, 'yunho');
      claimTicket({ code }); // 다른 기기가 먼저 받아 감
    });
    check('1.13 이미 쓴 코드 → 끝 번호 4 · login-failed used · 세션 저장 없음', used.code === 4 && used.out?.error === 'used' && !fs.existsSync(path.join(probe.stateDir, 'session.json')), `code ${used.code} · ${used.out?.error}`);
    const rpcNoApp = await fetch(`${BASE}/api/rpc/login-ticket.createLoginTicket`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"args":[]}' });
    check('1.14 x-bullpen-app 머리 없는 코드 요청 → 426(진짜 입구와 같은 판 검사)', rpcNoApp.status === 426);
  });

  /* 2. --session-stdin */
  await scenario('2 --session-stdin 로그인(yunho-macbook · kimmin-mac)', 0, '로그인 · 확인만', [S], async () => {
    const tb = issueToken('yunho', 'stdin');
    const rb = await stdinLogin(macbook, BASE, tb);
    check('2.1 yunho-macbook: 끝 번호 0 · 금윤호 · local-fixture · central false', rb.code === 0 && rb.out?.viewerLabel === '금윤호' && rb.out?.store === 'local-fixture' && rb.out?.central === false, `code ${rb.code}`);
    const sb = JSON.parse(fs.readFileSync(path.join(macbook.stateDir, 'session.json'), 'utf8')) as { session: string };
    check('2.2 yunho-macbook 표 ≠ yunho-macmini 표(같은 계정 · 컴퓨터마다 따로)', sb.session === tb && sb.session !== macminiToken);
    const tk = issueToken('kimmin', 'stdin');
    const rk = await stdinLogin(kimminMac, BASE, `session=${tk}; Path=/`);
    check('2.3 kimmin-mac(쿠키 모양 입력): 끝 번호 0 · 김민', rk.code === 0 && rk.out?.viewerLabel === '김민', `code ${rk.code}`);
    check('2.4 session.json 0600(두 컴퓨터)', modeOf(path.join(macbook.stateDir, 'session.json')) === 0o600 && modeOf(path.join(kimminMac.stateDir, 'session.json')) === 0o600);
    const unknownToken = `fx.${randomBytes(18).toString('base64url')}.unknown`;
    ISSUED_TOKENS.push(unknownToken); // 서버가 모르는 표지만 출력 · 파일에 나오면 안 되는 비밀로 같이 훑는다
    const unknown = await stdinLogin(strangerMac, BASE, unknownToken);
    check('2.5 모르는 표 → 401 → 끝 번호 4 · login-failed unauthenticated · 세션 저장 없음', unknown.code === 4 && unknown.out?.error === 'unauthenticated' && !fs.existsSync(path.join(strangerMac.stateDir, 'session.json')), `code ${unknown.code} · ${unknown.out?.error}`);
    check('2.6 표가 출력에 없음', ![rb, rk, unknown].some((r) => leaksIn(r.stdout + r.stderr).token));
  });

  /* 3. 쓸 때 등록(--fixture-ok) · 다시 읽기 */
  await scenario('3 쓸 때 등록 --fixture-ok · 다시 읽기', 1, '쓰임 A 첫 기록', [S], async () => {
    const r = await cli(macmini, registerArgs({ url: U1, review: 'EX-OPS-001', item: 'ITEM-A', fixtureOk: true }));
    check('3.1 끝 번호 5 · fixture-saved', r.code === 5 && r.out?.status === 'fixture-saved', `code ${r.code} · ${r.out?.status} · ${r.out?.error ?? ''}`);
    check('3.2 opId · sourceId · useId 받음', /^[0-9a-f]{64}$/.test(r.out?.opId ?? '') && typeof r.out?.sourceId === 'string' && /^use_[0-9a-f]{24}$/.test(r.out?.useId ?? ''));
    check('3.3 ok false · central false · store local-fixture · fixture true · visible · replayed false', r.out?.ok === false && r.out?.central === false && r.out?.store === 'local-fixture' && r.out?.fixture === true && r.out?.visible === true && r.out?.replayed === false);
    useA = r.out?.useId ?? '';
    sourceA = r.out?.sourceId ?? '';
    check('3.4 대기 0 · 시험 받음표 1 · 중앙 받음표(receipts.jsonl) 없음', pendingCount(macmini) === 0 && fixtureReceiptCount(macmini) === 1 && !fs.existsSync(path.join(macmini.stateDir, 'receipts.jsonl')));
    const rc = listFiles(path.join(macmini.stateDir, 'fixture-receipts'));
    const rcJson = rc.length ? (JSON.parse(fs.readFileSync(rc[0], 'utf8')) as Loose) : null;
    check('3.5 시험 받음표: store local-fixture · central false · fixture true · 본문 없음 · 0600', rcJson?.store === 'local-fixture' && rcJson?.central === false && rcJson?.fixture === true && rcJson?.bodyText === undefined && modeOf(rc[0]) === 0o600);
    const gy = await apiGet(S, 'yunho');
    const uy = useById(gy.json, useA);
    check('3.6 yunho 로 목록: 그 쓰임이 보이고 mine true · scope user · historicalReviewer null', gy.status === 200 && uy?.mine === true && uy?.scope === 'user' && uy?.historicalReviewer === null && uy?.domain === 'exercise' && uy?.reviewId === 'EX-OPS-001');
    check('3.7 목록 응답 apiVersion 2 · store local-fixture · no-store', gy.json?.apiVersion === 2 && gy.json?.store === 'local-fixture' && /no-store/.test(gy.cacheControl ?? ''));
    const gk = await apiGet(S, 'kimmin');
    check('3.8 kimmin 으로 목록: 같은 쓰임 mine false', useById(gk.json, useA)?.mine === false);
    check('3.9 목록에 계정 번호가 없음', !JSON.stringify(gy.json).includes('fx-user-'));
    /* 새 서버(새 캐시) — 같은 폴더에서 같은 목록 */
    const fresh = new FixtureServer('fresh', FIXTURE_DIR);
    await fresh.start();
    const gf = await apiGet(fresh, 'yunho');
    await fresh.stop();
    check('3.10 새 서버 인스턴스(새 캐시)가 같은 폴더에서 같은 목록을 돌려줌', gf.status === 200 && JSON.stringify(gf.json) === JSON.stringify(gy.json));
    check('3.11 새 서버 인스턴스의 캐시가 실제로 비어 있다가 다시 읽음', fresh.cache.size >= 1 && fresh.cache !== S.cache);
    const child = readbackInChild();
    check('3.12 다른 프로세스가 같은 폴더를 읽어도 그 쓰임이 있음', child?.ok === true && Array.isArray(child?.useIds) && child.useIds.includes(useA) && child.skippedOps === 0);
  });

  /* 4. --fixture-ok 없이 */
  await scenario('4 같은 등록을 --fixture-ok 없이 → fixture-only → retry --fixture-ok', 1, '같은 쓰임의 새 요청(쓴 시각이 새로 정해짐), 쓰임 수는 그대로', [S], async () => {
    const before = await apiGet(S, 'yunho');
    const r = await cli(macmini, registerArgs({ url: U1, review: 'EX-OPS-001', item: 'ITEM-A' }));
    check('4.1 끝 번호 4 · fixture-only · error fixture-only', r.code === 4 && r.out?.status === 'fixture-only' && r.out?.error === 'fixture-only', `code ${r.code} · ${r.out?.status}`);
    check('4.2 ok false · central false · 등록이라 하지 않음', r.out?.ok === false && r.out?.central === false && !CENTRAL_SUCCESS.some((re) => re.test(r.stdout)));
    check('4.3 시험 저장소라 등록으로 치지 않는다고 알림', /등록으로 치지 않고 대기열에 남겨/.test(r.stderr));
    rkS4 = r.out?.requestKey ?? '';
    const p = await cli(macmini, ['pending']);
    check('4.4 pending: 대기 1 · 그 요청 · lastError fixture-only', p.code === 0 && p.out?.count === 1 && p.out?.pending?.[0]?.requestKey === rkS4 && p.out?.pending?.[0]?.lastError === 'fixture-only');
    const rt = await cli(macmini, ['retry', '--fixture-ok']);
    check('4.5 retry --fixture-ok → 끝 번호 5 · fixtureSaved 1 · pendingLeft 0', rt.code === 5 && rt.out?.fixtureSaved === 1 && rt.out?.pendingLeft === 0, `code ${rt.code} · ${JSON.stringify({ fs: rt.out?.fixtureSaved, left: rt.out?.pendingLeft })}`);
    check('4.6 retry 결과: replayed true(이미 저장된 같은 요청) · central false · 같은 쓰임 A', rt.out?.results?.[0]?.replayed === true && rt.out?.results?.[0]?.central === false && rt.out?.results?.[0]?.useId === useA);
    check('4.7 대기 0', pendingCount(macmini) === 0);
    const after = await apiGet(S, 'yunho');
    check('4.8 쓰임 수 그대로 · 쓰임 A 기록 2', after.json?.counts?.uses === before.json?.counts?.uses && useById(after.json, useA)?.revisions === 2);
    check('4.9 그 요청 번호의 기록은 정확히 하나', opsForKey(rkS4) === 1);
  });

  /* 5. 같은 요청 다시 · 응답 잃음 · 시간 초과 */
  await scenario('5 같은 요청 다시 보냄 · 응답 잃음 · 시간 초과', 2, '응답 잃음 1 + 늦게 저장 1(다시 보낸 것은 0)', [S], async () => {
    const usesBefore = (await apiGet(S, 'yunho')).json?.counts?.uses;
    const r = await cli(macmini, registerArgs({ url: U1, review: 'EX-OPS-001', item: 'ITEM-A', fixtureOk: true }));
    check('5.1 같은 등록 다시 → 끝 번호 5 · replayed true · 같은 요청 번호', r.code === 5 && r.out?.replayed === true && r.out?.requestKey === rkS4, `code ${r.code} · replayed ${r.out?.replayed}`);
    check('5.2 새 쓰임 없음 · 그 요청 번호의 기록 하나', (await apiGet(S, 'yunho')).json?.counts?.uses === usesBefore && opsForKey(rkS4) === 1);

    /* 응답 잃음: 서버는 저장까지 하고 연결을 끊는다 */
    S.faults.push({ kind: 'drop-after-write' });
    const lost = await cli(macmini, registerArgs({ url: U_LOST, review: 'EX-OPS-002', item: 'ITEM-LOST', fixtureOk: true }));
    await S.settle();
    check('5.3 응답 잃음 → 끝 번호 4 · pending · network', lost.code === 4 && lost.out?.status === 'pending' && lost.out?.error === 'network', `code ${lost.code} · ${lost.out?.error}`);
    check('5.4 서버는 실제로 저장함(그 요청 번호의 기록 1) · 대기 1', opsForKey(lost.out?.requestKey ?? '') === 1 && pendingCount(macmini) === 1);
    check('5.5 응답을 잃은 것을 등록이라 하지 않음', lost.out?.ok === false && lost.out?.opId === null && !CENTRAL_SUCCESS.some((re) => re.test(lost.stdout)));
    const rl = await cli(macmini, ['retry', '--fixture-ok']);
    check('5.6 retry → 끝 번호 5 · replayed true · pendingLeft 0', rl.code === 5 && rl.out?.results?.[0]?.replayed === true && rl.out?.pendingLeft === 0, `code ${rl.code}`);
    check('5.7 응답 잃음 뒤에도 그 요청 번호의 기록은 하나', opsForKey(lost.out?.requestKey ?? '') === 1);

    /* 시간 초과: 도구가 20초 기다리다 그만둔 뒤 서버가 늦게 저장 */
    S.faults.push({ kind: 'delay-then-handle', ms: 21_000 });
    const t1 = Date.now();
    const slow = await cli(macmini, registerArgs({ url: U_SLOW, review: 'EX-OPS-002', item: 'ITEM-SLOW', fixtureOk: true }));
    const waited = Date.now() - t1;
    check('5.8 시간 초과 → 끝 번호 4 · pending · timeout(약 20초 뒤)', slow.code === 4 && slow.out?.error === 'timeout' && waited >= 19_000, `code ${slow.code} · ${slow.out?.error} · ${waited}ms`);
    check('5.9 시간 초과 때는 아직 저장 전(기록 0)', opsForKey(slow.out?.requestKey ?? '') === 0);
    await S.settle();
    check('5.10 서버가 늦게 저장함(기록 1) · 대기 1 그대로', opsForKey(slow.out?.requestKey ?? '') === 1 && pendingCount(macmini) === 1);
    const rs = await cli(macmini, ['retry', '--fixture-ok']);
    check('5.11 늦게 저장된 뒤 retry → 끝 번호 5 · replayed true · 기록 하나', rs.code === 5 && rs.out?.results?.[0]?.replayed === true && opsForKey(slow.out?.requestKey ?? '') === 1, `code ${rs.code}`);
  });

  /* 검수 기록 파일 자리(시험 6 · 10 · 16 이 같이 씀) */
  const yRecords = path.join(macmini.repo, 'docs', 'reviews', 'handoff', 'exercise', 'yunho', 'video-records.json');
  const kRecords = path.join(kimminMac.repo, 'docs', 'reviews', 'handoff', 'exercise', 'min', 'video-records.json');
  const yMechRecords = path.join(macmini.repo, 'docs', 'reviews', 'handoff', 'mechanics', 'yunho', 'video-records.json');

  /* 6. 서버가 꺼짐 */
  await scenario('6 서버 꺼짐 → 대기 → 도구 다시 켜도 남음 → 서버 다시 → retry', 1, '대기를 보낸 1', [S], async () => {
    await S.stop();
    check('6.1 서버 포트가 정말 닫힘(연결 거절)', await refused(S.port));
    const r = await cli(macmini, registerArgs({ url: U_DOWN, review: 'EX-OPS-002', item: 'ITEM-DOWN', fixtureOk: true }));
    check('6.2 끝 번호 4 · pending · network(ECONNREFUSED)', r.code === 4 && r.out?.status === 'pending' && r.out?.error === 'network' && /ECONNREFUSED/.test(r.out?.message ?? ''), `code ${r.code} · ${r.out?.error}`);
    const p = await cli(macmini, ['pending']);
    check('6.3 새 프로세스의 pending 이 그 대기를 보임(lastError network · 시도 1)', p.out?.count === 1 && p.out?.pending?.[0]?.lastError === 'network' && p.out?.pending?.[0]?.attempts === 1 && p.out?.pending?.[0]?.url === U_DOWN);
    const st = await cli(macmini, ['status']);
    check('6.4 꺼진 동안 status → 끝 번호 4 · server ok false network · 대기 1', st.code === 4 && st.out?.server?.ok === false && st.out?.server?.error === 'network' && st.out?.pending === 1);
    await S.start(S.port);
    check('6.5 서버를 같은 주소로 다시 켬', S.base === BASE);
    /* 대기에만 있는 인용(보내지 못함)을 audit 하면 빠짐 — 대기를 등록으로 세지 않는다(T1) */
    writeRecords(yRecords, [{ review_id: 'EX-OPS-002', evidence: [{ url: U_DOWN }] }]);
    const ap = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check(
      '6.5a 대기에만 있는 인용 audit → 끝 번호 5 · 시험 결과 missing · 맞음 0 · pendingLocal 1 · 그 줄 pendingLocal true',
      ap.code === 5 && ap.out?.fixtureResult === 'missing' && ap.out?.fixtureMatched === 0 && ap.out?.pendingLocal === 1 && ap.out?.missing?.[0]?.pendingLocal === true && ap.out?.missing?.[0]?.url === U_DOWN,
      `code ${ap.code} · ${ap.out?.fixtureResult} · pendingLocal ${ap.out?.pendingLocal}`,
    );
    const rt = await cli(macmini, ['retry', '--fixture-ok']);
    check('6.6 retry → 끝 번호 5 · fixture-saved · pendingLeft 0', rt.code === 5 && rt.out?.results?.[0]?.status === 'fixture-saved' && rt.out?.pendingLeft === 0, `code ${rt.code}`);
    check('6.7 대기 0', pendingCount(macmini) === 0);
    const ad = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('6.8 retry 뒤 audit → 시험 결과 complete · pendingLocal 0', ad.code === 5 && ad.out?.fixtureResult === 'complete' && ad.out?.fixtureMatched === 1 && ad.out?.pendingLocal === 0, `code ${ad.code} · ${ad.out?.fixtureResult}`);
  });

  /* 7. 세션 거둠 */
  await scenario('7 세션 거둠 → 401 → 대기 · 로그인 안내 → 다시 로그인 → retry', 1, '대기를 보낸 1(401 동안은 0)', [S], async () => {
    const s = SESSIONS.get(macminiToken);
    if (s) s.revoked = true;
    const st = await cli(macmini, ['status']);
    check('7.1 status → 끝 번호 4 · server unauthenticated', st.code === 4 && st.out?.server?.error === 'unauthenticated');
    const before = opsCount();
    const r = await cli(macmini, registerArgs({ url: U_REVOKE, review: 'EX-OPS-002', item: 'ITEM-REVOKE', fixtureOk: true }));
    check('7.2 끝 번호 4 · pending · unauthenticated · 다시 로그인 안내', r.code === 4 && r.out?.error === 'unauthenticated' && /login 을 다시 해 주세요/.test(r.out?.message ?? ''), `code ${r.code} · ${r.out?.error}`);
    check('7.3 401 은 저장소를 묻기 전에 막힘(기록 그대로) · 대기 1', opsCount() === before && pendingCount(macmini) === 1);
    const lg = await deviceLogin(macmini, BASE, 'yunho');
    check('7.4 다시 코드 로그인 → 끝 번호 0', lg.code === 0 && lg.out?.status === 'logged-in');
    const sess = JSON.parse(fs.readFileSync(path.join(macmini.stateDir, 'session.json'), 'utf8')) as { session: string };
    check('7.5 새 표로 바뀜', sess.session !== macminiToken && SESSIONS.get(sess.session)?.revoked === false);
    macminiToken = sess.session;
    const rt = await cli(macmini, ['retry', '--fixture-ok']);
    check('7.6 retry → 끝 번호 5 · pendingLeft 0', rt.code === 5 && rt.out?.pendingLeft === 0, `code ${rt.code}`);
    check('7.7 거둔 표 · 새 표 모두 출력에 없음', ![st, r, lg, rt].some((x) => leaksIn(x.stdout + x.stderr).token));
  });

  /* 8. 다른 맥 */
  await scenario('8 다른 맥: 같은 쓰임 → 같은 useId · 남은 대기를 나중에 보내도 겹치지 않음 · 확인일은 뒤로 가지 않음', 2, 'yunho-macbook 1 + yunho-macmini 남은 대기 1', [S], async () => {
    const before = await apiGet(S, 'yunho');
    const usesBefore = before.json?.counts?.uses;
    const revBefore = useById(before.json, useA)?.revisions ?? 0;
    /* macmini: 서버가 꺼진 사이 더 이른 날짜로 같은 쓰임을 등록 → 남은 대기 */
    await S.stop();
    const left = await cli(macmini, registerArgs({ url: U1, review: 'EX-OPS-001', item: 'ITEM-A', consulted: '2026-11-17', application: '시험: 맥 미니에서 먼저 적어 둔 같은 쓰임이에요.', fixtureOk: true }));
    check('8.1 yunho-macmini: 꺼진 동안 같은 쓰임 등록 → 끝 번호 4 · 대기 1', left.code === 4 && pendingCount(macmini) === 1, `code ${left.code}`);
    await S.start(S.port);
    /* macbook: 공유한 검수 기록을 보고 같은 쓰임을 다시 등록(더 늦은 확인일) */
    const mb = await cli(macbook, registerArgs({ url: U1, review: 'EX-OPS-001', item: 'ITEM-A', consulted: '2026-11-19', application: '시험: 맥북에서 다시 확인한 같은 쓰임이에요.', fixtureOk: true }));
    check('8.2 yunho-macbook → 끝 번호 5 · 같은 useId · 같은 sourceId', mb.code === 5 && mb.out?.useId === useA && mb.out?.sourceId === sourceA, `code ${mb.code} · ${mb.out?.useId}`);
    const mid = await apiGet(S, 'yunho');
    check('8.3 쓰임 수 그대로 · 쓰임 A 기록 +1 · 확인일 2026-11-19', mid.json?.counts?.uses === usesBefore && useById(mid.json, useA)?.revisions === revBefore + 1 && useById(mid.json, useA)?.consultedOn === '2026-11-19');
    check('8.4 yunho-macbook 의 쓰임도 yunho 계정으로 mine true', useById(mid.json, useA)?.mine === true);
    /* macmini 가 나중에 남은 대기를 보냄 */
    const rt = await cli(macmini, ['retry', '--fixture-ok']);
    check('8.5 yunho-macmini 의 남은 대기 retry → 끝 번호 5 · 같은 useId', rt.code === 5 && rt.out?.results?.[0]?.useId === useA, `code ${rt.code}`);
    const after = await apiGet(S, 'yunho');
    const ua = useById(after.json, useA);
    check('8.6 쓰임 수 그대로(겹친 쓰임 없음) · 기록 +2', after.json?.counts?.uses === usesBefore && ua?.revisions === revBefore + 2);
    check('8.7 늦게 보낸 더 이른 날짜가 확인일을 되돌리지 않음(2026-11-19 · 출처 최근 확인일도)', ua?.consultedOn === '2026-11-19' && ua?.latestConsultedOn === '2026-11-19');
    check('8.8 대기 0(두 컴퓨터)', pendingCount(macmini) === 0 && pendingCount(macbook) === 0);
  });

  /* 9. 검수자 · 분야 나눔 */
  await scenario('9 다른 검수자 · 다른 분야는 다른 쓰임', 3, 'kimmin 2 + yunho mechanics 1', [S], async () => {
    const k = await cli(kimminMac, registerArgs({ url: U1, review: 'EX-OPS-001', item: 'ITEM-A', fixtureOk: true }));
    check('9.1 kimmin 이 같은 검수 · 같은 링크 → 끝 번호 5 · 다른 useId · 같은 sourceId', k.code === 5 && k.out?.useId !== useA && k.out?.sourceId === sourceA, `code ${k.code}`);
    const ym = await cli(macmini, registerArgs({ url: U1, domain: 'mechanics', review: 'MX-OPS-001', item: 'DRILL-A', purpose: 'mechanism', fixtureOk: true }));
    check('9.2 yunho 가 같은 링크를 메커니즘에 → 끝 번호 5 · 다른 useId · 같은 sourceId', ym.code === 5 && ym.out?.useId !== useA && ym.out?.useId !== k.out?.useId && ym.out?.sourceId === sourceA, `code ${ym.code}`);
    const k5 = await cli(kimminMac, registerArgs({ url: U5, review: 'EX-OPS-001', item: 'ITEM-B', fixtureOk: true }));
    check('9.3 kimmin 만 등록한 링크 U5 → 끝 번호 5', k5.code === 5, `code ${k5.code}`);
    const gk = await apiGet(S, 'kimmin');
    const gy = await apiGet(S, 'yunho');
    check('9.4 kimmin 목록: kimmin 쓰임 mine true · yunho 쓰임 A mine false', useById(gk.json, k.out?.useId)?.mine === true && useById(gk.json, useA)?.mine === false);
    check('9.5 yunho 목록: kimmin 쓰임 mine false · 메커니즘 쓰임 mine true', useById(gy.json, k.out?.useId)?.mine === false && useById(gy.json, ym.out?.useId)?.mine === true);
    check('9.6 분야별 쓰임 수: 메커니즘 1', gy.json?.counts?.usesByDomain?.mechanics === 1);
    check('9.7 쓰임 표시 이름은 등록한 계정 이름(금윤호 · 김민)', useById(gy.json, useA)?.reviewerLabel === '금윤호' && useById(gy.json, k.out?.useId)?.reviewerLabel === '김민');
  });

  /* 10. audit */
  await scenario('10 audit(--reviewer · --fixture-ok) · 빠진 링크 · 다른 검수자 · 비밀 링크', 0, 'audit 은 쓰지 않음', [S], async () => {
    writeRecords(yRecords, [
      { review_id: 'EX-OPS-001', evidence: [{ url: U1 }, { url: U9 }, { url: U5 }, { url: SECRET_URL }], human_review_status: '시험' },
      { review_id: 'EX-OPS-002', evidence: [] },
    ]);
    const a = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('10.1 끝 번호 5 · fixture-audited · central false · registered 0', a.code === 5 && a.out?.status === 'fixture-audited' && a.out?.central === false && a.out?.registered === 0, `code ${a.code} · ${a.out?.status}`);
    check('10.2 시험 결과 incomplete(받지 않는 링크가 있음) · 인용 3 · 맞음 1', a.out?.fixtureResult === 'incomplete' && a.out?.cited === 3 && a.out?.fixtureMatched === 1, JSON.stringify({ r: a.out?.fixtureResult, c: a.out?.cited, m: a.out?.fixtureMatched }));
    const miss = (a.out?.missing ?? []) as Loose[];
    const mU9 = miss.find((x) => x.url === U9);
    const mU5 = miss.find((x) => x.url === U5);
    check('10.3 빠진 것 2: 아무도 안 한 U9 · kimmin 만 한 U5(다른 검수자 쓰임으로 표시, yunho 것으로 세지 않음)', a.out?.missingCount === 2 && mU9?.otherReviewerUse === false && mU5?.otherReviewerUse === true);
    check('10.4 다른 검수자 쓰임 2(U1 · U5 의 kimmin 쓰임)', a.out?.otherReviewerUses === 2);
    const sk = (a.out?.skipped ?? []) as Loose[];
    check('10.5 건너뜀 1: 자리 · 까닭 · 지문(12자)만, 링크 값 없음', a.out?.skippedCount === 1 && /^[0-9a-f]{12}$/.test(sk[0]?.fingerprint ?? '') && typeof sk[0]?.field === 'string' && sk[0]?.url === undefined, JSON.stringify(sk[0] ?? null));
    check('10.6 범위: reviewer yunho · domain exercise · apiVersion 2 · store local-fixture', a.out?.scope?.reviewer === 'yunho' && a.out?.scope?.domain === 'exercise' && a.out?.apiVersion === 2 && a.out?.store === 'local-fixture');
    check('10.7 시험 저장소에서 맞은 것은 등록으로 치지 않는다고 알림', /등록으로 치지 않아요/.test(a.stderr));
    const a2 = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('10.8 --fixture-ok 없이 → 끝 번호 4 · fixture-only · central false', a2.code === 4 && a2.out?.status === 'fixture-only' && a2.out?.central === false && a2.out?.registered === 0, `code ${a2.code} · ${a2.out?.status}`);
    check('10.9 비밀 글자가 audit 출력에 없음', ![a, a2].some((x) => leaksIn(x.stdout + x.stderr).secret));

    writeRecords(yRecords, [{ review_id: 'EX-OPS-001', evidence: [{ url: U1 }] }]);
    const a3 = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('10.10 등록한 것만 인용한 기록 → 시험 결과 complete · 끝 번호 5(중앙 complete 가 아님)', a3.code === 5 && a3.out?.fixtureResult === 'complete' && a3.out?.status === 'fixture-audited' && a3.out?.central === false, `code ${a3.code} · ${a3.out?.fixtureResult}`);
    writeRecords(kRecords, [{ review_id: 'EX-OPS-001', evidence: [{ url: U1 }, { url: U5 }] }]);
    const ak = await cli(kimminMac, ['audit', '--records', kRecords, '--domain', 'exercise', '--reviewer', 'kimmin', '--fixture-ok']);
    check('10.11 kimmin 기록(handoff/exercise/min) → kimmin 쓰임만 맞음 2 · complete', ak.code === 5 && ak.out?.fixtureMatched === 2 && ak.out?.fixtureResult === 'complete', `code ${ak.code} · ${ak.out?.fixtureMatched}`);
    writeRecords(yMechRecords, [{ review_id: 'MX-OPS-001', evidence: [{ url: U1 }] }]);
    const am = await cli(macmini, ['audit', '--records', yMechRecords, '--domain', 'mechanics', '--reviewer', 'yunho', '--fixture-ok']);
    check('10.12 메커니즘 기록 → 메커니즘 쓰임으로 맞음 1 · complete', am.code === 5 && am.out?.fixtureMatched === 1 && am.out?.fixtureResult === 'complete', `code ${am.code}`);
    const amx = await cli(macmini, ['audit', '--records', yMechRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('10.13 기록 폴더(mechanics)와 --domain(exercise)이 다르면 64', amx.code === 64, `code ${amx.code}`);

    /* 문장 속 링크(R2 원장 in-flight 확인 사례) — 빠뜨리고 complete 0 이라 하면 안 된다 */
    writeRecords(yRecords, [{ review_id: 'EX-OPS-003', notes: '자료를 확인했어요 https://pubmed.ncbi.nlm.nih.gov/12345678/' }]);
    const ae = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('10.14 문장 속에만 링크가 있는 기록 → complete 이 아님(빠진 등록 또는 끝내지 못함)', ae.code === 5 && ae.out?.fixtureResult !== 'complete', `code ${ae.code} · ${ae.out?.fixtureResult} · cited ${ae.out?.cited}`);
    writeRecords(yRecords, [{ review_id: 'EX-OPS-001', notes: `영상 메모 ${SECRET_URL} 확인` }]);
    const as = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('10.15 문장 속 비밀 링크 → complete 이 아니고 비밀 글자가 출력에 없음', as.code === 5 && as.out?.fixtureResult !== 'complete' && !leaksIn(as.stdout + as.stderr).secret, `code ${as.code} · ${as.out?.fixtureResult}`);

    /* 다른 검수 번호의 같은 링크(T3): U1 은 EX-OPS-001 쓰임으로만 등록 — EX-OPS-002 에서 인용하면 그 검수의 빠진 등록 */
    writeRecords(yRecords, [
      { review_id: 'EX-OPS-001', evidence: [{ url: U1 }] },
      { review_id: 'EX-OPS-002', evidence: [{ url: U1 }] },
    ]);
    const ax = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    const mx = (ax.out?.missing ?? []) as Loose[];
    check(
      '10.16 같은 링크를 다른 검수(EX-OPS-002)에서 인용 → 시험 결과 missing · 맞음 1 · 빠짐은 EX-OPS-002 의 U1 하나',
      ax.code === 5 && ax.out?.fixtureResult === 'missing' && ax.out?.fixtureMatched === 1 && mx.length === 1 && mx[0]?.reviewId === 'EX-OPS-002' && mx[0]?.url === U1,
      `code ${ax.code} · ${ax.out?.fixtureResult} · ${JSON.stringify(mx.map((x) => [x.reviewId, x.url]))}`,
    );
  });

  /* 11. 지원하지 않는 기록 */
  await scenario('11 지원하지 않는 기록(handoff/exercise/min)', 0, '쓰지 않음', [S], async () => {
    const unsup = path.join(kimminMac.repo, 'u', 'docs', 'reviews', 'handoff', 'exercise', 'min', 'video-records.json');
    writeRecords(unsup, [{ title: '검수 번호 없는 기록', evidence: [{ url: U1 }] }]);
    const a = await cli(kimminMac, ['audit', '--records', unsup, '--domain', 'exercise', '--reviewer', 'kimmin', '--fixture-ok']);
    check('11.1 review_id 없는 기록뿐 → 끝 번호 3 · unsupported', a.code === 3 && a.out?.status === 'unsupported', `code ${a.code} · ${a.out?.status}`);
    check('11.2 알아볼 수 없는 기록 1 · 그 안의 링크 수만 알림(값 없음)', a.out?.ignoredRecords === 1 && a.out?.ignored?.[0]?.citedStrings === 1 && !a.stdout.includes(U1));
    const b = await cli(kimminMac, ['audit', '--records', unsup, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('11.3 같은 파일을 --reviewer yunho 로 → 64(min 폴더 = kimmin)', b.code === 64, `code ${b.code}`);
    const obj = path.join(kimminMac.repo, 'v', 'docs', 'reviews', 'handoff', 'exercise', 'min', 'video-records.json');
    writeRecords(obj, { note: '목록이 아님' });
    const c = await cli(kimminMac, ['audit', '--records', obj, '--domain', 'exercise', '--reviewer', 'kimmin', '--fixture-ok']);
    check('11.4 목록이 아닌 모양 → 끝 번호 3 · unsupported', c.code === 3 && c.out?.status === 'unsupported', `code ${c.code}`);
  });

  /* 12. 비공개 · 서명 링크 거절 */
  await scenario('12 등록 때 비공개 · 서명 링크 거절', 0, '아무것도 보내지 않음', [S], async () => {
    const reqBefore = S.log.length;
    const pBefore = pendingCount(macmini);
    const rjBefore = rejectedCount(macmini);
    const r = await cli(macmini, registerArgs({ url: SECRET_URL, review: 'EX-OPS-001', item: 'ITEM-A', fixtureOk: true }));
    check('12.1 서명 링크 → 끝 번호 3 · invalid · source.url 자리만', r.code === 3 && r.out?.status === 'invalid' && (r.out?.issues ?? []).some((i: Loose) => i.field === 'source.url'), `code ${r.code} · ${r.out?.status}`);
    const r2 = await cli(macmini, registerArgs({ url: U9, review: 'EX-OPS-001', item: 'ITEM-A', application: `시험: 이 영상 ${SECRET_URL} 을 봤어요.`, fixtureOk: true }));
    check('12.2 적용 글 속 서명 링크 → 끝 번호 3 · 대기열에 넣지 않음', r2.code === 3 && r2.out?.status === 'invalid', `code ${r2.code}`);
    const c = await cli(macmini, ['check-url', '--url', SECRET_URL]);
    check('12.3 check-url → 끝 번호 3 · 지문만', c.code === 3 && /^[0-9a-f]{12}$/.test(c.out?.results?.[0]?.fingerprint ?? '') && c.out?.results?.[0]?.href === undefined);
    check('12.4 대기 · 거절 기록이 늘지 않음', pendingCount(macmini) === pBefore && rejectedCount(macmini) === rjBefore);
    check('12.5 서버에 요청이 가지 않음', S.log.length === reqBefore, `${S.log.length - reqBefore} 건`);
    check('12.6 비밀 글자가 출력에 없음', ![r, r2, c].some((x) => leaksIn(x.stdout + x.stderr).secret));
  });

  /* 13. 일반 회원 */
  await scenario('13 일반 회원(member)', 0, '403 은 저장소 앞에서 막힘', [S], async () => {
    const lg = await deviceLogin(memberMac, BASE, 'member');
    check('13.1 일반 회원 코드 로그인 → 승인은 되지만 확인 403 → 끝 번호 4 · login-failed forbidden · 세션 저장 없음', lg.code === 4 && lg.out?.status === 'login-failed' && lg.out?.error === 'forbidden' && !fs.existsSync(path.join(memberMac.stateDir, 'session.json')), `code ${lg.code} · ${lg.out?.error}`);
    const ls = await stdinLogin(memberMac, BASE, issueToken('member', 'stdin'));
    check('13.2 일반 회원 --session-stdin → 끝 번호 4 · forbidden · 세션 저장 없음', ls.code === 4 && ls.out?.error === 'forbidden' && !fs.existsSync(path.join(memberMac.stateDir, 'session.json')), `code ${ls.code}`);
    /* 대표관리자였다가 로그인 뒤 일반 회원이 된 계정(역할은 요청마다 다시 읽힘) */
    USERS.member.role = 'ADMIN';
    const lp = await stdinLogin(memberMac, BASE, issueToken('member', 'stdin'));
    USERS.member.role = 'USER';
    check('13.3 (그때 대표관리자로) 로그인 저장됨', lp.code === 0, `code ${lp.code}`);
    const st = await cli(memberMac, ['status']);
    check('13.4 역할이 바뀐 뒤 status → 끝 번호 4 · server forbidden', st.code === 4 && st.out?.server?.ok === false && st.out?.server?.error === 'forbidden', `code ${st.code} · ${st.out?.server?.error}`);
    const r = await cli(memberMac, registerArgs({ url: U_MEMBER, review: 'EX-OPS-009', item: 'ITEM-M', fixtureOk: true }));
    check('13.5 register → 끝 번호 4 · pending · forbidden · 대기 남음', r.code === 4 && r.out?.status === 'pending' && r.out?.error === 'forbidden' && pendingCount(memberMac) === 1, `code ${r.code} · ${r.out?.error}`);
    check('13.6 등록이라 하지 않음', r.out?.ok === false && !CENTRAL_SUCCESS.some((re) => re.test(r.stdout)));
    const g = await apiGet(S, 'member');
    check('13.7 일반 회원 목록 GET → 403', g.status === 403 && g.json?.error === 'forbidden');
    const imp = await apiPost(S, 'member', IMPORT_PATH, '{}', { 'content-type': 'application/json', 'x-review-evidence': '1' });
    check('13.8 일반 회원 가져오기 POST → 403', imp.status === 403);
  });

  /* 14. 저장소 실패 */
  await scenario('14 저장소 실패: 목록 503 · status 4 · 성공이라 하지 않음', 2, '목록만 실패 때 저장된 1 + 회복 뒤 보낸 1', [S], async () => {
    S.storeMode = 'list-unavailable';
    const g = await apiGet(S, 'yunho');
    check('14.1 목록 GET → 503 unavailable · reason unavailable · 그 까닭 글 · no-store', g.status === 503 && g.json?.error === 'unavailable' && g.json?.reason === 'unavailable' && g.json?.message === LIST_FAILURE_TEXT.unavailable && /no-store/.test(g.cacheControl ?? ''));
    const gs = await apiGet(S, 'yunho', true);
    check('14.2 요약 GET 도 503', gs.status === 503 && gs.json?.reason === 'unavailable');
    const st = await cli(macmini, ['status']);
    check('14.3 status → 끝 번호 4 · server ok false unavailable', st.code === 4 && st.out?.server?.ok === false && st.out?.server?.error === 'unavailable', `code ${st.code} · ${st.out?.server?.error}`);
    S.storeMode = 'list-unsupported';
    const gu = await apiGet(S, 'yunho');
    check('14.4 목록 v2 없음 → 503 · reason unsupported', gu.status === 503 && gu.json?.reason === 'unsupported' && gu.json?.message === LIST_FAILURE_TEXT.unsupported);
    const au = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('14.5 목록을 못 읽으면 audit → 끝 번호 4 · unavailable', au.code === 4 && au.out?.status === 'unavailable', `code ${au.code} · ${au.out?.status}`);

    S.storeMode = 'outage';
    const before = opsCount();
    const o = await cli(macmini, registerArgs({ url: U_OUTAGE, review: 'EX-OPS-002', item: 'ITEM-OUTAGE', fixtureOk: true }));
    check('14.6 저장소 전부 실패 → 503 pending → 끝 번호 4 · pending', o.code === 4 && o.out?.status === 'pending' && o.out?.error === 'pending', `code ${o.code} · ${o.out?.error}`);
    check('14.7 저장소 전부 실패 때 기록 그대로', opsCount() === before);

    S.storeMode = 'list-unavailable';
    const l = await cli(macmini, registerArgs({ url: U_LISTFAIL, review: 'EX-OPS-002', item: 'ITEM-LISTFAIL', fixtureOk: true }));
    check('14.8 목록만 실패(저장은 됨 · 보이는지 미확인) → 끝 번호 4 · fixture-saved 아님 · visible false · 대기 남음', l.code === 4 && l.out?.status !== 'fixture-saved' && l.out?.visible === false && pendingCount(macmini) === 2, `code ${l.code} · ${l.out?.status} · visible ${l.out?.visible}`);
    check('14.9 저장소 실패 동안 성공이라 한 출력 없음', ![st, au, o, l].some((x) => x.code === 0 || x.code === 5 || CENTRAL_SUCCESS.some((re) => re.test(x.stdout))));

    S.storeMode = 'ok';
    const rt = await cli(macmini, ['retry', '--fixture-ok']);
    const byKey = new Map<string, Loose>(((rt.out?.results ?? []) as Loose[]).map((x) => [x.requestKey, x]));
    check('14.10 회복 뒤 retry → 끝 번호 5 · fixtureSaved 2 · pendingLeft 0', rt.code === 5 && rt.out?.fixtureSaved === 2 && rt.out?.pendingLeft === 0, `code ${rt.code}`);
    check('14.11 전부 실패 때의 요청은 새로 저장(replayed false) · 목록만 실패 때의 요청은 이미 저장(replayed true)', byKey.get(o.out?.requestKey)?.replayed === false && byKey.get(l.out?.requestKey)?.replayed === true);
  });

  /* 16. 같은 맥: 거둔 뒤 다시 등록 · 되살린 뒤 다시 거두기(REG-1) — 옛 요청을 그대로 다시 보내지 않는다 */
  await scenario('16 같은 맥: 거둔 뒤 같은 내용 다시 등록(되살림) · 되살린 뒤 같은 까닭 다시 거두기', 7, 'W1 등록 · 거두기 · 다시 등록 3 + W2 등록 · 거두기 · 고친 등록 · 다시 거두기 4', [S], async () => {
    const withdrawnOf = async (useId: string) => allUses((await apiGet(S, 'yunho')).json).find((u: Loose) => u.useId === useId)?.withdrawn;
    /* 경우 1: 거둔 뒤 같은 내용 다시 register */
    const r1 = await cli(macmini, registerArgs({ url: U_W1, review: 'EX-OPS-004', item: 'ITEM-W1', fixtureOk: true }));
    const w1use = r1.out?.useId ?? '';
    const x1 = await cli(macmini, ['withdraw', '--use', w1use, '--reason', '시험: 잘못 고른 쓰임이라 거둬요', '--fixture-ok']);
    check('16.1 등록 · 거두기 → 끝 번호 5 · 그 쓰임이 거둔 상태', r1.code === 5 && x1.code === 5 && x1.out?.status === 'fixture-saved' && (await withdrawnOf(w1use)) === true, `codes ${r1.code} · ${x1.code}`);
    const r2 = await cli(macmini, registerArgs({ url: U_W1, review: 'EX-OPS-004', item: 'ITEM-W1', fixtureOk: true }));
    check(
      '16.2 같은 내용 다시 register → 끝 번호 5 · 새 요청 번호(옛 요청을 다시 보내지 않음) · 같은 쓰임 · 되살아남',
      r2.code === 5 && r2.out?.status === 'fixture-saved' && r2.out?.requestKey !== r1.out?.requestKey && r2.out?.replayed === false && r2.out?.useId === w1use && (await withdrawnOf(w1use)) === false,
      `code ${r2.code} · replayed ${r2.out?.replayed} · same rk ${r2.out?.requestKey === r1.out?.requestKey}`,
    );
    check('16.3 새 요청의 쓴 시각이 거두기보다 늦음', typeof r2.out?.notedAt === 'string' && r2.out.notedAt > (x1.out?.notedAt ?? ''));
    writeRecords(yRecords, [{ review_id: 'EX-OPS-004', evidence: [{ url: U_W1 }] }]);
    const a1 = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('16.4 되살린 뒤 audit → 시험 결과 complete(거둔 쓰임만 남지 않음)', a1.code === 5 && a1.out?.fixtureResult === 'complete' && a1.out?.withdrawnOnly === 0, `${a1.out?.fixtureResult}`);

    /* 경우 2: 거둔 뒤 고친 글로 되살리고, 같은 까닭으로 다시 withdraw */
    const s1 = await cli(macmini, registerArgs({ url: U_W2, review: 'EX-OPS-004', item: 'ITEM-W2', fixtureOk: true }));
    const w2use = s1.out?.useId ?? '';
    const y1 = await cli(macmini, ['withdraw', '--use', w2use, '--reason', '시험: 거둬요', '--fixture-ok']);
    const s2 = await cli(macmini, registerArgs({ url: U_W2, review: 'EX-OPS-004', item: 'ITEM-W2', application: '시험: 고친 적용 글이에요.', fixtureOk: true }));
    check('16.5 거둔 뒤 고친 글 register 로 되살아남', s1.code === 5 && y1.code === 5 && s2.code === 5 && s2.out?.useId === w2use && (await withdrawnOf(w2use)) === false, `codes ${s1.code} ${y1.code} ${s2.code}`);
    const y2 = await cli(macmini, ['withdraw', '--use', w2use, '--reason', '시험: 거둬요', '--fixture-ok']);
    check(
      '16.6 되살린 뒤 같은 까닭 withdraw → 끝 번호 5 · 새 요청 번호 · 대기 0 · 쓰임이 거둔 상태(영영 대기에 갇히지 않음)',
      y2.code === 5 && y2.out?.status === 'fixture-saved' && y2.out?.requestKey !== y1.out?.requestKey && pendingCount(macmini) === 0 && (await withdrawnOf(w2use)) === true,
      `code ${y2.code} · ${y2.out?.status} · same rk ${y2.out?.requestKey === y1.out?.requestKey} · pending ${pendingCount(macmini)}`,
    );
    writeRecords(yRecords, [{ review_id: 'EX-OPS-004', evidence: [{ url: U_W2 }] }]);
    const a2 = await cli(macmini, ['audit', '--records', yRecords, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('16.7 다시 거둔 뒤 audit → 시험 결과 missing · withdrawnOnly 1', a2.code === 5 && a2.out?.fixtureResult === 'missing' && a2.out?.withdrawnOnly === 1 && a2.out?.missing?.[0]?.withdrawnOnly === true, `${a2.out?.fixtureResult}`);
  });

  /* 17. 다른 맥의 늦은 요청 — 서버 받음표의 useState · applied · supersededBy 로 가림(REG-1, 시험 저장소 이름으로) */
  await scenario('17 다른 맥: 늦은 거두기 · 늦은 등록은 밀림 · 이미 거둔 쓰임 · 옛 내용 다시 등록은 새 시각으로 한 번', 12, 'W3 3 + W4 3 + W5 3 + W6 3', [S], async () => {
    const withdrawnOf = async (useId: string) => allUses((await apiGet(S, 'yunho')).json).find((u: Loose) => u.useId === useId)?.withdrawn;
    const rejectedOf = (m: Machine, key: string): Loose => {
      const f = path.join(m.stateDir, 'rejected', `${key}.json`);
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    };

    /* (가) 맥북의 거두기가 꺼진 동안 대기 → 그 사이 맥 미니가 고쳐 등록 → 맥북 retry: 거두기는 밀림 */
    const a0 = await cli(macmini, registerArgs({ url: U_W3, review: 'EX-OPS-005', item: 'ITEM-W3', fixtureOk: true }));
    const w3use = a0.out?.useId ?? '';
    await S.stop();
    const aw = await cli(macbook, ['withdraw', '--use', w3use, '--reason', '시험: 맥북에서 거둬요', '--fixture-ok']);
    await S.start(S.port);
    const a1 = await cli(macmini, registerArgs({ url: U_W3, review: 'EX-OPS-005', item: 'ITEM-W3', application: '시험: 맥 미니에서 나중에 고친 글이에요.', fixtureOk: true }));
    check('17.1 맥북 거두기 대기(4) · 맥 미니 고친 등록(5)', a0.code === 5 && aw.code === 4 && a1.code === 5 && pendingCount(macbook) === 1, `codes ${a0.code} ${aw.code} ${a1.code}`);
    const ar = await cli(macbook, ['retry', '--fixture-ok']);
    const arr = ar.out?.results?.[0] ?? {};
    const arj = rejectedOf(macbook, aw.out?.requestKey ?? '');
    check(
      '17.2 맥북 retry → 늦은 등록에 밀린 거두기는 superseded(다시 보내지 않음) · 끝 번호 5(시험 저장소) · 대기 0',
      ar.code === 5 && ar.out?.superseded === 1 && ar.out?.pendingLeft === 0 && arr.status === 'superseded' && arr.supersededBy === 'register' && arr.fixture === true && arr.central === false,
      `code ${ar.code} · ${JSON.stringify({ s: arr.status, by: arr.supersededBy, left: ar.out?.pendingLeft })}`,
    );
    check('17.3 rejected(superseded-fixture · serverSupersededBy register · 받음표 번호) · 쓰임은 살아 있음', arj?.reason === 'superseded-fixture' && arj?.serverSupersededBy === 'register' && /^[0-9a-f]{64}$/.test(arj?.opId ?? '') && (await withdrawnOf(w3use)) === false);

    /* (나) 맥북의 등록이 꺼진 동안 대기 → 그 사이 맥 미니가 거둠 → 맥북 retry: 등록은 밀림(거둔 쓰임을 성공이라 하지 않음) */
    const b0 = await cli(macmini, registerArgs({ url: U_W4, review: 'EX-OPS-006', item: 'ITEM-W4', fixtureOk: true }));
    const w4use = b0.out?.useId ?? '';
    await S.stop();
    const bm = await cli(macbook, registerArgs({ url: U_W4, review: 'EX-OPS-006', item: 'ITEM-W4', application: '시험: 맥북에서 먼저 적은 같은 쓰임이에요.', fixtureOk: true }));
    await S.start(S.port);
    const bw = await cli(macmini, ['withdraw', '--use', w4use, '--reason', '시험: 맥 미니에서 거둬요', '--fixture-ok']);
    check('17.4 맥북 등록 대기(4) · 맥 미니 거두기(5) · 거둔 상태', b0.code === 5 && bm.code === 4 && bw.code === 5 && (await withdrawnOf(w4use)) === true, `codes ${b0.code} ${bm.code} ${bw.code}`);
    const br = await cli(macbook, ['retry', '--fixture-ok']);
    const brr = br.out?.results?.[0] ?? {};
    check(
      '17.5 맥북 retry → 늦은 거두기에 밀린 등록은 superseded · fixture-saved 아님 · useState withdrawn · 쓰임은 거둔 그대로',
      br.code === 5 && br.out?.superseded === 1 && br.out?.fixtureSaved === 0 && brr.status === 'superseded' && brr.useState === 'withdrawn' && brr.supersededBy === 'withdraw' && rejectedOf(macbook, bm.out?.requestKey ?? '')?.reason === 'superseded-fixture' && (await withdrawnOf(w4use)) === true,
      `code ${br.code} · ${JSON.stringify({ s: brr.status, us: brr.useState })}`,
    );

    /* (다) 둘 다 거둠: 맥북의 이른 거두기 대기 → 맥 미니가 더 늦게 거둠 → 맥북 retry: 이미 거둔 상태(already-withdrawn) */
    const c0 = await cli(macmini, registerArgs({ url: U_W5, review: 'EX-OPS-007', item: 'ITEM-W5', fixtureOk: true }));
    const w5use = c0.out?.useId ?? '';
    await S.stop();
    const cm = await cli(macbook, ['withdraw', '--use', w5use, '--reason', '시험: 맥북에서 먼저 거둬요', '--fixture-ok']);
    await S.start(S.port);
    const cw = await cli(macmini, ['withdraw', '--use', w5use, '--reason', '시험: 맥 미니에서 나중에 거둬요', '--fixture-ok']);
    const cr = await cli(macbook, ['retry', '--fixture-ok']);
    const crr = cr.out?.results?.[0] ?? {};
    const fr = path.join(macbook.stateDir, 'fixture-receipts', `${cm.out?.requestKey}.json`);
    const frj: Loose = fs.existsSync(fr) ? JSON.parse(fs.readFileSync(fr, 'utf8')) : null;
    check(
      '17.6 맥북 retry → 이미 다른 거두기로 거둔 쓰임 → fixture-already-withdrawn · 끝 번호 5 · 대기 0 · 시험 받음표 applied false',
      c0.code === 5 && cm.code === 4 && cw.code === 5 && cr.code === 5 && cr.out?.fixtureAlreadyWithdrawn === 1 && crr.status === 'fixture-already-withdrawn' && crr.applied === false && crr.supersededBy === 'withdraw' && pendingCount(macbook) === 0 && frj?.applied === false && frj?.central === false && (await withdrawnOf(w5use)) === true,
      `code ${cr.code} · ${JSON.stringify({ s: crr.status, applied: crr.applied, by: crr.supersededBy })}`,
    );

    /* (라) 맥 미니 등록 → 맥북이 거둠 → 맥 미니가 같은 내용 다시 register: 이 맥은 거두기를 몰라 옛 시각을 다시 쓰지만,
       서버가 '거둔 쓰임'이라 알려 새 시각으로 한 번 다시 보내 되살린다 */
    const d0 = await cli(macmini, registerArgs({ url: U_W6, review: 'EX-OPS-008', item: 'ITEM-W6', fixtureOk: true }));
    const w6use = d0.out?.useId ?? '';
    const dw = await cli(macbook, ['withdraw', '--use', w6use, '--reason', '시험: 맥북에서 거둬요', '--fixture-ok']);
    const d1 = await cli(macmini, registerArgs({ url: U_W6, review: 'EX-OPS-008', item: 'ITEM-W6', fixtureOk: true }));
    check(
      '17.7 맥 미니 같은 내용 다시 register → 서버가 거둔 쓰임이라 알림 → 새 시각으로 한 번 다시 → fixture-saved 5 · refreshed · 되살아남',
      d0.code === 5 && dw.code === 5 && d1.code === 5 && d1.out?.status === 'fixture-saved' && d1.out?.refreshed === true && d1.out?.refreshedFrom === d0.out?.requestKey && d1.out?.requestKey !== d0.out?.requestKey && d1.out?.useState === 'active' && (await withdrawnOf(w6use)) === false,
      `code ${d1.code} · ${JSON.stringify({ s: d1.out?.status, refreshed: d1.out?.refreshed, us: d1.out?.useState })}`,
    );
    check('17.8 두 맥 대기 0 · 중앙이라 한 출력 없음', pendingCount(macmini) === 0 && pendingCount(macbook) === 0 && ![a0, aw, a1, ar, b0, bm, bw, br, c0, cm, cw, cr, d0, dw, d1].some((x) => CENTRAL_SUCCESS.some((re) => re.test(x.stdout))));
  });

  /* 15. 전체 확인 */
  await scenario('15 전체: 중앙 성공 없음 · 진짜 상태 폴더 없음 · 기록 장부 · 비밀 · 표', 0, '읽기만', [S], async () => {
    await S.settle();
    const allOut = TRANSCRIPT.map((t) => t.stdout + t.stderr).join('\n');
    check('15.1 어떤 도구 출력에도 중앙 성공 글자가 없음("central":true · "store":"central" · registered 등)', !CENTRAL_SUCCESS.some((re) => re.test(allOut)));
    check('15.2 어떤 도구도 끝 번호 0 으로 등록 · audit 을 끝내지 않음', !TRANSCRIPT.some((t) => t.code === 0 && ['register', 'retry', 'audit', 'withdraw'].includes(t.args[0]) && !(t.args[0] === 'retry' && /"status":"empty"/.test(t.stdout))));
    check('15.3 어느 컴퓨터에도 중앙 받음표(receipts.jsonl)가 없음', MACHINES.every((m) => !fs.existsSync(path.join(m.stateDir, 'receipts.jsonl'))));
    const realAfter = REAL_STATE_DIRS.map((p) => fs.existsSync(p));
    check('15.4 진짜 상태 폴더가 시험 전에도 없었고 지금도 없음', realBefore.every((x) => !x) && realAfter.every((x) => !x), JSON.stringify(REAL_STATE_DIRS.map((p, i) => [p, realBefore[i], realAfter[i]])));
    const rows = opRows();
    check('15.5 시험 저장소의 모든 기록이 진짜 검사(checkedOp)를 지남', rows.length > 0 && rows.every((r) => r.parsed));
    const keys = rows.map((r) => `${r.userId}|${r.requestKey}`);
    check('15.6 같은 계정 · 같은 요청 번호의 기록은 하나뿐', new Set(keys).size === keys.length);
    const ledgerSum = LEDGER.reduce((n, r) => n + r.expected, 0);
    check('15.7 기록 수 = 장부의 합', rows.length === ledgerSum, `${rows.length} vs ${ledgerSum}`);
    const child = readbackInChild();
    check('15.8 다른 프로세스로 다시 읽어도 기록 수 같음 · 모양이 틀린 기록 0', child?.ok === true && child?.ops === rows.length && child?.skippedOps === 0);
    const stateFiles = MACHINES.flatMap((m) => listFiles(m.stateDir));
    const nonSession = stateFiles.filter((f) => path.basename(f) !== 'session.json');
    check('15.9 지어낸 비밀 글자가 출력 · 상태 폴더 · 시험 저장소 어디에도 없음', !leaksIn(allOut).secret && !stateFiles.some((f) => fs.readFileSync(f, 'utf8').includes(SECRET_MARK)) && !listFiles(FIXTURE_DIR).some((f) => fs.readFileSync(f, 'utf8').includes(SECRET_MARK)));
    check('15.10 서버가 받은 어떤 본문에도 비밀 글자가 없음', !S.log.some((e) => e.bodyHasSecret));
    check('15.11 표는 session.json 에만 있고 출력 · 다른 상태 파일 · 시험 저장소에 없음', !leaksIn(allOut).token && !nonSession.some((f) => leaksIn(fs.readFileSync(f, 'utf8')).token) && !listFiles(FIXTURE_DIR).some((f) => leaksIn(fs.readFileSync(f, 'utf8')).token));
    check('15.12 상태 폴더의 파일은 모두 0600', stateFiles.every((f) => modeOf(f) === 0o600), stateFiles.filter((f) => modeOf(f) !== 0o600).map((f) => path.relative(TMP, f)).join(', '));
    const apiLogs = S.log.filter((e) => e.path === API_PATH || e.path === IMPORT_PATH);
    check('15.13 API 응답은 모두 no-store', apiLogs.every((e) => /no-store/.test(e.cacheControl ?? '')), String(apiLogs.filter((e) => !/no-store/.test(e.cacheControl ?? '')).length));
    const cliPosts = apiLogs.filter((e) => e.method === 'POST' && e.path === API_PATH);
    check('15.14 도구의 쓰기 요청: x-review-evidence 1 · application/json · Origin · Sec-Fetch-Site 없음(진짜 요청 출처 검사를 그대로 지남)', cliPosts.length > 0 && cliPosts.every((e) => e.xReviewEvidence === '1' && /^application\/json/.test(e.contentType ?? '') && e.origin === null && e.secFetchSite === null));
    /* 진짜 요청 출처 검사가 실제로 막는가(시험이 머리를 바꿔 보냄) */
    const before = opsCount();
    const body = '{}';
    const cross = await apiPost(S, 'yunho', API_PATH, body, { 'content-type': 'application/json', 'x-review-evidence': '1', 'sec-fetch-site': 'cross-site' });
    const evil = await apiPost(S, 'yunho', API_PATH, body, { 'content-type': 'application/json', 'x-review-evidence': '1', origin: 'http://evil.example' });
    const noHdr = await apiPost(S, 'yunho', API_PATH, body, { 'content-type': 'application/json' });
    const anon = await apiPost(S, null, API_PATH, body, { 'content-type': 'application/json', 'x-review-evidence': '1' });
    check('15.15 다른 사이트 요청 403 bad_origin · 머리 없음 403 missing_header · 로그인 없음 401 · 기록 그대로', cross.status === 403 && cross.json?.error === 'bad_origin' && evil.status === 403 && evil.json?.error === 'bad_origin' && noHdr.status === 403 && noHdr.json?.error === 'missing_header' && anon.status === 401 && opsCount() === before);
    const impAnon = await apiPost(S, null, IMPORT_PATH, body, { 'content-type': 'application/json', 'x-review-evidence': '1' });
    const impBad = await apiPost(S, 'kimmin', IMPORT_PATH, body, { 'content-type': 'application/json', 'x-review-evidence': '1' });
    check('15.16 가져오기 입구: 로그인 없음 401 · 빈 본문 400 · 기록 그대로', impAnon.status === 401 && impBad.status === 400 && opsCount() === before);
    const final = await apiGet(S, 'yunho');
    check('15.17 마지막 목록: 출처 · 쓰임 수가 다른 프로세스 읽기와 같음 · skippedOps 0 · foreignObjects 0', final.json?.counts?.uses === child?.uses && final.json?.counts?.sources === child?.sources && final.json?.counts?.skippedOps === 0 && final.json?.counts?.foreignObjects === 0);
  });

  await S.stop();
  const seconds = Math.round((Date.now() - t0) / 1000);

  /* 장부 · 요약 */
  console.log('\n장부(시험 저장소 기록 수, 중앙 아님):');
  for (const r of LEDGER) console.log(`  ${r.ok ? 'OK  ' : '실패'} ${r.scenario}: +${r.delta}(기대 +${r.expected}) → ${r.after} · ${r.note}`);
  const total = opsCount();
  console.log(`  합계 ${total} 건(시험 저장소 local-fixture) · 중앙 쓰기 0 건(중앙 주소에 닿은 적 없음)`);

  const reportPath = process.env.REVIEW_EVIDENCE_OPS_REPORT;
  if (reportPath) {
    const scrub = (s: string) => {
      let out = s.split(SECRET_MARK).join('[지어낸 비밀]');
      for (const t of ISSUED_TOKENS) out = out.split(t).join('[표]');
      return out;
    };
    const report = {
      fixtureOnly: true,
      centralWrites: 0,
      pass,
      fail,
      seconds,
      failures: failures.map(scrub),
      ledger: LEDGER,
      fixtureOpsTotal: total,
      serverRequests: S.log.length,
      transcript: TRANSCRIPT.map((t) => ({
        machine: t.machine,
        args: t.args.map((a) => scrub(a.startsWith(TMP) ? `<tmp>/${path.relative(TMP, a)}` : a)),
        code: t.code,
        stdout: scrub(t.stdout.split(TMP).join('<tmp>').split(BASE).join('<base>')),
        stderr: scrub(t.stderr.split(TMP).join('<tmp>').split(BASE).join('<base>')),
      })),
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n통과 ${pass} · 실패 ${fail} · ${seconds}초`);
  if (fail) {
    console.log('실패 목록:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

await main();
