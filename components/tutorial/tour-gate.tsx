'use client';

import {
  addTransitionType,
  startTransition,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { markTutorialDone } from '@/app/actions/onboarding-state';
import { tourKeyFor } from '@/lib/feature-locks';
import { QUIET_REFRESH } from '@/lib/transition-types';
import { TutorialDialog, readyToShow } from './tutorial-dialog';
import { tourAppSlides, tourWebSlides } from './slides';

/**
 * 기본 투어 — 처음 홈(/today)에 온 사람에게 앱 기본 사용법(막대 · 메뉴 · 설정 · 체크인 · 잠긴 탭)을 한 번 보여 준다.
 * 웹과 앱(아이폰 웹뷰)은 생김새가 달라 글이 따로다(slides.tsx 의 tourWebSlides · tourAppSlides). 어느 쪽인지는 서버 페이지가
 * User-Agent 로 가려 variant 로 준다(lib/app-env.ts isNativeUserAgent). 본 것은 열쇠도 따로 적는다(tour:web · tour:app).
 *
 * (app) 레이아웃에 있어 어느 화면에서든 그려지지만, 처음 한 번은 홈에서만 연다(2026-10-09 사용자 결정 ④ '가입 직후 첫 홈').
 * 다른 화면에서 열면 그 화면 일을 가로막는다 — 첫 설정(/videos/setup 등)을 새로 불러오면 마법사 위에 떠서 제목에 둔 초점까지
 * 빼앗았다. 홈이 아닌 데서 앱을 연 사람은 홈에 처음 갈 때 본다. 설정 › 정보 '사용 안내 다시 보기'만은 지금 화면에서 바로
 * 연다(아래 replay).
 *
 * 첫 홈의 차례는 시작 연출(components/app-splash.tsx) → 이 투어 → 체크인 관문(components/checkin-gate.tsx)이다.
 *   · 연출이 도는 중이면 걷힌 뒤에 연다 — 관문과 같은 방식(html[data-splash] · SPLASH_END_EVENT).
 *   · 열기로 정해진 동안 <html data-tour> 를 단다(holdTour). 관문이 이것을 보고 끝나기(TOUR_END_EVENT)를 기다린다 — 둘 다
 *     맨 위 칸(top layer)의 창이라 나중에 연 것이 덮는다.
 *   · 표시는 창이 뜨기 전, 열기로 정해진 순간에 단다. 관문도 같은 연출 끝 신호를 듣는데, 관문이 먼저 들으면 표시가 아직 없어
 *     그냥 열어 버린다. 화면을 떠나(unmount) 창이 사라져도 표시를 걷고 신호를 보낸다 — 관문이 영영 기다리지 않게.
 */

/** 튜토리얼이 떠 있는(곧 뜰) 동안 <html> 에 다는 표시 · 다 끝나면 window 에 보내는 신호 */
export const TOUR_ATTR = 'data-tour';
export const TOUR_END_EVENT = 'bullpen-tour-end';
/**
 * 설정 › 정보 '사용 안내 다시 보기'가 보내는 신호 — 지금 화면에서 투어를 다시 연다.
 *
 * 서버의 열쇠를 지우는 것(resetTutorial)만으로는 모자란 때가 있다. 투어를 Esc 로 닫으면 봤다고 적지 않으므로 open 은 이미
 * 켜져 있고, 이 화면에서 닫았다는 상태(closed)만 남는다. 열쇠를 지워도 open 이 그대로라 여기서는 다시 열 까닭을 모른다.
 */
export const TOUR_REPLAY_EVENT = 'bullpen-tour-replay';

/*
 * 표시를 붙든 수 — 기본 투어와 탭 튜토리얼(tab-tutorial.tsx)이 같이 쓴다. 탭 화면을 새로 불러오면(오늘 체크인 전) 탭
 * 튜토리얼과 관문이 같이 뜨려 하는데, 그때도 관문이 튜토리얼 뒤에 서게. 하나가 끝나도 다른 것이 붙들고 있으면 표시를 남긴다.
 */
let holds = 0;

/**
 * 표시를 단다 — 돌려준 함수로 푼다(두 번 불러도 한 번만). 모두 풀리면 표시를 걷고 끝났다고 알린다.
 * 열기로 정해진 순간(그리는 즉시, useLayoutEffect)에 불러야 관문의 효과보다 먼저 달린다.
 */
export function holdTour(): () => void {
  const root = document.documentElement;
  holds += 1;
  root.setAttribute(TOUR_ATTR, '');
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds -= 1;
    if (holds > 0) return;
    root.removeAttribute(TOUR_ATTR);
    window.dispatchEvent(new Event(TOUR_END_EVENT));
  };
}

const HOME_PATH = '/today';

export function TourGate({ open, variant }: { open: boolean; variant: 'web' | 'app' }) {
  const pathname = usePathname();
  /* 창이 실제로 떠 있나 — 연출 · 화면 전환 · 그림 두 장을 기다렸다 켠다 */
  const [shown, setShown] = useState(false);
  /*
   * 이 틀에서 닫았다 — 서버가 '봤다'를 돌려주기 전에도 다시 안 뜨게. Esc 로 닫은 것도 (app) 레이아웃이 살아 있는 동안은
   * (클라이언트 이동으로 홈에 다시 와도) 다시 안 뜨고, 문서를 새로 불러오면(새로고침 · 다시 접속) 홈에서 다시 뜬다.
   */
  const [closed, setClosed] = useState(false);
  /* '사용 안내 다시 보기' — 홈이 아니어도 지금 화면에서 연다 */
  const [replay, setReplay] = useState(false);
  /*
   * 서버가 준 open 이 바뀐 순간(그리는 도중 상태 보정). 꺼지면 봤다고 적힌 것이라 '닫았다'를 되돌린다. 꺼졌다 다시 켜지면
   * 설정에서 열쇠를 지운 것(resetTutorial)이라 다시 보기로 친다.
   */
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setClosed(false);
    setReplay(open);
  }
  const pending = open && !closed && (replay || pathname === HOME_PATH);
  /* 열 일이 없어졌으면(홈을 떠남 · 서버가 끔) 창도 내린다 — 다음에 열 때 기다림부터 다시 하게 */
  if (!pending && shown) setShown(false);

  useEffect(() => {
    const onReplay = () => {
      setClosed(false);
      setReplay(true);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, []);

  /* 표시는 그리자마자(layout) — 관문의 효과보다 먼저 달려 있어야 한다. 떠나거나 닫히면 푼다(관문이 이어서 열린다) */
  useLayoutEffect(() => {
    if (!pending) return;
    return holdTour();
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    readyToShow().then(() => {
      if (!cancelled) setShown(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const close = (done: boolean) => {
    setShown(false);
    setClosed(true);
    /* Esc 는 적지 않는다 — 문서를 새로 불러오면 홈에서 다시 뜬다 */
    if (!done) return;
    /*
     * 적으면 액션이 틀까지 새로 읽어(revalidatePath) 응답에 실어 온다 — 그 새 화면으로 바뀌는 전환에 '조용히' 표시를 붙여
     * 본문(app-main)이 한 번 옅어지지 않게 한다(lib/quiet-refresh.ts 와 같은 표시).
     */
    startTransition(async () => {
      addTransitionType(QUIET_REFRESH);
      await markTutorialDone(tourKeyFor(variant === 'app')).catch(() => undefined);
    });
  };

  return (
    <TutorialDialog
      open={shown}
      label="불펜로그 · 처음 안내"
      slides={variant === 'app' ? tourAppSlides : tourWebSlides}
      onClose={close}
    />
  );
}
