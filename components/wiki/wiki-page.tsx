'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeading } from '@/components/ui';
import { WIKI_BASE, WIKI_NAME, type WikiCategoryId } from '@/lib/wiki';
import { WikiDataProvider, useWiki } from '@/lib/wiki/context';
import { ArticleBody } from './article-body';
import { WikiGlossary } from './wiki-glossary';
import { WikiHome } from './wiki-home';
import { useWikiRead } from './use-wiki-read';

export function WikiPage({ ownerId, slug, query = '', category = null }: {
  ownerId: string;
  slug?: string;
  query?: string;
  category?: WikiCategoryId | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const read = useWikiRead(ownerId, attempt);

  if (read?.status !== 'ready') {
    return (
      <section className="space-y-4">
        <PageHeading title={WIKI_NAME} />
        <p role="status" className="text-sm text-muted">
          {read?.status === 'denied' ? '로그인하면 싱커위키를 열 수 있어요.' :
            read?.status === 'unavailable' ? '싱커위키를 불러오지 못했어요.' : '싱커위키를 불러오는 중이에요.'}
        </p>
        {read?.status === 'unavailable' && (
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 text-sm text-link underline">
            다시 시도
          </button>
        )}
      </section>
    );
  }
  return (
    <WikiDataProvider snapshot={read.snapshot}>
      <WikiGlossary>
        {slug ? <WikiArticle slug={slug} /> : <WikiHome initialQuery={query} initialCategory={category} />}
      </WikiGlossary>
    </WikiDataProvider>
  );
}

function WikiArticle({ slug }: { slug: string }) {
  const article = useWiki().wikiBySlug(slug);
  return (
    <div className="mx-auto w-full max-w-[45rem] space-y-4">
      <Link href={WIKI_BASE} className="inline-flex min-h-11 items-center text-sm text-link">‹ {WIKI_NAME}</Link>
      {article.kind === 'article' ? (
        <ArticleBody article={article.article} nav={{ kind: 'page' }} headingId="wiki-article-title" />
      ) : article.kind === 'retracted' ? (
        <section className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
          <h1 className="text-2xl font-bold text-ink">{article.title}</h1>
          <p className="text-base text-ink">이 글은 {article.at}에 내렸어요.</p>
          <p className="text-sm text-muted">까닭: {article.reason}</p>
        </section>
      ) : (
        <p data-wiki-not-found="">아직 쓰지 않았거나 주소가 바뀐 글이에요.</p>
      )}
    </div>
  );
}
