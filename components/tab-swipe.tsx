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
import { TAB_CHOSEN_EVENT } from '@/components/tab-lens';

/**
 * 휴대폰 탭 쓸기(2026-10-14 사용자 "인스타처럼 — 터치한 만큼만 옆으로 따라오고, 빠르게 움직이면 바로 넘어가게").
 *
 * 차례는 하단 탭 그대로: 홈 → 투구 → 트레이닝 → 영양(더보기는 빼고). 첫 화면에서만 — 하위 화면(‹ 뒤로)과 PC 는 안 쓸린다.
 * 홈에서 오른쪽으로 쓸면(인스타의 카메라처럼) 구속 측정으로 — 아이폰 카메라처럼 멀리서 튀어나온다(2026-10-15 사용자, 영상).
 *
 * 탭마다 다른 화면(서버가 따로 그린다)이라 인스타처럼 옆 화면을 미리 띄워 둘 수 없다. 대신:
 *   미리 받기    틀이 뜰 때 탭 넷 · 구속 측정을 미리 받아 두고(router.prefetch, next.config 의 staleTimes 30초), 끌기 시작할 때 옆 탭을 또
 *                받는다 — 놓는 순간 새 화면이 바로 있다(2026-10-15 사용자 "넘기고 나서 로딩되는 화면을 절대 보여주지 마").
 *   끄는 동안    본문(main)이 손가락을 따라 밀리고, 옆에서 다음 탭의 자리표시(바탕색 판 + 아이콘 · 이름)가 같이 들어온다.
 *   놓으면       폭의 1/4 을 넘었거나 빠르게 튕겼으면(0.45px/ms) 바로 그 탭으로 간다(router.push). 새 화면이 오면 화면 전환
 *                (globals.css 의 html[data-nav^='swipe'] — 옛 본문은 그 자리(--swipe-x)에서 밖으로, 새 본문은 그 옆에서 제자리로)이
 *                밀어 넣는다 — 실제 화면이 미끄러져 들어온다. 350ms 안에 안 오면(미리 못 받았을 때) 자리표시가 끝까지 밀려 기다린다.
 *                덜 끌었으면 제자리로.
 *   끝 탭        옆이 없으면 고무줄처럼 1/4 만 따라오고 돌아간다.
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
/** 놓은 뒤 새 화면을 이만큼 기다리고도 안 오면 자리표시를 끝까지 밀어 둔다 */
const WAIT_MS = 350;

/** 주소에서 물음표 뒤를 뺀 것 — 트레이닝은 /training?view=home 이라 pathname 과 그대로 비교하면 안 맞았다(2026-10-15 버그) */
const base = (href: string) => href.split('?')[0];

type Ghost = { dir: 1 | -1; item: NavItem; camera: boolean };

