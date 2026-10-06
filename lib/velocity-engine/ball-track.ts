/**
 * 엔진 2.0 — 공 찾기 · 이어 찾기.
 *
 * 1) 배경(장면들의 화소별 중앙값)보다 밝아진 둥근 덩어리로 막 던진 공(씨앗)을 찾는다 — 다음 장면에 조금 작아진 둥근 덩어리가
 *    바로 옆에 있어야 공이다(손에 쥔 공 · 팔은 여기서 걸러진다).
 * 2) 씨앗에서 덩어리를 이어 간다(앞 두 장으로 짐작한 자리 둘레, 두 장까지 건너뜀).
 * 3) 물리 궤적(trajectory-fit.ts)에 다 맞는 가장 긴 앞부분만 믿는다 — 손 · 팔이 붙은 첫 장면, 맞고 튄 뒤는 여기서 떨어진다.
 * 4) 공을 끝까지 못 따라갔으면(흰 천 앞 · 포수 앞) 늘린 궤적 둘레에서 '바로 앞 장면들을 뺀 차이 그림'의 둥근 후보를 모아
 *    RANSAC 으로 가장 길게 이어지는 줄을 고른다. 흰 천 앞 공은 그늘진 아래 반달만 보여 '가장 고르게 뚜렷한 반 바퀴'로 점수를 낸다.
 *
 * 모든 픽셀 값은 원본 1080(짧은 변) 기준으로 맞춘 것을 해상도 배율(scale)로 옮긴다 — 앱의 분석 해상도는 720 이다.
 * 시험 코드(2026-10-07, ~/bullpen-velocity-lab/proto2)에서 옮겼다. 정한 까닭은 그 시험의 기록에 있다(기억: velocity-engine-2-rebuild).
 */
import { fitTrajectory, rebase, type PinholeCamera, type TrackPoint, type TrajectoryFit } from './trajectory-fit.ts';

/** 장면 묶음 — 분석 해상도의 밝기(0~255)와 시각(초) */
export type FrameSet = {
  w: number;
  h: number;
  t: number[];
  luma: ArrayLike<number>[];
};

/** 이어 찾은 공 한 장면 — 분석 px */
export type TrackedBall = {
  i: number;
  t: number;
  u: number;
  v: number;
  diam: number;
  /** 둥근 테두리로 찾았나(이어 찾기 4) — 밝기 덩어리 중심과 자가 달라 따로 표시 */
  ring?: boolean;
};

/** 해상도 배율 — 짧은 변 1080 을 1 로 */
export function pixelScale(fs: { w: number; h: number }): number {
  return Math.min(fs.w, fs.h) / 1080;
}

/* ───────────────────────────── 배경 · 덩어리 ───────────────────────────── */

/** 화소별 중앙값 — 장면 몇 장(홀수가 좋다). 공 · 몸처럼 지나가는 것은 빠지고 가만한 배경만 남는다 */
export function medianBackground(frames: ArrayLike<number>[], w: number, h: number): Uint8Array {
  const n = frames.length;
  const out = new Uint8Array(w * h);
  if (!n) return out;
  const col = new Float64Array(n);
  const mid = n >> 1;
  for (let p = 0; p < w * h; p++) {
    for (let k = 0; k < n; k++) col[k] = frames[k][p];
    /* 가운데 값만 고른다(호어 선택) — 다 정렬하던 것과 같은 값, 21장이면 두 배 넘게 빠르다 */
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const pivot = col[(lo + hi) >> 1];
      let i = lo;
      let j = hi;
      while (i <= j) {
        while (col[i] < pivot) i++;
        while (col[j] > pivot) j--;
        if (i <= j) {
          const t = col[i];
          col[i] = col[j];
          col[j] = t;
          i++;
          j--;
        }
      }
      if (mid <= j) hi = j;
      else if (mid >= i) lo = i;
      else break;
    }
    out[p] = col[mid];
  }
  return out;
}

export type Blob = {
  area: number;
  /** 배경보다 밝은 만큼으로 무게 둔 중심 */
  cx: number;
  cy: number;
  bw: number;
  bh: number;
  /** 둘러싼 원을 채운 비율 — 둥글수록 1 에 가깝다 */
  fill: number;
};

/**
 * 배경보다 thr 넘게 밝아진(abs 면 달라진) 덩어리 — 영역 roi=[x0,y0,x1,y1] 안에서만, 4방향으로 이은 것. minArea 밑은 버린다.
 */
