import { TRAINING_CATEGORY_NAMES } from '@/lib/categories';
import { searchKey } from '@/lib/korean';

/**
 * 운동 영상 목록의 찾기 · 거르기 · 정렬(2026-10-31 시안 01) — 화면 없이 셈만. 시험: scripts/native-library-selftest.mts.
 *
 * - 찾기: 이름 · 분류(줄인 이름도) · 목표 부위 · 장비. 띄어쓰기로 나눈 말은 모두 맞아야(AND) — '바벨 스쿼트' → '바벨 백 스쿼트',
 *   '밴드 어깨' → 장비 밴드 + 부위 어깨. 말 하나 안의 띄어쓰기 · 영문 대소문자는 lib/korean searchKey 그대로(다른 화면의 찾기 뜻은 안 바꾼다).
 * - 거르기: 묶음 안은 하나라도(OR), 묶음끼리는 모두(AND) — 웹 matchesFilter 와 같다.
 * - 정렬: 등록순은 서버가 준 차례(새로 넣은 것이 위, lib/library-load.ts), 이름순은 한국어 · 같으면 원래 차례(안정 정렬).
 * - 워밍업 칸: 분류가 워밍업인 운동 + 루틴 폴더(공통 · 그날 루틴)에 담긴 운동. 같은 운동은 한 번만 센다.
 */

/** 화면에서만 줄여 부르는 분류 이름 — 저장 값 · 추천 엔진의 분류는 그대로다 */
const SHORT_CATEGORY: Record<string, string> = {
  '하체 스트렝스': '하체',
  '상체 스트렝스': '상체',
  '회복 및 보강': '회복·보강',
  /* 영상이 없어 미룬 운동 — 분류 자체를 영상 유무로 보지는 않는다(카드는 실제 영상 경로로 판정) */
  '나중에 촬영': '영상 준비 중',
};
export const shortCategory = (name: string) => SHORT_CATEGORY[name] ?? name;

export const WARMUP = '워밍업';

export type Scope = 'all' | 'fav';
export type Sort = 'recent' | 'name';
export type LibraryFilters = { bodyParts: string[]; intensity: string[]; equipment: string[] };
export const EMPTY_FILTERS: LibraryFilters = { bodyParts: [], intensity: [], equipment: [] };

/** 목록을 보는 조건 — 상세에 다녀와도 이대로(sync.ts libraryView) */
export type LibraryView = {
  query: string;
  scope: Scope;
  category: string | null;
  /** 워밍업 칸 안의 루틴(kind) — null 은 워밍업 전체 */
  folder: string | null;
  filters: LibraryFilters;
  sort: Sort;
};
export const EMPTY_VIEW: LibraryView = { query: '', scope: 'all', category: null, folder: null, filters: EMPTY_FILTERS, sort: 'recent' };

export type BrowseItem = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  equipment: string[];
};
export type WarmupGroup = { kind: string; name: string; exerciseIds: string[] };

export const filterCount = (f: LibraryFilters) => f.bodyParts.length + f.intensity.length + f.equipment.length;

/** 찾는 말을 띄어쓰기로 나눈다 — 공백뿐이면 빈 목록(거르지 않음) */
export const searchTerms = (query: string) => query.split(/\s+/).map(searchKey).filter(Boolean);

export function matchesQuery(ex: BrowseItem, terms: readonly string[]) {
  if (terms.length === 0) return true;
  const hay = [ex.title, ex.category, shortCategory(ex.category), ...ex.bodyParts, ...ex.equipment].map(searchKey);
  return terms.every((t) => hay.some((h) => h.includes(t)));
}

export function matchesFilters(ex: BrowseItem, f: LibraryFilters) {
  const any = (chosen: string[], have: readonly string[]) => chosen.length === 0 || chosen.some((x) => have.includes(x));
  return any(f.bodyParts, ex.bodyParts) && any(f.intensity, [ex.intensity]) && any(f.equipment, ex.equipment);
}

