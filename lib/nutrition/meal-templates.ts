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
  ['b-bagel', '베이글 · 슬라이스 치즈 · 삶은 달걀 · 오렌지주스', 'B', 'w', 'h', 'pre', 'bagel:1:c egg:1:p cheese-slice:1:s orange-juice:1:s'],
  ['b-pb-toast', '식빵 · 땅콩버터 · 바나나 · 우유', 'BS', 'w', 'h', 'dense', 'white-bread:2:c peanut-butter:1:s banana:1:s milk:1:p'],
  ['b-sweetpotato', '고구마 · 삶은 달걀 · 우유', 'BS', 'k', 'hgt', '', 'sweet-potato:1:c egg:2:p milk:1:s'],
  ['b-potato', '찐 감자 · 삶은 달걀 · 사과', 'B', 'k', 'h', 'lean', 'potato:1.5:c egg:2:p apple:1:s'],
  ['b-tteokguk', '떡국', 'B', 'k', 'h', 'pre light', 'tteokguk:1:d kimchi:1:s'],
  ['b-cvs-gimbap', '삼각김밥 · 두유 · 바나나', 'BS', 's', 'gtoh', 'pre', 'triangle-gimbap:1:c soy-milk:1:p banana:1:s'],
  ['b-cvs-sandwich', '샌드위치 · 우유', 'B', 's', 'hto', '', 'sandwich:1:d milk:1:p'],
  ['b-gimbap', '김밥 · 두유', 'BL', 's', 'hto', '', 'gimbap:1:d soy-milk:1:p'],
  ['b-shake-oat', '오트밀 · 단백질 쉐이크 · 바나나', 'B', 'w', 'hg', 'pre rec', 'oatmeal:1:c protein-shake:1:p banana:1:s'],
  ['b-corn-milk', '찐 옥수수 · 삶은 달걀 · 두유', 'B', 'k', 'hg', 'light', 'corn:1:c egg:2:p soy-milk:1:s'],
  ['b-salmon-rice', '현미밥 · 연어 · 방울토마토', 'B', 'k', 'h', 'lean', 'brown-rice:1:c salmon:1:p cherry-tomato:1:s'],

  // 못 먹는 것을 한둘 골라도 · 간편식으로도 · 던지기 전 · 회복 · 입맛 없을 때도 바꿔 넣기 없이 고를 수 있게 더한 틀(2026-10-03)
  ['b-oat-soy-berry', '오트밀 · 두유 · 딸기 · 꿀', 'B', 'w', 'h', 'pre light', 'oatmeal:2:c soy-milk:2:p strawberry:1:s honey:1:s'],
  ['b-rice-tofu-soup', '쌀밥 · 두부 · 미역국', 'B', 'k', 'h', 'light', 'rice:1:c tofu:1:p miyeokguk:1:s'],
  ['b-ricecake-soy', '가래떡 · 두유 · 귤', 'B', 'ks', 'hgt', 'pre', 'garaetteok:2:c soy-milk:2:p mandarin:1:s'],
  ['b-tuna-rice', '즉석밥 · 참치캔 · 김치', 'B', 'ks', 'h', 'rec', 'rice:1:c tuna-can:1:p kimchi:1:s'],
  ['b-greek-sweetpotato', '그릭요거트 · 고구마 · 키위', 'B', 'ws', 'hg', 'pre', 'greek-yogurt:2:p sweet-potato:1:c kiwi:2:s'],
  ['b-bagel-soy', '베이글 · 두유 · 바나나', 'B', 'ws', 'hgo', 'pre', 'bagel:1:c soy-milk:2:p banana:1:s'],
  ['b-pork-rice', '쌀밥 · 돼지 안심 · 미역국 · 방울토마토', 'B', 'k', 'h', 'pre rec', 'rice:1.5:c pork-tenderloin:0.75:p miyeokguk:1:s cherry-tomato:1:s'],
  ['b-thigh-rice', '잡곡밥 · 닭다리살 · 계란말이 · 김치', 'B', 'k', 'h', 'dense rec', 'multigrain-rice:1.5:c chicken-thigh:0.75:p egg-roll:1:s kimchi:1:s'],
  ['b-beef-doenjang', '쌀밥 · 소고기 우둔 · 된장찌개 · 수박', 'B', 'k', 'h', 'heat light', 'rice:1:c beef-lean:0.5:p doenjang-jjigae:1:s watermelon:1:s'],
  ['b-salmon-bagel', '베이글 · 연어 · 방울토마토', 'B', 'w', 'h', 'rec', 'bagel:1:c salmon:1:p cherry-tomato:1:s'],
  ['b-dumpling-soy', '찐만두 · 두유 · 사과', 'B', 'ks', 'h', '', 'dumplings:1.5:d soy-milk:1:p apple:1:s'],
  ['b-chicken-brown', '현미밥 · 닭가슴살 · 브로콜리 · 김치', 'B', 'k', 'h', 'lean', 'brown-rice:1:c chicken-breast:1:p broccoli:1:s kimchi:1:s'],
  ['b-cvs-heat', '삼각김밥 · 삶은 달걀 · 이온음료', 'B', 's', 'hgo', 'heat', 'triangle-gimbap:2:c egg:2:p sports-drink:1:s'],
  ['b-cvs-chicken-rice', '즉석밥 · 닭가슴살 팩 · 바나나', 'B', 's', 'ho', 'pre rec', 'rice:1:c chicken-breast-pack:1:p banana:1:s'],
  ['b-greek-banana-melon', '그릭요거트 · 바나나 · 수박', 'B', 'ws', 'h', 'pre heat', 'greek-yogurt:2:p banana:1.5:c watermelon:1:s'],
  ['b-sirloin-rice', '잡곡밥 · 소고기 등심 · 시금치나물 · 김치', 'B', 'k', 'h', 'dense', 'multigrain-rice:1.5:c beef-sirloin:0.75:p spinach:1:s kimchi:1:s'],
  ['b-oat-eggwhite', '오트밀 · 달걀흰자 · 블루베리', 'B', 'w', 'h', 'lean pre', 'oatmeal:2:c egg-white:4:p blueberry:1:s'],
  ['b-chicken-salad-toast', '닭가슴살 샐러드 · 식빵 · 오렌지주스', 'B', 'w', 'h', 'lean rec', 'chicken-salad:1:p white-bread:2:c orange-juice:1:s'],

  // ── 점심 ──
  ['l-jeyuk-don', '제육덮밥 · 미역국', 'L', 'k', 'tho', 'dense', 'jeyuk-deopbap:1:d miyeokguk:1:s'],
  ['l-bibimbap', '비빔밥 · 미역국', 'LD', 'k', 'tho', '', 'bibimbap:1:d miyeokguk:1:s'],
  ['l-pork-gukbap', '돼지국밥 · 김치', 'LD', 'k', 'o', 'dense rec', 'pork-gukbap:1:d kimchi:1:s'],
  ['l-seolleong', '설렁탕 · 쌀밥 · 김치', 'LD', 'k', 'o', 'rec light', 'seolleongtang:1:p rice:1:c kimchi:1:s'],
  ['l-galbitang', '갈비탕 · 쌀밥', 'LD', 'k', 'o', 'rec', 'galbitang:1:p rice:1:c kimchi:1:s'],
  ['l-kimchi-jjigae', '김치찌개 · 쌀밥 · 계란말이', 'LD', 'k', 'hto', '', 'kimchi-jjigae:1:s rice:1:c egg-roll:1:p'],
  ['l-doenjang-fish', '된장찌개 · 잡곡밥 · 고등어구이', 'LD', 'k', 'hto', 'rec', 'doenjang-jjigae:1:s multigrain-rice:1:c mackerel:1:p'],
  ['l-sundubu', '순두부찌개 · 쌀밥 · 계란말이', 'LD', 'k', 'ho', 'light', 'sundubu-jjigae:1:p rice:1:c egg-roll:1:s'],
  ['l-chicken-salad', '닭가슴살 샐러드 · 고구마', 'LD', 'w', 'hgo', 'lean rec', 'chicken-salad:1:p sweet-potato:1:c'],
  ['l-bulgogi-set', '소불고기 · 잡곡밥 · 시금치나물 · 미역국', 'LD', 'k', 'ht', 'rec', 'bulgogi:1:p multigrain-rice:1:c spinach:1:s miyeokguk:1:s'],
  ['l-curry', '카레라이스 · 삶은 달걀', 'L', 'k', 'ht', '', 'curry-rice:1:d egg:1:p'],
  ['l-omurice', '오므라이스 · 샐러드', 'L', 'w', 'ho', '', 'omurice:1:d salad:1:s'],
  ['l-pasta-chicken', '토마토 파스타 · 닭가슴살', 'LD', 'w', 'ho', 'pre', 'pasta-tomato:1:c chicken-breast:0.75:p'],
  ['l-kalguksu', '칼국수 · 찐만두', 'L', 'k', 'o', 'light', 'kalguksu:1:d dumplings:1:p'],
  ['l-naengmyeon', '물냉면 · 찐만두', 'L', 'k', 'ho', 'heat', 'naengmyeon:1:d dumplings:1:p'],
  ['l-udon-gimbap', '우동 · 삼각김밥 · 삶은 달걀', 'L', 's', 'o', 'pre light', 'udon:1:d triangle-gimbap:1:c egg:2:p'],
  ['l-lunchbox', '편의점 도시락 · 우유', 'L', 's', 'to', '', 'lunchbox:1:d milk-lowfat:1:s'],
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

  // 못 먹는 것을 한둘 골라도 · 간편식으로도 · 던지기 전 · 회복 · 입맛 없을 때도 바꿔 넣기 없이 고를 수 있게 더한 틀(2026-10-03)
  ['l-beef-miyeok', '쌀밥 · 소고기 우둔 · 미역국 · 귤', 'L', 'k', 'ht', 'pre', 'rice:1.5:c beef-lean:0.75:p miyeokguk:1:s mandarin:1:s'],
  ['l-pork-watermelon', '쌀밥 · 돼지 안심 · 된장찌개 · 수박', 'L', 'k', 'ht', 'pre heat', 'rice:1.5:c pork-tenderloin:0.75:p doenjang-jjigae:1:s watermelon:1:s'],
  ['l-chicken-prep', '쌀밥 · 닭가슴살 · 브로콜리 · 방울토마토', 'L', 'w', 'hgt', 'pre', 'rice:1.5:c chicken-breast:1:p broccoli:1:s cherry-tomato:1:s'],
  ['l-tofu-miyeok', '잡곡밥 · 두부 · 미역국 · 김치', 'L', 'k', 'ht', 'light lean', 'multigrain-rice:1:c tofu:1:p miyeokguk:1:s kimchi:1:s'],
  ['l-tuna-rice', '즉석밥 · 참치캔 · 바나나', 'L', 's', 'hgto', 'pre', 'rice:1.5:c tuna-can:1:p banana:1:s'],
  ['l-bagel-chicken', '베이글 · 닭가슴살 팩 · 오렌지주스', 'L', 'ws', 'hgo', 'pre', 'bagel:1:c chicken-breast-pack:1:p orange-juice:1:s'],
  ['l-cvs-tofu', '즉석밥 · 두부 · 두유', 'L', 's', 'gto', 'pre light', 'rice:1.5:c tofu:1:p soy-milk:1:s'],
  ['l-tofu-bowl', '두부 · 샐러드 · 현미밥', 'L', 'ws', 'hgo', 'lean', 'tofu:1.5:p salad:1:s brown-rice:1:c'],
  ['l-sirloin-set', '쌀밥 · 소고기 등심 · 된장찌개 · 김치', 'LD', 'k', 'ho', 'dense rec', 'rice:1.25:c beef-sirloin:1:p doenjang-jjigae:1:s kimchi:1:s'],
  ['l-gimbap-sports', '김밥 · 삶은 달걀 · 이온음료', 'L', 's', 'to', 'heat', 'gimbap:1:d egg:2:p sports-drink:1:s'],
  ['l-dosirak-egg', '쌀밥 · 계란말이 · 멸치볶음 · 잡채', 'L', 'k', 'ht', 'dense', 'rice:1:c egg-roll:2:p anchovy:1:s japchae:1:s'],
  ['l-beef-sweet-prep', '고구마 · 소고기 우둔 · 방울토마토', 'L', 'w', 'hg', 'pre lean', 'sweet-potato:2:c beef-lean:1:p cherry-tomato:1:s'],
  ['l-salmon-set', '쌀밥 · 연어구이 · 된장찌개', 'L', 'k', 'ho', 'rec', 'rice:1.5:c salmon:1:p doenjang-jjigae:1:s'],
  ['l-chicken-kor', '현미밥 · 닭가슴살 · 시금치나물 · 된장찌개', 'L', 'k', 'ht', 'lean rec', 'brown-rice:1:c chicken-breast:0.75:p spinach:1:s doenjang-jjigae:1:s'],
  ['l-thigh-watermelon', '잡곡밥 · 닭다리살 · 미역국 · 수박', 'L', 'k', 'ht', 'heat rec', 'multigrain-rice:1:c chicken-thigh:1:p miyeokguk:1:s watermelon:1:s'],
  ['l-tuna-salad', '고구마 · 참치캔 · 샐러드', 'L', 'ws', 'hgo', 'lean', 'sweet-potato:1.5:c tuna-can:1:p salad:1:s'],
  ['l-gym-heat-chicken', '즉석밥 · 닭가슴살 팩 · 이온음료', 'L', 's', 'gto', 'heat pre', 'rice:1:c chicken-breast-pack:1:p sports-drink:1:s'],
  ['l-gym-heat-tuna', '즉석밥 · 참치캔 · 오렌지주스', 'L', 's', 'gto', 'heat pre', 'rice:1:c tuna-can:1:p orange-juice:1:s'],
  ['l-gym-heat-tofu', '즉석밥 · 두부 · 이온음료 · 귤', 'L', 's', 'gto', 'heat pre', 'rice:1:c tofu:1:p sports-drink:1:s mandarin:1:s'],
  ['l-tofu-doenjang', '쌀밥 · 두부조림 · 된장찌개', 'LD', 'k', 'hto', 'light', 'rice:1:c braised-tofu:1:p doenjang-jjigae:1:s'],
  ['l-soy-sweet', '고구마 · 두유 · 바나나', 'L', 's', 'gto', 'light pre', 'sweet-potato:1:c soy-milk:2:p banana:1:s'],
  ['l-team-heat-beef', '쌀밥 · 소불고기 · 미역국 · 수박', 'L', 'k', 'ht', 'heat', 'rice:1:c bulgogi:1:p miyeokguk:1:s watermelon:1:s'],
  ['l-team-heat-tofu', '잡곡밥 · 두부조림 · 된장찌개 · 수박', 'L', 'k', 'ht', 'heat light', 'multigrain-rice:1:c braised-tofu:1:p doenjang-jjigae:1:s watermelon:1:s'],

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
  ['d-curry-egg', '카레라이스 · 삶은 달걀 · 샐러드', 'D', 'k', 'h', '', 'curry-rice:1:d egg:2:p salad:1:s'],
  ['d-tteokguk-dump', '떡국 · 찐만두', 'D', 'k', 'ho', 'pre light', 'tteokguk:1:d dumplings:1:p'],
  ['d-sundubu-fish', '순두부찌개 · 쌀밥 · 고등어구이', 'D', 'k', 'ho', 'rec', 'sundubu-jjigae:1:s rice:1:c mackerel:1:p'],
  ['d-bulgogi-japchae', '소불고기 · 쌀밥 · 잡채', 'D', 'k', 'h', 'dense', 'bulgogi:1:p rice:1:c japchae:1:s'],
  ['d-chicken-thigh-rice', '닭다리살 · 현미밥 · 방울토마토 · 미역국', 'D', 'k', 'h', 'rec', 'chicken-thigh:1.5:p brown-rice:1:c cherry-tomato:1:s miyeokguk:1:s'],
  ['d-pasta-salmon', '토마토 파스타 · 연어 · 샐러드', 'D', 'w', 'h', '', 'pasta-tomato:1:c salmon:1:p salad:1:s'],

  // 못 먹는 것을 한둘 골라도 · 간편식으로도 · 던지기 전 · 회복 · 입맛 없을 때도 바꿔 넣기 없이 고를 수 있게 더한 틀(2026-10-03)
  ['d-tofu-miyeok-pre', '쌀밥 · 두부조림 · 미역국 · 귤', 'D', 'k', 'h', 'pre light', 'rice:1:c braised-tofu:1:p miyeokguk:1:s mandarin:1:s'],
  ['d-chicken-melon', '쌀밥 · 닭가슴살 · 시금치나물 · 수박', 'D', 'k', 'h', 'pre heat', 'rice:1.5:c chicken-breast:0.75:p spinach:1:s watermelon:1:s'],
  ['d-beef-miyeok-pre', '쌀밥 · 소고기 우둔 · 미역국 · 수박', 'D', 'k', 'h', 'pre heat', 'rice:1.25:c beef-lean:1:p miyeokguk:1:s watermelon:1:s'],
  ['d-salmon-eggroll', '연어 · 쌀밥 · 계란말이 · 미역국', 'D', 'k', 'h', 'rec', 'salmon:1:p rice:1.25:c egg-roll:1:s miyeokguk:1:s'],
  ['d-udon-dumpling', '우동 · 찐만두', 'D', 'k', 'ho', 'pre light', 'udon:1:d dumplings:1:p'],
  ['d-cvs-chicken-salad', '즉석밥 · 닭가슴살 팩 · 샐러드', 'D', 's', 'ho', 'rec lean', 'rice:1:c chicken-breast-pack:1:p salad:1:s'],
  ['d-cvs-tuna-sweet', '고구마 · 참치캔 · 방울토마토', 'D', 's', 'ho', 'lean pre', 'sweet-potato:1.5:c tuna-can:1:p cherry-tomato:1:s'],
  ['d-cvs-tofu-rice', '즉석밥 · 두부 · 김치', 'D', 'ks', 'ho', 'lean', 'rice:1:c tofu:1.5:p kimchi:1:s'],
  ['d-cvs-lunchbox', '편의점 도시락 · 귤', 'D', 's', 'ho', 'dense', 'lunchbox:1:d mandarin:1:s'],
  ['d-greek-sweet', '고구마 · 그릭요거트 · 바나나', 'D', 'ws', 'ho', 'light pre', 'sweet-potato:1.5:c greek-yogurt:2:p banana:1:s'],
  ['d-naeng-pork', '물냉면 · 돼지 안심', 'D', 'k', 'ho', 'heat pre', 'naengmyeon:1:d pork-tenderloin:0.75:p'],
  ['d-pork-sweet-salad', '돼지 안심 · 고구마 · 샐러드', 'D', 'w', 'h', 'lean rec', 'pork-tenderloin:1.25:p sweet-potato:1:c salad:1:s'],
  ['d-pasta-beef', '토마토 파스타 · 소고기 우둔 · 브로콜리', 'D', 'w', 'ho', 'rec', 'pasta-tomato:1:c beef-lean:0.75:p broccoli:1:s'],
  ['d-cvs-tri-salad', '삼각김밥 둘 · 닭가슴살 샐러드', 'D', 's', 'ho', 'rec', 'triangle-gimbap:2:c chicken-salad:1:p'],
  ['d-eggroll-doenjang', '쌀밥 · 계란말이 · 된장찌개 · 시금치나물', 'D', 'k', 'h', 'light', 'rice:1:c egg-roll:1:p doenjang-jjigae:1:s spinach:1:s'],
  ['d-chicken-doenjang', '잡곡밥 · 닭가슴살 · 된장찌개 · 김치', 'D', 'k', 'h', 'lean rec', 'multigrain-rice:1:c chicken-breast:0.75:p doenjang-jjigae:1:s kimchi:1:s'],
  ['d-cvs-egg-rice', '즉석밥 · 삶은 달걀 · 두유 · 방울토마토', 'D', 's', 'ho', 'rec', 'rice:1:c egg:2:p soy-milk:1:s cherry-tomato:1:s'],
  ['d-out-pre-beef', '쌀밥 · 소고기 우둔 · 된장찌개 · 귤', 'D', 'k', 'ho', 'pre', 'rice:1.5:c beef-lean:1:p doenjang-jjigae:1:s mandarin:1:s'],
  ['d-out-pre-chicken', '쌀밥 · 닭가슴살 · 미역국', 'D', 'k', 'ho', 'pre', 'rice:1.5:c chicken-breast:1:p miyeokguk:1:s'],
  ['d-heat-pork', '쌀밥 · 돼지 안심 · 미역국 · 수박', 'D', 'k', 'h', 'heat rec', 'rice:1:c pork-tenderloin:1:p miyeokguk:1:s watermelon:1:s'],
  ['d-heat-tofu', '잡곡밥 · 두부 · 미역국 · 수박', 'D', 'k', 'h', 'heat light', 'multigrain-rice:1:c tofu:1:p miyeokguk:1:s watermelon:1:s'],

  // ── 간식 ──
  ['s-banana-milk', '바나나 · 우유', 'S', 'k', 'hgto', 'rec', 'banana:1:c milk:1:p'],
  ['s-greek-blue', '그릭요거트 · 블루베리', 'S', 'w', 'hg', 'lean bed', 'greek-yogurt:1:p blueberry:1:s'],
  ['s-sweetpotato-milk', '고구마 · 우유', 'S', 'k', 'hgt', 'pre', 'sweet-potato:1:c milk:1:p'],
  ['s-cvs-tri', '삼각김밥 · 두유', 'S', 's', 'gto', '', 'triangle-gimbap:1:c soy-milk:1:p'],
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
  // 못 먹는 것을 한둘 골라도 · 간편식으로도 · 던지기 전 · 회복 · 입맛 없을 때도 바꿔 넣기 없이 고를 수 있게 더한 틀(2026-10-03)
  ['s-tteok-honey-soy', '가래떡 · 꿀 · 두유', 'S', 'k', 'hgt', 'pre', 'garaetteok:1:c honey:0.5:s soy-milk:1:p'],
  ['s-potato-soy', '찐 감자 · 두유', 'S', 'k', 'hgt', 'rec', 'potato:2:c soy-milk:1:p'],
  ['s-sweetpotato-soy', '고구마 · 두유 · 귤', 'S', 'ks', 'hgto', 'pre', 'sweet-potato:1:c soy-milk:1:p mandarin:1:s'],
  ['s-oat-soy-honey', '오트밀 · 두유 · 꿀', 'S', 'w', 'h', 'light pre', 'oatmeal:1:c soy-milk:1:p honey:1:s'],
  ['s-smoothie-soy', '바나나 · 블루베리 · 두유', 'S', 'w', 'h', 'light pre', 'banana:1:c blueberry:1:s soy-milk:1:p'],
  ['s-soy-kiwi', '두유 · 키위', 'S', 'k', 'h', 'bed light', 'soy-milk:1:p kiwi:2:c'],
  ['s-tofu-sweetpotato', '두부 · 고구마 · 방울토마토', 'S', 'k', 'h', 'lean rec', 'tofu:1:p sweet-potato:1:c cherry-tomato:1:s'],
  ['s-egg-banana', '삶은 달걀 · 바나나', 'S', 's', 'hgto', 'rec', 'egg:2:p banana:1:c'],
  ['s-corn-egg', '찐 옥수수 · 삶은 달걀', 'S', 'k', 'hgt', '', 'corn:1:c egg:1:p'],
  ['s-chicken-banana', '닭가슴살 팩 · 바나나', 'S', 's', 'hgto', 'lean rec', 'chicken-breast-pack:1:p banana:1:c'],
  ['s-orange-egg-sports', '오렌지 · 삶은 달걀 · 이온음료', 'S', 's', 'hgt', 'heat pre', 'orange:1:c egg:1:p sports-drink:1:s'],
  ['s-dumplings-kimchi', '찐만두 · 김치', 'S', 'k', 'ho', 'rec', 'dumplings:1:d kimchi:1:s'],
  ['s-banana-pb-soy', '바나나 · 땅콩버터 · 두유', 'S', 'w', 'h', 'dense rec', 'banana:1:c peanut-butter:1:s soy-milk:1:p'],
  ['s-gimbap', '김밥', 'S', 'ks', 'hgto', 'pre', 'gimbap:1:d'],
  ['s-bagel-soy', '베이글 · 두유', 'S', 'ws', 'hgo', 'pre', 'bagel:0.5:c soy-milk:1:p'],
  ['s-toast-cheese', '식빵 · 슬라이스 치즈 · 저지방우유', 'S', 'w', 'h', 'rec', 'white-bread:2:c cheese-slice:1:s milk-lowfat:1:p'],
  ['s-strawberry-milk', '딸기 · 저지방우유', 'S', 'k', 'h', 'light lean', 'strawberry:1.5:c milk-lowfat:1:p'],

  ['s-soy-banana', '두유 · 바나나', 'S', 'ks', 'hgto', 'light bed', 'soy-milk:1:p banana:1:c'],
  ['s-soy-mandarin', '두유 · 귤', 'S', 'k', 'hgto', 'light', 'soy-milk:1:p mandarin:2:c'],
  ['s-sports-sweetpotato', '고구마 · 이온음료', 'S', 'ks', 'hgt', 'heat pre', 'sweet-potato:1:c sports-drink:1:s'],
];

