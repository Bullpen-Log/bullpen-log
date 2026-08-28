/**
 * AI 트레이닝 자가 시험.
 *
 *   npm run training:test
 *
 * 화면이 하는 일을 그대로 코드로 밟아본다.
 *   장비 거르기 → 경력 거르기 → 안전 필터 → 테마 정하기 → 시간에 맞춰 고르기
 *
 * 확인 스크립트(theme:check 등)가 "보기에 그럴듯한가"를 보여준다면, 이 파일은
 * "지켜야 할 약속이 깨졌는가"를 본다. 통과와 실패가 분명해야 해서, 사람이 눈으로
 * 보고 판단할 일을 남기지 않는다.
 *
 * 운동 자료는 실제 DB에서 가져오고, 사람 쪽 자료(체크인·투구일지)는 여기서
 * 지어낸다. 실제 사용자 기록에 기대면 그 사람이 기록을 지웠을 때 시험이 깨지는데,
 * 그건 코드가 잘못된 것이 아니다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildFacts, type CheckinLike } from '../lib/report/facts.ts';
import {
  countMissingDays,
  countSessionTypes,
  buildReportFindings,
  loadBySessionType,
  dailyLoad,
  groupByDay,
  longestThrowStreak,
  summarize,
  stressFactor,
  MIN_STRESS_FACTOR,
  type PitchLogLike,
} from '../lib/pitch-stats.ts';
import {
  buildPitchPlan,
  requiredRestDays,
  HIGH_VOLUME_PITCHES,
  HIGH_VOLUME_MIN_REST,
} from '../lib/report/plan.ts';
import { selectCandidates } from '../lib/report/prescription.ts';
import { equipmentForToday, filterByEquipment } from '../lib/report/equipment.ts';
import {
  TRAINING_GOALS,
  TRAINING_LEVELS,
  filterByLevel,
  readTrainingProfile,
} from '../lib/report/personalize.ts';
import {
  WORKOUT_MINUTES_CHOICES,
  compositionFor,
  decideTheme,
  effectiveMinutes,
  estimateMinutes,
  pickForTheme,
  SLOT_ORDER,
  type ThemeKey,
} from '../lib/report/theme.ts';
import { intensityLevel } from '../lib/exercise-meta.ts';
import {
  exerciseIntensityScore,
  exerciseMinutes,
  trainingDayLoad,
} from '../lib/training-load.ts';
import { computeAcwr, zoneOf } from '../lib/pitch-stats.ts';
import { buildTrainingLoad } from '../lib/training-load.ts';
import {
  buildDailyPlan,
  isHalted,
  readDailyPlan,
} from '../lib/report/daily-plan.ts';

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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const library = await prisma.exerciseVideo.findMany({ orderBy: { createdAt: 'asc' } });
await prisma.$disconnect();

/* 날짜는 고정값이라 언제 돌려도 같은 결과가 나온다. */
const TODAY = new Date('2026-06-15T09:00:00+09:00');
const dayBefore = (n: number) => new Date(TODAY.getTime() - n * 86400000).toISOString();

type Person = {
  condition?: number;
  pain?: boolean;
  /** 최근 며칠간 하루 투구수 (0번째가 어제) */
  pitches?: number[];
  age?: number | null;
  trainingLevel?: string | null;
  /**
   * 가입 문진으로 추정한 하루 평균 부하.
   *
   * 이 값이 없으면 기록이 28일 쌓이기 전에는 부하 지수가 아예 안 나온다.
   * 처음에 빠뜨렸더니 부하 위험 구간 시험이 '구간을 못 냈으므로 통과'로
   * 조용히 넘어갔다. 시험이 아무것도 안 보면서 통과하는 것이 가장 나쁘다.
   */
  baselineDailyLoad?: number;
  /** 오늘 체크인에서 고른 운동 종류 — 파워 / 웨이트 / 회복 */
  wants?: string | null;
};

function factsFor(p: Person) {
  const pitches = p.pitches ?? [40, 0, 35, 0, 40, 0, 30];
  return buildFacts({
    nickname: '시험',
    age: p.age === undefined ? 22 : p.age,
    heightCm: 180,
    trainingLevel: p.trainingLevel ?? null,
    baselineDailyLoad: p.baselineDailyLoad ?? 100,
    today: TODAY,
    logs: pitches.map<PitchLogLike>((count, i) => ({
      date: dayBefore(i + 1),
      pitchCount: count,
      // 강도는 1~10 숫자다. 부하 지수가 여기서 나오므로 값이 어긋나면 안 된다.
      intensity: 7,
      maxVelocity: 130,
      avgVelocity: 120,
    })),
    checkins:
      p.condition == null
        ? []
        : [
            {
              date: dayBefore(0).slice(0, 10),
              condition: p.condition,
              sleep: '보통',
              shoulder: p.pain ? '통증' : '괜찮음',
              elbow: '괜찮음',
              wrist: '괜찮음',
              lowerBack: '괜찮음',
              lowerBody: '괜찮음',
              preferredParts: [],
              preferredWorkout: p.wants ?? null,
            } satisfies CheckinLike,
          ],
    memos: [],
  });
}

/** 화면이 하는 일을 그대로 밟는다. */
function planFor({
  person = {} as Person,
  owned = [] as string[],
  level = null as string | null,
  goal = null as string | null,
  minutes = 45,
  doneIds = new Set<string>(),
  override = false,
}) {
  const facts = factsFor({ ...person, trainingLevel: level });
  const plan = buildPitchPlan(facts);
  const usable = filterByEquipment(library, owned);
  const leveled = filterByLevel(usable.pool, level);
  const picked = selectCandidates({ facts, plan, library: leveled.pool });

  // 화면과 같이, 이미 완료한 운동은 걸러진 뒤에도 목록에 남긴다.
  const inCandidates = new Set(picked.candidates.map((ex) => ex.id));
  const candidates = [
    ...picked.candidates,
    ...library.filter((ex) => doneIds.has(ex.id) && !inCandidates.has(ex.id)),
  ];

  const preferredWorkout = facts.condition.today?.preferredWorkout ?? null;
  const theme = decideTheme({
    facts,
    plan,
    lastLowerKey: null,
    lastUpperKey: null,
    preferredWorkout,
    override,
  });
  const themed = pickForTheme({
    candidates,
    theme: theme.key,
    minutes: effectiveMinutes(theme.key, minutes),
    doneIds,
    preferredWorkout,
    goal,
  });
  return { facts, plan, picked, theme, themed, usable, leveled };
}

