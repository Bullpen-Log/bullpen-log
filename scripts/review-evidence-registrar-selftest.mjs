#!/usr/bin/env node
/**
 * EX-REF04 — 등록 도구(scripts/review-evidence-registrar.mjs) 자체 시험.
 *   node scripts/review-evidence-registrar-selftest.mjs
 *
 * 내 컴퓨터 127.0.0.1 의 아무 포트에 가짜 서버(그리고 가짜 NCBI)를 띄우고, 상태 폴더는 임시 폴더(REVIEW_EVIDENCE_STATE_DIR)로 돌려
 * 진짜 도구를 자식 프로세스로 부른다. 진짜 서버 · DB · 바깥 네트워크에는 닿지 않는다.
 * 확인: 코드 로그인(쿠키 0600 저장 · 출력에 안 나옴) · 등록 성공(store 'central' 일 때만 · 대기 지움 · 받음표) ·
 * 시험 저장소(local-fixture) 응답은 등록이 아님(4 · 대기 남김 · 받음표 없음) · 503 대기(4) · 같은 요청 번호 · 같은 본문으로 다시 보내기 ·
 * 쓴 시각(notedAt)이 본문에 들어가고 다시 보내도 같음 · 같은 쓰임의 새 등록이 옛 대기를 밀어냄(superseded) ·
 * 409 충돌(2) · 400 거절(3) · 넘김 응답 안 따라감 · http 바깥 주소 거절 · retry --max 로 남긴 것은 4 · retry 자물쇠(busy) ·
 * 다른 프로세스가 끝낸 대기를 되살리지 않음 · 다른 주소의 대기 · discard · withdraw · NCBI 확인 값만 보냄(번호 섞지 않음 · 종류는 발행 유형에서만) ·
 * url.ts 와 같은 링크 규칙(check-url) · import 의 본문 지문 · 저장소 확인 · audit 이 빠진 인용을 찾음 · 비밀 값이 표준 출력 · 오류에 안 나옴.
 * R2: 받지 않는 링크(서명 · 토큰 · 비공개 저장소)가 표준 출력 · 오류 · 상태 폴더 어디에도 안 남음(자리 · 지문만) · audit 이
 * 건너뜀 · 알아볼 수 없는 기록이 있으면 incomplete(1) · 지원하지 않는 기록 모양 3 · 검수자별 범위(--reviewer: 내 계정 mine · 그 검수자의 과거 기록만) ·
 * 기록 폴더와 옵션이 다르면 64 · 옛 서버(apiVersion 없음) 4 · --fixture-ok(내 컴퓨터 주소만, 5, fixture-receipts 로 옮김, 중앙이라 하지 않음) ·
 * 받음표 칸(opId · sourceId · useId · receivedAt · replayed · visible · store) · status 의 판 · pending 의 수 · 가장 오래된 것.
 * R2 보완: 붙여 쓴 링크 · 링크 안의 링크(url.ts 와 같이) · --json 의 모르는 칸과 서버가 되돌린 칸 이름 가리기 · records 밖 링크 ·
 * https:// 없는 학술 링크 · 한글이 이어지는 링크(모호) · 로그인 전 대기의 주소 · 깨진 session.json · 거둔 뒤 다시 등록 · 되살린 뒤 다시 거두기 ·
 * 받음표 useState · applied · supersededBy(한 번 새 시각으로 · retry 는 밀림 · 이미 거둔 상태 · 옛 서버는 예전 그대로) ·
 * 대기에만 있는 인용(pendingLocal) · 알아볼 수 없는 기록만 있어도 incomplete · 다른 검수 번호의 같은 링크.
 * 검수 기록 · 입력 파일은 상태 폴더 밖(따로 만든 임시 폴더)에 둔다 — 상태 폴더 전체를 비밀 글자로 훑어보기 위해.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'review-evidence-registrar.mjs');
const URL_TS = path.join(HERE, '..', 'lib', 'review-evidence', 'url.ts');
const SECRET = 'SeLfTeStSeSsIoNvAlUe.abc123-XYZ789_secret';
const SECRET2 = 'StdinSessionValue.def456-QRS000_other';
const TICKET = 'ABCDEFGH';
const FOREIGN_USE = 'use_' + 'f'.repeat(24);
const MISSING_USE = 'use_' + 'e'.repeat(24);
/* 지어낸 비밀 링크 — 이 글자들이 출력 · 상태 폴더 어디에도 나오면 안 된다 */
const SECRET_MARK1 = 'SECRETTOKEN0123456789';
const SECRET_MARK2 = 'SIGSECRET9876543210';
const SECRET_URL1 = `https://abcdefgh.supabase.co/storage/v1/object/sign/pitch-videos/a.mp4?token=${SECRET_MARK1}`;
const SECRET_URL2 = `https://cdn.example-video.com/f.mp4?X-Amz-Signature=${SECRET_MARK2}`;
/* 개인 파일 공유 링크(경로에 든 파일 번호가 비밀) — 다른 링크에 쉼표로 붙여 써도 거절 · 가림 */
const SECRET_MARK3 = 'DRIVEMARK0123456789';
const SECRET_URL3 = `https://drive.google.com/file/d/1${SECRET_MARK3}xyz/view?usp=sharing`;
const MARKS = [SECRET_MARK1, SECRET_MARK2, SECRET_MARK3];
const hasMark = (text) => MARKS.some((m) => String(text).includes(m));

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`실패: ${name}${detail ? ` · ${detail}` : ''}`);
  }
};
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/* ───────── 가짜 서버 ───────── */

const S = {
  mode: 'ok', // ok | fixture | 503 | 409 | 400 | redirect | invisible | slow | vanish
  listStore: 'central',
  apiVersion: 2, // null 이면 목록 응답에 판이 없음(옛 서버)
  summaryVersion: true, // false 면 요약 응답에만 판을 싣지 않음
  listGets: 0,
  claims: 0,
  sources: [],
  posts: [], // { requestKey, body, cookie, origin, headers }
  imports: new Map(), // requestKey → sha256(body)
  importPosts: [],
  strayHits: 0,
  strayCookies: [],
  /* R2 받음표 약속(useState · applied · supersededBy)을 흉내 낼 때 — 다음 쓰기 응답의 받음표에 차례로 덮어쓴다(비면 옛 서버 모양) */
  receiptOverrides: [],
  /* true 면 같은 계정 · 분야 · 검수 · 운동 · 링크의 등록을 같은 쓰임으로 묶는다(진짜 서버처럼). 거둔 쓰임은 다시 등록하면 살아남 */
  mergeUses: false,
  /* 400 응답의 issues 를 이것으로(서버가 모르는 키 이름을 그대로 되돌려 보낸 것처럼) */
  echoIssues: null,
};
let STATE = '';

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
const send = (res, status, obj, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...extra });
  res.end(JSON.stringify(obj));
};
const sessionOf = (req) => /(?:^|;\s*)session=([^;]*)/.exec(req.headers.cookie ?? '')?.[1] ?? null;
const authed = (req) => sessionOf(req) === SECRET || sessionOf(req) === SECRET2;
const makeUseId = (n) => 'use_' + n.toString(16).padStart(24, '0');
const storeOf = () => (S.mode === 'fixture' ? 'local-fixture' : 'central');

let strayPort = 0;
const stray = http.createServer((req, res) => {
  S.strayHits++;
  if (req.headers.cookie) S.strayCookies.push(req.headers.cookie);
  send(res, 200, { ok: true, receipt: null });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = req.method === 'POST' ? await readBody(req) : '';
  if (url.pathname === '/api/rpc/login-ticket.createLoginTicket') {
    if (req.headers['x-bullpen-app'] !== '8') return send(res, 426, { ok: false, error: 'update' });
    return send(res, 200, { ok: true, result: { code: TICKET, expiresAt: new Date(Date.now() + 120000).toISOString() } });
  }
  if (url.pathname === '/api/rpc/login-ticket.claimLoginTicket') {
    S.claims++;
    if (S.claims < 2) return send(res, 200, { ok: true, result: { state: 'waiting' } });
    return send(res, 200, { ok: true, result: { state: 'approved' } }, { 'set-cookie': [`session=${SECRET}; Path=/; HttpOnly; SameSite=Lax`, 'other=1; Path=/'] });
  }
  if (url.pathname === '/api/admin/review-evidence' && req.method === 'GET') {
    if (!authed(req)) return send(res, 401, { ok: false, error: 'unauthenticated', message: '로그인이 필요해요.' });
    const counts = { sources: S.sources.length, uses: S.sources.reduce((n, s) => n + s.uses.length, 0), foreignObjects: 0 };
    const head = { ok: true, store: S.listStore, viewer: { label: '시험관리자' } };
    if (url.searchParams.get('view') === 'summary') return send(res, 200, { ...head, ...(S.apiVersion && S.summaryVersion ? { apiVersion: S.apiVersion } : {}), counts });
    S.listGets++;
    /* 목록 v2: 쓰임마다 mine(요청한 계정이 등록함) · historicalReviewer. 계정 값(owner)은 내보내지 않는다 */
    const me = sessionOf(req);
    const sources = S.sources.map((s) => ({
      id: s.id,
      links: s.links,
      uses: s.uses.map((u) => ({
        useId: u.useId,
        domain: u.domain,
        reviewId: u.reviewId,
        itemId: u.itemId ?? null,
        purpose: u.purpose,
        consultedOn: u.consultedOn ?? null,
        scope: u.scope,
        href: u.href,
        otherHrefs: u.otherHrefs ?? [],
        withdrawn: !!u.withdrawn,
        mine: u.scope === 'historical' ? false : u.owner === me,
        historicalReviewer: u.scope === 'historical' ? u.historicalReviewer : null,
      })),
    }));
    return send(res, 200, { ...head, ...(S.apiVersion ? { apiVersion: S.apiVersion } : {}), counts, sources });
  }
  if (url.pathname === '/api/admin/review-evidence/import' && req.method === 'POST') {
    if (!authed(req)) return send(res, 401, { ok: false, error: 'unauthenticated' });
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      return send(res, 400, { ok: false, error: 'bad_json' });
    }
    S.importPosts.push({ requestKey: parsed.requestKey, body });
    const prev = S.imports.get(parsed.requestKey);
    if (prev && prev !== sha(body)) return send(res, 409, { ok: false, error: 'conflict', message: '같은 요청 번호로 다른 내용이 이미 저장돼 있어요.' });
    S.imports.set(parsed.requestKey, sha(body));
    const receipt = { opId: 'b'.repeat(64), requestKey: parsed.requestKey, kind: 'import', receivedAt: new Date().toISOString(), replayed: !!prev, visible: true, placements: [], records: parsed.records?.length ?? 0 };
    return send(res, prev ? 200 : 201, { ok: true, store: storeOf(), receipt });
  }
  if (url.pathname === '/api/admin/review-evidence' && req.method === 'POST') {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* 아래에서 거절 */
    }
    S.posts.push({ requestKey: parsed?.requestKey ?? null, body, cookie: req.headers.cookie ?? null, origin: req.headers.origin ?? null, headers: req.headers });
    if (!authed(req)) return send(res, 401, { ok: false, error: 'unauthenticated', message: '로그인이 필요해요.' });
    if (req.headers['x-review-evidence'] !== '1' || !/^application\/json/.test(req.headers['content-type'] ?? '')) return send(res, 403, { ok: false, error: 'missing_header' });
    if (req.headers.origin) return send(res, 403, { ok: false, error: 'bad_origin' });
    if (!parsed) return send(res, 400, { ok: false, error: 'bad_json', message: 'JSON 모양이 맞지 않아요.' });
    if (S.mode === 'slow') await new Promise((r) => setTimeout(r, 900));
    if (S.mode === 'vanish') {
      /* 다른 프로세스가 그 사이 등록을 끝내고 대기 파일을 지운 것처럼 */
      fs.rmSync(path.join(STATE, 'pending', `${parsed.requestKey}.json`), { force: true });
      return send(res, 503, { ok: false, error: 'pending', reason: 'save' });
    }
    if (S.mode === '503') return send(res, 503, { ok: false, error: 'pending', message: '저장했는지 확인하지 못했어요.', reason: 'save' });
    if (S.mode === '409') return send(res, 409, { ok: false, error: 'conflict', message: '같은 요청 번호로 다른 내용이 이미 저장돼 있어요.' });
    if (S.mode === '400') return send(res, 400, { ok: false, error: 'invalid', message: '넣은 값을 확인해 주세요.', issues: S.echoIssues ?? [{ field: 'use.applicationKo', message: '한국어로 짧게 적어 주세요.' }] });
    if (S.mode === 'redirect') {
      res.writeHead(302, { location: `http://localhost:${strayPort}/steal` });
      return res.end();
    }
    if (parsed.withdraw) {
      const w = parsed.withdraw;
      if (w.useId === FOREIGN_USE) return send(res, 403, { ok: false, error: 'forbidden', issues: [{ field: 'withdraw.useId', message: '다른 사람이 등록한 쓰임은 거둘 수 없어요.' }] });
      const target = S.sources.flatMap((s) => s.uses).find((u) => u.useId === w.useId);
      if (!target) return send(res, 400, { ok: false, error: 'invalid', issues: [{ field: 'withdraw.useId', message: '그 번호의 쓰임이 없어요.' }] });
      const replayed = target.withdrawnBy === parsed.requestKey;
      if (S.mode !== 'fixture') {
        target.withdrawnBy = parsed.requestKey;
        target.withdrawn = { reasonKo: w.reasonKo };
      }
      const receipt = { opId: 'c'.repeat(64), requestKey: parsed.requestKey, kind: 'withdraw', receivedAt: new Date().toISOString(), replayed, visible: true, placements: [{ sourceId: 'src_x', useId: w.useId }], records: 1, ...(S.receiptOverrides.shift() ?? {}) };
      return send(res, replayed ? 200 : 201, { ok: true, store: storeOf(), receipt });
    }
    const replayed = S.sources.some((s) => s.uses.some((u) => u.rk === parsed.requestKey || (u.rks ?? []).includes(parsed.requestKey)));
    const owner = sessionOf(req);
    const same = S.mergeUses
      ? S.sources.flatMap((s) => s.uses.map((u) => ({ s, u }))).find(({ u }) => u.owner === owner && u.domain === parsed.use.domain && u.reviewId === parsed.use.reviewId && (u.itemId ?? null) === (parsed.use.itemId ?? null) && u.href === parsed.source.url)
      : null;
    const sourceId = same ? same.s.id : `src_${S.sources.length + 1}`;
    const useId = same ? same.u.useId : makeUseId(S.sources.length + 1);
    if (same && !replayed && S.mode !== 'invisible' && S.mode !== 'fixture') {
      same.u.rks = [...(same.u.rks ?? []), parsed.requestKey];
      same.u.withdrawn = false;
    } else if (!same && !replayed && S.mode !== 'invisible' && S.mode !== 'fixture')
      S.sources.push({ id: sourceId, links: [parsed.source.url], uses: [{ useId, rk: parsed.requestKey, owner, domain: parsed.use.domain, reviewId: parsed.use.reviewId, itemId: parsed.use.itemId ?? null, purpose: parsed.use.purpose, consultedOn: parsed.use.consultedOn ?? null, scope: 'user', href: parsed.source.url }] });
    const receipt = { opId: 'a'.repeat(64), requestKey: parsed.requestKey, kind: 'register', receivedAt: new Date().toISOString(), replayed, visible: S.mode !== 'invisible', placements: S.mode === 'invisible' ? [] : [{ sourceId, useId }], records: 1, ...(S.receiptOverrides.shift() ?? {}) };
    return send(res, replayed ? 200 : 201, { ok: true, store: storeOf(), receipt });
  }
  send(res, 404, { ok: false, error: 'not_found' });
});

