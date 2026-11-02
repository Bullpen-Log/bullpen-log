/**
 * 비교 그림(주석) — 모양 · 시간 범위 · 편집 기록(순수). 좌표는 원본 영상 좌표(geometry.ts Pt), 영상(sourceId)과 시간에 붙는다.
 * 장면 그림(scene)은 그 장면 ± 범위에서만, 구간 그림(range)은 그 구간에서, 기준선처럼 늘 보이는 것(always)은 영상 내내.
 * 관절을 따라 움직이지 않는다 — 다른 장면에서는 숨어 '따라가는 것처럼' 보이지 않게.
 */
import { angleDeg, distance, distanceText, tiltDeg, type Calibration, type Pt } from '~/compare/geometry';

export type Geometry =
  | { kind: 'free'; pts: Pt[] }
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'arrow'; a: Pt; b: Pt }
  | { kind: 'rect'; a: Pt; b: Pt }
  | { kind: 'circle'; c: Pt; edge: Pt }
  | { kind: 'label'; p: Pt; text: string }
  | { kind: 'point'; p: Pt }
  | { kind: 'href'; v: number }
  | { kind: 'vref'; u: number }
  | { kind: 'tilt'; a: Pt; b: Pt }
  | { kind: 'angle'; a: Pt; vtx: Pt; b: Pt };
export type ToolKind = Geometry['kind'];

export type Span = { kind: 'scene'; t: number; tol: number } | { kind: 'range'; from: number; to: number } | { kind: 'always' };

/** 투수 2D 참고 측정 이름(R32) — 같은 이름끼리 A · B 를 견준다. 사람이 고른 이름표일 뿐 관절 진단이 아니다 */
export type MetricKey = 'trunkTilt' | 'shoulderLine' | 'forearm' | 'elbowAngle' | 'kneeAngle' | 'stride' | 'releaseHeight';
export const METRIC_LABEL: Record<MetricKey, string> = {
  trunkTilt: '몸통 기울기',
  shoulderLine: '어깨선 기울기',
  forearm: '아래팔 기울기',
  elbowAngle: '팔꿈치 2D 각도',
  kneeAngle: '앞무릎 2D 각도',
  stride: '스트라이드 길이',
  releaseHeight: '릴리스 높이',
};
/** 이름표마다 쓸 수 있는 도구 */
export const METRIC_TOOLS: Record<MetricKey, ToolKind[]> = {
  trunkTilt: ['tilt'],
  shoulderLine: ['tilt', 'line'],
  forearm: ['tilt', 'line'],
  elbowAngle: ['angle'],
  kneeAngle: ['angle'],
  stride: ['line'],
  releaseHeight: ['line'],
};

export type Annotation = {
  id: string;
  sourceId: string;
  span: Span;
  geom: Geometry;
  color: string;
  width: number;
  metric: MetricKey | null;
  createdAt: string;
};

export const COLORS = ['#F5F5F4', '#E3CB95', '#5EEAD4', '#FCA5A5', '#93C5FD'] as const;
export const WIDTHS = [2, 3, 5] as const;
export const SCENE_TOL = 0.1;
export const MAX_ANNOTATIONS = 400;
export const MAX_FREE_POINTS = 400;
export const MAX_LABEL = 60;

/** 길게 그린 자유선은 점을 줄인다(저장 · 그리기 부담) — 이웃과 거의 같은 점은 버린다 */
export function simplifyFree(pts: readonly Pt[], minStep = 0.004): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.u - last.u, p.v - last.v) >= minStep) out.push({ u: p.u, v: p.v });
  }
  if (out.length > MAX_FREE_POINTS) {
    const k = Math.ceil(out.length / MAX_FREE_POINTS);
    return out.filter((_, i) => i % k === 0 || i === out.length - 1);
  }
  return out;
}

/** 이 시각 · 이 영상에서 보이나 */
export function visibleAt(a: Annotation, sourceId: string, t: number): boolean {
  if (a.sourceId !== sourceId) return false;
  switch (a.span.kind) {
    case 'always':
      return true;
    case 'scene':
      return Math.abs(t - a.span.t) <= a.span.tol + 1e-6;
    case 'range':
      return t >= a.span.from - 1e-6 && t <= a.span.to + 1e-6;
  }
}
export const visibleList = (all: readonly Annotation[], sourceId: string, t: number) => all.filter((a) => visibleAt(a, sourceId, t));