console.log('\n[안전] 몸이 안 좋은 날 무거운 운동이 섞이지 않는가');
{
  const { picked, theme } = planFor({ person: { condition: 3 } });
  const tooHard = picked.candidates.filter((e) => intensityLevel(e.intensity) > 3);
  check(
    '컨디션 3/10 → 무게 드는 운동 없음',
    tooHard.length === 0,
    `남은 후보 ${picked.candidates.length}개`
  );
  check('컨디션 3/10 → 회복 테마', theme.key === 'recovery', theme.label);
}
{
  const { picked, plan } = planFor({ person: { condition: 6, pain: true } });
  check(
    '오늘 통증 → 처방 자체를 멈춤',
    plan.halted && picked.halted && picked.candidates.length === 0
  );
}
{
  // 평소 조금만 던지던 사람이 갑자기 많이 던지면 부하가 위험 구간으로 간다.
  const spike = [200, 190, 180, 170, 190, 180, 200];
  const { facts, picked } = planFor({
    person: { condition: 8, pitches: spike, baselineDailyLoad: 20 },
  });
  const tooHard = picked.candidates.filter((e) => intensityLevel(e.intensity) > 2);
  check('부하가 위험 구간으로 계산됨', facts.load.zone === 'danger', String(facts.load.zone));
  check('부하 위험 구간 → 회복 수준까지만', tooHard.length === 0, `강도 3 이상 ${tooHard.length}개`);
}
{
  /*
   * 반대로, 평소만큼 던지는 사람은 강도 제한이 없어야 한다.
   *
   * 부하 지수 = 최근 부하 / 평소 부하 이므로, 문진 추정치를 실제 투구량에
   * 맞춰야 '적정' 구간이 나온다. 하루 부하는 투구수 × 강도라, 이틀에 한 번
   * 60개씩 강도 7로 던지면 하루 평균 150쯤이 된다.
   */
  const steady = [60, 0, 55, 0, 60, 0, 55];
  const { facts, picked } = planFor({
    person: { condition: 8, pitches: steady, baselineDailyLoad: 150 },
  });
  const hasHeavy = picked.candidates.some((e) => intensityLevel(e.intensity) >= 4);
  check(
    `부하 ${facts.load.zone} 구간 → 무게 드는 운동이 남아 있음`,
    hasHeavy,
    `후보 ${picked.candidates.length}개`
  );
}
{
  const { picked } = planFor({ person: { age: 14, condition: 8 } });
  const maxed = picked.candidates.filter((e) => intensityLevel(e.intensity) > 4);
  check('만 14세(성장기) → 최대 강도 제외', maxed.length === 0);
}
{
  const { picked } = planFor({ person: { condition: 8 }, level: '입문' });
  const maxed = picked.candidates.filter((e) => intensityLevel(e.intensity) > 4);
  const hard = picked.candidates.filter(
    (e) => e.difficulty === '상급' || e.difficulty === '중급'
  );
  check('경력 입문 → 최대 강도 제외', maxed.length === 0);
  check('경력 입문 → 초급 난이도만', hard.length === 0, `후보 ${picked.candidates.length}개`);
}

console.log('\n[장비] 못 하는 운동이 나오지 않는가');
for (const owned of [['맨몸'], ['맨몸', '밴드'], ['맨몸', '밴드', '덤벨']]) {
  const { themed } = planFor({ person: { condition: 8 }, owned });
  const impossible = themed.picks.filter((p) =>
    p.exercise.equipment.some((e: string) => e !== '맨몸' && !owned.includes(e))
  );
  check(
    `${owned.join('+')} → 없는 장비 운동 0개`,
    impossible.length === 0,
    `운동 ${themed.picks.length}개`
  );
}
{
  const { usable } = planFor({ person: { condition: 8 }, owned: [] });
  check('장비를 안 골랐으면 아무것도 안 뺀다', usable.pool.length === library.length);
}

console.log('\n[시간] 고른 시간에 맞는가');
for (const minutes of WORKOUT_MINUTES_CHOICES) {
  const { themed, theme } = planFor({ person: { condition: 8 }, minutes });
  const target = effectiveMinutes(theme.key, minutes);
  const gap = Math.abs(themed.estimatedMinutes - target) / target;
  check(
    `${minutes}분 요청 → ${themed.estimatedMinutes}분`,
    gap <= 0.15,
    `${theme.label}, 오차 ${Math.round(gap * 100)}%`
  );
}

