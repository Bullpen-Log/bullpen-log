/**
 * 초대 링크의 앞쪽 주소 — 받는 사람에게 보낼 링크는 서버가 설정에서 만든다(2026-11-09 검토 1번).
 * 예전에는 관리 화면이 window.location.origin 을 붙였다. 그러면 localhost · 미리보기 배포 · 앱 웹뷰의 주소가 그대로 받는 사람에게 갈 수 있었다.
 *
 * 차례: INTAKE_PUBLIC_ORIGIN(접수 링크만 따로 정할 때) → NEXT_PUBLIC_SITE_URL → 기본값(lib/site-url.ts 와 같은 https://dugout-baseball.com).
 * 외부에서 열리는 정식 주소만 '보낼 수 있는 링크'다 — https · 기본 포트 · 경로 없음 · 도메인 이름(IP 글자 아님) ·
 *   localhost · .local · .internal · .test 아님 · *.vercel.app 미리보기 아님.
 * *.vercel.app 은 운영 별칭 bullpen-log.vercel.app 하나만 받는다 — 지금 사이트 · 앱이 쓰는 운영 주소라서다. 브랜치 · 배포마다 생기는 미리보기 주소는 막는다
 *   (배포 보호에 걸리거나 곧 사라진다). 정식 링크는 기본값 dugout-baseball.com 을 권한다.
 *
 * 정식이 아닌 주소일 때(개발 .env 의 http://localhost:3000 같은 것):
 *   - 운영(production)이면 초대를 못 만든다 — 준비 안 됨(admin.ts checkIntakeReadiness).
 *   - 그 밖(개발 서버 · 미리보기)이면 만들 수는 있지만, 화면은 '개발용 주소라 보내면 안 돼요'라고 붙이고 '보낼 링크 복사'를 주지 않는다.
 *   만드는 것까지 막지 않은 까닭: 개발 DB 가 운영 DB 와 같아(AGENTS.md) 개발 서버에서 흐름을 시험하는 길을 남긴다. 링크가 새는 길은 표시 · 복사 막기로 닫는다.
 *
 * 순수 함수다 — 환경은 인자로 받는다(시험이 바꿔 끼운다). 브라우저에서는 부르지 않는다.
 */

/** lib/site-url.ts 의 기본값과 같아야 한다 — 시험이 견준다 */
export const DEFAULT_PUBLIC_ORIGIN = 'https://dugout-baseball.com';

/** *.vercel.app 가운데 받는 운영 별칭 — 미리보기 배포 주소는 여기 없다 */
export const ALLOWED_VERCEL_HOSTS: readonly string[] = ['bullpen-log.vercel.app'];

export type LinkOriginEnv = Readonly<Record<string, string | undefined>>;

export type LinkOriginSource = 'INTAKE_PUBLIC_ORIGIN' | 'NEXT_PUBLIC_SITE_URL' | 'default';

/** 정식 주소가 아닌 까닭 — 화면 글은 admin-labels.ts LINK_ORIGIN_PROBLEM_TEXT */
export type LinkOriginProblem = 'unparsable' | 'not_https' | 'has_path' | 'has_port' | 'credentials' | 'ip_literal' | 'local_host' | 'preview_host';

export type LinkOrigin = {
  /** 링크 앞쪽 — 끝 / 없음. 못 읽으면 null(이때는 링크를 못 만든다) */
  origin: string | null;
  source: LinkOriginSource;
  /** 받는 사람에게 보내도 되는 정식 주소인가 */
  external: boolean;
  problem: LinkOriginProblem | null;
  /** 운영 배포인가 — 정식 주소가 아니면 초대를 막는다 */
  strict: boolean;
};

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.test', '.example', '.invalid', '.lan', '.home.arpa'];

/** 호스트가 IP 글자인가 — IPv4 네 마디 · IPv6 대괄호. 정식 링크는 도메인 이름이어야 한다(사설 · 공용 가리지 않고 막는다) */
const isIpLiteral = (host: string) => /^\[.*\]$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);

/** 운영 배포인가 — Vercel 미리보기 · 개발은 아니다. Vercel 밖에서 production 으로 돌면 운영으로 본다(안전한 쪽) */
export function isStrictDeployment(env: LinkOriginEnv): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production';
  return env.NODE_ENV === 'production';
}

/** 주소 하나를 본다 — 정식이면 null, 아니면 까닭 */
export function linkOriginProblem(raw: string): LinkOriginProblem | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'unparsable';
  }
  if (url.protocol !== 'https:') return 'not_https';
  if (url.username || url.password) return 'credentials';
  if (url.port) return 'has_port';
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) return 'has_path';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host)) return 'ip_literal';
  if (host === 'localhost' || !host.includes('.') || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return 'local_host';
  if (host.endsWith('.vercel.app') && !ALLOWED_VERCEL_HOSTS.includes(host)) return 'preview_host';
  return null;
}

/** 설정에서 링크 앞쪽을 고른다 */
export function resolveLinkOrigin(env: LinkOriginEnv): LinkOrigin {
  const explicit = env.INTAKE_PUBLIC_ORIGIN?.trim();
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  const source: LinkOriginSource = explicit ? 'INTAKE_PUBLIC_ORIGIN' : site ? 'NEXT_PUBLIC_SITE_URL' : 'default';
  const raw = (explicit || site || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
  const problem = linkOriginProblem(raw);
  let origin: string | null = null;
  try {
    origin = new URL(raw).origin;
  } catch {
    origin = null;
  }
  return { origin: origin === 'null' ? null : origin, source, external: problem === null, problem, strict: isStrictDeployment(env) };
}

/** 링크 — 토큰은 주소 조각(#)에 싣는다(서버 · 로그 · 미리보기로 안 간다). 앞쪽이 없으면 null */
export function invitationLink(origin: LinkOrigin, token: string): string | null {
  return origin.origin ? `${origin.origin}/submit#${token}` : null;
}
