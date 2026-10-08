import {
  analyzePitch3dCore,
  PITCH3D_VERSION,
  type Pitch3dCore,
} from '@/lib/pitch-3d/analyze';
import {
  pointOnRayAtDistance,
  project,
  ray,
  rootsOnRay,
  triangulate,
  type Camera,
  type Obs,
} from '@/lib/pitch-3d/camera';
import {
  add,
  cross,
  dot,
  fromRows,
  median,
  mul3,
  mulV,
  norm,
  normalize,
  robustCv,
  scale,
  sub,
  transpose,
  type Vec3,
} from '@/lib/pitch-3d/linalg';
import { computeMetrics, type Frame3 } from '@/lib/pitch-3d/metrics';
import { J, N_JOINTS } from '@/lib/pitch-3d/motion';
import {
  MAX_V2_FRAMES,
  N_V2_JOINTS,
  PITCH3D_V2_VERSION,
  V2_PAIRS,
  V2J,
  v2Fail,
  type Pitch3dV2Ok,
  type Pitch3dV2Result,
  type V2Input,
  type V2Obs,
} from '@/lib/pitch-3d/v2/contract';
import { byTime, medianStepOf, obsAt, toPoseTrack } from '@/lib/pitch-3d/v2/track';

/**
 * v2 맞추기(설계 pitch-3d-quality.md T4, 0절) — 두 영상의 2D 관절 25개를 하나의 뼈대(고정 뼈 길이 · 시간 매끈)에 맞춘다.
 *
 *   1 v1 core(analyzePitch3dCore): 시간 맞추기 · 카메라 · 다듬은 17관절 · 기준 축 — 그대로 이어 쓴다(지표 두 벌을 안 만들려고, 0-3절 4번)
 *   2 나머지 8관절(귀 · 손 MCP)은 v1 이 정한 좌우에 붙여(손은 가장 가까운 손목) 두 시선으로 교차, 한쪽만 보이면 부모에서 뼈 길이만큼 시선 위
 *   3 뼈 길이 = 잘 보인 장면들의 중앙값(좌우 같은 값), 모자라면 키 비율 기본값
 *   4 자리 기반 맞추기(PBD): 뼈 길이 투영 ↔ 시간 매끈(확신이 낮을수록 세게) ↔ 관찰로 당김(확신만큼)을 24번 되풀이 — 빈 관절은 부모 · 앞 장면으로 채우고
 *     제약과 매끈함만으로 정해진다(확신 0)
 *   5 확신(두 영상 2D 확신 × 다시 비춤) · 엷은 구간 · 품질(뼈 흔들림 · 다시 비춤 · 가속 p95) · v1 지표(맞춘 관절로 같은 정의) · 결과 좌표(mm)
 *
 * 순수 함수 — node(GPU 안) · 시험이 같은 코드. 관절 한계(무릎 · 팔꿈치 표) · 표준 곡선 · AI 보정은 0-3절 결정 뒤(지금 없음).
 */

const ITERATIONS = 24;
/** 끝에 관찰 당김 없이 다듬기 · 뼈 투영만 되풀이(길이를 굳힌다) */
const POLISH = 8;
/** 2D 확신 문턱 — 두 시선 교차 · 한 시선만 · 안 보임 */
const SEEN = 0.3;
const SURE = 0.7;
/** 장면 확신(0~100)이 이 밑이면 엷은 구간 */
const LOW_CONF = 60;
/** 빈 구간을 회전으로 이을 최대 장면 수 — 넘으면 앞 장면 방향을 잇는다(긴 가림을 지어내지 않게) */
const GAP_MAX = 15;
/**
 * 회전으로 이은 자리로 당기는 무게(관찰 확신 0~1 과 같은 척도) — 없으면(0) 시간 다듬기가 빈 구간을 앞뒤 직선으로 바꿨다.
 * 릴리스 근처 손목을 10장면 지운 합성: 빈 구간 손목 최대 오차 키의 14~24% → 0.3 에서 13~16% · 0.6 에서 12~14%.
 */
const GAP_PULL = 0.6;

/** 두 단위 방향 사이 구면 보간 */
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const th = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  if (th < 1e-4) return normalize(add(scale(a, 1 - t), scale(b, t)));
  const s = Math.sin(th);
  return add(scale(a, Math.sin((1 - t) * th) / s), scale(b, Math.sin(t * th) / s));
}