console.log('\n[운동 부하] 실제로 한 만큼으로 세는가');
{
  /*
   * 재료는 실제 DB 운동을 쓴다. 세트당 시간 계산이 바뀌면 여기가 먼저 깨진다.
   */
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const dead = find('데드리프트');
  const stretch = find('피전 포즈');

  const planned = exerciseMinutes({ ...dead, setsDone: null });
  const half = exerciseMinutes({ ...dead, setsDone: 2 });
  check(
    '세트를 적으면 그 세트로 센다',
    Math.abs(half - (planned * 2) / 3) < 0.01,
    `계획 ${dead.sets}세트 ${planned.toFixed(1)}분 → 2세트 ${half.toFixed(1)}분`
  );
  check(
    '세트를 안 적으면 계획 세트로 센다',
    planned > 0 && exerciseMinutes({ ...dead, setsDone: null }) === planned,
    `${planned.toFixed(1)}분`
  );

  const withIntensity = trainingDayLoad(
    [{ ...dead, setsDone: 3 }, { ...stretch, setsDone: 3 }],
    7
  );
  check(
    '강도를 적으면 (총 시간 × 그 강도)',
    Math.abs(withIntensity.load - withIntensity.minutes * 7) < 0.01,
    `${withIntensity.minutes.toFixed(1)}분 × 7 = ${withIntensity.load.toFixed(0)}`
  );

  /*
   * 강도를 안 적은 날은 운동마다 자기 강도를 쓴다.
   *
   * 단순 평균이 아니라 시간만큼 반영해야 한다 — 11분짜리 데드리프트(강도 10)와
   * 4분짜리 스트레칭(강도 2)을 그냥 평균 내면 둘 다 6이 되는데, 그건 어느 쪽도
   * 아니다. 긴 쪽으로 끌려가는 것이 맞다.
   */
  const guessed = trainingDayLoad(
    [{ ...dead, setsDone: 3 }, { ...stretch, setsDone: 3 }],
    null
  );
  const simpleAverage =
    (exerciseIntensityScore(dead.intensity) +
      exerciseIntensityScore(stretch.intensity)) /
    2;
  check(
    '강도를 안 적으면 운동 강도로 대신 센다',
    !guessed.intensityRecorded && guessed.load > 0,
    `추정 강도 ${guessed.intensity.toFixed(1)}`
  );
  check(
    '추정 강도는 시간이 긴 운동 쪽으로 기운다',
    guessed.intensity > simpleAverage,
    `단순 평균 ${simpleAverage.toFixed(1)} < 시간 반영 ${guessed.intensity.toFixed(1)}`
  );

  check(
    '세트를 안 적은 운동 수를 세어 둔다',
    trainingDayLoad([{ ...dead, setsDone: null }, { ...stretch, setsDone: 3 }], 7)
      .estimatedCount === 1
  );

  check(
    '아무것도 안 한 날은 부하 0',
    trainingDayLoad([], 8).load === 0,
    '강도만 적어도 시간이 없으면 셀 수 없다'
  );
}

{
  /*
   * 지수가 실제로 오르내리는가.
   *
   * 계산기는 투구와 같은 것을 쓰므로(computeAcwr), 여기서는 '운동 부하를
   * 넣었을 때 구간이 제대로 나오는가'만 본다.
   */
  const dayKeys = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      new Date(TODAY.getTime() - (n - 1 - i) * 86400000).toISOString().slice(0, 10)
    );

  // 40일 동안 이틀에 한 번 350씩(50분 × 강도 7) — 평소대로.
  const steady = new Map<string, number>();
  for (const [i, key] of dayKeys(40).entries()) steady.set(key, i % 2 === 0 ? 350 : 0);
  const steadyAcwr = computeAcwr(steady, TODAY);
  check(
    '평소대로 운동하면 적정 구간',
    steadyAcwr.zone === 'optimal',
    `지수 ${steadyAcwr.ratio?.toFixed(2)}`
  );

  // 같은 사람이 최근 일주일만 매일 700씩 — 갑자기 늘린 경우.
  const spike = new Map(steady);
  for (const key of dayKeys(40).slice(-7)) spike.set(key, 700);
  const spikeAcwr = computeAcwr(spike, TODAY);
  check(
    '갑자기 늘리면 위험 구간',
    spikeAcwr.zone === 'danger',
    `지수 ${spikeAcwr.ratio?.toFixed(2)}`
  );

  // 28일이 안 쌓이면 지수를 내지 않는다(운동은 문진 기준선이 없다).
  const short = new Map<string, number>();
  for (const key of dayKeys(10)) short.set(key, 350);
  const shortAcwr = computeAcwr(short, TODAY);
  check(
    '기록이 28일 미만이면 지수를 안 낸다',
    shortAcwr.ratio === null && shortAcwr.daysNeeded > 0,
    `${shortAcwr.daysNeeded}일 더 필요`
  );

  check('구간 경계 — 1.4는 주의', zoneOf(1.4) === 'caution');
  check('구간 경계 — 1.6은 위험', zoneOf(1.6) === 'danger');
}

{
  /*
   * DB에서 읽어 온 줄을 날짜별로 묶는 부분.
   *
   * 하루에 여러 줄이 오고(운동 하나에 한 줄), 날짜는 Date 객체다. 시간대가
   * 어긋나면 어제 칸에 오늘 것이 들어가는데, 조회와 붙어 있으면 눈에 안 띈다.
   */
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const dead = find('데드리프트');
  const stretch = find('피전 포즈');
  const at = (back: number) => new Date(TODAY.getTime() - back * 86400000);

  const rows = [
    { date: at(1), setsDone: 3, exercise: dead },
    { date: at(1), setsDone: 3, exercise: stretch },
    { date: at(3), setsDone: 2, exercise: dead },
    { date: at(30), setsDone: 3, exercise: dead },
  ];

  const built = buildTrainingLoad(
    rows,
    [{ date: at(1), intensity: 8 }],
    TODAY
  );
  check(
    '하루에 여러 줄이 와도 한 날로 묶는다',
    built.recentDays === 2,
    `최근 7일 중 운동한 날 ${built.recentDays}일`
  );
  check(
    '최근 7일 밖의 기록은 이번 주에 안 센다',
    built.recentCount === 3,
    `운동 ${built.recentCount}개 · ${built.recentMinutes}분`
  );
  check(
    '강도를 안 적은 날 수를 세어 둔다',
    built.estimatedIntensityDays === 1,
    `${at(3).toISOString().slice(5, 10)} 는 강도가 없다`
  );
  check(
    '기록이 없으면 지수를 안 낸다',
    buildTrainingLoad([], [], TODAY).ratio === null
  );
}

