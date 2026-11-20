/**
 * EX-REF04 — 과거 검수 기록에서 근거자료 쓰임을 뽑아 가져오기 묶음을 만드는 명령 도구(데이터 추출 · 대조만, 한국어 글은 다른 단계).
 *
 *   node --import ./scripts/alias-register.mjs scripts/review-evidence-import.mts fetch-ncbi --snapshot <dir> --out <file>
 *   node --import ./scripts/alias-register.mjs scripts/review-evidence-import.mts build --snapshot <dir> [--ncbi <file>] --out <dir>
 *   node --import ./scripts/alias-register.mjs scripts/review-evidence-import.mts ko-stub --skeleton <file> --out <file>
 *   node --import ./scripts/alias-register.mjs scripts/review-evidence-import.mts manifest --skeleton <file> --ko <file> --out <file>
 *   node --import ./scripts/alias-register.mjs scripts/review-evidence-import.mts delta --base <skeleton.json> --current <skeleton.json> --out <file>
 *
 * 원칙
 * - 입력(얼린 스냅샷)은 읽기만 한다. 저장소 · DB · 서버에 쓰지 않는다. 내보내는 곳은 --out 하나.
 * - 네트워크는 fetch-ncbi 만, NCBI 공식 서지 API 두 곳(esummary · idconv)만, 초당 3번 아래 · 15초 제한 · 넘겨주기(redirect) 안 따라감.
 * - 모르는 값은 비워 둔다: 확인일은 기록에 적힌 날짜(시드 accessedAt · 메커니즘 checked_on/consulted_on)만, 기록 시각은 감싼 블록의 시각만.
 *   가져오는 시각으로 채우지 않는다. 읽은 범위는 늘 unknown(다른 단계가 정한다).
 * - 같은 자료로 묶기: 정규화한 링크 · 링크 모양에서 바로 나오는 번호 · NCBI 공식 서지로 확인한 번호 짝만. 제목이 닮았다는 이유로 묶지 않는다.
 * - 인용은 지지가 아니다 — 여기서는 '그 검수에서 이 링크를 적었다'만 옮긴다.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkEvidenceUrl, cleanDoi, cleanPmcid, cleanPmid, identifiersFromUrl, type Identifiers } from '@/lib/review-evidence/url';
import {
  MAX_IMPORT_RECORDS,
  PURPOSES,
  READING,
  REQUEST_KEY,
  SOURCE_KINDS,
  SUMMARY_BASIS,
  canonicalJson,
  parseImport,
  type Domain,
  type HistoricalOrigin,
  type ImportRecord,
  type Issue,
  type Purpose,
  type Reading,
  type SourceKind,
  type SummaryBasis,
} from '@/lib/review-evidence/model';

/* ───────── 공용 도우미 ───────── */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const sha256Hex = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const readJson = (file: string): Json => JSON.parse(readFileSync(file, 'utf8')) as Json;
const writeJson = (file: string, v: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(v, null, 2) + '\n', 'utf8');
};
const HANGUL = /[가-힣]/;
const langOf = (s: string): 'ko' | 'en' => (HANGUL.test(s) ? 'ko' : 'en');
const codePoints = (s: string) => [...s];
const clip = (s: string, max: number) => {
  const cp = codePoints(s);
  return cp.length <= max ? s : cp.slice(0, max - 1).join('') + '…';
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function args(argv: string[]): { cmd: string; opts: Record<string, string> } {
  const [cmd = '', ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`모르는 인자: ${a}`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} 값이 없어요.`);
    opts[a.slice(2)] = v;
    i++;
  }
  return { cmd, opts };
}

function need(opts: Record<string, string>, k: string): string {
  const v = opts[k];
  if (!v) throw new Error(`--${k} 가 필요해요.`);
  return v;
}

/** 시각 → 한국 날짜(YYYY-MM-DD). 소수점 아래 6자리도 받는다 */
function kstDate(iso: string): string | null {
  const t = parseTime(iso);
  if (t === null) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/** 시간대가 있는 ISO 시각만 받는다(시간대 없는 글은 어느 시각인지 모르므로 쓰지 않는다) */
function parseTime(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(s.trim());
  if (!m) return null;
  const frac = m[2] ? m[2].slice(0, 4) : '';
  const t = Date.parse(m[1] + frac + m[3]);
  return Number.isNaN(t) ? null : t;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function explicitDate(v: unknown): string | null {
  if (typeof v !== 'string' || !DATE_ONLY.test(v.trim())) return null;
  const s = v.trim();
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/* ───────── 스냅샷 ───────── */

const INPUT_FILES = {
  seed: 'seed-catalog.json',
  exercise: 'exercise-records.json',
  mechanics: 'mechanics-records.json',
  mechanicsCheckpoint: 'mechanics-checkpoint.json',
  exerciseCheckpoint: 'exercise-checkpoint.json',
  prepared: 'prepared-metadata.json',
  pmcIdentities: 'pmc-identities.json',
} as const;

type Snapshot = {
  dir: string;
  id: string;
  /** model.ts 의 입력 이름 규칙(소문자 · 숫자 · -)에 맞춰 '.json' 을 뺀 이름 */
  inputs: { name: string; sha256: string }[];
  capturedAt: string | null;
  seed: Obj;
  exercise: Json[];
  mechanics: Obj;
  mechanicsCheckpoint: Obj;
  exerciseCheckpoint: Obj;
  prepared: Obj;
  pmcIdentities: Obj;
};

function loadSnapshot(dir: string): Snapshot {
  const sumsBytes = readFileSync(path.join(dir, 'SHA256SUMS'));
  /* 원본 묶음 폴더 이름(snapshot-N)에서 sN — 이름만으로 어느 묶음인지 보이게. 뒤 12자는 SHA256SUMS 지문 */
  const tag = /snapshot-(\d{1,3})$/.exec(path.basename(path.resolve(dir)))?.[1];
  const id = `exref04-${tag ? 's' + tag : 'sx'}-` + sha256Hex(sumsBytes).slice(0, 12);
  const inputs: { name: string; sha256: string }[] = [];
  for (const raw of sumsBytes.toString('utf8').split('\n')) {
    const lineText = raw.trim();
    if (!lineText) continue;
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(lineText);
    if (!m) throw new Error(`SHA256SUMS 줄 모양이 맞지 않아요: ${lineText}`);
    const file = m[2].trim();
    const actual = sha256Hex(readFileSync(path.join(dir, file)));
    if (actual !== m[1]) throw new Error(`${file} 의 sha256 이 SHA256SUMS 와 달라요(스냅샷이 바뀌었어요).`);
    inputs.push({ name: file.replace(/\.json$/, ''), sha256: m[1] });
  }
  inputs.sort((a, b) => cmp(a.name, b.name));
  const j = (f: string) => readJson(path.join(dir, f));
  const asObj = (v: Json, f: string): Obj => {
    if (!isObj(v)) throw new Error(`${f} 는 JSON 묶음이어야 해요.`);
    return v;
  };
  const ex = j(INPUT_FILES.exercise);
  if (!Array.isArray(ex)) throw new Error(`${INPUT_FILES.exercise} 는 목록이어야 해요.`);
  let capturedAt: string | null = null;
  try {
    capturedAt = readFileSync(path.join(dir, 'CAPTURED_AT'), 'utf8').trim() || null;
  } catch {
    capturedAt = null;
  }
  return {
    dir,
    id,
    inputs,
    capturedAt,
    seed: asObj(j(INPUT_FILES.seed), INPUT_FILES.seed),
    exercise: ex,
    mechanics: asObj(j(INPUT_FILES.mechanics), INPUT_FILES.mechanics),
    mechanicsCheckpoint: asObj(j(INPUT_FILES.mechanicsCheckpoint), INPUT_FILES.mechanicsCheckpoint),
    exerciseCheckpoint: asObj(j(INPUT_FILES.exerciseCheckpoint), INPUT_FILES.exerciseCheckpoint),
    prepared: asObj(j(INPUT_FILES.prepared), INPUT_FILES.prepared),
    pmcIdentities: asObj(j(INPUT_FILES.pmcIdentities), INPUT_FILES.pmcIdentities),
  };
}

/* ───────── 인용 추출 ───────── */

type Ctx = { key: string; lang: 'ko' | 'en'; text: string };

type Occ = {
  domain: Domain;
  origin: HistoricalOrigin;
  reviewId: string;
  itemId: string | null;
  itemName: string | null;
  raw: string;
  /** 내부 경로(제품 글에 쓰지 않음) */
  where: string;
  /** 시드 필드 맞추기용 — 번호를 뺀 열쇠 경로(끝의 url 제외) */
  keyPath: string;
  contexts: Ctx[];
  consultedOn: string | null;
  recordedAt: string | null;
  purposeHint: Purpose;
  seedRef: string | null;
  /** 이관 문서가 '재확인 뒤 등록'이라 한 쓰임 */
  holdReason: string | null;
};

/** 가까운 블록에서 옮겨 올 글 칸(제품 설명 before/after 는 옮기지 않는다) */
const CONTEXT_KEYS = [
  'note',
  'summary',
  'finding',
  'applied',
  'assessment',
  'scope',
  'use_and_limit',
  'limit',
  'limits',
  'limitation',
  'limitations',
  'evidence_limit',
  'evidence_limits',
  'research_limit',
  'scientific_limit',
  'applicability',
  'population',
  'population_condition',
  'type',
  'year',
  'coverage',
  'user_request',
  'request',
  'user_instruction',
];
const TIME_KEYS = ['at_utc', 'at'];
const DATE_KEYS = ['checked_on', 'consulted_on'];
const URL_START = /^\s*https?:\/\//i;

function contextsOf(o: Obj): Ctx[] {
  const out: Ctx[] = [];
  const push = (key: string, v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
    if (typeof v !== 'string') return;
    const t = v.normalize('NFC').trim();
    if (!t || URL_START.test(t)) return;
    out.push({ key, lang: langOf(t), text: clip(t, 1200) });
  };
  for (const k of CONTEXT_KEYS) {
    const v = o[k];
    if (Array.isArray(v)) v.forEach((x) => push(k, x));
    else push(k, v);
  }
  return out;
}

function nearestText(stack: Obj[]): Ctx[] {
  for (let i = stack.length - 1; i >= 0; i--) {
    /* 기록 바탕(맨 위)은 가장 가까운 블록일 때만 — 기록 전체 안내문을 모든 출처에 붙이지 않는다 */
    if (i === 0 && stack.length > 1) break;
    const c = contextsOf(stack[i]);
    if (c.length) return c;
  }
  return [];
}

function nearestTime(stack: Obj[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--)
    for (const k of TIME_KEYS) {
      const t = parseTime(stack[i][k]);
      if (t !== null) return new Date(t).toISOString();
    }
  return null;
}

function nearestDate(stack: Obj[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--)
    for (const k of DATE_KEYS) {
      const d = explicitDate(stack[i][k]);
      if (d) return d;
    }
  return null;
}

type Found = { path: (string | number)[]; value: string; stack: Obj[] };

/** 글자 값이 링크인 자리를 모두 찾는다(글 속에 묻힌 링크도 따로 센다) */
function walkUrls(v: Json, at: (string | number)[], stack: Obj[], out: Found[], embedded: Found[], skip: (o: Obj, key: string) => boolean) {
  if (isObj(v)) {
    const next = [...stack, v];
    for (const [k, x] of Object.entries(v)) {
      if (skip(v, k)) continue;
      walkUrls(x, [...at, k], next, out, embedded, skip);
    }
  } else if (Array.isArray(v)) v.forEach((x, i) => walkUrls(x, [...at, i], stack, out, embedded, skip));
  else if (typeof v === 'string') {
    if (/^\s*https?:\/\/\S+\s*$/i.test(v)) out.push({ path: at, value: v.trim(), stack });
    else if (/https?:\/\//i.test(v)) embedded.push({ path: at, value: v, stack });
  }
}

const pathText = (p: (string | number)[]) => p.map((x) => (typeof x === 'number' ? `[${x}]` : `.${x}`)).join('');
function keyPathOf(p: (string | number)[]): string {
  const keys = p.filter((x): x is string => typeof x === 'string');
  if (keys[keys.length - 1] === 'url') keys.pop();
  return keys.join('.');
}

function purposeOf(domain: Domain, p: (string | number)[]): Purpose {
  const keys = p.filter((x): x is string => typeof x === 'string');
  if (keys.some((k) => k === 'evidence' || k === 'research_recheck' || k === 'research_recheck_elevated' || k === 'latest_assistant_inspection')) return 'evidence-check';
  if (keys.some((k) => k === 'later_user_edits' || k === 'user_change_requests' || k === 'user_decisions')) return 'user-request';
  if (domain === 'mechanics') return 'mechanism';
  return 'description';
}

function seedFieldPurpose(field: string): Purpose {
  return purposeOf('exercise', field.replace(/^\./, '').split('.'));
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

type ExerciseItem = { itemId: string | null; itemName: string | null; note?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 기록 안 어디든 있는 library_database_id 글자 값(그 기록 하나 범위) */
function libraryIdsIn(v: Json, out: string[]) {
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'library_database_id' && typeof x === 'string' && x.trim()) out.push(x.trim());
      else libraryIdsIn(x, out);
    }
  } else if (Array.isArray(v)) v.forEach((x) => libraryIdsIn(x, out));
}

function exerciseItemOf(r: Obj): ExerciseItem {
  const media = isObj(r.media) ? r.media : {};
  const itemName = str(r.current_title) ?? str(r.title_at_review) ?? str(r.title);
  const direct = str(media.library_database_id) ?? str(r.library_database_id);
  if (direct) return { itemId: direct, itemName };
  /* media · 맨 위에 없으면 같은 기록 안 다른 자리(예: readability_revisions[*])의 번호 — 모두 같은 UUID 일 때만 쓴다 */
  const found: string[] = [];
  libraryIdsIn(r, found);
  const distinct = uniq(found);
  if (!distinct.length) return { itemId: null, itemName };
  if (distinct.length === 1 && UUID.test(distinct[0])) return { itemId: distinct[0].toLowerCase(), itemName };
  return { itemId: null, itemName, note: `기록 안 library_database_id 값이 하나로 정해지지 않아 항목 번호를 비움: ${distinct.join(', ')}` };
}

type Extracted = {
  occs: Occ[];
  embedded: { where: string; domain: Domain; reviewId: string }[];
  exerciseRecords: number;
  mechanicsRecords: number;
  seedEntries: number;
  seedRawUses: number;
  seedWithAccessedAt: number;
  seedNoteUrlSubstitutions: { ref: string; seedUrl: string; citedUrl: string }[];
  excludedProvenance: number;
  catalogUrlSkipped: number;
  handoffUses: number;
  unattributed: { url: string; where: string; reason: string; domain: Domain; reviewId: string | null; reviewScoped: boolean }[];
  exercisePathCounts: Record<string, number>;
  mechanicsPathCounts: Record<string, number>;
  notes: string[];
};

function extract(s: Snapshot): Extracted {
  const occs: Occ[] = [];
  const embedded: Extracted['embedded'] = [];
  const notes: string[] = [];
  const exercisePathCounts: Record<string, number> = {};
  const mechanicsPathCounts: Record<string, number> = {};

  /* 운동 검수 기록 */
  const exItems = new Map<string, ExerciseItem>();
  for (const [i, r] of s.exercise.entries()) {
    if (!isObj(r)) {
      notes.push(`운동 기록 ${i} 번째가 묶음이 아니라 건너뜀`);
      continue;
    }
    const reviewId = str(r.review_id);
    if (!reviewId) {
      notes.push(`운동 기록 ${i} 번째에 review_id 가 없어 건너뜀`);
      continue;
    }
    const item = exerciseItemOf(r);
    if (item.note) notes.push(`운동 기록 ${reviewId}: ${item.note}`);
    exItems.set(reviewId, item);
    const found: Found[] = [];
    const emb: Found[] = [];
    walkUrls(r, [], [], found, emb, () => false);
    for (const e of emb) embedded.push({ where: `exercise-records:${reviewId}${pathText(e.path)}`, domain: 'exercise', reviewId });
    for (const f of found) {
      const kp = keyPathOf(f.path);
      exercisePathCounts[kp] = (exercisePathCounts[kp] ?? 0) + 1;
      occs.push({
        domain: 'exercise',
        origin: 'exercise-record',
        reviewId,
        itemId: item.itemId,
        itemName: item.itemName,
        raw: f.value,
        where: `exercise-records:${reviewId}${pathText(f.path)}`,
        keyPath: kp,
        contexts: nearestText(f.stack),
        consultedOn: nearestDate(f.stack),
        recordedAt: nearestTime(f.stack),
        purposeHint: purposeOf('exercise', f.path),
        seedRef: null,
        holdReason: null,
      });
    }
  }

  /* 메커니즘 검수 기록 — 목록 주소(catalog_url) · 출처 표시(canonical_local_record)는 인용이 아니다 */
  let excludedProvenance = 0;
  let catalogUrlSkipped = 0;
  if (typeof s.mechanics.catalog_url === 'string') catalogUrlSkipped++;
  const mechRecords = Array.isArray(s.mechanics.records) ? s.mechanics.records : [];
  const mechItems = new Map<string, ExerciseItem>();
  for (const [i, r] of mechRecords.entries()) {
    if (!isObj(r)) continue;
    const reviewId = str(r.review_id);
    if (!reviewId) {
      notes.push(`메커니즘 기록 ${i} 번째에 review_id 가 없어 건너뜀`);
      continue;
    }
    const item = { itemId: str(r.drill_id), itemName: str(r.title) };
    mechItems.set(reviewId, item);
    const found: Found[] = [];
    const emb: Found[] = [];
    walkUrls(r, [], [], found, emb, (o, k) => {
      const v = o[k];
      if (isObj(v) && v.source_id === 'canonical_local_record') {
        excludedProvenance++;
        return true;
      }
      return false;
    });
    for (const e of emb) embedded.push({ where: `mechanics-records:${reviewId}${pathText(e.path)}`, domain: 'mechanics', reviewId });
    for (const f of found) {
      const kp = keyPathOf(f.path);
      mechanicsPathCounts[kp] = (mechanicsPathCounts[kp] ?? 0) + 1;
      occs.push({
        domain: 'mechanics',
        origin: 'mechanics-record',
        reviewId,
        itemId: item.itemId,
        itemName: item.itemName,
        raw: f.value,
        where: `mechanics-records:${reviewId}${pathText(f.path)}`,
        keyPath: kp,
        contexts: nearestText(f.stack),
        consultedOn: nearestDate(f.stack),
        recordedAt: nearestTime(f.stack),
        purposeHint: purposeOf('mechanics', f.path),
        seedRef: null,
        holdReason: null,
      });
    }
  }

  /* 메커니즘 이관 목록(review_evidence_handoff.uses) */
  const handoff = isObj(s.mechanicsCheckpoint.review_evidence_handoff) ? s.mechanicsCheckpoint.review_evidence_handoff : null;
  const hUses = handoff && Array.isArray(handoff.uses) ? handoff.uses : [];
  hUses.forEach((u, i) => {
    if (!isObj(u)) return;
    const reviewId = str(u.review_id);
    const url = str(u.url);
    if (!reviewId || !url) {
      notes.push(`이관 목록 ${i} 번째에 review_id · url 이 없어 건너뜀`);
      return;
    }
    const item = mechItems.get(reviewId);
    const contexts: Ctx[] = [];
    for (const k of ['summary', 'limit', 'coverage']) {
      const t = str(u[k]);
      if (t && !URL_START.test(t)) contexts.push({ key: k, lang: langOf(t), text: clip(t, 1200) });
    }
    const coverage = str(u.coverage) ?? '';
    occs.push({
      domain: 'mechanics',
      origin: 'mechanics-handoff',
      reviewId,
      itemId: str(u.drill_id) ?? item?.itemId ?? null,
      itemName: item?.itemName ?? null,
      raw: url,
      where: `mechanics-checkpoint:review_evidence_handoff.uses[${i}]`,
      keyPath: 'review_evidence_handoff.uses',
      contexts,
      consultedOn: explicitDate(u.consulted_on),
      /* 이관 목록이 쓰인 시각은 검수 기록에 적힌 때가 아니다 — 쓰지 않는다 */
      recordedAt: null,
      purposeHint: 'mechanism',
      seedRef: null,
      holdReason: coverage.includes('재확인') ? '이관 문서가 이 출처 연결을 등록 전에 다시 확인하라고 적음' : null,
    });
  });

  /* 시드 목록(운동만) */
  const seedSources = Array.isArray(s.seed.sources) ? s.seed.sources : [];
  let seedRawUses = 0;
  let seedWithAccessedAt = 0;
  const seedNoteUrlSubstitutions: Extracted['seedNoteUrlSubstitutions'] = [];
  for (const src of seedSources) {
    if (!isObj(src)) continue;
    const ref = str(src.id) ?? '';
    const seedUrl = str(src.url) ?? '';
    const uses = Array.isArray(src.uses) ? src.uses : [];
    for (const u of uses) {
      if (!isObj(u)) continue;
      seedRawUses++;
      const reviewId = str(u.reviewId);
      if (!reviewId) {
        notes.push(`시드 ${ref} 쓰임에 reviewId 가 없어 건너뜀`);
        continue;
      }
      const note = str(u.note);
      let cited = seedUrl;
      /* 시드가 쿼리를 지운 링크를 적고 쓰임 메모에 원래 링크를 남긴 경우 — 기록에 실제로 적힌 원래 링크를 쓴다 */
      if (note && /^https:\/\/\S+$/.test(note) && note !== seedUrl) {
        const a = checkEvidenceUrl(note);
        const b = checkEvidenceUrl(seedUrl);
        if (a.ok && b.ok && new URL(a.href).host === new URL(b.href).host && new URL(a.href).pathname === new URL(b.href).pathname) {
          cited = note;
          seedNoteUrlSubstitutions.push({ ref, seedUrl, citedUrl: note });
        }
      }
      const accessed = str(u.accessedAt);
      if (accessed) seedWithAccessedAt++;
      const item = exItems.get(reviewId);
      const contexts: Ctx[] = [];
      if (note && !URL_START.test(note)) contexts.push({ key: 'note', lang: langOf(note), text: clip(note, 1200) });
      const field = str(u.field) ?? '';
      occs.push({
        domain: 'exercise',
        origin: 'seed-catalog',
        reviewId,
        itemId: item?.itemId ?? null,
        itemName: item?.itemName ?? str(u.exercise),
        raw: cited,
        where: `seed-catalog:${ref}:${field}`,
        keyPath: field.replace(/^\./, '').replace(/\.url$/, ''),
        contexts,
        consultedOn: accessed ? kstDate(accessed) : null,
        recordedAt: null,
        purposeHint: seedFieldPurpose(field),
        seedRef: ref,
        holdReason: null,
      });
    }
  }

  /* 점검표(checkpoint)의 규칙 단위 링크 — 특정 검수 항목의 쓰임이 아니므로 가져오지 않고 목록에만 남긴다 */
  const unattributed: Extracted['unattributed'] = [];
  /* 메커니즘 점검표의 요청 사본은 검수 번호 대신 영상 차례(number)만 적은 것이 있다 — 기록의 number 로 검수 번호를 찾는다 */
  const mechReviewOfNumber = new Map<number, string>();
  for (const r of mechRecords) {
    if (!isObj(r) || typeof r.number !== 'number' || !Number.isInteger(r.number)) continue;
    const rid = str(r.review_id);
    if (rid && !mechReviewOfNumber.has(r.number)) mechReviewOfNumber.set(r.number, rid);
  }
  const cpWalk = (name: string, domain: Domain, cp: Obj, skipKeys: string[]) => {
    for (const [k, v] of Object.entries(cp)) {
      if (skipKeys.includes(k)) continue;
      const found: Found[] = [];
      const emb: Found[] = [];
      walkUrls(v, [k], [], found, emb, () => false);
      for (const f of [...found, ...emb]) {
        let reviewId: string | null = null;
        let scoped = false;
        for (let i = f.stack.length - 1; i >= 0; i--) {
          const o = f.stack[i];
          if (typeof o.review_id === 'string' && o.review_id.trim()) {
            reviewId = o.review_id.trim();
            scoped = true;
            break;
          }
          if (domain === 'mechanics' && typeof o.number === 'number' && mechReviewOfNumber.has(o.number)) {
            reviewId = mechReviewOfNumber.get(o.number)!;
            scoped = true;
            break;
          }
          /* 검수 번호가 없는 요청은 요청 기록(user_change_requests 등) 안에 있을 때만 — 점검표 규칙의 user_request 는 공통 안내다 */
          if (typeof o.user_request === 'string' && o.user_request.trim() && /user_(change_)?requests?|user_decision/.test(String(f.path[0]))) scoped = true;
        }
        unattributed.push({
          url: f.value.trim(),
          where: `${name}:${pathText(f.path).slice(1)}`,
          domain,
          reviewId,
          reviewScoped: scoped,
          reason: scoped ? '검수 요청 기록의 사본(검수 기록에서 가져옴)' : '점검표의 규칙 · 공통 안내에 적힌 링크라 특정 검수 항목의 쓰임으로 볼 수 없어요.',
        });
      }
    }
  };
  cpWalk('mechanics-checkpoint', 'mechanics', s.mechanicsCheckpoint, ['review_evidence_handoff', 'catalog_url']);
  if (typeof s.mechanicsCheckpoint.catalog_url === 'string') catalogUrlSkipped++;
  cpWalk('exercise-checkpoint', 'exercise', s.exerciseCheckpoint, ['catalog_url']);

  return {
    occs,
    embedded,
    exerciseRecords: s.exercise.length,
    mechanicsRecords: mechRecords.length,
    seedEntries: seedSources.length,
    seedRawUses,
    seedWithAccessedAt,
    seedNoteUrlSubstitutions,
    excludedProvenance,
    catalogUrlSkipped,
    handoffUses: hUses.length,
    unattributed,
    exercisePathCounts,
    mechanicsPathCounts,
    notes,
  };
}

/* ───────── 출판사 링크 안의 DOI 후보(공식 서지가 그 DOI 를 알 때만 묶는다) ───────── */

function doiCandidateOf(href: string): string | null {
  const u = new URL(href);
  const p = decodeSafe(u.pathname);
  const m = /(?:^|\/)(10\.\d{4,9}\/.+)$/.exec(p);
  if (!m) return null;
  const tail = m[1].replace(/\/(full|abstract|pdf|epdf|fulltext|html|full\.pdf)\/?$/i, '').replace(/\/+$/, '');
  return cleanDoi(tail);
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/* ───────── NCBI 공식 서지 ───────── */

type NcbiSummary = {
  pmid: string;
  title: string | null;
  authors: string[];
  container: string | null;
  year: number | null;
  doi: string | null;
  pmcid: string | null;
  pubtypes: string[];
};
type IdconvRow = { requested: string; pmcid: string | null; pmid: string | null; doi: string | null };
type NcbiFile = {
  kind: 'review-evidence-ncbi-metadata';
  fetchedAt: string;
  snapshotId: string;
  tool: string;
  requests: { url: string; status: number | null; ok: boolean; ids: number }[];
  idconv: IdconvRow[];
  summaries: NcbiSummary[];
  errors: { stage: string; message: string; ids?: string[] }[];
};

const TOOL = 'bullpen-review-evidence';
const ESUMMARY = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
/* 2026-11 NCBI 가 옛 주소(www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/)를 이 공식 주소로 옮겼다(301) — 넘겨주기를 따르지 않고 새 주소를 바로 쓴다 */
const IDCONV = 'https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/';
const ALLOWED_PREFIXES = [ESUMMARY + '?', IDCONV + '?'];

const yearOf = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (typeof v !== 'string') continue;
    const m = /(19|20)\d{2}/.exec(v);
    if (m) return Number(m[0]);
  }
  return null;
};

function summaryFromEsummary(uid: string, d: Obj): NcbiSummary {
  const ids = Array.isArray(d.articleids) ? d.articleids : [];
  let doi: string | null = null;
  let pmcid: string | null = null;
  for (const a of ids) {
    if (!isObj(a)) continue;
    if (a.idtype === 'doi' && !doi) doi = cleanDoi(a.value);
    if (a.idtype === 'pmc' && !pmcid) pmcid = cleanPmcid(a.value);
  }
  const authors = (Array.isArray(d.authors) ? d.authors : [])
    .map((a) => (isObj(a) && typeof a.name === 'string' ? a.name.trim() : ''))
    .filter(Boolean);
  return {
    pmid: uid,
    title: str(d.title),
    authors,
    container: str(d.fulljournalname) ?? str(d.source),
    year: yearOf(d.pubdate, d.sortpubdate, d.epubdate),
    doi,
    pmcid,
    pubtypes: (Array.isArray(d.pubtype) ? d.pubtype : []).filter((x): x is string => typeof x === 'string'),
  };
}

function summaryFromPrepared(d: Obj): NcbiSummary | null {
  const pmid = cleanPmid(d.pmid);
  if (!pmid) return null;
  const ids = Array.isArray(d.articleids) ? d.articleids : [];
  let doi: string | null = null;
  let pmcid: string | null = null;
  for (const a of ids) {
    if (!isObj(a)) continue;
    if (a.idtype === 'doi' && !doi) doi = cleanDoi(a.value);
    if (a.idtype === 'pmc' && !pmcid) pmcid = cleanPmcid(a.value);
  }
  return {
    pmid,
    title: str(d.title),
    authors: (Array.isArray(d.authors) ? d.authors : []).filter((x): x is string => typeof x === 'string'),
    container: str(d.fulljournalname) ?? str(d.journal) ?? str(d.source),
    year: yearOf(d.pubdate, d.sortpubdate),
    doi,
    pmcid,
    pubtypes: [],
  };
}

function idconvRowOf(r: Obj): IdconvRow | null {
  const requested = str(r['requested-id']) ?? str(r.requested) ?? '';
  const row = { requested, pmcid: cleanPmcid(r.pmcid), pmid: cleanPmid(r.pmid), doi: cleanDoi(r.doi) };
  return row.pmcid || row.pmid || row.doi ? row : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ncbiGet(url: string, file: NcbiFile, ids: number): Promise<Obj | null> {
  if (!ALLOWED_PREFIXES.some((p) => url.startsWith(p))) throw new Error('허용하지 않은 주소예요.');
  /* 초당 3번 아래 — 요청 사이 400ms */
  await sleep(400);
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
    file.requests.push({ url, status: res.status, ok: res.ok, ids });
    if (!res.ok) {
      const moved = res.status >= 300 && res.status < 400;
      /* 넘겨주는 곳은 적기만 하고 가지 않는다(허용한 두 주소 밖) */
      const to = moved ? (res.headers.get('location') ?? '').split('?')[0] : '';
      file.errors.push({ stage: url.startsWith(ESUMMARY) ? 'esummary' : 'idconv', message: `HTTP ${res.status}${moved ? ` (넘겨주기 안 따라감${to ? `: ${to}` : ''})` : ''}` });
      return null;
    }
    const text = await res.text();
    const v = JSON.parse(text) as Json;
    return isObj(v) ? v : null;
  } catch (e) {
    file.requests.push({ url, status: null, ok: false, ids });
    file.errors.push({ stage: url.startsWith(ESUMMARY) ? 'esummary' : 'idconv', message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    return null;
  }
}

function chunked<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function cmdFetchNcbi(opts: Record<string, string>) {
  const snap = loadSnapshot(need(opts, 'snapshot'));
  const out = need(opts, 'out');
  const ex = extract(snap);
  const pmids = new Set<string>();
  const pmcids = new Set<string>();
  const dois = new Set<string>();
  for (const o of ex.occs) {
    const c = checkEvidenceUrl(o.raw);
    if (!c.ok) continue;
    const ids = identifiersFromUrl(c);
    if (ids.pmid) pmids.add(ids.pmid);
    if (ids.pmcid) pmcids.add(ids.pmcid);
    if (ids.doi) dois.add(ids.doi);
    const cand = doiCandidateOf(c.href);
    if (cand) dois.add(cand);
  }
  /* 준비된 서지의 번호 짝 */
  const knownDoiPmid = new Set<string>();
  for (const m of Array.isArray(snap.prepared.metadata) ? snap.prepared.metadata : []) {
    if (!isObj(m)) continue;
    const s = summaryFromPrepared(m);
    if (!s) continue;
    pmids.add(s.pmid);
    if (s.doi) knownDoiPmid.add(s.doi);
    if (s.pmcid) pmcids.add(s.pmcid);
  }
  const prepIdent = [
    ...(Array.isArray(snap.prepared.pmcIdentityMetadata) ? snap.prepared.pmcIdentityMetadata : []),
    ...(Array.isArray(snap.pmcIdentities.records) ? snap.pmcIdentities.records : []),
  ];
  for (const r of prepIdent) {
    if (!isObj(r)) continue;
    const row = idconvRowOf(r);
    if (!row) continue;
    if (row.pmcid) pmcids.add(row.pmcid);
    if (row.pmid) pmids.add(row.pmid);
    if (row.doi && row.pmid) knownDoiPmid.add(row.doi);
  }

  const file: NcbiFile = {
    kind: 'review-evidence-ncbi-metadata',
    fetchedAt: new Date().toISOString(),
    snapshotId: snap.id,
    tool: TOOL,
    requests: [],
    idconv: [],
    summaries: [],
    errors: [],
  };

  const runIdconv = async (list: string[], idtype: 'pmcid' | 'doi') => {
    for (const batch of chunked(list.sort(cmp), 100)) {
      const q = new URLSearchParams({ ids: batch.join(','), idtype, format: 'json', tool: TOOL });
      const body = await ncbiGet(`${IDCONV}?${q.toString()}`, file, batch.length);
      if (!body) continue;
      const recs = Array.isArray(body.records) ? body.records : [];
      for (const r of recs) {
        if (!isObj(r)) continue;
        if (typeof r.status === 'string' && r.status === 'error') {
          file.errors.push({ stage: 'idconv', message: str(r.errmsg) ?? 'idconv 오류', ids: [str(r['requested-id']) ?? ''] });
          continue;
        }
        const row = idconvRowOf(r);
        if (row) {
          file.idconv.push(row);
          if (row.pmid) pmids.add(row.pmid);
          if (row.doi && row.pmid) knownDoiPmid.add(row.doi);
        } else file.errors.push({ stage: 'idconv', message: '번호 짝이 없는 결과', ids: [str(r['requested-id']) ?? ''] });
      }
    }
  };

  await runIdconv([...pmcids], 'pmcid');
  const unknownDois = [...dois].filter((d) => !knownDoiPmid.has(d));
  await runIdconv(unknownDois, 'doi');

  for (const batch of chunked([...pmids].sort((a, b) => Number(a) - Number(b)), 150)) {
    const q = new URLSearchParams({ db: 'pubmed', id: batch.join(','), retmode: 'json', tool: TOOL });
    const body = await ncbiGet(`${ESUMMARY}?${q.toString()}`, file, batch.length);
    const result = body && isObj(body.result) ? body.result : null;
    if (!result) continue;
    const uids = Array.isArray(result.uids) ? result.uids.filter((x): x is string => typeof x === 'string') : [];
    for (const uid of uids) {
      const d = result[uid];
      if (!isObj(d)) continue;
      if (typeof d.error === 'string') {
        file.errors.push({ stage: 'esummary', message: d.error, ids: [uid] });
        continue;
      }
      file.summaries.push(summaryFromEsummary(uid, d));
    }
    const missing = batch.filter((p) => !uids.includes(p));
    if (missing.length) file.errors.push({ stage: 'esummary', message: '결과에 없는 PMID', ids: missing });
  }
  file.summaries.sort((a, b) => Number(a.pmid) - Number(b.pmid));
  file.idconv.sort((a, b) => cmp(a.requested, b.requested));
  writeJson(out, file);
  console.log(
    JSON.stringify({ out, requests: file.requests.length, idconv: file.idconv.length, summaries: file.summaries.length, errors: file.errors.length, pmids: pmids.size, pmcids: pmcids.size, doisAsked: unknownDois.length }),
  );
}

/* ───────── 묶기(build) ───────── */

class UnionFind {
  parent = new Map<string, string>();
  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
  find(x: string): string {
    this.add(x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    /* 정해진 순서(작은 글자가 뿌리) — 결과가 넣는 순서와 상관없게 */
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

type OfficialMeta = NcbiSummary & { origin: 'ncbi-live' | 'prepared' };
type Official = {
  byPmid: Map<string, OfficialMeta>;
  /** 공식 번호 짝(각 줄 = 같은 자료의 번호들) */
  links: { pmid: string | null; pmcid: string | null; doi: string | null; origin: 'ncbi-live' | 'prepared' }[];
  ncbiFile: string | null;
  ncbiErrors: number;
};

function loadOfficial(s: Snapshot, ncbiPath: string | null): Official {
  const byPmid = new Map<string, OfficialMeta>();
  const links: Official['links'] = [];
  let ncbiErrors = 0;
  if (ncbiPath) {
    const f = readJson(ncbiPath);
    if (!isObj(f)) throw new Error('ncbi 파일 모양이 맞지 않아요.');
    ncbiErrors = Array.isArray(f.errors) ? f.errors.length : 0;
    for (const x of Array.isArray(f.summaries) ? f.summaries : []) {
      if (!isObj(x)) continue;
      const pmid = cleanPmid(x.pmid);
      if (!pmid) continue;
      const m: OfficialMeta = {
        pmid,
        title: str(x.title),
        authors: (Array.isArray(x.authors) ? x.authors : []).filter((a): a is string => typeof a === 'string'),
        container: str(x.container),
        year: typeof x.year === 'number' ? x.year : null,
        doi: cleanDoi(x.doi),
        pmcid: cleanPmcid(x.pmcid),
        pubtypes: (Array.isArray(x.pubtypes) ? x.pubtypes : []).filter((a): a is string => typeof a === 'string'),
        origin: 'ncbi-live',
      };
      byPmid.set(pmid, m);
      links.push({ pmid, pmcid: m.pmcid, doi: m.doi, origin: 'ncbi-live' });
    }
    for (const x of Array.isArray(f.idconv) ? f.idconv : []) {
      if (!isObj(x)) continue;
      links.push({ pmid: cleanPmid(x.pmid), pmcid: cleanPmcid(x.pmcid), doi: cleanDoi(x.doi), origin: 'ncbi-live' });
    }
  }
  /* 실시간 조회가 없거나 빠진 것은 준비된 서지(같은 NCBI 출처, 더 이른 조회)로 채운다 */
  for (const x of Array.isArray(s.prepared.metadata) ? s.prepared.metadata : []) {
    if (!isObj(x)) continue;
    const m = summaryFromPrepared(x);
    if (!m) continue;
    if (!byPmid.has(m.pmid)) byPmid.set(m.pmid, { ...m, origin: 'prepared' });
    links.push({ pmid: m.pmid, pmcid: m.pmcid, doi: m.doi, origin: 'prepared' });
  }
  const prepIdent = [
    ...(Array.isArray(s.prepared.pmcIdentityMetadata) ? s.prepared.pmcIdentityMetadata : []),
    ...(Array.isArray(s.pmcIdentities.records) ? s.pmcIdentities.records : []),
  ];
  for (const r of prepIdent) {
    if (!isObj(r)) continue;
    const row = idconvRowOf(r);
    if (row) links.push({ pmid: row.pmid, pmcid: row.pmcid, doi: row.doi, origin: 'prepared' });
  }
  return { byPmid, links, ncbiFile: ncbiPath, ncbiErrors };
}

type SkeletonSource = {
  sourceKey: string;
  urls: string[];
  identifiers: Identifiers;
  verifiedBy: 'ncbi' | null;
  metadataOrigin: 'ncbi-live' | 'prepared' | null;
  title: string | null;
  authors: string[];
  container: string | null;
  year: number | null;
  pubtypes: string[];
  seedRefs: string[];
  seedKind: string | null;
  seedTitle: string | null;
  /** 시드 제목은 적은 사람이 넣은 값 — 공식 서지로 확인하지 않음 */
  seedTitleStatus: 'reviewer-entered' | null;
  hostClass: string;
  kindSuggestion: SourceKind | null;
  /** 출판사 링크에서 읽었지만 공식 서지로 확인하지 못한 DOI(묶기에 쓰지 않음) */
  unverifiedDoiCandidates: string[];
  conflicts: string[];
};

type SkeletonUse = {
  /** 한 검수에서 한 출처 = 쓰임 하나: prefix + sha(분야|검수 번호|출처 열쇠) */
  useKey: string;
  /** 합치기 전(링크 하나 = 쓰임 하나) 열쇠들 — 예전 열쇠로 적힌 한국어 칸을 이어 쓰려고 남긴다(차례 = citedUrl · otherCitedUrls 차례) */
  memberKeys: string[];
  sourceKey: string;
  citedUrl: string;
  /** 같은 검수에서 같은 출처를 가리킨 다른 링크(합친 쓰임) */
  otherCitedUrls: string[];
  domain: Domain;
  reviewId: string;
  itemId: string | null;
  itemName: string | null;
  origins: HistoricalOrigin[];
  consultedOn: string | null;
  recordedAt: string | null;
  purposeSuggestion: Purpose;
  purposeCandidates: Partial<Record<Purpose, number>>;
  contexts: { key: string; lang: 'ko' | 'en'; text: string }[];
  /** 내부 경로 — 제품 글에 쓰지 않는다 */
  paths: string[];
  seedRefs: string[];
  occurrences: number;
  hold: { reason: string } | null;
  notes: string[];
};

type Skeleton = {
  kind: 'review-evidence-import-skeleton';
  snapshot: { id: string; inputs: { name: string; sha256: string }[]; capturedAt: string | null };
  builtFrom: { ncbi: string | null };
  sources: SkeletonSource[];
  uses: SkeletonUse[];
};

function hostClassOf(host: string, href: string): string {
  if (host === 'pubmed.ncbi.nlm.nih.gov' || (host.endsWith('ncbi.nlm.nih.gov') && href.includes('/pubmed/'))) return 'pubmed';
  if (host === 'pmc.ncbi.nlm.nih.gov' || host === 'europepmc.org' || href.includes('ncbi.nlm.nih.gov/pmc/')) return 'pmc';
  if (host === 'doi.org' || host === 'dx.doi.org') return 'doi';
  if (host.endsWith('drivelinebaseball.com')) return 'driveline';
  if (host.endsWith('treadathletics.com')) return 'tread';
  if (host.endsWith('nsca.com')) return 'nsca';
  if (host === 'dspace.cuni.cz' || host === 'dcollection.korea.ac.kr') return 'thesis-repository';
  if (/\.(gov|go\.kr|go\.jp)$/.test(host) || host === 'www.law.go.kr') return 'government';
  if (doiCandidateOf(href)) return 'publisher-doi';
  return 'other';
}

function kindSuggestionOf(src: Omit<SkeletonSource, 'kindSuggestion'>): SourceKind | null {
  const pt = src.pubtypes.map((p) => p.toLowerCase().trim());
  /* 'Systematic Review' · 'Meta-Analysis' → 체계적 문헌고찰, 그 밖의 '… Review'(Scoping Review · Review 등) → 종설 */
  if (pt.some((p) => /\bsystematic review\b|\bmeta-analysis\b/.test(p))) return 'systematic-review';
  if (pt.some((p) => /\breview\b/.test(p))) return 'narrative-review';
  if (pt.some((p) => /\bguideline\b|consensus development conference/.test(p))) return 'professional-guidance';
  const titleText = `${src.title ?? ''} ${src.seedTitle ?? ''}`.toLowerCase();
  if (src.hostClass === 'thesis-repository' || /\b(thesis|dissertation)\b|학위논문|석사|박사/.test(titleText) || src.urls.some((u) => /\/(thesis|dissertation)s?\//i.test(u)))
    return 'thesis';
  if (src.seedKind === 'training_material') return 'coaching-material';
  if (src.seedKind === 'guideline') return 'professional-guidance';
  if (src.seedKind === 'regulatory') return 'regulation';
  if (src.seedKind === 'research') return 'original-research';
  /* NCBI(PubMed · PMC)에 실린 글 — 종설 · 지침 표시가 없으면 원저로 제안(사람이 고친다) */
  if (src.verifiedBy === 'ncbi') return 'original-research';
  if (src.hostClass === 'driveline' || src.hostClass === 'tread' || src.hostClass === 'nsca') return 'coaching-material';
  return null;
}

type Pair = { domain: Domain; reviewId: string; normalized: string };
const pairKey = (p: Pair) => `${p.domain}|${p.reviewId}|${p.normalized}`;

const ORIGIN_ORDER: HistoricalOrigin[] = ['exercise-record', 'mechanics-record', 'mechanics-handoff', 'seed-catalog'];
const PURPOSE_TIE: Purpose[] = ['user-request', 'mechanism', 'evidence-check', 'description'];

function cmdBuild(opts: Record<string, string>) {
  const snap = loadSnapshot(need(opts, 'snapshot'));
  const outDir = need(opts, 'out');
  const official = loadOfficial(snap, opts.ncbi ?? null);
  const ex = extract(snap);

  /* 링크 검사 */
  type Checked = Occ & { href: string; normalized: string; host: string };
  const rejected: { url: string; reason: string; where: string }[] = [];
  const good: Checked[] = [];
  for (const o of ex.occs) {
    const c = checkEvidenceUrl(o.raw);
    if (!c.ok) rejected.push({ url: o.raw, reason: c.reason, where: o.where });
    else good.push({ ...o, href: c.href, normalized: c.normalized, host: c.host });
  }

  /* 쓰임 묶기: (분야, 검수 번호, 정규화 링크) 하나 = 쓰임 하나 */
  const byPair = new Map<string, Checked[]>();
  for (const o of good) {
    const k = pairKey(o);
    const list = byPair.get(k) ?? [];
    list.push(o);
    byPair.set(k, list);
  }

  /* 출처 묶기 */
  const uf = new UnionFind();
  const hrefOfNorm = new Map<string, string>();
  const doiCandOfNorm = new Map<string, string>();
  for (const o of good) {
    const uk = `url:${o.normalized}`;
    uf.add(uk);
    if (!hrefOfNorm.has(o.normalized)) hrefOfNorm.set(o.normalized, o.href);
    const ids = identifiersFromUrl(o);
    if (ids.pmid) uf.union(uk, `pmid:${ids.pmid}`);
    if (ids.pmcid) uf.union(uk, `pmcid:${ids.pmcid}`);
    if (ids.doi) uf.union(uk, `doi:${ids.doi}`);
    const cand = doiCandidateOf(o.href);
    if (cand && !ids.doi) doiCandOfNorm.set(o.normalized, cand);
  }
  const officialDois = new Set<string>();
  const officialPmcids = new Set<string>();
  for (const l of official.links) {
    const ks = [l.pmid ? `pmid:${l.pmid}` : null, l.pmcid ? `pmcid:${l.pmcid}` : null, l.doi ? `doi:${l.doi}` : null].filter((x): x is string => !!x);
    for (let i = 1; i < ks.length; i++) uf.union(ks[0], ks[i]);
    if (l.doi) officialDois.add(l.doi);
    if (l.pmcid) officialPmcids.add(l.pmcid);
  }
  for (const [norm, doi] of doiCandOfNorm) if (officialDois.has(doi)) uf.union(`url:${norm}`, `doi:${doi}`);

  /* 묶음별 열쇠 */
  const comp = new Map<string, Set<string>>();
  for (const k of uf.parent.keys()) {
    const r = uf.find(k);
    const set = comp.get(r) ?? new Set<string>();
    set.add(k);
    comp.set(r, set);
  }
  const sourceKeyOfNorm = new Map<string, string>();
  const sources: SkeletonSource[] = [];
  const seedByNorm = new Map<string, { ref: string; kind: string | null; title: string | null }[]>();
  for (const src of Array.isArray(snap.seed.sources) ? snap.seed.sources : []) {
    if (!isObj(src)) continue;
    const c = checkEvidenceUrl(src.url);
    if (!c.ok) continue;
    const list = seedByNorm.get(c.normalized) ?? [];
    list.push({ ref: str(src.id) ?? '', kind: str(src.kind), title: str(src.title) });
    seedByNorm.set(c.normalized, list);
  }
  /* 시드 링크가 쿼리를 지운 꼴이면 원래 링크에도 시드 정보를 잇는다 */
  for (const s of ex.seedNoteUrlSubstitutions) {
    const a = checkEvidenceUrl(s.seedUrl);
    const b = checkEvidenceUrl(s.citedUrl);
    if (a.ok && b.ok && seedByNorm.has(a.normalized) && !seedByNorm.has(b.normalized)) seedByNorm.set(b.normalized, seedByNorm.get(a.normalized)!);
  }

  for (const keys of comp.values()) {
    const urlKeys = [...keys].filter((k) => k.startsWith('url:')).sort(cmp);
    if (!urlKeys.length) continue;
    const norms = urlKeys.map((k) => k.slice(4));
    const pmids = [...keys].filter((k) => k.startsWith('pmid:')).map((k) => k.slice(5)).sort((a, b) => Number(a) - Number(b));
    const pmcids = [...keys].filter((k) => k.startsWith('pmcid:')).map((k) => k.slice(6)).sort(cmp);
    const doisAll = [...keys].filter((k) => k.startsWith('doi:')).map((k) => k.slice(4)).sort(cmp);
    const conflicts: string[] = [];
    if (pmids.length > 1) conflicts.push(`한 묶음에 PMID 가 여럿: ${pmids.join(', ')}`);
    if (pmcids.length > 1) conflicts.push(`한 묶음에 PMCID 가 여럿: ${pmcids.join(', ')}`);
    if (doisAll.length > 1) conflicts.push(`한 묶음에 DOI 가 여럿: ${doisAll.join(', ')}`);
    const meta = pmids.map((p) => official.byPmid.get(p)).find((m): m is OfficialMeta => !!m) ?? null;
    /* 공식 확인: PMID 서지가 있거나 공식 번호 짝(idconv)에 든 번호가 있을 때 */
    const officiallyLinked = official.links.some(
      (l) => (l.pmid && pmids.includes(l.pmid)) || (l.pmcid && pmcids.includes(l.pmcid)) || (l.doi && doisAll.includes(l.doi)),
    );
    const verified = !!meta || officiallyLinked;
    const identifiers: Identifiers = {};
    if (verified) {
      const pmid = meta?.pmid ?? pmids[0];
      if (pmid) identifiers.pmid = pmid;
      const linkRow = official.links.find((l) => (pmid && l.pmid === pmid) || (l.pmcid && pmcids.includes(l.pmcid)));
      const pmcid = meta?.pmcid ?? linkRow?.pmcid ?? pmcids[0];
      if (pmcid) identifiers.pmcid = pmcid;
      const doi = meta?.doi ?? linkRow?.doi ?? doisAll.find((d) => officialDois.has(d));
      if (doi) identifiers.doi = doi;
    } else {
      /* 확인 못 한 자료는 링크 모양에서 바로 나온 번호만 */
      for (const n of norms) {
        const c = checkEvidenceUrl(hrefOfNorm.get(n) ?? n);
        if (!c.ok) continue;
        const ids = identifiersFromUrl(c);
        if (ids.pmid && !identifiers.pmid) identifiers.pmid = ids.pmid;
        if (ids.pmcid && !identifiers.pmcid) identifiers.pmcid = ids.pmcid;
        if (ids.doi && !identifiers.doi) identifiers.doi = ids.doi;
      }
    }
    const sourceKey = identifiers.pmid
      ? `pmid:${identifiers.pmid}`
      : verified && identifiers.doi
        ? `doi:${identifiers.doi}`
        : verified && identifiers.pmcid
          ? `pmcid:${identifiers.pmcid}`
          : `url-${sha256Hex(norms[0]).slice(0, 16)}`;
    const seeds = norms.flatMap((n) => seedByNorm.get(n) ?? []);
    const seedRefs = uniq(seeds.map((x) => x.ref)).sort(cmp);
    const firstSeed = [...seeds].sort((a, b) => cmp(a.ref, b.ref))[0] ?? null;
    const urls = norms.map((n) => hrefOfNorm.get(n) ?? n);
    const firstHost = (checkEvidenceUrl(urls[0]) as { host?: string }).host ?? '';
    const hostClasses = uniq(urls.map((u) => hostClassOf(new URL(u).host, u)));
    const hostClass = hostClasses.length === 1 ? hostClasses[0] : hostClasses.sort(cmp).join('+');
    const base = {
      sourceKey,
      urls,
      identifiers,
      verifiedBy: verified ? ('ncbi' as const) : null,
      metadataOrigin: meta ? meta.origin : verified ? (official.links.find((l) => (l.pmcid && pmcids.includes(l.pmcid)) || (l.doi && doisAll.includes(l.doi)))?.origin ?? null) : null,
      title: meta?.title ?? null,
      authors: meta?.authors ?? [],
      container: meta?.container ?? null,
      year: meta?.year ?? null,
      pubtypes: meta?.pubtypes ?? [],
      seedRefs,
      seedKind: firstSeed?.kind ?? null,
      seedTitle: firstSeed?.title ?? null,
      seedTitleStatus: firstSeed?.title ? ('reviewer-entered' as const) : null,
      hostClass: hostClass || hostClassOf(firstHost, urls[0]),
      unverifiedDoiCandidates: uniq(norms.map((n) => doiCandOfNorm.get(n)).filter((d): d is string => !!d && !officialDois.has(d))).sort(cmp),
      conflicts,
    };
    sources.push({ ...base, kindSuggestion: kindSuggestionOf(base) });
    for (const n of norms) sourceKeyOfNorm.set(n, sourceKey);
  }
  sources.sort((a, b) => cmp(a.sourceKey, b.sourceKey));
  const dupKeys = sources.map((s) => s.sourceKey).filter((k, i, a) => a.indexOf(k) !== i);
  if (dupKeys.length) throw new Error(`출처 열쇠가 겹쳐요: ${dupKeys.join(', ')}`);

  /* 쓰임 만들기 — 1) 링크 하나 = 조각 하나(예전 쓰임 열쇠), 2) 같은 검수 · 같은 출처의 조각을 쓰임 하나로 합친다 */
  const recordPairs = new Set<string>();
  for (const o of good) if (o.origin === 'mechanics-record') recordPairs.add(pairKey(o));
  const byOccOrder = (a: Checked, b: Checked) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin) || cmp(a.where, b.where);
  type Member = { key: string; sorted: Checked[]; citedUrl: string; hold: { reason: string } | null; holdIgnored: boolean };
  const groupsOfUse = new Map<string, Member[]>();
  for (const [k, list] of byPair) {
    const sorted = [...list].sort(byOccOrder);
    const first = sorted[0];
    const hrefCount = new Map<string, number>();
    for (const o of sorted) hrefCount.set(o.href, (hrefCount.get(o.href) ?? 0) + 1);
    const citedUrl = [...hrefCount.entries()].sort((a, b) => b[1] - a[1] || sorted.findIndex((o) => o.href === a[0]) - sorted.findIndex((o) => o.href === b[0]))[0][0];
    const holds = sorted.filter((o) => o.holdReason);
    const hold = holds.length && !recordPairs.has(k) ? { reason: holds[0].holdReason! } : null;
    const member: Member = { key: `${first.domain === 'exercise' ? 'ex' : 'mx'}-${sha256Hex(k).slice(0, 20)}`, sorted, citedUrl, hold, holdIgnored: !!holds.length && !hold };
    const gk = `${first.domain}|${first.reviewId}|${sourceKeyOfNorm.get(first.normalized)!}`;
    const g = groupsOfUse.get(gk) ?? [];
    g.push(member);
    groupsOfUse.set(gk, g);
  }
  const uses: SkeletonUse[] = [];
  const aliasMerged: { useKey: string; domain: Domain; reviewId: string; sourceKey: string; urls: string[]; memberKeys: string[] }[] = [];
  for (const [gk, membersRaw] of groupsOfUse) {
    /* 정해진 차례: 보류 아닌 조각 먼저, 그다음 가장 앞선 자리(가져온 곳 차례 · 경로) */
    const members = [...membersRaw].sort((a, b) => Number(!!a.hold) - Number(!!b.hold) || byOccOrder(a.sorted[0], b.sorted[0]) || cmp(a.key, b.key));
    const sorted = members.flatMap((m) => m.sorted).sort(byOccOrder);
    const first = sorted[0];
    const [domain, reviewId, sourceKey] = [first.domain, first.reviewId, gk.split('|').slice(2).join('|')];
    const notes: string[] = [];
    const itemIds = uniq(sorted.map((o) => o.itemId).filter((x): x is string => !!x));
    if (itemIds.length > 1) notes.push(`항목 번호가 여럿이라 첫 번째를 씀: ${itemIds.join(', ')}`);
    const itemNames = uniq(sorted.map((o) => o.itemName).filter((x): x is string => !!x));
    const consulted = sorted.map((o) => o.consultedOn).filter((x): x is string => !!x).sort(cmp);
    const recorded = sorted.map((o) => o.recordedAt).filter((x): x is string => !!x).sort(cmp);
    const pc: Partial<Record<Purpose, number>> = {};
    for (const o of sorted) pc[o.purposeHint] = (pc[o.purposeHint] ?? 0) + 1;
    const purposeSuggestion = (Object.entries(pc) as [Purpose, number][]).sort(
      (a, b) => b[1] - a[1] || PURPOSE_TIE.indexOf(a[0]) - PURPOSE_TIE.indexOf(b[0]),
    )[0][0];
    const seen = new Set<string>();
    const contexts: SkeletonUse['contexts'] = [];
    for (const o of sorted)
      for (const c of o.contexts) {
        if (seen.has(c.text)) continue;
        seen.add(c.text);
        contexts.push(c);
      }
    /* 보류는 모든 조각이 보류일 때만 — 같은 출처를 검수 기록에서 다른 링크로 적었으면 그 기록이 연결을 확인한 것 */
    const hold = members.every((m) => m.hold) ? members[0].hold : null;
    if (members.some((m) => m.holdIgnored)) notes.push('이관 문서가 재확인을 요청했지만 검수 기록에도 같은 링크가 있어 보류하지 않음');
    if (!hold && members.some((m) => m.hold)) notes.push('이관 문서가 재확인을 요청한 링크가 있지만 같은 검수 기록이 같은 출처를 다른 링크로 적어 보류하지 않음');
    const citedUrls = uniq(members.map((m) => m.citedUrl));
    const useKey = `${domain === 'exercise' ? 'ex' : 'mx'}-${sha256Hex(gk).slice(0, 20)}`;
    if (members.length > 1) {
      notes.push(`같은 검수에서 같은 출처를 가리킨 링크 ${members.length}개를 쓰임 하나로 합침`);
      aliasMerged.push({ useKey, domain, reviewId, sourceKey, urls: citedUrls, memberKeys: members.map((m) => m.key) });
    }
    uses.push({
      useKey,
      memberKeys: members.map((m) => m.key),
      sourceKey,
      citedUrl: citedUrls[0],
      otherCitedUrls: citedUrls.slice(1),
      domain,
      reviewId,
      itemId: itemIds[0] ?? null,
      itemName: itemNames[0] ?? null,
      origins: uniq(sorted.map((o) => o.origin)).sort(cmp) as HistoricalOrigin[],
      consultedOn: consulted.length ? consulted[consulted.length - 1] : null,
      recordedAt: recorded.length ? recorded[0] : null,
      purposeSuggestion,
      purposeCandidates: pc,
      contexts,
      paths: uniq(sorted.map((o) => o.where)),
      seedRefs: uniq(sorted.map((o) => o.seedRef).filter((x): x is string => !!x)).sort(cmp),
      occurrences: sorted.length,
      hold,
      notes,
    });
  }
  uses.sort((a, b) => cmp(a.domain, b.domain) || cmp(a.reviewId, b.reviewId) || cmp(a.citedUrl, b.citedUrl));
  aliasMerged.sort((a, b) => cmp(a.useKey, b.useKey));
  const useKeys = new Set(uses.map((u) => u.useKey));
  if (useKeys.size !== uses.length) throw new Error('쓰임 열쇠가 겹쳐요.');
  const allMemberKeys = uses.flatMap((u) => u.memberKeys);
  if (new Set(allMemberKeys).size !== allMemberKeys.length) throw new Error('조각 열쇠가 겹쳐요.');

  const skeleton: Skeleton = {
    kind: 'review-evidence-import-skeleton',
    snapshot: { id: snap.id, inputs: snap.inputs, capturedAt: snap.capturedAt },
    builtFrom: { ncbi: official.ncbiFile ? path.basename(official.ncbiFile) : null },
    sources,
    uses,
  };

  /* ───── 대조 ───── */
  const byOrigin = (o: HistoricalOrigin) => good.filter((x) => x.origin === o);
  const seedOcc = byOrigin('seed-catalog');
  const exOcc = byOrigin('exercise-record');
  const mxOcc = byOrigin('mechanics-record');
  const hoOcc = byOrigin('mechanics-handoff');
  const allExOccRaw = ex.occs.filter((o) => o.origin === 'exercise-record');
  const allMxOccRaw = ex.occs.filter((o) => o.origin === 'mechanics-record');
  const seedPairs = new Set(seedOcc.map((o) => `${o.reviewId}|${o.normalized}`));
  const seedNorms = new Set(seedOcc.map((o) => o.normalized));
  const exPairs = new Set(exOcc.map((o) => `${o.reviewId}|${o.normalized}`));
  const pairsNotInSeed = [...exPairs].filter((p) => !seedPairs.has(p)).sort(cmp);
  const exNorms = new Set(exOcc.map((o) => o.normalized));
  const urlsNotInSeed = [...exNorms].filter((n) => !seedNorms.has(n)).sort(cmp);
  const mxPairs = new Set(mxOcc.map((o) => `${o.reviewId}|${o.normalized}`));
  const hoPairs = new Set(hoOcc.map((o) => `${o.reviewId}|${o.normalized}`));
  const exTriples = new Set(exOcc.map((o) => `${o.reviewId}|${o.keyPath}|${o.normalized}`));
  const seedFieldMismatches = seedOcc
    .filter((o) => !exTriples.has(`${o.reviewId}|${o.keyPath}|${o.normalized}`))
    .map((o) => ({
      reviewId: o.reviewId,
      seedRef: o.seedRef,
      field: o.where.split(':').slice(2).join(':'),
      url: o.href,
      pairInRecords: exPairs.has(`${o.reviewId}|${o.normalized}`),
      recordPaths: uniq(exOcc.filter((x) => x.reviewId === o.reviewId && x.normalized === o.normalized).map((x) => x.keyPath)).sort(cmp),
    }));

  const allNormsUsed = new Set(good.map((o) => o.normalized));
  const usesByDomain: Record<string, number> = {};
  for (const u of uses) usesByDomain[u.domain] = (usesByDomain[u.domain] ?? 0) + 1;
  const sourceOf = new Map(sources.map((s) => [s.sourceKey, s]));
  const usedUrlNorms = new Set(good.map((o) => o.normalized));
  const heldGroups = new Set(uses.filter((u) => u.hold).map((u) => `${u.domain}|${u.reviewId}|${u.sourceKey}`));
  const importedPairs = new Set(good.filter((o) => !heldGroups.has(`${o.domain}|${o.reviewId}|${sourceKeyOfNorm.get(o.normalized)}`)).map((o) => pairKey(o)));
  const unattributed = ex.unattributed.map((u) => {
    const c = checkEvidenceUrl(u.url);
    return {
      ...u,
      urlCheck: c.ok ? 'ok' : c.reason,
      coveredByImport: c.ok ? usedUrlNorms.has(c.normalized) : false,
      /* 검수 요청 사본이면 그 (검수, 링크) 짝이 가져오기에 들었나 */
      pairInImport: u.reviewId && c.ok ? importedPairs.has(pairKey({ domain: u.domain, reviewId: u.reviewId, normalized: c.normalized })) : null,
    };
  });

  const notes: string[] = [
    ...ex.notes,
    `스냅샷 입력 이름은 가져오기 검사 규칙(소문자 · 숫자 · -)에 맞춰 '.json' 을 뺐다(SHA256SUMS 의 파일 이름 = 이름 + '.json').`,
    `메커니즘 목록 주소(catalog_url) ${ex.catalogUrlSkipped}건, 출처 표시(canonical_local_record) ${ex.excludedProvenance}건은 인용이 아니라 뺐다.`,
    `시드가 쿼리를 지운 링크를 적고 쓰임 메모에 원래 링크를 남긴 ${ex.seedNoteUrlSubstitutions.length}건은 원래 링크로 셌다(기록과 같은 쓰임이 되게).`,
    '확인일(consultedOn)은 시드 accessedAt(한국 날짜) · 메커니즘 checked_on/consulted_on 만 썼다. 가져온 시각으로 채우지 않았다.',
    '기록 시각(recordedAt)은 링크를 감싼 가장 가까운 블록의 at_utc · at(시간대가 있는 ISO 만) 가운데 가장 이른 값. 이관 목록 시각 · per_item_timestamp 글은 쓰지 않았다.',
    'mechanics 의 at 칸(시간대 있는 ISO)도 기록 시각으로 썼다(at_utc 와 같은 뜻의 칸).',
    `글 속에 묻힌 링크(인용 칸이 아닌 문장): ${ex.embedded.length}건 — 가져오지 않음.`,
    `NCBI 실시간 서지 파일: ${official.ncbiFile ? path.basename(official.ncbiFile) : '없음(준비된 서지만 사용)'}, 오류 ${official.ncbiErrors}건.`,
  ];
  if (ex.embedded.length) notes.push(...ex.embedded.map((e) => `묻힌 링크: ${e.where}`));

  const reconciliation = {
    kind: 'review-evidence-import-reconciliation',
    snapshot: { id: snap.id, inputs: snap.inputs, capturedAt: snap.capturedAt },
    seed: {
      entries: ex.seedEntries,
      rawUses: ex.seedRawUses,
      usesWithAccessedAt: ex.seedWithAccessedAt,
      distinctUrls: seedNorms.size,
    },
    exercise: {
      records: ex.exerciseRecords,
      urlOccurrences: allExOccRaw.length,
      distinctUrls: exNorms.size,
      reviewUrlPairs: exPairs.size,
      reviewsWithUrls: new Set(exOcc.map((o) => o.reviewId)).size,
      pairsNotInSeed: { count: pairsNotInSeed.length, pairs: pairsNotInSeed.map((p) => ({ reviewId: p.split('|')[0], url: hrefOfNorm.get(p.split('|').slice(1).join('|')) ?? p.split('|').slice(1).join('|') })) },
      urlsNotInSeed: { count: urlsNotInSeed.length, urls: urlsNotInSeed.map((n) => hrefOfNorm.get(n) ?? n) },
      pathCounts: ex.exercisePathCounts,
    },
    mechanics: {
      records: ex.mechanicsRecords,
      urlOccurrences: allMxOccRaw.length,
      distinctUrls: new Set(mxOcc.map((o) => o.normalized)).size,
      reviewUrlPairs: mxPairs.size,
      reviewsWithUrls: new Set(mxOcc.map((o) => o.reviewId)).size,
      handoffUses: ex.handoffUses,
      handoffPairs: hoPairs.size,
      handoffPairsAlsoInRecords: [...hoPairs].filter((p) => mxPairs.has(p)).length,
      handoffPairsOnlyInHandoff: [...hoPairs].filter((p) => !mxPairs.has(p)).map((p) => ({ reviewId: p.split('|')[0], url: hrefOfNorm.get(p.split('|').slice(1).join('|')) ?? '' })),
      pathCounts: ex.mechanicsPathCounts,
    },
    combined: {
      inputUrlStrings: ex.occs.length,
      acceptedUrlStrings: good.length,
      distinctNormalizedUrls: allNormsUsed.size,
      logicalSources: sources.length,
      verifiedSources: sources.filter((s) => s.verifiedBy).length,
      verifiedSourcesWithTitle: sources.filter((s) => s.verifiedBy && s.title).length,
      verifiedSourcesFromPreparedOnly: sources.filter((s) => s.metadataOrigin === 'prepared').length,
      urlOnlySources: sources.filter((s) => !s.verifiedBy).length,
      sourcesWithSeedTitleOnly: sources.filter((s) => !s.title && s.seedTitle).length,
      aliasGroups: sources.filter((s) => s.urls.length > 1).map((s) => ({ sourceKey: s.sourceKey, urls: s.urls })),
      sourceConflicts: sources.filter((s) => s.conflicts.length).map((s) => ({ sourceKey: s.sourceKey, conflicts: s.conflicts })),
      unverifiedDoiCandidates: sources.filter((s) => s.unverifiedDoiCandidates.length).map((s) => ({ sourceKey: s.sourceKey, dois: s.unverifiedDoiCandidates })),
      kindSuggestions: countBy(sources.map((s) => s.kindSuggestion ?? 'null')),
      hostClasses: countBy(sources.map((s) => s.hostClass)),
      uses: uses.length,
      usesByDomain,
      usesByOriginSet: countBy(uses.map((u) => u.origins.join('+'))),
      usesWithConsultedOn: uses.filter((u) => u.consultedOn).length,
      usesWithRecordedAt: uses.filter((u) => u.recordedAt).length,
      usesWithKoreanContext: uses.filter((u) => u.contexts.some((c) => c.lang === 'ko')).length,
      usesWithoutContext: uses.filter((u) => !u.contexts.length).length,
      usesWithoutItemId: uses.filter((u) => !u.itemId).length,
      usesOnHold: uses.filter((u) => u.hold).map((u) => ({ useKey: u.useKey, reviewId: u.reviewId, url: u.citedUrl, reason: u.hold!.reason })),
      purposeSuggestions: countBy(uses.map((u) => u.purposeSuggestion)),
      usesOnVerifiedSources: uses.filter((u) => sourceOf.get(u.sourceKey)?.verifiedBy).length,
      /* 같은 검수에서 같은 출처를 다른 링크(PMC · PubMed 등)로 적은 것을 쓰임 하나로 합친 수 */
      aliasMergedUses: {
        mergedUses: aliasMerged.length,
        absorbedLinkUses: aliasMerged.reduce((n, a) => n + a.memberKeys.length - 1, 0),
        perLinkUsesBeforeMerge: allMemberKeys.length,
        list: aliasMerged,
      },
    },
    rejected,
    unattributed,
    seedFieldMismatches,
    notes,
  };

  mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, 'skeleton.json'), skeleton);
  writeJson(path.join(outDir, 'reconciliation.json'), reconciliation);
  writeFileSync(path.join(outDir, 'reconciliation.md'), reconciliationMd(reconciliation), 'utf8');
  console.log(
    JSON.stringify({
      snapshot: snap.id,
      sources: sources.length,
      verified: reconciliation.combined.verifiedSources,
      urlOnly: reconciliation.combined.urlOnlySources,
      uses: uses.length,
      usesByDomain,
      rejected: rejected.length,
      unattributed: unattributed.length,
      seedFieldMismatches: seedFieldMismatches.length,
    }),
  );
}

function countBy(xs: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const x of [...xs].sort(cmp)) o[x] = (o[x] ?? 0) + 1;
  return o;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function reconciliationMd(r: any): string {
  const L: string[] = [];
  const kv = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ');
  L.push(`# EX-REF04 과거 근거자료 가져오기 대조`, '');
  L.push(`스냅샷 ${r.snapshot.id} (얼린 시각 ${r.snapshot.capturedAt ?? '모름'})`, '');
  L.push('## 입력', ...r.snapshot.inputs.map((i: { name: string; sha256: string }) => `- ${i.name}: ${i.sha256}`), '');
  L.push('## 시드 목록(운동만)');
  L.push(`- 출처 ${r.seed.entries}개 · 쓰임 ${r.seed.rawUses}건(확인일 있는 쓰임 ${r.seed.usesWithAccessedAt}건) · 서로 다른 링크 ${r.seed.distinctUrls}개`, '');
  L.push('## 운동 검수 기록');
  L.push(`- 기록 ${r.exercise.records}개 · 링크 자리 ${r.exercise.urlOccurrences}곳 · 서로 다른 링크 ${r.exercise.distinctUrls}개`);
  L.push(`- 검수 · 링크 짝 ${r.exercise.reviewUrlPairs}개(링크 있는 검수 ${r.exercise.reviewsWithUrls}개)`);
  L.push(`- 시드에 없는 짝 ${r.exercise.pairsNotInSeed.count}개 · 시드에 없는 링크 ${r.exercise.urlsNotInSeed.count}개`);
  for (const u of r.exercise.urlsNotInSeed.urls) L.push(`  - ${u}`);
  L.push('');
  L.push('## 메커니즘 검수 기록');
  L.push(`- 기록 ${r.mechanics.records}개 · 링크 자리 ${r.mechanics.urlOccurrences}곳 · 서로 다른 링크 ${r.mechanics.distinctUrls}개`);
  L.push(`- 검수 · 링크 짝 ${r.mechanics.reviewUrlPairs}개(링크 있는 검수 ${r.mechanics.reviewsWithUrls}개)`);
  L.push(`- 이관 목록 쓰임 ${r.mechanics.handoffUses}건 → 짝 ${r.mechanics.handoffPairs}개, 그 가운데 기록에도 있는 짝 ${r.mechanics.handoffPairsAlsoInRecords}개`);
  for (const p of r.mechanics.handoffPairsOnlyInHandoff) L.push(`  - 이관 목록에만: ${p.reviewId} ${p.url}`);
  L.push('');
  const c = r.combined;
  L.push('## 합친 결과');
  L.push(`- 링크 글 ${c.inputUrlStrings}개(받은 것 ${c.acceptedUrlStrings}) · 정규화한 서로 다른 링크 ${c.distinctNormalizedUrls}개`);
  L.push(`- 같은 자료로 묶은 출처 ${c.logicalSources}개: 공식 서지 확인 ${c.verifiedSources}개(제목 있음 ${c.verifiedSourcesWithTitle}, 준비된 서지로만 ${c.verifiedSourcesFromPreparedOnly}) · 링크만 ${c.urlOnlySources}개(시드 제목만 있는 것 ${c.sourcesWithSeedTitleOnly})`);
  L.push(`- 여러 링크가 한 출처로 묶인 것 ${c.aliasGroups.length}개`);
  for (const g of c.aliasGroups) L.push(`  - ${g.sourceKey}: ${g.urls.join(' | ')}`);
  if (c.sourceConflicts.length) L.push(`- 번호 충돌 ${c.sourceConflicts.length}개: ${c.sourceConflicts.map((x: { sourceKey: string }) => x.sourceKey).join(', ')}`);
  if (c.unverifiedDoiCandidates.length) L.push(`- 공식 확인 못 한 DOI 후보(묶지 않음): ${c.unverifiedDoiCandidates.map((x: { dois: string[] }) => x.dois.join(', ')).join('; ')}`);
  L.push(`- 자료 종류 제안: ${kv(c.kindSuggestions)}`);
  L.push(`- 사이트 갈래: ${kv(c.hostClasses)}`);
  L.push(`- 쓰임 ${c.uses}건(${kv(c.usesByDomain)}) · 확인일 있음 ${c.usesWithConsultedOn} · 기록 시각 있음 ${c.usesWithRecordedAt} · 한국어 메모 있음 ${c.usesWithKoreanContext} · 메모 없음 ${c.usesWithoutContext} · 항목 번호 없음 ${c.usesWithoutItemId}`);
  L.push(`- 가져온 곳 조합: ${kv(c.usesByOriginSet)}`);
  L.push(`- 쓴 곳 제안: ${kv(c.purposeSuggestions)}`);
  L.push(`- 같은 검수 · 같은 출처를 다른 링크로 적어 쓰임 하나로 합친 것 ${c.aliasMergedUses.mergedUses}건(합쳐진 링크 쓰임 ${c.aliasMergedUses.absorbedLinkUses}건, 합치기 전 ${c.aliasMergedUses.perLinkUsesBeforeMerge}건)`);
  for (const a of c.aliasMergedUses.list) L.push(`  - ${a.reviewId} ${a.sourceKey}: ${a.urls.join(' | ')}`);
  L.push(`- 보류(재확인 뒤 등록) ${c.usesOnHold.length}건`);
  for (const h of c.usesOnHold) L.push(`  - ${h.reviewId} ${h.url}: ${h.reason}`);
  L.push('');
  L.push(`## 받지 않은 링크 ${r.rejected.length}건`);
  for (const x of r.rejected) L.push(`- ${x.reason}: ${x.where}`);
  L.push('');
  L.push(`## 특정 검수 항목에 붙지 않은 링크(가져오지 않음) ${r.unattributed.length}건`);
  for (const x of r.unattributed) {
    const pair = x.reviewId ? ` · 검수 ${x.reviewId}${x.pairInImport ? ' (이 검수 · 링크 짝은 가져오기에 있음)' : ' (이 검수 · 링크 짝은 가져오기에 없음)'}` : '';
    L.push(`- ${x.where}${pair}${x.coveredByImport ? ' (같은 링크가 검수 기록에서 가져와짐)' : ''}: ${x.url} — ${x.reason}`);
  }
  L.push('');
  L.push(`## 시드 필드가 지금 기록과 안 맞는 것 ${r.seedFieldMismatches.length}건`);
  for (const x of r.seedFieldMismatches)
    L.push(`- ${x.reviewId} ${x.seedRef} '${x.field}' ${x.url} → ${x.pairInRecords ? `기록에는 ${x.recordPaths.join(', ')} 에 있음` : '기록에 이 검수 · 링크 짝이 없음'}`);
  L.push('');
  L.push('## 메모', ...r.notes.map((n: string) => `- ${n}`), '');
  return L.join('\n');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ───────── 한국어 칸 틀(ko-stub) ───────── */

type KoFile = {
  sources: Record<string, { kind: SourceKind | null; summaryKo: string | null; summaryBasis: SummaryBasis | null }>;
  uses: Record<
    string,
    { purpose: Purpose; purposeNote: string | null; applicationKo: string | null; limitationsKo: string | null; reading: Reading; readingNote: string | null; releaseHold?: boolean }
  >;
};

function loadSkeleton(file: string): Skeleton {
  const v = readJson(file);
  if (!isObj(v) || v.kind !== 'review-evidence-import-skeleton') throw new Error('skeleton 파일 모양이 맞지 않아요.');
  const sk = v as unknown as Skeleton;
  /* 합치기 전 모양(링크 하나 = 쓰임 하나)의 skeleton 도 읽는다 — 그때는 쓰임 열쇠가 곧 조각 열쇠 */
  for (const u of sk.uses) {
    if (!Array.isArray(u.memberKeys) || !u.memberKeys.length) u.memberKeys = [u.useKey];
    if (!Array.isArray(u.otherCitedUrls)) u.otherCitedUrls = [];
  }
  return sk;
}

function cmdKoStub(opts: Record<string, string>) {
  const sk = loadSkeleton(need(opts, 'skeleton'));
  const ko: KoFile = { sources: {}, uses: {} };
  for (const s of sk.sources) ko.sources[s.sourceKey] = { kind: s.kindSuggestion, summaryKo: null, summaryBasis: null };
  for (const u of sk.uses)
    ko.uses[u.useKey] = { purpose: u.purposeSuggestion, purposeNote: null, applicationKo: null, limitationsKo: null, reading: 'unknown', readingNote: null };
  writeJson(need(opts, 'out'), ko);
  console.log(JSON.stringify({ sources: Object.keys(ko.sources).length, uses: Object.keys(ko.uses).length }));
}

/* ───────── 가져오기 묶음(manifest) ───────── */

const MAX_CHUNK_RECORDS = Math.min(100, MAX_IMPORT_RECORDS);
const MAX_CHUNK_BYTES = 600 * 1024;

function koOf(raw: Json): { ko: KoFile; issues: string[] } {
  const issues: string[] = [];
  if (!isObj(raw) || !isObj(raw.sources) || !isObj(raw.uses)) throw new Error('ko 파일은 { sources: {}, uses: {} } 모양이어야 해요.');
  const ko: KoFile = { sources: {}, uses: {} };
  for (const [k, v] of Object.entries(raw.sources)) {
    if (!isObj(v)) {
      issues.push(`sources.${k}: 묶음이 아님`);
      continue;
    }
    const kind = v.kind === null || v.kind === undefined ? null : (SOURCE_KINDS as readonly string[]).includes(v.kind as string) ? (v.kind as SourceKind) : null;
    if (v.kind && !kind) issues.push(`sources.${k}.kind: 모르는 값 ${String(v.kind)}`);
    const basis = v.summaryBasis === null || v.summaryBasis === undefined ? null : (SUMMARY_BASIS as readonly string[]).includes(v.summaryBasis as string) ? (v.summaryBasis as SummaryBasis) : null;
    if (v.summaryBasis && !basis) issues.push(`sources.${k}.summaryBasis: 모르는 값`);
    ko.sources[k] = { kind, summaryKo: str(v.summaryKo), summaryBasis: basis };
  }
  for (const [k, v] of Object.entries(raw.uses)) {
    if (!isObj(v)) {
      issues.push(`uses.${k}: 묶음이 아님`);
      continue;
    }
    const purpose = (PURPOSES as readonly string[]).includes(v.purpose as string) ? (v.purpose as Purpose) : null;
    if (!purpose) issues.push(`uses.${k}.purpose: 모르는 값 ${String(v.purpose)}`);
    const reading = (READING as readonly string[]).includes(v.reading as string) ? (v.reading as Reading) : 'unknown';
    if (v.reading !== undefined && v.reading !== null && reading !== v.reading) issues.push(`uses.${k}.reading: 모르는 값`);
    ko.uses[k] = {
      purpose: purpose ?? 'other',
      purposeNote: str(v.purposeNote),
      applicationKo: str(v.applicationKo),
      limitationsKo: str(v.limitationsKo),
      reading,
      readingNote: str(v.readingNote),
      releaseHold: v.releaseHold === true,
    };
  }
  return { ko, issues };
}

type KoUse = KoFile['uses'][string];
const READING_STRENGTH: Reading[] = ['full-text', 'partial', 'abstract', 'metadata-only', 'unknown'];
const MAX_USE_TEXT = 800;

/** 글을 문장으로 나눈다(마침표 · 물음표 · 느낌표 · 줄바꿈 뒤) */
const sentencesOf = (t: string) =>
  t
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((x) => x.trim())
    .filter(Boolean);

/** 여러 조각의 글을 하나로 — 같은 글 · 같은 문장은 한 번만, 한도를 넘는 문장은 뺀다 */
function joinTexts(texts: (string | null)[], max: number): { text: string | null; dropped: number } {
  const out: string[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let len = 0;
  for (const t of uniq(texts.filter((x): x is string => !!x)))
    for (const sen of sentencesOf(t)) {
      if (seen.has(sen)) continue;
      seen.add(sen);
      const add = codePoints(sen).length + (out.length ? 1 : 0);
      if (len + add > max) {
        dropped++;
        continue;
      }
      out.push(sen);
      len += add;
    }
  return { text: out.length ? out.join(' ') : null, dropped };
}

/**
 * 합친 쓰임의 한국어 칸 — 새 열쇠로 적힌 것이 있으면 그것, 없으면 조각(예전 열쇠)들의 것을 합친다.
 * 쓴 곳 = 조각에서 가장 많은 것(같으면 앞 조각), 적용 · 한계 = 서로 다른 글을 이어 붙임, 읽은 범위 = 가장 깊은 것과 그 메모.
 */
function koForUse(u: SkeletonUse, ko: KoFile): { kU: KoUse | null; from: 'new-key' | 'members' | 'none'; members: number; dropped: number } {
  if (ko.uses[u.useKey]) return { kU: ko.uses[u.useKey], from: 'new-key', members: 0, dropped: 0 };
  const ms = u.memberKeys.map((k) => ko.uses[k]).filter((x): x is KoUse => !!x);
  if (!ms.length) return { kU: null, from: 'none', members: 0, dropped: 0 };
  if (ms.length === 1) return { kU: ms[0], from: 'members', members: 1, dropped: 0 };
  const count = new Map<Purpose, number>();
  for (const m of ms) count.set(m.purpose, (count.get(m.purpose) ?? 0) + 1);
  const purpose = ms.map((m) => m.purpose).sort((a, b) => count.get(b)! - count.get(a)!)[0];
  const purposeNote = ms.find((m) => m.purpose === purpose && m.purposeNote)?.purposeNote ?? null;
  const app = joinTexts(ms.map((m) => m.applicationKo), MAX_USE_TEXT);
  const lim = joinTexts(ms.map((m) => m.limitationsKo), MAX_USE_TEXT);
  const strongest = [...ms].sort((a, b) => READING_STRENGTH.indexOf(a.reading) - READING_STRENGTH.indexOf(b.reading))[0];
  return {
    kU: {
      purpose,
      purposeNote,
      applicationKo: app.text,
      limitationsKo: lim.text,
      reading: strongest.reading,
      readingNote: strongest.readingNote,
      releaseHold: ms.some((m) => m.releaseHold),
    },
    from: 'members',
    members: ms.length,
    dropped: app.dropped + lim.dropped,
  };
}

/** 묶음 요청 번호 = 스냅샷 · 차례 · 담은 기록의 지문(내용이 바뀌면 번호도 바뀐다) */
const chunkKeyOf = (snapshotId: string, index: number, recs: ImportRecord[]) => `${snapshotId}-c${index}-${sha256Hex(canonicalJson(recs)).slice(0, 16)}`;

function cmdManifest(opts: Record<string, string>) {
  const sk = loadSkeleton(need(opts, 'skeleton'));
  const koPath = need(opts, 'ko');
  const out = need(opts, 'out');
  const { ko, issues: koIssues } = koOf(readJson(koPath));
  const recPath = path.join(path.dirname(path.resolve(need(opts, 'skeleton'))), 'reconciliation.json');
  let buildCounts: Json = null;
  try {
    const r = readJson(recPath);
    if (isObj(r) && isObj(r.snapshot) && r.snapshot.id === sk.snapshot.id) buildCounts = r;
  } catch {
    buildCounts = null;
  }

  const sources = new Map(sk.sources.map((s) => [s.sourceKey, s]));
  const snapshot = { id: sk.snapshot.id, inputs: sk.snapshot.inputs };
  const records: { useKey: string; record: ImportRecord }[] = [];
  const rejected: { useKey: string; reviewId: string; url: string; issues: Issue[] | string[] }[] = [];
  const held: { useKey: string; reviewId: string; url: string; reason: string }[] = [];
  const clipped: string[] = [];
  const missingKo: string[] = [];
  const koCombined: { useKey: string; members: number }[] = [];

  for (const u of sk.uses) {
    const s = sources.get(u.sourceKey);
    if (!s) {
      rejected.push({ useKey: u.useKey, reviewId: u.reviewId, url: u.citedUrl, issues: ['skeleton 에 출처가 없음'] });
      continue;
    }
    const k = koForUse(u, ko);
    const kU = k.kU;
    const kS = ko.sources[u.sourceKey];
    if (!kU) missingKo.push(u.useKey);
    if (k.from === 'members' && k.members > 1) koCombined.push({ useKey: u.useKey, members: k.members });
    if (k.dropped) clipped.push(`${u.useKey}: 조각 글을 합치며 한도를 넘는 문장 ${k.dropped}개를 뺌`);
    if (u.hold && !kU?.releaseHold) {
      held.push({ useKey: u.useKey, reviewId: u.reviewId, url: u.citedUrl, reason: u.hold.reason });
      continue;
    }
    const cited = checkEvidenceUrl(u.citedUrl);
    const altUrls = s.verifiedBy
      ? s.urls.filter((x) => {
          const c = checkEvidenceUrl(x);
          return c.ok && (!cited.ok || c.normalized !== cited.normalized);
        })
      : [];
    if (altUrls.length > 6) clipped.push(`${u.useKey}: 다른 링크 ${altUrls.length}개 → 6개`);
    let authors = s.verifiedBy ? s.authors : [];
    if (authors.length > 60) {
      clipped.push(`${u.useKey}: 저자 ${authors.length}명 → 60명`);
      authors = authors.slice(0, 60);
    }
    /* 공식 서지가 없으면 시드에 적힌 제목(적은 사람이 넣은 값, verifiedBy 없음)만 */
    let title = s.verifiedBy ? s.title : s.seedTitle;
    if (title && codePoints(title).length > 400) {
      clipped.push(`${u.useKey}: 제목 400자로 줄임`);
      title = clip(title, 400);
    }
    let itemName = u.itemName;
    if (itemName && codePoints(itemName.trim().replace(/\s+/g, ' ')).length > 120) {
      clipped.push(`${u.useKey}: 항목 이름 120자로 줄임`);
      itemName = clip(itemName.trim().replace(/\s+/g, ' '), 120);
    }
    const record: ImportRecord = {
      source: {
        url: u.citedUrl,
        altUrls: altUrls.slice(0, 6),
        kind: kS ? kS.kind : s.kindSuggestion,
        title: title ?? null,
        authors,
        container: s.verifiedBy ? s.container : null,
        year: s.verifiedBy ? s.year : null,
        identifiers: s.identifiers,
        verifiedBy: s.verifiedBy,
        summaryKo: kS?.summaryKo ?? null,
        summaryBasis: kS?.summaryKo ? kS.summaryBasis : null,
      },
      use: {
        domain: u.domain,
        reviewId: u.reviewId,
        itemId: u.itemId,
        itemName: itemName ?? null,
        purpose: kU?.purpose ?? u.purposeSuggestion,
        purposeNote: kU?.purposeNote ?? null,
        consultedOn: u.consultedOn,
        /* 과거 가져오기는 쓴 사람 쪽 시각을 모른다 */
        notedAt: null,
        applicationKo: kU?.applicationKo ?? null,
        limitationsKo: kU?.limitationsKo ?? null,
        reading: kU?.reading ?? 'unknown',
        readingNote: kU?.readingNote ?? null,
      },
      historical: { reviewer: 'yunho', origins: [...u.origins].sort(cmp), recordedAt: u.recordedAt },
    };
    const check = parseImport({ requestKey: `${snapshot.id}-validate`, snapshot, chunk: { index: 0, total: 1 }, records: [record] });
    if (!check.ok) rejected.push({ useKey: u.useKey, reviewId: u.reviewId, url: u.citedUrl, issues: check.issues });
    else records.push({ useKey: u.useKey, record });
  }

  /* 묶음 나누기 — 쓰임 열쇠 차례로 줄 세운 뒤 기록 100개 · 600KB 아래로 채운다(같은 입력 → 같은 묶음) */
  const bodyOf = (index: number, total: number, recs: ImportRecord[]) => ({
    requestKey: chunkKeyOf(snapshot.id, index, recs),
    snapshot,
    chunk: { index, total },
    records: recs,
  });
  records.sort((a, b) => cmp(a.useKey, b.useKey));
  const groups: { useKeys: string[]; records: ImportRecord[] }[] = [];
  let cur: { useKeys: string[]; records: ImportRecord[] } = { useKeys: [], records: [] };
  for (const r of records) {
    const trial = [...cur.records, r.record];
    const size = Buffer.byteLength(JSON.stringify(bodyOf(999, 999, trial)), 'utf8');
    if (cur.records.length && (trial.length > MAX_CHUNK_RECORDS || size > MAX_CHUNK_BYTES)) {
      groups.push(cur);
      cur = { useKeys: [], records: [] };
    }
    cur.useKeys.push(r.useKey);
    cur.records.push(r.record);
  }
  if (cur.records.length) groups.push(cur);
  const total = groups.length;
  const chunkIssues: { index: number; issues: Issue[] }[] = [];
  const chunks = groups.map((g, index) => {
    const body = bodyOf(index, total, g.records);
    if (!REQUEST_KEY.test(body.requestKey)) throw new Error(`요청 번호 모양이 맞지 않아요: ${body.requestKey}`);
    const p = parseImport(body);
    if (!p.ok) chunkIssues.push({ index, issues: p.issues });
    return body;
  });
  /* 묶음마다 크기 · 들어간 쓰임 — 본문(chunks)에는 넣지 않는다(가져오기 검사가 모르는 칸을 거절) */
  const chunkIndex = chunks.map((c, index) => ({ index, requestKey: c.requestKey, records: c.records.length, bytes: Buffer.byteLength(JSON.stringify(c), 'utf8'), useKeys: groups[index].useKeys }));
  if (chunkIssues.length) throw new Error(`묶음 검사 실패: ${JSON.stringify(chunkIssues).slice(0, 2000)}`);

  const flat = records.map((r) => r.record);
  const manifest = {
    kind: 'review-evidence-import-manifest',
    snapshot,
    /* 각 묶음 = 그대로 보내는 가져오기 요청 본문(requestKey · snapshot · chunk · records) */
    chunks,
    chunkIndex,
    rejected,
    held,
    reconciliation: {
      build: buildCounts && isObj(buildCounts) ? { seed: buildCounts.seed, exercise: buildCounts.exercise, mechanics: buildCounts.mechanics, combined: buildCounts.combined } : null,
      skeletonUses: sk.uses.length,
      skeletonSources: sk.sources.length,
      records: flat.length,
      recordsWithApplicationKo: flat.filter((r) => r.use.applicationKo).length,
      recordsWithLimitationsKo: flat.filter((r) => r.use.limitationsKo).length,
      recordsWithSummary: flat.filter((r) => r.source.summaryKo).length,
      recordsWithConsultedOn: flat.filter((r) => r.use.consultedOn).length,
      recordsVerified: flat.filter((r) => r.source.verifiedBy).length,
      invalidRecords: rejected.length,
      heldRecords: held.length,
      chunks: chunks.length,
      chunkBytes: chunkIndex.map((c) => c.bytes),
      koFileIssues: koIssues,
      koMissingUses: missingKo.length,
      koMissingUseKeys: missingKo,
      koCombinedFromMembers: koCombined,
      aliasMergedUses: sk.uses.filter((u) => u.memberKeys.length > 1).length,
      clipped,
    },
  };
  writeJson(out, manifest);
  console.log(JSON.stringify({ out, records: flat.length, invalid: rejected.length, held: held.length, chunks: chunks.length, maxChunkBytes: Math.max(0, ...chunkIndex.map((c) => c.bytes)) }));
}

/* ───────── 두 스냅샷 사이 바뀐 것(delta) ───────── */

function pairsOfUse(u: SkeletonUse): string[] {
  return uniq(
    [u.citedUrl, ...u.otherCitedUrls].map((x) => {
      const c = checkEvidenceUrl(x);
      return `${u.domain}|${u.reviewId}|${c.ok ? c.normalized : x}`;
    }),
  ).sort(cmp);
}

function cmdDelta(opts: Record<string, string>) {
  const base = loadSkeleton(need(opts, 'base'));
  const current = loadSkeleton(need(opts, 'current'));
  const out = need(opts, 'out');
  /* 옛 skeleton(링크 하나 = 쓰임 하나)도 견줄 수 있게 쓰임 열쇠와 조각 열쇠 모두로 찾는다 */
  const baseByKey = new Map<string, SkeletonUse[]>();
  for (const u of base.uses)
    for (const k of uniq([u.useKey, ...u.memberKeys])) {
      const list = baseByKey.get(k) ?? [];
      if (!list.includes(u)) list.push(u);
      baseByKey.set(k, list);
    }
  const short = (u: SkeletonUse) => ({ useKey: u.useKey, domain: u.domain, reviewId: u.reviewId, sourceKey: u.sourceKey, urls: [u.citedUrl, ...u.otherCitedUrls] });
  const textsOf = (us: SkeletonUse[]) => uniq(us.flatMap((u) => u.contexts.map((c) => c.text))).sort(cmp);
  const maxOf = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort(cmp).pop() ?? null;
  const minOf = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort(cmp)[0] ?? null;

  const newUses: ReturnType<typeof short>[] = [];
  const changedUses: (ReturnType<typeof short> & { changes: string[]; addedContexts: number; removedContexts: number; baseKeys: string[] })[] = [];
  for (const u of current.uses) {
    const matched = uniq([u.useKey, ...u.memberKeys].flatMap((k) => baseByKey.get(k) ?? []));
    if (!matched.length) {
      newUses.push(short(u));
      continue;
    }
    const changes: string[] = [];
    const before = textsOf(matched);
    const after = textsOf([u]);
    const added = after.filter((t) => !before.includes(t)).length;
    const removed = before.filter((t) => !after.includes(t)).length;
    if (added || removed) changes.push('contexts');
    const bc = maxOf(matched.map((m) => m.consultedOn));
    const br = minOf(matched.map((m) => m.recordedAt));
    if (bc !== u.consultedOn) changes.push(`consultedOn ${bc ?? '없음'} → ${u.consultedOn ?? '없음'}`);
    if (br !== u.recordedAt) changes.push(`recordedAt ${br ?? '없음'} → ${u.recordedAt ?? '없음'}`);
    const bp = uniq(matched.flatMap(pairsOfUse)).sort(cmp);
    if (bp.join('\n') !== pairsOfUse(u).join('\n')) changes.push('citedUrls');
    if (changes.length) changedUses.push({ ...short(u), changes, addedContexts: added, removedContexts: removed, baseKeys: matched.map((m) => m.useKey) });
  }
  const curPairs = new Set(current.uses.flatMap(pairsOfUse));
  const basePairs = new Set(base.uses.flatMap(pairsOfUse));
  const pairObj = (p: string) => {
    const [domain, reviewId, ...rest] = p.split('|');
    return { domain, reviewId, normalizedUrl: rest.join('|') };
  };
  const addedPairs = [...curPairs].filter((p) => !basePairs.has(p)).sort(cmp).map(pairObj);
  const removedPairs = [...basePairs].filter((p) => !curPairs.has(p)).sort(cmp).map(pairObj);
  const curSources = new Set(current.sources.map((x) => x.sourceKey));
  const baseSources = new Set(base.sources.map((x) => x.sourceKey));
  const delta = {
    kind: 'review-evidence-import-delta',
    base: { snapshotId: base.snapshot.id, capturedAt: base.snapshot.capturedAt, uses: base.uses.length, sources: base.sources.length },
    current: { snapshotId: current.snapshot.id, capturedAt: current.snapshot.capturedAt, uses: current.uses.length, sources: current.sources.length },
    inputsChanged: current.snapshot.inputs
      .filter((i) => base.snapshot.inputs.find((b) => b.name === i.name)?.sha256 !== i.sha256)
      .map((i) => i.name),
    counts: {
      newUses: newUses.length,
      changedUses: changedUses.length,
      addedPairs: addedPairs.length,
      removedPairs: removedPairs.length,
      newSources: [...curSources].filter((k) => !baseSources.has(k)).length,
      removedSources: [...baseSources].filter((k) => !curSources.has(k)).length,
    },
    newUses,
    changedUses,
    addedPairs,
    removedPairs,
    newSources: [...curSources].filter((k) => !baseSources.has(k)).sort(cmp),
    removedSources: [...baseSources].filter((k) => !curSources.has(k)).sort(cmp),
  };
  writeJson(out, delta);
  console.log(JSON.stringify({ out, base: base.snapshot.id, current: current.snapshot.id, ...delta.counts }));
}

/* ───────── 실행 ───────── */

async function main() {
  const { cmd, opts } = args(process.argv.slice(2));
  if (cmd === 'fetch-ncbi') await cmdFetchNcbi(opts);
  else if (cmd === 'build') cmdBuild(opts);
  else if (cmd === 'ko-stub') cmdKoStub(opts);
  else if (cmd === 'manifest') cmdManifest(opts);
  else if (cmd === 'delta') cmdDelta(opts);
  else {
    console.error('쓰는 법: fetch-ncbi --snapshot <dir> --out <file> | build --snapshot <dir> [--ncbi <file>] --out <dir> | ko-stub --skeleton <file> --out <file> | manifest --skeleton <file> --ko <file> --out <file> | delta --base <skeleton> --current <skeleton> --out <file>');
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