type Bone = { a: number; b: number; key: string; def: number; soft?: number };
/** 뼈 — key 가 같은 것은 길이를 같이 쓴다(좌우 대칭). def = 키 대비 기본 길이, soft = 허용 폭(몸통 옆은 꼬이면 실제로 변한다) */
const BONES: Bone[] = [
  { a: V2J.lSh, b: V2J.rSh, key: 'shoulders', def: 0.23 },
  { a: V2J.lHip, b: V2J.rHip, key: 'hips', def: 0.17 },
  { a: V2J.lEl, b: V2J.lSh, key: 'upperArm', def: 0.186 },
  { a: V2J.rEl, b: V2J.rSh, key: 'upperArm', def: 0.186 },
  { a: V2J.lWr, b: V2J.lEl, key: 'forearm', def: 0.146 },
  { a: V2J.rWr, b: V2J.rEl, key: 'forearm', def: 0.146 },
  { a: V2J.lKn, b: V2J.lHip, key: 'thigh', def: 0.245 },
  { a: V2J.rKn, b: V2J.rHip, key: 'thigh', def: 0.245 },
  { a: V2J.lAn, b: V2J.lKn, key: 'shank', def: 0.246 },
  { a: V2J.rAn, b: V2J.rKn, key: 'shank', def: 0.246 },
  { a: V2J.lHe, b: V2J.lAn, key: 'heel', def: 0.05 },
  { a: V2J.rHe, b: V2J.rAn, key: 'heel', def: 0.05 },
  { a: V2J.lTo, b: V2J.lAn, key: 'toe', def: 0.15 },
  { a: V2J.rTo, b: V2J.rAn, key: 'toe', def: 0.15 },
  { a: V2J.lTo, b: V2J.lHe, key: 'foot', def: 0.17 },
  { a: V2J.rTo, b: V2J.rHe, key: 'foot', def: 0.17 },
  { a: V2J.lEar, b: V2J.nose, key: 'noseEar', def: 0.09 },
  { a: V2J.rEar, b: V2J.nose, key: 'noseEar', def: 0.09 },
  { a: V2J.lEar, b: V2J.rEar, key: 'ears', def: 0.13 },
  { a: V2J.lHandMid, b: V2J.lWr, key: 'handMid', def: 0.09 },
  { a: V2J.rHandMid, b: V2J.rWr, key: 'handMid', def: 0.09 },
  { a: V2J.lHandIdx, b: V2J.lWr, key: 'handIdx', def: 0.085 },
  { a: V2J.rHandIdx, b: V2J.rWr, key: 'handIdx', def: 0.085 },
  { a: V2J.lHandPinky, b: V2J.lWr, key: 'handPinky', def: 0.08 },
  { a: V2J.rHandPinky, b: V2J.rWr, key: 'handPinky', def: 0.08 },
  { a: V2J.lHandIdx, b: V2J.lHandMid, key: 'mcp1', def: 0.022 },
  { a: V2J.rHandIdx, b: V2J.rHandMid, key: 'mcp1', def: 0.022 },
  { a: V2J.lHandMid, b: V2J.lHandPinky, key: 'mcp2', def: 0.04 },
  { a: V2J.rHandMid, b: V2J.rHandPinky, key: 'mcp2', def: 0.04 },
  { a: V2J.lSh, b: V2J.lHip, key: 'trunkSide', def: 0.29, soft: 0.08 },
  { a: V2J.rSh, b: V2J.rHip, key: 'trunkSide', def: 0.29, soft: 0.08 },
];
const RIGID = BONES.filter((b) => !b.soft);

