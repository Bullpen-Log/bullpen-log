'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';
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
 *   놓으면       폭의 1/4 을 넘었거나 손 떼기 직전 빠르게 튕겼으면(0.35px/ms) 브라우저가 곧바로 끝까지 민다(CSS transition — GPU 가 돌려 메인
 *                스레드가 바빠도 안 끊김). 다 밀린 뒤 그 탭으로 가고(router.push, 화면 전환 없이 — TAB_SWIPE), 새 화면이 그려지면 자리표시가
 *                옅어지며 걷힌다. 덜 끌었으면 제자리로.
 *   자리표시     그 탭을 마지막으로 봤을 때의 본문 사본(DOM 복사, 아래 shots). 미리 받아 둔 새 화면과 거의 같아서 바뀌는 순간이 안 보인다.
 *                (2026-10-15 3판 — 2판은 손을 떼면 새 화면을 그리고 옛 · 새 본문을 사진으로 찍는 화면 전환을 걸어, 아이폰에서 손 뗀 뒤
 *                0.1~0.3초 멈췄다가 움직였다: 김민 "아직도 버벅인다".) 처음 가는 탭은 사본이 없어 아이콘 · 이름 · 뼈대.
 *   끝 탭        옆이 없으면 고무줄처럼 1/4 만 따라오고 돌아간다.
 *
 * 본문 안의 가로 스크롤 칸(overflow-x) · 가로로 쓰는 부품(data-no-swipe — 홈 요약 칸) · 입력칸 위에서 시작한 손가락은 안 받는다.
 * 세로로 먼저 움직이면 브라우저가 굴리고, 옆으로 먼저 움직이면 우리가 세로 스크롤을 막는다(아래 onDown 위 설명).
 * 왼쪽 끝 16px 은 아이폰의 '뒤로' 제스처 자리라 안 받는다.
 */
const TAB_ORDER = ['/today', '/videos', TRAINING_HOME_HREF, '/nutrition'];
/** 놓았을 때 넘어가는 기준 — 폭의 이만큼 */
const SNAP_RATIO = 0.25;
/** 빠르게 튕기면 짧게 밀어도 넘어간다(px/ms) — 손 떼기 직전의 빠르기로 본다 */
const FLICK_SPEED = 0.35;
/** 손 떼기 직전 이만큼 안에 움직였을 때만 그 빠르기를 튕김으로 본다(멈췄다 뗀 것은 튕김이 아니다) */
const FLICK_FRESH_MS = 100;
/** 이보다 움직여야 쓸기인지 세로 스크롤인지 정한다 — 그 전엔 누름 */
const SLOP = 10;
/**
 * 옆으로가 세로보다 이만큼 커야 쓸기(약 40° 안). 1.4(35°)로 했더니 엄지로 둥글게 쓴 것이 자주 세로로 읽혀 안 넘어갔다
 * (2026-10-15 김민 "스와이프를 해도 인식이 안 될 때가 있다").
 */
const LOCK_RATIO = 1.2;
/** 끝까지 미끄러지는 시간 — 손을 멈췄다 뗐을 때(빠르게 튕기면 짧아진다, settleFor) */
const SETTLE_MS = 200;
/** 하단 탭을 눌러 옮길 때 미끄러지는 시간(slideToTab) */
const TAP_MS = 240;

/**
 * 손 뗀 뒤의 미끄러짐 — 손가락 빠르기를 그대로 이어받는다(2026-10-15 사용자 "쓸기가 너무 딱딱하다"). 예전엔 얼마나 빠르게
 * 튕기든 늘 같은 시간 · 같은 곡선이라, 빠른 튕김은 손을 떼는 순간 느려지고 느린 끌기는 갑자기 빨라져 뚝 끊겨 보였다.
 * 곡선 cubic-bezier(0.2, y1, 0.35, 1)의 처음 기울기는 y1/0.2 — 그 기울기 × 남은 거리 ÷ 시간이 손 뗀 빠르기와 같게 y1 을 고른다.
 * 시간은 그 빠르기로 남은 거리를 2.2배 걸려 가는 만큼(빨리 튕길수록 짧게), 130~280ms 안.
 */
