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

/** 거두기 화면에 보이는 글(폼은 이 글만 쓴다 — 셀프테스트가 같은 표를 본다) */
export const WITHDRAW_TEXT = {
  done: '거뒀어요.',
  already: '이미 거둔 상태예요. 다른 거두기가 효과를 내고 있어요.',
  newer:
    '이 쓰임에 거두기보다 더 나중 시각으로 적힌 등록이 있어 거두지 않았어요. 등록한 기기의 시계가 이 기기보다 앞서 있었을 수 있어요. 그렇다면 그 시각이 지나기 전에는 여기서 다시 거둬도 같아요. 등록한 기기에서 거두거나, 새로 고친 화면에서 쓰임이 살아 있는지 확인한 뒤 나중에 다시 거둬 주세요.',
  unconfirmed: '저장은 됐지만 아직 거둔 상태로 보이지 않아요. 같은 까닭으로 다시 보내 확인해 주세요.',
  unsure: '거뒀는지 확인하지 못했어요. 같은 까닭으로 다시 보내면 겹치지 않아요.',
  listFailedTail: '거두기는 저장하지 않았어요.',
} as const;

/**
 * 거두기 결과 → 폼이 할 일(순수 · 폼은 이 결과대로만 상태를 바꾼다).
 *  view: 보일 상태. done 만 '거뒀어요'. message: 보일 글(error 는 null — 폼이 apiFailText 로 만든다).
 *  resetRequest: 다음에 보내면 새 요청 번호 · 지금 시각으로(newer 만). refresh: 화면을 새로 읽음(저장된 결과).
 *  finished: 거두기 단추를 끈다(done · already). resend: '다시 보내기'로 보인다(같은 요청을 다시 보내면 되는 것).
 */
export type WithdrawStep = {
  view: WithdrawOutcome['kind'];
  message: string | null;
  tone: 'ok' | 'info' | 'error';
  resetRequest: boolean;
  refresh: boolean;
  finished: boolean;
  resend: boolean;
};

export function withdrawStepOf(o: WithdrawOutcome): WithdrawStep {
  const base = { resetRequest: false, refresh: false, finished: false, resend: false };
  switch (o.kind) {
    case 'done':
      return { ...base, view: 'done', message: WITHDRAW_TEXT.done, tone: 'ok', refresh: true, finished: true };
    case 'already':
      return { ...base, view: 'already', message: WITHDRAW_TEXT.already, tone: 'info', refresh: true, finished: true };
    case 'newer':
      return { ...base, view: 'newer', message: WITHDRAW_TEXT.newer, tone: 'info', refresh: true, resetRequest: true };
    case 'unconfirmed':
      return { ...base, view: 'unconfirmed', message: WITHDRAW_TEXT.unconfirmed, tone: 'info', resend: true };
    case 'unsure':
      return { ...base, view: 'unsure', message: WITHDRAW_TEXT.unsure, tone: 'info', resend: true };
    case 'list-failed':
      return { ...base, view: 'list-failed', message: `${o.message} ${WITHDRAW_TEXT.listFailedTail}`, tone: 'info', resend: true };
    default:
      return { ...base, view: 'error', message: null, tone: 'error' };
  }
}

/**
 * 등록 받음표 → 등록 폼 머리 글(순수). 저장은 됐지만 쓰임이 거둔 상태 그대로면(useState 'withdrawn') '저장했어요'로 시작하지 않는다 —
 * 등록 도구가 같은 경우를 superseded(2)로 내는 것과 같은 뜻. useState 가 없는 옛 서버는 예전처럼 visible 만 본다.
 */
export type RegisterResultView = { tone: 'ok' | 'warn' | 'pending'; headline: string; note: string | null };

export const REGISTER_WITHDRAWN_NOTE =
  '이 쓰임에는 이 등록보다 더 나중 시각으로 적힌 거두기가 있어 이 등록이 효과를 내지 못했어요. 거둔 기기의 시계가 이 기기보다 앞서 있었을 수 있어요. 그렇다면 그 시각이 지나기 전에는 여기서 다시 보내도 같아요. 거둔 기기에서 다시 등록하거나, 나중에 칸을 고쳐 새 요청으로 보내 주세요.';

export function registerResultOf(r: { replayed: boolean; visible: boolean; useState?: string | null }): RegisterResultView {
  if (r.visible && r.useState === 'withdrawn')
    return { tone: 'warn', headline: '저장했지만 이 쓰임은 거둔 상태 그대로예요.', note: REGISTER_WITHDRAWN_NOTE };
  const headline = r.replayed ? '이미 저장된 같은 요청이에요.' : '저장했어요.';
  if (!r.visible) return { tone: 'pending', headline, note: '저장은 됐지만 목록 확인 전이에요. 같은 요청으로 다시 보내 확인해 주세요.' };
  return { tone: 'ok', headline, note: null };
}
