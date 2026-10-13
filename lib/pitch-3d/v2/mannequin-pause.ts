import { add, cross, dot, norm, normalize, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { MannequinJoints } from '@/lib/pitch-3d/v2/mannequin-prep';
import { lerp, type FootPose, type MannequinFrame, type Quat } from '@/lib/pitch-3d/v2/mannequin-frames';
import { catmullRom, type TorsoModel } from '@/lib/pitch-3d/v2/mannequin-loft';
import { TORSO_KEYS } from '@/lib/pitch-3d/v2/mannequin-profiles';
import type { Arc, MEASURE_COLOR } from '@/lib/pitch-3d/v2/mannequin-measure';

/**
 * 데생 인형 — 멈춤 화면(설계 docs/designs/pitch-3d-mannequin.md §6 3단계)의 순수 계산. 예시 page.js 의 '멈췄을 때: 속 뼈' 블록 · applyAna ·
 * 옅어짐 시계 · 이름표 자리 잡기를 three 없이 옮겼다(화면 app/(app)/videos/lab/[id]/mannequin/overlay.ts · body-3d.tsx 가 쓰고 시험이 같이 돈다).
 * 좌표는 미터 · x 홈 쪽 · y 왼쪽 · z 위 · 우투 꼴(mannequin-frames 와 같다). 잰 선 · 호 · 이름표 명세는 mannequin-measure.ts.
 */

/** 뼈 색(예시 BM — 상아색 뼈 · 회청색 관절 · 골반 주황 · 가슴 파랑) · 거칠기 */
export const BONE_COLOR = { bone: 0xefe7d6, joint: 0x8e9aa8, pelvis: 0xf08a3c, chest: 0x4aa3e8 } as const;
export const BONE_ROUGHNESS: Record<keyof typeof BONE_COLOR, number> = { bone: 0.5, joint: 0.35, pelvis: 0.5, chest: 0.5 };

/** 뼈 래스 프로필(반지름 r 배) — 양 끝이 벌어지고 가운데가 잘록 */
export const BONE_PROFILE: readonly (readonly [number, number])[] = [
  [0, 1.6],
  [0.05, 1.45],
  [0.15, 0.95],
  [0.5, 0.78],
  [0.85, 0.95],
  [0.95, 1.45],
  [1, 1.6],
];

/** 관절 구슬 반지름 jr · 뼈 반지름 br(키 배율 k 전) · 선 굵기 · 척추 구슬 수 · 호의 점 상한(arcOf: n ≤ 63 → 점 64) */
export const BONE_SIZES = { jr: 0.024, br: 0.013 } as const;
export const LINE_W = 0.005;
export const BEADS = 3;
export const ARC_CAP = 64;

/**
 * 뼈 12개의 차례와 굵기(br 배 · jr 배) — 예시 draw 의 bone() 호출 순서 그대로: 다리 4 · 발 2 · 팔 6. 몸통 · 골반은 막대가 아니라 실제 뼈대
 * (아래 SKELETON — 빗장뼈 · 갈비 · 척추 · 골반이 그 안에 있다).
 * 화면은 이 표로 도형을 한 번 만들고, boneSpec 은 같은 표로 끝점을 채운다.
 */
export const BONE_TABLE: readonly { r: number; jr: number }[] = [
  { r: 1, jr: 1 }, // rh → rk
  { r: 0.9, jr: 1 }, // rk → ra
  { r: 1, jr: 1 }, // lh → lk
  { r: 0.9, jr: 1 }, // lk → la
  { r: 0.7, jr: 0.5 }, // 뒷발
  { r: 0.7, jr: 0.5 }, // 앞발
  { r: 0.9, jr: 1 }, // sh → el
  { r: 0.75, jr: 1 }, // el → wr
  { r: 0.9, jr: 1 }, // gs → ge
  { r: 0.75, jr: 1 }, // ge → gw
  { r: 0.55, jr: 0.6 }, // wr → ha
  { r: 0.55, jr: 0.6 }, // gw → gh
];

/**
 * 몸통 · 골반의 실제 뼈대 — body-full.glb 의 뼈 메시를 skeleton-parts.json 으로 가른 'pelvis' · 'trunk' 조각(사용자 2026-10-13: "고리 말고 실제 뼈로").
 * 모델 좌표는 미터 · y 위 · +x 왼쪽 · +z 앞, 엉덩이 높이 0.9 · 어깨(위팔 머리) 1.37.
 *
 * 정점마다 같은 높이의 인형 몸통 고리에 얹는다(2026-10-13 "뼈가 인형 밖으로 삐져나온다"): 높이 → 고리 t 는 torsoModel 의 가운데 선 점 일곱
 * (사타구니 · 엉덩이 · 마디 셋 · 어깨 · 목)과 같은 자리로 잇고, 고리 안에서는 옆(X) · 앞(Fw)으로 키 비율 그대로 두되 그 높이의 뼈가 인형 단면의
 * FIT 배를 넘으면 그 높이만 줄인다. 앞뒤는 뼈 단면 가운데를 인형 단면 가운데에 맞춘다. 그래서 뼈가 인형 안에 있고, 인형이 휘고 꼬이는 대로
 * 척추 · 갈비가 같이 휜다(예전엔 골반 · 가슴 틀 둘에 붙인 굳은 덩어리라 가슴 앞 갈비가 인형 밖 9cm 까지 나왔다 — 모델 갈비는 어깨선 앞 15cm, 인형 가슴은 10cm).
 */
export const SKELETON = { height: 1.706, hipY: 0.9, shoulderY: 1.37, hipHalf: 0.09, shoulderHalf: 0.19, fit: 0.9, samples: 48 } as const;

/** 모델 높이 → 고리 t 의 이음점(TORSO_KEYS 와 같은 차례) — 사타구니 · 목은 엉덩이 · 어깨에서 키의 0.075 */
const KEY_Y = (() => {
  const { hipY: h, shoulderY: s, height } = SKELETON;
  const c = (0.075 * height) / 1.8;
  return [h - c, h, h + (s - h) * 0.41, h + (s - h) * 0.6, h + (s - h) * 0.83, s, s + c];
})();

/** 모델 높이 → 고리 t(0~1) 와 그 밖으로 나간 높이(모델 미터 — 사타구니 밑 · 목 위) */
export function skeletonT(y: number): { t: number; dy: number } {
  if (y <= KEY_Y[0]) return { t: 0, dy: y - KEY_Y[0] };
  if (y >= KEY_Y[6]) return { t: 1, dy: y - KEY_Y[6] };
  let i = 1;
  while (y > KEY_Y[i]) i++;
  return { t: TORSO_KEYS[i - 1] + ((y - KEY_Y[i - 1]) / (KEY_Y[i] - KEY_Y[i - 1])) * (TORSO_KEYS[i] - TORSO_KEYS[i - 1]), dy: 0 };
}

/** 뼈 정점(모델 좌표, 펼친 삼각형) → 고리에 얹을 재료: 정점의 t · 고리 밖 높이 · 오른쪽 x · 단면 가운데로부터 앞 z, 표본 고리마다 뼈 반폭 · 두께 */
export type SkeletonPrep = {
  t: Float32Array;
  dy: Float32Array;
  x: Float32Array;
  z: Float32Array;
  nor: Float32Array;
  halfW: Float32Array;
  depth: Float32Array;
};

export function prepareSkeleton(pos: Float32Array, nor: Float32Array): SkeletonPrep {
  const n = pos.length / 3;
  const S = SKELETON.samples;
  const ts = Float32Array.from({ length: n }, (_, i) => skeletonT(pos[i * 3 + 1]).t);
  /* 표본 고리마다 그 높이 띠(t ±1 칸)의 뼈 반폭 · 앞뒤 끝(2~98% — 튄 정점 하나로 줄지 않게) */
  const halfW = new Float32Array(S + 1);
  const depth = new Float32Array(S + 1);
  const mid = new Float32Array(S + 1);
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  for (let j = 0; j <= S; j++) {
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < n; i++)
      if (Math.abs(ts[i] * S - j) <= 1) {
        xs.push(Math.abs(pos[i * 3]));
        zs.push(pos[i * 3 + 2]);
      }
    if (!xs.length) continue;
    xs.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);
    halfW[j] = q(xs, 0.98);
    const lo = q(zs, 0.02);
    const hi = q(zs, 0.98);
    depth[j] = hi - lo;
    mid[j] = (hi + lo) / 2;
  }
  const out: SkeletonPrep = { t: ts, dy: new Float32Array(n), x: new Float32Array(n), z: new Float32Array(n), nor: new Float32Array(n * 3), halfW, depth };
  for (let i = 0; i < n; i++) {
    const u = ts[i] * S;
    const j = Math.min(S - 1, Math.floor(u));
    const f = u - j;
    out.dy[i] = skeletonT(pos[i * 3 + 1]).dy;
    out.x[i] = -pos[i * 3];
    out.z[i] = pos[i * 3 + 2] - (mid[j] * (1 - f) + mid[j + 1] * f);
    out.nor[i * 3] = -nor[i * 3];
    out.nor[i * 3 + 1] = nor[i * 3 + 1];
    out.nor[i * 3 + 2] = nor[i * 3 + 2];
  }
  return out;
}

