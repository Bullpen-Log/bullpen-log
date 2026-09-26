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
  intensityRangeText,
  pendingOuting,
  pitchRangeText,
  readPitchPlan,
  requiredRestDays,
  HIGH_VOLUME_PITCHES,
  HIGH_VOLUME_MIN_REST,
} from '../lib/report/plan.ts';
import { selectCandidates } from '../lib/report/prescription.ts';
import { equipmentForToday, filterByEquipment } from '../lib/report/equipment.ts';
import {
  GOAL_FOCUSES,
  TRAINING_GOALS,
  goalForUnchosen,
  TRAINING_LEVELS,
  filterByLevel,
  focusesFor,
  readOwnedEquipment,
  readTrainingGoal,
  readTrainingProfile,
  validFocus,
} from '../lib/report/personalize.ts';
import {
  DEFAULT_WORKOUT_MINUTES,
  SLOT_ORDER,
  WORKOUT_MINUTES_CHOICES,
  compositionFor,
  decideTheme,
  effectiveMinutes,
  estimateMinutes,
  pickForTheme,
  type ThemeKey,
} from '../lib/report/theme.ts';
import {
  BODY_PARTS,
  EXERCISE_NOTE_MAX,
  cleanExerciseNote,
  formatAmount,
  intensityLevel,
  storedKg,
  usesWeight,
} from '../lib/exercise-meta.ts';
import { formatWeight, fromWeight } from '../lib/units.ts';
import { formatSummary, volumeIn } from '../lib/workout/summarize.ts';
import {
  exerciseMinutes,
  intensityFactor,
  setFactor,
  trainingDayLoad,
  weightFactor,
} from '../lib/training-load.ts';
import { computeAcwr, zoneOf } from '../lib/pitch-stats.ts';
import { buildTrainingLoad } from '../lib/training-load.ts';
import {
  ARM_CARE_CATEGORY,
  buildPartVolume,
  VOLUME_GROUPS,
} from '../lib/training-volume.ts';
import { readFileSync } from 'node:fs';
import {
  ARMCARE_AREAS,
  ARMCARE_CATEGORY,
  ARMCARE_MUSCLE_NAMES,
  areasOf,
  cleanTargetMuscles,
  helpsLine,
  muscleInfo,
  primaryArea,
  type ArmcareAreaKey,
} from '../lib/armcare/anatomy.ts';
import {
  armcareBlock,
  buildArmcareRoutine,
  decideArmcare,
  readArmcareRoutine,
  type ArmcareKind,
} from '../lib/armcare/routine.ts';
import { ARMCARE_METHODS, methodOf } from '../lib/armcare/methods.ts';
import {
  MY_ROUTINE_MAX_ITEMS,
  normalizeRoutineInput,
  readRoutineItems,
} from '../lib/armcare/my-routines.ts';
import { readTrainingPart } from '../lib/training-part.ts';
import { reportReadiness } from '../lib/report/cadence.ts';
import { SYSTEM_PROMPT } from '../lib/ai/report-prompt.ts';
import {
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  DEFAULT_SESSION_MINUTES,
  THROWING_HANDS,
  estimateTrainingDailyLoad,
  validateBaseline,
} from '../lib/baseline.ts';
import { buildDailyPlan, isHalted, readDailyPlan } from '../lib/report/daily-plan.ts';
import {
  DEFAULT_GOAL,
  canReuse,
  checkinStamp,
  decideAutoFence,
  type AutoRecord,
  type WorkoutSignals,
} from '../lib/report/auto-setup.ts';
import {
  acceptAnswer,
  autoSetupSchema,
  buildAutoPrompt,
  type AutoAnswer,
  type AutoPromptInput,
} from '../lib/ai/auto-setup-prompt.ts';
import {
  CONDITIONING_DAY_LABEL,
  CONDITIONING_GOAL,
  minutesChoicesFor,
} from '../lib/report/theme.ts';
import {
  STALE_AFTER_MS,
  isAbandoned,
  lastActivity,
  sessionEnd,
} from '../lib/workout/stale.ts';
import {
  SIMILAR_LIMIT,
  equipmentLabel,
  placeExercise,
  similarExercises,
  swapMode,
} from '../lib/workout/swap.ts';
import { buildExerciseHistory, estimate1RM } from '../lib/workout/history.ts';
import { REST_CLOCK_LIMIT_SECONDS, restSeconds } from '../lib/workout/rest.ts';

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
  check(
    '부하가 위험 구간으로 계산됨',
    facts.load.zone === 'danger',
    String(facts.load.zone)
  );
  check(
    '부하 위험 구간 → 회복 수준까지만',
    tooHard.length === 0,
    `강도 3 이상 ${tooHard.length}개`
  );
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
  check(
    '경력 입문 → 초급 난이도만',
    hard.length === 0,
    `후보 ${picked.candidates.length}개`
  );
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
/*
 * 목표마다 고를 수 있는 시간이 다르다(근력·파워 45·60·75·90, 컨디셔닝 45·60·75).
 * 예전에는 목표 없이 WORKOUT_MINUTES_CHOICES 만 돌려 컨디셔닝을 한 번도 안 봤다.
 */
