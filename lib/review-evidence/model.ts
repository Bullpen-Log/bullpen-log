import { checkEvidenceUrl, cleanDoi, cleanPmcid, cleanPmid, URL_REJECTION_TEXT, type Identifiers } from '@/lib/review-evidence/url';

/**
 * EX-REF04 — 검수 근거자료의 모양 · 입력 검사(순수, 'server-only' 없음 — 시험 · 명령 도구가 같이 쓴다).
 *
 * 저장은 '바꾸지 않는 작업 기록(op)'을 하나씩 쌓는다. 한 번 쓴 기록은 고치지 않고, 같은 요청을 다시 보내면 같은 기록으로 끝난다.
 * - 출처(Source)와 쓰임(Use)은 따로다. 같은 출처가 여러 검수 · 여러 사람 · 운동과 메커니즘 양쪽에 쓰일 수 있다.
 * - 쓰임의 정체 = 쓴 사람(로그인 계정, 과거 기록이면 'hist:<이름>') + 분야 + 검수 번호 + 운동/드릴 번호 + 쓴 곳 + 출처 링크.
 *   다른 사람의 쓰임은 같은 정체가 될 수 없으므로 서로 덮지 않는다.
 * - 모르는 값(확인일 · 읽은 범위 · 번호)은 비워 둔다. 가져온 시각으로 채우지 않는다.
 * 원문 · PDF · 영상 · 전문은 받지 않는다(링크 · 짧은 한국어 요약만).
 */

export const SCHEMA_OP = 'review-evidence/v1/op';
export const STORAGE_PREFIX = 'review-evidence/v1/';
export const OP_FOLDER = 'review-evidence/v1/ops';
export const OP_NAME = /^[0-9a-f]{64}\.json$/;

/** 한 번 등록 요청 본문 한도 */
export const MAX_REGISTER_BYTES = 32 * 1024;
/** 과거 가져오기 한 묶음 본문 한도(묶음은 여럿으로 나눠 보낸다) */
export const MAX_IMPORT_BYTES = 768 * 1024;
export const MAX_IMPORT_RECORDS = 150;
/** 저장된 기록 하나의 한도 — 등록 + 감싼 칸 */
export const MAX_OP_BYTES = 1024 * 1024;

export const DOMAINS = ['exercise', 'mechanics'] as const;
export type Domain = (typeof DOMAINS)[number];
export const DOMAIN_LABEL: Record<Domain, string> = { exercise: '운동', mechanics: '메커니즘' };

export const SOURCE_KINDS = [
  'original-research',
  'systematic-review',
  'narrative-review',
  'professional-guidance',
  'coaching-material',
  'regulation',
  'textbook',
  'thesis',
  'other',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  'original-research': '원저 연구',
  'systematic-review': '체계적 문헌고찰 · 메타분석',
  'narrative-review': '문헌 검토(종설)',
  'professional-guidance': '전문 기관 지침 · 학회 자료',
  'coaching-material': '코칭 · 훈련 자료',
  regulation: '규정 · 법령 · 행정 지침',
  textbook: '교재 · 전문서',
  thesis: '학위논문',
  other: '기타',
};

/** 실제로 읽은 범위 — 모르면 unknown(가져온 기록은 대부분 이것) */
export const READING = ['unknown', 'metadata-only', 'abstract', 'partial', 'full-text'] as const;
export type Reading = (typeof READING)[number];
export const READING_LABEL: Record<Reading, string> = {
  unknown: '읽은 범위 미확인',
  'metadata-only': '서지정보만 확인',
  abstract: '초록까지 확인',
  partial: '본문 일부 확인',
  'full-text': '본문 전체 확인',
};

/** 요약이 무엇을 보고 쓴 것인가 — 읽은 범위와 따로 */
export const SUMMARY_BASIS = ['title-metadata', 'abstract', 'partial', 'full-text', 'review-notes'] as const;
export type SummaryBasis = (typeof SUMMARY_BASIS)[number];
export const SUMMARY_BASIS_LABEL: Record<SummaryBasis, string> = {
  'title-metadata': '제목 · 서지정보 기준 요약(본문 미확인)',
  abstract: '초록 기준 요약',
  partial: '본문 일부 기준 요약',
  'full-text': '본문 기준 요약',
  'review-notes': '검수 기록에 남은 메모 기준 요약',
};

