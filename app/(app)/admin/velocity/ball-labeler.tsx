'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from '@/components/icon';
import { Button } from '@/components/ui';
import { loadBallLabel, saveBallLabel } from '@/app/actions/velocity-recording';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import type { BallLabel, BallLabelFrame } from '@/lib/velocity-ball-label';

/**
 * 공 자리 찍기(관리자) — 공 감지 학습 모델 2판 자료. 녹화 컷(편집기) · 측정 클립(탐색기 미리보기)에서 연다.
 * 장면을 하나씩 넘기며(←/→) 공 가운데를 누르고, 한 번 더 눌러 가장자리(지름)를 정한다. 끌어도 된다(시작 = 가운데, 끝 = 가장자리).
 * 가운데만 누르고 넘기면 지난 지름을 그대로 쓴다. N = 이 장면엔 공 없음, Backspace = 이 장면 표시 지움, S = 저장.
 * 장면 시각은 브라우저가 실제로 보인 장면의 시각(requestVideoFrameCallback mediaTime) — 내려받는 쪽(pull-labels.mjs)이 디코더 장면과 맞춘다.
 */

type Geom = { w: number; h: number; vw: number; vh: number };
type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, md: { mediaTime: number }) => void
  ) => number;
};

const DEFAULT_D = 12;

