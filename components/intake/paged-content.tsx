'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './experience.module.css';

/** 긴 설명·오류·작은 창도 숨기지 않는다. 휠 대신 명시적인 이전/다음 내용으로 이동한다. */
export function PagedContent({
  children,
  className = '',
  resetKey,
}: {
  children: ReactNode;
  className?: string;
  resetKey?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    track = useRef<HTMLDivElement>(null);
  const [offsets, setOffsets] = useState([0]);
  const [capacity, setCapacity] = useState(0);
  const [extent, setExtent] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const el = viewport.current,
      content = track.current;
    if (!el || !content) return;
    const measure = () => {
      const height = el.clientHeight;
      if (height < 32) return;
      setCapacity(height);
      setExtent(content.scrollHeight);
      const top = content.getBoundingClientRect().top;
      const boundaries = [
        ...content.querySelectorAll(
          'p, li, fieldset, section, label, h2, h3, details, button'
        ),
      ]
        .map((n) => n.getBoundingClientRect().top - top)
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      const next = [0];
      while (next[next.length - 1] + height < content.scrollHeight - 2) {
        const start = next[next.length - 1];
        const candidates = boundaries.filter(
          (n) => n > start + height * 0.45 && n <= start + height - 4
        );
        const lineHeight =
          Number.parseFloat(getComputedStyle(content).lineHeight) || 24;
        const stride = Math.max(
          height * 0.5,
          (Math.floor(height / lineHeight) - 1) * lineHeight
        );
        next.push(candidates.at(-1) ?? start + stride);
        if (next.length > 1000) break;
      }
      setOffsets((old) =>
        old.length === next.length && old.every((n, i) => Math.abs(n - next[i]) < 2)
          ? old
          : next
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [resetKey]);
  const current = Math.min(page, offsets.length - 1);
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = offsets[current];
  }, [current, offsets]);
  return (
    <div className={styles.pages}>
      <div
        ref={viewport}
        className={styles.pageViewport}
        style={
          capacity > 0 && offsets[current + 1] != null
            ? {
                clipPath: `inset(0 0 ${Math.max(0, capacity - (offsets[current + 1] - offsets[current]))}px 0)`,
              }
            : undefined
        }
        onFocusCapture={(e) => {
          const el = viewport.current,
            content = track.current;
          if (!el || !content) return;
          const rect = e.target.getBoundingClientRect(),
            box = el.getBoundingClientRect();
          const visible = Math.min(
            el.clientHeight,
            (offsets[current + 1] ?? Infinity) - offsets[current]
          );
          if (rect.top >= box.top && rect.bottom <= box.top + visible) return;
          const top = rect.top - content.getBoundingClientRect().top;
          const next = offsets.findIndex(
            (offset, i) => offset <= top && (offsets[i + 1] ?? Infinity) > top
          );
          if (next >= 0) {
            setPage(next);
            el.scrollTop = offsets[next];
          }
        }}
      >
        <div
          style={{
            paddingBottom: Math.max(
              0,
              capacity - (extent - offsets[offsets.length - 1])
            ),
          }}
        >
          <div ref={track} className={className}>
            {children}
          </div>
        </div>
      </div>
      {offsets.length > 1 && (
        <nav className={styles.pageNav} aria-label="화면 내용 이동">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            이전 내용
          </button>
          <span aria-live="polite">
            {current + 1} / {offsets.length}
          </span>
          <button
            type="button"
            disabled={current === offsets.length - 1}
            onClick={() => setPage(current + 1)}
          >
            다음 내용
          </button>
        </nav>
      )}
    </div>
  );
}