/** 워밍업 칸에 드는 운동 id — 분류가 워밍업이거나 루틴 폴더에 담긴 것(중복 없음) */
export function warmupIds(list: readonly BrowseItem[], groups: readonly WarmupGroup[]) {
  const ids = new Set<string>();
  for (const g of groups) for (const id of g.exerciseIds) ids.add(id);
  for (const ex of list) if (ex.category === WARMUP) ids.add(ex.id);
  return ids;
}

/** 분류 칩 — 실제 있는 분류만, 앱 분류 차례대로(모르는 분류는 뒤에). 워밍업은 폴더에만 담겨 있어도 보인다 */
export function categoriesOf(list: readonly BrowseItem[], groups: readonly WarmupGroup[]) {
  const have = new Set(list.map((ex) => ex.category));
  if (groups.some((g) => g.exerciseIds.length > 0)) have.add(WARMUP);
  const known = TRAINING_CATEGORY_NAMES.filter((n) => have.has(n));
  const rest = [...have].filter((n) => !TRAINING_CATEGORY_NAMES.includes(n));
  return [...known, ...rest];
}

const byName = (a: BrowseItem, b: BrowseItem) => a.title.localeCompare(b.title, 'ko');

/**
 * 조건에 맞는 운동 — 범위(전체 · 즐겨찾기) → 분류(워밍업은 폴더 차례) → 찾기 → 거르기 → 정렬. 결과 수는 이 목록의 길이(고유 id).
 * isFav 는 화면의 별(진행 중 · 확정된 바꿈을 얹은 값)이다.
 */
export function browse<T extends BrowseItem>(list: readonly T[], groups: readonly WarmupGroup[], view: LibraryView, isFav: (ex: T) => boolean): T[] {
  const terms = searchTerms(view.query);
  let pool: readonly T[] = list;
  if (view.category === WARMUP) {
    const folder = view.folder ? groups.find((g) => g.kind === view.folder) : null;
    if (folder) {
      /* 루틴 하나 — 루틴에 담은 차례 그대로(같은 운동이 두 번 담겨도 한 번) */
      const byId = new Map(list.map((ex) => [ex.id, ex]));
      pool = [...new Set(folder.exerciseIds)].flatMap((id) => byId.get(id) ?? []);
    } else {
      const ids = warmupIds(list, groups);
      pool = list.filter((ex) => ids.has(ex.id));
    }
  } else if (view.category) pool = list.filter((ex) => ex.category === view.category);
  const out = pool.filter((ex) => (view.scope === 'all' || isFav(ex)) && matchesQuery(ex, terms) && matchesFilters(ex, view.filters));
  /* 폴더 안 등록순은 루틴 차례 — 서버가 루틴 순서로 준다 */
  return view.sort === 'name' ? [...out].sort(byName) : out;
}

/** 지워질 수 있는 조건 각각 — 결과가 없을 때 '검색어만 · 필터만 · 분류만' 풀 수 있게 */
export function activeConditions(view: LibraryView) {
  return {
    query: view.query.trim() !== '',
    filters: filterCount(view.filters) > 0,
    category: view.category != null,
    fav: view.scope === 'fav',
  };
}

/**
 * 돌아왔을 때 볼 자리 — 보던 운동(anchor)이 아직 있으면 그 자리, 사라졌으면(별 해제 · 숨김) 그 운동이 있던 차례에서 가장 가까운 남은 운동.
 * order 는 사라지기 전의 목록 id 차례(앞에서 본 목록).
 */
export function nearestIndex(ids: readonly string[], anchor: string | null, before: readonly string[]) {
  if (!anchor || ids.length === 0) return 0;
  const at = ids.indexOf(anchor);
  if (at >= 0) return at;
  const was = before.indexOf(anchor);
  if (was < 0) return 0;
  const left = new Set(ids);
  for (let d = 1; d < before.length; d++) {
    for (const j of [was + d, was - d]) {
      const id = before[j];
      if (id && left.has(id)) return ids.indexOf(id);
    }
  }
  return 0;
}
