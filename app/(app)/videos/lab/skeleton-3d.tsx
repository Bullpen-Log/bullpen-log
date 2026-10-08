'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Pitch3dOk } from '@/lib/pitch-3d/analyze';
import { J } from '@/lib/pitch-3d/motion';

/**
 * 3D 뼈대 보기(설계 5절 3단계) — 캔버스 하나, 새 패키지 없음(three.js 대신 막대 사람 하나라 직접 그린다, 검토 7절 5).
 * 끌어서 돌리기(좌우 = 둘레, 위아래 = 내려다보기), 재생 · 시간 막대, 니업 · 착지 · 릴리스로 건너뛰기.
 * 색은 둘만: 몸은 글자색, 던지는 팔은 강조색(그림은 색 적게).
 */

const BONES: [number, number][] = [
  [J.lSh, J.rSh],
  [J.lHip, J.rHip],
  [J.lSh, J.lHip],
  [J.rSh, J.rHip],
  [J.lSh, J.lEl],
  [J.lEl, J.lWr],
  [J.rSh, J.rEl],
  [J.rEl, J.rWr],
  [J.lHip, J.lKn],
  [J.lKn, J.lAn],
  [J.rHip, J.rKn],
  [J.rKn, J.rAn],
  [J.lAn, J.lHe],
  [J.lAn, J.lTo],
  [J.lHe, J.lTo],
  [J.rAn, J.rHe],
  [J.rAn, J.rTo],
  [J.rHe, J.rTo],
];

const EVENT_LABELS = { kneeUp: '니업', footPlant: '착지', release: '릴리스' } as const;

export function Skeleton3D({ result }: { result: Pitch3dOk }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(result.events.footPlant);
  const [playing, setPlaying] = useState(false);
  const view = useRef({ yaw: -0.5, pitch: 0.25 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [, redraw] = useState(0);

  const thrown: number[] = result.hand === 'L' ? [J.lSh, J.lEl, J.lWr] : [J.rSh, J.rEl, J.rWr];
  const n = result.joints.length;

  /* 가운데 = 골반이 지난 길의 가운데, 크기 = 모든 장면이 들어가는 반지름 */
  const frameBox = useMemo(() => {
    let cx = 0;
    let cz = 0;
    let k = 0;
    for (const fr of result.joints) {
      const l = fr[J.lHip];
      const r = fr[J.rHip];
      if (!l || !r) continue;
      cx += (l[0] + r[0]) / 2;
      cz += (l[2] + r[2]) / 2;
      k++;
    }
    cx /= k || 1;
    cz /= k || 1;
    let rad = 0.6;
    for (const fr of result.joints)
      for (const p of fr) if (p) rad = Math.max(rad, Math.hypot(p[0] - cx, p[2] - cz), p[1] * 0.6);
    return { cx, cz, rad };
  }, [result.joints]);

  /* 재생 — 초당 30장(영상 시간과 같은 빠르기는 아니다, 모양을 보려는 것) */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        last = now;
        setFrame((f) => (f + 1 >= n ? 0 : f + 1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, n]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr)) canvas.width = Math.round(W * dpr);
    if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(canvas);
    const ink = css.getPropertyValue('--color-ink').trim() || '#1d1d1f';
    const accent = css.getPropertyValue('--color-sky').trim() || '#0a84d6';
    const line = css.getPropertyValue('--color-line').trim() || '#e5e5ea';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { yaw, pitch } = view.current;
    const { cx, cz, rad } = frameBox;
    const scale = (Math.min(W, H) * 0.42) / rad;
    const cy = H * 0.78;
    /* [앞, 위, 오른쪽] → 화면: 둘레(yaw) 뒤 내려다보기(pitch). 앞이 오른쪽으로 보이는 옆모습에서 시작 */
    const proj = (p: number[]) => {
      const f = p[0] - cx;
      const r = p[2] - cz;
      const x = f * Math.cos(yaw) - r * Math.sin(yaw);
      const d = f * Math.sin(yaw) + r * Math.cos(yaw);
      const y = p[1] * Math.cos(pitch) - d * Math.sin(pitch);
      return [W / 2 + x * scale, cy - y * scale] as const;
    };

    /* 땅 — 가는 격자(키 0.5 간격) */
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let g = -2; g <= 2; g++) {
      const a = proj([cx + g * 0.5, 0, cz - 1]);
      const b = proj([cx + g * 0.5, 0, cz + 1]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      const c = proj([cx - 1, 0, cz + g * 0.5]);
      const e = proj([cx + 1, 0, cz + g * 0.5]);
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.stroke();
    }

    /* 던지는 손목의 길(지난 30장) */
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = Math.max(0, frame - 30); i <= frame; i++) {
      const p = result.joints[i]?.[thrown[2]];
      if (!p) continue;
      const [x, y] = proj(p);
      if (!started) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      started = true;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const pts = result.joints[frame] ?? [];
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb) continue;
      const arm = thrown.includes(a) && thrown.includes(b);
      ctx.strokeStyle = arm ? accent : ink;
      ctx.lineWidth = arm ? 4 : 3;
      const A = proj(pa);
      const B = proj(pb);
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(B[0], B[1]);
      ctx.stroke();
    }
    /* 머리 — 코에 작은 원, 어깨 가운데와 잇는다 */
    const nose = pts[J.nose];
    const ls = pts[J.lSh];
    const rs = pts[J.rSh];
    if (nose && ls && rs) {
      const N = proj(nose);
      const M = proj([(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (ls[2] + rs[2]) / 2]);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(M[0], M[1]);
      ctx.lineTo(N[0], N[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(N[0], N[1], 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ...view.current };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    view.current = {
      yaw: d.yaw + (e.clientX - d.x) * 0.01,
      pitch: Math.max(-0.2, Math.min(1.3, d.pitch + (e.clientY - d.y) * 0.01)),
    };
    redraw((v) => v + 1);
  };
  const onUp = () => {
    drag.current = null;
  };

  const events = (['kneeUp', 'footPlant', 'release'] as const).filter((k) => result.events[k] != null);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="3D 뼈대 — 끌어서 돌려 보세요"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="aspect-[4/3] w-full touch-none rounded-xl bg-ink/4"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? '멈춤' : '재생'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/6 text-ink"
        >
          {playing ? <Pause aria-hidden className="h-5 w-5" /> : <Play aria-hidden className="h-5 w-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
          aria-label="장면"
          className="min-w-0 flex-1 accent-sky"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {events.map((k) => {
          const at = result.events[k]!;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPlaying(false);
                setFrame(at);
              }}
              className={`min-h-10 rounded-full px-3 text-sm ${frame === at ? 'bg-sky text-white' : 'bg-ink/6 text-ink'}`}
            >
              {EVENT_LABELS[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
