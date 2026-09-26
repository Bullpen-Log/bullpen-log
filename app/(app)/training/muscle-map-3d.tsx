'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';
import { areaOfMuscle, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import {
  AREA_VIEW,
  MODEL_KEY_TO_MUSCLE,
  careLevel,
  type MapView,
} from '@/lib/armcare/muscle-map';

/** 3D 에서 고른 것 — 부위, 그 안의 근육, 누른 조각(갈래) */
export type MapSelection = {
  area: ArmcareAreaKey | null;
  muscle: string | null;
  part: string | null;
};

export type MapStatus = 'loading' | 'ready' | 'unavailable' | 'error';

const MODEL_URL = '/models/armcare-upper.glb';

/* 색 — 몸은 회색 점토, 암케어 근육은 붉은 근육색, 고른 것은 앱의 하늘색 */
const COLOR = {
  context: '#c9d1da',
  target: '#d9776a',
  pick: '#0ea5e9',
  sibling: '#7dd3fc',
  bone: '#ece4d4',
  low: '#f59e0b',
  mid: '#8fd3c4',
  good: '#2f9e8f',
} as const;

/* 보는 방향 — 모델은 앞이 +Z, 사람의 왼쪽이 +X. 오른팔 기준으로 적고 왼팔이면 X 를 뒤집는다 */
const VIEWS: Record<MapView, [number, number, number]> = {
  front: [-0.15, 0.12, 1],
  back: [-0.15, 0.15, -1],
  side: [-1, 0.12, 0.15],
  outer: [-1, 0.05, -0.55],
  top: [-0.7, 0.9, 0.35],
};

type Entry = {
  mesh: Three.Mesh;
  material: Three.MeshStandardMaterial;
  key: string | null;
  side: string | null;
  bone: boolean;
};

type Engine = {
  apply: (
    selection: MapSelection,
    counts: Partial<Record<ArmcareAreaKey, number>> | null,
    side: 'right' | 'left',
    animate: boolean
  ) => void;
  look: (view: MapView) => void;
};

/**
 * 3D 근육 지도 — 캔버스 하나. 무엇을 골랐는지는 부모(muscle-map-panel.tsx)가 쥔다.
 *
 * three 는 이 화면이 뜰 때 불러온다(import()). 앱의 다른 화면에는 한 줄도 실리지 않는다.
 * 모델(public/models/armcare-upper.glb, 약 1.3MB)도 그때 받고, 한 번 받으면 브라우저가
 * 들고 있다.
 *
 * 누르기: 처음 누르면 그 부위, 같은 부위를 한 번 더 누르면 그 근육. 부위를 고르면 그
 * 부위만 또렷하게 남고 나머지는 비쳐 보여 속 근육(견갑하근 등)도 보인다.
 *
 * 화면 밖으로 스크롤되면 그리기를 멈춘다 — 부위별 보강은 목록이 길어, 안 보이는
 * 캔버스를 계속 그리면 폰 배터리만 닳는다.
 *
 * WebGL 이 안 되는 기기에서는 아무것도 그리지 않고 'unavailable' 을 알린다. 부모가
 * 3D 자리를 접고 목록으로 보여 준다.
 */
export function MuscleMap3D({
  side,
  selection,
  counts,
  onPick,
  onStatus,
}: {
  side: 'right' | 'left';
  selection: MapSelection;
  /** 내 기록 색칠 — 부위별 최근 2주 체크 수. null 이면 부위 보기 */
  counts: Partial<Record<ArmcareAreaKey, number>> | null;
  onPick: (next: MapSelection) => void;
  onStatus: (status: MapStatus) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');

  /* 콜백과 지금 값은 ref 로 든다 — 캔버스는 한 번만 만들고, 누를 때 최신 값을 본다 */
  const latest = useRef({ selection, counts, side, onPick, onStatus });
  useEffect(() => {
    latest.current = { selection, counts, side, onPick, onStatus };
  });

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    const report = (s: MapStatus) => {
      if (disposed) return;
      setStatus(s);
      latest.current.onStatus(s);
    };

    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
      report('unavailable');
      return;
    }

    (async () => {
      const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] =
        await Promise.all([
          import('three'),
          import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/controls/OrbitControls.js'),
          import('three/addons/environments/RoomEnvironment.js'),
        ]);
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.95;
      renderer.localClippingEnabled = true;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.setAttribute('aria-label', '3D 근육 지도');
      el.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envMap;
      scene.environmentIntensity = 0.45;

      const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
      scene.add(camera);
      /* 빛은 카메라를 따라 돈다 — 어느 쪽에서 봐도 앞에서 비추고 뒤에서 테두리를 살린다 */
      const lights: Three.DirectionalLight[] = [
        new THREE.DirectionalLight('#ffffff', 2.4),
        new THREE.DirectionalLight('#e0f2fe', 0.6),
        new THREE.DirectionalLight('#ffffff', 1.4),
      ];
      lights[0].position.set(-0.8, 1.2, 1.4);
      lights[1].position.set(1.2, 0.2, 0.8);
      lights[2].position.set(0.4, 0.8, -1.6);
      for (const light of lights) {
        light.target.position.set(0, 0, -1);
        camera.add(light, light.target);
      }
      scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 0.35));

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.rotateSpeed = 0.8;
      controls.minDistance = 0.25;
      controls.maxDistance = 3.5;

      let gltf: Awaited<ReturnType<InstanceType<typeof GLTFLoader>['loadAsync']>>;
      try {
        gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      } catch {
        renderer.dispose();
        renderer.domElement.remove();
        report('error');
        return;
      }
      if (disposed) {
        renderer.dispose();
        return;
      }

      const root = gltf.scene;
      root.updateMatrixWorld(true);

      /*
       * 몸통 아래를 자르는 면 — 팔꿈치보다 아래이고 두 팔 사이(몸통 쪽)인 곳만 잘라,
       * 팔뚝과 손은 남긴다. 세 면에 모두 걸릴 때만 자른다(clipIntersection).
       * 모델을 만들 때 이미 대부분 지웠고(scripts/build-arm-model.mjs), 여기서는 단면을
       * 깨끗하게 만든다.
       */
      const boxOf = (test: (u: Record<string, unknown>) => boolean) => {
        const box = new THREE.Box3();
        root.traverse((o) => {
          if ((o as Three.Mesh).isMesh && test(o.userData)) box.expandByObject(o);
        });
        return box;
      };
      const upperArms = boxOf((u) => u.region === 'arms');
      const forearmR = boxOf((u) => u.side === 'right' && u.region === 'forearms');
      const forearmL = boxOf((u) => u.side === 'left' && u.region === 'forearms');
      const waistY = upperArms.min.y - 0.04;
      const clips = [
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -waistY),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), forearmR.max.x + 0.015),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -(forearmL.min.x - 0.015)),
      ];

      const entries: Entry[] = [];
      root.traverse((o) => {
        const mesh = o as Three.Mesh;
        if (!mesh.isMesh) return;
        const u = mesh.userData as Record<string, string | undefined>;
        const bone = u.boneId != null;
        const material = new THREE.MeshStandardMaterial({
          color: bone ? COLOR.bone : COLOR.context,
          roughness: bone ? 0.75 : 0.62,
          metalness: 0,
          side: THREE.DoubleSide,
          clippingPlanes: clips,
          clipIntersection: true,
        });
        mesh.material = material;
        entries.push({
          mesh,
          material,
          key: u.muscleId ? (u.key ?? null) : null,
          side: u.side ?? null,
          bone,
        });
      });
      scene.add(root);

      /* 지금 던지는 팔 기준으로 조각이 누구인지 */
      const muscleOf = (e: Entry, arm: 'right' | 'left') =>
        e.key && e.side === arm ? (MODEL_KEY_TO_MUSCLE.get(e.key) ?? null) : null;

      /* ── 카메라 ── */
      const fit = (radius: number, pad: number) => {
        const v = THREE.MathUtils.degToRad(camera.fov);
        const h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
        return (radius * pad) / Math.sin(Math.min(v, h) / 2);
      };
      const frame = (s: MapSelection, arm: 'right' | 'left') => {
        const box = new THREE.Box3();
        for (const e of entries) {
          const name = muscleOf(e, arm);
          if (!name) continue;
          const hit = s.muscle
            ? name === s.muscle
            : s.area
              ? areaOfMuscle(name)?.key === s.area
              : ['shoulder', 'arms', 'forearms'].includes(
                  String(e.mesh.userData.region)
                );
          if (hit) box.expandByObject(e.mesh);
        }
        const center = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2;
        const pad = s.muscle ? 1.9 : s.area ? 1.7 : 0.82;
        return { center, dist: Math.max(fit(radius, pad), s.area ? 0.35 : 0.5) };
      };
      const dirOf = (view: MapView, arm: 'right' | 'left') => {
        const [x, y, z] = VIEWS[view];
        return new THREE.Vector3(arm === 'left' ? -x : x, y, z).normalize();
      };

      let tween: {
        t: number;
        fromOff: Three.Vector3;
        toOff: Three.Vector3;
        fromTarget: Three.Vector3;
        toTarget: Three.Vector3;
      } | null = null;
      const reduced = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const moveTo = (
        center: Three.Vector3,
        dir: Three.Vector3,
        dist: number,
        animate: boolean
      ) => {
        const toPos = center.clone().addScaledVector(dir, dist);
        if (!animate || reduced()) {
          tween = null;
          controls.target.copy(center);
          camera.position.copy(toPos);
          controls.update();
          return;
        }
        tween = {
          t: 0,
          fromOff: camera.position.clone().sub(controls.target),
          toOff: toPos.clone().sub(center),
          fromTarget: controls.target.clone(),
          toTarget: center,
        };
      };

      /* ── 칠하기 ── */
      const target = new THREE.Color();
      const black = new THREE.Color('#000000');
      let lastKey = '';
      const apply: Engine['apply'] = (s, counts, arm, animate) => {
        for (const e of entries) {
          const name = muscleOf(e, arm);
          const area = name ? areaOfMuscle(name)?.key : undefined;
          let color: string = e.bone ? COLOR.bone : name ? COLOR.target : COLOR.context;
          if (counts && area) color = COLOR[careLevel(counts[area] ?? 0)];
          const inArea = !!s.area && area === s.area;
          const on = inArea && (!s.muscle || name === s.muscle);
          const sibling = inArea && !on;
          if (!counts && on) color = COLOR.pick;
          if (!counts && sibling) color = COLOR.sibling;
          target.set(color);
          e.material.color.copy(target);
          e.material.emissive.copy(on ? target : black);
          e.material.emissiveIntensity = on
            ? s.muscle && e.key === s.part
              ? 0.42
              : 0.18
            : 0;
          /* 고른 것이 있으면 나머지를 비춰 보이게 — 속 근육도 보인다 */
          const faded = !!s.area && !on;
          e.material.transparent = faded;
          e.material.opacity = faded
            ? sibling
              ? 0.4
              : e.bone
                ? 0.35
                : name
                  ? 0.12
                  : 0.06
            : 1;
          e.material.depthWrite = !faded;
          e.material.needsUpdate = true;
        }
        /* 고른 것이 바뀌었을 때만 카메라를 옮긴다 — 색만 바꿀 때 시점이 튀지 않게 */
        const key = `${arm}|${s.area}|${s.muscle}`;
        if (key !== lastKey) {
          lastKey = key;
          const { center, dist } = frame(s, arm);
          moveTo(
            center,
            dirOf(s.area ? AREA_VIEW[s.area] : 'front', arm),
            dist,
            animate
          );
        }
      };
      const look: Engine['look'] = (view) => {
        const { selection: s, side: arm } = latest.current;
        const { center, dist } = frame(s, arm);
        moveTo(center, dirOf(view, arm), dist, true);
      };

      /* ── 누르기 — 끌기와 가른다 ── */
      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let down: [number, number] | null = null;
      const onDown = (e: PointerEvent) => {
        down = [e.clientX, e.clientY];
      };
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
        const r = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1
        );
        ray.setFromCamera(pointer, camera);
        const hits = ray.intersectObjects(
          entries.map((x) => x.mesh),
          false
        );
        const { selection: s, side: arm, onPick } = latest.current;
        for (const h of hits) {
          const e = entries.find((x) => x.mesh === h.object);
          const name = e ? muscleOf(e, arm) : null;
          const area = name ? areaOfMuscle(name)?.key : null;
          if (!name || !area) continue;
          /* 처음 누르면 부위, 같은 부위를 한 번 더 누르면 그 근육 */
          onPick(
            area === s.area
              ? { area, muscle: name, part: e!.key }
              : { area, muscle: null, part: null }
          );
          return;
        }
        if (hits.length === 0) onPick({ area: null, muscle: null, part: null });
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      /* ── 크기 · 그리기 ── */
      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const sizer = new ResizeObserver(resize);
      sizer.observe(el);
      resize();

      const tick = () => {
        if (tween) {
          tween.t = Math.min(1, tween.t + 0.045);
          const k = 1 - Math.pow(1 - tween.t, 3);
          controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
          /* 몸을 뚫고 가지 않게 둘레를 돌아서 간다 */
          const a = new THREE.Spherical().setFromVector3(tween.fromOff);
          const b = new THREE.Spherical().setFromVector3(tween.toOff);
          let dTheta = b.theta - a.theta;
          if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
          if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
          const s = new THREE.Spherical(
            a.radius + (b.radius - a.radius) * k,
            a.phi + (b.phi - a.phi) * k,
            a.theta + dTheta * k
          );
          camera.position
            .copy(controls.target)
            .add(new THREE.Vector3().setFromSpherical(s));
          if (tween.t >= 1) tween = null;
        }
        controls.update();
        renderer.render(scene, camera);
      };
      const seen = new IntersectionObserver(([entry]) => {
        renderer.setAnimationLoop(entry?.isIntersecting ? tick : null);
      });
      seen.observe(el);

      engine.current = { apply, look };
      const now = latest.current;
      apply(now.selection, now.counts, now.side, false);
      report('ready');

      cleanup = () => {
        engine.current = null;
        seen.disconnect();
        sizer.disconnect();
        renderer.setAnimationLoop(null);
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointerup', onUp);
        controls.dispose();
        for (const e of entries) {
          e.mesh.geometry.dispose();
          e.material.dispose();
        }
        envMap.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => report('error'));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  /* 고른 것 · 색칠 · 팔이 바뀌면 칠을 다시 한다 */
  useEffect(() => {
    engine.current?.apply(selection, counts, side, true);
  }, [selection, counts, side, status]);

  return (
    <div ref={holder} className="relative h-full w-full touch-none">
      {status === 'ready' && (
        <div className="absolute top-2.5 right-2.5 grid gap-1.5">
          {(
            [
              ['front', '앞'],
              ['side', '옆'],
              ['back', '뒤'],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => engine.current?.look(view)}
              aria-label={`${label}에서 보기`}
              className="rounded-lg border border-line bg-surface/90 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm transition-colors hover:border-sky hover:text-sky"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {status === 'loading' && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted">
          3D 근육 지도를 불러오는 중…
        </p>
      )}
      {status === 'error' && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm break-keep text-muted">
          3D 모델을 불러오지 못했습니다. 아래 목록으로 보세요.
        </p>
      )}
      {status === 'ready' && (
        <p className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] text-muted">
          끌어서 돌리기 · 근육 누르기
        </p>
      )}
    </div>
  );
}
