import { tokenOf } from '@/lib/review-evidence/hash';
import {
  HISTORICAL_REVIEWER_LABEL,
  type Domain,
  type HistoricalInput,
  type MetadataSource,
  type Op,
  type Purpose,
  type Reading,
  type SourceInput,
  type SourceKind,
  type SummaryBasis,
  type UseInput,
} from '@/lib/review-evidence/model';
import { checkEvidenceUrl, identifierKey, identifiersFromUrl, urlKey, type Identifiers } from '@/lib/review-evidence/url';

/**
 * EX-REF04 — 쌓인 작업 기록(op)을 화면에 보일 출처 · 쓰임으로 모은다(순수 · 결정적: 같은 기록이면 순서와 상관없이 같은 결과).
 *
 * 같은 출처로 묶기(합집합)는 이것만:
 *  - 정규화한 링크가 같다
 *  - 링크 모양에서 바로 나오는 번호(PubMed · PMC · DOI)가 같다
 *  - 대표관리자의 과거 가져오기(import)가 공식 서지(NCBI 등)로 확인했다고 적은 번호 · 다른 링크가 같다
 * 지금 등록(register)이 적어 보낸 번호 · '공식 확인' 표시는 서버가 다시 확인하지 못하므로 보여 주기만 하고 묶지 않는다
 * (잘못 적은 번호 하나로 다른 자료가 영구히 합쳐지지 않게). 제목이 닮았다는 이유로도 묶지 않는다.
 *
 * 쓰임의 정체 = 쓴 사람(로그인 계정 · 과거 기록이면 hist:<이름>) + 분야 + 검수 번호 + 운동/드릴 번호 + 쓴 곳 + 그 인용의 자료 번호
 * (그 인용이 가진 가장 강한 열쇠: PMID → DOI → PMCID → 링크). 같은 논문을 PubMed · PMC 두 링크로 적어도 확인된 번호가 같으면 한 쓰임.
 * 같은 쓰임의 기록끼리는 쓴 사람 쪽 시각(notedAt, 없으면 받은 때) 차례로 겹친다 — 늦게 다시 보낸 옛 요청이 뒤의 고침을 덮지 않는다.
 * 빈 값은 앞의 값을 지우지 않는다. 확인일은 가장 늦은 날(되돌아가지 않음)과 가장 이른 날을 함께 둔다.
 * 거둔 쓰임(withdraw)은 지우지 않고 표시만 한다(같은 사람의 쓰임 · 과거 기록만 거둘 수 있고, 거둔 뒤에 다시 쓰면 다시 살아난다).
 */

export type Scope = 'user' | 'historical';

export type EvidenceUse = {
  useId: string;
  domain: Domain;
  reviewId: string;
  itemId: string | null;
  itemName: string | null;
  purpose: Purpose;
  purposeNote: string | null;
  consultedOn: string | null;
  firstConsultedOn: string | null;
  applicationKo: string | null;
  limitationsKo: string | null;
  reading: Reading;
  readingNote: string | null;
  scope: Scope;
  /** 지금 등록한 쓰임의 계정(거두기 권한 확인용 — 화면 · API 목록에는 내보내지 않는다). 과거 기록이면 null */
  ownerUserId: string | null;
  reviewerLabel: string;
  historical: HistoricalInput | null;
  /** 이 쓰임이 적은 첫 링크 · 그 밖에 같은 쓰임으로 적힌 링크 */
  href: string;
  otherHrefs: string[];
  firstReceivedAt: string;
  lastReceivedAt: string;
  /** 같은 쓰임으로 들어온 기록 수(다시 확인 · 고침 모두) */
  revisions: number;
  history: { opId: string; receivedAt: string; kind: Op['kind'] }[];
  withdrawn: { opId: string; at: string; byLabel: string; reasonKo: string } | null;
};

export type EvidenceLink = { href: string; label: string };

/** verified: 과거 가져오기의 공식 서지 · claimed: 등록 도구가 공식 서지에서 가져왔다고 적음(서버 재확인 전) · entered: 사람이 넣은 서지 · unverified: 링크만 */
export type MetadataStatus = 'verified' | 'claimed' | 'entered' | 'unverified';

