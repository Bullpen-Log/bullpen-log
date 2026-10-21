'use client';

import { useState, type ComponentType, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Baseball,
  CalendarDays,
  Dumbbell,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Plus,
  Tag,
  UserRound,
} from '@/components/icon';
import { morphTo } from '@/components/shell-morph';

/**
 * 덕아웃 바로가기(2026-10-21 금윤호: "검색을 없애고 각 기능으로 바로 이동하는 아이콘 — 앱을 열듯이").
 * 휴대폰 홈 화면의 앱 아이콘처럼 둥근 네모 · 색 · 아래 이름. 누르면 살짝 눌렸다가 커지며 열리고(0.22초) 그 화면으로 간다.
 * 싱커는 덕아웃 → 싱커 변형(components/shell-morph.tsx)으로. 첫 화면(dugout-hero)은 크게, 아래 홈은 작게(size).
 */
type Item = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** 아이콘 바탕 — 앱마다 다른 색(흰 아이콘이 얹힌다, 라이트 · 다크 같은 색) */
  tone: string;
  morph?: boolean;
};

const OPEN_MS = 220;

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
      icon: MessagesSquare,
      tone: 'bg-emerald-600',
    },
    { href: '/market', label: '장터', icon: Tag, tone: 'bg-orange-500' },
    { href: '/market/new', label: '물건 올리기', icon: Plus, tone: 'bg-amber-500' },
    { href: '/lessons', label: '레슨', icon: CalendarDays, tone: 'bg-violet-600' },
    { href: '/venues', label: '연습장', icon: MapPin, tone: 'bg-teal-600' },
    { href: '/gear', label: '장비 고르기', icon: Dumbbell, tone: 'bg-slate-700' },
    { href: '/chat', label: '채팅', icon: MessageCircle, tone: 'bg-sky-600' },
    sinker
      ? {
          href: '/today',
          label: '싱커',
          icon: Baseball,
          tone: 'bg-blue-600',
          morph: !native,
        }
      : loggedIn
        ? { href: '/me', label: '내 것', icon: UserRound, tone: 'bg-zinc-600' }
        : {
            href: '/login?signup=1',
            label: '시작하기',
            icon: UserRound,
            tone: 'bg-zinc-600',
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
    setOpening(it.href);
    router.prefetch(it.href);
    window.setTimeout(() => router.push(it.href), OPEN_MS);
  };

  const big = size === 'lg';
  return (
    <nav aria-label="덕아웃 바로가기" className={className}>
      <ul
        className={`grid grid-cols-4 ${big ? 'gap-x-4 gap-y-5 sm:gap-x-7 md:grid-cols-8' : 'gap-x-3 gap-y-4 sm:grid-cols-8'}`}
      >
        {items.map((it, i) => {
          const Icon = it.icon;
          const isOpening = opening === it.href;
          return (
            <li
              key={it.href}
              className="motion-safe:animate-[launcher-in_420ms_cubic-bezier(0.2,0.8,0.2,1)_both]"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <a
                href={it.href}
                onClick={(e) => open(e, it)}
                className="group flex flex-col items-center gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-sky"
              >
                <span
                  className={`grid place-items-center rounded-[22%] text-white shadow-[0_6px_16px_-6px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.25)] transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-active:scale-90 ${it.tone} ${
                    big ? 'h-16 w-16 md:h-[68px] md:w-[68px]' : 'h-12 w-12'
                  } ${isOpening ? 'scale-[1.35] opacity-0 duration-[220ms]' : ''}`}
                >
                  <Icon className={big ? 'h-8 w-8' : 'h-6 w-6'} />
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