/** 부모(채우기 차례 — 부모가 먼저 온다) */
const FILL_ORDER: number[] = [
  V2J.lHip,
  V2J.rHip,
  V2J.lSh,
  V2J.rSh,
  V2J.nose,
  V2J.lEar,
  V2J.rEar,
  V2J.lEl,
  V2J.rEl,
  V2J.lWr,
  V2J.rWr,
  V2J.lHandMid,
  V2J.rHandMid,
  V2J.lHandIdx,
  V2J.rHandIdx,
  V2J.lHandPinky,
  V2J.rHandPinky,
  V2J.lKn,
  V2J.rKn,
  V2J.lAn,
  V2J.rAn,
  V2J.lHe,
  V2J.rHe,
  V2J.lTo,
  V2J.rTo,
];
const PARENT_OF: Record<number, number> = {
  [V2J.lEar]: V2J.nose,
  [V2J.rEar]: V2J.nose,
  [V2J.lEl]: V2J.lSh,
  [V2J.rEl]: V2J.rSh,
  [V2J.lWr]: V2J.lEl,
  [V2J.rWr]: V2J.rEl,
  [V2J.lHandMid]: V2J.lWr,
  [V2J.rHandMid]: V2J.rWr,
  [V2J.lHandIdx]: V2J.lWr,
  [V2J.rHandIdx]: V2J.rWr,
  [V2J.lHandPinky]: V2J.lWr,
  [V2J.rHandPinky]: V2J.rWr,
  [V2J.lKn]: V2J.lHip,
  [V2J.rKn]: V2J.rHip,
  [V2J.lAn]: V2J.lKn,
  [V2J.rAn]: V2J.rKn,
  [V2J.lHe]: V2J.lAn,
  [V2J.rHe]: V2J.rAn,
  [V2J.lTo]: V2J.lAn,
  [V2J.rTo]: V2J.rAn,
};
const LEFT_HAND = [V2J.lHandIdx, V2J.lHandMid, V2J.lHandPinky];
const RIGHT_HAND = [V2J.rHandIdx, V2J.rHandMid, V2J.rHandPinky];
const CORE17 = Array.from({ length: N_JOINTS }, (_, j) => j);

const toObs = (o: V2Obs | undefined): Obs =>
  o ? { x: o[0], y: o[1], v: o[2] } : { x: 0, y: 0, v: 0 };
const d2 = (a: Obs, b: Obs) => Math.hypot(a.x - b.x, a.y - b.y);
const centroid = (ps: Obs[]): Obs => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
  v: Math.min(...ps.map((p) => p.v)),
});
const swapPairs = <T>(arr: T[]) => {
  const o = [...arr];
  for (const [l, r] of V2_PAIRS) [o[l], o[r]] = [o[r], o[l]];
  return o;
};

/**
 * 한 영상 한 장면의 25관절 2D — 앞 17은 v1 이 정한 것(좌우 고침 뒤), 귀는 원래 이름(뒤 영상 거울이면 바꿈), 손은 가장 가까운 손목 쪽.
 * raw 가 없으면(장면 시각이 안 맞음) 나머지 8은 안 보임(0)으로.
 */
function assemble(core17: Obs[], raw: V2Obs[] | null, mirrored: boolean): Obs[] {
  const out: Obs[] = Array.from({ length: N_V2_JOINTS }, () => ({ x: 0, y: 0, v: 0 }));
  for (let j = 0; j < N_JOINTS; j++) out[j] = core17[j];
  if (!raw) return out;
  out[V2J.lEar] = toObs(raw[mirrored ? V2J.rEar : V2J.lEar]);
  out[V2J.rEar] = toObs(raw[mirrored ? V2J.lEar : V2J.rEar]);
  const A = LEFT_HAND.map((j) => toObs(raw[j]));
  const B = RIGHT_HAND.map((j) => toObs(raw[j]));
  const lWr = core17[J.lWr];
  const rWr = core17[J.rWr];
  let aIsLeft = !mirrored;
  const aSeen = A.every((p) => p.v >= SEEN);
  const bSeen = B.every((p) => p.v >= SEEN);
  if (lWr.v >= SEEN && rWr.v >= SEEN && aSeen && bSeen) {
    const cA = centroid(A);
    const cB = centroid(B);
    aIsLeft = d2(cA, lWr) + d2(cB, rWr) <= d2(cA, rWr) + d2(cB, lWr);
  } else if (aSeen !== bSeen && (lWr.v >= SEEN || rWr.v >= SEEN)) {
    /* 한 손만 보이면 보이는 손목 쪽으로 */
    const seen = aSeen ? A : B;
    const c = centroid(seen);
    const nearLeft =
      lWr.v < SEEN ? false : rWr.v < SEEN ? true : d2(c, lWr) <= d2(c, rWr);
    aIsLeft = aSeen ? nearLeft : !nearLeft;
  }
  const left = aIsLeft ? A : B;
  const right = aIsLeft ? B : A;
  LEFT_HAND.forEach((j, i) => (out[j] = left[i]));
  RIGHT_HAND.forEach((j, i) => (out[j] = right[i]));
  return out;
}

/** n 장면 중 max 개를 고르게 — 꼭 남길 장면(순간)은 넣는다(v1 과 같은 규칙) */
function decimate(n: number, max: number, must: (number | null)[]): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const set = new Set<number>();
  for (let k = 0; k < max; k++) set.add(Math.round((k * (n - 1)) / (max - 1)));
  for (const m of must) if (m != null) set.add(m);
  return [...set].sort((a, b) => a - b);
}

const percentile = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