/**
 * 장면마다 뼈 정점을 인형 고리에 얹는다(out 위치 · 법선). 표본 고리(SKELETON.samples + 1)를 한 번 세고 정점은 둘 사이를 섞는다.
 * 옆 배율은 엉덩이 → 어깨로 우리 엉덩이 · 어깨 반폭(hipHalf · shoulderHalf)에 맞춘 배율(키 배율의 0.7~1.4배 — 골반 절구가 넙다리 머리에,
 * 빗장뼈 끝이 어깨에 닿게)을 섞되 FIT·인형 반폭 / 뼈 반폭을 넘지 않게, 앞뒤는 min(키 배율, FIT·인형 두께 / 뼈 두께) — 이웃 고리와 [1 2 1] 로 고른다.
 */
export function fitSkeleton(
  P: SkeletonPrep,
  T: TorsoModel,
  k: number,
  hipHalf: number,
  shoulderHalf: number,
  out: Float32Array,
  outNor: Float32Array
) {
  const S = SKELETON.samples;
  const s = (1.8 * k) / SKELETON.height;
  const wide = (w: number, model: number) => Math.min(1.4, Math.max(0.7, w / (model * s))) * s;
  const sH = wide(hipHalf, SKELETON.hipHalf);
  const sS = wide(shoulderHalf, SKELETON.shoulderHalf);
  const R = Array.from({ length: S + 1 }, (_, j) => T.ring(j / S));
  const raw = (j: number) => {
    const t = j / S;
    const w = T.width(t);
    const fr = T.front(t);
    const bk = T.back(t);
    const u = Math.min(1, Math.max(0, (t - TORSO_KEYS[1]) / (TORSO_KEYS[5] - TORSO_KEYS[1])));
    const base = sH + (sS - sH) * u * u * (3 - 2 * u);
    return {
      sx: P.halfW[j] > 1e-4 ? Math.min(base, (SKELETON.fit * w) / P.halfW[j]) : base,
      sz: P.depth[j] > 1e-4 ? Math.min(s, (SKELETON.fit * (fr + bk)) / P.depth[j]) : s,
      off: (fr - bk) / 2,
    };
  };
  const r0 = Array.from({ length: S + 1 }, (_, j) => raw(j));
  const sm = r0.map((r, j) => {
    const a = r0[Math.max(0, j - 1)];
    const b = r0[Math.min(S, j + 1)];
    return { sx: (a.sx + 2 * r.sx + b.sx) / 4, sz: (a.sz + 2 * r.sz + b.sz) / 4, off: r.off };
  });
  for (let i = 0; i < P.t.length; i++) {
    const u = P.t[i] * S;
    const j = Math.min(S - 1, Math.floor(u));
    const f = u - j;
    const A = R[j];
    const B = R[j + 1];
    const g = 1 - f;
    const sx = sm[j].sx * g + sm[j + 1].sx * f;
    const sz = sm[j].sz * g + sm[j + 1].sz * f;
    const zz = sm[j].off * g + sm[j + 1].off * f + P.z[i] * sz;
    const xx = P.x[i] * sx;
    const yy = P.dy[i] * s;
    const nx = P.nor[i * 3];
    const ny = P.nor[i * 3 + 1];
    const nz = P.nor[i * 3 + 2];
    let L2 = 0;
    for (let a = 0; a < 3; a++) {
      const X = A.X[a] * g + B.X[a] * f;
      const Y = A.Y[a] * g + B.Y[a] * f;
      const W = A.Fw[a] * g + B.Fw[a] * f;
      out[i * 3 + a] = A.c[a] * g + B.c[a] * f + X * xx + Y * yy + W * zz;
      const v = X * nx + Y * ny + W * nz;
      outNor[i * 3 + a] = v;
      L2 += v * v;
    }
    const L = Math.sqrt(L2) || 1;
    for (let a = 0; a < 3; a++) outNor[i * 3 + a] /= L;
  }
}

