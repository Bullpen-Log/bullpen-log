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
  type Body,
  type ProfileSettings,
} from '../lib/nutrition/targets.ts';
import {
  checkTargetWeight,
  etaWeeks,
  fmtRate,
  goalCopy,
  intakeCheck,
  noiseFloor,
  planOnSave,
  targetRange,
  weightGoal,
  weightTrend,
  type IntakeDay,
  type TargetRange,
  type Trend,
  type WeightGoal,
  type WeightPoint,
} from '../lib/nutrition/weight-goal.ts';
import { shiftDateKey } from '../lib/pitch-stats.ts';
import { kcalFor, pitchingBurn, trainingBurn } from '../lib/nutrition/burn.ts';
import { choseong, matchScore } from '../lib/nutrition/hangul.ts';
import {
  BASIC_FOODS,
  FOOD_CATEGORIES,
  FOODS_BY_CATEGORY,
  rankFoods,
  searchBasicFoods,
} from '../lib/nutrition/foods.ts';
import { itemsOf, pageOf, toFood, type MfdsItem } from '../lib/nutrition/mfds-parse.ts';
import {
  firstRound,
  rankMfds,
  secondRound,
  type MfdsCall,
} from '../lib/nutrition/mfds-rank.ts';
import {
  MFDS_REPS_COUNT,
  MFDS_REPS_DATE,
  findMfdsReps,
} from '../lib/nutrition/mfds-reps.ts';
import {
  recoveryEaten,
  riceBowls,
  throwDayGuide,
  throwDayKind,
  type GuideBody,
  type GuideSignals,
} from '../lib/nutrition/guide.ts';
import { isNutritionDate } from '../lib/nutrition/days.ts';
import {
  browsePage,
  buildBrowseIndex,
  mfdsCategory,
} from '../lib/nutrition/mfds-category.ts';
import { allMfdsReps } from '../lib/nutrition/mfds-reps.ts';
import {
  cleanBarcode,
  expandUpcE,
  gtinValid,
  parseOffProduct,
} from '../lib/nutrition/barcode.ts';
import {
  OTHER_SUB,
  isSubcategory,
  subcategoriesOf,
  subcategoryOf,
} from '../lib/nutrition/food-subcategory.ts';
import { subCounts } from '../lib/nutrition/mfds-category.ts';
import {
  amountForGrams,
  matchBasicFood,
  matchPhotoFoods,
  pickMfdsRep,
  type PhotoFood,
} from '../lib/nutrition/photo-match.ts';
import {
  MEAL_TEMPLATES,
  SUBSTITUTES,
  SUPPLEMENTS,
  TEMPLATE_PROBLEMS,
  avoidsOf,
  type MealTemplate,
} from '../lib/nutrition/meal-templates.ts';
import {
  KCAL_BOOST,
  MAX_PER_MEAL,
  PROTEIN_BOOST,
  amountStep,
  buildMealPlan,
  dropAvoided,
  parsePlanContext,
  parsePlanItems,
  planMacros,
  recentTemplates,
  type PlanInput,
} from '../lib/nutrition/meal-plan.ts';
import { AVOIDS } from '../lib/nutrition/diet-prefs.ts';
import {
  DEFAULT_PREFS,
  cleanDietPrefs,
  toDietPrefs,
} from '../lib/nutrition/diet-prefs.ts';
import {
  COMBO_ITEMS_MAX,
  COMBO_NAME_MAX,
  comboMacros,
  comboSignature,
  comboView,
  defaultComboName,
  findCombo,
  itemsFromEntries,
  orderCombos,
  parseComboItems,
  type MealComboView,
} from '../lib/nutrition/combos.ts';
import {
  MEAL_PROTEIN_RANGE,
  mealProtein,
  mealProteinGoal,
  proteinTip,
} from '../lib/nutrition/meal-protein.ts';
import {
  amountText,
  macroGaps,
  missingMacros,
  missingText,
  scaleMacros,
  sumMacros,
  type MealEntryView,
} from '../lib/nutrition/meta.ts';
import {
  AGE_RULES,
  ageBand,
  defaultPace,
  effectiveAdjust,
  effectiveGoal,
  effectiveProtein,
  paceChoices,
  storedRate,
} from '../lib/nutrition/age.ts';
import {
  gradeText,
  levelAgeProblem,
  levelFit,
  normalizeLevel,
} from '../lib/baseline.ts';

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

/* 성별은 계정(User.sex)에서 몸 정보로 실려 온다 — 목표 설정(profile)에는 없다 */
const body = { weightKg: 80, heightCm: 180, age: 20, sex: 'M' as const };
const profile: ProfileSettings = { ...DEFAULT_PROFILE };

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

  const female = computeTargets(profile, { ...body, sex: 'F' }, 0);
  check(
    '성별은 몸 정보(계정)에서 온다 — 여자면 기초대사량이 166 낮다',
    t.bmr - female.bmr === 166,
    `${t.bmr} → ${female.bmr}`
  );

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
    { weightKg: null, heightCm: null, age: null, sex: null },
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
  const soup = toFood({
    FOOD_CD: 'D101-1',
    FOOD_NM_KR: '해장국',
    SERVING_SIZE: '100g',
    Z10500: '1,000.000g',
    AMT_NUM1: '71.00',
  });
  check(
    '1회 중량의 천 단위 쉼표를 읽는다 — 해장국 1,000g',
    soup?.servingLabel === '1회(1000g)' && soup.kcal === 710,
    `${soup?.servingLabel} ${soup?.kcal}kcal`
  );
  const box = toFood({
    FOOD_CD: 'P101-1',
    FOOD_NM_KR: '프로틴바(더블초콜릿청크)',
    SERVING_SIZE: '100g',
    Z10500: '720g',
    AMT_NUM1: '219',
  });
  check(
    '가공식품의 포장 전체 중량(500g 초과)은 1회로 치지 않는다',
    box?.servingLabel === '100g' && box.kcal === 219,
    `${box?.servingLabel} ${box?.kcal}kcal`
  );
  const bowl = toFood({
    FOOD_CD: 'D101-2',
    FOOD_NM_KR: '국밥_돼지머리',
    SERVING_SIZE: '100g',
    Z10500: '900.000g',
    AMT_NUM1: '137.000',
  });
  check(
    '음식의 900g 은 한 그릇 그대로',
    bowl?.servingLabel === '1회(900g)' && bowl.kcal === 1233
  );
  const same = toFood({
    FOOD_CD: 'D301-1',
    FOOD_NM_KR: '쌀밥',
    SERVING_SIZE: '100g',
    Z10500: '100.000g',
    AMT_NUM1: '166.000',
  });
  check(
    "중량이 기준량과 같으면 그냥 '100g'",
    same?.servingLabel === '100g' && same.kcal === 166
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

  const ok = pageOf({
    header: { resultCode: '00' },
    body: { totalCount: 1835, items: [{}, {}] },
  });
  check('한 쪽 — 전체 수와 줄들', ok?.total === 1835 && ok.items.length === 2);
  const none = pageOf({ header: { resultCode: '00' }, body: { totalCount: 0 } });
  check(
    '0건은 오류가 아니다(items 칸이 없다)',
    none?.total === 0 && none.items.length === 0
  );
  check(
    '결과 코드가 00 이 아니면 정상 응답이 아니다',
    pageOf({ header: { resultCode: '22' }, body: { totalCount: 5 } }) === null
  );
}

console.log('\n■ 식약처 검색 — 무엇을 모으고 어떤 순서로');
{
  const names = (items: MfdsItem[]) => items.map((x) => String(x.FOOD_NM_KR));
  const has = (calls: MfdsCall[], term: string, cls: string, page: number | 'last') =>
    calls.some((c) => c.term === term && c.cls === cls && c.page === page);
  /** 앱이 품목대표로 모으는 줄 — 1차의 품목대표 말을 넣어 둔 자료에서 */
  const repPool = (q: string) => {
    const pool = new Map<string, MfdsItem>();
    for (const c of firstRound(q)) {
      if (c.cls !== '품목대표') continue;
      for (const it of findMfdsReps(c.term)) pool.set(String(it.FOOD_CD), it);
    }
    return [...pool.values()];
  };
  const top = (q: string) => names(rankMfds(q, repPool(q)))[0];

  check(
    '넣어 둔 품목대표는 8천 줄이 넘는다',
    MFDS_REPS_COUNT > 8000,
    `${MFDS_REPS_COUNT}줄 · ${MFDS_REPS_DATE}`
  );
  check(
    "'바나나'에 생바나나가 들어 있다",
    names(findMfdsReps('바나나')).includes('바나나, 생것')
  );
  check('빈 말은 찾지 않는다', findMfdsReps(' ').length === 0);

  check(
    '1차 — 검색어의 품목대표와 1쪽',
    has(firstRound('바나나'), '바나나', '품목대표', 1) &&
      has(firstRound('바나나'), '바나나', '', 1)
  );
  check(
    '표준 표기로도 찾는다 — 계란 → 달걀',
    has(firstRound('계란'), '달걀', '품목대표', 1)
  );
  check(
    "동물 + 부위 — 닭가슴살 → '닭고기, 가슴'",
    has(firstRound('닭가슴살'), '닭고기, 가슴', '품목대표', 1)
  );
  check(
    '조리 앞말은 떼고 재료로 — 구운계란 → 달걀',
    has(firstRound('구운계란'), '달걀', '품목대표', 1)
  );
  check('영어도 — banana → 바나나', firstRound('banana')[0]?.term === '바나나');
  check(
    '수량 말은 뗀다 — 바나나 한 개',
    firstRound('바나나 한 개')[0]?.term === '바나나'
  );
  check(
    '빈 검색어는 부르지 않는다',
    firstRound('  ').length === 0 && firstRound(',').length === 0
  );
  check(
    '2차 — 상품 이름 같은 말은 마지막 쪽',
    has(
      secondRound('그릭요거트', { total: 586, repTotal: 1 }),
      '그릭요거트',
      '',
      'last'
    )
  );
  check(
    "2차 — 품목대표가 많으면 '검색어,'(원재료 이름만)",
    has(secondRound('소고기', { total: 1818, repTotal: 396 }), '소고기,', '품목대표', 1)
  );
  check('수를 모르면 2차는 없다', secondRound('그릭요거트', null).length === 0);

  check("'바나나' 1위는 생바나나", top('바나나') === '바나나, 생것', top('바나나'));
  check("'계란' 1위는 삶은 달걀", top('계란') === '달걀_삶은것', top('계란'));
  check("'김치찌개' 1위는 김치찌개", top('김치찌개') === '김치찌개', top('김치찌개'));
  check(
    "'닭가슴살' 1위는 닭고기 가슴 생것",
    top('닭가슴살') === '닭고기, 가슴, 생것',
    top('닭가슴살')
  );
  check(
    "'삶은계란'은 삶은 달걀이 먼저",
    top('삶은계란') === '달걀_삶은것',
    top('삶은계란')
  );
  check("'우유' 1위는 우유", top('우유') === '우유', top('우유'));

  /* 상품이 섞인 풀 — 포털 1쪽이 주는 것들 */
  const product = (
    cd: string,
    name: string,
    maker: string,
    kcal: string,
    extra = {}
  ) => ({
    FOOD_CD: cd,
    FOOD_NM_KR: name,
    DB_GRP_CM: cd[0],
    DB_CLASS_NM: '상용제품',
    MAKER_NM: maker,
    SERVING_SIZE: '100g',
    Z10500: '70g',
    AMT_NUM1: kcal,
    AMT_NUM3: '5',
    AMT_NUM4: '20',
    AMT_NUM6: '45',
    ...extra,
  });
  const mixed = [
    product('D202-111000000-0001', '도넛_바나나크림도넛(1개입)', '파리바게뜨', '402'),
    product('D202-111000000-0002', '와플_바나나누텔라 와플', '와플칸', '380'),
    ...repPool('바나나'),
  ];
  const before = JSON.stringify(mixed);
  const ranked = rankMfds('바나나', mixed);
  check(
    '도넛 · 와플이 앞에 있어도 생바나나가 1위',
    names(ranked)[0] === '바나나, 생것' &&
      names(ranked).indexOf('도넛_바나나크림도넛(1개입)') > 3,
    names(ranked).slice(0, 3).join(' / ')
  );
  check('받은 줄은 바꾸지 않는다', JSON.stringify(mixed) === before);
  check(
    '합친 순서가 달라도 같은 결과',
    JSON.stringify(names(rankMfds('바나나', [...mixed].reverse()))) ===
      JSON.stringify(names(ranked))
  );

  const sizes = rankMfds('아메리카노', [
    product('D201-001000000-0001', '커피_아메리카노 (Tall)', '별다방', '5', {
      SERVING_SIZE: '100mL',
      Z10500: '355mL',
    }),
    product('D201-001000000-0002', '커피_아메리카노 (Grande)', '별다방', '5', {
      SERVING_SIZE: '100mL',
      Z10500: '473mL',
    }),
    product('D201-001000000-0003', '커피_아메리카노 (Tall)', '달다방', '9', {
      AMT_NUM6: '2',
      SERVING_SIZE: '100mL',
      Z10500: '355mL',
    }),
  ]);
  check(
    '같은 회사의 크기만 다른 메뉴는 한 줄로 접는다',
    sizes.length === 2,
    `${sizes.length}줄`
  );

  check(
    '우연히 글자만 든 줄뿐이면 빈 결과 — 콜라 ↔ 콜라비',
    rankMfds('콜라', [
      product('R1', '콜라비, 생것', '', '22', { DB_CLASS_NM: '품목대표' }),
    ]).length === 0
  );
  check(
    '빈 풀 · 빈 검색어는 빈 결과',
    rankMfds('바나나', []).length === 0 && rankMfds('', mixed).length === 0
  );
}