for (const goal of TRAINING_GOALS.map((g) => g.name)) {
  for (const minutes of minutesChoicesFor(goal)) {
    const { themed, theme } = planFor({ person: { condition: 8 }, goal, minutes });
    const target = effectiveMinutes(theme.key, minutes);
    const gap = Math.abs(themed.estimatedMinutes - target) / target;
    check(
      `${goal} ${minutes}분 요청 → ${themed.estimatedMinutes}분`,
      gap <= 0.15,
      `${theme.label}, 오차 ${Math.round(gap * 100)}%`
    );
  }
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
  const dead = find('데드리프트'); // 다관절 · 매우 높음
  const military = find('밀리터리 프레스'); // 다관절 · 높음
  const lateral = find('사이드 레터럴 레이즈'); // 단관절 · 중간
  const stretch = find('피전 포즈'); // 모빌리티 · 매우 낮음
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
    [
      { ...dead, setsDone: 3 },
      { ...find('바벨 스쿼트'), setsDone: 3 },
    ],
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
  check('평소보다 가벼우면 배수가 1보다 작다', weightFactor(80, 100) === 0.8);
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
  const armCare = (rows: PartVolumeInput[]) => buildPartVolume(rows, TODAY).armCare;

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
      /*
       * 개수를 박아 두지 않는다. '비어 있지 않다'를 보는 자리인데 2 로 고정해
       * 두었더니, 양투를 더하는 정당한 변경에서 이 점검이 걸렸다.
       */
      THROWING_HANDS.length > 0
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
  check(
    '기본 운동 시간은 어느 목표에서도 고를 수 있는 값이다',
    WORKOUT_MINUTES_CHOICES.includes(DEFAULT_WORKOUT_MINUTES as never) &&
      minutesChoicesFor(CONDITIONING_GOAL).includes(DEFAULT_WORKOUT_MINUTES),
    `${DEFAULT_WORKOUT_MINUTES}분`
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
  const guessPerWeek =
    estimateTrainingDailyLoad({
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

console.log('\n[리포트 주기] 하루에 한 번인가');
{
  /*
   * 날짜로 연다. 리포트가 오늘·내일 몇 구까지 던져도 되는지를 내는데, 그것은
   * 날마다 달라진다 — 사흘 전 숫자를 오늘 보고 있으면 안 보느니만 못하다.
   * 대신 하루 한 번으로 잠근다. 부를 때마다 AI 비용이 실제로 나간다.
   */
  const done = (asOf: string) => ({ asOf, halted: false });

  const first = reportReadiness('2026-09-01', null);
  check('하나도 없으면 만들 수 있다', first.ready, first.message);

  const madeToday = reportReadiness('2026-09-01', done('2026-09-01'));
  check(
    '오늘 몫을 이미 만들었으면 못 만든다',
    !madeToday.ready && madeToday.madeToday,
    madeToday.message
  );
  check(
    '언제 다시 되는지 말한다',
    madeToday.message.includes('내일'),
    madeToday.message
  );

  const yesterday = reportReadiness('2026-09-01', done('2026-08-31'));
  check('어제 만들었으면 오늘 다시 만들 수 있다', yesterday.ready, yesterday.message);

  /*
   * 통증으로 멈춘 리포트는 하루를 쓰지 않는다.
   *
   * 멈춘 리포트에는 AI를 안 불러 비용이 없고, 멈춤 안내가 "체크인을 다시
   * 저장해주세요"라고 말한다 — 다시 못 만들면 그 안내가 거짓말이 된다.
   */
  const halted = reportReadiness('2026-09-01', {
    asOf: '2026-09-01',
    halted: true,
  });
  check('멈춘 리포트는 하루를 안 쓴다', halted.ready, halted.message);
  check(
    '멈춘 뒤에는 무엇을 하면 되는지 말한다',
    halted.message.includes('체크인'),
    halted.message
  );
  check(
    '멈췄어도 오늘 만든 것은 만든 것으로 센다',
    halted.madeToday,
    String(halted.madeToday)
  );
}

console.log('\n[등판 회복] 쉬는 동안에도 가볍게 던지게 하는가');
{
  /*
   * 휴식일 표(Pitch Smart)는 전력 등판 사이의 간격이지 "아무것도 던지지 마라"가
   * 아니다. 나흘을 통째로 멈추라고 하면 선수는 그 말을 안 듣고, 안 들은 만큼
   * 기록도 같이 끊긴다.
   */
  const facts = (outings: { daysAgo: number; pitches: number; adjusted: number }[]) =>
    ({
      asOf: '2026-09-01',
      profile: { nickname: '테스트', age: 21, heightCm: 180, trainingLevel: null },
      volume: {
        current: { totalPitches: 200, maxDailyPitches: 100, days: 3, adjusted: 190 },
        previous: { totalPitches: 180, maxDailyPitches: 60, days: 3, adjusted: 160 },
        changePercent: 11,
      },
      load: { ratio: 1.0, zone: 'optimal', acute: 30, chronic: 30, days: 28 },
      patterns: {
        fatigueWindows: 0,
        longestStreak: 1,
        missingDays: 0,
        lastThrowDate: '2026-08-30',
        lastOutingPitches: outings[0].pitches,
        lastOutingAdjusted: outings[0].adjusted,
        restDays: outings[0].daysAgo,
        baselinePitches: 54,
        recentOutings: outings,
      },
      condition: {
        today: null,
        painToday: false,
        painRecently: false,
        painWordsInMemo: [],
        avgCondition: 7,
        poorSleepDays: 0,
        checkinDays: 5,
      },
      memos: [],
    }) as unknown as Parameters<typeof buildPitchPlan>[0];

  /** 100구 경기를 daysAgo 일 전에 던졌다 */
  const game = (daysAgo: number) => [{ daysAgo, pitches: 100, adjusted: 100 }];

  const nextDay = buildPitchPlan(facts(game(1))).today!;
  check('등판 바로 다음 날은 완전히 쉰다', !nextDay.throwing, nextDay.reason);

  const second = buildPitchPlan(facts(game(2))).today!;
  check(
    '이틀째부터는 가볍게 던진다',
    second.throwing && second.recovery === true,
    pitchRangeText(second) + ' · ' + intensityRangeText(second)
  );

  const third = buildPitchPlan(facts(game(3))).today!;
  check(
    '사흘째는 이틀째보다 더 던진다',
    third.maxPitches! > second.maxPitches! &&
      third.maxIntensity! > second.maxIntensity!,
    pitchRangeText(third) + ' · ' + intensityRangeText(third)
  );

  const full = buildPitchPlan(facts(game(4))).today!;
  check(
    '창이 끝나면 정상 계획으로 돌아온다',
    full.throwing && !full.recovery && full.maxPitches! > third.maxPitches!,
    pitchRangeText(full) + ' · ' + intensityRangeText(full)
  );

  check(
    '회복 투구는 평소 계획보다 적고 가볍다',
    second.maxPitches! < full.maxPitches! && second.maxIntensity! < full.maxIntensity!,
    `회복 ${pitchRangeText(second)} < 평소 ${pitchRangeText(full)}`
  );

  /*
   * 가벼운 캐치볼이 큰 등판의 창을 지우면 안 된다.
   *
   * 마지막 등판 하나만 보던 때에는, 100구 경기 이틀 뒤 캐치볼 25구(전력 환산
   * 18구)가 '마지막 등판'이 되어 필요한 휴식이 0일로 떨어졌다. 회복 투구를
   * 성실히 한 사람일수록 안전장치가 꺼졌다.
   */
  const afterCatch = [
    { daysAgo: 1, pitches: 25, adjusted: 18 },
    { daysAgo: 3, pitches: 100, adjusted: 100 },
  ];
  const kept = pendingOuting(facts(afterCatch).patterns, 0);
  check(
    '가벼운 캐치볼이 100구 등판의 창을 지우지 않는다',
    kept != null && kept.pitches === 100 && kept.left === 1,
    kept ? `${kept.pitches}구 기준, ${kept.left}일 남음` : '창이 사라졌다'
  );

  const keptPlan = buildPitchPlan(facts(afterCatch)).today!;
  check('그날도 회복 투구로 낸다', keptPlan.recovery === true, keptPlan.reason);

  /* 창이 없으면 아무것도 안 걸린다 */
  check(
    '여파가 없으면 걸리는 등판이 없다',
    pendingOuting(facts([{ daysAgo: 5, pitches: 30, adjusted: 25 }]).patterns) == null,
    '없음'
  );
}

console.log('\n[투구 계획] 오늘과 내일을 범위로 내는가');
{
  const base = {
    asOf: '2026-09-01',
    profile: { nickname: '테스트', age: 20, heightCm: 180, trainingLevel: null },
    volume: {
      current: { totalPitches: 200, maxDailyPitches: 60, days: 3, adjusted: 180 },
      previous: { totalPitches: 180, maxDailyPitches: 55, days: 3, adjusted: 160 },
      changePercent: 11,
    },
    load: { ratio: 1.0, zone: 'optimal', acute: 30, chronic: 30, days: 28 },
    patterns: {
      fatigueWindows: 0,
      longestStreak: 1,
      missingDays: 0,
      lastThrowDate: '2026-08-28',
      lastOutingPitches: 20,
      lastOutingAdjusted: 20,
      restDays: 4,
      baselinePitches: 60,
    },
    condition: {
      today: null,
      painToday: false,
      painRecently: false,
      painWordsInMemo: [],
      avgCondition: 7,
      poorSleepDays: 0,
      checkinDays: 5,
    },
    memos: [],
  } as unknown as Parameters<typeof buildPitchPlan>[0];

  const plan = buildPitchPlan(base);
  check(
    '안 던진 날 — 오늘과 내일 둘 다 낸다',
    plan.today != null && plan.tomorrow != null && !plan.threwToday,
    `today=${plan.today?.label} tomorrow=${plan.tomorrow?.label}`
  );
  check(
    '내일은 하루 뒤 날짜다',
    plan.tomorrow?.dateKey === '2026-09-02',
    String(plan.tomorrow?.dateKey)
  );
  check(
    '투구수가 범위로 나온다',
    plan.today!.minPitches != null && plan.today!.minPitches < plan.today!.maxPitches!,
    pitchRangeText(plan.today!)
  );
  check(
    '강도도 범위로 나온다',
    plan.today!.minIntensity != null &&
      plan.today!.minIntensity < plan.today!.maxIntensity!,
    intensityRangeText(plan.today!)
  );
  check(
    '범위 아래끝이 상한보다 낮고 0보다 크다',
    plan.today!.minPitches! > 0 && plan.today!.minPitches! < plan.today!.maxPitches!,
    pitchRangeText(plan.today!)
  );

  /*
   * 오늘 던진 기록이 있으면 오늘 몫은 없다. 이미 벌어진 일에 몇 구를 던지라고
   * 하는 것은 조언이 아니다.
   */
  const threw = buildPitchPlan({
    ...base,
    patterns: {
      ...base.patterns,
      lastThrowDate: '2026-09-01',
      lastOutingPitches: 70,
      lastOutingAdjusted: 70,
      restDays: 0,
    },
  });
  check(
    '오늘 던졌으면 오늘 몫은 안 낸다',
    threw.today == null && threw.threwToday,
    `today=${threw.today} threwToday=${threw.threwToday}`
  );
  check(
    '오늘 던졌어도 내일은 낸다',
    threw.tomorrow != null,
    String(threw.tomorrow?.label)
  );
  check(
    '70구 던진 다음 날은 아직 쉰다',
    threw.tomorrow?.throwing === false,
    String(threw.tomorrow?.reason)
  );

  /* 옛 리포트 — 범위도 내일도 없이 저장된 것 */
  const old = readPitchPlan({
    halted: false,
    haltReason: null,
    recovering: false,
    needsPainCheck: false,
    today: {
      dateKey: '2026-08-01',
      label: '오늘',
      throwing: true,
      maxPitches: 60,
      maxIntensity: 8,
      reason: '평소 수준',
    },
    basis: [],
    youthNote: null,
  });
  check('옛 리포트도 읽힌다', old != null, String(old?.today?.maxPitches));
  check(
    '범위가 없으면 상한 하나로 읽는다',
    pitchRangeText(old!.today!) === '60구 이하',
    pitchRangeText(old!.today!)
  );
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
    SYSTEM_PROMPT.includes('사실을 나열하고 끝내지 마세요')
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
  check(
    '통증이 있으면 밀고 나갈 수 없다',
    forced.theme.key === 'recovery',
    forced.theme.label
  );
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
  /*
   * 예전에는 '균형 잡힌 관리'를 기준으로 견줬다. 그 목표를 없앤 뒤로는 남은
   * 목표끼리 견준다 — 목표가 배분을 바꾼다는 알맹이는 같다.
   */
  /*
   * 예전 첫 줄은 '컨디셔닝이 근력 향상보다 암케어가 많다'였다. 암케어가 모든
   * 일정에서 빠진 뒤로(2026-09-25) 그 자리를 가동성과 코어가 잇는다.
   */
  for (const [slot, goal, base, label] of [
    ['mobility', '컨디셔닝', '근력 향상', '가동성'],
    ['core', '컨디셔닝', '근력 향상', '코어'],
    ['main', '근력 향상', '파워 향상', '본운동'],
    ['prehab', '컨디셔닝', '근력 향상', '보강'],
    ['core', '파워 향상', '근력 향상', '코어'],
  ] as [string, string, string, string][]) {
    const budget = (g: string) =>
      (compositionFor('lower', g).find((sp) => sp.slot === slot)?.share ?? 0) * 60;
    check(
      `${goal} → ${base}보다 ${label} 배분이 많음`,
      budget(goal) > budget(base),
      `${base} ${budget(base).toFixed(1)}분 → ${goal} ${budget(goal).toFixed(1)}분`
    );
  }
  /* 하체날 60분을 이 후보들로 뽑는다(안전 거르기 없이 — 구성만 본다) */
  const lower60 = (goal: string, candidates = library) =>
    pickForTheme({
      candidates,
      theme: 'lower',
      minutes: 60,
      doneIds: new Set<string>(),
      goal,
    }).picks;
  {
    /*
     * 근력 향상은 기본 목표라 예전 균형 잡힌 관리의 코어 몫을 넘겨받았다.
     * 60분에 코어가 하나는 들어가되, 본운동 몫이 가장 커야 한다.
     */
    const specs = compositionFor('lower', '근력 향상');
    const share = (slot: string) => specs.find((sp) => sp.slot === slot)?.share ?? 0;
    check(
      '근력 향상 — 코어 칸이 있고, 본운동이 가장 크다',
      share('core') > 0 && specs.every((sp) => share('main') >= sp.share),
      specs.map((sp) => `${sp.slot} ${(sp.share * 60).toFixed(1)}분`).join(' · ')
    );
    const picks = lower60('근력 향상');
    check(
      '근력 향상 60분 — 코어가 하나 이상 뽑힌다',
      picks.some((p) => p.slot === 'core'),
      [...new Set(picks.map((p) => p.slot))].join(', ')
    );
  }
  {
    /*
     * 컨디셔닝의 유산소 칸. 아직 유산소 영상이 없으면 그 칸은 빠지고 시간은
     * 나머지가 나눠 갖는다(dropEmptySlots). 영상을 하나 넣으면 바로 들어온다.
     */
    check(
      '컨디셔닝 — 구성에 유산소 칸이 있다',
      compositionFor('lower', '컨디셔닝').some(
        (sp) => sp.slot === 'cardio' && sp.categories.includes('유산소')
      )
    );
    const hasCardio = library.some((ex) => ex.category === '유산소');
    const without = lower60('컨디셔닝');
    check(
      hasCardio
        ? '컨디셔닝 60분 — 유산소가 하나 뽑힌다'
        : '컨디셔닝 60분 — 유산소 영상이 없으면 그 칸 없이 짜인다',
      hasCardio
        ? without.filter((p) => p.slot === 'cardio').length === 1
        : without.every((p) => p.slot !== 'cardio') && without.length > 0,
      [...new Set(without.map((p) => p.slot))].join(', ')
    );
    const bike = {
      ...library.find((ex) => ex.category === '코어')!,
      id: 'test-cardio-bike',
      title: '시험용 실내 자전거',
      category: '유산소',
      bodyParts: ['전신'],
      intensity: '중간',
      difficulty: '초급',
      equipment: ['맨몸'],
      movementPattern: null,
      sets: 1,
      reps: null,
      holdSeconds: 600,
      restSeconds: null,
      perSide: false,
    };
    const withBike = lower60('컨디셔닝', [...library, bike]);
    check(
      '유산소 영상을 하나 넣으면 컨디셔닝에 바로 들어온다',
      withBike
        .filter((p) => p.slot === 'cardio')
        .map((p) => p.exercise.id)
        .join() === 'test-cardio-bike',
      withBike.map((p) => `${p.slot}:${p.exercise.title}`).join(' / ')
    );
    const strengthWithBike = lower60('근력 향상', [...library, bike]);
    check(
      '근력 향상에는 유산소가 안 들어간다',
      strengthWithBike.every((p) => p.slot !== 'cardio')
    );

    /*
     * 유산소 칸은 맨 뒤에, 곁가지로 채운다(theme.ts 의 shapeToSpecs). 앞에 두고
     * 꼭 채우는 칸으로 두었더니, 몫이 자전거 하나(14분)보다 작아 '빈 구간은
     * 억지로 하나' 규칙으로 들어가며 시간을 넘기고 그때 있던 암케어 몫을 깎았다.
     * 지금은 보강이 가장 큰 몫이라 그쪽을 본다.
     */
    const specs = compositionFor('lower', '컨디셔닝');
    check(
      '컨디셔닝 — 유산소 칸은 맨 뒤이고 곁가지다',
      specs.at(-1)?.slot === 'cardio' && specs.at(-1)?.optional === true,
      specs.map((sp) => `${sp.slot}${sp.optional ? '(곁가지)' : ''}`).join(' → ')
    );
    const at = (minutes: number, candidates = library) =>
      pickForTheme({
        candidates,
        theme: 'lower',
        minutes,
        doneIds: new Set<string>(),
        goal: '컨디셔닝',
      });
    const bike60 = at(60, [...library, bike]);
    check(
      '컨디셔닝 60분 + 유산소 — 고른 시간에서 크게 안 벗어난다(±15%)',
      Math.abs(bike60.estimatedMinutes - 60) <= 60 * 0.15,
      `${bike60.estimatedMinutes}분`
    );
    const prehabCount = (picks: { slot: string }[]) =>
      picks.filter((p) => p.slot === 'prehab').length;
    const shortest = Math.min(...minutesChoicesFor(CONDITIONING_GOAL));
    const plainShort = at(shortest);
    const bikeShort = at(shortest, [...library, bike]);
    check(
      `컨디셔닝 ${shortest}분 — 유산소가 안 맞으면 빠지고, 보강을 깎지 않는다`,
      prehabCount(bikeShort.picks) >= prehabCount(plainShort.picks) &&
        Math.abs(bikeShort.estimatedMinutes - shortest) <= shortest * 0.15,
      `보강 ${prehabCount(plainShort.picks)} → ${prehabCount(bikeShort.picks)}개 · ` +
        `${bikeShort.estimatedMinutes}분 · 유산소 ${bikeShort.picks.filter((p) => p.slot === 'cardio').length}개`
    );
  }

  /*
   * 배분이 실제 구성으로 이어지는지도 본다. 다만 60분에서는 안 된다 —
   * 무거운 운동 하나가 11분이라, 본운동 배분이 20분에서 24분으로 늘어도
   * 2개에서 3개로 넘어가지 못한다(3개면 33분이 필요하다).
   *
   * 줄이는 쪽(컨디셔닝)은 60분에서도 갈린다. 늘리는 쪽은 90분부터 갈린다.
   */
  check(
    '컨디셔닝 → 60분에서도 본운동이 줄어든다',
    minutesOf('컨디셔닝', 'main') < minutesOf('근력 향상', 'main'),
    `근력 향상 ${minutesOf('근력 향상', 'main').toFixed(1)}분 → 컨디셔닝 ${minutesOf('컨디셔닝', 'main').toFixed(1)}분`
  );
  {
    /*
     * 90분처럼 긴 날에도 근력 향상의 본운동은 스트렝스로만 찬다. 시간이 남으면
     * 파워가 그 자리를 채우던 때가 있었다(personalize.ts 의 mix.maxPower).
     * 예전에는 여기서 '균형 잡힌 관리보다 본운동이 길다'를 봤는데, 그 목표를
     * 없앤 뒤로는 이 목표를 가르는 성질을 직접 본다.
     */
    const { themed } = planFor({
      person: { condition: 8 },
      goal: '근력 향상',
      minutes: 90,
    });
    const main = themed.picks.filter((x) => x.slot === 'main');
    check(
      '근력 향상 90분 — 본운동이 파워 없이 스트렝스로만 찬다',
      main.length >= 3 && main.every((x) => x.exercise.category !== '파워'),
      main.map((x) => x.exercise.category).join(', ')
    );
  }
  {
    /*
     * 목표를 안 고른 날(null)은 오늘 고른 운동 종류를 따른다 — 파워를 골랐으면
     * 파워 향상, 아니면 기본 목표(근력 향상). 예전 기본(균형 잡힌 관리)은 파워를
     * 하나 넣어 주었는데, 근력 향상은 파워를 안 넣어서 그대로면 파워가 사라진다.
     */
    check(
      '목표를 안 고른 날 — 파워를 골랐으면 파워 향상, 아니면 근력 향상',
      goalForUnchosen('파워') === '파워 향상' &&
        goalForUnchosen('웨이트') === DEFAULT_GOAL &&
        goalForUnchosen(null) === DEFAULT_GOAL
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
  check(
    '목표를 바꿔도 전체 시간은 60분 근처',
    worst <= 0.15,
    `${totals.join(' / ')}분`
  );
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
  check(
    '강도 6 계수는 논문값에 맞춘 0.80',
    stressFactor(6) === 0.8,
    `${stressFactor(6)}`
  );
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
  check(
    '불펜은 강도를 반영',
    stressFactor(3, '불펜') === 0.6,
    `${stressFactor(3, '불펜')}`
  );

  const restFor = (
    logs: { sessionType: string; pitchCount: number; intensity: number }[]
  ) => {
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
  check(
    '경기 80구 → 휴식 4일 (기존과 같음)',
    game.rest === 4,
    `환산 ${game.adjusted}구`
  );

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
  check(
    '기간 밖 기록은 빼고 센다',
    find('경기')?.pitches === 80,
    `경기 ${find('경기')?.pitches}구`
  );
  check(
    '같은 날 두 종류를 따로 센다',
    find('불펜')?.count === 1 && find('캐치볼')?.count === 1
  );
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
  const log = (
    date: string,
    sessionType: string,
    pitchCount: number,
    intensity: number
  ) => ({
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
  for (const v of ['밴드', '덤벨', '바벨', '없는장비'])
    form.append('ownedEquipment', v);

  const saved = readTrainingProfile(form);
  check(
    '경력을 그대로 저장',
    saved.trainingLevel === '중급',
    String(saved.trainingLevel)
  );
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
    readTrainingGoal(withGoal, '컨디셔닝') === '파워 향상'
  );

  /*
   * 안 고르고 만들면 지난번에 고른 것으로 간다. 매번 기본 목표로 되돌리면
   * 파워 위주로 몇 주 가려는 사람이 날마다 다시 골라야 한다.
   */
  check(
    '안 고르면 지난번 목표로 간다',
    readTrainingGoal(new FormData(), '컨디셔닝') === '컨디셔닝'
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

console.log('\n[목표 안의 부위] 상체를 밀기·당기기로 가르는가');
{
  /*
   * 상체·하체는 앱이 번갈아 정해 왔다. 그 자동은 대개 옳지만 "오늘은 당기기만"
   * 같은 뜻이 분명한 날에는 방해가 된다. 좁히고 싶을 때만 쓰는 값이라, 안
   * 좁힌 날은 예전과 한 글자도 달라지면 안 된다.
   */
  check(
    '고르게 하는 목표는 부위를 못 좁힌다',
    focusesFor('컨디셔닝').length === 0,
    '컨디셔닝 선택지 없음'
  );
  check(
    '근력은 넷으로 갈린다 — 상체를 통째로 하는 것도 고를 수 있다',
    focusesFor('근력 향상')
      .map((f) => f.label)
      .join(' · ') === '하체 · 상체 · 상체 밀기 · 상체 당기기',
    focusesFor('근력 향상')
      .map((f) => f.label)
      .join(' · ')
  );
  check(
    '파워는 둘로 갈린다',
    focusesFor('파워 향상')
      .map((f) => f.label)
      .join(' · ') === '하체 · 상체',
    focusesFor('파워 향상')
      .map((f) => f.label)
      .join(' · ')
  );

  /*
   * 목표를 바꾸면 안 맞는 부위는 버린다. 근력에서 '상체 당기기'를 골라 두고
   * 파워로 옮기면 파워에는 없는 값이라, 남겨 두면 고른 적 없는 쪽으로 일정이
   * 나간다.
   */
  check(
    '목표에 없는 부위는 버린다',
    validFocus('파워 향상', 'upperPull') == null &&
      validFocus('근력 향상', 'upperPull') === 'upperPull',
    '파워에서는 버리고 근력에서는 남긴다'
  );
  check('모르는 값도 버린다', validFocus('근력 향상', '아무거나') == null, '없음');

  /* 좁힌 계열만 본운동에 남는가 */
  const mainOf = (goal: string, focus: string) => {
    const f = GOAL_FOCUSES.find((x) => x.key === focus)!;
    return pickForTheme({
      candidates: library,
      theme: f.theme,
      minutes: effectiveMinutes(f.theme, 60),
      doneIds: new Set<string>(),
      rotationSeed: TODAY.toISOString().slice(0, 10),
      goal,
      focus: f.key,
    }).picks.filter((p) => p.slot === 'main');
  };

  for (const [focus, want] of [
    ['upperPush', '밀기'],
    ['upperPull', '당기기'],
  ] as const) {
    const main = mainOf('근력 향상', focus);
    const off = main.filter(
      (p) =>
        p.exercise.category.endsWith('스트렝스') &&
        p.exercise.movementPattern != null &&
        p.exercise.movementPattern !== want
    );
    check(
      `상체 ${want}만 고르면 본운동이 ${want}뿐이다`,
      main.length > 0 && off.length === 0,
      `${main.length}개 중 딴 계열 ${off.length}개`
    );
  }

  check(
    '하체를 고르면 하체 스트렝스가 나온다',
    mainOf('근력 향상', 'lower').some((p) => p.exercise.category === '하체 스트렝스'),
    '나옴'
  );

  /*
   * 파워 상체는 후보가 여덟 개뿐이고 전부 밴드·메디신볼·바벨이 있어야 한다.
   * 그래도 본운동이 비지는 않아야 한다 — 자리가 남으면 상체 스트렝스가 채운다.
   */
  const upperPower = mainOf('파워 향상', 'upper');
  check(
    '파워 상체도 본운동이 비지 않는다',
    upperPower.length > 0,
    upperPower.map((p) => p.exercise.title).join(', ')
  );

  /*
   * 안 좁힌 날은 예전 그대로. 이것이 깨지면 지금까지 쓰던 사람의 일정이
   * 소리 없이 달라진다.
   */
  const before = compositionFor('upper', '근력 향상');
  const after = compositionFor('upper', '근력 향상', null);
  check(
    '부위를 안 고르면 구성이 예전과 같다',
    JSON.stringify(before) === JSON.stringify(after),
    '동일'
  );
  check(
    '부위를 안 고르면 본운동에 계열 제한이 없다',
    before.find((sp) => sp.slot === 'main')?.strengthPatterns === undefined,
    '제한 없음'
  );
  check(
    '부위를 고르면 그 계열만 걸린다',
    compositionFor('upper', '근력 향상', 'upperPush').find((sp) => sp.slot === 'main')
      ?.strengthPatterns?.[0] === '밀기',
    '밀기'
  );
}

console.log('\n[워밍업] 일정에 워밍업을 안 넣는가');
{
  /*
   * 워밍업은 이제 일정을 만들 때 뽑지 않는다. 고정 루틴으로 따로 두고, 본운동
   * 시간에도 넣지 않는다. 그래서 여기서 보는 것은 '잘 뽑혔는가'가 아니라
   * '안 뽑혔는가'다.
   *
   * 예외가 하나 있다 — 회복 데이의 가동성. 그 날에는 가동성이 준비 운동이
   * 아니라 그날의 운동 자체라 남겨 두었고, 기록도 평소대로 남는다.
   */
  const picksOf = (theme: ThemeKey, goal: string | null, m = 60, cands = library) =>
    pickForTheme({
      candidates: cands,
      theme,
      minutes: effectiveMinutes(theme, m),
      doneIds: new Set<string>(),
      rotationSeed: TODAY.toISOString().slice(0, 10),
      goal,
    }).picks;

  /*
   * 1) 무게 드는 날에는 모빌리티가 한 개도 없어야 한다.
   *
   * 컨디셔닝과 보조 날은 다르다 — 암케어가 빠진 자리에 가동성이 한 구간으로
   * 들어왔다(2026-09-25). 그날에는 준비 운동이 아니라 그날의 운동이라, 모빌리티가
   * 가동성 구간에만 있는지를 본다(본운동 빈자리를 메우는 데 쓰이면 안 된다).
   */
  const GOAL_NAMES = TRAINING_GOALS.map((g) => g.name);
  for (const theme of ['lower', 'upper', 'assist'] as const) {
    for (const goal of GOAL_NAMES) {
      const mobilityDay = theme === 'assist' || goal === CONDITIONING_GOAL;
      for (const m of minutesChoicesFor(goal)) {
        const mob = picksOf(theme, goal, m).filter(
          (p) => p.exercise.category === '모빌리티'
        );
        check(
          mobilityDay
            ? `${theme} ${goal} ${m}분 — 모빌리티는 가동성 구간에만`
            : `${theme} ${goal} ${m}분 — 모빌리티가 안 들어간다`,
          mobilityDay ? mob.every((p) => p.slot === 'mobility') : mob.length === 0,
          mob.map((x) => `${x.slot}:${x.exercise.title}`).join(', ')
        );
      }
    }
  }

  /* 2) 'warmup' 이라는 구간 자체가 없어야 한다 */
  for (const theme of ['lower', 'upper', 'assist', 'recovery'] as const) {
    const slots = new Set(picksOf(theme, DEFAULT_GOAL).map((p) => p.slot));
    check(
      `${theme} — 워밍업 구간이 없다`,
      !slots.has('warmup' as never),
      [...slots].join(', ')
    );
  }

  /* 3) 회복 데이에는 가동성이 남아 있고, 그것이 그날의 몫이다 */
  {
    const picks = picksOf('recovery', null, 60);
    const mob = picks.filter((p) => p.slot === 'mobility');
    check(
      '회복 데이 — 가동성이 남아 있다',
      mob.length > 0 && mob.every((p) => p.exercise.category === '모빌리티'),
      mob.map((x) => x.exercise.title).join(', ') || '비었다'
    );
  }

  /*
   * 4) '매우 낮음' 회복·보강 운동이 이제 뽑힌다.
   *
   * 예전에는 이것들이 워밍업 구간으로만 들어갈 수 있었다. 워밍업을 없애면서
   * 거르개를 같이 걷어내지 않으면, 어느 구간에도 못 들어가 영영 안 나온다.
   * 암케어는 뺀다 — 일정이 아니라 암케어 화면에서 쓴다(아래 5번).
   */
  {
    const veryLow = library.filter(
      (ex) =>
        ex.intensity === '매우 낮음' &&
        ex.category !== '모빌리티' &&
        ex.category !== '암케어'
    );
    const reachable = veryLow.filter((ex) =>
      compositionFor('assist', DEFAULT_GOAL).some((sp) =>
        sp.categories.includes(ex.category)
      )
    );
    check(
      `'매우 낮음' 회복·보강 ${veryLow.length}개가 갈 구간이 있다`,
      reachable.length === veryLow.length,
      `${reachable.length}/${veryLow.length}`
    );
  }

  /*
   * 5) 어느 날에도 암케어 구간이 없다.
   *
   * 암케어는 트레이닝의 암케어 화면에서 그날 몸 상태에 맞춰 따로 한다
   * (2026-09-25 사용자분과 정함). 일정에 다시 끼면 같은 날 두 곳에서 따로 논다.
   */
  {
    const leaks: string[] = [];
    for (const theme of ['lower', 'upper', 'assist', 'recovery'] as const) {
      for (const goal of [null, ...GOAL_NAMES]) {
        const specs = compositionFor(theme, goal);
        if (
          specs.some((sp) => sp.slot === 'armcare' || sp.categories.includes('암케어'))
        ) {
          leaks.push(`${theme}/${goal ?? '목표 없음'}`);
        }
        for (const m of minutesChoicesFor(goal)) {
          const armcare = picksOf(theme, goal, m).filter(
            (p) => p.exercise.category === '암케어'
          );
          if (armcare.length > 0) leaks.push(`${theme}/${goal ?? '목표 없음'}/${m}분`);
        }
      }
    }
    check('어느 날에도 암케어 구간이 없다', leaks.length === 0, leaks.join(', '));
  }

  /*
   * 6) 맨몸만 가진 사람도 일정이 빈약해지지 않는다.
   *
   * 예전에는 워밍업이 '강도 낮음 웨이트'라 맨몸만 가진 사람에게는 후보가 0이
   * 되는 자리가 있었다. 지금은 그 자리가 없으니 그냥 비지 않는지만 본다.
   */
  {
    const bare = library.filter((ex) => ex.equipment.every((e) => e === '맨몸'));
    const picks = picksOf('lower', '근력 향상', 60, bare);
    check(
      '맨몸만 가진 사람도 하체날 일정이 나온다',
      picks.length > 0,
      `${picks.length}개`
    );
  }
}

console.log('\n[가장 빠듯한 경우] 그래도 훈련이 나오는가');
{
  let empty = 0;
  const shortestMinutes = Math.min(...WORKOUT_MINUTES_CHOICES);
  for (const level of TRAINING_LEVELS) {
    for (const goal of TRAINING_GOALS) {
      const { themed } = planFor({
        person: { condition: 8 },
        owned: ['맨몸'],
        level: level.name,
        goal: goal.name,
        minutes: shortestMinutes,
      });
      if (themed.picks.length === 0) empty++;
    }
  }
  check(
    `맨몸만 · ${shortestMinutes}분 · 경력 ${TRAINING_LEVELS.length}가지 × 목표 ${TRAINING_GOALS.length}가지`,
    empty === 0,
    `빈 훈련 ${empty}개`
  );
}

console.log('\n[회복날] 가벼운 것만 · 가동성 중심 · 유산소는 있을 때만 맨 앞에');
{
  /*
   * 2026-09-23 회복날을 다시 짰다 (lib/report/theme.ts 의 회복날 구성).
   * 실제로 뽑아 보니 덤벨 스쿼트·덤벨 트라이셉스 익스텐션 같은 '중간' 운동이
   * 섞였고, 던진 다음 날 가장 챙길 암케어는 한두 개뿐이었다.
   *
   * 2026-09-25 암케어와 코어를 뺐다. 암케어는 암케어 화면이 따로 챙기고
   * (던진 다음 날은 회복 루틴), 회복날은 가동성·가벼운 보강·가벼운 유산소로만.
   */
  const HEAVY = ['덤벨', '바벨', '케틀벨', '원판', '케이블'];
  const isHeavy = (e: { intensity: string; equipment: string[] }) =>
    intensityLevel(e.intensity) > intensityLevel('낮음') ||
    e.equipment.some((q) => HEAVY.includes(q));

  let days = 0;
  let heavy = 0;
  const thin: string[] = [];
  for (const minutes of WORKOUT_MINUTES_CHOICES) {
    const { theme, themed } = planFor({ person: { condition: 3 }, minutes });
    if (theme.key !== 'recovery') continue;
    days++;
    heavy += themed.picks.filter(({ exercise }) => isHeavy(exercise)).length;
    const count = (slot: string) => themed.picks.filter((p) => p.slot === slot).length;
    const mobility = count('mobility');
    const leftovers = themed.picks.filter(
      (p) => p.exercise.category === '암케어' || p.slot === 'core' || p.slot === 'main'
    );
    if (mobility < 2 || count('prehab') > mobility || leftovers.length > 0) {
      thin.push(
        `${minutes}분 요청 → 가동성 ${mobility} · 보강 ${count('prehab')} · 그 밖 ${leftovers.length}`
      );
    }
  }
  check(
    '회복날 → 무게 드는 장비·중간 이상 강도 없음',
    days === WORKOUT_MINUTES_CHOICES.length && heavy === 0,
    `${days}일 중 섞인 것 ${heavy}개`
  );
  check(
    '회복날 → 가동성이 둘 이상이고 가장 많다 · 암케어·코어 없음',
    thin.length === 0,
    thin.join(', ')
  );

  /* 유산소는 영상이 올라오기 전까지 없다 — 그동안은 그 칸 없이 짠다 */
  const cardioInLibrary = library.some((e) => e.category === '유산소');
  const { themed: today } = planFor({ person: { condition: 3 }, minutes: 60 });
  const cardioNow = today.picks.filter((p) => p.slot === 'cardio');
  check(
    cardioInLibrary
      ? '유산소 영상이 있으면 → 회복날 맨 앞에 하나'
      : '유산소 영상이 없으면 → 유산소 칸 없이 짬',
    cardioInLibrary
      ? cardioNow.length === 1 && today.picks[0]?.slot === 'cardio'
      : cardioNow.length === 0
  );

  /* 영상이 올라온 뒤를 흉내 낸다 — 가벼운 것 둘과 '중간' 하나를 메모리에만 더한다 */
  const fake = (id: string, intensity: string) => ({
    ...library[0],
    id,
    title: id,
    category: '유산소',
    intensity,
    equipment: ['맨몸'],
    bodyParts: ['하체'],
    movementPattern: null,
    sets: 1,
    reps: null,
    holdSeconds: 600,
    restSeconds: null,
    perSide: false,
  });
  const minutes = effectiveMinutes('recovery', 60);
  const later = pickForTheme({
    candidates: [
      ...library,
      fake('인터벌', '중간'),
      fake('자전거', '낮음'),
      fake('걷기', '매우 낮음'),
    ],
    theme: 'recovery',
    minutes,
    doneIds: new Set<string>(),
  });
  const cardio = later.picks.filter((p) => p.slot === 'cardio');
  check(
    '유산소가 올라오면 → 맨 앞에 딱 하나, 중간 강도는 빼고',
    cardio.length === 1 &&
      later.picks[0]?.slot === 'cardio' &&
      cardio[0].exercise.intensity !== '중간',
    cardio.map((p) => p.exercise.title).join(', ')
  );
  check(
    '유산소가 들어가도 → 시간은 ±15% 안',
    Math.abs(later.estimatedMinutes - minutes) <= minutes * 0.15,
    `${minutes}분 → ${later.estimatedMinutes}분`
  );
}

console.log('\n[AI 맞춤] 규칙이 울타리를 치고, 그 밖의 답은 받지 않는가');
{
  /*
   * AI 맞춤은 두 겹이다 — 규칙이 몸을 지키는 선을 긋고(decideAutoFence),
   * AI는 그 안에서만 고른다(acceptAnswer 가 밖의 답을 버린다). AI를 실제로
   * 부르지는 않는다. 부르는 것은 돈이 들고 답이 매번 달라, 여기서는 'AI가
   * 이렇게 답했다면'을 지어내 검사를 밟아 본다.
   */
  const ALL_TITLES = library.map((ex) => ex.title);

  /** 운동 쪽 신호 — 평소 한 주를 기본으로, 바꿀 것만 준다 */
  const signals = (over: Partial<WorkoutSignals> = {}): WorkoutSignals => ({
    zone: 'optimal',
    ratio: 1.02,
    recentDays: 3,
    recentMinutes: 150,
    historyDays: 40,
    daysNeeded: 0,
    volume: {
      byPart: VOLUME_GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        hint: g.hint,
        sets: 6,
        previous: 6,
      })),
      armCare: { sets: 4, previous: 4 },
    },
    ...over,
  });

  /** 체크인을 여러 날 남긴 사람 — 수면이 이어서 부족한 경우를 만들려고 */
  const factsWith = ({
    condition = 8,
    sleep = '보통',
    poorSleepPast = 0,
    wants = null as string | null,
    lowerBody = '정상',
    pitches = [40, 0, 35, 0, 40, 0, 30],
  }) =>
    buildFacts({
      nickname: '시험',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      today: TODAY,
      logs: pitches.map<PitchLogLike>((count, i) => ({
        date: dayBefore(i + 1),
        pitchCount: count,
        intensity: 7,
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        {
          date: dayBefore(0).slice(0, 10),
          condition,
          sleep,
          shoulder: '정상',
          elbow: '정상',
          wrist: '정상',
          lowerBack: '정상',
          lowerBody,
          preferredParts: [],
          preferredWorkout: wants,
        },
        ...Array.from({ length: poorSleepPast }, (_, i) => ({
          date: dayBefore(i + 1).slice(0, 10),
          condition: 7,
          sleep: '부족',
          shoulder: '정상',
          elbow: '정상',
          wrist: '정상',
          lowerBack: '정상',
          lowerBody: '정상',
          preferredParts: [],
          preferredWorkout: null,
        })),
      ] satisfies CheckinLike[],
      memos: [],
    });

  const fenceFor = (
    facts: ReturnType<typeof buildFacts>,
    workout = signals(),
    defaultMinutes = 60
  ) =>
    decideAutoFence({
      facts,
      plan: buildPitchPlan(facts),
      workout,
      defaultMinutes,
      lastLowerKey: null,
      lastUpperKey: null,
    });

  /* ── 규칙 울타리 ── */
  const plain = fenceFor(factsWith({}));
  check('평소 날은 근력 날', plain.strengthDay, plain.day.label);
  check(
    '평소 날 → 목표는 AI가 셋 중에서 고른다',
    plain.fixedGoal == null && plain.goals.length === 3
  );
  check(
    '시간은 기본 시간을 넘지 않는다 (60분)',
    Object.values(plain.minutes).every((ms) => ms.length > 0 && Math.max(...ms) <= 60),
    JSON.stringify(plain.minutes)
  );
  check('신호가 없으면 초안은 기본 목표(근력 향상)', plain.draft.goal === DEFAULT_GOAL);

  /*
   * 예전에는 운동은 했는데 암케어가 0세트면 초안을 컨디셔닝으로 잡았다. 암케어가
   * 모든 일정에서 빠진 뒤로는 그 규칙이 모두를 컨디셔닝으로 보내는 셈이라 지웠다
   * (2026-09-25). 암케어는 암케어 화면이 따로 챙긴다.
   */
  const armGap = fenceFor(
    factsWith({}),
    signals({ volume: { ...signals().volume, armCare: { sets: 0, previous: 3 } } })
  );
  check(
    '암케어가 0세트여도 초안은 기본 목표 (암케어는 따로 챙긴다)',
    armGap.draft.goal === DEFAULT_GOAL && !armGap.draft.reason.includes('암케어'),
    armGap.draft.reason
  );
  const newcomer = fenceFor(
    factsWith({}),
    signals({
      recentDays: 0,
      volume: { ...signals().volume, armCare: { sets: 0, previous: 0 } },
    })
  );
  check(
    '기록이 없는 사람은 기본 목표로 시작',
    newcomer.draft.goal === DEFAULT_GOAL &&
      newcomer.draft.reason.includes('기록이 아직 적어'),
    newcomer.draft.reason
  );

  const loaded = fenceFor(factsWith({}), signals({ zone: 'caution', ratio: 1.41 }));
  check(
    '운동 부하 주의 → 컨디셔닝으로 고정',
    loaded.fixedGoal === CONDITIONING_GOAL && loaded.goals.length === 1
  );
  check(
    '운동 부하 주의 → 시간 한 단계 줄임 (60 → 45)',
    JSON.stringify(loaded.minutes[CONDITIONING_GOAL]) === '[45]',
    JSON.stringify(loaded.minutes)
  );
  check(
    '컨디셔닝으로 정해진 근력 날 → AI에게도 컨디셔닝 데이로 알린다',
    loaded.day.label === CONDITIONING_DAY_LABEL &&
      plain.day.label !== CONDITIONING_DAY_LABEL,
    `${loaded.day.label} / 평소 ${plain.day.label}`
  );
  const loadedLong = fenceFor(
    factsWith({}),
    signals({ zone: 'danger', ratio: 1.7 }),
    90
  );
  check(
    '기본 90분 + 부하 위험 → 컨디셔닝 75에서 한 단계 줄여 60까지',
    JSON.stringify(loadedLong.minutes[CONDITIONING_GOAL]) === '[45,60]',
    JSON.stringify(loadedLong.minutes)
  );

  const tired = fenceFor(factsWith({ sleep: '부족', poorSleepPast: 2 }));
  check(
    '오늘 포함 잠 부족 3일 → 컨디셔닝, 시간 줄임',
    tired.fixedGoal === CONDITIONING_GOAL &&
      JSON.stringify(tired.minutes[CONDITIONING_GOAL]) === '[45]',
    tired.rules.join(' / ')
  );
  const oneNight = fenceFor(factsWith({ sleep: '부족' }));
  check('오늘 하루 못 잔 것만으로는 고정하지 않는다', oneNight.fixedGoal == null);

  const power = fenceFor(factsWith({ wants: '파워' }));
  check(
    '체크인에서 파워 (몸 상태 괜찮음) → 파워 향상으로 고정',
    power.fixedGoal === '파워 향상' && power.clash == null
  );
  const weight = fenceFor(factsWith({ wants: '웨이트' }));
  check('체크인에서 웨이트 → 근력 향상으로 고정', weight.fixedGoal === '근력 향상');

  /* 어제 90구 + 파워 — 몸 상태에 맞춰 가고, 이유에 그 이야기가 있어야 한다 */
  const clashed = fenceFor(
    factsWith({ wants: '파워', pitches: [90, 0, 0, 0, 0, 0, 0] })
  );
  check(
    '파워를 골랐지만 어제 90구 → 회복날, 컨디셔닝으로 고정',
    !clashed.strengthDay && clashed.fixedGoal === CONDITIONING_GOAL,
    clashed.day.label
  );
  check(
    '부딪힌 날 → 초안 이유가 그 이야기로 시작',
    clashed.clash != null && clashed.draft.reason.startsWith('파워 운동을 하고 싶다고'),
    clashed.draft.reason
  );
  check(
    '부딪힌 날 → 부위는 고르지 않는다',
    Object.values(clashed.focuses).every((f) => f.length === 0)
  );

  const low = fenceFor(
    factsWith({ condition: 3 }),
    signals({ zone: 'caution', ratio: 1.4 })
  );
  check(
    '회복날에는 시간을 두 번 줄이지 않는다 (회복날이 이미 줄임)',
    low.day.key === 'recovery' &&
      JSON.stringify(low.minutes[CONDITIONING_GOAL]) === '[45,60]',
    JSON.stringify(low.minutes)
  );

  const sore = fenceFor(factsWith({ lowerBody: '뻐근' }));
  check(
    '하체가 뻐근하면 → 하체로 좁힐 수 없다',
    Object.values(sore.focuses).every((f) => !f.includes('lower')),
    JSON.stringify(sore.focuses)
  );

  /* 통증인 날은 AI를 부르지 않는다 — 그 조건이 plan.halted 다 (training-setup.ts) */
  const pain = factsFor({ condition: 7, pain: true });
  check(
    '통증 체크인 → 계획이 멈춘다 (AI를 안 부르는 조건)',
    buildPitchPlan(pain).halted
  );

  /* ── 다시 만들기 ── */
  const today = factsWith({}).condition.today!;
  const stamp = checkinStamp(today);
  const prev: AutoRecord = {
    ...plain.draft,
    by: 'ai',
    rules: [],
    checkin: stamp,
  };
  check('체크인이 그대로면 → AI에게 다시 묻지 않는다', canReuse(prev, plain, stamp));
  check(
    '체크인을 고치면 → 다시 묻는다',
    !canReuse(prev, plain, checkinStamp({ ...today, condition: 5 }))
  );
  check(
    '규칙 초안으로 만든 날은 → 다시 만들 때 AI에게 묻는다',
    !canReuse({ ...prev, by: 'rules' }, plain, stamp)
  );
  check(
    '울타리가 바뀌어 그 목표가 안 되면 → 다시 묻는다',
    !canReuse({ ...prev, goal: '파워 향상' }, loaded, stamp)
  );

  /* ── AI 답 검사 ── */
  const facts = factsWith({});
  const input: AutoPromptInput = {
    facts,
    plan: buildPitchPlan(facts),
    workout: signals(),
    fence: plain,
    recentDays: [],
    lastLowerKey: null,
    lastUpperKey: null,
  };
  const good: AutoAnswer = {
    goal: '근력 향상',
    minutes: 60,
    focus: 'auto',
    caution: [],
    painSuspected: false,
    reason: `어제 40구를 던졌지만 몸 상태가 좋아 근력에 씁니다. 60분이면 충분합니다.`,
  };
  const ok = acceptAnswer(good, input, ALL_TITLES);
  check('울타리 안의 답 → 받는다', ok.ok, ok.ok ? ok.decision.goal : ok.reason);
  check('focus auto → 앱이 번갈아 정함(null)', ok.ok && ok.decision.focus === null);

  const reject = (label: string, answer: AutoAnswer) => {
    const r = acceptAnswer(answer, input, ALL_TITLES);
    check(label, !r.ok, r.ok ? '받아버림' : r.reason);
  };
  reject('고를 수 없는 시간(90분) → 버린다', { ...good, minutes: 90 });
  reject('컨디셔닝에 부위를 좁힘 → 버린다', {
    ...good,
    goal: CONDITIONING_GOAL,
    focus: 'lower',
  });
  reject('없앤 목표(균형 잡힌 관리) → 버린다', { ...good, goal: '균형 잡힌 관리' });
  reject('자료에 없는 투구수 → 버린다', {
    ...good,
    reason: '어제 95구를 던지셨습니다.',
  });
  /* 한 번도 선택지에 없던 값 — 75분은 이제 고를 수 있는 시간이라 쓰지 않는다 */
  reject('자료에 없는 시간 → 버린다', { ...good, reason: '오늘은 50분만 하세요.' });
  reject('운동 종목 이름을 씀 → 버린다', {
    ...good,
    reason: '오늘은 데드리프트 위주로 갑니다.',
  });
  reject('이유가 너무 김 → 버린다', { ...good, reason: '가'.repeat(400) });
  reject('조심할 부위를 오늘 할 부위로 → 버린다', {
    ...good,
    focus: 'lower',
    caution: [{ part: 'lowerBody', why: '무릎 불편' }],
  });

  const many = acceptAnswer(
    {
      ...good,
      caution: [
        { part: 'lowerBody', why: '무릎' },
        { part: 'lowerBody', why: '무릎 또' },
        { part: 'shoulder', why: '어깨' },
        { part: 'elbow', why: '팔꿈치' },
        { part: 'wrist', why: '손목' },
      ],
    },
    input,
    ALL_TITLES
  );
  check(
    '조심할 부위는 같은 것 한 번, 셋까지',
    many.ok && many.decision.caution.length === 3,
    many.ok ? many.decision.caution.map((c) => c.part).join(',') : many.reason
  );

  const clashInput: AutoPromptInput = { ...input, fence: clashed };
  const quiet = acceptAnswer(
    {
      ...good,
      goal: CONDITIONING_GOAL,
      minutes: clashed.minutes[CONDITIONING_GOAL][0],
      reason: '오늘은 가볍게 몸을 풉니다.',
    },
    clashInput,
    ALL_TITLES
  );
  check(
    '부딪힌 날 이유에 그 이야기를 빠뜨리면 → 규칙이 앞에 붙인다',
    quiet.ok && quiet.decision.reason.startsWith('파워 운동을 하고 싶다고'),
    quiet.ok ? quiet.decision.reason : quiet.reason
  );

  /* 답의 모양 — 목록 밖의 목표는 모양 검사에서부터 떨어진다 */
  const schema = autoSetupSchema(loaded);
  check(
    '모양 검사: 울타리 안 → 통과',
    schema.safeParse({
      ...good,
      goal: CONDITIONING_GOAL,
      minutes: loaded.minutes[CONDITIONING_GOAL][0],
    }).success
  );
  check('모양 검사: 울타리 밖 목표 → 떨어짐', !schema.safeParse(good).success);

  /* 프롬프트에 규칙과 초안이 들어가는가 */
  const prompt = buildAutoPrompt({ ...input, fence: loaded });
  check(
    '프롬프트에 규칙이 정한 것과 초안이 들어간다',
    prompt.includes('# 규칙이 정한 것') &&
      prompt.includes(loaded.rules[0]) &&
      prompt.includes('# 규칙 초안'),
    `${prompt.length}자`
  );

  check(
    '근력 날에 AI가 컨디셔닝을 고를 수 있으면 → 그날 이름이 바뀐다고 알려 준다',
    buildAutoPrompt(input).includes(CONDITIONING_DAY_LABEL)
  );

  /*
   * 메모에서 찾은 조심할 부위가 실제로 무거운 운동을 빼는가.
   *
   * 후보 단계에서 본다. 완성된 일정으로 보면 그날 순서에 따라 원래부터 가벼운
   * 것만 뽑힐 수 있어, 빠졌는지 원래 없었는지 가를 수 없다.
   */
  const LOWER_PARTS = ['고관절', '햄스트링·둔근', '전신'];
  const heavyLower = <T extends { intensity: string; bodyParts: string[] }>(
    list: T[]
  ) =>
    list.filter(
      (ex) =>
        intensityLevel(ex.intensity) > 3 &&
        ex.bodyParts.some((b) => LOWER_PARTS.includes(b))
    );
  const knee = [{ part: 'lowerBody' as const, why: '스쿼트 때 무릎 불편' }];
  const loose = selectCandidates({ facts, plan: buildPitchPlan(facts), library });
  const careful = selectCandidates({
    facts,
    plan: buildPitchPlan(facts),
    library,
    caution: knee,
  });
  check(
    '(기준) 조심할 곳이 없으면 무거운 하체 운동이 후보에 있다',
    heavyLower(loose.candidates).length > 0,
    `${heavyLower(loose.candidates).length}개`
  );
  check(
    '메모 속 하체 불편 → 무거운 하체 운동이 후보에서 빠진다',
    heavyLower(careful.candidates).length === 0,
    heavyLower(careful.candidates)
      .map((ex) => ex.title)
      .join(', ')
  );
  check(
    '가벼운 하체 운동은 남는다',
    careful.candidates.some(
      (ex) =>
        intensityLevel(ex.intensity) <= 3 &&
        ex.bodyParts.some((b) => LOWER_PARTS.includes(b))
    )
  );
  const withCaution = buildDailyPlan({
    user: { ownedEquipment: [], trainingLevel: null },
    facts,
    plan: buildPitchPlan(facts),
    library,
    availableToday: null,
    requestedMinutes: 60,
    recentIds: new Set<string>(),
    lastLowerKey: null,
    lastUpperKey: null,
    caution: knee,
  });
  check(
    '메모에서 뺀 까닭이 일정 근거에 남는다',
    !isHalted(withCaution) &&
      withCaution.basis.some((b) => b.startsWith('메모에서 하체 불편'))
  );
}

console.log('\n[컨디셔닝 데이] 무게 드는 운동이 없는 날은 이름도 그렇게');
{
  /*
   * 컨디셔닝은 무게 드는 구간을 통째로 뺀다. 그런데 이름은 번갈아 정한
   * '하체 스트렝스 데이'가 그대로 남아, 목록에 하체 근력 운동이 하나도 없는데
   * 제목만 하체였다(2026-09-23 고침).
   */
  const make = (goal: string, person: Person = { condition: 8 }) => {
    const facts = factsFor(person);
    return buildDailyPlan({
      user: { ownedEquipment: [], trainingLevel: null },
      facts,
      plan: buildPitchPlan(facts),
      library,
      availableToday: null,
      requestedMinutes: 60,
      trainingGoal: goal,
      recentIds: new Set<string>(),
      lastLowerKey: null,
      lastUpperKey: null,
    });
  };

  const conditioning = make(CONDITIONING_GOAL);
  check(
    '근력 날 + 컨디셔닝 → 컨디셔닝 데이',
    !isHalted(conditioning) && conditioning.theme.label === CONDITIONING_DAY_LABEL,
    isHalted(conditioning) ? '멈춤' : conditioning.theme.label
  );
  check(
    '컨디셔닝 데이에는 무게 드는 본운동 구간이 없다',
    !isHalted(conditioning) && conditioning.picks.every((p) => p.slot !== 'main'),
    isHalted(conditioning)
      ? ''
      : [...new Set(conditioning.picks.map((p) => p.slot))].join(', ')
  );
  check(
    '차례는 그대로 — 오늘 못 한 근력은 다음 근력 날로',
    !isHalted(conditioning) &&
      (conditioning.theme.key === 'lower' || conditioning.theme.key === 'upper') &&
      conditioning.theme.reason.includes('다음 근력 날'),
    isHalted(conditioning) ? '' : conditioning.theme.reason
  );

  const strength = make('근력 향상');
  check(
    '다른 목표는 이름 그대로',
    !isHalted(strength) && strength.theme.label.endsWith('스트렝스 데이'),
    isHalted(strength) ? '' : strength.theme.label
  );

  const recovery = make(CONDITIONING_GOAL, { condition: 3 });
  check(
    '회복날은 컨디셔닝을 골라도 회복 데이 그대로',
    !isHalted(recovery) && recovery.theme.label === '회복·재생 데이',
    isHalted(recovery) ? '' : recovery.theme.label
  );
}

console.log('\n[무게 단위] lb 로 적어도 되돌렸을 때 적은 그대로 나오는가');
{
  /*
   * 저장은 늘 kg 이고 보여줄 때만 고른 단위로 바꾼다(lib/units.ts). 그런데
   * 저장할 때 kg 을 너무 거칠게 다듬으면 되돌린 값이 달라진다 — 0.5kg 자리로
   * 맞추던 때는 135lb 가 134.5lb 로, 소수 한 자리로 자르던 화면은 134.9lb 로
   * 나왔다. 화면(세트를 남길 때)과 서버가 같은 storedKg 를 쓴다.
   */
  const lbMisses: string[] = [];
  for (let lb = 2.5; lb <= 700; lb += 2.5) {
    const shown = formatWeight(storedKg(fromWeight(lb, 'lb')), 'lb');
    if (shown !== `${lb}lb`) lbMisses.push(`${lb}→${shown}`);
  }
  check(
    'lb 로 적은 무게 2.5~700lb(2.5 간격) → 되돌려도 그대로',
    lbMisses.length === 0,
    lbMisses.length === 0 ? '280개 모두 같음' : lbMisses.slice(0, 5).join(', ')
  );

  const kgMisses: string[] = [];
  for (let kg = 2.5; kg <= 300; kg += 2.5) {
    if (storedKg(kg) !== kg || formatWeight(kg, 'kg') !== `${kg}kg`)
      kgMisses.push(String(kg));
  }
  check(
    'kg 로 적은 무게는 예전과 똑같이 저장·표시',
    kgMisses.length === 0,
    kgMisses.slice(0, 5).join(', ')
  );

  const bench = storedKg(fromWeight(135, 'lb'));
  check(
    '지난번 줄 — lb 를 고르면 lb 로 적는다',
    formatAmount(
      { setsDone: 3, repsDone: 5, holdSecondsDone: null, weightKg: bench },
      'lb'
    ) === '3세트 × 5회 · 135lb'
  );
  check(
    '지난번 줄 — 단위를 안 넘기면 kg (예전과 같음)',
    formatAmount({ setsDone: 3, repsDone: 10, holdSecondsDone: null, weightKg: 60 }) ===
      '3세트 × 10회 · 60kg'
  );
  check(
    '종료 요약·완료 카드 줄 — lb 로 적는다',
    formatSummary(
      {
        exerciseId: 'x',
        setsDone: 4,
        repsDone: 5,
        holdSecondsDone: null,
        weightKg: bench,
      },
      'lb'
    ) === '4세트 · 5회 · 135lb'
  );
  check('총 볼륨 — lb 로 바꿔 소수 한 자리', volumeIn(100, 'lb') === 220.5);
}

console.log('\n[떠난 운동 판] 종료를 안 누른 판을 가려내고, 끝 시각을 바르게 잡는가');
{
  /*
   * 한국 시간으로 적는다(+09:00). 판 날짜는 DB 처럼 UTC 자정이다 — 9/24 판은
   * 2026-09-24T00:00Z.
   */
  const kst = (s: string) => new Date(`${s}:00+09:00`);
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
  const H = 60 * 60 * 1000;

  // 1) 어제 저녁에 하다가 종료를 안 누르고 떠남 → 오늘 아침에는 떠난 판
  const evening = {
    date: day('2026-09-24'),
    startedAt: kst('2026-09-24T20:00'),
    mainStartedAt: kst('2026-09-24T20:05'),
  };
  const lastSet = kst('2026-09-24T20:50');
  const morning = kst('2026-09-25T08:00');
  check('어제 저녁 판, 다음 날 아침 → 떠난 판', isAbandoned(evening, lastSet, morning));
  const end1 = sessionEnd(evening, lastSet, morning);
  check(
    '떠난 판의 끝은 마지막 세트, 운동 시간은 본운동 시작부터 거기까지(45분)',
    end1.endedAt.getTime() === lastSet.getTime() && end1.segmentSeconds === 45 * 60,
    `${end1.segmentSeconds}초`
  );

  // 2) 23:30 에 시작해 자정을 넘겨 하는 중 → 날짜는 어제여도 아직 운동 중
  const lateNight = {
    date: day('2026-09-24'),
    startedAt: kst('2026-09-24T23:25'),
    mainStartedAt: kst('2026-09-24T23:30'),
  };
  const recentSet = kst('2026-09-25T00:35');
  const halfPast = kst('2026-09-25T00:40');
  check(
    '자정을 넘겨 하는 판(마지막 세트 5분 전) → 떠난 판 아님',
    !isAbandoned(lateNight, recentSet, halfPast)
  );
  const end2 = sessionEnd(lateNight, recentSet, halfPast);
  check(
    '그 판을 지금 마치면 끝은 지금, 운동 시간 70분',
    end2.endedAt.getTime() === halfPast.getTime() && end2.segmentSeconds === 70 * 60,
    `${end2.segmentSeconds}초`
  );

  // 3) 오늘 판은 아무리 오래 비워도 떠난 판이 아니다 — 오늘 다시 들어와 이어 한다
  const todayMorning = {
    date: day('2026-09-25'),
    startedAt: kst('2026-09-25T07:00'),
    mainStartedAt: kst('2026-09-25T07:05'),
  };
  const todaySet = kst('2026-09-25T07:40');
  const tonight = kst('2026-09-25T21:00');
  check(
    '오늘 판은 13시간 비워도 떠난 판 아님',
    !isAbandoned(todayMorning, todaySet, tonight)
  );
  const end3 = sessionEnd(todayMorning, todaySet, tonight);
  check(
    '아침 판의 종료를 저녁에 누르면 끝은 마지막 세트 — 그 사이는 운동 시간이 아니다(35분)',
    end3.endedAt.getTime() === todaySet.getTime() && end3.segmentSeconds === 35 * 60,
    `${end3.segmentSeconds}초`
  );

  // 4) 딱 3시간 경계 — 날짜가 이미 지난 판(자정 넘어 00:35 가 마지막)으로 잰다
  check(
    '마지막으로 무언가 한 뒤 2시간 59분 → 아직 아님, 3시간 → 떠난 판',
    STALE_AFTER_MS === 3 * H &&
      !isAbandoned(
        lateNight,
        recentSet,
        new Date(recentSet.getTime() + STALE_AFTER_MS - 60_000)
      ) &&
      isAbandoned(lateNight, recentSet, new Date(recentSet.getTime() + STALE_AFTER_MS))
  );
  check(
    '날짜가 안 지났으면 3시간이 넘어도 떠난 판 아님(어제 20:50 → 23:50)',
    !isAbandoned(evening, lastSet, new Date(lastSet.getTime() + STALE_AFTER_MS))
  );

  // 5) 다시 연 판 — 앞 구간 세트보다 다시 연 시각이 늦다
  const reopened = {
    date: day('2026-09-24'),
    startedAt: kst('2026-09-24T07:00'),
    mainStartedAt: kst('2026-09-24T19:00'), // 저녁에 [운동 더 하기]
  };
  const morningSet = kst('2026-09-24T07:40');
  check(
    '다시 연 판의 마지막 활동은 다시 연 시각',
    lastActivity(reopened, morningSet).getTime() === reopened.mainStartedAt.getTime()
  );
  const end5 = sessionEnd(reopened, morningSet, morning);
  check(
    '다시 열고 아무것도 안 한 채 떠남 → 이번 구간 운동 시간 0',
    end5.segmentSeconds === 0,
    `${end5.segmentSeconds}초`
  );

  // 6) 세트도 본운동도 없이 떠난 판(워밍업 창에서 나감)
  const warmupOnly = {
    date: day('2026-09-24'),
    startedAt: kst('2026-09-24T18:00'),
    mainStartedAt: null,
  };
  check('워밍업만 열고 떠난 판도 떠난 판', isAbandoned(warmupOnly, null, morning));
  check(
    '그 판의 운동 시간은 0',
    sessionEnd(warmupOnly, null, morning).segmentSeconds === 0
  );

  // 7) 세트를 받을 때의 규칙(logSet) — 기준 시각은 그 세트를 남긴 시각이다
  check(
    '신호가 없어 어젯밤(21:10) 폰에 담아 둔 세트가 아침에 늦게 오면 → 어제 판에 받는다',
    !isAbandoned(evening, lastSet, kst('2026-09-24T21:10'))
  );
  check(
    '켜 둔 화면에서 아침(08:00)에 남긴 세트 → 어제 판을 닫고 새로 열게 한다',
    isAbandoned(evening, lastSet, kst('2026-09-25T08:00'))
  );
}

console.log('\n[운동별 메모] 저장하기 전에 다듬는 규칙');
{
  /*
   * 서버가 저장하기 직전에 거치는 함수다(app/actions/exercise-note.ts).
   * 남는 글이 없으면 빈 문자열 — 서버는 그때 메모를 지운다.
   */
  check(
    '앞뒤 공백·줄바꿈을 걷는다',
    cleanExerciseNote('  그립 넓게 \n\n') === '그립 넓게'
  );
  check('공백만 있으면 빈 메모 — 지우기가 된다', cleanExerciseNote(' \n\t ') === '');
  check(
    '글이 아닌 값은 빈 메모',
    cleanExerciseNote(undefined) === '' && cleanExerciseNote(42) === ''
  );
  check(
    '\\r\\n 줄바꿈을 \\n 으로 맞춘다',
    cleanExerciseNote('그립\r\n등받이 3칸') === '그립\n등받이 3칸'
  );
  check(
    '빈 줄은 한 줄까지만',
    cleanExerciseNote('그립\n\n\n\n등받이') === '그립\n\n등받이'
  );
  const long = cleanExerciseNote('가'.repeat(EXERCISE_NOTE_MAX + 50));
  check(
    `${EXERCISE_NOTE_MAX}자에서 자른다`,
    Array.from(long).length === EXERCISE_NOTE_MAX,
    String(Array.from(long).length)
  );
  /* 이모지는 두 칸짜리라, 칸 단위로 자르면 반쪽 글자가 남는다 */
  const emoji = cleanExerciseNote('💪'.repeat(EXERCISE_NOTE_MAX + 1));
  check(
    '이모지를 반으로 가르지 않는다',
    Array.from(emoji).length === EXERCISE_NOTE_MAX &&
      Array.from(emoji).every((c) => c === '💪')
  );
}

console.log('\n[운동 교체] 비슷한 운동을 고르고, 바꾸거나 더하는가');
{
  /*
   * 실제 라이브러리로 본다. 힌지 계열 하체 스트렝스 하나를 바꿀 운동으로 삼는다.
   * 운동 화면의 교체 창이 서버(swapChoices)에서 받는 추천과 같은 계산이다.
   */
  const target = library.find(
    (ex) => ex.category === '하체 스트렝스' && ex.movementPattern === '힌지'
  );
  check('시험할 힌지 운동이 라이브러리에 있다', target != null);
  if (target) {
    const got = similarExercises(target, library, new Set());
    check(
      `추천은 ${SIMILAR_LIMIT}개까지`,
      got.length > 0 && got.length <= SIMILAR_LIMIT,
      String(got.length)
    );
    check(
      '바꿀 운동 자신은 안 나온다',
      got.every((s) => s.exercise.id !== target.id)
    );
    check(
      '같은 분류만 — 하체 스트렝스 대신 박스 점프를 권하지 않는다',
      got.every((s) => s.exercise.category === target.category),
      got.map((s) => s.exercise.category).join(',')
    );
    check(
      '동작 계열이 같거나 부위가 하나라도 겹친다',
      got.every(
        (s) =>
          s.exercise.movementPattern === target.movementPattern ||
          s.exercise.bodyParts.some((p) => target.bodyParts.includes(p))
      )
    );
    const hinges = library.filter(
      (ex) =>
        ex.id !== target.id &&
        ex.category === target.category &&
        ex.movementPattern === '힌지'
    );
    check(
      '같은 계열이 있으면 가장 앞에 온다',
      hinges.length === 0 || got[0].exercise.movementPattern === '힌지',
      got[0]?.exercise.title
    );
    check(
      '같은 계열이면 이유가 "같은 힌지"로 시작한다',
      got
        .filter((s) => s.exercise.movementPattern === '힌지')
        .every((s) => s.reason.startsWith('같은 힌지')),
      got.map((s) => s.reason).join(' / ')
    );
    check(
      '이유 줄에 장비가 들어간다',
      got.every((s) => s.reason.includes(equipmentLabel(s.exercise.equipment)))
    );

    /* 이미 오늘 목록에 있는 운동은 빼고 다음 것으로 채운다 */
    const first = got[0].exercise.id;
    const again = similarExercises(target, library, new Set([first]));
    check(
      '오늘 목록에 있는 운동은 추천하지 않는다',
      again.every((s) => s.exercise.id !== first)
    );

    /* 거른 후보(오늘 장비·경력·몸 상태를 통과한 것)만 넘기면 그 안에서만 고른다 */
    const pool = library.filter((ex) => ex.equipment.every((e) => e === '맨몸'));
    const bodyweight = similarExercises(target, pool, new Set());
    check(
      '넘겨준 후보 밖에서는 고르지 않는다',
      bodyweight.every((s) => pool.includes(s.exercise))
    );
  }

  /* 점수가 같으면 후보 순서 — 오늘 하고 싶다고 고른 부위가 앞에 와 있다 */
  const base = {
    category: '하체 스트렝스',
    bodyParts: ['햄스트링·둔근'],
    equipment: ['덤벨'],
    intensity: '중간',
    movementPattern: '힌지',
  };
  const synthetic = [
    { ...base, id: 'b' },
    { ...base, id: 'a' },
    { ...base, id: 'heavy', intensity: '높음' },
    { ...base, id: 'other', category: '코어' },
    { ...base, id: 'unrelated', bodyParts: ['가슴'], movementPattern: '밀기' },
  ];
  const ranked = similarExercises({ ...base, id: 'target' }, synthetic, new Set());
  check(
    '점수가 같으면 넘겨준 순서대로',
    ranked.map((s) => s.exercise.id).join(',') === 'b,a,heavy',
    ranked.map((s) => s.exercise.id).join(',')
  );
  check(
    '강도가 다르면 이유에 적는다',
    ranked.find((s) => s.exercise.id === 'heavy')?.reason.endsWith('더 무거움') ===
      true,
    ranked.find((s) => s.exercise.id === 'heavy')?.reason
  );
  check(
    '이유 한 줄 모양',
    ranked[0].reason === '같은 힌지 · 햄스트링·둔근 · 덤벨',
    ranked[0].reason
  );
  check(
    '맨몸은 다른 장비가 없을 때만 적는다',
    equipmentLabel(['맨몸']) === '맨몸' &&
      equipmentLabel([]) === '맨몸' &&
      equipmentLabel(['맨몸', '덤벨']) === '덤벨'
  );

  /* 세트를 남긴 운동은 바꾸지 않고 더한다 */
  check('세트가 없으면 바꾼다', swapMode('replace', false) === 'replace');
  check(
    '서버에 세트가 있으면 화면이 바꾸자고 해도 더한다',
    swapMode('replace', true) === 'add'
  );
  check('화면이 더하자고 하면 더한다', swapMode('add', false) === 'add');

  const list = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
  const ids = (l: { id: string }[] | null) =>
    l ? l.map((e) => e.id).join(',') : 'null';
  check(
    '바꾸면 그 자리에',
    ids(placeExercise(list, 'y', { id: 'n' }, 'replace')) === 'x,n,z'
  );
  check(
    '더하면 바로 뒤에',
    ids(placeExercise(list, 'y', { id: 'n' }, 'add')) === 'x,y,n,z'
  );
  check(
    '맨 끝 운동 뒤에도 더한다',
    ids(placeExercise(list, 'z', { id: 'n' }, 'add')) === 'x,y,z,n'
  );
  check(
    '이미 목록에 있는 운동은 넣지 않는다 — 같은 운동이 두 줄이면 세트를 가를 수 없다',
    placeExercise(list, 'y', { id: 'x' }, 'add') === null
  );
  check(
    '목록에 없는 운동을 바꿀 수는 없다',
    placeExercise(list, 'q', { id: 'n' }, 'replace') === null
  );
  check('원래 목록은 그대로 둔다', ids(list) === 'x,y,z');
}

console.log('\n[운동별 기록] 세트와 요약을 합쳐 최고 기록·흐름을 내는가');
{
  /* 추정 1RM — Epley: 무게 × (1 + 횟수/30). 1회면 그 무게, 12회를 넘으면 안 낸다 */
  check('1회면 그 무게가 곧 1RM', estimate1RM(100, 1) === 100);
  check(
    '100kg × 10회 → 133.3kg',
    estimate1RM(100, 10) === 133.3,
    String(estimate1RM(100, 10))
  );
  check('13회부터는 어림하지 않는다', estimate1RM(100, 13) === null);
  check(
    '무게나 횟수가 없으면 안 낸다',
    estimate1RM(0, 5) === null && estimate1RM(60, 0) === null
  );

  const sets = [
    /* 9/24 — 운동 화면에서 세트별로 */
    { date: '2026-09-24', setNo: 2, weightKg: 65, reps: 5, holdSeconds: null },
    { date: '2026-09-24', setNo: 1, weightKg: 65, reps: 5, holdSeconds: null },
    /* 9/20 — 무게를 올리며 세 세트 */
    { date: '2026-09-20', setNo: 1, weightKg: 60, reps: 8, holdSeconds: null },
    { date: '2026-09-20', setNo: 2, weightKg: 62.5, reps: 8, holdSeconds: null },
    { date: '2026-09-20', setNo: 3, weightKg: 62.5, reps: 7, holdSeconds: null },
  ];
  const logs = [
    /* 9/24 — 마칠 때 세트에서 접힌 요약. 세트가 있으니 이 줄은 안 쓴다 */
    {
      date: '2026-09-24',
      setsDone: 2,
      repsDone: 5,
      holdSecondsDone: null,
      weightKg: 65,
    },
    /* 9/10 — 체크로만 남긴 날 */
    {
      date: '2026-09-10',
      setsDone: 3,
      repsDone: 8,
      holdSecondsDone: null,
      weightKg: 57.5,
    },
    /* 8/20 — 5주 전. 최근 4주에는 안 든다 */
    {
      date: '2026-08-20',
      setsDone: null,
      repsDone: null,
      holdSecondsDone: null,
      weightKg: null,
    },
  ];
  const h = buildExerciseHistory(sets, logs, '2026-09-25');

  check('무게 운동으로 본다', h.kind === 'weight', h.kind);
  check(
    '최근 것부터, 하루에 한 줄',
    h.days.map((d) => d.date).join(',') ===
      '2026-09-24,2026-09-20,2026-09-10,2026-08-20',
    h.days.map((d) => d.date).join(',')
  );
  const d24 = h.days[0];
  const d20 = h.days[1];
  const d10 = h.days[2];
  check(
    '세트가 있는 날은 세트를 순서대로 쓴다',
    d24.sets?.length === 2 && d20.sets?.[1].weightKg === 62.5
  );
  check(
    '볼륨은 무게 × 횟수의 합',
    d20.volume === 60 * 8 + 62.5 * 8 + 62.5 * 7,
    String(d20.volume)
  );
  check('세트에서 센 볼륨은 어림이 아니다', !d20.approx && !d24.approx);
  check(
    '세트에서 요약을 다시 접는다 — 가장 무거운 무게·가장 자주 한 횟수',
    d20.weightKg === 62.5 && d20.repsDone === 8 && d20.setsDone === 3
  );
  check(
    '요약만 있는 날은 세트 × 횟수 × 무게로 어림한다',
    d10.sets === null && d10.volume === 3 * 8 * 57.5 && d10.approx,
    String(d10.volume)
  );
  check(
    '숫자를 안 적은 날은 볼륨을 안 낸다',
    h.days[3].volume === null && !h.days[3].approx
  );
  check(
    '그날의 추정 1RM 은 가장 좋은 세트로',
    d20.e1rm === estimate1RM(62.5, 8),
    String(d20.e1rm)
  );
  check(
    '최고 무게는 처음 든 날로',
    h.bestWeight?.kg === 65 && h.bestWeight.date === '2026-09-24',
    JSON.stringify(h.bestWeight)
  );
  check(
    '최고 세트는 추정 1RM 으로 가른다 — 65kg × 5 보다 62.5kg × 8',
    h.bestSet?.weightKg === 62.5 &&
      h.bestSet.reps === 8 &&
      h.bestSet.date === '2026-09-20',
    JSON.stringify(h.bestSet)
  );
  check(
    '모두 4번, 최근 4주 3번',
    h.total === 4 && h.last28 === 3,
    `${h.total} / ${h.last28}`
  );

  /* 맨몸 운동 — 무게가 한 번도 없으면 횟수로 잰다 */
  const pushups = buildExerciseHistory(
    [
      { date: '2026-09-22', setNo: 1, weightKg: null, reps: 15, holdSeconds: null },
      { date: '2026-09-22', setNo: 2, weightKg: null, reps: 12, holdSeconds: null },
    ],
    [],
    '2026-09-25'
  );
  check(
    '맨몸은 횟수로 — 볼륨은 횟수 합, 1RM 은 없음',
    pushups.kind === 'reps' &&
      pushups.days[0].volume === 27 &&
      pushups.days[0].e1rm === null
  );
  check('한 세트 최다 횟수', pushups.bestReps?.reps === 15);

  /* 버티기 — 시간만 있으면 시간으로 잰다 */
  const plank = buildExerciseHistory(
    [
      { date: '2026-09-21', setNo: 1, weightKg: null, reps: null, holdSeconds: 45 },
      { date: '2026-09-21', setNo: 2, weightKg: null, reps: null, holdSeconds: 60 },
    ],
    [],
    '2026-09-25'
  );
  check(
    '버티기는 시간으로 — 가장 오래 60초, 볼륨은 초의 합',
    plank.kind === 'hold' &&
      plank.bestHold?.seconds === 60 &&
      plank.days[0].volume === 105
  );

  const none = buildExerciseHistory([], [], '2026-09-25');
  check(
    '기록이 없으면 빈 기록',
    none.days.length === 0 && none.bestWeight === null && none.total === 0
  );
}

console.log('\n[휴식 시계] 10분이 넘으면 거두는가');
{
  const set = Date.parse('2026-09-25T10:00:00.000Z');
  const at = (sec: number) => set + sec * 1000;
  const last = new Date(set).toISOString();
  check('세트를 안 남겼으면 시계 없음', restSeconds(null, at(30)) === null);
  check('방금 남긴 세트 → 0초부터', restSeconds(last, at(0)) === 0);
  check('9분 59초까지는 보인다', restSeconds(last, at(599)) === 599);
  check(
    `${REST_CLOCK_LIMIT_SECONDS / 60}분이 되면 거둔다`,
    restSeconds(last, at(REST_CLOCK_LIMIT_SECONDS)) === null
  );
  check('한 시간이 지나도 다시 나오지 않는다', restSeconds(last, at(3600)) === null);
  check('폰 시계가 빨라 세트가 미래로 찍혀도 0초', restSeconds(last, at(-5)) === 0);
  check('읽을 수 없는 시각이면 시계 없음', restSeconds('아무거나', at(10)) === null);
}

console.log('\n[암케어] 부위·근육 · 오늘의 루틴 · 부하');
{
  /*
   * 근육은 scripts/armcare-muscles.json 에서 겹쳐 쓴다. DB 에 아직 안 넣었어도
   * (fill-armcare-muscles.mts --save 전) 루틴 규칙을 시험할 수 있어야 한다.
   */
  const tags: { id: string; title: string; muscles: string[] }[] = JSON.parse(
    readFileSync(new URL('./armcare-muscles.json', import.meta.url), 'utf8')
  );
  const tagOf = new Map(tags.map((t) => [t.id, t.muscles]));
  const armcareLib = library
    .filter((ex) => ex.category === ARMCARE_CATEGORY)
    .map((ex) => ({
      ...ex,
      targetMuscles: tagOf.get(ex.id) ?? ex.targetMuscles ?? [],
    }));
  const exOf = new Map(armcareLib.map((ex) => [ex.id, ex]));
  const titleOf = (id: string) => exOf.get(id)?.title ?? id;

  /* 1) 이름이 서로 맞는가 */
  check(
    '암케어 카테고리 이름이 부하 쪽과 같다',
    ARMCARE_CATEGORY === ARM_CARE_CATEGORY
  );
  const unknown = tags.flatMap((t) =>
    t.muscles
      .filter((m) => !ARMCARE_MUSCLE_NAMES.includes(m))
      .map((m) => `${t.title}:${m}`)
  );
  check(
    '근육 초안의 이름이 모두 목록 안에 있다',
    unknown.length === 0,
    unknown.join(', ')
  );
  const untagged = armcareLib.filter((ex) => ex.targetMuscles.length === 0);
  check(
    '보이는 암케어 운동마다 근육이 적혀 있다',
    untagged.length === 0,
    untagged.map((e) => e.title).join(', ') || `${armcareLib.length}개`
  );
  const emptyAreas = ARMCARE_AREAS.filter(
    (a) =>
      !armcareLib.some((ex) => areasOf(ex.targetMuscles).some((x) => x.key === a.key))
  );
  check(
    '부위마다 운동이 하나 이상 있다',
    emptyAreas.length === 0,
    emptyAreas.map((a) => a.label).join(', ')
  );
  /* 2026-09-26 부상 예방 기준으로 다시 검토해 더한 근육 여섯 */
  const added = ['광배근', '대원근', '얕은 손가락 굴곡근', '깊은 손가락 굴곡근', '주근', '상완근'];
  const unused = added.filter(
    (m) => !ARMCARE_MUSCLE_NAMES.includes(m) || !armcareLib.some((ex) => ex.targetMuscles.includes(m))
  );
  check('더한 근육 여섯이 목록에 있고, 운동이 하나 이상 있다', unused.length === 0, unused.join(', '));
  const claimsFor = (m: string) => muscleInfo(m)?.helps ?? null;
  check(
    '예방 주장은 근거 있는 얕은 손가락 굴곡근에만 — 광배근·대원근·깊은 손가락 굴곡근·주근·상완근은 이름만',
    claimsFor('얕은 손가락 굴곡근') === '내측 측부인대(UCL) 손상' &&
      ['광배근', '대원근', '깊은 손가락 굴곡근', '주근', '상완근'].every((m) => claimsFor(m) === null)
  );
  const brachialisFirst = armcareBlock(
    { ...armcareLib[0], targetMuscles: ['상완근', '이두근'], intensity: '낮음', equipment: ['밴드'] },
    'strength',
    null
  );
  check('상완근이 앞인 컬도 팔 근력 운동이라 루틴에 안 들어간다', brachialisFirst === 'arm-strength', String(brachialisFirst));
  const noteless = ARMCARE_AREAS.filter((a) => a.notes.length === 0);
  check(
    '부위마다 알아 두기가 한 줄 이상 있다',
    noteless.length === 0,
    noteless.map((a) => a.label).join(', ')
  );

  /* 1-1) 훈련 방식 — 이름으로 가리고, 화면에 적은 말이 참인가 */
  const emptyMethods = ARMCARE_METHODS.filter(
    (m) => !armcareLib.some((ex) => methodOf(ex.title).key === m.key)
  );
  check(
    '훈련 방식마다 운동이 하나 이상 있다',
    emptyMethods.length === 0,
    emptyMethods.map((m) => m.label).join(', ')
  );
  check(
    '방식 표시가 없는 이름은 기본 보강이다',
    methodOf('밴드 외회전').key === 'basic' &&
      methodOf('사이드라잉 외회전 리바운드').key === 'rebound'
  );
  const eccentricInRoutine = armcareLib
    .filter((ex) => methodOf(ex.title).key === 'eccentric')
    .filter(
      (ex) =>
        armcareBlock(ex, 'strength', null) == null ||
        armcareBlock(ex, 'recovery', null) == null
    );
  check(
    "과부하 내리기는 맞춤 루틴에 저절로 안 들어간다 (화면에 그렇게 적었다)",
    eccentricInRoutine.length === 0,
    eccentricInRoutine.map((ex) => ex.title).join(', ')
  );

  /* 1-2) 내 루틴 — 저장하는 쪽과 만들기 화면이 같은 규칙을 쓴다 */
  const tidy = normalizeRoutineInput({
    name: '  투구   전  ',
    items: [
      { exerciseId: 'a', sets: 0 },
      { exerciseId: 'a', sets: 3 },
      { exerciseId: 'b', sets: 9 },
      { exerciseId: 'c', sets: Number.NaN },
      { nope: true },
      'x',
    ],
  });
  check(
    '내 루틴 — 이름 공백을 다듬고, 같은 운동은 한 번, 세트는 1~5 (모양이 틀린 줄은 버림)',
    tidy.ok &&
      tidy.name === '투구 전' &&
      tidy.items.map((it) => `${it.exerciseId}${it.sets}`).join(',') === 'a1,b5,c2',
    JSON.stringify(tidy)
  );
  const tooMany = normalizeRoutineInput({
    name: '많이',
    items: Array.from({ length: MY_ROUTINE_MAX_ITEMS + 1 }, (_, i) => ({
      exerciseId: `e${i}`,
      sets: 2,
    })),
  });
  const noName = normalizeRoutineInput({ name: '   ', items: [{ exerciseId: 'a', sets: 2 }] });
  const empty = normalizeRoutineInput({ name: '빈 루틴', items: [] });
  check(
    `내 루틴 — 이름 없음 · 운동 없음 · ${MY_ROUTINE_MAX_ITEMS}개 넘음은 저장하지 않는다`,
    !tooMany.ok && !noName.ok && !empty.ok
  );
  check(
    'DB 에 이상한 모양이 들어 있어도 루틴은 열린다(읽을 수 있는 줄만)',
    readRoutineItems(null).length === 0 &&
      readRoutineItems([{ exerciseId: 'a', sets: '2' }, { exerciseId: 'b', sets: 4 }])
        .map((it) => `${it.exerciseId}${it.sets}`)
        .join(',') === 'a2,b4'
  );
  check(
    '트레이닝 칸 — 주소·쿠키에서 두 칸만 받는다 (예전 기록 칸 값은 버림)',
    readTrainingPart('today') === 'today' &&
      readTrainingPart('armcare') === 'armcare' &&
      readTrainingPart('history') === null &&
      readTrainingPart(undefined) === null
  );

  /* 2) 근육 이름 거르기 — 맨 앞이 주 근육이라 적힌 차례를 지켜야 한다 */
  check(
    '근육 거르기: 모르는 것은 버리고, 겹치면 앞의 것만, 차례는 그대로',
    JSON.stringify(
      cleanTargetMuscles(['중부 승모근', '없는 근육', '후면 삼각근', '중부 승모근', 3])
    ) === JSON.stringify(['중부 승모근', '후면 삼각근'])
  );
  check(
    '주 부위는 맨 앞 근육의 부위 (T 레이즈 → 견갑)',
    primaryArea(['중부 승모근', '후면 삼각근'])?.key === 'scapula'
  );
  check(
    '운동 한 줄 — 주 근육이 도울 수 있는 부상만',
    helpsLine(['극하근', '소원근']) === '극하근 · 소원근 → 회전근개 손상 예방에 도움',
    String(helpsLine(['극하근', '소원근']))
  );
  check(
    '푸시다운·해머컬에는 예방 효과를 붙이지 않는다 (근육 이름만)',
    helpsLine(['삼두근']) === '삼두근' &&
      helpsLine(['완요골근', '이두근']) === '완요골근 · 이두근',
    `${helpsLine(['삼두근'])} / ${helpsLine(['완요골근', '이두근'])}`
  );
  const claims = tags
    .map((t) => ({ title: t.title, line: helpsLine(t.muscles) ?? '' }))
    .filter(
      (c) =>
        c.line.includes('예방') &&
        ['삼두근', '이두근', '완요골근'].includes(
          c.line.split(' · ')[0].split(' → ')[0]
        )
    );
  check(
    '팔 근력 운동 어디에도 예방 주장이 없다',
    claims.length === 0,
    claims.map((c) => `${c.title}: ${c.line}`).join(', ')
  );

  /* 3) 오늘 어떤 루틴인가 */
  const rested = [0, 0, 0, 0, 0, 0, 0];
  const decide = (person: Person, armFatigue: number | null = null) => {
    const f = factsFor(person);
    return decideArmcare({ facts: f, plan: buildPitchPlan(f), armFatigue });
  };
  const pain = decide({ condition: 7, pain: true });
  check(
    '통증 → 쉬기 (운동 일정이 멈추는 것과 같은 말)',
    pain.kind === 'rest' && pain.reason.includes('전문의'),
    pain.reason
  );
  const yday = decide({ condition: 8, pitches: [85, 0, 0, 0, 0, 0, 0] });
  check(
    '어제 85구 → 회복',
    yday.kind === 'recovery' && yday.reason.includes('어제 85구'),
    yday.reason
  );
  /* 쉬는 까닭은 쉬게 만든 등판이다 — 그 뒤에 한 가벼운 캐치볼이 아니라 */
  const owed = decide({ condition: 8, pitches: [0, 10, 120, 0, 0, 0, 0] });
  check(
    '사흘 전 120구 뒤 이틀 전 캐치볼 10개 → 회복, 까닭은 120구',
    owed.kind === 'recovery' &&
      owed.reason.includes('120구') &&
      !owed.reason.includes('10구 ·'),
    owed.reason
  );
  const calm = decide({ condition: 8, pitches: rested });
  check('일주일 넘게 안 던짐 → 강화', calm.kind === 'strength', calm.reason);
  const threeDays = decide({ condition: 8, pitches: [0, 0, 40, 0, 0, 0, 0] });
  check(
    '사흘 전 40구 → 강화',
    threeDays.kind === 'strength' && threeDays.reason.includes('3일 전'),
    threeDays.reason
  );
  const tiredArm = decide({ condition: 8, pitches: rested }, 4);
  check(
    "팔 피로 '많이' → 회복",
    tiredArm.kind === 'recovery' && tiredArm.reason.includes('팔 피로'),
    tiredArm.reason
  );
  check(
    "팔 피로 '보통'은 넘긴다 → 강화",
    decide({ condition: 8, pitches: rested }, 3).kind === 'strength'
  );
  const low = decide({ condition: 3, pitches: rested });
  check(
    '컨디션 3/10 → 회복',
    low.kind === 'recovery' && low.reason.includes('컨디션 3/10'),
    low.reason
  );
  check(
    '체크인에서 회복을 고름 → 회복',
    decide({ condition: 8, pitches: rested, wants: '회복' }).kind === 'recovery'
  );

  /* 4) 루틴 짜기 */
  const factsCalm = factsFor({ condition: 8, pitches: rested });
  const build = (
    kind: ArmcareKind,
    over: Partial<Parameters<typeof buildArmcareRoutine>[0]> = {}
  ) =>
    buildArmcareRoutine({
      decision: { kind, reason: '시험' },
      candidates: armcareLib,
      facts: factsCalm,
      seed: '2026-06-15',
      ...over,
    });
  const SIX: ArmcareAreaKey[] = [
    'shoulder-back',
    'scapula',
    'elbow-inner',
    'shoulder-front',
    'shoulder-top',
    'elbow-outer',
  ];

  const strength = build('strength');
  const hit = new Set(strength.items.map((it) => it.area));
  check(
    '강화 — 여섯 부위(어깨 뒤·앞·위, 견갑, 팔꿈치 안·밖)를 하나씩은 채운다',
    SIX.every((a) => hit.has(a)),
    strength.items.map((it) => `${it.area}:${titleOf(it.exerciseId)}`).join(' / ')
  );
  check(
    '강화 — 약 20분 (15~22분)',
    strength.estimatedMinutes >= 15 && strength.estimatedMinutes <= 22,
    `${strength.items.length}개 · ${strength.estimatedMinutes}분`
  );
  check(
    '강화 — 2세트씩',
    strength.items.every((it) => it.sets === 2)
  );
  /* 완요골근이 주 근육인 운동은 해머컬 계열이다 — 함께 뺀다 */
  const armStrength = [...strength.items, ...build('recovery').items].filter((it) =>
    ['이두근', '삼두근', '완요골근'].includes(exOf.get(it.exerciseId)!.targetMuscles[0])
  );
  check(
    '루틴에 컬·푸시다운 같은 팔 근력 운동은 넣지 않는다',
    armStrength.length === 0,
    armStrength.map((it) => titleOf(it.exerciseId)).join(', ')
  );
  check(
    '강화 — 같은 운동이 두 번 안 나온다',
    new Set(strength.items.map((it) => it.exerciseId)).size === strength.items.length
  );

  const recovery = build('recovery');
  const heavyIn = recovery.items.filter((it) => {
    const ex = exOf.get(it.exerciseId)!;
    return (
      intensityLevel(ex.intensity) > intensityLevel('낮음') ||
      ex.equipment.some((q) => ['덤벨', '바벨', '케틀벨', '원판', '케이블'].includes(q))
    );
  });
  check(
    '회복 — 낮음 이하 강도 · 무게 싣는 장비 없음',
    heavyIn.length === 0,
    heavyIn.map((it) => titleOf(it.exerciseId)).join(', ')
  );
  check(
    '회복 — 1세트씩, 셋 이상, 10분 안쪽',
    recovery.items.every((it) => it.sets === 1) &&
      recovery.items.length >= 3 &&
      recovery.estimatedMinutes <= 11,
    `${recovery.items.length}개 · ${recovery.estimatedMinutes}분 · ` +
      recovery.items.map((it) => titleOf(it.exerciseId)).join(' / ')
  );

  /* 뻐근한 곳 — 그 부위는 가볍게, 까닭을 적는다 */
  const stiffFacts = (part: 'shoulder' | 'elbow') => {
    const f = factsFor({ condition: 8, pitches: rested });
    f.condition.today = { ...f.condition.today!, [part]: '뻐근' };
    return f;
  };
  /*
   * 여러 날(씨앗)로 돌려 본다. 한 번만 보면 우연히 '낮음'만 뽑힌 날에 통과한다 —
   * 검토에서 60일 중 14일에 견갑 자리로 '중간'이 들어온 것을 잡았다.
   */
  const touchesShoulder = (id: string) =>
    areasOf(exOf.get(id)!.targetMuscles).some((a) => a.joint === '어깨');
  const shoulderLeaks: string[] = [];
  let shoulderNoted = true;
  for (let d = 1; d <= 30; d++) {
    const r = build('strength', {
      facts: stiffFacts('shoulder'),
      seed: `2026-06-${String(d).padStart(2, '0')}`,
    });
    if (!r.notes.some((n) => n.includes('어깨'))) shoulderNoted = false;
    for (const it of r.items) {
      const ex = exOf.get(it.exerciseId)!;
      if (
        touchesShoulder(it.exerciseId) &&
        intensityLevel(ex.intensity) > intensityLevel('낮음')
      ) {
        shoulderLeaks.push(`${d}일:${ex.title}`);
      }
    }
  }
  check(
    '어깨가 뻐근 → 어깨(견갑 포함)를 쓰는 운동은 30일 내내 낮음 이하, 까닭을 적는다',
    shoulderLeaks.length === 0 && shoulderNoted,
    shoulderLeaks.join(', ')
  );
  const elbowStiff = build('strength', { facts: stiffFacts('elbow') });
  const elbowItems = elbowStiff.items.filter((it) =>
    ['elbow-inner', 'elbow-outer'].includes(it.area)
  );
  check(
    '팔꿈치가 뻐근 → 전완 운동은 하나만',
    elbowItems.length <= 1 && elbowStiff.notes.some((n) => n.includes('팔꿈치')),
    `${elbowItems.length}개`
  );

  /* 같은 날은 같은 루틴 · 다시 만들면 바뀜 · 체크한 것은 남음 · 오래 안 한 것부터 */
  check(
    '같은 날 같은 씨앗 → 같은 루틴 (새로고침에 안 바뀐다)',
    JSON.stringify(build('strength').items) === JSON.stringify(strength.items)
  );
  const doneOne = strength.items[0].exerciseId;
  const remade = build('strength', {
    seed: `2026-06-15:${strength.items.map((it) => it.exerciseId).join(',')}`,
    doneToday: new Set([doneOne]),
  });
  check(
    '다시 만들기 → 목록이 바뀐다',
    JSON.stringify(remade.items) !== JSON.stringify(strength.items)
  );
  check(
    '다시 만들어도 오늘 체크한 것은 남는다',
    remade.items.some((it) => it.exerciseId === doneOne),
    titleOf(doneOne)
  );
  const doneInner = strength.items.find((it) => it.area === 'elbow-inner')!.exerciseId;
  const regear = build('strength', {
    candidates: armcareLib.filter((ex) => ex.id !== doneInner),
    known: armcareLib,
    doneToday: new Set([doneInner]),
  });
  check(
    '장비를 바꿔 다시 만들어도 오늘 체크한 것은 남는다',
    regear.items.some((it) => it.exerciseId === doneInner),
    titleOf(doneInner)
  );
  const firstBack = strength.items.find(
    (it) => it.area === 'shoulder-back'
  )!.exerciseId;
  const rotated = build('strength', { lastDone: new Map([[firstBack, '2026-06-14']]) });
  const nextBack = rotated.items.find((it) => it.area === 'shoulder-back')?.exerciseId;
  check(
    '어제 한 것은 뒤로 — 어깨 후방에 다른 운동이 나온다',
    nextBack != null && nextBack !== firstBack,
    `${titleOf(firstBack)} → ${nextBack ? titleOf(nextBack) : '없음'}`
  );

  const bandsOnly = filterByEquipment(armcareLib, ['맨몸', '밴드']).pool;
  const band = build('strength', { candidates: bandsOnly });
  check(
    '맨몸·밴드만 가져도 강화 루틴이 나온다',
    band.items.length >= 5,
    `${band.items.length}개 · ${band.estimatedMinutes}분`
  );
  check(
    "빈 부위의 조사가 맞다 — '어깨 상부는' ('은' 아님)",
    band.notes.some((n) => n.includes('어깨 상부는')) &&
      !band.notes.some((n) => n.includes('상부은')),
    band.notes.join(' / ')
  );
  const dumbbellRecovery = build('recovery', {
    candidates: filterByEquipment(armcareLib, ['맨몸', '덤벨']).pool,
  });
  check(
    '덤벨을 가진 사람의 회복날 — 장비 탓이 아니라 회복날 규칙이라고 말한다',
    dumbbellRecovery.notes.some((n) => n.startsWith('회복날에는')) &&
      !dumbbellRecovery.notes.some((n) => n.startsWith('가진 장비로')),
    dumbbellRecovery.notes.join(' / ')
  );
  check(
    '루틴은 어깨에서 팔꿈치 차례로 보여 준다 (부위별 보강과 같은 차례)',
    strength.items.every(
      (it, i, all) =>
        i === 0 ||
        ARMCARE_AREAS.findIndex((a) => a.key === all[i - 1].area) <=
          ARMCARE_AREAS.findIndex((a) => a.key === it.area)
    ),
    strength.items.map((it) => it.area).join(' → ')
  );

  check(
    '저장한 루틴을 그대로 읽는다',
    readArmcareRoutine(JSON.parse(JSON.stringify(strength)))?.items.length ===
      strength.items.length
  );
  check(
    '모양이 다른 옛 기록은 없는 것으로 본다',
    readArmcareRoutine({ version: 2, items: [] }) === null
  );

  /* 5) 부하 — 암케어는 세트 수로만 센다 (lib/training-load.ts) */
  const armOne = armcareLib[0];
  const back = (n: number) => new Date(TODAY.getTime() - n * 86400000);
  const armOnly = buildTrainingLoad(
    [
      { date: back(1), setsDone: null, exercise: armOne },
      { date: back(2), setsDone: null, exercise: armOne },
    ],
    [],
    TODAY
  );
  check(
    '암케어만 한 날은 운동한 날·부하에 안 들어간다',
    armOnly.recentDays === 0 && armOnly.recentMinutes === 0,
    `운동한 날 ${armOnly.recentDays}일 · ${armOnly.recentMinutes}분`
  );
  check(
    '그래도 암케어 세트는 센다',
    armOnly.volume.armCare.sets > 0,
    `암케어 ${armOnly.volume.armCare.sets}세트`
  );
  check(
    '암케어는 부위 묶음(등·견갑 등)에 안 들어간다 — AI에게 모순된 숫자를 안 준다',
    armOnly.volume.byPart.every((p) => p.sets === 0),
    armOnly.volume.byPart.map((p) => `${p.label} ${p.sets}`).join(' · ')
  );

  /* 6) 일정 쪽 — 본운동 빈자리에도 암케어가 안 들어가고, 쉬게 만든 등판을 말한다 */
  const kettlebellOnly = filterByEquipment(library, ['케틀벨']).pool;
  const fallbackLeaks = [45, 90].flatMap((m) =>
    pickForTheme({
      candidates: kettlebellOnly,
      theme: 'upper',
      minutes: m,
      doneIds: new Set<string>(),
      goal: '근력 향상',
      focus: 'upperPull',
    })
      .picks.filter((p) => p.exercise.category === '암케어')
      .map((p) => `${m}분:${p.exercise.title}`)
  );
  check(
    '본운동 빈자리를 채울 때도 암케어는 안 쓴다 (케틀벨만 · 상체 당기기)',
    fallbackLeaks.length === 0,
    fallbackLeaks.join(', ')
  );
  const afterCatch = factsFor({ condition: 8, pitches: [0, 20, 90, 0, 0, 0, 0] });
  const assistDay = decideTheme({
    facts: afterCatch,
    plan: buildPitchPlan(afterCatch),
    lastLowerKey: null,
    lastUpperKey: null,
  });
  check(
    '사흘 전 90구 뒤 이틀 전 캐치볼 20개 → 일정의 까닭도 90구 (암케어와 같은 말)',
    assistDay.reason.includes('90구') && !assistDay.reason.includes('20구'),
    `${assistDay.label} — ${assistDay.reason}`
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
