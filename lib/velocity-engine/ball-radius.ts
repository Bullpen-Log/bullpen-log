/**
 * 공 반지름 정밀 재기(엔진 2.9 — 세션 거리용) — 원본 해상도 공 둘레 잘라 낸 '장면 − 배경' 차이에 모형을 맞춘다:
 * 반지름 r 원판(안은 위아래 · 옆 밝기 기울기 — 흐린 날 아래쪽이 배경에 묻히는 공) × 움직임 방향으로 L 만큼 번짐 × 가우스 흐림 σ + 바탕 b.
 * 덩어리 지름(문턱 넘은 칸)은 번짐 · 대비 · 문턱으로 20~35% 부풀어 보정 상수가 날마다 갈렸다(10-03 에 맞춘 1.163 이 10-23 에서 틀림).
 * 모형을 맞추면 상수 없이 반지름이 나온다 — 10-23 · 10-24 밖 녹화에서 이 반지름으로 잰 끝 깊이(f·R/r)가 두 날 1.5% 안에서 같은 배율로
 * 스피드건에 맞는 거리를 따랐다(docs/velocity/redesign/bench-findings.md 6절 — 맥 파이썬 원형 bench/tools/limbshade.py 를 옮김).
 *
 * 순수 셈 — DOM 없음, 노드 시험이 돈다.
 */

/** 맞출 매개변수 차례 */
const CX = 0, CY = 1, RR = 2, LL = 3, AA = 4, BB = 5, GX = 6, GY = 7, SG = 8;
/** 칸 하나를 이만큼 쪼개 원판 경계를 매끄럽게 */
const SS = 3;
/** 움직임 번짐 표본 수 */
const MOTION_TAPS = 7;

export type RadiusFit = {
  r: number;
  sigma: number;
  /** 원판 밝기(차이 단위) · 잔차 RMS — 믿을 만한 맞춤만 쓰려고(A 가 작거나 잔차가 크면 버림) */
  amp: number;
  rms: number;
  /** 움직임 번짐 길이(px) · 밝기 기울기 */
  blur: number;
  gx: number;
  gy: number;
};

/** 가우스 흐림(따로 가르기) — 가장자리는 가장자리 값으로 */
function gaussBlur(img: Float64Array, S: number, sigma: number, tmp: Float64Array): void {
  const k = Math.max(1, Math.ceil(3 * sigma));
  const w = new Float64Array(2 * k + 1);
  let sum = 0;
  for (let i = -k; i <= k; i++) sum += w[i + k] = Math.exp((-i * i) / (2 * sigma * sigma));
  for (let i = 0; i < w.length; i++) w[i] /= sum;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let a = 0;
      for (let i = -k; i <= k; i++) a += w[i + k] * img[y * S + Math.min(S - 1, Math.max(0, x + i))];
      tmp[y * S + x] = a;
    }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let a = 0;
      for (let i = -k; i <= k; i++) a += w[i + k] * tmp[Math.min(S - 1, Math.max(0, y + i)) * S + x];
      img[y * S + x] = a;
    }
}

/** 모형 그림 — p 는 [cx, cy, r, L, A, b, gx, gy, σ], dir 는 움직임 단위 벡터 */
export function renderBall(p: ArrayLike<number>, S: number, dir: [number, number], out = new Float64Array(S * S)): Float64Array {
  const cx = p[CX], cy = p[CY], r = Math.max(0.3, p[RR]), L = p[LL], A = p[AA], b = p[BB], gx = p[GX], gy = p[GY];
  out.fill(0);
  const inv = 1 / (SS * SS * MOTION_TAPS);
  for (let t = 0; t < MOTION_TAPS; t++) {
    const s = t / (MOTION_TAPS - 1) - 0.5;
    const ox = cx + s * L * dir[0], oy = cy + s * L * dir[1];
    const x0 = Math.max(0, Math.floor(ox - r - 1)), x1 = Math.min(S - 1, Math.ceil(ox + r + 1));
    const y0 = Math.max(0, Math.floor(oy - r - 1)), y1 = Math.min(S - 1, Math.ceil(oy + r + 1));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let acc = 0;
        for (let j = 0; j < SS; j++) {
          const yy = y + (j + 0.5) / SS - 0.5 - oy;
          for (let i = 0; i < SS; i++) {
            const xx = x + (i + 0.5) / SS - 0.5 - ox;
            if (xx * xx + yy * yy <= r * r) acc += 1 + (gx * xx + gy * yy) / r;
          }
        }
        out[y * S + x] += acc * inv;
      }
  }
  gaussBlur(out, S, Math.max(0.3, p[SG]), new Float64Array(S * S));
  for (let i = 0; i < out.length; i++) out[i] = b + A * out[i];
  return out;
}

