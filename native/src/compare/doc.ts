/**
 * 비교 문서(순수 — R19 · R05 · R34). 한 번 연 비교의 A · B · 기준 장면 · 다듬기 · 보기 · 그림 · 장면 표시 · 메모를 한 문서로 남긴다.
 *
 * - 원본 영상은 바꾸지 않는다. 문서는 영상의 **고정 경로**(폰 영상 `{userId}/local-…` · 서버 경로)만 쥔다 — 서명 주소 · 재생기 · 열쇠는 넣지 않는다.
 * - 계정마다 따로(ownerId). 다른 계정의 문서는 열지 않는다.
 * - 다시 열면 늘 멈춘 채(재생 중으로 되살리지 않는다).
 * - 판(schemaVersion)이 이 앱보다 새로운 문서는 고치지 않고 거절한다(덮어쓰지 않게).
 */
import { normalizeAnnotation, type Annotation, type ViewKey, VIEW_LABEL } from '~/compare/annotations';
import { IDENTITY_REG, IDENTITY_VIEW, normalizeReg, normalizeView, type Calibration, type Registration, type ViewTransform } from '~/compare/geometry';
import { normalizeMarks, type EventMarks } from '~/compare/pitch-events';
import { DEFAULT_RATE, isCompareRate, normalizeFacts, type MediaFacts, type Range, type CompareRate } from '~/compare/timing';

export const SCHEMA_VERSION = 1;
export const MAX_SOURCES = 12;
export const MAX_NOTES = 200;
export const MAX_TITLE = 40;
export const MAX_NOTE = 500;

export type SourceOrigin = 'myVideos' | 'log' | 'photos' | 'camera';
export type Hand = 'R' | 'L';

/** 비교에 넣은 영상 하나 — 고정 경로 · 출처 · 알려진 정보(모르면 null) */
export type SourceRef = {
  id: string;
  /** 고정 경로 — 폰 영상 `{userId}/local-…` 또는 서버 경로. 서명 주소 아님 */
  path: string;
  origin: SourceOrigin;
  /** 비교를 위해 앱 안으로 가져온 복사본인가(사진 앱 · 촬영) — 비교를 지울 때 다른 곳이 안 쓰면 같이 지운다 */
  owned: boolean;
  label: string | null;
  /** 찍은 날(YYYY-MM-DD) — 모르면 null */
  date: string | null;
  facts: MediaFacts | null;
  /** 사람이 붙인(또는 기록에서 온) 조건 — 거르기 · 견주기 가늠에 쓴다. 모르면 null */
  hand: Hand | null;
  pitchType: string | null;
  view: ViewKey | null;
  sessionType: string | null;
  /** 같은 날 '잘 됨' · '아쉬움' — 사람이 고른 것만 */
  verdict: 'good' | 'work' | null;
  /** 이 영상의 장면 표시 */
  events: EventMarks;
  /** 같은 평면 길이 보정(R14) */
  calibration: Calibration | null;
  addedAt: string;
};

export type AnchorSemantic = 'footContact' | 'release' | 'manual' | 'start';
export const ANCHOR_LABEL: Record<AnchorSemantic, string> = { footContact: '앞발 착지', release: '릴리스', manual: '직접 선택', start: '시작점 기준' };

export type PairState = {
  a: string;
  b: string;
  semantic: AnchorSemantic;
  anchors: { a: number | null; b: number | null };
  trims: { a: Range | null; b: Range | null };
  loop: Range | null;
  views: { a: ViewTransform; b: ViewTransform; linked: boolean };
  overlay: { on: boolean; opacity: number; wipe: number | null; reg: Registration };
  mode: 'offset' | 'normalized';
  /** 마지막으로 본 상대 자리(초) — 다시 열면 여기서 멈춘 채 */
  rel: number;
};

export type NoteRef = { id: string; sourceId: string | null; t: number | null; text: string; createdAt: string };

/** 3D 분석 · 구속 · 투구 기록 잇기(R33) — 다른 화면의 결과를 가리키기만(값을 지어내거나 바꾸지 않는다) */
export type EvidenceRef = {
  id: string;
  sourceId: string;
  kind: 'pitchLog' | 'velocity' | 'lab3d';
  refId: string;
  label: string;
  /** 붙일 때 읽은 값(출처 화면의 값 그대로) — 화면은 출처 · 시각 · 판을 함께 보인다 */
  value: string | null;
  definition: string | null;
  linkedAt: string;
};