export type EvidenceSource = {
  id: string;
  aliasIds: string[];
  title: string | null;
  authors: string[];
  container: string | null;
  year: number | null;
  identifiers: { pmid: string[]; pmcid: string[]; doi: string[] };
  verifiedBy: MetadataSource | null;
  metadataStatus: MetadataStatus;
  kind: SourceKind | null;
  summaryKo: string | null;
  summaryBasis: SummaryBasis | null;
  primaryHref: string;
  links: EvidenceLink[];
  /** 거둔 쓰임을 포함한 전부(화면이 거둔 것은 접어 보인다) */
  uses: EvidenceUse[];
  domains: Domain[];
  /** 거두지 않은 쓰임만 센다 */
  useCounts: Record<Domain, number>;
  withdrawnUses: number;
  latestConsultedOn: string | null;
  latestByDomain: Record<Domain, string | null>;
  lastReceivedAt: string;
};

export type Library = {
  sources: EvidenceSource[];
  opCount: number;
  citationCount: number;
  /** 거두지 않은 쓰임 수 */
  useCount: number;
  withdrawnCount: number;
  /** 모양이 틀려 뺀 기록 수(숨기지 않고 화면에 알린다) */
  skippedOps: number;
  /** 기록 자리에 있지만 기록 이름이 아닌 객체 수(읽지 않음 · 빈 폴더 표시는 빼고) — 화면 · API 에 알린다 */
  foreignObjects: number;
  /** 대상 쓰임이 없거나 거둘 수 없는 사람이 보낸 거두기 */
  ignoredWithdrawals: number;
  /** 기록마다 실제로 목록에 들어간 줄 수(등록 · 가져오기 · 거두기 뒤 읽기 확인) */
  citationsByOp: Record<string, number>;
};

type Citation = {
  opId: string;
  receivedAt: string;
  /** 같은 쓰임 안 차례 — 쓴 사람 쪽 시각, 없으면 받은 때 */
  effectiveAt: string;
  kind: 'register' | 'import';
  actor: Op['actor'];
  source: SourceInput;
  use: UseInput;
  historical: HistoricalInput | null;
  /** 과거 가져오기의 공식 서지 확인 — 묶기에 쓴다 */
  trusted: boolean;
  normalizedUrl: string;
  keys: string[];
  identity: string;
};

const PRIORITY: Record<string, number> = { pmid: 0, doi: 1, pmcid: 2, url: 3 };
const prio = (key: string) => PRIORITY[key.slice(0, key.indexOf(':'))] ?? 9;

