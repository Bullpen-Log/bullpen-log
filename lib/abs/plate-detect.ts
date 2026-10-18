/**
 * 플레이트 앞변 찾기 — 밝기 면(루마)에서 밝고 가로로 긴 조각(홈플레이트는 투수 뒤 2배에서 가로 30~120px · 세로 2~8px 의 흰 선)을 찾아
 * 왼쪽 · 오른쪽 끝을 소수점 픽셀로 낸다. 오각형이 아니라 앞변인 까닭은 calib.ts 머리.
 *
 * 입력은 원본 해상도 루마(행 우선)와 찾을 창(존 둘레 ±). 창 안만 보므로 1080×1920 전체를 안 훑는다(300×300 창 · 몇 ms).
 * 못 찾으면 ok=false — 화면은 '직접 맞추기'(두 끝 끌기)로 넘어간다.
 *
 * 차례: 문턱(창 중앙값 + 가장 밝은 0.05% 와의 차 절반) → 가로 run 9px 미만 지우기(파울 라인 · 점을 떼어 냄) → 4방향 연결 조각 → 폭 · 납작함 ·
 * 채움 · 창 가운데 가까움으로 점수 → 고른 조각의 주축(2차 모멘트)을 따라 양끝(끝 픽셀의 밝기 비율로 소수점).
 */
export type LumaPlane = { data: ArrayLike<number>; width: number; height: number };
export type Window = { x: number; y: number; w: number; h: number };

export type PlateFind = {
  ok: boolean;
  /** 앞변 왼쪽 · 오른쪽 끝(원본 px, 소수점) */
  left: [number, number];
  right: [number, number];
  /** 조각 두께(px) · 점수(0~1) · 까닭 */
  thickness: number;
  score: number;
  reason: string | null;
};

const FAIL = (reason: string): PlateFind => ({ ok: false, left: [0, 0], right: [0, 0], thickness: 0, score: 0, reason });

export type PlateDetectOptions = {
  /** 받을 폭(px) 범위 — 기본 24~160(15~35m · 1~2배) */
  minWidth?: number;
  maxWidth?: number;
  /** 가로 ÷ 세로 최소 — 기본 4 */
  minAspect?: number;
};

/** 가로 run 이 이보다 짧은 밝은 픽셀은 지운다 — 1~3px 세로 선(파울 라인 · 그물 실) · 점 */
const MIN_RUN = 9;