/** 어디에 썼나(검수 화면의 어느 판단 · 글) */
export const PURPOSES = [
  'description',
  'cue',
  'prescription',
  'safety',
  'progression',
  'mechanism',
  'evidence-check',
  'video-check',
  'user-request',
  'other',
] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABEL: Record<Purpose, string> = {
  description: '설명 · 목적 글',
  cue: '동작 신호 · 큐',
  prescription: '세트 · 횟수 · 휴식 처방',
  safety: '안전 · 주의 문구',
  progression: '진행 · 변형 · 대체',
  mechanism: '동작 원리 · 메커니즘',
  'evidence-check': '근거 재확인',
  'video-check': '영상 판정 근거',
  'user-request': '사용자 수정 요청 반영',
  other: '기타',
};

/** 서지정보를 어디서 확인했나 — 공식 서비스로 확인한 번호만 같은 자료로 묶는다 */
export const METADATA_SOURCES = ['ncbi', 'crossref', 'publisher-page', 'official-page'] as const;
export type MetadataSource = (typeof METADATA_SOURCES)[number];
export const METADATA_SOURCE_LABEL: Record<MetadataSource, string> = {
  ncbi: 'NCBI(PubMed · PMC) 공식 서지',
  crossref: 'Crossref 공식 서지',
  'publisher-page': '출판사 공식 페이지',
  'official-page': '발행 기관 공식 페이지',
};

export const HISTORICAL_REVIEWERS = ['yunho', 'kimmin'] as const;
export type HistoricalReviewer = (typeof HISTORICAL_REVIEWERS)[number];
export const HISTORICAL_REVIEWER_LABEL: Record<HistoricalReviewer, string> = { yunho: '금윤호', kimmin: '김민' };

export const HISTORICAL_ORIGINS = ['seed-catalog', 'exercise-record', 'mechanics-record', 'mechanics-handoff'] as const;
export type HistoricalOrigin = (typeof HISTORICAL_ORIGINS)[number];

/* ───────── 입력 모양 ───────── */

export type SourceInput = {
  url: string;
  /** 같은 자료의 다른 공식 링크 — 서지 확인(metadata.verifiedBy)이 있을 때만 받는다 */
  altUrls: string[];
  kind: SourceKind | null;
  title: string | null;
  authors: string[];
  container: string | null; // 학술지 · 발행처
  year: number | null;
  identifiers: Identifiers;
  /** 서지정보 · 번호를 확인한 공식 서비스. null 이면 적은 사람이 넣은 값(묶기에 쓰지 않음) */
  verifiedBy: MetadataSource | null;
  summaryKo: string | null;
  summaryBasis: SummaryBasis | null;
};

export type UseInput = {
  domain: Domain;
  reviewId: string;
  itemId: string | null;
  itemName: string | null;
  purpose: Purpose;
  purposeNote: string | null;
  consultedOn: string | null; // YYYY-MM-DD
  /**
   * 쓴 사람 쪽에서 이 쓰임을 적은 때(등록 도구가 처음 대기열에 넣은 때 · 화면에서 처음 보낸 때). 같은 쓰임을 고친 기록끼리의 차례는
   * 이것으로 정한다 — 늦게 다시 보낸 옛 요청이 그 뒤의 고침을 덮지 않게. 없으면 서버가 받은 때. 과거 가져오기는 비운다.
   */
  notedAt: string | null;
  applicationKo: string | null;
  limitationsKo: string | null;
  reading: Reading;
  readingNote: string | null;
};

export type HistoricalInput = {
  reviewer: HistoricalReviewer;
  origins: HistoricalOrigin[];
  /** 그 출처가 검수 기록에 적힌 때(확인일과 다르다). 모르면 null */
  recordedAt: string | null;
};

