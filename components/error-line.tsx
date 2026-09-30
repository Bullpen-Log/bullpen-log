'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * 오류 한 줄 — 새 오류가 뜨면 그 자리가 보이게 굴려 온다(components/ui.tsx 의 FormError 가 쓴다).
 *
 * 오류 칸은 대개 폼 맨 위에 있고 저장 단추는 맨 밑이라, 폰에서 저장을 눌러 실패해도 단추만 원래 모양으로 돌아오고 아무 일도
 * 없는 것처럼 보였다(투구 기록 · 내 정보). 이미 보이면 가만히 둔다(block: 'nearest').
 */
export function ErrorLine({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const text = typeof children === 'string' ? children : '';

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [text]);

  return (
    <p
      ref={ref}
      role="alert"
      className="scroll-my-24 rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger"
    >
      {children}
    </p>
  );
}
