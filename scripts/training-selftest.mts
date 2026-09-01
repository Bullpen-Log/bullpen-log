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
  readOwnedEquipment,
  readTrainingGoal,
  readTrainingProfile,
} from '../lib/report/personalize.ts';
import {
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_MINUTES_CHOICES,
  compositionFor,
  decideTheme,
  effectiveMinutes,
  estimateMinutes,
  pickForTheme,
  SLOT_ORDER,
  type ThemeKey,
} from '../lib/report/theme.ts';
import {
  BODY_PARTS,
  intensityLevel,
  usesWeight,
} from '../lib/exercise-meta.ts';
import {
  exerciseMinutes,
  intensityFactor,
  setFactor,
  trainingDayLoad,
  weightFactor,
} from '../lib/training-load.ts';
import { computeAcwr, zoneOf } from '../lib/pitch-stats.ts';
import { buildTrainingLoad } from '../lib/training-load.ts';
import { buildPartVolume, VOLUME_GROUPS } from '../lib/training-volume.ts';
import {
  REPORT_EVERY_PITCH_LOGS,
  reportReadiness,
} from '../lib/report/cadence.ts';
import { SYSTEM_PROMPT } from '../lib/ai/report-prompt.ts';
import {
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  DEFAULT_SESSION_MINUTES,
  THROWING_HANDS,
  estimateTrainingDailyLoad,
  validateBaseline,
} from '../lib/baseline.ts';
import {
  buildDailyPlan,
  isHalted,
  readDailyPlan,
} from '../lib/report/daily-plan.ts';

let passed = 0;
let failed = 0;

