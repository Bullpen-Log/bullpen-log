'use client';

import Link from 'next/link';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { RoundChat, RoundMenu } from '@/components/round-icon';
import { DugoutBell, DugoutSettings } from '@/components/dugout/dugout-header-tools';
import { AppLauncher } from '@/components/dugout/app-launcher';
import { splashScale } from '@/lib/brand';
import { Wordmark } from '@/components/logo';

/**
 * 덕아웃 첫 화면(2026-10-21 금윤호: "처음 접속하면 로고와 단어가 가운데 크게 뜨고, 위로 가면서 구글 같은 홈이 나오고, 조금만 내리면 로고가 작아지며
 * 위로 가고 지금의 덕아웃 홈이 나오게").
 *
 * 단계 셋 — html[data-hero] 로 적어 위 막대(components/dugout/dugout-topbar.tsx)가 같이 움직인다(globals.css '덕아웃 첫 화면').
 *   splash  로고 · 이름만 화면 정중앙에 크게(들어올 때마다), 나머지는 아무것도 없다 → 1초 뒤 hero(로고가 줄며 제자리로, 바로가기 · 모서리 · 안내가 스르륵)
 *   hero    구글식 홈 — 작은 링크 · 큰 로고 · 검색창 · 단추 둘. 위 막대는 숨는다. 바퀴 · 손가락 · 키로 조금만 내리면 home
 *   home    로고가 작아지며 위로(위 막대가 떠오름) · 이 판이 접히며 밑의 덕아웃 홈이 올라온다. 맨 위에서 다시 올리면 hero 로
 */
const noopSubscribe = () => () => {};

type Stage = 'splash' | 'hero' | 'home';
/** 로고만 떠 있는 시간(2026-10-21 금윤호: 1초 → "0.5초로") */
const SPLASH_MS = 500;
/** 싱커에서 돌아올 때 — 가운데 로고가 이미 커지며 보였으니 바로 줄어든다(2026-10-21 금윤호 "로고가 떠 있는 시간이 너무 길다") */
const SPLASH_FROM_SINKER_MS = 250;
const COLLAPSE_MS = 620;