export function findBlobs(
  frame: ArrayLike<number>,
  bg: ArrayLike<number>,
  w: number,
  roi: [number, number, number, number],
  thr: number,
  minArea: number,
  abs = false
): Blob[] {
  const [x0, y0, x1, y1] = roi;
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return [];
  const dif = (p: number) => (abs ? Math.abs(frame[p] - bg[p]) : frame[p] - bg[p]);
  const mask = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    const row = (y + y0) * w + x0;
    for (let x = 0; x < rw; x++) if (dif(row + x) > thr) mask[y * rw + x] = 1;
  }
  const label = new Uint8Array(rw * rh);
  const stack: number[] = [];
  const blobs: Blob[] = [];
  for (let s = 0; s < rw * rh; s++) {
    if (!mask[s] || label[s]) continue;
    let area = 0;
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let bx0 = 1e9;
    let by0 = 1e9;
    let bx1 = -1;
    let by1 = -1;
    stack.push(s);
    label[s] = 1;
    while (stack.length) {
      const q = stack.pop() as number;
      const qx = q % rw;
      const qy = (q - qx) / rw;
      const d = dif((qy + y0) * w + qx + x0);
      area++;
      sw += d;
      sx += d * (qx + x0);
      sy += d * (qy + y0);
      if (qx < bx0) bx0 = qx;
      if (qx > bx1) bx1 = qx;
      if (qy < by0) by0 = qy;
      if (qy > by1) by1 = qy;
      if (qx > 0 && mask[q - 1] && !label[q - 1]) {
        label[q - 1] = 1;
        stack.push(q - 1);
      }
      if (qx < rw - 1 && mask[q + 1] && !label[q + 1]) {
        label[q + 1] = 1;
        stack.push(q + 1);
      }
      if (qy > 0 && mask[q - rw] && !label[q - rw]) {
        label[q - rw] = 1;
        stack.push(q - rw);
      }
      if (qy < rh - 1 && mask[q + rw] && !label[q + rw]) {
        label[q + rw] = 1;
        stack.push(q + rw);
      }
    }
    if (area < minArea) continue;
    const bw = bx1 - bx0 + 1;
    const bh = by1 - by0 + 1;
    blobs.push({
      area,
      cx: sx / sw,
      cy: sy / sw,
      bw,
      bh,
      fill: area / (Math.PI * (Math.max(bw, bh) / 2) ** 2),
    });
  }
  return blobs;
}

/** 공 중심 다듬기 — 짐작 자리 둘레 원 안에서 배경보다 thr 넘게 밝은 만큼으로 무게 둔 중심 · 면적 지름 */
export function refineCenter(
  frame: ArrayLike<number>,
  bg: ArrayLike<number>,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  thr: number
): { cx: number; cy: number; diam: number } | null {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let area = 0;
  const R = Math.ceil(r);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(h - 1, Math.ceil(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w - 1, Math.ceil(cx + R)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const d = frame[y * w + x] - bg[y * w + x];
      if (d <= thr) continue;
      sw += d;
      sx += d * x;
      sy += d * y;
      area++;
    }
  if (!sw) return null;
  return { cx: sx / sw, cy: sy / sw, diam: 2 * Math.sqrt(area / Math.PI) };
}

/* ───────────────────────────── 둥근 테두리 ───────────────────────────── */

/** 쌍선형으로 한 점 밝기 — 밖이면 NaN */
export function sampleAt(img: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const p = y0 * w + x0;
  return (img[p] * (1 - fx) + img[p + 1] * fx) * (1 - fy) + (img[p + w] * (1 - fx) + img[p + w + 1] * fx) * fy;
}

/**
 * 둥근 테두리 점수 — (x,y) 중심 반지름 r 원의 바로 안 · 밖 밝기 차(부호 없음)를 n 방향으로 재서, 둘레 중 가장 뚜렷한 연속 구간
 * (arc 만큼)의 아래 25% 값. 흰 천 앞 공은 그늘진 아래 반달만 보여 arc 0.5 로 본다. '고르게' 뚜렷해야 하므로 평균이 아니라 아래
 * 25% 값이다 — 몇 방향만 아주 밝은 곧은 선 · 모서리는 낮게 나온다(2026-10-07, 흰 천 가장자리 선에 끌리던 것).
 */
/* 방향 표(코사인 · 사인)와 계산 칸 — ringScore 가 한 번에 수십만 번 불려 칸을 다시 만들지 않는다 */
const DIRS = new Map<number, { co: Float64Array; sn: Float64Array }>();
function dirsOf(n: number) {
  let d = DIRS.get(n);
  if (!d) {
    const co = new Float64Array(n);
    const sn = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      co[k] = Math.cos((2 * Math.PI * k) / n);
      sn[k] = Math.sin((2 * Math.PI * k) / n);
    }
    d = { co, sn };
    DIRS.set(n, d);
  }
  return d;
}
let RING_C = new Float64Array(64);
let RING_W = new Float64Array(64);

