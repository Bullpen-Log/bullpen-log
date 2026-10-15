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
import { barSnapshot, setNavDirection } from '@/lib/nav-state';
import { haptic } from '@/lib/haptics';
import { TAB_CHOSEN_EVENT } from '@/components/tab-lens';
import { TAB_SWIPE_TYPES } from '@/lib/transition-types';

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
 *   놓으면       폭의 1/4 을 넘었거나 빠르게 튕겼으면(0.45px/ms) 브라우저가 곧바로 끝까지 민다(CSS transition — GPU 가 돌려 메인
 *                스레드가 바빠도 안 끊김). 다 밀린 뒤 그 탭으로 가고(router.push, 화면 전환 없이 — TAB_SWIPE), 새 화면이 그려지면 자리표시가
 *                옅어지며 걷힌다. 덜 끌었으면 제자리로.
 *   자리표시     그 탭을 마지막으로 봤을 때의 본문 사본(DOM 복사, 아래 shots). 미리 받아 둔 새 화면과 거의 같아서 바뀌는 순간이 안 보인다.
 *                (2026-10-15 3판 — 2판은 손을 떼면 새 화면을 그리고 옛 · 새 본문을 사진으로 찍는 화면 전환을 걸어, 아이폰에서 손 뗀 뒤
 *                0.1~0.3초 멈췄다가 움직였다: 김민 "아직도 버벅인다".) 처음 가는 탭은 사본이 없어 아이콘 · 이름 · 뼈대.
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
const SLOP = 12;
/**
 * 옆으로가 세로보다 이만큼 커야 쓸기(약 40° 안). 1.4(35°)로 했더니 엄지로 둥글게 쓴 것이 자주 세로로 읽혀 안 넘어갔다
 * (2026-10-15 김민 "스와이프를 해도 인식이 안 될 때가 있다").
 */
const LOCK_RATIO = 1.2;
/** 끝까지 미끄러지는 시간 */
const SETTLE_MS = 260;
/** 놓은 뒤 새 화면을 이만큼 기다리고도 안 오면 자리표시를 끝까지 밀어 둔다(구속 측정 — zoom 전환만) */
const WAIT_MS = 350;
/** 탭을 연 뒤 이만큼 지나서 본문을 사본으로 떠 둔다 — 늦게 오는 조각(Suspense)까지 담기게 */
const SHOT_AFTER_MS = 1500;
/** 넘어간 화면이 이만큼 안 오면(신호 끊김 · 오류) 제자리로 — 본문이 화면 밖에 남아 빈 화면이던 것 */
const GIVE_UP_MS = 8000;

/** 손가락을 스스로 받는 부품(touch-action 을 따로 둔 것) — 클래스 · 인라인 스타일로 가린다 */
const TOUCH_OWNER =
  '.touch-none, .touch-pan-y, .touch-pan-x, .touch-pinch-zoom, [style*="touch-action"]';

/** 주소에서 물음표 뒤를 뺀 것 — 트레이닝은 /training?view=home 이라 pathname 과 그대로 비교하면 안 맞았다(2026-10-15 버그) */
const base = (href: string) => href.split('?')[0];

type Ghost = { dir: 1 | -1; item: NavItem; camera: boolean; done?: boolean };

/**
 * 탭마다 마지막으로 본 본문의 사본 — 쓸 때 옆에 진짜처럼 보인다. 문서 밖(떼어 둔) DOM 이라 그리지 않는다.
 * 자리(left · width · top)는 뜰 때 잰 본문 자리(맨 위로 굴렸을 때 기준) — 새 화면도 맨 위부터 보인다.
 */
type Shot = { node: HTMLElement; left: number; width: number; top: number };
const shots = new Map<string, Shot>();