/** 측정값 글 — 각 · 기울기는 '2D 참고', 길이는 보정이 있을 때만 cm */
export function measureText(g: Geometry, aspect: number, cal: Calibration | null): string | null {
  switch (g.kind) {
    case 'angle': {
      const d = angleDeg(g.a, g.vtx, g.b, aspect);
      return d == null ? null : `${d.toFixed(1)}° 2D 참고`;
    }
    case 'tilt': {
      const d = tiltDeg(g.a, g.b, aspect);
      return d == null ? null : `수직에서 ${d.toFixed(1)}°`;
    }
    case 'line':
    case 'arrow':
      return distanceText(distance(g.a, g.b, aspect, cal));
    default:
      return null;
  }
}
/** 숫자만(A · B 견주기) — 단위가 다르면 견주지 않는다 */
export function measureValue(g: Geometry, aspect: number, cal: Calibration | null): { value: number; unit: '°' | 'cm' | 'ratio' } | null {
  if (g.kind === 'angle') {
    const d = angleDeg(g.a, g.vtx, g.b, aspect);
    return d == null ? null : { value: d, unit: '°' };
  }
  if (g.kind === 'tilt') {
    const d = tiltDeg(g.a, g.b, aspect);
    return d == null ? null : { value: d, unit: '°' };
  }
  if (g.kind === 'line' || g.kind === 'arrow') {
    const d = distance(g.a, g.b, aspect, cal);
    return { value: d.value, unit: d.unit };
  }
  return null;
}

/* ---- 편집 기록(되돌리기 · 다시 하기) ---- */

export type History = { items: Annotation[]; past: Annotation[][]; future: Annotation[][] };
export const HISTORY_LIMIT = 80;
export const historyOf = (items: Annotation[]): History => ({ items, past: [], future: [] });

export type ClearScope = { kind: 'scene'; sourceId: string; t: number } | { kind: 'source'; sourceId: string } | { kind: 'all' };
export type Edit =
  | { op: 'add'; a: Annotation }
  | { op: 'update'; id: string; patch: Partial<Pick<Annotation, 'geom' | 'color' | 'width' | 'span' | 'metric'>> }
  | { op: 'remove'; id: string }
  | { op: 'clear'; scope: ClearScope }
  | { op: 'undo' }
  | { op: 'redo' };

/** 지울 대상(범위 지우기) — 화면이 '몇 개를 지워요' 확인에 쓴다 */
export function clearTargets(items: readonly Annotation[], scope: ClearScope): Annotation[] {
  if (scope.kind === 'all') return [...items];
  if (scope.kind === 'source') return items.filter((a) => a.sourceId === scope.sourceId);
  return items.filter((a) => visibleAt(a, scope.sourceId, scope.t) && a.span.kind !== 'always');
}

const push = (h: History, next: Annotation[]): History =>
  next === h.items ? h : { items: next, past: [...h.past, h.items].slice(-HISTORY_LIMIT), future: [] };

export function applyEdit(h: History, e: Edit): History {
  switch (e.op) {
    case 'add':
      if (h.items.length >= MAX_ANNOTATIONS || h.items.some((x) => x.id === e.a.id)) return h;
      return push(h, [...h.items, e.a]);
    case 'update': {
      const i = h.items.findIndex((x) => x.id === e.id);
      if (i < 0) return h;
      const next = [...h.items];
      next[i] = { ...next[i], ...e.patch };
      return push(h, next);
    }
    case 'remove':
      return h.items.some((x) => x.id === e.id) ? push(h, h.items.filter((x) => x.id !== e.id)) : h;
    case 'clear': {
      const gone = new Set(clearTargets(h.items, e.scope).map((x) => x.id));
      return gone.size ? push(h, h.items.filter((x) => !gone.has(x.id))) : h;
    }
    case 'undo': {
      const prev = h.past[h.past.length - 1];
      return prev ? { items: prev, past: h.past.slice(0, -1), future: [h.items, ...h.future] } : h;
    }
    case 'redo': {
      const next = h.future[0];
      return next ? { items: next, past: [...h.past, h.items], future: h.future.slice(1) } : h;
    }
  }
}

/* ---- 저장 값 검사 ---- */

const isPt = (p: unknown): p is Pt => !!p && typeof p === 'object' && Number.isFinite((p as Pt).u) && Number.isFinite((p as Pt).v);
const clampP = (p: Pt): Pt => ({ u: Math.min(1.5, Math.max(-0.5, p.u)), v: Math.min(1.5, Math.max(-0.5, p.v)) });

