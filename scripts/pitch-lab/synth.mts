/**
 * 합성 투수 — 알려진 3D 관절(우투, 좌투는 거울)을 가짜 카메라 둘로 비춰 PoseTrack 을 만든다(3D 엔진 시험 · 진단용).
 * 쓰는 곳: scripts/pitch-3d-selftest.mts. 진짜 지표는 같은 지표 함수로 진짜 3D 에서 잰다.
 */
import { analyzePitch3d, type Pitch3dResult } from '../../lib/pitch-3d/analyze.ts';
import { project, type Camera } from '../../lib/pitch-3d/camera.ts';
import { add, cross, mulV, norm, normalize, reject, scale, sub, type Mat3, type Vec3 } from '../../lib/pitch-3d/linalg.ts';
import { computeMetrics, type MetricKey } from '../../lib/pitch-3d/metrics.ts';
import { JOINTS, J } from '../../lib/pitch-3d/motion.ts';
import type { PoseFrame, PoseTrack } from '../../lib/pose/types.ts';

/* 결정적 난수(mulberry32) + 정규 분포 */
export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  return { u, n };
}

/* ───────────────────────────── 합성 투수 ───────────────────────────── */

export const H = 1.83;
const SEG = { thigh: 0.245 * H, shank: 0.246 * H, upperArm: 0.186 * H, forearm: 0.146 * H, hipW: 0.17 * H, shW: 0.23 * H, trunk: 0.29 * H, ankleH: 0.039 * H };
export const EV = { kneeUp: 0.55, footPlant: 1.05, release: 1.2 };

/** 키프레임 [시각, 값] 사이를 부드럽게(코사인) */
function curve(keys: [number, number][], t: number) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    if (t <= keys[k][0]) {
      const [t0, v0] = keys[k - 1];
      const [t1, v1] = keys[k];
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * u)) * 0.5;
    }
  }
  return keys.at(-1)![1];
}
const rad = (d: number) => (d * Math.PI) / 180;
const X_: Vec3 = [1, 0, 0];
const Y_: Vec3 = [0, 1, 0];
const facing = (psiDeg: number): Vec3 => [Math.cos(rad(psiDeg)), 0, Math.sin(rad(psiDeg))];
const rightOf = (f: Vec3) => cross(f, Y_);

/** 두 마디 IK — 엉덩이 h 에서 발목 a 로, pole 쪽으로 무릎. 다리가 닿지 않으면 쭉 편 채 발목을 당긴다 */
function ik(h: Vec3, a: Vec3, l1: number, l2: number, pole: Vec3): { knee: Vec3; ankle: Vec3 } {
  let d = norm(sub(a, h));
  const e = normalize(sub(a, h));
  const maxD = l1 + l2 - 1e-4;
  if (d > maxD) {
    d = maxD;
    a = add(h, scale(e, d));
  }
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const n = normalize(reject(pole, e));
  return { knee: add(add(h, scale(e, along)), scale(n, hgt)), ankle: a };
}