console.log('\n[오늘 하고 싶은 운동] 고른 대로 가되, 몸 상태는 말해주는가');
{
  // 회복을 고르면 몸이 좋아도 회복으로 간다. 쉬겠다는데 말릴 이유가 없다.
  const { theme } = planFor({ person: { condition: 9, wants: '회복' } });
  check('회복을 고름 → 몸이 좋아도 회복 데이', theme.key === 'recovery', theme.label);
}
{
  // 아무것도 안 고른 날은 예전과 똑같이 돈다.
  const before = planFor({ person: { condition: 9 } });
  const after = planFor({ person: { condition: 9, wants: null } });
  check(
    '아무것도 안 고름 → 예전과 같은 테마',
    before.theme.key === after.theme.key && before.theme.key !== 'recovery',
    after.theme.label
  );
}
{
  /*
   * 부딪히는 날. 기본은 가벼운 쪽이지만 막지는 않는다.
   * 이 세 줄이 "경고는 하되 강제하지 않는다"는 약속 그 자체다.
   */
  const person = { condition: 3, wants: '파워' };
  const suggested = planFor({ person });
  const forced = planFor({ person, override: true });
  check(
    '파워를 골랐지만 컨디션 3 → 기본은 회복',
    suggested.theme.key === 'recovery',
    suggested.theme.label
  );
  check(
    '그래도 하겠다고 하면 → 파워를 할 수 있는 테마',
    forced.theme.key === 'lower' || forced.theme.key === 'upper',
    forced.theme.label
  );
  check(
    '밀고 나간 날은 그 사실을 이유에 적는다',
    forced.theme.reason.includes('그래도 하겠다고 하셔서'),
    forced.theme.reason.slice(-38)
  );
}
{
  // 통증만은 예외다. 무엇을 골랐든, 밀고 나가겠다고 해도 회복이다.
  const forced = planFor({
    person: { condition: 8, pain: true, wants: '파워' },
    override: true,
  });
  check('통증이 있으면 밀고 나갈 수 없다', forced.theme.key === 'recovery', forced.theme.label);
  check('통증이 있으면 처방 자체가 멈춘다', forced.picked.halted);
}
{
  /*
   * 고른 종류가 본운동 순서에 실제로 반영되는가.
   * 테마는 그대로 두고 무엇이 먼저 오는지만 본다.
   */
  const firstMain = (wants: string | null) => {
    const { themed } = planFor({ person: { condition: 8, wants }, minutes: 90 });
    return themed.picks.find((p) => p.slot === 'main')?.exercise.category ?? null;
  };
  const power = firstMain('파워');
  const weight = firstMain('웨이트');
  check('파워를 고름 → 본운동 첫 자리가 파워', power === '파워', String(power));
  check(
    '웨이트를 고름 → 본운동 첫 자리가 스트렝스',
    (weight ?? '').includes('스트렝스'),
    String(weight)
  );
}

console.log('\n[목표] 고른 목표가 실제로 배분을 바꾸는가');
{
  const minutesOf = (goal: string, slot: string) => {
    const { themed } = planFor({ person: { condition: 8 }, goal });
    return themed.picks
      .filter((p) => p.slot === slot)
      .reduce((sum, p) => sum + estimateMinutes(p.exercise), 0);
  };

  /*
   * 배분(시간 예산)이 달라지는지 먼저 본다. 이게 목표 기능의 알맹이다.
   */
  for (const [slot, goal, label] of [
    ['armcare', '부상 방지', '암케어'],
    ['main', '근력 향상', '본운동'],
    ['prehab', '부상 방지', '보강'],
  ] as [string, string, string][]) {
    const budget = (g: string) =>
      (compositionFor('lower', g).find((sp) => sp.slot === slot)?.share ?? 0) * 45;
    check(
      `${goal} → ${label} 배분이 늘어남`,
      budget(goal) > budget('균형 잡힌 관리'),
      `${budget('균형 잡힌 관리').toFixed(1)}분 → ${budget(goal).toFixed(1)}분`
    );
  }

  /*
   * 배분이 실제 구성으로 이어지는지도 본다. 다만 45분에서는 안 된다 —
   * 무거운 운동 하나가 11분이라, 본운동 배분이 20분에서 24분으로 늘어도
   * 2개에서 3개로 넘어가지 못한다(3개면 33분이 필요하다).
   *
   * 줄이는 쪽(부상 방지)은 45분에서도 갈린다. 늘리는 쪽은 90분부터 갈린다.
   */
  check(
    '부상 방지 → 45분에서도 본운동이 줄어든다',
    minutesOf('부상 방지', 'main') < minutesOf('균형 잡힌 관리', 'main'),
    `${minutesOf('균형 잡힌 관리', 'main').toFixed(1)}분 → ${minutesOf('부상 방지', 'main').toFixed(1)}분`
  );
  {
    const at90 = (goal: string) => {
      const { themed } = planFor({ person: { condition: 8 }, goal, minutes: 90 });
      return themed.picks
        .filter((x) => x.slot === 'main')
        .reduce((sum, x) => sum + estimateMinutes(x.exercise), 0);
    };
    check(
      '근력 향상 → 90분에서는 본운동이 늘어난다',
      at90('근력 향상') > at90('균형 잡힌 관리'),
      `${at90('균형 잡힌 관리').toFixed(1)}분 → ${at90('근력 향상').toFixed(1)}분`
    );
  }
}
{
  // 목표를 바꿨다고 전체 시간이 달라지면 "45분"이 거짓말이 된다.
  const totals = TRAINING_GOALS.map((g) => {
    const { themed } = planFor({ person: { condition: 8 }, goal: g.name });
    return themed.estimatedMinutes;
  });
  const worst = Math.max(...totals.map((t) => Math.abs(t - 45) / 45));
  check('목표를 바꿔도 전체 시간은 45분 근처', worst <= 0.15, `${totals.join(' / ')}분`);
}

