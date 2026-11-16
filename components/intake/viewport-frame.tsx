'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './experience.module.css';

/** 외부 접수 경로에서만 문서 스크롤을 잠근다. 키보드·주소창 변화는 실제 보이는 높이를 따른다. */
export function IntakeViewport({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const html = document.documentElement,
      body = document.body;
    const before = [
      html.style.overflow,
      body.style.overflow,
      body.style.overscrollBehavior,
    ];
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    const vv = window.visualViewport;
    const measure = () => {
      if (vv && vv.scale > 1.01) return;
      frame.current?.style.setProperty(
        '--intake-height',
        `${Math.round(vv?.height ?? window.innerHeight)}px`
      );
      frame.current?.style.setProperty(
        '--intake-top',
        `${Math.round(vv?.offsetTop ?? 0)}px`
      );
    };
    measure();
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      [html.style.overflow, body.style.overflow, body.style.overscrollBehavior] =
        before;
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);
  return (
    <div ref={frame} data-safe-area data-intake-viewport className={styles.viewport}>
      {children}
    </div>
  );
}
