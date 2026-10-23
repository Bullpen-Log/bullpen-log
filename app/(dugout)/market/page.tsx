import Link from 'next/link';
import { RoundPlus } from '@/components/round-icon';
import { Card } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { getCurrentUser } from '@/lib/dal';
import { loadListings } from '@/lib/market/load';
import { CATEGORIES, CONDITIONS, REGIONS, SORTS, filterHref, readFilter } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };

/**
 * 장터 목록(2026-10-20) — 품목 · 상태 · 지역 · 정렬 · 검색은 모두 주소에(새로 고쳐도 · 링크로 보내도 같은 목록). 로그인 없이 본다.
 * 모양은 번개장터(2026-10-23 금윤호) — 위에 굵은 품목 줄(밑줄로 지금 것), 그 밑 작은 거르기 한 줄, '오늘의 추천 물건' 제목, 테두리 없는 사진 격자 6열.
 * 검색 칸은 위 막대 가운데(components/dugout/dugout-topbar.tsx)라 여기엔 없다.
 */
export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = readFilter((k) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]));
  const user = await getCurrentUser();
  const { items, hasMore } = await loadListings(f, user ? { id: user.id, role: user.role } : null);
  const now = new Date();
  const filtered = !!(f.q || f.region || f.condition || f.all);
  const heading = f.q
    ? `‘${f.q}’ 검색 결과`
    : f.category
      ? `${CATEGORIES.find((c) => c.key === f.category)?.label ?? ''} 물건`
      : filtered
        ? '맞는 물건'
        : '오늘의 추천 물건';

  const tab = (href: string, on: boolean, label: string) => (
    <Link
      key={href + label}
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`relative flex min-h-11 shrink-0 items-center px-1 text-[15px] font-bold whitespace-nowrap transition-colors ${
        on ? 'text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );
  const chip = (href: string, on: boolean, label: string) => (
    <Link
      key={href + label}
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
        on ? 'bg-ink text-white' : 'bg-ink/6 text-ink hover:bg-ink/10'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      {/* 품목 줄 — 번개장터 둘째 줄처럼 굵은 글 · 밑줄 */}
      <div className="-mx-4 flex items-center gap-5 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {tab(filterHref({ ...f, category: undefined, page: 1 }), !f.category, '전체')}
        {CATEGORIES.map((c) => tab(filterHref({ ...f, category: c.key, page: 1 }), f.category === c.key, c.label))}
        <Link
          href="/market/new"
          className="ml-auto hidden min-h-9 shrink-0 items-center gap-1 rounded-full bg-sky px-3.5 text-xs font-semibold text-white hover:bg-sky-strong md:inline-flex"
        >
          <RoundPlus className="h-3.5 w-3.5" /> 물건 올리기
        </Link>
      </div>

      {/* 거르기 — 작은 회색 알약 한 줄, 정렬은 오른쪽 끝 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 md:mx-0 md:basis-auto md:px-0">
          {chip(filterHref({ ...f, region: undefined, page: 1 }), !f.region, '지역 전체')}
          {REGIONS.map((r) => chip(filterHref({ ...f, region: r, page: 1 }), f.region === r, r))}
        </div>
        <span className="hidden h-4 w-px bg-line md:block" />
        {CONDITIONS.map((c) => chip(filterHref({ ...f, condition: f.condition === c.key ? undefined : c.key, page: 1 }), f.condition === c.key, c.label))}
        {chip(filterHref({ ...f, all: !f.all, page: 1 }), !!f.all, '거래 완료도')}
        <span className="ml-auto flex gap-1">
          {SORTS.map((s) => chip(filterHref({ ...f, sort: s.key, page: 1 }), f.sort === s.key, s.label))}
        </span>
      </div>

      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-black text-ink">{heading}</h1>
        {f.q && (
          <Link href="/market" className="text-xs font-semibold text-sky">
            검색 지우기
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="space-y-2 py-10 text-center">
          <p className="text-sm font-semibold text-ink">맞는 물건이 없어요</p>
          <p className="text-xs text-muted">거르기를 풀거나, 찾는 물건을 글로 올려 보세요.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <ListingCard key={item.id} item={item} now={now} />
          ))}
        </div>
      )}

      <div className="flex justify-between">
        {f.page > 1 ? (
          <Link href={filterHref({ ...f, page: f.page - 1 })} className="text-sm font-semibold text-sky">
            이전
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={filterHref({ ...f, page: f.page + 1 })} className="text-sm font-semibold text-sky">
            다음
          </Link>
        )}
      </div>
    </div>
  );
}
