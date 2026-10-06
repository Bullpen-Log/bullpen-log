/**
 * 엔진 2.0 — 공 궤적 물리 맞추기(카메라 한 대).
 *
 * 장면마다 찾은 공의 화면 자리(u, v)에 3차원 궤적을 맞춘다. 궤적은 끝 시각 te 의 자리 · 속도와 일정한 옆 · 위아래 가속(중력 ·
 * 회전 힘)으로 정하고, 공기저항(a = −K·|v|·v)은 물리로 고정해 RK4 로 앞뒤로 나아간다. 깊이 방향은 화면만으로 크기가 정해지지
 * 않으므로 te 의 깊이를 1 로 둔다(정규 단위) — 실제 속도는 '끝의 실제 깊이 D(m)'를 곱하면 된다. D 는 사용자가 넣은 거리
 * (그물 · 미트까지)가 준다. 이것이 1.x(공 지름으로 거리를 재던 것)와 갈리는 자리다.
 *
 * 깊이의 비율(가까울 때 몇 m, 멀 때 몇 m)은 공의 화면 자리가 원근으로 모여드는 모양에서 나온다 — 그래서 공의 크기를 정확히
 * 재지 않아도 된다(작고 번진 공에서도 중심만 잡히면 된다).
 *
 * 시험 코드(2026-10-07, 아이폰 15 Pro Max 2배 · 60fps 19개)에서 옮겼다. 답은 시험 코드와 같다(scripts/velocity-lab/engine2-lab.mts).
 */

/** 맞출 관측 — 화면 자리(분석 px)와 그 오차 폭 σ(px). ring: 둥근 테두리로 찾은 점(덩어리 중심과 다른 자) */
export type TrackPoint = {
  t: number;
  u: number;
  v: number;
  sigma: number;
  /** 공 지름(분석 px) — 처음 값을 짐작할 때만 */
  diam?: number;
};

/** 핀홀 카메라(분석 px) — 초점거리 · 화면 가운데 */
export type PinholeCamera = { f: number; cx: number; cy: number };

/** 공기저항 계수 K(1/m) — a = −K·|v|·v. 야구공 Cd 0.35 · 지름 73mm · 145g 이면 0.006 남짓(1.x 와 같다) */
export const DRAG_K = 0.006;

export type FitOptions = {
  /**
   * 정규 단위(끝 깊이 = 1)의 공기저항을 실제 거리에 맞추는 값(m) — 끝의 실제 깊이. 사용자가 넣은 거리를 넘긴다.
   * 틀려도 값은 조금만 바뀐다(공기저항은 20m 에 속도를 11% 줄인다 — 거리 5% 틀리면 그 몫의 5%).
   */
  dragScaleM?: number;
  /**
   * 카메라가 아래로 숙인 각(라디안, 아래가 +). 위아래 힘(중력 · 양력)은 세상의 수직이라 카메라 깊이 축에도 ay·tanφ 만큼 걸린다
   * (2026-10-07: 3.6° 숙인 영상 넣자 영상 사이 흩어짐 2.5 → 1.5%). 모르면 0. 화면만으로는 정해지지 않는다(맞추면 −53~+41°).
   */
  tilt?: number;
  /** 처음 값(warm start) — rebase() 로 만든 것 */
  init?: number[] | null;
};

export type TrajectoryFit = {
  /** [X(te), Y(te), vx, vy, vz, ax, ay] — 정규 단위(te 의 깊이 = 1) */
  p: number[];
  te: number;
  /** σ 로 나눈 잔차 제곱합 */
  cost: number;
  /** 화면 잔차(px)의 RMS · 점마다 */
  rms: number;
  resid: number[];
  /** t 에서의 화면 자리(px)와 깊이(정규) */
  project(t: number): [number, number, number];
  /** t 에서의 속도(정규 단위/초) — 실제 m/s 는 × D */
  velocityAt(t: number): [number, number, number];
  /** t 에서의 3차원 자리(정규) */
  positionAt(t: number): [number, number, number];
  /** 매개변수 공분산(잔차로 크기를 맞춘 것) — 못 구하면 null */
  covariance: number[][] | null;
};

/** 작은 선형계 풀기(가우스 소거, 부분 피벗) — 못 풀면 null */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-15) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let k2 = c; k2 <= n; k2++) M[r][k2] -= k * M[c][k2];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** 역행렬(작은 대칭 행렬) — 못 구하면 null */
function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0));
    const x = solveLinear(A, e);
    if (!x) return null;
    cols.push(x);
  }
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cols[j][i]));
}

type State = [number, number, number, number, number, number];

/** RK4 한 걸음의 적분 간격(초) — 공기저항 · 일정 가속뿐이라 8ms 여도 2ms 와 소수 넷째 자리까지 같다(실제 궤적 3개로 견줌) */
const STEP_SEC = 0.008;