console.log('\n[완료 표시] 체크한 운동이 사라지지 않는가');
{
  /*
   * 하체 운동을 마친 뒤 컨디션 저하로 회복 테마가 되는 경우.
   * 회복 테마에는 본운동 구간이 없어서, 예전에는 이 운동이 목록에서 사라져
   * 잘못 누른 체크를 풀 수 없었다.
   */
  const lower = library.find((e) => e.category === '하체 스트렝스')!;
  const { themed, theme } = planFor({
    person: { condition: 3 },
    doneIds: new Set([lower.id]),
  });
  check('회복 테마인지 확인', theme.key === 'recovery');
  check(
    '완료한 하체 운동이 목록에 남아 있다',
    themed.picks.some((p) => p.exercise.id === lower.id),
    lower.title
  );
  const slots = new Set(SLOT_ORDER);
  check(
    '모든 운동이 실제로 있는 구간에 들어간다',
    themed.picks.every((p) => slots.has(p.slot))
  );
}
{
  // 모든 테마에서, 완료한 운동은 어떤 카테고리든 목록에 남아야 한다.
  const themes: ThemeKey[] = ['lower', 'upper', 'assist', 'recovery'];
  const cats = [...new Set(library.map((e) => e.category))];
  let lost = 0;
  for (const t of themes) {
    for (const cat of cats) {
      const ex = library.find((e) => e.category === cat)!;
      const { picks } = pickForTheme({
        candidates: library,
        theme: t,
        minutes: 45,
        doneIds: new Set([ex.id]),
      });
      if (!picks.some((p) => p.exercise.id === ex.id)) lost++;
    }
  }
  check(
    `테마 ${themes.length}가지 × 카테고리 ${cats.length}가지 모두 남는다`,
    lost === 0,
    `잃어버린 것 ${lost}개`
  );
}

console.log('\n[투구일지] 기록 방식이 부하를 왜곡하지 않는가');
{
  const day = '2026-06-10';
  const log = (n: number, i: number) => ({
    date: day,
    pitchCount: n,
    intensity: i,
    maxVelocity: null,
    avgVelocity: null,
  });
  const loadOf = (logs: PitchLogLike[]) => dailyLoad(groupByDay(logs).get(day)!);

  /*
   * 같은 60구를 어떻게 나눠 적든 부하가 같아야 한다.
   * 예전에는 강도를 더해서 420 / 840 / 1260 으로 벌어졌다.
   * 성실하게 나눠 적을수록 위험 구간으로 밀려 훈련이 회복 데이로 떨어졌다.
   */
  const once = loadOf([log(60, 7)]);
  const twice = loadOf([log(30, 7), log(30, 7)]);
  const thrice = loadOf([log(20, 7), log(20, 7), log(20, 7)]);
  check(
    '나눠 적어도 부하가 같다',
    once === twice && twice === thrice,
    `${once} / ${twice} / ${thrice}`
  );

  // 강도가 다른 세션이 섞이면 투구수로 가중평균이 나와야 한다.
  const mixed = groupByDay([log(40, 8), log(20, 3)]).get(day)!;
  check(
    '강도가 다르면 투구수로 가중평균',
    dailyLoad(mixed) === 40 * 8 + 20 * 3,
    `부하 ${dailyLoad(mixed)} · 강도 ${mixed.intensity.toFixed(1)}`
  );
  check('합쳐도 강도는 1~10 안에 있다', mixed.intensity > 0 && mixed.intensity <= 10);

  // 쉰 날은 부하가 0이고, 던진 날로 세지 않는다.
  const rest = groupByDay([{ ...log(0, 0) }]).get(day)!;
  check('쉰 날은 부하 0', dailyLoad(rest) === 0);
  check(
    '쉰 날은 던진 날로 세지 않는다',
    summarize(groupByDay([log(0, 0)]), [day]).activeDays === 0
  );
  check(
    '쉰 날은 연투를 끊는다',
    longestThrowStreak(
      groupByDay([
        { ...log(30, 7), date: '2026-06-09' },
        { ...log(0, 0), date: '2026-06-10' },
        { ...log(30, 7), date: '2026-06-11' },
      ]),
      ['2026-06-09', '2026-06-10', '2026-06-11']
    ) === 1
  );

  /*
   * 기록이 아예 없는 날과, 쉰 날을 적어 둔 것은 다르다.
   * 앞은 "모른다"이고 뒤는 "진짜 0"이다.
   */
  const week = ['2026-06-08', '2026-06-09', '2026-06-10'];
  check(
    '기록이 없는 날을 센다',
    countMissingDays(groupByDay([log(30, 7)]), week) === 2
  );
  check(
    '쉰 날을 적어두면 빠진 날이 아니다',
    countMissingDays(
      groupByDay([
        { ...log(0, 0), date: '2026-06-08' },
        { ...log(0, 0), date: '2026-06-09' },
        log(30, 7),
      ]),
      week
    ) === 0
  );
}

