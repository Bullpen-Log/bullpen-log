'use client';

import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { ChevronLeft } from '@/components/icon';
import { goBack } from '@/components/back-link';
import { barSnapshot, serverBarSnapshot, subscribeBar } from '@/lib/nav-state';
import { onAnyScroll, scrollTopNow } from '@/lib/scroller';
import { usePathname, useRouter } from 'next/navigation';
import { Wordmark } from '@/components/logo';

/* 앱 틀의 휴대폰 위 막대 — 숨기기 · 뒤로 · 가운데 제목. 2026-10-16 에 app-shell.tsx 에서 옮겼다(내용 그대로). */

/**
 * 모바일 상단 바 — 로고와, 알림(종)·설정·내 정보.
 *
 * 휴대폰 틀(desk 가 아닌 화면 — 손가락으로 쓰는 1024px 밑이거나, 576px 밑)에는
 * 오른쪽 위 아이콘 줄이 없다. 그렇다고 설정과 내 정보를 갈 곳
 * 없이 두면 안 되므로, PC 의 그 버튼들을 여기로 옮겨 놓는다. 누르면 같은
 * 창이 뜬다 — 기기가 달라도 하는 일과 보이는 것이 같아야 한다.
 */
export function MobileTopBar({
  headerRef,
  bell,
  panel,
}: {
  /** 알림 창의 '바깥'을 가릴 때 쓴다 — 종과 창이 모두 이 막대 안에 있다 */
  headerRef: RefObject<HTMLElement | null>;
  /** 알림(종) 단추 */
  bell: React.ReactNode;
  /** 알림 창. 닫혀 있으면 null */
  panel: React.ReactNode;
}) {
  const router = useRouter();
  /*
   * 이 화면의 제목 · '‹ 뒤로' — 화면의 큰 제목(PageHeading → components/nav-title.tsx)과 '‹ 뒤로'(components/back-link.tsx)가
   * 적어 둔 것(lib/nav-state.ts). 큰 제목이 막대 밑으로 가려지면 가운데에 작은 제목이 나온다.
   */
  const bar = useSyncExternalStore(subscribeBar, barSnapshot, serverBarSnapshot);
  /* 홈은 앱 이름을 막대 왼쪽에 — 큰 제목 자리에 두면 날짜 위로 한 줄을 통째로 차지했다(2026-10-13 김민) */
  const pathname = usePathname();
  /*
   * 트레이닝 하위 화면의 '‹ 트레이닝'은 뺐다(2026-10-20) — 이제 투구 · 타격 종목 하단바의 ‹ 가 돌아가는 길이다(lib/nav.ts SPORT_BARS).
   * 트레이닝 홈(?view=home, 더보기 · PC 메뉴)에서 들어간 경우도 하단바가 종목 바로 바뀌어 같은 길로 돌아간다.
   */
  const back = bar.back;
  /* 투구 기록 팝업(/pitch-log/<날짜>) 동안은 팝업 전 화면의 막대 그대로 — 판(tab-pager)과 같은 규칙(그리는 도중 상태 보정, 2026-10-17) */
  const popup = pathname.startsWith('/pitch-log/');
  const [shownPath, setShownPath] = useState(pathname);
  if (!popup && shownPath !== pathname) setShownPath(pathname);
  const home = shownPath === '/today';
  /*
   * 기록 · 트레이닝 · 영양 탭 첫 화면은 막대를 안 그린다(같은 날 김민: "앱 이름 · 프로필 설정 줄은 홈에만") — 그 탭의 큰 제목이 맨 위.
   * 하위 화면('‹ 뒤로'가 있는 곳)은 그대로. 시계 자리 칠과 그만큼의 빈칸은 남긴다.
   */
  /*
   * 2026-10-15 저녁 4cce94dd 가 이것을 걷어 네 탭 모두에 막대(가운데 작은 제목 · 오른쪽 종)를 그렸는데, 김민: "트레이닝 · 영양 위에 가운데
   * 제목 · 오른쪽 알림이 떠 비율이 이상하다 — 싹 지우고 원래대로". 그래서 되살렸다. 탭마다 제목 높이는 판(tab-pager)의 위 여백으로 맞춘다
   * (globals.css [data-panel][data-bare]).
   */
  /* 구속 측정 관리자는 투구 탭의 한 보기(머리 · 고르개가 같다 — pitch-log-heading)라 투구처럼 막대 없이(2026-10-15 김민) */
  const bare =
    !back &&
    /* 넷째 탭 영양 → 커뮤니티(2026-10-20). 영양은 더보기의 여느 화면처럼 막대가 선다 */
    /* 셋째 탭 트레이닝 → 타격(2026-10-20). 트레이닝은 종목 바 안의 화면이라 투구 · 타격처럼 막대 없이 큰 제목부터 */
    ['/videos', '/hitting', '/community', '/training', '/admin/velocity'].includes(shownPath);
  /* 숨기기는 첫 화면들만 — '‹ 뒤로'가 있는 화면은 돌아갈 길을 늘 보인다. 알림 창이 열려 있으면 안 숨긴다 */
  const hidden = useBarHidden(!back && !bare && panel == null);
  /*
   * '‹ 뒤로'가 선 막대를 판 넘기기가 알게 — 탭 판 안의 하위 화면(트레이닝의 암케어 · 오늘 운동 · 메커니즘, 주소는 /training)은 판의 위 여백이
   * 막대 없는 탭 값이라 본문이 막대 밑으로 들어갔다(2026-10-15 김민 "상단바가 부자연스럽다", globals.css [data-panel]).
   */
  const hasBack = back != null;
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-bar-back', hasBack);
  }, [hasBack]);

  return (
    <>
      {/*
        시계 · 배터리 자리를 막대 색으로 채운다 — 높이는 env(safe-area-inset-top)이라 아이폰 앱에서만
        생긴다(사파리 세로 화면은 0). 예전에는 이 자리가 비어 스크롤하면 그 틈으로 내용이 지나가
        막대만 떠 있어 보였다(2026-09-30 사용자 "매우 부자연스럽다").
        data-safe-area — 이 틀이 시계 · 홈 막대 여백을 스스로 비운다는 표시(globals.css '아이폰 앱 안').
      */}
      {/*
        2026-10-14 2판(사용자 "인스타 홈처럼") — 시계 자리는 반투명 유리(바탕색 75% + 뒤 흐림). 막대가 숨어 본문이 시계 밑으로
        지나갈 때 그 부분이 자연스럽게 비쳐 흐려진다. 막대도 같은 유리라 둘이 한 면으로 보인다.
      */}
      {/*
        2026-10-15 3판(사용자: 예시 둘 — Claude · 인스타 앱 — "중간에 선이 그어져 있고 퀄리티가 떨어진다, 선 없애고 저렇게") —
        시계 자리와 막대 밑에 딱 끊기는 선(92% 판의 끝 · 막대의 밑줄)이 생겼었다. 이제 막(top-veil) 한 장이 시계 자리 + 막대(보일 때)를
        덮고, 그 밑 1.5rem 동안 흐림과 바탕색이 함께 옅어진다 — 본문이 위로 지나가며 흐려지고 선이 없다(globals.css 'top-veil').
        막대가 숨으면 막이 시계 자리까지 줄어든다. 막대 · 단추는 막 위(z-40)에 그대로 또렷하다.
        data-safe-area 는 높이를 재는 표시로만 남긴다(당겨서 새로고침 돌개 자리 · globals.css '아이폰 앱 안').
      */}
      <div
        aria-hidden
        data-top-veil
        data-short={bare || hidden ? '' : undefined}
        className="pointer-events-none fixed inset-x-0 top-0 z-39 desk:hidden pad:left-(--rail)"
      >
        {/* 흐림 한 겹 — 아래 끝에서 마스크로 옅어져 위로 갈수록 흐려진다(globals.css 'top-veil', 2026-10-16 세 겹 → 한 겹) */}
        <i />
      </div>
      <div
        data-safe-area
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[env(safe-area-inset-top)] desk:hidden pad:left-(--rail)"
      />
      {/* 막대는 화면에 붙어(fixed) 있으니 그만큼 비운다 — 시계 자리 + 막대. 판 넘기기(tabs)에서는 판이 스스로 비워 이건 숨는다 */}
      <div
        aria-hidden
        data-bar-spacer
        className={`shrink-0 desk:hidden ${bare ? 'h-[env(safe-area-inset-top)]' : 'h-[calc(env(safe-area-inset-top)+3.5rem)]'}`}
      />
      {!bare && (
        <header
          /*
           * 아이폰 앱의 내비게이션 막대(2026-10-04 '앱 틀을 네이티브처럼') — 왼쪽 '‹ 뒤로', 가운데 화면 제목(큰 제목이 가려졌을
           * 때만), 오른쪽 종 · 설정 · 내 정보. 늘 그 자리에 있다.
           *
           * 예전에는 왼쪽에 로고가 있는 웹사이트 머리였고, 스크롤을 내리면 막대가 통째로 위로 숨었다 — 화면 중간에서는 지금
           * 어느 화면인지, 어디로 돌아가는지가 보이지 않았다(점검: "가장 웹사이트 같은 곳"). 로고는 뺐다 — 홈은 아래 탭에 있다.
           *
           * 본문이 바뀌는 동안 막대는 움직이지 않는다(이름표 shell-topbar). 뒤 흐림(backdrop-blur)은 뺐다 — 바탕이 거의
           * 불투명이라 흐림은 안 보이는데, 아이폰 사파리는 그 위로 무언가 움직일 때마다 흐림을 다시 계산하다 깜빡인다.
           *
           * 양옆 여백은 노치 자리와 견줘 큰 쪽 — 가로로 돌린 사파리에서 단추가 노치 밑에 들어갔다(2026-10-03).
           */
          ref={headerRef}
          data-mobile-topbar
          data-hidden={hidden ? '' : undefined}
          style={{ viewTransitionName: 'shell-topbar' }}
          /*
           * 2026-10-14 2판 — 화면에 붙은(fixed) 반투명 유리 막대. 아래로 굴리면 위로 미끄러져 숨고(globals.css 의
           * [data-mobile-topbar][data-hidden]) 위로 굴리면 돌아온다 — 본문이 화면 전체를 쓴다.
           * (2026-10-15) 뒤 흐림은 다시 뺐다 — 바탕이 85~92% 라 흐림은 거의 안 보이는데 굴릴 때 장면마다 다시 셈했다(시계 자리도 같이).
           * 아이패드는 왼쪽 탭 막대(--rail)만큼 비킨다 — 막대 밑에 깔려 '‹ 뒤로'를 누르면 홈 탭이 눌렸다.
           */
          /* 바탕 · 밑줄 없이 — 뒤의 막(top-veil)이 흐림과 옅어짐을 맡는다(2026-10-15 3판) */
          className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 flex h-14 items-center gap-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pad:left-(--rail) desk:hidden"
        >
          <div className="flex min-w-0 flex-1 items-center">
            {back && (
              <button
                type="button"
                onClick={() => goBack(router, back.href)}
                className="inline-flex min-h-11 max-w-[34vw] items-center gap-0.5 text-base text-sky transition-opacity active:opacity-60"
              >
                <ChevronLeft aria-hidden className="h-6 w-6 shrink-0" />
                <span className="truncate">{back.label || '뒤로'}</span>
              </button>
            )}
          </div>

          {/* 홈은 로고가 가운데(2026-10-14 사용자 "인스타처럼 로고를 가운데로"). 그 밖은 큰 제목이 막대 밑으로 가려졌을 때만 작은 제목 */}
          {!back && home ? (
            <Wordmark className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-ink" />
          ) : (
            <p
              aria-hidden
              className={`pointer-events-none absolute top-1/2 left-1/2 max-w-[44%] -translate-x-1/2 -translate-y-1/2 truncate text-base font-semibold text-ink transition-opacity duration-200 ${
                bar.title && bar.collapsed ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {bar.title}
            </p>
          )}

          {/* 오른쪽은 종만 — 설정 · 내 정보는 더보기 폴더 안으로 갔다(2026-10-14 사용자 "앱 홈 우상단에는 알림 아이콘만") */}
          <div className="flex shrink-0 items-center gap-2">
            {bell}
            {/* 창은 종 바로 뒤에 둔다 — 키보드로 종을 열면 Tab 한 번에 창 안으로 들어간다. 자리는 막대에 붙여 잡는다(absolute). */}
            {panel}
          </div>
        </header>
      )}
    </>
  );
}

/**
 * 위 막대 숨기기 — 아래로 굴리면 막대가 위로 미끄러져 사라지고(본문이 시계 자리까지 올라간다), 위로 굴리면 다시 내려온다
 * (2026-10-14 사용자 "인스타 홈처럼"). 맨 위 근처(8px)에서는 늘 보인다. 작은 떨림(4px 안)은 무시. 알림 창이 열려 있으면 안 숨긴다
 * (창이 막대 안에 있다). enabled 가 아니면(‹ 뒤로 가 있는 하위 화면) 늘 보인다.
 */
function useBarHidden(enabled: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    /* 창이 아니라 판이 굴러갈 수도 있다(판 넘기기, lib/scroller.ts) — 어느 쪽이든 같은 길 */
    let last = scrollTopNow();
    const read = () => {
      frame = 0;
      const y = scrollTopNow();
      const dy = y - last;
      last = y;
      if (y < 8) setHidden(false);
      else if (dy > 4 && y > 64) setHidden(true);
      else if (dy < -4) setHidden(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const off = onAnyScroll(onScroll);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, [enabled]);
  /* 꺼지면 값과 상관없이 보인다 — 다시 켜질 때 지난 값이 남지 않게 effect 가 아니라 여기서 */
  return enabled && hidden;
}