export type RegisterPayload = { source: SourceInput; use: UseInput };
export type ImportRecord = { source: SourceInput; use: UseInput; historical: HistoricalInput };
export type ImportPayload = {
  snapshot: { id: string; inputs: { name: string; sha256: string }[] };
  chunk: { index: number; total: number };
  records: ImportRecord[];
};

export type OpKind = 'register' | 'import' | 'withdraw';

/** 잘못 등록한 쓰임을 거둔다(지우지 않음 — 기록은 남고 화면은 '거둔 쓰임'으로 접어 둔다). 같은 사람의 쓰임 · 과거 기록만 */
export type WithdrawPayload = { useId: string; reasonKo: string; notedAt: string | null };
export type Actor = { userId: string; label: string };

/**
 * 한 번 쓰기 시도의 무작위 번호(소문자 16진 32자). 쓰기마다 새로 만들어 본문에 넣는다 — 다시 읽은 본문의 번호가 내 번호와 같으면
 * 내가 만든 기록(새로 저장 201), 다르거나 없으면 앞서 저장된 같은 요청(다시 보냄 200). 내용 지문 · 기록 번호에는 들어가지 않는다.
 * 옛 기록(R1, 중앙의 가져오기 3건 포함)에는 없다 — 없으면 늘 '앞서 저장된 것'으로 본다.
 */
export const WRITE_ID = /^[0-9a-f]{32}$/;

type OpBase = { schema: typeof SCHEMA_OP; opId: string; requestKey: string; payloadHash: string; actor: Actor; receivedAt: string; writeId?: string };

/** 저장소에 쌓이는 기록 한 건(바꾸지 않음) */
export type Op =
  | (OpBase & { kind: 'register'; payload: RegisterPayload })
  | (OpBase & { kind: 'import'; payload: ImportPayload })
  | (OpBase & { kind: 'withdraw'; payload: WithdrawPayload });

/* ───────── 검사 도우미 ───────── */

export type Issue = { field: string; message: string };
export type Parsed<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

const HANGUL = /[가-힣]/;
const CONTROL_LINE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;
const CONTROL_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;
/** 화면 글에 들어가면 안 되는 내부 경로 · 비밀 같은 것 */
const LEAKY = /(\/Users\/|\/home\/|[A-Za-z]:\\|docs\/reviews|docs\/references|video-records\.json|checkpoint\.json|\.jsonl?\b|eyJ[A-Za-z0-9_-]{16,}|service_role|SUPABASE_|SESSION_SECRET|sk-[A-Za-z0-9]{16,}|-----BEGIN)/i;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
export const REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const codePoints = (s: string) => [...s].length;

class Collector {
  issues: Issue[] = [];
  add(field: string, message: string) {
    if (this.issues.length < 30) this.issues.push({ field, message });
  }
}

function onlyKeys(c: Collector, obj: Record<string, unknown>, allowed: readonly string[], at: string) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) c.add(`${at}.${k}`, '모르는 칸이에요.');
}

function line(c: Collector, v: unknown, at: string, max: number, required = false): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
    if (required) c.add(at, '꼭 넣어야 해요.');
    return null;
  }
  if (typeof v !== 'string') {
    c.add(at, '글자로 넣어 주세요.');
    return null;
  }
  const s = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (CONTROL_LINE.test(s)) return c.add(at, '보이지 않는 글자가 들어 있어요.'), null;
  if (codePoints(s) > max) return c.add(at, `${max}자까지 넣어 주세요.`), null;
  if (LEAKY.test(s)) return c.add(at, '내부 파일 경로 · 비밀 값처럼 보이는 글은 넣지 않아요.'), null;
  return s;
}