console.log('\n[전력 환산] 휴식일이 강도를 반영하는가');
{
  /*
   * 계수는 논문에서 나온 값이라 함부로 바꾸면 안 된다. 여기서 못박아 둔다.
   *   50% 노력 → 최대 팔꿈치 토크의 75%  (Fleisig 1996, n=27)
   *   60% 노력 → 79%                      (Wolf 2025, n=19)
   */
  check('강도 5 계수는 논문값 0.75', stressFactor(5) === 0.75);
  check('강도 6 계수는 논문값에 맞춘 0.80', stressFactor(6) === 0.8, `${stressFactor(6)}`);
  check('강도 10은 전력', stressFactor(10) === 1);
  check(
    '강도가 낮아질수록 계수도 낮아진다',
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].every(
      (i, idx, arr) => idx === 0 || stressFactor(arr[idx - 1]) >= stressFactor(i)
    )
  );
  check(
    '근거 없는 구간에도 바닥이 있다',
    stressFactor(1) >= MIN_STRESS_FACTOR,
    `강도 1 → ${stressFactor(1)}`
  );

  // 경기는 강도를 낮게 적어도 전력으로 본다 — 던질 양도 강도도 못 정한다.
  check('경기는 강도와 무관하게 전력', stressFactor(3, '경기') === 1);
  check('불펜은 강도를 반영', stressFactor(3, '불펜') === 0.6, `${stressFactor(3, '불펜')}`);

  const restFor = (logs: { sessionType: string; pitchCount: number; intensity: number }[]) => {
    const day = groupByDay(
      logs.map((l) => ({
        date: '2026-06-10',
        sessionType: l.sessionType,
        pitchCount: l.pitchCount,
        intensity: l.intensity,
        maxVelocity: null,
        avgVelocity: null,
      }))
    ).get('2026-06-10')!;
    return {
      adjusted: Math.round(day.adjustedPitches),
      rest: Math.max(
        requiredRestDays(Math.round(day.adjustedPitches)),
        day.pitchCount >= HIGH_VOLUME_PITCHES ? HIGH_VOLUME_MIN_REST : 0
      ),
    };
  };

  // 경기는 지금까지와 같아야 한다. 휴식일 표가 원래 경기 기준이다.
  const game = restFor([{ sessionType: '경기', pitchCount: 80, intensity: 9 }]);
  check('경기 80구 → 휴식 4일 (기존과 같음)', game.rest === 4, `환산 ${game.adjusted}구`);

  // 문제였던 경우. 캐치볼 80구에 4일을 쉬라고 하고 있었다.
  const catchPlay = restFor([{ sessionType: '캐치볼', pitchCount: 80, intensity: 2 }]);
  check(
    '캐치볼 80구 → 휴식이 줄어든다',
    catchPlay.rest < 4,
    `환산 ${catchPlay.adjusted}구 → ${catchPlay.rest}일`
  );

  // 강도를 낮게 적어도 양이 많으면 바닥선이 걸린다.
  const sandbag = restFor([{ sessionType: '캐치볼', pitchCount: 120, intensity: 1 }]);
  check(
    '강도를 1로 적어도 120구면 최소 1일',
    sandbag.rest >= HIGH_VOLUME_MIN_REST,
    `환산 ${sandbag.adjusted}구 → ${sandbag.rest}일`
  );

  // 하루에 성격이 다른 세션을 하면 각각 환산해서 더해야 한다.
  const mixed = restFor([
    { sessionType: '불펜', pitchCount: 40, intensity: 8 },
    { sessionType: '캐치볼', pitchCount: 40, intensity: 2 },
  ]);
  check(
    '세션마다 따로 환산해서 더한다',
    mixed.adjusted === Math.round(40 * 0.9 + 40 * 0.5),
    `환산 ${mixed.adjusted}구 (손계산 ${40 * 0.9 + 40 * 0.5})`
  );
}

console.log('\n[투구 종류] 무엇을 하며 지냈는지 세는가');
{
  const week = ['2026-06-08', '2026-06-09', '2026-06-10'];
  const log = (date: string, sessionType: string, pitchCount: number) => ({
    date,
    sessionType,
    pitchCount,
  });

  const counted = countSessionTypes(
    [
      log('2026-06-08', '경기', 80),
      log('2026-06-09', '불펜', 40),
      log('2026-06-09', '캐치볼', 20),
      log('2026-06-10', '휴식', 0),
      // 기간 밖은 세면 안 된다
      log('2026-05-01', '경기', 90),
    ],
    week
  );
  const find = (name: string) => counted.find((t) => t.name === name);

  check('종류별로 센다', counted.length === 4, counted.map((t) => t.name).join(','));
  check('기간 밖 기록은 빼고 센다', find('경기')?.pitches === 80, `경기 ${find('경기')?.pitches}구`);
  check('같은 날 두 종류를 따로 센다', find('불펜')?.count === 1 && find('캐치볼')?.count === 1);
  check('한 번도 없는 종류는 안 나온다', find('라이브') === undefined);

  // 쉰 날은 '몇 번'이 아니라 '며칠'이다.
  const rested = countSessionTypes(
    [log('2026-06-10', '휴식', 0), log('2026-06-10', '휴식', 0)],
    week
  );
  check('쉰 날은 하루로 센다', rested[0]?.count === 1, `${rested[0]?.count}`);
}

