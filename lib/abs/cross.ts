/**
 * 통과 순간 · 통과점 — 맞춘 궤적(정규 깊이, te 깊이 = 1)을 세상 미터로 옮겨 판정 면(z = zPlane)을 지나는 순간을 찾는다.
 *
 * 카메라 자세 `CameraPose` 는 플레이트 보정(calib.ts, P1)이 준다. 카메라 좌표는 엔진과 같다: xc 오른쪽 · yc 아래 · zc 앞(깊이).
 * 세상 좌표는 zone.ts 의 ABS 세상(원점 플레이트 꼭지 · x 1루 · y 위 · z 투수 쪽).
 *
 * 오차: σ 는 (1) 맞춘 매개변수 공분산을 통과점에 수치 미분으로 옮긴 것 + (2) 깊이 D 의 σ 가 통과점을 옮기는 양(D 를 ±σ 바꿔 다시 찾음 —
 * 플레이트 근처에서 1m 당 11~19cm 떨어진다)을 제곱합으로 더한 것. 이 둘이 계획서 오차 예산의 '통과 순간' 몫이다.
 */
import { type FitOptions, type TrajectoryFit, trajectoryState } from '../velocity-engine/trajectory-fit.ts';

export type Vec3 = [number, number, number];

/** 카메라 자세 — 세상 좌표의 카메라 자리와 회전 */
export type CameraPose = {
  position: Vec3;
  /** R[i] = 카메라 i축(xc · yc · zc)을 세상 좌표로 적은 단위 벡터 */
  R: [Vec3, Vec3, Vec3];
};

export type Crossing = {
  /** 통과 순간(궤적 시각, 초) */
  t: number;
  /** 세상 좌표의 통과점(m) */
  point: Vec3;
  /** 좌우 · 높이 σ(m) */
  sigmaX: number;
  sigmaY: number;
  /** 가장 가까운 관측 장면과의 거리(장면 수) */
  frameGap: number;
  /** 관측 범위 밖(플레이트 앞에서 공이 가려짐) */
  extrapolated: boolean;
};

export type CrossingFail = { t: null; reason: 'not-reached' | 'behind' };

export function camToWorld(pc: Vec3, pose: CameraPose): Vec3 {
  const [R0, R1, R2] = pose.R;
  return [
    pose.position[0] + R0[0] * pc[0] + R1[0] * pc[1] + R2[0] * pc[2],
    pose.position[1] + R0[1] * pc[0] + R1[1] * pc[1] + R2[1] * pc[2],
    pose.position[2] + R0[2] * pc[0] + R1[2] * pc[1] + R2[2] * pc[2],
  ];
}

export function worldToCam(pw: Vec3, pose: CameraPose): Vec3 {
  const d: Vec3 = [pw[0] - pose.position[0], pw[1] - pose.position[1], pw[2] - pose.position[2]];
  return pose.R.map((r) => r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) as Vec3;
}

/**
 * 투수 뒤 카메라의 자세 — 자리(세상 m) · 아래로 숙인 각 · 좌우로 돌린 각(라디안). 앞(zc)은 −z(플레이트 쪽). yaw + 는 오른쪽(+x)으로 돌아 봄.
 */
export function behindPitcherPose(position: Vec3, tiltDown: number, yaw = 0): CameraPose {
  const ct = Math.cos(tiltDown);
  const st = Math.sin(tiltDown);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const zc: Vec3 = [sy * ct, -st, -cy * ct];
  const xc: Vec3 = [cy, 0, sy];
  const yc: Vec3 = [
    zc[1] * xc[2] - zc[2] * xc[1],
    zc[2] * xc[0] - zc[0] * xc[2],
    zc[0] * xc[1] - zc[1] * xc[0],
  ];
  return { position, R: [xc, yc, zc] };
}

/** 매개변수 p 의 궤적이 t 에 있는 세상 자리(m) */
function worldAt(p: number[], te: number, opts: FitOptions, t: number, D: number, pose: CameraPose): Vec3 {
  const s = trajectoryState(p, te, t, opts);
  return camToWorld([s[0] * D, s[1] * D, s[2] * D], pose);
}

