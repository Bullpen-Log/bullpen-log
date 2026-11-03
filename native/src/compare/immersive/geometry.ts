/**
 * 몰입 비교 화면의 배치 · 좌표(순수 — 2026-11-03 IM02 · IM03 · IM05, docs/designs/sinker-pitch-video-immersive-plan.md).
 *
 * 따로 세는 넷: ① 화면 전체(root) ② 도구가 실제로 차지하는 자리 ③ A/B 칸(slot) ④ 칸 안 원본 영상이 그려지는 사각형.
 * - 칸은 무대를 빈틈없이 나눈다(바깥 거터 0, 칸 사이 구분선 0~1pt). 예전처럼 칸 = 영상 맞춤 사각형이 아니다.
 * - 칸 안에서 영상은 비율을 지키며 '채움'(cover — 가장자리가 잘릴 수 있음) 또는 '전체'(contain — 위에 붙임)로 그린다. 찌그러뜨리지 않는다.
 * - 원본 좌표(geometry.ts 의 Pt — 회전을 적용한 원본 0~1) ↔ 칸 화면 px 는 LayerMap 하나로만 오간다. 그림 · 터치 · 측정 · 겹침이 같은 길을 쓴다.
 *   전체 + 가운데 맞춤이면 기존 geometry.toScreen/toSource 와 같은 값(시험이 지킨다). 원본 파일 · 원본 좌표는 바꾸지 않는다.
 *
 * 화면(pane · 그림 판 · workbench)이 이 변환 하나를 쓴다(2026-11-03 통합).
 */
import { MAX_ZOOM, MIN_ZOOM } from '~/compare/geometry';
import type { Pt, Px, Rect, Registration, ViewTransform } from '~/compare/geometry';

export type Size = { w: number; h: number };
export type DisplayMode = 'fill' | 'full';
export type Align = 'top' | 'center';
export type SplitShape = 'stack' | 'side';
/** 무대에 보이는 것 — 두 칸 · 겹침(한 칸에 둘) · 한 영상 · 한쪽만 크게 */
export type StageView = 'pair' | 'overlay' | 'single' | 'focusA' | 'focusB';

/** 칸 사이 구분선(pt) — 시작값 1. 0 도 된다 */
export const SPLIT_SEPARATOR = 1;
/** 자동 배치를 바꾸려면 다른 쪽이 이만큼 더 나아야(workspace-layout 의 HYSTERESIS 와 같은 값) */
export const SPLIT_HYSTERESIS = 0.08;
/** 비율을 아직 모를 때 — 휴대폰 세로 영상 */
export const UNKNOWN_ASPECT = 9 / 16;
/** 채움에서 원본이 이만큼(가로 · 세로 중 하나라도) 넘게 잘리면 '일부 잘림'을 보인다 */
export const CROP_NOTICE = 0.005;

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
export const okAspect = (a: number | null | undefined): number | null => (a != null && Number.isFinite(a) && a > 0.1 && a < 10 ? a : null);

/**
 * 칸(slot) 안에 원본(또는 crop 부분)이 그려지는 사각형 — 칸 좌표. 채움은 칸을 다 덮고(밖으로 나간 만큼 잘림), 전체는 칸 안에 다 들어온다.
 * 전체의 남는 검은 띠는 비율 때문에 생긴 만큼만이고 위에 붙인다(align 'top'). 영상 파일 안에 이미 들어 있는 검은 띠는 지우지 않는다.
 */
