'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ICONS } from '@/components/nav-icons';
import { DESK_MEDIA, MORE_HREF, type NavItem } from '@/lib/nav';
import { TRAINING_HOME_HREF } from '@/lib/training-part';
import { setNavDirection } from '@/lib/nav-state';
import { haptic } from '@/lib/haptics';

/**
 * 휴대폰 탭 쓸기(2026-10-14 사용자 "인스타처럼 — 터치한 만큼만 옆으로 따라오고, 빠르게 움직이면 바로 넘어가게").
 *
 * 차례는 하단 탭 그대로: 홈 → 투구 → 트레이닝 → 영양(더보기는 빼고). 첫 화면에서만 — 하위 화면(‹ 뒤로)과 PC 는 안 쓸린다.
 *
 * 탭마다 다른 화면(서버가 따로 그린다)이라 인스타처럼 옆 화면을 미리 띄워 둘 수 없다. 그래서:
 *   끄는 동안   본문(main)이 손가락을 따라 밀리고, 옆에서 다음 탭의 자리표시(바탕색 판 + 아이콘 · 이름 + 뼈대 줄)가 같이 들어온다.
 *   놓으면      폭의 1/4 을 넘었거나 빠르게 튕겼으면(0.45px/ms) 끝까지 밀린 뒤 그 탭으로 간다(router.push). 새 화면이 그려지면 자리표시가
 *               옅어지며 걷힌다. 덜 끌었으면 제자리로.
 *   끝 탭       옆이 없으면 고무줄처럼 1/4 만 따라오고 돌아간다.
 *
 * 본문 안의 가로 스크롤 칸(overflow-x) · 가로로 쓰는 부품(data-no-swipe — 홈 요약 칸) · 입력칸 위에서 시작한 손가락은 안 받는다.
 * 세로로 먼저 움직이면(touch-action: pan-y 가 브라우저에 넘긴다) 브라우저가 굴리고 우리는 pointercancel 을 받는다.
 * 왼쪽 끝 16px 은 아이폰의 '뒤로' 제스처 자리라 안 받는다.
 */
const TAB_ORDER = ['/today', '/videos', TRAINING_HOME_HREF, '/nutrition'];
/** 놓았을 때 넘어가는 기준 — 폭의 이만큼 */
const SNAP_RATIO = 0.25;
/** 빠르게 튕기면 짧게 밀어도 넘어간다(px/ms) */
const FLICK_SPEED = 0.45;
/** 이보다 움직여야 쓸기 — 그 전엔 누름 */
const SLOP = 10;
/** 끝까지 미끄러지는 시간 */
const SETTLE_MS = 260;

type Ghost = { dir: 1 | -1; item: NavItem; done: boolean };

