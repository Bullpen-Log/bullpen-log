import type { BibItem, Catalog, Category, Decision, Entry, Interval, Kind, Rights, SectionKind } from '@/lib/admin-references/schema';
import { CATEGORIES, KINDS } from '@/lib/admin-references/schema';

/**
 * EX-REF02 — 참고자료 화면에 보일 값(순수). 확인한 범위는 '받은 기록 그대로' 센다 — 목록에 들어 있다는 것만으로
 * 읽었다고 하지 않는다. 같은 영상 구간이 겹쳐 적혀도 한 번만 센다.
 */

export const CATEGORY_LABEL: Record<Category, string> = {
  strength: '근력',
  power: '파워',
  mobility: '가동성',
  pitching: '투구',
  recovery: '회복',
  programming: '프로그램 설계',
  assessment: '평가',
  sources: '출처 · 근거',
};

export const KIND_LABEL: Record<Kind, string> = { document: '문서', video: '영상', research: '연구' };

export const RIGHTS_LABEL: Record<Rights, string> = {
  /* 전체를 옮긴 글일 수도 있다 — '요약만'이라고 하지 않는다. 원본 파일만 제공하지 않는다 */
  'private-summary': '비공개 옮김 · 해설 · 요약(원본 파일 제공 안 함)',
  'licensed-private': '이용 허락 받음(비공개)',
  pending: '이용 허락 확인 중',
};

const AVAILABILITY_LABEL: Record<string, string> = {
  available: '원본 보관됨',
  stored: '원본 보관됨',
  pending: '원본 확인 중',
  missing: '원본 없음',
  unavailable: '원본 없음',
  restricted: '열람 제한',
  external: '외부 자료',
};

const REVIEW_LABEL: Record<string, string> = {
  unread: '아직 안 읽음',
  pending: '검토 대기',
  queued: '검토 대기',
  in_progress: '읽는 중',
  reading: '읽는 중',
  partial: '일부 검토',
  reviewed: '검토 완료',
  complete: '검토 완료',
  pending_audio: '음성 확인 대기',
  pending_ocr: '글자 인식 확인 대기',
  blocked: '검토 막힘',
};

const BIB_KIND_LABEL: Record<string, string> = {
  research: '연구',
  original_study: '원저 연구',
  systematic_review: '체계적 문헌고찰',
  meta_analysis: '메타분석',
  review: '문헌고찰',
  guideline: '지침 · 학회 자료',
  textbook: '교재',
  training_material: '코칭 · 훈련 자료',
  regulatory: '규제 · 공식 안내',
  thesis: '학위 논문',
};

const METADATA_LABEL: Record<string, string> = {
  pending: '서지정보 확인 필요',
  'official-page-checked': '공식 페이지 확인',
  verified: '서지정보 확인됨',
  failed: '서지정보 확인 실패',
};

export const DECISION_LABEL: Record<Decision, string> = {
  retain: '그대로 유지',
  qualify: '조건을 달아 유지',
  update: '최신 근거로 고침',
  insufficient: '근거 부족',
};

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  translation: '원문 옮김',
  note: '해설',
  table: '표',
  limitation: '한계',
};

/** 모르는 상태 값은 원래 낱말 대신 '상태 미정'으로(내부 값을 화면 글로 쓰지 않는다) */
export const availabilityLabel = (v: string) => AVAILABILITY_LABEL[v] ?? '상태 미정';
export const reviewLabel = (v: string) => REVIEW_LABEL[v] ?? '상태 미정';
export const bibKindLabel = (v: string) => BIB_KIND_LABEL[v] ?? '분류 확인 필요';
export const metadataLabel = (v: string) => METADATA_LABEL[v] ?? '서지정보 확인 필요';

/* ─────────────────────────── 확인한 범위 ─────────────────────────── */

