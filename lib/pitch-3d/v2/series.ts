/**
 * 시간 다듬기 — 장면 줄(수 · 벡터 · 사원수 성분)을 다듬는 순수 함수들. 화면 모델(kinematics.ts)이 쓴다(2026-10-22 검토로 kinematics.ts 에서 떼어 옴,
 * 내용은 그대로). 분석 엔진(fit.ts · analyze.ts)은 GPU 묶음에 든 제 것을 쓴다 — 엔진 파일을 고치면 엔진 지문이 바뀌어서 거기는 그대로 두었다.
 */
import { median } from '@/lib/pitch-3d/linalg';

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 한 장면에 rate(라디안, 장면마다 다를 수 있음)까지만 바뀌게 — 앞으로 · 뒤로 한 번씩 묶어 가운데로(한쪽으로 늦지 않게).
 * 팔이 굽는 면 · 손 돌림이 한 장면에 80~90° 휙 돌던 것(편 팔꿈치에서 들고 있던 값 → 굽기 시작한 장면의 잰 값, 흐린 손 점)을 몇 장면에 걸쳐 돌게 한다.
 */
export function rateLimit(xs: number[], rate: number | number[]): number[] {
  const r = (k: number) => (typeof rate === 'number' ? rate : rate[k]);
  const f = [...xs];
  for (let k = 1; k < f.length; k++) f[k] = f[k - 1] + clamp(f[k] - f[k - 1], -r(k), r(k));
  const b = [...xs];
  for (let k = b.length - 2; k >= 0; k--)
    b[k] = b[k + 1] + clamp(b[k] - b[k + 1], -r(k + 1), r(k + 1));
  return f.map((v, k) => (v + b[k]) / 2);
}

/** 빠르기 기준의 바닥(라디안 · 키 / 장면) — 이보다 느린 움직임은 넓게 다듬는다 */
const VREF_FLOOR = 0.02;

/**
 * 무게(보이는 만큼) 있는 앞뒤 가우스 — 빠른 곳은 좁게, 느린 곳은 넓게. xs 는 여러 성분(벡터 · 사원수)을 한꺼번에 — 빠르기는 성분 전체로.
 *
 * 폭은 앞뒤 3장면으로 고른다 — 장면마다 폭이 크게 달라지면 이웃 장면 값이 계단처럼 튀었다(2026-10-09 좌투 샘플: 다듬은 손목이 원본보다 더
 * 떨림 0.62 → 1.08). widen 이면 주변 무게가 모자랄 때 폭을 넓혀 앞뒤에서 잇는다 — 팔을 편 장면에서 굽는 면(비틀림 · 엎침)을 못 볼 때만 쓴다.
 * 다른 값에 넓힘(폭 최대 23배)을 쓰면 흐린 장면을 멀리서 끌어와 영상과 멀어졌다.
 */
