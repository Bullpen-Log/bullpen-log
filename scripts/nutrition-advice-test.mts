/*
 * 영양 조언(lib/nutrition/advice.ts) 셀프테스트 — `npm run nutrition:advice-test`.
 *
 * nutrition-selftest.mts 와 따로 둔다: 조언 규칙은 따로 다듬고(docs/claude/geum-yunho.md 4절 '클라우드 세션 할 일 — 영양 조언',
 * 2026-10-07 메인이 함), 식단 짜기 3차와 같은 파일을 고치면 합칠 때 부딪힌다. 30초 안에 끝나야 한다.
 */
import {
  AMOUNT_EATEN_SHARE,
  HEADLINE_RULES,
  afterProtein,
  buildAdvice,
  estimatedEatenShare,
  expectedShare,
  headlineRuleOf,
  trainingKindOf,
  type AdviceInput,
  type MealCheck,
  type TrainingKind,
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
const withCheckin = (
  meals: MealCheck,
  appetite: number | null = null,
  soreness: number | null = null
): AdviceInput['checkin'] => ({ meals, appetite, soreness });

console.log('\n■ 할 일 상황표 — 위가 이긴다');
const after = buildAdvice({
  ...base,
  throwKind: 'after',
  training: [{ kind: 'strength', minutes: 60 }],
});
check(
  '던진 뒤는 운동보다 먼저 — 회복식 단백질',
  after.headline?.startsWith('던진 뒤') === true &&
    headlineRuleOf({ ...base, throwKind: 'after' }) === 'after-throw',
  after.headline ?? ''
);
check(
  '회복식 단백질은 체중 75kg 에 20~40g 안',
  /단백질 2\dg?~3\dg/.test(after.headline ?? ''),
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
  checkin: withCheckin({ amount: null, skipped: ['breakfast'] }),
});
check(
  '아침을 걸렀으면 오전에는 지금 채우라고',
  skipped.headline?.includes('지금') === true,
  skipped.headline ?? ''
);
const skippedLunch = buildAdvice({
  ...base,
  hour: 15,
  checkin: withCheckin({ amount: null, skipped: ['lunch'] }),
});
check(
  '점심을 걸렀으면 오후에는 삼각김밥 + 우유',
  skippedLunch.headline?.includes('삼각김밥') === true,
  skippedLunch.headline ?? ''
);
const noAppetite = buildAdvice({
  ...base,
  checkin: withCheckin({ amount: null, skipped: [] }, 2),
});
check(
  '입맛 없는 날(2)은 조금씩 자주',
  noAppetite.headline?.includes('조금씩 자주') === true,
  noAppetite.headline ?? ''
);
const sore = buildAdvice({
  ...base,
  checkin: withCheckin({ amount: null, skipped: [] }, 4, 4),
});
check(
  '근육통 4 면 단백질 한 번 더(입맛 4 는 안 걸림)',
  sore.headline?.includes('단백질 한 번 더') === true,
  sore.headline ?? ''
);
const past = buildAdvice({ ...base, date: '2026-10-06' });
check(
  '지난 날은 할 일이 없다',
  past.headline === null &&
    past.why === null &&
    headlineRuleOf({ ...base, date: '2026-10-06' }) === null
);

console.log('\n■ 20시 뒤에는 자기 전');
const lateLift = buildAdvice({
  ...base,
  hour: 21,
  training: [{ kind: 'strength', minutes: 50 }],
});
check(
  '운동 뒤 1시간 안 → 자기 전 우유 · 요거트',
  lateLift.headline?.includes('자기 전') === true &&
    !lateLift.headline.includes('1시간'),
  lateLift.headline ?? ''
);
const lateAfter = buildAdvice({ ...base, hour: 22, throwKind: 'after' });
check(
  '던진 뒤도 밤이면 자기 전',
  lateAfter.headline?.includes('자기 전') === true,
  lateAfter.headline ?? ''
);
const lateGain = buildAdvice({
  ...base,
  hour: 23,
  body: { ...base.body, goal: 'gain' },
});
check(
  '증량 기본 줄도 밤이면 자기 전',
  lateGain.headline?.includes('자기 전') === true,
  lateGain.headline ?? ''
);
check(
  '20시 뒤 모든 줄에 "1시간 안" · "운동 뒤" 가 없다',
  HEADLINE_RULES.every((r) => {
    const s = {
      input: {
        ...base,
        hour: 21,
        throwKind: 'after' as const,
        training: [{ kind: 'power' as TrainingKind, minutes: 30 }],
        body: { ...base.body, goal: 'gain' as const },
      },
      more: { carbs: 100, protein: 30, fat: 10, basis: 'logged' as const },
      late: true,
      minor: false,
      after: { lo: 20, hi: 30 },
      skipped: [],
      appetite: 1,
      soreness: 5,
    };
    const h = r.say(s).headline;
    return !h.includes('1시간') && !h.includes('운동 뒤');
  })
);

