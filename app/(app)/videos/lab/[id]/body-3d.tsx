'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pause, Play } from 'lucide-react';
import type * as Three from 'three';
import { Segmented } from '@/components/segmented';
import { hasWebGL } from '@/components/three-stage';
import { CHIP_BASE, CHIP_ON } from '@/components/velocity/kit';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
import { V2J, type Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import type { LabGround } from '@/lib/pitch-lab-meta';
import {
  MOUND,
  moundHeightAt,
  PART_NAMES,
  placePoint,
  readSkeletonParts,
  rigPose,
  throwingArmParts,
  type PartName,
  type RigPose,
  type SkeletonParts,
} from '@/lib/pitch-3d/v2/pose-rig';

/**
 * 투구 3D 보기(설계 pitch-3d-quality.md 0절 · 화면 결정 9~16) — 해부학 뼈 15조각(body-full.glb 를 skeleton-parts.json 으로 가름)을
 * 맞춘 관절에 붙여 움직인다. 어두운 바탕 · 흰 뼈 · 던지는 팔만 옅은 sky · 격자 · 축 화살표(빨강 = 홈, 파랑 = 위, 하늘 = 옆).
 *
 *   - 3D 가 기준 시계(결정 12): 1× · ½× · ¼×. 처음 열면 ½× 로 한 번 틀고 릴리스에서 멈춤(결정 9), 그 뒤 재생은 되풀이. 움직임 줄이기면 자동 재생 없음.
 *   - 고정 카메라 4각도(결정 10): 옆(3루 쪽) · 뒤(2루 쪽) · 포수(홈 쪽 가슴 높이) · 위(70°). 끌기 = 좌우 돌리기(위아래 5~80°), Ctrl + 휠 · 두 손가락 = 확대, 시점을 누르면 되돌림.
 *   - 재생 막대에 확신 낮은 구간은 엷은 회색(결정 13), 그 안이면 '이 구간은 영상에서 잘 안 보였어요.'
 *   - 키보드(결정 16): 칸에 초점이 있을 때만 스페이스 재생/멈춤 · ←/→ 한 장면 · Shift 10장면.
 *   - 원본 영상 두 칸은 부모(lab-detail.tsx)가 onTransport 로 따라간다.
 *
 * three 는 import() 로 — 결과를 안 여는 화면에 실리지 않는다. 모델 · 조각 표는 모듈에 한 번만 받아 둔다.
 */

export type Speed = 1 | 0.5 | 0.25;
export type ViewName = 'side' | 'back' | 'catcher' | 'top';
export type Transport = {
  frame: number;
  playing: boolean;
  speed: Speed;
  reason: 'tick' | 'seek' | 'toggle' | 'speed';
};
export type Body3DHandle = { seek: (frame: number) => void };

const BG = '#151722';
const BONE = '#eef2f7';
const ARM = '#63b6ee';
const GRID_A = '#2b3141';
const GRID_B = '#1e2230';
/** 마운드 · 투수판 — 바탕보다 조금 밝은 무채색(뼈대 · 던지는 팔이 먼저 보이게) */
const MOUND_COLOR = '#2c303d';
const RUBBER_COLOR = '#d6dbe3';
const AXIS = { home: '#ef4444', up: '#3b82f6', side: '#38bdf8' } as const;
const VIEWS: { value: ViewName; label: string }[] = [
  { value: 'side', label: '옆' },
  { value: 'back', label: '뒤' },
  { value: 'catcher', label: '포수' },
  { value: 'top', label: '위' },
];
const SPEEDS: { value: Speed; label: string }[] = [
  { value: 1, label: '1×' },
  { value: 0.5, label: '½×' },
  { value: 0.25, label: '¼×' },
];
const EVENT_LABELS = { kneeUp: '니업', footPlant: '착지', release: '릴리스' } as const;

/* ───────────────────────────── 모델(한 번만) ───────────────────────────── */

type ThreeMods = [
  typeof import('three'),
  typeof import('three/addons/loaders/GLTFLoader.js'),
  typeof import('three/addons/controls/OrbitControls.js'),
];
let mods: Promise<ThreeMods> | null = null;
const loadThree = () => {
  if (!mods) {
    mods = Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
    ]);
    mods.catch(() => {
      mods = null;
    });
  }
  return mods;
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

