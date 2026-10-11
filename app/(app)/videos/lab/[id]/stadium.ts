import type * as Three from 'three';

/**
 * 다저스타디움을 본뜬 구장 건물(로고 없음) — stage.ts 가 부른다. 경기장 바닥 · 하늘 · 빛은 stage.ts.
 *
 * 2026-10-11 김민: "다저스타디움처럼 실제처럼, 로고만 빼고". 참고한 것(위키백과 · Baseball Data Hub · LA Conservancy · SABR):
 *   - 본 관중석: 파울 폴 쪽부터 홈 뒤를 지나 반대쪽까지 이어진 층, 아래부터 노랑(필드) · 주황(로지) · 클럽 · 파랑(리저브) · 하늘색(톱 덱) —
 *     바다에 비친 노을 빛을 본뜬 배색. 기둥 없이 앞으로 튀어나온 층, 맨 위는 곡선 콘크리트 지붕(위에 조명). 층마다 투수 쪽을 보게 휜다.
 *   - 외야석(파빌리온): 좌우에 하나씩, 펜스에서 3m 물러나 있고, 지붕이 지그재그로 접힌 쇠판, 위에 육각형 전광판.
 *   - 둘레: 야자수 · 언덕(엘리시안 파크) — 먼 산은 stage.ts 하늘에.
 * 치수는 사진 · 자료로 어림한 값이다(층 높이 · 깊이). 모양이 먼저, 정확한 실측은 나중에.
 *
 * 좌표: 미터로 짓고 마지막에 무대 좌표(키 = 1)로 바꾼다. 경기장 틀 (a, b) — a = 홈에서 가운데 쪽, b = 1루 쪽(stage.ts fg 와 같다).
 */

export type FieldFrame = {
  THREE: typeof import('three');
  scene: Three.Scene;
  /** (a, b, y) 미터 → 무대 좌표 */
  fg: (a: number, b: number, y?: number) => Three.Vector3;
  /** 무대 단위 / 미터 */
  s: number;
  /** 외야 펜스까지 거리(m) — 가운데 선에서 각 θ(1루 쪽 +) */
  fenceR: (th: number) => number;
};

/* ───────────── 다저스타디움 규격(m) — 땅 재질(stage.ts FIELD_GLSL)도 같은 식을 쓴다 ───────────── */

/** 백스톱(홈 뒤 꼭짓점에서) — 55ft */
export const BACKSTOP_R = 16.8;
/**
 * 외야 펜스까지(홈에서) — 좌우 330ft 100.6 · 375ft 114.3(가운데에서 22.5°) · 360ft 110(30°) · 가운데 400ft 122.
 * t = |θ| / 45° 의 삼차식 122 − 40.2t² + 18.8t³ 이 네 점을 0.3m 안으로 지난다(좌우 같다).
 */
export function fenceDist(th: number): number {
  const t = Math.min(1, Math.abs(th) / (Math.PI / 4));
  return 122 - 40.2 * t * t + 18.8 * t * t * t;
}
/** 펜스 높이 — 폴 근처 4ft(1.2m), 나머지 8ft(2.4m) */
export function wallHeight(th: number): number {
  const t = Math.min(1, Math.abs(th) / (Math.PI / 4));
  return 2.4 - 1.2 * Math.min(1, Math.max(0, (t - 0.72) / 0.1));
}
/** 파울 지역 폭(파울선에서 관중석 앞 벽까지) — 홈 · 베이스 쪽 16.8m, 폴로 갈수록 좁아져 폴에서 1m */
export function foulOff(a: number): number {
  const u = Math.min(1, Math.max(0, (a - 42) / (100.6 - 42)));
  return 1 + (BACKSTOP_R - 1) * (1 - u * u * (3 - 2 * u));
}

type P2 = { a: number; b: number };
/** 둘레 선의 한 점 — 자리 · 바깥(경기장에서 먼 쪽) 법선 · 처음부터의 길이(m) · 파울선을 따라 간 거리(층 끝 자르기) */
type PathPt = P2 & { na: number; nb: number; len: number; reach: number };

/* 층 색 — 구장 안 층 안내판(필드 겨자 · 로지 살구 · 클럽 남색 · 리저브 청록 · 톱 덱 파랑)과 사진의 의자 색. 외야석은 바랜 나무색 벤치 */
const SEAT = {
  field: '#d9ac43',
  loge: '#ee9864',
  club: '#26407e',
  reserve: '#3f9485',
  top: '#5e9fd0',
  pavilion: '#c8b58e',
};
/** 펜스 · 관중석 앞 벽 — 연한 하늘빛 회색 쿠션(사진) */
export const WALL_BLUE = '#8fa8c0';
const CONCRETE = '#cdc7bb';
const FASCIA = '#ece9e2';

/** 둘레 점들 → 길이 · 법선(가운데 c 에서 먼 쪽) */
function toPath(pts: (P2 & { reach: number })[], c: P2): PathPt[] {
  const out: PathPt[] = [];
  let len = 0;
  pts.forEach((p, i) => {
    const q = pts[Math.max(0, i - 1)];
    const r = pts[Math.min(pts.length - 1, i + 1)];
    if (i > 0) len += Math.hypot(p.a - q.a, p.b - q.b);
    let na = r.b - q.b;
    let nb = -(r.a - q.a);
    const l = Math.hypot(na, nb) || 1;
    na /= l;
    nb /= l;
    if ((p.a - c.a) * na + (p.b - c.b) * nb < 0) {
      na = -na;
      nb = -nb;
    }
    out.push({ ...p, na, nb, len });
  });
  return out;
}

/** 같은 간격(m)으로 다시 찍기 — 지그재그 지붕 · 조명처럼 일정한 간격이 필요한 것 */
function resample(path: PathPt[], step: number): PathPt[] {
  const total = path[path.length - 1].len;
  const out: PathPt[] = [];
  let j = 0;
  for (let d = 0; d <= total + 1e-6; d += step) {
    while (j < path.length - 2 && path[j + 1].len < d) j++;
    const p = path[j];
    const q = path[j + 1];
    const t = Math.min(1, Math.max(0, (d - p.len) / Math.max(1e-6, q.len - p.len)));
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const na = lerp(p.na, q.na);
    const nb = lerp(p.nb, q.nb);
    const l = Math.hypot(na, nb) || 1;
    out.push({ a: lerp(p.a, q.a), b: lerp(p.b, q.b), na: na / l, nb: nb / l, len: d, reach: lerp(p.reach, q.reach) });
  }
  return out;
}

type Kind = 'seat' | 'back' | 'riser' | 'fascia' | 'ribbon' | 'pad' | 'under' | 'outer' | 'wall' | 'roof' | 'roofUnder';
/** 위층 바닥판 두께(m) — 앞에서 보면 흰 띠(+ 띠 전광판) */
const SLAB = 1.1;
/** 단면(바깥 거리 w, 높이 z) 선분들 — 선분마다 종류(재질) · 그늘(1 = 그대로, 위층 밑은 어둡게 — 그림자 대신 미리 구운 값) */
type Seg = { w0: number; z0: number; w1: number; z1: number; kind: Kind; shade?: number };

/**
 * 층 단면 — 앞 벽(흰 띠, 맨 아래 층은 파란 쿠션 벽) · 계단식 줄(앉는 판 + 등판 + 계단 벽) · 뒤 벽 · 아래판(튀어나온 층 밑면).
 * w0 · z0 = 첫 줄 바닥, w1 · z1 = 마지막 줄 바닥. under = 밑면을 그릴지(맨 아래 층은 땅 위라 없음).
 * cover = 바로 위층이 시작하는 바깥 거리 — 그 뒤 줄은 위층 밑이라 해 · 하늘빛이 덜 든다(깊을수록 어둡게).
 */
