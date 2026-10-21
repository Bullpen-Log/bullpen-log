'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Wordmark } from '@/components/logo';

/**
 * 덕아웃 ↔ 싱커 변형(2026-10-21 금윤호: "페이지 이동 느낌이 아니라 덕아웃 화면이 싱커로 자연스럽게 바뀌는 느낌 — 보고 있던 가운데 판은 아래로
 * 내려가며 사라지고, 아이콘 · 인터페이스가 변형되며 싱커로").
 *
 * 두 틀(app/(dugout) · app/(app))은 다른 레이아웃이라 DOM 이 통째로 바뀐다. 그래서 '같은 문서'인 <html> 에 상태를 달아 두 쪽을 잇는다:
 *   1 누르면 html[data-morph='to-sinker-out'] — 지금 틀의 본문([data-morph-main])은 아래로 내려가며 옅어지고, 막대의 칸들([data-morph-chrome] > *)은
 *     차례로 접힌다(globals.css '덕아웃 ↔ 싱커 변형').
 *   2 접히는 동안 router.push — 새 틀이 붙는다.
 *   3 새 틀의 <MorphIn /> 이 html[data-morph='in'] 으로 바꾼다 — 본문은 아래에서 올라오고 칸들은 차례로 펴진다. 끝나면 지운다.
 * view-transition-name 은 안 쓴다(김민 규칙 — 글자 · 열린 창을 덮는다). 움직임 줄이기면 그냥 이동.
 */
export type MorphDir = 'to-sinker' | 'to-dugout';

const OUT_MS = 340;
const IN_MS = 560;
const SAFETY_MS = 1800;

export function morphTo(
  href: string,
  dir: MorphDir,
  router: { push: (href: string) => void }
) {
  const html = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    router.push(href);
    return;
  }
  /* 이미 넘어가는 중이면 무시 — 두 번 누르면 이동이 두 번 걸렸다 */
  if (html.dataset.morph?.endsWith('-out')) return;
  if (dir === 'to-dugout') markSides();
  html.dataset.morph = `${dir}-out`;
  window.setTimeout(() => router.push(href), OUT_MS);
  /* 새 틀이 끝내 안 오면(막힘 · 오류) 본문이 숨은 채 남지 않게 */
  window.setTimeout(() => {
    if (html.dataset.morph?.endsWith('-out')) delete html.dataset.morph;
  }, SAFETY_MS);
}

/**
 * 싱커 → 덕아웃(2026-10-21 금윤호: "싱커의 인터페이스 · 아이콘들은 양옆으로 사라지고") — 막대의 칸([data-morph-chrome] > *)과 따로 표시한 것([data-morph-side])마다
 * 화면 가운데보다 왼쪽이면 왼쪽 끝 너머로, 오른쪽이면 오른쪽 끝 너머로 갈 거리를 --mx 에 적는다. 움직임은 globals.css 'to-dugout-out'.
 */
function markSides() {
  const mid = window.innerWidth / 2;
  document
    .querySelectorAll<HTMLElement>('[data-morph-chrome] > *, [data-morph-side]')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const cx = r.left + r.width / 2;
      const away = cx < mid ? -(r.right + 24) : window.innerWidth - r.left + 24;
      el.style.setProperty('--mx', `${Math.round(away)}px`);
    });
}

/**
 * 싱커 → 덕아웃의 가운데 로고(2026-10-21 금윤호: "중앙에서 덕아웃 로고가 빠르게 커지면서 나오고, 방금 만든 화면의 로고가 작아지고") — 싱커 틀에 하나.
 * 칸들이 양옆으로 빠지는 동안 바탕이 덮이고 로고가 작게 → 덕아웃 시작 화면의 큰 로고와 같은 크기(components/dugout/dugout-hero.tsx 와 같은 셈)로 커진다.
 * 덕아웃 홈이 붙으면 그 시작 화면이 같은 자리 · 같은 크기에서 이어받아 줄어든다 — 끊김 없이 한 로고로 읽힌다.
 */
export function MorphOverlay() {
  const [on, setOn] = useState(false);
  const logo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const html = document.documentElement;
    const mo = new MutationObserver(() =>
      setOn(html.dataset.morph === 'to-dugout-out')
    );
    mo.observe(html, { attributes: true, attributeFilter: ['data-morph'] });
    return () => mo.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = logo.current;
    if (!on || !el) return;
    const w = el.getBoundingClientRect().width;
    const big = Math.max(1.2, Math.min(2, (window.innerWidth * 0.86) / Math.max(1, w)));
    el.animate(
      [
        { transform: 'scale(0.25)', opacity: 0 },
        { transform: `scale(${big})`, opacity: 1 },
      ],
      { duration: 360, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', fill: 'forwards' }
    );
  }, [on]);
  if (!on) return null;
  return (
    <div
      aria-hidden
      data-brand="dugout"
      data-morph-veil
      className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-page"
    >
      <div ref={logo} style={{ opacity: 0 }}>
        <Wordmark brand="dugout" className="text-6xl text-ink md:text-8xl" />
      </div>
    </div>
  );
}

/** 새 틀이 붙었을 때 — 접힌 상태를 펴는 쪽으로 돌린다. 두 레이아웃(덕아웃 · 싱커) 맨 위에 하나씩 */
export function MorphIn() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.dataset.morph?.endsWith('-out')) return;
    html.dataset.morph = html.dataset.morph === 'to-dugout-out' ? 'in-dugout' : 'in';
    /* 정리 타이머는 지우지 않는다 — 효과가 두 번 돌거나(개발 모드) 틀이 곧바로 바뀌면 'in' 이 html 에 남아 새로 붙는 칸마다 연출이 다시 돌았다 */
    window.setTimeout(() => {
      if (html.dataset.morph === 'in' || html.dataset.morph === 'in-dugout')
        delete html.dataset.morph;
    }, IN_MS);
  }, []);
  return null;
}

/** 변형으로 넘어가는 링크 — 수정 키(새 탭) · 가운데 단추는 그냥 링크 */
export function MorphLink({
  href,
  dir,
  className,
  children,
  'aria-label': ariaLabel,
  title,
  ...rest
}: {
  href: string;
  dir: MorphDir;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  title?: string;
  [attr: `data-${string}`]: string | boolean | undefined;
}) {
  const router = useRouter();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    e.preventDefault();
    morphTo(href, dir, router);
  };
  return (
    <a
      href={href}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      title={title}
      {...rest}
    >
      {children}
    </a>
  );
}
