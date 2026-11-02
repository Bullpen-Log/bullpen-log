/**
 * 비교 영상 거르기 · 기준 투구(R31 · R20 — 순수). 아는 정보만으로 거른다 — 손 · 구종 · 촬영 방향을 모르는 영상은
 * '모름'으로 따로 두고(빼지도, 맞다고 치지도 않는다).
 */
import type { ViewKey } from '~/compare/annotations';
import type { Hand, SourceRef } from '~/compare/doc';

export type SourceFilter = { hand?: Hand; pitchType?: string; view?: ViewKey; verdict?: 'good' | 'work'; date?: string };

export function matchSource(s: SourceRef, f: SourceFilter): 'yes' | 'no' | 'unknown' {
  const checks: ('yes' | 'no' | 'unknown')[] = [];
  if (f.hand) checks.push(s.hand == null ? 'unknown' : s.hand === f.hand ? 'yes' : 'no');
  if (f.pitchType) checks.push(s.pitchType == null ? 'unknown' : s.pitchType === f.pitchType ? 'yes' : 'no');
  if (f.view) checks.push(s.view == null ? 'unknown' : s.view === f.view ? 'yes' : 'no');
  if (f.verdict) checks.push(s.verdict == null ? 'unknown' : s.verdict === f.verdict ? 'yes' : 'no');
  if (f.date) checks.push(s.date == null ? 'unknown' : s.date === f.date ? 'yes' : 'no');
  if (checks.includes('no')) return 'no';
  if (checks.includes('unknown')) return 'unknown';
  return 'yes';
}

export function filterSources(all: readonly SourceRef[], f: SourceFilter): { match: SourceRef[]; unknown: SourceRef[] } {
  const match: SourceRef[] = [];
  const unknown: SourceRef[] = [];
  for (const s of all) {
    const m = matchSource(s, f);
    if (m === 'yes') match.push(s);
    else if (m === 'unknown') unknown.push(s);
  }
  return { match, unknown };
}

/**
 * 오늘 vs 지난(설계 C) — 기준 투구(즐겨찾기 ★)가 있으면 그것, 없으면 오늘이 아닌 가장 최근. 오늘 영상은 가장 최근 것.
 * 날짜를 모르는 영상은 고르지 않는다.
 */
export function todayVsPast<T extends { path: string; date: string | null; revisit?: boolean }>(items: readonly T[], today: string): { today: T; past: T } | null {
  const dated = items.filter((v) => !!v.date);
  const todays = dated.filter((v) => v.date === today);
  const olders = dated.filter((v) => (v.date as string) < today).sort((a, b) => ((a.date as string) < (b.date as string) ? 1 : -1));
  const t = todays[0];
  const ref = olders.find((v) => v.revisit) ?? olders[0];
  return t && ref ? { today: t, past: ref } : null;
}