/** 우투 기준 3D 관절 17개(엔진 순번) — 실제 시각 t(초) */
function pitcher(t: number): Vec3[] {
  const pel: Vec3 = [
    curve([[0, 0], [0.45, -0.02], [0.6, 0.05], [1.05, 0.85], [1.2, 0.98], [1.5, 1.08]], t),
    curve([[0, 0.53 * H], [0.5, 0.55 * H], [0.9, 0.48 * H], [1.05, 0.45 * H], [1.2, 0.45 * H], [1.5, 0.47 * H]], t),
    curve([[0, 0], [1.5, -0.05]], t),
  ];
  const psiP = curve([[0, 90], [0.5, 98], [0.8, 95], [1.05, 55], [1.2, 10], [1.5, -25]], t);
  const psiS = curve([[0, 90], [0.5, 100], [0.8, 103], [1.05, 100], [1.13, 62], [1.2, 15], [1.5, -35]], t);
  const tf = curve([[0, 3], [0.5, -5], [1.05, 8], [1.2, 32], [1.5, 45]], t);
  const tl = curve([[0, 0], [1.05, 5], [1.2, 24], [1.5, 28]], t);
  const G: Vec3 = [0, 0, -1];
  const T = normalize(add(add(Y_, scale(X_, Math.tan(rad(tf)))), scale(G, Math.tan(rad(tl)))));
  const rp = rightOf(facing(psiP));
  const rHip = add(pel, scale(rp, SEG.hipW / 2));
  const lHip = add(pel, scale(rp, -SEG.hipW / 2));
  const midSh = add(pel, scale(T, SEG.trunk));
  const rs = normalize(reject(rightOf(facing(psiS)), T));
  const chest = cross(T, rs);
  const rSh = add(midSh, scale(rs, SEG.shW / 2));
  const lSh = add(midSh, scale(rs, -SEG.shW / 2));
  /* 서 있을 때 코~발목 = 키의 0.87(엔진의 키 어림과 같은 사람 비율) */
  const nose = add(add(midSh, scale(T, 0.09 * H)), scale(X_, 0.05 * H));

  const arm = (sh: Vec3, lateral: Vec3, a: number, b: number, g: number, e: number) => {
    const u = normalize(add(scale(T, -Math.cos(rad(a))), scale(add(scale(lateral, Math.cos(rad(b))), scale(chest, Math.sin(rad(b)))), Math.sin(rad(a)))));
    const ref = normalize(reject(T, u));
    const post = normalize(reject(scale(chest, -1), u));
    const w = add(scale(ref, Math.cos(rad(g - 90))), scale(post, Math.sin(rad(g - 90))));
    const v = normalize(add(scale(u, Math.cos(rad(e))), scale(w, Math.sin(rad(e)))));
    const el = add(sh, scale(u, SEG.upperArm));
    return { el, wr: add(el, scale(v, SEG.forearm)) };
  };
  const TA = (keys: number[]) => curve([0, 0.5, 0.8, 1.05, 1.14, 1.2, 1.35, 1.5].map((tt, i) => [tt, keys[i]] as [number, number]), t);
  const tArm = arm(rSh, rs, TA([25, 20, 70, 90, 95, 95, 75, 55]), TA([40, 40, -30, -15, 0, 10, 45, 70]), TA([30, 30, 40, 75, 170, 110, 40, 20]), TA([100, 100, 60, 95, 95, 25, 40, 60]));
  const GA = (keys: number[]) => curve([0, 0.5, 0.8, 1.05, 1.2, 1.5].map((tt, i) => [tt, keys[i]] as [number, number]), t);
  const gArm = arm(lSh, scale(rs, -1), GA([25, 20, 75, 85, 55, 40]), GA([40, 40, 60, 50, 80, 90]), GA([30, 30, 40, 40, 40, 40]), GA([100, 100, 40, 30, 100, 110]));

  const leadA: Vec3 = [
    curve([[0, 0.32], [0.3, 0.3], [0.55, 0.1], [0.8, 0.7], [1.05, 1.32], [1.5, 1.32]], t),
    curve([[0, SEG.ankleH], [0.3, SEG.ankleH], [0.55, 0.3 * H], [0.8, 0.12 * H], [1.05, SEG.ankleH], [1.5, SEG.ankleH]], t),
    curve([[0, 0], [0.3, 0], [0.55, 0.1], [0.8, 0.05], [1.05, -0.06], [1.5, -0.06]], t),
  ];
  const backA: Vec3 = [curve([[0, 0], [1.25, 0], [1.5, 0.3]], t), SEG.ankleH, curve([[0, 0.02], [1.5, 0]], t)];
  const poleLead = normalize(add(facing(psiP), scale(X_, 0.5)));
  const lead = ik(lHip, leadA, SEG.thigh, SEG.shank, poleLead);
  const backLeg = ik(rHip, backA, SEG.thigh, SEG.shank, normalize(add(facing(psiP), X_)));
  const footLead = normalize(add(scale(facing(psiP), 0.5), X_));
  const footBack: Vec3 = [0, 0, 1];
  const feet = (an: Vec3, dir: Vec3) => ({
    heel: add(sub(an, scale(dir, 0.05 * H)), [0, -0.02 * H, 0]),
    toe: add(add(an, scale(dir, 0.11 * H)), [0, -0.03 * H, 0]),
  });
  const fl = feet(lead.ankle, footLead);
  const fb = feet(backLeg.ankle, footBack);
  const p: Vec3[] = new Array(17);
  p[J.nose] = nose;
  p[J.lSh] = lSh;
  p[J.rSh] = rSh;
  p[J.lEl] = gArm.el;
  p[J.rEl] = tArm.el;
  p[J.lWr] = gArm.wr;
  p[J.rWr] = tArm.wr;
  p[J.lHip] = lHip;
  p[J.rHip] = rHip;
  p[J.lKn] = lead.knee;
  p[J.rKn] = backLeg.knee;
  p[J.lAn] = lead.ankle;
  p[J.rAn] = backLeg.ankle;
  p[J.lHe] = fl.heel;
  p[J.rHe] = fb.heel;
  p[J.lTo] = fl.toe;
  p[J.rTo] = fb.toe;
  return p;
}

