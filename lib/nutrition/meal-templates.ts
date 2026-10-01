import { basicFood } from '@/lib/nutrition/foods';
import type { AvoidKey } from '@/lib/nutrition/diet-prefs';
import type { Food } from '@/lib/nutrition/meta';

/**
 * 식단 틀 — 식단 짜기(lib/nutrition/meal-plan.ts)가 고르는 끼니 사례.
 *
 * 모두 앱의 기본 음식(foods.ts)으로 만든다. 그래서 짠 식단의 숫자는 사용자가 그 음식을 직접 담았을 때와 똑같고, 식약처
 * 검색 없이도 짤 수 있다. 주제는 '건강한 식단' — 라면 · 과자 · 탄산 · 아이스크림 같은 것은 틀에 넣지 않는다.
 *
 * 틀 한 줄의 모양(읽기 쉽게 글로 적고 아래에서 풀어 쓴다):
 *
 *   [열쇠, 이름, 끼니, 스타일, 장소, 꼬리표, 음식]
 *
 *   끼니    B 아침 · L 점심 · D 저녁 · S 간식(여럿 가능: 'LD')
 *   스타일  k 한식 · w 양식 · s 간편식(편의점 · 바로 먹는 것)
 *   장소    h 집 · g 헬스장 · t 팀/학교(급식 · 도시락) · o 밖(식당 · 편의점) — 그 자리에서 먹을 수 있나
 *   꼬리표  pre 던지기 전(탄수화물 많고 기름 적고 소화 쉬움) · rec 회복(단백질 + 탄수화물) · light 입맛 없을 때(부드럽고 마시는
 *           열량) · heat 더운 날(수분 · 나트륨 · 시원한 것) · lean 감량(가볍고 배부름) · dense 증량(열량 밀도) · bed 자기 전(유제품 단백질)
 *   음식    '열쇠:양:역할' 을 띄어쓰기로 — 역할 c 탄수화물(kcal 를 맞출 때 늘리고 줄임) · p 단백질(단백질을 맞출 때) ·
 *           d 한 그릇 요리(통째로) · s 곁들이(그대로)
 *
 * 시험(npm run nutrition:test)이 모든 음식 열쇠가 기본 목록에 있는지, 끼니마다 고를 틀이 넉넉한지 본다.
 */

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Style = 'korean' | 'western' | 'simple';
export type Place = 'home' | 'gym' | 'team' | 'out';
export type Tag = 'pre' | 'rec' | 'light' | 'heat' | 'lean' | 'dense' | 'bed';
export type Role = 'carb' | 'protein' | 'dish' | 'side';

export type TemplateItem = { food: Food; amount: number; role: Role };
export type MealTemplate = {
  key: string;
  name: string;
  slots: Slot[];
  styles: Style[];
  places: Place[];
  tags: Tag[];
  items: TemplateItem[];
};

type Row = [
  key: string,
  name: string,
  slots: string,
  styles: string,
  places: string,
  tags: string,
  items: string,
];

