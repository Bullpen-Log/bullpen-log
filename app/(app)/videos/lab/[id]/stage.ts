import type * as Three from 'three';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
import { V2J } from '@/lib/pitch-3d/v2/contract';
import type { DisplayTrack } from '@/lib/pitch-3d/v2/display';
import { MOUND } from '@/lib/pitch-3d/v2/pose-rig';

/**
 * 투구 3D 보기의 무대 — 바탕 · 조명 · 바닥 · 마운드 · 축 화살표. 사람(뼈대 · 데생 인형)은 body-3d.tsx 가 그린다.
 *
 * 2026-10-11 김민: 사람(데생 인형)은 금윤호가, 무대(메이저리그 · KBO 야구장처럼)는 김민이 같은 때 만들기로 해서 body-3d.tsx 에서 떼었다.
 * body-3d.tsx 는 buildStage 한 번만 부른다 — 무대를 바꿀 때는 이 파일만 고친다.
 *
 * 좌표: 앱 3D 무대와 같다 — y 위, x 홈 쪽, z 오른쪽, 키 = 1(displayTrack). 바닥 높이는 track.groundAt(마운드 경사).
 */

const BG = '#151722';
const GRID_A = '#2b3141';
const GRID_B = '#1e2230';
const RUBBER_COLOR = '#e9e6df';
const AXIS = { home: '#ef4444', up: '#3b82f6', side: '#38bdf8' } as const;

/**
 * 간이 마운드(불펜 · 실내용 이동식) — 폭 1.22m(4ft) 직사각형, 투수판 뒤 0.6m 에서 수직으로 끊기고 앞으로 규격 경사(1ft 에 1in)로
 * 땅까지 내려간다(투수판 앞 약 3.2m). 윗면 높이는 규격 높이 함수 f 그대로라 발이 닿는 높이(display.ts)와 맞는다. 옆 · 뒤는 수직 벽.
 * 2026-10-11 김민: 규격 마운드(지름 5.49m)는 "너무 커서 간이마운드로".
 */
const PORTABLE = { width: 1.22, back: 0.6 } as const;

function moundGeometry(
  THREE: typeof import('three'),
  f: (x: number, z: number) => number,
  x0: number,
  z0: number,
  s: number
): Three.BufferGeometry {
  const lift = 0.002;
  const xb = x0 - PORTABLE.back * s;
  const xf = x0 + (MOUND.flatFront + MOUND.top * 12) * s;
  const hw = (PORTABLE.width / 2) * s;
  const nx = 64;
  const nz = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  const grid = (pt: (i: number, j: number) => [number, number, number], ni: number, nj: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) pos.push(...pt(i, j));
    for (let i = 0; i < ni; i++)
      for (let j = 0; j < nj; j++) {
        const a = base + i * (nj + 1) + j;
        const b = a + nj + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  };
  const X = (i: number) => xb + ((xf - xb) * i) / nx;
  const Z = (j: number) => z0 - hw + (2 * hw * j) / nz;
  /* 윗면(재질 0) · 옆과 뒤 벽(재질 1) */
  grid((i, j) => [X(i), f(X(i), Z(j)) + lift, Z(j)], nx, nz);
  const topCount = idx.length;
  /* 옆 벽 둘(바닥 → 윗면) — 감는 방향은 바깥이 앞면 */
  grid((i, k) => [X(i), k * (f(X(i), z0 - hw) + lift), z0 - hw], nx, 1);
  grid((i, k) => [X(i), (1 - k) * (f(X(i), z0 + hw) + lift), z0 + hw], nx, 1);
  /* 뒤 벽 */
  grid((k, j) => [xb, k * (f(xb, Z(j)) + lift), Z(j)], 1, nz);
  /* 흙 그림 좌표 — 미터(가운데 기준)를 uv 에 담는다(moundMaterial 이 되읽음) */
  const cx = x0 + MOUND.centerAhead * s;
  const R = MOUND.radius * s;
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push((pos[i] - cx) / (2 * R) + 0.5, (pos[i + 2] - z0) / (2 * R) + 0.5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, topCount, 0);
  g.addGroup(topCount, idx.length - topCount, 1);
  g.computeVertexNormals();
  return g;
}

/**
 * 마운드 흙 — 다저스타디움 무대(2026-10-11, 28f8ab7)에서 쓰던 흙 그대로: 흙 사진(Poly Haven 'baseball_playground', CC0)을 두 크기로 겹쳐
 * 사진 평균색으로 나눈 결만 남기고, 가운데는 붉은 점토 · 가장자리는 주황 황토로 섞는다. 디딤발 자리(투수판 앞 1.54m)는 움푹 짙게.
 * 흙 굴곡은 같은 사진의 노멀 맵. 사진이 오기 전엔 색만.
 */
