/**
 * 영상 비교 한 화면 배치(2026-11-02 — docs/designs/sinker-pitch-video-single-screen-plan.md, UI01~UI04 · UI07~UI09). 순수 계산이다(재생기 · 저장과 따로).
 *
 * - 화면은 굴리지 않는다. 머리 · 타임라인 · 재생 줄 · 도구 줄을 잰 뒤 남는 자리(무대)를 영상에 준다 — 창 높이 비율(예전 0.31 · 0.46)로 자르지 않는다.
 * - 두 영상은 저마다의 실제 화면 비율로 맞춤(contain)한다. 위아래 · 나란히 두 후보의 '실제 영상이 보이는 넓이'와 작은 쪽 넓이를 견줘 고른다.
 *   사람이 고른 배치는 그대로, 자동은 조금 달라졌다고 뒤집지 않는다(HYSTERESIS).
 * - 칸 = 영상 사각형 그 자체(칸 안 레터박스 없음). 묶음은 무대 아래(타임라인 쪽)에 붙이고 가로는 가운데 — 영상 끝과 조작 사이가 벌어지지 않게.
 * - 긴 목록 · 긴 글은 굴리지 않고 쪽으로 나눈다(perPage · pageSlice · paginateText).
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type StageShape = 'stack' | 'side';
export type StageMode = 'pair' | 'single' | 'overlay' | 'focusA' | 'focusB';
export type LayoutPref = 'auto' | StageShape;

export type StagePlan = {
  shape: StageShape;
  mode: StageMode;
  /** 무대 안 자리(px) — 숨긴 칸은 null(재생기는 살려 둔다) */
  panes: { a: Rect | null; b: Rect | null };
  /** 실제로 보이는 영상 넓이 합 · 작은 쪽 넓이 · 무대 넓이 */
  area: number;
  minArea: number;
  stageArea: number;
  /** 마지막 영상 아래 끝 ↔ 무대 아래 끝(타임라인 쪽) */
  bottomGap: number;
};

export const STAGE_GAP = 4;
export const STAGE_GUTTER = 4;
/** 자동 배치를 바꾸려면 다른 후보가 이만큼 더 나아야 한다 */
export const HYSTERESIS = 0.08;
/** 비율을 아직 모를 때(불러오는 중) — 휴대폰 세로 영상 */
export const FALLBACK_ASPECT = 9 / 16;

const okAspect = (a: number | null | undefined) => (a != null && Number.isFinite(a) && a > 0.1 && a < 10 ? a : null);
const fit = (w: number, h: number, aspect: number) => (w <= 0 || h <= 0 ? { w: 0, h: 0 } : w / h > aspect ? { w: h * aspect, h } : { w, h: w / aspect });
const r1 = (n: number) => Math.round(n * 10) / 10;

type Cand = { panes: { a: Rect | null; b: Rect | null }; area: number; minArea: number; bottomGap: number };

/** 한 칸(한 영상 · 겹쳐 보기 · 집중 보기) */
function one(w: number, h: number, aspect: number, gutter: number): Rect {
  const s = fit(w - 2 * gutter, h, aspect);
  return { x: r1((w - s.w) / 2), y: r1(h - s.h), w: r1(s.w), h: r1(s.h) };
}

function stack(w: number, h: number, aA: number, aB: number, gap: number, gutter: number): Cand {
  const W = Math.max(0, w - 2 * gutter);
  const nA = W / aA;
  const nB = W / aB;
  const k = Math.min(1, Math.max(0, h - gap) / Math.max(1e-6, nA + nB));
  const A = { w: W * k, h: nA * k };
  const B = { w: W * k, h: nB * k };
  /* 높이가 남으면(가로 영상 둘을 큰 화면에) 남는 자리는 위로 — 영상은 타임라인 쪽에 붙인다 */
  const used = A.h + gap + B.h;
  const top = Math.max(0, h - used);
  const a: Rect = { x: r1((w - A.w) / 2), y: r1(top), w: r1(A.w), h: r1(A.h) };
  const b: Rect = { x: r1((w - B.w) / 2), y: r1(top + A.h + gap), w: r1(B.w), h: r1(B.h) };
  return { panes: { a, b }, area: a.w * a.h + b.w * b.h, minArea: Math.min(a.w * a.h, b.w * b.h), bottomGap: r1(h - (b.y + b.h)) };
}

