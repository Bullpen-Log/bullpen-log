/**
 * EX-REF04 — 검수 근거자료의 링크 검사 · 정규화 · 식별자(순수, 서버 · 명령 · 시험이 같이 쓴다).
 *
 * - https 만, 계정(user:pass@) · 포트 · IP 주소 · localhost 같은 내부 이름 · 개인 파일 공유 주소 · 우리 저장소 서명 주소는 거절한다.
 * - 토큰 · 서명 · 세션처럼 보이는 쿼리 값과 '=' · '&' 가 든 # 뒤 값은 거절한다(남의 비밀을 목록에 남기지 않는다).
 * - 링크 안(경로 · 쿼리 · # 뒤, 퍼센트 인코딩을 푼 것 포함)에 든 다른 http(s) 링크도 본다: 그 링크가 따로 왔으면 거절했을 곳
 *   (계정 · IP · 내부 이름 · 개인 파일 공유 · 비공개 저장소, 비밀 쿼리 이름)이면 같은 까닭으로 거절한다. 공개 보관 주소는 받는다.
 * - 서버는 이 주소를 읽지 않는다(SSRF 없음). 여기서는 글자만 본다.
 * - 같은 자료를 가리는 열쇠: 정규화한 주소(url:) 그리고 주소 모양에서 바로 나오는 PubMed · PMC · DOI 번호.
 *   제목이 닮았다는 것으로는 묶지 않는다. 그 밖의 번호 짝(PMC ↔ PMID ↔ DOI)은 공식 서비스로 확인한 값만 묶는다(model.ts).
 */

export const MAX_URL_LENGTH = 2048;

export type UrlRejection =
  | 'not_string'
  | 'too_long'
  | 'unparsable'
  | 'not_https'
  | 'credentials'
  | 'port'
  | 'ip_host'
  | 'internal_host'
  | 'private_file_host'
  | 'bad_host'
  | 'secret_query'
  | 'bad_fragment'
  | 'control_chars';

