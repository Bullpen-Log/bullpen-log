'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Info } from '@/components/icon';
import {
  MISSING_PHOTO_TEXT,
  WIKI_TEXT,
  articleSourceIds,
  categoryLabel,
  claimSourceLine,
  otherNames,
  provenanceLines,
  seeAlsoIds,
  sourceChecksLine,
  sourceMetaLine,
  wikiHref,
  type WikiArticle,
  type WikiSection,
} from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { WikiDisclosure } from './disclosure';
import { BallArc, CategoryBadge } from './wiki-motif';
import { WikiPhoto } from './wiki-photo';
import { WikiProse } from './wiki-prose';

/**
 * 싱커위키 글 본문(R1) — 페이지(/training/wiki/[slug])와 뜻 창(자세히 읽기)이 같이 쓴다.
 * 처음 보이는 것: 묶음 · 꼬리표 → 제목 → 한 줄 뜻 → 예를 들면(장비면 사진) → 꼭 알아둘 점(1~2개, 접지 않음) → 같이 보면 좋은 말.
 * 나머지는 펼쳐서: 자세한 설명(원래 본문 그대로) · 근거와 출처(주장마다 자료 · 한계) · 편집 정보(판 · 작성 · 검토).
 * 이어진 글은 페이지에서는 주소로, 창 안에서는 창 안 이동(onOpen)으로 연다 — 창을 닫지 않는다.
 */
export type ArticleNav = { kind: 'page' } | { kind: 'dialog'; onOpen: (id: string) => void };

/**
 * 읽는 글 크기 — PC 화면 기준(globals.css 'PC 화면의 크기 기준')은 text-base 를 15px 로 낮추는데, 위키 본문은 웹에서 16px 아래로
 * 내리지 않는다(R1 설계: 글 양을 줄이지 글자를 줄이지 않음). 공용 CSS 는 그대로 두고 위키 글 · 뜻 창 안에서만 두 값을 덮는다.
 * 휴대폰은 이미 17px(text-base) · 18px(text-lg)라 그대로.
 */
export const WIKI_READING_SIZE = 'desk:[--text-base:1rem] desk:[--text-lg:1.125rem]';

/** 묶음 · 코칭 표현 꼬리표 — 작게 한 줄 */
export function ArticleChips({ article }: { article: WikiArticle }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="inline-flex items-center gap-1.5">
        <CategoryBadge id={article.category} size="sm" />
        {categoryLabel(article.category)}
      </span>
      {article.label ? <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs text-warn">{article.label}</span> : null}
    </p>
  );
}

