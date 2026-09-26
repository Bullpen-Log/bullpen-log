'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';

export type BodyView = 'front' | 'back' | 'side';
export type BodyMapStatus = 'loading' | 'ready' | 'unavailable' | 'error';

const MODEL_URL = '/models/body-full.glb';

/* 색 — 몸은 회색 점토, 켠 근육은 앱의 하늘색(암케어 3D 와 같은 말) */
const COLOR = {
  context: '#c9d1da',
  bone: '#ece4d4',
  pick: '#0ea5e9',
} as const;

/* 보는 방향 — 모델은 앞이 +Z, 사람의 왼쪽이 +X */
const VIEWS: Record<BodyView, [number, number, number]> = {
  front: [0.12, 0.1, 1],
  back: [0.12, 0.12, -1],
  side: [-1, 0.1, 0.25],
};

type Entry = {
  mesh: Three.Mesh;
  material: Three.MeshStandardMaterial;
  key: string | null;
  bone: boolean;
};

type Engine = {
  apply: (keys: readonly string[], view: BodyView, animate: boolean) => void;
  look: (view: BodyView) => void;
};

/**
 * 전신 3D — 켤 근육(모델 key)만 하늘색으로, 나머지는 비쳐 보이게.
 *
 * 운동의 부위 태그를 누르면 뜨는 창이 쓴다(components/body-parts.tsx). 2026-09-26 사용자분이
 * 암케어의 근육 그림을 다른 운동 영상에도 붙여 달라고 해서 만들었다.
 *
 * 그리는 방식은 암케어 3D(app/(app)/training/muscle-map-3d.tsx)와 같다 — three 는 뜰 때
 * 불러오고(import()), 돌리거나 움직일 때만 그리고(render on demand), 화면 밖이면 멈추고,
 * 치울 때 GPU 를 돌려준다(release). 다른 점은 셋 — 전신 모델(public/models/body-full.glb,
 * 약 1.9MB)을 쓰고, 자르지 않고, 누르기(고르기)가 없다. 무엇을 켤지는 부모가 준다.
 */