/* 가짜 NCBI — idconv 는 pmid 를 숫자로 준다(실제와 같게) */
const N = { mode: 'ok', pubtype: ['Practice Guideline'], hits: 0 };
const ncbi = http.createServer((req, res) => {
  N.hits++;
  const url = new URL(req.url, 'http://127.0.0.1');
  if (N.mode === 'fail') return send(res, 500, { error: 'down' });
  if (url.pathname === '/tools/idconv/api/v1/articles/') return send(res, 200, { status: 'ok', records: [{ pmid: 39118306, pmcid: 'PMC7777777', doi: '10.5555/right.paper' }] });
  if (url.pathname === '/entrez/eutils/esummary.fcgi')
    return send(res, 200, {
      result: {
        uids: ['39118306'],
        39118306: { uid: '39118306', title: '<i>Verified</i> title from NCBI', authors: [{ name: 'Kim A' }], fulljournalname: 'Journal of Tests', pubdate: '2024 Aug', pubtype: N.pubtype, articleids: [{ idtype: 'doi', value: '10.5555/right.paper' }] },
      },
    });
  send(res, 404, {});
});

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

/* ───────── 도구 부르기 ───────── */

STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-ref04-registrar-'));
/* 입력 · 검수 기록 파일은 상태 폴더 밖에 — 상태 폴더를 비밀 글자로 통째로 훑어본다 */
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-ref04-registrar-fix-'));
const writeFix = (rel, value) => {
  const f = path.join(FIX, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value));
  return f;
};
/** 상태 폴더 안 모든 파일의 글자(바로가기는 건너뜀) */
function stateText() {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      const st = fs.lstatSync(f);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(f);
      else out.push(fs.readFileSync(f, 'utf8'));
    }
  };
  walk(STATE);
  return out.join('\n');
}
const allOutput = [];
let ncbiBase = '';

function run(args, { stdin = null, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, REVIEW_EVIDENCE_STATE_DIR: STATE, REVIEW_EVIDENCE_POLL_MS: '150', REVIEW_EVIDENCE_NCBI_TEST_BASE: ncbiBase, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    if (stdin !== null) child.stdin.end(stdin);
    else child.stdin.end();
    child.on('close', (code) => {
      allOutput.push(out, err);
      let json = null;
      try {
        json = JSON.parse(out.trim());
      } catch {
        json = null;
      }
      const lines = out.trim().split('\n').filter(Boolean).length;
      resolve({ code, out, err, json, lines });
    });
  });
}