/** 겹친 구간을 합쳐 길이(초) — [0,10] 과 [5,15] 는 15초 */
export function mergedSeconds(list: readonly Interval[]): number {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: Interval | null = null;
  for (const [a, b] of sorted) {
    if (!cur) cur = [a, b];
    else if (a <= cur[1]) cur = [cur[0], Math.max(cur[1], b)];
    else {
      total += cur[1] - cur[0];
      cur = [a, b];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

export type EntryCoverage = {
  pageCount: number | null;
  textPages: number;
  visualPages: number;
  /** 글이든 그림이든 한 번이라도 확인한 쪽 */
  reviewedPages: number;
  /** 글로 확인하지 못한 쪽(그림만 본 쪽 포함) — 글자 인식(OCR) · 다시 읽기가 남은 쪽 */
  textPending: number | null;
  durationSeconds: number | null;
  videoSeconds: number;
  audioSeconds: number;
  videoPending: number | null;
  audioPending: number | null;
};

export function coverageOf(e: Pick<Entry, 'pageCount' | 'durationSeconds' | 'coverage'>): EntryCoverage {
  const text = new Set(e.coverage.textPages);
  const visual = new Set(e.coverage.visualPages);
  const union = new Set([...text, ...visual]);
  const video = mergedSeconds(e.coverage.videoIntervals);
  const audio = mergedSeconds(e.coverage.audioIntervals);
  return {
    pageCount: e.pageCount,
    textPages: text.size,
    visualPages: visual.size,
    reviewedPages: union.size,
    textPending: e.pageCount == null ? null : e.pageCount - text.size,
    durationSeconds: e.durationSeconds,
    videoSeconds: video,
    audioSeconds: audio,
    videoPending: e.durationSeconds == null ? null : Math.max(0, e.durationSeconds - video),
    audioPending: e.durationSeconds == null ? null : Math.max(0, e.durationSeconds - audio),
  };
}

export type Totals = {
  entries: number;
  pagesKnown: number;
  pagesReviewed: number;
  textPagesReviewed: number;
  pageCountUnknown: number;
  durationKnown: number;
  videoReviewed: number;
  audioReviewed: number;
  durationUnknown: number;
};

/** 모든 항목 — 읽지 않은 · 확인 중인 것도 센다 */
export function totalsOf(entries: readonly Entry[]): Totals {
  const t: Totals = { entries: entries.length, pagesKnown: 0, pagesReviewed: 0, textPagesReviewed: 0, pageCountUnknown: 0, durationKnown: 0, videoReviewed: 0, audioReviewed: 0, durationUnknown: 0 };
  for (const e of entries) {
    const c = coverageOf(e);
    /* 쪽 수를 아는 자료는 종류와 상관없이 센다. 쪽 수를 모르는 문서 · 연구는 '모름'으로 따로 센다(0쪽으로 치지 않는다) */
    if (c.pageCount != null) t.pagesKnown += c.pageCount;
    else if (e.kind !== 'video') t.pageCountUnknown++;
    t.pagesReviewed += c.reviewedPages;
    t.textPagesReviewed += c.textPages;
    /* 길이도 같다 — 길이를 모르는 영상은 '모름'으로 */
    if (c.durationSeconds != null) t.durationKnown += c.durationSeconds;
    else if (e.kind === 'video') t.durationUnknown++;
    t.videoReviewed += c.videoSeconds;
    t.audioReviewed += c.audioSeconds;
  }
  return t;
}

/** 초 → '1시간 2분 3초' */
export function durationText(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts = [h ? `${h}시간` : '', m ? `${m}분` : '', r || (!h && !m) ? `${r}초` : ''].filter(Boolean);
  return parts.join(' ');
}

/** 초 → 'm:ss' 또는 'h:mm:ss'(영상 위치) */
export function clockText(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** 쪽 번호 묶음 → '3–5, 9쪽' */
export function pagesText(pages: readonly number[]): string {
  if (!pages.length) return '';
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const p of sorted.slice(1)) {
    if (p === prev + 1) {
      prev = p;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = p;
  }
  runs.push(start === prev ? `${start}` : `${start}–${prev}`);
  return `${runs.join(', ')}쪽`;
}

/**
 * 원문 표 칸 폭(rem) — 글 자리가 좁아도 min(한 칸에 글자가 세로로 한 자씩 서지 않게), 넓어도 max(여러 문장 칸은 줄을 바꿈), 좌우 여백 padX.
 * 표 전체 최소 폭은 칸 수 × (min + 2 × padX) 라, 화면이 그보다 좁을 때만 표를 옆으로 민다.
 */
export const TABLE_CELL_REM = { min: 7, max: 22, padX: 0.5 } as const;
export const tableMinRem = (columns: number) => Math.max(1, Math.floor(columns)) * (TABLE_CELL_REM.min + 2 * TABLE_CELL_REM.padX);

/* ─────────────────────────── 찾기 · 거르기 ─────────────────────────── */

export type Filters = { q: string; category: Category | null; kind: Kind | null; collection: string | null };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 주소의 거르기 값 — 모르는 값은 버린다 */
export function readFilters(sp: Record<string, string | string[] | undefined>, collections: readonly string[]): Filters {
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const cat = one(sp.category);
  const kind = one(sp.kind);
  const col = one(sp.collection);
  return {
    q,
    category: cat && (CATEGORIES as readonly string[]).includes(cat) ? (cat as Category) : null,
    kind: kind && (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : null,
    collection: col && collections.includes(col) ? col : null,
  };
}

function haystack(e: Entry): string {
  return [e.title, e.collection, ...e.topics, ...e.categories.map((c) => CATEGORY_LABEL[c]), e.searchText ?? ''].join('\n').toLowerCase();
}

export function filterEntries(entries: readonly Entry[], f: Filters): Entry[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (f.category && !e.categories.includes(f.category)) return false;
    if (f.kind && e.kind !== f.kind) return false;
    if (f.collection && e.collection !== f.collection) return false;
    if (words.length) {
      const h = haystack(e);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
}

export function collectionsOf(catalog: Pick<Catalog, 'entries'>): string[] {
  return [...new Set(catalog.entries.map((e) => e.collection))].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function facetCounts(entries: readonly Entry[]) {
  const category = Object.fromEntries(CATEGORIES.map((c) => [c, entries.filter((e) => e.categories.includes(c)).length])) as Record<Category, number>;
  const kind = Object.fromEntries(KINDS.map((k) => [k, entries.filter((e) => e.kind === k).length])) as Record<Kind, number>;
  return { category, kind };
}

/* ─────────────────────────── 화면으로 보내는 모양 ─────────────────────────── */

/** 목록 한 줄 — 저장소 열쇠 · 찾기용 본문은 빼고 */
export type ListItem = Omit<Entry, 'detailKey' | 'searchText'> & { coverageView: EntryCoverage };

export function listItemOf(e: Entry): ListItem {
  const { detailKey: _k, searchText: _s, ...rest } = e;
  void _k;
  void _s;
  return { ...rest, coverageView: coverageOf(e) };
}

/** 예전 운동 검수에서 모은 출처 — 이 묶음은 '검토 승인된 근거'가 아니라 그때 적어 둔 출처다(별도 묶음으로 보인다) */
export function bibliographyView(list: readonly BibItem[], q: string): BibItem[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((b) => {
    const h = [b.title ?? '', b.publisher ?? '', b.authors ?? '', ...b.uses.map((u) => u.exercise ?? '')].join('\n').toLowerCase();
    return words.every((w) => h.includes(w));
  });
}

/** 출처 메모가 주소 그대로면 보이지 않는다(같은 주소를 두 번 쓰지 않게) */
export function bibNote(note: string | null): string | null {
  if (!note) return null;
  return /^https?:\/\//i.test(note.trim()) ? null : note;
}