/** 좌투 = 거울(z 뒤집기) + 좌우 이름 바꿈 */
const LR: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]];
export function pitcherHand(t: number, hand: 'R' | 'L'): Vec3[] {
  const p = pitcher(t);
  if (hand === 'R') return p;
  const m = p.map((v) => [v[0], v[1], -v[2]] as Vec3);
  for (const [a, b] of LR) [m[a], m[b]] = [m[b], m[a]];
  return m;
}

/** 겨누는 카메라: 위치 C 에서 target 을 본다(광축이 투수에서 만난다). roll(도)은 광축 둘레 */
export function lookAt(C: Vec3, target: Vec3, f: number, W: number, Hh: number, rollDeg = 0): Camera {
  const z = normalize(sub(target, C));
  let x = normalize(cross(z, Y_));
  let y = cross(z, x);
  if (rollDeg) {
    const c = Math.cos(rad(rollDeg));
    const s = Math.sin(rad(rollDeg));
    [x, y] = [add(scale(x, c), scale(y, s)), add(scale(y, c), scale(x, -s))];
  }
  const R: Mat3 = [...x, ...y, ...z];
  return { f, cx: W / 2, cy: Hh / 2, R, t: scale(mulV(R, C), -1) };
}

export type Scenario = {
  name: string;
  hand: 'R' | 'L';
  noise: number;
  occlusion: boolean;
  flipRate: number;
  /** 뒤 영상 몸 전체 좌우 바꿈(MediaPipe 가 뒤에서 거울로 붙인 경우) */
  backMirror?: boolean;
  /** 카메라: 거리(m) · 초점(긴 변 배수) · 높이(m, 겨누는 점 위) · 옆으로 기울임(도) */
  side: { D: number; k: number; up: number; roll: number; W: number; H: number };
  back: { D: number; k: number; up: number; roll: number; W: number; H: number };
  /** 두 카메라 사이 각(도, 90 = 옆 · 뒤) */
  angle: number;
  /** 슬로모 배수(재생 30fps 기준) · 시작 어긋남(실제 초) */
  slowSide: number;
  slowBack: number;
  offBack: number;
  /** 추출기가 받는 장면 간격(영상 초) */
  sampleSide: number;
  sampleBack: number;
  /** 옆 영상이 끝나는 실제 시각(기본 1.5) */
  sideEnd?: number;
  /** 뒤 영상이 끝나는 실제 시각(기본 1.6) */
  backEnd?: number;
};

