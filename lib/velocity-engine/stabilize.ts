/**
 * 흔들린 화면 바로잡기(엔진 2.2) — 손에 든 폰 · 흔들리는 삼각대.
 *
 * 2.x 는 공의 화면 자리가 시간에 따라 모이는 모양(원근)으로 깊이 비율을 얻는다. 그래서 카메라가 조금만 흔들려도 그 모양이 비틀린다 —
 * 실험대에서 영상 19개를 가짜로 흔들었더니(scripts/velocity-lab/engine2-lab.mts --shake) 2px(분석 720) 에 밖 13개의 평균 오차가
 * 1.6 → 8.6km/h, 5px 면 13개 중 8개를 못 쟀다. 카메라가 돌면 먼 배경과 공은 깊이와 상관없이 같이 옮겨 가므로, 장면마다 배경이 기준
 * 장면(구간 첫 장면)에서 옮겨 간 양을 재서
 *  1) 1px 넘게 움직였으면 장면을 돌림까지 옮겨 맞추고(가장 가까운 화소 — 배경 빼기 · 공 찾기가 가만한 화면을 본다. 정수 px 로만
 *     옮기면 돌림이 남아 0.3° 에 밖 13개 중 3개를 틀렸다), 반올림으로 생긴 소수 px 는 찾은 공 자리에서 되돌리고,
 *  2) 그보다 작으면 장면은 두고 찾은 공 자리만 기준 장면 자리로 되돌린다(toRef — 삼각대가 0.3~0.8px 흔들린 밖 영상들).
 *
 * 재는 법: 기준 장면에서 무늬가 뚜렷하고(구조 텐서의 작은 고윳값 — 한 방향 선만 있으면 그 방향 움직임을 모른다) 둘레에 닮은 곳이
 * 없는(되풀이 무늬가 아닌) 블록을 고른다. 실내 타격 터널의 그물은 같은 무늬가 되풀이돼 블록이 옆 그물코에 맞아 15~85px 를 흔들림으로
 * 읽었다(2026-10-07 실내 6개). 장면마다 각 블록이 옮겨 간 양은 앞 장면 값에서 시작해 '평균을 뺀 차이 제곱합'이 줄어드는 쪽으로
 * 한 px 씩 옮겨 가며 찾고(노출이 바뀌어도 된다 — 손떨림은 한 장에 몇 px 라 앞 장면 둘레에 있다), 포물선으로 소수 px 까지. 블록 둘씩으로
 * 옮김 · 돌림을 세워 가장 많은 블록이 맞는 것을 고르고(RANSAC) 그 블록들로 다시 맞춘다 — 투수 · 공 · 포수처럼 따로 움직이는 블록은
 * 빠진다. 앞 장면 둘레에서 못 맞추면(크게 흔들림) 1/4 해상도로 넓게 찾되, 한 장에 12px 넘게 뛰면 믿지 않는다.
 * 무늬가 없는 화면(흰 벽 · 하늘만)은 블록이 모자라 바로잡지 않는다(부르는 쪽이 예전처럼 흔들림 문턱으로 거른다).
 *
 * 카메라가 옮겨 가는 것(돌지 않고 밀림)은 가까운 것일수록 많이 옮겨 가 배경으로는 못 바로잡는다 — 손떨림은 대개 돌림이라 먼 공은
 * 맞고, 릴리스 근처(1~3m)의 공만 조금 남는다.
 */
import type { CapturedFrame } from './analyze-frames.ts';

/** 기준 장면의 점 p 가 이 장면에서는 c + R(th)(p − c) + (tx, ty) 에 보인다(분석 px · 라디안, c 는 화면 가운데) */
export type Motion = {
  tx: number;
  ty: number;
  th: number;
  /** 장면을 기준 장면에 맞춰 옮겼나(warp) — 옮겼으면 그 장면에서 찾은 자리가 곧 기준 장면 자리 */
  warp: boolean;
};

export type Stabilized = {
  /** 맞춘 장면 · 맞춘 배경 장면(바로잡지 않았으면 받은 그대로) */
  frames: CapturedFrame[];
  extra: ArrayLike<number>[];
  /** 장면마다의 움직임 — 바로잡지 않았으면 null */
  motion: Motion[] | null;
  /** 가장 크게 움직인 양(분석 px — 옮김 + 화면 가장자리에서 돌림) */
  maxShiftPx: number;
  /** 맞춘 블록들이 고른 움직임에서 벗어난 RMS 의 가운데 값(분석 px) — 바로잡은 정밀도 */
  residPx: number;
  /** 블록이 모자라 못 잰 장면 수 */
  failed: number;
  /** 움직임을 쟀나 — 무늬가 모자라거나 장면을 많이 못 재면 false(흔들림을 모른다) */
  measured: boolean;
  /** 들쭉날쭉한 정도(분석 px) — 움직임에서 시간의 2차식을 뺀 나머지의 가장 큰 값. 못 쟀으면 0 */
  jerkPx?: number;
};

