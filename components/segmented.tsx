'use client';

import { useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  isPlainClick,
  thumbStyle,
  useSlidingThumb,
} from '@/components/use-sliding-thumb';

/**
 * 박스 안에서 하나를 고르는 줄 — 고른 칸 밑에 깔린 하늘색 표시가 옆으로 미끄러진다.
 *
 * 예전에는 테마·단위·그래프 항목·캘린더|목록·오늘|기록 같은 곳이 저마다 버튼 줄을
 * 만들고, 고른 칸의 배경색만 켜고 껐다. 옛 칸이 꺼지고 새 칸이 켜지는 두 번의
 * '뚝'이라 어디에서 어디로 옮겨 갔는지가 눈에 안 남는다. 표시를 하나만 두고 그것을
 * 옮기면 옮겨 간 길이 보인다.
 *
 * 곳마다 저마다 다르게 만들면 곡선·시간·모양이 조금씩 어긋나 한 앱처럼 보이지
 * 않는다. 그래서 한 곳에 두고, 칸 폭(같게/글자대로)·글자 크기·바탕·역할만 바깥에서
 * 고른다.
 *
 * 자리는 useSlidingThumb 가 잰다. 컨테이너가 relative 이고 칸들과 표시가 모두 그
 * 바로 안에 있어야 offsetLeft/offsetTop 이 컨테이너 기준이 된다 — 사이에 다른
 * positioned 요소를 끼우면 안 된다.
 */
export type SegmentedOption<V extends string> = {
  value: V;
  label: string;
  /** 마우스를 올렸을 때 뜨는 설명(title) */
  hint?: string;
  /** 글자 앞에 붙는 작은 그림 */
  icon?: LucideIcon;
  /**
   * 누르면 갈 주소 — role 이 navigation 일 때 칸을 링크로 그린다.
   *
   * 옮겨 가는 일 자체는 onChange 를 받은 쪽이 한다. 표시를 먼저 옮겨 두고 화면을
   * 불러오려면 둘을 한 흐름(transition)으로 묶어야 하는데, 링크가 스스로 옮겨 가면
   * 그 흐름에 끼어들 수가 없다. 주소는 새 탭으로 열기·주소 복사를 위해 둔다.
   */
  href?: string;
};

export type SegmentedProps<V extends string> = {
  /** 이 줄이 무엇을 고르는지(aria-label) */
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: readonly SegmentedOption<V>[];
  /**
   * radiogroup(radio + aria-checked) — 값을 고른다. 기본.
   * tablist(tab + aria-selected) — 같은 자리에서 보여줄 것을 고른다.
   * navigation(링크 + aria-current) — 주소로 나뉜 화면을 오간다.
   */
  role?: 'radiogroup' | 'tablist' | 'navigation';
  /** grid: 칸 폭을 모두 같게. flow: 글자 폭대로 두고 넘치면 줄바꿈. */
  layout?: 'grid' | 'flow';
  /** 글자 크기 — sm 은 설정 창처럼 촘촘한 곳, md 는 화면 위에 바로 놓이는 곳 */
  size?: 'sm' | 'md';
  /**
   * 바탕. 바깥보다 한 단계 달라야 상자로 읽힌다.
   * sunken — 흰 카드·창 안에 놓일 때, 한 단계 어두운 바탕. 기본.
   * raised — 화면 바탕 위에 바로 놓일 때, 흰 바탕.
   */
  tone?: 'sunken' | 'raised';
  /** 컨테이너에 덧붙임 */
  className?: string;
  /** 각 칸에 덧붙임 — 안쪽 여백과 반응형은 여기서 준다 */
  itemClassName?: string;
  /**
   * 이 값이 바뀌면 미끄러지던 표시를 끝자리로 보낸다. 주소로 나뉜 화면에서 서버가
   * 보내 준 진짜 값을 넘긴다 — 새 화면이 붙는 순간 표시가 제자리에 있어야, 화면
   * 전환이 끝난 뒤에 툭 건너뛰지 않는다(components/use-sliding-thumb.ts).
   */
  settleKey?: unknown;
};

/*
 * 화면에 붙었는지만 알려주는 저장소.
 *
 * 테마·단위는 서버가 기본값으로 그리고, 붙은 뒤 진짜 값으로 다시 그린다
 * (useSyncExternalStore). 그 첫 그림에 표시를 놓으면 훅은 그것을 '처음 자리'로
 * 알고, 곧이어 진짜 값으로 바뀌는 것을 '옮겨 감'으로 여겨 화면이 뜨자마자
 * 기본값 칸에서 미끄러져 온다. 붙고 난 뒤의 값에만 표시를 놓으면 그 자리가 처음
 * 자리라 움직이지 않는다. 서버를 거치지 않고 그려질 때(페이지 안 이동)는 처음부터
 * true 라 늦어지지 않는다.
 */
const subscribeNever = () => () => {};
const isHydrated = () => true;
const isServer = () => false;

