import { WIKI_CATEGORIES } from '@/lib/wiki/categories';
import { compactWikiText, normalizeWikiText } from '@/lib/wiki/normalize';
import type { WikiArticle, WikiCategoryId } from '@/lib/wiki/types';

/**
 * 싱커위키 검색 — 정확히 같은 이름 > 이름이 그 말로 시작 > 이름 안에 그 말 > 본문에 그 말.
 * 같은 단계면 제목 > 영어 이름 > 다른 이름 차례, 그다음 가나다 · 번호 순(늘 같은 결과).
 * 저장된 이름은 바꾸지 않고 비교할 때만 다듬는다('아이소' · 'isom' · 'SSC' · '메디신' · 'med ball').
 */

export type WikiSearchTier = 0 | 1 | 2 | 3;
export type WikiSearchField = 'title' | 'english' | 'alias' | 'body';

export type WikiSearchHit = {
  article: WikiArticle;
  tier: WikiSearchTier;
  field: WikiSearchField;
  /** 무엇과 맞았나 — 다른 이름으로 찾았으면 그 이름을 결과에 보인다 */
  matched: string;
};

const FIELD_ORDER: Record<WikiSearchField, number> = { title: 0, english: 1, alias: 2, body: 3 };

function bodyText(a: WikiArticle): string {
  const secs = [a.encounter, a.explain, a.notEstablished];
  return normalizeWikiText([a.summary, a.label ?? '', ...(a.topics ?? []), ...secs.flatMap((s) => [...s.paragraphs, ...(s.bullets ?? [])])].join(' '));
}

function bestName(a: WikiArticle, q: string): { tier: WikiSearchTier; field: WikiSearchField; matched: string } | null {
  const names: { name: string; field: WikiSearchField }[] = [
    { name: a.title, field: 'title' },
    { name: a.english, field: 'english' },
    ...a.aliases.map((name) => ({ name, field: 'alias' as const })),
  ];
  let best: { tier: WikiSearchTier; field: WikiSearchField; matched: string } | null = null;
  for (const { name, field } of names) {
    const n = compactWikiText(name);
    const tier: WikiSearchTier | null = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : null;
    if (tier === null) continue;
    if (!best || tier < best.tier || (tier === best.tier && FIELD_ORDER[field] < FIELD_ORDER[best.field])) best = { tier, field, matched: name };
  }
  return best;
}

export function searchWiki(articles: readonly WikiArticle[], query: string, category: WikiCategoryId | null = null): WikiSearchHit[] {
  const inCat = category ? articles.filter((a) => a.category === category) : articles;
  const q = compactWikiText(query);
  if (!q) {
    // 검색어가 없으면 묶음 차례 → 가나다
    const order = (id: WikiCategoryId) => WIKI_CATEGORIES.findIndex((c) => c.id === id);
    return [...inCat]
      .sort((a, b) => order(a.category) - order(b.category) || a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id))
      .map((article) => ({ article, tier: 3 as const, field: 'title' as const, matched: article.title }));
  }
  const spaced = normalizeWikiText(query);
  const hits: WikiSearchHit[] = [];
  for (const a of inCat) {
    const name = bestName(a, q);
    if (name) hits.push({ article: a, ...name });
    else if (bodyText(a).includes(spaced)) hits.push({ article: a, tier: 3, field: 'body', matched: query.trim() });
  }
  return hits.sort(
    (x, y) =>
      x.tier - y.tier ||
      FIELD_ORDER[x.field] - FIELD_ORDER[y.field] ||
      x.article.title.localeCompare(y.article.title, 'ko') ||
      x.article.id.localeCompare(y.article.id),
  );
}
