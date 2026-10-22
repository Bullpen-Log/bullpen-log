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
import { MARK_PATH, MARK_VIEWBOX, Wordmark } from '@/components/logo';
import { splashScale } from '@/lib/brand';

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
  /*
   * 싱커로 갈 때는 판(SinkerIntro)이 곧바로 덮으니 덮이자마자 옮겨 새 틀을 그동안 받는다 — 로고 · 이름이 보이는 동안 로딩이 끝난다.
   * 끝내 안 오면 SinkerIntro 가 6초 뒤 걷는다.
   */
  window.setTimeout(() => router.push(href), dir === 'to-sinker' ? INTRO_PUSH_MS : OUT_MS);
  if (dir === 'to-sinker') return;
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
    const big = splashScale(w, window.innerWidth);
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
    /* 싱커로 오는 중 — 펴기는 시작 판(SinkerIntro)이 이름을 다 보인 뒤에 한다. 그때까지 새 틀은 숨은 채 기다린다 */
    if (html.dataset.morph === 'to-sinker-out') {
      html.dataset.morph = 'to-sinker-wait';
      return;
    }
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

/*
 * 덕아웃 → 싱커 시작 판(2026-10-22 금윤호: "싱커 진입 로고가 0.1초 뜨고, 싱커 풀네임 보여 주는 게 0.2초, 그리고 자연스럽게 진입하는 애니메이션과 함께").
 * 뿌리 레이아웃(app/layout.tsx)에 하나 — 두 틀(덕아웃 · 싱커)이 바뀌어도 이 판은 그대로 남아 한 장면으로 이어진다(예전엔 덕아웃 틀이 떨어진 뒤 빈 화면이 비쳤다).
 *   mark  판이 덮이고 가운데에 싱커 표시(S)가 이름 속 크기 그대로 뜬다(커졌다 줄지 않는다 — 2026-10-22 금윤호)
 *   name  뜨자마자 표시가 제자리(이름의 S 칸)로 옆걸음하며 INKER 가 뒤에서 밀려 나온다 — 글자 속도는 웹 · 앱 시작 연출과 같게
 *         (0.65초씩 0.075초 간격), 다 나온 풀네임은 0.2초
 *   fly   새 틀이 붙었으면(html[data-morph='to-sinker-wait'], MorphIn) 이름이 싱커 왼쪽 위 로고 자리([data-morph-logo])로 줄어들며 날아가고,
 *         날기 시작하는 그 순간부터 판이 같은 시간 동안 걷혀 뒤의 싱커 화면이 스르륵 떠오른다(html[data-morph='in'] — 위의 연출 그대로).
 *         로고 자리가 없으면(휴대폰 하위 화면) 이름은 옅어진다.
 */