export function TabSwipe({
  tabs,
  camera = null,
  order = TAB_ORDER,
}: {
  tabs: NavItem[];
  /** 홈에서 오른쪽으로 쓸면 여는 것(구속 측정). 메뉴에 없는 사람(웹의 일반 사용자)은 null — 그냥 고무줄 */
  camera?: NavItem | null;
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
  const waitTimer = useRef(0);
  /* 지금 밀린 거리 — 자리표시가 한 장면 늦게 생겨도 그 자리에서 시작하게 */
  const xRef = useRef(0);
  useLayoutEffect(() => {
    const g = ghostEl.current;
    if (g && ghost) g.style.transform = `translateX(${xRef.current}px)`;
  }, [ghost]);
  /* 문서 듣기(아래 effect)가 최신 경로 · 탭을 읽도록 — 그릴 때가 아니라 effect 에서 적는다 */
  const latest = useRef({ pathname, tabs, order, camera });
  useEffect(() => {
    latest.current = { pathname, tabs, order, camera };
  }, [pathname, tabs, order, camera]);

  /* 미리 받기 — 틀이 뜰 때 탭 넷 · 구속 측정. 30초 지나면(staleTimes) 끌기 시작할 때 또 받는다 */
  useEffect(() => {
    for (const t of tabs) if (t.href !== MORE_HREF) router.prefetch(t.href);
    if (camera) router.prefetch(camera.href);
  }, [router, tabs, camera]);

  /*
   * 새 화면이 그려지는 순간(그리기 직후 · 전환이 찍기 전) — 본문을 제자리로, 자리표시를 걷는다. 옛 본문이 어디까지 밀려 있었나(--swipe-x)는
   * 끄는 동안 html 에 계속 적어 두어서 전환(globals.css)이 거기서 이어 민다.
   */
  useLayoutEffect(() => {
    if (!target.current) return;
    target.current = null;
    window.clearTimeout(waitTimer.current);
    const main = document.querySelector<HTMLElement>('main');
    if (main) {
      main.style.transition = 'none';
      main.style.transform = '';
      void main.offsetWidth;
      main.style.transition = '';
    }
    setGhost(null);
  }, [pathname]);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    const html = document.documentElement;

    const swipeTabs = () => latest.current.tabs.filter((t) => t.href !== MORE_HREF);
    const indexOf = (path: string) =>
      latest.current.order.findIndex((h) => base(h) === path);
    /* 옆 탭 — 홈(첫 칸)에서 오른쪽은 구속 측정 */
    const neighbor = (
      i: number,
      dir: 1 | -1
    ): { item: NavItem; camera: boolean } | null => {
      const t = swipeTabs()[i + dir];
      if (t) return { item: t, camera: false };
      const cam = latest.current.camera;
      if (i === 0 && dir === -1 && cam) return { item: cam, camera: true };
      return null;
    };

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
      html.style.setProperty('--swipe-x', `${dx}px`);
      const g = ghostEl.current;
      if (g) g.style.transform = `translateX(${dx}px)`;
    };

    const onDown = (e: PointerEvent) => {
      if (target.current || drag.current) return;
      if (e.pointerType === 'mouse' || window.matchMedia(DESK_MEDIA).matches) return;
      const i = indexOf(latest.current.pathname);
      if (i < 0) return;
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
      /* 옆 탭을 미리 받아 둔다 — 놓는 순간 바로 있게 */
      for (const dir of [1, -1] as const) {
        const n = neighbor(i, dir);
        if (n) router.prefetch(n.item.href);
      }
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
      const i = indexOf(latest.current.pathname);
      const n = neighbor(i, dir);
      if (dir !== d.dir) {
        d.dir = dir;
        setGhost(n ? { dir, item: n.item, camera: n.camera } : null);
      }
      /* 옆 탭이 없으면 고무줄 */
      d.dx = n ? dx : dx * 0.25;
      setX(d.dx);
    };
    const onEnd = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      if (!d.on) return;
      const i = indexOf(latest.current.pathname);
      const n = d.dir === 0 ? null : neighbor(i, d.dir);
      const speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t);
      const far = Math.abs(d.dx) > d.w * SNAP_RATIO || speed > FLICK_SPEED;
      const ease = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      const g = ghostEl.current;
      if (n && far && e.type !== 'pointercancel') {
        haptic('selection');
        target.current = n.item.href;
        /* 바로 간다 — 화면 전환이 지금 자리(--swipe-x)에서 이어 민다. 구속 측정은 멀리서 튀어나오는 전환(zoom) */
        setNavDirection(n.camera ? 'zoom' : d.dir === 1 ? 'swipe-next' : 'swipe-prev');
        if (!n.camera)
          window.dispatchEvent(
            new CustomEvent(TAB_CHOSEN_EVENT, { detail: n.item.href })
          );
        router.push(n.item.href);
        /* 미리 못 받아 늦으면 — 자리표시를 끝까지 밀어 두고 기다린다(그 자리에서 전환이 이어진다) */
        waitTimer.current = window.setTimeout(() => {
          if (!target.current) return;
          main.style.transition = ease;
          if (g) g.style.transition = ease;
          setX(-d.dir * d.w);
        }, WAIT_MS);
        if (n.camera)
          window.setTimeout(() => {
            /* 구속 측정 화면(다른 틀)에는 전환을 끝내는 부품이 없어 표시를 직접 걷는다 */
            if (html.dataset.nav === 'zoom') html.removeAttribute('data-nav');
          }, 900);
        return;
      }
      main.style.transition = ease;
      if (g) g.style.transition = ease;
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
  /* 자리표시는 옆에서 들어온다 — 본문과 같은 거리만큼 밀리며(setX), 넘어가면 새 화면이 그 자리에서 이어 들어온다 */
  const style: CSSProperties = { left: `${ghost.dir * 100}%` };
  if (ghost.camera) {
    /* 구속 측정 — 카메라 화면처럼 검은 판 가운데 아이콘 */
    return (
      <div
        ref={ghostEl}
        aria-hidden
        data-tab-ghost
        className="pointer-events-none fixed inset-y-0 z-30 grid w-screen place-items-center bg-black text-white desk:hidden"
        style={style}
      >
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-white/12">
            <Icon aria-hidden className="h-10 w-10" />
          </span>
          <span className="text-lg font-semibold">{ghost.item.label}</span>
        </div>
      </div>
    );
  }
  return (
    <div
      ref={ghostEl}
      aria-hidden
      data-tab-ghost
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