/** 블록 — 원 해상도 왼쪽 위(x, y) · 1/4 해상도 왼쪽 위(qx, qy), 평균을 뺀 기준 밝기와 그 에너지 */
type Block = {
  x: number;
  y: number;
  qx: number;
  qy: number;
  /** 블록 가운데(원 해상도) */
  cx: number;
  cy: number;
  ref: Float32Array;
  refQ: Float32Array;
  e: number;
  eQ: number;
};

/** 블록 크기 — 원 해상도 · 1/4 해상도(같은 가운데, 1/4 쪽이 조금 넓다) */
const B = 32;
const BQ = 10;
/** 고를 블록 수 · 무늬 문턱(1/4 해상도 블록의 작은 고윳값 ÷ 화소 수) · 닮은 곳 문턱(둘레에서 가장 닮은 곳의 차이 ÷ 에너지) */
const MAX_BLOCKS = 36;
const MIN_TEXTURE = 6;
const UNIQUE_MIN = 0.5;
/** 닮은 곳을 볼 후보 수 — 무늬가 뚜렷한 순으로 */
const UNIQUE_TRIES = 400;
/** 들쭉날쭉한 흔들림(분석 720 기준 px, 움직임에서 시간의 2차식을 뺀 나머지의 가장 큰 값) — 이보다 작으면 바로잡지 않는다 */
const JERK_MIN_PX = 1.5;
/** 들쭉날쭉한 정도를 보는 구간(초) — 구간 첫 장면부터 공이 나는 동안 */
const JERK_WINDOW_SEC = 0.9;
/** 장면을 옮겨 맞추는 움직임(분석 720 기준 px) — 이보다 작으면 공 자리만 고친다 */
const WARP_MIN_PX = 1;
/** 1/4 해상도에서 넓게 보는 폭(±, 1/4 px) — 원 해상도 ±40px */
const WIDE_Q = 10;
/** 맞은 블록으로 볼 '남은 차이 ÷ 에너지' 문턱 · 움직임에서 벗어나도 되는 폭(원 px) */
const MAX_RESIDUAL = 0.35;
const INLIER_PX = 0.75;
/** 장면 하나에 맞은 블록이 이만큼은 있어야 */
const MIN_INLIERS = 6;
/** 맞은 블록 가운데의 표준편차가 화면 가로 · 세로의 이만큼은 돼야 카메라 움직임(spread) */
const SPREAD_X = 0.08;
const SPREAD_Y = 0.06;
/** 넓게 찾은 값이 앞 장면에서 이만큼(분석 720 기준 px) 넘게 뛰면 믿지 않는다(되풀이 무늬에 걸린 것) */
const MAX_JUMP_PX = 24;
/** 한 px 씩 옮겨 가며 찾는 횟수 — 짐작(앞 장면 + 그 앞과의 차이)에서 시작해 이만큼까지 */
const DESCENT_STEPS = 12;

const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 1/4 해상도(4×4 평균) */
function quarter(img: ArrayLike<number>, w: number, h: number): Float32Array {
  const W = w >> 2;
  const H = h >> 2;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const r0 = 4 * y * w;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = 0; dy < 4; dy++) {
        const p = r0 + dy * w + 4 * x;
        s += img[p] + img[p + 1] + img[p + 2] + img[p + 3];
      }
      out[y * W + x] = s / 16;
    }
  }
  return out;
}

/** 평균을 뺀 블록과 그 에너지(제곱합) */
function zeroMean(
  img: ArrayLike<number>,
  w: number,
  x0: number,
  y0: number,
  n: number
): { v: Float32Array; e: number } {
  const v = new Float32Array(n * n);
  let s = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) s += v[y * n + x] = img[(y0 + y) * w + x0 + x];
  const m = s / (n * n);
  let e = 0;
  for (let k = 0; k < n * n; k++) {
    v[k] -= m;
    e += v[k] * v[k];
  }
  return { v, e };
}