console.log('\n■ 던지는 날 가이드');
{
  const at = '2026-09-30T05:00:00.000Z';
  const sig = (over: Partial<GuideSignals> = {}): GuideSignals => ({
    planToday: null,
    planYesterday: null,
    appetite: null,
    pitches: [],
    ...over,
  });
  const adult: GuideBody = { weightKg: 75, ageBand: 'adult', goal: 'maintain' };
  const game = (pitchCount = 85) => [{ sessionType: '경기', pitchCount, loggedAt: at }];

  check('신호가 없으면 아무것도 안 띄운다', throwDayGuide(sig(), adult) === null);
  check(
    "'없음'이라 적은 날도 안 띄운다",
    throwDayKind(sig({ planToday: '없음' })) === null
  );
  check(
    '오늘 등판 · 오늘 불펜 → 던지는 날',
    throwDayKind(sig({ planToday: '오늘 등판' })) === 'today' &&
      throwDayKind(sig({ planToday: '오늘 불펜' })) === 'today'
  );
  check('내일 등판 → 전날', throwDayKind(sig({ planToday: '내일 등판' })) === 'eve');
  check(
    "어제 '내일 등판'이라 적었으면 오늘 체크인이 없어도 던지는 날",
    throwDayKind(sig({ planYesterday: '내일 등판' })) === 'today'
  );
  check(
    "어제 '내일 등판'이어도 오늘 '없음'이면 오늘 적은 쪽을 따른다",
    throwDayKind(sig({ planYesterday: '내일 등판', planToday: '없음' })) === null
  );
  check(
    '비로 밀려 오늘도 내일 등판이면 전날',
    throwDayKind(sig({ planYesterday: '내일 등판', planToday: '내일 등판' })) === 'eve'
  );
  check(
    '투구 기록이 있으면 일정과 상관없이 던진 뒤',
    throwDayKind(sig({ planToday: '오늘 등판', pitches: game() })) === 'after'
  );
  check(
    '캐치볼 · 쉰 날 · 0구는 던진 것으로 안 친다',
    throwDayKind(
      sig({
        pitches: [
          { sessionType: '캐치볼', pitchCount: 40, loggedAt: at },
          { sessionType: '휴식', pitchCount: 0, loggedAt: at },
          { sessionType: '불펜', pitchCount: 0, loggedAt: at },
        ],
      })
    ) === null
  );

  const pre = throwDayGuide(sig({ planToday: '오늘 등판' }), adult);
  check(
    '등판 전 식사 — 75kg 이면 탄수화물 110g(1.5g/kg), 쌀밥 1공기 반',
    pre?.badge === '오늘 등판' &&
      Boolean(pre.lines[0].includes('110g') && pre.lines[0].includes('1공기 반')),
    pre?.lines[0]
  );
  const bullpen = throwDayGuide(sig({ planToday: '오늘 불펜' }), adult);
  check(
    '불펜 전 식사는 평소 한 끼쯤 — 80g(1g/kg)',
    bullpen?.badge === '오늘 불펜' && Boolean(bullpen.lines[0].includes('80g')),
    bullpen?.lines[0]
  );
  const eve = throwDayGuide(sig({ planToday: '내일 등판' }), adult);
  check(
    '전날 — 저녁 탄수화물을 넉넉히',
    eve?.kind === 'eve' && eve.title.includes('탄수화물')
  );
  check(
    '밥 공기 — 66g 1공기 · 110g 1공기 반 · 30g 도 적어도 1공기',
    riceBowls(66) === '1공기' &&
      riceBowls(110) === '1공기 반' &&
      riceBowls(30) === '1공기'
  );

  const after = throwDayGuide(sig({ pitches: game() }), adult);
  check(
    '던진 뒤 — 75kg 이면 단백질 25g(0.3g/kg) + 탄수화물 80g',
    after?.kind === 'after' &&
      after.badge === '경기 85구 뒤' &&
      after.recoveryProtein === 25 &&
      after.lines[0].includes('단백질 25g') &&
      after.lines[0].includes('탄수화물 80g'),
    after?.lines[0]
  );
  check(
    '단백질은 20~40g 사이 — 50kg 은 20g, 150kg 은 40g',
    throwDayGuide(sig({ pitches: game() }), { ...adult, weightKg: 50 })
      ?.recoveryProtein === 20 &&
      throwDayGuide(sig({ pitches: game() }), { ...adult, weightKg: 150 })
        ?.recoveryProtein === 40
  );
  const child = throwDayGuide(sig({ pitches: game(40) }), {
    weightKg: 35,
    ageBand: 'child',
    goal: 'maintain',
  });
  check(
    '어린이는 15g 부터 · 보충제 없이 음식으로',
    child?.recoveryProtein === 15 && child.notes.some((n) => n.includes('보충제 없이')),
    `${child?.recoveryProtein}g`
  );
  check(
    '성인에게는 보충제 말을 하지 않는다',
    !after?.notes.some((n) => n.includes('보충제'))
  );
  const unknown = throwDayGuide(sig({ pitches: game() }), { ...adult, weightKg: null });
  check(
    '체중을 모르면 g 을 지어내지 않는다 — 20~40g 으로 말한다',
    unknown?.recoveryProtein === null && Boolean(unknown?.lines[0].includes('20~40g')),
    unknown?.lines[0]
  );
  check(
    '여러 번 던진 날 — 가장 많이 던진 것을 이름표로, 그 세션의 기록 시각을 기준으로',
    (() => {
      const g = throwDayGuide(
        sig({
          pitches: [
            {
              sessionType: '불펜',
              pitchCount: 30,
              loggedAt: '2026-09-30T02:00:00.000Z',
            },
            {
              sessionType: '경기',
              pitchCount: 70,
              loggedAt: '2026-09-30T09:00:00.000Z',
            },
          ],
        }),
        adult
      );
      return g?.badge === '경기 70구 뒤' && g.thrownAt === '2026-09-30T09:00:00.000Z';
    })()
  );
  check(
    '일정을 안 적고 던진 날에만 체크인 알림',
    Boolean(after?.hint) &&
      throwDayGuide(sig({ planToday: '오늘 등판', pitches: game() }), adult)?.hint ===
        null &&
      throwDayGuide(sig({ planYesterday: '내일 등판', pitches: game() }), adult)
        ?.hint === null
  );
  check(
    '던진 날 내일 등판이면 저녁 탄수화물 한 줄',
    Boolean(
      throwDayGuide(
        sig({ planToday: '내일 등판', pitches: game() }),
        adult
      )?.lines.some((l) => l.includes('내일 등판이'))
    )
  );
  const fromYesterday = throwDayGuide(sig({ planYesterday: '내일 등판' }), adult);
  check(
    "어제 '내일 등판'으로 알게 된 날은 등판 기준(110g)으로 안내한다",
    fromYesterday?.badge === '오늘 등판' &&
      Boolean(fromYesterday.lines[0].includes('110g')),
    fromYesterday?.lines[0]
  );
  check(
    '라이브 피칭도 던진 것으로 친다',
    throwDayGuide(
      sig({ pitches: [{ sessionType: '라이브', pitchCount: 25, loggedAt: at }] }),
      adult
    )?.badge === '라이브 25구 뒤'
  );
  const teen = throwDayGuide(sig({ pitches: game(60) }), {
    weightKg: 50,
    ageBand: 'teen',
    goal: 'maintain',
  });
  check(
    '청소년은 20g 부터 · 보충제 없이 음식으로',
    teen?.recoveryProtein === 20 && teen.notes.some((n) => n.includes('보충제 없이')),
    `${teen?.recoveryProtein}g`
  );
  const small = throwDayGuide(sig({ planToday: '오늘 불펜' }), {
    weightKg: 30,
    ageBand: 'child',
    goal: 'maintain',
  });
  check(
    '몸이 작아도 던지기 전 식사는 밥 한 공기(70g)부터 — g 과 공기가 어긋나지 않는다',
    Boolean(
      small?.lines[0].includes('70g') &&
      small.lines[0].includes('1공기쯤') &&
      riceBowls(70) === '1공기'
    ),
    small?.lines[0]
  );
  const warmup = throwDayGuide(
    sig({
      planToday: '오늘 등판',
      pitches: [{ sessionType: '불펜', pitchCount: 5, loggedAt: at }],
    }),
    adult
  );
  check(
    '등판일에 몸풀기 불펜만 적었으면 회복식 카드에 등판 전 식사 한 줄을 남긴다',
    warmup?.kind === 'after' &&
      warmup.lines.some((l) => l.includes('아직 등판 전이라면')) &&
      !throwDayGuide(
        sig({ planToday: '오늘 등판', pitches: game() }),
        adult
      )?.lines.some((l) => l.includes('아직 등판 전이라면')) &&
      !throwDayGuide(
        sig({
          planToday: '오늘 불펜',
          pitches: [{ sessionType: '불펜', pitchCount: 30, loggedAt: at }],
        }),
        adult
      )?.lines.some((l) => l.includes('아직 등판 전이라면'))
  );
  check(
    '보기로 든 조합은 첫 줄의 단백질을 실제로 채운다(기본 음식 값으로)',
    (() => {
      const p = (id: string) => BASIC_FOODS.find((f) => f.id === id)?.protein ?? 0;
      const others = [
        p('rice') + p('chicken-breast-pack'),
        p('milk') * 2 + p('egg') * 2 + p('banana'),
        p('triangle-gimbap') * 2 + p('egg') * 2,
      ];
      const kids = [
        p('rice') + p('egg') * 2,
        p('milk') * 2 + p('banana'),
        p('triangle-gimbap') + p('egg') * 2,
      ];
      /* 그 밖은 목표 20~25g(체중 92kg 까지), 어린이는 15g 을 기준으로 — 8할이면 챙긴 것이다 */
      return (
        others.every((g) => Math.round(g) >= 25 * 0.8) &&
        kids.every((g) => Math.round(g) >= 15 * 0.8)
      );
    })()
  );
  check(
    '입맛이 없는 날(적음 이하)만 덧말',
    Boolean(
      throwDayGuide(sig({ planToday: '오늘 등판', appetite: 2 }), adult)?.notes.some(
        (n) => n.includes('입맛')
      )
    ) &&
      !throwDayGuide(sig({ planToday: '오늘 등판', appetite: 3 }), adult)?.notes.some(
        (n) => n.includes('입맛')
      )
  );
  check(
    '감량 중이면 끼니를 줄이지 말라는 덧말',
    Boolean(
      throwDayGuide(sig({ planToday: '내일 등판' }), {
        ...adult,
        goal: 'lose',
      })?.notes.some((n) => n.includes('감량'))
    )
  );

  /* 회복식을 챙겼나 — 던진 뒤에 담은 음식만 센다 */
  const meal = (
    protein: number | null,
    loggedAt?: string,
    amount = 1,
    slot: MealEntryView['meal'] = 'dinner'
  ): MealEntryView => ({
    id: 'x',
    meal: slot,
    name: 'x',
    source: 'basic',
    sourceId: 'x',
    servingLabel: null,
    servingGrams: null,
    amount,
    kcal: 100,
    carbs: 10,
    protein,
    fat: 1,
    loggedAt,
  });
  const g = after!;
  check(
    '던지기 전에 담은 것은 안 센다',
    recoveryEaten([meal(30, '2026-09-30T01:00:00.000Z')], g) === null
  );
  const some = recoveryEaten([meal(12, '2026-09-30T06:00:00.000Z')], g);
  check(
    '던진 뒤 담은 단백질 12g — 아직 채우지 못함',
    some?.protein === 12 && some.done === false
  );
  const done = recoveryEaten([meal(10, '2026-09-30T06:00:00.000Z', 2)], g);
  check(
    '목표의 8할(25g 중 20g)이면 챙긴 것으로',
    done?.protein === 20 && done.done === true
  );
  check('방금 담아 시각이 없는 줄도 센다', recoveryEaten([meal(25)], g)?.done === true);
  check(
    '단백질을 모르는 음식은 0 으로 — 아무 말도 안 한다',
    recoveryEaten([meal(null)], g) === null
  );
  check('던진 뒤가 아닌 날에는 세지 않는다', recoveryEaten([meal(30)], pre!) === null);
  check(
    '19g 은 아직(25g 의 8할은 20g)',
    recoveryEaten([meal(19, '2026-09-30T06:00:00.000Z')], g)?.done === false
  );
  check(
    '투구 기록과 같은 순간에 담은 것도 센다',
    recoveryEaten([meal(25, at)], g)?.done === true
  );
  check(
    '체중을 몰라 목표가 없으면 아무리 먹어도 챙겼다고 하지 않는다',
    recoveryEaten([meal(50)], unknown!)?.done === false
  );
  /* 저녁에 하루치를 몰아 적는 사람 — 투구 기록 뒤에 담았어도 이미 지난 끼니 칸은 던지기 전에 먹은 것이다 */
  const evening = throwDayGuide(
    sig({
      pitches: [
        { sessionType: '경기', pitchCount: 85, loggedAt: '2026-09-30T08:00:00.000Z' },
      ],
    }),
    adult
  )!;
  check(
    '오후 5시에 기록을 남겼으면 그 뒤에 적은 아침 · 점심 칸은 안 센다',
    recoveryEaten(
      [
        meal(30, '2026-09-30T09:00:00.000Z', 1, 'breakfast'),
        meal(30, '2026-09-30T09:00:00.000Z', 1, 'lunch'),
      ],
      evening
    ) === null &&
      recoveryEaten([meal(30, '2026-09-30T09:00:00.000Z', 1, 'dinner')], evening)
        ?.done === true &&
      recoveryEaten([meal(30, '2026-09-30T09:00:00.000Z', 1, 'snack')], evening)
        ?.done === true
  );
  const morning = throwDayGuide(
    sig({
      pitches: [
        { sessionType: '불펜', pitchCount: 40, loggedAt: '2026-09-30T01:30:00.000Z' },
      ],
    }),
    adult
  )!;
  check(
    '오전 10시 반에 기록을 남겼으면 그 뒤의 아침 · 점심 칸은 센다',
    recoveryEaten([meal(25, '2026-09-30T03:00:00.000Z', 1, 'lunch')], morning)?.done ===
      true &&
      recoveryEaten([meal(25, '2026-09-30T02:00:00.000Z', 1, 'breakfast')], morning)
        ?.done === true
  );
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

console.log('\n■ 모르는 영양소 표시');
{
  check(
    '탄·지가 비면 둘을 짚는다',
    missingMacros({ carbs: null, protein: 26, fat: null }).join() === 'carbs,fat'
  );
  check("'탄·지 모름'", missingText(['carbs', 'fat']) === '탄·지 모름');
  const e = (
    carbs: number | null,
    protein: number | null,
    fat: number | null
  ): MealEntryView => ({
    id: 'x',
    meal: 'lunch',
    name: 'x',
    source: 'mfds',
    sourceId: 'x',
    servingLabel: null,
    servingGrams: null,
    amount: 1,
    kcal: 100,
    carbs,
    protein,
    fat,
  });
  const g = macroGaps([e(10, 5, 1), e(null, 26, null), e(null, 3, null)]);
  check(
    '하루 합계에서 빠진 음식 수',
    g.foods === 2 && g.carbs === 2 && g.fat === 2 && g.protein === 0
  );
}

console.log('\n■ 나이에 맞춘 영양 기준');
{
  check(
    '만 12세 어린이 · 13세 성장기 · 18세 성인',
    ageBand(12) === 'child' && ageBand(13) === 'teen' && ageBand(18) === 'adult'
  );
  check('나이를 모르면 성인', ageBand(null) === 'adult');
  check(
    '18세 밑은 Schofield — 남 65kg 15세 = 1808',
    Math.round(basalKcal(65, 170, 15, 'M')) === 1808
  );
  check(
    '18세부터 Mifflin — 남 65kg 170cm 18세 = 1628',
    Math.round(basalKcal(65, 170, 18, 'M')) === 1628
  );
  check(
    '안 정한 단백질은 나이 기본값',
    effectiveProtein(null, 15) === 1.5 &&
      effectiveProtein(null, 11) === 1.2 &&
      effectiveProtein(null, 25) === 1.8
  );
  check('성장기는 1.8 을 넘지 않는다', effectiveProtein(2.2, 15) === 1.8);
  check('성인은 정한 값 그대로', effectiveProtein(2.2, 25) === 2.2);
  check(
    '어린이 감량은 유지로 셈한다',
    effectiveGoal('lose', 11) === 'maintain' && effectiveGoal('lose', 15) === 'lose'
  );
  const body15 = { weightKg: 65, heightCm: 172, age: 15, sex: 'M' as const };
  const keep = computeTargets(DEFAULT_PROFILE, body15, 0);
  const lose = computeTargets({ ...DEFAULT_PROFILE, goal: 'lose' }, body15, 0);
  check(
    '성장기 감량은 하루 −200kcal',
    keep.base - lose.base === 200,
    `${keep.base} → ${lose.base}`
  );
}

console.log('\n■ 소속과 생년월일');
{
  const T = '2026-09-30';
  check(
    '2011년생은 2026년 가을에 중3',
    gradeText(levelFit('2011-05-01', T).grade!) === '중학교 3학년'
  );
  check(
    '1·2월은 지난 학년도',
    gradeText(levelFit('2011-01-15', '2026-02-10').grade!) === '중학교 2학년'
  );
  const mid = levelFit('2011-05-01', T);
  check(
    '중3 나이 — 중학교를 먼저, 고등학교까지',
    mid.suggested === '중학교' && mid.allowed.join() === '중학교,고등학교'
  );
  const adult = levelFit('1990-01-01', T);
  check(
    '어른 — 학교는 못 고르고 먼저 고르지 않는다',
    adult.suggested === null && !adult.allowed.includes('고등학교')
  );
  check('생년월일을 모르면 모두 고를 수 있다', levelFit(null, T).allowed.length === 7);
  check('중3 나이에 프로는 막는다', levelAgeProblem('프로', '2011-05-01', T) !== null);
  check('어른의 사회인은 통과', levelAgeProblem('사회인', '1990-01-01', T) === null);
  check(
    '예전 값은 옮겨 읽는다',
    normalizeLevel('사회인·동호회') === '사회인' &&
      normalizeLevel('실업·프로') === '프로'
  );
}

console.log('\n■ 체중 목표와 조정');
{
  const D = '2026-09-30';
  const ago = (n: number) => shiftDateKey(D, -n);
  const mk = (list: [number, number][]): WeightPoint[] =>
    list.map(([n, kg]) => ({ date: ago(n), kg }));
  const wig = [0.3, -0.4, 0.1, 0.5, -0.2, -0.5, 0.2];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  /* 매일 잰 기록 — 하루 perDay 씩 움직이고 ±0.5kg 흔들린다 */
  const series = (days: number, start: number, perDay: number) =>
    mk(
      Array.from(
        { length: days + 1 },
        (_, k) => [days - k, r1(start + perDay * k + wig[k % 7])] as [number, number]
      )
    );
  const from = ago(55);
  const near = (a: number, b: number, tol = 0.002) => Math.abs(a - b) <= tol;
  const ok = (t: Trend) => {
    if (!t.ok) throw new Error(`추세가 없다: ${t.reason}`);
    return t;
  };
  const miss = (t: Trend) => {
    if (t.ok) throw new Error('추세가 있다');
    return t;
  };

  /* ── 추세 ── */
  check(
    '하루 흔들림의 사전값 — 35kg 0.3 · 80kg 0.64 · 110kg 0.8',
    noiseFloor(35) === 0.3 && near(noiseFloor(80), 0.64) && noiseFloor(110) === 0.8
  );
  const five = ok(
    weightTrend(
      mk([
        [21, 80.0],
        [16, 80.2],
        [10, 80.4],
        [5, 80.6],
        [0, 80.75],
      ]),
      from,
      D
    )
  );
  check(
    '5번 / 21일 — 주 +0.25kg 이지만 아직 또렷하지 않다(표준오차 0.27)',
    five.rate20 === 5 &&
      near(five.se, 0.271) &&
      five.kind === 'noisy' &&
      near(five.currentKg, 80.76, 0.01),
    `se ${five.se.toFixed(3)}`
  );
  const three = miss(
    weightTrend(
      mk([
        [20, 80],
        [10, 80.3],
        [0, 80.5],
      ]),
      from,
      D
    )
  );
  check('3번뿐 — 1번 더', three.reason === 'few' && three.needPoints === 1);
  const nine = miss(
    weightTrend(
      mk([
        [9, 80],
        [6, 80.3],
        [3, 80.1],
        [0, 80.5],
      ]),
      from,
      D
    )
  );
  check('4번 / 9일 — 5일 더', nine.reason === 'short' && nine.needDays === 5);
  const bunched = miss(
    weightTrend(
      mk([
        [20, 80],
        [19, 80.3],
        [18, 80.1],
        [8, 80.5],
      ]),
      from,
      D
    )
  );
  check(
    '앞에 몰린 기록 — 날은 찼으니 오늘 재면 된다',
    bunched.reason === 'short' && bunched.needDays === 0
  );
  const stale = miss(
    weightTrend(
      mk([
        [40, 80],
        [30, 80.3],
        [20, 80.1],
        [11, 80.5],
      ]),
      from,
      D
    )
  );
  check(
    '마지막 기록이 11일 전 — 말하지 않는다',
    stale.reason === 'stale' && stale.staleDays === 11
  );
  const none = miss(weightTrend([], from, D));
  check('기록 없음', none.reason === 'none' && none.needPoints === 4);

  const flat50 = series(49, 80, 0);
  const daily = ok(weightTrend(flat50, from, D));
  check(
    '매일 50번 제자리 — 거의 그대로(표준오차 0.067: 촘촘한 점은 덜 센다)',
    daily.rate20 === 0 && near(daily.se, 0.067) && daily.kind === 'flat',
    `se ${daily.se.toFixed(3)}`
  );
  const weekly8 = mk([
    [49, 79.6],
    [42, 80.5],
    [35, 79.9],
    [28, 80.4],
    [21, 79.7],
    [14, 80.3],
    [7, 80.0],
    [0, 79.8],
  ]);
  const weekly = ok(weightTrend(weekly8, from, D));
  check(
    '주 1회 8번 제자리 — 거의 그대로(표준오차 0.099)',
    Object.is(weekly.rate20, 0) && near(weekly.se, 0.099) && weekly.kind === 'flat',
    `se ${weekly.se.toFixed(3)}`
  );
  const up29 = series(28, 78, 0.05);
  const up = ok(weightTrend(up29, from, D));
  check(
    '매일 29번 증가 — 주 +0.35kg, 확실히 는다',
    up.rate20 === 7 &&
      near(up.se, 0.149) &&
      up.kind === 'up' &&
      near(up.currentKg, 79.45, 0.01) &&
      up.dropped.length === 0,
    `se ${up.se.toFixed(3)}`
  );
  const typo = ok(
    weightTrend(
      up29.map((p) => (p.date === ago(10) ? { ...p, kg: 87.5 } : p)),
      from,
      D
    )
  );
  check(
    '오타(87.5)는 흐름에서 뺀다 — 속도는 그대로',
    typo.dropped.join() === '2026-09-20' && typo.n === 28 && typo.rate20 === 7,
    typo.dropped.join()
  );
  const dehydrated = ok(
    weightTrend(
      up29.map((p) => (p.date === D ? { ...p, kg: r1(p.kg - 2.5) } : p)),
      from,
      D
    )
  );
  check(
    '탈수된 마지막 날도 뺀다 — 추세선은 그 전날에서 끝난다',
    dehydrated.dropped.join() === D &&
      dehydrated.toDate === '2026-09-29' &&
      dehydrated.rate20 === 7
  );
  const outside = ok(weightTrend([...mk([[60, 70]]), ...weekly8], from, D));
  check(
    '창(56일) 밖의 기록은 안 본다',
    outside.n === 8 && Object.is(outside.rate20, 0) && near(outside.se, weekly.se)
  );
  const weekly5 = ok(
    weightTrend(
      mk([
        [28, 72.0],
        [21, 72.3],
        [14, 72.5],
        [7, 72.8],
        [0, 73.0],
      ]),
      from,
      D
    )
  );
  check(
    '주 1회 5번 증가 — 한 줄로 서도 확실한 척하지 않는다(흔들림 바닥 0.58)',
    weekly5.rate20 === 5 &&
      near(weekly5.se, 0.184) &&
      near(weekly5.sigma, 0.58) &&
      weekly5.kind === 'noisy',
    `se ${weekly5.se.toFixed(3)}`
  );
  const four = ok(
    weightTrend(
      mk([
        [21, 76.3],
        [14, 66.5],
        [7, 76.8],
        [0, 77.1],
      ]),
      from,
      D
    )
  );
  check(
    '4번 중 오타 — 뺄 수 없으니(다섯에 하나까지) 또렷하지 않다고 말한다',
    four.dropped.length === 0 && four.kind === 'noisy' && four.se > 2
  );

  /* ── 목표 계산: 새 칸이 비면 예전과 같다 ── */
  const man: Body = { weightKg: 80, heightCm: 180, age: 20, sex: 'M' };
  const teen: Body = { weightKg: 65, heightCm: 172, age: 15, sex: 'M' };
  const kid: Body = { weightKg: 40, heightCm: 145, age: 11, sex: 'M' };
  const ageless: Body = { weightKg: 80, heightCm: 180, age: null, sex: 'M' };
  const P = DEFAULT_PROFILE;
  const baseOf = (p: Partial<ProfileSettings>, b: Body = man) =>
    computeTargets({ ...P, ...p }, b, 0).base;
  check(
    '새 칸 넷이 비면 예전 숫자 그대로 — 유지 2750 · 증량 3050 · 감량 2350',
    baseOf({}) === 2750 &&
      baseOf({ goal: 'gain' }) === 3050 &&
      baseOf({ goal: 'lose' }) === 2350
  );
  check(
    '속도 — 증량 0.35 는 3150, 0.5 를 넣어도 0.35 로, 감량 0.25 는 2450',
    baseOf({ goal: 'gain', weeklyRateKg: 0.35 }) === 3150 &&
      baseOf({ goal: 'gain', weeklyRateKg: 0.5 }) === 3150 &&
      baseOf({ goal: 'lose', weeklyRateKg: 0.25 }) === 2450
  );
  check(
    '증량 조정 — +100 은 3150, +500 은 +300 까지(3350), −500 은 −200 까지(2850)',
    baseOf({ goal: 'gain', kcalAdjust: 100 }) === 3150 &&
      baseOf({ goal: 'gain', kcalAdjust: 500 }) === 3350 &&
      baseOf({ goal: 'gain', kcalAdjust: -500 }) === 2850
  );
  check(
    '감량 조정은 덜 빼는 쪽으로만 — −200 은 0(2350), +900 은 유지까지(2750)',
    baseOf({ goal: 'lose', kcalAdjust: -200 }) === 2350 &&
      baseOf({ goal: 'lose', kcalAdjust: 900 }) === 2750 &&
      baseOf({ goal: 'lose', weeklyRateKg: 0.25, kcalAdjust: 400 }) === 2750
  );
  check(
    '유지 조정 — 내리지 않는다(−100 → 2750), 올리기는 된다(+200 → 2950)',
    baseOf({ kcalAdjust: -100 }) === 2750 && baseOf({ kcalAdjust: 200 }) === 2950
  );
  const manualT = computeTargets(
    { ...P, goal: 'gain', kcalTarget: 2400, kcalAdjust: 200 },
    man,
    0
  );
  check(
    '칼로리를 직접 정했으면 조정은 안 얹는다',
    manualT.base === 2400 && manualT.adjust === 0 && manualT.manual
  );
  check(
    '성장기 — 유지 2710 · 증량 3010 · 감량 2510, 속도는 한 가지(0.35 를 넣어도 그대로)',
    baseOf({}, teen) === 2710 &&
      baseOf({ goal: 'gain' }, teen) === 3010 &&
      baseOf({ goal: 'lose' }, teen) === 2510 &&
      baseOf({ goal: 'gain', weeklyRateKg: 0.35 }, teen) === 3010 &&
      baseOf({ goal: 'lose', weeklyRateKg: 0.35 }, teen) === 2510
  );
  check(
    '성장기 조정 — 올리기는 +200 까지, 내리기는 없다',
    baseOf({ goal: 'gain', kcalAdjust: 300 }, teen) === 3210 &&
      baseOf({ goal: 'lose', kcalAdjust: -100 }, teen) === 2510 &&
      baseOf({ goal: 'lose', kcalAdjust: 300 }, teen) === 2710 &&
      baseOf({ kcalAdjust: -100 }, teen) === 2710
  );
  const kidT = computeTargets(
    { ...P, goal: 'gain', weeklyRateKg: 0.35, kcalAdjust: 200, targetWeightKg: 45 },
    kid,
    0
  );
  check(
    '어린이 — 속도 · 조정을 넣어도 예전 그대로(증량 2250), 계획은 없다',
    baseOf({}, kid) === 2050 &&
      kidT.base === 2250 &&
      kidT.paceKg === null &&
      baseOf({ goal: 'lose' }, kid) === 2050
  );
  const agelessT = computeTargets(
    { ...P, goal: 'gain', weeklyRateKg: 0.35, kcalAdjust: 300 },
    ageless,
    0
  );
  check(
    '생년월일을 모르면 성인 한도를 열지 않는다 — 증량 3050 그대로, 계획 없음',
    agelessT.base === 3050 &&
      agelessT.paceKg === null &&
      baseOf({ goal: 'lose', weeklyRateKg: 0.25 }, ageless) === 2350
  );
  check(
    '가벼운 성인의 감량도 예전 숫자 그대로(1180)',
    computeTargets(
      { ...P, goal: 'lose', activity: 'low' },
      { weightKg: 50, heightCm: 160, age: 25, sex: 'F' },
      0
    ).base === 1180
  );
  const paceOf = (p: Partial<ProfileSettings>, b: Body = man) =>
    computeTargets({ ...P, ...p }, b, 0).paceKg;
  check(
    '계획 속도 — 성인 증량 0.25 · 감량 0.35 · 유지 0 · 성장기 감량 0.2',
    paceOf({ goal: 'gain' }) === 0.25 &&
      paceOf({ goal: 'lose' }) === 0.35 &&
      paceOf({}) === 0 &&
      paceOf({ goal: 'lose' }, teen) === 0.2
  );
  check(
    '고를 수 있는 속도 — 성인 증량의 0.35 는 70kg 부터, 성장기는 하나, 어린이 · 나이 모름은 없음',
    paceChoices(20, 'gain', 80).join() === '0.25,0.35' &&
      paceChoices(20, 'gain', 65).join() === '0.25' &&
      paceChoices(20, 'gain', null).join() === '0.25' &&
      paceChoices(20, 'lose', 60).join() === '0.25,0.35' &&
      paceChoices(15, 'gain', 80).join() === '0.25' &&
      paceChoices(15, 'lose', 60).join() === '0.2' &&
      paceChoices(11, 'gain', 40).length === 0 &&
      paceChoices(null, 'gain', 80).length === 0 &&
      paceChoices(20, 'maintain', 80).length === 0
  );
  check(
    '조정 한도',
    effectiveAdjust(-200, 15, 'gain', 300) === 0 &&
      effectiveAdjust(900, 20, 'gain', 300) === 300 &&
      effectiveAdjust(-300, 20, 'lose', -400) === 0 &&
      effectiveAdjust(100, 11, 'gain', 200) === 0 &&
      effectiveAdjust(300, null, 'gain', 300) === 0 &&
      effectiveAdjust(400, 20, 'lose', -300) === 300
  );
  check(
    '기본 속도의 kcal 은 예전 goalDelta 와 같다(기본 속도를 고르면 숫자가 안 바뀐다)',
    (['teen', 'adult'] as const).every((band) =>
      (['gain', 'lose'] as const).every(
        (g) =>
          defaultPace(band, g)?.kcal === Math.abs(AGE_RULES[band].goalDelta[g] ?? 0)
      )
    )
  );
  check(
    '저장할 속도 — 기본 속도는 null, 빠른 속도만 숫자로',
    storedRate(0.25, 20, 'gain') === null &&
      storedRate(0.35, 20, 'gain') === 0.35 &&
      storedRate(0.35, 20, 'lose') === null &&
      storedRate(0.25, 20, 'lose') === 0.25 &&
      storedRate(0.35, 15, 'gain') === null &&
      storedRate(0.35, null, 'gain') === null &&
      storedRate(0.35, 20, 'maintain') === null
  );
  /* 무엇을 넣어도 안전한가 — 몸 5 × 목표 3 × 움직임 3 × 속도 5 × 조정 21 */
  {
    let bad = 0;
    let count = 0;
    const bodies: Body[] = [
      man,
      teen,
      kid,
      ageless,
      { weightKg: 50, heightCm: 160, age: 25, sex: 'F' },
    ];
    for (const b of bodies)
      for (const goal of ['gain', 'maintain', 'lose'] as const)
        for (const activity of ['low', 'mid', 'high'] as const)
          for (const weeklyRateKg of [null, 0.2, 0.25, 0.35, 0.5])
            for (let kcalAdjust = -1000; kcalAdjust <= 1000; kcalAdjust += 100) {
              count++;
              const old = computeTargets({ ...P, goal, activity }, b, 0);
              const keep = computeTargets({ ...P, activity }, b, 0);
              const t = computeTargets(
                { ...P, goal, activity, weeklyRateKg, kcalAdjust },
                b,
                0
              );
              /* 감량 · 유지는 예전보다 낮아지지 않는다 */
              if (t.goal !== 'gain' && t.base < old.base) bad++;
              /* 만 18세 밑 · 나이 모름은 내리는 조정이 없다 */
              if ((b.age === null || b.age < 18) && t.adjust < 0) bad++;
              /* 나이 모름 · 어린이는 예전과 같다 */
              if ((b.age === null || t.ageBand === 'child') && t.base !== old.base)
                bad++;
              /* 증량은 유지보다 적어도 100 많고, 감량은 유지를 넘지 않는다 */
              if (t.goal === 'gain' && t.base < keep.base + 100) bad++;
              if (t.goal === 'lose' && t.base > keep.base) bad++;
            }
    check(
      `무엇을 넣어도 한도 안 — ${count.toLocaleString()}가지`,
      bad === 0,
      `위반 ${bad}`
    );
  }

  /* ── 식사 확인 · 목표 체중 · 주수 ── */
  const days = (list: [number, number][]) =>
    list.flatMap(([n, kcal]) =>
      Array.from({ length: n }, () => ({ kcal, target: 3050 }))
    );
  const iGood = days([[14, 3000]]);
  const iUnder = days([
    [10, 2500],
    [4, 0],
  ]);
  const iFew = days([
    [3, 2900],
    [11, 0],
  ]);
  const iOver = days([
    [9, 3600],
    [5, 1000],
  ]);
  const good = intakeCheck(iGood);
  const under = intakeCheck(iUnder);
  const over = intakeCheck(iOver);
  check(
    '식사 확인 — 14일 다 적음: 믿는다, 목표의 98%',
    good.trusted && good.days === 14 && near(good.ratio!, 0.984) && good.gapKcal === -50
  );
  check(
    '10일 적고 덜 먹음 — 목표의 82%, 하루 550 모자람',
    under.trusted &&
      under.days === 10 &&
      near(under.ratio!, 0.82) &&
      under.gapKcal === -550
  );
  check(
    '3일만 적음 — 안 믿는다',
    !intakeCheck(iFew).trusted && intakeCheck(iFew).days === 3
  );
  check(
    '9일 적고 더 먹음 — 목표의 118%(적다 만 날 1,000kcal 은 안 센다)',
    over.trusted && over.days === 9 && near(over.ratio!, 1.18) && over.gapKcal === 550
  );
  check(
    '목표의 절반도 안 적은 날(1,500 < 1,525)은 안 센다',
    intakeCheck(
      days([
        [7, 3000],
        [7, 1500],
      ])
    ).days === 7
  );
  check('기록이 없으면 비율도 없다', intakeCheck([]).ratio === null);

  const rangeText = (r: TargetRange) => (r.ok ? `${r.min}~${r.max}` : r.why);
  check(
    '목표 체중 범위 — 성인 증량은 지금의 115% 까지, 성장기는 110% 까지',
    rangeText(targetRange('gain', 20, 75.2, 180)) === '75.7~86.4' &&
      rangeText(targetRange('gain', 15, 62, 170)) === '62.5~68.2'
  );
  check(
    '성인 감량은 지금의 90% 와 BMI 20 중 높은 쪽까지',
    rangeText(targetRange('lose', 20, 85, 180)) === '76.5~84.5' &&
      rangeText(targetRange('lose', 20, 64, 180)) === 'light' &&
      rangeText(targetRange('lose', 20, 85, null)) === 'height'
  );
  check(
    '성장기 감량 · 어린이 · 유지 · 나이 모름 · 체중 모름은 목표 체중이 없다',
    rangeText(targetRange('lose', 15, 70, 170)) === 'band' &&
      rangeText(targetRange('gain', 11, 40, 145)) === 'band' &&
      rangeText(targetRange('maintain', 20, 80, 180)) === 'band' &&
      rangeText(targetRange('gain', null, 80, 180)) === 'age' &&
      rangeText(targetRange('gain', 20, null, 180)) === 'weight'
  );
  const tw = (
    goal: 'gain' | 'lose' | 'maintain',
    age: number | null,
    kg: number | null,
    prev: number | null = null
  ) => checkTargetWeight(goal, age, 80, 180, kg, prev);
  check(
    '목표 체중 저장 — 범위 안은 통과, 밖은 범위를 말한다',
    JSON.stringify(tw('gain', 20, 85.04)) === '{"ok":true,"kg":85}' &&
      tw('gain', 20, 95).ok === false &&
      (tw('gain', 20, 95) as { error: string }).error.includes('80.5~92kg')
  );
  check(
    '정할 수 없는 나이 · 목표면 조용히 비운다',
    JSON.stringify(tw('maintain', 20, 85)) === '{"ok":true,"kg":null}' &&
      JSON.stringify(tw('lose', 15, 70)) === '{"ok":true,"kg":null}' &&
      JSON.stringify(tw('gain', null, 85)) === '{"ok":true,"kg":null}'
  );
  check(
    '이미 저장된 목표는 범위가 밀려도 그대로 통과한다',
    JSON.stringify(tw('gain', 20, 95, 95)) === '{"ok":true,"kg":95}'
  );
  check(
    '약 N주 — 정수로 나눈다(2.1 ÷ 0.35 = 6, 실수로 나누면 7)',
    etaWeeks(2.1, 0.35) === 6 &&
      etaWeeks(4.2, 0.35) === 12 &&
      etaWeeks(2.0, 0.25) === 8 &&
      etaWeeks(2.4, 0.25) === 10 &&
      etaWeeks(3.0, 0.35) === 9 &&
      etaWeeks(1.0, 0.2) === 5
  );
  check(
    '한 해를 넘거나 남은 것이 없으면 말하지 않는다',
    etaWeeks(14, 0.25) === null && etaWeeks(0, 0.25) === null && etaWeeks(2, 0) === null
  );

  /* ── 판정 ── */
  type Run = {
    points: WeightPoint[];
    profile?: Partial<ProfileSettings>;
    body?: Body;
    intake?: IntakeDay[];
    isToday?: boolean;
    hasProfile?: boolean;
  };
  const run = (o: Run) => {
    const profile = { ...P, goal: 'gain' as const, targetWeightKg: 82, ...o.profile };
    const body = o.body ?? man;
    return weightGoal({
      date: D,
      isToday: o.isToday ?? true,
      hasProfile: o.hasProfile ?? true,
      points: o.points,
      profile,
      targets: computeTargets(profile, body, 0),
      age: body.age,
      intake: o.intake ?? iGood,
    });
  };
  const sug = (g: WeightGoal) =>
    g.suggestion
      ? `${g.suggestion.step}/${g.suggestion.nextAdjust}/${g.suggestion.logs}`
      : null;

  const p1 = run({ points: flat50 });
  check(
    '증량인데 7주째 제자리 — 하루 +100 을 권한다',
    p1.status === 'low' &&
      sug(p1) === '100/100/ok' &&
      p1.remainingKg === 2 &&
      p1.etaWeeks === 8,
    `${p1.status} ${sug(p1)}`
  );
  const p2 = run({ points: series(35, 80, 0) });
  check(
    '같은 제자리라도 5주치로는 아직 모른다(기운 쪽만 말한다)',
    p2.status === 'unsure' && p2.lean === -1 && p2.suggestion === null
  );
  check('6주치가 되면 권한다', run({ points: series(42, 80, 0) }).status === 'low');
  const p3 = run({ points: flat50, intake: iUnder });
  check(
    '목표만큼 못 먹고 있으면 올리지 않는다 — 먼저 채우기',
    p3.status === 'low' && p3.hold === 'eatFirst' && p3.suggestion === null
  );
  check(
    '식사 기록이 적어도 올리기는 권한다(확인 못 했다고 알린다)',
    sug(run({ points: flat50, intake: iFew })) === '100/100/few'
  );
  check(
    '칼로리를 직접 정했으면 권하지 않는다',
    run({ points: flat50, profile: { kcalTarget: 3000 } }).hold === 'manual'
  );
  check(
    '지난 날을 볼 때는 권하지 않는다',
    run({ points: flat50, isToday: false }).hold === 'past'
  );
  check(
    '목표를 저장한 적 없거나 생년월일을 모르면 흐름만',
    run({ points: flat50, hasProfile: false }).status === 'off' &&
      run({ points: flat50, body: ageless }).status === 'off'
  );

  const since = (n: number) => ({ planSince: ago(n) });
  const p6a = run({ points: flat50, profile: since(10) });
  check(
    '계획을 바꾼 지 10일 — 기다린다. 카드는 56일 흐름을 그대로 보인다',
    p6a.status === 'wait' &&
      p6a.planDays === 10 &&
      !p6a.judged &&
      p6a.trend.ok &&
      p6a.trend.n === 50 &&
      p6a.wait?.reason === 'short'
  );
  check(
    '17일째도 기다린다',
    run({ points: flat50, profile: since(17) }).status === 'wait'
  );
  const p6e = run({ points: flat50, profile: since(18) });
  check(
    '18일째부터 견준다 — 나흘을 뺀 15점으로는 아직 모른다',
    p6e.status === 'unsure' && p6e.judged && p6e.trend.ok && p6e.trend.n === 15
  );
  check(
    '30일째도 제자리 흔들림 안이면 아직 모른다',
    run({ points: flat50, profile: since(30) }).status === 'unsure'
  );
  check(
    '고른 날이 계획을 시작하기 전이면 흐름만',
    run({ points: flat50, profile: { planSince: shiftDateKey(D, 3) } }).status === 'off'
  );

  const rising = series(42, 77.5, 0.05);
  const p7 = run({ points: rising, profile: { weeklyRateKg: 0.35 } });
  check(
    '계획(주 0.35kg)대로 — 남은 2.4kg, 약 7주',
    p7.status === 'onPace' &&
      p7.trend.ok &&
      p7.trend.rate20 === 7 &&
      p7.remainingKg === 2.4 &&
      p7.etaWeeks === 7,
    `${p7.status} ${p7.remainingKg} ${p7.etaWeeks}`
  );

  const fast = series(42, 76, 0.1);
  const p8 = run({ points: fast, profile: { targetWeightKg: 85 } });
  check(
    '성인 증량이 계획의 세 배로 빠르다 — 하루 −100 을 권한다',
    p8.status === 'high' && sug(p8) === '-100/-100/ok',
    `${p8.status} ${sug(p8)}`
  );
  check(
    '식사 기록이 적으면 내리기는 권하지 않는다',
    run({ points: fast, profile: { targetWeightKg: 85 }, intake: iFew }).hold ===
      'needLog'
  );
  check(
    '목표보다 많이 먹고 있으면 내리지 않는다 — 목표에 맞추기',
    run({ points: fast, profile: { targetWeightKg: 85 }, intake: iOver }).hold ===
      'overEating'
  );
  check(
    '이미 −200 이면 더 내리지 않는다',
    run({ points: fast, profile: { targetWeightKg: 85, kcalAdjust: -200 } }).hold ===
      'floor'
  );
  const p9 = run({
    points: series(42, 60, 0.1),
    profile: { targetWeightKg: 68 },
    body: teen,
  });
  check(
    '성장기 증량이 빨라도 줄이라고 하지 않는다',
    p9.status === 'high' &&
      p9.hold === 'keep' &&
      p9.suggestion === null &&
      run({
        points: series(42, 60, 0.1),
        profile: { targetWeightKg: 68, kcalAdjust: 100 },
        body: teen,
      }).hold === 'keep'
  );

  const losing = series(28, 84, -0.13);
  const p10 = run({ points: losing, profile: { goal: 'lose', targetWeightKg: 76 } });
  check(
    '성인 감량이 너무 빠르다(주 −0.9kg) — 하루 +100 을 권한다',
    p10.status === 'low' && sug(p10) === '100/100/ok',
    `${p10.status} ${sug(p10)}`
  );
  check(
    '이미 유지만큼 올렸으면 더 못 올린다',
    run({
      points: losing,
      profile: { goal: 'lose', targetWeightKg: 76, kcalAdjust: 400 },
    }).hold === 'cap'
  );
  const p11 = run({ points: flat50, profile: { goal: 'lose', targetWeightKg: 76 } });
  check(
    '성인 감량이 안 돼도 더 깊이 빼라고 하지 않는다',
    p11.status === 'high' && p11.hold === 'floor' && p11.suggestion === null
  );
  check(
    '전에 올려 둔 조정이 있으면 그것을 되돌리기만 권한다',
    sug(
      run({
        points: flat50,
        profile: { goal: 'lose', targetWeightKg: 76, kcalAdjust: 100 },
      })
    ) === '-100/0/ok'
  );
  const p12 = run({
    points: series(49, 65, 0),
    profile: { goal: 'lose', targetWeightKg: 60 },
    body: teen,
  });
  check(
    '성장기 감량이 안 될 때 — 더 줄이지 않는다, 저장된 목표 체중도 안 읽는다',
    p12.status === 'high' && p12.hold === 'keep' && p12.targetKg === null
  );
  const p12b = run({
    points: series(28, 67, -0.08),
    profile: { goal: 'lose', targetWeightKg: null },
    body: teen,
  });
  check(
    '성장기 감량이 너무 빠르다 — 하루 +100 을 권하고 한 줄 알린다',
    p12b.status === 'low' && sug(p12b) === '100/100/ok' && p12b.minorDrop,
    `${p12b.status} ${sug(p12b)} ${p12b.minorDrop}`
  );

  const p13 = run({
    points: rising,
    profile: { weeklyRateKg: 0.35, targetWeightKg: 79.5 },
  });
  check(
    '목표 체중에 닿았다 — 추세도 마지막 기록도 넘었다',
    p13.status === 'reached' && p13.remainingKg === 0 && p13.suggestion === null
  );
  check(
    '마지막 기록만 아직 아래면 닿았다고 하지 않는다',
    run({
      points: [...rising.slice(0, -1), { date: D, kg: 79.2 }],
      profile: { weeklyRateKg: 0.35, targetWeightKg: 79.5 },
    }).status === 'onPace'
  );
  const p14 = run({
    points: series(35, 36, -0.03),
    profile: { goal: 'gain', targetWeightKg: 40 },
    body: { ...kid, weightKg: 35 },
  });
  check(
    '어린이 — 계획도 권유도 없다. 줄고 있으면 한 줄만',
    p14.status === 'off' && p14.suggestion === null && p14.minorDrop
  );
  const keepGoal = { goal: 'maintain' as const, targetWeightKg: null };
  check(
    '유지인데 빠진다 — 하루 +100 을 권한다',
    sug(run({ points: losing, profile: keepGoal })) === '100/100/ok'
  );
  check(
    '유지인데 는다 — 줄이라고 하지 않는다. 전에 올린 것이 있으면 되돌리기만',
    run({ points: fast, profile: keepGoal }).hold === 'floor' &&
      sug(run({ points: fast, profile: { ...keepGoal, kcalAdjust: 100 } })) ===
        '-100/0/ok'
  );
  const p16 = run({
    points: series(49, 62, 0),
    profile: { targetWeightKg: 66 },
    body: teen,
  });
  check(
    '성장기 증량이 제자리 — 하루 +100, 남은 4kg 약 16주',
    sug(p16) === '100/100/ok' && p16.remainingKg === 4 && p16.etaWeeks === 16
  );
  check(
    '올리기 한도 — 성장기 +200, 성인 +300',
    run({
      points: series(49, 62, 0),
      profile: { targetWeightKg: 66, kcalAdjust: 200 },
      body: teen,
    }).hold === 'cap' &&
      run({ points: flat50, profile: { kcalAdjust: 300 } }).hold === 'cap'
  );
  const p17 = run({
    points: mk([
      [20, 80],
      [10, 80.3],
      [0, 80.5],
    ]),
  });
  check(
    '기록이 3번뿐 — 기다린다. 남은 양은 마지막 기록으로 셈한다',
    p17.status === 'wait' && p17.remainingKg === 1.5 && p17.etaWeeks === 6
  );
  check(
    '주 1회 8번 제자리 증량 — 권한다(문턱을 간신히 넘는다)',
    run({ points: weekly8 }).status === 'low'
  );
  const p20 = run({
    points: mk([
      [28, 80.0],
      [21, 80.3],
      [14, 79.9],
      [7, 80.2],
      [0, 80.0],
    ]),
  });
  check(
    '주 1회 5번 제자리 — 점이 적으면 말하지 않는다',
    p20.status === 'unsure' && p20.lean === -1
  );
  const p21 = run({ points: flat50, profile: { targetWeightKg: null } });
  check(
    '목표 체중이 없어도 속도는 견준다',
    p21.status === 'low' && sug(p21) === '100/100/ok' && p21.remainingKg === null
  );

  /* ── 목표를 저장할 때 ── */
  const prev = {
    goal: 'gain' as const,
    activity: 'mid' as const,
    weeklyRateKg: null,
    kcalTarget: null,
    kcalAdjust: 200,
  };
  const next = {
    goal: 'gain' as const,
    activity: 'mid' as const,
    weeklyRateKg: null,
    kcalTarget: null,
  };
  const saved = (r: { kcalAdjust: number | null; restart: boolean }) =>
    `${r.kcalAdjust}/${r.restart}`;
  check(
    '같은 설정으로 저장 — 조정도 시작일도 그대로(기본 속도를 숫자로 보내도 같다)',
    saved(planOnSave(prev, next, 20)) === '200/false' &&
      saved(planOnSave(prev, { ...next, weeklyRateKg: 0.25 }, 20)) === '200/false'
  );
  check(
    '증량 → 유지는 올려 둔 조정을 남긴다(벌크 뒤 급락 방지)',
    saved(planOnSave(prev, { ...next, goal: 'maintain' }, 20)) === '200/true' &&
      saved(
        planOnSave({ ...prev, kcalAdjust: -100 }, { ...next, goal: 'maintain' }, 20)
      ) === 'null/true'
  );
  check(
    '목표 · 움직임 · 속도 · 직접 칼로리가 바뀌면 조정은 0 으로, 계획은 새로',
    saved(planOnSave(prev, { ...next, goal: 'lose' }, 20)) === 'null/true' &&
      saved(planOnSave(prev, { ...next, activity: 'high' }, 20)) === 'null/true' &&
      saved(planOnSave(prev, { ...next, weeklyRateKg: 0.35 }, 20)) === 'null/true' &&
      saved(planOnSave(prev, { ...next, kcalTarget: 3000 }, 20)) === 'null/true' &&
      saved(
        planOnSave({ ...prev, goal: 'lose' }, { ...next, goal: 'maintain' }, 20)
      ) === 'null/true' &&
      saved(planOnSave(null, next, 20)) === 'null/true'
  );
  check(
    '조정 지우기 — 지울 것이 있을 때만 계획을 새로 시작한다',
    saved(planOnSave(prev, { ...next, clearAdjust: true }, 20)) === 'null/true' &&
      saved(
        planOnSave({ ...prev, kcalAdjust: null }, { ...next, clearAdjust: true }, 20)
      ) === 'null/false'
  );

  /* ── 화면의 글 ── */
  check(
    "속도 글 — '주 +0.25kg' · '주 0kg' · '주 −0.7kg' · '주 +0.6lb'",
    fmtRate(5, 'kg') === '주 +0.25kg' &&
      fmtRate(0, 'kg') === '주 0kg' &&
      fmtRate(-14, 'kg') === '주 −0.7kg' &&
      fmtRate(5, 'lb') === '주 +0.6lb'
  );
  const ctx = {
    goal: 'gain' as const,
    band: 'adult' as const,
    ageKnown: true,
    hasProfile: true,
    unit: 'kg' as const,
    isToday: true,
  };
  const c1 = goalCopy(p1, ctx);
  check(
    '느릴 때 — 숫자 하나 · 문장 하나 · 단추 하나',
    c1.number === '주 0kg' &&
      c1.label === '최근 7주 흐름' &&
      c1.sub === '계획 주 +0.25kg · 목표 82kg까지 2kg · 계획대로면 약 8주' &&
      c1.sentence ===
        '계획보다 느려요. 하루 100kcal 올려 볼까요? 바나나 1개쯤이에요.' &&
      c1.action === 'raise',
    `${c1.label} | ${c1.number} | ${c1.sub} | ${c1.sentence}`
  );
  check(
    '못 먹고 있을 때는 얼마나 모자란지 말한다',
    goalCopy(p3, ctx).sentence ===
      '계획보다 느려요. 기록으로는 목표보다 하루 550kcal쯤 덜 먹었어요. 목표는 그대로 두고 먼저 채워 보세요.' &&
      goalCopy(p3, ctx).action === null
  );
  const c9 = goalCopy(p9, { ...ctx, band: 'teen' });
  check(
    '성장기 증량이 빠를 때 — 자연스러운 일이라고 말하고 단추는 없다',
    Boolean(c9.sentence?.includes('키가 크는 시기엔')) && c9.action === null
  );
  const c13 = goalCopy(p13, ctx);
  check(
    '닿았을 때 — 유지로 바꾸기',
    c13.action === 'maintain' && c13.label === '목표 79.5kg' && c13.number === '79.6kg',
    `${c13.label} ${c13.number}`
  );
  check(
    '또렷하지 않은 흐름은 숫자를 보이지 않는다',
    goalCopy(p20, ctx).number === null &&
      goalCopy(p20, ctx).sentence ===
        '계획보다 조금 느린 듯해요. 아직 확실하지 않아 1~2주 더 볼게요.'
  );
  check(
    '기다릴 때는 까닭과 남은 날을 말한다',
    goalCopy(p6a, ctx).sentence === '새 목표로 10일째예요. 8일 뒤에 계획과 비교해요.' &&
      goalCopy(run({ points: flat50, profile: since(0) }), ctx).sentence ===
        '오늘 목표를 바꿨어요. 18일 뒤에 계획과 비교해요.' &&
      goalCopy(p17, ctx).sentence ===
        '1번 더 재면 계획과 비교해요. 주 2~3번이면 충분해요.'
  );
  const c14 = goalCopy(p14, { ...ctx, band: 'child' });
  check(
    '어린이 카드 — 글은 없고 줄어들 때의 한 줄만',
    c14.label === null &&
      c14.sentence === null &&
      Boolean(c14.minor?.includes('끼니를 거르지'))
  );
  const off = goalCopy(run({ points: flat50, hasProfile: false }), {
    ...ctx,
    hasProfile: false,
  });
  check(
    '계획이 없으면 흐름만 말한다',
    off.sentence === '거의 그대로예요.' && off.sub === null && off.action === null
  );
  check(
    '생년월일을 모르면 적어 달라고 한 줄',
    goalCopy(run({ points: flat50, body: ageless }), { ...ctx, ageKnown: false })
      .note === '생년월일을 내 정보에 적으면 계획과 비교해 드려요.'
  );
  check(
    '파운드로 볼 때',
    goalCopy(p1, { ...ctx, unit: 'lb' }).sub ===
      '계획 주 +0.6lb · 목표 180.8lb까지 4.4lb · 계획대로면 약 8주'
  );

  /* ── 검토에서 찾아 고친 것 ── */
  /* 7주 동안 60kg 이다가 마지막 일주일 57kg — 수준이 바뀐 것이지 오타가 아니다 */
  const shifted = mk(
    Array.from(
      { length: 56 },
      (_, k) => [55 - k, r1((k < 49 ? 60 : 57) + wig[k % 7])] as [number, number]
    )
  );
  const shiftTrend = ok(weightTrend(shifted, from, D));
  check(
    '끝에 같은 쪽으로 이어진 점(일주일 새 −3kg)은 이상값이 아니다 — 빼지 않고 줄고 있다고 읽는다',
    shiftTrend.dropped.length === 0 && shiftTrend.kind === 'down',
    `dropped ${shiftTrend.dropped.length} ${shiftTrend.kind}`
  );
  const teenShift = run({ points: shifted, profile: { goal: 'maintain' }, body: teen });
  check(
    '성장기 유지 중 일주일 새 3kg 이 빠지면 곧바로 더 먹기 쪽(미성년 한 줄은 며칠 더 지나야 — 56일 직선이라)',
    teenShift.status === 'low' && teenShift.trend.ok && teenShift.trend.kind === 'down',
    `${teenShift.status} ${teenShift.minorDrop}`
  );
  const twoDay = ok(
    weightTrend(
      up29.map((p, i) => (i >= 27 ? { ...p, kg: r1(p.kg - 2.5) } : p)),
      from,
      D
    )
  );
  check('이틀짜리 탈수는 그대로 뺀다', twoDay.dropped.length === 2);
  const jump = miss(
    weightTrend(
      mk([
        [47, 78.0],
        [40, 78.2],
        [33, 78.1],
        [26, 78.3],
        [19, 78.2],
        [12, 78.3],
        [0, 80.4],
      ]),
      from,
      D
    )
  );
  check(
    '오늘 잰 값이 튀어 빠졌으면 "오늘 재 볼까요"가 아니라 "1번 더 재면" — 남은 kg 도 남긴 기록으로',
    jump.reason === 'few' && jump.needPoints === 1 && jump.lastKg === 78.3,
    `${jump.reason} ${jump.lastKg}`
  );

  check(
    '감량인데 체중이 늘면 "천천히 빠져요"라고 하지 않는다',
    goalCopy(
      run({
        points: series(42, 84, 0.05),
        profile: { goal: 'lose', targetWeightKg: 80 },
      }),
      {
        ...ctx,
        goal: 'lose',
      }
    ).sentence === '감량이 목표인데 체중이 늘고 있어요. 목표는 더 낮추지 않아요.' &&
      goalCopy(p11, { ...ctx, goal: 'lose' }).sentence ===
        '감량이 목표인데 체중이 줄지 않고 있어요. 목표는 더 낮추지 않아요.' &&
      goalCopy(
        run({
          points: series(28, 80, 0),
          profile: { goal: 'lose', targetWeightKg: 76 },
        }),
        { ...ctx, goal: 'lose' }
      ).sentence === '체중이 줄지 않는 듯해요. 아직 확실하지 않아 1~2주 더 볼게요.'
  );
  check(
    '증량인데 체중이 줄면 그렇게 말한다',
    Boolean(
      goalCopy(
        run({ points: series(28, 82, -0.08), profile: {} }),
        ctx
      ).sentence?.startsWith('증량이 목표인데 체중이 줄고 있어요.')
    )
  );
  check(
    '기록이 없거나 오래됐으면 날짜를 세지 않고 재 달라고 한다',
    goalCopy(run({ points: [], profile: since(0) }), ctx).sentence ===
      '체중을 적으면 계획과 비교해 드려요. 2주 동안 4번이면 돼요.' &&
      goalCopy(run({ points: mk([[30, 80]]), profile: since(5) }), ctx).sentence ===
        '마지막 기록이 30일 전이에요. 오늘 한 번 재 볼까요?'
  );
  const teenFast = series(42, 60, 0.1);
  check(
    '성장기가 계획보다 위로 갈 때는 지난 날이든 직접 칼로리든 "줄이지 않는다"가 먼저',
    run({
      points: teenFast,
      profile: { targetWeightKg: 68 },
      body: teen,
      isToday: false,
    }).hold === 'keep' &&
      run({
        points: teenFast,
        profile: { targetWeightKg: 68, kcalTarget: 3000 },
        body: teen,
      }).hold === 'keep' &&
      run({
        points: series(49, 65, 0),
        profile: { goal: 'lose' },
        body: teen,
        isToday: false,
      }).hold === 'keep'
  );
  check(
    '지난 날에도 오늘 막혔을 까닭은 그대로 말한다(못 먹고 있음 · 한도)',
    run({ points: flat50, intake: iUnder, isToday: false }).hold === 'eatFirst' &&
      run({ points: flat50, profile: { kcalAdjust: 300 }, isToday: false }).hold ===
        'cap' &&
      run({ points: flat50, isToday: false }).hold === 'past'
  );
  const teenSlowLose = run({
    points: series(55, 52.2, -0.04),
    profile: { goal: 'lose' },
    body: { ...teen, weightKg: 50 },
  });
  check(
    '성장기 감량이 계획대로인데 체중의 0.5%/주 넘게 줄면 "지금처럼 먹으면 돼요"를 붙이지 않는다',
    teenSlowLose.status === 'onPace' &&
      teenSlowLose.minorDrop &&
      goalCopy(teenSlowLose, { ...ctx, goal: 'lose', band: 'teen' }).sentence ===
        '계획대로예요.',
    `${teenSlowLose.status} ${teenSlowLose.minorDrop}`
  );
  check(
    '미성년 한 줄은 성인 · 천천히 줄 때 · 늘 때는 뜨지 않는다',
    !run({ points: series(28, 82, -0.08), profile: { goal: 'lose' } }).minorDrop &&
      !run({ points: series(49, 65, -0.01), profile: { goal: 'lose' }, body: teen })
        .minorDrop &&
      !p9.minorDrop
  );
  const oldTypo = series(49, 78, 0.035).map((p) =>
    p.date === ago(40) ? { ...p, kg: 87.5 } : p
  );
  const withPlan = run({ points: oldTypo, profile: since(30) });
  check(
    '계획을 바꾸기 전의 오타도 그래프에 "뺀 값"으로 내려간다',
    withPlan.judged && withPlan.trend.ok && withPlan.trend.dropped.includes(ago(40))
  );
}

console.log('\n■ 식단 취향');
{
  check('저장한 적 없으면 기본값', toDietPrefs(null) === DEFAULT_PREFS);
  const read = toDietPrefs({
    goalEndDate: new Date('2026-12-24T00:00:00.000Z'),
    seasonPhase: 'in',
    dietStyle: 'weird',
    mealPattern: '3+2',
    avoidFoods: ['egg', 'hack', 'egg', 'spicy'],
    allowSupplements: false,
  });
  check(
    'DB 줄을 읽는다 — 모르는 값은 기본값, 겹친 것 · 모르는 꼬리표는 뺀다',
    read.goalEndDate === '2026-12-24' &&
      read.seasonPhase === 'in' &&
      read.dietStyle === 'mixed' &&
      read.mealPattern === '3+2' &&
      read.avoid.join(',') === 'egg,spicy' &&
      read.supplements === false,
    JSON.stringify(read)
  );
  check(
    '칸이 생기기 전의 줄(칸 없음)도 받는다',
    JSON.stringify(toDietPrefs({})) === JSON.stringify(DEFAULT_PREFS)
  );
  const ok = cleanDietPrefs(
    { ...DEFAULT_PREFS, goalEndDate: '2026-12-24', avoid: ['dairy', 'dairy'] },
    '2026-10-01'
  );
  check(
    '저장 검사 — 맞는 값은 통과(겹친 꼬리표는 하나로)',
    typeof ok === 'object' && ok.goalEndDate === '2026-12-24' && ok.avoid.length === 1
  );
  const bad = (over: Record<string, unknown>) =>
    typeof cleanDietPrefs({ ...DEFAULT_PREFS, ...over }, '2026-10-01') === 'string';
  check(
    '저장 검사 — 오늘 · 지난 날짜 · 2년 넘는 날짜 · 틀린 모양은 거절',
    bad({ goalEndDate: '2026-10-01' }) &&
      bad({ goalEndDate: '2026-09-30' }) &&
      bad({ goalEndDate: '2028-10-02' }) &&
      bad({ goalEndDate: '12/24' }) &&
      !bad({ goalEndDate: '2026-10-02' }) &&
      !bad({ goalEndDate: '2028-09-30' })
  );
  check(
    '저장 검사 — 모르는 스타일 · 끼니 구성 · 시즌 · 꼬리표 · 보충식품 모양은 거절',
    bad({ dietStyle: 'keto' }) &&
      bad({ mealPattern: '5' }) &&
      bad({ seasonPhase: 'summer' }) &&
      bad({ avoid: ['egg', 'gluten'] }) &&
      bad({ supplements: 'yes' }) &&
      !bad({ seasonPhase: null }) &&
      typeof cleanDietPrefs(null, '2026-10-01') === 'string'
  );
}

console.log('\n■ 단백질 직접 정하기');
{
  const auto = computeTargets({ ...DEFAULT_PROFILE }, body, 0);
  const manual = computeTargets({ ...DEFAULT_PROFILE, proteinTargetG: 160 }, body, 0);
  check(
    '직접 정한 g 이 하루 단백질이 된다(계산값은 따로 남는다)',
    manual.protein === 160 &&
      manual.proteinManual &&
      manual.proteinAuto === auto.protein &&
      !auto.proteinManual,
    `${auto.protein} → ${manual.protein}`
  );
  check(
    '칼로리는 그대로, 늘어난 단백질만큼 탄수화물이 준다(지방은 칼로리 비율)',
    manual.kcal === auto.kcal &&
      manual.fat === auto.fat &&
      manual.carbs ===
        Math.max(0, Math.round((auto.kcal - 160 * 4 - auto.fat * 9) / 4)),
    `탄 ${auto.carbs} → ${manual.carbs}`
  );
  check(
    '소수는 반올림',
    computeTargets({ ...DEFAULT_PROFILE, proteinTargetG: 120.6 }, body, 0).protein ===
      121
  );
}

console.log('\n■ 끼니별 단백질(로드맵 5번)');
{
  check(
    '한 끼 목표 = 하루 ÷ 4 를 5g 단위 — 성인 135g → 35g',
    mealProteinGoal(135, 'adult') === 35
  );
  check(
    '범위 밖은 당긴다 — 성인 198g → 40g, 성인 60g → 20g',
    mealProteinGoal(198, 'adult') === 40 && mealProteinGoal(60, 'adult') === 20
  );
  check(
    '어린이는 15~30g — 48g → 15g',
    mealProteinGoal(48, 'child') === 15 && MEAL_PROTEIN_RANGE.child[0] === 15
  );
  check('성장기 90g → 25g(22.5 를 반올림)', mealProteinGoal(90, 'teen') === 25);
  {
    /* 진짜 계산과 이어서 — 80kg 성인 기본 1.8g/kg = 144g → 한 끼 35g */
    const t = computeTargets({ ...DEFAULT_PROFILE }, body, 0);
    check(
      '목표 계산과 이어진다(80kg 성인 144g → 35g)',
      t.protein === 144 && mealProteinGoal(t.protein, t.ageBand) === 35,
      `${t.protein}g`
    );
  }

  const row = (
    meal: MealEntryView['meal'],
    protein: number | null,
    amount = 1
  ): MealEntryView => ({
    id: `${meal}-${protein}-${amount}`,
    meal,
    name: 'x',
    source: 'basic',
    sourceId: 'x',
    servingLabel: null,
    servingGrams: null,
    amount,
    kcal: 100,
    carbs: 10,
    protein,
    fat: 1,
  });

  const low = mealProtein('breakfast', [row('breakfast', 6.3, 2)], 135, 'adult');
  check(
    '아침 달걀 2개(13g) — 목표 35g 에 22g 모자람 · 예시가 붙는다',
    low.protein === 13 && low.goal === 35 && !low.done && low.short === 22 && !!low.tip,
    `${low.tip?.label} +${low.tip?.protein}g`
  );
  check(
    '모자란 22g 을 넘는 가장 작은 예시 — 닭가슴살 1팩(23g)',
    low.tip?.label === '닭가슴살 1팩' && low.tip.protein === 23 && low.tip.covers
  );
  const done = mealProtein('lunch', [row('lunch', 28)], 135, 'adult');
  check(
    '목표의 8할(35g 중 28g)이면 채움 — 예시 없음',
    done.done && done.short === 0 && done.tip === null
  );
  check(
    '다른 끼니의 음식은 세지 않는다',
    mealProtein('dinner', [row('lunch', 40), row('dinner', 10)], 135, 'adult')
      .protein === 10
  );
  const unknown = mealProtein(
    'dinner',
    [row('dinner', 5), row('dinner', null)],
    135,
    'adult'
  );
  check(
    '단백질을 모르는 음식이 섞이면 모자란다고 하지 않는다',
    unknown.unknown &&
      unknown.protein === 5 &&
      !unknown.done &&
      unknown.short === 0 &&
      unknown.tip === null
  );
  const snack = mealProtein('snack', [row('snack', 3)], 135, 'adult');
  check(
    '간식은 숫자만 — 목표 · 예시 없음',
    snack.goal === null &&
      !snack.done &&
      snack.short === 0 &&
      snack.tip === null &&
      snack.protein === 3
  );
  const empty = mealProtein('lunch', [], 135, 'adult');
  check(
    '빈 끼니는 아무 말도 안 한다',
    empty.protein === 0 && empty.goal === 35 && empty.short === 0 && empty.tip === null
  );
  check(
    '양(인분)을 곱한다 — 닭가슴살 1.5팩 = 35g → 채움',
    mealProtein('dinner', [row('dinner', 23, 1.5)], 135, 'adult').done
  );

  check('예시 — 6g 이하는 달걀 1개', proteinTip(6)?.label === '달걀 1개');
  check('예시 — 8g 은 그릭요거트 100g(9g)', proteinTip(8)?.label === '그릭요거트 100g');
  check(
    '예시 — 17g 은 달걀 2개 · 우유 1컵(19g)',
    proteinTip(17)?.label === '달걀 2개 · 우유 1컵' && proteinTip(17)?.protein === 19
  );
  const big = proteinTip(40);
  check(
    '가장 큰 예시로도 모자라면 그것을 주고 "다 채운다"고 하지 않는다',
    big?.label === '닭가슴살 1팩 · 달걀 2개' && big.covers === false
  );
  check(
    '모자란 것이 없으면 예시도 없다',
    proteinTip(0) === null && proteinTip(-3) === null
  );
  check(
    '예시의 단백질은 기본 음식 목록 값과 같다(달걀 2개 = 12.6g → 13g)',
    proteinTip(12)?.label === '달걀 2개' && proteinTip(12)?.protein === 13
  );
}

console.log('\n■ 자주 먹는 조합(로드맵 6번)');
{
  const e = (
    name: string,
    over: Partial<MealEntryView> = {},
    meal: MealEntryView['meal'] = 'breakfast'
  ): MealEntryView => ({
    id: `${name}-${over.amount ?? 1}`,
    meal,
    name,
    source: 'basic',
    sourceId: name,
    servingLabel: '1인분',
    servingGrams: 100,
    amount: 1,
    kcal: 100,
    carbs: 10,
    protein: 5,
    fat: 2,
    ...over,
  });

  const egg = e('달걀(삶은 것)', { sourceId: 'egg', kcal: 78, protein: 6.3 });
  const rice = e('쌀밥', { sourceId: 'rice', kcal: 300, protein: 5.5 });
  const milk = e('우유', { sourceId: 'milk', kcal: 130, protein: 6.5 });

  const items = itemsFromEntries([egg, rice, { ...egg, id: 'egg2', amount: 1 }, milk]);
  check(
    '같은 음식 두 줄은 양을 더해 한 줄로 — 달걀 2개 · 쌀밥 · 우유',
    items.length === 3 && items[0].name === '달걀(삶은 것)' && items[0].amount === 2,
    items.map((i) => `${i.name}×${i.amount}`).join(', ')
  );
  check(
    '조합 합계 — 78×2 + 300 + 130 = 586kcal, 단백질 24.6g',
    Math.round(comboMacros(items).kcal) === 586 &&
      Math.round(comboMacros(items).protein * 10) === 246
  );
  check(
    '기본 이름 — 괄호를 빼고 둘까지, 나머지는 "외 N가지"',
    defaultComboName(items) === '달걀 · 쌀밥 외 1가지',
    defaultComboName(items)
  );
  check(
    '두 가지면 "외" 없이',
    defaultComboName(itemsFromEntries([rice, milk])) === '쌀밥 · 우유'
  );
  const long = itemsFromEntries([
    e('아주아주아주 긴 이름의 프로틴 바나나 쉐이크', { sourceId: 'a' }),
    e('통곡물 시리얼과 그릭요거트 볼', { sourceId: 'b' }),
  ]);
  check(
    `이름이 길면 ${COMBO_NAME_MAX}자에서 자른다`,
    defaultComboName(long).length === COMBO_NAME_MAX &&
      defaultComboName(long).endsWith('…')
  );

  check(
    '지문은 담은 차례와 상관없다',
    comboSignature(itemsFromEntries([egg, rice, milk])) ===
      comboSignature(itemsFromEntries([milk, egg, rice]))
  );
  check(
    '양이 다르면 다른 조합',
    comboSignature(itemsFromEntries([egg, rice])) !==
      comboSignature(itemsFromEntries([{ ...egg, amount: 2 }, rice]))
  );
  check(
    '이름이 같아도 직접 입력의 kcal 이 다르면 다른 음식',
    itemsFromEntries([
      e('엄마표 제육', { source: 'free', sourceId: null, kcal: 500 }),
      e('엄마표 제육', { source: 'free', sourceId: null, kcal: 700 }),
    ]).length === 2
  );

  const view = (
    id: string,
    list: MealEntryView[],
    meal: MealComboView['meal'],
    useCount = 0
  ): MealComboView => ({ id, name: id, meal, items: itemsFromEntries(list), useCount });
  const saved = [
    view('점심 세트', [rice, milk], 'lunch', 9),
    view('아침 세트', [egg, rice, milk], 'breakfast', 1),
    view('간식', [milk], 'snack', 3),
    view('아침 둘째', [egg, milk], 'breakfast', 4),
  ];
  check(
    '같은 조합을 찾는다(차례가 달라도)',
    findCombo(saved, itemsFromEntries([milk, rice, egg]))?.id === '아침 세트' &&
      findCombo(saved, itemsFromEntries([egg, rice])) === null &&
      findCombo(saved, []) === null
  );
  check(
    '차례 — 이 끼니의 조합 먼저(자주 담은 것부터), 그다음 다른 끼니도 자주 담은 것부터',
    orderCombos(saved, 'breakfast')
      .map((c) => c.id)
      .join(',') === '아침 둘째,아침 세트,점심 세트,간식',
    orderCombos(saved, 'breakfast')
      .map((c) => c.id)
      .join(',')
  );

  const parsed = parseComboItems([
    { ...items[0] },
    { source: 'hack', name: 'x', kcal: 1, amount: 1 },
    { source: 'basic', name: '', kcal: 1, amount: 1 },
    { source: 'basic', name: '음수', kcal: -5, amount: 1 },
    { source: 'basic', name: '양 없음', kcal: 5, amount: 0 },
    {
      source: 'free',
      sourceId: 'zzz',
      name: '직접',
      kcal: 50,
      protein: -1,
      amount: 1.234,
    },
    'garbage',
    null,
  ]);
  check(
    'DB 값을 다시 본다 — 틀린 줄은 버리고, 직접 입력의 열쇠 · 음수 영양소는 비운다',
    parsed.length === 2 &&
      parsed[1].sourceId === null &&
      parsed[1].protein === null &&
      parsed[1].amount === 1.25,
    JSON.stringify(parsed[1])
  );
  check(
    `조합의 음식은 ${COMBO_ITEMS_MAX}가지까지`,
    itemsFromEntries(
      Array.from({ length: 25 }, (_, i) => e(`음식${i}`, { sourceId: `f${i}` }))
    ).length === COMBO_ITEMS_MAX &&
      parseComboItems(Array.from({ length: 25 }, () => items[0])).length ===
        COMBO_ITEMS_MAX
  );
  check(
    'DB 줄 → 화면 — 음식이 하나도 안 남으면 안 보이고, 모르는 끼니는 null',
    comboView({ id: 'a', name: 'a', meal: 'brunch', items: [items[0]], useCount: 0 })
      ?.meal === null &&
      comboView({ id: 'b', name: 'b', meal: 'lunch', items: 'x', useCount: 0 }) === null
  );
}

console.log('\n■ 식단 짜기');
{
  check(
    '식단 틀의 음식 열쇠가 모두 기본 목록에 있다',
    TEMPLATE_PROBLEMS.length === 0,
    TEMPLATE_PROBLEMS.join(', ')
  );
  const bySlot = (slot: string) =>
    MEAL_TEMPLATES.filter((t) => t.slots.includes(slot as never));
  check(
    '끼니마다 고를 틀이 넉넉하다(14개 넘게)',
    ['breakfast', 'lunch', 'dinner', 'snack'].every((s) => bySlot(s).length >= 14),
    ['breakfast', 'lunch', 'dinner', 'snack']
      .map((s) => `${s} ${bySlot(s).length}`)
      .join(' · ')
  );
  check(
    '장소마다 점심 · 간식 틀이 셋 넘게 있다',
    (['home', 'gym', 'team', 'out'] as const).every(
      (p) =>
        bySlot('lunch').filter((t) => t.places.includes(p)).length >= 3 &&
        bySlot('snack').filter((t) => t.places.includes(p)).length >= 3
    )
  );
  check(
    '건강한 식단 — 라면 · 과자 · 탄산 · 아이스크림은 틀에 없다',
    !MEAL_TEMPLATES.some((t) =>
      t.items.some((i) =>
        [
          'ramen',
          'cup-ramen',
          'potato-chips',
          'cola',
          'ice-cream',
          'choco-pie',
        ].includes(i.food.id!)
      )
    )
  );

  const base: PlanInput = {
    date: '2026-10-02',
    seed: 'u1',
    variant: 0,
    targets: { kcal: 2900, protein: 140 },
    goal: 'maintain',
    ageBand: 'adult',
    prefs: { ...DEFAULT_PREFS },
    place: 'home',
    hot: false,
    throwKind: null,
    appetite: null,
    soreness: null,
    eaten: [],
  };

  /* 넓게 훑기 — 나이 칸 · 체중에 맞춘 실제 같은 목표 300가지 */
  const kinds = [null, 'eve', 'today', 'after'] as const;
  const places = ['home', 'gym', 'team', 'out'] as const;
  const pats = ['3', '3+1', '3+2', '2+1'] as const;
  const styles = ['korean', 'mixed', 'simple'] as const;
  let kcalOff = 0,
    protLow = 0,
    protHighAdult = 0,
    adults = 0,
    capOver = 0,
    avoidHit = 0,
    suppHit = 0,
    stepOff = 0,
    changed = 0;
  for (let i = 0; i < 300; i++) {
    const avoid = AVOIDS.filter((_, k) => (i * 7 + k * 13) % 9 === 0).map((a) => a.key);
    const band = (['adult', 'teen', 'child'] as const)[i % 3];
    const kg =
      band === 'child'
        ? 30 + (i % 20)
        : band === 'teen'
          ? 50 + (i % 25)
          : 65 + (i % 35);
    const protein = Math.round(
      kg * (band === 'child' ? 1.2 : band === 'teen' ? 1.5 : 1.8)
    );
    const kcal = Math.round(
      kg * (band === 'child' ? 60 : band === 'teen' ? 48 : 38) + (i % 5) * 150
    );
    const input: PlanInput = {
      ...base,
      date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      seed: 'u' + (i % 17),
      variant: i % 5,
      targets: { kcal, protein },
      goal: (['gain', 'maintain', 'lose'] as const)[i % 3],
      ageBand: band,
      prefs: {
        ...DEFAULT_PREFS,
        mealPattern: pats[i % 4],
        dietStyle: styles[i % 3],
        avoid,
        seasonPhase: (['off', 'pre', 'in', 'rehab', null] as const)[i % 5],
        supplements: i % 2 === 0,
      },
      place: places[i % 4],
      hot: i % 6 === 0,
      throwKind: kinds[i % 4],
      appetite: i % 7 === 0 ? 1 : null,
      soreness: i % 9 === 0 ? 5 : null,
    };
    const r = buildMealPlan(input);
    const m = planMacros(r.items);
    if (Math.abs(m.kcal - kcal) > kcal * 0.1) kcalOff++;
    if (m.protein < protein * 0.85) protLow++;
    if (band !== 'child') {
      adults++;
      if (m.protein > protein * 1.4) protHighAdult++;
    }
    for (const it of r.items) {
      const same = r.items.filter(
        (x) => x.meal === it.meal && x.sourceId === it.sourceId
      );
      const sum = same.reduce((a, x) => a + x.amount, 0);
      if (MAX_PER_MEAL[it.sourceId] && sum > MAX_PER_MEAL[it.sourceId] + 1e-9)
        capOver++;
      if (avoidsOf(it.sourceId).some((a) => avoid.includes(a))) avoidHit++;
      if (
        ['protein-shake', 'protein-bar'].includes(it.sourceId) &&
        (band !== 'adult' || !input.prefs.supplements)
      ) {
        suppHit++;
      }
      const step = amountStep(it.sourceId);
      if (Math.abs(it.amount / step - Math.round(it.amount / step)) > 1e-6) stepOff++;
    }
    const again = buildMealPlan({ ...input, variant: input.variant + 1 });
    if (
      again.meals.map((x) => x.template).join() !==
      r.meals.map((x) => x.template).join()
    )
      changed++;
  }
  check('하루 kcal 이 목표의 ±10% 안(300가지 모두)', kcalOff === 0, `밖 ${kcalOff}`);
  check(
    '하루 단백질이 목표의 85% 넘게(300가지 모두)',
    protLow === 0,
    `모자람 ${protLow}`
  );
  check(
    '성인 · 성장기 단백질은 목표의 1.4배를 넘는 일이 드물다(5% 밑)',
    protHighAdult <= adults * 0.05,
    `${protHighAdult}/${adults}`
  );
  check(
    '한 끼에 먹을 만한 양을 넘지 않는다(달걀 3개 · 우유 2컵 …)',
    capOver === 0,
    `넘음 ${capOver}`
  );
  check('못 먹는 것은 하나도 안 들어간다', avoidHit === 0, `들어감 ${avoidHit}`);
  check(
    '보충식품은 끈 사람 · 성장기 · 어린이에게 안 들어간다',
    suppHit === 0,
    `들어감 ${suppHit}`
  );
  check('양은 음식마다의 단위(1 · ½ · ¼)로', stepOff === 0, `어긋남 ${stepOff}`);
  check(
    "'다른 식단으로'를 누르면 대개 다른 틀이 나온다(9할 넘게)",
    changed >= 270,
    `${changed}/300`
  );

  const one = buildMealPlan(base);
  check(
    '같은 날 · 같은 사람 · 같은 조건이면 같은 식단(다시 열어도 그대로)',
    JSON.stringify(buildMealPlan(base)) === JSON.stringify(one)
  );
  check(
    '끼니 구성대로 — 세 끼 + 간식',
    ['breakfast', 'lunch', 'dinner', 'snack'].every((m) =>
      one.items.some((i) => i.meal === m)
    )
  );
  const two = buildMealPlan({
    ...base,
    prefs: { ...DEFAULT_PREFS, mealPattern: '2+1' },
  });
  check('두 끼 + 간식이면 아침이 없다', !two.items.some((i) => i.meal === 'breakfast'));

  const ate = buildMealPlan({
    ...base,
    eaten: [{ meal: 'breakfast', kcal: 700, protein: 35 }],
  });
  check(
    '이미 먹은 끼니는 짜지 않고 남은 몫으로 짠다',
    !ate.items.some((i) => i.meal === 'breakfast') &&
      ate.skipped.includes('breakfast') &&
      ate.target.kcal === 2200 &&
      ate.target.protein === 105 &&
      ate.reasons[0].startsWith('이미 먹은 아침은')
  );
  const full = buildMealPlan({
    ...base,
    eaten: [{ meal: 'lunch', kcal: 2850, protein: 140 }],
  });
  check(
    '목표를 거의 채웠으면 짜지 않는다',
    full.items.length === 0 && full.reasons.some((r) => r.includes('거의 채웠어요'))
  );

  const appetite = buildMealPlan({
    ...base,
    appetite: 1,
    prefs: { ...DEFAULT_PREFS, mealPattern: '3' },
  });
  check(
    '입맛 없는 날은 세 끼 구성이어도 간식을 더해 양을 나눈다',
    appetite.items.some((i) => i.meal === 'snack') &&
      appetite.reasons.some((r) => r.includes('입맛'))
  );

  const tagOf = (key: string) => MEAL_TEMPLATES.find((t) => t.key === key)?.tags ?? [];
  let preLunch = 0,
    heat = 0,
    gymOk = 0;
  for (let i = 0; i < 40; i++) {
    const p = buildMealPlan({ ...base, seed: 'u' + i, throwKind: 'today' });
    if (tagOf(p.meals.find((m) => m.meal === 'lunch')!.template).includes('pre'))
      preLunch++;
    const h = buildMealPlan({ ...base, seed: 'h' + i, hot: true });
    if (h.meals.some((m) => tagOf(m.template).includes('heat'))) heat++;
    const g = buildMealPlan({ ...base, seed: 'g' + i, place: 'gym' });
    if (
      g.meals
        .filter((m) => m.meal === 'lunch' || m.meal === 'snack')
        .every((m) =>
          MEAL_TEMPLATES.find((t) => t.key === m.template)!.places.includes('gym')
        )
    ) {
      gymOk++;
    }
  }
  check(
    '던지는 날 점심은 대개 던지기 전 끼니(탄수화물 위주)',
    preLunch >= 30,
    `${preLunch}/40`
  );
  check('더운 날은 대개 더위에 맞는 끼니가 하나 넘게', heat >= 24, `${heat}/40`);
  check(
    '헬스장이면 점심 · 간식은 헬스장에서 먹을 수 있는 것',
    gymOk === 40,
    `${gymOk}/40`
  );

  const avoidPork = buildMealPlan({
    ...base,
    prefs: { ...DEFAULT_PREFS, avoid: ['pork'] },
  });
  check(
    "못 먹는 것을 까닭에 받침에 맞춰 적는다('돼지고기는')",
    avoidPork.reasons.some((r) => r.startsWith('돼지고기는 빼고'))
  );
  check(
    '까닭은 넷까지',
    [one, ate, appetite].every((p) => p.reasons.length >= 1 && p.reasons.length <= 4)
  );

  /*
   * ── 못 먹는 것 기대표 — 사람이 음식마다 따로 적은 것(2026-10-04 메인 검토) ──
   * 식단이 쓰는 모든 음식(틀 · 바꿔 넣기 · 단백질 · kcal 보충)의 '들어 있는 것'을 meal-templates.ts 의 표와 따로 적어 둔다. 예전 시험은
   * 같은 표(avoidsOf)로 기대값을 다시 셈해 늘 참이라, 표에서 빠진 재료(삼계탕의 잣 · 돼지국밥의 새우젓 · 소면)를 못 잡았다. 이제 표를
   * 고치거나 새 음식을 틀에 넣으면 이 기대표도 같이 고쳐야 통과한다 — 알레르기일 수 있어 사람이 한 번 더 본다.
   */
  const EXPECTED_AVOIDS: Record<string, string> = {
    almond: 'nuts',
    anchovy: 'seafood nuts',
    apple: '',
    bagel: 'wheat',
    banana: '',
    'banana-milk': 'dairy',
    'beef-lean': 'beef',
    'beef-sirloin': 'beef',
    bibimbap: 'egg beef spicy',
    blueberry: '',
    'braised-tofu': 'spicy',
    broccoli: '',
    'brown-rice': '',
    bulgogi: 'beef',
    'cheese-slice': 'dairy',
    'cherry-tomato': '',
    'chicken-breast': 'chicken',
    'chicken-breast-pack': 'chicken',
    'chicken-salad': 'dairy egg chicken nuts',
    'chicken-thigh': 'chicken',
    'choco-milk': 'dairy',
    corn: '',
    'curry-rice': 'dairy pork beef wheat',
    dakbokkeumtang: 'chicken spicy',
    'doenjang-jjigae': 'seafood',
    dumplings: 'egg pork beef chicken wheat',
    egg: 'egg',
    'egg-fried': 'egg',
    'egg-roll': 'egg',
    'egg-white': 'egg',
    galbitang: 'egg beef',
    garaetteok: '',
    gimbap: 'egg seafood pork wheat',
    'greek-yogurt': 'dairy',
    honey: '',
    japchae: 'egg pork beef',
    jeyuk: 'pork spicy',
    'jeyuk-deopbap': 'pork spicy',
    kalguksu: 'seafood wheat',
    kimchi: 'seafood spicy',
    'kimchi-jjigae': 'seafood pork spicy',
    kiwi: '',
    lunchbox: 'dairy egg seafood pork beef chicken wheat nuts spicy',
    mackerel: 'seafood',
    mandarin: '',
    milk: 'dairy',
    'milk-lowfat': 'dairy',
    'mixed-nuts': 'nuts',
    miyeokguk: 'beef',
    'multigrain-rice': '',
    naengmyeon: 'egg beef wheat',
    oatmeal: '',
    omurice: 'dairy egg pork wheat',
    orange: '',
    'orange-juice': '',
    'pasta-tomato': 'dairy wheat',
    'peanut-butter': 'nuts',
    'pork-gukbap': 'seafood pork wheat',
    'pork-neck': 'pork',
    'pork-tenderloin': 'pork',
    potato: '',
    'protein-bar': 'dairy wheat nuts',
    'protein-shake': 'dairy',
    rice: '',
    salad: 'dairy egg nuts',
    salmon: 'seafood',
    samgyetang: 'chicken nuts',
    sandwich: 'dairy egg pork wheat',
    seolleongtang: 'beef wheat',
    'soy-milk': '',
    spinach: '',
    'sports-drink': '',
    strawberry: '',
    'sundubu-jjigae': 'egg seafood pork spicy',
    'sweet-potato': '',
    tofu: '',
    tonkatsu: 'dairy egg pork wheat',
    'triangle-gimbap': 'egg seafood',
    tteokguk: 'egg beef',
    'tuna-can': 'seafood',
    'tuna-gimbap': 'egg seafood pork wheat',
    udon: 'seafood wheat',
    watermelon: '',
    'white-bread': 'dairy egg wheat',
    yogurt: 'dairy',
    yukgaejang: 'egg beef spicy',
  };
  const usedIds = new Set<string>([
    ...MEAL_TEMPLATES.flatMap((t) => t.items.map((i) => i.food.id!)),
    ...Object.entries(SUBSTITUTES).flatMap(([k, v]) => [k, ...v]),
    ...PROTEIN_BOOST,
    ...KCAL_BOOST,
  ]);
  const norm = (xs: readonly string[]) => [...xs].sort().join(' ');
  const avoidDiff = [...usedIds].flatMap((id) => {
    const want = EXPECTED_AVOIDS[id];
    if (want === undefined) return [`${id}: 기대표에 없음`];
    const got = norm(avoidsOf(id));
    const exp = norm(want.split(' ').filter(Boolean));
    return got === exp ? [] : [`${id}: 표 [${got}] ≠ 기대 [${exp}]`];
  });
  check(
    '못 먹는 것 기대표 — 식단이 쓰는 음식마다 표와 사람이 적은 것이 같다(새 음식은 기대표에 먼저)',
    avoidDiff.length === 0,
    avoidDiff.slice(0, 6).join(' · ')
  );
  /* 검토에서 새던 것 — 견과류만 · 해산물만 · 밀가루만 · 돼지고기만 · 매운 것만 고른 사람에게 그 음식이 안 나간다 */
  const leakOf = (avoid: (typeof AVOIDS)[number]['key'], food: string) => {
    let hit = 0;
    for (let i = 0; i < 240; i++) {
      const r = buildMealPlan({
        ...base,
        seed: `leak${i}`,
        date: `2026-12-${String(1 + (i % 28)).padStart(2, '0')}`,
        place: places[i % 4],
        prefs: { ...DEFAULT_PREFS, avoid: [avoid], dietStyle: styles[i % 3] },
      });
      if (r.items.some((it) => it.sourceId === food)) hit++;
    }
    return hit;
  };
  const leaks = [
    ['nuts', 'samgyetang'],
    ['seafood', 'pork-gukbap'],
    ['wheat', 'pork-gukbap'],
    ['pork', 'omurice'],
    ['spicy', 'braised-tofu'],
    ['egg', 'salad'],
  ] as const;
  const leakHits = leaks.map(([a, f]) => `${a}→${f} ${leakOf(a, f)}`);
  check(
    '검토에서 새던 음식 — 삼계탕(견과) · 돼지국밥(해산물 · 밀) · 오므라이스(돼지) · 두부조림(매운 것) · 샐러드(달걀)가 안 나간다',
    leakHits.every((x) => x.endsWith(' 0')),
    leakHits.join(' · ')
  );
  /* 식단 취향을 바꾸면 오늘 계획에서 못 먹는 것을 뺀다 — 먹은 줄 · 직접 바꿔 넣은 줄은 둔다 */
  const dropBase = one.items[0];
  const dropped = dropAvoided(
    [
      { ...dropBase, key: 'a', sourceId: 'samgyetang', name: '삼계탕', done: false },
      { ...dropBase, key: 'b', sourceId: 'mixed-nuts', name: '견과류 믹스', done: true },
      { ...dropBase, key: 'c', sourceId: 'rice', name: '쌀밥', done: false },
      { ...dropBase, key: 'd', source: 'mfds', sourceId: 'X1', name: '땅콩', done: false },
      { ...dropBase, key: 'e', sourceId: 'protein-shake', name: '단백질 쉐이크', done: false },
    ],
    { avoid: ['nuts'], supplements: false }
  );
  check(
    '취향을 바꾸면 계획에서 뺀다 — 안 먹은 못 먹는 것 · 끈 보충식품만(먹은 줄 · 식약처로 바꿔 넣은 줄은 그대로)',
    dropped.removed.map((r) => r.key).join('') === 'ae' &&
      dropped.kept.map((r) => r.key).join('') === 'bcd',
    JSON.stringify(dropped.removed.map((r) => r.key))
  );

  check(
    '못 먹는 것은 국물 · 양념 · 고명까지 센다 — 김치 젓갈 · 된장찌개 육수 · 물냉면 고명 · 참치마요',
    avoidsOf('kimchi').includes('seafood') &&
      avoidsOf('doenjang-jjigae').includes('seafood') &&
      avoidsOf('naengmyeon').includes('egg') &&
      avoidsOf('naengmyeon').includes('beef') &&
      avoidsOf('triangle-gimbap').includes('egg') &&
      avoidsOf('curry-rice').includes('dairy') &&
      avoidsOf('galbitang').includes('egg') &&
      avoidsOf('seolleongtang').includes('wheat') &&
      avoidsOf('anchovy').includes('nuts')
  );
  check(
    '무엇이 든지 정해지지 않은 편의점 도시락은 흔한 구성(돈가스 · 치킨 · 불고기 · 어묵 · 볶음김치)을 모두 센다',
    (['egg', 'pork', 'wheat', 'chicken', 'beef', 'seafood', 'spicy'] as const).every(
      (a) => avoidsOf('lunchbox').includes(a)
    )
  );
  check(
    '참치김밥은 김밥에 든 것을 모두 든다(햄 · 어묵 · 달걀)',
    avoidsOf('gimbap').every((a) => avoidsOf('tuna-gimbap').includes(a)) &&
      avoidsOf('gimbap').includes('wheat')
  );
  const preOff = MEAL_TEMPLATES.filter((t) => t.tags.includes('pre')).flatMap((t) => {
    const m = sumMacros(t.items.map((i) => scaleMacros(i.food, i.amount)));
    const carb = (m.carbs * 4) / m.kcal;
    const fat = (m.fat * 9) / m.kcal;
    return carb < 0.5 || fat > 0.25
      ? [`${t.key} 탄 ${Math.round(carb * 100)}% 지 ${Math.round(fat * 100)}%`]
      : [];
  });
  check(
    "'던지기 전' 틀은 처음 양으로 탄수화물 50% 넘게 · 지방 25% 밑(소화가 쉬운 끼니)",
    preOff.length === 0,
    preOff.join(' · ')
  );

  /* 못 먹는 것 0~2개 — 아무것도 안 고른 사람 1 + 하나 9 + 둘 36 = 46가지 */
  type AvoidList = PlanInput['prefs']['avoid'];
  const avoidSets: AvoidList[] = [[]];
  AVOIDS.forEach((a, i) => {
    avoidSets.push([a.key]);
    for (const b of AVOIDS.slice(i + 1)) avoidSets.push([a.key, b.key]);
  });

  /*
   * ── 못 먹는 것 0~2개 × 끼니 구성 × 스타일, 하나도 빠짐없이(46 × 4 × 3 = 552가지) ──
   * 날짜 · 사람을 세 벌로 바꿔 돌린다 — 한 벌만 보면 뽑기 운으로 통과하는 조합이 있었다(두부 점심이 뽑힌 날만 단백질이 모자람).
   * 나이 칸 · 목표 · '다른 식단으로'는 스타일과 따로 돈다(셋이 같이 돌면 어린이는 간편식에서만 시험됐다). 어린이는 감량이 없다
   * (age.ts effectiveGoal — 앱이 유지로 바꿔 넘긴다).
   */
  const MEALS_OF = { '3': 3, '3+1': 4, '3+2': 5, '2+1': 3 } as const;
  let combos = 0;
  const comboBad = {
    kcal: [] as string[],
    protein: [] as string[],
    avoid: [] as string[],
  };
  const comboMissing: string[] = [];
  const comboSupp: string[] = [];
  const BANDS = ['adult', 'teen', 'child'] as const;
  const GOALS = ['gain', 'maintain', 'lose'] as const;
  for (const [si, shift] of [0, 9, 17].entries()) {
    avoidSets.forEach((avoid, ai) => {
      for (const [pi, mealPattern] of pats.entries()) {
        for (const [di, dietStyle] of styles.entries()) {
          const i = combos++;
          const band = BANDS[(ai + pi + si) % 3];
          const goal =
            band === 'child'
              ? GOALS[(ai + di + si) % 2]
              : GOALS[(ai + 2 * di + pi + si) % 3];
          const kg =
            band === 'child'
              ? 32 + (i % 15)
              : band === 'teen'
                ? 52 + (i % 20)
                : 68 + (i % 30);
          const protein = Math.round(
            kg * (band === 'child' ? 1.2 : band === 'teen' ? 1.5 : 1.8)
          );
          const kcal = Math.round(
            kg * (band === 'child' ? 60 : band === 'teen' ? 48 : 38) + (i % 4) * 150
          );
          const lowAppetite = i % 7 === 0;
          const r = buildMealPlan({
            ...base,
            date: `2026-11-${String(1 + ((i + shift) % 28)).padStart(2, '0')}`,
            seed: `a${ai}-${shift}`,
            variant: (ai + di + 2 * pi) % 3,
            targets: { kcal, protein },
            goal,
            ageBand: band,
            prefs: {
              ...DEFAULT_PREFS,
              mealPattern,
              dietStyle,
              avoid,
              /* 성장기 · 어린이는 켜 둬도 안 들어가야 한다 */
              supplements: true,
              seasonPhase: (['off', 'pre', 'in', 'rehab', null] as const)[i % 5],
            },
            place: places[i % 4],
            hot: i % 5 === 0,
            throwKind: kinds[i % 4],
            appetite: lowAppetite ? 1 : null,
            soreness: i % 11 === 0 ? 5 : null,
          });
          const label = `${avoid.join('+') || '없음'}/${mealPattern}/${dietStyle}/${band}`;
          const m = planMacros(r.items);
          if (Math.abs(m.kcal - kcal) > kcal * 0.1)
            comboBad.kcal.push(`${label} ${Math.round(m.kcal)}/${kcal}`);
          if (m.protein < protein * 0.85)
            comboBad.protein.push(`${label} ${Math.round(m.protein)}/${protein}`);
          if (
            r.items.some((it) => avoidsOf(it.sourceId).some((a) => avoid.includes(a)))
          )
            comboBad.avoid.push(label);
          if (band !== 'adult' && r.items.some((it) => SUPPLEMENTS.has(it.sourceId)))
            comboSupp.push(label);
          const expected =
            MEALS_OF[mealPattern] + (lowAppetite && mealPattern === '3' ? 1 : 0);
          if (r.meals.length !== expected)
            comboMissing.push(`${label} ${r.meals.length}/${expected}`);
        }
      }
    });
  }
  check(
    `못 먹는 것 0~2개 × 끼니 구성 × 스타일 ${combos}가지 — 하루 kcal 이 목표의 ±10% 안`,
    comboBad.kcal.length === 0,
    comboBad.kcal.slice(0, 4).join(' · ')
  );
  check(
    `못 먹는 것 0~2개 × 끼니 구성 × 스타일 ${combos}가지 — 단백질이 목표의 85% 넘게`,
    comboBad.protein.length === 0,
    comboBad.protein.slice(0, 4).join(' · ')
  );
  check(
    `못 먹는 것 0~2개 × 끼니 구성 × 스타일 ${combos}가지 — 못 먹는 것은 하나도 안 들어간다`,
    comboBad.avoid.length === 0,
    comboBad.avoid.slice(0, 4).join(' · ')
  );
  check(
    `성장기 · 어린이는 보충식품을 켜 둬도 안 들어간다(${combos}가지)`,
    comboSupp.length === 0,
    comboSupp.slice(0, 4).join(' · ')
  );
  check(
    '못 먹는 것이 둘이어도 끼니 구성의 끼니를 모두 짠다',
    comboMissing.length === 0,
    comboMissing.slice(0, 4).join(' · ')
  );

  /*
   * ── 실제 앱 목표로 — computeTargets(몸 × 활동 × 목표 × 운동 몫) ──
   * 위 시험의 목표(체중 × 38 같은 어림)는 가장 낮아도 1,900kcal 이라, 감량 · 활동 적음(1,250~1,650kcal)에서 넘치는 것을 못 봤다.
   * 단백질이 kcal 의 3할 넘게를 차지해야 하는 날(1,250kcal 에 120g)은 둘을 다 맞출 수 없는 때가 있어 비율로 본다.
   */
  const BODIES: Body[] = [
    { weightKg: 30, heightCm: 135, age: 10, sex: 'M' },
    { weightKg: 40, heightCm: 150, age: 12, sex: 'F' },
    { weightKg: 55, heightCm: 168, age: 15, sex: 'M' },
    { weightKg: 75, heightCm: 182, age: 17, sex: 'M' },
    { weightKg: 60, heightCm: 172, age: 22, sex: 'M' },
    { weightKg: 85, heightCm: 185, age: 25, sex: 'M' },
    { weightKg: 105, heightCm: 190, age: 28, sex: 'M' },
    { weightKg: 55, heightCm: 160, age: 24, sex: 'F' },
  ];
  const SETTINGS = [
    { goal: 'lose', activity: 'low', proteinPerKg: null },
    { goal: 'lose', activity: 'low', proteinPerKg: 2.2 },
    { goal: 'lose', activity: 'mid', proteinPerKg: 2.2 },
    { goal: 'maintain', activity: 'low', proteinPerKg: null },
    { goal: 'gain', activity: 'high', proteinPerKg: 2.2 },
    { goal: 'gain', activity: 'mid', proteinPerKg: null },
  ] as const;
  let real = 0;
  const realBad = {
    kcal: [] as string[],
    far: [] as string[],
    protein: [] as string[],
    avoid: 0,
    snack: 0,
  };
  BODIES.forEach((body, bi) =>
    SETTINGS.forEach((setting, gi) =>
      [0, 350, 900].forEach((burn, ui) => {
        const t = computeTargets({ ...DEFAULT_PROFILE, ...setting }, body, burn);
        for (let k = 0; k < 6; k++) {
          const i = real++;
          const avoid =
            avoidSets[(bi * 7 + gi * 5 + ui * 3 + k * 11) % avoidSets.length];
          const mealPattern = pats[(bi + gi + k) % 4];
          const r = buildMealPlan({
            ...base,
            date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`,
            seed: `r${i}`,
            targets: { kcal: t.kcal, protein: t.protein },
            goal: t.goal,
            ageBand: t.ageBand,
            prefs: {
              ...DEFAULT_PREFS,
              mealPattern,
              dietStyle: styles[(bi + ui + k) % 3],
              avoid,
              supplements: k % 2 === 0,
            },
            place: places[(gi + k) % 4],
            throwKind: kinds[(bi + k) % 4],
          });
          const m = planMacros(r.items);
          const label = `${body.age}세 ${t.kcal}kcal ${t.protein}g ${avoid.join('+') || '없음'}/${mealPattern}`;
          /* 짠 끼니가 맞추려던 몫 대비 — 단백질은 kcal 의 35% 까지로 묶인다 */
          const off = m.kcal / r.target.kcal - 1;
          if (Math.abs(off) > 0.1) realBad.kcal.push(`${label} ${Math.round(m.kcal)}`);
          if (Math.abs(off) > 0.3) realBad.far.push(`${label} ${Math.round(m.kcal)}`);
          if (m.protein < r.target.protein * 0.85)
            realBad.protein.push(`${label} ${Math.round(m.protein)}g`);
          if (
            r.items.some((it) => avoidsOf(it.sourceId).some((a) => avoid.includes(a)))
          )
            realBad.avoid++;
          const snack = r.items
            .filter((it) => it.meal === 'snack')
            .reduce((a, it) => a + it.kcal * it.amount, 0);
          if (snack > m.kcal * 0.4) realBad.snack++;
        }
      })
    )
  );
  check(
    `실제 앱 목표 ${real}가지 — 하루 kcal 이 ±10% 밖인 날은 드물다(0.5% 밑)`,
    realBad.kcal.length <= real * 0.005,
    `${realBad.kcal.length} — ${realBad.kcal.slice(0, 3).join(' · ')}`
  );
  check(
    `실제 앱 목표 ${real}가지 — 30% 넘게 벗어나는 날은 없다`,
    realBad.far.length === 0,
    realBad.far.slice(0, 3).join(' · ')
  );
  check(
    `실제 앱 목표 ${real}가지 — 단백질이 85% 밑인 날은 드물다(0.5% 밑) · 못 먹는 것 0`,
    realBad.protein.length <= real * 0.005 && realBad.avoid === 0,
    `${realBad.protein.length} — ${realBad.protein.slice(0, 3).join(' · ')}`
  );
  check(
    `실제 앱 목표 ${real}가지 — 간식(둘이면 둘을 합쳐)이 하루의 4할을 넘는 날은 드물다(0.5% 밑)`,
    realBad.snack <= real * 0.005,
    `${realBad.snack}`
  );

  /*
   * ── 낮은 목표 몸 × 못 먹는 것 46 × 끼니 구성 4 × 스타일 3 전부 ──
   * 감량 · 활동 적은 어른(1,250kcal · 단백질 99g · 121g, 1,640kcal · 108g)은 넘치기 쉽다. 그날 신호(던지는 일정 · 더위 · 입맛 ·
   * 근육통) · 장소 · 먹은 것(없음 · 아침 · 점심까지)을 서로 다른 걸음으로 돌려 조합마다 고루 나오게 한다. 서버는 늘 먹은 것을
   * 넘기므로 kcal 오차는 남은 몫(r.target) 대비로 본다.
   */
  const LOW_BODIES = [
    [{ weightKg: 55, heightCm: 160, age: 24, sex: 'F' }, { proteinPerKg: null }],
    [{ weightKg: 55, heightCm: 160, age: 24, sex: 'F' }, { proteinPerKg: 2.2 }],
    [{ weightKg: 60, heightCm: 172, age: 22, sex: 'M' }, { proteinPerKg: null }],
  ] as const;
  /* 사람이 정한 묶음 상한 — 한 끼(간식 둘은 함께)에 우유류 2컵 · 두부류 2 · 달걀류 3개(흰자 둘이 하나) · 밥류 2공기 */
  const GROUP_CAPS: [string, number, Record<string, number>][] = [
    [
      '우유류',
      2,
      { milk: 1, 'milk-lowfat': 1, 'soy-milk': 1, 'choco-milk': 1, 'banana-milk': 1 },
    ],
    ['두부류', 2, { tofu: 1, 'braised-tofu': 1, 'sundubu-jjigae': 1 }],
    ['달걀류', 3, { egg: 1, 'egg-fried': 1, 'egg-roll': 1, 'egg-white': 0.5 }],
    ['밥류', 2, { rice: 1, 'brown-rice': 1, 'multigrain-rice': 1 }],
  ];
  const groupOver = (items: ReturnType<typeof buildMealPlan>['items']) =>
    (['breakfast', 'lunch', 'dinner', 'snack'] as const).flatMap((meal) =>
      GROUP_CAPS.flatMap(([name, cap, weight]) => {
        const used = items
          .filter((it) => it.meal === meal && weight[it.sourceId])
          .reduce((a, it) => a + it.amount * weight[it.sourceId], 0);
        return used > cap + 1e-9 ? [`${meal} ${name} ${used}`] : [];
      })
    );
  /* 던지는 일정에 꼭 맞춰야 하는 끼니의 꼬리표 */
  const MUST: Record<string, [string, string][]> = {
    today: [
      ['lunch', 'pre'],
      ['dinner', 'rec'],
    ],
    eve: [['dinner', 'pre']],
    after: [['dinner', 'rec']],
  };
  const tagsOf = (key: string) => MEAL_TEMPLATES.find((t) => t.key === key)?.tags ?? [];
  let low = 0;
  /* 남은 끼니가 둘 넘게(먹은 것 없음 · 아침) / 하나(점심까지) — 하나 남은 날은 넘친 것을 덜 끼니가 없어 따로 본다 */
  const lowBad = {
    kcal: [] as string[],
    far: [] as string[],
    lastKcal: [] as string[],
    lastFar: [] as string[],
    protein: [] as string[],
    avoid: 0,
    group: [] as string[],
    must: [] as string[],
    why: [] as string[],
  };
  let lastN = 0;
  LOW_BODIES.forEach(([body, setting], bi) => {
    const t = computeTargets(
      { ...DEFAULT_PROFILE, goal: 'lose', activity: 'low', ...setting },
      body,
      0
    );
    avoidSets.forEach((avoid, ai) =>
      pats.forEach((mealPattern, pi) =>
        styles.forEach((dietStyle, di) => {
          const i = low++;
          const throwKind = kinds[(ai + pi + bi) % 4];
          const ate = (ai + 2 * pi + di + bi) % 3;
          const r = buildMealPlan({
            ...base,
            date: `2026-11-${String(1 + ((ai + pi * 7 + di * 3 + bi) % 28)).padStart(2, '0')}`,
            seed: `low${i}`,
            variant: (ai + di) % 3,
            targets: { kcal: t.kcal, protein: t.protein },
            goal: t.goal,
            ageBand: t.ageBand,
            prefs: {
              ...DEFAULT_PREFS,
              mealPattern,
              dietStyle,
              avoid,
              supplements: true,
            },
            place: places[(ai + pi + di) % 4],
            throwKind,
            hot: (ai + di + bi) % 3 === 0,
            appetite: (ai + pi + di) % 2 === 0 ? 1 : null,
            soreness: (ai + bi) % 5 === 0 ? 5 : null,
            eaten: [
              ...(ate >= 1
                ? [
                    {
                      meal: 'breakfast' as const,
                      kcal: Math.round(t.kcal * (0.25 + (ai % 4) * 0.05)),
                      protein: Math.round(t.protein * 0.2),
                    },
                  ]
                : []),
              ...(ate >= 2
                ? [
                    {
                      meal: 'lunch' as const,
                      kcal: Math.round(t.kcal * 0.35),
                      protein: Math.round(t.protein * 0.25),
                    },
                  ]
                : []),
            ],
          });
          if (r.items.length === 0) return;
          const m = planMacros(r.items);
          const label = `${t.kcal}/${t.protein} ${avoid.join('+') || '없음'}/${mealPattern}/${dietStyle} 먹은${ate} 남은${r.target.kcal}`;
          const off = m.kcal / r.target.kcal - 1;
          const last = r.meals.length === 1;
          if (last) lastN++;
          if (Math.abs(off) > 0.1)
            (last ? lowBad.lastKcal : lowBad.kcal).push(
              `${label} → ${Math.round(m.kcal)}`
            );
          if (Math.abs(off) > 0.25)
            (last ? lowBad.lastFar : lowBad.far).push(
              `${label} → ${Math.round(m.kcal)}`
            );
          if (m.protein < r.target.protein * 0.85)
            lowBad.protein.push(
              `${label} ${Math.round(m.protein)}/${r.target.protein}g`
            );
          if (
            r.items.some((it) => avoidsOf(it.sourceId).some((a) => avoid.includes(a)))
          )
            lowBad.avoid++;
          for (const g of groupOver(r.items)) lowBad.group.push(`${label} ${g}`);
          for (const [meal, tag] of throwKind ? MUST[throwKind] : []) {
            const picked = r.meals.find((x) => x.meal === meal);
            if (picked && !tagsOf(picked.template).includes(tag as never))
              lowBad.must.push(`${label} ${meal} ${picked.template}`);
          }
          /* 까닭 줄은 고른 틀의 꼬리표대로 */
          const said = r.reasons.join(' ');
          const has = (meal: string, tag: string) =>
            r.meals.some(
              (x) => x.meal === meal && tagsOf(x.template).includes(tag as never)
            );
          const anyTag = (tag: string) =>
            r.meals.some((x) => tagsOf(x.template).includes(tag as never));
          if (
            (said.includes('점심을 탄수화물') && !has('lunch', 'pre')) ||
            (said.includes('저녁은 회복식') && !has('dinner', 'rec')) ||
            (said.includes('내일 등판') && !has('dinner', 'pre')) ||
            (said.includes('던진 뒤라') &&
              !has('dinner', 'rec') &&
              !has('snack', 'rec')) ||
            (said.includes('더운 날') && !anyTag('heat')) ||
            (said.includes('부드러운 것') && !anyTag('light')) ||
            said.includes('—')
          )
            lowBad.why.push(`${label} ${said}`);
        })
      )
    );
  });
  /* 허용 비율은 실측(2026-10-06: 끼니 둘 넘게 8/1148 · 25% 넘게 0, 하나 29/508 · 1, 단백질 0)에 조금 얹은 것 */
  const many = low - lastN;
  check(
    `낮은 목표 몸 · 남은 끼니 둘 넘게 ${many}가지 — kcal 이 남은 몫의 ±10% 밖은 1.5% 밑 · 25% 넘게는 없다`,
    lowBad.kcal.length <= many * 0.015 && lowBad.far.length === 0,
    `${lowBad.kcal.length} · ${lowBad.far.length} — ${lowBad.kcal.slice(0, 3).join(' · ')}`
  );
  check(
    `낮은 목표 몸 · 먹은 뒤 한 끼만 남은 ${lastN}가지 — kcal 이 남은 몫의 ±10% 밖은 7% 밑 · 25% 넘게는 0.5% 밑`,
    lowBad.lastKcal.length <= lastN * 0.07 && lowBad.lastFar.length <= lastN * 0.005,
    `${lowBad.lastKcal.length} · ${lowBad.lastFar.length} — ${lowBad.lastKcal.slice(0, 3).join(' · ')}`
  );
  check(
    `낮은 목표 몸 ${low}가지 — 단백질이 남은 몫의 85% 밑인 날은 0.5% 밑 · 못 먹는 것 0`,
    lowBad.protein.length <= low * 0.005 && lowBad.avoid === 0,
    `${lowBad.protein.length} — ${lowBad.protein.slice(0, 3).join(' · ')}`
  );
  check(
    `낮은 목표 몸 ${low}가지 — 한 끼에 우유류 2컵 · 두부류 2 · 달걀류 3개 · 밥류 2공기를 넘지 않는다`,
    lowBad.group.length === 0,
    lowBad.group.slice(0, 3).join(' · ')
  );
  check(
    `낮은 목표 몸 ${low}가지 — 던지는 날 점심 · 저녁, 등판 전날 저녁, 던진 뒤 저녁은 꼭 맞는 틀(던지기 전 · 회복식)`,
    lowBad.must.length === 0,
    lowBad.must.slice(0, 3).join(' · ')
  );
  check(
    `낮은 목표 몸 ${low}가지 — 까닭 줄은 고른 틀의 꼬리표대로(던지기 전 · 회복식 · 더위 · 부드러운 것) · 줄표 없음`,
    lowBad.why.length === 0,
    lowBad.why.slice(0, 2).join(' · ')
  );

  /* ── 그날 조건 — 끼니가 놓이는 장소마다 그날 꼭 맞는 틀을 고른다 ── */
  const SITUATIONS = [
    {
      name: '던지는 날 점심 → 던지기 전',
      mod: { throwKind: 'today' },
      meal: 'lunch',
      tag: 'pre',
    },
    {
      name: '등판 전날 저녁 → 던지기 전',
      mod: { throwKind: 'eve' },
      meal: 'dinner',
      tag: 'pre',
    },
    {
      name: '던진 뒤 저녁 → 회복',
      mod: { throwKind: 'after' },
      meal: 'dinner',
      tag: 'rec',
    },
    {
      name: '던진 뒤 간식 → 회복',
      mod: { throwKind: 'after' },
      meal: 'snack',
      tag: 'rec',
    },
    {
      name: '입맛 없는 날 간식 → 입맛 없을 때',
      mod: { appetite: 1 },
      meal: 'snack',
      tag: 'light',
    },
    { name: '더운 날 점심 → 더운 날', mod: { hot: true }, meal: 'lunch', tag: 'heat' },
  ] as const;
  const situationMiss: string[] = [];
  for (const sit of SITUATIONS) {
    for (const place of places) {
      let n = 0,
        hit = 0;
      for (let i = 0; i < 60; i++) {
        const band = BANDS[i % 3];
        const r = buildMealPlan({
          ...base,
          ...sit.mod,
          date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`,
          seed: `t${i}`,
          targets:
            band === 'child'
              ? { kcal: 1900, protein: 45 }
              : band === 'teen'
                ? { kcal: 2700, protein: 90 }
                : { kcal: 3000, protein: 150 },
          goal: band === 'child' ? GOALS[(i >> 1) % 2] : GOALS[(i >> 1) % 3],
          ageBand: band,
          place,
          prefs: {
            ...DEFAULT_PREFS,
            avoid: avoidSets[(i * 7) % avoidSets.length],
            dietStyle: styles[(i >> 2) % 3],
            mealPattern: pats[(i >> 3) % 4],
          },
        });
        const meals = r.meals.filter((m) => m.meal === sit.meal);
        if (meals.length === 0) continue;
        n++;
        if (meals.some((m) => tagOf(m.template).includes(sit.tag))) hit++;
      }
      if (hit < n * 0.95) situationMiss.push(`${sit.name} @${place} ${hit}/${n}`);
    }
  }
  check(
    '그날 조건(던지는 일정 · 입맛 · 더위)에 꼭 맞는 틀을 장소마다 95% 넘게 고른다',
    situationMiss.length === 0,
    situationMiss.join(' · ')
  );

  /* 단백질 재료의 바꿔 넣기는 1인분 5g 넘는 것만 — 샐러드(3g)로 바꾸면 단백질을 맞추려고 스무 접시까지 늘렸다 */
  const saladSubs = SUBSTITUTES['chicken-salad'];
  SUBSTITUTES['chicken-salad'] = ['salad'];
  let saladOver = 0;
  for (let i = 0; i < 80; i++) {
    const r = buildMealPlan({
      ...base,
      seed: `c${i}`,
      date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`,
      place: places[i % 4],
      prefs: { ...DEFAULT_PREFS, avoid: ['chicken'], dietStyle: styles[i % 3] },
      goal: GOALS[i % 3],
    });
    if (r.items.some((it) => it.sourceId === 'salad' && it.amount > 1)) saladOver++;
  }
  /* 원래 값으로 — 지우면 그 뒤 시험이 바꿔 넣기 없는 닭가슴살 샐러드로 돈다 */
  if (saladSubs) SUBSTITUTES['chicken-salad'] = saladSubs;
  else delete SUBSTITUTES['chicken-salad'];
  check(
    '단백질 재료는 단백질이 적은 음식(샐러드)으로 바꿔 넣지 않는다',
    saladOver === 0,
    `${saladOver}/80`
  );

  /*
   * ── 바꿔 넣기 없이 고를 틀 — 못 먹는 것을 둘 골라도, 보충식품 없이(성장기)도 셋 넘게 ──
   * 바꿔 넣기(SUBSTITUTES)는 모자랄 때의 길이라 '식빵 · 달걀프라이' 가 '고구마 · 두부'로 바뀌는 식이 된다. 틀 그대로 쓸 수 있는
   * 것이 끼니가 놓이는 장소마다 · 스타일마다 · 던지기 전 · 회복 · 입맛 없을 때마다 남아 있어야 한다. 아침은 늘 집, 저녁은 집이나
   * 밖에서 먹는다(meal-plan.ts placeFor).
   */
  const REACH: Record<string, readonly string[]> = {
    breakfast: ['home'],
    lunch: places,
    dinner: ['home', 'out'],
    snack: places,
  };
  const asIs = (t: MealTemplate, avoid: AvoidList) =>
    t.items.every(
      (i) =>
        i.role === 'side' ||
        (!SUPPLEMENTS.has(i.food.id!) &&
          !avoidsOf(i.food.id!).some((a) => avoid.includes(a)))
    );
  const short: string[] = [];
  for (const [slot, reach] of Object.entries(REACH)) {
    const pool = bySlot(slot);
    const there = (t: MealTemplate) => t.places.some((p) => reach.includes(p));
    const needs: [string, (t: MealTemplate) => boolean, number][] = [
      ...reach.map(
        (p) =>
          [`장소 ${p}`, (t: MealTemplate) => t.places.includes(p as never), 3] as [
            string,
            (t: MealTemplate) => boolean,
            number,
          ]
      ),
      ['한식', (t) => there(t) && t.styles.includes('korean'), 3],
      ['간편식', (t) => there(t) && t.styles.includes('simple'), 3],
      ['던지기 전', (t) => there(t) && t.tags.includes('pre'), 3],
      ['회복', (t) => there(t) && t.tags.includes('rec'), slot === 'breakfast' ? 2 : 3],
      ['입맛 없을 때', (t) => there(t) && t.tags.includes('light'), 3],
    ];
    for (const avoid of avoidSets) {
      for (const [label, fits, need] of needs) {
        const n = pool.filter((t) => asIs(t, avoid) && fits(t)).length;
        if (n < need)
          short.push(`${slot} ${label} [${avoid.join('+') || '없음'}] ${n}`);
      }
    }
  }
  check(
    '못 먹는 것 0~2개 · 보충식품 없이도 끼니 · 장소 · 스타일 · 꼬리표마다 바꿔 넣기 없이 고를 틀이 셋 넘게',
    short.length === 0,
    `${short.length}곳 — ${short.slice(0, 5).join(' · ')}`
  );

  /* ── 이레 연속 — 같은 조건으로 날마다 짜도 한 틀이 몰리지 않는다 ── */
  let weekSlots = 0,
    weekOver = 0,
    nextDays = 0,
    nextSame = 0;
  const weekWorst: string[] = [];
  for (let i = 0; i < 240; i++) {
    const avoid = avoidSets[(i * 5) % avoidSets.length];
    const band = (['adult', 'teen', 'child'] as const)[i % 3];
    const kg =
      band === 'child'
        ? 32 + (i % 15)
        : band === 'teen'
          ? 52 + (i % 20)
          : 68 + (i % 30);
    const input: PlanInput = {
      ...base,
      seed: 'w' + i,
      targets: {
        kcal: Math.round(kg * (band === 'child' ? 60 : band === 'teen' ? 48 : 38)),
        protein: Math.round(
          kg * (band === 'child' ? 1.2 : band === 'teen' ? 1.5 : 1.8)
        ),
      },
      goal: (['gain', 'maintain', 'lose'] as const)[i % 3],
      ageBand: band,
      prefs: {
        ...DEFAULT_PREFS,
        mealPattern: pats[i % 4],
        dietStyle: styles[(i >> 2) % 3],
        avoid,
        supplements: i % 2 === 0,
        seasonPhase: (['off', 'pre', 'in', 'rehab', null] as const)[i % 5],
      },
      place: places[(i >> 1) % 4],
    };
    const bySlotDay = new Map<string, string[]>();
    for (let d = 0; d < 7; d++) {
      /* 시작 요일을 사람마다 바꿔 이레가 월요일(이어 짜기를 새로 시작하는 날)을 걸치게 */
      const r = buildMealPlan({
        ...input,
        date: `2026-11-${String(9 + (i % 7) + d).padStart(2, '0')}`,
      });
      const nth: Record<string, number> = {};
      for (const meal of r.meals) {
        const k = `${meal.meal}${(nth[meal.meal] = (nth[meal.meal] ?? -1) + 1)}`;
        bySlotDay.set(k, [...(bySlotDay.get(k) ?? []), meal.template]);
      }
    }
    for (const [k, list] of bySlotDay) {
      weekSlots++;
      const counts = new Map<string, number>();
      for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1);
      const most = Math.max(...counts.values());
      if (most > 3) {
        weekOver++;
        weekWorst.push(`${input.seed} ${k} ${most}번`);
      }
      for (let d = 1; d < list.length; d++) {
        nextDays++;
        if (list[d] === list[d - 1]) nextSame++;
      }
    }
  }
  /* 240명은 하나도 없어야 한다 — 여유(0.5% 밑)를 두면 지금 0/900 이라 회귀만 숨긴다 */
  check(
    '이레 동안 한 끼니에 같은 틀이 네 번 이상 나오는 일은 없다(240명)',
    weekOver === 0,
    `${weekOver}/${weekSlots} — ${weekWorst.slice(0, 4).join(' · ')}`
  );
  check(
    '이틀 잇달아 같은 틀이 나오는 일은 드물다(2% 밑)',
    nextSame <= nextDays * 0.02,
    `${nextSame}/${nextDays}`
  );

  /*
   * ── 실제 어제 · 그제 식단(recent)을 넘기면 — 던지는 날 · '다른 식단으로' · 주말 집이 섞인 두 주도 ──
   * 넘기지 않으면 지난 날을 '보통 날'로 짜 보고 피하므로, 어제 '다른 식단으로'를 눌렀으면 짜 본 어제와 실제 어제가 달라 같은 틀이
   * 이어질 수 있다. 서버가 저장된 MealPlan.context.meals 의 틀을 넘기면 그것을 피한다.
   */
  const THROW_WEEK = ['eve', 'today', 'after', null, null] as const;
  let mixDays = 0,
    mixSame = 0;
  for (let i = 0; i < 80; i++) {
    const history: string[][] = [];
    let prev: Map<string, string> | null = null;
    for (let d = 0; d < 14; d++) {
      const r = buildMealPlan({
        ...base,
        seed: `m${i}`,
        date: `2026-11-${String(2 + d).padStart(2, '0')}`,
        variant: (d + i) % 3 === 0 ? 1 : 0,
        throwKind: THROW_WEEK[(d + i) % 5],
        place: d % 7 >= 5 ? 'home' : places[i % 4],
        prefs: {
          ...DEFAULT_PREFS,
          avoid: avoidSets[(i * 5) % avoidSets.length],
          dietStyle: styles[i % 3],
          mealPattern: pats[(i >> 2) % 4],
        },
        recent: [history[0] ?? null, history[1] ?? null],
      });
      const cur = new Map<string, string>();
      const nth: Record<string, number> = {};
      for (const meal of r.meals)
        cur.set(
          `${meal.meal}${(nth[meal.meal] = (nth[meal.meal] ?? -1) + 1)}`,
          meal.template
        );
      if (prev) {
        for (const [k, t] of cur) {
          mixDays++;
          if (prev.get(k) === t) mixSame++;
        }
      }
      prev = cur;
      history.unshift(r.meals.map((m) => m.template));
    }
  }
  check(
    '실제 어제 · 그제 식단을 넘기면 던지는 날 · 다른 식단으로가 섞여도 이틀 잇달아 같은 틀은 드물다(2% 밑)',
    mixSame <= mixDays * 0.02,
    `${mixSame}/${mixDays}`
  );

  const parsed = parsePlanItems([
    { ...one.items[0] },
    { ...one.items[0], key: 'x', meal: 'brunch' },
    { ...one.items[0], key: 'y', amount: 0 },
    { ...one.items[0], key: 'z', kcal: -1 },
    'junk',
    { ...one.items[0], key: 'w', done: true, protein: -3 },
  ]);
  check(
    '저장한 계획을 다시 본다 — 틀린 줄은 버리고 음수 영양소는 비운다',
    parsed.length === 2 && parsed[1].done && parsed[1].protein === null
  );
  /* 서버가 DB 의 어제 · 그제 계획(context)을 recent 로 바꾸는 길 — 저장한 모양 그대로 */
  const saved = (keys: string[]) => ({
    place: 'home',
    meals: keys.map((t, i) => ({ meal: i ? 'lunch' : 'breakfast', title: t, template: t })),
  });
  const rec = recentTemplates('2026-11-10', [
    { date: '2026-11-09', context: saved(['a-1', 'b-2']) },
    { date: '2026-11-07', context: saved(['old']) },
  ]);
  const recEmpty = recentTemplates('2026-11-01', [
    { date: '2026-10-31', context: { meals: [{ meal: 'lunch', title: 'x', template: '' }] } },
    { date: '2026-10-30', context: 'junk' },
  ]);
  check(
    '어제 · 그제 저장한 계획 → recent — 어제는 틀 열쇠, 계획이 없는 그제 · 사흘 전 것은 null, 달을 넘어도',
    JSON.stringify(rec) === JSON.stringify([['a-1', 'b-2'], null]) &&
      JSON.stringify(recEmpty) === JSON.stringify([null, null]),
    JSON.stringify([rec, recEmpty])
  );
  /* 실제로 넘긴 어제를 피한다 — 어제 '다른 식단으로'(variant 1)로 바꾼 식단을 넘기면 오늘 같은 끼니에 같은 틀이 거의 없다 */
  let avoidAll = 0,
    avoidSame = 0;
  for (let i = 0; i < 120; i++) {
    const y = buildMealPlan({ ...base, seed: `r${i}`, date: '2026-11-09', variant: 1 });
    const t = buildMealPlan({
      ...base,
      seed: `r${i}`,
      date: '2026-11-10',
      variant: 0,
      recent: recentTemplates('2026-11-10', [
        { date: '2026-11-09', context: { meals: y.meals } },
      ]),
    });
    for (const m of t.meals) {
      avoidAll++;
      if (y.meals.some((x) => x.meal === m.meal && x.template === m.template)) avoidSame++;
    }
  }
  check(
    '서버 길 그대로(저장한 어제 → recentTemplates → 식단 짜기) 어제와 같은 끼니 · 같은 틀이 드물다(2% 밑)',
    avoidSame <= avoidAll * 0.02,
    `${avoidSame}/${avoidAll}`
  );

  const ctx = parsePlanContext({ place: 'mars', hot: 'yes', reasons: ['a', 3] });
  check(
    '저장한 조건을 다시 본다 — 모르는 값은 기본값',
    ctx.place === 'home' &&
      ctx.hot === false &&
      ctx.reasons.join() === 'a' &&
      ctx.variant === 0
  );
  check(
    '계획의 합은 아직 안 먹은 줄만',
    planMacros(parsed).kcal === parsed[0].kcal * parsed[0].amount
  );

  /* ── 고정 회귀: 검토(2026-10-04)의 재현 입력 그대로. 남은 몫(r.target) 대비 ±10% 안 ── */
  const lowTarget = (body: Body, setting: Partial<ProfileSettings>) => {
    const t = computeTargets({ ...DEFAULT_PROFILE, ...setting }, body, 0);
    return {
      ...base,
      seed: 'user-a',
      targets: { kcal: t.kcal, protein: t.protein },
      goal: t.goal,
      ageBand: t.ageBand,
    } satisfies PlanInput;
  };
  const LOW_W = lowTarget(
    { weightKg: 55, heightCm: 160, age: 24, sex: 'F' },
    { goal: 'lose', activity: 'low' }
  );
  const kcalOffOf = (r: ReturnType<typeof buildMealPlan>) =>
    planMacros(r.items).kcal / Math.max(1, r.target.kcal) - 1;
  const unshrinkable = buildMealPlan({
    ...LOW_W,
    date: '2026-11-07',
    prefs: {
      ...DEFAULT_PREFS,
      mealPattern: '3+2',
      dietStyle: 'simple',
      avoid: ['nuts'],
    },
  });
  check(
    '줄일 수 없는 한 그릇 · 낱개가 끼니 몫을 넘지 않는다(1,250kcal · 간식 둘 · 간편식: 간식에 김밥 한 줄이 뽑혀 +33% 였다)',
    Math.abs(kcalOffOf(unshrinkable)) <= 0.1,
    `${Math.round(kcalOffOf(unshrinkable) * 100)}%`
  );
  const afterBreakfast = buildMealPlan({
    ...lowTarget(
      { weightKg: 60, heightCm: 172, age: 22, sex: 'M' },
      { goal: 'lose', activity: 'low' }
    ),
    date: '2026-11-28',
    place: 'out',
    prefs: { ...DEFAULT_PREFS, mealPattern: '3+2', dietStyle: 'korean' },
    eaten: [{ meal: 'breakfast', kcal: 470, protein: 17 }],
  });
  check(
    '먹은 뒤 짜면 남은 몫에 맞춘다(1,640kcal 감량 · 아침 470kcal 먹음 · 밖: 남은 1,170kcal 에 1,655kcal 이었다)',
    Math.abs(kcalOffOf(afterBreakfast)) <= 0.1 && afterBreakfast.target.kcal === 1170,
    `남은 ${afterBreakfast.target.kcal} → ${Math.round(planMacros(afterBreakfast.items).kcal)} (${Math.round(kcalOffOf(afterBreakfast) * 100)}%)`
  );
}

console.log('\n■ 식약처 음식 둘러보기');
{
  check(
    '식품코드로 분류 — 밥 · 김밥은 분식 · 국 · 찌개 · 구이는 고기·생선 · 원재료 채소',
    mfdsCategory('D101-004160000-0001', '국밥_돼지머리') === '밥' &&
      mfdsCategory('D101-007000000-0001', '김밥') === '분식' &&
      mfdsCategory('D105-000000000-0001', '갈비탕') === '국·찌개' &&
      mfdsCategory('D306-000000000-0001', '김치찌개') === '국·찌개' &&
      mfdsCategory('D108-000000000-0001', '고등어구이') === '고기·생선' &&
      mfdsCategory('R106-000000000-0001', '가지, 생것') === '과일·채소' &&
      mfdsCategory('R211-000000000-0001', '가자미, 생것') === '고기·생선'
  );
  check(
    '떡은 면·빵(D1 · D3), 빵 · 햄버거는 분식(D4~D7)',
    mfdsCategory('D102-0', '가래떡') === '면·빵' &&
      mfdsCategory('D302-0', '송편') === '면·빵' &&
      mfdsCategory('D402-0', '햄버거_치킨') === '분식'
  );
  check(
    '양념 · 기름 · 당류 · 장류 · 조미료 · 술 · 이름 없는 줄은 둘러보기에서 뺀다',
    [
      ['D118-0', '짜장소스'],
      ['P107-0', '쇼트닝'],
      ['P104-0', '물엿'],
      ['P112-0', '된장'],
      ['P113-0', '마요네즈'],
      ['P115-0', '막걸리'],
      ['R114-0', '올리브유'],
      ['R118-0', '고춧가루'],
      ['D318-0', ''],
    ].every(([code, name]) => mfdsCategory(code, name) === null)
  );

  const cat = (code: string, name: string) => mfdsCategory(code, name);
  check(
    '이름으로 제자리 — 국수 · 당면은 면·빵, 과자 · 사탕 · 팝콘은 간식, 떡은 면·빵, 빵은 면·빵',
    cat('R101-0', '국수, 소면, 말린것') === '면·빵' &&
      cat('R101-0', '마카로니, 말린것') === '면·빵' &&
      cat('R102-0', '당면, 고구마, 말린것') === '면·빵' &&
      cat('P101-0', '감자칩') === '간식·보충' &&
      cat('P101-0', '박하사탕') === '간식·보충' &&
      cat('P101-0', '젤리구미') === '간식·보충' &&
      cat('D324-0', '팝콘') === '간식·보충' &&
      cat('P101-0', '가래떡') === '면·빵' &&
      cat('P101-0', '식빵') === '면·빵' &&
      cat('R121-0', '빵, 식빵, 버터 첨가') === '면·빵'
  );
  check(
    '분식은 기본 목록처럼 — 삼각김밥 · 떡볶이 · 라면 · 만두 · 순대 · 햄버거(어느 묶음이든), 순대국밥은 밥, 떡만두국은 떡국처럼 밥',
    cat('D101-0', '삼각김밥_참치마요네즈') === '분식' &&
      cat('D110-0', '떡볶이') === '분식' &&
      cat('D103-0', '라면') === '분식' &&
      cat('D103-0', '고기만두') === '분식' &&
      cat('D107-0', '순대') === '분식' &&
      cat('D102-0', '햄버거_불고기버거') === '분식' &&
      cat('D102-0', '케이크_생크림케이크') === '간식·보충' &&
      cat('D101-0', '국밥_순대국밥') === '밥' &&
      cat('D105-0', '떡만두국') === '밥' &&
      cat('R121-0', '김밥용김') !== '분식'
  );
  check(
    '한 끼가 아닌 것은 뺀다 — 가루 · 반죽 · 베이킹파우더 · 청 · 버터 · 생크림 · 액젓 · 육수 · 전분 · 참깨',
    [
      ['R101-0', '밀, 강력밀가루'],
      ['P116-0', '베이킹파우더'],
      ['P116-0', '튀김가루'],
      ['P116-0', '녹두전/반죽'],
      ['P114-0', '매실청'],
      ['P119-0', '버터/무염'],
      ['P119-0', '생크림'],
      ['P119-0', '1단계분유'],
      ['P120-0', '까나리액젓'],
      ['R211-0', '멸치육수'],
      ['R102-0', '전분, 감자, 가루'],
      ['R105-0', '참깨, 흰색, 볶은것'],
      ['P101-0', '쿠키/생지'],
      ['P101-0', '피자도우'],
    ].every(([code, name]) => cat(code, name) === null)
  );
  check(
    'R121(잡동사니)은 아는 것만 — 햄 · 두부는 고기·생선, 김치는 반찬, 간장 · 소주 · 생수 · 소금은 뺀다',
    cat('R121-0', '햄, 슬라이스햄') === '고기·생선' &&
      cat('R121-0', '두부, 순두부') === '고기·생선' &&
      cat('R121-0', '김치, 배추 김치') === '반찬' &&
      cat('R121-0', '요구르트, 액상') === '우유·음료' &&
      cat('R121-0', '간장, 개량, 산분해') === null &&
      cat('R121-0', '증류주, 소주, 희석식') === null &&
      cat('R121-0', '생수') === null &&
      cat('R121-0', '소금, 정제염') === null
  );
  check(
    '마시는 가루는 담는다(물에 탄 것 · 음료), 맛 이름의 양념은 빼지 않는다',
    cat('D420-0', '미숫가루(선식)음료') === '우유·음료' &&
      cat('R121-0', '카페라테, 가루, 물에 탄것(중량 14.2g)') === '우유·음료' &&
      cat('D105-0', '된장국_시금치') === '국·찌개' &&
      cat('D510-0', '떡볶이_간장') === '분식'
  );
  {
    /* 실제 자료 전부 — 어느 분류에도 양념 · 술 · 물 · 가루가 앞말로 남지 않는다 */
    const BAD =
      /^(간장|고추장|된장|소금|설탕|식초|발효주|증류주|생수|버터|분유|마가린|쇼트닝)$|소스$|드레싱$|가루$|파우더$|반죽$|액젓$|육수$/;
    const leaks = [...allMfdsReps()].filter((r) => {
      const name = String(r.FOOD_NM_KR ?? '');
      const head = name.split(/[,_/(]/)[0].trim();
      return (
        mfdsCategory(String(r.FOOD_CD ?? ''), name) !== null &&
        BAD.test(head) &&
        !/음료|탄것|끓인것/.test(name)
      );
    });
    check(
      '실제 자료 8,807줄 — 둘러보기에 양념 · 술 · 가루가 0줄',
      leaks.length === 0,
      leaks
        .slice(0, 5)
        .map((r) => r.FOOD_NM_KR)
        .join(' · ')
    );
    const r121meat = [...allMfdsReps()].filter(
      (r) =>
        String(r.FOOD_CD).startsWith('R121') &&
        mfdsCategory(String(r.FOOD_CD), String(r.FOOD_NM_KR)) === '고기·생선'
    );
    check(
      'R121 의 고기·생선은 고기 · 생선 · 콩 가공품뿐(예전 643줄)',
      r121meat.length > 30 &&
        r121meat.length < 120 &&
        r121meat.every((r) =>
          /햄|소시지|베이컨|게맛살|어묵|미트볼|소고기|불고기|커틀릿|너겟|돈저냐|닭꼬치|두부|낫토|비지|대체식품|달걀/.test(
            String(r.FOOD_NM_KR)
          )
        ),
      String(r121meat.length)
    );
  }

  const index = buildBrowseIndex([...allMfdsReps()]);
  const all = browsePage(index, 'all', 0, 40);
  const sizes = [...index].map(([c, list]) => `${c} ${list.length}`).join(' · ');
  check(
    '분류마다 식약처 음식이 넉넉하다(100가지 넘게)',
    [...index.values()].every((l) => l.length >= 100),
    sizes
  );
  check(
    '전체 = 분류의 합, 5천 가지 넘게(같은 이름 · 뺀 것을 빼고)',
    all.total === [...index.values()].reduce((a, l) => a + l.length, 0) &&
      all.total > 5000,
    String(all.total)
  );
  check(
    '한 분류 안에 같은 이름은 하나',
    [...index.values()].every((l) => new Set(l.map((f) => f.name)).size === l.length)
  );
  const order = (id: string) =>
    id[0] === 'D' ? (id[1] === '1' ? 0 : 1) : id[0] === 'P' ? 2 : 3;
  check(
    '조리한 음식 → 가공식품 → 원재료 순',
    [...index.values()].every((l) =>
      l.every((f, i) => i === 0 || order(l[i - 1].id!) <= order(f.id!))
    )
  );
  check(
    '모두 식약처 음식(1회 kcal 있음)',
    [...index.values()].every((l) => l.every((f) => f.source === 'mfds' && f.kcal >= 0))
  );
  const soup = browsePage(index, '국·찌개', 0, 40);
  const soup2 = browsePage(index, '국·찌개', soup.next ?? 0, 40);
  const last = browsePage(index, '국·찌개', soup.total - 5, 40);
  check(
    '40줄씩 — 다음 자리 · 끝에서는 null',
    soup.items.length === 40 &&
      soup.next === 40 &&
      soup2.items[0].food.id !== soup.items[0].food.id &&
      last.items.length === 5 &&
      last.next === null &&
      browsePage(index, '국·찌개', 99999, 40).items.length === 0
  );
  check(
    '전체는 분류 차례로 이어 붙인다(첫 줄은 밥)',
    all.items[0].category === '밥' &&
      browsePage(index, 'all', all.total - 1, 40).items[0].category === '간식·보충'
  );
}

console.log('\n■ 사진 기록 — AI 가 부른 이름을 앱 음식에 맞추기');
{
  check(
    '이름 · 다른 이름이 같으면 기본 음식(흰밥 → 쌀밥, 띄어쓰기 · 괄호 무시)',
    matchBasicFood('흰밥')?.id === 'rice' &&
      matchBasicFood('쌀밥')?.id === 'rice' &&
      matchBasicFood('비빔 밥')?.id === 'bibimbap' &&
      matchBasicFood('돈까스(등심)')?.id === 'tonkatsu'
  );
  check(
    '한쪽이 다른 쪽을 거의 다 품으면 맞춤(닭가슴살 구이 → 닭가슴살), 조금만 겹치면 안 맞춤',
    matchBasicFood('닭가슴살 구이')?.id === 'chicken-breast' &&
      matchBasicFood('김밥천국모둠세트메뉴') === null &&
      matchBasicFood('외계인 요리') === null &&
      matchBasicFood('  ') === null
  );
  const rice = matchBasicFood('쌀밥')!;
  check(
    '짐작한 무게 → 인분(¼ 단위, ¼~5)',
    amountForGrams(rice, 420) === 2 &&
      amountForGrams(rice, 160) === 0.75 &&
      amountForGrams(rice, 10) === 0.25 &&
      amountForGrams(rice, 99999) === 5 &&
      amountForGrams({ ...rice, servingGrams: null }, 300) === 1 &&
      amountForGrams(rice, Number.NaN) === 1
  );

  const p = (
    name: string,
    grams: number,
    extra: Partial<PhotoFood> = {}
  ): PhotoFood => ({
    name,
    grams,
    kcal: 200,
    carbs: 20,
    protein: 10,
    fat: 5,
    confidence: 'high',
    ...extra,
  });
  const macaron = {
    ...rice,
    source: 'mfds' as const,
    id: 'D-mac',
    name: '마카롱',
    servingGrams: 30,
  };
  const asked: string[] = [];
  const out = matchPhotoFoods(
    [
      p('흰밥', 315),
      p('마카롱', 60),
      p('외계인 요리', 99999, {
        kcal: 99999,
        protein: -5,
        carbs: Number.NaN,
        confidence: 'low',
      }),
      p('   ', 100),
    ],
    (name) => {
      asked.push(name);
      return name === '마카롱' ? macaron : null;
    }
  );
  check(
    '기본 음식 → 식약처 → AI 값 차례로 맞추고, 빈 이름은 뺀다',
    out.length === 3 &&
      out[0].from === 'basic' &&
      out[0].food.id === 'rice' &&
      out[0].amount === 1.5 &&
      out[1].from === 'mfds' &&
      out[1].amount === 2 &&
      out[2].from === 'ai' &&
      !asked.includes('흰밥'),
    out.map((c) => `${c.aiName}:${c.from}:${c.amount}`).join(' · ')
  );
  const ai = out[2];
  check(
    'AI 값은 이상한 숫자를 거른다 — 무게 2kg · 3,000kcal 상한, 음수 · NaN 은 모름',
    ai.grams === 2000 &&
      ai.food.kcal === 3000 &&
      ai.food.protein === null &&
      ai.food.carbs === null &&
      ai.food.fat === 5 &&
      ai.food.source === 'free' &&
      ai.food.servingLabel === '2000g(사진 짐작)' &&
      ai.amount === 1 &&
      ai.confidence === 'low'
  );
  check(
    '한 장에서 12가지까지만',
    matchPhotoFoods(
      Array.from({ length: 20 }, (_, i) => p(`음식${i}`, 100)),
      () => null
    ).length === 12
  );

  const rows = [
    { FOOD_CD: 'P101-1', FOOD_NM_KR: '김치찌개' },
    { FOOD_CD: 'D101-2', FOOD_NM_KR: '김치찌개_돼지고기' },
    { FOOD_CD: 'D306-3', FOOD_NM_KR: '김치찌개' },
    { FOOD_CD: 'D101-4', FOOD_NM_KR: '김치찌개' },
    { FOOD_CD: 'D101-5', FOOD_NM_KR: '김치볶음밥' },
  ];
  check(
    '식약처 품목대표 고르기 — 같은 이름 · 이름_ 로 시작, 일반 음식(D1) · 짧은 이름 먼저',
    pickMfdsRep('김치찌개', rows)?.FOOD_CD === 'D101-4' &&
      pickMfdsRep('김치찌개', rows.slice(0, 2))?.FOOD_CD === 'D101-2' &&
      pickMfdsRep('김치', rows) === null &&
      pickMfdsRep('', rows) === null
  );
  const real = pickMfdsRep(
    '김치찌개',
    [...allMfdsReps()].filter((r) => String(r.FOOD_NM_KR).startsWith('김치찌개'))
  );
  check('실제 자료에서도 김치찌개를 찾는다', real !== null, String(real?.FOOD_NM_KR));
}

console.log('\n■ 바코드로 담기(로드맵 8번)');
{
  check(
    '검사 숫자 — 신라면 · 서울우유 · EAN-8 · UPC-A 는 맞고, 끝자리가 틀리면 아니다',
    gtinValid('8801043014809') &&
      gtinValid('8801115114154') &&
      gtinValid('96385074') &&
      gtinValid('036000291452') &&
      !gtinValid('8801043014808')
  );
  check(
    '적은 바코드 다듬기 — 띄어쓰기 · 줄표는 빼고, 자릿수 · 검사 숫자가 틀리면 null',
    cleanBarcode(' 880 1043-014809 ') === '8801043014809' &&
      cleanBarcode('8801043014808') === null &&
      cleanBarcode('12345') === null &&
      cleanBarcode('abc') === null &&
      cleanBarcode(null) === null
  );
  const ramen = parseOffProduct('8801043014809', {
    status: 1,
    product: {
      brands: 'Nongshim',
      product_name: 'Shin Ramyun',
      serving_quantity: 120,
      serving_size: '120g',
      nutriments: {
        'energy-kcal_100g': 421,
        'energy-kcal_serving': 505,
        carbohydrates_100g: 62.1,
        carbohydrates_serving: 74.5,
        proteins_100g: 8.3,
        fat_100g: 13,
      },
    },
  }).food;
  check(
    '1회 양이 있으면 1회 — 회사 이름을 앞에, 1회 값이 없는 칸은 100g 값으로 셈',
    ramen !== null &&
      ramen.source === 'barcode' &&
      ramen.id === '8801043014809' &&
      ramen.name === 'Nongshim Shin Ramyun' &&
      ramen.servingLabel === '1회(120g)' &&
      ramen.kcal === 505 &&
      ramen.carbs === 74.5 &&
      ramen.protein === 10 &&
      ramen.fat === 15.6,
    JSON.stringify(ramen)
  );
  const choco = parseOffProduct('8801062518210', {
    status: 1,
    product: {
      brands: 'Lotte',
      product_name: 'lotte choco',
      product_quantity: 54,
      nutriments: { 'energy-kcal_100g': 518, carbohydrates_100g: 67.9, fat_100g: 25 },
    },
  }).food;
  check(
    '1회 양이 없고 포장이 작으면 한 개(54g), 회사 이름이 이미 있으면 안 붙임',
    choco !== null &&
      choco.name === 'lotte choco' &&
      choco.servingLabel === '1개(54g)' &&
      choco.kcal === 279.7 &&
      choco.protein === null,
    JSON.stringify(choco)
  );
  const milk = parseOffProduct('8801115114154', {
    status: 1,
    product: {
      brands: 'Seoul Milk',
      product_name: 'Milk',
      product_name_ko: '나 100% 1급A우유 1L',
      product_quantity: 1000,
      nutriments: { 'energy-kj_100g': 284, proteins_100g: 3 },
    },
  }).food;
  check(
    '한국어 이름 먼저 · kJ 만 있으면 kcal 로 · 큰 포장(1L)은 100g',
    milk !== null &&
      milk.name === 'Seoul Milk 나 100% 1급A우유 1L' &&
      milk.servingLabel === '100g' &&
      milk.kcal === 67.9 &&
      milk.protein === 3,
    JSON.stringify(milk)
  );
  const noKcal = parseOffProduct('8801056038861', {
    status: 1,
    product: { product_name: '이름만 있는 제품', nutriments: {} },
  });
  check(
    '칼로리를 모르면 담지 않고 이름만(직접 입력 칸에 미리 넣는다) · 없는 제품은 둘 다 null',
    noKcal.food === null &&
      noKcal.name === '이름만 있는 제품' &&
      parseOffProduct('1', { status: 0 }).food === null &&
      parseOffProduct('1', null).name === null
  );
  check(
    '상한을 넘는 값(단위 잘못)은 담지 않는다',
    parseOffProduct('1', {
      status: 1,
      product: { product_name: 'x', nutriments: { 'energy-kcal_100g': 99999 } },
    }).food === null
  );
}

console.log('\n■ 음식 세부 분류');
{
  const sub = (c: Parameters<typeof subcategoryOf>[0], name: string, code?: string) =>
    subcategoryOf(c, name, code);
  check(
    '기본 음식이 제 칸에 — 밥 · 분식 · 면·빵 · 국·찌개',
    sub('밥', '쌀밥') === 'rice' &&
      sub('밥', '비빔밥') === 'bowl' &&
      sub('밥', '볶음밥') === 'fried' &&
      sub('밥', '돼지국밥') === 'soup' &&
      sub('밥', '돈가스') === 'set' &&
      sub('밥', '멥쌀, 백미, 생것') === 'grain' &&
      sub('밥', '멥쌀, 백미, 밥') === 'rice' &&
      sub('밥', '멥쌀, 백미, 죽') === 'porridge' &&
      sub('분식', '참치김밥') === 'gimbap' &&
      sub('분식', '떡볶이') === 'tteok' &&
      sub('분식', '컵라면(작은 컵)') === 'ramen' &&
      sub('분식', '샌드위치(햄치즈)') === 'burger' &&
      sub('면·빵', '짜장면') === 'chinese' &&
      sub('면·빵', '물냉면') === 'noodle' &&
      sub('면·빵', '토마토 파스타') === 'pasta' &&
      sub('면·빵', '베이글') === 'bread' &&
      sub('면·빵', '가래떡') === 'tteok' &&
      sub('국·찌개', '김치찌개') === 'jjigae' &&
      sub('국·찌개', '갈비탕') === 'tang' &&
      sub('국·찌개', '미역국') === 'guk'
  );
  check(
    '반찬 · 고기·생선 · 과일·채소 · 음료 · 간식',
    sub('반찬', '배추김치') === 'kimchi' &&
      sub('반찬', '시금치나물') === 'namul' &&
      sub('반찬', '멸치볶음') === 'stir' &&
      sub('반찬', '두부조림') === 'braise' &&
      sub('반찬', '김치전') === 'jeon' &&
      sub('반찬', '계란말이') === 'eggtofu' &&
      sub('반찬', '닭가슴살 샐러드') === 'salad' &&
      sub('반찬', '깐풍기') === 'chinese' &&
      sub('반찬', '대두, 노란색, 삶은것') === 'bean' &&
      sub('고기·생선', '닭가슴살(익힌 것)') === 'chicken' &&
      sub('고기·생선', '삼겹살') === 'pork' &&
      sub('고기·생선', '돼지갈비구이') === 'pork' &&
      sub('고기·생선', '소고기 등심(구운 것)') === 'beef' &&
      sub('고기·생선', '육회') === 'beef' &&
      sub('고기·생선', '고등어구이') === 'fish' &&
      sub('고기·생선', '오징어불고기') === 'seafood' &&
      sub('고기·생선', '햄(슬라이스)') === 'processed' &&
      sub('고기·생선', '달걀(삶은 것)') === 'eggtofu' &&
      sub('고기·생선', '눈볼대, 생것', 'R211-0') === 'fish' &&
      sub('과일·채소', '바나나') === 'fruit' &&
      sub('과일·채소', '브로콜리') === 'veg' &&
      sub('과일·채소', '고구마(찐 것)') === 'starch' &&
      sub('우유·음료', '바나나우유') === 'milk' &&
      sub('우유·음료', '두유') === 'milk' &&
      sub('우유·음료', '카페라떼') === 'coffee' &&
      sub('우유·음료', '그릭요거트(플레인)') === 'yogurt' &&
      sub('우유·음료', '콜라') === 'soda' &&
      sub('우유·음료', '오렌지주스') === 'juice' &&
      sub('간식·보충', '단백질 쉐이크') === 'protein' &&
      sub('간식·보충', '오트밀') === 'cereal' &&
      sub('간식·보충', '견과류 믹스') === 'nuts' &&
      sub('간식·보충', '감자칩') === 'snack' &&
      sub('간식·보충', '초코파이') === 'dessert' &&
      sub('간식·보충', '아이스크림(바)') === 'ice' &&
      sub('간식·보충', '꿀') === 'sweet'
  );
  check(
    '과일·채소는 나머지가 채소(기타 칸 없음), 다른 분류는 끝에 기타',
    !subcategoriesOf('과일·채소').some((x) => x.key === OTHER_SUB) &&
      subcategoriesOf('반찬').at(-1)?.key === OTHER_SUB &&
      isSubcategory('반찬', 'stir') &&
      !isSubcategory('반찬', 'pasta') &&
      isSubcategory('밥', OTHER_SUB)
  );
  /* 실제 식약처 자료 — 기타로 남는 것이 분류마다 1할 아래 */
  const counts = subCounts(buildBrowseIndex([...allMfdsReps()]));
  const share = Object.entries(counts).map(([cat, c]) => {
    const total = Object.values(c).reduce((a, n) => a + n, 0);
    return [cat, (c[OTHER_SUB] ?? 0) / Math.max(1, total)] as const;
  });
  check(
    '실제 자료 — 분류마다 기타가 1할 아래',
    share.every(([, r]) => r < 0.1),
    share.map(([c, r]) => `${c} ${Math.round(r * 100)}%`).join(' · ')
  );
  check(
    '세부 칸 개수의 합 = 그 분류 음식 수',
    Object.entries(counts).every(([cat, c]) => {
      const total = Object.values(c).reduce((a, n) => a + n, 0);
      return total === browsePage(buildBrowseIndex([...allMfdsReps()]), cat as '밥', 0, 1).total;
    })
  );
  const index = buildBrowseIndex([...allMfdsReps()]);
  const stir = browsePage(index, '반찬', 0, 40, 'stir');
  check(
    '세부 칸으로 한 쪽 거르기 — 볶음만, 개수가 칸 수와 같다',
    stir.total === counts['반찬'].stir &&
      stir.items.every((i) => subcategoryOf('반찬', i.food.name, i.food.id) === 'stir'),
    String(stir.total)
  );
}

console.log('\n■ 검토에서 나온 것(2026-10-02) — 바코드 UPC-E · 분류 규칙이 겹치는 글자');
{
  check(
    'UPC-E 8자리 → UPC-A 12자리(콜라 캔 04963406 → 049000006346), EAN-8 은 그대로',
    expandUpcE('04963406') === '049000006346' &&
      cleanBarcode('04963406') === '049000006346' &&
      cleanBarcode('96385074') === '96385074' &&
      expandUpcE('24963406') === null
  );
  const c = (code: string, name: string) => mfdsCategory(code, name);
  check(
    '메인 분류 — 패티 · 콜라비 · 새우동그랑땡 · 강정 · 사탕무 · 산자나무 · 팝콘치킨이 엉뚱한 곳에 안 감',
    c('P120-0', '새우패티') !== '우유·음료' &&
      c('R106-0', '콜라비, 생것') === '과일·채소' &&
      c('P120-0', '새우동그랑땡') !== '면·빵' &&
      c('D412-0', '돼지갈비강정') === '반찬' &&
      c('P101-0', '쌀엿강정') === '간식·보충' &&
      c('R106-0', '사탕무, 생것') === '과일·채소' &&
      c('R108-0', '산자나무 열매(씨벅톤), 생것') === '과일·채소' &&
      c('D303-0', '떡국_소고기') === '밥' &&
      c('D303-0', '만두국_사골') === '국·찌개' &&
      c('D104-0', '스프_양송이버섯') === '국·찌개'
  );
  const sub = (cat: Parameters<typeof subcategoryOf>[0], name: string, code?: string) =>
    subcategoryOf(cat, name, code);
  check(
    '세부 분류 — 소고기 목심 · 앞다리는 소, 가오리 · 굴비 · 홍게, 기장밥, 모자반 · 통조림, 원재료 과일 · 버섯, 양파',
    sub('고기·생선', '소고기, 한우(1++등급), 목심, 생것') === 'beef' &&
      sub('고기·생선', '소고기, 한우(1등급), 앞다리(부채살), 생것') === 'beef' &&
      sub('고기·생선', '돼지고기, 앞다리, 생것') === 'pork' &&
      sub('고기·생선', '가오리, 나비가오리, 생것', 'R211-0') === 'fish' &&
      sub('고기·생선', '조기(참조기), 굴비, 소금에 절여 말린것', 'R211-0') === 'fish' &&
      sub('고기·생선', '홍게, 생것', 'R211-0') === 'seafood' &&
      sub('고기·생선', '백합, 생것', 'R211-0') === 'seafood' &&
      sub('밥', '기장밥') === 'rice' &&
      sub('밥', '수수밥') === 'rice' &&
      sub('반찬', '모자반, 말린것') === 'seaweed' &&
      sub('반찬', '완두, 통조림') === 'bean' &&
      sub('과일·채소', '앵두, 생것', 'R108-0') === 'fruit' &&
      sub('과일·채소', '포타벨라, 생것', 'R107-0') === 'mushroom' &&
      sub('과일·채소', '양파, 레드프라임, 생것', 'R106-0') === 'veg' &&
      sub('우유·음료', '새우패티') !== 'coffee' &&
      sub('간식·보충', '사탕무, 생것') !== 'candy'
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
