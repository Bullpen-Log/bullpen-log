/**
 * 구속 측정 탐색기의 주소 — 어느 폴더를 보고 있나.
 *
 *   /admin/velocity                         구속 측정(맨 위) — 연도 폴더들
 *   /admin/velocity?at=2026                 2026년 — 월 폴더들
 *   /admin/velocity?at=2026-09              9월 — 날짜 폴더들
 *   /admin/velocity?at=2026-09-28           28일 — 세션 폴더들
 *   /admin/velocity?at=2026-09-28&s=<id>    세션 — 공 파일들
 *   … &pick=<공 id>                         그 파일을 골라 미리보기에 연다
 *
 * 주소에 담아 두므로 뒤로 · 앞으로 · 새로고침 · 링크 공유가 그대로 된다. 서버(page.tsx)와
 * 브라우저(explorer.tsx)가 같이 쓴다.
 */

export type ExplorerPath =
  | { level: 'root' }
  | { level: 'year'; year: string }
  | { level: 'month'; year: string; month: string }
  | { level: 'day'; year: string; month: string; date: string }
  | { level: 'session'; year: string; month: string; date: string; sessionId: string };

const ROOT: ExplorerPath = { level: 'root' };

/** 2월 31일 같은 날짜를 걸러낸다 — 되돌려 찍어 같은지 본다 */
function isRealDate(date: string) {
  const at = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === date;
}

/** 주소의 at · s 를 읽는다. 알아볼 수 없으면 맨 위로 */
export function parseExplorerPath(
  at?: string | null,
  sessionId?: string | null
): ExplorerPath {
  const v = (at ?? '').trim();
  if (/^\d{4}$/.test(v)) return { level: 'year', year: v };
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v))
    return { level: 'month', year: v.slice(0, 4), month: v };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && isRealDate(v)) {
    const base = { year: v.slice(0, 4), month: v.slice(0, 7), date: v };
    if (sessionId && /^[A-Za-z0-9-]{1,64}$/.test(sessionId)) {
      return { level: 'session', ...base, sessionId };
    }
    return { level: 'day', ...base };
  }
  return ROOT;
}

/** 그 폴더의 주소 — pick 을 주면 그 파일을 골라 연다 */
export function explorerHref(path: ExplorerPath, pick?: string | null): string {
  const q = new URLSearchParams();
  if (path.level === 'year') q.set('at', path.year);
  else if (path.level === 'month') q.set('at', path.month);
  else if (path.level === 'day' || path.level === 'session') q.set('at', path.date);
  if (path.level === 'session') q.set('s', path.sessionId);
  if (pick) q.set('pick', pick);
  const s = q.toString();
  return s ? `/admin/velocity?${s}` : '/admin/velocity';
}

/** 한 칸 위 폴더 */
export function parentOf(path: ExplorerPath): ExplorerPath {
  switch (path.level) {
    case 'session':
      return { level: 'day', year: path.year, month: path.month, date: path.date };
    case 'day':
      return { level: 'month', year: path.year, month: path.month };
    case 'month':
      return { level: 'year', year: path.year };
    default:
      return ROOT;
  }
}

/** 맨 위부터 지금까지 — 주소 줄(구속 측정 › 2026년 › 9월 › 28일 …)에 쓴다 */
export function ancestorsOf(path: ExplorerPath): ExplorerPath[] {
  const out: ExplorerPath[] = [];
  for (let p: ExplorerPath = path; ; p = parentOf(p)) {
    out.unshift(p);
    if (p.level === 'root') break;
  }
  return out;
}

/** 두 주소가 같은 폴더인가 */
export function samePath(a: ExplorerPath, b: ExplorerPath) {
  return explorerHref(a) === explorerHref(b);
}