function deckProfile(
  w0: number,
  z0: number,
  w1: number,
  z1: number,
  {
    under,
    cover = Infinity,
    wallH = 3,
    ribbon = false,
    outer = true,
  }: { under: boolean; cover?: number; wallH?: number; ribbon?: boolean; outer?: boolean }
): Seg[] {
  const segs: Seg[] = [];
  const slab = SLAB;
  const shadeAt = (w: number) => 1 - 0.55 * Math.min(1, Math.max(0, (w - cover + 1) / 7));
  if (!under) segs.push({ w0: w0, z0: 0, w1: w0, z1: z0 + 1.0, kind: 'pad' });
  else if (ribbon) {
    segs.push({ w0: w0, z0: z0 - slab, w1: w0, z1: z0 - 0.1, kind: 'fascia' });
    segs.push({ w0: w0, z0: z0 - 0.1, w1: w0, z1: z0 + 1.0, kind: 'ribbon' });
  } else segs.push({ w0: w0, z0: z0 - slab, w1: w0, z1: z0 + 1.0, kind: 'fascia' });
  segs.push({ w0: w0, z0: z0 + 1.0, w1: w0 + 0.3, z1: z0 + 1.0, kind: 'fascia' });
  segs.push({ w0: w0 + 0.3, z0: z0 + 1.0, w1: w0 + 0.3, z1: z0, kind: 'riser' });
  const n = Math.max(2, Math.round((w1 - w0 - 0.3) / 0.86));
  const d = (w1 - w0 - 0.3) / n;
  const rise = (z1 - z0) / n;
  let w = w0 + 0.3;
  let z = z0;
  for (let i = 0; i < n; i++) {
    const shade = shadeAt(w + d / 2);
    segs.push({ w0: w, z0: z, w1: w + d * 0.62, z1: z, kind: 'seat', shade });
    /* 등판 — 줄 뒤쪽에 0.8m 서 있는 의자 등(투수 쪽을 본다) */
    segs.push({ w0: w + d * 0.62, z0: z, w1: w + d * 0.66, z1: z + 0.8, kind: 'back', shade });
    segs.push({ w0: w + d * 0.66, z0: z + 0.8, w1: w + d, z1: z + 0.8, kind: 'riser', shade: shade * 0.8 });
    /* 다음 줄 의자 밑 그늘 — 줄 사이가 어둡게 갈라져 보여야 실제 관중석 같다 */
    segs.push({ w0: w + d, z0: z + 0.8, w1: w + d, z1: z + rise, kind: 'riser', shade: shade * 0.45 });
    w += d;
    z += rise;
  }
  segs.push({ w0: w, z0: z, w1: w, z1: z + wallH, kind: 'wall', shade: shadeAt(w) * 0.85 });
  if (under) {
    segs.push({ w0: w, z0: z - slab, w1: w0, z1: z0 - slab, kind: 'under', shade: 0.5 });
    /* 바깥 벽 — 층 뒤 끝에서 땅까지(밖에서 보면 층층이 쌓인 덩어리) */
    if (outer) segs.push({ w0: w, z0: z - slab, w1: w, z1: 0, kind: 'outer', shade: 0.9 });
  }
  return segs;
}

/**
 * 둘레 선을 따라 단면을 쓸어 만든 띠들 — 종류마다 한 geometry. uv: u = 둘레 길이(m), v = 단면 선분 안 0~1.
 * 선분마다 점을 따로 두어 단면 꺾임은 날카롭게, 둘레 방향은 매끈하게.
 */
function sweep(
  F: FieldFrame,
  path: PathPt[],
  segs: Seg[],
  zig?: (i: number) => number,
  /** 선분 끝 높이를 둘레 자리마다 바꿀 때(층 뒤 벽 — 위층이 있는 자리만 높게) */
  z1At?: (sg: Seg, p: PathPt) => number,
  /** 둘레 자리마다 단면 전체를 파울선 쪽으로 당기는 거리(m) — 모서리에서 위층이 다가온다 */
  shiftAt?: (p: PathPt) => number
) {
  const { THREE, fg } = F;
  const by = new Map<Kind, { pos: number[]; uv: number[]; col: number[]; idx: number[] }>();
  for (const sg of segs) {
    const g = by.get(sg.kind) ?? { pos: [], uv: [], col: [], idx: [] };
    by.set(sg.kind, g);
    const base = g.pos.length / 3;
    const sh = sg.shade ?? 1;
    path.forEach((p, i) => {
      const lift = zig ? zig(i) : 0;
      const shift = shiftAt ? shiftAt(p) : 0;
      for (const [w0, z, v] of [
        [sg.w0, sg.z0, 0],
        [sg.w1, z1At ? z1At(sg, p) : sg.z1, 1],
      ] as const) {
        const w = w0 - shift;
        const q = fg(p.a + p.na * w, p.b + p.nb * w, (z + lift) * F.s);
        g.pos.push(q.x, q.y, q.z);
        g.uv.push(p.len, v);
        g.col.push(sh, sh, sh);
      }
    });
    for (let i = 0; i < path.length - 1; i++) {
      const a = base + i * 2;
      g.idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const out = new Map<Kind, Three.BufferGeometry>();
  for (const [k, g] of by) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.setIndex(g.idx);
    geo.computeVertexNormals();
    out.set(k, geo);
  }
  return out;
}

/** 캔버스 무늬 */
function canvasTex(THREE: typeof import('three'), w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  t.anisotropy = 8;
  return t;
}

/**
 * 의자 무늬 — 12m 한 칸(맨 앞 1.2m 는 통로 계단), 의자 폭 0.5m(64px).
 * 등판 면(줄 앞에서 본 0.8m): 위 둥근 등받이 → 접힌 앉는 판(조금 어둡게) → 다리 그늘. 의자 사이 틈은 그늘진 콘크리트(검게 칠하면 벽돌처럼 보였다).
 * 의자마다 밝기를 조금씩 달리한다(햇빛에 바랜 정도).
 */
function seatTextures(THREE: typeof import('three'), color: string, bench = false) {
  const W = 1536;
  const per = W / 12;
  const aisle = per * 1.2;
  const base = new THREE.Color(color);
  const tint = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const back = canvasTex(THREE, W, 64, (c) => {
    c.fillStyle = '#a49e93';
    c.fillRect(0, 0, W, 64);
    c.fillStyle = '#c9c3b8';
    c.fillRect(0, 0, aisle, 64);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 8; y < 64; y += 16) c.fillRect(0, y, aisle, 2);
    for (let x = aisle; x + 64 <= W + 1; x += 64) {
      const k = 0.94 + rnd() * 0.1;
      const g = c.createLinearGradient(0, 2, 0, 30);
      g.addColorStop(0, tint(1.12 * k));
      g.addColorStop(1, tint(0.92 * k));
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x + 3, 2, 58, 29, [12, 12, 3, 3]);
      c.fill();
      c.fillStyle = tint(0.78 * k);
      c.fillRect(x + 5, 33, 54, 19);
      c.fillStyle = '#5c5850';
      c.fillRect(x + 8, 52, 4, 12);
      c.fillRect(x + 52, 52, 4, 12);
    }
  });
  const seat = canvasTex(THREE, W, 32, (c) => {
    c.fillStyle = '#b4aea3';
    c.fillRect(0, 0, W, 32);
    c.fillStyle = '#cdc7bc';
    c.fillRect(0, 0, aisle, 32);
    for (let x = aisle; x + 64 <= W + 1; x += 64) {
      const k = 0.94 + rnd() * 0.1;
      c.fillStyle = tint(0.95 * k);
      c.fillRect(x + 4, 0, 56, 9);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(x + 4, 9, 56, 3);
    }
  });
  if (bench) {
    /* 외야석 벤치 — 이어진 나무색 판(0.5m 마다 가는 금), 등받이 없이 판 두 장 */
    const plank = (h: number, y0: number, y1: number) =>
      canvasTex(THREE, W, h, (c) => {
        c.fillStyle = '#9f998e';
        c.fillRect(0, 0, W, h);
        c.fillStyle = '#c9c3b8';
        c.fillRect(0, 0, aisle, h);
        const g = c.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, tint(1.1));
        g.addColorStop(1, tint(0.85));
        c.fillStyle = g;
        c.fillRect(aisle + 2, y0, W - aisle - 4, y1 - y0);
        c.fillStyle = 'rgba(0,0,0,0.22)';
        for (let x = aisle + 64; x < W; x += 64) c.fillRect(x, y0, 2, y1 - y0);
        /* 판 이음 — 가로 금 */
        c.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = y0 + 9; y < y1; y += 10) c.fillRect(aisle + 2, y, W - aisle - 4, 2);
      });
    const b = plank(64, 4, 60);
    const sb = plank(32, 0, 30);
    for (const t of [b, sb]) t.repeat.set(1 / 12, 1);
    return { back: b, seat: sb };
  }
  for (const t of [back, seat]) t.repeat.set(1 / 12, 1);
  return { back, seat };
}