export type ReviewSet = { referenceId: string; candidateIds: string[]; index: number };

export type ComparisonDocument = {
  schemaVersion: number;
  id: string;
  ownerId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  sources: SourceRef[];
  /** 지금 보는 짝 — 하나면 한 영상 보기 */
  active: { a: string; b: string | null };
  pairs: PairState[];
  annotations: Annotation[];
  notes: NoteRef[];
  reviewSet: ReviewSet | null;
  transport: { rate: CompareRate; audio: 'none' | 'a' | 'b'; layout: 'auto' | 'stack' | 'side' };
  evidence: EvidenceRef[];
  /** 클라우드 백업은 아직 없다(R21) — 늘 local. 서버에 맞춘 것처럼 보이지 않게 */
  sync: { state: 'local' };
};

/* ---- 만들기 ---- */

let seq = 0;
/** 겹치지 않는 번호(시험은 makeId 를 바꿔 끼운다) */
export function makeId(prefix: string, now = Date.now()): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}${now.toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export type NewSource = Omit<SourceRef, 'id' | 'addedAt' | 'events' | 'calibration' | 'facts' | 'hand' | 'pitchType' | 'view' | 'sessionType' | 'verdict'> &
  Partial<Pick<SourceRef, 'facts' | 'hand' | 'pitchType' | 'view' | 'sessionType' | 'verdict'>>;

export function newSource(s: NewSource, nowIso: string, id = makeId('s')): SourceRef {
  return {
    id,
    path: s.path,
    origin: s.origin,
    owned: s.owned,
    label: s.label,
    date: s.date,
    facts: s.facts ?? null,
    hand: s.hand ?? null,
    pitchType: s.pitchType ?? null,
    view: s.view ?? null,
    sessionType: s.sessionType ?? null,
    verdict: s.verdict ?? null,
    events: {},
    calibration: null,
    addedAt: nowIso,
  };
}

export function newPair(a: string, b: string): PairState {
  return {
    a,
    b,
    semantic: 'footContact',
    anchors: { a: null, b: null },
    trims: { a: null, b: null },
    loop: null,
    views: { a: { ...IDENTITY_VIEW }, b: { ...IDENTITY_VIEW }, linked: false },
    overlay: { on: false, opacity: 0.5, wipe: null, reg: { ...IDENTITY_REG } },
    mode: 'offset',
    rel: 0,
  };
}

export function defaultTitle(sources: readonly SourceRef[]): string {
  const d = sources.map((s) => s.date).filter((x): x is string => !!x);
  if (d.length >= 2) return `${shortDate(d[0])} vs ${shortDate(d[1])}`;
  if (d.length === 1) return `${shortDate(d[0])} 투구`;
  return '투구 영상 분석';
}
const shortDate = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;

export function createDocument(ownerId: string, sources: NewSource[], nowIso: string, ids?: { doc?: string; sources?: string[] }): ComparisonDocument {
  const refs = sources.slice(0, MAX_SOURCES).map((s, i) => newSource(s, nowIso, ids?.sources?.[i]));
  const a = refs[0]?.id ?? '';
  const b = refs[1]?.id ?? null;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ids?.doc ?? makeId('c'),
    ownerId,
    revision: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    title: defaultTitle(refs),
    sources: refs,
    active: { a, b },
    pairs: b ? [newPair(a, b)] : [],
    annotations: [],
    notes: [],
    reviewSet: null,
    transport: { rate: DEFAULT_RATE, audio: 'none', layout: 'auto' },
    evidence: [],
    sync: { state: 'local' },
  };
}

/* ---- 고치기(모두 새 객체 — 화면 상태 · 자동 저장이 바뀐 것을 안다) ---- */

export const sourceOf = (d: ComparisonDocument, id: string | null) => (id ? (d.sources.find((s) => s.id === id) ?? null) : null);
export const pairOf = (d: ComparisonDocument, a: string, b: string | null) => (b ? (d.pairs.find((p) => p.a === a && p.b === b) ?? null) : null);
export const activePair = (d: ComparisonDocument) => pairOf(d, d.active.a, d.active.b);

