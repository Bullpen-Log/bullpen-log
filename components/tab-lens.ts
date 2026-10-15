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

/**
 * 탭을 고른 신호 — 하단 탭이 아닌 곳에서 탭을 옮길 때(본문 쓸기, components/tab-swipe.tsx) 렌즈가 화면을 기다리지 않고
 * 곧바로 그 칸으로 가게. detail 은 탭 주소. 하단 탭(app-shell.tsx MobileTabs)이 듣고 누른 탭처럼 다룬다.
 */
export const TAB_CHOSEN_EVENT = 'bullpen-tab-chosen';

type Spring = { x: number; v: number };
type Tuning = { k: number; c: number };

/** 자리 — 고유 진동 약 2.7Hz · 감쇠 0.75: 0.35초 남짓에 닿고 2~3% 쯤 넘쳤다 돌아온다(영상의 '약간의 탄성') */
const POS: Tuning = { k: 290, c: 25.5 };
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
/**
 * 렌즈 밑 아이콘이 커지는 몫 — 0(끔). 예전 0.08 은 렌즈가 닿는 0.3초쯤 도착 칸의 아이콘을 8% 키웠다 되돌려, 고른 뒤
 * 아이콘이 한 번 더 들썩이는 것처럼 보였다(2026-10-15 사용자 "선택되고 0.3초 뒤에 아이콘이 좀 움직여"). 렌즈만 움직인다.
 */
const ICON_LIFT = 0;
/** 아직 '옮겨 가는 중'으로 보는 거리(칸) · 빠르기(칸/초) */
const MOVING_DIST = 0.12;
const MOVING_SPEED = 1.2;
/** 미리 셈하는 장면 — 1/240초 걸음 넷을 한 장면(60fps)으로, 길어도 1.5초 */
const SUB = 4;
const FRAME_MS = 1000 / 60;
const MAX_FRAMES = 90;

function step(s: Spring, target: number, t: Tuning, h: number) {
  const a = -t.k * (s.x - target) - t.c * s.v;
  s.v += a * h;
  s.x += s.v * h;
}

const near = (s: Spring, target: number) =>
  Math.abs(s.x - target) < 0.001 && Math.abs(s.v) < 0.01;

/** 스프링 셋의 한 순간 */
type Snap = { p: number; pv: number; l: number; lv: number; s: number; sv: number };

/** 한 순간의 모양 — 렌즈 자리 · 늘어남 · 세 겹의 투명도 · 아이콘 크기 */
function visualOf(st: Snap, vertical: boolean, faces: number) {
  const L = Math.max(0, Math.min(1.15, st.l));
  const S = Math.max(0, Math.min(1, st.s));
  const Lc = Math.min(1, L);
  const stretch = Math.min(STRETCH_MAX, Math.abs(st.pv) * STRETCH_PER_SPEED);
  const grow = 0.6 + 0.4 * S;
  const along = (1 + (vertical ? LIFT_SY : LIFT_SX) * L + stretch) * grow;
  const across = (1 + (vertical ? LIFT_SX : LIFT_SY) * L - stretch * 0.4) * grow;
  const face: number[] = [];
  for (let i = 0; i < faces; i++) {
    const close = Math.max(0, 1 - Math.abs(i - st.p));
    face.push(1 + ICON_LIFT * Lc * close * S);
  }
  return {
    p: st.p,
    sx: vertical ? across : along,
    sy: vertical ? along : across,
    lift: Lc,
    fill: 1 - 0.75 * Lc,
    show: S,
    face,
  };
}

