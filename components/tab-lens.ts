'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * 하단 탭의 유리 렌즈 — 고른 칸 뒤의 캡슐 하나를 스프링으로 옮긴다(2026-10-14 사용자: 참고 영상(iOS 26 탭 막대)처럼
 * "선택 캡슐이 메뉴 사이를 탄성 있게 이동, 연속으로 눌러도 깨지지 않게, 처음 그릴 때 엉뚱한 자리에서 나타나지 않게").
 *
 * 영상을 30fps 로 뜯어 보면 세 단계다 — ① 누르면 회색 캡슐이 살짝 부푼다 ② 투명한 유리 렌즈가 되어 막대 밖까지 부풀고
 * 가장자리에 빛 테두리가 생긴 채 다음 칸으로 미끄러진다(막대도 아주 조금 커진다) ③ 도착하면 줄어들며 회색 캡슐로
 * 가라앉는다. 약 0.4초.
 *
 * 그래서 값 셋을 각자 스프링으로 몬다 — 자리(칸 번호, 소수), 부풂(0 가라앉음 ~ 1 렌즈), 보임(고른 칸이 없으면 0).
 * CSS transition 으로는 연속으로 누를 때 빠르기가 끊기고(새 transition 이 멈춘 자리에서 0 빠르기로 다시 시작) 탄성을
 * 곡선 하나로만 흉내 낸다. 스프링은 지금 빠르기를 이어받아 새 칸으로 꺾는다.
 *
 * 그리기는 React 를 거치지 않는다 — 장면마다 렌즈의 CSS 변수(--p · --sx · --sy · --lift · --fill · --show)와 막대 · 아이콘의
 * transform 만 바꾼다. 다 멈추면 장면 고리(rAF)도 멈춘다. 렌즈의 처음 자리는 서버가 그린 HTML 의 --p(지금 탭 번호)라
 * 첫 페인트부터 맞는 자리다(app-shell.tsx MobileTabs — 칸 폭이 같아 CSS 만으로 셈한다, globals.css '하단 탭의 유리 렌즈').
 *
 * 움직임 줄이기면 스프링 없이 바로 옮기고 부풀지 않는다.
 */

type Spring = { x: number; v: number };
type Tuning = { k: number; c: number };

/** 자리 — 고유 진동 약 2.4Hz · 감쇠 0.72: 0.4초 남짓에 닿고 3% 쯤 넘쳤다 돌아온다(영상의 '약간의 탄성') */
const POS: Tuning = { k: 230, c: 22 };
/** 부풂 — 자리보다 빨라 출발 0.1초 안에 렌즈가 되고, 닿으면 곧 가라앉는다 */
const LIFT: Tuning = { k: 420, c: 34 };
/** 보임 — 고른 칸이 생기거나 없어질 때 */
const SHOW: Tuning = { k: 320, c: 36 };

/** 렌즈로 부푸는 몫 — 칸(52px) 높이의 28% 면 알약(62px) 위아래로 2px 쯤 나온다(영상처럼 막대 밖으로) */
const LIFT_SX = 0.22;
const LIFT_SY = 0.28;
/** 누르고 있는 동안의 부풂(영상 ① — 회색 캡슐이 살짝 부푼다) */
const PRESS_LIFT = 0.3;
/** 빠르기만큼 진행 방향으로 늘어나는 몫(칸/초 당) · 상한 — 액체처럼 끌려가는 느낌 */
const STRETCH_PER_SPEED = 0.022;
const STRETCH_MAX = 0.16;
/** 렌즈 밑 아이콘이 커지는 몫(과하지 않게 — 사용자 요청) */
const ICON_LIFT = 0.08;
/** 막대가 커지는 몫(가로 막대만) */
const BAR_LIFT = 0.014;
/** 아직 '옮겨 가는 중'으로 보는 거리(칸) · 빠르기(칸/초) */
const MOVING_DIST = 0.12;
const MOVING_SPEED = 1.2;

function step(s: Spring, target: number, t: Tuning, h: number) {
  const a = -t.k * (s.x - target) - t.c * s.v;
  s.v += a * h;
  s.x += s.v * h;
}

const near = (s: Spring, target: number) =>
  Math.abs(s.x - target) < 0.001 && Math.abs(s.v) < 0.01;

export type TabLens = {
  /** 장면 고리를 멈춘다(화면에서 내려갈 때) */
  stop(): void;
  /** 고른 칸으로 옮긴다. -1 이면 고른 칸이 없다 — 렌즈를 숨긴다 */
  to(index: number): void;
  /** 끄는 중 — 손가락 자리(칸 번호, 소수). 렌즈가 부푼 채 따라온다 */
  follow(p: number): void;
  /** 끌기 끝 — 놓은 칸(또는 원래 칸)으로 가라앉는다 */
  release(index: number): void;
  /** 손가락이 닿음 · 뗌 */
  press(on: boolean): void;
};