/** 본문을 사본으로 뜬다 — 영상은 받지 않게, id 는 겹치지 않게, 창 · 화면 전환 이름은 빼고 */
function takeShot(main: HTMLElement): Shot {
  const r = main.getBoundingClientRect();
  const node = main.cloneNode(true) as HTMLElement;
  node.removeAttribute('style');
  node.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  node.querySelectorAll('dialog, iframe, script').forEach((e) => e.remove());
  node.querySelectorAll('video').forEach((v) => {
    v.removeAttribute('src');
    v.removeAttribute('autoplay');
    v.preload = 'none';
    v.querySelectorAll('source').forEach((x) => x.remove());
  });
  node
    .querySelectorAll<HTMLElement>('[style*="view-transition"]')
    .forEach((e) => (e.style.viewTransitionName = ''));
  return { node, left: r.left, width: r.width, top: r.top + window.scrollY };
}

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
    /* 손가락 밑 부품이 먼저 받는 쪽(그쪽으로 밀면 양보) */
    claim: 'left' | 'right' | null;
  } | null>(null);
  const target = useRef<string | null>(null);
  const waitTimer = useRef(0);
  const giveUp = useRef(0);
  const navTimer = useRef(0);
  /* 제자리로 돌아가는 움직임이 끝난 뒤 정리 — 그 사이 다시 끌면 걷는다(예전엔 끄는 중에 자리표시가 사라져 옆이 비었다) */
  const settleTimer = useRef(0);
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

  /* 이 탭의 본문을 사본으로 떠 둔다 — 다음에 옆 탭에서 이쪽으로 쓸 때 진짜 화면처럼 보이게 */
  useEffect(() => {
    if (!order.some((h) => base(h) === pathname)) return;
    const take = () => {
      const main = document.querySelector<HTMLElement>('main');
      if (!main || target.current || drag.current?.on || barSnapshot().back) return;
      if (main.style.transform) return;
      shots.set(pathname, takeShot(main));
    };
    const t = window.setTimeout(take, SHOT_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [pathname, order]);

  /*
   * 미리 받기 — 지금 탭을 뺀 탭들을 '통째로'(kind: full — 화면 자료까지). 기본(auto)은 동적 화면을 로딩 화면(loading.tsx)까지만 받아,
   * 쓸어 넘기면 뼈대가 뜨고 서버를 기다렸다(2026-10-15 김민: "스와이프하면 로딩 · 버벅임"). 통째로 받아 두면 놓는 순간 서버를 안 거치고
   * 그려진다. 받아 둔 것이 오래되면(staleTimes 30초 — onInvalidate) 다시 받되, 화면이 안 보일 때(앱이 뒤에 있음)는 미뤘다가 돌아오면.
   * 구속 측정은 다른 틀이라 예전처럼 가볍게.
   */
  useEffect(() => {
    let alive = true;
    const later = new Set<string>();
    const warm = (href: string) => {
      if (!alive) return;
      if (document.visibilityState !== 'visible') {
        later.add(href);
        return;
      }
      router.prefetch(href, {
        kind: 'full',
        onInvalidate: () => warm(href),
      } as Parameters<typeof router.prefetch>[1]);
    };
    for (const t of tabs)
      if (t.href !== MORE_HREF && base(t.href) !== pathname) warm(t.href);
    if (camera) router.prefetch(camera.href);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const hrefs = [...later];
      later.clear();
      hrefs.forEach(warm);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, tabs, camera, pathname]);

  /*
   * 새 화면이 그려지는 순간(그리기 직후, 칠하기 전) — 본문을 제자리 · 맨 위로, 자리표시(사본)는 옅어지며 걷힌다. 본문이 바뀐 것은
   * 위를 덮은 사본 뒤에서라 안 보이고, 사본과 새 화면이 거의 같아 걷히는 순간도 안 보인다.
   */
  useLayoutEffect(() => {
    if (!target.current) return;
    const zoom = document.documentElement.dataset.nav === 'zoom';
    target.current = null;
    window.clearTimeout(waitTimer.current);
    window.clearTimeout(giveUp.current);
    window.clearTimeout(navTimer.current);
    const main = document.querySelector<HTMLElement>('main');
    if (main) {
      main.style.transition = 'none';
      main.style.transform = '';
      main.style.willChange = '';
      void main.offsetWidth;
      main.style.transition = '';
    }
    if (zoom) {
      queueMicrotask(() => setGhost(null));
      return;
    }
    window.scrollTo(0, 0);
    /* 옅어지며 걷는다 — 칠하기 전에 DOM 에 바로(상태를 거치면 한 장면 늦다). 끝까지 밀 때 단 transform 전환이 남아 있으면
       옅어지기(globals.css [data-tab-ghost][data-done])가 안 걸려 걷는다 */
    const gEl = ghostEl.current;
    if (gEl) {
      gEl.style.transition = '';
      gEl.setAttribute('data-done', '');
    }
    /* 같은 정리 타이머 — 0.2초 안에 다시 끌면 걷는다 */
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setGhost(null), 200);
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

    /*
     * 손가락 밑에서 누가 옆으로 미는 것을 먼저 받나 — 'all' 이면 쓸기를 안 받고, 'left' · 'right' 면 그쪽으로 미는 것만 양보한다
     * (data-swipe-claim — 밀어서 지우기 줄은 닫혀 있으면 왼쪽으로 미는 것만 쓴다. 예전엔 줄 위에서 시작하면 어느 쪽이든 막혀,
     * 운동 목록이 화면을 채운 트레이닝 탭에서 쓸기가 자주 안 먹었다). 가장 가까운 것이 이긴다.
     */
    const ownerOf = (el: Element | null): 'all' | 'left' | 'right' | null => {
      /* 창 · 시트 안(본문 DOM 안에 있어도 위에 떠 있다) */
      if (el?.closest('dialog, [data-sheet], [data-gate]')) return 'all';
      for (let e = el; e && e !== main; e = e.parentElement) {
        if (e.hasAttribute('data-no-swipe')) return 'all';
        const claim = e.getAttribute('data-swipe-claim');
        if (claim === 'left' || claim === 'right' || claim === 'all') return claim;
        /*
         * 손가락을 스스로 받는 부품 — touch-action 을 따로 둔 것(그래프 훑기 · 밀어서 지우기 · 3D 돌리기 · 영상 편집 등은 모두
         * touch-pan-y 또는 touch-none). 예전엔 그 위에서 옆으로 밀면 부품과 본문이 같이 움직여 탭이 넘어갔다. 클래스 · 인라인 스타일로
         * 가린다 — 누를 때마다 조상마다 getComputedStyle 을 부르면 스타일을 강제로 다시 셈했다.
         */
        if (e.matches(TOUCH_OWNER)) return 'all';
        const tag = e.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          e.getAttribute('role') === 'slider'
        )
          return 'all';
        if (e.scrollWidth > e.clientWidth + 1) {
          const ov = getComputedStyle(e).overflowX;
          if (ov === 'auto' || ov === 'scroll') return 'all';
        }
      }
      return null;
    };

    /* 본문 · 자리표시만 옮긴다 — <html> 은 안 건드린다(문서 전체 스타일을 다시 셈하게 된다) */
    const setX = (dx: number) => {
      xRef.current = dx;
      main.style.transform = dx ? `translateX(${dx}px)` : '';
      const g = ghostEl.current;
      if (g) g.style.transform = `translateX(${dx}px)`;
    };

    const onDown = (e: PointerEvent) => {
      /*
       * 묵은 끌기 — 손가락 뗌(pointerup · pointercancel)을 놓치면(다른 부품이 포인터를 붙잡았다 놓는 등) 끄는 중 상태가 남아 그 뒤
       * 쓸기가 계속 안 먹었다. 새 손가락이 닿았는데 아직 쓸기로 정해지지 않았거나 3초 넘게 지난 끌기는 끝난 것으로 본다.
       */
      const old = drag.current;
      if (old && (!old.on || e.timeStamp - old.t > 3000)) {
        drag.current = null;
        if (old.on) {
          main.style.transition = '';
          main.style.willChange = '';
          setX(0);
          setGhost(null);
        }
      }
      if (target.current || drag.current) return;
      if (e.pointerType === 'mouse' || window.matchMedia(DESK_MEDIA).matches) return;
      const i = indexOf(latest.current.pathname);
      if (i < 0) return;
      if (e.clientX < 16) return;
      /* 당겨서 새로고침이 걸려 있으면(components/pull-to-refresh.tsx) */
      if (document.documentElement.dataset.ptr) return;
      /* 탭의 첫 화면에서만 — 트레이닝 하위 화면(메커니즘 · 암케어, '‹ 뒤로'가 있음)도 주소는 /training 이라 걸렸다 */
      if (barSnapshot().back) return;
      if (!(e.target instanceof Element) || !main.contains(e.target)) return;
      const claim = ownerOf(e.target);
      if (claim === 'all') return;
      drag.current = {
        claim,
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
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (Math.abs(dx) < Math.abs(dy) * LOCK_RATIO || d.claim === (dx < 0 ? 'left' : 'right')) {
          drag.current = null;
          return;
        }
        d.on = true;
        window.clearTimeout(settleTimer.current);
        main.style.transition = 'none';
        main.style.willChange = 'transform';
        if (ghostEl.current) {
          ghostEl.current.style.transition = 'none';
          /* 걷히던 중이면(DOM 에 바로 단 옅어짐) 다시 보이게 */
          ghostEl.current.removeAttribute('data-done');
        }
        /* 옆 탭을 미리 받아 둔다 — 쓸기로 정해진 뒤에만(예전엔 누르거나 굴리기 시작할 때마다 받았다) */
        const i0 = indexOf(latest.current.pathname);
        for (const dir of [1, -1] as const) {
          const n0 = neighbor(i0, dir);
          if (n0 && !n0.camera)
            router.prefetch(n0.item.href, { kind: 'full' } as Parameters<typeof router.prefetch>[1]);
        }
        /* 잡은 자리부터 따라오게 — 문턱(SLOP)만큼 튀지 않게 */
        d.x += dx > 0 ? SLOP : -SLOP;
      }
      const mdx = e.clientX - d.x;
      const dir: 1 | -1 = mdx < 0 ? 1 : -1;
      const i = indexOf(latest.current.pathname);
      const n = neighbor(i, dir);
      if (dir !== d.dir) {
        d.dir = dir;
        setGhost(n ? { dir, item: n.item, camera: n.camera } : null);
      }
      /* 옆 탭이 없으면 고무줄 */
      d.dx = n ? mdx : mdx * 0.25;
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
        const href = n.item.href;
        target.current = href;
        window.clearTimeout(giveUp.current);
        /* 끝내 안 오면(신호 끊김 · 오류) 제자리로 — 본문이 화면 밖에 남아 빈 화면이던 것 */
        giveUp.current = window.setTimeout(() => {
          if (target.current !== href) return;
          target.current = null;
          window.clearTimeout(waitTimer.current);
          window.clearTimeout(navTimer.current);
          if (html.dataset.nav === 'zoom') html.removeAttribute('data-nav');
          main.style.transition = ease;
          if (g) g.style.transition = ease;
          setX(0);
          window.setTimeout(() => {
            main.style.transition = '';
            main.style.willChange = '';
            setGhost(null);
          }, SETTLE_MS);
        }, GIVE_UP_MS);
        if (n.camera) {
          /* 구속 측정 — 다른 틀이라 멀리서 튀어나오는 화면 전환(zoom)으로 바로 간다 */
          setNavDirection('zoom');
          router.push(href);
          waitTimer.current = window.setTimeout(() => {
            if (!target.current) return;
            main.style.transition = ease;
            if (g) g.style.transition = ease;
            setX(-d.dir * d.w);
          }, WAIT_MS);
          window.setTimeout(() => {
            /* 구속 측정 화면(다른 틀)에는 전환을 끝내는 부품이 없어 표시를 직접 걷는다 */
            if (html.dataset.nav === 'zoom') html.removeAttribute('data-nav');
          }, 900);
          return;
        }
        /* 하단 탭의 렌즈도 지금 그 칸으로 — 본문과 같이 미끄러진다 */
        window.dispatchEvent(new CustomEvent(TAB_CHOSEN_EVENT, { detail: href }));
        /* 곧바로 끝까지 민다(GPU) — 다 밀린 뒤 화면을 바꾼다(같은 본문 칸이라, 미는 중에 바꾸면 새 화면이 밀려 나간다) */
        main.style.transition = ease;
        if (g) g.style.transition = ease;
        setX(-d.dir * d.w);
        navTimer.current = window.setTimeout(() => {
          if (target.current !== href) return;
          router.push(href, { transitionTypes: TAB_SWIPE_TYPES });
        }, SETTLE_MS);
        return;
      }
      main.style.transition = ease;
      if (g) g.style.transition = ease;
      setX(0);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        main.style.transition = '';
        main.style.willChange = '';
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
      main.style.willChange = '';
      window.clearTimeout(giveUp.current);
      window.clearTimeout(waitTimer.current);
      window.clearTimeout(settleTimer.current);
      window.clearTimeout(navTimer.current);
    };
  }, [router]);

  if (!ghost) return null;
  const Icon = NAV_ICONS[ghost.item.icon];
  /* 자리표시는 옆에서 들어온다 — 본문과 같은 거리만큼 밀리며(setX), 넘어가면 새 화면이 그 자리에서 이어 들어온다 */
  const style: CSSProperties = { left: `${ghost.dir * 100}%` };
  const done = ghost.done ? '' : undefined;
  const shot = ghost.camera ? undefined : shots.get(base(ghost.item.href));
  if (shot) {
    /* 그 탭을 마지막으로 봤을 때의 본문 사본 — 본문이 있던 자리 그대로(맨 위 기준) */
    return (
      <div
        ref={ghostEl}
        aria-hidden
        inert
        data-tab-ghost
        data-done={done}
        className="pointer-events-none fixed inset-y-0 z-30 w-screen overflow-hidden bg-page desk:hidden"
        style={style}
      >
        <div
          className="absolute"
          style={{ left: shot.left, width: shot.width, top: shot.top }}
          ref={(el) => {
            if (el && el.firstChild !== shot.node) el.replaceChildren(shot.node);
          }}
        />
      </div>
    );
  }
  if (ghost.camera) {
    /* 구속 측정 — 카메라 화면처럼 검은 판 가운데 아이콘 */
    return (
      <div
        ref={ghostEl}
        aria-hidden
        data-tab-ghost
        data-done={done}
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
      data-done={done}
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
