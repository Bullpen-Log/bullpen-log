import {
  add,
  cross,
  dot,
  fromCols,
  mul3,
  mulV,
  norm,
  normalize,
  scale,
  sub,
  transpose,
  type Mat3,
  type Vec3,
} from '@/lib/pitch-3d/linalg';
import { V2J } from '@/lib/pitch-3d/v2/contract';

/**
 * 뼈대 15조각의 자세(설계 pitch-3d-quality.md 0절 '움직이는 법') — 맞춘 관절(한 장면, 키 = 1)에서 부위마다 축(가까운 관절 → 먼 관절)과
 * 기준 방향(팔꿈치 · 무릎의 굽힘 축, 몸통 · 머리의 좌우 축, 손바닥)으로 방향을 잡고, 부모 부위에서 자식 부위를 이어 붙인다.
 * 뼈 길이는 모델 그대로(키에 맞춰 한 배율) — 관절 자리가 조금 달라도 뼈가 끊기거나 늘어나지 않는다. 두 발 중 낮은 점을 바닥에.
 *
 * 순수 함수 — three.js 를 모른다(보기 화면 body-3d.tsx 가 Matrix4 로 바꾼다). 시험: scripts/pitch-3d-v2-selftest.mts.
 * 모델 표(public/models/skeleton-parts.json)는 scripts/pitch-lab/skeleton-parts.mjs 가 만든다.
 */

export const PART_NAMES = [
  'pelvis',
  'trunk',
  'head',
  'upperArmL',
  'upperArmR',
  'forearmL',
  'forearmR',
  'handL',
  'handR',
  'thighL',
  'thighR',
  'shankL',
  'shankR',
  'footL',
  'footR',
] as const;
export type PartName = (typeof PART_NAMES)[number];

export type PartAnchor = {
  /** 부모에 붙는 자리(모델 좌표) */
  proximal: Vec3;
  /** 축의 끝(먼 관절) */
  distal: Vec3;
  /** 모델에서의 기준 방향(축에 수직인 성분만 쓴다) — 굽힘 축 · 좌우 축 · 손바닥 방향 */
  ref: Vec3;
  [extra: string]: Vec3;
};

export type SkeletonParts = {
  version: number;
  mesh: string;
  /** 모델 키(미터) */
  height: number;
  parts: readonly PartName[];
  anchors: Record<PartName, PartAnchor>;
  vertexCount: number;
  /** 정점마다 부위 번호(parts 차례) — base64 Uint8Array */
  vertexPart: string;
};

export type PartPose = {
  /** 모델의 proximal 점이 놓이는 세상 자리(키 = 1 좌표계) */
  position: Vec3;
  /** 모델 방향 → 세상 방향 */
  R: Mat3;
  /** 모델 → 세상 배율(모델 키 → 1) */
  scale: number;
};

export type RigPose = Record<PartName, PartPose>;

/** 축 a 와 기준 r 로 직교 틀(열 = [a, r⊥, a×r⊥]) */
function frame(axis: Vec3, ref: Vec3): Mat3 {
  const a = normalize(axis);
  let b = sub(ref, scale(a, dot(ref, a)));
  if (norm(b) < 1e-6) {
    /* 기준이 축과 나란하면 아무 수직 */
    const pick: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    b = sub(pick, scale(a, dot(pick, a)));
  }
  b = normalize(b);
  return fromCols(a, b, cross(a, b));
}

/** 모델 틀 → 세상 틀 회전 */
const rotation = (axisM: Vec3, refM: Vec3, axisW: Vec3, refW: Vec3): Mat3 =>
  mul3(frame(axisW, refW), transpose(frame(axisM, refM)));

/** 부위 자세로 모델 점을 세상으로 */
export function placePoint(p: PartPose, modelPoint: Vec3, proximal: Vec3): Vec3 {
  return add(p.position, scale(mulV(p.R, sub(modelPoint, proximal)), p.scale));
}

const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

