import type * as Three from 'three';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
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
/** 마운드 · 투수판 — 바탕보다 조금 밝은 무채색(뼈대 · 던지는 팔이 먼저 보이게) */
const MOUND_COLOR = '#2c303d';
const RUBBER_COLOR = '#d6dbe3';
const AXIS = { home: '#ef4444', up: '#3b82f6', side: '#38bdf8' } as const;

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
  track: Pick<DisplayTrack, 'groundAt' | 'mound'>;
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
  const { groundAt, mound } = track;
  if (mound) {
    const s = 1 / heightM;
    scene.add(
      new THREE.Mesh(
        moundGeometry(THREE, groundAt, mound.x0 + MOUND.centerAhead * s, mound.z0, MOUND.radius * s),
        new THREE.MeshStandardMaterial({ color: MOUND_COLOR, roughness: 1, metalness: 0 })
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
