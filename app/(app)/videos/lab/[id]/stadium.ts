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

const SEAT = {
  field: '#f1c33f',
  loge: '#f08b3b',
  club: '#d65a4a',
  reserve: '#2e6fc4',
  top: '#7cc0ea',
  pavilion: '#2e6fc4',
};
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
    segs.push({ w0: w + d * 0.66, z0: z + 0.8, w1: w + d, z1: z + 0.8, kind: 'riser', shade });
    segs.push({ w0: w + d, z0: z + 0.8, w1: w + d, z1: z + rise, kind: 'riser', shade: shade * 0.8 });
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
  z1At?: (sg: Seg, p: PathPt) => number
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
      for (const [w, z, v] of [
        [sg.w0, sg.z0, 0],
        [sg.w1, z1At ? z1At(sg, p) : sg.z1, 1],
      ] as const) {
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
function seatTextures(THREE: typeof import('three'), color: string) {
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

/** 본 관중석 앞 벽 선 — 3 · 1루 파울선에서 foulOff 밖(폴 앞 98m 까지), 홈 뒤는 반지름 BACKSTOP_R 호. reach = 파울선을 따라 간 거리 */
export function grandstandBase(): (P2 & { reach: number })[] {
  const pts: (P2 & { reach: number })[] = [];
  const Q = Math.PI / 4;
  const line = (a: number, th: number) => {
    const n = th > 0 ? 3 * Q : -3 * Q;
    const off = foulOff(a);
    return { a: a * Math.cos(th) + off * Math.cos(n), b: a * Math.sin(th) + off * Math.sin(n), reach: a };
  };
  for (let a = 100; a > 0; a -= 2) pts.push(line(a, -Q));
  for (let i = 0; i <= 40; i++) {
    const t = -3 * Q - (2 * Q * i) / 40;
    pts.push({ a: BACKSTOP_R * Math.cos(t), b: BACKSTOP_R * Math.sin(t), reach: 0 });
  }
  for (let a = 2; a <= 100; a += 2) pts.push(line(a, Q));
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
  const CLUB_REACH = 30;
  type Deck = { key: keyof typeof SEAT; path: PathPt[]; w0: number; z0: number; w1: number; z1: number; cover: number; ribbon?: boolean };
  const decks: Deck[] = [
    { key: 'field', path: full, w0: 0, z0: 0.4, w1: 27, z1: 9, cover: 20 },
    { key: 'loge', path: part(92), w0: 20, z0: 13, w1: 36, z1: 20, cover: 33, ribbon: true },
    { key: 'club', path: part(CLUB_REACH), w0: 30, z0: 23, w1: 36, z1: 26, cover: 35 },
    { key: 'reserve', path: part(80), w0: 35, z0: 30, w1: 53, z1: 40, cover: 49 },
    { key: 'top', path: part(66), w0: 49, z0: 43, w1: 65, z1: 52, cover: 57 },
  ];
  /** 그 층 밑면의 높이(바깥 거리 w 에서) */
  const underAt = (d: Deck, w: number) => d.z0 - SLAB + ((w - d.w0) * (d.z1 - d.z0)) / (d.w1 - d.w0);
  const [field, loge, club, reserve, top] = decks;
  /* 톱 덱 위 지붕 — 앞으로 튀어나온 곡선 콘크리트(두께 0.7m), 앞 가장자리에 조명 */
  const R0 = 55;
  const R1 = 68;
  const ROOF_T = 0.45;
  const curve = (w: number) => 57.5 + 1.6 * Math.sin(((w - R0) / (R1 - R0)) * Math.PI * 0.9);
  /* 뒤 벽 꼭대기 — 위층이 있는 자리만(그 밖은 바깥 벽 높이 3m) */
  const wallTop: Record<string, (p: PathPt) => number> = {
    field: () => underAt(loge, field.w1),
    /* 클럽은 로지 뒤 벽 앞에 앉는다(뒤 줄이 같은 벽에 닿음) — 클럽 자체 뒤 벽은 없다 */
    loge: (p) => (p.reach <= 80 ? underAt(reserve, loge.w1) : loge.z1 + 3),
    club: () => club.z1,
    reserve: (p) => (p.reach <= 66 ? underAt(top, reserve.w1) : reserve.z1 + 3),
    top: () => curve(top.w1) - ROOF_T,
  };
  for (const d of decks) {
    /* 클럽 뒤 끝은 로지 뒤 벽과 같은 자리라 바깥 벽을 또 세우면 겹쳐 깜빡인다 */
    const segs = deckProfile(d.w0, d.z0, d.w1, d.z1, { under: d.key !== 'field', cover: d.cover, ribbon: d.ribbon, outer: d.key !== 'club' });
    const geos = sweep(F, d.path, segs, undefined, (sg, p) => (sg.kind === 'wall' ? wallTop[d.key](p) : sg.z1));
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
      /* 단면 그대로 — 밑(땅 또는 밑면) → 뒤 벽 꼭대기 → 의자 줄을 따라 난간 높이(1.1m)로 앞까지 */
      endCap(
        F,
        end,
        [
          [d.w0, ground ? 0 : d.z0 - SLAB],
          [d.w1, ground ? 0 : underAt(d, d.w1)],
          [d.w1, Math.max(wallTop[d.key](end), d.z1 + 1.1)],
          [d.w1 - 0.3, d.z1 + 1.1],
          [d.w0 + 0.3, d.z0 + 1.1],
          [d.w0, d.z0 + 1],
        ],
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
  addSweep(F, sweep(F, top.path, roofSegs), { roof: mats.roof, roofUnder: mats.roof, fascia: mats.fascia });
  return { roofPath: resample(top.path, 7.5), roofEdge: R0, roofZ: curve(R0) };
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

function pavilion(F: FieldFrame, side: 1 | -1, mats: Record<string, Three.Material>, seatMat: { back: Three.Material; seat: Three.Material }) {
  const pts: (P2 & { reach: number })[] = [];
  for (let i = 0; i <= 60; i++) {
    const th = side * (0.21 + ((0.775 - 0.21) * i) / 60);
    const r = F.fenceR(th);
    pts.push({ a: r * Math.cos(th), b: r * Math.sin(th), reach: 0 });
  }
  const path = resample(toPath(pts, { a: 0, b: 0 }), 1.5);
  const prof = deckProfile(3.2, 3.4, 21, 11.5, { under: false, cover: 11, wallH: 3.5 });
  addSweep(F, sweep(F, path, prof), {
    seat: seatMat.seat,
    back: seatMat.back,
    riser: mats.concrete,
    fascia: mats.fascia,
    pad: mats.ribbon,
    wall: mats.concrete,
  });
  /* 지그재그로 접힌 쇠 지붕 — 3m 마다 꼭짓점이 오르내린다 */
  const roofPath = resample(path, 3);
  const zig = (i: number) => (i % 2 ? 1.9 : 0);
  addSweep(
    F,
    sweep(F, roofPath, [
      { w0: 11, z0: 16.2, w1: 24, z1: 15.2, kind: 'roof' },
      { w0: 24, z0: 15.05, w1: 11, z1: 16.05, kind: 'roofUnder' },
    ], zig),
    { roof: mats.metal, roofUnder: mats.metalUnder }
  );
  /* 지붕 기둥 */
  const colGeo = new F.THREE.CylinderGeometry(0.22 * F.s, 0.22 * F.s, 15.2 * F.s, 8);
  for (let i = 0; i < roofPath.length; i += 4) {
    const p = roofPath[i];
    const c = new F.THREE.Mesh(colGeo, mats.steel);
    c.position.copy(F.fg(p.a + p.na * 22.5, p.b + p.nb * 22.5, 7.6 * F.s));
    c.castShadow = true;
    F.scene.add(c);
  }
  /* 끝 벽 */
  for (const end of [path[0], path[path.length - 1]])
    endCap(F, end, [[3.2, 0], [21, 0], [21, 15], [3.2, 4.4]], mats.concrete);
  return path;
}

/** 육각형 전광판(로고 없이 이닝 점수판 무늬) — 가운데 a, b 에서 홈을 본다 */
function hexBoard(F: FieldFrame, a: number, b: number, mats: Record<string, Three.Material>) {
  const { THREE, s } = F;
  const w = 26;
  const h = 12;
  const hex = new THREE.Shape();
  const pts: [number, number][] = [
    [-w / 2, 0],
    [-w / 2 + h * 0.45, h / 2],
    [w / 2 - h * 0.45, h / 2],
    [w / 2, 0],
    [w / 2 - h * 0.45, -h / 2],
    [-w / 2 + h * 0.45, -h / 2],
  ];
  hex.moveTo(pts[0][0] * s, pts[0][1] * s);
  for (const [x, y] of pts.slice(1)) hex.lineTo(x * s, y * s);
  hex.closePath();
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(hex, { depth: 1.2 * s, bevelEnabled: false }), mats.steel);
  /* 화면 — 이닝 점수판(글자 없는 숫자만, 로고 없음). 짙은 남색 바탕 + 칸 + 노란 숫자 */
  const screenTex = canvasTex(
    THREE,
    1024,
    472,
    (c) => {
      c.fillStyle = '#0a1f3f';
      c.fillRect(0, 0, 1024, 472);
      c.fillStyle = '#12305e';
      for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) c.fillRect(214 + i * 62, 100 + j * 82, 56, 74);
      c.fillStyle = '#183c74';
      c.fillRect(70, 182, 130, 74);
      c.fillRect(70, 264, 130, 74);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffd25a';
      c.font = 'bold 46px system-ui, sans-serif';
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'R', 'H', 'E'].forEach((t, i) => c.fillText(t, 242 + i * 62, 138));
      c.fillStyle = '#f4f7fb';
      c.font = 'bold 50px system-ui, sans-serif';
      const away = ['0', '0', '1', '0', '0', '0', '', '', '', '1', '4', '0'];
      const home = ['0', '2', '0', '0', '1', '', '', '', '', '3', '6', '1'];
      away.forEach((t, i) => c.fillText(t, 242 + i * 62, 220));
      home.forEach((t, i) => c.fillText(t, 242 + i * 62, 302));
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
          c.arc(320 + j * 190 + k * 40, 405, 15, 0, Math.PI * 2);
          c.fill();
        }
      });
    },
    false
  );
  const screen = new THREE.Mesh(
    new THREE.ShapeGeometry(hex),
    new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 1.2, roughness: 0.4 })
  );
  screen.scale.setScalar(0.9);
  screen.position.z = 1.25 * s;
  const g = new THREE.Group();
  g.add(frame, screen);
  const center = F.fg(a, b, 24 * s);
  g.position.copy(center);
  g.lookAt(F.fg(0, 0, 8 * s));
  frame.castShadow = true;
  F.scene.add(g);
  /* 받침 기둥 둘 */
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8 * s, 18 * s, 0.8 * s), mats.steel);
  for (const k of [-1, 1]) {
    const l = leg.clone();
    const off = new THREE.Vector3(k * 7 * s, 0, 0).applyQuaternion(g.quaternion);
    l.position.set(center.x + off.x, 9 * s, center.z + off.z);
    l.castShadow = true;
    F.scene.add(l);
  }
}

