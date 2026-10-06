/**
 * 잘 던진 날 찾기(lib/report/good-days.ts) 셀프테스트 — npm run good-days:test
 */
import {
  buildGoodDays,
  findGoodDayPatterns,
  type GoodDay,
  type GoodDayRaw,
} from '../lib/report/good-days.ts';
import { shiftDateKey } from '../lib/pitch-stats.ts';

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

const START = '2026-06-01';
const d = (offset: number) => shiftDateKey(START, offset);

/* ───────────── buildGoodDays ───────────── */

console.log('하루 한 줄 만들기');
{
  const log = (
    date: string,
    sessionType: string,
    pitchCount: number,
    satisfaction: number | null,
    cuesGood: string[] = [],
    cuesBad: string[] = []
  ) => ({
    date,
    sessionType,
    pitchCount,
    satisfaction,
    cuesGood,
    cuesBad,
  });
  const raw: GoodDayRaw = {
    logs: [
      log(d(0), '불펜', 30, 4, ['하체']),
      log(d(0), '라이브', 20, 2, ['릴리스'], ['하체', '제구']),
      log(d(1), '캐치볼', 40, 5), // 캐치볼은 매긴 날이 아니다 — 투구수에만 든다
      log(d(2), '휴식', 0, null),
      log(d(4), '경기', 80, 5),
      log(d(5), '불펜', 25, null), // 안 매긴 기록
    ],
    checkins: [
      {
        date: d(4),
        sleep: '부족',
        sleepHours: 7.5,
        condition: 8,
        soreness: 1,
        shoulder: '정상',
        elbow: '뻐근',
      },
    ],
    workouts: [
      { date: d(3), bodyParts: ['가슴', '삼두'] },
      { date: d(3), bodyParts: ['햄스트링·둔근'] },
    ],
    meals: [
      { date: d(3), protein: 40 },
      { date: d(3), protein: 35.5 },
    ],
  };
  const days = buildGoodDays(raw);
  check(
    '매긴 날만 — 캐치볼 · 휴식 · 안 매긴 기록은 빠짐',
    days.map((x) => x.date).join() === [d(0), d(4)].join()
  );
  const first = days[0];
  check('같은 날 둘 → 평균 하나', first.satisfaction === 3, String(first.satisfaction));
  check(
    '칩은 합집합 · 한 감각은 좋았던 쪽에만',
    first.cuesGood.join() === '릴리스,하체' && first.cuesBad.join() === '제구',
    `${first.cuesGood} / ${first.cuesBad}`
  );
  check('처음 날은 쉰 날 수 모름', first.restDays === null);
  const fourth = days[1];
  check('사이 3일(1 · 2 · 3) 쉼', fourth.restDays === 3, String(fourth.restDays));
  check(
    '앞 7일 투구수: 그날 빼고 · 캐치볼 포함',
    fourth.pitches7 === 30 + 20 + 40,
    String(fourth.pitches7)
  );
  check(
    '그날 체크인을 붙임 · 잔 시간이 있으면 그것',
    fourth.sleepHours === 7.5 && fourth.condition === 8
  );
  check('팔꿈치가 뻐근하면 개운하지 않음', fourth.armFresh === false);
  check('체크인 없는 날은 모름', first.armFresh === null && first.condition === null);
  check(
    '전날 운동 · 하체(햄스트링·둔근)',
    fourth.liftedYesterday && fourth.lowerYesterday
  );
  check('전날 운동 없음', !first.liftedYesterday && !first.lowerYesterday);
  check(
    '전날 단백질 합',
    fourth.proteinYesterday === 75.5,
    String(fourth.proteinYesterday)
  );
  check('전날 끼니를 안 적었으면 모름', first.proteinYesterday === null);
}

{
  const lg = (date: string, sat: number | null) => ({
    date,
    sessionType: '불펜',
    pitchCount: 20,
    satisfaction: sat,
    cuesGood: [],
    cuesBad: [],
  });
  const days = buildGoodDays(
    {
      logs: [lg(d(0), 4), lg(d(3), null), lg(d(5), 4)],
      checkins: [],
      workouts: [],
      meals: [],
    },
    d(2)
  );
  check(
    '창 앞의 매긴 날은 빼고 투구수에만',
    days.map((x) => x.date).join() === d(5) && days[0].pitches7 === 40,
    days.map((x) => x.date).join()
  );
  check(
    '안 매긴 불펜도 쉰 날 계산에 듦',
    days[0].restDays === 1,
    String(days[0].restDays)
  );
}

/* ───────────── findGoodDayPatterns ───────────── */

/** 아무 차이 없는 하루 — 모든 항목이 한쪽뿐이라 견줄 것이 없다 */
function plain(i: number, satisfaction: number, over: Partial<GoodDay> = {}): GoodDay {
  return {
    date: d(i * 2),
    satisfaction,
    cuesGood: [],
    cuesBad: [],
    sleepHours: null,
    sleep: null,
    condition: null,
    soreness: null,
    armFresh: null,
    restDays: null,
    pitches7: 0,
    liftedYesterday: false,
    lowerYesterday: false,
    proteinYesterday: null,
    ...over,
  };
}

console.log('판정');
{
  const seven = Array.from({ length: 7 }, (_, i) =>
    plain(i, 5, { sleepHours: i % 2 ? 8 : 5 })
  );
  const r = findGoodDayPatterns(seven);
  check(
    '7일이면 결과 없음 · 8일 필요',
    r.patterns.length === 0 && r.rated === 7 && r.needed === 8
  );
}