function side(w: number, h: number, aA: number, aB: number, gap: number, gutter: number): Cand {
  const W = Math.max(0, w - 2 * gutter - gap);
  const k = Math.min(1, W / Math.max(1e-6, h * aA + h * aB));
  const A = { w: h * aA * k, h: h * k };
  const B = { w: h * aB * k, h: h * k };
  const left = (w - (A.w + gap + B.w)) / 2;
  const a: Rect = { x: r1(left), y: r1(h - A.h), w: r1(A.w), h: r1(A.h) };
  const b: Rect = { x: r1(left + A.w + gap), y: r1(h - B.h), w: r1(B.w), h: r1(B.h) };
  return { panes: { a, b }, area: a.w * a.h + b.w * b.h, minArea: Math.min(a.w * a.h, b.w * b.h), bottomGap: 0 };
}

/** 두 영상 후보의 점수 — 보이는 넓이 합에 작은 쪽 넓이를 더한다(한쪽이 거의 안 보이는 배치를 피하게) */
export const pairScore = (c: { area: number; minArea: number }) => c.area + c.minArea;

export function planStage(input: {
  w: number;
  h: number;
  aspectA: number | null;
  aspectB: number | null;
  /** B 영상이 있는가(비율을 몰라도) */
  hasB: boolean;
  mode: StageMode;
  pref: LayoutPref;
  /** 지난번 자동 배치 — 비슷하면 그대로(작은 흔들림에 뒤집히지 않게) */
  prev?: StageShape | null;
  gap?: number;
  gutter?: number;
}): StagePlan {
  const w = Math.max(0, input.w);
  const h = Math.max(0, input.h);
  const gap = input.gap ?? STAGE_GAP;
  const gutter = input.gutter ?? STAGE_GUTTER;
  const aA = okAspect(input.aspectA) ?? FALLBACK_ASPECT;
  const aB = okAspect(input.aspectB) ?? aA;
  const stageArea = w * h;
  const hasB = input.hasB && input.mode !== 'single';
  const solo = (r: Rect, k: 'a' | 'b', shape: StageShape): StagePlan => ({
    shape,
    mode: input.mode,
    panes: { a: k === 'a' ? r : null, b: k === 'b' ? r : null },
    area: r.w * r.h,
    minArea: r.w * r.h,
    stageArea,
    bottomGap: r1(h - (r.y + r.h)),
  });
  const fallbackShape: StageShape = input.pref === 'auto' ? (input.prev ?? 'stack') : input.pref;
  if (input.mode === 'single' || !hasB) return solo(one(w, h, aA, gutter), 'a', fallbackShape);
  if (input.mode === 'overlay' || input.mode === 'focusA') return solo(one(w, h, aA, gutter), 'a', fallbackShape);
  if (input.mode === 'focusB') return solo(one(w, h, aB, gutter), 'b', fallbackShape);

  const st = stack(w, h, aA, aB, gap, gutter);
  const sd = side(w, h, aA, aB, gap, gutter);
  let shape: StageShape;
  if (input.pref !== 'auto') shape = input.pref;
  else {
    const better: StageShape = pairScore(sd) > pairScore(st) ? 'side' : 'stack';
    const prev = input.prev ?? null;
    if (prev && prev !== better) {
      const keep = prev === 'side' ? sd : st;
      const other = prev === 'side' ? st : sd;
      shape = pairScore(other) > pairScore(keep) * (1 + HYSTERESIS) ? better : prev;
    } else shape = better;
  }
  const c = shape === 'side' ? sd : st;
  return { shape, mode: input.mode, panes: c.panes, area: c.area, minArea: c.minArea, stageArea, bottomGap: c.bottomGap };
}