/** 쓸어 만든 띠는 점마다 그늘 색을 갖는다 — 같은 재질의 '그늘 읽는' 복사본(다른 부품은 원본을 쓴다) */
const shaded = new WeakMap<Three.Material, Three.Material>();
function withShade(m: Three.Material): Three.Material {
  let c = shaded.get(m);
  if (!c) {
    c = m.clone();
    (c as Three.MeshStandardMaterial).vertexColors = true;
    shaded.set(m, c);
  }
  return c;
}

/** 쿠션 벽 — 연한 하늘빛 회색, 2m 마다 이음매 · 위아래 테두리 */
function padMat(THREE: typeof import('three')) {
  const t = canvasTex(THREE, 256, 64, (c) => {
    c.fillStyle = WALL_BLUE;
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, 0, 2, 64);
    c.fillRect(0, 0, 256, 3);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(2, 3, 2, 61);
  });
  t.repeat.set(1 / 2, 1);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide });
}

/** 층 밑면 — 7.5m 마다 들보(어두운 줄), 들보 사이는 조금 밝게 */
function underMat(THREE: typeof import('three')) {
  const t = canvasTex(THREE, 256, 16, (c) => {
    c.fillStyle = '#a8a296';
    c.fillRect(0, 0, 256, 16);
    c.fillStyle = '#7d786e';
    c.fillRect(0, 0, 18, 16);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(18, 0, 6, 16);
  });
  t.repeat.set(1 / 7.5, 1);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
}

/** 띠 전광판(로지 층 앞 · 외야석 앞) — 광고 대신 파란 바탕에 흰 줄 무늬만, 스스로 빛난다 */
function ribbonMat(THREE: typeof import('three')) {
  const t = canvasTex(THREE, 1024, 32, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#13408a');
    g.addColorStop(0.5, '#2a6fd0');
    g.addColorStop(1, '#13408a');
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 32);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let x = 0; x < 1024; x += 256) c.fillRect(x + 20, 14, 180, 4);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < 1024; x += 4) c.fillRect(x, 0, 1, 32);
  });
  t.repeat.set(1 / 24, 1);
  return new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.6, roughness: 0.5 });
}

function addSweep(F: FieldFrame, geos: Map<Kind, Three.BufferGeometry>, mats: Partial<Record<Kind, Three.Material>>) {
  for (const [k, g] of geos) {
    const m = mats[k];
    if (!m) continue;
    const mesh = new F.THREE.Mesh(g, withShade(m));
    mesh.castShadow = k !== 'seat' && k !== 'back';
    mesh.receiveShadow = true;
    F.scene.add(mesh);
  }
}

/* ───────────── 본 관중석 ───────────── */

/**
 * 본 관중석 앞 벽 선 — 3 · 1루 파울선에서 foulOff 밖, 홈 뒤는 반지름 BACKSTOP_R 호. reach = 파울선을 따라 간 거리.
 * 사진: 관중석은 폴에서 끝나지 않고 파울선 연장을 따라 외야 쪽으로 더 뻗는다(폴 뒤 · 외야석 옆까지) — 그래서 120m 까지.
 */
export const STAND_REACH = 132;
export function grandstandBase(): (P2 & { reach: number })[] {
  const pts: (P2 & { reach: number })[] = [];
  const Q = Math.PI / 4;
  const line = (a: number, th: number) => {
    const n = th > 0 ? 3 * Q : -3 * Q;
    const off = foulOff(a);
    return { a: a * Math.cos(th) + off * Math.cos(n), b: a * Math.sin(th) + off * Math.sin(n), reach: a };
  };
  for (let a = STAND_REACH; a > 0; a -= 2) pts.push(line(a, -Q));
  for (let i = 0; i <= 40; i++) {
    const t = -3 * Q - (2 * Q * i) / 40;
    pts.push({ a: BACKSTOP_R * Math.cos(t), b: BACKSTOP_R * Math.sin(t), reach: 0 });
  }
  for (let a = 2; a <= STAND_REACH; a += 2) pts.push(line(a, Q));
  return pts;
}