export function touch(d: ComparisonDocument, nowIso: string): ComparisonDocument {
  return { ...d, updatedAt: nowIso };
}

/** 영상 더하기 — 같은 경로를 다시 넣으면 새 칸(같은 영상을 두 보기로 견줄 수 있게, R05) */
export function addSource(d: ComparisonDocument, s: NewSource, nowIso: string, id?: string): { doc: ComparisonDocument; id: string } | null {
  if (d.sources.length >= MAX_SOURCES) return null;
  const ref = newSource(s, nowIso, id);
  return { doc: { ...d, sources: [...d.sources, ref] }, id: ref.id };
}

/** 지금 짝 정하기 — 짝 상태가 없으면 새로(이미 있으면 그 기준 · 그림을 그대로) */
export function setActive(d: ComparisonDocument, a: string, b: string | null): ComparisonDocument {
  if (!sourceOf(d, a) || (b && !sourceOf(d, b)) || a === b) return d;
  const pairs = b && !pairOf(d, a, b) ? [...d.pairs, newPair(a, b)] : d.pairs;
  return { ...d, active: { a, b }, pairs };
}

/** A · B 바꾸기 — 기준 · 다듬기 · 보기를 같이 뒤집어(상대 자리는 음수로) 같은 비교를 거울로 */
export function swapActive(d: ComparisonDocument): ComparisonDocument {
  const { a, b } = d.active;
  if (!b) return d;
  const p = pairOf(d, a, b);
  const existing = pairOf(d, b, a);
  const flipped: PairState | null = p
    ? {
        ...p,
        a: b,
        b: a,
        anchors: { a: p.anchors.b, b: p.anchors.a },
        trims: { a: p.trims.b, b: p.trims.a },
        views: { a: p.views.b, b: p.views.a, linked: p.views.linked },
        rel: p.rel,
      }
    : null;
  const pairs = existing || !flipped ? d.pairs : [...d.pairs, flipped];
  return { ...d, active: { a: b, b: a }, pairs };
}

export function updatePair(d: ComparisonDocument, patch: Partial<Omit<PairState, 'a' | 'b'>>): ComparisonDocument {
  const { a, b } = d.active;
  if (!b) return d;
  return { ...d, pairs: d.pairs.map((p) => (p.a === a && p.b === b ? { ...p, ...patch } : p)) };
}

export function updateSource(d: ComparisonDocument, id: string, patch: Partial<Omit<SourceRef, 'id' | 'path' | 'owned' | 'origin' | 'addedAt'>>): ComparisonDocument {
  return { ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function rename(d: ComparisonDocument, title: string): ComparisonDocument {
  const t = title.trim().slice(0, MAX_TITLE);
  return t ? { ...d, title: t } : d;
}

/** 다른 영상으로 다시 잇기(원본을 잃었을 때 — R19). 기준 · 그림은 그 칸에 그대로 */
export function relinkSource(d: ComparisonDocument, id: string, path: string, owned: boolean): ComparisonDocument {
  return { ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, path, owned, facts: null } : s)) };
}

/** 영상 빼기 — 그 영상을 쓰는 짝 · 그림 · 메모 · 잇기도 같이. 지금 짝이면 남은 것으로 */
export function removeSource(d: ComparisonDocument, id: string): ComparisonDocument {
  const sources = d.sources.filter((s) => s.id !== id);
  const pairs = d.pairs.filter((p) => p.a !== id && p.b !== id);
  let active = d.active;
  if (active.a === id) active = { a: active.b ?? sources[0]?.id ?? '', b: null };
  else if (active.b === id) active = { a: active.a, b: null };
  const reviewSet = d.reviewSet
    ? d.reviewSet.referenceId === id
      ? null
      : { ...d.reviewSet, candidateIds: d.reviewSet.candidateIds.filter((c) => c !== id), index: 0 }
    : null;
  return {
    ...d,
    sources,
    pairs,
    active,
    annotations: d.annotations.filter((x) => x.sourceId !== id),
    notes: d.notes.filter((n) => n.sourceId !== id),
    evidence: d.evidence.filter((e) => e.sourceId !== id),
    reviewSet,
  };
}