export function worldPositionAt(fit: TrajectoryFit, opts: FitOptions, t: number, D: number, pose: CameraPose): Vec3 {
  return worldAt(fit.p, fit.te, opts, t, D, pose);
}

/** z = zPlane 을 지나는 시각(이분법) — 공은 +z(투수)에서 −z(포수)로 간다. 못 지나면 null */
function solveT(
  p: number[],
  te: number,
  opts: FitOptions,
  D: number,
  pose: CameraPose,
  zPlane: number,
  from: number,
  to: number
): number | CrossingFail {
  const zAt = (t: number) => worldAt(p, te, opts, t, D, pose)[2] - zPlane;
  let a = from;
  let b = to;
  if (zAt(a) < 0) return { t: null, reason: 'behind' };
  if (zAt(b) > 0) return { t: null, reason: 'not-reached' };
  for (let i = 0; i < 44; i++) {
    const m = (a + b) / 2;
    if (zAt(m) > 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * 통과점. observedTimes 는 맞춤에 쓴 관측 시각(외삽 판정 · 장면 간격). window 기본은 첫 관측 − 0.15초 ~ te + 0.15초.
 */
export function findCrossing(
  fit: TrajectoryFit,
  opts: FitOptions,
  D: number,
  sigmaD: number,
  pose: CameraPose,
  zPlane: number,
  observedTimes: number[],
  window?: { from: number; to: number }
): Crossing | CrossingFail {
  const times = observedTimes.slice().sort((a, b) => a - b);
  const from = window?.from ?? times[0] - 0.15;
  const to = window?.to ?? fit.te + 0.15;
  const t0 = solveT(fit.p, fit.te, opts, D, pose, zPlane, from, to);
  if (typeof t0 !== 'number') return t0;
  const point = worldAt(fit.p, fit.te, opts, t0, D, pose);

  /* 깊이 D 가 ±σ 틀릴 때 통과점이 옮겨가는 양 */
  const h = Math.max(0.02, sigmaD);
  const at = (D2: number): Vec3 | null => {
    const t = solveT(fit.p, fit.te, opts, D2, pose, zPlane, from, to);
    return typeof t === 'number' ? worldAt(fit.p, fit.te, opts, t, D2, pose) : null;
  };
  const sp = at(D + h);
  const sm = at(D - h);
  const gx = sp && sm ? (sp[0] - sm[0]) / (2 * h) : 0;
  const gy = sp && sm ? (sp[1] - sm[1]) / (2 * h) : 0;

  /* 매개변수 공분산 → 통과점(통과 시각도 매개변수에 따라 움직이므로 다시 푼다) */
  let vx = 0;
  let vy = 0;
  if (fit.covariance) {
    const g: [number, number][] = fit.p.map((pk, k) => {
      const hk = 1e-5 * Math.max(1e-2, Math.abs(pk));
      const q = fit.p.slice();
      q[k] += hk;
      const tq = solveT(q, fit.te, opts, D, pose, zPlane, from, to);
      if (typeof tq !== 'number') return [0, 0];
      const pt = worldAt(q, fit.te, opts, tq, D, pose);
      return [(pt[0] - point[0]) / hk, (pt[1] - point[1]) / hk];
    });
    for (let i = 0; i < g.length; i++)
      for (let j = 0; j < g.length; j++) {
        vx += g[i][0] * fit.covariance[i][j] * g[j][0];
        vy += g[i][1] * fit.covariance[i][j] * g[j][1];
      }
  }
  const sigmaX = Math.sqrt(Math.max(0, vx) + (gx * sigmaD) ** 2);
  const sigmaY = Math.sqrt(Math.max(0, vy) + (gy * sigmaD) ** 2);

  const step = medianStep(times);
  const nearest = times.reduce((best, tt) => Math.min(best, Math.abs(tt - t0)), Infinity);
  return {
    t: t0,
    point,
    sigmaX,
    sigmaY,
    frameGap: step > 0 ? nearest / step : 0,
    extrapolated: t0 < times[0] || t0 > times[times.length - 1],
  };
}

function medianStep(times: number[]): number {
  if (times.length < 2) return 0;
  const d = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}