function grandstand(F: FieldFrame, mats: Record<string, Three.Material>, seatMats: Record<string, { back: Three.Material; seat: Three.Material }>) {
  const center = { a: 45, b: 0 };
  const full = toPath(grandstandBase(), center);
  const part = (maxReach: number) => toPath(grandstandBase().filter((p) => p.reach <= maxReach), center);
  /*
   * 층(바깥 거리 w · 높이 z, m) — 사진으로 어림. 위층은 아래층 뒤쪽 위로 튀어나오고(기둥 없음), 아래층 뒤 줄 머리 위는 2.4m 넘게 비운다.
   * 클럽은 홈 뒤(베이스 사이)에만. 층 뒤 벽은 위층 밑면까지 올려 틈으로 바깥이 보이지 않게.
   */
  /*
   * 층마다 끝나는 자리(파울선을 따라) — 사진(홈 옆에서 본 폴): 관중석이 폴을 지나 외야 쪽으로 뻗고, 위층이 폴 바로 옆에 높은 벽처럼 선다.
   * 그래서 모서리(파울선 60m → 105m)에서는 위층(로지 · 클럽 · 리저브 · 톱)을 통째로 파울선 쪽으로 12m 당긴다(층끼리 관계는 그대로).
   */
  const CLUB_REACH = 30;
  const LOGE_REACH = 128;
  const RESERVE_REACH = 124;
  const TOP_REACH = 116;
  const SHIFT_MAX = 12;
  const shiftOf = (key: string, reach: number) => {
    if (key === 'field') return 0;
    const u = Math.min(1, Math.max(0, (reach - 60) / 45));
    return SHIFT_MAX * u * u * (3 - 2 * u);
  };
  type Deck = {
    key: keyof typeof SEAT;
    path: PathPt[];
    reach: number;
    w0: number;
    z0: number;
    w1: number;
    z1: number;
    cover: number;
    ribbon?: boolean;
  };
  const decks: Deck[] = [
    /* 사진(필드 높이에서 본 폴 쪽): 위층이 크게 튀어나와 관중석이 가파르고 높은 벽처럼 선다 — 층마다 앞으로 10m 남짓만 물러난다 */
    { key: 'field', path: full, reach: STAND_REACH, w0: 0, z0: 0.4, w1: 27, z1: 9, cover: 14 },
    { key: 'loge', path: part(LOGE_REACH), reach: LOGE_REACH, w0: 14, z0: 11, w1: 30, z1: 18, cover: 26, ribbon: true },
    { key: 'club', path: part(CLUB_REACH), reach: CLUB_REACH, w0: 24, z0: 21, w1: 30, z1: 24, cover: 28 },
    { key: 'reserve', path: part(RESERVE_REACH), reach: RESERVE_REACH, w0: 28, z0: 28, w1: 46, z1: 39, cover: 40 },
    { key: 'top', path: part(TOP_REACH), reach: TOP_REACH, w0: 40, z0: 42, w1: 56, z1: 51, cover: 47 },
  ];
  /** 그 층 밑면의 높이(바깥 거리 w 에서) */
  const underAt = (d: Deck, w: number) => d.z0 - SLAB + ((w - d.w0) * (d.z1 - d.z0)) / (d.w1 - d.w0);
  const [, , club, , top] = decks;
  /* 톱 덱 위 지붕 — 앞으로 튀어나온 곡선 콘크리트(두께 0.7m), 앞 가장자리에 조명 */
  const R0 = 47;
  const R1 = 60;
  const ROOF_T = 0.45;
  const curve = (w: number) => 57.5 + 1.6 * Math.sin(((w - R0) / (R1 - R0)) * Math.PI * 0.9);
  /*
   * 뒤 벽 꼭대기 — 그 자리(파울선에서 실제 거리)를 덮는 가장 낮은 위층의 밑면까지. 덮는 층이 없으면 바깥 벽 높이 3m.
   * 클럽은 로지 뒤 벽 앞에 앉는다(뒤 줄이 같은 벽에 닿음) — 클럽 자체 뒤 벽은 없다. 톱 덱은 지붕 밑까지.
   */
  const wallTopAt = (d: Deck, p: PathPt): number => {
    if (d.key === 'club') return club.z1;
    if (d.key === 'top') return curve(top.w1) - ROOF_T;
    const W = d.w1 - shiftOf(d.key, p.reach);
    for (const n of decks.slice(decks.indexOf(d) + 1)) {
      if (p.reach > n.reach) continue;
      const sh = shiftOf(n.key, p.reach);
      if (W >= n.w0 - sh - 0.01 && W <= n.w1 - sh + 0.01) return underAt(n, W + sh);
    }
    return d.z1 + 3;
  };
  for (const d of decks) {
    /* 클럽 뒤 끝은 로지 뒤 벽과 같은 자리라 바깥 벽을 또 세우면 겹쳐 깜빡인다 */
    const segs = deckProfile(d.w0, d.z0, d.w1, d.z1, { under: d.key !== 'field', cover: d.cover, ribbon: d.ribbon, outer: d.key !== 'club' });
    const geos = sweep(
      F,
      d.path,
      segs,
      undefined,
      (sg, p) => (sg.kind === 'wall' ? wallTopAt(d, p) : sg.z1),
      (p) => shiftOf(d.key, p.reach)
    );
    addSweep(F, geos, {
      seat: seatMats[d.key].seat,
      back: seatMats[d.key].back,
      riser: mats.concrete,
      fascia: mats.fascia,
      ribbon: mats.ribbon,
      pad: mats.pad,
      under: mats.under,
      outer: mats.outer,
      wall: mats.concrete,
    });
    /* 층 끝 — 계단 탑(끝을 막는 벽) */
    for (const end of [d.path[0], d.path[d.path.length - 1]]) {
      const ground = d.key === 'field';
      const sh = shiftOf(d.key, end.reach);
      /* 단면 그대로 — 밑(땅 또는 밑면) → 뒤 벽 꼭대기 → 의자 줄을 따라 난간 높이(1.1m)로 앞까지 */
      const poly: [number, number][] = [
        [d.w0, ground ? 0 : d.z0 - SLAB],
        [d.w1, ground ? 0 : underAt(d, d.w1)],
        [d.w1, Math.max(wallTopAt(d, end), d.z1 + 1.1)],
        [d.w1 - 0.3, d.z1 + 1.1],
        [d.w0 + 0.3, d.z0 + 1.1],
        [d.w0, d.z0 + 1],
      ];
      endCap(
        F,
        end,
        poly.map(([w, z]) => [w - sh, z]),
        mats.endCap
      );
    }
  }
  const roofSegs: Seg[] = [];
  for (let i = 0; i < 8; i++) {
    const w0 = R0 + ((R1 - R0) * i) / 8;
    const w1 = R0 + ((R1 - R0) * (i + 1)) / 8;
    roofSegs.push({ w0, z0: curve(w0), w1, z1: curve(w1), kind: 'roof' });
    roofSegs.push({ w0: w1, z0: curve(w1) - ROOF_T, w1: w0, z1: curve(w0) - ROOF_T, kind: 'roofUnder', shade: 0.6 });
  }
  roofSegs.push({ w0: R0, z0: curve(R0) - ROOF_T, w1: R0, z1: curve(R0), kind: 'fascia' });
  const topShift = (p: PathPt) => shiftOf('top', p.reach);
  addSweep(F, sweep(F, top.path, roofSegs, undefined, undefined, topShift), { roof: mats.roof, roofUnder: mats.roof, fascia: mats.fascia });
  return { roofPath: resample(top.path, 7.5), roofEdge: R0, roofZ: curve(R0), roofShift: topShift };
}

/** 층 끝 벽 — 둘레 끝 점에서 단면 다각형(바깥 거리 w, 높이 z — 볼록, 차례대로)을 막는다 */
function endCap(F: FieldFrame, p: PathPt, poly: [number, number][], mat: Three.Material) {
  const { THREE, fg, s } = F;
  const pos: number[] = [];
  for (const [w, z] of poly) {
    const q = fg(p.a + p.na * w, p.b + p.nb * w, z * s);
    pos.push(q.x, q.y, q.z);
  }
  const idx: number[] = [];
  for (let i = 1; i < poly.length - 1; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  F.scene.add(m);
}

/* ───────────── 더그아웃 · 백스톱 그물 ───────────── */

function dugoutsAndNet(F: FieldFrame, mats: Record<string, Three.Material>) {
  const { THREE } = F;
  const center = { a: 45, b: 0 };
  const base = grandstandBase();
  /* 더그아웃 — 파울선 12~34m, 관중석 앞 벽 아래가 뚫린 어두운 입구 + 흰 지붕 끝 */
  const dark = new THREE.MeshStandardMaterial({ color: '#0d1014', roughness: 1 });
  for (const side of [-1, 1]) {
    const path = toPath(
      base.filter((p) => p.reach >= 12 && p.reach <= 34 && Math.sign(p.b + 1e-6) === side),
      center
    );
    addSweep(
      F,
      sweep(F, path, [
        { w0: -0.04, z0: 0, w1: -0.04, z1: 1.0, kind: 'wall' },
        { w0: -0.5, z0: 1.0, w1: 0, z1: 1.0, kind: 'fascia' },
        { w0: -0.5, z0: 1.18, w1: -0.5, z1: 1.0, kind: 'fascia' },
        { w0: 0, z0: 1.18, w1: -0.5, z1: 1.18, kind: 'pad' },
      ]),
      { wall: dark, fascia: mats.fascia, pad: mats.pad }
    );
  }
  /* 백스톱 그물 — 홈 뒤에서 양쪽 더그아웃 끝까지, 앞 벽 위로 9m(멀리서는 옅은 막처럼 보인다) */
  const net = toPath(base.filter((p) => p.reach <= 34), center);
  const netTex = canvasTex(THREE, 64, 64, (c) => {
    c.clearRect(0, 0, 64, 64);
    c.strokeStyle = 'rgba(25,25,25,0.95)';
    c.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 64);
      c.moveTo(0, i);
      c.lineTo(64, i);
      c.stroke();
    }
  });
  netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(1 / 0.12, 9 / 0.12);
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  addSweep(F, sweep(F, net, [{ w0: 0.05, z0: 1.45, w1: 0.05, z1: 10.5, kind: 'roof' }]), { roof: netMat });
  /* 그물 위를 잡는 줄(기둥 없이 위층에 매단다) */
  addSweep(F, sweep(F, net, [{ w0: 0.05, z0: 10.45, w1: 0.05, z1: 10.55, kind: 'wall' }]), { wall: mats.steel });
}

/* ───────────── 외야석(파빌리온) ───────────── */

/**
 * 외야석 — 펜스 바로 뒤에서 오르는 나무색 벤치(사진: 바랜 황토빛). 뒤 절반을 덮는 낮은 지그재그 지붕(위는 밝은 쇠판, 밑은 짙은 갈색),
 * 앞쪽 기둥이 골마다 받친다. 폴 옆에서 가운데 쪽 θ 0.21 까지.
 */
