'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { CameraDiag, DualCapture } from '@/lib/velocity-engine/dual-capture';

/**
 * 카메라 상태 — 앱 카메라가 실제로 어떻게 켜졌나(형식 · 묶어 읽기 · 2배가 진짜인가 · 손떨림 보정 · 초점 · 노출)를 보이고, 그 자리에서
 * 손떨림 보정 · 줌 · 초점을 바꿔 본다. 화면이 흐린 까닭을 폰에서 바로 가르려고 만들었다(2026-10-08 사용자: "초점이 안 맞고
 * 흐리다" — 재초점으로도 그대로). 바꾼 값은 카메라를 다시 켜면 기본으로 돌아간다.
 */
export function CameraTuner({
  capture,
  onClose,
  onTuned,
}: {
  capture: DualCapture;
  onClose: () => void;
  /** 바꾼 뒤의 상태 — 측정 화면이 기준 조건 밖이 됐는지(손떨림 보정 끔 · 다른 줌) 기록에 남긴다 */
  onTuned?: (d: CameraDiag) => void;
}) {
  const [d, setD] = useState<CameraDiag | null>(null);
  const [lens, setLens] = useState<number | null>(null);
  const busy = useRef(false);
  const pendingLens = useRef<number | null>(null);

  /* 1초마다 다시 읽는다 — 렌즈가 움직이는 것 · 노출이 보인다 */
  useEffect(() => {
    let alive = true;
    const read = async () => {
      if (busy.current) return;
      const next = await capture.diag();
      if (alive && next && !busy.current) setD(next);
    };
    void read();
    const t = setInterval(read, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [capture]);

  const tune = async (t: Parameters<DualCapture['tune']>[0]) => {
    busy.current = true;
    const next = await capture.tune(t);
    busy.current = false;
    if (next) {
      setD(next);
      onTuned?.(next);
    }
    /* 막대를 끄는 사이에 쌓인 마지막 값 */
    const last = pendingLens.current;
    pendingLens.current = null;
    if (last != null && last !== t.lens) void tune({ lens: last });
  };

  const onLens = (v: number) => {
    setLens(v);
    if (busy.current) pendingLens.current = v;
    else void tune({ lens: v });
  };

  if (!d) {
    return (
      <Shell onClose={onClose}>
        <p className="text-xs text-white/70">
          상태를 읽는 중… 옛 앱이면 앱을 업데이트해 주세요.
        </p>
      </Shell>
    );
  }

  const size = d.format.match(/(\d{3,4})x(\d{3,4})/);
  const native2 = d.nativeZooms.some((z) => Math.abs(z - d.zoom) < 0.05);
  /* 이 줌에서 화면을 늘리나(디지털 줌) — 늘리기 시작 배율보다 크고, 진짜 줌 목록에도 없을 때 */
  const upscaled = d.zoom > 1.05 && !native2 && d.upscaleAt < d.zoom - 0.1;
  const shownLens = lens ?? d.lens;

  return (
    <Shell onClose={onClose}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-white/55">형식</dt>
        <dd className="tabular-nums">
          {size ? `${size[1]}×${size[2]}` : '?'} · 묶어 읽기{' '}
          {d.binned ? '예' : '아니요'} · {d.upscaleAt.toFixed(2)}배부터 늘림
          {d.nativeZooms.length > 0 && ` · 진짜 줌 ${d.nativeZooms.join(', ')}배`}
        </dd>
        <dt className="text-white/55">줌</dt>
        <dd className={upscaled ? 'font-semibold text-warn-line' : ''}>
          {d.zoom.toFixed(2)}배
          {upscaled ? ' · 화면을 늘려요(디지털 줌)' : ' · 화면을 늘리지 않아요'}
        </dd>
        <dt className="text-white/55">손떨림</dt>
        <dd>
          {d.stabilization === 'off' ? '꺼짐' : `켜짐(${d.stabilization})`}
          {!d.stabilizationSupported && ' · 이 형식은 못 켜요'}
        </dd>
        <dt className="text-white/55">초점</dt>
        <dd className="tabular-nums">
          {d.manualFocus
            ? '수동'
            : d.focusMode === 'locked'
              ? '잠김'
              : d.focusMode === 'auto'
                ? '한 번 맞춤'
                : '계속 맞춤'}{' '}
          · 렌즈 {d.lens.toFixed(2)}
          {d.adjusting && ' · 맞추는 중'}
          {d.farOnly && ' · 먼 곳만'}
        </dd>
        <dt className="text-white/55">노출</dt>
        <dd className="tabular-nums">
          ISO {Math.round(d.iso)} · 1/{Math.round(1 / Math.max(d.shutter, 1e-4))}초 ·
          화각 {d.fovDeg.toFixed(1)}°
        </dd>
      </dl>

      <div className="mt-3 space-y-2.5">
        <Row label="손떨림 보정">
          <Chip
            on={d.stabilization !== 'off'}
            onClick={() => void tune({ stabilization: true })}
          >
            켬
          </Chip>
          <Chip
            on={d.stabilization === 'off'}
            onClick={() => void tune({ stabilization: false })}
          >
            끔
          </Chip>
        </Row>
        <Row label="줌">
          <Chip on={d.zoom < 1.5} onClick={() => void tune({ zoom: 1 })}>
            1배
          </Chip>
          <Chip on={d.zoom >= 1.5} onClick={() => void tune({ zoom: 2 })}>
            2배
          </Chip>
        </Row>
        <Row label="초점">
          <Chip
            on={!d.manualFocus}
            onClick={() => {
              setLens(null);
              void tune({ autoFocus: true });
            }}
          >
            자동
          </Chip>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={shownLens}
            onChange={(e) => onLens(Number(e.target.value))}
            aria-label="수동 초점, 왼쪽이 가까이 오른쪽이 멀리"
            className="h-10 min-w-0 flex-1 accent-sky-soft"
          />
        </Row>
        <p className="text-xs text-white/50">
          막대를 움직이면 수동 초점이에요. 왼쪽이 가까이, 오른쪽이 멀리예요.
        </p>
      </div>

      <details className="mt-2 text-xs text-white/50">
        <summary className="cursor-pointer">애플 형식 원문</summary>
        <p className="selectable mt-1 break-all">{d.format}</p>
      </details>
    </Shell>
  );
}

function Shell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto max-h-[60dvh] overflow-y-auto overscroll-contain rounded-2xl bg-black/80 p-3.5 text-white backdrop-blur motion-safe:animate-fade-in">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">카메라 상태</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-white/60">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
        on ? 'bg-sky text-white' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}
