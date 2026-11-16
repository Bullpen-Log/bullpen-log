/**
 * EX-REF02 — 관리자 참고자료(비공개) 목록 · 한 자료의 모양과 검사(순수 — DB · 저장소 · 화면을 모른다).
 *
 * 내용(원문 · 옮김 · 요약)은 이 저장소에 없다. 비공개 저장소의 JSON 을 서버가 읽어 여기서 검사한다(README.md).
 * 검사는 '모양이 맞지 않으면 보여 주지 않는다'(fail closed): 목록 하나가 틀리면 목록 전체를, 자료 하나가 틀리면 그 자료를 거절한다.
 * 화면에 내보내는 모양(view.ts ListItem · load.ts PublicDetail)에는 저장소 열쇠(detailKey · asset.key)가 없다.
 */

export const SCHEMA_VERSION = 1;

/** 저장소 자리 — 비공개 버킷 pitch-videos 안 */
export const STORAGE_PREFIX = 'admin-references/v1/';
export const CATALOG_KEY = `${STORAGE_PREFIX}catalog.json`;
const DETAIL_KEY = /^admin-references\/v1\/entries\/[A-Za-z0-9_-]{6,80}\.json$/;
const ENTRY_ID = /^[A-Za-z0-9_-]{6,80}$/;
/** 원본 파일 열쇠(버킷 external-intake) — 이름은 불투명, 끝의 확장자는 있어도 없어도 된다 */
export const ASSET_PREFIX = `${STORAGE_PREFIX}assets/`;
export const ASSET_KEY = /^admin-references\/v1\/assets\/[A-Za-z0-9_-]{6,80}(\.[a-z0-9]{2,5})?$/;
/**
 * 원본으로 보낼 수 있는 형식 — HTML · SVG · 스크립트처럼 브라우저가 실행할 수 있는 형식은 넣지 않는다.
 * 영상도 넣지 않는다(EX-REF03, 2026-11-16 사용자: 참고 영상 원본은 우리 서버에 두지 않는다 — 원래 올라온 곳의 링크로만 연다).
 */
export const ASSET_MIMES = ['application/pdf', 'audio/mp4', 'audio/mpeg', 'image/jpeg', 'image/png'] as const;
/** 열쇠 이름이 영상 파일처럼 보이면 형식 값과 상관없이 거절 */
const VIDEO_FILE_EXT = /\.(mp4|m4v|mov|qt|webm|mkv|avi|wmv|flv|mpg|mpeg|3gp|ogv|m2ts|mts)$/;

/**
 * 원본 영상 링크(EX-REF03) — 지금은 YouTube 만. 정해 둔 주소 모양만 받아 https://www.youtube.com/watch?v=<11자> 로 바꾼다.
 * 서버는 이 주소를 읽지 않는다(화면 링크로만). 계정 · 포트 · # · v 밖의 쿼리(공유 토큰 si · 재생목록 · 시각 · 돌려보내기 값) ·
 * 다른 호스트(닮은 이름 · IP · localhost · googlevideo 같은 영상 파일 주소) · http · javascript: · data: 는 모두 거절.
 * 다른 영상 사이트가 필요하면 GPT 와 정한 뒤 이 목록에 더한다(아무 주소나 받지 않는다).
 */