/* prettier-ignore */
const ROWS: Row[] = [
  // ── 아침 ──
  ['b-kor-egg', '잡곡밥 · 계란말이 · 미역국', 'B', 'k', 'h', 'light', 'multigrain-rice:1:c egg-roll:1:p miyeokguk:1:s kimchi:1:s'],
  ['b-kor-tofu', '현미밥 · 두부조림 · 된장찌개', 'B', 'k', 'h', 'lean', 'brown-rice:1:c braised-tofu:1:p doenjang-jjigae:1:s spinach:1:s'],
  ['b-kor-fish', '쌀밥 · 고등어구이 · 시금치나물', 'BD', 'k', 'h', 'rec', 'rice:1:c mackerel:1:p spinach:1:s kimchi:1:s'],
  ['b-kor-bulgogi', '쌀밥 · 소불고기 · 김치', 'BLD', 'k', 'ht', 'dense rec', 'rice:1:c bulgogi:1:p kimchi:1:s'],
  ['b-oat-milk', '오트밀 · 우유 · 바나나', 'BS', 'w', 'hg', 'pre light', 'oatmeal:1:c milk:1:p banana:1:s'],
  ['b-oat-honey', '오트밀 · 그릭요거트 · 꿀 · 블루베리', 'B', 'w', 'h', 'pre', 'oatmeal:1:c greek-yogurt:1:p honey:1:s blueberry:1:s'],
  ['b-greek-bowl', '그릭요거트 · 블루베리 · 아몬드', 'BS', 'w', 'hg', 'lean bed', 'greek-yogurt:1.5:p blueberry:1:s almond:0.5:s'],
  ['b-toast-egg', '식빵 · 달걀프라이 · 우유', 'B', 'w', 'h', '', 'white-bread:2:c egg-fried:2:p milk:1:s'],
  ['b-bagel', '베이글 · 슬라이스 치즈 · 삶은 달걀 · 오렌지주스', 'B', 'w', 'h', 'pre', 'bagel:1:c egg:2:p cheese-slice:1:s orange-juice:1:s'],
  ['b-pb-toast', '식빵 · 땅콩버터 · 바나나 · 우유', 'BS', 'w', 'h', 'dense', 'white-bread:2:c peanut-butter:1:s banana:1:s milk:1:p'],
  ['b-sweetpotato', '고구마 · 삶은 달걀 · 우유', 'BS', 'k', 'hgt', 'pre', 'sweet-potato:1:c egg:2:p milk:1:s'],
  ['b-potato', '찐 감자 · 삶은 달걀 · 사과', 'B', 'k', 'h', 'lean', 'potato:1.5:c egg:2:p apple:1:s'],
  ['b-tteokguk', '떡국', 'B', 'k', 'h', 'pre light', 'tteokguk:1:d kimchi:1:s'],
  ['b-cvs-gimbap', '삼각김밥 · 두유 · 바나나', 'BS', 's', 'gtoh', 'pre', 'triangle-gimbap:1:c soy-milk:1:p banana:1:s'],
  ['b-cvs-sandwich', '샌드위치 · 우유', 'B', 's', 'to', '', 'sandwich:1:d milk:1:p'],
  ['b-gimbap', '김밥 · 두유', 'BL', 's', 'to', 'pre', 'gimbap:1:d soy-milk:1:p'],
  ['b-shake-oat', '오트밀 · 단백질 쉐이크 · 바나나', 'B', 'w', 'hg', 'pre rec', 'oatmeal:1:c protein-shake:1:p banana:1:s'],
  ['b-corn-milk', '찐 옥수수 · 삶은 달걀 · 두유', 'B', 'k', 'hg', 'light', 'corn:1:c egg:2:p soy-milk:1:s'],
  ['b-salmon-rice', '현미밥 · 연어 · 방울토마토', 'B', 'k', 'h', 'lean', 'brown-rice:1:c salmon:1:p cherry-tomato:1:s'],

  // ── 점심 ──
  ['l-jeyuk-don', '제육덮밥 · 미역국', 'L', 'k', 'tho', 'dense', 'jeyuk-deopbap:1:d miyeokguk:1:s'],
  ['l-bibimbap', '비빔밥 · 미역국', 'LD', 'k', 'tho', 'pre', 'bibimbap:1:d miyeokguk:1:s'],
  ['l-pork-gukbap', '돼지국밥 · 김치', 'LD', 'k', 'o', 'dense rec', 'pork-gukbap:1:d kimchi:1:s'],
  ['l-seolleong', '설렁탕 · 쌀밥 · 김치', 'LD', 'k', 'o', 'rec light', 'seolleongtang:1:p rice:1:c kimchi:1:s'],
  ['l-galbitang', '갈비탕 · 쌀밥', 'LD', 'k', 'o', 'rec', 'galbitang:1:p rice:1:c kimchi:1:s'],
  ['l-kimchi-jjigae', '김치찌개 · 쌀밥 · 계란말이', 'LD', 'k', 'hto', '', 'kimchi-jjigae:1:s rice:1:c egg-roll:1:p'],
  ['l-doenjang-fish', '된장찌개 · 잡곡밥 · 고등어구이', 'LD', 'k', 'hto', 'rec', 'doenjang-jjigae:1:s multigrain-rice:1:c mackerel:1:p'],
  ['l-sundubu', '순두부찌개 · 쌀밥 · 계란말이', 'LD', 'k', 'ho', 'light', 'sundubu-jjigae:1:p rice:1:c egg-roll:1:s'],
  ['l-chicken-salad', '닭가슴살 샐러드 · 고구마', 'LD', 'w', 'hgo', 'lean rec', 'chicken-salad:1:p sweet-potato:1:c'],
  ['l-bulgogi-set', '소불고기 · 잡곡밥 · 시금치나물 · 미역국', 'LD', 'k', 'ht', 'rec', 'bulgogi:1:p multigrain-rice:1:c spinach:1:s miyeokguk:1:s'],
  ['l-curry', '카레라이스 · 삶은 달걀', 'L', 'k', 'ht', 'pre', 'curry-rice:1:d egg:1:p'],
  ['l-omurice', '오므라이스 · 샐러드', 'L', 'w', 'ho', '', 'omurice:1:d salad:1:s'],
  ['l-pasta-chicken', '토마토 파스타 · 닭가슴살', 'LD', 'w', 'ho', 'pre', 'pasta-tomato:1:c chicken-breast:1:p'],
  ['l-kalguksu', '칼국수 · 찐만두', 'L', 'k', 'o', 'light', 'kalguksu:1:d dumplings:1:p'],
  ['l-naengmyeon', '물냉면 · 찐만두', 'L', 'k', 'ho', 'heat', 'naengmyeon:1:d dumplings:1:p'],
  ['l-udon-gimbap', '우동 · 삼각김밥 · 삶은 달걀', 'L', 's', 'o', 'pre light', 'udon:1:d triangle-gimbap:1:c egg:2:p'],
  ['l-lunchbox', '편의점 도시락 · 우유', 'L', 's', 'too', '', 'lunchbox:1:d milk-lowfat:1:s'],
  ['l-cvs-pack', '삼각김밥 둘 · 닭가슴살 팩 · 바나나', 'L', 's', 'gto', 'pre lean', 'triangle-gimbap:2:c chicken-breast-pack:1:p banana:1:s'],
  ['l-tuna-gimbap', '참치김밥 · 삶은 달걀 · 두유', 'L', 's', 'to', '', 'tuna-gimbap:1:d egg:1:p soy-milk:1:s'],
  ['l-salmon-bowl', '현미밥 · 연어 · 브로콜리', 'LD', 'w', 'h', 'lean rec', 'brown-rice:1:c salmon:1:p broccoli:1:s'],
  ['l-thigh-rice', '쌀밥 · 닭다리살 · 샐러드 · 김치', 'LD', 'k', 'ht', 'rec', 'rice:1:c chicken-thigh:1.5:p salad:1:s kimchi:1:s'],
  ['l-team-meal', '잡곡밥 · 제육볶음 · 시금치나물 · 미역국', 'L', 'k', 't', 'dense', 'multigrain-rice:1:c jeyuk:1:p spinach:1:s miyeokguk:1:s'],
  ['l-team-tofu', '쌀밥 · 두부조림 · 멸치볶음 · 된장찌개', 'L', 'k', 't', 'light', 'rice:1:c braised-tofu:1:p anchovy:1:s doenjang-jjigae:1:s'],
  ['l-yukgaejang', '육개장 · 쌀밥', 'LD', 'k', 'o', 'heat', 'yukgaejang:1:p rice:1:c kimchi:1:s'],
  ['l-gym-rice', '현미밥 · 닭가슴살 팩 · 방울토마토', 'L', 's', 'gt', 'lean rec', 'brown-rice:1:c chicken-breast-pack:1:p cherry-tomato:1:s'],
  ['l-gym-sandwich', '샌드위치 · 삶은 달걀 · 우유', 'L', 's', 'gto', '', 'sandwich:1:d egg:1:p milk:1:s'],
  ['l-miyeok-set', '쌀밥 · 미역국 · 계란말이 · 수박', 'LD', 'k', 'h', 'heat light', 'rice:1:c miyeokguk:1:s egg-roll:1:p watermelon:1:s'],
  ['l-tonkatsu', '돈가스 · 쌀밥 · 샐러드', 'L', 'w', 'o', 'dense', 'tonkatsu:1:p rice:1:c salad:1:s'],

  // ── 저녁 ──
  ['d-beef-lean', '소고기 우둔 · 현미밥 · 브로콜리 · 된장찌개', 'D', 'k', 'h', 'lean rec', 'beef-lean:1.5:p brown-rice:1:c broccoli:1:s doenjang-jjigae:1:s'],
  ['d-salmon-potato', '연어 · 찐 감자 · 샐러드', 'D', 'w', 'h', 'lean rec', 'salmon:1.5:p potato:1.5:c salad:1:s'],
  ['d-dakbokkeum', '닭볶음탕 · 쌀밥', 'D', 'k', 'ho', 'rec', 'dakbokkeumtang:1:p rice:1:c kimchi:1:s'],
  ['d-samgyetang', '삼계탕 · 김치', 'D', 'k', 'ho', 'rec heat', 'samgyetang:1:d kimchi:1:s'],
  ['d-pork-tender', '돼지 안심 · 쌀밥 · 시금치나물 · 김치', 'D', 'k', 'h', 'lean', 'pork-tenderloin:1.5:p rice:1:c spinach:1:s kimchi:1:s'],
  ['d-mackerel-miyeok', '고등어구이 · 잡곡밥 · 미역국', 'D', 'k', 'h', 'light', 'mackerel:1:p multigrain-rice:1:c miyeokguk:1:s'],
  ['d-tofu-egg', '두부조림 · 잡곡밥 · 계란말이 · 김치', 'D', 'k', 'h', 'lean', 'braised-tofu:1.5:p multigrain-rice:1:c egg-roll:1:s kimchi:1:s'],
  ['d-jeyuk-set', '제육볶음 · 쌀밥 · 샐러드', 'D', 'k', 'ho', 'dense', 'jeyuk:1:p rice:1:c salad:1:s'],
  ['d-chicken-sweet', '닭가슴살 · 고구마 · 브로콜리', 'D', 'w', 'hg', 'lean rec', 'chicken-breast:1.5:p sweet-potato:1:c broccoli:1:s'],
  ['d-neck-rice', '돼지 목살 · 쌀밥 · 샐러드 · 김치', 'D', 'k', 'ho', 'dense', 'pork-neck:0.75:p rice:1:c salad:1:s kimchi:1:s'],
  ['d-sirloin', '소고기 등심 · 감자 · 브로콜리', 'D', 'w', 'h', 'dense rec', 'beef-sirloin:1.5:p potato:1.5:c broccoli:1:s'],
  ['d-curry-egg', '카레라이스 · 삶은 달걀 · 샐러드', 'D', 'k', 'h', 'pre', 'curry-rice:1:d egg:2:p salad:1:s'],
  ['d-tteokguk-dump', '떡국 · 찐만두', 'D', 'k', 'ho', 'pre light', 'tteokguk:1:d dumplings:1:p'],
  ['d-sundubu-fish', '순두부찌개 · 쌀밥 · 고등어구이', 'D', 'k', 'ho', 'rec', 'sundubu-jjigae:1:s rice:1:c mackerel:1:p'],
  ['d-bulgogi-japchae', '소불고기 · 쌀밥 · 잡채', 'D', 'k', 'h', 'dense', 'bulgogi:1:p rice:1:c japchae:1:s'],
  ['d-chicken-thigh-rice', '닭다리살 · 현미밥 · 방울토마토 · 미역국', 'D', 'k', 'h', 'rec', 'chicken-thigh:1.5:p brown-rice:1:c cherry-tomato:1:s miyeokguk:1:s'],
  ['d-pasta-salmon', '토마토 파스타 · 연어 · 샐러드', 'D', 'w', 'h', 'pre', 'pasta-tomato:1:c salmon:1:p salad:1:s'],

  // ── 간식 ──
  ['s-banana-milk', '바나나 · 우유', 'S', 'k', 'hgto', 'pre rec', 'banana:1:c milk:1:p'],
  ['s-greek-blue', '그릭요거트 · 블루베리', 'S', 'w', 'hg', 'lean bed', 'greek-yogurt:1:p blueberry:1:s'],
  ['s-sweetpotato-milk', '고구마 · 우유', 'S', 'k', 'hgt', 'pre', 'sweet-potato:1:c milk:1:p'],
  ['s-cvs-tri', '삼각김밥 · 두유', 'S', 's', 'gto', 'pre', 'triangle-gimbap:1:c soy-milk:1:p'],
  ['s-shake-banana', '단백질 쉐이크 · 바나나', 'S', 's', 'hg', 'rec', 'protein-shake:1:p banana:1:c'],
  ['s-protein-bar', '단백질 바 · 우유', 'S', 's', 'gto', 'rec', 'protein-bar:1:p milk-lowfat:1:s'],
  ['s-nuts-apple', '견과류 · 사과', 'S', 'k', 'hgto', 'dense', 'mixed-nuts:1:s apple:1:c'],
  ['s-tteok-milk', '가래떡 · 우유', 'S', 'k', 'ht', 'pre', 'garaetteok:1:c milk:1:p'],
  ['s-sports', '바나나 · 이온음료', 'S', 's', 'hgto', 'pre heat', 'banana:1:c sports-drink:1:s'],
  ['s-watermelon', '수박 · 떠먹는 요거트', 'S', 'k', 'h', 'heat light', 'watermelon:1:c yogurt:1:p'],
  ['s-choco-milk', '초코우유 · 바나나', 'S', 's', 'hgto', 'rec light', 'choco-milk:1:p banana:1:c'],
  ['s-egg-tomato', '삶은 달걀 · 방울토마토', 'S', 'k', 'hgo', 'lean', 'egg:2:p cherry-tomato:1:s'],
  ['s-banana-latte', '바나나우유 · 삶은 달걀', 'S', 's', 'gto', 'light dense', 'banana-milk:1:c egg:1:p'],
  ['s-chicken-pack', '닭가슴살 팩 · 고구마', 'S', 's', 'g', 'lean rec', 'chicken-breast-pack:1:p sweet-potato:1:c'],
  ['s-oat-milk', '오트밀 · 우유', 'S', 'w', 'h', 'light bed', 'oatmeal:1:c milk:1:p'],
  ['s-cheese-mandarin', '슬라이스 치즈 · 귤', 'S', 'k', 'hgo', 'lean', 'cheese-slice:2:p mandarin:2:s'],
  ['s-greek-honey', '그릭요거트 · 꿀 · 바나나', 'S', 'w', 'h', 'rec bed', 'greek-yogurt:1:p honey:1:s banana:1:c'],
  ['s-soy-almond', '두유 · 아몬드', 'S', 'k', 'gto', 'bed', 'soy-milk:1:p almond:0.5:s'],
  ['s-kiwi-yogurt', '떠먹는 요거트 · 키위', 'S', 'w', 'ho', 'light', 'yogurt:1:p kiwi:2:c'],
  ['s-oj-yogurt', '오렌지주스 · 떠먹는 요거트', 'S', 'w', 'hgo', 'heat light', 'orange-juice:1:c yogurt:1:p'],
  ['s-milk-bed', '따뜻한 우유', 'S', 'k', 'h', 'bed light', 'milk:1:p'],
];

