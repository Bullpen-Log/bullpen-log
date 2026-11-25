import { buildTermIndex, matchWikiTerms, type MatchOptions } from './match';
import { searchWiki } from './search';
import type { WikiArticle, WikiAsset, WikiBacklogItem, WikiCategoryId, WikiSource } from './types';

export const WIKI_READ_PATH = '/api/board/wiki';

type WikiTombstone = { slug: string; id: string; title: string; reason: string; at: string };
type WikiLookup = { kind: 'article'; article: WikiArticle } |
  ({ kind: 'retracted' } & WikiTombstone) | { kind: 'missing' };

export type WikiSnapshot = {
  format: 1;
  articles: readonly WikiArticle[];
  sources: readonly WikiSource[];
  assets: readonly WikiAsset[];
  backlog: readonly WikiBacklogItem[];
  tombstones: readonly WikiTombstone[];
  firstTerms: readonly string[];
  photoGear: readonly string[];
  photoData: Readonly<Record<string, string>>;
};

export type WikiRead = { viewerId: string; snapshot: WikiSnapshot };

export function wikiReader(snapshot: WikiSnapshot) {
  const byId = new Map(snapshot.articles.map((article) => [article.id, article]));
  const bySlug = new Map(snapshot.articles.map((article) => [article.slug, article]));
  const tombstones = new Map(snapshot.tombstones.map((entry) => [entry.slug, entry]));
  const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  const termIndex = buildTermIndex(snapshot.articles);
  return {
    wikiArticles: () => snapshot.articles,
    wikiBacklog: () => snapshot.backlog,
    wikiById: (id: string) => byId.get(id),
    wikiBySlug(slug: string): WikiLookup {
      const article = bySlug.get(slug);
      if (article) return { kind: 'article', article };
      const tombstone = tombstones.get(slug);
      return tombstone ? { kind: 'retracted', ...tombstone } : { kind: 'missing' };
    },
    sourceById: (id: string) => sources.get(id),
    assetById: (id: string) => assets.get(id),
    photoUri: (id: string) => assets.has(id) && snapshot.photoData[id] ? `data:image/jpeg;base64,${snapshot.photoData[id]}` : undefined,
    searchWikiArticles: (query: string, category: WikiCategoryId | null) => searchWiki(snapshot.articles, query, category),
    matchWikiProse: (text: string, options?: MatchOptions) => matchWikiTerms(text, termIndex, options),
    firstTerms: snapshot.firstTerms,
    photoGear: snapshot.photoGear,
  };
}
