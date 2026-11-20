#!/usr/bin/env node
/**
 * EX-REF04 — 검수 근거자료 등록 도구(명령 줄). 설치 없이 표준 라이브러리만 쓴다(저장소의 TS 모듈을 불러오지 않는다).
 *
 *   node <이 파일의 절대 경로> login --base <주소>            기기 승인(코드 로그인)으로 세션을 받아 둔다
 *   node <이 파일의 절대 경로> login --base <주소> --session-stdin   이미 가진 세션 값을 표준 입력으로
 *   node <이 파일의 절대 경로> logout
 *   node <이 파일의 절대 경로> register --url … --domain exercise|mechanics --review … --purpose … --application '…' [--fixture-ok]
 *   node <이 파일의 절대 경로> withdraw --use use_<24자> --reason '<한국어 까닭>' [--fixture-ok]
 *   node <이 파일의 절대 경로> retry [--max 50] [--fixture-ok]
 *   node <이 파일의 절대 경로> pending
 *   node <이 파일의 절대 경로> discard <requestKey> --reason '<한국어 까닭>'
 *   node <이 파일의 절대 경로> status
 *   node <이 파일의 절대 경로> audit --records <video-records.json> --domain exercise|mechanics --reviewer yunho|kimmin [--review …] [--fixture-ok]
 *   node <이 파일의 절대 경로> import --manifest <파일> [--from-chunk i]
 *   node <이 파일의 절대 경로> check-url --url <링크> | --json <파일|->   서버와 같은 링크 규칙으로 검사만(아무 데도 보내지 않음)
 *
 * 표준 출력은 늘 JSON 한 덩어리, 사람에게 하는 말은 표준 오류(한국어).
 * 끝 번호:
 *   0  됨(중앙 저장소 등록 · 목록에서 보임 확인, 거두기는 적용 확인 · 이미 다른 거두기로 거둔 상태(already-withdrawn),
 *      audit 은 빠짐 · 건너뜀 없이 다 맞음, retry 는 밀림(superseded)만 남아도 0)
 *   1  audit: 빠진 등록이 있거나(missing) 확인을 끝내지 못함(incomplete — 등록할 수 없는 인용 · 어디까지가 링크인지 모호 ·
 *      알아볼 수 없는 기록 · records 밖의 링크)
 *   2  충돌(같은 요청 번호에 다른 내용, 409) 또는 더 새 상태에 밀림(superseded — 등록했는데 그 쓰임이 더 늦게 거둬졌음 ·
 *      거뒀는데 더 늦게 다시 등록됨. register · withdraw 는 새 쓴 시각으로 한 번 다시 보낸 뒤에도 그러면)
 *   3  값이 틀림 · 거절됨 · 지원하지 않는 검수 기록 모양
 *   4  대기(네트워크 · 로그인 · 미확인 · 시험 저장소 · 옛 서버 · 다른 주소의 대기 · 다른 retry 중 · 세션 파일이 깨짐(session-unreadable))
 *   5  내 컴퓨터 시험 저장소에만 들어감(--fixture-ok 일 때만, 중앙 등록이 아님 — fixture-saved · fixture-already-withdrawn)
 *   64 쓰는 법이 틀림
 *
 * 컴퓨터마다 따로인 것
 *  - 상태 폴더(세션 · 대기열 · 받음표)는 이 컴퓨터의 것이다: REVIEW_EVIDENCE_STATE_DIR, 없으면 이 저장소 git 공통 폴더 안
 *    review-evidence-registrar-v1, 그것도 안 되면 집 폴더 .bullpen-review-evidence-v1.
 *  - 세션 · 쿠키 · 대기열을 다른 맥으로 옮기거나 복사하지 않는다. 다른 맥은 그 맥에서 login 한다.
 *  - 다른 맥에서 이어 할 때는 공유한 검수 기록을 보고 그 맥에서 다시 register 한다(같은 쓰임은 서버가 하나로 묶는다).
 *    처음 맥에 남은 대기는 나중에 그 맥에서 retry 하거나, 필요 없으면 discard 한다.
 *
 * 지키는 것
 *  - 세션 쿠키 값은 화면 · 인자 · 기록 · 출력 어디에도 내보내지 않는다(세션 파일 0600 에만). 오류 글의 'session=' 은 가린다.
 *  - 받지 않는 링크(비밀 쿼리 · 비공개 저장소 · 내부 주소 등)는 출력 · 오류 · 받음표 · 상태 폴더 어디에도 그대로 적지 않는다.
 *    자리(검수 번호 · 몇 번째 기록 · 칸 이름)와 지문(원래 글자 sha256 앞 12자)만 알린다. 대기열에도 넣지 않는다.
 *  - 모든 요청은 redirect:'manual' — 3xx 는 실패로 보고 따라가지 않는다(쿠키를 다른 곳에 보내지 않는다). Origin 은 보내지 않는다.
 *  - 등록은 대기열에 먼저 적고 보낸다. 서버가 받고(200/201 · ok) 응답의 store 가 'central' 이고 목록에서 보인다(receipt.visible)고
 *    답할 때만 성공이다. 대기열에 적힌 것 · 내 컴퓨터 시험 저장소(local-fixture)에 들어간 것은 성공이라 하지 않는다.
 *  - 쓴 시각(notedAt)은 처음 대기열에 넣을 때 정해 본문에 넣는다 — 다시 보내도 본문 글자가 같다. 같은 쓰임의 더 새 등록이 들어오면
 *    옛 대기는 '밀림(superseded)'으로 rejected 에 옮기고 보내지 않는다. 같은 내용을 다시 넣을 때 옛 notedAt 을 다시 쓰는 것은
 *    이 컴퓨터에 그 뒤의 반대쪽 기록(거두기 ↔ 등록)이 없을 때뿐이다.
 *  - 서버 받음표의 useState · applied · supersededBy(R2 약속)로 '더 새 상태'를 가린다: register · withdraw 는 새 쓴 시각으로
 *    한 번만 다시 보내고, retry 는 다시 보내지 않고 rejected(superseded-central · superseded-fixture)로 끝낸다. 칸이 없는 옛 서버는 예전 그대로.
 *  - audit 은 검수자 한 명의 기록만 본다(--reviewer). 지금 등록 쓰임은 로그인한 계정이 등록한 것(mine)만, 과거 기록 쓰임은 그 검수자 것만
 *    등록으로 센다. 로그인한 계정이 그 검수자 본인인지는 이 도구가 알 수 없다(출력의 viewerLabel 을 사람이 확인한다).
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT = { ok: 0, missing: 1, conflict: 2, invalid: 3, pending: 4, fixture: 5, usage: 64 };

const DOMAINS = ['exercise', 'mechanics'];
/** model.ts HISTORICAL_REVIEWERS 와 같은 이름 — audit 의 --reviewer */
const REVIEWERS = ['yunho', 'kimmin'];
const PURPOSES = ['description', 'cue', 'prescription', 'safety', 'progression', 'mechanism', 'evidence-check', 'video-check', 'user-request', 'other'];
const READING = ['unknown', 'metadata-only', 'abstract', 'partial', 'full-text'];
const SOURCE_KINDS = ['original-research', 'systematic-review', 'narrative-review', 'professional-guidance', 'coaching-material', 'regulation', 'textbook', 'thesis', 'other'];
const SUMMARY_BASIS = ['title-metadata', 'abstract', 'partial', 'full-text', 'review-notes'];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,63}$/;
const USE_ID = /^use_[0-9a-f]{24}$/;
const HANGUL = /[가-힣]/;
const SESSION_VALUE = /^[A-Za-z0-9._~+/=-]{8,8192}$/;
const CENTRAL = 'central';

const API_PATH = '/api/admin/review-evidence';
const IMPORT_PATH = '/api/admin/review-evidence/import';
const REQUEST_TIMEOUT_MS = 20_000;
const NCBI_TIMEOUT_MS = 10_000;
const MAX_REGISTER_BYTES = 32 * 1024;
const MAX_IMPORT_BYTES = 768 * 1024;
const LOCK_STALE_MS = 60_000;
/** retry 자물쇠 — 주인 프로세스가 살아 있고 이만큼 안에 움직였으면 '쓰는 중' */
const RETRY_LOCK_STALE_MS = 10 * 60_000;
const NCBI_TOOL = 'bullpen-review-evidence';

/* ───────── 가리기 · 출력 ───────── */