/** 무대가 받는 높이 — 잰 머리 · 타임라인 · 재생 줄 · 도구 줄 · 사이 간격을 뺀 나머지(안전 영역은 머리 · 도구 줄이 이미 품었으면 0 으로 넘긴다) */
export function chromeBudget(m: { rootH: number; insetTop: number; insetBottom: number; header: number; timeline: number; transport: number; dock: number; separators: number }) {
  const usable = Math.max(0, m.rootH - m.insetTop - m.insetBottom);
  const stageH = Math.max(0, usable - m.header - m.timeline - m.transport - m.dock - m.separators);
  return { usable, stageH, share: usable > 0 ? stageH / usable : 0 };
}

/** 짧은 가로 화면(가로 폰) — 도구 줄을 오른쪽 세로 줄로 옮겨 영상 높이를 지킨다 */
export const sideDock = (w: number, h: number) => w > h && h < 520;

/* ---- 쪽 나누기(굴리지 않는다) ---- */

/** 이 높이에 들어가는 줄 수(줄 높이 · 사이 간격) — 적어도 min */
export function perPage(avail: number, itemH: number, gap = 0, min = 1): number {
  if (!(itemH > 0)) return min;
  return Math.max(min, Math.floor((Math.max(0, avail) + gap) / (itemH + gap)));
}

export type PageView<T> = { items: T[]; page: number; pages: number; from: number; to: number };
export function pageSlice<T>(items: readonly T[], size: number, page: number): PageView<T> {
  const n = Math.max(1, Math.floor(size) || 1);
  const pages = Math.max(1, Math.ceil(items.length / n));
  const p = Math.min(pages - 1, Math.max(0, Math.floor(page) || 0));
  const from = p * n;
  const to = Math.min(items.length, from + n);
  return { items: items.slice(from, to), page: p, pages, from, to };
}
/** 이 줄(index)이 든 쪽 — 고른 것이 보이는 쪽으로 열 때 */
export const pageOfIndex = (index: number, size: number) => (index < 0 ? 0 : Math.floor(index / Math.max(1, Math.floor(size) || 1)));
export const pageText = (p: { page: number; pages: number }) => `${p.page + 1}/${p.pages}`;

/**
 * 긴 글을 쪽으로 — 원문은 그대로 두고 [시작, 끝) 자리만 낸다(이어 붙이면 원문과 같다). 한 쪽 글자 수(capacity)는 잰 줄 높이 · 줄 글자 수로 정한다.
 * 줄바꿈 → 빈칸 → 그 밖 차례로 끊는다. 한글 조합 중인 글은 화면이 쪽을 다시 나누지 않는다(편집을 마친 뒤에만 부른다).
 */
export function paginateText(text: string, capacity: number): { start: number; end: number }[] {
  const cap = Math.max(20, Math.floor(capacity) || 20);
  if (text.length <= cap) return [{ start: 0, end: text.length }];
  const out: { start: number; end: number }[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.length - i <= cap) {
      out.push({ start: i, end: text.length });
      break;
    }
    const win = text.slice(i, i + cap);
    let cut = win.lastIndexOf('\n');
    if (cut < cap * 0.5) {
      const sp = Math.max(win.lastIndexOf(' '), win.lastIndexOf('　'));
      cut = sp >= cap * 0.5 ? sp : cut >= cap * 0.25 ? cut : -1;
    }
    /* 끊는 글자(줄바꿈 · 빈칸)는 앞 쪽 끝에 붙인다 — 원문 자리는 하나도 빠지지 않는다 */
    let end = cut > 0 ? i + cut + 1 : i + cap;
    /* 짝을 이루는 글자(그림 문자 등 UTF-16 둘)를 가르지 않는다 */
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff && end < text.length) end += 1;
    out.push({ start: i, end });
    i = end;
  }
  return out;
}
/** 한 쪽 글자 수 어림 — 쪽 폭 · 높이 · 글자 크기(배율 포함)로. 한글은 글자 폭이 글자 크기와 거의 같다 */
export function textCapacity(w: number, h: number, fontSize: number, lineHeight: number): number {
  const perLine = Math.max(4, Math.floor(w / Math.max(1, fontSize * 0.95)));
  const lines = Math.max(1, Math.floor(h / Math.max(1, lineHeight)));
  return perLine * lines;
}

