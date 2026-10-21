import Link from 'next/link';
import { RoundPlus, RoundSearch } from '@/components/round-icon';
import { Card } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { getCurrentUser } from '@/lib/dal';
import { loadListings } from '@/lib/market/load';
import { CATEGORIES, CONDITIONS, REGIONS, SORTS, filterHref, readFilter } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };

/** 장터 목록(2026-10-20) — 품목 · 상태 · 지역 · 정렬 · 검색은 모두 주소에(새로 고쳐도 · 링크로 보내도 같은 목록). 로그인 없이 본다 */
export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = readFilter((k) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]));
  const user = await getCurrentUser();
  const { items, hasMore } = await loadListings(f, user ? { id: user.id, role: user.role } : null);
  const now = new Date();
  const chip = (href: string, on: boolean, label: string) => (
    <Link
      key={href + label}
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold whitespace-nowrap transition-colors ${
        on ? 'bg-sky text-white' : 'border border-line bg-surface text-ink hover:border-sky-soft'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-ink">장터</h1>
        <Link href="/market/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-sky px-4 text-sm font-semibold text-white hover:bg-sky-strong">
          <RoundPlus className="h-4 w-4" /> 물건 올리기
        </Link>
      </div>

      <form method="get" action="/market" className="flex gap-2">
        {f.category && <input type="hidden" name="category" value={f.category} />}
        {f.region && <input type="hidden" name="region" value={f.region} />}
        {f.condition && <input type="hidden" name="condition" value={f.condition} />}
        <label className="relative flex-1">
          <RoundSearch className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            type="search"
            defaultValue={f.q ?? ''}
            placeholder="찾는 물건"
            className="min-h-11 w-full rounded-xl border border-line bg-surface pr-4 pl-11 text-sm text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
          />
        </label>
      </form>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex gap-2">
          {chip(filterHref({ ...f, category: undefined, page: 1 }), !f.category, '전체')}
          {CATEGORIES.map((c) => chip(filterHref({ ...f, category: c.key, page: 1 }), f.category === c.key, c.label))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="-mx-4 flex basis-full gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {chip(filterHref({ ...f, region: undefined, page: 1 }), !f.region, '지역 전체')}
          {REGIONS.map((r) => chip(filterHref({ ...f, region: r, page: 1 }), f.region === r, r))}
        </div>
        {CONDITIONS.map((c) => chip(filterHref({ ...f, condition: f.condition === c.key ? undefined : c.key, page: 1 }), f.condition === c.key, c.label))}
        <span className="ml-auto flex gap-1">
          {SORTS.map((s) => chip(filterHref({ ...f, sort: s.key, page: 1 }), f.sort === s.key, s.label))}
        </span>
        {chip(filterHref({ ...f, all: !f.all, page: 1 }), !!f.all, '거래 완료도')}
      </div>

      {items.length === 0 ? (
        <Card className="space-y-2 py-10 text-center">
          <p className="text-sm font-semibold text-ink">맞는 물건이 없어요</p>
          <p className="text-xs text-muted">거르기를 풀거나, 찾는 물건을 글로 올려 보세요.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
