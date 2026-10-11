import type * as Three from 'three';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
import type { DisplayTrack } from '@/lib/pitch-3d/v2/display';
import { MOUND } from '@/lib/pitch-3d/v2/pose-rig';

/**
 * 투구 3D 보기의 무대 — 메이저리그 · KBO 같은 야구장(낮 · 밤). 사람(뼈대 · 데생 인형)은 body-3d.tsx 가 그린다.
 *
 * 2026-10-11 김민: 사람(데생 인형)은 금윤호가, 무대는 김민이 같은 때 만들기로 해서 body-3d.tsx 에서 떼었다 — 무대를 바꿀 때는 이 파일만.
 * 정한 것(김민): 낮 · 밤 둘 다(화면 단추), 외야 펜스 · 관중석까지. 거리는 정식 규격(OBR 2.01 · 부록 그림):
 *   투수판 앞 → 홈플레이트 뒤 꼭짓점 18.44m · 베이스 사이 27.43m(2루는 홈에서 38.80m) · 내야 흙 경계 = 투수판 앞에서 반지름 28.96m(95ft) 호 ·
 *   홈 둘레 흙 반지름 3.96m(13ft) · 홈플레이트 43.2cm · 타석 1.22 × 1.83m(플레이트에서 15cm) · 파울선 10cm.
 *   펜스는 KBO 큰 구장 쯤(좌우 100m · 가운데 122m, 높이 3m), 경고 트랙 4.6m, 백스톱은 홈 뒤 16m.
 *
 * 좌표: 앱 3D 무대와 같다 — y 위, x 홈 쪽, z 오른쪽(투수가 홈을 볼 때), 키 = 1(displayTrack). 그래서 1루는 −z 쪽이다.
 * 바닥은 y = 0, 마운드만 track.groundAt(규격 경사). 평평한 바닥(마운드 없음)이면 투수판 자리를 몸 가운데 조금 뒤로 어림한다.
 * 땅에 붙은 층(잔디 → 흙 → 안쪽 잔디 → 둘레 흙 → 선)은 높이 대신 polygonOffset 으로 겹친다 — 멀리서 높이 차이로 가르면 깜빡였다.
 */

export type StageMode = 'day' | 'night';
export const STAGE_MODES: { value: StageMode; label: string }[] = [
  { value: 'day', label: '낮' },
  { value: 'night', label: '밤' },
];
export type StageHandle = {
  /** 카메라가 이만큼 멀리까지 그려야 관중석 · 하늘이 다 보인다 */
  cameraNear: number;
  cameraFar: number;
  setMode: (mode: StageMode) => void;
};

/* 규격(미터) */
const RUBBER_TO_PLATE = 18.44;
const BASE = 27.43;
const SECOND = 38.8;
const INFIELD_ARC = 28.96;
const HOME_CIRCLE = 3.96;
const BASE_CUT = 2.74;
const PLATE = 0.432;
const LINE = 0.1;
const FENCE_LINE = 100;
const FENCE_CENTER = 122;
const FENCE_H = 3;
const TRACK = 4.6;
const BACKSTOP = 16;
const FOUL_WALL_H = 1.2;
const SKY_R = 260;

const PALETTE = {
  day: {
    sky: ['#cfe4f5', '#3d7cc9'] as const,
    fog: '#cfe0ee',
    hemi: ['#e8f3ff', '#5d7d3e', 1.15] as const,
    sun: ['#fff3dc', 2.6] as const,
    fill: ['#dbe8ff', 0.5] as const,
    towers: 0,
    exposure: 1.0,
    panel: '#d9dde3',
  },
  night: {
    sky: ['#1a2238', '#04060c'] as const,
    fog: '#121a2c',
    hemi: ['#9fb3d9', '#1b2a14', 0.35] as const,
    sun: ['#c9d6ff', 0.15] as const,
    fill: ['#c9d6ff', 0.1] as const,
    towers: 0.8,
    exposure: 1.05,
    panel: '#ffffff',
  },
};