/* ---- 타임라인(손가락 자리 → 장면) ---- */

export const fracOf = (t: number, min: number, max: number) => (max - min > 1e-9 ? Math.min(1, Math.max(0, (t - min) / (max - min))) : 0);
export const timeAt = (x: number, w: number, min: number, max: number) => min + Math.min(1, Math.max(0, x / Math.max(1, w))) * (max - min);

/** 누른 자리 가까이(tolPx) 장면 표시가 있으면 그 표시 — 여럿이면 가장 가까운 것(빽빽하면 화면이 고르기 창을 준다) */
export function nearestMarker<T extends { t: number }>(markers: readonly T[], x: number, w: number, min: number, max: number, tolPx = 12): T | null {
  let best: { m: T; d: number } | null = null;
  for (const m of markers) {
    if (m.t < min || m.t > max) continue;
    const d = Math.abs(fracOf(m.t, min, max) * w - x);
    if (d <= tolPx && (!best || d < best.d)) best = { m, d };
  }
  return best?.m ?? null;
}
/** 반복 손잡이 — 누른 자리 가까이의 시작 · 끝(둘 다 가까우면 더 가까운 쪽, 같으면 손가락이 있는 쪽) */
export function handleAt(loop: { min: number; max: number } | null, x: number, w: number, min: number, max: number, tolPx = 18): 'start' | 'end' | null {
  if (!loop) return null;
  const xs = fracOf(loop.min, min, max) * w;
  const xe = fracOf(loop.max, min, max) * w;
  const ds = Math.abs(x - xs);
  const de = Math.abs(x - xe);
  if (ds > tolPx && de > tolPx) return null;
  if (Math.abs(ds - de) < 0.5) return x >= xe ? 'end' : 'start';
  return ds < de ? 'start' : 'end';
}
/** 겹치는 표시끼리 묶기 — 가까운(minPx 안) 표시는 하나로 그리고 누르면 고르기 창 */
export function clusterMarkers<T extends { t: number }>(markers: readonly T[], w: number, min: number, max: number, minPx = 14): T[][] {
  const sorted = [...markers].filter((m) => m.t >= min && m.t <= max).sort((p, q) => p.t - q.t);
  const out: T[][] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && (fracOf(m.t, min, max) - fracOf(last[0].t, min, max)) * w < minPx) last.push(m);
    else out.push([m]);
  }
  return out;
}

/**
 * 작은 창의 줄들을 쪽으로 — 줄 높이(어림) · 쓸 수 있는 높이로 앞에서부터 담는다. 넘치는 한 줄은 그 줄만 한 쪽.
 * keepWithNext(제목 줄)는 쪽 끝에 홀로 남기지 않고 다음 줄과 같이 다음 쪽으로.
 */
export function packRows(heights: readonly number[], avail: number, gap = 8, keepWithNext: readonly boolean[] = []): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  for (let i = 0; i < heights.length; i++) {
    const h = Math.max(0, heights[i]);
    const need = cur.length ? used + gap + h : h;
    if (cur.length && need > avail) {
      /* 쪽 끝의 제목 줄은 다음 쪽으로 데려간다 */
      const tail: number[] = [];
      while (cur.length > 1 && keepWithNext[cur[cur.length - 1]]) tail.unshift(cur.pop() as number);
      pages.push(cur);
      cur = [...tail, i];
      used = tail.reduce((s, j) => s + Math.max(0, heights[j]) + gap, 0) + h;
    } else {
      cur.push(i);
      used = need;
    }
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

/** 글 줄 높이 어림 — 글자 수 · 폭 · 글자 크기(배율)로 몇 줄인지 */
export function textRowHeight(text: string, w: number, fontSize: number, lineHeight: number, fs: number): number {
  const per = Math.max(4, Math.floor(w / Math.max(1, fontSize * fs * 0.95)));
  const lines = text.split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / per)), 0);
  return Math.ceil(lines * lineHeight * fs);
}
