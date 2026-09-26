/**
 * 3D 근육 모델을 만든다 — 전신 근육 모델에서 가볍게.
 *
 *   node scripts/build-arm-model.mjs <원본 full-body-male-mobile.glb 경로>
 *     → public/models/armcare-upper.glb  (암케어 3D 근육 지도 — 상체만)
 *   node scripts/build-arm-model.mjs <원본 경로> --full
 *     → public/models/body-full.glb      (운동의 부위 태그를 누르면 뜨는 전신 그림)
 *   둘 다 public/models/ATTRIBUTION.txt 를 다시 쓴다(두 파일을 함께 적는다).
 *
 * 전신 모델은 2026-09-26 사용자분이 "암케어 말고 다른 운동 영상에도" 근육 그림을 붙여 달라고
 * 해서 더했다. 원본은 같은 파일이라 새로 받지 않았다. 전신은 아래 1·2 를 하지 않는다 —
 * 다리까지 모든 근육을 남긴다.
 *
 * 원본은 Fit Mit With 해부 모델(Z-Anatomy / BodyParts3D, CC BY-SA 4.0)이다 —
 * https://github.com/slfresh/fitmitwith-anatomy-atlas 의 models/full-body-male-mobile.glb
 * (커밋 4120ee68, SHA-256 아래 SOURCE_SHA256). 2026-09-26 사용자분 허락을 받고 받았다.
 * 원본은 저장소에 넣지 않는다 — 다시 만들 때 위 주소에서 받아 경로를 넘긴다.
 *
 * 하는 일 (도구를 설치하지 않으려고 glTF 를 직접 읽고 쓴다):
 *   1. 상체 근육(어깨·팔·아래팔·등·가슴·목·배)과 뼈대, 머리·손만 남긴다. 다리 근육과
 *      결합 조직은 뺀다. 양쪽 팔을 다 남긴다 — 왼손 투수는 왼팔을 켠다.
 *   2. 팔꿈치 높이 아래에서 몸통 쪽에 있는 삼각형(골반·다리)을 지운다. 팔뚝과 손은 몸
 *      바깥쪽이라 남는다. 경계를 걸친 삼각형은 남기고, 깨끗한 단면은 화면이 자르는 면으로
 *      만든다(muscle-map.tsx) — 여기서는 받는 양만 줄인다.
 *   3. 쓰지 않는 꼭짓점을 버리고, 법선(빛 계산용 방향)을 4바이트 정수로 줄인다
 *      (KHR_mesh_quantization — three 가 읽는다). 재질은 버린다 — 화면이 색을 입힌다.
 *
 * 근육 이름표(extras: muscleId · key · side · region …)는 그대로 둔다. 화면은 이것으로
 * 우리 근육 이름(lib/armcare/muscle-map.ts)을 찾는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCE_SHA256 =
  'd80bebc4045069b660ca8e7afe599d76d15ccc7d96410b3727c600ef01d24e54';
const SOURCE_URL =
  'https://github.com/slfresh/fitmitwith-anatomy-atlas/blob/4120ee68b6604b8f2f69105d6de6166fad4734c4/models/full-body-male-mobile.glb';

/** 남기는 근육 부위 (원본 extras.region) */
const UPPER = new Set([
  'shoulder',
  'arms',
  'forearms',
  'back',
  'chest',
  'neck',
  'core',
]);
/** 근육이 아닌 것 중 남기는 것 (원본 이름 앞부분) */
const SUPPORT = ['skeleton', 'head_hands_feet'];

const args = process.argv.slice(2);
/** 전신 — 다리까지 모든 근육을 남기고 자르지 않는다 */
const FULL = args.includes('--full');
const src = args.find((a) => !a.startsWith('--'));
if (!src) {
  console.log(
    '사용법: node scripts/build-arm-model.mjs <full-body-male-mobile.glb 경로> [--full]'
  );
  process.exit(1);
}
const file = readFileSync(src);
const sha = createHash('sha256').update(file).digest('hex');
if (sha !== SOURCE_SHA256) {
  console.log(`원본이 다릅니다 (SHA-256 ${sha}). 위 주소의 파일인지 확인하세요.`);
  process.exit(1);
}

