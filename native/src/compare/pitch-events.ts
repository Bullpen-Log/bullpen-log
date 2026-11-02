/**
 * 투구 장면 표시(R29 · R30 — 순수). 사람이 짚는다(자동 찾기 없음). 잘 안 보이는 장면은 '가려짐'으로 두거나 비워 둔다 — 짐작해 채우지 않는다.
 * 최대 외회전 장면은 '사람이 본 장면' 표시일 뿐 어깨 돌림 각을 잰 값이 아니다.
 */
import { captureMapping, realSeconds, stepInfo, type MediaFacts } from '~/compare/timing';

export type PitchEvent = 'kneePeak' | 'handSep' | 'footContact' | 'maxER' | 'release' | 'followThrough';
export const PITCH_EVENTS: readonly PitchEvent[] = ['kneePeak', 'handSep', 'footContact', 'maxER', 'release', 'followThrough'];
export const EVENT_LABEL: Record<PitchEvent, string> = {
  kneePeak: '무릎 최고점',
  handSep: '손 분리',
  footContact: '앞발 착지',
  maxER: '최대 외회전(눈으로 본 장면)',
  release: '릴리스',
  followThrough: '팔로스루',
};
export const EVENT_SHORT: Record<PitchEvent, string> = {
  kneePeak: '무릎',
  handSep: '손 분리',
  footContact: '착지',
  maxER: '외회전',
  release: '릴리스',
  followThrough: '팔로스루',
};

/** 영상 하나의 장면 표시 — 시각(초) 또는 'obscured'(가려져 못 짚음). 없는 열쇠 = 아직 안 짚음 */
export type EventMarks = Partial<Record<PitchEvent, number | 'obscured'>>;

export function normalizeMarks(raw: unknown, duration: number | null): EventMarks {
  const out: EventMarks = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of PITCH_EVENTS) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === 'obscured') out[k] = 'obscured';
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && (duration == null || v <= duration + 1e-3)) out[k] = v;
  }
  return out;
}

export const timeOf = (m: EventMarks, e: PitchEvent): number | null => (typeof m[e] === 'number' ? (m[e] as number) : null);

/** 순서가 어긋난 짚음(예: 릴리스가 착지보다 앞) — 화면이 알림만 하고 지우지 않는다 */
export function orderIssues(m: EventMarks): [PitchEvent, PitchEvent][] {
  const marked = PITCH_EVENTS.filter((e) => timeOf(m, e) != null);
  const out: [PitchEvent, PitchEvent][] = [];
  for (let i = 1; i < marked.length; i++) if ((timeOf(m, marked[i]) as number) < (timeOf(m, marked[i - 1]) as number)) out.push([marked[i - 1], marked[i]]);
  return out;
}

/**
 * 두 장면 사이 시간 — 재생 시간(presentation)과, 근거가 있을 때만 실제 걸린 시간(real). 불확실성은 두 장면을 각각 반 장면씩 틀리게
 * 짚을 수 있다고 보고 한 장면 간격(장면 간격이 고르다고 확인된 영상만 — 아니면 null 로 '모름').
 */
export type Interval = { presentation: number; real: number | null; plusMinus: number | null; mapping: 'realtime' | 'scaled' | 'unknown' };
export function intervalOf(m: EventMarks, from: PitchEvent, to: PitchEvent, facts: MediaFacts): Interval | null {
  const a = timeOf(m, from);
  const b = timeOf(m, to);
  if (a == null || b == null || b <= a) return null;
  const map = captureMapping(facts);
  const s = stepInfo(facts);
  const realStep = s.exact ? realSeconds(s.step, map) : null;
  return { presentation: b - a, real: realSeconds(b - a, map), plusMinus: realStep, mapping: map.kind };
}

/** 견줄 구간(설계 C — 착지 → 릴리스가 기본) */
export const DEFAULT_INTERVALS: [PitchEvent, PitchEvent][] = [
  ['kneePeak', 'footContact'],
  ['footContact', 'release'],
  ['handSep', 'release'],
  ['release', 'followThrough'],
];

/**
 * A · B 구간 차이 — 둘 다 실제 시간을 알 때만 실제 시간 차, 아니면 재생 시간 차를 '재생 시간 기준'으로만(속도가 다른 영상끼리면 숨긴다).
 * 슬로모션과 일반 영상처럼 재생 시간 축이 다르면 재생 시간 차이도 뜻이 없어 내지 않는다.
 */
export type IntervalCompare =
  | { basis: 'real'; a: number; b: number; diff: number; plusMinus: number | null }
  | { basis: 'presentation'; a: number; b: number; diff: number }
  | { basis: 'none'; reason: 'missing' | 'timebase' };
export function compareInterval(a: Interval | null, b: Interval | null): IntervalCompare {
  if (!a || !b) return { basis: 'none', reason: 'missing' };
  if (a.real != null && b.real != null) {
    const pm = a.plusMinus != null && b.plusMinus != null ? a.plusMinus + b.plusMinus : null;
    return { basis: 'real', a: a.real, b: b.real, diff: b.real - a.real, plusMinus: pm };
  }
  if (a.mapping === b.mapping && a.mapping !== 'scaled') return { basis: 'presentation', a: a.presentation, b: b.presentation, diff: b.presentation - a.presentation };
  return { basis: 'none', reason: 'timebase' };
}

/** 장면 띠 — 두 영상 모두에 짚은 장면(누르면 두 영상이 함께 그 장면으로) */
export function sharedEvents(a: EventMarks, b: EventMarks): PitchEvent[] {
  return PITCH_EVENTS.filter((e) => timeOf(a, e) != null && timeOf(b, e) != null);
}

/** 기준 장면 뜻(앞발 착지 · 릴리스)과 같은 장면 표시가 있으면 그 시각 — 기준을 다시 짚지 않고 잇는다 */
export function anchorFromEvents(m: EventMarks, semantic: 'footContact' | 'release' | 'manual' | 'start'): number | null {
  if (semantic === 'footContact' || semantic === 'release') return timeOf(m, semantic);
  return null;
}

/** 동작 길이 맞춤에 쓸 장면들 — 두 영상 모두에 시각이 있는 장면을 투구 순서대로(R36) */
export function normalizedAnchors(a: EventMarks, b: EventMarks): { events: PitchEvent[]; a: number[]; b: number[] } {
  const events = sharedEvents(a, b);
  return { events, a: events.map((e) => timeOf(a, e) as number), b: events.map((e) => timeOf(b, e) as number) };
}