export function imageRect(slot: Size, aspect: number | null | undefined, mode: DisplayMode, crop: Rect | null = null, align: Align = 'top'): Rect {
  if (!(slot.w > 0) || !(slot.h > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const c = crop ?? FULL;
  const base = okAspect(aspect);
  const a = base != null ? (base * c.w) / c.h : slot.w / slot.h;
  const wider = a > slot.w / slot.h;
  let w: number;
  let h: number;
  if (mode === 'fill') {
    if (wider) {
      h = slot.h;
      w = h * a;
    } else {
      w = slot.w;
      h = w / a;
    }
  } else if (wider) {
    w = slot.w;
    h = w / a;
  } else {
    h = slot.h;
    w = h * a;
  }
  const x = (slot.w - w) / 2;
  const y = mode === 'fill' || align === 'center' ? (slot.h - h) / 2 : 0;
  return { x, y, w, h };
}

/** 원본에서 칸에 보이는 몫(0~1, 가로 · 세로 각각) — 채움에서 잘린 정도. 확대 · 이동 전(기본 구도) 기준 */
export function shownFraction(slot: Size, aspect: number | null | undefined, mode: DisplayMode, crop: Rect | null = null): { u: number; v: number } {
  if (mode === 'full' || !(slot.w > 0) || !(slot.h > 0)) return { u: 1, v: 1 };
  const r = imageRect(slot, aspect, 'fill', crop);
  return { u: r.w > 0 ? Math.min(1, slot.w / r.w) : 1, v: r.h > 0 ? Math.min(1, slot.h / r.h) : 1 };
}
export const isCropped = (f: { u: number; v: number }) => f.u < 1 - CROP_NOTICE || f.v < 1 - CROP_NOTICE;

/**
 * 원본 전체([0,1]²)가 칸 화면 px 에서 차지하는 사각형 + 좌우 반전 — 원본 ↔ 화면의 유일한 변환.
 * crop · 확대 · 이동(칸 비율) · 반전을 geometry.toScreen 과 같은 차례로 적용한다.
 */
export type LayerMap = { x: number; y: number; w: number; h: number; mirror: boolean };

export function layerMap(slot: Size, aspect: number | null | undefined, view: ViewTransform, mode: DisplayMode, align: Align = 'top'): LayerMap {
  const c = view.crop ?? FULL;
  const d = imageRect(slot, aspect, mode, view.crop, align);
  const fw = c.w > 0 ? d.w / c.w : 0;
  const fh = c.h > 0 ? d.h / c.h : 0;
  /* 반전은 원본 전체 기준 — 자른 부분도 같이 뒤집혀 보이게 crop 도 반전 좌표에서(geometry.toScreen 과 같다) */
  const cx0 = view.mirror ? 1 - (c.x + c.w) : c.x;
  const x0 = d.x - cx0 * fw;
  const y0 = d.y - c.y * fh;
  const cx = slot.w / 2;
  const cy = slot.h / 2;
  const z = view.zoom > 0 && Number.isFinite(view.zoom) ? view.zoom : 1;
  return { x: cx + (x0 - cx) * z + view.panX * slot.w, y: cy + (y0 - cy) * z + view.panY * slot.h, w: fw * z, h: fh * z, mirror: view.mirror };
}

export const mapToScreen = (p: Pt, m: LayerMap): Px => ({ x: m.x + (m.mirror ? 1 - p.u : p.u) * m.w, y: m.y + p.v * m.h });
/** 화면 px → 원본 좌표. 영상 밖이면 0~1 밖이 나온다 — geometry.inside 로 거른다 */
export function mapToSource(s: Px, m: LayerMap): Pt {
  const um = m.w > 0 ? (s.x - m.x) / m.w : 0;
  return { u: m.mirror ? 1 - um : um, v: m.h > 0 ? (s.y - m.y) / m.h : 0 };
}
/** 칸 안에서 실제로 보이는 원본 부분(0~1) — 채움 · 확대로 잘린 범위를 '전체 보기'로 안내할 때 */
export function visibleSource(slot: Size, m: LayerMap): Rect {
  const a = mapToSource({ x: 0, y: 0 }, m);
  const b = mapToSource({ x: slot.w, y: slot.h }, m);
  const c01 = (n: number) => Math.min(1, Math.max(0, n));
  const u0 = c01(Math.min(a.u, b.u));
  const u1 = c01(Math.max(a.u, b.u));
  const v0 = c01(Math.min(a.v, b.v));
  const v1 = c01(Math.max(a.v, b.v));
  return { x: u0, y: v0, w: Math.max(0, u1 - u0), h: Math.max(0, v1 - v0) };
}

/* ---- 확대 · 이동(칸 · 표시 방식을 아는 판) ----
 * 확대 · 이동 값의 뜻은 저장된 그대로(zoom 1~6 · pan = 칸 크기 비율, 칸 가운데 기준) — layerMap 이 같은 차례로 적용한다.
 * 이동 한계만 표시 방식을 안다: 채움은 확대 1 이어도 칸 밖으로 잘린 만큼 밀어 볼 수 있게(잘린 손 · 발 · 공을 되찾는 길),
 * 전체는 예전처럼 확대한 만큼만. 저장 값이 읽히는 한계(geometry.normalizeView 의 (MAX_ZOOM−1)/2)를 넘지 않는다.
 */
const PAN_CAP = (MAX_ZOOM - 1) / 2;

export function panLimit(slot: Size, aspect: number | null | undefined, view: ViewTransform, mode: DisplayMode): { x: number; y: number } {
  const z = view.zoom > 0 && Number.isFinite(view.zoom) ? view.zoom : 1;
  const base = (z - 1) / 2;
  if (mode !== 'fill' || !(slot.w > 0) || !(slot.h > 0)) return { x: Math.min(PAN_CAP, base), y: Math.min(PAN_CAP, base) };
  const d = imageRect(slot, aspect, 'fill', view.crop);
  const ox = Math.max(0, (d.w * z - slot.w) / 2 / slot.w);
  const oy = Math.max(0, (d.h * z - slot.h) / 2 / slot.h);
  return { x: Math.min(PAN_CAP, Math.max(base, ox)), y: Math.min(PAN_CAP, Math.max(base, oy)) };
}
export function clampPanFor(view: ViewTransform, slot: Size, aspect: number | null | undefined, mode: DisplayMode): ViewTransform {
  const l = panLimit(slot, aspect, view, mode);
  return { ...view, panX: Math.min(l.x, Math.max(-l.x, view.panX)), panY: Math.min(l.y, Math.max(-l.y, view.panY)) };
}
/** 손가락이 움직인 px 만큼 이동 */
export function panByFor(view: ViewTransform, slot: Size, aspect: number | null | undefined, mode: DisplayMode, dxPx: number, dyPx: number): ViewTransform {
  return clampPanFor({ ...view, panX: view.panX + (slot.w > 0 ? dxPx / slot.w : 0), panY: view.panY + (slot.h > 0 ? dyPx / slot.h : 0) }, slot, aspect, mode);
}
/** 짚은 자리(focal)를 그대로 두고 확대 — 확대 1 로 돌아가면 이동도 0(기본 구도) */
export function zoomAtFor(view: ViewTransform, slot: Size, aspect: number | null | undefined, mode: DisplayMode, focal: Px, nextZoom: number): ViewTransform {
  const nz = Number.isFinite(nextZoom) ? nextZoom : view.zoom;
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nz));
  if (z === 1) return { ...view, zoom: 1, panX: 0, panY: 0 };
  const cx = slot.w / 2;
  const cy = slot.h / 2;
  const k = z / (view.zoom || 1);
  const panX = focal.x - cx - (focal.x - cx - view.panX * slot.w) * k;
  const panY = focal.y - cy - (focal.y - cy - view.panY * slot.h) * k;
  return clampPanFor({ ...view, zoom: z, panX: slot.w > 0 ? panX / slot.w : 0, panY: slot.h > 0 ? panY / slot.h : 0 }, slot, aspect, mode);
}
/** 확대 · 이동이 기본 구도에서 벗어났는가 — '맞춤으로' 단추를 보일 때 */
export const isFramed = (v: ViewTransform) => v.zoom > 1.001 || Math.abs(v.panX) > 1e-4 || Math.abs(v.panY) > 1e-4;

