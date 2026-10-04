'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * 그래프 칸의 실제 크기(px). 그래프를 화면 픽셀 그대로 그려야 점이 찌그러지지 않고 글자
 * 크기가 칸마다 같다. 처음 크기는 그리기 전에 바로 재고(칸이 비어 보이는 틈이 없다),
 * 그 뒤로는 칸이 달라질 때마다(창 크기, 옆 분석의 길이) 다시 잰다.
 */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
