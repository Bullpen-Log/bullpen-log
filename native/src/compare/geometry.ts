/**
 * 비교 화면의 좌표(순수). 그림 · 측정은 **원본 영상 좌표**(회전을 적용해 화면에 보이는 장면의 0~1 비율 — 가로 u, 세로 v)에 남긴다.
 * 칸 크기 · 레터박스(contain) · 의도한 자르기(crop) · 확대 · 이동 · 좌우 반전은 보기 변환일 뿐이라 그림이 영상에 붙어 있다.
 * 각도 · 길이는 비율 좌표를 그대로 쓰지 않고 화면 비(가로 ÷ 세로)를 곱한 '원본 비율 공간'에서 센다(가로 · 세로 비가 다르면 각이 틀어진다).
 */

export type Pt = { u: number; v: number };
export type Px = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 칸의 보기 변환 — 사용자가 바꾸는 것(저장된다). crop 은 원본 비율 좌표의 부분 사각형(없으면 전체).
 * panX · panY 는 **칸 크기에 대한 비율**(칸 폭 · 높이의 몇 배) — 화면 px 가 아니다. 그래서 돌리기 · 창 크기 바꾸기 · 다른 기기에서 열어도
 * 같은 부분이 보인다(F08 — 예전 판은 px 로 남겨 칸 크기가 바뀌면 다른 곳을 보였다).
 */
export type ViewTransform = { zoom: number; panX: number; panY: number; mirror: boolean; crop: Rect | null };
export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0, mirror: false, crop: null };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
/** 비율 이동의 한계 — 확대 6배에서 칸 반의 다섯 배. 이보다 큰 저장 값은 옛 px 판이라 0 으로(위치를 짐작하지 않는다) */
const MAX_PAN = (MAX_ZOOM - 1) / 2;

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const fin = (n: number, d = 0) => (Number.isFinite(n) ? n : d);

/** 저장 값 → 보기 변환(깨진 값은 기본으로) */
export function normalizeView(raw: unknown): ViewTransform {
  if (!raw || typeof raw !== 'object') return { ...IDENTITY_VIEW };
  const r = raw as Partial<ViewTransform>;
  const crop = r.crop && typeof r.crop === 'object' ? clampCrop(r.crop) : null;
  const pan = (v: unknown) => {
    const n = fin(Number(v));
    return Math.abs(n) > MAX_PAN ? 0 : n;
  };
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fin(Number(r.zoom), 1))),
    panX: pan(r.panX),
    panY: pan(r.panY),
    mirror: r.mirror === true,
    crop,
  };
}

function clampCrop(c: Partial<Rect>): Rect | null {
  const x = Math.min(1, Math.max(0, fin(Number(c.x))));
  const y = Math.min(1, Math.max(0, fin(Number(c.y))));
  const w = Math.min(1 - x, Math.max(0, fin(Number(c.w))));
  const h = Math.min(1 - y, Math.max(0, fin(Number(c.h))));
  return w > 0.02 && h > 0.02 ? { x, y, w, h } : null;
}