function settleFor(dist: number, speed: number) {
  const d = Math.max(1, Math.abs(dist));
  const v = Math.max(0, speed);
  const ms =
    v > 0.05 ? Math.round(Math.min(280, Math.max(130, (2.2 * d) / v))) : SETTLE_MS;
  const y1 = Math.min(1, (0.2 * v * ms) / d);
  return { ms, ease: `transform ${ms}ms cubic-bezier(0.2, ${y1.toFixed(3)}, 0.35, 1)` };
}
/** 놓은 뒤 새 화면을 이만큼 기다리고도 안 오면 자리표시를 끝까지 밀어 둔다(구속 측정 — zoom 전환만) */
const WAIT_MS = 350;
/** 탭을 연 뒤 이만큼 지나서 본문을 사본으로 떠 둔다 — 늦게 오는 조각(Suspense)까지 담기게 */
const SHOT_AFTER_MS = 1500;
/** 넘어간 화면이 이만큼 안 오면(신호 끊김 · 오류) 제자리로 — 본문이 화면 밖에 남아 빈 화면이던 것 */
const GIVE_UP_MS = 8000;

/** 손가락을 스스로 받는 부품(touch-action 을 따로 둔 것) — 클래스 · 인라인 스타일로 가린다 */
const TOUCH_OWNER =
  '.touch-none, .touch-pan-y, .touch-pan-x, .touch-pinch-zoom, [style*="touch-action"]';

/*
 * 하단 탭을 누를 때도 쓸기처럼 — 누르는 순간 본문이 밀리기 시작하고 새 화면은 곧바로 부른다(2026-10-15 사용자 "좀 더 빠르게").
 * 예전엔 누르면 서버가 새 화면을 보낼 때까지 아무것도 안 움직이다가 화면 전환(globals.css swipe-next · swipe-prev)이 돌아 느리게 느껴졌다.
 * 쓸리는 화면(탭 첫 화면)에 TabSwipe 가 떠 있을 때만 받는다 — 못 받으면 false, 그때는 예전 길(Link + 화면 전환).
 */
let slideHandler: ((href: string) => boolean) | null = null;
export function slideToTab(href: string): boolean {
  return slideHandler?.(href) ?? false;
}

/** 주소에서 물음표 뒤를 뺀 것 — 트레이닝은 /training?view=home 이라 pathname 과 그대로 비교하면 안 맞았다(2026-10-15 버그) */
const base = (href: string) => href.split('?')[0];

type Ghost = { dir: 1 | -1; item: NavItem; camera: boolean; done?: boolean };

/**
 * 탭마다 마지막으로 본 본문의 사본 — 쓸 때 옆에 진짜처럼 보인다. 문서 밖(떼어 둔) DOM 이라 그리지 않는다.
 * 자리(left · width · top)는 뜰 때 잰 본문 자리(맨 위로 굴렸을 때 기준) — 새 화면도 맨 위부터 보인다.
 * vw — 뜰 때의 화면 폭. 아이패드를 돌리면(세로 ↔ 가로) 본문 자리 · 줄바꿈이 달라져 옛 사본이 엉뚱한 자리에 보였다가 새 화면
 * 위에서 옅어지며 걷혔다(2026-10-15 '아이패드에서 잔상'). 폭이 다르면 사본을 안 쓴다(shotFor).
 */
type Shot = {
  node: HTMLElement;
  left: number;
  width: number;
  top: number;
  vw: number;
  /** 그 탭의 위 막대(홈만 — 로고 · 종) 사본과 자리. 막대가 없거나 숨어 있었으면 없다 */
  bar?: { node: HTMLElement; left: number; top: number; width: number; height: number };
};

/*
 * 위 막대(홈만 — 로고 · 종)와 그 뒤의 판(top-veil, 막대 자리를 바탕색으로 덮는다). 막대가 보일 때만 — 없는 탭(투구 · 트레이닝 · 영양)이거나
 * 숨어 있으면 빈 배열. 2026-10-15 사용자 "쓸 때 위 제목 부분이 밑 내용보다 한 타이밍 늦게 바뀐다": 홈에서 쓸면 막대와 판이 제자리에 남아
 * 들어오는 화면의 큰 제목을 가리고 있다가, 화면이 바뀐 뒤에야 0.28초 걸려 줄어들었다. 이제 막대 · 판도 본문과 같이 밀린다.
 */
