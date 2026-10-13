'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { NAV_ICONS } from '@/components/nav-icons';
import { LinkPending } from '@/components/link-pending';
import { useSpeedUnit } from '@/components/use-units';
import { formatSpeed } from '@/lib/units';
import { haptic } from '@/lib/haptics';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import type { HighlightChart } from '@/lib/report/highlights';
import { MiniChart } from './highlights';

/**
 * 홈 요약 칸 — 링 밑, 예전 영양 카드 자리(2026-10-13 사용자: "영양이 있는 자리를 뉴스칸으로").
 *
 * 우리끼리는 '뉴스'라 부르지만 화면에는 그 말을 쓰지 않는다(사용자: "뉴스라는 단어를 넣을 필요는 없어, 우리가 부르는
 * 것일 뿐"). 그날 · 최근 정보를 한 장씩 3초마다 돌려 보인다 — 예전 홈 밑의 '하이라이트'(투구량 · 부하 · 구속 · 운동 ·
 * 체크인)와 영양 한 줄 · 오늘 운동이 여기 들어왔다. 장을 누르면 그 탭(분석 · 영양 · 트레이닝 · 그날 기록)으로 간다.
 *
 * 움직임: 지금 장은 왼쪽으로 밀려 나가고 다음 장은 오른쪽에서 들어온다. 오른쪽 위 ‹ › 로 앞뒤, 손가락 화면에서는
 * 쓸어서 — 손가락이 움직인 만큼 따라오고(바로 넘어가지 않는다), 놓으면 폭의 1/4 을 넘었거나 빠르면 넘어가고 아니면 되돌아온다.
 * 손가락이 닿아 있는 동안 · 커서를 얹은 동안 · 탭이 숨어 있는 동안은 돌리지 않는다. 움직임 줄이기면 미끄러지지 않고 바뀐다.
 *
 * 누르기와 쓸기를 가른다 — 6px 넘게 움직였으면 손을 떼도 링크가 열리지 않는다(click 을 막는다).
 */

export type FeedItem = {
  key: string;
  /** 위 작은 이름표(영양 · 투구량 · 오늘 운동 …) */
  label: string;
  /** 문장. 구속은 {speed} · {diff} 자리로 — 단위(km/h · mph)는 이 기기 설정으로 */
  text: string;
  /** 밑 작은 줄(탄 +30g · 단 충분 …) */
  sub?: string;
  speed?: number;
  diff?: number;
  /** 누르면 갈 곳. 없으면 누르지 않는 장 */
  href: string | null;
  /** 안전에 관한 것 — 경고색 */
  warn?: boolean;
  chart?: HighlightChart | null;
  /** 이름표 옆 아이콘(nav-icons 열쇠) */
  icon?: keyof typeof NAV_ICONS;
};

/** 한 장을 보이는 시간 */
const DWELL_MS = 3000;
/** 넘어가는 시간 */
const SLIDE_MS = 320;
/** 놓았을 때 넘어가는 기준 — 폭의 이만큼 */
const SNAP_RATIO = 0.25;
/** 빠르게 튕기면 짧게 밀어도 넘어간다(px/ms) */
const FLICK_SPEED = 0.45;
/** 이보다 움직였으면 누름이 아니라 쓸기 */
const TAP_SLOP = 6;