/* ── 못 먹는 것 — 음식마다 무엇이 들었나(빠진 것이 없게 넉넉히: 재료로 흔히 들어가는 것까지) ── */
const CONTAINS: Partial<Record<AvoidKey, string[]>> = {
  dairy: [
    'milk',
    'milk-lowfat',
    'greek-yogurt',
    'yogurt',
    'cheese-slice',
    'latte',
    'choco-milk',
    'banana-milk',
    'pasta-cream',
    'pizza',
    'sandwich',
    'protein-shake',
    'croissant',
    'protein-bar',
  ],
  egg: [
    'egg',
    'egg-fried',
    'egg-white',
    'egg-roll',
    'omurice',
    'gimbap',
    'tuna-gimbap',
    'bibimbap',
    'fried-rice',
    'sandwich',
    'tonkatsu',
    'tteokguk',
  ],
  seafood: [
    'tuna-can',
    'tuna-gimbap',
    'salmon',
    'mackerel',
    'anchovy',
    'jjamppong',
    'triangle-gimbap',
  ],
  pork: [
    'jeyuk',
    'jeyuk-deopbap',
    'pork-gukbap',
    'pork-belly',
    'pork-neck',
    'pork-tenderloin',
    'tonkatsu',
    'sundae',
    'ham',
    'sausage',
    'budae-jjigae',
    'kimchi-jjigae',
    'dumplings',
    'jjajangmyeon',
    'gimbap',
    'sandwich',
    'lunchbox',
  ],
  beef: [
    'bulgogi',
    'beef-sirloin',
    'beef-lean',
    'galbitang',
    'seolleongtang',
    'yukgaejang',
    'miyeokguk',
    'hamburger',
    'tteokguk',
    'japchae',
  ],
  chicken: [
    'chicken-breast',
    'chicken-breast-pack',
    'chicken-thigh',
    'fried-chicken',
    'chicken-salad',
    'samgyetang',
    'dakbokkeumtang',
  ],
  wheat: [
    'white-bread',
    'bagel',
    'croissant',
    'red-bean-bread',
    'ramen',
    'cup-ramen',
    'udon',
    'kalguksu',
    'jjajangmyeon',
    'jjamppong',
    'pasta-tomato',
    'pasta-cream',
    'pizza',
    'sandwich',
    'hamburger',
    'dumplings',
    'tonkatsu',
    'naengmyeon',
    'budae-jjigae',
    'protein-bar',
    'curry-rice',
  ],
  nuts: ['almond', 'mixed-nuts', 'peanut-butter', 'protein-bar'],
  spicy: [
    'kimchi',
    'kimchi-jjigae',
    'jeyuk',
    'jeyuk-deopbap',
    'tteokbokki',
    'yukgaejang',
    'jjamppong',
    'budae-jjigae',
    'dakbokkeumtang',
    'sundubu-jjigae',
    'bibimbap',
  ],
};