const YOUTUBE_WATCH_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function canonicalYouTubeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 200 || /[\s\\#]/.test(s) || !/^https:\/\//i.test(s)) return null;
  /* 주소 머리(호스트 자리)에 계정 · 포트가 있으면 거절 — URL 이 기본 포트 :443 을 지워 버리기 전에 본다 */
  const authority = s.slice('https://'.length).split(/[/?]/)[0];
  if (authority.includes('@') || authority.includes(':')) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
  let id: string | null = null;
  if (YOUTUBE_WATCH_HOSTS.has(u.hostname)) {
    if (u.pathname !== '/watch') return null;
    const keys = [...u.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== 'v') return null;
    id = u.searchParams.get('v');
  } else if (u.hostname === 'youtu.be') {
    if (u.search) return null;
    id = u.pathname.slice(1);
  } else {
    return null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
export const MAX_DETAIL_BYTES = 16 * 1024 * 1024;

const LIMITS = {
  entries: 3000,
  bibliography: 3000,
  pages: 5000,
  intervals: 2000,
  categories: 8,
  topics: 40,
  uses: 300,
  sections: 1000,
  glossary: 3000,
  claims: 1000,
  evidence: 60,
  limitations: 200,
  tableColumns: 30,
  tableRows: 500,
} as const;

const TEXT = { title: 300, short: 120, line: 2000, searchText: 50_000, body: 200_000 } as const;

export const CATEGORIES = ['strength', 'power', 'mobility', 'pitching', 'recovery', 'programming', 'assessment', 'sources'] as const;
export type Category = (typeof CATEGORIES)[number];
export const KINDS = ['document', 'video', 'research'] as const;
export type Kind = (typeof KINDS)[number];
export const RIGHTS = ['private-summary', 'licensed-private', 'pending'] as const;
export type Rights = (typeof RIGHTS)[number];
export const DECISIONS = ['retain', 'qualify', 'update', 'insufficient'] as const;
export type Decision = (typeof DECISIONS)[number];
export const SECTION_KINDS = ['translation', 'note', 'table', 'limitation'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export type Interval = [number, number];
export type Coverage = { textPages: number[]; visualPages: number[]; videoIntervals: Interval[]; audioIntervals: Interval[] };

export type Entry = {
  id: string;
  title: string;
  collection: string;
  kind: Kind;
  language: string;
  categories: Category[];
  availability: string;
  rights: Rights;
  sha256: string;
  bytes: number;
  pageCount: number | null;
  durationSeconds: number | null;
  coverage: Coverage;
  reviewStatus: string;
  topics: string[];
  /** 서버에서만 — 찾기에 쓰고 화면으로 보내지 않는다 */
  searchText: string | null;
  /** 서버에서만 — 저장소 열쇠 */
  detailKey: string;
};

export type BibUse = { reviewId: string | null; exercise: string | null; note: string | null };
export type BibItem = {
  id: string;
  url: string;
  kind: string;
  title: string | null;
  publisher: string | null;
  authors: string | null;
  year: number | null;
  doi: string | null;
  metadataStatus: string;
  uses: BibUse[];
};

export type Catalog = { schemaVersion: 1; title: string; updatedAt: string; entries: Entry[]; bibliography: BibItem[] };

export type Evidence = {
  title: string;
  url: string;
  doi: string | null;
  year: number | null;
  population: string;
  methods: string;
  sample: string | null;
  outcome: string;
  limitations: string;
  applicability: 'direct' | 'inferred';
};
export type Claim = {
  id: string;
  originalClaimKo: string;
  sourcePages: number[];
  sourceSeconds: number[];
  decision: Decision;
  interpretationKo: string;
  evidence: Evidence[];
};
export type Section = {
  id: string;
  title: string;
  kind: SectionKind;
  sourcePages: number[];
  startSeconds: number | null;
  endSeconds: number | null;
  textKo: string;
  table: { columns: string[]; rows: string[][] } | null;
};
export type GlossaryItem = { en: string; ko: string; meaning: string };
export type Asset = { key: string; mime: (typeof ASSET_MIMES)[number]; filename: string; rightsConfirmed: boolean };
/** 원본 영상 링크 — url 은 바꿔 둔 YouTube 주소, checkedAt 은 링크를 확인한 때(영상 전체를 검토했다는 뜻이 아니다) */
export type ExternalVideo = { url: string; title: string; author: string; checkedAt: string };

export type Detail = {
  id: string;
  title: string;
  collection: string;
  kind: Kind;
  digestKo: string;
  sections: Section[];
  glossary: GlossaryItem[];
  claims: Claim[];
  limitationsKo: string[];
  /** 서버에서만 — 원본 파일 열쇠. 화면에는 대표관리자 원본 통로(app/api/admin/references/[id]/original) 주소만 간다(README). 영상 자료는 늘 null */
  asset: Asset | null;
  /** 영상 자료만 — 원래 올라온 곳의 원본 영상 링크(EX-REF03). 없는 옛 JSON 은 null */
  externalVideo: ExternalVideo | null;
};

/* ─────────────────────────── 검사 도우미 ─────────────────────────── */

class Invalid extends Error {}

function fail(where: string): never {
  throw new Invalid(where);
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(where);
  return v as Record<string, unknown>;
}

function str(v: unknown, where: string, max: number, opts: { empty?: boolean } = {}): string {
  if (typeof v !== 'string') fail(where);
  const s = v.trim();
  if (!opts.empty && !s) fail(where);
  if (s.length > max) fail(where);
  return s;
}

function optStr(v: unknown, where: string, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = str(v, where, max, { empty: true });
  return s || null;
}

function arr(v: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail(where);
  return v;
}

function optArr(v: unknown, where: string, max: number): unknown[] {
  if (v === undefined || v === null) return [];
  return arr(v, where, max);
}

function int(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(where);
  return v;
}

function num(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(where);
  return v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], where: string): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) fail(where);
  return v as T;
}

