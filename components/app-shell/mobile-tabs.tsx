'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import Link from 'next/link';
import { TAB_CHOSEN_EVENT, useTabLens } from '@/components/tab-lens';
import { currentUrl, sameScreen, setNavDirection } from '@/lib/nav-state';
import { RoundBack } from '@/components/round-icon';
import { NAV_ICONS } from '@/components/nav-icons';
import { MorphLink } from '@/components/shell-morph';
import { slideToTab } from '@/components/tab-pager';
import { scrollToTop } from '@/lib/scroller';
import { usePathname, useRouter } from 'next/navigation';
import type { NavItem } from '@/lib/nav';
import { MORE_HREF } from '@/lib/nav';
import { haptic } from '@/lib/haptics';
import type { NavDirection } from '@/lib/nav-state';
import { useIsActive } from './shared';
import { Squares, NavGlyph } from './glyphs';

/* 앱 틀의 휴대폰 하단 탭(아이패드는 왼쪽 막대) — 렌즈 · 길게 눌러 끌기. 2026-10-16 에 app-shell.tsx 에서 옮겼다(내용 그대로). */

/**
 * 하단 탭의 얼굴 — 아이콘 위, 이름 아래.
 *
 * 누르면 렌즈(유리 캡슐, components/tab-lens.ts)가 곧바로 이 칸으로 미끄러져 와 누른 곳이 먼저 대답한다. 이름도 그 순간
 * 굵어진다 — 렌즈가 설 칸(selected)을 따르고 화면(주소)을 기다리지 않는다. 예전에는 링크의 pending(useLinkStatus)을 봤는데,
 * 탭을 누르면 본문을 밀며 링크 대신 직접 push 해서(tab-pager.tsx slideToTab) pending 이 안 켜져 이름이 0.3초 뒤에야 굵어졌다
 * (2026-10-15 사용자 "선택되고 0.3초 뒤에 아이콘이 좀 움직여"). 2026-10-14 사용자가 고른 참고 영상(iOS 26 탭 막대)은 색 없이
 * 흰 아이콘 · 흰 글자에 캡슐만 움직인다.
 * pt-[2px] — 이름 글자의 아래 여백(줄 높이) 때문에 아이콘 + 이름이 렌즈 가운데보다 0.7px 위에 보였다. 화면은 1px 단위로
 * 그려져 1.5px 는 효과가 없었다 — 픽셀로 재 보니 2px 에서 위아래 차가 0.3px 안(패드는 0).
 */
function TabFace({
  Icon,
  selected,
  label,
  locked = false,
}: {
  Icon: (typeof NAV_ICONS)[keyof typeof NAV_ICONS];
  /** 렌즈가 선 칸 — 누른 순간부터(화면이 오기 전에도) */
  selected: boolean;
  label: string;
  /** 잠긴 탭 — 아이콘 귀퉁이에 자물쇠. 흐림은 탭(링크)이 통째로 맡는다(이 탭은 날아가는 연출이 없다) */
  locked?: boolean;
}) {
  return (
    <span
      data-tab-face
      className={`relative flex flex-col items-center gap-0.5 pt-[2px] ${
        selected ? 'font-semibold' : ''
      }`}
    >
      <NavGlyph Icon={Icon} locked={locked} dim={false} filled={selected} className="h-[26px] w-[26px]" />
      {label}
    </span>
  );
}

/** 누른 탭으로 옮긴 렌즈가 화면이 끝내 안 바뀌면(신호 끊김 · 막힘) 이만큼 뒤 지금 화면의 탭으로 돌아간다 */
const CHOSEN_TIMEOUT_MS = 8000;

/**
 * 모바일 하단 탭바 — 바닥에서 살짝 떠 있는 둥근 알약.
 *
 * 2026-10-01 사용자 "애플 앱스토어의 하단 바처럼 전체적으로 동글동글하게" — 양옆 20px · 밑으로 --tab-bar-gap(globals.css)
 * 떨어져 뜬 알약. 칸 높이 52px, 아이콘 26px, 이름 10px, 알약 62px. 알약 윗변까지의 높이(--tab-bar-top)를 본문 끝 여백과
 * 그 위에 띄우는 것들이 같이 쓴다.
 *
 * 2026-10-14 사용자가 참고 영상(iOS 26 탭 막대)을 주며 "그와 최대한 같게": 휴대폰은 어두운 유리 알약(반투명 짙은 회색 +
 * 뒤 흐림 + 얇은 흰 테두리)에 흰 아이콘 · 흰 이름, 지금 탭 뒤에는 회색 캡슐 하나(렌즈)가 있고 탭을 옮기면 그 캡슐이
 * 유리 렌즈로 부풀며 탄성 있게 미끄러진다(components/tab-lens.ts). 예전에는 탭마다 배경을 두고 화면 전환
 * (view-transition 'tab-indicator')이 옮겼다 — 누른 뒤 서버가 답할 때까지 안 움직였고 탄성도 없었다.
 * 패드의 왼쪽 세로 막대는 밝은 모양 그대로 두고(요청은 하단 바) 렌즈 움직임만 같다.
 */
