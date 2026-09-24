'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';

/** 고른 것의 자리 — 컨테이너 기준 px */
export type ThumbBox = { x: number; y: number; w: number; h: number };

/**
 * 고른 것 밑에 깔려 미끄러지는 표시(알약·동그라미)의 자리를 잰다.
 *
 * 예전에는 고른 칸마다 배경색을 켜고 껐다. 그러면 옛 칸이 꺼지고 새 칸이 켜지는
 * 두 번의 '뚝'이 있어서, 어디에서 어디로 옮겨 갔는지가 눈에 안 남는다. 표시를
 * 하나만 두고 그것을 옮기면 옮겨 간 길이 보인다 (체크인의 간편|상세 고르개가
 * 먼저 이렇게 하고 있었다).
 *
 * 자리는 CSS 로 셈하지 않고 잰다. 칸 폭이 같으면 idx × 100% 로도 되지만, 글자
 * 길이대로 폭이 다른 줄(그래프 항목)이나 두 줄로 늘어선 격자(도크)에서는 안 맞는다.
 * 재면 어느 쪽이든 같다.
 *
 * 쓰는 법:
 *   - 컨테이너에 containerRef 를 달고 position: relative 로 둔다
 *   - 고를 수 있는 것마다 data-thumb-key="값" 을 단다
 *   - 표시는 컨테이너의 첫 자식으로 absolute 로 두고 thumbRef 와 thumbStyle() 을 입힌다.
 *     data-thumb 도 단다 — 테마를 바꾸는 동안 모든 transition 을 색 계열로 못
 *     박는 globals.css 의 규칙에서 표시만 빠지는 표시다.
 *
 * 처음 자리를 잡을 때는 움직이지 않는다(animate=false). 창이 열리며 처음 그려질
 * 때 화면 왼쪽 위(0,0)에서 미끄러져 오면 어색하다. 그다음부터만 움직인다.
 *
 * 컨테이너가 화면에 없을 때(닫힌 창 안, display:none, 접혀서 폭이 0)는 잴 수 없다.
 * 그때는 숨기고, ResizeObserver 가 나중에 자리가 생기는 것을 보면 다시 잰다.
 * 그 첫 등장도 '처음 자리'라 움직이지 않는다.
 *
 * 화면을 옮기는 전환(View Transition)과 겹칠 때 쓰는 두 가지.
 *
 * 전환이 도는 동안 브라우저는 찍어 둔 그림만 보여주고 진짜 화면은 가려 둔다. 그래서
 * 그 사이에 CSS transition 으로 미끄러지는 것은 보이지 않고, 찍힌 순간의 자리에 멈춘
 * 채로 있다가 전환이 끝나면 툭 건너뛴다.
 *
 *   instant    이번에 바뀐 자리로는 미끄러지지 않고 곧장 옮긴다. 주소가 바뀌어서
 *              옮겨 가는 경우다(뒤로 가기 같은) — 그때는 표시에 이름표를 달아 두면
 *              전환이 옛 자리에서 새 자리로 직접 옮겨 준다(globals.css 의 nav-thumb).
 *   settleKey  이 값이 바뀌는 순간 미끄러지던 것을 끝자리로 보낸다. 누르자마자
 *              미끄러지기 시작했는데 새 화면이 그보다 빨리 와서 전환이 시작되는
 *              경우다 — 새 모습이 끝자리로 찍혀야 전환이 거기까지 마저 옮겨 주고,
 *              끝난 뒤에 건너뛰지 않는다.
 */