/** 상태 값(availability · reviewStatus · metadataStatus) — 영문 소문자 낱말만. 화면에는 한국어 이름으로(view.ts) */
function status(v: unknown, where: string): string {
  const s = str(v, where, 40);
  if (!/^[a-z][a-z0-9_-]*$/.test(s)) fail(where);
  return s;
}

/** 공개 출처 주소 — http(s) 만. 서버가 이 주소를 읽지 않는다(화면 링크로만) */
function publicUrl(v: unknown, where: string): string {
  const s = str(v, where, 2000);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    fail(where);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') fail(where);
  if (u.username || u.password) fail(where);
  return u.toString();
}

function pages(v: unknown, where: string, pageCount: number | null): number[] {
  const list = optArr(v, where, LIMITS.pages);
  if (list.length && pageCount == null) fail(where);
  const out = new Set<number>();
  for (const p of list) out.add(int(p, where, 1, pageCount ?? 1));
  return [...out].sort((a, b) => a - b);
}

function intervals(v: unknown, where: string, duration: number | null): Interval[] {
  const list = optArr(v, where, LIMITS.intervals);
  if (list.length && duration == null) fail(where);
  return list.map((x) => {
    const pair = arr(x, where, 2);
    if (pair.length !== 2) fail(where);
    const a = num(pair[0], where, 0, duration ?? 0);
    const b = num(pair[1], where, 0, duration ?? 0);
    if (!(a < b)) fail(where);
    return [a, b] as Interval;
  });
}

/* ─────────────────────────── 목록 ─────────────────────────── */

function parseEntry(v: unknown, i: number): Entry {
  const w = `entry:${i}`;
  const o = obj(v, w);
  const id = str(o.id, w, 80);
  if (!ENTRY_ID.test(id)) fail(w);
  const detailKey = str(o.detailKey, w, 200);
  if (!DETAIL_KEY.test(detailKey)) fail(w);
  const pageCount = o.pageCount === undefined || o.pageCount === null ? null : int(o.pageCount, w, 1, 100_000);
  const durationSeconds = o.durationSeconds === undefined || o.durationSeconds === null ? null : num(o.durationSeconds, w, 0.001, 1_000_000);
  const cov = obj(o.coverage, w);
  const categories = [...new Set(arr(o.categories, w, LIMITS.categories).map((c) => oneOf(c, CATEGORIES, w)))];
  const sha = str(o.sha256, w, 64);
  if (!/^[a-f0-9]{64}$/.test(sha)) fail(w);
  return {
    id,
    title: str(o.title, w, TEXT.title),
    collection: str(o.collection, w, TEXT.short),
    kind: oneOf(o.kind, KINDS, w),
    language: str(o.language, w, 20),
    categories,
    availability: status(o.availability, w),
    rights: oneOf(o.rights, RIGHTS, w),
    sha256: sha,
    bytes: int(o.bytes, w, 0, Number.MAX_SAFE_INTEGER),
    pageCount,
    durationSeconds,
    coverage: {
      textPages: pages(cov.textPages, w, pageCount),
      visualPages: pages(cov.visualPages, w, pageCount),
      videoIntervals: intervals(cov.videoIntervals, w, durationSeconds),
      audioIntervals: intervals(cov.audioIntervals, w, durationSeconds),
    },
    reviewStatus: status(o.reviewStatus, w),
    topics: [...new Set(optArr(o.topics, w, LIMITS.topics).map((t) => str(t, w, TEXT.short)))],
    searchText: optStr(o.searchText, w, TEXT.searchText),
    detailKey,
  };
}

function parseBib(v: unknown, i: number): BibItem {
  const w = `bibliography:${i}`;
  const o = obj(v, w);
  const id = str(o.id, w, 60);
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(id)) fail(w);
  const uses = optArr(o.uses, w, LIMITS.uses).map((u) => {
    const x = obj(u, w);
    /* recordFile · field 같은 내부 기록 자리는 읽지도 내보내지도 않는다 */
    return { reviewId: optStr(x.reviewId, w, 60), exercise: optStr(x.exercise, w, TEXT.short), note: optStr(x.note, w, TEXT.line) };
  });
  return {
    id,
    url: publicUrl(o.url, w),
    kind: status(o.kind, w),
    title: optStr(o.title, w, TEXT.title * 2),
    publisher: optStr(o.publisher, w, TEXT.short * 2),
    authors: optStr(o.authors, w, TEXT.line),
    year: o.year === undefined || o.year === null ? null : int(o.year, w, 1800, 2200),
    doi: optStr(o.doi, w, 200),
    metadataStatus: status(o.metadataStatus ?? 'pending', w),
    uses,
  };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: 'malformed'; where: string };