/** 꼭 알아둘 점 — 늘 보인다(코칭 표현인지 · 측정 한계 같은 것은 접지 않는다) */
export function KeyPoints({ article }: { article: WikiArticle }) {
  return (
    <section aria-label={WIKI_TEXT.keyPoints} className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">{WIKI_TEXT.keyPoints}</h2>
      <ul className="space-y-2">
        {article.reading.keyPoints.map((k, i) => (
          <li key={i} data-wiki-reading="" className="flex gap-2 text-base leading-relaxed text-ink">
            <Info aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted" />
            <span>{k}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({ section, exclude }: { section: WikiSection; exclude: string }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-ink">{section.heading}</h3>
      {section.paragraphs.map((p, i) => (
        <p key={i} data-wiki-reading="" className="text-base leading-[1.75] text-ink">
          <WikiProse text={p} options={{ exclude: [exclude] }} />
        </p>
      ))}
      {section.bullets?.length ? (
        <ul data-wiki-reading="" className="list-disc space-y-1 pl-5 text-base leading-relaxed text-ink marker:text-muted">
          {section.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ArticleLink({ id, nav, children }: { id: string; nav: ArticleNav; children: ReactNode }) {
  const { wikiById } = useWiki();
  const a = wikiById(id);
  if (!a) return null;
  const cls =
    'inline-flex min-h-10 items-center rounded-full border border-dugout/30 bg-dugout/8 px-3.5 text-sm text-ink hover:bg-dugout/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky';
  return nav.kind === 'page' ? (
    <Link href={wikiHref(a.slug)} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={() => nav.onOpen(id)} className={cls}>
      {children}
    </button>
  );
}

export function ArticleBody({ article, nav, headingId }: { article: WikiArticle; nav: ArticleNav; headingId?: string }) {
  const { assetById, sourceById, wikiById } = useWiki();
  const assets = (article.assetIds ?? []).map(assetById).filter((a) => a !== undefined);
  const [lead, ...morePhotos] = assets;
  const sourceIds = articleSourceIds(article);
  const also = seeAlsoIds(article).filter((id) => wikiById(id));
  const others = otherNames(article);
  return (
    <article className={`space-y-6 ${WIKI_READING_SIZE}`} aria-labelledby={headingId}>
      <header className="space-y-3">
        <ArticleChips article={article} />
        {/* 뜻 창에서는 창 머리(공통 Modal)가 제목을 보여 두 번 쓰지 않는다 */}
        {nav.kind === 'page' ? (
          <h1 id={headingId} className="text-2xl font-bold leading-tight tracking-tight text-ink">
            {article.title}
          </h1>
        ) : null}
        <p data-wiki-reading="" className="text-lg leading-relaxed text-ink">{article.summary}</p>
      </header>

      <section aria-label={WIKI_TEXT.example} className="overflow-hidden rounded-2xl bg-surface">
        <div className="space-y-2 p-(--block-pad)">
          <p className="flex items-center gap-2 text-sm font-semibold text-dugout">
            <BallArc className="h-5 w-11" />
            {WIKI_TEXT.example}
          </p>
          <p data-wiki-reading="" className="text-base leading-relaxed text-ink">{article.reading.example}</p>
        </div>
        {lead ? <WikiPhoto asset={lead} frame={false} /> : null}
      </section>

      <KeyPoints article={article} />

      {also.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{WIKI_TEXT.seeAlso}</h2>
          <div className="flex flex-wrap gap-2">
            {also.map((id) => (
              <ArticleLink key={id} id={id} nav={nav}>
                {wikiById(id)!.title}
              </ArticleLink>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        <WikiDisclosure title={WIKI_TEXT.detail} name="detail">
          <p className="text-sm text-muted" lang="en">
            {WIKI_TEXT.englishLine(article.english, others)}
          </p>
          <Section section={article.encounter} exclude={article.id} />
          <Section section={article.explain} exclude={article.id} />
          {morePhotos.map((a) => (
            <WikiPhoto key={a.id} asset={a} />
          ))}
          {article.category === 'equipment' && !lead ? <p className="text-sm text-muted">{MISSING_PHOTO_TEXT}</p> : null}
          <Section section={article.notEstablished} exclude={article.id} />
        </WikiDisclosure>

        <WikiDisclosure title={WIKI_TEXT.evidenceTitle} name="evidence">
          <p className="text-sm leading-relaxed text-muted">{WIKI_TEXT.evidenceIntro}</p>
          <ol className="space-y-3">
            {article.claims.map((c) => (
              <li key={c.id} data-wiki-reading="" className="rounded-2xl border border-line p-4 text-base leading-relaxed text-ink">
                <p>{c.text}</p>
                <p className="mt-2 text-xs text-muted">{claimSourceLine(c)}</p>
              </li>
            ))}
          </ol>
          {sourceIds.length ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted">{WIKI_TEXT.sources}</h3>
              <ul className="space-y-3">
                {sourceIds.map((id) => {
                  const s = sourceById(id);
                  if (!s) return null;
                  return (
                    <li key={id} className="space-y-1 rounded-2xl border border-line p-4 text-sm leading-relaxed text-ink">
                      <p className="font-medium">
                        <span className="mr-1 text-muted">{s.id}</span>
                        {s.url.startsWith('https://') ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">
                            {s.title}
                          </a>
                        ) : (
                          <span>{s.title}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">{sourceMetaLine(s)}</p>
                      {s.population ? <p className="text-xs">대상: {s.population}</p> : null}
                      {s.measured ? <p className="text-xs">잰 것: {s.measured}</p> : null}
                      <p className="text-xs">한계: {s.limits}</p>
                      <p className="text-xs text-muted">{sourceChecksLine(s)}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </WikiDisclosure>

        <WikiDisclosure title={WIKI_TEXT.editInfo} name="edit">
          <div className="space-y-1 text-sm leading-relaxed text-muted">
            {provenanceLines(article).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </WikiDisclosure>
      </div>
      <p className="text-sm leading-relaxed text-muted">{WIKI_TEXT.homeNote}</p>
    </article>
  );
}
