import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundIcon, RoundSearch } from '@/components/round-icon';
import type { RoundIconName } from '@/lib/round-icons';
import { Badge } from '@/components/ui';
import { CategoryRow, DugoutEmpty, DugoutPageHeader, chipClass } from '@/components/dugout/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { categoryBadgeClass, relativeTime } from '@/components/community/community-format';
import { postCategoryLabel } from '@/lib/community';
import { specialtyLabel } from '@/lib/market/lessons';
import { formatPrice, isRegion } from '@/lib/market/specs';
import { getCurrentUser } from '@/lib/dal';
import { POPULAR_WORDS, SEARCH_TABS, isSearchTab, searchAll, type SearchTab } from '@/lib/search';

export const metadata: Metadata = { title: '통합검색' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * 덕아웃 통합검색(2026-10-24 금윤호: "검색을 하면 통합검색으로 넘어가지고, 당근 영상처럼 우리 사이트에서 통합검색이 되게") —
 * 당근 검색 결과 차례를 우리 모양으로: 위 큰 검색창 → 알약 탭(전체 · 장터 · 커뮤니티 · 레슨 · 연습장) → '“검색어” 검색 결과' →
 * 칸마다 둥근 판(제목 · 결과 · 아래 '더보기 ›'), 오른쪽 '많이 찾는 검색어'. 찾기는 lib/search.ts.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 50);
  const rawTab = one(sp.tab);
  const tab: SearchTab = isSearchTab(rawTab) ? rawTab : 'all';
  const rawRegion = one(sp.region);
  const region = isRegion(rawRegion) ? rawRegion : undefined;
  const user = await getCurrentUser();
  const viewer = user ? { id: user.id, role: user.role } : null;
  const r = q ? await searchAll(q, tab, region, viewer) : null;
  const now = new Date();

  const href = (t: SearchTab) => {
    const p = new URLSearchParams({ q });
    if (t !== 'all') p.set('tab', t);
    if (region) p.set('region', region);
    return `/search?${p.toString()}`;
  };
  const total = r
    ? r.features.length + r.listings.length + r.posts.length + r.coaches.length + r.venues.length
    : 0;
  const show = (t: SearchTab) => tab === 'all' || tab === t;

  return (
    <div className="space-y-6 pb-10">
      <DugoutPageHeader
        title={q ? `‘${q}’ 검색 결과` : '통합검색'}
        eyebrow={region || undefined}
        subtitle={q ? undefined : '물건 · 글 · 코치 · 연습장 · 기능을 한 번에 찾아요.'}
      />

      {/* 검색창 — 당근처럼 크게, 지운 뒤 다시 찾기 */}
      <form action="/search" method="get" role="search" className="max-w-3xl">
        {region && <input type="hidden" name="region" value={region} />}
        {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
        <label className="relative block">
          <RoundSearch className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!q}
            placeholder="물건 · 글 · 코치 · 연습장 · 기능을 한 번에"
            aria-label="통합검색"
            className="min-h-14 w-full appearance-none rounded-full border border-line bg-surface pr-24 pl-13 text-base text-ink shadow-sm placeholder:text-muted/70 focus:border-ink focus:outline-none"
          />
          {q && (
            <Link
              href="/search"
              aria-label="검색어 지우기"
              className="absolute top-1/2 right-14 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-lg text-muted hover:bg-ink/5 hover:text-ink"
            >
              ×
            </Link>
          )}
          <button
            type="submit"
            aria-label="찾기"
            className="absolute top-1/2 right-2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-ink text-page"
          >
            <RoundSearch className="h-4.5 w-4.5" />
          </button>
        </label>
      </form>

      {q && (
        <CategoryRow
          label="검색 칸"
          keepScroll
          items={SEARCH_TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key), on: tab === t.key }))}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          {!q ? (
            <DugoutEmpty title="찾고 싶은 것을 적어 주세요" description="많이 찾는 검색어를 눌러도 돼요." />
          ) : (
            <>
              {total === 0 && (
                <DugoutEmpty title={`‘${q}’에 맞는 결과가 없어요`} description="글자를 줄이거나 다른 말로 찾아 보세요." />
              )}

              {/* 바로가기 — 검색어가 기능 이름이면(구속 · 레슨 · 장비 …) 그 화면으로 */}
              {r && r.features.length > 0 && (
                <Panel icon="menu" title="바로가기">
                  <div className="grid gap-2 p-3 sm:grid-cols-2">
                    {r.features.map((f) => (
                      <Link
                        key={f.href}
                        href={f.href}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink/4"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky/12 text-sky">
                          <RoundIcon name={f.icon} filled className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-ink">
                            {f.label}
                            <span className="ml-1.5 text-xs font-medium text-muted">{f.group === 'sinker' ? '싱커' : '덕아웃'}</span>
                          </span>
                          <span className="block truncate text-xs text-muted">{f.desc}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </Panel>
              )}

              {r && show('market') && (r.listings.length > 0 || tab === 'market') && (
                <Panel
                  icon="market"
                  title="장터"
                  more={
                    tab === 'all' && r.listingsMore
                      ? href('market')
                      : tab === 'market'
                        ? `/market?q=${encodeURIComponent(q)}${region ? `&region=${encodeURIComponent(region)}` : ''}`
                        : undefined
                  }
                  moreLabel={tab === 'market' ? '장터에서 거르기' : undefined}
                >
                  {r.listings.length === 0 ? (
                    <Empty>맞는 물건이 없어요</Empty>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-4 sm:grid-cols-3">
                      {r.listings.map((item) => (
                        <ListingCard key={item.id} item={item} now={now} />
                      ))}
                    </div>
                  )}
                </Panel>
              )}

              {r && show('community') && (r.posts.length > 0 || tab === 'community') && (
                <Panel icon="community" title="커뮤니티" more={tab === 'all' && r.posts.length >= 5 ? href('community') : undefined}>
                  {r.posts.length === 0 ? (
                    <Empty>맞는 글이 없어요</Empty>
                  ) : (
                    <ul className="divide-y divide-line">
                      {r.posts.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={user ? `/community/${p.id}` : `/login?next=/community/${p.id}`}
                            className="block px-5 py-4 transition-colors hover:bg-ink/3"
                          >
                            <span className="block truncate text-[15px] font-bold text-ink">{p.title}</span>
                            <span className="mt-1 block truncate text-[13px] text-muted">{p.preview}</span>
                            <span className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                              <Badge className={categoryBadgeClass(p.category)}>{postCategoryLabel(p.category)}</Badge>
                              <span>{relativeTime(p.createdAt, now)}</span>
                              <span>· 좋아요 {p.likes} · 댓글 {p.comments}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              {r && show('lessons') && (r.coaches.length > 0 || tab === 'lessons') && (
                <Panel icon="lesson" title="레슨 코치" more={tab === 'all' && r.coaches.length >= 4 ? href('lessons') : undefined}>
                  {r.coaches.length === 0 ? (
                    <Empty>맞는 코치가 없어요</Empty>
                  ) : (
                    <ul className="divide-y divide-line">
                      {r.coaches.map((c) => (
                        <li key={c.id}>
                          <Link href={`/lessons/${c.id}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-ink/3">
                            <CoachAvatar name={c.coach} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold text-ink">
                                {c.name} <span className="text-xs font-medium text-muted">{c.coach} 코치</span>
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                                <Stars rating={c.rating} reviews={c.reviews} />
                                {c.specialties.length > 0 && <span className="truncate">· {c.specialties.map(specialtyLabel).join(' · ')}</span>}
                                {c.region && <span className="shrink-0">· {c.region}</span>}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-bold text-ink">
                              {c.trialPrice != null ? `체험 ${formatPrice(c.trialPrice)}` : c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : ''}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              {r && show('venues') && (r.venues.length > 0 || tab === 'venues') && (
                <Panel icon="venue" title="연습장" more={tab === 'all' && r.venues.length >= 4 ? href('venues') : undefined}>
                  {r.venues.length === 0 ? (
                    <Empty>맞는 연습장이 없어요</Empty>
                  ) : (
                    <ul className="divide-y divide-line">
                      {r.venues.map((v) => (
                        <li key={v.id}>
                          <Link href={`/venues/${v.id}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-ink/3">
                            <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink/5 text-sky">
                              {v.image ? (
                                // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)
                                <img src={v.image} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <RoundIcon name="venue" filled className="h-6 w-6" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold text-ink">{v.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                {v.region}
                                {v.address ? ` · ${v.address}` : ''}
                              </span>
                            </span>
                            {v.pricePerSlot != null && (
                              <span className="shrink-0 text-sm font-bold text-ink">{formatPrice(v.pricePerSlot)}~</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
            </>
          )}
        </div>

        {/* 오른쪽 — 많이 찾는 검색어(당근 '인기 검색어' 자리) */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="flex items-center gap-1.5 text-base font-bold text-ink">
              <RoundSearch className="h-4.5 w-4.5" /> 많이 찾는 검색어
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {POPULAR_WORDS.map((w) => (
                <Link
                  key={w}
                  href={`/search?q=${encodeURIComponent(w)}`}
                  className={chipClass(w === q)}
                >
                  {w}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  more,
  moreLabel = '더보기',
  children,
}: {
  icon: RoundIconName;
  title: string;
  more?: string;
  moreLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-base font-bold text-ink">
        <RoundIcon name={icon} filled className="h-5 w-5 text-sky" />
        {title}
      </h2>
      {children}
      {more && (
        <Link
          href={more}
          className="flex min-h-12 items-center justify-center border-t border-line text-sm font-semibold text-muted transition-colors hover:bg-ink/3 hover:text-ink"
        >
          {moreLabel} ›
        </Link>
      )}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}
