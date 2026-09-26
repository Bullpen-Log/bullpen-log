'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';
import { areaOfMuscle, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { AREA_VIEW, MODEL_KEY_TO_MUSCLE, type MapView } from '@/lib/armcare/muscle-map';
import { createStage, hasWebGL, type StageStatus } from '@/components/three-stage';
import { StageOverlay } from '@/components/stage-overlay';

/** 3D 에서 고른 것 — 부위, 그 안의 근육, 누른 조각(갈래) */
export type MapSelection = {
  area: ArmcareAreaKey | null;
  muscle: string | null;
  part: string | null;
};

export type MapStatus = StageStatus;

const MODEL_URL = '/models/armcare-upper.glb';

/*
 * 색 — 몸은 회색 점토, 암케어 근육은 붉은 근육색, 고른 것은 앱의 하늘색.
 *
 * 부위 색(lib/armcare/anatomy.ts 의 color)으로 근육을 칠해 본 적이 있다. 여덟 색이
 * 한꺼번에 들어가니 고른 근육이 구별되지 않아 이 색으로 되돌렸다(2026-09-26 사용자분).
 * 부위 색은 3D 아래의 단추·카드·근육 칩의 점에만 쓴다.
 */
const COLOR = {
  context: '#c9d1da',
  target: '#d9776a',
  pick: '#0ea5e9',
  bone: '#ece4d4',
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
  apply: (selection: MapSelection, side: 'right' | 'left', animate: boolean) => void;
  look: (view: MapView) => void;
};

/**
 * 3D 근육 지도 — 캔버스 하나. 무엇을 골랐는지는 부모(muscle-map-panel.tsx)가 쥔다.
 *
 * 무대(렌더러 · 빛 · 돌리기 · 그릴 때만 그리기 · 치우기)는 components/three-stage.ts 가
 * 차린다 — 전신 부위 그림(components/body-map-3d.tsx)과 같이 쓴다. 여기는 무엇을 어떻게
 * 칠하고 무엇을 누르는지만 정한다. 모델은 public/models/armcare-upper.glb(약 1.3MB).
 *
 * 누르기: 처음 누르면 그 부위, 같은 부위를 한 번 더 누르면 그 근육. 부위를 고르면 그
 * 부위만 또렷하게 남고 나머지는 비쳐 보여 속 근육(견갑하근 등)도 보인다. 근육을 고르면
 * 그 근육만 색이 남는다 — 같은 부위의 다른 근육도 색을 뺀다.
 *
 * WebGL 이 안 되는 기기에서는 아무것도 그리지 않고 'unavailable' 을 알린다. 부모가
 * 3D 자리를 접고 목록으로 보여 준다.
 */
export function MuscleMap3D({
  side,
  selection,
  onPick,
  onStatus,
}: {
  side: 'right' | 'left';
  selection: MapSelection;
  onPick: (next: MapSelection) => void;
  onStatus: (status: MapStatus) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');

  /* 콜백과 지금 값은 ref 로 든다 — 캔버스는 한 번만 만들고, 누를 때 최신 값을 본다 */
  const latest = useRef({ selection, side, onPick, onStatus });
  useEffect(() => {
    latest.current = { selection, side, onPick, onStatus };
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

    if (!hasWebGL()) {
      report('unavailable');
      return;
    }

    (async () => {
      const stage = await createStage(
        el,
        {
          modelUrl: MODEL_URL,
          label: '3D 근육 지도',
          minDistance: 0.25,
          maxDistance: 3.5,
        },
        () => disposed
      );
      if (!stage) return;
      const { THREE, root, renderer, camera } = stage;

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
          /*
           * 비쳐 보이게(transparent) 한 양면 재질은 three 가 뒷면·앞면을 두 번 그리고, 그때마다
           * 재질을 새로 맞춘다. 흐린 근육이 백 개가 넘어 돌릴 때마다 폰이 버벅였다
           * (2026-09-26 검토) — 한 번에 그린다.
           */
          forceSinglePass: true,
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

      /* 지금 던지는 팔 기준으로 조각이 누구인지 */
      const muscleOf = (e: Entry, arm: 'right' | 'left') =>
        e.key && e.side === arm ? (MODEL_KEY_TO_MUSCLE.get(e.key) ?? null) : null;

      /* ── 카메라 ── */
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
        return { center, dist: Math.max(stage.fit(radius, pad), s.area ? 0.35 : 0.5) };
      };
      const dirOf = (view: MapView, arm: 'right' | 'left') => {
        const [x, y, z] = VIEWS[view];
        return new THREE.Vector3(arm === 'left' ? -x : x, y, z).normalize();
      };

      /* ── 칠하기 ── */
      const target = new THREE.Color();
      const black = new THREE.Color('#000000');
      let lastKey = '';
      const apply: Engine['apply'] = (s, arm, animate) => {
        for (const e of entries) {
          const name = muscleOf(e, arm);
          const area = name ? areaOfMuscle(name)?.key : undefined;
          let color: string = e.bone ? COLOR.bone : name ? COLOR.target : COLOR.context;
          const inArea = !!s.area && area === s.area;
          const on = inArea && (!s.muscle || name === s.muscle);
          if (on) color = COLOR.pick;
          /*
           * 근육 하나를 골랐으면 그 근육만 색을 남기고 나머지는 모두 색을 뺀다. 같은
           * 부위의 다른 근육을 옅은 하늘색으로 남겼더니 고른 근육과 섞여 어디까지가
           * 그 근육인지 보기 어려웠다(2026-09-26 사용자분).
           */
          if (s.muscle && !on && name) color = COLOR.context;
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
          e.material.opacity = faded ? (e.bone ? 0.35 : name ? 0.12 : 0.06) : 1;
          e.material.depthWrite = !faded;
          e.material.needsUpdate = true;
        }
        stage.invalidate();
        /* 고른 것이 바뀌었을 때만 카메라를 옮긴다 — 색만 바꿀 때 시점이 튀지 않게 */
        const key = `${arm}|${s.area}|${s.muscle}`;
        if (key !== lastKey) {
          lastKey = key;
          const { center, dist } = frame(s, arm);
          stage.moveTo(
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
        stage.moveTo(center, dirOf(view, arm), dist, true);
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
        /* 맞은 차례대로, 암케어 근육만 */
        const found: { key: string | null; name: string; area: ArmcareAreaKey }[] = [];
        for (const h of hits) {
          const e = entries.find((x) => x.mesh === h.object);
          const name = e ? muscleOf(e, arm) : null;
          const area = name ? areaOfMuscle(name)?.key : null;
          if (e && name && area) found.push({ key: e.key, name, area });
        }

        if (s.muscle) {
          /* 근육을 골라 둔 채 — 그 근육을 누르면 그대로(누른 갈래만 바뀐다) */
          const same = found.find((f) => f.name === s.muscle);
          if (same) {
            onPick({ area: same.area, muscle: same.name, part: same.key });
          } else if (found[0]) {
            /*
             * 그 근육 밖을 누르면 한 칸 물러나 그 자리의 부위를 켠다. 나머지 근육은 색을
             * 빼 거의 안 보이는데, 그중 하나로 곧장 건너뛰면 보이지도 않는 근육이
             * 골라졌다(2026-09-26 검토). 부위를 켜면 그 부위 근육이 다시 보이니 거기서
             * 고르면 된다.
             */
            onPick({ area: found[0].area, muscle: null, part: null });
          } else if (hits.length === 0) {
            onPick({ area: null, muscle: null, part: null });
          }
          return;
        }
        /*
         * 처음 누르면 부위, 같은 부위를 한 번 더 누르면 그 근육.
         *
         * 부위를 골라 둔 채면 켜진 부위의 근육을 먼저 찾는다. 앞에 비쳐 보이는 다른
         * 부위 근육(흐리게 남은 삼각근 등)이 먼저 맞아도 건너뛴다 — 그러지 않으면 어깨
         * 전방을 골라 켜진 견갑하근을 눌렀는데 삼각근이 가로채 다른 부위로 넘어갔다.
         */
        const inArea = s.area ? found.find((f) => f.area === s.area) : undefined;
        if (inArea) {
          onPick({ area: inArea.area, muscle: inArea.name, part: inArea.key });
        } else if (found[0]) {
          onPick({ area: found[0].area, muscle: null, part: null });
        } else if (hits.length === 0) {
          onPick({ area: null, muscle: null, part: null });
        }
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      engine.current = { apply, look };
      const now = latest.current;
      apply(now.selection, now.side, false);
      report('ready');

      cleanup = () => {
        engine.current = null;
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointerup', onUp);
        for (const e of entries) e.material.dispose();
        stage.dispose();
      };
    })().catch(() => report('error'));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  /* 고른 것 · 팔이 바뀌면 칠을 다시 한다 */
  useEffect(() => {
    engine.current?.apply(selection, side, true);
  }, [selection, side, status]);

  return (
    <div ref={holder} className="relative h-full w-full">
      <StageOverlay
        status={status}
        onLook={(view) => engine.current?.look(view)}
        hint="좌우로 끌어 돌리기 · 근육 누르기"
        loadingText="3D 근육 지도를 불러오는 중…"
        errorText="3D 모델을 불러오지 못했습니다. 아래 목록으로 보세요."
      />
    </div>
  );
}