/* ───────────── 야자수(여럿을 한 번에 그림) ───────────── */

function palms(F: FieldFrame, spots: { a: number; b: number; h: number }[]) {
  const { THREE, s } = F;
  /* 잎 무늬 — 깃털 모양 잎(투명 테두리) */
  const leafTex = canvasTex(
    THREE,
    256,
    64,
    (c) => {
      c.clearRect(0, 0, 256, 64);
      c.strokeStyle = '#3f5a2a';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, 32);
      c.lineTo(256, 32);
      c.stroke();
      for (let x = 4; x < 250; x += 5) {
        const len = 30 * Math.sin((x / 256) * Math.PI) + 4;
        c.strokeStyle = x % 10 ? '#4f7034' : '#5d8040';
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(x, 32);
        c.lineTo(x + 10, 32 - len);
        c.moveTo(x, 32);
        c.lineTo(x + 10, 32 + len);
        c.stroke();
      }
    },
    false
  );
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  /* 잎 하나 — 아래로 휜 띠(길이 5m) */
  const frond = new THREE.PlaneGeometry(5, 1.4, 12, 1);
  const pos = frond.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 2.5;
    pos.setXYZ(i, x, -0.09 * x * x + 0.35 * x, pos.getY(i));
  }
  frond.computeVertexNormals();
  /* 잎 14 장을 한 덩어리로 */
  const crownParts: Three.BufferGeometry[] = [];
  for (let k = 0; k < 14; k++) {
    const g = frond.clone();
    g.rotateX(((k % 3) - 1) * 0.25);
    g.rotateY((k / 14) * Math.PI * 2);
    crownParts.push(g);
  }
  const crown = mergeGeometries(THREE, crownParts);
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

