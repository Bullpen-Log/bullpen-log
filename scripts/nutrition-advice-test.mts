/*
 * 영양 조언(lib/nutrition/advice.ts) 셀프테스트 — `npm run nutrition:advice-test`.
 *
 * nutrition-selftest.mts 와 따로 둔다: 조언 규칙은 클라우드 세션이 깊게 다듬고(docs/claude/geum-yunho.md 4절
 * '클라우드 세션 할 일 — 영양 조언'), 식단 짜기 3차와 같은 파일을 고치면 합칠 때 부딪힌다.
 */
import {
  AMOUNT_EATEN_SHARE,
  afterProtein,
  buildAdvice,
  trainingKindOf,
  type AdviceInput,
} from '../lib/nutrition/advice.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const base: AdviceInput = {
  date: '2026-10-07',
  today: '2026-10-07',
  target: { kcal: 3000, carbs: 400, protein: 150, fat: 85 },
  eaten: null,
  eatenMeals: {},
  body: { weightKg: 75, ageBand: 'adult', goal: 'maintain' },
  checkin: null,
  throwKind: null,
  training: [],
  weight: null,
  hour: 14,
};

console.log('\n■ 할 일 한 줄 — 위가 이긴다');
const after = buildAdvice({
  ...base,
  throwKind: 'after',
  training: [{ kind: 'strength', minutes: 60 }],
});
check(
  '던진 뒤는 운동보다 먼저 — 회복식 단백질',
  after.headline?.startsWith('던진 뒤') === true,
  after.headline ?? ''
);
check(
  '회복식 단백질은 체중 75kg 에 20~40g 안',
  /단백질 2\d~3\dg/.test(after.headline ?? ''),
  after.headline ?? ''
);
const morning = buildAdvice({ ...base, throwKind: 'today', hour: 9 });
check(
  '던지는 날 오전은 던지기 전 탄수화물',
  morning.headline?.includes('던지기') === true,
  morning.headline ?? ''
);
const eve = buildAdvice({ ...base, throwKind: 'eve' });
check(
  '등판 전날은 저녁 탄수화물',
  eve.headline?.includes('저녁') === true,
  eve.headline ?? ''
);
const lift = buildAdvice({ ...base, training: [{ kind: 'strength', minutes: 50 }] });
check(
  '웨이트 날은 운동 뒤 단백질',
  lift.headline?.includes('운동 뒤') === true && lift.why?.includes('웨이트') === true,
  lift.headline ?? ''
);
const cardio = buildAdvice({ ...base, training: [{ kind: 'aerobic', minutes: 60 }] });
check(
  '유산소 45분 넘으면 탄수화물 보충',
  cardio.headline?.includes('탄수화물') === true,
  cardio.headline ?? ''
);
const shortCardio = buildAdvice({
  ...base,
  training: [{ kind: 'aerobic', minutes: 20 }],
});
check(
  '짧은 유산소는 기본 줄',
  shortCardio.headline?.includes('평소대로') === true,
  shortCardio.headline ?? ''
);
const skipped = buildAdvice({
  ...base,
  hour: 9,
  checkin: {
    meals: { amount: null, skipped: ['breakfast'] },
    appetite: null,
    soreness: null,
  },
});
check(
  '아침을 걸렀으면 오전에는 지금 채우라고',
  skipped.headline?.includes('지금') === true,
  skipped.headline ?? ''
);
const past = buildAdvice({ ...base, date: '2026-10-06' });
check('지난 날은 할 일이 없다', past.headline === null && past.why === null);

console.log('\n■ 더 먹을 양 · 점수');
const logged = buildAdvice({
  ...base,
  eaten: { kcal: 1800, carbs: 250, protein: 90, fat: 50 },
  eatenMeals: { breakfast: 600, lunch: 1200 },
});
check(
  '기록이 있으면 기록에서 뺀다(10g · 5g 단위)',
  logged.more?.basis === 'logged' &&
    logged.more.carbs === 150 &&
    logged.more.protein === 60,
  JSON.stringify(logged.more)
);
check(
  '기록이 있으면 점수에 열량 · 단백질 · 탄수화물 조각',
  logged.parts.map((p) => p.key).join(',') === 'kcal,protein,carbs' &&
    logged.score !== null,
  `${logged.score}`
);
const estimate = buildAdvice({
  ...base,
  checkin: { meals: { amount: '부족', skipped: [] }, appetite: null, soreness: null },
});
check(
  '기록 없이 체크인 "부족"이면 어림(6할 먹은 것으로)',
  estimate.more?.basis === 'estimate' &&
    estimate.more.protein ===
      Math.round((150 * (1 - AMOUNT_EATEN_SHARE['부족'])) / 5) * 5,
  JSON.stringify(estimate.more)
);
check(
  '"부족"이면 단백질을 더 먹으라는 줄 · 강조',
  estimate.headline?.includes('단백질') === true && estimate.highlight,
  estimate.headline ?? ''
);
const nothing = buildAdvice(base);
check(
  '아무 자료도 없으면 점수 null · 더 먹을 양 null',
  nothing.score === null && nothing.more === null
);
const full = buildAdvice({
  ...base,
  eaten: { kcal: 3000, carbs: 400, protein: 150, fat: 85 },
  eatenMeals: { dinner: 3000 },
});
check('목표만큼 먹었으면 100점', full.score === 100, `${full.score}`);

console.log('\n■ 성장기 · 범위');
const teenOver = buildAdvice({
  ...base,
  body: { weightKg: 60, ageBand: 'teen', goal: 'gain' },
  eaten: { kcal: 4000, carbs: 600, protein: 200, fat: 120 },
  eatenMeals: { dinner: 4000 },
});
check(
  '성장기에게는 많이 먹어도 "가볍게"가 없다',
  !/가볍게|덜 |줄이/.test(teenOver.headline ?? ''),
  teenOver.headline ?? ''
);
const adultOver = buildAdvice({
  ...base,
  eaten: { kcal: 4000, carbs: 600, protein: 200, fat: 120 },
  eatenMeals: { dinner: 4000 },
});
check(
  '어른이 목표를 많이 넘겼으면 저녁은 가볍게',
  adultOver.headline?.includes('가볍게') === true,
  adultOver.headline ?? ''
);
check(
  '범위는 체중 1kg 당 — 75kg 쉬는 날 탄수화물 230~380g · 단백질 120~165g',
  nothing.range.carbs.lo === 230 &&
    nothing.range.carbs.hi === 380 &&
    nothing.range.protein.lo === 120 &&
    nothing.range.protein.hi === 165,
  JSON.stringify(nothing.range)
);
check(
  '던지는 날 · 운동한 날은 탄수화물 범위가 올라간다',
  lift.range.carbs.lo === 380 && after.range.carbs.lo === 380,
  JSON.stringify(lift.range.carbs)
);
const noWeight = buildAdvice({ ...base, body: { ...base.body, weightKg: null } });
check(
  '체중을 모르면 목표 ±10%',
  noWeight.range.protein.lo === 135 && noWeight.range.protein.hi === 165,
  JSON.stringify(noWeight.range)
);
check(
  '회복식 단백질 — 어린이는 15~30g 안',
  afterProtein(30, 'child').lo === 15 && afterProtein(90, 'child').hi === 30
);
check(
  '운동 분류 → 넷',
  trainingKindOf('파워') === 'power' &&
    trainingKindOf('하체 스트렝스') === 'strength' &&
    trainingKindOf('유산소') === 'aerobic' &&
    trainingKindOf('회복 및 보강') === 'assist' &&
    trainingKindOf('워밍업') === null
);

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
