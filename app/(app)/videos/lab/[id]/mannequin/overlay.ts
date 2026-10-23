import type * as Three from 'three';
import { norm, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { MannequinJoints } from '@/lib/pitch-3d/v2/mannequin-prep';
import type { MannequinFrame, Quat } from '@/lib/pitch-3d/v2/mannequin-frames';
import {
  computeNormals,
  fanIndices,
  loftIndices,
  loftVertexCount,
  torsoModel,
  writeFan,
  writeTube,
} from '@/lib/pitch-3d/v2/mannequin-loft';
import { MEASURE_COLOR, measureSpec, type Label, type MeasureKey } from '@/lib/pitch-3d/v2/mannequin-measure';
import {
  ARC_CAP,
  BEADS,
  BONE_COLOR,
  BONE_PROFILE,
  BONE_ROUGHNESS,
  BONE_SIZES,
  BONE_TABLE,
  LINE_W,
  compactSkeleton,
  fitSkeleton,
  prepareSkeleton,
  type SkeletonPrep,
  anaMaterials,
  arcFrame,
  arcPolyline,
  boneEnds,
  boneSpec,
} from '@/lib/pitch-3d/v2/mannequin-pause';

/**
 * 멈춤 화면의 속 뼈 · 잰 선 — three 쪽(설계 §6 3단계). figure.ts 와 같은 규칙: 도형은 한 번 만들고 update 는 자리 · 회전 · 배율만 바꾼다.
 * 호 관 · 부채꼴만 정점 버퍼(점 상한 ARC_CAP)를 다시 쓴다. 명세는 순수 모듈(mannequin-pause · mannequin-measure)이 만든다.
 * 묶음 둘(bones · lines)은 body-3d 가 인형과 같은 rig 에 넣고, 네 번 그리기에서 따로 켜고 끈다.
 */

type ThreeNS = typeof import('three');
type ColorKey = keyof typeof MEASURE_COLOR;
type Values = Parameters<typeof measureSpec>[4];

export type Overlay = {
  bones: Three.Group;
  lines: Three.Group;
  /** 장면의 뼈 · 선 자리를 다시 잡고 이름표 명세를 돌려준다(도형은 안 만든다) */
  update: (J: MannequinJoints, F: MannequinFrame, values: Values) => Label[];
  /** 옅어짐 — 뼈 · 선 · 부채꼴 재질만(인형 재질은 body-3d 가 fig.materials 로) */
  setAna: (a: number) => void;
  dispose: () => void;
};

const TUBE_K = 6;

/**
 * 몸통 · 골반의 실제 뼈대 조각(body-full.glb 뼈 메시 → skeleton-parts.json 의 pelvis · trunk) — 화면을 여러 번 열어도 한 번만 받는다.
 * 두 조각을 펼친 삼각형 하나로 모아 인형 고리에 얹을 재료(prepareSkeleton)로 바꿔 둔다.
 */
let skeletonData: Promise<{ prep: SkeletonPrep; index: Uint32Array }> | null = null;
function loadSkeletonData(): Promise<{ prep: SkeletonPrep; index: Uint32Array }> {
  if (!skeletonData) {
    skeletonData = (async () => {
      const [{ GLTFLoader }, raw] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        fetch('/models/skeleton-parts.json').then((r) => r.json() as Promise<{ mesh: string; vertexCount: number; parts: string[]; vertexPart: string }>),
      ]);
      const gltf = await new GLTFLoader().loadAsync('/models/body-full.glb');
      /* GLTFLoader 는 이름의 점을 지운다(skeleton__mobile.001 → skeleton__mobile001) — 이름이 안 맞으면 정점 수로 찾는다 */
      const wanted = raw.mesh.replace(/[.\s]/g, '');
      let found: Three.Mesh | null = null;
      gltf.scene.traverse((o) => {
        const m = o as Three.Mesh;
        if (!m.isMesh) return;
        if (o.name.replace(/[.\s]/g, '') === wanted || (!found && m.geometry.attributes.position?.count === raw.vertexCount)) found = m;
      });
      const geo = (found as Three.Mesh | null)?.geometry;
      const pos = geo?.attributes.position;
      const nor = geo?.attributes.normal;
      if (!geo?.index || !pos || !nor || pos.count !== raw.vertexCount) throw new Error('뼈대 메시');
      const vp = Uint8Array.from(atob(raw.vertexPart), (c) => c.charCodeAt(0));
      const want = new Set([raw.parts.indexOf('pelvis'), raw.parts.indexOf('trunk')]);
      const ids: number[] = [];
      const idx = geo.index;
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        const b = idx.getX(t + 1);
        const c = idx.getX(t + 2);
        const part = vp[a] === vp[b] || vp[a] === vp[c] ? vp[a] : vp[b] === vp[c] ? vp[b] : vp[a];
        if (want.has(part)) ids.push(a, b, c);
      }
      const P = new Float32Array(ids.length * 3);
      const N = new Float32Array(ids.length * 3);
      ids.forEach((v, i) => {
        P.set([pos.getX(v), pos.getY(v), pos.getZ(v)], i * 3);
        N.set([nor.getX(v), nor.getY(v), nor.getZ(v)], i * 3);
      });
      return compactSkeleton(prepareSkeleton(P, N), ids);
    })();
    skeletonData.catch(() => {
      skeletonData = null;
    });
  }
  return skeletonData;
}

