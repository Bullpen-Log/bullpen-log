/**
 * 해부학 뼈대를 부위 15조각으로 — public/models/body-full.glb 의 skeleton__mobile.001(정점 21,526 · 이어진 조각 273)을
 * 조각(이어진 삼각형 묶음)마다 하나의 부위에 넣고, 부위의 뼈 자리(관절 기준점)와 함께 public/models/skeleton-parts.json 에 적는다.
 * 모델 파일은 바꾸지 않는다(사용권 표기 ATTRIBUTION.txt 에 이 방법을 적었다). 보기 화면(app/(app)/videos/lab/body-3d.tsx)이 이 표로
 * 뼈대 메시를 부위별로 갈라 맞춘 관절에 붙인다(설계 pitch-3d-quality.md 0절).
 *
 *   node scripts/pitch-lab/skeleton-parts.mjs            표를 만들고 부위별 조각 수를 찍는다
 *
 * 모델 좌표: 미터, y 위, +x 왼쪽(모델의 왼손이 +x), +z 앞. 서 있는 자세(팔 내림). 키 1.706.
 * 부위 나눔은 조각 중심의 높이 띠 · 좌우 · 몸통 폭으로(근육 메시 자리로 잰 관절 높이 — 아래 ANCHORS).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const GLB = resolve(ROOT, 'public/models/body-full.glb');
const OUT = resolve(ROOT, 'public/models/skeleton-parts.json');
const MESH_NAME = 'skeleton__mobile.001';

/* 관절 기준점(모델 좌표) — 근육 메시(gluteus medius · popliteus · soleus · deltoid · anconeus · pronator quadratus · sternocleidomastoid)의 자리로 어림 */
const X = 0.09; // 고관절 · 무릎 · 발목의 좌우 간격 절반
const ANCHORS = {
  pelvis: [0, 0.93, -0.03],
  l5: [0, 0.99, -0.05],
  c7: [0, 1.43, -0.04],
  earMid: [0, 1.6, -0.02],
  headTop: [0, 1.7, -0.02],
  hip: [X, 0.9, -0.01],
  knee: [X, 0.44, -0.02],
  ankle: [X, 0.075, -0.02],
  heel: [X, 0.02, -0.07],
  toe: [X, 0.02, 0.12],
  shoulder: [0.19, 1.37, -0.03],
  elbow: [0.225, 1.08, -0.02],
  wrist: [0.25, 0.87, 0.01],
  handTip: [0.25, 0.68, 0.02],
};
/* 띠 경계(높이) */
const Y_NECK = 1.445; // 이 위 = 머리(목뼈 포함)
const Y_L5 = 0.985; // 몸통 ↔ 골반(엉치뼈 위 끝)
const Y_PELVIS_LOW = 0.78; // 골반 아래 끝(넙다리뼈 머리는 중심이 더 아래라 넙다리로 간다)
const Y_KNEE = 0.47; // 넙다리 ↔ 정강이(무릎뼈는 중심 0.455 라 정강이로)
const Y_ANKLE = 0.1; // 정강이 ↔ 발
const Y_ELBOW = 1.07; // 위팔 ↔ 아래팔
const Y_WRIST = 0.885; // 아래팔 ↔ 손
const X_TRUNK = 0.16; // 이 밖(좌우)은 팔

const PARTS = [
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
];

function partOf([x, y]) {
  const side = x >= 0 ? 'L' : 'R';
  if (Math.abs(x) >= X_TRUNK && y > Y_ANKLE + 0.3) {
    if (y > Y_ELBOW) return 'upperArm' + side;
    if (y > Y_WRIST) return 'forearm' + side;
    return 'hand' + side;
  }
  if (y > Y_NECK) return 'head';
  if (y > Y_L5) return 'trunk';
  if (y > Y_PELVIS_LOW) return 'pelvis';
  if (y > Y_KNEE) return 'thigh' + side;
  if (y > Y_ANKLE) return 'shank' + side;
  return 'foot' + side;
}

