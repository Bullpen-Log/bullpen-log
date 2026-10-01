import { toFood, type MfdsItem } from '@/lib/nutrition/mfds-parse';
import { FOOD_CATEGORIES, type FoodCategory } from '@/lib/nutrition/foods';
import type { Food } from '@/lib/nutrition/meta';
import { subcategoryOf } from '@/lib/nutrition/food-subcategory';

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
 *
 * 코드 묶음만으로는 모자라 이름도 본다(2026-10-02 검토): P101(빵 · 떡 · 과자)에는 감자칩 · 사탕이, R101(곡류)에는 마른 국수 ·
 * 밀가루가, R121 은 '고기 가공'이 아니라 간장 · 소주 · 생수 · 빵 · 김치가 섞인 가공식품 잡동사니(648줄)다. 그래서
 *   1. 묶음이 통째로 빠지는 것(양념 · 술 …)은 이름과 상관없이 뺀다
 *   2. 이름으로 뺀다 — 가루 · 반죽 · 육수 · 소스 · 버터처럼 한 끼로 담지 않는 것(어느 묶음에 있든)
 *   3. 이름으로 옮긴다 — 떡 → 면·빵, 김밥 · 떡볶이 · 라면 · 버거 → 분식(기본 목록과 같게), 과자 · 케이크 → 간식·보충 …
 *   4. 그래도 남으면 묶음 표, R121 은 아는 이름만 담고 나머지는 뺀다
 * 이름은 앞말(첫 ',' · '_' · '/' · '(' 앞)로 본다 — '삼각김밥_참치마요네즈' 를 마요네즈로 빼지 않게.
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
  /* 121 은 잡동사니 — 표가 아니라 이름으로(R121) */
  '121': null,
  '211': '고기·생선',
  '212': '반찬',
};

/** 이름 전체로 빼는 것 — 가루 · 반죽 · 생지 · 국물처럼 '모양'이 한 끼가 아닌 것(뒤에 붙어도) */
const DROP_FORM =
  /가루(?!.*(음료|끓인것|탄것))|파우더|반죽|생지|도우$|페이스트|전분|액젓|육수|(?<!콩)국물|스톡|액즙|액즘|알코올|엿기름|만두피|빙수용/;

/** 앞말로 빼는 것 — 양념 · 장 · 기름 · 버터 · 술 · 물 */
const DROP_HEAD =
  /소스|드레싱|케첩|마요네즈|머스타드|시럽|시즈닝|조미료|양념(장)?$|크리머|분유|연유|젤라틴|쇼트닝|마가린|앙금|청$|건더기|라면 ?스프/;
const DROP_HEADS = new Set([
  '간장',
  '고추장',
  '된장',
  '쌈장',
  '초고추장',
  '두반장',
  '해선장',
  '미소',
  '청국장',
  '식초',
  '소금',
  '설탕',
  '과당',
  '물엿',
  '조청',
  '맛술',
  '생수',
  '버터',
  '무가염 버터',
  '크림',
  '생크림',
  '휘핑크림',
  '고추기름',
  '화분',
  '강황',
  '울금',
  '참깨',
  '들깨',
  '발효주',
  '증류주',
]);

