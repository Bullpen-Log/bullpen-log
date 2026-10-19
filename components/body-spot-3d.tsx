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
import { spotId, spotOf, type BodySpots, type SpotRegion } from '@/lib/body-spots';

const MODEL_URL = '/models/body-full.glb';

/* 몸은 회색 점토 · 뼈는 상아색(전신 3D 와 같은 말), 고른 근육은 뻐근 주황 · 통증 빨강, 지금 고르는 것은 하늘색 테 대신 밝게 */
const COLOR = {
  context: '#c9d1da',
  bone: '#ece4d4',
  뻐근: '#f59e0b',
  통증: '#e5484d',
} as const;

/* 보는 방향 — 모델은 앞이 +Z, 사람의 왼쪽이 +X */
const VIEWS: Record<StageView, [number, number, number]> = {
  front: [0.12, 0.1, 1],
  back: [0.12, 0.12, -1],
  side: [-1, 0.1, 0.25],
};

type Entry = {
  mesh: Three.Mesh;
  material: Three.MeshStandardMaterial;
  /** 'R:deltoid_anterior' — 근육이 아니면(뼈 · 모르는 조각) null */
  id: string | null;
  /** 조각 이름(deltoid_anterior) — 키워드로 좁힐 때 */
  key: string | null;
  bone: boolean;
};

/**
 * 체크인 '불편한 곳' 3D — 전신 모델의 근육을 눌러 고른다(2026-10-12 사용자: "체크인 몸 그림을 3D 로").
 *
 * 누르기와 끌기(돌리기)를 손가락이 움직인 거리로 가른다(6px — 트레이닝 근육 지도와 같다). 맞은 조각 가운데 처음 맞은
 * 근육을 고른다. 뼈는 누르는 대상이 아니라 건너뛴다. 좌우는 모델 조각의 extras.side 로 안다.
 * 무대 · 모델 받기는 components/three-stage.ts (암케어 · 전신 3D 와 같은 것).
 */
export function BodySpot3D({
  spots,
  active,
  onTap,
  region = null,
}: {
  spots: BodySpots;
  active: string | null;
  onTap: (id: string) => void;
  /** 키워드로 좁힌 자리 — 그 근육들로 다가가고 나머지는 흐리게 · 못 누르게(null = 온몸) */
  region?: SpotRegion | null;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const paint = useRef<(() => void) | null>(null);
  const look = useRef<((v: StageView) => void) | null>(null);
  const [status, setStatus] = useState<StageStatus>('loading');

  const latest = useRef({ spots, active, onTap, region });
  useEffect(() => {
    latest.current = { spots, active, onTap, region };
  });
  const focus = useRef<((r: SpotRegion | null) => void) | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    const report = (s: StageStatus) => {
      if (!disposed) setStatus(s);
    };
    if (!hasWebGL()) {
      report('unavailable');
      return;
    }

    (async () => {
      const stage = await createStage(
        el,
        { modelUrl: MODEL_URL, label: '불편한 근육 고르기 3D', minDistance: 0.3, maxDistance: 7 },
        () => disposed
      );
      if (!stage) return;
      const { THREE, root, renderer, camera } = stage;

      const entries: Entry[] = [];
      root.traverse((o) => {
        const mesh = o as Three.Mesh;
        if (!mesh.isMesh) return;
        const u = mesh.userData as Record<string, string | undefined>;
        const bone = u.boneId != null;
        const side = u.side === 'left' ? 'L' : u.side === 'right' ? 'R' : null;
        const id = u.muscleId && u.key && side ? spotId(side, u.key) : null;
        const material = new THREE.MeshStandardMaterial({
          color: bone ? COLOR.bone : COLOR.context,
          roughness: bone ? 0.75 : 0.62,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        mesh.material = material;
        entries.push({ mesh, material, id: id && spotOf(id) ? id : null, key: u.key ?? null, bone });
      });

      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const dist = Math.max(
        stage.fit(box.getSize(new THREE.Vector3()).length() / 2, 0.85),
        0.5
      );
      const toView = (v: StageView, animate: boolean) =>
        stage.moveTo(center, new THREE.Vector3(...VIEWS[v]).normalize(), dist, animate);

      const black = new THREE.Color('#000000');
      const inRegion = (e: Entry) => {
        const r = latest.current.region;
        return !r || (e.key != null && e.id != null && r.keys.includes(e.key));
      };
      /* 키워드 자리로 다가가기 — 그 근육들(좌우 다)을 감싼 상자에 맞춰 */
      focus.current = (r) => {
        if (!r) return toView('front', true);
        const hit = entries.filter((e) => e.key != null && e.id != null && r.keys.includes(e.key));
        if (!hit.length) return toView(r.view, true);
        const b = new THREE.Box3();
        for (const e of hit) b.expandByObject(e.mesh);
        const c = b.getCenter(new THREE.Vector3());
        const d = Math.max(stage.fit(b.getSize(new THREE.Vector3()).length() / 2, 0.85), 0.35);
        stage.moveTo(c, new THREE.Vector3(...VIEWS[r.view]).normalize(), d, true);
      };
      paint.current = () => {
        const { spots: s, active: a } = latest.current;
        for (const e of entries) {
          const level = e.id ? s[e.id] : undefined;
          const dim = !e.bone && !inRegion(e) && !level;
          e.material.transparent = dim;
          e.material.opacity = dim ? 0.18 : 1;
          e.material.depthWrite = !dim;
          e.material.color.set(level ? COLOR[level] : e.bone ? COLOR.bone : COLOR.context);
          const on = e.id != null && e.id === a;
          e.material.emissive.copy(level ? e.material.color : black);
          e.material.emissiveIntensity = on ? 0.45 : level ? 0.18 : 0;
        }
        stage.invalidate();
      };
      look.current = (v) => toView(v, true);

      /* 누르기 — 끌기(돌리기)와 가른다 */
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
        for (const h of ray.intersectObjects(entries.map((x) => x.mesh), false)) {
          const hit = entries.find((x) => x.mesh === h.object);
          /* 좁힌 자리 밖(흐린 근육)은 건너뛰고 뒤의 것을 본다 */
          if (hit?.id && inRegion(hit)) {
            latest.current.onTap(hit.id);
            return;
          }
        }
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      toView('front', false);
      paint.current();
      report('ready');

      if (latest.current.region) focus.current(latest.current.region);
      cleanup = () => {
        focus.current = null;
        paint.current = null;
        look.current = null;
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

  /* 고른 것이 바뀌면 다시 칠한다 */
  useEffect(() => {
    paint.current?.();
  }, [spots, active, status, region]);
  /* 키워드가 바뀌면 그 자리로 */
  useEffect(() => {
    focus.current?.(region);
  }, [region]);

  return (
    <div ref={holder} className="relative h-full w-full">
      <StageOverlay
        status={status}
        onLook={(v) => look.current?.(v)}
        hint="끌어 돌리기 · 근육을 눌러 고르기"
        loadingText="3D 몸을 불러오는 중…"
        errorText="3D 모델을 불러오지 못했어요."
      />
    </div>
  );
}