/** BufferGeometry 여럿을 하나로(위치 · 법선 · uv · index) — addons 를 안 부르려고 */
function mergeGeometries(THREE: typeof import('three'), gs: Three.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of gs) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/* ───────────── 언덕(엘리시안 파크) ───────────── */

function hills(F: FieldFrame) {
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
  const dry = new THREE.Color('#b29d6b');
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

  /* 나무 — 울퉁불퉁한 둥근 덩어리(매끈한 법선 · 아래쪽 어둡게). 나무 덮인 곳에만, 가까운 언덕(300m 안)에 촘촘히 */
  const blob = new THREE.SphereGeometry(1, 10, 7);
  {
    const p = blob.attributes.position;
    const colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.16 * Math.sin(x * 4.1 + z * 3.3 + y * 2.2) + 0.1 * Math.sin(x * 9.7 - y * 7.1 + z * 5.3);
      p.setXYZ(i, x * k, Math.max(-0.35, y) * k * 0.8, z * k);
      const g = 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.4) / 1.3));
      colors.push(g, g, g);
    }
    blob.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    blob.computeVertexNormals();
  }
  const spots: { a: number; b: number; h: number; r: number }[] = [];
  for (let k = 0; k < 9000 && spots.length < 1300; k++) {
    const th = hash(k, 1.3) * Math.PI * 2;
    const r = R0 + 6 + Math.pow(hash(k, 7.1), 1.6) * 260;
    const a = 30 + r * Math.cos(th);
    const b = r * Math.sin(th);
    if (woods(a, b) < 0.46 + hash(k, 3.3) * 0.12) continue;
    spots.push({ a, b, h: shape(a, b).h, r: 2.5 + hash(k, 5.5) * 3.5 });
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const trees = new THREE.InstancedMesh(blob, treeMat, spots.length);
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 2.2) * 6.28);
    M.compose(fg(t.a, t.b, (t.h + t.r * 0.55) * s), q, new THREE.Vector3(t.r * s, t.r * s * (1 + hash(i, 4.4) * 0.6), t.r * s));
    trees.setMatrixAt(i, M);
    c.copy(tree).multiplyScalar(0.8 + hash(i, 8.8) * 0.45).lerp(brush, hash(i, 9.9) * 0.3);
    trees.setColorAt(i, c);
  });
  trees.receiveShadow = true;
  F.scene.add(trees);
  return [hillMat, treeMat];
}

