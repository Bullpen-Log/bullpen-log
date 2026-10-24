'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RoundIcon } from '@/components/round-icon';
import type { RoundIconName } from '@/lib/round-icons';
import { filterHref } from '@/lib/market/specs';

/**
 * 덕아웃 홈의 탭 + 아이콘 줄(2026-10-23 금윤호: "홈화면을 숨고처럼") — 숨고 첫 화면의 [견적비교 | 바로예약] 밑 아이콘 줄을 옮겼다.
 * 탭은 [중고거래 | 레슨 · 예약], 아이콘은 바탕 없이 채운 둥근 그림 + 이름. PC 는 한 줄로 고르게, 휴대폰은 다섯 칸씩.
 */
type Item = { href: string; label: string; icon: RoundIconName };

const TABS: { key: string; label: string; items: Item[] }[] = [
  {
    key: 'market',
    label: '중고거래',
    items: [
      { href: '/market', label: '전체보기', icon: 'menu' },
      { href: filterHref({ category: 'glove' }), label: '글러브', icon: 'pitcher' },
      { href: filterHref({ category: 'bat' }), label: '배트', icon: 'bat' },
      { href: filterHref({ category: 'spikes' }), label: '스파이크', icon: 'flame' },
      { href: filterHref({ category: 'protector' }), label: '보호구', icon: 'shield' },
      { href: filterHref({ category: 'uniform' }), label: '유니폼', icon: 'user' },
      { href: filterHref({ category: 'ball' }), label: '공', icon: 'baseball' },
      { href: '/market?guide=1', label: '장비 추천', icon: 'gear' },
      { href: filterHref({ category: 'training' }), label: '훈련 도구', icon: 'training' },
      { href: '/market/new', label: '물건 팔기', icon: 'plus' },
    ],
  },
  {
    key: 'lesson',
    label: '레슨 · 예약',
    items: [
      { href: '/lessons', label: '전체보기', icon: 'menu' },
      { href: '/lessons/find', label: '맞춤 찾기', icon: 'search' },
      { href: '/lessons/list?specialty=pitching', label: '투구', icon: 'pitcher' },
      { href: '/lessons/list?specialty=hitting', label: '타격', icon: 'batter' },
      { href: '/lessons/list?specialty=fielding', label: '수비', icon: 'baseball' },
      { href: '/lessons/list?specialty=youth', label: '유소년', icon: 'people' },
      { href: '/lessons/list?specialty=rehab', label: '재활 · 복귀', icon: 'armcare' },
      { href: '/venues', label: '연습장', icon: 'venue' },
      { href: '/chat', label: '채팅', icon: 'chat' },
      { href: '/community', label: '커뮤니티', icon: 'community' },
    ],
  },
];

export function HomeServices() {
  const [tab, setTab] = useState(0);
  const items = TABS[tab].items;
  return (
    <div>
      <div role="tablist" aria-label="찾을 곳" className="flex justify-center border-b border-line">
        {TABS.map((t, n) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={n === tab}
            onClick={() => setTab(n)}
            className={`relative min-h-12 w-40 text-[15px] font-bold transition-colors md:w-44 ${
              n === tab
                ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ul
        key={tab}
        role="tabpanel"
        className="mt-6 grid grid-cols-5 gap-y-5 motion-safe:animate-[launcher-in_240ms_ease-out] md:flex md:justify-between"
      >
        {items.map((it) => (
          <li key={it.href + it.label} className="min-w-0">
            <Link
              href={it.href}
              className="group flex flex-col items-center gap-2 rounded-xl px-1 py-1 md:w-20"
            >
              <span className="grid h-11 w-11 place-items-center text-sky transition-transform group-hover:-translate-y-0.5">
                <RoundIcon name={it.icon} filled className="h-9 w-9" />
              </span>
              <span className="truncate text-center text-[13px] text-ink">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