export function ringScore(
  img: ArrayLike<number>,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  n = 32,
  arc = 1,
  band = 1.5
): number {
  const d = Math.max(band, 0.25 * r);
  const { co, sn } = dirsOf(n);
  if (RING_C.length < n) {
    RING_C = new Float64Array(n);
    RING_W = new Float64Array(n);
  }
  const c = RING_C;
  let m = 0;
  const ra = r + d;
  const rb = r - d;
  const xmax = w - 1.001;
  const ymax = h - 1.001;
  for (let k = 0; k < n; k++) {
    /* sampleAt 두 번을 그대로 풀어 쓴 것(한 번에 수십만 번 — 부르는 값만 아낀다, 계산은 같다) */
    const xa = x + ra * co[k];
    const ya = y + ra * sn[k];
    const xb = x + rb * co[k];
    const yb = y + rb * sn[k];
    if (xa < 0 || ya < 0 || xa > xmax || ya > ymax || xb < 0 || yb < 0 || xb > xmax || yb > ymax) {
      c[k] = NaN;
      continue;
    }
    const xa0 = Math.floor(xa);
    const ya0 = Math.floor(ya);
    const fxa = xa - xa0;
    const fya = ya - ya0;
    const pa = ya0 * w + xa0;
    const a = (img[pa] * (1 - fxa) + img[pa + 1] * fxa) * (1 - fya) + (img[pa + w] * (1 - fxa) + img[pa + w + 1] * fxa) * fya;
    const xb0 = Math.floor(xb);
    const yb0 = Math.floor(yb);
    const fxb = xb - xb0;
    const fyb = yb - yb0;
    const pb = yb0 * w + xb0;
    const b = (img[pb] * (1 - fxb) + img[pb + 1] * fxb) * (1 - fyb) + (img[pb + w] * (1 - fxb) + img[pb + w + 1] * fxb) * fyb;
    c[k] = Math.abs(a - b);
    m++;
  }
  if (m <= n / 2) return 0;
  const L = Math.max(1, Math.round(arc * n));
  const win = RING_W;
  let best = 0;
  /*
   * 창(L 칸)을 둘레를 따라 한 칸씩 옮기며 아래 25% 값 — 정렬된 창에서 나가는 값 하나를 빼고 들어오는 값 하나를 끼운다(창마다 새로
   * 정렬하던 것과 같은 값, 비교 함수를 부르지 않는다 — 수십만 번이라 이것이 시간의 대부분이었다).
   */
  let cnt = 0;
  const add = (v: number) => {
    if (v !== v) return;
    let p = cnt++;
    while (p > 0 && win[p - 1] > v) {
      win[p] = win[p - 1];
      p--;
    }
    win[p] = v;
  };
  for (let j = 0; j < L; j++) add(c[j % n]);
  const starts = arc < 1 ? n : 1;
  for (let st = 0; st < starts; st++) {
    if (st > 0) {
      const out = c[st - 1];
      if (out === out) {
        let p = 0;
        while (win[p] !== out) p++;
        for (; p < cnt - 1; p++) win[p] = win[p + 1];
        cnt--;
      }
      add(c[(st + L - 1) % n]);
    }
    if (cnt <= L / 2) continue;
    const q = win[Math.floor(0.25 * cnt)];
    if (q > best) best = q;
  }
  return best;
}

export type Ring = { x: number; y: number; r: number; score: number };

/**
 * 둥근 테두리 후보 여러 개 — 짐작 자리(px, py) 둘레 gate 안 점수의 봉우리(서로 0.8·r0 넘게 떨어진 것)를 점수 순으로 k 개,
 * 각각 0.25px · 반지름 ±8% 로 다듬는다. 반지름은 r0 × spread 중에서 고른다.
 */