export function Segmented<V extends string>({
  label,
  value,
  onChange,
  options,
  role = 'radiogroup',
  layout = 'grid',
  size = 'sm',
  tone = 'sunken',
  className = '',
  itemClassName = '',
  settleKey,
}: SegmentedProps<V>) {
  const hydrated = useSyncExternalStore(subscribeNever, isHydrated, isServer);
  /*
   * ref 와 자리 값을 갈라 받는다. 한 객체로 들고 다니면 React 컴파일러가 "그리는
   * 동안 ref 를 읽는다"고 보아 막는다 — 자리 값만 그리는 데 쓰고, ref 는 키보드
   * 처리(이벤트 안)에서만 만진다.
   */
  const { containerRef, thumbRef, box, visible, animate } =
    useSlidingThumb<HTMLDivElement>(hydrated ? value : null, { settleKey });

  const links = role === 'navigation';
  const itemRole = role === 'tablist' ? 'tab' : 'radio';
  /*
   * 고른 칸만 Tab 으로 닿고(roving tabindex), 나머지는 화살표로 옮긴다. 값이 어느
   * 칸과도 안 맞으면 첫 칸을 닿게 해 둔다 — 안 그러면 키보드로 아예 못 들어온다.
   * 링크 줄은 그러지 않는다 — 링크는 하나하나 Tab 으로 닿는 것이 기본이다.
   */
  const hasSelected = options.some((o) => o.value === value);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = options[next].value;
    onChange(target);
    containerRef.current
      ?.querySelector<HTMLButtonElement>(`[data-thumb-key="${CSS.escape(target)}"]`)
      ?.focus();
  }

  /* 새 탭으로 여는 누름은 브라우저에 맡기고, 이 화면에서 옮겨 가는 누름만 받는다 */
  function follow(event: MouseEvent<HTMLAnchorElement>, next: V) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onChange(next);
  }

  const text = size === 'md' ? 'text-sm' : 'text-xs';
  const bg = tone === 'raised' ? 'bg-surface' : 'bg-surface-2';

  return (
    <div
      ref={containerRef}
      role={links ? 'navigation' : role}
      aria-label={label}
      className={`relative gap-1 rounded-xl border border-line ${bg} p-1 ${
        layout === 'grid' ? 'grid' : 'flex flex-wrap'
      } ${className}`}
      style={
        layout === 'grid'
          ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {/*
        data-thumb — 테마를 바꾸는 0.26초 동안 globals.css 가 모든 요소의 transition 을
        색 계열로만 못 박는데, 이 표시만은 거기서 빠진다. 테마 고르개의 표시가 옮겨
        가는 순간이 늘 그 안이라, 안 빼면 미끄러지지 않고 '뚝' 건너뛴다.
      */}
      <span
        ref={thumbRef}
        data-thumb
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 rounded-lg bg-sky"
        style={thumbStyle({ box, visible, animate })}
      />
      {options.map((option, index) => {
        const selected = option.value === value;
        const Icon = option.icon;
        /*
         * 칸은 relative 라 표시 위에 그려진다. 그래서 어느 칸에도 hover 배경을
         * 주지 않는다 — 안 고른 칸에만 주어도, 마우스를 올린 채 누르는 순간 그
         * 칸이 고른 칸이 되며 배경이 빠지는데, transition-colors 때문에 불투명한
         * 그 배경이 0.2초에 걸쳐 옅어지며 미끄러져 들어오는 표시를 덮어 뿌옇게
         * 보인다. 체크인의 간편|상세 알약처럼 글자색만 진해지게 둔다.
         *
         * 표시가 아직 놓이기 전(서버 그림·숨은 창)에는 고른 글자를 흰색 대신
         * 진한 색으로 둔다. 흰 글자 밑에 표시가 없으면 글자가 안 보인다.
         */
        const cls = `relative flex items-center justify-center gap-1.5 rounded-lg ${text} font-medium whitespace-nowrap transition-colors duration-200 ${
          selected ? (visible ? 'text-white' : 'text-ink') : 'text-muted hover:text-ink'
        } ${itemClassName}`;
        const face = (
          <>
            {Icon ? <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
            {option.label}
          </>
        );

        if (links && option.href) {
          return (
            <Link
              key={option.value}
              href={option.href}
              aria-current={selected ? 'page' : undefined}
              title={option.hint}
              data-thumb-key={option.value}
              onClick={(e) => follow(e, option.value)}
              className={cls}
            >
              {face}
            </Link>
          );
        }

        return (
          <button
            key={option.value}
            type="button"
            role={itemRole}
            aria-checked={itemRole === 'radio' ? selected : undefined}
            aria-selected={itemRole === 'tab' ? selected : undefined}
            tabIndex={selected || (!hasSelected && index === 0) ? 0 : -1}
            title={option.hint}
            data-thumb-key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => move(e, index)}
            className={cls}
          >
            {face}
          </button>
        );
      })}
    </div>
  );
}
