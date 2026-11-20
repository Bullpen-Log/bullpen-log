import { LIST_FAILURE_TEXT, type ListFailureReason } from '@/lib/review-evidence/http';
import type { EvidenceSource } from '@/lib/review-evidence/materialize';
import { SOURCE_KINDS, type Domain, type SourceKind } from '@/lib/review-evidence/model';

/**
 * EX-REF04 — 검수 근거자료 화면의 거르기 · 정렬 · 글자 모양(순수, 'server-only' 없음).
 * 이 파일은 node:crypto 를 쓰는 hash.ts · materialize.ts 의 값을 부르지 않는다(타입만 가져온다) — 브라우저 쪽에서도 안전하다.
 */

export type DomainFilter = 'all' | Domain;
export type KindFilter = SourceKind | 'all' | 'unknown';
export type MetaFilter = 'all' | EvidenceSource['metadataStatus'];
export type SortKey = 'recent' | 'title' | 'uses';

export type Filters = { q: string; domain: DomainFilter; kind: KindFilter; meta: MetaFilter; sort: SortKey };

export const DOMAIN_FILTERS: readonly DomainFilter[] = ['all', 'exercise', 'mechanics'];
export const META_FILTERS: readonly MetaFilter[] = ['all', 'verified', 'claimed', 'entered', 'unverified'];
/** 서지 확인 상태 차례(화면 고르기 · 셈) */
export const METADATA_STATUSES: readonly EvidenceSource['metadataStatus'][] = ['verified', 'claimed', 'entered', 'unverified'];
export const SORT_KEYS: readonly SortKey[] = ['recent', 'title', 'uses'];
export const SORT_LABEL: Record<SortKey, string> = { recent: '최근 확인 순', title: '제목 순', uses: '많이 쓰인 순' };

