/**
 * 두 영상 비교의 시간 셈(순수 — React Native 없이 돌아 셀프테스트가 바로 부른다, scripts/my-videos-selftest.mts).
 *
 * 사용자가 A · B 에서 같은 동작(예: 앞발 착지)을 기준 장면으로 짚는다 — ma · mb(초). 공통 상대 시간 t 에서 A 는 ma + t, B 는 mb + t.
 * 둘 다 영상 안에 있어야 하니 t 의 범위는 max(−ma, −mb) ~ min(da − ma, db − mb). 기준 장면은 null(아직 안 짚음)과 0초(처음 장면을 짚음)를 가른다.
 */
export type Marks = { a: number | null; b: number | null };

/** 두 기준이 다 있나 — 0초도 짚은 것이다(null 만 아님) */
export const bothMarked = (m: Marks): m is { a: number; b: number } => m.a != null && m.b != null;

/** 공통 상대 구간 — 길이를 모르거나 겹치지 않으면 null */
export function commonRange(ma: number, mb: number, da: number | null, db: number | null): { min: number; max: number } | null {
  if (da == null || db == null || !(da > 0) || !(db > 0)) return null;
  const min = Math.max(-ma, -mb);
  const max = Math.min(da - ma, db - mb);
  return max > min ? { min, max } : null;
}

export const clampTo = (t: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, t));

/** 상대 시간 → 각 영상의 자리 */
export const sideTimes = (t: number, ma: number, mb: number) => ({ a: ma + t, b: mb + t });

/** 두 재생기의 어긋남(초) — B 가 A 보다 앞서면 + */
export const driftOf = (ta: number, tb: number, ma: number, mb: number) => tb - mb - (ta - ma);

/** 이만큼 넘게 어긋나면 B 를 A 에 다시 맞춘다(재생 중 한 번씩 — 매 장면 그리기가 아니라 시간 알림마다) */
export const DRIFT_FIX_SEC = 0.06;

/**
 * '이전 · 다음 장면' 한 걸음(초) — 영상이 알린 초당 장면 수가 그럴듯하면 그 한 장면, 모르면 1/60. 가변 장면 영상 · 실제 디코더 위치는 보장하지 않아
 * 화면에선 '한 프레임'이라 하지 않는다(이전 · 다음 장면).
 */
export function sceneStep(frameRate: number | null | undefined): number {
  return frameRate && frameRate >= 10 && frameRate <= 240 ? 1 / frameRate : 1 / 60;
}

/** '0:03.20' — 기준 장면 · 지금 자리 표시(소수 둘째 자리) */
export function clockText(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

/** '+1.2초' · '−0.4초' — 공통 상대 시간 */
export function relText(t: number): string {
  const v = Math.round(t * 10) / 10;
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}초`;
}

/*
 * 비교 화면의 단계 오가기(순수) — 고르기(pick) · 맞추기(align) · 비교(compare) 를 한 주소 안에서 바꾼다. 뒤로 길에 고리가 없어야 한다
 * (비교 → 맞추기 → 고르기 → 비교 … 로 들어온 곳에 못 돌아가는 일). 고르기는 start(들어온 곳) · compare(직전 비교) · align(연 맞추기),
 * 맞추기는 entry(들어온 곳) · pick(고르기) · compare(직전 비교) 로 돌아간다. 고르기에서 온 맞추기가 B 바꾸기를 열면 새 고르기를 쌓지 않고
 * 그 고르기로 돌아간다 — pickFrom='align' 은 alignFrom 이 pick 이 아닐 때만 생겨 둘이 서로를 가리키지 않는다.
 * 'restore' 는 직전 비교(B · 두 기준 · 자리)로 — 그 값은 화면이 쥔다(hasSnap).
 */
export type CompareStage = 'pick' | 'align' | 'compare';
export type CompareNav = { stage: CompareStage; pickFrom: 'start' | 'align' | 'compare'; alignFrom: 'entry' | 'pick' | 'compare' };
export type NavBack = { to: 'exit' } | { to: 'restore' } | { to: 'stage'; nav: CompareNav };

/** B 가 정해져 들어오면(투구 기록의 2분할) 맞추기부터, 아니면 고르기부터 */
export const navStart = (withB: boolean): CompareNav => ({ stage: withB ? 'align' : 'pick', pickFrom: 'start', alignFrom: withB ? 'entry' : 'pick' });

export function navBack(n: CompareNav, hasSnap: boolean): NavBack {
  if (n.stage === 'compare') return { to: 'exit' };
  if (n.stage === 'pick') {
    if (n.pickFrom === 'compare' && hasSnap) return { to: 'restore' };
    if (n.pickFrom === 'align') return { to: 'stage', nav: { ...n, stage: 'align' } };
    return { to: 'exit' };
  }
  if (n.alignFrom === 'compare' && hasSnap) return { to: 'restore' };
  if (n.alignFrom === 'entry') return { to: 'exit' };
  return { to: 'stage', nav: { ...n, stage: 'pick' } };
}
/** 직전 비교로 돌아옴 */
export const navRestore = (n: CompareNav): CompareNav => ({ ...n, stage: 'compare' });
/** B 바꾸기 — 비교에서 열면 직전 비교로 돌아갈 수 있게(화면이 그 값을 쥔다), 고르기에서 온 맞추기면 그 고르기로 */
export const navOpenPick = (n: CompareNav): CompareNav =>
  n.stage === 'compare' ? { ...n, stage: 'pick', pickFrom: 'compare' } : { ...n, stage: 'pick', pickFrom: n.alignFrom === 'pick' ? n.pickFrom : 'align' };
/** 고르기 → 맞추기 — 맞추기에서 연 고르기면 그 맞추기가 돌아갈 곳을 그대로 둔다 */
export const navPickNext = (n: CompareNav): CompareNav => ({ ...n, stage: 'align', alignFrom: n.pickFrom === 'align' ? n.alignFrom : 'pick' });
/** 비교 → 장면 다시 맞추기(취소하면 직전 비교) */
export const navRealign = (n: CompareNav): CompareNav => ({ ...n, stage: 'align', alignFrom: 'compare' });
export const navCompare = (n: CompareNav): CompareNav => ({ ...n, stage: 'compare' });
/** 밀어서 뒤로(화면째 닫음)는 뒤로가 '들어온 곳으로'일 때만 */
export const navSwipeOk = (n: CompareNav) => n.stage === 'compare' || (n.stage === 'pick' && n.pickFrom === 'start') || (n.stage === 'align' && n.alignFrom === 'entry');