export function normalizeGeometry(raw: unknown): Geometry | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  switch (g.kind) {
    case 'free':
      return Array.isArray(g.pts) && g.pts.every(isPt) && g.pts.length >= 2 ? { kind: 'free', pts: simplifyFree((g.pts as Pt[]).map(clampP), 0) } : null;
    case 'line':
    case 'arrow':
    case 'rect':
    case 'tilt':
      return isPt(g.a) && isPt(g.b) ? { kind: g.kind, a: clampP(g.a), b: clampP(g.b) } : null;
    case 'circle':
      return isPt(g.c) && isPt(g.edge) ? { kind: 'circle', c: clampP(g.c), edge: clampP(g.edge) } : null;
    case 'label':
      return isPt(g.p) && typeof g.text === 'string' && g.text.trim() ? { kind: 'label', p: clampP(g.p), text: g.text.trim().slice(0, MAX_LABEL) } : null;
    case 'point':
      return isPt(g.p) ? { kind: 'point', p: clampP(g.p) } : null;
    case 'href':
      return Number.isFinite(g.v) ? { kind: 'href', v: Math.min(1, Math.max(0, g.v as number)) } : null;
    case 'vref':
      return Number.isFinite(g.u) ? { kind: 'vref', u: Math.min(1, Math.max(0, g.u as number)) } : null;
    case 'angle':
      return isPt(g.a) && isPt(g.vtx) && isPt(g.b) ? { kind: 'angle', a: clampP(g.a), vtx: clampP(g.vtx), b: clampP(g.b) } : null;
    default:
      return null;
  }
}

export function normalizeSpan(raw: unknown): Span | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.kind === 'always') return { kind: 'always' };
  if (s.kind === 'scene' && Number.isFinite(s.t) && (s.t as number) >= 0)
    return { kind: 'scene', t: s.t as number, tol: Number.isFinite(s.tol) ? Math.min(2, Math.max(0, s.tol as number)) : SCENE_TOL };
  if (s.kind === 'range' && Number.isFinite(s.from) && Number.isFinite(s.to) && (s.to as number) > (s.from as number))
    return { kind: 'range', from: Math.max(0, s.from as number), to: s.to as number };
  return null;
}

export function normalizeAnnotation(raw: unknown, sourceIds: ReadonlySet<string>): Annotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const geom = normalizeGeometry(a.geom);
  const span = normalizeSpan(a.span);
  if (typeof a.id !== 'string' || !a.id || typeof a.sourceId !== 'string' || !sourceIds.has(a.sourceId) || !geom || !span) return null;
  const metric = typeof a.metric === 'string' && a.metric in METRIC_LABEL ? (a.metric as MetricKey) : null;
  return {
    id: a.id.slice(0, 64),
    sourceId: a.sourceId,
    span,
    geom,
    color: typeof a.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(a.color) ? a.color : COLORS[0],
    width: Number.isFinite(a.width) ? Math.min(8, Math.max(1, a.width as number)) : WIDTHS[0],
    metric,
    createdAt: typeof a.createdAt === 'string' ? a.createdAt : new Date(0).toISOString(),
  };
}

/* ---- A · B 2D 측정 견주기(R32) ---- */

export type ViewKey = 'side3b' | 'side1b' | 'front' | 'back' | 'other';
export const VIEW_LABEL: Record<ViewKey, string> = { side3b: '3루 쪽 옆', side1b: '1루 쪽 옆', front: '정면(포수 쪽)', back: '뒤(2루 쪽)', other: '그 밖' };

export type MetricCompare =
  | { ok: true; metric: MetricKey; a: number; b: number; diff: number; unit: '°' | 'cm' | 'ratio' }
  | { ok: false; metric: MetricKey; reason: 'missing' | 'unit' | 'view' | 'viewUnknown' };

/**
 * 같은 이름표의 A · B 값을 견준다. 촬영 방향이 둘 다 알려지고 같아야 하고(모르면 viewUnknown — 숫자 없이 알림), 단위가 같아야 한다.
 * 차이만 보인다 — '좋아졌다' 같은 판정은 하지 않는다.
 */
export function compareMetric(
  metric: MetricKey,
  a: { geom: Geometry; aspect: number; cal: Calibration | null; view: ViewKey | null } | null,
  b: { geom: Geometry; aspect: number; cal: Calibration | null; view: ViewKey | null } | null
): MetricCompare {
  if (!a || !b) return { ok: false, metric, reason: 'missing' };
  if (a.view == null || b.view == null) return { ok: false, metric, reason: 'viewUnknown' };
  if (a.view !== b.view) return { ok: false, metric, reason: 'view' };
  const va = measureValue(a.geom, a.aspect, a.cal);
  const vb = measureValue(b.geom, b.aspect, b.cal);
  if (!va || !vb) return { ok: false, metric, reason: 'missing' };
  if (va.unit !== vb.unit) return { ok: false, metric, reason: 'unit' };
  return { ok: true, metric, a: va.value, b: vb.value, diff: vb.value - va.value, unit: va.unit };
}