type Skeleton = {
  parts: SkeletonParts;
  geometries: Record<PartName, Three.BufferGeometry>;
};
let skeleton: Promise<Skeleton> | null = null;

/** 뼈대 메시를 조각 표로 부위별로 가른다 — 삼각형은 세 정점 중 다수 부위로 */
function loadSkeleton(
  THREE: typeof import('three'),
  GLTFLoader: ThreeMods[1]['GLTFLoader']
) {
  if (!skeleton) {
    skeleton = (async () => {
      const [gltf, raw] = await Promise.all([
        new GLTFLoader().loadAsync('/models/body-full.glb'),
        fetch('/models/skeleton-parts.json').then((r) => r.json()),
      ]);
      const parts = readSkeletonParts(raw);
      if (!parts) throw new Error('조각 표');
      let mesh: Three.Mesh | null = null;
      /* GLTFLoader 는 이름의 점을 지운다(skeleton__mobile.001 → skeleton__mobile001) — 이름이 안 맞으면 정점 수로 찾는다 */
      const wanted = parts.mesh.replace(/[.\s]/g, '');
      gltf.scene.traverse((o) => {
        const m = o as Three.Mesh;
        if (!m.isMesh) return;
        if (o.name === parts.mesh || o.name.replace(/[.\s]/g, '') === wanted) mesh = m;
        else if (!mesh && m.geometry.attributes.position?.count === parts.vertexCount)
          mesh = m;
      });
      if (!mesh) throw new Error('뼈대 메시');
      const geo = (mesh as Three.Mesh).geometry;
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const index = geo.index;
      if (!index || !nor || pos.count !== parts.vertexCount) throw new Error('정점 수');
      const vp = Uint8Array.from(atob(parts.vertexPart), (c) => c.charCodeAt(0));
      const tris: number[][] = PART_NAMES.map(() => []);
      for (let t = 0; t < index.count; t += 3) {
        const a = index.getX(t);
        const b = index.getX(t + 1);
        const c = index.getX(t + 2);
        const pa = vp[a];
        const pb = vp[b];
        const pc = vp[c];
        tris[pa === pb || pa === pc ? pa : pb === pc ? pb : pa].push(a, b, c);
      }
      const geometries = {} as Record<PartName, Three.BufferGeometry>;
      PART_NAMES.forEach((name, i) => {
        const ids = tris[i];
        const p = new Float32Array(ids.length * 3);
        const n = new Float32Array(ids.length * 3);
        ids.forEach((v, k) => {
          p[k * 3] = pos.getX(v);
          p[k * 3 + 1] = pos.getY(v);
          p[k * 3 + 2] = pos.getZ(v);
          n[k * 3] = nor.getX(v);
          n[k * 3 + 1] = nor.getY(v);
          n[k * 3 + 2] = nor.getZ(v);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        geometries[name] = g;
      });
      return { parts, geometries };
    })();
    skeleton.catch(() => {
      skeleton = null;
    });
  }
  return skeleton;
}

/* ───────────────────────────── 보기 ───────────────────────────── */

type Status = 'loading' | 'ready' | 'unavailable' | 'error';

export const Body3D = forwardRef<
  Body3DHandle,
  {
    result: Pitch3dV2Ok;
    onTransport?: (t: Transport) => void;
    /** 던진 곳 — 마운드면 규격 마운드를 놓고 발을 그 경사 위에(없으면 마운드) */
    ground?: LabGround;
    /** 투수 키(cm) — 마운드 크기를 키 단위로 바꾼다(없으면 180) */
    heightCm?: number | null;
  }
>(function Body3D({ result, onTransport, ground = 'mound', heightCm }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>(() =>
    typeof window !== 'undefined' && !hasWebGL() ? 'unavailable' : 'loading'
  );
  const [frame, setFrame] = useState(result.events.release);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.5);
  const [view, setView] = useState<ViewName>('side');
  const [retry, setRetry] = useState(0);
  const n = result.t.length;

  /* 무대에 내리는 명령(렌더 루프가 읽는다) */
  const ctrl = useRef<{
    seek: (k: number) => void;
    play: (on: boolean) => void;
    speed: (s: Speed) => void;
    view: (v: ViewName, animate: boolean) => void;
  } | null>(null);
  const transport = useRef(onTransport);
  useEffect(() => {
    transport.current = onTransport;
  }, [onTransport]);

  /* 장면 → 관절(키 = 1) */
  const frames = useMemo(
    () =>
      result.joints.map((fr) =>
        fr.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000] as Vec3)
      ),
    [result.joints]
  );
  /*
   * 움직임 상자 — 카메라 거리 · 격자 자리. 관절 자리의 2~98% 로 잡는다(튄 장면 하나가 상자를 키의 절반만큼 부풀려 처음 화면이
   * 멀었다 — 2026-10-08 샘플 1 첫 장면 손목 503mm). 높이는 바닥(0) ~ 위 끝.
   */
  const bounds = useMemo(() => {
    const axes: number[][] = [[], [], []];
    for (const fr of frames) for (const p of fr) for (let d = 0; d < 3; d++) axes[d].push(p[d]);
    const pct = (xs: number[], q: number) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] ?? 0;
    };
    const mn: Vec3 = [pct(axes[0], 0.02), 0, pct(axes[2], 0.02)];
    const mx: Vec3 = [pct(axes[0], 0.98), Math.max(1, pct(axes[1], 0.98)), pct(axes[2], 0.98)];
    const center: Vec3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const half: Vec3 = [
      Math.max(0.3, (mx[0] - mn[0]) / 2),
      Math.max(0.5, (mx[1] - mn[1]) / 2),
      Math.max(0.3, (mx[2] - mn[2]) / 2),
    ];
    return { center, half };
  }, [frames]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!hasWebGL()) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const [THREE, { GLTFLoader }, { OrbitControls }] = await loadThree();
      const { parts, geometries } = await loadSkeleton(THREE, GLTFLoader);
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(BG);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'pan-y';
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG);
      scene.add(new THREE.HemisphereLight('#ffffff', '#3b4252', 0.9));
      const key = new THREE.DirectionalLight('#ffffff', 1.7);
      key.position.set(1.2, 2.2, 1.6);
      scene.add(key);
      const rim = new THREE.DirectionalLight('#dbeafe', 0.6);
      rim.position.set(-1.6, 1.0, -1.2);
      scene.add(rim);

      const { center, half } = bounds;
      const grid = new THREE.GridHelper(4, 16, GRID_A, GRID_B);
      grid.position.set(center[0], 0, center[2]);
      scene.add(grid);
      /* 마운드 — 투수판 앞 모서리 = 니업 때 축발(던지는 손 쪽) 발목 자리 */
      const heightM = (heightCm ?? 180) / 100;
      let groundAt: ((x: number, z: number) => number) | undefined;
      let lift = 0;
      if (ground === 'mound') {
        const pivot = frames[result.events.kneeUp ?? 0][result.hand === 'L' ? V2J.lAn : V2J.rAn];
        const s = 1 / heightM;
        groundAt = moundHeightAt(pivot[0], pivot[2], heightM);
        lift = MOUND.top * s;
        scene.add(
          new THREE.Mesh(
            moundGeometry(THREE, groundAt, pivot[0] + MOUND.centerAhead * s, pivot[2], MOUND.radius * s),
            new THREE.MeshStandardMaterial({ color: MOUND_COLOR, roughness: 1, metalness: 0 })
          )
        );
        const rubber = new THREE.Mesh(
          new THREE.BoxGeometry(MOUND.rubber.depth * s, 0.02 * s, MOUND.rubber.width * s),
          new THREE.MeshStandardMaterial({ color: RUBBER_COLOR, roughness: 0.8, metalness: 0 })
        );
        rubber.position.set(pivot[0] - (MOUND.rubber.depth * s) / 2, lift + 0.01 * s, pivot[2]);
        scene.add(rubber);
      }
      const corner = new THREE.Vector3(center[0] - 1.7, 0.002, center[2] - 1.7);
      const arrow = (dir: [number, number, number], color: string) =>
        scene.add(
          new THREE.ArrowHelper(
            new THREE.Vector3(...dir),
            corner,
            0.35,
            color,
            0.08,
            0.04
          )
        );
      arrow([1, 0, 0], AXIS.home);
      arrow([0, 1, 0], AXIS.up);
      arrow([0, 0, 1], AXIS.side);

      const boneMat = new THREE.MeshStandardMaterial({
        color: BONE,
        roughness: 0.62,
        metalness: 0,
      });
      const armMat = new THREE.MeshStandardMaterial({
        color: ARM,
        roughness: 0.55,
        metalness: 0,
        emissive: new THREE.Color(ARM),
        emissiveIntensity: 0.22,
      });
      const arm = new Set(throwingArmParts(result.hand));
      const meshes = {} as Record<PartName, Three.Mesh>;
      for (const name of PART_NAMES) {
        const m = new THREE.Mesh(geometries[name], arm.has(name) ? armMat : boneMat);
        m.matrixAutoUpdate = false;
        scene.add(m);
        meshes[name] = m;
      }

      const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 60);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      controls.minPolarAngle = THREE.MathUtils.degToRad(10);
      controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
      /* 마운드 위면 몸이 투수판 높이만큼 올라선다 — 겨누는 점도 그 절반만큼 */
      const target = new THREE.Vector3(center[0], center[1] + lift / 2, center[2]);
      controls.target.copy(target);
      let dirty = true;
      controls.addEventListener('change', () => {
        dirty = true;
      });
      renderer.domElement.addEventListener(
        'wheel',
        (e) => (controls.enableZoom = e.ctrlKey),
        { capture: true, passive: true }
      );
      renderer.domElement.addEventListener(
        'wheel',
        () => (controls.enableZoom = true),
        { passive: true }
      );

      /*
       * 보는 방향에서 상자가 화면 가로 · 세로에 맞는 거리 — 예전엔 상자 대각선을 지름으로 삼아 옆에서 볼 때 앞뒤 폭까지 넣어 멀었다.
       * 상자의 8 꼭짓점을 화면 가로 · 세로 축에 내려 가장 먼 것으로, 앞뒤 깊이의 절반을 더한다(가까운 쪽이 잘리지 않게).
       */
      const fitDist = (dir: Three.Vector3) => {
        const v = THREE.MathUtils.degToRad(camera.fov);
        const tanV = Math.tan(v / 2);
        const tanH = tanV * camera.aspect;
        const d = dir.clone().normalize();
        const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(up, d).normalize();
        const upS = new THREE.Vector3().crossVectors(d, right).normalize();
        let w = 0;
        let h = 0;
        let depth = 0;
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            for (const sz of [-1, 1]) {
              const c = new THREE.Vector3(sx * half[0], sy * half[1], sz * half[2]);
              w = Math.max(w, Math.abs(c.dot(right)));
              h = Math.max(h, Math.abs(c.dot(upS)));
              depth = Math.max(depth, Math.abs(c.dot(d)));
            }
        return Math.max(w / tanH, h / tanV) * 1.06 + depth;
      };
      const viewDir = (name: ViewName): Three.Vector3 => {
        const sideZ = result.hand === 'L' ? 1 : -1;
        switch (name) {
          case 'side':
            return new THREE.Vector3(0, 0.08, sideZ);
          case 'back':
            return new THREE.Vector3(-1, 0.1, 0);
          case 'catcher':
            return new THREE.Vector3(1, 0.05, 0);
          case 'top':
            return new THREE.Vector3(
              0,
              Math.sin(THREE.MathUtils.degToRad(70)),
              sideZ * Math.cos(THREE.MathUtils.degToRad(70))
            );
        }
      };
      let tween: { t: number; from: Three.Vector3; to: Three.Vector3 } | null = null;
      const moveTo = (name: ViewName, animate: boolean) => {
        const dir = viewDir(name).normalize();
        const dist = fitDist(dir);
        controls.minDistance = dist * 0.35;
        controls.maxDistance = dist * 3;
        const to = target.clone().addScaledVector(dir, dist);
        if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          camera.position.copy(to);
          controls.update();
          dirty = true;
          return;
        }
        tween = { t: 0, from: camera.position.clone(), to };
      };

      /*
       * 디딤발 — 착지 전엔 축발(던지는 손 쪽), 착지 뒤엔 앞발, 착지 앞뒤 3장면은 섞는다. 장면마다 '낮은 발'로 바닥을 잡으면 몸이 튀었다.
       */
      const fpK = result.events.footPlant;
      const pivotSide: 'L' | 'R' = result.hand === 'L' ? 'L' : 'R';
      const supportAt = (k: number) => {
        const lead = Math.max(0, Math.min(1, (k - (fpK - 3)) / 6));
        return pivotSide === 'R' ? { L: lead, R: 1 - lead } : { L: 1 - lead, R: lead };
      };
      /* 발밑 그림자 — 발이 바닥(경사면)에 닿아 있을 때만(발밑 가장 가까운 점이 키의 1.2% 안). 앞발 그림자가 생기는 장면이 착지 */
      const shadowMat = new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const shadows = (['L', 'R'] as const).map(() => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), shadowMat);
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        scene.add(m);
        return m;
      });
      const placeShadows = (pose: RigPose) => {
        (['L', 'R'] as const).forEach((side, i) => {
          const f = `foot${side}` as PartName;
          const A = parts.anchors[f];
          const pts = [A.proximal, A.distal, A.heel].map((q) => placePoint(pose[f], q, A.proximal));
          const gap = Math.min(...pts.map((w) => w[1] - (groundAt ? groundAt(w[0], w[2]) : 0)));
          const sh = shadows[i];
          sh.visible = gap < 0.012;
          if (!sh.visible) return;
          const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
          const cz = (pts[0][2] + pts[1][2] + pts[2][2]) / 3;
          const len = Math.hypot(pts[1][0] - pts[2][0], pts[1][2] - pts[2][2]);
          sh.position.set(cx, (groundAt ? groundAt(cx, cz) : 0) + 0.004, cz);
          sh.scale.set(Math.max(0.05, len * 0.62), Math.max(0.03, len * 0.3), 1);
          sh.rotation.z = -Math.atan2(pts[1][2] - pts[2][2], pts[1][0] - pts[2][0]);
        });
      };

      /* 자세 적용 */
      let prevPose: RigPose | null = null;
      const mat = new THREE.Matrix4();
      const applyFrame = (k: number) => {
        const pose = rigPose(frames[k], result.hand, parts, prevPose, groundAt, supportAt(k));
        prevPose = pose;
        placeShadows(pose);
        for (const name of PART_NAMES) {
          const p = pose[name];
          const R = p.R;
          const s = p.scale;
          const pr = parts.anchors[name].proximal;
          /* X_w = position + s·R·(X − proximal) */
          const tx = p.position[0] - s * (R[0] * pr[0] + R[1] * pr[1] + R[2] * pr[2]);
          const ty = p.position[1] - s * (R[3] * pr[0] + R[4] * pr[1] + R[5] * pr[2]);
          const tz = p.position[2] - s * (R[6] * pr[0] + R[7] * pr[1] + R[8] * pr[2]);
          mat.set(
            R[0] * s,
            R[1] * s,
            R[2] * s,
            tx,
            R[3] * s,
            R[4] * s,
            R[5] * s,
            ty,
            R[6] * s,
            R[7] * s,
            R[8] * s,
            tz,
            0,
            0,
            0,
            1
          );
          meshes[name].matrix.copy(mat);
          meshes[name].matrixWorldNeedsUpdate = true;
        }
        dirty = true;
      };

      /* 시계 */
      const t0 = result.t[0];
      const tEnd = result.t[n - 1];
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let cur = reduced ? result.events.release : 0;
      let clock = result.t[cur];
      let isPlaying = !reduced;
      let spd: Speed = 0.5;
      let stopAtRelease = !reduced;
      let lastTick = 0;
      const emit = (reason: Transport['reason']) =>
        transport.current?.({ frame: cur, playing: isPlaying, speed: spd, reason });
      const frameAt = (time: number) => {
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          if (result.t[m] <= time) lo = m;
          else hi = m;
        }
        return time >= result.t[hi] ? hi : lo;
      };
      const show = (k: number) => {
        cur = Math.max(0, Math.min(n - 1, k));
        applyFrame(cur);
        setFrame(cur);
      };
      ctrl.current = {
        seek: (k) => {
          isPlaying = false;
          stopAtRelease = false;
          setPlaying(false);
          show(k);
          clock = result.t[cur];
          emit('seek');
        },
        play: (on) => {
          isPlaying = on;
          stopAtRelease = false;
          setPlaying(on);
          if (on && cur >= n - 1) {
            show(0);
            clock = t0;
          }
          emit('toggle');
        },
        speed: (s) => {
          spd = s;
          setSpeed(s);
          emit('speed');
        },
        view: moveTo,
      };
      show(cur);
      setPlaying(isPlaying);
      emit(isPlaying ? 'toggle' : 'seek');

      const resize = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
      };
      const sizer = new ResizeObserver(resize);
      sizer.observe(host);
      resize();
      moveTo('side', false);

      let last = performance.now();
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (isPlaying) {
          clock += dt * spd;
          if (clock > tEnd) clock = t0;
          const k = frameAt(clock);
          if (k !== cur) show(k);
          if (stopAtRelease && cur >= result.events.release) {
            isPlaying = false;
            stopAtRelease = false;
            setPlaying(false);
            emit('toggle');
          } else if (now - lastTick > 500) {
            lastTick = now;
            emit('tick');
          }
        }
        if (tween) {
          tween.t = Math.min(1, tween.t + dt / 0.35);
          const e = 1 - Math.pow(1 - tween.t, 3);
          camera.position.lerpVectors(tween.from, tween.to, e);
          if (tween.t >= 1) tween = null;
          dirty = true;
        }
        if (controls.update()) dirty = true;
        if (!dirty) return;
        dirty = false;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        sizer.disconnect();
        controls.dispose();
        boneMat.dispose();
        armMat.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        ctrl.current = null;
      };
    })().catch((err) => {
      console.error('[body-3d]', err);
      if (!disposed) setStatus('error');
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [bounds, frames, n, result.events.release, result.events.kneeUp, result.events.footPlant, result.hand, result.t, retry, ground, heightCm]);

  useImperativeHandle(ref, () => ({ seek: (k) => ctrl.current?.seek(k) }), []);

  const toggle = useCallback(() => ctrl.current?.play(!playing), [playing]);
  const seek = (k: number) => ctrl.current?.seek(k);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      seek(frame + step);
    }
  };

  const lowSpan = result.lowConf.find(([a, b]) => frame >= a && frame <= b);
  const eventAt = (Object.keys(EVENT_LABELS) as (keyof typeof EVENT_LABELS)[]).find(
    (k) => result.events[k] === frame
  );
  const label = `투구 3D 모션, ${playing ? '재생 중' : '멈춤'}${eventAt ? ` · ${EVENT_LABELS[eventAt]}` : ''}`;
  const sec = (result.t[frame] - result.t[0]).toFixed(3);

  return (
    <div className="space-y-3">
      <div
        ref={hostRef}
        role="group"
        tabIndex={0}
        aria-label={label}
        onKeyDown={onKey}
        className="relative aspect-[4/5] max-h-[60vh] w-full overflow-hidden rounded-2xl bg-[#151722] outline-none focus-visible:ring-2 focus-visible:ring-sky"
      >
        {status !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#c7cfdd]">
            {status === 'loading' && <p>뼈대를 불러오는 중이에요</p>}
            {status === 'unavailable' && (
              <p>이 브라우저는 3D 를 그릴 수 없어요. 숫자는 아래에 그대로 있어요.</p>
            )}
            {status === 'error' && (
              <>
                <p>3D 를 불러오지 못했어요.</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('loading');
                    setRetry((v) => v + 1);
                  }}
                  className="min-h-10 rounded-full bg-white/10 px-4 text-sm text-white"
                >
                  다시
                </button>
              </>
            )}
          </div>
        )}
        {lowSpan && status === 'ready' && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-black/45 px-3 py-1.5 text-center text-xs text-[#dde3ee] backdrop-blur-sm">
            이 구간은 영상에서 잘 안 보였어요.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={status !== 'ready'}
          aria-label={playing ? '멈춤' : '재생'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/6 text-ink transition-colors active:bg-ink/10 disabled:opacity-40"
        >
          {playing ? (
            <Pause aria-hidden className="h-5 w-5" />
          ) : (
            <Play aria-hidden className="h-5 w-5" />
          )}
        </button>
        <Scrubber frame={frame} n={n} result={result} onSeek={seek} />
        <span className="text-numeric w-16 shrink-0 text-right text-xs text-muted">
          {sec}s
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="radiogroup" aria-label="재생 속도">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={speed === s.value}
              onClick={() => ctrl.current?.speed(s.value)}
              className={speed === s.value ? `${CHIP_BASE} ${CHIP_ON}` : CHIP_BASE}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          {(['kneeUp', 'footPlant', 'release'] as const)
            .filter((k) => result.events[k] != null)
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => seek(result.events[k]!)}
                className={
                  frame === result.events[k] ? `${CHIP_BASE} ${CHIP_ON}` : CHIP_BASE
                }
              >
                {EVENT_LABELS[k]}
              </button>
            ))}
        </div>
      </div>

      <Segmented
        label="시점"
        value={view}
        onChange={(v) => {
          setView(v);
          ctrl.current?.view(v, true);
        }}
        options={VIEWS}
      />
    </div>
  );
});