function pavilion(F: FieldFrame, side: 1 | -1, mats: Record<string, Three.Material>, seatMat: { back: Three.Material; seat: Three.Material }) {
  const pts: (P2 & { reach: number })[] = [];
  for (let i = 0; i <= 60; i++) {
    const th = side * (0.21 + ((0.765 - 0.21) * i) / 60);
    const r = F.fenceR(th);
    pts.push({ a: r * Math.cos(th), b: r * Math.sin(th), reach: 0 });
  }
  const path = resample(toPath(pts, { a: 0, b: 0 }), 1.5);
  const prof = deckProfile(1.2, 3.0, 16, 10, { under: false, cover: 7, wallH: 2.6 });
  addSweep(F, sweep(F, path, prof), {
    seat: seatMat.seat,
    back: seatMat.back,
    riser: mats.concrete,
    fascia: mats.fascia,
    pad: mats.pad,
    wall: mats.concrete,
  });
  /* 지그재그 지붕 — 3.5m 마다 꼭짓점이 1.3m 오르내린다 */
  const roofPath = resample(path, 3.5);
  const zig = (i: number) => (i % 2 ? 1.3 : 0);
  addSweep(
    F,
    sweep(
      F,
      roofPath,
      [
        { w0: 5.5, z0: 11.6, w1: 17.5, z1: 12.4, kind: 'roof' },
        { w0: 17.5, z0: 12.2, w1: 5.5, z1: 11.4, kind: 'roofUnder', shade: 0.9 },
        { w0: 5.5, z0: 11.4, w1: 5.5, z1: 11.6, kind: 'fascia' },
      ],
      zig
    ),
    { roof: mats.metal, roofUnder: mats.pavUnder, fascia: mats.fascia }
  );
  /* 기둥 — 앞은 골마다(한 칸 걸러), 뒤는 벽 위 */
  const colGeo = new F.THREE.CylinderGeometry(0.16 * F.s, 0.16 * F.s, 1, 8);
  for (let i = 0; i < roofPath.length; i += 2) {
    const p = roofPath[i];
    for (const [w, top] of [
      [6, 11.5],
      [17.2, 12.3],
    ]) {
      const c = new F.THREE.Mesh(colGeo, mats.pavUnder);
      const z0 = w < 10 ? 3.0 + ((w - 1.2) / 14.8) * 7 : 10;
      c.scale.set(1, (top - z0) * F.s, 1);
      c.position.copy(F.fg(p.a + p.na * w, p.b + p.nb * w, ((top + z0) / 2) * F.s));
      F.scene.add(c);
    }
  }
  for (const end of [path[0], path[path.length - 1]])
    endCap(F, end, [[1.2, 0], [16, 0], [16, 12.6], [15.7, 11.1], [1.5, 4.1], [1.2, 4.0]], mats.endCap);
  return path;
}

/**
 * 육각 전광판 — 흰 테두리(사진), 화면은 이닝 점수판(숫자만, 로고 없음). 밑에 긴 줄 전광판, 굵은 흰 기둥 둘.
 * 가운데 (a, b), 화면 가운데 높이 21m, 홈 쪽을 본다.
 */
function hexBoard(F: FieldFrame, a: number, b: number, mats: Record<string, Three.Material>) {
  const { THREE, s } = F;
  const w = 26;
  const h = 12;
  const hexShape = (k: number) => {
    const sh = new THREE.Shape();
    const pts: [number, number][] = [
      [-w / 2, 0],
      [-w / 2 + h * 0.42, h / 2],
      [w / 2 - h * 0.42, h / 2],
      [w / 2, 0],
      [w / 2 - h * 0.42, -h / 2],
      [-w / 2 + h * 0.42, -h / 2],
    ];
    sh.moveTo(pts[0][0] * s * k, pts[0][1] * s * k);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x * s * k, y * s * k);
    sh.closePath();
    return sh;
  };
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(hexShape(1), { depth: 1.4 * s, bevelEnabled: false }), mats.boardFrame);
  /* 화면 — 이닝 점수판(숫자만, 로고 없음). 짙은 남색 바탕 + 큰 노란 이닝 숫자 + 흰 점수 */
  const screenTex = canvasTex(
    THREE,
    1024,
    472,
    (c) => {
      c.fillStyle = '#071631';
      c.fillRect(0, 0, 1024, 472);
      c.fillStyle = '#0f2a55';
      for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) c.fillRect(150 + i * 64, 170 + j * 104, 58, 96);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffcf4a';
      c.font = 'bold 64px system-ui, sans-serif';
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'R', 'H', 'E'].forEach((t, i) => c.fillText(t, 179 + i * 64, 120));
      c.fillStyle = '#f5f8fc';
      c.font = 'bold 76px system-ui, sans-serif';
      const away = ['0', '0', '1', '0', '0', '0', '', '', '', '1', '4', '0'];
      const home = ['0', '2', '0', '0', '1', '', '', '', '', '3', '6', '1'];
      away.forEach((t, i) => c.fillText(t, 179 + i * 64, 220));
      home.forEach((t, i) => c.fillText(t, 179 + i * 64, 324));
      /* 볼 · 스트라이크 · 아웃 불 */
      const dots: [number, string][] = [
        [2, '#4ade80'],
        [1, '#f87171'],
        [1, '#fbbf24'],
      ];
      dots.forEach(([n, col], j) => {
        for (let k = 0; k < 3; k++) {
          c.fillStyle = k < n ? col : '#1d3560';
          c.beginPath();
          c.arc(330 + j * 180 + k * 44, 418, 17, 0, Math.PI * 2);
          c.fill();
        }
      });
    },
    false
  );
  /* 모양 판의 uv 는 모양 좌표 그대로라 0~1 로 편다(안 펴면 점수판 한가운데 한 점만 보였다) */
  const screenGeo = new THREE.ShapeGeometry(hexShape(0.93));
  {
    const pos = screenGeo.attributes.position;
    const uv = screenGeo.attributes.uv;
    screenGeo.computeBoundingBox();
    const bb = screenGeo.boundingBox!;
    for (let i = 0; i < pos.count; i++)
      uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  const screen = new THREE.Mesh(
    screenGeo,
    new THREE.MeshStandardMaterial({ color: '#05070a', emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 1.1, roughness: 0.25 })
  );
  screen.position.z = 1.45 * s;
  /* 밑 줄 전광판 — 검은 판 */
  const strip = new THREE.Mesh(new THREE.BoxGeometry(22 * s, 2.4 * s, 0.8 * s), mats.boardDark);
  strip.position.set(0, -8.2 * s, 0.6 * s);
  const g = new THREE.Group();
  g.add(frame, screen, strip);
  const center = F.fg(a, b, 21 * s);
  g.position.copy(center);
  g.lookAt(F.fg(0, 0, 10 * s));
  g.traverse((o) => (o.castShadow = true));
  F.scene.add(g);
  /* 기둥 둘 — 땅에서 화면 밑까지 */
  const leg = new THREE.BoxGeometry(1.1 * s, 15 * s, 1.1 * s);
  for (const k of [-1, 1]) {
    const l = new THREE.Mesh(leg, mats.boardFrame);
    const off = new THREE.Vector3(k * 6.5 * s, 0, 0.4 * s).applyQuaternion(g.quaternion);
    l.position.set(center.x + off.x, 7.5 * s, center.z + off.z);
    l.castShadow = true;
    F.scene.add(l);
  }
}

/**
 * 조명탑 — 기둥 넷이 받치는 넓은 등판(사진: 외야석 뒤 좌우에 하나씩). 등판 앞면은 등 격자(밤에 빛남, glow 표시).
 */
function lightTower(F: FieldFrame, a: number, b: number, mats: Record<string, Three.Material>, bankMat: Three.Material) {
  const { THREE, s } = F;
  const H = 46;
  const W = 24;
  const g = new THREE.Group();
  const pole = new THREE.CylinderGeometry(0.35 * s, 0.5 * s, H * s, 10);
  for (const x of [-9, -3, 3, 9]) {
    const m = new THREE.Mesh(pole, mats.lightPole);
    m.position.set(x * s, (H / 2) * s, -0.8 * s);
    g.add(m);
  }
  const bank = new THREE.Mesh(new THREE.BoxGeometry(W * s, 7 * s, 0.6 * s), [
    mats.lightPole,
    mats.lightPole,
    mats.lightPole,
    mats.lightPole,
    bankMat,
    mats.lightPole,
  ]);
  bank.position.set(0, (H + 1) * s, 0);
  bank.rotation.x = 0.18;
  bank.userData.glow = 38;
  g.add(bank);
  g.position.copy(F.fg(a, b, 0));
  g.lookAt(F.fg(25, 0, 0));
  g.traverse((o) => (o.castShadow = true));
  F.scene.add(g);
}

/* ───────────── 야자수(여럿을 한 번에 그림) ───────────── */