/** 평균을 뺀 차이 제곱합 ÷ 기준 에너지 — img 의 (x0, y0) 블록과 기준 블록(평균을 뺀 ref). 0 이면 똑같다, 1 이면 닮지 않았다 */
function zssd(
  img: ArrayLike<number>,
  w: number,
  x0: number,
  y0: number,
  ref: Float32Array,
  e: number,
  n: number
): number {
  let s1 = 0;
  let s2 = 0;
  let sc = 0;
  for (let y = 0; y < n; y++) {
    const row = (y0 + y) * w + x0;
    const rr = y * n;
    for (let x = 0; x < n; x++) {
      const c = img[row + x];
      s1 += c;
      s2 += c * c;
      sc += c * ref[rr + x];
    }
  }
  return (s2 - (s1 * s1) / (n * n) - 2 * sc + e) / e;
}

/**
 * 기준 장면에서 쓸 블록 — 무늬가 뚜렷하고(MIN_TEXTURE) 둘레 ±40px 에 닮은 곳이 없는(UNIQUE_MIN) 것. 화면 아래 15%(땅 · 발)와 넓게 볼
 * 가장자리는 빼고, 화면을 4×6 칸으로 나눠 칸마다 가장 뚜렷한 것부터 고르게 퍼지게.
 */
function pickBlocks(
  ref: ArrayLike<number>,
  refQ: Float32Array,
  w: number,
  h: number
): Block[] {
  const W = w >> 2;
  const H = h >> 2;
  const m = WIDE_Q + 4;
  const cand: { qx: number; qy: number; score: number }[] = [];
  for (let qy = m; qy + BQ + m <= Math.floor(H * 0.85); qy += 4)
    for (let qx = m; qx + BQ + m <= W; qx += 4) {
      let ixx = 0;
      let iyy = 0;
      let ixy = 0;
      for (let y = qy + 1; y < qy + BQ - 1; y++)
        for (let x = qx + 1; x < qx + BQ - 1; x++) {
          const gx = (refQ[y * W + x + 1] - refQ[y * W + x - 1]) / 2;
          const gy = (refQ[(y + 1) * W + x] - refQ[(y - 1) * W + x]) / 2;
          ixx += gx * gx;
          iyy += gy * gy;
          ixy += gx * gy;
        }
      const n = (BQ - 2) ** 2;
      const lmin =
        (ixx + iyy) / 2 / n - Math.sqrt(((ixx - iyy) / 2 / n) ** 2 + (ixy / n) ** 2);
      if (lmin >= MIN_TEXTURE) cand.push({ qx, qy, score: lmin });
    }
  cand.sort((p, q) => q.score - p.score);
  /* 닮은 곳이 없는 것만 — 무늬가 뚜렷한 순으로 UNIQUE_TRIES 개까지 본다 */
  const unique: typeof cand = [];
  for (const c of cand.slice(0, UNIQUE_TRIES)) {
    const z = zeroMean(refQ, W, c.qx, c.qy, BQ);
    let m2 = Infinity;
    for (let dy = -WIDE_Q; dy <= WIDE_Q && m2 >= UNIQUE_MIN; dy++)
      for (let dx = -WIDE_Q; dx <= WIDE_Q; dx++) {
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
        const s = zssd(refQ, W, c.qx + dx, c.qy + dy, z.v, z.e, BQ);
        if (s < m2) m2 = s;
        if (m2 < UNIQUE_MIN) break;
      }
    if (m2 >= UNIQUE_MIN) unique.push(c);
  }
  const chosen: typeof cand = [];
  const far = (c: { qx: number; qy: number }) =>
    chosen.every((o) => Math.hypot(o.qx - c.qx, o.qy - c.qy) >= 1.2 * BQ);
  const cellOf = (c: { qx: number; qy: number }) =>
    Math.min(3, Math.floor((c.qx / W) * 4)) +
    4 * Math.min(5, Math.floor((c.qy / H) * 6));
  const used = new Set<number>();
  for (const c of unique) {
    const k = cellOf(c);
    if (used.has(k) || !far(c)) continue;
    used.add(k);
    chosen.push(c);
  }
  for (const c of unique) {
    if (chosen.length >= MAX_BLOCKS) break;
    if (!chosen.includes(c) && far(c)) chosen.push(c);
  }
  return chosen.map(({ qx, qy }) => {
    /* 원 해상도 블록은 1/4 블록과 같은 가운데에 */
    const x = clampI(Math.round(4 * (qx + BQ / 2) - B / 2), 0, w - B);
    const y = clampI(Math.round(4 * (qy + BQ / 2) - B / 2), 0, h - B);
    const f = zeroMean(ref, w, x, y, B);
    const q = zeroMean(refQ, W, qx, qy, BQ);
    return {
      x,
      y,
      qx,
      qy,
      cx: x + B / 2,
      cy: y + B / 2,
      ref: f.v,
      refQ: q.v,
      e: f.e,
      eQ: q.e,
    };
  });
}