export function duplicate(d: ComparisonDocument, nowIso: string, id = makeId('c')): ComparisonDocument {
  /* 복사본의 영상은 원본 문서가 가진 앱 안 복사본을 '같이 쓴다' — owned 를 꺼서 복사본을 지울 때 영상이 지워지지 않게 */
  return {
    ...structuredCloneSafe(d),
    id,
    revision: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    title: `${d.title} 사본`.slice(0, MAX_TITLE),
    sources: d.sources.map((s) => ({ ...s, owned: false })),
  };
}
const structuredCloneSafe = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function addNote(d: ComparisonDocument, n: Omit<NoteRef, 'id' | 'createdAt'>, nowIso: string, id = makeId('n')): ComparisonDocument {
  const text = n.text.trim().slice(0, MAX_NOTE);
  if (!text || d.notes.length >= MAX_NOTES) return d;
  return { ...d, notes: [...d.notes, { ...n, text, id, createdAt: nowIso }] };
}
export const editNote = (d: ComparisonDocument, id: string, text: string): ComparisonDocument => {
  const t = text.trim().slice(0, MAX_NOTE);
  return t ? { ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, text: t } : n)) } : d;
};
export const removeNote = (d: ComparisonDocument, id: string): ComparisonDocument => ({ ...d, notes: d.notes.filter((n) => n.id !== id) });

/* ---- 여러 투구 검토(R34) — 기준 A 를 두고 B 를 차례로 ---- */

export function startReview(d: ComparisonDocument, referenceId: string, candidateIds: string[]): ComparisonDocument {
  const cands = [...new Set(candidateIds)].filter((c) => c !== referenceId && sourceOf(d, c));
  if (!sourceOf(d, referenceId) || !cands.length) return d;
  return setActive({ ...d, reviewSet: { referenceId, candidateIds: cands, index: 0 } }, referenceId, cands[0]);
}
/** 다음 · 이전 후보 — 짝마다 기준 · 그림은 짝 상태에 남는다 */
export function moveReview(d: ComparisonDocument, dir: 1 | -1): ComparisonDocument {
  const r = d.reviewSet;
  if (!r || !r.candidateIds.length) return d;
  const index = (r.index + dir + r.candidateIds.length) % r.candidateIds.length;
  return setActive({ ...d, reviewSet: { ...r, index } }, r.referenceId, r.candidateIds[index]);
}

/* ---- 저장 값 → 문서(검사 · 옮김) ---- */

export type ParseResult = { ok: true; doc: ComparisonDocument } | { ok: false; reason: 'corrupt' | 'owner' | 'newer' };

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);
const iso = (v: unknown, d: string) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : d);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function range(v: unknown): Range | null {
  if (!v || typeof v !== 'object') return null;
  const s = num((v as Range).start);
  const e = num((v as Range).end);
  return s != null && e != null && e > s && s >= 0 ? { start: s, end: e } : null;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORIGINS = new Set<SourceOrigin>(['myVideos', 'log', 'photos', 'camera']);
const SEMANTICS = new Set<AnchorSemantic>(['footContact', 'release', 'manual', 'start']);

function parseSource(raw: unknown, epoch: string): SourceRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const id = str(s.id, 64);
  const path = str(s.path, 400);
  if (!id || !path || /^https?:/i.test(path)) return null; /* 서명 주소는 저장하지 않는다 — 들어 있으면 깨진 줄로 버린다 */
  const facts = s.facts ? normalizeFacts(s.facts as Partial<Record<keyof MediaFacts, unknown>>) : null;
  const cal = s.calibration as Calibration | null | undefined;
  return {
    id,
    path,
    origin: ORIGINS.has(s.origin as SourceOrigin) ? (s.origin as SourceOrigin) : 'myVideos',
    owned: s.owned === true,
    label: str(s.label, 80),
    date: typeof s.date === 'string' && DATE_RE.test(s.date) ? s.date : null,
    facts,
    hand: s.hand === 'R' || s.hand === 'L' ? s.hand : null,
    pitchType: str(s.pitchType, 30),
    view: typeof s.view === 'string' && s.view in VIEW_LABEL ? (s.view as ViewKey) : null,
    sessionType: str(s.sessionType, 30),
    verdict: s.verdict === 'good' || s.verdict === 'work' ? s.verdict : null,
    events: normalizeMarks(s.events, facts?.durationSec ?? null),
    calibration:
      cal && typeof cal === 'object' && num(cal.cm) && cal.a && cal.b && num(cal.a.u) != null && num(cal.a.v) != null && num(cal.b.u) != null && num(cal.b.v) != null
        ? { a: { u: cal.a.u, v: cal.a.v }, b: { u: cal.b.u, v: cal.b.v }, cm: cal.cm }
        : null,
    addedAt: iso(s.addedAt, epoch),
  };
}

