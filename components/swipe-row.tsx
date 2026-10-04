'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '@/lib/haptics';

/** 지금 열려 있는 줄을 닫는 일 — 한 번에 한 줄만 열린다(아이폰 메일처럼) */
let closeOpenRow: (() => void) | null = null;

/** 손가락이 이만큼 움직여야 어느 쪽으로 미는지 정한다 */
const SLOP = 8;
const EASE = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * 왼쪽으로 밀면 뒤에 숨은 단추가 나오는 줄 — 아이폰 메일 · 미리 알림의 밀어서 하기(2026-10-04 '앱 느낌' 4단계).
 *
 * 예전 운동 목록은 줄 옆에 별 · 빼기 단추 칸이 테두리 상자로 붙어, 휴대폰에서 운동 이름 자리를 빼앗고 웹 폼처럼 보였다.
 * 휴대폰은 단추를 줄 뒤에 숨기고 밀면 꺼낸다. 절반 넘게 밀고 놓으면 열린 채로 서고, 그 밖은 닫힌다. 열린 줄은 다시 누르거나
 * 바깥을 누르면 닫힌다(누름이 줄 안의 체크로 새지 않는다).
 *
 * 손가락만 듣는다(pointerType touch) — PC 는 부르는 쪽이 따로 단추를 보인다(actions 는 desk 에서 숨는다). 앞판은 세로 굴리기만
 * 브라우저에 맡겨(touch-action: pan-y) 옆으로 미는 것이 화면 굴리기와 섞이지 않는다. 뒤의 단추는 늘 문서에 있어 화면 읽기 ·
 * 키보드로도 닿는다.
 */
export function SwipeRow({
  actions,
  actionWidth,
  className = '',
  children,
}: {
  /** 뒤에 숨는 단추들 — 오른쪽 끝에 붙는다 */
  actions: ReactNode;
  /** 단추들의 폭(px) — 열면 앞판이 이만큼 비킨다 */
  actionWidth: number;
  /** 바깥 틀(모서리 · 그림자) */
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const drag = useRef({
    id: -1,
    x0: 0,
    y0: 0,
    base: 0,
    dx: 0,
    axis: '' as '' | 'x' | 'y',
    moved: false,
  });

  const move = (x: number, animate: boolean) => {
    const el = front.current;
    if (!el) return;
    el.style.transition = animate ? EASE : 'none';
    el.style.transform = x ? `translateX(${x}px)` : '';
  };
  const close = () => {
    setOpen(false);
    move(0, true);
  };

  /* 열린 동안 — 바깥을 누르면 닫고, 다른 줄이 열리면 닫힌다 */
  useEffect(() => {
    if (!open) return;
    const shut = () => {
      setOpen(false);
      const el = front.current;
      if (el) {
        el.style.transition = EASE;
        el.style.transform = '';
      }
    };
    closeOpenRow = shut;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) shut();
    };
    document.addEventListener('pointerdown', down);
    return () => {
      document.removeEventListener('pointerdown', down);
      if (closeOpenRow === shut) closeOpenRow = null;
    };
  }, [open]);

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-y-0 right-0 flex desk:hidden"
        style={{ width: actionWidth }}
        /* 단추를 누르면(별 · 빼기) 줄을 닫는다 — 할 일을 했으니 */
        onClick={close}
      >
        {actions}
      </div>
      <div
        ref={front}
        className="relative touch-pan-y"
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          drag.current = {
            id: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            base: open ? -actionWidth : 0,
            dx: 0,
            axis: '',
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (e.pointerId !== d.id) return;
          const dx = e.clientX - d.x0;
          const dy = e.clientY - d.y0;
          if (!d.axis) {
            if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
            d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (d.axis === 'x') {
              /* 줄 밖으로 손가락이 나가도 계속 받는다 — 잡을 수 없는 누름(이미 끝남)이면 그냥 둔다 */
              try {
                front.current?.setPointerCapture(e.pointerId);
              } catch {}
              if (closeOpenRow && !open) closeOpenRow();
            }
          }
          if (d.axis !== 'x') return;
          d.moved = true;
          d.dx = dx;
          /* 닫힌 쪽(오른쪽)과 단추 폭 너머로는 고무줄처럼 무겁게 */
          let x = d.base + dx;
          if (x > 0) x /= 4;
          if (x < -actionWidth) x = -actionWidth + (x + actionWidth) / 4;
          move(x, false);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (e.pointerId !== d.id) return;
          d.id = -1;
          if (d.axis !== 'x') return;
          const opening = d.base + d.dx < -actionWidth / 2;
          if (opening && !open) haptic('light');
          setOpen(opening);
          move(opening ? -actionWidth : 0, true);
        }}
        onPointerCancel={(e) => {
          const d = drag.current;
          if (e.pointerId !== d.id) return;
          d.id = -1;
          if (d.axis === 'x') move(open ? -actionWidth : 0, true);
        }}
        /* 밀고 놓은 누름 · 열린 줄을 닫는 누름은 줄 안(체크 등)으로 보내지 않는다 */
        onClickCapture={(e) => {
          if (drag.current.moved) {
            drag.current.moved = false;
            e.preventDefault();
            e.stopPropagation();
          } else if (open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 밀어서 나오는 단추 한 칸 — 아이폰 색(즐겨찾기 주황 · 지우기 빨강)을 테마와 상관없이 그대로 */
export const SWIPE_ACTION =
  'flex h-full flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold text-white transition-opacity active:opacity-70';
