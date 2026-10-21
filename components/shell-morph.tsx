'use client';

import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

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
  html.dataset.morph = `${dir}-out`;
  window.setTimeout(() => router.push(href), OUT_MS);
  /* 새 틀이 끝내 안 오면(막힘 · 오류) 본문이 숨은 채 남지 않게 */
  window.setTimeout(() => {
    if (html.dataset.morph?.endsWith('-out')) delete html.dataset.morph;
  }, SAFETY_MS);
}

/** 새 틀이 붙었을 때 — 접힌 상태를 펴는 쪽으로 돌린다. 두 레이아웃(덕아웃 · 싱커) 맨 위에 하나씩 */
export function MorphIn() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.dataset.morph?.endsWith('-out')) return;
    html.dataset.morph = 'in';
    /* 정리 타이머는 지우지 않는다 — 효과가 두 번 돌거나(개발 모드) 틀이 곧바로 바뀌면 'in' 이 html 에 남아 새로 붙는 칸마다 연출이 다시 돌았다 */
    window.setTimeout(() => {
      if (html.dataset.morph === 'in') delete html.dataset.morph;
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