function palms(F: FieldFrame, spots: { a: number; b: number; h: number }[]) {
  const { THREE, s } = F;
  /* 잎 무늬 — 깃털 모양 잎(투명 테두리), 잎줄기 양쪽에 촘촘한 작은 잎 */
  const leafTex = canvasTex(
    THREE,
    256,
    64,
    (c) => {
      c.clearRect(0, 0, 256, 64);
      c.strokeStyle = '#4b5a33';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, 32);
      c.lineTo(256, 32);
      c.stroke();
      for (let x = 2; x < 252; x += 3) {
        const len = 29 * Math.sin((x / 256) * Math.PI * 0.95 + 0.1) + 3;
        const g = 70 + ((x * 37) % 30);
        c.strokeStyle = `rgb(${g - 28},${g + 8},${g - 40})`;
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(x, 32);
        c.lineTo(x + 9, 32 - len);
        c.moveTo(x, 32);
        c.lineTo(x + 9, 32 + len);
        c.stroke();
      }
    },
    false
  );
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true });
  /*
   * 머리 — 잎 22장을 세 층으로(위는 하늘로, 가운데는 옆으로 휘고, 아래는 늘어짐) + 마른 잎 5장(갈색, 거의 수직으로 늘어진 치마).
   * 사진의 야자수 머리는 둥글고 빽빽하다.
   */
  const crownParts: { g: Three.BufferGeometry; col: [number, number, number] }[] = [];
  const frondGeo = (len: number, droop: number) => {
    const f = new THREE.PlaneGeometry(len, 1.3, 12, 1);
    const pos = f.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + len / 2;
      pos.setXYZ(i, x, -droop * x * x + 0.3 * x, pos.getY(i));
    }
    f.computeVertexNormals();
    return f;
  };
  for (let k = 0; k < 22; k++) {
    const tier = k < 7 ? 0 : k < 15 ? 1 : 2;
    const g = frondGeo(4.2 + (k % 3) * 0.4, [0.06, 0.11, 0.17][tier]);
    g.rotateX(((k % 2) - 0.5) * 0.5);
    g.rotateZ([0.75, 0.25, -0.25][tier]);
    g.rotateY((k / 22) * Math.PI * 2 * 3.1 + tier * 0.4);
    const v = 0.85 + (k % 4) * 0.06;
    crownParts.push({ g, col: [v, v, v] });
  }
  for (let k = 0; k < 5; k++) {
    const g = frondGeo(3.4, 0.05);
    g.rotateZ(-1.25);
    g.rotateY((k / 5) * Math.PI * 2 + 0.3);
    g.translate(0, -0.3, 0);
    crownParts.push({ g, col: [1.25, 0.82, 0.5] });
  }
  const crown = (() => {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    let off = 0;
    for (const { g, col: cc } of crownParts) {
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const U = g.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        nor.push(N.getX(i), N.getY(i), N.getZ(i));
        uv.push(U.getX(i), U.getY(i));
        col.push(...cc);
      }
      const ix = g.index!;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
      off += P.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setIndex(idx);
    return out;
  })();
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1, 10, 1);
  trunk.translate(0, 0.5, 0);
  const trunkTex = canvasTex(THREE, 64, 256, (c) => {
    c.fillStyle = '#8a7a63';
    c.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 6) {
      c.fillStyle = 'rgba(60,48,36,0.35)';
      c.fillRect(0, y, 64, 2);
    }
  });
  trunkTex.wrapT = THREE.RepeatWrapping;
  trunkTex.repeat.set(1, 6);
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ map: trunkTex, roughness: 0.9 }), spots.length);
  const crownMesh = new THREE.InstancedMesh(crown, leafMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((p, i) => {
    const base = F.fg(p.a, p.b, 0);
    const lean = new THREE.Euler(((i * 37) % 7) * 0.012 - 0.04, 0, ((i * 53) % 5) * 0.012 - 0.03);
    q.setFromEuler(lean);
    m.compose(base, q, new THREE.Vector3(s * (1 + ((i * 13) % 3) * 0.1), p.h * s, s * (1 + ((i * 13) % 3) * 0.1)));
    trunkMesh.setMatrixAt(i, m);
    const top = new THREE.Vector3(0, p.h * s, 0).applyQuaternion(q).add(base);
    q.setFromEuler(new THREE.Euler(lean.x, (i * 1.7) % (Math.PI * 2), lean.z));
    m.compose(top, q, new THREE.Vector3(s, s, s));
    crownMesh.setMatrixAt(i, m);
  });
  trunkMesh.castShadow = crownMesh.castShadow = true;
  F.scene.add(trunkMesh, crownMesh);
  return [trunkMesh.material, leafMat] as Three.MeshStandardMaterial[];
}

/* ───────────── 언덕(엘리시안 파크) ───────────── */

function hills(F: FieldFrame) {
  const fenceDistOf = F.fenceR;
  const { THREE, fg, s } = F;
  const R0 = 180;
  const R1 = 560;
  const nr = 56;
  const na = 240;
  const hash = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  /* 높이(m) — 주차장 가장자리에서 120m 에 걸쳐 오르고, 외야 너머(엘리시안 파크)가 홈 뒤보다 높다 */
  const shape = (a: number, b: number) => {
    const r = Math.hypot(a - 30, b);
    const th = Math.atan2(b, a - 30);
    const n = noise(a / 110, b / 110) * 0.6 + noise(a / 37, b / 37) * 0.3 + noise(a / 11, b / 11) * 0.1;
    const rise = Math.min(1, Math.max(0, (r - R0) / 120));
    const side = 0.45 + 0.55 * Math.max(0, Math.cos(th));
    return { h: rise * rise * (3 - 2 * rise) * (8 + 34 * n) * side, n, r };
  };
  /* 나무 덮임(0~1) — 큰 무늬 + 잔 무늬, 골짜기(낮은 곳)에 더 */
  const woods = (a: number, b: number) => noise(a / 45 + 9, b / 45 + 3) * 0.7 + noise(a / 13 + 1, b / 13 + 7) * 0.3;
  const pos: number[] = [];
  const col: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const dry = new THREE.Color('#9a8a62');
  const brush = new THREE.Color('#7d7a4c');
  const tree = new THREE.Color('#37462a');
  const c = new THREE.Color();
  for (let i = 0; i <= nr; i++) {
    const t = i / nr;
    const r = R0 - 10 + (R1 - R0 + 10) * t * t;
    for (let j = 0; j < na; j++) {
      const th = (j / na) * Math.PI * 2;
      const a = 30 + r * Math.cos(th);
      const b = r * Math.sin(th);
      const { h } = shape(a, b);
      const p = fg(a, b, (h - (r < R0 ? 1.5 : 0)) * s);
      pos.push(p.x, p.y, p.z);
      uvs.push(a / 18, b / 18);
      const w = woods(a, b);
      c.copy(dry).lerp(brush, Math.min(1, Math.max(0, (w - 0.3) * 3))).lerp(tree, Math.min(1, Math.max(0, (w - 0.5) * 3)));
      c.multiplyScalar(0.92 + hash(a * 0.3, b * 0.3) * 0.12);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < na; j++) {
      const a = i * na + j;
      const b = i * na + ((j + 1) % na);
      idx.push(a, b, a + na, b, b + na, a + na);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /* 마른 풀 결 — 밝고 어두운 잔 얼룩(색은 점 색이 정하고 무늬는 밝기만) */
  const grassTex = canvasTex(THREE, 256, 256, (cx) => {
    cx.fillStyle = '#d0d0d0';
    cx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = 150 + ((i * 53) % 105);
      cx.fillStyle = `rgba(${v},${v},${v - 10},0.5)`;
      cx.fillRect((i * 97.31) % 256, (i * 57.17) % 256, 1 + (i % 3), 3 + (i % 5));
    }
  });
  grassTex.wrapT = THREE.RepeatWrapping;
  const hillMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 });
  const m = new THREE.Mesh(geo, hillMat);
  m.receiveShadow = true;
  F.scene.add(m);

  /* 나무 — 언덕의 나무 덮인 곳에 촘촘히(넓은잎 둥근 나무 · 유칼립투스), 가까운 언덕(300m 안) */
  const spots: TreeSpot[] = [];
  for (let k = 0; k < 12000 && spots.length < 1700; k++) {
    const th = hash(k, 1.3) * Math.PI * 2;
    const r = R0 + 4 + Math.pow(hash(k, 7.1), 1.5) * 280;
    const a = 30 + r * Math.cos(th);
    const b = r * Math.sin(th);
    if (woods(a, b) < 0.42 + hash(k, 3.3) * 0.12) continue;
    const big = 7 + hash(k, 5.5) * 9;
    spots.push({ a, b, y: shape(a, b).h - 0.5, w: big * (0.9 + hash(k, 6.6) * 0.4), h: big, kind: hash(k, 8.1) < 0.7 ? 0 : 2 });
  }
  /* 주차장의 키 큰 침엽수 줄(사진: 외야석 뒤 주차장에 줄지어 선 짙은 나무) */
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const th = side * (0.08 + i * 0.026);
      const r = fenceDistOf(th) + 38 + (i % 2) * 22 + hash(i, side) * 6;
      spots.push({ a: r * Math.cos(th), b: r * Math.sin(th), y: 0, w: 4 + hash(i, 2) * 1.5, h: 14 + hash(i, 3) * 6, kind: 1 });
    }
  }
  const treeMat = billboardTrees(F, spots);
  return { hillMat, treeMat };
}