/**
 * 겹침의 위 영상 — 아래 영상(base)과 같은 칸 · 같은 확대 · 이동을 쓰고 제 비율 · 제 반전으로 그린 뒤, 손 맞춤(Registration)을 더한다.
 * 맞춤 값은 예전 저장 뜻 그대로(아래 원본 크기 기준 dx · dy, 아래 원본 가운데 기준 배율) — 비율 · 반전이 같으면 geometry.applyReg 와 같은 자리다.
 * 시간 맞춤과 따로다(이동 · 크기를 바꿔도 기준 시각은 안 바뀐다).
 */
export function overlayTopMap(
  slot: Size,
  base: { aspect: number | null | undefined; view: ViewTransform },
  top: { aspect: number | null | undefined; mirror: boolean },
  reg: Registration,
  mode: DisplayMode,
  align: Align = 'top',
): LayerMap {
  const A = layerMap(slot, base.aspect, base.view, mode, align);
  const B = layerMap(slot, top.aspect, { ...base.view, mirror: top.mirror }, mode, align);
  const s = reg.scale > 0 && Number.isFinite(reg.scale) ? reg.scale : 1;
  const acx = A.x + A.w / 2;
  const acy = A.y + A.h / 2;
  const sign = A.mirror ? -1 : 1;
  return { x: acx + (B.x - acx) * s + sign * reg.dx * A.w, y: acy + (B.y - acy) * s + reg.dy * A.h, w: B.w * s, h: B.h * s, mirror: top.mirror };
}

