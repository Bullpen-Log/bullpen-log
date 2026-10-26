'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RoundIcon } from '@/components/round-icon';
import type { RoundIconName } from '@/lib/round-icons';

/**
 * 덕아웃 홈 둘러보기 카드(2026-10-26 금윤호: "홈은 큰 로고 · 통합검색 · 옆으로 움직이는 카드") — 예전 홈의 검은 소식 띠(market-hero slim, 한 장씩 7초)를
 * 카드 여러 장이 한 줄로 서는 모양으로 바꿨다: PC 는 336×140 카드 셋(휴대폰 148) + 다음 장 끝이 보이고(옆으로 더 있다는 표시), 휴대폰은 한 장 + 다음 장 끝.
 * - 넘기기: ‹ › 단추 · 트랙패드 · 손가락 옆 굴림(scroll-snap). 세로 굴림은 가로채지 않는다(가로 굴림 칸이라 세로 휠은 문서로 간다).
 * - 저절로 넘김: 7초마다 한 장. 마우스를 올리거나 칸 안에 초점이 있으면 쉬고, ‹ › · 손가락 · 휠로 직접 넘기면 그 뒤로는 멈춘다(멈춤/재생 단추로 다시 켬).
 *   움직임 줄이기 · 안 보이는 탭이면 저절로 넘기지 않는다. 넘겨도 초점은 옮기지 않고, 끝없이 도는 복제 카드는 만들지 않는다(끝에서 처음으로 되감음).
 * - infinite(덕아웃 앱, 2026-10-26 김민 "끝까지 가면 막혀서 왼쪽으로 다시 돌아간다 — 무한 반복으로"): 카드 묶음을 셋 이어 붙이고 가운데 묶음에서
 *   시작한다. 굴림이 멈추면(손가락을 뗀 뒤 관성까지 끝나면) 앞 · 뒤 묶음에 들어간 만큼 한 묶음 폭을 순간 이동해 가운데로 — 같은 카드가 같은
 *   자리라 보이는 것은 그대로다. 앞뒤 복제 묶음은 inert(초점 · 읽기에서 빠짐). 웹은 예전 그대로.
 */
export type HomeCard = {
  kicker: string;
  title: string;
  desc?: string;
  href: string;
  icon: RoundIconName;
  tone?: 'dark' | 'sky' | 'soft';
};

const INTERVAL = 7000;

const TONE: Record<NonNullable<HomeCard['tone']>, { card: string; kicker: string; desc: string; dot: string }> = {
  dark: { card: 'bg-[#141414] text-white', kicker: 'text-white/60', desc: 'text-white/70', dot: 'bg-sky text-white' },
  sky: { card: 'bg-sky text-white', kicker: 'text-white/75', desc: 'text-white/85', dot: 'bg-white/20 text-white' },
  soft: { card: 'bg-surface-2 text-ink', kicker: 'text-muted', desc: 'text-muted', dot: 'bg-sky text-white' },
};

