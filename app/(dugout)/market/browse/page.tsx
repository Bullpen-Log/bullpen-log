import Link from 'next/link';
import { RoundGear } from '@/components/round-icon';
import { LISTING_GRID, ListingCard } from '@/components/dugout/listing-card';
import { CategoryRow, DugoutEmpty, DugoutPageHeader, chipClass } from '@/components/dugout/ui';
import { GearGuide } from '@/components/dugout/gear-guide';
import { MarketFilterRail } from '@/components/dugout/market-filter-rail';
import { MarketListMemory } from '@/components/dugout/market-back';
import { getCurrentUser } from '@/lib/dal';
import { loadListings } from '@/lib/market/load';
import { CATEGORIES, CONDITIONS, MARKET_BROWSE, REGIONS, SORTS, filterHref, readFilter } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };

/**
 * 장터 결과(2026-10-26 금윤호: "예전 장터는 입구로, 지금 거르기 · 물건 화면은 결과로") — 입구(/market)에서 품목 · 검색 · '전체 보기'를 누르면 여기.
 * 품목 · 상태 · 지역 · 정렬 · 검색은 모두 주소에(새로 고쳐도 · 링크로 보내도 같은 목록, lib/market/specs.ts filterHref). 로그인 없이 본다.
 * PC: 왼쪽 184px 거르기 판 + 오른쪽 제목 · 정렬 · 카드 190~220 격자(2026-10-25 PC 개편 · 10-26 v2 그대로). 휴대폰 · 패드는 품목 줄 · 칩.
 * 입구의 로고 · 품목 바로가기 · 띠는 여기서 되풀이하지 않는다 — 고르고 견주는 화면이라 첫 물건이 위에 온다.
 * '장비 추천'(2026-10-23): 주소에 ?guide=1 이면 팝업(components/dugout/gear-guide.tsx). 고르기 어려운 품목 · 검색에만 옅은 한 줄.
 */
/** 규격을 몰라 망설이는 품목 — 이 화면들에만 '처음이라면' 한 줄을 띄운다 */
const GUIDE_CATEGORIES = new Set(['glove', 'bat', 'spikes', 'protector', 'ball']);
const withGuide = (href: string) => `${href}${href.includes('?') ? '&' : '?'}guide=1`;

export const metadata = { title: '장터 물건' };