export function BallLabelDialog({
  target,
  src,
  fps,
  startSec,
  endSec,
  initial,
  title,
  onClose,
  onSaved,
}: {
  target: string;
  src: string;
  fps: number;
  /** 처음 보일 시각 · 넘기기 한계(없으면 영상 끝) */
  startSec: number;
  endSec: number | null;
  /** 찍어 둔 것 — undefined 면 서버에서 읽는다 */
  initial?: BallLabel | null;
  title: string;
  onClose: () => void;
  onSaved: (label: BallLabel | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<VideoWithRvfc>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<BallLabelFrame[]>(initial?.frames ?? []);
  const [loading, setLoading] = useState(initial === undefined);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [shownT, setShownT] = useState<number | null>(null);
  const [pending, setPending] = useState<[number, number] | null>(null);
  const [lastD, setLastD] = useState(
    initial?.frames.findLast((f) => f.ball)?.ball?.[2] ?? DEFAULT_D
  );
  const [dirty, setDirty] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    if (initial !== undefined) return;
    let on = true;
    void loadBallLabel(target).then((l) => {
      if (!on) return;
      if (l) {
        setFrames(l.frames);
        const d = l.frames.findLast((f) => f.ball)?.ball?.[2];
        if (d) setLastD(d);
      }
      setLoading(false);
    });
    return () => {
      on = false;
    };
  }, [initial, target]);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(id);
  }, [msg]);

  /* 영상 칸 크기 · 원본 크기 — 겹칠 판의 좌표 변환에 */
  const measure = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const r = v.getBoundingClientRect();
    setGeom({ w: r.width, h: r.height, vw: v.videoWidth, vh: v.videoHeight });
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    /* 머리를 이미 다 받은 영상(캐시)은 loadedmetadata 가 붙기 전에 지나간다 — 여기서 한 번 */
    if (v.readyState >= 1) {
      measure();
      v.currentTime = startSec;
    }
    return () => ro.disconnect();
  }, [measure, startSec]);

  const afterSeek = () => {
    const v = videoRef.current;
    if (!v) return;
    setShownT(v.currentTime);
    v.requestVideoFrameCallback?.((_, md) => setShownT(md.mediaTime));
  };

  const dt = 1 / (fps > 0 ? fps : 60);
  const tolerance = 0.5 * dt;
  const current =
    shownT == null
      ? null
      : (frames.find((f) => Math.abs(f.t - shownT) < tolerance) ?? null);

  const put = (ball: BallLabelFrame['ball']) => {
    if (shownT == null) return;
    const t = +shownT.toFixed(4);
    setFrames((list) =>
      [...list.filter((f) => Math.abs(f.t - t) >= tolerance), { t, ball }].sort(
        (a, b) => a.t - b.t
      )
    );
    if (ball) setLastD(ball[2]);
    setPending(null);
    setDirty(true);
  };
  const clearHere = () => {
    if (shownT == null) return;
    setFrames((list) => list.filter((f) => Math.abs(f.t - shownT) >= tolerance));
    setPending(null);
    setDirty(true);
  };

  const step = (n: 1 | -1) => {
    const v = videoRef.current;
    if (!v) return;
    /* 가운데만 찍고 넘기면 지난 지름으로 */
    if (pending) put([pending[0], pending[1], lastD]);
    const base = shownT ?? v.currentTime;
    const max = endSec ?? (Number.isFinite(v.duration) ? v.duration : base + 1);
    v.currentTime = Math.max(0, Math.min(max, base + n * dt + 1e-4));
  };

  /* ── 화면 좌표 ↔ 원본 px(object-contain) ── */
  const scaleOf = (g: Geom) => Math.min(g.w / g.vw, g.h / g.vh);
  const toSource = (cx: number, cy: number): [number, number] | null => {
    const g = geom;
    const box = overlayRef.current?.getBoundingClientRect();
    if (!g || !box) return null;
    const s = scaleOf(g);
    const x = (cx - box.left - (g.w - g.vw * s) / 2) / s;
    const y = (cy - box.top - (g.h - g.vh * s) / 2) / s;
    if (x < 0 || y < 0 || x > g.vw || y > g.vh) return null;
    return [x, y];
  };
  const toView = (x: number, y: number) => {
    const g = geom as Geom;
    const s = scaleOf(g);
    return {
      left: (g.w - g.vw * s) / 2 + x * s,
      top: (g.h - g.vh * s) / 2 + y * s,
      s,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 손가락 · 마우스가 아닌 입력 */
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d0 = downRef.current;
    downRef.current = null;
    if (!d0 || shownT == null || !geom) return;
    const start = toSource(d0.x, d0.y);
    const end = toSource(e.clientX, e.clientY);
    if (!start) return;
    const s = scaleOf(geom);
    const dragPx = Math.hypot(e.clientX - d0.x, e.clientY - d0.y);
    if (dragPx >= 6 && end) {
      /* 끌기 — 시작이 가운데, 끝이 가장자리 */
      put([
        start[0],
        start[1],
        Math.max(2, 2 * Math.hypot(end[0] - start[0], end[1] - start[1])),
      ]);
      return;
    }
    if (!pending) {
      setPending(start);
      return;
    }
    const r = Math.hypot(start[0] - pending[0], start[1] - pending[1]);
    /* 같은 자리를 다시 누르면 지난 지름 그대로 */
    put([pending[0], pending[1], r * s < 4 ? lastD : Math.max(2, 2 * r)]);
  };

  const save = async (thenClose = false) => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    setSaving(true);
    const res = await orOffline(
      saveBallLabel(target, { sourceW: v.videoWidth, sourceH: v.videoHeight, frames }),
      { ok: false as const, error: OFFLINE_MESSAGE }
    );
    setSaving(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setDirty(false);
    onSaved(
      frames.length ? { sourceW: v.videoWidth, sourceH: v.videoHeight, frames } : null
    );
    if (thenClose) onClose();
    else setMsg(`저장했어요 · 장면 ${frames.length}`);
  };
  const tryClose = () => {
    if (dirty) setClosing(true);
    else onClose();
  };

  /* ── 키보드 ── */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyRef.current = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'ㅜ') put(null);
      else if (e.key === 'Backspace' || e.key === 'Delete') clearHere();
      else if (e.key === 's' || e.key === 'S' || e.key === 'ㄴ') void save();
      else if (e.key === 'Escape') {
        e.preventDefault();
        tryClose();
      }
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const ballN = frames.filter((f) => f.ball).length;
  const trail = frames.filter((f) => f.ball && f !== current);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        tryClose();
      }}
      onClose={onClose}
      aria-label={`${title} 공 자리 찍기`}
      className="theme-dark fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none flex-col bg-black p-0 text-white"
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">
          {title} · 공 자리 찍기
        </span>
        <span className="text-xs text-white/60 tabular-nums">
          장면 {frames.length} · 공 {ballN} · 없음 {frames.length - ballN}
        </span>
        <Button variant="secondary" size="sm" onClick={tryClose}>
          닫기
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 touch-none select-none">
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            measure();
            const v = videoRef.current;
            if (v) v.currentTime = startSec;
          }}
          onLoadedData={measure}
          onSeeked={afterSeek}
          className="h-full w-full object-contain"
        />
        <div
          ref={overlayRef}
          onPointerDown={onDown}
          onPointerUp={onUp}
          className="absolute inset-0 cursor-crosshair"
        >
          {geom &&
            trail.map((f) => {
              const b = f.ball as [number, number, number];
              const p = toView(b[0], b[1]);
              return (
                <span
                  key={f.t}
                  className="pointer-events-none absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky/70"
                  style={{ left: p.left, top: p.top }}
                />
              );
            })}
          {geom && current?.ball && (
            <Ring
              p={toView(current.ball[0], current.ball[1])}
              d={current.ball[2]}
              solid
            />
          )}
          {geom && pending && (
            <Ring p={toView(pending[0], pending[1])} d={lastD} solid={false} />
          )}
          {current && !current.ball && (
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
              이 장면은 공 없음
            </span>
          )}
          {loading && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Loader2 aria-hidden className="h-6 w-6 animate-spin text-white/70" />
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="1장면 뒤로"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10"
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="1장면 앞으로"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10"
        >
          <ChevronRight aria-hidden className="h-5 w-5" />
        </button>
        <span className="text-xs text-white/60 tabular-nums">
          {shownT != null ? `${shownT.toFixed(3)}초` : '…'}
          {current
            ? current.ball
              ? ` · 지름 ${current.ball[2].toFixed(0)}px`
              : ' · 없음'
            : ' · 아직'}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => put(null)}
          disabled={shownT == null}
        >
          공 없음(N)
        </Button>
        <Button variant="secondary" size="sm" onClick={clearHere} disabled={!current}>
          <Trash2 aria-hidden className="h-4 w-4" />이 장면 지움
        </Button>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="ml-auto"
        >
          {saving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
          저장(S)
        </Button>
      </div>
      <p className="px-3 pb-2 text-xs text-white/50">
        공 가운데를 누르고 가장자리를 한 번 더 눌러요. 끌어도 돼요. 가운데만 찍고 넘기면
        지난 지름 그대로예요. ←/→ 장면 넘기기.
      </p>
      {msg && (
        <p role="status" className="px-3 pb-2 text-xs text-warn">
          {msg}
        </p>
      )}
      {closing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-sm">
          <span>저장하지 않은 표시가 있어요.</span>
          <Button size="sm" onClick={() => void save(true)} disabled={saving}>
            저장하고 닫기
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            버리고 닫기
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setClosing(false)}>
            계속 찍기
          </Button>
        </div>
      )}
    </dialog>
  );
}

function Ring({
  p,
  d,
  solid,
}: {
  p: { left: number; top: number; s: number };
  d: number;
  solid: boolean;
}) {
  const px = Math.max(8, d * p.s);
  return (
    <span
      className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
        solid ? 'border-sky' : 'border-dashed border-white/80'
      }`}
      style={{ left: p.left, top: p.top, width: px, height: px }}
    >
      <span className="absolute left-1/2 top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky" />
    </span>
  );
}