/** 칸(paneW × paneH) 안에 보일 사각형 — 원본(또는 자른 부분)의 비를 지키며 잘림 없이 맞춤(contain) */
export function containRect(paneW: number, paneH: number, displayAspect: number, crop: Rect | null = null): Rect {
  const c = crop ?? FULL;
  const a = displayAspect > 0 && Number.isFinite(displayAspect) ? (displayAspect * c.w) / c.h : paneW / Math.max(1, paneH);
  if (!(paneW > 0) || !(paneH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  if (paneW / paneH > a) {
    const w = paneH * a;
    return { x: (paneW - w) / 2, y: 0, w, h: paneH };
  }
  const h = paneW / a;
  return { x: 0, y: (paneH - h) / 2, w: paneW, h };
}

export type Pane = { w: number; h: number; aspect: number };

/** 원본 좌표 → 칸 화면 px(반전 · 자르기 · 맞춤 · 확대 · 이동 차례) */
export function toScreen(p: Pt, pane: Pane, view: ViewTransform): Px {
  const c = view.crop ?? FULL;
  const r = containRect(pane.w, pane.h, pane.aspect, view.crop);
  const u = view.mirror ? 1 - p.u : p.u;
  /* 반전은 원본 전체 기준 — 자른 부분도 같이 뒤집혀 보이게 crop 도 반전 좌표에서 */
  const cx0 = view.mirror ? 1 - (c.x + c.w) : c.x;
  const px = r.x + ((u - cx0) / c.w) * r.w;
  const py = r.y + ((p.v - c.y) / c.h) * r.h;
  const cx = pane.w / 2;
  const cy = pane.h / 2;
  return { x: cx + (px - cx) * view.zoom + view.panX * pane.w, y: cy + (py - cy) * view.zoom + view.panY * pane.h };
}

/** 칸 화면 px → 원본 좌표(손가락이 짚은 자리). 레터박스 밖이면 영상 밖 좌표가 나온다 — inside 로 거른다 */
export function toSource(s: Px, pane: Pane, view: ViewTransform): Pt {
  const c = view.crop ?? FULL;
  const r = containRect(pane.w, pane.h, pane.aspect, view.crop);
  const cx = pane.w / 2;
  const cy = pane.h / 2;
  const z = view.zoom || 1;
  const px = cx + (s.x - view.panX * pane.w - cx) / z;
  const py = cy + (s.y - view.panY * pane.h - cy) / z;
  const cx0 = view.mirror ? 1 - (c.x + c.w) : c.x;
  const um = r.w > 0 ? cx0 + ((px - r.x) / r.w) * c.w : 0;
  const v = r.h > 0 ? c.y + ((py - r.y) / r.h) * c.h : 0;
  return { u: view.mirror ? 1 - um : um, v };
}

export const inside = (p: Pt) => p.u >= 0 && p.u <= 1 && p.v >= 0 && p.v <= 1;
export const clampPt = (p: Pt): Pt => ({ u: Math.min(1, Math.max(0, p.u)), v: Math.min(1, Math.max(0, p.v)) });

/** 확대 — 두 손가락 가운데(focal)가 그 자리에 머물게. 1 배로 돌아오면 이동도 0 */
export function zoomAt(view: ViewTransform, pane: Pane, focal: Px, nextZoom: number): ViewTransform {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fin(nextZoom, view.zoom)));
  if (z === 1) return { ...view, zoom: 1, panX: 0, panY: 0 };
  const cx = pane.w / 2;
  const cy = pane.h / 2;
  const k = z / view.zoom;
  /* focal 의 확대 전 위치를 고정: f = c + (p − c)·z + pan → pan' = f − c − (f − c − pan)·k */
  const panX = focal.x - cx - (focal.x - cx - view.panX * pane.w) * k;
  const panY = focal.y - cy - (focal.y - cy - view.panY * pane.h) * k;
  return clampPan({ ...view, zoom: z, panX: pane.w > 0 ? panX / pane.w : 0, panY: pane.h > 0 ? panY / pane.h : 0 }, pane);
}

/** 이동은 영상이 칸 밖으로 다 나가지 않게(확대한 만큼만) */
export function clampPan(view: ViewTransform, _pane?: Pane): ViewTransform {
  const l = (view.zoom - 1) / 2;
  return { ...view, panX: Math.min(l, Math.max(-l, view.panX)), panY: Math.min(l, Math.max(-l, view.panY)) };
}
/** 손가락이 움직인 px 만큼 이동(비율로 바꿔) */
export function panBy(view: ViewTransform, pane: Pane, dxPx: number, dyPx: number): ViewTransform {
  return clampPan({ ...view, panX: view.panX + (pane.w > 0 ? dxPx / pane.w : 0), panY: view.panY + (pane.h > 0 ? dyPx / pane.h : 0) });
}

export const resetView = (v: ViewTransform): ViewTransform => ({ ...IDENTITY_VIEW, mirror: v.mirror, crop: v.crop });

/** 저장된 장면 크기(회전 전) 좌표 → 원본(보이는) 좌표 — 회전 머리가 있는 영상의 자세 분석 · 내보내기용 */
export function encodedToDisplay(p: Pt, rotationDeg: 0 | 90 | 180 | 270): Pt {
  switch (rotationDeg) {
    case 90:
      return { u: 1 - p.v, v: p.u };
    case 180:
      return { u: 1 - p.u, v: 1 - p.v };
    case 270:
      return { u: p.v, v: 1 - p.u };
    default:
      return { ...p };
  }
}
export function displayToEncoded(p: Pt, rotationDeg: 0 | 90 | 180 | 270): Pt {
  switch (rotationDeg) {
    case 90:
      return { u: p.v, v: 1 - p.u };
    case 180:
      return { u: 1 - p.u, v: 1 - p.v };
    case 270:
      return { u: 1 - p.v, v: p.u };
    default:
      return { ...p };
  }
}

/* ---- 원본 비율 공간에서의 셈 ---- */

/** 비율 좌표 → 원본 비율 공간(세로 1, 가로 aspect) */
const sp = (p: Pt, aspect: number) => ({ x: p.u * aspect, y: p.v });