export function TabSwipe({
  tabs,
  order = TAB_ORDER,
}: {
  tabs: NavItem[];
  /** 쓸리는 화면의 차례(경로) — 기본은 하단 탭 넷. 시험 화면이 바꿔 쓴다 */
  order?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const ghostEl = useRef<HTMLDivElement>(null);
  /* 끌기 — 손가락 · 시작 자리 · 폭 · 지금 밀린 거리. 넘어가는 중(target)에는 새 끌기를 안 받는다 */
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    t: number;
    w: number;
    on: boolean;
    dx: number;
    dir: 0 | 1 | -1;
  } | null>(null);
  const target = useRef<string | null>(null);
  /* 지금 밀린 거리 — 자리표시가 한 장면 늦게 생겨도 그 자리에서 시작하게 */
  const xRef = useRef(0);
  useLayoutEffect(() => {
    const g = ghostEl.current;
    if (g && ghost && !ghost.done) g.style.transform = `translateX(${xRef.current}px)`;
  }, [ghost]);
  /* 문서 듣기(아래 effect)가 최신 경로 · 탭을 읽도록 — 그릴 때가 아니라 effect 에서 적는다 */
  const latest = useRef({ pathname, tabs, order });
  useEffect(() => {
    latest.current = { pathname, tabs, order };
  }, [pathname, tabs, order]);

  /* 화면이 바뀌면(새 탭이 그려지면) 본문을 제자리로, 자리표시는 옅어지며 걷힌다 */
  useEffect(() => {
    if (!target.current) return;
    target.current = null;
    const main = document.querySelector<HTMLElement>('main');
    if (main) {
      main.style.transition = 'none';
      main.style.transform = '';
      void main.offsetWidth;
      main.style.transition = '';
    }
    setGhost((g) => (g ? { ...g, done: true } : g));
    const t = window.setTimeout(() => setGhost(null), 200);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;

    const swipeTabs = () => latest.current.tabs.filter((t) => t.href !== MORE_HREF);
    const indexOf = (path: string) => latest.current.order.indexOf(path);

    const blocked = (el: Element | null) => {
      for (let e = el; e && e !== main; e = e.parentElement) {
        if (e.hasAttribute('data-no-swipe')) return true;
        const tag = e.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          e.getAttribute('role') === 'slider'
        )
          return true;
        if (e.scrollWidth > e.clientWidth + 1) {
          const ov = getComputedStyle(e).overflowX;
          if (ov === 'auto' || ov === 'scroll') return true;
        }
      }
      return false;
    };

    const setX = (dx: number) => {
      xRef.current = dx;
      main.style.transform = dx ? `translateX(${dx}px)` : '';
      const g = ghostEl.current;
      if (g) g.style.transform = `translateX(${dx}px)`;
    };

    const onDown = (e: PointerEvent) => {
      if (target.current || drag.current) return;
      if (e.pointerType === 'mouse' || window.matchMedia(DESK_MEDIA).matches) return;
      if (indexOf(latest.current.pathname) < 0) return;
      if (e.clientX < 16) return;
      if (
        !(e.target instanceof Element) ||
        !main.contains(e.target) ||
        blocked(e.target)
      )
        return;
      drag.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        w: window.innerWidth,
        on: false,
        dx: 0,
        dir: 0,
      };
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.on) {
        if (Math.abs(dx) < SLOP) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          drag.current = null;
          return;
        }
        d.on = true;
        main.style.transition = 'none';
      }
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      if (dir !== d.dir) {
        d.dir = dir;
        const i = indexOf(latest.current.pathname);
        const next = swipeTabs()[i + dir];
        setGhost(next ? { dir, item: next, done: false } : null);
      }
      const i = indexOf(latest.current.pathname);
      const has = !!swipeTabs()[i + dir];
      /* 옆 탭이 없으면 고무줄 */
      d.dx = has ? dx : dx * 0.25;
      setX(d.dx);
    };
    const onEnd = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      if (!d.on) return;
      const i = indexOf(latest.current.pathname);
      const next = swipeTabs()[i + d.dir];
      const speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t);
      const far = Math.abs(d.dx) > d.w * SNAP_RATIO || speed > FLICK_SPEED;
      const ease = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      main.style.transition = ease;
      const g = ghostEl.current;
      if (g) g.style.transition = ease;
      if (next && far && e.type !== 'pointercancel') {
        haptic('selection');
        target.current = next.href;
        setX(-d.dir * d.w);
        /* 끝까지 밀린 뒤 간다 — 새 화면은 자리표시 뒤에서 그려지고, 그려지면 자리표시가 걷힌다(위 effect) */
        window.setTimeout(() => {
          setNavDirection('none');
          router.push(next.href);
        }, SETTLE_MS);
        return;
      }
      setX(0);
      window.setTimeout(() => {
        main.style.transition = '';
        setGhost(null);
      }, SETTLE_MS);
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onEnd, { passive: true });
    document.addEventListener('pointercancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
      main.style.transform = '';
      main.style.transition = '';
    };
  }, [router]);

  if (!ghost) return null;
  const Icon = NAV_ICONS[ghost.item.icon];
  /* 자리표시는 옆에서 들어온다 — 본문과 같은 거리만큼 밀리며(setX), 넘어가면 0 에 서서 새 화면을 기다린다 */
  const style: CSSProperties = { left: `${ghost.dir * 100}%` };
  return (
    <div
      ref={ghostEl}
      aria-hidden
      data-tab-ghost
      data-done={ghost.done ? '' : undefined}
      className="pointer-events-none fixed inset-y-0 z-30 w-screen bg-page pt-[calc(env(safe-area-inset-top)+3.5rem+1.5rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] desk:hidden"
      style={style}
    >
      <div className="flex items-center gap-2 text-sky">
        <Icon aria-hidden className="h-7 w-7" />
        <span className="text-3xl font-bold tracking-tight text-ink">
          {ghost.item.label}
        </span>
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-28 rounded-2xl bg-surface" />
        <div className="h-20 rounded-2xl bg-surface" />
        <div className="h-20 rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
