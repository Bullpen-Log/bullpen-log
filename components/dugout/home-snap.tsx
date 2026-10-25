'use client';

import { useEffect } from 'react';

/**
 * 덕아웃 홈 두 칸 스크롤(2026-10-24 금윤호: "첫 화면에서 한 번 굴리면 바로 본문으로, 위로 굴리면 다시 첫 화면 — 부드러운 움직임이 중요").
 * 설계는 docs/designs/dugout-home-snap-prompt.md.
 *
 * 홈에는 위쪽에 두 자리만 있다 — A(맨 위, 찾기 판 · 위 막대 숨김), B(장터 묶음 [data-dugout-snap] 이 위 막대 바로 밑 · 막대 보임, 띠는 지나서).
 * A 에서 아래로 가려는 손짓(바퀴 한 칸 · 트랙패드 한 번 · 손가락 한 번 · PageDown · Space · ↓)은 B 로 한 번에 미끄러지고, B 에서 위로는 A 로.
 * B 밑은 여느 스크롤 그대로. A 와 B 사이에는 절대 멈추지 않는다(밑에서 올라오다 그 사이로 들어오면 마저 데려다준다).
 *
 * 왜 CSS scroll-snap 이 아닌가 — 본문이 길어 mandatory 는 자유 스크롤과 다투고, proximity 는 사이에 멈추고, 움직임의 속도 · 곡선을 못 고른다.
 * 그래서 진짜 스크롤 자리는 그대로(찾기 · 링크 · Tab · 뒤로가기 그대로) 두고, A–B 구간의 입력만 가로채 rAF 로 한 번 미끄러뜨린다.
 *
 * 가장 중요한 것 — 트랙패드 관성: 한 번 쓸면 바퀴 알림이 1초 가까이 줄어들며 이어진다. 미끄러지는 동안과 그 뒤 잠깐(180ms 조용할 때까지, 또는
 * 새 손짓이 보일 때까지) 오는 알림은 삼킨다. 안 그러면 남은 관성이 B 를 지나쳐 굴러가거나 A 로 되튄다.
 *
 * 위 막대는 이 지휘자가 정한다(html[data-dugout-top]) — 미끄러지기 시작하는 순간에 바꿔 막대가 본문과 함께 내려앉는다.
 * 예전 IntersectionObserver 는 판이 화면에서 다 사라져야 바뀌어 B 에서는 막대가 안 떴다.
 */
const EDGE = 2;
const NEAR_B = 4;
const QUIET_MS = 180;
const SETTLE_MS = 90;
const TOUCH_SLOP = 6;
/** PC 판단 — 마우스가 있는 화면(globals.css 의 desk 변형과 같은 조건, 폭은 안 본다) */
const DESKTOP = '(hover: hover) and (pointer: fine)';

/* cubic-bezier(0.22, 1, 0.36, 1) — 밀어 놓고 천천히 내려앉는 곡선(되튐 없음) */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
const EASE = bezier(0.22, 1, 0.36, 1);

type Stop = 'A' | 'B';

