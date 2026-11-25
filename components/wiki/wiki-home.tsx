'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { RotateCcw, Search, X } from '@/components/icon';
import { PageHeading } from '@/components/ui';
import {
  WIKI_CATEGORIES,
  WIKI_NAME,
  WIKI_SUBTITLE,
  WIKI_TEXT,
  categoryLabel,
  matchHint,
  wikiHref,
  type WikiCategoryId,
} from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { BallArc, CategoryBadge } from './wiki-motif';
import { PhotoCredit } from './wiki-photo';

/**
 * 싱커위키 홈(R1) — 싱커 화면 틀 안(/training/wiki). 처음엔 둘러보기: 검색 · 묶음 그림 다섯 · 먼저 알아두면 좋은 말 넷 · 장비 사진 둘.
 * 찾거나 묶음을 고르면 그 자리에 맞는 글만(짧은 카드) — 아래에 같은 목록을 또 깔지 않는다. 준비 중인 말은 접어 둔다.
 * 검색어 · 묶음은 주소(?q= · ?cat=)에 replaceState 로만 적는다 — 글을 열었다 돌아와도 남고, 글자마다 기록 칸이 쌓이지 않는다.
 * 조회수 · 인기 · 의학적 확신 같은 지어낸 숫자를 보이지 않는다(묶음 옆 숫자는 글 수).
 */

const isCategory = (v: string | null): v is WikiCategoryId => WIKI_CATEGORIES.some((c) => c.id === v);