/** 세 점(−1, 0, +1)의 값으로 포물선 꼭짓점(−0.5~0.5) */
function vertex(a: number, b: number, c: number): number {
  const den = a - 2 * b + c;
  if (!(den > 1e-9)) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
}

type BlockShift = { cx: number; cy: number; dx: number; dy: number };

/**
 * 블록 하나가 이 장면에서 옮겨 간 양(원 px, 소수) — (gx, gy) 에서 시작해 차이가 줄어드는 이웃으로 한 px 씩(DESCENT_STEPS 번까지),
 * 포물선으로 소수 px. 남은 차이가 크면 null(가려짐 · 따로 움직임).
 */
function descend(
  cur: ArrayLike<number>,
  w: number,
  h: number,
  b: Block,
  gx: number,
  gy: number
): BlockShift | null {
  const seen = new Map<number, number>();
  const at = (dx: number, dy: number) => {
    const key = (dy + 4096) * 8192 + dx + 4096;
    let s = seen.get(key);
    if (s === undefined) {
      const x0 = b.x + dx;
      const y0 = b.y + dy;
      s =
        x0 < 0 || y0 < 0 || x0 + B > w || y0 + B > h
          ? Infinity
          : zssd(cur, w, x0, y0, b.ref, b.e, B);
      seen.set(key, s);
    }
    return s;
  };
  let bx = Math.round(gx);
  let by = Math.round(gy);
  let best = at(bx, by);
  for (let step = 0; step < DESCENT_STEPS; step++) {
    let nx = bx;
    let ny = by;
    let nb = best;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const s = at(bx + dx, by + dy);
        if (s < nb) {
          nb = s;
          nx = bx + dx;
          ny = by + dy;
        }
      }
    if (nx === bx && ny === by) break;
    bx = nx;
    by = ny;
    best = nb;
  }
  if (!(best <= MAX_RESIDUAL)) return null;
  const sx = vertex(at(bx - 1, by), best, at(bx + 1, by));
  const sy = vertex(at(bx, by - 1), best, at(bx, by + 1));
  return { cx: b.cx, cy: b.cy, dx: bx + sx, dy: by + sy };
}

/** 1/4 해상도로 넓게(±40px) 찾은 자리(원 px, 정수) — 닮지 않았으면 null */
function wideGuess(
  curQ: Float32Array,
  w: number,
  h: number,
  b: Block,
  gx: number,
  gy: number
): [number, number] | null {
  const W = w >> 2;
  const H = h >> 2;
  const cqx = Math.round(gx / 4);
  const cqy = Math.round(gy / 4);
  let qb = Infinity;
  let bx = cqx;
  let by = cqy;
  for (let dy = cqy - WIDE_Q; dy <= cqy + WIDE_Q; dy++)
    for (let dx = cqx - WIDE_Q; dx <= cqx + WIDE_Q; dx++) {
      const x0 = b.qx + dx;
      const y0 = b.qy + dy;
      if (x0 < 0 || y0 < 0 || x0 + BQ > W || y0 + BQ > H) continue;
      const s = zssd(curQ, W, x0, y0, b.refQ, b.eQ, BQ);
      if (s < qb) {
        qb = s;
        bx = dx;
        by = dy;
      }
    }
  return qb < 1 ? [4 * bx, 4 * by] : null;
}

/** 옮김 · 돌림을 블록들의 옮겨 간 양에 맞춘다(작은 각) — d = t + th·(−(y − cy), x − cx) */
function fitMotion(
  list: BlockShift[],
  cx: number,
  cy: number
): { tx: number; ty: number; th: number } | null {
  /* 미지수 tx · ty · th 의 정규방정식 — tx · ty 는 서로 얽히지 않아 th 하나로 줄인다 */
  let n = 0;
  let spx = 0;
  let spy = 0;
  let sdx = 0;
  let sdy = 0;
  let spp = 0;
  let spd = 0;
  for (const s of list) {
    const px = -(s.cy - cy);
    const py = s.cx - cx;
    n++;
    spx += px;
    spy += py;
    sdx += s.dx;
    sdy += s.dy;
    spp += px * px + py * py;
    spd += px * s.dx + py * s.dy;
  }
  if (!n) return null;
  const det = spp - (spx * spx + spy * spy) / n;
  /* 블록이 몰려 돌림을 모르면(서로 30px 안) 옮김만 */
  if (!(det > 1e3 * n)) return { tx: sdx / n, ty: sdy / n, th: 0 };
  const th = (spd - (spx * sdx + spy * sdy) / n) / det;
  return { tx: (sdx - spx * th) / n, ty: (sdy - spy * th) / n, th };
}