export type TabLens = {
  /** 장면 고리 · 애니메이션을 멈춘다(화면에서 내려갈 때) */
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

/*
 * 그리는 길 둘(2026-10-15 김민: "조금 버벅거리고 딜레이가 있다").
 *  ① 칸을 옮길 때(to · release) — 스프링을 끝까지 미리 셈해 장면 목록으로 브라우저 애니메이션(element.animate)에 넘긴다.
 *     transform · opacity 만이라 합성기(GPU)가 돌린다 — 탭을 누르면 곧바로 새 화면을 그리느라 메인 스레드가 0.1~0.3초씩
 *     막히는데, 장면 고리(rAF)로 그리던 때는 그동안 렌즈가 멈췄다 튀었다. 다시 꺾을 때는 지금 장면의 스프링 값(빠르기까지)을
 *     목록에서 읽어 이어 셈한다 — 연달아 눌러도 빠르기가 안 끊긴다.
 *  ② 손가락이 닿아 있는 동안(press · follow) — 손가락을 따라야 하니 장면 고리로 CSS 변수를 쓴다(그동안은 화면이 안 바뀐다).
 * 막대는 더 키우지 않는다 — 뒤 흐림(28px)을 장면마다 다시 셈해 휴대폰에서 장면이 빠졌다.
 */
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
    /** 지금 도는 미리 셈한 애니메이션 — 시작 시각과 장면마다의 스프링 값 */
    let track: { t0: number; snaps: Snap[] } | null = null;
    let anims: Animation[] = [];

    const reduced = () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const snap = (): Snap => ({ p: pos.x, pv: pos.v, l: lift.x, lv: lift.v, s: show.x, sv: show.v });
    const load = (st: Snap) => {
      pos.x = st.p;
      pos.v = st.pv;
      lift.x = st.l;
      lift.v = st.lv;
      show.x = st.s;
      show.v = st.sv;
    };
    const liftGoal = () => (dragging ? 1 : pressed ? PRESS_LIFT : 0);

    const measure = () => {
      const b = bar.current;
      if (!b) return;
      faces = Array.from(b.querySelectorAll<HTMLElement>('[data-tab-face]'));
      vertical = b.clientHeight > b.clientWidth;
    };

    /** 지금 모양을 CSS 변수 · 아이콘 transform 으로 — 장면 고리와 애니메이션이 끝난 뒤의 자리 */
    const write = () => {
      const el = lens.current;
      if (!el) return;
      const v = visualOf(snap(), vertical, faces.length);
      el.style.setProperty('--p', v.p.toFixed(4));
      el.style.setProperty('--sx', v.sx.toFixed(4));
      el.style.setProperty('--sy', v.sy.toFixed(4));
      el.style.setProperty('--lift', v.lift.toFixed(3));
      el.style.setProperty('--fill', v.fill.toFixed(3));
      el.style.setProperty('--show', v.show.toFixed(3));
      faces.forEach((f, i) => {
        const s = v.face[i];
        f.style.transform = s > 1.0005 ? `scale(${s.toFixed(4)})` : '';
      });
    };

    /** 미리 셈한 애니메이션이 돌고 있으면 지금 장면의 스프링 값으로 돌아오고 애니메이션을 걷는다 */
    const takeOver = () => {
      if (track) {
        /* 화면에 보이는 장면 — 애니메이션의 시각으로 읽는다(메인 스레드가 막혀 있던 동안에도 합성기는 갔다) */
        const t = anims[0]?.currentTime;
        const ms = typeof t === 'number' ? t : performance.now() - track.t0;
        const i = Math.min(track.snaps.length - 1, Math.max(0, Math.round(ms / FRAME_MS)));
        load(track.snaps[i]);
        track = null;
      }
      if (anims.length) {
        /* 걷기 전에 CSS 변수를 지금 자리로 — 걷는 순간 옛 자리가 한 장면 비치지 않게 */
        write();
        anims.forEach((a) => a.cancel());
        anims = [];
      }
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    /* ② 장면 고리 — 손가락이 닿아 있는 동안 */
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
      last = now;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        step(pos, target, POS, h);
        const moving =
          Math.abs(pos.x - target) > MOVING_DIST || Math.abs(pos.v) > MOVING_SPEED;
        step(lift, dragging || moving ? 1 : liftGoal(), LIFT, h);
        step(show, showTarget, SHOW, h);
      }
      if (!dragging && near(pos, target) && near(lift, liftGoal()) && near(show, showTarget)) {
        load({ p: target, pv: 0, l: liftGoal(), lv: 0, s: showTarget, sv: 0 });
        write();
        frame = 0;
        return;
      }
      write();
      frame = requestAnimationFrame(tick);
    };
    const runFrames = () => {
      takeOver();
      if (reduced()) {
        load({ p: target, pv: 0, l: 0, lv: 0, s: showTarget, sv: 0 });
        write();
        return;
      }
      measure();
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    /* ① 미리 셈해 브라우저 애니메이션으로 */
    const play = () => {
      takeOver();
      measure();
      if (reduced()) {
        load({ p: target, pv: 0, l: 0, lv: 0, s: showTarget, sv: 0 });
        write();
        return;
      }
      const sp = { ...pos };
      const sl = { ...lift };
      const ss = { ...show };
      const goal = liftGoal();
      const snaps: Snap[] = [snap()];
      const h = 1 / 240;
      for (let f = 0; f < MAX_FRAMES; f++) {
        for (let i = 0; i < SUB; i++) {
          step(sp, target, POS, h);
          const moving =
            Math.abs(sp.x - target) > MOVING_DIST || Math.abs(sp.v) > MOVING_SPEED;
          step(sl, moving ? 1 : goal, LIFT, h);
          step(ss, showTarget, SHOW, h);
        }
        snaps.push({ p: sp.x, pv: sp.v, l: sl.x, lv: sl.v, s: ss.x, sv: ss.v });
        if (near(sp, target) && near(sl, goal) && near(ss, showTarget)) break;
      }
      snaps[snaps.length - 1] = { p: target, pv: 0, l: goal, lv: 0, s: showTarget, sv: 0 };
      const el = lens.current;
      if (!el || snaps.length < 3) {
        load(snaps[snaps.length - 1]);
        write();
        return;
      }

      /* 칸 하나의 길이(px) — 가로는 렌즈 폭(translateX 100%), 세로(패드)는 칸 64px + 사이 4px(globals.css 4.25rem) */
      const unit = vertical
        ? 4.25 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
        : el.offsetWidth;
      const vis = snaps.map((st) => visualOf(st, vertical, faces.length));
      const opts: KeyframeAnimationOptions = {
        duration: (snaps.length - 1) * FRAME_MS,
        fill: 'forwards',
      };
      const layer = (sel: string) => el.querySelector<HTMLElement>(sel);
      const out: Animation[] = [
        el.animate(
          vis.map((v) => ({
            transform: vertical
              ? `translate3d(0, ${(v.p * unit).toFixed(2)}px, 0) scale(${v.sx.toFixed(4)}, ${v.sy.toFixed(4)})`
              : `translate3d(${(v.p * unit).toFixed(2)}px, 0, 0) scale(${v.sx.toFixed(4)}, ${v.sy.toFixed(4)})`,
            opacity: v.show,
          })),
          opts
        ),
      ];
      const fill = layer('[data-lens-fill]');
      const glass = layer('[data-lens-glass]');
      const rim = layer('[data-lens-rim]');
      if (fill) out.push(fill.animate(vis.map((v) => ({ opacity: v.fill })), opts));
      if (glass) out.push(glass.animate(vis.map((v) => ({ opacity: v.lift })), opts));
      if (rim) out.push(rim.animate(vis.map((v) => ({ opacity: v.lift * 0.5 })), opts));
      faces.forEach((f, i) => {
        if (vis.every((v) => v.face[i] < 1.0005)) return;
        out.push(f.animate(vis.map((v) => ({ transform: `scale(${v.face[i].toFixed(4)})` })), opts));
      });

      const mine = { t0: performance.now(), snaps };
      track = mine;
      anims = out;
      out[0].onfinish = () => {
        if (track !== mine) return;
        load(snaps[snaps.length - 1]);
        track = null;
        write();
        anims.forEach((a) => a.cancel());
        anims = [];
      };
    };

    return {
      stop() {
        takeOver();
      },
      to(index) {
        if (index < 0) {
          if (showTarget === 0) return;
          showTarget = 0;
        } else {
          /* 같은 칸으로 다시 — 이미 그리로 가고 있다(누른 순간 한 번, 화면이 그린 뒤 effect 가 한 번 더 부른다) */
          if (index === target && showTarget === 1) return;
          takeOver();
          /* 숨어 있다가 나타나면 그 자리에서 — 0번 칸에서 미끄러져 오지 않게 */
          if (show.x < 0.05 && showTarget === 0) {
            pos.x = index;
            pos.v = 0;
          }
          target = index;
          showTarget = 1;
        }
        if (pressed || dragging) runFrames();
        else play();
      },
      follow(p) {
        const first = !dragging;
        if (first) takeOver();
        dragging = true;
        if (show.x < 0.05) {
          pos.x = p;
          pos.v = 0;
        }
        target = p;
        showTarget = 1;
        if (first || !frame) runFrames();
      },
      release(index) {
        dragging = false;
        if (index >= 0) target = index;
        else showTarget = 0;
        play();
      },
      press(on) {
        if (pressed === on) return;
        pressed = on;
        /* 손가락이 닿으면 장면 고리로(살짝 부풂). 떼면 그대로 가라앉고 — 곧 오는 click 이 to() 로 이어 받는다 */
        if (on || !track) runFrames();
      },
    };
  });

  useEffect(() => () => api.stop(), [api]);
  return api;
}
