import {
  agrees,
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
  reject,
  robustCv,
  rodrigues,
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
import { dropLegOverlaps } from '@/lib/pitch-3d/v2/clean2d';
import { phaseOf, templateFill } from '@/lib/pitch-3d/v2/motion-template';
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
/** 팔은 두 영상 다 이만큼 또렷해야 교차한다 — 밑이면 또렷한 한 영상의 시선 위(아래 '한쪽 영상만 또렷한 관절') */
const ARM_TRI_MIN = 0.5;
/** 흐린 영상과 교차한 팔 관절이 부모에서 뼈 길이의 이만큼 안이면 믿는다 */
const ARM_LEN_TOL = 0.25;
/** 한 영상에서 두 다리 점이 사람 크기의 이만큼 안이면 겹침 */
const LEG_OVERLAP = 0.035;
/** 한 영상 시선 위에 둔 관절로 당기는 무게(v1 R4 와 같은 값) */
const ONE_VIEW_W = 0.3;
/** 장면 확신(0~100)이 이 밑이면 엷은 구간 */
const LOW_CONF = 60;
/** 빈 구간을 회전으로 이을 최대 장면 수 — 넘으면 앞 장면 방향을 잇는다(긴 가림을 지어내지 않게) */
const GAP_MAX = 15;
/**
 * 회전으로 이은 자리로 당기는 무게(관찰 확신 0~1 과 같은 척도) — 없으면(0) 시간 다듬기가 빈 구간을 앞뒤 직선으로 바꿨다.
 * 릴리스 근처 손목을 10장면 지운 합성: 빈 구간 손목 최대 오차 키의 14~24% → 0.3 에서 13~16% · 0.6 에서 12~14%.
 */
const GAP_PULL = 0.6;
/**
 * 통계 움직임 틀(motion-template.ts)로 채운 관절로 당기는 무게 — 틀이 확실할수록(표준편차가 키의 TPL_SD_REF 안) 이만큼, 흐리면 줄인다.
 * 틀은 투구 TPL_MIN_PITCHES 개 넘게로 만든 것만 쓴다.
 */
const TPL_PULL = 0.6;
const TPL_SD_REF = 0.03;
const TPL_MIN_PITCHES = 20;
/** 틀은 이만큼 이어서 빈 관절에만(짧은 틈은 앞뒤를 회전으로 잇는다) */
const TPL_MIN_GAP = 4;
/** 발이 땅에 닿았다고 보는 발목 움직임 폭(키 대비) — 5장면 가운데값으로 다듬은 발목이 구간 가운데값에서 이 안 */
const CONTACT_STAY = 0.035;
/** 닿은 구간의 높이 띠 — 그 발 발목 높이의 아래 10% + 키의 이만큼(니업 꼭대기에서 잠깐 멈춘 발은 빠진다) */
const CONTACT_BAND = 0.1;
/** 닿은 구간의 최소 길이 — 착지 → 릴리스 장면 수의 비(최소 4장면). 실제 약 0.08초 — 내려오는 발(초속 2m 넘게)은 그동안 가만있지 않는다 */
const CONTACT_MIN = 0.5;
/** 닿은 구간 안에서 튀어도 되는 점의 몫(가려짐 · 좌우 뒤바뀜) */
const CONTACT_OUT = 0.2;
/** 닿은 발이 넘지 않는 빠르기(키 / 실제 초 — 키 1.8m 면 초속 18cm) */
const CONTACT_SPEED = 0.1;
/** 착지 → 릴리스의 실제 시간(초) 어림 — 슬로모 배수를 몰라도 장면 수를 실제 시간으로 바꾼다 */
const PLANT_TO_RELEASE_S = 0.15;
/** 닿기 앞뒤로 그 자리로 섞어 당기는 장면 수 — 한 장면에 붙거나 떨어지지 않게 */
const CONTACT_EASE = 2;
/** 이보다 크게 기운 발(발끝으로 선 발)은 평평하게 펴지 않는다(°) */
const LEVEL_MAX_DEG = 35;
/** 몸통 · 머리 점 다듬기 폭 — 착지 → 릴리스 장면 수의 비(그 구간 ≈ 0.17초라 0.06 ≈ 10ms) */
const TRUNK_SIGMA = 0.06;
const TRUNK_JOINTS = [
  V2J.lHip,
  V2J.rHip,
  V2J.lSh,
  V2J.rSh,
  V2J.nose,
  V2J.lEar,
  V2J.rEar,
];

/** 햄펠 거르기 — 앞뒤 half 장면의 가운데값에서 k 배 MAD 넘게 떨어진 값을 가운데값으로 */
function hampel(xs: number[], half: number, k: number): number[] {
  return xs.map((x, i) => {
    const win = xs.slice(Math.max(0, i - half), i + half + 1);
    const m = median(win);
    const mad = median(win.map((v) => Math.abs(v - m))) * 1.4826;
    return mad > 0 && Math.abs(x - m) > k * mad ? m : x;
  });
}

/** 가우스 다듬기(양 끝은 있는 장면만으로 다시 나눔) */
function gaussSmooth(xs: number[], sigma: number): number[] {
  const r = Math.ceil(sigma * 2.5);
  const w = Array.from({ length: 2 * r + 1 }, (_, i) =>
    Math.exp(-((i - r) ** 2) / (2 * sigma * sigma))
  );
  return xs.map((_, i) => {
    let s = 0;
    let ws = 0;
    for (let q = -r; q <= r; q++) {
      const v = xs[i + q];
      if (v === undefined) continue;
      s += v * w[q + r];
      ws += w[q + r];
    }
    return s / ws;
  });
}

/** 점 P 를 A–B 직선에 대해 뒤집는다 — A · B 까지 거리(뼈 길이)는 그대로 */
function mirrorAcross(P: Vec3, A: Vec3, B: Vec3): Vec3 {
  const ab = sub(B, A);
  const L2 = dot(ab, ab);
  if (L2 < 1e-12) return P;
  const foot = add(A, scale(ab, dot(sub(P, A), ab) / L2));
  return sub(scale(foot, 2), P);
}

/**
 * 경첩 관절(팔꿈치 · 무릎)이 반대로 꺾인 장면을 되돌린다 — 2026-10-08 김민: "흔들림 · 꺾임 같은 부자연스러운 움직임".
 * - 팔꿈치: 거의 편(굽힘 35° 밑) 팔꿈치의 굽힘 축(위팔 × 아래팔)이 앞 장면과 반대면, 어깨–손목 선에 대해 뒤집어 앞 장면 쪽으로.
 *   거의 편 팔꿈치는 2D 에서 어느 쪽으로 굽었는지 잘 안 보여 장면마다 뒤집혔다(샘플 1 · 3 굽힘 축 뒤집힘 4 · 1번).
 * - 무릎: 무릎이 골반 앞쪽(엉덩이 좌우 × 위)과 반대(뒤)로 꺾였고 굽힘이 40° 밑이면, 엉덩이–발목 선에 대해 뒤집는다.
 * 뼈 길이는 그대로(직선에 대한 대칭). 바꾼 장면 수를 돌려준다(시험용).
 */
export function fixHingeFlips(X: Vec3[][], U: Vec3): number {
  let fixed = 0;
  const flexDeg = (a: Vec3, b: Vec3) =>
    (Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) * 180) /
    Math.PI;
  for (const [S, E, W] of [
    [V2J.lSh, V2J.lEl, V2J.lWr],
    [V2J.rSh, V2J.rEl, V2J.rWr],
  ] as const) {
    let prev: Vec3 | null = null;
    for (const fr of X) {
      const up = sub(fr[E], fr[S]);
      const fo = sub(fr[W], fr[E]);
      const c = cross(up, fo);
      const sin = norm(c) / Math.max(1e-12, norm(up) * norm(fo));
      if (sin < 0.05) continue;
      let axis = scale(c, 1 / norm(c));
      if (prev && dot(axis, prev) < 0 && flexDeg(up, fo) < 35) {
        fr[E] = mirrorAcross(fr[E], fr[S], fr[W]);
        axis = scale(axis, -1);
        fixed++;
      }
      if (sin >= 0.15) prev = axis;
    }
  }
  for (const [Hp, K, An] of [
    [V2J.lHip, V2J.lKn, V2J.lAn],
    [V2J.rHip, V2J.rKn, V2J.rAn],
  ] as const) {
    for (const fr of X) {
      const fwd = cross(sub(fr[V2J.lHip], fr[V2J.rHip]), U);
      if (norm(fwd) < 1e-9) continue;
      const ha = sub(fr[An], fr[Hp]);
      const L2 = dot(ha, ha);
      if (L2 < 1e-12) continue;
      const foot = add(fr[Hp], scale(ha, dot(sub(fr[K], fr[Hp]), ha) / L2));
      const off = sub(fr[K], foot);
      if (norm(off) < 1e-9) continue;
      const back = dot(normalize(off), normalize(fwd)) < -0.3;
      if (back && flexDeg(sub(fr[K], fr[Hp]), sub(fr[An], fr[K])) < 40) {
        fr[K] = mirrorAcross(fr[K], fr[Hp], fr[An]);
        fixed++;
      }
    }
  }
  return fixed;
}

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
const ARM_JOINTS = new Set<number>([
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
]);
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
/** 무릎 아래 좌우 짝 */
const LEG_PAIRS: [number, number][] = [
  [V2J.lKn, V2J.rKn],
  [V2J.lAn, V2J.rAn],
  [V2J.lHe, V2J.rHe],
  [V2J.lTo, V2J.rTo],
];
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