/* ───────────── 전체 ───────────── */

export type StadiumHandle = {
  /** 밤이면 조명 · 전광판을 밝힌다 */
  setNight: (on: boolean) => void;
};

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
    pad: std('#1f4d8c', 0.8),
    endCap: std('#b9b3a8', 0.95),
    ribbon: ribbonMat(THREE),
  };
  const seatMats: Record<string, { back: Three.Material; seat: Three.Material }> = {};
  for (const [k, color] of Object.entries(SEAT)) {
    const t = seatTextures(THREE, color);
    seatMats[k] = {
      back: new THREE.MeshStandardMaterial({ map: t.back, roughness: 0.55, side: THREE.DoubleSide }),
      seat: new THREE.MeshStandardMaterial({ map: t.seat, roughness: 0.75, side: THREE.DoubleSide }),
    };
  }

  const { roofPath, roofEdge, roofZ } = grandstand(F, mats, seatMats);
  dugoutsAndNet(F, mats);
  const pavL = pavilion(F, -1, mats, seatMats.pavilion);
  const pavR = pavilion(F, 1, mats, seatMats.pavilion);

  /* 전광판 — 좌우 외야석 뒤 위 */
  for (const side of [-1, 1] as const) {
    const th = side * 0.5;
    const r = F.fenceR(th) + 30;
    hexBoard(F, r * Math.cos(th), r * Math.sin(th), mats);
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
    m.position.copy(F.fg(p.a + p.na * (roofEdge + 0.5), p.b + p.nb * (roofEdge + 0.5), (roofZ + 1.2) * F.s));
    m.lookAt(F.fg(30, 0, 0));
    F.scene.add(m);
  }
  for (const path of [pavL, pavR]) {
    for (const k of [0.25, 0.75]) {
      const p = path[Math.floor(path.length * k)];
      const base = F.fg(p.a + p.na * 26, p.b + p.nb * 26, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * F.s, 0.7 * F.s, 38 * F.s, 10), mats.steel);
      pole.position.set(base.x, 19 * F.s, base.z);
      pole.castShadow = true;
      F.scene.add(pole);
      const bank = new THREE.Mesh(new THREE.BoxGeometry(11 * F.s, 6 * F.s, 0.8 * F.s), lampMat);
      bank.position.set(base.x, 39 * F.s, base.z);
      bank.lookAt(F.fg(40, 0, 0));
      F.scene.add(bank);
    }
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
  const hillMats = hills(F);
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
    if ((o as Three.Mesh).isMesh && (o as Three.Mesh).material === lampMat) {
      const sp = new THREE.Sprite(glowMat);
      const big = (o as Three.Mesh).geometry !== lamp;
      sp.scale.setScalar((big ? 34 : 14) * F.s);
      sp.position.copy(o.position);
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
      for (const g of glows) g.visible = on;
      for (const m of hillMats) m.color.setScalar(on ? 0.06 : 1);
      for (const m of palmMats) m.color.setScalar(on ? 0.2 : 1);
      ribbon.emissiveIntensity = on ? 1.4 : 1.6;
    },
  };
}
