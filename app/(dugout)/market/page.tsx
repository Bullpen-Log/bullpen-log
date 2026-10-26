import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoundIcon, RoundPlus, RoundSearch } from '@/components/round-icon';
import { LISTING_GRID, ListingCard } from '@/components/dugout/listing-card';
import { DugoutEmpty, DugoutPageHeader, SectionHead } from '@/components/dugout/ui';
import { GearGuide } from '@/components/dugout/gear-guide';
import { MarketHero } from '@/components/dugout/market-hero';
import { MarketListMemory } from '@/components/dugout/market-back';
import { getCurrentUser } from '@/lib/dal';
import { loadLatestListings, loadListings } from '@/lib/market/load';
import { CATEGORIES, LISTING_FILTER_KEYS, MARKET_BROWSE, filterHref, readFilter } from '@/lib/market/specs';
import type { RoundIconName } from '@/lib/round-icons';

type SP = { [key: string]: string | string[] | undefined };

/**
 * 장터 입구(2026-10-26 금윤호: "지금 장터 화면은 좋은데, 예전 장터를 첫 입구로") — '어떤 장비를 볼까'를 고르는 화면.
 * 예전 장터(c0278425 번개장터식 · 411cf462 UI 통일판)의 차례를 다시 쓴다: 굵은 품목 입구 → 방금 올라온 물건 → 검은 띠(MarketHero) → 품목별 새 물건.
 * 그때의 큰 띠(높이 288)는 첫 물건을 밀어 내려서 띠는 얇은 판(slim)으로 물건 줄 밑에, 바로가기의 찜 · 채팅은 위 막대 · 내 것에 있어 뺐다.
 * 품목 · 검색 · '전체 보기'는 모두 결과 화면(/market/browse — 왼쪽 거르기 판 + 카드 격자)으로 간다. 이 화면에는 거르기 판이 없다.
 * 옛 주소(/market?category=glove · /market?q=…)는 그 뜻 그대로 결과 화면으로 넘긴다 — 걸러 둔 링크를 입구로 떨구지 않는다.
 */
export const metadata = { title: '장터' };

/**
 * 품목 입구 그림 — 덕아웃 둥근 아이콘(lib/round-icons.ts)에서 고른다. 'gear'(장비)는 글러브 그림이라 글러브에, 공은 공.
 * 신발 그림은 아직 없어 스파이크는 크게 내딛는 투구 그림(pitcher)으로 — 신발 그림이 생기면 바꾼다.
 */
const CATEGORY_ICON: Record<string, RoundIconName> = {
  glove: 'gear',
  bat: 'bat',
  spikes: 'pitcher',
  protector: 'shield',
  uniform: 'user',
  ball: 'baseball',
  bag: 'market',
  training: 'training',
  other: 'plus',
};

/** 품목별 줄 — 고르기 어려워 많이 찾는 둘만(물건이 있을 때만 그린다) */
const FEATURED = ['glove', 'bat'] as const;