const dirFiles = (d) => (fs.existsSync(path.join(STATE, d)) ? fs.readdirSync(path.join(STATE, d)).filter((n) => n.endsWith('.json')) : []);
const pendingFiles = () => dirFiles('pending');
const rejectedFiles = () => dirFiles('rejected');
const readQ = (d, key) => {
  const f = path.join(STATE, d, `${key}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
};
const receiptLines = () => (fs.existsSync(path.join(STATE, 'receipts.jsonl')) ? fs.readFileSync(path.join(STATE, 'receipts.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const postsFor = (key) => S.posts.filter((p) => p.requestKey === key);

const APP = '설명의 시작 자세 문장을 이 자료에 맞췄어요.';
const reg = (url, review, extra = [], app = APP) => ['register', '--url', url, '--domain', 'exercise', '--review', review, '--purpose', 'description', '--application', app, ...extra];

/* ───────── 시험 ───────── */

const port = await listen(server);
strayPort = await listen(stray);
ncbiBase = `http://127.0.0.1:${await listen(ncbi)}`;
const BASE = `http://127.0.0.1:${port}`;
const OTHER_BASE = `http://127.0.0.1:${strayPort}`;

try {
  /* 1. 코드 로그인 */
  {
    const r = await run(['login', '--base', BASE]);
    check('로그인 끝 번호 0', r.code === 0, `code=${r.code} out=${r.out}`);
    check('로그인 출력은 JSON 한 줄', r.lines === 1 && r.json?.status === 'logged-in' && r.json?.central === true);
    check('승인 주소 · 코드를 알려 줌', r.err.includes(`${BASE}/link/${TICKET}`) && r.err.includes('ABCD-EFGH'));
    const file = path.join(STATE, 'session.json');
    const st = fs.statSync(file);
    check('세션 파일 0600', (st.mode & 0o777) === 0o600, (st.mode & 0o777).toString(8));
    check('상태 폴더 0700', (fs.statSync(STATE).mode & 0o777) === 0o700 || process.platform === 'win32', (fs.statSync(STATE).mode & 0o777).toString(8));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('세션 값이 저장됨', saved.session === SECRET && saved.base === BASE && saved.viewerLabel === '시험관리자');
    check('로그인 출력에 쿠키 없음', !r.out.includes(SECRET) && !r.err.includes(SECRET));
  }

  /* 2. http 바깥 주소 거절 */
  {
    const r = await run(['login', '--base', 'http://example.com', '--session-stdin'], { stdin: 'whatever-session-value' });
    check('http 바깥 주소는 거절(64)', r.code === 64 && r.json?.ok === false, `code=${r.code}`);
    const r2 = await run(['login', '--base', 'http://localhost', '--session-stdin'], { stdin: 'whatever-session-value' });
    check('포트 없는 http localhost 도 거절', r2.code === 64);
  }

  /* 3. 표준 입력 세션 로그인 */
  {
    const r = await run(['login', '--base', BASE, '--session-stdin'], { stdin: `session=${SECRET2}\n` });
    check('표준 입력 로그인 0', r.code === 0 && r.json?.status === 'logged-in', r.out);
    check('표준 입력 값이 출력에 없음', !r.out.includes(SECRET2) && !r.err.includes(SECRET2));
    const saved = JSON.parse(fs.readFileSync(path.join(STATE, 'session.json'), 'utf8'));
    check('표준 입력 값으로 바뀜', saved.session === SECRET2);
  }

  /* 4. 등록 성공(central) */
  S.mode = 'ok';
  {
    const r = await run(reg('https://pubmed.ncbi.nlm.nih.gov/12345678/', 'EX-T-001', ['--consulted', '2026-11-01', '--reading', 'abstract']));
    check('등록 성공 0', r.code === 0 && r.json?.ok === true && r.json?.status === 'registered' && r.json?.store === 'central', r.out);
    check(
      '등록 출력에 받음표 칸(opId · sourceId · useId · receivedAt · replayed · visible · store · central)',
      r.json?.opId === 'a'.repeat(64) && r.json?.sourceId === 'src_1' && /^use_[0-9a-f]{24}$/.test(r.json?.useId ?? '') && ISO.test(r.json?.receivedAt ?? '') && r.json?.replayed === false && r.json?.visible === true && r.json?.central === true,
      r.out,
    );
    check('대기열 비움', pendingFiles().length === 0);
    const lines = receiptLines();
    check('받음표 한 줄 · 저장소 central', lines.length === 1 && lines[0].requestKey === r.json?.requestKey && lines[0].reviewId === 'EX-T-001' && lines[0].sourceId === 'src_1' && lines[0].store === 'central', JSON.stringify(lines[0]));
    check('받음표에 비밀 없음', !fs.readFileSync(path.join(STATE, 'receipts.jsonl'), 'utf8').includes(SECRET2));
    const p = S.posts.at(-1);
    check('쿠키 · 머리 · Origin 없음', p.cookie === `session=${SECRET2}` && p.origin === null && p.headers['x-review-evidence'] === '1' && /^application\/json/.test(p.headers['content-type']));
    check('요청 번호 모양', /^rk-cli-[0-9a-f]{48}$/.test(r.json?.requestKey ?? ''));
    const sent = JSON.parse(p.body);
    check('본문에 쓴 시각(notedAt)', ISO.test(sent.use?.notedAt ?? '') && sent.use.notedAt === r.json?.notedAt, p.body);
    const again = await run(reg('https://pubmed.ncbi.nlm.nih.gov/12345678/', 'EX-T-001', ['--consulted', '2026-11-01', '--reading', 'abstract']));
    check('같은 등록 다시 = already-registered(같은 요청 번호 · 같은 본문)', again.code === 0 && again.json?.status === 'already-registered' && again.json?.requestKey === r.json?.requestKey && S.posts.at(-1).body === p.body, again.out);
    check('다시 보낸 받음표는 replayed true', again.json?.replayed === true && again.json?.central === true);
    check('받음표 줄에 itemId · replayed 칸', 'itemId' in receiptLines()[0] && receiptLines()[0].replayed === false);
  }

  /* 5. 503 → 대기, 성공이라 하지 않음 */
  let pendingKey = null;
  S.mode = '503';
  {
    const r = await run(reg('https://doi.org/10.1000/test.503', 'EX-T-002'));
    check('503 끝 번호 4', r.code === 4, `code=${r.code}`);
    check('503 은 성공이라 하지 않음', r.json?.ok === false && r.json?.status === 'pending' && !/registered/.test(r.out));
    check('대기 출력에 요청 번호 · 실패 종류 · 중앙 아님', /^rk-cli-/.test(r.json?.requestKey ?? '') && r.json?.error === 'pending' && r.json?.central === false && r.json?.opId === null, r.out);
    check('대기 파일 남음', pendingFiles().length === 1);
    pendingKey = r.json?.requestKey;
    const entry = readQ('pending', pendingKey);
    check('대기에 시도 수 · 까닭 · 쓴 시각', entry.attempts === 1 && entry.lastError === 'pending' && ISO.test(entry.notedAt ?? ''));
    check('대기 파일 0600', (fs.statSync(path.join(STATE, 'pending', `${pendingKey}.json`)).mode & 0o777) === 0o600);
    const again = await run(reg('https://doi.org/10.1000/test.503', 'EX-T-002'));
    check('대기 중 같은 등록 = 같은 요청 번호 · 같은 본문', again.json?.requestKey === pendingKey && postsFor(pendingKey).length === 2 && postsFor(pendingKey)[0].body === postsFor(pendingKey)[1].body && pendingFiles().length === 1);
  }

  /* 6. 넘김 응답은 따라가지 않음 */
  S.mode = 'redirect';
  {
    const r = await run(reg('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/', 'EX-T-003'));
    check('넘김 응답 4', r.code === 4 && r.json?.error === 'redirect', r.out);
    check('다른 서버에 안 감', S.strayHits === 0 && S.strayCookies.length === 0);
  }

  /* 7. 다시 보내기 — 같은 요청 번호 · 같은 본문 */
  S.mode = 'ok';
  {
    const firstBody = postsFor(pendingKey)[0]?.body;
    const r = await run(['retry']);
    check('retry 0', r.code === 0 && r.json?.registered === 2 && r.json?.pendingLeft === 0, r.out);
    check('retry 결과마다 받음표 칸', r.json?.results?.length === 2 && r.json.results.every((x) => x.store === 'central' && x.central === true && x.opId === 'a'.repeat(64) && x.visible === true && typeof x.domain === 'string'), r.out);
    const resent = postsFor(pendingKey).map((p) => p.body);
    check('같은 요청 번호로 다시 보냄', resent.length === 3);
    check('본문 글자까지 같음', resent.every((b) => b === firstBody));
    check('retry 뒤 대기 없음', pendingFiles().length === 0);
    check('retry 자물쇠는 끝나면 지움', !fs.existsSync(path.join(STATE, 'retry.lock')));
  }

  /* 8. 409 → rejected, 2 */
  S.mode = '409';
  {
    const r = await run(reg('https://www.nsca.com/education/articles/test-conflict/', 'EX-T-004'));
    check('409 끝 번호 2', r.code === 2 && r.json?.status === 'rejected', r.out);
    check('409 은 rejected 로', rejectedFiles().length === 1 && pendingFiles().length === 0);
  }

  /* 9. 400 → rejected, 3 */
  S.mode = '400';
  {
    const r = await run(reg('https://journals.lww.com/nsca-jscr/test-invalid', 'EX-T-005'));
    check('400 끝 번호 3', r.code === 3 && r.json?.status === 'rejected' && Array.isArray(r.json?.issues) && r.json.issues.length === 1, r.out);
    check('400 은 rejected 로', rejectedFiles().length === 2 && pendingFiles().length === 0);
  }

  /* 10. 보였는지 미확인 → 대기 */
  S.mode = 'invisible';
  {
    const r = await run(reg('https://bjsm.bmj.com/content/test-invisible', 'EX-T-006'));
    check('미확인 4', r.code === 4 && r.json?.error === 'unconfirmed' && pendingFiles().length === 1, r.out);
  }

  /* 11. 한국어 없는 적용 글 → 대기열에 안 넣고 3 */
  S.mode = 'ok';
  {
    const before = pendingFiles().length;
    const postsBefore = S.posts.length;
    const r = await run(['register', '--url', 'https://example.org.kr/x', '--domain', 'exercise', '--review', 'EX-T-007', '--purpose', 'cue', '--application', 'english only']);
    check('잘못된 입력 3', r.code === 3 && r.json?.status === 'invalid', r.out);
    check('잘못된 입력은 대기열 · 서버에 안 감', pendingFiles().length === before && S.posts.length === postsBefore);
    const r2 = await run(['register', '--url', 'http://insecure.example.org/x', '--domain', 'exercise', '--review', 'EX-T-007', '--purpose', 'cue', '--application', '적용']);
    check('http 출처 거절', r2.code === 3);
    const r3 = await run(['register', '--url', 'https://site.org/a?auth_token=zzz', '--domain', 'exercise', '--review', 'EX-T-007', '--purpose', 'cue', '--application', '적용']);
    check('비밀 쿼리 링크는 도구에서 먼저 거절', r3.code === 3 && r3.json?.issues?.[0]?.field === 'source.url' && S.posts.length === postsBefore, r3.out);
  }

  /* 12. NCBI 가 아닌 주소에 lookup — 네트워크 없이 건너뜀 */
  {
    const hits = N.hits;
    const r = await run(reg('https://www.acsm.org/test-lookup', 'EX-T-008', ['--lookup-ncbi']));
    check('lookup 건너뛰고 등록', r.code === 0 && r.json?.lookup?.ok === false && r.json?.notes?.length >= 1 && N.hits === hits, r.out);
  }

  /* 13. pending · status */
  {
    const r = await run(['pending']);
    check('pending 목록', r.code === 0 && r.json?.pending?.length === 1 && r.json?.rejected?.length === 2);
    const row = r.json?.pending?.[0] ?? {};
    check(
      'pending 수 · 가장 오래된 것 · 줄 칸',
      r.json?.count === 1 && ISO.test(r.json?.oldest ?? '') && r.json?.oldestRequestKey === row.requestKey && r.json?.rejectedCount === 2 && row.domain === 'exercise' && row.reviewId === 'EX-T-006' && 'itemId' in row && row.kind === 'register' && row.lastError === 'unconfirmed',
      r.out,
    );
    check('pending 에 세션 · 본문 없음', !r.out.includes(SECRET2) && !r.out.includes('bodyText'));
    const s = await run(['status']);
    check('status 는 세션 여부만', s.code === 0 && s.json?.sessionSaved === true && s.json?.server?.ok === true && s.json?.server?.central === true && !s.out.includes(SECRET2));
    check(
      'status 에 상태 폴더 · 주소 · 판 · audit 가능 · 저장소',
      s.json?.stateDir === STATE && s.json?.base === BASE && s.json?.apiVersion === 2 && s.json?.auditSupported === true && s.json?.store === 'central' && s.json?.central === true && s.json?.pending === 1 && ISO.test(s.json?.oldestPending ?? '') && s.json?.perMachine === true,
      s.out,
    );
    const clear = await run(['retry']);
    check('미확인 대기는 다음 retry 에 들어감', clear.code === 0 && pendingFiles().length === 0, clear.out);
  }

  /* 14. audit */
  {
    const fixture = path.join(FIX, 'fixture-records.json');
    fs.writeFileSync(
      fixture,
      JSON.stringify([
        {
          review_id: 'EX-T-001',
          media: { library_database_id: 'lib-1' },
          evidence: { sources: ['https://PubMed.ncbi.nlm.nih.gov/12345678?utm_source=x#top', 'https://www.cdc.gov/missing-one/', 'https://my_site.com/x'] },
          catalog_url: 'https://www.dugout-not-cited.org/catalog',
          source: { source_id: 'canonical_local_record', url: 'https://should-be-ignored.org/x' },
          notes: '본문 안 https://not-a-whole-url.org/a. 링크도 인용으로 셈(R2: 문장 속 링크를 빠뜨리지 않음)',
        },
        { review_id: 'EX-T-999', later_user_edits: [{ sources: [{ url: 'https://www.cdc.gov/other-review' }] }] },
      ]),
    );
    const noReviewer = await run(['audit', '--records', fixture, '--domain', 'exercise']);
    check('audit 은 --reviewer 가 꼭 있어야 함(64)', noReviewer.code === 64, noReviewer.out);
    const r = await run(['audit', '--records', fixture, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('audit 빠짐 있으면 1', r.code === 1, `code=${r.code} out=${r.out}`);
    const urls = (r.json?.missing ?? []).map((m) => m.url).sort();
    check(
      'audit 빠진 것 정확(문장 속 링크 포함 · 끝의 마침표는 뗌)',
      urls.length === 3 && urls[0] === 'https://not-a-whole-url.org/a' && urls[1] === 'https://www.cdc.gov/missing-one/' && urls[2] === 'https://www.cdc.gov/other-review',
      JSON.stringify(urls),
    );
    const inText = (r.json?.missing ?? []).filter((m) => m.inText === true);
    check('문장 속 링크만 inText true · 자리는 그 글 칸', inText.length === 1 && inText[0].url === 'https://not-a-whole-url.org/a' && inText[0].field === 'notes', JSON.stringify(r.json?.missing));
    check('audit 등록 1(정규화로 맞춤)', r.json?.registered === 1);
    const sk = r.json?.skipped?.[0] ?? {};
    check(
      '서버가 거절할 링크는 skipped(url.ts 규칙) · 자리와 지문만',
      r.json?.skipped?.length === 1 && r.json?.skippedCount === 1 && sk.code === 'bad_host' && sk.reviewId === 'EX-T-001' && sk.recordIndex === 0 && sk.field === 'evidence.sources[2]' && sk.fingerprint === sha('https://my_site.com/x').slice(0, 12) && !('url' in sk),
      JSON.stringify(r.json?.skipped),
    );
    check('건너뛴 것이 있으면 incomplete(빠짐보다 앞)', r.json?.status === 'incomplete' && r.json?.ok === false && !r.out.includes('my_site.com'), r.out);
    check('빠진 줄에 자리(recordIndex · field)', (r.json?.missing ?? []).every((m) => Number.isInteger(m.recordIndex) && typeof m.field === 'string'), JSON.stringify(r.json?.missing));
    const one = await run(['audit', '--records', fixture, '--domain', 'exercise', '--reviewer', 'yunho', '--review', 'EX-T-001']);
    check('audit --review 거르기', one.json?.missing?.length === 2 && one.json?.cited === 3, one.out);
    const mech = await run(['audit', '--records', fixture, '--domain', 'mechanics', '--reviewer', 'yunho', '--review', 'EX-T-001']);
    check('다른 분야 쓰임은 안 셈', mech.json?.registered === 0 && mech.json?.missing?.length === 3, mech.out);
    S.listStore = 'local-fixture';
    const fx = await run(['audit', '--records', fixture, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('시험 저장소 목록으로는 등록을 세지 않음(4)', fx.code === 4 && fx.json?.status === 'fixture-only' && fx.json?.registered === 0 && fx.json?.central === false, fx.out);
    S.listStore = 'central';
  }

  /* 15. 시험 저장소(local-fixture) 응답은 등록이 아님 */
  S.mode = 'fixture';
  let fixtureKey = null;
  {
    const before = receiptLines().length;
    const r = await run(reg('https://www.acsm.org/fixture-only', 'EX-T-011'));
    fixtureKey = r.json?.requestKey;
    check('fixture 응답은 4 · fixture-only', r.code === 4 && r.json?.ok === false && r.json?.status === 'fixture-only' && r.json?.store === 'local-fixture', r.out);
    check('fixture 응답 뒤 대기 남김', pendingFiles().includes(`${fixtureKey}.json`) && readQ('pending', fixtureKey).lastError === 'fixture-only');
    check('fixture 응답은 받음표 안 씀', receiptLines().length === before);
    const rr = await run(['retry']);
    check('fixture retry 도 4', rr.code === 4 && rr.json?.ok === false && rr.json?.fixtureOnly === 1 && rr.json?.pendingLeft === 1, rr.out);
    S.mode = 'ok';
    const ok = await run(['retry']);
    check('central 이면 그때 등록', ok.code === 0 && ok.json?.registered === 1 && pendingFiles().length === 0 && receiptLines().at(-1).requestKey === fixtureKey, ok.out);
  }

  /* 16. 같은 쓰임의 새 등록이 옛 대기를 밀어냄(superseded) — 늦은 retry 가 고침을 덮지 않게 */
  S.mode = '503';
  {
    const URL1 = 'https://www.nsca.com/education/articles/supersede-test/';
    const old = await run(reg(URL1, 'EX-T-012', [], '옛 적용 내용이에요.'));
    const oldKey = old.json?.requestKey;
    await new Promise((r) => setTimeout(r, 5));
    const fixed = await run(reg(URL1.replace('/supersede-test/', '/supersede-test'), 'EX-T-012', [], '고친 적용 내용이에요.'));
    const newKey = fixed.json?.requestKey;
    check('새 등록은 다른 요청 번호', oldKey && newKey && oldKey !== newKey);
    check('옛 대기는 rejected(superseded)', !pendingFiles().includes(`${oldKey}.json`) && rejectedFiles().includes(`${oldKey}.json`) && readQ('rejected', oldKey).reason === 'superseded' && readQ('rejected', oldKey).supersededBy === newKey);
    check('출력에 밀어낸 번호', Array.isArray(fixed.json?.superseded) && fixed.json.superseded[0] === oldKey);
    check('새 쓴 시각이 더 늦음', readQ('pending', newKey).notedAt > readQ('rejected', oldKey).notedAt);
    const oldPosts = postsFor(oldKey).length;
    S.mode = 'ok';
    const r = await run(['retry']);
    check('retry 는 새 것만 보냄', r.code === 0 && postsFor(oldKey).length === oldPosts && postsFor(newKey).length === 2, r.out);
    /* 옛 내용으로 되돌리기 = 새 시각의 새 요청(이미 등록된 옛 받음표를 다시 쓰지 않음) */
    S.mode = '503';
    const back = await run(reg(URL1, 'EX-T-012', [], '옛 적용 내용이에요.'));
    check('되돌림은 새 요청 번호', back.json?.requestKey && back.json.requestKey !== oldKey && back.json.requestKey !== newKey, back.out);
    S.mode = 'ok';
    await run(['retry']);
  }

  /* 17. retry --max 로 남기면 4 */
  S.mode = '503';
  {
    await run(reg('https://www.acsm.org/max-one', 'EX-T-013'));
    await run(reg('https://www.acsm.org/max-two', 'EX-T-014'));
    S.mode = 'ok';
    const r = await run(['retry', '--max', '1']);
    check('--max 뒤에 남으면 4 · ok false', r.code === 4 && r.json?.ok === false && r.json?.notAttempted === 1 && r.json?.pendingLeft === 1 && r.json?.registered === 1, r.out);
    const r2 = await run(['retry']);
    check('나머지 retry 0', r2.code === 0 && r2.json?.pendingLeft === 0, r2.out);
  }

  /* 18. retry 자물쇠 */
  S.mode = '503';
  {
    await run(reg('https://www.acsm.org/lock-test', 'EX-T-015'));
    const lockFile = path.join(STATE, 'retry.lock');
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { mode: 0o600 });
    S.mode = 'ok';
    const busy = await run(['retry']);
    check('다른 retry 중이면 4 busy', busy.code === 4 && busy.json?.status === 'busy' && pendingFiles().length === 1, busy.out);
    const busyDiscard = await run(['discard', (pendingFiles()[0] ?? 'rk-cli-missing.json').slice(0, -5), '--reason', '시험이라 버려요']);
    check('retry 중에는 discard 도 4', busyDiscard.code === 4 && pendingFiles().length === 1, busyDiscard.out);
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 2147483646, at: new Date().toISOString() }), { mode: 0o600 });
    const stale = await run(['retry']);
    check('죽은 주인의 자물쇠는 버리고 진행', stale.code === 0 && pendingFiles().length === 0 && !fs.existsSync(lockFile), stale.out);
    /* 동시에 둘 */
    S.mode = '503';
    await run(reg('https://www.acsm.org/lock-race', 'EX-T-016'));
    S.mode = 'slow';
    const [a, b] = await Promise.all([run(['retry']), run(['retry'])]);
    const codes = [a.code, b.code].sort();
    check('동시 retry 하나는 busy', codes[0] === 0 && codes[1] === 4 && [a, b].some((x) => x.json?.status === 'busy'), `${a.out} ${b.out}`);
    check('동시 retry 뒤 대기 없음', pendingFiles().length === 0);
  }

  /* 19. 다른 프로세스가 끝낸 대기를 되살리지 않음 */
  S.mode = '503';
  {
    const r = await run(reg('https://www.acsm.org/vanish-test', 'EX-T-017'));
    const key = r.json?.requestKey;
    S.mode = 'vanish';
    await run(['retry']);
    check('지워진 대기는 다시 만들지 않음', !pendingFiles().includes(`${key}.json`) && !rejectedFiles().includes(`${key}.json`));
  }

  /* 20. 다른 주소의 대기 · discard */
  S.mode = 'ok';
  {
    const postsBefore = S.posts.length;
    const r = await run(reg('https://www.acsm.org/other-base', 'EX-T-018', ['--base', OTHER_BASE]));
    const key = r.json?.requestKey;
    check('다른 --base 는 대기로 남김(64 아님)', r.code === 4 && r.json?.error === 'base-mismatch' && readQ('pending', key).base === OTHER_BASE && S.posts.length === postsBefore, r.out);
    const rr = await run(['retry']);
    check('다른 주소 대기는 안 보내고 4', rr.code === 4 && rr.json?.baseMismatch === 1 && S.posts.length === postsBefore && S.strayHits === 0, rr.out);
    const noReason = await run(['discard', key]);
    check('까닭 없는 discard 는 3', noReason.code === 3 && pendingFiles().includes(`${key}.json`));
    const unknown = await run(['discard', 'rk-cli-' + '0'.repeat(48), '--reason', '없는 번호예요']);
    check('없는 번호 discard 는 3', unknown.code === 3 && unknown.json?.status === 'not-found');
    const d = await run(['discard', key, '--reason', '다른 주소라 보내지 않아요']);
    check('discard 0 · rejected(discarded)', d.code === 0 && d.json?.status === 'discarded' && readQ('rejected', key).reason === 'discarded' && readQ('rejected', key).reasonKo === '다른 주소라 보내지 않아요', d.out);
    const empty = await run(['retry']);
    check('discard 뒤 retry 0', empty.code === 0 && empty.json?.status === 'empty', empty.out);
  }

  /* 21. withdraw */
  S.mode = 'ok';
  {
    const target = S.sources[0].uses[0].useId;
    const r = await run(['withdraw', '--use', target, '--reason', '잘못 고른 쓰임이라 거둬요']);
    check('withdraw 0', r.code === 0 && r.json?.status === 'withdrawn' && r.json?.store === 'central', r.out);
    const body = JSON.parse(S.posts.at(-1).body);
    check('withdraw 본문 모양', body.requestKey === r.json?.requestKey && body.withdraw?.useId === target && body.withdraw?.reasonKo === '잘못 고른 쓰임이라 거둬요' && ISO.test(body.withdraw?.notedAt ?? '') && !body.source && !body.use, S.posts.at(-1).body);
    check('withdraw 받음표', receiptLines().at(-1).kind === 'withdraw' && receiptLines().at(-1).withdrawUseId === target);
    const again = await run(['withdraw', '--use', target, '--reason', '잘못 고른 쓰임이라 거둬요']);
    check('같은 withdraw 다시 = already-withdrawn', again.code === 0 && again.json?.status === 'already-withdrawn' && again.json?.requestKey === r.json?.requestKey, again.out);
    const missing = await run(['withdraw', '--use', MISSING_USE, '--reason', '없는 쓰임이에요']);
    check('없는 쓰임 withdraw 는 3 · rejected', missing.code === 3 && missing.json?.status === 'rejected' && rejectedFiles().includes(`${missing.json?.requestKey}.json`), missing.out);
    const foreign = await run(['withdraw', '--use', FOREIGN_USE, '--reason', '남의 쓰임이에요']);
    check('남의 쓰임 withdraw 는 3', foreign.code === 3 && foreign.json?.status === 'rejected', foreign.out);
    const bad = await run(['withdraw', '--use', 'use_123', '--reason', '모양이 틀려요']);
    check('쓰임 번호 모양 틀리면 64', bad.code === 64);
    const noKo = await run(['withdraw', '--use', target, '--reason', 'english only']);
    check('까닭이 한국어가 아니면 3', noKo.code === 3);
    S.mode = 'fixture';
    const fx = await run(['withdraw', '--use', S.sources[1].uses[0].useId, '--reason', '시험 저장소로 거두기예요']);
    check('fixture withdraw 는 4 · 대기 남김', fx.code === 4 && fx.json?.status === 'fixture-only' && pendingFiles().includes(`${fx.json?.requestKey}.json`), fx.out);
    await run(['discard', fx.json?.requestKey, '--reason', '시험이라 버려요']);
    S.mode = 'ok';
  }

  /* 22. --lookup-ncbi: 확인한 값만 보내고 적어 넣은 번호와 섞지 않음 */
  S.mode = 'ok';
  {
    const input = path.join(FIX, 'lookup.json');
    const write = (review) =>
      fs.writeFileSync(
        input,
        JSON.stringify({
          source: {
            url: 'https://pubmed.ncbi.nlm.nih.gov/39118306/',
            title: '적어 넣은 제목',
            identifiers: { doi: '10.1234/wrong.paper', pmcid: 'PMC1111111' },
            altUrls: ['https://doi.org/10.9999/other', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7777777/'],
            verifiedBy: 'ncbi',
          },
          use: { domain: 'exercise', reviewId: review, purpose: 'evidence-check', applicationKo: '근거 확인에 썼어요.', notedAt: '2021-01-01T00:00:00.000Z' },
        }),
      );
    write('EX-T-019');
    const r = await run(['register', '--json', input, '--lookup-ncbi']);
    const sent = JSON.parse(S.posts.at(-1).body);
    check('lookup 성공 등록 0', r.code === 0 && r.json?.lookup?.ok === true, r.out);
    check('번호는 NCBI 값만(idconv 숫자 pmid 도 맞춤)', JSON.stringify(sent.source.identifiers) === JSON.stringify({ doi: '10.5555/right.paper', pmcid: 'PMC7777777', pmid: '39118306' }), JSON.stringify(sent.source.identifiers));
    check('확인 표시는 ncbi', sent.source.verifiedBy === 'ncbi');
    check('다른 링크는 확인 번호와 맞는 것만', JSON.stringify(sent.source.altUrls) === JSON.stringify(['https://pmc.ncbi.nlm.nih.gov/articles/PMC7777777/']), JSON.stringify(sent.source.altUrls));
    check('제목은 NCBI 값', sent.source.title === 'Verified title from NCBI');
    check('종류는 발행 유형(지침)에서', sent.source.kind === 'professional-guidance');
    check('적어 넣은 notedAt 은 쓰지 않음', sent.use.notedAt !== '2021-01-01T00:00:00.000Z' && ISO.test(sent.use.notedAt));
    N.pubtype = ['Journal Article'];
    write('EX-T-020');
    await run(['register', '--json', input, '--lookup-ncbi']);
    check('알아볼 수 없는 발행 유형이면 종류 비움', JSON.parse(S.posts.at(-1).body).source.kind === undefined, S.posts.at(-1).body);
    N.pubtype = ['Scoping Review', 'Journal Article'];
    write('EX-T-021');
    await run(['register', '--json', input, '--lookup-ncbi']);
    check('scoping review 는 원저가 아님', JSON.parse(S.posts.at(-1).body).source.kind === 'narrative-review');
    N.mode = 'fail';
    write('EX-T-022');
    const f = await run(['register', '--json', input, '--lookup-ncbi']);
    const sf = JSON.parse(S.posts.at(-1).body);
    check('lookup 실패 등록', f.code === 0 && f.json?.lookup?.ok === false, f.out);
    check('lookup 실패면 번호 · 확인 표시 · 다른 링크 · 종류 없음', sf.source.identifiers === undefined && sf.source.verifiedBy === undefined && sf.source.altUrls === undefined && sf.source.kind === undefined && sf.source.title === '적어 넣은 제목', JSON.stringify(sf.source));
    N.mode = 'ok';
    N.pubtype = ['Practice Guideline'];
  }

  /* 23. 링크 규칙이 url.ts 와 같음 */
  {
    const cases = [
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/#' + 'a'.repeat(121),
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/#' + 'a'.repeat(120),
      'https://my_site.com/x',
      'https://site.c/x',
      'https://-bad.org/x',
      'https://0x7f.1/x',
      'https://xn--3e0b707e.xn--3e0b707e/a',
      'https://a.org/x?auth_token=1',
      'https://a.org/x?sessionToken=1',
      'https://a.org/x?X-Auth-Token=1',
      'https://a.org/x?accessKey=1',
      'https://a.org/x?api_key=1',
      'https://a.org/x?X-Api-Key=1',
      'https://a.org/x?code=1',
      'https://a.org/x?state=1',
      'https://a.org/x?key=1',
      'https://a.org/x?pass=1',
      'https://a.org/x?x-amz-signature=1',
      'https://a.org/x?country_code=kr',
      'https://a.org/x?keyword=pitch',
      'https://a.org/x?us_state=ca',
      'https://a.org/x?passage=2',
      'https://a.org/x;jsessionid=ABC123',
      'https://a.org/x%3Bjsessionid%3DABC',
      'https://doi.org/10.1000%2Fabc.def',
      'https://Example.org.kr/a/?b=2&a=1&utm_source=x#top',
      'https://a.org/x#k=v',
      'https://localhost/x',
      'https://intra.corp/x',
      'https://foo.example.com/x',
      'https://drive.google.com/file/d/1',
      'https://192.168.0.1/x',
      'https://[::1]/x',
      'https://a.org:8443/x',
      'https://user@a.org/x',
      'https://@a.org/x',
      'http://a.org/x',
      'https://a.org/x\u200b',
      'https://a.org/' + 'x'.repeat(2050),
      'not a url',
      '',
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/',
      /* R2 보완: 링크 안의 링크(붙여 쓴 링크 · 넘김 주소 · 보관 주소) */
      'https://pubmed.ncbi.nlm.nih.gov/44444444/,https://drive.google.com/file/d/1x/view?usp=sharing',
      'https://pubmed.ncbi.nlm.nih.gov/1/;https://www.dropbox.com/s/abc/x.pdf',
      'https://pubmed.ncbi.nlm.nih.gov/1/(https://drive.google.com/file/d/1/view)',
      'https://web.archive.org/web/20200101000000/https://www.nsca.com/education/x',
      'https://web.archive.org/web/2020/http://192.168.0.1/x',
      'https://web.archive.org/web/2020/https://intra.corp/x',
      'https://web.archive.org/web/2020/https://user@site.org/x',
      'https://www.google.com/url?q=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2F1%2Fview&sa=D',
      'https://www.google.com/url?q=https%3A%2F%2Fpubmed.ncbi.nlm.nih.gov%2F123%2F&sa=D',
      'https://www.google.com/url?q=https%253A%252F%252Fdrive.google.com%252Ff',
      'https://a.org/r/https%3A%2F%2Fb.org%2Fx%3Ftoken%3Dabc',
      'https://pubmed.ncbi.nlm.nih.gov/1/,https://pubmed.ncbi.nlm.nih.gov/2/',
      'https://a.org/x#https://drive.google.com/file/d/1',
      'https://namu.wiki/w/회전근개',
      'https://대한체육.kr/guide',
    ];
    /* 붙여 쓴 링크 · 링크 안의 링크: 바깥 이름이 공개 사이트여도 안쪽이 받지 않는 곳이면 같은 까닭(두 규칙 모두) */
    const expectInner = {
      'https://pubmed.ncbi.nlm.nih.gov/44444444/,https://drive.google.com/file/d/1x/view?usp=sharing': 'private_file_host',
      'https://pubmed.ncbi.nlm.nih.gov/1/;https://www.dropbox.com/s/abc/x.pdf': 'private_file_host',
      'https://pubmed.ncbi.nlm.nih.gov/1/(https://drive.google.com/file/d/1/view)': 'private_file_host',
      'https://web.archive.org/web/2020/http://192.168.0.1/x': 'ip_host',
      'https://web.archive.org/web/2020/https://intra.corp/x': 'internal_host',
      'https://web.archive.org/web/2020/https://user@site.org/x': 'credentials',
      'https://www.google.com/url?q=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2F1%2Fview&sa=D': 'private_file_host',
      'https://www.google.com/url?q=https%253A%252F%252Fdrive.google.com%252Ff': 'private_file_host',
      'https://a.org/r/https%3A%2F%2Fb.org%2Fx%3Ftoken%3Dabc': 'secret_query',
      'https://a.org/x#https://drive.google.com/file/d/1': 'private_file_host',
      'https://web.archive.org/web/20200101000000/https://www.nsca.com/education/x': 'ok',
      'https://www.google.com/url?q=https%3A%2F%2Fpubmed.ncbi.nlm.nih.gov%2F123%2F&sa=D': 'ok',
      'https://pubmed.ncbi.nlm.nih.gov/1/,https://pubmed.ncbi.nlm.nih.gov/2/': 'ok',
    };
    const file = path.join(FIX, 'parity.json');
    fs.writeFileSync(file, JSON.stringify(cases));
    const r = await run(['check-url', '--json', file]);
    let server = null;
    try {
      server = await import(pathToFileURL(URL_TS).href);
    } catch (e) {
      check('url.ts 불러오기(Node 의 TS 형 지우기 필요)', false, e?.message);
    }
    if (server && Array.isArray(r.json?.results)) {
      cases.forEach((c, i) => {
        const a = server.checkEvidenceUrl(c);
        const b = r.json.results[i];
        const same = a.ok ? b.ok && a.href === b.href && a.normalized === b.normalized : !b.ok && a.reason === b.reason;
        check(`링크 규칙 같음: ${c.slice(0, 60)}`, same, `server=${JSON.stringify(a)} cli=${JSON.stringify(b)}`);
        if (Object.hasOwn(expectInner, c)) {
          const want = expectInner[c];
          check(`링크 안의 링크 규칙(url.ts): ${c.slice(0, 60)} → ${want}`, want === 'ok' ? a.ok === true : a.ok === false && a.reason === want, JSON.stringify(a));
        }
      });
    } else check('check-url 결과', false, r.out.slice(0, 300));
  }

  /* 24. import — 본문 지문 · 저장소 */
  {
    const manifest = path.join(FIX, 'manifest.json');
    const chunk = (i, note) => ({ requestKey: `rk-imp-snap1-${i}`, snapshot: { id: 'snap-1' }, chunk: { index: i, total: 2 }, records: [{ note }] });
    fs.writeFileSync(manifest, JSON.stringify({ chunks: [chunk(0, 'a'), chunk(1, 'b')] }));
    S.mode = 'ok';
    const r = await run(['import', '--manifest', manifest]);
    check('import 0', r.code === 0 && r.json?.ok === true && r.json?.confirmed === 2, r.out);
    const log = JSON.parse(fs.readFileSync(path.join(STATE, 'imports', 'snap-1.json'), 'utf8'));
    check('import 기록에 지문 · 저장소', log.chunks['0'].store === 'central' && /^[0-9a-f]{64}$/.test(log.chunks['0'].bodySha256));
    const n = S.importPosts.length;
    const again = await run(['import', '--manifest', manifest]);
    check('같은 내용 다시 = 안 보냄', again.code === 0 && S.importPosts.length === n && again.json?.results?.every((x) => x.status === 'confirmed-before'), again.out);
    fs.writeFileSync(manifest, JSON.stringify({ chunks: [chunk(0, 'a'), chunk(1, 'b-바뀜')] }));
    const changed = await run(['import', '--manifest', manifest]);
    check('바뀐 묶음은 다시 보내고 충돌을 알림(2)', changed.code === 2 && changed.json?.ok === false && S.importPosts.length === n + 1 && changed.json?.results?.[1]?.error === 'conflict', changed.out);
    const m2 = path.join(FIX, 'manifest2.json');
    fs.writeFileSync(m2, JSON.stringify({ chunks: [{ ...chunk(0, 'x'), requestKey: 'rk-imp-snap2-0', snapshot: { id: 'snap-2' } }] }));
    S.mode = 'fixture';
    const fx = await run(['import', '--manifest', m2]);
    check('fixture import 는 4 · 기록 안 함', fx.code === 4 && fx.json?.results?.[0]?.status === 'fixture-only' && !fs.existsSync(path.join(STATE, 'imports', 'snap-2.json')), fx.out);
    S.mode = 'ok';
    const n2 = S.importPosts.length;
    const real = await run(['import', '--manifest', m2]);
    check('central 이면 다시 보내 확인', real.code === 0 && S.importPosts.length === n2 + 1, real.out);
  }

  /* ───── R2 ───── */

  /* R2-1. check-url · register: 받지 않는 링크를 되풀이하지 않음 · 대기열에 안 넣음 */
  S.mode = 'ok';
  {
    const c1 = await run(['check-url', '--url', SECRET_URL1]);
    const x = c1.json?.results?.[0] ?? {};
    check('check-url 비밀 링크는 3 · 까닭 · 지문만', c1.code === 3 && x.ok === false && x.reason === 'private_file_host' && x.fingerprint === sha(SECRET_URL1).slice(0, 12) && x.index === 0 && !('input' in x), c1.out);
    check('check-url 출력에 비밀 없음', !hasMark(c1.out) && !hasMark(c1.err));
    const list = writeFix('check-list.json', [SECRET_URL2, 'https://pubmed.ncbi.nlm.nih.gov/12345678/']);
    const c2 = await run(['check-url', '--json', list]);
    check('check-url 목록: 거절은 지문, 통과는 정리한 링크', c2.code === 3 && c2.json?.results?.[0]?.reason === 'secret_query' && c2.json?.results?.[1]?.ok === true && c2.json?.results?.[1]?.href === 'https://pubmed.ncbi.nlm.nih.gov/12345678/' && !hasMark(c2.out + c2.err), c2.out);

    const postsBefore = S.posts.length;
    const pendingBefore = pendingFiles().length;
    const r1 = await run(reg(SECRET_URL1, 'EX-P-001'));
    check('비밀 링크 register 는 3 · 링크 칸 문제', r1.code === 3 && r1.json?.status === 'invalid' && r1.json?.issues?.[0]?.field === 'source.url', r1.out);
    const r2 = await run(reg(SECRET_URL2, 'EX-P-001', ['--lookup-ncbi']));
    check('서명 쿼리 링크 register 는 3(lookup 도 안 부름)', r2.code === 3 && r2.json?.issues?.some((i) => i.field === 'source.url'), r2.out);
    const r3 = await run(['register', SECRET_URL1, '--domain', 'exercise']);
    check('옵션 없이 넣은 링크는 64 · 되풀이하지 않음', r3.code === 64, r3.out);
    const r4 = await run(reg('https://www.acsm.org/title-guard', 'EX-P-002', ['--title', `참고 ${SECRET_URL2}`]));
    check('글 칸에 숨은 비밀 링크는 3', r4.code === 3 && r4.json?.issues?.some((i) => i.field === 'source.title'), r4.out);
    const j = writeFix('secret-json.json', { source: { url: 'https://www.acsm.org/json-guard', note: SECRET_URL1 }, use: { domain: 'exercise', reviewId: 'EX-P-003', purpose: 'cue', applicationKo: '큐 문장에 썼어요.' } });
    const r5 = await run(['register', '--json', j]);
    check('--json 의 모르는 칸에 숨은 비밀 링크도 3', r5.code === 3 && r5.json?.issues?.some((i) => i.field === 'source.note'), r5.out);
    const r6 = await run(['--https://abcdefgh.supabase.co/x?token=' + SECRET_MARK1]);
    check('명령 자리의 링크도 되풀이하지 않음(64)', r6.code === 64, r6.out);
    check('비밀 링크는 서버 · 대기열에 안 감', S.posts.length === postsBefore && pendingFiles().length === pendingBefore);
    check('비밀 링크 register 출력에 비밀 없음', ![r1, r2, r3, r4, r5, r6].some((x) => hasMark(x.out) || hasMark(x.err)));
    check('상태 폴더에 비밀 없음(register 뒤)', !hasMark(stateText()));
  }

  /* R2-2. audit 개인정보 · 정직함: 건너뜀 · 알아볼 수 없는 기록이 있으면 incomplete(1) */
  S.mode = 'ok';
  {
    const ok = await run(reg('https://www.cdc.gov/privacy-ok', 'EX-P-010'));
    check('개인정보 시험용 등록', ok.code === 0, ok.out);
    const recs = writeFix('privacy/video-records.json', [
      { review_id: 'EX-P-010', evidence: { sources: [SECRET_URL1, 'https://www.cdc.gov/privacy-ok'] }, media: { clip: SECRET_URL2 } },
      { sources: ['https://pubmed.ncbi.nlm.nih.gov/22222222/'] },
      'just a string row',
      { review_id: 'bad id with spaces', sources: [SECRET_URL1] },
    ]);
    const r = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('비밀 링크 · 알아볼 수 없는 기록이 있으면 incomplete 1(빠짐 0 이어도)', r.code === 1 && r.json?.ok === false && r.json?.status === 'incomplete' && r.json?.missingCount === 0 && r.json?.registered === 1, r.out);
    const sk = r.json?.skipped ?? [];
    check(
      '건너뜀 자리 · 지문(값 없음)',
      r.json?.skippedCount === 2 &&
        sk[0]?.reviewId === 'EX-P-010' && sk[0]?.recordIndex === 0 && sk[0]?.field === 'evidence.sources[0]' && sk[0]?.code === 'private_file_host' && sk[0]?.fingerprint === sha(SECRET_URL1).slice(0, 12) &&
        sk[1]?.field === 'media.clip' && sk[1]?.code === 'secret_query' && sk[1]?.fingerprint === sha(SECRET_URL2).slice(0, 12) &&
        sk.every((x) => !('url' in x) && typeof x.message === 'string'),
      JSON.stringify(sk),
    );
    const ig = r.json?.ignored ?? [];
    check(
      '알아볼 수 없는 기록 수 · 까닭',
      r.json?.ignoredRecords === 3 && ig[0]?.recordIndex === 1 && ig[0]?.code === 'missing_review_id' && ig[0]?.citedStrings === 1 && ig[1]?.code === 'not_object' && ig[2]?.code === 'invalid_review_id' && ig[2]?.citedStrings === 1,
      JSON.stringify(ig),
    );
    check('incomplete 는 다 됐다고 하지 않음', !/모두/.test(r.err) && /끝내지 못했어요/.test(r.err), r.err);
    check('audit 출력에 비밀 없음', !hasMark(r.out) && !hasMark(r.err));
    check('audit 범위 · 보는 계정', r.json?.scope?.reviewer === 'yunho' && r.json?.scope?.domain === 'exercise' && r.json?.scope?.review === null && r.json?.scope?.viewerLabel === '시험관리자' && JSON.stringify(r.json?.scope?.matchedBy) === JSON.stringify(['live:mine', 'historical:yunho']), JSON.stringify(r.json?.scope));
    const clean = writeFix('clean/records.json', { records: [{ review_id: 'EX-P-010', sources: ['https://www.cdc.gov/privacy-ok'] }] });
    const c = await run(['audit', '--records', clean, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('맞는 모양 · 다 등록된 기록은 complete 0', c.code === 0 && c.json?.ok === true && c.json?.status === 'complete' && c.json?.registered === 1 && c.json?.cited === 1 && c.json?.central === true, c.out);
    check('complete 에도 보는 계정 확인 안내', /본인인지는 도구가 확인할 수 없/.test(c.err), c.err);
    const nf = await run(['audit', '--records', clean, '--domain', 'exercise', '--reviewer', 'yunho', '--review', 'EX-NOPE-1']);
    check('--review 가 파일에 없으면 3', nf.code === 3 && nf.json?.status === 'review-not-found', nf.out);
    check('상태 폴더에 비밀 없음(audit 뒤)', !hasMark(stateText()));

    /* R2 원장(in-flight): 문장 속에만 적은 링크를 빠뜨리고 complete 0 이라 하지 않는다 */
    const prose = writeFix('prose/records.json', [{ review_id: 'EX-LOCAL-003', notes: '자료를 확인했어요 https://pubmed.ncbi.nlm.nih.gov/12345678/' }]);
    const p1 = await run(['audit', '--records', prose, '--domain', 'exercise', '--reviewer', 'yunho']);
    check(
      '문장 속 링크만 있는 기록은 complete 이 아님(빠짐 1 · inText)',
      p1.code === 1 && p1.json?.status === 'missing' && p1.json?.cited === 1 && p1.json?.missing?.[0]?.inText === true && p1.json?.missing?.[0]?.url === 'https://pubmed.ncbi.nlm.nih.gov/12345678/' && p1.json?.missing?.[0]?.field === 'notes',
      p1.out,
    );
    const proseOk = writeFix('prose-ok/records.json', [{ review_id: 'EX-P-010', notes: '확인한 자료(https://www.cdc.gov/privacy-ok)를 적용했어요.' }]);
    const p2 = await run(['audit', '--records', proseOk, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('문장 속 링크도 등록과 맞으면 complete 0(괄호 · 마침표 뗌)', p2.code === 0 && p2.json?.status === 'complete' && p2.json?.registered === 1 && p2.json?.cited === 1, p2.out);
    const proseSecret = writeFix('prose-secret/records.json', [{ review_id: 'EX-P-010', notes: `영상 메모 ${SECRET_URL1} 확인했어요` }]);
    const p3 = await run(['audit', '--records', proseSecret, '--domain', 'exercise', '--reviewer', 'yunho']);
    const psk = p3.json?.skipped?.[0] ?? {};
    check(
      '문장 속 비밀 링크는 건너뜀(incomplete 1) · 자리 · 지문만 · inText',
      p3.code === 1 && p3.json?.status === 'incomplete' && p3.json?.skippedCount === 1 && psk.inText === true && psk.field === 'notes' && psk.code === 'private_file_host' && psk.fingerprint === sha(SECRET_URL1).slice(0, 12) && !('url' in psk),
      p3.out,
    );
    check('문장 속 비밀 링크 audit 출력 · 상태 폴더에 비밀 없음', !hasMark(p3.out) && !hasMark(p3.err) && !hasMark(stateText()));
  }

  /* R2-3. 지원하지 않는 기록 모양 3 */
  {
    for (const [name, value] of [
      ['unsupported-obj.json', { foo: [] }],
      ['unsupported-empty.json', []],
      ['unsupported-noid.json', [1, 'x', { sources: ['https://pubmed.ncbi.nlm.nih.gov/11111111/'] }]],
    ]) {
      const r = await run(['audit', '--records', writeFix(name, value), '--domain', 'exercise', '--reviewer', 'yunho']);
      check(`지원하지 않는 기록 3: ${name}`, r.code === 3 && r.json?.ok === false && r.json?.status === 'unsupported', r.out);
    }
    const bad = await run(['audit', '--records', writeFix('broken.json', '{ not json'), '--domain', 'exercise', '--reviewer', 'yunho']);
    check('JSON 이 아니면 3', bad.code === 3 && bad.json?.status === 'invalid', bad.out);
  }

  /* R2-4. 기록 폴더(handoff/<분야>/<검수자>)와 옵션이 다르면 64 */
  {
    const hf = writeFix('docs/reviews/handoff/exercise/yunho/video-records.json', [{ review_id: 'EX-P-010', sources: ['https://www.cdc.gov/privacy-ok'] }]);
    const wrongReviewer = await run(['audit', '--records', hf, '--domain', 'exercise', '--reviewer', 'kimmin']);
    check('다른 검수자 이름 64', wrongReviewer.code === 64, wrongReviewer.out);
    const wrongDomain = await run(['audit', '--records', hf, '--domain', 'mechanics', '--reviewer', 'yunho']);
    check('다른 분야 64', wrongDomain.code === 64, wrongDomain.out);
    const link = path.join(FIX, 'linked-records.json');
    fs.symlinkSync(hf, link);
    const viaLink = await run(['audit', '--records', link, '--domain', 'exercise', '--reviewer', 'kimmin']);
    check('바로가기로 가려도 실제 폴더로 64', viaLink.code === 64, viaLink.out);
    const right = await run(['audit', '--records', hf, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('폴더와 맞으면 진행(complete 0)', right.code === 0 && right.json?.status === 'complete', right.out);
    const badName = await run(['audit', '--records', hf, '--domain', 'exercise', '--reviewer', 'someone']);
    check('모르는 검수자 이름 64', badName.code === 64, badName.out);
    /* 김민 기록 폴더는 handoff/<분야>/min — 검수자 이름 kimmin 과 맞는다 */
    const mf = writeFix('docs/reviews/handoff/exercise/min/video-records.json', [{ review_id: 'EX-P-010', sources: ['https://www.cdc.gov/privacy-ok'] }]);
    const minAsKim = await run(['audit', '--records', mf, '--domain', 'exercise', '--reviewer', 'kimmin']);
    check('min 폴더는 kimmin 으로 진행(64 아님)', minAsKim.code !== 64 && minAsKim.json?.scope?.reviewer === 'kimmin', minAsKim.out);
    const minAsYunho = await run(['audit', '--records', mf, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('min 폴더를 yunho 로 세면 64', minAsYunho.code === 64, minAsYunho.out);
  }

  /* R2-5. 검수자별 범위: 내 계정(mine) · 그 검수자의 과거 기록만 등록으로 셈 */
  {
    const U = (k) => `https://www.acsm.org/scope-${k}`;
    let n = 900;
    const seed = (k, use) => {
      n++;
      S.sources.push({ id: `src_seed_${k}`, links: [U(k)], uses: [{ useId: makeUseId(n), domain: 'exercise', reviewId: 'EX-S-001', itemId: null, purpose: 'cue', consultedOn: null, href: U(k), ...use }] });
    };
    seed('a', { scope: 'user', owner: SECRET2 });
    seed('b', { scope: 'user', owner: 'OTHER-ACCOUNT-SESSION' });
    seed('c', { scope: 'historical', historicalReviewer: 'kimmin' });
    seed('d', { scope: 'historical', historicalReviewer: 'yunho' });
    seed('e', { scope: 'user', owner: SECRET2, withdrawn: { reasonKo: '거둠' } });
    seed('f', { scope: 'live', owner: SECRET2 });
    const recs = writeFix('scope/records.json', [{ review_id: 'EX-S-001', sources: ['a', 'b', 'c', 'd', 'e', 'f'].map(U) }]);
    const y = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'yunho']);
    const ym = (y.json?.missing ?? []).map((m) => m.url).sort();
    check('yunho: 내 계정 지금 등록 · yunho 과거 기록만 셈', y.code === 1 && y.json?.status === 'missing' && y.json?.registered === 3 && JSON.stringify(ym) === JSON.stringify([U('b'), U('c'), U('e')]), y.out);
    const by = Object.fromEntries((y.json?.missing ?? []).map((m) => [m.url, m]));
    check('남의 계정 쓰임 · 다른 검수자 과거 기록은 따로 셈', y.json?.otherReviewerUses === 2 && by[U('b')]?.otherReviewerUse === true && by[U('c')]?.otherReviewerUse === true && by[U('e')]?.otherReviewerUse === false, JSON.stringify(y.json?.missing));
    check('거둔 내 쓰임은 셈하지 않음(withdrawnOnly)', by[U('e')]?.withdrawnOnly === true && y.json?.withdrawnOnly === 1);
    const k = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'kimmin']);
    const km = (k.json?.missing ?? []).map((m) => m.url).sort();
    check('kimmin: kimmin 과거 기록 · 이 계정 지금 등록만 셈', k.code === 1 && k.json?.registered === 3 && JSON.stringify(km) === JSON.stringify([U('b'), U('d'), U('e')]) && k.json?.otherReviewerUses === 2, k.out);
    check('kimmin 범위 표시', k.json?.scope?.reviewer === 'kimmin' && k.json?.scope?.matchedBy?.includes('historical:kimmin'));
    check('목록 응답의 계정 값은 출력에 없음', !y.out.includes('OTHER-ACCOUNT-SESSION') && !k.out.includes('OTHER-ACCOUNT-SESSION'));
  }

  /* R2-6. 옛 서버(목록에 apiVersion 없음) → server-too-old 4 · status 판 */
  {
    const clean = path.join(FIX, 'clean/records.json');
    S.apiVersion = null;
    const r = await run(['audit', '--records', clean, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('판 없는 서버는 audit 하지 않음(4 server-too-old)', r.code === 4 && r.json?.status === 'server-too-old' && r.json?.apiVersion === null && r.json?.ok === false && /apiVersion 2/.test(r.err), r.out);
    const st = await run(['status']);
    check('status: 판 null · audit 못 함', st.code === 0 && st.json?.apiVersion === null && st.json?.auditSupported === false, st.out);
    S.apiVersion = 2;
    S.summaryVersion = false;
    const gets = S.listGets;
    const st2 = await run(['status']);
    check('요약에 판이 없으면 목록에서 읽음', st2.json?.apiVersion === 2 && st2.json?.auditSupported === true && S.listGets === gets + 1, st2.out);
    S.summaryVersion = true;
  }

  /* R2-7. --fixture-ok: 내 컴퓨터 주소 · 시험 저장소일 때만 5, 중앙이라 하지 않음 */
  {
    const sessionFile = path.join(STATE, 'session.json');
    const savedSession = fs.readFileSync(sessionFile, 'utf8');
    const receiptsBefore = receiptLines().length;
    const fixtureFiles = () => dirFiles('fixture-receipts');

    S.mode = 'fixture';
    S.listStore = 'local-fixture';
    const r = await run(reg('https://www.acsm.org/fixture-ok', 'EX-F-001', ['--fixture-ok']));
    const key = r.json?.requestKey;
    check('--fixture-ok 시험 저장소 확인은 5 · fixture-saved', r.code === 5 && r.json?.status === 'fixture-saved' && r.json?.ok === false && r.json?.fixture === true, r.out);
    check('시험 저장소 결과는 중앙이라 하지 않음', r.json?.store === 'local-fixture' && r.json?.central === false && !r.out.includes(':"central"') && !/synced/i.test(r.out + r.err) && /중앙 등록이 아니에요/.test(r.err), r.out + r.err);
    check('대기에서 fixture-receipts 로 옮김', !pendingFiles().includes(`${key}.json`) && fixtureFiles().includes(`${key}.json`) && receiptLines().length === receiptsBefore);
    const fr = readQ('fixture-receipts', key);
    check('fixture 받음표 칸', fr.store === 'local-fixture' && fr.central === false && fr.fixture === true && fr.opId === 'a'.repeat(64) && fr.base === BASE && ISO.test(fr.fixtureSavedAt ?? '') && !('bodyText' in fr), JSON.stringify(fr));
    const again = await run(reg('https://www.acsm.org/fixture-ok', 'EX-F-001', ['--fixture-ok']));
    check('같은 시험 등록 다시 = 같은 요청 번호', again.code === 5 && again.json?.requestKey === key, again.out);

    const plain = await run(reg('https://www.acsm.org/fixture-retry', 'EX-F-002'));
    check('--fixture-ok 없으면 4 · 대기 남김', plain.code === 4 && plain.json?.status === 'fixture-only' && pendingFiles().includes(`${plain.json?.requestKey}.json`), plain.out);
    const rr = await run(['retry', '--fixture-ok']);
    const res0 = rr.json?.results?.find((x) => x.requestKey === plain.json?.requestKey) ?? {};
    check('retry --fixture-ok 는 5 · 옮김', rr.code === 5 && rr.json?.fixtureSaved === 1 && rr.json?.pendingLeft === 0 && res0.status === 'fixture-saved' && res0.store === 'local-fixture' && res0.central === false && fixtureFiles().includes(`${plain.json?.requestKey}.json`), rr.out);
    check('retry --fixture-ok 도 중앙이라 하지 않음', !rr.out.includes(':"central"') && !/synced/i.test(rr.out + rr.err), rr.out);
    const st = await run(['status']);
    check('status: 시험 저장소 · 중앙 아님 · 옮긴 수', st.json?.store === 'local-fixture' && st.json?.central === false && st.json?.fixtureReceipts === 2 && st.json?.loopback === true, st.out);
    const pd = await run(['pending']);
    check('pending: 옮긴 것은 대기가 아님', pd.json?.count === 0 && pd.json?.fixtureReceipts === 2, pd.out);

    const clean = path.join(FIX, 'clean/records.json');
    const fa = await run(['audit', '--records', clean, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    check('audit --fixture-ok 는 5 fixture-audited(등록 0)', fa.code === 5 && fa.json?.status === 'fixture-audited' && fa.json?.registered === 0 && fa.json?.central === false, fa.out);
    const fa2 = await run(['audit', '--records', clean, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('audit 시험 저장소 · 옵션 없으면 4', fa2.code === 4 && fa2.json?.status === 'fixture-only', fa2.out);

    /* 내 컴퓨터 주소라도 중앙 저장소면 보내지 않음 */
    S.listStore = 'central';
    const postsBefore = S.posts.length;
    const pendingBefore = pendingFiles().length;
    const guard = await run(reg('https://www.acsm.org/fixture-guard', 'EX-F-003', ['--fixture-ok']));
    check('중앙 저장소 서버에 --fixture-ok 는 64 · 아무것도 안 보냄', guard.code === 64 && S.posts.length === postsBefore && pendingFiles().length === pendingBefore, guard.out);
    S.listStore = 'local-fixture';
    const otherBase = await run(reg('https://www.acsm.org/fixture-base', 'EX-F-004', ['--fixture-ok', '--base', 'https://evidence.example.org']));
    check('--fixture-ok 와 바깥 --base 는 64', otherBase.code === 64 && S.posts.length === postsBefore, otherBase.out);

    /* 바깥 주소로 로그인한 상태면 --fixture-ok 는 64 */
    fs.writeFileSync(sessionFile, JSON.stringify({ base: 'https://evidence.example.org', session: SECRET2, savedAt: new Date().toISOString() }), { mode: 0o600 });
    const remote1 = await run(reg('https://www.acsm.org/fixture-remote', 'EX-F-005', ['--fixture-ok']));
    const remote2 = await run(['retry', '--fixture-ok']);
    const remote3 = await run(['audit', '--records', clean, '--domain', 'exercise', '--reviewer', 'yunho', '--fixture-ok']);
    const remote4 = await run(['withdraw', '--use', MISSING_USE, '--reason', '시험이에요', '--fixture-ok']);
    check('바깥 주소 로그인에 --fixture-ok 는 64(register · retry · audit · withdraw)', [remote1, remote2, remote3, remote4].every((x) => x.code === 64) && S.posts.length === postsBefore && pendingFiles().length === pendingBefore, [remote1, remote2, remote3, remote4].map((x) => x.code).join(','));
    fs.writeFileSync(sessionFile, savedSession, { mode: 0o600 });
    S.mode = 'ok';
    S.listStore = 'central';
  }

  /* R2-8. http://[::1]:포트 도 내 컴퓨터 주소로 받음(쓰는 법 오류 아님) */
  {
    const r = await run(['login', '--base', 'http://[::1]:9', '--session-stdin'], { stdin: `${SECRET2}\n` });
    check('[::1] 주소는 받음(연결 실패라 4, 64 아님 · 세션 그대로)', r.code === 4 && r.json?.status === 'login-failed' && JSON.parse(fs.readFileSync(path.join(STATE, 'session.json'), 'utf8')).base === BASE, r.out);
  }

  /* ───── R2 보완(자체 검토 REG-1~8 · T1~T3) ───── */

  /* R2-10. 붙여 쓴 링크(REG-2): 떼어서 보고, 링크 안의 비공개 링크는 거절 · 가림, 공개 보관 주소는 받음 */
  S.mode = 'ok';
  {
    const joined = `https://pubmed.ncbi.nlm.nih.gov/44444444/,${SECRET_URL3}`;
    const c1 = await run(['check-url', '--url', joined]);
    check('붙여 쓴 비공개 링크 check-url 은 3 · private_file_host · 지문만', c1.code === 3 && c1.json?.results?.[0]?.reason === 'private_file_host' && !hasMark(c1.out + c1.err), c1.out);
    const arch = await run(['check-url', '--url', 'https://web.archive.org/web/20200101000000/https://www.nsca.com/education/x']);
    check('공개 보관 주소(web.archive.org/web/<때>/https://…)는 받음', arch.code === 0 && arch.json?.results?.[0]?.ok === true, arch.out);
    for (const [name, sep] of [['쉼표', ','], ['쌍반점', ';'], ['괄호', '(']]) {
      const prose = writeFix(`joined-${name}/records.json`, [{ review_id: 'EX-J-001', notes: `자료 https://pubmed.ncbi.nlm.nih.gov/44444444/${sep}${SECRET_URL3}${sep === '(' ? ')' : ''} 참고` }]);
      const a = await run(['audit', '--records', prose, '--domain', 'exercise', '--reviewer', 'yunho']);
      const urls = (a.json?.missing ?? []).map((m) => m.url);
      check(
        `문장 속 붙여 쓴 링크(${name}): 떼어서 공개 링크는 빠짐 · 비공개는 건너뜀(incomplete) · 값 없음`,
        a.code === 1 && a.json?.status === 'incomplete' && a.json?.cited === 1 && urls.length === 1 && urls[0] === 'https://pubmed.ncbi.nlm.nih.gov/44444444/' && a.json?.skippedCount === 1 && a.json?.skipped?.[0]?.code === 'private_file_host' && a.json?.skipped?.[0]?.inText === true && !hasMark(a.out + a.err),
        a.out,
      );
    }
    const whole = writeFix('joined-whole/records.json', [{ review_id: 'EX-J-002', sources: [joined] }]);
    const w = await run(['audit', '--records', whole, '--domain', 'exercise', '--reviewer', 'yunho']);
    check(
      '칸 전체가 붙여 쓴 링크여도 같은 규칙(공개 빠짐 1 · 비공개 건너뜀 1 · 값 없음)',
      w.code === 1 && w.json?.status === 'incomplete' && w.json?.missing?.length === 1 && w.json?.missing?.[0]?.url === 'https://pubmed.ncbi.nlm.nih.gov/44444444/' && w.json?.skipped?.[0]?.field === 'sources[0]' && !hasMark(w.out + w.err),
      w.out,
    );
    /* 공개 링크 둘을 붙여 쓴 것은 따로 둘 — 둘 다 등록하면 complete */
    const p55 = 'https://pubmed.ncbi.nlm.nih.gov/55555555/';
    const p66 = 'https://pubmed.ncbi.nlm.nih.gov/66666666/';
    const r55 = await run(reg(p55, 'EX-J-003'));
    const r66 = await run(reg(p66, 'EX-J-003'));
    check('붙여 쓴 공개 링크 둘을 따로 등록', r55.code === 0 && r66.code === 0, r55.out + r66.out);
    const both = writeFix('joined-public/records.json', [{ review_id: 'EX-J-003', notes: `자료 ${p55},${p66}` }, { review_id: 'EX-J-003', sources: [`${p55};${p66}`] }]);
    const b = await run(['audit', '--records', both, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('붙여 쓴 공개 링크 둘 → 인용 2 · 둘 다 등록돼 complete 0', b.code === 0 && b.json?.status === 'complete' && b.json?.cited === 2 && b.json?.registered === 2, b.out);
    /* 재검토(R2 뒤): , ; ( ) 밖의 글자(| \\ ^ { ` 、 。 ）)로 붙여 쓴 둘째 링크도 버리지 않는다 — 앞 링크만 등록돼 있으면 빠짐 1 */
    const p77 = 'https://pubmed.ncbi.nlm.nih.gov/77777701/';
    for (const [name, sep] of [['세로줄', '|'], ['역빗금', '\\'], ['꺾쇠', '^'], ['중괄호', '{'], ['역따옴표', '`'], ['모점', '、'], ['고리점', '。'], ['전각괄호', '）']]) {
      const f = writeFix(`joined-sep-${name}/records.json`, [{ review_id: 'EX-J-003', notes: `확인 ${p55}${sep}${p77} 끝` }]);
      const a = await run(['audit', '--records', f, '--domain', 'exercise', '--reviewer', 'yunho']);
      check(
        `붙여 쓴 둘째 링크(${name}) → 인용 2 · 등록 안 된 둘째가 빠짐(1) · complete 아님`,
        a.code === 1 && a.json?.status === 'missing' && a.json?.cited === 2 && (a.json?.missing ?? []).length === 1 && a.json?.missing?.[0]?.url === p77,
        a.out,
      );
      const fp = writeFix(`joined-sep-private-${name}/records.json`, [{ review_id: 'EX-J-003', notes: `확인 ${p55}${sep}${SECRET_URL3} 끝` }]);
      const ap = await run(['audit', '--records', fp, '--domain', 'exercise', '--reviewer', 'yunho']);
      check(
        `붙여 쓴 둘째 비공개 링크(${name}) → 건너뜀 · incomplete · 값 없음`,
        ap.code === 1 && ap.json?.status === 'incomplete' && ap.json?.skippedCount === 1 && ap.json?.skipped?.[0]?.code === 'private_file_host' && !hasMark(ap.out + ap.err),
        ap.out,
      );
    }
    /* | 뒤에 https:// 없이 적은 학술 링크도 따로 센다 */
    const fs1 = writeFix('joined-sep-schemeless/records.json', [{ review_id: 'EX-J-003', notes: `확인 ${p55}|pubmed.ncbi.nlm.nih.gov/77777701/ 끝` }]);
    const as1 = await run(['audit', '--records', fs1, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('| 뒤의 https:// 없는 학술 링크도 인용 · 빠짐 1', as1.code === 1 && as1.json?.cited === 2 && as1.json?.missing?.[0]?.url === p77, as1.out);
    const postsBefore = S.posts.length;
    const pendingBefore = pendingFiles().length;
    const ru = await run(reg(joined, 'EX-J-004'));
    check('register --url 붙여 쓴 비공개 링크 → 3 · 보내지 않음', ru.code === 3 && ru.json?.issues?.some((i) => i.field === 'source.url'), ru.out);
    const rt = await run(reg('https://www.acsm.org/joined-title', 'EX-J-004', ['--title', `제목 ${joined}`]));
    const ri = await run(reg('https://www.acsm.org/joined-item', 'EX-J-004', ['--item-name', `운동 ${joined}`]));
    const rp = await run(reg('https://www.acsm.org/joined-purpose', 'EX-J-004', ['--purpose-note', `메모 ${joined}`]));
    check(
      '글 칸(--title · --item-name · --purpose-note)의 붙여 쓴 비공개 링크 → 3 · 그 칸 자리만',
      rt.code === 3 && rt.json?.issues?.some((i) => i.field === 'source.title') && ri.code === 3 && ri.json?.issues?.some((i) => i.field === 'use.itemName') && rp.code === 3 && rp.json?.issues?.some((i) => i.field === 'use.purposeNote'),
      [rt.out, ri.out, rp.out].join(' | '),
    );
    check('붙여 쓴 비공개 링크는 서버 · 대기열에 안 감 · 출력에 없음', S.posts.length === postsBefore && pendingFiles().length === pendingBefore && ![ru, rt, ri, rp].some((x) => hasMark(x.out + x.err)));
    check('상태 폴더에 붙여 쓴 비공개 링크 없음', !hasMark(stateText()));
  }

  /* R2-11. --json 의 모르는 칸(REG-3): 보내기 전에 막음 · 키 이름은 지문만 · 서버가 되돌린 칸 이름도 가림 */
  S.mode = 'ok';
  {
    const postsBefore = S.posts.length;
    const pendingBefore = pendingFiles().length;
    const rejectedBefore = rejectedFiles().length;
    const base = { url: 'https://pubmed.ncbi.nlm.nih.gov/77777777/' };
    const use = { domain: 'exercise', reviewId: 'EX-K-001', purpose: 'cue', applicationKo: '큐 문장에 썼어요.' };
    const keyUrl = writeFix('json-key-url.json', { source: base, use: { ...use, [SECRET_URL1]: 'x' } });
    const k1 = await run(['register', '--json', keyUrl]);
    check(
      '키 이름이 비밀 링크인 모르는 칸 → 3 · 대기열 · 서버에 안 감 · 자리는 지문',
      k1.code === 3 && k1.json?.status === 'invalid' && (k1.json?.issues ?? []).some((i) => /^use\.\[키:[0-9a-f]{8}\]$/.test(i.field)) && S.posts.length === postsBefore && pendingFiles().length === pendingBefore,
      k1.out,
    );
    check('키 이름 비밀 링크가 출력 · 상태 폴더에 없음', !hasMark(k1.out + k1.err) && !hasMark(stateText()));
    const plainKey = writeFix('json-key-plain.json', { source: { ...base, identifiers: { pmid: '77777777', isbn: 'x' } }, use: { ...use, foo: 'bar' } });
    const k2 = await run(['register', '--json', plainKey]);
    const fields = (k2.json?.issues ?? []).map((i) => i.field).sort();
    check('이름 모양의 모르는 칸(use.foo · source.identifiers.isbn)도 3 · 보내지 않음', k2.code === 3 && fields.includes('use.foo') && fields.includes('source.identifiers.isbn') && S.posts.length === postsBefore, k2.out);
    /* 서버가 칸 이름 · 글에 받은 글자를 그대로 되돌려도(옛 서버 · 다른 판) 출력 · rejected 에 그대로 쓰지 않는다 */
    S.mode = '400';
    S.echoIssues = [
      { field: `use.${SECRET_URL1}`, message: '모르는 칸이에요.' },
      { field: 'use.applicationKo', message: `링크 ${SECRET_URL2} 가 있어요.` },
    ];
    const e = await run(reg('https://www.acsm.org/echo-test', 'EX-K-002'));
    const iss = e.json?.issues ?? [];
    check(
      '서버가 되돌린 칸 이름은 이름 조각까지만 · 그 뒤는 지문, 링크 든 글은 정해진 글로',
      e.code === 3 && e.json?.status === 'rejected' && /^use\.\[키:[0-9a-f]{8}\]$/.test(iss[0]?.field ?? '') && iss[1]?.field === 'use.applicationKo' && !/:\/\//.test(iss[1]?.message ?? ''),
      e.out,
    );
    const pd = await run(['pending']);
    check('되돌린 글자가 출력 · rejected · pending 에 없음', !hasMark(e.out + e.err) && !hasMark(pd.out + pd.err) && !hasMark(stateText()) && rejectedFiles().length === rejectedBefore + 1);
    const pdIss = (pd.json?.rejected ?? []).flatMap((x) => x.issues ?? []).map((i) => i.field);
    check('pending 의 칸 이름이 register 때와 같다(지문을 다시 지문으로 바꾸지 않음)', pdIss.includes(iss[0]?.field) && pdIss.includes('use.applicationKo'), JSON.stringify(pdIss));
    S.echoIssues = null;
    S.mode = 'ok';
  }

  /* R2-12. records 밖의 링크 · https:// 없는 학술 링크 · 한글 사이트 이름(REG-5) — complete 0 이라 하지 않음 */
  S.mode = 'ok';
  {
    const obj = writeFix('outside/records.json', {
      records: [{ review_id: 'EX-P-010', sources: ['https://www.cdc.gov/privacy-ok'] }],
      sources: ['https://pubmed.ncbi.nlm.nih.gov/11112222/'],
      session_notes: '참고 pubmed.ncbi.nlm.nih.gov/11112223 확인',
      catalog_url: 'https://www.dugout-not-cited.org/catalog',
      checkpoint: { current: 10 },
    });
    const o = await run(['audit', '--records', obj, '--domain', 'exercise', '--reviewer', 'yunho']);
    const ig = o.json?.ignored ?? [];
    check(
      'records 밖 칸의 링크 → incomplete 1 · outside_records(칸 이름 · 수만) · catalog_url 은 뺌',
      o.code === 1 && o.json?.status === 'incomplete' && o.json?.registered === 1 && o.json?.missingCount === 0 && o.json?.skippedCount === 0 && ig.length === 2 && ig.every((x) => x.code === 'outside_records' && x.recordIndex === null && x.citedStrings === 1) && JSON.stringify(ig.map((x) => x.field).sort()) === JSON.stringify(['session_notes', 'sources']) && o.json?.records?.outsideRecords === 2 && !/모두/.test(o.err) && !o.out.includes('11112222'),
      o.out,
    );
    const sl = writeFix('schemeless/records.json', [
      {
        review_id: 'EX-SL-001',
        notes: '자료 pubmed.ncbi.nlm.nih.gov/12345679 확인, 그리고 https://pubmed.ncbi.nlm.nih.gov/12345680/ 도',
        sources: ['doi.org/10.1519/JSC.0000000000001234'],
        more: 'pmc.ncbi.nlm.nih.gov/articles/PMC1234567/ · www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/ · europepmc.org/article/MED/123 · dx.doi.org/10.1000/xyz.',
      },
    ]);
    const s1 = await run(['audit', '--records', sl, '--domain', 'exercise', '--reviewer', 'yunho']);
    const sm = s1.json?.missing ?? [];
    const schemelessUrls = sm.filter((m) => m.schemeless === true).map((m) => m.url).sort();
    check(
      'https:// 없이 적은 학술 링크도 인용(https:// 붙임 · schemeless true) · https 링크는 따로 한 번',
      s1.code === 1 && s1.json?.status === 'missing' && s1.json?.cited === 7 && s1.json?.schemelessCited === 6 &&
        JSON.stringify(schemelessUrls) ===
          JSON.stringify(
            [
              'https://doi.org/10.1519/JSC.0000000000001234',
              'https://dx.doi.org/10.1000/xyz',
              'https://europepmc.org/article/MED/123',
              'https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/',
              'https://pubmed.ncbi.nlm.nih.gov/12345679',
              'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/',
            ].sort(),
          ) &&
        sm.find((m) => m.url === 'https://pubmed.ncbi.nlm.nih.gov/12345680/')?.schemeless === undefined,
      JSON.stringify(sm.map((m) => [m.url, m.schemeless])),
    );
    const reg9 = await run(reg('https://pubmed.ncbi.nlm.nih.gov/12345679/', 'EX-SL-002'));
    const only = writeFix('schemeless-only/records.json', [{ review_id: 'EX-SL-002', notes: '자료 pubmed.ncbi.nlm.nih.gov/12345679 확인' }]);
    const s2 = await run(['audit', '--records', only, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('https:// 없이 적은 학술 링크도 등록하면 complete 0', reg9.code === 0 && s2.code === 0 && s2.json?.status === 'complete' && s2.json?.registered === 1, s2.out);
    const idn = writeFix('idn/records.json', [{ review_id: 'EX-IDN-001', notes: '안내 https://대한체육.kr/guide 참고' }]);
    const i1 = await run(['audit', '--records', idn, '--domain', 'exercise', '--reviewer', 'yunho']);
    const isk = i1.json?.skipped?.[0] ?? {};
    check(
      '문장 속 한글 사이트 이름 링크 → complete 0 이 아님(모호 · 지문만)',
      i1.code === 1 && i1.json?.status === 'incomplete' && i1.json?.cited === 0 && isk.code === 'ambiguous_in_text' && isk.inText === true && isk.fingerprint === sha('https://대한체육.kr/guide').slice(0, 12) && !('url' in isk) && i1.json?.ambiguousCount === 1,
      i1.out,
    );
  }

  /* R2-13. 한글이 이어지는 링크(REG-6): 잘린 링크를 '빠짐'으로 내지 않고 모호(ambiguous_in_text)로 — 칸 전체 · 문장 속 같은 규칙 */
  S.mode = 'ok';
  {
    const encoded = 'https://namu.wiki/w/%ED%9A%8C%EC%A0%84%EA%B7%BC%EA%B0%9C';
    const rk = await run(reg(encoded, 'EX-KO-001'));
    check('퍼센트 인코딩한 한글 경로 등록 0', rk.code === 0, rk.out);
    const cases = [
      ['문장 속 한글 경로', [{ review_id: 'EX-KO-001', notes: '자료: https://namu.wiki/w/회전근개 참고' }], 'https://namu.wiki/w/회전근개'],
      ['칸 전체 한글 경로', [{ review_id: 'EX-KO-001', sources: ['https://namu.wiki/w/회전근개'] }], 'https://namu.wiki/w/회전근개'],
      ['칸 전체 붙은 조사', [{ review_id: 'EX-KO-001', sources: ['https://pubmed.ncbi.nlm.nih.gov/12345678/에서'] }], 'https://pubmed.ncbi.nlm.nih.gov/12345678/에서'],
      ['문장 속 붙은 조사', [{ review_id: 'EX-KO-001', notes: '자료 https://pubmed.ncbi.nlm.nih.gov/12345678/에서 봤어요' }], 'https://pubmed.ncbi.nlm.nih.gov/12345678/에서'],
      ['한글 쿼리', [{ review_id: 'EX-KO-001', notes: '검색 https://pubmed.ncbi.nlm.nih.gov/?term=회전근개 결과' }], 'https://pubmed.ncbi.nlm.nih.gov/?term=회전근개'],
      ['사이트 이름 뒤 조사', [{ review_id: 'EX-KO-001', notes: '자료는 https://www.acsm.org에 있어요' }], 'https://www.acsm.org에'],
    ];
    for (const [name, recs, raw] of cases) {
      const a = await run(['audit', '--records', writeFix(`ko-${name.replace(/\s/g, '-')}/records.json`, recs), '--domain', 'exercise', '--reviewer', 'yunho']);
      const sk = a.json?.skipped?.[0] ?? {};
      check(
        `${name}: 잘린 링크를 빠짐으로 내지 않고 모호(incomplete) · 지문 · 고치는 법`,
        a.code === 1 && a.json?.status === 'incomplete' && a.json?.missingCount === 0 && sk.code === 'ambiguous_in_text' && sk.fingerprint === sha(raw).slice(0, 12) && /퍼센트 인코딩/.test(sk.message ?? '') && !('url' in sk),
        a.out,
      );
    }
    const enc = await run(['audit', '--records', writeFix('ko-encoded/records.json', [{ review_id: 'EX-KO-001', notes: `자료: ${encoded} 참고` }]), '--domain', 'exercise', '--reviewer', 'yunho']);
    check('퍼센트 인코딩한 링크는 등록과 맞아 complete 0', enc.code === 0 && enc.json?.status === 'complete' && enc.json?.registered === 1, enc.out);
    const closers = writeFix('ko-closers/records.json', [{ review_id: 'EX-P-010', notes: '확인한 자료 https://www.cdc.gov/privacy-ok。 그리고 (https://www.cdc.gov/privacy-ok)를 적용, https://www.cdc.gov/privacy-ok.에서' }]);
    const cl = await run(['audit', '--records', closers, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('문장 부호(。 · 닫는 괄호 · 마침표) 뒤의 한글은 링크 끝으로 — complete 0', cl.code === 0 && cl.json?.status === 'complete' && cl.json?.cited === 1 && cl.json?.skippedCount === 0, cl.out);
  }

  /* R2-14. 로그인 전에 넣은 대기(주소 없음)를 로그인 뒤 같은 register 로(REG-7) — base-mismatch 가 아님 */
  S.mode = 'ok';
  {
    const sessionFile = path.join(STATE, 'session.json');
    const saved = fs.readFileSync(sessionFile, 'utf8');
    const U = 'https://www.acsm.org/no-base-yet';
    fs.rmSync(sessionFile);
    const r1 = await run(reg(U, 'EX-B-001'));
    const key = r1.json?.requestKey;
    check('로그인 없이 · --base 없이 → 4 no-session · 대기 주소 없음', r1.code === 4 && r1.json?.error === 'no-session' && readQ('pending', key).base === null, r1.out);
    fs.writeFileSync(sessionFile, saved, { mode: 0o600 });
    const r2 = await run(reg(U, 'EX-B-001'));
    check('로그인 뒤 같은 register → 0 registered · 같은 요청 번호 · 한 번 보냄', r2.code === 0 && r2.json?.status === 'registered' && r2.json?.requestKey === key && postsFor(key).length === 1 && !pendingFiles().includes(`${key}.json`), r2.out);
    /* 주소 없는 대기 + 다른 --base 를 일부러 준 것은 그 주소의 대기(예전처럼 base-mismatch) */
    fs.rmSync(sessionFile);
    const r3 = await run(reg('https://www.acsm.org/no-base-other', 'EX-B-002'));
    fs.writeFileSync(sessionFile, saved, { mode: 0o600 });
    const r4 = await run(reg('https://www.acsm.org/no-base-other', 'EX-B-002', ['--base', OTHER_BASE]));
    check('주소 없는 대기에 다른 --base → 4 base-mismatch · 그 주소로 · 안 보냄', r4.code === 4 && r4.json?.error === 'base-mismatch' && r4.json?.requestKey === r3.json?.requestKey && readQ('pending', r3.json?.requestKey).base === OTHER_BASE && postsFor(r3.json?.requestKey).length === 0, r4.out);
    await run(['discard', r3.json?.requestKey, '--reason', '시험이라 버려요']);
  }

  /* R2-15. 깨진 session.json(REG-8): 해석기 글(세션 값 일부)을 내지 않고 4 session-unreadable · 아무것도 안 보냄 */
  {
    const sessionFile = path.join(STATE, 'session.json');
    const saved = fs.readFileSync(sessionFile, 'utf8');
    const BROKEN = 'CorruptSessionValue.zzz-111_secretABCDEFGHIJ';
    /* 값의 8자 조각 어느 것도 출력에 없어야 한다(해석기 오류 글은 10자 남짓을 보였다) */
    const pieces = (v) => Array.from({ length: v.length - 7 }, (_, i) => v.slice(i, i + 8));
    const leaked = (t) => pieces(BROKEN).some((p) => t.includes(p));
    const postsBefore = S.posts.length;
    const pendingBefore = pendingFiles().length;
    for (const [name, text] of [
      ['따옴표 없음', `{\n  "base": "${BASE}",\n  "session": ${BROKEN},\n  "savedAt": "2026-11-20T00:00:00.000Z"\n}\n`],
      ['작은따옴표', `{\n  "base": "${BASE}",\n  "session": '${BROKEN}',\n  "savedAt": "2026-11-20T00:00:00.000Z"\n}\n`],
    ]) {
      fs.writeFileSync(sessionFile, text, { mode: 0o600 });
      const st = await run(['status']);
      check(`깨진 세션(${name}) status → 4 session-unreadable · 값 조각 없음`, st.code === 4 && st.json?.status === 'session-unreadable' && /logout/.test(st.json?.message ?? '') && !leaked(st.out + st.err), st.out + st.err);
      const rg = await run(reg('https://www.acsm.org/broken-session', 'EX-BS-001'));
      check(`깨진 세션(${name}) register → 4 session-unreadable · 대기 · 서버 0 · 값 조각 없음`, rg.code === 4 && rg.json?.status === 'session-unreadable' && pendingFiles().length === pendingBefore && S.posts.length === postsBefore && !leaked(rg.out + rg.err), rg.out + rg.err);
    }
    fs.writeFileSync(sessionFile, saved, { mode: 0o600 });
  }

  /* R2-16. 같은 컴퓨터: 거둔 뒤 같은 내용 다시 register → 새 쓴 시각(되살림) · 되살린 뒤 같은 까닭 다시 withdraw → 새 쓴 시각(REG-1) */
  S.mode = 'ok';
  S.mergeUses = true;
  {
    const findUse = (useId) => S.sources.flatMap((s) => s.uses).find((u) => u.useId === useId);
    const U = 'https://www.acsm.org/revive-test';
    const r1 = await run(reg(U, 'EX-R-001'));
    const useId = r1.json?.useId;
    const w1 = await run(['withdraw', '--use', useId, '--reason', '실수로 거둬요']);
    check('거두기 0 · 그 쓰임이 거둔 상태', r1.code === 0 && w1.code === 0 && w1.json?.status === 'withdrawn' && !!findUse(useId)?.withdrawn, w1.out);
    const r2 = await run(reg(U, 'EX-R-001'));
    const sentNoted = JSON.parse(S.posts.at(-1).body).use?.notedAt;
    check(
      '거둔 뒤 같은 내용 register → registered(already 아님) · 새 요청 번호 · 쓴 시각이 거두기보다 늦음 · 쓰임이 살아남',
      r2.code === 0 && r2.json?.status === 'registered' && r2.json?.requestKey !== r1.json?.requestKey && r2.json?.useId === useId && sentNoted > w1.json?.notedAt && findUse(useId)?.withdrawn === false,
      r2.out,
    );
    const U2 = 'https://www.acsm.org/rewithdraw-test';
    const a1 = await run(reg(U2, 'EX-R-002', [], '첫 적용 글이에요.'));
    const u2 = a1.json?.useId;
    const x1 = await run(['withdraw', '--use', u2, '--reason', '거둬요']);
    const a2 = await run(reg(U2, 'EX-R-002', [], '고친 적용 글이에요.'));
    check('거둔 뒤 고친 글 register 로 살아남', a2.code === 0 && a2.json?.useId === u2 && findUse(u2)?.withdrawn === false, a2.out);
    const x2 = await run(['withdraw', '--use', u2, '--reason', '거둬요']);
    check(
      '되살린 뒤 같은 까닭 withdraw → withdrawn(밀린 옛 요청을 다시 보내지 않음) · 새 요청 번호 · 쓰임이 거둔 상태',
      x1.code === 0 && x2.code === 0 && x2.json?.status === 'withdrawn' && x2.json?.requestKey !== x1.json?.requestKey && x2.json?.notedAt > a2.json?.notedAt && !!findUse(u2)?.withdrawn && pendingFiles().every((f) => !f.startsWith(x1.json?.requestKey)),
      x2.out,
    );
    /* 같은 거두기를 바로 다시 → 예전처럼 같은 요청(already-withdrawn) */
    const x3 = await run(['withdraw', '--use', u2, '--reason', '거둬요']);
    check('같은 거두기 바로 다시 = 같은 요청 번호 · already-withdrawn', x3.code === 0 && x3.json?.status === 'already-withdrawn' && x3.json?.requestKey === x2.json?.requestKey, x3.out);
  }
  S.mergeUses = false;

  /* R2-17. 서버 받음표의 useState · applied · supersededBy(REG-1, 다른 맥에서 일어난 것) */
  S.mode = 'ok';
  {
    const WITHDRAWN = { useState: 'withdrawn', applied: true, supersededBy: 'withdraw' };
    const ACTIVE = { useState: 'active', applied: true, supersededBy: null };
    /* a. register: 서버가 '그 쓰임은 거둔 상태'(다른 맥의 더 늦은 거두기) → 새 쓴 시각으로 한 번 다시 → 살아남(0) */
    S.receiptOverrides = [WITHDRAWN, ACTIVE];
    const a = await run(reg('https://www.acsm.org/stale-register-1', 'EX-M-001'));
    const first = a.json?.refreshedFrom;
    check(
      'register 가 거둔 쓰임을 만나면 새 쓴 시각으로 한 번 다시 보내 registered 0 · refreshed',
      a.code === 0 && a.json?.status === 'registered' && a.json?.refreshed === true && typeof first === 'string' && first !== a.json?.requestKey && a.json?.useState === 'active' && postsFor(first).length === 1 && postsFor(a.json?.requestKey).length === 1,
      a.out,
    );
    check('처음 요청은 rejected(superseded) · 새 요청을 가리킴', readQ('rejected', first).reason === 'superseded' && readQ('rejected', first).supersededBy === a.json?.requestKey && JSON.parse(postsFor(a.json?.requestKey)[0].body).use.notedAt > JSON.parse(postsFor(first)[0].body).use.notedAt);
    check('받음표 줄에 useState · applied · supersededBy', receiptLines().at(-1).requestKey === a.json?.requestKey && receiptLines().at(-1).useState === 'active' && receiptLines().at(-1).applied === true && receiptLines().at(-1).supersededBy === null);
    /* b. 새 시각으로 보내도 거둔 상태(다른 맥 시계가 앞섬 등) → 2 superseded */
    S.receiptOverrides = [WITHDRAWN, WITHDRAWN];
    const linesBefore = receiptLines().length;
    const b = await run(reg('https://www.acsm.org/stale-register-2', 'EX-M-002'));
    const rb = readQ('rejected', b.json?.requestKey);
    check(
      '한 번 다시 보내도 더 새 상태면 2 superseded · rejected(superseded-central, 받음표 번호) · 받음표 줄 없음',
      b.code === 2 && b.json?.status === 'superseded' && b.json?.ok === false && b.json?.refreshed === true && rb.reason === 'superseded-central' && rb.opId === 'a'.repeat(64) && /^use_/.test(rb.useId ?? '') && rb.serverSupersededBy === 'withdraw' && rb.useState === 'withdrawn' && receiptLines().length === linesBefore && pendingFiles().every((f) => !f.startsWith(b.json?.requestKey)) && /밀림/.test(b.err),
      b.out + b.err,
    );
    /* c. retry 는 다시 보내지 않고 끝냄(superseded-central), 밀림만이면 0 */
    S.mode = '503';
    const c0 = await run(reg('https://www.acsm.org/stale-register-3', 'EX-M-003'));
    S.mode = 'ok';
    S.receiptOverrides = [WITHDRAWN];
    const c = await run(['retry']);
    const ck = c0.json?.requestKey;
    check(
      'retry: 거둔 쓰임의 등록은 밀림으로 끝(0 · superseded 1 · 대기 0 · 새 요청 없음)',
      c.code === 0 && c.json?.superseded === 1 && c.json?.pendingLeft === 0 && c.json?.results?.[0]?.status === 'superseded' && c.json?.results?.[0]?.useState === 'withdrawn' && readQ('rejected', ck).reason === 'superseded-central' && postsFor(ck).length === 2 && S.receiptOverrides.length === 0,
      c.out,
    );
    const pd = await run(['pending']);
    const row = (pd.json?.rejected ?? []).find((x) => x.requestKey === ck) ?? {};
    check('pending 의 rejected 줄에 밀림 까닭 · 받음표 번호', row.reason === 'superseded-central' && row.serverSupersededBy === 'withdraw' && row.opId === 'a'.repeat(64), JSON.stringify(row));
    /* d. withdraw: 다른 거두기가 이미 효력(supersededBy 'withdraw') → already-withdrawn 0 · 받음표 줄 applied false · 다시 보내지 않음 */
    const target = a.json?.useId;
    S.receiptOverrides = [{ applied: false, visible: false, placements: [], useState: 'withdrawn', supersededBy: 'withdraw' }];
    const d = await run(['withdraw', '--use', target, '--reason', '다른 맥과 같이 거둬요']);
    check(
      'withdraw: 이미 다른 거두기로 거둔 쓰임 → already-withdrawn 0 · applied false · 한 번만 보냄 · 받음표 줄',
      d.code === 0 && d.json?.status === 'already-withdrawn' && d.json?.applied === false && d.json?.useId === target && d.json?.refreshed === false && postsFor(d.json?.requestKey).length === 1 && receiptLines().at(-1).requestKey === d.json?.requestKey && receiptLines().at(-1).applied === false && receiptLines().at(-1).withdrawUseId === target,
      d.out,
    );
    /* e. withdraw: 그 뒤 등록으로 살아 있음(supersededBy 'register') → 새 쓴 시각으로 한 번 다시 → withdrawn 0 */
    S.receiptOverrides = [{ applied: false, visible: false, placements: [], useState: 'active', supersededBy: 'register' }, { applied: true, useState: 'withdrawn', supersededBy: null }];
    const e = await run(['withdraw', '--use', target, '--reason', '살아난 쓰임을 다시 거둬요']);
    check('withdraw 가 늦은 등록에 밀리면 새 쓴 시각으로 한 번 다시 → withdrawn 0 · refreshed', e.code === 0 && e.json?.status === 'withdrawn' && e.json?.refreshed === true && e.json?.refreshedFrom !== e.json?.requestKey && postsFor(e.json?.refreshedFrom).length === 1, e.out);
    /* f. retry: 밀린 거두기는 다시 보내지 않고 끝냄 */
    S.mode = '503';
    const f0 = await run(['withdraw', '--use', target, '--reason', '늦게 보낼 거두기예요']);
    S.mode = 'ok';
    S.receiptOverrides = [{ applied: false, visible: false, placements: [], useState: 'active', supersededBy: 'register' }];
    const f = await run(['retry']);
    check('retry: 늦은 등록에 밀린 거두기는 superseded(0 · rejected superseded-central · serverSupersededBy register)', f.code === 0 && f.json?.superseded === 1 && readQ('rejected', f0.json?.requestKey).reason === 'superseded-central' && readQ('rejected', f0.json?.requestKey).serverSupersededBy === 'register', f.out);
    /* g. 옛 서버(칸 없음): 예전 그대로 — 보이면 등록 · 보이지 않는 거두기는 대기(미확인) */
    S.receiptOverrides = [];
    const g1 = await run(reg('https://www.acsm.org/old-server', 'EX-M-004'));
    check('옛 서버 받음표(useState 등 없음) → 예전처럼 registered · 칸은 null · 다시 보내지 않음', g1.code === 0 && g1.json?.status === 'registered' && g1.json?.useState === null && g1.json?.applied === null && g1.json?.supersededBy === null && g1.json?.refreshed === false, g1.out);
    S.receiptOverrides = [{ visible: false, placements: [] }];
    const g2 = await run(['withdraw', '--use', g1.json?.useId, '--reason', '옛 서버 거두기예요']);
    check('옛 서버에서 보이지 않는 거두기 → 예전처럼 4 pending unconfirmed', g2.code === 4 && g2.json?.error === 'unconfirmed' && pendingFiles().includes(`${g2.json?.requestKey}.json`), g2.out);
    await run(['discard', g2.json?.requestKey, '--reason', '시험이라 버려요']);
    S.receiptOverrides = [];
  }

  /* R2-18. 이 컴퓨터 대기에만 있는 인용(T1): audit 은 빠짐 · pendingLocal, retry 뒤 complete */
  {
    S.mode = '503';
    const U = 'https://www.acsm.org/pending-audit';
    const p = await run(reg(U, 'EX-PA-001'));
    S.mode = 'ok';
    const recs = writeFix('pending-audit/records.json', [{ review_id: 'EX-PA-001', sources: [U] }]);
    const a = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'yunho']);
    check(
      '대기에만 있는 인용 → 1 missing · central · registered 0 · pendingLocal 1 · 다 됐다고 하지 않음',
      p.code === 4 && a.code === 1 && a.json?.status === 'missing' && a.json?.central === true && a.json?.registered === 0 && a.json?.pendingLocal === 1 && a.json?.missing?.[0]?.pendingLocal === true && a.json?.missing?.[0]?.url === U && !/모두/.test(a.err),
      a.out,
    );
    const rt = await run(['retry']);
    const a2 = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'yunho']);
    check('retry 뒤 complete 0 · pendingLocal 0', rt.code === 0 && a2.code === 0 && a2.json?.status === 'complete' && a2.json?.pendingLocal === 0 && a2.json?.registered === 1, a2.out);
  }

  /* R2-19. 알아볼 수 없는 기록만(건너뜀 0) 있어도 incomplete(T2) */
  {
    for (const [name, bad] of [
      ['review_id 없음', { sources: ['https://pubmed.ncbi.nlm.nih.gov/33333333/'] }],
      ['review_id 모양 틀림', { review_id: 'bad id', sources: ['https://pubmed.ncbi.nlm.nih.gov/33333334/'] }],
    ]) {
      const recs = writeFix(`ignored-only-${name.replace(/\s/g, '-')}/records.json`, [{ review_id: 'EX-P-010', sources: ['https://www.cdc.gov/privacy-ok'] }, bad]);
      const a = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'yunho']);
      check(
        `알아볼 수 없는 기록(${name})만 있어도 incomplete 1 · skippedCount 0 · 다 됐다고 하지 않음`,
        a.code === 1 && a.json?.status === 'incomplete' && a.json?.ok === false && a.json?.skippedCount === 0 && a.json?.ignoredRecords === 1 && a.json?.missingCount === 0 && a.json?.registered === 1 && !/모두/.test(a.err) && !a.out.includes('3333333'),
        a.out,
      );
    }
  }

  /* R2-20. 다른 검수 번호의 같은 링크는 그 검수의 쓰임이 아님(T3) */
  {
    const recs = writeFix('cross-review/records.json', [
      { review_id: 'EX-P-010', sources: ['https://www.cdc.gov/privacy-ok'] },
      { review_id: 'EX-P-011', sources: ['https://www.cdc.gov/privacy-ok'] },
    ]);
    const a = await run(['audit', '--records', recs, '--domain', 'exercise', '--reviewer', 'yunho']);
    check(
      '다른 검수(EX-P-011)에서 인용한 같은 링크는 빠짐 1(등록은 EX-P-010 것만)',
      a.code === 1 && a.json?.status === 'missing' && a.json?.registered === 1 && a.json?.missing?.length === 1 && a.json?.missing?.[0]?.reviewId === 'EX-P-011' && a.json?.missing?.[0]?.url === 'https://www.cdc.gov/privacy-ok',
      a.out,
    );
  }

  /* R2-9. 비밀 글자가 상태 폴더 · 출력 어디에도 없음 */
  check('상태 폴더 전체에 비밀 링크 글자 없음', !hasMark(stateText()));
  check('지금까지 모든 출력에 비밀 링크 글자 없음', !hasMark(allOutput.join('\n')));

  /* 25. 로그인 없으면 대기만 */
  {
    const out = await run(['logout']);
    check('logout 0', out.code === 0 && !fs.existsSync(path.join(STATE, 'session.json')));
    const postsBefore = S.posts.length;
    const r = await run(reg('https://www.acsm.org/no-session', 'EX-T-010'));
    check('로그인 없으면 4 · 대기', r.code === 4 && r.json?.error === 'no-session' && S.posts.length === postsBefore, r.out);
  }

  /* 26. 바로가기 세션 파일은 읽지 않음 */
  {
    const target = path.join(STATE, 'elsewhere.json');
    fs.writeFileSync(target, JSON.stringify({ base: BASE, session: SECRET }));
    fs.symlinkSync(target, path.join(STATE, 'session.json'));
    const r = await run(['status']);
    check('바로가기 세션 거절', r.code === 4 && r.json?.ok === false, r.out);
    fs.unlinkSync(path.join(STATE, 'session.json'));
  }

  /* 27. 비밀 값이 어디에도 안 나옴 */
  const all = allOutput.join('\n');
  check('출력 전체에 비밀 없음', !all.includes(SECRET) && !all.includes(SECRET2));
  check('출력 전체에 session= 값 없음', !/session=(?!\[가림\])[A-Za-z0-9]/.test(all));
} finally {
  server.close();
  stray.close();
  ncbi.close();
  fs.rmSync(STATE, { recursive: true, force: true });
  fs.rmSync(FIX, { recursive: true, force: true });
}

console.log(`통과 ${pass} · 실패 ${fail}`);
process.exitCode = fail ? 1 : 0;