export function HomeCarousel({
  cards,
  label = '덕아웃 둘러보기',
  infinite = false,
}: {
  cards: readonly HomeCard[];
  label?: string;
  infinite?: boolean;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false, overflow: false });
  /* 끝없이 돌기 — 넘칠 만큼 카드가 있을 때만(아니면 돌 것이 없다) */
  const loop = infinite && edge.overflow;
  const touching = useRef(false);
  const settle = useRef(0);
  /* 저절로 넘김을 켤 수 있는가(움직임 줄이기 아님 · 넘칠 만큼 카드가 있음) · 켜 두었나 */
  const [canPlay, setCanPlay] = useState(false);
  const [playing, setPlaying] = useState(true);
  const hold = useRef(false);

  /** 한 장 크기(카드 폭 + 간격) */
  const step = useCallback(() => {
    const el = track.current;
    const first = el?.querySelector('li');
    if (!el || !first) return 0;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    return first.getBoundingClientRect().width + gap;
  }, []);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    /* 넘침은 카드 한 묶음으로 잰다 — 셋 이어 붙인 뒤에도 같은 답 */
    const overflow = step() * cards.length > el.clientWidth + 4;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4, overflow });
    setCanPlay(overflow && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [step, cards.length]);

  /** 끝없이 돌기 — 앞 · 뒤 복제 묶음에 들어갔으면 한 묶음 폭만큼 순간 이동해 가운데 묶음으로 */
  const recenter = useCallback(() => {
    const el = track.current;
    if (!el || touching.current) return;
    const set = step() * cards.length;
    if (!set) return;
    if (el.scrollLeft < set - 4) el.scrollTo({ left: el.scrollLeft + set, behavior: 'instant' });
    else if (el.scrollLeft >= set * 2 - 4) el.scrollTo({ left: el.scrollLeft - set, behavior: 'instant' });
  }, [step, cards.length]);

  /* 돌기를 켜면 가운데 묶음 첫 장에서 시작 */
  useLayoutEffect(() => {
    if (loop) track.current?.scrollTo({ left: step() * cards.length, behavior: 'instant' });
  }, [loop, step, cards.length]);

  /* 굴림이 멈추면 가운데로 — scrollend 가 없는 웹뷰도 있어 멈춘 지 150ms 를 같이 본다. 손가락이 닿아 있는 동안은 안 옮긴다 */
  useEffect(() => {
    const el = track.current;
    if (!el || !loop) return;
    const later = () => {
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(recenter, 150);
    };
    const down = () => (touching.current = true);
    const up = () => {
      touching.current = false;
      later();
    };
    el.addEventListener('scroll', later, { passive: true });
    el.addEventListener('scrollend', recenter);
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('touchcancel', up, { passive: true });
    return () => {
      window.clearTimeout(settle.current);
      el.removeEventListener('scroll', later);
      el.removeEventListener('scrollend', recenter);
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
    };
  }, [loop, recenter]);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * step(), behavior: smooth() });
  };

  /* 저절로 넘김 — 끝이면 처음으로 되감는다(돌기면 늘 다음 장 — 가운데로는 recenter 가) */
  useEffect(() => {
    if (!canPlay || !playing) return;
    const t = window.setInterval(() => {
      const el = track.current;
      if (!el || hold.current || document.hidden) return;
      if (!loop && el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) el.scrollTo({ left: 0, behavior: smooth() });
      else el.scrollBy({ left: step(), behavior: smooth() });
    }, INTERVAL);
    return () => window.clearInterval(t);
  }, [canPlay, playing, loop, step]);

  /* 그릴 카드 — 돌기면 묶음 셋(가운데 1 이 진짜, 앞뒤는 복제) */
  const shown = (loop ? [0, 1, 2] : [1]).flatMap((copy) => cards.map((c) => ({ c, copy })));

  /** 직접 넘겼다 — 그 뒤로 저절로 넘기지 않는다 */
  const userMoved = () => setPlaying(false);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="space-y-3"
      onPointerEnter={(e) => e.pointerType === 'mouse' && (hold.current = true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && (hold.current = false)}
      onFocus={() => (hold.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold.current = false;
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-muted">{label}</h2>
        {edge.overflow && (
          <div className="flex items-center gap-1.5">
            {canPlay && (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? '저절로 넘기기 멈추기' : '저절로 넘기기 켜기'}
                aria-pressed={!playing}
                className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-ink/6 hover:text-ink focus-visible:ring-2 focus-visible:ring-sky focus-visible:outline-none"
              >
                {playing ? (
                  <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 fill-current">
                    <rect x="3.5" y="3" width="3" height="10" rx="1" />
                    <rect x="9.5" y="3" width="3" height="10" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 fill-current">
                    <path d="M5 3.2v9.6a.7.7 0 0 0 1.06.6l7.6-4.8a.7.7 0 0 0 0-1.2L6.06 2.6A.7.7 0 0 0 5 3.2Z" />
                  </svg>
                )}
              </button>
            )}
            {(['prev', 'next'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k === 'prev' ? '이전 카드' : '다음 카드'}
                disabled={!loop && (k === 'prev' ? edge.start : edge.end)}
                onClick={() => {
                  userMoved();
                  go(k === 'prev' ? -1 : 1);
                }}
                className="grid h-8 w-8 place-items-center rounded-full border border-line text-base text-ink transition-colors hover:border-ink/30 focus-visible:ring-2 focus-visible:ring-sky focus-visible:outline-none disabled:opacity-35 disabled:hover:border-line"
              >
                <span aria-hidden>{k === 'prev' ? '‹' : '›'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/*
        트랙 — 가로 굴림 칸(scroll-snap). 초점 테두리가 칸 끝에 잘리지 않게 안쪽 여백 4px 을 두고 바깥으로 같은 만큼 당긴다.
        휴대폰은 화면 끝까지(거터만큼 걷음) 닿아 다음 장 끝이 화면 밖에서 들어온다
      */}
      <ul
        ref={track}
        onWheel={(e) => Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2 && userMoved()}
        onTouchStart={userMoved}
        className="no-scrollbar -mx-(--dugout-gutter) -my-1 flex snap-x snap-mandatory scroll-px-(--dugout-gutter) gap-3 overflow-x-auto overscroll-x-contain px-(--dugout-gutter) py-1 lg:mx-0 lg:scroll-px-1 lg:gap-4 lg:px-1"
      >
        {shown.map(({ c, copy }) => {
          const tone = TONE[c.tone ?? 'dark'];
          return (
            <li key={`${copy}-${c.href}${c.title}`} inert={copy !== 1} className="w-[min(82vw,336px)] shrink-0 snap-start lg:w-[336px]">
              <Link
                href={c.href}
                className={`group flex h-[148px] lg:h-[140px] items-stretch justify-between gap-4 rounded-2xl p-5 transition-transform focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:hover:-translate-y-0.5 ${tone.card}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className={`text-xs font-bold ${tone.kicker}`}>{c.kicker}</span>
                  <span className="mt-1.5 line-clamp-2 text-[19px] leading-[26px] font-bold break-keep">{c.title}</span>
                  {c.desc && <span className={`mt-auto line-clamp-1 text-[13px] ${tone.desc}`}>{c.desc}</span>}
                </span>
                <span className={`grid h-14 w-14 shrink-0 place-items-center self-end rounded-full ${tone.dot}`}>
                  <RoundIcon name={c.icon} filled className="h-7 w-7" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