/** 적분기 — 정규 단위 상태 [x,y,z,vx,vy,vz] 를 dt 만큼(앞 · 뒤) RK4 로 나아간다 */
function integrator(opts: FitOptions) {
  const Kn = DRAG_K * (opts.dragScaleM ?? 20);
  const tanTilt = Math.tan(opts.tilt ?? 0);
  /*
   * 걸음마다 배열을 만들지 않게 숫자 변수로 나아간다(맞춤 한 번에 수천 걸음 — 배열 쓰레기와 Math.hypot 이 계산 시간의 대부분이었다).
   * 속력은 제곱합의 제곱근(hypot 은 넘침을 막느라 몇 배 느리다 — 공 속력에선 넘칠 일이 없다).
   */
  const go = (s: State, dt: number, p: number[]): State => {
    const n = Math.max(1, Math.ceil(Math.abs(dt) / STEP_SEC));
    const h = dt / n;
    const ax = p[5];
    const ay = p[6];
    const az = p[6] * tanTilt;
    let [x, y, z, vx, vy, vz] = s;
    for (let k = 0; k < n; k++) {
      let sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const a1x = ax - Kn * sp * vx;
      const a1y = ay - Kn * sp * vy;
      const a1z = az - Kn * sp * vz;
      let ux = vx + 0.5 * h * a1x;
      let uy = vy + 0.5 * h * a1y;
      let uz = vz + 0.5 * h * a1z;
      sp = Math.sqrt(ux * ux + uy * uy + uz * uz);
      const a2x = ax - Kn * sp * ux;
      const a2y = ay - Kn * sp * uy;
      const a2z = az - Kn * sp * uz;
      ux = vx + 0.5 * h * a2x;
      uy = vy + 0.5 * h * a2y;
      uz = vz + 0.5 * h * a2z;
      sp = Math.sqrt(ux * ux + uy * uy + uz * uz);
      const a3x = ax - Kn * sp * ux;
      const a3y = ay - Kn * sp * uy;
      const a3z = az - Kn * sp * uz;
      ux = vx + h * a3x;
      uy = vy + h * a3y;
      uz = vz + h * a3z;
      sp = Math.sqrt(ux * ux + uy * uy + uz * uz);
      const a4x = ax - Kn * sp * ux;
      const a4y = ay - Kn * sp * uy;
      const a4z = az - Kn * sp * uz;
      x = x + h * (vx + (h / 6) * (a1x + a2x + a3x));
      y = y + h * (vy + (h / 6) * (a1y + a2y + a3y));
      z = z + h * (vz + (h / 6) * (a1z + a2z + a3z));
      vx = vx + (h / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
      vy = vy + (h / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
      vz = vz + (h / 6) * (a1z + 2 * a2z + 2 * a3z + a4z);
    }
    return [x, y, z, vx, vy, vz];
  };
  const start = (p: number[]): State => [p[0], p[1], 1, p[2], p[3], p[4]];
  return { go, start };
}

/** 매개변수 p(te 기준)의 궤적에서 t 의 상태 [x,y,z,vx,vy,vz] — 맞추지 않고 값만 */
export function trajectoryState(p: number[], te: number, t: number, opts: FitOptions = {}): State {
  const { go, start } = integrator(opts);
  return go(start(p), t - te, p);
}

/**
 * 궤적을 맞춘다. pts 는 시간순이 아니어도 된다. te 는 정규 깊이 1 의 시각(보통 비행 끝 — 그물 · 미트에 닿은 때).
 */
export function fitTrajectory(
  pts: TrackPoint[],
  te: number,
  cam: PinholeCamera,
  opts: FitOptions = {}
): TrajectoryFit {
  const { f, cx, cy } = cam;
  const { go, start } = integrator(opts);
  const stateAt = (p: number[], t: number) => go(start(p), t - te, p);
  /* 여러 시각을 한 번에 — te 에서 앞뒤로 차례로 나아가며 들른다(점마다 따로 적분하면 40배 느리다) */
  const times = pts.map((o) => o.t);
  const order = {
    back: times.map((_, k) => k).filter((k) => times[k] < te).sort((a, b) => times[b] - times[a]),
    fwd: times.map((_, k) => k).filter((k) => times[k] >= te).sort((a, b) => times[a] - times[b]),
  };
  const project = (p: number[]): [number, number, number][] => {
    const out = new Array<[number, number, number]>(times.length);
    for (const ks of [order.back, order.fwd]) {
      let s = start(p);
      let tc = te;
      for (const k of ks) {
        s = go(s, times[k] - tc, p);
        tc = times[k];
        out[k] = [cx + (f * s[0]) / s[2], cy + (f * s[1]) / s[2], s[2]];
      }
    }
    return out;
  };
  const costOf = (proj: [number, number, number][]) =>
    proj.reduce((a, [u, v, Z], k) => {
      if (!(Z > 0.02)) return a + 1e12;
      const o = pts[k];
      return a + ((u - o.u) / o.sigma) ** 2 + ((v - o.v) / o.sigma) ** 2;
    }, 0);

  /* 처음 값: 끝 자리는 마지막 관측에서, 첫 깊이는 공 지름 비(지름 ∝ 1/깊이)로 짐작해 깊이 속도를 정한다 */
  const byT = [...pts].sort((a, b) => a.t - b.t);
  const first = byT[0];
  const last = byT[byT.length - 1];
  const z0 = first.diam && last.diam ? Math.min(0.9, last.diam / first.diam) : 0.2;
  let p =
    opts.init && opts.init.length === 7
      ? opts.init.slice()
      : [(last.u - cx) / f, (last.v - cy) / f, 0, 0, (1 - z0) / Math.max(1e-3, te - first.t), 0, 0];
  const NP = 7;
  let lambda = 1e-3;
  let proj = project(p);
  let c = costOf(proj);
  let JtJ: number[][] = [];
  const jacobian = (p0: number[], proj0: [number, number, number][]) => {
    const cols: { pq: [number, number, number][]; h: number }[] = [];
    for (let k = 0; k < NP; k++) {
      const h = 1e-6 * Math.max(1e-3, Math.abs(p0[k]));
      const q = p0.slice();
      q[k] += h;
      cols.push({ pq: project(q), h });
    }
    const J: number[][] = [];
    const r: number[] = [];
    pts.forEach((o, j) => {
      const ju: number[] = [];
      const jv: number[] = [];
      for (let k = 0; k < NP; k++) {
        const { pq, h } = cols[k];
        ju.push((pq[j][0] - proj0[j][0]) / h / o.sigma);
        jv.push((pq[j][1] - proj0[j][1]) / h / o.sigma);
      }
      J.push(ju, jv);
      r.push((o.u - proj0[j][0]) / o.sigma, (o.v - proj0[j][1]) / o.sigma);
    });
    const A = Array.from({ length: NP }, (_, a) =>
      Array.from({ length: NP }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0))
    );
    const g = Array.from({ length: NP }, (_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0));
    return { A, g };
  };
  for (let it = 0; it < 100; it++) {
    const { A: JA, g } = jacobian(p, proj);
    JtJ = JA;
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JA.map((row, i) => row.map((x, j) => (i === j ? x * (1 + lambda) : x)));
      const d = solveLinear(A, g);
      if (!d) {
        lambda *= 10;
        continue;
      }
      const q = p.map((x, i) => x + d[i]);
      const pq = project(q);
      const c2 = costOf(pq);
      if (c2 < c) {
        const rel = (c - c2) / c;
        p = q;
        c = c2;
        proj = pq;
        lambda = Math.max(1e-9, lambda / 3);
        improved = rel > 1e-10;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  const resid = proj.map(([u, v], k) => Math.hypot(u - pts[k].u, v - pts[k].v));
  const dof = 2 * pts.length - NP;
  let covariance: number[][] | null = null;
  if (dof > 0 && JtJ.length) {
    const inv = invert(jacobian(p, proj).A);
    if (inv) {
      const s2 = Math.max(1, c / dof);
      covariance = inv.map((row) => row.map((x) => x * s2));
    }
  }
  const pf = p;
  return {
    p: pf,
    te,
    cost: c,
    rms: Math.sqrt(resid.reduce((a, x) => a + x * x, 0) / Math.max(1, resid.length)),
    resid,
    project: (t) => {
      const s = stateAt(pf, t);
      return [cx + (f * s[0]) / s[2], cy + (f * s[1]) / s[2], s[2]];
    },
    velocityAt: (t) => {
      const s = stateAt(pf, t);
      return [s[3], s[4], s[5]];
    },
    positionAt: (t) => {
      const s = stateAt(pf, t);
      return [s[0], s[1], s[2]];
    },
    covariance,
  };
}

/** 맞춘 궤적을 다른 끝 시각 te 로 옮긴 매개변수 — 다시 맞출 때 처음 값(warm start)으로 쓰면 몇 번 만에 수렴한다 */
export function rebase(fit: TrajectoryFit, te: number): number[] {
  const [X, Y, Z] = fit.positionAt(te);
  const [vx, vy, vz] = fit.velocityAt(te);
  return [X / Z, Y / Z, vx / Z, vy / Z, vz / Z, fit.p[5] / Z, fit.p[6] / Z];
}

/**
 * t 에서의 속력(정규 단위/초)과 그 표준오차 — 공분산을 속력의 기울기로 옮긴다(수치 미분). 실제 m/s 는 둘 다 × D.
 * 공분산이 없으면 se 는 null.
 */
export function speedWithSe(
  fit: TrajectoryFit,
  t: number,
  opts: FitOptions = {}
): { speed: number; se: number | null } {
  const speedOf = (p: number[]) => {
    const s = trajectoryState(p, fit.te, t, opts);
    return Math.hypot(s[3], s[4], s[5]);
  };
  const s0 = speedOf(fit.p);
  const C = fit.covariance;
  if (!C) return { speed: s0, se: null };
  const g = fit.p.map((x, k) => {
    const h = 1e-6 * Math.max(1e-3, Math.abs(x));
    const q = fit.p.slice();
    q[k] += h;
    return (speedOf(q) - s0) / h;
  });
  let v = 0;
  for (let a = 0; a < g.length; a++) for (let b = 0; b < g.length; b++) v += g[a] * C[a][b] * g[b];
  return { speed: s0, se: v > 0 ? Math.sqrt(v) : 0 };
}