/** 거절 까닭 → 사람이 읽는 글(값은 담지 않는다) */
export const URL_REJECTION_TEXT: Record<UrlRejection, string> = {
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

/** 내부 · 개발용 이름(끝말). 우리 서비스 주소도 근거 원문이 아니므로 받지 않는다 */
const INTERNAL_SUFFIXES = [
  'localhost',
  'local',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'home.arpa',
  'corp',
  'onion',
  'test',
  'invalid',
  'example',
  'example.com',
  'example.org',
  'example.net',
  'arpa',
  'dugout-baseball.com',
  'bullpen-log.vercel.app',
];

/** 개인 파일 공유 · 비공개 저장소(서명 주소) — 원문 출처가 아니고 비공개 파일일 수 있다 */
const PRIVATE_FILE_SUFFIXES = [
  'supabase.co',
  'supabase.in',
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'dropboxusercontent.com',
  'onedrive.live.com',
  '1drv.ms',
  'sharepoint.com',
  'icloud.com',
  'box.com',
  'wetransfer.com',
  'notion.so',
  'notion.site',
  'amazonaws.com',
  'blob.core.windows.net',
  'storage.googleapis.com',
  'r2.cloudflarestorage.com',
];

/**
 * 이름이 이런 쿼리 값이면 비밀일 수 있다 — 링크 전체를 거절.
 * 이름을 낱말로 쪼개(_ · - · . · 대소문자 경계) 한 낱말이라도 비밀 낱말이면 거절한다(auth_token · sessionToken · X-Auth-Token · accessKey 같은 변형).
 */
const SECRET_WORDS = new Set([
  'token', 'tokens', 'auth', 'authorization', 'authtoken', 'apikey', 'accesskey', 'secretkey', 'privatekey', 'sig', 'signature',
  'session', 'sessionid', 'sid', 'jsessionid', 'phpsessid', 'password', 'passwd', 'pwd', 'secret', 'credential', 'credentials',
  'jwt', 'bearer', 'otp', 'ticket', 'nonce', 'hmac',
]);
/* 흔한 낱말이라 이름 전체가 이것일 때만(OAuth 의 code · state, key · pass) */
const SECRET_EXACT = new Set(['key', 'code', 'state', 'pass']);
const SECRET_PREFIX = /^(x-amz-|x-goog-|x-ms-)/i;
function secretParamName(name: string): boolean {
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
/** 주소 길 안의 세션 값(;jsessionid=… 같은 것) */
const PATH_SESSION = /;\s*(jsessionid|sid|session|sessionid|phpsessid|token)\s*=/i;

/** 추적용 쿼리 — 같은 자료를 가리는 열쇠에서만 뺀다(보여 주는 링크에서도 뺀다) */
const TRACKING_PARAM = /^(utm_[a-z_]*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hs[a-z]*|ref_src|si|feature|share|from)$/i;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;

function hasSuffix(host: string, list: readonly string[]): boolean {
  return list.some((s) => host === s || host.endsWith('.' + s));
}

export type CheckedUrl = {
  ok: true;
  /** 보여 주고 여는 링크 — 추적 값 · # 를 뺀 https 주소 */
  href: string;
  /** 같은 자료를 가리는 열쇠(쿼리 정렬 · 끝 / 제거 · www 그대로) */
  normalized: string;
  host: string;
};

export function checkEvidenceUrl(raw: unknown): CheckedUrl | { ok: false; reason: UrlRejection } {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'not_string' };
  const text = raw.trim();
  if (text.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };
  if (CONTROL.test(text)) return { ok: false, reason: 'control_chars' };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: 'unparsable' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  /* 'https://@host' 처럼 빈 계정도 거절 — 주소의 이름 부분(첫 / · ? · # 앞)에 @ 가 있으면 */
  const authority = /^https:[/\\]*([^/\\?#]*)/i.exec(text)?.[1] ?? '';
  if (u.username || u.password || authority.includes('@')) return { ok: false, reason: 'credentials' };
  /* 기본 포트(443)는 URL 이 지운다 — 남아 있으면 다른 포트 */
  if (u.port) return { ok: false, reason: 'port' };
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || host.includes(':') || IPV4.test(host)) return { ok: false, reason: 'ip_host' };
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((l) => !LABEL.test(l)) || !/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(labels[labels.length - 1]))
    return { ok: false, reason: hasSuffix(host, INTERNAL_SUFFIXES) ? 'internal_host' : 'bad_host' };
  /* 끝이 숫자인 이름(0x7f.1 같은 것)은 위 TLD 검사에서 걸린다 */
  if (hasSuffix(host, INTERNAL_SUFFIXES)) return { ok: false, reason: 'internal_host' };
  if (hasSuffix(host, PRIVATE_FILE_SUFFIXES)) return { ok: false, reason: 'private_file_host' };
  const inner = embeddedRejection(u);
  if (inner) return { ok: false, reason: inner };

  if (PATH_SESSION.test(u.pathname) || PATH_SESSION.test(decodeSafe(u.pathname))) return { ok: false, reason: 'secret_query' };
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    if (secretParamName(k)) return { ok: false, reason: 'secret_query' };
    if (TRACKING_PARAM.test(k)) continue;
    kept.push([k, v]);
  }
  if (u.hash) {
    const frag = u.hash.slice(1);
    if (/[=&]/.test(frag) || frag.length > 120) return { ok: false, reason: 'bad_fragment' };
  }

  const shown = new URL(u.href);
  shown.hash = '';
  shown.search = '';
  for (const [k, v] of kept) shown.searchParams.append(k, v);
  shown.hostname = host;

  const norm = new URL(shown.href);
  norm.search = '';
  for (const [k, v] of [...kept].sort((a, b) => (a[0] === b[0] ? cmp(a[1], b[1]) : cmp(a[0], b[0])))) norm.searchParams.append(k, v);
  let path = norm.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');
  norm.pathname = path || '/';

  return { ok: true, href: shown.href, normalized: norm.href, host };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 링크 안(경로 · 쿼리 · # 뒤)에 든 다른 http(s) 링크 — 쉼표 등으로 붙여 쓴 두 링크(…/1/,https://drive…)나 넘김 주소 안의 링크.
 * 그 안쪽 링크가 따로 왔으면 거절했을 곳(계정 정보 · IP 주소 · 내부 이름 · 개인 파일 공유 · 비공개 저장소)이거나 쿼리에 비밀 값 이름이 있으면
 * 같은 까닭으로 거절한다. 공개 사이트를 가리키는 안쪽 링크(web.archive.org/web/<때>/https://… 같은 보관 주소)는 받는다.
 * 퍼센트 인코딩(https%3A%2F%2F…)은 세 번까지 풀어 본다.
 */
const EMBEDDED_SCHEME = /https?:[/\\]{1,2}/gi;
function embeddedRejection(u: URL): UrlRejection | null {
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

/** 한 번 풀기 — 깨진 % 가 있어도 나머지 조각은 푼다 */
function decodeParts(text: string): string {
  return text.replace(/(%[0-9A-Fa-f]{2})+/g, (run) => decodeSafe(run));
}

function scanEmbedded(text: string): UrlRejection | null {
  for (const m of text.matchAll(EMBEDDED_SCHEME)) {
    const start = (m.index ?? 0) + m[0].length;
    const authority = /^[^/\\?#\s]*/.exec(text.slice(start))?.[0] ?? '';
    if (!authority) continue;
    if (authority.includes('@')) return 'credentials';
    let inner: URL;
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
    let whole: URL | null = null;
    try {
      whole = new URL(rest.replace(/^https?:[/\\]{1,2}/i, 'https://'));
    } catch {
      whole = null;
    }
    if (whole) for (const k of whole.searchParams.keys()) if (secretParamName(k)) return 'secret_query';
  }
  return null;
}

/* ───────── 번호(식별자) ───────── */

export type IdentifierKind = 'pmid' | 'pmcid' | 'doi';
export type Identifiers = { pmid?: string; pmcid?: string; doi?: string };

const PMID = /^[1-9]\d{0,9}$/;
const PMCID = /^PMC[1-9]\d{0,9}$/;
/* DOI: 10.<접두>/<접미> — 접미에 공백 · 따옴표 · 꺾쇠 없음 */
const DOI = /^10\.\d{4,9}\/[^\s"<>]{1,250}$/;

export function cleanPmid(v: unknown): string | null {
  if (typeof v === 'number' && Number.isInteger(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^pmid:\s*/i, '');
  return PMID.test(s) ? s : null;
}

export function cleanPmcid(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim().toUpperCase();
  if (/^\d+$/.test(s)) s = 'PMC' + s;
  return PMCID.test(s) ? s : null;
}

export function cleanDoi(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  s = s.toLowerCase();
  return DOI.test(s) ? s : null;
}

/**
 * 주소 모양에서 바로 나오는 번호 — 공식 사이트의 고정된 주소 꼴만 본다(출판사 주소 안의 10.xxxx 는 추측하지 않는다).
 * - pubmed.ncbi.nlm.nih.gov/<PMID> · www.ncbi.nlm.nih.gov/pubmed/<PMID>
 * - pmc.ncbi.nlm.nih.gov/articles/PMC… · www.ncbi.nlm.nih.gov/pmc/articles/PMC… · europepmc.org/article/PMC/PMC…
 * - doi.org/<DOI> · dx.doi.org/<DOI>
 */
export function identifiersFromUrl(checked: Pick<CheckedUrl, 'href' | 'host'>): Identifiers {
  const u = new URL(checked.href);
  const parts = u.pathname.split('/').filter(Boolean);
  const host = checked.host;
  const out: Identifiers = {};
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

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 열쇠 글자 — 묶기 · 번호 만들기에 쓴다 */
export const identifierKey = (kind: IdentifierKind, value: string) => `${kind}:${value}`;
export const urlKey = (normalized: string) => `url:${normalized}`;
