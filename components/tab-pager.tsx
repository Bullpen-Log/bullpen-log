'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NAV_ICONS } from '@/components/nav-icons';
import { Camera } from '@/components/icon';
import { DESK_MEDIA, MORE_HREF, type NavItem } from '@/lib/nav';
import { barSnapshot, setNavDirection } from '@/lib/nav-state';
import { haptic } from '@/lib/haptics';
import { TAB_CHOSEN_EVENT } from '@/components/tab-lens';

/**
 * 판 넘기기(2026-10-15 사용자 "인스타는 바로바로 넘어가고 이질감이 없다 — 저렇게") — 탭 넷(홈 · 투구 · 트레이닝 · 커뮤니티)을 한 틀 안에
 * 나란히 띄워 두고 옆으로 민다. 넘어갈 때 서버에 묻지 않는다 — 주소만 바꾼다(history.replaceState, Next 가 usePathname 에 반영하되
 * 다시 받지 않는다). 그래서 천천히 끌어도 옆에 '진짜 화면'이 있고 로딩이 없다.
 *
 * 네 판은 app/(app)/layout.tsx 의 병렬 경로 자리(@home · @videos · @training · @community)가 그린다. 처음 열 때 넷을 다 그리되
 * (주소가 아닌 판은 default.tsx 가 Suspense 로 뒤따라 들어옴) 처음 연 탭이 먼저 뜬다. 한 번 그려진 판은 주소가 바뀌어도 그대로 산다(판마다 제 스크롤 자리 그대로).
 * 하위 화면(투구 기록 날짜 · 분석 …)은 children — 그때는 판이 숨고 children 이 보인다(html[data-pager]="page").
 *
 * 쓸기: 손가락을 받는 법은 3판(김민, 옛 tab-swipe.tsx)에서 그대로 — 아이폰 웹뷰는 손가락이 조금만 위아래로 움직여도 세로 스크롤을
 * 시작하므로 옆으로 정해진 순간부터 touchmove 를 막는다(이 듣기만 passive 가 아니다). 놓으면 손 뗀 빠르기를 이어받아
 * 끝까지(settleFor). 끝 탭은 고무줄. 홈에서 오른쪽은 구속 측정(검은 자리표시 + zoom 전환).
 *
 * PC(desk)는 판을 옆으로 안 민다 — 지금 탭의 판만 보이고 창이 굴러간다(globals.css '판 넘기기').
 */
/*
 * 넷째 판 — 영양 → 커뮤니티(2026-10-20 김민). 영양은 이제 하위 화면(children)이다.
 * 셋째 판 — 트레이닝 → 타격(같은 날, docs/designs/hitting-restructure.md). 트레이닝은 투구 · 타격 종목 하단바 안의 하위 화면이다.
 */
/* 2026-10-21 커뮤니티 판을 걷었다 — 덕아웃 탭은 판이 아니라 덕아웃으로 넘어가는 길(lib/nav.ts DUGOUT_HREF) */
const TAB_ORDER = ['/today', '/videos', '/hitting'];
const base = (href: string) => href.split('?')[0];

/** 놓았을 때 넘어가는 기준 — 폭의 이만큼 */
const SNAP_RATIO = 0.25;
/** 빠르게 튕기면 짧게 밀어도 넘어간다(px/ms) — 손 떼기 직전의 빠르기로 본다 */
const FLICK_SPEED = 0.35;
const FLICK_FRESH_MS = 100;
/** 이보다 움직여야 쓸기인지 세로 스크롤인지 정한다 */
const SLOP = 10;
/** 옆으로가 세로보다 이만큼 커야 쓸기(약 40° 안) */
const LOCK_RATIO = 1.2;
const SETTLE_MS = 200;
const TAP_MS = 240;
/** 손가락을 스스로 받는 부품(touch-action 을 따로 둔 것) */
const TOUCH_OWNER =
  '.touch-none, .touch-pan-y, .touch-pan-x, .touch-pinch-zoom, [style*="touch-action"]';

