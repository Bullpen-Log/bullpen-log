'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RoundIcon } from '@/components/round-icon';
import type { RoundIconName } from '@/lib/round-icons';

/**
 * 장터 맨 위 큰 띠(2026-10-23 금윤호: "장터는 번개장터 느낌을 최대한") — 번개장터 첫 화면의 검은 둥근 띠처럼 한 장씩 넘어간다.
 * 5초마다 다음 장, 좌우 단추(휴대폰은 쓸기) · 오른쪽 아래 'n/3'. 움직임 줄이기면 저절로 안 넘긴다. 사진 대신 우리 둥근 아이콘을 크게.
 * slim 은 덕아웃 홈의 띠(숨고 첫 화면의 '휴대폰 바꿀 때도…' 띠처럼) — 한 줄 글 · 장 전체가 링크. 나중에 광고가 들어갈 자리(2026-10-24 금윤호) — 높이를 미리 고정해 늦게 뜬 광고가 밑을 밀지 않게, 광고면 ad 로 '광고' 표시.
 */
export type BannerSlide = {
  kicker: string;
  title: readonly string[];
  cta?: string;
  href: string;
  /** 이름으로 받는다 — 서버 페이지가 장을 넘길 수 있게(함수는 못 넘긴다) */
  icon: RoundIconName;
  /** 광고 장 — 왼쪽 위에 '광고' 표시(공정위 추천 · 보증 심사지침: 광고임을 분명히) */
  ad?: boolean;
};

const SLIDES: readonly BannerSlide[] = [
  {
    kicker: '덕아웃 장터',
    title: ['쓰던 글러브 · 배트,', '야구인끼리 사고팔아요'],
    cta: '물건 올리기',
    href: '/market/new',
    icon: 'baseball',
  },
  {
    kicker: '처음이라면',
    title: ['나이 · 포지션 · 손만 고르면', '맞는 장비를 골라 드려요'],
    cta: '장비 추천받기',
    href: '/market?guide=1',
    icon: 'gear',
  },
  {
    kicker: '안전결제 준비 중',
    title: ['물건을 받고 확인할 때까지', '돈은 덕아웃이 맡아 둬요'],
    cta: '자세히 보기',
    href: '/market?sort=new',
    icon: 'shield',
  },
];

export function MarketHero({
  slides = SLIDES,
  slim = false,
  label = '장터 소식',
}: {
  slides?: readonly BannerSlide[];
  slim?: boolean;
  label?: string;
}) {
  const SLIDES = slides;
  const count = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    /* 홈 띠는 광고 자리라 천천히(7초 — 읽기 전에 넘어가지 않게), 장터 큰 띠는 5초 */
    const t = window.setInterval(() => setI((n) => (n + 1) % count), slim ? 7000 : 5000);
    return () => window.clearInterval(t);
  }, [paused, count, slim]);
  const go = (d: number) => setI((n) => (n + d + SLIDES.length) % SLIDES.length);
  // 휴대폰은 좌우 단추 대신 손가락으로 쓸어 넘긴다(옆으로 40px 넘게, 세로보다 많이)
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.changedTouches[0].clientY - t.y)) go(dx < 0 ? 1 : -1);
      }}
      className="relative overflow-hidden rounded-2xl bg-[#141414] text-white"
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {SLIDES.map((s, n) => {
          if (slim)
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-hidden={n !== i}
                tabIndex={n === i ? 0 : -1}
                className="flex min-h-28 w-full shrink-0 items-center justify-between gap-5 px-6 md:min-h-36 md:px-16"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold text-white/60">
                    {s.ad && <span className="rounded bg-white/15 px-1.5 py-px text-[11px] font-bold text-white/80">광고</span>}
                    {s.kicker}
                  </span>
                  <span className="mt-1 block text-lg leading-snug font-black break-keep md:text-2xl">
                    {s.title.join(' ')}
                  </span>
                </span>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sky text-white md:h-20 md:w-20">
                  <RoundIcon name={s.icon} filled className="h-8 w-8 md:h-10 md:w-10" />
                </span>
              </Link>
            );
          return (
            <div
              key={s.href}
              aria-hidden={n !== i}
              className="flex min-h-56 w-full shrink-0 items-center justify-between gap-6 px-8 py-8 md:min-h-72 md:px-16"
            >
              <div className="min-w-0 space-y-3">
                <p className="text-sm font-bold text-white/60 md:text-base">{s.kicker}</p>
                <p className="text-2xl leading-snug font-black break-keep md:text-4xl">
                  {s.title[0]}
                  <br />
                  {s.title[1]}
                </p>
                <Link
                  href={s.href}
                  tabIndex={n === i ? 0 : -1}
                  className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-bold text-[#141414]"
                >
                  {s.cta ?? '자세히 보기'} ›
                </Link>
              </div>
              <span className="hidden h-40 w-40 shrink-0 place-items-center rounded-full bg-sky text-white md:grid">
                <RoundIcon name={s.icon} filled className="h-20 w-20" />
              </span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="이전"
        onClick={() => go(-1)}
        className="absolute top-1/2 left-3 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-xl text-white hover:bg-white/20 md:grid"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="다음"
        onClick={() => go(1)}
        className="absolute top-1/2 right-3 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-xl text-white hover:bg-white/20 md:grid"
      >
        ›
      </button>
      <span className={`absolute right-5 ${slim ? 'bottom-3 hidden md:block' : 'bottom-4'} rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-bold tabular-nums`}>
        {i + 1}/{SLIDES.length}
      </span>
    </section>
  );
}