function residualOf(
  s: BlockShift,
  m: { tx: number; ty: number; th: number },
  cx: number,
  cy: number
): number {
  return Math.hypot(
    s.dx - (m.tx - m.th * (s.cy - cy)),
    s.dy - (m.ty + m.th * (s.cx - cx))
  );
}

/**
 * 맞은 블록들이 화면에 넓게 퍼졌나 — 카메라가 움직이면 화면 전체가 같이 움직인다. 한쪽에 모인 블록이 같이 움직인 것은 포수 · 사람 ·
 * 흔들리는 그물이다(실내 114: 포수 쪽 블록을 따라가 카메라가 35px 움직였다고 읽었다). 퍼짐은 블록 가운데의 표준편차로 본다.
 */
function spread(list: BlockShift[], w: number, h: number): boolean {
  const n = list.length;
  const mx = list.reduce((a, s) => a + s.cx, 0) / n;
  const my = list.reduce((a, s) => a + s.cy, 0) / n;
  const sx = Math.sqrt(list.reduce((a, s) => a + (s.cx - mx) ** 2, 0) / n);
  const sy = Math.sqrt(list.reduce((a, s) => a + (s.cy - my) ** 2, 0) / n);
  return sx >= SPREAD_X * w && sy >= SPREAD_Y * h;
}

/**
 * 블록 둘씩으로 움직임을 세워 가장 많은 블록이 맞는 것(RANSAC — 블록 수가 적어 모든 쌍) → 맞은 블록으로 다시 맞춤. 맞은 블록이 화면에
 * 넓게 퍼진 움직임만(spread).
 */
function consensus(
  list: BlockShift[],
  cx: number,
  cy: number
): { m: { tx: number; ty: number; th: number }; inliers: number; rms: number } | null {
  if (list.length < MIN_INLIERS) return null;
  const w = 2 * cx;
  const h = 2 * cy;
  let best: BlockShift[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const m = fitMotion([list[i], list[j]], cx, cy);
      if (!m) continue;
      let k = 0;
      for (const s of list) if (residualOf(s, m, cx, cy) <= INLIER_PX) k++;
      if (k <= best.length) continue;
      const ins = list.filter((s) => residualOf(s, m, cx, cy) <= INLIER_PX);
      if (spread(ins, w, h)) best = ins;
    }
  if (best.length < MIN_INLIERS) return null;
  let m = fitMotion(best, cx, cy) as { tx: number; ty: number; th: number };
  /* 한 번 더 — 다시 맞춘 움직임으로 맞는 블록을 다시 고른다 */
  const again = list.filter((s) => residualOf(s, m, cx, cy) <= INLIER_PX);
  if (again.length >= best.length && spread(again, w, h)) {
    m = fitMotion(again, cx, cy) as { tx: number; ty: number; th: number };
    best = again;
  }
  const rms = Math.sqrt(
    best.reduce((a, s) => a + residualOf(s, m, cx, cy) ** 2, 0) / best.length
  );
  return { m, inliers: best.length, rms };
}

/**
 * 기준 장면에 맞춘 장면 — A(p) = src(round(c + R(th)(p − c) + t)), 밖은 가장자리 값. 가장 가까운 화소를 그대로 가져온다 — 쌍선형으로
 * 옮기면 장면마다 흐려지는 정도가 달라 먼 공(7~10px)의 덩어리 크기가 흔들려 밖 13개가 오히려 틀렸다(2px 흔들림에 평균 오차 1.2 →
 * 2.4km/h). 반올림으로 생긴 소수 px(±0.5)는 찾은 공 자리에서 되돌린다(toRef).
 */