export const METADATA_STATUS_LABEL: Record<EvidenceSource['metadataStatus'], string> = {
  verified: '공식 서지 확인',
  claimed: '등록 도구가 공식 서지에서 가져옴(서버 재확인 전)',
  entered: '적은 서지(공식 확인 전)',
  unverified: '서지 확인 필요(링크만)',
};

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function pick<T extends string>(v: string, list: readonly T[], fallback: T): T {
  return (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 주소의 거르기 값 — 모르는 값은 버리고 기본값으로 */
export function readFilters(params: Params): Filters {
  const q = [...first(params.q).normalize('NFC').trim().replace(/\s+/g, ' ')].slice(0, 100).join('');
  const kinds: readonly KindFilter[] = ['all', 'unknown', ...SOURCE_KINDS];
  return {
    q,
    domain: pick(first(params.domain), DOMAIN_FILTERS, 'all'),
    kind: pick(first(params.kind), kinds, 'all'),
    meta: pick(first(params.meta), META_FILTERS, 'all'),
    sort: pick(first(params.sort), SORT_KEYS, 'recent'),
  };
}

export const isFiltered = (f: Filters) => Boolean(f.q || f.domain !== 'all' || f.kind !== 'all' || f.meta !== 'all');

/** 링크의 사이트 이름(www. 뗌). 못 읽으면 빈 글자 */
export function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function haystack(s: EvidenceSource): string {
  const parts: (string | null)[] = [s.title, s.container, s.summaryKo, ...s.authors, ...s.identifiers.pmid, ...s.identifiers.pmcid, ...s.identifiers.doi];
  for (const l of s.links) parts.push(hostOf(l.href));
  for (const u of s.uses) parts.push(u.itemName, u.itemId, u.reviewId);
  return parts
    .filter((p): p is string => Boolean(p))
    .join('\n')
    .normalize('NFC')
    .toLowerCase();
}

/** 찾는 말(띄어 쓴 낱말 모두 들어 있어야) · 분야 · 종류 · 서지 확인으로 거르고 정렬한다 */
export function filterSources(sources: EvidenceSource[], f: Filters): EvidenceSource[] {
  const words = f.q.toLowerCase().split(' ').filter(Boolean);
  const out = sources.filter((s) => {
    if (f.domain !== 'all' && !(s.useCounts[f.domain] > 0)) return false;
    if (f.kind === 'unknown' ? s.kind !== null : f.kind !== 'all' && s.kind !== f.kind) return false;
    if (f.meta !== 'all' && s.metadataStatus !== f.meta) return false;
    if (words.length) {
      const h = haystack(s);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
  if (f.sort === 'title') {
    const name = (s: EvidenceSource) => s.title ?? hostOf(s.primaryHref);
    return out.sort((a, b) => name(a).localeCompare(name(b), 'ko') || a.id.localeCompare(b.id));
  }
  if (f.sort === 'uses') return out.sort((a, b) => usesIn(b, f.domain) - usesIn(a, f.domain) || a.id.localeCompare(b.id));
  if (f.domain !== 'all') {
    // recent · 분야를 골랐으면 그 분야의 최근 확인일로. 같으면 모으기(materialize)가 정한 차례(안정 정렬)
    const d = f.domain;
    return out.sort((a, b) => (b.latestByDomain[d] ?? '').localeCompare(a.latestByDomain[d] ?? ''));
  }
  return out; // recent — 모으기(materialize)가 정한 차례 그대로
}

/** 거두지 않은 쓰임 수 — 분야를 고르면 그 분야만 */
export function usesIn(s: Pick<EvidenceSource, 'useCounts'>, domain: DomainFilter): number {
  return domain === 'all' ? s.useCounts.exercise + s.useCounts.mechanics : s.useCounts[domain];
}

/** 최근 확인일 — 분야를 고르면 그 분야의 것 */
export function latestIn(s: Pick<EvidenceSource, 'latestConsultedOn' | 'latestByDomain'>, domain: DomainFilter): string | null {
  return domain === 'all' ? s.latestConsultedOn : s.latestByDomain[domain];
}

/** 목록 줄의 최근 확인 글 — 날짜가 없으면 '확인일 미상' 하나만 */
export function latestText(d: string | null | undefined): string {
  return d && DATE_ONLY.test(d) ? `최근 확인 ${dateText(d)}` : '확인일 미상';
}

export type Facets = {
  domain: Record<Domain, number>;
  kind: Record<SourceKind | 'unknown', number>;
  meta: Record<EvidenceSource['metadataStatus'], number>;
};

export function facetCounts(sources: EvidenceSource[]): Facets {
  const kind = { unknown: 0 } as Record<SourceKind | 'unknown', number>;
  for (const k of SOURCE_KINDS) kind[k] = 0;
  const f: Facets = { domain: { exercise: 0, mechanics: 0 }, kind, meta: { verified: 0, claimed: 0, entered: 0, unverified: 0 } };
  for (const s of sources) {
    if (s.useCounts.exercise > 0) f.domain.exercise += 1;
    if (s.useCounts.mechanics > 0) f.domain.mechanics += 1;
    f.kind[s.kind ?? 'unknown'] += 1;
    f.meta[s.metadataStatus] += 1;
  }
  return f;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** '2026-11-17' → '2026년 11월 17일'. 없으면 '확인일 미상' */
export function dateText(d: string | null | undefined): string {
  const m = d ? DATE_ONLY.exec(d) : null;
  if (!m) return '확인일 미상';
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/** ISO 시각 → 한국 시각 글 */
export function timeText(iso: string | null | undefined): string {
  if (!iso) return '시각 미상';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '시각 미상';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(t);
}

/** DOI 공식 주소 — '/' 는 그대로 두고 나머지 조각은 주소에 맞게 바꾼다 */
export const doiHref = (doi: string) => 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
export const pmidHref = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
export const pmcidHref = (pmcid: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${encodeURIComponent(pmcid)}/`;

/** 저자 줄 — 앞 6명, 넘으면 '외 n명' */
export function authorsText(authors: string[]): string | null {
  if (!authors.length) return null;
  const head = authors.slice(0, 6).join(', ');
  return authors.length > 6 ? `${head} 외 ${authors.length - 6}명` : head;
}

/** 제목이 없으면 사이트 이름 + 확인 필요 */
export function titleOf(s: Pick<EvidenceSource, 'title' | 'primaryHref'>): string {
  return s.title ?? `${hostOf(s.primaryHref) || '링크'} · 제목 확인 필요`;
}

/**
 * 거두기 응답을 화면 상태로 바꾼다([id]/withdraw-form.tsx — 순수라 셀프테스트가 같은 함수를 부른다).
 *  - done: 이 거두기가 지금 효과를 낸다(받음표 applied · 옛 서버면 visible).
 *  - already: 저장은 됐지만 다른 거두기가 이미 효과를 내고 있다(supersededBy 'withdraw').
 *  - newer: 저장은 됐지만 이 거두기보다 같거나 더 나중에 적힌 등록이 있어 쓰임이 살아 있다(supersededBy 'register').
 *  - unconfirmed: 저장은 됐지만 거둔 상태인지 확인하지 못했다(목록을 다시 못 읽음 등). 같은 요청으로 다시 보내 확인한다.
 *  - list-failed: 저장 전에 목록을 모으지 못해 아무것도 저장하지 않았다(503 unavailable + reason). 서버가 준 까닭 글을 보인다.
 *  - unsure: 저장했는지 모른다(연결 끊김 · 대기 · 그 밖의 5xx).
 *  - error: 그 밖의 거절(글은 부르는 쪽이 apiFailText 로 만든다).
 */
export type WithdrawOutcome =
  | { kind: 'done' | 'already' | 'newer' | 'unconfirmed' | 'unsure' | 'error' }
  | { kind: 'list-failed'; message: string };

export function withdrawOutcomeOf(status: number, data: unknown): WithdrawOutcome {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const ok = status >= 200 && status < 300;
  const receipt = d?.receipt && typeof d.receipt === 'object' ? (d.receipt as Record<string, unknown>) : null;
  if (ok && receipt) {
    const applied = typeof receipt.applied === 'boolean' ? receipt.applied : receipt.visible === true;
    if (applied) return { kind: 'done' };
    if (receipt.supersededBy === 'withdraw') return { kind: 'already' };
    if (receipt.supersededBy === 'register') return { kind: 'newer' };
    return { kind: 'unconfirmed' };
  }
  if (status === 503 && d?.error === 'unavailable' && typeof d.reason === 'string' && Object.prototype.hasOwnProperty.call(LIST_FAILURE_TEXT, d.reason)) {
    const reason = d.reason as ListFailureReason;
    const message = typeof d.message === 'string' && d.message.trim() ? d.message : LIST_FAILURE_TEXT[reason];
    return { kind: 'list-failed', message };
  }
  if (status >= 500 || ok) return { kind: 'unsure' };
  return { kind: 'error' };
}