/** 보충식품 — '단백질 쉐이크 · 바도 넣기'를 끈 사람과 성장기 · 어린이에게는 넣지 않는다 */
export const SUPPLEMENTS = new Set(['protein-shake', 'protein-bar']);

/*
 * 바꿔 넣기 — 못 먹는 것이 든 음식을 같은 역할의 다른 음식으로. 앞에 적은 것부터 쓸 수 있는 것을 고른다.
 * 곁들이(s)는 바꿀 것이 없으면 빼고, 탄수화물 · 단백질 · 한 그릇 요리는 바꿀 것이 없으면 그 틀을 안 쓴다.
 */
export const SUBSTITUTES: Record<string, string[]> = {
  milk: ['soy-milk'],
  'milk-lowfat': ['soy-milk'],
  'greek-yogurt': ['soy-milk', 'tofu'],
  yogurt: ['soy-milk'],
  'cheese-slice': ['egg'],
  'choco-milk': ['soy-milk'],
  'banana-milk': ['soy-milk'],
  egg: ['tofu', 'chicken-breast-pack', 'tuna-can'],
  'egg-fried': ['tofu'],
  'egg-roll': ['braised-tofu'],
  'chicken-breast': ['beef-lean', 'pork-tenderloin', 'tofu'],
  'chicken-breast-pack': ['tuna-can', 'beef-lean', 'tofu'],
  'chicken-thigh': ['pork-tenderloin', 'beef-lean', 'tofu'],
  'chicken-salad': ['salad'],
  salmon: ['chicken-breast', 'beef-lean', 'tofu'],
  mackerel: ['chicken-thigh', 'pork-tenderloin', 'braised-tofu'],
  'tuna-can': ['chicken-breast-pack', 'tofu'],
  'beef-lean': ['pork-tenderloin', 'chicken-breast', 'tofu'],
  'beef-sirloin': ['pork-neck', 'chicken-thigh', 'tofu'],
  bulgogi: ['jeyuk', 'chicken-thigh', 'braised-tofu'],
  jeyuk: ['bulgogi', 'chicken-thigh', 'braised-tofu'],
  'pork-tenderloin': ['beef-lean', 'chicken-breast', 'tofu'],
  'pork-neck': ['beef-sirloin', 'chicken-thigh', 'tofu'],
  'braised-tofu': ['tofu'],
  'white-bread': ['sweet-potato', 'rice'],
  bagel: ['sweet-potato', 'rice'],
  'pasta-tomato': ['rice', 'brown-rice'],
  'triangle-gimbap': ['sweet-potato', 'banana'],
  kimchi: ['spinach'],
  'kimchi-jjigae': ['doenjang-jjigae', 'miyeokguk'],
  'sundubu-jjigae': ['doenjang-jjigae', 'tofu'],
  miyeokguk: ['doenjang-jjigae'],
  dumplings: ['egg', 'tofu'],
  almond: ['banana'],
  'mixed-nuts': ['banana'],
  'peanut-butter': ['banana'],
  'protein-shake': ['milk', 'soy-milk', 'greek-yogurt'],
  'protein-bar': ['egg', 'chicken-breast-pack'],
};