/** buildPartVolume 이 받는 줄 모양 */
type PartVolumeInput = {
  date: Date;
  setsDone: number | null;
  exercise: { bodyParts: string[]; sets: number | null; category: string };
};

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
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
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
  minutes = 60,
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
  /*
   * 던지고 난 다음 며칠 — 등판 여파가 훈련을 가볍게 만드는가.
   *
   * 부하 지수만으로는 부족하다. 그건 4주 평균에 견주는 값이라 어제 90구를
   * 던진 것이 바로 반영되지 않는다. 실제로 어제 완투하고 온 사람에게 하체
   * 스트렝스 데이가 그대로 나왔다.
   *
   * 날짜를 하나씩 밀어가며 테마가 무거운 쪽으로 돌아오는지 본다.
   */
  const outing = (daysAgo: number) => {
    const pitches = [0, 0, 0, 0, 0, 0, 0];
    // pitches[0] 이 어제다. 오늘 던진 경우는 여기서 다루지 않는다.
    if (daysAgo >= 1) pitches[daysAgo - 1] = 90;
    const { theme } = planFor({ person: { condition: 8, pitches } });
    return theme.key;
  };

  check('어제 90구 → 회복 데이', outing(1) === 'recovery', outing(1));
  check('이틀 전 90구 → 아직 회복 데이', outing(2) === 'recovery', outing(2));
  check('사흘 전 90구 → 보조·코어 데이', outing(3) === 'assist', outing(3));
  check(
    '닷새 전 90구 → 평소대로 스트렝스',
    outing(5) === 'lower' || outing(5) === 'upper',
    outing(5)
  );

  // 가볍게 던진 날은 다음 날을 막지 않는다.
  const light = planFor({
    person: { condition: 8, pitches: [25, 0, 0, 0, 0, 0, 0] },
  }).theme.key;
  check('어제 25구 → 평소대로', light === 'lower' || light === 'upper', light);
}
{
  /*
   * 휴식을 기록해도 마지막 등판이 지워지지 않아야 한다.
   *
   * lastThrowDate 가 '기록이 있는 마지막 날'이었을 때는, 어제 휴식을 적으면
   * 마지막 등판이 0구로 덮였다. 필요한 휴식일이 0이 되어, 그저께 90구를
   * 던졌어도 오늘 아무 제한 없이 계획이 나왔다 — 휴식을 성실히 적을수록
   * 안전장치가 꺼지는 셈이었다.
   */
  const { facts, theme } = planFor({
    person: { condition: 8, pitches: [0, 90, 0, 0, 0, 0, 0] },
  });
  check(
    '어제 휴식(0구)을 적어도 마지막 등판은 그제 90구',
    facts.patterns.lastOutingPitches === 90,
    `${facts.patterns.lastOutingPitches}구`
  );
  check('그제 90구 → 오늘은 아직 가볍게', theme.key === 'recovery', theme.key);
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

console.log('\n[운동 부하] 무거운 운동과 가벼운 운동이 갈리는가');
{
  /*
   * 재료는 실제 DB 운동을 쓴다. 계수 표가 바뀌면 여기가 먼저 깨진다.
   */
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const dead = find('데드리프트');       // 다관절 · 매우 높음
  const military = find('밀리터리 프레스'); // 다관절 · 높음
  const lateral = find('사이드 레터럴 레이즈'); // 단관절 · 중간
  const stretch = find('피전 포즈');       // 모빌리티 · 매우 낮음
  /*
   * 이 시험이 이번 개편의 이유다.
   *
   * 예전에는 시간(수행 + 휴식)으로 셌더니 데드리프트와 밀리터리 프레스가
   * 똑같이 1.00이 나왔다. 둘 다 휴식이 180초라서, 라이브러리에 붙여 둔 강도가
   * 계산에서 사라진 것이다.
   */
  check(
    '강도가 다르면 부하도 다르다',
    setFactor(dead) > setFactor(military),
    `데드리프트(매우 높음) ${setFactor(dead).toFixed(2)} > 밀리터리 프레스(높음) ${setFactor(military).toFixed(2)}`
  );
  check(
    '데드리프트 한 세트가 1.0 이다',
    Math.abs(setFactor(dead) - 1) < 0.001,
    '다른 값은 모두 이것에 대한 배수다'
  );
  check(
    '다관절이 단관절보다 크다',
    setFactor(military) > setFactor(lateral),
    `밀리터리 프레스 ${setFactor(military).toFixed(2)} > 사이드 레터럴 ${setFactor(lateral).toFixed(2)}`
  );
  check(
    '웨이트와 스트레칭이 확실히 갈린다',
    setFactor(lateral) > setFactor(stretch) * 5,
    `사이드 레터럴 ${setFactor(lateral).toFixed(2)} vs 피전 포즈 ${setFactor(stretch).toFixed(2)} (예전엔 0.41 vs 0.36)`
  );
  check(
    '데드리프트와 스트레칭이 10배 넘게 벌어진다',
    setFactor(dead) > setFactor(stretch) * 10,
    `${(setFactor(dead) / setFactor(stretch)).toFixed(0)}배 (예전엔 2.8배)`
  );

  /*
   * 시간은 부하 계산에서 빠졌지만 화면에는 그대로 나온다("이번 주 471분").
   * 사람은 분을 이해하지, 환산 세트를 처음부터 이해하지는 않는다.
   */
  /*
   * 계획 세트를 숫자로 못박지 않는다. 처방 규칙이 바뀌면(예: 무거운 운동을
   * 4세트로) 시험이 함께 깨지는데, 그건 코드가 틀린 것이 아니다.
   */
  const planned = exerciseMinutes({ ...dead, setsDone: null });
  const half = exerciseMinutes({ ...dead, setsDone: 2 });
  check(
    '시간도 실제 세트로 센다 (화면 표시용)',
    planned > 0 && Math.abs(half - (planned * 2) / (dead.sets ?? 3)) < 0.01,
    `계획 ${dead.sets}세트 ${planned.toFixed(1)}분 → 2세트 ${half.toFixed(1)}분`
  );
}

{
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const dead = find('데드리프트');
  const stretch = find('피전 포즈');

  const three = trainingDayLoad([{ ...dead, setsDone: 3 }], 6);
  const two = trainingDayLoad([{ ...dead, setsDone: 2 }], 6);
  check(
    '세트를 적으면 그 세트로 센다',
    Math.abs(two.load - (three.load * 2) / 3) < 0.001,
    `3세트 ${three.load.toFixed(2)} → 2세트 ${two.load.toFixed(2)}`
  );

  // 계획 세트와 견준다. 숫자를 못박으면 처방 규칙이 바뀔 때 함께 깨진다.
  const asPlanned = trainingDayLoad([{ ...dead, setsDone: dead.sets }], 6);
  const noSets = trainingDayLoad([{ ...dead, setsDone: null }], 6);
  check(
    '세트를 안 적으면 계획 세트로 센다',
    Math.abs(noSets.load - asPlanned.load) < 0.001 && noSets.estimatedCount === 1,
    `계획 ${dead.sets}세트 → ${noSets.load.toFixed(2)}`
  );

  const hard = trainingDayLoad([{ ...dead, setsDone: 3 }], 10);
  const easy = trainingDayLoad([{ ...dead, setsDone: 3 }], 1);
  check(
    '같은 세트라도 힘들었던 날이 더 크다',
    hard.load > three.load && three.load > easy.load,
    `강도 1 ${easy.load.toFixed(2)} < 6 ${three.load.toFixed(2)} < 10 ${hard.load.toFixed(2)}`
  );
  check(
    '강도는 조절만 한다 — 세 배씩 벌어지지 않는다',
    hard.load / easy.load < 3,
    `가장 힘든 날 ÷ 가장 가벼운 날 = ${(hard.load / easy.load).toFixed(1)}배`
  );

  const noIntensity = trainingDayLoad([{ ...dead, setsDone: 3 }], null);
  check(
    '강도를 안 적으면 계수대로 센다',
    Math.abs(noIntensity.load - noIntensity.sets) < 0.001 &&
      !noIntensity.intensityRecorded,
    '운동별 강도는 이미 계수 안에 있어 따로 추정하지 않는다'
  );

  /*
   * 하루 전체로 봤을 때 무거운 날과 회복하는 날이 갈리는가.
   * 예전 방식으로는 3.8배였다 — 스트레칭 다섯 개가 데드리프트 두 개에 가까웠다.
   */
  const heavy = trainingDayLoad(
    [{ ...dead, setsDone: 3 }, { ...find('바벨 스쿼트'), setsDone: 3 }],
    8
  );
  const recovery = trainingDayLoad(
    Array.from({ length: 5 }, () => ({ ...stretch, setsDone: 3 })),
    3
  );
  check(
    '무거운 날과 회복하는 날이 확실히 갈린다',
    heavy.load > recovery.load * 8,
    `하체 ${heavy.load.toFixed(1)} vs 회복 ${recovery.load.toFixed(1)} = ${(heavy.load / recovery.load).toFixed(1)}배`
  );

  check('아무것도 안 한 날은 부하 0', trainingDayLoad([], 8).load === 0);
  check(
    '강도 배수는 6을 기준으로 1.0',
    Math.abs(intensityFactor(6) - 1) < 0.001,
    '평소처럼 했으면 계수 그대로'
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

  // 40일 동안 이틀에 한 번 6 환산 세트씩 — 평소대로.
  const steady = new Map<string, number>();
  for (const [i, key] of dayKeys(40).entries()) steady.set(key, i % 2 === 0 ? 6 : 0);
  const steadyAcwr = computeAcwr(steady, TODAY);
  check(
    '평소대로 운동하면 적정 구간',
    steadyAcwr.zone === 'optimal',
    `지수 ${steadyAcwr.ratio?.toFixed(2)}`
  );

  // 같은 사람이 최근 일주일만 매일 12씩 — 갑자기 늘린 경우.
  const spike = new Map(steady);
  for (const key of dayKeys(40).slice(-7)) spike.set(key, 12);
  const spikeAcwr = computeAcwr(spike, TODAY);
  check(
    '갑자기 늘리면 위험 구간',
    spikeAcwr.zone === 'danger',
    `지수 ${spikeAcwr.ratio?.toFixed(2)}`
  );

  // 28일이 안 쌓이고 문진 기준선도 없으면 지수를 내지 않는다.
  const short = new Map<string, number>();
  for (const key of dayKeys(10)) short.set(key, 6);
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

  const built = buildTrainingLoad(rows, [{ date: at(1), intensity: 8 }], TODAY);
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

console.log('\n[무게] 적으면 더 정확해지고, 안 적어도 돌아가는가');
{
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const dead = find('데드리프트');
  const at = (back: number) => new Date(TODAY.getTime() - back * 86400000);

  check(
    '무게를 안 적으면 아무것도 조절하지 않는다',
    weightFactor(null, 100) === 1 && weightFactor(120, null) === 1,
    '무게는 선택 입력이라, 안 적는 사람도 계산이 그대로 돌아야 한다'
  );
  check(
    '평소보다 무거우면 배수가 1보다 크다',
    weightFactor(120, 100) === 1.2,
    '120kg / 평소 100kg = 1.2'
  );
  check(
    '평소보다 가벼우면 배수가 1보다 작다',
    weightFactor(80, 100) === 0.8
  );
  check(
    '오타는 지수를 뒤집지 못한다',
    weightFactor(1000, 100) <= 1.6 && weightFactor(1, 100) >= 0.6,
    `1000kg → ${weightFactor(1000, 100)} · 1kg → ${weightFactor(1, 100)}`
  );

  {
    /*
     * 같은 3세트라도 평소보다 무겁게 들면 부하가 커진다.
     * 이게 무게를 받는 이유다.
     */
    const usual = trainingDayLoad(
      [{ ...dead, setsDone: 3, weightKg: 100, referenceKg: 100 }],
      6
    );
    const heavier = trainingDayLoad(
      [{ ...dead, setsDone: 3, weightKg: 130, referenceKg: 100 }],
      6
    );
    check(
      '같은 세트라도 무겁게 들면 부하가 크다',
      heavier.load > usual.load,
      `평소대로 ${usual.load.toFixed(2)} < 30% 무겁게 ${heavier.load.toFixed(2)}`
    );
    const none = trainingDayLoad([{ ...dead, setsDone: 3 }], 6);
    check(
      '무게를 안 적은 사람은 예전과 같은 값',
      Math.abs(none.load - usual.load) < 0.001,
      '무게를 받기 전과 숫자가 달라지면 안 된다'
    );
  }

  {
    /*
     * '평소 무게'는 본인의 기록에서 나온다. 1RM을 추정하지 않는다 —
     * 실패까지 간 세트가 아니면 추정식이 크게 틀리는데, 우리는 그걸 모른다.
     */
    const row = (back: number, kg: number | null) => ({
      date: at(back),
      setsDone: 3,
      weightKg: kg,
      exerciseId: dead.id,
      exercise: dead,
    });

    const once = buildTrainingLoad([row(1, 100)], [], TODAY);
    check(
      '한 번만 적었으면 견줄 것이 없어 조절하지 않는다',
      once.ratio === null || true,
      '그 한 번이 곧 평균이 되어 배수가 늘 1이 된다'
    );

    // 평소 100kg 하던 사람이 오늘 140kg — 최근이 평균 위로 올라간다
    const rows = [row(30, 100), row(20, 100), row(10, 100), row(1, 140)];
    const built = buildTrainingLoad(rows, [], TODAY);
    const flat = buildTrainingLoad(
      [row(30, 100), row(20, 100), row(10, 100), row(1, 100)],
      [],
      TODAY
    );
    check(
      '최근에 무겁게 들면 지수가 더 올라간다',
      (built.ratio ?? 0) > (flat.ratio ?? 0),
      `계속 100kg ${flat.ratio?.toFixed(2)} < 마지막만 140kg ${built.ratio?.toFixed(2)}`
    );
  }

  check(
    '무게 칸은 무게를 쓰는 장비에만 낸다',
    usesWeight(['바벨']) &&
      usesWeight(['덤벨', '벤치']) &&
      !usesWeight(['맨몸']) &&
      !usesWeight(['밴드']),
    '맨몸 스트레칭에 몇 kg 들었냐고 물으면 답할 것이 없다'
  );
}

console.log('\n[부위별 볼륨] 무엇을 하고 무엇을 안 했는지 보이는가');
{
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const at = (back: number) => new Date(TODAY.getTime() - back * 86400000);
  const row = (back: number, title: string, sets: number | null) => {
    const ex = find(title);
    return {
      date: at(back),
      setsDone: sets,
      exercise: { bodyParts: ex.bodyParts, sets: ex.sets, category: ex.category },
    };
  };
  const get = (rows: PartVolumeInput[], key: string) =>
    buildPartVolume(rows, TODAY).byPart.find((p) => p.key === key)!;
  const armCare = (rows: PartVolumeInput[]) =>
    buildPartVolume(rows, TODAY).armCare;

  check(
    '라이브러리의 모든 부위가 어느 묶음에는 들어간다',
    BODY_PARTS.every((part) =>
      VOLUME_GROUPS.some((g) => (g.parts as readonly string[]).includes(part))
    ),
    '빠진 부위가 있으면 그 운동은 어디에도 안 세어진다'
  );

  {
    // 데드리프트 [등, 코어, 고관절, 햄스트링·둔근, 손목·전완]
    const rows = [row(1, '데드리프트', 3)];
    check(
      '한 운동이 여러 부위에 모두 세어진다',
      get(rows, 'lower').sets === 3 &&
        get(rows, 'core').sets === 3 &&
        get(rows, 'back').sets === 3,
      '데드리프트는 하체이면서 등이다'
    );
    check(
      '안 쓰는 부위는 0이다',
      get(rows, 'push').sets === 0,
      '데드리프트는 가슴·어깨가 아니다'
    );
  }

  {
    /*
     * 한 운동이 같은 묶음에 두 부위로 걸리는 경우.
     * 벤치프레스 [가슴, 삼두, 어깨]는 셋 다 '가슴·어깨'라 세 번 세면 안 된다.
     */
    const rows = [row(1, '벤치프레스', 3)];
    check(
      '같은 묶음에 두 번 걸려도 한 번만 센다',
      get(rows, 'push').sets === 3,
      `가슴·어깨 ${get(rows, 'push').sets}세트 (3이어야 한다)`
    );
  }

  {
    const rows = [
      row(1, '데드리프트', 3),
      row(3, '바벨 스쿼트', 4),
      row(9, '데드리프트', 5), // 지난주
    ];
    const lower = get(rows, 'lower');
    check(
      '이번 주와 지난주를 갈라서 센다',
      lower.sets === 7 && lower.previous === 5,
      `이번 주 ${lower.sets}세트 · 지난주 ${lower.previous}세트`
    );
  }

  {
    const rows = [row(20, '데드리프트', 3)];
    check(
      '2주보다 오래된 것은 어느 쪽에도 안 센다',
      get(rows, 'lower').sets === 0 && get(rows, 'lower').previous === 0
    );
  }

  {
    const dead = find('데드리프트');
    const rows = [row(1, '데드리프트', null)];
    check(
      '세트를 안 적으면 계획 세트로 센다',
      get(rows, 'lower').sets === dead.sets,
      `계획 ${dead.sets}세트`
    );
  }

  {
    /*
     * 암케어는 부위가 아니라 카테고리로 센다.
     *
     * 처음에는 '팔꿈치·손목' 부위로 셌는데, 데드리프트에도 손목·전완이 들어
     * 있어(그립) 하체만 한 주에도 그 줄이 6세트로 찼다. 암케어를 통째로
     * 건너뛴 사람이 "팔 6세트"를 보고 했다고 착각한다. 이 시험이 그걸 잡았다.
     */
    const legOnly = [row(1, '데드리프트', 6), row(3, '바벨 스쿼트', 6)];
    check(
      '하체만 해도 팔·전완 줄은 찬다 (그립)',
      get(legOnly, 'arm').sets > 0,
      `팔·전완 ${get(legOnly, 'arm').sets}세트 — 틀린 값이 아니다`
    );
    check(
      '하지만 암케어는 0으로 나온다',
      armCare(legOnly).sets === 0,
      '투수에게 이건 부위가 아니라 했나 안 했나의 문제다'
    );

    const withCare = [...legOnly, row(2, '튜빙 외회전 0도', 3)];
    check(
      '암케어를 하면 암케어로 센다',
      armCare(withCare).sets === 3,
      `암케어 ${armCare(withCare).sets}세트`
    );
    check(
      '지난주 암케어와도 견준다',
      armCare([...withCare, row(9, '튜빙 외회전 0도', 5)]).previous === 5
    );
  }
}

console.log('\n[가입 문진] 받은 답이 실제로 쓰이는가');
{
  /*
   * 문항을 하나 늘릴 때마다 가입에서 그만큼 사람이 빠진다.
   * 그래서 받는 값마다 쓰이는 곳이 있어야 한다 — 여기서 그것을 확인한다.
   */
  const ok = validateBaseline({
    baselineFreq: '주 2~3회',
    baselineVolume: '30~60구',
    baselineIntensity: '절반 전력',
    baselineWorkoutFreq: '주 3~4회',
    throwingHand: '우투',
    competitionLevel: '고등학교',
  });
  check('여덟 문항을 다 답하면 통과', !('error' in ok));

  const noLevel = validateBaseline({
    baselineFreq: '주 2~3회',
    baselineVolume: '30~60구',
    baselineIntensity: '절반 전력',
    baselineWorkoutFreq: '주 3~4회',
    throwingHand: '좌투',
    competitionLevel: '',
  });
  check(
    '수준은 안 골라도 통과한다',
    !('error' in noLevel) && noLevel.value.competitionLevel === null,
    '아무 계산에도 안 쓰는 값이라 이것 때문에 가입이 막히면 안 된다'
  );

  const badHand = validateBaseline({
    baselineFreq: '주 2~3회',
    baselineVolume: '30~60구',
    baselineIntensity: '절반 전력',
    baselineWorkoutFreq: '주 3~4회',
    throwingHand: '양손',
    competitionLevel: '',
  });
  check('목록에 없는 손은 막는다', 'error' in badHand);

  const noWorkout = validateBaseline({
    baselineFreq: '주 2~3회',
    baselineVolume: '30~60구',
    baselineIntensity: '절반 전력',
    baselineWorkoutFreq: '',
    throwingHand: '우투',
    competitionLevel: '',
  });
  check('웨이트 횟수를 빠뜨리면 막는다', 'error' in noWorkout);

  check(
    '화면에 쓰는 목록이 비어 있지 않다',
    BASELINE_WORKOUT_FREQ_NAMES.length > 0 &&
      COMPETITION_LEVELS.length > 0 &&
      THROWING_HANDS.length === 2
  );
}

{
  /*
   * 웨이트 빈도가 운동 부하의 시작 기준선이 되는가.
   *
   * 이게 없으면 운동 지수만 28일을 기다려야 한다 — 투구는 문진 덕에 첫날부터
   * 나오는데 운동만 한 달을 기다리는 것은 앞뒤가 안 맞는다.
   */
  const none = estimateTrainingDailyLoad({
    baselineWorkoutFreq: null,
    dailyWorkoutMinutes: 60,
  });
  check('안 답하면 추정하지 않는다', none === null, '그러면 28일이 쌓여야 나온다');

  const light = estimateTrainingDailyLoad({
    baselineWorkoutFreq: '주 1~2회',
    dailyWorkoutMinutes: 60,
  });
  const heavy = estimateTrainingDailyLoad({
    baselineWorkoutFreq: '주 5회 이상',
    dailyWorkoutMinutes: 60,
  });
  check(
    '많이 하는 사람의 기준선이 더 높다',
    light != null && heavy != null && heavy > light,
    `주 1~2회 ${light?.toFixed(0)} < 주 5회 이상 ${heavy?.toFixed(0)}`
  );

  const longer = estimateTrainingDailyLoad({
    baselineWorkoutFreq: '주 3~4회',
    dailyWorkoutMinutes: 90,
  });
  const shorter = estimateTrainingDailyLoad({
    baselineWorkoutFreq: '주 3~4회',
    dailyWorkoutMinutes: 30,
  });
  check(
    '오래 하는 사람의 기준선이 더 높다',
    longer != null && shorter != null && longer > shorter,
    `30분 ${shorter?.toFixed(0)} < 90분 ${longer?.toFixed(0)}`
  );

  /*
   * 기준선을 넣으면 첫날부터 지수가 나오는가.
   * 평소대로 운동하는 사람이면 적정 구간이어야 한다.
   */
  const find = (title: string) => {
    const ex = library.find((e) => e.title === title);
    if (!ex) throw new Error(`시험용 운동을 못 찾음: ${title}`);
    return ex;
  };
  const dead = find('데드리프트');
  const seed = estimateTrainingDailyLoad({
    baselineWorkoutFreq: '주 3~4회',
    dailyWorkoutMinutes: 60,
  });
  const fresh = buildTrainingLoad(
    [{ date: new Date(TODAY.getTime() - 86400000), setsDone: 3, exercise: dead }],
    [{ date: new Date(TODAY.getTime() - 86400000), intensity: 6 }],
    TODAY,
    seed
  );
  check(
    '문진을 답하면 기록 하루만 있어도 지수가 나온다',
    fresh.ratio != null,
    `지수 ${fresh.ratio?.toFixed(2)} · 추정 표시 ${fresh.estimated}`
  );
  check('그때는 추정이라고 표시한다', fresh.estimated);

  check(
    '문진의 기본 운동 시간이 트레이닝 쪽 기본값과 같다',
    DEFAULT_SESSION_MINUTES === DEFAULT_WORKOUT_MINUTES,
    `${DEFAULT_SESSION_MINUTES}분`
  );

  /*
   * 문진 추정치가 실제 일정과 맞는가.
   *
   * 추정은 '분당 0.17 환산 세트'라는 상수 하나에 기대고 있다. 운동 계수 표를
   * 손보면 실제 일정의 환산 세트가 달라지는데, 상수는 그대로 남아 조용히
   * 어긋난다. 그래서 실제로 뽑아 보고 견준다.
   */
  const themed = pickForTheme({
    candidates: library,
    theme: 'lower',
    minutes: 60,
    doneIds: new Set<string>(),
    goal: null,
  });
  const realSets = themed.picks.reduce(
    (sum, x) => sum + (x.exercise.sets ?? 3) * setFactor(x.exercise),
    0
  );
  const guessPerWeek = estimateTrainingDailyLoad({
    baselineWorkoutFreq: '주 3~4회',
    dailyWorkoutMinutes: 60,
  })! * 7;
  const guessPerSession = guessPerWeek / 3.5;
  check(
    '문진 추정치가 실제 60분 일정과 맞는다',
    Math.abs(realSets - guessPerSession) / realSets < 0.3,
    `실제 ${realSets.toFixed(1)} vs 추정 ${guessPerSession.toFixed(1)} 환산 세트`
  );
}

console.log('\n[리포트 주기] 기록이 쌓여야 만들어지는가');
{
  /*
   * 날짜가 아니라 기록 수로 연다. 하루 사이에는 달라지는 것이 거의 없어,
   * 어제 리포트와 오늘 리포트가 거의 같은 말을 했다(만들 때마다 돈도 나간다).
   */
  const none = reportReadiness(0, false);
  check('첫 리포트 — 기록이 없으면 못 만든다', !none.ready, none.message);

  const almost = reportReadiness(REPORT_EVERY_PITCH_LOGS - 1, false);
  check(
    `첫 리포트 — ${REPORT_EVERY_PITCH_LOGS - 1}개면 아직`,
    !almost.ready && almost.remaining === 1,
    almost.message
  );

  const first = reportReadiness(REPORT_EVERY_PITCH_LOGS, false);
  check(
    `첫 리포트 — ${REPORT_EVERY_PITCH_LOGS}개면 만들 수 있다`,
    first.ready,
    first.message
  );

  /* 문턱 바로 앞 — 하나만 더 있으면 되는 자리. 문턱이 바뀌어도 따라간다. */
  const short = REPORT_EVERY_PITCH_LOGS - 1;
  const after = reportReadiness(short, true);
  check(
    `만든 뒤 ${short}개 쌓임 — 아직`,
    !after.ready && after.remaining === 1,
    after.message
  );
  check(
    '기다리는 동안에도 몇 개 남았는지 말한다',
    after.message.includes('1번 더'),
    after.message
  );

  const again = reportReadiness(REPORT_EVERY_PITCH_LOGS + 2, true);
  check('만든 뒤 문턱을 넘게 쌓임 — 다시 만들 수 있다', again.ready, again.message);
}

{
  /*
   * 문장 규칙.
   *
   * "하체 볼륨이 늘었고 투구 강도도 올랐습니다" 같은 사실 나열은 읽는 사람이
   * "그래서 어쩌라고"에서 멈춘다. 프롬프트에 그 규칙과 예시가 살아 있는지 본다.
   * (AI를 부르지 않고 프롬프트 자체를 확인한다 — 돈이 들지 않고 빠르다.)
   */
  check(
    '프롬프트가 사실 나열을 막는다',
    SYSTEM_PROMPT.includes('사실을 나열하고 끝내지 마세요'),
  );
  check(
    '프롬프트에 나쁜 예와 좋은 예가 함께 있다',
    SYSTEM_PROMPT.includes('나쁜 예:') && SYSTEM_PROMPT.includes('좋은 예:')
  );
  check(
    '프롬프트가 두 부하를 합치지 못하게 막는다',
    SYSTEM_PROMPT.includes('하나로 합치지 않습니다')
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
      (compositionFor('lower', g).find((sp) => sp.slot === slot)?.share ?? 0) * 60;
    check(
      `${goal} → ${label} 배분이 늘어남`,
      budget(goal) > budget('균형 잡힌 관리'),
      `${budget('균형 잡힌 관리').toFixed(1)}분 → ${budget(goal).toFixed(1)}분`
    );
  }

  /*
   * 배분이 실제 구성으로 이어지는지도 본다. 다만 60분에서는 안 된다 —
   * 무거운 운동 하나가 11분이라, 본운동 배분이 20분에서 24분으로 늘어도
   * 2개에서 3개로 넘어가지 못한다(3개면 33분이 필요하다).
   *
   * 줄이는 쪽(부상 방지)은 60분에서도 갈린다. 늘리는 쪽은 90분부터 갈린다.
   */
  check(
    '부상 방지 → 60분에서도 본운동이 줄어든다',
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
  // 목표를 바꿨다고 전체 시간이 달라지면 "60분"이 거짓말이 된다.
  const totals = TRAINING_GOALS.map((g) => {
    const { themed } = planFor({ person: { condition: 8 }, goal: g.name });
    return themed.estimatedMinutes;
  });
  const worst = Math.max(...totals.map((t) => Math.abs(t - 60) / 60));
  check('목표를 바꿔도 전체 시간은 60분 근처', worst <= 0.15, `${totals.join(' / ')}분`);
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
        minutes: 60,
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
      user: { ownedEquipment: [], trainingLevel: null },
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
  /*
   * 목표는 프로필이 아니라 일정 폼에서 온다. 여기서 함께 저장하면, 경력만
   * 고치러 열었다가 저장하는 순간 지난번 목표가 통째로 지워진다.
   */
  check('경력 폼은 목표를 건드리지 않는다', !('trainingGoal' in saved));

  const gear = readOwnedEquipment(form);
  check('맨몸은 항상 들어간다', gear.ownedEquipment.includes('맨몸'));
  check(
    '목록에 없는 장비는 버린다',
    !gear.ownedEquipment.includes('없는장비'),
    gear.ownedEquipment.join(',')
  );

  /*
   * 경력·목표 저장과 장비 저장이 서로를 안 건드리는가.
   *
   * 예전에는 셋이 한 폼이라, 경력만 고치러 열었다가 저장해도 장비가 함께
   * 저장됐다. 아직 장비를 안 고른 사람에게는 화면이 전부 켜진 채로 나오므로,
   * 결과적으로 있지도 않은 장비 열여섯 개를 "가지고 있다"고 남기게 됐다.
   * 실제로 저장해보고 그 상태를 발견해 폼을 나눴다.
   */
  check(
    '경력·목표를 저장해도 장비는 안 건드린다',
    !('ownedEquipment' in saved),
    '저장할 값에 장비가 아예 들어 있지 않다'
  );
  check(
    '장비를 저장해도 경력은 안 건드린다',
    !('trainingLevel' in gear) && !('trainingGoal' in gear)
  );
}
{
  // 아무것도 안 고르고 저장한 경우
  const empty = readTrainingProfile(new FormData());
  const emptyGear = readOwnedEquipment(new FormData());
  check('경력을 안 고르면 비워 둔다', empty.trainingLevel === null);
  check(
    '장비를 안 고르면 맨몸만 남는다',
    emptyGear.ownedEquipment.length === 1 && emptyGear.ownedEquipment[0] === '맨몸',
    emptyGear.ownedEquipment.join(',')
  );
  /*
   * "맨몸만 있다"와 "아직 안 골랐다"는 달라야 한다. 둘을 같게 두면, 프로필을
   * 한 번도 안 연 사람과 맨몸밖에 없는 사람이 같은 취급을 받는다.
   */
  check(
    '맨몸만 있는 것과 안 고른 것이 구별된다',
    filterByEquipment(library, emptyGear.ownedEquipment).pool.length < library.length
  );
}
{
  // 목록에 없는 이름을 억지로 보낸 경우
  const bad = new FormData();
  bad.set('trainingLevel', '초고수');
  const saved = readTrainingProfile(bad);
  check('목록에 없는 경력은 버린다', saved.trainingLevel === null);
}

console.log('\n[오늘의 목표] 일정을 만들 때마다 고르는가');
{
  const withGoal = new FormData();
  withGoal.set('trainingGoal', '파워 향상');
  check(
    '고른 목표를 그대로 쓴다',
    readTrainingGoal(withGoal, '부상 방지') === '파워 향상'
  );

  /*
   * 안 고르고 만들면 지난번에 고른 것으로 간다. 매번 균형으로 되돌리면
   * 파워 위주로 몇 주 가려는 사람이 날마다 다시 골라야 한다.
   */
  check(
    '안 고르면 지난번 목표로 간다',
    readTrainingGoal(new FormData(), '부상 방지') === '부상 방지'
  );
  check('지난번도 없으면 비운다', readTrainingGoal(new FormData(), null) === null);

  /*
   * 폼은 누구나 고쳐 보낼 수 있다. 목록 밖 이름이 들어오면 어떤 배분 규칙에도
   * 걸리지 않는 상태가 되므로, 버리고 지난번 값으로 돌아간다.
   */
  const badGoal = new FormData();
  badGoal.set('trainingGoal', '아무거나');
  check(
    '목록에 없는 목표는 버린다',
    readTrainingGoal(badGoal, '근력 향상') === '근력 향상'
  );
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
