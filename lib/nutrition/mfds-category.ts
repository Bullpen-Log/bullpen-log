import { toFood, type MfdsItem } from '@/lib/nutrition/mfds-parse';
import { FOOD_CATEGORIES, type FoodCategory } from '@/lib/nutrition/foods';
import type { Food } from '@/lib/nutrition/meta';

/**
 * 식약처 '품목대표'를 앱의 음식 분류(foods.ts FOOD_CATEGORIES)로 나눈다 — 음식 창의 [전체 음식]에서 검색 없이 둘러보게(2026-10-02 사용자).
 *
 * 식품코드의 앞 넉 자가 분류다.
 *   D···  음식(조리한 것) — 끝 두 자리가 요리 종류: 01 밥 · 02 떡(D1 · D3) / 빵 · 피자 · 샌드위치(D4~D7) · 03 면 · 만두 · 04 죽 ·
 *         05 국 · 탕 · 06 찌개 · 전골 · 07 찜 · 08 구이 · 09 전 · 10 볶음 · 11 조림 · 12 튀김 · 13 나물 · 14 무침 · 15 김치 ·
 *         16 젓갈 · 17 장아찌 · 18 양념 · 19 빙과 · 20 음료 · 차. 앞자리(D1 · D3~D7)는 같은 요리의 다른 출처라 이름이 겹친다.
 *   P···  가공식품 — 101 빵 · 떡 · 과자 · 102 빙과 · 103 과자 · 초콜릿 · 104 당류 · 105 잼 · 106 두부 · 107 기름 · 108 면 · 109 음료 ·
 *         112 장류 · 113 조미 · 114 절임 · 115 술 · 116 견과 · 통조림 · 117 햄 · 소시지 · 118 달걀 가공 · 119 우유 가공 · 120 어묵 ·
 *         통조림 · 123 즉석식품.
 *   R···  원재료 — 101 곡류 · 102 감자 · 103 당류 · 104 콩 · 105 견과 · 106 채소 · 107 버섯 · 108 과일 · 109 고기 · 110 달걀 ·
 *         113 우유 · 114 기름 · 115 차 · 118 조미료 · 120 기타 · 121 고기 가공 · 211 생선 · 조개 · 212 해조류.
 *
 * 양념 · 기름 · 당류 · 장류 · 조미료 · 술 · 기타는 둘러보기에서 뺀다(검색하면 나온다) — 한 끼로 담을 것이 아니다.
 * 이 파일은 순수 계산이라 시험이 그대로 부른다. 자료(0.8MB)는 서버의 mfds-browse.ts 가 읽어 넘긴다.
 */

const D_KIND: Record<string, FoodCategory | null> = {
  '01': '밥',
  '03': '면·빵',
  '04': '밥',
  '05': '국·찌개',
  '06': '국·찌개',
  '07': '반찬',
  '08': '고기·생선',
  '09': '반찬',
  '10': '반찬',
  '11': '반찬',
  '12': '반찬',
  '13': '반찬',
  '14': '반찬',
  '15': '반찬',
  '16': '반찬',
  '17': '반찬',
  '18': null,
  '19': '간식·보충',
  '20': '우유·음료',
  '24': '과일·채소',
  '26': '고기·생선',
  '27': '고기·생선',
};

const P_KIND: Record<string, FoodCategory | null> = {
  '101': '면·빵',
  '102': '간식·보충',
  '103': '간식·보충',
  '104': null,
  '105': '간식·보충',
  '106': '고기·생선',
  '107': null,
  '108': '면·빵',
  '109': '우유·음료',
  '112': null,
  '113': null,
  '114': '반찬',
  '115': null,
  '116': '간식·보충',
  '117': '고기·생선',
  '118': '반찬',
  '119': '우유·음료',
  '120': '고기·생선',
  '123': '분식',
};