export function DugoutHero({
  user,
  unread = 0,
  alerts = 0,
  sinker = false,
  native = false,
}: {
  user: { nickname: string } | null;
  unread?: number;
  alerts?: number;
  /** 싱커를 쓰는 사람 — 바로가기 마지막 칸이 '싱커' */
  sinker?: boolean;
  native?: boolean;
}) {
  /* 서버 그림부터 splash(로고 크게) — 첫 칠에 위 막대가 비쳤다 사라지는 일이 없다. 이미 본 세션이면 수화 뒤 바로 hero 로 줄어든다 */
  const [stage, setStage] = useState<Stage>('splash');
  const stageRef = useRef<Stage>('splash');
  /* 맨 위에 닿은 때 — 관성으로 굴러 올라와 닿자마자 첫 화면이 다시 펴지지 않게(0.35초는 맨 위에 머물러야 편다) */
  const topSince = useRef<number>(0);
  const busy = useRef(false);
  const touchY = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  /*
   * 시작 연출의 로고를 화면 정중앙에(2026-10-21 금윤호: "정중앙이 아니라 살짝 밑에 치우쳐 있다"). 홈 자리(바로가기 위)에 놓인 로고 칸을 재서
   * 화면 가운데까지의 차이만큼 옮겨 둔다 — 위 막대가 투명하게 자리를 차지해도, 바로가기 높이가 달라도 늘 정중앙. 재기 전에는 숨긴다(엉뚱한 자리에서 튀지 않게).
   */
  /* 모서리 묶음을 그릴 곳 — 수화 뒤의 body(서버 그림에는 없다 — splash 동안 어차피 숨어 있다). 프레임을 기다리지 않는다(숨은 탭에서 안 붙던 것) */
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const portalTarget = hydrated ? document.body : null;
  const logoBox = useRef<HTMLDivElement>(null);
  const fromSinker = useRef(false);
  const [center, setCenter] = useState<{ x: number; y: number; scale: number } | null>(
    null
  );
  useLayoutEffect(() => {
    /* 싱커 → 덕아웃 변형으로 왔나 — 덕아웃 틀의 MorphIn 보다 먼저 돌아 아직 'to-dugout-out' 이 보인다 */
    fromSinker.current = /^(to-dugout-out|in-dugout)$/.test(
      document.documentElement.dataset.morph ?? ''
    );
    if (stageRef.current !== 'splash') return;
    const measure = () => {
      const r = logoBox.current?.getBoundingClientRect();
      if (!r) return;
      setCenter({
        x: window.innerWidth / 2 - (r.left + r.width / 2),
        y: window.innerHeight / 2 - (r.top + r.height / 2),
        /* 크기는 lib/brand.ts splashScale — 싱커에서 돌아올 때의 가운데 로고와 같은 값 */
        scale: splashScale(r.width, window.innerWidth),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  function go(next: Stage) {
    stageRef.current = next;
    setStage(next);
  }

  /* 움직임 줄이기면 splash 를 건너뛴다 */
  useEffect(() => {
    if (
      stageRef.current === 'splash' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      go('hero');
  }, []);

  /* splash 는 0.5초(싱커에서 오면 0.25초) 뒤 hero 로 */
  useEffect(() => {
    if (stage !== 'splash') return;
    const t = window.setTimeout(
      () => go('hero'),
      fromSinker.current ? SPLASH_FROM_SINKER_MS : SPLASH_MS
    );
    return () => window.clearTimeout(t);
  }, [stage]);

  /* 위 막대 · 틀에 알린다 */
  useEffect(() => {
    const html = document.documentElement;
    if (stage === 'home') delete html.dataset.hero;
    else html.dataset.hero = stage;
    return () => {
      delete html.dataset.hero;
    };
  }, [stage]);

  /* 조금만 내려도 홈 · 맨 위에서 올리면 다시 첫 화면 */
  useEffect(() => {
    const collapse = () => {
      if (busy.current || stageRef.current !== 'hero') return;
      busy.current = true;
      go('home');
      /*
       * 굴려서 접혔으면 그만큼 내려간 채라 홈 맨 위('내 싱커' 띠)가 위 막대 밑에 숨었다(2026-10-22 금윤호 "화면이 잘린다") — 접히면 맨 위에서 시작
       */
      window.scrollTo({ top: 0, behavior: 'instant' });
      window.setTimeout(() => (busy.current = false), COLLAPSE_MS);
    };
    const expand = () => {
      if (busy.current || stageRef.current !== 'home' || window.scrollY > 0) return;
      if (performance.now() - topSince.current < 350) return;
      busy.current = true;
      go('hero');
      window.scrollTo({ top: 0 });
      window.setTimeout(() => (busy.current = false), COLLAPSE_MS);
    };
    const onWheel = (e: WheelEvent) => {
      if (stageRef.current === 'splash') return;
      if (e.deltaY > 6) {
        if (stageRef.current === 'hero') {
          e.preventDefault();
          collapse();
        }
      } else if (e.deltaY < -24) expand();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY.current == null) return;
      const dy = touchY.current - (e.touches[0]?.clientY ?? touchY.current);
      if (dy > 18 && stageRef.current === 'hero') {
        touchY.current = null;
        collapse();
      } else if (dy < -40) {
        touchY.current = null;
        expand();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        el !== document.body &&
        el.closest('input, textarea, select, button, a, [contenteditable]')
      )
        return;
      if (
        ['ArrowDown', 'PageDown', ' '].includes(e.key) &&
        stageRef.current === 'hero'
      ) {
        e.preventDefault();
        collapse();
      }
    };
    const onScroll = () => {
      if (window.scrollY > 0) topSince.current = Infinity;
      else if (topSince.current === Infinity) topSince.current = performance.now();
      if (stageRef.current === 'hero' && window.scrollY > 24) collapse();
    };
    topSince.current = window.scrollY > 0 ? Infinity : 0;
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const splash = stage === 'splash';
  const home = stage === 'home';
  const [gridOpen, setGridOpen] = useState(false);
  const apps = [
    { href: '/market', label: '장터' },
    { href: '/community', label: '커뮤니티' },
    { href: '/lessons', label: '레슨' },
    { href: '/venues', label: '연습장' },
    { href: '/gear', label: '장비' },
    { href: user ? '/me' : '/login', label: user ? '내 것' : '로그인' },
  ];

  return (
    <div
      ref={box}
      data-dugout-hero
      data-stage={stage}
      aria-hidden={home}
      inert={home}
      /* 틀의 본문 여백을 덮고 화면 전체를 쓴다 — 접히면 높이 0 */
      className="relative -mx-4 -mt-5 overflow-hidden md:-mx-6 md:-mt-8"
      style={{
        height: home ? 0 : 'calc(var(--vvh, 100dvh))',
        /* 접히면 틀의 본문 여백(위)을 돌려줘 홈 내용이 위 막대에 붙지 않게 — 예전엔 0 간격이라 조금만 굴려도 잘렸다 */
        marginTop: home ? 0 : undefined,
        marginBottom: home ? 0 : undefined,
        transition: `height ${COLLAPSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), margin ${COLLAPSE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      }}
    >
      {/* 구글식 작은 링크 — 왼쪽 위 · 오른쪽 위. body 로 옮겨 그린다(본문 연출의 변형에 안 끌려가게). splash · home 에서는 숨는다 */}
      {portalTarget &&
        createPortal(
          <div
            inert={splash || home}
            data-brand="dugout"
            className={`fixed inset-x-0 top-0 z-30 flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] text-[15px] transition-opacity duration-700 md:px-10 lg:px-14 ${
              splash || home
                ? 'pointer-events-none opacity-0'
                : 'opacity-100 delay-[450ms]'
            }`}
          >
            <nav className="flex items-center gap-6 font-medium text-muted">
              <Link href="/intro" className="hover:text-ink">
                덕아웃 소개
              </Link>
              <Link href="/market" className="hover:text-ink">
                장터
              </Link>
            </nav>
            <div className="relative flex items-center gap-3">
              {user ? (
                <>
                  <Link
                    href="/chat"
                    className="relative grid h-12 w-12 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                    aria-label="채팅"
                  >
                    <RoundChat className="h-6 w-6" />
                    {unread > 0 && (
                      <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-danger" />
                    )}
                  </Link>
                  {/* 알림은 종 밑 작은 창(2026-10-22 — 위 막대와 같은 부품) */}
                  <DugoutBell initial={alerts} large />
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-2 font-medium text-muted hover:text-ink"
                >
                  로그인
                </Link>
              )}
              <button
                type="button"
                aria-label="덕아웃 메뉴"
                aria-expanded={gridOpen}
                onClick={() => setGridOpen((v) => !v)}
                className="grid h-12 w-12 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
              >
                <RoundMenu className="h-6 w-6" />
              </button>
              {/* 설정(2026-10-22 금윤호 "덕아웃 메인화면 우측 상단에 설정") — 싱커와 같은 설정 창 */}
              <DugoutSettings />
              {user ? (
                <Link
                  href="/me"
                  aria-label="내 것"
                  className="grid h-11 w-11 place-items-center rounded-full bg-sky text-base font-bold text-white"
                >
                  {user.nickname.slice(0, 1)}
                </Link>
              ) : (
                <Link
                  href="/login?signup=1"
                  className="min-h-11 rounded-full bg-sky px-5 text-[15px] font-semibold leading-[2.75rem] text-white"
                >
                  시작하기
                </Link>
              )}
              {gridOpen && (
                <div className="absolute top-14 right-0 z-10 grid w-72 grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-2 shadow-lg">
                  {apps.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      onClick={() => setGridOpen(false)}
                      className="rounded-xl px-2 py-3 text-center text-sm font-semibold text-ink hover:bg-sky/10"
                    >
                      {a.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>,
          portalTarget
        )}

      {/* 가운데 — 로고 · 검색 · 단추 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        {/* 바깥 칸은 홈 자리 그대로(재는 기준), 안쪽만 움직인다 */}
        <div ref={logoBox} className="flex flex-col items-center">
          <div
            className="flex flex-col items-center transition-[transform,opacity] duration-[900ms] ease-[cubic-bezier(0.65,0,0.25,1)]"
            style={{
              transform: splash
                ? `translate(${center?.x ?? 0}px, ${center?.y ?? 0}px) scale(${center?.scale ?? 1.6})`
                : home
                  ? 'translateY(-40vh) scale(0.35)'
                  : 'translateY(-16px) scale(1)',
              opacity: splash && !center ? 0 : 1,
              transitionDuration: splash ? '0ms' : undefined,
            }}
          >
            <Wordmark brand="dugout" className="text-6xl text-ink md:text-8xl" />
          </div>
        </div>
        {/* 바로가기(2026-10-21 — 검색 대신 앱 아이콘처럼 바로 열기) */}
        <div
          className={`mt-10 w-full max-w-3xl transition-all duration-700 ${splash || home ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100 delay-[300ms]'}`}
        >
          <AppLauncher
            key={splash ? 'wait' : 'show'}
            loggedIn={!!user}
            sinker={sinker}
            native={native}
            className={splash ? 'invisible' : ''}
          />
        </div>
      </div>

      {/* 아래 안내 — 내리면 홈 */}
      <button
        type="button"
        onClick={() => stage === 'hero' && go('home')}
        className={`absolute inset-x-0 bottom-6 mx-auto flex w-fit flex-col items-center gap-1 text-xs text-muted transition-opacity duration-700 ${splash || home ? 'pointer-events-none opacity-0' : 'opacity-100 delay-[900ms]'}`}
      >
        <span>아래로 내리면 장터 · 소통 · 레슨</span>
        <span aria-hidden className="motion-safe:animate-bounce">
          ↓
        </span>
      </button>
    </div>
  );
}