function chromeNow(): HTMLElement[] {
  const bar = document.querySelector<HTMLElement>('[data-mobile-topbar]:not([data-hidden])');
  const veil = document.querySelector<HTMLElement>('[data-top-veil]:not([data-short])');
  return bar && veil ? [bar, veil] : [];
}
const shots = new Map<string, Shot>();
const shotFor = (href: string) => {
  const s = shots.get(href);
  return s && s.vw === window.innerWidth ? s : undefined;
};

/**
 * 본문을 사본으로 뜬다 — 영상은 받지 않게, id 는 겹치지 않게, 창 · 화면 전환 이름은 빼고.
 * 껍데기는 <main> 이 아니라 <div> 다(2026-10-15 사용자 "스와이프를 여러 번 연속으로 하면 화면에 아무것도 안 나온다"): 사본이
 * <main> 이면 자리표시가 떠 있는 동안 document.querySelector('main') 이 진짜 본문 대신 사본을 잡았다 — 새 화면이 와도 사본만
 * 제자리로 돌리고 진짜 본문은 화면 밖에 둔 채 자리표시가 걷혀 빈 화면이 됐다(전환 · 당겨서 새로고침도 같은 식으로 본문을 찾는다).
 */
function takeShot(main: HTMLElement): Shot {
  const r = main.getBoundingClientRect();
  const node = document.createElement('div');
  node.className = main.className;
  for (const child of main.childNodes) node.appendChild(child.cloneNode(true));
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
  /* 위 막대가 보이는 탭(홈)이면 막대도 떠 둔다 — 그 탭으로 쓸 때 자리표시 위에 막대째 들어오게 */
  const barEl = chromeNow()[0];
  let bar: Shot['bar'];
  if (barEl) {
    const b = barEl.getBoundingClientRect();
    const copy = barEl.cloneNode(true) as HTMLElement;
    copy.removeAttribute('data-mobile-topbar');
    /* 모양(여백 · 줄 맞춤)은 그대로, 자리만 띠 안에 — 화면에 붙은(fixed) 막대를 띠 안의 자리로 */
    copy.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transform:none;view-transition-name:none';
    copy.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    bar = { node: copy, left: b.left, top: b.top, width: b.width, height: b.height };
  }
  return {
    node,
    left: r.left,
    width: r.width,
    top: r.top + window.scrollY,
    vw: window.innerWidth,
    bar,
  };
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
    /* 손 떼기 직전의 빠르기(px/ms) — 바로 앞 움직임 자리 · 때로 잰다 */
    vx: number;
    px: number;
    pt: number;
  } | null>(null);
  const target = useRef<string | null>(null);
  const waitTimer = useRef(0);
  const giveUp = useRef(0);
  /* 새 화면이 이어 들어오는 움직임이 끝난 뒤 정리 */
  const mainTimer = useRef(0);
  /* 넘어가는 쪽(1 = 다음 탭, −1 = 앞 탭) — 새 화면을 어디서 이어 들어오게 할지 */
  const slideDir = useRef<1 | -1>(1);
  /* 손 뗀 뒤 미끄러짐이 끝나는 때(performance.now) — 미는 중에 새 화면이 오면 남은 시간만 이어 간다 */
  const slideEnd = useRef(0);
  /* 지금 본문과 같이 밀리는 위 막대 · 판(chromeNow) */
  const chrome = useRef<HTMLElement[]>([]);
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
  /* 쓸리는 화면(탭 첫 화면)에서만 손가락을 듣는다 — 막는 듣기(touchmove)를 다른 화면의 스크롤에 걸지 않게 */
  const swipeable = order.some((h) => base(h) === pathname);
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
    let t = window.setTimeout(take, SHOT_AFTER_MS);
    /* 화면을 돌리거나 창 크기가 바뀌면 다시 뜬다 — 지금 폭의 사본이 있게 */
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(take, SHOT_AFTER_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
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
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    /*
     * 손을 떼자마자 새 화면을 부르므로(onEnd) 새 화면이 아직 미끄러지는 중에 올 수 있다 — 그때는 본문(이제 새 화면)을 자리표시가
     * 있던 자리에 옮겨 놓고 거기서 남은 거리만 이어 들어오게 한다. 자리표시는 본문과 같은 거리만큼 밀려 있으니(setX) 그 자리 =
     * 방향 × 폭 + 지금 밀린 거리. 다 밀린 뒤에 왔으면 0 — 예전처럼 제자리에서 자리표시만 옅어진다.
     */
    const now = getComputedStyle(main).transform;
    const cur = !now || now === 'none' ? 0 : new DOMMatrixReadOnly(now).m41;
    const from = zoom ? 0 : slideDir.current * window.innerWidth + cur;
    const sliding = Math.abs(from) > 1;
    main.style.transition = 'none';
    main.style.transform = sliding ? `translateX(${from}px)` : '';
    /*
     * 위 막대 · 판 — 떠나는 화면의 것(같이 밀려 나갔다)은 제자리로, 새 화면의 것(홈이면 막대가 생기고 판이 늘어난다)은 본문과 같은 자리에서
     * 같이 이어 들어온다. 판의 높이 바뀜(0.28초)은 끄고 곧바로 — 자리표시가 같은 막대를 이미 보였다.
     */
    const left = chrome.current;
    const next = zoom ? [] : chromeNow();
    chrome.current = next;
    for (const el of left) {
      el.style.transition = 'none';
      el.style.transform = '';
    }
    for (const el of next) {
      el.style.transition = 'none';
      el.style.transform = sliding ? `translateX(${from}px)` : '';
    }
    void main.offsetWidth;
    for (const el of left) el.style.transition = '';
    window.clearTimeout(mainTimer.current);
    if (sliding) {
      /* 남은 시간 동안 — 자리표시가 가던 대로 끝나게(손 뗄 때 정한 끝 시각까지), 짧아도 0.1초 */
      const ms = Math.round(Math.min(320, Math.max(100, slideEnd.current - performance.now())));
      const t = `transform ${ms}ms cubic-bezier(0.25, 0.6, 0.35, 1)`;
      main.style.transition = t;
      main.style.transform = '';
      for (const el of next) {
        el.style.transition = t;
        el.style.transform = '';
      }
      mainTimer.current = window.setTimeout(() => {
        main.style.transition = '';
        main.style.willChange = '';
        for (const el of next) el.style.transition = '';
      }, ms);
    } else {
      main.style.transition = '';
      main.style.willChange = '';
      for (const el of next) el.style.transition = '';
    }
    if (zoom) {
      queueMicrotask(() => setGhost(null));
      return;
    }
    window.scrollTo(0, 0);
    /* 미끄러지는 중이면 본문이 그 자리를 이어받았으니 자리표시는 바로 감춘다(두 겹이 비치지 않게) */
    if (sliding && ghostEl.current) ghostEl.current.style.visibility = 'hidden';
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
    if (!main || !swipeable) return;
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
      for (const el of chrome.current) el.style.transform = dx ? `translateX(${dx}px)` : '';
      const g = ghostEl.current;
      if (g) g.style.transform = `translateX(${dx}px)`;
    };
    /* 본문과 같이 밀리는 위 막대 · 판에도 같은 움직임 */
    const trans = (t: string) => {
      main.style.transition = t;
      for (const el of chrome.current) el.style.transition = t;
    };

    /*
     * 넘어가기 — 본문 · 자리표시를 끝까지 밀고(GPU) 새 화면도 곧바로 부른다(쓸기에서 손 뗄 때 · 하단 탭을 누를 때). 예전엔 다 밀린 뒤
     * (0.26초) 불러 그만큼 늦게 떴다(2026-10-15 "로딩이 느리다"). 미는 중에 새 화면이 오면 위 useLayoutEffect 가 자리표시 자리에서
     * 이어 들어오게 한다. 끝내 안 오면(신호 끊김 · 오류) 제자리로 — 본문이 화면 밖에 남아 빈 화면이던 것.
     */
    const slideAway = (href: string, dir: 1 | -1, go: { ms: number; ease: string }) => {
      target.current = href;
      window.clearTimeout(giveUp.current);
      giveUp.current = window.setTimeout(() => {
        if (target.current !== href) return;
        target.current = null;
        const ease = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
        trans(ease);
        if (ghostEl.current) ghostEl.current.style.transition = ease;
        setX(0);
        window.setTimeout(() => {
          trans('');
          main.style.willChange = '';
          setGhost(null);
        }, SETTLE_MS);
      }, GIVE_UP_MS);
      /* 하단 탭의 렌즈도 지금 그 칸으로 — 본문과 같이 미끄러진다 */
      window.dispatchEvent(new CustomEvent(TAB_CHOSEN_EVENT, { detail: href }));
      trans(go.ease);
      if (ghostEl.current) ghostEl.current.style.transition = go.ease;
      setX(-dir * window.innerWidth);
      slideDir.current = dir;
      slideEnd.current = performance.now() + go.ms;
      router.push(href, { transitionTypes: TAB_SWIPE_TYPES });
    };

    /* 하단 탭을 눌렀을 때(slideToTab) — 그 탭의 자리표시를 옆에 세우고 곧바로 넘어간다. 떨어진 탭(홈 → 영양)도 한 칸처럼 */
    slideHandler = (href) => {
      if (target.current || drag.current?.on || html.dataset.ptr) return false;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      const i = indexOf(latest.current.pathname);
      const j = latest.current.order.findIndex((h) => base(h) === base(href));
      if (i < 0 || j < 0 || i === j) return false;
      const item = latest.current.tabs.find((t) => base(t.href) === base(href));
      if (!item) return false;
      const dir: 1 | -1 = j > i ? 1 : -1;
      /* NavMotion 이 링크를 보고 단 화면 전환 표시는 걷는다 — 이 길은 화면 전환 없이 본문을 직접 민다 */
      html.removeAttribute('data-nav');
      drag.current = null;
      window.clearTimeout(settleTimer.current);
      window.clearTimeout(mainTimer.current);
      chrome.current = chromeNow();
      xRef.current = 0;
      flushSync(() => setGhost({ dir, item, camera: false }));
      const g = ghostEl.current;
      if (g) {
        g.style.transition = 'none';
        g.style.transform = '';
        g.style.visibility = '';
        g.removeAttribute('data-done');
      }
      trans('none');
      main.style.transform = '';
      main.style.willChange = 'transform';
      /* 지금 자리를 칠한 뒤 미끄러지기 시작하게 */
      void main.offsetWidth;
      slideAway(href, dir, {
        ms: TAP_MS,
        ease: `transform ${TAP_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      });
      return true;
    };

    /* 지금 끄는 손가락 — 끌기를 시작한 그 손가락만 본다 */
    const touchOf = (e: TouchEvent, id: number) => {
      for (let k = 0; k < e.changedTouches.length; k++)
        if (e.changedTouches[k].identifier === id) return e.changedTouches[k];
      return null;
    };

    /*
     * 손가락은 터치 이벤트로 받는다(2026-10-15 사용자 "앱에서 스와이프 인식이 거의 안 되고 전혀 부드럽지 않다").
     * 예전엔 포인터 이벤트(passive)로 받았는데, 아이폰 웹뷰는 손가락이 조금이라도 위아래로 움직이면 세로 스크롤을 시작하며
     * pointercancel 을 보내 쓸기를 빼앗았다 — 본문이 따라오다 제자리로 튕기고, 동시에 화면이 비스듬히 굴렀다. 이제 옆으로 정해진
     * 순간부터 touchmove 를 막아(preventDefault — 그래서 이 듣기 하나만 passive 가 아니다) 아이폰이 스크롤을 시작하지 못한다.
     * 정하기 전에도 옆으로 기운 움직임은 미리 막는다 — 스크롤이 먼저 시작되면 그 뒤로는 막을 수 없다.
     */
    const onDown = (e: TouchEvent) => {
      /*
       * 묵은 끌기 — 손가락 뗌(touchend · touchcancel)을 놓치면 끄는 중 상태가 남아 그 뒤 쓸기가 계속 안 먹었다. 새 손가락이
       * 닿았는데 아직 쓸기로 정해지지 않았거나 3초 넘게 지난 끌기는 끝난 것으로 본다.
       */
      const old = drag.current;
      if (old && (!old.on || e.timeStamp - old.t > 3000)) {
        drag.current = null;
        if (old.on) {
          trans('');
          main.style.willChange = '';
          setX(0);
          setGhost(null);
        }
      }
      /* 두 손가락(확대)은 쓸기가 아니다 */
      if (e.touches.length !== 1) return;
      if (target.current || drag.current) return;
      if (window.matchMedia(DESK_MEDIA).matches) return;
      const i = indexOf(latest.current.pathname);
      if (i < 0) return;
      const p = e.touches[0];
      /* 왼쪽 끝은 아이폰(앱 웹뷰 포함)의 '뒤로' 제스처 자리 */
      if (p.clientX < 16) return;
      /* 당겨서 새로고침이 걸려 있으면(components/pull-to-refresh.tsx) */
      if (document.documentElement.dataset.ptr) return;
      /* 탭의 첫 화면에서만 — 트레이닝 하위 화면(메커니즘 · 암케어, '‹ 뒤로'가 있음)도 주소는 /training 이라 걸렸다 */
      if (barSnapshot().back) return;
      if (!(e.target instanceof Element) || !main.contains(e.target)) return;
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
        /* 끄는 도중 두 번째 손가락 — 확대로 본다 */
        if (e.touches.length > 1) {
          drag.current = null;
          return;
        }
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const yields = d.claim === (dx < 0 ? 'left' : 'right');
        if (ax < SLOP && ay < SLOP) {
          /* 아직 모름 — 옆으로 기운 움직임이면 아이폰이 세로 스크롤을 먼저 시작하지 않게 막아 둔다 */
          if (ax > ay && !yields && e.cancelable) e.preventDefault();
          return;
        }
        if (ax < ay * LOCK_RATIO || yields) {
          drag.current = null;
          return;
        }
        d.on = true;
        chrome.current = chromeNow();
        window.clearTimeout(settleTimer.current);
        window.clearTimeout(mainTimer.current);
        trans('none');
        main.style.willChange = 'transform';
        if (ghostEl.current) {
          ghostEl.current.style.transition = 'none';
          /* 걷히던 중이면(DOM 에 바로 단 옅어짐 · 감춤) 다시 보이게 */
          ghostEl.current.removeAttribute('data-done');
          ghostEl.current.style.visibility = '';
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
      /* 쓸기로 정해졌으니 세로 스크롤은 막는다 — 본문이 옆으로만 움직인다 */
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - d.pt;
      if (dt > 0) d.vx = 0.7 * ((p.clientX - d.px) / dt) + 0.3 * d.vx;
      d.px = p.clientX;
      d.pt = e.timeStamp;
      const mdx = p.clientX - d.x;
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
    const onEnd = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!touchOf(e, d.id)) return;
      drag.current = null;
      if (!d.on) return;
      const i = indexOf(latest.current.pathname);
      const n = d.dir === 0 ? null : neighbor(i, d.dir);
      /*
       * 튕김 — 손 떼기 직전의 빠르기로 본다(예전엔 처음부터 뗄 때까지의 평균이라, 천천히 끌다 휙 튕겨도 안 넘어갔다).
       * 넘어가는 쪽으로 빠르면 짧게 끌어도 넘어가고, 되돌리는 쪽으로 빠르면 많이 끌었어도 제자리로.
       */
      const v = e.timeStamp - d.pt < FLICK_FRESH_MS ? d.vx : 0;
      const toward = Math.sign(v) === Math.sign(d.dx) && Math.abs(v) > FLICK_SPEED;
      const back = Math.sign(v) === -Math.sign(d.dx) && Math.abs(v) > FLICK_SPEED;
      const far = !back && (Math.abs(d.dx) > d.w * SNAP_RATIO || toward);
      const ease = `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      const g = ghostEl.current;
      if (n && far && e.type !== 'touchcancel') {
        /* 넘어가는 쪽으로의 빠르기를 이어받아 끝까지 */
        const go = settleFor(d.w - Math.abs(d.dx), Math.sign(v) === Math.sign(d.dx) ? Math.abs(v) : 0);
        haptic('selection');
        const href = n.item.href;
        target.current = href;
        window.clearTimeout(giveUp.current);
        /* 끝내 안 오면(신호 끊김 · 오류) 제자리로 — 본문이 화면 밖에 남아 빈 화면이던 것 */
        giveUp.current = window.setTimeout(() => {
          if (target.current !== href) return;
          target.current = null;
          window.clearTimeout(waitTimer.current);
          if (html.dataset.nav === 'zoom') html.removeAttribute('data-nav');
          trans(ease);
          if (g) g.style.transition = ease;
          setX(0);
          window.setTimeout(() => {
            trans('');
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
            trans(ease);
            if (g) g.style.transition = ease;
            setX(-d.dir * d.w);
          }, WAIT_MS);
          window.setTimeout(() => {
            /* 구속 측정 화면(다른 틀)에는 전환을 끝내는 부품이 없어 표시를 직접 걷는다 */
            if (html.dataset.nav === 'zoom') html.removeAttribute('data-nav');
          }, 900);
          return;
        }
        slideAway(href, d.dir === 1 ? 1 : -1, go);
        return;
      }
      /* 제자리로 — 되돌리는 쪽으로의 빠르기를 이어받는다 */
      const home = settleFor(d.dx, Math.sign(v) === -Math.sign(d.dx) ? Math.abs(v) : 0);
      trans(home.ease);
      if (g) g.style.transition = home.ease;
      setX(0);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        trans('');
        main.style.willChange = '';
        setGhost(null);
      }, home.ms);
    };

    /* 본문(main)에만 단다 — 막는 듣기(touchmove)가 본문 밖(하단 탭 · 창)의 스크롤을 기다리게 하지 않게 */
    main.addEventListener('touchstart', onDown, { passive: true });
    main.addEventListener('touchmove', onMove, { passive: false });
    main.addEventListener('touchend', onEnd, { passive: true });
    main.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      main.removeEventListener('touchstart', onDown);
      main.removeEventListener('touchmove', onMove);
      main.removeEventListener('touchend', onEnd);
      main.removeEventListener('touchcancel', onEnd);
      main.style.transform = '';
      trans('');
      for (const el of chrome.current) el.style.transform = '';
      main.style.willChange = '';
      window.clearTimeout(giveUp.current);
      window.clearTimeout(waitTimer.current);
      window.clearTimeout(settleTimer.current);
      window.clearTimeout(mainTimer.current);
      slideHandler = null;
    };
  }, [router, swipeable]);

  if (!ghost) return null;
  const Icon = NAV_ICONS[ghost.item.icon];
  /* 자리표시는 옆에서 들어온다 — 본문과 같은 거리만큼 밀리며(setX), 넘어가면 새 화면이 그 자리에서 이어 들어온다 */
  const style: CSSProperties = { left: `${ghost.dir * 100}%` };
  const done = ghost.done ? '' : undefined;
  const shot = ghost.camera ? undefined : shotFor(base(ghost.item.href));
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
        {shot.bar && (
          /*
           * 그 탭의 위 막대(홈 — 로고 · 종)와 그 뒤 판 — 진짜 판(globals.css [data-top-veil])처럼 막대 자리까지 바탕색, 밑 3rem 동안 옅어진다.
           * 막대가 늦게 생겨 보이지 않게 자리표시와 같이 들어온다(2026-10-15 "위 제목 부분이 한 타이밍 늦다").
           */
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: shot.bar.top + shot.bar.height + 48,
              background:
                'linear-gradient(to bottom, var(--color-page) 0, var(--color-page) calc(100% - 3rem), color-mix(in oklab, var(--color-page) 0%, transparent) 100%)',
            }}
          >
            <div
              className="absolute"
              style={{
                left: shot.bar.left,
                top: shot.bar.top,
                width: shot.bar.width,
                height: shot.bar.height,
              }}
              ref={(el) => {
                const bar = shot.bar;
                if (el && bar && el.firstChild !== bar.node) el.replaceChildren(bar.node);
              }}
            />
          </div>
        )}
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
        className="pointer-events-none fixed inset-y-0 z-30 grid w-screen place-items-center bg-black text-white desk:hidden pad:pl-(--rail)"
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
      /* 패드는 왼쪽 탭 막대(--rail)만큼 비키고 본문과 같은 폭 · 여백 안에 — 예전엔 화면 왼쪽 끝부터 그려 제목이 막대 밑에
         가려졌다가, 새 화면(막대 오른쪽)이 오면 자리가 툭 바뀌었다(2026-10-15 '아이패드에서 잔상') */
      className="pointer-events-none fixed inset-y-0 z-30 w-screen bg-page pt-[calc(env(safe-area-inset-top)+3.5rem+1.5rem)] desk:hidden pad:pl-(--rail)"
      style={style}
    >
      <div className="mx-auto w-full max-w-5xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] xl:max-w-6xl">
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
    </div>
  );
}