/** 작은 선형계(가우스 소거) */
function solve(A: number[][], g: number[]): number[] | null {
  const n = g.length;
  const M = A.map((row, i) => [...row, g[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * 반지름 맞추기 — img 는 S×S '장면 − 배경'(공이 가운데 근처), d0 은 짐작 지름(px), dir 은 움직임 방향. sigma 를 주면 고정, null 이면 같이 푼다.
 * px 는 1080 짧은 변에 견준 화소 배율(4K 면 2) — 가운데 · 번짐 · 흐림 경계가 1080 화소로 맞춰져 있어 같이 키운다.
 * 레벤버그–마쿼트(수치 야코비안). 못 맞추면 null.
 */
export function fitBallRadius(
  img: ArrayLike<number>,
  S: number,
  d0: number,
  dir: [number, number],
  sigma: number | null,
  px = 1
): RadiusFit | null {
  const c = (S - 1) / 2;
  let med = 0, max = -Infinity;
  {
    const s = Array.from(img).sort((a, b) => a - b);
    med = s[s.length >> 1];
    max = s[s.length - 1];
  }
  const free = sigma == null;
  const lo = [c - 6 * px, c - 6 * px, 0.8, 0, 0, -80, -1.5, -1.5, 0.3 * px];
  const hi = [c + 6 * px, c + 6 * px, S / 2, 40 * px, 400, 80, 1.5, 1.5, 3 * px];
  const clamp = (q: number[]) => q.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
  let p = clamp([c, c, Math.min(S / 2 - 0.1, Math.max(1.5, (d0 / 2) * 0.8)), 2, Math.min(399, Math.max(1, max - med)), med, 0, 0, sigma ?? px]);
  const idx = free ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3, 4, 5, 6, 7];
  const buf = new Float64Array(S * S);
  const resid = (q: number[]) => {
    renderBall(q, S, dir, buf);
    const r = new Float64Array(S * S);
    for (let i = 0; i < r.length; i++) r[i] = buf[i] - img[i];
    return r;
  };
  const cost = (r: Float64Array) => r.reduce((a, v) => a + v * v, 0);
  let r0 = resid(p);
  let c0 = cost(r0);
  let lambda = 1e-2;
  for (let it = 0; it < 60; it++) {
    const J: Float64Array[] = idx.map((k) => {
      const h = 1e-3 * Math.max(1, Math.abs(p[k]));
      const q = p.slice();
      q[k] += h;
      const rq = resid(clamp(q));
      const col = new Float64Array(rq.length);
      for (let i = 0; i < rq.length; i++) col[i] = (rq[i] - r0[i]) / h;
      return col;
    });
    const n = idx.length;
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0)));
    const g = Array.from({ length: n }, (_, a) => -J[a].reduce((s, v, i) => s + v * r0[i], 0));
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
      const d = solve(A, g);
      if (!d) {
        lambda *= 10;
        continue;
      }
      const q = p.slice();
      idx.forEach((k, j) => (q[k] += d[j]));
      const qc = clamp(q);
      const rq = resid(qc);
      const cq = cost(rq);
      if (cq < c0) {
        const rel = (c0 - cq) / Math.max(1e-12, c0);
        p = qc;
        r0 = rq;
        c0 = cq;
        lambda = Math.max(1e-6, lambda / 3);
        improved = rel > 1e-7;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  if (!Number.isFinite(c0)) return null;
  return { r: p[RR], sigma: p[SG], amp: p[AA], rms: Math.sqrt(c0 / (S * S)), blur: p[LL], gx: p[GX], gy: p[GY] };
}

/** 야구공 반지름(m) — 지름 73.66mm(규격 72.9~74.8 가운데) */
export const BALL_RADIUS_M = 0.07366 / 2;
/**
 * 정밀 반지름으로 잰 깊이 ÷ 실제 깊이 — 모형이 남기는 작은 치우침 + 렌즈 값 오차. 10-24 녹화(맞추기용, 아이폰 15 Pro Max 2배)에서 스피드건에 맞춘 값,
 * 10-23(확인용)에 적용하면 세션 가운데 −1.5%(bench-findings 6절). 다른 폰은 아직 모른다.
 */
export const LIMB_SIZE_K = 1.052;
/** 맞춤을 믿는 문턱 — 원판 밝기가 이만큼 넘고 잔차가 원판 밝기의 이 몫 밑 */
export const LIMB_MIN_AMP = 8;
export const LIMB_MAX_RMS = 0.35;