export function findRings(
  img: ArrayLike<number>,
  w: number,
  h: number,
  px: number,
  py: number,
  r0: number,
  gate: number,
  k = 3,
  spread: number[] = [0.88, 1, 1.13],
  arc = 1,
  band = 1.5
): Ring[] {
  const radii = spread.map((q) => q * r0);
  const G = Math.ceil(gate);
  const N = 2 * G + 1;
  const map = new Float32Array(N * N);
  const rad = new Float32Array(N * N);
  const x0 = Math.round(px) - G;
  const y0 = Math.round(py) - G;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = x0 + i;
      const y = y0 + j;
      if ((x - px) ** 2 + (y - py) ** 2 > gate * gate) continue;
      let sb = 0;
      let rb = r0;
      for (const r of radii) {
        const s = ringScore(img, w, h, x, y, r, 24, arc, band);
        if (s > sb) {
          sb = s;
          rb = r;
        }
      }
      map[j * N + i] = sb;
      rad[j * N + i] = rb;
    }
  const peaks: Ring[] = [];
  for (let j = 1; j < N - 1; j++)
    for (let i = 1; i < N - 1; i++) {
      const s = map[j * N + i];
      if (!s) continue;
      let top = true;
      for (let dj = -1; dj <= 1 && top; dj++)
        for (let di = -1; di <= 1; di++)
          if ((di || dj) && map[(j + dj) * N + i + di] > s) {
            top = false;
            break;
          }
      if (top) peaks.push({ x: x0 + i, y: y0 + j, r: rad[j * N + i], score: s });
    }
  peaks.sort((a, b) => b.score - a.score);
  const out: Ring[] = [];
  for (const p of peaks) {
    if (out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.8 * r0)) continue;
    let fine = p;
    for (let dy = -1; dy <= 1; dy += 0.25)
      for (let dx = -1; dx <= 1; dx += 0.25)
        for (const q of [0.92, 1, 1.08]) {
          const s = ringScore(img, w, h, p.x + dx, p.y + dy, p.r * q, 32, arc, band);
          if (s > fine.score) fine = { x: p.x + dx, y: p.y + dy, r: p.r * q, score: s };
        }
    out.push(fine);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * 바로 앞 장면들(lags 장 전들의 중앙값)을 뺀 차이 |지금 − 배경| — 둘레 창만. 천 주름 · 그물코처럼 가만있는 무늬는 지워지고
 * 움직인 공만 남는다(공은 4장이면 제 지름보다 멀리 간다). 돌려주는 img 의 (0,0) 은 원본 (x0, y0).
 */
export function diffWindow(
  fs: FrameSet,
  i: number,
  cx: number,
  cy: number,
  half: number,
  lags: number[]
): { img: Float32Array; x0: number; y0: number; W: number; H: number } {
  const x0 = Math.max(0, Math.floor(cx - half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const x1 = Math.min(fs.w, Math.ceil(cx + half));
  const y1 = Math.min(fs.h, Math.ceil(cy + half));
  const W = Math.max(0, x1 - x0);
  const H = Math.max(0, y1 - y0);
  const img = new Float32Array(W * H);
  const fr = fs.luma[i];
  const past = lags.filter((k) => i - k >= 0).map((k) => fs.luma[i - k]);
  if (!past.length) return { img, x0, y0, W, H };
  const col = new Float64Array(past.length);
  const mid = past.length >> 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y + y0) * fs.w + x + x0;
      for (let k = 0; k < past.length; k++) {
        const v = past[k][p];
        let j = k - 1;
        while (j >= 0 && col[j] > v) {
          col[j + 1] = col[j];
          j--;
        }
        col[j + 1] = v;
      }
      img[y * W + x] = Math.abs(fr[p] - col[mid]);
    }
  return { img, x0, y0, W, H };
}

/* ───────────────────────────── 씨앗 · 이어 찾기 ───────────────────────────── */

const round = (b: Blob) => b.fill > 0.72 && b.bw / b.bh > 0.7 && b.bw / b.bh < 1.4;

export type Seed = { i: number; blob: Blob };

/**
 * 막 던진 공(씨앗) 후보 — 둥글고 큰(원본 면적 150px 넘게) 밝은 덩어리 중, 다음 장면에 조금 작아진(0.3~0.97배) 둥근 덩어리가
 * 1.5r 안에 있고 실제로 움직였거나(2px) 줄어든(0.85배) 것. 화면 아래 15%(땅 · 발)는 보지 않는다. 시각순으로.
 * from · to 를 주면 그 장면 사이만.
 */