export default async function MarketLanding({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  /* 옛 걸러 둔 링크 → 결과 화면(주소의 다른 값 — 장비 추천 팝업의 guide · age … 도 그대로 싣는다) */
  if (LISTING_FILTER_KEYS.some((k) => sp[k] != null && sp[k] !== '')) {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const one of Array.isArray(v) ? v : [v]) if (one != null) out.append(k, one);
    redirect(`${MARKET_BROWSE}?${out.toString()}`);
  }

  const user = await getCurrentUser();
  const viewer = user ? { id: user.id, role: user.role } : null;
  const none = readFilter(() => undefined);
  const [recent, ...featured] = await Promise.all([
    loadLatestListings(10, viewer),
    ...FEATURED.map((c) => loadListings({ ...none, category: c }, viewer).then((r) => r.items.slice(0, 5))),
  ]);
  const now = new Date();

  return (
    <div className="space-y-10 lg:space-y-12">
      <div className="space-y-6 lg:space-y-7">
        <DugoutPageHeader
          title="덕아웃 장터"
          subtitle="야구인끼리 쓰던 장비를 사고팔아요"
          actions={
            <>
              {/* 장터 안 찾기 — 결과 화면의 같은 q(제목 · 설명). 위 막대의 통합검색과 달리 물건만 찾는다 */}
              <form action={MARKET_BROWSE} method="get" role="search" className="flex min-w-0 flex-1 items-center gap-2 sm:w-[420px] sm:flex-none">
                <label className="relative min-w-0 flex-1">
                  <RoundSearch className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    name="q"
                    type="search"
                    maxLength={40}
                    placeholder="글러브 · 배트 · 브랜드 찾기"
                    aria-label="장터 물건 찾기"
                    className="h-11 w-full appearance-none rounded-xl bg-ink/6 pr-3 pl-10 text-[15px] text-ink placeholder:text-muted/70 focus:bg-surface focus:ring-2 focus:ring-sky focus:outline-none"
                  />
                </label>
                <button type="submit" className="h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-page">
                  찾기
                </button>
              </form>
              <Link
                href="/market/new"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-sky px-4 text-sm font-bold text-white hover:bg-sky-strong"
              >
                <RoundPlus className="h-4 w-4" /> 물건 팔기
              </Link>
            </>
          }
        />

        {/*
          품목 입구 — 예전 장터 바로가기(72px 네모 + 이름)를 PC 크기로: 네모 48 · 그림 28 · 이름 13, 한 칸 76 높이. 큰 화면은 열 칸 한 줄,
          휴대폰은 다섯 칸 두 줄(이름이 길면 두 줄로 — 자르지 않는다). 누르면 그 품목이 고른 채로 결과 화면
        */}
        <nav aria-label="품목으로 둘러보기">
          <ul className="grid grid-cols-5 gap-x-2 gap-y-4 lg:grid-cols-10 lg:gap-x-3">
            {[{ key: undefined, label: '전체' }, ...CATEGORIES].map((c) => (
              <li key={c.key ?? 'all'}>
                <Link
                  href={c.key ? filterHref({ category: c.key }) : MARKET_BROWSE}
                  className="group flex flex-col items-center gap-1.5 rounded-xl py-0.5 focus-visible:ring-2 focus-visible:ring-sky focus-visible:outline-none"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-sky transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none">
                    <RoundIcon name={c.key ? (CATEGORY_ICON[c.key] ?? 'market') : 'menu'} filled className="h-7 w-7" />
                  </span>
                  <span className="text-center text-[13px] leading-[18px] font-semibold break-keep text-ink">{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* 방금 올라온 물건 — 만든 때 차례(추천이 아니다). 큰 화면 두 줄(다섯 칸이면 열 · 넷이면 여덟 — 한 줄 끝에 하나만 남지 않게), 휴대폰 여섯 */}
      <section className="@container space-y-4">
        <SectionHead title="방금 올라온 물건" href={MARKET_BROWSE} more="전체 보기 ›" />
        {recent.length === 0 ? (
          <DugoutEmpty
            compact
            title="아직 올라온 물건이 없어요"
            description="안 쓰는 글러브 · 배트를 첫 물건으로 올려 보세요."
            href="/market/new"
            cta="물건 올리기"
          />
        ) : (
          <div className={`${LISTING_GRID} max-lg:[&>*:nth-child(n+7)]:hidden lg:@max-[1013px]:[&>*:nth-child(n+9)]:hidden`}>
            {recent.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>

      {/* 예전 장터의 검은 띠 — 얇은 판으로 물건 줄 밑에(첫 물건을 밀어 내리지 않게). 실제로 되는 일만 적는다 */}
      <MarketHero slim label="장터 소식" />

      {/* 품목별 새 물건 — 한 줄씩(물건이 있는 품목만) */}
      {FEATURED.map((key, i) => {
        const items = featured[i];
        if (!items || items.length === 0) return null;
        const label = CATEGORIES.find((c) => c.key === key)?.label ?? key;
        return (
          <section key={key} className="@container space-y-4">
            <SectionHead title={`${label} 새 물건`} href={filterHref({ category: key })} more={`${label} 전체 ›`} />
            <div
              className={`${LISTING_GRID} max-sm:[&>*:nth-child(n+5)]:hidden sm:max-lg:[&>*:nth-child(n+4)]:hidden lg:@max-[1013px]:[&>*:nth-child(n+5)]:hidden`}
            >
              {items.map((item) => (
                <ListingCard key={item.id} item={item} now={now} />
              ))}
            </div>
          </section>
        );
      })}

      {/* 다 훑은 사람의 길 — 거르기 · 정렬이 있는 결과 화면 */}
      <div className="flex justify-center">
        <Link
          href={MARKET_BROWSE}
          className="inline-flex h-11 items-center rounded-full border border-line px-6 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
        >
          물건 전체 보기 · 거르기 ›
        </Link>
      </div>

      <MarketListMemory />
      {/* 장비 추천 팝업(?guide=1) — 띠 · 옛 /gear 주소가 이 화면으로 온다 */}
      <GearGuide />
    </div>
  );
}