const R_KIND: Record<string, FoodCategory | null> = {
  '101': '밥',
  '102': '과일·채소',
  '103': null,
  '104': '반찬',
  '105': '간식·보충',
  '106': '과일·채소',
  '107': '과일·채소',
  '108': '과일·채소',
  '109': '고기·생선',
  '110': '고기·생선',
  '113': '우유·음료',
  '114': null,
  '115': '우유·음료',
  '118': null,
  '120': null,
  '121': '고기·생선',
  '211': '고기·생선',
  '212': '반찬',
};

/** 품목대표 한 줄의 앱 분류 — 둘러보기에서 뺄 것은 null */
export function mfdsCategory(code: string, name: string): FoodCategory | null {
  if (!name.trim()) return null;
  const group = code[0];
  if (group === 'D') {
    const kind = code.slice(2, 4);
    if (kind === '01') return name.startsWith('김밥') ? '분식' : '밥';
    /* 02 — D1 · D3 은 떡(가래떡은 기본 목록에서도 면·빵), D4~D7 은 빵 · 피자 · 햄버거 · 샌드위치(기본 목록에서 분식) */
    if (kind === '02') return code[1] === '1' || code[1] === '3' ? '면·빵' : '분식';
    return kind in D_KIND ? D_KIND[kind] : '반찬';
  }
  const kind = code.slice(1, 4);
  if (group === 'P') return kind in P_KIND ? P_KIND[kind] : '간식·보충';
  if (group === 'R') return kind in R_KIND ? R_KIND[kind] : null;
  return null;
}

/** 같은 분류 안의 차례 — 조리한 음식(일반 D1 먼저) → 가공식품 → 원재료 */
function rank(code: string) {
  if (code[0] === 'D') return code[1] === '1' ? 0 : 1;
  if (code[0] === 'P') return 2;
  return 3;
}

export type BrowseIndex = Map<FoodCategory, Food[]>;

/**
 * 분류별 목록 — 이름이 같은 것은 하나만(D1 · D3~D7 의 같은 요리), 조리한 음식 → 가공식품 → 원재료, 그 안에서 가나다.
 */
export function buildBrowseIndex(items: MfdsItem[]): BrowseIndex {
  const rows: { cat: FoodCategory; rank: number; food: Food }[] = [];
  for (const it of items) {
    const code = String(it.FOOD_CD ?? '');
    const name = String(it.FOOD_NM_KR ?? '');
    const cat = mfdsCategory(code, name);
    if (!cat) continue;
    const food = toFood(it);
    if (!food) continue;
    rows.push({ cat, rank: rank(code), food });
  }
  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.food.name.localeCompare(b.food.name, 'ko') ||
      a.food.id!.localeCompare(b.food.id!)
  );
  const index: BrowseIndex = new Map(FOOD_CATEGORIES.map((c) => [c, []]));
  const seen = new Map<FoodCategory, Set<string>>();
  for (const r of rows) {
    const names = seen.get(r.cat) ?? new Set<string>();
    seen.set(r.cat, names);
    if (names.has(r.food.name)) continue;
    names.add(r.food.name);
    index.get(r.cat)!.push(r.food);
  }
  return index;
}

export type BrowsePage = {
  items: { food: Food; category: FoodCategory }[];
  /** 그 분류(또는 전체)의 모든 줄 수 */
  total: number;
  /** 다음에 물을 자리 — 끝이면 null */
  next: number | null;
};

/** 한 쪽 — 'all' 은 분류 차례대로 이어 붙인 목록 */
export function browsePage(
  index: BrowseIndex,
  category: FoodCategory | 'all',
  offset: number,
  limit: number
): BrowsePage {
  const list =
    category === 'all'
      ? FOOD_CATEGORIES.flatMap((c) =>
          (index.get(c) ?? []).map((food) => ({ food, category: c }))
        )
      : (index.get(category) ?? []).map((food) => ({ food, category }));
  const start = Math.max(0, Math.min(list.length, Math.floor(offset)));
  const items = list.slice(start, start + limit);
  const end = start + items.length;
  return { items, total: list.length, next: end < list.length ? end : null };
}