function moundMaterial(THREE: typeof import('three')) {
  const R = MOUND.radius;
  const dirt = { value: null as Three.Texture | null };
  const on = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = dirt;
    sh.uniforms.uOn = on;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvMp = (uv - 0.5) * ${(2 * R).toFixed(4)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMp;\nuniform sampler2D uDirt;\nuniform float uOn;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 p = vMp;
          vec3 a = texture2D(uDirt, p / 3.0).rgb;
          vec3 b = texture2D(uDirt, mat2(0.6, 0.8, -0.8, 0.6) * p / 7.1 + 0.21).rgb;
          vec3 t = mix(a, b, 0.5);
          vec3 dTex = mix(vec3(dot(t, vec3(0.2126, 0.7152, 0.0722)) / 0.187), t / vec3(0.250, 0.176, 0.114), 0.4);
          /* 가장자리 0.25m 는 황토, 안쪽은 붉은 점토 */
          float clay = 0.85 * smoothstep(0.03, 0.25, min(${(PORTABLE.width / 2).toFixed(3)} - abs(p.y), min(p.x + ${(PORTABLE.back + MOUND.centerAhead).toFixed(3)}, ${(MOUND.flatFront + MOUND.top * 12 - MOUND.centerAhead).toFixed(3)} - p.x)));
          vec3 col = pow(mix(vec3(0.80, 0.53, 0.35), vec3(0.70, 0.40, 0.27), clay * 0.95), vec3(2.2));
          float dig = 1.0 - smoothstep(-0.15, 0.15, length(p - vec2(${(1.54 - MOUND.centerAhead).toFixed(3)}, 0.0)) - 0.55);
          diffuseColor.rgb *= col * mix(vec3(1.0), dTex, uOn) * (1.0 - 0.12 * dig);
        }`
      );
  };
  const loader = new THREE.TextureLoader();
  loader.load('/stage/dirt.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    dirt.value = t;
    on.value = 1;
  });
  loader.load('/stage/dirt_n.jpg', (t) => {
    /* 노멀 맵은 색이 아니라 방향 — sRGB 로 풀면 기울기가 틀어진다. uv 한 장 = 지름 5.49m, 사진 한 장 = 3m */
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.setScalar((2 * R) / 3);
    t.anisotropy = 8;
    mat.normalMap = t;
    mat.normalScale.setScalar(0.8);
    mat.needsUpdate = true;
  });
  return mat;
}

/** 평지 — 축발(먼저 땅에 닿은 발)이 처음 닿은 장면에서 발 뒤 가장자리 = 투수판 앞 모서리. 닿은 구간이 없으면 첫 장면의 뒤쪽 발 */
function flatSpot(track: Pick<DisplayTrack, 'frames' | 'contacts'>): { x0: number; z0: number } | null {
  const first = [...track.contacts].sort((a, b) => a.from - b.from)[0];
  const f = track.frames[first ? first.from : 0];
  if (!f) return null;
  const foot = (side: 'L' | 'R') => (side === 'L' ? [f[V2J.lHe], f[V2J.lTo]] : [f[V2J.rHe], f[V2J.rTo]]);
  const side = first ? first.side : Math.min(f[V2J.lHe][0], f[V2J.lTo][0]) < Math.min(f[V2J.rHe][0], f[V2J.rTo][0]) ? 'L' : 'R';
  const [he, to] = foot(side);
  return { x0: Math.min(he[0], to[0]), z0: (he[2] + to[2]) / 2 };
}

/**
 * 무대를 장면에 놓는다 — 바탕색 · 톤 · 조명 · 바닥 격자 · 마운드와 투수판 · 축 화살표(빨강 홈 · 파랑 위 · 하늘 옆).
 * center = 움직임 상자 가운데(카메라가 보는 곳), heightM = 투수 키(m, 마운드 크기를 키 단위로).
 */
export function buildStage({
  THREE,
  scene,
  renderer,
  track,
  center,
  heightM,
}: {
  THREE: typeof import('three');
  scene: Three.Scene;
  renderer: Three.WebGLRenderer;
  track: Pick<DisplayTrack, 'groundAt' | 'mound' | 'frames' | 'contacts'>;
  center: Vec3;
  heightM: number;
}): void {
  renderer.setClearColor(BG);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene.background = new THREE.Color(BG);

  scene.add(new THREE.HemisphereLight('#ffffff', '#3b4252', 0.9));
  const key = new THREE.DirectionalLight('#ffffff', 1.7);
  key.position.set(1.2, 2.2, 1.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#dbeafe', 0.6);
  rim.position.set(-1.6, 1.0, -1.2);
  scene.add(rim);

  const grid = new THREE.GridHelper(4, 16, GRID_A, GRID_B);
  grid.position.set(center[0], 0, center[2]);
  scene.add(grid);

  /* 마운드 — 투수판 앞 모서리 = 축발이 처음 닿은 자리, 높이는 두 발 자리에 맞춘 배율(display.ts) */
  /*
   * 평지에서 던진 영상(track.mound 없음)은 같은 간이 마운드를 납작하게(높이 0) 깐다 — 투수판 자리는 축발이 처음 닿은 장면의 발 뒤 가장자리
   * (2026-10-11 김민: "평지에서 던질때는 저 마운드를 그냥 평지로 납작하게").
   */
  const { groundAt } = track;
  const mound = track.mound ?? flatSpot(track);
  if (mound) {
    const s = 1 / heightM;
    scene.add(
      new THREE.Mesh(
        moundGeometry(THREE, track.mound ? groundAt : () => 0, mound.x0, mound.z0, s),
        /* 옆 · 뒤 벽 — 이동식 마운드 틀(짙은 갈색) */
        [moundMaterial(THREE), new THREE.MeshStandardMaterial({ color: '#5a3b28', roughness: 0.95, metalness: 0 })]
      )
    );
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(MOUND.rubber.depth * s, 0.02 * s, MOUND.rubber.width * s),
      new THREE.MeshStandardMaterial({ color: RUBBER_COLOR, roughness: 0.8, metalness: 0 })
    );
    rubber.position.set(
      mound.x0 - (MOUND.rubber.depth * s) / 2,
      groundAt(mound.x0, mound.z0) + 0.01 * s,
      mound.z0
    );
    scene.add(rubber);
  }

  const corner = new THREE.Vector3(center[0] - 1.7, 0.002, center[2] - 1.7);
  const arrow = (dir: [number, number, number], color: string) =>
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(...dir), corner, 0.35, color, 0.08, 0.04));
  arrow([1, 0, 0], AXIS.home);
  arrow([0, 1, 0], AXIS.up);
  arrow([0, 0, 1], AXIS.side);
}
