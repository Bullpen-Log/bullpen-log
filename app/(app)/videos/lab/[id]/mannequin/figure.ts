import type * as Three from 'three';
import { add, cross, normalize, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { MannequinJoints } from '@/lib/pitch-3d/v2/mannequin-prep';
import { basis, lerp, mid, rotate, type MannequinFrame, type Quat } from '@/lib/pitch-3d/v2/mannequin-frames';
import {
  TORSO_PANTS_VERTS,
  TORSO_SHIRT_VERTS,
  computeNormals,
  loftIndices,
  loftVertexCount,
  shoeAxes,
  torsoIndices,
  torsoModel,
  writeLoft,
  writeTorso,
} from '@/lib/pitch-3d/v2/mannequin-loft';
import {
  HAND,
  HEAD,
  LIMB,
  MANNEQUIN_COLOR,
  MANNEQUIN_ROUGHNESS,
  SHOE,
  SHOE_LACE_T,
  THIGH,
  TORSO,
  TRIM,
  laceHeight,
  limbProfile,
  prof,
  shoeUp,
  shoeWidth,
  soleWidth,
  type Profile,
} from '@/lib/pitch-3d/v2/mannequin-profiles';

/**
 * 데생 인형 — three 쪽(설계 docs/designs/pitch-3d-mannequin.md §6-2, 2026-10-11 금윤호). 예시 page.js 의 draw 가 장면마다 도형 74개를 새로 만들던
 * 것을, **한 번 만들고 장면마다 자리 · 회전 · 배율만 바꾼다**(검토 B안). 변형되는 겉면(몸통 2 · 신발 4)만 미리 잡은 정점 버퍼를 다시 쓴다.
 *
 *   - 래스(허벅지 · 정강이 · 팔 …)는 높이 1 로 한 번 만들고 scale.y = 길이 — 회전체라 세로 배율만으로 정확하다.
 *   - 구 · 상자 · 토러스는 단위 도형 하나씩, 자리 · 회전 · 배율.
 *   - 좌표는 순수 모듈과 같은 z 위 · 미터 · 우투 꼴. 좌투는 묶음(group)의 y 배율을 −1 로 둬 되돌린다(화면 쪽, body-3d.tsx).
 *   - update 는 BufferGeometry · Mesh 를 만들지 않는다(셀프테스트가 감시).
 */

type ThreeNS = typeof import('three');

export type Figure = {
  group: Three.Group;
  update: (J: MannequinJoints, F: MannequinFrame) => void;
  dispose: () => void;
  materials: Record<keyof typeof MANNEQUIN_COLOR, Three.MeshStandardMaterial>;
};

type Loft = { mesh: Three.Mesh; pos: Float32Array; nor: Float32Array; index: number[] };

export function createFigure(THREE: ThreeNS, opts: { heightM: number; hand: 'R' | 'L' }): Figure {
  const k = opts.heightM / 1.8;
  const group = new THREE.Group();
  const UP = new THREE.Vector3(0, 1, 0);
  const ZV = new THREE.Vector3(0, 0, 1);
  const RX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const sV = new THREE.Vector3();
  const sQ = new THREE.Quaternion();
  const geometries: Three.BufferGeometry[] = [];

  /* 재질 — 색은 hex 그대로(색 관리 켜짐), 예시처럼 모두 양면(겹이 얇은 로프트 · 열린 래스가 섞여 있다) */
  const materials = {} as Figure['materials'];
  for (const key of Object.keys(MANNEQUIN_COLOR) as (keyof typeof MANNEQUIN_COLOR)[]) {
    materials[key] = new THREE.MeshStandardMaterial({
      color: MANNEQUIN_COLOR[key],
      roughness: MANNEQUIN_ROUGHNESS[key],
      metalness: key === 'buckle' ? 0.6 : 0,
      side: THREE.DoubleSide,
      /* 멈춤 화면에서 비칠 때 양면을 두 번 그리지 않게 — 깊이 선행 패스가 맨 앞 겉면만 남긴다(overlay · body-3d) */
      forceSinglePass: true,
    });
  }
  const M = materials;

  const keep = <G extends Three.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };
  const mesh = (g: Three.BufferGeometry, m: Three.Material) => {
    const o = new THREE.Mesh(g, m);
    group.add(o);
    return o;
  };

  /* ── 단위 도형 ── */
  const SPHERE = keep(new THREE.SphereGeometry(1, 32, 22));
  const lathe = (profile: Profile, m: Three.Material, seg = 32) =>
    mesh(keep(new THREE.LatheGeometry(profile.map(([t, r]) => new THREE.Vector2(Math.max(0.002, r * k), t - 0.5)), seg)), m);
  const ell = (m: Three.Material) => mesh(SPHERE, m);
  const torus = (r: number, tube: number, a: number, b: number, m: Three.Material) => mesh(keep(new THREE.TorusGeometry(r, tube, a, b)), m);
  const box = (w: number, h: number, d: number, m: Three.Material) => mesh(keep(new THREE.BoxGeometry(w, h, d)), m);
  const loft = (RN: number, K: number, capped: boolean, m: Three.Material): Loft => {
    const n = loftVertexCount(RN, K, capped);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const index = loftIndices(RN, K, capped);
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(index);
    const o = mesh(g, m);
    o.frustumCulled = false;
    return { mesh: o, pos, nor, index };
  };
  const loftFrom = (pos: Float32Array, index: number[], m: Three.Material): Loft => {
    const nor = new Float32Array(pos.length);
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(index);
    const o = mesh(g, m);
    o.frustumCulled = false;
    return { mesh: o, pos, nor, index };
  };
  const flush = (l: Loft) => {
    computeNormals(l.pos, l.index, l.nor);
    (l.mesh.geometry.attributes.position as Three.BufferAttribute).needsUpdate = true;
    (l.mesh.geometry.attributes.normal as Three.BufferAttribute).needsUpdate = true;
  };

  /* ── 자리 잡기 ── */
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
  const placeRing = (o: Three.Mesh, p: Vec3, dir: Vec3) => {
    const d = normalize(dir);
    o.position.set(p[0], p[1], p[2]);
    o.quaternion.setFromUnitVectors(ZV, sV.set(d[0], d[1], d[2]));
    o.scale.set(1, 1, 1);
  };
  const placeBand = (o: Three.Mesh, p: Vec3, q: Quat, sx: number, sy: number, tz: number) => {
    o.quaternion.copy(quat(q)).multiply(RX);
    o.scale.set(sx, sy, tz);
    o.position.set(p[0], p[1], p[2]);
  };
  const placeBox = (o: Three.Mesh, p: Vec3, q: Quat, sy = 1) => {
    o.position.set(p[0], p[1], p[2]);
    o.quaternion.copy(quat(q));
    o.scale.set(1, sy, 1);
  };

  /* ── 부품(한 번만) ── */
  const { pants: pantsIdx, shirt: shirtIdx } = torsoIndices();
  const pants = loftFrom(new Float32Array(TORSO_PANTS_VERTS * 3), pantsIdx, M.pants);
  const shirt = loftFrom(new Float32Array(TORSO_SHIRT_VERTS * 3), shirtIdx, M.shirt);
  const crotch = ell(M.pants);
  const belt = torus(1, TRIM.beltTube, 10, 48, M.belt);
  const buckle = box(TRIM.buckle[0] * k, TRIM.buckle[1] * k, TRIM.buckle[2] * k, M.buckle);
  const loops = [0, 1].map(() => box(TRIM.loop[0] * k, TRIM.loop[1] * k, TRIM.loop[2] * k, M.pants));
  const stripes = Array.from({ length: TRIM.stripe.count }, () => box(TRIM.stripe.w * k, 1, TRIM.stripe.d * k, M.stripe));
  const buttons = TRIM.buttonT.map(() => ell(M.button));
  const collar = torus(1, TRIM.collar.tube, 10, 48, M.stripe);

  const leg = () => ({
    thigh: lathe(THIGH, M.pants),
    knee: ell(M.pants),
    shin: lathe(limbProfile(LIMB.shin.r0, LIMB.shin.r1, LIMB.shin.bulge, LIMB.shin.peak), M.pants),
    cuff: torus(LIMB.cuffR * k, LIMB.cuffTube * k, 10, 40, M.pants),
    calf: lathe(limbProfile(LIMB.calf.r0, LIMB.calf.r1, LIMB.calf.bulge, LIMB.calf.peak), M.sock),
    ankle: ell(M.sock),
    upper: loft(SHOE.RN, SHOE.K, true, M.shoe),
    sole: loft(SHOE.soleRN, SHOE.K, true, M.sole),
    laces: SHOE_LACE_T.map(() => box(TRIM.laceBox[0] * k, TRIM.laceBox[1] * k, TRIM.laceBox[2] * k, M.sole)),
  });
  const legs = { rear: leg(), lead: leg() };

  const arm = () => ({
    shoulder: ell(M.shirt),
    sleeve: lathe(limbProfile(LIMB.sleeve.r0, LIMB.sleeve.r1, LIMB.sleeve.bulge, LIMB.sleeve.peak), M.shirt),
    sleeveRing: torus(LIMB.sleeveRingR * k, LIMB.sleeveRingTube * k, 10, 40, M.stripe),
    upper: lathe(limbProfile(LIMB.upper.r0, LIMB.upper.r1, LIMB.upper.bulge, LIMB.upper.peak), M.skin),
    elbow: ell(M.skin),
    forearm: lathe(limbProfile(LIMB.forearm.r0, LIMB.forearm.r1, LIMB.forearm.bulge, LIMB.forearm.peak), M.skin),
    wrist: ell(M.skin),
  });
  const arms = { throwing: arm(), glove: arm() };
  const hand = {
    palm: ell(M.skin),
    thumb: lathe(limbProfile(LIMB.thumb.r0, LIMB.thumb.r1), M.skin),
    ball: ell(M.ball),
    seam: torus(HAND.seamR * k, HAND.seamTube * k, 6, 48, M.seam),
  };
  const glove = {
    body: ell(M.glove),
    thumb: ell(M.glove),
    lace: ell(M.lace),
    ring: torus(HAND.gloveRingR * k, HAND.gloveRingTube * k, 10, 40, M.glove),
  };
  const neck = {
    lower: lathe(limbProfile(LIMB.neck.r0, LIMB.neck.r1, LIMB.neck.bulge, LIMB.neck.peak), M.skin),
    upper: lathe(limbProfile(LIMB.neck2.r0, LIMB.neck2.r1), M.skin),
    head: ell(M.skin),
    nose: ell(M.skin),
    ears: [0, 1].map(() => ell(M.skin)),
  };

  /* 신발 프로필(k 배율 적용) — 장면마다 같은 함수 */
  const shoeW = shoeWidth(k);
  const shoeU = shoeUp(k);
  const soleW = soleWidth(k);
  const laceH = laceHeight(k);
  const shoeOpts = { RN: SHOE.RN, K: SHOE.K, n: SHOE.n };
  const soleOpts = { RN: SHOE.soleRN, K: SHOE.K, n: SHOE.soleN };

  /* ── 장면 ── */
  const update = (J: MannequinJoints, F: MannequinFrame) => {
    const pf = F.pelvis;
    const cf = F.chest;
    const T = torsoModel(J, pf, cf, k);
    writeTorso(T, pants.pos, shirt.pos);
    flush(pants);
    flush(shirt);
    placeEll(crotch, add(T.crotch, scale(pf.ya, 0.04 * k)), T.hw + 0.02 * k, 0.05 * k, 0.08 * k, pf.q);
    const BR = T.ring(TORSO.beltT);
    const bw = T.width(TORSO.beltT);
    const bdf = T.front(TORSO.beltT);
    const bdb = T.back(TORSO.beltT);
    placeBand(belt, BR.c, BR.q, bw * 1.01, ((bdf + bdb) / 2) * 1.02, 0.09 * k);
    placeBox(buckle, add(BR.c, scale(BR.Fw, bdf + 0.006)), BR.q);
    [-0.62, 0.62].forEach((sx, i) =>
      placeBox(loops[i], add(add(BR.c, scale(BR.X, sx * bw)), scale(BR.Fw, bdf * 0.82 + 0.006)), BR.q)
    );
    const at = (t: number) => {
      const R = T.ring(t);
      return { p: add(R.c, scale(R.Fw, T.front(t))), X: R.X, Fw: R.Fw };
    };
    for (let i = 0; i < TRIM.stripe.count; i++) {
      const a = at(TRIM.stripe.t0 + TRIM.stripe.step * i);
      const b = at(TRIM.stripe.t0 + TRIM.stripe.step * (i + 1));
      const dRaw = sub(b.p, a.p);
      const l = Math.hypot(...dRaw);
      const d = normalize(dRaw);
      const fw = normalize(add(a.Fw, b.Fw));
      const x = normalize(cross(d, fw));
      placeBox(stripes[i], add(mid(a.p, b.p), scale(fw, 0.001)), basis(x, d, cross(x, d)), l * 1.04);
    }
    TRIM.buttonT.forEach((t, i) => {
      const a = at(t);
      const back = scale(a.Fw, -1);
      placeEll(buttons[i], add(a.p, scale(a.Fw, 0.004 * k)), TRIM.button[0] * k, TRIM.button[1] * k, TRIM.button[2] * k, basis(a.X, cross(back, a.X), back));
    });
    placeBand(collar, add(T.neck, scale(cf.ya, -0.006 * k)), cf.q, TRIM.collar.sx * k, TRIM.collar.sy * k, TRIM.collar.tz * k);

    /* 다리: 허벅지(바지) · 정강이 위(바지, 밑단) · 종아리(양말) · 신발 */
    const hsc = Math.min(1, (0.1 * k) / (Math.hypot(...sub(J.rh, J.lh)) / 2));
    for (const [hp, kn, fp, L] of [
      [J.rh, J.rk, F.rear, legs.rear],
      [J.lh, J.lk, F.lead, legs.lead],
    ] as const) {
      const hipUp = add(add(T.hm, scale(sub(hp, T.hm), hsc * 0.88)), scale(pf.ya, 0.03 * k));
      const tdir = normalize(sub(kn, hipUp));
      placeLathe(L.thigh, sub(hipUp, scale(tdir, 0.05 * k)), kn);
      placeEll(L.knee, kn, LIMB.knee * k, LIMB.knee * k, LIMB.knee * k);
      const an = fp.ankle;
      const m = lerp(kn, an, 0.42);
      placeLathe(L.shin, kn, m);
      placeRing(L.cuff, m, sub(an, kn));
      placeLathe(L.calf, m, an);
      placeEll(L.ankle, an, LIMB.ankle * k, LIMB.ankle * k, LIMB.ankle * k);
      const S = shoeAxes(fp.heel, fp.toe, fp.n, k);
      writeLoft(L.upper.pos, S.P, S.X, S.U, (t) => prof(shoeW, t), (t) => prof(shoeU, t), () => 0.004 * k, shoeOpts);
      flush(L.upper);
      writeLoft(L.sole.pos, S.Ps, S.X, S.U, (t) => prof(soleW, t), () => 0.006 * k, () => 0.011 * k, soleOpts);
      flush(L.sole);
      const lq = basis(S.X, S.fx, scale(S.U, -1));
      SHOE_LACE_T.forEach((t, i) => placeBox(L.laces[i], add(S.P(t), scale(S.U, prof(laceH, t) - 0.002 * k)), lq));
    }

    /* 팔: 어깨(소매, 끝단 줄) · 위팔 · 아래팔 · 손 */
    for (const [s, e, w, A] of [
      [J.sh, J.el, J.wr, arms.throwing],
      [J.gs, J.ge, J.gw, arms.glove],
    ] as const) {
      placeEll(A.shoulder, s, LIMB.shoulder[0] * k, LIMB.shoulder[1] * k, LIMB.shoulder[2] * k);
      const sleeve = lerp(s, e, 0.42);
      placeLathe(A.sleeve, s, sleeve);
      placeRing(A.sleeveRing, sleeve, sub(e, s));
      placeLathe(A.upper, sleeve, e);
      placeEll(A.elbow, e, LIMB.elbow * k, LIMB.elbow * k, LIMB.elbow * k);
      placeLathe(A.forearm, e, w);
      placeEll(A.wrist, w, LIMB.wrist * k, LIMB.wrist * k, LIMB.wrist * k);
    }
    {
      const H = F.throwing;
      placeEll(hand.palm, H.hc, HAND.palm[0] * k, HAND.palm[1] * k, HAND.palm[2] * k, H.q);
      const bp = add(add(H.hc, scale(H.hd, 0.04 * k)), scale(H.nrm, 0.012 * k));
      const thb = add(add(H.hc, scale(H.side, 0.03 * k)), scale(H.hd, 0.005 * k));
      placeLathe(hand.thumb, thb, add(add(thb, scale(H.hd, 0.03 * k)), scale(H.side, 0.008 * k)));
      placeEll(hand.ball, bp, HAND.ballR * k, HAND.ballR * k, HAND.ballR * k);
      hand.seam.quaternion.copy(quat(H.q));
      hand.seam.scale.set(1, 0.55, 1);
      hand.seam.position.set(bp[0], bp[1], bp[2]);
    }
    {
      const H = F.glove;
      const gc = add(H.hc, scale(H.hd, 0.02 * k));
      placeEll(glove.body, gc, HAND.gloveBody[0] * k, HAND.gloveBody[1] * k, HAND.gloveBody[2] * k, H.q);
      placeEll(glove.thumb, add(add(gc, scale(H.side, 0.05 * k)), scale(H.hd, -0.012 * k)), HAND.gloveThumb[0] * k, HAND.gloveThumb[1] * k, HAND.gloveThumb[2] * k, H.q);
      placeEll(glove.lace, add(add(gc, scale(H.nrm, 0.022 * k)), scale(H.hd, 0.01 * k)), HAND.gloveLace[0] * k, HAND.gloveLace[1] * k, HAND.gloveLace[2] * k, H.q);
      placeRing(glove.ring, add(J.gw, scale(H.hd, 0.008 * k)), H.hd);
    }

    /* 목 · 머리 */
    const hd = F.head;
    placeLathe(neck.lower, add(T.neck, scale(cf.ya, -0.03 * k)), hd.nk);
    placeLathe(neck.upper, add(T.neck, scale(cf.ya, 0.02 * k)), hd.hc);
    placeEll(neck.head, hd.hc, HEAD.radii[0] * k, HEAD.radii[1] * k, HEAD.radii[2] * k, hd.q);
    placeEll(
      neck.nose,
      add(add(hd.hc, scale(hd.fw, HEAD.nose.offFw * k)), scale(hd.up, HEAD.nose.offUp * k)),
      HEAD.nose.radii[0] * k,
      HEAD.nose.radii[1] * k,
      HEAD.nose.radii[2] * k,
      hd.q
    );
    const hx = rotate(hd.q, [1, 0, 0]);
    [1, -1].forEach((sgn, i) =>
      placeEll(
        neck.ears[i],
        add(add(hd.hc, scale(hx, sgn * HEAD.ear.offX * k)), scale(hd.fw, HEAD.ear.offFw * k)),
        HEAD.ear.radii[0] * k,
        HEAD.ear.radii[1] * k,
        HEAD.ear.radii[2] * k,
        hd.q
      )
    );
  };

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of Object.values(materials)) m.dispose();
    group.clear();
  };

  return { group, update, dispose, materials };
}
