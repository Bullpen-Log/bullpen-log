/**
 * 영양 탭 자가 시험.
 *
 *   npm run nutrition:test
 *
 * 화면에 나오는 숫자가 약속대로 나오는지 본다 — 목표 칼로리, 운동으로 쓴 칼로리,
 * 초성 찾기, 식약처 응답 읽기. DB 는 건드리지 않는다(모두 순수한 계산이다).
 */
import {
  ageOn,
  basalKcal,
  computeTargets,
  DEFAULT_PROFILE,
  type ProfileSettings,
} from '../lib/nutrition/targets.ts';
import { kcalFor, pitchingBurn, trainingBurn } from '../lib/nutrition/burn.ts';
import { choseong, matchScore } from '../lib/nutrition/hangul.ts';
import {
  BASIC_FOODS,
  FOOD_CATEGORIES,
  FOODS_BY_CATEGORY,
  rankFoods,
  searchBasicFoods,
} from '../lib/nutrition/foods.ts';
import { itemsOf, toFood } from '../lib/nutrition/mfds-parse.ts';
import { isNutritionDate } from '../lib/nutrition/days.ts';
import { amountText, scaleMacros } from '../lib/nutrition/meta.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  실패 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const body = { weightKg: 80, heightCm: 180, age: 20 };
const profile: ProfileSettings = { ...DEFAULT_PROFILE, sex: 'M' };

console.log('\n■ 목표 계산');
{
  check('기초대사량 — 남 80kg·180cm·20세 = 1830', basalKcal(80, 180, 20, 'M') === 1830);
  check(
    '여자는 남자보다 166 낮다',
    basalKcal(80, 180, 20, 'M') - basalKcal(80, 180, 20, 'F') === 166
  );

  const t = computeTargets(profile, body, 0);
  check('유지·보통 = 기초대사량 × 1.5, 10 단위', t.base === 2750, `${t.base}`);
  check('단백질 = 체중 × 1.8', t.protein === 144, `${t.protein}g`);
  check('지방 = 하루의 25%', t.fat === 76, `${t.fat}g`);
  check(
    '탄수화물 = 나머지 전부',
    Math.abs(t.carbs * 4 + t.protein * 4 + t.fat * 9 - t.kcal) <= 4,
    `${t.carbs}g`
  );
  check('짐작한 것 없음', t.assumed.length === 0);

  const worked = computeTargets(profile, body, 300);
  check(
    '운동한 날 목표 = 기본 + 쓴 것',
    worked.kcal === t.base + 300 && worked.burn === 300
  );
  check(
    '더 먹을 몫은 탄수화물로 간다',
    worked.carbs > t.carbs && worked.protein === t.protein
  );

  const gain = computeTargets({ ...profile, goal: 'gain' }, body, 0);
  const lose = computeTargets({ ...profile, goal: 'lose' }, body, 0);
  check('증량 +300', gain.base - t.base === 300);
  check('감량 −400', t.base - lose.base === 400);

  const manual = computeTargets({ ...profile, kcalTarget: 2400 }, body, 200);
  check('직접 정한 칼로리가 계산을 이긴다', manual.base === 2400 && manual.manual);
  check('직접 정해도 운동한 만큼은 더한다', manual.kcal === 2600);

  const blank = computeTargets(
    DEFAULT_PROFILE,
    { weightKg: null, heightCm: null, age: null },
    0
  );
  check(
    '비어 있으면 짐작으로 채우고 알린다',
    ['weight', 'height', 'age', 'sex'].every((a) =>
      blank.assumed.includes(a as never)
    ) && blank.weightKg === 75
  );

  const birth = new Date('2005-10-01T00:00:00.000Z');
  check('만 나이 — 생일 전', ageOn(birth, '2026-09-25') === 20);
  check('만 나이 — 생일 당일', ageOn(birth, '2026-10-01') === 21);
  check('생일이 없으면 null', ageOn(null, '2026-09-25') === null);
}