const COLORS = {
  grassA: '#4f8a3a',
  grassB: '#5f9c46',
  dirt: '#a8744a',
  track: '#946541',
  line: '#f4f4f0',
  wall: '#1d4a2c',
  wallTop: '#f2c230',
  foulWall: '#244a33',
  seat: '#22406f',
  seatAlt: '#7a2430',
  concrete: '#8c8f94',
  pole: '#f2c230',
  tower: '#5a5f66',
  outside: '#3b3e42',
};

/** 마운드 면 — 가운데에서 둘레까지 고리 40 · 둘레 120 칸, 높이는 f(규격 높이 함수) */
function moundGeometry(
  THREE: typeof import('three'),
  f: (x: number, z: number) => number,
  cx: number,
  cz: number,
  R: number
): Three.BufferGeometry {
  const rings = 40;
  const segs = 120;
  const lift = 0.002;
  const pos: number[] = [cx, f(cx, cz) + lift, cz];
  for (let i = 1; i <= rings; i++) {
    const r = (R * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = cx + r * Math.cos(a);
      const z = cz + r * Math.sin(a);
      pos.push(x, f(x, z) + lift, z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 캔버스 무늬(잔디 깎은 줄 · 관중) — 그림 파일 없이 */
function canvasTexture(
  THREE: typeof import('three'),
  w: number,
  h: number,
  paint: (c: CanvasRenderingContext2D) => void
): Three.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * 무대를 장면에 놓는다. center = 움직임 상자 가운데(카메라가 보는 곳), heightM = 투수 키(m).
 * 돌려준 setMode 로 낮 · 밤을 바꾼다(도형은 그대로, 하늘 · 빛 · 조명탑만).
 */
export function buildStage({
  THREE,
  scene,
  renderer,
  track,
  center,
  heightM,
  mode = 'day',
}: {
  THREE: typeof import('three');
  scene: Three.Scene;
  renderer: Three.WebGLRenderer;
  track: Pick<DisplayTrack, 'groundAt' | 'mound'>;
  center: Vec3;
  heightM: number;
  mode?: StageMode;
}): StageHandle {
  const s = 1 / heightM;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  /* ── 자리 잡기: 투수판 앞 모서리(x0, z0) → 홈 꼭짓점 H. f = 투수 · 가운데 쪽(−x), g = 1루 쪽(−z) ── */
  const { groundAt, mound } = track;
  const x0 = mound ? mound.x0 : center[0] - 0.4;
  const z0 = mound ? mound.z0 : center[2];
  const H = { x: x0 + RUBBER_TO_PLATE * s, z: z0 };
  /** 홈에서 거리 d(m) · 가운데 선에서 각 θ(1루 쪽 +) 인 땅 위 자리 */
  const at = (d: number, th: number, y = 0) =>
    V(H.x - d * s * Math.cos(th), y, H.z - d * s * Math.sin(th));
  /** 홈 기준 (가운데 쪽 a, 1루 쪽 b) 미터 */
  const fg = (a: number, b: number, y = 0) => V(H.x - a * s, y, H.z - b * s);
  const Q = Math.PI / 4;

  /* ── 땅 층: 같은 높이, polygonOffset 으로 차례 ── */
  const flat = (shape: Three.Shape, mat: Three.Material, order: number) => {
    const g = new THREE.ShapeGeometry(shape, 48);
    g.rotateX(-Math.PI / 2); // 모양 (x, y) → 땅 (x, −z), 면이 위를 본다
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = order;
    scene.add(m);
    return m;
  };
  const layered = (color: string, order: number, map?: Three.Texture) =>
    new THREE.MeshStandardMaterial({
      color: map ? '#ffffff' : color,
      map,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -order,
      polygonOffsetUnits: -order * 4,
    });
  /** 땅 위 점들(Vector3, y 무시) → 모양(x, −z) — 위 flat 이 −90° 돌려 땅에 눕힌다 */
  const shapeOf = (pts: Three.Vector3[]) => new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));

  /* 잔디 — 넓은 원 하나, 깎은 줄무늬(약 4.5m 폭) */
  const stripes = canvasTexture(THREE, 256, 256, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? COLORS.grassA : COLORS.grassB;
      c.fillRect(0, i * 32, 256, 32);
    }
    /* 잔결 */
    for (let i = 0; i < 2400; i++) {
      c.fillStyle = `rgba(${20 + Math.random() * 30},${60 + Math.random() * 50},${20 + Math.random() * 20},0.18)`;
      c.fillRect(Math.random() * 256, Math.random() * 256, 1, 2);
    }
  });
  const grassR = (FENCE_CENTER + 12) * s;
  const outside = new THREE.CircleGeometry(400 * s, 64);
  outside.rotateX(-Math.PI / 2);
  const outMesh = new THREE.Mesh(outside, layered(COLORS.outside, 0));
  outMesh.position.set(H.x - 40 * s, -0.01 * s, H.z);
  scene.add(outMesh);
  stripes.repeat.set((2 * grassR) / (36 * s), (2 * grassR) / (36 * s));
  stripes.rotation = Q;
  const grassGeo = new THREE.CircleGeometry(grassR, 96);
  grassGeo.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(grassGeo, layered(COLORS.grassA, 1, stripes));
  grass.position.set(H.x - 40 * s, 0, H.z);
  scene.add(grass);

  /* 내야 흙 — 투수판 앞에서 반지름 28.96m 호, 양쪽은 파울선 조금 밖(3°)까지 */
  const M = { a: RUBBER_TO_PLATE, b: 0 };
  const arc: Three.Vector3[] = [];
  for (let i = 0; i <= 120; i++) {
    const p = -Math.PI / 2 + (Math.PI * i) / 120;
    const a = M.a + INFIELD_ARC * Math.cos(p);
    const b = M.b + INFIELD_ARC * Math.sin(p);
    if (Math.abs(Math.atan2(b, a)) <= Q + (3 * Math.PI) / 180 && a > 0) arc.push(fg(a, b));
  }
  const dirtMat = layered(COLORS.dirt, 2);
  flat(shapeOf([fg(-0.6, 0), ...arc]), dirtMat, 2);

  /* 안쪽 잔디 — 베이스 사이 정사각형을 1.7m 안으로 */
  const C = { a: SECOND / 2, b: 0 };
  const k = (SECOND / 2 - 1.7) / (SECOND / 2);
  const corner = (a: number, b: number) => fg(C.a + (a - C.a) * k, C.b + (b - C.b) * k);
  const hd = BASE * Math.SQRT1_2;
  flat(
    shapeOf([corner(0, 0), corner(hd, hd), corner(SECOND, 0), corner(hd, -hd)]),
    layered(COLORS.grassA, 3, stripes),
    3
  );

  /* 둘레 흙 — 홈 · 1루 · 3루, 마운드가 없으면 투수판 둘레도 */
  const disc = (a: number, b: number, r: number) => {
    const pts: Three.Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      pts.push(fg(a + r * Math.cos(t), b + r * Math.sin(t)));
    }
    return shapeOf(pts);
  };
  const ringDirt = layered(COLORS.dirt, 4);
  flat(disc(0.2, 0, HOME_CIRCLE), ringDirt, 4);
  flat(disc(hd, hd, BASE_CUT), ringDirt, 4);
  flat(disc(hd, -hd, BASE_CUT), ringDirt, 4);
  if (!mound) flat(disc(RUBBER_TO_PLATE + 0.3, 0, 2.74), ringDirt, 4);

  /* 경고 트랙 — 펜스 안쪽 4.6m(가운데 쪽 땅) */
  const fenceR = (th: number) => FENCE_LINE + (FENCE_CENTER - FENCE_LINE) * Math.cos(2 * th);
  const outer: Three.Vector3[] = [];
  const inner: Three.Vector3[] = [];
  for (let i = 0; i <= 90; i++) {
    const th = -Q + (2 * Q * i) / 90;
    outer.push(at(fenceR(th), th));
    inner.push(at(fenceR(th) - TRACK, th));
  }
  flat(shapeOf([...outer, ...inner.reverse()]), layered(COLORS.track, 2), 2);

  /* ── 선 · 베이스 · 홈플레이트 ── */
  const lineMat = layered(COLORS.line, 6);
  const strip = (p: Three.Vector3, q: Three.Vector3, w: number) => {
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    const nx = (-dz / len) * (w / 2) * s;
    const nz = (dx / len) * (w / 2) * s;
    flat(
      shapeOf([V(p.x + nx, 0, p.z + nz), V(q.x + nx, 0, q.z + nz), V(q.x - nx, 0, q.z - nz), V(p.x - nx, 0, p.z - nz)]),
      lineMat,
      6
    );
  };
  strip(at(0, Q), at(FENCE_LINE, Q), LINE);
  strip(at(0, -Q), at(FENCE_LINE, -Q), LINE);
  /* 타석(양쪽) — 플레이트 옆 15cm, 1.22 × 1.83m 테두리 */
  for (const sg of [1, -1]) {
    const b0 = sg * (PLATE / 2 + 0.152);
    const b1 = sg * (PLATE / 2 + 0.152 + 1.22);
    const a0 = PLATE / 2 - 0.915;
    const a1 = PLATE / 2 + 0.915;
    strip(fg(a0, b0), fg(a1, b0), 0.076);
    strip(fg(a0, b1), fg(a1, b1), 0.076);
    strip(fg(a0, b0), fg(a0, b1), 0.076);
    strip(fg(a1, b0), fg(a1, b1), 0.076);
  }
  /* 홈플레이트 — 뒤 꼭짓점이 H, 앞변 43.2cm */
  const hp = 0.2155;
  flat(shapeOf([fg(0, 0), fg(hp, hp), fg(2 * hp, hp), fg(2 * hp, -hp), fg(hp, -hp)]), lineMat, 7);
  /* 베이스 — 38cm 흰 방석 */
  const bagMat = layered(COLORS.line, 9);
  const bagGeo = new THREE.BoxGeometry(0.381 * s, 0.08 * s, 0.381 * s);
  for (const [a, b] of [
    [hd, hd],
    [SECOND, 0],
    [hd, -hd],
  ]) {
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.copy(fg(a, b, 0.04 * s));
    bag.rotation.y = Q;
    scene.add(bag);
  }

  /* 마운드 · 투수판 — 흙색 */
  if (mound) {
    scene.add(
      new THREE.Mesh(
        moundGeometry(THREE, groundAt, mound.x0 + MOUND.centerAhead * s, mound.z0, MOUND.radius * s),
        layered(COLORS.dirt, 8)
      )
    );
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(MOUND.rubber.depth * s, 0.02 * s, MOUND.rubber.width * s),
      layered('#f4f2ec', 9)
    );
    rubber.position.set(mound.x0 - (MOUND.rubber.depth * s) / 2, groundAt(mound.x0, mound.z0) + 0.01 * s, mound.z0);
    scene.add(rubber);
  }

  /* ── 경기장 둘레(위에서 본 닫힌 선): 3루 폴 → 3루 쪽 파울 담장 → 백스톱 호 → 1루 쪽 → 1루 폴 → 외야 펜스 → 3루 폴 ── */
  type Edge = { p: Three.Vector3; wall: number; out: number };
  const loop: Edge[] = [];
  const foulOff = (a: number) => 16 * Math.min(1, Math.max(0, (FENCE_LINE - a) / 25));
  const along = (a: number, th: number, off: number) => {
    const n = th > 0 ? Q * 3 : -Q * 3; // 파울선 밖으로 수직(±135°)
    const p = at(a, th);
    return V(p.x - off * s * Math.cos(n), 0, p.z - off * s * Math.sin(n));
  };
  for (let a = FENCE_LINE; a >= 0; a -= 5) loop.push({ p: along(a, -Q, foulOff(a)), wall: FOUL_WALL_H, out: 1 });
  for (let i = 1; i < 24; i++) {
    const th = -3 * Q - ((2 * Q) * i) / 24; // −135° → −225°(= +135°), 홈 뒤
    loop.push({ p: at(BACKSTOP, th), wall: FOUL_WALL_H * 2, out: 1 });
  }
  for (let a = 0; a <= FENCE_LINE; a += 5) loop.push({ p: along(a, Q, foulOff(a)), wall: FOUL_WALL_H, out: 1 });
  for (let i = 1; i < 60; i++) {
    const th = Q - (2 * Q * i) / 60;
    loop.push({ p: at(fenceR(th), th), wall: FENCE_H, out: 0.7 });
  }
  const N = loop.length;
  /* 바깥쪽 수평 법선(가운데에서 먼 쪽) */
  const mid = fg(45, 0);
  const normals = loop.map((e, i) => {
    const a = loop[(i - 1 + N) % N].p;
    const b = loop[(i + 1) % N].p;
    let nx = b.z - a.z;
    let nz = -(b.x - a.x);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if ((e.p.x - mid.x) * nx + (e.p.z - mid.z) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { x: nx, z: nz };
  });

  /** 둘레를 따라 단면(바깥 거리 m, 높이 m) 줄을 이어 붙인 띠 — rows 는 안 → 밖 */
  const band = (rows: [number, number][], mat: Three.Material, scaleOut = true, uvRepeat = 1) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let run = 0;
    for (let i = 0; i <= N; i++) {
      const e = loop[i % N];
      const n = normals[i % N];
      if (i > 0) run += e.p.distanceTo(loop[(i - 1) % N].p) / s;
      const sc = scaleOut ? e.out : 1;
      rows.forEach(([d, h], r) => {
        pos.push(e.p.x + n.x * d * s, h * sc * s, e.p.z + n.z * d * s);
        uv.push((run / 40) * uvRepeat, r / (rows.length - 1));
      });
    }
    const R = rows.length;
    for (let i = 0; i < N; i++)
      for (let r = 0; r < R - 1; r++) {
        const a = i * R + r;
        const b = (i + 1) * R + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    scene.add(m);
    return m;
  };

  /* 담장(펜스 · 파울 담장) — 높이는 둘레마다 */
  {
    const pos: number[] = [];
    const idx: number[] = [];
    const top: number[] = [];
    for (let i = 0; i <= N; i++) {
      const e = loop[i % N];
      pos.push(e.p.x, 0, e.p.z, e.p.x, e.wall * s, e.p.z);
      top.push(e.p.x, e.wall * s, e.p.z, e.p.x, (e.wall + 0.15) * s, e.p.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
    const mk = (p: number[], color: string) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })));
    };
    mk(pos, COLORS.wall);
    mk(top, COLORS.wallTop);
  }
  /* 파울 폴 */
  for (const th of [Q, -Q]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 25 * s, 10),
      new THREE.MeshStandardMaterial({ color: COLORS.pole, roughness: 0.5 })
    );
    pole.position.copy(at(FENCE_LINE + 0.3, th, 12.5 * s));
    scene.add(pole);
  }

  /* 관중석 — 담장 뒤 층 둘(사이 통로), 관중 무늬 */
  const crowd = canvasTexture(THREE, 512, 256, (c) => {
    c.fillStyle = COLORS.seat;
    c.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 8) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, y + 6, 512, 2);
      for (let x = 0; x < 512; x += 5) {
        if (Math.random() < 0.55) {
          /* 사람: 대개 흰 · 회색 · 남색 옷, 가끔 팀 색 — 채도를 낮춰 멀리서 고르게 보이게 */
          const r = Math.random();
          c.fillStyle =
            r < 0.12
              ? `hsl(355,55%,${38 + Math.random() * 12}%)`
              : r < 0.2
                ? `hsl(215,45%,${30 + Math.random() * 12}%)`
                : `hsl(${200 + Math.random() * 30},${6 + Math.random() * 10}%,${35 + Math.random() * 45}%)`;
          c.fillRect(x + 1, y + 1, 3, 5);
        }
      }
    }
  });
  crowd.repeat.set(1, 3);
  const seatMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9, side: THREE.DoubleSide });
  const concrete = new THREE.MeshStandardMaterial({ color: COLORS.concrete, roughness: 0.95, side: THREE.DoubleSide });
  band([[0, 0], [0.01, FOUL_WALL_H], [1.5, FOUL_WALL_H]], concrete); // 담장 뒤 앞줄 바닥(담장 높이 그대로)
  band([[1.5, 1.6], [22, 11]], seatMat); // 아래층
  band([[22, 11], [25, 11], [25, 15]], concrete); // 통로 · 위층 앞벽
  band([[25, 15], [42, 27]], seatMat); // 위층
  band([[42, 27], [42, 31]], concrete); // 뒷벽

  /* 조명탑 — 관중석 뒤 여섯, 밤에 판이 빛난다 */
  const panelMat = new THREE.MeshStandardMaterial({ color: '#d9dde3', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.4 });
  const towerMat = new THREE.MeshStandardMaterial({ color: COLORS.tower, roughness: 0.7 });
  const towerLights: Three.DirectionalLight[] = [];
  for (const [d, th] of [
    [45, 2.1],
    [45, -2.1],
    [95, 1.05],
    [95, -1.05],
    [150, 0.45],
    [150, -0.45],
  ] as [number, number][]) {
    const base = at(d, th);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.7 * s, 48 * s, 8), towerMat);
    tower.position.set(base.x, 24 * s, base.z);
    scene.add(tower);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(9 * s, 5 * s, 0.8 * s), panelMat);
    panel.position.set(base.x, 49 * s, base.z);
    panel.lookAt(fg(40, 0, 0));
    scene.add(panel);
    const L = new THREE.DirectionalLight('#f0f4ff', 0);
    L.position.set(base.x, 49 * s, base.z);
    L.target.position.copy(fg(25, 0));
    scene.add(L, L.target);
    towerLights.push(L);
  }

  /* 하늘 — 큰 공 안쪽, 아래(지평) → 위 그러데이션 */
  const skyGeo = new THREE.SphereGeometry(SKY_R * s, 32, 16);
  const skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.position.set(H.x - 40 * s, 0, H.z);
  sky.renderOrder = -1;
  scene.add(sky);

  /* 빛 */
  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 1);
  sun.position.set(center[0] + 2.0, center[1] + 3.4, center[2] + 1.4); // 홈 · 3루 쪽 위 — 우투 옆 카메라(3루 쪽)에서 몸 앞이 밝게
  sun.target.position.set(center[0], center[1], center[2]);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#ffffff', 1);
  fill.position.set(center[0] - 1.6, center[1] + 1.0, center[2] + 1.2);
  scene.add(fill);
  scene.fog = new THREE.Fog('#ffffff', 90 * s, 240 * s);

  /* 축 화살표(빨강 홈 · 파랑 위 · 하늘 옆) — 분석용으로 남김 */
  const corner0 = new THREE.Vector3(center[0] - 1.7, 0.002, center[2] - 1.7);
  for (const [dir, color] of [
    [[1, 0, 0], '#ef4444'],
    [[0, 1, 0], '#3b82f6'],
    [[0, 0, 1], '#38bdf8'],
  ] as [[number, number, number], string][])
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(...dir), corner0, 0.35, color, 0.08, 0.04));

  const setMode = (m: StageMode) => {
    const P = PALETTE[m];
    const lo = new THREE.Color(P.sky[0]);
    const hi = new THREE.Color(P.sky[1]);
    const pos = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / (SKY_R * s));
      c.copy(lo).lerp(hi, Math.pow(t, 0.6));
      skyCol[i * 3] = c.r;
      skyCol[i * 3 + 1] = c.g;
      skyCol[i * 3 + 2] = c.b;
    }
    skyGeo.attributes.color.needsUpdate = true;
    scene.background = lo.clone();
    renderer.setClearColor(lo);
    (scene.fog as Three.Fog).color.set(P.fog);
    hemi.color.set(P.hemi[0]);
    hemi.groundColor.set(P.hemi[1]);
    hemi.intensity = P.hemi[2];
    sun.color.set(P.sun[0]);
    sun.intensity = P.sun[1];
    fill.color.set(P.fill[0]);
    fill.intensity = P.fill[1];
    for (const L of towerLights) L.intensity = P.towers;
    panelMat.emissiveIntensity = m === 'night' ? 2.5 : 0;
    panelMat.color.set(P.panel);
    renderer.toneMappingExposure = P.exposure;
  };
  setMode(mode);

  return { cameraNear: 0.03, cameraFar: (SKY_R + 80) * s, setMode };
}