export function WikiHome({
  initialQuery,
  initialCategory,
  hrefOf = wikiHref,
}: {
  initialQuery: string;
  initialCategory: WikiCategoryId | null;
  /** 글 주소 — 기본은 /training/wiki/[slug]. 개발 서버 미리보기(app/wiki/dev/preview)만 자기 주소로 바꾼다 */
  hrefOf?: (slug: string) => string;
}) {
  /* 처음 값은 지금 주소에서 — 글을 열었다 뒤로 오면 이 화면이 다시 붙는데, 서버가 그린 값(initial*)은 검색어를 적기 전 것일 수 있다 */
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? initialQuery);
  const [category, setCategory] = useState<WikiCategoryId | null>(() => {
    const c = params.get('cat');
    return isCategory(c) ? c : initialCategory;
  });
  const inputId = useId();
  const { assetById, photoUri, searchWikiArticles, wikiArticles, wikiById, firstTerms, photoGear } = useWiki();
  const hits = useMemo(() => searchWikiArticles(query, category), [query, category, searchWikiArticles]);
  const all = wikiArticles();
  const searching = query.trim().length > 0;
  const browsing = !searching && !category;

  /* 주소에만 조용히 적는다(기록 칸을 늘리지 않음) */
  useEffect(() => {
    const id = setTimeout(() => {
      const url = new URL(window.location.href);
      if (query.trim()) url.searchParams.set('q', query.trim());
      else url.searchParams.delete('q');
      if (category) url.searchParams.set('cat', category);
      else url.searchParams.delete('cat');
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
    }, 250);
    return () => clearTimeout(id);
  }, [query, category, searchWikiArticles]);

  const counts = useMemo(() => {
    const m = new Map<WikiCategoryId, number>();
    for (const a of all) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return m;
  }, [all]);

  const first = firstTerms.map((id) => wikiById(id)).filter((a) => a !== undefined);
  const gear = photoGear.map((id) => wikiById(id)).filter((a) => a !== undefined);
  const card =
    'rounded-2xl bg-surface transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky';

  return (
    <div data-wiki-home="" className="stack-page">
      <PageHeading title={WIKI_NAME} description={WIKI_SUBTITLE} />

      <div role="search" className="space-y-4">
        <label htmlFor={inputId} className="sr-only">
          {WIKI_TEXT.searchLabel}
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-sky">
          <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={WIKI_TEXT.searchPlaceholder}
            autoComplete="off"
            enterKeyHint="search"
            className="min-h-12 w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={WIKI_TEXT.clearQuery} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2">
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="묶음으로 거르기">
          {WIKI_CATEGORIES.filter((c) => counts.get(c.id)).map((c) => {
            const on = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                data-wiki-category={c.id}
                aria-pressed={on}
                onClick={() => setCategory(on ? null : c.id)}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky ${
                  on ? 'border-dugout bg-dugout/12' : 'border-transparent bg-surface hover:bg-surface-2'
                }`}
              >
                <CategoryBadge id={c.id} />
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-ink">{c.label}</span>
                  <span className="block text-sm text-muted">{counts.get(c.id)}편</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {browsing ? (
        <>
          <section className="space-y-3" aria-labelledby={`${inputId}-first`}>
            <h2 id={`${inputId}-first`} className="text-lg font-semibold text-ink">
              {WIKI_TEXT.firstTerms}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {first.map((a) => (
                <li key={a.id}>
                  <Link href={hrefOf(a.slug)} className={`${card} flex h-full flex-col gap-2 p-(--block-pad)`}>
                    <BallArc className="h-5 w-11" />
                    <span className="text-base font-semibold text-ink">{a.title}</span>
                    <span className="text-sm leading-relaxed text-muted">{a.reading.card}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3" aria-labelledby={`${inputId}-gear`}>
            <h2 id={`${inputId}-gear`} className="text-lg font-semibold text-ink">
              {WIKI_TEXT.equipmentTitle}
            </h2>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {gear.map((a) => {
                const photo = a.assetIds?.[0] ? assetById(a.assetIds[0]) : undefined;
                /*
                 * 카드 = 사진 한 장의 쓰임(figure). 글로 가는 링크는 사진 · 이름 · 한 줄만 감싸고, 출처(작성자 · 라이선스 · 사진 정보)는 그 밑
                 * figcaption 에 형제로 둔다 — 원본 · 라이선스 링크가 글 링크 안에 겹치지 않는다. 이 칸은 사진을 4:3 으로 잘라 보여 그 말도 사진 정보에.
                 */
                return (
                  <li key={a.id}>
                    <figure data-wiki-home-photo={photo?.id ?? ''} className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface">
                      <Link href={hrefOf(a.slug)} className="block rounded-t-2xl transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 저장소 안의 고정 사진(출처는 이 카드 밑 figcaption)
                          <img src={photoUri(photo.id)} alt={photo.alt} width={photo.width} height={photo.height} decoding="async" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                        ) : null}
                        <span className="block space-y-1 px-4 pt-3 pb-2">
                          <span className="block text-base font-semibold text-ink">{a.title}</span>
                          <span className="block text-sm leading-relaxed text-muted">{a.reading.card}</span>
                        </span>
                      </Link>
                      {photo ? (
                        <figcaption className="px-4 pb-1 text-xs leading-relaxed text-muted">
                          <PhotoCredit asset={photo} displayNote={WIKI_TEXT.homeCropNote} name="home-photo-info" />
                        </figcaption>
                      ) : null}
                    </figure>
                  </li>
                );
              })}
              {/* 사진이 없는 장비는 사진을 지어내지 않고 이름만 — 누르면 장비 글 모두 */}
              <li className="col-span-2 lg:col-span-1">
                <button type="button" onClick={() => setCategory('equipment')} className={`${card} flex h-full w-full flex-col items-start justify-center gap-2 p-(--block-pad) text-left`}>
                  <CategoryBadge id="equipment" />
                  <span className="text-base font-semibold text-ink">{WIKI_TEXT.equipmentButton(counts.get('equipment') ?? 0)}</span>
                  <span className="text-sm leading-relaxed text-muted">
                    {all
                      .filter((a) => a.category === 'equipment' && !photoGear.includes(a.id))
                      .map((a) => a.title)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            </ul>
          </section>

        </>
      ) : (
        <section aria-live="polite" aria-label="찾은 글" className="space-y-3">
          <p className="text-sm text-muted">
            {searching ? `"${query.trim()}"` : categoryLabel(category!)} {WIKI_TEXT.resultCount(hits.length)}
          </p>
          {hits.length === 0 ? (
            <div data-wiki-empty="" className="space-y-3 rounded-2xl border border-dashed border-line px-4 py-6">
              <p className="text-base text-ink">{WIKI_TEXT.noResult}</p>
              <p className="text-sm text-muted">{WIKI_TEXT.noResultHint}</p>
              <div className="flex flex-wrap gap-2">
                {query ? (
                  <button type="button" data-wiki-reset="query" onClick={() => setQuery('')} className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink">
                    <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                    {WIKI_TEXT.clearQuery}
                  </button>
                ) : null}
                {category ? (
                  <button type="button" data-wiki-reset="category" onClick={() => setCategory(null)} className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink">
                    {WIKI_TEXT.clearCategory}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <ul data-wiki-results="" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hits.map((h) => {
                const hint = matchHint(h);
                return (
                  <li key={h.article.id}>
                    <Link href={hrefOf(h.article.slug)} className={`${card} flex h-full items-start gap-3 px-4 py-3.5`}>
                      <CategoryBadge id={h.article.category} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-ink">{h.article.title}</span>
                        <span className="block text-sm leading-relaxed text-muted">
                          {h.article.reading.card}
                          {hint ? <span className="text-xs"> · {hint}</span> : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted">{WIKI_TEXT.homeNote}</p>
    </div>
  );
}