console.log('\n■ 운동으로 쓴 칼로리');
{
  const tr = trainingBurn(45 * 60, 80);
  check('트레이닝 45분·80kg = 252kcal', tr?.kcal === 252, `${tr?.kcal}`);
  check('1분이 안 되면 없음', trainingBurn(20, 80) === null);
  check('휴식은 0', pitchingBurn('휴식', 0, 0, 80) === null);
  const bp = pitchingBurn('불펜', 40, 7, 80);
  check(
    '불펜 40구·강도 7 ≈ 100kcal',
    !!bp && bp.kcal >= 90 && bp.kcal <= 110 && bp.label === '불펜 40구',
    `${bp?.kcal}kcal · ${bp?.minutes}분`
  );
  const soft = pitchingBurn('캐치볼', 40, 1, 80)!;
  const hard = pitchingBurn('경기', 40, 10, 80)!;
  check('강도가 높을수록 더 쓴다', hard.kcal > soft.kcal);
  check('쉬는 몫(1 MET)은 빼고 센다', kcalFor(1, 80, 60) === 0);
}

console.log('\n■ 음식 찾기');
{
  check('초성 — 닭가슴살 → ㄷㄱㅅㅅ', choseong('닭가슴살') === 'ㄷㄱㅅㅅ');
  check('초성으로 찾는다', matchScore('닭가슴살(익힌 것)', 'ㄷㄱㅅㅅ') >= 50);
  check('똑같은 이름이 가장 높다', matchScore('쌀밥', '쌀밥') === 100);
  check(
    '띄어쓰기는 가리지 않는다',
    matchScore('토마토 파스타', '토마토파스타') === 100
  );
  check('안 맞으면 0', matchScore('우유', 'ㄷㄱ') === 0);

  const egg = searchBasicFoods('계란');
  check(
    '다른 이름(계란)으로도 찾고, 딱 맞는 것이 맨 위',
    egg[0]?.id === 'egg',
    egg[0]?.name
  );
  check(
    '초성이 딱 맞는 것(닭가슴살)이 맨 위',
    searchBasicFoods('ㄷㄱㅅㅅ')[0]?.id === 'chicken-breast',
    searchBasicFoods('ㄷㄱㅅㅅ')[0]?.name
  );
  const mineFood = {
    source: 'mine' as const,
    id: 'm1',
    name: '엄마표 닭가슴살 볶음밥',
    servingLabel: '1그릇',
    servingGrams: null,
    kcal: 560,
    carbs: 70,
    protein: 38,
    fat: 12,
  };
  const ranked = rankFoods([mineFood, ...BASIC_FOODS], 'ㄷㄱㅅㅅ');
  check(
    '어중간하게 맞는 내 음식이 딱 맞는 기본 음식을 밀어내지 않는다',
    ranked[0]?.id === 'chicken-breast' && ranked.some((f) => f.id === 'm1')
  );
  check(
    '같은 정도로 맞으면 내 음식이 먼저',
    rankFoods([{ ...mineFood, name: '닭가슴살' }, ...BASIC_FOODS], '닭가슴살')[0]
      ?.id === 'm1'
  );

  const orphan = BASIC_FOODS.filter(
    (f) => !(FOOD_CATEGORIES as readonly string[]).includes(f.note ?? '')
  ).map((f) => f.name);
  check(
    '모든 음식이 분류 안에 있다(전체 음식 탭에서 빠지지 않는다)',
    orphan.length === 0,
    orphan.join(', ')
  );
  const inCategories = [...FOODS_BY_CATEGORY.values()].reduce(
    (n, list) => n + list.length,
    0
  );
  check(
    '분류별로 묶어도 한 가지도 빠지거나 겹치지 않는다',
    inCategories === BASIC_FOODS.length,
    `${inCategories} / ${BASIC_FOODS.length}`
  );

  const ids = BASIC_FOODS.map((f) => f.id);
  check(
    '기본 목록 열쇠가 겹치지 않는다',
    new Set(ids).size === ids.length,
    `${ids.length}가지`
  );

  /*
   * 적어 둔 칼로리가 탄단지와 앞뒤가 맞는지 — 4·4·9 로 셈한 값과 25% 넘게 다르면
   * 숫자를 잘못 옮겨 적은 것이다. 30kcal 아래는 반올림만으로도 크게 흔들려 뺀다.
   */
  const off = BASIC_FOODS.filter((f) => {
    if (f.kcal < 30) return false;
    const est = (f.carbs ?? 0) * 4 + (f.protein ?? 0) * 4 + (f.fat ?? 0) * 9;
    return Math.abs(est - f.kcal) / f.kcal > 0.25;
  }).map((f) => f.name);
  check('기본 목록 칼로리와 탄단지가 앞뒤가 맞는다', off.length === 0, off.join(', '));
}