/*
 * ── 못 먹는 것 — 음식마다 무엇이 들었나(빠진 것이 없게 넉넉히: 재료로 흔히 들어가는 것까지) ──
 * 국물 · 양념 · 고명도 센다 — 김치의 젓갈, 된장찌개 · 우동 · 칼국수의 멸치 · 해물 육수, 물냉면의 달걀 · 소고기 육수, 갈비탕의
 * 지단, 설렁탕의 소면, 삼각김밥 참치마요의 마요네즈(달걀), 카레 루의 분유, 멸치볶음의 견과. 밀가루는 밀가루 음식(빵 · 면 ·
 * 튀김옷 · 만두피 · 카레 루)과 주재료로 든 어묵 · 맛살(김밥)로 센다 — 간장 · 고추장에 든 밀까지 치면 한식을 거의 못 짠다.
 * 무엇이 든지 정해지지 않은 묶음(편의점 도시락)은 흔한 구성(돈가스 · 치킨 · 불고기 · 어묵 · 볶음김치)을 모두 센다.
 * 2026-10-04 메인 검토로 더함: 삼계탕의 잣 · 밤, 돼지국밥의 새우젓 · 소면, 오므라이스 볶음밥의 햄 · 소스의 밀가루 · 버터, 두부조림의
 * 고춧가루, 샐러드 드레싱(마요 · 시저 · 요거트 · 견과 토핑), 만두소, 돈가스 튀김옷 · 토마토 파스타 치즈의 우유, 식빵의 달걀, 도시락의
 * 치즈 · 견과 멸치볶음. 이 표는 시험(nutrition-selftest '못 먹는 것 기대표')이 사람이 따로 적은 표와 하나하나 맞춰 본다.
 */
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
    'white-bread',
    'curry-rice',
    'omurice',
    'salad',
    'chicken-salad',
    'tonkatsu',
    'pasta-tomato',
    'lunchbox',
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
    'triangle-gimbap',
    'naengmyeon',
    'sundubu-jjigae',
    'yukgaejang',
    'japchae',
    'lunchbox',
    'galbitang',
    'salad',
    'chicken-salad',
    'dumplings',
    'white-bread',
  ],
  seafood: [
    'tuna-can',
    'tuna-gimbap',
    'salmon',
    'mackerel',
    'anchovy',
    'jjamppong',
    'triangle-gimbap',
    'kimchi',
    'kimchi-jjigae',
    'doenjang-jjigae',
    'sundubu-jjigae',
    'udon',
    'kalguksu',
    'gimbap',
    'lunchbox',
    'pork-gukbap',
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
    'curry-rice',
    'sundubu-jjigae',
    'japchae',
    'tuna-gimbap',
    'omurice',
    'fried-rice',
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
    'naengmyeon',
    'bibimbap',
    'curry-rice',
    'lunchbox',
    'dumplings',
  ],
  chicken: [
    'chicken-breast',
    'chicken-breast-pack',
    'chicken-thigh',
    'fried-chicken',
    'chicken-salad',
    'samgyetang',
    'dakbokkeumtang',
    'lunchbox',
    'dumplings',
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
    'lunchbox',
    'gimbap',
    'tuna-gimbap',
    'seolleongtang',
    'pork-gukbap',
    'omurice',
  ],
  nuts: [
    'almond',
    'mixed-nuts',
    'peanut-butter',
    'protein-bar',
    'anchovy',
    'samgyetang',
    'salad',
    'chicken-salad',
    'lunchbox',
  ],
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
    'lunchbox',
    'braised-tofu',
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
  'egg-roll': ['braised-tofu', 'tofu'],
  'chicken-breast': ['beef-lean', 'pork-tenderloin', 'tofu'],
  'chicken-breast-pack': ['tuna-can', 'beef-lean', 'tofu'],
  'chicken-thigh': ['pork-tenderloin', 'beef-lean', 'tofu'],
  salmon: ['chicken-breast', 'beef-lean', 'tofu'],
  mackerel: ['chicken-thigh', 'pork-tenderloin', 'braised-tofu', 'tofu'],
  'tuna-can': ['chicken-breast-pack', 'tofu'],
  'beef-lean': ['pork-tenderloin', 'chicken-breast', 'tofu'],
  'beef-sirloin': ['pork-neck', 'chicken-thigh', 'tofu'],
  bulgogi: ['jeyuk', 'chicken-thigh', 'braised-tofu', 'tofu'],
  jeyuk: ['bulgogi', 'chicken-thigh', 'braised-tofu', 'tofu'],
  'pork-tenderloin': ['beef-lean', 'chicken-breast', 'tofu'],
  'pork-neck': ['beef-sirloin', 'chicken-thigh', 'tofu'],
  'braised-tofu': ['tofu'],
  'white-bread': ['sweet-potato', 'rice'],
  bagel: ['sweet-potato', 'rice'],
  'pasta-tomato': ['rice', 'brown-rice'],
  'triangle-gimbap': ['sweet-potato', 'banana'],
  kimchi: ['spinach'],
  /* 드레싱이 든 샐러드 → 맨 채소(곁들이가 통째로 빠지지 않게) · 닭가슴살 샐러드 → 단백질 */
  salad: ['broccoli', 'cherry-tomato'],
  'chicken-salad': ['chicken-breast', 'tofu'],
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