function koText(c: Collector, v: unknown, at: string, max: number, required = false): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
    if (required) c.add(at, '꼭 넣어야 해요.');
    return null;
  }
  if (typeof v !== 'string') return c.add(at, '글자로 넣어 주세요.'), null;
  const s = v
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (CONTROL_TEXT.test(s)) return c.add(at, '보이지 않는 글자가 들어 있어요.'), null;
  if (codePoints(s) > max) return c.add(at, `${max}자까지 줄여 주세요.`), null;
  if (!HANGUL.test(s)) return c.add(at, '한국어로 짧게 적어 주세요.'), null;
  if (LEAKY.test(s)) return c.add(at, '내부 파일 경로 · 비밀 값처럼 보이는 글은 넣지 않아요.'), null;
  if (/https?:\/\//i.test(s)) return c.add(at, '링크는 글이 아니라 링크 칸에 넣어 주세요.'), null;
  return s;
}

function oneOf<T extends string>(c: Collector, v: unknown, list: readonly T[], at: string, fallback: T | null): T | null {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string' && (list as readonly string[]).includes(v)) return v as T;
  c.add(at, '정해진 값 가운데 하나를 넣어 주세요.');
  return fallback;
}

/** 오늘(한국 시각) — 확인일이 미래면 거절(하루 여유) */
export function todayKst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function date(c: Collector, v: unknown, at: string, now: Date): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !validDate(v.trim())) return c.add(at, 'YYYY-MM-DD 모양으로 넣어 주세요.'), null;
  const s = v.trim();
  const limit = new Date(todayKst(now) + 'T00:00:00Z');
  limit.setUTCDate(limit.getUTCDate() + 1);
  if (s > limit.toISOString().slice(0, 10)) return c.add(at, '앞으로 올 날짜는 넣을 수 없어요.'), null;
  if (s < '2000-01-01') return c.add(at, '날짜가 너무 이르다.'), null;
  return s;
}

function isoTime(c: Collector, v: unknown, at: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.length > 40) return c.add(at, '시각 모양이 맞지 않아요.'), null;
  const t = Date.parse(v);
  if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return c.add(at, '시각 모양이 맞지 않아요.'), null;
  return new Date(t).toISOString();
}

function id(c: Collector, v: unknown, at: string, required: boolean): string | null {
  if (v === undefined || v === null || v === '') {
    if (required) c.add(at, '꼭 넣어야 해요.');
    return null;
  }
  if (typeof v !== 'string' || !ID_PATTERN.test(v.trim())) return c.add(at, '영문 · 숫자 · . _ : - 로 된 120자까지의 번호여야 해요.'), null;
  return v.trim();
}

/* ───────── 출처 ───────── */

const SOURCE_KEYS = ['url', 'altUrls', 'kind', 'title', 'authors', 'container', 'year', 'identifiers', 'verifiedBy', 'summaryKo', 'summaryBasis'];

