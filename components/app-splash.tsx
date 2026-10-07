'use client';

import { useEffect, useRef, useState } from 'react';
import { MARK_PATH, MARK_VIEWBOX } from '@/components/logo';

/**
 * 시작 연출 — 로그인한 채 사이트를 열면(처음 · 다시) 테마 바탕 위에 B 가 가운데 크게 떴다가, 작아지며 왼쪽으로 밀려
 * 이름의 첫 글자 자리로 가고, 그 뒤에서 ULLPEN LOG 가 한 글자씩 밀려 나온다. 잠깐 보인 뒤 옅어지며 걷힌다.
 *
 * 사용자(2026-10-07): "로그인이 된 상태에서 처음 접속하거나 재접속할 때 로고가 가운데에 테마 배경색과 함께 … B 가 가운데에
 * 뜨고 옆으로 밀려나면서 부드럽게, 애플 iOS 느낌". 아이폰 앱의 시작 연출(mobile/ios/App/App/MainViewController.swift
 * IntroOverlay — 김민)과 같은 장면 · 같은 때(큰 B 0.4초 → 1초 동안 자리로 → 1.25초부터 글자가 0.075초 간격으로 0.65초씩 →
 * 2.9초에 걷힘 0.55초)로 맞췄다. 앱 안에서는 그 판이 이미 같은 연출을 하므로 여기는 안 튼다(레이아웃이 UA 로 거른다).
 *
 * 문서를 처음 그릴 때 한 번만 — 화면 사이를 오가는 클라이언트 이동에서는 안 튼다(모듈 변수 played). 서버가 큰 B 장면을
 * 먼저 그려 두어(첫 페인트부터 보인다) 스크립트가 늦어도 흰 화면이 없다. 자리 셈(큰 B → 이름의 B 칸)은 글꼴을 재야 해서
 * 붙은 뒤 한 번 하고, 그다음은 CSS 만 움직인다(globals.css 'app-splash'). 움직임 줄이기면 완성된 이름을 잠깐 보이고 걷는다.
 * 체크인 관문은 이 연출이 끝난 뒤 뜬다(components/checkin-gate.tsx — <html data-splash> 를 본다).
 */

/** 이 문서에서 이미 틀었나 — 클라이언트 이동으로 (app) 레이아웃이 다시 붙어도 또 틀지 않게 */
let played = false;

/** 이름 — B 는 따로(로고), 나머지는 한 글자씩 밀려 나온다 */
const LETTERS = ['U', 'L', 'L', 'P', 'E', 'N', ' ', 'L', 'O', 'G'];

/** 연출이 끝나면 html 에서 이 표시를 걷고 이 이벤트를 보낸다 */
export const SPLASH_ATTR = 'data-splash';
export const SPLASH_END_EVENT = 'bullpen-splash-end';

/** 큰 B 를 잠깐 보인 뒤(초) 자리로 가는 데 걸리는 시간 · 글자 시작 · 다 보인 뒤 걷는 때 — IntroOverlay 와 같다 */
const SETTLE_MS = 2900;
const LEAVE_MS = 550;
const REDUCED_HOLD_MS = 1100;
/** 다시 불러오기(새로고침 · 뒤로) · 같은 탭에서 이미 본 뒤에는 짧게 — 사용자 2026-10-07: "재로딩 때는 로고가 더 빨리 사라지게" */
const QUICK_SETTLE_MS = 1100;
const QUICK_LEAVE_MS = 350;
const SEEN_KEY = 'bullpen-splash-seen';

/** 처음 접속이 아닌가 — 새로고침 · 뒤로/앞으로, 또는 이 탭에서 이미 연출을 봤다 */
function isRevisit() {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) return true;
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppSplash() {
  const [show, setShow] = useState(() => !played);
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!show) return;
    played = true;
    const root = rootRef.current;
    const mark = markRef.current;
    const slot = slotRef.current;
    if (!root || !mark || !slot) return;
    const html = document.documentElement;
    html.setAttribute(SPLASH_ATTR, '');

    /* 큰 B(화면 가운데) → 이름의 B 칸: 가운데에서 가운데로 옮기고 높이 비율만큼 줄인다 */
    const m = mark.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    root.style.setProperty(
      '--splash-dx',
      `${s.left + s.width / 2 - (m.left + m.width / 2)}px`
    );
    root.style.setProperty(
      '--splash-dy',
      `${s.top + s.height / 2 - (m.top + m.height / 2)}px`
    );
    root.style.setProperty(
      '--splash-scale',
      `${m.height > 0 ? s.height / m.height : 1}`
    );

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const quick = !reduce && isRevisit();
    root.dataset.play = reduce ? 'still' : quick ? 'quick' : 'on';
    const total = reduce
      ? REDUCED_HOLD_MS + LEAVE_MS
      : quick
        ? QUICK_SETTLE_MS + QUICK_LEAVE_MS
        : SETTLE_MS + LEAVE_MS;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {}
    const timer = window.setTimeout(() => {
      html.removeAttribute(SPLASH_ATTR);
      window.dispatchEvent(new Event(SPLASH_END_EVENT));
      setShow(false);
    }, total + 50);
    return () => {
      window.clearTimeout(timer);
      html.removeAttribute(SPLASH_ATTR);
    };
  }, [show]);

  if (!show) return null;
  return (
    <div ref={rootRef} className="app-splash" aria-hidden>
      {/*
       * 표시(data-splash)는 HTML 을 읽는 그 자리에서 곧바로 단다 — 붙은(hydration) 뒤의 효과(useEffect)까지 기다리면 그 사이
       * 스트리밍 조각이 드러나며 거는 화면 전환(view transition)의 그림이 이 판 위로 번쩍였다(왼쪽 · 오른쪽 틀, 2026-10-07).
       * globals.css 가 이 표시가 있는 동안 view-transition-name 을 모두 끈다(체크인 관문의 data-gate-up 과 같은 방식).
       */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('${SPLASH_ATTR}','')`,
        }}
      />
      <div className="app-splash__stage">
        {/* 끝 장면의 이름 — B 칸은 비워 두고(큰 B 가 와서 앉는다) 글자만 */}
        <span className="app-splash__word text-display">
          <span ref={slotRef} className="app-splash__slot">
            <svg viewBox={MARK_VIEWBOX} className="h-full w-auto">
              <path d={MARK_PATH} />
            </svg>
          </span>
          {LETTERS.map((ch, i) =>
            ch === ' ' ? (
              <span key={i} className="app-splash__space" />
            ) : (
              <span
                key={i}
                className="app-splash__letter"
                style={{ '--i': i } as React.CSSProperties}
              >
                {ch}
              </span>
            )
          )}
        </span>
        {/* 큰 B — 처음엔 화면 가운데, 그다음 이름의 B 칸으로 */}
        <div ref={markRef} className="app-splash__mark">
          <svg viewBox={MARK_VIEWBOX} className="h-full w-auto fill-brand">
            <path d={MARK_PATH} />
          </svg>
        </div>
      </div>
    </div>
  );
}
