import { add, cross, dot, norm, normalize, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { MannequinJoints } from '@/lib/pitch-3d/v2/mannequin-prep';
import { lerp, rotate, slerp, type FootPose, type MannequinFrame, type Quat } from '@/lib/pitch-3d/v2/mannequin-frames';
import { catmullRom, type TorsoModel } from '@/lib/pitch-3d/v2/mannequin-loft';
import type { Arc, MEASURE_COLOR } from '@/lib/pitch-3d/v2/mannequin-measure';
import { curve } from '@/lib/pitch-3d/v2/mannequin-profiles';

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
export const BEADS = 12;
export const ARC_CAP = 64;

/**
 * 뼈 14개의 차례와 굵기(br 배 · jr 배) — 예시 draw 의 bone() 호출 순서 그대로: 다리 4 · 발 2 · 팔 6 · 빗장뼈 2.
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
  { r: 0.75, jr: 1 }, // 목 밑 → sh
  { r: 0.75, jr: 1 }, // 목 밑 → gs
];

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
  /** 뼈 14개 — 끝점은 관절 그대로(화면이 boneEnds 로 양 끝을 jr·0.55 씩 줄인다) */
  bones: { a: Vec3; b: Vec3; r: number; jr: number }[];
  /** 골반 · 가슴 고리(토러스 band — 화면이 q 에 x 축 +90° 를 곱한다) */
  rings: { c: Vec3; q: Quat; sx: number; sy: number; tz: number; color: 'pelvis' | 'chest' }[];
  /** 척추 구슬 12개(몸통 9 · 목 3) */
  beads: { p: Vec3; q: Quat }[];
  skull: { p: Vec3; q: Quat };
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 발 뼈 — 뒤꿈치 위 3% 에서 발끝 쪽 23% 까지(신발 등 방향 n) */
function footBone(fp: FootPose, k: number): [Vec3, Vec3] {
  const fx = normalize(sub(fp.toe, fp.heel));
  return [add(fp.heel, scale(fp.n, 0.03 * k)), add(add(fp.heel, scale(fx, 0.23 * k)), scale(fp.n, 0.02 * k))];
}

/** 멈춤 화면의 속 뼈 명세 — 예시 draw '멈췄을 때: 속 뼈' 그대로 */
export function boneSpec(J: MannequinJoints, F: MannequinFrame, T: TorsoModel, k: number): BoneSpec {
  const jr = BONE_SIZES.jr * k;
  const br = BONE_SIZES.br * k;
  const pf = F.pelvis;
  const cf = F.chest;
  const joints = [J.rh, J.lh, J.rk, J.lk, J.ra, J.la, J.sh, J.gs, J.el, J.ge, J.wr, J.gw];
  const [r0, r1] = footBone(F.rear, k);
  const [l0, l1] = footBone(F.lead, k);
  const base = add(T.neck, scale(cf.ya, -0.035 * k));
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
    [base, J.sh],
    [base, J.gs],
  ];
  const bones = ends.map(([a, b], i) => ({ a, b, r: BONE_TABLE[i].r * br, jr: BONE_TABLE[i].jr * jr }));
  const rings: BoneSpec['rings'] = [
    { c: add(T.hm, scale(pf.ya, 0.035 * k)), q: pf.q, sx: T.hw + 0.035 * k, sy: 0.075 * k, tz: 0.1 * k, color: 'pelvis' },
    {
      c: curve(T.C, 0.84),
      q: cf.q,
      sx: Math.max(0.15 * k, norm(sub(J.sh, J.gs)) / 2 - 0.01 * k),
      sy: 0.085 * k,
      tz: 0.1 * k,
      color: 'chest',
    },
  ];
  /* 척추 구슬 — 몸통 가운데 선 위를 따라가되 틀의 z(= 앞의 반대) 쪽으로 6% 물러난다(등 쪽). 목 셋은 목 → 목 끝 */
  const beads: BoneSpec['beads'] = [];
  for (let i = 0; i < BEADS; i++) {
    if (i < 9) {
      const t = 0.18 + (0.72 * i) / 8;
      const q = slerp(pf.q, cf.q, clamp01((t - 0.2) / 0.5));
      beads.push({ p: add(curve(T.C, t), scale(rotate(q, [0, 0, 1]), 0.06 * k)), q });
    } else {
      beads.push({ p: add(lerp(T.neck, F.head.nk, (i - 8) / 3), scale(cf.fw, -0.01 * k)), q: cf.q });
    }
  }
  return { joints, bones, rings, beads, skull: { p: F.head.hc, q: F.head.q } };
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