/** 재생 막대 — 엷은 회색 = 확신 낮은 구간, 작은 금 = 니업 · 착지 · 릴리스. 끌어서 장면을 고른다(키보드는 3D 칸에서) */
function Scrubber({
  frame,
  n,
  result,
  onSeek,
}: {
  frame: number;
  n: number;
  result: Pitch3dV2Ok;
  onSeek: (k: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (k: number) => (n > 1 ? (k / (n - 1)) * 100 : 0);
  const pick = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onSeek(Math.round(u * (n - 1)));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label="장면"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={frame}
      aria-valuetext={`${frame + 1} / ${n}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
      className="relative min-w-0 flex-1 touch-none py-4"
    >
      <div className="relative h-1.5 overflow-hidden rounded-full bg-ink/10">
        {result.lowConf.map(([a, b]) => (
          <span
            key={`${a}-${b}`}
            aria-hidden
            className="absolute inset-y-0 bg-muted/40"
            style={{ left: `${pct(a)}%`, width: `${Math.max(0.5, pct(b) - pct(a))}%` }}
          />
        ))}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-sky"
          style={{ width: `${pct(frame)}%` }}
        />
      </div>
      {(['kneeUp', 'footPlant', 'release'] as const).map((k) => {
        const at = result.events[k];
        if (at == null) return null;
        return (
          <span
            key={k}
            aria-hidden
            className="absolute top-2.5 h-4.5 w-0.5 -translate-x-1/2 rounded-full bg-ink/40"
            style={{ left: `${pct(at)}%` }}
          />
        );
      })}
      <span
        aria-hidden
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
        style={{ left: `${pct(frame)}%` }}
      />
    </div>
  );
}
