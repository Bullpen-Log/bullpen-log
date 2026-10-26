import Link from 'next/link';
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
import { LISTING_GRID, ListingCard } from '@/components/dugout/listing-card';
import { CategoryRow, DugoutEmpty, DugoutPageHeader, ShortcutTiles, chipClass, type Shortcut } from '@/components/dugout/ui';
import { GearGuide } from '@/components/dugout/gear-guide';
import { MarketFilterRail } from '@/components/dugout/market-filter-rail';
import { getCurrentUser } from '@/lib/dal';
import { loadListings } from '@/lib/market/load';
import { CATEGORIES, CONDITIONS, REGIONS, SORTS, filterHref, readFilter } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };

/**
 * 장터(2026-10-20) — 품목 · 상태 · 지역 · 정렬 · 검색은 모두 주소에(새로 고쳐도 · 링크로 보내도 같은 목록). 로그인 없이 본다.
 * 모양은 번개장터 그대로(2026-10-23 금윤호: "장터는 번개장터 느낌을 최대한") — 흰 바탕, 굵은 품목 글 줄, 가운데 동그란 바로가기 줄,
 * '오늘의 추천 물건' 큰 제목, 테두리 없는 사진 격자. 검색은 위 막대.
 * PC(2026-10-25 덕아웃 PC 개편, docs/designs/dugout-desktop-information-design.md): 품목 줄 · 바로가기 대신 왼쪽 216px 거르기 판(품목 · 상태 · 지역 select · 거래 완료)
 * + 오른쪽 제목 · 정렬 · 3~4열 격자 — 첫 물건이 1280×720 에서 240px 안에 보인다. 휴대폰 · 패드는 품목 줄 · 칩 그대로.
 * '장비 추천'(2026-10-23 — 따로 있던 /gear 를 장터 안으로): 주소에 ?guide=1 이면 팝업(components/dugout/gear-guide.tsx).
 * 입구는 바로가기 한 칸과, 글러브 · 배트처럼 고르기 어려운 품목 화면의 옅은 한 줄뿐 — 아는 사람 눈에는 거의 안 띈다.
 */
/** 규격을 몰라 망설이는 품목 — 이 화면들에만 '처음이라면' 한 줄을 띄운다 */
const GUIDE_CATEGORIES = new Set(['glove', 'bat', 'spikes', 'protector', 'ball']);
const withGuide = (href: string) => `${href}${href.includes('?') ? '&' : '?'}guide=1`;
const SHORTCUTS: Shortcut[] = [
  { href: '/me#favorites', label: '찜', icon: RoundHeart },
  { href: '/market/new', label: '내 물건 팔기', icon: RoundPlus },
  { href: filterHref({ category: 'glove' }), label: '글러브', icon: RoundBaseball },
  { href: filterHref({ category: 'bat' }), label: '배트', icon: RoundBat },
  { href: filterHref({ category: 'protector' }), label: '보호구', icon: RoundShield },
  { href: filterHref({ category: 'uniform' }), label: '유니폼', icon: RoundUser },
  { href: '/market?guide=1', label: '장비 추천', icon: RoundGear, scroll: false },
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
      className={chipClass(on)}
    >
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
      {/* 품목 줄 · 바로가기 — 휴대폰 · 패드만(PC 는 왼쪽 판이 품목 · 상태 · 지역을 다 가진다, 2026-10-25 PC 개편) */}
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
      {landing && <ShortcutTiles items={SHORTCUTS} className="lg:hidden" />}

      {/* 거르기 판 184 + 간격 24 + 결과(1160 기준 952 — 220 카드 넷 = 940, 남는 12 는 그대로 둔다, v2 6절) */}
      <div className="lg:grid lg:grid-cols-[184px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* PC 왼쪽 거르기 판 — 위 막대 밑에 붙어 따라온다 */}
        <aside className="hidden min-w-0 lg:sticky lg:top-[calc(var(--dugout-bar-h)+1.5rem)] lg:block lg:max-h-[calc(100dvh-var(--dugout-bar-h)-3rem)] lg:overflow-y-auto lg:overscroll-contain">
          <MarketFilterRail f={f} />
        </aside>

        <section className="min-w-0 space-y-5">
          <DugoutPageHeader
            title={heading}
            subtitle={landing ? '방금 올라온 물건부터 보여요.' : undefined}
            actions={
              <>
                {f.q && (
                  <Link href="/market" className="text-sm font-semibold text-muted hover:text-ink">
                    검색 지우기
                  </Link>
                )}
                <div className="rounded-full bg-ink/5 p-1">{sortLinks}</div>
              </>
            }
          />
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

          {/* 휴대폰 · 패드 거르기 칩 — PC 는 왼쪽 판 */}
          {!landing && (
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
          )}

          {items.length === 0 ? (
            <DugoutEmpty
              title={landing ? '아직 올라온 물건이 없어요' : '맞는 물건이 없어요'}
              description={landing ? '안 쓰는 글러브 · 배트를 첫 물건으로 올려 보세요.' : '거르기를 풀거나 다른 말로 찾아 보세요.'}
              href="/market/new"
              cta="물건 올리기"
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
      {/* 이 화면은 늘 동적이라 Suspense 로 감싸지 않는다 — 감싸면 바로 연 ?guide=1 에서 팝업이 늦게 살아났다 */}
      <GearGuide />
    </div>
  );
}