/** 범례(예시 #legend) — 잰 선 색 키와 글 */
export const LEGEND: readonly { key: keyof typeof MEASURE_COLOR; text: string }[] = [
  { key: 'pelvis', text: '골반' },
  { key: 'chest', text: '어깨' },
  { key: 'trunk', text: '몸통' },
  { key: 'knee', text: '무릎' },
  { key: 'arm', text: '어깨 벌림' },
  { key: 'elbow', text: '팔꿈치' },
];

export type BoneSpec = {
  /** 관절 구슬 12개(rh lh rk lk ra la sh gs el ge wr gw) — 반지름 jr */
  joints: Vec3[];
  /** 뼈 12개(BONE_TABLE 차례) — 끝점은 관절 그대로(화면이 boneEnds 로 양 끝을 jr·0.55 씩 줄인다) */
  bones: { a: Vec3; b: Vec3; r: number; jr: number }[];
  /** 목뼈 구슬 3개(몸통 척추는 실제 뼈대 조각에 있다) */
  beads: { p: Vec3; q: Quat }[];
  skull: { p: Vec3; q: Quat };
};


/** 발 뼈 — 뒤꿈치 위 3% 에서 발끝 쪽 23% 까지(신발 등 방향 n) */
function footBone(fp: FootPose, k: number): [Vec3, Vec3] {
  const fx = normalize(sub(fp.toe, fp.heel));
  return [add(fp.heel, scale(fp.n, 0.03 * k)), add(add(fp.heel, scale(fx, 0.23 * k)), scale(fp.n, 0.02 * k))];
}

