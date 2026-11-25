import 'server-only';
import { createHash } from 'node:crypto';
import { storageBucket } from '@/lib/storage';
import type { WikiSnapshot } from './snapshot';
import { validateWikiContent } from './validate';
import { wikiReleaseDigest } from './release-manifest';
import type { WikiSection, WikiSourceCheck } from './types';

const MAX_SNAPSHOT_BYTES = 1_600_000;

export async function readWikiSnapshot(): Promise<WikiSnapshot | null> {
  const digest = wikiReleaseDigest(process.env.SINKER_WIKI_SHA256);
  if (!digest) return null;

  const { data, error } = await storageBucket('sinker-wiki-private').download(`v1/${digest}.json`);
  if (error || !data || data.size > MAX_SNAPSHOT_BYTES) return null;
  return parseWikiSnapshot(Buffer.from(await data.arrayBuffer()), digest);
}

export function parseWikiSnapshot(bytes: Buffer, digest: string): WikiSnapshot | null {
  if (bytes.length > MAX_SNAPSHOT_BYTES || createHash('sha256').update(bytes).digest('hex') !== digest) return null;
  try {
    const value = JSON.parse(bytes.toString('utf8')) as WikiSnapshot;
    if (value.format !== 1 || !Array.isArray(value.articles) || !value.articles.length ||
        !Array.isArray(value.sources) || !Array.isArray(value.assets) || !Array.isArray(value.backlog) ||
        !Array.isArray(value.tombstones) || !Array.isArray(value.firstTerms) || !Array.isArray(value.photoGear) ||
        !value.photoData || typeof value.photoData !== 'object' || Array.isArray(value.photoData)) return null;
    if (value.articles.some((article) => article.status !== 'published' || article.publicRelease !== false)) return null;
    if (validateWikiContent(value, new Date().toISOString().slice(0, 10)).length) return null;

    const ids = new Set(value.articles.map(({ id }) => id));
    const slugs = new Set(value.articles.map(({ slug }) => slug));
    for (const entry of value.tombstones) {
      if (typeof entry.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) ||
          typeof entry.title !== 'string' || typeof entry.reason !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(entry.at) || ids.has(entry.id) || slugs.has(entry.slug)) return null;
      ids.add(entry.id);
      slugs.add(entry.slug);
    }
    const articleIds = new Set(value.articles.map(({ id }) => id));
    if (![...value.firstTerms, ...value.photoGear].every((id) => articleIds.has(id))) return null;
    if (Object.keys(value.photoData).length !== value.assets.length ||
        value.assets.some(({ id }) => typeof value.photoData[id] !== 'string' ||
          !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value.photoData[id]))) return null;
    return memberCatalog(value);
  } catch {
    return null;
  }
}

/** Keep published material and visible provenance; leave editor notes and plans in Storage. */
function memberCatalog(value: WikiSnapshot): WikiSnapshot {
  const visibleCheck = ({ by, at, scope }: WikiSourceCheck) => ({ by, at, scope });
  const visibleSection = ({ heading, paragraphs, bullets }: WikiSection) => ({ heading, paragraphs, bullets });
  return {
    format: 1,
    articles: value.articles.map(({
      id, slug, title, english, aliases, autoLink, category, topics, label, summary,
      reading, encounter, explain, notEstablished, related, prerequisites,
      confusable, claims, assetIds, revisions,
    }) => {
      const { version, date, author, review } = revisions[revisions.length - 1];
      return {
        id, slug, title, english, aliases, autoLink, category, topics, label, summary,
        reading: { card: reading.card, example: reading.example, keyPoints: reading.keyPoints },
        encounter: visibleSection(encounter),
        explain: visibleSection(explain),
        notEstablished: visibleSection(notEstablished),
        related, prerequisites, confusable, assetIds,
        claims: claims.map(({ id, text, editorial, sources }) => ({
          id, text, editorial, sources: sources.map(({ id, role, note }) => ({ id, role, note })),
        })),
        status: 'published', publicRelease: false,
        revisions: [{
          version, date, author, reason: '',
          review: review ? { by: review.by, at: review.at, kind: review.kind } : null,
        }],
      };
    }),
    sources: value.sources.map(({
      id, title, authors, year, venue, design, url, doi, pmid, pmcid, population, measured, limits, checks,
    }) => ({ id, title, authors, year, venue, design, url, doi, pmid, pmcid, population, measured, limits, checks: checks.map(visibleCheck) })),
    assets: value.assets.map(({
      id, width, height, alt, caption, creator, sourcePage, originalUrl, originalWidth, originalHeight,
      license, licenseUrl, credit, modification, verified, scopeNote,
    }) => ({
      id, width, height, alt, caption, creator, sourcePage, originalUrl, originalWidth, originalHeight,
      license, licenseUrl, credit, modification, verified: visibleCheck(verified), scopeNote,
      src: '', originalSha1: '',
    })),
    backlog: [],
    tombstones: [],
    firstTerms: value.firstTerms,
    photoGear: value.photoGear,
    photoData: value.photoData,
  };
}