/** 목록 JSON 검사 — 하나라도 틀리면 거절(where 는 '항목 몇 번'까지만, 값 · 경로는 담지 않는다) */
export function parseCatalog(raw: unknown): ParseResult<Catalog> {
  try {
    const o = obj(raw, 'catalog');
    if (o.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion');
    const updatedAt = str(o.updatedAt, 'updatedAt', 40);
    if (!Number.isFinite(Date.parse(updatedAt))) fail('updatedAt');
    const entries = arr(o.entries, 'entries', LIMITS.entries).map(parseEntry);
    const ids = new Set<string>();
    const keys = new Set<string>();
    entries.forEach((e, i) => {
      if (ids.has(e.id) || keys.has(e.detailKey)) fail(`entry:${i}`);
      ids.add(e.id);
      keys.add(e.detailKey);
    });
    const bibliography = optArr(o.bibliography, 'bibliography', LIMITS.bibliography).map(parseBib);
    const bibIds = new Set<string>();
    bibliography.forEach((b, i) => {
      if (bibIds.has(b.id)) fail(`bibliography:${i}`);
      bibIds.add(b.id);
    });
    return { ok: true, value: { schemaVersion: 1, title: str(o.title, 'title', TEXT.title), updatedAt, entries, bibliography } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: 'malformed', where: e.message };
    return { ok: false, reason: 'malformed', where: 'catalog' };
  }
}

/* ─────────────────────────── 한 자료 ─────────────────────────── */

function parseEvidence(v: unknown, w: string): Evidence {
  const o = obj(v, w);
  return {
    title: str(o.title, w, TEXT.title * 2),
    url: publicUrl(o.url, w),
    doi: optStr(o.doi, w, 200),
    year: o.year === undefined || o.year === null ? null : int(o.year, w, 1800, 2200),
    population: str(o.population, w, TEXT.line),
    methods: str(o.methods, w, TEXT.line),
    sample: optStr(o.sample, w, TEXT.line),
    outcome: str(o.outcome, w, TEXT.line),
    limitations: str(o.limitations, w, TEXT.line),
    applicability: oneOf(o.applicability, ['direct', 'inferred'] as const, w),
  };
}

/** 원본 영상 링크 — 없으면 null(옛 JSON 그대로 읽힘). 영상이 아닌 자료에 있거나 모양이 틀리면 자료 전체 거절 */
function parseExternalVideo(v: unknown, kind: Kind): ExternalVideo | null {
  if (v === undefined || v === null) return null;
  if (kind !== 'video') fail('externalVideo');
  const o = obj(v, 'externalVideo');
  const url = canonicalYouTubeUrl(o.url);
  if (!url) fail('externalVideo');
  const checkedAt = str(o.checkedAt, 'externalVideo', 40);
  if (!Number.isFinite(Date.parse(checkedAt))) fail('externalVideo');
  return { url, title: str(o.title, 'externalVideo', TEXT.title), author: str(o.author, 'externalVideo', TEXT.short), checkedAt };
}

/** 한 자료 JSON 검사 — 목록의 그 항목과 같은 자료인지(id · 종류)도 본다 */
export function parseDetail(raw: unknown, entry: Pick<Entry, 'id' | 'kind' | 'pageCount' | 'durationSeconds'>): ParseResult<Detail> {
  try {
    const o = obj(raw, 'detail');
    if (o.schemaVersion !== undefined && o.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion');
    if (o.id !== entry.id) fail('id');
    const kind = oneOf(o.kind, KINDS, 'kind');
    if (kind !== entry.kind) fail('kind');
    const sectionIds = new Set<string>();
    const sections = optArr(o.sections, 'sections', LIMITS.sections).map((s, i) => {
      const w = `section:${i}`;
      const x = obj(s, w);
      const id = str(x.id, w, 80);
      if (sectionIds.has(id)) fail(w);
      sectionIds.add(id);
      const k = oneOf(x.kind, SECTION_KINDS, w);
      const start = x.startSeconds === undefined || x.startSeconds === null ? null : num(x.startSeconds, w, 0, entry.durationSeconds ?? 0);
      const end = x.endSeconds === undefined || x.endSeconds === null ? null : num(x.endSeconds, w, 0, entry.durationSeconds ?? 0);
      if (start != null && end != null && !(start < end)) fail(w);
      let table: Section['table'] = null;
      if (x.table !== undefined && x.table !== null) {
        const t = obj(x.table, w);
        const columns = arr(t.columns, w, LIMITS.tableColumns).map((c) => str(c, w, TEXT.short, { empty: true }));
        const rows = arr(t.rows, w, LIMITS.tableRows).map((r) => {
          const cells = arr(r, w, LIMITS.tableColumns).map((c) => str(c, w, TEXT.line, { empty: true }));
          if (cells.length !== columns.length) fail(w);
          return cells;
        });
        table = { columns, rows };
      }
      if (k === 'table' && !table) fail(w);
      return {
        id,
        title: str(x.title, w, TEXT.title),
        kind: k,
        sourcePages: pages(x.sourcePages, w, entry.pageCount),
        startSeconds: start,
        endSeconds: end,
        textKo: str(x.textKo, w, TEXT.body, { empty: k === 'table' }),
        table,
      };
    });
    const glossary = optArr(o.glossary, 'glossary', LIMITS.glossary).map((g, i) => {
      const x = obj(g, `glossary:${i}`);
      return { en: str(x.en, `glossary:${i}`, TEXT.short), ko: str(x.ko, `glossary:${i}`, TEXT.short), meaning: str(x.meaning, `glossary:${i}`, TEXT.line, { empty: true }) };
    });
    const claimIds = new Set<string>();
    const claims = optArr(o.claims, 'claims', LIMITS.claims).map((c, i) => {
      const w = `claim:${i}`;
      const x = obj(c, w);
      const id = str(x.id, w, 80);
      if (claimIds.has(id)) fail(w);
      claimIds.add(id);
      const secs = optArr(x.sourceSeconds, w, LIMITS.intervals).map((s) => num(s, w, 0, entry.durationSeconds ?? 0));
      if (secs.length && entry.durationSeconds == null) fail(w);
      return {
        id,
        originalClaimKo: str(x.originalClaimKo, w, TEXT.line * 5),
        sourcePages: pages(x.sourcePages, w, entry.pageCount),
        sourceSeconds: secs,
        decision: oneOf(x.decision, DECISIONS, w),
        interpretationKo: str(x.interpretationKo, w, TEXT.line * 5),
        evidence: optArr(x.evidence, w, LIMITS.evidence).map((e) => parseEvidence(e, w)),
      };
    });
    let asset: Asset | null = null;
    if (o.asset !== undefined && o.asset !== null) {
      /* 영상 자료에는 원본 파일을 두지 않는다(EX-REF03) — 어떤 형식이든 거절 */
      if (kind === 'video') fail('asset');
      const a = obj(o.asset, 'asset');
      const key = str(a.key, 'asset', 300);
      /* 원본은 비공개 버킷 external-intake 의 이 자리 안에서만(storage.ts) — '..' · 다른 폴더 열쇠 · 영상 파일 이름은 거절 */
      if (!ASSET_KEY.test(key) || VIDEO_FILE_EXT.test(key)) fail('asset');
      asset = {
        key,
        /* 저장소에는 application/octet-stream 으로 있다 — 보낼 때 쓸 실제 형식을 여기서 정한다(이 목록 밖은 거절) */
        mime: oneOf(a.mime, ASSET_MIMES, 'asset'),
        filename: str(a.filename, 'asset', 200),
        rightsConfirmed: a.rightsConfirmed === true,
      };
    }
    return {
      ok: true,
      value: {
        id: entry.id,
        title: str(o.title, 'title', TEXT.title),
        collection: str(o.collection, 'collection', TEXT.short),
        kind,
        digestKo: str(o.digestKo, 'digestKo', TEXT.body, { empty: true }),
        sections,
        glossary,
        claims,
        limitationsKo: optArr(o.limitationsKo, 'limitationsKo', LIMITS.limitations).map((l) => str(l, 'limitationsKo', TEXT.line)),
        asset,
        externalVideo: parseExternalVideo(o.externalVideo, kind),
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: 'malformed', where: e.message };
    return { ok: false, reason: 'malformed', where: 'detail' };
  }
}

/** 화면 주소의 자료 번호 검사 — 맞지 않으면 저장소를 묻지 않는다 */
export function validEntryId(v: unknown): v is string {
  return typeof v === 'string' && ENTRY_ID.test(v);
}