/** 장면들을 PoseTrack 으로 — 실제 시각 → 영상 시각, 같은 장면(재생 30fps · 녹화 60fps), 잡음 · 가려짐 · 뒤바뀜 */
export function makeTrack(
  sc: Scenario,
  cam: Camera,
  cfg: Scenario['side'],
  which: 'side' | 'back',
  seed: number
): { track: PoseTrack; toMedia: (t: number) => number; contentReal: Map<number, number> } {
  const slow = which === 'side' ? sc.slowSide : sc.slowBack;
  const off = which === 'side' ? 0 : sc.offBack;
  const realStart = which === 'side' ? -0.05 : -0.25;
  const realEnd = which === 'side' ? (sc.sideEnd ?? 1.5) : (sc.backEnd ?? 1.6);
  const toMedia = (tr: number) => (tr - realStart + off) * slow;
  const fromMedia = (tm: number) => tm / slow + realStart - off;
  const mediaEnd = toMedia(realEnd);
  const step = which === 'side' ? sc.sampleSide : sc.sampleBack;
  const frames: PoseFrame[] = [];
  /** 장면 시각 → 그 장면에 담긴 실제 시각(재생 30fps 칸) */
  const contentReal = new Map<number, number>();
  const personPx = (cam.f * H) / (which === 'side' ? cfg.D : cfg.D);
  for (let tm = 0; tm <= mediaEnd; tm += step) {
    /* 재생 화면은 30fps — 영상 시각을 1/30 칸으로 내린 장면이 보인다. 같은 장면이면 관절도 같다(잡음도 장면마다 하나) */
    const shownIdx = Math.floor(tm * 30);
    const shown = shownIdx / 30;
    const r = rng(seed * 100003 + shownIdx * 7919);
    const tr = fromMedia(shown);
    const P = pitcherHand(Math.max(0, Math.min(1.5, tr)), sc.hand);
    const cams = P.map((X) => add(mulV(cam.R, X), cam.t));
    const img = P.map((X) => project(cam, X) ?? [0, 0]);
    const vis = new Array(17).fill(0.95);
    const pts = img.map((p) => [p[0], p[1]] as [number, number]);
    /* 가려짐 — 좌우 짝이 화면에서 겹치고(사람 6% 안) 깊이가 10cm 넘게 다르면 먼 쪽은 지어낸다 */
    if (sc.occlusion) {
      for (const [a, b] of LR) {
        const d2 = Math.hypot(img[a][0] - img[b][0], img[a][1] - img[b][1]);
        const dz = cams[a][2] - cams[b][2];
        if (d2 < personPx * 0.06 && Math.abs(dz) > 0.1) {
          const far = dz > 0 ? a : b;
          const near = far === a ? b : a;
          vis[far] = 0.35;
          pts[far] = [pts[far][0] + (pts[near][0] - pts[far][0]) * 0.25, pts[far][1] + (pts[near][1] - pts[far][1]) * 0.25];
        }
      }
    }
    const nearRelease = Math.abs(tr - EV.release) < 0.06;
    for (let j = 0; j < 17; j++) {
      const limb = j >= 3 && j <= 6 ? 1.6 : j >= 9 ? 1.2 : 1;
      const blur = nearRelease && (j === J.rWr || j === J.lWr || j === J.rEl || j === J.lEl) ? 2 : 1;
      const occ = vis[j] < 0.5 ? 2 : 1;
      const s = sc.noise * personPx * limb * blur * occ;
      pts[j] = [pts[j][0] + r.n() * s, pts[j][1] + r.n() * s];
      if (blur > 1) vis[j] = Math.min(vis[j], 0.45);
    }
    /* 뒤 영상 좌우 뒤바뀜(팔 · 다리 묶음) */
    const order = Array.from({ length: 17 }, (_, j) => j);
    const swap = (pairs: [number, number][]) => {
      for (const [a, b] of pairs) [order[a], order[b]] = [order[b], order[a]];
    };
    if (which === 'back') {
      if (sc.backMirror) swap(LR);
      if (r.u() < sc.flipRate) swap([[1, 2], [3, 4], [5, 6]]);
      if (r.u() < sc.flipRate) swap([[7, 8], [9, 10], [11, 12], [13, 14], [15, 16]]);
    }
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    JOINTS.forEach((mp, j) => {
      const src = order[j];
      landmarks[mp] = { x: pts[src][0] / cfg.W, y: pts[src][1] / cfg.H, z: 0, visibility: vis[src] };
    });
    /* 쓰지 않는 얼굴 · 손 점은 코 · 손목으로 채운다(좌우 바꿈이 엇갈리지 않게) */
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) landmarks[k] = { ...landmarks[0] };
    for (const k of [17, 19, 21]) landmarks[k] = { ...landmarks[15] };
    for (const k of [18, 20, 22]) landmarks[k] = { ...landmarks[16] };
    frames.push({ t: tm, landmarks });
    contentReal.set(tm, Math.max(0, Math.min(1.5, tr)));
  }
  return {
    track: { frames, connections: [], videoWidth: cfg.W, videoHeight: cfg.H, sampleStep: step, quality: 0.95, coverage: 1 },
    toMedia,
    contentReal,
  };
}