/* ───────────── 나무 그림판(카메라를 보는 판, 여럿을 한 번에) ───────────── */

type TreeSpot = { a: number; b: number; y: number; w: number; h: number; kind: 0 | 1 | 2 };

/**
 * 나무 셋을 그린 판(256 × 256 세 칸) — 0 넓은잎 둥근 나무 · 1 키 큰 침엽수 · 2 유칼립투스(성긴 잎, 회녹색).
 * 잎 덩이를 수백 개 겹쳐 그리고 위 · 왼쪽을 밝게(해), 아래 · 안쪽을 어둡게 — 멀리서(10~40px) 진짜 나무처럼 들쭉날쭉한 윤곽 · 명암이 보이게.
 */
function treeAtlas(THREE: typeof import('three')) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return canvasTex(
    THREE,
    768,
    256,
    (c) => {
      c.clearRect(0, 0, 768, 256);
      const blob = (x: number, y: number, r: number, light: number, base: [number, number, number]) => {
        const k = 0.55 + light * 0.75;
        c.fillStyle = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      };
      /* 0 넓은잎 — 줄기 + 둥근 덩이 여럿을 합친 윤곽 */
      {
        const ox = 0;
        c.fillStyle = '#4a3b2c';
        c.fillRect(ox + 122, 170, 12, 86);
        const lobes: [number, number, number][] = [
          [128, 120, 78],
          [80, 140, 52],
          [176, 138, 56],
          [128, 70, 52],
          [96, 92, 46],
          [162, 92, 46],
        ];
        for (let i = 0; i < 1400; i++) {
          const [lx, ly, lr] = lobes[Math.floor(rnd() * lobes.length)];
          const ang = rnd() * Math.PI * 2;
          const rr = Math.sqrt(rnd()) * lr;
          const x = lx + Math.cos(ang) * rr;
          const y = ly + Math.sin(ang) * rr * 0.9;
          if (y > 196) continue;
          const light = Math.max(0, Math.min(1, 0.85 - (y - 40) / 190 - (x - 128) / 420 + (rnd() - 0.5) * 0.35));
          blob(ox + x, y, 4 + rnd() * 6, light, [58, 76, 42]);
        }
      }
      /* 1 침엽수 — 좁고 긴 불꽃 모양, 짙은 녹색 */
      {
        const ox = 256;
        c.fillStyle = '#3b2f24';
        c.fillRect(ox + 124, 220, 8, 36);
        for (let i = 0; i < 1500; i++) {
          const y = 8 + rnd() * 214;
          const half = 8 + 42 * Math.sin(((y - 8) / 214) * Math.PI * 0.92) * (0.75 + 0.25 * ((y - 8) / 214));
          const x = 128 + (rnd() * 2 - 1) * half;
          const light = Math.max(0, Math.min(1, 0.75 - (y - 20) / 320 - (x - 128) / 160 + (rnd() - 0.5) * 0.4));
          blob(ox + x, y, 3 + rnd() * 4, light, [36, 52, 34]);
        }
      }
      /* 2 유칼립투스 — 키 크고 성긴 회녹색, 가는 흰 줄기 */
      {
        const ox = 512;
        c.strokeStyle = '#cfc6b4';
        c.lineWidth = 7;
        c.beginPath();
        c.moveTo(ox + 128, 256);
        c.lineTo(ox + 124, 150);
        c.lineTo(ox + 104, 90);
        c.moveTo(ox + 124, 150);
        c.lineTo(ox + 150, 80);
        c.stroke();
        const lobes: [number, number, number][] = [
          [100, 70, 44],
          [154, 64, 46],
          [128, 34, 34],
          [86, 118, 30],
          [170, 112, 30],
        ];
        for (let i = 0; i < 900; i++) {
          const [lx, ly, lr] = lobes[Math.floor(rnd() * lobes.length)];
          const ang = rnd() * Math.PI * 2;
          const rr = Math.sqrt(rnd()) * lr;
          const x = lx + Math.cos(ang) * rr;
          const y = ly + Math.sin(ang) * rr * 0.85;
          const light = Math.max(0, Math.min(1, 0.85 - (y - 20) / 200 - (x - 128) / 400 + (rnd() - 0.5) * 0.4));
          blob(ox + x, y, 3 + rnd() * 5, light, [84, 98, 70]);
        }
      }
    },
    false
  );
}