/* ── GLB 읽기 ───────────────────────────────────────────────────────── */
const jsonLen = file.readUInt32LE(12);
const gltf = JSON.parse(file.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = file.subarray(binStart, binStart + file.readUInt32LE(20 + jsonLen));

function read(accessorIndex) {
  const a = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[a.bufferView];
  const width = { SCALAR: 1, VEC3: 3 }[a.type];
  const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const count = a.count * width;
  const bytes = bin.subarray(
    offset,
    offset + count * (a.componentType === 5126 ? 4 : 2)
  );
  const copy = new Uint8Array(bytes).buffer; /* 정렬을 맞추려고 복사한다 */
  if (a.componentType === 5126) return new Float32Array(copy);
  if (a.componentType === 5123) return new Uint16Array(copy);
  throw new Error(`모르는 형식 ${a.componentType}`);
}

const nodes = gltf.nodes.map((n) => {
  const prim = gltf.meshes[n.mesh].primitives[0];
  return {
    name: n.name,
    extras: n.extras,
    positions: read(prim.attributes.POSITION),
    normals: read(prim.attributes.NORMAL),
    indices: read(prim.indices),
  };
});

/* ── 자를 자리 — 원본에서 잰다 ──────────────────────────────────────── */
function box(filter) {
  const b = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const n of nodes.filter(filter)) {
    for (let i = 0; i < n.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        b.min[k] = Math.min(b.min[k], n.positions[i + k]);
        b.max[k] = Math.max(b.max[k], n.positions[i + k]);
      }
    }
  }
  return b;
}
const region = (side, r) => (n) => n.extras?.side === side && n.extras?.region === r;
const upperArms = [box(region('right', 'arms')), box(region('left', 'arms'))];
const forearmR = box(region('right', 'forearms'));
const forearmL = box(region('left', 'forearms'));
/* 사람의 왼쪽이 +X 다 — 오른팔 아래팔의 안쪽 가장자리는 max.x, 왼팔은 min.x */
const waistY = Math.min(upperArms[0].min[1], upperArms[1].min[1]) - 0.06;
const bandFrom = forearmR.max[0] + 0.015;
const bandTo = forearmL.min[0] - 0.015;
const floorY = Math.min(forearmR.min[1], forearmL.min[1]) - 0.3;

const cut = (x, y) =>
  !FULL && (y < floorY || (y < waistY && x > bandFrom && x < bandTo));

/* ── 남길 것 고르고 다듬기 ──────────────────────────────────────────── */
const kept = [];
let droppedTris = 0;
for (const n of nodes) {
  const isMuscle = n.extras?.muscleId != null;
  const keep = isMuscle
    ? FULL || UPPER.has(n.extras.region)
    : SUPPORT.some((s) => n.name.startsWith(s));
  if (!keep) continue;

  const p = n.positions;
  const tris = [];
  for (let t = 0; t < n.indices.length; t += 3) {
    const vs = [n.indices[t], n.indices[t + 1], n.indices[t + 2]];
    if (vs.every((v) => cut(p[v * 3], p[v * 3 + 1]))) {
      droppedTris++;
      continue;
    }
    tris.push(...vs);
  }
  if (tris.length === 0) continue;

  /* 쓰는 꼭짓점만 새 번호로 */
  const remap = new Map();
  for (const v of tris) if (!remap.has(v)) remap.set(v, remap.size);
  const positions = new Float32Array(remap.size * 3);
  const normals = new Int8Array(remap.size * 4); /* x y z + 빈 칸 (4바이트 맞춤) */
  for (const [from, to] of remap) {
    for (let k = 0; k < 3; k++) {
      positions[to * 3 + k] = p[from * 3 + k];
      const nk = Math.max(-1, Math.min(1, n.normals[from * 3 + k]));
      normals[to * 4 + k] = Math.round(nk * 127);
    }
  }
  const indices = new Uint16Array(tris.map((v) => remap.get(v)));
  kept.push({ name: n.name, extras: n.extras, positions, normals, indices });
}