/** 멈춤 화면의 속 뼈 명세 — 예시 draw '멈췄을 때: 속 뼈' 그대로 */
export function boneSpec(J: MannequinJoints, F: MannequinFrame, T: TorsoModel, k: number): BoneSpec {
  const jr = BONE_SIZES.jr * k;
  const br = BONE_SIZES.br * k;
  const cf = F.chest;
  const joints = [J.rh, J.lh, J.rk, J.lk, J.ra, J.la, J.sh, J.gs, J.el, J.ge, J.wr, J.gw];
  const [r0, r1] = footBone(F.rear, k);
  const [l0, l1] = footBone(F.lead, k);
  const ends: [Vec3, Vec3][] = [
    [J.rh, J.rk],
    [J.rk, J.ra],
    [J.lh, J.lk],
    [J.lk, J.la],
    [r0, r1],
    [l0, l1],
    [J.sh, J.el],
    [J.el, J.wr],
    [J.gs, J.ge],
    [J.ge, J.gw],
    [J.wr, J.ha],
    [J.gw, J.gh],
  ];
  const bones = ends.map(([a, b], i) => ({ a, b, r: BONE_TABLE[i].r * br, jr: BONE_TABLE[i].jr * jr }));
  /* 목뼈 구슬 셋 — 목 → 목 끝(몸통 척추는 실제 뼈대 조각) */
  const beads: BoneSpec['beads'] = [];
  for (let i = 0; i < BEADS; i++) beads.push({ p: add(lerp(T.neck, F.head.nk, (i + 1) / 3), scale(cf.fw, -0.01 * k)), q: cf.q });
  return { joints, bones, beads, skull: { p: F.head.hc, q: F.head.q } };
}

/** 뼈 양 끝을 관절 구슬 안으로 jr·0.55 씩 들이기 — 구슬이 보이게 */
export function boneEnds(a: Vec3, b: Vec3, jr: number): { a2: Vec3; b2: Vec3; len: number } {
  const d = sub(b, a);
  const L = norm(d);
  const len = Math.max(0, L - 1.1 * jr);
  if (L < 1e-9) return { a2: a, b2: b, len: 0 };
  const u = scale(d, 1 / L);
  return { a2: add(a, scale(u, 0.55 * jr)), b2: sub(b, scale(u, 0.55 * jr)), len };
}