export default async function MarketBrowsePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = readFilter((k) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]));
  const user = await getCurrentUser();
  const { items, hasMore } = await loadListings(f, user ? { id: user.id, role: user.role } : null);
  const now = new Date();
  const categoryLabel = f.category ? (CATEGORIES.find((c) => c.key === f.category)?.label ?? '물건') : null;
  const heading = f.q ? `‘${f.q}’ 검색 결과` : (categoryLabel ?? '전체 물건');

  const chip = (href: string, on: boolean, label: string) => (
    <Link key={href + label} href={href} scroll={false} data-nav="none" aria-current={on ? 'page' : undefined} className={chipClass(on)}>
      {label}
    </Link>
  );

  const sortLinks = (
    <div role="group" aria-label="정렬" className="flex gap-1 text-xs">
      {SORTS.map((s) => {
        const on = f.sort === s.key;
        return (
          <Link
            key={s.key}
            href={filterHref({ ...f, sort: s.key, page: 1 })}
            scroll={false}
            data-nav="none"
            aria-current={on ? 'page' : undefined}
            className={`rounded-full px-2.5 py-1 font-semibold ${on ? 'bg-ink text-page' : 'text-muted hover:text-ink'}`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-8 lg:space-y-0">
      {/* 품목 줄 — 휴대폰 · 패드만(PC 는 왼쪽 판이 품목 · 상태 · 지역을 다 가진다) */}
      <CategoryRow
        label="품목"
        className="-mt-2 lg:hidden"
        items={[{ key: undefined, label: '전체' }, ...CATEGORIES].map((c) => ({
          key: c.key ?? 'all',
          label: c.label,
          href: filterHref({ ...f, category: c.key, page: 1 }),
          on: f.category === c.key,
        }))}
      />

      {/* 거르기 판 184 + 간격 24 + 결과(1160 기준 952 — 220 카드 넷 = 940, 남는 12 는 그대로 둔다, v2 6절) */}
      <div className="lg:grid lg:grid-cols-[184px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* PC 왼쪽 거르기 판 — 위 막대 밑에 붙어 따라온다 */}
        <aside className="hidden min-w-0 lg:sticky lg:top-[calc(var(--dugout-bar-h)+1.5rem)] lg:block lg:max-h-[calc(100dvh-var(--dugout-bar-h)-3rem)] lg:overflow-y-auto lg:overscroll-contain">
          <MarketFilterRail f={f} />
        </aside>

        <section className="min-w-0 space-y-5">
          <DugoutPageHeader
            title={heading}
            /* 어디서 왔는지 — 입구로 돌아가는 길(장터 › 전체 물건 / 품목) */
            crumbs={[
              { label: '장터', href: '/market' },
              ...(f.q && categoryLabel ? [{ label: categoryLabel, href: filterHref({ category: f.category }) }] : []),
              { label: f.q ? '검색' : (categoryLabel ?? '전체 물건') },
            ]}
            actions={
              <>
                {f.q && (
                  <Link href={filterHref({ ...f, q: undefined, page: 1 })} className="text-sm font-semibold text-muted hover:text-ink">
                    검색 지우기
                  </Link>
                )}
                <div className="rounded-full bg-ink/5 p-1">{sortLinks}</div>
              </>
            }
          />
          {/* 고르기 어려운 품목 · 검색에만 — 잘 모르는 사람만 보고 지나가게 옅게 */}
          {(f.q || (f.category && GUIDE_CATEGORIES.has(f.category))) && (
            <Link
              href={withGuide(filterHref(f))}
              scroll={false}
              className="-mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
            >
              <RoundGear className="h-4 w-4 text-sky" />
              처음이라 무엇을 사야 할지 모르겠다면 · <span className="font-semibold text-sky">맞는 규격 추천받기 ›</span>
            </Link>
          )}

          {/* 휴대폰 · 패드 거르기 칩 — PC 는 왼쪽 판 */}
          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            <div className="no-scrollbar -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 md:mx-0 md:basis-auto md:px-0">
              {chip(filterHref({ ...f, region: undefined, page: 1 }), !f.region, '지역 전체')}
              {REGIONS.map((r) => chip(filterHref({ ...f, region: r, page: 1 }), f.region === r, r))}
            </div>
            {CONDITIONS.map((c) =>
              chip(filterHref({ ...f, condition: f.condition === c.key ? undefined : c.key, page: 1 }), f.condition === c.key, c.label)
            )}
            {chip(filterHref({ ...f, all: !f.all, page: 1 }), !!f.all, '거래 완료도')}
          </div>

          {items.length === 0 ? (
            <DugoutEmpty
              compact
              title="맞는 물건이 없어요"
              description="거르기를 풀거나 다른 말로 찾아 보세요."
              href={f.category || f.q || f.condition || f.region || f.all ? MARKET_BROWSE : '/market/new'}
              cta={f.category || f.q || f.condition || f.region || f.all ? '전체 물건 보기' : '물건 올리기'}
            />
          ) : (
            /* 카드 190~220px(v2 카드 크기 계약) — 큰 화면도 220 을 넘지 않는다. 휴대폰 2열 · 작은 패드 3열 */
            <div className={`${LISTING_GRID} lg:gap-x-5`}>
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
      </div>
      {/* 물건을 열 때 이 목록 주소를 적어 둔다 — 상세의 '‹ 장터'가 이 목록 · 굴린 자리로 돌아온다(components/dugout/market-back.tsx) */}
      <MarketListMemory />
      {/* 이 화면은 늘 동적이라 Suspense 로 감싸지 않는다 — 감싸면 바로 연 ?guide=1 에서 팝업이 늦게 살아났다 */}
      <GearGuide />
    </div>
  );
}