/** 잠이 확실히 가르는 12일 */
const sleepDays = Array.from({ length: 12 }, (_, i) =>
  plain(i, i % 2 ? 5 : 2, { sleepHours: i % 2 ? 8 : 5.5 })
);
{
  const r = findGoodDayPatterns(sleepDays);
  check('잠이 1위', r.patterns[0]?.key === 'sleep', JSON.stringify(r.patterns));
  check(
    '문장 · 횟수',
    r.patterns[0]?.text === '잠을 충분히 잔 날 잘 던졌어요 · 6번 중 6번',
    r.patterns[0]?.text
  );
  check(
    '같은 입력 = 같은 출력',
    JSON.stringify(r) === JSON.stringify(findGoodDayPatterns(sleepDays))
  );
}
{
  /* 덜 잔 날이 잘 던진 날이면 '아니' 쪽 이름으로 */
  const flipped = sleepDays.map((x) => ({
    ...x,
    satisfaction: x.sleepHours! < 7 ? 5 : 2,
  }));
  const r = findGoodDayPatterns(flipped);
  check(
    '낮은 쪽이 참이면 반대 이름',
    r.patterns[0]?.text.startsWith('잠이 모자랐던 날') === true,
    r.patterns[0]?.text
  );
}
{
  /* 짧게 잔 날이 둘뿐 — 차이가 커도 견주지 않는다 */
  const lopsided = Array.from({ length: 10 }, (_, i) =>
    plain(i, i < 2 ? 1 : 5, { sleepHours: i < 2 ? 5 : 8 })
  );
  const r = findGoodDayPatterns(lopsided);
  check('한쪽 2일 → 항목 빠짐', !r.all.some((x) => x.key === 'sleep'));
}
{
  /* 컨디션은 몇 날 모름 — 아는 날만 센다 */
  const mixed = sleepDays.map((x, i) => ({
    ...x,
    condition: i < 4 ? null : i % 2 ? 8 : 4,
  }));
  const r = findGoodDayPatterns(mixed);
  const cond = r.all.find((x) => x.key === 'condition');
  const sleep = r.all.find((x) => x.key === 'sleep');
  check(
    '모르는 날은 그 항목에서만 빠짐',
    cond?.nHigh === 4 && cond?.nLow === 4 && sleep?.nHigh === 6,
    `${cond?.nHigh}/${cond?.nLow} · ${sleep?.nHigh}`
  );
}
{
  /* 잠 · 컨디션 · 쉰 날이 다 같이 가르고 칩도 둘 — 몸 · 일정은 둘, 느낌은 하나까지 */
  const many = Array.from({ length: 14 }, (_, i) =>
    plain(i, i % 2 ? 5 : 1, {
      sleepHours: i % 2 ? 8 : 5,
      condition: i % 2 ? 9 : 3,
      restDays: i % 2 ? 3 : 0,
      cuesGood: i % 2 ? ['하체', '릴리스'] : [],
    })
  );
  const r = findGoodDayPatterns(many);
  const before = r.patterns.filter((p) => p.kind === 'before').length;
  const feel = r.patterns.filter((p) => p.kind === 'feel').length;
  check(
    '몸 · 일정 최대 2 · 느낌 최대 1',
    before === 2 && feel === 1,
    `${before} · ${feel}`
  );
}

console.log('우연을 말하지 않기');
{
  /* 만족도가 맥락과 아무 상관 없는 자료 200개 — 무엇이든 찾은 비율 */
  let a = 7;
  /* Park–Miller: 곱이 2^53 안이라 정확하다(예전 1103515245 는 넘쳐 같은 자료가 되풀이됐다) */
  const rnd = () => ((a = (a * 48271) % 2147483647), a / 2147483647);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const CUES = [
    '릴리스',
    '하체',
    '밸런스',
    '팔 스윙',
    '손끝 감각',
    '제구',
    '팔 무거움',
    '몸이 일찍 열림',
  ];
  let found = 0;
  let foundBefore = 0;
  let foundFeel = 0;
  const RUNS = 400;
  for (let run = 0; run < RUNS; run++) {
    const n = 10 + Math.floor(rnd() * 15);
    const days = Array.from({ length: n }, (_, i) =>
      plain(i, 1 + Math.floor(rnd() * 5), {
        sleepHours: 5 + Math.floor(rnd() * 8) / 2,
        condition: 3 + Math.floor(rnd() * 7),
        soreness: 1 + Math.floor(rnd() * 5),
        armFresh: rnd() < 0.6,
        restDays: Math.floor(rnd() * 4),
        pitches7: Math.floor(rnd() * 150),
        liftedYesterday: rnd() < 0.5,
        lowerYesterday: rnd() < 0.3,
        proteinYesterday: rnd() < 0.8 ? 60 + rnd() * 80 : null,
        cuesGood: CUES.filter(() => rnd() < 0.25),
        cuesBad: rnd() < 0.3 ? [pick(CUES)] : [],
      })
    );
    const ps = findGoodDayPatterns(days).patterns;
    if (ps.length > 0) found++;
    if (ps.some((p) => p.kind === 'before')) foundBefore++;
    if (ps.some((p) => p.kind === 'feel')) foundFeel++;
  }
  check(
    '묶음마다 우연 ≤ 12% (ALPHA 0.1)',
    foundBefore / RUNS <= 0.12 && foundFeel / RUNS <= 0.12,
    `${foundBefore} · ${foundFeel} / ${RUNS}`
  );
  check('전체 우연 ≤ 20% (두 묶음)', found / RUNS <= 0.2, `${found}/${RUNS}`);
}

console.log(`\n${passed}개 통과 · ${failed}개 실패`);
if (failed > 0) process.exit(1);