/**
 * 맞추기 — 결과(Pitch3dV2Result). 시험용으로 중간값도 돌려준다(debug).
 * 영상으로 본 던지는 손이 촬영 정보와 반대면(v1 이 '좌우 이름이 거울로 붙었다'고 보고 팔 · 다리 이름을 통째로 바꿈) 이름을 바꾸지 않고
 * 던지는 손을 바꿔 한 번 더 맞춘다 — 2026-10-09 좌투 샘플이 촬영 정보 '오른손'으로 올라와 이름이 뒤집혀 몸이 뒤를 보고 발목이 골반
 * 높이에 갔다. 관절 모델(RTMW)은 해부학 좌우로 이름을 붙여 두 영상이 함께 거울이 되는 일은 드물고, 틀리기 쉬운 건 촬영 정보다.
 */
export function fitPitch3dV2(input: V2Input): {
  result: Pitch3dV2Result;
  debug?: FitDebug;
} {
  const first = fitOnce(input);
  if (!first.result.ok || !first.result.quality.flips.handSwapped) return first;
  const other = fitOnce({ ...input, hand: input.hand === 'L' ? 'R' : 'L' });
  return other.result.ok && !other.result.quality.flips.handSwapped ? other : first;
}

function fitOnce(raw: V2Input): {
  result: Pitch3dV2Result;
  debug?: FitDebug;
} {
  /* 2D 모델 버릇 걷기(clean2d.ts) — 한 영상 안에서 겹쳐 찍힌 다리 */
  const cleanSide = dropLegOverlaps(raw.side);
  const cleanBack = dropLegOverlaps(raw.back);
  const input: V2Input = { ...raw, side: cleanSide.track, back: cleanBack.track };
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
      else if (both) {
        const T = triangulate(cal.side, a, cal.back, b);
        X = T && agrees(cal, T, a, b, core.side.person, core.back.person) ? T : null;
      }
      row.push(X);
      w.push(
        X ? (both ? Math.min(a.v, b.v) : Math.max(a.v, b.v) >= SURE ? 0.3 : 0.15) : 0
      );
    }
    obs3.push(row);
    weight.push(w);
  }

  /*
   * 다리 좌우 확인 — 니업 때 들리는 다리는 앞발(글러브 쪽)이다. 던지는 손 쪽 발목이 훨씬 높이 들렸으면 관절 모델이 무릎 아래 이름만 바꿔
   * 붙인 것이다(2026-10-09 좌투 샘플: 던지는 손 쪽 발을 축발로 묶었는데 그 발이 니업에 들려 있어, 풀릴 때 한 장면에 57cm 튀고 골반이
   * 77° 꺾였다). 골반은 어깨와 같은 쪽이 맞으니 무릎 · 발목 · 뒤꿈치 · 발끝만 바꾸고, 바꾼 쪽의 넙다리 길이 좌우 차이가 더 나쁘면 두지 않는다.
   */
  const legsSwapped = (() => {
    const Uv = core.axes.U;
    const rise = (an: number) => {
      const hs: number[] = [];
      for (let k = 0; k <= core.evIdx.footPlant && k < n; k++) {
        const P = obs3[k][an];
        if (P && weight[k][an] > 0) hs.push(dot(P, Uv));
      }
      return hs.length < 5 ? 0 : Math.max(...hs) - percentile(hs, 0.1);
    };
    const [thr, glv] = core.hand === 'L' ? [V2J.lAn, V2J.rAn] : [V2J.rAn, V2J.lAn];
    const rt = rise(thr);
    if (!(rt > 0.15 * H && rt > rise(glv) + 0.1 * H)) return false;
    const asym = (swap: boolean) => {
      const ds: number[] = [];
      for (let k = 0; k < n; k++) {
        const [lh, rh, lk, rk] = [V2J.lHip, V2J.rHip, V2J.lKn, V2J.rKn].map(
          (j) => obs3[k][j]
        );
        if (!lh || !rh || !lk || !rk) continue;
        const [a, b] = swap ? [rk, lk] : [lk, rk];
        ds.push(Math.abs(norm(sub(a, lh)) - norm(sub(b, rh))));
      }
      return ds.length ? median(ds) : Infinity;
    };
    return asym(true) <= asym(false) * 1.2;
  })();
  if (legsSwapped)
    for (let k = 0; k < n; k++)
      for (const [a, b] of LEG_PAIRS)
        for (const arr of [obs3[k], weight[k], sideObs[k], backObs[k]] as unknown[][])
          [arr[a], arr[b]] = [arr[b], arr[a]];

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

  /*
   * ── 한쪽 영상만 또렷한 관절: 교차하지 않고 그 영상의 시선 위, 부모에서 뼈 길이만큼(자리는 아래 채우기에서 — 시선 위 두 뿌리 중 틀 · 앞 장면에
   * 가까운 쪽) ──
   * 팔(팔꿈치 · 손목 · 손)은 다른 영상 확신이 ARM_TRI_MIN 밑이면 교차한 점도 버린다. 착지 ~ 릴리스 글러브 팔은 뒤 영상에서 몸통에 가려,
   * 2D 모델이 확신 0.35~0.45 로 지어낸 점이 한 장면에 몸 높이의 30~50% 튀었고(실제 샘플 8개 중 7개 — 그 구간 장면의 30~75%가 이 점으로
   * 교차), 팔 깊이가 그 점을 따라 출렁였다(아래팔이 한 장면에 최대 57°). 둘 다 흐리면(릴리스 번짐) 예전처럼 교차 — 그 점은 대개 맞는
   * 자리라, 버리면 빈 구간이 길어져 릴리스 손목이 키의 38%까지 틀렸다(합성).
   * 나머지 8 관절(귀 · 손 MCP)은 예전처럼 다른 영상이 SEEN 밑일 때만(v1 R4 와 같은 규칙).
   */
  const rayOf: ({ o: Vec3; d: Vec3 } | null)[][] = Array.from({ length: n }, () =>
    new Array<{ o: Vec3; d: Vec3 } | null>(N_V2_JOINTS).fill(null)
  );
  /* 버린 교차점 — 틀이 없을 때 시선 위 두 뿌리 중 고르는 데만 쓴다 */
  const triRef: (Vec3 | null)[][] = Array.from({ length: n }, () =>
    new Array<Vec3 | null>(N_V2_JOINTS).fill(null)
  );
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < N_V2_JOINTS; j++) {
      if (PARENT_OF[j] == null || !boneLenByChild.has(j)) continue;
      const a = sideObs[k][j];
      const b = backObs[k][j];
      const arm = ARM_JOINTS.has(j);
      const weak = arm ? ARM_TRI_MIN : SEEN;
      if (!arm && obs3[k][j]) continue;
      if (arm && obs3[k][j] && Math.min(a.v, b.v) >= weak) continue;
      /* 두 영상이 서로 안 맞아 v1 이 버린 팔 관절(교차점 없음)은 더 또렷한 쪽 시선 위(v1 R4 의 '버린 관찰'과 같은 규칙) */
      const dropped = arm && !obs3[k][j] && a.v >= weak && b.v >= weak;
      const sideOnly = a.v >= SURE && (b.v < weak || (dropped && a.v >= b.v));
      const backOnly = b.v >= SURE && (a.v < weak || (dropped && b.v > a.v));
      if (!sideOnly && !backOnly) {
        /*
         * 부모를 시선 위로 옮겼는데 이 관절은 두 영상 다 흐리면(지어낸 점끼리 교차) 버리고 틀 · 회전 잇기로 — 남겨 두면 다른 근거로 놓인 부모와
         * 어긋나 아래팔이 한 장면에 20° 넘게 튀었다(실제 샘플 2 릴리스 뒤: 팔꿈치는 뒤 영상 1.0, 손목은 0.33/0.47)
         */
        if (arm && obs3[k][j] && rayOf[k][PARENT_OF[j]] && Math.max(a.v, b.v) < weak) {
          triRef[k][j] = obs3[k][j];
          obs3[k][j] = null;
          weight[k][j] = 0;
        }
        continue;
      }
      /* 흐린 쪽과 교차한 점이 부모에서 뼈 길이(±ARM_LEN_TOL)에 있으면 그 점은 맞는 것 — 그대로 둔다(지어낸 점은 깊이가 틀려 길이가 어긋난다) */
      const Pp = obs3[k][PARENT_OF[j]];
      const C = obs3[k][j];
      if (arm && C && Pp) {
        const Lj = boneLenByChild.get(j)!;
        if (Math.abs(norm(sub(C, Pp)) - Lj) <= ARM_LEN_TOL * Lj) continue;
      }
      rayOf[k][j] = sideOnly ? ray(cal.side, a.x, a.y) : ray(cal.back, b.x, b.y);
      triRef[k][j] = obs3[k][j];
      obs3[k][j] = null;
      weight[k][j] = 0;
    }
  }

  /*
   * ── 다리 겹침(한 영상) ── 다른 다리에 가려진 무릎 · 발목 · 발을 2D 모델은 보이는 다리 위에 겹쳐 찍는다(확신 0.7 쯤). 한 영상에서 두 다리 점이
   * 사람 크기의 LEG_OVERLAP 안이고 다른 영상에선 떨어져 있으면, 이름마다 두 영상을 교차해 다시 비춘 어긋남이 큰 쪽이 가려진 다리다 — 그 영상의
   * 점을 버리고 다른 영상의 시선 위에 둔다(다른 영상도 흐리면 빈 관절). 한 영상 안에서 앞뒤 장면으로 가르면 섞인 점의 31%만 잡고 멀쩡한 점을
   * 그만큼 버렸다(드라이브라인 30구 시험). 그대로 두면 가려진 다리가 보이는 다리 쪽으로 끌려 다리가 장면마다 30cm 넘게 튀었다.
   */
  let legOverlaps = 0;
  {
    const ps = core.side.person;
    const pb = core.back.person;
    for (let k = 0; k < n; k++) {
      for (const [a, b] of LEG_PAIRS) {
        for (const view of ['side', 'back'] as const) {
          const A = view === 'side' ? sideObs[k] : backObs[k];
          const B = view === 'side' ? backObs[k] : sideObs[k];
          const [pA, pB] = view === 'side' ? [ps, pb] : [pb, ps];
          if (A[a].v < SEEN || A[b].v < SEEN || d2(A[a], A[b]) >= LEG_OVERLAP * pA) continue;
          if (B[a].v < SEEN || B[b].v < SEEN || d2(B[a], B[b]) < LEG_OVERLAP * pB) continue;
          const camA = view === 'side' ? cal.side : cal.back;
          const camB = view === 'side' ? cal.back : cal.side;
          const err = (j: number) => {
            const X = triangulate(camA, A[j], camB, B[j]);
            const qa = X && project(camA, X);
            const qb = X && project(camB, X);
            return qa && qb
              ? Math.hypot(qa[0] - A[j].x, qa[1] - A[j].y) / pA + Math.hypot(qb[0] - B[j].x, qb[1] - B[j].y) / pB
              : Infinity;
          };
          const ea = err(a);
          const eb = err(b);
          const hid = ea > eb ? a : b;
          if (Math.max(ea, eb) < 1.5 * Math.min(ea, eb) + 0.01) continue;
          A[hid] = { ...A[hid], v: 0 };
          triRef[k][hid] = null;
          obs3[k][hid] = null;
          weight[k][hid] = 0;
          rayOf[k][hid] =
            B[hid].v >= SURE && boneLenByChild.has(hid) ? ray(camB, B[hid].x, B[hid].y) : null;
          legOverlaps++;
        }
      }
    }
  }

  /*
   * ── 통계 움직임 틀: 두 영상 다 안 보인 관절(부모가 있는 것) ── 실제 투구 모션캡처의 구간별 평균 자세 + 사람마다 다른 방향으로, 그
   * 장면에 잘 보인 관절(두 영상 확신 0.5↑)에 맞춰 짐작한다. 방향만 쓰고 길이는 뼈 길이(아래 채우기). 틀이 없으면 예전 채우기 그대로.
   */
  const tpl = input.motionTemplate;
  const tplPos: (Vec3 | null)[][] = Array.from({ length: n }, () => new Array<Vec3 | null>(N_V2_JOINTS).fill(null));
  const tplW: number[][] = Array.from({ length: n }, () => new Array<number>(N_V2_JOINTS).fill(0));
  if (tpl && tpl.n >= TPL_MIN_PITCHES) {
    const ev = { kneeUp: core.evIdx.kneeUp ?? null, footPlant: core.evIdx.footPlant, release: core.evIdx.release };
    for (let k = 0; k < n; k++) {
      if (!obs3[k].some((v, j) => !v && PARENT_OF[j] != null)) continue;
      const res = templateFill(
        tpl,
        obs3[k],
        weight[k].map((w) => w >= 0.5),
        core.axes,
        H,
        core.hand,
        phaseOf(k, ev)
      );
      if (!res) continue;
      for (let j = 0; j < N_V2_JOINTS; j++)
        if (res.pos[j] && PARENT_OF[j] != null) {
          tplPos[k][j] = res.pos[j];
          tplW[k][j] = TPL_PULL * Math.min(1, Math.max(0.2, (TPL_SD_REF * H) / Math.max(1e-9, res.sd[j])));
        }
    }
    /*
     * 짧은 빈 틈(TPL_MIN_GAP 장면 밑)은 틀 대신 앞뒤 보인 장면을 회전으로 잇는다 — 한두 장면만 비는 곳에 틀을 쓰면 앞뒤 관찰과 다른 자리로
     * 가 팔이 장면마다 오갔다(실제 샘플 1: 옆 영상과 어긋남 2.4 → 6.0%). 시선 위에 놓을 관절은 틀을 뿌리 고르기에만 쓰니 그대로 둔다.
     */
    for (let j = 0; j < N_V2_JOINTS; j++) {
      let k = 0;
      while (k < n) {
        if (obs3[k][j] || rayOf[k][j]) {
          k++;
          continue;
        }
        let e = k;
        while (e + 1 < n && !obs3[e + 1][j] && !rayOf[e + 1][j]) e++;
        if (e - k + 1 < TPL_MIN_GAP && k > 0 && e < n - 1) for (let q = k; q <= e; q++) tplPos[q][j] = null;
        k = e + 1;
      }
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
      /* 영상 첫 장면들이 비었으면 처음 보인 방향으로 — 기본 방향으로 채웠다가 처음 보일 때 키의 절반까지 튀었다(2026-10-08 샘플 1 첫 장면 503mm) */
      if (last < 0) for (let q = 0; q < k; q++) gapDir[q][j] = dirAt(k);
      if (last >= 0 && k - last > 1 && k - last - 1 <= GAP_MAX) {
        const a = dirAt(last)!;
        const b = dirAt(k)!;
        for (let q = last + 1; q < k; q++)
          gapDir[q][j] = slerp(a, b, (q - last) / (k - last));
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
    const tplPulled = new Set<number>();
    const prev = X[k - 1];
    /*
     * 짝에서 이 점 쪽 방향 — 앞 장면의 같은 선(엉덩이선 · 어깨선)을 그사이 다른 선이 위 축 둘레로 돈 만큼 돌린 것. 예전엔 늘 어깨선
     * 방향이라, 골반과 어깨가 30~60° 비틀린 착지 ~ 릴리스에 엉덩이 하나가 안 보이면 채운 엉덩이가 키의 7% 엉뚱한 자리로 가 골반이 한 장면에
     * 12cm 튀었다(2026-10-09 좌투 샘플 — 엉덩이는 두 샘플 모두 착지 뒤 자주 가려진다).
     */
    const carriedLine = (j: number, pair: number, isSh: boolean): Vec3 | null => {
      if (!prev) return null;
      const v = sub(prev[j], prev[pair]);
      if (norm(v) < 1e-6) return null;
      const [oa, ob] = isSh ? [V2J.lHip, V2J.rHip] : [V2J.lSh, V2J.rSh];
      const a0 = reject(sub(prev[oa], prev[ob]), U);
      const A = fr[oa];
      const B = fr[ob];
      const a1 = A && B ? reject(sub(A, B), U) : null;
      if (!a1 || norm(a0) < 1e-6 || norm(a1) < 1e-6) return normalize(v);
      const th = Math.atan2(dot(cross(a0, a1), U), dot(a0, a1));
      return normalize(mulV(rodrigues(scale(U, th)), v));
    };
    /* 뿌리(골반 · 어깨 · 코) — 없으면 짝 · 앞 장면 · 다른 뿌리에서 */
    const rootFill = (j: number, pair: number, up: number) => {
      if (fr[j]) return;
      filled++;
      w[j] = 0;
      const mate = fr[pair];
      const isSh = j === V2J.lSh || j === V2J.rSh;
      const sgn = j === V2J.lSh || j === V2J.lHip ? 1 : -1;
      const width = lengthOf.get(isSh ? 'shoulders' : 'hips')!;
      if (mate)
        fr[j] = add(mate, scale(carriedLine(j, pair, isSh) ?? scale(lateralAt(fr), sgn), width));
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
      const T = tplPos[k][j];
      const r = rayOf[k][j];
      if (r) {
        /* 한 영상 시선 위 — 두 뿌리 중 틀 짐작(없으면 버린 교차점 · 앞 장면 방향)에 가까운 쪽. 시선이 구에 안 닿으면 가장 가까운 자리 */
        filled--;
        const prevRef =
          prev && norm(sub(prev[j], prev[p])) > 1e-6
            ? add(P, scale(normalize(sub(prev[j], prev[p])), Lj))
            : null;
        const ref = T ?? prevRef ?? triRef[k][j] ?? P;
        const roots = rootsOnRay(r, P, Lj);
        if (roots.length === 0) fr[j] = pointOnRayAtDistance(r, P, Lj, ref);
        else if (roots.length === 1) fr[j] = roots[0];
        else {
          /* 두 뿌리가 가까우면(시선이 구를 스침) 고르기가 불확실해 가운데로 — 간격이 뼈 길이의 15% 밑이면 가운데, 50% 넘으면 그 뿌리(v1 R4 와 같음) */
          const near = norm(sub(roots[0], ref)) <= norm(sub(roots[1], ref)) ? roots[0] : roots[1];
          const mid = scale(add(roots[0], roots[1]), 0.5);
          const g = Math.max(0, Math.min(1, (norm(sub(roots[0], roots[1])) / Lj - 0.15) / 0.35));
          fr[j] = add(mid, scale(sub(near, mid), g));
        }
        w[j] = ONE_VIEW_W;
        continue;
      }
      if (T && norm(sub(T, P)) > 1e-9) {
        fr[j] = add(P, scale(normalize(sub(T, P)), Lj));
        tplPulled.add(j);
        continue;
      }
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
    pullW.push(w.map((v, j) => (gapFilled.has(j) ? GAP_PULL : tplPulled.has(j) ? tplW[k][j] : v)));
  }
  const target: Vec3[][] = X.map((fr) => fr.map((v) => [...v] as Vec3));

  /*
   * 몸통 · 머리 점(엉덩이 · 어깨 · 코 · 귀) 시간 다듬기 — 한두 장면 튄 값은 앞뒤 가운데값으로(햄펠), 그다음 가우스로. 폭은 착지 → 릴리스
   * 장면 수에 맞춰 실제 약 10ms(그 구간이 실제로 약 0.17초라서 — 슬로모 배수를 몰라도 된다). 2026-10-09 실제 샘플 둘에서 착지 장면에
   * 골반선이 한 장면에 35~38° 돌았고(관절 모델의 엉덩이 점이 튐) 회전 중 몸통 · 머리가 흔들렸다(김민: "회전이 시작되면 점프하듯 · 흔들림").
   */
  {
    const span = Math.max(1, core.evIdx.release - core.evIdx.footPlant);
    const sigma = Math.max(1, TRUNK_SIGMA * span);
    for (const j of TRUNK_JOINTS)
      for (let d = 0; d < 3; d++) {
        const ys = gaussSmooth(
          hampel(
            target.map((fr) => fr[j][d]),
            3,
            3
          ),
          sigma
        );
        target.forEach((fr, k) => (fr[j][d] = ys[k]));
      }
  }

  /*
   * 발이 땅에 닿은 구간 — 이름(축발 · 앞발)이 아니라 자료로 찾는다. 발목(5장면 가운데값으로 다듬음)이 그 발의 낮은 높이 띠(CONTACT_BAND) 안에서
   * 구간 가운데값의 CONTACT_STAY 안에 머문 구간(착지 → 릴리스 장면 수의 CONTACT_MIN 이상)이다. 그 구간에 발(발목 · 뒤꿈치 · 발끝)을
   * 가운데값에 못 박고(pinned — 뼈 길이 맞추기 · 시간 다듬기가 움직이지 않음) 뒤꿈치 · 발끝을 같은 높이로 편다(앞꿈치로만 서지 않게).
   * 앞뒤 CONTACT_EASE 장면은 그 자리로 섞어 당긴다(한 장면에 붙거나 떨어지지 않게).
   * 2026-10-09 김민 4/10: 예전엔 축발을 처음 ~ 니업까지 움직여도 묶어 들린 발이 니업 뒤 한 장면에 57cm 튀었고(좌투 샘플), 앞발은 착지
   * 장면에 나중 자리로 한 번에 붙어 13 · 9.5cm 튀었고(땅에 박힘), 축발은 흔들리는 점이 문턱(키의 3%)을 넘는 순간 풀려 계속 움직였다.
   * 축발을 착지까지 내내 묶지 않는 까닭은 그대로다(보폭 끝 끌림 — 합성 정답 축발은 착지 0.15초 전부터 14cm 끌린다).
   */
  const pinned: boolean[][] = Array.from({ length: n }, () =>
    new Array<boolean>(N_V2_JOINTS).fill(false)
  );
  const contacts: { side: 'L' | 'R'; from: number; to: number }[] = [];
  {
    const span = Math.max(1, core.evIdx.release - core.evIdx.footPlant);
    const minRun = Math.max(4, Math.round(CONTACT_MIN * span));
    const stay = CONTACT_STAY * H;
    const med = (vs: Vec3[]): Vec3 =>
      [0, 1, 2].map((d) => median(vs.map((v) => v[d]))) as Vec3;
    const seenMedian = (j: number, from: number, to: number): Vec3 => {
      const seen: Vec3[] = [];
      for (let k = from; k <= to; k++) if (dataW[k][j] > 0) seen.push(target[k][j]);
      return med(
        seen.length >= 3 ? seen : target.slice(from, to + 1).map((fr) => fr[j])
      );
    };
    /* 뒤꿈치 · 발끝을 발목 둘레로 돌려 같은 높이로(길이 그대로) — 많이 기운 발(발끝으로 섬)은 그대로 */
    const level = (A: Vec3, He: Vec3, To: Vec3): [Vec3, Vec3] => {
      const f = sub(To, He);
      const hor = sub(f, scale(U, dot(f, U)));
      const th = Math.acos(
        Math.max(-1, Math.min(1, dot(normalize(f), normalize(hor))))
      );
      const ax = cross(f, hor);
      if (norm(hor) < 1e-9 || norm(ax) < 1e-12 || (th * 180) / Math.PI > LEVEL_MAX_DEG)
        return [He, To];
      const k = normalize(ax);
      const rot = (P: Vec3): Vec3 => {
        const v = sub(P, A);
        return add(
          A,
          add(
            add(scale(v, Math.cos(th)), scale(cross(k, v), Math.sin(th))),
            scale(k, dot(k, v) * (1 - Math.cos(th)))
          )
        );
      };
      return [rot(He), rot(To)];
    };
    for (const side of ['L', 'R'] as const) {
      const foot =
        side === 'L' ? [V2J.lAn, V2J.lHe, V2J.lTo] : [V2J.rAn, V2J.rHe, V2J.rTo];
      const s = target.map((_, k) =>
        med(target.slice(Math.max(0, k - 2), k + 3).map((fr) => fr[foot[0]]))
      );
      const h = s.map((p) => dot(p, U));
      const top = percentile(h, 0.1) + CONTACT_BAND * H;
      /* 구간 찾기 — 점의 CONTACT_OUT 까지는 튀어도 된다(가려짐 · 뒤바뀜). 끝은 가운데값에서 먼 장면을 깎는다(내려오는 중인 장면을 묶지 않게) */
      const runs: { from: number; to: number; m: Vec3 }[] = [];
      for (let k = 0; k < n;) {
        let e = k - 1;
        while (e + 1 < n && h[e + 1] <= top) {
          const run = s.slice(k, e + 2);
          const m = med(run);
          if (
            run.filter((p) => norm(sub(p, m)) > stay).length >
            CONTACT_OUT * run.length
          )
            break;
          e++;
        }
        if (e - k + 1 < minRun) {
          k++;
          continue;
        }
        const m = med(s.slice(k, e + 1));
        let a = k;
        let b = e;
        while (a < b && norm(sub(s[a], m)) > stay) a++;
        while (b > a && norm(sub(s[b], m)) > stay) b--;
        /*
         * 천천히 움직이는 발은 닿은 것이 아니다 — 앞 · 뒤 3분의 1 가운데값 사이가 실제 시간으로 CONTACT_SPEED 보다 빨리 움직였으면 뺀다
         * (합성: 내딛는 발이 착지 전 0.1초 동안 키의 5% 안에서 내려오다 공중에 묶였다). 실제 시간은 착지 → 릴리스를 PLANT_TO_RELEASE_S 로 본다.
         */
        const len = b - a + 1;
        const third = Math.max(1, Math.floor(len / 3));
        const drift = norm(
          sub(med(s.slice(a, a + third)), med(s.slice(b - third + 1, b + 1)))
        );
        const allowed = ((CONTACT_SPEED * len * PLANT_TO_RELEASE_S) / span + 0.005) * H;
        if (len >= minRun && drift <= allowed) runs.push({ from: a, to: b, m });
        k = e + 1;
      }
      /*
       * 앞발(글러브 쪽)은 착지 순간을 믿는다 — 착지 → 릴리스는 실제 0.15초라 장면이 적고 착지 충격 · 흐림으로 점이 흔들려 자료만으로는
       * 이 구간이 끊겼다(합성: 착지 뒤 앞발 점이 5cm 움직여 릴리스 뒤에야 묶임). 착지 ~ 릴리스 뒤(그 절반 더)를 묶되 그 발이 낮을 때만,
       * 니업 ~ 착지 사이(내딛는 중)에 찾은 구간은 버린다.
       */
      const leadSide = (core.hand === 'L' ? 'R' : 'L') === side;
      if (leadSide) {
        const fp = core.evIdx.footPlant;
        const rel = core.evIdx.release;
        const from0 = core.evIdx.kneeUp ?? Math.floor(fp / 2);
        for (let i = runs.length - 1; i >= 0; i--)
          if (runs[i].to >= from0 && runs[i].from < fp) runs.splice(i, 1);
        const to = Math.min(n - 1, rel + Math.round(span / 2));
        if (to - fp + 1 >= 3 && median(h.slice(fp, rel + 1)) <= top) {
          /*
           * 착지 순간이 일러 발이 아직 내려오는 중이면(묶을 자리에서 CONTACT_STAY 밖) 그 장면은 묶지 않는다 — 예전엔 착지 장면에 발을 나중 자리로
           * 못 박아 다리 길이만큼 골반이 끌려 한 장면에 12cm 튀고, 끌린 골반이 영상과 멀어 14장면 동안 '안 보임'이 됐다(2026-10-09 좌투 샘플:
           * 앞발 발목이 착지 뒤 20장면 동안 키의 8% 더 내려갔다). 합성처럼 착지 뒤 5cm 안에서 흔들리는 발은 그대로 착지부터 묶인다.
           */
          const m0 = med(s.slice(fp, rel + 1));
          let a = fp;
          while (a < to - 2 && norm(sub(s[a], m0)) > stay) a++;
          runs.push({ from: a, to, m: med(s.slice(a, Math.max(a, rel) + 1)) });
          runs.sort((x, y) => x.from - y.from);
          /* 겹치는 구간은 착지 구간에 녹인다 */
          for (let i = runs.length - 1; i > 0; i--)
            if (runs[i].from <= runs[i - 1].to) {
              runs[i - 1].to = Math.max(runs[i - 1].to, runs[i].to);
              runs.splice(i, 1);
            }
        }
      }
      /* 같은 자리에 다시 선 구간(사이가 짧음)은 하나로 — 튄 몇 장면 때문에 쪼개진 것 */
      const merged: { from: number; to: number }[] = [];
      for (const r of runs) {
        const last = merged[merged.length - 1];
        const lastM = last ? med(s.slice(last.from, last.to + 1)) : null;
        if (
          last &&
          lastM &&
          r.from - last.to - 1 <= span &&
          norm(sub(r.m, lastM)) <= 2 * stay
        )
          last.to = r.to;
        else merged.push({ from: r.from, to: r.to });
      }
      for (const { from: k, to: e } of merged) {
        contacts.push({ side, from: k, to: e });
        const [An, He0, To0] = foot.map((j) => seenMedian(j, k, e));
        const [He, To] = level(An, He0, To0);
        const ref = [An, He, To];
        for (let q = k - CONTACT_EASE; q <= e + CONTACT_EASE; q++) {
          if (q < 0 || q >= n) continue;
          const inside = q >= k && q <= e;
          const w = inside ? 1 : 1 - (q < k ? k - q : q - e) / (CONTACT_EASE + 1);
          foot.forEach((j, i) => {
            const P = add(scale(target[q][j], 1 - w), scale(ref[i], w));
            target[q][j] = P;
            if (inside) {
              X[q][j] = [...P] as Vec3;
              pinned[q][j] = true;
            } else pullW[q][j] = Math.max(pullW[q][j], 0.9);
          });
        }
      }
    }
    contacts.sort((a, b) => a.from - b.from);
  }

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
      const ia = pinned[k][b.a] ? 0 : 1 / (w[b.a] + 0.05);
      const ib = pinned[k][b.b] ? 0 : 1 / (w[b.b] + 0.05);
      if (ia + ib === 0) return;
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
        if (pinned[k][j]) continue;
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
  fixHingeFlips(X, U);

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
  const frameConf = conf.map((row) =>
    Math.min(mean(CORE17.map((j) => row[j])), mean(armJ.map((j) => row[j])))
  );
  /*
   * 영상 절반 넘게 문턱 밑이면 문턱을 그 영상 가운데값의 0.7 배로 — 화면 녹화한 실제 영상은 장면 확신이 늘 30~55 라 60 하나로 재면 영상
   * 전체가 엷은 구간이 되어 '잘 안 보였어요' 가 내내 떴다(2026-10-10 두 샘플). 그때는 그 영상에서 유난히 흐린 구간만 드러낸다.
   */
  const med = median(frameConf);
  const lowAt = med < LOW_CONF ? Math.min(LOW_CONF, 0.7 * med) : LOW_CONF;
  const lowConf: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    if (frameConf[k] >= lowAt) continue;
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
    fit: {
      boneCvPct,
      reprojPct,
      filled,
      accelP95,
      boneLen,
      legsSwapped,
      legOverlaps: legOverlaps + cleanSide.dropped + cleanBack.dropped,
      contacts: contacts.flatMap((c) => {
        const from = keep.findIndex((k) => k >= c.from);
        const to = keep.findLastIndex((k) => k <= c.to);
        return from >= 0 && to >= from ? [{ side: c.side, from, to }] : [];
      }),
    },
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