export function BodyMap3D({
  keys,
  view,
  onStatus,
}: {
  /** 켤 근육 — 모델 조각 이름(lib/body-map.ts). 좌우를 가리지 않는다 */
  keys: readonly string[];
  /** 처음 볼 쪽 — 켤 것이 바뀌면 이쪽으로 돌아간다 */
  view: BodyView;
  onStatus?: (status: BodyMapStatus) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [status, setStatus] = useState<BodyMapStatus>('loading');

  const latest = useRef({ keys, view, onStatus });
  useEffect(() => {
    latest.current = { keys, view, onStatus };
  });

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    const report = (s: BodyMapStatus) => {
      if (disposed) return;
      setStatus(s);
      latest.current.onStatus?.(s);
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
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.setAttribute('aria-label', '전신 3D 근육 그림');
      el.prepend(renderer.domElement);
      let dirty = true;

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envMap;
      scene.environmentIntensity = 0.45;

      const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 30);
      scene.add(camera);
      /* 빛은 카메라를 따라 돈다 — 어느 쪽에서 봐도 앞에서 비춘다 */
      const lights = [
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
      controls.minDistance = 0.3;
      controls.maxDistance = 7;
      controls.addEventListener('change', () => {
        dirty = true;
      });
      /* 위아래로 쓸면 창(화면)이 굴러가게 — 좌우로 끌면 돈다(muscle-map-3d.tsx 와 같다) */
      renderer.domElement.style.touchAction = 'pan-y';

      const release = () => {
        controls.dispose();
        envMap.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };

      let gltf: Awaited<ReturnType<InstanceType<typeof GLTFLoader>['loadAsync']>>;
      try {
        gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      } catch {
        release();
        report('error');
        return;
      }
      if (disposed) {
        release();
        return;
      }

      const root = gltf.scene;
      root.updateMatrixWorld(true);
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
        });
        mesh.material = material;
        entries.push({
          mesh,
          material,
          key: u.muscleId ? (u.key ?? null) : null,
          bone,
        });
      });
      scene.add(root);
      const whole = new THREE.Box3().setFromObject(root);

      /* ── 카메라 ── */
      const fit = (radius: number, pad: number) => {
        const v = THREE.MathUtils.degToRad(camera.fov);
        const h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
        return (radius * pad) / Math.sin(Math.min(v, h) / 2);
      };
      const frame = (keys: readonly string[]) => {
        const want = new Set(keys);
        const box = new THREE.Box3();
        for (const e of entries)
          if (e.key && want.has(e.key)) box.expandByObject(e.mesh);
        const b = box.isEmpty() ? whole : box;
        const center = b.getCenter(new THREE.Vector3());
        const radius = b.getSize(new THREE.Vector3()).length() / 2;
        return {
          center,
          dist: Math.max(fit(radius, box.isEmpty() ? 0.85 : 1.25), 0.5),
        };
      };
      const dirOf = (view: BodyView) => new THREE.Vector3(...VIEWS[view]).normalize();

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
          dirty = true;
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
      const apply: Engine['apply'] = (keys, view, animate) => {
        const want = new Set(keys);
        const any = want.size > 0;
        for (const e of entries) {
          const on = !!e.key && want.has(e.key);
          target.set(on ? COLOR.pick : e.bone ? COLOR.bone : COLOR.context);
          e.material.color.copy(target);
          e.material.emissive.copy(on ? target : black);
          e.material.emissiveIntensity = on ? 0.22 : 0;
          /* 켠 것이 있으면 나머지는 비쳐 보이게 — 속 근육(엉덩허리근 등)도 보인다 */
          const faded = any && !on;
          e.material.transparent = faded;
          e.material.opacity = faded ? (e.bone ? 0.35 : e.key ? 0.14 : 0.08) : 1;
          e.material.depthWrite = !faded;
          e.material.needsUpdate = true;
        }
        dirty = true;
        const key = `${[...want].sort().join(',')}|${view}`;
        if (key !== lastKey) {
          lastKey = key;
          const { center, dist } = frame(keys);
          moveTo(center, dirOf(view), dist, animate);
        }
      };
      const look: Engine['look'] = (view) => {
        const { center, dist } = frame(latest.current.keys);
        moveTo(center, dirOf(view), dist, true);
      };

      /* ── 크기 · 그리기 ── */
      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
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
          dirty = true;
        }
        if (controls.update()) dirty = true;
        if (!dirty) return;
        dirty = false;
        renderer.render(scene, camera);
      };
      const seen = new IntersectionObserver(([entry]) => {
        dirty = true;
        renderer.setAnimationLoop(entry?.isIntersecting ? tick : null);
      });
      seen.observe(el);

      engine.current = { apply, look };
      apply(latest.current.keys, latest.current.view, false);
      report('ready');

      cleanup = () => {
        engine.current = null;
        seen.disconnect();
        sizer.disconnect();
        renderer.setAnimationLoop(null);
        for (const e of entries) {
          e.mesh.geometry.dispose();
          e.material.dispose();
        }
        release();
      };
    })().catch(() => report('error'));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  /* 켤 것 · 보는 쪽이 바뀌면 다시 칠한다 */
  useEffect(() => {
    engine.current?.apply(keys, view, true);
  }, [keys, view, status]);

  return (
    <div ref={holder} className="relative h-full w-full">
      {status === 'ready' && (
        <div className="absolute top-2.5 right-2.5 grid gap-1.5">
          {(
            [
              ['front', '앞'],
              ['side', '옆'],
              ['back', '뒤'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => engine.current?.look(v)}
              aria-label={`${label}에서 보기`}
              className="rounded-lg border border-line bg-surface/90 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm transition-colors hover:border-sky hover:text-sky"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <span
            aria-hidden
            className="absolute inset-6 rounded-3xl bg-surface-2/80 motion-safe:animate-pulse"
          />
          <p className="relative text-sm text-muted">3D 근육 그림을 불러오는 중…</p>
        </div>
      )}
      {status === 'error' && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm break-keep text-muted">
          3D 모델을 불러오지 못했습니다.
        </p>
      )}
      {status === 'ready' && (
        <p className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] text-muted">
          좌우로 끌어 돌리기
        </p>
      )}
    </div>
  );
}