export function findPlateFront(luma: LumaPlane, win: Window, opts: PlateDetectOptions = {}): PlateFind {
  const minW = opts.minWidth ?? 24;
  const maxW = opts.maxWidth ?? 160;
  const minAspect = opts.minAspect ?? 4;
  const x0 = Math.max(0, Math.floor(win.x));
  const y0 = Math.max(0, Math.floor(win.y));
  const x1 = Math.min(luma.width, Math.ceil(win.x + win.w));
  const y1 = Math.min(luma.height, Math.ceil(win.y + win.h));
  const W = x1 - x0;
  const H = y1 - y0;
  if (W < minW || H < 4) return FAIL('창이 너무 작아요');
  const L = luma.data;
  const LW = luma.width;

  /* 문턱 */
  const vals: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) vals.push(L[y * LW + x]);
  vals.sort((a, b) => a - b);
  const med = vals[vals.length >> 1];
  const top = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9995))];
  if (top - med < 25) return FAIL('플레이트가 배경보다 충분히 밝지 않아요');
  const thr = med + (top - med) * 0.5;

  /* 이진 마스크 + 가로 run 열기 */
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = (y + y0) * LW + x0;
    let run = 0;
    for (let x = 0; x <= W; x++) {
      const on = x < W && L[row + x] >= thr;
      if (on) run++;
      else {
        if (run >= MIN_RUN) for (let k = x - run; k < x; k++) mask[y * W + k] = 1;
        run = 0;
      }
    }
  }

  /* 연결 조각(4방향) */
  const label = new Int32Array(W * H);
  let n = 0;
  type Comp = { id: number; minX: number; maxX: number; minY: number; maxY: number; area: number; sumX: number; sumY: number };
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i]) continue;
    n++;
    const c: Comp = { id: n, minX: W, maxX: -1, minY: H, maxY: -1, area: 0, sumX: 0, sumY: 0 };
    stack.push(i);
    label[i] = n;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % W;
      const y = (k - x) / W;
      c.area++;
      c.sumX += x;
      c.sumY += y;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W];
      for (const j of nb) {
        if (j < 0 || j >= W * H || !mask[j] || label[j]) continue;
        label[j] = n;
        stack.push(j);
      }
    }
    comps.push(c);
  }
  if (!comps.length) return FAIL('밝은 조각이 없어요');

  /* 점수: 폭 범위 · 납작함 · 채움 비율 · 창 가운데 가까움 */
  let best: { c: Comp; score: number } | null = null;
  for (const c of comps) {
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    if (w < minW || w > maxW) continue;
    if (w / h < minAspect) continue;
    const fill = c.area / (w * h);
    if (fill < 0.4) continue;
    const dx = (c.sumX / c.area + x0 - (win.x + win.w / 2)) / win.w;
    const dy = (c.sumY / c.area + y0 - (win.y + win.h / 2)) / win.h;
    const score = Math.min(1, fill) * 0.5 + 0.3 * Math.min(1, w / h / 12) + 0.2 * Math.max(0, 1 - Math.hypot(dx, dy) * 2);
    if (!best || score > best.score) best = { c, score };
  }
  if (!best) return FAIL('플레이트 모양(가로로 긴 흰 조각)이 없어요');
  const c = best.c;

  /* 주축(2차 모멘트) · 양끝 */
  const cx = c.sumX / c.area;
  const cy = c.sumY / c.area;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let inner = 0;
  let innerN = 0;
  for (let y = c.minY; y <= c.maxY; y++)
    for (let x = c.minX; x <= c.maxX; x++) {
      const i = y * W + x;
      if (label[i] !== c.id) continue;
      const dx = x + 0.5 - cx - 0.5;
      const dy = y + 0.5 - cy - 0.5;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
      /* 안쪽 밝기 — 양옆 · 위아래가 다 조각인 픽셀 */
      if (x > c.minX && x < c.maxX && label[i - 1] === c.id && label[i + 1] === c.id) {
        inner += L[(y + y0) * LW + x + x0];
        innerN++;
      }
    }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const plateLum = innerN ? inner / innerN : top;
  const cover = (v: number) => Math.max(0, Math.min(1, (v - med) / Math.max(1, plateLum - med)));
  let sMin = Infinity;
  let sMax = -Infinity;
  let pMin = 0;
  let pMax = 0;
  for (let y = c.minY; y <= c.maxY; y++)
    for (let x = c.minX; x <= c.maxX; x++) {
      const i = y * W + x;
      if (label[i] !== c.id) continue;
      const s = (x + 0.5 - (cx + 0.5)) * ct + (y + 0.5 - (cy + 0.5)) * st;
      if (s < sMin) {
        sMin = s;
        pMin = i;
      }
      if (s > sMax) {
        sMax = s;
        pMax = i;
      }
    }
  /* 끝 픽셀의 밝기 비율 c: 다 덮였으면 끝은 픽셀 바깥 가장자리(+0.5), 반이면 가운데 → s ± (c − 0.5) */
  const lumAt = (i: number) => L[((i - (i % W)) / W + y0) * LW + (i % W) + x0];
  const endMax = sMax + (cover(lumAt(pMax)) - 0.5);
  const endMin = sMin - (cover(lumAt(pMin)) - 0.5);
  const midX = cx + 0.5 + x0;
  const midY = cy + 0.5 + y0;
  let left: [number, number] = [midX + endMin * ct, midY + endMin * st];
  let right: [number, number] = [midX + endMax * ct, midY + endMax * st];
  if (left[0] > right[0]) [left, right] = [right, left];
  return { ok: true, left, right, thickness: c.maxY - c.minY + 1, score: best.score, reason: null };
}
