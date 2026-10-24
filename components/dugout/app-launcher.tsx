'use client';

import { useState, type ComponentType, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Baseball } from '@/components/icon';
import { RoundChat, RoundCommunity, RoundGear, RoundLesson, RoundMarket, RoundPlus, RoundUser, RoundVenue } from '@/components/round-icon';
import { morphTo } from '@/components/shell-morph';

/**
 * 덕아웃 바로가기(2026-10-21 금윤호: "검색을 없애고 각 기능으로 바로 이동하는 아이콘 — 앱을 열듯이").
 * 휴대폰 홈 화면의 앱 아이콘처럼 둥근 네모 · 아래 이름. 색은 한 가지(2026-10-21 금윤호: "색이 너무 다양 — 한 가지로, 바탕은 테마에 맞게") —
 * 바탕은 테마의 카드색(bg-surface), 아이콘은 덕아웃 초록(sky → [data-brand='dugout']). 늘 4×2. 누르면 살짝 눌렸다가 커지며 열리고(0.22초) 그 화면으로 간다.
 * 싱커는 덕아웃 → 싱커 변형(components/shell-morph.tsx)으로. 첫 화면(dugout-hero)은 크게, 아래 홈은 작게(size).
 */
type Item = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  morph?: boolean;
};

export function AppLauncher({
  loggedIn,
  sinker,
  native = false,
  size = 'lg',
  className = '',
}: {
  loggedIn: boolean;
  /** 싱커를 쓰는 사람 — 마지막 칸이 '싱커'(아니면 로그인 · 내 것) */
  sinker: boolean;
  native?: boolean;
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const items: Item[] = [
    {
      href: '/community',
      label: '커뮤니티',
      icon: RoundCommunity,
    },
    { href: '/market', label: '장터', icon: RoundMarket },
    { href: '/market/new', label: '물건 올리기', icon: RoundPlus },
    { href: '/lessons', label: '레슨', icon: RoundLesson },
    { href: '/venues', label: '연습장', icon: RoundVenue },
    { href: '/gear', label: '장비 고르기', icon: RoundGear },
    { href: '/chat', label: '채팅', icon: RoundChat },
    sinker
      ? {
          href: '/today',
          label: '싱커',
          icon: Baseball,
          morph: !native,
        }
      : loggedIn
        ? { href: '/me', label: '내 것', icon: RoundUser }
        : {
            href: '/login?signup=1',
            label: '시작하기',
            icon: RoundUser,
          },
  ];

  const open = (e: MouseEvent<HTMLAnchorElement>, it: Item) => {
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
    if (it.morph) {
      morphTo(it.href, 'to-sinker', router);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      router.push(it.href);
      return;
    }
    /* 여는 연출은 그대로 두고 이동은 바로 건다 — 예전엔 연출(0.22초)이 끝난 뒤에야 서버에 물어 그만큼 늦게 떴다(2026-10-24 전체 검토) */
    setOpening(it.href);
    router.push(it.href);
  };

  const big = size === 'lg';
  return (
    <nav aria-label="덕아웃 바로가기" className={className}>
      <ul
        className={`grid grid-cols-4 ${big ? 'mx-auto max-w-md gap-x-5 gap-y-6 sm:max-w-lg sm:gap-x-8' : 'max-w-md gap-x-4 gap-y-4'}`}
      >
        {items.map((it, i) => {
          const Icon = it.icon;
          const isOpening = opening === it.href;
          return (
            <li
              key={it.href}
              className="motion-safe:animate-[launcher-in_640ms_cubic-bezier(0.2,0.8,0.2,1)_both]"
              style={{ animationDelay: `${(big ? 320 : 0) + i * 55}ms` }}
            >
              <a
                href={it.href}
                onClick={(e) => open(e, it)}
                className="group flex flex-col items-center gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-sky"
              >
                <span
                  className={`grid place-items-center rounded-[22%] border border-line bg-surface text-sky shadow-[0_6px_16px_-8px_rgb(0_0_0/0.25)] transition-[transform,border-color,background-color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-sky-soft group-hover:bg-sky-tint group-active:scale-90${
                    big ? 'h-16 w-16 md:h-[68px] md:w-[68px]' : 'h-14 w-14'
                  } ${isOpening ? 'scale-[1.35] opacity-0 duration-[220ms]' : ''}`}
                >
                  <Icon className={big ? 'h-8 w-8' : 'h-7 w-7'} />
                </span>
                <span
                  className={`text-center font-medium break-keep text-ink ${big ? 'text-[13px]' : 'text-xs'}`}
                >
                  {it.label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