export function smoothMulti(
  xs: number[][],
  ws: number[],
  sMin = 0.6,
  sMax = 2.2,
  widen = false
): number[][] {
  const n = xs.length;
  if (n < 3) return xs.map((x) => [...x]);
  const D = xs[0].length;
  /*
   * 빠르기는 한 번 넓게 다듬은 값에서 잰다 — 날 값에서 재면 잡음이 '빠름'으로 읽혀 가만있는 관절의 떨림을 못 줄였다. 기준은 그 값의
   * 상위 10% 의 4분의 1(빠른 팔은 좁게), 다만 VREF_FLOOR 밑으로는 안 내려간다(잡음뿐인 값에서 기준까지 잡음이 되지 않게).
   */
  const pre = xs.map((_, k) => {
    let sw = 0;
    const acc = new Array<number>(D).fill(0);
    for (let q = Math.max(0, k - 4); q <= Math.min(n - 1, k + 4); q++) {
      const g = (ws[q] + 1e-3) * Math.exp(-((q - k) ** 2) / (2 * 1.5 * 1.5));
      sw += g;
      for (let d = 0; d < D; d++) acc[d] += g * xs[q][d];
    }
    return acc.map((v) => v / sw);
  });
  const speed = pre.map((_, k) => {
    const a = pre[Math.max(0, k - 1)];
    const b = pre[Math.min(n - 1, k + 1)];
    let s = 0;
    for (let d = 0; d < D; d++) s += (b[d] - a[d]) ** 2;
    return Math.sqrt(s) / 2;
  });
  const sorted = [...speed].sort((a, b) => a - b);
  const vRef = Math.max(VREF_FLOOR, 0.25 * sorted[Math.floor(sorted.length * 0.9)]);
  const sig0 = speed.map((v) => sMin + (sMax - sMin) / (1 + (v / vRef) ** 2));
  const sig = sig0.map((_, k) => {
    let a = 0;
    let c = 0;
    for (let q = Math.max(0, k - 3); q <= Math.min(n - 1, k + 3); q++) {
      a += sig0[q];
      c++;
    }
    return a / c;
  });
  return xs.map((x, k) => {
    let sigma = sig[k];
    for (let tries = 0; tries < (widen ? 5 : 1); tries++) {
      const r = Math.ceil(sigma * 2.5);
      let sw = 0;
      const acc = new Array<number>(D).fill(0);
      for (let q = Math.max(0, k - r); q <= Math.min(n - 1, k + r); q++) {
        const g = ws[q] * Math.exp(-((q - k) ** 2) / (2 * sigma * sigma));
        sw += g;
        for (let d = 0; d < D; d++) acc[d] += g * xs[q][d];
      }
      if (sw > 0.15 || (!widen && sw > 0)) return acc.map((v) => v / sw);
      sigma *= 2.2;
    }
    return [...x];
  });
}

/**
 * 국소 다항식 맞춤(앞뒤 가우스 무게 × 보이는 만큼 무게로 deg 차 곡선을 맞춰 가운데 값) — 가우스 다듬기는 빠른 팔의 꼭대기를 깎아 폭을 좁게
 * 둘 수밖에 없어 엔진 2D 잡음이 그대로 꺾임으로 남았다. 3차 곡선은 빠르지만 매끈한 움직임(가속까지)은 그대로 두고 갑자기 꺾이는 것만 걷는다.
 */
/** localPoly 가 곡선을 맞추는 둘레 무게의 바닥 */
const LOCAL_POLY_MIN_W = 0.15;

export function localPoly(xs: number[][], ws: number[], sigma: number, deg = 3): number[][] {
  const n = xs.length;
  const D = xs[0]?.length ?? 0;
  const r = Math.ceil(sigma * 2.5);
  const m = deg + 1;
  return xs.map((x, k) => {
    const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const b = Array.from({ length: m }, () => new Array<number>(D).fill(0));
    let cnt = 0;
    let sw = 0;
    for (let q = Math.max(0, k - r); q <= Math.min(n - 1, k + r); q++) {
      const t = (q - k) / sigma;
      const w = (ws[q] + 1e-3) * Math.exp(-(t * t) / 2);
      sw += w;
      const p = [1, t, t * t, t * t * t].slice(0, m);
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) A[i][j] += w * p[i] * p[j];
        for (let d = 0; d < D; d++) b[i][d] += w * p[i] * xs[q][d];
      }
      cnt++;
    }
    /* 둘레가 거의 다 안 보이면(가려진 팔 · 영상 끝) 먼 장면에 맞춘 곡선을 늘여 쓰게 된다 — 그대로 둔다(뒤 다듬기가 잇는다, smoothMulti 와 같은 문턱) */
    if (cnt <= m || sw < LOCAL_POLY_MIN_W) return [...x];
    /* 가우스 소거 — 가운데(t = 0) 값은 첫 계수 */
    for (let c = 0; c < m; c++) {
      let pv = c;
      for (let i = c + 1; i < m; i++) if (Math.abs(A[i][c]) > Math.abs(A[pv][c])) pv = i;
      [A[c], A[pv]] = [A[pv], A[c]];
      [b[c], b[pv]] = [b[pv], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return [...x];
      for (let i = 0; i < m; i++) {
        if (i === c) continue;
        const f = A[i][c] / A[c][c];
        for (let j = c; j < m; j++) A[i][j] -= f * A[c][j];
        for (let d = 0; d < D; d++) b[i][d] -= f * b[c][d];
      }
    }
    return b[0].map((v) => v / A[0][0]);
  });
}