export function HomeSnap() {
  useEffect(() => {
    const html = document.documentElement;
    /* PC(2026-10-25 덕아웃 PC 개편) — 두 칸 스크롤 없이 여느 화면처럼 굴러가고 위 막대는 늘 선다(globals.css '덕아웃 첫 화면'과 같은 조건) */
    if (matchMedia(DESKTOP).matches) return;
    const reduced = () => html.hasAttribute('data-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let B = 0;
    let raf = 0;
    let animating = false;
    let locked = false;
    let lastWheel = 0;
    let lastAbs = 0;
    let lastSign = 0;
    let lastY = scrollY;
    let dir = 0;
    let settleTimer = 0;
    let pointerDown = false;
    let touchY: number | null = null;
    let touchDone = false;

    /* 본문 자리(B)의 기준 — 장터 묶음([data-dugout-snap]), 안 보이면(싱커 앱) 본문 칸 맨 위 */
    const content = () => {
      const snap = document.querySelector<HTMLElement>('[data-dugout-snap]');
      return snap && snap.offsetParent ? snap : document.querySelector<HTMLElement>('[data-dugout-content]');
    };
    const bar = () => document.querySelector<HTMLElement>('[data-morph-bar]');
    const maxScroll = () => document.documentElement.scrollHeight - innerHeight;

    /* B 재기 — 막대는 transform 으로 숨어도 자리 높이는 그대로라 offsetHeight 로 잰다 */
    const measure = () => {
      const el = content();
      if (!el) return;
      const barH = bar()?.offsetHeight ?? 0;
      html.style.setProperty('--dugout-bar-h', `${barH}px`);
      const gap = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const top = el.getBoundingClientRect().top + scrollY;
      B = Math.max(0, Math.min(Math.round(top - barH - gap), maxScroll()));
    };

    const where = () => {
      const y = scrollY;
      if (y <= EDGE) return 'hero';
      if (Math.abs(y - B) <= NEAR_B) return 'content';
      if (y > B + NEAR_B) return 'below';
      return 'between';
    };

    const setBar = (show: boolean) => {
      if (show) delete html.dataset.dugoutTop;
      else html.dataset.dugoutTop = '';
    };

    /* 변형 연출 중 · 창이 열린 동안은 손대지 않는다 */
    const blocked = () =>
      html.hasAttribute('data-morph') ||
      html.hasAttribute('data-gate-up') ||
      !!document.querySelector('dialog[open]');

    const go = (stop: Stop) => {
      if (blocked()) return;
      measure();
      const from = scrollY;
      const to = stop === 'B' ? B : 0;
      setBar(stop === 'B');
      cancelAnimationFrame(raf);
      locked = true;
      if (reduced() || Math.abs(to - from) < 1) {
        window.scrollTo({ top: to, behavior: 'instant' });
        animating = false;
        lastY = to;
        return;
      }
      animating = true;
      const dist = Math.abs(to - from);
      const dur = Math.min(680, Math.max(420, 360 + dist * 0.35));
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const y = from + (to - from) * EASE(t);
        window.scrollTo({ top: y, behavior: 'instant' });
        if (t < 1) raf = requestAnimationFrame(step);
        else {
          animating = false;
          lastY = to;
        }
      };
      raf = requestAnimationFrame(step);
    };

    /* 안에서 더 굴러갈 칸(알림 창 목록 같은 것) 위에서는 그 칸이 먼저 */
    const innerScrolls = (target: EventTarget | null, down: boolean) => {
      let el = target instanceof Element ? target : null;
      while (el && el !== document.body && el !== html) {
        if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll') {
            if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
          }
        }
        el = el.parentElement;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const now = performance.now();
      const abs = Math.abs(e.deltaY);
      const sign = Math.sign(e.deltaY);
      const fresh = (abs >= 12 && abs >= lastAbs * 2) || (sign !== lastSign && abs >= 12);
      const quiet = now - lastWheel > QUIET_MS;
      lastWheel = now;
      lastAbs = abs;
      lastSign = sign;

      if (locked) {
        if (animating || !(quiet || fresh)) {
          e.preventDefault();
          return;
        }
        locked = false;
      }
      if (blocked() || innerScrolls(e.target, sign > 0)) return;

      const down = sign > 0;
      const s = where();
      if ((s === 'hero' && down) || (s === 'content' && !down) || s === 'between') {
        e.preventDefault();
        go(down ? 'B' : 'A');
      } else if (s === 'hero') {
        e.preventDefault();
      } else if (s === 'below' && !down && scrollY + e.deltaY < B) {
        /* 밑에서 위로 굴러오다 B 를 지나치려 하면 B 에서 멈춘다 — 남은 관성은 삼키고, 새로 위로 굴리면 A 로 */
        e.preventDefault();
        window.scrollTo({ top: B, behavior: 'instant' });
        setBar(true);
        locked = true;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
      touchDone = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (animating) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (touchY == null || blocked()) return;
      if (touchDone) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      const dy = touchY - e.touches[0].clientY; // + 면 손가락이 위로(= 아래로 가려 함)
      if (Math.abs(dy) < TOUCH_SLOP || innerScrolls(e.target, dy > 0)) return;
      const s = where();
      if ((s === 'hero' && dy > 0) || (s === 'content' && dy < 0) || s === 'between') {
        if (e.cancelable) e.preventDefault();
        touchDone = true;
        go(dy > 0 ? 'B' : 'A');
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || blocked()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const down = ['PageDown', 'ArrowDown', 'End'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
      const up = ['PageUp', 'ArrowUp', 'Home'].includes(e.key) || (e.key === ' ' && e.shiftKey);
      if (!down && !up) return;
      if (animating) {
        e.preventDefault();
        return;
      }
      const s = where();
      if ((s === 'hero' && down) || (s === 'content' && up) || s === 'between') {
        e.preventDefault();
        go(down ? 'B' : 'A');
      }
    };

    /* Tab 으로 본문에 들어가면 본문 자리로, 판으로 돌아가면 판 자리로 */
    const onFocus = (e: FocusEvent) => {
      if (animating || !(e.target instanceof Element)) return;
      const s = where();
      if (s === 'hero' && e.target.closest('[data-dugout-content]')) go('B');
      else if (s === 'content' && e.target.closest('[data-dugout-main]')) go('A');
    };

    /* 스크롤바 끌기 · 찾기 · 손가락 관성으로 사이에 들어오면, 잠잠해진 뒤 가던 쪽 자리로 */
    const onScroll = () => {
      if (animating) return;
      const y = scrollY;
      if (y !== lastY) dir = Math.sign(y - lastY);
      lastY = y;
      setBar(y >= B - 1 && y > EDGE);
      clearTimeout(settleTimer);
      if (where() === 'between') {
        settleTimer = window.setTimeout(() => {
          if (!animating && !pointerDown && where() === 'between') go(dir < 0 ? 'A' : 'B');
        }, SETTLE_MS);
      }
    };

    const onPointerDown = () => (pointerDown = true);
    const onPointerUp = () => {
      pointerDown = false;
      onScroll();
    };

    /* 처음 — 이 지휘자가 막대를 맡는다(서버 그림의 data-top 은 이제 안 본다), 사이에서 열렸으면(되돌아오기 · 새로고침) 가까운 자리로 바로 */
    html.dataset.dugoutReady = '';
    measure();
    if (!location.hash) {
      if (where() === 'between') window.scrollTo({ top: scrollY < B / 2 ? 0 : B, behavior: 'instant' });
    }
    lastY = scrollY;
    setBar(scrollY >= B - 1 && scrollY > EDGE);

    const ro = new ResizeObserver(() => measure());
    const main = document.querySelector('[data-dugout-main]');
    const grid = document.querySelector('[data-dugout-content]');
    if (main) ro.observe(main);
    if (grid) ro.observe(grid);
    document.fonts?.ready.then(measure).catch(() => {});

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('focusin', onFocus);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.visualViewport?.addEventListener('resize', measure);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      ro.disconnect();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.visualViewport?.removeEventListener('resize', measure);
      delete html.dataset.dugoutReady;
      html.style.removeProperty('--dugout-bar-h');
    };
  }, []);

  return null;
}