export function cameras(sc: Scenario) {
  const target: Vec3 = [0.65, 0.95, 0];
  /* 옆 = 우투면 3루 쪽(+z), 좌투면 1루 쪽(−z) — 가슴을 본다. 뒤 = 2루 쪽(−x)에서 angle 만큼 옆으로 돈 자리 */
  const sideDir: Vec3 = sc.hand === 'R' ? [0, 0, 1] : [0, 0, -1];
  const a = rad(sc.angle);
  const backDir: Vec3 = normalize(add(scale(sideDir, Math.cos(a)), scale([-1, 0, 0], Math.sin(a))));
  const s = sc.side;
  const b = sc.back;
  const side = lookAt(add(target, add(scale(sideDir, s.D), [0, s.up, 0])), target, s.k * Math.max(s.W, s.H), s.W, s.H, s.roll);
  const back = lookAt(add(target, add(scale(backDir, b.D), [0, b.up, 0])), target, b.k * Math.max(b.W, b.H), b.W, b.H, b.roll);
  return { side, back };
}

/** 진짜 지표 — 진짜 3D 에서 같은 지표 함수로(U = 위, F = 니업~착지 골반이 간 수평 방향) */
export function truthMetrics(sc: Scenario, realTimes: number[], ev: { kneeUp: number; footPlant: number; release: number }) {
  const frames = realTimes.map((tr) => pitcherHand(tr, sc.hand));
  const U: Vec3 = [0, 1, 0];
  const pk = frames[ev.kneeUp];
  const pf = frames[ev.footPlant];
  const travel = reject(sub(add(pf[J.lHip], pf[J.rHip]), add(pk[J.lHip], pk[J.rHip])), U);
  const F = normalize(travel);
  const G = sc.hand === 'L' ? normalize(cross(F, U)) : normalize(cross(U, F));
  return computeMetrics(frames, { U, F, G, hand: sc.hand, height: H }, ev, { calibration: 1, narrow: 1, density: 1, vertical: 1 }, null);
}

export type Run = { result: Pitch3dResult; errors: Partial<Record<MetricKey, number>>; ms: number };

export function run(sc: Scenario, seed: number): Run {
  const { side: camS, back: camB } = cameras(sc);
  const s = makeTrack(sc, camS, sc.side, 'side', seed * 10 + 1);
  const b = makeTrack(sc, camB, sc.back, 'back', seed * 10 + 2);
  const media = (tr: number) => s.toMedia(tr);
  const t0 = Date.now();
  const result = analyzePitch3d({
    side: s.track,
    back: b.track,
    hand: sc.hand,
    screenRecorded: true,
    slowmoFps: 240,
    events: { kneeUp: media(EV.kneeUp), footPlant: media(EV.footPlant), release: media(EV.release) },
  });
  const ms = Date.now() - t0;
  const errors: Partial<Record<MetricKey, number>> = {};
  if (result.ok) {
    /* 결과 장면(시각은 소수 3자리) → 가장 가까운 합성 장면의 실제 시각 */
    const keys = [...s.contentReal.keys()];
    const realOf = (tm: number) => {
      let best = keys[0];
      for (const k of keys) if (Math.abs(k - tm) < Math.abs(best - tm)) best = k;
      return s.contentReal.get(best)!;
    };
    const truth = truthMetrics(sc, result.t.map(realOf), {
      kneeUp: result.events.kneeUp ?? 0,
      footPlant: result.events.footPlant,
      release: result.events.release,
    });
    for (const m of result.metrics) {
      const tr = truth.find((x) => x.key === m.key);
      if (tr) errors[m.key] = m.value - tr.value;
    }
  }
  return { result, errors, ms };
}

export const PHONE = { W: 1080, H: 1350 };
export const base: Scenario = {
  name: '',
  hand: 'R',
  noise: 0,
  occlusion: false,
  flipRate: 0,
  side: { D: 7.5, k: 2.2, up: 0.3, roll: 0, ...PHONE },
  back: { D: 7.5, k: 2.0, up: 0.45, roll: 0, ...PHONE },
  angle: 90,
  slowSide: 8,
  slowBack: 8,
  offBack: 0,
  sampleSide: 1 / 48,
  sampleBack: 1 / 48,
};
export const realistic: Partial<Scenario> = { noise: 0.008, occlusion: true, flipRate: 0.03, slowBack: 4, offBack: 0.13, sampleBack: 1 / 40 };