console.log('\n[종류별 부하] 무엇 때문에 힘든지 나뉘는가');
{
  const week = ['2026-06-08', '2026-06-09', '2026-06-10'];
  const prevWeek = ['2026-06-05', '2026-06-06', '2026-06-07'];
  const log = (date: string, sessionType: string, pitchCount: number, intensity: number) => ({
    date,
    sessionType,
    pitchCount,
    intensity,
  });

  const split = loadBySessionType(
    [
      log('2026-06-08', '경기', 80, 9), // 720
      log('2026-06-09', '불펜', 40, 6), // 240
      log('2026-06-10', '캐치볼', 30, 2), // 60
      log('2026-06-10', '휴식', 0, 0), // 부하 없음
    ],
    week
  );
  const share = (name: string) => split.find((t) => t.name === name)?.share ?? 0;

  check('부하가 0인 종류는 빠진다', !split.some((t) => t.name === '휴식'));
  // 손으로 계산한 값과 맞춰본다: 경기 80×9=720, 불펜 40×6=240, 캐치볼 30×2=60
  const expected = 720 / (720 + 240 + 60);
  check(
    '경기 부하 비중이 손계산과 같다',
    Math.abs(share('경기') - expected) < 1e-9,
    `경기 ${Math.round(share('경기') * 100)}% · 불펜 ${Math.round(share('불펜') * 100)}% · 캐치볼 ${Math.round(share('캐치볼') * 100)}%`
  );
  check(
    '비중을 다 더하면 100%',
    Math.abs(split.reduce((s, t) => s + t.share, 0) - 1) < 1e-9
  );

  /*
   * 같은 100구라도 캐치볼과 경기는 부하가 다르다.
   * 투구수 비중과 부하 비중이 갈리는지 확인한다.
   */
  const sameCount = loadBySessionType(
    [log('2026-06-08', '경기', 50, 9), log('2026-06-09', '캐치볼', 50, 2)],
    week
  );
  check(
    '같은 투구수라도 강도가 다르면 부하 비중이 다르다',
    (sameCount.find((t) => t.name === '경기')?.share ?? 0) > 0.8,
    `경기 ${Math.round((sameCount.find((t) => t.name === '경기')?.share ?? 0) * 100)}%`
  );

  // 경기가 늘었는데 연습을 안 줄이면 짚어줘야 한다.
  const surge = buildReportFindings({
    days: 3,
    current: summarize(new Map(), []),
    previous: summarize(new Map(), []),
    fatigueCount: 0,
    streak: 0,
    loadNow: loadBySessionType(
      [log('2026-06-08', '경기', 90, 9), log('2026-06-09', '불펜', 40, 6)],
      week
    ),
    loadPrev: loadBySessionType(
      [log('2026-06-05', '경기', 30, 8), log('2026-06-06', '불펜', 40, 6)],
      prevWeek
    ),
  });
  check(
    '경기가 늘고 연습이 그대로면 알려준다',
    surge.some((f) => f.title.includes('경기가 늘었는데')),
    surge.map((f) => f.title).join(' / ') || '(없음)'
  );

  // 경기가 늘어도 연습을 줄였으면 말하지 않는다.
  const balanced = buildReportFindings({
    days: 3,
    current: summarize(new Map(), []),
    previous: summarize(new Map(), []),
    fatigueCount: 0,
    streak: 0,
    loadNow: loadBySessionType([log('2026-06-08', '경기', 90, 9)], week),
    loadPrev: loadBySessionType(
      [log('2026-06-05', '경기', 30, 8), log('2026-06-06', '불펜', 60, 7)],
      prevWeek
    ),
  });
  check(
    '연습을 줄였으면 잔소리하지 않는다',
    !balanced.some((f) => f.title.includes('경기가 늘었는데'))
  );

  /*
   * 연습만 하다 시즌에 들어가는 때. 직전 경기가 0이라 '몇 배'로는 못 잡는데,
   * 정작 이때가 가장 위험하다.
   */
  const seasonStart = buildReportFindings({
    days: 3,
    current: summarize(new Map(), []),
    previous: summarize(new Map(), []),
    fatigueCount: 0,
    streak: 0,
    loadNow: loadBySessionType(
      [log('2026-06-08', '경기', 80, 9), log('2026-06-09', '불펜', 40, 6)],
      week
    ),
    loadPrev: loadBySessionType([log('2026-06-05', '불펜', 40, 6)], prevWeek),
  });
  check(
    '연습만 하다 첫 경기를 던지면 알려준다',
    seasonStart.some((f) => f.title.includes('경기가 시작됐는데')),
    seasonStart.map((f) => f.title).join(' / ') || '(없음)'
  );

  // 몸풀이로 조금 던진 것까지 잡으면 잔소리가 된다.
  const tinyGame = buildReportFindings({
    days: 3,
    current: summarize(new Map(), []),
    previous: summarize(new Map(), []),
    fatigueCount: 0,
    streak: 0,
    loadNow: loadBySessionType(
      [log('2026-06-08', '경기', 5, 6), log('2026-06-09', '불펜', 60, 7)],
      week
    ),
    loadPrev: loadBySessionType([log('2026-06-05', '불펜', 60, 7)], prevWeek),
  });
  check(
    '경기를 조금만 던진 것은 넘어간다',
    !tinyGame.some((f) => f.title.includes('경기가 시작됐는데'))
  );
}

console.log('\n[일정 만들기] 눌러야 생기고, 만든 것은 그대로 남는가');
{
  const make = (person: Person = { condition: 8 }, minutes = 45) => {
    const facts = factsFor(person);
    return buildDailyPlan({
      user: { ownedEquipment: [], trainingLevel: null, trainingGoal: null },
      facts,
      plan: buildPitchPlan(facts),
      library,
      availableToday: null,
      requestedMinutes: minutes,
      recentIds: new Set<string>(),
      lastLowerKey: null,
      lastUpperKey: null,
    });
  };

  const built = make();
  check('만들면 일정이 나온다', !isHalted(built));
  if (!isHalted(built)) {
    check('운동이 담겨 있다', built.picks.length > 0, `${built.picks.length}개`);
    check('근거도 함께 담긴다', built.basis.length > 0);
    check(
      '고른 시간이 남아 있다',
      built.requestedMinutes === 45,
      `${built.requestedMinutes}분 → 실제 ${built.estimatedMinutes}분`
    );

    /*
     * 저장했다 다시 읽어도 같아야 한다. Json 으로 오갈 때 모양이 깨지면
     * 화면에서 값이 비어 터진다.
     */
    const roundTrip = readDailyPlan(JSON.parse(JSON.stringify(built)));
    check('저장했다 읽어도 그대로다', roundTrip != null);
    check(
      '읽은 것의 운동이 같다',
      roundTrip?.picks.map((p) => p.exerciseId).join(',') ===
        built.picks.map((p) => p.exerciseId).join(',')
    );
  }

  // 같은 조건이면 몇 번을 만들어도 같아야 한다. 새로고침으로 바뀌면 안 된다.
  const again = make();
  check(
    '같은 조건이면 같은 일정이 나온다',
    !isHalted(built) &&
      !isHalted(again) &&
      built.picks.map((p) => p.exerciseId).join(',') ===
        again.picks.map((p) => p.exerciseId).join(',')
  );

  // 통증인 날에는 만들어지지 않는다. 빈 일정을 남기면 '이미 만든 날'이 된다.
  const painDay = make({ condition: 6, pain: true });
  check('통증인 날에는 일정이 만들어지지 않는다', isHalted(painDay));

  // 모양이 아닌 것은 없는 것으로 본다 — 옛 기록을 억지로 읽으면 화면이 터진다.
  check('모양이 다른 기록은 없는 것으로 본다', readDailyPlan({ version: 0 }) === null);
  check('빈 값도 없는 것으로 본다', readDailyPlan(null) === null);
}