export function FeedCard({ items }: { items: FeedItem[] }) {
  const unit = useSpeedUnit();
  const n = items.length;
  const [index, setIndex] = useState(0);
  /* 손가락이 끌고 있는 거리(px). null 이면 안 끌고 있다 */
  const [drag, setDrag] = useState<number | null>(null);
  /* 넘어가는 중 — 방향(+1 다음 · −1 이전)과 함께. 끝나면 index 를 바꾸고 제자리로 */
  const [moving, setMoving] = useState<1 | -1 | null>(null);
  const [paused, setPaused] = useState(false);
  /*
   * 넘어간 직후 한두 장면 — 트랙을 제자리로 돌릴 때 움직임을 끈다. 예전엔 돌아오는 것도 미끄러져 다음 다음 장이 비쳤다가
   * 되돌아와(2026-10-13 김민 "오류가 있고 ‹ › 를 눌러도 안 넘어간다") 넘어가지 않은 것처럼 보였다.
   */
  const [instant, setInstant] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; t: number; w: number; id: number } | null>(null);
  const swiped = useRef(false);
  const reduce = useReducedMotion();

  const at = useCallback((i: number) => ((i % n) + n) % n, [n]);

  /* 넘기기 — 움직임 줄이기면 바로, 아니면 밀어 보낸 뒤 index 를 바꾼다 */
  const go = useCallback(
    (dir: 1 | -1) => {
      if (n < 2 || moving || instant) return;
      if (reduce) {
        setIndex((i) => at(i + dir));
        return;
      }
      setMoving(dir);
    },
    [n, moving, instant, reduce, at]
  );

  /* 밀어 보내기가 끝나면 index 를 옮기고 트랙을 제자리로(transition 없이 — 같은 그림이라 튀지 않는다) */
  useEffect(() => {
    if (moving == null) return;
    const t = window.setTimeout(() => {
      setIndex((i) => at(i + moving));
      setMoving(null);
      setInstant(true);
    }, SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [moving, at]);

  /* 제자리로 돌린 그림이 한 번 그려진 뒤(두 장면) 다시 움직일 수 있게 */
  useEffect(() => {
    if (!instant) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setInstant(false));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [instant]);

  /* 3초마다 다음 장 — 끌거나 커서를 얹거나 탭이 숨어 있으면 쉰다 */
  useEffect(() => {
    if (n < 2 || paused || drag != null || moving != null) return;
    let id = 0;
    const tick = () => {
      if (document.visibilityState === 'visible') go(1);
    };
    id = window.setInterval(tick, DWELL_MS);
    return () => window.clearInterval(id);
  }, [n, paused, drag, moving, go]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (n < 2 || moving != null) return;
    /* 마우스 왼쪽 단추 · 손가락 · 펜만 */
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const w = frame.current?.clientWidth ?? 1;
    press.current = { x: e.clientX, t: e.timeStamp, w, id: e.pointerId };
    swiped.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    if (drag == null) {
      if (Math.abs(dx) < TAP_SLOP) return;
      swiped.current = true;
      /* 쓸기로 정해졌다 — 포인터를 붙들어 손가락이 칸 밖으로 나가도 따라온다 */
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 붙들 수 없는 포인터(이미 떼었거나 합성 이벤트) — 따라오기는 그대로 한다 */
      }
    }
    /* 끝에서 더 당기면 고무줄처럼 — 한 장뿐일 때는 안 끌린다(위에서 막음) */
    setDrag(Math.max(-p.w, Math.min(p.w, dx)));
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (drag == null) return;
    const dt = Math.max(1, e.timeStamp - p.t);
    const speed = Math.abs(drag) / dt;
    const far = Math.abs(drag) > p.w * SNAP_RATIO || speed > FLICK_SPEED;
    setDrag(null);
    if (far) {
      haptic('selection');
      go(drag < 0 ? 1 : -1);
    }
  };

  if (n === 0) return null;

  const item = items[index];
  const prev = items[at(index - 1)];
  const next = items[at(index + 1)];
  /* 트랙의 자리 — 끌면 그만큼, 넘어가는 중이면 한 장만큼, 아니면 제자리 */
  const offset =
    drag != null
      ? `${drag}px`
      : moving === 1
        ? '-100%'
        : moving === -1
          ? '100%'
          : '0px';
  const trackStyle: CSSProperties = {
    transform: `translate3d(${offset},0,0)`,
    transition:
      drag != null || reduce || instant
        ? 'none'
        : `transform ${SLIDE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
  };

  return (
    <Card
      className="relative overflow-hidden p-0"
      /*
       * 커서를 얹은 동안만 쉰다 — 진짜 마우스만. 아이폰은 누를 때 mouseenter 를 흉내 내고 mouseleave 는 안 보내
       * ‹ › 를 한 번 누르면 자동 넘김이 영영 멈췄다.
       */
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setPaused(false)}
    >
      {/*
       * 위 줄 — 왼쪽 이름표(장마다 바뀜), 오른쪽 ‹ ›. 장이 하나면 단추를 안 낸다.
       * 높이는 예전 영양 카드보다 조금 길게(사용자 "하단 길이를 조금만 늘려줘") — 휴대폰 약 11.1rem · PC 약 8.6rem.
       */}
      <div className="flex items-center gap-1.5 px-(--block-pad) pt-(--block-pad)">
        <FeedLabel item={item} />
        {n > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="이전"
              className="flex h-8 w-8 items-center justify-center rounded-full text-line-strong transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2 desk:h-7 desk:w-7"
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="다음"
              className="flex h-8 w-8 items-center justify-center rounded-full text-line-strong transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2 desk:h-7 desk:w-7"
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>

      {/*
       * 장 세 개(이전 · 지금 · 다음)를 나란히 두고 트랙을 민다. 세로 스크롤은 그대로(touch-action: pan-y) —
       * 가로로 6px 넘게 움직여야 쓸기로 친다.
       */}
      <div
        ref={frame}
        className="relative h-[7.75rem] select-none touch-pan-y desk:h-[5.75rem]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
        aria-live="polite"
        aria-atomic
      >
        <div className="absolute inset-0 flex" style={trackStyle}>
          {n > 1 && <FeedSlide item={prev} unit={unit} ghost offset={-1} />}
          <FeedSlide item={item} unit={unit} offset={0} />
          {n > 1 && <FeedSlide item={next} unit={unit} ghost offset={1} />}
        </div>
      </div>
    </Card>
  );
}

function FeedLabel({ item }: { item: FeedItem }) {
  const Icon = item.icon ? NAV_ICONS[item.icon] : null;
  const tone = item.warn ? 'text-warn' : 'text-sky';
  return (
    <span className={`flex items-center gap-1.5 ${tone}`}>
      {Icon && <Icon aria-hidden className="h-4 w-4" strokeWidth={2.25} />}
      <span className="text-[15px] font-semibold">{item.label}</span>
    </span>
  );
}

/**
 * 한 장. 이전 · 다음 장(ghost)은 화면 밖에 있어 읽기 프로그램 · 탭 키에서 뺀다(aria-hidden · tabIndex −1).
 */
function FeedSlide({
  item,
  unit,
  ghost = false,
  offset,
}: {
  item: FeedItem;
  unit: ReturnType<typeof useSpeedUnit>;
  ghost?: boolean;
  offset: -1 | 0 | 1;
}) {
  const text = item.text
    .replace('{speed}', formatSpeed(item.speed, unit) ?? '')
    .replace('{diff}', formatSpeed(item.diff, unit) ?? '');
  const face = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[17px] leading-snug font-semibold break-keep ${
            item.warn ? 'text-warn' : 'text-ink'
          }`}
        >
          {text}
        </span>
        {item.sub && (
          <span className="mt-1.5 block text-[13px] leading-snug text-muted break-keep">
            {item.sub}
          </span>
        )}
      </span>
      {item.chart && <MiniChart chart={item.chart} warn={!!item.warn} />}
      {item.href && (
        <LinkPending className="h-4 w-4 shrink-0 text-line-strong">
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-line-strong" />
        </LinkPending>
      )}
    </>
  );
  const cls =
    'absolute inset-y-0 flex w-full items-center gap-3 px-(--block-pad) pb-(--block-pad)';
  const style: CSSProperties = { left: `${offset * 100}%` };
  if (item.href) {
    return (
      <Link
        href={item.href}
        transitionTypes={
          item.href.startsWith('/pitch-log/') ? OPEN_POPUP_TYPES : undefined
        }
        className={`${cls} transition-opacity hover:opacity-80`}
        style={style}
        aria-hidden={ghost || undefined}
        tabIndex={ghost ? -1 : undefined}
        draggable={false}
      >
        {face}
      </Link>
    );
  }
  return (
    <div className={cls} style={style} aria-hidden={ghost || undefined}>
      {face}
    </div>
  );
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}
