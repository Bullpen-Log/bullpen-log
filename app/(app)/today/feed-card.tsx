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
import { buzz, haptic } from '@/lib/haptics';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import type { FeedItem, FeedVariant } from '@/lib/report/feed-items';
import { OpenCheckinButton } from '@/components/notice-bell';
import { MiniChart } from './highlights';

export type { FeedItem } from '@/lib/report/feed-items';

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

/** 한 장을 보이는 시간 — 기록 없음 장은 짧게 */
const DWELL_MS = 3000;
const DWELL_NONE_MS = 2000;
/** ‹ › · 점 · 쓸기로 직접 넘긴 뒤 자동 넘김을 쉬는 시간(2026-10-14 사용자 계획) */
const MANUAL_REST_MS = 10_000;
/** 넘어가는 시간 */
const SLIDE_MS = 320;
/**
 * 장 안의 말을 바꾸는 박자 — 장이 이만큼 넘어갈 때마다(자동 · ‹ › · 점 · 쓸기 모두) 다음 라운드. 2026-10-14 사용자: "뜨는 순서는
 * 규칙적으로, 그 안의 정보만 랜덤, 바뀌는 조건은 세 장이 지났을 때".
 */
const ROUND_EVERY = 3;

/** 후보 차례 — [0](기본 · 하이라이트 · 통증)은 첫 라운드에 고정, 나머지를 섞는다(Fisher–Yates). 같은 말이 연달아 안 나온다 */
function shuffledOrders(items: FeedItem[]) {
  return items.map((it) => {
    const o = it.variants.map((_, j) => j);
    for (let i = o.length - 1; i > 1; i--) {
      const j = 1 + Math.floor(Math.random() * i);
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  });
}
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
  /* 직접 넘긴 때(이벤트 timeStamp — performance.now 기준) — 그 뒤 MANUAL_REST_MS 동안 자동 넘김을 쉰다 */
  const manualAt = useRef(0);
  /*
   * 장마다 어떤 말을 보일지 — orders[i] 는 i번째 장의 후보 차례, round 는 지금 라운드(넘어간 횟수 ÷ ROUND_EVERY).
   * 보고 있는 장은 그 장에 들어올 때의 라운드(seen)를 쓴다 — 라운드가 바뀌어도 눈앞의 글은 안 바뀌고, 다음에 들어오는 장부터 새 말.
   */
  const [orders, setOrders] = useState(() =>
    items.map((it) => it.variants.map((_, j) => j))
  );
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState<number[]>(() => items.map(() => 0));
  const advances = useRef(0);
  const variantOf = (i: number, landed: boolean): FeedVariant => {
    const it = items[i];
    const o = orders[i] ?? [];
    const r = landed ? (seen[i] ?? 0) : round;
    return it.variants[o[r % Math.max(1, o.length)] ?? 0] ?? it.variants[0];
  };
  /* 처음 그릴 때는 [0](기본) — 그린 뒤 바로 섞는다(그리는 중엔 무작위를 안 쓴다; 탭이 숨어 있어도 돌게 setTimeout) */
  useEffect(() => {
    const id = window.setTimeout(() => setOrders(shuffledOrders(items)), 0);
    return () => window.clearTimeout(id);
  }, [items]);

  const at = useCallback((i: number) => ((i % n) + n) % n, [n]);

  /* 한 장 넘어감을 센다 — ROUND_EVERY 마다 다음 라운드. 돌려주는 값은 넘어간 뒤의 라운드 */
  const bump = useCallback(() => {
    advances.current += 1;
    if (advances.current % ROUND_EVERY === 0) {
      setRound(round + 1);
      return round + 1;
    }
    return round;
  }, [round]);
  const land = useCallback((i: number, r: number) => {
    setIndex(i);
    setSeen((s) => (s[i] === r ? s : s.map((v, k) => (k === i ? r : v))));
  }, []);

  /* 넘기기 — 움직임 줄이기면 바로, 아니면 밀어 보낸 뒤 index 를 바꾼다 */
  const go = useCallback(
    (dir: 1 | -1) => {
      if (n < 2 || moving || instant) return;
      const r = bump();
      if (reduce) {
        land(at(index + dir), r);
        return;
      }
      setMoving(dir);
    },
    [n, moving, instant, reduce, at, index, bump, land]
  );

  /* 점을 눌러 그 장으로 — 이웃이면 밀어 보내고, 멀면 미끄러짐 없이 바로 바꾼다 */
  const jumpTo = (i: number, at: number) => {
    if (i === index || moving != null || instant) return;
    buzz(10);
    /* 때는 이벤트의 시각(performance.now 와 같은 기준) — 그리는 중에 시계를 읽지 않는다 */
    manualAt.current = at;
    const d = (((i - index) % n) + n) % n;
    if (d === 1) go(1);
    else if (d === n - 1) go(-1);
    else {
      land(i, bump());
      setInstant(true);
    }
  };

  /* 밀어 보내기가 끝나면 index 를 옮기고 트랙을 제자리로(transition 없이 — 같은 그림이라 튀지 않는다) */
  useEffect(() => {
    if (moving == null) return;
    const t = window.setTimeout(() => {
      land(at(index + moving), round);
      setMoving(null);
      setInstant(true);
    }, SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [moving, at, index, round, land]);

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

  /*
   * 다음 장으로 — 끌거나 커서를 얹거나 탭이 숨어 있으면 쉰다. 기록 없음 장은 2초, 직접 넘긴 뒤에는 10초 쉬었다가.
   * 장이 바뀔 때마다 타이머를 새로 건다(index 의존) — 직접 넘겨도 그 장을 꽉 채워 본다.
   */
  useEffect(() => {
    if (n < 2 || paused || drag != null || moving != null) return;
    const dwell = items[index]?.tone === 'none' ? DWELL_NONE_MS : DWELL_MS;
    const rest = Math.max(0, manualAt.current + MANUAL_REST_MS - performance.now());
    const id = window.setTimeout(
      () => {
        if (document.visibilityState === 'visible') go(1);
      },
      Math.max(dwell, rest)
    );
    return () => window.clearTimeout(id);
  }, [n, paused, drag, moving, go, index, items]);

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
      manualAt.current = e.timeStamp;
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
       * 높이는 2026-10-14 2판에서 더 길게(사용자 "하단 길이를 늘리고 정보를 한 줄 더") — 장 9.75rem · PC 7rem, 셋째 줄과 큰 그래프 자리.
       */}
      <div className="flex items-center gap-1.5 px-(--block-pad) pt-(--block-pad)">
        {/* 이름표는 넘어가기 시작할 때 바로 다음 장 것으로 — 밀기가 끝난 뒤 바꾸면 한 박자 늦었다(2026-10-13 김민) */}
        <FeedLabel
          item={moving != null ? items[at(index + moving)] : item}
          warn={
            moving != null
              ? !!variantOf(at(index + moving), false).warn
              : !!variantOf(index, true).warn
          }
        />
        {/* ‹ › 는 PC 만 — 휴대폰은 오른쪽 아래 점으로(손가락에 너무 작았다) */}
        {n > 1 && (
          <span className="ml-auto hidden items-center gap-1.5 desk:flex">
            <button
              type="button"
              onClick={(e) => {
                manualAt.current = e.timeStamp;
                go(-1);
              }}
              aria-label="이전"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2/70 text-muted transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 active:bg-surface-2"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                manualAt.current = e.timeStamp;
                go(1);
              }}
              aria-label="다음"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2/70 text-muted transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 active:bg-surface-2"
            >
              <ChevronRight aria-hidden className="h-5 w-5" strokeWidth={2.5} />
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
        className="relative h-[9.75rem] select-none touch-pan-y desk:h-[7rem]"
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
          {n > 1 && (
            <FeedSlide
              item={prev}
              variant={variantOf(at(index - 1), false)}
              unit={unit}
              ghost
              offset={-1}
            />
          )}
          <FeedSlide
            item={item}
            variant={variantOf(index, true)}
            unit={unit}
            offset={0}
          />
          {n > 1 && (
            <FeedSlide
              item={next}
              variant={variantOf(at(index + 1), false)}
              unit={unit}
              ghost
              offset={1}
            />
          )}
        </div>
      </div>
      {/*
       * 점 쪽수 — 오른쪽 아래. 지금 장은 긴 파란 점, 누르면 그 장으로(2026-10-14 사용자: "몇 개 있는지 · 어디쯤인지").
       * 넘어가는 중에는 다음 장의 점이 먼저 길어진다(이름표와 같은 박자).
       */}
      {n > 1 && (
        <div
          role="tablist"
          aria-label={`${n}장 중 ${index + 1}번째`}
          className="absolute right-(--block-pad) bottom-2 flex items-center"
        >
          {items.map((it, i) => {
            const on = i === (moving != null ? at(index + moving) : index);
            return (
              <button
                key={it.key}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${i + 1}번째 장 · ${it.label}`}
                onClick={(e) => jumpTo(i, e.timeStamp)}
                className="flex h-8 w-6 items-center justify-center"
              >
                <span
                  className={`block h-2 rounded-full transition-[width,background-color] duration-300 ease-out ${
                    on ? 'w-5 bg-sky' : 'w-2 bg-ink/20'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function FeedLabel({ item, warn }: { item: FeedItem; warn: boolean }) {
  const Icon = item.icon ? NAV_ICONS[item.icon] : null;
  const tone = warn ? 'text-warn' : 'text-sky';
  return (
    <span className={`flex items-center gap-1.5 ${tone}`}>
      {Icon && <Icon aria-hidden className="h-4 w-4" strokeWidth={2.25} />}
      <span className="text-[15px] font-semibold">{item.label}</span>
      {item.tone === 'past' && (
        <span className="rounded-full bg-ink/6 px-1.5 py-0.5 text-[10px] font-medium text-muted">
          지난 기록
        </span>
      )}
    </span>
  );
}

/**
 * 한 장. 이전 · 다음 장(ghost)은 화면 밖에 있어 읽기 프로그램 · 탭 키에서 뺀다(aria-hidden · tabIndex −1).
 */
function FeedSlide({
  item,
  variant: v,
  unit,
  ghost = false,
  offset,
}: {
  item: FeedItem;
  /** 이 라운드에 보일 말(item.variants 가운데 하나) */
  variant: FeedVariant;
  unit: ReturnType<typeof useSpeedUnit>;
  ghost?: boolean;
  offset: -1 | 0 | 1;
}) {
  const warn = !!v.warn;
  const text = v.text
    .replace('{speed}', formatSpeed(v.speed, unit) ?? '')
    .replace('{diff}', formatSpeed(v.diff, unit) ?? '');
  const face = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-lg leading-snug font-semibold break-keep ${
            warn ? 'text-warn' : item.tone === 'none' ? 'text-muted' : 'text-ink'
          }`}
        >
          {text}
        </span>
        {/* 기록 없음 장의 밑줄은 '남기러 가기' 알약 — 무엇을 적을 수 있는지 알려 주는 안내 */}
        {v.sub && item.tone === 'none' ? (
          <span className="mt-2 inline-flex min-h-7 items-center rounded-full border border-dashed border-line-strong px-2.5 text-xs font-medium text-sky">
            {v.sub}
          </span>
        ) : (
          v.sub && (
            <span className="mt-1.5 block text-[13px] leading-snug text-muted break-keep">
              {v.sub}
            </span>
          )
        )}
        {/* 셋째 줄 — 정보 한 줄 더(2026-10-14 사용자: "한 개만 정보를 더") */}
        {v.detail && (
          <span className="mt-1 block text-xs leading-snug text-muted/80 break-keep">
            {v.detail}
          </span>
        )}
      </span>
      {v.chart && <MiniChart chart={v.chart} warn={warn} size="lg" />}
      {item.href && (
        <LinkPending className="h-4 w-4 shrink-0 text-line-strong">
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-line-strong" />
        </LinkPending>
      )}
    </>
  );
  /* 휴대폰은 밑에 점 쪽수 자리(pb-8) */
  const cls =
    'absolute inset-y-0 flex w-full items-center gap-3 px-(--block-pad) pb-8 desk:pb-(--block-pad)';
  const style: CSSProperties = { left: `${offset * 100}%` };
  if (item.checkin && !item.href) {
    return (
      <OpenCheckinButton
        className={`${cls} text-left transition-opacity hover:opacity-80`}
        style={style}
        ghost={ghost}
      >
        {face}
      </OpenCheckinButton>
    );
  }
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