export function warpLuma(
  src: ArrayLike<number>,
  w: number,
  h: number,
  m: Motion
): Uint8Array {
  const out = new Uint8Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  const co = Math.cos(m.th);
  const sn = Math.sin(m.th);
  const xmax = w - 1;
  const ymax = h - 1;
  for (let y = 0; y < h; y++) {
    /* x 가 1 늘 때 원래 장면 자리는 (co, sn) 만큼 */
    let qx = cx + co * -cx - sn * (y - cy) + m.tx + 0.5;
    let qy = cy + sn * -cx + co * (y - cy) + m.ty + 0.5;
    const o = y * w;
    for (let x = 0; x < w; x++, qx += co, qy += sn) {
      const X = qx < 0 ? 0 : qx >= xmax ? xmax : qx | 0;
      const Y = qy < 0 ? 0 : qy >= ymax ? ymax : qy | 0;
      out[o + x] = src[Y * w + X];
    }
  }
  return out;
}

/** 기준 장면 자리 → 그 장면(받은 영상) 자리 — 결과 화면이 흔들린 영상 위에 공 길을 그릴 때 */
export function refToFrame(
  m: Motion | null | undefined,
  w: number,
  h: number,
  u: number,
  v: number
): [number, number] {
  if (!m) return [u, v];
  const cx = w / 2;
  const cy = h / 2;
  const co = Math.cos(m.th);
  const sn = Math.sin(m.th);
  const x = u - cx;
  const y = v - cy;
  return [cx + co * x - sn * y + m.tx, cy + sn * x + co * y + m.ty];
}

/**
 * 맞춘 장면(warp)에서 그 자리 둘레의 반올림 어긋남 — 화소 p0 에는 원래 장면의 round(q(p0)) 가 왔으니 거기 보이는 것은 기준 장면에서
 * R(−th)(round(q) − q) 만큼 떨어진 것이다.
 */
function roundingAt(
  m: Motion,
  w: number,
  h: number,
  u: number,
  v: number
): [number, number] {
  const [qx, qy] = refToFrame(m, w, h, Math.round(u), Math.round(v));
  const ex = Math.round(qx) - qx;
  const ey = Math.round(qy) - qy;
  const co = Math.cos(m.th);
  const sn = Math.sin(m.th);
  return [co * ex + sn * ey, -sn * ex + co * ey];
}

/** 장면에서 찾은 자리 → 기준 장면 자리 */
export function toRef(
  m: Motion | null | undefined,
  w: number,
  h: number,
  u: number,
  v: number
): [number, number] {
  if (!m) return [u, v];
  if (m.warp) {
    const [ex, ey] = roundingAt(m, w, h, u, v);
    return [u + ex, v + ey];
  }
  const cx = w / 2;
  const cy = h / 2;
  const x = u - cx - m.tx;
  const y = v - cy - m.ty;
  const co = Math.cos(m.th);
  const sn = Math.sin(m.th);
  return [cx + co * x + sn * y, cy - sn * x + co * y];
}

/** 기준 장면 자리 → 장면에서 찾을 자리(궤적이 짐작한 자리) */
export function fromRef(
  m: Motion | null | undefined,
  w: number,
  h: number,
  u: number,
  v: number
): [number, number] {
  if (!m) return [u, v];
  if (m.warp) {
    const [ex, ey] = roundingAt(m, w, h, u, v);
    return [u - ex, v - ey];
  }
  return refToFrame(m, w, h, u, v);
}

/** 움직임에서 시간의 2차식(고르게 흘러가는 몫)을 뺀 나머지의 가장 큰 값(px) — 옮김 둘과 화면 가장자리의 돌림 */
function jerkOf(times: number[], mot: Motion[], edge: number): number {
  const n = times.length;
  if (n < 4) return 0;
  const t0 = times[0];
  const ts = times.map((t) => t - t0);
  /* 2차식 맞춤 — 정규방정식 3×3 */
  const fit = (ys: number[]) => {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0; // prettier-ignore
    for (let k = 0; k < n; k++) {
      const t = ts[k];
      const t2 = t * t;
      s0 += 1;
      s1 += t;
      s2 += t2;
      s3 += t2 * t;
      s4 += t2 * t2;
      y0 += ys[k];
      y1 += ys[k] * t;
      y2 += ys[k] * t2;
    }
    const det = (a: number[][]) =>
      a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
      a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
      a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const A = [
      [s0, s1, s2],
      [s1, s2, s3],
      [s2, s3, s4],
    ];
    const D = det(A);
    if (!(Math.abs(D) > 1e-12)) return ys.map(() => 0);
    const col = (j: number, b: number[]) =>
      A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)));
    const b = [y0, y1, y2];
    const c = [det(col(0, b)) / D, det(col(1, b)) / D, det(col(2, b)) / D];
    return ys.map((y, k) => y - (c[0] + c[1] * ts[k] + c[2] * ts[k] * ts[k]));
  };
  const rx = fit(mot.map((m) => m.tx));
  const ry = fit(mot.map((m) => m.ty));
  const rt = fit(mot.map((m) => m.th));
  let worst = 0;
  for (let k = 0; k < n; k++)
    worst = Math.max(worst, Math.hypot(rx[k], ry[k]) + Math.abs(rt[k]) * edge);
  return worst;
}

