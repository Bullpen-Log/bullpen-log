'use client';

import { useMemo, useRef, useState } from 'react';
import { MODES, type CameraMode } from '@/lib/camera-mode';
import { haptic } from '@/lib/haptics';

/**
 * 모드 띠(웹) — 셔터 위에 아이폰 카메라의 '동영상 · 슬로모션' 띠처럼. 고른 것이 가운데 · 노란 글, 옆으로 밀거나 눌러 바꾼다
 * (docs/designs/camera-modes.md 2-2, 앱 native/src/velocity/mode-strip.tsx 와 같다). 측정 중(locked)엔 잠겨 흐리고 안 움직인다.
 * 관리자만 쓰는 모드는 일반 사용자에겐 안 보인다(칸이 하나면 띠를 안 그린다).
 */
const ITEM_W = 88;
const STEP_PX = ITEM_W / 2;

export function ModeStrip({
  value,
  isAdmin,
  locked,
  onChange,
}: {
  value: CameraMode;
  isAdmin: boolean;
  locked: boolean;
  onChange: (mode: CameraMode) => void;
}) {
  const items = useMemo(() => MODES.filter((m) => !m.adminOnly || isAdmin), [isAdmin]);
  const index = Math.max(
    0,
    items.findIndex((m) => m.key === value)
  );
  const [drag, setDrag] = useState(0);
  /* 누른 자리(칸 번호)도 같이 — 포인터를 잡으면(setPointerCapture) click 이 단추에 안 가서 놓을 때 직접 고른다 */
  const start = useRef<{ x: number; at: number | null } | null>(null);
  const skipClick = useRef(false);
  const pick = (i: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, i))];
    if (!next || next.key === value) return;
    haptic('selection');
    onChange(next.key);
  };
  if (items.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="카메라 모드"
      className={`relative h-8 overflow-hidden touch-pan-y ${locked ? 'opacity-45' : ''}`}
      onPointerDown={(e) => {
        if (locked) return;
        const at = (e.target as HTMLElement).closest<HTMLElement>('[data-at]')?.dataset.at;
        start.current = { x: e.clientX, at: at == null ? null : Number(at) };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        setDrag(e.clientX - start.current.x);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const { x, at } = start.current;
        const moved = e.clientX - x;
        start.current = null;
        setDrag(0);
        skipClick.current = true;
        /* 띠 폭의 반 넘게 밀면 옆 칸, 거의 안 움직였으면 누른 칸 */
        if (Math.abs(moved) > STEP_PX) pick(index + (moved < 0 ? 1 : -1));
        else if (at != null) pick(at);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDrag(0);
      }}
    >
      <div
        className="absolute left-1/2 top-0 flex h-8 items-center motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0.9,0.3,1)]"
        style={{ transform: `translateX(${-ITEM_W / 2 - index * ITEM_W + drag * 0.6}px)`, transition: drag ? 'none' : undefined }}
      >
        {items.map((m, i) => {
          const on = i === index;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={locked}
              data-at={i}
              onClick={() => {
                /* 손가락은 pointerup 이 처리했다 — 자판(Enter)만 여기로 */
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                pick(i);
              }}
              className={`h-8 text-footnote font-bold tracking-wide transition-colors ${on ? 'text-[#ffd60a]' : 'text-white/75'}`}
              style={{ width: ITEM_W }}
            >
              {m.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
