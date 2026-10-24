import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import {
  RoundBaseball,
  RoundBat,
  RoundChat,
  RoundGear,
  RoundHeart,
  RoundPlus,
  RoundShield,
  RoundUser,
} from '@/components/round-icon';
import { ListingCard } from '@/components/dugout/listing-card';
import { MarketHero } from '@/components/dugout/market-hero';
import { GearGuide } from '@/components/dugout/gear-guide';
import { getCurrentUser } from '@/lib/dal';
import { loadListings } from '@/lib/market/load';
import { CATEGORIES, CONDITIONS, REGIONS, SORTS, filterHref, readFilter } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * 장터(2026-10-20) — 품목 · 상태 · 지역 · 정렬 · 검색은 모두 주소에(새로 고쳐도 · 링크로 보내도 같은 목록). 로그인 없이 본다.
 * 모양은 번개장터 그대로(2026-10-23 금윤호: "장터는 번개장터 느낌을 최대한") — 흰 바탕, 굵은 품목 글 줄, 검은 둥근 띠(넘어감),
 * 가운데 동그란 바로가기 줄, '오늘의 추천 물건' 큰 제목, 테두리 없는 6열 사진 격자. 검색은 위 막대 가운데.
 * 품목 · 검색으로 들어오면 띠 · 바로가기 대신 제목과 작은 거르기 한 줄(지역 · 상태 · 정렬).
 * '장비 추천'(2026-10-23 — 따로 있던 /gear 를 장터 안으로): 주소에 ?guide=1 이면 팝업(components/dugout/gear-guide.tsx).
 * 입구는 바로가기 한 칸과, 글러브 · 배트처럼 고르기 어려운 품목 화면의 옅은 한 줄뿐 — 아는 사람 눈에는 거의 안 띈다.
 */