function cmpKey(a: string, b: string): number {
  const p = prio(a) - prio(b);
  if (p) return p;
  return a < b ? -1 : a > b ? 1 : 0;
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function keysOf(source: SourceInput, trusted: boolean): { normalized: string; keys: string[] } | null {
  const main = checkEvidenceUrl(source.url);
  if (!main.ok) return null;
  const keys = new Set<string>([urlKey(main.normalized)]);
  const addIds = (ids: Identifiers) => {
    if (ids.pmid) keys.add(identifierKey('pmid', ids.pmid));
    if (ids.pmcid) keys.add(identifierKey('pmcid', ids.pmcid));
    if (ids.doi) keys.add(identifierKey('doi', ids.doi));
  };
  addIds(identifiersFromUrl(main));
  if (trusted) {
    addIds(source.identifiers);
    for (const alt of source.altUrls) {
      const a = checkEvidenceUrl(alt);
      if (!a.ok) continue;
      keys.add(urlKey(a.normalized));
      addIds(identifiersFromUrl(a));
    }
  }
  return { normalized: main.normalized, keys: [...keys].sort(cmpKey) };
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    let r = x;
    while (this.parent.has(r) && this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    if (!this.parent.has(r)) this.parent.set(r, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (cmpKey(ra, rb) <= 0) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

const sortOps = (ops: Op[]) => [...ops].sort((a, b) => cmpStr(a.receivedAt, b.receivedAt) || cmpStr(a.opId, b.opId));

export function citationsOf(ops: Op[]): Citation[] {
  const out: Citation[] = [];
  for (const op of sortOps(ops)) {
    if (op.kind === 'withdraw') continue;
    const rows: { source: SourceInput; use: UseInput; historical: HistoricalInput | null }[] =
      op.kind === 'register' ? [{ source: op.payload.source, use: op.payload.use, historical: null }] : op.payload.records.map((r) => ({ source: r.source, use: r.use, historical: r.historical }));
    for (const r of rows) {
      const trusted = op.kind === 'import' && !!r.source.verifiedBy;
      const k = keysOf(r.source, trusted);
      if (!k) continue;
      out.push({
        opId: op.opId,
        receivedAt: op.receivedAt,
        effectiveAt: r.use.notedAt ?? op.receivedAt,
        kind: op.kind,
        actor: op.actor,
        source: r.source,
        use: r.use,
        historical: r.historical,
        trusted,
        normalizedUrl: k.normalized,
        keys: k.keys,
        identity: k.keys[0],
      });
    }
  }
  return out;
}

const scopeKeyOf = (c: Pick<Citation, 'actor' | 'historical'>) => (c.historical ? `hist:${c.historical.reviewer}` : `user:${c.actor.userId}`);

export function keyOfUse(c: Pick<Citation, 'actor' | 'historical' | 'use' | 'identity'>): string {
  return [scopeKeyOf(c), c.use.domain, c.use.reviewId, c.use.itemId ?? '', c.use.purpose, c.identity].join('|');
}

function linkLabel(href: string): string {
  const u = checkEvidenceUrl(href);
  if (!u.ok) return '원문 링크';
  const ids = identifiersFromUrl(u);
  if (ids.pmid) return `PubMed ${ids.pmid}`;
  if (ids.pmcid) return `PMC 전문 ${ids.pmcid}`;
  if (ids.doi) return `DOI ${ids.doi}`;
  return u.host.replace(/^www\./, '');
}

const maxDate = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a ?? b);
const minDate = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : a ?? b);

/** 차례: 쓴 사람 쪽 시각 → 받은 때 → 기록 번호 */
const byEffective = (a: Citation, b: Citation) => cmpStr(a.effectiveAt, b.effectiveAt) || cmpStr(a.receivedAt, b.receivedAt) || cmpStr(a.opId, b.opId);

type Tier = 1 | 2 | 3; // 1 사람이 넣음 · 2 등록 도구의 공식 서지 주장 · 3 가져오기의 공식 서지
const tierOf = (c: Citation): Tier => (c.trusted ? 3 : c.source.verifiedBy ? 2 : 1);

type UseEntry = { use: EvidenceUse; scopeKey: string; latestEffective: string };

export function materialize(ops: Op[], skippedOps = 0, foreignObjects = 0): Library {
  const cites = citationsOf(ops);
  const uf = new UnionFind();
  for (const c of cites) {
    uf.find(c.keys[0]);
    for (let i = 1; i < c.keys.length; i++) uf.union(c.keys[0], c.keys[i]);
  }

  const groups = new Map<string, Citation[]>();
  for (const c of cites) {
    const root = uf.find(c.keys[0]);
    const g = groups.get(root);
    if (g) g.push(c);
    else groups.set(root, [c]);
  }

  const sources: EvidenceSource[] = [];
  const useIndex = new Map<string, UseEntry>();

  for (const [root, list] of groups) {
    const ordered = [...list].sort(byEffective);
    const allKeys = new Set<string>();
    for (const c of list) for (const k of c.keys) allKeys.add(k);
    const id = tokenOf('src', root);
    const aliasIds = [...allKeys].map((k) => tokenOf('src', k)).filter((t) => t !== id).sort();

    /* 서지 — 칸마다 가장 높은 등급의 값(같은 등급이면 늦은 값). 빈 값은 지우지 않는다 */
    function field<T>(pick: (s: SourceInput) => T | null | undefined, empty: (v: T) => boolean): T | null {
      let best: T | null = null;
      let bestTier = 0;
      for (const c of ordered) {
        const v = pick(c.source);
        if (v === null || v === undefined || empty(v)) continue;
        const t = tierOf(c);
        if (t >= bestTier) {
          best = v;
          bestTier = t;
        }
      }
      return best;
    }
    const title = field((s) => s.title, (v) => !v);
    const authors = field((s) => s.authors, (v) => !v.length) ?? [];
    const container = field((s) => s.container, (v) => !v);
    const year = field((s) => s.year, () => false);
    let topTier = 0;
    let verifiedBy: MetadataSource | null = null;
    for (const c of ordered) {
      const t = tierOf(c);
      const hasBib = !!(c.source.title || c.source.authors.length || c.source.container || c.source.year);
      if (t >= 2 && t >= topTier) {
        topTier = t;
        verifiedBy = c.source.verifiedBy;
      } else if (t === 1 && hasBib && topTier < 1) topTier = 1;
    }
    const metadataStatus: MetadataStatus = topTier === 3 ? 'verified' : topTier === 2 ? 'claimed' : topTier === 1 ? 'entered' : 'unverified';

    /* 분류 · 요약 — 지금 등록한 사람의 값이 과거 가져오기의 값보다 먼저(같은 쪽 안에서는 늦은 값) */
    function liveOrImport(pick: (s: SourceInput) => unknown): Citation | null {
      let live: Citation | null = null;
      let hist: Citation | null = null;
      for (const c of ordered) {
        if (pick(c.source) === null) continue;
        if (c.kind === 'register') live = c;
        else hist = c;
      }
      return live ?? hist;
    }
    const kindFrom = liveOrImport((s) => s.kind);
    const summaryFrom = liveOrImport((s) => s.summaryKo);

    const ids = { pmid: new Set<string>(), pmcid: new Set<string>(), doi: new Set<string>() };
    const hrefs: string[] = [];
    for (const c of ordered) {
      const s = c.source;
      for (const h of [s.url, ...(c.trusted ? s.altUrls : [])]) if (!hrefs.includes(h)) hrefs.push(h);
      const add = (x: Identifiers) => {
        if (x.pmid) ids.pmid.add(x.pmid);
        if (x.pmcid) ids.pmcid.add(x.pmcid);
        if (x.doi) ids.doi.add(x.doi);
      };
      const own = checkEvidenceUrl(s.url);
      if (own.ok) add(identifiersFromUrl(own));
      /* 등록이 적은 번호도 보여 준다(묶지는 않음) */
      if (s.verifiedBy || c.trusted) add(s.identifiers);
    }

    /* 쓰임 */
    const useMap = new Map<string, UseEntry>();
    for (const c of ordered) {
      const key = keyOfUse(c);
      const u = c.use;
      const historical = c.historical;
      const label = historical ? `${HISTORICAL_REVIEWER_LABEL[historical.reviewer]}(과거 기록)` : c.actor.label;
      const entry = useMap.get(key);
      if (!entry) {
        useMap.set(key, {
          scopeKey: scopeKeyOf(c),
          latestEffective: c.effectiveAt,
          use: {
            useId: tokenOf('use', key),
            domain: u.domain,
            reviewId: u.reviewId,
            itemId: u.itemId,
            itemName: u.itemName,
            purpose: u.purpose,
            purposeNote: u.purposeNote,
            consultedOn: u.consultedOn,
            firstConsultedOn: u.consultedOn,
            applicationKo: u.applicationKo,
            limitationsKo: u.limitationsKo,
            reading: u.reading,
            readingNote: u.readingNote,
            scope: historical ? 'historical' : 'user',
            ownerUserId: historical ? null : c.actor.userId,
            reviewerLabel: label,
            historical: historical ? { ...historical, origins: [...historical.origins] } : null,
            href: c.source.url,
            otherHrefs: [],
            firstReceivedAt: c.receivedAt,
            lastReceivedAt: c.receivedAt,
            revisions: 1,
            history: [{ opId: c.opId, receivedAt: c.receivedAt, kind: c.kind }],
            withdrawn: null,
          },
        });
        continue;
      }
      const prev = entry.use;
      if (c.effectiveAt > entry.latestEffective) entry.latestEffective = c.effectiveAt;
      prev.itemName = u.itemName ?? prev.itemName;
      prev.purposeNote = u.purposeNote ?? prev.purposeNote;
      prev.consultedOn = maxDate(prev.consultedOn, u.consultedOn);
      prev.firstConsultedOn = minDate(prev.firstConsultedOn, u.consultedOn);
      prev.applicationKo = u.applicationKo ?? prev.applicationKo;
      prev.limitationsKo = u.limitationsKo ?? prev.limitationsKo;
      if (u.reading !== 'unknown') {
        prev.readingNote = u.reading === prev.reading ? (u.readingNote ?? prev.readingNote) : u.readingNote;
        prev.reading = u.reading;
      } else if (u.readingNote && prev.reading === 'unknown') prev.readingNote = u.readingNote;
      prev.reviewerLabel = label;
      if (c.source.url !== prev.href && !prev.otherHrefs.includes(c.source.url)) prev.otherHrefs.push(c.source.url);
      if (historical && prev.historical) {
        for (const o of historical.origins) if (!prev.historical.origins.includes(o)) prev.historical.origins.push(o);
        prev.historical.origins.sort();
        if (historical.recordedAt && (!prev.historical.recordedAt || historical.recordedAt < prev.historical.recordedAt)) prev.historical.recordedAt = historical.recordedAt;
      }
      if (c.receivedAt < prev.firstReceivedAt) prev.firstReceivedAt = c.receivedAt;
      if (c.receivedAt > prev.lastReceivedAt) prev.lastReceivedAt = c.receivedAt;
      prev.revisions += 1;
      if (!prev.history.some((h) => h.opId === c.opId)) prev.history.push({ opId: c.opId, receivedAt: c.receivedAt, kind: c.kind });
    }
    for (const e of useMap.values()) {
      e.use.history.sort((a, b) => cmpStr(a.receivedAt, b.receivedAt) || cmpStr(a.opId, b.opId));
      useIndex.set(e.use.useId, e);
    }

    sources.push({
      id,
      aliasIds,
      title,
      authors,
      container,
      year,
      identifiers: { pmid: [...ids.pmid].sort(), pmcid: [...ids.pmcid].sort(), doi: [...ids.doi].sort() },
      verifiedBy,
      metadataStatus,
      kind: kindFrom ? kindFrom.source.kind : null,
      summaryKo: summaryFrom ? summaryFrom.source.summaryKo : null,
      summaryBasis: summaryFrom ? summaryFrom.source.summaryBasis : null,
      primaryHref: '',
      links: hrefs.map((h) => ({ href: h, label: linkLabel(h) })),
      uses: [...useMap.values()].map((e) => e.use),
      domains: [],
      useCounts: { exercise: 0, mechanics: 0 },
      withdrawnUses: 0,
      latestConsultedOn: null,
      latestByDomain: { exercise: null, mechanics: null },
      lastReceivedAt: '',
    });
  }

  /* 거두기 — 같은 사람의 쓰임 · 과거 기록만. 그 쓰임의 마지막 기록보다 뒤(쓴 사람 쪽 시각)일 때만 거둔 것으로 본다 */
  let ignoredWithdrawals = 0;
  const lastWithdraw = new Map<string, Extract<Op, { kind: 'withdraw' }>>();
  for (const w of sortOps(ops)) {
    if (w.kind !== 'withdraw') continue;
    const e = useIndex.get(w.payload.useId);
    const allowed = !!e && (e.scopeKey.startsWith('hist:') || e.scopeKey === `user:${w.actor.userId}`);
    if (!allowed) {
      ignoredWithdrawals++;
      continue;
    }
    const prev = lastWithdraw.get(w.payload.useId);
    if (!prev || (w.payload.notedAt ?? w.receivedAt) >= (prev.payload.notedAt ?? prev.receivedAt)) lastWithdraw.set(w.payload.useId, w);
  }
  const appliedWithdrawals = new Set<string>();
  for (const [useId, w] of lastWithdraw) {
    const e = useIndex.get(useId)!;
    if ((w.payload.notedAt ?? w.receivedAt) > e.latestEffective) {
      e.use.withdrawn = { opId: w.opId, at: w.receivedAt, byLabel: w.actor.label, reasonKo: w.payload.reasonKo };
      appliedWithdrawals.add(w.opId);
    }
  }

  let useCount = 0;
  let withdrawnCount = 0;
  for (const s of sources) {
    const rank = (h: string) => {
      const l = linkLabel(h);
      return l.startsWith('DOI') ? 1 : l.startsWith('PubMed') ? 2 : l.startsWith('PMC') ? 3 : 0;
    };
    s.links.sort((a, b) => rank(a.href) - rank(b.href) || cmpStr(a.href, b.href));
    s.primaryHref = s.links[0].href;
    s.uses.sort(
      (a, b) =>
        Number(!!a.withdrawn) - Number(!!b.withdrawn) ||
        cmpStr(b.consultedOn ?? '', a.consultedOn ?? '') ||
        cmpStr(b.lastReceivedAt, a.lastReceivedAt) ||
        cmpStr(a.domain, b.domain) ||
        cmpStr(a.reviewId, b.reviewId) ||
        cmpStr(a.useId, b.useId),
    );
    for (const u of s.uses) {
      if (u.lastReceivedAt > s.lastReceivedAt) s.lastReceivedAt = u.lastReceivedAt;
      if (u.withdrawn) {
        s.withdrawnUses++;
        withdrawnCount++;
        continue;
      }
      useCount++;
      s.useCounts[u.domain] += 1;
      s.latestConsultedOn = maxDate(s.latestConsultedOn, u.consultedOn);
      s.latestByDomain[u.domain] = maxDate(s.latestByDomain[u.domain], u.consultedOn);
    }
    s.domains = (['exercise', 'mechanics'] as Domain[]).filter((d) => s.useCounts[d] > 0);
  }

  sources.sort(
    (a, b) =>
      cmpStr(b.latestConsultedOn ?? '', a.latestConsultedOn ?? '') ||
      cmpStr(b.lastReceivedAt, a.lastReceivedAt) ||
      cmpStr(a.title ?? a.primaryHref, b.title ?? b.primaryHref) ||
      cmpStr(a.id, b.id),
  );

  const citationsByOp: Record<string, number> = {};
  for (const c of cites) citationsByOp[c.opId] = (citationsByOp[c.opId] ?? 0) + 1;
  for (const opId of appliedWithdrawals) citationsByOp[opId] = 1;
  return { sources, opCount: ops.length, citationCount: cites.length, useCount, withdrawnCount, skippedOps, foreignObjects, ignoredWithdrawals, citationsByOp };
}

/** 출처 번호(예전 번호 포함)로 찾기 */
export function findSource(lib: Library, id: string): EvidenceSource | null {
  return lib.sources.find((s) => s.id === id) ?? lib.sources.find((s) => s.aliasIds.includes(id)) ?? null;
}

/** 이 기록이 실제로 화면 목록에 들어갔는가(등록 · 거두기 뒤 읽기 확인) */
export function locateOp(lib: Library, opId: string): { sourceId: string; useId: string }[] {
  const out: { sourceId: string; useId: string }[] = [];
  for (const s of lib.sources)
    for (const u of s.uses) if (u.history.some((h) => h.opId === opId) || u.withdrawn?.opId === opId) out.push({ sourceId: s.id, useId: u.useId });
  return out;
}

/** 받음표(R2) — 이 기록이 가리키는 쓰임의 지금 상태. unknown: 그 쓰임을 목록에서 찾지 못함 */
export type UseState = 'active' | 'withdrawn' | 'unknown';
/**
 * 기록이 효과를 내지 못한 까닭 — withdraw: 다른 거두기가 효과를 내고 있음(같은 시각 · 더 늦은 시각) ·
 * register: 이 거두기 시각과 같거나 더 늦게 적힌 등록이 있어 쓰임이 살아 있음
 */
export type SupersededBy = 'withdraw' | 'register';

/**
 * 받음표용으로 모으기 결과를 읽기만 한다(모으기 결과 · 규칙은 바꾸지 않는다). 가져오기는 쓰임이 여럿이라 null.
 *  - 등록: 이 기록이 들어간 쓰임. 그 쓰임이 거둔 상태면 supersededBy 'withdraw'(더 늦게 적힌 거두기가 있다).
 *  - 거두기: 대상 쓰임. 이 거두기가 효과를 내고 있으면 supersededBy 없음.
 *    다른 거두기가 효과를 내고 있으면 'withdraw' — 모으기는 쓰임마다 가장 늦게 적힌 거두기 하나만 보므로 그 거두기는 이것과 같은 시각이거나 더 늦다.
 *    쓰임이 살아 있으면 'register' — 모으기는 거두기가 그 쓰임의 마지막 등록보다 뒤일 때만 거둔 것으로 보므로,
 *    이 거두기 시각과 같거나 더 늦게 적힌 등록이 있다는 뜻이다.
 *    거둘 수 없는 사람의 거두기(모으기가 무시한 것 — API 는 저장 전에 막는다)는 supersededBy 없음.
 */
export function opOutcome(lib: Library, op: Op): { useState: UseState; supersededBy: SupersededBy | null } | null {
  if (op.kind === 'import') return null;
  if (op.kind === 'register') {
    for (const s of lib.sources)
      for (const u of s.uses) if (u.history.some((h) => h.opId === op.opId)) return u.withdrawn ? { useState: 'withdrawn', supersededBy: 'withdraw' } : { useState: 'active', supersededBy: null };
    return { useState: 'unknown', supersededBy: null };
  }
  let target: EvidenceUse | null = null;
  for (const s of lib.sources) for (const u of s.uses) if (u.useId === op.payload.useId) target = u;
  if (!target) return { useState: 'unknown', supersededBy: null };
  const useState: UseState = target.withdrawn ? 'withdrawn' : 'active';
  if (target.withdrawn?.opId === op.opId) return { useState, supersededBy: null };
  const allowed = target.scope === 'historical' || target.ownerUserId === op.actor.userId;
  if (!allowed) return { useState, supersededBy: null };
  return { useState, supersededBy: target.withdrawn ? 'withdraw' : 'register' };
}

export { scopeKeyOf };