/* ---- 칸 나누기 ---- */

/** 두 칸 — 무대를 빈틈없이 반씩(구분선 sep). 정수 px 로 나눠 이음새가 흐리지 않게 */
export function splitSlots(stage: Size, shape: SplitShape, sep = SPLIT_SEPARATOR): { a: Rect; b: Rect } {
  const W = Math.max(0, stage.w);
  const H = Math.max(0, stage.h);
  const g = Math.max(0, Math.min(sep, shape === 'stack' ? H : W));
  if (shape === 'stack') {
    const ha = Math.round((H - g) / 2);
    return { a: { x: 0, y: 0, w: W, h: ha }, b: { x: 0, y: ha + g, w: W, h: Math.max(0, H - ha - g) } };
  }
  const wa = Math.round((W - g) / 2);
  return { a: { x: 0, y: 0, w: wa, h: H }, b: { x: wa + g, y: 0, w: Math.max(0, W - wa - g), h: H } };
}

/** 두 칸 배치의 점수 — 보이는 원본 몫 × 칸 넓이(채움) 또는 보이는 영상 넓이(전체)의 합 + 작은 쪽(한쪽이 거의 안 보이게 되지 않게) */
export function splitScore(stage: Size, shape: SplitShape, aspectA: number | null | undefined, aspectB: number | null | undefined, mode: DisplayMode, sep = SPLIT_SEPARATOR): number {
  const s = splitSlots(stage, shape, sep);
  const part = (r: Rect, a: number | null | undefined) => {
    if (mode === 'fill') {
      const f = shownFraction(r, a ?? UNKNOWN_ASPECT, 'fill');
      return r.w * r.h * f.u * f.v;
    }
    const d = imageRect(r, a ?? UNKNOWN_ASPECT, 'full');
    return d.w * d.h;
  };
  const pa = part(s.a, aspectA);
  const pb = part(s.b, aspectB);
  return pa + pb + Math.min(pa, pb);
}