console.log('\n■ 식약처 응답 읽기');
{
  const rice = toFood({
    FOOD_CD: 'D000006',
    FOOD_NM_KR: '쌀밥',
    DB_GRP_NM: '음식',
    MAKER_NM: '해당없음',
    SERVING_SIZE: '100g',
    Z10500: '210g',
    AMT_NUM1: '143.00',
    AMT_NUM3: '2.50',
    AMT_NUM4: '0.30',
    AMT_NUM6: '31.60',
  });
  check(
    '1회 먹는 양(식품중량)으로 바꾼다',
    rice?.servingLabel === '1회(210g)' && rice.kcal === 300 && rice.carbs === 66.4,
    `${rice?.servingLabel} ${rice?.kcal}kcal 탄 ${rice?.carbs}`
  );
  check("'해당없음' 제조사는 쓰지 않고 분류를 쓴다", rice?.note === '음식');

  const per100 = toFood({
    FOOD_CD: 'R1',
    FOOD_NM_KR: '바나나',
    SERVING_SIZE: '100g',
    AMT_NUM1: 93,
  });
  check(
    '식품중량이 없으면 기준량 그대로',
    per100?.servingLabel === '100g' && per100.kcal === 93
  );

  const drink = toFood({
    FOOD_CD: 'P1',
    FOOD_NM_KR: '이온음료',
    MAKER_NM: '동아오츠카',
    SERVING_SIZE: '100mL',
    Z10500: '500mL',
    AMT_NUM1: '25',
    AMT_NUM6: '6.2',
  });
  check(
    'mL 도 읽는다',
    drink?.servingLabel === '1회(500ml)' &&
      drink.kcal === 125 &&
      drink.note === '동아오츠카'
  );
  check(
    '칼로리가 없으면 버린다',
    toFood({ FOOD_CD: 'X', FOOD_NM_KR: '무엇' }) === null
  );

  check(
    '모양 1 — body.items 배열',
    itemsOf({ body: { items: [{}, {}] } }).length === 2
  );
  check(
    '모양 2 — response.body.items.item 하나',
    itemsOf({ response: { body: { items: { item: {} } } } }).length === 1
  );
  check('엉뚱한 모양은 빈 목록', itemsOf({ oops: true }).length === 0);
}

console.log('\n■ 날짜와 양');
{
  const now = new Date('2026-09-25T03:00:00.000Z');
  check('오늘은 된다', isNutritionDate('2026-09-25', now));
  check('내일은 안 된다', !isNutritionDate('2026-09-26', now));
  check('없는 날짜는 안 된다', !isNutritionDate('2026-02-31', now));
  check('1년 넘은 날은 안 된다', !isNutritionDate('2025-09-01', now));
  check('모양이 틀리면 안 된다', !isNutritionDate('2026-9-25', now));

  check('½인분', amountText(0.5) === '½인분');
  check('1.5인분', amountText(1.5) === '1.5인분');
  check('0.1인분(그램으로 적은 것)', amountText(0.1) === '0.1인분');
  const m = scaleMacros({ kcal: 100, carbs: null, protein: 10, fat: null }, 1.5);
  check(
    '모르는 영양소는 0 으로 더한다',
    m.kcal === 150 && m.carbs === 0 && m.protein === 15
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