function parseSource(c: Collector, raw: unknown, at: string): SourceInput | null {
  if (!isObj(raw)) return c.add(at, '출처 묶음이 필요해요.'), null;
  onlyKeys(c, raw, SOURCE_KEYS, at);
  const u = checkEvidenceUrl(raw.url);
  if (!u.ok) c.add(`${at}.url`, URL_REJECTION_TEXT[u.reason]);
  const verifiedBy = oneOf(c, raw.verifiedBy, METADATA_SOURCES, `${at}.verifiedBy`, null);

  const altUrls: string[] = [];
  if (raw.altUrls !== undefined && raw.altUrls !== null) {
    if (!Array.isArray(raw.altUrls) || raw.altUrls.length > 6) c.add(`${at}.altUrls`, '다른 링크는 6개까지 목록으로 넣어 주세요.');
    else {
      if (raw.altUrls.length && !verifiedBy) c.add(`${at}.altUrls`, '다른 링크는 공식 서지 확인(verifiedBy)이 있을 때만 받아요.');
      raw.altUrls.forEach((a, i) => {
        const r = checkEvidenceUrl(a);
        if (!r.ok) c.add(`${at}.altUrls[${i}]`, URL_REJECTION_TEXT[r.reason]);
        else if (!altUrls.includes(r.href) && (!u.ok || r.normalized !== u.normalized)) altUrls.push(r.href);
      });
    }
  }

  const authors: string[] = [];
  if (raw.authors !== undefined && raw.authors !== null) {
    if (!Array.isArray(raw.authors) || raw.authors.length > 60) c.add(`${at}.authors`, '저자는 60명까지 목록으로 넣어 주세요.');
    else
      raw.authors.forEach((a, i) => {
        const s = line(c, a, `${at}.authors[${i}]`, 120);
        if (s) authors.push(s);
      });
  }

  let year: number | null = null;
  if (raw.year !== undefined && raw.year !== null) {
    if (typeof raw.year !== 'number' || !Number.isInteger(raw.year) || raw.year < 1800 || raw.year > 2100) c.add(`${at}.year`, '연도가 맞지 않아요.');
    else year = raw.year;
  }

  const identifiers: Identifiers = {};
  if (raw.identifiers !== undefined && raw.identifiers !== null) {
    if (!isObj(raw.identifiers)) c.add(`${at}.identifiers`, '번호 묶음이 맞지 않아요.');
    else {
      onlyKeys(c, raw.identifiers, ['pmid', 'pmcid', 'doi'], `${at}.identifiers`);
      const ids = raw.identifiers;
      if (ids.pmid !== undefined && ids.pmid !== null) {
        const p = cleanPmid(ids.pmid);
        if (p) identifiers.pmid = p;
        else c.add(`${at}.identifiers.pmid`, 'PMID 모양이 맞지 않아요.');
      }
      if (ids.pmcid !== undefined && ids.pmcid !== null) {
        const p = cleanPmcid(ids.pmcid);
        if (p) identifiers.pmcid = p;
        else c.add(`${at}.identifiers.pmcid`, 'PMCID 모양이 맞지 않아요.');
      }
      if (ids.doi !== undefined && ids.doi !== null) {
        const d = cleanDoi(ids.doi);
        if (d) identifiers.doi = d;
        else c.add(`${at}.identifiers.doi`, 'DOI 모양이 맞지 않아요.');
      }
    }
  }

  const summaryKo = koText(c, raw.summaryKo, `${at}.summaryKo`, 600);
  const summaryBasis = oneOf(c, raw.summaryBasis, SUMMARY_BASIS, `${at}.summaryBasis`, null);
  if (summaryKo && !summaryBasis) c.add(`${at}.summaryBasis`, '요약을 무엇을 보고 썼는지(summaryBasis) 넣어 주세요.');

  const out: SourceInput = {
    url: u.ok ? u.href : '',
    altUrls,
    kind: oneOf(c, raw.kind, SOURCE_KINDS, `${at}.kind`, null),
    title: line(c, raw.title, `${at}.title`, 400),
    authors,
    container: line(c, raw.container, `${at}.container`, 200),
    year,
    identifiers,
    verifiedBy,
    summaryKo,
    summaryBasis: summaryKo ? summaryBasis : null,
  };
  return u.ok ? out : null;
}

/* ───────── 쓰임 ───────── */

const USE_KEYS = ['domain', 'reviewId', 'itemId', 'itemName', 'purpose', 'purposeNote', 'consultedOn', 'notedAt', 'applicationKo', 'limitationsKo', 'reading', 'readingNote'];

/** 쓴 사람 쪽 시각 — 2020년 뒤, 받은 때(now)에서 하루 넘게 앞서지 않게 */
function notedTime(c: Collector, v: unknown, at: string, now: Date): string | null {
  const t = isoTime(c, v, at);
  if (!t) return null;
  if (t < '2020-01-01T00:00:00.000Z') return c.add(at, '시각이 너무 이르다.'), null;
  if (Date.parse(t) > now.getTime() + 24 * 3600 * 1000) return c.add(at, '앞으로 올 시각은 넣을 수 없어요.'), null;
  return t;
}