/** 자동 배치 — 사람이 고른 방향은 그대로, 자동은 조금 나아졌다고 뒤집지 않는다 */
export function chooseSplit(input: {
  stage: Size;
  aspectA: number | null | undefined;
  aspectB: number | null | undefined;
  mode: DisplayMode;
  pref: 'auto' | SplitShape;
  prev?: SplitShape | null;
  sep?: number;
}): SplitShape {
  if (input.pref !== 'auto') return input.pref;
  const sep = input.sep ?? SPLIT_SEPARATOR;
  const st = splitScore(input.stage, 'stack', input.aspectA, input.aspectB, input.mode, sep);
  const sd = splitScore(input.stage, 'side', input.aspectA, input.aspectB, input.mode, sep);
  const better: SplitShape = sd > st ? 'side' : 'stack';
  const prev = input.prev ?? null;
  if (!prev || prev === better) return better;
  const keep = prev === 'side' ? sd : st;
  const other = prev === 'side' ? st : sd;
  return other > keep * (1 + SPLIT_HYSTERESIS) ? better : prev;
}

export type ImmersivePlan = {
  view: StageView;
  shape: SplitShape;
  /** 무대 안 칸(무대 좌표). 숨긴 칸은 null — 재생기는 살려 둔다(화면이 정함) */
  slots: { a: Rect | null; b: Rect | null };
  /** 칸 안 기본 구도(확대 · 이동 전) 영상 사각형 — 무대 좌표, 칸 밖으로 나갈 수 있다(채움) */
  images: { a: Rect | null; b: Rect | null };
  /** 원본에서 보이는 몫(기본 구도) · '일부 잘림' 표시 */
  shown: { a: { u: number; v: number } | null; b: { u: number; v: number } | null };
  cropped: { a: boolean; b: boolean };
  /** 무대 위 끝 ↔ 처음 보이는 영상 위 끝(채움이면 0) */
  topGap: number;
  /** 칸이 덮는 무대 몫(구분선 빼고 1 에 가깝다) */
  slotCoverage: number;
};

const offset = (r: Rect, o: Rect): Rect => ({ x: r.x + o.x, y: r.y + o.y, w: r.w, h: r.h });

export function planImmersive(input: {
  stage: Size;
  view: StageView;
  hasB: boolean;
  aspectA: number | null | undefined;
  aspectB: number | null | undefined;
  mode: DisplayMode;
  pref: 'auto' | SplitShape;
  prev?: SplitShape | null;
  sep?: number;
}): ImmersivePlan {
  const stage = { w: Math.max(0, input.stage.w), h: Math.max(0, input.stage.h) };
  const sep = input.sep ?? SPLIT_SEPARATOR;
  const aA = okAspect(input.aspectA) ?? UNKNOWN_ASPECT;
  const aB = okAspect(input.aspectB) ?? aA;
  const whole: Rect = { x: 0, y: 0, w: stage.w, h: stage.h };
  const view: StageView = !input.hasB && input.view !== 'single' ? 'single' : input.view;
  const shape = view === 'pair' ? chooseSplit({ stage, aspectA: aA, aspectB: aB, mode: input.mode, pref: input.pref, prev: input.prev, sep }) : (input.pref === 'auto' ? (input.prev ?? 'stack') : input.pref);
  let slots: { a: Rect | null; b: Rect | null };
  if (view === 'pair') slots = splitSlots(stage, shape, sep);
  else if (view === 'focusB') slots = { a: null, b: whole };
  /* 겹침은 한 칸에 둘 — 위 영상(B)의 칸은 같은 칸이고 그림은 overlayTopMap 으로 */
  else if (view === 'overlay') slots = { a: whole, b: whole };
  else slots = { a: whole, b: null };
  const img = (slot: Rect | null, a: number) => (slot ? offset(imageRect(slot, a, input.mode), slot) : null);
  const images = { a: img(slots.a, aA), b: view === 'overlay' ? null : img(slots.b, aB) };
  const sh = (slot: Rect | null, a: number) => (slot ? shownFraction(slot, a, input.mode) : null);
  const shown = { a: sh(slots.a, aA), b: sh(slots.b, aB) };
  const tops = [images.a, images.b, view === 'overlay' && slots.b ? offset(imageRect(slots.b, aB, input.mode), slots.b) : null]
    .filter((r): r is Rect => !!r)
    .map((r) => Math.max(0, r.y));
  const slotArea = [slots.a, view === 'overlay' ? null : slots.b].filter((r): r is Rect => !!r).reduce((s, r) => s + r.w * r.h, 0);
  return {
    view,
    shape,
    slots,
    images,
    shown,
    cropped: { a: !!shown.a && isCropped(shown.a), b: !!shown.b && isCropped(shown.b) },
    topGap: tops.length ? Math.min(...tops) : 0,
    slotCoverage: stage.w * stage.h > 0 ? slotArea / (stage.w * stage.h) : 0,
  };
}