const INTRO_PUSH_MS = 140;
const MARK_IN_MS = 140;
const MARK_HOLD_MS = 0;
/** 표시가 가운데 → S 칸 */
const NAME_IN_MS = 400;
/** 글자 — 표시가 거의 자리에 닿을 때부터, 시작 연출(app/globals.css app-splash-letter)과 같은 속도 */
const LETTER_AT_MS = 0;
const LETTER_MS = 650;
const LETTER_GAP_MS = 75;
const LETTER_EASE = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
const NAME_DONE_MS = LETTER_AT_MS + LETTER_GAP_MS * 4 + LETTER_MS;
const NAME_HOLD_MS = 200;
/** 로고 자리로 — 300 은 너무 빨라 원래(520)대로(금윤호 2026-10-22) */
const FLY_MS = 520;
const INTRO_SAFETY_MS = 6000;
const LETTERS = ['I', 'N', 'K', 'E', 'R'];
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function SinkerIntro() {
  const [on, setOn] = useState(false);
  const veil = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const mark = useRef<SVGSVGElement>(null);
  const row = useRef<HTMLSpanElement>(null);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);
  const running = useRef(false);

  /* html[data-morph='to-sinker-out'] 이 되면 시작 */
  useEffect(() => {
    const html = document.documentElement;
    const check = () => {
      if (html.dataset.morph === 'to-sinker-out' && !running.current) {
        running.current = true;
        setOn(true);
      }
    };
    const mo = new MutationObserver(check);
    mo.observe(html, { attributes: true, attributeFilter: ['data-morph'] });
    return () => mo.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    const w = word.current;
    const m = mark.current;
    const r = row.current;
    const v = veil.current;
    if (!w || !m || !r || !v) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    let mo: MutationObserver | null = null;
    let done = false;

    /*
     * 줄(표시 + 글자)을 옮겨 표시를 한가운데에 둔다 — 이름 칸 기준으로 잰다(이 판의 글자 크기가 화면 폭을 따라서).
     * 글자는 표시 오른쪽 가장자리에서 잘리는 칸 안에 있어 표시 뒤에 숨어 있다가 밀려 나온다(2026-10-22 금윤호 "로고 뒤에서 나오는 것처럼").
     * 칸은 줄과 같이 움직이니 줄이 왼쪽으로 가는 동안에도 늘 표시 뒤에서 나온다.
     */
    const wr = w.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const centered = `translateX(${wr.left + wr.width / 2 - (mr.left + mr.width / 2)}px)`;
    r.style.transform = centered;
    const hidden = letters.current.map((el) => (el ? `translateX(${-(el.offsetLeft + el.offsetWidth)}px)` : 'none'));
    letters.current.forEach((el, i) => {
      if (el) el.style.transform = hidden[i];
    });

    /* mark — 판이 덮이고 표시가 이름 속 크기 그대로 뜬다 */
    v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
    m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MARK_IN_MS, easing: EASE, fill: 'forwards' });

    /* name — 줄은 제자리로, 글자는 표시 뒤에서 밀려 나온다 */
    const nameAt = MARK_IN_MS + MARK_HOLD_MS;
    later(() => {
      r.animate([{ transform: centered }, { transform: 'none' }], { duration: NAME_IN_MS, easing: EASE, fill: 'forwards' });
      letters.current.forEach((el, i) =>
        el?.animate([{ transform: hidden[i] }, { transform: 'none' }], {
          duration: LETTER_MS,
          delay: LETTER_AT_MS + i * LETTER_GAP_MS,
          easing: LETTER_EASE,
          fill: 'forwards',
        })
      );
    }, nameAt);

    const finish = () => {
      if (done) return;
      done = true;
      mo?.disconnect();
      delete html.dataset.morphFly;
      running.current = false;
      setOn(false);
    };

    /* fly — 새 틀이 붙었고 이름을 다 보였으면 */
    const fly = () => {
      if (done || html.dataset.morph !== 'to-sinker-wait') return;
      mo?.disconnect();
      const target = [...document.querySelectorAll<HTMLElement>('[data-morph-logo]')].find(
        (el) => el.getBoundingClientRect().width > 0
      );
      html.dataset.morph = 'in';
      const from = w.getBoundingClientRect();
      if (target) {
        html.dataset.morphFly = '';
        const t = target.getBoundingClientRect();
        const s = t.width / from.width;
        const tx = t.left + t.width / 2 - (from.left + from.width / 2);
        const ty = t.top + t.height / 2 - (from.top + from.height / 2);
        w.animate([{ transform: 'none' }, { transform: `translate(${tx}px, ${ty}px) scale(${s})` }], {
          duration: FLY_MS,
          easing: 'cubic-bezier(0.65, 0, 0.25, 1)',
          fill: 'forwards',
        });
      } else {
        w.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.92)' }], {
          duration: FLY_MS * 0.6,
          easing: 'ease-in',
          fill: 'forwards',
        });
      }
      /* 이름이 출발하는 그 순간부터 같은 시간 동안 판을 걷는다 — 뒤의 싱커 화면이 스르륵 떠오른다 */
      v.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FLY_MS,
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
        fill: 'forwards',
      });
      later(finish, FLY_MS + 20);
      /* 판이 걷힌 뒤(finish 가 이 효과를 정리해 later 타이머는 지워진다)에도 남아야 하는 정리 — 그냥 타이머로 */
      window.setTimeout(() => {
        if (html.dataset.morph === 'in') delete html.dataset.morph;
      }, FLY_MS + IN_MS);
    };
    later(() => {
      if (html.dataset.morph === 'to-sinker-wait') fly();
      else {
        mo = new MutationObserver(fly);
        mo.observe(html, { attributes: true, attributeFilter: ['data-morph'] });
      }
    }, nameAt + NAME_DONE_MS + NAME_HOLD_MS);

    /* 끝내 안 오면(막힘 · 오류 · 앱 웹뷰처럼 MorphIn 이 없는 틀) 걷는다 */
    later(() => {
      if (done) return;
      if (html.dataset.morph?.startsWith('to-sinker')) delete html.dataset.morph;
      finish();
    }, INTRO_SAFETY_MS);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      mo?.disconnect();
    };
  }, [on]);

  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70]">
      <div ref={veil} className="absolute inset-0 bg-page" style={{ opacity: 0 }} />
      <div className="absolute inset-0 grid place-items-center">
        <span
          ref={word}
          className="text-display inline-flex items-baseline whitespace-nowrap leading-none text-ink"
          style={{ fontSize: 'min(16vw, 104px)', transformOrigin: 'center' }}
        >
          <span ref={row} className="inline-flex items-baseline">
          {/* 칸이 S 아래 막대를 기준선에 맞추고(components/logo.tsx Wordmark 와 같다), 안의 표시만 움직인다 */}
          <span className="mr-[0.05em] inline-block h-[0.794em] w-[0.798em] shrink-0 translate-y-[0.094em]">
            <svg
              ref={mark}
              viewBox={MARK_VIEWBOX}
              className="block h-full w-full fill-brand"
              style={{ opacity: 0, transformOrigin: 'center' }}
            >
              <path d={MARK_PATH} />
            </svg>
          </span>
          {/* 글자 칸 — 왼쪽(표시 쪽)만 잘라 표시 뒤에 숨긴다. 위 · 아래 · 오른쪽은 넉넉히 둬 글자가 잘리지 않게 */}
          <span className="relative inline-flex items-baseline [clip-path:inset(-0.5em_-1em_-0.5em_0)]">
            {LETTERS.map((ch, i) => (
              <span
                key={i}
                ref={(el) => {
                  letters.current[i] = el;
                }}
                className="inline-block"
              >
                {ch}
              </span>
            ))}
          </span>
          </span>
        </span>
      </div>
    </div>
  );
}