export function useTabLens(
  bar: RefObject<HTMLElement | null>,
  lens: RefObject<HTMLElement | null>,
  initialIndex: number
): TabLens {
  /* 한 번만 만든다 — 스프링 상태는 그리기와 상관없이 이 닫힘(closure) 안에 산다 */
  const [api] = useState<TabLens>(() => {
    const pos: Spring = { x: Math.max(0, initialIndex), v: 0 };
    const lift: Spring = { x: 0, v: 0 };
    const show: Spring = { x: initialIndex >= 0 ? 1 : 0, v: 0 };
    let target = Math.max(0, initialIndex);
    let showTarget = initialIndex >= 0 ? 1 : 0;
    let dragging = false;
    let pressed = false;
    let frame = 0;
    let last = 0;
    let faces: HTMLElement[] = [];
    let vertical = false;

    const reduced = () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const write = () => {
      const el = lens.current;
      if (!el) return;
      const L = Math.max(0, Math.min(1.15, lift.x));
      const S = Math.max(0, Math.min(1, show.x));
      const stretch = Math.min(STRETCH_MAX, Math.abs(pos.v) * STRETCH_PER_SPEED);
      const grow = 0.6 + 0.4 * S;
      const along = (1 + (vertical ? LIFT_SY : LIFT_SX) * L + stretch) * grow;
      const across = (1 + (vertical ? LIFT_SX : LIFT_SY) * L - stretch * 0.4) * grow;
      el.style.setProperty('--p', pos.x.toFixed(4));
      el.style.setProperty('--sx', (vertical ? across : along).toFixed(4));
      el.style.setProperty('--sy', (vertical ? along : across).toFixed(4));
      el.style.setProperty('--lift', Math.min(1, L).toFixed(3));
      el.style.setProperty('--fill', (1 - 0.75 * Math.min(1, L)).toFixed(3));
      el.style.setProperty('--show', S.toFixed(3));
      const b = bar.current;
      if (b && !vertical) {
        b.style.transform = L > 0.001 ? `scale(${(1 + BAR_LIFT * L).toFixed(4)})` : '';
      }
      faces.forEach((f, i) => {
        const close = Math.max(0, 1 - Math.abs(i - pos.x));
        const s = 1 + ICON_LIFT * Math.min(1, L) * close * S;
        f.style.transform = s > 1.0005 ? `scale(${s.toFixed(4)})` : '';
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      last = now;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        step(pos, target, POS, h);
        const moving =
          Math.abs(pos.x - target) > MOVING_DIST || Math.abs(pos.v) > MOVING_SPEED;
        const liftTarget = dragging || moving ? 1 : pressed ? PRESS_LIFT : 0;
        step(lift, liftTarget, LIFT, h);
        step(show, showTarget, SHOW, h);
      }
      const liftTarget = dragging ? 1 : pressed ? PRESS_LIFT : 0;
      const settled =
        !dragging &&
        near(pos, target) &&
        near(lift, liftTarget) &&
        near(show, showTarget);
      if (settled) {
        pos.x = target;
        pos.v = 0;
        lift.x = liftTarget;
        lift.v = 0;
        show.x = showTarget;
        show.v = 0;
        write();
        frame = 0;
        return;
      }
      write();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduced()) {
        pos.x = target;
        pos.v = 0;
        lift.x = 0;
        lift.v = 0;
        show.x = showTarget;
        show.v = 0;
        write();
        return;
      }
      if (frame) return;
      const b = bar.current;
      if (b) {
        faces = Array.from(b.querySelectorAll<HTMLElement>('[data-tab-face]'));
        vertical = b.clientHeight > b.clientWidth;
      }
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    return {
      stop() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      },
      to(index) {
        if (index < 0) {
          showTarget = 0;
        } else {
          /* 숨어 있다가 나타나면 그 자리에서 — 0번 칸에서 미끄러져 오지 않게 */
          if (show.x < 0.05 && showTarget === 0) {
            pos.x = index;
            pos.v = 0;
          }
          target = index;
          showTarget = 1;
        }
        start();
      },
      follow(p) {
        dragging = true;
        if (show.x < 0.05) {
          pos.x = p;
          pos.v = 0;
        }
        target = p;
        showTarget = 1;
        start();
      },
      release(index) {
        dragging = false;
        if (index >= 0) target = index;
        else showTarget = 0;
        start();
      },
      press(on) {
        if (pressed === on) return;
        pressed = on;
        start();
      },
    };
  });

  useEffect(() => () => api.stop(), [api]);
  return api;
}