console.log('\n[오늘 장비] 날마다 다른 장비가 반영되는가');
{
  const owned = ['맨몸', '밴드', '덤벨', '바벨', '벤치'];

  check(
    '오늘 것을 안 골랐으면 가진 것을 다 쓴다',
    equipmentForToday(owned, null).join(',') === owned.join(','),
    equipmentForToday(owned, null).join(',')
  );
  check(
    '빈 목록도 안 고른 것으로 본다',
    equipmentForToday(owned, []).length === owned.length
  );

  /*
   * 설정에서 장비를 뺐는데 오늘 목록에는 남아 있는 경우.
   * 그대로 두면 없는 기구로 하는 운동이 나온다.
   */
  const today = equipmentForToday(owned, ['맨몸', '밴드', '케이블']);
  check(
    '가진 것이 아닌 장비는 오늘 목록에서도 뺀다',
    !today.includes('케이블') && today.includes('밴드'),
    today.join(',')
  );

  check(
    '가진 장비를 아직 안 골랐으면 아무것도 안 거른다',
    equipmentForToday([], ['밴드']).length === 0
  );

  // 헬스장 가는 날과 집에서 하는 날의 훈련이 실제로 달라야 한다.
  const gymPlan = planFor({ person: { condition: 8 }, owned });
  const homeOnly = equipmentForToday(owned, ['맨몸', '밴드']);
  const homePlan = planFor({ person: { condition: 8 }, owned: homeOnly });
  const usesGymGear = homePlan.themed.picks.filter((p) =>
    p.exercise.equipment.some((e: string) => e !== '맨몸' && !homeOnly.includes(e))
  );
  check('오늘 못 쓰는 장비 운동은 안 나온다', usesGymGear.length === 0);
  check(
    '헬스장 가는 날과 집에서 하는 날의 후보가 다르다',
    homePlan.picked.candidates.length < gymPlan.picked.candidates.length,
    `집 ${homePlan.picked.candidates.length}개 · 헬스장 ${gymPlan.picked.candidates.length}개`
  );
  check('장비가 줄어도 훈련은 나온다', homePlan.themed.picks.length > 0);
}

console.log('\n[프로필 저장] 폼에서 온 값을 제대로 걸러내는가');
{
  const form = new FormData();
  form.set('trainingLevel', '중급');
  form.set('trainingGoal', '파워 향상');
  for (const v of ['밴드', '덤벨', '바벨', '없는장비']) form.append('ownedEquipment', v);
  const saved = readTrainingProfile(form);
  check('경력을 그대로 저장', saved.trainingLevel === '중급', String(saved.trainingLevel));
  check('목표를 그대로 저장', saved.trainingGoal === '파워 향상', String(saved.trainingGoal));
  check('맨몸은 항상 들어간다', saved.ownedEquipment.includes('맨몸'));
  check(
    '목록에 없는 장비는 버린다',
    !saved.ownedEquipment.includes('없는장비'),
    saved.ownedEquipment.join(',')
  );
}
{
  // 아무것도 안 고르고 저장한 경우
  const empty = readTrainingProfile(new FormData());
  check('경력을 안 고르면 비워 둔다', empty.trainingLevel === null);
  check('목표를 안 고르면 비워 둔다', empty.trainingGoal === null);
  check(
    '장비를 안 고르면 맨몸만 남는다',
    empty.ownedEquipment.length === 1 && empty.ownedEquipment[0] === '맨몸',
    empty.ownedEquipment.join(',')
  );
  /*
   * "맨몸만 있다"와 "아직 안 골랐다"는 달라야 한다. 둘을 같게 두면, 프로필을
   * 한 번도 안 연 사람과 맨몸밖에 없는 사람이 같은 취급을 받는다.
   */
  check(
    '맨몸만 있는 것과 안 고른 것이 구별된다',
    filterByEquipment(library, empty.ownedEquipment).pool.length < library.length
  );
}
{
  // 목록에 없는 이름을 억지로 보낸 경우
  const bad = new FormData();
  bad.set('trainingLevel', '초고수');
  bad.set('trainingGoal', '아무거나');
  const saved = readTrainingProfile(bad);
  check('목록에 없는 경력은 버린다', saved.trainingLevel === null);
  check('목록에 없는 목표는 버린다', saved.trainingGoal === null);
}

console.log('\n[가장 빠듯한 경우] 그래도 훈련이 나오는가');
{
  let empty = 0;
  for (const level of TRAINING_LEVELS) {
    for (const goal of TRAINING_GOALS) {
      const { themed } = planFor({
        person: { condition: 8 },
        owned: ['맨몸'],
        level: level.name,
        goal: goal.name,
        minutes: 30,
      });
      if (themed.picks.length === 0) empty++;
    }
  }
  check(
    `맨몸만 · 30분 · 경력 ${TRAINING_LEVELS.length}가지 × 목표 ${TRAINING_GOALS.length}가지`,
    empty === 0,
    `빈 훈련 ${empty}개`
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
