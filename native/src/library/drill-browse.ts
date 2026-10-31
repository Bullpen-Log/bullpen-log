import { LATER_CATEGORY } from '@/lib/categories';
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import { searchKey } from '@/lib/korean';
import { searchTerms, type Scope } from '~/library/browse';

/**
 * 투구 드릴 목록의 찾기 · 거르기 · 정렬(2026-10-31 드릴 시안 01) — 화면 없이 셈만. 시험: scripts/native-library-selftest.mts.
 *
 * - 찾기: 이름 · 종류(줄인 이름도) · 등록된 요소 전부 · 장비 · 단계. 띄어쓰기로 나눈 말은 모두 맞아야(AND), 말 하나 안은 lib/korean searchKey
 *   (예전 matchesSearch 처럼 띄어쓰기 · 대소문자를 무시 — '레그리프트' 도 '레그 리프트' 를 찾는다).
 * - 거르기: 묶음(요소 · 단계 · 종류 · 장비) 안은 하나라도(OR), 묶음끼리는 모두(AND). 요소는 보조까지 걸린다(웹과 같다). 단계 null 은 단계를 고르면 빠진다.
 * - 기본순: 고른 요소가 주 요소인 드릴 먼저 → 기초 · 연결 · 통합 · 모르는 값 · 미등록 → sortOrder → id. 이름순은 한국어, 같으면 기본순 꼬리(안정).
 * stage 는 콘텐츠 분류다 — 사용자의 학습 단계 · 진도와 상관없다. 미등록(null)을 기초로 채우지 않는다.
 */

export type DrillFilters = { focusPoints: string[]; stage: string[]; category: string[]; equipment: string[] };
export const EMPTY_DRILL_FILTERS: DrillFilters = { focusPoints: [], stage: [], category: [], equipment: [] };
export type DrillSort = 'default' | 'name';
export type DrillView = { query: string; scope: Scope; filters: DrillFilters; sort: DrillSort };
export const EMPTY_DRILL_VIEW: DrillView = { query: '', scope: 'all', filters: EMPTY_DRILL_FILTERS, sort: 'default' };

export type DrillItem = {
  id: string;
  title: string;
  category: string;
  focusPoints: string[];
  equipment: string[];
  stage: string | null;
  sortOrder: number;
};

export const drillFilterCount = (f: DrillFilters) => f.focusPoints.length + f.stage.length + f.category.length + f.equipment.length;

/** 화면에서만 줄인 종류 이름('무브먼트 패턴 드릴' → '무브먼트 패턴') — 정식 이름은 드릴 정보에 그대로 */
export const shortDrillCategory = (name: string) => (name === LATER_CATEGORY ? name : name.replace(/ 드릴$/, ''));

export function matchesDrillQuery(g: DrillItem, terms: readonly string[]) {
  if (terms.length === 0) return true;
  const hay = [g.title, g.category, shortDrillCategory(g.category), ...g.focusPoints, ...g.equipment, ...(g.stage ? [g.stage] : [])].map(searchKey);
  return terms.every((t) => hay.some((h) => h.includes(t)));
}

export function matchesDrillFilters(g: DrillItem, f: DrillFilters) {
  const any = (chosen: string[], have: readonly string[]) => chosen.length === 0 || chosen.some((x) => have.includes(x));
  return any(f.focusPoints, g.focusPoints) && any(f.stage, g.stage ? [g.stage] : []) && any(f.category, [g.category]) && any(f.equipment, g.equipment);
}

/** 기초 0 · 연결 1 · 통합 2 · 모르는 새 값 3 · 미등록 4 */
export function stageRank(stage: string | null) {
  if (stage == null) return 4;
  const i = (DRILL_STAGE_NAMES as readonly string[]).indexOf(stage);
  return i >= 0 ? i : 3;
}

const tail = (a: DrillItem, b: DrillItem) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 조건에 맞는 드릴 — 범위 → 찾기 → 거르기 → 정렬. 결과 수는 이 목록의 길이. isFav 는 화면의 별(진행 중 · 확정된 바꿈을 얹은 값) */
export function browseDrills<T extends DrillItem>(list: readonly T[], view: DrillView, isFav: (g: T) => boolean): T[] {
  const terms = searchTerms(view.query);
  const focus = view.filters.focusPoints;
  const out = list.filter((g) => (view.scope === 'all' || isFav(g)) && matchesDrillQuery(g, terms) && matchesDrillFilters(g, view.filters));
  if (view.sort === 'name') return out.sort((a, b) => a.title.localeCompare(b.title, 'ko') || tail(a, b));
  const lead = (g: DrillItem) => (focus.length > 0 && !focus.includes(g.focusPoints[0]) ? 1 : 0);
  return out.sort((a, b) => lead(a) - lead(b) || stageRank(a.stage) - stageRank(b.stage) || tail(a, b));
}

/** 고른 요소가 보조로만 걸린 드릴이면 그 요소('브레이크 함께 사용') — 주 요소는 바꾸지 않는다 */
export function secondaryMatch(g: DrillItem, focus: readonly string[]) {
  if (focus.length === 0 || focus.includes(g.focusPoints[0])) return null;
  return g.focusPoints.slice(1).find((x) => focus.includes(x)) ?? null;
}

/** 고를 칸 — 정해 둔 차례(known)를 먼저, 그 밖에 실제 있는 새 값은 뒤에(숨기지 않는다) */
export function optionsOf(known: readonly string[], present: Iterable<string>) {
  const have = new Set(present);
  return [...known.filter((x) => have.has(x)), ...[...have].filter((x) => !known.includes(x))];
}

/** 들어온 곳(3D 분석 · 메커니즘 훈련) — 주소 값은 정해 둔 모양만 받는다(바깥 주소 · 아무 경로를 실행하지 않게) */
export type DrillEntry = {
  from: 'library' | 'mechanics' | 'analysis';
  /** 3D 분석 결과 번호 — /lab/<번호> 로만 돌아간다 */
  result: string | null;
  /** 전해 받은 요소(여섯 중 하나) */
  el: string | null;
  /** 메커니즘 실행의 몇 번째 드릴 '2/3' · 하던 단계 */
  pos: string | null;
  phase: 'perform' | 'input' | null;
};
export function entryOf(p: { from?: string; result?: string; el?: string; pos?: string; phase?: string }, elements: readonly string[]): DrillEntry {
  const from = p.from === 'mechanics' || p.from === 'analysis' ? p.from : 'library';
  return {
    from,
    result: from === 'analysis' && p.result && /^[\w-]{1,64}$/.test(p.result) ? p.result : null,
    el: p.el && elements.includes(p.el) ? p.el : null,
    pos: from === 'mechanics' && p.pos && /^\d{1,2}\/\d{1,2}$/.test(p.pos) ? p.pos : null,
    phase: from === 'mechanics' && (p.phase === 'perform' || p.phase === 'input') ? p.phase : null,
  };
}
/** 주소에 다시 실을 값(상세로 넘길 때) — 비어 있으면 빼고 */
export function entryParams(e: DrillEntry): Record<string, string> {
  if (e.from === 'library') return {};
  return Object.fromEntries(Object.entries({ from: e.from, result: e.result, el: e.el, pos: e.pos, phase: e.phase }).filter((kv): kv is [string, string] => kv[1] != null));
}