/* ── glb 읽기 ── */
const buf = readFileSync(GLB);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binOff = 20 + jsonLen + 8;
function accessor(i) {
  const a = gltf.accessors[i];
  const bv = gltf.bufferViews[a.bufferView];
  const comp = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[
    a.componentType
  ];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const off = binOff + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || comp * n;
  const out = [];
  for (let k = 0; k < a.count; k++) {
    const base = off + k * stride;
    const row = [];
    for (let c = 0; c < n; c++) {
      const p = base + c * comp;
      row.push(
        a.componentType === 5126
          ? buf.readFloatLE(p)
          : a.componentType === 5125
            ? buf.readUInt32LE(p)
            : a.componentType === 5123
              ? buf.readUInt16LE(p)
              : buf.readUInt8(p)
      );
    }
    out.push(n === 1 ? row[0] : row);
  }
  return out;
}
const node = gltf.nodes.find((n) => n.name === MESH_NAME);
if (!node) throw new Error(`${MESH_NAME} 이 없다`);
const prim = gltf.meshes[node.mesh].primitives[0];
const pos = accessor(prim.attributes.POSITION);
const idx = accessor(prim.indices);

/* ── 이어진 조각(union-find) ── */
const parent = new Int32Array(pos.length).map((_, i) => i);
const find = (x) => {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]];
    x = parent[x];
  }
  return x;
};
for (let t = 0; t < idx.length; t += 3) {
  const a = find(idx[t]);
  const b = find(idx[t + 1]);
  const c = find(idx[t + 2]);
  parent[a] = b;
  parent[find(b)] = c;
}
const comps = new Map();
for (let i = 0; i < pos.length; i++) {
  const r = find(i);
  if (!comps.has(r)) comps.set(r, []);
  comps.get(r).push(i);
}

/* ── 조각 → 부위 ── */
const vertexPart = new Uint8Array(pos.length);
const count = Object.fromEntries(PARTS.map((p) => [p, 0]));
const verts = Object.fromEntries(PARTS.map((p) => [p, 0]));
for (const ids of comps.values()) {
  const c = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) c[k] += pos[i][k] / ids.length;
  const part = partOf(c);
  const pi = PARTS.indexOf(part);
  for (const i of ids) vertexPart[i] = pi;
  count[part]++;
  verts[part] += ids.length;
}
console.log(`조각 ${comps.size} · 정점 ${pos.length} · 삼각형 ${idx.length / 3}`);
const bbox = Object.fromEntries(
  PARTS.map((p) => [
    p,
    [
      [1e9, 1e9, 1e9],
      [-1e9, -1e9, -1e9],
    ],
  ])
);
for (let i = 0; i < pos.length; i++) {
  const b = bbox[PARTS[vertexPart[i]]];
  for (let k = 0; k < 3; k++) {
    b[0][k] = Math.min(b[0][k], pos[i][k]);
    b[1][k] = Math.max(b[1][k], pos[i][k]);
  }
}
const f3 = (v) => v.map((x) => x.toFixed(3)).join(',');
for (const p of PARTS)
  console.log(
    `  ${p.padEnd(10)} 조각 ${String(count[p]).padStart(3)} · 정점 ${String(verts[p]).padStart(5)} · 상자 [${f3(bbox[p][0])}] ~ [${f3(bbox[p][1])}]`
  );
const expect = {
  pelvis: [3, 5],
  trunk: [40, 80],
  head: [6, 90],
  upperArmL: [1, 1],
  upperArmR: [1, 1],
  forearmL: [2, 2],
  forearmR: [2, 2],
  handL: [26, 28],
  handR: [26, 28],
  thighL: [1, 1],
  thighR: [1, 1],
  shankL: [3, 3],
  shankR: [3, 3],
  footL: [26, 29],
  footR: [26, 29],
};
let bad = 0;
for (const [p, [lo, hi]] of Object.entries(expect))
  if (count[p] < lo || count[p] > hi) {
    console.log(`  ! ${p}: 조각 ${count[p]} (기대 ${lo}~${hi})`);
    bad++;
  }
if (bad) {
  console.error('부위 나눔이 기대와 다르다 — 경계를 확인할 것');
  process.exit(1);
}

