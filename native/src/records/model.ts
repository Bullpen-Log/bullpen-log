import type { RecordItem } from '@/lib/records/day-records';
import { sleepQualityWord } from '@/lib/checkin';
import { shiftDateKey, weekStartKey } from '@/lib/pitch-stats';

/**
 * 기록 탭의 순수 규칙(자체 시험 native-home:test) — 거르기 · 찾기 · 시간순 · 달 칸.
 * - 거르기 넷: 전체 · 투구 · 트레이닝(운동 · 암케어 · 메커니즘 드릴) · 컨디션(체크인).
 * - 그날 기록은 최근 시각이 위(투구를 크게 보이려고 더 최근의 암케어 순서를 뒤집지 않는다), 시각을 모르는 것(암케어 · 드릴)은 맨 뒤.
 * - 찾기는 거르기와 같이 돈다 — 종류 이름 · 제목 · 메모 · 날짜('10월 27일' · '2026-10-27')에서.
 */
export type RecordFilter = 'all' | 'pitch' | 'training' | 'condition';
export const FILTERS: { value: RecordFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pitch', label: '투구' },
  { value: 'training', label: '트레이닝' },
  { value: 'condition', label: '컨디션' },
];

export const filterOf = (r: RecordItem): Exclude<RecordFilter, 'all'> =>
  r.kind === 'pitch' ? 'pitch' : r.kind === 'checkin' ? 'condition' : 'training';

export const KIND_LABEL: Record<RecordItem['kind'], string> = { pitch: '투구', training: '트레이닝', armcare: '암케어', drill: '메커니즘', checkin: '컨디션' };

/** 카드 제목 */
export function titleOf(r: RecordItem): string {
  if (r.kind === 'pitch') return r.rested ? '휴식' : r.title;
  if (r.kind === 'training') return r.title;
  if (r.kind === 'armcare') return '암케어 루틴';
  if (r.kind === 'drill') return '투구 드릴';
  return '체크인';
}

/** 간단 카드의 오른쪽 값(트레이닝 분 · 체크인 컨디션) — 모르면 null(0 으로 채우지 않는다) */
export function valueOf(r: RecordItem): { n: string; unit: string } | null {
  if (r.kind === 'training') {
    if (r.minutes != null) return { n: String(r.minutes), unit: '분' };
    return r.active ? { n: '진행 중', unit: '' } : null;
  }
  if (r.kind === 'checkin') return { n: String(r.condition), unit: '/ 10' };
  return null;
}

/** 간단 카드의 밑 한 줄 */
export function noteOf(r: RecordItem): string | null {
  if (r.kind === 'training') return r.count > 0 ? `${r.count}종목 완료` : r.active ? '이어서 할 수 있어요' : null;
  if (r.kind === 'armcare') return `${r.count}동작 완료`;
  if (r.kind === 'drill') return `드릴 ${r.count}개 완료`;
  if (r.kind === 'checkin') {
    const sleep = sleepQualityWord(r.sleepQuality);
    const parts = [sleep ? `수면 ${sleep}` : null, r.note ? '메모' : null].filter((x): x is string => x != null);
    return parts.length ? parts.join(' · ') : null;
  }
  return r.rested ? '던지지 않은 날' : null;
}

const KIND_ORDER: RecordItem['kind'][] = ['pitch', 'training', 'armcare', 'drill', 'checkin'];
/** 최근 시각 먼저, 시각 모름은 맨 뒤(그 안에서는 종류 차례) */
export function byTimeDesc(a: RecordItem, b: RecordItem): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  if (a.at && b.at) return b.at.localeCompare(a.at);
  if (a.at || b.at) return a.at ? -1 : 1;
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
}

const passes = (r: RecordItem, f: RecordFilter) => f === 'all' || filterOf(r) === f;

export function dayRecords(items: readonly RecordItem[], date: string, filter: RecordFilter): RecordItem[] {
  return items.filter((r) => r.date === date && passes(r, filter)).sort(byTimeDesc);
}

export const korDay = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;

export function searchRecords(items: readonly RecordItem[], query: string, filter: RecordFilter): RecordItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .filter((r) => passes(r, filter))
    .filter((r) => {
      const memo = r.kind === 'pitch' ? r.memo : r.kind === 'checkin' ? r.note : null;
      return `${KIND_LABEL[r.kind]} ${titleOf(r)} ${memo ?? ''} ${r.date} ${korDay(r.date)}`.toLowerCase().includes(q);
    })
    .sort(byTimeDesc);
}

/** 그날 남긴 기록 종류 수(투구 · 트레이닝 · 컨디션 — 거르기 묶음) — 날짜 칸의 점 */
export function kindsOn(items: readonly RecordItem[], date: string): number {
  return new Set(items.filter((r) => r.date === date).map(filterOf)).size;
}

/** 그 날이 든 주(월요일부터 — 홈 '이번 주'와 같은 규칙) */
export function weekOf(date: string): string[] {
  const start = weekStartKey(date);
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(start, i));
}

/** 'YYYY-MM' 의 달 칸 — 월요일부터, 앞 빈칸은 null */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 그 달 안의 같은 날짜(없으면 그 달 끝) — 달을 넘길 때 고른 날을 옮긴다 */
export function sameDayIn(month: string, date: string): string {
  const last = monthCells(month).filter(Boolean).length;
  return `${month}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, '0')}`;
}

/** 기기 시각 'HH:MM' — 날짜 넘어감과 같은 기기 기준 */
export function timeText(at: string | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