/**
 * 각을 이어 붙인다 — 바로 앞 장면이 아니라 앞 5장면 가운데값에 가깝게. 앞 장면에만 맞추면 두세 장면 반 바퀴 튄 값(손 점 검지 · 새끼 뒤바뀜)을
 * 지나 돌아올 때 반대쪽으로 돌아 그 뒤 전체가 한 바퀴 밀렸고, 화면 손이 한 바퀴를 천천히 따라 돌다 한계에 걸려 150° 뒤집힌 채 남았다
 * (2026-10-10 샘플 4 글러브 손, 착지 ~ 끝).
 */
export function unwrap(xs: number[], at?: number[]): number[] {
  const out = [...xs];
  for (let k = 1; k < out.length; k++) {
    const q0 = Math.max(0, k - 5);
    /*
     * at(장면 번호)을 주면 앞 장면들의 빠르기로 지금까지 이어 간 자리에 가깝게 — 팔을 쭉 편 장면(비틀림을 못 봄)을 건너뛰면 그 사이 돈 만큼이 반
     * 바퀴 가까워, 가운데값만 보면 짧은 쪽(거꾸로)으로 이었고 다시 굽은 팔이 다듬기 한계(장면당 20°)로 8장면 동안 거꾸로 돌며 손이 떨렸다
     * (2026-10-13 실험실 샘플 1 공 놓은 뒤: 162° → 편 팔 11장면 → −24° 를 336° 로, 화면 손목 흔들림 키의 6.7%).
     */
    let ref: number;
    if (at) {
      const steps: number[] = [];
      for (let q = Math.max(q0 + 1, k - 4); q < k; q++) steps.push((out[q] - out[q - 1]) / (at[q] - at[q - 1]));
      const v = steps.length ? median(steps) : 0;
      ref = median(out.slice(q0, k).map((x, i) => x + v * (at[k] - at[q0 + i])));
    } else ref = median(out.slice(q0, k));
    out[k] += 2 * Math.PI * Math.round((ref - out[k]) / (2 * Math.PI));
  }
  return out;
}

/** 몇 장면만 튄 각(앞뒤 7장면 가운데값에서 60° 넘게)은 안 본 것으로 — 이웃 장면으로 잇게 무게를 거의 0 으로 */
export const outlierW = (xs: number[], ws: number[]) =>
  ws.map((w, k) => {
    const win = xs.slice(Math.max(0, k - 7), k + 8).sort((a, b) => a - b);
    return Math.abs(xs[k] - win[win.length >> 1]) > rad(60) ? 0.001 : w;
  });

export const smooth1 = (xs: number[], ws: number[], sMin?: number, sMax?: number, widen = false) =>
  smoothMulti(
    xs.map((x) => [x]),
    ws,
    sMin,
    sMax,
    widen
  ).map((v) => v[0]);

/** 무게 있는 가운데값(각 — 이어 붙인 값으로) */
export function weightedMedian(xs: number[], ws: number[]): number {
  const pairs = xs.map((x, i) => [x, ws[i]] as const).filter(([, w]) => w > 0.2);
  if (!pairs.length) return median(xs);
  return median(pairs.map(([x]) => x));
}

/**
 * 앞뒤 half 장면의 가운데값 — 몇 장면만 튄 값을 걷는다. 양 끝은 창을 앞뒤 같게 줄인다(한쪽만 보면 고르게 움직이는 값이 끝에서 늦었다 —
 * 끝 장면까지 고르게 도는 다리가 1.5장면 늦어 발목이 키의 2.7% 어긋남).
 */
export function medianFilter(xs: number[], half: number): number[] {
  return xs.map((_, k) => {
    const h = Math.min(half, k, xs.length - 1 - k);
    const w = xs.slice(k - h, k + h + 1).sort((a, b) => a - b);
    return w[w.length >> 1];
  });
}