/* ───────────────────────────── 옅어짐 ───────────────────────────── */

/** ana 시계 — 목표로 지수 수렴(초당 7), 0.004 안이면 붙임. 움직임 줄이기면 한 번에 */
export function anaStep(ana: number, target: 0 | 1, dt: number, reduced: boolean): number {
  if (ana === target) return ana;
  let next = ana + (target - ana) * Math.min(1, reduced ? 1 : dt * 7);
  if (Math.abs(target - next) < 0.004) next = target;
  return next;
}

/** 재질 값(예시 applyAna) — 인형은 비치게(맨 앞 겉면만) · 뼈 · 선은 짙게 */
export function anaMaterials(a: number) {
  const figTransparent = a > 0.004;
  return {
    figTransparent,
    figOpacity: 1 - 0.78 * a,
    /* 꼬임 줄 — 인형이 비쳐도 꼬임이 보이게 덜 옅게 */
    twistOpacity: 1 - 0.25 * a,
    figDepthWrite: !figTransparent,
    boneTransparent: a < 0.996,
    boneOpacity: a,
    lineOpacity: a,
    fanOpacity: 0.2 * a,
  };
}

/* ───────────────────────────── 호 · 이름표 ───────────────────────────── */

/** 호의 반지름과 면 법선 — 점이 하나(두 방향이 나란함)면 null */
export function arcFrame(arc: Arc): { r: number; normal: Vec3 } | null {
  if (arc.points.length < 2) return null;
  const u = sub(arc.points[0], arc.c);
  const n = cross(u, sub(arc.mid, arc.c));
  if (dot(n, n) < 1e-18) return null;
  return { r: norm(u), normal: normalize(n) };
}

export type LabelBox = { x: number; y: number; w: number; h: number };

/**
 * 이름표 자리 — 겹치면 위아래로 번갈아 밀고(최대 40번, ±(n+1)·4px, 예시 cam()), 그 뒤 화면 안으로 가둔다.
 * 차례대로 놓으므로 결정적. 가둔 뒤에는 가장자리에서 이웃과 닿을 수 있다.
 */
export function placeLabels(boxes: readonly LabelBox[], w: number, h: number): { x: number; y: number }[] {
  const placed: LabelBox[] = [];
  const out: { x: number; y: number }[] = [];
  for (const b of boxes) {
    let x = b.x;
    let y = b.y;
    const hits = () => placed.some((p) => Math.abs(p.x - x) < (p.w + b.w) / 2 && Math.abs(p.y - y) < (p.h + b.h) / 2);
    for (let n = 0; n < 40 && hits(); n++) y += n % 2 ? -(n + 1) * 4 : (n + 1) * 4;
    x = Math.min(Math.max(x, b.w / 2), Math.max(b.w / 2, w - b.w / 2));
    y = Math.min(Math.max(y, b.h / 2), Math.max(b.h / 2, h - b.h / 2));
    placed.push({ x, y, w: b.w, h: b.h });
    out.push({ x, y });
  }
  return out;
}

/** 정규 좌표(−1~1) → 화면 px(왼쪽 위 원점). z > 1 이면 카메라 뒤 */
export function projectToScreen(ndc: readonly [number, number, number], w: number, h: number) {
  return { x: ((ndc[0] + 1) / 2) * w, y: ((1 - ndc[1]) / 2) * h, visible: ndc[2] <= 1 };
}

/** 호의 점열을 캣멀롬으로 다시 고르게 뽑기(count 점, 양 끝 그대로) — 관 · 부채꼴이 매끈해진다(예시 TubeGeometry(CatmullRomCurve3)) */
export function arcPolyline(points: readonly Vec3[], count: number): Vec3[] {
  const copy = (p: Vec3): Vec3 => [p[0], p[1], p[2]];
  if (points.length < 3) return points.map(copy);
  const c = catmullRom(points);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) out.push(copy(points[0]));
    else if (i === count - 1) out.push(copy(points[points.length - 1]));
    else out.push(c.point(i / (count - 1)));
  }
  return out;
}
