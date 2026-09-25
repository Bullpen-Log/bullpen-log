'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 제자리에서 펴지고 접히는 칸.
 *
 * 높이가 0 에서 제 높이까지 부드럽게 바뀐다(grid-rows 0fr → 1fr). 'auto' 높이 사이는
 * CSS 만으로 오갈 수 없어서(크롬 최신판만 된다) 격자의 한 줄 높이를 옮기는 방식을 쓴다.
 *
 * 안의 것은 펴질 때 그리고, 다 접힌 뒤에 치운다 — 접히는 동안 칸이 비어 보이지 않게,
 * 다시 펼 때는 처음 상태(고른 양·적던 글)로 시작하게. 접힌 동안에는 누를 수 없게
 * 막고(inert) 화면 낭독기에서도 뺀다.
 *
 * 목록을 통째로 바꿔 끼우는 대신 이것을 쓴다. 바꿔 끼우면 목록이 새로 그려지며 줄이
 * 다시 들어오고(깜빡임), 굴려 둔 자리도 맨 위로 돌아간다.
 */
export function Expand({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  /* 펼 때는 그리는 도중에 바로 채운다 — 이펙트를 기다리면 빈 칸이 한 번 펴진다 */
  if (open && !mounted) setMounted(true);

  /*
   * 다 접힌 뒤에 치운다. transitionend 를 기다리지 않고 시간으로 잰다 — 움직임을
   * 줄인 사람에게는 전환이 없어 그 신호가 오지 않는다.
   */
  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), 340);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
    >
      <div className="min-h-0 overflow-hidden">{mounted && children}</div>
    </div>
  );
}