/* ---- 화면 틀: 영상은 위에서, 도구는 아래(또는 짧은 가로에서 옆) ---- */

export type Insets = { top: number; bottom: number; left: number; right: number };
export type ImmersiveFrame = {
  /** 영상 무대(화면 좌표) — 바탕은 화면 끝까지, 조작은 안전 영역 안 */
  stage: Rect;
  /** 영상 위에 뜨는 작은 머리(뒤로 · 보기 바꾸기 · 도구 숨기기) 자리 — 숨김이면 null */
  header: Rect | null;
  /** 아래 도구(타임라인 · 재생 · 도구 줄) — 숨김이면 null. 옆 도구면 null */
  bottomTools: Rect | null;
  /** 짧은 가로의 옆 도구 — 잰 폭이 있을 때만 */
  sideTools: Rect | null;
  /** 도구를 숨겼을 때만 — 늘 누를 수 있는 '도구 보이기'(44pt 이상, 안전 영역 안) */
  restore: Rect | null;
};
export const RESTORE_SIZE = 44;
export const HEADER_H = 44;

/**
 * 화면 틀 셈 — 잰 도구 높이(bottomH, 안쪽에 홈 막대 여백 포함)와 옆 도구 폭(sideW, 쓰면)을 받아 남는 자리를 영상에 준다.
 * videoTop 'screen' 이면 영상 바탕이 화면 맨 위(상태 막대 밑)부터, 'safe' 면 안전 영역 아래부터. 조작은 늘 안전 영역 안이다.
 * 숨김이면 도구의 높이 · 폭 예약을 모두 풀고(opacity 0 으로 자리만 남기지 않는다) '도구 보이기' 하나만 남긴다.
 */
export function immersiveFrame(input: {
  root: Size;
  insets: Insets;
  toolsHidden: boolean;
  bottomH: number;
  sideW?: number;
  videoTop?: 'screen' | 'safe';
}): ImmersiveFrame {
  const W = Math.max(0, input.root.w);
  const H = Math.max(0, input.root.h);
  const ins = input.insets;
  const top = input.videoTop === 'safe' ? ins.top : 0;
  const side = !input.toolsHidden && (input.sideW ?? 0) > 0 ? Math.min(W, input.sideW ?? 0) : 0;
  const bottom = input.toolsHidden || side > 0 ? 0 : Math.min(Math.max(0, H - top), Math.max(0, input.bottomH));
  const stage: Rect = { x: 0, y: top, w: W - side, h: Math.max(0, H - top - bottom) };
  const header = input.toolsHidden ? null : { x: ins.left, y: ins.top, w: Math.max(0, W - side - ins.left - (side > 0 ? 0 : ins.right)), h: HEADER_H };
  const restore = input.toolsHidden ? { x: Math.max(ins.left, W - ins.right - 8 - RESTORE_SIZE), y: ins.top + 8, w: RESTORE_SIZE, h: RESTORE_SIZE } : null;
  return {
    stage,
    header,
    bottomTools: bottom > 0 ? { x: 0, y: H - bottom, w: W, h: bottom } : null,
    sideTools: side > 0 ? { x: W - side, y: 0, w: side, h: H } : null,
    restore,
  };
}