/** t 때의 움직임 — 장면 사이는 곧게, 밖은 끝 장면 값 */
export function motionAt(times: number[], motion: Motion[], t: number): Motion {
  const n = times.length;
  if (t <= times[0]) return motion[0];
  if (t >= times[n - 1]) return motion[n - 1];
  let k = 1;
  while (k < n - 1 && times[k] < t) k++;
  const a = motion[k - 1];
  const b = motion[k];
  const f = (t - times[k - 1]) / (times[k] - times[k - 1] || 1);
  return {
    tx: a.tx + (b.tx - a.tx) * f,
    ty: a.ty + (b.ty - a.ty) * f,
    th: a.th + (b.th - a.th) * f,
    warp: a.warp,
  };
}

/**
 * 장면들을 첫 장면에 맞춘다. 쓸 블록이 모자라면(흰 벽 · 하늘 · 되풀이 무늬뿐) 받은 그대로(measured false). 못 잰 장면은 앞뒤
 * 장면 값을 잇고, 장면의 1/5 넘게 못 재면 바로잡지 않는다. 가장 크게 움직인 것이 0.3px 안이면 장면을 옮기지 않는다(값이 그대로).
 */
export function stabilize(
  frames: CapturedFrame[],
  extra: ArrayLike<number>[],
  w: number,
  h: number
): Stabilized {
  const none: Stabilized = {
    frames,
    extra,
    motion: null,
    maxShiftPx: 0,
    residPx: 0,
    failed: 0,
    measured: false,
  };
  if (
    frames.length < 2 ||
    w < 4 * (BQ + 2 * WIDE_Q + 8) ||
    h < 4 * (BQ + 2 * WIDE_Q + 8)
  )
    return none;
  const ref = frames[0].luma;
  const refQ = quarter(ref, w, h);
  const blocks = pickBlocks(ref, refQ, w, h);
  if (blocks.length < MIN_INLIERS + 2) return none;
  const cx = w / 2;
  const cy = h / 2;
  const enough = Math.max(MIN_INLIERS, Math.ceil(0.4 * blocks.length));
  const maxJump = MAX_JUMP_PX * (Math.min(w, h) / 720);
  const guessOf = (
    m: { tx: number; ty: number; th: number },
    b: Block
  ): [number, number] => [m.tx - m.th * (b.cy - cy), m.ty + m.th * (b.cx - cx)];
  /** 앞 장면 움직임(guess) 둘레에서 — 안 맞으면 넓게(guess 가 없으면 처음부터 넓게) */
  const measure = (cur: ArrayLike<number>, guess: Motion | null) => {
    const run = (start: (b: Block) => [number, number] | null) => {
      const list: BlockShift[] = [];
      for (const b of blocks) {
        const g = start(b);
        const s = g && descend(cur, w, h, b, g[0], g[1]);
        if (s) list.push(s);
      }
      return consensus(list, cx, cy);
    };
    let c = guess ? run((b) => guessOf(guess, b)) : null;
    if (!c || c.inliers < enough) {
      const curQ = quarter(cur, w, h);
      const wide = run((b) =>
        wideGuess(
          curQ,
          w,
          h,
          b,
          guess ? guessOf(guess, b)[0] : 0,
          guess ? guessOf(guess, b)[1] : 0
        )
      );
      /* 넓게 찾은 값이 앞 장면에서 크게 뛰었으면 되풀이 무늬에 걸린 것 — 믿지 않는다 */
      const jumped =
        !!wide &&
        !!guess &&
        Math.hypot(wide.m.tx - guess.tx, wide.m.ty - guess.ty) > maxJump;
      if (wide && !jumped && (!c || wide.inliers > c.inliers)) c = wide;
    }
    return c && c.inliers >= MIN_INLIERS ? c : null;
  };
  const motion: (Motion | null)[] = [{ tx: 0, ty: 0, th: 0, warp: false }];
  const rms: number[] = [];
  let failed = 0;
  let prev: Motion = motion[0] as Motion;
  let prev2: Motion = prev;
  for (let k = 1; k < frames.length; k++) {
    /* 짐작 — 앞 장면 움직임에 그 앞과의 차이를 더한다(손떨림은 몇 장 같은 쪽으로 간다) */
    const guess = {
      tx: 2 * prev.tx - prev2.tx,
      ty: 2 * prev.ty - prev2.ty,
      th: 2 * prev.th - prev2.th,
      warp: false,
    };
    const c = measure(frames[k].luma, guess);
    if (!c) {
      motion.push(null);
      failed++;
      continue;
    }
    const m = { ...c.m, warp: false };
    motion.push(m);
    rms.push(c.rms);
    prev2 = prev;
    prev = m;
  }
  if (failed > frames.length / 5) return { ...none, failed };
  /* 못 잰 장면은 앞뒤 값을 잇는다(끝이면 앞 값) */
  for (let k = 1; k < motion.length; k++) {
    if (motion[k]) continue;
    const a = motion[k - 1] as Motion;
    let j = k + 1;
    while (j < motion.length && !motion[j]) j++;
    const b = j < motion.length ? (motion[j] as Motion) : a;
    const f = j < motion.length ? 1 / (j - k + 1) : 0;
    const tx = a.tx + (b.tx - a.tx) * f;
    const ty = a.ty + (b.ty - a.ty) * f;
    motion[k] = { tx, ty, th: a.th + (b.th - a.th) * f, warp: false };
  }
  const mot = motion as Motion[];
  const edge = Math.hypot(cx, cy);
  const maxShiftPx = Math.max(
    ...mot.map((m) => Math.hypot(m.tx, m.ty) + Math.abs(m.th) * edge)
  );
  rms.sort((x, y) => x - y);
  const residPx = rms.length ? rms[rms.length >> 1] : 0;
  /*
   * 고르게 흘러가는 움직임(천천히 돌린 폰)은 궤적 모형의 일정한 옆 · 위아래 가속이 받아 낸다 — 10-06 실내(손에 든 폰이 0.6초에 25px
   * 고르게 흐름)는 바로잡지 않아도 맞았고, 바로잡자 '맞고 튄 공' 판정이 포수 쪽 덩어리에 걸려 오히려 틀렸다(098: 99.8 → 153km/h).
   * 바로잡는 것은 들쭉날쭉한 흔들림 — 공이 나는 동안 움직임에서 시간의 2차식을 뺀 나머지가 JERK_MIN_PX 를 넘을 때만(10-06 실내
   * 0.6~1.1px, 2026-10-07 손에 든 실시간 4개 4.4~7.0px).
   */
  /* 공이 나는 동안 — 구간은 공 앞 0.12~0.15초에서 시작하고 공은 0.9초 안에 닿는다(18~22m, 80km/h 이상) */
  const flightN = Math.max(
    4,
    frames.findIndex((f) => f.t > frames[0].t + JERK_WINDOW_SEC)
  );
  const jerk = jerkOf(
    frames.slice(0, flightN > 4 ? flightN : frames.length).map((f) => f.t),
    mot.slice(0, flightN > 4 ? flightN : frames.length),
    edge
  );
  if (jerk < JERK_MIN_PX * (Math.min(w, h) / 720))
    return { ...none, maxShiftPx, residPx, failed, jerkPx: jerk };
  /* 거의 안 움직였으면 그대로 둔다 — 삼각대 영상은 값이 한 글자도 안 바뀐다 */
  if (maxShiftPx < 0.3)
    return { ...none, maxShiftPx, residPx, failed, measured: true, jerkPx: jerk };
  /* 조금 움직였으면 장면은 두고 공 자리만 고친다 — 배경 빼기는 그만한 흔들림에 버틴다 */
  if (maxShiftPx < WARP_MIN_PX * (Math.min(w, h) / 720))
    return {
      frames,
      extra,
      motion: mot,
      maxShiftPx,
      residPx,
      failed,
      measured: true,
      jerkPx: jerk,
    };
  /* 배경 장면 — 구간보다 0.3~1.2초 앞이라 앞 장면이 없다. 넓게 찾아 맞추고, 못 재면 버린다 */
  const extraOut: ArrayLike<number>[] = [];
  for (const img of extra) {
    const c = measure(img, null);
    if (c) extraOut.push(warpLuma(img, w, h, { ...c.m, warp: true }));
  }
  for (const m of mot) m.warp = true;
  return {
    frames: frames.map((f, k) =>
      k ? { ...f, luma: warpLuma(f.luma, w, h, mot[k]) } : f
    ),
    extra: extraOut,
    motion: mot,
    maxShiftPx,
    residPx,
    failed,
    measured: true,
    jerkPx: jerk,
  };
}