export function createOverlay(THREE: ThreeNS, opts: { heightM: number; onReady?: () => void }): Overlay {
  const k = opts.heightM / 1.8;
  const jr = BONE_SIZES.jr * k;
  const br = BONE_SIZES.br * k;
  const LW = LINE_W * k;
  const bones = new THREE.Group();
  const lines = new THREE.Group();
  const UP = new THREE.Vector3(0, 1, 0);
  const sV = new THREE.Vector3();
  const sQ = new THREE.Quaternion();
  const geometries: Three.BufferGeometry[] = [];
  const keep = <G extends Three.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };

  /* 재질 — 뼈는 빛을 받는 양면, 선 · 부채꼴은 깊이 무시(늘 맨 위) */
  const bm = {} as Record<keyof typeof BONE_COLOR, Three.MeshStandardMaterial>;
  for (const key of Object.keys(BONE_COLOR) as (keyof typeof BONE_COLOR)[])
    bm[key] = new THREE.MeshStandardMaterial({
      color: BONE_COLOR[key],
      roughness: BONE_ROUGHNESS[key],
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      forceSinglePass: true,
    });
  const lm = {} as Record<ColorKey, Three.MeshBasicMaterial>;
  const fm = {} as Record<ColorKey, Three.MeshBasicMaterial>;
  for (const key of Object.keys(MEASURE_COLOR) as ColorKey[]) {
    lm[key] = new THREE.MeshBasicMaterial({ color: MEASURE_COLOR[key], transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    fm[key] = new THREE.MeshBasicMaterial({
      color: MEASURE_COLOR[key],
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
  }

  const mesh = (parent: Three.Group, g: Three.BufferGeometry, m: Three.Material) => {
    const o = new THREE.Mesh(g, m);
    parent.add(o);
    if (parent === lines) o.renderOrder = 10;
    return o;
  };

  /* ── 뼈(한 번만) ── */
  const SPHERE = keep(new THREE.SphereGeometry(1, 32, 22));
  const jointBalls = Array.from({ length: 12 }, () => mesh(bones, SPHERE, bm.joint));
  const boneMeshes = BONE_TABLE.map(({ r }) =>
    mesh(
      bones,
      keep(new THREE.LatheGeometry(BONE_PROFILE.map(([t, f]) => new THREE.Vector2(Math.max(0.002, f * r * br), t - 0.5)), 16)),
      bm.bone
    )
  );
  /* 몸통 · 골반 실제 뼈대 — 받는 대로 붙인다(그 전엔 팔다리 · 목만). 장면마다 정점을 인형 몸통 고리에 얹는다(fitSkeleton) */
  let skel: { mesh: Three.Mesh; prep: SkeletonPrep } | null = null;
  let lastTorso: { T: ReturnType<typeof torsoModel>; hip: number; sh: number } | null = null;
  const placeSkeleton = ({ T, hip, sh }: NonNullable<typeof lastTorso>) => {
    if (!skel) return;
    const g = skel.mesh.geometry;
    const tp = g.attributes.position as Three.BufferAttribute;
    const tn = g.attributes.normal as Three.BufferAttribute;
    fitSkeleton(skel.prep, T, k, hip, sh, tp.array as Float32Array, tn.array as Float32Array);
    tp.needsUpdate = true;
    tn.needsUpdate = true;
  };
  let disposed = false;
  loadSkeletonData()
    .then(({ prep, index }) => {
      if (disposed) return;
      const g = keep(new THREE.BufferGeometry());
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(prep.t.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(prep.t.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const m = mesh(bones, g, bm.bone);
      m.frustumCulled = false;
      skel = { mesh: m, prep };
      if (lastTorso) placeSkeleton(lastTorso);
      opts.onReady?.();
    })
    .catch(() => {
      /* 못 받으면 팔다리 · 목만 — 보기는 그대로 돈다 */
    });
  const beads = Array.from({ length: BEADS }, () => mesh(bones, SPHERE, bm.bone));
  const skull = mesh(bones, SPHERE, bm.bone);

  /* ── 잰 선(한 번만) — 선 9 · 점 4 · 호 5(관 + 부채꼴) ── */
  const segs = Array.from({ length: 6 }, () => mesh(lines, keep(new THREE.CylinderGeometry(LW, LW, 1, 8)), lm.ref));
  const dots = Array.from({ length: 4 }, () => mesh(lines, SPHERE, lm.ref));
  const tubeIndex = loftIndices(ARC_CAP - 1, TUBE_K, true);
  const fanIndex = fanIndices(ARC_CAP);
  const arcs = Array.from({ length: 2 }, () => {
    const n = loftVertexCount(ARC_CAP - 1, TUBE_K, true);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const tg = keep(new THREE.BufferGeometry());
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setIndex(tubeIndex);
    const tube = mesh(lines, tg, lm.ref);
    tube.frustumCulled = false;
    const fpos = new Float32Array((ARC_CAP + 1) * 3);
    const fg = keep(new THREE.BufferGeometry());
    fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3).setUsage(THREE.DynamicDrawUsage));
    fg.setIndex(fanIndex);
    const fan = mesh(lines, fg, fm.ref);
    fan.frustumCulled = false;
    return { tube, pos, nor, fan, fpos };
  });

  /* ── 자리 잡기(figure.ts 와 같은 규칙) ── */
  const quat = (q: Quat) => sQ.set(q[0], q[1], q[2], q[3]);
  const placeLathe = (o: Three.Mesh, a: Vec3, b: Vec3) => {
    const d = sub(b, a);
    const h = Math.hypot(...d) || 1e-6;
    o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    o.quaternion.setFromUnitVectors(UP, sV.set(d[0] / h, d[1] / h, d[2] / h));
    o.scale.set(1, h, 1);
  };
  const placeEll = (o: Three.Mesh, p: Vec3, sx: number, sy: number, sz: number, q?: Quat) => {
    o.position.set(p[0], p[1], p[2]);
    o.scale.set(sx, sy, sz);
    if (q) o.quaternion.copy(quat(q));
    else o.quaternion.identity();
  };
  const flush = (g: Three.BufferGeometry, normals: boolean) => {
    (g.attributes.position as Three.BufferAttribute).needsUpdate = true;
    if (normals) (g.attributes.normal as Three.BufferAttribute).needsUpdate = true;
  };

  const update = (J: MannequinJoints, F: MannequinFrame, values: Values) => {
    const T = torsoModel(J, F.pelvis, F.chest, k);
    const bs = boneSpec(J, F, T, k);
    const spec = measureSpec(J, F.pelvis, F.chest, k, values);

    bs.joints.forEach((p, i) => placeEll(jointBalls[i], p, jr, jr, jr));
    bs.bones.forEach((b, i) => {
      const { a2, b2, len } = boneEnds(b.a, b.b, b.jr);
      boneMeshes[i].visible = len > 1e-4;
      placeLathe(boneMeshes[i], a2, b2);
    });
    lastTorso = { T, hip: norm(sub(J.rh, J.lh)) / 2, sh: norm(sub(J.sh, J.gs)) / 2 };
    placeSkeleton(lastTorso);
    bs.beads.forEach((b, i) => placeEll(beads[i], b.p, 0.026 * k, 0.014 * k, 0.022 * k, b.q));
    placeEll(skull, bs.skull.p, 0.07 * k, 0.088 * k, 0.08 * k, bs.skull.q);

    spec.segments.forEach((s, i) => {
      const o = segs[i];
      const len = Math.hypot(...sub(s.b, s.a));
      o.visible = len >= 1e-4;
      o.material = lm[s.color];
      placeLathe(o, s.a, s.b);
    });
    spec.dots.forEach((d, i) => {
      dots[i].material = lm[d.color];
      placeEll(dots[i], d.p, LW * 2.2, LW * 2.2, LW * 2.2);
    });
    spec.arcs.forEach((arc, i) => {
      const A = arcs[i];
      const af = arcFrame(arc);
      A.tube.visible = A.fan.visible = af !== null;
      if (!af) return;
      A.tube.material = lm[arc.key];
      A.fan.material = fm[arc.key];
      const pts = arcPolyline(arc.points, ARC_CAP);
      writeTube(A.pos, pts, af.normal, LW * 0.8, ARC_CAP, TUBE_K);
      computeNormals(A.pos, tubeIndex, A.nor);
      flush(A.tube.geometry, true);
      writeFan(A.fpos, arc.c, pts, ARC_CAP);
      flush(A.fan.geometry, false);
    });
    return spec.labels;
  };

  const setAna = (a: number) => {
    const m = anaMaterials(a);
    for (const mat of Object.values(bm)) {
      if (mat.transparent !== m.boneTransparent) {
        mat.transparent = m.boneTransparent;
        mat.needsUpdate = true;
      }
      mat.opacity = m.boneOpacity;
    }
    for (const mat of Object.values(lm)) mat.opacity = m.lineOpacity;
    for (const mat of Object.values(fm)) mat.opacity = m.fanOpacity;
  };

  const dispose = () => {
    disposed = true;
    for (const g of geometries) g.dispose();
    for (const mat of [...Object.values(bm), ...Object.values(lm), ...Object.values(fm)]) mat.dispose();
    bones.clear();
    lines.clear();
  };

  return { bones, lines, update, setAna, dispose };
}

/** 이름표 · 범례 색(hex 글자) */
export const measureHex = (key: MeasureKey | ColorKey) => '#' + MEASURE_COLOR[key].toString(16).padStart(6, '0');