const SECRETS = new Set();
function redact(text) {
  let s = String(text);
  for (const v of SECRETS) if (v) s = s.split(v).join('[가림]');
  /* 쿠키 모양(session=…)과 세션 파일 모양("session": …) 둘 다 가린다 — 깨진 세션 파일의 글이 어디선가 나가려 해도 */
  return s.replace(/session=[^;\s"',]+/gi, 'session=[가림]').replace(/("session"\s*:\s*)("[^"]*"?|'[^']*'?|[^,}\s]+)/gi, '$1"[가림]"');
}
const say = (msg) => process.stderr.write(redact(msg) + '\n');

class Done {
  constructor(code, body) {
    this.code = code;
    this.body = body;
  }
}
const finish = (code, body) => {
  throw new Done(code, body);
};
const usage = (message) => finish(EXIT.usage, { ok: false, status: 'usage', message });

/* ───────── 인자 ───────── */

const VALUE_FLAGS = new Set([
  'base', 'url', 'domain', 'review', 'item', 'item-name', 'purpose', 'purpose-note', 'consulted', 'application', 'limits',
  'reading', 'reading-note', 'kind', 'title', 'summary', 'summary-basis', 'json', 'max', 'records', 'manifest', 'from-chunk',
  'use', 'reason', 'reviewer',
]);
const BOOL_FLAGS = new Set(['lookup-ncbi', 'session-stdin', 'fixture-ok']);

/** 쓰는 법 오류 글에 옵션 이름을 보일 때 — 이름 모양이 아니면(링크 · 값이 섞였을 수 있음) 그대로 보이지 않는다 */
const FLAG_NAME = /^[a-z][a-z-]{0,30}$/;
const shownFlag = (name) => (FLAG_NAME.test(name) ? `--${name}` : '(옵션 이름 모양이 아님)');

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    /* 인자 글자는 되풀이하지 않는다 — 옵션 없이 넣은 링크(비밀 값이 든 것일 수 있음)가 출력에 남지 않게 */
    if (!a.startsWith('--')) usage(`옵션(--이름) 없이 넣은 값이 있어요(${i + 1}번째 인자). 링크는 --url 로 넣어 주세요.`);
    const eq = a.indexOf('=');
    const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (BOOL_FLAGS.has(name)) {
      if (eq > 0) usage(`--${name} 은 값을 받지 않아요.`);
      flags[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      let v;
      if (eq > 0) v = a.slice(eq + 1);
      else {
        v = argv[++i];
        if (v === undefined) usage(`--${name} 에 값이 필요해요.`);
      }
      flags[name] = v;
    } else usage(`알 수 없는 옵션이에요: ${shownFlag(name)}`);
  }
  return flags;
}

function allowOnly(flags, allowed) {
  for (const k of Object.keys(flags)) if (!allowed.includes(k)) usage(`이 명령에서 쓰지 않는 옵션이에요: ${shownFlag(k)}`);
}

/* ───────── 주소 ───────── */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** https 아무 곳, http 는 내 컴퓨터(localhost · 127.0.0.1 · [::1])와 포트가 있을 때만. 주소 뒤 경로 · 쿼리 없이 */
function checkBase(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  if (u.protocol === 'https:') return u.origin;
  if (u.protocol === 'http:' && LOOPBACK_HOSTS.includes(u.hostname) && u.port) return u.origin;
  return null;
}

/** 이 주소가 내 컴퓨터(loopback)인가 — --fixture-ok 는 이때만 받는다 */
function isLoopbackBase(base) {
  const b = checkBase(base);
  if (!b) return false;
  return LOOPBACK_HOSTS.includes(new URL(b).hostname);
}

/*
 * lib/review-evidence/url.ts 를 그대로 옮긴 링크 규칙(이 도구는 TS 를 불러오지 않는다).
 * url.ts 를 바꾸면 여기도 같이 바꾼다 — 자체 시험이 두 규칙을 같은 링크 묶음으로 견준다(check-url).
 */
const URL_REJECTION_TEXT = {
  not_string: '링크가 비어 있어요.',
  too_long: '링크가 너무 길어요(2048자까지).',
  unparsable: '링크 모양이 맞지 않아요.',
  not_https: 'https 링크만 받아요.',
  credentials: '계정 정보가 들어간 링크는 받지 않아요.',
  port: '포트 번호가 붙은 링크는 받지 않아요.',
  ip_host: 'IP 주소 링크는 받지 않아요. 원문이 있는 사이트 주소를 넣어 주세요.',
  internal_host: '내부 · 개발용 주소는 받지 않아요.',
  private_file_host: '개인 파일 공유 · 비공개 저장소 링크는 받지 않아요. 원문 출판사 · DOI · PubMed 링크를 넣어 주세요.',
  bad_host: '사이트 이름이 맞지 않아요.',
  secret_query: '토큰 · 서명 · 세션 값이 든 링크는 받지 않아요. 그 값을 뺀 원문 링크를 넣어 주세요.',
  bad_fragment: '# 뒤에 값(=, &)이 든 링크는 받지 않아요.',
  control_chars: '링크에 보이지 않는 글자가 들어 있어요.',
};
const MAX_URL_LENGTH = 2048;
const INTERNAL_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'home.arpa', 'corp', 'onion', 'test', 'invalid', 'example', 'example.com', 'example.org', 'example.net', 'arpa', 'dugout-baseball.com', 'bullpen-log.vercel.app'];
const PRIVATE_FILE_SUFFIXES = ['supabase.co', 'supabase.in', 'drive.google.com', 'docs.google.com', 'dropbox.com', 'dropboxusercontent.com', 'onedrive.live.com', '1drv.ms', 'sharepoint.com', 'icloud.com', 'box.com', 'wetransfer.com', 'notion.so', 'notion.site', 'amazonaws.com', 'blob.core.windows.net', 'storage.googleapis.com', 'r2.cloudflarestorage.com'];
const SECRET_WORDS = new Set([
  'token', 'tokens', 'auth', 'authorization', 'authtoken', 'apikey', 'accesskey', 'secretkey', 'privatekey', 'sig', 'signature',
  'session', 'sessionid', 'sid', 'jsessionid', 'phpsessid', 'password', 'passwd', 'pwd', 'secret', 'credential', 'credentials',
  'jwt', 'bearer', 'otp', 'ticket', 'nonce', 'hmac',
]);
const SECRET_EXACT = new Set(['key', 'code', 'state', 'pass']);
const SECRET_PREFIX = /^(x-amz-|x-goog-|x-ms-)/i;
function secretParamName(name) {
  if (SECRET_PREFIX.test(name)) return true;
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return false;
  const whole = words.join('');
  if (SECRET_EXACT.has(whole) || SECRET_WORDS.has(whole)) return true;
  for (let i = 0; i < words.length; i++) {
    if (SECRET_WORDS.has(words[i])) return true;
    if (i + 1 < words.length && SECRET_WORDS.has(words[i] + words[i + 1])) return true;
  }
  return false;
}
const PATH_SESSION = /;\s*(jsessionid|sid|session|sessionid|phpsessid|token)\s*=/i;
const TRACKING_PARAM = /^(utm_[a-z_]*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hs[a-z]*|ref_src|si|feature|share|from)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;
const hasSuffix = (host, list) => list.some((s) => host === s || host.endsWith('.' + s));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * 링크 안(경로 · 쿼리 · # 뒤)에 든 다른 http(s) 링크(url.ts embeddedRejection 과 같은 규칙) — 따로 왔으면 거절했을 곳
 * (계정 정보 · IP · 내부 이름 · 개인 파일 공유 · 비공개 저장소, 비밀 쿼리 이름)이면 같은 까닭. 공개 보관 주소는 받는다.
 */
const EMBEDDED_SCHEME = /https?:[/\\]{1,2}/gi;
function embeddedRejection(u) {
  let text = u.pathname + u.search + u.hash;
  for (let i = 0; i < 3; i++) {
    const r = scanEmbedded(text);
    if (r) return r;
    const next = decodeParts(text);
    if (next === text) break;
    text = next;
  }
  return null;
}
function decodeParts(text) {
  return text.replace(/(%[0-9A-Fa-f]{2})+/g, (run) => decodeSafe(run));
}
function scanEmbedded(text) {
  for (const m of text.matchAll(EMBEDDED_SCHEME)) {
    const start = (m.index ?? 0) + m[0].length;
    const authority = /^[^/\\?#\s]*/.exec(text.slice(start))?.[0] ?? '';
    if (!authority) continue;
    if (authority.includes('@')) return 'credentials';
    let inner;
    try {
      inner = new URL(`https://${authority}/`);
    } catch {
      continue;
    }
    const host = inner.hostname.toLowerCase();
    if (host.startsWith('[') || host.includes(':') || IPV4.test(host)) return 'ip_host';
    if (hasSuffix(host, INTERNAL_SUFFIXES)) return 'internal_host';
    if (hasSuffix(host, PRIVATE_FILE_SUFFIXES)) return 'private_file_host';
    const rest = /^[^\s]*/.exec(text.slice(m.index ?? 0))?.[0] ?? '';
    let whole = null;
    try {
      whole = new URL(rest.replace(/^https?:[/\\]{1,2}/i, 'https://'));
    } catch {
      whole = null;
    }
    if (whole) for (const k of whole.searchParams.keys()) if (secretParamName(k)) return 'secret_query';
  }
  return null;
}

/** 출처 링크 검사(url.ts 와 같은 규칙). 통과하면 { ok, href, normalized, host }, 아니면 { ok:false, reason, message } */
function checkEvidenceUrl(raw) {
  const no = (reason) => ({ ok: false, reason, message: URL_REJECTION_TEXT[reason] });
  if (typeof raw !== 'string' || !raw.trim()) return no('not_string');
  const text = raw.trim();
  if (text.length > MAX_URL_LENGTH) return no('too_long');
  if (CONTROL.test(text)) return no('control_chars');
  let u;
  try {
    u = new URL(text);
  } catch {
    return no('unparsable');
  }
  if (u.protocol !== 'https:') return no('not_https');
  const authority = /^https:[/\\]*([^/\\?#]*)/i.exec(text)?.[1] ?? '';
  if (u.username || u.password || authority.includes('@')) return no('credentials');
  if (u.port) return no('port');
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || host.includes(':') || IPV4.test(host)) return no('ip_host');
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((l) => !LABEL.test(l)) || !/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(labels[labels.length - 1]))
    return no(hasSuffix(host, INTERNAL_SUFFIXES) ? 'internal_host' : 'bad_host');
  if (hasSuffix(host, INTERNAL_SUFFIXES)) return no('internal_host');
  if (hasSuffix(host, PRIVATE_FILE_SUFFIXES)) return no('private_file_host');
  const inner = embeddedRejection(u);
  if (inner) return no(inner);

  if (PATH_SESSION.test(u.pathname) || PATH_SESSION.test(decodeSafe(u.pathname))) return no('secret_query');
  const kept = [];
  for (const [k, v] of u.searchParams) {
    if (secretParamName(k)) return no('secret_query');
    if (TRACKING_PARAM.test(k)) continue;
    kept.push([k, v]);
  }
  if (u.hash) {
    const frag = u.hash.slice(1);
    if (/[=&]/.test(frag) || frag.length > 120) return no('bad_fragment');
  }

  const shown = new URL(u.href);
  shown.hash = '';
  shown.search = '';
  for (const [k, v] of kept) shown.searchParams.append(k, v);
  shown.hostname = host;

  const norm = new URL(shown.href);
  norm.search = '';
  for (const [k, v] of [...kept].sort((a, b) => (a[0] === b[0] ? cmp(a[1], b[1]) : cmp(a[0], b[0])))) norm.searchParams.append(k, v);
  let p = norm.pathname;
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  norm.pathname = p || '/';

  return { ok: true, href: shown.href, normalized: norm.href, host };
}

/** 같은 링크를 가리는 열쇠 — 규칙을 지나면 url.ts 와 같은 값, 아니면(서버가 이미 받은 링크 등) 가벼운 정규화 */
function normalizeUrl(raw) {
  const c = checkEvidenceUrl(raw);
  if (c.ok) return c.normalized;
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const kept = [...u.searchParams].filter(([k]) => !TRACKING_PARAM.test(k));
  kept.sort((a, b) => (a[0] === b[0] ? cmp(a[1], b[1]) : cmp(a[0], b[0])));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let p = u.pathname;
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  u.pathname = p || '/';
  return u.href;
}

/* 번호(식별자) — url.ts 와 같은 모양 검사 */
function cleanPmid(v) {
  if (typeof v === 'number' && Number.isInteger(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^pmid:\s*/i, '');
  return /^[1-9]\d{0,9}$/.test(s) ? s : null;
}
function cleanPmcid(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim().toUpperCase();
  if (/^\d+$/.test(s)) s = 'PMC' + s;
  return /^PMC[1-9]\d{0,9}$/.test(s) ? s : null;
}
function cleanDoi(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  s = s.toLowerCase();
  return /^10\.\d{4,9}\/[^\s"<>]{1,250}$/.test(s) ? s : null;
}

/** 주소 모양에서 바로 나오는 번호(url.ts identifiersFromUrl 과 같은 주소 꼴만) */
function identifiersFromUrl(checked) {
  const u = new URL(checked.href);
  const parts = u.pathname.split('/').filter(Boolean);
  const host = checked.host;
  const out = {};
  if (host === 'pubmed.ncbi.nlm.nih.gov' && parts.length === 1) {
    const p = cleanPmid(parts[0]);
    if (p) out.pmid = p;
  } else if (host === 'www.ncbi.nlm.nih.gov' || host === 'ncbi.nlm.nih.gov') {
    if (parts[0] === 'pubmed' && parts.length === 2) {
      const p = cleanPmid(parts[1]);
      if (p) out.pmid = p;
    } else if (parts[0] === 'pmc' && parts[1] === 'articles' && parts.length === 3) {
      const p = cleanPmcid(parts[2]);
      if (p) out.pmcid = p;
    }
  } else if (host === 'pmc.ncbi.nlm.nih.gov' && parts[0] === 'articles' && parts.length === 2) {
    const p = cleanPmcid(parts[1]);
    if (p) out.pmcid = p;
  } else if (host === 'europepmc.org' && parts[0] === 'article' && parts[1] === 'PMC' && parts.length === 3) {
    const p = cleanPmcid(parts[2]);
    if (p) out.pmcid = p;
  } else if ((host === 'doi.org' || host === 'dx.doi.org') && parts.length >= 1) {
    const d = cleanDoi(decodeSafe(u.pathname.slice(1)));
    if (d) out.doi = d;
  }
  return out;
}

/* ───────── 같은 값 → 같은 글자 ───────── */

function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
/** 받지 않는 글자의 지문 — sha256 앞 12자(되돌릴 수 없음). 같은 글자를 찾아갈 때만 쓴다 */
const fingerprintOf = (v) => sha256(typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v))).slice(0, 12);
/** 받지 않는 글자를 가림 목록에도 넣는다(혹시 어디선가 그대로 나가려 해도 [가림]으로) */
function hideRaw(v) {
  if (typeof v === 'string' && v.trim().length >= 12) {
    SECRETS.add(v);
    SECRETS.add(v.trim());
  }
}

/* ───────── 상태 폴더 ───────── */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function stateDir() {
  const env = process.env.REVIEW_EVIDENCE_STATE_DIR;
  if (env && env.trim()) return path.resolve(env.trim());
  try {
    const out = execFileSync('git', ['-C', SCRIPT_DIR, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    if (out) return path.join(path.resolve(SCRIPT_DIR, out), 'review-evidence-registrar-v1');
  } catch {
    /* git 이 없거나 저장소 밖 — 집 폴더로 */
  }
  return path.join(os.homedir(), '.bullpen-review-evidence-v1');
}

const STATE = stateDir();
const P = {
  session: path.join(STATE, 'session.json'),
  pending: path.join(STATE, 'pending'),
  rejected: path.join(STATE, 'rejected'),
  imports: path.join(STATE, 'imports'),
  /** --fixture-ok 로 시험 저장소에 들어간 것을 확인한 요청(중앙 등록이 아님) */
  fixtureReceipts: path.join(STATE, 'fixture-receipts'),
  receipts: path.join(STATE, 'receipts.jsonl'),
  lock: path.join(STATE, 'queue.lock'),
  retryLock: path.join(STATE, 'retry.lock'),
};

function ensureDir(dir) {
  try {
    const st = fs.lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`상태 폴더가 바로가기이거나 폴더가 아니라 쓰지 않아요: ${path.basename(dir)}`);
    return;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function refuseSymlink(file) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`바로가기 파일은 쓰지 않아요: ${path.basename(file)}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

/** 임시 파일(0600)에 쓰고 이름을 바꾼다 — 중간에 끊겨도 반쪽 파일이 남지 않는다 */
function writeAtomic(file, text) {
  ensureDir(path.dirname(file));
  refuseSymlink(file);
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function readJsonFile(file) {
  refuseSymlink(file);
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  let text;
  try {
    text = fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  try {
    return JSON.parse(text);
  } catch {
    /* 해석기 오류 글에는 파일 글자 일부가 들어간다(세션 값 등) — 그 글을 쓰지 않고 정해진 글만 */
    throw new StateFileError(path.basename(file));
  }
}

class StateFileError extends Error {
  constructor(name) {
    super(`상태 파일의 모양이 깨져 읽지 못했어요: ${name}`);
    this.code = 'STATE_UNREADABLE';
  }
}

function appendLine(file, obj) {
  ensureDir(path.dirname(file));
  refuseSymlink(file);
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(obj) + '\n');
  } finally {
    fs.closeSync(fd);
  }
}

function removeFile(file) {
  try {
    fs.unlinkSync(file);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 대기열을 고치는 동안만 잡는 자물쇠(배타 생성). 60초 넘은 것은 버려진 것으로 본다 */
async function withLock(fn) {
  ensureDir(STATE);
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(P.lock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.lstatSync(P.lock).mtimeMs > LOCK_STALE_MS) {
          removeFile(P.lock);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > 15_000) finish(EXIT.pending, { ok: false, status: 'locked', message: '다른 등록 도구가 대기열을 쓰고 있어요. 잠시 뒤 다시 해 주세요.' });
      await sleep(100);
    }
  }
  try {
    return await fn();
  } finally {
    removeFile(P.lock);
  }
}

/* ───────── retry 자물쇠(한 번 돌리는 동안 내내) ───────── */

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** 이 자물쇠 파일의 주인이 아직 쓰는 중인가 — 주인이 살아 있고 최근에 움직였으면 true */
function lockFileHeld(lockPath) {
  let st;
  try {
    st = fs.lstatSync(lockPath);
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
  if (st.isSymbolicLink()) throw new Error('retry 자물쇠가 바로가기라 쓰지 않아요.');
  const age = Date.now() - st.mtimeMs;
  let owner = null;
  try {
    owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    owner = null;
  }
  /* 읽지 못한 자물쇠(깨짐)는 30초 동안은 쓰는 중으로 본다 */
  if (!owner) return age < 30_000;
  return age < RETRY_LOCK_STALE_MS && pidAlive(Number(owner.pid));
}

/** 다른 프로세스가 retry 중인가 */
const retryLockHeld = () => lockFileHeld(P.retryLock);

const BUSY = { ok: false, status: 'busy', message: '다른 retry 가 대기열을 보내고 있어요. 끝난 뒤 다시 해 주세요.' };

/**
 * retry 한 번 내내 잡는다. 이미 누가 잡고 있으면 끝 번호 4 'busy'.
 * 내용을 다 쓴 임시 파일을 link 로 붙인다(없을 때만 성공) — 반쯤 쓴 자물쇠가 다른 프로세스에 보이지 않는다.
 * 버려진 자물쇠는 이름을 바꿔 떼어 낸 뒤 다시 보고 지운다(둘이 같이 치우다 새 자물쇠를 지우지 않게).
 */
function acquireRetryLock() {
  ensureDir(STATE);
  const tmp = `${P.retryLock}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  writeAtomic(tmp, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  try {
    for (let i = 0; i < 3; i++) {
      try {
        fs.linkSync(tmp, P.retryLock);
        return;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
      if (retryLockHeld()) finish(EXIT.pending, BUSY);
      const aside = `${P.retryLock}.stale-${process.pid}-${randomBytes(6).toString('hex')}`;
      try {
        fs.renameSync(P.retryLock, aside);
      } catch (e) {
        if (e.code === 'ENOENT') continue; // 다른 프로세스가 먼저 치웠다
        throw e;
      }
      if (lockFileHeld(aside)) {
        /* 그 사이 새로 잡힌 자물쇠를 떼어 냈다 — 되돌리고 물러난다 */
        try {
          fs.linkSync(aside, P.retryLock);
        } catch {
          /* 이미 또 누가 잡았다 */
        }
        removeFile(aside);
        finish(EXIT.pending, BUSY);
      }
      removeFile(aside);
    }
    finish(EXIT.pending, BUSY);
  } finally {
    removeFile(tmp);
  }
}

function touchRetryLock() {
  try {
    const t = new Date();
    fs.utimesSync(P.retryLock, t, t);
  } catch {
    /* 없어졌어도 계속 — 끝에서 지운다 */
  }
}

function releaseRetryLock() {
  try {
    const owner = JSON.parse(fs.readFileSync(P.retryLock, 'utf8'));
    if (Number(owner?.pid) === process.pid) removeFile(P.retryLock);
  } catch {
    /* 이미 없음 */
  }
}

/* ───────── 세션 ───────── */

/**
 * 저장한 세션을 읽는다. 파일이 깨졌거나(손으로 고침 · 반쯤 쓰임) 바로가기이면 아무것도 보내지 않고 끝 번호 4 'session-unreadable' —
 * 해석기 오류 글(파일 글자 일부가 든)은 쓰지 않는다.
 */
function loadSession() {
  let s;
  try {
    s = readJsonFile(P.session);
  } catch (e) {
    const broken = e?.code === 'STATE_UNREADABLE';
    finish(EXIT.pending, {
      ok: false,
      status: 'session-unreadable',
      message: broken
        ? '저장한 세션 파일(session.json)이 깨져 읽지 못했어요. 아무것도 보내거나 대기열에 넣지 않았어요. logout 한 뒤 login 을 다시 해 주세요(세션 값을 손으로 고치지 마세요).'
        : '저장한 세션 파일(session.json)을 읽지 못했어요(바로가기이거나 열 수 없는 파일). 아무것도 보내거나 대기열에 넣지 않았어요. 상태 폴더의 session.json 을 지운 뒤 login 을 다시 해 주세요.',
    });
  }
  if (!s || typeof s.session !== 'string' || !checkBase(s.base)) return null;
  SECRETS.add(s.session);
  return s;
}

function saveSession(base, session, viewerLabel) {
  ensureDir(STATE);
  writeAtomic(P.session, JSON.stringify({ base, session, savedAt: new Date().toISOString(), viewerLabel: viewerLabel ?? null }, null, 2) + '\n');
  fs.chmodSync(P.session, 0o600);
}

/* ───────── 요청 ───────── */

/** 모든 요청: redirect 따라가지 않음 · 20초. 3xx 는 kind 'redirect' */
async function http(url, { method = 'GET', headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = 64 * 1024 * 1024 } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { kind: timeout ? 'timeout' : 'network', status: 0, json: null, message: redact(e?.cause?.code ?? e?.message ?? '연결 실패') };
  }
  if ((res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') {
    await res.body?.cancel().catch(() => {});
    return { kind: 'redirect', status: res.status, json: null, res };
  }
  let text = '';
  try {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return { kind: 'too_large', status: res.status, json: null, res };
    text = new TextDecoder().decode(buf);
  } catch {
    return { kind: 'network', status: res.status, json: null, res, message: '응답을 끝까지 받지 못했어요.' };
  }
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { kind: 'response', status: res.status, json, res };
}

const authHeaders = (session) => ({ cookie: `session=${session}` });
const writeHeaders = (session) => ({ ...authHeaders(session), 'content-type': 'application/json', 'x-review-evidence': '1' });

function describeFailure(r) {
  if (r.kind === 'timeout') return { lastError: 'timeout', message: '응답이 20초 안에 오지 않았어요.' };
  if (r.kind === 'network') return { lastError: 'network', message: `서버에 닿지 못했어요(${r.message ?? '연결 실패'}).` };
  if (r.kind === 'redirect') return { lastError: 'redirect', message: `다른 주소로 넘기는 응답(${r.status})이 와서 따라가지 않았어요. 주소(--base)를 확인해 주세요.` };
  if (r.kind === 'too_large') return { lastError: 'too_large_response', message: '응답이 너무 커요.' };
  const code = r.json?.error;
  if (r.status === 401) return { lastError: 'unauthenticated', message: '로그인이 풀렸어요. login 을 다시 해 주세요.' };
  if (r.status === 403) return { lastError: code || 'forbidden', message: r.json?.message ?? '대표관리자만 쓸 수 있어요.' };
  if (r.status >= 500) return { lastError: code || `http_${r.status}`, message: r.json?.message ?? `서버 오류(${r.status})예요. 같은 요청 번호로 다시 보내면 겹치지 않아요.` };
  return { lastError: code || `http_${r.status}`, message: r.json?.message ?? `예상하지 못한 응답(${r.status})이에요.` };
}

const FIXTURE_TEXT = '서버가 중앙 저장소가 아닌 곳(시험 저장소)에 저장했다고 답했어요. 등록으로 치지 않고 대기열에 남겨 두었어요. 중앙 주소로 로그인한 뒤 retry 해 주세요.';
const FIXTURE_SAVED_TEXT = '내 컴퓨터 시험 저장소(local-fixture)에 들어가 목록에서 보이는 것을 확인했어요. 중앙 등록이 아니에요. 검수 근거로 치지 않아요.';
const FIXTURE_LOCAL = 'local-fixture';

/** --fixture-ok 는 저장한 로그인 주소(와 --base)가 내 컴퓨터일 때만 받는다 */
function requireFixtureOk(flags, session) {
  if (!flags['fixture-ok']) return false;
  if (!session || !isLoopbackBase(session.base))
    usage('--fixture-ok 는 내 컴퓨터 주소(http://127.0.0.1:포트 · http://localhost:포트 · http://[::1]:포트)로 로그인한 시험에서만 써요.');
  if (flags.base !== undefined && !isLoopbackBase(flags.base)) usage('--fixture-ok 와 같이 쓰는 --base 도 내 컴퓨터 주소여야 해요.');
  return true;
}

/**
 * --fixture-ok 로 보내기 전에 서버 저장소를 묻는다. 내 컴퓨터 주소라도 중앙 저장소를 쓰는 미리보기면 보내지 않는다
 * (시험이라 생각하고 중앙에 쓰지 않게). 묻지 못하면 막지 않는다 — 보낸 뒤 응답의 store 로 가른다.
 */
async function fixtureGuard(session) {
  const v = await verifySession(session.base, session.session);
  if (v.ok && v.store === CENTRAL) usage('--fixture-ok 는 시험 저장소에서만 써요. 이 서버는 중앙 저장소라 아무것도 보내지 않았어요. 실제 등록이면 --fixture-ok 없이 해 주세요.');
}

/** 받음표에서 바깥에 알리는 칸(비밀 없음) */
function receiptFields(receipt, store) {
  const rc = isObj(receipt) ? receipt : null;
  const placement = rc && Array.isArray(rc.placements) && isObj(rc.placements[0]) ? rc.placements[0] : null;
  return {
    opId: typeof rc?.opId === 'string' ? rc.opId : null,
    sourceId: typeof placement?.sourceId === 'string' ? placement.sourceId : null,
    useId: typeof placement?.useId === 'string' ? placement.useId : null,
    receivedAt: typeof rc?.receivedAt === 'string' ? rc.receivedAt : null,
    replayed: typeof rc?.replayed === 'boolean' ? rc.replayed : null,
    visible: rc?.visible === true,
    /* R2 받음표 약속(새 서버만 — 옛 서버는 null): 쓰임 상태 · 이 요청이 지금 효력이 있나 · 무엇에 밀렸나 */
    useState: rc?.useState === 'active' || rc?.useState === 'withdrawn' || rc?.useState === 'unknown' ? rc.useState : null,
    applied: typeof rc?.applied === 'boolean' ? rc.applied : null,
    supersededBy: rc?.supersededBy === 'withdraw' || rc?.supersededBy === 'register' ? rc.supersededBy : null,
    store: typeof store === 'string' ? store : null,
    central: store === CENTRAL,
  };
}

/** 서버가 준 사람 글 — 링크가 섞였거나 너무 길면 쓰지 않는다(null) */
const serverText = (m) => (typeof m === 'string' && m.trim() && !/:\/\//.test(m) && !CONTROL.test(m) && [...m].length <= 300 ? m : null);

/** 서버가 짚은 칸 자리 — 이름 모양인 조각까지만 그대로, 그 뒤(모르는 키 이름에 값 · 링크가 섞였을 수 있음)는 지문으로 */
const FIELD_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]{0,63}(\[\d{1,4}\])*$/;
/** 이미 지문으로 바꾼 마지막 조각 — 다시 가리지 않는다(pending 이 저장된 칸 이름을 한 번 더 거쳐도 register 때와 같은 이름) */
const FIELD_FINGERPRINT = /^\[키:[0-9a-f]{8}\]$/;
function safeField(field) {
  if (typeof field !== 'string' || !field) return '';
  const segs = field.split('.');
  const kept = [];
  for (let i = 0; i < segs.length; i++) {
    if (FIELD_SEGMENT.test(segs[i]) || (i === segs.length - 1 && FIELD_FINGERPRINT.test(segs[i]))) {
      kept.push(segs[i]);
      continue;
    }
    const rest = segs.slice(i).join('.');
    hideRaw(field);
    hideRaw(rest);
    kept.push(`[키:${fingerprintOf(rest).slice(0, 8)}]`);
    break;
  }
  return kept.join('.');
}
function cleanIssues(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((x) => ({ field: safeField(x?.field), message: serverText(x?.message) ?? '서버가 이 칸을 받지 않았어요.' }));
}

/* ───────── login · logout ───────── */

const formatCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** 목록 응답의 판(apiVersion). 없으면 null — 검수자별 audit 은 2 이상에서만 된다 */
const apiVersionOf = (json) => (Number.isInteger(json?.apiVersion) && json.apiVersion > 0 ? json.apiVersion : null);
const AUDIT_API_VERSION = 2;

async function verifySession(base, session) {
  const r = await http(`${base}${API_PATH}?view=summary`, { headers: authHeaders(session) });
  if (r.kind === 'response' && r.status === 200 && r.json?.ok === true)
    return { ok: true, label: typeof r.json?.viewer?.label === 'string' ? r.json.viewer.label : null, store: r.json.store ?? null, counts: r.json.counts ?? null, apiVersion: apiVersionOf(r.json) };
  return { ok: false, ...describeFailure(r) };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 16_384) break;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function pollInterval() {
  const v = Number(process.env.REVIEW_EVIDENCE_POLL_MS);
  return Number.isInteger(v) && v >= 100 && v <= 2000 ? v : 2000;
}

async function cmdLogin(flags) {
  allowOnly(flags, ['base', 'session-stdin']);
  const base = checkBase(flags.base);
  if (!base) usage('--base 는 https 주소, 또는 내 컴퓨터(http://localhost:포트 · http://127.0.0.1:포트)만 받아요. 경로 · 쿼리 없이 넣어 주세요.');
  let session;
  if (flags['session-stdin']) {
    let raw = (await readStdin()).trim();
    if (raw.toLowerCase().startsWith('session=')) raw = raw.slice(8).split(';')[0].trim();
    if (!SESSION_VALUE.test(raw)) finish(EXIT.invalid, { ok: false, status: 'invalid', message: '표준 입력의 세션 값 모양이 맞지 않아요.' });
    session = raw;
    SECRETS.add(session);
  } else {
    const rpcHeaders = { 'content-type': 'application/json', 'x-bullpen-app': '8' };
    const made = await http(`${base}/api/rpc/login-ticket.createLoginTicket`, { method: 'POST', headers: rpcHeaders, body: '{"args":[]}' });
    const code = made.json?.result?.code;
    if (made.kind !== 'response' || made.status !== 200 || made.json?.ok !== true || typeof code !== 'string' || !/^[A-Z0-9]{8}$/.test(code)) {
      const f = describeFailure(made);
      finish(EXIT.pending, { ok: false, status: 'login-failed', error: f.lastError, message: `로그인 코드를 만들지 못했어요. ${f.message}` });
    }
    say('대표관리자로 로그인한 브라우저에서 아래 주소를 열고 2분 안에 승인해 주세요.');
    say(`  주소: ${base}/link/${code}`);
    say(`  코드: ${formatCode(code)}`);
    const deadline = Date.now() + 130_000;
    const every = pollInterval();
    for (;;) {
      await sleep(every);
      if (Date.now() > deadline) finish(EXIT.pending, { ok: false, status: 'login-timeout', message: '승인을 기다리다 시간이 지났어요. login 을 다시 해 주세요.' });
      const r = await http(`${base}/api/rpc/login-ticket.claimLoginTicket`, { method: 'POST', headers: rpcHeaders, body: JSON.stringify({ args: [{ code }] }) });
      if (r.kind !== 'response' || r.status !== 200 || r.json?.ok !== true) {
        if (r.kind === 'redirect') finish(EXIT.pending, { ok: false, status: 'login-failed', error: 'redirect', message: describeFailure(r).message });
        continue; // 잠깐 끊긴 것 — 기다리는 동안 다시 묻는다
      }
      const state = r.json?.result?.state;
      if (state === 'waiting') continue;
      if (state === 'expired' || state === 'used') finish(EXIT.pending, { ok: false, status: 'login-failed', error: state, message: state === 'used' ? '이미 쓴 코드예요. login 을 다시 해 주세요.' : '코드가 지났어요. login 을 다시 해 주세요.' });
      if (state !== 'approved') continue;
      const cookies = typeof r.res.headers.getSetCookie === 'function' ? r.res.headers.getSetCookie() : [];
      for (const c of cookies) {
        const m = /^\s*session=([^;]*)/.exec(c);
        if (m && m[1] && SESSION_VALUE.test(m[1])) session = m[1];
      }
      if (!session) finish(EXIT.pending, { ok: false, status: 'login-failed', error: 'no_cookie', message: '승인은 됐지만 세션을 받지 못했어요. login 을 다시 해 주세요.' });
      SECRETS.add(session);
      break;
    }
  }
  const v = await verifySession(base, session);
  if (!v.ok) finish(EXIT.pending, { ok: false, status: 'login-failed', error: v.lastError, message: `세션 확인에 실패해 저장하지 않았어요. ${v.message}` });
  saveSession(base, session, v.label);
  say('로그인을 저장했어요.');
  if (v.store !== CENTRAL) say(`주의: 이 서버의 저장소는 '${v.store ?? '모름'}' 이에요. 중앙 저장소가 아니라 여기에 등록한 것은 등록으로 치지 않아요.`);
  return { code: EXIT.ok, body: { ok: true, status: 'logged-in', base, viewerLabel: v.label, store: v.store, central: v.store === CENTRAL, sessionSaved: true } };
}

function cmdLogout(flags) {
  allowOnly(flags, []);
  refuseSymlink(P.session);
  const had = fs.existsSync(P.session);
  removeFile(P.session);
  say(had ? '저장한 세션을 지웠어요.' : '저장한 세션이 없어요.');
  return { code: EXIT.ok, body: { ok: true, status: 'logged-out', removed: had } };
}

/* ───────── NCBI 서지 확인(선택) ───────── */

/** 시험만: 내 컴퓨터 가짜 NCBI(http://127.0.0.1:포트 · localhost:포트). 그 밖에는 늘 공식 주소 */
function ncbiBases() {
  const t = process.env.REVIEW_EVIDENCE_NCBI_TEST_BASE;
  if (t) {
    const b = checkBase(t);
    if (b && b.startsWith('http://')) return { idconv: b, eutils: b };
  }
  return { idconv: 'https://pmc.ncbi.nlm.nih.gov', eutils: 'https://eutils.ncbi.nlm.nih.gov' };
}

function ncbiIdsFromUrl(raw) {
  const c = checkEvidenceUrl(raw);
  if (!c.ok) return null;
  const ids = identifiersFromUrl(c);
  if (ids.pmid) return { pmid: ids.pmid };
  if (ids.pmcid) return { pmcid: ids.pmcid };
  return null;
}

const cleanLine = (s, max) => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]*>/g, '').replace(new RegExp(CONTROL.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return [...t].slice(0, max).join('');
};

/**
 * PubMed 발행 유형 → 자료 종류. 알아볼 수 있는 것만 정하고, 비었거나 모르는 것(예: 'Journal Article' 만)은 null — 화면이 '분류 확인 필요'로 둔다.
 * 원저 연구는 연구 설계가 적힌 유형일 때만(무조건 원저로 두지 않는다).
 */
const ORIGINAL_STUDY = /^(randomized controlled trial|controlled clinical trial|clinical trial(, phase [iv]+)?|pragmatic clinical trial|equivalence trial|comparative study|observational study|multicenter study|validation study|evaluation study|twin study|case reports|clinical study|adaptive clinical trial)$/i;
function kindFromPubtypes(types) {
  const t = (Array.isArray(types) ? types : []).map((x) => String(x).trim()).filter(Boolean);
  if (!t.length) return null;
  if (t.some((x) => /systematic review|meta-analysis/i.test(x))) return 'systematic-review';
  if (t.some((x) => /guideline|consensus development conference/i.test(x))) return 'professional-guidance';
  if (t.some((x) => /^review$|scoping review|narrative review/i.test(x))) return 'narrative-review';
  if (t.some((x) => /^(editorial|comment|letter|news|newspaper article|interview|published erratum|retraction of publication|congress)$/i.test(x))) return 'other';
  if (t.some((x) => ORIGINAL_STUDY.test(x))) return 'original-research';
  return null;
}

async function ncbiGet(url) {
  const r = await http(url, { timeoutMs: NCBI_TIMEOUT_MS, maxBytes: 2 * 1024 * 1024, headers: { accept: 'application/json' } });
  if (r.kind !== 'response' || r.status !== 200 || !r.json) return { ok: false, why: r.kind === 'response' ? `http_${r.status}` : r.kind };
  return { ok: true, json: r.json };
}

async function lookupNcbi(sourceUrl) {
  const ids = ncbiIdsFromUrl(sourceUrl);
  if (!ids) return { ok: false, notes: ['PubMed · PMC 주소가 아니라 서지 확인을 건너뛰었어요.'] };
  const B = ncbiBases();
  const notes = [];
  let pmid = ids.pmid ?? null;
  let pmcid = ids.pmcid ?? null;
  let doi = null;
  let confirmed = false;

  const conv = await ncbiGet(`${B.idconv}/tools/idconv/api/v1/articles/?ids=${encodeURIComponent(pmid ?? pmcid)}&format=json&tool=${NCBI_TOOL}`);
  const rec = conv.ok && Array.isArray(conv.json.records) ? conv.json.records[0] : null;
  /* idconv 의 pmid 는 숫자로 올 때가 많다 — 글자로 맞춰 견준다 */
  const recPmid = rec ? cleanPmid(rec.pmid) : null;
  const recPmcid = rec ? cleanPmcid(rec.pmcid) : null;
  if (rec && rec.status !== 'error' && ((pmid && recPmid === pmid) || (pmcid && recPmcid === pmcid))) {
    if (!pmid && recPmid) pmid = recPmid;
    if (!pmcid && recPmcid) pmcid = recPmcid;
    doi = cleanDoi(rec.doi) ?? doi;
    confirmed = true;
  } else notes.push(`번호 변환(idconv)을 확인하지 못했어요(${conv.ok ? 'no_record' : conv.why}).`);

  const meta = {};
  if (pmid) {
    const sum = await ncbiGet(`${B.eutils}/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json&tool=${NCBI_TOOL}`);
    const doc = sum.ok ? sum.json?.result?.[pmid] : null;
    if (doc && String(doc.uid) === pmid && !doc.error) {
      confirmed = true;
      meta.title = cleanLine(doc.title, 400);
      meta.authors = Array.isArray(doc.authors) ? doc.authors.map((a) => cleanLine(a?.name, 120)).filter(Boolean).slice(0, 60) : [];
      meta.container = cleanLine(doc.fulljournalname, 200) ?? cleanLine(doc.source, 200);
      const y = Number(/\d{4}/.exec(String(doc.pubdate ?? ''))?.[0]);
      if (Number.isInteger(y) && y >= 1800 && y <= 2100) meta.year = y;
      for (const a of Array.isArray(doc.articleids) ? doc.articleids : []) {
        if (a?.idtype === 'doi' && !doi) doi = cleanDoi(a.value);
        if (a?.idtype === 'pmc' && !pmcid) pmcid = cleanPmcid(a.value);
      }
      meta.kindHint = kindFromPubtypes(doc.pubtype);
      if (!meta.kindHint) notes.push('발행 유형으로 자료 종류를 정하지 못해 비워 두었어요(--kind 로 넣을 수 있어요).');
    } else notes.push(`PubMed 서지(esummary)를 확인하지 못했어요(${sum.ok ? 'no_record' : sum.why}).`);
  }
  if (!confirmed) return { ok: false, notes: [...notes, '서지 확인 없이 등록해요. 적어 넣은 번호 · 다른 링크 · 확인 표시는 보내지 않아요.'] };
  const identifiers = {};
  if (pmid) identifiers.pmid = pmid;
  if (pmcid) identifiers.pmcid = pmcid;
  if (doi) identifiers.doi = doi;
  return { ok: true, identifiers, meta, notes };
}

/**
 * --lookup-ncbi 결과를 출처에 넣는다. 부른 사람이 적어 넣은 번호 · 서지는 확인된 것과 섞지 않는다.
 *  - 확인됨: 번호 · 제목 · 저자 · 학술지 · 연도는 NCBI 값만, verifiedBy 'ncbi'. 다른 링크는 그 링크 모양의 번호가 확인된 번호와 같을 때만 남긴다.
 *  - 확인 못 함: 번호 · 다른 링크 · verifiedBy 를 모두 뺀다.
 *  - 종류는 --kind(또는 --json 의 kind) · 발행 유형에서만. 둘 다 없으면 비워 둔다.
 */
function applyLookup(source, lookup, notes) {
  const s = { ...source };
  delete s.identifiers;
  delete s.verifiedBy;
  const altIn = Array.isArray(s.altUrls) ? s.altUrls : [];
  delete s.altUrls;
  if (!lookup.ok) {
    if (altIn.length) notes.push(`서지 확인이 안 돼 다른 링크 ${altIn.length}개는 보내지 않았어요.`);
    return s;
  }
  for (const k of ['title', 'authors', 'container', 'year']) delete s[k];
  s.identifiers = { ...lookup.identifiers };
  if (lookup.meta.title) s.title = lookup.meta.title;
  if (lookup.meta.authors?.length) s.authors = lookup.meta.authors;
  if (lookup.meta.container) s.container = lookup.meta.container;
  if (lookup.meta.year) s.year = lookup.meta.year;
  if (!present(s.kind) && lookup.meta.kindHint) s.kind = lookup.meta.kindHint;
  s.verifiedBy = 'ncbi';
  const kept = [];
  let dropped = 0;
  for (const a of altIn) {
    const c = checkEvidenceUrl(a);
    const ids = c.ok ? identifiersFromUrl(c) : {};
    const match = Object.entries(ids).some(([k, v]) => v && s.identifiers[k] === v);
    if (match) kept.push(a);
    else dropped++;
  }
  if (kept.length) s.altUrls = kept;
  if (dropped) notes.push(`확인된 번호와 맞지 않는 다른 링크 ${dropped}개는 보내지 않았어요.`);
  return s;
}

/* ───────── register ───────── */

function todayKst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim());

function payloadFromFlags(flags) {
  const source = { url: flags.url };
  if (present(flags.kind)) source.kind = flags.kind;
  if (present(flags.title)) source.title = flags.title;
  if (present(flags.summary)) source.summaryKo = flags.summary;
  if (present(flags['summary-basis'])) source.summaryBasis = flags['summary-basis'];
  const use = { domain: flags.domain, reviewId: flags.review, purpose: flags.purpose, applicationKo: flags.application };
  if (present(flags.item)) use.itemId = flags.item;
  if (present(flags['item-name'])) use.itemName = flags['item-name'];
  if (present(flags['purpose-note'])) use.purposeNote = flags['purpose-note'];
  if (present(flags.consulted)) use.consultedOn = flags.consulted === 'today' ? todayKst() : flags.consulted;
  if (present(flags.limits)) use.limitationsKo = flags.limits;
  if (present(flags.reading)) use.reading = flags.reading;
  if (present(flags['reading-note'])) use.readingNote = flags['reading-note'];
  return { source, use };
}

/** 가벼운 검사 — 서버가 다시 꼼꼼히 본다 */
function localIssues({ source, use }) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  if (!isObj(source)) add('source', '출처 묶음이 필요해요.');
  if (!isObj(use)) add('use', '쓰임 묶음이 필요해요.');
  if (issues.length) return issues;
  /* 모르는 칸(--json): 서버(model.ts)가 받지 않는 칸은 보내기 전에 막는다 — 키 이름에 링크 · 값이 섞였을 수 있어 이름은 지문으로만 */
  const shapes = [[source, SOURCE_KEYS, 'source'], [use, USE_KEYS, 'use']];
  if (isObj(source.identifiers)) shapes.push([source.identifiers, IDENTIFIER_KEYS, 'source.identifiers']);
  for (const [obj, allowed, at] of shapes)
    for (const k of Object.keys(obj))
      if (!allowed.includes(k)) {
        if (!SAFE_KEY.test(k)) hideRaw(k);
        add(`${at}.${safeKey(k)}`, '모르는 칸이에요(서버가 받지 않아요). 그 칸을 빼 주세요. 대기열에 넣지 않았어요.');
      }
  const u = checkEvidenceUrl(source.url);
  if (!u.ok) {
    hideRaw(source.url);
    add('source.url', u.message);
  }
  if (source.altUrls !== undefined) {
    if (!Array.isArray(source.altUrls) || source.altUrls.length > 6) add('source.altUrls', '다른 링크는 6개까지 목록으로 넣어 주세요.');
    else {
      if (source.altUrls.length && !present(source.verifiedBy)) add('source.altUrls', '다른 링크는 공식 서지 확인(verifiedBy)이 있을 때만 받아요.');
      source.altUrls.forEach((a, i) => {
        const r = checkEvidenceUrl(a);
        if (!r.ok) {
          hideRaw(a);
          add(`source.altUrls[${i}]`, r.message);
        }
      });
    }
  }
  /* 글 칸 안에 숨은 링크: 받지 않는 링크(비밀 쿼리 · 비공개 저장소 등)가 섞였으면 대기열에 넣지 않는다 */
  for (const at of textUrlIssues({ source, use })) add(at, '받지 않는 링크(토큰 · 서명 · 비공개 저장소 등)가 글에 들어 있어요. 그 링크를 빼 주세요.');
  for (const k of ['summaryKo']) if (typeof source[k] === 'string' && /https?:\/\//i.test(source[k])) add(`source.${k}`, '링크는 글이 아니라 링크 칸에 넣어 주세요.');
  for (const k of ['limitationsKo', 'readingNote']) if (typeof use[k] === 'string' && /https?:\/\//i.test(use[k])) add(`use.${k}`, '링크는 글이 아니라 링크 칸에 넣어 주세요.');
  if (present(source.kind) && !SOURCE_KINDS.includes(source.kind)) add('source.kind', `${SOURCE_KINDS.join(' · ')} 가운데 하나를 넣어 주세요.`);
  if (present(source.summaryKo) && !SUMMARY_BASIS.includes(source.summaryBasis)) add('source.summaryBasis', `요약을 무엇을 보고 썼는지(${SUMMARY_BASIS.join(' · ')}) 넣어 주세요.`);
  if (present(source.summaryKo) && (typeof source.summaryKo !== 'string' || !HANGUL.test(source.summaryKo))) add('source.summaryKo', '요약은 한국어로 짧게 적어 주세요.');
  if (!DOMAINS.includes(use.domain)) add('use.domain', 'exercise 또는 mechanics 를 넣어 주세요.');
  if (typeof use.reviewId !== 'string' || !ID_PATTERN.test(use.reviewId)) add('use.reviewId', '검수 번호(--review)가 필요해요(영문 · 숫자 · . _ : -).');
  if (present(use.itemId) && (typeof use.itemId !== 'string' || !ID_PATTERN.test(use.itemId))) add('use.itemId', '운동/드릴 번호 모양이 맞지 않아요.');
  if (!PURPOSES.includes(use.purpose)) add('use.purpose', `${PURPOSES.join(' · ')} 가운데 하나를 넣어 주세요.`);
  if (typeof use.applicationKo !== 'string' || !HANGUL.test(use.applicationKo)) add('use.applicationKo', '이 출처를 어디에 어떻게 적용했는지 한국어로 적어 주세요(--application).');
  else if (/https?:\/\//i.test(use.applicationKo)) add('use.applicationKo', '링크는 글이 아니라 링크 칸에 넣어 주세요.');
  if (present(use.limitationsKo) && (typeof use.limitationsKo !== 'string' || !HANGUL.test(use.limitationsKo))) add('use.limitationsKo', '적용 한계는 한국어로 적어 주세요.');
  if (present(use.reading) && !READING.includes(use.reading)) add('use.reading', `${READING.join(' · ')} 가운데 하나를 넣어 주세요.`);
  if (present(use.consultedOn)) {
    if (typeof use.consultedOn !== 'string' || !validDate(use.consultedOn)) add('use.consultedOn', 'YYYY-MM-DD 모양(또는 today)으로 넣어 주세요.');
    else if (use.consultedOn > todayKst()) add('use.consultedOn', '앞으로 올 날짜는 넣을 수 없어요.');
  }
  return issues;
}

/** model.ts 의 SOURCE_KEYS · USE_KEYS · 번호 칸과 같은 목록(--json 의 모르는 칸을 보내기 전에 막는다) */
const SOURCE_KEYS = ['url', 'altUrls', 'kind', 'title', 'authors', 'container', 'year', 'identifiers', 'verifiedBy', 'summaryKo', 'summaryBasis'];
const USE_KEYS = ['domain', 'reviewId', 'itemId', 'itemName', 'purpose', 'purposeNote', 'consultedOn', 'notedAt', 'applicationKo', 'limitationsKo', 'reading', 'readingNote'];
const IDENTIFIER_KEYS = ['pmid', 'pmcid', 'doi'];

const EMBEDDED_URL = /https?:\/\/[^\s"'<>]+/giu;

/** 글자 안의 링크 가운데 받지 않는 것이 있나(쉼표 등으로 붙여 쓴 링크는 떼어서도 본다). 찾으면 그 글자들을 가림 목록에 */
function hasRejectedLink(text) {
  let bad = false;
  for (const m of text.matchAll(EMBEDDED_URL)) {
    for (const piece of new Set([m[0], ...splitJoined(m[0])])) {
      if (!checkEvidenceUrl(piece).ok) {
        bad = true;
        hideRaw(piece);
      }
    }
  }
  return bad;
}

/**
 * 출처 링크(source.url · altUrls) 밖의 모든 글 칸(그리고 키 이름)에서 받지 않는 링크를 찾는다. 찾으면 그 칸 자리(키 · 번호만)를 돌려주고
 * 원래 글자는 가림 목록에 넣는다. 서버의 글 규칙과 별개로, 비밀이 든 링크가 대기열 · 거절 기록에 남지 않게 하는 도구 쪽 검사.
 */
function textUrlIssues(payload) {
  const out = [];
  const walk = (v, at) => {
    if (typeof v === 'string') {
      if (hasRejectedLink(v)) {
        hideRaw(v);
        out.push(at);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) visit(k, x, at);
  };
  const visit = (k, x, at) => {
    const here = `${at}.${safeKey(k)}`;
    if (hasRejectedLink(k)) {
      hideRaw(k);
      out.push(here);
    }
    walk(x, here);
  };
  for (const [k, x] of Object.entries(payload.source ?? {})) if (k !== 'url' && k !== 'altUrls') visit(k, x, 'source');
  for (const [k, x] of Object.entries(payload.use ?? {})) visit(k, x, 'use');
  return out;
}

/** 칸 자리를 보일 때 키 이름 — 이름 모양이 아니면 그 지문으로(값이 키에 섞였을 수 있음) */
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const safeKey = (k) => (SAFE_KEY.test(k) ? k : `[키:${fingerprintOf(k).slice(0, 8)}]`);

/** 한국어 까닭(거두기 · 버리기) 검사 — 서버와 같은 300자 · 링크 없음 */
function reasonIssue(reason) {
  if (typeof reason !== 'string' || !reason.trim()) return '까닭(--reason)을 한국어로 적어 주세요.';
  const s = reason.trim();
  if (!HANGUL.test(s)) return '까닭은 한국어로 적어 주세요.';
  if ([...s].length > 300) return '까닭은 300자까지 적어 주세요.';
  if (/https?:\/\//i.test(s)) return '까닭에는 링크를 넣지 않아요.';
  if (CONTROL.test(s.replace(/\n/g, ' '))) return '까닭에 보이지 않는 글자가 들어 있어요.';
  return null;
}

function readJsonInput(arg) {
  let text;
  try {
    text = arg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(arg), 'utf8');
  } catch {
    usage('--json 파일을 읽지 못했어요.');
  }
  try {
    return JSON.parse(text);
  } catch {
    finish(EXIT.invalid, { ok: false, status: 'invalid', message: '--json 의 JSON 모양이 맞지 않아요.' });
  }
}

const pendingFile = (key) => path.join(P.pending, `${key}.json`);
const rejectedFile = (key) => path.join(P.rejected, `${key}.json`);

function listQueue(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json') && REQUEST_KEY.test(n.slice(0, -5)));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const out = [];
  for (const n of names) {
    try {
      const v = readJsonFile(path.join(dir, n));
      if (v && typeof v.requestKey === 'string') out.push(v);
    } catch {
      /* 깨진 줄은 건너뛴다 */
    }
  }
  return out.sort((a, b) => cmp(String(a.createdAt ?? ''), String(b.createdAt ?? '')));
}

function readReceipts() {
  let text = '';
  try {
    refuseSymlink(P.receipts);
    text = fs.readFileSync(P.receipts, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (isObj(v)) out.push(v);
    } catch {
      /* 깨진 줄은 건너뛴다 */
    }
  }
  return out;
}

/** 같은 쓰임을 가리는 열쇠(대기 · 받음표 비교용). 등록: 분야 · 검수 · 운동/드릴 · 쓴 곳 · 정규화한 링크. 거두기: 쓰임 번호 */
function registerIdentity(use, url) {
  return ['register', use?.domain ?? '', use?.reviewId ?? '', use?.itemId ?? '', use?.purpose ?? '', normalizeUrl(url ?? '') ?? String(url ?? '')].join('|');
}
const withdrawIdentity = (useId) => `withdraw|${useId}`;
function identityOf(e) {
  if (typeof e?.identity === 'string') return e.identity;
  if ((e?.kind ?? 'register') === 'register' && isObj(e?.summary)) return registerIdentity(e.summary, e.summary.url);
  return null;
}
const notedOf = (e) => String(e?.notedAt ?? e?.createdAt ?? '');
const latestOf = (list) => list.reduce((best, e) => (!best || notedOf(e) > notedOf(best) ? e : best), null);

/** 대기를 rejected 로 옮긴다(자물쇠 안에서만 부른다). 대기 파일이 이미 없으면(다른 프로세스가 끝냄) 아무것도 쓰지 않는다 */
function rejectLocked(entry, info) {
  const cur = readJsonFile(pendingFile(entry.requestKey));
  if (!cur) return false;
  writeAtomic(rejectedFile(entry.requestKey), JSON.stringify({ ...cur, attempts: (cur.attempts ?? 0) + (info.countAttempt ? 1 : 0), rejectedAt: new Date().toISOString(), ...info, countAttempt: undefined }, null, 2) + '\n');
  removeFile(pendingFile(entry.requestKey));
  return true;
}

/** 새 쓴 시각 — 지금, 단 견줄 기록(받음표 · 대기)과 같은 밀리초면 그보다 1ms 뒤(요청 번호가 꼭 달라지게) */
function freshNotedAt(prevs) {
  let t = Date.now();
  for (const p of prevs) {
    const v = Date.parse(p?.notedAt ?? '');
    if (Number.isFinite(v) && v >= t) t = v + 1;
  }
  return new Date(t).toISOString();
}

/**
 * 이 컴퓨터가 아는 같은 쓰임의 반대쪽 기록(등록이면 거두기, 거두기면 등록) 가운데 lr 보다 늦게 쓴 것이 있는가.
 * 있으면 lr 의 notedAt 을 다시 쓰면 안 된다 — 옛 요청을 그대로 다시 보내면 서버는 옛 기록을 다시 보여 줄 뿐이라
 * 거둔 쓰임이 되살아나지 않고(등록), 되살린 쓰임이 다시 거둬지지 않는다(거두기). 받음표 · 대기 · 시험 받음표를 다 본다.
 * 다른 맥이 한 것은 여기서 모른다 — 그것은 서버 받음표의 useState · applied · supersededBy 로 가린다(sendPending).
 */
function laterOppositeOp(kind, lr) {
  const since = notedOf(lr);
  const receipts = readReceipts();
  const fixtures = listQueue(P.fixtureReceipts);
  const pendings = listQueue(P.pending);
  const later = (e) => notedOf(e) > since;
  if (kind === 'register') {
    const useId = typeof lr.useId === 'string' && USE_ID.test(lr.useId) ? lr.useId : null;
    if (!useId) return false;
    const targetOf = (e) => e?.withdrawUseId ?? e?.summary?.useId ?? null;
    return [...receipts, ...fixtures, ...pendings].some((e) => e?.kind === 'withdraw' && targetOf(e) === useId && later(e));
  }
  const useId = lr.withdrawUseId ?? lr.summary?.useId ?? null;
  if (typeof useId !== 'string' || !USE_ID.test(useId)) return false;
  const regs = [...receipts, ...fixtures].filter((e) => (e?.kind ?? 'register') === 'register' && e?.useId === useId);
  if (regs.some(later)) return true;
  const identities = new Set(regs.map((e) => identityOf(e)).filter(Boolean));
  return pendings.some((e) => (e?.kind ?? 'register') === 'register' && identities.has(identityOf(e)) && later(e));
}

/**
 * 대기열에 넣는다(보내기 전에). notedAt 은 처음 넣을 때 정해 본문에 들어간다 — 다시 보내도 같은 글자.
 *  - 같은 쓰임의 가장 새 대기가 같은 내용이면 그것을 그대로 쓴다(그 대기에 주소가 없으면 이번 주소를 적는다).
 *  - 아니면, 이 컴퓨터 받음표에서 같은 쓰임의 가장 새 등록이 같은 내용이면 그 notedAt 을 다시 써 같은 요청 번호가 된다(이미 등록됨으로 확인).
 *    단 그 뒤에 같은 쓰임의 반대쪽 기록(거두기 ↔ 등록)이 이 컴퓨터에 있으면 다시 쓰지 않고 새 시각으로 한다.
 *  - 그 밖에는 지금 시각으로 새 요청 — 같은 쓰임의 옛 대기는 '밀림'으로 rejected 에 옮긴다(늦게 보낸 옛 요청이 고침을 덮지 않게).
 *  - fresh: 서버가 '더 새 상태가 있다'고 알린 요청을 한 번 새 시각으로 다시 넣을 때(대기 · 받음표의 notedAt 을 다시 쓰지 않음).
 */
async function enqueue({ kind, contentKey, identity, summary, build, base, fixtureOk = false, fresh = false }) {
  return withLock(async () => {
    const same = listQueue(P.pending).filter((e) => identityOf(e) === identity);
    const latestP = latestOf(same);
    let entry;
    if (!fresh && latestP && latestP.contentKey === contentKey && typeof latestP.bodyText === 'string') {
      entry = latestP;
      if (!entry.base && base) {
        /* 로그인 없이 넣은 대기(주소 없음)를 지금 주소로 — '다른 주소의 대기'로 막지 않는다(retry 와 같게) */
        entry = { ...entry, base };
        writeAtomic(pendingFile(entry.requestKey), JSON.stringify(entry, null, 2) + '\n');
      }
    } else {
      let lr = fresh ? null : latestOf(readReceipts().filter((r) => r.identity === identity && r.store === CENTRAL));
      /* --fixture-ok: 같은 시험 주소에 이미 들어간 같은 쓰임이면 그 notedAt 을 다시 써 같은 요청 번호가 된다(중앙 받음표와 섞지 않음) */
      if (fixtureOk && !fresh) {
        const lf = latestOf(listQueue(P.fixtureReceipts).filter((r) => r.identity === identity && r.base === base && r.store === FIXTURE_LOCAL));
        if (lf && (!lr || notedOf(lf) > notedOf(lr))) lr = lf;
      }
      const reuse = !!lr && lr.contentKey === contentKey && typeof lr.notedAt === 'string' && !laterOppositeOp(kind, lr);
      const notedAt = reuse ? lr.notedAt : freshNotedAt([lr, latestP]);
      const { requestKey, bodyText } = build(notedAt);
      if (Buffer.byteLength(bodyText) > MAX_REGISTER_BYTES) finish(EXIT.invalid, { ok: false, status: 'invalid', message: '본문이 32KB 를 넘어요. 요약 · 적용 글을 줄여 주세요.' });
      const prev = readJsonFile(pendingFile(requestKey));
      entry = {
        requestKey,
        kind,
        contentKey,
        identity,
        notedAt,
        base: prev?.base ?? base,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
        attempts: prev?.attempts ?? 0,
        lastError: prev?.lastError ?? null,
        lastAttemptAt: prev?.lastAttemptAt ?? null,
        summary,
        bodyText: prev?.bodyText ?? bodyText,
      };
      writeAtomic(pendingFile(requestKey), JSON.stringify(entry, null, 2) + '\n');
    }
    const superseded = [];
    for (const e of same) {
      if (e.requestKey === entry.requestKey) continue;
      if (rejectLocked(e, { reason: 'superseded', supersededBy: entry.requestKey, message: '같은 쓰임의 더 새 요청이 들어와 이 요청은 보내지 않아요.' })) superseded.push(e.requestKey);
    }
    return { entry, superseded };
  });
}

const fixtureFile = (key) => path.join(P.fixtureReceipts, `${key}.json`);

/**
 * 받음표가 이 요청을 어떻게 끝냈나(EX-REF04 R2 받음표 약속: useState · applied · supersededBy).
 *  - 'ok': 등록은 쓰임이 살아 있고(useState 'active') 목록에서 보임, 거두기는 이 거두기가 지금 적용됨(applied).
 *  - 'already-withdrawn': 거두기 — 다른 거두기(같거나 늦은 쓴 시각)가 이미 그 쓰임을 거둬 둠(supersededBy 'withdraw').
 *  - 'stale': 더 새 상태가 있음 — 등록인데 그 쓰임이 거둔 상태(useState 'withdrawn'), 거두기인데 그 뒤 등록으로 살아 있음
 *    (supersededBy 'register'). 같은 요청을 다시 보내도 그대로라 대기로 두지 않는다.
 *  - 'unconfirmed': 그 밖(목록을 못 읽음 등) — 대기로 두고 retry.
 * 칸이 없는 옛 서버는 예전 그대로 visible 만 본다(옛 서버에서는 다른 맥의 거두기 · 되살리기를 가리지 못한다).
 */
function outcomeOf(kind, rc) {
  const newServer = typeof rc.useState === 'string' || typeof rc.applied === 'boolean' || rc.supersededBy !== undefined;
  if (kind === 'withdraw') {
    const applied = newServer && typeof rc.applied === 'boolean' ? rc.applied : rc.visible === true;
    if (applied && rc.visible === true) return 'ok';
    if (!newServer) return 'unconfirmed';
    if (rc.supersededBy === 'withdraw') return 'already-withdrawn';
    if (rc.supersededBy === 'register') return 'stale';
    return 'unconfirmed';
  }
  if (newServer && (rc.useState === 'withdrawn' || (rc.supersededBy === 'withdraw' && rc.useState !== 'active'))) return 'stale';
  if (rc.visible === true && (!newServer || rc.useState === 'active' || rc.useState === 'unknown' || rc.useState === undefined || rc.useState === null)) return 'ok';
  return 'unconfirmed';
}

/** 밀림(superseded) 알림 글 */
function supersededText(kind, fixture) {
  const tail = fixture ? ' 시험 저장소(local-fixture)라 중앙 등록과 상관없어요.' : '';
  return kind === 'withdraw'
    ? `이 쓰임은 이 거두기보다 늦게 다시 등록돼 살아 있어요. 이 거두기는 적용되지 않아 rejected(밀림)로 옮겼어요. 그래도 거두려면 withdraw 를 다시 해 주세요.${tail}`
    : `이 쓰임은 이 등록보다 늦게 거둔 기록이 있어 거둔 상태예요. 이 등록은 적용되지 않아 rejected(밀림)로 옮겼어요. 아직 쓰는 출처면 register 를 다시 해 주세요.${tail}`;
}
const ALREADY_WITHDRAWN_TEXT = '이 쓰임은 이미 다른 거두기로 거둔 상태예요. 이 요청은 따로 적용되지 않았지만 거둔 상태를 중앙 목록에서 확인했어요.';
const FIXTURE_ALREADY_WITHDRAWN_TEXT = '시험 저장소(local-fixture)에서 이 쓰임은 이미 다른 거두기로 거둔 상태예요. 중앙 등록이 아니에요. 검수 근거로 치지 않아요.';

/**
 * 대기 하나를 보내고 결과대로 대기열을 고친다. 반환: { code, ok, status, error?, message?, receipt?, ...receiptFields }
 *  - store 'central' · 끝남(ok) → 받음표(receipts.jsonl)에 적고 대기를 지운다(끝 번호 0). 이미 다른 거두기로 거둔 쓰임이면
 *    'already-withdrawn'(0, 받음표 줄에 applied false).
 *  - store 'local-fixture' 이고 fixtureOk → 같은 판단을 시험 이름으로: fixture-saved · fixture-already-withdrawn(끝 번호 5, fixture-receipts 로 옮김).
 *  - 더 새 상태(stale): stale 'report' 면 대기를 건드리지 않고 { stale: true } 를 돌려준다(부른 쪽이 새 시각으로 한 번 다시 넣음).
 *    stale 'terminal' 이면 rejected 로 옮기고 'superseded'(끝 번호 2, reason superseded-central · superseded-fixture).
 *  - 그 밖의 시험 저장소 응답 · 미확인 → 대기에 남긴다(끝 번호 4).
 */
async function sendPending(entry, session, { fixtureOk = false, stale = 'terminal' } = {}) {
  const base = entry.base;
  const kind = entry.kind ?? 'register';
  const r = await http(`${base}${API_PATH}`, { method: 'POST', headers: writeHeaders(session.session), body: entry.bodyText });
  const now = new Date().toISOString();
  const receipt = r.json?.receipt;
  if (r.kind === 'response' && (r.status === 200 || r.status === 201) && r.json?.ok === true && isObj(receipt) && receipt.requestKey === entry.requestKey) {
    const store = typeof r.json.store === 'string' ? r.json.store : null;
    const fields = receiptFields(receipt, store);
    /* 거두기는 받음표에 자리가 없을 때(적용 안 됨)도 그 대상 쓰임 번호를 알린다 */
    if (kind === 'withdraw' && !fields.useId && typeof entry.summary?.useId === 'string') fields.useId = entry.summary.useId;
    const fixture = store !== CENTRAL;
    if (fixture && !(fixtureOk && store === FIXTURE_LOCAL)) {
      await updatePending(entry, { lastError: 'fixture-only', lastStore: store, lastAttemptAt: now });
      return { code: EXIT.pending, ok: false, status: 'fixture-only', error: 'fixture-only', message: FIXTURE_TEXT, receipt, ...fields };
    }
    const outcome = outcomeOf(kind, receipt);
    if (outcome === 'stale') {
      if (stale === 'report') return { stale: true, code: EXIT.conflict, ok: false, status: 'superseded', error: 'superseded', receipt, ...fields, ...(fixture ? { fixture: true } : {}) };
      await moveToRejected(entry, {
        reason: fixture ? 'superseded-fixture' : 'superseded-central',
        message: supersededText(kind, fixture),
        httpStatus: r.status,
        store,
        opId: fields.opId,
        sourceId: fields.sourceId,
        useId: fields.useId,
        receivedAt: fields.receivedAt,
        useState: fields.useState,
        applied: fields.applied,
        serverSupersededBy: fields.supersededBy,
        countAttempt: true,
      });
      return { code: EXIT.conflict, ok: false, status: 'superseded', error: 'superseded', message: supersededText(kind, fixture), receipt, ...fields, ...(fixture ? { fixture: true } : {}) };
    }
    if (outcome === 'unconfirmed') {
      if (fixture) {
        await updatePending(entry, { lastError: 'fixture-only', lastStore: store, lastAttemptAt: now });
        return { code: EXIT.pending, ok: false, status: 'fixture-only', error: 'fixture-only', message: FIXTURE_TEXT, receipt, ...fields };
      }
      await updatePending(entry, { lastError: 'unconfirmed', lastStore: store, lastAttemptAt: now });
      return { code: EXIT.pending, ok: false, status: 'pending', error: 'unconfirmed', message: '서버가 저장은 했지만 목록에서 보이는지 확인하지 못했어요. retry 로 다시 확인해 주세요.', receipt, ...fields };
    }
    const alreadyWithdrawn = outcome === 'already-withdrawn';
    if (fixture) {
      await withLock(async () => {
        const cur = readJsonFile(pendingFile(entry.requestKey)) ?? entry;
        writeAtomic(
          fixtureFile(entry.requestKey),
          JSON.stringify(
            {
              requestKey: entry.requestKey,
              kind: cur.kind ?? 'register',
              contentKey: cur.contentKey ?? null,
              identity: identityOf(cur),
              notedAt: cur.notedAt ?? null,
              base,
              createdAt: cur.createdAt ?? null,
              attempts: (cur.attempts ?? 0) + 1,
              summary: cur.summary ?? null,
              ...fields,
              withdrawUseId: kind === 'withdraw' ? (cur.summary?.useId ?? null) : null,
              fixture: true,
              fixtureSavedAt: now,
            },
            null,
            2,
          ) + '\n',
        );
        removeFile(pendingFile(entry.requestKey));
        removeFile(rejectedFile(entry.requestKey));
      });
      if (alreadyWithdrawn) return { code: EXIT.fixture, ok: false, status: 'fixture-already-withdrawn', fixture: true, message: FIXTURE_ALREADY_WITHDRAWN_TEXT, receipt, ...fields };
      return { code: EXIT.fixture, ok: false, status: 'fixture-saved', fixture: true, message: FIXTURE_SAVED_TEXT, receipt, ...fields };
    }
    await withLock(async () => {
      appendLine(P.receipts, {
        requestKey: entry.requestKey,
        kind,
        contentKey: entry.contentKey ?? null,
        identity: identityOf(entry),
        notedAt: entry.notedAt ?? null,
        store,
        opId: fields.opId,
        sourceId: fields.sourceId,
        useId: fields.useId,
        receivedAt: fields.receivedAt,
        replayed: fields.replayed,
        applied: fields.applied,
        useState: fields.useState,
        supersededBy: fields.supersededBy,
        base,
        domain: entry.summary?.domain ?? null,
        reviewId: entry.summary?.reviewId ?? null,
        itemId: entry.summary?.itemId ?? null,
        url: entry.summary?.url ?? null,
        withdrawUseId: entry.summary?.useId ?? null,
      });
      removeFile(pendingFile(entry.requestKey));
      removeFile(rejectedFile(entry.requestKey));
    });
    if (alreadyWithdrawn) return { code: EXIT.ok, ok: true, status: 'already-withdrawn', message: ALREADY_WITHDRAWN_TEXT, receipt, ...fields };
    const status = receipt.replayed ? (kind === 'withdraw' ? 'already-withdrawn' : 'already-registered') : kind === 'withdraw' ? 'withdrawn' : 'registered';
    return { code: EXIT.ok, ok: true, status, receipt, ...fields };
  }
  const none = receiptFields(null, null);
  if (r.kind === 'response' && r.status === 409) {
    const message = serverText(r.json?.message);
    await moveToRejected(entry, { reason: 'conflict', httpStatus: 409, error: r.json?.error ?? 'conflict', message, issues: [], countAttempt: true });
    return { code: EXIT.conflict, ok: false, status: 'rejected', error: 'conflict', message: message ?? '같은 요청 번호로 다른 내용이 이미 저장돼 있어요.', ...none };
  }
  /* 서버가 짚은 칸 이름은 받은 글자 그대로 쓰지 않는다(모르는 키 이름에 링크가 섞였을 수 있음) — cleanIssues */
  const issues = cleanIssues(r.json?.issues);
  /* 403 이라도 본문 문제를 짚어 준 것(다른 사람의 쓰임 거두기)은 다시 보내도 같다 — rejected. 출처 · 머리 문제 403 은 대기 */
  if (r.kind === 'response' && (r.status === 400 || r.status === 413 || r.status === 415 || (r.status === 403 && issues.length))) {
    const message = serverText(r.json?.message);
    await moveToRejected(entry, { reason: 'invalid', httpStatus: r.status, error: r.json?.error ?? `http_${r.status}`, message, issues, countAttempt: true });
    return { code: EXIT.invalid, ok: false, status: 'rejected', error: r.json?.error ?? `http_${r.status}`, message: message ?? '서버가 값을 받지 않았어요.', issues, ...none };
  }
  const f = r.kind === 'response' && (r.status === 200 || r.status === 201) ? { lastError: 'bad_response', message: '서버 응답에서 받음표를 확인하지 못했어요.' } : describeFailure(r);
  await updatePending(entry, { lastError: f.lastError, lastAttemptAt: now });
  return { code: EXIT.pending, ok: false, status: 'pending', error: f.lastError, message: f.message, ...none };
}

/** 대기를 고친다. 대기 파일이 이미 없으면(다른 프로세스가 등록을 끝냄) 다시 만들지 않는다 */
async function updatePending(entry, patch) {
  return withLock(async () => {
    const cur = readJsonFile(pendingFile(entry.requestKey));
    if (!cur) return false;
    writeAtomic(pendingFile(entry.requestKey), JSON.stringify({ ...cur, attempts: (cur.attempts ?? 0) + (patch.lastAttemptAt ? 1 : 0), ...patch }, null, 2) + '\n');
    return true;
  });
}

async function moveToRejected(entry, info) {
  return withLock(async () => rejectLocked(entry, info));
}

/**
 * 세션 · 주소를 보고 보내거나 대기만 하고 결과를 돌려준다(register · withdraw 공통).
 * refresh: 서버가 '이 요청보다 더 새 상태가 있다'(stale)고 알리면 같은 내용을 새 쓴 시각(새 요청 번호)으로 한 번만 다시 넣어 보낸다
 * (옛 요청은 rejected(superseded)로). 그래도 더 새 상태면 끝 번호 2 'superseded'.
 */
async function deliver(entry, session, notes, { fixtureOk = false, refresh = null } = {}) {
  const tailOf = (e) => ({ requestKey: e.requestKey, notedAt: e.notedAt ?? null, notes });
  const none = receiptFields(null, null);
  if (!session) {
    await updatePending(entry, { lastError: 'no-session' });
    say('로그인이 없어 대기열에만 넣었어요. login 뒤 retry 해 주세요.');
    finish(EXIT.pending, { ok: false, status: 'pending', error: 'no-session', message: '대기열에만 넣었고 아직 등록되지 않았어요.', ...none, ...tailOf(entry) });
  }
  if (!entry.base) {
    /* 주소 없이 넣은 대기(로그인 전) — retry 처럼 지금 로그인한 주소를 쓴다. --base 로 다른 주소를 준 것은 위에서 그 주소로 들어가 아래에서 막힌다 */
    await updatePending(entry, { base: session.base });
    entry = { ...entry, base: session.base };
  }
  if (entry.base !== session.base) {
    await updatePending(entry, { lastError: 'base-mismatch' });
    finish(EXIT.pending, { ok: false, status: 'pending', error: 'base-mismatch', message: '이 요청은 로그인한 주소와 다른 주소의 대기예요. 그 주소로 로그인한 뒤 retry 하거나, 필요 없으면 discard 해 주세요.', ...none, ...tailOf(entry) });
  }
  /* 돌고 있는 retry 는 시작할 때의 대기 목록만 보내므로 이 새 요청과 겹치지 않는다 */
  let res = await sendPending(entry, session, { fixtureOk, stale: refresh ? 'report' : 'terminal' });
  let refreshedFrom = null;
  if (res.stale) {
    refreshedFrom = entry.requestKey;
    const kind = entry.kind ?? 'register';
    notes.push(
      kind === 'withdraw'
        ? '이 쓰임은 이 거두기보다 늦게 다시 등록된 상태라, 같은 까닭을 새 쓴 시각으로 한 번 다시 보냈어요(옛 요청은 rejected(superseded)).'
        : '이 쓰임은 거둔 상태라, 같은 내용을 새 쓴 시각으로 한 번 다시 보냈어요(옛 요청은 rejected(superseded)).',
    );
    entry = (await refresh()).entry;
    res = await sendPending(entry, session, { fixtureOk, stale: 'terminal' });
  }
  const kindNow = entry.kind ?? 'register';
  if (res.status === 'pending') say(`아직 등록되지 않았어요(${res.error}). 대기열에 남겨 두었어요. 나중에 retry 해 주세요.`);
  else if (res.status === 'fixture-only') say('시험 저장소에만 들어갔어요. 등록이 아니에요. 대기열에 남겨 두었어요.');
  else if (res.status === 'fixture-saved') say(`시험 저장소에만 들어갔어요(--fixture-ok, 끝 번호 5)${refreshedFrom ? '. 새 쓴 시각으로 다시 보낸 것이 적용됐어요' : ''}. 중앙 등록이 아니에요.`);
  else if (res.status === 'fixture-already-withdrawn') say('시험 저장소에서 이미 다른 거두기로 거둔 상태예요(--fixture-ok, 끝 번호 5). 중앙 등록이 아니에요.');
  else if (res.status === 'superseded' || (res.ok && res.status === 'already-withdrawn' && res.applied === false)) {
    /* 알림 글(body.message)은 끝에서 한 번 알린다 */
  }
  else if (res.ok && refreshedFrom)
    say(kindNow === 'withdraw' ? '새 쓴 시각으로 다시 거둬 중앙 목록에서 거둔 상태로 바뀐 것을 확인했어요.' : '새 쓴 시각으로 다시 등록해 거둔 쓰임을 되살렸고 중앙 목록에서 보이는 것까지 확인했어요.');
  else if (res.ok) say(/^already/.test(res.status) ? '이미 들어가 있고 중앙 목록에서 보이는 것을 확인했어요.' : '중앙 저장소에 넣었고 목록에서 보이는 것까지 확인했어요.');
  else say(`서버가 받지 않았어요(${res.error}). rejected 에 남겼어요.`);
  const { code, ...body } = res;
  delete body.stale;
  return { code, body: { ...body, refreshed: !!refreshedFrom, refreshedFrom, ...tailOf(entry) } };
}

/** --base 와 세션 주소: 다르면 그 주소의 대기로 넣는다(쓰는 법 오류로 버리지 않는다) */
function pickBase(flags, session) {
  const flagBase = flags.base !== undefined ? checkBase(flags.base) : null;
  if (flags.base !== undefined && !flagBase) usage('--base 주소 모양이 맞지 않아요.');
  return flagBase ?? session?.base ?? null;
}

async function cmdRegister(flags) {
  const known = ['base', 'url', 'domain', 'review', 'item', 'item-name', 'purpose', 'purpose-note', 'consulted', 'application', 'limits', 'reading', 'reading-note', 'kind', 'title', 'summary', 'summary-basis', 'json', 'lookup-ncbi', 'fixture-ok'];
  allowOnly(flags, known);
  const session = loadSession();
  const fixtureOk = requireFixtureOk(flags, session);
  let payload;
  if (flags.json !== undefined) {
    const extra = known.filter((k) => !['json', 'lookup-ncbi', 'base', 'fixture-ok'].includes(k) && flags[k] !== undefined);
    if (extra.length) usage('--json 과 다른 값 옵션을 같이 쓰지 않아요.');
    const raw = readJsonInput(flags.json);
    if (!isObj(raw) || Object.keys(raw).some((k) => k !== 'source' && k !== 'use')) finish(EXIT.invalid, { ok: false, status: 'invalid', message: '--json 은 { "source": …, "use": … } 모양이어야 해요.' });
    payload = { source: raw.source, use: raw.use };
    if (isObj(payload.use)) {
      const u = { ...payload.use };
      if (u.consultedOn === 'today') u.consultedOn = todayKst();
      delete u.notedAt; // 쓴 시각은 이 도구가 대기열에 넣을 때 정한다
      payload.use = u;
    }
  } else {
    for (const k of ['url', 'domain', 'review', 'purpose', 'application']) if (flags[k] === undefined) usage(`--${k} 이 필요해요.`);
    payload = payloadFromFlags(flags);
  }

  const notes = [];
  let lookup = null;
  if (flags['lookup-ncbi'] && isObj(payload.source) && typeof payload.source.url === 'string') {
    lookup = await lookupNcbi(payload.source.url);
    notes.push(...lookup.notes);
    payload.source = applyLookup(payload.source, lookup, notes);
  }

  const issues = localIssues(payload);
  if (issues.length) finish(EXIT.invalid, { ok: false, status: 'invalid', message: '값을 확인해 주세요. 대기열에 넣지 않았어요.', issues, notes });

  const base = pickBase(flags, session);
  if (fixtureOk) await fixtureGuard(session);
  const contentKey = 'ck-' + sha256(canonicalJson(payload)).slice(0, 48);
  const job = {
    kind: 'register',
    contentKey,
    identity: registerIdentity(payload.use, payload.source.url),
    summary: { url: payload.source.url, domain: payload.use.domain, reviewId: payload.use.reviewId, itemId: payload.use.itemId ?? null, purpose: payload.use.purpose },
    base,
    fixtureOk,
    build: (notedAt) => {
      const withNoted = { source: payload.source, use: { ...payload.use, notedAt } };
      const requestKey = 'rk-cli-' + sha256(canonicalJson(withNoted)).slice(0, 48);
      return { requestKey, bodyText: canonicalJson({ requestKey, ...withNoted }) };
    },
  };
  const { entry, superseded } = await enqueue(job);
  if (superseded.length) notes.push(`같은 쓰임의 옛 대기 ${superseded.length}건은 보내지 않고 rejected(superseded)로 옮겼어요.`);
  const out = await deliver(entry, session, notes, { fixtureOk, refresh: () => enqueue({ ...job, fresh: true }) });
  out.body.superseded = superseded;
  if (lookup) out.body.lookup = { ok: lookup.ok };
  return out;
}

/* ───────── withdraw ───────── */

async function cmdWithdraw(flags) {
  allowOnly(flags, ['use', 'reason', 'base', 'fixture-ok']);
  const session = loadSession();
  const fixtureOk = requireFixtureOk(flags, session);
  if (typeof flags.use !== 'string' || !USE_ID.test(flags.use)) usage('--use 는 쓰임 번호(use_ 뒤 24자리)예요. 목록 화면이나 등록 받음표의 useId 를 넣어 주세요.');
  const why = reasonIssue(flags.reason);
  if (why) finish(EXIT.invalid, { ok: false, status: 'invalid', message: why, issues: [{ field: 'withdraw.reasonKo', message: why }] });
  const useId = flags.use;
  const reasonKo = flags.reason.trim();
  const base = pickBase(flags, session);
  if (fixtureOk) await fixtureGuard(session);
  const contentKey = 'ck-w-' + sha256(canonicalJson({ useId, reasonKo })).slice(0, 48);
  const job = {
    kind: 'withdraw',
    contentKey,
    identity: withdrawIdentity(useId),
    summary: { useId },
    base,
    fixtureOk,
    build: (notedAt) => {
      const w = { useId, reasonKo, notedAt };
      const requestKey = 'rk-cli-w-' + sha256(canonicalJson({ withdraw: w })).slice(0, 48);
      return { requestKey, bodyText: canonicalJson({ requestKey, withdraw: w }) };
    },
  };
  const { entry, superseded } = await enqueue(job);
  const out = await deliver(entry, session, [], { fixtureOk, refresh: () => enqueue({ ...job, fresh: true }) });
  out.body.superseded = superseded;
  return out;
}

/* ───────── retry · pending · discard · status ───────── */

async function cmdRetry(flags) {
  allowOnly(flags, ['max', 'fixture-ok']);
  const max = flags.max === undefined ? 50 : Number(flags.max);
  if (!Number.isInteger(max) || max < 1 || max > 10_000) usage('--max 는 1 이상의 정수예요.');
  const session = loadSession();
  const fixtureOk = requireFixtureOk(flags, session);
  if (!listQueue(P.pending).length) return { code: EXIT.ok, body: { ok: true, status: 'empty', attempted: 0, pendingLeft: 0, results: [] } };
  if (!session) finish(EXIT.pending, { ok: false, status: 'no-session', message: '로그인이 없어요. login 뒤 다시 해 주세요.', pending: listQueue(P.pending).length });
  if (fixtureOk) await fixtureGuard(session);
  acquireRetryLock();
  try {
    const queue = listQueue(P.pending);
    const results = [];
    const tally = {
      registered: 0,
      alreadyRegistered: 0,
      withdrawn: 0,
      stillPending: 0,
      fixtureOnly: 0,
      fixtureSaved: 0,
      fixtureAlreadyWithdrawn: 0,
      superseded: 0,
      conflict: 0,
      invalid: 0,
      baseMismatch: 0,
      noBody: 0,
      gone: 0,
      notAttempted: Math.max(0, queue.length - max),
    };
    let fixtureTerminal = 0;
    for (const e of queue.slice(0, max)) {
      touchRetryLock();
      const head = { requestKey: e.requestKey, kind: e.kind ?? 'register', domain: e.summary?.domain ?? null, reviewId: e.summary?.reviewId ?? null, itemId: e.summary?.itemId ?? null };
      if (!fs.existsSync(pendingFile(e.requestKey))) {
        tally.gone++;
        results.push({ ...head, status: 'gone' });
        continue;
      }
      if (!e.base) {
        await updatePending(e, { base: session.base });
        e.base = session.base;
      }
      if (e.base !== session.base) {
        tally.baseMismatch++;
        results.push({ ...head, status: 'not-sent', error: 'base-mismatch', base: e.base });
        continue;
      }
      if (typeof e.bodyText !== 'string') {
        tally.noBody++;
        results.push({ ...head, status: 'not-sent', error: 'no-body' });
        continue;
      }
      /* retry 에서는 '더 새 상태'(stale)를 새로 보내지 않고 끝낸다 — rejected(superseded-central · superseded-fixture) */
      const r = await sendPending(e, session, { fixtureOk, stale: 'terminal' });
      if (r.status === 'registered') tally.registered++;
      else if (r.status === 'already-registered' || r.status === 'already-withdrawn') tally.alreadyRegistered++;
      else if (r.status === 'withdrawn') tally.withdrawn++;
      else if (r.status === 'fixture-saved') tally.fixtureSaved++;
      else if (r.status === 'fixture-already-withdrawn') tally.fixtureAlreadyWithdrawn++;
      else if (r.status === 'superseded') {
        tally.superseded++;
        if (r.fixture) fixtureTerminal++;
      } else if (r.status === 'fixture-only') tally.fixtureOnly++;
      else if (r.status === 'pending') tally.stillPending++;
      else if (r.error === 'conflict') tally.conflict++;
      else tally.invalid++;
      results.push({
        ...head,
        status: r.status,
        error: r.error ?? null,
        opId: r.opId ?? null,
        sourceId: r.sourceId ?? null,
        useId: r.useId ?? null,
        receivedAt: r.receivedAt ?? null,
        replayed: r.replayed ?? null,
        visible: r.visible === true,
        useState: r.useState ?? null,
        applied: r.applied ?? null,
        supersededBy: r.supersededBy ?? null,
        store: r.store ?? null,
        central: r.central === true,
        ...(r.fixture ? { fixture: true } : {}),
      });
    }
    const left = listQueue(P.pending).length;
    /* 밀림(superseded)만으로는 0 이 아닌 끝 번호로 만들지 않는다(더 보낼 것이 없음). 시험 저장소에서 끝난 것이 있으면 5 */
    const code =
      left > 0 || tally.stillPending || tally.fixtureOnly
        ? EXIT.pending
        : tally.conflict
          ? EXIT.conflict
          : tally.invalid
            ? EXIT.invalid
            : tally.fixtureSaved || tally.fixtureAlreadyWithdrawn || fixtureTerminal
              ? EXIT.fixture
              : EXIT.ok;
    const centralDone = tally.registered + tally.alreadyRegistered + tally.withdrawn;
    say(
      `다시 보냄 ${results.length} · 중앙 등록 ${centralDone} · 남은 대기 ${left}${tally.notAttempted ? `(이번에 안 보낸 ${tally.notAttempted})` : ''}` +
        `${tally.fixtureSaved + tally.fixtureAlreadyWithdrawn ? ` · 시험 저장소에만 ${tally.fixtureSaved + tally.fixtureAlreadyWithdrawn}(중앙 등록 아님)` : ''}` +
        `${tally.superseded ? ` · 밀림 ${tally.superseded}(더 새 상태가 있어 적용 안 됨 · rejected 로 옮김)` : ''}${tally.baseMismatch ? ` · 다른 주소 ${tally.baseMismatch}(discard 또는 그 주소로 로그인)` : ''}`,
    );
    return { code, body: { ok: code === EXIT.ok, status: 'retried', attempted: results.length, ...tally, pendingLeft: left, results } };
  } finally {
    releaseRetryLock();
  }
}

function pendingRow(e) {
  return {
    requestKey: e.requestKey,
    kind: e.kind ?? 'register',
    domain: e.summary?.domain ?? null,
    reviewId: e.summary?.reviewId ?? null,
    itemId: e.summary?.itemId ?? null,
    url: e.summary?.url ?? null,
    useId: e.summary?.useId ?? null,
    base: e.base ?? null,
    notedAt: e.notedAt ?? null,
    attempts: e.attempts ?? 0,
    lastError: e.lastError ?? null,
    lastAttemptAt: e.lastAttemptAt ?? null,
    createdAt: e.createdAt ?? null,
  };
}

function cmdPending(flags) {
  allowOnly(flags, []);
  const pending = listQueue(P.pending).map(pendingRow);
  const rejected = listQueue(P.rejected).map((e) => ({
    ...pendingRow(e),
    reason: e.reason ?? null,
    reasonKo: e.reasonKo ?? null,
    supersededBy: e.supersededBy ?? null,
    serverSupersededBy: e.serverSupersededBy ?? null,
    opId: typeof e.opId === 'string' ? e.opId : null,
    receiptUseId: typeof e.useId === 'string' ? e.useId : null,
    httpStatus: e.httpStatus ?? null,
    /* 옛 판이 그대로 적어 둔 서버 칸 이름도 다시 가린다 */
    issues: cleanIssues(e.issues),
  }));
  const fixtureReceipts = listQueue(P.fixtureReceipts).length;
  const oldest = pending.length ? pending[0] : null;
  if (pending.length) say(`이 컴퓨터의 대기 ${pending.length}건이 아직 중앙에 등록되지 않았어요. 로그인을 확인한 뒤 retry 해 주세요.`);
  return {
    code: EXIT.ok,
    body: { ok: true, status: 'listed', stateDir: STATE, count: pending.length, oldest: oldest?.createdAt ?? null, oldestRequestKey: oldest?.requestKey ?? null, pending, rejectedCount: rejected.length, rejected, fixtureReceipts },
  };
}

async function cmdDiscard(key, flags) {
  allowOnly(flags, ['reason']);
  if (typeof key !== 'string' || !REQUEST_KEY.test(key)) usage('discard 뒤에 요청 번호(requestKey)를 넣어 주세요. pending 으로 볼 수 있어요.');
  const why = reasonIssue(flags.reason);
  if (why) finish(EXIT.invalid, { ok: false, status: 'invalid', message: why });
  if (retryLockHeld()) finish(EXIT.pending, BUSY);
  const moved = await withLock(async () => {
    const cur = readJsonFile(pendingFile(key));
    if (!cur) return null;
    rejectLocked(cur, { reason: 'discarded', reasonKo: flags.reason.trim(), message: '사람이 보내지 않기로 했어요.' });
    return cur;
  });
  if (!moved) finish(EXIT.invalid, { ok: false, status: 'not-found', requestKey: key, message: '그 요청 번호의 대기가 없어요. pending 으로 확인해 주세요.' });
  say('대기를 보내지 않고 rejected(discarded)로 옮겼어요. 등록된 것이 아니에요.');
  return { code: EXIT.ok, body: { ok: true, status: 'discarded', requestKey: key, kind: moved.kind ?? 'register', base: moved.base ?? null } };
}

async function cmdStatus(flags) {
  allowOnly(flags, []);
  const session = loadSession();
  let server = null;
  if (session) {
    const v = await verifySession(session.base, session.session);
    if (v.ok) {
      let apiVersion = v.apiVersion;
      /* 요약 응답에 판이 없으면 목록 응답에서 한 번 더 본다(판을 목록에만 싣는 서버) */
      if (apiVersion === null) {
        const r = await http(`${session.base}${API_PATH}`, { headers: authHeaders(session.session) });
        if (r.kind === 'response' && r.status === 200 && r.json?.ok === true) apiVersion = apiVersionOf(r.json);
      }
      server = { ok: true, store: v.store, central: v.store === CENTRAL, apiVersion, auditSupported: (apiVersion ?? 0) >= AUDIT_API_VERSION, counts: v.counts, viewerLabel: v.label };
      if (v.store !== CENTRAL) say(`주의: 이 서버의 저장소는 '${v.store ?? '모름'}' 이에요. 여기 등록은 중앙 등록이 아니에요.`);
      if (!server.auditSupported) say(`이 서버의 목록 판은 ${apiVersion ?? '없음'} 이라 검수자별 audit 을 할 수 없어요(apiVersion ${AUDIT_API_VERSION} 이상이 필요해요).`);
    } else server = { ok: false, error: v.lastError, message: v.message };
  }
  const pendingList = listQueue(P.pending);
  const rejected = listQueue(P.rejected).length;
  const fixtureReceipts = listQueue(P.fixtureReceipts).length;
  const code = session && server?.ok ? EXIT.ok : EXIT.pending;
  if (pendingList.length) say(`이 컴퓨터의 대기 ${pendingList.length}건이 아직 중앙에 등록되지 않았어요. retry 해 주세요.`);
  return {
    code,
    body: {
      ok: code === EXIT.ok,
      status: 'status',
      stateDir: STATE,
      perMachine: true,
      base: session?.base ?? null,
      loopback: session ? isLoopbackBase(session.base) : null,
      sessionSaved: !!session,
      savedAt: session?.savedAt ?? null,
      viewerLabel: server?.ok ? server.viewerLabel : (session?.viewerLabel ?? null),
      store: server?.ok ? server.store : null,
      central: server?.ok ? server.central : null,
      apiVersion: server?.ok ? server.apiVersion : null,
      auditSupported: server?.ok ? server.auditSupported : false,
      server,
      pending: pendingList.length,
      oldestPending: pendingList[0]?.createdAt ?? null,
      rejected,
      fixtureReceipts,
      retryRunning: retryLockHeld(),
    },
  };
}

/* ───────── audit ───────── */

const LIST_LIMIT = 500;

/*
 * 글 속 링크 찾기(R2 원장 · 빠뜨리지 않기) — 칸 전체가 링크인 글자와 문장 속 링크에 같은 규칙 하나를 쓴다.
 *  1. 후보: http(s):// 부터 빈칸 · 따옴표 · 꺾쇠 앞까지(한글 등에서 끊지 않는다 — 이어지면 아래 4 로 알린다).
 *  2. 붙여 쓴 링크: 후보 안에서 , ; ( ) 바로 뒤에 다시 http(s):// 가 오면 거기서 떼어 따로 본다
 *     (…/1/,https://drive… 를 링크 하나로 보지 않는다). / 뒤의 링크(web.archive.org/web/<때>/https://…)는 떼지 않는다.
 *  3. 링크는 주소에 쓰는 ASCII 글자까지. 끝에 붙은 문장 부호(. , ; : ! ?)와 짝 없는 닫는 괄호는 뗀다.
 *  4. ASCII 글자 바로 뒤에 한글 같은 ASCII 가 아닌 글자가 이어지면(한글 경로 · 붙은 조사 · 한글 사이트 이름) 어디까지가 링크인지
 *     알 수 없다 — 잘린 링크를 '빠짐'으로 내지 않고 '모호(ambiguous_in_text)'로 건너뛴다(지문만). 단 그 사이에 3 의 문장 부호가
 *     있었거나(…/x).를 · …/x.에서) 한·중·일 닫는 부호(。 、 ） 」 등)가 오면 거기가 끝이다.
 *  5. https:// 없이 적은 학술 출처(pubmed.ncbi.nlm.nih.gov/… · pmc.ncbi.nlm.nih.gov/articles/… · www.ncbi.nlm.nih.gov/pmc/… ·
 *     doi.org/10.… · dx.doi.org/10.… · europepmc.org/…)도 https:// 를 붙여 인용으로 센다(schemeless: true).
 */
const LINK_CANDIDATE = /https?:\/\/[^\s"'<>]*/giu;
const ASCII_URL_RUN = /^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%()]*/i;
const CJK_CLOSE = /^[。、，．：；！？）」』】〕〉》”’…]/u;
const SCHEMELESS_SCHOLARLY = /(?<![A-Za-z0-9._~%/@:+-])(?:pubmed\.ncbi\.nlm\.nih\.gov\/|pmc\.ncbi\.nlm\.nih\.gov\/articles\/|www\.ncbi\.nlm\.nih\.gov\/pmc\/|(?:dx\.)?doi\.org\/10\.|europepmc\.org\/)/giu;
const AMBIGUOUS_TEXT =
  '링크 바로 뒤에 한글 같은 글자가 붙어 있거나 사이트 이름에 한글이 있어 링크가 어디까지인지 알 수 없어요. 링크만 띄어 써서 따로 적거나(붙은 말과 띄우기), 한글이 든 주소는 퍼센트 인코딩(%EC… 모양)한 링크로 적어 주세요.';

/** 붙여 쓴 링크 떼기: , ; ( ) 바로 뒤의 http(s):// 에서 자른다(앞 조각 끝의 , ; ( 는 뗀다 — ) 는 괄호 짝 맞추기에 맡김) */
function splitJoined(token) {
  const cuts = [];
  for (const m of token.matchAll(/https?:\/\//gi)) if (m.index > 0 && ',;()'.includes(token[m.index - 1])) cuts.push(m.index);
  if (!cuts.length) return [token];
  const out = [];
  let start = 0;
  for (const c of cuts) {
    out.push(token.slice(start, c).replace(/[,;(]+$/, ''));
    start = c;
  }
  out.push(token.slice(start));
  return out;
}

/** 끝에 붙은 문장 부호 · 짝 없는 닫는 괄호 떼기 */
function trimTail(text) {
  let u = text;
  for (;;) {
    const last = u.slice(-1);
    if ('.,;:!?'.includes(last) && last) u = u.slice(0, -1);
    else if (last === ')' && u.split('(').length < u.split(')').length) u = u.slice(0, -1);
    else if (last === ']' && u.split('[').length < u.split(']').length) u = u.slice(0, -1);
    else return u;
  }
}

/**
 * 조각 하나 → { url, end } · { ambiguous: true, end } · { end }(링크 아님). end 는 조각 앞에서 읽은 ASCII 주소 글자 수 —
 * 그 뒤에 남은 글자는 readAll 이 다시 훑는다(거기서 또 http(s):// 가 나오면 따로 읽는다).
 */
function readPiece(piece) {
  const run = ASCII_URL_RUN.exec(piece)?.[0] ?? '';
  const end = Math.max(run.length, 1);
  if (!run) return { end };
  const url = trimTail(run);
  const rest = piece.slice(run.length);
  const hasHost = /^https?:\/\/[^/?#]/i.test(url);
  if (!rest) return hasHost ? { url, end } : { end };
  /* ASCII 글자(| { } ^ ` \ 등)에서 끊긴 것은 예전처럼 거기까지를 링크로 */
  if (/^[\x00-\x7f]/.test(rest)) return hasHost ? { url, end } : { end };
  /* 사이트 이름이 끝나기 전에 ASCII 가 아닌 글자 — 한글 사이트 이름이거나 이름 바로 뒤에 붙은 말 */
  if (!/^https?:\/\/[^/?#]+[/?#]/i.test(run)) return { ambiguous: true, end };
  if (CJK_CLOSE.test(rest) || url.length < run.length) return hasHost ? { url, end } : { end };
  return { ambiguous: true, end };
}

/**
 * 조각 하나를 끝까지 읽는다. 앞 링크를 읽은 뒤 남은 글자에 http(s):// 가 또 있으면(| \ ^ { ` 、 。 ） 한글 등으로 붙여 쓴 링크)
 * 거기서부터 다시 읽는다 — 앞 링크에서 멈추고 뒤 링크를 버리면 감사가 '빠짐 없음'으로 끝나 버린다(R2 빠뜨리지 않기).
 * spans 에는 실제로 읽은 주소 글자의 자리만 넣는다(그 밖의 https:// 없는 학술 출처는 linksIn 이 따로 찾는다).
 */
function readAll(piece, at, whole, out, spans) {
  let p = piece;
  let pos = at;
  for (;;) {
    const r = readPiece(p);
    const rest = p.slice(r.end);
    const k = rest.search(/https?:\/\//i);
    if (r.url || r.ambiguous) {
      spans.push([pos, pos + r.end]);
      out.push(r.ambiguous ? { raw: k < 0 ? p : p.slice(0, r.end + k), ambiguous: true, whole } : { raw: r.url, whole });
    }
    if (k < 0) return;
    pos += r.end + k;
    p = rest.slice(k);
  }
}

/**
 * 글자 하나에서 링크를 모은다 → [{ raw, whole?, schemeless?, ambiguous? }]. raw 는 링크(모호하면 기록에 적힌 그 조각 — 지문용).
 * whole: 칸 전체(앞뒤 빈칸 뺌)가 그 링크 후보 하나였음.
 */
function linksIn(text) {
  const out = [];
  const t = text.trim();
  const spans = [];
  for (const m of text.matchAll(LINK_CANDIDATE)) {
    const whole = m[0] === t;
    let from = 0;
    for (const piece of splitJoined(m[0])) {
      const at = Math.max(m[0].indexOf(piece, from), from);
      from = at + piece.length;
      readAll(piece, m.index + at, whole, out, spans);
    }
  }
  for (const m of text.matchAll(SCHEMELESS_SCHOLARLY)) {
    if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const token = /^[^\s"'<>]*/u.exec(text.slice(m.index))?.[0] ?? '';
    const piece = splitJoined(`https://${token}`)[0];
    const r = readPiece(piece);
    if (!r.url && !r.ambiguous) continue;
    const whole = token === t;
    out.push(r.ambiguous ? { raw: piece.slice('https://'.length), ambiguous: true, whole } : { raw: r.url, schemeless: true, whole });
  }
  return out;
}

/**
 * 검수 기록 한 줄에서 인용한 링크 글자를 모은다(linksIn 규칙 하나 — 칸 전체가 링크인 것과 문장 속 링크(inText: true) 모두).
 * catalog_url 과 'canonical_local_record' 출처 표시는 뺀다. http 링크도 모아 '등록할 수 없는 인용'으로 센다.
 * 돌려주는 자리(field)는 키 · 번호만으로 만든다(값을 넣지 않는다).
 */
function collectCited(v, field, key, out) {
  if (key === 'catalog_url') return;
  if (typeof v === 'string') {
    for (const l of linksIn(v)) out.push({ field, raw: l.raw, ...(l.whole ? {} : { inText: true }), ...(l.schemeless ? { schemeless: true } : {}), ...(l.ambiguous ? { ambiguous: true } : {}) });
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => collectCited(x, `${field}[${i}]`, key, out));
    return;
  }
  if (isObj(v)) {
    if (key === 'source' && v.source_id === 'canonical_local_record') return;
    for (const [k, x] of Object.entries(v)) collectCited(x, field ? `${field}.${safeKey(k)}` : safeKey(k), k, out);
  }
}

/**
 * 검수 기록 폴더 이름 → 검수자. 김민 기록은 docs/reviews/handoff/<분야>/min/ 에 둔다(handoff README) — 검수자 이름은 kimmin.
 * 표에 없는 폴더 이름은 그대로 두어 옵션과 다르면 막는다.
 */
const FOLDER_REVIEWER = { yunho: 'yunho', min: 'kimmin', kimmin: 'kimmin' };

/** --records 경로의 .../handoff/<분야>/<검수자 폴더>/... 자리. 알아볼 수 있는 이름이 하나라도 있으면 돌려준다 */
function handoffScopesOf(file) {
  const out = [];
  const parts = file.split(path.sep);
  for (let i = 0; i + 2 <= parts.length - 2; i++) {
    if (parts[i] !== 'handoff') continue;
    const d = parts[i + 1];
    const folder = parts[i + 2];
    const r = Object.hasOwn(FOLDER_REVIEWER, folder) ? FOLDER_REVIEWER[folder] : folder;
    if (DOMAINS.includes(d) || REVIEWERS.includes(r)) out.push({ domain: d, reviewer: r });
  }
  return out;
}

const shownName = (v, list) => (list.includes(v) ? v : '(알 수 없는 이름)');

function viewerNote(viewerLabel, reviewer) {
  return `로그인한 계정은 '${viewerLabel ?? '이름 없음'}' 이에요. 지금 등록 쓰임은 이 계정이 등록한 것만, 과거 기록 쓰임은 ${reviewer} 것만 등록으로 셌어요. 이 계정이 ${reviewer} 본인인지는 도구가 확인할 수 없으니 직접 확인해 주세요.`;
}

async function cmdAudit(flags) {
  allowOnly(flags, ['records', 'domain', 'review', 'reviewer', 'fixture-ok']);
  if (!flags.records) usage('--records <video-records.json> 이 필요해요.');
  if (!DOMAINS.includes(flags.domain)) usage('--domain 은 exercise 또는 mechanics 예요.');
  if (!REVIEWERS.includes(flags.reviewer)) usage(`--reviewer 는 ${REVIEWERS.join(' 또는 ')} 예요. 이 검수 기록을 쓴 검수자를 넣어 주세요.`);
  if (flags.review !== undefined && !ID_PATTERN.test(flags.review)) usage('--review 번호 모양이 맞지 않아요(영문 · 숫자 · . _ : -).');
  const domain = flags.domain;
  const reviewer = flags.reviewer;
  const review = flags.review ?? null;
  const session = loadSession();
  const fixtureOk = requireFixtureOk(flags, session);

  /* 검수 기록 폴더 이름과 옵션이 다르면 다른 사람 · 다른 분야의 기록을 이 검수자 것으로 셀 수 있다 — 쓰는 법 오류로 막는다 */
  const resolved = path.resolve(flags.records);
  let real = null;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    real = null;
  }
  for (const sc of [...handoffScopesOf(resolved), ...(real ? handoffScopesOf(real) : [])]) {
    if (sc.domain !== domain || sc.reviewer !== reviewer)
      usage(`--records 가 검수 기록 폴더 handoff/${shownName(sc.domain, DOMAINS)}/${shownName(sc.reviewer, REVIEWERS)} 에 있어요. --domain · --reviewer 를 그 폴더와 맞춰 주세요.`);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch {
    finish(EXIT.invalid, { ok: false, status: 'invalid', message: '--records 파일을 읽지 못했거나 JSON 모양이 맞지 않아요.' });
  }
  const records = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.records) ? data.records : null;
  if (!records) finish(EXIT.invalid, { ok: false, status: 'unsupported', message: '지원하지 않는 검수 기록 모양이에요. 목록이거나 { records: [...] } 모양이어야 해요. 확인을 하지 않았어요.' });

  const cited = new Map(); // `${reviewId}\n${norm}` → { reviewId, href, recordIndex, field }
  const skipped = [];
  const ignored = [];
  let recognized = 0;
  /*
   * { records: [...] } 모양이면 records 밖의 칸(catalog_url 빼고)도 훑는다. 거기 적힌 링크는 어느 검수의 인용인지 알 수 없다 —
   * 빠뜨리고 '다 확인함'이라 하지 않게 알아볼 수 없는 것(ignored · outside_records)으로 세어 incomplete 로 만든다(칸 이름 · 수만).
   */
  if (!Array.isArray(data)) {
    for (const [k, x] of Object.entries(data)) {
      if (k === 'records' || k === 'catalog_url') continue;
      const found = [];
      collectCited(x, safeKey(k), k, found);
      if (!found.length) continue;
      for (const f of found) hideRaw(f.raw);
      ignored.push({
        recordIndex: null,
        field: safeKey(k),
        code: 'outside_records',
        message: 'records 목록 밖의 칸에 링크가 있어 어느 검수(review_id)의 인용인지 알 수 없어요. 그 링크를 해당 검수 기록 줄 안으로 옮겨 주세요.',
        citedStrings: found.length,
      });
    }
  }
  let inScope = 0;
  records.forEach((rec, recordIndex) => {
    if (!isObj(rec)) {
      ignored.push({ recordIndex, code: 'not_object', message: '기록 한 줄이 묶음(객체)이 아니에요.', citedStrings: 0 });
      return;
    }
    const rid = rec.review_id;
    if (typeof rid !== 'string' || !ID_PATTERN.test(rid)) {
      const found = [];
      for (const [k, x] of Object.entries(rec)) collectCited(x, safeKey(k), k, found);
      for (const f of found) hideRaw(f.raw);
      ignored.push({
        recordIndex,
        code: typeof rid === 'string' ? 'invalid_review_id' : 'missing_review_id',
        message: typeof rid === 'string' ? 'review_id 모양이 서버 검수 번호 규칙(영문 · 숫자 · . _ : -, 120자까지)과 맞지 않아요.' : 'review_id 가 없어 어느 검수인지 알 수 없어요.',
        citedStrings: found.length,
      });
      return;
    }
    recognized++;
    if (review && rid !== review) return;
    inScope++;
    const found = [];
    for (const [k, x] of Object.entries(rec)) collectCited(x, safeKey(k), k, found);
    for (const f of found) {
      if (f.ambiguous) {
        hideRaw(f.raw);
        skipped.push({ reviewId: rid, recordIndex, field: f.field, ...(f.inText ? { inText: true } : {}), code: 'ambiguous_in_text', message: AMBIGUOUS_TEXT, fingerprint: fingerprintOf(f.raw) });
        continue;
      }
      const c = checkEvidenceUrl(f.raw);
      if (!c.ok) {
        hideRaw(f.raw);
        skipped.push({ reviewId: rid, recordIndex, field: f.field, ...(f.inText ? { inText: true } : {}), ...(f.schemeless ? { schemeless: true } : {}), code: c.reason, message: c.message, fingerprint: fingerprintOf(f.raw) });
        continue;
      }
      const key = `${rid}\n${c.normalized}`;
      if (!cited.has(key)) cited.set(key, { reviewId: rid, href: c.href, recordIndex, field: f.field, inText: !!f.inText, schemeless: !!f.schemeless });
    }
  });
  if (!recognized)
    finish(EXIT.invalid, {
      ok: false,
      status: 'unsupported',
      message: '알아볼 수 있는 검수 기록(review_id 가 있는 줄)이 하나도 없어요. 확인을 하지 않았어요.',
      records: { total: records.length, recognized: 0, inScope: 0, ignored: ignored.length },
      ignoredRecords: ignored.length,
      ignored: ignored.slice(0, LIST_LIMIT),
    });
  if (review && !inScope)
    finish(EXIT.invalid, { ok: false, status: 'review-not-found', message: '--review 번호의 검수 기록이 이 파일에 없어요. 확인을 하지 않았어요.', records: { total: records.length, recognized, inScope: 0, ignored: ignored.length } });

  const outsideRecords = ignored.filter((x) => x.code === 'outside_records').length;
  const ambiguousCount = skipped.filter((x) => x.code === 'ambiguous_in_text').length;
  const local = {
    records: { total: records.length, recognized, inScope, ignored: ignored.length, outsideRecords },
    cited: cited.size,
    schemelessCited: [...cited.values()].filter((c) => c.schemeless).length,
    skippedCount: skipped.length,
    ambiguousCount,
    skipped: skipped.slice(0, LIST_LIMIT),
    ignoredRecords: ignored.length,
    ignored: ignored.slice(0, LIST_LIMIT),
  };
  const scopeOf = (viewerLabel) => ({ reviewer, domain, review, viewerLabel, matchedBy: ['live:mine', `historical:${reviewer}`] });

  if (!session) finish(EXIT.pending, { ok: false, status: 'no-session', message: '로그인이 없어 중앙 목록과 맞춰 볼 수 없어요. login 뒤 다시 해 주세요.', scope: scopeOf(null), ...local });
  const r = await http(`${session.base}${API_PATH}`, { headers: authHeaders(session.session) });
  if (r.kind !== 'response' || r.status !== 200 || r.json?.ok !== true || !Array.isArray(r.json.sources)) {
    const f = describeFailure(r);
    finish(EXIT.pending, { ok: false, status: 'unavailable', error: f.lastError, message: `중앙 목록을 읽지 못했어요. ${f.message}`, scope: scopeOf(session.viewerLabel ?? null), ...local });
  }
  const viewerLabel = typeof r.json.viewer?.label === 'string' ? r.json.viewer.label : null;
  const apiVersion = apiVersionOf(r.json);
  const store = typeof r.json.store === 'string' ? r.json.store : null;
  if ((apiVersion ?? 0) < AUDIT_API_VERSION)
    finish(EXIT.pending, {
      ok: false,
      status: 'server-too-old',
      apiVersion,
      store,
      message: `서버 목록 판이 ${apiVersion ?? '없음'} 이에요. 검수자별 audit 은 목록 apiVersion ${AUDIT_API_VERSION} 이상(EX-REF04 R2 서버 코드: 쓰임별 mine · historicalReviewer)이 배포된 주소에서만 돼요. 누가 등록했는지 가를 수 없어 확인을 멈췄어요.`,
      scope: scopeOf(viewerLabel),
      ...local,
    });

  /* 쓰임 하나가 이 검수자 것인가: 지금 등록은 로그인한 계정의 것(mine), 과거 기록은 그 검수자 이름 */
  const own = new Set();
  const others = new Set();
  const ownWithdrawn = new Set();
  for (const s of r.json.sources) {
    const links = Array.isArray(s?.links) ? s.links.map((l) => normalizeUrl(l ?? '')).filter(Boolean) : [];
    for (const u of Array.isArray(s?.uses) ? s.uses : []) {
      if (!isObj(u) || u.domain !== domain || typeof u.reviewId !== 'string') continue;
      const historical = u.scope === 'historical';
      const mineUse = historical ? u.historicalReviewer === reviewer : u.mine === true;
      const bucket = u.withdrawn ? (mineUse ? ownWithdrawn : null) : mineUse ? own : others;
      if (!bucket) continue;
      const hrefs = [u.href, ...(Array.isArray(u.otherHrefs) ? u.otherHrefs : [])].map((h) => normalizeUrl(h ?? '')).filter(Boolean);
      for (const n of [...hrefs, ...links]) bucket.add(`${u.reviewId}\n${n}`);
    }
  }
  const queued = new Set();
  for (const e of listQueue(P.pending)) {
    if (e.summary?.domain !== domain) continue;
    const n = normalizeUrl(e.summary?.url ?? '');
    if (n) queued.add(`${e.summary.reviewId}\n${n}`);
  }
  const missing = [];
  let matched = 0;
  let pendingLocal = 0;
  let otherReviewerUses = 0;
  let withdrawnOnly = 0;
  for (const [key, c] of cited) {
    const other = others.has(key);
    if (other) otherReviewerUses++;
    if (own.has(key)) {
      matched++;
      continue;
    }
    const q = queued.has(key);
    const w = ownWithdrawn.has(key);
    if (q) pendingLocal++;
    if (w) withdrawnOnly++;
    missing.push({ reviewId: c.reviewId, recordIndex: c.recordIndex, field: c.field, ...(c.inText ? { inText: true } : {}), ...(c.schemeless ? { schemeless: true } : {}), url: c.href, pendingLocal: q, otherReviewerUse: other, withdrawnOnly: w });
  }
  const incomplete = skipped.length > 0 || ignored.length > 0;
  const result = incomplete ? 'incomplete' : missing.length ? 'missing' : 'complete';
  const common = { scope: scopeOf(viewerLabel), apiVersion, store, ...local, pendingLocal, otherReviewerUses, withdrawnOnly, missingCount: missing.length, missing };

  if (store !== CENTRAL) {
    say(`이 서버의 저장소는 '${store ?? '모름'}' 이라 중앙 등록 여부를 확인할 수 없어요. 시험 저장소에서 맞은 ${matched}건은 등록으로 치지 않아요.`);
    if (fixtureOk && store === FIXTURE_LOCAL)
      return { code: EXIT.fixture, body: { ok: false, status: 'fixture-audited', fixture: true, central: false, registered: 0, fixtureMatched: matched, fixtureResult: result, ...common } };
    return { code: EXIT.pending, body: { ok: false, status: 'fixture-only', central: false, registered: 0, fixtureMatched: matched, fixtureResult: result, ...common } };
  }

  const note = viewerNote(viewerLabel, reviewer);
  let message;
  if (result === 'incomplete')
    message =
      `확인을 끝내지 못했어요. 등록할 수 없는 인용 ${skipped.length}건(어디까지가 링크인지 모호 ${ambiguousCount}건) · 알아볼 수 없는 기록 ${ignored.length}건(records 밖 링크 칸 ${outsideRecords}건)이 있어요. ` +
      `skipped · ignored 의 recordIndex · field 자리를 검수 기록에서 찾아 고쳐 주세요(받지 않는 링크 값은 가리고 지문만 보였어요). 빠진 등록 ${missing.length}건(대기열 ${pendingLocal}건). ${note}`;
  else if (result === 'missing') message = `빠진 등록 ${missing.length}건(이 컴퓨터 대기열 ${pendingLocal}건). register 또는 retry 로 채워 주세요. ${note}`;
  else message = `인용 ${cited.size}건 모두 ${reviewer} 검수자의 중앙 등록으로 확인했어요. ${note}`;
  const code = result === 'complete' ? EXIT.ok : EXIT.missing;
  return { code, body: { ok: result === 'complete', status: result, central: true, registered: matched, message, ...common } };
}

/* ───────── import ───────── */

async function cmdImport(flags) {
  allowOnly(flags, ['manifest', 'from-chunk']);
  if (!flags.manifest) usage('--manifest <파일> 이 필요해요.');
  const from = flags['from-chunk'] === undefined ? 0 : Number(flags['from-chunk']);
  if (!Number.isInteger(from) || from < 0) usage('--from-chunk 는 0 이상의 정수예요.');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.resolve(flags.manifest), 'utf8'));
  } catch {
    finish(EXIT.invalid, { ok: false, status: 'invalid', message: '--manifest 파일을 읽지 못했거나 JSON 모양이 맞지 않아요.' });
  }
  const chunks = isObj(manifest) && Array.isArray(manifest.chunks) ? manifest.chunks : null;
  if (!chunks || !chunks.length) finish(EXIT.invalid, { ok: false, status: 'invalid', message: '가져오기 목록에 chunks 가 없어요.' });
  const snapshotId = chunks[0]?.snapshot?.id;
  if (typeof snapshotId !== 'string' || !SNAPSHOT_ID.test(snapshotId) || chunks.some((c) => c?.snapshot?.id !== snapshotId || typeof c?.requestKey !== 'string' || !REQUEST_KEY.test(c.requestKey)))
    finish(EXIT.invalid, { ok: false, status: 'invalid', message: '모든 묶음에 같은 snapshot.id 와 요청 번호(requestKey)가 있어야 해요.' });
  const session = loadSession();
  if (!session) finish(EXIT.pending, { ok: false, status: 'no-session', message: '로그인이 없어요. login 뒤 다시 해 주세요.' });

  const logFile = path.join(P.imports, `${snapshotId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
  const log = readJsonFile(logFile) ?? { snapshotId, base: session.base, chunks: {} };
  if (log.base !== session.base) finish(EXIT.pending, { ok: false, status: 'base-mismatch', message: '이 가져오기는 다른 주소에서 시작했어요. 그 주소로 로그인해 주세요.' });
  if (!isObj(log.chunks)) log.chunks = {};

  /* 건너뛰는 것은 요청 번호 · 본문 글자의 sha256 · 저장소(central)가 모두 같을 때만 — 내용이 바뀐 묶음은 다시 보낸다(서버가 409 로 알려 준다) */
  const bodies = chunks.map((c) => JSON.stringify(c));
  const hashes = bodies.map((b) => sha256(b));
  const confirmedFor = (i) => {
    const d = log.chunks[String(i)];
    return !!d && d.requestKey === chunks[i].requestKey && d.bodySha256 === hashes[i] && d.store === CENTRAL;
  };

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (confirmedFor(i)) {
      results.push({ index: i, status: 'confirmed-before', requestKey: chunk.requestKey });
      continue;
    }
    if (i < from) {
      results.push({ index: i, status: 'not-sent', requestKey: chunk.requestKey });
      continue;
    }
    const bodyText = bodies[i];
    if (Buffer.byteLength(bodyText) > MAX_IMPORT_BYTES) {
      results.push({ index: i, status: 'rejected', error: 'too_large', requestKey: chunk.requestKey });
      continue;
    }
    const r = await http(`${session.base}${IMPORT_PATH}`, { method: 'POST', headers: writeHeaders(session.session), body: bodyText });
    const rc = r.json?.receipt;
    const store = typeof r.json?.store === 'string' ? r.json.store : null;
    const shapeOk = r.kind === 'response' && (r.status === 200 || r.status === 201) && r.json?.ok === true && isObj(rc) && rc.requestKey === chunk.requestKey;
    if (shapeOk && store === CENTRAL && rc.visible === true) {
      log.chunks[String(i)] = { requestKey: chunk.requestKey, bodySha256: hashes[i], store, opId: rc.opId ?? null, receivedAt: rc.receivedAt ?? null, records: rc.records ?? null, replayed: !!rc.replayed, confirmedAt: new Date().toISOString() };
      await withLock(async () => writeAtomic(logFile, JSON.stringify(log, null, 2) + '\n'));
      results.push({ index: i, status: rc.replayed ? 'already-imported' : 'imported', store, requestKey: chunk.requestKey, opId: rc.opId ?? null, records: rc.records ?? null });
      say(`묶음 ${i + 1}/${chunks.length} 확인`);
      continue;
    }
    let status = 'pending';
    let error;
    if (shapeOk && store !== CENTRAL) {
      status = 'fixture-only';
      error = 'fixture-only';
    } else if (r.kind === 'response' && (r.status === 200 || r.status === 201) && r.json?.ok === true) error = 'unconfirmed';
    else if (r.kind === 'response' && r.status === 409) {
      status = 'rejected';
      error = 'conflict';
    } else if (r.kind === 'response' && [400, 413, 415].includes(r.status)) {
      status = 'rejected';
      error = r.json?.error ?? `http_${r.status}`;
    } else error = describeFailure(r).lastError;
    results.push({ index: i, status, error, store, requestKey: chunk.requestKey, issues: Array.isArray(r.json?.issues) ? cleanIssues(r.json.issues) : undefined });
    say(`묶음 ${i + 1}/${chunks.length} ${status === 'fixture-only' ? '시험 저장소에만 들어감(등록 아님)' : `실패(${error})`}`);
  }
  const confirmed = chunks.filter((_, i) => confirmedFor(i)).length;
  const all = confirmed === chunks.length;
  const code = all ? EXIT.ok : results.some((x) => x.error === 'conflict') ? EXIT.conflict : results.some((x) => x.status === 'rejected') ? EXIT.invalid : EXIT.pending;
  return { code, body: { ok: all, status: all ? 'imported' : 'incomplete', snapshotId, total: chunks.length, confirmed, results } };
}

/* ───────── check-url ───────── */

function cmdCheckUrl(flags) {
  allowOnly(flags, ['url', 'json']);
  let inputs;
  if (flags.url !== undefined && flags.json === undefined) inputs = [flags.url];
  else if (flags.json !== undefined && flags.url === undefined) {
    const raw = readJsonInput(flags.json);
    if (!Array.isArray(raw) || raw.length > 1000) finish(EXIT.invalid, { ok: false, status: 'invalid', message: '--json 은 링크 글자 목록(1000개까지)이어야 해요.' });
    inputs = raw;
  } else usage('--url 하나 또는 --json 목록 하나를 넣어 주세요.');
  /* 받지 않는 링크는 그대로 되풀이하지 않는다 — 몇 번째 · 까닭 · 지문만(넣은 차례대로) */
  const results = inputs.map((x, index) => {
    const c = checkEvidenceUrl(x);
    if (c.ok) return { index, ok: true, href: c.href, normalized: c.normalized };
    hideRaw(x);
    return { index, ok: false, reason: c.reason, message: c.message, fingerprint: fingerprintOf(x) };
  });
  const allOk = results.every((r) => r.ok);
  return { code: allOk ? EXIT.ok : EXIT.invalid, body: { ok: allOk, status: 'checked', results } };
}

/* ───────── 시작 ───────── */

const HELP = `쓰는 법: node review-evidence-registrar.mjs <login|logout|register|withdraw|retry|pending|discard|status|audit|import|check-url> [옵션]
끝 번호: 0 됨 · 1 audit 빠짐/끝내지 못함 · 2 충돌 또는 더 새 상태에 밀림(superseded) · 3 값이 틀림/거절/지원하지 않는 기록 · 4 대기 · 5 시험 저장소에만(--fixture-ok) · 64 쓰는 법
상태(세션 · 대기열)는 이 컴퓨터의 것이에요. 다른 맥으로 복사하지 말고 그 맥에서 login 한 뒤 공유한 검수 기록을 보고 다시 register 해 주세요.
자세한 것은 lib/review-evidence/README.md`;

async function main() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 22) usage('Node 22 이상이 필요해요.');
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help') usage(HELP);
  if (cmd === 'discard') {
    const key = rest[0] && !rest[0].startsWith('--') ? rest[0] : undefined;
    return cmdDiscard(key, parseArgs(key ? rest.slice(1) : rest));
  }
  const flags = parseArgs(rest);
  switch (cmd) {
    case 'login':
      return cmdLogin(flags);
    case 'logout':
      return cmdLogout(flags);
    case 'register':
      return cmdRegister(flags);
    case 'withdraw':
      return cmdWithdraw(flags);
    case 'retry':
      return cmdRetry(flags);
    case 'pending':
      return cmdPending(flags);
    case 'status':
      return cmdStatus(flags);
    case 'audit':
      return cmdAudit(flags);
    case 'import':
      return cmdImport(flags);
    case 'check-url':
      return cmdCheckUrl(flags);
    default:
      /* 명령 자리에 링크를 넣었을 수 있어 글자를 되풀이하지 않는다 */
      return usage(`알 수 없는 명령이에요${FLAG_NAME.test(cmd) ? `: ${cmd}` : ''}.\n${HELP}`);
  }
}

let outcome;
try {
  outcome = await main();
} catch (e) {
  if (e instanceof Done) outcome = { code: e.code, body: e.body };
  else outcome = { code: EXIT.pending, body: { ok: false, status: 'error', message: redact(e?.message ?? String(e)) } };
}
if (outcome.body?.message) say(outcome.body.message);
process.stdout.write(redact(JSON.stringify(outcome.body)) + '\n');
process.exitCode = outcome.code;