function parsePair(raw: unknown, ids: ReadonlySet<string>): PairState | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.a !== 'string' || typeof p.b !== 'string' || !ids.has(p.a) || !ids.has(p.b) || p.a === p.b) return null;
  const an = (p.anchors ?? {}) as Record<string, unknown>;
  const tr = (p.trims ?? {}) as Record<string, unknown>;
  const vw = (p.views ?? {}) as Record<string, unknown>;
  const ov = (p.overlay ?? {}) as Record<string, unknown>;
  const anchor = (v: unknown) => {
    const n = num(v);
    return n != null && n >= 0 ? n : null;
  };
  const opacity = num(ov.opacity);
  const wipe = num(ov.wipe);
  return {
    a: p.a,
    b: p.b,
    semantic: SEMANTICS.has(p.semantic as AnchorSemantic) ? (p.semantic as AnchorSemantic) : 'manual',
    anchors: { a: anchor(an.a), b: anchor(an.b) },
    trims: { a: range(tr.a), b: range(tr.b) },
    loop: range(p.loop),
    views: { a: normalizeView(vw.a), b: normalizeView(vw.b), linked: vw.linked === true },
    overlay: {
      on: ov.on === true,
      opacity: opacity != null ? Math.min(0.9, Math.max(0.1, opacity)) : 0.5,
      wipe: wipe != null ? Math.min(1, Math.max(0, wipe)) : null,
      reg: normalizeReg(ov.reg),
    },
    mode: p.mode === 'normalized' ? 'normalized' : 'offset',
    rel: num(p.rel) ?? 0,
  };
}