/** 규격을 몰라 망설이는 품목 — 이 화면들에만 '처음이라면' 한 줄을 띄운다 */
const GUIDE_CATEGORIES = new Set(['glove', 'bat', 'spikes', 'protector', 'ball']);
const withGuide = (href: string) => `${href}${href.includes('?') ? '&' : '?'}guide=1`;
const SHORTCUTS: { href: string; label: string; icon: Icon }[] = [
  { href: '/me#favorites', label: '찜', icon: RoundHeart },
  { href: '/market/new', label: '내 물건 팔기', icon: RoundPlus },
  { href: filterHref({ category: 'glove' }), label: '글러브', icon: RoundBaseball },
  { href: filterHref({ category: 'bat' }), label: '배트', icon: RoundBat },
  { href: filterHref({ category: 'protector' }), label: '보호구', icon: RoundShield },
  { href: filterHref({ category: 'uniform' }), label: '유니폼', icon: RoundUser },
  { href: '/market?guide=1', label: '장비 추천', icon: RoundGear },
  { href: '/chat', label: '채팅', icon: RoundChat },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = readFilter((k) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]));
  const user = await getCurrentUser();
  const { items, hasMore } = await loadListings(f, user ? { id: user.id, role: user.role } : null);
  const now = new Date();
  const landing = !f.q && !f.category && !f.region && !f.condition && !f.all && f.sort === 'new' && f.page === 1;
  const heading = f.q
    ? `‘${f.q}’ 검색 결과`
    : f.category
      ? (CATEGORIES.find((c) => c.key === f.category)?.label ?? '물건')
      : landing
        ? '오늘의 추천 물건'
        : '전체 물건';

  const chip = (href: string, on: boolean, label: string) => (
    <Link
      key={href + label}
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${
        on ? 'bg-ink text-page' : 'border border-line text-ink hover:border-ink/40'
      }`}
    >
      {label}
    </Link>
  );

  return (
    /* 장터만 흰 바탕 — 번개장터처럼(덕아웃 틀의 회색 바탕을 화면 끝까지 덮는다) */
    <div className="relative isolate space-y-10 before:absolute before:-top-10 before:-bottom-40 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-surface">
      {/* 품목 줄 — 번개장터 둘째 줄처럼 굵은 큰 글 */}
      <nav aria-label="품목" className="-mx-4 -mt-2 no-scrollbar flex items-center gap-7 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {[{ key: undefined, label: '전체' }, ...CATEGORIES].map((c) => {
          const on = f.category === c.key;
          return (
            <Link
              key={c.label}
              href={filterHref({ ...f, category: c.key, page: 1 })}
              aria-current={on ? 'page' : undefined}
              className={`relative flex min-h-12 shrink-0 items-center text-[17px] font-bold whitespace-nowrap ${
                on ? 'text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink' : 'text-ink/70 hover:text-ink'
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      {landing && (
        <>
          <MarketHero />
          {/* 바로가기 — 번개장터 '찜 · 최근 본 상품 · 내폰바로팔기 …' 줄처럼 가운데 동그란 네모 */}
          <nav aria-label="바로가기" className="no-scrollbar -mx-4 flex justify-start gap-4 overflow-x-auto px-4 md:mx-0 md:justify-center md:gap-8 md:px-0">
            {SHORTCUTS.map((s) => {
              const I = s.icon;
              return (
                <Link
                  key={s.label}
                  href={s.href}
                  scroll={!s.href.includes('guide=1')}
                  className="group flex w-20 shrink-0 flex-col items-center gap-2"
                >
                  <span className="grid h-[72px] w-[72px] place-items-center rounded-[22px] bg-surface-2 text-sky transition-transform group-hover:-translate-y-0.5">
                    <I className="h-9 w-9" {...({ filled: true } as object)} />
                  </span>
                  <span className="text-[13px] font-semibold whitespace-nowrap text-ink">{s.label}</span>
                </Link>
              );
            })}
          </nav>
        </>
      )}

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[26px] font-black text-ink">{heading}</h1>
          {f.q && (
            <Link href="/market" className="text-sm font-semibold text-muted hover:text-ink">
              검색 지우기
            </Link>
          )}
        </div>
        {/* 고르기 어려운 품목 · 검색에만 — 잘 모르는 사람만 보고 지나가게 옅게 */}
        {!landing && (f.q || (f.category && GUIDE_CATEGORIES.has(f.category))) && (
          <Link
            href={withGuide(filterHref(f))}
            scroll={false}
            className="-mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
          >
            <RoundGear className="h-4 w-4 text-sky" />
            처음이라 무엇을 사야 할지 모르겠다면 · <span className="font-semibold text-sky">맞는 규격 추천받기 ›</span>
          </Link>
        )}

        {!landing && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="no-scrollbar -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 md:mx-0 md:basis-auto md:px-0">
              {chip(filterHref({ ...f, region: undefined, page: 1 }), !f.region, '지역 전체')}
              {REGIONS.map((r) => chip(filterHref({ ...f, region: r, page: 1 }), f.region === r, r))}
            </div>
            {CONDITIONS.map((c) =>
              chip(filterHref({ ...f, condition: f.condition === c.key ? undefined : c.key, page: 1 }), f.condition === c.key, c.label)
            )}
            {chip(filterHref({ ...f, all: !f.all, page: 1 }), !!f.all, '거래 완료도')}
            <span className="ml-auto flex gap-3 text-[13px] font-semibold">
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={filterHref({ ...f, sort: s.key, page: 1 })}
                  aria-current={f.sort === s.key ? 'page' : undefined}
                  className={f.sort === s.key ? 'text-ink' : 'text-muted hover:text-ink'}
                >
                  {s.label}
                </Link>
              ))}
            </span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="space-y-3 py-20 text-center">
            <p className="text-base font-bold text-ink">{landing ? '아직 올라온 물건이 없어요' : '맞는 물건이 없어요'}</p>
            <p className="text-sm text-muted">
              {landing ? '안 쓰는 글러브 · 배트를 첫 물건으로 올려 보세요.' : '거르기를 풀거나 다른 말로 찾아 보세요.'}
            </p>
            <Link href="/market/new" className="inline-flex min-h-11 items-center rounded-full bg-sky px-5 text-sm font-bold text-white">
              물건 올리기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}

        {(f.page > 1 || hasMore) && (
          <div className="flex justify-center gap-6 pt-4 text-sm font-semibold">
            {f.page > 1 && (
              <Link href={filterHref({ ...f, page: f.page - 1 })} className="text-muted hover:text-ink">
                ‹ 이전
              </Link>
            )}
            {hasMore && (
              <Link href={filterHref({ ...f, page: f.page + 1 })} className="text-ink">
                더 보기 ›
              </Link>
            )}
          </div>
        )}
      </section>
      {/* 이 화면은 늘 동적이라 Suspense 로 감싸지 않는다 — 감싸면 바로 연 ?guide=1 에서 팝업이 늦게 살아났다 */}
      <GearGuide />
    </div>
  );
}