function parseUse(c: Collector, raw: unknown, at: string, now: Date, historical: boolean): UseInput | null {
  if (!isObj(raw)) return c.add(at, '쓰임 묶음이 필요해요.'), null;
  onlyKeys(c, raw, USE_KEYS, at);
  const domain = oneOf(c, raw.domain, DOMAINS, `${at}.domain`, null);
  if (!domain) c.add(`${at}.domain`, 'exercise 또는 mechanics 를 넣어 주세요.');
  const purpose = oneOf(c, raw.purpose, PURPOSES, `${at}.purpose`, null);
  if (!purpose) c.add(`${at}.purpose`, '어디에 썼는지(purpose)를 넣어 주세요.');
  const reviewId = id(c, raw.reviewId, `${at}.reviewId`, true);
  const out: UseInput = {
    domain: domain ?? 'exercise',
    reviewId: reviewId ?? '',
    itemId: id(c, raw.itemId, `${at}.itemId`, false),
    itemName: line(c, raw.itemName, `${at}.itemName`, 120),
    purpose: purpose ?? 'other',
    purposeNote: line(c, raw.purposeNote, `${at}.purposeNote`, 120),
    consultedOn: date(c, raw.consultedOn, `${at}.consultedOn`, now),
    /* 과거 가져오기는 쓴 사람 쪽 시각을 받지 않는다(모르는 값을 채우지 않음) */
    notedAt: historical ? null : notedTime(c, raw.notedAt, `${at}.notedAt`, now),
    /* 지금 등록은 적용 내용이 꼭 있어야 한다. 과거 기록은 남은 것이 없으면 비워 두고 화면이 '기록 없음'으로 보인다 */
    applicationKo: koText(c, raw.applicationKo, `${at}.applicationKo`, 800, !historical),
    limitationsKo: koText(c, raw.limitationsKo, `${at}.limitationsKo`, 800),
    reading: oneOf(c, raw.reading, READING, `${at}.reading`, 'unknown') ?? 'unknown',
    readingNote: koText(c, raw.readingNote, `${at}.readingNote`, 200),
  };
  return domain && purpose && reviewId ? out : null;
}

/* ───────── 등록 · 가져오기 본문 ───────── */

export function parseRegister(raw: unknown, now = new Date()): Parsed<RegisterPayload> & { requestKey?: string | null } {
  const c = new Collector();
  if (!isObj(raw)) return { ok: false, issues: [{ field: '', message: '본문이 JSON 묶음이어야 해요.' }] };
  onlyKeys(c, raw, ['requestKey', 'source', 'use'], '');
  let requestKey: string | null = null;
  if (raw.requestKey !== undefined && raw.requestKey !== null) {
    if (typeof raw.requestKey !== 'string' || !REQUEST_KEY.test(raw.requestKey)) c.add('requestKey', '요청 번호 모양이 맞지 않아요(8~128자, 영문 · 숫자 · . _ : -).');
    else requestKey = raw.requestKey;
  }
  const source = parseSource(c, raw.source, 'source');
  const use = parseUse(c, raw.use, 'use', now, false);
  if (c.issues.length || !source || !use) return { ok: false, issues: c.issues.length ? c.issues : [{ field: '', message: '본문을 확인해 주세요.' }] };
  return { ok: true, value: { source, use }, requestKey };
}

const SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,63}$/;

