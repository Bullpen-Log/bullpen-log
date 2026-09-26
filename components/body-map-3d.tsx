'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';
import {
  createStage,
  hasWebGL,
  type StageStatus,
  type StageView,
} from '@/components/three-stage';
import { StageOverlay } from '@/components/stage-overlay';

export type BodyView = StageView;
export type BodyMapStatus = StageStatus;

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
 * 무대는 암케어 3D 와 같은 것을 쓴다(components/three-stage.ts). 다른 점은 셋 — 전신
 * 모델(public/models/body-full.glb, 약 1.9MB)을 쓰고, 자르지 않고, 누르기(고르기)가 없다.
 * 무엇을 켤지는 부모가 준다.
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

    if (!hasWebGL()) {
      report('unavailable');
      return;
    }

    (async () => {
      const stage = await createStage(
        el,
        {
          modelUrl: MODEL_URL,
          label: '전신 3D 근육 그림',
          minDistance: 0.3,
          maxDistance: 7,
        },
        () => disposed
      );
      if (!stage) return;
      const { THREE, root } = stage;

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
          /* 흐린 조각(대부분)을 두 번씩 그리지 않게 — muscle-map-3d.tsx 와 같은 까닭 */
          forceSinglePass: true,
        });
        mesh.material = material;
        entries.push({ mesh, material, key: u.muscleId ? (u.key ?? null) : null, bone });
      });
      const whole = new THREE.Box3().setFromObject(root);

      /* ── 카메라 ── */
      const frame = (keys: readonly string[]) => {
        const want = new Set(keys);
        const box = new THREE.Box3();
        for (const e of entries) if (e.key && want.has(e.key)) box.expandByObject(e.mesh);
        const b = box.isEmpty() ? whole : box;
        const center = b.getCenter(new THREE.Vector3());
        const radius = b.getSize(new THREE.Vector3()).length() / 2;
        return {
          center,
          dist: Math.max(stage.fit(radius, box.isEmpty() ? 0.85 : 1.25), 0.5),
        };
      };
      const dirOf = (view: BodyView) => new THREE.Vector3(...VIEWS[view]).normalize();

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
        stage.invalidate();
        const key = `${[...want].sort().join(',')}|${view}`;
        if (key !== lastKey) {
          lastKey = key;
          const { center, dist } = frame(keys);
          stage.moveTo(center, dirOf(view), dist, animate);
        }
      };
      const look: Engine['look'] = (view) => {
        const { center, dist } = frame(latest.current.keys);
        stage.moveTo(center, dirOf(view), dist, true);
      };

      engine.current = { apply, look };
      apply(latest.current.keys, latest.current.view, false);
      report('ready');

      cleanup = () => {
        engine.current = null;
        for (const e of entries) e.material.dispose();
        stage.dispose();
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
      <StageOverlay
        status={status}
        onLook={(v) => engine.current?.look(v)}
        hint="좌우로 끌어 돌리기"
        loadingText="3D 근육 그림을 불러오는 중…"
        errorText="3D 모델을 불러오지 못했습니다."
      />
    </div>
  );
}