/** 굽힘 축 = 두 마디의 외적 — 거의 펴졌으면(sin < 0.15) null */
function bendAxis(a: Vec3, b: Vec3): Vec3 | null {
  const c = cross(normalize(a), normalize(b));
  return norm(c) < 0.15 ? null : normalize(c);
}

/**
 * 한 장면의 관절(25 × [앞, 위, 오른쏙], 키 = 1) → 부위 15개 자세.
 * prev 가 있으면 굽힘 축을 못 정하는 장면(팔 · 다리가 펴짐)에서 앞 장면의 방향을 잇는다 — 없으면 몸통 좌우 축으로.
 */
export function rigPose(
  joints: Vec3[],
  hand: 'R' | 'L',
  parts: SkeletonParts,
  prev?: RigPose | null
): RigPose {
  const A = parts.anchors;
  const s = 1 / parts.height;
  const j = (k: number) => joints[k];
  const hipMid = mid(j(V2J.lHip), j(V2J.rHip));
  const shMid = mid(j(V2J.lSh), j(V2J.rSh));
  const trunkAxis = sub(shMid, hipMid);
  const left = sub(j(V2J.lSh), j(V2J.rSh));
  const out = {} as RigPose;

  /* 앞 장면의 기준 방향(모델 ref 를 그때 회전으로) — 굽힘이 안 보일 때 */
  const prevRef = (name: PartName): Vec3 | null =>
    prev ? mulV(prev[name].R, A[name].ref) : null;
  const refOr = (name: PartName, r: Vec3 | null): Vec3 => r ?? prevRef(name) ?? left;

  const put = (name: PartName, position: Vec3, axisW: Vec3, refW: Vec3) => {
    out[name] = {
      position,
      R: rotation(sub(A[name].distal, A[name].proximal), A[name].ref, axisW, refW),
      scale: s,
    };
  };
  const attach = (parent: PartName, modelPoint: Vec3) =>
    placePoint(out[parent], modelPoint, A[parent].proximal);

  /* 골반 — 모델 두 고관절의 가운데가 맞춘 골반 가운데에, 위 = 몸통 축, 좌우 = 두 고관절 */
  const hipMidM = mid(A.pelvis.hipL, A.pelvis.hipR);
  const Rp = rotation(
    sub(A.pelvis.distal, A.pelvis.proximal),
    A.pelvis.ref,
    trunkAxis,
    sub(j(V2J.lHip), j(V2J.rHip))
  );
  out.pelvis = {
    position: sub(hipMid, scale(mulV(Rp, sub(hipMidM, A.pelvis.proximal)), s)),
    R: Rp,
    scale: s,
  };

  /* 몸통 · 머리 */
  put('trunk', attach('pelvis', A.pelvis.distal), trunkAxis, left);
  const c7 = attach('trunk', A.trunk.distal);
  const earMid = mid(j(V2J.lEar), j(V2J.rEar));
  put('head', c7, sub(earMid, c7), sub(j(V2J.lEar), j(V2J.rEar)));

  /* 팔 — 굽힘 축 = 위팔 × 아래팔(펴졌으면 앞 장면 · 몸통 좌우), 아래팔 · 손은 같은 축(엎침은 못 본다), 손바닥은 둘째 → 다섯째 MCP */
  for (const side of ['L', 'R'] as const) {
    const sh = j(side === 'L' ? V2J.lSh : V2J.rSh);
    const el = j(side === 'L' ? V2J.lEl : V2J.rEl);
    const wr = j(side === 'L' ? V2J.lWr : V2J.rWr);
    const upper = sub(el, sh);
    const fore = sub(wr, el);
    const bend = refOr(`upperArm${side}`, bendAxis(upper, fore));
    put(
      `upperArm${side}`,
      attach('trunk', side === 'L' ? A.trunk.shoulderL : A.trunk.shoulderR),
      upper,
      bend
    );
    put(
      `forearm${side}`,
      attach(`upperArm${side}`, A[`upperArm${side}`].distal),
      fore,
      bend
    );
    const idx = j(side === 'L' ? V2J.lHandIdx : V2J.rHandIdx);
    const pinky = j(side === 'L' ? V2J.lHandPinky : V2J.rHandPinky);
    const midH = j(side === 'L' ? V2J.lHandMid : V2J.rHandMid);
    const palm = sub(pinky, idx);
    put(
      `hand${side}`,
      attach(`forearm${side}`, A[`forearm${side}`].distal),
      sub(midH, wr),
      norm(palm) > 1e-6 ? palm : bend
    );
  }

  /* 다리 — 굽힘 축 = 넙다리 × 정강이, 발의 기준 = 정강이 × 발(안쪽 · 바깥쪽 기울임은 못 본다) */
  for (const side of ['L', 'R'] as const) {
    const hip = j(side === 'L' ? V2J.lHip : V2J.rHip);
    const kn = j(side === 'L' ? V2J.lKn : V2J.rKn);
    const an = j(side === 'L' ? V2J.lAn : V2J.rAn);
    const toe = j(side === 'L' ? V2J.lTo : V2J.rTo);
    const thigh = sub(kn, hip);
    const shank = sub(an, kn);
    const bend = refOr(`thigh${side}`, bendAxis(thigh, shank));
    put(
      `thigh${side}`,
      attach('pelvis', side === 'L' ? A.pelvis.hipL : A.pelvis.hipR),
      thigh,
      bend
    );
    put(`shank${side}`, attach(`thigh${side}`, A[`thigh${side}`].distal), shank, bend);
    const foot = sub(toe, an);
    const footRef = bendAxis(shank, foot) ?? refOr(`foot${side}`, null);
    put(`foot${side}`, attach(`shank${side}`, A[`shank${side}`].distal), foot, footRef);
  }

  /* 두 발 중 낮은 점(뒤꿈치 · 발끝 · 발목)을 바닥(0)에 */
  let low = Infinity;
  for (const side of ['L', 'R'] as const) {
    const f = `foot${side}` as PartName;
    for (const p of [A[f].proximal, A[f].distal, A[f].heel])
      low = Math.min(low, placePoint(out[f], p, A[f].proximal)[1]);
  }
  if (Number.isFinite(low))
    for (const name of PART_NAMES)
      out[name].position = [
        out[name].position[0],
        out[name].position[1] - low,
        out[name].position[2],
      ];
  return out;
}

