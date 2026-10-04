'use client';

import { addTransitionType, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QUIET_REFRESH } from '@/lib/transition-types';
import { haptic } from '@/lib/haptics';

/** 당겨서 새로고침이 되는 화면 — 하단 탭의 첫 화면들(자료가 바깥에서 바뀔 수 있는 곳) */
const PATHS = new Set(['/today', '/videos', '/training', '/nutrition']);
/** 이만큼(px) 당기면 걸린다(손가락으로는 약 110px) · 더 당겨도 이 이상은 안 내려온다 · 새로 받는 동안 남겨 두는 틈 */
const TRIGGER = 72;
const MAX_PULL = 150;
const HOLD = 52;
/** 손가락이 이만큼 움직여야 당기기로 친다 — 누르기 · 옆으로 밀기와 가른다 */
const SLOP = 8;
/** 돌개는 적어도 이만큼 보인다 — 금방 끝나도 번쩍 사라지면 된 건지 모른다 */
const MIN_SPIN_MS = 600;
/** 틈이 닫히는 움직임(globals.css '당겨서 새로고침')과 같게 */
const SETTLE_MS = 320;

/**
 * 당겨서 새로고침 — 화면 맨 위에서 아래로 당기면 본문이 따라 내려오고 그 틈에 아이폰 돌개가 돈다(2026-10-04 '앱 느낌' 3단계).
 *
 * 아이폰 앱에는 브라우저의 새로고침이 없고, 화면 끝 튕김도 꺼 두어서(globals.css '아이폰 앱 안') 다른 기기에서 남긴 기록을
 * 보려면 탭을 옮겼다 와야 했다. 아이폰 앱처럼 당겨서 새로 받는다 — 서버에서 새로 받되 화면을 깜빡이지 않는다(QUIET_REFRESH,
 * lib/quiet-refresh.ts 와 같은 길). 걸리는 순간 가볍게 '톡'.
 *
 * 아이폰 앱(<html data-app="native">)에서만 켠다 — 사파리는 저 스스로 당겨서 새로고침(문서를 다시 받음)이 있어 겹친다.
 * 창이 열렸거나, 손가락 밑의 칸이 이미 굴러 내려가 있으면(창 안 목록 등) 끼어들지 않는다. 손을 떼기 전에는 막지 않는다 —
 * 모든 듣기가 passive 라 굴리기를 망가뜨릴 수 없다. 본문(<main data-ptr-target>)의 움직임 · 돌개 모양은 globals.css.
 */
export function PullToRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const startedAt = useRef(0);
  /* 틈을 닫는 일 — 손가락을 듣는 effect 가 채우고, 새로 받기가 끝나면 아래 effect 가 부른다 */
  const finishRef = useRef<() => void>(() => {});
  const enabled = PATHS.has(pathname);

  useEffect(() => {
    const html = document.documentElement;
    if (!enabled) return;

    let tracking = false;
    let dragging = false;
    let armed = false;
    let x0 = 0;
    let y0 = 0;
    let busy = false;

    const set = (pull: number) => {
      html.style.setProperty('--ptr-y', `${pull}px`);
      html.style.setProperty('--ptr-p', String(Math.min(1, pull / TRIGGER)));
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      if (busy || html.dataset.app !== 'native' || e.touches.length !== 1) return;
      if (window.scrollY > 0 || document.querySelector('dialog[open]')) return;
      /* 손가락 밑의 칸이 굴러 내려가 있으면 그 칸을 올리는 것이다 */
      for (let el = e.target as Element | null; el && el !== document.body; el = el.parentElement) {
        if (el instanceof HTMLElement && el.scrollTop > 0) return;
        if (el.closest('[data-no-ptr]')) return;
      }
      const bar = document.querySelector('[data-mobile-topbar]');
      html.style.setProperty('--ptr-top', `${bar ? bar.getBoundingClientRect().bottom : 0}px`);
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      tracking = true;
      dragging = false;
      armed = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (!dragging) {
        /* 옆으로 미는 것(가로 목록 · 밀어서 뒤로)이면 손 뗄 때까지 끼지 않는다 */
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) tracking = false;
        if (dy < -SLOP) tracking = false;
        if (!tracking || dy <= SLOP || window.scrollY > 0) return;
        dragging = true;
        html.dataset.ptr = 'pull';
      }
      /* 고무줄처럼 — 처음엔 손가락을 거의 따라오고 갈수록 무거워진다 */
      const d = Math.max(0, dy - SLOP);
      const pull = MAX_PULL * (1 - Math.exp(-d / MAX_PULL));
      set(pull);
      if (!armed && pull >= TRIGGER) {
        armed = true;
        haptic('light');
      } else if (armed && pull < TRIGGER - 12) {
        armed = false;
      }
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      if (armed) {
        busy = true;
        html.dataset.ptr = 'refreshing';
        set(HOLD);
        startedAt.current = performance.now();
        setRefreshing(true);
        startTransition(() => {
          addTransitionType(QUIET_REFRESH);
          router.refresh();
        });
      } else {
        settle();
      }
    };

    const settle = () => {
      html.dataset.ptr = 'settle';
      set(0);
      window.setTimeout(() => {
        if (html.dataset.ptr === 'settle') delete html.dataset.ptr;
        busy = false;
      }, SETTLE_MS);
    };
    finishRef.current = settle;

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      /* 화면을 옮기면 걸려 있던 것을 걷는다 */
      delete html.dataset.ptr;
      html.style.removeProperty('--ptr-y');
    };
  }, [enabled, router]);

  /* 새로 받기가 끝났다(pending 이 풀렸다) — 돌개를 적어도 MIN_SPIN_MS 보인 뒤 틈을 닫는다 */
  useEffect(() => {
    if (!refreshing || pending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (performance.now() - startedAt.current));
    const t = window.setTimeout(() => {
      setRefreshing(false);
      finishRef.current();
    }, wait);
    return () => window.clearTimeout(t);
  }, [refreshing, pending]);

  if (!enabled) return null;
  return (
    <div aria-hidden data-ptr-spinner className="pointer-events-none fixed left-1/2 z-30 desk:hidden">
      <Spinner />
    </div>
  );
}

/** 아이폰 돌개 — 살 여덟 개. 당기는 만큼 살이 하나씩 나타나고(--ptr-p), 새로 받는 동안 돈다(globals.css) */
function Spinner() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 text-muted">
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1="14"
          y1="3.5"
          x2="14"
          y2="8.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 14 14)`}
          style={{ ['--i' as string]: i }}
        />
      ))}
    </svg>
  );
}