/** 이름으로 옮기기 — 위에서부터 처음 맞는 것(앞말에 건다). 기본 목록(foods.ts)의 자리와 같게 둔다 */
const MOVES: [RegExp, FoodCategory][] = [
  [/(핫도그|햄버거|소시지)빵$/, '면·빵'],
  [
    /떡볶이떡|떡국떡|떡$|송편|경단|인절미|백설기|절편|증편|부꾸미|약식|기피편|빙떡/,
    '면·빵',
  ],
  /* 떡국은 기본 목록처럼 밥(국밥·떡국), 만둣국 · 수프는 국 — 면 · 밥 묶음(D?03 · D?04)에 섞여 있었다 */
  [/떡국|떡만두국/, '밥'],
  [/만두국|만둣국|수프|스프/, '국·찌개'],
  [
    /김밥(?!용|햄)|떡볶이|순대(?!국)|라면|만두(?!국|전골)|햄버거|피자|샌드위치|핫도그|토스트|김말이|떡꼬치/,
    '분식',
  ],
  [/땅콩 ?버터/, '간식·보충'],
  [/음료$/, '우유·음료'],
  [
    /칩|스낵|팝콘(?!치킨)|강냉이|튀밥|뻥튀기|쿠키|비스킷|크래커|사탕(?!무|수수)|드롭스|젤리|구미|양갱|웨하스|마카롱|마들렌|다쿠아즈|푸딩|케이크|도넛|머핀|와플|츄러스|추로스|파이$|타르트|슈(크림)?(빵)?$|카스텔라|만주|만쥬|모나카|약과|유과|매작과|^산자(_|$)|다식|(엿|깨|쌀|콩|땅콩|들깨)강정|^강정|^엿|초콜릿|초코바|캐러멜|^껌$|아이스크림|셔벗|빙수|아이스밀크|쉐이크|셰이크|시리얼|그래놀라|호떡|붕어빵|계란빵|과자|건빵|프레즐/,
    '간식·보충',
  ],
  [/빵|베이글|바게트|크로와상|크루아상|또띠아|^번$|페이스트리/, '면·빵'],
  [
    /국수|냉면|마카로니|스파게티|파스타|누들|당면|(?<!새)우동|쫄면|소면|중면|수제비|면$/,
    '면·빵',
  ],
  [
    /주스|넥타|스무디|에이드|라떼|라테|커피|음료|음류|두유|우유|요구르트|요거트|식혜|수정과|콜라(?!비)|사이다|소다|탄산|밀크티|코코아|녹즙|화채|(?<!스파게|패)티$|차$|워터$|코코넛수/,
    '우유·음료',
  ],
  [/치즈$|모차렐라|모짜렐라|체다|파르메산/, '우유·음료'],
  [/^(김|조미김|김자반|파래자반|김부각|다시마부각|다시마튀각)$/, '반찬'],
  /* 묵(도토리 · 메밀 · 청포) — 두부류(P106) · 원재료에 섞여 고기·생선으로 가던 것 */
  [/^(도토리|메밀|청포|밤|우무|녹두|클로렐라|올방개)?묵$|^묵\//, '반찬'],
];

/* 구이(D?08)는 고기·생선 묶음이지만 채소 · 김 구이도 섞여 있다 */
const VEG_GRILL = /버섯|감자|옥수수|더덕|우엉|채소|콘치즈|김구이|가지|호박|두부/;

/** R121(가공식품 잡동사니) — 아는 앞말만 담고 나머지는 뺀다. MOVES 다음에 본다 */
const R121: [RegExp, FoodCategory][] = [
  [/국$|스프|스튜/, '국·찌개'],
  [
    /^(햄|소시지|베이컨|어육소시지|게맛살|게맛살채|미트볼|소고기|소불고기|돼지불고기|포크커틀릿|치킨너겟|돈저냐|닭꼬치|두부|낫토|비지|잣두부|대체식품|달걀)$|어묵/,
    '고기·생선',
  ],
  [/^(옥수수|감자|산마늘|프루트샐러드)$/, '과일·채소'],
  [/밥$|누룽지|하이라이스|죽$/, '밥'],
  [/김치|장아찌|피클|무침|볶음|조림|묵$|샐러드$/, '반찬'],
  [/튀김|양파링|치즈스틱|크로켓/, '분식'],
  [/너트|땅콩|보충제/, '간식·보충'],
];

/** P116(견과 · 통조림 · 튀김가루 …) — 통조림 · 절임 · 전 · 콩고기를 제자리로 */
const P116: [RegExp, FoodCategory][] = [
  [/피클|장아찌|오이지/, '반찬'],
  [/통조림|^백도|^황도/, '과일·채소'],
  [/전$/, '반찬'],
  [/콩고기|두부가스/, '고기·생선'],
  [/크로켓/, '분식'],
];

const first = (rules: [RegExp, FoodCategory][], head: string) =>
  rules.find(([re]) => re.test(head))?.[1];

/** P123(즉석식품) — 국 · 밥 · 반찬 · 고기는 제자리로, 나머지는 분식(간편식) */
const P123: [RegExp, FoodCategory][] = [
  [/국$|탕$|수프|스프|개장$/, '국·찌개'],
  [/밥$|죽$/, '밥'],
  [/조림|샐러드|코울슬로/, '반찬'],
  [/패티|^김밥햄$/, '고기·생선'],
];

/** 품목대표 한 줄의 앱 분류 — 둘러보기에서 뺄 것은 null */
export function mfdsCategory(code: string, name: string): FoodCategory | null {
  const full = name.trim();
  if (!full) return null;
  const head = full.split(/[,_/(]/)[0].trim();
  const group = code[0];
  const kind = group === 'D' ? code.slice(2, 4) : code.slice(1, 4);
  const table =
    group === 'D' ? D_KIND : group === 'P' ? P_KIND : group === 'R' ? R_KIND : null;
  if (!table) return null;
  /* 1. 묶음이 통째로 빠지는 것(양념 · 술 · 기름 …) — 이름이 '사탕수수'여도 담지 않는다. R121 은 아래에서 이름으로 */
  if (kind in table && table[kind] === null && !(group === 'R' && kind === '121'))
    return null;
  /* 2. 한 끼가 아닌 것 */
  if (DROP_FORM.test(full) || DROP_HEAD.test(head) || DROP_HEADS.has(head)) return null;
  /* 3. 이름으로 옮기기 */
  const moved = first(MOVES, head);
  if (moved) return moved;
  /* 4. 묶음 표 */
  if (group === 'D') {
    if (kind === '01') return '밥';
    /* 02 — 이름으로 못 가른 것: D1 · D3 은 떡 · 빵 쪽, D4~D7 은 분식(기본 목록에서 햄버거 · 피자 · 샌드위치는 분식) */
    if (kind === '02') return code[1] === '1' || code[1] === '3' ? '면·빵' : '분식';
    if (kind === '08' && VEG_GRILL.test(full)) return '반찬';
    return kind in D_KIND ? D_KIND[kind] : '반찬';
  }
  if (group === 'P') {
    if (kind === '116') return first(P116, head) ?? '간식·보충';
    if (kind === '123') return first(P123, head) ?? '분식';
    return kind in P_KIND ? P_KIND[kind] : '간식·보충';
  }
  if (kind === '121') return first(R121, head) ?? null;
  return kind in R_KIND ? R_KIND[kind] : null;
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

/** 한 쪽 — 'all' 은 분류 차례대로 이어 붙인 목록. sub 는 그 분류의 세부 칸(food-subcategory.ts)으로 거른다 */
export function browsePage(
  index: BrowseIndex,
  category: FoodCategory | 'all',
  offset: number,
  limit: number,
  sub: string | null = null
): BrowsePage {
  const list =
    category === 'all'
      ? FOOD_CATEGORIES.flatMap((c) =>
          (index.get(c) ?? []).map((food) => ({ food, category: c }))
        )
      : (index.get(category) ?? [])
          .filter((food) => !sub || subcategoryOf(category, food.name, food.id) === sub)
          .map((food) => ({ food, category }));
  const start = Math.max(0, Math.min(list.length, Math.floor(offset)));
  const items = list.slice(start, start + limit);
  const end = start + items.length;
  return { items, total: list.length, next: end < list.length ? end : null };
}

/** 분류마다 세부 칸별 개수 — 화면이 빈 칸을 숨기고 숫자를 단다 */
export function subCounts(index: BrowseIndex): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [category, foods] of index) {
    const counts: Record<string, number> = {};
    for (const food of foods) {
      const key = subcategoryOf(category, food.name, food.id);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    out[category] = counts;
  }
  return out;
}