export type FitDebug = {
  core: Pitch3dCore;
  /** 맞춘 관절(보정 좌표계) */
  fitted: Vec3[][];
  weights: number[][];
};

/** 맞추기 — 결과(Pitch3dV2Result). 시험용으로 중간값도 돌려준다(debug) */
export function fitPitch3dV2(input: V2Input): {
  result: Pitch3dV2Result;
  debug?: FitDebug;
} {
  const jobId = input.jobId;
  const core = analyzePitch3dCore({
    side: toPoseTrack(input.side),
    back: toPoseTrack(input.back),
    hand: input.hand,
    slowmoFps: input.slowmoFps ?? null,
    screenRecorded: input.screenRecorded ?? false,
    events: input.events,
  });
  if ('ok' in core) return { result: v2Fail(jobId, core.code, 'fit', core.quality) };

  const { cal, synced, smooth, H } = core;
  const n = synced.length;
  const flips = core.quality.flips;

  /* ── 2D 관찰 25 × 두 영상(v1 이 정한 좌우에 맞춤) ── */
  const sideBy = byTime(input.side);
  const backDt = medianStepOf(input.back);
  let sideObs: Obs[][] = [];
  let backObs: Obs[][] = [];
  for (let k = 0; k < n; k++) {
    const s = synced[k];
    const bt = core.backTime[s.i];
    sideObs.push(assemble(s.side, sideBy.get(s.t) ?? null, false));
    backObs.push(
      assemble(
        s.back,
        bt == null ? null : obsAt(input.back, bt, backDt),
        flips.backMirrored
      )
    );
  }
  /* v1 이 3D 이름을 통째로 바꿨으면(던지는 손 확인) 2D 이름도 맞춘다 */
  if (flips.handSwapped) {
    sideObs = sideObs.map(swapPairs);
    backObs = backObs.map(swapPairs);
  }

  /* ── 관찰 3D · 가중 — 17 은 v1 다듬은 값, 8 은 교차 ── */
  const obs3: (Vec3 | null)[][] = [];
  const weight: number[][] = [];
  for (let k = 0; k < n; k++) {
    const row: (Vec3 | null)[] = [];
    const w: number[] = [];
    for (let j = 0; j < N_V2_JOINTS; j++) {
      const a = sideObs[k][j];
      const b = backObs[k][j];
      const both = a.v >= SEEN && b.v >= SEEN;
      let X: Vec3 | null = null;
      if (j < N_JOINTS) X = smooth[k][j] ?? null;
      else if (both) X = triangulate(cal.side, a, cal.back, b);
      row.push(X);
      w.push(
        X ? (both ? Math.min(a.v, b.v) : Math.max(a.v, b.v) >= SURE ? 0.3 : 0.15) : 0
      );
    }
    obs3.push(row);
    weight.push(w);
  }

  /* ── 뼈 길이(잘 보인 장면 중앙값, 좌우 같이) ── */
  const lengthOf = new Map<string, number>();
  {
    const samples = new Map<string, number[]>();
    for (const b of BONES) {
      const arr = samples.get(b.key) ?? [];
      for (let k = 0; k < n; k++) {
        const A = obs3[k][b.a];
        const B = obs3[k][b.b];
        const sure = (j: number) => sideObs[k][j].v >= SURE && backObs[k][j].v >= SURE;
        if (A && B && sure(b.a) && sure(b.b)) arr.push(norm(sub(A, B)));
      }
      samples.set(b.key, arr);
    }
    for (const b of BONES) {
      if (lengthOf.has(b.key)) continue;
      const arr = samples.get(b.key) ?? [];
      lengthOf.set(b.key, arr.length >= 5 ? median(arr) : b.def * H);
    }
  }
  const L = (b: Bone) => lengthOf.get(b.key)!;
  const boneLenByChild = new Map<number, number>();
  for (const b of RIGID) if (PARENT_OF[b.a] === b.b) boneLenByChild.set(b.a, L(b));

  /* ── 한쪽 영상만 보인 나머지 8 관절: 부모에서 뼈 길이만큼 그 시선 위(v1 R4 와 같은 규칙) ── */
  for (let k = 0; k < n; k++) {
    for (let j = N_JOINTS; j < N_V2_JOINTS; j++) {
      if (obs3[k][j]) continue;
      const p = PARENT_OF[j];
      const Lj = boneLenByChild.get(j);
      const P = obs3[k][p];
      if (Lj == null || !P) continue;
      const a = sideObs[k][j];
      const b = backObs[k][j];
      const sideOnly = a.v >= SURE && b.v < SEEN;
      const backOnly = b.v >= SURE && a.v < SEEN;
      if (!sideOnly && !backOnly) continue;
      const r = sideOnly ? ray(cal.side, a.x, a.y) : ray(cal.back, b.x, b.y);
      const roots = rootsOnRay(r, P, Lj);
      const ref = obs3[k - 1]?.[j] ?? P;
      if (roots.length === 0) obs3[k][j] = pointOnRayAtDistance(r, P, Lj, ref);
      else
        obs3[k][j] = roots.reduce((best, X) =>
          norm(sub(X, ref)) < norm(sub(best, ref)) ? X : best
        );
      weight[k][j] = 0.3;
    }
  }

  /* ── 처음 자리: 관찰 → 없으면 부모 + 앞 장면 방향 · 기본 방향 ── */
  const U = core.axes.U;
  const facingAt = (fr: (Vec3 | null)[]): Vec3 => {
    const l = fr[V2J.lSh];
    const r = fr[V2J.rSh];
    if (l && r) {
      const f = cross(normalize(sub(l, r)), U);
      if (norm(f) > 1e-6) return normalize(f);
    }
    return core.axes.F;
  };
  const lateralAt = (fr: (Vec3 | null)[]): Vec3 => {
    const l = fr[V2J.lSh] ?? fr[V2J.lHip];
    const r = fr[V2J.rSh] ?? fr[V2J.rHip];
    if (l && r && norm(sub(l, r)) > 1e-6) return normalize(sub(l, r));
    return scale(core.axes.G, input.hand === 'L' ? -1 : 1);
  };
  const defaultDir = (j: number, fr: (Vec3 | null)[]): Vec3 => {
    const F = facingAt(fr);
    const left = lateralAt(fr);
    const isLeft = [
      V2J.lEar,
      V2J.lEl,
      V2J.lWr,
      V2J.lKn,
      V2J.lAn,
      V2J.lHe,
      V2J.lTo,
      ...LEFT_HAND,
    ].includes(j);
    const sgn = isLeft ? 1 : -1;
    switch (j) {
      case V2J.lEar:
      case V2J.rEar:
        return normalize(add(scale(left, 0.75 * sgn), scale(F, -0.7)));
      case V2J.lHe:
      case V2J.rHe:
        return normalize(add(scale(F, -0.6), scale(U, -0.8)));
      case V2J.lTo:
      case V2J.rTo:
        return normalize(add(scale(F, 0.95), scale(U, -0.3)));
      case V2J.lHandIdx:
      case V2J.rHandIdx:
      case V2J.lHandMid:
      case V2J.rHandMid:
      case V2J.lHandPinky:
      case V2J.rHandPinky: {
        const wr = fr[isLeft ? V2J.lWr : V2J.rWr];
        const el = fr[isLeft ? V2J.lEl : V2J.rEl];
        const fore =
          wr && el && norm(sub(wr, el)) > 1e-6 ? normalize(sub(wr, el)) : scale(U, -1);
        const lat = normalize(cross(fore, U));
        const off =
          j === V2J.lHandIdx || j === V2J.rHandIdx
            ? 0.25
            : j === V2J.lHandPinky || j === V2J.rHandPinky
              ? -0.4
              : 0;
        return normalize(add(fore, scale(lat, off * sgn)));
      }
      default:
        return scale(U, -1);
    }
  };
  /*
   * 빈 구간의 방향 — 부모에서 자식으로의 방향을 빈 구간 앞뒤로 보인 장면 사이에서 회전으로 잇는다(GAP_MAX 장면까지).
   * 앞 장면 방향만 복사하면 빈 동안 팔이 멈췄다가 다시 보일 때 홱 튀었다(2026-10-08 릴리스 근처 손목을 지운 합성: 주변의 2배).
   */
  const gapDir: (Vec3 | null)[][] = Array.from({ length: n }, () =>
    new Array<Vec3 | null>(N_V2_JOINTS).fill(null)
  );
  for (const j of FILL_ORDER) {
    const p = PARENT_OF[j];
    if (p == null) continue;
    const dirAt = (k: number): Vec3 | null => {
      const C = obs3[k][j];
      const P = obs3[k][p];
      if (!C || !P) return null;
      const d = sub(C, P);
      return norm(d) > 1e-6 ? normalize(d) : null;
    };
    let last = -1;
    for (let k = 0; k < n; k++) {
      if (!dirAt(k)) continue;
      if (last >= 0 && k - last > 1 && k - last - 1 <= GAP_MAX) {
        const a = dirAt(last)!;
        const b = dirAt(k)!;
        for (let q = last + 1; q < k; q++) gapDir[q][j] = slerp(a, b, (q - last) / (k - last));
      }
      last = k;
    }
  }
  const X: Vec3[][] = [];
  const dataW: number[][] = [];
  /* 맞추기에서 당기는 무게 — 관찰은 dataW 그대로, 빈 구간을 회전으로 이은 자리는 GAP_PULL(확신 · 품질은 dataW 로만 — 화면엔 '짐작') */
  const pullW: number[][] = [];
  let filled = 0;
  for (let k = 0; k < n; k++) {
    const fr: (Vec3 | null)[] = obs3[k].map((v) => (v ? ([...v] as Vec3) : null));
    const w = [...weight[k]];
    const gapFilled = new Set<number>();
    const prev = X[k - 1];
    /* 뿌리(골반 · 어깨 · 코) — 없으면 짝 · 앞 장면 · 다른 뿌리에서 */
    const rootFill = (j: number, pair: number, up: number) => {
      if (fr[j]) return;
      filled++;
      w[j] = 0;
      const mate = fr[pair];
      const lat = lateralAt(fr);
      const sgn = j === V2J.lSh || j === V2J.lHip ? 1 : -1;
      const width = lengthOf.get(
        j === V2J.lSh || j === V2J.rSh ? 'shoulders' : 'hips'
      )!;
      if (mate) fr[j] = add(mate, scale(lat, sgn * width));
      else if (prev) fr[j] = prev[j];
      else {
        const other = fr[up];
        fr[j] = other
          ? add(other, scale(U, j === V2J.lSh || j === V2J.rSh ? 0.3 * H : -0.3 * H))
          : [0, 0, 0];
      }
    };
    rootFill(V2J.lHip, V2J.rHip, V2J.lSh);
    rootFill(V2J.rHip, V2J.lHip, V2J.rSh);
    rootFill(V2J.lSh, V2J.rSh, V2J.lHip);
    rootFill(V2J.rSh, V2J.lSh, V2J.rHip);
    if (!fr[V2J.nose]) {
      filled++;
      w[V2J.nose] = 0;
      const mid = scale(add(fr[V2J.lSh]!, fr[V2J.rSh]!), 0.5);
      fr[V2J.nose] = prev
        ? prev[V2J.nose]
        : add(mid, add(scale(U, 0.14 * H), scale(facingAt(fr), 0.05 * H)));
    }
    for (const j of FILL_ORDER) {
      if (fr[j]) continue;
      const p = PARENT_OF[j];
      if (p == null) continue;
      filled++;
      w[j] = 0;
      const Lj = boneLenByChild.get(j) ?? 0.1 * H;
      const P = fr[p]!;
      let dir: Vec3 | null = gapDir[k][j];
      if (dir) gapFilled.add(j);
      if (!dir && prev) {
        const d = sub(prev[j], prev[p]);
        if (norm(d) > 1e-6) dir = normalize(d);
      }
      fr[j] = add(P, scale(dir ?? defaultDir(j, fr), Lj));
    }
    X.push(fr as Vec3[]);
    dataW.push(w);
    pullW.push(w.map((v, j) => (gapFilled.has(j) ? GAP_PULL : v)));
  }
  const target: Vec3[][] = X.map((fr) => fr.map((v) => [...v] as Vec3));

  /*
   * ── 자리 기반 맞추기 ──
   * 되풀이마다 관찰로 당김 → 시간 매끈 → 뼈 길이 투영(앞 · 뒤 두 번 훑음) 차례 — 뼈 투영이 마지막이라 매 되풀이 끝에 길이가 맞고,
   * 끝에 관찰 당김 없는 다듬기 몇 번으로 길이를 굳힌다(처음엔 당김이 마지막이어서 뼈 흔들림이 6% 남았다, 합성).
   */
  const projectBones = (k: number) => {
    const fr = X[k];
    const w = pullW[k];
    const one = (b: Bone) => {
      const A = fr[b.a];
      const B = fr[b.b];
      const d = sub(A, B);
      const len = norm(d);
      if (len < 1e-9) return;
      const Lb = L(b);
      let want = Lb;
      if (b.soft) {
        const lo = Lb * (1 - b.soft);
        const hi = Lb * (1 + b.soft);
        if (len >= lo && len <= hi) return;
        want = len < lo ? lo : hi;
      }
      const corr = (len - want) / len;
      const ia = 1 / (w[b.a] + 0.05);
      const ib = 1 / (w[b.b] + 0.05);
      const sa = ia / (ia + ib);
      const sb = ib / (ia + ib);
      fr[b.a] = sub(A, scale(d, corr * sa));
      fr[b.b] = add(B, scale(d, corr * sb));
    };
    for (const b of BONES) one(b);
    for (let i = BONES.length - 1; i >= 0; i--) one(BONES[i]);
  };
  const smoothTime = (gain: number) => {
    for (let j = 0; j < N_V2_JOINTS; j++) {
      for (let k = 1; k < n - 1; k++) {
        const w = pullW[k][j];
        const s = gain * (0.1 + 0.9 * (1 - w) * (1 - w));
        const mid = scale(add(X[k - 1][j], X[k + 1][j]), 0.5);
        X[k][j] = add(X[k][j], scale(sub(mid, X[k][j]), s));
      }
    }
  };
  for (let it = 0; it < ITERATIONS; it++) {
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < N_V2_JOINTS; j++) {
        const w = pullW[k][j];
        if (w <= 0) continue;
        X[k][j] = add(X[k][j], scale(sub(target[k][j], X[k][j]), 0.5 * w));
      }
    }
    smoothTime(1);
    for (let k = 0; k < n; k++) projectBones(k);
  }
  for (let it = 0; it < POLISH; it++) {
    smoothTime(0.5);
    for (let k = 0; k < n; k++) projectBones(k);
  }

  /* ── 확신 · 다시 비춤 ── */
  const ps = core.side.person;
  const pb = core.back.person;
  const conf: number[][] = [];
  const reprojs: number[] = [];
  for (let k = 0; k < n; k++) {
    const row: number[] = [];
    for (let j = 0; j < N_V2_JOINTS; j++) {
      const w = dataW[k][j];
      if (w <= 0) {
        row.push(0);
        continue;
      }
      const a = sideObs[k][j];
      const b = backObs[k][j];
      let factor = 1;
      if (a.v >= 0.5 && b.v >= 0.5) {
        const pa = project(cal.side, X[k][j]);
        const pbb = project(cal.back, X[k][j]);
        if (pa && pbb) {
          const e =
            (Math.hypot(pa[0] - a.x, pa[1] - a.y) / ps +
              Math.hypot(pbb[0] - b.x, pbb[1] - b.y) / pb) /
            2;
          reprojs.push(e);
          factor = Math.max(0, 1 - e / 0.06);
        }
      }
      row.push(Math.round(100 * Math.max(0, Math.min(1, w * factor))));
    }
    conf.push(row);
  }
  /*
   * 장면 확신 = min(몸 17관절 평균, 던지는 팔 셋(어깨 · 팔꿈치 · 손목) 평균) — 릴리스 근처 팔 흐림은 드러나고, 닫힌 자세에서 먼 쪽 관절
   * 몇 개가 가려진 것만으로는 엷어지지 않게(가장 낮은 다섯의 평균으로 하면 합성 '실제처럼'에서 거의 전 구간이 엷어졌다).
   */
  const armJ = core.hand === 'L' ? [J.lSh, J.lEl, J.lWr] : [J.rSh, J.rEl, J.rWr];
  const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / (xs.length || 1);
  const lowConf: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const fc = Math.min(
      mean(CORE17.map((j) => conf[k][j])),
      mean(armJ.map((j) => conf[k][j]))
    );
    if (fc >= LOW_CONF) continue;
    const last = lowConf[lowConf.length - 1];
    if (last && last[1] === k - 1) last[1] = k;
    else lowConf.push([k, k]);
  }
  /* 재생 막대에 그릴 구간 — 틈 2장면 이하는 이어 붙이고, 3장면 밑(깜빡임)은 버린다 */
  const spans: [number, number][] = [];
  for (const s of lowConf) {
    const last = spans[spans.length - 1];
    if (last && s[0] - last[1] <= 3) last[1] = s[1];
    else spans.push([s[0], s[1]]);
  }
  lowConf.length = 0;
  for (const s of spans) if (s[1] - s[0] >= 2) lowConf.push(s);

  /* ── 품질 ── */
  const cvs = RIGID.map((b) =>
    robustCv(X.map((fr) => norm(sub(fr[b.a], fr[b.b]))))
  ).filter(Number.isFinite);
  const boneCvPct = cvs.length
    ? Math.round((cvs.reduce((a, c) => a + c, 0) / cvs.length) * 1000) / 10
    : 0;
  /* 가속 p95 — 몸 17관절(v1 과 같은 관절로 견준다, 손 · 귀는 릴리스 흐림으로 원래 튄다) */
  const acc: number[] = [];
  for (let k = 1; k < n - 1; k++)
    for (let j = 0; j < N_JOINTS; j++)
      acc.push(norm(sub(add(X[k + 1][j], X[k - 1][j]), scale(X[k][j], 2))) / H);
  const accelP95 = Math.round(percentile(acc, 0.95) * 10000) / 10000;
  const reprojPct = Math.round(percentile(reprojs, 0.5) * 1000) / 10;
  if (
    !Number.isFinite(boneCvPct) ||
    X.some((fr) => fr.some((p) => p.some((v) => !Number.isFinite(v))))
  )
    return { result: v2Fail(jobId, 'fit', 'fit', core.quality) };

  /* ── 지표(v1 정의, 맞춘 17관절로) ── */
  const fitted17: Frame3[] = X.map((fr) => fr.slice(0, N_JOINTS));
  const metrics = computeMetrics(
    fitted17,
    { ...core.axes, hand: core.hand, height: H },
    core.evIdx,
    core.factors,
    core.plantMs
  );

  /* ── 결과 좌표 [앞, 위, 오른쪽] · 키 = 1000mm ── */
  const { origin, ground, R3, axes } = core;
  const keep = decimate(n, MAX_V2_FRAMES, [
    core.evIdx.footPlant,
    core.evIdx.release,
    core.evIdx.kneeUp,
  ]);
  const mm = (v: number) => Math.round((v / H) * 1000);
  const toRes = (P: Vec3): [number, number, number] => {
    const d = sub(P, origin);
    return [mm(dot(d, axes.F)), mm(dot(d, axes.U) - ground), mm(dot(d, R3))];
  };
  const remap = (k: number | null) => (k == null ? null : keep.indexOf(k));
  /* 카메라를 결과 좌표계로: X = origin + ground·U + H·Mᵀ·X_res → R' = R·Mᵀ, t' = (R·(origin + ground·U) + t) / H */
  const M = fromRows(axes.F, axes.U, R3);
  const toCam = (c: Camera, W: number, Hh: number) => ({
    f: c.f,
    cx: c.cx,
    cy: c.cy,
    R: mul3(c.R, transpose(M)).map((v) => Math.round(v * 1e6) / 1e6),
    t: scale(add(mulV(c.R, add(origin, scale(U, ground))), c.t), 1 / H).map(
      (v) => Math.round(v * 1e4) / 1e4
    ) as Vec3,
    W,
    H: Hh,
  });
  const boneLen: Record<string, number> = {};
  for (const [j, l] of boneLenByChild)
    boneLen[String(j)] = Math.round((l / H) * 1000) / 1000;

  const ok: Pitch3dV2Ok = {
    ok: true,
    version: PITCH3D_V2_VERSION,
    jobId,
    hand: core.hand,
    engine: { v1: PITCH3D_VERSION, pose: input.poseModel },
    t: keep.map((k) => Math.round(synced[k].t * 1000) / 1000),
    tBack: keep.map(
      (k) => Math.round((core.backTime[synced[k].i] ?? synced[k].t) * 1000) / 1000
    ),
    joints: keep.map((k) => X[k].map(toRes)),
    conf: keep.map((k) => conf[k]),
    lowConf: lowConf
      .map(([a, b]) => {
        const ia = keep.findIndex((k) => k >= a);
        let ib = -1;
        for (let q = keep.length - 1; q >= 0; q--)
          if (keep[q] <= b) {
            ib = q;
            break;
          }
        return ia >= 0 && ib >= ia ? ([ia, ib] as [number, number]) : null;
      })
      .filter((s): s is [number, number] => s != null),
    events: {
      kneeUp: remap(core.evIdx.kneeUp),
      footPlant: remap(core.evIdx.footPlant)!,
      release: remap(core.evIdx.release)!,
    },
    metrics,
    quality: core.quality,
    fit: { boneCvPct, reprojPct, filled, accelP95, boneLen },
    warnings: core.warnings,
    cameras: {
      side: toCam(cal.side, core.side.W, core.side.H),
      back: toCam(cal.back, core.back.W, core.back.H),
    },
    segment: {
      fromSec: Math.round(synced[0].t * 1000) / 1000,
      toSec: Math.round(synced[n - 1].t * 1000) / 1000,
    },
  };
  return { result: ok, debug: { core, fitted: X, weights: dataW } };
}