/** 세 점 각(도, 꼭짓점 vtx) — 점이 겹치면 null */
export function angleDeg(a: Pt, vtx: Pt, b: Pt, aspect: number): number | null {
  if (!(aspect > 0)) return null;
  const A = sp(a, aspect);
  const V = sp(vtx, aspect);
  const B = sp(b, aspect);
  const la = Math.hypot(A.x - V.x, A.y - V.y);
  const lb = Math.hypot(B.x - V.x, B.y - V.y);
  if (la < 1e-6 || lb < 1e-6) return null;
  const cos = ((A.x - V.x) * (B.x - V.x) + (A.y - V.y) * (B.y - V.y)) / (la * lb);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** 수직선 대비 기울기(0 수직 · 90 수평) — 겹치면 null */
export function tiltDeg(a: Pt, b: Pt, aspect: number): number | null {
  if (!(aspect > 0)) return null;
  const A = sp(a, aspect);
  const B = sp(b, aspect);
  if (Math.hypot(B.x - A.x, B.y - A.y) < 1e-6) return null;
  return (Math.atan2(Math.abs(B.x - A.x), Math.abs(B.y - A.y)) * 180) / Math.PI;
}

/** 원본 비율 공간 길이(세로 1 = 화면 높이) */
export function spanLength(a: Pt, b: Pt, aspect: number): number {
  const A = sp(a, aspect);
  const B = sp(b, aspect);
  return Math.hypot(B.x - A.x, B.y - A.y);
}

/**
 * 길이 보정 — 같은 평면에 놓인 알고 있는 길이(예: 투수판 → 홈 18.44m 는 촬영 방향상 못 쓰는 일이 많다, 보통 사람 키 · 막대) 두 점과 실제 cm.
 * 보정이 없거나 깨졌으면 cm 를 내지 않는다(화면 비율 값만). 원근 · 다른 깊이의 점은 틀린다 — 화면은 '같은 평면 가정'을 늘 적는다.
 */
export type Calibration = { a: Pt; b: Pt; cm: number };
export function cmPerUnit(cal: Calibration | null, aspect: number): number | null {
  if (!cal || !(cal.cm > 0) || !Number.isFinite(cal.cm)) return null;
  const len = spanLength(cal.a, cal.b, aspect);
  return len > 1e-4 ? cal.cm / len : null;
}
export type Distance = { unit: 'cm'; value: number } | { unit: 'ratio'; value: number };
/** 두 점 거리 — 보정이 있으면 cm, 없으면 화면 높이 대비 비율(단위 없음) */
export function distance(a: Pt, b: Pt, aspect: number, cal: Calibration | null): Distance {
  const len = spanLength(a, b, aspect);
  const k = cmPerUnit(cal, aspect);
  return k != null ? { unit: 'cm', value: len * k } : { unit: 'ratio', value: len };
}
export const distanceText = (d: Distance) => (d.unit === 'cm' ? `${d.value.toFixed(0)}cm(같은 평면 가정)` : `화면 높이의 ${(d.value * 100).toFixed(0)}%`);

/* ---- 겹쳐 보기(R11) — 시간 맞춤과 따로, 공간 맞춤만 ---- */

/** B 를 A 위에 얹을 때의 손 맞춤(칸 비율 단위 이동 · 배율) */
export type Registration = { dx: number; dy: number; scale: number };
export const IDENTITY_REG: Registration = { dx: 0, dy: 0, scale: 1 };
export function normalizeReg(raw: unknown): Registration {
  if (!raw || typeof raw !== 'object') return { ...IDENTITY_REG };
  const r = raw as Partial<Registration>;
  return {
    dx: Math.min(1, Math.max(-1, fin(Number(r.dx)))),
    dy: Math.min(1, Math.max(-1, fin(Number(r.dy)))),
    scale: Math.min(3, Math.max(0.33, fin(Number(r.scale), 1))),
  };
}
/** 겹쳐 보기 맞춤을 손으로 조금씩(R11) — 이동은 칸의 2%, 크기는 3%씩. 범위는 normalizeReg 와 같다 */
export function nudgeReg(r: Registration, move: 'up' | 'down' | 'left' | 'right' | 'bigger' | 'smaller'): Registration {
  const step = 0.02;
  const next = {
    dx: r.dx + (move === 'left' ? -step : move === 'right' ? step : 0),
    dy: r.dy + (move === 'up' ? -step : move === 'down' ? step : 0),
    scale: r.scale * (move === 'bigger' ? 1.03 : move === 'smaller' ? 1 / 1.03 : 1),
  };
  return normalizeReg(next);
}
/** 두 점 쌍(A 의 기준 두 점 ↔ B 의 같은 두 점)으로 이동 · 배율을 셈한다 — 돌림은 뺀다(촬영 방향이 다르면 겹쳐 보기가 맞지 않는다) */
export function registrationFrom(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Registration | null {
  const la = Math.hypot(a2.u - a1.u, a2.v - a1.v);
  const lb = Math.hypot(b2.u - b1.u, b2.v - b1.v);
  if (la < 1e-3 || lb < 1e-3) return null;
  const scale = la / lb;
  const bc = { u: (b1.u + b2.u) / 2, v: (b1.v + b2.v) / 2 };
  const ac = { u: (a1.u + a2.u) / 2, v: (a1.v + a2.v) / 2 };
  return normalizeReg({ dx: ac.u - (0.5 + (bc.u - 0.5) * scale), dy: ac.v - (0.5 + (bc.v - 0.5) * scale), scale });
}
/** 맞춘 B 좌표 → A 칸 좌표 */
export const applyReg = (p: Pt, r: Registration): Pt => ({ u: 0.5 + (p.u - 0.5) * r.scale + r.dx, v: 0.5 + (p.v - 0.5) * r.scale + r.dy });