/** 손 뗀 뒤의 미끄러짐 — 손가락 빠르기를 그대로 이어받는다(3판). 시간은 130~280ms */
function settleFor(dist: number, speed: number) {
  const d = Math.max(1, Math.abs(dist));
  const v = Math.max(0, speed);
  const ms =
    v > 0.05 ? Math.round(Math.min(280, Math.max(130, (2.2 * d) / v))) : SETTLE_MS;
  const y1 = Math.min(1, (0.2 * v * ms) / d);
  return { ms, ease: `transform ${ms}ms cubic-bezier(0.2, ${y1.toFixed(3)}, 0.35, 1)` };
}

/*
 * 하단 탭을 누를 때 — 판이 미끄러지고 주소만 바뀐다. 탭 첫 화면(판 넘기기)에서만 받는다; 못 받으면 false(그때는 router.push).
 */
let slideHandler: ((href: string) => boolean) | null = null;
export function slideToTab(href: string): boolean {
  return slideHandler?.(href) ?? false;
}

export function TabPager({
  tabs,
  camera = null,
  panels,
  order = TAB_ORDER,
  children,
}: {
  /** 하단 탭(잠긴 탭은 설정 주소) — 쓸어서 넘어갈 때 주소 · 이름 */
  tabs: NavItem[];
  /** 홈에서 오른쪽으로 쓸면 여는 것(구속 측정). 없으면 고무줄 */
  camera?: NavItem | null;
  /** 판 넷 — TAB_ORDER 차례(홈 · 덕아웃 · 투구 · 타격, 2026-10-21) */
  panels: ReactNode[];
  /** 판의 주소 차례 — 기본은 하단 탭 넷. 시험 화면이 바꿔 쓴다 */
  order?: string[];
  /** 하위 화면(children) */
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  /*
   * 투구 기록 팝업(/pitch-log/<날짜>, @modal 가로채기)이 떠도 밑의 판은 그대로 — 팝업 전 주소를 쥔다(그리는 도중 상태 보정, day-modal 과
   * 같은 꼴). 전에는 index 가 -1 → html[data-pager='page'] → 트랙이 display:none 으로 팝업 뒤가 비고(PC 는 바닥글이 막 뒤로 올라옴),
   * 닫으면 판의 스크롤 자리를 잃었다(2026-10-17). 주소로 곧장 들어온 하드 로드는 쥔 주소도 팝업 주소라 지금처럼 children 전체 화면.
   */
  const popup = pathname.startsWith('/pitch-log/');
  const [shown, setShown] = useState({ pathname, view });
  if (!popup && (shown.pathname !== pathname || shown.view !== view))
    setShown({ pathname, view });
  const index = order.findIndex((h) => base(h) === shown.pathname);
  const tabMode = index >= 0;
  const track = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ item: NavItem } | null>(null);
  const ghostEl = useRef<HTMLDivElement>(null);
  const latest = useRef({ pathname, index, tabs, camera, order });
  useEffect(() => {
    latest.current = { pathname, index, tabs, camera, order };
  }, [pathname, index, tabs, camera, order]);
  /*
   * 판마다 마지막 주소 — 아이폰 탭 막대처럼 하위 화면(암케어 · 메커니즘 · 영양 날짜 …)을 두고 다른 탭에 갔다 오면 그 화면 그대로 돌아온다.
   * 판은 주소를 바꿔도 다시 안 받아 보던 화면이 남아 있는데, 돌아올 때 탭 주소(?view=home)로만 바꿔 주소와 화면이 어긋났다(2026-10-17
   * 금윤호 버그 사냥 · 김민 "iOS 처럼"). 지금 탭을 한 번 더 누르면 첫 화면으로 가는 것은 하단 탭이 한다(mobile-tabs onClick).
   */
  const lastUrl = useRef<Record<number, string>>({});
  useEffect(() => {
    const i = order.findIndex((h) => base(h) === pathname);
    if (i < 0) return;
    const q = searchParams.toString();
    lastUrl.current[i] = q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams, order]);

  /* 틀에 알린다 — 판 넘기기인지(판이 굴러간다 · 본문 여백 없음) 하위 화면인지(창이 굴러간다) */
  useLayoutEffect(() => {
    document.documentElement.dataset.pager = tabMode ? 'tabs' : 'page';
    return () => {
      delete document.documentElement.dataset.pager;
    };
  }, [tabMode]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const html = document.documentElement;
    const tabList = () => latest.current.tabs.filter((t) => t.href !== MORE_HREF);
    const hrefOf = (i: number) => tabList()[i]?.href ?? latest.current.order[i];

    const setDx = (dx: number) => el.style.setProperty('--dx', `${dx}px`);
    const trans = (v: string) => {
      el.style.transition = v;
    };
    let settleTimer = 0;

    /*
     * 주소만 바꾼다 — 판은 그대로, 하단 탭 렌즈는 바로 그 칸으로. want = 부른 쪽이 ? 까지 정한 주소(앱 종목 바의 '기록' ?view=log ·
     * 홈 그날 칸의 '투구 탭에서 보기') — 판의 지난 주소(lastUrl)보다 먼저다(2026-10-21: 지난 주소가 이겨 기록 대신 투구 홈이 열렸다).
     */
    const commit = (i: number, want?: string) => {
      const href = hrefOf(i);
      /* state 는 null — Next 의 state 객체를 그대로 넘기면 Next 가 제 것으로 보고 usePathname 을 안 바꾼다(2026-10-15 시험) */
      window.history.replaceState(null, '', want ?? lastUrl.current[i] ?? href);
      window.dispatchEvent(new CustomEvent(TAB_CHOSEN_EVENT, { detail: href }));
    };
    /* i 번째 판으로 미끄러진다(지금 --dx 에서) */
    const slide = (i: number, ease: string, ms: number, done?: () => void) => {
      window.clearTimeout(settleTimer);
      trans(ease);
      el.style.setProperty('--i', String(i));
      setDx(0);
      settleTimer = window.setTimeout(() => {
        trans('');
        el.style.willChange = '';
        done?.();
      }, ms + 20);
    };

    slideHandler = (href) => {
      if (window.matchMedia(DESK_MEDIA).matches) return false;
      const { index: cur } = latest.current;
      if (cur < 0 || drag.current?.on) return false;
      const i = latest.current.order.findIndex((h) => base(h) === base(href));
      if (i < 0 || i === cur) return false;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.style.willChange = 'transform';
      if (reduce) slide(i, 'none', 0);
      else slide(i, `transform ${TAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`, TAP_MS);
      commit(i, href.includes('?') ? href : undefined);
      return true;
    };

    const ownerOf = (t: Element | null): 'all' | 'left' | 'right' | null => {
      if (t?.closest('dialog, [data-sheet], [data-gate]')) return 'all';
      for (let e = t; e && e !== el; e = e.parentElement) {
        if (e.hasAttribute('data-no-swipe')) return 'all';
        const claim = e.getAttribute('data-swipe-claim');
        if (claim === 'left' || claim === 'right' || claim === 'all') return claim;
        if (e.matches(TOUCH_OWNER)) return 'all';
        const tag = e.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          e.getAttribute('role') === 'slider'
        )
          return 'all';
        if (e.scrollWidth > e.clientWidth + 1 && !e.hasAttribute('data-panel')) {
          const ov = getComputedStyle(e).overflowX;
          if (ov === 'auto' || ov === 'scroll') return 'all';
        }
      }
      return null;
    };
    const touchOf = (e: TouchEvent, id: number) => {
      for (let k = 0; k < e.changedTouches.length; k++)
        if (e.changedTouches[k].identifier === id) return e.changedTouches[k];
      return null;
    };
    /*
     * 옆 판 — 쓸어서 가는 곳은 홈(첫 칸)에서 오른쪽의 구속 측정 하나뿐(2026-10-15 김민 "홈에서 구속 측정 쪽으로 쓸기 빼고 나머지 쓸기는 다
     * 없애 줘"). 탭끼리는 하단 탭으로만 옮긴다. 'tab' 갈래(옆 탭으로 넘기기)는 남겨 두었지만 지금은 오지 않는다.
     */
    const neighbor = (i: number, dir: 1 | -1): 'tab' | 'camera' | null =>
      i === 0 && dir === -1 && latest.current.camera ? 'camera' : null;

    const onDown = (e: TouchEvent) => {
      const old = drag.current;
      /* 끌던 손가락이 이미 떨어졌으면(끝 알림을 놓침 — 손가락 밑 노드가 다시 그려지면 track 까지 안 온다) 3초를 기다리지 않고 푼다 */
      const lost =
        old != null && !Array.from(e.touches).some((t) => t.identifier === old.id);
      if (old && (!old.on || lost || e.timeStamp - old.t > 3000)) {
        drag.current = null;
        if (old.on) {
          trans('');
          setDx(0);
          setGhost(null);
        }
      }
      if (e.touches.length !== 1) return;
      if (drag.current || leaving.current) return;
      if (window.matchMedia(DESK_MEDIA).matches) return;
      const i = latest.current.index;
      /* 홈에서만(구속 측정 쪽) — 다른 탭은 손가락을 아예 안 받는다. 트레이닝 · 영양의 날짜 띠 같은 가로 칸은 제 스스로 굴러간다 */
      if (i !== 0 || !latest.current.camera) return;
      const p = e.touches[0];
      if (p.clientX < 16) return;
      /* 탭의 첫 화면에서만 — 트레이닝 하위 화면(메커니즘 · 암케어, '‹ 뒤로')도 주소는 /training */
      if (barSnapshot().back) return;
      if (!(e.target instanceof Element) || !el.contains(e.target)) return;
      const claim = ownerOf(e.target);
      if (claim === 'all') return;
      drag.current = {
        claim,
        id: p.identifier,
        x: p.clientX,
        y: p.clientY,
        t: e.timeStamp,
        w: window.innerWidth,
        on: false,
        dx: 0,
        dir: 0,
        vx: 0,
        px: p.clientX,
        pt: e.timeStamp,
      };
    };
    const onMove = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      const p = touchOf(e, d.id);
      if (!p) return;
      const dx = p.clientX - d.x;
      const dy = p.clientY - d.y;
      if (!d.on) {
        if (e.touches.length > 1) {
          drag.current = null;
          return;
        }
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const yields = d.claim === (dx < 0 ? 'left' : 'right');
        /* 왼쪽(다음 탭 쪽)으로 미는 손가락은 받지 않는다 — 구속 측정은 오른쪽으로 쓸 때만 */
        const away = dx < 0;
        if (ax < SLOP && ay < SLOP) {
          if (ax > ay && !yields && !away && e.cancelable) e.preventDefault();
          return;
        }
        if (ax < ay * LOCK_RATIO || yields || away) {
          drag.current = null;
          return;
        }
        d.on = true;
        window.clearTimeout(settleTimer);
        trans('none');
        el.style.willChange = 'transform';
        d.x += dx > 0 ? SLOP : -SLOP;
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - d.pt;
      if (dt > 0) d.vx = 0.7 * ((p.clientX - d.px) / dt) + 0.3 * d.vx;
      d.px = p.clientX;
      d.pt = e.timeStamp;
      const mdx = p.clientX - d.x;
      const dir: 1 | -1 = mdx < 0 ? 1 : -1;
      const nb = neighbor(latest.current.index, dir);
      if (dir !== d.dir) {
        d.dir = dir;
        const cam = latest.current.camera;
        setGhost(nb === 'camera' && cam ? { item: cam } : null);
      }
      /* 갈 곳이 없는 쪽(쓸다가 되돌린 왼쪽)은 따라가지 않는다 — 고무줄도 없이 제자리 */
      d.dx = nb ? mdx : 0;
      setDx(d.dx);
      const g = ghostEl.current;
      if (g) g.style.transform = `translateX(${d.dx}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!touchOf(e, d.id)) return;
      drag.current = null;
      if (!d.on) return;
      const i = latest.current.index;
      const nb = d.dir === 0 ? null : neighbor(i, d.dir);
      const v = e.timeStamp - d.pt < FLICK_FRESH_MS ? d.vx : 0;
      const toward = Math.sign(v) === Math.sign(d.dx) && Math.abs(v) > FLICK_SPEED;
      const back = Math.sign(v) === -Math.sign(d.dx) && Math.abs(v) > FLICK_SPEED;
      const far = !back && (Math.abs(d.dx) > d.w * SNAP_RATIO || toward);
      const g = ghostEl.current;
      if (nb && far && e.type !== 'touchcancel') {
        const go = settleFor(
          d.w - Math.abs(d.dx),
          Math.sign(v) === Math.sign(d.dx) ? Math.abs(v) : 0
        );
        haptic('selection');
        if (nb === 'camera') {
          /* 구속 측정 — 자리표시가 끝까지 들어온 뒤 멀리서 튀어나오는 전환으로 간다 */
          const cam = latest.current.camera!;
          leaving.current = true;
          trans(go.ease);
          setDx(d.w);
          if (g) {
            g.style.transition = go.ease;
            g.style.transform = `translateX(${d.w}px)`;
          }
          window.setTimeout(() => {
            setNavDirection('zoom');
            router.push(cam.href);
            window.setTimeout(() => {
              if (html.dataset.nav === 'zoom') html.removeAttribute('data-nav');
              leaving.current = false;
            }, 900);
            /*
             * 이동이 끊겨(취소 · 실패 · 하단 탭이 끼어듦) 이 틀을 못 떠났으면 밀어 둔 판 · 검은 자리표시를 걷는다 — 걷는 곳이 새
             * 손가락뿐이라 검은 판이 화면을 덮은 채 남았다(2026-10-16). 넘어갔으면 이 틀이 사라져 아무 일도 없다.
             */
            window.setTimeout(() => {
              if (
                !el.isConnected ||
                location.pathname === new URL(cam.href, location.href).pathname
              )
                return;
              trans('');
              setDx(0);
              setGhost(null);
            }, 4000);
          }, go.ms);
          return;
        }
        slide(i + d.dir, go.ease, go.ms);
        commit(i + d.dir);
        return;
      }
      /* 제자리로 — 되돌리는 쪽 빠르기를 이어받아 */
      const backTo = settleFor(
        Math.abs(d.dx),
        Math.sign(v) === -Math.sign(d.dx) ? Math.abs(v) : 0
      );
      slide(i, backTo.ease, backTo.ms, () => setGhost(null));
      if (g) {
        g.style.transition = backTo.ease;
        g.style.transform = 'translateX(0px)';
      }
    };

    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      slideHandler = null;
      window.clearTimeout(settleTimer);
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [router]);

  const drag = useRef<{
    claim: 'left' | 'right' | null;
    id: number;
    x: number;
    y: number;
    t: number;
    w: number;
    on: boolean;
    dx: number;
    dir: 0 | 1 | -1;
    vx: number;
    px: number;
    pt: number;
  } | null>(null);
  const leaving = useRef(false);

  const Icon = ghost ? NAV_ICONS[ghost.item.icon] : null;
  return (
    <>
      <div
        ref={track}
        data-pager-track
        style={{ '--i': Math.max(0, index) } as CSSProperties}
      >
        {panels.map((node, i) => (
          <section
            key={order[i]}
            data-panel
            /*
             * 홈 말고는 휴대폰 위 막대가 없다(app-shell MobileTopBar 의 bare) — 위 여백은 시계 자리만큼(globals.css). 트레이닝 하위 화면은
             * '‹ 트레이닝' 막대가 서므로 막대만큼(서버가 그린 첫 화면부터 — 본문이 밀리지 않게)
             */
            data-bare={base(order[i]) === '/today' ? undefined : ''}
            data-active={i === index ? '' : undefined}
            inert={i !== index || undefined}
            aria-hidden={i !== index || undefined}
          >
            {node}
          </section>
        ))}
      </div>
      <div data-pager-page>{children}</div>
      {ghost && Icon && (
        /* 구속 측정 자리표시 — 왼쪽에서 손가락을 따라 들어오는 검은 판 */
        <div
          ref={ghostEl}
          aria-hidden
          data-tab-ghost
          className="pointer-events-none fixed inset-y-0 left-[-100%] z-60 grid w-screen place-items-center bg-black text-white desk:hidden"
        >
          <div className="flex flex-col items-center gap-3">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-white/12">
              {/* 구속 측정 · ABS 는 카메라가 열린 뒤 모드로 고른다(lib/camera-mode.ts) — 자리표시는 '카메라' */}
              {ghost.item.href === '/velocity' ? (
                <Camera aria-hidden className="h-10 w-10" />
              ) : (
                <Icon aria-hidden className="h-10 w-10" />
              )}
            </span>
            <span className="text-lg font-semibold">
              {ghost.item.href === '/velocity' ? '카메라' : ghost.item.label}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