export function MobileTabs({
  tabs,
  back = null,
  menuOpen,
  onMenu,
  activeOverride,
}: {
  tabs: NavItem[];
  /** 덕아웃으로 돌아가는 원형 뒤로가기(웹만, 2026-10-21) — 알약 왼쪽에 따로. 누르면 변형하며 덕아웃으로(components/shell-morph.tsx) */
  back?: { href: string; label: string } | null;
  /** 사이드바가 열려 있는가 — 렌즈를 '더보기'에 둔다 */
  menuOpen: boolean;
  onMenu: () => void;
  /**
   * 종목 하단바(lib/nav.ts SPORT_BARS, 2026-10-20) — 같은 /training 이 칸 셋(트레이닝 · 암케어 · 메커니즘)으로 갈라져 경로만 보는
   * useIsActive 로는 못 고른다. 주면 이 칸 하나만 켜진다(lib/nav.ts sportActiveHref).
   */
  activeOverride?: string | null;
}) {
  const pathActive = useIsActive();
  const isActive =
    activeOverride === undefined
      ? pathActive
      : (href: string) => href === activeOverride;
  const pathname = usePathname();
  const [spinning, setSpinning] = useState(false);
  const router = useRouter();
  const bar = useRef<HTMLDivElement>(null);
  const lensEl = useRef<HTMLSpanElement>(null);

  /*
   * 렌즈가 설 칸 — 사이드바가 열렸으면 '더보기', 방금 누른 탭이 있으면 그 탭(화면이 오기 전에 먼저 옮긴다), 아니면 지금
   * 화면의 탭. 주소가 바뀌면 누른 탭 기억을 지운다 — 그때부터는 지금 화면이 정한다(뒤로 가기 · 잠긴 탭이 설정 화면으로
   * 보낸 경우도 지금 화면과 맞는다). 화면이 끝내 안 오면 CHOSEN_TIMEOUT_MS 뒤 지금 화면의 탭으로 돌아간다.
   */
  const activeHref =
    tabs.find((t) => t.href !== MORE_HREF && isActive(t.href))?.href ?? null;
  const [chosen, setChosen] = useState<{ href: string; from: string } | null>(null);
  const liveChosen = chosen && chosen.from === pathname ? chosen.href : null;
  const selectedHref = menuOpen ? MORE_HREF : (liveChosen ?? activeHref);
  const selectedIndex = selectedHref
    ? tabs.findIndex((t) => t.href === selectedHref)
    : -1;
  /*
   * 탭을 옮기면 본문이 그 방향으로 밀린다 — 오른쪽 탭이면 새 화면이 오른쪽에서, 왼쪽 탭이면 왼쪽에서(쓸기와 같은 몸짓,
   * globals.css 'swipe-next · swipe-prev'). 2026-10-15 사용자 "전환 애니메이션이 필요 — 너무 딱딱해": 예전엔 0.1초 옅어지기뿐이었다.
   * 지금 탭을 모르면(하위 화면이 아닌 다른 곳) 예전처럼 옅어지기.
   */
  const activeIndex = activeHref ? tabs.findIndex((t) => t.href === activeHref) : -1;
  /* 판 넘기기(components/tab-pager.tsx)가 못 받는 곳(하위 화면)에서 탭을 누르면 — 옆으로 나란한 곳이라 옅어지며 바뀐다 */
  const slideTo = (i: number): NavDirection | undefined =>
    activeIndex < 0 || i === activeIndex ? undefined : 'fade';
  useEffect(() => {
    if (!chosen) return;
    const timer = window.setTimeout(() => setChosen(null), CHOSEN_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [chosen]);
  /* 본문 쓸기(components/tab-pager.tsx)로 탭을 옮길 때도 누른 탭처럼 — 렌즈가 곧바로 그 칸으로 */
  useEffect(() => {
    const onChosen = (e: Event) => {
      const href = (e as CustomEvent<unknown>).detail;
      if (typeof href === 'string') setChosen({ href, from: pathname });
    };
    window.addEventListener(TAB_CHOSEN_EVENT, onChosen);
    return () => window.removeEventListener(TAB_CHOSEN_EVENT, onChosen);
  }, [pathname]);

  /* 첫 그림의 렌즈 자리 — 서버가 그린 HTML 에 그대로 실린다(이후로는 tab-lens.ts 가 CSS 변수를 직접 쓴다) */
  const [firstIndex] = useState(selectedIndex);
  const lens = useTabLens(bar, lensEl, firstIndex);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) lens.to(selectedIndex);
  }, [lens, selectedIndex]);

  /*
   * 길게 눌러 끌기(2026-10-13 사용자: "메뉴 바도 길게 눌러서 스와이프하면 동그란 원이 터치된 부분을 따라서 움직이게").
   * 알약 안에서 손가락을 떼지 않고 0.28초 넘게 누르면 렌즈가 부푼 채 손가락을 따라오고, 놓은 자리의 탭으로 간다.
   * 짧게 누르면 예전처럼 그 칸으로.
   */
  const hold = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const dragged = useRef(false);
  const under = useRef<string | null>(null);
  /** 칸 가운데들 — 끌기를 시작할 때 한 번 잰다(손가락 자리 → 칸 번호) */
  const centers = useRef<{ href: string; c: number }[]>([]);
  const vertical = () => {
    const el = bar.current;
    return !!el && el.clientHeight > el.clientWidth;
  };
  const measure = () => {
    const el = bar.current;
    if (!el) return;
    const v = vertical();
    centers.current = Array.from(
      el.querySelectorAll<HTMLElement>('[data-tab-href]')
    ).map((node) => {
      const r = node.getBoundingClientRect();
      return {
        href: node.dataset.tabHref ?? '',
        c: v ? r.top + r.height / 2 : r.left + r.width / 2,
      };
    });
  };
  /** 손가락 자리 → 칸 번호(소수, 첫 칸 0 ~ 끝 칸) */
  const indexAt = (x: number, y: number) => {
    const cs = centers.current;
    if (cs.length < 2) return 0;
    const at = vertical() ? y : x;
    const p = (at - cs[0].c) / ((cs[cs.length - 1].c - cs[0].c) / (cs.length - 1));
    return Math.max(0, Math.min(cs.length - 1, p));
  };
  const startHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    lens.press(true);
    if (e.pointerType === 'mouse') return;
    stopHold();
    const { pointerId: id, clientX: x, clientY: y } = e;
    const target = e.currentTarget;
    const timer = window.setTimeout(() => {
      measure();
      if (centers.current.length === 0) return;
      dragged.current = true;
      dragging.current = true;
      try {
        target.setPointerCapture(id);
      } catch {
        /* 이미 뗀 포인터면 붙들 수 없다 — 그래도 끌기는 시작한다 */
      }
      haptic('medium');
      const p = indexAt(x, y);
      under.current = centers.current[Math.round(p)]?.href ?? null;
      lens.follow(p);
    }, 280);
    hold.current = { id, x, y, timer };
  };
  const stopHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };
  const moveHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = hold.current;
    if (!h || h.id !== e.pointerId) return;
    if (!dragged.current) {
      /* 길게 누르기 전에 8px 넘게 움직였으면 끌기가 아니라 화면 굴리기 · 짧은 누름이다 */
      if (Math.abs(e.clientX - h.x) > 8 || Math.abs(e.clientY - h.y) > 8) {
        stopHold();
        lens.press(false);
      }
      return;
    }
    const p = indexAt(e.clientX, e.clientY);
    const href = centers.current[Math.round(p)]?.href ?? null;
    if (href && href !== under.current) haptic('selection');
    under.current = href;
    lens.follow(p);
  };
  const endHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    lens.press(false);
    const h = hold.current;
    if (!h || h.id !== e.pointerId) return;
    stopHold();
    if (!dragged.current) return;
    const cancelled = e.type === 'pointercancel';
    const href = cancelled
      ? null
      : centers.current[Math.round(indexAt(e.clientX, e.clientY))]?.href;
    dragging.current = false;
    /* click 이 뒤따라 오면 막는다(아래 onClickCapture) — 다음 그림에서 푼다 */
    window.setTimeout(() => {
      dragged.current = false;
    }, 0);
    const tab = href ? tabs.find((t) => t.href === href) : undefined;
    if (!tab) {
      lens.release(selectedIndex);
      return;
    }
    if (tab.href === MORE_HREF) {
      lens.release(tabs.indexOf(tab));
      setSpinning(true);
      onMenu();
      return;
    }
    if (isActive(tab.href)) {
      lens.release(selectedIndex);
      return;
    }
    lens.release(tabs.indexOf(tab));
    setChosen({ href: tab.href, from: pathname });
    haptic('light');
    if (slideToTab(tab.href)) return;
    const dir = slideTo(tabs.indexOf(tab));
    if (dir) setNavDirection(dir);
    router.push(tab.href);
  };

  return (
    <nav
      /* 본문이 바뀌는 동안 탭바는 움직이지 않는다. */
      style={{ viewTransitionName: 'shell-tabbar' }}
      data-mobile-tabs
      /*
       * 패드(아이패드 · 큰 태블릿 — globals.css 의 pad)에서는 같은 탭이 왼쪽 세로 막대가 된다(2026-10-12 사용자 "아이패드
       * 전용 인터페이스"). 넓은 화면 바닥 한가운데의 알약은 엄지가 멀고, 아이패드 앱은 탭을 왼쪽 막대에 둔다. 폭(--rail)은
       * 본문 · 위 막대가 같이 비킨다(app/(app)/layout.tsx). 칸은 64px — 손가락으로 넉넉하다.
       */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-(--tab-bar-gap) pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] desk:hidden pad:top-0 pad:right-auto pad:w-(--rail) pad:p-0"
    >
      {/*
        알약만 누를 수 있다 — 양옆 빈 곳을 누르면 밑의 본문으로 간다. 양옆 여백(nav)은 노치 자리와 견줘 큰 쪽 — 가로로 돌린
        사파리에서 알약 끝이 노치 밑에 들어갔다(2026-10-03).
        휴대폰은 어두운 유리(2026-10-14 참고 영상) — 짙은 회색 72% + 뒤 흐림 · 채도, 얇은 흰 테두리, 위 1px 빛, 밑 그림자.
        글자 · 아이콘은 흰색(currentColor). 패드 막대는 예전의 밝은 유리 그대로.
      */}
      <div className="mx-auto flex max-w-md items-center gap-2 pad:contents">
        {back && (
          <MorphLink
            href={back.href}
            dir="to-dugout"
            aria-label={`${back.label}으로`}
            title={back.label}
            data-tab-bar
            data-morph-side
            className="pointer-events-auto grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full text-(--tab-fg) transition-transform duration-100 motion-safe:active:scale-[0.94] pad:hidden"
          >
            <RoundBack className="h-6 w-6" />
          </MorphLink>
        )}
        <div
          ref={bar}
          data-tabbar
          onPointerDown={startHold}
          onPointerMove={moveHold}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={() => {
            if (!dragged.current) lens.press(false);
          }}
          onClickCapture={(e) => {
            if (dragged.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onContextMenu={(e) => {
            /* 길게 누르면 iOS 가 링크 미리보기 · 복사 메뉴를 띄운다 — 끌기와 겹치니 막는다 */
            if (hold.current || dragging.current) e.preventDefault();
          }}
          style={{ '--tab-count': tabs.length } as CSSProperties}
          data-tab-bar
          data-morph-chrome
          /* 누름 표시는 렌즈 · 살짝 작아짐으로 충분하다 — 공용 옅어짐(press-feedback)까지 겹쳐 세 겹이었다(2026-10-16) */
          data-press-none
          /* 가로 알약의 유리(바탕 · 테두리 · 빛 · 그림자)는 globals.css '하단 탭의 유리 알약' — 가만히 있을 때도 유리로 보이게 */
          className="pointer-events-auto relative flex min-w-0 flex-1 touch-none rounded-full p-1 text-(--tab-fg) pad:h-full pad:max-w-none pad:flex-col pad:gap-1 pad:rounded-none pad:pt-[calc(env(safe-area-inset-top)+0.75rem)] pad:pr-2 pad:pl-[calc(env(safe-area-inset-left)+0.5rem)] pad:text-ink"
        >
          {/*
          렌즈 — 지금 탭 뒤의 캡슐 하나(components/tab-lens.ts 가 옮긴다, 모양은 globals.css '하단 탭의 유리 렌즈').
          --p 는 칸 번호 — 칸 폭이 같아 CSS 만으로 자리를 셈하므로 서버가 그린 첫 그림부터 맞는 자리에 있다.
          장식이라 읽어 주지 않는다(지금 탭은 글자 굵기 · aria-current 가 알린다).
        */}
          <span
            ref={lensEl}
            aria-hidden
            data-tab-lens
            style={
              {
                '--p': Math.max(0, firstIndex),
                '--show': firstIndex >= 0 ? 1 : 0,
              } as CSSProperties
            }
          >
            <span data-lens-fill />
            <span data-lens-glass />
            <span data-lens-rim />
          </span>
          {tabs.map((tab) => {
            /*
             * '더보기'는 화면으로 넘어가지 않고 옆에서 사이드바를 연다.
             *
             * 예전에는 /more 라는 화면 하나로 넘어갔다. 그러면 넓은 화면에서는
             * 옆에서 미끄러져 나오던 같은 메뉴가 좁은 화면에서만 화면 전환이 되어,
             * 창 폭 하나로 메뉴가 전혀 다르게 열렸다. 이제 폭과 상관없이 같은
             * 사이드바가 같은 몸짓(네모가 돌며 오른쪽에서 밀려 들어옴)으로 열린다.
             * 열려 있는 동안 렌즈가 이 칸에 선다.
             */
            if (tab.href === MORE_HREF) {
              return (
                <button
                  key={tab.href}
                  type="button"
                  data-tab-href={tab.href}
                  onClick={() => {
                    lens.to(tabs.indexOf(tab));
                    setSpinning(true);
                    onMenu();
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                  className="relative z-10 flex h-[52px] flex-1 flex-col items-center justify-center rounded-full text-[10px] font-medium transition-transform duration-100 motion-safe:active:scale-[0.94] pad:h-16 pad:flex-none pad:rounded-2xl pad:text-xs"
                >
                  <span
                    data-tab-face
                    className={`flex flex-col items-center gap-0.5 pt-[2px] ${menuOpen ? 'font-semibold' : ''}`}
                  >
                    <span className="flex h-[26px] w-[26px] items-center justify-center">
                      <Squares
                        spinning={spinning}
                        onDone={() => setSpinning(false)}
                        size="lg"
                      />
                    </span>
                    {tab.short ?? tab.label}
                  </span>
                </button>
              );
            }

            const active = isActive(tab.href);
            const Icon = NAV_ICONS[tab.icon];
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-tab-href={tab.href}
                draggable={false}
                data-nav={slideTo(tabs.indexOf(tab))}
                aria-current={active ? 'page' : undefined}
                /* 잠긴 탭(첫 설정 전, lib/nav.ts applyLocks)은 흐리게 + 아이콘 오른쪽 아래 자물쇠. 링크는 산다 — 누르면 설정 화면 */
                aria-label={tab.locked ? `${tab.label}(설정 전)` : undefined}
                data-locked={tab.locked ? '' : undefined}
                /*
                 * 누르면 렌즈가 곧바로 이 칸으로 간다(화면이 오기 전에). 지금 탭을 한 번 더 누르면 — 그 탭의 첫 화면이면
                 * 맨 위로 올라가고, 하위 화면이면 첫 화면으로 간다(아이폰 탭 바처럼, 2026-10-04).
                 */
                onClick={(e) => {
                  if (!active || !sameScreen(currentUrl(), tab.href)) {
                    if (!active) {
                      /* 아이폰 탭 막대처럼 고를 때 가장 가벼운 톡(2026-10-16 — 짧게 누르면 떨림이 없었다, 길게 끌기만 떨렸다) */
                      haptic('selection');
                      /* 렌즈는 화면을 다시 그리기 전에 곧바로 — effect 를 기다리면 한두 장면 늦게 출발했다 */
                      lens.to(tabs.indexOf(tab));
                      setChosen({ href: tab.href, from: pathname });
                      /* 탭 첫 화면이면 쓸기처럼 누르는 순간 본문이 밀리기 시작한다(components/tab-pager.tsx slideToTab) — 링크는 안 따른다 */
                      if (slideToTab(tab.href)) e.preventDefault();
                    }
                    return;
                  }
                  e.preventDefault();
                  const reduce = window.matchMedia(
                    '(prefers-reduced-motion: reduce)'
                  ).matches;
                  scrollToTop(!reduce);
                }}
                /*
                 * 휴대폰에서 가장 많이 눌리는 자리다. 눌렀을 때 살짝 작아져 먼저 대답한다(렌즈도 부푼다).
                 * 움직임을 줄여 쓰는 사람에게는 크기 변화가 없다.
                 */
                className={`relative z-10 flex h-[52px] flex-1 flex-col items-center justify-center rounded-full text-[10px] font-medium transition-transform duration-100 motion-safe:active:scale-[0.94] pad:h-16 pad:flex-none pad:rounded-2xl pad:text-xs ${
                  tab.locked ? 'opacity-55' : ''
                }`}
              >
                <TabFace
                  Icon={Icon}
                  selected={tab.href === selectedHref}
                  label={tab.short ?? tab.label}
                  locked={tab.locked}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