const AVOID_OF = new Map<string, AvoidKey[]>();
for (const [avoid, ids] of Object.entries(CONTAINS) as [AvoidKey, string[]][]) {
  for (const id of ids) AVOID_OF.set(id, [...(AVOID_OF.get(id) ?? []), avoid]);
}

/** 그 음식에 든 '못 먹는 것' */
export function avoidsOf(foodId: string): AvoidKey[] {
  return AVOID_OF.get(foodId) ?? [];
}

const SLOT_OF: Record<string, Slot> = {
  B: 'breakfast',
  L: 'lunch',
  D: 'dinner',
  S: 'snack',
};
const STYLE_OF: Record<string, Style> = { k: 'korean', w: 'western', s: 'simple' };
const PLACE_OF: Record<string, Place> = { h: 'home', g: 'gym', t: 'team', o: 'out' };
const ROLE_OF: Record<string, Role> = { c: 'carb', p: 'protein', d: 'dish', s: 'side' };

/** 틀 줄에 적은 것이 틀렸으면 — 시험이 이것을 보고 실패한다(화면에서는 그 틀만 빠진다) */
export const TEMPLATE_PROBLEMS: string[] = [];

export const MEAL_TEMPLATES: MealTemplate[] = ROWS.flatMap(
  ([key, name, slots, styles, places, tags, items]) => {
    const parsed: TemplateItem[] = [];
    for (const part of items.split(' ')) {
      const [id, amount, role] = part.split(':');
      const food = basicFood(id);
      if (!food || !ROLE_OF[role] || !(Number(amount) > 0)) {
        TEMPLATE_PROBLEMS.push(`${key}: ${part}`);
        continue;
      }
      parsed.push({ food, amount: Number(amount), role: ROLE_OF[role] });
    }
    if (parsed.length === 0) return [];
    return [
      {
        key,
        name,
        slots: [...slots].map((c) => SLOT_OF[c]).filter(Boolean),
        styles: [...styles].map((c) => STYLE_OF[c]).filter(Boolean),
        places: [...new Set([...places].map((c) => PLACE_OF[c]).filter(Boolean))],
        tags: tags.split(' ').filter(Boolean) as Tag[],
        items: parsed,
      },
    ];
  }
);
