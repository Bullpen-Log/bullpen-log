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
  amountText,
  macroGaps,
  missingMacros,
  missingText,
  scaleMacros,
  type MealEntryView,
} from '../lib/nutrition/meta.ts';
import { ageBand, effectiveGoal, effectiveProtein } from '../lib/nutrition/age.ts';
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

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