export function useSlidingThumb<T extends HTMLElement>(
  activeKey: string | null,
  { instant = false, settleKey }: { instant?: boolean; settleKey?: unknown } = {}
) {
  const containerRef = useRef<T>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<{
    box: ThumbBox | null;
    visible: boolean;
    animate: boolean;
  }>({ box: null, visible: false, animate: false });
  /* 지금 화면에 자리를 잡고 있는가 — 잡고 있을 때 옮기는 것만 움직인다 */
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const target =
      activeKey == null
        ? null
        : root.querySelector<HTMLElement>(
            `[data-thumb-key="${CSS.escape(activeKey)}"]`
          );

    const measure = () => {
      if (!target || root.offsetWidth === 0) {
        placed.current = false;
        setState((s) => (s.visible ? { ...s, visible: false, animate: false } : s));
        return;
      }
      const box: ThumbBox = {
        x: target.offsetLeft,
        y: target.offsetTop,
        w: target.offsetWidth,
        h: target.offsetHeight,
      };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const animate = placed.current && !reduce && !instant;
      placed.current = true;
      setState((s) =>
        s.visible && s.box && sameBox(s.box, box) && s.animate === animate
          ? s
          : { box, visible: true, animate }
      );
    };

    measure();

    /*
     * 컨테이너와 고른 칸 둘 다 지켜본다. 글꼴이 늦게 와서 글자 폭이 바뀌면 칸만
     * 넓어지고 컨테이너는 그대로일 수 있다.
     */
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    if (target) ro.observe(target);
    return () => ro.disconnect();
  }, [activeKey, instant]);

  /*
   * layout effect 라 새 화면이 붙는 커밋 안에서 돈다 — 브라우저가 전환의 새 모습을
   * 찍기 전이다. 처음 붙을 때도 한 번 도는데, 그때는 움직이는 것이 없어 아무 일도
   * 하지 않는다.
   */
  useLayoutEffect(() => {
    thumbRef.current?.getAnimations().forEach((a) => a.finish());
  }, [settleKey]);

  return { containerRef, thumbRef, ...state };
}

function sameBox(a: ThumbBox, b: ThumbBox) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/*
 * 미끄러지는 시간과 곡선.
 *
 * 달력이 넘어갈 때와 같은 곡선(0.2, 0, 0, 1)이다 — 천천히 출발해 길게 멈춘다.
 * 출발이 급하면 '튄다'로 읽힌다. 0.26초는 상단 바 끝에서 끝(세 칸)까지 가는
 * 거리에 맞췄다. 화면 전환이 옮길 때도 같은 값을 쓴다(globals.css 의 nav-thumb).
 */
const SLIDE = '260ms cubic-bezier(0.2, 0, 0, 1)';

/** 표시에 입힐 인라인 스타일. 자리가 없으면 숨긴다. */
export function thumbStyle({
  box,
  visible,
  animate,
}: {
  box: ThumbBox | null;
  visible: boolean;
  animate: boolean;
}): CSSProperties {
  if (!box) return { opacity: 0 };
  return {
    transform: `translate(${box.x}px, ${box.y}px)`,
    width: box.w,
    height: box.h,
    opacity: visible ? 1 : 0,
    transition: animate
      ? `transform ${SLIDE}, width ${SLIDE}, height ${SLIDE}, opacity 150ms ease-out`
      : 'opacity 150ms ease-out',
  };
}

/**
 * 이 화면에서 곧장 옮겨 가는 누름인가.
 *
 * 표시는 누르는 즉시 옮긴다 — 화면이 오기 전에 눌렸다는 것을 알려 주려고. 그런데
 * Ctrl·⌘·Shift 를 누른 채 누르거나 가운데 단추로 누르면 새 탭·새 창에서 열리고
 * 이 화면은 그대로다. 그때 표시만 옮겨 가면 보고 있는 화면과 표시가 어긋난 채
 * 남는다. 링크는 제 onClick 을 먼저 부른 뒤에야 이것을 가리므로, 부르는 쪽에서
 * 먼저 걸러야 한다.
 *
 * 리액트 이벤트든 문서에 직접 건 이벤트든 받는다 — 쓰는 칸이 같다.
 */
export function isPlainClick(
  e: Pick<
    MouseEvent,
    'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
  >
) {
  return (
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}
