'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 숫자가 0 에서 값까지 올라가며 나타난다 — 끼움 화면의 큰 숫자(하루 투구 한도 · 부하 · 칼로리).
 *
 * active 가 켜지는 순간 시작한다(마법사는 모든 화면을 그려 두고 지금 것만 보이므로, 보이는 순간이 시작점).
 * 값이 바뀌면 지금 보이는 숫자에서 새 값으로 이어 간다. 움직임을 줄인 설정이면 바로 값을 보인다.
 * 화면에 들어온 뒤에 시작한다(2026-10-16 — 판 넘기기 옆 판 · 아래쪽 칸에서 안 보이는 동안 다 올라가 버리지 않게).
 * 움직이는 숫자는 화면 읽기에서 숨기고 끝값만 읽힌다(중간 숫자 · 0 을 읽지 않게). from 은 시작 비율 — 매일 보는 숫자는 0.7
 * (첫 장면이 '0 kcal' 이 아니게), 드문 축하 순간은 0.
 */
export function CountUp({
  value,
  active = true,
  duration = 720,
  format = (n: number) => Math.round(n).toLocaleString('ko-KR'),
  from = 0,
}: {
  value: number;
  active?: boolean;
  duration?: number;
  format?: (n: number) => string;
  /** 시작 비율(0~1) — 처음 보일 때 value × from 에서 올라온다 */
  from?: number;
}) {
  /* 안 보일 때(active 전)는 시작값 — 보이는 순간 거기서 올라온다 */
  const [start] = useState(() => value * from);
  const [shown, setShown] = useState(start);
  /* 지금 보이는 숫자 — 다음 움직임이 여기서 이어 간다(효과 안에서만 읽고 쓴다) */
  const shownRef = useRef(start);
  const box = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const on = active && seen;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setSeen(true);
      io.disconnect();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!on) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const put = (n: number) => {
      shownRef.current = n;
      setShown(n);
    };
    if (reduce) {
      raf = requestAnimationFrame(() => put(value));
      return () => cancelAnimationFrame(raf);
    }
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      put(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, value, duration]);

  return (
    <span ref={box} className="tabular-nums">
      <span aria-hidden>{format(on ? shown : start)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