export function findSeeds(
  fs: FrameSet,
  bg: ArrayLike<number>,
  from = 0,
  to = fs.t.length - 2
): Seed[] {
  const s = pixelScale(fs);
  const roi: [number, number, number, number] = [0, 0, fs.w, Math.round(fs.h * 0.85)];
  const out: Seed[] = [];
  for (let i = Math.max(0, from); i <= Math.min(fs.t.length - 2, to); i++) {
    const big = findBlobs(fs.luma[i], bg, fs.w, roi, 22, 30 * s * s).filter(
      (b) => round(b) && b.area > 150 * s * s
    );
    if (!big.length) continue;
    const next = findBlobs(fs.luma[i + 1], bg, fs.w, roi, 22, 20 * s * s).filter(round);
    for (const b of big.sort((p, q) => q.area - p.area)) {
      const r = Math.sqrt(b.area / Math.PI);
      const m = next.find((c) => {
        const d = Math.hypot(c.cx - b.cx, c.cy - b.cy);
        return c.area < b.area * 0.97 && c.area > b.area * 0.3 && d < 1.5 * r && (d > 2 * s || c.area < b.area * 0.85);
      });
      if (m) {
        out.push({ i, blob: b });
        break;
      }
    }
  }
  return out;
}

/**
 * 씨앗에서 덩어리를 이어 간다 — 앞 두 장으로 다음 자리를 짐작(움직임의 0.8배), 문(gate) 안에서 가장 가까운 덩어리. 면적은
 * 앞 장의 0.25~1.6배(+20). 두 장까지 건너뛴다. 중심은 원 안의 밝기 무게로 다듬는다.
 */
export function blobTrack(fs: FrameSet, bg: ArrayLike<number>, seed: Seed): TrackedBall[] {
  const s = pixelScale(fs);
  const { w, h } = fs;
  const raw: { i: number; b: Blob }[] = [{ i: seed.i, b: seed.blob }];
  const n = fs.t.length;
  for (let i = seed.i + 1; i < n; i++) {
    const last = raw[raw.length - 1];
    const prev = raw.length > 1 ? raw[raw.length - 2] : null;
    const r = Math.sqrt(last.b.area / Math.PI);
    const step = prev ? Math.hypot(last.b.cx - prev.b.cx, last.b.cy - prev.b.cy) : 0;
    const px = prev ? last.b.cx + (last.b.cx - prev.b.cx) * 0.8 : last.b.cx;
    const py = prev ? last.b.cy + (last.b.cy - prev.b.cy) * 0.8 : last.b.cy;
    const gate = Math.max(12 * s, 3 * r, prev ? 1.5 * step : 60 * s);
    const box: [number, number, number, number] = [
      Math.max(0, Math.floor(px - gate)),
      Math.max(0, Math.floor(py - gate)),
      Math.min(w, Math.ceil(px + gate)),
      Math.min(h, Math.ceil(py + gate)),
    ];
    const cand = findBlobs(fs.luma[i], bg, w, box, 18, Math.max(2, 3 * s * s)).filter(
      (b) => b.area < last.b.area * 1.6 + 20 * s * s && b.area > last.b.area * 0.25
    );
    let best: Blob | null = null;
    let bd = Infinity;
    for (const b of cand) {
      const d = Math.hypot(b.cx - px, b.cy - py);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best || bd > gate) {
      if (i - last.i > 2) break;
      continue;
    }
    raw.push({ i, b: best });
  }
  return raw.map(({ i, b }) => {
    const r = Math.sqrt(b.area / Math.PI);
    const f = refineCenter(fs.luma[i], bg, w, h, b.cx, b.cy, Math.max(4 * s, r * 1.6), 10);
    return {
      i,
      t: fs.t[i],
      u: f ? f.cx : b.cx,
      v: f ? f.cy : b.cy,
      diam: f ? f.diam : 2 * r,
    };
  });
}

/* ───────────────────────────── 물리로 거르기 ───────────────────────────── */

/** 덩어리 중심의 오차 폭(분석 px) — 바탕 0.4px(원본) + 지름의 1.5%(번짐 · 손) */
export function blobSigma(diam: number, s: number): number {
  return 0.4 * s + 0.015 * diam;
}
/** 둥근 테두리 중심의 오차 폭(분석 px) — 흰 천 앞 반달 · 미트 앞이라 넓게 */
export function ringSigma(r: number, s: number): number {
  return 0.6 * s + 0.08 * r;
}