/** 던지는 팔의 부위(색을 달리 칠한다) */
export const throwingArmParts = (hand: 'R' | 'L'): PartName[] =>
  hand === 'L'
    ? ['upperArmL', 'forearmL', 'handL']
    : ['upperArmR', 'forearmR', 'handR'];

/** 모양 검사(public 에서 받은 JSON — 신뢰 경계) */
export function readSkeletonParts(raw: unknown): SkeletonParts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const vec = (v: unknown): v is Vec3 =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x));
  if (
    typeof r.height !== 'number' ||
    !Array.isArray(r.parts) ||
    r.parts.length !== PART_NAMES.length
  )
    return null;
  const names = r.parts as unknown[];
  if (!PART_NAMES.every((p, i) => names[i] === p)) return null;
  if (typeof r.vertexCount !== 'number' || typeof r.vertexPart !== 'string')
    return null;
  const anchors = r.anchors as Record<string, Record<string, unknown>> | undefined;
  if (!anchors) return null;
  for (const p of PART_NAMES) {
    const a = anchors[p];
    if (!a || !vec(a.proximal) || !vec(a.distal) || !vec(a.ref)) return null;
    for (const v of Object.values(a)) if (!vec(v)) return null;
  }
  if (
    !vec(anchors.pelvis.hipL) ||
    !vec(anchors.pelvis.hipR) ||
    !vec(anchors.trunk.shoulderL) ||
    !vec(anchors.trunk.shoulderR)
  )
    return null;
  if (!vec(anchors.footL.heel) || !vec(anchors.footR.heel)) return null;
  return raw as SkeletonParts;
}
