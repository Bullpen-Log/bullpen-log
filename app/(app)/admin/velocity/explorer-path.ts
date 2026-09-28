/**
 * 구속 측정 탐색기의 주소 — 어느 폴더를 보고 있나.
 *
 *   /admin/velocity                                  맨 위 — [원본] · [보정] 두 폴더
 *   /admin/velocity?area=orig                        원본 — 연도 폴더들
 *   /admin/velocity?area=orig&at=2026                2026년 — 월 폴더들
 *   /admin/velocity?area=orig&at=2026-09             9월 — 날짜 폴더들
 *   /admin/velocity?area=orig&at=2026-09-28          28일 — 그날 공 파일들(세션 상관없이, 스피드건 10km/h 그룹)
 *   /admin/velocity?area=calib&at=2026-09-28         보정 › 28일 — 보정 차수 폴더들(1차 · 2차 …)
 *   /admin/velocity?area=calib&at=2026-09-28&run=<id> 그 차수의 결과 파일들(공마다 다시 잰 값)
 *   … &pick=<공 id>                                  그 파일을 골라 미리보기에 연다
 *
 * 원본 = 처음 올라온 · 잰 값 그대로. 보정 = 그날 영상들을 나중 모델로 다시 잰 결과가 차수마다 쌓인다
 * (사용자 요청, 2026-09-28). 예전 주소(?at=… 만, &s=<세션>)는 원본의 그 폴더로 읽는다.
 *
 * 주소에 담아 두므로 뒤로 · 앞으로 · 새로고침 · 링크 공유가 그대로 된다. 서버(page.tsx)와
 * 브라우저(explorer.tsx)가 같이 쓴다.
 */

export type ExplorerArea = 'orig' | 'calib';

export type ExplorerPath =
  | { level: 'root' }
  | { level: 'area'; area: ExplorerArea }
  | { level: 'year'; area: ExplorerArea; year: string }
  | { level: 'month'; area: ExplorerArea; year: string; month: string }
  | { level: 'day'; area: ExplorerArea; year: string; month: string; date: string }
  | {
      level: 'run';
      area: 'calib';
      year: string;
      month: string;
      date: string;
      runId: string;
    };

const ROOT: ExplorerPath = { level: 'root' };

export const AREA_LABEL: Record<ExplorerArea, string> = { orig: '원본', calib: '보정' };

/** 2월 31일 같은 날짜를 걸러낸다 — 되돌려 찍어 같은지 본다 */
function isRealDate(date: string) {
  const at = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === date;
}

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** 주소의 area · at · run 을 읽는다. 알아볼 수 없으면 맨 위로. at 만 있으면(옛 주소) 원본 */
export function parseExplorerPath(
  area?: string | null,
  at?: string | null,
  runId?: string | null
): ExplorerPath {
  const v = (at ?? '').trim();
  const a: ExplorerArea | null = area === 'calib' ? 'calib' : area === 'orig' || v ? 'orig' : null;
  if (!a) return ROOT;
  if (!v) return { level: 'area', area: a };
  if (/^\d{4}$/.test(v)) return { level: 'year', area: a, year: v };
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v))
    return { level: 'month', area: a, year: v.slice(0, 4), month: v };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && isRealDate(v)) {
    const base = { year: v.slice(0, 4), month: v.slice(0, 7), date: v };
    if (a === 'calib' && runId && ID_RE.test(runId)) {
      return { level: 'run', area: 'calib', ...base, runId };
    }
    return { level: 'day', area: a, ...base };
  }
  return { level: 'area', area: a };
}

/** 그 폴더의 주소 — pick 을 주면 그 파일을 골라 연다 */
export function explorerHref(path: ExplorerPath, pick?: string | null): string {
  const q = new URLSearchParams();
  if (path.level !== 'root') q.set('area', path.area);
  if (path.level === 'year') q.set('at', path.year);
  else if (path.level === 'month') q.set('at', path.month);
  else if (path.level === 'day' || path.level === 'run') q.set('at', path.date);
  if (path.level === 'run') q.set('run', path.runId);
  if (pick) q.set('pick', pick);
  const s = q.toString();
  return s ? `/admin/velocity?${s}` : '/admin/velocity';
}

/** 한 칸 위 폴더 */
export function parentOf(path: ExplorerPath): ExplorerPath {
  switch (path.level) {
    case 'run':
      return {
        level: 'day',
        area: path.area,
        year: path.year,
        month: path.month,
        date: path.date,
      };
    case 'day':
      return { level: 'month', area: path.area, year: path.year, month: path.month };
    case 'month':
      return { level: 'year', area: path.area, year: path.year };
    case 'year':
      return { level: 'area', area: path.area };
    default:
      return ROOT;
  }
}

/** 맨 위부터 지금까지 — 주소 줄(구속 측정 › 원본 › 2026년 › 9월 › 28일 …)에 쓴다 */
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

/** 어느 영역(원본 · 보정)에 있나 — 맨 위면 null */
export function areaOf(path: ExplorerPath): ExplorerArea | null {
  return path.level === 'root' ? null : path.area;
}

/**
 * 스피드건 10km/h 그룹 — 그날 공들을 이 묶음으로 나눠 보인다(사용자 요청). 값이 없으면 null(맨 뒤 '스피드건 없음').
 * 130~139 처럼 아래 경계를 열쇠로 쓴다.
 */
export function gunGroupOf(gunKmh: number | null | undefined): number | null {
  if (gunKmh == null || !Number.isFinite(gunKmh)) return null;
  return Math.floor(gunKmh / 10) * 10;
}

export function gunGroupLabel(group: number | null): string {
  return group == null ? '스피드건 없음' : `${group}~${group + 9} km/h`;
}