/* ── GLB 쓰기 ───────────────────────────────────────────────────────── */
const chunks = [];
let length = 0;
const bufferViews = [];
const accessors = [];
function addView(bytes, target, byteStride) {
  const pad = (4 - (length % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    length += pad;
  }
  bufferViews.push({
    buffer: 0,
    byteOffset: length,
    byteLength: bytes.byteLength,
    ...(byteStride ? { byteStride } : {}),
    target,
  });
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  length += bytes.byteLength;
  return bufferViews.length - 1;
}

const meshes = [];
const outNodes = [];
for (const k of kept) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < k.positions.length; i += 3) {
    for (let d = 0; d < 3; d++) {
      min[d] = Math.min(min[d], k.positions[i + d]);
      max[d] = Math.max(max[d], k.positions[i + d]);
    }
  }
  const count = k.positions.length / 3;
  accessors.push({
    bufferView: addView(k.positions, 34962),
    componentType: 5126,
    count,
    type: 'VEC3',
    min,
    max,
  });
  const pos = accessors.length - 1;
  accessors.push({
    bufferView: addView(k.normals, 34962, 4),
    componentType: 5120,
    normalized: true,
    count,
    type: 'VEC3',
  });
  const nor = accessors.length - 1;
  accessors.push({
    bufferView: addView(k.indices, 34963),
    componentType: 5123,
    count: k.indices.length,
    type: 'SCALAR',
  });
  const idx = accessors.length - 1;
  meshes.push({
    name: k.name,
    primitives: [{ attributes: { POSITION: pos, NORMAL: nor }, indices: idx, mode: 4 }],
  });
  outNodes.push({ name: k.name, mesh: meshes.length - 1, extras: k.extras });
}
const tail = (4 - (length % 4)) % 4;
if (tail) {
  chunks.push(Buffer.alloc(tail));
  length += tail;
}

const out = {
  asset: {
    version: '2.0',
    generator: 'Bullpen Log scripts/build-arm-model.mjs',
    copyright:
      'Z-Anatomy / BodyParts3D (Fit Mit With adaptation) — CC BY-SA 4.0 — adapted by Bullpen Log',
  },
  extensionsUsed: ['KHR_mesh_quantization'],
  extensionsRequired: ['KHR_mesh_quantization'],
  scene: 0,
  scenes: [
    {
      name: FULL ? 'Bullpen Log full body' : 'Bullpen Log armcare upper body',
      nodes: outNodes.map((_, i) => i),
    },
  ],
  nodes: outNodes,
  meshes,
  accessors,
  bufferViews,
  buffers: [{ byteLength: length }],
};

let json = Buffer.from(JSON.stringify(out), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binChunk = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binChunk.length, 8);
const jsonHead = Buffer.alloc(8);
jsonHead.writeUInt32LE(json.length, 0);
jsonHead.write('JSON', 4, 'ascii');
const binHead = Buffer.alloc(8);
binHead.writeUInt32LE(binChunk.length, 0);
binHead.write('BIN\0', 4, 'ascii');
const glb = Buffer.concat([header, jsonHead, json, binHead, binChunk]);

const dir = new URL('../public/models/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(FULL ? 'body-full.glb' : 'armcare-upper.glb', dir), glb);

writeFileSync(
  new URL('ATTRIBUTION.txt', dir),
  `BULLPEN LOG — 3D MUSCLE MAP MODELS (armcare-upper.glb, body-full.glb)

These model files are Adapted Material licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license:
https://creativecommons.org/licenses/by-sa/4.0/
Only these model files are CC BY-SA; the rest of Bullpen Log is licensed separately.

CREDITS (wording requested by the licensors)

  "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0"
  https://github.com/Z-Anatomy/Models-of-human-anatomy

  "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"
  https://creativecommons.org/licenses/by-sa/2.1/jp/

  "BodyParts3D, (c) The Database Center for Life Science licensed under
  CC Attribution 4.0 International"
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html

  Mobile muscle atlas adaptation: Fit Mit With anatomy atlas (CC BY-SA 4.0)
  https://github.com/slfresh/fitmitwith-anatomy-atlas

SOURCE

  ${SOURCE_URL}
  SHA-256 ${SOURCE_SHA256}

CHANGES MADE (scripts/build-arm-model.mjs)

  armcare-upper.glb
  - Kept only the upper-body muscles (shoulder, arms, forearms, back, chest,
    neck, core), the skeleton and the head/hands context mesh. Removed leg
    muscles and connective tissue.
  - Removed triangles below elbow height inside the torso band (pelvis, legs).

  body-full.glb (--full)
  - Kept all muscles, the skeleton and the head/hands/feet context mesh.
    Removed connective tissue. Nothing is cut away.

  Both
  - Removed unused vertices, quantized normals to 8-bit (KHR_mesh_quantization)
    and removed materials. Muscle IDs and labels (glTF node extras) are kept.
  - The geometry has not been reviewed by an anatomy specialist.
`
);

console.log(
  `남긴 것 ${kept.length}개 · 지운 삼각형 ${droppedTris}개 · ${(glb.length / 1024).toFixed(0)} KB (원본 ${(file.length / 1024).toFixed(0)} KB)`
);
console.log(
  `자른 자리: 허리 y<${waistY.toFixed(3)}, 몸통 x ${bandFrom.toFixed(3)}~${bandTo.toFixed(3)}, 바닥 y<${floorY.toFixed(3)}`
);