export function toPoints(track: TrackedBall[], s: number): (TrackPoint & TrackedBall)[] {
  return track.map((o) => ({ ...o, sigma: o.ring ? ringSigma(o.diam / 2, s) : blobSigma(o.diam, s) }));
}

/**
 * 물리 궤적에 다 맞는 가장 긴 앞부분 — 끝에서 한 장씩 줄여 가며, 마지막 4장의 잔차가 모두 2px(원본) 안이고 전체 RMS 가
 * 1.6px 안인 첫 길이. 앞의 손 붙은 점(3σ 넘게 · 2.5px 넘게)은 4장까지 걷는다. 못 찾으면 null.
 */
export function consistentPrefix(
  pts: (TrackPoint & TrackedBall)[],
  cam: PinholeCamera,
  dt: number,
  s: number,
  minLen = 8,
  dragScaleM = 20
): { seg: (TrackPoint & TrackedBall)[]; fit: TrajectoryFit } | null {
  for (let e = pts.length; e >= minLen; e--) {
    let seg = pts.slice(0, e);
    let f = fitTrajectory(seg, seg[seg.length - 1].t + dt / 2, cam, { dragScaleM });
    let a = 0;
    while (a < 4 && f.resid[a] > 3 * Math.max(0.5 * s, f.rms) && f.resid[a] > 2.5 * s) a++;
    if (a) {
      seg = seg.slice(a);
      if (seg.length < minLen) continue;
      f = fitTrajectory(seg, seg[seg.length - 1].t + dt / 2, cam, { dragScaleM });
    }
    if (Math.max(...f.resid.slice(-4)) <= 2 * s && f.rms <= 1.6 * s) return { seg, fit: f };
  }
  return null;
}

/* ───────────────────────────── 끝까지 이어 찾기(RANSAC) ───────────────────────────── */

/**
 * 줄에 붙는 후보의 허용 폭(σ 배). 흰 천 앞 공은 그늘진 아래 반달만 보여 테두리 중심이 반지름에 비례해 밀린다 — 2.5σ 면 합성 흰 천
 * 장면이 끝까지 못 이어 +15%, 3.5σ 면 −2.3%. 넓혀 생긴 가짜는 줄의 촘촘함으로 거른다(아래).
 */
const RUN_TOL_SIGMA = 3.5;

export type ExtendResult = {
  pts: (TrackPoint & TrackedBall)[];
  added: number;
  /** 덩어리 중심 − 테두리 중심 어긋남(분석 px) — 앞부분 끝에서 잰 것, 테두리 점에서 뺐다 */
  offset: [number, number];
};

/**
 * 공을 끝까지 못 따라갔을 때(흰 천 앞 · 포수 앞) 늘린 궤적 둘레에서 이어 찾는다(RANSAC).
 *  - 후보: 늘린 궤적 자리 둘레(문은 멀수록 넓게)에서 '바로 앞 장면들을 뺀 차이 그림'의 둥근 후보(반 바퀴 점수) 4개씩
 *  - 가설: 후보 둘(다른 장면)로 궤적을 다시 맞추고, 앞부분 끝에서부터 그 궤적에 붙는 후보가 몇 장 이어지나(빈 장 maxGap 까지)
 *  - 가장 길게 이어지는 줄(같으면 잔차 합이 작은 것)을 두 번 다듬고, 끝에 4장 넘게 떨어져 홀로 붙은 점은 버린다(미트에 잡힌
 *    뒤의 우연한 점이 비행 끝을 늦춘다).
 * 진짜 공은 길게 이어지고, 맞은 뒤 흔들리는 그물 · 미트 · 천 주름은 물리 궤적 하나로 길게 이어지지 않는다 — 밖 영상 13개는 하나도
 * 덧붙지 않았다(2026-10-07). 덩어리 중심은 테두리보다 2~4px 치우쳐 있어(실내 119_33) 그 어긋남을 앞부분 끝에서 재 테두리
 * 후보에서 뺀다 — 자유 값으로 맞추게 하면 그 자유도로 엉뚱한 점까지 붙었다.
 */
