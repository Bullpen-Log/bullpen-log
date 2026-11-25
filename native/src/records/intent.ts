import type { RecordItem } from '@/lib/records/day-records';

/**
 * 기록 탭으로 가는 하나의 약속(PITCH-RECORDS-MINIMAL01 R2) — 홈 · 투구 · 트레이닝 · 컨디션 · 코치 · 알림 · 옛 주소가 모두 이 꼴로 기록 탭을 연다.
 * 주소 '/records?date=YYYY-MM-DD&cat=pitch&id=pitch:<id>&recent=1' 하나로 실어 나르고(탭 콜백 · leaveTo · 푸시 · 웹 다리가 다 주소를 쓴다),
 * 껍데기(app/index.tsx)가 이 파일로 읽어 걸러 기록 탭에 남긴다(shell/tab-intent openRecordsAt).
 * - 날짜는 진짜 날짜 키만, 묶음은 넷 중 하나(아니면 전체), 기록 번호는 기록 탭 목록의 꼴(종류:번호)만. 묶음과 다른 종류의 기록 번호는 버린다.
 * - recent: 날짜를 안 준 '전체 기록 · 히스토리' 입구 — 그 묶음의 가장 최근 기록이 있는 날(오늘까지)로. 없으면 오늘.
 * - 옛 주소: '/videos?view=log'(투구 기록 달력) · 쿼리 없는 '/pitch-log/<날짜>'(그날 투구 읽기)는 기록 탭 투구로. 쿼리가 있는
 *   '/pitch-log/<날짜>?view=records'도 조회다. '?drill=…'처럼 입력을 채우는 주소는 원래 흐름에 둔다.
 * 순수 함수만 — 자체 시험 scripts/native-records-intent-selftest.mts.
 */
export const RECORDS_PATH = '/records';

export type RecordsCategory = 'all' | 'pitch' | 'training' | 'condition';
export const RECORDS_CATEGORIES: readonly RecordsCategory[] = ['all', 'pitch', 'training', 'condition'];

export type RecordsIntent = { date: string | null; category: RecordsCategory; recordId: string | null; recent: boolean };

const KIND_CATEGORY: Record<RecordItem['kind'], Exclude<RecordsCategory, 'all'>> = {
  pitch: 'pitch',
  training: 'training',
  armcare: 'training',
  drill: 'training',
  checkin: 'condition',
};

/** 'YYYY-MM-DD' 이고 실제로 있는 날(2월 30일 같은 것은 아님) */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === v;
}

/** 기록 탭 목록의 번호 꼴(lib/records/day-records.ts) — 'pitch:<uuid>' · 'training:<id 또는 날짜>' · 'armcare:<날짜>' · 'drill:<날짜>' · 'checkin:<id>' */
const RECORD_ID = /^(pitch|training|armcare|drill|checkin):([A-Za-z0-9_-]{1,64})$/;

export function categoryOfRecordId(id: string): Exclude<RecordsCategory, 'all'> | null {
  const m = RECORD_ID.exec(id);
  return m ? KIND_CATEGORY[m[1] as RecordItem['kind']] : null;
}

/** 받은 값을 거른 부탁 — 모르는 값은 버리고(오늘 · 전체로) 화면이 죽지 않게 */
export function recordsIntent(raw: { date?: unknown; category?: unknown; recordId?: unknown; recent?: unknown } = {}): RecordsIntent {
  const date = isDateKey(raw.date) ? raw.date : null;
  const category = RECORDS_CATEGORIES.includes(raw.category as RecordsCategory) ? (raw.category as RecordsCategory) : 'all';
  let recordId = typeof raw.recordId === 'string' && RECORD_ID.test(raw.recordId) ? raw.recordId : null;
  /* 투구 묶음으로 열면서 트레이닝 기록을 가리키면 그 기록은 버린다(묶음을 몰래 바꾸지 않는다) */
  if (recordId && category !== 'all' && categoryOfRecordId(recordId) !== category) recordId = null;
  return { date, category, recordId, recent: raw.recent === true && date == null };
}

/** 부탁 → 주소(같은 부탁은 같은 주소) */
export function recordsHref(raw: { date?: string | null; category?: RecordsCategory; recordId?: string | null; recent?: boolean } = {}): string {
  const i = recordsIntent(raw);
  const q: string[] = [];
  if (i.date) q.push(`date=${i.date}`);
  if (i.category !== 'all') q.push(`cat=${i.category}`);
  if (i.recordId) q.push(`id=${encodeURIComponent(i.recordId)}`);
  if (i.recent) q.push('recent=1');
  return q.length ? `${RECORDS_PATH}?${q.join('&')}` : RECORDS_PATH;
}

/** 주소 → 부탁. 기록 탭으로 갈 주소가 아니면 null(껍데기가 원래 길로 보낸다) */
export function recordsIntentOfHref(href: string): RecordsIntent | null {
  if (typeof href !== 'string' || !href.startsWith('/')) return null;
  const [rawPath, query = ''] = href.split('?', 2);
  const path = rawPath.replace(/\/+$/, '') || '/';
  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(query);
  } catch {
    sp = new URLSearchParams();
  }
  if (path === RECORDS_PATH) {
    let id: string | null = sp.get('id');
    try {
      id = id == null ? null : decodeURIComponent(id);
    } catch {
      id = null;
    }
    return recordsIntent({ date: sp.get('date'), category: sp.get('cat'), recordId: id, recent: sp.get('recent') === '1' });
  }
  /* 옛 투구 기록 달력(?view=log) — 날짜를 주면 그날, 아니면 최근 투구 */
  if (path === '/videos' && sp.get('view') === 'log') {
    const date = sp.get('date');
    return recordsIntent({ date, category: 'pitch', recent: !isDateKey(date) });
  }
  /* 그날 투구 읽기 — 웹에서 같이 쓰는 입력 경로는 명시적으로 view=records를 붙인다. */
  const day = /^\/pitch-log\/(\d{4}-\d{2}-\d{2})$/.exec(path)?.[1];
  if (day && (!query || query === 'view=records')) return isDateKey(day) ? recordsIntent({ date: day, category: 'pitch' }) : recordsIntent({ category: 'pitch', recent: true });
  return null;
}

/** 기록이 그 묶음에 드는가(목록 거르기와 같은 규칙 — records/model.ts filterOf) */
export const inCategory = (r: Pick<RecordItem, 'kind'>, c: RecordsCategory) => c === 'all' || KIND_CATEGORY[r.kind] === c;

/** '최근' 입구의 날 — 그 묶음의 기록이 있는 가장 최근 날(오늘까지), 없으면 오늘 */
export function resolveRecentDate(items: readonly Pick<RecordItem, 'kind' | 'date'>[], category: RecordsCategory, today: string): string {
  let best = '';
  for (const r of items) if (r.date <= today && r.date > best && inCategory(r, category)) best = r.date;
  return best || today;
}

/** 가리킨 기록의 날 — 날짜를 안 준 기록 번호 부탁이면 목록에서 찾는다(없으면 null) */
export function dateOfRecord(items: readonly Pick<RecordItem, 'id' | 'date'>[], id: string): string | null {
  return items.find((r) => r.id === id)?.date ?? null;
}

/** 기록 탭 목록 번호 → 실제 투구 기록 번호('pitch:<uuid>' → '<uuid>'). 다른 종류면 null */
export function pitchLogIdOf(recordId: string): string | null {
  const m = RECORD_ID.exec(recordId);
  return m && m[1] === 'pitch' ? m[2] : null;
}