export function parseImport(raw: unknown, now = new Date()): Parsed<ImportPayload> & { requestKey?: string | null } {
  const c = new Collector();
  if (!isObj(raw)) return { ok: false, issues: [{ field: '', message: '본문이 JSON 묶음이어야 해요.' }] };
  onlyKeys(c, raw, ['requestKey', 'snapshot', 'chunk', 'records'], '');
  let requestKey: string | null = null;
  if (typeof raw.requestKey === 'string' && REQUEST_KEY.test(raw.requestKey)) requestKey = raw.requestKey;
  else c.add('requestKey', '가져오기는 요청 번호가 꼭 필요해요.');

  let snapshot: ImportPayload['snapshot'] | null = null;
  if (!isObj(raw.snapshot) || typeof raw.snapshot.id !== 'string' || !SNAPSHOT_ID.test(raw.snapshot.id) || !Array.isArray(raw.snapshot.inputs) || raw.snapshot.inputs.length > 20)
    c.add('snapshot', '가져오기 기준(snapshot.id · inputs)이 맞지 않아요.');
  else {
    const inputs: { name: string; sha256: string }[] = [];
    raw.snapshot.inputs.forEach((x, i) => {
      if (!isObj(x) || typeof x.name !== 'string' || !/^[a-z0-9-]{1,40}$/.test(x.name) || typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(x.sha256))
        c.add(`snapshot.inputs[${i}]`, '입력 이름 · sha256 이 맞지 않아요.');
      else inputs.push({ name: x.name, sha256: x.sha256 });
    });
    snapshot = { id: raw.snapshot.id, inputs };
  }

  let chunk: ImportPayload['chunk'] | null = null;
  if (!isObj(raw.chunk) || !Number.isInteger(raw.chunk.index) || !Number.isInteger(raw.chunk.total) || (raw.chunk.total as number) < 1 || (raw.chunk.total as number) > 200 || (raw.chunk.index as number) < 0 || (raw.chunk.index as number) >= (raw.chunk.total as number))
    c.add('chunk', '묶음 번호가 맞지 않아요.');
  else chunk = { index: raw.chunk.index as number, total: raw.chunk.total as number };

  const records: ImportRecord[] = [];
  if (!Array.isArray(raw.records) || raw.records.length < 1 || raw.records.length > MAX_IMPORT_RECORDS) c.add('records', `기록은 1~${MAX_IMPORT_RECORDS}개 목록이어야 해요.`);
  else
    raw.records.forEach((r, i) => {
      const at = `records[${i}]`;
      if (!isObj(r)) return c.add(at, '기록 모양이 맞지 않아요.');
      onlyKeys(c, r, ['source', 'use', 'historical'], at);
      const source = parseSource(c, r.source, `${at}.source`);
      const use = parseUse(c, r.use, `${at}.use`, now, true);
      let historical: HistoricalInput | null = null;
      if (!isObj(r.historical)) c.add(`${at}.historical`, '과거 기록 표시가 필요해요.');
      else {
        onlyKeys(c, r.historical, ['reviewer', 'origins', 'recordedAt'], `${at}.historical`);
        const reviewer = oneOf(c, r.historical.reviewer, HISTORICAL_REVIEWERS, `${at}.historical.reviewer`, null);
        const origins: HistoricalOrigin[] = [];
        if (!Array.isArray(r.historical.origins) || !r.historical.origins.length || r.historical.origins.length > 4) c.add(`${at}.historical.origins`, '가져온 곳 목록이 필요해요.');
        else
          for (const o of r.historical.origins) {
            const v = oneOf(c, o, HISTORICAL_ORIGINS, `${at}.historical.origins`, null);
            if (v && !origins.includes(v)) origins.push(v);
          }
        const recordedAt = isoTime(c, r.historical.recordedAt, `${at}.historical.recordedAt`);
        if (reviewer) historical = { reviewer, origins: origins.sort(), recordedAt };
      }
      if (source && use && historical) records.push({ source, use, historical });
    });

  if (c.issues.length || !snapshot || !chunk) return { ok: false, issues: c.issues.length ? c.issues : [{ field: '', message: '본문을 확인해 주세요.' }] };
  return { ok: true, value: { snapshot, chunk, records }, requestKey };
}

export const USE_ID = /^use_[0-9a-f]{24}$/;