export function extendRansac(
  fs: FrameSet,
  seg: (TrackPoint & TrackedBall)[],
  cam: PinholeCamera,
  fps: number,
  opts: { iters?: number; maxGapSec?: number; K?: number; dragScaleM?: number; raw?: boolean } = {}
): ExtendResult {
  const s = pixelScale(fs);
  const dt = 1 / fps;
  const per60 = fps / 60;
  const { iters = 250, K = 4, dragScaleM = 20 } = opts;
  const maxGap = Math.max(1, Math.round((opts.maxGapSec ?? 3 / 60) * fps));
  const pts = seg.map((o) => ({ ...o }));
  const last = pts[pts.length - 1];
  const fit0 = fitTrajectory(pts, last.t + dt / 2, cam, { dragScaleM });
  const band = Math.max(1, 1.5 * s);
  /* 공 반지름: 앞부분 끝 4장에서 둥근 테두리로 다시 잰다(밝기 덩어리 지름은 30% 넘게 부풀려져 있다). 반지름 × 깊이 = 일정 */
  const rs: number[] = [];
  /* 끝 8장의 중앙값 — 끝 몇 장은 공이 배경 띠에 걸쳐 테두리가 틀린 반지름에 걸리곤 했다(실내 098) */
  for (const o of pts.slice(-8)) {
    const g = findRings(fs.luma[o.i], fs.w, fs.h, o.u, o.v, o.diam / 2, 2 * s, 1, [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1], 1, band)[0];
    if (g) rs.push(g.r * fit0.project(o.t)[2]);
  }
  rs.sort((a, b) => a - b);
  const kR = rs.length ? rs[rs.length >> 1] : (last.diam / 2) * 0.75 * fit0.project(last.t)[2];
  /* 덩어리 중심 − 테두리 중심 어긋남 — 앞부분 끝 6장에서 크고 또렷하고 둥근 공만 */
  const dd: [number, number][] = [];
  for (const o of pts.slice(-6)) {
    const g = findRings(fs.luma[o.i], fs.w, fs.h, o.u, o.v, (o.diam / 2) * 0.75, Math.max(3 * s, 0.2 * o.diam), 1, [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2], 1, band)[0];
    if (g && g.r >= 6 * s && g.score >= 25 && Math.hypot(g.x - o.u, g.y - o.v) <= 0.5 * g.r) dd.push([g.x - o.u, g.y - o.v]);
  }
  const mid = (a: number[]) => {
    const b = [...a].sort((x, y) => x - y);
    return b[b.length >> 1];
  };
  const offset: [number, number] = dd.length >= 3 ? [mid(dd.map((d) => d[0])), mid(dd.map((d) => d[1]))] : [0, 0];
  const lags = [4, 6, 8].map((k) => Math.max(1, Math.round(k * per60)));

  /* 1) 후보 모으기 */
  type Cand = TrackPoint & TrackedBall & { score: number };
  const frames: { i: number; c: Cand[] }[] = [];
  const maxAhead = Math.round(45 * per60);
  for (let i = last.i + 1; i < fs.t.length && i <= last.i + maxAhead; i++) {
    const [pu, pv, Z] = fit0.project(fs.t[i]);
    const rp = kR / Z;
    if (!(rp >= 3 * s)) break;
    const gate = Math.min(25 * s, 6 * s + (0.8 * s * (i - last.i)) / per60);
    const dw = diffWindow(fs, i, pu, pv, gate + 1.4 * rp + 4 * s, lags);
    const spread = [0.75, 0.85, 0.95, 1.05, 1.15, 1.25];
    const toCand = (g: { x: number; y: number; r: number; score: number }, x0: number, y0: number): Cand => ({
      i,
      t: fs.t[i],
      u: g.x + x0 - offset[0],
      v: g.y + y0 - offset[1],
      diam: 2 * g.r,
      score: g.score,
      sigma: ringSigma(g.r, s),
      ring: true,
    });
    const c = findRings(dw.img, dw.W, dw.H, pu - dw.x0, pv - dw.y0, rp, gate, K, spread, 0.5, band)
      .filter((g) => g.score >= 8)
      .map((g) => toCand(g, dw.x0, dw.y0));
    /*
     * (기본 끔) 원래 그림에서도 — 어두운 미트 · 몸 앞의 공은 원래 그림에서 또렷한 원이라 넣어 봤더니, 밖 그물에서 맞은 뒤의 가짜가
     * 붙고(119_cb −15.8) 실내도 나빠졌다(2026-10-07 19개). 공 찾기 모델이 생기면 다시 본다.
     */
    if (opts.raw === true)
      for (const g of findRings(fs.luma[i], fs.w, fs.h, pu, pv, rp, gate, 2, spread, 0.5, band)) {
        if (g.score < 15) continue;
        const cand = toCand(g, 0, 0);
        if (!c.some((o) => Math.hypot(o.u - cand.u, o.v - cand.v) < 0.5 * g.r)) c.push(cand);
      }
    frames.push({ i, c });
  }
  const all = frames.flatMap((f) => f.c);
  if (all.length < 2) return { pts, added: 0, offset };

  /* 2) 줄 세우기: 궤적 f 에 붙는 후보를 앞부분 끝에서부터 — 장면마다 가장 가까운 것 */
  const runOf = (f: TrajectoryFit) => {
    const run: Cand[] = [];
    let gap = 0;
    for (const fr of frames) {
      const [u, v] = f.project(fs.t[fr.i]);
      let b: Cand | null = null;
      let bd = Infinity;
      for (const c of fr.c) {
        const d = Math.hypot(c.u - u, c.v - v);
        if (d < bd) {
          bd = d;
          b = c;
        }
      }
      if (b && bd <= Math.max(1.5 * s, RUN_TOL_SIGMA * b.sigma)) {
        run.push(b);
        gap = 0;
      } else if (++gap > maxGap) break;
    }
    return run;
  };
  let best: { run: Cand[]; err: number; f: TrajectoryFit | null } = { run: [], err: Infinity, f: null };
  /* 늘 같은 결과가 나오게 — 결정적 난수 */
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < iters; k++) {
    const a = all[Math.floor(rnd() * all.length)];
    const b = all[Math.floor(rnd() * all.length)];
    if (a.i === b.i) continue;
    const [p, q] = a.i < b.i ? [a, b] : [b, a];
    const te = q.t + dt / 2;
    const f = fitTrajectory([...pts, p, q], te, cam, { dragScaleM, init: rebase(fit0, te) });
    if (f.resid[f.resid.length - 1] > 3 * q.sigma || f.resid[f.resid.length - 2] > 3 * p.sigma) continue;
    const run = runOf(f);
    if (!run.includes(p) || !run.includes(q)) continue;
    const err = run.reduce((acc, c) => {
      const [u, v] = f.project(c.t);
      return acc + Math.hypot(c.u - u, c.v - v);
    }, 0);
    if (run.length > best.run.length || (run.length === best.run.length && err < best.err)) best = { run, err, f };
  }
  /* 3) 다듬기 — 고른 줄로 다시 맞춰 한 번 더 줄 세우기 */
  if (best.run.length >= 3 && best.f) {
    for (let r = 0; r < 2; r++) {
      const te = best.run[best.run.length - 1].t + dt / 2;
      const f = fitTrajectory([...pts, ...best.run], te, cam, { dragScaleM, init: rebase(best.f as TrajectoryFit, te) });
      const run = runOf(f);
      if (run.length >= best.run.length) best = { ...best, run, f };
      else break;
    }
  }
  /* 끝에 4장(60fps 기준) 넘게 떨어져 홀로 붙은 점은 버린다 */
  const isolated = Math.round(4 * per60);
  while (best.run.length >= 2 && best.run[best.run.length - 1].i - best.run[best.run.length - 2].i >= isolated) best.run.pop();
  if (best.run.length < 3) return { pts, added: 0, offset };
  /*
   * 줄이 걸친 장면의 70% 넘게 차야 한다 — 진짜 공은 촘촘히 이어지고(실내 086: 11장 모두, 111_00: 21장 중 15장), 밖 그물에서 맞은
   * 뒤의 우연한 점은 짧고 듬성듬성하다(076: 9장 중 5, 119_cb: 10장 중 6). 허용 폭을 넓혀(흰 천 앞 반달 중심이 반지름에 비례해
   * 밀린다) 생긴 가짜를 여기서 거른다.
   */
  const span = best.run[best.run.length - 1].i - best.run[0].i + 1;
  const density = best.run.length / span;
  /* 길게(10장 넘게 — 60fps 기준) 이어진 줄은 듬성해도(55%) 받는다 — 흰 천 · 포수 앞 공은 몇 장씩 빠진다(실내 119_33: 20장 중 12) */
  const long = best.run.length >= Math.round(10 * per60);
  if (!(density >= 0.7 || (long && density >= 0.55))) return { pts, added: 0, offset };
  return { pts: [...pts, ...best.run], added: best.run.length, offset };
}