export function parseDocument(raw: unknown, ownerId: string): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt' };
  const d = raw as Record<string, unknown>;
  const v = num(d.schemaVersion);
  if (v == null || v < 1) return { ok: false, reason: 'corrupt' };
  if (v > SCHEMA_VERSION) return { ok: false, reason: 'newer' };
  if (d.ownerId !== ownerId) return { ok: false, reason: 'owner' };
  const id = str(d.id, 64);
  if (!id) return { ok: false, reason: 'corrupt' };
  const epoch = new Date(0).toISOString();
  const created = iso(d.createdAt, epoch);
  const sources = (Array.isArray(d.sources) ? d.sources : [])
    .map((s) => parseSource(s, created))
    .filter((s): s is SourceRef => !!s)
    .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
    .slice(0, MAX_SOURCES);
  if (!sources.length) return { ok: false, reason: 'corrupt' };
  const ids = new Set(sources.map((s) => s.id));
  const pairs = (Array.isArray(d.pairs) ? d.pairs : []).map((p) => parsePair(p, ids)).filter((p): p is PairState => !!p);
  const act = (d.active ?? {}) as Record<string, unknown>;
  const a = typeof act.a === 'string' && ids.has(act.a) ? act.a : sources[0].id;
  const b = typeof act.b === 'string' && ids.has(act.b) && act.b !== a ? act.b : null;
  const annotations = (Array.isArray(d.annotations) ? d.annotations : []).map((x) => normalizeAnnotation(x, ids)).filter((x): x is Annotation => !!x);
  const notes = (Array.isArray(d.notes) ? d.notes : [])
    .map((n): NoteRef | null => {
      const r = n as Record<string, unknown>;
      const text = str(r?.text, MAX_NOTE);
      const nid = str(r?.id, 64);
      if (!text || !nid) return null;
      const sid = typeof r.sourceId === 'string' && ids.has(r.sourceId) ? r.sourceId : null;
      const t = num(r.t);
      return { id: nid, sourceId: sid, t: t != null && t >= 0 ? t : null, text, createdAt: iso(r.createdAt, created) };
    })
    .filter((n): n is NoteRef => !!n)
    .slice(0, MAX_NOTES);
  const tr = (d.transport ?? {}) as Record<string, unknown>;
  const rs = d.reviewSet as Record<string, unknown> | null | undefined;
  const reviewSet: ReviewSet | null =
    rs && typeof rs.referenceId === 'string' && ids.has(rs.referenceId) && Array.isArray(rs.candidateIds)
      ? (() => {
          const cands = (rs.candidateIds as unknown[]).filter((c): c is string => typeof c === 'string' && ids.has(c) && c !== rs.referenceId);
          const i = num(rs.index) ?? 0;
          return cands.length ? { referenceId: rs.referenceId as string, candidateIds: cands, index: Math.min(cands.length - 1, Math.max(0, Math.floor(i))) } : null;
        })()
      : null;
  const evidence = (Array.isArray(d.evidence) ? d.evidence : [])
    .map((e): EvidenceRef | null => {
      const r = e as Record<string, unknown>;
      const eid = str(r?.id, 64);
      const refId = str(r?.refId, 100);
      if (!eid || !refId || typeof r.sourceId !== 'string' || !ids.has(r.sourceId)) return null;
      if (r.kind !== 'pitchLog' && r.kind !== 'velocity' && r.kind !== 'lab3d') return null;
      return { id: eid, sourceId: r.sourceId, kind: r.kind, refId, label: str(r.label, 80) ?? '', value: str(r.value, 80), definition: str(r.definition, 80), linkedAt: iso(r.linkedAt, created) };
    })
    .filter((e): e is EvidenceRef => !!e);
  const doc: ComparisonDocument = {
    schemaVersion: SCHEMA_VERSION,
    id,
    ownerId,
    revision: Math.max(0, Math.floor(num(d.revision) ?? 0)),
    createdAt: created,
    updatedAt: iso(d.updatedAt, created),
    title: str(d.title, MAX_TITLE) ?? defaultTitle(sources),
    sources,
    active: { a, b },
    pairs: b && !pairs.some((p) => p.a === a && p.b === b) ? [...pairs, newPair(a, b)] : pairs,
    annotations,
    notes,
    reviewSet,
    transport: {
      rate: isCompareRate(tr.rate) ? tr.rate : DEFAULT_RATE,
      audio: tr.audio === 'a' || tr.audio === 'b' ? tr.audio : 'none',
      layout: tr.layout === 'stack' || tr.layout === 'side' ? tr.layout : 'auto',
    },
    evidence,
    sync: { state: 'local' },
  };
  return { ok: true, doc };
}

/* ---- 최근 비교 목록(문서 전체를 읽지 않고) ---- */

export type RecentEntry = {
  id: string;
  title: string;
  updatedAt: string;
  sourceCount: number;
  /** 지금 짝의 날짜 · 이름 */
  labels: string[];
  /** 두 기준 장면을 다 짚었나 — '맞춤 끝' 표시 */
  aligned: boolean;
  /** 썸네일을 그릴 경로(첫 영상) */
  thumbPath: string | null;
};

export function recentOf(d: ComparisonDocument): RecentEntry {
  const a = sourceOf(d, d.active.a);
  const b = sourceOf(d, d.active.b);
  const p = activePair(d);
  return {
    id: d.id,
    title: d.title,
    updatedAt: d.updatedAt,
    sourceCount: d.sources.length,
    labels: [a, b].filter((s): s is SourceRef => !!s).map((s) => s.label ?? (s.date ? shortDate(s.date) : '영상')),
    aligned: !!p && p.semantic !== 'start' && p.anchors.a != null && p.anchors.b != null,
    thumbPath: a?.path ?? null,
  };
}

/** 다른 문서가 이 경로를 앱 안 복사본으로 쓰나 — 지울 때 확인(R19 · R22) */
export function ownedPathsOf(d: ComparisonDocument): string[] {
  return d.sources.filter((s) => s.owned).map((s) => s.path);
}
export function referencedPaths(docs: readonly Pick<ComparisonDocument, 'sources'>[]): Set<string> {
  return new Set(docs.flatMap((d) => d.sources.map((s) => s.path)));
}