export function parseWithdraw(raw: unknown, now = new Date()): Parsed<WithdrawPayload> & { requestKey?: string | null } {
  const c = new Collector();
  if (!isObj(raw)) return { ok: false, issues: [{ field: '', message: '본문이 JSON 묶음이어야 해요.' }] };
  onlyKeys(c, raw, ['requestKey', 'withdraw'], '');
  let requestKey: string | null = null;
  if (raw.requestKey !== undefined && raw.requestKey !== null) {
    if (typeof raw.requestKey !== 'string' || !REQUEST_KEY.test(raw.requestKey)) c.add('requestKey', '요청 번호 모양이 맞지 않아요(8~128자, 영문 · 숫자 · . _ : -).');
    else requestKey = raw.requestKey;
  }
  const w = raw.withdraw;
  if (!isObj(w)) return { ok: false, issues: [{ field: 'withdraw', message: '거둘 쓰임(withdraw)이 필요해요.' }] };
  onlyKeys(c, w, ['useId', 'reasonKo', 'notedAt'], 'withdraw');
  const useId = typeof w.useId === 'string' && USE_ID.test(w.useId) ? w.useId : null;
  if (!useId) c.add('withdraw.useId', '쓰임 번호(use_…) 모양이 맞지 않아요.');
  const reasonKo = koText(c, w.reasonKo, 'withdraw.reasonKo', 300, true);
  const notedAt = notedTime(c, w.notedAt, 'withdraw.notedAt', now);
  if (c.issues.length || !useId || !reasonKo) return { ok: false, issues: c.issues.length ? c.issues : [{ field: '', message: '본문을 확인해 주세요.' }] };
  return { ok: true, value: { useId, reasonKo, notedAt }, requestKey };
}

/* ───────── 저장된 기록 다시 읽기(모양이 틀리면 뺀다) ───────── */

export function parseActor(v: unknown): Actor | null {
  if (!isObj(v) || typeof v.userId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v.userId) || typeof v.label !== 'string' || v.label.length > 60) return null;
  return { userId: v.userId, label: v.label };
}

/**
 * 저장된 op 를 다시 검사한다. 쓸 때와 같은 규칙으로 본문을 다시 읽고(now 는 받은 시각 — 그때 기준으로 미래 날짜 검사),
 * 다시 정리한 본문이 저장된 본문과 글자 하나까지 같아야 받는다(정리 규칙이 바뀌어 다른 값이 되면 빼고 센다).
 */
export function parseStoredOp(raw: unknown): Op | null {
  if (!isObj(raw) || raw.schema !== SCHEMA_OP) return null;
  if (typeof raw.opId !== 'string' || !/^[0-9a-f]{64}$/.test(raw.opId)) return null;
  if (typeof raw.requestKey !== 'string' || !REQUEST_KEY.test(raw.requestKey)) return null;
  if (typeof raw.payloadHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.payloadHash)) return null;
  if (typeof raw.receivedAt !== 'string' || Number.isNaN(Date.parse(raw.receivedAt))) return null;
  const actor = parseActor(raw.actor);
  if (!actor) return null;
  /* 쓰기 번호는 없어도 된다(옛 기록). 있으면 모양이 꼭 맞아야 한다 — 틀리면 모양이 틀린 기록으로 뺀다 */
  if (raw.writeId !== undefined && (typeof raw.writeId !== 'string' || !WRITE_ID.test(raw.writeId))) return null;
  const at = new Date(raw.receivedAt);
  const base: OpBase = {
    schema: SCHEMA_OP,
    opId: raw.opId,
    requestKey: raw.requestKey,
    payloadHash: raw.payloadHash,
    actor,
    receivedAt: at.toISOString(),
    ...(typeof raw.writeId === 'string' ? { writeId: raw.writeId } : {}),
  };
  if (raw.kind === 'register') {
    const p = parseRegister({ source: (raw.payload as Record<string, unknown> | undefined)?.source, use: (raw.payload as Record<string, unknown> | undefined)?.use }, at);
    if (!p.ok) return null;
    return { ...base, kind: 'register', payload: p.value };
  }
  if (raw.kind === 'withdraw') {
    const p = parseWithdraw({ withdraw: raw.payload }, at);
    if (!p.ok) return null;
    return { ...base, kind: 'withdraw', payload: p.value };
  }
  if (raw.kind === 'import') {
    const pl = raw.payload as Record<string, unknown> | undefined;
    const p = parseImport({ requestKey: raw.requestKey, snapshot: pl?.snapshot, chunk: pl?.chunk, records: pl?.records }, at);
    if (!p.ok) return null;
    return { ...base, kind: 'import', payload: p.value };
  }
  return null;
}

/* ───────── 정해진 순서의 JSON(같은 값 → 같은 글자) ───────── */

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k]))
      .join(',') +
    '}'
  );
}