const mirror = ([x, y, z]) => [-x, y, z];
const LEFT = [1, 0, 0];
const RIGHT = [-1, 0, 0];
const out = {
  _comment:
    'body-full.glb 의 skeleton__mobile.001 을 부위 15조각으로 나눈 표(scripts/pitch-lab/skeleton-parts.mjs 가 만든다 — 손으로 고치지 않는다). vertexPart 는 정점마다 부위 번호(parts 차례) base64 Uint8Array. 좌표는 모델 좌표(미터 · y 위 · +x 왼쪽 · +z 앞).',
  version: 1,
  mesh: MESH_NAME,
  height: 1.706,
  parts: PARTS,
  /* 부위마다 붙는 자리(가까운 쪽 proximal)와 축 끝(먼 쪽 distal) — 보기 화면이 축 · 기준 방향으로 자세를 잡는다 */
  /*
   * 부위마다 붙는 자리(가까운 쪽 proximal) · 축 끝(먼 쪽 distal) · 기준 방향(ref, 모델 좌표) — 보기 화면(lib/pitch-3d/v2/pose-rig.ts)이
   * 축 · 기준으로 자세를 잡는다. 기준: 몸통 · 머리 · 골반 = 왼쪽(+x), 팔 = 팔꿈치 굽힘 축(팔을 내리고 앞으로 굽힐 때 위팔 × 아래팔 = −x),
   * 다리 = 무릎 굽힘 축(넙다리 × 정강이 = +x), 발 = 정강이 × 발(−x), 손 = 둘째 → 다섯째 MCP(모델은 해부학 자세 · 손바닥 앞: 왼손 −x · 오른손 +x —
   * 왼손 엄지 조각이 +x · 앞(z 0.05~0.07)에 있는 것으로 확인, 2026-10-08).
   */
  anchors: {
    pelvis: {
      proximal: ANCHORS.pelvis,
      distal: ANCHORS.l5,
      ref: LEFT,
      hipL: ANCHORS.hip,
      hipR: mirror(ANCHORS.hip),
    },
    trunk: {
      proximal: ANCHORS.l5,
      distal: ANCHORS.c7,
      ref: LEFT,
      shoulderL: ANCHORS.shoulder,
      shoulderR: mirror(ANCHORS.shoulder),
    },
    head: {
      proximal: ANCHORS.c7,
      distal: ANCHORS.headTop,
      ref: LEFT,
      earMid: ANCHORS.earMid,
    },
    upperArmL: { proximal: ANCHORS.shoulder, distal: ANCHORS.elbow, ref: RIGHT },
    upperArmR: {
      proximal: mirror(ANCHORS.shoulder),
      distal: mirror(ANCHORS.elbow),
      ref: RIGHT,
    },
    forearmL: { proximal: ANCHORS.elbow, distal: ANCHORS.wrist, ref: RIGHT },
    forearmR: {
      proximal: mirror(ANCHORS.elbow),
      distal: mirror(ANCHORS.wrist),
      ref: RIGHT,
    },
    handL: { proximal: ANCHORS.wrist, distal: ANCHORS.handTip, ref: RIGHT },
    handR: {
      proximal: mirror(ANCHORS.wrist),
      distal: mirror(ANCHORS.handTip),
      ref: LEFT,
    },
    thighL: { proximal: ANCHORS.hip, distal: ANCHORS.knee, ref: LEFT },
    thighR: { proximal: mirror(ANCHORS.hip), distal: mirror(ANCHORS.knee), ref: LEFT },
    shankL: { proximal: ANCHORS.knee, distal: ANCHORS.ankle, ref: LEFT },
    shankR: {
      proximal: mirror(ANCHORS.knee),
      distal: mirror(ANCHORS.ankle),
      ref: LEFT,
    },
    footL: {
      proximal: ANCHORS.ankle,
      distal: ANCHORS.toe,
      ref: RIGHT,
      heel: ANCHORS.heel,
    },
    footR: {
      proximal: mirror(ANCHORS.ankle),
      distal: mirror(ANCHORS.toe),
      ref: RIGHT,
      heel: mirror(ANCHORS.heel),
    },
  },
  vertexCount: pos.length,
  vertexPart: Buffer.from(vertexPart).toString('base64'),
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`썼다: ${OUT} (${Math.round(JSON.stringify(out).length / 1024)}KB)`);
