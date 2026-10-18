'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from '@/components/icon';
import { type AbsAnalysis, type FitSnapshot, fitFromSnapshot } from '@/lib/abs/analysis';
import { calibFromPlate, PLATE_CORNERS_WORLD } from '@/lib/abs/calib';
import { worldPositionAt } from '@/lib/abs/cross';
import { RULES } from '@/lib/abs/rules';
import { zoneWorld } from '@/lib/abs/zone';

/**
 * 3D 둘러보기 — 플레이트 · 존 상자 · 공 궤적(맞춘 궤적을 세상 미터로) · 통과점. 손가락으로 끌어 돌려 본다(사용자 결정 2026-10-18: 1차 포함).
 * three 는 import() 로(열 때만 실린다). 좌표는 ABS 세상(x 1루 · y 위 · z 투수 쪽)을 three 에 그대로 둔다.
 */
export function Zone3d({ abs, fit, onClose }: { abs: AbsAnalysis; fit: FitSnapshot; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      let T: typeof import('three');
      try {
        T = await import('three');
      } catch {
        setFailed('3D 를 불러오지 못했어요.');
        return;
      }
      if (disposed) return;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setClearColor(0x151722);
      el.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const cam = new T.PerspectiveCamera(50, 1, 0.05, 100);
      const box = zoneWorld(abs.heightCm, RULES[abs.rule]);
      const target = new T.Vector3(0, (box.top + box.bottom) / 2, box.zMid);

      /* 바닥 · 플레이트 */
      const grid = new T.GridHelper(8, 16, 0x3a3f55, 0x262a3a);
      grid.position.y = -0.002;
      scene.add(grid);
      const plateGeo = new T.BufferGeometry().setFromPoints([...PLATE_CORNERS_WORLD, PLATE_CORNERS_WORLD[0]].map((p) => new T.Vector3(p[0], 0.003, p[2])));
      scene.add(new T.Line(plateGeo, new T.LineBasicMaterial({ color: 0xffffff })));
      const plateFill = new T.Shape(PLATE_CORNERS_WORLD.map((p) => new T.Vector2(p[0], p[2])));
      const fillMesh = new T.Mesh(new T.ShapeGeometry(plateFill), new T.MeshBasicMaterial({ color: 0xffffff, opacity: 0.85, transparent: true, side: T.DoubleSide }));
      fillMesh.rotation.x = Math.PI / 2;
      fillMesh.position.y = 0.002;
      scene.add(fillMesh);

      /* 존 상자 */
      const c = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
      const f = [c(box.left, box.top, box.zFront), c(box.right, box.top, box.zFront), c(box.right, box.bottom, box.zFront), c(box.left, box.bottom, box.zFront)];
      const b = [c(box.left, box.top, box.zBack), c(box.right, box.top, box.zBack), c(box.right, box.bottom, box.zBack), c(box.left, box.bottom, box.zBack)];
      const edges: InstanceType<typeof T.Vector3>[] = [];
      for (let i = 0; i < 4; i++) {
        edges.push(f[i], f[(i + 1) % 4], b[i], b[(i + 1) % 4], f[i], b[i]);
      }
      scene.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(edges), new T.LineBasicMaterial({ color: 0x0a84d6 })));
      /* 중간면(판정 면) 옅은 판 */
      const planeMesh = new T.Mesh(
        new T.PlaneGeometry(box.right - box.left, box.top - box.bottom),
        new T.MeshBasicMaterial({ color: 0x0a84d6, opacity: 0.15, transparent: true, side: T.DoubleSide })
      );
      planeMesh.position.set(0, (box.top + box.bottom) / 2, box.zMid);
      scene.add(planeMesh);

      /* 궤적 · 통과점 */
      const calib = calibFromPlate(abs.calib);
      const { fit: F, opts } = fitFromSnapshot(fit);
      const D = abs.depth.D;
      if (abs.cross && Number.isFinite(D)) {
        const pts: InstanceType<typeof T.Vector3>[] = [];
        const t0 = abs.cross.t - 0.55;
        for (let i = 0; i <= 80; i++) {
          const t = t0 + ((abs.cross.t + 0.03 - t0) * i) / 80;
          const w = worldPositionAt(F, opts, t, D, calib.pose);
          if (w[2] > -1 && w[2] < 20) pts.push(new T.Vector3(w[0], w[1], w[2]));
        }
        if (pts.length > 1) {
          const curve = new T.CatmullRomCurve3(pts);
          const tube = new T.Mesh(new T.TubeGeometry(curve, 80, 0.02, 8, false), new T.MeshBasicMaterial({ color: 0x9ad1ff, opacity: 0.8, transparent: true }));
          scene.add(tube);
        }
        const strike = abs.verdict?.call === 'strike';
        const ball = new T.Mesh(new T.SphereGeometry(0.0365, 20, 14), new T.MeshBasicMaterial({ color: strike ? 0x0a84d6 : 0xff9f0a }));
        ball.position.set(abs.cross.x, abs.cross.y, abs.cross.z);
        scene.add(ball);
      }

      /* 카메라 — 포수 뒤 위에서 시작, 끌어 돌림 */
      let az = Math.PI * 0.15;
      let elv = 0.35;
      let dist = 4;
      const place = () => {
        cam.position.set(target.x + dist * Math.cos(elv) * Math.sin(az), target.y + dist * Math.sin(elv), target.z - dist * Math.cos(elv) * Math.cos(az));
        cam.lookAt(target);
      };
      const resize = () => {
        const w = el.clientWidth || 300;
        const h = el.clientHeight || 300;
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        place();
        renderer.render(scene, cam);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      let last: { x: number; y: number } | null = null;
      const down = (e: PointerEvent) => {
        last = { x: e.clientX, y: e.clientY };
        el.setPointerCapture?.(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (!last) return;
        az += (e.clientX - last.x) * 0.008;
        elv = Math.min(1.3, Math.max(-0.1, elv + (e.clientY - last.y) * 0.006));
        last = { x: e.clientX, y: e.clientY };
        place();
        renderer.render(scene, cam);
      };
      const up = () => (last = null);
      const wheel = (e: WheelEvent) => {
        dist = Math.min(8, Math.max(1.2, dist * (e.deltaY > 0 ? 1.1 : 0.9)));
        place();
        renderer.render(scene, cam);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', wheel, { passive: true });
      cleanup = () => {
        ro.disconnect();
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.removeEventListener('wheel', wheel);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [abs, fit]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#151722] text-white" role="dialog" aria-label="3D 존 보기">
      <div className="box-content flex h-12 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <span className="pl-3 text-sm font-semibold text-white/85">
          3D 존 · 타자 {abs.batter} · {abs.heightCm}cm
        </span>
        <button type="button" onClick={onClose} aria-label="닫기" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:bg-white/10">
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <div ref={host} className="min-h-0 flex-1 touch-none [&>canvas]:h-full [&>canvas]:w-full" />
      <p className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-white/55">
        {failed ?? '끌어서 돌리고, PC 는 휠로 당겨요. 파란 상자가 존, 공은 판정 면 통과점이에요.'}
      </p>
    </div>
  );
}