/** 나무 그림판을 한 번에 — 판은 늘 카메라를 보되 세로는 곧게(원통형 빌보드). 안개 · 밤 어둡게(uLight) */
function billboardTrees(F: FieldFrame, spots: TreeSpot[]) {
  const { THREE, s } = F;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const off: number[] = [];
  const size: number[] = [];
  const tint: number[] = [];
  const kind: number[] = [];
  let k = 0;
  for (const t of spots) {
    const p = F.fg(t.a, t.b, t.y * s);
    off.push(p.x, p.y, p.z);
    size.push(t.w * s, t.h * s);
    const v = 0.82 + ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.36;
    tint.push(v, v * (0.97 + (k % 3) * 0.02), v * 0.95);
    kind.push(t.kind);
    k++;
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(size), 2));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 3));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(kind), 1));
  geo.instanceCount = spots.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null }, uLight: { value: 1 } }]),
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec3 aOff;
      attribute vec2 aSize;
      attribute vec3 aTint;
      attribute float aKind;
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_vertex>
      void main() {
        vec3 toCam = cameraPosition - aOff;
        vec3 side = normalize(vec3(toCam.z, 0.0, -toCam.x));
        vec3 wp = aOff + side * position.x * aSize.x + vec3(0.0, 1.0, 0.0) * position.y * aSize.y;
        vUv = vec2((uv.x + aKind) / 3.0, uv.y);
        vTint = aTint;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uLight;
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(uAtlas, vUv);
        if (t.a < 0.5) discard;
        gl_FragColor = vec4(t.rgb * vTint * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  mat.uniforms.uAtlas.value = treeAtlas(THREE);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  F.scene.add(mesh);
  return mat;
}

/* ───────────── 전체 ───────────── */

export type StadiumHandle = {
  /** 밤이면 조명 · 전광판을 밝힌다 */
  setNight: (on: boolean) => void;
};

/**
 * 구장 밖만(야자수 · 언덕 · 나무) — Blender 구장(GLB)을 쓸 때 stage.ts 가 부른다.
 * 야자수는 외야석(홈에서 112~147m) 뒤 · 주차장 둘레에, 관중석 뒤에도 몇 그루.
 */
export function buildSurroundings(F: FieldFrame): StadiumHandle {
  const spots: { a: number; b: number; h: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const side = i % 2 ? 1 : -1;
    const th = side * (0.03 + ((i * 0.618) % 1) * 0.8);
    const r = Math.max(F.fenceR(Math.min(0.78, Math.abs(th)) * side) + 44, 150) + ((i * 7.3) % 1) * 30;
    spots.push({ a: r * Math.cos(th), b: r * Math.sin(th), h: 17 + ((i * 3.7) % 9) });
  }
  const palmMats = palms(F, spots);
  const { hillMat, treeMat } = hills(F);
  return {
    setNight: (on) => {
      hillMat.color.setScalar(on ? 0.06 : 1);
      treeMat.uniforms.uLight.value = on ? 0.07 : 1;
      for (const m of palmMats) m.color.setScalar(on ? 0.2 : 1);
    },
  };
}

export function buildStadium(F: FieldFrame): StadiumHandle {
  const { THREE } = F;
  const std = (color: string, rough = 0.85, metal = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide });
  const mats: Record<string, Three.Material> = {
    concrete: std(CONCRETE, 0.92),
    fascia: std(FASCIA, 0.7),
    under: underMat(THREE),
    outer: std('#d8d2c6', 0.9),
    roof: std('#d9d5cc', 0.85),
    metal: std('#eef0f1', 0.55, 0.1),
    metalUnder: std('#c3c8cc', 0.7, 0.05),
    steel: std('#3b4048', 0.55, 0.4),
    pad: padMat(THREE),
    endCap: std('#b9b3a8', 0.95),
    pavUnder: std('#5b5242', 0.8),
    boardFrame: std('#e8e3d6', 0.6),
    boardDark: std('#111418', 0.4),
    lightPole: std('#8b9097', 0.6, 0.3),
    ribbon: ribbonMat(THREE),
  };
  const seatMats: Record<string, { back: Three.Material; seat: Three.Material }> = {};
  for (const [k, color] of Object.entries(SEAT)) {
    const t = seatTextures(THREE, color, k === 'pavilion');
    seatMats[k] = {
      back: new THREE.MeshStandardMaterial({ map: t.back, roughness: 0.55, side: THREE.DoubleSide }),
      seat: new THREE.MeshStandardMaterial({ map: t.seat, roughness: 0.75, side: THREE.DoubleSide }),
    };
  }

  const { roofPath, roofEdge, roofZ, roofShift } = grandstand(F, mats, seatMats);
  dugoutsAndNet(F, mats);
  pavilion(F, -1, mats, seatMats.pavilion);
  pavilion(F, 1, mats, seatMats.pavilion);

  /* 등 격자(조명탑 등판 앞면) — 낮엔 회색 등 · 밤엔 빛남 */
  const lampGrid = canvasTex(
    THREE,
    256,
    80,
    (c) => {
      c.fillStyle = '#4a4f56';
      c.fillRect(0, 0, 256, 80);
      c.fillStyle = '#2c3036';
      for (let y = 0; y < 80; y += 10) c.fillRect(0, y, 256, 2);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 32; x++) {
          c.fillStyle = '#b9bec4';
          c.beginPath();
          c.arc(4 + x * 8, 5 + y * 10, 3, 0, Math.PI * 2);
          c.fill();
        }
    },
    false
  );
  const bankMat = new THREE.MeshStandardMaterial({ map: lampGrid, emissive: '#ffffff', emissiveMap: lampGrid, emissiveIntensity: 0, roughness: 0.4 });
  /* 전광판 · 조명탑 — 외야석 뒤, 전광판은 가운데 쪽, 조명탑은 폴 쪽 */
  for (const side of [-1, 1] as const) {
    const th = side * 0.44;
    const r = F.fenceR(th) + 27;
    hexBoard(F, r * Math.cos(th), r * Math.sin(th), mats);
    const tt = side * 0.62;
    const rt = F.fenceR(tt) + 30;
    lightTower(F, rt * Math.cos(tt), rt * Math.sin(tt), mats, bankMat);
  }
  /* 가운데 — 타자 눈(짙은 벽) · 생울타리 */
  {
    const pts: P2[] = [];
    for (let i = 0; i <= 20; i++) {
      const th = -0.2 + (0.4 * i) / 20;
      const r = F.fenceR(th) + 4;
      pts.push({ a: r * Math.cos(th), b: r * Math.sin(th) });
    }
    const path = toPath(pts.map((p) => ({ ...p, reach: 0 })), { a: 0, b: 0 });
    /* 펜스 1m 뒤에서 11m 뒤까지 오르는 짙은 풀 비탈(높이 6m) — 타자 눈에 공이 잘 보이게 어둡다 */
    const hedge = canvasTex(THREE, 512, 64, (c) => {
      c.fillStyle = '#1b3320';
      c.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = i % 3 ? 'rgba(10,25,14,0.55)' : 'rgba(60,96,58,0.45)';
        c.fillRect((i * 97.13) % 512, (i * 31.7) % 64, 2 + (i % 4), 2 + (i % 3));
      }
    });
    hedge.wrapT = THREE.RepeatWrapping;
    hedge.repeat.set(1 / 8, 3);
    addSweep(F, sweep(F, path, [{ w0: 1, z0: 0, w1: 11, z1: 6, kind: 'wall' }]), {
      wall: new THREE.MeshStandardMaterial({ map: hedge, roughness: 1 }),
    });
  }

  /* 조명 — 본 관중석 지붕 앞 가장자리 · 외야석 지붕 위 기둥(밤에 빛남) */
  const lampMat = new THREE.MeshStandardMaterial({ color: '#dfe3e8', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.3 });
  const lamp = new THREE.BoxGeometry(2.2 * F.s, 1.4 * F.s, 0.5 * F.s);
  for (let i = 1; i < roofPath.length - 1; i += 2) {
    const p = roofPath[i];
    const m = new THREE.Mesh(lamp, lampMat);
    const w = roofEdge + 0.5 - roofShift(p);
    m.position.copy(F.fg(p.a + p.na * w, p.b + p.nb * w, (roofZ + 1.2) * F.s));
    m.lookAt(F.fg(30, 0, 0));
    F.scene.add(m);
  }
  /* 야자수 — 외야석 뒤 언덕 · 좌우 끝, 관중석 뒤 */
  const spots: { a: number; b: number; h: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const side = i % 2 ? 1 : -1;
    const th = side * (0.12 + ((i * 0.618) % 1) * 0.72);
    const r = F.fenceR(Math.min(0.78, Math.abs(th)) * side) + 34 + ((i * 7.3) % 1) * 30;
    spots.push({ a: r * Math.cos(th), b: r * Math.sin(th), h: 17 + ((i * 3.7) % 9) });
  }
  /* 경기장 밖 — 밤에는 조명이 닿지 않아 어둡다(조명이 방향광이라 거리로 줄지 않으니 재질 색으로 낮춘다) */
  const palmMats = palms(F, spots);
  const { hillMat, treeMat } = hills(F);
  /* 조명 빛 번짐(밤에만) — 등 둘레에 더해 그리는 둥근 빛 */
  const glowTex = canvasTex(
    THREE,
    128,
    128,
    (c) => {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.15, 'rgba(255,250,235,0.55)');
      g.addColorStop(0.5, 'rgba(255,245,225,0.12)');
      g.addColorStop(1, 'rgba(255,245,225,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    },
    false
  );
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const glows: Three.Sprite[] = [];
  F.scene.traverse((o) => {
    const tagged = o.userData.glow as number | undefined;
    if (tagged || ((o as Three.Mesh).isMesh && (o as Three.Mesh).material === lampMat)) {
      const sp = new THREE.Sprite(glowMat);
      sp.scale.setScalar((tagged ?? 14) * F.s);
      o.getWorldPosition(sp.position);
      sp.visible = false;
      glows.push(sp);
    }
  });
  for (const g of glows) F.scene.add(g);

  /* 띠 전광판은 쓸어 만든 띠라 그늘 읽는 복사본이 그려진다 */
  const ribbon = withShade(mats.ribbon) as Three.MeshStandardMaterial;
  return {
    setNight: (on) => {
      lampMat.emissiveIntensity = on ? 4 : 0;
      bankMat.emissiveIntensity = on ? 3 : 0;
      for (const g of glows) g.visible = on;
      hillMat.color.setScalar(on ? 0.06 : 1);
      treeMat.uniforms.uLight.value = on ? 0.07 : 1;
      for (const m of palmMats) m.color.setScalar(on ? 0.2 : 1);
      ribbon.emissiveIntensity = on ? 1.4 : 1.6;
    },
  };
}