console.log('\n■ 더 먹을 양 · 점수 — 시각으로 보정');
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
check(
  '14시에 하루의 6할을 먹었으면 만점(지금까지 몫에 견준다)',
  buildAdvice({
    ...base,
    hour: 14,
    eaten: { kcal: 1800, carbs: 240, protein: 90, fat: 51 },
    eatenMeals: { lunch: 1800 },
  }).score === 100,
  `${buildAdvice({ ...base, hour: 14, eaten: { kcal: 1800, carbs: 240, protein: 90, fat: 51 }, eatenMeals: { lunch: 1800 } }).score}`
);
check(
  '아침 9시에 아침만 적어도 벌을 안 받는다(500kcal ≈ 몫 17%)',
  (buildAdvice({
    ...base,
    hour: 9,
    eaten: { kcal: 500, carbs: 65, protein: 25, fat: 14 },
    eatenMeals: { breakfast: 500 },
  }).score ?? 0) >= 90
);
check(
  '지난 날은 하루 전체에 견준다 — 절반 먹었으면 낮은 점수',
  (buildAdvice({
    ...base,
    date: '2026-10-06',
    eaten: { kcal: 1500, carbs: 200, protein: 75, fat: 42 },
    eatenMeals: { lunch: 1500 },
  }).score ?? 100) < 50
);
check(
  '기대 몫 — 7시 0 · 10시 25% · 14시 60% · 20시 95% · 24시 100%',
  expectedShare(7) === 0 &&
    expectedShare(10) === 0.25 &&
    expectedShare(14) === 0.6 &&
    expectedShare(20) === 0.95 &&
    expectedShare(24) === 1
);
const est10 = estimatedEatenShare({ amount: '보통', skipped: [] }, 10);
check(
  '10시에 "보통"이면 지금까지 2할쯤 먹은 것',
  est10 !== null && Math.abs(est10 - 0.25 * AMOUNT_EATEN_SHARE['보통']) < 1e-9,
  `${est10}`
);
const est15 = estimatedEatenShare({ amount: '부족', skipped: ['breakfast'] }, 15);
check(
  '15시에 "부족" + 아침 걸름 → 몫에서 아침 몫을 뺀다',
  est15 !== null && Math.abs(est15 - (0.625 * 0.65 - 0.25)) < 1e-9,
  `${est15}`
);
check(
  '아직 안 지난 끼니를 걸렀다고 해도 빼지 않는다(15시 저녁)',
  estimatedEatenShare({ amount: '잘 먹음', skipped: ['dinner'] }, 15) === 0.625
);
const estimate = buildAdvice({
  ...base,
  checkin: withCheckin({ amount: '부족', skipped: [] }),
});
check(
  '기록 없이 체크인 "부족"(14시)이면 어림 — 더 먹을 양은 남은 몫',
  estimate.more?.basis === 'estimate' &&
    estimate.more.protein === Math.round((150 * (1 - 0.6 * 0.65)) / 5) * 5,
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
  hour: 23,
  eaten: { kcal: 3000, carbs: 400, protein: 150, fat: 85 },
  eatenMeals: { dinner: 3000 },
});
check('밤에 목표만큼 먹었으면 100점', full.score === 100, `${full.score}`);

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
const highProtein = buildAdvice({ ...base, target: { ...base.target, protein: 190 } });
check(
  '사용자 목표가 범위 밖(2.5g/kg)이면 목표 ±10% 로 당긴다',
  highProtein.range.protein.lo === 170 && highProtein.range.protein.hi === 210,
  JSON.stringify(highProtein.range.protein)
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

/* ─────────────────────────── 격자 시험(메모 2 · 3 · 4 · 6) ─────────────────────────── */

const KINDS: (AdviceInput['throwKind'] | null)[] = [null, 'eve', 'today', 'after'];
const HOURS = [6, 9, 11, 13, 15, 17, 19, 21, 23];
const TRAININGS: AdviceInput['training'][] = [
  [],
  [{ kind: 'power', minutes: 30 }],
  [{ kind: 'strength', minutes: 50 }],
  [{ kind: 'assist', minutes: 30 }],
  [{ kind: 'aerobic', minutes: 60 }],
];
const MEALS: MealCheck[] = [
  { amount: null, skipped: [] },
  { amount: '잘 먹음', skipped: [] },
  { amount: '보통', skipped: [] },
  { amount: '부족', skipped: [] },
  { amount: '부족', skipped: ['breakfast'] },
  { amount: null, skipped: ['lunch'] },
  { amount: '보통', skipped: ['breakfast', 'dinner'] },
];
const GOALS: AdviceInput['body']['goal'][] = ['gain', 'maintain', 'lose'];
const BANDS: AdviceInput['body']['ageBand'][] = ['child', 'teen', 'adult'];
const EATENS: (Macros | null)[] = [
  null,
  { kcal: 600, carbs: 80, protein: 30, fat: 15 },
  { kcal: 1800, carbs: 240, protein: 90, fat: 50 },
  { kcal: 3600, carbs: 520, protein: 170, fat: 110 },
];
type Macros = AdviceInput['target'];

console.log('\n■ [메모 2] 성장기 금지어 — 어떤 상황에서도 없다');
{
  const BAN_MINOR = /덜|가볍게|줄이|빼고|적게 먹/;
  const BAN_LOSE = /굶|거르/;
  const BAN_ALL = /쉐이크|보충제|프로틴 바|단백질 바|브랜드/;
  const bad: string[] = [];
  let n = 0;
  for (const throwKind of KINDS)
    for (const hour of HOURS)
      for (const training of TRAININGS)
        for (const meals of MEALS)
          for (const goal of GOALS)
            for (const ageBand of BANDS)
              for (const eaten of EATENS)
                for (const appetite of [null, 1, 3])
                  for (const soreness of [null, 5]) {
                    n++;
                    const a = buildAdvice({
                      ...base,
                      hour,
                      throwKind,
                      training,
                      goal: undefined,
                      body: { weightKg: ageBand === 'child' ? 35 : 70, ageBand, goal },
                      checkin: { meals, appetite, soreness },
                      eaten,
                      eatenMeals: eaten ? { lunch: eaten.kcal } : {},
                    } as AdviceInput);
                    const text = `${a.headline} ${a.why}`;
                    if (ageBand !== 'adult' && BAN_MINOR.test(text))
                      bad.push(`성장기 ${ageBand}/${goal}/${hour}시: ${a.headline}`);
                    if (goal === 'lose' && BAN_LOSE.test(text))
                      bad.push(`감량 ${ageBand}/${hour}시: ${a.headline}`);
                    if (BAN_ALL.test(text))
                      bad.push(
                        `상표·보충제 ${ageBand}/${goal}/${hour}시: ${a.headline}`
                      );
                    if ((a.headline ?? '').length > 60)
                      bad.push(`60자 넘음: ${a.headline}`);
                    if (/—/.test(text)) bad.push(`줄표: ${a.headline}`);
                  }
  check(
    `상황 ${n.toLocaleString('ko-KR')}가지 — 성장기 '덜 · 가볍게 · 줄이 · 빼고 · 적게 먹' 0 · 감량 '굶 · 거르' 0 · 상표 · 보충제 0 · 60자 밑 · 줄표 없음`,
    bad.length === 0,
    bad.slice(0, 3).join(' | ')
  );
}

console.log('\n■ [메모 3] 범위는 사용자 목표와 모순되지 않는다');
{
  const bad: string[] = [];
  let n = 0;
  for (let kg = 40; kg <= 110; kg += 5)
    for (let kcal = 1000; kcal <= 5000; kcal += 250)
      for (const ppk of [1.6, 1.8, 2.0, 2.2, 2.5])
        for (const active of [null, 'after'] as const) {
          n++;
          const protein = Math.round(ppk * kg);
          const fat = Math.round(Math.max((kcal * 0.25) / 9, 0.8 * kg));
          const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
          const a = buildAdvice({
            ...base,
            throwKind: active,
            target: { kcal, carbs, protein, fat },
            body: { weightKg: kg, ageBand: 'adult', goal: 'maintain' },
          });
          const ok = (r: { lo: number; hi: number }, t: number) =>
            t === 0 || (t >= r.lo * 0.9 && t <= r.hi * 1.1);
          if (!ok(a.range.protein, protein))
            bad.push(
              `단백질 ${kg}kg ${protein}g → ${a.range.protein.lo}~${a.range.protein.hi}`
            );
          if (!ok(a.range.carbs, carbs))
            bad.push(
              `탄수화물 ${kg}kg ${kcal}kcal ${carbs}g → ${a.range.carbs.lo}~${a.range.carbs.hi}`
            );
          if (!ok(a.range.fat, fat))
            bad.push(`지방 ${kg}kg ${fat}g → ${a.range.fat.lo}~${a.range.fat.hi}`);
          if (
            a.range.carbs.lo > a.range.carbs.hi ||
            a.range.protein.lo > a.range.protein.hi
          )
            bad.push(`뒤집힘 ${kg}kg ${kcal}`);
        }
  check(
    `몸 · 목표 ${n.toLocaleString('ko-KR')}가지 — 목표가 범위 안이거나 끝에서 10% 안(단백질 · 탄수화물 · 지방), 범위 뒤집힘 0`,
    bad.length === 0,
    bad.slice(0, 3).join(' | ')
  );
}

console.log('\n■ [메모 4] 점수는 기록을 벌주지 않는다');
{
  /* 같은 '진짜 먹은 몫'을 기록으로 적은 날과 체크인으로만 적은 날 — 평균 점수가 비슷해야 한다 */
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const loggedScores: number[] = [];
  const checkinScores: number[] = [];
  const lowPaceBad: string[] = [];
  for (let i = 0; i < 3000; i++) {
    const hour = 7 + Math.floor(rand() * 17);
    /* 하루 끝 기준 먹은 비율 0.55~1.15 */
    const dayShare = 0.55 + rand() * 0.6;
    const pace = Math.max(0.15, expectedShare(hour));
    const noise = () => 0.9 + rand() * 0.2;
    const eaten = {
      kcal: base.target.kcal * dayShare * pace * noise(),
      carbs: base.target.carbs * dayShare * pace * noise(),
      protein: base.target.protein * dayShare * pace * noise(),
      fat: base.target.fat * dayShare * pace * noise(),
    };
    const amount: MealCheck['amount'] =
      dayShare >= 0.9 ? '잘 먹음' : dayShare >= 0.7 ? '보통' : '부족';
    const l = buildAdvice({
      ...base,
      hour,
      eaten,
      eatenMeals: { lunch: eaten.kcal },
    }).score!;
    const c = buildAdvice({
      ...base,
      hour,
      checkin: withCheckin({ amount, skipped: [] }),
    }).score!;
    loggedScores.push(l);
    checkinScores.push(c);
    if (dayShare >= 0.9 && dayShare <= 1.1 && l < 70)
      lowPaceBad.push(`${hour}시 몫 ${dayShare.toFixed(2)} → ${l}`);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const lm = mean(loggedScores);
  const cm = mean(checkinScores);
  check(
    `기록한 날 평균 ${lm.toFixed(0)} · 체크인만 한 날 평균 ${cm.toFixed(0)} — 차이 10점 안, 기록 쪽이 5점 넘게 낮지 않다`,
    Math.abs(lm - cm) <= 10 && lm >= cm - 5
  );
  check(
    '목표대로 먹고 있는 날(0.9~1.1)은 몇 시에 적어도 70점 위',
    lowPaceBad.length === 0,
    lowPaceBad.slice(0, 3).join(' | ')
  );
}

console.log('\n■ [메모 6] 무작위 10,000가지 — 예외 · NaN · 결정성 · 범위');
{
  let seed = 20261007;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const bad: string[] = [];
  const t0 = Date.now();
  for (let i = 0; i < 10000; i++) {
    const kg = 35 + Math.floor(rand() * 80);
    const kcal = 900 + Math.floor(rand() * 4500);
    const protein = Math.round((1.2 + rand() * 1.5) * kg);
    const fat = Math.round(Math.max((kcal * 0.25) / 9, 0.8 * kg));
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const ratio = rand() * 1.6;
    const isToday = rand() < 0.8;
    const input: AdviceInput = {
      date: isToday ? '2026-10-07' : '2026-10-06',
      today: '2026-10-07',
      target: { kcal, carbs, protein, fat },
      eaten:
        rand() < 0.5
          ? {
              kcal: kcal * ratio,
              carbs: carbs * ratio * (0.8 + rand() * 0.4),
              protein: protein * ratio * (0.8 + rand() * 0.4),
              fat: fat * ratio,
            }
          : null,
      eatenMeals: {},
      body: {
        weightKg: rand() < 0.1 ? null : kg,
        ageBand: pick(BANDS),
        goal: pick(GOALS),
      },
      checkin:
        rand() < 0.3
          ? null
          : {
              meals: pick(MEALS),
              appetite: pick([null, 1, 2, 3, 4, 5]),
              soreness: pick([null, 1, 3, 4, 5]),
            },
      throwKind: pick(KINDS),
      training: pick(TRAININGS),
      weight: null,
      hour: Math.floor(rand() * 24),
    };
    if (input.eaten) input.eatenMeals = { lunch: input.eaten.kcal };
    let a;
    try {
      a = buildAdvice(input);
    } catch (e) {
      bad.push(`예외 ${(e as Error).message}`);
      continue;
    }
    const nums = [
      a.range.carbs.lo,
      a.range.carbs.hi,
      a.range.protein.lo,
      a.range.protein.hi,
      a.range.fat.lo,
      a.range.fat.hi,
      ...(a.more ? [a.more.carbs, a.more.protein, a.more.fat] : []),
      ...(a.score === null ? [] : [a.score]),
    ];
    if (nums.some((n) => !Number.isFinite(n)))
      bad.push(`NaN ${JSON.stringify(a.range)}`);
    if (a.score !== null && (a.score < 0 || a.score > 100))
      bad.push(`점수 범위 ${a.score}`);
    if (
      isToday
        ? a.headline === null || a.headline.length === 0 || a.headline.length > 60
        : a.headline !== null
    )
      bad.push(`headline ${a.headline}`);
    if (
      a.more &&
      a.more.basis === 'estimate' &&
      (a.more.carbs < 0 || a.more.protein < 0 || a.more.fat < 0)
    )
      bad.push(`어림 음수 ${JSON.stringify(a.more)}`);
    if (a.more && !input.eaten && a.more.basis === 'logged')
      bad.push('기록 없는데 logged');
    if (
      a.score === null &&
      (input.eaten ||
        (input.checkin &&
          (input.checkin.meals.amount !== null ||
            input.checkin.meals.skipped.length > 0)))
    )
      bad.push('자료 있는데 점수 null');
    if (!isToday && a.more !== null) bad.push('지난 날에 더 먹을 양');
    if (JSON.stringify(buildAdvice(input)) !== JSON.stringify(a))
      bad.push('같은 입력 다른 결과');
    if (a.parts.some((p) => p.score < 0 || p.score > 100 || !p.note))
      bad.push('조각 범위');
  }
  const ms = Date.now() - t0;
  check(
    `10,000가지 — 예외 0 · NaN 0 · 점수 0~100 · 오늘은 할 일 1~60자, 지난 날은 null · 어림 음수 0 · 같은 입력 같은 결과 (${ms}ms)`,
    bad.length === 0 && ms < 20000,
    bad.slice(0, 3).join(' | ')
  );
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
