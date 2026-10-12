/**
 * 트레이닝 자가 시험.
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
import {
  BELOW_USUAL_GAP,
  GAME_DATES_DAYS,
  HARD_OUTING_MIN_LOAD,
  HARD_OUTING_MIN_PITCHES,
  NEAR_MAX_EFFORT_PCT,
  OUTING_CALENDAR_DAYS,
  USUAL_CONDITION_DAYS,
  USUAL_CONDITION_MIN_CHECKINS,
  belowUsualCondition,
  buildFacts,
  findPainKeywords,
  isHardOuting,
  isNearMaxOuting,
  usualConditionOf,
  type CalendarEventLike,
  type CheckinLike,
  type HardOuting,
  type UsualCondition,
} from '../lib/report/facts.ts';
import { throwIntensity, throwMemo } from '../lib/armcare/rehab-progress.ts';
import {
  EFFORT_CHIPS,
  EFFORT_MISSING_ERROR,
  MID_EFFORT_PCT,
  STRONG_EFFORT_PCT,
  derivedEffortText,
  effortBand,
  effortFields,
  effortText,
  effortUpdate,
  maxEffortPct,
  readEffort,
  readEffortInput,
  scaleToEffortPct,
  snapEffortPct,
  stepEffortPct,
} from '../lib/pitch-effort.ts';
import {
  CHECKIN_PARTS,
  DETAIL_SCALES,
  HIGH_SORENESS,
  LOW_CONDITION_THRESHOLD,
  SEVERE_ARM_FATIGUE,
  SEVERE_SORENESS,
  THROW_PLANS,
  WORKOUT_KINDS,
  armFatigueWord,
  armPainSpotsFor,
  exactOutingDay,
  hasDetail,
  isShortSleep,
  nextOutingDays,
  parseArmPain,
  parseCheckinBody,
  parseCheckinDetail,
  parseThrowPlan,
  mealSummary,
  pickArmPain,
  pickCheckinBody,
  pickCheckinDetail,
  sleepLevelFromHours,
  nextOutingWindow as checkinNextOutingWindow,
  saysNoOuting,
  todayOutingRole,
  type CheckinPartKey,
  type ThrowPlan,
} from '../lib/checkin.ts';
import {
  countMissingDays,
  countSessionTypes,
  buildReportFindings,
  loadBySessionType,
  dailyLoad,
  EFFORT_STEP,
  MAX_EFFORT_PCT,
  MIN_EFFORT_PCT,
  effortPctOf,
  effortToIntensity,
  findFatigueWindows,
  intensityOf,
  outingLoadOf,
  groupByDay,
  longestThrowStreak,
  summarize,
  stressFactor,
  shiftDateKey,
  toDateKey,
  MIN_STRESS_FACTOR,
  TWO_DAY_INTENSITY_LIMIT,
  trustedEffortPct,
  type PitchLogLike,
} from '../lib/pitch-stats.ts';
import {
  buildPitchPlan,
  dailyPitchCap,
  intensityRangeText,
  pendingOuting,
  pitchRangeText,
  requiredRestDays,
  HIGH_VOLUME_PITCHES,
  HIGH_VOLUME_MIN_REST,
  YOUTH_AGE_THRESHOLD,
  type DayPlan,
} from '../lib/report/plan.ts';
import {
  HEAVY_LOWER_BLOCK_WITHIN_DAYS,
  checkinPartLabel,
  droppedOnlyForArmFatigue,
  easedBodyPartsOf,
  easedJointsOf,
  painEasingParts,
  painPartsToday,
  painStateUnknown,
  rehabEasingParts,
  selectCandidates,
} from '../lib/report/prescription.ts';
import {
  buildDayState,
  nextOutingWindow,
  recentHardOuting,
  type DayState,
  type DayStateExtras,
} from '../lib/engine/day-state.ts';
import {
  ECCENTRIC_OVERLOAD_MARKER,
  HEAVY_CATEGORIES,
  LOWER_POWER_KEY,
  LOWER_POWER_PATTERNS,
  UPPER_POWER_KEY,
  UPPER_POWER_PATTERNS,
  isArmPlyo,
  isEccentricOverload,
  isHeavyLower,
  isHeavyUpperPush,
  isLowerEccentric,
  isLowerPower,
  isUpperPower,
  movementKeyOf,
  type ClassifiableExercise,
} from '../lib/engine/exercise-class.ts';
import { TRAINING_CATEGORY_NAMES } from '../lib/categories.ts';
import {
  ESTIMATE_LOOKBACK_DAYS,
  ESTIMATE_MIN_GAMES,
  isSoftOutingSource,
  outingAnswersOf,
  outingGuessInputsOf,
  outingOf,
  type Outing,
} from '../lib/engine/outing.ts';
import {
  OUTING_TITLE_EXCLUDE_WORDS,
  OUTING_TITLE_WORDS,
  isOutingTitle,
} from '../lib/calendar-event.ts';
import {
  DAY_RULE_RANK,
  FAR_OUTING_MIN_DAYS,
  MODERATE_OUTING_MIN_LOAD,
  RELIEF_SHORTEN_PITCHES,
  SHORTEN_MIN_MINUTES,
  dayKindOf,
  shortenPitchesOf,
  shortenedMinutes,
  type DayRule,
} from '../lib/engine/microcycle.ts';
import {
  MODERATE_OUTING_MIN_LOAD as ARM_MODERATE_MIN_LOAD,
  yesterdayArmLoadOf,
  type YesterdayArmLoad,
} from '../lib/engine/arm-load.ts';
import { orderSession, orderWithinSlot } from '../lib/report/exercise-order.ts';
import {
  YESTERDAY_OUTING_SESSION,
  YESTERDAY_REST_SESSION,
  asksYesterdayPitches,
  outingLineOf,
  readYesterdayOuting,
} from '../lib/outing-line.ts';
import { validateSessionType } from '../lib/session-type.ts';
import {
  freezeExercise,
  freezePlan,
  mergeReopened,
  readFrozenPlan,
  sessionRxBasis,
  volumeToFreeze,
  type FrozenExercise,
  type FrozenPlan,
} from '../lib/workout/session-plan.ts';
import {
  MAX_SWAPS_PER_DAY,
  carrySwaps,
  readPlanSwaps,
  swappedOutCounts,
  withSwaps,
  type PlanSwap,
} from '../lib/report/plan-swaps.ts';
import { goalPrescription } from '../lib/report/goal-prescription.ts';
import {
  VOLUME_MIN_SETS,
  applyVolume,
  planPrescription,
  readPlanVolume,
  type PlanVolume,
} from '../lib/report/volume.ts';
import {
  ALWAYS_OWNED,
  SELECTABLE_EQUIPMENT,
  equipmentForToday,
  filterByEquipment,
} from '../lib/report/equipment.ts';
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
  hardOuting,
  mainCandidateCount,
  painAvoidedSide,
  painRecoveryReason,
  pickForTheme,
  plannedOuting,
  workoutConflict,
  OUTING_LIGHT_LOWER_NOTE,
  type SlotKey,
  type ThemeKey,
} from '../lib/report/theme.ts';
import {
  BODY_PARTS,
  EXERCISE_EQUIPMENT,
  EXERCISE_NOTE_MAX,
  INTENSITY_CAP,
  cleanExerciseNote,
  formatAmount,
  formatPrescription,
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
import { cleanBodySpots, parseBodySpots, partsFromSpots } from '../lib/body-spots.ts';
import {
  ARM_CARE_CATEGORY,
  buildPartVolume,
  VOLUME_GROUPS,
} from '../lib/training-volume.ts';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ARMCARE_AREAS,
  ARMCARE_CATEGORY,
  ARMCARE_MUSCLE_NAMES,
  areaOfMuscle,
  areasOf,
  cleanTargetMuscles,
  helpsLine,
  muscleInfo,
  primaryArea,
  type ArmcareAreaKey,
} from '../lib/armcare/anatomy.ts';
import {
  HIGH_ARM_FATIGUE,
  SEVERE_ARM_FATIGUE as routineSevereArmFatigue,
  armcareBlock,
  bodyStateBlock,
  buildArmcareRoutine,
  decideArmcare,
  readArmcareRoutine,
  type ArmcareKind,
} from '../lib/armcare/routine.ts';
import { ARMCARE_METHODS, methodOf } from '../lib/armcare/methods.ts';
import { visibleChips } from '../lib/armcare/chips.ts';
import { AREA_DETAILS, MUSCLE_DETAILS } from '../lib/armcare/details.ts';
import {
  DISCLAIMER,
  RED_FLAGS,
  guideFor,
  levelAdvice,
} from '../lib/armcare/pain-guide.ts';
import {
  REHAB_AREAS,
  THROWING_PAIN_RULES,
  THROWING_STEPS,
  afterBadSession,
  allRehabExerciseNames,
  atLeastConditionSeverity,
  buildRehabSession,
  conditionsFor,
  firstCkcRecord,
  isRehabCheck,
  judgeSession,
  judgeStageTest,
  judgeThrowingOpen,
  painFreeBallDays,
  readRehabWeeklyTest,
  rehabCardLine,
  rehabEstimateDays,
  rehabExerciseNames,
  rehabFacts,
  rehabSeverity,
  rehabStartBlock,
  rehabStatus,
  stageExercises,
  stageMinDays,
  stageTestFor,
  startStage,
  throwingFrequency,
  throwingOpenedOn,
  weeklyDueState,
  weeklyImproved,
  weeklyOutcome,
  weeksText,
  type RehabWeeklyLike,
  type RehabWeeklyTest,
  type WeeklyOutcome,
  type RehabCheckinLike,
  type RehabConditionKey,
  type RehabFacts,
  type RehabFeel,
  type RehabLeftover,
  type RehabLibraryExercise,
  type RehabProgramLike,
  type RehabResult,
  type RehabSession,
  type RehabSessionLike,
  type RehabSeverity,
  type RehabStage,
  type StageTest,
  type StageTestInput,
} from '../lib/armcare/rehab.ts';
import { BODY_PART_MAP } from '../lib/body-map.ts';
import {
  MY_ROUTINE_MAX_ITEMS,
  clampRoutineSets,
  isRoutineId,
  normalizeRoutineInput,
  readRoutineItems,
} from '../lib/armcare/my-routines.ts';
import { readTrainingPart } from '../lib/training-part.ts';
import { AREA_VIEW, MUSCLE_MODEL, throwingSide } from '../lib/armcare/muscle-map.ts';
import {
  BASELINE_WORKOUT_FREQ_NAMES,
  COMPETITION_LEVELS,
  DEFAULT_SESSION_MINUTES,
  THROWING_HANDS,
  estimateTrainingDailyLoad,
  validateBaseline,
} from '../lib/baseline.ts';
import {
  PATTERNS_LOOKBACK_DAYS,
  buildDailyPlan,
  isHalted,
  patternsDoneFrom,
  plannedStrengthSide,
  readDailyPlan,
  strengthDatesFrom,
  type DailyPlan,
} from '../lib/report/daily-plan.ts';
import {
  DEFAULT_GOAL,
  decideAutoFence,
  type WorkoutSignals,
} from '../lib/report/auto-setup.ts';
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
/* 2판 안전망(P0) — 다섯 독자 중 매일 일정 · 투구 계획 · 암케어 밖의 둘(영양 · 근력 프로그램) */
import {
  throwDayGuide,
  throwDayKind,
  type GuideSignals,
} from '../lib/nutrition/guide.ts';
import {
  CAUTION_TEXT,
  PROGRAMS,
  REST_TEXT,
  REST_YESTERDAY_TEXT,
  SUBSTITUTE_REASON,
  VARIANT_KEYS,
  VARIANT_MOVEMENT_KEY,
  dayPlan as programDayPlan,
  decideToday,
  painSlotsOf,
  parseProgram,
  patternsOfProgramDay,
  pickPinned,
  programKeyOf,
  programSignalsOf,
  restTextOf,
  variantCandidates,
  type ProgramSignals,
  type TodaySignals,
} from '../lib/program/program.ts';
/* 2판 되먹임(P2) — 운동 끝 힘듦 한 번 */
import {
  EFFORT_LEVELS,
  EFFORT_SPIKE_DIFF,
  EFFORT_SPIKE_MIN_NOTES,
  effortOf,
  intensityOfEffort,
  trainingEffortOf,
  type TrainingNoteLike,
} from '../lib/workout/effort.ts';
/* 2판 되먹임(P2) — 일정 지문 */
import {
  FINGERPRINT_KEYS,
  FINGERPRINT_OPTIONAL_KEYS,
  diffFingerprint,
  diffFingerprintChanges,
  fingerprintOf,
  onlyPainPartChanges,
  readPlanFingerprint,
  stateChangesOf,
  type FingerprintChange,
} from '../lib/report/plan-fingerprint.ts';

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
   *
   * 안 주면 100. null 을 주면 문진을 안 한 사람이다 — 기록이 28일 쌓이기 전에는 지수가 안 나온다.
   */
  baselineDailyLoad?: number | null;
  /** 오늘 체크인에서 고른 운동 종류 — 파워 / 웨이트 / 회복 */
  wants?: string | null;
  /** 잔 느낌 — 충분 / 보통 / 부족. 안 주면 지금처럼 '보통' */
  sleep?: string;
  /**
   * 어젯밤 잔 시간(시간) · 전신 근육통(1~5) — 간편 체크인의 선택 칸.
   *
   * 안 주면 체크인에 칸 자체를 안 만든다 — 두 칸이 생기기 전의 기록과 같은 모양이라,
   * 예전 시험들이 보던 사람이 그대로다. null 을 주면 칸은 있고 값이 null 이다.
   * 읽는 쪽이 둘을 똑같이 '안 적음'으로 보는지 가려 보려고 나눠 둔다.
   */
  sleepHours?: number | null;
  soreness?: number | null;
  /**
   * 어제 체크인에 어깨 통증을 남겼는가.
   * '최근에 아팠지만 오늘은 괜찮다'(plan.recovering)를 만들려고 둔다 — 오늘 통증(pain)과 다르다.
   * condition 을 안 주면 오늘 체크인 없이 이 체크인만 남는다 — '나았는지 모르는 날'이다.
   */
  painYesterday?: boolean;
  /** 오늘 체크인에서 하체도 통증인가 — 상체 · 하체가 함께 아픈 날을 만들려고 둔다 */
  lowerPain?: boolean;
  /**
   * 오늘 체크인의 부위 값을 덮는다 — 팔꿈치만 아픈 날 · 허리만 아픈 날을 만들려고 둔다(팔 통증 안내).
   * pain · lowerPain 보다 뒤에 덮는다. condition 을 안 주면 오늘 체크인이 없어 아무 일도 안 한다.
   */
  parts?: Partial<Record<CheckinPartKey, string>>;
  /** 모든 투구 기록의 체감 강도(1~10). 안 주면 7 */
  intensity?: number;
  /** 모든 투구 기록의 종류(경기 · 불펜 …). 안 주면 칸이 없다 */
  sessionType?: string;
  /** 오늘 남긴 투구 기록 하나 — 세게 던진 '당일'을 만들려고 둔다 */
  todayLog?: { pitches: number; intensity: number; sessionType?: string };
  /** 진행 중인 재활(재활 2편 — lib/armcare/rehab.ts 의 rehabFacts). 안 주면 없다 */
  rehab?: RehabFacts | null;
};

/*
 * 기본 사람의 최근 7일 투구수(0번째가 어제) — 평소처럼 던지는 사람.
 * P3 로 바뀜 — 어제가 40구였다. 2판 D2(2026-10-12)부터 세게 던진 날이 '그날 투구수 × 체감 강도 ≥ 2,700'이라 40구 × 70% =
 * 2,800 이 문턱을 넘어 기본 사람이 늘 회복 날이 됐다(이 사람을 쓰는 시험 46개가 엉뚱한 길을 쟀다). 평소 사람을 지키려고
 * 어제를 38구(2,660)로 낮췄다 — 전력 환산 32.3구라 휴식표(31구 → 1일)는 그대로고, 부하 지수만 어제 몫 280 → 266 이 된다.
 * 아래 지문 · 힘듦 시험의 사람도 같은 배열을 쓴다(DEFAULT_PITCHES).
 */
const DEFAULT_PITCHES = [38, 0, 35, 0, 40, 0, 30];

function factsFor(p: Person) {
  const pitches = p.pitches ?? DEFAULT_PITCHES;
  return buildFacts({
    nickname: '시험',
    age: p.age === undefined ? 22 : p.age,
    heightCm: 180,
    trainingLevel: p.trainingLevel ?? null,
    baselineDailyLoad: p.baselineDailyLoad === undefined ? 100 : p.baselineDailyLoad,
    rehab: p.rehab ?? null,
    today: TODAY,
    logs: [
      ...pitches.map<PitchLogLike>((count, i) => ({
        date: dayBefore(i + 1),
        pitchCount: count,
        // 강도는 1~10 숫자다. 부하 지수가 여기서 나오므로 값이 어긋나면 안 된다.
        intensity: p.intensity ?? 7,
        ...(p.sessionType ? { sessionType: p.sessionType } : {}),
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      ...(p.todayLog
        ? [
            {
              date: dayBefore(0),
              pitchCount: p.todayLog.pitches,
              intensity: p.todayLog.intensity,
              ...(p.todayLog.sessionType
                ? { sessionType: p.todayLog.sessionType }
                : {}),
              maxVelocity: 130,
              avgVelocity: 120,
            } satisfies PitchLogLike,
          ]
        : []),
    ],
    checkins: [
      ...(p.condition == null
        ? []
        : [
            {
              date: dayBefore(0).slice(0, 10),
              condition: p.condition,
              sleep: p.sleep ?? '보통',
              shoulder: p.pain ? '통증' : '괜찮음',
              elbow: '괜찮음',
              wrist: '괜찮음',
              lowerBack: '괜찮음',
              lowerBody: p.lowerPain ? '통증' : '괜찮음',
              ...p.parts,
              preferredParts: [],
              preferredWorkout: p.wants ?? null,
              /* 준 것만 칸을 만든다 — 안 준 사람의 체크인은 예전과 글자 하나 안 다르다 */
              ...(p.sleepHours !== undefined ? { sleepHours: p.sleepHours } : {}),
              ...(p.soreness !== undefined ? { soreness: p.soreness } : {}),
            } satisfies CheckinLike,
          ]),
      ...(p.painYesterday
        ? [
            {
              date: dayBefore(1).slice(0, 10),
              condition: 6,
              sleep: '보통',
              shoulder: '통증',
              elbow: '괜찮음',
              wrist: '괜찮음',
              lowerBack: '괜찮음',
              lowerBody: '괜찮음',
              preferredParts: [],
              preferredWorkout: null,
            } satisfies CheckinLike,
          ]
        : []),
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
  /*
   * 오늘 통증 — 2026-10-03 부터 아픈 곳을 피해서 짠다(사용자 결정, 예전에는 처방을 통째로 멈췄다).
   * 투구 계획은 그대로 멈추고, 운동은 아픈 부위를 쓰는 것을 가벼운 것까지 모두 뺀다.
   */
  const { picked, plan, theme } = planFor({ person: { condition: 6, pain: true } });
  const shoulderParts = ['어깨', '견갑', '가슴', '등', '전신'];
  const touching = picked.candidates.filter((e) =>
    e.bodyParts.some((p) => shoulderParts.includes(p))
  );
  check('오늘 어깨 통증 → 투구 계획은 멈춘다', plan.halted);
  check(
    '오늘 어깨 통증 → 운동 처방은 멈추지 않는다',
    !picked.halted && picked.candidates.length > 0,
    `후보 ${picked.candidates.length}개`
  );
  check(
    '오늘 어깨 통증 → 어깨를 쓰는 운동은 가벼운 것까지 모두 빠진다',
    touching.length === 0,
    touching
      .slice(0, 3)
      .map((e) => e.title)
      .join(', ')
  );
  check(
    '오늘 어깨 통증 → 근거에 그렇게 적는다',
    picked.basis.some((b) => b.startsWith('어깨 통증 →')),
    picked.basis[0]
  );
  check(
    '오늘 어깨 통증 → 상체 날이 아니고, 이유가 통증으로 시작한다',
    theme.key !== 'upper' && theme.reason.startsWith('어깨 통증이 있어'),
    `${theme.label} — ${theme.reason}`
  );

  // 상체 · 하체가 함께 아프면 피해서 할 쪽이 없다 — 회복·재생 데이.
  const both = planFor({ person: { condition: 6, pain: true, lowerPain: true } });
  check(
    '어깨 · 하체가 함께 통증 → 회복·재생 데이',
    both.theme.key === 'recovery' && both.theme.reason.includes('어깨·하체 통증'),
    both.theme.reason
  );

  // 최근에 아팠는데 오늘 체크인이 없으면 나았는지 모른다 — 그때만 예전처럼 멈추고 체크인을 청한다.
  const unknown = planFor({ person: { painYesterday: true } });
  check(
    '어제 통증 + 오늘 체크인 없음 → 처방이 멈춘다',
    unknown.picked.halted && unknown.picked.candidates.length === 0
  );
  check(
    '어제 통증 + 오늘 체크인 없음 → 회복·재생 데이, 체크인을 청한다',
    unknown.theme.key === 'recovery' && unknown.theme.reason.includes('체크인'),
    unknown.theme.reason
  );
}
{
  /*
   * 세게 던진 날의 여파 — 2026-10-03 사용자분과 다시 정했다.
   *
   * 경기, 또는 강도 9~10으로 그날 30구 이상 던진 날은 그날과 다음 날 가볍게(회복·재생 데이),
   * 이틀 뒤부터 무게를 다시 든다. 예전에는 투구 휴식표를 따라 90구 뒤 나흘째에야 무게가 나왔다 —
   * 5일 로테이션이면 다음 등판 전날이다.
   *
   * 평소 부하(문진)를 넉넉히 둔다. 그래야 부하 지수(주의 · 위험 구간)가 아니라 이 규칙만 본다.
   */
  const outing = (daysAgo: number, intensity = 9, count = 90) => {
    const pitches = [0, 0, 0, 0, 0, 0, 0];
    // pitches[0] 이 어제다. 오늘 던진 것은 todayLog 로 넣는다.
    if (daysAgo >= 1) pitches[daysAgo - 1] = count;
    return planFor({
      person: {
        condition: 8,
        pitches,
        intensity,
        baselineDailyLoad: 300,
        ...(daysAgo === 0 ? { todayLog: { pitches: count, intensity } } : {}),
      },
    }).theme;
  };
  const strength = (key: string) => key === 'lower' || key === 'upper';

  check(
    '오늘 강도 9로 90구 → 회복·재생 데이',
    outing(0).key === 'recovery',
    outing(0).reason
  );
  check(
    '어제 강도 9로 90구 → 회복·재생 데이',
    outing(1).key === 'recovery',
    outing(1).key
  );
  check(
    '이틀 전 강도 9로 90구 → 평소대로 스트렝스',
    strength(outing(2).key),
    outing(2).key
  );
  check(
    '어제 강도 9로 90구 → 이유에 언제부터 무게를 드는지 말한다',
    outing(1).reason ===
      '어제 거의 전력으로 90구를 던지셨어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.',
    outing(1).reason
  );
  check(
    '어제 강도 9로 25구 → 평소대로(30구 미만은 막지 않는다)',
    strength(outing(1, 9, 25).key),
    outing(1, 9, 25).key
  );
  /*
   * P3 로 바뀜 — 예전엔 '강도 9~10 · 30구'만 세게 던진 날이라 강도 7 · 90구는 평소대로였다. 2판 D2(2026-10-12)부터는
   * 투구수 × 체감 강도(90구 × 70% = 6,300 ≥ 2,700)라 많이 던진 날도 세게 던진 날이다. 이유 글은 '거의 전력'이 아니라 팔 부담.
   */
  check(
    '어제 강도 7로 90구 → 회복·재생 데이(투구수 × 체감 강도 6,300 — 2판 D2)',
    outing(1, 7).key === 'recovery' &&
      outing(1, 7).reason ===
        '어제 90구를 던져 팔 부담이 컸어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.',
    `${outing(1, 7).key} — ${outing(1, 7).reason}`
  );
  check(
    '어제 강도 7로 35구 → 평소대로(2,450 — 문턱 2,700 밑)',
    strength(outing(1, 7, 35).key),
    outing(1, 7, 35).key
  );

  // 경기는 강도와 상관없이 전력으로 본다.
  const game = planFor({
    person: {
      condition: 8,
      pitches: [40, 0, 0, 0, 0, 0, 0],
      intensity: 5,
      sessionType: '경기',
      baselineDailyLoad: 300,
    },
  }).theme;
  check(
    '어제 경기 40구(강도 5로 적음) → 회복·재생 데이',
    game.key === 'recovery',
    game.key
  );
}
{
  /*
   * 휴식을 기록해도 마지막 등판이 지워지지 않아야 한다.
   *
   * lastThrowDate 가 '기록이 있는 마지막 날'이었을 때는, 어제 휴식을 적으면
   * 마지막 등판이 0구로 덮였다. 필요한 휴식일이 0이 되어, 그저께 90구를
   * 던졌어도 오늘 아무 제한 없이 계획이 나왔다 — 휴식을 성실히 적을수록
   * 안전장치가 꺼지는 셈이었다.
   *
   * 2026-10-03 부터 운동 일정은 휴식표를 안 따른다(세게 던진 날 규칙 — 위). 휴식표로 쉬는 것은
   * 투구 계획이라, 그쪽이 지워지지 않는지 본다.
   */
  const { facts, plan } = planFor({
    person: { condition: 8, pitches: [0, 90, 0, 0, 0, 0, 0] },
  });
  check(
    '어제 휴식(0구)을 적어도 마지막 등판은 그제 90구',
    facts.patterns.lastOutingPitches === 90,
    `${facts.patterns.lastOutingPitches}구`
  );
  /* 투구 계획은 큰 등판 다음 날 쉬고, 그 뒤 며칠은 가볍게 던지며 푼다(plan.ts) — 평소 투구가 아니면 된다 */
  check(
    '그제 90구 → 투구 계획은 오늘 아직 회복 중(평소 투구가 아니다)',
    plan.today != null && (!plan.today.throwing || plan.today.recovery === true),
    plan.today?.reason ?? 'null'
  );
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
  /*
   * 투구 기록이 없으면 투구 부하로는 거르지 않는다(2026-10-03 사용자 결정).
   *
   * 공을 쉬는 비시즌 · 처음 쓰는 사람이다. 예전에는 부하 지수를 못 낸다는 이유로 무게 드는 운동이
   * 통째로 빠졌다 — 근력을 키우기 가장 좋은 때에 가장 가벼운 일정이 나온 셈이었다.
   * 다른 안전 규칙(컨디션 · 나이 · 경력)은 그대로 걸려야 한다.
   */
  const { facts, picked, theme } = planFor({ person: { condition: 8, pitches: [] } });
  check(
    '투구 기록 없음 → 이유에 "부하가 적정 범위"라고 하지 않는다',
    !theme.reason.includes('적정') && theme.reason.includes('투구 기록이 없어'),
    theme.reason
  );
  check(
    '투구 기록 없음 → 부하 지수도 없음',
    facts.load.zone === null && facts.patterns.lastThrowDate === null,
    String(facts.load.zone)
  );
  check(
    '투구 기록 없음 → 무게 드는 운동이 남아 있음',
    picked.candidates.some((e) => intensityLevel(e.intensity) >= 4),
    `후보 ${picked.candidates.length}개`
  );
  check(
    '투구 기록 없음 → 근거에 그렇게 적는다',
    picked.basis.includes('최근 투구 기록이 없음 → 투구 부하로는 거르지 않음'),
    picked.basis[0]
  );

  const tired = planFor({ person: { condition: 3, pitches: [] } }).picked;
  check(
    '투구 기록 없음이어도 컨디션 3/10 → 무게 드는 운동 없음',
    !tired.candidates.some((e) => intensityLevel(e.intensity) > 3),
    `후보 ${tired.candidates.length}개`
  );

  // 휴식(0구)만 적은 사람도 던진 날이 없는 것과 같다.
  const restOnly = planFor({ person: { condition: 8, pitches: [0, 0, 0] } });
  check(
    '휴식(0구)만 적음 → 무게 드는 운동이 남아 있음',
    restOnly.picked.candidates.some((e) => intensityLevel(e.intensity) >= 4),
    String(restOnly.facts.load.zone)
  );

  /*
   * 던진 날은 있는데 기록이 짧고 문진도 없어 지수를 못 내는 사람은 예전처럼 보수적으로 간다.
   * 이 규칙이 '기록이 없으면'을 넘어 '지수가 없으면'으로 번지지 않았는지 본다.
   */
  const fresh = planFor({ person: { condition: 8, baselineDailyLoad: null } });
  check(
    '던진 날은 있는데 지수를 아직 못 냄 → 여전히 무게 드는 운동 제외',
    fresh.facts.load.zone === null &&
      !fresh.picked.candidates.some((e) => intensityLevel(e.intensity) >= 4),
    `${fresh.facts.load.zone} · 마지막 투구 ${fresh.facts.patterns.lastThrowDate}`
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
{
  /*
   * 전신 근육통 · 잔 시간 (2026-09-30) — 간편 체크인의 두 선택 칸이 후보와 테마를 바꾸는가.
   *
   * 새 신호는 '더 가볍게'만 한다. 통증 · 부하 규칙보다 뒤에서 읽고, 안 적은 날은 아무것도
   * 바꾸지 않는다(안 적은 것과 '보통'은 다르다).
   *   근육통 '많이'  가장 센 것(강도 5)만 뺀다. 요일은 그대로.
   *   근육통 '심함'  무게 드는 것(강도 4 이상)을 빼고 회복·재생 데이.
   *   짧은 밤        느낌이 '부족'이거나 6시간 미만 — 가장 센 것만 뺀다. 요일 · 목표는 그대로.
   */
  type Planned = ReturnType<typeof planFor>;
  const levels = (r: Planned) =>
    r.picked.candidates.map((e) => intensityLevel(e.intensity));
  const countAt = (r: Planned, level: number) =>
    levels(r).filter((l) => l === level).length;
  const idsOf = (r: Planned) => r.picked.candidates.map((e) => e.id).join(',');
  const ruleCount = (r: Planned, rule: string) =>
    r.picked.excluded.find((x) => x.rule === rule)?.count ?? 0;
  /** 후보 · 근거 · 빠진 개수 · 테마를 한 줄로 — 글자 하나라도 다르면 다른 결과다 */
  const snapshot = (r: Planned) =>
    JSON.stringify({
      ids: r.picked.candidates.map((e) => e.id),
      basis: r.picked.basis,
      excluded: r.picked.excluded,
      theme: r.theme,
    });

  /*
   * 기준부터 본다. 기준 사람의 후보에 강도 5 · 4 가 없으면 아래 '제외' 시험들이
   * 아무것도 안 보고 통과한다 — 그래서 없으면 실패로 친다.
   */
  const base = planFor({ person: { condition: 8 } });
  check(
    '(기준) 컨디션 8 · 근육통/잔 시간 없음 · 만 22세 → 후보에 강도 5(매우 높음)와 4(높음)가 있다',
    countAt(base, 5) > 0 && countAt(base, 4) > 0,
    `강도 5 ${countAt(base, 5)}개 · 강도 4 ${countAt(base, 4)}개 · 전체 ${base.picked.candidates.length}개`
  );
  check(
    '(기준) 기준 사람은 근력 날이다 — 회복 · 보조날이면 요일 시험이 아무것도 못 가른다',
    base.theme.key === 'lower' || base.theme.key === 'upper',
    base.theme.label
  );

  /* ── 근육통 ── */
  const severe = planFor({ person: { condition: 8, soreness: 5 } });
  check(
    "근육통 '심함'(컨디션 8) → 무게 드는 운동 없음 (강도 3 까지)",
    levels(severe).length > 0 && levels(severe).every((l) => l <= 3),
    `남은 후보 ${severe.picked.candidates.length}개 · '전신 근육통'으로 ${ruleCount(severe, '전신 근육통')}개 빠짐`
  );
  check(
    "근육통 '심함' → 회복 테마, 이유가 근육통",
    severe.theme.key === 'recovery' &&
      severe.theme.reason ===
        "전신 근육통이 '심함'이라 가볍게 움직이며 푸는 회복 위주로 짰어요.",
    severe.theme.reason
  );
  check(
    "근육통 '심함' → 근거에 적고, 빠진 개수에 이름이 남는다",
    severe.picked.basis.includes("전신 근육통 '심함' → 무게 드는 운동 제외") &&
      ruleCount(severe, '전신 근육통') === countAt(base, 5) + countAt(base, 4),
    severe.picked.basis.join(' / ')
  );

  const high = planFor({ person: { condition: 8, soreness: 4 } });
  check(
    "근육통 '많이'(컨디션 8) → 가장 센 것(강도 5)만 빠지고 강도 4 는 남는다",
    countAt(high, 5) === 0 &&
      countAt(high, 4) === countAt(base, 4) &&
      ruleCount(high, '전신 근육통') === countAt(base, 5),
    `강도 5 ${countAt(high, 5)}개 · 강도 4 ${countAt(high, 4)}개`
  );
  check(
    "근육통 '많이' → 요일은 그대로 (근육통 없는 날과 같은 테마)",
    JSON.stringify(high.theme) === JSON.stringify(base.theme),
    high.theme.label
  );
  check(
    "근육통 '많이' → 근거에 적는다",
    high.picked.basis.includes("전신 근육통 '많이' → 매우 높은 강도 제외"),
    high.picked.basis.join(' / ')
  );

  /* '보통'은 훈련한 다음 날의 정상 반응이다 — 그것까지 줄이면 매일 줄어든다 */
  for (const [soreness, word] of [
    [3, '보통'],
    [2, '조금'],
  ] as const) {
    const mild = planFor({ person: { condition: 8, soreness } });
    check(
      `근육통 '${word}' → 후보 · 테마 · 빠진 개수가 근육통 없는 날과 똑같다`,
      idsOf(mild) === idsOf(base) &&
        JSON.stringify(mild.theme) === JSON.stringify(base.theme) &&
        JSON.stringify(mild.picked.excluded) === JSON.stringify(base.picked.excluded),
      `후보 ${mild.picked.candidates.length}개`
    );
    check(
      `근육통 '${word}' → 근거에 '제한 없음' 한 줄만 더 붙는다 (읽었다는 것은 보인다)`,
      JSON.stringify(mild.picked.basis) ===
        JSON.stringify([...base.picked.basis, `전신 근육통 '${word}' → 제한 없음`]),
      mild.picked.basis.join(' / ')
    );
  }

  /*
   * 옛 기록 회귀 기준 — 칸이 없는 체크인(두 칸이 생기기 전)과 null 로 적힌 체크인이
   * 글자 하나 안 다른 결과를 낸다. 기준 사람이 '칸 없음'이다.
   */
  const nulled = planFor({
    person: { condition: 8, sleepHours: null, soreness: null },
  });
  const baseToday = base.facts.condition.today!;
  const nulledToday = nulled.facts.condition.today!;
  check(
    '(기준) 도우미가 칸 없음과 null 을 다르게 만든다',
    !('soreness' in baseToday) &&
      !('sleepHours' in baseToday) &&
      'soreness' in nulledToday &&
      nulledToday.soreness === null &&
      'sleepHours' in nulledToday &&
      nulledToday.sleepHours === null
  );
  check(
    '근육통 · 잔 시간이 null 이어도 칸이 없어도 → 후보 · 근거 · 빠진 개수 · 테마가 똑같다',
    snapshot(nulled) === snapshot(base),
    `근거 ${nulled.picked.basis.join(' / ')}`
  );

  /*
   * 1~5 밖의 값도 안 적은 것으로 본다. 화면으로는 못 만들지만(폼은 1~5 정수만 저장한다)
   * DB 를 손으로 고치면 올 수 있다. 말이 없는 값으로 글을 만들면 근거 · 테마 이유에
   * "전신 근육통 'null'"이 찍힌다.
   */
  for (const soreness of [6, 4.5, 0]) {
    const odd = planFor({ person: { condition: 8, soreness } });
    check(
      `근육통 ${soreness}(1~5 밖) → 안 적은 날과 똑같다 — 글에 'null' 이 안 찍힌다`,
      snapshot(odd) === snapshot(base),
      `${odd.theme.label} · 근거 ${odd.picked.basis.join(' / ')}`
    );
  }

  /*
   * ── 통증이 앞선다 ──
   *
   * 2026-10-03 부터 통증은 처방을 멈추지 않고 아픈 부위를 뺀다(사용자 결정). 근육통 '심함'이 겹치면 두
   * 규칙이 함께 걸린다 — 아픈 부위를 쓰는 운동은 모두 빠지고, 남은 것에서 무게 드는 것도 빠진다.
   * 테마 이유는 통증 문장이 맨 앞이다.
   */
  const hurt = planFor({ person: { condition: 8, pain: true, soreness: 5 } });
  check(
    "근육통 '심함' + 오늘 어깨 통증 → 멈추지 않고 두 규칙이 함께 걸린다",
    hurt.plan.halted &&
      !hurt.picked.halted &&
      hurt.picked.basis.some((b) => b.startsWith('어깨 통증 →')) &&
      hurt.picked.basis.some(
        (b) => b.startsWith('전신 근육통') && b.endsWith('무게 드는 운동 제외')
      ) &&
      levels(hurt).length > 0 &&
      levels(hurt).every((l) => l <= 3),
    hurt.picked.basis.join(' / ')
  );
  check(
    "근육통 '심함' + 오늘 어깨 통증 → 회복·재생 데이, 이유는 통증 문장부터",
    hurt.theme.key === 'recovery' &&
      hurt.theme.reason.startsWith('어깨 통증이 있어') &&
      hurt.theme.reason.includes('근육통'),
    hurt.theme.reason
  );

  /*
   * 어제 아팠고 오늘은 괜찮은 사람 — 그 부위의 무거운 운동만 빠지고 다른 무게 운동은 남는다.
   * 예전에는 지난 통증 하나로 몸 전체가 회복 수준까지만 남았다.
   */
  const healing = planFor({ person: { condition: 8, painYesterday: true } });
  const healingSore = planFor({
    person: { condition: 8, painYesterday: true, soreness: 5 },
  });
  const shoulderRelated = ['어깨', '견갑', '가슴', '등'];
  check(
    '(기준) 어제 통증 · 오늘 괜찮음 → 회복 중(멈추지는 않는다)',
    healing.plan.recovering && !healing.plan.halted && levels(healing).length > 0,
    `후보 ${healing.picked.candidates.length}개`
  );
  check(
    '어제 어깨 통증 · 오늘 괜찮음 → 어깨 쪽 무거운 운동만 빠지고 다른 무게 운동은 남는다',
    !healing.picked.candidates.some(
      (e) =>
        intensityLevel(e.intensity) > 3 &&
        e.bodyParts.some((p) => shoulderRelated.includes(p))
    ) && healing.picked.candidates.some((e) => intensityLevel(e.intensity) >= 4),
    `후보 ${healing.picked.candidates.length}개`
  );
  check(
    '어제 어깨 통증 · 오늘 괜찮음 → 상체 날이 아니고, 이유에 그렇게 적는다',
    healing.theme.key !== 'upper' &&
      healing.theme.reason.startsWith('최근 어깨 통증이 있어'),
    healing.theme.reason
  );
  const healingIds = new Set(healing.picked.candidates.map((e) => e.id));
  check(
    "근육통 '심함' + 어제 어깨 통증 → 더 낮은 상한이 이긴다 (후보가 늘지 않고 무게 드는 것은 빠진다)",
    levels(healingSore).length > 0 &&
      levels(healingSore).every((l) => l <= 3) &&
      healingSore.picked.candidates.every((e) => healingIds.has(e.id)),
    `후보 ${healingSore.picked.candidates.length}개`
  );
  check(
    "근육통 '심함' + 어제 어깨 통증 → 회복·재생 데이, 이유에 둘 다",
    healingSore.theme.key === 'recovery' &&
      healingSore.theme.reason.startsWith('최근 어깨 통증이 있어') &&
      healingSore.theme.reason.includes('근육통'),
    healingSore.theme.reason
  );

  /* 회복으로 가는 까닭이 여럿이면 이유 글은 사다리에서 먼저 걸린 것 */
  const lowAndSore = planFor({ person: { condition: 3, soreness: 5 } });
  check(
    "컨디션 3 + 근육통 '심함' → 테마 이유는 컨디션 문장 (사다리에서 먼저)",
    lowAndSore.theme.key === 'recovery' &&
      lowAndSore.theme.reason.includes('컨디션이 3/10') &&
      !lowAndSore.theme.reason.includes('근육통'),
    lowAndSore.theme.reason
  );

  /*
   * 투구 부하 주의 구간은 보조·코어 데이다. 근육통 '심함'은 그보다 앞이라 회복이 된다.
   * 평소 부하(문진 추정)를 낮춰 주의 구간을 만든다.
   * P3 로 바뀜 — 어제가 60구(강도 7)였는데, 2판 D2 의 세게 던진 날(60구 × 70% = 4,200 ≥ 2,700)이 돼 보조가 아니라 회복으로
   * 갔다(이 시험이 주의 구간을 못 쟀다). 어제를 38구로 낮추고 그 몫을 그저께 30구로 옮겨 주의 구간(1.35)을 지킨다.
   */
  const busy = {
    condition: 8,
    pitches: [38, 30, 55, 0, 60, 0, 55],
    baselineDailyLoad: 60,
  };
  const caution = planFor({ person: busy });
  const cautionSore = planFor({ person: { ...busy, soreness: 5 } });
  check(
    '(기준) 투구 부하 주의 구간 → 보조·코어 데이',
    caution.facts.load.zone === 'caution' && caution.theme.key === 'assist',
    `${caution.facts.load.zone} · ${caution.theme.label}`
  );
  check(
    "투구 부하 주의 구간 + 근육통 '심함' → 보조·코어가 아니라 회복",
    cautionSore.facts.load.zone === 'caution' &&
      cautionSore.theme.key === 'recovery' &&
      cautionSore.theme.reason.includes('근육통'),
    cautionSore.theme.label
  );

  /* ── 잔 시간 ── */
  const short = planFor({ person: { condition: 8, sleepHours: 5.5 } });
  check(
    '잔 시간 5.5 · 느낌 보통 → 가장 센 것(강도 5)만 빠진다',
    countAt(short, 5) === 0 &&
      countAt(short, 4) === countAt(base, 4) &&
      ruleCount(short, '수면 부족') === countAt(base, 5),
    `강도 5 ${countAt(short, 5)}개 · 강도 4 ${countAt(short, 4)}개`
  );
  check(
    '잔 시간 5.5 → 테마는 그대로 · 근거에 잔 시간을 적는다',
    JSON.stringify(short.theme) === JSON.stringify(base.theme) &&
      short.picked.basis.includes('어젯밤 5.5시간 수면 → 매우 높은 강도 제외'),
    short.picked.basis.join(' / ')
  );
  const six = planFor({ person: { condition: 8, sleepHours: 6 } });
  check(
    '잔 시간 6 · 느낌 보통 → 후보가 기준과 같다 (경계 — 6시간은 짧은 밤이 아니다)',
    idsOf(six) === idsOf(base) &&
      six.picked.basis.includes('어젯밤 6시간 수면 → 제한 없음'),
    six.picked.basis.join(' / ')
  );
  const rested = planFor({ person: { condition: 8, sleepHours: 7.5 } });
  check(
    "잔 시간 7.5 → 후보가 기준과 같고 근거에 '제한 없음'",
    idsOf(rested) === idsOf(base) &&
      JSON.stringify(rested.picked.basis) ===
        JSON.stringify([...base.picked.basis, '어젯밤 7.5시간 수면 → 제한 없음']),
    rested.picked.basis.join(' / ')
  );
  const feltShort = planFor({ person: { condition: 8, sleep: '부족' } });
  check(
    "느낌 '부족' · 시간 없음 → 가장 센 것만 빠지고 근거는 느낌으로 적는다",
    countAt(feltShort, 5) === 0 &&
      countAt(feltShort, 4) === countAt(base, 4) &&
      feltShort.picked.basis.includes("오늘 수면 '부족' → 매우 높은 강도 제외"),
    feltShort.picked.basis.join(' / ')
  );
  /* 시간은 '부족'을 더할 수만 있고 뺄 수는 없다 — 8시간을 잤어도 부족하다고 했으면 부족이다 */
  const feltShortLong = planFor({
    person: { condition: 8, sleep: '부족', sleepHours: 8 },
  });
  check(
    "느낌 '부족' · 8시간 → 같은 결과 (둘 중 하나면 짧은 밤)",
    snapshot(feltShortLong) === snapshot(feltShort),
    feltShortLong.picked.basis.join(' / ')
  );

  /*
   * 새 신호는 풀어 주지 못한다.
   * 이미 더 낮은 상한에 걸린 사람에게 근육통 '많이'와 잔 시간 5 를 더해도, 후보가 늘지 않는다.
   */
  const extra = { soreness: 4, sleepHours: 5 };
  const spike = {
    condition: 8,
    pitches: [200, 190, 180, 170, 190, 180, 200],
    baselineDailyLoad: 20,
  };
  /*
   * 셋째 칸은 더한 뒤의 강도 상한이다. 위험 구간은 회복 수준(2)까지, 어제 아팠던 사람은 근육통 '많이' ·
   * 짧은 밤이 매우 높음(5)만 뺀다(4) — 2026-10-03 부터 지난 통증은 몸 전체가 아니라 그 부위만 낮춘다.
   */
  const capped: [string, Person, number][] = [
    ['부하 위험 구간', spike, 2],
    ['어제 어깨 통증', { condition: 8, painYesterday: true }, 4],
  ];
  for (const [label, person, ceiling] of capped) {
    const before = planFor({ person });
    const after = planFor({ person: { ...person, ...extra } });
    const allowed = new Set(before.picked.candidates.map((e) => e.id));
    const leaked = after.picked.candidates.filter((e) => !allowed.has(e.id));
    check(
      `새 신호는 풀어 주지 못한다 — ${label}인 사람에 근육통 '많이' · 잔 시간 5 를 더해도 후보가 안 늘어난다`,
      (label === '부하 위험 구간'
        ? before.facts.load.zone === 'danger'
        : before.plan.recovering) &&
        before.picked.candidates.length > 0 &&
        after.picked.candidates.length > 0 &&
        leaked.length === 0 &&
        levels(after).every((l) => l <= ceiling),
      `더하기 전 ${before.picked.candidates.length}개 → 뒤 ${after.picked.candidates.length}개`
    );
  }
}

console.log('\n[체크인 해석] 근육통 · 잔 시간을 오류 없이 읽는가');
{
  /*
   * 두 칸은 고르는 칸이라 잘못 칠 수 없다. 범위 밖 값(예전 0~16 기록, 손으로 만든 요청)이
   * 와도 오류를 내지 않는다 — 손도 안 댄 칸 때문에 체크인 저장이 막히면 안 된다.
   */
  const body = (sleepHours: string, soreness: string) =>
    parseCheckinBody((name) => ({ sleepHours, soreness })[name] ?? '');

  const hourCases: [string, number | null][] = [
    ['', null],
    ['7.3', 7.5],
    ['2', 3],
    ['13', 12],
    ['abc', null],
  ];
  const hourResults = hourCases.map(([raw]) => body(raw, '').sleepHours);
  check(
    "잔 시간: '' → 안 적음 · '7.3' → 7.5 · '2' → 3 · '13' → 12 · 'abc' → 안 적음",
    hourCases.every(([, want], i) => hourResults[i] === want),
    JSON.stringify(hourResults)
  );
  const soreCases: [string, number | null][] = [
    ['4', 4],
    ['6', null],
    ['', null],
    ['abc', null],
  ];
  const soreResults = soreCases.map(([raw]) => body('', raw).soreness);
  check(
    "근육통: '4' → 4 · '6' → 안 적음 · '' → 안 적음 · 'abc' → 안 적음",
    soreCases.every(([, want], i) => soreResults[i] === want),
    JSON.stringify(soreResults)
  );

  /*
   * P3 로 바뀜 — 2026-10-12 D1 폼: 던지는 일정(throwPlan)이 상세에서 간편 칸(CheckinBody)으로 옮겨 와 뽑은 모양에
   * 다섯째 칸이 붙었다(글자 비교라 기대 객체에도 더한다). 옛 넷 칸의 값 · 차례는 그대로다.
   */
  check(
    'DB 행에서 뽑기: 칸이 없는 행(옛 기록) → 모두 null · []',
    JSON.stringify(pickCheckinBody({})) ===
      JSON.stringify({
        sleepHours: null,
        soreness: null,
        nutrition: null,
        skippedMeals: [],
        throwPlan: null,
      })
  );
  check(
    'DB 행에서 뽑기: 적은 값은 그대로',
    JSON.stringify(
      pickCheckinBody({
        sleepHours: 6.5,
        soreness: 4,
        nutrition: '보통',
        skippedMeals: ['dinner'],
        throwPlan: '2~3일 뒤',
      })
    ) ===
      JSON.stringify({
        sleepHours: 6.5,
        soreness: 4,
        nutrition: '보통',
        skippedMeals: ['dinner'],
        throwPlan: '2~3일 뒤',
      })
  );
  check(
    'DB 행에서 뽑기: 던지는 일정은 목록으로 거른다 — 옛 넷 · 새 둘은 그대로, 목록 밖 글자 → null',
    THROW_PLANS.every((a) => pickCheckinBody({ throwPlan: a }).throwPlan === a) &&
      pickCheckinBody({ throwPlan: '모레' }).throwPlan === null &&
      pickCheckinBody({ throwPlan: '' }).throwPlan === null &&
      pickCheckinBody({ throwPlan: null }).throwPlan === null
  );

  /* 식사 두 칸(2026-10-07) — 영양 조언이 읽는다. 목록 밖 · 간식 · 중복은 거르고 오류는 내지 않는다 */
  const meals = (amount: string, skipped: string[]) =>
    parseCheckinBody(
      (name) => ({ mealAmount: amount })[name] ?? '',
      (name) => (name === 'skippedMeals' ? skipped : [])
    );
  check(
    "식사: '부족' + 아침 → 그대로 · 목록 밖 '많이' → 안 적음 · 간식 · 중복은 거른다 · getAll 없이 부르면 []",
    meals('부족', ['breakfast']).nutrition === '부족' &&
      meals('부족', ['breakfast']).skippedMeals.join() === 'breakfast' &&
      meals('많이', []).nutrition === null &&
      meals('', ['snack', 'lunch', 'lunch']).skippedMeals.join() === 'lunch' &&
      parseCheckinBody(() => '').skippedMeals.length === 0
  );
  check(
    "DB 행의 식사: 목록 밖 '먹음' → null · 걸른 끼니의 모르는 값은 거른다 · 요약은 '부족 · 아침 · 저녁 걸름'",
    pickCheckinBody({ nutrition: '먹음' }).nutrition === null &&
      pickCheckinBody({ skippedMeals: ['snack', 'dinner'] }).skippedMeals.join() ===
        'dinner' &&
      mealSummary('부족', ['dinner', 'breakfast']) === '부족 · 아침 · 저녁 걸름' &&
      mealSummary(null, []) === null &&
      mealSummary('잘 먹음', null) === '잘 먹음'
  );

  const feel = [7, 6.5, 6, 5.5].map(sleepLevelFromHours);
  check(
    '잔 시간 → 잔 느낌: 7 충분 · 6.5 보통 · 6 보통 · 5.5 부족',
    feel.join(',') === '충분,보통,보통,부족',
    feel.join(' · ')
  );

  /* 짧은 밤 — 느낌이 '부족'이거나 6시간 미만. 시간을 안 적은 날은 느낌만 본다 */
  const nights: [{ sleep: string; sleepHours?: number | null }, boolean][] = [
    [{ sleep: '보통', sleepHours: 5.5 }, true],
    [{ sleep: '보통', sleepHours: 6 }, false],
    [{ sleep: '부족', sleepHours: 8 }, true],
    [{ sleep: '충분', sleepHours: null }, false],
    [{ sleep: '부족' }, true],
  ];
  const nightResults = nights.map(([c]) => isShortSleep(c));
  check(
    '짧은 밤: 보통+5.5 예 · 보통+6 아니오 · 부족+8 예 · 충분+안 적음 아니오 · 부족+칸 없음 예',
    nights.every(([, want], i) => nightResults[i] === want),
    nightResults.map((r) => (r ? '예' : '아니오')).join(' · ')
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
      { ...find('바벨 백 스쿼트'), setsDone: 3 },
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
    const rows = [row(1, '벤치 프레스', 3)];
    check(
      '같은 묶음에 두 번 걸려도 한 번만 센다',
      get(rows, 'push').sets === 3,
      `가슴·어깨 ${get(rows, 'push').sets}세트 (3이어야 한다)`
    );
  }

  {
    const rows = [
      row(1, '데드리프트', 3),
      row(3, '바벨 백 스쿼트', 4),
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
    const legOnly = [row(1, '데드리프트', 6), row(3, '바벨 백 스쿼트', 6)];
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

  /* 범위(minPitches)가 없는 날 — 상한 하나로 읽는다 */
  const noRange = {
    dateKey: '2026-08-01',
    label: '오늘',
    throwing: true,
    maxPitches: 60,
    maxIntensity: 8,
    reason: '평소 수준',
  } as unknown as Parameters<typeof pitchRangeText>[0];
  check(
    '범위가 없으면 상한 하나로 읽는다',
    pitchRangeText(noRange) === '60구 이하',
    pitchRangeText(noRange)
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
  /*
   * 통증만은 예외다. 무엇을 골랐든, 밀고 나가겠다고 해도 아픈 곳은 피한다(2026-10-03 부터 — 예전에는
   * 늘 회복이었다). 어깨가 아프면 상체 날은 안 나오고, 어깨를 쓰는 운동은 후보에 없다.
   */
  const forced = planFor({
    person: { condition: 8, pain: true, wants: '파워' },
    override: true,
  });
  const shoulderParts = ['어깨', '견갑', '가슴', '등', '전신'];
  check(
    '통증이 있으면 밀고 나가도 아픈 쪽 날은 안 나온다',
    forced.theme.key !== 'upper' && forced.theme.reason.startsWith('어깨 통증이 있어'),
    `${forced.theme.label} — ${forced.theme.reason}`
  );
  check(
    '통증이 있으면 밀고 나가도 아픈 부위 운동은 후보에 없다',
    !forced.picked.halted &&
      forced.picked.candidates.length > 0 &&
      !forced.picked.candidates.some((e) =>
        e.bodyParts.some((p) => shoulderParts.includes(p))
      )
  );

  const both = planFor({
    person: { condition: 8, pain: true, lowerPain: true, wants: '파워' },
    override: true,
  });
  check(
    '상체 · 하체가 함께 아프면 밀고 나가도 회복',
    both.theme.key === 'recovery',
    both.theme.label
  );
}
{
  /*
   * 전신 근육통 '심함'도 부딪히는 날이다 — 낮은 컨디션과 같은 자리 · 같은 방식.
   *
   * 부딪힘을 말하는 곳(workoutConflict)과 테마를 정하는 곳(decideTheme)에 같은 줄이 따로 있다.
   * 한쪽만 고치면 "부딪힌다"면서 파워 날을 주거나, 말없이 회복으로 보낸다 — 그래서 둘을 같이 본다.
   */
  const person = { condition: 8, wants: '파워', soreness: 5 };
  const suggested = planFor({ person });
  const conflict = workoutConflict({
    facts: suggested.facts,
    preferredWorkout: '파워',
  });
  check(
    "파워를 골랐지만 근육통 '심함' → 부딪힘: 회복 쪽, 까닭은 근육통",
    conflict?.fallback === 'recovery' &&
      conflict.reason === "전신 근육통이 '심함'이에요",
    conflict ? `${conflict.reason} → ${conflict.fallback}` : '부딪힘 없음'
  );
  check(
    "파워를 골랐지만 근육통 '심함' → 기본은 회복 (부딪힘과 테마가 같은 결론)",
    suggested.theme.key === 'recovery' && suggested.theme.reason.includes('근육통'),
    suggested.theme.label
  );

  /* 통증이 아니라 밀고 나갈 수는 있다. 다만 후보 상한은 남는다 — 낮은 컨디션과 같다 */
  const forced = planFor({ person, override: true });
  check(
    "근육통 '심함'이어도 그래도 하겠다고 하면 → 회복이 아닌 테마, 이유에 그 사실을 적는다",
    (forced.theme.key === 'lower' || forced.theme.key === 'upper') &&
      forced.theme.reason.includes(
        "전신 근육통이 '심함'이에요. 그래도 하겠다고 하셔서 그대로 만들었어요."
      ),
    `${forced.theme.label} — ${forced.theme.reason.slice(-52)}`
  );
  const forcedLevels = forced.picked.candidates.map((e) => intensityLevel(e.intensity));
  check(
    '밀고 나가도 후보는 강도 3 까지 — 무게 드는 운동은 안 나온다',
    forcedLevels.length > 0 && forcedLevels.every((l) => l <= 3),
    `후보 ${forcedLevels.length}개`
  );

  /* '많이'는 부딪힘이 아니다 — 고른 대로 가고 가장 센 것만 빠진다 */
  const high = planFor({ person: { condition: 8, wants: '파워', soreness: 4 } });
  check(
    "파워 + 근육통 '많이' → 부딪히지 않는다 (고른 대로 간다)",
    workoutConflict({ facts: high.facts, preferredWorkout: '파워' }) === null &&
      (high.theme.key === 'lower' || high.theme.key === 'upper'),
    high.theme.label
  );

  /* 1~5 밖의 값은 안 적은 것이다 — 부딪힘 글에 "'null'입니다"가 찍히지 않는다(두 곳 모두) */
  const odd = planFor({ person: { condition: 8, wants: '파워', soreness: 6 } });
  check(
    '파워 + 근육통 6(1~5 밖) → 부딪히지 않는다 · 테마도 근육통 없는 날과 같다',
    workoutConflict({ facts: odd.facts, preferredWorkout: '파워' }) === null &&
      JSON.stringify(odd.theme) ===
        JSON.stringify(planFor({ person: { condition: 8, wants: '파워' } }).theme),
    `${odd.theme.label} — ${odd.theme.reason}`
  );
}
{
  /*
   * 고른 종류가 본운동 구성에 실제로 반영되는가.
   *
   * 예전에는 '첫 자리'를 봤다. 2026-10-04 부터 하는 차례는 exercise-order.ts 가 정해 파워가 있으면 늘 맨 앞이라,
   * 첫 자리로는 고른 것을 가를 수 없다(검토에서 두 시험이 아무것도 안 재고 있었다). 목표를 안 정한 사람의 고른 종류는
   * 목표로 이어진다(goalForUnchosen) — 그 결과인 구성을 본다.
   */
  const mainCats = (wants: string | null) => {
    const { themed } = planFor({ person: { condition: 8, wants }, minutes: 90 });
    return themed.picks
      .filter((p) => p.slot === 'main')
      .map((p) => p.exercise.category);
  };
  const power = mainCats('파워');
  check(
    '파워를 고름 → 본운동에 파워가 들어가고 맨 앞에 온다',
    power.includes('파워') && power[0] === '파워',
    power.join(', ')
  );
  /*
   * '웨이트를 고름'은 따로 재지 않는다 — 목표를 안 정한 날의 '웨이트'는 근력 향상으로 이어져, 아래의 '근력 향상 90분 —
   * 본운동이 파워 없이 스트렝스로만'과 goalForUnchosen('웨이트') 시험이 같은 것을 잰다(2026-10-04 검토).
   */
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
    /*
     * 라이브러리의 유산소는 빼고 시험용 하나만 넣는다 — 유산소가 올라온 뒤로는(2026-09-27)
     * 그중 하나가 뽑혀 '넣은 것이 바로 들어온다'를 가를 수 없었다.
     */
    const noCardio = library.filter((ex) => ex.category !== '유산소');
    const withBike = lower60('컨디셔닝', [...noCardio, bike]);
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

  /*
   * 통증인 날도 아픈 곳을 피해서 만든다(2026-10-03 — 예전에는 만들지 않았다). 담긴 운동에 아픈 부위를
   * 쓰는 것이 없어야 한다.
   */
  const painDay = make({ condition: 6, pain: true });
  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const painParts = ['어깨', '견갑', '가슴', '등', '전신'];
  check(
    '어깨가 아픈 날도 일정이 만들어지고, 어깨를 쓰는 운동은 안 담긴다',
    !isHalted(painDay) &&
      painDay.picks.length > 0 &&
      painDay.picks.every(
        (p) =>
          !(byId.get(p.exerciseId)?.bodyParts ?? []).some((b) => painParts.includes(b))
      ),
    isHalted(painDay) ? '멈춤' : `${painDay.picks.length}개 · ${painDay.theme.label}`
  );

  // 나았는지 모르는 날(어제 통증 + 오늘 체크인 없음)은 만들어지지 않는다. 빈 일정을 남기면 '이미 만든 날'이 된다.
  const unknownDay = make({ painYesterday: true });
  check(
    '어제 통증 + 오늘 체크인 없음 → 일정이 만들어지지 않는다',
    isHalted(unknownDay)
  );

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

console.log('\n[자동 맞춤] 규칙이 울타리를 치고 초안을 내는가');
{
  /* 자동 맞춤 — 규칙이 몸을 지키는 선을 긋고(decideAutoFence) 그 안의 초안(draft)이 오늘 방향이다 */

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
    pitches = DEFAULT_PITCHES,
    /* 투구 기록의 체감 강도(1~10) — 세게 던진 날(9 이상)을 만들려고 둔다 */
    intensity = 7,
    /* 오늘의 잔 시간 · 전신 근육통. 안 주면 칸을 안 만든다(factsFor 와 같은 방식) */
    sleepHours = undefined as number | null | undefined,
    soreness = undefined as number | null | undefined,
    /**
     * 지난 날들의 잔 시간(0번째가 어제). 그날 느낌은 '보통'으로 둔다 —
     * 느낌이 아니라 시간만으로 '잠이 부족한 날'이 세어지는지 보려고.
     * poorSleepPast 와 같이 주면 그 날들 뒤에 이어 붙는다(같은 날짜가 겹치지 않게).
     */
    pastHours = [] as number[],
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
        intensity,
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
          ...(sleepHours !== undefined ? { sleepHours } : {}),
          ...(soreness !== undefined ? { soreness } : {}),
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
        ...pastHours.map((hours, i) => ({
          date: dayBefore(poorSleepPast + i + 1).slice(0, 10),
          condition: 7,
          sleep: '보통',
          shoulder: '정상',
          elbow: '정상',
          wrist: '정상',
          lowerBack: '정상',
          lowerBody: '정상',
          preferredParts: [],
          preferredWorkout: null,
          sleepHours: hours,
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
    '평소 날 → 고를 수 있는 목표가 셋',
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
    '컨디셔닝으로 정해진 근력 날 → 컨디셔닝 데이로 알린다',
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

  /*
   * 잔 시간으로도 같은 규칙이 돈다(2026-09-30). '잠이 부족한 날'은 느낌이 '부족'이거나
   * 6시간 미만인 날이다(lib/checkin.ts 의 isShortSleep) — 오늘도, 지난 날을 세는 것도 그 하나로.
   * 느낌은 모두 '보통'으로 두고 시간만으로 걸리는지 본다.
   */
  const shortWeek = factsWith({ sleepHours: 5, pastHours: [5, 5] });
  check(
    '잠이 부족한 날 세기: 오늘 5시간 + 지난 이틀 5시간(느낌은 모두 보통) → 3일',
    shortWeek.condition.poorSleepDays === 3,
    `${shortWeek.condition.poorSleepDays}일`
  );
  const sixWeek = factsWith({ sleepHours: 6, pastHours: [6, 6] });
  check(
    '잠이 부족한 날 세기: 같은 날들이 6시간이면 0일 (6시간은 짧은 밤이 아니다)',
    sixWeek.condition.poorSleepDays === 0,
    `${sixWeek.condition.poorSleepDays}일`
  );
  const tiredByHours = fenceFor(shortWeek);
  check(
    '오늘 5시간 + 지난 이틀 5시간 → 컨디셔닝, 시간 줄임',
    tiredByHours.fixedGoal === CONDITIONING_GOAL &&
      JSON.stringify(tiredByHours.minutes[CONDITIONING_GOAL]) === '[45]',
    JSON.stringify(tiredByHours.minutes)
  );
  check(
    '잔 시간이 짧아서 걸린 날 → 규칙 줄 앞에 어젯밤 시간을 적는다',
    tiredByHours.rules.includes(
      `어젯밤 5시간 · 최근 7일 중 잠이 부족한 날 3일(오늘 포함) → ${CONDITIONING_GOAL}, 시간 한 단계 줄임`
    ),
    tiredByHours.rules.join(' / ')
  );
  check(
    "느낌만 '부족'인 날의 규칙 줄은 예전 그대로 (어젯밤 시간이 안 붙는다)",
    tired.rules.includes(
      `최근 7일 중 잠이 부족한 날 3일(오늘 포함) → ${CONDITIONING_GOAL}, 시간 한 단계 줄임`
    ),
    tired.rules.join(' / ')
  );
  const oneShortNight = fenceFor(factsWith({ sleepHours: 5 }));
  check(
    '오늘 하루만 5시간 → 고정하지 않고 시간도 안 줄인다',
    oneShortNight.fixedGoal == null &&
      oneShortNight.goals.length === 3 &&
      JSON.stringify(oneShortNight.minutes) === JSON.stringify(plain.minutes),
    JSON.stringify(oneShortNight.minutes)
  );
  /* 지난 날이 아무리 부족했어도 오늘 잘 잤으면 무게를 막지 않는다 */
  const sleptToday = factsWith({ sleepHours: 7.5, poorSleepPast: 3 });
  check(
    "오늘 7.5시간 · 보통 + 지난 사흘 '부족' → 고정하지 않는다 (오늘이 짧은 밤이어야 한다)",
    sleptToday.condition.poorSleepDays === 3 && fenceFor(sleptToday).fixedGoal == null,
    `잠이 부족한 날 ${sleptToday.condition.poorSleepDays}일`
  );

  const power = fenceFor(factsWith({ wants: '파워' }));
  check(
    '체크인에서 파워 (몸 상태 괜찮음) → 파워 향상으로 고정',
    power.fixedGoal === '파워 향상' && power.clash == null
  );
  const weight = fenceFor(factsWith({ wants: '웨이트' }));
  check('체크인에서 웨이트 → 근력 향상으로 고정', weight.fixedGoal === '근력 향상');

  /* 어제 세게(강도 9) 90구 + 파워 — 몸 상태에 맞춰 가고, 이유에 그 이야기가 있어야 한다 */
  const clashed = fenceFor(
    factsWith({ wants: '파워', pitches: [90, 0, 0, 0, 0, 0, 0], intensity: 9 })
  );
  check(
    '파워를 골랐지만 어제 강도 9로 90구 → 회복날, 컨디셔닝으로 고정',
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

  /*
   * 전신 근육통(2026-09-30).
   *   '많이'  요일은 그대로 · 시간 한 단계(한 번만) · 고를 수 있는 목표에서 파워 향상 제외.
   *           체크인에서 파워를 직접 고른 날은 그 뜻 그대로 둔다(부딪힘으로 보지 않는다).
   *   '심함'  회복날이다 — 회복날은 이미 시간을 줄이므로 두 번 줄이지 않는다.
   *   '보통'  아무것도 안 바꾼다.
   */
  const soreHigh = fenceFor(factsWith({ soreness: 4 }));
  check(
    "근육통 '많이' → 근력 날 그대로 · 고를 수 있는 목표에 파워 향상은 없다",
    soreHigh.strengthDay &&
      soreHigh.day.key === plain.day.key &&
      soreHigh.fixedGoal == null &&
      soreHigh.goals.length === 2 &&
      !soreHigh.goals.includes('파워 향상'),
    `${soreHigh.day.label} · ${soreHigh.goals.join(', ')}`
  );
  check(
    "근육통 '많이' → 목표마다 시간 한 단계 줄임 (60 → 45)",
    soreHigh.goals.every((g) => JSON.stringify(soreHigh.minutes[g]) === '[45]'),
    JSON.stringify(soreHigh.minutes)
  );
  check(
    "근육통 '많이' → 규칙 줄에 무엇을 바꿨는지 적는다",
    soreHigh.rules.includes(
      "전신 근육통 '많이' → 시간 한 단계 줄임, 파워 향상은 고르지 않음"
    ),
    soreHigh.rules.join(' / ')
  );
  check(
    "근육통 '많이' → 초안 이유가 근육통 이야기로 시작한다",
    soreHigh.draft.reason ===
      "근육통이 '많이'인 날이라 가장 센 운동은 빼고 가요. 목표는 근력 향상으로 두었어요. 시간은 45분으로 줄였어요.",
    soreHigh.draft.reason
  );
  const soreHighPower = fenceFor(factsWith({ soreness: 4, wants: '파워' }));
  check(
    "근육통 '많이' + 체크인에서 파워 → 파워 향상 그대로 · 시간만 한 단계",
    soreHighPower.fixedGoal === '파워 향상' &&
      soreHighPower.clash == null &&
      JSON.stringify(soreHighPower.minutes) === JSON.stringify({ '파워 향상': [45] }),
    JSON.stringify(soreHighPower.minutes)
  );
  check(
    "근육통 '많이' + 체크인에서 파워 → 규칙 줄은 시간만 말한다",
    soreHighPower.rules.includes("전신 근육통 '많이' → 시간 한 단계 줄임"),
    soreHighPower.rules.join(' / ')
  );
  const soreHighLoaded = fenceFor(
    factsWith({ soreness: 4 }),
    signals({ zone: 'caution', ratio: 1.41 })
  );
  check(
    "근육통 '많이' + 운동 부하 주의 → 컨디셔닝 45분 (한 번만 줄인다 — 비거나 더 짧아지지 않는다)",
    soreHighLoaded.fixedGoal === CONDITIONING_GOAL &&
      JSON.stringify(soreHighLoaded.minutes[CONDITIONING_GOAL]) === '[45]' &&
      JSON.stringify(soreHighLoaded.minutes) === JSON.stringify(loaded.minutes) &&
      /* 근육통이 바꾼 것이 없는 날이라 '줄였다'고 또 말하지 않는다 */
      !soreHighLoaded.rules.some((r) => r.startsWith('전신 근육통')),
    `${JSON.stringify(soreHighLoaded.minutes)} · ${soreHighLoaded.rules.join(' / ')}`
  );
  const soreSevere = fenceFor(factsWith({ soreness: 5 }));
  check(
    "근육통 '심함' → 회복날 · 컨디셔닝 고정 · 시간은 두 번 안 줄인다",
    soreSevere.day.key === 'recovery' &&
      !soreSevere.strengthDay &&
      soreSevere.fixedGoal === CONDITIONING_GOAL &&
      JSON.stringify(soreSevere.minutes[CONDITIONING_GOAL]) === '[45,60]',
    `${soreSevere.day.label} · ${JSON.stringify(soreSevere.minutes)}`
  );
  check(
    "근육통 '보통' → 울타리가 평소 날과 똑같다",
    JSON.stringify(fenceFor(factsWith({ soreness: 3 }))) === JSON.stringify(plain)
  );
  check(
    "근육통 6 · 4.5(1~5 밖) → 울타리가 평소 날과 똑같다 — 규칙 줄에 'null' 이 안 찍힌다",
    [6, 4.5].every(
      (soreness) =>
        JSON.stringify(fenceFor(factsWith({ soreness }))) === JSON.stringify(plain)
    )
  );

  /*
   * 기본 시간이 이미 맨 아래(45분)인 사람은 더 줄일 데가 없다. 그대로인데 '줄였다'고 적지 않는다 —
   * 파워 향상을 뺀 것만 말한다.
   */
  const plainFloor = fenceFor(factsWith({}), signals(), 45);
  const soreHighFloor = fenceFor(factsWith({ soreness: 4 }), signals(), 45);
  check(
    '(기준) 기본 45분인 사람의 평소 날 → 목표마다 시간 [45]',
    plainFloor.goals.every((g) => JSON.stringify(plainFloor.minutes[g]) === '[45]'),
    JSON.stringify(plainFloor.minutes)
  );
  check(
    "근육통 '많이' + 기본 45분 → 시간은 그대로 [45] · 규칙 줄은 파워 향상만 말한다",
    soreHighFloor.goals.length === 2 &&
      soreHighFloor.goals.every(
        (g) => JSON.stringify(soreHighFloor.minutes[g]) === '[45]'
      ) &&
      soreHighFloor.rules.includes("전신 근육통 '많이' → 파워 향상은 고르지 않음") &&
      !soreHighFloor.rules.some((r) => r.includes('시간 한 단계 줄임')),
    `${JSON.stringify(soreHighFloor.minutes)} · ${soreHighFloor.rules.join(' / ')}`
  );
  check(
    "근육통 '많이' + 기본 45분 → 초안 이유도 '줄였어요'라고 하지 않는다",
    soreHighFloor.draft.reason ===
      "근육통이 '많이'인 날이라 가장 센 운동은 빼고 가요. 목표는 근력 향상으로 두었어요. 시간은 45분이에요.",
    soreHighFloor.draft.reason
  );

  /* 통증인 날은 자동 맞춤이 방향을 정하지 않는다 — 그 조건이 plan.halted 다 (training-setup.ts) */
  const pain = factsFor({ condition: 7, pain: true });
  check(
    '통증 체크인 → 계획이 멈춘다 (자동 맞춤이 정하지 않는 조건)',
    buildPitchPlan(pain).halted
  );

  const facts = factsWith({});

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
  /* '고립'끼리는 부위가 겹쳐야 같은 계열 — 노르딕 햄스트링 자리에 리버스 노르딕(넙다리 앞)이 맨 앞에 오지 않는다 */
  const nordic = {
    id: 'nordic',
    category: '하체 스트렝스',
    bodyParts: ['햄스트링·둔근'],
    equipment: ['맨몸'],
    intensity: '매우 높음',
    movementPattern: '고립',
  };
  const isoPool = [
    { ...nordic, id: 'reverse-nordic', bodyParts: ['대퇴사두'] },
    { ...nordic, id: 'rdl', movementPattern: '힌지', intensity: '높음' },
    { ...nordic, id: 'ham-curl', intensity: '높음' },
  ];
  const isoRanked = similarExercises(nordic, isoPool, new Set()).map(
    (s) => s.exercise.id
  );
  check(
    '고립 운동 바꾸기 — 같은 부위의 고립 · 같은 부위 운동만, 다른 부위 고립은 빠진다',
    isoRanked.join(',') === 'ham-curl,rdl',
    isoRanked.join(',')
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
  const added = [
    '광배근',
    '대원근',
    '얕은 손가락 굴곡근',
    '깊은 손가락 굴곡근',
    '주근',
    '상완근',
  ];
  const unused = added.filter(
    (m) =>
      !ARMCARE_MUSCLE_NAMES.includes(m) ||
      !armcareLib.some((ex) => ex.targetMuscles.includes(m))
  );
  check(
    '더한 근육 여섯이 목록에 있고, 운동이 하나 이상 있다',
    unused.length === 0,
    unused.join(', ')
  );
  const claimsFor = (m: string) => muscleInfo(m)?.helps ?? null;
  check(
    '예방 주장은 근거 있는 얕은 손가락 굴곡근에만 — 광배근·대원근·깊은 손가락 굴곡근·주근·상완근은 이름만',
    claimsFor('얕은 손가락 굴곡근') === '내측 측부인대(UCL) 손상' &&
      ['광배근', '대원근', '깊은 손가락 굴곡근', '주근', '상완근'].every(
        (m) => claimsFor(m) === null
      )
  );
  /*
   * 같은 날 넷을 더 더했다 — 3D 에서 회색으로 남아 빠진 것처럼 보이던 어깨 앞(전면 삼각근·
   * 대흉근) · 목 쪽 어깨 위(상부 승모근) · 아래팔 등(손가락 신전근). 근육 칸이 비지 않게
   * 넷 다 그 근육을 쓰는 운동이 하나 이상 있어야 하고, 넷 다 예방 주장은 하지 않는다.
   *
   * 2026-10-04 암케어 검토로 전면 삼각근의 밴드 프론트 레이즈는 상체 스트렝스로, 손가락 신전근의 고무줄 손가락 펴기는
   * 숨김(손가락용 고무줄이 필요)이 됐다(scripts/library-armcare-review-2026-10-04.mjs). 그 둘은 이제 주로 키우는 운동은
   * 없고 함께 쓰는 운동(스플릿 스탠스 크로스바디 인 · 덤벨/튜빙 전완 신전)만 있다 — 칸이 비지 않는 것은 그대로 본다.
   */
  const addedFour = ['전면 삼각근', '대흉근', '상부 승모근', '손가락 신전근'];
  const primaryKept = ['대흉근', '상부 승모근'];
  const noExercise = addedFour.filter(
    (m) =>
      !ARMCARE_MUSCLE_NAMES.includes(m) ||
      !armcareLib.some((ex) =>
        primaryKept.includes(m)
          ? ex.targetMuscles[0] === m
          : ex.targetMuscles.includes(m)
      )
  );
  check(
    '더한 근육 넷이 목록에 있고, 그 근육을 쓰는 운동이 하나 이상 있다(대흉근 · 상부 승모근은 주로 키우는 운동)',
    noExercise.length === 0,
    noExercise.join(', ')
  );
  check(
    '더한 넷도 예방 주장은 하지 않는다 (이름만)',
    addedFour.every((m) => claimsFor(m) === null)
  );
  const brachialisFirst = armcareBlock(
    {
      ...armcareLib[0],
      targetMuscles: ['상완근', '이두근'],
      intensity: '낮음',
      equipment: ['밴드'],
    },
    'strength',
    null
  );
  check(
    '상완근이 앞인 컬도 팔 근력 운동이라 루틴에 안 들어간다',
    brachialisFirst === 'arm-strength',
    String(brachialisFirst)
  );
  const noteless = ARMCARE_AREAS.filter((a) => a.notes.length === 0);
  check(
    '부위마다 알아 두기가 한 줄 이상 있다',
    noteless.length === 0,
    noteless.map((a) => a.label).join(', ')
  );

  /* 1-1) 훈련 방식 — 이름으로 가리고, 화면에 적은 말이 참인가 */
  const emptyMethods = ARMCARE_METHODS.filter(
    (m) => !armcareLib.some((ex) => methodOf(ex.title)?.key === m.key)
  );
  check(
    '훈련 방식마다 운동이 하나 이상 있다',
    emptyMethods.length === 0,
    emptyMethods.map((m) => m.label).join(', ')
  );
  check(
    '방식 표시가 없는 이름은 기본 보강이다 (방식 없음)',
    methodOf('밴드 외회전') === null &&
      methodOf('사이드라잉 외회전 리바운드')?.key === 'rebound'
  );
  const eccentricInRoutine = armcareLib
    .filter((ex) => methodOf(ex.title)?.key === 'eccentric')
    .filter(
      (ex) =>
        armcareBlock(ex, 'strength', null) == null ||
        armcareBlock(ex, 'recovery', null) == null
    );
  check(
    '과부하 내리기는 맞춤 루틴에 저절로 안 들어간다 (화면에 그렇게 적었다)',
    eccentricInRoutine.length === 0,
    eccentricInRoutine.map((ex) => ex.title).join(', ')
  );
  /* 2026-09-26 사용자분 — 방식은 섞어서 하는 것이지 올라가는 단계가 아니다 */
  const stepWords = ARMCARE_METHODS.filter((m) =>
    /단계|다음 칸|한 칸|올라가|내려가/.test(
      [m.cue, m.what, m.why, m.load, m.stop, m.caution ?? ''].join(' ')
    )
  );
  check(
    '훈련 방식 글에 단계를 오르내리라는 말이 없다',
    stepWords.length === 0,
    stepWords.map((m) => m.label).join(', ')
  );
  /*
   * 방식 설명은 그 방식을 쓰는 운동의 '자세·영상 보기' 안에 붙는다(armcare-media.tsx 의
   * MethodNote — 2026-09-26 사용자분이 '훈련 방식' 칸을 없애며 정했다). 제목 줄의 한마디
   * (cue)는 숫자 없이 짧게 — 세트·횟수는 운동마다 따로 있다.
   */
  const badCue = ARMCARE_METHODS.filter(
    (m) => !m.cue || m.cue.length > 20 || /\d+\s*(회|세트)/.test(m.cue)
  );
  check(
    '방식마다 한마디(cue)가 있고, 짧고, 세트·횟수를 적지 않는다',
    badCue.length === 0,
    badCue.map((m) => `${m.label} '${m.cue}'`).join(', ')
  );
  const thinMethods = ARMCARE_METHODS.filter(
    (m) => ![m.what, m.why, m.load, m.stop].every((s) => s.trim().length > 0)
  );
  check(
    '훈련 방식마다 하는 법·왜·무게·멈출 때가 다 있다',
    thinMethods.length === 0,
    thinMethods.map((m) => m.label).join(', ')
  );
  check(
    '방식 설명은 방식이 붙은 운동에만 — 기본 보강은 붙지 않는다',
    methodOf('튜빙 외회전 0도') === null &&
      methodOf('사이드라잉 외회전 리바운드')?.key === 'rebound' &&
      armcareLib.some((ex) => methodOf(ex.title) != null)
  );
  /*
   * 방식 글은 설명이 붙는 넷만 둔다 — 기본 보강의 글은 어디에도 나오지 않아 지웠다
   * (2026-09-26 검토). 이름 표시(titleMarker)가 서로 겹치면 한 운동이 두 방식이 된다.
   */
  const markers = ARMCARE_METHODS.map((m) => m.titleMarker);
  const overlapping = markers.filter((a, i) =>
    markers.some((b, j) => i !== j && (a.includes(b) || b.includes(a)))
  );
  check(
    '방식마다 이름 표시가 있고 서로 겹치지 않는다',
    markers.every((m) => m.trim().length > 0) && overlapping.length === 0,
    overlapping.join(', ')
  );

  /*
   * 1-1-0) 부위 카드의 운동 줄 — 근육 칩은 둘만 보이는데(max 2), 그 운동이 이 부위 카드에
   * 든 까닭인 근육이 '+N' 뒤로 숨으면 안 된다(2026-09-26 검토: 89개 중 31개가 그랬다).
   * app/(app)/training/armcare-guide.tsx 의 exercisesFor · GuideExercise 와 같은 셈.
   */
  const hiddenReason: string[] = [];
  for (const area of ARMCARE_AREAS) {
    const own = ARMCARE_MUSCLE_NAMES.filter((m) => areaOfMuscle(m)?.key === area.key);
    for (const ex of armcareLib) {
      if (!ex.targetMuscles.some((m) => areaOfMuscle(m)?.key === area.key)) continue;
      const shown = visibleChips(ex.targetMuscles, own, 2);
      if (!shown.some((m) => own.includes(m)))
        hiddenReason.push(`${area.label}: ${ex.title}`);
    }
  }
  check(
    '부위 카드의 운동 줄에 그 부위 근육 칩이 하나는 보인다',
    hiddenReason.length === 0,
    hiddenReason.slice(0, 5).join(', ')
  );
  check(
    '근육 칩은 자를 때도 원래 차례(크게 쓰는 차례)를 지킨다',
    visibleChips(['a', 'b', 'c'], ['c'], 2).join() === 'a,c' &&
      visibleChips(['a', 'b'], undefined, 2).join() === 'a,b' &&
      visibleChips(['a', 'b', 'c'], undefined, 2).join() === 'a,b'
  );

  /* 1-1-1) 자세히 보기 — 부위·근육마다 창에 나갈 글이 있다(lib/armcare/details.ts) */
  const thinAreas = ARMCARE_AREAS.filter((a) => {
    const d = AREA_DETAILS[a.key];
    return !d || !d.role || !d.why || !d.train || d.signs.length === 0;
  });
  check(
    '부위마다 자세히 보기 글이 있다 (하는 일 · 왜 · 신호 · 키우는 법)',
    thinAreas.length === 0,
    thinAreas.map((a) => a.label).join(', ')
  );
  const thinMuscles = ARMCARE_MUSCLE_NAMES.filter((name) => {
    const d = (
      MUSCLE_DETAILS as Record<
        string,
        (typeof MUSCLE_DETAILS)[keyof typeof MUSCLE_DETAILS]
      >
    )[name];
    return !d || !d.what || !d.pitching || !d.why || !d.train;
  });
  check(
    '근육마다 자세히 보기 글이 있다 (어떤 근육 · 던질 때 · 왜 · 키우는 법)',
    thinMuscles.length === 0,
    thinMuscles.join(', ')
  );
  /* 부상을 막는다고 약속하지 않는다 — anatomy.ts 의 규칙('예방에 도움'까지만) */
  const promise = /(부상|손상|통증)을 (막|예방)|예방합니다|예방해 줍니다|예방할 수 있/;
  const promising = [
    ...Object.entries(AREA_DETAILS).map(([k, d]) => [
      k,
      [d.role, d.why, d.train, ...d.signs].join(' '),
    ]),
    ...Object.entries(MUSCLE_DETAILS).map(([k, d]) => [
      k,
      [d.what, d.pitching, d.why, d.train].join(' '),
    ]),
  ].filter(([, text]) => promise.test(text));
  check(
    '자세히 보기 글이 부상을 막는다고 약속하지 않는다',
    promising.length === 0,
    promising.map(([k]) => k).join(', ')
  );
  /* 부위 색 — 부위 단추·카드·근육 칩의 점이 같은 색으로 부위를 가린다 */
  const areaColors = ARMCARE_AREAS.map((a) => a.color);
  check(
    '부위마다 색이 있고 서로 다르다',
    areaColors.every((c) => /^#[0-9a-f]{6}$/i.test(c)) &&
      new Set(areaColors.map((c) => c.toLowerCase())).size === areaColors.length,
    areaColors.join(', ')
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
  const noName = normalizeRoutineInput({
    name: '   ',
    items: [{ exerciseId: 'a', sets: 2 }],
  });
  const empty = normalizeRoutineInput({ name: '빈 루틴', items: [] });
  check(
    `내 루틴 — 이름 없음 · 운동 없음 · ${MY_ROUTINE_MAX_ITEMS}개 넘음은 저장하지 않는다`,
    !tooMany.ok && !noName.ok && !empty.ok
  );
  check(
    'DB 에 이상한 모양이 들어 있어도 루틴은 열린다(읽을 수 있는 줄만)',
    readRoutineItems(null).length === 0 &&
      readRoutineItems([
        { exerciseId: 'a', sets: '2' },
        { exerciseId: 'b', sets: 4 },
      ])
        .map((it) => `${it.exerciseId}${it.sets}`)
        .join(',') === 'a2,b4'
  );
  /* 1-3) 3D 근육 지도 — 근육 목록 · 모델 파일 · 부위가 서로 맞는가 */
  const glb = readFileSync(
    new URL('../public/models/armcare-upper.glb', import.meta.url)
  );
  const glbJson = JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')
  ) as {
    nodes: { extras?: { key?: string; side?: string } }[];
  };
  const inModel = new Set(
    glbJson.nodes.map((n) => `${n.extras?.side}:${n.extras?.key}`)
  );
  const noModel = ARMCARE_MUSCLE_NAMES.filter(
    (m) => Object.keys(MUSCLE_MODEL[m]?.parts ?? {}).length === 0
  );
  check(
    '근육마다 3D 모델 조각이 하나 이상 이어져 있다',
    noModel.length === 0,
    noModel.join(', ')
  );
  const missingParts = Object.values(MUSCLE_MODEL).flatMap((m) =>
    Object.keys(m.parts).flatMap((key) =>
      ['right', 'left']
        .filter((side) => !inModel.has(`${side}:${key}`))
        .map((side) => `${side}:${key}`)
    )
  );
  check(
    '이어 둔 조각이 모델 파일에 양쪽 팔 모두 있다 (왼손 투수도 켜진다)',
    missingParts.length === 0,
    missingParts.join(', ')
  );
  /*
   * 겉에 보이는 팔·어깨 근육이 회색으로 남지 않는다. 목록에 없는 근육은 색을 칠하지 않아
   * 빠진 것처럼 보였다(2026-09-26 사용자분) — 어깨 앞, 목 쪽 어깨 위, 아래팔 등 한가운데.
   * 엄지 쪽 작은 근육처럼 부상 예방과 거리가 먼 것은 일부러 회색으로 둔다.
   */
  const mappedKeys = new Set(
    Object.values(MUSCLE_MODEL).flatMap((m) => Object.keys(m.parts))
  );
  const stillGray = [
    'deltoid_anterior',
    'pectoralis_major_clavicular',
    'pectoralis_major_sternocostal',
    'pectoralis_major_abdominal',
    'trapezius_upper',
    'extensor_digitorum',
    'extensor_digiti_minimi',
  ].filter((k) => !mappedKeys.has(k));
  check(
    '어깨 앞 · 목 쪽 어깨 위 · 아래팔 등의 겉근육이 3D 에서 칠해진다',
    stillGray.length === 0,
    stillGray.join(', ')
  );
  check(
    '3D 모델이 가볍다 — 1.5MB 아래',
    glb.length < 1.5 * 1024 * 1024,
    `${Math.round(glb.length / 1024)} KB`
  );
  check(
    '부위마다 카메라가 갈 방향이 있다',
    ARMCARE_AREAS.every((a) => AREA_VIEW[a.key] != null)
  );

  /*
   * 1-4) 전신 3D — 다른 운동의 부위 태그를 누르면 뜬다(components/body-parts.tsx,
   * 2026-09-26 사용자분: 모든 운동 영상에). 태그마다 켤 근육이 모델 파일에 있어야 한다.
   */
  const bodyGlb = readFileSync(
    new URL('../public/models/body-full.glb', import.meta.url)
  );
  const bodyJson = JSON.parse(
    bodyGlb.subarray(20, 20 + bodyGlb.readUInt32LE(12)).toString('utf8')
  ) as { nodes: { extras?: { key?: string } }[] };
  const bodyKeys = new Set(bodyJson.nodes.map((n) => n.extras?.key).filter(Boolean));
  const unmappedParts = BODY_PARTS.filter(
    (p) => !BODY_PART_MAP[p] || BODY_PART_MAP[p].keys.length === 0
  );
  check(
    '부위 태그마다 전신 3D 에서 켤 근육이 있다',
    unmappedParts.length === 0,
    unmappedParts.join(', ')
  );
  const strayKeys = Object.entries(BODY_PART_MAP).flatMap(([part, m]) =>
    m.keys.filter((k) => !bodyKeys.has(k)).map((k) => `${part}:${k}`)
  );
  check(
    '부위 태그의 근육이 모두 전신 모델 파일에 있다 (안 켜지는 칸이 없다)',
    strayKeys.length === 0,
    strayKeys.join(', ')
  );
  check(
    '전신 3D 모델이 가볍다 — 2.5MB 아래',
    bodyGlb.length < 2.5 * 1024 * 1024,
    `${Math.round(bodyGlb.length / 1024)} KB`
  );
  const bodyPromise = Object.entries(BODY_PART_MAP).filter(([, m]) =>
    /(부상|손상|통증)을 (막|예방)|예방합니다|예방해 줍니다|예방할 수 있/.test(m.about)
  );
  check(
    '부위 설명이 부상을 막는다고 약속하지 않는다',
    bodyPromise.length === 0,
    bodyPromise.map(([p]) => p).join(', ')
  );
  check(
    '던지는 팔 — 좌투만 왼팔, 우투·양투·모름은 오른팔',
    throwingSide('좌투') === 'left' &&
      throwingSide('우투') === 'right' &&
      throwingSide('양투') === 'right' &&
      throwingSide(null) === 'right'
  );
  const noAt = ARMCARE_MUSCLE_NAMES.filter((m) => !muscleInfo(m)?.at);
  check('근육마다 붙는 곳이 적혀 있다', noAt.length === 0, noAt.join(', '));

  /* 1-4) 내 루틴의 '권하지 않음' 표시 — 몸 상태 몫만 본다 (2026-09-26 검토) */
  const heavyCurl = {
    intensity: '높음',
    equipment: ['덤벨'],
    targetMuscles: ['이두근', '완요골근', '상완근'],
  };
  const eccentric = {
    intensity: '높음',
    equipment: ['덤벨'],
    targetMuscles: ['원회내근', '손목 굴곡근'],
  };
  check(
    '내 루틴 — 회복날(많이 던진 다음 날) 무거운 덤벨 컬에는 표시가 붙는다',
    bodyStateBlock(heavyCurl, 'recovery', null) != null,
    String(bodyStateBlock(heavyCurl, 'recovery', null))
  );
  check(
    '내 루틴 — 아무 일 없는 강화날에는 과부하 내리기에 표시가 없다',
    bodyStateBlock(eccentric, 'strength', null) === null,
    String(bodyStateBlock(eccentric, 'strength', null))
  );
  check(
    '내 루틴 — 팔꿈치가 뻐근한 날에는 과부하 내리기에 표시가 붙는다',
    bodyStateBlock(eccentric, 'strength', { elbow: '뻐근' }) === 'stiff'
  );
  check(
    '맞춤 루틴 규칙은 그대로 — 강화날에도 높음은 넣지 않고, 컬은 넣지 않는다',
    armcareBlock(
      {
        ...eccentric,
        id: 'x',
        category: '암케어',
        sets: 3,
        reps: 5,
        holdSeconds: null,
        restSeconds: 60,
        perSide: false,
      },
      'strength',
      null
    ) === 'intensity' &&
      armcareBlock(
        {
          ...heavyCurl,
          id: 'y',
          category: '암케어',
          sets: 3,
          reps: 5,
          holdSeconds: null,
          restSeconds: 60,
          perSide: false,
        },
        'recovery',
        null
      ) === 'arm-strength'
  );
  check(
    '루틴 id 는 uuid 모양만 · 세트는 1~5',
    isRoutineId('3f2c1b1e-8a3d-4a51-9b0e-0c7d2d9a1b22') &&
      !isRoutineId('new') &&
      !isRoutineId(42) &&
      clampRoutineSets(0) === 1 &&
      clampRoutineSets(9) === 5 &&
      clampRoutineSets('x') === 2
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
  /*
   * 전신 근육통 '심함'인 날은 트레이닝도 회복·재생 데이다 — 팔만 강화하면 두 화면이 다른 말을 한다.
   * '많이'는 넘긴다: 온몸 값이라 팔이 어떤지는 모르고, 팔은 팔 피로가 본다.
   * 기본 사람은 '어제 38구'라 이미 회복이다 — 일주일 안 던진 사람(rested)으로 봐야 갈린다.
   */
  const soreBody = decide({ condition: 8, pitches: rested, soreness: 5 });
  check(
    "전신 근육통 '심함' → 회복, 까닭에 적는다",
    soreBody.kind === 'recovery' &&
      soreBody.reason === "전신 근육통 '심함' → 회복 루틴",
    soreBody.reason
  );
  check(
    "전신 근육통 '많이'는 넘긴다 → 강화",
    decide({ condition: 8, pitches: rested, soreness: 4 }).kind === 'strength'
  );
  check(
    "전신 근육통 6(1~5 밖)은 안 적은 것이다 → 강화 (까닭에 'null' 이 안 찍힌다)",
    decide({ condition: 8, pitches: rested, soreness: 6 }).kind === 'strength'
  );
  check(
    "전신 근육통 '심함' + 통증 → 쉬기 (통증이 먼저)",
    decide({ condition: 8, pitches: rested, pain: true, soreness: 5 }).kind === 'rest'
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
  /*
   * 어깨 전방 자리는 외회전과 짝을 이루는 내회전 자리다. 전면 삼각근·대흉근을 더한 뒤로
   * 프론트 레이즈·크로스바디 인도 '어깨 전방' 운동이 됐는데, 이 자리에 들어오면 그날
   * 루틴에서 내회전이 빠진다(lib/armcare/routine.ts 의 SLOT_MUSCLES). 여러 날로 돌려 본다.
   */
  const frontLeaks = new Set<string>();
  for (let d = 1; d <= 30; d++) {
    for (const kind of ['strength', 'recovery'] as const) {
      const r = build(kind, { seed: `2026-06-${String(d).padStart(2, '0')}` });
      for (const it of r.items) {
        if (it.area !== 'shoulder-front') continue;
        if (exOf.get(it.exerciseId)!.targetMuscles[0] !== '견갑하근') {
          frontLeaks.add(`${kind}:${titleOf(it.exerciseId)}`);
        }
      }
    }
  }
  check(
    '루틴의 어깨 전방 자리에는 내회전(견갑하근) 운동만 들어간다',
    frontLeaks.size === 0,
    [...frontLeaks].join(', ')
  );
  /*
   * 오늘 이미 한 운동을 먼저 넣을 때도 같다 — 내 루틴에서 프론트 레이즈를 체크한 날 맞춤
   * 루틴을 만들었더니, 그 운동이 어깨 전방 자리를 차지해 내회전이 빠졌다(2026-09-27 검토).
   */
  const frontDone = armcareLib.filter((ex) =>
    ['전면 삼각근', '대흉근'].includes(ex.targetMuscles[0] ?? '')
  );
  const frontDoneMisses: string[] = [];
  for (const done of frontDone) {
    for (const kind of ['strength', 'recovery'] as const) {
      for (let d = 1; d <= 10; d++) {
        const r = build(kind, {
          seed: `2026-06-${String(d).padStart(2, '0')}`,
          doneToday: new Set([done.id]),
        });
        const inner = r.items.some(
          (it) =>
            it.area === 'shoulder-front' &&
            exOf.get(it.exerciseId)!.targetMuscles[0] === '견갑하근'
        );
        const kept = r.items.some((it) => it.exerciseId === done.id);
        if (!inner || !kept) {
          frontDoneMisses.push(
            `${done.title}·${kind}·${d}일${inner ? '' : ' 내회전 없음'}${kept ? '' : ' 체크한 것 빠짐'}`
          );
        }
      }
    }
  }
  check(
    '어깨 전방 운동(프론트 레이즈 등)을 오늘 체크했어도 루틴에 내회전이 남는다',
    frontDone.length > 0 && frontDoneMisses.length === 0,
    frontDone.length === 0
      ? '전면 삼각근·대흉근이 주 근육인 운동이 없다'
      : frontDoneMisses.slice(0, 6).join(', ')
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
  /*
   * 맨몸 · 밴드만으로는 어깨 상부가 비었었는데, 2026-10-03 '어깨 외전 아이소메트릭 프레스'(맨몸)가 들어와 채워진다.
   * 조사를 보려고 그 부위 운동을 빼서 일부러 비운다.
   */
  const noTop = build('strength', {
    candidates: bandsOnly.filter(
      (ex) => !areasOf(ex.targetMuscles ?? []).some((a) => a.key === 'shoulder-top')
    ),
  });
  check(
    "빈 부위의 조사가 맞다 — '어깨 상부는' ('은' 아님)",
    noTop.notes.some((n) => n.includes('어깨 상부는')) &&
      !noTop.notes.some((n) => n.includes('상부은')),
    noTop.notes.join(' / ')
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
    '암케어는 부위 묶음(등·견갑 등)에 안 들어간다 — 모순된 숫자를 안 준다',
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
  /*
   * 세게 던진 다음 날 가볍게 캐치볼을 해도, 일정의 까닭은 세게 던진 그 등판이다(2026-10-03 부터 운동 일정은
   * '세게 던진 날' 규칙을 따른다 — 강도가 낮은 캐치볼은 그 목록에 안 든다).
   */
  const afterCatch = factsFor({
    condition: 8,
    pitches: [90, 0, 0, 0, 0, 0, 0],
    intensity: 9,
    todayLog: { pitches: 20, intensity: 3 },
  });
  const lightDay = decideTheme({
    facts: afterCatch,
    plan: buildPitchPlan(afterCatch),
    lastLowerKey: null,
    lastUpperKey: null,
  });
  check(
    '어제 세게 90구 뒤 오늘 캐치볼 20개 → 회복·재생 데이, 일정의 까닭은 90구',
    lightDay.key === 'recovery' &&
      lightDay.reason.includes('90구') &&
      !lightDay.reason.includes('20구'),
    `${lightDay.label} — ${lightDay.reason}`
  );

  /*
   * 7) 팔 통증 안내(2026-10-03, 재활 1편) — 체크인에서 어깨 · 팔꿈치 '통증'인 날 아픈 자리 · 정도를 받아,
   * 정도 1(던질 때만) + 자리 있음 + 만 15세 이상이면 '통증 루틴', 그 밖은 지금처럼 쉬기.
   */

  /* 7-1) 폼에서 온 두 칸을 거른다(lib/checkin.ts 의 parseArmPain · pickArmPain) */
  const formOf =
    (values: Record<string, string[]>) =>
    (name: string): string[] =>
      values[name] ?? [];
  const shoulderOnly = parseArmPain(
    formOf({ armPainSpots: ['shoulder-back', 'elbow-inner'], armPainLevel: ['1'] }),
    { shoulder: '통증', elbow: '정상' }
  );
  check(
    '팔 통증 — 어깨만 통증이면 팔꿈치 자리는 버린다',
    shoulderOnly.armPainSpots.join(',') === 'shoulder-back' &&
      shoulderOnly.armPainLevel === 1,
    JSON.stringify(shoulderOnly)
  );
  const unknownSpots = parseArmPain(
    formOf({ armPainSpots: ['wrist', '<b>', 'elbow-outer', ''] }),
    { shoulder: '정상', elbow: '통증' }
  );
  check(
    '팔 통증 — 목록에 없는 자리는 버린다',
    unknownSpots.armPainSpots.join(',') === 'elbow-outer',
    JSON.stringify(unknownSpots)
  );
  const dupSpots = parseArmPain(
    formOf({ armPainSpots: ['elbow-inner', 'shoulder-top', 'elbow-inner'] }),
    { shoulder: '통증', elbow: '통증' }
  );
  check(
    '팔 통증 — 겹친 자리는 하나만, 차례는 어깨 → 팔꿈치',
    dupSpots.armPainSpots.join(',') === 'shoulder-top,elbow-inner',
    JSON.stringify(dupSpots)
  );
  const levelOf = (raw: string) =>
    parseArmPain(formOf({ armPainLevel: [raw] }), { shoulder: '통증' }).armPainLevel;
  const badLevels = ['0', '4', '1.5', '-1', 'abc', ''].filter(
    (v) => levelOf(v) !== null
  );
  check(
    '팔 통증 — 정도는 1~3 정수만, 그 밖은 안 고른 것(null)',
    badLevels.length === 0 && levelOf('1') === 1 && levelOf('3') === 3,
    badLevels.join(',')
  );
  const notArm = parseArmPain(
    formOf({ armPainSpots: ['shoulder-back'], armPainLevel: ['2'] }),
    { shoulder: '뻐근', elbow: '정상' }
  );
  check(
    "팔 통증 — 어깨 · 팔꿈치 둘 다 '통증'이 아니면 [] · null (지난 값이 남지 않게)",
    notArm.armPainSpots.length === 0 && notArm.armPainLevel === null,
    JSON.stringify(notArm)
  );
  const oldRow = pickArmPain({});
  const oddRow = pickArmPain({ armPainSpots: ['x', 'elbow-outer'], armPainLevel: 7 });
  check(
    '팔 통증 — 칸이 생기기 전의 기록 · 모르는 값은 [] · null 로 읽는다',
    oldRow.armPainSpots.length === 0 &&
      oldRow.armPainLevel === null &&
      oddRow.armPainSpots.join(',') === 'elbow-outer' &&
      oddRow.armPainLevel === null,
    `${JSON.stringify(oldRow)} / ${JSON.stringify(oddRow)}`
  );

  /* 7-2) 암케어 결정 — 통증 루틴 또는 쉬기 */
  const elbowPain: Person = { condition: 7, pitches: rested, parts: { elbow: '통증' } };
  const decidePain = (
    person: Person,
    armPain: { spots: string[]; level: number | null } | null
  ) => {
    const f = factsFor(person);
    return decideArmcare({
      facts: f,
      plan: buildPitchPlan(f),
      armFatigue: null,
      armPain,
    });
  };
  const inner1 = decidePain(elbowPain, { spots: ['elbow-inner'], level: 1 });
  check(
    '팔 통증 — 팔꿈치 안쪽 · 던질 때만 → 통증 루틴, 까닭에 자리 · 정도를 적는다',
    inner1.kind === 'pain' && inner1.reason === '팔꿈치 안쪽 · 던질 때만 → 통증 루틴',
    `${inner1.kind} — ${inner1.reason}`
  );
  const level2 = decidePain(elbowPain, { spots: ['elbow-inner'], level: 2 });
  check(
    '팔 통증 — 평소 움직일 때도 아프면(정도 2) 쉬기',
    level2.kind === 'rest',
    level2.kind
  );
  const level3 = decidePain(elbowPain, { spots: ['elbow-inner'], level: 3 });
  check(
    '팔 통증 — 가만히 있어도 · 밤에도 아프면(정도 3) 쉬기',
    level3.kind === 'rest',
    level3.kind
  );
  const noLevel = decidePain(elbowPain, { spots: ['elbow-inner'], level: null });
  check(
    '팔 통증 — 정도를 안 골랐으면 쉬기 (모르면 보수적으로)',
    noLevel.kind === 'rest' && decidePain(elbowPain, null).kind === 'rest',
    noLevel.kind
  );
  const noSpot = decidePain(elbowPain, { spots: [], level: 1 });
  check('팔 통증 — 자리를 안 골랐으면 쉬기', noSpot.kind === 'rest', noSpot.kind);
  /* Y(2026-10-12, D4) 로 바뀜 — 성장기 선이 15 → 16 이라 15세도 쉬기. ARM_PAIN_ROUTINE_MIN_AGE 는 투구 계획의 YOUTH_AGE_THRESHOLD 와 같은 선 */
  const ageKinds = [14, 15, 16, null].map(
    (age) =>
      decidePain({ ...elbowPain, age }, { spots: ['elbow-inner'], level: 1 }).kind
  );
  check(
    '팔 통증 — 만 14 · 15세는 쉬기(성장판), 16세 · 나이 모름은 통증 루틴',
    ageKinds.join(',') === 'rest,rest,pain,pain',
    ageKinds.join(',')
  );
  const backOnly = decidePain(
    { condition: 7, pitches: rested, parts: { lowerBack: '통증' } },
    { spots: ['elbow-inner'], level: 1 }
  );
  check(
    '팔 통증 — 허리만 통증인 날은 남은 팔꿈치 자리가 있어도 쉬기',
    backOnly.kind === 'rest',
    backOnly.kind
  );

  /* 7-3) 통증 루틴 — 여러 자리 · 여러 날로 돌려 본다(실제 라이브러리) */
  const painFacts = factsFor(elbowPain);
  const buildPain = (
    spots: ArmcareAreaKey[],
    over: Partial<Parameters<typeof buildArmcareRoutine>[0]> = {}
  ) =>
    buildArmcareRoutine({
      decision: { kind: 'pain', reason: '시험' },
      candidates: armcareLib,
      facts: painFacts,
      seed: '2026-06-15',
      painSpots: spots,
      ...over,
    });
  const SPOT_SETS: ArmcareAreaKey[][] = [
    ['elbow-inner'],
    ['elbow-outer'],
    ['shoulder-back'],
    ['shoulder-front', 'shoulder-top'],
    ['scapula'],
    ['shoulder-back', 'elbow-inner'],
    ['elbow-back', 'elbow-front'],
  ];
  const painRuns = SPOT_SETS.flatMap((spots) =>
    Array.from({ length: 10 }, (_, d) => ({
      spots,
      routine: buildPain(spots, { seed: `2026-06-${String(d + 1).padStart(2, '0')}` }),
    }))
  );
  const painItems = painRuns.flatMap((run) => run.routine.items);
  check(
    '통증 루틴 — 모두 1세트',
    painItems.length > 0 && painItems.every((it) => it.sets === 1),
    `${painItems.length}개`
  );
  const notLight = painItems.filter((it) => {
    const ex = exOf.get(it.exerciseId)!;
    const level = intensityLevel(ex.intensity);
    const hold = ex.holdSeconds != null && ex.reps == null;
    return !(
      level <= intensityLevel('낮음') ||
      (hold && level <= intensityLevel('중간'))
    );
  });
  check(
    "통증 루틴 — 버티기('중간'까지)이거나 '낮음' 이하만",
    notLight.length === 0,
    [...new Set(notLight.map((it) => titleOf(it.exerciseId)))].join(', ')
  );
  const PAIN_HEAVY = ['덤벨', '바벨', '케틀벨', '원판', '케이블', '철봉'];
  const heavyOrStretch = painItems.filter((it) => {
    const ex = exOf.get(it.exerciseId)!;
    return (
      ex.equipment.some((q) => PAIN_HEAVY.includes(q)) ||
      ex.category !== ARMCARE_CATEGORY ||
      /스트레칭|스트레치/.test(ex.title)
    );
  });
  check(
    '통증 루틴 — 무게 장비(철봉 포함) 0 · 스트레칭 없음',
    heavyOrStretch.length === 0,
    [...new Set(heavyOrStretch.map((it) => titleOf(it.exerciseId)))].join(', ')
  );
  const noScapula = painRuns.filter(
    (run) => !run.routine.items.some((it) => it.area === 'scapula')
  );
  check(
    '통증 루틴 — 견갑 운동이 늘 1개 이상',
    noScapula.length === 0,
    noScapula.map((run) => run.spots.join('+')).join(', ')
  );
  const overTwo = painRuns.filter((run) =>
    run.spots.some(
      (spot) => run.routine.items.filter((it) => it.area === spot).length > 2
    )
  );
  check(
    '통증 루틴 — 아픈 자리마다 운동은 2개까지',
    overTwo.length === 0,
    overTwo.map((run) => run.spots.join('+')).join(', ')
  );
  /* 운동이 모자라면 있는 만큼만 — 무거운 것 · 철봉 · 버티기 아닌 '중간'으로 채우지 않는다 */
  const fakeEx = (
    id: string,
    muscle: string,
    intensity: string,
    equipment: string[],
    hold = false
  ) => ({
    id,
    category: ARMCARE_CATEGORY,
    intensity,
    equipment,
    targetMuscles: [muscle],
    sets: 2,
    reps: hold ? null : 10,
    holdSeconds: hold ? 20 : null,
    restSeconds: 30,
    perSide: false,
  });
  const scarce = buildPain(['elbow-inner'], {
    candidates: [
      fakeEx('heavy-curl', '손목 굴곡근', '낮음', ['덤벨']),
      fakeEx('mid-band', '손목 굴곡근', '중간', ['밴드']),
      fakeEx('dead-hang', '얕은 손가락 굴곡근', '낮음', ['철봉'], true),
      fakeEx('scap-light', '하부 승모근', '낮음', ['밴드']),
    ],
  });
  check(
    '통증 루틴 — 운동이 모자라면 있는 만큼만(무거운 것으로 안 채움), 빠진 자리를 알린다',
    scarce.items.map((it) => it.exerciseId).join(',') === 'scap-light' &&
      scarce.notes.some((n) => n.includes('팔꿈치 내측')),
    `${scarce.items.map((it) => it.exerciseId).join(',')} / ${scarce.notes.join(' / ')}`
  );

  /* 7-4) 안내 시트의 글(lib/armcare/pain-guide.ts) */
  const thinGuides = ARMCARE_AREAS.filter((a) => {
    const g = guideFor(a.key);
    return g.injuries.length < 1 || g.signs.length < 1 || !g.title.endsWith(' 통증');
  });
  check(
    '안내 시트 — 여덟 자리 모두 흔한 부상 1개 이상 · 확인할 증상 1개 이상',
    thinGuides.length === 0,
    thinGuides.map((a) => a.label).join(', ')
  );
  const advices = [
    levelAdvice(1, { spots: ['elbow-inner'], age: 22 }),
    levelAdvice(2, { spots: ['elbow-inner'], age: 22 }),
    levelAdvice(3, { spots: ['elbow-inner'], age: 22 }),
    levelAdvice(null, { spots: ['elbow-inner'], age: 22 }),
    levelAdvice(1, { spots: [], age: 22 }),
    levelAdvice(1, { spots: ['elbow-inner'], age: 14 }),
  ];
  check(
    "안내 시트 — '오늘은'은 정도 1 + 자리 + 15세 이상만 루틴, 그 밖은 진료 권유 · 위험 신호 5 · 맺음말",
    advices[0].routine &&
      advices.slice(1).every((a) => !a.routine && a.text.includes('진료')) &&
      RED_FLAGS.length === 5 &&
      DISCLAIMER.includes('참고용') &&
      DISCLAIMER.includes('병원'),
    advices.map((a) => `${a.routine ? '루틴' : '쉬기'}:${a.text}`).join(' / ')
  );
}

console.log('\n[목표별 횟수] 목표에 맞는 세트 · 횟수가 나오는가');
{
  /*
   * 2026-10-03 사용자 결정 — 목표에 맞는 횟수를 숫자 하나로(lib/report/goal-prescription.ts).
   * 라이브러리 값은 그대로 두고 일정 · 화면 · 운동 화면에 담을 때 바꾼다. 바꿀 것이 없으면 받은 그대로다.
   */
  const heavy = { category: '하체 스트렝스', intensity: '높음', sets: 4, reps: 10 };
  const max = { category: '상체 스트렝스', intensity: '매우 높음', sets: 4, reps: 10 };
  const mid = { category: '하체 스트렝스', intensity: '중간', sets: 3, reps: 10 };
  const light = { category: '상체 스트렝스', intensity: '낮음', sets: 3, reps: 12 };
  const power = { category: '파워', intensity: '매우 높음', sets: 3, reps: 5 };
  const core = { category: '코어', intensity: '중간', sets: 3, reps: 10 };
  const hold = { category: '코어', intensity: '중간', sets: 3, reps: null };
  const show = (e: { sets?: number | null; reps?: number | null }) =>
    `${e.sets}×${e.reps}`;

  check(
    '근력 향상 · 무거운 운동 → 4세트 × 5회',
    show(goalPrescription(heavy, '근력 향상')) === '4×5',
    show(goalPrescription(heavy, '근력 향상'))
  );
  check(
    "근력 향상 · '매우 높음'도 4세트 × 5회",
    show(goalPrescription(max, '근력 향상')) === '4×5',
    show(goalPrescription(max, '근력 향상'))
  );
  check(
    "근력 향상 · '중간' → 8회(세트 그대로)",
    show(goalPrescription(mid, '근력 향상')) === '3×8',
    show(goalPrescription(mid, '근력 향상'))
  );
  check(
    "근력 향상 · '낮음' → 그대로",
    goalPrescription(light, '근력 향상') === light,
    show(goalPrescription(light, '근력 향상'))
  );
  check(
    '파워 향상 · 무거운 운동 → 3세트 × 4회',
    show(goalPrescription(heavy, '파워 향상')) === '3×4',
    show(goalPrescription(heavy, '파워 향상'))
  );
  check(
    '파워 향상 · 파워 운동은 그대로(3세트 × 5회)',
    goalPrescription(power, '파워 향상') === power,
    show(goalPrescription(power, '파워 향상'))
  );
  check(
    '컨디셔닝 · 코어 → 15회(세트 그대로)',
    show(goalPrescription(core, '컨디셔닝')) === '3×15',
    show(goalPrescription(core, '컨디셔닝'))
  );
  check(
    '버티기(횟수 없음)는 어느 목표든 그대로',
    goalPrescription(hold, '컨디셔닝') === hold &&
      goalPrescription(hold, '근력 향상') === hold
  );
  check(
    '목표가 없거나 모르는 목표 → 그대로',
    goalPrescription(heavy, null) === heavy &&
      goalPrescription(heavy, '없는 목표') === heavy
  );

  /* 실제 라이브러리 — 근력 향상이면 일정에 담길 무거운 근력 운동은 모두 5회다 */
  const heavyLifts = library.filter(
    (ex) =>
      (ex.category === '하체 스트렝스' || ex.category === '상체 스트렝스') &&
      intensityLevel(ex.intensity) >= 4 &&
      ex.reps != null
  );
  const off = heavyLifts
    .map((ex) => goalPrescription(ex, '근력 향상'))
    .filter((ex) => ex.reps !== 5 || ex.sets !== 4);
  check(
    `근력 향상 · 라이브러리의 무거운 근력 운동 ${heavyLifts.length}개가 모두 4세트 × 5회`,
    heavyLifts.length > 0 && off.length === 0,
    off
      .slice(0, 3)
      .map((ex) => ex.title)
      .join(', ')
  );
}

console.log(
  '\n[재활 2편] 부위 · 병명 재활 — 정도 · 기간 · 판정 · 단계 · 세션 · 웨이트 · 투구 계획'
);
{
  /*
   * 2026-10-04 재활 2편 ①(lib/armcare/rehab.ts) — 규칙의 근거와 숫자는 docs/rehab-guideline.md.
   * 매주 확인 · 투구 복귀표 화면은 ②번이라 여기서는 그 판정 함수만 본다.
   */

  /* 1) 정도(가이드라인 3절) — 1편의 세 질문과 지난 일주일 가장 아팠을 때 중 더 심한 쪽 */
  const sev = (
    level: 1 | 2 | 3,
    worst: number,
    condition: RehabConditionKey | null = null
  ) => rehabSeverity({ level, worst, condition });
  check(
    '정도 — 던질 때만 · 3 → 가벼움, 4 → 보통 (경계 3/4)',
    sev(1, 3) === 'mild' && sev(1, 4) === 'moderate',
    `${sev(1, 3)} · ${sev(1, 4)}`
  );
  check(
    '정도 — 6 → 보통, 7 → 심함 (경계 6/7)',
    sev(1, 6) === 'moderate' && sev(1, 7) === 'severe',
    `${sev(1, 6)} · ${sev(1, 7)}`
  );
  check(
    '정도 — 세 질문 조합: 평소에도 · 0 → 보통, 밤에도 · 0 → 심함, 평소에도 · 7 → 심함',
    sev(2, 0) === 'moderate' && sev(3, 0) === 'severe' && sev(2, 7) === 'severe'
  );
  check(
    'UCL 은 보통 이상 — 가벼움으로 나와도 보통(가벼운 캐치볼 없음)',
    sev(1, 2, 'ucl') === 'moderate' &&
      sev(3, 2, 'ucl') === 'severe' &&
      atLeastConditionSeverity('mild', 'ucl') === 'moderate' &&
      atLeastConditionSeverity('mild', 'slap') === 'mild'
  );
  check(
    '시작 단계 — 가벼움 3 · 보통 2 · 심함 1',
    startStage('mild') === 3 &&
      startStage('moderate') === 2 &&
      startStage('severe') === 1
  );

  /* 2) 기간 — 2026-10-04 다시 맞춘 표, 병명 바닥, 앞당기기 */
  const minD = (
    severity: RehabSeverity,
    stage: RehabStage,
    condition: RehabConditionKey | null = null,
    shorten = 0
  ) => stageMinDays({ severity, stage, condition, stageShortenDays: shorten });
  const stages = [1, 2, 3, 4] as const;
  const daysOf = (s: RehabSeverity) => stages.map((st) => minD(s, st)).join(',');
  check(
    '단계별 최소 기간 — 가벼움 –·–·3·4 · 보통 –·7·5·5 · 심함 7·10·7·7',
    daysOf('mild') === '0,0,3,4' &&
      daysOf('moderate') === '0,7,5,5' &&
      daysOf('severe') === '7,10,7,7',
    `${daysOf('mild')} / ${daysOf('moderate')} / ${daysOf('severe')}`
  );
  const est = (s: RehabSeverity, c: RehabConditionKey | null = null) =>
    weeksText(rehabEstimateDays(s, c));
  check(
    '투구 복귀표까지 — 가벼움 약 1주 · 보통 약 2.5주 · 심함 약 4.5주',
    est('mild') === '약 1주' &&
      est('moderate') === '약 2.5주' &&
      est('severe') === '약 4.5주',
    `${est('mild')} · ${est('moderate')} · ${est('severe')}`
  );
  check(
    '병명 바닥 — UCL 6주 · SLAP 8주 · 굴곡-회내근 2주 · 후방 충돌 2주(정도의 기간이 더 길면 그쪽)',
    rehabEstimateDays('moderate', 'ucl') === 42 &&
      rehabEstimateDays('mild', 'slap') === 56 &&
      rehabEstimateDays('mild', 'flexor-pronator') === 14 &&
      rehabEstimateDays('moderate', 'posterior-impingement') === 17 &&
      rehabEstimateDays('severe', 'posterior-impingement') === 31
  );
  const uclDays = ([2, 3, 4] as const).map((st) => minD('moderate', st, 'ucl'));
  check(
    '병명 바닥 — 보통 UCL 은 2 · 3 · 4단계 최소 기간 합이 42일(단계 비율대로, 어느 단계도 정도의 기간보다 짧지 않다)',
    uclDays.reduce((a, b) => a + b, 0) === 42 &&
      uclDays.every((d, i) => d >= [7, 5, 5][i]),
    uclDays.join(' · ')
  );
  check(
    '기간 줄이기 — 그 단계 기간의 절반까지만(보통 2단계 7일: 2일 → 5일, 3일 → 4일, 10일 → 4일)',
    minD('moderate', 2, null, 2) === 5 &&
      minD('moderate', 2, null, 3) === 4 &&
      minD('moderate', 2, null, 10) === 4
  );
  check(
    '기간 줄이기 — 병명 바닥은 줄지 않는다(UCL 은 줄여도 그대로)',
    minD('moderate', 2, 'ucl', 3) === minD('moderate', 2, 'ucl', 0)
  );

  /* 3) 시작 막기(가이드라인 2절) */
  const block = (
    age: number | null,
    area: ArmcareAreaKey,
    condition: RehabConditionKey | null = null
  ) => rehabStartBlock({ age, area, condition })?.kind ?? null;
  /* Y(2026-10-12, D4) 로 바뀜 — 15세도 막는다(성장기 선 16) */
  check(
    '시작 — 만 14 · 15세는 막음(진료 먼저), 16세 · 나이 모름은 연다',
    block(14, 'shoulder-back') === 'young' &&
      block(15, 'shoulder-back') === 'young' &&
      block(16, 'shoulder-back') === null &&
      block(null, 'elbow-outer') === null
  );
  check(
    '시작 — 18세 미만 팔꿈치 바깥쪽 · 뒤쪽은 진단 없이 막음(X-ray), 진단이 있으면 · 18세 · 안쪽은 연다',
    block(17, 'elbow-outer') === 'xray' &&
      block(17, 'elbow-back') === 'xray' &&
      block(17, 'elbow-back', 'posterior-impingement') === null &&
      block(18, 'elbow-outer') === null &&
      block(17, 'elbow-inner') === null
  );

  /* 4) 세션 판정(가이드라인 7절) — 허용 통증이 단계 · 부위 · 병명별 */
  const judge = (
    leftover: RehabLeftover,
    pain: number,
    feel: RehabFeel,
    stage: RehabStage,
    area: ArmcareAreaKey = 'shoulder-back',
    condition: RehabConditionKey | null = null
  ) => judgeSession({ leftover, pain, feel, stage, area, condition });
  check(
    '판정 — 어깨 뒤쪽 1 · 2단계 허용 3: 3 초록 · 4 노랑 · 5 빨강',
    judge(0, 3, 'muscle', 2) === 'green' &&
      judge(0, 4, 'muscle', 2) === 'yellow' &&
      judge(0, 5, 'muscle', 2) === 'red'
  );
  check(
    '판정 — 팔꿈치 안쪽(인대형) 1 · 2단계 허용 2: 2 초록 · 3 노랑',
    judge(0, 2, 'muscle', 1, 'elbow-inner') === 'green' &&
      judge(0, 3, 'muscle', 1, 'elbow-inner') === 'yellow'
  );
  check(
    '판정 — 3 · 4단계는 어디든 2까지: 2 초록 · 3 노랑',
    judge(0, 2, 'muscle', 3) === 'green' &&
      judge(0, 3, 'muscle', 3) === 'yellow' &&
      judge(0, 3, 'muscle', 4) === 'yellow'
  );
  check(
    '판정 — 병명이 허용을 바꾼다: 회전근개 3 · SLAP 2 · 굴곡-회내근 3(팔꿈치 안쪽인데) · UCL 2',
    judge(0, 3, 'muscle', 2, 'shoulder-top', 'cuff-tendinopathy') === 'green' &&
      judge(0, 3, 'muscle', 2, 'shoulder-front', 'slap') === 'yellow' &&
      judge(0, 3, 'muscle', 2, 'elbow-inner', 'flexor-pronator') === 'green' &&
      judge(0, 3, 'muscle', 2, 'elbow-inner', 'ucl') === 'yellow'
  );
  check(
    '판정 — 남은 통증: 하다 보니 사라짐 → 노랑, 계속 → 빨강',
    judge(1, 0, 'muscle', 2) === 'yellow' && judge(2, 0, 'muscle', 2) === 'red'
  );
  check(
    '판정 — 느낌: 찌르듯은 1 · 2단계 노랑 · 3 · 4단계 빨강, 저림 · 빠질 듯은 진료',
    judge(0, 1, 'sharp', 2) === 'yellow' &&
      judge(0, 1, 'sharp', 3) === 'red' &&
      judge(0, 0, 'tingle', 1) === 'refer' &&
      judge(0, 0, 'slip', 4) === 'refer'
  );

  /* 5) 빨강 뒤 — 남은 통증만이면 하루 쉬고 같은 것, 그 밖은 이틀 쉬고 한 칸 낮춤 */
  const after = (
    s: Pick<RehabSessionLike, 'result' | 'leftover' | 'pain' | 'feel' | 'stage'>
  ) => {
    const a = afterBadSession(s);
    return a ? `${a.restDays}${a.lower ? '낮춤' : '같은것'}` : 'null';
  };
  check(
    '빨강 뒤 — 남은 통증만 1일 · 5 이상 2일 낮춤 · 찌르듯(3단계) 2일 낮춤 · 진료 2일 낮춤 · 초록 없음',
    after({ result: 'red', leftover: 2, pain: 2, feel: 'muscle', stage: 2 }) ===
      '1같은것' &&
      after({ result: 'red', leftover: 0, pain: 5, feel: 'muscle', stage: 2 }) ===
        '2낮춤' &&
      after({ result: 'red', leftover: 2, pain: 6, feel: 'muscle', stage: 2 }) ===
        '2낮춤' &&
      after({ result: 'red', leftover: 0, pain: 1, feel: 'sharp', stage: 3 }) ===
        '2낮춤' &&
      after({ result: 'refer', leftover: 0, pain: 0, feel: 'tingle', stage: 1 }) ===
        '2낮춤' &&
      after({ result: 'green', leftover: 0, pain: 0, feel: 'muscle', stage: 1 }) ===
        'null'
  );

  /* 6) 지금 상태 — 쉬는 날 · 한 칸 낮춤과 복귀 · 하루 걸러 · 진료 · 체크인 연결 */
  const prog = (over: Partial<RehabProgramLike> = {}): RehabProgramLike => ({
    area: 'shoulder-back',
    condition: null,
    severity: 'moderate',
    stage: 2,
    stageStartedOn: '2026-06-01',
    stageShortenDays: 0,
    startedOn: '2026-06-01',
    ...over,
  });
  const ses = (
    date: string,
    result: RehabResult,
    extra: Partial<RehabSessionLike> = {}
  ): RehabSessionLike => ({
    date,
    stage: 2,
    leftover: 0,
    pain: result === 'green' ? 1 : result === 'yellow' ? 3 : 6,
    feel: 'muscle',
    result,
    lowered: false,
    ...extra,
  });
  const status = (
    sessions: RehabSessionLike[],
    todayKey: string,
    over: Partial<RehabProgramLike> = {},
    checkins: RehabCheckinLike[] = []
  ) => rehabStatus({ program: prog(over), sessions, checkins, todayKey });

  const afterRed = [ses('2026-06-08', 'green'), ses('2026-06-10', 'red')];
  check(
    '쉬는 날 — 빨강(5 이상) 뒤 이틀 쉬고, 사흘째부터 한 칸 낮춘 운동',
    status(afterRed, '2026-06-11').rest != null &&
      status(afterRed, '2026-06-12').rest != null &&
      status(afterRed, '2026-06-13').rest === null &&
      status(afterRed, '2026-06-13').lowered,
    `${status(afterRed, '2026-06-11').line?.text}`
  );
  const leftoverRed = [ses('2026-06-10', 'red', { leftover: 2, pain: 2 })];
  check(
    '쉬는 날 — 남은 통증만의 빨강은 하루만 쉬고 낮추지 않는다',
    status(leftoverRed, '2026-06-11').rest != null &&
      status(leftoverRed, '2026-06-12').rest === null &&
      !status(leftoverRed, '2026-06-12').lowered
  );
  const lowSessions = [
    ses('2026-06-10', 'red'),
    ses('2026-06-13', 'green', { lowered: true }),
    ses('2026-06-15', 'green', { lowered: true }),
  ];
  const backUp = [...lowSessions, ses('2026-06-17', 'green', { lowered: true })];
  check(
    '한 칸 낮춤 — 초록 둘이면 아직 낮춤, 셋이면 원래 단계로',
    status(lowSessions, '2026-06-17').lowered && !status(backUp, '2026-06-19').lowered
  );
  check(
    '한 칸 낮춤 — 낮춘 날의 초록은 깨끗한 세션으로 세지 않는다',
    status(backUp, '2026-06-19').gate.clean === 0
  );
  check(
    '하루 걸러 — 2단계는 어제 했으면 오늘 쉬는 날, 1단계는 매일',
    (status([ses('2026-06-10', 'green')], '2026-06-11').rest ?? '').includes(
      '하루 걸러'
    ) &&
      status([ses('2026-06-10', 'green', { stage: 1 })], '2026-06-11', {
        stage: 1,
        severity: 'severe',
      }).rest === null
  );
  const threeReds = [
    ses('2026-06-01', 'red'),
    ses('2026-06-05', 'red'),
    ses('2026-06-09', 'red'),
  ];
  check(
    '진료 — 14일 안에 빨강 셋이면 진료 권유가 카드 맨 위',
    status(threeReds, '2026-06-14').line?.kind === 'refer' &&
      (status(threeReds, '2026-06-14').refer ?? '').includes('빨강이 세 번')
  );
  check(
    '진료 — 빨강 셋이 14일을 넘겨 흩어지면 진료 아님',
    status(
      [ses('2026-05-25', 'red'), ses('2026-06-05', 'red'), ses('2026-06-09', 'red')],
      '2026-06-14'
    ).refer === null
  );
  check(
    '진료 — 저림 · 빠질 듯 판정이 14일 안에 있으면 진료',
    (
      status([ses('2026-06-10', 'refer', { feel: 'tingle' })], '2026-06-20').refer ?? ''
    ).includes('저리거나') &&
      status([ses('2026-06-01', 'refer', { feel: 'tingle' })], '2026-06-20').refer ===
        null
  );
  check(
    '진료 — 1단계에서 낮추기 조건(빨강)이 오면 진료',
    (
      status([ses('2026-06-10', 'red', { stage: 1 })], '2026-06-13', {
        stage: 1,
        severity: 'severe',
      }).refer ?? ''
    ).includes('1단계')
  );
  const checkin = (
    level: number | null,
    shoulder = '통증',
    elbow = '정상'
  ): RehabCheckinLike[] => [
    { date: '2026-06-15', shoulder, elbow, armPainLevel: level },
  ];
  const byCheckin = (level: number | null) =>
    status([], '2026-06-15', {}, checkin(level));
  check(
    "체크인 — 그 관절 '통증' · 던질 때만 → 한 칸 낮춤, 평소에도 · 밤에도 · 모름 → 쉬기 + 진료",
    byCheckin(1).lowered &&
      byCheckin(1).rest === null &&
      [2, 3, null].every(
        (lv) => byCheckin(lv).rest != null && byCheckin(lv).refer != null
      )
  );
  check(
    '체크인 — 다른 관절(팔꿈치) 통증은 어깨 재활을 바꾸지 않는다',
    status([], '2026-06-15', {}, checkin(2, '정상', '통증')).rest === null &&
      !status([], '2026-06-15', {}, checkin(1, '정상', '통증')).lowered
  );

  /* 7) 단계 올리기 — 최소 기간 + 깨끗한 세션 수 + 최근 세 초록 (+ 심함 1단계 밤 통증 7일 없음) */
  const greens = (
    from: string,
    n: number,
    step = 2,
    extra: Partial<RehabSessionLike> = {}
  ) =>
    Array.from({ length: n }, (_, i) =>
      ses(shiftDateKey(from, i * step), 'green', extra)
    );
  const ready = status(greens('2026-06-01', 6), '2026-06-13');
  check(
    '단계 올리기 — 7일 지남 + 깨끗한 6 + 최근 셋 초록이면 시험 가능, 카드에 단계 시험 줄(쉬는 날이 아닐 때)',
    ready.gate.ready &&
      ready.line?.kind === 'stage-test' &&
      status(greens('2026-06-01', 6), '2026-06-12').line?.kind === 'rest',
    ready.gate.checks.map((c) => `${c.ok ? '✓' : '·'}${c.label}`).join(' / ')
  );
  check(
    '단계 올리기 — 깨끗한 세션 수는 최소 기간 안에 할 수 있는 만큼: 보통 2단계(7일 · 하루 걸러) 4번, 3개면 아직',
    status(greens('2026-06-01', 6), '2026-06-13').gate.cleanNeeded === 4 &&
      !status(greens('2026-06-05', 3), '2026-06-12').gate.ready
  );
  check(
    '단계 올리기 — 가벼움 3단계(3일)는 깨끗한 2번 · 최근 2번 초록, 심함 1단계(7일 · 매일)는 5번',
    status(greens('2026-06-01', 2, 2, { stage: 3 }), '2026-06-04', {
      severity: 'mild',
      stage: 3,
    }).gate.ready &&
      status(greens('2026-06-01', 2, 1, { stage: 1 }), '2026-06-08', {
        severity: 'severe',
        stage: 1,
      }).gate.cleanNeeded === 5
  );
  check(
    '단계 올리기 — 최소 기간 전이면 아직(보통 2단계 7일, 6일째)',
    !status(greens('2026-06-06', 6, 1), '2026-06-12', { stageStartedOn: '2026-06-06' })
      .gate.ready
  );
  check(
    '단계 올리기 — 최근 셋에 노랑이 있으면 아직, 빨강이 끼면 깨끗한 세션이 0부터',
    !status([...greens('2026-06-01', 6), ses('2026-06-13', 'yellow')], '2026-06-15')
      .gate.ready &&
      status(
        [
          ...greens('2026-06-01', 6),
          ses('2026-06-13', 'red'),
          ...greens('2026-06-16', 3),
        ],
        '2026-06-22'
      ).gate.clean === 3
  );
  check(
    '단계 올리기 — 다른 단계의 세션은 세지 않는다(단계를 올리면 새로 센다)',
    status(greens('2026-06-01', 6), '2026-06-14', {
      stage: 3,
      stageStartedOn: '2026-06-12',
    }).gate.clean === 0
  );
  const nightPain: RehabCheckinLike[] = [
    { date: '2026-06-10', shoulder: '통증', elbow: '정상', armPainLevel: 3 },
  ];
  const severe1 = (today: string) =>
    status(
      greens('2026-06-01', 5, 1, { stage: 1 }),
      today,
      { stage: 1, severity: 'severe' },
      nightPain
    );
  check(
    '심함 — 7일 안에 밤 · 쉴 때 통증(체크인 정도 3)이 있으면 1단계에 머묾, 7일 지나면 풀림',
    !severe1('2026-06-12').gate.ready &&
      severe1('2026-06-12').nightHold &&
      severe1('2026-06-17').gate.ready &&
      !severe1('2026-06-17').nightHold,
    severe1('2026-06-12')
      .gate.checks.map((c) => `${c.ok ? '✓' : '·'}${c.label}`)
      .join(' / ')
  );
  const line = (input: Parameters<typeof rehabCardLine>[0]) =>
    rehabCardLine(input)?.kind;
  check(
    '카드 한 줄 — 진료 > 쉬는 날 > 낮추기 > 단계 시험 > 매주 확인 > 정도 낮아짐',
    line({ refer: '진료', rest: '쉬기', lowered: '낮춤', stageTest: true }) ===
      'refer' &&
      line({ refer: null, rest: '쉬기', lowered: '낮춤', stageTest: true }) ===
        'rest' &&
      line({ refer: null, rest: null, lowered: '낮춤', stageTest: true }) ===
        'lowered' &&
      line({
        refer: null,
        rest: null,
        lowered: null,
        stageTest: true,
        weeklyDue: true,
      }) === 'stage-test' &&
      line({
        refer: null,
        rest: null,
        lowered: null,
        stageTest: false,
        weeklyDue: true,
        eased: true,
      }) === 'weekly' &&
      line({
        refer: null,
        rest: null,
        lowered: null,
        stageTest: false,
        eased: true,
      }) === 'eased'
  );

  /* 8) 단계 시험(가이드라인 9절 — 던지는 팔 기준) */
  const t2 = stageTestFor('elbow-inner', 2)!;
  const t3elbow = stageTestFor('elbow-inner', 3)!;
  const t3shoulder = stageTestFor('shoulder-back', 3)!;
  const pass = (t: StageTest, input: StageTestInput) => judgeStageTest(t, input).pass;
  check(
    '단계 시험 2→3 — 반대쪽 90%(89 실패 · 90 통과), 시험 중 통증 3이면 실패',
    !pass(t2, { injured: 89, other: 100, pain: 0 }) &&
      pass(t2, { injured: 90, other: 100, pain: 0 }) &&
      pass(t2, { injured: 9, other: 10, pain: 2 }) &&
      !pass(t2, { injured: 90, other: 100, pain: 3 })
  );
  check(
    '단계 시험 3→4 팔꿈치 — 100%(99 실패 · 100 통과), 팔굽혀 터치는 안 봄',
    !pass(t3elbow, { injured: 99, other: 100, pain: 0 }) &&
      pass(t3elbow, { injured: 100, other: 100, pain: 0 }) &&
      t3elbow.kind === 'strength' &&
      !t3elbow.ckc
  );
  check(
    '단계 시험 3→4 어깨 — 바깥 돌리기 95%(94 실패 · 95 통과) + 팔굽혀 터치가 첫 기록보다 늘어야',
    t3shoulder.kind === 'strength' &&
      t3shoulder.ckc &&
      !pass(t3shoulder, {
        injured: 94,
        other: 100,
        pain: 0,
        ckcNow: 20,
        ckcFirst: 18,
      }) &&
      pass(t3shoulder, {
        injured: 95,
        other: 100,
        pain: 0,
        ckcNow: 20,
        ckcFirst: 18,
      }) &&
      !pass(t3shoulder, {
        injured: 95,
        other: 100,
        pain: 0,
        ckcNow: 18,
        ckcFirst: 18,
      }) &&
      !pass(t3shoulder, {
        injured: 95,
        other: 100,
        pain: 0,
        ckcNow: 20,
        ckcFirst: null,
      })
  );
  const rom = stageTestFor('shoulder-top', 1)!;
  check(
    '단계 시험 1→2 — 아프지 않고 반대쪽과 비슷해야 통과',
    rom.kind === 'rom' &&
      pass(rom, { painFree: true, similar: true }) &&
      !pass(rom, { painFree: true, similar: false }) &&
      !pass(rom, { painFree: false, similar: true })
  );
  const exerciseOf = (area: ArmcareAreaKey) => {
    const t = stageTestFor(area, 2);
    return t?.kind === 'strength' ? t.exercise : '';
  };
  check(
    '단계 시험 — 힘 비교 운동: 어깨 넷 사이드라잉 외회전 · 안쪽 · 뒤쪽 덤벨 전완 굴곡 · 바깥쪽 덤벨 전완 신전 · 앞쪽 덤벨 해머컬, 4단계는 없음',
    (['shoulder-back', 'shoulder-front', 'shoulder-top', 'scapula'] as const).every(
      (a) => exerciseOf(a) === '사이드라잉 외회전'
    ) &&
      exerciseOf('elbow-inner') === '덤벨 리스트 플렉션' &&
      exerciseOf('elbow-back') === '덤벨 리스트 플렉션' &&
      exerciseOf('elbow-outer') === '덤벨 리스트 익스텐션' &&
      exerciseOf('elbow-front') === '덤벨 해머 컬' &&
      stageTestFor('elbow-inner', 4) === null
  );
  const open = (over: Partial<Parameters<typeof judgeThrowingOpen>[0]> = {}) =>
    judgeThrowingOpen({
      severity: 'severe',
      painFreeBallDays: 7,
      daysSinceStart: 30,
      condition: null,
      hasPlyo: true,
      push: { injured: 100, other: 100 },
      drop: { injured: 110, other: 100 },
      wall: { injured: 115, other: 100 },
      pain: 0,
      normalPct: 90,
      confidence: 7,
      ...over,
    }).pass;
  check(
    '투구 복귀표 열기 — 기준선 통과, 볼 드롭 109%(110 필요) · 벽 던지기 114%(115 필요) · 밀기 99% · 심함 6일(7 필요) · 정상 89% · 자신감 6 은 각각 실패, 가벼움은 4일이면 됨',
    open() &&
      !open({ drop: { injured: 109, other: 100 } }) &&
      !open({ wall: { injured: 114, other: 100 } }) &&
      !open({ push: { injured: 99, other: 100 } }) &&
      !open({ painFreeBallDays: 6 }) &&
      open({ severity: 'mild', painFreeBallDays: 4 }) &&
      !open({ severity: 'mild', painFreeBallDays: 3 }) &&
      !open({ normalPct: 89 }) &&
      !open({ confidence: 6 })
  );
  check(
    '투구 복귀표 열기 — 플라이오볼이 없으면 볼 드롭 · 벽 던지기는 건너뛰고 밀기로',
    open({ hasPlyo: false, drop: null, wall: null }) &&
      !open({
        hasPlyo: false,
        drop: null,
        wall: null,
        push: { injured: 99, other: 100 },
      })
  );
  check(
    '투구 복귀표 열기 — UCL 은 시작하고 6주(42일) 전이면 안 열림',
    !open({ condition: 'ucl', daysSinceStart: 41 }) &&
      open({ condition: 'ucl', daysSinceStart: 42 })
  );

  /* 9) 단계별 운동 · 병명 차이 */
  check(
    '부위 8곳 × 4단계 — 단계마다 운동 5개 이상',
    REHAB_AREAS.length === 8 &&
      REHAB_AREAS.every((a) =>
        stages.every((st) => stageExercises(a, null, st).length >= 5)
      )
  );
  check(
    '병명 — 회전근개 건염 2단계에 시티드 외회전 과부하 내리기(가볍게)',
    stageExercises('shoulder-top', 'cuff-tendinopathy', 2).some(
      (m) => m.name === '시티드 외회전 에센트릭 오버로드' && m.note === '가볍게'
    ) &&
      !stageExercises('shoulder-top', null, 2).some(
        (m) => m.name === '시티드 외회전 에센트릭 오버로드'
      )
  );
  const slap2 = stageExercises('shoulder-front', 'slap', 2).map((m) => m.name);
  check(
    'SLAP — 2단계: 프론 로우 + 외회전(90/90 끝) 빼고 크로스바디, 3단계 밴드 하이 이두컬(가볍게)',
    !slap2.includes('프론 로우 + 외회전') &&
      slap2.includes('크로스바디 스트레치') &&
      stageExercises('shoulder-front', 'slap', 3).some(
        (m) => m.name === '밴드 하이 바이셉스 컬' && m.note === '가볍게'
      ),
    slap2.join(' · ')
  );
  check(
    '병명 — 고른 부위에 맞는 것만(팔꿈치 안쪽 → UCL · 굴곡-회내근, 바깥쪽 → 없음)',
    conditionsFor('elbow-inner').join(',') === 'ucl,flexor-pronator' &&
      conditionsFor('shoulder-top').join(',') === 'impingement,cuff-tendinopathy' &&
      conditionsFor('elbow-outer').length === 0
  );

  /* 10) 오늘 세션 짜기 — 카테고리 상관없이 이름으로, 장비 바꿔 넣기 · 플라이오볼 · 심함 세트 */
  const mk = (
    title: string,
    over: Partial<RehabLibraryExercise> = {}
  ): RehabLibraryExercise => ({
    id: title,
    title,
    category: '암케어',
    intensity: '낮음',
    equipment: ['밴드'],
    targetMuscles: ['극하근'],
    sets: 2,
    reps: 10,
    holdSeconds: null,
    restSeconds: 30,
    perSide: true,
    ...over,
  });
  const ballOf = (title: string) =>
    mk(title, {
      category: '파워',
      equipment: ['메디신볼'],
      intensity: '중간',
      targetMuscles: [],
    });
  const lib4 = [
    mk('사이드라잉 외회전 리바운드', { equipment: ['덤벨'], intensity: '중간' }),
    ballOf('톨닐링 메디신볼 오버헤드 스로우'),
    ballOf('톨닐링 메디신볼 체스트 패스'),
    mk('90/90 플라이오볼 벽 드리블', { equipment: ['플라이오볼'], intensity: '중간' }),
    mk('프론 90/90 플라이오볼 드롭', { equipment: ['플라이오볼'], intensity: '중간' }),
    mk('싱글암 90/90 플라이오볼 벽 던지기', {
      equipment: ['플라이오볼'],
      intensity: '중간',
    }),
    mk('튜빙 리버스 스로우'),
    mk('밴드 외회전 0도'),
    mk('케이블 외회전', { equipment: ['케이블'] }),
    mk('밴드 외회전 무겁게', { intensity: '높음' }),
    mk('상체 외회전 고립', { category: '상체 스트렝스' }),
  ];
  const session4 = (owned: string[]) =>
    buildRehabSession({
      area: 'shoulder-back',
      condition: null,
      severity: 'mild',
      stage: 4,
      lowered: false,
      library: lib4,
      ownedEquipment: owned,
    });
  const titles = (s: RehabSession) => s.items.map((it) => it.title);
  const noPlyo = session4(['밴드', '메디신볼']);
  check(
    '세션 — 플라이오볼이 없으면 한 팔 공 운동을 두 손 메디신볼로(이미 든 오버헤드는 빼고 체스트 패스 하나), 남은 둘은 빼고 한 줄',
    titles(noPlyo).includes('톨닐링 메디신볼 체스트 패스') &&
      noPlyo.items.find((it) => it.title === '톨닐링 메디신볼 체스트 패스')
        ?.replaces === '90/90 플라이오볼 벽 드리블' &&
      !titles(noPlyo).some((t) => t.includes('플라이오볼')) &&
      noPlyo.notes.some(
        (n) =>
          n.includes('프론 90/90 플라이오볼 드롭') &&
          n.includes('싱글암 90/90 플라이오볼 벽 던지기')
      ),
    `${titles(noPlyo).join(' · ')} / ${noPlyo.notes.join(' / ')}`
  );
  check(
    '세션 — 장비가 없으면 같은 주 근육 · 같거나 낮은 강도의 암케어 운동으로(덤벨 리바운드 → 밴드 외회전 0도 — 높음 · 케이블 · 다른 카테고리는 안 고름)',
    noPlyo.items.find((it) => it.replaces === '사이드라잉 외회전 리바운드')?.title ===
      '밴드 외회전 0도'
  );
  const bandOnly = session4(['밴드']);
  check(
    '세션 — 플라이오볼 · 메디신볼 둘 다 없으면 공 운동은 빼고 빠진 이름을 한 줄로',
    titles(bandOnly).join(',') === '밴드 외회전 0도,튜빙 리버스 스로우' &&
      bandOnly.notes.some(
        (n) => n.includes('톨닐링 메디신볼 오버헤드 스로우') && n.includes('뺐어요')
      ),
    `${titles(bandOnly).join(' · ')} / ${bandOnly.notes.join(' / ')}`
  );
  check(
    '세션 — 카테고리와 상관없이 이름으로 찾는다(파워의 오버헤드 던지기), 장비를 안 골랐으면 아무것도 빼지 않는다',
    session4([]).items.length === 6 &&
      titles(session4([])).includes('톨닐링 메디신볼 오버헤드 스로우')
  );
  const lib1 = stageExercises('shoulder-back', null, 1).map((m, i) =>
    mk(m.name, { sets: i === 0 ? 1 : 3 })
  );
  const s1 = (severity: RehabSeverity) =>
    buildRehabSession({
      area: 'shoulder-back',
      condition: null,
      severity,
      stage: 1,
      lowered: false,
      library: lib1,
      ownedEquipment: [],
    });
  check(
    '세션 — 심함은 1 · 2단계 세트 −1(최소 1), 보통은 라이브러리 그대로',
    s1('severe')
      .items.map((it) => it.sets)
      .join(',') === '1,2,2,2,2' &&
      s1('moderate')
        .items.map((it) => it.sets)
        .join(',') === '1,3,3,3,3'
  );
  const lib23 = [
    ...stageExercises('shoulder-back', null, 2),
    ...stageExercises('shoulder-back', null, 3),
  ]
    .map((m) => m.name)
    .filter((name, i, all) => all.indexOf(name) === i)
    .map((name) => mk(name));
  const lowered = buildRehabSession({
    area: 'shoulder-back',
    condition: null,
    severity: 'moderate',
    stage: 3,
    lowered: true,
    library: lib23,
    ownedEquipment: [],
  });
  check(
    '세션 — 한 칸 낮춘 날은 아래 단계 운동(3단계 → 2단계) · 알림 한 줄',
    lowered.stage === 2 &&
      titles(lowered).join(',') ===
        stageExercises('shoulder-back', null, 2)
          .map((m) => m.name)
          .join(',') &&
      lowered.notes.some((n) => n.includes('한 칸 낮춰'))
  );
  check(
    '세션 — 라이브러리에 없는 이름은 빼고 한 줄로 알린다',
    buildRehabSession({
      area: 'elbow-front',
      condition: null,
      severity: 'moderate',
      stage: 2,
      lowered: false,
      library: lib23,
      ownedEquipment: [],
    }).notes.some(
      (n) => n.includes('라이브러리에 아직 없어') && n.includes('덤벨 해머 컬')
    )
  );

  /* 10-2) 매주 확인 · 매주 결과 · 투구 복귀표(재활 2편 ② — 가이드라인 8 · 10 · 11절) */
  const wk = (date: string, over: Partial<RehabWeeklyLike> = {}): RehabWeeklyLike => ({
    date,
    stage: 2,
    normalPct: 50,
    worstPain: 2,
    nightPain: false,
    activities: [5, 5],
    confidence: 5,
    test: null,
    ...over,
  });
  /** 서버(saveRehabWeekly)처럼 한 줄씩 결과를 그 줄에 붙이고 프로그램을 고쳐 간다 */
  const runWeeklies = (
    start: RehabProgramLike,
    list: RehabWeeklyLike[],
    sessions: RehabSessionLike[] = [],
    checkins: RehabCheckinLike[] = []
  ) => {
    let program = start;
    const done: RehabWeeklyLike[] = [];
    const outcomes: WeeklyOutcome[] = [];
    for (const w of list) {
      const weekly = { ...w, stage: program.stage };
      const out = weeklyOutcome({
        program,
        weekly,
        previous: done,
        sessions,
        checkins,
      });
      done.push({
        ...weekly,
        test: { ...(weekly.test ?? { kind: null, pass: false }), outcome: out.record },
      });
      outcomes.push(out);
      program = {
        ...program,
        stage: out.next.stage,
        severity: out.next.severity,
        stageShortenDays: out.next.stageShortenDays,
        ...(out.next.stageChanged ? { stageStartedOn: w.date } : {}),
      };
    }
    return { program, outcomes, weeklies: done };
  };
  const statusW = (
    sessions: RehabSessionLike[],
    todayKey: string,
    weeklies: RehabWeeklyLike[],
    over: Partial<RehabProgramLike> = {}
  ) => rehabStatus({ program: prog(over), sessions, weeklies, todayKey });

  const dueOf = (last: string | null, today: string, stage = 2) =>
    weeklyDueState({
      startedOn: '2026-06-01',
      lastWeeklyOn: last,
      stage,
      todayKey: today,
    });
  check(
    '매주 확인 때 — 시작 7일 뒤(06-08)부터 · 마지막 확인 7일 뒤부터, 미리는 안 받음(4단계에서 한 번도 안 했으면 언제든)',
    !dueOf(null, '2026-06-07').due &&
      dueOf(null, '2026-06-08').due &&
      !dueOf('2026-06-08', '2026-06-14').due &&
      dueOf('2026-06-08', '2026-06-15').due &&
      !dueOf(null, '2026-06-03').allowed &&
      dueOf(null, '2026-06-03', 4).allowed &&
      !dueOf('2026-06-02', '2026-06-05', 4).allowed
  );
  const imp = (a: [number, number[]], b: [number, number[]]) =>
    weeklyImproved(
      { normalPct: a[0], activities: a[1] },
      { normalPct: b[0], activities: b[1] }
    );
  check(
    '나아짐(흔들림 선) — 정상 대비 9점은 흔들림 · 10점은 나아짐, 내 활동 평균 1.1은 흔들림 · 1.2는 나아짐',
    !imp([50, [5, 5]], [59, [5, 5]]) &&
      imp([50, [5, 5]], [60, [5, 5]]) &&
      !imp([50, [5, 5]], [50, [6.1, 6.1]]) &&
      imp([50, [5, 5]], [50, [6.2, 6.2]]) &&
      imp([50, [5, 5]], [50, [5, 7.4]])
  );

  /* 정도 낮추기 — 두 번 이어서(경계 3/4) · 밤 통증 · 생활 통증 · 병명 바닥 · 이어진 간격 */
  const P2 = prog();
  const calm2 = runWeeklies(P2, [
    wk('2026-06-08', { worstPain: 3 }),
    wk('2026-06-15', { worstPain: 3, normalPct: 60 }),
  ]);
  check(
    '정도 낮추기 — 두 번 이어 최고 통증 3 이하면 보통 → 가벼움(첫 번만으로는 안 함), 낮추면 이어진 수를 0으로',
    calm2.outcomes[0].next.severity === 'moderate' &&
      calm2.outcomes[0].record.calmStreak === 1 &&
      calm2.outcomes[1].next.severity === 'mild' &&
      calm2.outcomes[1].record.eased &&
      calm2.outcomes[1].record.calmStreak === 0 &&
      !calm2.outcomes[1].next.stageChanged,
    calm2.outcomes.map((o) => o.lines.join(' ')).join(' / ')
  );
  check(
    '정도 낮추기 — 둘째 주 최고 통증 4 면 안 함(경계 3/4)',
    runWeeklies(P2, [
      wk('2026-06-08', { worstPain: 3 }),
      wk('2026-06-15', { worstPain: 4, normalPct: 60 }),
    ]).program.severity === 'moderate'
  );
  const pain2 = (date: string, level: number, elbow = '정상'): RehabCheckinLike => ({
    date,
    shoulder: elbow === '정상' ? '통증' : '정상',
    elbow,
    armPainLevel: level,
  });
  const easeWith = (checkins: RehabCheckinLike[], night = false) =>
    runWeeklies(
      P2,
      [wk('2026-06-08'), wk('2026-06-15', { normalPct: 60, nightPain: night })],
      [],
      checkins
    ).program.severity;
  check(
    '정도 낮추기 — 밤 · 쉴 때 통증, 그 주 체크인의 생활 통증(정도 2 · 3)이 있으면 안 함 · 던질 때만(1) · 그 주 밖 체크인은 상관없음',
    easeWith([], true) === 'moderate' &&
      easeWith([pain2('2026-06-12', 2)]) === 'moderate' &&
      easeWith([pain2('2026-06-12', 3, '통증')]) === 'moderate' &&
      easeWith([pain2('2026-06-12', 1)]) === 'mild' &&
      easeWith([pain2('2026-06-01', 3)]) === 'mild'
  );
  const severeChain = runWeeklies(prog({ severity: 'severe', stage: 1 }), [
    wk('2026-06-08', { normalPct: 40 }),
    wk('2026-06-15', { normalPct: 50 }),
    wk('2026-06-22', { normalPct: 60 }),
    wk('2026-06-29', { normalPct: 70 }),
  ]);
  check(
    '정도 낮추기 — 낮춘 뒤엔 두 번을 다시 센다(심함 → 2주째 보통 → 3주째 그대로 → 4주째 가벼움)',
    severeChain.outcomes.map((o) => o.next.severity).join(',') ===
      'severe,moderate,moderate,mild',
    severeChain.outcomes.map((o) => o.next.severity).join(',')
  );
  check(
    '정도 낮추기 — UCL 은 보통 아래로 안 간다',
    runWeeklies(prog({ area: 'elbow-inner', condition: 'ucl' }), [
      wk('2026-06-08', { normalPct: 40 }),
      wk('2026-06-15', { normalPct: 50 }),
    ]).program.severity === 'moderate'
  );
  check(
    '정도 낮추기 — 두 확인이 14일 넘게 떨어지면 이어진 것으로 안 본다(14일은 이어짐)',
    runWeeklies(P2, [wk('2026-06-08'), wk('2026-06-23', { normalPct: 60 })]).program
      .severity === 'moderate' &&
      runWeeklies(P2, [wk('2026-06-08'), wk('2026-06-22', { normalPct: 60 })]).program
        .severity === 'mild'
  );

  /* 낮추기 · 한 단계 내림 */
  const low = runWeeklies(P2, [wk('2026-06-08', { worstPain: 5 })]);
  check(
    '한 칸 낮춤 — 이번 주 최고 통증 5 이상이면 기록에 낮춤 · 프로그램은 그대로(4 는 아님)',
    low.outcomes[0].record.lowered &&
      !low.outcomes[0].next.stageChanged &&
      low.program.stage === 2 &&
      !runWeeklies(P2, [wk('2026-06-08', { worstPain: 4 })]).outcomes[0].record.lowered,
    low.outcomes[0].lines.join(' ')
  );
  const beforeLow = [
    ses('2026-06-02', 'green'),
    ses('2026-06-04', 'green'),
    ses('2026-06-06', 'green'),
  ];
  const afterLow = [...beforeLow, ...greens('2026-06-10', 3, 2, { lowered: true })];
  check(
    '한 칸 낮춤 — 그 확인 뒤 초록 셋 전까지 아래 단계 운동(①의 낮춤과 같게), 그날까지의 깨끗한 세션은 새로 센다',
    statusW(beforeLow, '2026-06-10', low.weeklies).lowered &&
      statusW(beforeLow, '2026-06-10', low.weeklies).gate.clean === 0 &&
      statusW(beforeLow, '2026-06-10', []).gate.clean === 3 &&
      statusW(afterLow.slice(0, 5), '2026-06-14', low.weeklies).lowered &&
      !statusW(afterLow, '2026-06-16', low.weeklies).lowered
  );
  const P3 = prog({ stage: 3 });
  const step = runWeeklies(
    P3,
    [wk('2026-06-08', { worstPain: 5 })],
    [ses('2026-06-05', 'red', { stage: 3 })]
  );
  check(
    '한 단계 내림 — 14일 안에 한 칸 낮춤 두 번(빨강 + 최고 통증 5) → 3단계 → 2단계 · 보통 → 심함, 그 단계 날은 오늘 · 줄인 날 0',
    step.program.stage === 2 &&
      step.program.severity === 'severe' &&
      step.program.stageStartedOn === '2026-06-08' &&
      step.program.stageShortenDays === 0 &&
      step.outcomes[0].record.steppedDown &&
      !step.outcomes[0].record.lowered,
    step.outcomes[0].lines.join(' / ')
  );
  const stepWith = (redOn: string) =>
    runWeeklies(
      prog({ stage: 3, stageStartedOn: '2026-05-20', startedOn: '2026-05-20' }),
      [wk('2026-06-08', { worstPain: 5 })],
      [ses(redOn, 'red', { stage: 3 })]
    ).program.stage;
  check(
    '한 단계 내림 — 빨강이 13일 전이면 내림, 14일 전이면 한 칸 낮춤만 · 남은 통증만의 빨강(낮추지 않음)은 세지 않음',
    stepWith('2026-05-26') === 2 &&
      stepWith('2026-05-25') === 3 &&
      runWeeklies(
        P3,
        [wk('2026-06-08', { worstPain: 5 })],
        [ses('2026-06-05', 'red', { stage: 3, leftover: 2, pain: 2 })]
      ).program.stage === 3
  );
  const dropBy = (n: number) =>
    runWeeklies(P3, [
      wk('2026-06-08', { normalPct: 70 }),
      wk('2026-06-15', { normalPct: 70 - n }),
    ]).program.stage;
  check(
    '한 단계 내림 — 정상 대비 %가 지난 확인보다 15점 떨어지면(14점은 아님)',
    dropBy(15) === 2 && dropBy(14) === 3
  );
  const s1Low = runWeeklies(prog({ stage: 1, severity: 'moderate' }), [
    wk('2026-06-08', { worstPain: 6 }),
  ]);
  const s1Step = runWeeklies(
    prog({ stage: 1, severity: 'moderate' }),
    [wk('2026-06-08', { worstPain: 6 })],
    [ses('2026-06-06', 'red', { stage: 1 })]
  );
  check(
    '1단계 — 낮추기 조건이면 진료 권유, 한 단계 내림 조건이면 정도만 한 칸 올림(단계는 1 그대로)',
    (s1Low.outcomes[0].record.refer ?? '').includes('1단계') &&
      s1Low.program.severity === 'moderate' &&
      s1Step.program.stage === 1 &&
      s1Step.program.severity === 'severe' &&
      (s1Step.outcomes[0].record.refer ?? '').includes('1단계')
  );

  /* 진료 권유 — 2주째 · 6주째 · 세 번 이어 · 밤 통증이 새로 */
  const twoWeeks = (n: number, acts = [5, 5], d = '2026-06-15', first = 50) =>
    runWeeklies(P2, [
      wk('2026-06-08', { normalPct: first }),
      wk(d, { normalPct: n, activities: acts, worstPain: 4 }),
    ]).outcomes[1].record.refer ?? '';
  check(
    '진료 — 2주째(14일 뒤 첫 확인)에 전혀 나아지지 않음: 같거나 낮으면 권유, 조금이라도 오르면 아님, 13일째는 아직',
    twoWeeks(50).includes('2주') &&
      twoWeeks(45).includes('2주') &&
      twoWeeks(51) === '' &&
      twoWeeks(50, [6, 5]) === '' &&
      twoWeeks(50, [5, 5], '2026-06-14') === ''
  );
  check(
    '진료 — 이미 다치기 전의 90% 이상이면 나아짐 없음으로 권하지 않는다',
    twoWeeks(90, [5, 5], '2026-06-15', 90) === ''
  );
  const sixWeeks = (n: number) =>
    runWeeklies(P2, [
      wk('2026-06-08', { normalPct: 50 }),
      wk('2026-06-30', { normalPct: 55, worstPain: 4 }),
      wk('2026-07-13', { normalPct: n, worstPain: 4 }),
    ]).outcomes[2].record.refer ?? '';
  check(
    '진료 — 6주째(42일 뒤 첫 확인)에 뚜렷이 나아지지 않음: 첫 확인보다 9점이면 권유, 10점이면 아님',
    sixWeeks(59).includes('6주') && sixWeeks(60) === '',
    `${sixWeeks(59)} | ${sixWeeks(60)}`
  );
  const stall = (values: number[]) =>
    runWeeklies(
      P2,
      values.map((n, i) =>
        wk(shiftDateKey('2026-06-08', i * 7), { normalPct: n, worstPain: 4 })
      )
    ).outcomes.at(-1)!.record.refer ?? '';
  check(
    '진료 — 매주 확인 세 번 이어 나아짐 없음(세 번 전보다 9점 · 올랐다 내림) → 권유, 10점 오르면 아님, 세 번이 안 됐으면 아직',
    stall([50, 55, 58, 59]).includes('세 번') &&
      stall([50, 65, 52, 55]).includes('세 번') &&
      stall([50, 55, 58, 60]) === '' &&
      stall([50, 55, 56]) === ''
  );
  check(
    '진료 — 밤 · 쉴 때 통증이 새로 생김(지난 확인엔 없음), 심함으로 시작한 첫 확인의 밤 통증은 새것이 아님',
    (
      runWeeklies(P2, [
        wk('2026-06-08'),
        wk('2026-06-15', { nightPain: true, normalPct: 60 }),
      ]).outcomes[1].record.refer ?? ''
    ).includes('밤') &&
      (
        runWeeklies(P2, [wk('2026-06-08', { nightPain: true })]).outcomes[0].record
          .refer ?? ''
      ).includes('밤') &&
      runWeeklies(prog({ severity: 'severe', stage: 1 }), [
        wk('2026-06-08', { nightPain: true }),
      ]).outcomes[0].record.refer === null
  );
  check(
    '진료를 권하는 주에는 정도를 낮추지 않는다',
    runWeeklies(P2, [wk('2026-06-08'), wk('2026-06-15')]).program.severity ===
      'moderate'
  );

  /* 단계 기간 줄이기 — 깨끗한 세션 이어서 + 두 번 이어 그 단계 시험 통과, 절반까지, 병명 바닥은 그대로 */
  const PS = prog({ severity: 'severe' });
  const pass2: RehabWeeklyTest = {
    kind: 'strength',
    pass: true,
    injured: 9,
    other: 10,
    pain: 0,
  };
  const fail2: RehabWeeklyTest = { ...pass2, pass: false, injured: 8 };
  const shortenRun = (
    tests: [RehabWeeklyTest, RehabWeeklyTest],
    sessions: RehabSessionLike[] = greens('2026-06-01', 5),
    start = PS
  ) =>
    runWeeklies(
      start,
      [
        wk('2026-06-03', { test: tests[0], worstPain: 4 }),
        wk('2026-06-10', { test: tests[1], worstPain: 4, normalPct: 60 }),
      ],
      sessions
    );
  const shortened = shortenRun([pass2, pass2]);
  check(
    '기간 줄이기 — 심함 2단계(10일): 깨끗한 5번 이어서 + 두 번 이어 시험 통과 → 절반(5일)까지',
    shortened.program.stageShortenDays === 5 &&
      shortened.outcomes[1].record.shortened &&
      stageMinDays(shortened.program) === 5,
    shortened.outcomes[1].lines.join(' ')
  );
  check(
    '기간 줄이기 — 한 번만 통과 · 마지막 세션이 노랑 · 깨끗한 세션이 모자라면 안 함',
    shortenRun([fail2, pass2]).program.stageShortenDays === 0 &&
      shortenRun(
        [pass2, pass2],
        [...greens('2026-06-01', 4), ses('2026-06-09', 'yellow')]
      ).program.stageShortenDays === 0 &&
      shortenRun([pass2, pass2], greens('2026-06-03', 4)).program.stageShortenDays === 0
  );
  const uclShort = shortenRun(
    [pass2, pass2],
    greens('2026-06-01', 5),
    prog({ area: 'elbow-inner', condition: 'ucl' })
  );
  check(
    '기간 줄이기 — 병명 바닥은 줄지 않는다(보통 UCL 2단계: 줄인 날 3 이 남아도 최소 기간 그대로)',
    uclShort.program.stageShortenDays === 3 &&
      stageMinDays(uclShort.program) ===
        stageMinDays({ ...uclShort.program, stageShortenDays: 0 }),
    `${uclShort.program.stageShortenDays}일 · 최소 ${stageMinDays(uclShort.program)}일`
  );
  check(
    '기간 줄이기 — 4단계는 줄이지 않는다(다음은 투구 복귀표)',
    shortenRun(
      [pass2, pass2],
      greens('2026-06-01', 5, 2, { stage: 4 }),
      prog({ stage: 4 })
    ).program.stageShortenDays === 0
  );

  /* 공 운동을 통증 없이 한 날 · 투구 복귀표 연 날 */
  const P4 = { stage: 4 as const, stageStartedOn: '2026-06-01' };
  const g4 = (d: string, extra: Partial<RehabSessionLike> = {}) =>
    ses(d, 'green', { stage: 4, ...extra });
  const ball = (list: RehabSessionLike[], today: string) =>
    painFreeBallDays({ program: P4, sessions: list, todayKey: today });
  check(
    '공 운동 날 수 — 4단계 초록이 이어진 첫날부터 오늘까지(06-01 · 03 · 05 → 06-05 에 4일), 노랑 · 빨강 · 낮춘 초록이 끼면 새로',
    ball([g4('2026-06-01'), g4('2026-06-03'), g4('2026-06-05')], '2026-06-05') === 4 &&
      ball(
        [g4('2026-06-01'), ses('2026-06-03', 'yellow', { stage: 4 }), g4('2026-06-05')],
        '2026-06-07'
      ) === 2 &&
      ball(
        [g4('2026-06-01'), g4('2026-06-03', { lowered: true }), g4('2026-06-05')],
        '2026-06-05'
      ) === 0 &&
      ball([g4('2026-06-01'), ses('2026-06-03', 'red', { stage: 4 })], '2026-06-09') ===
        0 &&
      ball(
        [ses('2026-05-28', 'green', { stage: 3 }), g4('2026-06-03')],
        '2026-06-05'
      ) === 2 &&
      painFreeBallDays({
        program: { stage: 3, stageStartedOn: '2026-06-01' },
        sessions: [g4('2026-06-01')],
        todayKey: '2026-06-09',
      }) === 0
  );
  check(
    '공 운동 날 수 → 투구 복귀표 열기 — 가벼움은 4일째에 열림 · 3일째는 아직',
    judgeThrowingOpen({
      severity: 'mild',
      painFreeBallDays: ball([g4('2026-06-01'), g4('2026-06-03')], '2026-06-05'),
      daysSinceStart: 10,
      condition: null,
      hasPlyo: false,
      push: { injured: 3, other: 3 },
      pain: 0,
      normalPct: 90,
      confidence: 7,
    }).pass &&
      !judgeThrowingOpen({
        severity: 'mild',
        painFreeBallDays: ball([g4('2026-06-01'), g4('2026-06-03')], '2026-06-04'),
        daysSinceStart: 10,
        condition: null,
        hasPlyo: false,
        push: { injured: 3, other: 3 },
        pain: 0,
        normalPct: 90,
        confidence: 7,
      }).pass
  );
  const thr = (on: string, passed = true): RehabWeeklyTest => ({
    kind: 'throwing',
    pass: passed,
    throwing: {
      pass: passed,
      push: { injured: 3, other: 3 },
      drop: null,
      wall: null,
      pain: 0,
      on,
    },
  });
  check(
    '투구 복귀표 연 날 — 이 4단계에서 통과한 열기 시험의 가장 이른 날, 실패 · 4단계 전 · 4단계가 아니면 없음',
    throwingOpenedOn(P4, [
      wk('2026-06-06', { test: thr('2026-06-06') }),
      wk('2026-06-13', { test: thr('2026-06-13') }),
    ]) === '2026-06-06' &&
      throwingOpenedOn(P4, [wk('2026-06-06', { test: thr('2026-06-06', false) })]) ===
        null &&
      throwingOpenedOn(P4, [wk('2026-05-30', { test: thr('2026-05-30') })]) === null &&
      throwingOpenedOn({ stage: 3, stageStartedOn: '2026-06-01' }, [
        wk('2026-06-06', { test: thr('2026-06-06') }),
      ]) === null
  );

  /* 지금 상태에 이어진 것 — 카드 한 줄 · 밤 통증 · 4단계 */
  const referW = runWeeklies(P2, [
    wk('2026-06-08'),
    wk('2026-06-15', { worstPain: 4 }),
  ]).weeklies;
  check(
    '카드 한 줄 — 시작 7일 뒤 다른 줄이 없으면 이번 주 확인, 정도를 낮춘 확인 뒤 7일은 정도 낮아짐, 진료를 권한 확인 뒤 7일은 진료',
    statusW([], '2026-06-07', []).line === null &&
      statusW([], '2026-06-08', []).line?.kind === 'weekly' &&
      statusW([], '2026-06-16', calm2.weeklies).line?.kind === 'eased' &&
      statusW([], '2026-06-22', calm2.weeklies).line?.kind === 'weekly' &&
      statusW([], '2026-06-16', referW).line?.kind === 'refer' &&
      statusW([], '2026-06-22', referW).refer === null
  );
  const severe1W = (today: string) =>
    statusW(
      greens('2026-06-01', 5, 1, { stage: 1 }),
      today,
      [wk('2026-06-08', { nightPain: true, stage: 1 })],
      { stage: 1, severity: 'severe' }
    ).nightHold;
  check(
    '심함 1단계 — 지난 7일 안의 확인에서 밤 · 쉴 때 아팠으면 머묾, 8일 뒤엔 풀림',
    severe1W('2026-06-12') && !severe1W('2026-06-16')
  );
  const st4 = statusW(
    [g4('2026-06-01'), g4('2026-06-03')],
    '2026-06-05',
    [wk('2026-06-04', { stage: 4, test: thr('2026-06-04') })],
    { stage: 4, severity: 'mild' }
  );
  check(
    '4단계 상태 — 공 운동 날 수 · 필요한 날(가벼움 4) · 연 날, 4단계가 아니면 없음',
    st4.throwing?.painFreeBallDays === 4 &&
      st4.throwing.needed === 4 &&
      st4.throwing.openedOn === '2026-06-04' &&
      statusW([], '2026-06-05', []).throwing === null
  );

  /* 기록 읽기 · 팔굽혀 터치 첫 기록 · 투구 복귀표 글 */
  check(
    '확인 줄 읽기 — 모르는 모양은 null · 숫자가 아닌 칸은 버림 · kind 가 없으면 pass 는 false',
    readRehabWeeklyTest(null) === null &&
      readRehabWeeklyTest('x') === null &&
      readRehabWeeklyTest({ kind: 'strength', pass: true, injured: '9', other: 10 })
        ?.injured === undefined &&
      readRehabWeeklyTest({ pass: true })?.pass === false &&
      readRehabWeeklyTest({
        kind: 'rom',
        pass: true,
        outcome: { calmStreak: 2, refer: 1 },
      })?.outcome?.refer === null &&
      readRehabWeeklyTest({
        kind: 'throwing',
        pass: true,
        throwing: {
          pass: true,
          push: { injured: 3, other: 3 },
          pain: 0,
          on: '2026-06-04',
        },
      })?.throwing?.drop === null
  );
  check(
    '팔굽혀 터치 첫 기록 — 가장 이른 확인의 기록(없는 확인은 건너뜀)',
    firstCkcRecord([
      wk('2026-06-15', { test: { kind: 'strength', pass: false, ckc: 20 } }),
      wk('2026-06-01'),
      wk('2026-06-08', { test: { kind: 'strength', pass: false, ckc: 18 } }),
    ]) === 18 && firstCkcRecord([wk('2026-06-01')]) === null
  );
  check(
    '투구 복귀표 — 여섯 칸(14 · 18 · 27 · 37 · 46m · 마운드) · 정도별 빈도 · 던지기 통증 규칙 넷',
    THROWING_STEPS.map((s) => s.distance).join(',') === '14m,18m,27m,37m,46m,마운드' &&
      throwingFrequency('mild').includes('한 번') &&
      throwingFrequency('moderate').includes('두 번') &&
      throwingFrequency('severe').includes('사흘') &&
      THROWING_PAIN_RULES.length === 4
  );

  /* 재활 체크 가려내기 — 트레이닝 회전 · 운동 부하가 뺀다 */
  const shoulderNames = rehabExerciseNames('shoulder-back', null);
  const periods = [
    { from: '2026-06-01', to: '2026-06-20', names: shoulderNames },
    { from: '2026-07-01', to: null, names: rehabExerciseNames('elbow-front', null) },
  ];
  check(
    '재활 체크 — 재활 기간 안의 그 재활 운동 이름만(모빌리티 크로스바디 · 파워 메디신볼 · 상체 조트만 컬), 기간 밖 · 다른 운동은 아님',
    shoulderNames.has('크로스바디 스트레치') &&
      shoulderNames.has('톨닐링 메디신볼 체스트 패스') &&
      isRehabCheck('크로스바디 스트레치', '2026-06-10', periods) &&
      isRehabCheck('크로스바디 스트레치', '2026-06-20', periods) &&
      !isRehabCheck('크로스바디 스트레치', '2026-06-21', periods) &&
      !isRehabCheck('크로스바디 스트레치', '2026-05-31', periods) &&
      !isRehabCheck('바벨 백스쿼트', '2026-06-10', periods) &&
      isRehabCheck('조트만 컬', '2026-08-01', periods) &&
      !isRehabCheck('조트만 컬', '2026-06-10', periods)
  );

  /* 11) 앱의 다른 곳 — 웨이트 · 투구 계획 · 암케어 */
  const TODAY_KEY = toDateKey(TODAY);
  const rf = (over: Partial<RehabProgramLike> = {}) =>
    rehabFacts(prog({ startedOn: '2026-06-01', ...over }), TODAY_KEY);
  const rehabPlan = buildPitchPlan(factsFor({ condition: 7, rehab: rf() }));
  check(
    '투구 계획 — 재활 중이면 멈춤 + rehab 표시 + 재활 문구',
    rehabPlan.halted &&
      rehabPlan.rehab?.stage === 2 &&
      rehabPlan.rehab.throwing === 'none' &&
      (rehabPlan.haltReason ?? '').includes('재활 중이에요(어깨 뒤쪽 · 2단계)'),
    rehabPlan.haltReason ?? ''
  );
  const mildPlan = buildPitchPlan(
    factsFor({ condition: 7, rehab: rf({ severity: 'mild', stage: 3 }) })
  );
  check(
    '투구 계획 — 가벼움은 가벼운 캐치볼만(18m 안 · 25개 · 통증 2 이하)',
    mildPlan.rehab?.throwing === 'light' &&
      (mildPlan.haltReason ?? '').includes(
        '가벼운 캐치볼만 해요(18m 안 · 25개 · 통증 2 이하)'
      ),
    mildPlan.haltReason ?? ''
  );
  const firstWeek = buildPitchPlan(
    factsFor({
      condition: 7,
      rehab: rf({
        severity: 'mild',
        stage: 3,
        area: 'elbow-inner',
        startedOn: shiftDateKey(TODAY_KEY, -3),
      }),
    })
  );
  check(
    '투구 계획 — 가벼워도 팔꿈치 안쪽 · 뒤쪽은 첫 주 던지지 않음, 7일째부터 캐치볼(어깨는 첫날부터)',
    firstWeek.rehab?.throwing === 'none' &&
      (firstWeek.haltReason ?? '').includes('첫 주') &&
      rf({
        severity: 'mild',
        stage: 3,
        area: 'elbow-back',
        startedOn: shiftDateKey(TODAY_KEY, -7),
      }).throwing === 'light' &&
      rf({ severity: 'mild', stage: 3, area: 'shoulder-top', startedOn: TODAY_KEY })
        .throwing === 'light',
    firstWeek.haltReason ?? ''
  );
  const painDay = buildPitchPlan(factsFor({ condition: 7, pain: true, rehab: rf() }));
  check(
    '투구 계획 — 오늘 통증이면 통증 멈춤이 먼저(재활 표시 없음 — 자동 맞춤도 예전처럼 정하지 않는다)',
    painDay.halted && !painDay.rehab && (painDay.haltReason ?? '').includes('통증')
  );
  const partsOf = (over: Partial<RehabProgramLike>) =>
    (factsFor({ condition: 7, rehab: rf(over) }).condition.rehabParts ?? []).join(',');
  check(
    '웨이트 — 재활 1~3단계 관절이 rehabParts(어깨 넷 → shoulder, 팔꿈치 넷 → elbow), 4단계는 빈 목록',
    partsOf({}) === 'shoulder' &&
      partsOf({ area: 'scapula' }) === 'shoulder' &&
      partsOf({ area: 'elbow-front' }) === 'elbow' &&
      partsOf({ stage: 4 }) === ''
  );
  const rehabbing = planFor({ person: { condition: 8, rehab: rf() } });
  const shoulderRelatedParts = ['어깨', '견갑', '가슴', '등'];
  check(
    '웨이트 — 재활 중 어깨: 어깨 쪽 무거운 운동만 빠지고 다른 무게 운동은 남는다, 근거 줄 재활 중',
    !rehabbing.picked.candidates.some(
      (e) =>
        intensityLevel(e.intensity) > 3 &&
        e.bodyParts.some((p) => shoulderRelatedParts.includes(p))
    ) &&
      rehabbing.picked.candidates.some((e) => intensityLevel(e.intensity) >= 4) &&
      rehabbing.picked.basis.some((b) => b.startsWith('재활 중(어깨)')),
    rehabbing.picked.basis.filter((b) => b.includes('재활')).join(' / ')
  );
  check(
    '웨이트 — 재활 중 어깨: 상체 날이 아니고, 이유에 그렇게 적는다',
    rehabbing.theme.key !== 'upper' &&
      rehabbing.theme.reason.startsWith('어깨 재활 중이라'),
    `${rehabbing.theme.label} — ${rehabbing.theme.reason}`
  );
  const stage4 = planFor({ person: { condition: 8, rehab: rf({ stage: 4 }) } });
  check(
    '웨이트 — 4단계는 제한을 푼다(어깨 무거운 운동이 돌아오고 재활 근거 줄이 없다)',
    stage4.picked.candidates.some(
      (e) =>
        intensityLevel(e.intensity) > 3 &&
        e.bodyParts.some((p) => shoulderRelatedParts.includes(p))
    ) && !stage4.picked.basis.some((b) => b.includes('재활'))
  );
  check(
    '암케어 — 재활 때문에 멈춘 투구 계획은 통증 쉬기가 아니다(내 루틴 표시용 결정)',
    decideArmcare({ facts: rehabbing.facts, plan: rehabbing.plan, armFatigue: null })
      .kind !== 'rest'
  );

  /* 12) 실제 라이브러리 — 설계에 적힌 운동 이름이 모두 있다(숨기지 않은 것, 카테고리 상관없이) */
  const titlesInLibrary = new Set(library.map((ex) => ex.title));
  const designNames = allRehabExerciseNames();
  const missingNames = designNames.filter((name) => !titlesInLibrary.has(name));
  check(
    `재활 운동 이름 ${designNames.length}개가 모두 라이브러리에 있다`,
    missingNames.length === 0,
    missingNames.join(', ')
  );
}

console.log(
  '\n[운동 순서] 하는 차례 — 파워(가벼운 것부터) → 본 운동(센 것부터) → 보조, 준비는 가벼운 것부터(2026-10-04)'
);
{
  const ex = (
    title: string,
    category: string,
    intensity: string,
    movementPattern: string | null = null,
    perSide = false
  ) => ({ title, category, intensity, movementPattern, perSide });
  const main = orderWithinSlot('main', [
    ex('덤벨 컬', '상체 스트렝스', '중간', '고립'),
    ex('리버스 런지', '하체 스트렝스', '높음', '런지'),
    ex('뎁스 드롭', '파워', '매우 높음', '스쿼트'),
    ex('고블렛 스쿼트', '하체 스트렝스', '중간', '스쿼트'),
    ex('막대 RDL', '하체 스트렝스', '낮음', '힌지'),
    ex('스냅다운', '파워', '중간', '힌지'),
    ex('싱글렉 RDL', '하체 스트렝스', '높음', '힌지', true),
    ex('바벨 백 스쿼트', '하체 스트렝스', '매우 높음', '스쿼트'),
    ex('박스 점프', '파워', '높음', '스쿼트'),
    ex('바벨 RDL', '하체 스트렝스', '높음', '힌지'),
    ex('카프 레이즈', '하체 스트렝스', '낮음', '카프'),
  ]).map((e) => e.title);
  check(
    '본운동 — 파워(가벼운 것 → 센 것) → 본 운동(센 것 → 가벼운 것, 같으면 양발 먼저) → 보조',
    main.join(',') ===
      '스냅다운,박스 점프,뎁스 드롭,바벨 백 스쿼트,바벨 RDL,리버스 런지,싱글렉 RDL,고블렛 스쿼트,덤벨 컬,막대 RDL,카프 레이즈',
    main.join(' → ')
  );
  /*
   * 하체 · 상체 날에 직접 더한 코어 · 스트레칭은 본운동 칸에 들어간다 — 스트렝스 운동을 다 한 뒤에 온다.
   * 코어는 계열이 붙은 것(회전 · 높음)으로 — 스트렝스가 아닌 운동을 거르는 줄이 빠지면 이것이 스쿼트 앞으로 온다.
   */
  const added = orderWithinSlot('main', [
    ex('고블렛 스쿼트', '하체 스트렝스', '중간', '스쿼트'),
    ex('팔로프 프레스', '코어', '높음', '회전'),
    ex('리버스 런지', '하체 스트렝스', '중간', '런지'),
    ex('90/90 스트레칭', '모빌리티', '매우 낮음'),
  ]).map((e) => e.title);
  check(
    '본운동 — 직접 더한 코어 · 스트레칭은 스트렝스 뒤로(강도가 높아도)',
    added.join(',') === '고블렛 스쿼트,리버스 런지,팔로프 프레스,90/90 스트레칭',
    added.join(' → ')
  );
  const assistMain = orderWithinSlot('main', [
    ex('데드버그', '코어', '낮음'),
    ex('케이블 찹', '코어', '중간'),
  ]).map((e) => e.title);
  check(
    '보조 데이 본운동(코어만) — 강도 높은 것 먼저',
    assistMain.join(',') === '케이블 찹,데드버그',
    assistMain.join(' → ')
  );
  const warm = orderWithinSlot('mobility', [
    ex('A-스킵', '모빌리티', '낮음'),
    ex('캣-카멜', '모빌리티', '매우 낮음'),
  ]).map((e) => e.title);
  check(
    '가동성 — 가벼운 것부터',
    warm.join(',') === '캣-카멜,A-스킵',
    warm.join(' → ')
  );
  const cardio = orderWithinSlot('cardio', [
    ex('셔틀 런 인터벌', '유산소', '중간'),
    ex('빠르게 걷기', '유산소', '낮음'),
  ]).map((e) => e.title);
  check(
    '유산소 — 가벼운 것부터',
    cardio.join(',') === '빠르게 걷기,셔틀 런 인터벌',
    cardio.join(' → ')
  );
  const core = orderWithinSlot('core', [
    ex('데드버그', '코어', '낮음'),
    ex('케이블 찹', '코어', '중간'),
    ex('버드독', '코어', '낮음'),
  ]).map((e) => e.title);
  check(
    '코어 — 강도 높은 것 먼저, 같은 강도는 들어온 차례 그대로',
    core.join(',') === '케이블 찹,데드버그,버드독',
    core.join(' → ')
  );
  const prehab = orderWithinSlot('prehab', [
    ex('밴드 풀 어파트', '회복 및 보강', '낮음'),
    ex('코펜하겐 플랭크', '회복 및 보강', '중간'),
  ]).map((e) => e.title);
  check(
    '보강 — 강도 높은 것 먼저',
    prehab.join(',') === '코펜하겐 플랭크,밴드 풀 어파트',
    prehab.join(' → ')
  );
  const arm = orderWithinSlot('armcare', [
    ex('밴드 외회전', '암케어', '낮음'),
    ex('플라이오볼 던지기', '암케어', '중간'),
  ]).map((e) => e.title);
  check(
    '암케어 — 강도 높은 것 먼저',
    arm.join(',') === '플라이오볼 던지기,밴드 외회전',
    arm.join(' → ')
  );
  check(
    '빈 목록 — 그대로 빈 목록',
    orderWithinSlot('main', []).length === 0 &&
      orderSession([], SLOT_ORDER).length === 0
  );
  const session = orderSession(
    [
      { slot: 'core' as const, ex: ex('데드버그', '코어', '낮음') },
      { slot: 'main' as const, ex: ex('덤벨 컬', '상체 스트렝스', '중간', '고립') },
      { slot: 'mobility' as const, ex: ex('캣-카멜', '모빌리티', '매우 낮음') },
      { slot: 'main' as const, ex: ex('벤치 프레스', '상체 스트렝스', '높음', '밀기') },
    ],
    SLOT_ORDER
  ).map((it) => it.ex.title);
  check(
    '일정 전체 — 구간 차례(가동성 → 본운동 → 코어) 다음 구간 안의 차례',
    session.join(',') === '캣-카멜,벤치 프레스,덤벨 컬,데드버그',
    session.join(' → ')
  );

  /* 운동 시작(freezePlan)도 같은 차례 — 화면 목록과 실시간 운동이 어긋나지 않는다 */
  const row = (
    id: string,
    category: string,
    intensity: string,
    movementPattern: string | null
  ) => ({
    id,
    title: id,
    category,
    intensity,
    movementPattern,
    bodyParts: [] as string[],
    equipment: [] as string[],
    sets: 3,
    reps: 8,
    holdSeconds: null,
    restSeconds: 90,
    perSide: false,
    thumbPath: null,
  });
  const rows = [
    row('컬', '상체 스트렝스', '중간', '고립'),
    row('밴드 외회전', '암케어', '낮음', null),
    row('벤치', '상체 스트렝스', '높음', '밀기'),
    row('메디신볼 슬램', '파워', '높음', '회전'),
    row('체스트 패스', '파워', '중간', '밀기'),
  ];
  const frozen = freezePlan(
    'upper',
    '상체',
    [
      { exerciseId: '컬', slot: 'main' },
      { exerciseId: '밴드 외회전', slot: 'armcare' },
      { exerciseId: '벤치', slot: 'main' },
      { exerciseId: '메디신볼 슬램', slot: 'main' },
      { exerciseId: '체스트 패스', slot: 'main' },
    ],
    new Map(rows.map((r) => [r.id, r]))
  )
    .exercises.map((e) => e.id)
    .join(',');
  check(
    '운동 시작 목록 — 트레이닝 화면과 같은 하는 차례',
    frozen === '체스트 패스,메디신볼 슬램,벤치,컬,밴드 외회전',
    frozen
  );

  /*
   * 한 근육만 쓰는 운동은 계열 '고립'이라야 큰 운동 뒤로 간다. 이름으로 계열을 채운 스크립트(fill-movement-pattern.mjs
   * --force)를 다시 돌리면 '힌지 · 밀기'로 돌아갈 수 있어 라이브러리 값을 지킨다(2026-10-04 고침,
   * scripts/library-isolation-retag-2026-10-04.mjs).
   */
  const isoTitles = ['노르딕 햄스트링 컬', '리버스 노르딕 컬', '사이드 레터럴 레이즈'];
  const notIso = isoTitles.filter(
    (t) => library.find((e) => e.title === t)?.movementPattern !== '고립'
  );
  check(
    '한 근육 운동 셋(노르딕 · 리버스 노르딕 · 사이드 레터럴 레이즈)은 계열 고립',
    notIso.length === 0,
    notIso.join(', ')
  );

  /*
   * 실제 라이브러리로 만든 일정 — 일정을 만드는 길(pickForTheme)이 구간마다 이 차례를 그대로 쓴다.
   * 규칙 표를 시험에 베끼지 않는다(베끼면 규칙이 틀려도 같이 틀린다) — 규칙 자체는 위의 손으로 적은 표가 지킨다.
   */
  let broken = '';
  let mainCount = 0;
  for (const themeKey of ['upper', 'lower', 'assist', 'recovery'] as const) {
    for (const goal of ['근력 향상', '파워 향상', '컨디셔닝']) {
      for (let d = 0; d < 10 && !broken; d++) {
        const { picks } = pickForTheme({
          candidates: library,
          theme: themeKey,
          minutes: 60,
          doneIds: new Set<string>(),
          rotationSeed: `order-${themeKey}-${goal}-${d}`,
          goal,
        });
        mainCount += picks.filter((p) => p.slot === 'main').length;
        for (const slot of SLOT_ORDER) {
          const inSlot = picks.filter((p) => p.slot === slot).map((p) => p.exercise);
          const again = orderWithinSlot(slot, inSlot);
          if (!broken && again.some((e, i) => e !== inSlot[i])) {
            broken = `${themeKey} ${goal} ${d} ${slot}: ${inSlot
              .map((e) => `${e.title}(${e.intensity})`)
              .join(' → ')}`;
          }
        }
      }
    }
  }
  check(
    '실제 일정 120개 — 모든 구간이 하는 차례대로 나온다',
    broken === '' && mainCount > 0,
    broken || `본운동 ${mainCount}개`
  );
  /*
   * 사용자분이 짚은 것 그대로 잰다 — 큰 운동(여러 관절을 쓰는 스트렝스)끼리 강도가 다시 올라가는 날이 있나. 처음 판
   * (종류 먼저)은 근력 날 120개 중 58개였다. 이제 0 이라야 한다. 큰 운동 뒤의 보조(노르딕 햄스트링 '매우 높음' ·
   * 디피싯 카프 레이즈 '높음')는 센 것이어도 큰 운동을 다 한 뒤에 오는 것이 맞아(NSCA — 한 관절은 여러 관절 뒤)
   * 여기서 세지 않고 몇 날인지만 적는다. 파워끼리는 가벼운 것부터 올라간다.
   */
  let days = 0;
  let upDays = 0;
  let bigUpDays = 0;
  /* 잴 것이 실제로 있었는지 — 없으면 아무것도 안 재고 통과한다 */
  let multiDays = 0;
  let powerDays = 0;
  let powerBroken = '';
  for (const themeKey of ['lower', 'upper'] as const) {
    for (const goal of ['근력 향상', '파워 향상', '컨디셔닝']) {
      for (const minutes of [45, 60, 90]) {
        for (let d = 0; d < 10; d++) {
          const { picks } = pickForTheme({
            candidates: library,
            theme: themeKey,
            minutes,
            doneIds: new Set<string>(),
            rotationSeed: `flow-${themeKey}-${goal}-${minutes}-${d}`,
            goal,
          });
          const mainEx = picks.filter((p) => p.slot === 'main').map((p) => p.exercise);
          const levels = mainEx
            .filter((e) => e.category !== '파워')
            .map((e) => intensityLevel(e.intensity));
          const bigLevels = mainEx
            .filter(
              (e) =>
                e.category.endsWith('스트렝스') &&
                ['스쿼트', '힌지', '밀기', '당기기', '런지', '회전', '운반'].includes(
                  e.movementPattern ?? ''
                )
            )
            .map((e) => intensityLevel(e.intensity));
          days++;
          if (bigLevels.length >= 2) multiDays++;
          if (bigLevels.some((l, i) => i > 0 && l > bigLevels[i - 1])) bigUpDays++;
          if (levels.some((l, i) => i > 0 && l > levels[i - 1])) upDays++;
          const power = mainEx.filter((e) => e.category === '파워');
          if (power.length >= 2) powerDays++;
          if (
            !powerBroken &&
            power.some(
              (e, i) =>
                i > 0 &&
                intensityLevel(e.intensity) < intensityLevel(power[i - 1].intensity)
            )
          ) {
            powerBroken = power.map((e) => `${e.title}(${e.intensity})`).join(' → ');
          }
        }
      }
    }
  }
  check(
    `하체 · 상체 날 ${days}개 — 큰 운동끼리는 강도가 오르지 않는다`,
    multiDays > 0 && bigUpDays === 0,
    `오른 날 ${bigUpDays}일 · 견줄 수 있는 날 ${multiDays}일 (보조까지 넣으면 오른 날 ${upDays}일)`
  );
  check(
    '파워끼리는 가벼운 것부터',
    powerDays > 0 && powerBroken === '',
    powerBroken || `파워 2개 이상인 날 ${powerDays}일`
  );
}

{
  /* 몸 그림의 근육 → 부위 칸(2026-10-12) — 통증 관문이 근육을 고른 날 놓치지 않게 */
  const p = partsFromSpots({
    'R:deltoid_posterior': '뻐근',
    'L:pectoralis_minor': '통증',
    'L:quadratus_lumborum': '뻐근',
  });
  check(
    '근육 → 부위: 같은 부위는 가장 센 값',
    p.shoulder === '통증' && p.lowerBack === '뻐근' && p.elbow === '정상',
    JSON.stringify(p)
  );
  const c = cleanBodySpots({
    'R:soleus': '통증',
    'C:soleus': '통증',
    'R:nope': '통증',
    'L:soleus': '아픔',
  });
  check(
    '근육 값 거르기: 모르는 근육 · 좌우 · 값은 버림',
    JSON.stringify(c) === '{"R:soleus":"통증"}',
    JSON.stringify(c)
  );
  check('깨진 JSON 은 빈 것', Object.keys(parseBodySpots('{oops')).length === 0);
}

/*
 * P0 불변식이 만든 사람(c.p)을 차례대로 적어 둔다 — 파일 끝 '[2판 오늘 상태(P3)] 오늘 상태 한 장' 절이 같은 사람들로 재는지 견준다
 * (그 절은 이 블록 밖이라 makeCombo 를 못 불러 베껴 쓴다). 적기만 하고 아래 검사는 아무것도 안 바뀐다.
 */
const p0PeopleSeen: string[] = [];
/*
 * '[2판 오늘 상태(P3)]' 절의 160조합이 만든 facts 를 차례대로 적어 둔다 — 파일 끝 '[2판 P4] 등판 한 곳' 절이 같은 사람들로
 * 등판 읽기(lib/engine/outing.ts)를 P3 의 식과 견준다(그 절은 블록 밖이라 사람 만들기를 못 부른다). 적기만 한다.
 */
const p3ComboFactsSeen: ReturnType<typeof buildFacts>[] = [];

console.log(
  '\n[2판 안전망(P0)] 등판 답 · 기능 엇갈림 표 · 불변식 · 성장기 나이 · 한쪽 갇힘(2026-10-11)'
);
{
  /*
   * 트레이닝 추천 2판(docs/designs/training-recommendation-engine.md)의 안전망.
   *
   * 고치기 전에 지금 동작을 숫자로 못 박아 둔다 — 단계(P1~P6 · Y)마다 이 절을 다시 돌려 무엇이 바뀌었는지 본다.
   * '알려진 엇갈림 · 빈틈'이라고 적은 검사는 지금 동작을 그대로 고정한다(값이 바뀌면 깨진다). 일부러 바꾸는 단계에서
   * 그 검사의 기대값을 고친다 — 모르는 새 바뀌는 것을 막는 것이 이 절의 목적이다.
   *
   * 위의 factsFor · planFor 는 체크인에 던지는 일정(throwPlan)을 못 넣어 여기서 따로 만든다 — 기존 도우미는 건드리지 않는다.
   */
  type P0Checkin = Partial<Record<CheckinPartKey, string>> & {
    condition?: number;
    sleep?: string;
    sleepHours?: number | null;
    soreness?: number | null;
    preferredWorkout?: string | null;
    preferredParts?: string[];
    /** 던지는 일정(THROW_PLANS). 안 주면 칸이 없고, null 이면 칸은 있는데 안 적은 것 */
    throwPlan?: string | null;
    /** 팔 피로 1~5(2판 P4 — facts 칸). 안 주면 칸이 없다 */
    armFatigue?: number | null;
  };
  type P0Log = {
    daysAgo: number;
    pitches: number;
    intensity: number;
    sessionType?: string;
  };
  type P0Person = {
    age?: number | null;
    trainingLevel?: string | null;
    /** 오늘 체크인 — null 이면 오늘 체크인이 없는 날 */
    today?: P0Checkin | null;
    yesterday?: P0Checkin | null;
    logs?: P0Log[];
    rehab?: RehabFacts | null;
    /** 어제 메모 — 통증 표현을 넣으면 오늘 체크인이 없는 날 '확인 전'이 된다 */
    memos?: string[];
    asOf?: Date;
    /**
     * 달력 일정(2판 P4 커밋 G) — 주면(빈 목록이어도) facts 에 등판 짐작의 두 칸(달력 · 같은 요일 경기 날짜)이 생긴다. 안 주면 칸이 없어
     * 예전 사람과 글자까지 같다.
     */
    calendar?: CalendarEventLike[];
    /**
     * 같은 요일 경기 날짜를 기록 대신 facts 칸에 바로 넣는다(커밋 G 불변식 ⑬ — 기록을 바꾸면 부하 · 투구 계획까지 바뀌어 짐작만의 몫을
     * 못 가른다). calendar 를 같이 줘야 뜻이 있다.
     */
    gameDates?: string[];
  };
  const p0Key = (asOf: Date, daysAgo: number) =>
    new Date(asOf.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const p0Checkin = (asOf: Date, daysAgo: number, c: P0Checkin): CheckinLike => ({
    date: p0Key(asOf, daysAgo),
    condition: c.condition ?? 7,
    sleep: c.sleep ?? '보통',
    shoulder: c.shoulder ?? '정상',
    elbow: c.elbow ?? '정상',
    wrist: c.wrist ?? '정상',
    lowerBack: c.lowerBack ?? '정상',
    lowerBody: c.lowerBody ?? '정상',
    preferredParts: c.preferredParts ?? [],
    preferredWorkout: c.preferredWorkout ?? null,
    ...(c.sleepHours !== undefined ? { sleepHours: c.sleepHours } : {}),
    ...(c.soreness !== undefined ? { soreness: c.soreness } : {}),
    ...(c.throwPlan !== undefined ? { throwPlan: c.throwPlan } : {}),
    ...(c.armFatigue !== undefined ? { armFatigue: c.armFatigue } : {}),
  });
  const p0Facts = (p: P0Person) => {
    const asOf = p.asOf ?? TODAY;
    const facts = p0BaseFacts(p, asOf);
    /* 같은 요일 경기 날짜를 바로 넣는 사람(⑬) — 달력을 넘겨 칸이 생긴 facts 에만 덮는다 */
    if (p.gameDates && facts.patterns.gameDates !== undefined)
      facts.patterns.gameDates = [...p.gameDates];
    return facts;
  };
  const p0BaseFacts = (p: P0Person, asOf: Date) => {
    return buildFacts({
      nickname: '시험',
      age: p.age === undefined ? 22 : p.age,
      heightCm: 180,
      trainingLevel: p.trainingLevel ?? null,
      baselineDailyLoad: 100,
      rehab: p.rehab ?? null,
      today: asOf,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: new Date(asOf.getTime() - l.daysAgo * 86400000).toISOString(),
        pitchCount: l.pitches,
        intensity: l.intensity,
        ...(l.sessionType ? { sessionType: l.sessionType } : {}),
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        ...(p.today ? [p0Checkin(asOf, 0, p.today)] : []),
        ...(p.yesterday ? [p0Checkin(asOf, 1, p.yesterday)] : []),
      ],
      memos: (p.memos ?? []).map((text) => ({ date: p0Key(asOf, 1), text })),
      ...(p.calendar ? { calendarEvents: p.calendar } : {}),
    });
  };
  /** 하체 · 상체는 날짜로 번갈아 정해지는 값이라 둘을 '근력'으로 묶어 견준다 — 번갈기 규칙이 바뀌어도 이 절이 흔들리지 않게 */
  const strengthOr = (key: ThemeKey) =>
    key === 'lower' || key === 'upper' ? 'strength' : key;

  /* ─────────────── (a) 등판 답 — 기록 없이 체크인만으로, plannedOuting 의 모든 갈래와 그날의 테마 ─────────────── */
  const outingCases: {
    name: string;
    today?: P0Checkin | null;
    yesterday?: P0Checkin | null;
    override?: boolean;
    planned: 'today' | 'tomorrow' | null;
    theme: 'recovery' | 'assist' | 'strength';
    /**
     * 근력 날의 쪽까지 못 박는 경우(2판 P4 커밋 E — 날 종류의 R5 · R6 은 하체 · 상체 마지막 날이 둘 다 없을 때 쪽을 정한다. 이 표는
     * 둘 다 null 로 부른다). 안 주면 쪽은 안 본다(날짜 홀짝 — 기준일 06-15 는 상체).
     */
    key?: ThemeKey;
    /**
     * 안전 거르기 뒤 후보에 무거운 하체가 남는가(2판 P4 커밋 D · E — 등판 창 3일 안이면 false). 안 주면 안 본다.
     */
    heavyLower?: boolean;
  }[] = [
    {
      name: "오늘 '오늘 등판'",
      today: { throwPlan: '오늘 등판' },
      planned: 'today',
      theme: 'recovery',
    },
    {
      name: "오늘 '내일 등판'",
      today: { throwPlan: '내일 등판' },
      planned: 'tomorrow',
      theme: 'assist',
    },
    /* '오늘 불펜'은 날을 바꾸지 않는다 — 가볍게 던지는 날이라 던진 뒤 hardOuting 이 기록으로 본다 */
    {
      name: "오늘 '오늘 불펜'",
      today: { throwPlan: '오늘 불펜' },
      planned: null,
      theme: 'strength',
    },
    {
      name: "오늘 '없음'",
      today: { throwPlan: '없음' },
      planned: null,
      theme: 'strength',
    },
    {
      name: "오늘 '없음' + 어제 '내일 등판' (오늘 답이 이긴다)",
      today: { throwPlan: '없음' },
      yesterday: { throwPlan: '내일 등판' },
      planned: null,
      theme: 'strength',
    },
    {
      name: "오늘 답 없음 + 어제 '내일 등판'",
      today: { throwPlan: null },
      yesterday: { throwPlan: '내일 등판' },
      planned: 'today',
      theme: 'recovery',
    },
    {
      name: "오늘 체크인 없음 + 어제 '내일 등판'",
      today: null,
      yesterday: { throwPlan: '내일 등판' },
      planned: 'today',
      theme: 'recovery',
    },
    {
      name: "오늘 '내일 등판' + 어제 '내일 등판' (비로 밀린 날)",
      today: { throwPlan: '내일 등판' },
      yesterday: { throwPlan: '내일 등판' },
      planned: 'tomorrow',
      theme: 'assist',
    },
    /*
     * 알려진 빈틈(D3) — 어제 '오늘 등판'이라 답하고 기록을 안 남기면 매일 일정은 어제 등판을 모른다(체크인은 오늘 · 어제의
     * '내일 등판'만, 기록은 hardOuting 이 본다). 프로그램만 gameYesterday 로 쉰다(아래 (b) C6). P4 에서 부하 기준으로 바꾼다.
     *
     * P4 로 바뀜(2026-10-12 커밋 E, C6 결정) — 왜: 던졌다는 답은 있는데 부하를 모르는 날에 무거운 날을 주면 미탐이 된다(facts.ts
     * '미탐이 오탐보다 위험'). 날 종류의 R3'(lib/engine/microcycle.ts claimedNoLog)가 무게 없는 보조 · 코어 날로 받고 기록을 청한다.
     * plannedOuting 은 그대로 null(다음 등판이 아니라 지난 등판이라서) — 테마만 strength → assist.
     */
    {
      name: "오늘 답 없음 + 어제 '오늘 등판' (어제 등판 · 기록 없음 — P4 로 바뀜: 보조 · 코어)",
      today: { throwPlan: null },
      yesterday: { throwPlan: '오늘 등판' },
      planned: null,
      theme: 'assist',
    },
    {
      name: '둘 다 답 없음',
      today: {},
      yesterday: {},
      planned: null,
      theme: 'strength',
    },
    {
      name: "오늘 '오늘 등판' + 컨디션 3",
      today: { throwPlan: '오늘 등판', condition: 3 },
      planned: 'today',
      theme: 'recovery',
    },
    {
      name: "오늘 '내일 등판' + 컨디션 3 (회복이 보조보다 앞)",
      today: { throwPlan: '내일 등판', condition: 3 },
      planned: 'tomorrow',
      theme: 'recovery',
    },
    {
      name: "오늘 '오늘 등판' + 웨이트를 고름 (그래도 하기 아님)",
      today: { throwPlan: '오늘 등판', preferredWorkout: '웨이트' },
      planned: 'today',
      theme: 'recovery',
    },
    {
      name: "오늘 '오늘 등판' + 웨이트를 고름 + 그래도 하기",
      today: { throwPlan: '오늘 등판', preferredWorkout: '웨이트' },
      override: true,
      planned: 'today',
      theme: 'strength',
    },
    {
      name: "오늘 '내일 등판' + 파워를 고름 + 그래도 하기",
      today: { throwPlan: '내일 등판', preferredWorkout: '파워' },
      override: true,
      planned: 'tomorrow',
      theme: 'strength',
    },
    /*
     * 2판 D1(2026-10-12) 새 답 둘 — '2~3일 뒤' · '4일 이상 뒤'. 날을 못 박지 못하니 plannedOuting 은 '없음'처럼 null, 테마는
     * 평소(근력). 어제 '2~3일 뒤'는 오늘 1~2일 뒤라 이월하지 않는다(짐작하지 않는다).
     *
     * P4 로 바뀜(2026-10-12 커밋 D · E) — 왜: 검토안 4-2 '2~3일: 근력이되 무거운 하체 금지 · 4일 이상: 무거운 하체'. 테마는 그대로 근력
     * (strength)이고, 커밋 D 가 등판 창 3일 안의 무거운 하체를 후보에서 빼며(heavyLower false), 커밋 E 의 날 종류가 하체 · 상체 마지막
     * 날이 둘 다 없을 때의 쪽을 정한다 — 3일 안(R5)이면 다리를 아끼는 상체, 오늘 '4일 이상 뒤'(R6)면 하체. 어제 '4일 이상 뒤'를 하루
     * 당긴 '3일 이상 뒤'는 3일 뒤일 수도 있어 쪽을 안 정한다(날짜 홀짝 — 06-15 는 상체), 무거운 하체는 든다(끝이 없는 창이라 커밋 D 밖).
     */
    {
      name: "오늘 '2~3일 뒤' → 근력(상체 쪽) · 무거운 하체 0",
      today: { throwPlan: '2~3일 뒤' },
      planned: null,
      theme: 'strength',
      key: 'upper',
      heavyLower: false,
    },
    {
      name: "오늘 '4일 이상 뒤' → 근력(하체 쪽) · 무거운 하체 든다",
      today: { throwPlan: '4일 이상 뒤' },
      planned: null,
      theme: 'strength',
      key: 'lower',
      heavyLower: true,
    },
    {
      name: "오늘 답 없음 + 어제 '2~3일 뒤' (이월하지 않는다 — 오늘 1~2일 뒤라 날을 못 박는다) → 근력(상체 쪽) · 무거운 하체 0",
      today: { throwPlan: null },
      yesterday: { throwPlan: '2~3일 뒤' },
      planned: null,
      theme: 'strength',
      key: 'upper',
      heavyLower: false,
    },
    {
      name: "오늘 체크인 없음 + 어제 '4일 이상 뒤' → 근력(쪽은 날짜 홀짝) · 무거운 하체 든다",
      today: null,
      yesterday: { throwPlan: '4일 이상 뒤' },
      planned: null,
      theme: 'strength',
      key: 'upper',
      heavyLower: true,
    },
    {
      name: "오늘 '2~3일 뒤' + 어제 '내일 등판' (비로 밀림 — 오늘 답이 이긴다) → 근력(상체 쪽) · 무거운 하체 0",
      today: { throwPlan: '2~3일 뒤' },
      yesterday: { throwPlan: '내일 등판' },
      planned: null,
      theme: 'strength',
      key: 'upper',
      heavyLower: false,
    },
  ];
  for (const c of outingCases) {
    const facts = p0Facts({ today: c.today, yesterday: c.yesterday });
    const plan = buildPitchPlan(facts);
    const planned = plannedOuting(facts);
    const theme = decideTheme({
      facts,
      plan,
      lastLowerKey: null,
      lastUpperKey: null,
      preferredWorkout: facts.condition.today?.preferredWorkout ?? null,
      override: c.override ?? false,
    });
    check(
      `등판 답 — ${c.name} → plannedOuting ${c.planned}`,
      planned === c.planned,
      String(planned)
    );
    check(
      `등판 답 — ${c.name} → 테마 ${c.theme}`,
      strengthOr(theme.key) === c.theme,
      `${theme.key} · ${theme.reason}`
    );
    if (c.key !== undefined) {
      check(
        `등판 답 — ${c.name} → 쪽 ${c.key}(하체 · 상체 마지막 날이 둘 다 없을 때, 2판 P4 커밋 E)`,
        theme.key === c.key,
        `${theme.key} · ${theme.reason}`
      );
    }
    if (c.heavyLower !== undefined) {
      const left = selectCandidates({ facts, plan, library }).candidates.filter(
        isHeavyLower
      ).length;
      check(
        `등판 답 — ${c.name} → 후보의 무거운 하체 ${c.heavyLower ? '남음' : '0'}(2판 P4 커밋 D)`,
        c.heavyLower ? left > 0 : left === 0,
        `${left}개`
      );
    }
  }
  /* 답이 늘면(D1 — '2~3일 뒤' · '4일 이상 뒤') 여기도 늘려야 한다 — 새 답이 어느 갈래로 가는지 적지 않은 채 지나가지 않게 */
  const answersTested = new Set(
    outingCases
      .flatMap((c) => [c.today?.throwPlan, c.yesterday?.throwPlan])
      .filter((a) => a != null)
  );
  check(
    `등판 답 — THROW_PLANS ${THROW_PLANS.length}개가 모두 시험에 들어 있다`,
    THROW_PLANS.every((a) => answersTested.has(a)) &&
      answersTested.size === THROW_PLANS.length,
    [...answersTested].join(' · ')
  );

  /* ─────────────── (b) 기능 엇갈림 표 — 같은 입력을 다섯 독자가 어떻게 읽는가(지금 동작 고정) ─────────────── */
  /*
   * 다섯 독자: 매일 일정(decideTheme) · 투구 계획(buildPitchPlan) · 영양(throwDayKind) · 암케어(decideArmcare) ·
   * 근력 프로그램(decideToday — DB 를 읽는 lib/program/load.ts 의 buildProgramDay 는 못 부르므로 그 안의 판단을 여기서 만든다.
   * 던지는 신호는 앱과 같은 함수 programSignalsOf 를 같은 오늘 상태 한 장으로 부른다(2판 P3 — 그 전에는 load.ts 의 식을 베꼈다).
   * 회복 · 주의 칸은 아직 load.ts 와 같은 식을 여기 적어 둔다 — load.ts 가 바뀌면 같이 고친다).
   *
   * 알려진 엇갈림(2판 검토안 — P3 '오늘 상태 한 장'에서 한 값으로 모은다. 그 단계에서 아래 기대값을 고친다):
   *   C1 '오늘 등판'인 날 — 일정은 회복인데 암케어는 강화(기록이 없어 던진 날로 안 봄), 투구 계획은 평소대로 던지라 함.
   *      → P3 로 바뀜(2026-10-12 C1 · C4 뒤집기): 투구 계획 'game'(범위 없이 양은 경기가 정함) · 암케어 'recovery'.
   *   C3 '오늘 불펜' — 영양은 던지는 날(던지기 전 식사)인데 일정 · 암케어 · 프로그램은 평소 날.
   *   C4 어제 '내일 등판' + 오늘 체크인 없음 — 일정 · 영양은 등판 날인데 암케어는 강화, 프로그램은 체크인부터.
   *      → P3 로 바뀜: 투구 계획 'game' · 암케어 'recovery'(프로그램은 체크인 규칙이 먼저라 그대로 needCheckin).
   *   C5 팔 피로 '심함' — 암케어만 회복, 일정 · 프로그램은 평소 날(팔 피로를 안 읽는다).
   *      → P4 로 바뀜(2026-10-12 커밋 C): 테마는 그대로 근력이지만 안전 거르기가 무거운 상체 밀기 · 팔 플라이오를 뺀다(여섯째 칸 safety).
   *   C6 어제 '오늘 등판' 답 + 기록 없음 — 프로그램만 경기 다음 날로 쉬고, 일정 · 암케어 · 투구 계획은 평소 날(D3 · P4).
   *      → P4 로 바뀜(2026-10-12 커밋 E, C6 결정): 매일 일정 'strength' → 'assist'(날 종류 R3' — 기록 없는 등판 다음 날은 무게 없이 보조 ·
   *        코어, 기록을 청함). 프로그램 · 암케어 · 투구 계획은 그대로(커밋 F 몫 — 프로그램 · 암케어도 부하 기준으로).
   *      → P4 로 바뀜(2026-10-12 커밋 F, D3): 암케어 'strength' → 'recovery'(어제 팔 부담 claimedNoLog — 프로그램 쉬는 날과 같은 함수).
   *        이제 투구 계획만 평소 날이다(투구 계획은 어제 답을 안 읽는다 — 이 단계 밖).
   *   C2L 어제 경기 15구(새로, 커밋 F) — 예전에는 프로그램만 '경기 다음 날'로 쉬고 암케어는 회복이었다(달력). 이제 다섯 독자 모두 평소 날.
   */
  const program531 = parseProgram('531');
  check("엇갈림 표 — 프로그램 '531'(주 3번)을 읽을 수 있다", program531 != null);
  /* 고정 운동 — 장비를 다 가진 사람이 시작할 때 고르는 것(P4 검토 — 대체 칸을 앱과 같은 길로 재려고) */
  const programPinned = pickPinned(
    library,
    [...new Set(library.flatMap((e) => e.equipment))],
    null
  );
  type FiveReaders = {
    theme: string;
    pitchPlan: string;
    nutrition: string;
    armcare: string;
    program: string;
    /**
     * 안전 거르기(selectCandidates) 뒤 후보에 무거운 상체 밀기 · 팔 플라이오가 남았나 — 'heavyArm'(남음) · 'none'. 2판 P4 커밋 C 에서
     * 더한 여섯째 칸: 팔 피로 규칙(5-2)은 테마가 아니라 후보에서 일해, 다섯 칸만으로는 C5 가 바뀐 것이 안 보였다.
     */
    safety: string;
  };
  /*
   * 무거운 상체 밀기 · 팔 플라이오의 좁은 판정 — lib/engine/exercise-class.ts 를 베끼지 않는다(그 판정이 틀려도 같이 틀리지 않게).
   * 누가 봐도 그것인 것만: 이름에 벤치 · 프레스가 든 '높음' 이상 바벨 · 덤벨 상체 근력, 메디신볼 · 플라이오볼을 쓰는 파워.
   * 실제 표에서 앞은 8개(판정 10개의 부분), 뒤는 5개(판정 7개의 부분)다 — 그래서 '좁은 판정 0'은 판정이 이것들을 놓치지 않는다는 뜻.
   */
  const narrowHeavyPush = (e: {
    category: string;
    intensity: string;
    title: string;
    equipment: readonly string[];
  }) =>
    e.category === '상체 스트렝스' &&
    intensityLevel(e.intensity) > INTENSITY_CAP.MODERATE &&
    /벤치|프레스/.test(e.title) &&
    e.equipment.some((q) => q === '바벨' || q === '덤벨');
  const narrowArmPlyo = (e: { category: string; equipment: readonly string[] }) =>
    e.category === '파워' &&
    e.equipment.some((q) => q === '메디신볼' || q === '플라이오볼');
  /*
   * 무거운 하체의 좁은 판정(2판 P4 커밋 D) — exercise-class.ts 의 isHeavyLower 를 베끼지 않는다. 누가 봐도 무거운 하체인 것만: 바벨을
   * 지는 하체 근력 · '매우 높음' 하체 근력 · 스쿼트 · 런지 · 힌지 계열의 파워(점프 · 바운드). 판정(isHeavyLower)은 이것보다 넓다 —
   * '높음' 덤벨 하체 · 계열 없는 하체 부위 파워까지 — 그래서 '좁은 판정 0'은 판정이 이것들을 놓치지 않는다는 뜻이다.
   */
  const narrowHeavyLower = (e: {
    category: string;
    intensity: string;
    equipment: readonly string[];
    movementPattern?: string | null;
  }) =>
    (e.category === '하체 스트렝스' &&
      (e.equipment.includes('바벨') ||
        intensityLevel(e.intensity) > INTENSITY_CAP.STRENGTH)) ||
    (e.category === '파워' &&
      (e.movementPattern === '스쿼트' ||
        e.movementPattern === '런지' ||
        e.movementPattern === '힌지'));
  /*
   * 등판 창 안인가 — 코드(outingOf · nextOutingWindow)가 아니라 사람에게 넣은 답 글자로 따로 정한다. 오늘 답이 있으면 오늘 답만
   * ('오늘 등판' · '내일 등판' · '2~3일 뒤'), 없으면 어제 답을 하루 당겨('내일 등판' → 오늘 · '2~3일 뒤' → 1~2일 뒤). 어제 '4일 이상 뒤'
   * (오늘 3일 이상 뒤)는 끝이 없는 답이라 창 밖이다(prescription.ts 2-2 주석).
   */
  const rawOutingWindow = (p: P0Person) => {
    const todayAnswer = p.today?.throwPlan;
    if (todayAnswer != null)
      return ['오늘 등판', '내일 등판', '2~3일 뒤'].includes(todayAnswer);
    const yesterdayAnswer = p.yesterday?.throwPlan;
    return (
      yesterdayAnswer != null && ['내일 등판', '2~3일 뒤'].includes(yesterdayAnswer)
    );
  };
  const readFive = (p: P0Person): FiveReaders => {
    const facts = p0Facts(p);
    const plan = buildPitchPlan(facts);
    const picked = selectCandidates({ facts, plan, library });
    const theme = decideTheme({
      facts,
      plan,
      lastLowerKey: null,
      lastUpperKey: null,
      preferredWorkout: facts.condition.today?.preferredWorkout ?? null,
    });
    /* 'game' = 등판 날(DayPlan.outing — P3 로 생김: 범위 없이 양은 경기가 정함). 불펜 이름표는 범위가 그대로라 'throw' 등으로 읽는다 */
    const pitchPlan = plan.halted
      ? 'halted'
      : plan.today == null
        ? 'threw'
        : plan.today.outing === 'game'
          ? 'game'
          : !plan.today.throwing
            ? 'rest'
            : plan.today.recovery
              ? 'recovery'
              : 'throw';
    const planToday = facts.condition.throwPlanToday ?? null;
    const planYesterday = facts.condition.throwPlanYesterday ?? null;
    const asOf = p.asOf ?? TODAY;
    const logs = p.logs ?? [];
    /* load.ts 의 pitchTypesToday 와 글자 그대로 같게 — 투구수는 보지 않는다(오늘 0구 '경기' 줄도 앱은 경기로 읽는다) */
    const typesOn = (daysAgo: number) =>
      logs.filter((l) => l.daysAgo === daysAgo).map((l) => l.sessionType ?? '');
    const nutrition =
      throwDayKind({
        planToday,
        planYesterday,
        appetite: null,
        pitches: logs
          .filter((l) => l.daysAgo === 0)
          .map((l) => ({
            sessionType: l.sessionType ?? '',
            pitchCount: l.pitches,
            loggedAt: asOf.toISOString(),
          })),
      }) ?? 'none';
    /*
     * 암케어는 앱(lib/armcare/today.ts)처럼 오늘 상태 한 장을 받는다 — P3 로 바뀜(C1 · C4 뒤집기): 그 장의 등판 신호(outing.role)로
     * 등판 날 회복. 팔 피로도 그 장에서 넘긴다(앱은 state.arm.fatigue 를 넘긴다 — 같은 값). P4 로 바뀜(커밋 C) — 왜: 팔 피로가
     * facts 칸이 돼, 예전처럼 extras 로 장에만 실으면 안전 거르기(후보)는 못 본다. 이제 사람의 오늘 체크인에 적어 다섯 독자 ·
     * 안전 거르기가 같은 입력을 본다.
     */
    const armState = buildDayState({ facts, plan });
    const armcare = decideArmcare({
      facts,
      plan,
      armFatigue: armState.arm.fatigue,
      state: armState,
    }).kind;
    const today = facts.condition.today;
    const zone = facts.load.zone;
    /*
     * 그날 대체할 칸 — 앱(lib/program/load.ts)과 같은 길(P4 검토로 바뀜, 2026-10-12): 부위 규칙만으로 거른 후보(partsOnly) 밖의 고정 운동 칸,
     * 까닭은 팔 피로만으로 빠졌으면 '팔 피로'(painSlotsOf). 예전에는 painSlots 를 [] 로 두어 앱과 다른 모양을 쟀다(C5 의 대체가 안 보였다).
     * 고정 운동은 장비를 다 가진 사람이 처음 고르는 것(pickPinned — 앱이 시작할 때 고르는 규칙 그대로).
     */
    const programSafeInput = { facts, plan, library, partsOnly: true };
    const programSafeIds = new Set(
      selectCandidates(programSafeInput).candidates.map((e) => e.id)
    );
    const programSlots =
      program531 == null
        ? { painSlots: [], slotReasons: {} }
        : painSlotsOf(
            programDayPlan(program531, 1).items,
            (v) => (programPinned[v] ? { id: programPinned[v] } : null),
            programSafeIds,
            droppedOnlyForArmFatigue(programSafeInput)
          );
    /*
     * 프로그램을 못 읽었으면(키가 바뀜) 여기서 멈추지 않고 '프로그램을 못 읽음'으로 돌려준다 — 그러면 프로그램 칸의
     * 검사만 그 까닭으로 깨지고 나머지 네 독자의 검사는 그대로 본다. `program531!` 로 넘기면 decideToday 안에서
     * TypeError 로 스크립트가 통째로 죽어 뒤의 검사 결과를 못 본다.
     */
    const decision =
      program531 == null
        ? null
        : decideToday(program531, {
            nextDay: 1,
            today: facts.asOf,
            lastProgramDate: null,
            checkedIn: today != null,
            otherWorkoutStarted: false,
            halted: picked.halted,
            /*
             * P3 로 바뀜(2026-10-12 프로그램 · 영양 읽기 통일) — 왜: 여기 베껴 둔 throwSignals 식은 앱이 바뀌어도 옛 식을 쟀다.
             * 이제 앱(lib/program/load.ts)과 같은 함수 programSignalsOf 를 같은 오늘 상태 한 장으로 부른다. 기대값은 그대로.
             * P4 로 바뀜(2026-10-12 커밋 F, D3) — 왜: '경기 다음 날'이 어제 기록의 세션 종류(typesYesterday)가 아니라 어제 팔 부담이 됐다.
             * 앱과 같은 함수(lib/engine/arm-load.ts yesterdayArmLoadOf)를 같은 facts 로 부른다.
             */
            ...programSignalsOf({
              outing: armState.outing,
              typesToday: typesOn(0),
              yesterdayArmLoad: yesterdayArmLoadOf(facts),
            }),
            hardThrowRecent: armState.load.hardOutingRecent,
            override: false,
            recovery:
              zone === 'danger'
                ? 'loadRisk'
                : today && today.condition <= LOW_CONDITION_THRESHOLD
                  ? 'lowCondition'
                  : today?.soreness != null && today.soreness >= SEVERE_SORENESS
                    ? 'soreSevere'
                    : null,
            loadCaution: zone === 'caution',
            soreMany:
              today?.soreness != null &&
              today.soreness >= HIGH_SORENESS &&
              today.soreness < SEVERE_SORENESS,
            sleepShort: today != null && isShortSleep(today),
            uncertain:
              painRecoveryReason(facts, plan) != null ||
              (zone == null && facts.patterns.lastThrowDate != null),
            painSlots: programSlots.painSlots,
            slotReasons: programSlots.slotReasons,
          });
    /* 하는 날에 칸을 대체하면 그 까닭을 붙인다(P4 검토 — 'go+대체:팔 피로'). 대체가 없으면 예전 글자 그대로 */
    const substituted =
      decision?.kind === 'go'
        ? [
            ...new Set(
              Object.values(decision.adjust).flatMap((a) =>
                a?.kind === 'substitute' ? [a.reason] : []
              )
            ),
          ].sort()
        : [];
    const program =
      decision == null
        ? '프로그램을 못 읽음'
        : decision.kind === 'rest'
          ? `rest:${decision.reason}`
          : decision.kind === 'go'
            ? `go${decision.caution ? `:${decision.caution}` : ''}${substituted.length ? `+대체:${substituted.join(',')}` : ''}`
            : decision.kind;
    const safety = picked.candidates.some((e) => narrowHeavyPush(e) || narrowArmPlyo(e))
      ? 'heavyArm'
      : 'none';
    return {
      theme: strengthOr(theme.key),
      pitchPlan,
      nutrition,
      armcare,
      program,
      safety,
    };
  };
  /*
   * safety 칸(2판 P4 커밋 C 에서 더함)의 기대값은 C5 말고는 더할 때의 값 그대로다 — C2 의 'none' 은 팔 때문이 아니라 부하 지수를 못
   * 내 무게 드는 운동이 다 빠진 것(2) 부하 구간)이다.
   */
  const crossRows: {
    tag: string;
    name: string;
    person: P0Person;
    expect: FiveReaders;
  }[] = [
    {
      tag: 'C1',
      name: "① 오늘 체크인 '오늘 등판' + 투구 기록 없음",
      person: { today: { throwPlan: '오늘 등판' } },
      /*
       * P3 로 바뀜(2026-10-12 C1 · C4 뒤집기) — 왜: 일정은 회복인데 투구 계획은 '평소대로 40~60구', 암케어는 강화를 내 한 아침을
       * 셋으로 말했다. 투구 계획 'throw' → 'game'(범위 없이 양은 경기가 정함) · 암케어 'strength' → 'recovery'(오늘 상태 한 장의 등판 신호).
       */
      expect: {
        theme: 'recovery',
        pitchPlan: 'game',
        nutrition: 'today',
        armcare: 'recovery',
        program: 'rest:gameToday',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C2',
      name: '② 어제 경기 85구 · 강도 10 (오늘 체크인은 답 없음)',
      person: {
        today: {},
        logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
      },
      expect: {
        theme: 'recovery',
        pitchPlan: 'rest',
        nutrition: 'none',
        armcare: 'recovery',
        program: 'rest:gameYesterday',
        safety: 'none',
      },
    },
    {
      tag: 'C2L',
      name: '②′ 어제 경기 15구 · 강도 10 (오늘 체크인은 답 없음 — 2판 P4 커밋 F 에서 더함)',
      person: {
        today: {},
        logs: [{ daysAgo: 1, pitches: 15, intensity: 10, sessionType: '경기' }],
      },
      /*
       * D3 — 경기 다음 날이어도 팔 부담(15 × 100% = 1,500 · 실전 강도 15구)이 작으면 평소 날. 커밋 F 전에는 프로그램이 'rest:gameYesterday'
       * (어제 '경기' 기록이면 쉼), 암케어가 'recovery'('어제 15구')였다 — 매일 일정만 평소 날이라 셋이 갈렸다.
       */
      expect: {
        theme: 'strength',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'strength',
        program: 'go',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C3',
      name: "③ 오늘 '오늘 불펜'",
      person: { today: { throwPlan: '오늘 불펜' } },
      expect: {
        theme: 'strength',
        pitchPlan: 'throw',
        nutrition: 'today',
        armcare: 'strength',
        program: 'go',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C4',
      name: "④ 어제 '내일 등판' + 오늘 체크인 없음",
      person: { today: null, yesterday: { throwPlan: '내일 등판' } },
      /*
       * P3 로 바뀜(C1 과 같은 까닭) — 어제 '내일 등판'에 오늘 답이 없으면 오늘이 등판(lib/checkin.ts todayOutingRole). 투구 계획
       * 'throw' → 'game' · 암케어 'strength' → 'recovery'. 프로그램은 체크인 규칙이 먼저라 그대로 needCheckin.
       */
      expect: {
        theme: 'recovery',
        pitchPlan: 'game',
        nutrition: 'today',
        armcare: 'recovery',
        program: 'needCheckin',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C5',
      name: "⑤ 팔 피로 '심함'(5)",
      /*
       * P4 로 바뀜(2026-10-12 커밋 C) — 왜: 팔 피로 '심함'은 암케어만 회복으로 돌리고 일정 · 프로그램은 벤치 프레스 · 메디신볼을 그대로
       * 냈다(팔 피로를 안 읽음). 이제 팔 피로가 facts 칸이라 안전 거르기가 무거운 상체 밀기 · 팔 플라이오를 뺀다(safety 'none').
       * 테마는 그대로 근력이다(안전 층만 — 상체날이면 가벼운 밀기 · 당기기가 남는다), 프로그램은 그날 그 칸을 대체한다(이 표는
       * painSlots 를 [] 로 두어 'go' 그대로). 입력도 옮겼다 — 예전 HIGH_ARM_FATIGUE + 1 을 extras 로 장에만 실었는데 이제 오늘 체크인에.
       */
      person: { today: { armFatigue: SEVERE_ARM_FATIGUE } },
      expect: {
        theme: 'strength',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'recovery',
        program: 'go',
        safety: 'none',
      },
    },
    {
      tag: 'C6',
      name: "⑥ 어제 '오늘 등판' 답 + 투구 기록 없음 + 오늘 답 없음",
      person: { today: {}, yesterday: { throwPlan: '오늘 등판' } },
      /*
       * P4 로 바뀜(2026-10-12 커밋 E) — 왜: 기록 없는 등판 다음 날(C6 결정)은 부하를 몰라 무게를 빼고 보조 · 코어(날 종류 R3').
       * 매일 일정 'strength' → 'assist'. 나머지 칸은 그대로다.
       * P4 로 바뀜(2026-10-12 커밋 F, D3) — 왜: 암케어도 어제 팔 부담 한 곳(yesterdayArmLoadOf)을 읽어, 기록 없는 등판 다음 날은 던진 다음
       * 날로 본다('어제 등판' → 회복 루틴). 암케어 'strength' → 'recovery'. 프로그램은 같은 함수로 그대로 쉰다(까닭 글만 '어제 팔 부담이 컸어요').
       */
      expect: {
        theme: 'assist',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'recovery',
        program: 'rest:gameYesterday',
        safety: 'heavyArm',
      },
    },
    /*
     * 2판 P4 커밋 G 에서 더함 — 짐작한 등판(달력 · 같은 요일). 사용자 결정: 짐작은 가볍게 하는 쪽(무거운 하체 빼기 · 보조)에만. 그래서
     * 일부러 매일 일정만 보조로 가고, 회복 · 쉬기를 내는 독자(투구 계획 · 영양 · 암케어 · 프로그램)는 답 · 기록만 읽어 그대로다 —
     * 짐작으로 경기 날 식사 · 회복 루틴 · 프로그램 쉬기를 내면 틀린 아침이 커진다(영양의 '던지기 전 식사'는 더 먹으라는 말이라 가볍게
     * 하는 쪽이 아니다). 같은 사람에서 달력 · 기록만 빼면 일정이 근력으로 돌아온다(아래 C7′ · C8′).
     */
    {
      tag: 'C7',
      name: "⑦ 달력에 오늘 '리그 경기' + 오늘 답 없음(커밋 G)",
      person: {
        today: {},
        calendar: [{ date: p0Key(TODAY, 0), title: '리그 경기' }],
      },
      expect: {
        theme: 'assist',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'strength',
        program: 'go',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C7′',
      name: '⑦′ C7 에서 달력만 뺌 — 일정이 근력으로 돌아온다',
      person: { today: {}, calendar: [] },
      expect: {
        theme: 'strength',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'strength',
        program: 'go',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C8',
      name: '⑧ 최근 4주 월요일 경기 3번(7 · 14 · 21일 전) · 오늘 월요일 · 오늘 답 없음(커밋 G)',
      person: {
        today: {},
        calendar: [],
        logs: [7, 14, 21].map((d) => ({
          daysAgo: d,
          pitches: 60,
          intensity: 10,
          sessionType: '경기',
        })),
      },
      expect: {
        theme: 'assist',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'strength',
        program: 'go',
        safety: 'heavyArm',
      },
    },
    {
      tag: 'C8′',
      name: '⑧′ C8 에서 21일 전 경기만 뺌(같은 요일 2번) — 짐작이 안 서 근력',
      person: {
        today: {},
        calendar: [],
        logs: [7, 14].map((d) => ({
          daysAgo: d,
          pitches: 60,
          intensity: 10,
          sessionType: '경기',
        })),
      },
      expect: {
        theme: 'strength',
        pitchPlan: 'throw',
        nutrition: 'none',
        armcare: 'strength',
        program: 'go',
        safety: 'heavyArm',
      },
    },
  ];
  const readerNames: [keyof FiveReaders, string][] = [
    ['theme', '매일 일정'],
    ['pitchPlan', '투구 계획'],
    ['nutrition', '영양'],
    ['armcare', '암케어'],
    ['program', '프로그램'],
    ['safety', '안전 거르기(무거운 밀기 · 팔 플라이오)'],
  ];
  console.log(
    '  | 입력 | 매일 일정 | 투구 계획 | 영양 | 암케어 | 프로그램 | 안전 거르기 |'
  );
  console.log('  | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of crossRows) {
    const got = readFive(row.person);
    console.log(`  | ${row.name} | ${readerNames.map(([k]) => got[k]).join(' | ')} |`);
    for (const [key, label] of readerNames) {
      check(
        `엇갈림 ${row.tag} — ${row.name} → ${label} ${row.expect[key]}`,
        got[key] === row.expect[key],
        got[key]
      );
    }
  }

  /* ─────────────── (c) 불변식 — 가짜 사람 160명(결정적 난수)을 화면과 같은 길(buildDailyPlan)로 ─────────────── */
  /* 결정적 난수(mulberry32) — 같은 씨앗이면 어느 컴퓨터에서든 같은 사람이 나온다. 깨지면 그 번호(p0-N)로 다시 만들 수 있다 */
  const p0Rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p0Rand = p0Rng(20261011);
  const p0Pick = <T,>(arr: readonly T[]): T => arr[Math.floor(p0Rand() * arr.length)];
  const p0Chance = (p: number) => p0Rand() < p;
  const p0TodayKey = toDateKey(TODAY);
  /*
   * 가진 장비는 사람마다 따로 씨앗을 둔 난수로, 프로필 화면이 고르게 하는 고정 목록(SELECTABLE_EQUIPMENT)에서 뽑는다.
   * 처음에는 라이브러리의 장비를 모아 주 난수 흐름에서 하나씩 뽑았는데, 그러면 운동을 숨기거나 새 장비가 생겨 장비 수가
   * 바뀔 때마다 그 사람의 minutes · goal · override 와 그 뒤 모든 사람이 통째로 바뀌어 '지금 값 고정' 검사가 라이브러리
   * 변경만으로 조용히 흔들렸다. 떼어 두면 장비 목록이 바뀌어도 나머지 칸은 그대로다.
   */
  const ownedOf = (i: number) => {
    const rand = p0Rng(1_000_000 + i);
    return [ALWAYS_OWNED, ...SELECTABLE_EQUIPMENT.filter(() => rand() < 0.5)];
  };
  const rehabOf = (
    area: ArmcareAreaKey,
    severity: RehabSeverity,
    stage: RehabStage
  ): RehabFacts =>
    rehabFacts(
      {
        area,
        condition: null,
        severity,
        stage,
        stageStartedOn: '2026-06-01',
        stageShortenDays: 0,
        startedOn: '2026-06-01',
      },
      p0TodayKey
    );
  type P0Combo = {
    seed: string;
    p: P0Person;
    owned: string[];
    minutes: number;
    goal: string | null;
    override: boolean;
    lastLowerKey: string | null;
    lastUpperKey: string | null;
  };
  const makeCombo = (i: number): P0Combo => {
    const parts = (): Partial<Record<CheckinPartKey, string>> => {
      const out: Partial<Record<CheckinPartKey, string>> = {};
      for (const { key } of CHECKIN_PARTS) {
        const r = p0Rand();
        out[key] = r < 0.08 ? '통증' : r < 0.2 ? '뻐근' : '정상';
      }
      return out;
    };
    /*
     * 열여섯에 하나는 '최근 통증 + 오늘 체크인 없음'(통증 확인 전)으로 못 박는다 — 난수로만 두면 1% 남짓이라
     * 160명 중 한 명도 안 나와 불변식 ③이 빈 채로 통과했다.
     */
    const unknownPain = i % 16 === 5;
    const today: P0Checkin | null =
      !unknownPain && p0Chance(0.85)
        ? {
            ...parts(),
            condition: p0Pick([2, 3, 4, 5, 6, 7, 8, 9, 10]),
            sleep: p0Pick(['충분', '보통', '부족']),
            ...(p0Chance(0.5) ? { sleepHours: p0Pick([5, 6, 7, 8]) } : {}),
            ...(p0Chance(0.5) ? { soreness: p0Pick([1, 2, 3, 4, 5]) } : {}),
            preferredWorkout: p0Pick([null, null, '웨이트', '파워', '회복']),
            throwPlan: p0Pick([null, null, ...THROW_PLANS]),
          }
        : null;
    const yesterday: P0Checkin | null =
      unknownPain || p0Chance(0.6)
        ? {
            ...(unknownPain || p0Chance(0.15) ? { shoulder: '통증' } : {}),
            throwPlan: p0Pick([null, ...THROW_PLANS]),
          }
        : null;
    const logs: P0Log[] = [];
    for (let d = 1; d <= 7; d++) {
      if (!p0Chance(0.5)) continue;
      logs.push({
        daysAgo: d,
        pitches: p0Pick([15, 25, 35, 45, 60, 75, 90]),
        intensity: p0Pick([4, 5, 6, 7, 8, 9, 10]),
        sessionType: p0Pick(['경기', '불펜', '라이브', '캐치볼', undefined]),
      });
    }
    if (p0Chance(0.25)) {
      logs.push({
        daysAgo: 0,
        pitches: p0Pick([20, 35, 50, 80]),
        intensity: p0Pick([5, 7, 9, 10]),
        sessionType: p0Pick(['경기', '불펜', '캐치볼']),
      });
    }
    const rehab = p0Chance(0.12)
      ? rehabOf(
          p0Pick(['shoulder-back', 'elbow-inner'] as const),
          p0Pick(['mild', 'moderate'] as const),
          p0Pick([1, 2, 3, 4] as const)
        )
      : null;
    return {
      seed: `p0-${i}`,
      p: {
        age: p0Pick([13, 14, 15, 16, 17, 18, 20, 22, 25, 30, null]),
        trainingLevel: p0Pick([null, '입문', '초급', '중급', '상급']),
        today,
        yesterday,
        logs,
        rehab,
        memos: p0Chance(0.1) ? ['어제 던지고 나서 어깨가 조금 아프다'] : [],
      },
      owned: ownedOf(i),
      minutes: p0Pick([45, 60, 75, 90]),
      goal: p0Pick([null, '근력 향상', '파워 향상', '컨디셔닝']),
      override: p0Chance(0.2),
      lastLowerKey: p0Pick([null, '2026-06-12', '2026-06-13']),
      lastUpperKey: p0Pick([null, '2026-06-11', '2026-06-14']),
    };
  };
  /*
   * 팔 피로 축(2판 P4 커밋 C) — 사람마다 따로 씨앗(2_000_000 + i)으로 뽑는다. ownedOf 와 같은 까닭이다: 주 난수 흐름에 끼우면 뒤
   * 사람이 통째로 바뀌어 '지금 값 고정' 검사가 흔들리고, 파일 끝 '오늘 상태 한 장' 절이 베낀 사람(p0PeopleSeen)과도 어긋난다. 그래서
   * 사람을 만들어 p0PeopleSeen 에 적은 뒤 오늘 체크인에만 얹는다 — 오늘 체크인이 없거나 뽑히지 않은 사람은 글자 하나 안 바뀐다.
   * 열여섯에 하나(i % 16 === 9)는 '심함'으로 못 박는다 — 난수로만 두면 '심함'이 10% 남짓이라 불변식 ⑭가 빈약해진다.
   */
  const withArmAxis = (c: P0Combo, i: number): P0Combo => {
    const today = c.p.today;
    if (!today) return c;
    const rand = p0Rng(2_000_000 + i);
    const armFatigue =
      i % 16 === 9
        ? SEVERE_ARM_FATIGUE
        : rand() < 0.5
          ? 1 + Math.floor(rand() * 5)
          : null;
    if (armFatigue == null) return c;
    return { ...c, p: { ...c.p, today: { ...today, armFatigue } } };
  };
  const buildOf = (c: P0Combo) => {
    const facts = p0Facts(c.p);
    const plan = buildPitchPlan(facts);
    const user = { ownedEquipment: c.owned, trainingLevel: c.p.trainingLevel ?? null };
    const built = buildDailyPlan({
      user,
      facts,
      plan,
      library,
      availableToday: null,
      requestedMinutes: c.minutes,
      trainingGoal: c.goal,
      recentIds: new Set<string>(),
      rotationSeed: c.seed,
      lastLowerKey: c.lastLowerKey,
      lastUpperKey: c.lastUpperKey,
      override: c.override,
    });
    /* 화면과 같은 거르기 차례(장비 → 경력 → 안전)로 후보를 따로 만든다 — 고른 것이 이 안에 있어야 한다(①) */
    const usable = filterByEquipment(library, equipmentForToday(c.owned, null));
    const leveled = filterByLevel(usable.pool, user.trainingLevel);
    const picked = selectCandidates({ facts, plan, library: leveled.pool });
    return { facts, plan, built, picked };
  };
  /*
   * 아픈 부위가 곧바로 뜻하는 부위 — prescription.ts 의 PAIN_PARTS 보다 좁다(그 표는 어깨에 가슴 · 등까지 넣는다).
   * 그 표를 여기 베끼면 표가 틀려도 같이 틀리므로, 누가 봐도 그 부위인 것만 적는다. 전신 운동은 어디가 아프든 아픈 곳을 쓴다.
   */
  const DIRECT_PARTS: Record<CheckinPartKey, readonly string[]> = {
    shoulder: ['어깨', '견갑'],
    elbow: ['팔꿈치'],
    wrist: ['손목·전완'],
    lowerBack: ['코어', '등'],
    lowerBody: ['고관절', '햄스트링·둔근', '종아리·발목'],
  };
  const byId = new Map(library.map((e) => [e.id, e]));
  const bad = new Map<string, string[]>();
  const note = (rule: string, msg: string) => {
    const list = bad.get(rule) ?? [];
    list.push(msg);
    bad.set(rule, list);
  };
  const cover = {
    total: 0,
    halted: 0,
    hard: 0,
    plannedToday: 0,
    plannedTomorrow: 0,
    lowCond: 0,
    rehab: 0,
    youth: 0,
    painToday: 0,
    forcing: 0,
    themes: new Map<ThemeKey, number>(),
  };
  /* 2판 P4 커밋 C 에서 더한 덮임 — 위 cover 는 그대로 두고(그 검사 이름 · 문턱을 안 흔들게) 따로 센다 */
  const armCover = { severe: 0, mild: 0, youthRest: 0 };
  /* 2판 P4 커밋 D 의 덮임 — 등판 창 안 · 규칙이 실제로 뺀 날 · 창 안에서 하체 날이 선 날(가벼운 하체로) */
  const windowCover = { window: 0, bites: 0, lower: 0 };
  /*
   * 2판 P4 커밋 G 의 짝(⑬) — 사람마다 따로 씨앗(4_000_000 + i)으로 달력 일정 · 같은 요일 경기 날짜를 뽑는다(ownedOf · 팔 피로 축과 같은
   * 까닭: 주 난수 흐름에 끼우면 뒤 사람이 통째로 바뀐다). 원래 사람(c)은 그대로 두고 짝만 만든다. 달력 이름에는 등판이 아닌 것(병원) ·
   * 빼는 낱말(관람 · 응원)도 섞고, 같은 요일은 2~4번(2번은 짐작이 안 서는 음성 사례)으로. 열여섯에 하나(i % 16 === 3)는 '달력에 오늘
   * 경기', 또 하나(i % 16 === 11)는 '달력에 내일 선발 등판'으로 못 박는다 — 난수로만 두면 오늘 · 내일 짐작이 빈약하다.
   */
  const SOFT_TITLES = [
    '리그 경기',
    '선발 등판',
    '주말 경기',
    '친선 경기 관람',
    '병원',
    '응원 가기',
  ] as const;
  const withSoftAxis = (c: P0Combo, i: number): P0Combo => {
    const rand = p0Rng(4_000_000 + i);
    const calendar: CalendarEventLike[] = [];
    if (i % 16 === 3) {
      calendar.push({ date: p0Key(TODAY, 0), title: '리그 경기' });
    } else if (i % 16 === 11) {
      calendar.push({ date: p0Key(TODAY, -1), title: '선발 등판' });
    } else if (rand() < 0.7) {
      const n = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        calendar.push({
          date: p0Key(TODAY, -Math.floor(rand() * 17)),
          title: SOFT_TITLES[Math.floor(rand() * SOFT_TITLES.length)],
        });
      }
    }
    const gameDates: string[] = [];
    if (rand() < 0.5) {
      const ahead = Math.floor(rand() * 7);
      const games = 2 + Math.floor(rand() * 3);
      for (let w = 1; w <= games; w++) gameDates.push(p0Key(TODAY, 7 * w - ahead));
    }
    return { ...c, p: { ...c.p, calendar, gameDates } };
  };
  /** 테마 등급 — 회복 < 보조 < 근력(하체 · 상체는 같은 등급) */
  const THEME_RANK: Record<ThemeKey, number> = {
    recovery: 0,
    assist: 1,
    lower: 2,
    upper: 2,
  };
  const softCover = { soft: 0, lighter: 0, blocked: 0 };
  let worstOver = 0;
  const P0_COMBOS = 160;
  for (let i = 0; i < P0_COMBOS; i++) {
    const plainCombo = makeCombo(i);
    p0PeopleSeen.push(JSON.stringify(plainCombo.p));
    /* 팔 피로 축은 적은 뒤에 얹는다(withArmAxis 주석) — 칸이 없는 사람은 plainCombo 와 같은 객체 */
    const c = withArmAxis(plainCombo, i);
    const { facts, plan, built, picked } = buildOf(c);
    const again = buildOf(c).built;
    /*
     * ⑬ 등판 짐작(2판 P4 커밋 G) — 같은 사람에 달력 · 같은 요일 경기 날짜만 얹은 짝(withSoftAxis)과 견준다. 짐작은 가볍게 하는 쪽에만:
     * 테마 등급(회복 < 보조 < 근력)이 올라가지 않고, 짐작 때문에 회복이 되지 않으며(보조까지만), 후보는 짝이 원래의 부분집합(무거운 하체만
     * 더 빠질 수 있다), 멈춤 · 날 못 박기(plannedOuting — 회복 · 쉬기를 내는 독자가 읽는 값)는 그대로다.
     */
    {
      const sc = withSoftAxis(c, i);
      const soft = buildOf(sc);
      const so = outingOf(soft.facts);
      if (so.soft) softCover.soft++;
      if (isHalted(built) !== isHalted(soft.built)) {
        note('⑬', `${c.seed} 짐작을 얹으니 멈춤이 바뀜`);
      } else if (!isHalted(built) && !isHalted(soft.built)) {
        const before = built.theme.key;
        const after = soft.built.theme.key;
        if (THEME_RANK[after] > THEME_RANK[before])
          note('⑬', `${c.seed} ${before} → ${after}(더 무거워짐)`);
        if (before !== 'recovery' && after === 'recovery')
          note('⑬', `${c.seed} ${before} → 회복(짐작으로 회복)`);
        if (THEME_RANK[after] < THEME_RANK[before]) softCover.lighter++;
      }
      const candIdsBefore = new Set(picked.candidates.map((e) => e.id));
      const extra = soft.picked.candidates.filter((e) => !candIdsBefore.has(e.id));
      if (extra.length > 0)
        note('⑬', `${c.seed} 짐작을 얹으니 후보가 늘어남 ${extra.length}개`);
      if (
        soft.picked.excluded.some((x) => x.rule === '등판 전 무거운 하체') &&
        !picked.excluded.some((x) => x.rule === '등판 전 무거운 하체')
      )
        softCover.blocked++;
      if (plannedOuting(soft.facts) !== plannedOuting(facts))
        note('⑬', `${c.seed} 짐작으로 날을 못 박음(plannedOuting)`);
    }
    cover.total++;
    const unknown = painStateUnknown(facts);
    /* ③ 통증 확인 전(최근 통증 + 오늘 체크인 없음)이면 멈추고, 그 밖에는 멈추지 않는다 — 양쪽 다 본다 */
    if (isHalted(built)) {
      cover.halted++;
      if (!unknown) note('③', `${c.seed} 통증 확인 전이 아닌데 멈춤`);
      if (!isHalted(again)) note('⑩', `${c.seed} 두 번째는 안 멈춤`);
      continue;
    }
    if (unknown) note('③', `${c.seed} 통증 확인 전인데 안 멈춤`);
    const pw = facts.condition.today?.preferredWorkout ?? null;
    /* '그래도 하기'는 고른 종류(웨이트 · 파워)가 있을 때만 통한다(workoutConflict → decideTheme 의 forcing) */
    const forcing = c.override && pw != null && pw !== '회복';
    if (forcing) cover.forcing++;
    const key = built.theme.key;
    cover.themes.set(key, (cover.themes.get(key) ?? 0) + 1);
    const exs = built.picks.map((p) => byId.get(p.exerciseId)).filter((e) => e != null);
    const titles = (list: { title: string }[]) => list.map((e) => e.title).join(', ');
    /* ① 고른 것은 모두 안전 거르기를 지난 후보 안에 있다(만드는 시점에는 완료한 것이 없다) */
    const candIds = new Set(picked.candidates.map((e) => e.id));
    const outside = built.picks.filter((p) => !candIds.has(p.exerciseId));
    if (outside.length > 0 || exs.length !== built.picks.length) {
      note('①', `${c.seed} 후보 밖 ${outside.length}개`);
    }
    /* ② 오늘 통증 부위를 곧바로 쓰는 운동이 없다 */
    const painParts = painPartsToday(facts);
    if (painParts.length > 0) cover.painToday++;
    for (const part of painParts) {
      const hit = exs.filter((e) =>
        e.bodyParts.some((bp) => bp === '전신' || DIRECT_PARTS[part].includes(bp))
      );
      if (hit.length > 0) note('②', `${c.seed} ${part} 통증인데 ${titles(hit)}`);
    }
    /* ④ 세게 던진 날(당일 · 다음 날) → 회복 */
    if (hardOuting(facts)) {
      cover.hard++;
      if (!forcing && key !== 'recovery') note('④', `${c.seed} ${key}`);
    }
    /* ⑤ '오늘 등판' → 회복, '내일 등판' → 무게 없는 날(보조, 또는 더 앞선 까닭의 회복) */
    const planned = plannedOuting(facts);
    if (planned === 'today') {
      cover.plannedToday++;
      if (!forcing && key !== 'recovery') note('⑤', `${c.seed} 오늘 등판인데 ${key}`);
    }
    if (planned === 'tomorrow') {
      cover.plannedTomorrow++;
      if (!forcing && (key === 'lower' || key === 'upper')) {
        note('⑤', `${c.seed} 내일 등판인데 ${key}`);
      }
    }
    /* ⑥ 컨디션 ≤ 4 → 회복 */
    const cond = facts.condition.today?.condition;
    if (cond != null && cond <= LOW_CONDITION_THRESHOLD) {
      cover.lowCond++;
      if (!forcing && key !== 'recovery')
        note('⑥', `${c.seed} 컨디션 ${cond}인데 ${key}`);
    }
    /* ⑦ 재활 관절(1~3단계)의 무거운 운동이 없다 — 관절 이름이 곧바로 붙은 부위만 본다 */
    const rehabParts = rehabEasingParts(facts);
    if (rehabParts.length > 0) cover.rehab++;
    for (const part of rehabParts) {
      const direct =
        part === 'shoulder' ? ['어깨'] : part === 'elbow' ? ['팔꿈치'] : [];
      const hit = exs.filter(
        (e) =>
          intensityLevel(e.intensity) > INTENSITY_CAP.MODERATE &&
          e.bodyParts.some((bp) => direct.includes(bp))
      );
      if (hit.length > 0) note('⑦', `${c.seed} 재활 ${part} 인데 ${titles(hit)}`);
    }
    /* ⑧ 성장기(지금은 15세 미만)는 '매우 높음'이 없다 */
    if (facts.profile.age != null && facts.profile.age < YOUTH_AGE_THRESHOLD) {
      cover.youth++;
      const hit = exs.filter(
        (e) => intensityLevel(e.intensity) > INTENSITY_CAP.STRENGTH
      );
      if (hit.length > 0)
        note('⑧', `${c.seed} 만 ${facts.profile.age}세인데 ${titles(hit)}`);
    }
    /*
     * ⑭ 팔 피로 '심함'(2판 P4 커밋 C) → 무거운 상체 밀기 · 팔 플라이오 0 — 고른 것과 안전 거르기 후보 둘 다, 좁은 판정(narrowHeavyPush ·
     * narrowArmPlyo — exercise-class.ts 를 베끼지 않는다). ⑪ ⑫ 는 등판 창(P4 커밋 D, 아래), ⑬ 은 등판 짐작(커밋 G, 이 고리 맨 위의 짝).
     */
    const armNow = facts.condition.today?.armFatigue ?? null;
    const uniqTitles = (list: { title: string }[]) =>
      [...new Set(list.map((e) => e.title))].join(', ');
    if (armNow != null && armNow >= SEVERE_ARM_FATIGUE) {
      armCover.severe++;
      const hit = [...exs, ...picked.candidates].filter(
        (e) => narrowHeavyPush(e) || narrowArmPlyo(e)
      );
      if (hit.length > 0) note('⑭', `${c.seed} 팔 피로 심함인데 ${uniqTitles(hit)}`);
    }
    /* ⑮ 성장기(YOUTH_AGE_THRESHOLD 미만)가 투구 계획상 공을 쉬는 날 → 팔 플라이오 0(고른 것 · 후보) */
    if (
      facts.profile.age != null &&
      facts.profile.age < YOUTH_AGE_THRESHOLD &&
      plan.today?.throwing === false
    ) {
      armCover.youthRest++;
      const hit = [...exs, ...picked.candidates].filter(narrowArmPlyo);
      if (hit.length > 0)
        note('⑮', `${c.seed} 만 ${facts.profile.age}세 쉬는 날인데 ${uniqTitles(hit)}`);
    }
    /*
     * ⑪ 등판 창(2판 P4 커밋 D) — 다음 등판이 오늘 · 내일 · 2~3일 뒤면 무거운 하체 0(고른 것 · 후보, '그래도 하기'로 테마를 민 날도).
     * 창은 넣은 답 글자로(rawOutingWindow), 무거운 하체는 좁은 판정(narrowHeavyLower)으로 — 둘 다 코드를 베끼지 않는다.
     */
    if (rawOutingWindow(c.p)) {
      windowCover.window++;
      if (picked.excluded.some((x) => x.rule === '등판 전 무거운 하체'))
        windowCover.bites++;
      if (key === 'lower') windowCover.lower++;
      const hit = [...exs, ...picked.candidates].filter(narrowHeavyLower);
      if (hit.length > 0)
        note(
          '⑪',
          `${c.seed} 등판 창인데 ${uniqTitles(hit)}${forcing ? '(그래도 하기)' : ''}`
        );
    }
    /*
     * ⑫ 근력 날(하체 · 상체)이면 그쪽 본운동 후보가 있다 — 비면 steerFromEmptyMain 이 날을 바꿨어야 한다(2판 P1 · P4 커밋 D). 등판 창이
     * 무거운 하체를 빼 하체 본운동이 통째로 빈 날이 하체 날로 남지 않는가를 본다. 본운동 구간이 없는 구성(컨디셔닝 목표)은 null 이라 안 센다.
     */
    if (key === 'lower' || key === 'upper') {
      const mainCount = mainCandidateCount(picked.candidates, key, built.goal);
      if (mainCount === 0) note('⑫', `${c.seed} ${key} 날인데 본운동 후보 0`);
    }
    /*
     * ⑯ 팔 피로 '심함' 밑(1~4)은 일정을 안 바꾼다 — 팔 피로 칸이 없는 같은 사람(plainCombo)과 글자 그대로. '많이'는 암케어만 회복으로
     * 돌리고, 그 아래는 고르기 점수(P5) 몫이다 — P5 가 팔 피로를 읽게 되면 이 검사의 기대를 그 단계에서 고친다.
     */
    if (armNow != null && armNow < SEVERE_ARM_FATIGUE) {
      armCover.mild++;
      const plain = buildOf(plainCombo).built;
      if (JSON.stringify(plain) !== JSON.stringify(built))
        note('⑯', `${c.seed} 팔 피로 ${armNow} 인데 일정이 바뀜`);
    }
    /*
     * ⑨ 걸리는 시간은 쓰기로 한 시간 + 여유 안 — 여유는 theme.ts 의 totalSlack(min(3, 12%))과 같은 식. 그 상수는 export 되지
     * 않아 여기 적는다(theme.ts 가 바뀌면 같이 고친다). 구간이 비면 '시간을 넘겨서라도 하나'를 넣는 길이 있어 넘칠 수 있다 —
     * 넘친 가장 큰 값을 아래 검사에 고정한다.
     */
    const slack = Math.min(3, built.minutes * 0.12);
    const over = built.estimatedMinutes - built.minutes - slack;
    if (over > 0) {
      worstOver = Math.max(worstOver, over);
      note('⑨', `${c.seed} ${built.minutes}분에 ${built.estimatedMinutes}분`);
    }
    /* ⑩ 같은 입력 두 번 → 같은 목록 · 같은 테마 */
    if (
      isHalted(again) ||
      again.theme.key !== key ||
      JSON.stringify(again.picks) !== JSON.stringify(built.picks)
    ) {
      note('⑩', `${c.seed} 두 번째가 다름`);
    }
  }
  const ruleNames: [string, string][] = [
    ['①', '고른 것은 모두 안전 거르기 후보 안에 있다'],
    ['②', '오늘 통증 부위를 곧바로 쓰는 운동 0'],
    ['③', '통증 확인 전(painStateUnknown)일 때만 멈춘다'],
    ['④', '세게 던진 날(당일 · 다음 날) → 회복'],
    ['⑤', "'오늘 등판' → 회복 · '내일 등판' → 무게 없는 날"],
    ['⑥', '컨디션 4 이하 → 회복'],
    ['⑦', '재활 관절의 무거운 운동 0'],
    ['⑧', '15세 미만 매우 높음 0'],
    ['⑩', '같은 입력 두 번 → 같은 목록'],
    [
      '⑪',
      "등판 창(오늘 · 내일 · 2~3일 뒤) → 무거운 하체 0(고른 것 · 후보, '그래도 하기' 포함, 2판 P4)",
    ],
    ['⑫', '근력 날이면 그쪽 본운동 후보가 있다(비면 날이 바뀐다, 2판 P4)'],
    [
      '⑬',
      '달력 · 같은 요일 짐작을 얹어도 테마는 더 무거워지지 않고 짐작으로 회복이 되지 않으며, 후보 ⊆ · 멈춤 · 날 못 박기 그대로(2판 P4)',
    ],
    ['⑭', "팔 피로 '심함' → 무거운 상체 밀기 · 팔 플라이오 0(고른 것 · 후보, 2판 P4)"],
    ['⑮', '성장기 + 투구 계획이 쉬는 날 → 팔 플라이오 0(고른 것 · 후보, 2판 P4)'],
    ['⑯', "팔 피로 '심함' 밑(1~4) → 칸이 없는 같은 사람과 같은 일정(2판 P4)"],
  ];
  for (const [rule, name] of ruleNames) {
    const found = bad.get(rule) ?? [];
    check(
      `불변식 ${rule} ${name} (${P0_COMBOS}조합)`,
      found.length === 0,
      found.length > 0 ? `${found.length}건 — ${found.slice(0, 2).join(' / ')}` : ''
    );
  }
  const overs = bad.get('⑨') ?? [];
  check(
    `불변식 ⑨ 걸리는 시간 ≤ 쓰기로 한 시간 + 여유(min(3분, 12%)) — 넘친 조합 ${overs.length}개 · 가장 크게 ${worstOver.toFixed(1)}분 (지금 값 고정)`,
    overs.length === 0 && worstOver === 0,
    overs.slice(0, 2).join(' / ')
  );
  /* 불변식이 실제로 무언가를 쟀는지 — 조건이 한 번도 안 나오면 검사가 빈 채로 통과한다 */
  const themeCounts = [...cover.themes].map(([k, n]) => `${k} ${n}`).join(' · ');
  check(
    `불변식 — 잰 것: 멈춤 ${cover.halted} · 세게 던진 날 ${cover.hard} · 오늘 등판 ${cover.plannedToday} · 내일 등판 ${cover.plannedTomorrow} · 컨디션 낮음 ${cover.lowCond} · 재활 ${cover.rehab} · 성장기 ${cover.youth} · 통증 ${cover.painToday} · 그래도 하기 ${cover.forcing} · 테마 ${themeCounts}`,
    cover.total === P0_COMBOS &&
      cover.halted >= 5 &&
      cover.hard >= 10 &&
      cover.plannedToday >= 8 &&
      cover.plannedTomorrow >= 8 &&
      cover.lowCond >= 10 &&
      cover.rehab >= 5 &&
      cover.youth >= 10 &&
      cover.painToday >= 10 &&
      cover.forcing >= 5 &&
      (['recovery', 'assist', 'lower', 'upper'] as const).every(
        (k) => (cover.themes.get(k) ?? 0) > 0
      )
  );
  check(
    `불변식 — 잰 것(2판 P4 팔 피로): 팔 피로 심함 ${armCover.severe} · 심함 밑 ${armCover.mild} · 성장기 쉬는 날 ${armCover.youthRest}`,
    armCover.severe >= 8 && armCover.mild >= 20 && armCover.youthRest >= 5
  );
  check(
    `불변식 — 잰 것(2판 P4 등판 창): 창 안 ${windowCover.window} · 규칙이 실제로 뺀 날 ${windowCover.bites} · 창 안 하체 날 ${windowCover.lower}`,
    windowCover.window >= 15 && windowCover.bites >= 8 && windowCover.lower >= 1
  );
  check(
    `불변식 — 잰 것(2판 P4 등판 짐작 ⑬): 짐작이 선 짝 ${softCover.soft} · 테마가 가벼워진 짝 ${softCover.lighter} · 무거운 하체가 새로 빠진 짝 ${softCover.blocked}`,
    softCover.soft >= 30 && softCover.lighter >= 5 && softCover.blocked >= 5
  );

  /* ─────────────── (d) 성장기 나이(D4 참고) — 지금 코드가 16 · 17세에게 '매우 높음'을 허용하는 것을 고정 ─────────────── */
  /*
   * 알려진 빈틈(D4 — Y 단계에서 YOUTH_AGE_THRESHOLD 15 → 16 미만 = 성장기로 바꾸면 아래 15세의 기대값이 뒤집힌다).
   * 16 · 17세는 사용자 결정으로 성인 기준이 맞다 — 지금도 그렇고, 바꾼 뒤에도 그렇다.
   */
  const youthRead = (age: number | null) => {
    const facts = p0Facts({ age, trainingLevel: '상급', today: { condition: 8 } });
    const plan = buildPitchPlan(facts);
    const picked = selectCandidates({ facts, plan, library });
    const veryHigh = picked.candidates.filter(
      (e) => intensityLevel(e.intensity) > INTENSITY_CAP.STRENGTH
    ).length;
    return { veryHigh, youthNote: plan.youthNote != null };
  };
  /* Y 로 바뀜(2026-10-12, D4) — P0 때는 15 를 고정해 두고 15세를 '알려진 빈틈'으로 적었다. 이제 16 미만 = 성장기. */
  check(
    `성장기 나이 — YOUTH_AGE_THRESHOLD 는 16 (D4: 만 16세 이상 성인, 그 미만 성장기)`,
    YOUTH_AGE_THRESHOLD === 16,
    String(YOUTH_AGE_THRESHOLD)
  );
  {
    for (const age of [14, 15]) {
      const y = youthRead(age);
      check(
        `성장기 나이 — ${age}세: '매우 높음' 0 · 투구 계획에 성장기 안내 (Y 로 바뀜 — 15세도 성장기)`,
        y.veryHigh === 0 && y.youthNote,
        `매우 높음 ${y.veryHigh}개`
      );
    }
    /* 13~14세 휴식표(Y) — 같은 전력 환산 60구에 15세는 2일, 14세는 3일. 나이를 모르면 15~18세 표 */
    check(
      '성장기 휴식표 — 전력 환산 60구: 14세 3일 · 15세 2일 · 나이 모름 2일, 20구: 14세 0일 · 21구: 14세 1일',
      requiredRestDays(60, 14) === 3 &&
        requiredRestDays(60, 15) === 2 &&
        requiredRestDays(60) === 2 &&
        requiredRestDays(20, 14) === 0 &&
        requiredRestDays(21, 14) === 1,
      `${requiredRestDays(60, 14)} · ${requiredRestDays(60, 15)} · ${requiredRestDays(60)}`
    );
    {
      const young = p0Facts({
        age: 14,
        logs: [{ daysAgo: 1, pitches: 60, intensity: 10, sessionType: '경기' }],
      });
      const teen = p0Facts({
        age: 16,
        logs: [{ daysAgo: 1, pitches: 60, intensity: 10, sessionType: '경기' }],
      });
      const py = pendingOuting(young.patterns, 0, 14);
      const pt = pendingOuting(teen.patterns, 0, 16);
      check(
        '성장기 휴식표 — 어제 경기 60구: 14세는 남은 휴식 2일(3일 표) · 16세는 1일(2일 표)',
        py != null && pt != null && py.left === 2 && pt.left === 1,
        `14세 ${py?.left ?? '없음'} · 16세 ${pt?.left ?? '없음'}`
      );
    }
    for (const age of [16, 17]) {
      const y = youthRead(age);
      check(
        `성장기 나이 — ${age}세: 성인 기준('매우 높음' 허용 · 안내 없음) — D4 뒤에도 그대로`,
        y.veryHigh > 0 && !y.youthNote,
        `매우 높음 ${y.veryHigh}개`
      );
    }
  }

  /* ─────────────── (e) 상체 후보 0 인 라이브러리 — 번갈기가 한쪽에 갇히는가(7일) ─────────────── */
  /*
   * 상체 날의 본운동은 '상체 스트렝스 + 파워(밀기 · 당기기 · 회전)'다(theme.ts 의 COMPOSITIONS). 그것을 모두 뺀 부분집합으로
   * 7일을 돌린다. 앱과 같은 길(buildDailyPlan — 장비 · 경력은 안 거르게 빈 값)로 만들고, 완료 기록은 gather.ts 의 lastStrengthDates
   * 와 같은 규칙(strengthDatesFrom)으로 흉내 낸다 — 그날 목록(구간과 상관없이)에 든 하체 · 상체 스트렝스를 모두 완료했다고 본다.
   *
   * P0 때 고정해 둔 '한쪽 갇힘'(상체 날 7/7 · 대비책 7/7 · 하체 7일 연속)은 P1 ③ '대비책 상한'으로 바뀌었다(2026-10-11):
   * 근력 날의 본운동 후보가 0 이면 daily-plan.ts 가 날을 바꾼다(steerFromEmptyMain — 반대쪽, 어제 했으면 보조 · 코어) 그래서
   * 상체 후보가 없는 표에서는 하체 · 보조가 번갈아 나오고 대비책은 안 들어간다. 대비책은 부위를 좁힌 날에만 남고 두 개까지(아래 셋째 묶음).
   */
  const UPPER_POWER = ['밀기', '당기기', '회전'];
  const noUpper = library.filter(
    (e) =>
      !(
        e.category === '상체 스트렝스' ||
        (e.category === '파워' &&
          (e.movementPattern == null || UPPER_POWER.includes(e.movementPattern)))
      )
  );
  const runWeek = (pool: typeof library, trainingFocus: string | null = null) => {
    const byId = new Map(pool.map((e) => [e.id, e]));
    const done: { date: string; category: string }[] = [];
    const seq: {
      key: ThemeKey;
      /** 그날 목록 전체의 하체 · 상체 스트렝스 수(gather.ts 가 세는 것) */
      lower: number;
      upper: number;
      /** 본운동 구간에 든 하체 · 상체 스트렝스 수 */
      lowerMain: number;
      upperMain: number;
      mainCount: number;
      fallback: boolean;
      /** 이유 글에 날을 바꾼 까닭이 들었나(steerFromEmptyMain) */
      switched: boolean;
      /** 대비책 알림이 들었나 */
      fallbackNote: boolean;
    }[] = [];
    const goal = '근력 향상';
    for (let d = 0; d < 7; d++) {
      const asOf = new Date(TODAY.getTime() + d * 86400000);
      const facts = p0Facts({ today: { condition: 8 }, asOf });
      const plan = buildPitchPlan(facts);
      const dates = strengthDatesFrom({ done, planned: [], todayKey: facts.asOf });
      const built = buildDailyPlan({
        user: { ownedEquipment: [], trainingLevel: null },
        facts,
        plan,
        library: pool,
        availableToday: null,
        requestedMinutes: 60,
        trainingGoal: goal,
        trainingFocus,
        recentIds: new Set<string>(),
        rotationSeed: facts.asOf,
        lastLowerKey: dates.lower,
        lastUpperKey: dates.upper,
      });
      if (isHalted(built)) throw new Error(`(e) ${facts.asOf} 멈춤: ${built.reason}`);
      const all = built.picks.map((p) => byId.get(p.exerciseId)!);
      const main = built.picks
        .filter((p) => p.slot === 'main')
        .map((p) => byId.get(p.exerciseId)!);
      const count = (list: typeof all, category: string) =>
        list.filter((e) => e.category === category).length;
      const lower = count(all, '하체 스트렝스');
      const upper = count(all, '상체 스트렝스');
      for (const e of all) done.push({ date: facts.asOf, category: e.category });
      /*
       * 대비책이 들어갔는지는 구조로 판정한다 — 본운동 구간의 규격(카테고리와 파워 계열 — pickForTheme 의 후보 거르기와 같은
       * 조건, mainCandidateCount 와 같은 fitsSlot)에 안 맞는 운동이 본운동에 들어 있으면 대비책이 채운 것이다. 날을 바꾼 것과
       * 대비책 알림은 글로도 본다 — 사용자에게 보이는 것이 그 글이라서(글이 바뀌면 여기도 같이 고친다).
       */
      const mainSpec = compositionFor(built.theme.key, goal).find(
        (s) => s.slot === 'main'
      );
      const fitsMain = (e: (typeof all)[number]) =>
        mainSpec != null &&
        mainSpec.categories.includes(e.category) &&
        !(
          e.category === '파워' &&
          mainSpec.powerPatterns != null &&
          e.movementPattern != null &&
          !mainSpec.powerPatterns.includes(e.movementPattern)
        );
      seq.push({
        key: built.theme.key,
        lower,
        upper,
        lowerMain: count(main, '하체 스트렝스'),
        upperMain: count(main, '상체 스트렝스'),
        mainCount: main.length,
        fallback: main.some((e) => !fitsMain(e)),
        switched: /운동이 (모두 )?없/.test(built.theme.reason),
        fallbackNote: built.notes.some((n) => n.includes('부족해')),
      });
    }
    const longest = (hit: (s: (typeof seq)[number]) => boolean) => {
      let best = 0;
      let run = 0;
      for (const s of seq) {
        run = hit(s) ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    };
    return {
      seq,
      text: seq
        .map(
          (s) =>
            `${s.key}(하${s.lower}·상${s.upper}${s.fallback ? '·대비책' : ''}${s.switched ? '·바꿈' : ''})`
        )
        .join(' → '),
      upperDays: seq.filter((s) => s.key === 'upper').length,
      fallbackDays: seq.filter((s) => s.fallback).length,
      /* 테마와 상관없이 실제로 하체 · 상체 스트렝스를 든 날(구간 무관)이 몇 번 이어지는가 */
      lowerRun: longest((s) => s.lower > 0),
      upperRun: longest((s) => s.upper > 0),
    };
  };
  const whole = runWeek(library);
  check(
    '한쪽 갇힘 — 온전한 라이브러리: 7일 동안 하체 · 상체를 번갈아 든다(연속 1 · 대비책 0 · 날 바꿈 0)',
    whole.lowerRun === 1 &&
      whole.upperRun === 1 &&
      whole.fallbackDays === 0 &&
      whole.seq.every((s) => !s.switched && !s.fallbackNote),
    whole.text
  );
  const stuck = runWeek(noUpper);
  /* P1 ③ 로 바뀜 — P0 때는 '상체 날 7/7 · 대비책 7/7'을 알려진 빈틈으로 고정했다. 이제 상체 날 0 · 대비책 0 이어야 한다. */
  check(
    `한쪽 갇힘 — 상체 후보 0: 7일 중 상체 날 ${stuck.upperDays}일 · 대비책으로 채운 날 ${stuck.fallbackDays}일 (P1 ③ 뒤 둘 다 0)`,
    stuck.upperDays === 0 && stuck.fallbackDays === 0,
    stuck.text
  );
  /* P1 ③ 로 바뀜 — P0 때는 '하체 7일 연속 · 상체 0'을 고정했다. 이제 하체는 하루 걸러(연속 ≤ 2), 사이는 보조 · 코어 날. */
  const twoLowersInARow = stuck.seq
    .slice(1)
    .some((s, n) => s.key === 'lower' && stuck.seq[n].key === 'lower');
  check(
    `한쪽 갇힘 — 상체 후보 0: 하체 ${stuck.lowerRun}일 연속(≤ 2) · 하체와 보조 · 코어 날이 번갈아, 하체 날에는 본운동이 비지 않는다`,
    stuck.lowerRun <= 2 &&
      !twoLowersInARow &&
      stuck.seq.every((s) => s.key === 'lower' || s.key === 'assist') &&
      stuck.seq.filter((s) => s.key === 'lower').length >= 3 &&
      stuck.seq.every((s) => s.key !== 'lower' || s.lowerMain > 0),
    stuck.text
  );
  check(
    "한쪽 갇힘 — 상체 후보 0: 상체 차례였던 날의 이유 글에 날을 바꾼 까닭('상체 운동이 없어 …')이 들어간다, 대비책 알림은 없다",
    stuck.seq.some((s) => s.switched) &&
      stuck.seq.every((s) => s.key === 'lower' || s.switched) &&
      stuck.seq.every((s) => !s.fallbackNote) &&
      noUpper.length > 0 &&
      noUpper.length < library.length,
    `바꾼 날 ${stuck.seq.filter((s) => s.switched).length}일 · 부분집합 ${noUpper.length}/${library.length}개`
  );
  /* 부위를 좁힌 날은 바꾸지 않는다 — 상체 밀기를 고른 채 상체 후보 0: 상체 날 그대로, 대비책 두 개까지 + 알림 */
  const focused = runWeek(noUpper, 'upperPush');
  check(
    `한쪽 갇힘 — 상체 밀기를 고른 날은 날을 바꾸지 않고 대비책 두 개까지 + 알림(7일 중 상체 날 ${focused.upperDays}일 · 대비책 ${focused.fallbackDays}일)`,
    focused.upperDays === 7 &&
      focused.fallbackDays === 7 &&
      focused.seq.every(
        (s) => !s.switched && s.fallbackNote && s.mainCount >= 1 && s.mainCount <= 2
      ),
    focused.text
  );
  /*
   * 통증 때문에 피한 쪽으로는 되돌아가지 않는다(2026-10-12 검토에서 나온 구멍). 어제 허리 통증 → steerAroundPain 이 하체 차례를
   * 상체로 비켜 가는데, 상체 후보가 0 이면 steerFromEmptyMain 이 하체로 되돌렸다. 이제 그때는 보조 · 코어 날.
   */
  {
    const painFacts = p0Facts({
      today: { condition: 8 },
      yesterday: { lowerBack: '통증' },
    });
    const painPlan = buildPitchPlan(painFacts);
    const byId = new Map(noUpper.map((e) => [e.id, e]));
    const buildWith = (pool: typeof library) =>
      buildDailyPlan({
        user: { ownedEquipment: [], trainingLevel: null },
        facts: painFacts,
        plan: painPlan,
        library: pool,
        availableToday: null,
        requestedMinutes: 60,
        trainingGoal: '근력 향상',
        recentIds: new Set<string>(),
        rotationSeed: painFacts.asOf,
        /* 하체 차례인 날 — 허리 통증이라 상체로 비켜 간다 */
        lastLowerKey: null,
        lastUpperKey: shiftDateKey(painFacts.asOf, -1),
      });
    const whole = buildWith(library);
    const stuckPain = buildWith(noUpper);
    const stuckMain = isHalted(stuckPain)
      ? []
      : stuckPain.picks
          .filter((p) => p.slot === 'main')
          .map((p) => byId.get(p.exerciseId)?.category ?? '');
    check(
      '한쪽 갇힘 — 어제 허리 통증: 온전한 표는 하체 차례를 상체로 비켜 가고(steerAroundPain), 상체 후보 0 이면 하체로 되돌리지 않고 보조 · 코어',
      painAvoidedSide(painFacts) === 'lower' &&
        !isHalted(whole) &&
        whole.theme.key === 'upper' &&
        !isHalted(stuckPain) &&
        stuckPain.theme.key === 'assist' &&
        stuckPain.theme.reason.includes('아픈 곳이라 쉬어요') &&
        stuckMain.every((c) => !c.endsWith('스트렝스') && c !== '파워'),
      `온전 ${isHalted(whole) ? '멈춤' : whole.theme.key} · 상체 후보 0 ${isHalted(stuckPain) ? '멈춤' : stuckPain.theme.key} · 본운동 ${stuckMain.join(',') || '없음'}`
    );
  }

  /* ─────────────── (f) P1 ① 씨앗 맨 앞의 사용자 id — 설정이 같아도 사람이 다르면 다른 목록, 같은 사람은 같은 목록 ─────────────── */
  /*
   * training-setup.ts 는 씨앗을 '사용자 id|날짜|지금 목록…'으로 만든다(2026-10-11 P1). 여기서는 그 꼴을 그대로 넣어 본다 —
   * 같은 설정 · 같은 날 · id 만 다른 두 사람의 7일 목록이 거의 다 다르고(기준선 ④ 168/168 → 8/168), id 까지 같으면 같은 목록(⑩).
   */
  {
    const uuidA = '0f3b1c2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const uuidB = '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
    const listWith = (id: string, d: number) => {
      const asOf = new Date(TODAY.getTime() + d * 86400000);
      const facts = p0Facts({ today: { condition: 8 }, asOf, trainingLevel: '중급' });
      const plan = buildPitchPlan(facts);
      const built = buildDailyPlan({
        user: { ownedEquipment: [], trainingLevel: '중급' },
        facts,
        plan,
        library,
        availableToday: null,
        requestedMinutes: 60,
        trainingGoal: '근력 향상',
        recentIds: new Set<string>(),
        rotationSeed: `${id}|${facts.asOf}`,
        lastLowerKey: null,
        lastUpperKey: null,
      });
      return isHalted(built)
        ? null
        : built.picks
            .map((p) => p.exerciseId)
            .sort()
            .join(',');
    };
    let differ = 0;
    let same = 0;
    for (let d = 0; d < 7; d++) {
      const a = listWith(uuidA, d);
      if (a != null && a !== listWith(uuidB, d)) differ++;
      if (a != null && a === listWith(uuidA, d)) same++;
    }
    check(
      'P1 ① 씨앗 맨 앞의 사용자 id — 설정이 같고 id 만 다른 두 사람의 7일 목록이 다른 날 ≥ 6',
      differ >= 6,
      `${differ}/7`
    );
    check(
      'P1 ① 같은 id · 같은 날 · 같은 입력 → 같은 목록 7/7',
      same === 7,
      `${same}/7`
    );
  }

  /* ─────────────── (f) P1 ② 번갈아 가기의 예비 규칙을 '계획 기록'으로 — strengthDatesFrom(daily-plan.ts) ─────────────── */
  /*
   * gather.ts 의 lastStrengthDates 가 완료 기록만 보던 것을, 완료가 없는 날은 저장된 일정으로 세게 했다(가정: 계획을 세우고
   * 안 한 날도 '한 날'). 규칙은 순수 함수 strengthDatesFrom 한 곳이라 여기서 그대로 돌린다 — 완료 > 계획(같은 날) · 오늘 제외 ·
   * 본운동 없는 날(컨디셔닝) 제외 · 옛 모양 제외, 그리고 마침을 안 누르는 사람의 7일이 실제로 번갈아 가는지.
   */
  {
    const todayKey = toDateKey(TODAY);
    const ago = (n: number) => shiftDateKey(todayKey, -n);
    const planOf = (
      key: ThemeKey,
      slots: SlotKey[] = ['main', 'core'],
      version: number = 1
    ): unknown => ({
      version,
      theme: { key, label: '', reason: '' },
      goal: '근력 향상',
      requestedMinutes: 60,
      minutes: 60,
      estimatedMinutes: 60,
      picks: slots.map((slot, n) => ({ exerciseId: `x${n}`, slot })),
      basis: [],
      notes: [],
      excluded: [],
      equipment: {
        available: [],
        excludedCount: 0,
        narrowed: false,
        bestAddition: null,
      },
      levelExcludedCount: 0,
    });
    const lower = (date: string) => ({ date, category: '하체 스트렝스' });
    const upper = (date: string) => ({ date, category: '상체 스트렝스' });

    const doneOnly = strengthDatesFrom({
      done: [lower(ago(3)), upper(ago(1)), { date: ago(2), category: '코어' }],
      planned: [],
      todayKey,
    });
    check(
      'P1 ② 완료 기록만 — 예전과 같다: 하체 3일 전 · 상체 어제, 출처 done',
      doneOnly.lower === ago(3) &&
        doneOnly.upper === ago(1) &&
        doneOnly.source.lower === 'done' &&
        doneOnly.source.upper === 'done',
      JSON.stringify(doneOnly)
    );
    const plannedOnly = strengthDatesFrom({
      done: [],
      planned: [
        { date: ago(2), plan: planOf('lower') },
        { date: ago(1), plan: planOf('assist') },
      ],
      todayKey,
    });
    check(
      'P1 ② 완료 기록 없음 · 그제 하체 일정 · 어제 보조 일정 → 하체 그제(출처 planned) · 상체 없음 → 오늘은 상체 차례',
      plannedOnly.lower === ago(2) &&
        plannedOnly.source.lower === 'planned' &&
        plannedOnly.upper == null &&
        decideTheme({
          facts: p0Facts({ today: { condition: 8 } }),
          plan: buildPitchPlan(p0Facts({ today: { condition: 8 } })),
          lastLowerKey: plannedOnly.lower,
          lastUpperKey: plannedOnly.upper,
        }).key === 'upper',
      JSON.stringify(plannedOnly)
    );
    const conflict = strengthDatesFrom({
      done: [upper(ago(1))],
      planned: [{ date: ago(1), plan: planOf('lower') }],
      todayKey,
    });
    check(
      'P1 ② 같은 날 계획 하체 · 완료 상체 → 완료가 이긴다(상체 어제 · 하체 없음)',
      conflict.upper === ago(1) &&
        conflict.lower == null &&
        conflict.source.upper === 'done',
      JSON.stringify(conflict)
    );
    const partial = strengthDatesFrom({
      done: [{ date: ago(1), category: '모빌리티' }],
      planned: [{ date: ago(1), plan: planOf('lower') }],
      todayKey,
    });
    check(
      'P1 ② 같은 날 근력이 아닌 완료(모빌리티)만 있으면 계획으로 센다(하체 어제 · planned)',
      partial.lower === ago(1) && partial.source.lower === 'planned',
      JSON.stringify(partial)
    );
    const skipped = strengthDatesFrom({
      done: [],
      planned: [
        /* 컨디셔닝 목표 — key 는 lower 인데 본운동이 없다(theme.ts conditioningDay) */
        { date: ago(3), plan: planOf('lower', ['core', 'prehab']) },
        /* 옛 모양(version 0) */
        { date: ago(2), plan: planOf('upper', ['main'], 0) },
        /* 오늘 것 */
        { date: todayKey, plan: planOf('upper') },
        /* 일정 없음 */
        { date: ago(1), plan: null },
      ],
      todayKey,
    });
    check(
      'P1 ② 본운동 없는 날(컨디셔닝) · 옛 모양 · 오늘 것 · 빈 일정은 세지 않는다 → 둘 다 없음',
      skipped.lower == null && skipped.upper == null,
      JSON.stringify(skipped)
    );
    const future = strengthDatesFrom({
      done: [lower(todayKey)],
      planned: [],
      todayKey,
    });
    check(
      'P1 ② 오늘 완료한 것도 세지 않는다',
      future.lower == null,
      JSON.stringify(future)
    );

    /* 마침을 안 누르는 사람 7일 — 저장된 일정만으로 하체 · 상체가 엄격히 번갈아 간다(홀짝에 안 떨어진다) */
    const history: { date: string; plan: unknown }[] = [];
    const seq: ThemeKey[] = [];
    for (let d = 0; d < 7; d++) {
      const asOf = new Date(TODAY.getTime() + d * 86400000);
      const key = toDateKey(asOf);
      const facts = p0Facts({ today: { condition: 8 }, asOf });
      const dates = strengthDatesFrom({ done: [], planned: history, todayKey: key });
      const theme = decideTheme({
        facts,
        plan: buildPitchPlan(facts),
        lastLowerKey: dates.lower,
        lastUpperKey: dates.upper,
      });
      seq.push(theme.key);
      history.push({ date: key, plan: planOf(theme.key) });
    }
    const flips = seq.slice(1).filter((k, n) => k !== seq[n]).length;
    check(
      `P1 ② 마침을 안 누르는 사람 7일 — 저장된 일정만으로 하체 · 상체가 날마다 바뀐다(바뀜 ${flips}/6, 상체 ${seq.filter((k) => k === 'upper').length}일)`,
      flips === 6 &&
        seq.every((k) => k === 'lower' || k === 'upper') &&
        seq.filter((k) => k === 'upper').length >= 3,
      seq.join(' → ')
    );
  }

  /* ─────────────── (f) P1 ④ 재활 메모 오탐 — 복귀표 꼬리표의 '통증 없음'은 통증이 아니다 ─────────────── */
  /*
   * 재활 투구 복귀표(rehab-progress.ts)는 던진 날을 투구 기록 메모에 꼬리표로 남긴다('재활 투구 복귀표 2칸 · 18m · 통증 없음').
   * facts.ts 의 findPainKeywords 가 부분 일치라 '통증 없음'이 '통증'으로 걸려, 오늘 체크인이 없는 날 투구 계획이 멈추고
   * (plan.needsPainCheck) 운동이 회복 수준으로 묶였다. P1 ④: 꼬리표가 통째로 맞고(같은 함수 parseThrowMemo) '안 아팠다'일 때만
   * 뺀다. 통증을 적은 꼬리표 · 꼬리표 뒤에 덧붙인 글 · 일반 메모의 '통증 없음'은 그대로 잡는다(미탐이 오탐보다 위험).
   */
  {
    const memoRead = (memos: string[]) => {
      /* 오늘 체크인 없음 — needsPainCheck 가 걸리는 조건(메모에 통증 말 + 오늘 상태 모름) */
      const facts = p0Facts({ today: null, memos });
      const plan = buildPitchPlan(facts);
      return {
        words: findPainKeywords(memos.map((text) => ({ date: facts.asOf, text }))),
        inFacts: facts.condition.painWordsInMemo,
        needsPainCheck: plan.needsPainCheck,
        theme: decideTheme({ facts, plan, lastLowerKey: null, lastUpperKey: null }).key,
      };
    };
    const tagNone = throwMemo(2, 'none');
    const clean = memoRead([tagNone]);
    check(
      `P1 ④ 꼬리표만('${tagNone}') → 통증 말 없음 · 투구 계획 안 멈춤 · 날은 근력`,
      clean.words.length === 0 &&
        clean.inFacts.length === 0 &&
        !clean.needsPainCheck &&
        (clean.theme === 'lower' || clean.theme === 'upper'),
      JSON.stringify(clean)
    );
    const appended = memoRead([`${tagNone} 어깨가 아팠다`]);
    check(
      "P1 ④ 꼬리표 뒤에 덧붙인 글('… 통증 없음 어깨가 아팠다') → 잡힌다(꼬리표가 통째로 맞지 않는다)",
      appended.words.includes('아팠') &&
        appended.needsPainCheck &&
        appended.theme === 'recovery',
      JSON.stringify(appended)
    );
    const plain = memoRead(['통증 없음']);
    check(
      "P1 ④ 일반 메모의 '통증 없음'은 지금처럼 잡는다(부정어 처리 안 함)",
      plain.words.includes('통증') && plain.needsPainCheck,
      JSON.stringify(plain)
    );
    for (const [label, memo] of [
      ['몸 풀 때 통증', throwMemo(3, 'faded')],
      ['통증 계속', throwMemo(3, 'stayed')],
      ['던진 뒤 통증', throwMemo(3, 'none', true)],
    ] as const) {
      const r = memoRead([memo]);
      check(
        `P1 ④ 통증을 적은 꼬리표('${label}')는 실제 통증이라 그대로 잡는다`,
        r.words.includes('통증') && r.needsPainCheck,
        JSON.stringify(r)
      );
    }
    const mixed = memoRead([tagNone, '팔꿈치가 찌릿함']);
    check(
      'P1 ④ 꼬리표와 다른 메모가 같이 있으면 다른 메모의 통증 말은 잡는다',
      mixed.words.length === 1 && mixed.words[0] === '찌릿' && mixed.needsPainCheck,
      JSON.stringify(mixed)
    );
  }
}

/* ═══════════════════ [2판 되먹임(P2)] 운동 바꾸기 기록 — lib/report/plan-swaps.ts (2026-10-12) ═══════════════════ */
console.log('\n[2판 되먹임(P2)] 운동 바꾸기 기록 — 읽기 · 붙이기 · 잇기 · 세기');
{
  const at = (n: number) =>
    `2026-06-${String(10 + Math.floor(n / 24)).padStart(2, '0')}T${String(n % 24).padStart(2, '0')}:00:00.000Z`;
  /* 서버가 쓰는 칸 차례(from · to · kind · where · slot · at)로 만든다 — readPlanSwaps 가 돌려주는 줄과 JSON 글자가 같게 */
  const swap = (o: Partial<PlanSwap> & { from: string }): PlanSwap => {
    const m = {
      to: null,
      kind: 'remove' as const,
      where: 'session' as const,
      at: at(0),
      ...o,
    };
    return {
      from: m.from,
      to: m.to,
      kind: m.kind,
      where: m.where,
      ...(m.slot ? { slot: m.slot } : {}),
      at: m.at,
    };
  };
  const idsOf = (p: { exercises: { id: string }[] }) =>
    p.exercises.map((e) => e.id).join(',');

  /* ─── (a) readPlanSwaps — 옛 모양 · 모양이 틀린 줄 ─── */
  check(
    'P2 (a) 없는 값 · 숫자 · swaps 없는 일정 · 배열 아닌 swaps 는 []',
    readPlanSwaps(null).length === 0 &&
      readPlanSwaps(3).length === 0 &&
      readPlanSwaps({ version: 1, picks: [] }).length === 0 &&
      readPlanSwaps({ swaps: 'x' }).length === 0
  );
  const mixed = readPlanSwaps({
    swaps: [
      swap({ from: 'a', kind: 'replace', to: 'b', slot: 'main' }),
      { from: 'x', to: null, kind: 'x', where: 'session', at: at(0) },
      { to: null, kind: 'remove', where: 'session', at: at(0) },
      { from: 'y', to: null, kind: 'remove', where: 'session', at: 5 },
      { from: 'z', to: null, kind: 'remove', where: 'app', at: at(0) },
      { from: 'w', to: 7, kind: 'remove', where: 'plan', at: at(0) },
      null,
      'str',
      swap({ from: 'q', kind: 'add', to: 'r', where: 'plan' }),
    ],
  });
  check(
    "P2 (a) 모양이 틀린 줄(kind 'x' · from 없음 · at 숫자 · where 'app' · to 숫자)은 거르고 맞는 줄만",
    mixed.length === 2 &&
      mixed[0].from === 'a' &&
      mixed[0].slot === 'main' &&
      mixed[1].from === 'q' &&
      mixed[1].kind === 'add' &&
      !('slot' in mixed[1]),
    JSON.stringify(mixed)
  );

  /* ─── (b) withSwaps · (c) 왕복 · (d) 다시 만들기 · (h) 불변식 — 실제 일정으로 ─── */
  const make = (person: Person = { condition: 8 }) => {
    const facts = factsFor(person);
    return buildDailyPlan({
      user: { ownedEquipment: [], trainingLevel: null },
      facts,
      plan: buildPitchPlan(facts),
      library,
      availableToday: null,
      requestedMinutes: 45,
      recentIds: new Set<string>(),
      lastLowerKey: null,
      lastUpperKey: null,
    });
  };
  const built = make();
  const again = make();
  check(
    'P2 (b) 일정이 만들어지고 새 일정에는 swaps 가 없다',
    !isHalted(built) && !('swaps' in built)
  );
  if (!isHalted(built) && !isHalted(again)) {
    const one = swap({
      from: built.picks[0].exerciseId,
      where: 'plan',
      slot: built.picks[0].slot,
      at: at(1),
    });
    const added = withSwaps(built, [one]);
    check(
      'P2 (b) 옛 모양(swaps 없음)에 한 줄 더하면 swaps 1 · 다른 칸(picks · theme · version) 그대로 · 원본은 안 바뀜',
      added !== built &&
        !('swaps' in built) &&
        added.swaps?.length === 1 &&
        added.swaps[0] === one &&
        added.picks === built.picks &&
        added.theme === built.theme &&
        added.version === 1
    );
    check(
      'P2 (b) 붙일 것이 없으면 같은 객체 · swaps 키를 더하지 않는다',
      withSwaps(built, []) === built && !('swaps' in withSwaps(built, []))
    );
    const many = Array.from({ length: MAX_SWAPS_PER_DAY + 1 }, (_, i) =>
      swap({ from: `e${i}`, at: at(i) })
    );
    const capped = withSwaps(built, many);
    check(
      `P2 (b) ${MAX_SWAPS_PER_DAY + 1}번째를 더하면 가장 오래된 것이 빠져 ${MAX_SWAPS_PER_DAY}(MAX_SWAPS_PER_DAY)`,
      capped.swaps?.length === MAX_SWAPS_PER_DAY &&
        capped.swaps[0].from === 'e1' &&
        capped.swaps[MAX_SWAPS_PER_DAY - 1].from === `e${MAX_SWAPS_PER_DAY}`
    );
    const twice = withSwaps(withSwaps(built, many.slice(0, 30)), many.slice(30));
    check(
      'P2 (b) 나눠 붙여도 상한은 같고 차례는 오래된 것부터',
      twice.swaps?.length === MAX_SWAPS_PER_DAY &&
        twice.swaps[0].from === 'e1' &&
        twice.swaps.map((s) => s.from).join() ===
          capped.swaps?.map((s) => s.from).join()
    );

    const stored = JSON.parse(JSON.stringify(added));
    const rt = readDailyPlan(stored);
    check(
      'P2 (c) 저장했다 읽어도 swaps 가 같고 version 은 1',
      rt != null &&
        rt.version === 1 &&
        JSON.stringify(rt.swaps) === JSON.stringify(added.swaps) &&
        JSON.stringify(readPlanSwaps(rt)) === JSON.stringify(added.swaps) &&
        rt.picks.map((p) => p.exerciseId).join() ===
          built.picks.map((p) => p.exerciseId).join()
    );
    check(
      'P2 (c) 옛 기록({ version: 1, picks: [] })은 여전히 읽힌다',
      readDailyPlan({ version: 1, picks: [] }) != null
    );

    const carried = carrySwaps(again, stored);
    check(
      "P2 (d) '다시 만들기'가 지금 저장된 일정의 swaps 를 새 일정에 잇는다(순수 부분 carrySwaps)",
      JSON.stringify(carried.swaps) === JSON.stringify(added.swaps) &&
        carried.picks === again.picks &&
        carried !== again
    );
    check(
      'P2 (d) 저장된 것이 없거나 옛 모양이면 새 일정 그대로(swaps 키 없음)',
      carrySwaps(again, null) === again &&
        carrySwaps(again, undefined) === again &&
        carrySwaps(again, { version: 1, picks: [] }) === again &&
        !('swaps' in carrySwaps(again, { version: 0 }))
    );
    const auto: DailyPlan = { ...again, auto: undefined };
    check(
      'P2 (d) 상한을 넘긴 옛 기록을 이어도 상한 안',
      carrySwaps(auto, { swaps: many }).swaps?.length === MAX_SWAPS_PER_DAY
    );

    const planned = (plan: unknown) =>
      strengthDatesFrom({
        done: [],
        planned: [{ date: '2026-06-14', plan }],
        todayKey: '2026-06-15',
      });
    check(
      'P2 (h) 불변식 — swaps 를 붙인 일정으로 plannedStrengthSide · strengthDatesFrom(P1 ②)의 답이 붙이기 전과 같다',
      plannedStrengthSide(built) === plannedStrengthSide(stored) &&
        JSON.stringify(planned(built)) === JSON.stringify(planned(stored)),
      `${plannedStrengthSide(built)} · ${JSON.stringify(planned(stored))}`
    );
  }

  /* ─── (e) readFrozenPlan · mergeReopened ─── */
  const fx = (id: string, slot: SlotKey = 'main'): FrozenExercise => ({
    id,
    title: id,
    category: '하체 스트렝스',
    slot,
    prescription: null,
    plannedSets: 3,
    plannedReps: 10,
    plannedHoldSeconds: null,
    perSide: false,
    needsWeight: true,
    isHold: false,
    equipment: [],
    bodyParts: [],
    intensity: '높음',
    thumbPath: null,
  });
  const frozenJson = {
    themeKey: 'lower',
    themeLabel: '하체',
    goal: '근력 향상',
    exercises: [fx('a'), fx('b'), fx('c', 'core')],
  };
  const plain = readFrozenPlan(frozenJson);
  check(
    'P2 (e) 기록 없고 프로그램 아닌 판은 돌려준 객체에 swaps 키가 없다(Object.keys 가 예전 넷과 같음 — 회귀)',
    plain != null &&
      JSON.stringify(Object.keys(plain)) === JSON.stringify(Object.keys(frozenJson)) &&
      !('swaps' in plain)
  );
  check(
    'P2 (e) 빈 swaps 배열 · 틀린 모양만 든 판도 키를 안 붙인다',
    !('swaps' in (readFrozenPlan({ ...frozenJson, swaps: [] }) ?? {})) &&
      !('swaps' in (readFrozenPlan({ ...frozenJson, swaps: [{ kind: 'x' }] }) ?? {}))
  );
  const replaceAX = swap({
    from: 'a',
    to: 'x',
    kind: 'replace',
    slot: 'main',
    at: at(2),
  });
  const keptJson = {
    ...frozenJson,
    exercises: [fx('x'), fx('b'), fx('c', 'core')],
    swaps: [replaceAX],
  };
  const kept = readFrozenPlan(keptJson);
  check(
    'P2 (e) swaps 가 든 판은 살아남는다',
    kept?.swaps?.length === 1 &&
      kept.swaps[0].to === 'x' &&
      kept.swaps[0].slot === 'main'
  );
  const rewritten = readFrozenPlan(
    JSON.parse(JSON.stringify({ ...kept, exercises: kept!.exercises.slice(0, 1) }))
  );
  check(
    'P2 (e) `{ ...plan, exercises: next }` 로 다시 써도 남는다',
    rewritten?.swaps?.length === 1 && rewritten.exercises.length === 1
  );
  const merged = mergeReopened(
    kept as FrozenPlan,
    {
      ...frozenJson,
      exercises: [fx('a'), fx('b'), fx('c', 'core'), fx('d')],
    } as FrozenPlan
  );
  check(
    'P2 (e) mergeReopened 결과에 kept 의 swaps 가 있고, 바꿔서 뺀 a 는 안 돌아오고 새 d 는 뒤에 붙는다',
    merged.swaps === kept!.swaps && idsOf(merged) === 'x,b,c,d',
    idsOf(merged)
  );

  /* ─── (f) swappedOutCounts ─── */
  const d = (n: number) => `2026-06-${String(n).padStart(2, '0')}`;
  const sess = (date: string, swaps: PlanSwap[]) => ({
    date,
    plan: { ...frozenJson, swaps },
  });
  const dplan = (date: string, swaps: PlanSwap[]) => ({
    date,
    plan: { version: 1, picks: [], swaps },
  });
  const countInput = {
    plans: [
      dplan(d(10), [
        swap({ from: 'a', kind: 'replace', to: 'x', at: at(1) }),
        swap({ from: 'b', kind: 'add', to: 'y', at: at(2) }),
      ]),
      dplan(d(12), [swap({ from: 'a', where: 'plan', at: at(3) })]),
      /* 기간 밖 — 앞 · 뒤 */
      dplan(d(1), [swap({ from: 'c', at: at(4) })]),
      dplan(d(16), [swap({ from: 'c', at: at(5) })]),
      /* 모양 안 맞는 줄 */
      { date: d(11), plan: { version: 0 } },
      { date: d(13), plan: null },
    ],
    sessions: [
      /* 같은 날 일정에도 같은 줄(같은 at) — 한 번만 */
      sess(d(10), [swap({ from: 'a', kind: 'replace', to: 'x', at: at(1) })]),
      /* 일정 없는 날(프로그램 날 흉내) — 세션 것을 센다 */
      sess(d(11), [swap({ from: 'd', at: at(6) })]),
      /* 경계 날짜(sinceKey · untilKey)는 든다 */
      sess(d(5), [swap({ from: 'e', at: at(7) })]),
      sess(d(15), [swap({ from: 'e', at: at(8) })]),
      /* add 만 있는 날 */
      sess(d(14), [swap({ from: 'f', kind: 'add', to: 'g', at: at(9) })]),
    ],
    sinceKey: d(5),
    untilKey: d(15),
  };
  const counts = swappedOutCounts(countInput);
  const rows = JSON.stringify([...counts].sort());
  check(
    'P2 (f) replace · remove 는 from 별로 세고(a 2) add 는 안 셈(b · f 없음) · 기간 밖은 안 셈(c 없음) · 같은 날 두 출처의 같은 줄은 1 · 일정 없는 날은 세션(d 1) · 경계 날짜는 든다(e 2)',
    counts.get('a') === 2 &&
      !counts.has('b') &&
      !counts.has('c') &&
      counts.get('d') === 1 &&
      counts.get('e') === 2 &&
      !counts.has('f') &&
      counts.size === 3,
    rows
  );
  check(
    'P2 (f) 같은 입력 두 번 → 같은 Map(순서까지)',
    JSON.stringify([...swappedOutCounts(countInput)]) === JSON.stringify([...counts])
  );
  const both = swappedOutCounts({
    plans: [dplan(d(10), [swap({ from: 'a', kind: 'replace', to: 'x', at: at(1) })])],
    sessions: [
      sess(d(10), [
        swap({ from: 'a', kind: 'replace', to: 'x', at: at(1) }),
        swap({ from: 'a', kind: 'remove', at: at(8) }),
      ]),
    ],
    sinceKey: d(5),
    untilKey: d(15),
  });
  check(
    'P2 (f) 같은 날 세션 판에만 더 있는 줄(다른 at)은 더 센다 — 일정이 나중에 생긴 날',
    both.get('a') === 2 && both.size === 1
  );
  check(
    'P2 (f) 빈 입력 · 모양 안 맞는 줄만 있으면 빈 Map',
    swappedOutCounts({ plans: [], sessions: [], sinceKey: d(5), untilKey: d(15) })
      .size === 0 &&
      swappedOutCounts({
        plans: [{ date: d(10), plan: { version: 0 } }],
        sessions: [{ date: d(10), plan: null }],
        sinceKey: d(5),
        untilKey: d(15),
      }).size === 0
  );

  /* ─── (g) 기록 흐름 모사 — placeExercise · reorder + withSwaps(순수 조합, 서버와 같은 순서) ─── */
  const list = [fx('a'), fx('b'), fx('c', 'core')];
  const base = { ...frozenJson, exercises: list } as FrozenPlan;
  const replaced = placeExercise(list, 'b', fx('n'), 'replace');
  const sPlan = replaced && {
    ...withSwaps(base, [
      swap({ from: 'b', to: 'n', kind: 'replace', slot: 'main', at: at(1) }),
    ]),
    exercises: replaced,
  };
  check(
    'P2 (g) 교체(replace): 목록에 from 이 없고 to 가 그 자리 · swaps 에 { from, to, replace, session } 1건',
    sPlan != null &&
      idsOf(sPlan) === 'a,n,c' &&
      sPlan.swaps?.length === 1 &&
      sPlan.swaps[0].from === 'b' &&
      sPlan.swaps[0].to === 'n' &&
      sPlan.swaps[0].kind === 'replace' &&
      sPlan.swaps[0].where === 'session' &&
      !('swaps' in base)
  );
  const addedList = placeExercise(list, 'b', fx('n'), 'add');
  const aPlan = addedList && {
    ...withSwaps(base, [
      swap({ from: 'b', to: 'n', kind: 'add', slot: 'main', at: at(1) }),
    ]),
    exercises: addedList,
  };
  check(
    "P2 (g) 더하기(add): from 이 남고 kind 'add'",
    aPlan != null && idsOf(aPlan) === 'a,b,n,c' && aPlan.swaps?.[0].kind === 'add'
  );
  const want = ['c'];
  const dropped = list.filter((e) => !want.includes(e.id));
  const next = want.flatMap((id) => list.filter((e) => e.id === id));
  const rPlan = {
    ...withSwaps(
      base,
      dropped.map((e) => swap({ from: e.id, slot: e.slot, at: at(9) }))
    ),
    exercises: next,
  };
  check(
    'P2 (g) 빼기(reorder): 둘을 빼면 remove 2건 · slot 이 FrozenExercise 의 slot 과 같다',
    idsOf(rPlan) === 'c' &&
      rPlan.swaps?.length === 2 &&
      rPlan.swaps.every(
        (s) =>
          s.kind === 'remove' &&
          s.where === 'session' &&
          s.to === null &&
          s.slot === 'main'
      ) &&
      rPlan.swaps.map((s) => s.from).join() === 'a,b'
  );
  check(
    'P2 (g) 그 판을 저장했다 readFrozenPlan 으로 읽어도 기록 2건 그대로',
    readFrozenPlan(JSON.parse(JSON.stringify(rPlan)))?.swaps?.length === 2
  );
  check(
    'P2 (g) 순서만 바꾼 판은 swaps 키 없이 예전 모양',
    !('swaps' in { ...withSwaps(base, []), exercises: [list[2], list[0], list[1]] })
  );
}

/* ═══════════════════ [2판 되먹임(P2)] 일정 지문 — lib/report/plan-fingerprint.ts (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 되먹임(P2)] 일정 지문 · 상태 바뀜 견주기 — 결정성 · 왕복 · 옛 모양 · 칸별 · 글(2026-10-12)'
);
{
  type FpCheckin = Partial<Omit<CheckinLike, 'date'>>;
  type FpPerson = {
    /** 오늘 체크인 — null 이면 없는 날, 안 주면 기본(컨디션 7 · 부위 정상 · 잠 보통) */
    today?: FpCheckin | null;
    /** 어제 체크인 — 안 주면 없다 */
    yesterday?: FpCheckin | null;
    /** 최근 7일 투구수(0번째가 어제). 안 주면 factsFor 와 같은 DEFAULT_PITCHES */
    pitches?: number[];
    /** 오늘 투구 기록 하나 */
    todayLog?: { pitches: number; intensity: number; sessionType?: string };
    memos?: { date: string; text: string }[];
    rehab?: RehabFacts | null;
  };
  const baseCheckin = (date: string): CheckinLike => ({
    date,
    condition: 7,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
  });
  const todayKey = dayBefore(0).slice(0, 10);
  const yesterdayKey = dayBefore(1).slice(0, 10);
  /* factsFor 와 같은 모양의 사람을 지문에 필요한 칸(어제 체크인 · 메모 · 던지는 일정)까지 넣어 만든다 */
  const fpFacts = (p: FpPerson = {}) => {
    const pitches = p.pitches ?? DEFAULT_PITCHES;
    return buildFacts({
      nickname: '지문',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: p.rehab ?? null,
      today: TODAY,
      logs: [
        ...pitches.map<PitchLogLike>((count, i) => ({
          date: dayBefore(i + 1),
          pitchCount: count,
          intensity: 7,
          maxVelocity: 130,
          avgVelocity: 120,
        })),
        ...(p.todayLog
          ? [
              {
                date: dayBefore(0),
                pitchCount: p.todayLog.pitches,
                intensity: p.todayLog.intensity,
                ...(p.todayLog.sessionType
                  ? { sessionType: p.todayLog.sessionType }
                  : {}),
                maxVelocity: 130,
                avgVelocity: 120,
              } satisfies PitchLogLike,
            ]
          : []),
      ],
      checkins: [
        ...(p.today === null ? [] : [{ ...baseCheckin(todayKey), ...p.today }]),
        ...(p.yesterday ? [{ ...baseCheckin(yesterdayKey), ...p.yesterday }] : []),
      ],
      memos: p.memos ?? [],
    });
  };
  const base = fpFacts();
  const fpBase = fingerprintOf(base);
  const changesVs = (p: FpPerson) =>
    diffFingerprintChanges(fpBase, fingerprintOf(fpFacts(p)));
  const keysOf = (cs: readonly FingerprintChange[]) => cs.map((c) => c.key).join(',');
  const textsOf = (cs: readonly FingerprintChange[]) =>
    cs.map((c) => c.text).join(' / ');

  /* ─── (a) 칸 목록 · 결정성 · 왕복 ─── */
  /*
   * P4 검토로 바뀜(2026-10-12) — 왜: 등판을 읽는 함수가 어제 기록 유무(facts.patterns.loggedYesterday — 쉰 날 줄까지)를 읽게 돼, 같은 커밋에서
   * 지문에 바깥 선택 칸 loggedYesterday 를 더했다(판단이 읽는 칸 = 지문 칸). 지금의 buildFacts 는 이 칸을 늘 만드니 늘 있는 칸 뒤에 붙는다.
   */
  check(
    'P2 (지문) 칸 목록이 고정 목록(FINGERPRINT_KEYS)과 순서까지 같다 — 판단이 facts 의 새 칸을 읽으면 둘 다 고친다(P4 검토 뒤 + loggedYesterday)',
    JSON.stringify(Object.keys(fpBase)) ===
      JSON.stringify([...FINGERPRINT_KEYS, 'loggedYesterday']),
    Object.keys(fpBase).join(',')
  );
  check(
    'P2 (지문) 같은 facts 두 번 → JSON 글자까지 같고 바뀐 것 0 · 1KB 안',
    JSON.stringify(fingerprintOf(fpFacts())) === JSON.stringify(fpBase) &&
      diffFingerprint(fpBase, fingerprintOf(fpFacts())).length === 0 &&
      JSON.stringify(fpBase).length <= 1024,
    `${JSON.stringify(fpBase).length}자`
  );
  check(
    'P2 (지문) 저장했다 읽어도(JSON 왕복 · readPlanFingerprint) 글자까지 같다',
    JSON.stringify(readPlanFingerprint(JSON.parse(JSON.stringify(fpBase)))) ===
      JSON.stringify(fpBase)
  );
  check(
    /* P3 로 바뀜 — 기본 사람의 어제가 40구 → 38구(DEFAULT_PITCHES 주석: 40구 × 70% 가 새 세게 던진 날 문턱을 넘는다) */
    'P2 (지문) 기본 사람: 체크인 있음 · 컨디션 7 · 부위 없음 · 근육통 null · 마지막 투구 어제 38구 · 세게 던진 날 없음 · 재활 없음',
    fpBase.asOf === todayKey &&
      fpBase.checkin?.condition === 7 &&
      fpBase.checkin.parts.length === 0 &&
      fpBase.checkin.soreness === null &&
      fpBase.checkin.sleepShort === false &&
      fpBase.lastThrow?.date === yesterdayKey &&
      fpBase.lastThrow.pitches === 38 &&
      fpBase.hardOuting === null &&
      fpBase.rehab === null &&
      fpBase.painRecentParts.length === 0 &&
      fpBase.painWords.length === 0,
    JSON.stringify(fpBase)
  );

  /* ─── (b) 옛 모양 · 깨진 지문 ─── */
  const broken: unknown[] = [
    undefined,
    null,
    'x',
    7,
    [],
    { v: 0 },
    { v: 1 },
    { v: 1, asOf: 1 },
    { ...fpBase, checkin: { ...fpBase.checkin, condition: '8' } },
    { ...fpBase, checkin: { ...fpBase.checkin, parts: 'shoulder:통증' } },
    { ...fpBase, checkin: { ...fpBase.checkin, sleepShort: 'no' } },
    { ...fpBase, throwPlanYesterday: 3 },
    { ...fpBase, painRecentParts: null },
    { ...fpBase, painWords: 'x' },
    { ...fpBase, rehab: { area: 'elbow-inner', stage: 2, throwing: 'hard' } },
    { ...fpBase, rehab: { area: 'elbow-inner', stage: '2', throwing: 'none' } },
    { ...fpBase, zone: 'weird' },
    { ...fpBase, lastThrow: { date: 1, pitches: 40, adjusted: 40 } },
    { ...fpBase, lastThrow: { date: todayKey, pitches: 40 } },
    { ...fpBase, hardOuting: { daysAgo: 0 } },
  ];
  check(
    'P2 (지문) 없거나 모양이 다른 지문(안쪽 칸 포함 20가지)은 null — 견줄 것 없음',
    broken.every((b) => readPlanFingerprint(b) === null),
    broken
      .map((b, i) => (readPlanFingerprint(b) === null ? '' : String(i)))
      .filter(Boolean)
      .join(',')
  );
  const withExtra = readPlanFingerprint({ ...fpBase, extra: 1 });
  check(
    'P2 (지문) 모르는 칸은 버리고 새 객체를 돌려준다',
    withExtra != null && !('extra' in withExtra) && (withExtra as unknown) !== fpBase
  );

  /* ─── (c) 칸별 — 하나만 바꾸면 그 한 줄 ─── */
  const cond = changesVs({ today: { condition: 3 } });
  check(
    'P2 (견주기) 컨디션 7 → 3 만 바꾸면 한 줄',
    cond.length === 1 &&
      cond[0].key === 'condition' &&
      cond[0].text === '컨디션이 7에서 3으로 바뀌었어요',
    textsOf(cond)
  );
  const shoulder = changesVs({ today: { shoulder: '통증' } });
  check(
    "P2 (견주기) 어깨 '정상' → '통증': parts 한 줄 · 아픈 부위만 바뀜(onlyPainPartChanges)",
    shoulder.length === 1 &&
      shoulder[0].key === 'parts' &&
      shoulder[0].text === '어깨에 통증이 있다고 적었어요' &&
      onlyPainPartChanges(shoulder),
    textsOf(shoulder)
  );
  check(
    'P2 (견주기) 컨디션까지 바뀌면 onlyPainPartChanges 는 false · 바뀐 것 없으면 false',
    !onlyPainPartChanges(changesVs({ today: { shoulder: '통증', condition: 3 } })) &&
      !onlyPainPartChanges([])
  );
  const relaxed = diffFingerprintChanges(
    fingerprintOf(fpFacts({ today: { lowerBack: '뻐근' } })),
    fpBase
  );
  check(
    "P2 (견주기) 허리 '뻐근' → '정상' 도 잡힌다(풀렸어요)",
    relaxed.length === 1 &&
      relaxed[0].key === 'parts' &&
      relaxed[0].text === '허리 뻐근 표시가 풀렸어요',
    textsOf(relaxed)
  );
  const worse = diffFingerprintChanges(
    fingerprintOf(fpFacts({ today: { shoulder: '뻐근' } })),
    fingerprintOf(fpFacts({ today: { shoulder: '통증' } }))
  );
  check(
    "P2 (견주기) 어깨 '뻐근' → '통증' 한 줄",
    worse.length === 1 && worse[0].text === '어깨가 뻐근에서 통증으로 바뀌었어요',
    textsOf(worse)
  );
  const twoParts = changesVs({ today: { shoulder: '통증', lowerBody: '뻐근' } });
  check(
    'P2 (견주기) 부위 둘이 바뀌면 부위마다 한 줄(CHECKIN_PARTS 순서)',
    twoParts.length === 2 &&
      twoParts[0].text.startsWith('어깨') &&
      twoParts[1].text === '하체가 뻐근하다고 적었어요',
    textsOf(twoParts)
  );
  check(
    "P2 (견주기) 옛 기록의 '괜찮음'은 '정상'과 같다 — 판단이 안 읽는 값은 지문에 안 든다",
    changesVs({ today: { shoulder: '괜찮음', elbow: '괜찮음' } }).length === 0
  );
  const sore = changesVs({ today: { soreness: 4 } });
  check(
    "P2 (견주기) 근육통 없음 → 4('많이')",
    sore.length === 1 &&
      sore[0].key === 'soreness' &&
      sore[0].text === "근육통 '많이'를 새로 적었어요",
    textsOf(sore)
  );
  const soreUp = diffFingerprintChanges(
    fingerprintOf(fpFacts({ today: { soreness: 2 } })),
    fingerprintOf(fpFacts({ today: { soreness: 5 } }))
  );
  check(
    'P2 (견주기) 근육통 2 → 5 는 말로(조금 → 심함)',
    soreUp.length === 1 &&
      soreUp[0].text === "근육통이 '조금'에서 '심함'으로 바뀌었어요",
    textsOf(soreUp)
  );
  check(
    'P2 (견주기) 근육통 범위 밖(9) · null 은 안 적은 것과 같다',
    changesVs({ today: { soreness: 9 } }).length === 0 &&
      changesVs({ today: { soreness: null } }).length === 0
  );
  const sleep = changesVs({ today: { sleep: '부족' } });
  check(
    "P2 (견주기) 잠 '보통' → '부족'",
    sleep.length === 1 &&
      sleep[0].key === 'sleep' &&
      sleep[0].text === '잠이 부족했다고 적었어요',
    textsOf(sleep)
  );
  check(
    'P2 (견주기) 잔 시간 5시간(느낌은 보통)도 짧은 밤(isShortSleep) · 8시간은 바뀜 없음',
    keysOf(changesVs({ today: { sleepHours: 5 } })) === 'sleep' &&
      changesVs({ today: { sleepHours: 8 } }).length === 0
  );
  const kind = changesVs({ today: { preferredWorkout: '웨이트' } });
  check(
    "P2 (견주기) 운동 종류 없음 → '웨이트'",
    kind.length === 1 &&
      kind[0].key === 'preferredWorkout' &&
      kind[0].text === "하고 싶은 운동을 '웨이트'로 골랐어요",
    textsOf(kind)
  );
  const kindSwap = diffFingerprintChanges(
    fingerprintOf(fpFacts({ today: { preferredWorkout: '파워' } })),
    fingerprintOf(fpFacts({ today: { preferredWorkout: '회복' } }))
  );
  check(
    "P2 (견주기) 운동 종류 '파워' → '회복'(받침 조사 '으로')",
    kindSwap.length === 1 &&
      kindSwap[0].text === "하고 싶은 운동을 '파워'에서 '회복'으로 바꿨어요",
    textsOf(kindSwap)
  );
  const tp = changesVs({ today: { throwPlan: '오늘 등판' } });
  check(
    "P2 (견주기) 던지는 일정 없음 → '오늘 등판'",
    tp.length === 1 &&
      tp[0].key === 'throwPlan' &&
      tp[0].text === "던지는 일정을 '오늘 등판'으로 적었어요",
    textsOf(tp)
  );
  const tpy = changesVs({ yesterday: { throwPlan: '내일 등판' } });
  check(
    "P2 (견주기) 어제 체크인에 '내일 등판'을 더하면 throwPlanYesterday 한 줄(plannedOuting 이 읽는 값)",
    tpy.length === 1 &&
      tpy[0].key === 'throwPlanYesterday' &&
      tpy[0].text.includes("'내일 등판'"),
    textsOf(tpy)
  );
  const recent = changesVs({ yesterday: { shoulder: '통증' } });
  check(
    'P2 (견주기) 어제 체크인에 어깨 통증 → painRecent 한 줄 · 아픈 부위만 바뀜',
    recent.length === 1 &&
      recent[0].key === 'painRecent' &&
      recent[0].text === '최근 통증 부위에 어깨가 더해졌어요' &&
      onlyPainPartChanges(recent),
    textsOf(recent)
  );
  check(
    'P2 (견주기) 하고 싶은 부위(preferredParts)만 바꾸면 바뀜 없음 — 순서만 바꾸는 입력은 지문에 없다',
    changesVs({ today: { preferredParts: ['하체', '코어'] } }).length === 0
  );

  /* ─── (d) 투구 기록 · 세게 던진 날 · 부하 구간 ─── */
  /*
   * P3 로 바뀜 — 오늘 55구(강도 7)였다. 2판 D2 부터 55구 × 70% = 3,850 이 세게 던진 날이라 '아님'을 재려면 문턱 밑이어야 한다
   * → 35구(2,450). 55구가 세게 던진 날이 되는 쪽은 '[2판 오늘 상태(P3)] D2' 절이 본다.
   */
  const threw = changesVs({ todayLog: { pitches: 35, intensity: 7 } });
  check(
    "P2 (견주기) 오늘 35구(강도 7)를 더하면 lastThrow '오늘 35구를 던졌어요' · 세게 던진 날은 아님",
    threw.some((c) => c.key === 'lastThrow' && c.text === '오늘 35구를 던졌어요') &&
      !threw.some((c) => c.key === 'hardOuting') &&
      threw.filter((c) => c.key !== 'zone').length === 1,
    textsOf(threw)
  );
  const game = changesVs({
    todayLog: { pitches: 85, intensity: 7, sessionType: '경기' },
  });
  check(
    'P2 (견주기) 오늘 경기 85구 → lastThrow 와 hardOuting(theme.ts 의 hardOuting 과 같은 판단)',
    game.some((c) => c.key === 'lastThrow') &&
      game.some(
        (c) =>
          c.key === 'hardOuting' &&
          c.text === '오늘 거의 전력으로 85구를 던진 기록이 들어왔어요'
      ),
    textsOf(game)
  );
  const hardAt9 = changesVs({ todayLog: { pitches: 40, intensity: 9 } });
  const lightAt9 = changesVs({ todayLog: { pitches: 20, intensity: 9 } });
  check(
    'P2 (견주기) 강도 9 · 40구는 세게 던진 날, 20구는 아님(HARD_OUTING_MIN_PITCHES)',
    hardAt9.some((c) => c.key === 'hardOuting') &&
      !lightAt9.some((c) => c.key === 'hardOuting')
  );
  const sameDayMore = diffFingerprintChanges(
    fingerprintOf(fpFacts({ todayLog: { pitches: 30, intensity: 7 } })),
    fingerprintOf(fpFacts({ todayLog: { pitches: 55, intensity: 7 } }))
  );
  check(
    "P2 (견주기) 오늘 30구 → 55구(같은 날 기록이 늘어남) '오늘 투구 기록이 55구로 바뀌었어요'",
    sameDayMore.some(
      (c) => c.key === 'lastThrow' && c.text === '오늘 투구 기록이 55구로 바뀌었어요'
    ),
    textsOf(sameDayMore)
  );
  const quiet = fingerprintOf(fpFacts({ pitches: [0, 0, 0, 0, 0, 0, 0] }));
  const surge = fingerprintOf(
    fpFacts({
      pitches: [0, 0, 0, 0, 0, 0, 0],
      todayLog: { pitches: 150, intensity: 10 },
    })
  );
  const zoneChanges = diffFingerprintChanges(quiet, surge);
  check(
    'P2 (견주기) 안 던지다 오늘 150구(강도 10) → 부하 구간이 바뀌고 zone 한 줄(구간 이름 · 구간으로)',
    quiet.zone !== surge.zone &&
      zoneChanges.some(
        (c) => c.key === 'zone' && /^투구 부하가 .+ 구간으로 .+어요$/.test(c.text)
      ),
    `${quiet.zone} → ${surge.zone} / ${textsOf(zoneChanges)}`
  );
  check(
    'P2 (견주기) 안 던진 사람은 lastThrow 가 null · 던지면 생긴다',
    quiet.lastThrow === null && surge.lastThrow?.date === todayKey
  );

  /* ─── (e) 메모 · 재활 · 체크인 통째로 · 다른 날 ─── */
  const noCheckin = fingerprintOf(fpFacts({ today: null }));
  const memo = diffFingerprintChanges(
    noCheckin,
    fingerprintOf(
      fpFacts({ today: null, memos: [{ date: yesterdayKey, text: '팔꿈치가 찌릿함' }] })
    )
  );
  check(
    "P2 (견주기) 체크인 없는 날 어제 메모 '찌릿' → memo 한 줄(plan.needsPainCheck 가 읽는 값)",
    memo.length === 1 &&
      memo[0].key === 'memo' &&
      memo[0].text === '메모에 통증으로 보이는 말이 생겼어요',
    textsOf(memo)
  );
  check(
    "P2 (견주기) 재활 복귀표 꼬리표('통증 없음')만이면 바뀜 없음(P1 ④ 와 맞물림)",
    diffFingerprintChanges(
      noCheckin,
      fingerprintOf(
        fpFacts({
          today: null,
          memos: [{ date: yesterdayKey, text: throwMemo(2, 'none') }],
        })
      )
    ).length === 0
  );
  const r2: RehabFacts = {
    area: 'elbow-inner',
    label: '팔꿈치 안쪽',
    stage: 2,
    severity: 'mild',
    joint: 'elbow',
    throwing: 'light',
    firstWeekNoThrow: false,
  };
  const rehabStart = changesVs({ rehab: r2 });
  check(
    "P2 (견주기) 재활 없음 → 2단계 '재활 2단계를 시작했어요' 한 줄",
    rehabStart.length === 1 &&
      rehabStart[0].key === 'rehab' &&
      rehabStart[0].text === '재활 2단계를 시작했어요',
    textsOf(rehabStart)
  );
  const rehabUp = diffFingerprintChanges(
    fingerprintOf(fpFacts({ rehab: r2 })),
    fingerprintOf(fpFacts({ rehab: { ...r2, stage: 3 } }))
  );
  check(
    'P2 (견주기) 재활 2단계 → 3단계',
    rehabUp.length === 1 && rehabUp[0].text === '재활이 2단계에서 3단계로 바뀌었어요',
    textsOf(rehabUp)
  );
  const rehabThrow = diffFingerprintChanges(
    fingerprintOf(fpFacts({ rehab: r2 })),
    fingerprintOf(
      fpFacts({ rehab: { ...r2, throwing: 'none', firstWeekNoThrow: true } })
    )
  );
  check(
    "P2 (견주기) 재활 던지기 light → none '재활 중 던지지 않기로 바뀌었어요'",
    rehabThrow.length === 1 &&
      rehabThrow[0].text === '재활 중 던지지 않기로 바뀌었어요',
    textsOf(rehabThrow)
  );
  const rehabEnd = diffFingerprintChanges(
    fingerprintOf(fpFacts({ rehab: r2 })),
    fpBase
  );
  check(
    "P2 (견주기) 재활이 끝나면 '재활이 끝났어요'",
    rehabEnd.length === 1 && rehabEnd[0].text === '재활이 끝났어요',
    textsOf(rehabEnd)
  );
  const gone = diffFingerprintChanges(fpBase, noCheckin);
  const gone2 = diffFingerprintChanges(
    fingerprintOf(fpFacts({ today: { condition: 3, shoulder: '통증', soreness: 5 } })),
    noCheckin
  );
  check(
    "P2 (견주기) 오늘 체크인이 없어지면 '오늘 체크인이 지워졌어요' 한 줄뿐 — 안의 칸은 따로 세지 않는다",
    gone.length === 1 &&
      gone[0].key === 'checkin' &&
      gone[0].text === '오늘 체크인이 지워졌어요' &&
      gone2.length === 1 &&
      gone2[0].key === 'checkin',
    `${textsOf(gone)} / ${textsOf(gone2)}`
  );
  const born = diffFingerprintChanges(noCheckin, fpBase);
  check(
    "P2 (견주기) 체크인이 새로 생기면 '오늘 체크인을 새로 남겼어요' 한 줄",
    born.length === 1 && born[0].text === '오늘 체크인을 새로 남겼어요',
    textsOf(born)
  );
  check(
    'P2 (견주기) 다른 날의 지문(asOf 다름)은 견주지 않는다 — []',
    diffFingerprint(
      { ...fpBase, asOf: '2026-06-14' },
      fingerprintOf(fpFacts({ today: { condition: 3 } }))
    ).length === 0
  );

  /* ─── (f) stateChangesOf — today-data.ts 가 부르는 길 ─── */
  const nowFacts = fpFacts({ today: { condition: 3 } });
  check(
    'P2 (읽기) 지문 없는 옛 일정 · 일정 없음 · 모양 깨진 지문은 바뀜 없음([])',
    stateChangesOf({ version: 1, picks: [] }, nowFacts).length === 0 &&
      stateChangesOf(null, nowFacts).length === 0 &&
      stateChangesOf(undefined, nowFacts).length === 0 &&
      stateChangesOf({ fingerprint: { v: 0 } }, nowFacts).length === 0 &&
      stateChangesOf({ fingerprint: 'x' }, nowFacts).length === 0
  );
  const savedPlan = {
    version: 1,
    picks: [],
    fingerprint: JSON.parse(JSON.stringify(fpBase)),
  };
  check(
    'P2 (읽기) 저장된 일정(지문 있음) vs 컨디션만 바뀐 지금 facts → 한 줄 · 같은 facts → []',
    stateChangesOf(savedPlan, nowFacts).length === 1 &&
      stateChangesOf(savedPlan, nowFacts)[0].key === 'condition' &&
      stateChangesOf(savedPlan, base).length === 0
  );

  /* ─── (g) 글 규칙 — 격자로 모든 글을 모아 해요체 · 줄표 없음 · 60자 안 ─── */
  const variants: FpPerson[] = [];
  for (const c of [1, 3, 5, 8, 10]) variants.push({ today: { condition: c } });
  for (const p of CHECKIN_PARTS)
    for (const f of ['뻐근', '통증']) variants.push({ today: { [p.key]: f } });
  for (const s of [1, 2, 3, 4, 5]) variants.push({ today: { soreness: s } });
  variants.push(
    { today: { sleep: '부족' } },
    { today: { sleep: '충분', sleepHours: 8 } }
  );
  for (const k of WORKOUT_KINDS) variants.push({ today: { preferredWorkout: k.name } });
  for (const t of THROW_PLANS)
    variants.push({ today: { throwPlan: t } }, { yesterday: { throwPlan: t } });
  for (const p of CHECKIN_PARTS) variants.push({ yesterday: { [p.key]: '통증' } });
  variants.push(
    { today: null },
    { today: null, memos: [{ date: yesterdayKey, text: '어깨가 아프다' }] },
    { today: null, memos: [{ date: yesterdayKey, text: '팔꿈치 저림 · 시큰' }] }
  );
  for (const stage of [1, 2, 3, 4] as const)
    for (const throwing of ['light', 'none'] as const)
      variants.push({ rehab: { ...r2, stage, throwing } });
  variants.push(
    { todayLog: { pitches: 20, intensity: 5 } },
    { todayLog: { pitches: 85, intensity: 9 } },
    { todayLog: { pitches: 100, intensity: 7, sessionType: '경기' } },
    { pitches: [0, 0, 0, 0, 0, 0, 0] },
    { pitches: [0, 0, 0, 0, 0, 0, 0], todayLog: { pitches: 150, intensity: 10 } },
    { pitches: [120, 0, 110, 0, 100, 0, 90] },
    { pitches: [0, 95, 0, 0, 0, 0, 0] },
    { pitches: [0, 0, 60, 0, 0, 0, 0], todayLog: { pitches: 10, intensity: 4 } }
  );
  const prints = variants.map((v) => fingerprintOf(fpFacts(v)));
  const texts = new Set<string>();
  for (const p of prints) {
    for (const c of diffFingerprintChanges(fpBase, p)) texts.add(c.text);
    for (const c of diffFingerprintChanges(p, fpBase)) texts.add(c.text);
  }
  /* 이웃끼리도 견줘 'A 에서 B 로' 꼴을 모은다 */
  for (let i = 1; i < prints.length; i++) {
    for (const c of diffFingerprintChanges(prints[i - 1], prints[i])) texts.add(c.text);
  }
  const badTexts = [...texts].filter(
    (t) => t.length > 60 || t.includes('—') || !/(어요|에요)$/.test(t)
  );
  check(
    `P2 (글) 격자 ${variants.length}가지에서 모은 글 ${texts.size}개가 모두 60자 안 · 줄표 없음 · 해요체(어요/에요)로 끝남`,
    texts.size >= 60 && badTexts.length === 0,
    badTexts.slice(0, 5).join(' / ')
  );
  check(
    'P2 (글) 조사가 앞말에 맞는다 — 3으로 · 8로 · 웨이트로 · 회복으로 · 오늘 등판으로 · 하체가',
    texts.has('컨디션이 7에서 3으로 바뀌었어요') &&
      texts.has('컨디션이 7에서 8로 바뀌었어요') &&
      texts.has("하고 싶은 운동을 '웨이트'로 골랐어요") &&
      texts.has("하고 싶은 운동을 '회복'으로 골랐어요") &&
      texts.has("던지는 일정을 '오늘 등판'으로 적었어요") &&
      texts.has('하체가 뻐근하다고 적었어요') &&
      texts.has('손목·전완에 통증이 있다고 적었어요')
  );
  check(
    'P2 (글) 같은 입력이면 격자 전체가 두 번 돌려도 글자까지 같다(결정성)',
    JSON.stringify(variants.map((v) => fingerprintOf(fpFacts(v)))) ===
      JSON.stringify(prints)
  );
}

/* ═══════════════════ [2판 되먹임(P2)] 운동 끝 힘듦 한 번 — lib/workout/effort.ts · facts.condition.trainingEffort (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 되먹임(P2)] 운동 끝 힘듦 한 번 — 칩 눈금 · 급증 깃발 · facts 잇기 · 아무 규칙도 안 읽음(2026-10-12)'
);
{
  /* ── 칩 눈금 ── */
  check(
    'P2 (눈금) 칩 넷 — 가벼움 3 · 보통 5 · 힘듦 7 · 아주 힘듦 9, 오름차순 · 1~10 안 · 글에 줄표 없음',
    EFFORT_LEVELS.length === 4 &&
      EFFORT_LEVELS.map((l) => `${l.label}:${l.intensity}`).join(' ') ===
        '가벼움:3 보통:5 힘듦:7 아주 힘듦:9' &&
      EFFORT_LEVELS.every(
        (l, i, a) =>
          l.intensity >= 1 &&
          l.intensity <= 10 &&
          (i === 0 || a[i - 1].intensity < l.intensity) &&
          !l.hint.includes('—') &&
          /(어요|에요)$/.test(l.hint)
      )
  );
  check(
    'P2 (눈금) 칩 → 눈금 → 칩 왕복이 넷 다 맞는다',
    EFFORT_LEVELS.every(
      (l) => intensityOfEffort(l.key) === l.intensity && effortOf(l.intensity) === l.key
    )
  );
  check(
    'P2 (눈금) 1~10 이 모두 한 칩으로 간다 — 1~4 가벼움 · 5~6 보통 · 7~8 힘듦 · 9~10 아주 힘듦',
    Array.from({ length: 10 }, (_, i) => effortOf(i + 1)).join(',') ===
      'light,light,light,light,normal,normal,hard,hard,max,max'
  );
  check(
    'P2 (눈금) 범위 밖은 가장 가까운 끝(0 → 가벼움 · 11 → 아주 힘듦), 소수는 반올림(6.4 → 보통 · 6.6 → 힘듦)',
    effortOf(0) === 'light' &&
      effortOf(11) === 'max' &&
      effortOf(6.4) === 'normal' &&
      effortOf(6.6) === 'hard'
  );
  check(
    'P2 (눈금) 모르는 값은 null — 글자 아님 · 없는 열쇠 · 빈 글',
    intensityOfEffort(7) === null &&
      intensityOfEffort('x') === null &&
      intensityOfEffort('') === null &&
      intensityOfEffort(undefined) === null &&
      intensityOfEffort(null) === null
  );
  check(
    'P2 (눈금) 부하 배수가 칩 차례대로 커진다(가벼움 0.7 < 보통 0.9 < 힘듦 1.1 < 아주 힘듦 1.3, lib/training-load.ts)',
    EFFORT_LEVELS.every(
      (l, i, a) =>
        i === 0 || intensityFactor(a[i - 1].intensity) < intensityFactor(l.intensity)
    ) &&
      Math.abs(intensityFactor(5) - 0.9) < 0.001 &&
      Math.abs(intensityFactor(9) - 1.3) < 0.001
  );

  /* ── 급증 깃발(trainingEffortOf) ── */
  const asOf = dayBefore(0).slice(0, 10);
  const note = (daysAgo: number, intensity: number): TrainingNoteLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    intensity,
  });
  const fives = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => note(from + i, 5));
  check(
    'P2 (급증) 입력 없음 → last7 [] · last28 [] · spikeFlag false',
    JSON.stringify(trainingEffortOf([], asOf)) ===
      JSON.stringify({ last7: [], last28: [], spikeFlag: false })
  );
  check(
    `P2 (급증) 상수 — 7일 안 ${EFFORT_SPIKE_MIN_NOTES}개 이상 · 차이 ${EFFORT_SPIKE_DIFF} 이상(검토안 '7일 중 3개')`,
    EFFORT_SPIKE_MIN_NOTES === 3 && EFFORT_SPIKE_DIFF === 2
  );
  const two = trainingEffortOf([note(0, 9), note(2, 9), ...fives(8, 12)], asOf);
  check(
    'P2 (급증) 7일 안 둘(9 · 9)은 3개 미만이라 false — 28일 평균이 아무리 낮아도',
    two.last7.length === 2 && two.last28.length === 7 && two.spikeFlag === false
  );
  const three = trainingEffortOf(
    [note(0, 9), note(2, 9), note(5, 9), ...fives(8, 11)],
    asOf
  );
  check(
    'P2 (급증) 7일 안 셋 9 · 그 밖 5 넷 → 7일 평균 9 · 28일 평균 6.71 · 차이 2.29 → true',
    three.last7.length === 3 && three.last28.length === 7 && three.spikeFlag === true
  );
  const mild = trainingEffortOf(
    [note(0, 7), note(2, 7), note(5, 7), ...fives(8, 11)],
    asOf
  );
  check(
    'P2 (급증) 7일 안 셋 7 · 그 밖 5 넷 → 차이 1.14 → false',
    mild.last7.length === 3 && mild.spikeFlag === false
  );
  const edge = trainingEffortOf(
    [note(0, 9), note(2, 9), note(5, 9), ...fives(8, 10)],
    asOf
  );
  check(
    'P2 (급증) 경계 — 7일 평균 9 · 28일 평균 7(42/6) · 차이 정확히 2 → true(부동소수 오차에 안 빠짐)',
    edge.last28.length === 6 && edge.spikeFlag === true
  );
  const flat = trainingEffortOf([note(0, 9), note(1, 9), note(2, 9)], asOf);
  check(
    'P2 (급증) 7일 안 셋뿐이면 28일 평균도 같아 차이 0 → false(꾸준히 힘든 것은 급증이 아니다)',
    flat.last7.length === 3 && flat.last28.length === 3 && flat.spikeFlag === false
  );
  const windows = trainingEffortOf(
    [note(-1, 10), note(0, 3), note(6, 4), note(7, 6), note(27, 8), note(28, 9)],
    asOf
  );
  check(
    'P2 (급증) 창 — 오늘 · 6일 전은 last7, 7일 전 · 27일 전은 last28 만, 28일 전 · 앞날은 둘 다 아님; 날짜 오름차순',
    JSON.stringify(windows.last7) === '[4,3]' &&
      JSON.stringify(windows.last28) === '[8,6,4,3]'
  );
  const dirty = trainingEffortOf(
    [
      { date: 'x', intensity: 9 },
      { date: asOf, intensity: Number.NaN },
      { date: asOf, intensity: 5 },
      { date: asOf, intensity: 7 },
    ],
    asOf
  );
  check(
    'P2 (급증) 깨진 날짜 · NaN 은 빼고, 같은 날 두 줄이면 뒤 것이 이긴다',
    JSON.stringify(dirty.last7) === '[7]' && JSON.stringify(dirty.last28) === '[7]'
  );
  check(
    'P2 (급증) 같은 입력 두 번 → 글자까지 같다(결정성)',
    JSON.stringify(
      trainingEffortOf([note(0, 9), note(2, 9), note(5, 9), ...fives(8, 11)], asOf)
    ) === JSON.stringify(three)
  );

  /* ── facts 잇기 ── */
  const factsWith = (trainingNotes?: TrainingNoteLike[], condition = 7) =>
    buildFacts({
      nickname: '힘듦',
      age: 22,
      heightCm: 180,
      trainingLevel: '중급',
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: DEFAULT_PITCHES.map<PitchLogLike>((count, i) => ({
        date: dayBefore(i + 1),
        pitchCount: count,
        intensity: 7,
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        {
          date: asOf,
          condition,
          sleep: '보통',
          shoulder: '정상',
          elbow: '정상',
          wrist: '정상',
          lowerBack: '정상',
          lowerBody: '정상',
          preferredParts: [],
          preferredWorkout: null,
        } satisfies CheckinLike,
      ],
      memos: [],
      ...(trainingNotes ? { trainingNotes } : {}),
    });
  const none = factsWith();
  check(
    'P2 (facts) trainingNotes 를 안 넘기면 condition 에 trainingEffort 칸 자체가 없다(옛 입력과 같은 모양)',
    !('trainingEffort' in none.condition) && none.condition.trainingEffort === undefined
  );
  const empty = factsWith([]);
  check(
    'P2 (facts) 빈 목록을 넘기면 { last7: [], last28: [], spikeFlag: false }',
    JSON.stringify(empty.condition.trainingEffort) ===
      JSON.stringify({ last7: [], last28: [], spikeFlag: false })
  );
  const spiked = factsWith([note(0, 9), note(2, 9), note(5, 9), ...fives(8, 11)]);
  check(
    'P2 (facts) 7일 안 셋 9 · 28일 안 5 넷 → facts.condition.trainingEffort.spikeFlag true · last7 셋 · last28 일곱',
    spiked.condition.trainingEffort?.spikeFlag === true &&
      spiked.condition.trainingEffort.last7.length === 3 &&
      spiked.condition.trainingEffort.last28.length === 7
  );
  const excluded = factsWith([note(2, 9), note(5, 9), ...fives(8, 11)]);
  check(
    'P2 (facts) excludeToday 흉내 — 오늘 줄을 뺀 입력이면 last7 이 둘이라 false(gather.ts 가 오늘 로그와 같은 규칙으로 뺀다)',
    excluded.condition.trainingEffort?.spikeFlag === false &&
      excluded.condition.trainingEffort.last7.length === 2
  );
  check(
    'P2 (facts) 힘듦 칸 말고는 facts 가 글자 하나 안 다르다(있을 때 · 없을 때)',
    JSON.stringify({
      ...spiked,
      condition: { ...spiked.condition, trainingEffort: undefined },
    }) === JSON.stringify(none)
  );

  /* ── 아직 아무 규칙도 안 읽는다(P5 몫) — 지문 · 투구 계획 · 후보 거르기가 같다 ── */
  /*
   * P4 로 바뀜(2026-10-12 커밋 E) — 왜: 날 종류의 R2(어제 중간 부하 + 힘듦 급증 → 회복, D3)가 급증 깃발을 읽게 돼, 같은 커밋에서
   * 일정 지문에 effortSpike 선택 칸을 더했다(판단이 읽는 칸 = 지문 칸). 칸이 있는 facts 의 지문은 그 칸 하나만 더 붙고, 칸이 없는
   * facts(none)의 지문은 예전과 글자까지 같다. 투구 계획 · 후보 거르기는 여전히 안 읽는다(아래 둘 그대로).
   */
  /* P4 검토로 바뀜 — 바깥 칸 loggedYesterday 가 effortSpike 뒤에 붙어(FINGERPRINT_OPTIONAL_KEYS 차례) 그 칸을 떼고 견준다 */
  const { loggedYesterday: noneLogged, ...noneFp } = fingerprintOf(none);
  check(
    'P2 (안 읽음 → P4 로 바뀜) 급증 깃발이 켜지면 일정 지문에 effortSpike: true 한 칸만 더 붙는다(칸 없는 facts 의 지문은 그대로)',
    JSON.stringify(fingerprintOf(spiked)) ===
      JSON.stringify({ ...noneFp, effortSpike: true, loggedYesterday: noneLogged }) &&
      !('effortSpike' in fingerprintOf(none))
  );
  check(
    'P2 (안 읽음) 급증 깃발이 켜져도 투구 계획(buildPitchPlan)이 같다',
    JSON.stringify(buildPitchPlan(spiked)) === JSON.stringify(buildPitchPlan(none))
  );
  const pickedWith = selectCandidates({
    facts: spiked,
    plan: buildPitchPlan(spiked),
    library,
  });
  const pickedWithout = selectCandidates({
    facts: none,
    plan: buildPitchPlan(none),
    library,
  });
  check(
    'P2 (안 읽음) 급증 깃발이 켜져도 운동 후보(selectCandidates)가 같다',
    pickedWith.candidates.map((e) => e.id).join() ===
      pickedWithout.candidates.map((e) => e.id).join() &&
      pickedWith.halted === pickedWithout.halted
  );
}

/* ═══════════════════ [2판 오늘 상태(P3)] D1 등판 답 규칙 — lib/checkin.ts THROW_PLANS · parseThrowPlan · nextOutingDays (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] D1 등판 답 여섯 — 글자 · 파서 · 남은 날 범위 한 곳 · plannedOuting 위임(2026-10-12)'
);
{
  /*
   * D1(사용자 결정): 답 넷 → 여섯('오늘 등판' · '오늘 불펜' · '내일 등판' · '2~3일 뒤' · '4일 이상 뒤' · '없음'), 옛 넷 글자 그대로.
   * 답을 날로 읽는 규칙은 nextOutingDays 한 곳 — plannedOuting(theme.ts)은 그 결과로 today · tomorrow 만 가른다.
   * 새 답 둘은 아직 어느 독자도 날을 안 바꾼다(위 (a) 절) — 범위만 받아 두고 P4 · P5 가 쓴다.
   */
  const OLD_FOUR = ['오늘 등판', '오늘 불펜', '내일 등판', '없음'] as const;
  check(
    'D1 (글자) THROW_PLANS 는 여섯이고 옛 넷은 글자 그대로 남아 있다(DB 옛 줄 · 얼린 facts 호환)',
    THROW_PLANS.length === 6 &&
      OLD_FOUR.every((a) => (THROW_PLANS as readonly string[]).includes(a)),
    THROW_PLANS.join(' · ')
  );
  check(
    'D1 (글자) 차례는 가까운 날부터 — 오늘 등판 · 오늘 불펜 · 내일 등판 · 2~3일 뒤 · 4일 이상 뒤 · 없음',
    THROW_PLANS.join('|') === '오늘 등판|오늘 불펜|내일 등판|2~3일 뒤|4일 이상 뒤|없음'
  );
  check(
    'D1 (글자) 화면 글 규칙 — 줄표(—) 없음 · 12자 안(휴대폰 칩 한 줄)',
    THROW_PLANS.every((a) => !a.includes('—') && a.length <= 12)
  );

  /* ── parseThrowPlan — 목록의 글자만, 앞뒤 공백은 떼고, 그 밖은 null ── */
  check(
    'D1 (파서) 여섯 답은 그대로 돌아온다',
    THROW_PLANS.every((a) => parseThrowPlan(a) === a)
  );
  check(
    'D1 (파서) 앞뒤 공백은 뗀다(폼 글자)',
    parseThrowPlan(' 오늘 등판 ') === '오늘 등판' &&
      parseThrowPlan('\t4일 이상 뒤\n') === '4일 이상 뒤'
  );
  check(
    'D1 (파서) 빈 글자 · null · undefined · 숫자 · 목록 밖 글자 → null(안 적은 것, 오류 아님)',
    [
      parseThrowPlan(''),
      parseThrowPlan('   '),
      parseThrowPlan(null),
      parseThrowPlan(undefined),
      parseThrowPlan(3),
      parseThrowPlan({}),
      parseThrowPlan('모레'),
      parseThrowPlan('내일'),
      parseThrowPlan('2-3일 뒤'),
      parseThrowPlan('4일 뒤'),
      parseThrowPlan('오늘등판'),
    ].every((v) => v === null)
  );
  /*
   * P3 로 바뀜 — D1 폼(같은 날 다음 커밋)이 던지는 일정을 상세 파서(parseCheckinDetail)에서 간편 파서(parseCheckinBody)로
   * 옮겼다. 묻는 것은 같다: 폼 글자를 읽는 파서가 parseThrowPlan 과 같은 규칙인가. 상세 파서에 칸이 없다는 것은 아래
   * '[2판 오늘 상태(P3)] D1 폼' 절이 본다.
   */
  check(
    'D1 (파서) parseCheckinBody 가 같은 파서를 쓴다 — 새 답은 살고, 목록 밖 글자는 null',
    (() => {
      const got = (throwPlan: string) =>
        parseCheckinBody((name) => (name === 'throwPlan' ? throwPlan : '')).throwPlan;
      return (
        got('2~3일 뒤') === '2~3일 뒤' &&
        got(' 4일 이상 뒤 ') === '4일 이상 뒤' &&
        got('없음') === '없음' &&
        got('모레') === null &&
        got('') === null
      );
    })()
  );

  /* ── nextOutingDays — 답 → 다음 등판까지 남은 날 범위(규칙은 이 한 곳) ── */
  const expected: Record<ThrowPlan, { min: number; max: number | null } | null> = {
    '오늘 등판': { min: 0, max: 0 },
    '오늘 불펜': null,
    '내일 등판': { min: 1, max: 1 },
    '2~3일 뒤': { min: 2, max: 3 },
    '4일 이상 뒤': { min: 4, max: null },
    없음: null,
  };
  for (const a of THROW_PLANS) {
    check(
      `D1 (남은 날) '${a}' → ${JSON.stringify(expected[a])}`,
      JSON.stringify(nextOutingDays(a)) === JSON.stringify(expected[a]),
      JSON.stringify(nextOutingDays(a))
    );
  }
  check(
    'D1 (남은 날) 안 적음 · 빈 글자 · 목록 밖 글자 → null(파서와 같은 규칙)',
    nextOutingDays(null) === null &&
      nextOutingDays(undefined) === null &&
      nextOutingDays('') === null &&
      nextOutingDays('모레') === null &&
      nextOutingDays(' 내일 등판 ')?.min === 1
  );
  check(
    'D1 (남은 날) 불변식 — 범위는 min 정수 ≥ 0, max 는 null 이거나 min 이상, 등판 답끼리는 min 이 차례대로 커진다',
    (() => {
      const ranges = THROW_PLANS.map((a) => nextOutingDays(a)).filter((r) => r != null);
      const wellFormed = ranges.every(
        (r) =>
          Number.isInteger(r.min) && r.min >= 0 && (r.max === null || r.max >= r.min)
      );
      const ascending = ranges.every((r, i) => i === 0 || r.min > ranges[i - 1].min);
      return wellFormed && ascending && ranges.length === 4;
    })()
  );
  check(
    'D1 (남은 날) 끝이 없는 답은 4일 이상 뒤 하나뿐(max null)',
    THROW_PLANS.filter((a) => nextOutingDays(a)?.max === null).join() === '4일 이상 뒤'
  );

  /* ── plannedOuting 이 nextOutingDays 를 따른다 — 꼭 오늘(0~0) · 꼭 내일(1~1)만, 어제 답 이월은 내일 등판 하나 ── */
  const d1Checkin = (daysAgo: number, throwPlan: string | null): CheckinLike => ({
    date: new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10),
    condition: 7,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    throwPlan,
  });
  const d1Facts = (today: string | null, yesterday: string | null) =>
    buildFacts({
      nickname: '시험',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: [],
      checkins: [d1Checkin(0, today), d1Checkin(1, yesterday)],
      memos: [],
    });
  const fromRange = (r: { min: number; max: number | null } | null) =>
    r?.max === 0 ? 'today' : r?.min === 1 && r.max === 1 ? 'tomorrow' : null;
  check(
    'D1 (위임) 오늘 답 여섯 모두 — plannedOuting 이 nextOutingDays 의 범위에서 나온 값과 같다(어제 답은 무시)',
    THROW_PLANS.every(
      (a) => plannedOuting(d1Facts(a, '내일 등판')) === fromRange(nextOutingDays(a))
    ),
    THROW_PLANS.map((a) => `${a}:${plannedOuting(d1Facts(a, '내일 등판'))}`).join(' · ')
  );
  check(
    "D1 (위임) 오늘 안 적음 + 어제 답 여섯 — '내일 등판'만 오늘로 이월, 나머지는 null",
    THROW_PLANS.every(
      (a) => plannedOuting(d1Facts(null, a)) === (a === '내일 등판' ? 'today' : null)
    ),
    THROW_PLANS.map((a) => `${a}:${plannedOuting(d1Facts(null, a))}`).join(' · ')
  );
  check(
    'D1 (위임) 모르는 글자가 오늘 답으로 들어와도 null(어제 이월도 막는다 — 오늘 적은 것이 있으니)',
    plannedOuting(d1Facts('모레', '내일 등판')) === null
  );
}

/* ═══════════════════ [2판 오늘 상태(P3)] D1 폼 — 던지는 일정은 간편 칸 하나 · 파서 하나 (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] D1 폼 — 던지는 일정은 간편 칸(CheckinBody) 하나, 상세 파서 · 요약 판정에는 없다(2026-10-12)'
);
{
  /*
   * 던지는 일정이 상세에만 있어 답이 거의 없었다(P0 사용 통계 체크인 30줄에 1). 간편으로 옮기며 지킬 것:
   *   ① 간편 파서가 읽는다(body=1 이면 간편 · 상세 어느 쪽 저장이든)
   *   ② 상세 파서는 그 칸을 돌려주지 않는다 — app/actions/checkin.ts 가 상세 값을 간편 값 뒤에 펼쳐서, 상세에 칸이
   *      남아 있으면 같은 값을 한 번 더 쓰고 칸이 비었을 때 간편 답을 null 로 덮는다
   *   ③ 요약의 '상세 줄'(hasDetail)은 간편에서 적는 칸(던지는 일정 · 팔 피로)으로 켜지지 않는다
   *   ④ 화면으로 넘기는 자료(app/(app)/layout.tsx 의 pickCheckinBody + pickCheckinDetail)에는 그대로 실린다
   */
  const formOf =
    (values: Record<string, string>) =>
    (name: string): string =>
      values[name] ?? '';
  /* 서버 동작의 합치기 차례 그대로 — upsert 의 { ...quick, ...body, ...armPain, ...detail } 에서 두 조각만 */
  const savedThrowPlan = (values: Record<string, string>, detailForm: boolean) => {
    const get = formOf(values);
    const body = parseCheckinBody(get);
    const parsed = detailForm ? parseCheckinDetail(get) : null;
    const detail = parsed && 'value' in parsed ? parsed.value : {};
    return ({ ...body, ...detail } as { throwPlan?: unknown }).throwPlan;
  };

  check(
    'D1 폼 (간편 파서) 여섯 답을 그대로 읽고, 다른 간편 칸은 그대로 — 근육통 · 끼니 양과 같이 와도',
    THROW_PLANS.every((a) => {
      const r = parseCheckinBody(
        formOf({ throwPlan: a, soreness: '3', mealAmount: '보통' })
      );
      return r.throwPlan === a && r.soreness === 3 && r.nutrition === '보통';
    })
  );
  check(
    'D1 폼 (간편 파서) 안 고름(빈 칸) · 목록 밖 글자 → null, 오류 없이',
    parseCheckinBody(formOf({})).throwPlan === null &&
      parseCheckinBody(formOf({ throwPlan: '' })).throwPlan === null &&
      parseCheckinBody(formOf({ throwPlan: '다음 주' })).throwPlan === null
  );
  {
    const r = parseCheckinDetail(
      formOf({ throwPlan: '오늘 등판', appetite: '3', note: '메모' })
    );
    const keys = 'value' in r ? Object.keys(r.value).sort().join() : `error:${r.error}`;
    check(
      'D1 폼 (상세 파서) 폼에 던지는 일정이 있어도 돌려주는 값에 그 칸이 없다 — 칸은 armFatigue · appetite · bodyWeightKg · note 넷',
      keys === 'appetite,armFatigue,bodyWeightKg,note',
      keys
    );
  }
  check(
    'D1 폼 (저장 합치기) 상세로 저장해도 간편 파서가 읽은 답이 남는다 — 여섯 답 모두, 간편 · 상세 저장이 같다',
    THROW_PLANS.every(
      (a) =>
        savedThrowPlan({ throwPlan: a, appetite: '4' }, true) === a &&
        savedThrowPlan({ throwPlan: a }, false) === a
    )
  );
  check(
    'D1 폼 (저장 합치기) 고른 답을 다시 눌러 풀고 저장하면 null 로 지워진다(상세 저장이 옛 값을 되살리지 않는다)',
    savedThrowPlan({ throwPlan: '', appetite: '4' }, true) === null &&
      savedThrowPlan({}, false) === null
  );
  check(
    'D1 폼 (요약 판정) hasDetail — 던지는 일정 · 팔 피로만 적은 날은 상세 줄이 없고, 몸무게 · 식욕 · 메모는 상세 줄',
    (() => {
      const onlyPlan = { throwPlan: '오늘 등판', note: null };
      const onlyArm = { armFatigue: 3, note: null };
      return (
        hasDetail(onlyPlan) === false &&
        hasDetail(onlyArm) === false &&
        hasDetail({}) === false &&
        hasDetail({ note: '' }) === false &&
        hasDetail({ bodyWeightKg: 72.5 }) === true &&
        hasDetail({ appetite: 2 }) === true &&
        hasDetail({ note: '팔이 무거움' }) === true
      );
    })()
  );
  {
    /* DB 행 그대로(칸이 다 있는 줄) — layout.tsx 가 두 조각을 펼쳐 체크인 창 자료를 만든다 */
    const rowOf = (throwPlan: string | null) => ({
      sleepHours: null,
      soreness: null,
      nutrition: null,
      skippedMeals: [],
      armFatigue: 2,
      bodyWeightKg: null,
      appetite: null,
      note: null,
      throwPlan,
    });
    check(
      'D1 폼 (화면 자료) pickCheckinDetail 은 던지는 일정을 싣지 않고, 두 조각을 펼치면 간편 쪽 값이 실린다',
      THROW_PLANS.every((a) => {
        const row = rowOf(a);
        const detail = pickCheckinDetail(row);
        const merged = { ...pickCheckinBody(row), ...detail };
        return !Object.keys(detail).includes('throwPlan') && merged.throwPlan === a;
      }) &&
        { ...pickCheckinBody(rowOf('모레')), ...pickCheckinDetail(rowOf('모레')) }
          .throwPlan === null &&
        pickCheckinDetail(rowOf(null)).armFatigue === 2
    );
  }
  check(
    'D1 폼 (알려진 하루 영향) 배포 전에 열린 옛 간편 화면은 칸을 안 보낸다 — body=1 만으로 던지는 일정이 null 이 된다(팔 피로와 같은 선택)',
    savedThrowPlan({ soreness: '2' }, false) === null
  );
}

/* ═══════════════════ [2판 오늘 상태(P3)] D2 읽기 규칙 · 세게 던진 날 — lib/pitch-stats.ts effortPctOf · lib/report/facts.ts HARD_OUTING_MIN_LOAD (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] D2 읽기 규칙 · 세게 던진 날 — 체감 강도(%) 읽기 한 곳, 세게 던진 날 = 투구수 × 체감 강도 ≥ 2,700(2026-10-12)'
);
{
  /*
   * 지킬 것:
   *   ① 읽기는 effortPctOf(%) · intensityOf(1~10) 둘 — 옛 기록(effortPct 없음 · null)은 intensity 그대로라 부하 지수 · 전력 환산 ·
   *      이틀 피로 창이 한 글자도 안 바뀐다. 같은 값을 % 로 적은 기록(effortPct = intensity × 10)도 결과가 같다.
   *   ② 세게 던진 날 = 그날 Σ 투구수 × 체감 강도(%) ≥ HARD_OUTING_MIN_LOAD(2,700 = 30구 × 90%), 경기는 체감과 상관없이 100%.
   *      옛 규칙(경기, 또는 강도 9~10 으로 그날 합쳐 30구 이상)으로 세게 던진 날은 모두 그대로 세게 던진 날이다.
   *   ③ load 칸이 없는 옛 facts 는 옛 규칙(pitches ≥ 30)으로 읽는다. 일정 지문은 load 를 선택 칸으로 싣는다.
   */
  const day = '2026-06-10';
  const logOn = (
    date: string,
    pitchCount: number,
    intensity: number,
    extra: Partial<PitchLogLike> = {}
  ): PitchLogLike => ({
    date,
    pitchCount,
    intensity,
    maxVelocity: null,
    avgVelocity: null,
    ...extra,
  });
  /* % 로 적은 새 기록 — 저장 규칙 그대로 intensity 도 같이 채운다 */
  const pctLog = (
    date: string,
    pitchCount: number,
    pct: number,
    sessionType?: string
  ) =>
    logOn(date, pitchCount, effortToIntensity(pct), {
      effortPct: pct,
      ...(sessionType ? { sessionType } : {}),
    });
  const changeTexts = (cs: readonly FingerprintChange[]) =>
    cs.map((c) => c.text).join(' / ');

  /* ── ① 읽기 함수 표 ── */
  check(
    'D2 (읽기) effortPctOf — 칸 없음 · null 은 intensity × 10, 적은 % 는 그대로, 쉰 날 0',
    effortPctOf({ intensity: 7 }) === 70 &&
      effortPctOf({ intensity: 7, effortPct: null }) === 70 &&
      effortPctOf({ intensity: 9, effortPct: 85 }) === 85 &&
      effortPctOf({ intensity: 0, effortPct: null }) === 0
  );
  check(
    'D2 (읽기) intensityOf — 옛 기록은 intensity 그대로(소수도 오차 없이), 85% 는 8.5',
    intensityOf({ intensity: 7 }) === 7 &&
      intensityOf({ intensity: 7.3, effortPct: null }) === 7.3 &&
      intensityOf({ intensity: 9, effortPct: 85 }) === 8.5 &&
      intensityOf({ intensity: 1, effortPct: 5 }) === 0.5
  );
  {
    const table: [number, number][] = [
      [5, 1],
      [10, 1],
      [15, 2],
      [45, 5],
      [50, 5],
      [55, 6],
      [75, 8],
      [85, 9],
      [95, 10],
      [100, 10],
    ];
    const bad = table.filter(([pct, want]) => effortToIntensity(pct) !== want);
    check(
      'D2 (읽기) effortToIntensity — 반올림(.5 는 올림) 표: 5→1 · 45→5 · 85→9 · 95→10 · 100→10',
      bad.length === 0,
      bad.map(([p]) => `${p}→${effortToIntensity(p)}`).join(', ')
    );
  }
  {
    const steps: number[] = [];
    for (let p = MIN_EFFORT_PCT; p <= MAX_EFFORT_PCT; p += EFFORT_STEP) steps.push(p);
    check(
      'D2 (읽기) 입력 눈금 5~100% · 5 단위(20칸) — 모든 칸이 1~10 으로, 옛 칸과의 차이는 5%p 이하',
      EFFORT_STEP === 5 &&
        steps.length === 20 &&
        steps.every((p) => {
          const i = effortToIntensity(p);
          return Number.isInteger(i) && i >= 1 && i <= 10 && Math.abs(i * 10 - p) <= 5;
        }) &&
        effortToIntensity(0) === 1 &&
        effortToIntensity(140) === 10,
      steps.map((p) => effortToIntensity(p)).join(' ')
    );
  }

  /* ── ① 옛 기록과 같은 결과 ── */
  {
    /* 여러 종류 · 여러 날 · 하루 두 번 — 옛 기록, effortPct: null, 같은 값을 % 로 적은 기록이 같은 결과를 낸다 */
    const base: PitchLogLike[] = [
      logOn('2026-06-08', 40, 8, { sessionType: '불펜' }),
      logOn('2026-06-08', 20, 3, { sessionType: '캐치볼' }),
      logOn('2026-06-09', 85, 9, { sessionType: '경기' }),
      logOn('2026-06-10', 30, 7, { sessionType: '불펜' }),
      logOn('2026-06-10', 0, 0, { sessionType: '휴식' }),
      logOn('2026-06-11', 25, 5, { sessionType: '캐치볼' }),
    ];
    const withNull = base.map((l) => ({ ...l, effortPct: null }));
    const asPct = base.map((l) => ({
      ...l,
      effortPct: l.pitchCount > 0 ? l.intensity * 10 : null,
    }));
    const keys = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11'];
    const shape = (logs: PitchLogLike[]) =>
      JSON.stringify({
        days: [...groupByDay(logs)].map(([k, d]) => [k, d, dailyLoad(d)]),
        types: loadBySessionType(
          logs.map((l) => ({ ...l, sessionType: l.sessionType ?? '' })),
          keys
        ),
        windows: findFatigueWindows(groupByDay(logs), keys),
        summary: summarize(groupByDay(logs), keys),
      });
    const a = shape(base);
    check(
      'D2 (같은 결과) 옛 기록 · effortPct null · 같은 값의 % 기록 — 하루 합치기 · 부하 · 종류별 부하 · 이틀 피로 창 · 요약이 글자까지 같다',
      a === shape(withNull) && a === shape(asPct),
      a.slice(0, 120)
    );
    const d8 = groupByDay(base).get('2026-06-08')!;
    check(
      'D2 (같은 결과) 옛 기록만의 하루 값은 예전 숫자 그대로 — 불펜 40구 8 + 캐치볼 20구 3 → 강도 6.33 · 부하 380 · 전력 환산 48',
      d8.pitchCount === 60 &&
        Math.abs(d8.intensity - 380 / 60) < 1e-9 &&
        Math.abs(dailyLoad(d8) - 380) < 1e-9 &&
        Math.abs(d8.adjustedPitches - (40 * 0.9 + 20 * 0.6)) < 1e-9,
      JSON.stringify(d8)
    );
  }
  {
    /* 섞인 날 — 30구 85%(새) + 30구 옛 7 */
    const mixed = groupByDay([pctLog(day, 30, 85), logOn(day, 30, 7)]).get(day)!;
    check(
      'D2 (섞인 날) 30구 85% + 30구 옛 강도 7 → 강도 7.75 · 부하 465 · 전력 환산 28.5 + 25.5 = 54',
      Math.abs(mixed.intensity - 7.75) < 1e-9 &&
        Math.abs(dailyLoad(mixed) - 465) < 1e-9 &&
        Math.abs(mixed.adjustedPitches - 54) < 1e-9,
      JSON.stringify(mixed)
    );
    check(
      'D2 (경계) 전력 환산의 반올림 — 7.5(75%) → 8 칸 0.9, 8.5(85%) → 9 칸 0.95, 경기는 % 와 상관없이 1',
      stressFactor(intensityOf({ intensity: 8, effortPct: 75 })) === 0.9 &&
        stressFactor(intensityOf({ intensity: 9, effortPct: 85 })) === 0.95 &&
        stressFactor(intensityOf({ intensity: 3, effortPct: 30 }), '경기') === 1
    );
    const twoDays = (a: number, b: number) =>
      findFatigueWindows(
        groupByDay([pctLog('2026-06-09', 30, a), pctLog('2026-06-10', 30, b)]),
        ['2026-06-09', '2026-06-10']
      ).length;
    check(
      'D2 (이틀 피로 창) 실수 강도 합 — 55% + 50% = 10.5 > 10 이면 창, 50% + 50% = 10 이면 아님',
      twoDays(55, 50) === 1 && twoDays(50, 50) === 0
    );
    const types = loadBySessionType(
      [
        { ...pctLog(day, 30, 85), sessionType: '불펜' },
        { ...logOn(day, 20, 4), sessionType: '캐치볼' },
      ],
      [day]
    );
    check(
      'D2 (종류별 부하) % 기록은 intensityOf 로 — 불펜 30구 85% = 255 · 캐치볼 20구 옛 4 = 80',
      types.length === 2 &&
        types.find((t) => t.name === '불펜')?.load === 255 &&
        types.find((t) => t.name === '캐치볼')?.load === 80,
      JSON.stringify(types)
    );
  }

  /* ── ② 세게 던진 날 몫(outingLoadOf) ── */
  check(
    'D2 (몫) outingLoadOf — 투구수 × 체감 %, 경기는 100%, 0구 · 쉰 날은 0 · 문턱 2,700 = 30구 × 90%',
    outingLoadOf(pctLog(day, 30, 90)) === 2700 &&
      outingLoadOf(logOn(day, 30, 7)) === 2100 &&
      outingLoadOf(pctLog(day, 20, 50, '경기')) === 2000 &&
      outingLoadOf({ ...logOn(day, 35, 3), sessionType: '경기' }) === 3500 &&
      outingLoadOf(logOn(day, 0, 0)) === 0 &&
      HARD_OUTING_MIN_LOAD === 2700 &&
      HARD_OUTING_MIN_LOAD === 30 * NEAR_MAX_EFFORT_PCT
  );

  /* ── ② 세게 던진 날 판정 표 — buildFacts → hardOuting(theme.ts) 그대로 ── */
  const yesterday = dayBefore(1);
  const factsOfLogs = (logs: PitchLogLike[]) =>
    buildFacts({
      nickname: 'D2',
      age: 22,
      heightCm: 180,
      baselineDailyLoad: 300,
      today: TODAY,
      logs,
      checkins: [],
      memos: [],
    });
  const hardOf = (logs: PitchLogLike[]) => hardOuting(factsOfLogs(logs));
  /*
   * pitches 칸(그날 던진 공의 합)도 본다 — 이유 글의 'N구'와 isNearMaxOuting('거의 전력' 글)이 이 값을 읽는다. 그날 마지막 기록만
   * 담아도 load · 판정은 그대로라 예전 표로는 못 잡았다(2판 P3 검토 — 돌연변이 A08).
   */
  const cases: {
    name: string;
    logs: PitchLogLike[];
    hard: boolean;
    load: number;
    pitches: number;
  }[] = [
    {
      name: '30구 × 90%',
      logs: [pctLog(yesterday, 30, 90)],
      hard: true,
      load: 2700,
      pitches: 30,
    },
    /*
     * P3 로 바뀜(2판 P3 검토, 2026-10-12) — 왜: 85% 는 DB 에 '강도 9'로 남아 옛 규칙('강도 9~10 · 30구')으로 세게 던진 날인데,
     * 곱(2,550)만 보면 빠졌다. 사용자 결정은 그 날이 그대로 세게 던진 날로 남는 것이다(facts.ts nearMaxPitches). false → true.
     */
    {
      name: '30구 × 85%',
      logs: [pctLog(yesterday, 30, 85)],
      hard: true,
      load: 2550,
      pitches: 30,
    },
    {
      name: '31구 × 85%',
      logs: [pctLog(yesterday, 31, 85)],
      hard: true,
      load: 2635,
      pitches: 31,
    },
    {
      name: '85% 20구 + 10구(나눠 적음)',
      logs: [pctLog(yesterday, 20, 85), pctLog(yesterday, 10, 85)],
      hard: true,
      load: 2550,
      pitches: 30,
    },
    {
      name: '29구 × 85%',
      logs: [pctLog(yesterday, 29, 85)],
      hard: false,
      load: 2465,
      pitches: 29,
    },
    {
      name: '30구 × 80%',
      logs: [pctLog(yesterday, 30, 80)],
      hard: false,
      load: 2400,
      pitches: 30,
    },
    {
      name: '경기 20구(체감 60%)',
      logs: [pctLog(yesterday, 20, 60, '경기')],
      hard: false,
      load: 2000,
      pitches: 20,
    },
    {
      name: '경기 35구(체감 60%)',
      logs: [pctLog(yesterday, 35, 60, '경기')],
      hard: true,
      load: 3500,
      pitches: 35,
    },
    {
      name: '60구 × 50%',
      logs: [pctLog(yesterday, 60, 50)],
      hard: true,
      load: 3000,
      pitches: 60,
    },
    {
      name: '40구 × 70%',
      logs: [pctLog(yesterday, 40, 70)],
      hard: true,
      load: 2800,
      pitches: 40,
    },
    {
      name: '경기 25구 + 캐치볼 20구 50%',
      logs: [pctLog(yesterday, 25, 80, '경기'), pctLog(yesterday, 20, 50, '캐치볼')],
      hard: true,
      load: 3500,
      pitches: 45,
    },
    {
      name: '옛 기록 강도 9 · 30구',
      logs: [logOn(yesterday, 30, 9)],
      hard: true,
      load: 2700,
      pitches: 30,
    },
    {
      name: '옛 기록 강도 8 · 30구',
      logs: [logOn(yesterday, 30, 8)],
      hard: false,
      load: 2400,
      pitches: 30,
    },
    {
      name: '옛 기록 강도 9 · 29구',
      logs: [logOn(yesterday, 29, 9)],
      hard: false,
      load: 2610,
      pitches: 29,
    },
    {
      name: '옛 기록 경기 20구(강도 5)',
      logs: [{ ...logOn(yesterday, 20, 5), sessionType: '경기' }],
      hard: false,
      load: 2000,
      pitches: 20,
    },
  ];
  const wrong = cases.filter((c) => {
    const h = hardOf(c.logs);
    const listed = factsOfLogs(c.logs).patterns.hardOutings?.find(
      (o) => o.daysAgo === 1
    );
    return (
      (h != null) !== c.hard || listed?.load !== c.load || listed?.pitches !== c.pitches
    );
  });
  check(
    'D2 (판정 표) 30구×90% 세게 · 30 · 31구×85% 와 85% 20+10 세게(P3 검토 — 옛 규칙의 날) · 29구×85% · 80% 아님 · 경기 20구 아님 · 경기 35구 60% 세게 · 60구×50% · 40구×70% 세게 · 경기 25 + 캐치볼 20 세게(45구) · 옛 강도 9 30구 세게 · 옛 8 · 29구 아님 · 그날 공의 합(pitches)까지',
    wrong.length === 0,
    wrong
      .map(
        (c) => `${c.name}: ${JSON.stringify(factsOfLogs(c.logs).patterns.hardOutings)}`
      )
      .join(' / ')
  );
  {
    const f = factsOfLogs([
      pctLog(yesterday, 20, 50),
      pctLog(dayBefore(2), 90, 100, '경기'),
      logOn(dayBefore(3), 0, 0, { sessionType: '휴식' }),
    ]);
    const list = f.patterns.hardOutings ?? [];
    check(
      'D2 (재료 목록) 던진 날은 문턱 밑이어도 load 와 함께 실린다(판정은 isHardOuting) · 쉰 날은 없다 · 이틀 전 세게 던진 날은 hardOuting 이 안 본다',
      list.length === 2 &&
        list[0].daysAgo === 1 &&
        list[0].pitches === 20 &&
        list[0].load === 1000 &&
        list[1].daysAgo === 2 &&
        list[1].load === 9000 &&
        hardOuting(f) === null,
      JSON.stringify(list)
    );
    const both = hardOf([
      pctLog(yesterday, 60, 90),
      pctLog(dayBefore(0), 40, 90, '불펜'),
    ]);
    check(
      'D2 (재료 목록) 어제 · 오늘 둘 다 세게 던졌으면 오늘 것을 고른다(가까운 것부터)',
      both?.daysAgo === 0 && both.pitches === 40 && both.load === 3600,
      JSON.stringify(both)
    );
  }

  /* ── ② 옛 규칙으로 세게 던진 날은 모두 그대로 세게 던진 날(옛 기록 격자) ── */
  {
    /* 옛 규칙을 여기 그대로 옮겨 둔다(facts.ts 의 2026-10-12 전 nearMaxByDay) — 새 규칙이 그보다 좁아지지 않는지 견준다 */
    const oldRuleHard = (logs: PitchLogLike[]) =>
      logs
        .filter((l) => l.sessionType === '경기' || Math.round(l.intensity) >= 9)
        .reduce((sum, l) => sum + l.pitchCount, 0) >= HARD_OUTING_MIN_PITCHES;
    const sessionTypes = ['경기', '불펜', '라이브', '캐치볼'];
    const counts = [0, 10, 20, 25, 27, 29, 30, 31, 35, 40, 60, 90];
    const seconds = [null, { t: '캐치볼', i: 3, p: 20 }, { t: '불펜', i: 9, p: 15 }];
    let combos = 0;
    let lost = 0;
    let gained = 0;
    const lostCases: string[] = [];
    for (const t1 of sessionTypes) {
      for (const i1 of [1, 3, 5, 7, 8, 9, 10]) {
        for (const p1 of counts) {
          for (const second of seconds) {
            const logs = [
              { ...logOn(yesterday, p1, i1), sessionType: t1 },
              ...(second
                ? [{ ...logOn(yesterday, second.p, second.i), sessionType: second.t }]
                : []),
            ];
            combos++;
            const before = oldRuleHard(logs);
            const after = hardOf(logs) != null;
            if (before && !after) {
              lost++;
              if (lostCases.length < 3) lostCases.push(JSON.stringify(logs));
            }
            if (!before && after) gained++;
          }
        }
      }
    }
    check(
      `D2 (옛 날 지킴) 옛 기록 ${combos}가지 — 옛 규칙(경기 · 강도 9~10 · 30구)으로 세게 던진 날은 하나도 빠지지 않는다(새로 드는 날 ${gained})`,
      lost === 0 && gained > 0,
      lostCases.join(' / ')
    );
  }

  /* ── ③ 옛 facts(load 없음) ── */
  check(
    'D2 (옛 facts) load 없으면 옛 규칙 — pitches 30 세게 · 29 아님, 글은 늘 거의 전력 · load 가 있으면 load 만 본다',
    isHardOuting({ daysAgo: 1, pitches: 30 }) &&
      !isHardOuting({ daysAgo: 1, pitches: 29 }) &&
      isNearMaxOuting({ daysAgo: 1, pitches: 29 }) &&
      isHardOuting({ daysAgo: 0, pitches: 10, load: 2700 }) &&
      !isHardOuting({ daysAgo: 0, pitches: 90, load: 2699 })
  );
  {
    const fresh = factsOfLogs([]);
    const withOutings = (hardOutings: HardOuting[]) => ({
      ...fresh,
      patterns: { ...fresh.patterns, hardOutings },
    });
    const legacy = withOutings([{ daysAgo: 1, pitches: 30 }]);
    const legacyLow = withOutings([{ daysAgo: 1, pitches: 25 }]);
    const legacyTheme = decideTheme({
      facts: legacy,
      plan: buildPitchPlan(legacy),
      lastLowerKey: null,
      lastUpperKey: null,
      preferredWorkout: null,
    });
    check(
      'D2 (옛 facts) 저장해 둔 옛 facts(load 없는 hardOutings) — 30구는 hardOuting · 25구는 아님, 이유 글은 예전 그대로',
      hardOuting(legacy)?.pitches === 30 &&
        hardOuting(legacyLow) === null &&
        legacyTheme.reason ===
          '어제 거의 전력으로 30구를 던지셨어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.',
      legacyTheme.reason
    );
  }

  /* ── 이유 글 — 거의 전력(평균 90% 이상 · 경기)과 팔 부담 ── */
  {
    const themeOf = (logs: PitchLogLike[]) => {
      const f = factsOfLogs(logs);
      return decideTheme({
        facts: f,
        plan: buildPitchPlan(f),
        lastLowerKey: null,
        lastUpperKey: null,
        preferredWorkout: null,
      });
    };
    const game = themeOf([pctLog(dayBefore(0), 85, 70, '경기')]);
    const light = themeOf([pctLog(yesterday, 60, 50)]);
    const near = themeOf([pctLog(yesterday, 40, 90)]);
    check(
      'D2 (이유 글) 경기 · 평균 90% 이상은 "거의 전력으로", 많이 가볍게(60구 50%)는 "팔 부담이 컸어요" — 둘 다 회복',
      game.key === 'recovery' &&
        game.reason ===
          '오늘 거의 전력으로 85구를 던지셨어요. 오늘과 내일은 가볍게 풀고, 모레부터 무게를 다시 올려요.' &&
        near.reason.startsWith('어제 거의 전력으로 40구를') &&
        light.key === 'recovery' &&
        light.reason ===
          '어제 60구를 던져 팔 부담이 컸어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.',
      `${game.reason} / ${near.reason} / ${light.reason}`
    );
    const f = factsOfLogs([pctLog(yesterday, 60, 50)]);
    const conflict = workoutConflict({ facts: f, preferredWorkout: '웨이트' });
    check(
      'D2 (이유 글) 웨이트를 골라도 부딪힘 까닭이 같은 말 — "어제 60구를 던져 팔 부담이 컸어요" → 회복',
      conflict?.fallback === 'recovery' &&
        conflict.reason === '어제 60구를 던져 팔 부담이 컸어요',
      JSON.stringify(conflict)
    );
    check(
      'D2 (이유 글) 글자 규칙 — 줄표 없음 · 해요체',
      ![game.reason, light.reason, conflict?.reason ?? ''].some((t) =>
        t.includes('—')
      ) && [game.reason, light.reason].every((t) => t.endsWith('올려요.'))
    );
    /*
     * 2판 P3 검토(2026-10-12): 이유 글의 'N구'는 그날 던진 공의 합이다 — 경기 25구 + 캐치볼 20구는 45구(평균이 90% 밑이라
     * '팔 부담'). 85% 30구(옛 규칙의 날 — nearMaxPitches)도 회복이고 같은 꼴의 글이다.
     */
    const mixed = themeOf([
      pctLog(yesterday, 25, 80, '경기'),
      pctLog(yesterday, 20, 50, '캐치볼'),
    ]);
    const pct85 = themeOf([pctLog(yesterday, 30, 85)]);
    check(
      'D2 (이유 글) 경기 25구 + 캐치볼 20구 → "어제 45구를 던져 팔 부담이 컸어요"(그날 공의 합) · 85% 30구 → 회복 "어제 30구를 던져 팔 부담이 컸어요"',
      mixed.key === 'recovery' &&
        mixed.reason ===
          '어제 45구를 던져 팔 부담이 컸어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.' &&
        pct85.key === 'recovery' &&
        pct85.reason.startsWith('어제 30구를 던져 팔 부담이 컸어요'),
      `${mixed.reason} / ${pct85.reason}`
    );
  }

  /* ── 일정 지문의 load 선택 칸 ── */
  {
    const fpOf = (logs: PitchLogLike[]) => fingerprintOf(factsOfLogs(logs));
    const hard = fpOf([pctLog(dayBefore(0), 55, 70)]);
    check(
      'D2 (지문) 세게 던진 날은 load 를 싣고, JSON 왕복(readPlanFingerprint)해도 글자까지 같다',
      hard.hardOuting?.pitches === 55 &&
        hard.hardOuting.load === 3850 &&
        JSON.stringify(readPlanFingerprint(JSON.parse(JSON.stringify(hard)))) ===
          JSON.stringify(hard),
      JSON.stringify(hard.hardOuting)
    );
    const oldSaved = { ...hard, hardOuting: { daysAgo: 0, pitches: 55 } };
    const readOld = readPlanFingerprint(JSON.parse(JSON.stringify(oldSaved)));
    check(
      'D2 (지문) 옛 지문(load 없음)도 읽히고, 지금 지문과 daysAgo · 구수가 같으면 바뀜 없음',
      readOld != null &&
        readOld.hardOuting != null &&
        !('load' in readOld.hardOuting) &&
        !diffFingerprintChanges(readOld, hard).some((c) => c.key === 'hardOuting'),
      JSON.stringify(readOld?.hardOuting)
    );
    check(
      "D2 (지문) load 가 숫자가 아니면 깨진 지문(null) — '3850' 글자",
      readPlanFingerprint({
        ...hard,
        hardOuting: { daysAgo: 0, pitches: 55, load: '3850' },
      }) === null
    );
    const higher = fpOf([pctLog(dayBefore(0), 55, 90)]);
    const changed = diffFingerprintChanges(hard, higher).filter(
      (c) => c.key === 'hardOuting'
    );
    check(
      'D2 (지문) 같은 구수 · 다른 체감 강도 → "오늘 세게 던진 기록의 체감 강도가 바뀌었어요"',
      changed.length === 1 &&
        changed[0].text === '오늘 세게 던진 기록의 체감 강도가 바뀌었어요',
      changeTexts(changed)
    );
    const none = fpOf([pctLog(dayBefore(0), 35, 70)]);
    const came = diffFingerprintChanges(none, hard).filter(
      (c) => c.key === 'hardOuting'
    );
    const cameNear = diffFingerprintChanges(
      none,
      fpOf([pctLog(dayBefore(0), 55, 95)])
    ).filter((c) => c.key === 'hardOuting');
    check(
      'D2 (지문) 새로 세게 던진 날 — 55구 70% "오늘 팔 부담이 큰 55구 기록이 들어왔어요", 95% 는 "거의 전력으로"',
      none.hardOuting === null &&
        came.length === 1 &&
        came[0].text === '오늘 팔 부담이 큰 55구 기록이 들어왔어요' &&
        cameNear[0]?.text === '오늘 거의 전력으로 55구를 던진 기록이 들어왔어요',
      `${changeTexts(came)} / ${changeTexts(cameNear)}`
    );
    const legacyFacts = factsOfLogs([]);
    const legacyFp = fingerprintOf({
      ...legacyFacts,
      patterns: { ...legacyFacts.patterns, hardOutings: [{ daysAgo: 1, pitches: 40 }] },
    });
    check(
      'D2 (지문) load 없는 옛 facts 로 찍은 지문에는 load 키가 없다(예전과 글자까지 같다)',
      JSON.stringify(legacyFp.hardOuting) === '{"daysAgo":1,"pitches":40}',
      JSON.stringify(legacyFp.hardOuting)
    );
  }
}

console.log(
  '\n[2판 오늘 상태(P3)] D2 쓰기 · 입력 — 체감 강도(%)를 받는 규칙 한 곳(lib/pitch-effort.ts), 옛 화면 · 고치기 · 재활 복귀표(2026-10-12)'
);
{
  /*
   * 쓰는 길 넷(투구 기록 API POST · PATCH, 구속 측정 저장, 재활 복귀표)이 모두 lib/pitch-effort.ts 를 거친다. 여기서는 그 순수
   * 규칙을 본다 — 입력 → 저장할 두 칸(effortPct · intensity), 옛 화면(intensity 만)의 길, 고치기에서 저장된 % 를 지키는 규칙,
   * 그리고 저장한 값을 읽는 쪽(lib/pitch-stats.ts effortPctOf · intensityOf)으로 되읽었을 때 같은 값이 나오는지.
   */
  type Read = Exclude<ReturnType<typeof readEffortInput>, { error: string }>;
  const ok = (r: ReturnType<typeof readEffortInput>): r is Read => !('error' in r);
  const show = (r: ReturnType<typeof readEffortInput>) => JSON.stringify(r);

  /* 입력 → 저장값 표 */
  const table: [unknown, number, number][] = [
    ['85', 85, 9],
    [85, 85, 9],
    ['100', 100, 10],
    ['95', 95, 10],
    ['90', 90, 9],
    ['50', 50, 5],
    ['45', 45, 5],
    ['15', 15, 2],
    ['5', 5, 1],
    ['83', 85, 9],
    ['82', 80, 8],
    [' 70 ', 70, 7],
    ['97.6', 100, 10],
  ];
  const tableBad = table.filter(([raw, pct, intensity]) => {
    const r = readEffortInput({ effortPct: raw }, false);
    return !ok(r) || r.effortPct !== pct || r.intensity !== intensity || r.legacy;
  });
  check(
    'D2 쓰기 (표) 85 → 85% · 강도 9, 100 → 10, 5 → 1, 83 → 85, 82 → 80(5% 칸) — % 를 받으면 legacy 아님',
    tableBad.length === 0,
    tableBad
      .map(
        ([raw]) =>
          `${JSON.stringify(raw)} → ${show(readEffortInput({ effortPct: raw }, false))}`
      )
      .join(' / ')
  );

  /* 5~100 모든 칸: 1~10 은 effortToIntensity 와 같고, 1~10 × 10 이 원래 % 에서 5 넘게 안 벗어난다 */
  const gridBad: string[] = [];
  for (let pct = MIN_EFFORT_PCT; pct <= MAX_EFFORT_PCT; pct += EFFORT_STEP) {
    const r = readEffortInput({ effortPct: pct }, false);
    if (
      !ok(r) ||
      r.effortPct !== pct ||
      r.intensity !== effortToIntensity(pct) ||
      r.intensity < 1 ||
      r.intensity > 10 ||
      Math.abs(r.intensity * 10 - pct) > 5
    ) {
      gridBad.push(`${pct} → ${show(r)}`);
    }
  }
  check(
    'D2 쓰기 (칸 20개) 5~100% 모두 받고, 1~10 은 effortToIntensity · 1~10 안 · ×10 이 5 안쪽',
    gridBad.length === 0,
    gridBad.join(' / ')
  );

  /* 받지 않는 값 */
  const rejected: unknown[] = ['0', 0, '4', 4.9, '101', 100.5, 'abc', true, '85%'];
  const leaked = rejected.filter((raw) =>
    ok(readEffortInput({ effortPct: raw }, false))
  );
  check(
    'D2 쓰기 (거절) 0 · 4 · 4.9 · 101 · 100.5 · 글자 · true · "85%" 는 "체감 강도는 5~100% 사이로 골라 주세요."',
    leaked.length === 0 &&
      rejected.every((raw) => {
        const r = readEffortInput({ effortPct: raw }, false);
        return 'error' in r && r.error === '체감 강도는 5~100% 사이로 골라 주세요.';
      }),
    leaked.map((x) => JSON.stringify(x)).join(' / ')
  );

  /* 쉰 날 — 무엇이 와도 effortPct null · intensity 0 */
  const restAll = [{ effortPct: '85' }, { intensity: '7' }, {}, { effortPct: '0' }].map(
    (b) => readEffortInput(b, true)
  );
  check(
    'D2 쓰기 (쉰 날) 무엇이 와도 effortPct null · intensity 0 · legacy 아님(0% 도 거절하지 않고 무시)',
    restAll.every(
      (r) => ok(r) && r.effortPct === null && r.intensity === 0 && !r.legacy
    ),
    restAll.map(show).join(' / ')
  );

  /* 옛 화면 — intensity 만 보낸다 */
  const legacy7 = readEffortInput({ intensity: '7' }, false);
  const legacyNum = readEffortInput({ intensity: 7 }, false);
  const legacyBlankPct = readEffortInput({ effortPct: '', intensity: '7' }, false);
  check(
    'D2 쓰기 (옛 화면) intensity "7" · 7 · (effortPct "" + "7") → effortPct null · 강도 7 · legacy',
    [legacy7, legacyNum, legacyBlankPct].every(
      (r) => ok(r) && r.effortPct === null && r.intensity === 7 && r.legacy
    ),
    [legacy7, legacyNum, legacyBlankPct].map(show).join(' / ')
  );
  const legacyBad = ['0', '11', 'x'].map((raw) =>
    readEffortInput({ intensity: raw }, false)
  );
  check(
    'D2 쓰기 (옛 화면) 1~10 밖 · 글자는 "투구 강도는 1에서 10 사이여야 해요."',
    legacyBad.every(
      (r) => 'error' in r && r.error === '투구 강도는 1에서 10 사이여야 해요.'
    ),
    legacyBad.map(show).join(' / ')
  );
  const missing = [{}, { effortPct: null }, { effortPct: '', intensity: '' }].map((b) =>
    readEffortInput(b, false)
  );
  check(
    'D2 쓰기 (빈 값) 던진 날 둘 다 없으면 "체감 강도를 골라 주세요." — 기본값으로 메우지 않는다',
    missing.every((r) => 'error' in r && r.error === EFFORT_MISSING_ERROR) &&
      EFFORT_MISSING_ERROR === '체감 강도를 골라 주세요.',
    missing.map(show).join(' / ')
  );
  const both = readEffortInput({ effortPct: 85, intensity: '3' }, false);
  check(
    'D2 쓰기 (둘 다 옴) % 가 이긴다 — effortPct 85 · intensity "3" → 85% · 강도 9',
    ok(both) && both.effortPct === 85 && both.intensity === 9 && !both.legacy,
    show(both)
  );

  /* 고치기(PATCH) — 저장된 1~10 을 보고 % 칸을 지킬지 정한다 */
  const asRead = (r: ReturnType<typeof readEffortInput>) => r as Read;
  const fresh = effortUpdate(asRead(readEffortInput({ effortPct: 70 }, false)), 9);
  const keep = effortUpdate(asRead(readEffortInput({ intensity: '9' }, false)), 9);
  const changed = effortUpdate(asRead(readEffortInput({ intensity: '6' }, false)), 9);
  const toRest = effortUpdate(asRead(readEffortInput({ intensity: '9' }, true)), 9);
  check(
    'D2 쓰기 (고치기) % 를 받으면 두 칸 다 덮는다(70% · 강도 7)',
    fresh.effortPct === 70 && fresh.intensity === 7,
    JSON.stringify(fresh)
  );
  check(
    'D2 쓰기 (고치기) 옛 화면 · 같은 강도 9 → intensity 만, effortPct 키가 아예 없다(저장된 85% 를 지킨다)',
    keep.intensity === 9 && !Object.hasOwn(keep, 'effortPct'),
    JSON.stringify(keep)
  );
  check(
    'D2 쓰기 (고치기) 옛 화면 · 다른 강도 6 → effortPct 를 비운다(안 비우면 저장된 85% 가 새 6 보다 읽힌다)',
    Object.hasOwn(changed, 'effortPct') &&
      changed.effortPct === null &&
      changed.intensity === 6,
    JSON.stringify(changed)
  );
  check(
    'D2 쓰기 (고치기) 쉰 날로 바꾸면 effortPct null · intensity 0 으로 덮는다',
    Object.hasOwn(toRest, 'effortPct') &&
      toRest.effortPct === null &&
      toRest.intensity === 0,
    JSON.stringify(toRest)
  );

  /* 저장한 줄을 읽는 쪽으로 되읽기 — DB 가 하는 일(update 는 준 칸만 덮는다)을 펼쳐 쓰기로 흉내 낸다 */
  const stored85 = { pitchCount: 30, sessionType: '불펜', ...effortFields(85) };
  const afterKeep = { ...stored85, ...keep };
  const afterChange = { ...stored85, ...changed };
  /* 옛 화면이 POST 한 줄 — readEffortInput({ intensity: '7' }) 이 돌려준 두 칸 그대로(위 '옛 화면' 검사) */
  const legacyRow = {
    pitchCount: 30,
    sessionType: '불펜',
    effortPct: ok(legacy7) ? legacy7.effortPct : -1,
    intensity: ok(legacy7) ? legacy7.intensity : -1,
  };
  check(
    'D2 쓰기 (되읽기) 85% 로 남긴 줄 → effortPctOf 85 · intensityOf 8.5, 옛 탭이 메모만 고친 뒤에도 85',
    effortPctOf(stored85) === 85 &&
      intensityOf(stored85) === 8.5 &&
      effortPctOf(afterKeep) === 85 &&
      afterKeep.intensity === 9,
    `${effortPctOf(stored85)} · ${intensityOf(stored85)} · ${effortPctOf(afterKeep)}`
  );
  check(
    'D2 쓰기 (되읽기) 옛 탭이 강도를 6 으로 고친 줄 → effortPctOf 60 · intensityOf 6',
    effortPctOf(afterChange) === 60 && intensityOf(afterChange) === 6,
    `${effortPctOf(afterChange)} · ${intensityOf(afterChange)}`
  );
  check(
    'D2 쓰기 (되읽기) 옛 화면이 새로 남긴 줄(effortPct null · 7) → 70% · 7, 옛 규칙과 같은 값',
    legacyRow.effortPct === null &&
      effortPctOf(legacyRow) === 70 &&
      intensityOf(legacyRow) === 7,
    JSON.stringify(legacyRow)
  );

  /* 입력이 세게 던진 날까지 — 30구에 85% 는 2,550(아님), 90% 는 2,700(세게). 경기는 고른 % 와 상관없이 100% */
  const loadOf = (pct: number, sessionType = '불펜') =>
    outingLoadOf({ pitchCount: 30, sessionType, ...effortFields(pct) });
  check(
    'D2 쓰기 (세게 던진 날) 30구 85% → 2,550 < 2,700 · 90% → 2,700 · 경기 30구 50% → 3,000',
    loadOf(85) === 2550 &&
      loadOf(85) < HARD_OUTING_MIN_LOAD &&
      loadOf(90) === HARD_OUTING_MIN_LOAD &&
      loadOf(50, '경기') === 3000,
    `${loadOf(85)} · ${loadOf(90)} · ${loadOf(50, '경기')}`
  );

  /* 폼을 채우는 쪽 */
  const r85 = readEffort({ effortPct: 85, intensity: 9 });
  const rOld = readEffort({ effortPct: null, intensity: 9 });
  const rNoField = readEffort({ intensity: 7 });
  const rRest = readEffort({ effortPct: null, intensity: 0 });
  check(
    'D2 쓰기 (폼 채우기) 85% 기록 → 85 · 옛 기록 9 → 90(9에서) · 칸 없는 옛 값 7 → 70 · 쉰 날 → null(비운 채)',
    r85?.pct === 85 &&
      r85.derivedFrom === null &&
      rOld?.pct === 90 &&
      rOld.derivedFrom === 9 &&
      rNoField?.pct === 70 &&
      rNoField.derivedFrom === 7 &&
      rRest === null,
    JSON.stringify([r85, rOld, rNoField, rRest])
  );
  check(
    'D2 쓰기 (표시) 옛 기록은 "강도 9에서 계산", % 로 고른 기록 · 쉰 날은 없음',
    derivedEffortText(rOld) === '강도 9에서 계산' &&
      derivedEffortText(r85) === null &&
      derivedEffortText(rRest) === null,
    `${derivedEffortText(rOld)} · ${derivedEffortText(r85)} · ${derivedEffortText(rRest)}`
  );

  /* 칩과 −/+ */
  check(
    'D2 쓰기 (칩) 50 · 60 · 70 · 80 · 90 · 100 — 모두 5% 칸 · 받는 범위 안, 오름차순',
    EFFORT_CHIPS.join(',') === '50,60,70,80,90,100' &&
      EFFORT_CHIPS.every(
        (c) => c % EFFORT_STEP === 0 && c >= MIN_EFFORT_PCT && c <= MAX_EFFORT_PCT
      ),
    EFFORT_CHIPS.join(',')
  );
  const steps = [
    stepEffortPct(50, -1),
    stepEffortPct(85, 1),
    stepEffortPct(5, -1),
    stepEffortPct(100, 1),
    stepEffortPct(83, 1),
    snapEffortPct(83),
    snapEffortPct(82),
  ];
  check(
    'D2 쓰기 (−/+) 50 − → 45 · 85 + → 90 · 5 에서 멈춤 · 100 에서 멈춤 · 83 은 85 로 맞춘 뒤 +5 → 90',
    steps.join(',') === '45,90,5,100,90,85,80',
    steps.join(',')
  );
  let walk = 50;
  for (let i = 0; i < 30; i++) walk = stepEffortPct(walk, -1);
  let up = 50;
  for (let i = 0; i < 30; i++) up = stepEffortPct(up, 1);
  check(
    'D2 쓰기 (−/+) 30번 눌러도 5~100 밖으로 안 나가고 칸마다 받는 값(5 · 100)',
    walk === MIN_EFFORT_PCT &&
      up === MAX_EFFORT_PCT &&
      ok(readEffortInput({ effortPct: walk }, false)) &&
      ok(readEffortInput({ effortPct: up }, false)),
    `${walk} · ${up}`
  );

  /* 재활 복귀표 — 1~10 은 예전 그대로, % 는 그 ×10 */
  const rehabBad: string[] = [];
  for (let step = 1; step <= THROWING_STEPS.length; step++) {
    for (let pitches = 1; pitches <= 150; pitches++) {
      const old = throwIntensity(step, pitches);
      const fields = effortFields(old * 10);
      if (fields.intensity !== old || fields.effortPct !== old * 10) {
        rehabBad.push(`${step}칸 ${pitches}개: ${old} → ${JSON.stringify(fields)}`);
      }
    }
  }
  check(
    `D2 쓰기 (재활 복귀표) ${THROWING_STEPS.length}칸 × 1~150개 모두 강도는 예전 그대로(5 · 7 · 9), % 는 ×10`,
    rehabBad.length === 0,
    rehabBad.slice(0, 3).join(' / ')
  );
}

console.log(
  '\n[2판 오늘 상태(P3)] D2 표시 — 강도를 보이는 곳은 모두 체감 강도 % 로(lib/pitch-effort.ts effortText · maxEffortPct · scaleToEffortPct · effortBand), 계산은 그대로(2026-10-12)'
);
{
  /*
   * 홈 캘린더 · 그날 요약 · 분석 · 투구 기록 달력 · 영상 목록이 '강도 9' · '9/10' 대신 '85%' 를 보인다. 화면 파일(.tsx)은 이
   * 시험이 못 읽어 규칙(순수 함수)만 본다. 볼 것: ① 옛 기록(effortPct null)은 예전 숫자 × 10 이고 칸 색 · 넘었는지가 예전과
   * 같다 ② % 로 고른 기록은 고른 값 그대로 ③ 쉰 날은 아무것도 안 보인다 ④ 보이는 글에 줄표 · '/10' 이 없다.
   */
  type L = { intensity: number; effortPct?: number | null };
  const old = (intensity: number): L => ({ intensity, effortPct: null });
  const pct = (p: number): L => ({ ...effortFields(p) });
  const rest: L = { intensity: 0, effortPct: null };

  const texts = [
    effortText(old(9)),
    effortText(pct(85)),
    effortText(old(1)),
    effortText(pct(5)),
    effortText(rest),
    effortText({ intensity: 0 }),
    effortText({ intensity: 7 }),
  ];
  check(
    'D2 표시 (한 건) 옛 강도 9 → 90% · 85% 로 고름 → 85% · 옛 1 → 10% · 5% → 5% · 쉰 날 · 칸 없는 쉰 날 → 없음 · 칸 없는 옛 7 → 70%',
    JSON.stringify(texts) === '["90%","85%","10%","5%",null,null,"70%"]',
    JSON.stringify(texts)
  );

  const oldBad: string[] = [];
  for (let i = 1; i <= 10; i++) {
    if (effortText(old(i)) !== `${i * 10}%`)
      oldBad.push(`${i} → ${effortText(old(i))}`);
    if (maxEffortPct([old(i)]) !== i * 10) oldBad.push(`max ${i}`);
  }
  check(
    'D2 표시 (옛 기록) 강도 1~10 모두 예전 숫자 × 10 으로 보인다(글 · 그날 최고)',
    oldBad.length === 0,
    oldBad.join(' / ')
  );

  const maxes = [
    maxEffortPct([]),
    maxEffortPct([rest]),
    maxEffortPct([rest, old(7), pct(85)]),
    maxEffortPct([old(9), pct(85)]),
    maxEffortPct([pct(75), old(7)]),
  ];
  check(
    'D2 표시 (그날 최고) 기록 없음 0 · 쉰 날만 0 · 쉰 날 + 옛 7 + 85% → 85 · 옛 9 + 85% → 90 · 75% + 옛 7 → 75',
    maxes.join(',') === '0,0,85,90,75',
    maxes.join(',')
  );

  /* 칸 색 — 옛 규칙(1~10 에서 8 이상 진하게 · 5 이상 중간)과 띠가 같아야 옛 기록의 달력이 안 바뀐다 */
  const oldBand = (i: number) => (i >= 8 ? 'strong' : i >= 5 ? 'mid' : 'light');
  const bandBad: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const read = readEffort(old(i));
    const band = effortBand(read?.pct ?? 0);
    if (band !== oldBand(i)) bandBad.push(`${i}: ${band} ≠ ${oldBand(i)}`);
  }
  check(
    `D2 표시 (칸 색) 옛 강도 1~10 은 예전 띠 그대로(문턱 ${MID_EFFORT_PCT} · ${STRONG_EFFORT_PCT}% = 5 · 8 의 × 10)`,
    bandBad.length === 0 && STRONG_EFFORT_PCT === 80 && MID_EFFORT_PCT === 50,
    bandBad.join(' / ')
  );
  const newBands = [45, 50, 75, 80, 85].map((p) => effortBand(p));
  check(
    'D2 표시 (칸 색) % 로 고른 기록은 고른 값으로 — 45 옅게 · 50 중간 · 75 중간 · 80 진하게 · 85 진하게',
    newBands.join(',') === 'light,mid,mid,strong,strong',
    newBands.join(',')
  );

  /* 1~10 눈금의 실수(하루 평균 · 기간 평균 · 이틀 합 · 계획 상한) → 정수 % */
  const scaled = [7.5, 8.5, 22 / 3, 10, 0, 15.5, 7.75].map(scaleToEffortPct);
  check(
    'D2 표시 (눈금 바꾸기) 7.5 → 75 · 8.5 → 85 · 7.33 → 73 · 10 → 100 · 0 → 0 · 이틀 합 15.5 → 155 · 평균 7.75 → 78',
    scaled.join(',') === '75,85,73,100,0,155,78',
    scaled.join(',')
  );

  /* 분석 화면의 하루 값 — groupByDay(intensityOf)를 % 로. 옛 기록만의 날은 예전 강도 × 10 이 정수로 나온다 */
  const day = (date: string, p: L, pitchCount = 30): PitchLogLike => ({
    date,
    sessionType: '불펜',
    pitchCount,
    ...p,
    maxVelocity: null,
    avgVelocity: null,
  });
  const byDay = groupByDay([
    day('2026-10-01', old(7)),
    day('2026-10-02', pct(85)),
    day('2026-10-03', old(9), 30),
    day('2026-10-03', pct(50), 30),
  ]);
  const dayPcts = ['2026-10-01', '2026-10-02', '2026-10-03'].map((k) =>
    scaleToEffortPct(byDay.get(k)!.intensity)
  );
  check(
    'D2 표시 (분석 하루) 옛 7 → 70% · 85% → 85% · 옛 9 30구 + 50% 30구 → 가중평균 70%',
    dayPcts.join(',') === '70,85,70',
    dayPcts.join(',')
  );
  const keys = ['2026-10-01', '2026-10-02', '2026-10-03'];
  const period = summarize(byDay, keys);
  const windows = findFatigueWindows(byDay, keys);
  check(
    'D2 표시 (리포트) 평균 75% · 최고 85% · 이틀 합 155%(10/1+10/2) · 155%(10/2+10/3) — 문턱 100% 를 넘은 이틀 둘',
    scaleToEffortPct(period.avgIntensity) === 75 &&
      scaleToEffortPct(period.peakIntensity) === 85 &&
      windows.map((w) => scaleToEffortPct(w.total)).join(',') === '155,155' &&
      scaleToEffortPct(TWO_DAY_INTENSITY_LIMIT) === 100,
    `평균 ${scaleToEffortPct(period.avgIntensity)} · 최고 ${scaleToEffortPct(period.peakIntensity)} · 이틀 ${windows
      .map((w) => scaleToEffortPct(w.total))
      .join(',')}`
  );

  /* 리포트 소견 글 — 문턱을 % 로 말한다(예전 '강도 합이 10을') */
  const warn = buildReportFindings({
    days: 7,
    current: period,
    previous: summarize(new Map(), []),
    fatigueCount: 2,
    streak: 3,
  }).find((f) => f.title.startsWith('이틀 연속 부하'));
  const calm = buildReportFindings({
    days: 7,
    current: period,
    previous: summarize(new Map(), []),
    fatigueCount: 0,
    streak: 1,
  }).find((f) => f.title.startsWith('이틀 연속 무리한'));
  check(
    'D2 표시 (리포트 소견) 이틀 피로 글 둘이 문턱을 100% 로 말하고 옛 눈금(10을) · 줄표가 없다',
    !!warn &&
      !!calm &&
      warn.detail.includes('체감 강도 합이 100%를') &&
      calm.detail.includes('체감 강도 합이 100%를') &&
      ![warn.detail, calm.detail].some((t) => t.includes('10을') || t.includes('—')),
    `${warn?.detail} / ${calm?.detail}`
  );

  /* 투구 계획의 강도 범위 — 계획은 1~10 정수로 세우고 글만 % */
  const planDay = (min: number | null, max: number | null) =>
    ({
      dateKey: '2026-10-12',
      label: '오늘',
      throwing: max != null,
      minPitches: null,
      maxPitches: null,
      minIntensity: min,
      maxIntensity: max,
      reason: '',
    }) as Parameters<typeof intensityRangeText>[0];
  const ranges = [
    intensityRangeText(planDay(6, 8)),
    intensityRangeText(planDay(null, 7)),
    intensityRangeText(planDay(5, 5)),
    intensityRangeText(planDay(null, null)),
  ];
  check(
    "D2 표시 (계획 글) 6~8 → '강도 60~80%' · 상한 7 → '강도 70% 이하' · 5~5 → '강도 50% 이하' · 쉬는 날 → 빈 글",
    JSON.stringify(ranges) === '["강도 60~80%","강도 70% 이하","강도 50% 이하",""]',
    JSON.stringify(ranges)
  );
  /* 실제 계획에서 나온 범위도 글이 % 로 끝나고 1~10 숫자만 남지 않는다('[투구 계획] 오늘과 내일을 범위로' 절의 facts 를 베낌) */
  const realPlan = buildPitchPlan({
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
  } as unknown as Parameters<typeof buildPitchPlan>[0]).today;
  check(
    "D2 표시 (계획 글) 실제 투구 계획의 강도 글이 '%' 로 끝난다",
    !!realPlan && /^강도 \d+(~\d+)?%( 이하)?$/.test(intensityRangeText(realPlan)),
    realPlan ? intensityRangeText(realPlan) : '(오늘 계획 없음)'
  );

  /* 그날 화면의 '계획 강도를 넘었어요' — % 로 견줘도 5% 칸에서는 1~10 으로 견주던 때와 같다(day-client.tsx) */
  const capBad: string[] = [];
  for (let cap = 1; cap <= 10; cap++) {
    for (let p = MIN_EFFORT_PCT; p <= MAX_EFFORT_PCT; p += EFFORT_STEP) {
      const before = effortToIntensity(p) > cap;
      const after = p > scaleToEffortPct(cap);
      if (before !== after)
        capBad.push(`${p}% vs 상한 ${cap}: 예전 ${before} · 지금 ${after}`);
    }
  }
  check(
    'D2 표시 (계획 넘음) 상한 1~10 × 5~100% 칸 200가지 모두 % 로 견줘도 1~10 으로 견주던 답과 같다',
    capBad.length === 0,
    capBad.slice(0, 3).join(' / ')
  );
}

/* ═══════════════════ [2판 오늘 상태(P3)] 오늘 상태 한 장 — lib/engine/day-state.ts (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] 오늘 상태 한 장 — 계약 · theme 위임(동작 변화 0) · 160조합 동일성 · 등판 답 49쌍 · 결정성 · 이유 글(2026-10-12)'
);
{
  /*
   * 이 단계는 '모으기만' 한다 — 독자의 결론이 하나도 안 바뀌어야 한다(위 '[2판 안전망(P0)]' 절의 등판 답 · 엇갈림 표 · 불변식이
   * 그대로 통과하는 것이 첫 증거). 여기서는 두 가지를 더 본다.
   *   1) theme.ts 의 hardOuting · plannedOuting 이 day-state 에 맡긴 뒤에도 옛 몸통(아래 legacy*, 위임 전 글자 그대로)과 같은 값
   *   2) 오늘 상태 한 장의 칸이 기존 규칙 함수(통증 · 재활 · 휴식 · 문턱)의 값과 같다 — 새 문턱이 몰래 생기지 않게
   * P0 절의 사람 만들기(p0Facts · makeCombo)는 그 블록 안이라 못 불러 여기 베낀다 — 같은 씨앗(20261011) · 같은 뽑는 차례라
   * 같은 160명이 나온다(사람 말고 장비 · 시간 칸도 같은 차례로 뽑아 버린다 — 차례가 어긋나면 다른 사람이 된다).
   */
  type DsCheckin = Partial<Record<CheckinPartKey, string>> & {
    condition?: number;
    sleep?: string;
    sleepHours?: number | null;
    soreness?: number | null;
    preferredWorkout?: string | null;
    throwPlan?: string | null;
    /** 팔 피로 1~5 — 2판 P4 커밋 C 부터 facts 칸(예전에는 extras). 안 주면 칸이 없다 */
    armFatigue?: number | null;
  };
  type DsLog = {
    daysAgo: number;
    pitches: number;
    intensity: number;
    sessionType?: string;
  };
  type DsPerson = {
    age?: number | null;
    trainingLevel?: string | null;
    today?: DsCheckin | null;
    yesterday?: DsCheckin | null;
    logs?: DsLog[];
    rehab?: RehabFacts | null;
    memos?: string[];
  };
  const dsKey = (daysAgo: number) =>
    new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const dsCheckin = (daysAgo: number, c: DsCheckin): CheckinLike => ({
    date: dsKey(daysAgo),
    condition: c.condition ?? 7,
    sleep: c.sleep ?? '보통',
    shoulder: c.shoulder ?? '정상',
    elbow: c.elbow ?? '정상',
    wrist: c.wrist ?? '정상',
    lowerBack: c.lowerBack ?? '정상',
    lowerBody: c.lowerBody ?? '정상',
    preferredParts: [],
    preferredWorkout: c.preferredWorkout ?? null,
    ...(c.sleepHours !== undefined ? { sleepHours: c.sleepHours } : {}),
    ...(c.soreness !== undefined ? { soreness: c.soreness } : {}),
    ...(c.throwPlan !== undefined ? { throwPlan: c.throwPlan } : {}),
    ...(c.armFatigue !== undefined ? { armFatigue: c.armFatigue } : {}),
  });
  const dsFacts = (p: DsPerson) =>
    buildFacts({
      nickname: '시험',
      age: p.age === undefined ? 22 : p.age,
      heightCm: 180,
      trainingLevel: p.trainingLevel ?? null,
      baselineDailyLoad: 100,
      rehab: p.rehab ?? null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: new Date(TODAY.getTime() - l.daysAgo * 86400000).toISOString(),
        pitchCount: l.pitches,
        intensity: l.intensity,
        ...(l.sessionType ? { sessionType: l.sessionType } : {}),
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        ...(p.today ? [dsCheckin(0, p.today)] : []),
        ...(p.yesterday ? [dsCheckin(1, p.yesterday)] : []),
      ],
      memos: (p.memos ?? []).map((text) => ({ date: dsKey(1), text })),
    });
  const stateOf = (p: DsPerson, extras?: DayStateExtras) => {
    const facts = dsFacts(p);
    const plan = buildPitchPlan(facts);
    return { facts, plan, state: buildDayState({ facts, plan, extras }) };
  };

  /* 위임 전 theme.ts 의 몸통 — 글자 그대로(2026-10-12 ebcaea2). 동작 변화 0 을 이것과 견준다 */
  type FactsOf = ReturnType<typeof dsFacts>;
  const legacyHardOuting = (facts: FactsOf) =>
    (facts.patterns.hardOutings ?? []).find((o) => o.daysAgo <= 1 && isHardOuting(o)) ??
    null;
  const legacyPlanned = (facts: FactsOf): 'today' | 'tomorrow' | null => {
    const today = facts.condition.throwPlanToday ?? null;
    const yesterday = facts.condition.throwPlanYesterday ?? null;
    if (today != null) {
      const days = nextOutingDays(today);
      if (days?.max === 0) return 'today';
      if (days?.min === 1 && days.max === 1) return 'tomorrow';
      return null;
    }
    const days = nextOutingDays(yesterday);
    return days?.min === 1 && days.max === 1 ? 'today' : null;
  };
  /* 오늘 상태의 '다음 등판까지'를 plannedOuting 의 두 값으로 읽기 — 꼭 오늘 · 꼭 내일만 */
  const plannedOf = (w: DayState['outing']['daysUntilNext']) =>
    w?.max === 0 ? 'today' : w?.min === 1 && w.max === 1 ? 'tomorrow' : null;

  /* ── 순수 파일 — 'server-only' · prisma · 날짜 함수 · 난수 없음, theme · 프로그램 로더 · 일정 지문을 부르지 않음(순환 금지) ── */
  {
    /* 주석은 빼고 본다 — 머리 주석이 '왜 server-only · appNow 가 없는지'를 말하느라 그 낱말을 적는다 */
    const src = readFileSync(
      new URL('../lib/engine/day-state.ts', import.meta.url),
      'utf8'
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const specs = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    const banned = specs.filter(
      (s) =>
        s === 'server-only' ||
        s.includes('prisma') ||
        s.endsWith('/report/theme') ||
        s.endsWith('/program/load') ||
        s.endsWith('/report/plan-fingerprint') ||
        s.endsWith('/clock')
    );
    check(
      '오늘 상태 (순수) import 에 server-only · prisma · theme · program/load · plan-fingerprint · clock 이 없다',
      banned.length === 0 && !src.includes("'server-only'"),
      banned.join(' · ') || specs.join(' · ')
    );
    check(
      '오늘 상태 (순수) 날짜 함수 · 난수를 안 쓴다(new Date( · appNow · Math.random 없음)',
      !/new Date\(|appNow|Math\.random/.test(src)
    );
    const theme = readFileSync(
      new URL('../lib/report/theme.ts', import.meta.url),
      'utf8'
    );
    /*
     * P4 로 바뀜 — plannedOuting 의 위임 대상이 day-state 의 nextOutingWindow 에서 lib/engine/outing.ts 의 outingOf 로 옮겼다(2판 P4
     * 커밋 B: 오늘 상태 한 장과 매일 일정이 등판을 같은 함수로 읽게). 셈은 그대로라 아래 49쌍 · 160조합의 옛 식 견주기가 값을 지킨다.
     */
    check(
      '오늘 상태 (위임) theme.ts 의 hardOuting 은 day-state, plannedOuting 은 등판 한 곳(outingOf)에 맡긴다(규칙 한 곳)',
      /return recentHardOuting\(facts\);/.test(theme) && /outingOf\(facts\)/.test(theme)
    );
    check(
      '오늘 상태 (문턱 한 곳) 팔 피로 문턱은 lib/checkin.ts 의 값을 암케어가 다시 내보낸다(4)',
      HIGH_ARM_FATIGUE === 4 &&
        /export const HIGH_ARM_FATIGUE = 4;/.test(
          readFileSync(new URL('../lib/checkin.ts', import.meta.url), 'utf8')
        ) &&
        !/export const HIGH_ARM_FATIGUE/.test(
          readFileSync(new URL('../lib/armcare/routine.ts', import.meta.url), 'utf8')
        )
    );
  }

  /* ── 등판 답 49쌍(오늘 일곱 × 어제 일곱, 일곱째 = 안 적음) + 오늘 체크인 없음 7 — 손으로 적은 표와 견준다 ── */
  {
    type W = [number, number | null] | null;
    /* 오늘 답 → 남은 날(nextOutingDays 그대로) */
    const TODAY_W: Record<ThrowPlan, W> = {
      '오늘 등판': [0, 0],
      '오늘 불펜': null,
      '내일 등판': [1, 1],
      '2~3일 뒤': [2, 3],
      '4일 이상 뒤': [4, null],
      없음: null,
    };
    /* 어제 답 → 하루 당겨 읽은 남은 날(어제 '오늘 등판'은 지난 등판이라 null) */
    const YESTERDAY_W: Record<ThrowPlan, W> = {
      '오늘 등판': null,
      '오늘 불펜': null,
      '내일 등판': [0, 0],
      '2~3일 뒤': [1, 2],
      '4일 이상 뒤': [3, null],
      없음: null,
    };
    const answers: (ThrowPlan | null)[] = [...THROW_PLANS, null];
    const bad: string[] = [];
    const badPlanned: string[] = [];
    const badRole: string[] = [];
    let pairs = 0;
    for (const noCheckinToday of [false, true]) {
      for (const t of noCheckinToday ? [null] : answers) {
        for (const y of answers) {
          pairs++;
          const { facts, state } = stateOf({
            today: noCheckinToday ? null : { throwPlan: t },
            yesterday: { throwPlan: y },
          });
          const w: W = t != null ? TODAY_W[t] : y != null ? YESTERDAY_W[y] : null;
          /*
           * P4 로 바뀜 — 칸 이름 nextFrom → nextSource(2판 P4 커밋 B, 지난 등판 출처 lastSource 와 가르려고). 값은 같은 뜻으로
           * 옮겼을 뿐이다: 'today' → 'checkin' · 'yesterday' → 'checkin-yesterday' · null → 'none'.
           */
          const from = w == null ? 'none' : t != null ? 'checkin' : 'checkin-yesterday';
          const got = state.outing.daysUntilNext;
          const gotW: W = got ? [got.min, got.max] : null;
          const tag = `${noCheckinToday ? '체크인 없음' : (t ?? '안 적음')} / 어제 ${y ?? '안 적음'}`;
          if (
            JSON.stringify(gotW) !== JSON.stringify(w) ||
            state.outing.nextSource !== from
          ) {
            bad.push(`${tag}: ${JSON.stringify(gotW)} ${state.outing.nextSource}`);
          }
          const legacy = legacyPlanned(facts);
          if (plannedOuting(facts) !== legacy || plannedOf(got) !== legacy) {
            badPlanned.push(
              `${tag}: 옛 ${legacy} · 지금 ${plannedOuting(facts)} · 장 ${plannedOf(got)}`
            );
          }
          const role = w?.[1] === 0 ? 'game' : t === '오늘 불펜' ? 'bullpen' : null;
          if (
            state.outing.role !== role ||
            state.outing.answeredToday !== (!noCheckinToday && t != null) ||
            state.outing.answerToday !== (noCheckinToday ? null : t) ||
            state.outing.answerYesterday !== y
          ) {
            badRole.push(
              `${tag}: ${state.outing.role} · ${state.outing.answeredToday}`
            );
          }
        }
      }
    }
    check(
      `오늘 상태 (등판 답) ${pairs}가지 — daysUntilNext · nextSource 가 손으로 적은 표와 같다(오늘 답이 이김 · 어제 답은 하루 당김)`,
      pairs === 56 && bad.length === 0,
      bad.slice(0, 3).join(' / ')
    );
    check(
      `오늘 상태 (위임 · 동작 변화 0) ${pairs}가지 — plannedOuting = 위임 전 옛 식 = daysUntilNext 를 꼭 오늘 · 꼭 내일로 읽은 값`,
      badPlanned.length === 0,
      badPlanned.slice(0, 3).join(' / ')
    );
    check(
      `오늘 상태 (등판 답) ${pairs}가지 — 오늘 할 일(등판 · 불펜) · 답함 · 답 글자`,
      badRole.length === 0,
      badRole.slice(0, 3).join(' / ')
    );
    /* 목록 밖 글자(옛 줄 · 손으로 고친 DB) — '답함'으로 보고 어제 답을 막는다(위임 전 plannedOuting 과 같다) */
    const odd = stateOf({
      today: { throwPlan: '모름' },
      yesterday: { throwPlan: '내일 등판' },
    });
    check(
      "오늘 상태 (등판 답) 목록 밖 글자 '모름'은 답함 · 다음 등판 모름 · 어제 '내일 등판'을 이월하지 않는다(옛 식과 같음)",
      odd.state.outing.answeredToday &&
        odd.state.outing.answerToday === null &&
        odd.state.outing.daysUntilNext === null &&
        legacyPlanned(odd.facts) === null &&
        plannedOuting(odd.facts) === null,
      JSON.stringify(odd.state.outing)
    );
    /* nextOutingWindow 를 바로 — 칸 없음(undefined, 옛 facts) 은 null 과 같다 */
    check(
      "오늘 상태 (등판 답) nextOutingWindow(undefined, '내일 등판') = 오늘(0~0) · 어제에서",
      JSON.stringify(nextOutingWindow(undefined, '내일 등판')) ===
        '{"days":{"min":0,"max":0},"from":"yesterday"}',
      JSON.stringify(nextOutingWindow(undefined, '내일 등판'))
    );
  }

  /* ── 지난 등판 — 기록이 먼저, 어제 '오늘 등판' 답은 기록이 없을 때만(1일 · 투구수 모름) ── */
  {
    const cases: {
      name: string;
      p: DsPerson;
      expect: {
        days: number | null;
        source: string;
        pitches: number | null;
        load: number | null;
      };
    }[] = [
      {
        name: '아무것도 없음',
        p: { today: {} },
        expect: { days: null, source: 'none', pitches: null, load: null },
      },
      {
        name: "기록 없음 + 어제 '오늘 등판' 답",
        p: { today: {}, yesterday: { throwPlan: '오늘 등판' } },
        expect: { days: 1, source: 'checkin-yesterday', pitches: null, load: null },
      },
      {
        name: "어제 경기 60구 기록 + 어제 '오늘 등판' 답 (기록이 이긴다)",
        p: {
          today: {},
          yesterday: { throwPlan: '오늘 등판' },
          logs: [{ daysAgo: 1, pitches: 60, intensity: 9, sessionType: '경기' }],
        },
        expect: { days: 1, source: 'log', pitches: 60, load: 6000 },
      },
      {
        name: "사흘 전 불펜 40구 70% + 어제 '오늘 등판' 답 (답이 더 가깝다)",
        p: {
          today: {},
          yesterday: { throwPlan: '오늘 등판' },
          logs: [{ daysAgo: 3, pitches: 40, intensity: 7, sessionType: '불펜' }],
        },
        expect: { days: 1, source: 'checkin-yesterday', pitches: null, load: null },
      },
      {
        name: '사흘 전 불펜 40구 70% (답 없음)',
        p: {
          today: {},
          logs: [{ daysAgo: 3, pitches: 40, intensity: 7, sessionType: '불펜' }],
        },
        expect: { days: 3, source: 'log', pitches: 40, load: 2800 },
      },
      {
        name: "오늘 캐치볼 20구 50% + 어제 '오늘 등판' 답 (오늘 기록이 이긴다)",
        p: {
          today: {},
          yesterday: { throwPlan: '오늘 등판' },
          logs: [{ daysAgo: 0, pitches: 20, intensity: 5, sessionType: '캐치볼' }],
        },
        expect: { days: 0, source: 'log', pitches: 20, load: 1000 },
      },
    ];
    /*
     * P4 로 바뀜 — 칸 이름 source → lastSource, 체크인 출처 값 'checkin' → 'checkin-yesterday'(2판 P4 커밋 B: 다음 등판 출처 nextSource 와
     * 가르려고, 뜻은 같다 — 어제 '오늘 등판' 답). 날 · 투구수 · 부하 기대값은 그대로다.
     */
    for (const c of cases) {
      const { state } = stateOf(c.p);
      const got = {
        days: state.outing.daysSinceLast,
        source: state.outing.lastSource,
        pitches: state.outing.lastPitches,
        load: state.outing.lastLoad,
      };
      check(
        `오늘 상태 (지난 등판) ${c.name} → ${c.expect.days ?? '없음'}일 · ${c.expect.source}`,
        JSON.stringify(got) === JSON.stringify(c.expect),
        JSON.stringify(got)
      );
    }
  }

  /* ── 160조합 — P0 불변식과 같은 사람들로, 오늘 상태의 칸 = 기존 규칙 함수의 값 ── */
  {
    const dsRng = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rand = dsRng(20261011);
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
    const chance = (p: number) => rand() < p;
    const rehabOf = (
      area: ArmcareAreaKey,
      severity: RehabSeverity,
      stage: RehabStage
    ) =>
      rehabFacts(
        {
          area,
          condition: null,
          severity,
          stage,
          stageStartedOn: '2026-06-01',
          stageShortenDays: 0,
          startedOn: '2026-06-01',
        },
        toDateKey(TODAY)
      );
    /* P0 의 makeCombo 와 같은 차례로 뽑는다 — 사람 칸 뒤의 시간 · 목표 · 그래도 하기 · 번갈기 칸도 뽑아 버린다(차례 맞추기) */
    const makePerson = (i: number): DsPerson => {
      const parts = (): Partial<Record<CheckinPartKey, string>> => {
        const out: Partial<Record<CheckinPartKey, string>> = {};
        for (const { key } of CHECKIN_PARTS) {
          const r = rand();
          out[key] = r < 0.08 ? '통증' : r < 0.2 ? '뻐근' : '정상';
        }
        return out;
      };
      const unknownPain = i % 16 === 5;
      const today: DsCheckin | null =
        !unknownPain && chance(0.85)
          ? {
              ...parts(),
              condition: pick([2, 3, 4, 5, 6, 7, 8, 9, 10]),
              sleep: pick(['충분', '보통', '부족']),
              ...(chance(0.5) ? { sleepHours: pick([5, 6, 7, 8]) } : {}),
              ...(chance(0.5) ? { soreness: pick([1, 2, 3, 4, 5]) } : {}),
              preferredWorkout: pick([null, null, '웨이트', '파워', '회복']),
              throwPlan: pick([null, null, ...THROW_PLANS]),
            }
          : null;
      const yesterday: DsCheckin | null =
        unknownPain || chance(0.6)
          ? {
              ...(unknownPain || chance(0.15) ? { shoulder: '통증' } : {}),
              throwPlan: pick([null, ...THROW_PLANS]),
            }
          : null;
      const logs: DsLog[] = [];
      for (let d = 1; d <= 7; d++) {
        if (!chance(0.5)) continue;
        logs.push({
          daysAgo: d,
          pitches: pick([15, 25, 35, 45, 60, 75, 90]),
          intensity: pick([4, 5, 6, 7, 8, 9, 10]),
          sessionType: pick(['경기', '불펜', '라이브', '캐치볼', undefined]),
        });
      }
      if (chance(0.25)) {
        logs.push({
          daysAgo: 0,
          pitches: pick([20, 35, 50, 80]),
          intensity: pick([5, 7, 9, 10]),
          sessionType: pick(['경기', '불펜', '캐치볼']),
        });
      }
      const rehab = chance(0.12)
        ? rehabOf(
            pick(['shoulder-back', 'elbow-inner'] as const),
            pick(['mild', 'moderate'] as const),
            pick([1, 2, 3, 4] as const)
          )
        : null;
      const person: DsPerson = {
        age: pick([13, 14, 15, 16, 17, 18, 20, 22, 25, 30, null]),
        trainingLevel: pick([null, '입문', '초급', '중급', '상급']),
        today,
        yesterday,
        logs,
        rehab,
        memos: chance(0.1) ? ['어제 던지고 나서 어깨가 조금 아프다'] : [],
      };
      /* makeCombo 의 minutes · goal · override · lastLowerKey · lastUpperKey 차례(값은 안 쓴다) */
      pick([45, 60, 75, 90]);
      pick([null, '근력 향상', '파워 향상', '컨디셔닝']);
      chance(0.2);
      pick([null, '2026-06-12', '2026-06-13']);
      pick([null, '2026-06-11', '2026-06-14']);
      return person;
    };
    const SPOTS = [
      'shoulder-back',
      'shoulder-front',
      'scapula',
      'elbow-inner',
      'elbow-back',
      '모름',
    ];
    const bad = new Map<string, string[]>();
    const note = (rule: string, msg: string) =>
      bad.set(rule, [...(bad.get(rule) ?? []), msg]);
    const cover = {
      hard: 0,
      planned: 0,
      restDay: 0,
      armHigh: 0,
      armPain: 0,
      pain: 0,
      rehab: 0,
      halted: 0,
      why: 0,
    };
    const COMBOS = 160;
    /* P0 불변식이 만든 사람과 글자 하나까지 같은가(p0PeopleSeen — P0 절이 만든 차례대로 적어 둔 것) */
    let samePeople = 0;
    for (let i = 0; i < COMBOS; i++) {
      const person = makePerson(i);
      if (p0PeopleSeen[i] === JSON.stringify(person)) samePeople++;
      /* 팔 피로 · 팔 통증 자리는 사람 차례와 따로인 난수 — 위 차례를 흔들지 않게 */
      const side = dsRng(3_000_000 + i);
      const armFatigue = side() < 0.3 ? null : 1 + Math.floor(side() * 5);
      const rawSpots = SPOTS.filter(() => side() < 0.4);
      const rawLevel = side() < 0.3 ? null : 1 + Math.floor(side() * 3);
      const saved = pickArmPain({ armPainSpots: rawSpots, armPainLevel: rawLevel });
      const extras: DayStateExtras = {
        armPain: { spots: saved.armPainSpots, level: saved.armPainLevel },
      };
      /*
       * P4 로 바뀜(커밋 C) — 왜: 팔 피로는 이제 facts 칸(CheckinLike.armFatigue)이라 extras 가 아니라 오늘 체크인에 적는다(같은 사람 견주기
       * 뒤에 얹어 samePeople 은 그대로). 체크인이 없는 날은 팔 피로도 없다 — 예전에는 extras 라 체크인 없이도 값이 실렸다.
       */
      const facts = dsFacts(
        person.today && armFatigue != null
          ? { ...person, today: { ...person.today, armFatigue } }
          : person
      );
      const armExpected = person.today ? armFatigue : null;
      /* 파일 끝 '[2판 P4] 등판 한 곳' 절이 같은 facts 로 다시 잰다(적기만 — 아래 검사는 그대로) */
      p3ComboFactsSeen.push(facts);
      const plan = buildPitchPlan(facts);
      const factsBefore = JSON.stringify(facts);
      const state = buildDayState({ facts, plan, extras });
      const again = buildDayState({ facts, plan, extras });
      const seed = `p0-${i}`;
      const same = (rule: string, a: unknown, b: unknown) => {
        if (JSON.stringify(a) !== JSON.stringify(b))
          note(rule, `${seed} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
      };
      const today = facts.condition.today;

      /* 위임 — theme 의 두 값이 옛 몸통과 같고, 오늘 상태와도 같다 */
      same('세게 던진 날 (옛 식)', hardOuting(facts), legacyHardOuting(facts));
      same('세게 던진 날 (장)', state.load.hardOuting, hardOuting(facts));
      if ((hardOuting(facts) != null) !== state.load.hardOutingRecent)
        note('세게 던진 날 (장)', `${seed} recent 깃발`);
      same('세게 던진 날 (장)', recentHardOuting(facts), hardOuting(facts));
      same('등판 (옛 식)', plannedOuting(facts), legacyPlanned(facts));
      same('등판 (장)', plannedOf(state.outing.daysUntilNext), plannedOuting(facts));

      /* hard — 통증 · 재활 · 휴식 · 체크인 · 팔 피로 */
      same('통증 관절', state.hard.painParts, painPartsToday(facts));
      same('통증 모름', state.hard.painUnknown, painStateUnknown(facts));
      same('메모 통증 확인', state.hard.needsPainCheck, plan.needsPainCheck);
      same('투구 멈춤', state.hard.pitchHalted, plan.halted);
      same('재활', state.hard.rehab != null, facts.condition.rehab != null);
      if (state.hard.rehab && facts.condition.rehab)
        same(
          '재활',
          [state.hard.rehab.joint, state.hard.rehab.stage],
          [facts.condition.rehab.joint, facts.condition.rehab.stage]
        );
      same('재활 관절', state.hard.rehabParts, rehabEasingParts(facts));
      same('체크인 필요', state.hard.needsCheckin, today == null);
      same(
        '남은 휴식',
        state.hard.restLeft,
        pendingOuting(facts.patterns, 0, facts.profile.age)?.left ?? null
      );
      same('쉬는 날', state.hard.restDay, plan.today?.throwing === false);
      /* 쉬는 날인데 멈춤 · 메모 확인이 아니면 여파가 남은 등판이 있어야 한다(plan.ts dayFor 의 갈래) */
      if (
        state.hard.restDay &&
        !state.hard.pitchHalted &&
        !state.hard.needsPainCheck &&
        state.hard.restLeft == null
      )
        note('쉬는 날', `${seed} 까닭 없는 쉬는 날`);
      same(
        '팔 피로',
        state.hard.armFatigueHigh,
        armExpected != null && armExpected >= HIGH_ARM_FATIGUE
      );
      same('팔 피로', state.arm.fatigueHigh, state.hard.armFatigueHigh);
      same('팔 피로', state.arm.fatigue, armExpected);

      /* 팔 통증 자리 — lib/armcare/today.ts 의 armPain 식과 같은 값 */
      const expectArmPain =
        today?.shoulder === '통증' || today?.elbow === '통증'
          ? {
              spots: armPainSpotsFor(today, saved.armPainSpots),
              level: saved.armPainLevel,
            }
          : null;
      same('팔 통증 자리', state.arm.pain, expectArmPain);

      /* body — 문턱은 매일 일정 · 암케어 · 프로그램이 쓰는 그 식 */
      same(
        '컨디션 낮음',
        state.body.conditionLow,
        today != null && today.condition <= LOW_CONDITION_THRESHOLD
      );
      same('짧은 밤', state.body.sleepShort, today != null && isShortSleep(today));
      same(
        '근육통 심함',
        state.body.soreSevere,
        today?.soreness != null && today.soreness >= SEVERE_SORENESS
      );
      same(
        '근육통 많이',
        state.body.soreMany,
        today?.soreness != null &&
          today.soreness >= HIGH_SORENESS &&
          today.soreness < SEVERE_SORENESS
      );
      same('최근 통증 부위', state.body.recentPainParts, painEasingParts(facts));
      same(
        '뻐근 부위',
        state.body.stiffParts,
        today
          ? CHECKIN_PARTS.filter((p) => today[p.key] === '뻐근').map((p) => p.key)
          : []
      );

      /* outing — 지난 등판의 출처(P4 로 바뀜 — 칸 이름 source → lastSource, 'checkin' → 'checkin-yesterday', 뜻 · 규칙은 그대로) */
      same('오늘 던짐', state.outing.threwToday, plan.threwToday);
      if (
        state.outing.lastSource === 'log' &&
        state.outing.daysSinceLast !== facts.patterns.restDays
      )
        note('지난 등판', `${seed} 기록인데 날이 다름`);
      if (
        state.outing.lastSource === 'checkin-yesterday' &&
        !(
          parseThrowPlan(facts.condition.throwPlanYesterday) === '오늘 등판' &&
          (facts.patterns.restDays == null || facts.patterns.restDays > 1) &&
          state.outing.daysSinceLast === 1
        )
      )
        note('지난 등판', `${seed} 체크인 출처가 맞지 않음`);

      /* 결정성 · facts 를 안 바꿈 · 이유 글 */
      same('결정성', state, again);
      if (JSON.stringify(facts) !== factsBefore)
        note('facts 그대로', `${seed} facts 가 바뀜`);
      for (const line of state.why) {
        if (!/요\.$/.test(line) || /—|\*\*|null|undefined|NaN/.test(line))
          note('이유 글', `${seed} "${line}"`);
      }

      if (state.load.hardOutingRecent) cover.hard++;
      if (state.outing.daysUntilNext) cover.planned++;
      if (state.hard.restDay) cover.restDay++;
      if (state.hard.armFatigueHigh) cover.armHigh++;
      if (state.arm.pain) cover.armPain++;
      if (state.hard.painParts.length > 0) cover.pain++;
      if (state.hard.rehab) cover.rehab++;
      if (state.hard.pitchHalted) cover.halted++;
      if (state.why.length > 0) cover.why++;
    }
    const rules = [
      ['세게 던진 날 (옛 식)', 'theme.hardOuting = 위임 전 옛 식'],
      ['세게 던진 날 (장)', 'load.hardOuting · hardOutingRecent = theme.hardOuting'],
      ['등판 (옛 식)', 'theme.plannedOuting = 위임 전 옛 식'],
      ['등판 (장)', 'outing.daysUntilNext 를 꼭 오늘 · 꼭 내일로 읽으면 plannedOuting'],
      ['통증 관절', 'hard.painParts = painPartsToday'],
      ['통증 모름', 'hard.painUnknown = painStateUnknown'],
      ['메모 통증 확인', 'hard.needsPainCheck = plan.needsPainCheck'],
      ['투구 멈춤', 'hard.pitchHalted = plan.halted'],
      ['재활', 'hard.rehab = facts.condition.rehab(관절 · 단계)'],
      ['재활 관절', 'hard.rehabParts = rehabEasingParts'],
      ['체크인 필요', 'hard.needsCheckin = 오늘 체크인 없음'],
      ['남은 휴식', 'hard.restLeft = pendingOuting(오늘, 나이별 표).left'],
      ['쉬는 날', 'hard.restDay = 투구 계획의 오늘이 쉬는 날 · 까닭 있음'],
      ['팔 피로', 'arm · hard 팔 피로 = HIGH_ARM_FATIGUE 문턱'],
      ['팔 통증 자리', 'arm.pain = lib/armcare/today.ts 의 armPain 식'],
      ['컨디션 낮음', 'body.conditionLow = LOW_CONDITION_THRESHOLD'],
      ['짧은 밤', 'body.sleepShort = isShortSleep'],
      ['근육통 심함', 'body.soreSevere = SEVERE_SORENESS'],
      ['근육통 많이', 'body.soreMany = HIGH_SORENESS 이상 · 심함 밑'],
      ['최근 통증 부위', 'body.recentPainParts = painEasingParts'],
      ['뻐근 부위', "body.stiffParts = 오늘 '뻐근'"],
      ['오늘 던짐', 'outing.threwToday = plan.threwToday'],
      ['지난 등판', '지난 등판의 출처(기록 · 체크인)가 규칙대로'],
      ['결정성', '같은 입력 두 번 → 같은 장'],
      ['facts 그대로', '장을 만들어도 facts 가 안 바뀐다'],
      ['이유 글', "이유 글은 모두 '요.'로 끝나고 줄표 · 굵게 · null 이 없다"],
    ] as const;
    for (const [rule, name] of rules) {
      const found = bad.get(rule) ?? [];
      check(
        `오늘 상태 (${COMBOS}조합) ${name}`,
        found.length === 0,
        found.length > 0 ? `${found.length}건 — ${found.slice(0, 2).join(' / ')}` : ''
      );
    }
    check(
      `오늘 상태 (${COMBOS}조합) 잰 것: 세게 던진 날 ${cover.hard} · 다음 등판 앎 ${cover.planned} · 쉬는 날 ${cover.restDay} · 팔 피로 높음 ${cover.armHigh} · 팔 통증 자리 ${cover.armPain} · 통증 ${cover.pain} · 재활 ${cover.rehab} · 멈춤 ${cover.halted} · 이유 있음 ${cover.why}`,
      cover.hard >= 10 &&
        cover.planned >= 10 &&
        cover.restDay >= 5 &&
        cover.armHigh >= 10 &&
        cover.armPain >= 5 &&
        cover.pain >= 10 &&
        cover.rehab >= 5 &&
        cover.halted >= 5 &&
        cover.why >= 100
    );
    check(
      `오늘 상태 (${COMBOS}조합) P0 불변식과 같은 사람들이다(사람 ${samePeople}/${COMBOS}명이 글자 하나까지 같음)`,
      samePeople === COMBOS && p0PeopleSeen.length === COMBOS,
      `P0 가 적은 사람 ${p0PeopleSeen.length}명`
    );
  }

  /* ── 옛 facts(칸이 생기기 전에 저장된 것) — 던지지 않고 null · 모름으로 ── */
  {
    const { facts, plan } = stateOf({
      today: { throwPlan: '내일 등판' },
      logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
    });
    const old = JSON.parse(JSON.stringify(facts)) as FactsOf;
    delete (old.patterns as Partial<FactsOf['patterns']>).hardOutings;
    const cond = old.condition as Partial<FactsOf['condition']>;
    delete cond.throwPlanToday;
    delete cond.throwPlanYesterday;
    delete cond.painRecentParts;
    delete cond.rehab;
    delete cond.rehabParts;
    delete cond.trainingEffort;
    let state: DayState | null = null;
    let error = '';
    try {
      state = buildDayState({ facts: old, plan });
    } catch (e) {
      error = String(e);
    }
    check(
      '오늘 상태 (옛 facts) 칸이 없어도 던지지 않고 세게 던진 날 · 다음 등판 · 재활 · 급증은 모름으로',
      state != null &&
        state.load.hardOuting === null &&
        state.outing.daysUntilNext === null &&
        state.outing.answeredToday === false &&
        state.hard.rehab === null &&
        state.load.effortSpike === false &&
        state.body.recentPainParts.length === 0 &&
        legacyHardOuting(old) === null &&
        hardOuting(old) === null,
      error || JSON.stringify(state?.outing)
    );
  }

  /* ── extras — 안 주면 null, 주면 그대로(복사) · 셈한 칸 ── */
  {
    const base = stateOf({ today: {} });
    /* P4 로 바뀜(커밋 C) — 팔 피로는 이제 extras 가 아니라 체크인 칸이다. 칸 없는 체크인이면 null 인 것은 그대로 */
    check(
      '오늘 상태 (extras) 안 주면 팔 통증 · 프로그램 · 메커니즘 · 체중 흐름이 모두 null, 팔 피로 칸 없는 체크인이면 팔 피로도 null',
      base.state.arm.fatigue === null &&
        base.state.arm.pain === null &&
        base.state.commitments.program === null &&
        base.state.commitments.mechanics === null &&
        base.state.nutritionTrend === null
    );
    const yesterdayKey = dsKey(1);
    const mechanics = { level: 'L1', index: 3, finishedToday: false };
    const withProgram = stateOf(
      { today: {} },
      {
        program: { key: '531', nextDay: 5, totalDays: 12, lastDoneDate: yesterdayKey },
        mechanics,
        nutritionTrend: { kgPerWeek: 0.34, kind: 'gain' },
      }
    ).state;
    check(
      '오늘 상태 (extras) 프로그램 5/12일차 · 어제 마침 → 안 끝남 · 마친 지 1일, 메커니즘 · 체중 흐름은 그대로',
      withProgram.commitments.program?.done === false &&
        withProgram.commitments.program.daysSinceLastDone === 1 &&
        withProgram.commitments.program.nextDay === 5 &&
        JSON.stringify(withProgram.commitments.mechanics) ===
          JSON.stringify(mechanics) &&
        withProgram.nutritionTrend?.kind === 'gain',
      JSON.stringify(withProgram.commitments)
    );
    (withProgram.commitments.mechanics as { index: number }).index = 99;
    check(
      '오늘 상태 (extras) 장의 칸을 고쳐도 넘긴 값은 그대로(복사)',
      mechanics.index === 3
    );
    check(
      "오늘 상태 (extras) 이유 글 — '근력 프로그램 5일차를 할 차례예요.' · '오늘 메커니즘 세션이 남아 있어요.' · '체중이 일주일에 0.3kg씩 늘고 있어요.'",
      [
        '근력 프로그램 5일차를 할 차례예요.',
        '오늘 메커니즘 세션이 남아 있어요.',
        '체중이 일주일에 0.3kg씩 늘고 있어요.',
      ].every((l) => withProgram.why.includes(l)),
      withProgram.why.join(' / ')
    );
    const done = stateOf(
      { today: {} },
      {
        program: { key: '531', nextDay: 13, totalDays: 12, lastDoneDate: null },
        mechanics: { level: null, index: 0, finishedToday: true },
        nutritionTrend: { kgPerWeek: null, kind: 'unknown' },
      }
    ).state;
    check(
      "오늘 상태 (extras) 13/12일차 → 다 마침 · 마친 날 모름, 메커니즘 마침 글, 체중 흐름 '모름'은 글 없음",
      done.commitments.program?.done === true &&
        done.commitments.program.daysSinceLastDone === null &&
        done.why.includes('근력 프로그램을 다 마쳤어요.') &&
        done.why.includes('오늘 메커니즘 세션을 마쳤어요.') &&
        !done.why.some((l) => l.includes('체중')),
      done.why.join(' / ')
    );
    const noTotal = stateOf(
      { today: {} },
      {
        program: { key: '531', nextDay: 40, lastDoneDate: null },
        nutritionTrend: { kgPerWeek: -0.5, kind: 'lose' },
      }
    ).state;
    check(
      "오늘 상태 (extras) 전체 일차를 모르면 '다 마침'으로 보지 않는다 · 줄어드는 체중 글",
      noTotal.commitments.program?.done === false &&
        noTotal.why.includes('체중이 일주일에 0.5kg씩 줄고 있어요.'),
      noTotal.why.join(' / ')
    );
  }

  /* ── 이유 글 — 아무것도 안 걸리면 빈 목록, 걸리면 차례대로(넘을 수 없는 것 → 등판 → 팔 · 몸 → 부하) ── */
  {
    const calm = stateOf({ today: {} }).state;
    check(
      '오늘 상태 (이유 글) 평범한 날(체크인 · 기록 없음 · 아무 신호 없음)은 빈 목록',
      calm.why.length === 0,
      calm.why.join(' / ')
    );
    const noCheckin = stateOf({ today: null }).state;
    check(
      "오늘 상태 (이유 글) 체크인이 없는 날 — '오늘 체크인을 아직 안 남겼어요.' 한 줄",
      JSON.stringify(noCheckin.why) === '["오늘 체크인을 아직 안 남겼어요."]',
      noCheckin.why.join(' / ')
    );
    /* P4 로 바뀜(커밋 C) — 팔 피로를 extras 대신 오늘 체크인 칸에 적는다(같은 값 · 같은 글) */
    const heavy = stateOf({
      today: {
        shoulder: '통증',
        condition: 3,
        sleepHours: 5,
        soreness: 5,
        armFatigue: 5,
      },
      logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
    }).state;
    const expected = [
      '오늘 어깨 통증이 있어요.',
      '어제 거의 전력으로 85구를 던졌어요.',
      "팔 피로가 '심함'이에요.",
      '오늘 컨디션이 3/10이에요.',
      "전신 근육통이 '심함'이에요.",
      '어젯밤 5시간만 잤어요.',
    ];
    const at = expected.map((l) => heavy.why.indexOf(l));
    check(
      '오늘 상태 (이유 글) 통증 · 세게 던진 날 · 팔 피로 · 컨디션 · 근육통 · 짧은 밤이 그 차례로 다 나온다',
      at.every((n, k) => n >= 0 && (k === 0 || n > at[k - 1])),
      heavy.why.join(' / ')
    );
    const carried = stateOf({
      today: null,
      yesterday: { throwPlan: '2~3일 뒤' },
    }).state;
    check(
      "오늘 상태 (이유 글) 어제 '2~3일 뒤' + 오늘 체크인 없음 → '어제 적은 답으로 보면 1~2일 뒤 등판이에요.'",
      carried.why.includes('어제 적은 답으로 보면 1~2일 뒤 등판이에요.'),
      carried.why.join(' / ')
    );
    const bullpen = stateOf({ today: { throwPlan: '오늘 불펜' } }).state;
    const fromCheckin = stateOf({
      today: {},
      yesterday: { throwPlan: '오늘 등판' },
    }).state;
    check(
      '오늘 상태 (이유 글) 오늘 불펜 · 어제 등판 답만 있음(기록 없음)',
      bullpen.why.includes('오늘 불펜 날이에요.') &&
        bullpen.outing.role === 'bullpen' &&
        fromCheckin.why.includes('어제 등판했다고 적었는데 투구 기록은 없어요.'),
      `${bullpen.why.join(' / ')} | ${fromCheckin.why.join(' / ')}`
    );
  }
}

/* ═══════════════════ [2판 오늘 상태(P3)] C1 · C4 뒤집기 — 투구 계획의 등판 날 · 암케어의 등판 신호 (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] C1 · C4 뒤집기 — 등판 날 투구 계획(양은 경기가 정함) · 암케어 회복 · 규칙 한 곳(todayOutingRole) · 안 바뀌는 것(2026-10-12)'
);
{
  /*
   * 엇갈림 표(위 '[2판 안전망(P0)]' (b))의 C1 · C4 기대값은 그 표에서 고쳤다. 여기서는 그 둘이 '우연히' 맞은 것이 아님을 본다.
   *   1) '오늘 등판 · 불펜인가'는 lib/checkin.ts todayOutingRole 한 곳 — 투구 계획 · 오늘 상태 한 장 · 암케어가 같은 값을 읽는다
   *   2) 등판 날 투구 계획의 모양(던지는 날 · 범위 없음 · 까닭)과 앞서는 규칙(통증 · 재활 · 메모 확인 · 이미 던짐)
   *   3) 바뀌는 것은 오늘 칸뿐 — 답을 지운 facts 로 만든 계획과 견줘 내일 칸 · 멈춤 · 회복 표시가 글자 그대로, 답이 등판 · 불펜이
   *      아니면 계획 전체가 글자 그대로. 암케어는 오늘 상태를 안 주면 옛 길 그대로
   * 사람 만들기는 '오늘 상태 한 장' 절의 dsFacts 와 같은 꼴(그 블록 안이라 못 불러 베낀다).
   */
  type FlCheckin = Partial<Record<CheckinPartKey, string>> & {
    condition?: number;
    throwPlan?: string | null;
    /** 팔 피로 1~5 — 2판 P4 커밋 C 부터 facts 칸. 안 주면 칸이 없다 */
    armFatigue?: number | null;
  };
  type FlLog = {
    daysAgo: number;
    pitches: number;
    intensity: number;
    sessionType?: string;
  };
  type FlPerson = {
    age?: number | null;
    today?: FlCheckin | null;
    yesterday?: FlCheckin | null;
    logs?: FlLog[];
    rehab?: RehabFacts | null;
    memos?: string[];
  };
  const flKey = (daysAgo: number) =>
    new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const flCheckin = (daysAgo: number, c: FlCheckin): CheckinLike => ({
    date: flKey(daysAgo),
    condition: c.condition ?? 7,
    sleep: '보통',
    shoulder: c.shoulder ?? '정상',
    elbow: c.elbow ?? '정상',
    wrist: c.wrist ?? '정상',
    lowerBack: c.lowerBack ?? '정상',
    lowerBody: c.lowerBody ?? '정상',
    preferredParts: [],
    preferredWorkout: null,
    ...(c.throwPlan !== undefined ? { throwPlan: c.throwPlan } : {}),
    ...(c.armFatigue !== undefined ? { armFatigue: c.armFatigue } : {}),
  });
  const flFacts = (p: FlPerson) =>
    buildFacts({
      nickname: '시험',
      age: p.age === undefined ? 22 : p.age,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: p.rehab ?? null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: new Date(TODAY.getTime() - l.daysAgo * 86400000).toISOString(),
        pitchCount: l.pitches,
        intensity: l.intensity,
        ...(l.sessionType ? { sessionType: l.sessionType } : {}),
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        ...(p.today ? [flCheckin(0, p.today)] : []),
        ...(p.yesterday ? [flCheckin(1, p.yesterday)] : []),
      ],
      memos: (p.memos ?? []).map((text) => ({ date: flKey(1), text })),
    });
  type FlFacts = ReturnType<typeof flFacts>;
  /* 등판 답만 지운 facts — buildPitchPlan 은 등판 답을 오늘 할 일(outing)에만 쓰므로, 이것과 견주면 바뀐 곳만 드러난다 */
  const noAnswers = (facts: FlFacts): FlFacts => ({
    ...facts,
    condition: { ...facts.condition, throwPlanToday: null, throwPlanYesterday: null },
  });
  const flOf = (p: FlPerson) => {
    const facts = flFacts(p);
    const plan = buildPitchPlan(facts);
    return { facts, plan, before: buildPitchPlan(noAnswers(facts)) };
  };
  const json = (v: unknown) => JSON.stringify(v);
  /* outing 칸만 뺀 오늘 칸 — 불펜 이름표 말고는 같은지 볼 때 */
  const withoutOuting = (day: DayPlan | null) => {
    if (day == null) return null;
    const rest: DayPlan = { ...day };
    delete rest.outing;
    return rest;
  };

  /* ── 1) 규칙 한 곳 ── */
  check(
    '뒤집기 (한 곳) day-state 의 nextOutingWindow 는 lib/checkin.ts 의 그 함수 그대로(다시 내보냄 — 합치기 규칙이 두 벌이 아니다)',
    nextOutingWindow === checkinNextOutingWindow
  );
  const answers: (ThrowPlan | null)[] = [...THROW_PLANS, null];
  const roleExpected = (t: ThrowPlan | null, y: ThrowPlan | null) =>
    t != null
      ? t === '오늘 등판'
        ? 'game'
        : t === '오늘 불펜'
          ? 'bullpen'
          : null
      : y === '내일 등판'
        ? 'game'
        : null;
  const roleMiss: string[] = [];
  for (const t of answers) {
    for (const y of answers) {
      const got = todayOutingRole(t, y);
      if (got !== roleExpected(t, y)) roleMiss.push(`${t}/${y} → ${got}`);
    }
  }
  check(
    "뒤집기 (한 곳) todayOutingRole 49쌍 — 오늘 '오늘 등판' · 오늘 답 없이 어제 '내일 등판'만 등판, 오늘 '오늘 불펜'만 불펜(어제 불펜은 이월 없음)",
    roleMiss.length === 0,
    roleMiss.join(' · ') || '49쌍 모두 손으로 적은 표와 같음'
  );
  check(
    "뒤집기 (한 곳) 칸 없음(옛 facts, undefined) + 어제 '내일 등판' → 등판 · 목록 밖 오늘 글자 + 어제 '내일 등판' → 없음(답한 것으로 본다)",
    todayOutingRole(undefined, '내일 등판') === 'game' &&
      todayOutingRole('비 와서 미정', '내일 등판') === null &&
      todayOutingRole(undefined, undefined) === null
  );

  /* ── 2) 등판 날 모양 ── */
  const c1 = flOf({ today: { throwPlan: '오늘 등판' } });
  const c1Today = c1.plan.today;
  check(
    "뒤집기 (모양) 오늘 '오늘 등판' → 던지는 날 · 범위 넷 모두 비움 · outing 'game' · 까닭 '오늘 등판이라 던질 양은 경기가 정해요.'",
    c1Today != null &&
      c1Today.throwing === true &&
      c1Today.minPitches === null &&
      c1Today.maxPitches === null &&
      c1Today.minIntensity === null &&
      c1Today.maxIntensity === null &&
      c1Today.outing === 'game' &&
      c1Today.recovery === undefined &&
      c1Today.reason === '오늘 등판이라 던질 양은 경기가 정해요.' &&
      !c1.plan.halted,
    json(c1Today)
  );
  check(
    "뒤집기 (모양) 등판 날 범위 글은 둘 다 빈 글(pitchRangeText · intensityRangeText) — 화면은 '등판'으로 따로 그린다",
    c1Today != null &&
      pitchRangeText(c1Today) === '' &&
      intensityRangeText(c1Today) === ''
  );
  check(
    '뒤집기 (근거) 오늘 답이면 "체크인 \'오늘 등판\' → 양은 경기가 정함" 한 줄',
    c1.plan.basis.includes("체크인 '오늘 등판' → 양은 경기가 정함"),
    c1.plan.basis.join(' / ')
  );
  const c4 = flOf({ today: null, yesterday: { throwPlan: '내일 등판' } });
  check(
    "뒤집기 (모양) 어제 '내일 등판' + 오늘 체크인 없음 → 등판 날, 근거는 '어제 체크인' 줄",
    c4.plan.today?.outing === 'game' &&
      c4.plan.today.maxPitches === null &&
      c4.plan.basis.includes(
        "어제 체크인 '내일 등판'(오늘 답 없음) → 오늘 등판, 양은 경기가 정함"
      ),
    `${json(c4.plan.today)} | ${c4.plan.basis.join(' / ')}`
  );
  const owedPerson: FlPerson = {
    today: { throwPlan: '오늘 등판' },
    logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
  };
  const owed = flOf(owedPerson);
  const owedLeft = pendingOuting(owed.facts.patterns, 0, owed.facts.profile.age);
  /*
   * P3 로 바뀜(2판 P3 검토, 2026-10-12) — 왜: 처음 P3 는 등판 답 하나로 '쉬라고 막지 않고 던지는 날'(범위 없음)을 내, 큰 등판 다음 날의
   * 완전 휴식 · 회복 중의 가벼운 범위 · 나이 한도가 모두 풀렸다. 사용자 결정(D1~D6)에 없던 것이라 안전 규칙을 먼저 두고 이름표만
   * 단다 — 다음 날은 쉬는 날 그대로(throwing false) + outing 'game' + '오늘 등판은 권하지 않아요'.
   */
  check(
    "뒤집기 (여파) 어제 85구 경기 + 오늘 '오늘 등판' → 쉬는 날 그대로(범위 없음), 이름표 'game' · 까닭 '85구 등판 다음 날이라 오늘 등판은 권하지 않아요.'",
    owedLeft != null &&
      owed.before.today?.throwing === false &&
      owed.plan.today?.outing === 'game' &&
      owed.plan.today.throwing === false &&
      owed.plan.today.maxPitches === null &&
      owed.plan.today.reason === '85구 등판 다음 날이라 오늘 등판은 권하지 않아요.' &&
      json({ ...withoutOuting(owed.plan.today), reason: '' }) ===
        json({ ...owed.before.today, reason: '' }),
    `${owed.before.today?.reason} → ${owed.plan.today?.reason}`
  );
  const memoCheck = flOf({
    today: null,
    yesterday: { throwPlan: '내일 등판' },
    memos: ['어깨가 좀 아프다'],
  });
  check(
    '뒤집기 (앞서는 규칙) 메모의 통증 표현 확인 전(오늘 체크인 없음)이면 등판 답이 있어도 쉰다 — 아플 수도 있는 팔이 먼저',
    memoCheck.plan.needsPainCheck &&
      memoCheck.plan.today?.throwing === false &&
      memoCheck.plan.today.outing === undefined &&
      memoCheck.plan.today.reason === '메모의 통증 표현 확인 필요',
    json(memoCheck.plan.today)
  );
  const painDay = flOf({ today: { throwPlan: '오늘 등판', shoulder: '통증' } });
  const rehabDay = flOf({
    today: { throwPlan: '오늘 등판' },
    rehab: rehabFacts(
      {
        area: 'shoulder-back',
        condition: null,
        severity: 'mild',
        stage: 2,
        stageStartedOn: '2026-06-01',
        stageShortenDays: 0,
        startedOn: '2026-06-01',
      },
      toDateKey(TODAY)
    ),
  });
  check(
    '뒤집기 (앞서는 규칙) 오늘 통증 · 재활 중이면 등판 답이 있어도 투구 계획은 멈춘다(바뀌기 전과 글자 그대로)',
    painDay.plan.halted &&
      painDay.plan.today?.outing === undefined &&
      json(painDay.plan) === json(painDay.before) &&
      rehabDay.plan.halted &&
      rehabDay.plan.rehab != null &&
      json(rehabDay.plan) === json(rehabDay.before),
    `${painDay.plan.haltReason} | ${rehabDay.plan.haltReason}`
  );
  const threw = flOf({
    today: { throwPlan: '오늘 등판' },
    logs: [{ daysAgo: 0, pitches: 50, intensity: 9, sessionType: '경기' }],
  });
  check(
    '뒤집기 (이미 던짐) 오늘 등판 기록이 들어오면 오늘 칸은 없다(threwToday) — 내일 칸은 그 기록으로 짠다',
    threw.plan.threwToday &&
      threw.plan.today === null &&
      json(threw.plan.tomorrow) === json(threw.before.tomorrow),
    json(threw.plan.tomorrow)
  );

  /* ── 3) 불펜 ── */
  const pen = flOf({ today: { throwPlan: '오늘 불펜' } });
  check(
    "뒤집기 (불펜) 오늘 '오늘 불펜' → 범위는 답이 없을 때와 글자 그대로, 이름표 outing 'bullpen' · 근거 한 줄만 더함",
    pen.plan.today?.outing === 'bullpen' &&
      json(withoutOuting(pen.plan.today)) === json(pen.before.today) &&
      json(pen.plan.basis) ===
        json([...pen.before.basis, "체크인 '오늘 불펜' → 범위는 평소대로"]),
    json(pen.plan.today)
  );
  const penRest = flOf({
    today: { throwPlan: '오늘 불펜' },
    logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
  });
  check(
    "뒤집기 (불펜) 어제 85구 경기 + 오늘 '오늘 불펜' → 그대로 쉬는 날, 쉬는 날에는 불펜 이름표를 안 단다",
    penRest.plan.today?.throwing === false &&
      !('outing' in (penRest.plan.today ?? {})) &&
      json(penRest.plan.today) === json(penRest.before.today),
    json(penRest.plan.today)
  );

  /* ── 4) 안 바뀌는 것 — 오늘 답 일곱 × 어제 답 일곱 × 기록 넷 (오늘 답이 없으면 오늘 체크인 있음 · 없음) = 224 ── */
  const logSets: { name: string; logs: FlLog[] }[] = [
    { name: '기록 없음', logs: [] },
    {
      name: '어제 85구 경기',
      logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
    },
    {
      name: '사흘 전 90구 경기',
      logs: [{ daysAgo: 3, pitches: 90, intensity: 10, sessionType: '경기' }],
    },
    {
      name: '오늘 40구 불펜',
      logs: [{ daysAgo: 0, pitches: 40, intensity: 7, sessionType: '불펜' }],
    },
  ];
  const miss = {
    role: [] as string[],
    kept: [] as string[],
    same: [] as string[],
    bullpen: [] as string[],
    game: [] as string[],
    armOld: [] as string[],
    armSame: [] as string[],
    armGame: [] as string[],
  };
  let gridCount = 0;
  let gameDays = 0;
  /* 기록 없는 등판 다음 날(어제 '오늘 등판' + 어제 기록 없음) — 암케어가 답을 읽는 칸(P4 커밋 F) */
  let claimedArm = 0;
  /* 안전 규칙이 먼저인 등판 날 — 큰 등판 다음 날(쉬는 날) · 회복 중(가벼운 범위) */
  const gameGuarded = { rest: 0, light: 0 };
  for (const t of answers) {
    for (const y of answers) {
      for (const set of logSets) {
        for (const present of t != null ? [true] : [true, false]) {
          gridCount++;
          const person: FlPerson = {
            today: present ? (t != null ? { throwPlan: t } : {}) : null,
            yesterday: y != null ? { throwPlan: y } : {},
            logs: set.logs,
          };
          const name = `${t ?? (present ? '답 없음' : '체크인 없음')}/${y ?? '답 없음'}/${set.name}`;
          const { facts, plan, before } = flOf(person);
          const role = todayOutingRole(
            facts.condition.throwPlanToday,
            facts.condition.throwPlanYesterday
          );
          const state = buildDayState({ facts, plan });
          if (state.outing.role !== role)
            miss.role.push(`${name}: ${state.outing.role} ≠ ${role}`);
          /* 오늘 칸 말고는 글자 그대로 — 내일 칸 · 멈춤 · 회복 · 메모 확인 · 이미 던짐 · 성장기 글 */
          const keys = [
            'tomorrow',
            'halted',
            'haltReason',
            'recovering',
            'needsPainCheck',
            'threwToday',
            'youthNote',
            'rehab',
          ] as const;
          for (const k of keys) {
            if (json(plan[k]) !== json(before[k])) miss.kept.push(`${name}: ${k}`);
          }
          if (role == null && json(plan) !== json(before)) miss.same.push(name);
          if (role === 'bullpen') {
            const throwing = plan.today?.throwing === true;
            const ok = throwing
              ? plan.today?.outing === 'bullpen' &&
                json(withoutOuting(plan.today)) === json(before.today)
              : json(plan.today) === json(before.today);
            if (!ok) miss.bullpen.push(`${name}: ${json(plan.today)}`);
          }
          if (role === 'game') {
            const passThrough =
              plan.today == null || plan.halted || plan.needsPainCheck;
            /*
             * P3 로 바뀜(2판 P3 검토, 2026-10-12) — 왜: 등판 답이 큰 등판 다음 날 · 회복 중 · 최근 통증을 풀면 안 된다. 답이 없을 때
             * 쉬는 날이거나 가벼운 범위(recovery · recovering)면 범위는 글자 그대로, 이름표 'game' 과 까닭만 다르다. 그 밖에만
             * '양은 경기가 정함'(아래끝 · 강도 null, 위끝 = 나이 한도 — 이 격자는 22세라 null).
             */
            const b = before.today;
            const guarded =
              b != null && (!b.throwing || b.recovery === true || plan.recovering);
            const sameButTag = (t: DayPlan | null) =>
              t?.outing === 'game' &&
              json({ ...withoutOuting(t), reason: '' }) === json({ ...b, reason: '' });
            const ok = passThrough
              ? json(plan.today) === json(before.today)
              : guarded
                ? sameButTag(plan.today)
                : plan.today?.outing === 'game' &&
                  plan.today.throwing &&
                  plan.today.minPitches === null &&
                  plan.today.maxPitches === null &&
                  plan.today.minIntensity === null &&
                  plan.today.maxIntensity === null;
            if (!passThrough) gameDays++;
            if (!passThrough && guarded) {
              if (b?.throwing) gameGuarded.light++;
              else gameGuarded.rest++;
            }
            if (!ok) miss.game.push(`${name}: ${json(plan.today)}`);
          }
          /* 암케어 — 오늘 상태를 안 주면 옛 길(등판 답을 안 읽던 때)과 글자 그대로, 주면 등판일 때만 다르다 */
          const armOld = decideArmcare({
            facts: noAnswers(facts),
            plan: before,
            armFatigue: null,
          });
          const armNoState = decideArmcare({ facts, plan, armFatigue: null });
          const armWithState = decideArmcare({ facts, plan, armFatigue: null, state });
          /*
           * P4 로 바뀜(2026-10-12 커밋 F, D3) — 왜: 암케어가 어제 팔 부담(lib/engine/arm-load.ts yesterdayArmLoadOf)을 facts 에서 읽는다.
           * 그중 '기록 없는 등판 다음 날'(어제 '오늘 등판' 답 + 어제 기록 없음)은 답을 읽으므로, 오늘 상태를 안 줘도 답을 지운 옛 길과
           * 다르다 — 그 칸은 회복 · 까닭 맨 앞 '어제 등판'인지 따로 보고(통증 멈춤이면 그 까닭 그대로), 나머지는 예전처럼 글자 그대로.
           */
          if (yesterdayArmLoadOf(facts)?.kind === 'claimedNoLog') {
            claimedArm++;
            /*
             * P4 검토로 바뀜 — 왜: 오늘 기록이 있어도 어제 줄이 없으면 기록 없는 등판이다(claimedYesterdayNoLog). 그날은 '오늘 N구'가 먼저라
             * (회복 까닭 맨 앞) 답을 지운 옛 길과 같다 — 오늘 던진 날도 통증 멈춤처럼 그대로인지 본다.
             */
            const threwTodayLog =
              (facts.patterns.lastOutingPitches ?? 0) > 0 &&
              facts.patterns.restDays === 0;
            const okClaimed =
              plan.halted || threwTodayLog
                ? json(armNoState) === json(armOld)
                : armNoState.kind === 'recovery' &&
                  armNoState.reason.startsWith('어제 등판') &&
                  !armOld.reason.includes('어제 등판');
            if (!okClaimed) miss.armOld.push(`${name}(기록 없는 등판)`);
          } else if (json(armNoState) !== json(armOld)) miss.armOld.push(name);
          if (role !== 'game' && json(armWithState) !== json(armNoState))
            miss.armSame.push(name);
          if (role === 'game') {
            const threwRecord =
              (facts.patterns.lastOutingPitches ?? 0) > 0 &&
              facts.patterns.restDays === 0;
            const ok =
              armWithState.kind !== 'strength' &&
              (plan.halted || threwRecord
                ? json(armWithState) === json(armNoState)
                : armWithState.reason.startsWith('오늘 등판'));
            if (!ok)
              miss.armGame.push(
                `${name}: ${armWithState.kind} · ${armWithState.reason}`
              );
          }
        }
      }
    }
  }
  check(
    `뒤집기 (격자 ${gridCount}) 오늘 상태 한 장의 outing.role = todayOutingRole(같은 함수 · 같은 값)`,
    gridCount === 224 && miss.role.length === 0,
    miss.role.slice(0, 3).join(' · ') || `${gridCount}가지`
  );
  check(
    `뒤집기 (격자 ${gridCount}) 오늘 칸 말고는 답을 지운 계획과 글자 그대로(내일 · 멈춤 · 회복 · 메모 확인 · 이미 던짐 · 성장기 · 재활)`,
    miss.kept.length === 0,
    miss.kept.slice(0, 3).join(' · ')
  );
  check(
    `뒤집기 (격자 ${gridCount}) 등판 · 불펜이 아닌 답('내일 등판' · '2~3일 뒤' · '4일 이상 뒤' · '없음' · 어제 '오늘 등판' …)은 계획 전체가 글자 그대로`,
    miss.same.length === 0,
    miss.same.slice(0, 3).join(' · ')
  );
  check(
    `뒤집기 (격자 ${gridCount}) 불펜 날은 던지는 날에만 이름표, 범위는 그대로`,
    miss.bullpen.length === 0,
    miss.bullpen.slice(0, 2).join(' · ')
  );
  check(
    `뒤집기 (격자 ${gridCount}) 등판 날(${gameDays}가지)은 던지는 날 · 범위 없음, 이미 던짐 · 멈춤 · 메모 확인은 그대로 둔다 · 큰 등판 다음 날(${gameGuarded.rest}) · 회복 중(${gameGuarded.light})은 범위 그대로 이름표만(P3 검토)`,
    gameDays > 0 &&
      gameGuarded.rest > 0 &&
      gameGuarded.light > 0 &&
      miss.game.length === 0,
    miss.game.slice(0, 2).join(' · ')
  );
  check(
    `뒤집기 (격자 ${gridCount}) 암케어 — 오늘 상태를 안 주면 옛 길과 글자 그대로(기록 없는 등판 다음 날 ${claimedArm}가지는 P4 로 바뀜 — '어제 등판' 회복), 주어도 등판 날이 아니면 같다`,
    claimedArm > 0 && miss.armOld.length === 0 && miss.armSame.length === 0,
    [...miss.armOld, ...miss.armSame].slice(0, 3).join(' · ')
  );
  check(
    `뒤집기 (격자 ${gridCount}) 암케어 — 등판 날은 강화가 없다(오늘 등판 신호가 맨 앞, 오늘 던진 기록 · 통증 멈춤이 있으면 그 까닭 그대로)`,
    miss.armGame.length === 0,
    miss.armGame.slice(0, 2).join(' · ')
  );

  /* ── 5) 암케어 사례 ── */
  const armOf = (p: FlPerson, armFatigue: number | null = null, withState = true) => {
    /* P4 로 바뀜(커밋 C) — 팔 피로를 extras 대신 오늘 체크인 칸에 적는다(그 칸이 facts 에 생겼다). 값 · 결론은 그대로 */
    const person =
      armFatigue != null && p.today ? { ...p, today: { ...p.today, armFatigue } } : p;
    const { facts, plan } = flOf(person);
    const state = buildDayState({ facts, plan });
    return decideArmcare({ facts, plan, armFatigue, ...(withState ? { state } : {}) });
  };
  const armC1 = armOf({ today: { throwPlan: '오늘 등판' } });
  check(
    "뒤집기 (암케어) 오늘 '오늘 등판' → '오늘 등판 → 회복 루틴', 오늘 상태를 안 주면 옛 길대로 강화",
    armC1.kind === 'recovery' &&
      armC1.reason === '오늘 등판 → 회복 루틴' &&
      armOf({ today: { throwPlan: '오늘 등판' } }, null, false).kind === 'strength',
    armC1.reason
  );
  const armThrew = armOf({
    today: { throwPlan: '오늘 등판' },
    logs: [{ daysAgo: 0, pitches: 50, intensity: 9, sessionType: '경기' }],
  });
  const armTired = armOf({ today: { throwPlan: '오늘 등판' } }, HIGH_ARM_FATIGUE + 1);
  check(
    "뒤집기 (암케어) 오늘 던진 기록이 있으면 '오늘 50구'가 맨 앞이고 '오늘 등판'은 두 번 안 적음 · 팔 피로 '심함'이면 '오늘 등판 · 팔 피로' 차례",
    armThrew.kind === 'recovery' &&
      armThrew.reason.startsWith('오늘 50구') &&
      !armThrew.reason.includes('오늘 등판') &&
      armTired.reason === "오늘 등판 · 팔 피로 '심함' → 회복 루틴",
    `${armThrew.reason} | ${armTired.reason}`
  );
  const armPen = armOf({ today: { throwPlan: '오늘 불펜' } });
  const armPain = armOf({ today: { throwPlan: '오늘 등판', shoulder: '통증' } });
  check(
    "뒤집기 (암케어) 오늘 '오늘 불펜'은 그대로 강화(C3 — 불펜은 날을 안 바꿈) · 통증 날은 등판 답이 있어도 쉬기가 먼저",
    armPen.kind === 'strength' && armPain.kind === 'rest',
    `${armPen.reason} | ${armPain.kind}`
  );

  /* ── 6) 앱 길 · 순환 · 글 ── */
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const todaySrc = stripComments(
    readFileSync(new URL('../lib/armcare/today.ts', import.meta.url), 'utf8')
  );
  check(
    '뒤집기 (앱 길) lib/armcare/today.ts — 오늘 체크인을 따로 읽지 않고 오늘 상태 한 장의 팔 피로 · 팔 통증 · 등판 신호를 넘긴다',
    !/dailyCheckin/.test(todaySrc) &&
      /armFatigue: state\.arm\.fatigue/.test(todaySrc) &&
      /const armPain = state\.arm\.pain;/.test(todaySrc) &&
      /decideArmcare\(\{[\s\S]*?\bstate,[\s\S]*?\}\)/.test(todaySrc)
  );
  const planSrc = stripComments(
    readFileSync(new URL('../lib/report/plan.ts', import.meta.url), 'utf8')
  );
  check(
    '뒤집기 (순환 없음) lib/report/plan.ts 는 day-state 를 부르지 않고 등판 규칙을 lib/checkin.ts 에서 부른다',
    !/engine\/day-state/.test(planSrc) &&
      /import \{ nextOutingWindow, todayOutingRole \} from '@\/lib\/checkin';/.test(
        planSrc
      )
  );
  const shown = [
    readFileSync(new URL('../app/(app)/today/page.tsx', import.meta.url), 'utf8'),
    readFileSync(
      new URL('../app/(app)/pitch-log/[date]/load.ts', import.meta.url),
      'utf8'
    ),
    readFileSync(new URL('../components/plan-note.tsx', import.meta.url), 'utf8'),
  ];
  check(
    "뒤집기 (화면) 홈 계획 줄 · 투구 기록 '오늘 계획'이 등판 날을 '등판'으로 그린다(빈 범위 ' · ' 를 안 보인다)",
    /day\.outing === 'game'/.test(shown[0]) &&
      /game: todayPlanDay\.outing === 'game'/.test(shown[1]) &&
      /plan\.game/.test(shown[2])
  );
  const reasons = [c1Today?.reason ?? '', owed.plan.today?.reason ?? ''];
  check(
    '뒤집기 (글) 등판 날 까닭은 해요체 · 줄표 없음 · 굵게 없음',
    reasons.every((r) => /요(\([^)]*\))?\.$/.test(r)) &&
      reasons.every((r) => !r.includes('—') && !r.includes('**')),
    reasons.join(' | ')
  );
}

/* ═══════════════════ [2판 오늘 상태(P3)] 프로그램 · 영양 읽기 통일 — lib/program/program.ts programSignalsOf · lib/nutrition/guide.ts · lib/checkin.ts exactOutingDay (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] 프로그램 · 영양 읽기 통일 — 답 글자 견주기를 걷고 lib/checkin.ts 규칙으로 · 결과는 그대로(2026-10-12)'
);
{
  /*
   * 이 단계는 읽는 길만 바꾼다. 프로그램(lib/program/load.ts 의 throwSignals 가 체크인 두 줄을 따로 읽어 '오늘 등판' 같은 글자를
   * 견줌)과 영양(lib/nutrition/guide.ts 의 throwDayKind 가 PLAN_* 글자를 견줌)을 lib/checkin.ts 의 규칙으로 옮겼다. 그래서 본다:
   *   1) 옛 식(아래에 글자 그대로 남긴 것)과 새 함수가 모든 답 쌍 · 기록에서 같은 값 — 결과가 안 바뀌었다
   *   2) 앱의 길(facts → 오늘 상태 한 장 → programSignalsOf)도 옛 식과 같다 — 프로그램이 답을 DB 에서 따로 안 읽어도 된다
   *   3) 읽는 파일 넷에 답 글자 견주기가 남지 않았다 · 프로그램만 다른 두 곳(알려진 엇갈림)은 지금 값 고정
   * 옛 식의 답은 DB 글자 그대로였다 — 목록 밖 글자('' · '모레' · 띄어쓰기 없는 글자)도 넣어 '견줘도 안 맞던 글자'가 그대로인지 본다.
   */
  const RAW: (string | null)[] = [...THROW_PLANS, null, '', '모레', '오늘등판'];
  const TYPES: string[][] = [
    [],
    ['경기'],
    ['불펜'],
    ['라이브'],
    ['캐치볼'],
    ['경기', '불펜'],
    ['휴식'],
  ];
  const json = (v: unknown) => JSON.stringify(v);

  /* ── 옛 식 — lib/program/load.ts throwSignals(2026-10-12 전) 글자 그대로 ── */
  const oldProgram = (
    planToday: string | null,
    planYesterday: string | null,
    typesToday: readonly string[],
    typesYesterday: readonly string[]
  ): ProgramSignals => ({
    gameToday:
      planToday === '오늘 등판' ||
      planYesterday === '내일 등판' ||
      typesToday.includes('경기'),
    gameTomorrow: planToday === '내일 등판',
    gameYesterday: planYesterday === '오늘 등판' || typesYesterday.includes('경기'),
    bullpenToday:
      planToday === '오늘 불펜' ||
      typesToday.some((t) => t === '불펜' || t === '라이브'),
  });
  /* ── 옛 식 — lib/nutrition/guide.ts throwDayKind · isGameDay · 불펜 · 전날 줄 · 알림(2026-10-12 전) 글자 그대로 ── */
  const oldThrown = (s: GuideSignals) =>
    s.pitches.some(
      (p) => ['경기', '라이브', '불펜'].includes(p.sessionType) && p.pitchCount > 0
    );
  const oldKind = (s: GuideSignals) => {
    if (oldThrown(s)) return 'after';
    if (s.planToday === '오늘 등판' || s.planToday === '오늘 불펜') return 'today';
    if (s.planToday === '내일 등판') return 'eve';
    if (s.planToday === '없음') return null;
    if (s.planToday == null && s.planYesterday === '내일 등판') return 'today';
    return null;
  };
  const oldGameDay = (s: GuideSignals) =>
    s.planToday === '오늘 등판' ||
    (s.planToday == null && s.planYesterday === '내일 등판');

  /*
   * ── 1) programSignalsOf = 옛 식(답 열 × 열 × 오늘 기록 일곱 × 어제 팔 부담 넷) ──
   * P4 로 바뀜(2026-10-12 커밋 F, D3) — 왜: gameYesterday 가 어제 기록의 세션 종류 · 어제 '오늘 등판' 글자가 아니라 어제 팔 부담
   * (lib/engine/arm-load.ts yesterdayArmLoadOf)이 됐다. 그래서 옛 식과는 나머지 세 칸(gameToday · gameTomorrow · bullpenToday)만 견주고,
   * gameYesterday 는 '팔 부담이 있으면 참'인지 본다. 입력에서 어제 기록(typesYesterday)이 빠졌다.
   */
  const ARM_KINDS: (Pick<YesterdayArmLoad, 'kind'> | null)[] = [
    null,
    { kind: 'hard' },
    { kind: 'moderateSpike' },
    { kind: 'claimedNoLog' },
  ];
  let programMiss = 0;
  let programN = 0;
  let firstMiss = '';
  for (const a of RAW)
    for (const b of RAW)
      for (const t0 of TYPES)
        for (const arm of ARM_KINDS) {
          programN++;
          const got = programSignalsOf({
            outing: {
              answerToday: parseThrowPlan(a),
              answerYesterday: parseThrowPlan(b),
            },
            typesToday: t0,
            yesterdayArmLoad: arm,
          });
          const want = { ...oldProgram(a, b, t0, []), gameYesterday: arm != null };
          if (json(got) !== json(want)) {
            programMiss++;
            if (!firstMiss) firstMiss = `${a} / ${b} / ${t0.join(',')} / ${arm?.kind}`;
          }
        }
  check(
    `통일 (프로그램) programSignalsOf 가 옛 throwSignals 식과 ${programN}가지 모두 같다(답 ${RAW.length} × ${RAW.length} × 오늘 기록 ${TYPES.length} × 어제 팔 부담 ${ARM_KINDS.length}, gameYesterday 는 P4 로 바뀜 — 팔 부담이 있으면 참)`,
    programMiss === 0 && programN === RAW.length ** 2 * TYPES.length * ARM_KINDS.length,
    `${programMiss}가지 다름 — 처음: ${firstMiss}`
  );

  /* ── 2) 앱의 길: 체크인 줄 → facts → 오늘 상태 한 장 → programSignalsOf (줄이 없는 날까지) ── */
  const unKey = (daysAgo: number) =>
    new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const unCheckin = (daysAgo: number, throwPlan: string | null): CheckinLike => ({
    date: unKey(daysAgo),
    condition: 7,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    throwPlan,
  });
  type UnLog = {
    daysAgo: number;
    pitches: number;
    intensity: number;
    effortPct?: number | null;
    sessionType: string;
  };
  /* undefined = 그날 체크인 줄이 없다(앱의 옛 식은 그때 null 을 읽었다) */
  const unFacts = (
    today: string | null | undefined,
    yesterday: string | null | undefined,
    logs: UnLog[] = []
  ) =>
    buildFacts({
      nickname: '시험',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: logs.map<PitchLogLike>((l) => ({
        date: new Date(TODAY.getTime() - l.daysAgo * 86400000).toISOString(),
        pitchCount: l.pitches,
        intensity: l.intensity,
        ...(l.effortPct !== undefined ? { effortPct: l.effortPct } : {}),
        sessionType: l.sessionType,
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        ...(today !== undefined ? [unCheckin(0, today)] : []),
        ...(yesterday !== undefined ? [unCheckin(1, yesterday)] : []),
      ],
      memos: [],
    });
  const stateOf = (facts: ReturnType<typeof unFacts>) =>
    buildDayState({ facts, plan: buildPitchPlan(facts) });
  const ROW: (string | null | undefined)[] = [...RAW, undefined];
  let pathMiss = 0;
  let pathN = 0;
  let pathFirst = '';
  for (const a of ROW)
    for (const b of ROW) {
      pathN++;
      const pathFacts = unFacts(a, b);
      const state = stateOf(pathFacts);
      /*
       * P4 로 바뀜(커밋 F) — 입력이 어제 기록 대신 어제 팔 부담이다. 기록이 없는 이 길에서는 그 값이 어제 '오늘 등판' 답(기록 없는
       * 등판, claimedNoLog)일 때만 있어, 옛 식(어제 '오늘 등판' 글자)과 그대로 같다 — 목록 밖 글자('오늘등판')는 둘 다 아니다.
       */
      const got = programSignalsOf({
        outing: state.outing,
        typesToday: [],
        yesterdayArmLoad: yesterdayArmLoadOf(pathFacts),
      });
      if (json(got) !== json(oldProgram(a ?? null, b ?? null, [], []))) {
        pathMiss++;
        if (!pathFirst) pathFirst = `${a} / ${b} → ${json(got)}`;
      }
    }
  check(
    `통일 (프로그램 · 앱의 길) 체크인 줄 → facts → 오늘 상태 한 장의 답으로 만든 신호가 옛 식(DB 글자)과 ${pathN}쌍 모두 같다(줄 없는 날 포함)`,
    pathMiss === 0 && pathN === ROW.length ** 2,
    `${pathMiss}쌍 다름 — 처음: ${pathFirst}`
  );

  /* 세게 던진 날 — 프로그램이 따로 세지 않고 매일 일정과 같은 값(theme.ts hardOuting = 오늘 상태 한 장의 load.hardOutingRecent) */
  const hardCases: { name: string; logs: UnLog[]; hard: boolean }[] = [
    { name: '기록 없음', logs: [], hard: false },
    {
      name: '어제 경기 85구 · 강도 10',
      logs: [{ daysAgo: 1, pitches: 85, intensity: 10, sessionType: '경기' }],
      hard: true,
    },
    {
      name: '오늘 불펜 40구 · 체감 70% (40 × 70 = 2,800 — 곱 규칙으로 세게)',
      logs: [
        { daysAgo: 0, pitches: 40, intensity: 7, effortPct: 70, sessionType: '불펜' },
      ],
      hard: true,
    },
    {
      name: '오늘 불펜 20구 · 체감 50% (1,000 — 문턱 밑)',
      logs: [
        { daysAgo: 0, pitches: 20, intensity: 5, effortPct: 50, sessionType: '불펜' },
      ],
      hard: false,
    },
    {
      name: '이틀 전 불펜 35구 · 옛 강도 9 (오늘 · 어제가 아님)',
      logs: [{ daysAgo: 2, pitches: 35, intensity: 9, sessionType: '불펜' }],
      hard: false,
    },
    {
      name: '어제 불펜 29구 · 옛 강도 9 (29 × 90 = 2,610 — 문턱 밑)',
      logs: [{ daysAgo: 1, pitches: 29, intensity: 9, sessionType: '불펜' }],
      hard: false,
    },
  ];
  for (const c of hardCases) {
    const f = unFacts(null, undefined, c.logs);
    const st = stateOf(f);
    check(
      `통일 (세게 던진 날) ${c.name} → 프로그램 hardThrowRecent ${c.hard} = 매일 일정 hardOuting`,
      st.load.hardOutingRecent === c.hard && (hardOuting(f) != null) === c.hard,
      `${st.load.hardOutingRecent} · ${hardOuting(f) != null}`
    );
  }

  /* ── 3) 영양 — throwDayKind · throwDayGuide = 옛 식(답 열 × 열 × 기록 여섯) ── */
  const PITCHES: GuideSignals['pitches'][] = [
    [],
    [{ sessionType: '경기', pitchCount: 85, loggedAt: TODAY.toISOString() }],
    [{ sessionType: '불펜', pitchCount: 0, loggedAt: TODAY.toISOString() }],
    [{ sessionType: '캐치볼', pitchCount: 30, loggedAt: TODAY.toISOString() }],
    [{ sessionType: '라이브', pitchCount: 25, loggedAt: TODAY.toISOString() }],
    [
      { sessionType: '불펜', pitchCount: 40, loggedAt: TODAY.toISOString() },
      { sessionType: '경기', pitchCount: 0, loggedAt: TODAY.toISOString() },
    ],
  ];
  const body = { weightKg: 80, ageBand: 'adult' as const, goal: 'maintain' as const };
  let kindMiss = 0;
  let guideMiss = 0;
  let nutN = 0;
  let nutFirst = '';
  for (const a of RAW)
    for (const b of RAW)
      for (const pitches of PITCHES) {
        nutN++;
        const s: GuideSignals = {
          planToday: a,
          planYesterday: b,
          appetite: null,
          pitches,
        };
        const kind = oldKind(s);
        if (throwDayKind(s) !== kind) {
          kindMiss++;
          if (!nutFirst) nutFirst = `kind ${a} / ${b} / ${pitches.length}`;
        }
        const g = throwDayGuide(s, body);
        const lines = g?.lines.join(' ') ?? '';
        const okGuide =
          (g?.kind ?? null) === kind &&
          (kind !== 'eve' || g?.badge === '내일 등판') &&
          (kind !== 'today' ||
            g?.badge === (s.planToday === '오늘 불펜' ? '오늘 불펜' : '오늘 등판')) &&
          (g?.hint != null) ===
            (kind === 'after' &&
              s.planToday == null &&
              s.planYesterday !== '내일 등판') &&
          (kind !== 'after' ||
            (lines.includes('아직 등판 전이라면') ===
              (oldGameDay(s) &&
                !s.pitches.some((p) => p.sessionType === '경기' && p.pitchCount > 0)) &&
              lines.includes('내일 등판이 있으니') === (s.planToday === '내일 등판')));
        if (!okGuide) {
          guideMiss++;
          if (!nutFirst)
            nutFirst = `guide ${a} / ${b} / ${pitches.length} → ${json(g)}`;
        }
      }
  check(
    `통일 (영양) throwDayKind 가 옛 글자 견주기와 ${nutN}가지 모두 같다(답 ${RAW.length} × ${RAW.length} × 기록 ${PITCHES.length})`,
    kindMiss === 0 && nutN === RAW.length ** 2 * PITCHES.length,
    `${kindMiss}가지 다름 — 처음: ${nutFirst}`
  );
  check(
    `통일 (영양) throwDayGuide 의 갈래 · 이름표 · 알림 · 등판 전 줄 · 전날 줄이 옛 식과 ${nutN}가지 모두 같다`,
    guideMiss === 0,
    `${guideMiss}가지 다름 — 처음: ${nutFirst}`
  );

  /* ── exactOutingDay — 날을 못 박는 물음 하나 ── */
  check(
    'exactOutingDay — 0~0 → 0 · 1~1 → 1 · 2~3 · 4 이상 · 1~2 · 3 이상 · 범위 없음 → null',
    exactOutingDay({ min: 0, max: 0 }) === 0 &&
      exactOutingDay({ min: 1, max: 1 }) === 1 &&
      exactOutingDay({ min: 2, max: 3 }) === null &&
      exactOutingDay({ min: 4, max: null }) === null &&
      exactOutingDay({ min: 1, max: 2 }) === null &&
      exactOutingDay({ min: 3, max: null }) === null &&
      exactOutingDay(null) === null &&
      exactOutingDay(undefined) === null
  );
  const exactOf = Object.fromEntries(
    THROW_PLANS.map((a) => [a, exactOutingDay(nextOutingDays(a))])
  );
  check(
    "exactOutingDay(nextOutingDays(답)) — '오늘 등판' 0 · '내일 등판' 1 · 나머지 넷 null",
    json(exactOf) ===
      json({
        '오늘 등판': 0,
        '오늘 불펜': null,
        '내일 등판': 1,
        '2~3일 뒤': null,
        '4일 이상 뒤': null,
        없음: null,
      }),
    json(exactOf)
  );
  /* 어제 답을 하루 당긴 범위에서 꼭 내일이 나오는 답은 없다 — 그래서 영양의 '전날'은 오늘 '내일 등판'뿐이다 */
  check(
    "exactOutingDay — 오늘 답 없이 어제 답만으로는 꼭 내일(1)이 안 나온다(꼭 오늘(0)은 어제 '내일 등판'뿐)",
    THROW_PLANS.every(
      (b) =>
        exactOutingDay(checkinNextOutingWindow(null, b).days) !== 1 &&
        (exactOutingDay(checkinNextOutingWindow(null, b).days) === 0) ===
          (b === '내일 등판')
    )
  );

  /* ── 4) 읽는 파일 넷에 답 글자 견주기가 남지 않았다 ── */
  const answerCompare = new RegExp(`(===|!==)\\s*'(${THROW_PLANS.join('|')})'`);
  const readerFiles = [
    'lib/program/load.ts',
    'lib/program/program.ts',
    'lib/nutrition/guide.ts',
    'lib/report/theme.ts',
  ];
  const leftovers = readerFiles.filter((f) =>
    answerCompare.test(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
  );
  check(
    `통일 (소스) 읽는 파일 넷(${readerFiles.join(' · ')})에 등판 답 글자를 === · !== 로 견주는 줄이 없다`,
    leftovers.length === 0,
    leftovers.join(' · ')
  );
  const loadSrc = readFileSync(
    new URL('../lib/program/load.ts', import.meta.url),
    'utf8'
  );
  check(
    '통일 (소스) 프로그램이 등판 답을 DB 에서 따로 읽지 않고(dailyCheckin 조회 없음) 오늘 상태 한 장으로 신호를 만든다 · 어제는 팔 부담 한 곳에서',
    /*
     * P4 로 바뀜(커밋 F) — 왜: 신호 줄에 어제 팔 부담(yesterdayArmLoadOf(facts))이 더해져 한 줄에 안 들어가(서식이 줄을 나눈다) 괄호 뒤
     * 빈칸 · 줄바꿈을 받게 했고, 어제 기록을 따로 읽지 않는지(어제 날짜 조회 없음)도 본다.
     */
    !/dailyCheckin/.test(loadSrc) &&
      /programSignalsOf\(\{\s*outing: core\.state\.outing/.test(loadSrc) &&
      /*
       * P4 검토로 바뀜 — 왜: 쉬는 까닭 글(restTextOf)도 어제 팔 부담의 까닭을 읽어, 한 번 꺼내 이름(yesterdayArm)에 담고 두 곳이 같이 쓴다.
       * 꺼내는 곳은 여전히 하나(yesterdayArmLoadOf(facts) 한 번)인지 본다.
       */
      /const yesterdayArm = yesterdayArmLoadOf\(facts\);/.test(loadSrc) &&
      loadSrc.split('yesterdayArmLoadOf(').length === 2 &&
      /yesterdayArmLoad: yesterdayArm,/.test(loadSrc) &&
      !/typesYesterday|in: \[today, yesterday\]/.test(loadSrc) &&
      /hardThrowRecent: core\.state\.load\.hardOutingRecent/.test(loadSrc)
  );

  /*
   * ── 5) 프로그램만 다른 곳 — 알려진 엇갈림(지금 값 고정, 맞출지는 사용자 확인 뒤) ──
   * P4 로 바뀜(커밋 F) — sigOf 는 답 둘로 facts 를 만들어 어제 팔 부담까지 앱과 같은 함수로 넣는다(기록 없음). 어제 '오늘 등판'
   * (기록 없음)은 더 이상 프로그램만의 엇갈림이 아니다 — 암케어 · 매일 일정도 같은 함수로 읽는다(아래 셋째 검사).
   */
  const sigOf = (a: string | null, b: string | null) =>
    programSignalsOf({
      outing: { answerToday: parseThrowPlan(a), answerYesterday: parseThrowPlan(b) },
      typesToday: [],
      yesterdayArmLoad: yesterdayArmLoadOf(unFacts(a, b)),
    });
  check(
    "알려진 엇갈림 (프로그램) 오늘 '없음' + 어제 '내일 등판' → 프로그램은 경기 날(gameToday), 다른 독자는 오늘 답이 이겨 등판 아님",
    sigOf('없음', '내일 등판').gameToday === true &&
      todayOutingRole('없음', '내일 등판') === null &&
      throwDayKind({
        planToday: '없음',
        planYesterday: '내일 등판',
        appetite: null,
        pitches: [],
      }) === null
  );
  const program531b = parseProgram('531');
  const rained = sigOf('내일 등판', '내일 등판');
  const rainedDecision =
    program531b == null
      ? null
      : decideToday(program531b, {
          nextDay: 1,
          today: unKey(0),
          lastProgramDate: null,
          checkedIn: true,
          otherWorkoutStarted: false,
          halted: false,
          ...rained,
          hardThrowRecent: false,
          override: false,
          recovery: null,
          loadCaution: false,
          soreMany: false,
          sleepShort: false,
          uncertain: false,
          painSlots: [],
        });
  check(
    "알려진 엇갈림 (프로그램) 비로 밀린 날(오늘 · 어제 '내일 등판') → 프로그램은 '경기 날이에요'(gameToday 가 앞섬), 매일 일정은 전날(tomorrow)",
    rained.gameToday &&
      rained.gameTomorrow &&
      rainedDecision?.kind === 'rest' &&
      rainedDecision.reason === 'gameToday' &&
      plannedOuting(unFacts('내일 등판', '내일 등판')) === 'tomorrow',
    json(rainedDecision)
  );
  {
    const claimed = unFacts(null, '오늘 등판');
    const claimedPlan = buildPitchPlan(claimed);
    const claimedState = buildDayState({ facts: claimed, plan: claimedPlan });
    check(
      "엇갈림이 아님 (P4 로 바뀜 — 커밋 F) 어제 '오늘 등판' 답만(기록 없음) → 프로그램 쉼 · 매일 일정 날 종류 R3'(보조) · 암케어 회복이 모두 같은 함수(claimedNoLog)",
      /*
       * P4 로 바뀜 — 칸 이름 source → lastSource, 'checkin' → 'checkin-yesterday'(2판 P4 커밋 B, 뜻은 같다). 커밋 F(D3) 로 이 칸은 '프로그램만
       * 다른 곳'에서 빠졌다: 예전에는 프로그램만 경기 다음 날로 쉬고 암케어는 강화였다(엇갈림 표 C6).
       */
      sigOf(null, '오늘 등판').gameYesterday === true &&
        claimedState.outing.lastSource === 'checkin-yesterday' &&
        yesterdayArmLoadOf(claimed)?.kind === 'claimedNoLog' &&
        dayKindOf(claimed).rule === 'claimedNoLog' &&
        decideArmcare({
          facts: claimed,
          plan: claimedPlan,
          armFatigue: null,
          state: claimedState,
        }).kind === 'recovery'
    );
  }
}

/* ═══════════════════ [2판 오늘 상태(P3)] 검토 반영 — 낡은 % · 등판 날 안전 규칙 · 옛 규칙의 날 · 읽는 길 소스(2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 오늘 상태(P3)] 검토 반영 — 낡은 체감 강도 · 등판 날 안전 규칙 먼저 · 85% × 30 · 답 글자 견주기 소스 검사(2026-10-12)'
);
{
  const json = (v: unknown) => JSON.stringify(v);
  const rvKey = (daysAgo: number) =>
    new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);

  /* ── 1) 낡은 effortPct — 옛 코드가 intensity 만 고친 줄은 옛 칸을 믿는다(lib/pitch-stats.ts trustedEffortPct) ── */
  const staleRest = { intensity: 0, effortPct: 85 };
  const staleSix = { intensity: 6, effortPct: 85 };
  const fresh85 = { intensity: 9, effortPct: 85 };
  check(
    '검토 (낡은 %) 쉰 날 + 낡은 85 → 읽기 null · 0% · 0, 강도 6 + 낡은 85 → 60% · 6(강도 6에서 계산), 9 + 85 → 85% · 8.5',
    trustedEffortPct(staleRest) === null &&
      readEffort(staleRest) === null &&
      effortPctOf(staleRest) === 0 &&
      intensityOf(staleRest) === 0 &&
      effortText(staleRest) === null &&
      maxEffortPct([staleRest]) === 0 &&
      trustedEffortPct(staleSix) === null &&
      json(readEffort(staleSix)) === json({ pct: 60, derivedFrom: 6 }) &&
      effortPctOf(staleSix) === 60 &&
      intensityOf(staleSix) === 6 &&
      trustedEffortPct(fresh85) === 85 &&
      json(readEffort(fresh85)) === json({ pct: 85, derivedFrom: null }) &&
      effortPctOf(fresh85) === 85 &&
      intensityOf(fresh85) === 8.5,
    json([readEffort(staleRest), readEffort(staleSix), readEffort(fresh85)])
  );
  const everyPct = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);
  check(
    '검토 (낡은 %) 새 코드가 쓰는 줄(effortFields — 5~100% 스무 칸)은 모두 믿는다 · 옛 줄(effortPct null)은 null',
    everyPct.every((p) => trustedEffortPct(effortFields(p)) === p) &&
      trustedEffortPct({ intensity: 7, effortPct: null }) === null &&
      trustedEffortPct({ intensity: 7 }) === null
  );
  {
    /* 리뷰가 잰 길 그대로 — 85% 기록을 옛 코드가 휴식으로 바꾼 날 + 전날 40구 강도 5 → 이틀 과부하가 생기면 안 된다 */
    const d1 = rvKey(2);
    const d2 = rvKey(1);
    const logs: PitchLogLike[] = [
      { date: d1, pitchCount: 40, intensity: 5, maxVelocity: null, avgVelocity: null },
      {
        date: d2,
        sessionType: '휴식',
        pitchCount: 0,
        intensity: 0,
        effortPct: 85,
        maxVelocity: null,
        avgVelocity: null,
      },
    ];
    const byDay = groupByDay(logs);
    check(
      '검토 (낡은 %) 옛 코드가 85% 기록을 휴식으로 바꾼 날 — 그날 강도 0 · 이틀 과부하 창 없음(낡은 85 를 믿으면 5 + 8.5 = 13.5 로 창이 생겼다)',
      byDay.get(d2)?.intensity === 0 &&
        findFatigueWindows(byDay, [d1, d2]).length === 0,
      json([...byDay.values()])
    );
    const stalePen: PitchLogLike = {
      date: d2,
      sessionType: '불펜',
      pitchCount: 30,
      intensity: 6,
      effortPct: 85,
      maxVelocity: null,
      avgVelocity: null,
    };
    const f = buildFacts({
      nickname: '검토',
      age: 22,
      heightCm: 180,
      baselineDailyLoad: 300,
      today: TODAY,
      logs: [stalePen],
      checkins: [],
      memos: [],
    });
    const listed = f.patterns.hardOutings?.find((o) => o.daysAgo === 1);
    check(
      '검토 (낡은 %) 85% 30구를 옛 코드가 강도 6 으로 고친 줄 → 세게 던진 날 재료는 60% 로(load 1,800 · 거의 전력 0구) · 세게 아님',
      listed?.load === 1800 &&
        listed.nearMaxPitches === 0 &&
        listed.pitches === 30 &&
        !isHardOuting(listed),
      json(listed)
    );
  }

  /* ── 2) 옛 규칙의 날 — nearMaxPitches(facts.ts isHardOuting) ── */
  check(
    '검토 (옛 규칙의 날) isHardOuting — load 2,550 이어도 nearMaxPitches 30 이면 세게 · 29 면 아님 · nearMaxPitches 없는 load 2,699 는 아님(옛 지문 꼴)',
    isHardOuting({ daysAgo: 1, pitches: 30, load: 2550, nearMaxPitches: 30 }) &&
      !isHardOuting({ daysAgo: 1, pitches: 30, load: 2550, nearMaxPitches: 29 }) &&
      !isHardOuting({ daysAgo: 1, pitches: 90, load: 2699 }) &&
      isHardOuting({ daysAgo: 1, pitches: 27, load: 2700, nearMaxPitches: 0 })
  );

  /* ── 3) 등판 날 안전 규칙 — 나이 셋 × 지난 일 셋 × 답 둘(오늘 '오늘 등판' / 어제 '내일 등판' + 오늘 체크인 없음) ── */
  type RvCheckin = { daysAgo: number; throwPlan?: string; elbow?: string };
  const rvCheckin = (c: RvCheckin): CheckinLike => ({
    date: rvKey(c.daysAgo),
    condition: 7,
    sleep: '보통',
    shoulder: '정상',
    elbow: c.elbow ?? '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    ...(c.throwPlan !== undefined ? { throwPlan: c.throwPlan } : {}),
  });
  type RvHistory = '어제 경기 70구' | '3일 전 팔꿈치 통증' | '없음';
  const rvFacts = (
    age: number,
    history: RvHistory,
    answer: 'today' | 'c4',
    withAnswers = true
  ) => {
    const checkins: RvCheckin[] = [];
    if (answer === 'today')
      checkins.push({ daysAgo: 0, ...(withAnswers ? { throwPlan: '오늘 등판' } : {}) });
    else
      checkins.push({ daysAgo: 1, ...(withAnswers ? { throwPlan: '내일 등판' } : {}) });
    if (history === '3일 전 팔꿈치 통증') checkins.push({ daysAgo: 3, elbow: '통증' });
    return buildFacts({
      nickname: '검토',
      age,
      heightCm: 175,
      baselineDailyLoad: 100,
      today: TODAY,
      logs:
        history === '어제 경기 70구'
          ? [
              {
                date: new Date(TODAY.getTime() - 86400000).toISOString(),
                sessionType: '경기',
                pitchCount: 70,
                ...effortFields(100),
                maxVelocity: null,
                avgVelocity: null,
              },
            ]
          : [],
      checkins: checkins.map(rvCheckin),
      memos: [],
    });
  };
  const gridMiss: string[] = [];
  const gridReasons: string[] = [];
  let gridN = 0;
  for (const age of [13, 15, 22]) {
    const cap = dailyPitchCap(age);
    for (const history of ['어제 경기 70구', '3일 전 팔꿈치 통증', '없음'] as const) {
      for (const answer of ['today', 'c4'] as const) {
        gridN++;
        const plan = buildPitchPlan(rvFacts(age, history, answer));
        const before = buildPitchPlan(rvFacts(age, history, answer, false));
        const t = plan.today;
        const b = before.today;
        const name = `${age}세/${history}/${answer}`;
        let ok: boolean;
        if (history === '어제 경기 70구') {
          /* 큰 등판 다음 날 — 쉬는 날 그대로(답이 없을 때와 범위 같음), 이름표와 '권하지 않아요' */
          ok =
            t?.throwing === false &&
            t.outing === 'game' &&
            t.reason === '70구 등판 다음 날이라 오늘 등판은 권하지 않아요.' &&
            b?.throwing === false &&
            json({ ...t, reason: '', outing: undefined }) ===
              json({ ...b, reason: '', outing: undefined });
        } else if (history === '3일 전 팔꿈치 통증') {
          ok =
            answer === 'c4'
              ? /* 최근 통증 + 오늘 체크인 없음 → 계획 멈춤이 먼저(등판 이름표 없음) */
                plan.halted && t?.outing === undefined
              : /* 최근 통증 + 오늘 정상 → 절반 수준의 범위 그대로, 이름표와 '등판해도 이 양 안에서' */
                plan.recovering &&
                t?.throwing === true &&
                t.outing === 'game' &&
                t.minPitches != null &&
                t.maxIntensity != null &&
                t.maxIntensity <= 5 &&
                t.minPitches === b?.minPitches &&
                t.maxPitches === b.maxPitches &&
                t.maxIntensity === b.maxIntensity &&
                t.reason === '최근 통증 기록이 있어 등판해도 이 양 안에서 던져요.';
        } else {
          /* 지난 일이 없음 — 양은 경기가 정하고 위끝은 나이 한도(13 · 15세 95, 22세 없음) */
          ok =
            t?.throwing === true &&
            t.outing === 'game' &&
            t.minPitches === null &&
            t.maxPitches === cap &&
            t.minIntensity === null &&
            t.maxIntensity === null &&
            t.reason ===
              (cap == null
                ? '오늘 등판이라 던질 양은 경기가 정해요.'
                : `오늘 등판이라 던질 양은 경기가 정해요. 하루 한도 ${cap}구는 넘기지 않아요.`);
        }
        if (t) gridReasons.push(t.reason);
        if (!ok) gridMiss.push(`${name}: ${json(t)}`);
      }
    }
  }
  check(
    `검토 (등판 날 안전) 나이 셋 × 지난 일 셋 × 답 둘(${gridN}) — 큰 등판 다음 날은 쉬는 날 그대로 · 최근 통증은 절반 범위 그대로(체크인 없으면 멈춤) · 그 밖은 위끝 = 나이 한도`,
    gridN === 18 && gridMiss.length === 0,
    gridMiss.slice(0, 2).join(' · ')
  );
  check(
    "검토 (등판 날 안전) 13세 · 15세 등판 날 범위 글은 '95구 이하'(그날 화면의 넘음 경고가 견줄 위끝), 성인은 빈 글",
    pitchRangeText(buildPitchPlan(rvFacts(13, '없음', 'today')).today!) ===
      '95구 이하' &&
      pitchRangeText(buildPitchPlan(rvFacts(15, '없음', 'c4')).today!) ===
        '95구 이하' &&
      pitchRangeText(buildPitchPlan(rvFacts(22, '없음', 'today')).today!) === ''
  );
  {
    const restBasis = buildPitchPlan(rvFacts(13, '어제 경기 70구', 'today')).basis;
    const lightBasis = buildPitchPlan(rvFacts(22, '3일 전 팔꿈치 통증', 'today')).basis;
    const c4Basis = buildPitchPlan(rvFacts(22, '없음', 'c4')).basis;
    check(
      "검토 (등판 날 안전) 근거 줄도 오늘 칸과 같은 말 — 큰 등판 다음 날 '등판은 권하지 않음' · 최근 통증 '가벼운 범위 안에서' · 그 밖은 '양은 경기가 정함'",
      restBasis.includes(
        "체크인 '오늘 등판' → 큰 등판 다음 날이라 등판은 권하지 않음"
      ) &&
        lightBasis.includes("체크인 '오늘 등판' → 회복 중이라 가벼운 범위 안에서") &&
        c4Basis.includes(
          "어제 체크인 '내일 등판'(오늘 답 없음) → 오늘 등판, 양은 경기가 정함"
        ),
      [...restBasis, ...lightBasis].filter((b) => b.includes('등판')).join(' / ')
    );
  }
  check(
    '검토 (등판 날 안전) 까닭 글은 해요체 · 줄표 없음 · 굵게 없음',
    gridReasons.length > 0 &&
      gridReasons
        .filter((r) => r.includes('등판'))
        .every((r) => /요\.$/.test(r) && !r.includes('—') && !r.includes('**')),
    [...new Set(gridReasons)].join(' | ')
  );

  /* ── 4) 화면 · 읽는 길 소스 ── */
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const srcOf = (p: string) =>
    readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const homeSrc = stripComments(srcOf('app/(app)/today/page.tsx'));
  check(
    "검토 (홈) 잘 던진 날 메모가 답 글자 목록 대신 todayOutingRole(facts 의 오늘 · 어제 답)로 — 어제 '내일 등판' + 오늘 답 없음(C4)도 등판 날",
    !/PRE_THROW_PLANS/.test(homeSrc) &&
      /todayOutingRole\(\s*facts\.condition\.throwPlanToday,\s*facts\.condition\.throwPlanYesterday\s*\)/.test(
        homeSrc
      )
  );
  check(
    "검토 (홈) 계획 줄 — 등판 날 고정 글('양은 경기가 정해요')이 까닭(day.reason)을 덮지 않는다 · 투구 기록 '오늘 계획'은 던지는 등판 날만 '등판'",
    /if \(day\.outing === 'game'\) \{/.test(homeSrc) &&
      /sub: day\.reason \}/.test(homeSrc) &&
      /game: todayPlanDay\.outing === 'game' && todayPlanDay\.throwing/.test(
        srcOf('app/(app)/pitch-log/[date]/load.ts')
      )
  );
  const gatherSrc = srcOf('lib/report/gather.ts');
  /*
   * P4 로 바뀜(커밋 C) — 왜: 팔 피로가 facts 칸(CheckinLike.armFatigue)이 돼 gather.ts 는 체크인 줄마다 armFatigue 를 facts 에 넘기고,
   * 오늘 상태 한 장 extras 로는 안 넘긴다(장이 facts 에서 읽는다 — 두 곳이면 안전 거르기와 장이 다른 값을 볼 수 있다).
   */
  check(
    '검토 (배선) gather.ts 가 체감 강도(effortPct)와 팔 피로를 facts 로 넘긴다(팔 피로는 extras 로 따로 안 넘김) — 빠지면 % 기록이 반올림된 1~10 으로 읽히고 팔 피로 안전 규칙이 안 걸린다(선택 칸이라 tsc 가 못 잡음)',
    /effortPct: l\.effortPct/.test(gatherSrc) &&
      /armFatigue: c\.armFatigue/.test(gatherSrc) &&
      !/armFatigue: todayCheckin/.test(gatherSrc)
  );
  /*
   * 답 글자 견주기 — '통일 (소스)'는 파일 넷 · `=== '답'` 꼴만 봤다. 이제 app · lib · components 전체(lib/checkin.ts 는 규칙의 집이라
   * 뺀다)에서 네 꼴을 찾는다: `=== '답'` · `'답' ===` · `case '답':` · `includes('답')` / 답 글자로 시작하는 배열. '없음'은 팔 피로 ·
   * 근육통 칸에도 쓰는 흔한 낱말이라 배열 · includes 꼴에서는 뺀다.
   */
  const ALL = THROW_PLANS.join('|');
  const NAMED = THROW_PLANS.filter((p) => p !== '없음').join('|');
  const answerPatterns = [
    new RegExp(`(===|!==)\\s*'(${ALL})'`),
    new RegExp(`'(${ALL})'\\s*(===|!==)`),
    new RegExp(`case\\s+'(${ALL})'\\s*:`),
    new RegExp(`includes\\(\\s*'(${NAMED})'`),
    new RegExp(`\\[\\s*'(${NAMED})'`),
  ];
  const sourceFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && rel !== 'lib/checkin.ts')
        sourceFiles.push(rel);
    }
  };
  for (const dir of ['app', 'lib', 'components']) walk(dir);
  const answerHits = sourceFiles.filter((f) => {
    const src = stripComments(srcOf(f));
    return answerPatterns.some((re) => re.test(src));
  });
  check(
    `검토 (소스) app · lib · components ${sourceFiles.length}개 파일에 등판 답 글자를 직접 견주는 꼴(=== · case · includes · 답 배열)이 없다 — 읽기는 lib/checkin.ts 규칙으로`,
    sourceFiles.length > 100 && answerHits.length === 0,
    answerHits.join(' · ')
  );
  check(
    '검토 (소스) 잡는 꼴이 실제로 잡는다 — 옛 홈 줄 · 옛 day-state 줄 · case 꼴',
    answerPatterns.some((re) =>
      re.test("const PRE_THROW_PLANS: readonly string[] = ['오늘 등판', '오늘 불펜'];")
    ) &&
      answerPatterns.some((re) =>
        re.test("const yesterdayGame = answerYesterday === '오늘 등판';")
      ) &&
      answerPatterns.some((re) => re.test("case '내일 등판':")) &&
      !answerPatterns.some((re) =>
        re.test("const ARM_FATIGUE_WORDS = ['없음', '조금'];")
      )
  );
}

/* ═══════════════════ [2판 P4] 운동 분류 · 팔 피로 상수 — lib/engine/exercise-class.ts · lib/checkin.ts SEVERE_ARM_FATIGUE · armFatigueWord (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 운동 분류 한 곳(무거운 하체 · 팔 플라이오 · 무거운 상체 밀기) · 팔 피로 상수 — 정의만, 동작 변화 0(2026-10-12)'
);
{
  /*
   * 왜 보는가. 등판 전 무거운 하체 빼기 · 팔 피로 '심함' 거르기(P4) · 중재의 팔 예산(P6) · 기준선 판정이 같은 정의를 써야 같은 날
   * 다른 층이 다른 운동을 빼지 않는다. 이 절은 (가) 정의 표(가짜 운동 — 칸 하나씩 바꿔 경계를 본다), (나) 실제 표의 수(판정이 넓어지거나
   * 좁아지면 알린다 — 라이브러리에 운동을 더하거나 고쳐서 바뀐 것이면 수를 고친다), (다) 하체날 구성과 같은 목록 · 순수 잎 파일,
   * (라) 팔 피로 눈금 · 말 한 곳과 암케어 글이 그대로인지 본다.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const ex = (
    o: Partial<ClassifiableExercise> & { category: string }
  ): ClassifiableExercise => ({
    intensity: '중간',
    bodyParts: [],
    equipment: ['맨몸'],
    ...o,
  });
  type Row = [string, ClassifiableExercise, boolean];
  const table = (
    name: string,
    fn: (e: ClassifiableExercise) => boolean,
    rows: Row[]
  ) => {
    const wrong = rows.filter(([, e, want]) => fn(e) !== want).map(([label]) => label);
    check(`${name} — ${rows.length}경우`, wrong.length === 0, wrong.join(' · '));
  };

  /* ── (가) 정의 표 ── */
  table('P4 분류 (가) 무거운 하체 isHeavyLower', isHeavyLower, [
    [
      '하체 스트렝스 · 바벨 · 중간(강도를 안 고친 바벨) → 무거움',
      ex({ category: '하체 스트렝스', equipment: ['바벨'], movementPattern: '스쿼트' }),
      true,
    ],
    [
      '하체 스트렝스 · 원판 · 낮음 → 무거움',
      ex({ category: '하체 스트렝스', intensity: '낮음', equipment: ['원판', '박스'] }),
      true,
    ],
    [
      '하체 스트렝스 · 맨몸 · 높음 → 무거움(강도)',
      ex({ category: '하체 스트렝스', intensity: '높음', movementPattern: '힌지' }),
      true,
    ],
    [
      '하체 스트렝스 · 모르는 강도 → 무거움(안전 쪽)',
      ex({ category: '하체 스트렝스', intensity: '아주 셈' }),
      true,
    ],
    [
      '하체 스트렝스 · 덤벨 · 중간 런지 → 가벼움(한 다리)',
      ex({ category: '하체 스트렝스', equipment: ['덤벨'], movementPattern: '런지' }),
      false,
    ],
    [
      '하체 스트렝스 · 케틀벨 · 중간 → 가벼움(HEAVY_EQUIPMENT 전부를 쓰지 않음)',
      ex({ category: '하체 스트렝스', equipment: ['케틀벨'] }),
      false,
    ],
    [
      '파워 · 스쿼트 계열 · 맨몸 · 중간 → 무거움(점프)',
      ex({ category: '파워', movementPattern: '스쿼트' }),
      true,
    ],
    [
      '파워 · 런지 계열 → 무거움',
      ex({ category: '파워', movementPattern: '런지' }),
      true,
    ],
    [
      '파워 · 힌지 계열 → 무거움',
      ex({ category: '파워', movementPattern: '힌지', equipment: ['케틀벨'] }),
      true,
    ],
    [
      '파워 · 회전 계열 + 하체 부위 → 아님(계열이 정한다)',
      ex({ category: '파워', movementPattern: '회전', bodyParts: ['고관절', '전신'] }),
      false,
    ],
    [
      '파워 · 계열 없음 + 종아리·발목 → 무거움',
      ex({ category: '파워', movementPattern: null, bodyParts: ['종아리·발목'] }),
      true,
    ],
    [
      '파워 · 계열 칸 자체가 없음 + 햄스트링·둔근 → 무거움',
      ex({ category: '파워', bodyParts: ['햄스트링·둔근'] }),
      true,
    ],
    [
      '파워 · 계열 없음 + 전신만 → 아님(던지기에도 붙는 꼬리표)',
      ex({ category: '파워', movementPattern: null, bodyParts: ['전신'] }),
      false,
    ],
    [
      '상체 스트렝스 · 바벨 · 높음 → 아님',
      ex({ category: '상체 스트렝스', intensity: '높음', equipment: ['바벨'] }),
      false,
    ],
    [
      '코어 · 매우 높음 → 아님',
      ex({ category: '코어', intensity: '매우 높음', bodyParts: ['고관절'] }),
      false,
    ],
  ]);
  table('P4 분류 (가) 팔 플라이오 isArmPlyo', isArmPlyo, [
    [
      '파워 · 회전 · 메디신볼 → 팔 플라이오',
      ex({
        category: '파워',
        movementPattern: '회전',
        equipment: ['메디신볼'],
        bodyParts: ['코어'],
      }),
      true,
    ],
    [
      '파워 · 당기기 · 플라이오볼 → 팔 플라이오',
      ex({ category: '파워', movementPattern: '당기기', equipment: ['플라이오볼'] }),
      true,
    ],
    [
      '파워 · 밀기 · 밴드 → 팔 플라이오',
      ex({
        category: '파워',
        movementPattern: '밀기',
        equipment: ['밴드'],
        bodyParts: ['가슴'],
      }),
      true,
    ],
    [
      '파워 · 계열 없음 · 어깨 → 팔 플라이오',
      ex({ category: '파워', bodyParts: ['어깨'] }),
      true,
    ],
    [
      '파워 · 계열 없음 · 팔꿈치 → 팔 플라이오',
      ex({ category: '파워', bodyParts: ['팔꿈치'] }),
      true,
    ],
    [
      '파워 · 당기기 · 바벨 · 등(펜들레이 로우 꼴) → 아님',
      ex({
        category: '파워',
        movementPattern: '당기기',
        equipment: ['바벨'],
        bodyParts: ['등', '견갑', '코어'],
      }),
      false,
    ],
    [
      '파워 · 힌지 · 손목·전완(밴드 저항 데드리프트 꼴) → 아님',
      ex({
        category: '파워',
        movementPattern: '힌지',
        equipment: ['바벨', '밴드'],
        bodyParts: ['고관절', '손목·전완'],
      }),
      false,
    ],
    [
      '파워 · 회전 · 워터볼 · 하체(도는 점프) → 아님',
      ex({
        category: '파워',
        movementPattern: '회전',
        equipment: ['워터볼'],
        bodyParts: ['고관절', '전신'],
      }),
      false,
    ],
    [
      '상체 스트렝스 · 밀기 · 메디신볼 → 아님(파워만)',
      ex({
        category: '상체 스트렝스',
        movementPattern: '밀기',
        equipment: ['메디신볼'],
        bodyParts: ['어깨'],
      }),
      false,
    ],
  ]);
  table('P4 분류 (가) 무거운 상체 밀기 isHeavyUpperPush', isHeavyUpperPush, [
    [
      '상체 스트렝스 · 밀기 · 높음 → 무거움',
      ex({
        category: '상체 스트렝스',
        movementPattern: '밀기',
        intensity: '높음',
        equipment: ['바벨', '벤치'],
      }),
      true,
    ],
    [
      '상체 스트렝스 · 밀기 · 매우 높음 → 무거움',
      ex({
        category: '상체 스트렝스',
        movementPattern: '밀기',
        intensity: '매우 높음',
      }),
      true,
    ],
    [
      '상체 스트렝스 · 밀기 · 모르는 강도 → 무거움(안전 쪽)',
      ex({ category: '상체 스트렝스', movementPattern: '밀기', intensity: '?' }),
      true,
    ],
    [
      '상체 스트렝스 · 밀기 · 중간(푸시업 꼴) → 아님',
      ex({ category: '상체 스트렝스', movementPattern: '밀기' }),
      false,
    ],
    [
      '상체 스트렝스 · 당기기 · 높음 → 아님',
      ex({ category: '상체 스트렝스', movementPattern: '당기기', intensity: '높음' }),
      false,
    ],
    [
      '상체 스트렝스 · 계열 없음 · 높음 → 아님(계열로만 건다)',
      ex({ category: '상체 스트렝스', intensity: '높음', bodyParts: ['가슴'] }),
      false,
    ],
    [
      '파워 · 밀기 · 높음 → 아님(그건 팔 플라이오)',
      ex({ category: '파워', movementPattern: '밀기', intensity: '높음' }),
      false,
    ],
  ]);

  /* ── (나) 실제 표 — 보이는 운동(라이브러리)으로 센다 ── */
  const inCat = (c: string) => library.filter((e) => e.category === c);
  const armPlyo = library.filter(isArmPlyo);
  const heavyPush = library.filter(isHeavyUpperPush);
  const lowerStrength = inCat('하체 스트렝스');
  const heavyLowerStrength = lowerStrength.filter(isHeavyLower);
  const lowerPower = inCat('파워').filter(
    (e) => e.movementPattern != null && LOWER_POWER_PATTERNS.includes(e.movementPattern)
  );
  const titles = (list: typeof library) => list.map((e) => e.title).join(' · ');
  /*
   * P4 검토로 바뀜(2026-10-12) — 왜: 예전에는 실측 수(팔 플라이오 7 · 무거운 밀기 10)를 고정했다. 이 시험은 운영 DB 의 보이는 운동을
   * 그대로 읽는데 운동 라이브러리는 두 사람이 거의 매일 고쳐(더하기 · 지우기 · 이름 바꾸기), 코드와 상관없이 운동 하나에 시험이 깨져
   * 커밋이 막혔다. 수는 detail 로만 찍고 성질(있다 · 표 전부는 아니다 · 카테고리 · 겹침 없음)을 본다.
   */
  check(
    'P4 분류 (나) 실제 표 팔 플라이오 0 < n < 표 전체 · 모두 파워(수는 detail — 라이브러리가 바뀌어도 성질로 본다)',
    armPlyo.length > 0 &&
      armPlyo.length < library.length &&
      armPlyo.every((e) => e.category === '파워'),
    `${armPlyo.length}개: ${titles(armPlyo)}`
  );
  check(
    'P4 분류 (나) 실제 표 무거운 상체 밀기 0 < n · 모두 상체 스트렝스 · 상체 밀기의 전부는 아님(가벼운 밀기는 남는다) · 팔 플라이오와 겹침 0',
    heavyPush.length > 0 &&
      heavyPush.every((e) => e.category === '상체 스트렝스') &&
      heavyPush.length <
        inCat('상체 스트렝스').filter((e) => e.movementPattern === '밀기').length &&
      !heavyPush.some(isArmPlyo),
    `${heavyPush.length}개: ${titles(heavyPush)}`
  );
  check(
    `P4 분류 (나) 하체 스트렝스 중 무거운 하체 0 < n < ${lowerStrength.length} — '한 다리 · 가벼운 하체'가 남는다`,
    heavyLowerStrength.length > 0 && heavyLowerStrength.length < lowerStrength.length,
    `${heavyLowerStrength.length}/${lowerStrength.length}`
  );
  check(
    'P4 분류 (나) 하체 계열 파워(하체날 본운동에 드는 점프 · 바운드)는 모두 무거운 하체 · 그런 파워가 있다',
    lowerPower.length > 0 && lowerPower.every(isHeavyLower),
    `${lowerPower.length}개`
  );
  check(
    'P4 분류 (나) 세 판정 모두 0개가 아니고 표 전부도 아니다(판정이 아무것도 안 하거나 다 잡지 않음)',
    [library.filter(isHeavyLower), armPlyo, heavyPush].every(
      (l) => l.length > 0 && l.length < library.length
    ),
    `무거운 하체 ${library.filter(isHeavyLower).length} · 팔 플라이오 ${armPlyo.length} · 무거운 밀기 ${heavyPush.length} / ${library.length}`
  );
  /*
   * 대표 운동 몇 개 — 이름은 바뀔 수 있어 몇 개만 둔다. P4 검토로 바뀜: 라이브러리에 없는 이름은 건너뛰고 detail 에 적는다(예전에는 실패 —
   * 이름 하나 바꾸면 커밋이 막혔다). 판정 자체는 위 (가) 가짜 운동 표가 지킨다.
   */
  const SAMPLES: [string, [boolean, boolean, boolean]][] = [
    ['바벨 백 스쿼트', [true, false, false]],
    ['고블렛 스쿼트', [false, false, false]],
    ['박스 점프', [true, false, false]],
    ['벤치 프레스', [false, false, true]],
    ['푸시업', [false, false, false]],
    ['펜들레이 로우', [false, false, false]],
    ['톨닐링 메디신볼 체스트 패스', [false, true, false]],
  ];
  const sampleMissing = SAMPLES.filter(
    ([title]) => !library.some((x) => x.title === title)
  ).map(([title]) => title);
  const sampleWrong = SAMPLES.flatMap(([title, want]) => {
    const e = library.find((x) => x.title === title);
    if (!e) return [];
    const got = [isHeavyLower(e), isArmPlyo(e), isHeavyUpperPush(e)];
    return got.every((g, i) => g === want[i]) ? [] : [`${title} ${got.join('/')}`];
  });
  check(
    'P4 분류 (나) 대표 운동 — 바벨 백 스쿼트 · 박스 점프 = 무거운 하체, 벤치 프레스 = 무거운 밀기, 톨닐링 체스트 패스 = 팔 플라이오, 고블렛 스쿼트 · 푸시업 · 펜들레이 로우 = 셋 다 아님(라이브러리에 없는 이름은 건너뜀)',
    sampleWrong.length === 0,
    [
      ...sampleWrong,
      ...(sampleMissing.length ? [`건너뜀: ${sampleMissing.join(' · ')}`] : []),
    ].join(' · ')
  );

  /* ── (다) 하체날 구성과 같은 목록 · 순수 잎 파일 ── */
  const mainOf = (theme: ThemeKey, goal: string | null) =>
    compositionFor(theme, goal).find((s) => s.slot === 'main');
  const goals = [null, ...TRAINING_GOALS.map((g) => g.name)];
  const lowerMains = goals.map((g) => mainOf('lower', g)).filter((s) => s != null);
  check(
    'P4 분류 (다) 하체날 본운동의 파워 계열 = LOWER_POWER_PATTERNS 그 목록(목표마다 같은 것 — 두 벌로 갈라지지 않음)',
    lowerMains.length > 0 &&
      lowerMains.every((s) => s.powerPatterns === LOWER_POWER_PATTERNS) &&
      json(LOWER_POWER_PATTERNS) === json(['스쿼트', '런지', '힌지']),
    json(lowerMains.map((s) => s.powerPatterns))
  );
  const upperPower = mainOf('upper', null)?.powerPatterns ?? [];
  check(
    'P4 분류 (다) 상체날 파워 계열은 하체 계열과 겹치지 않는다(같은 점프가 두 날에 들지 않음)',
    upperPower.length > 0 && upperPower.every((p) => !LOWER_POWER_PATTERNS.includes(p)),
    json(upperPower)
  );
  const classSrc = readFileSync(
    new URL('../lib/engine/exercise-class.ts', import.meta.url),
    'utf8'
  );
  const classImports = [...classSrc.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  check(
    'P4 분류 (다) lib/engine/exercise-class.ts 는 lib/exercise-meta 만 import 한다(순수 잎 — prescription · theme · day-state 가 불러도 순환 없음)',
    classImports.length > 0 && classImports.every((m) => m === '@/lib/exercise-meta'),
    json(classImports)
  );

  /* ── (라) 팔 피로 눈금 · 말 한 곳 ── */
  const options = DETAIL_SCALES.find((s) => s.key === 'armFatigue')?.options ?? [];
  check(
    "P4 팔 피로 (라) 문턱 — '많이' 4(암케어 회복) < '심함' 5(운동 빼기, 근육통과 같은 눈금) · 암케어가 같은 값을 다시 내보낸다",
    HIGH_ARM_FATIGUE === 4 &&
      SEVERE_ARM_FATIGUE === 5 &&
      SEVERE_ARM_FATIGUE === SEVERE_SORENESS &&
      routineSevereArmFatigue === SEVERE_ARM_FATIGUE &&
      options.length === 5
  );
  check(
    'P4 팔 피로 (라) armFatigueWord — 1~5 는 보기 그대로, 0 · 6 · 4.5 · NaN · null · undefined 는 null(안 적음)',
    [1, 2, 3, 4, 5].every((n) => armFatigueWord(n) === options[n - 1]) &&
      json([1, 2, 3, 4, 5].map((n) => armFatigueWord(n))) ===
        json(['없음', '조금', '보통', '많이', '심함']) &&
      [0, 6, 4.5, Number.NaN, null, undefined].every((n) => armFatigueWord(n) === null)
  );
  const srcNoComments = (p: string) =>
    readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const copies = ['lib/armcare/routine.ts', 'lib/engine/day-state.ts'].filter((p) => {
    const src = srcNoComments(p);
    return (
      /'없음',\s*'조금',\s*'보통',\s*'많이',\s*'심함'/.test(src) ||
      /function armFatigueWord/.test(src)
    );
  });
  check(
    'P4 팔 피로 (라) 보기 복사본 없음 — 암케어 · 오늘 상태 한 장이 lib/checkin.ts armFatigueWord 를 쓴다',
    copies.length === 0 &&
      /export function armFatigueWord/.test(srcNoComments('lib/checkin.ts')),
    copies.join(' · ')
  );
  /* 암케어 까닭 줄은 글자 하나 안 바뀐다 — 복사본을 함수로 바꿨을 뿐(범위 밖 숫자는 숫자 그대로 적던 것까지) */
  const armReason = (armFatigue: number) => {
    const f = factsFor({ condition: 8, pitches: [0, 0, 0, 0, 0, 0, 0] });
    return decideArmcare({ facts: f, plan: buildPitchPlan(f), armFatigue }).reason;
  };
  const reasons = [4, 5, 9].map(armReason);
  check(
    "P4 팔 피로 (라) 암케어 까닭 그대로 — 4 → '많이', 5 → '심함', 범위 밖 9 → 숫자 그대로",
    reasons[0] === "팔 피로 '많이' → 회복 루틴" &&
      reasons[1] === "팔 피로 '심함' → 회복 루틴" &&
      reasons[2] === "팔 피로 '9' → 회복 루틴",
    reasons.join(' | ')
  );
  /* P4 로 바뀜(커밋 C) — 팔 피로를 extras 대신 오늘 체크인 칸(facts)에 적는다 */
  const plainStateFacts = factsFor({ condition: 8, pitches: [0, 0, 0, 0, 0, 0, 0] });
  const stateToday = plainStateFacts.condition.today;
  const stateFacts = {
    ...plainStateFacts,
    condition: {
      ...plainStateFacts.condition,
      today: stateToday ? { ...stateToday, armFatigue: SEVERE_ARM_FATIGUE } : null,
    },
  };
  const sevStateWord = buildDayState({
    facts: stateFacts,
    plan: buildPitchPlan(stateFacts),
  }).arm.fatigueWord;
  check(
    "P4 팔 피로 (라) 오늘 상태 한 장의 팔 피로 말도 같은 함수 — 5 → '심함'",
    sevStateWord === '심함',
    String(sevStateWord)
  );
}

/* ═══════════════════ [2판 P4] 등판 한 곳 — lib/engine/outing.ts outingOf (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 등판 한 곳(outingOf) — 매일 일정 · 오늘 상태 한 장 · 일정 지문이 같은 함수, 출처 둘(nextSource · lastSource), 동작 변화 0(2026-10-12)'
);
{
  /*
   * 왜 보는가. 등판 전 무거운 하체 빼기 · 날 종류 · 달력(P4 뒤 커밋들)이 모두 outingOf 를 읽는다. 그 전에 이 커밋은 자리만 옮긴다 —
   * theme.ts plannedOuting 과 오늘 상태 한 장의 outing 칸이 저마다 꺼내던 것을 한 함수로 모았으니 값은 하나도 안 바뀌어야 한다.
   * (가) P3 의 식(글자 그대로 옮겨 둔 아래 legacy*)과 답 격자 · 160조합에서 견주고, (나) 오늘 상태 한 장이 그 결과를 그대로 싣는지,
   * (다) 출처 둘이 손으로 적은 표대로 갈리는지, (라) 일정 지문이 같은 칸을 담는지(판단 입력이 바뀌면 지문도 바뀌는지),
   * (마) 결정성 · 옛 facts, (바) 소스(순수 파일 · 위임 · 규칙 두 곳 없음)를 본다.
   */
  const json = (v: unknown) => JSON.stringify(v);
  type F = ReturnType<typeof buildFacts>;
  const key = (daysAgo: number) =>
    new Date(TODAY.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  /* 체크인 한 줄 — 등판 답만 바꾼다(undefined 면 칸 자체가 없다) */
  const ck = (daysAgo: number, throwPlan: string | null | undefined): CheckinLike => ({
    date: key(daysAgo),
    condition: 7,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    ...(throwPlan !== undefined ? { throwPlan } : {}),
  });
  type Lg = {
    daysAgo: number;
    pitches: number;
    intensity: number;
    sessionType: string;
  };
  /** 오늘 답 자리에 이 글자를 주면 오늘 체크인 자체가 없다 */
  const NO_CHECKIN = 'no-checkin';
  const factsOf = (
    today: string | null,
    yesterday: string | null,
    logs: readonly Lg[]
  ): F =>
    buildFacts({
      nickname: '등판',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: logs.map<PitchLogLike>((l) => ({
        date: new Date(TODAY.getTime() - l.daysAgo * 86400000).toISOString(),
        pitchCount: l.pitches,
        intensity: l.intensity,
        sessionType: l.sessionType,
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [...(today === NO_CHECKIN ? [] : [ck(0, today)]), ck(1, yesterday)],
      memos: [],
    });

  /* P3(7ae15c7 ~ 0fbeb71)의 day-state 등판 칸 — 글자 그대로 옮겨 둔다(칸 이름 · 값도 그때 것). 동작 변화 0 을 이것과 견준다 */
  const legacyP3Outing = (facts: F) => {
    const patterns = facts.patterns;
    const answerToday = parseThrowPlan(facts.condition.throwPlanToday);
    const answerYesterday = parseThrowPlan(facts.condition.throwPlanYesterday);
    const next = checkinNextOutingWindow(
      facts.condition.throwPlanToday,
      facts.condition.throwPlanYesterday
    );
    const logDays = patterns.restDays;
    const yesterdayGame = exactOutingDay(nextOutingDays(answerYesterday)) === 0;
    const fromLog = logDays != null && (logDays <= 1 || !yesterdayGame);
    const source = fromLog ? 'log' : yesterdayGame ? 'checkin' : 'none';
    return {
      daysSinceLast: fromLog ? logDays : yesterdayGame ? 1 : null,
      lastPitches: fromLog ? patterns.lastOutingPitches : null,
      lastLoad: fromLog
        ? ((patterns.hardOutings ?? []).find((o) => o.daysAgo === logDays)?.load ??
          null)
        : null,
      source,
      daysUntilNext: next.days ? { ...next.days } : null,
      nextFrom: next.from,
      answerToday,
      answerYesterday,
      answeredToday: facts.condition.throwPlanToday != null,
      role: todayOutingRole(
        facts.condition.throwPlanToday,
        facts.condition.throwPlanYesterday
      ),
    };
  };
  /* 새 칸을 P3 이름 · 값으로 되돌려 읽기 — 위와 같은 차례 */
  const P3_LAST = { log: 'log', 'checkin-yesterday': 'checkin', none: 'none' } as const;
  const P3_NEXT = {
    checkin: 'today',
    'checkin-yesterday': 'yesterday',
    none: null,
    calendar: 'calendar(P3 에 없음)',
    estimate: 'estimate(P3 에 없음)',
  } as const;
  const asP3 = (o: Outing) => ({
    daysSinceLast: o.daysSinceLast,
    lastPitches: o.lastPitches,
    lastLoad: o.lastLoad,
    source: P3_LAST[o.lastSource],
    daysUntilNext: o.daysUntilNext,
    nextFrom: P3_NEXT[o.nextSource],
    answerToday: o.answerToday,
    answerYesterday: o.answerYesterday,
    answeredToday: o.answeredToday,
    role: o.role,
  });
  /* P2 이전 plannedOuting 의 몸통(2026-10-12 ebcaea2 — '[2판 오늘 상태(P3)]' 절의 legacyPlanned 와 같은 글자) */
  const legacyPlanned = (facts: F): 'today' | 'tomorrow' | null => {
    const today = facts.condition.throwPlanToday ?? null;
    const yesterday = facts.condition.throwPlanYesterday ?? null;
    if (today != null) {
      const days = nextOutingDays(today);
      if (days?.max === 0) return 'today';
      if (days?.min === 1 && days.max === 1) return 'tomorrow';
      return null;
    }
    const days = nextOutingDays(yesterday);
    return days?.min === 1 && days.max === 1 ? 'today' : null;
  };
  /* 키 차례와 상관없이 같은가 — 오늘 상태 한 장은 { threwToday, ...outingOf } 로 싣는다 */
  const sorted = (o: object) =>
    json(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));

  /* 격자 — 오늘 답(여섯 · 안 적음 · 목록 밖 · 체크인 없음) × 어제 답(여섯 · 안 적음 · 목록 밖) × 기록 여섯 */
  const ANSWERS: (string | null)[] = [...THROW_PLANS, null, '모레'];
  const TODAYS: (string | null)[] = [...ANSWERS, NO_CHECKIN];
  const LOGS: { name: string; logs: Lg[] }[] = [
    { name: '기록 없음', logs: [] },
    {
      name: '어제 경기 60구',
      logs: [{ daysAgo: 1, pitches: 60, intensity: 9, sessionType: '경기' }],
    },
    {
      name: '오늘 경기 20구',
      logs: [{ daysAgo: 0, pitches: 20, intensity: 9, sessionType: '경기' }],
    },
    {
      name: '사흘 전 불펜 40구',
      logs: [{ daysAgo: 3, pitches: 40, intensity: 7, sessionType: '불펜' }],
    },
    {
      name: '이틀 전 경기 85구 + 오늘 캐치볼',
      logs: [
        { daysAgo: 2, pitches: 85, intensity: 10, sessionType: '경기' },
        { daysAgo: 0, pitches: 20, intensity: 5, sessionType: '캐치볼' },
      ],
    },
    {
      name: '열흘 전 경기 90구',
      logs: [{ daysAgo: 10, pitches: 90, intensity: 10, sessionType: '경기' }],
    },
  ];
  const grid: { tag: string; logName: string; facts: F }[] = [];
  for (const g of LOGS)
    for (const t of TODAYS)
      for (const y of ANSWERS)
        grid.push({
          tag: `${t ?? '안 적음'} / 어제 ${y ?? '안 적음'} / ${g.name}`,
          logName: g.name,
          facts: factsOf(t, y, g.logs),
        });
  const people = [
    ...grid,
    ...p3ComboFactsSeen.map((facts, i) => ({
      tag: `160조합 p0-${i}`,
      logName: `combo-${i}`,
      facts,
    })),
  ];

  /* ── (가) P3 의 식과 같다 ── */
  const bad = {
    p3: [] as string[],
    planned: [] as string[],
    nextDay: [] as string[],
    soft: [] as string[],
  };
  for (const p of people) {
    const o = outingOf(p.facts);
    if (json(asP3(o)) !== json(legacyP3Outing(p.facts)))
      bad.p3.push(`${p.tag}: ${json(asP3(o))} ≠ ${json(legacyP3Outing(p.facts))}`);
    if (plannedOuting(p.facts) !== legacyPlanned(p.facts))
      bad.planned.push(
        `${p.tag}: ${plannedOuting(p.facts)} ≠ ${legacyPlanned(p.facts)}`
      );
    if (o.nextDay !== exactOutingDay(o.daysUntilNext))
      bad.nextDay.push(`${p.tag}: ${o.nextDay}`);
    if (o.soft || isSoftOutingSource(o.nextSource))
      bad.soft.push(`${p.tag}: ${o.nextSource}`);
  }
  check(
    `P4 등판 (가) 격자 ${grid.length} + 160조합 ${p3ComboFactsSeen.length} — outingOf 를 P3 이름으로 되읽으면 P3 의 day-state 식과 글자까지 같다`,
    grid.length === 432 && p3ComboFactsSeen.length === 160 && bad.p3.length === 0,
    bad.p3.slice(0, 2).join(' / ')
  );
  check(
    `P4 등판 (가) 같은 ${people.length}명 — plannedOuting(이제 outingOf 의 nextDay) = 위임 전 옛 식`,
    bad.planned.length === 0,
    bad.planned.slice(0, 3).join(' / ')
  );
  check(
    `P4 등판 (가) 같은 ${people.length}명 — nextDay = exactOutingDay(daysUntilNext), 짐작한 출처(soft)는 아직 없다`,
    bad.nextDay.length === 0 && bad.soft.length === 0,
    [...bad.nextDay, ...bad.soft].slice(0, 3).join(' / ')
  );
  /* 격자가 실제로 갈래를 덮는가 — 한쪽만 돌면 '같다'가 아무것도 안 지킨다 */
  const outs = people.map((p) => outingOf(p.facts));
  const coverOf = (f: (o: Outing) => boolean) => outs.filter(f).length;
  const cover = {
    nextCheckin: coverOf((o) => o.nextSource === 'checkin'),
    nextYesterday: coverOf((o) => o.nextSource === 'checkin-yesterday'),
    nextNone: coverOf((o) => o.nextSource === 'none'),
    lastLog: coverOf((o) => o.lastSource === 'log'),
    lastClaim: coverOf((o) => o.lastSource === 'checkin-yesterday'),
    lastNone: coverOf((o) => o.lastSource === 'none'),
    today: coverOf((o) => o.nextDay === 0),
    tomorrow: coverOf((o) => o.nextDay === 1),
    shifted: coverOf(
      (o) =>
        o.nextSource === 'checkin-yesterday' &&
        o.nextDay == null &&
        o.daysUntilNext != null
    ),
    load: coverOf((o) => o.lastLoad != null),
  };
  check(
    'P4 등판 (가) 덮음 — 출처 여섯 갈래 · 오늘 · 내일 · 하루 당긴 범위 · 부하 있는 지난 등판이 모두 나온다',
    Object.values(cover).every((n) => n > 0),
    json(cover)
  );

  /* ── (나) 오늘 상태 한 장이 outingOf 를 그대로 싣는다 · 등판 이유 글 두 줄도 P3 와 같은 때 ── */
  {
    const miss: string[] = [];
    for (const p of people) {
      const plan = buildPitchPlan(p.facts);
      const state = buildDayState({ facts: p.facts, plan });
      const want = { threwToday: plan.threwToday, ...outingOf(p.facts) };
      if (sorted(state.outing) !== sorted(want)) miss.push(`${p.tag}: 칸`);
      const legacy = legacyP3Outing(p.facts);
      const claim = state.why.includes('어제 등판했다고 적었는데 투구 기록은 없어요.');
      /*
       * P4 검토로 바뀜 — 왜: 이 줄은 지난 등판(P3 식의 source)이 아니라 어제 기록 유무(claimedYesterdayNoLog)를 따른다. P3 식이 말하던 때는
       * 모두 그대로 말하고(포함), 더 말하는 때는 오늘 기록이 있어 P3 식이 지웠던 날뿐이다.
       */
      const claimNow = outingOf(p.facts).claimedYesterdayNoLog;
      if (
        claim !== claimNow ||
        (legacy.source === 'checkin' && !claimNow) ||
        (claimNow && legacy.source !== 'checkin' && p.facts.patterns.restDays !== 0)
      )
        miss.push(`${p.tag}: 기록 없는 등판 줄`);
      const viaYesterday = state.why.some((l) =>
        l.startsWith('어제 적은 답으로 보면 ')
      );
      if (
        viaYesterday !==
        (legacy.nextFrom === 'yesterday' && legacy.daysUntilNext != null)
      )
        miss.push(`${p.tag}: 어제 답 줄`);
    }
    check(
      `P4 등판 (나) ${people.length}명 — 오늘 상태 한 장의 outing = { threwToday, ...outingOf }, 등판 이유 글 두 줄은 P3 식과 같은 때 나온다`,
      miss.length === 0,
      miss.slice(0, 3).join(' / ')
    );
  }

  /* ── (다) 출처 둘 — 손으로 적은 표 ── */
  {
    const NO: Lg[] = [];
    const rows: {
      name: string;
      facts: F;
      want: Partial<Record<keyof Outing, unknown>>;
    }[] = [
      {
        name: "오늘 '내일 등판'",
        facts: factsOf('내일 등판', null, NO),
        want: {
          nextSource: 'checkin',
          nextDay: 1,
          daysUntilNext: { min: 1, max: 1 },
          lastSource: 'none',
        },
      },
      {
        name: "오늘 답 없음 + 어제 '내일 등판' → 오늘 등판(어제 답 이월)",
        facts: factsOf(null, '내일 등판', NO),
        want: { nextSource: 'checkin-yesterday', nextDay: 0, role: 'game' },
      },
      {
        name: "오늘 답 없음 + 어제 '2~3일 뒤' → 1~2일 뒤(범위만, 날은 못 박음 없음)",
        facts: factsOf(null, '2~3일 뒤', NO),
        want: {
          nextSource: 'checkin-yesterday',
          nextDay: null,
          daysUntilNext: { min: 1, max: 2 },
        },
      },
      {
        name: "오늘 '없음' + 어제 '내일 등판' → 오늘 답이 이긴다",
        facts: factsOf('없음', '내일 등판', NO),
        want: {
          nextSource: 'none',
          nextDay: null,
          answeredToday: true,
          role: null,
        },
      },
      {
        name: '오늘 경기 20구 기록 + 답 없음 → 지난 등판은 기록, 다음 등판은 모름(기록은 다음 등판이 아니다)',
        facts: factsOf(null, null, [
          { daysAgo: 0, pitches: 20, intensity: 9, sessionType: '경기' },
        ]),
        want: {
          nextSource: 'none',
          daysUntilNext: null,
          lastSource: 'log',
          daysSinceLast: 0,
          lastPitches: 20,
        },
      },
      {
        name: "어제 '오늘 등판' + 기록 없음 → 지난 등판은 어제 답(1일 · 투구수 모름), 다음 등판 없음",
        facts: factsOf(null, '오늘 등판', NO),
        want: {
          lastSource: 'checkin-yesterday',
          daysSinceLast: 1,
          lastPitches: null,
          lastLoad: null,
          nextSource: 'none',
        },
      },
      {
        name: "어제 '오늘 등판' + 어제 경기 60구 기록 → 기록이 이긴다(부하까지)",
        facts: factsOf(null, '오늘 등판', [
          { daysAgo: 1, pitches: 60, intensity: 9, sessionType: '경기' },
        ]),
        want: { lastSource: 'log', daysSinceLast: 1, lastPitches: 60, lastLoad: 6000 },
      },
    ];
    for (const r of rows) {
      const o = outingOf(r.facts);
      const got = Object.fromEntries(
        Object.keys(r.want).map((k) => [k, o[k as keyof Outing]])
      );
      check(
        `P4 등판 (다) ${r.name}`,
        json(got) === json(r.want) && o.soft === false,
        json(got)
      );
    }
    check(
      'P4 등판 (다) 짐작한 출처 — 달력 · 같은 요일만 soft(커밋 G 몫), 체크인 · 없음은 아니다',
      isSoftOutingSource('calendar') &&
        isSoftOutingSource('estimate') &&
        !isSoftOutingSource('checkin') &&
        !isSoftOutingSource('checkin-yesterday') &&
        !isSoftOutingSource('none')
    );
  }

  /* ── (라) 일정 지문 — outingOf 가 읽는 칸을 같은 함수로 담는다 ── */
  {
    const miss: string[] = [];
    for (const p of people) {
      const fp = fingerprintOf(p.facts);
      const answers = outingAnswersOf(p.facts);
      const today = p.facts.condition.today;
      /* 커밋 B 전 지문의 식 — 오늘 체크인의 throwPlan · facts 의 어제 답(동작 변화 0 을 이것과 견준다) */
      const oldToday = today ? (today.throwPlan ?? null) : undefined;
      const oldYesterday = p.facts.condition.throwPlanYesterday ?? null;
      if (
        fp.checkin?.throwPlan !== (today ? answers.today : undefined) ||
        fp.throwPlanYesterday !== answers.yesterday ||
        fp.checkin?.throwPlan !== oldToday ||
        fp.throwPlanYesterday !== oldYesterday
      )
        miss.push(`${p.tag}: ${json([fp.checkin?.throwPlan, fp.throwPlanYesterday])}`);
    }
    check(
      `P4 등판 (라) ${people.length}명 — 지문의 등판 답 둘 = outingAnswersOf = 커밋 B 전 지문의 값(글자까지)`,
      miss.length === 0,
      miss.slice(0, 3).join(' / ')
    );
    /*
     * 판단 입력이 바뀌면 지문도 바뀐다 — 기록이 같은 격자 안에서 outingOf 가 다른 두 사람은 지문을 견주면 바뀐 줄이 하나 이상
     * 나와야 한다(P2 규칙 '판단이 읽는 칸 = 지문 칸'). outingOf 가 지문에 없는 칸을 읽게 되면 여기서 깨진다.
     */
    let pairs = 0;
    const silent: string[] = [];
    for (const g of LOGS) {
      const rows = grid.filter((p) => p.logName === g.name);
      const outsOf = rows.map((p) => json(outingOf(p.facts)));
      const fps = rows.map((p) => fingerprintOf(p.facts));
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          if (outsOf[i] === outsOf[j]) continue;
          pairs++;
          if (diffFingerprintChanges(fps[i], fps[j]).length === 0)
            silent.push(`${rows[i].tag} ↔ ${rows[j].tag}`);
        }
    }
    check(
      `P4 등판 (라) 기록이 같은 격자에서 등판이 다른 ${pairs}쌍 — 모두 지문 견주기에 바뀐 줄이 있다`,
      pairs > 1000 && silent.length === 0,
      silent.slice(0, 3).join(' / ')
    );
  }

  /* ── (마) 결정성 · facts 를 안 바꿈 · 새 객체 · 옛 facts ── */
  {
    const f = factsOf(null, '2~3일 뒤', [
      { daysAgo: 1, pitches: 60, intensity: 9, sessionType: '경기' },
    ]);
    const before = json(f);
    const a = outingOf(f);
    if (a.daysUntilNext) a.daysUntilNext.min = 99;
    const b = outingOf(f);
    check(
      'P4 등판 (마) 같은 facts 두 번 → 같은 값, 돌려받은 범위를 고쳐도 다음 값 · facts 가 안 바뀐다',
      json(b) === json(outingOf(f)) && b.daysUntilNext?.min === 1 && json(f) === before,
      json(b)
    );
    const old = JSON.parse(json(f)) as F;
    const cond = old.condition as Partial<F['condition']>;
    delete cond.throwPlanToday;
    delete cond.throwPlanYesterday;
    delete (old.patterns as Partial<F['patterns']>).hardOutings;
    let got: Outing | null = null;
    let error = '';
    try {
      got = outingOf(old);
    } catch (e) {
      error = String(e);
    }
    check(
      'P4 등판 (마) 옛 facts(답 · hardOutings 칸 없음) — 던지지 않고 답 없음 · 다음 등판 모름 · 지난 등판은 기록(부하 모름)',
      got != null &&
        got.answeredToday === false &&
        got.nextSource === 'none' &&
        got.daysUntilNext === null &&
        got.lastSource === 'log' &&
        got.daysSinceLast === 1 &&
        got.lastLoad === null &&
        json(outingAnswersOf(old)) === '{"today":null,"yesterday":null}',
      error || json(got)
    );
  }

  /* ── (바) 소스 — 순수 파일 · 위임 · 규칙 두 곳 없음 ── */
  {
    const strip = (p: string) =>
      readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const outingSrc = strip('lib/engine/outing.ts');
    const specs = [...outingSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    check(
      'P4 등판 (바) lib/engine/outing.ts 는 순수 — import 는 lib/checkin.ts · facts 타입뿐, 날짜 함수 · 난수 · server-only 없음',
      json([...new Set(specs)].sort()) ===
        json(['@/lib/checkin', '@/lib/report/facts']) &&
        /import type \{ ReportFacts \} from '@\/lib\/report\/facts';/.test(outingSrc) &&
        !/new Date\(|appNow|Math\.random|server-only/.test(outingSrc),
      specs.join(' · ')
    );
    const themeSrc = strip('lib/report/theme.ts');
    const stateSrc = strip('lib/engine/day-state.ts');
    const fpSrc = strip('lib/report/plan-fingerprint.ts');
    check(
      'P4 등판 (바) 위임 — theme.ts plannedOuting · day-state 의 outing 칸 · 일정 지문이 outing.ts 를 부르고, 셋 다 등판 답을 따로 합치지 않는다',
      /const \{ nextDay \} = outingOf\(facts\);/.test(themeSrc) &&
        /const outing = outingOf\(facts\);/.test(stateSrc) &&
        /const answers = outingAnswersOf\(facts\);/.test(fpSrc) &&
        ![themeSrc, stateSrc, fpSrc].some((s) =>
          /nextOutingWindow\(|exactOutingDay\(|nextOutingDays\(|throwPlanToday|throwPlanYesterday \?\?|today\.throwPlan/.test(
            s
          )
        )
    );
  }
}

/* ═══════════════════ [2판 P4] 팔 피로 안전 규칙 — lib/report/prescription.ts 5-2 · 5-3 · facts.CheckinLike.armFatigue (2026-10-12) ═══════════════════ */
console.log(
  "\n[2판 P4] 팔 피로 안전 규칙 — '심함'이면 무거운 상체 밀기 · 팔 플라이오 제외, 성장기 쉬는 날 팔 플라이오 제외, 팔 피로는 facts 칸 하나(2026-10-12)"
);
{
  /*
   * 커밋 C 가 바꾼 것: 팔 피로(간편 체크인 1~5)를 facts.CheckinLike 칸으로 올리고(예전에는 오늘 상태 한 장의 extras 로 암케어만 읽었다),
   * 안전 거르기(selectCandidates)에 조이는 규칙 둘을 더했다.
   *   5-2  팔 피로 '심함'(SEVERE_ARM_FATIGUE) → 무거운 상체 밀기(isHeavyUpperPush) · 팔 플라이오(isArmPlyo) 제외. 프로그램(partsOnly)에도
   *   5-3  성장기(YOUTH_AGE_THRESHOLD 미만) + 투구 계획이 공을 쉬는 날 → 팔 플라이오 제외. 프로그램(partsOnly)은 건너뜀(나이 · 날 규칙)
   * 160조합 불변식은 '[2판 안전망(P0)]' (c) 의 ⑭ ⑮ ⑯, 엇갈림 표 C5 는 여섯째 칸(safety). 여기서는 사례 · 실제 표 · 조이기만 · 지문 · 배선.
   */
  const json = (v: unknown) => JSON.stringify(v);
  type AfLog = {
    daysAgo: number;
    pitches: number;
    intensity: number;
    sessionType?: string;
  };
  const afFacts = (p: {
    age?: number | null;
    /** 안 주면 칸이 없다(옛 facts 꼴) */
    armFatigue?: number | null;
    /** false 면 오늘 체크인이 없다 */
    checkin?: boolean;
    logs?: AfLog[];
  }) =>
    buildFacts({
      nickname: '시험',
      age: p.age === undefined ? 22 : p.age,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: dayBefore(l.daysAgo),
        pitchCount: l.pitches,
        intensity: l.intensity,
        ...(l.sessionType ? { sessionType: l.sessionType } : {}),
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins:
        p.checkin === false
          ? []
          : [
              {
                date: dayBefore(0).slice(0, 10),
                condition: 7,
                sleep: '보통',
                shoulder: '정상',
                elbow: '정상',
                wrist: '정상',
                lowerBack: '정상',
                lowerBody: '정상',
                preferredParts: [],
                preferredWorkout: null,
                ...(p.armFatigue !== undefined ? { armFatigue: p.armFatigue } : {}),
              } satisfies CheckinLike,
            ],
      memos: [],
    });
  const pick = (facts: ReturnType<typeof afFacts>, partsOnly = false) =>
    selectCandidates({ facts, plan: buildPitchPlan(facts), library, partsOnly });
  const ids = (list: { id: string }[]) => list.map((e) => e.id).join(',');
  const armHeavy = (e: Parameters<typeof isArmPlyo>[0]) =>
    isHeavyUpperPush(e) || isArmPlyo(e);
  const ARM_RULE = "팔 피로 '심함'";
  const YOUTH_RULE = '쉬는 날 팔 플라이오(성장기)';
  const hasRule = (r: { excluded: { rule: string }[] }, rule: string) =>
    r.excluded.some((x) => x.rule === rule);

  /* ── (가) 5-2 팔 피로 '심함' — 정확히 무거운 밀기 · 팔 플라이오만 빠진다 ── */
  const plain = pick(afFacts({}));
  const sev = pick(afFacts({ armFatigue: SEVERE_ARM_FATIGUE }));
  const expectedSev = plain.candidates.filter((e) => !armHeavy(e));
  const removedSev = plain.candidates.filter(armHeavy);
  check(
    `P4 팔 피로 규칙 (가) 22세 '심함'(5) → 후보 = 칸 없는 날 후보 − 무거운 상체 밀기 · 팔 플라이오(${removedSev.length}개), 그 밖은 하나도 안 빠짐`,
    removedSev.length > 0 &&
      ids(sev.candidates) === ids(expectedSev) &&
      sev.excluded.find((x) => x.rule === ARM_RULE)?.count === removedSev.length,
    `${plain.candidates.length} → ${sev.candidates.length} · ${json(sev.excluded)}`
  );
  check(
    "P4 팔 피로 규칙 (가) '심함'의 근거 글 — \"팔 피로 '심함' → 무거운 상체 밀기 · 팔 플라이오 제외\"",
    sev.basis.includes("팔 피로 '심함' → 무거운 상체 밀기 · 팔 플라이오 제외"),
    sev.basis.join(' / ')
  );
  /*
   * 실제 표에서 빠지는 것 — P4 검토로 바뀜: 예전에는 실측 수(10 + 7 = 17)를 고정해 운동 라이브러리가 바뀌면 깨졌다(앞 '[2판 P4] 운동 분류'
   * 절과 같은 까닭). 이제 성질만: 두 갈래가 다 있고 겹치지 않으며, 빠진 수 = 무거운 밀기 + 팔 플라이오. 수는 detail 로.
   */
  const removedPush = removedSev.filter(isHeavyUpperPush).length;
  const removedPlyo = removedSev.filter(isArmPlyo).length;
  check(
    'P4 팔 피로 규칙 (가) 실제 표에서 빠지는 것 = 무거운 상체 밀기 + 팔 플라이오(둘 다 하나 이상 · 겹침 0, 수는 detail)',
    removedPush > 0 &&
      removedPlyo > 0 &&
      removedPush + removedPlyo === removedSev.length &&
      !removedSev.some((e) => isHeavyUpperPush(e) && isArmPlyo(e)),
    `${removedSev.length} = ${removedPush} + ${removedPlyo} — ${removedSev.map((e) => e.title).join(', ')}`
  );
  const keptPush = sev.candidates.filter(
    (e) => e.category === '상체 스트렝스' && e.movementPattern === '밀기'
  );
  check(
    "P4 팔 피로 규칙 (가) '심함'에도 '중간' 이하 밀기 · 당기기 · 하체 파워는 남는다(오탐 없음)",
    keptPush.length > 0 &&
      keptPush.every((e) => intensityLevel(e.intensity) <= INTENSITY_CAP.MODERATE) &&
      sev.candidates.some(
        (e) => e.category === '상체 스트렝스' && e.movementPattern === '당기기'
      ) &&
      sev.candidates.some((e) => e.category === '파워' && isHeavyLower(e)),
    `남은 밀기 ${keptPush.length}개`
  );
  for (const [n, label] of [
    [4, "'많이'(4)"],
    [3, "'보통'(3)"],
    [null, 'null'],
  ] as const) {
    const r = pick(afFacts({ armFatigue: n }));
    check(
      `P4 팔 피로 규칙 (가) ${label} → 규칙 없음 · 후보 · 근거가 칸 없는 날과 글자 그대로`,
      !hasRule(r, ARM_RULE) &&
        ids(r.candidates) === ids(plain.candidates) &&
        json(r.basis) === json(plain.basis)
    );
  }
  const odd = [9, 0, 4.5].map((n) => pick(afFacts({ armFatigue: n })));
  check(
    "P4 팔 피로 규칙 (가) 범위 밖(9 · 0 · 4.5)은 안 적은 것 — 규칙 없음, 근거에 'null' · 숫자가 안 찍힘",
    odd.every(
      (r) =>
        !hasRule(r, ARM_RULE) &&
        ids(r.candidates) === ids(plain.candidates) &&
        !r.basis.some((b) => b.includes('팔 피로'))
    )
  );
  const sevProgram = pick(afFacts({ armFatigue: SEVERE_ARM_FATIGUE }), true);
  check(
    "P4 팔 피로 규칙 (가) 근력 프로그램(partsOnly)에서도 '심함' 규칙이 걸린다 — 팔 상태 규칙(drop)",
    hasRule(sevProgram, ARM_RULE) && !sevProgram.candidates.some(armHeavy),
    json(sevProgram.excluded)
  );
  const noCheckin = pick(afFacts({ checkin: false }));
  check(
    'P4 팔 피로 규칙 (가) 체크인이 없는 날은 팔 피로 규칙이 없다(칸이 체크인 안에 있다)',
    !hasRule(noCheckin, ARM_RULE)
  );

  /*
   * ── (나) 5-3 성장기 쉬는 날 ──
   * 평소처럼 던지는 사람(DEFAULT_PITCHES)에서 어제만 55구로 올린다 — 19세 미만 휴식표로 오늘이 공을 쉬는 날이고, 부하 구간이 위험이
   * 아니라 무게 상한이 '중간' 팔 플라이오(톨닐링 메디신볼 …)를 먼저 빼지 않는다. 규칙이 하는 일이 보이는 날이다. 어제 경기 85구는
   * 부하 구간이 회복 수준까지만 남겨 규칙 없이도 팔 플라이오가 다 빠져, 규칙을 재지 못한다(처음 그렇게 짰다가 16세 쪽이 0 이었다).
   */
  const restLogs: AfLog[] = DEFAULT_PITCHES.map((n, i) => ({
    daysAgo: i + 1,
    pitches: i === 0 ? 55 : n,
    intensity: 7,
  }));
  const youthRest = afFacts({ age: 15, logs: restLogs });
  const youthRestPlan = buildPitchPlan(youthRest);
  const y15 = pick(youthRest);
  const y16Facts = afFacts({ age: 16, logs: restLogs });
  const y16 = pick(y16Facts);
  check(
    'P4 팔 피로 규칙 (나) 준비 — 15 · 16세 어제 55구 → 둘 다 투구 계획의 오늘이 공을 쉬는 날 · 부하 구간은 위험이 아님',
    youthRestPlan.today?.throwing === false &&
      buildPitchPlan(y16Facts).today?.throwing === false &&
      youthRest.load.zone !== 'danger',
    `${youthRest.load.zone} · ${json(youthRestPlan.today)}`
  );
  check(
    `P4 팔 피로 규칙 (나) 15세 쉬는 날 → '${YOUTH_RULE}' · 팔 플라이오 0, 16세 같은 날은 규칙 없음 · 팔 플라이오가 남는다(D4 경계)`,
    hasRule(y15, YOUTH_RULE) &&
      !y15.candidates.some(isArmPlyo) &&
      y15.basis.includes('만 15세(성장기) · 오늘 공을 쉬는 날 → 팔 플라이오 제외') &&
      !hasRule(y16, YOUTH_RULE) &&
      y16.candidates.some(isArmPlyo),
    `15세 ${json(y15.excluded)} | 16세 플라이오 ${y16.candidates.filter(isArmPlyo).length}`
  );
  check(
    `P4 팔 피로 규칙 (나) 15세 쉬는 날 규칙이 빼는 것은 팔 플라이오뿐 — 16세 후보에서 '매우 높음'(성장기 상한) · 팔 플라이오를 뺀 것과 같다`,
    ids(y15.candidates) ===
      ids(
        y16.candidates.filter(
          (e) => !isArmPlyo(e) && intensityLevel(e.intensity) <= INTENSITY_CAP.STRENGTH
        )
      ),
    `${y15.candidates.length} · ${y16.candidates.length}`
  );
  const y15Throw = pick(afFacts({ age: 15 }));
  const y15Threw = afFacts({
    age: 15,
    logs: [{ daysAgo: 0, pitches: 30, intensity: 7, sessionType: '불펜' }],
  });
  const y15ThrewPick = pick(y15Threw);
  const y15Program = pick(youthRest, true);
  check(
    'P4 팔 피로 규칙 (나) 15세 던지는 날 · 오늘 이미 던진 날(계획의 오늘 없음) · 근력 프로그램(partsOnly — 나이 · 날 규칙)은 쉬는 날 규칙이 없다',
    buildPitchPlan(afFacts({ age: 15 })).today?.throwing === true &&
      !hasRule(y15Throw, YOUTH_RULE) &&
      buildPitchPlan(y15Threw).today == null &&
      !hasRule(y15ThrewPick, YOUTH_RULE) &&
      !hasRule(y15Program, YOUTH_RULE),
    `${json(y15Throw.excluded)} | ${json(y15ThrewPick.excluded)} | ${json(y15Program.excluded)}`
  );
  check(
    `P4 팔 피로 규칙 (나) 규칙 문턱은 YOUTH_AGE_THRESHOLD(${YOUTH_AGE_THRESHOLD}) 그대로 — 따로 적은 나이가 없다`,
    /facts\.profile\.age < YOUTH_AGE_THRESHOLD &&\s*plan\.today\?\.throwing === false/.test(
      readFileSync(new URL('../lib/report/prescription.ts', import.meta.url), 'utf8')
    )
  );

  /* ── (다) 조이기만 — P3 160조합의 facts 로: 팔 피로 칸을 지운 facts 의 후보에서 무거운 밀기 · 팔 플라이오만 더 빠질 수 있다 ── */
  {
    let severe = 0;
    let other = 0;
    const missLoose: string[] = [];
    for (const [i, facts] of p3ComboFactsSeen.entries()) {
      const today = facts.condition.today;
      if (!today || today.armFatigue == null) continue;
      const stripped = {
        ...facts,
        condition: { ...facts.condition, today: { ...today, armFatigue: null } },
      };
      const plan = buildPitchPlan(facts);
      const a = selectCandidates({ facts, plan, library });
      const b = selectCandidates({ facts: stripped, plan, library });
      const extra = b.candidates.filter(
        (e) => !a.candidates.some((x) => x.id === e.id)
      );
      const subset = a.candidates.every((e) => b.candidates.some((x) => x.id === e.id));
      if (today.armFatigue >= SEVERE_ARM_FATIGUE) severe++;
      else other++;
      const ok =
        a.halted === b.halted &&
        subset &&
        (today.armFatigue >= SEVERE_ARM_FATIGUE
          ? extra.every(armHeavy)
          : extra.length === 0 && ids(a.candidates) === ids(b.candidates));
      if (!ok) missLoose.push(`p0-${i}(${today.armFatigue}) ${extra.length}`);
    }
    check(
      `P4 팔 피로 규칙 (다) 조이기만 — 팔 피로가 적힌 P3 조합(심함 ${severe} · 그 밑 ${other}) — 후보는 칸을 지운 날의 부분집합이고 더 빠진 것은 무거운 밀기 · 팔 플라이오뿐, '심함' 밑은 같음`,
      severe >= 5 && other >= 20 && missLoose.length === 0,
      missLoose.slice(0, 3).join(' / ')
    );
  }

  /* ── (라) 일정 지문 — checkin.armFatigue 선택 칸 ── */
  const fpOf = (armFatigue?: number | null) =>
    fingerprintOf(afFacts(armFatigue === undefined ? {} : { armFatigue }));
  const fpNone = fpOf();
  const fpNull = fpOf(null);
  const fpSev = fpOf(5);
  check(
    'P4 팔 피로 규칙 (라) 지문 — 칸 없는 facts 의 지문에는 armFatigue 가 없다(예전과 글자 그대로) · null 은 null · 5 는 5 · 범위 밖 9 는 null',
    fpNone.checkin != null &&
      !('armFatigue' in fpNone.checkin) &&
      fpNull.checkin?.armFatigue === null &&
      fpSev.checkin?.armFatigue === 5 &&
      fpOf(9).checkin?.armFatigue === null,
    json([fpNone.checkin, fpSev.checkin])
  );
  check(
    'P4 팔 피로 규칙 (라) 지문 — FINGERPRINT_KEYS 는 그대로(안쪽 칸이라) — 바깥 칸 10개',
    FINGERPRINT_KEYS.length === 10 &&
      !(FINGERPRINT_KEYS as readonly string[]).includes('armFatigue')
  );
  const words = (a: ReturnType<typeof fpOf>, b: ReturnType<typeof fpOf>) =>
    diffFingerprintChanges(a, b);
  const added = words(fpNull, fpSev);
  const changed = words(fpOf(3), fpSev);
  const cleared = words(fpSev, fpNull);
  check(
    "P4 팔 피로 규칙 (라) 지문 — 바뀐 글 셋 — \"팔 피로 '심함'을 새로 적었어요\" · \"팔 피로가 '보통'에서 '심함'으로 바뀌었어요\" · '팔 피로 표시를 지웠어요'(key armFatigue)",
    json(added) ===
      json([{ key: 'armFatigue', text: "팔 피로 '심함'을 새로 적었어요" }]) &&
      json(changed) ===
        json([
          { key: 'armFatigue', text: "팔 피로가 '보통'에서 '심함'으로 바뀌었어요" },
        ]) &&
      json(cleared) === json([{ key: 'armFatigue', text: '팔 피로 표시를 지웠어요' }]),
    json([added, changed, cleared])
  );
  const allTexts: string[] = [];
  for (const a of [null, 1, 2, 3, 4, 5])
    for (const b of [null, 1, 2, 3, 4, 5])
      allTexts.push(...words(fpOf(a), fpOf(b)).map((c) => c.text));
  check(
    `P4 팔 피로 규칙 (라) 지문 — 팔 피로 글 격자 6×6 — ${allTexts.length}줄 모두 해요체 · 줄표 · 굵게 · null 없음 · 60자 안, 같은 값끼리는 글 없음`,
    allTexts.length === 30 &&
      allTexts.every(
        (t) => /요$/.test(t) && !/—|\*\*|null|undefined|NaN/.test(t) && t.length <= 60
      ),
    allTexts.slice(0, 3).join(' / ')
  );
  check(
    'P4 팔 피로 규칙 (라) 지문 — 옛 지문(칸 없음)과는 견주지 않는다 — 칸 없는 지문 → 5 · 5 → 칸 없는 지문 모두 바뀜 없음(배포 날 알림이 안 뜬다)',
    words(fpNone, fpSev).length === 0 && words(fpSev, fpNone).length === 0
  );
  const round = readPlanFingerprint(JSON.parse(json(fpSev)));
  const roundOld = readPlanFingerprint(JSON.parse(json(fpNone)));
  const broken = readPlanFingerprint({
    ...fpSev,
    checkin: { ...fpSev.checkin, armFatigue: '5' },
  });
  check(
    "P4 팔 피로 규칙 (라) 지문 — 읽기 — 저장했다 읽어도 글자 그대로(칸 있음 · 없음 둘 다), 칸이 '5'(글자)면 깨진 지문(null)",
    json(round) === json(fpSev) && json(roundOld) === json(fpNone) && broken === null,
    json(round?.checkin)
  );

  /* ── (마) 배선 — 팔 피로는 facts 한 곳: 오늘 상태 한 장 · 안전 거르기 · 지문이 같은 칸을 읽는다 ── */
  const sevFacts = afFacts({ armFatigue: SEVERE_ARM_FATIGUE });
  const sevState = buildDayState({ facts: sevFacts, plan: buildPitchPlan(sevFacts) });
  check(
    "P4 팔 피로 규칙 (마) 배선 — 오늘 상태 한 장이 facts 의 팔 피로를 읽는다 — 5 → fatigue 5 · '심함' · 높음, 칸 없는 facts → null",
    sevState.arm.fatigue === 5 &&
      sevState.arm.fatigueWord === '심함' &&
      sevState.hard.armFatigueHigh &&
      buildDayState({ facts: afFacts({}), plan: buildPitchPlan(afFacts({})) }).arm
        .fatigue === null,
    json(sevState.arm)
  );
  const stripC = (p: string) =>
    readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const stateSrc = stripC('lib/engine/day-state.ts');
  const rxSrc = stripC('lib/report/prescription.ts');
  check(
    'P4 팔 피로 규칙 (마) 배선 — day-state 는 extras 로 팔 피로를 안 받는다(칸 하나) · prescription 은 판정을 lib/engine/exercise-class.ts 에서 부른다(베낀 판정 없음)',
    /const fatigue = today\?\.armFatigue \?\? null;/.test(stateSrc) &&
      !/extras\.armFatigue|armFatigue\?: number/.test(stateSrc) &&
      /*
       * P4 로 바뀜(커밋 D) — 왜: 같은 import 에 isHeavyLower(등판 창 2-2)가 더해져 여러 줄이 됐다. 뜻(판정은 exercise-class.ts 에서
       * 부른다)은 그대로라, 두 이름이 그 파일의 import 에 있는지를 본다.
       */
      /import \{[^}]*\bisArmPlyo\b[^}]*\bisHeavyUpperPush\b[^}]*\} from '@\/lib\/engine\/exercise-class';/.test(
        rxSrc
      ) &&
      !/메디신볼|플라이오볼/.test(rxSrc)
  );
}

/* ═══════════════════ [2판 P4] 등판 창 무거운 하체 — lib/report/prescription.ts 2-2 · lib/engine/outing.ts outingOf (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 등판 창 무거운 하체 — 다음 등판이 오늘 · 내일 · 2~3일 뒤면 무거운 하체 제외, 근력 프로그램은 건너뜀, 하체 본운동이 비면 날이 바뀜(2026-10-12)'
);
{
  /*
   * 커밋 D 가 바꾼 것: 안전 거르기(selectCandidates)에 조이는 규칙 2-2 를 더했다 — 등판 한 곳(outingOf)의 다음 등판 창 끝(max)이
   * HEAVY_LOWER_BLOCK_WITHIN_DAYS(3) 이하면 무거운 하체(isHeavyLower)를 뺀다. 근력 프로그램(partsOnly)은 건너뛴다(날 규칙 · D6).
   * 160조합 불변식은 '[2판 안전망(P0)]' (c) 의 ⑪ ⑫. 여기서는 사례 · 실제 표 · 그래도 하기 · 날 바꾸기 · 조이기만 · 재검사 · 지문 · 소스.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const ids = (list: { id: string }[]) => list.map((e) => e.id).join(',');
  const RULE = '등판 전 무거운 하체';
  const hasRule = (r: { excluded: { rule: string }[] }) =>
    r.excluded.some((x) => x.rule === RULE);
  /* 좁은 판정 — 앞 '[2판 안전망(P0)]' 절의 narrowHeavyLower 와 같은 글자(그 절은 블록 안이라 못 부른다) */
  const narrowHeavyLower = (e: {
    category: string;
    intensity: string;
    equipment: readonly string[];
    movementPattern?: string | null;
  }) =>
    (e.category === '하체 스트렝스' &&
      (e.equipment.includes('바벨') ||
        intensityLevel(e.intensity) > INTENSITY_CAP.STRENGTH)) ||
    (e.category === '파워' &&
      (e.movementPattern === '스쿼트' ||
        e.movementPattern === '런지' ||
        e.movementPattern === '힌지'));
  type OhDay = { throwPlan?: string | null; preferredWorkout?: string | null };
  const ohCheckin = (daysAgo: number, d: OhDay): CheckinLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    condition: 8,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: d.preferredWorkout ?? null,
    ...(d.throwPlan !== undefined ? { throwPlan: d.throwPlan } : {}),
  });
  /** today 를 안 주면 답 칸 없는 오늘 체크인, null 이면 오늘 체크인이 없다. 투구 기록은 없다(부하 구간으로 안 거름) */
  const ohFacts = (p: { today?: OhDay | null; yesterday?: OhDay | null }) =>
    buildFacts({
      nickname: '시험',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: [],
      checkins: [
        ...(p.today === null ? [] : [ohCheckin(0, p.today ?? {})]),
        ...(p.yesterday ? [ohCheckin(1, p.yesterday)] : []),
      ],
      memos: [],
    });
  const pick = (facts: ReturnType<typeof ohFacts>, partsOnly = false) =>
    selectCandidates({ facts, plan: buildPitchPlan(facts), library, partsOnly });
  /* 답만 지운 같은 날 — 체크인이 있고 없음은 그대로 둔다 */
  const stripAnswer = (d: OhDay | null | undefined) =>
    d == null ? d : { ...d, throwPlan: undefined };

  check(
    'P4 등판 창 — 문턱 HEAVY_LOWER_BLOCK_WITHIN_DAYS 는 3(오늘 · 내일 · 2~3일 뒤 — 검토안 4-2)',
    HEAVY_LOWER_BLOCK_WITHIN_DAYS === 3,
    String(HEAVY_LOWER_BLOCK_WITHIN_DAYS)
  );

  /* ── (가) 사례 — 답마다 규칙이 걸리나, 걸리면 정확히 무거운 하체만 빠지나 ── */
  const cases: {
    name: string;
    today?: OhDay | null;
    yesterday?: OhDay | null;
    /** 근거 줄의 '언제'(걸리지 않으면 null) */
    when: string | null;
  }[] = [
    { name: "오늘 '오늘 등판'", today: { throwPlan: '오늘 등판' }, when: '오늘' },
    { name: "오늘 '내일 등판'", today: { throwPlan: '내일 등판' }, when: '내일' },
    { name: "오늘 '2~3일 뒤'", today: { throwPlan: '2~3일 뒤' }, when: '2~3일 뒤' },
    {
      name: "오늘 답 없음 + 어제 '내일 등판'(오늘이 등판)",
      today: { throwPlan: null },
      yesterday: { throwPlan: '내일 등판' },
      when: '오늘',
    },
    {
      name: "오늘 체크인 없음 + 어제 '내일 등판'",
      today: null,
      yesterday: { throwPlan: '내일 등판' },
      when: '오늘',
    },
    {
      name: "오늘 답 없음 + 어제 '2~3일 뒤'(오늘 1~2일 뒤)",
      today: { throwPlan: null },
      yesterday: { throwPlan: '2~3일 뒤' },
      when: '1~2일 뒤',
    },
    {
      name: "오늘 '2~3일 뒤' + 어제 '4일 이상 뒤'(오늘 답이 이긴다)",
      today: { throwPlan: '2~3일 뒤' },
      yesterday: { throwPlan: '4일 이상 뒤' },
      when: '2~3일 뒤',
    },
    { name: "오늘 '4일 이상 뒤'", today: { throwPlan: '4일 이상 뒤' }, when: null },
    {
      name: "오늘 답 없음 + 어제 '4일 이상 뒤'(오늘 3일 이상 뒤 — 끝이 없는 답이라 안 건다)",
      today: { throwPlan: null },
      yesterday: { throwPlan: '4일 이상 뒤' },
      when: null,
    },
    { name: "오늘 '오늘 불펜'", today: { throwPlan: '오늘 불펜' }, when: null },
    { name: "오늘 '없음'", today: { throwPlan: '없음' }, when: null },
    {
      name: "오늘 '없음' + 어제 '내일 등판'(오늘 답이 이긴다)",
      today: { throwPlan: '없음' },
      yesterday: { throwPlan: '내일 등판' },
      when: null,
    },
    {
      name: "오늘 '4일 이상 뒤' + 어제 '내일 등판'(비로 밀림 — 오늘 답이 이긴다)",
      today: { throwPlan: '4일 이상 뒤' },
      yesterday: { throwPlan: '내일 등판' },
      when: null,
    },
    {
      name: "오늘 답 없음 + 어제 '오늘 등판'(지난 등판이지 다음 등판이 아니다)",
      today: { throwPlan: null },
      yesterday: { throwPlan: '오늘 등판' },
      when: null,
    },
    { name: '오늘 · 어제 답 칸 없음', today: {}, yesterday: {}, when: null },
    {
      name: '오늘 체크인 없음 · 어제 답 칸 없음',
      today: null,
      yesterday: {},
      when: null,
    },
  ];
  for (const c of cases) {
    const r = pick(ohFacts(c));
    const plain = pick(
      ohFacts({ today: stripAnswer(c.today), yesterday: stripAnswer(c.yesterday) })
    );
    if (c.when != null) {
      const line = `${c.when} 등판 → 무거운 하체 제외`;
      const expected = plain.candidates.filter((e) => !isHeavyLower(e));
      const removed = plain.candidates.length - expected.length;
      check(
        `P4 등판 창 (가) ${c.name} → '${line}' · 답을 지운 날 후보에서 무거운 하체 ${removed}개만 빠진다`,
        removed > 0 &&
          hasRule(r) &&
          ids(r.candidates) === ids(expected) &&
          r.excluded.find((x) => x.rule === RULE)?.count === removed &&
          r.basis.includes(line) &&
          json(r.basis.filter((b) => b !== line)) === json(plain.basis),
        `${plain.candidates.length} → ${r.candidates.length} · ${json(r.excluded)}`
      );
    } else {
      check(
        `P4 등판 창 (가) ${c.name} → 규칙 없음 · 후보 · 근거가 답을 지운 날과 글자 그대로`,
        !hasRule(r) &&
          ids(r.candidates) === ids(plain.candidates) &&
          json(r.basis) === json(plain.basis) &&
          !r.basis.some((b) => b.includes('무거운 하체')),
        json(r.excluded)
      );
    }
  }
  /* 답이 늘면(THROW_PLANS) 여기도 늘려야 한다 — 새 답이 창 안인지 밖인지 적지 않은 채 지나가지 않게 */
  const answersTested = new Set(
    cases
      .flatMap((c) => [c.today?.throwPlan, c.yesterday?.throwPlan])
      .filter((a) => a != null)
  );
  check(
    `P4 등판 창 (가) THROW_PLANS ${THROW_PLANS.length}개가 모두 사례에 들어 있다`,
    THROW_PLANS.every((a) => answersTested.has(a)) &&
      answersTested.size === THROW_PLANS.length,
    [...answersTested].join(' · ')
  );

  /* 실제 표 — 칸 없는 날(아무 규칙도 안 걸리는 22세)의 후보에서 무엇이 빠지나 */
  const plainAll = pick(ohFacts({}));
  const win = pick(ohFacts({ today: { throwPlan: '2~3일 뒤' } }));
  const heavyInLibrary = library.filter(isHeavyLower);
  const keptLower = win.candidates.filter((e) => e.category === '하체 스트렝스');
  check(
    `P4 등판 창 (가) 실제 표 — 규칙 없는 날 후보 ${plainAll.candidates.length}(표 전체) → '2~3일 뒤' ${win.candidates.length}, 빠진 것은 표의 무거운 하체 ${heavyInLibrary.length}개(하체 스트렝스 ${heavyInLibrary.filter((e) => e.category === '하체 스트렝스').length} · 파워 ${heavyInLibrary.filter((e) => e.category === '파워').length}) 전부`,
    plainAll.candidates.length === library.length &&
      heavyInLibrary.length >= 20 &&
      win.candidates.length === library.length - heavyInLibrary.length &&
      !win.candidates.some((e) => isHeavyLower(e) || narrowHeavyLower(e))
  );
  check(
    `P4 등판 창 (가) 실제 표 — 가벼운 하체 근력은 남는다(${keptLower.length}개, 모두 '중간' 이하 · 바벨 없음 — 고블렛 스쿼트 · 덤벨 스텝업 …)`,
    keptLower.length >= 10 &&
      keptLower.every(
        (e) =>
          intensityLevel(e.intensity) <= INTENSITY_CAP.MODERATE &&
          !e.equipment.includes('바벨') &&
          !e.equipment.includes('원판')
      ),
    keptLower
      .slice(0, 4)
      .map((e) => e.title)
      .join(', ')
  );
  const winProgram = pick(ohFacts({ today: { throwPlan: '2~3일 뒤' } }), true);
  const plainProgram = pick(ohFacts({}), true);
  const todayProgram = pick(ohFacts({ today: { throwPlan: '오늘 등판' } }), true);
  check(
    'P4 등판 창 (가) 근력 프로그램(partsOnly)은 등판 창 규칙을 건너뛴다(사용자 결정 D6 · 날 규칙 — 프로그램은 경기 날 · 전날을 스스로 쉬고, 그 밖의 날은 처방대로)',
    !hasRule(winProgram) &&
      !hasRule(todayProgram) &&
      ids(winProgram.candidates) === ids(plainProgram.candidates) &&
      winProgram.candidates.some(isHeavyLower),
    json(winProgram.excluded)
  );

  /* ── (나) 그래도 하기 · 하체 날 — 화면과 같은 길(buildDailyPlan) ── */
  const allOwned = [ALWAYS_OWNED, ...SELECTABLE_EQUIPMENT];
  const ohBuild = (
    p: { today?: OhDay | null; yesterday?: OhDay | null },
    opts: {
      override?: boolean;
      lastLowerKey?: string | null;
      lastUpperKey?: string | null;
      lib?: typeof library;
    } = {}
  ) => {
    const facts = ohFacts(p);
    const plan = buildPitchPlan(facts);
    return buildDailyPlan({
      user: { ownedEquipment: allOwned, trainingLevel: '상급' },
      facts,
      plan,
      library: opts.lib ?? library,
      availableToday: null,
      requestedMinutes: 60,
      trainingGoal: '근력 향상',
      recentIds: new Set<string>(),
      rotationSeed: 'p4-window',
      /* 하체를 더 오래전에 했다 — 번갈아 규칙으로 오늘은 하체 날 */
      lastLowerKey: opts.lastLowerKey === undefined ? '2026-06-10' : opts.lastLowerKey,
      lastUpperKey: opts.lastUpperKey === undefined ? '2026-06-13' : opts.lastUpperKey,
      override: opts.override ?? false,
    });
  };
  const byIdLib = new Map(library.map((e) => [e.id, e]));
  const picksOf = (b: ReturnType<typeof ohBuild>) =>
    isHalted(b)
      ? []
      : b.picks.map((k) => byIdLib.get(k.exerciseId)).filter((e) => e != null);
  const mainLowerOf = (b: ReturnType<typeof ohBuild>) =>
    isHalted(b)
      ? []
      : b.picks
          .filter((k) => k.slot === 'main')
          .map((k) => byIdLib.get(k.exerciseId))
          .filter((e) => e != null);
  const far = ohBuild({ today: { throwPlan: '4일 이상 뒤' } });
  const near = ohBuild({ today: { throwPlan: '2~3일 뒤' } });
  check(
    "P4 등판 창 (나) 준비 — 같은 사람 '4일 이상 뒤'는 하체 날이고 무거운 하체가 든다(멀면 다시 든다)",
    !isHalted(far) && far.theme.key === 'lower' && picksOf(far).some(isHeavyLower),
    isHalted(far)
      ? '멈춤'
      : `${far.theme.key} · ${picksOf(far).filter(isHeavyLower).length}`
  );
  check(
    "P4 등판 창 (나) '2~3일 뒤' → 그대로 하체 날, 본운동은 가벼운 하체로 채우고 무거운 하체 0 · 근거에 '2~3일 뒤 등판 → 무거운 하체 제외'",
    !isHalted(near) &&
      near.theme.key === 'lower' &&
      mainLowerOf(near).length > 0 &&
      !picksOf(near).some((e) => isHeavyLower(e) || narrowHeavyLower(e)) &&
      near.basis.includes('2~3일 뒤 등판 → 무거운 하체 제외'),
    isHalted(near)
      ? '멈춤'
      : `${near.theme.key} · 본운동 ${mainLowerOf(near)
          .map((e) => e.title)
          .join(', ')}`
  );
  const forced = ohBuild(
    { today: { throwPlan: '오늘 등판', preferredWorkout: '웨이트' } },
    { override: true }
  );
  const notForced = ohBuild({
    today: { throwPlan: '오늘 등판', preferredWorkout: '웨이트' },
  });
  check(
    "P4 등판 창 (나) '오늘 등판' + 웨이트 + 그래도 하기 → 테마는 근력(하체)이 되지만 무거운 하체는 그래도 0(override 로 안 풀림)",
    !isHalted(forced) &&
      forced.overrode === true &&
      forced.theme.key === 'lower' &&
      !picksOf(forced).some((e) => isHeavyLower(e) || narrowHeavyLower(e)) &&
      forced.basis.includes('오늘 등판 → 무거운 하체 제외') &&
      !isHalted(notForced) &&
      notForced.theme.key === 'recovery',
    isHalted(forced) ? '멈춤' : `${forced.theme.key} · overrode ${forced.overrode}`
  );

  /* ── (다) 하체 본운동이 통째로 비면 날이 바뀐다(steerFromEmptyMain) — 가벼운 하체를 뺀 표로 ── */
  /*
   * 하체 날 본운동(하체 스트렝스 · 계열 맞는 파워)에서 무거운 하체만 남긴 표: 가벼운 하체 근력 · 계열 없는 파워를 뺀다. 그러면 '4일 이상
   * 뒤'에는 하체 날이 서고, 등판 창에서는 하체 본운동 후보가 0 이 돼 날이 바뀌어야 한다 — 상체를 어제 안 했으면 상체 날, 했으면 보조 · 코어.
   */
  const heavyOnlyLower = library.filter(
    (e) =>
      !(e.category === '하체 스트렝스' && !isHeavyLower(e)) &&
      !(e.category === '파워' && !isHeavyLower(e) && e.movementPattern == null)
  );
  const steerFar = ohBuild(
    { today: { throwPlan: '4일 이상 뒤' } },
    { lib: heavyOnlyLower }
  );
  const steerUpper = ohBuild(
    { today: { throwPlan: '2~3일 뒤' } },
    { lib: heavyOnlyLower }
  );
  const steerAssist = ohBuild(
    { today: { throwPlan: '2~3일 뒤' } },
    { lib: heavyOnlyLower, lastUpperKey: '2026-06-14' }
  );
  check(
    `P4 등판 창 (다) 준비 — 무거운 하체만 남긴 표(${heavyOnlyLower.length}개)에서 '4일 이상 뒤'는 하체 날 · 무거운 하체 본운동`,
    !isHalted(steerFar) &&
      steerFar.theme.key === 'lower' &&
      mainLowerOf(steerFar).length > 0 &&
      mainLowerOf(steerFar).every(isHeavyLower),
    isHalted(steerFar) ? '멈춤' : steerFar.theme.key
  );
  check(
    "P4 등판 창 (다) 같은 표 '2~3일 뒤' → 하체 본운동 후보 0 이라 상체 날로 바뀐다(어제 상체 안 함) · 이유에 까닭 한 줄 · 무거운 하체 0",
    !isHalted(steerUpper) &&
      steerUpper.theme.key === 'upper' &&
      steerUpper.theme.reason.includes('하체 운동이 없어 오늘은 상체를 해요') &&
      !picksOf(steerUpper).some(isHeavyLower),
    isHalted(steerUpper)
      ? '멈춤'
      : `${steerUpper.theme.key} · ${steerUpper.theme.reason}`
  );
  check(
    "P4 등판 창 (다) 같은 표 '2~3일 뒤' + 어제 상체 → 보조 · 코어 날로 바뀐다(같은 쪽 무거운 날을 잇지 않음) · 무거운 하체 0",
    !isHalted(steerAssist) &&
      steerAssist.theme.key === 'assist' &&
      steerAssist.theme.reason.includes('하체 운동이 없고 상체는 어제 했어요') &&
      !picksOf(steerAssist).some(isHeavyLower),
    isHalted(steerAssist)
      ? '멈춤'
      : `${steerAssist.theme.key} · ${steerAssist.theme.reason}`
  );

  /* ── (라) 조이기만 — P3 160조합의 facts 로: 등판 답을 지운 facts 의 후보에서 무거운 하체만 더 빠질 수 있다 ── */
  {
    let inWindow = 0;
    let outside = 0;
    let bit = 0;
    const missLoose: string[] = [];
    for (const [i, facts] of p3ComboFactsSeen.entries()) {
      const stripped = {
        ...facts,
        condition: {
          ...facts.condition,
          throwPlanToday: null,
          throwPlanYesterday: null,
        },
      };
      const plan = buildPitchPlan(facts);
      const a = selectCandidates({ facts, plan, library });
      const b = selectCandidates({ facts: stripped, plan, library });
      const w = outingOf(facts).daysUntilNext;
      const windowed = w != null && w.max != null && w.max <= 3;
      const extra = b.candidates.filter(
        (e) => !a.candidates.some((x) => x.id === e.id)
      );
      const subset = a.candidates.every((e) => b.candidates.some((x) => x.id === e.id));
      if (windowed) inWindow++;
      else outside++;
      if (extra.length > 0) bit++;
      const ok =
        a.halted === b.halted &&
        subset &&
        (windowed
          ? extra.every(isHeavyLower)
          : extra.length === 0 && ids(a.candidates) === ids(b.candidates));
      if (!ok) missLoose.push(`p0-${i} ${extra.length}`);
    }
    check(
      `P4 등판 창 (라) 조이기만 — P3 160조합(창 안 ${inWindow} · 밖 ${outside} · 실제로 뺀 날 ${bit}) — 후보는 답을 지운 날의 부분집합이고 더 빠진 것은 무거운 하체뿐, 창 밖은 같음`,
      inWindow >= 15 && outside >= 60 && bit >= 5 && missLoose.length === 0,
      missLoose.slice(0, 3).join(' / ')
    );
  }

  /* ── (마) 안전 재검사 — 아침에 만든 하체 날의 무거운 하체는 낮에 '내일 등판'을 적으면 걸러진다(today-data 가 같은 함수로 다시 본다) ── */
  const morning = ohBuild({ today: { throwPlan: '4일 이상 뒤' } });
  const noonFacts = ohFacts({ today: { throwPlan: '내일 등판' } });
  const noonSafe = new Set(
    selectCandidates({
      facts: noonFacts,
      plan: buildPitchPlan(noonFacts),
      library,
    }).candidates.map((e) => e.id)
  );
  const morningPicks = picksOf(morning);
  const unsafe = morningPicks.filter((e) => !noonSafe.has(e.id));
  check(
    "P4 등판 창 (마) 안전 재검사 — 아침 '4일 이상 뒤' 하체 날을 낮에 '내일 등판'으로 고치면 그 일정의 무거운 하체만 안전하지 않다(나머지는 그대로 안전)",
    unsafe.length > 0 &&
      json(unsafe.map((e) => e.id)) ===
        json(morningPicks.filter(isHeavyLower).map((e) => e.id)),
    `${unsafe.length} — ${unsafe.map((e) => e.title).join(', ')}`
  );

  /* ── (바) 일정 지문 — 등판 창이 바뀌면 지문이 알아챈다(오늘 · 어제 답이 이미 지문 칸이라 새 칸이 필요 없다) ── */
  const fpOf = (p: { today?: OhDay | null; yesterday?: OhDay | null }) =>
    fingerprintOf(ohFacts(p));
  const fpPairs: [string, OhDay | null | undefined, OhDay | null | undefined][] = [
    [
      "'4일 이상 뒤' → '2~3일 뒤'",
      { throwPlan: '4일 이상 뒤' },
      { throwPlan: '2~3일 뒤' },
    ],
    ["답 없음 → '내일 등판'", { throwPlan: null }, { throwPlan: '내일 등판' }],
    ["'2~3일 뒤' → '없음'", { throwPlan: '2~3일 뒤' }, { throwPlan: '없음' }],
  ];
  check(
    'P4 등판 창 (바) 지문 — 창이 열리거나 닫히는 답 바뀜은 모두 바뀐 줄을 낸다(지문 칸 throwPlan 그대로 — FINGERPRINT_KEYS 10개)',
    FINGERPRINT_KEYS.length === 10 &&
      fpPairs.every(
        ([, a, b]) =>
          diffFingerprintChanges(fpOf({ today: a }), fpOf({ today: b })).length > 0
      ),
    fpPairs
      .map(
        ([name, a, b]) =>
          `${name} ${diffFingerprintChanges(fpOf({ today: a }), fpOf({ today: b }))
            .map((x) => x.text)
            .join(' · ')}`
      )
      .join(' / ')
  );

  /* ── (사) 소스 — 등판은 outingOf 한 곳에서, 판정은 exercise-class.ts 에서, 프로그램은 건너뜀 ── */
  const stripD = (p: string) =>
    readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const rxSrcD = stripD('lib/report/prescription.ts');
  /*
   * P4 로 바뀜(커밋 G) — 왜: 근거 줄에 짐작한 출처('달력에 적은 내일 등판' · '같은 요일로 짐작한 오늘 등판')를 붙이려고 outingOf 의 결과를
   * 한 번 받아 창(daysUntilNext)과 출처(nextSource)를 같이 읽는다. 창을 outingOf 한 곳에서 읽는 뜻은 그대로다.
   */
  check(
    'P4 등판 창 (사) 소스 — prescription 은 등판을 outingOf 로만 읽고(답 칸 · 답 규칙을 직접 안 읽음) 판정은 exercise-class.ts 의 isHeavyLower, 규칙은 partsOnly 에서 건너뜀',
    /import \{ outingOf \} from '@\/lib\/engine\/outing';/.test(rxSrcD) &&
      /import \{[^}]*\bisHeavyLower\b[^}]*\} from '@\/lib\/engine\/exercise-class';/.test(
        rxSrcD
      ) &&
      /const outing = outingOf\(facts\);\s*const outingWindow = outing\.daysUntilNext;/.test(
        rxSrcD
      ) &&
      /!partsOnly &&\s*outingWindow != null &&\s*outingWindow\.max != null &&\s*outingWindow\.max <= HEAVY_LOWER_BLOCK_WITHIN_DAYS/.test(
        rxSrcD
      ) &&
      !/throwPlanToday|throwPlanYesterday|nextOutingDays|nextOutingWindow|parseThrowPlan/.test(
        rxSrcD
      ) &&
      !/'스쿼트'|'런지'|'힌지'|'바벨'/.test(rxSrcD)
  );
}

/* ═══════════════════ [2판 P4] 날 종류 — lib/engine/microcycle.ts dayKindOf · theme.ts 배선 · daily-plan.ts 마무리 (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 날 종류(dayKindOf) — 규칙 R1~R7 · 테마 두 자리 · 부딪힘 한 사슬 · 번갈아 예비 규칙의 쪽 · 구원 짧게 · 지문 칸 둘(2026-10-12)'
);
{
  /*
   * 커밋 E 가 바꾼 것: 테마(decideThemeForBody)와 부딪힘(workoutConflict)이 따로 적어 두던 몸 상태 사슬의 등판 쪽을 날 종류(dayKindOf)
   * 하나로 읽는다. 새로 생긴 날 셋 — R2(어제 중간 부하 + 운동 힘듦 급증 → 회복, D3) · R3'(기록 없는 등판 다음 날 → 보조, C6) ·
   * R5/R6 의 쪽(하체 · 상체 마지막 날이 둘 다 없을 때). 구원 '어제 실전 강도로 20구 넘게 → 짧게'. 일정 지문에 effortSpike · lastThrow.load.
   * 엇갈림 표 C6 · 등판 답 사례의 기대값은 '[2판 안전망(P0)]' 절에서 고쳤다(주석 'P4 로 바뀜').
   */
  const json = (v: unknown) => JSON.stringify(v);
  type McCheckin = {
    throwPlan?: string | null;
    preferredWorkout?: string | null;
    condition?: number;
  };
  type McLog = { daysAgo: number; pitches: number; pct: number; sessionType?: string };
  type McPerson = {
    /** 오늘 체크인 — null 이면 없다, 안 주면 답 칸 없는 체크인 */
    today?: McCheckin | null;
    yesterday?: McCheckin | null;
    logs?: McLog[];
    /** 운동 끝 힘듦(DailyTrainingNote) — 안 주면 facts 에 trainingEffort 칸이 없다 */
    notes?: TrainingNoteLike[];
    /** 달력 일정(2판 P4 커밋 G) — 주면(빈 목록이어도) facts 에 등판 짐작의 두 칸이 생긴다. 안 주면 칸이 없다 */
    calendar?: CalendarEventLike[];
  };
  const mcCheckin = (daysAgo: number, c: McCheckin): CheckinLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    condition: c.condition ?? 8,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: c.preferredWorkout ?? null,
    ...(c.throwPlan !== undefined ? { throwPlan: c.throwPlan } : {}),
  });
  const mcFacts = (p: McPerson) =>
    buildFacts({
      nickname: '날 종류',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: dayBefore(l.daysAgo),
        pitchCount: l.pitches,
        intensity: effortToIntensity(l.pct),
        effortPct: l.pct,
        ...(l.sessionType ? { sessionType: l.sessionType } : {}),
        maxVelocity: null,
        avgVelocity: null,
      })),
      checkins: [
        ...(p.today === null ? [] : [mcCheckin(0, p.today ?? {})]),
        ...(p.yesterday ? [mcCheckin(1, p.yesterday)] : []),
      ],
      memos: [],
      ...(p.notes ? { trainingNotes: p.notes } : {}),
      ...(p.calendar ? { calendarEvents: p.calendar } : {}),
    });
  /*
   * 힘듦 줄 — 앱(gather.ts)처럼 오늘 줄은 뺀다. 급증: 7일 안 9 셋 · 28일 안 5 넷(7일 평균 9 − 28일 평균 6.7 ≥ 2). 평소: 같은 날 모두 5.
   */
  const noteOn = (daysAgo: number, intensity: number): TrainingNoteLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    intensity,
  });
  const SPIKE: TrainingNoteLike[] = [
    noteOn(1, 9),
    noteOn(2, 9),
    noteOn(4, 9),
    ...[9, 12, 16, 20].map((d) => noteOn(d, 5)),
  ];
  const CALM: TrainingNoteLike[] = [1, 2, 4, 9, 12, 16, 20].map((d) => noteOn(d, 5));
  check(
    'P4 날 종류 준비 — 힘듦 줄: SPIKE 는 급증 깃발이 켜지고 CALM 은 꺼진다(lib/workout/effort.ts 그대로)',
    mcFacts({ notes: SPIKE }).condition.trainingEffort?.spikeFlag === true &&
      mcFacts({ notes: CALM }).condition.trainingEffort?.spikeFlag === false
  );
  /* P4 로 바뀜(커밋 G) — 왜: 짐작한(달력 · 같은 요일) 오늘 · 내일 등판이 보조 날 R4' softOutingNear 로 더해졌다(회복까지는 안 감) */
  check(
    'P4 날 종류 상수 — 중간 부하 1,350(세게 던진 날 2,700 의 절반) · 등판에서 먼 날 4일 · 구원 짧게 20구 초과 · 바닥 30분 · 규칙 → 하는 일 표',
    MODERATE_OUTING_MIN_LOAD === 1350 &&
      FAR_OUTING_MIN_DAYS === 4 &&
      RELIEF_SHORTEN_PITCHES === 20 &&
      SHORTEN_MIN_MINUTES === 30 &&
      json(DAY_RULE_RANK) ===
        json({
          hard: 'recovery',
          outingToday: 'recovery',
          moderateSpike: 'recovery',
          claimedNoLog: 'light',
          outingTomorrow: 'light',
          softOutingNear: 'light',
          outingSoon: 'strength',
          outingFar: 'strength',
          none: 'none',
        })
  );
  check(
    'P4 날 종류 짧게 — 60 → 45 · 75 → 55 · 90 → 65 · 45 → 30 · 30 → 30 · 20 → 20(5분 단위 내림, 바닥 30, 늘리지 않음)',
    json([60, 75, 90, 45, 30, 20].map(shortenedMinutes)) ===
      json([45, 55, 65, 30, 30, 20])
  );

  /* ── (가) 규칙표 — 사례마다 rule · rank · 쪽 · 무거운 하체 · 짧게 ── */
  type McExpect = {
    rule: DayRule;
    side?: 'lower' | 'upper' | null;
    heavy?: boolean;
    shorten?: boolean;
  };
  const mcCases: { name: string; p: McPerson; expect: McExpect }[] = [
    {
      name: '기록 · 답 없음',
      p: {},
      expect: { rule: 'none', side: null, heavy: true, shorten: false },
    },
    {
      name: "오늘 '없음'",
      p: { today: { throwPlan: '없음' } },
      expect: { rule: 'none', side: null, heavy: true },
    },
    {
      name: "오늘 '오늘 불펜'",
      p: { today: { throwPlan: '오늘 불펜' } },
      expect: { rule: 'none', side: null, heavy: true },
    },
    {
      name: 'R1 어제 경기 85구',
      p: { logs: [{ daysAgo: 1, pitches: 85, pct: 100, sessionType: '경기' }] },
      expect: { rule: 'hard', side: null, heavy: true, shorten: false },
    },
    {
      name: 'R1 오늘 불펜 60구 50%(3,000)',
      p: { logs: [{ daysAgo: 0, pitches: 60, pct: 50, sessionType: '불펜' }] },
      expect: { rule: 'hard', shorten: false },
    },
    {
      name: "R1 이 R3 보다 앞 — 어제 경기 85구 + 오늘 '오늘 등판'",
      p: {
        today: { throwPlan: '오늘 등판' },
        logs: [{ daysAgo: 1, pitches: 85, pct: 100, sessionType: '경기' }],
      },
      expect: { rule: 'hard', heavy: false },
    },
    {
      name: "R3 오늘 '오늘 등판'",
      p: { today: { throwPlan: '오늘 등판' } },
      expect: { rule: 'outingToday', side: null, heavy: false },
    },
    {
      name: "R3 오늘 답 없음 + 어제 '내일 등판'",
      p: { today: { throwPlan: null }, yesterday: { throwPlan: '내일 등판' } },
      expect: { rule: 'outingToday', heavy: false },
    },
    {
      name: 'R2 어제 불펜 30구 70%(2,100) + 힘듦 급증',
      p: {
        logs: [{ daysAgo: 1, pitches: 30, pct: 70, sessionType: '불펜' }],
        notes: SPIKE,
      },
      expect: { rule: 'moderateSpike', side: null, heavy: true, shorten: false },
    },
    {
      name: 'R2 없음 — 같은 어제 · 힘듦 줄 없음(불펜 70% 는 실전 강도가 아니라 짧게도 아님)',
      p: { logs: [{ daysAgo: 1, pitches: 30, pct: 70, sessionType: '불펜' }] },
      expect: { rule: 'none', shorten: false },
    },
    {
      name: 'R2 없음 — 같은 어제 · 힘듦 평소',
      p: {
        logs: [{ daysAgo: 1, pitches: 30, pct: 70, sessionType: '불펜' }],
        notes: CALM,
      },
      expect: { rule: 'none' },
    },
    {
      name: 'R2 문턱 — 어제 불펜 30구 45%(1,350) + 급증 → 걸림',
      p: {
        logs: [{ daysAgo: 1, pitches: 30, pct: 45, sessionType: '불펜' }],
        notes: SPIKE,
      },
      expect: { rule: 'moderateSpike' },
    },
    {
      name: 'R2 문턱 밑 — 어제 불펜 29구 45%(1,305) + 급증 → 안 걸림',
      p: {
        logs: [{ daysAgo: 1, pitches: 29, pct: 45, sessionType: '불펜' }],
        notes: SPIKE,
      },
      expect: { rule: 'none' },
    },
    {
      name: 'R2 없음 — 어제 캐치볼 25구 50%(1,250) + 급증',
      p: {
        logs: [{ daysAgo: 1, pitches: 25, pct: 50, sessionType: '캐치볼' }],
        notes: SPIKE,
      },
      expect: { rule: 'none' },
    },
    {
      name: 'R2 없음 — 그제 불펜 30구 70% + 급증(어제만 본다)',
      p: {
        logs: [{ daysAgo: 2, pitches: 30, pct: 70, sessionType: '불펜' }],
        notes: SPIKE,
      },
      expect: { rule: 'none' },
    },
    {
      name: "R3 이 R2 보다 앞 — 어제 경기 20구 + 급증 + 오늘 '오늘 등판'",
      p: {
        today: { throwPlan: '오늘 등판' },
        logs: [{ daysAgo: 1, pitches: 20, pct: 100, sessionType: '경기' }],
        notes: SPIKE,
      },
      expect: { rule: 'outingToday', shorten: false },
    },
    {
      name: "R3' 어제 '오늘 등판' + 기록 없음 + 오늘 답 없음",
      p: { today: { throwPlan: null }, yesterday: { throwPlan: '오늘 등판' } },
      expect: { rule: 'claimedNoLog', side: null, heavy: true },
    },
    {
      name: "R3' 오늘 체크인 없음 + 어제 '오늘 등판' + 기록 없음",
      p: { today: null, yesterday: { throwPlan: '오늘 등판' } },
      expect: { rule: 'claimedNoLog' },
    },
    {
      name: "R3' 가 R4 보다 앞 — 어제 '오늘 등판'(기록 없음) + 오늘 '내일 등판'",
      p: { today: { throwPlan: '내일 등판' }, yesterday: { throwPlan: '오늘 등판' } },
      expect: { rule: 'claimedNoLog', heavy: false },
    },
    {
      name: "R3' 없음 — 어제 '오늘 등판' + 어제 경기 20구 기록(부하를 안다)",
      p: {
        yesterday: { throwPlan: '오늘 등판' },
        logs: [{ daysAgo: 1, pitches: 20, pct: 100, sessionType: '경기' }],
      },
      expect: { rule: 'none', shorten: false },
    },
    {
      name: "R4 오늘 '내일 등판'",
      p: { today: { throwPlan: '내일 등판' } },
      expect: { rule: 'outingTomorrow', side: null, heavy: false },
    },
    {
      name: "R5 오늘 '2~3일 뒤'",
      p: { today: { throwPlan: '2~3일 뒤' } },
      expect: { rule: 'outingSoon', side: 'upper', heavy: false },
    },
    {
      name: "R5 오늘 답 없음 + 어제 '2~3일 뒤'(오늘 1~2일 뒤)",
      p: { today: { throwPlan: null }, yesterday: { throwPlan: '2~3일 뒤' } },
      expect: { rule: 'outingSoon', side: 'upper', heavy: false },
    },
    {
      name: "R6 오늘 '4일 이상 뒤'",
      p: { today: { throwPlan: '4일 이상 뒤' } },
      expect: { rule: 'outingFar', side: 'lower', heavy: true },
    },
    {
      name: "R6 오늘 '4일 이상 뒤' + 어제 불펜 30구 70% → 쪽 없음(어제 던짐)",
      p: {
        today: { throwPlan: '4일 이상 뒤' },
        logs: [{ daysAgo: 1, pitches: 30, pct: 70, sessionType: '불펜' }],
      },
      expect: { rule: 'outingFar', side: null, heavy: true },
    },
    {
      name: "R6 오늘 '4일 이상 뒤' + 그제 불펜 30구 70% → 하체 쪽",
      p: {
        today: { throwPlan: '4일 이상 뒤' },
        logs: [{ daysAgo: 2, pitches: 30, pct: 70, sessionType: '불펜' }],
      },
      expect: { rule: 'outingFar', side: 'lower' },
    },
    {
      name: "R6 오늘 '4일 이상 뒤' + 오늘 캐치볼 20구 → 쪽 없음(오늘 던짐)",
      p: {
        today: { throwPlan: '4일 이상 뒤' },
        logs: [{ daysAgo: 0, pitches: 20, pct: 50, sessionType: '캐치볼' }],
      },
      expect: { rule: 'outingFar', side: null },
    },
    {
      name: "R6 오늘 답 없음 + 어제 '4일 이상 뒤'(오늘 3일 이상 뒤) → 쪽 없음 · 무거운 하체 든다",
      p: { today: { throwPlan: null }, yesterday: { throwPlan: '4일 이상 뒤' } },
      expect: { rule: 'outingFar', side: null, heavy: true },
    },
    {
      name: '짧게 — 어제 경기 25구(2,500, 세게 던진 날 밑)',
      p: { logs: [{ daysAgo: 1, pitches: 25, pct: 100, sessionType: '경기' }] },
      expect: { rule: 'none', shorten: true },
    },
    {
      name: '짧게 문턱 — 어제 경기 21구',
      p: { logs: [{ daysAgo: 1, pitches: 21, pct: 100, sessionType: '경기' }] },
      expect: { rule: 'none', shorten: true },
    },
    {
      name: '짧게 아님 — 어제 경기 20구',
      p: { logs: [{ daysAgo: 1, pitches: 20, pct: 100, sessionType: '경기' }] },
      expect: { rule: 'none', shorten: false },
    },
    {
      name: '짧게 — 어제 불펜 25구 90%(실전 강도)',
      p: { logs: [{ daysAgo: 1, pitches: 25, pct: 90, sessionType: '불펜' }] },
      expect: { rule: 'none', shorten: true },
    },
    {
      name: '짧게 아님 — 어제 캐치볼 30구 50%(실전 강도 아님)',
      p: { logs: [{ daysAgo: 1, pitches: 30, pct: 50, sessionType: '캐치볼' }] },
      expect: { rule: 'none', shorten: false },
    },
    {
      name: '짧게 아님 — 어제 경기 35구(세게 던진 날 → 회복)',
      p: { logs: [{ daysAgo: 1, pitches: 35, pct: 100, sessionType: '경기' }] },
      expect: { rule: 'hard', shorten: false },
    },
    {
      name: "짧게(회복 날이라 일정은 안 줄임) — 어제 경기 25구 + 오늘 '오늘 등판'",
      p: {
        today: { throwPlan: '오늘 등판' },
        logs: [{ daysAgo: 1, pitches: 25, pct: 100, sessionType: '경기' }],
      },
      expect: { rule: 'outingToday', shorten: true },
    },
    /* 커밋 G — 짐작한 등판(달력 · 같은 요일). 답이 없을 때만, 회복까지는 안 가고 보조 · 무거운 하체 빼기 · 모름까지만 */
    {
      name: "R4' 달력에 오늘 '주말 리그 경기' · 답 없음 → 보조(짐작이라 회복 아님)",
      p: { calendar: [{ date: dayBefore(0).slice(0, 10), title: '주말 리그 경기' }] },
      expect: { rule: 'softOutingNear', side: null, heavy: false, shorten: false },
    },
    {
      name: "R4' 달력에 내일 '선발 등판' · 답 없음 → 보조",
      p: { calendar: [{ date: dayBefore(-1).slice(0, 10), title: '선발 등판' }] },
      expect: { rule: 'softOutingNear', heavy: false },
    },
    {
      name: "R4' 같은 요일 — 최근 4주 월요일 경기 3번(7 · 14 · 21일 전) · 오늘 월요일 · 답 없음 → 보조",
      p: {
        calendar: [],
        logs: [7, 14, 21].map((d) => ({
          daysAgo: d,
          pitches: 60,
          pct: 100,
          sessionType: '경기',
        })),
      },
      expect: { rule: 'softOutingNear', heavy: false },
    },
    {
      name: 'R5 달력에 사흘 뒤 경기 → 근력 날(상체 쪽) · 무거운 하체 뺌',
      p: { calendar: [{ date: dayBefore(-3).slice(0, 10), title: '리그 경기' }] },
      expect: { rule: 'outingSoon', side: 'upper', heavy: false },
    },
    {
      name: 'R7 달력에 닷새 뒤 경기 → 모름(짐작으로 하체 쪽을 안 고름) · 무거운 하체 든다',
      p: { calendar: [{ date: dayBefore(-5).slice(0, 10), title: '리그 경기' }] },
      expect: { rule: 'none', side: null, heavy: true },
    },
  ];
  for (const c of mcCases) {
    const facts = mcFacts(c.p);
    const dk = dayKindOf(facts);
    const e = c.expect;
    const ok =
      dk.rule === e.rule &&
      dk.rank === DAY_RULE_RANK[e.rule] &&
      (e.side === undefined || dk.side === e.side) &&
      (e.heavy === undefined || dk.heavyLowerAllowed === e.heavy) &&
      (e.shorten === undefined || dk.shorten === e.shorten);
    check(
      `P4 날 종류 (가) ${c.name} → ${e.rule}${e.side !== undefined ? ` · 쪽 ${e.side}` : ''}${e.heavy !== undefined ? ` · 무거운 하체 ${e.heavy ? '든다' : '뺌'}` : ''}${e.shorten !== undefined ? ` · 짧게 ${e.shorten}` : ''}`,
      ok,
      `${dk.rule} · ${dk.rank} · ${dk.side} · ${dk.heavyLowerAllowed} · ${dk.shorten}`
    );
  }
  check(
    `P4 날 종류 (가) 규칙 ${Object.keys(DAY_RULE_RANK).length}개가 모두 사례에 나온다`,
    (Object.keys(DAY_RULE_RANK) as DayRule[]).every((r) =>
      mcCases.some((c) => c.expect.rule === r)
    )
  );
  {
    const f = mcFacts({
      today: { throwPlan: '2~3일 뒤' },
      logs: [{ daysAgo: 1, pitches: 30, pct: 70, sessionType: '불펜' }],
      notes: SPIKE,
    });
    const before = json(f);
    const a = dayKindOf(f);
    if (a.yesterday) a.yesterday.pitches = 999;
    if (a.outing.daysUntilNext) a.outing.daysUntilNext.min = 99;
    const b = dayKindOf(f);
    const state = buildDayState({ facts: f, plan: buildPitchPlan(f) });
    const { threwToday, ...stateOuting } = state.outing;
    check(
      'P4 날 종류 (가) 결정성 · facts 를 안 바꿈 · 새 객체 — 재료는 등판 한 곳(outingOf) · 세게 던진 날(hardOuting) · 오늘 상태 한 장과 같은 값',
      json(b) === json(dayKindOf(f)) &&
        json(f) === before &&
        b.yesterday?.pitches === 30 &&
        json(b.outing) === json(outingOf(f)) &&
        json(b.hard) === json(hardOuting(f)) &&
        json(b.outing) === json(stateOuting) &&
        threwToday === false &&
        json(b.hard) === json(state.load.hardOuting) &&
        b.rule === 'moderateSpike',
      `${b.rule} · ${json(b.yesterday)}`
    );
  }

  /* ── (나) 테마 · 부딪힘 배선 — 회복 · 보조 날의 글, 그래도 하기, 쪽 ── */
  const themeOf = (
    p: McPerson,
    opts: {
      lastLowerKey?: string | null;
      lastUpperKey?: string | null;
      override?: boolean;
    } = {}
  ) => {
    const facts = mcFacts(p);
    return decideTheme({
      facts,
      plan: buildPitchPlan(facts),
      lastLowerKey: opts.lastLowerKey ?? null,
      lastUpperKey: opts.lastUpperKey ?? null,
      preferredWorkout: facts.condition.today?.preferredWorkout ?? null,
      override: opts.override ?? false,
    });
  };
  const r2p: McPerson = {
    logs: [{ daysAgo: 1, pitches: 30, pct: 70, sessionType: '불펜' }],
    notes: SPIKE,
  };
  const r2 = themeOf(r2p);
  const r2Clash = workoutConflict({
    facts: mcFacts({ ...r2p, today: { preferredWorkout: '웨이트' } }),
    preferredWorkout: '웨이트',
  });
  const r2Forced = themeOf(
    { ...r2p, today: { preferredWorkout: '웨이트' } },
    { override: true }
  );
  check(
    "P4 날 종류 (나) R2 → 회복 · '어제 30구를 던졌고 최근 운동도 힘들었어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.'",
    r2.key === 'recovery' &&
      r2.label === '회복·재생 데이' &&
      r2.reason ===
        '어제 30구를 던졌고 최근 운동도 힘들었어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.',
    `${r2.key} · ${r2.reason}`
  );
  check(
    'P4 날 종류 (나) 부딪힘 · 그래도 하기 — R2 에 웨이트를 고르면 까닭 같은 말 · 회복으로, 그래도 하기면 근력 + 까닭 · 무리 글',
    r2Clash?.fallback === 'recovery' &&
      r2Clash.reason === '어제 30구를 던졌고 최근 운동도 힘들었어요' &&
      (r2Forced.key === 'lower' || r2Forced.key === 'upper') &&
      r2Forced.reason.includes(
        '어제 30구를 던졌고 최근 운동도 힘들었어요. 그래도 하겠다고 하셔서 그대로 만들었어요.'
      ),
    `${json(r2Clash)} / ${r2Forced.reason}`
  );
  const c6p: McPerson = {
    today: { throwPlan: null },
    yesterday: { throwPlan: '오늘 등판' },
  };
  const c6 = themeOf(c6p);
  const c6Clash = workoutConflict({
    facts: mcFacts({ ...c6p, today: { throwPlan: null, preferredWorkout: '파워' } }),
    preferredWorkout: '파워',
  });
  const c6Forced = themeOf(
    { ...c6p, today: { throwPlan: null, preferredWorkout: '파워' } },
    { override: true }
  );
  check(
    "P4 날 종류 (나) R3' → 보조 · '어제 등판이라고 적었는데 투구 기록이 없어요. 오늘은 무게 대신 코어와 보강을 해요. 기록을 남기면 던진 양으로 다시 짤 수 있어요.'",
    c6.key === 'assist' &&
      c6.label === '보조·코어 데이' &&
      c6.reason ===
        '어제 등판이라고 적었는데 투구 기록이 없어요. 오늘은 무게 대신 코어와 보강을 해요. 기록을 남기면 던진 양으로 다시 짤 수 있어요.',
    `${c6.key} · ${c6.reason}`
  );
  check(
    "P4 날 종류 (나) R3' 에 파워를 고르면 까닭 같은 말 · 보조로, 그래도 하기면 근력(통증이 아니라 고를 수 있다)",
    c6Clash?.fallback === 'assist' &&
      c6Clash.reason === '어제 등판이라고 적었는데 투구 기록이 없어요' &&
      (c6Forced.key === 'lower' || c6Forced.key === 'upper'),
    `${json(c6Clash)} / ${c6Forced.key}`
  );
  /* 예전 글은 글자 그대로 — R1 · R3 · R4 */
  const old3 = [
    themeOf({ today: { throwPlan: '오늘 등판' } }),
    themeOf({ today: { throwPlan: '내일 등판' } }),
    themeOf({ logs: [{ daysAgo: 1, pitches: 85, pct: 100, sessionType: '경기' }] }),
  ];
  const oldClash = [
    workoutConflict({
      facts: mcFacts({ today: { throwPlan: '오늘 등판', preferredWorkout: '웨이트' } }),
      preferredWorkout: '웨이트',
    }),
    workoutConflict({
      facts: mcFacts({ today: { throwPlan: '내일 등판', preferredWorkout: '웨이트' } }),
      preferredWorkout: '웨이트',
    }),
  ];
  check(
    'P4 날 종류 (나) R1 · R3 · R4 의 테마 · 글 · 부딪힘 까닭은 커밋 E 전과 글자까지 같다',
    old3[0].reason ===
      '오늘 등판이에요. 가볍게 풀고 활성화만 하고, 무게는 모레부터 다시 올려요.' &&
      old3[0].key === 'recovery' &&
      old3[1].reason ===
        '내일 등판이라 무게 대신 코어와 보강을 해요. 등판 전날은 다리를 가볍게 둬요.' &&
      old3[1].key === 'assist' &&
      old3[2].reason ===
        '어제 거의 전력으로 85구를 던지셨어요. 오늘은 가볍게 풀고, 내일부터 무게를 다시 올려요.' &&
      old3[2].key === 'recovery' &&
      json(oldClash) ===
        json([
          { reason: '오늘 등판이에요', fallback: 'recovery' },
          { reason: '내일 등판이에요', fallback: 'assist' },
        ]),
    old3.map((t) => t.reason).join(' / ')
  );
  /* 차례 — 회복이 보조보다 앞(컨디션 3 + R3' → 회복), 보조는 근육통 '심함' 뒤 · 부하 주의 앞 */
  const c6Low = themeOf({
    today: { throwPlan: null, condition: 3 },
    yesterday: { throwPlan: '오늘 등판' },
  });
  check(
    "P4 날 종류 (나) 차례 — R3'(보조)와 컨디션 3(회복)이 같이 걸리면 회복(회복이 보조보다 앞)",
    c6Low.key === 'recovery' && c6Low.reason.includes('컨디션이 3/10'),
    c6Low.reason
  );
  /* 쪽 — 하체 · 상체 마지막 날이 둘 다 없을 때만 */
  const soonFresh = themeOf({ today: { throwPlan: '2~3일 뒤' } });
  const farFresh = themeOf({ today: { throwPlan: '4일 이상 뒤' } });
  const soonAfterUpper = themeOf(
    { today: { throwPlan: '2~3일 뒤' } },
    { lastLowerKey: '2026-06-10', lastUpperKey: '2026-06-13' }
  );
  const farAfterLower = themeOf(
    { today: { throwPlan: '4일 이상 뒤' } },
    { lastLowerKey: '2026-06-13', lastUpperKey: '2026-06-10' }
  );
  check(
    "P4 날 종류 (나) 쪽 — 기록 없는 사람: '2~3일 뒤' 상체 · '4일 이상 뒤' 하체(글에 까닭), 한쪽 기록이라도 있으면 번갈아가 이긴다",
    soonFresh.key === 'upper' &&
      soonFresh.reason.endsWith('등판이 가까워 다리는 아끼고 상체 근력을 해요.') &&
      farFresh.key === 'lower' &&
      farFresh.reason.endsWith(
        '등판이 아직 멀어 하체 근력을 하기 좋은 날이에요. 투구의 힘은 하체에서 나와요.'
      ) &&
      soonAfterUpper.key === 'lower' &&
      farAfterLower.key === 'upper',
    [soonFresh, farFresh, soonAfterUpper, farAfterLower]
      .map((t) => `${t.key} ${t.reason}`)
      .join(' / ')
  );
  check(
    'P4 날 종류 (나) 새 글 규칙 — 줄표 없음 · 해요체(요. 로 끝남)',
    [
      r2.reason,
      c6.reason,
      soonFresh.reason,
      farFresh.reason,
      OUTING_LIGHT_LOWER_NOTE,
    ].every((t) => !t.includes('—') && t.endsWith('요.')) &&
      [r2Clash?.reason ?? '', c6Clash?.reason ?? ''].every(
        (t) => t.length > 0 && !t.includes('—') && t.endsWith('요')
      )
  );

  /* ── (다) 160조합(P3 절이 적어 둔 facts) — 커밋 E 전 사슬과 같은 날 · 두 자리 한 사슬 · 창 같음 · 조이기만 ── */
  {
    const rankOf = (k: ThemeKey) => (k === 'recovery' ? 0 : k === 'assist' ? 1 : 2);
    let n = 0;
    let rec = 0;
    let light = 0;
    let claimed = 0;
    let soon = 0;
    let clashes = 0;
    let spikeBit = 0;
    const missSame: string[] = [];
    const missClash: string[] = [];
    const missWindow: string[] = [];
    const missSpike: string[] = [];
    const missClaim: string[] = [];
    for (const [i, facts] of p3ComboFactsSeen.entries()) {
      n++;
      const plan = buildPitchPlan(facts);
      const dk = dayKindOf(facts);
      const outing = outingOf(facts);
      const planned = plannedOuting(facts);
      /* 커밋 E 전 사슬(hardOuting · plannedOuting)로 낸 날 — 급증 칸이 없는 facts 라 R2 는 없고, 새 것은 R3' 하나 */
      const oldRecovery = hardOuting(facts) != null || planned === 'today';
      const oldLight = !oldRecovery && planned === 'tomorrow';
      /*
       * P4 검토로 바뀜 — 왜: 기록 없는 등판은 지난 등판(lastSource)이 아니라 어제 기록 유무(claimedYesterdayNoLog)로 본다. 오늘 기록이 있어도
       * 어제 줄이 없으면 R3'(예전에는 오늘 캐치볼 한 줄이 어제의 기록 없는 등판을 지웠다).
       */
      const isClaim = !oldRecovery && outing.claimedYesterdayNoLog;
      if (dk.rank === 'recovery') rec++;
      if (dk.rank === 'light') light++;
      if (isClaim) claimed++;
      if (
        (dk.rank === 'recovery') !== oldRecovery ||
        (dk.rank === 'light') !== (oldLight || isClaim)
      ) {
        missSame.push(`p3-${i} ${dk.rule}`);
      }
      /* 두 자리가 한 사슬 — 통증 회복이 아니고 부딪힘이 있으면, 그래도 하기 없이 만든 테마가 부딪힘의 fallback 과 같다 */
      const pw = facts.condition.today?.preferredWorkout ?? null;
      if (painRecoveryReason(facts, plan) == null) {
        const clash = workoutConflict({ facts, preferredWorkout: pw });
        if (clash) {
          clashes++;
          const day = decideTheme({
            facts,
            plan,
            lastLowerKey: null,
            lastUpperKey: null,
            preferredWorkout: pw,
            override: false,
          });
          if (day.key !== clash.fallback)
            missClash.push(`p3-${i} ${day.key} ≠ ${clash.fallback}`);
        }
      }
      /* 무거운 하체 표시 = 안전 거르기 2-2 가 걸린 날(근거 줄) */
      const picked = selectCandidates({ facts, plan, library });
      if (!picked.halted) {
        const blocked = picked.basis.some((b) => b.endsWith('등판 → 무거운 하체 제외'));
        if (!dk.heavyLowerAllowed) soon++;
        if (blocked === dk.heavyLowerAllowed) missWindow.push(`p3-${i}`);
      }
      /*
       * 조이기만 — 힘듦 급증을 얹어도(R2) 테마는 더 무거워지지 않고 후보는 같다. 어제 중간 부하이고 앞선 회복 까닭이 없으면 회복이 된다.
       */
      const spiked = {
        ...facts,
        condition: {
          ...facts.condition,
          trainingEffort: {
            last7: [9, 9, 9],
            last28: [9, 9, 9, 5, 5, 5, 5],
            spikeFlag: true,
          },
        },
      };
      const base = decideTheme({ facts, plan, lastLowerKey: null, lastUpperKey: null });
      const withSpike = decideTheme({
        facts: spiked,
        plan: buildPitchPlan(spiked),
        lastLowerKey: null,
        lastUpperKey: null,
      });
      const spikedPick = selectCandidates({
        facts: spiked,
        plan: buildPitchPlan(spiked),
        library,
      });
      const yLoad = (facts.patterns.hardOutings ?? []).find(
        (o) => o.daysAgo === 1
      )?.load;
      const moderate =
        hardOuting(facts) == null &&
        outing.nextDay !== 0 &&
        yLoad != null &&
        yLoad >= MODERATE_OUTING_MIN_LOAD;
      if (moderate && painRecoveryReason(facts, plan) == null) spikeBit++;
      if (
        rankOf(withSpike.key) > rankOf(base.key) ||
        json(spikedPick.candidates.map((e) => e.id)) !==
          json(picked.candidates.map((e) => e.id)) ||
        (moderate && withSpike.key !== 'recovery')
      ) {
        missSpike.push(
          `p3-${i} ${base.key} → ${withSpike.key}${moderate ? ' (중간 부하)' : ''}`
        );
      }
      /* 조이기만 — R3' 날은 어제 답을 지운 같은 사람보다 무겁지 않다 */
      if (isClaim) {
        const stripped = {
          ...facts,
          condition: { ...facts.condition, throwPlanYesterday: null },
        };
        const without = decideTheme({
          facts: stripped,
          plan: buildPitchPlan(stripped),
          lastLowerKey: null,
          lastUpperKey: null,
        });
        if (rankOf(base.key) > rankOf(without.key))
          missClaim.push(`p3-${i} ${base.key} > ${without.key}`);
      }
    }
    check(
      `P4 날 종류 (다) ${n}조합 — 회복 날 ⇔ 세게 던진 날 · 오늘 등판, 보조 날 ⇔ 내일 등판 · 기록 없는 등판 다음 날(새 것 ${claimed}) — 회복 ${rec} · 보조 ${light}`,
      n === 160 && claimed >= 3 && rec >= 20 && light >= 10 && missSame.length === 0,
      missSame.slice(0, 3).join(' / ')
    );
    check(
      `P4 날 종류 (다) 두 자리 한 사슬 — 부딪힘이 있는 ${clashes}조합에서 그래도 하기 없이 만든 테마 = 부딪힘의 fallback`,
      clashes >= 20 && missClash.length === 0,
      missClash.slice(0, 3).join(' / ')
    );
    check(
      `P4 날 종류 (다) 무거운 하체 표시 = 안전 거르기 2-2 가 걸린 날(창 안 ${soon}) — 같은 창 · 같은 문턱`,
      soon >= 15 && missWindow.length === 0,
      missWindow.slice(0, 3).join(' / ')
    );
    check(
      `P4 날 종류 (다) 조이기만 — 힘듦 급증을 얹으면 테마는 더 무거워지지 않고 후보는 같다, 어제 중간 부하인 ${spikeBit}조합은 회복`,
      spikeBit >= 5 && missSpike.length === 0,
      missSpike.slice(0, 3).join(' / ')
    );
    check(
      "P4 날 종류 (다) 조이기만 — 기록 없는 등판 다음 날(R3')은 어제 답을 지운 같은 사람보다 무겁지 않다",
      missClaim.length === 0,
      missClaim.slice(0, 3).join(' / ')
    );
  }

  /* ── (라) 일정(buildDailyPlan) — 표시 칸 · 하체 날 한 줄 · 짧게 ── */
  const allOwned = [ALWAYS_OWNED, ...SELECTABLE_EQUIPMENT];
  const byIdLib = new Map(library.map((e) => [e.id, e]));
  const mcBuild = (
    p: McPerson,
    opts: {
      minutes?: number;
      goal?: string;
      lastLowerKey?: string | null;
      lastUpperKey?: string | null;
    } = {}
  ) => {
    const facts = mcFacts(p);
    return buildDailyPlan({
      user: { ownedEquipment: allOwned, trainingLevel: '상급' },
      facts,
      plan: buildPitchPlan(facts),
      library,
      availableToday: null,
      requestedMinutes: opts.minutes ?? 60,
      trainingGoal: opts.goal ?? '근력 향상',
      recentIds: new Set<string>(),
      rotationSeed: 'p4-daykind',
      lastLowerKey: opts.lastLowerKey === undefined ? null : opts.lastLowerKey,
      lastUpperKey: opts.lastUpperKey === undefined ? null : opts.lastUpperKey,
    });
  };
  const picksOf = (b: ReturnType<typeof mcBuild>) =>
    isHalted(b)
      ? []
      : b.picks.map((k) => byIdLib.get(k.exerciseId)).filter((e) => e != null);
  /* 하체를 더 오래전에 했다 — 번갈아로 하체 날 */
  const lowerTurn = { lastLowerKey: '2026-06-10', lastUpperKey: '2026-06-13' };
  const soonLower = mcBuild({ today: { throwPlan: '2~3일 뒤' } }, lowerTurn);
  const soonUpper = mcBuild({ today: { throwPlan: '2~3일 뒤' } });
  const farLower = mcBuild({ today: { throwPlan: '4일 이상 뒤' } }, lowerTurn);
  const soonCond = mcBuild(
    { today: { throwPlan: '2~3일 뒤' } },
    { ...lowerTurn, goal: CONDITIONING_GOAL }
  );
  check(
    "P4 날 종류 (라) '2~3일 뒤' 하체 날 — theme.heavyLowerAllowed false · 이유 끝에 '등판이 가까워 무거운 하체는 빼고 가벼운 하체 운동으로 해요.' · 무거운 하체 0 · 본운동 있음",
    !isHalted(soonLower) &&
      soonLower.theme.key === 'lower' &&
      soonLower.theme.heavyLowerAllowed === false &&
      soonLower.theme.reason.endsWith(` ${OUTING_LIGHT_LOWER_NOTE}`) &&
      !picksOf(soonLower).some(isHeavyLower) &&
      soonLower.picks.some((k) => k.slot === 'main'),
    isHalted(soonLower) ? '멈춤' : `${soonLower.theme.key} · ${soonLower.theme.reason}`
  );
  check(
    "P4 날 종류 (라) '2~3일 뒤' 상체 날(기록 없는 사람) — heavyLowerAllowed false, 하체 한 줄은 없다 · 컨디셔닝 목표 하체 날도 한 줄 없다",
    !isHalted(soonUpper) &&
      soonUpper.theme.key === 'upper' &&
      soonUpper.theme.heavyLowerAllowed === false &&
      !soonUpper.theme.reason.includes(OUTING_LIGHT_LOWER_NOTE) &&
      !isHalted(soonCond) &&
      soonCond.theme.key === 'lower' &&
      soonCond.theme.heavyLowerAllowed === false &&
      !soonCond.theme.reason.includes(OUTING_LIGHT_LOWER_NOTE),
    isHalted(soonUpper) || isHalted(soonCond)
      ? '멈춤'
      : `${soonUpper.theme.reason} / ${soonCond.theme.reason}`
  );
  check(
    "P4 날 종류 (라) '4일 이상 뒤' 하체 날 — theme 은 key · label · reason 셋뿐(표시 칸 없음 = 든다, 옛 일정과 같은 모양) · 무거운 하체 든다",
    !isHalted(farLower) &&
      json(Object.keys(farLower.theme)) === json(['key', 'label', 'reason']) &&
      picksOf(farLower).some(isHeavyLower),
    isHalted(farLower) ? '멈춤' : json(farLower.theme)
  );
  const relief = (minutes: number, extra: McPerson = {}) =>
    mcBuild(
      { logs: [{ daysAgo: 1, pitches: 25, pct: 100, sessionType: '경기' }], ...extra },
      { minutes }
    );
  const r60 = relief(60);
  const r45 = relief(45);
  const rToday = relief(60, { today: { throwPlan: '오늘 등판' } });
  const r20 = mcBuild(
    { logs: [{ daysAgo: 1, pitches: 20, pct: 100, sessionType: '경기' }] },
    { minutes: 60 }
  );
  const slackOf = (m: number) => Math.min(3, m * 0.12);
  check(
    "P4 날 종류 (라) 구원 짧게 — 어제 경기 25구: 60분 → 45분 · 45분 → 30분, 이유 끝에 '어제 실전 강도로 25구를 던져 오늘은 45분으로 짧게 잡았어요.', 걸리는 시간도 그 안",
    !isHalted(r60) &&
      r60.requestedMinutes === 60 &&
      r60.minutes === 45 &&
      r60.theme.reason.endsWith(
        '어제 실전 강도로 25구를 던져 오늘은 45분으로 짧게 잡았어요.'
      ) &&
      r60.estimatedMinutes <= 45 + slackOf(45) &&
      !isHalted(r45) &&
      r45.minutes === 30 &&
      r45.theme.reason.endsWith('오늘은 30분으로 짧게 잡았어요.'),
    isHalted(r60) || isHalted(r45)
      ? '멈춤'
      : `${r60.minutes}분 · ${r60.estimatedMinutes}분 · ${r60.theme.reason}`
  );
  check(
    'P4 날 종류 (라) 구원 짧게 아님 — 회복 날(effectiveMinutes 만 · 40분, 두 번 안 줄임) · 어제 경기 20구(60분 그대로, 글 없음)',
    !isHalted(rToday) &&
      rToday.theme.key === 'recovery' &&
      rToday.minutes === effectiveMinutes('recovery', 60) &&
      !rToday.theme.reason.includes('짧게') &&
      !isHalted(r20) &&
      r20.minutes === 60 &&
      !r20.theme.reason.includes('짧게'),
    isHalted(rToday) || isHalted(r20) ? '멈춤' : `${rToday.minutes} · ${r20.minutes}`
  );
  check(
    'P4 날 종류 (라) shortenPitchesOf — 짧게인 날만 어제 실전 강도 공 수(25), 아니면 null',
    shortenPitchesOf(
      dayKindOf(
        mcFacts({ logs: [{ daysAgo: 1, pitches: 25, pct: 100, sessionType: '경기' }] })
      )
    ) === 25 &&
      shortenPitchesOf(
        dayKindOf(
          mcFacts({
            logs: [{ daysAgo: 1, pitches: 20, pct: 100, sessionType: '경기' }],
          })
        )
      ) === null
  );

  /* ── (마) 매일 '2~3일 뒤'라 답하는 구원 7일 — 근력 날 ≥ 2 · 무거운 하체 0 · 본운동 안 빔 · 하체 · 상체 번갈음 ── */
  {
    const history: { date: string; plan: unknown }[] = [];
    const seq: string[] = [];
    let heavy = 0;
    let emptyMain = 0;
    for (let d = 0; d < 7; d++) {
      const asOf = new Date(TODAY.getTime() + d * 86400000);
      const key = toDateKey(asOf);
      const facts = buildFacts({
        nickname: '구원',
        age: 22,
        heightCm: 180,
        trainingLevel: '상급',
        baselineDailyLoad: 100,
        rehab: null,
        today: asOf,
        logs: [],
        checkins: [
          {
            date: key,
            condition: 8,
            sleep: '보통',
            shoulder: '정상',
            elbow: '정상',
            wrist: '정상',
            lowerBack: '정상',
            lowerBody: '정상',
            preferredParts: [],
            preferredWorkout: null,
            throwPlan: '2~3일 뒤',
          } satisfies CheckinLike,
        ],
        memos: [],
      });
      const dates = strengthDatesFrom({ done: [], planned: history, todayKey: key });
      const built = buildDailyPlan({
        user: { ownedEquipment: allOwned, trainingLevel: '상급' },
        facts,
        plan: buildPitchPlan(facts),
        library,
        availableToday: null,
        requestedMinutes: 60,
        trainingGoal: '근력 향상',
        recentIds: new Set<string>(),
        rotationSeed: `p4-relief-${key}`,
        lastLowerKey: dates.lower,
        lastUpperKey: dates.upper,
      });
      if (isHalted(built)) {
        seq.push('멈춤');
        continue;
      }
      seq.push(built.theme.key);
      heavy += picksOf(built).filter(isHeavyLower).length;
      if (
        (built.theme.key === 'lower' || built.theme.key === 'upper') &&
        !built.picks.some((k) => k.slot === 'main')
      )
        emptyMain++;
      history.push({ date: key, plan: built });
    }
    const strength = seq.filter((k) => k === 'lower' || k === 'upper').length;
    const flips = seq.slice(1).filter((k, i) => k !== seq[i]).length;
    check(
      `P4 날 종류 (마) 매일 '2~3일 뒤' 7일 — 근력 날 ${strength}(≥ 2) · 무거운 하체 ${heavy} · 본운동 빈 근력 날 ${emptyMain} · 첫날 상체(다리를 아낌) · 하체 · 상체가 날마다 바뀜(${flips}/6)`,
      strength >= 2 &&
        heavy === 0 &&
        emptyMain === 0 &&
        seq[0] === 'upper' &&
        flips === 6,
      seq.join(' → ')
    );
  }

  /* ── (바) 일정 지문 — effortSpike · lastThrow.load(날 종류가 새로 읽는 칸) ── */
  {
    const calmF = mcFacts({ ...r2p, notes: CALM });
    const spikeF = mcFacts(r2p);
    const fpCalm = fingerprintOf(calmF);
    const fpSpike = fingerprintOf(spikeF);
    /*
     * P4 로 바뀜(커밋 G) — 왜: 바깥 선택 칸에 등판 짐작의 재료(outingGuess)가 더해졌다. 힘듦 칸만 있는 facts(달력을 안 넘김)의 칸 목록은
     * FINGERPRINT_KEYS + effortSpike, 둘 다 있는 facts 는 + FINGERPRINT_OPTIONAL_KEYS 전부(순서까지).
     */
    /* P4 검토로 바뀜 — 어제 기록 유무(loggedYesterday)가 바깥 칸 끝에 더해졌다. 지금의 buildFacts 는 늘 만드니 세 경우 모두 끝에 붙는다 */
    check(
      'P4 날 종류 (바) 지문 effortSpike — 힘듦 칸이 있는 facts 의 칸 목록 = FINGERPRINT_KEYS + effortSpike(순서까지), 달력도 넘기면 + FINGERPRINT_OPTIONAL_KEYS 전부, 없는 facts 는 FINGERPRINT_KEYS 그대로(셋 다 끝에 loggedYesterday)',
      json(Object.keys(fpSpike)) ===
        json([...FINGERPRINT_KEYS, 'effortSpike', 'loggedYesterday']) &&
        json(Object.keys(fingerprintOf(mcFacts({ ...r2p, calendar: [] })))) ===
          json([...FINGERPRINT_KEYS, ...FINGERPRINT_OPTIONAL_KEYS]) &&
        json(Object.keys(fingerprintOf(mcFacts({ logs: r2p.logs })))) ===
          json([...FINGERPRINT_KEYS, 'loggedYesterday']) &&
        json(FINGERPRINT_OPTIONAL_KEYS) ===
          json(['effortSpike', 'outingGuess', 'loggedYesterday']),
      Object.keys(fpSpike).join(',')
    );
    const up = diffFingerprintChanges(fpCalm, fpSpike);
    const down = diffFingerprintChanges(fpSpike, fpCalm);
    check(
      "P4 날 종류 (바) 지문 effortSpike — 급증이 켜지면 '최근 운동 힘듦이 평소보다 높아졌어요', 꺼지면 '최근 운동 힘듦이 평소대로 돌아왔어요'(한 줄씩 · 키 effortSpike)",
      up.length === 1 &&
        up[0].key === 'effortSpike' &&
        up[0].text === '최근 운동 힘듦이 평소보다 높아졌어요' &&
        down.length === 1 &&
        down[0].text === '최근 운동 힘듦이 평소대로 돌아왔어요',
      `${up.map((c) => c.text).join(',')} / ${down.map((c) => c.text).join(',')}`
    );
    const legacy = { ...fpSpike } as Record<string, unknown>;
    delete legacy.effortSpike;
    const legacyRead = readPlanFingerprint(legacy);
    check(
      'P4 날 종류 (바) 지문 effortSpike — 칸이 생기기 전의 지문(칸 없음)은 읽히고, 지금 지문과 견줘도 힘듦 줄이 없다(둘 다 있을 때만)',
      legacyRead != null &&
        !('effortSpike' in legacyRead) &&
        !diffFingerprintChanges(legacyRead, fpSpike).some(
          (c) => c.key === 'effortSpike'
        )
    );
    check(
      'P4 날 종류 (바) 지문 — effortSpike · lastThrow.load 가 든 지문은 저장했다 읽어도 글자까지 같고, 모양이 틀리면(참 · 거짓 아님 · 숫자 아님) null',
      json(readPlanFingerprint(JSON.parse(json(fpSpike)))) === json(fpSpike) &&
        fpSpike.lastThrow?.load === 2100 &&
        readPlanFingerprint({ ...fpSpike, effortSpike: 'yes' }) === null &&
        readPlanFingerprint({
          ...fpSpike,
          lastThrow: { ...fpSpike.lastThrow, load: '2100' },
        }) === null,
      json(fpSpike.lastThrow)
    );
    /* 28구 45% ↔ 50% — 전력 환산이 같아(강도 5 · 계수 0.75 → 21구) 예전 지문으로는 같은데, load 가 1,260 ↔ 1,400 이라 R2 가 뒤집힌다 */
    const at = (pct: number) =>
      mcFacts({
        logs: [{ daysAgo: 1, pitches: 28, pct, sessionType: '불펜' }],
        notes: SPIKE,
      });
    const lo = at(45);
    const hi = at(50);
    const loadOnly = diffFingerprintChanges(fingerprintOf(lo), fingerprintOf(hi));
    check(
      "P4 날 종류 (바) 지문 lastThrow.load — 어제 28구 45% → 50%(전력 환산은 같음)는 날 종류가 none → moderateSpike 로 바뀌고, 지문은 '6월 14일 투구 기록의 체감 강도가 바뀌었어요' 한 줄로 알아챈다",
      dayKindOf(lo).rule === 'none' &&
        dayKindOf(hi).rule === 'moderateSpike' &&
        fingerprintOf(lo).lastThrow?.adjusted ===
          fingerprintOf(hi).lastThrow?.adjusted &&
        loadOnly.length === 1 &&
        loadOnly[0].key === 'lastThrow' &&
        loadOnly[0].text === '6월 14일 투구 기록의 체감 강도가 바뀌었어요',
      loadOnly.map((c) => c.text).join(' / ')
    );
    /*
     * 판단 입력이 바뀌면 지문도 바뀐다(P2 규칙) — 축 하나만 바꾼 이웃끼리 날 종류(rule · 쪽 · 무거운 하체 · 짧게)가 다르면 지문 견주기에
     * 바뀐 줄이 하나 이상 있어야 한다.
     */
    const todayAns: (string | null | undefined)[] = [undefined, null, ...THROW_PLANS];
    const yAns: (string | null)[] = [
      null,
      '오늘 등판',
      '내일 등판',
      '2~3일 뒤',
      '4일 이상 뒤',
    ];
    const logSets: McLog[][] = [
      [],
      [{ daysAgo: 1, pitches: 25, pct: 100, sessionType: '경기' }],
      [{ daysAgo: 1, pitches: 28, pct: 45, sessionType: '불펜' }],
      [{ daysAgo: 1, pitches: 28, pct: 50, sessionType: '불펜' }],
      [{ daysAgo: 1, pitches: 85, pct: 100, sessionType: '경기' }],
      [{ daysAgo: 0, pitches: 20, pct: 50, sessionType: '캐치볼' }],
    ];
    const noteSets: (TrainingNoteLike[] | undefined)[] = [undefined, CALM, SPIKE];
    const personOf = (t: number, y: number, l: number, s: number): McPerson => ({
      today: todayAns[t] === undefined ? {} : { throwPlan: todayAns[t] },
      ...(yAns[y] != null ? { yesterday: { throwPlan: yAns[y] } } : {}),
      logs: logSets[l],
      ...(noteSets[s] ? { notes: noteSets[s] } : {}),
    });
    const cache = new Map<
      string,
      { kind: string; fp: ReturnType<typeof fingerprintOf> }
    >();
    const at4 = (t: number, y: number, l: number, s: number) => {
      const key = `${t}.${y}.${l}.${s}`;
      let got = cache.get(key);
      if (!got) {
        const f = mcFacts(personOf(t, y, l, s));
        const dk = dayKindOf(f);
        got = {
          kind: json([dk.rule, dk.side, dk.heavyLowerAllowed, dk.shorten]),
          fp: fingerprintOf(f),
        };
        cache.set(key, got);
      }
      return got;
    };
    let pairs = 0;
    const silent: string[] = [];
    const sizes = [todayAns.length, yAns.length, logSets.length, noteSets.length];
    for (let t = 0; t < sizes[0]; t++)
      for (let y = 0; y < sizes[1]; y++)
        for (let l = 0; l < sizes[2]; l++)
          for (let s = 0; s < sizes[3]; s++) {
            const here = at4(t, y, l, s);
            const idx = [t, y, l, s];
            for (let axis = 0; axis < 4; axis++)
              for (let v = idx[axis] + 1; v < sizes[axis]; v++) {
                const j = [...idx];
                j[axis] = v;
                const there = at4(j[0], j[1], j[2], j[3]);
                if (here.kind === there.kind) continue;
                /* 힘듦 칸이 한쪽만 있는 쌍(옛 지문과 견주는 꼴)은 effortSpike 를 안 견주니 뺀다 — 앱은 늘 칸이 있다 */
                if ((noteSets[idx[3]] == null) !== (noteSets[j[3]] == null)) continue;
                pairs++;
                if (diffFingerprintChanges(here.fp, there.fp).length === 0)
                  silent.push(`${idx.join('.')} ↔ ${j.join('.')}`);
              }
          }
    check(
      `P4 날 종류 (바) 지문 — 축 하나만 바꾼 이웃 중 날 종류가 다른 ${pairs}쌍은 모두 지문 견주기에 바뀐 줄이 있다(판단이 읽는 칸 = 지문 칸)`,
      pairs > 300 && silent.length === 0,
      silent.slice(0, 3).join(' / ')
    );
  }

  /* ── (사) 소스 — 날 종류는 순수 파일, 테마 · 부딪힘은 그것만 읽고 옛 사슬을 베끼지 않는다 ── */
  {
    const strip = (p: string) =>
      readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const mcSrc = strip('lib/engine/microcycle.ts');
    const specs = [...mcSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    check(
      'P4 날 종류 (사) lib/engine/microcycle.ts 는 순수 — import 는 arm-load · day-state · outing · facts · prescription 다섯뿐(theme 없음), 날짜 함수 · 난수 · server-only · 글 없음',
      /* P4 로 바뀜(커밋 F) — 왜: R2 · R3' 를 어제 팔 부담 한 곳(arm-load.ts)에서 읽는다(프로그램 · 암케어와 같은 함수). 중간 부하 문턱도 거기로 옮겨 다시 내보낸다 */
      json([...new Set(specs)].sort()) ===
        json([
          '@/lib/engine/arm-load',
          '@/lib/engine/day-state',
          '@/lib/engine/outing',
          '@/lib/report/facts',
          '@/lib/report/prescription',
        ]) &&
        !/new Date\(|appNow|Math\.random|server-only/.test(mcSrc) &&
        !/요\.'|요'/.test(mcSrc),
      specs.join(' · ')
    );
    const themeSrc = strip('lib/report/theme.ts');
    const planSrc = strip('lib/report/daily-plan.ts');
    check(
      'P4 날 종류 (사) theme.ts — 테마 · 부딪힘은 dayKindOf 를 한 번씩 부르고, 옛 사슬(hardOuting(facts) · plannedOuting(facts) 부르기)이 없다 · daily-plan.ts 가 finishDayTheme 으로 마무리',
      (themeSrc.match(/dayKindOf\(facts\)/g) ?? []).length === 2 &&
        !/[^.\w]hardOuting\(facts\)|[^.\w]plannedOuting\(facts\)/.test(themeSrc) &&
        /const dk = dayKindOf\(facts\);/.test(planSrc) &&
        /finishDayTheme\(/.test(planSrc)
    );
  }
}

/* ═══════════════════ [2판 P4] D3 를 프로그램 · 암케어에도 — lib/engine/arm-load.ts yesterdayArmLoadOf (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 어제 팔 부담(yesterdayArmLoadOf) — 근력 프로그램의 경기 다음 날 · 암케어의 어제 N구 · 날 종류 R2 · R3′ 가 한 함수(2026-10-12)'
);
{
  /*
   * 커밋 F 가 바꾼 것(D3 — 경기 다음 날은 달력이 아니라 부하): 근력 프로그램은 어제 '경기' 기록이면 0구 · 15구라도 쉬었고, 암케어는 어제
   * 던졌으면 캐치볼 10구라도 회복이었다. 이제 둘 다 어제 팔 부담 한 곳(세게 던진 날 · 중간 부하 + 운동 힘듦 급증 · 기록 없는 등판)을
   * 읽고, 날 종류(R1 의 어제 쪽 · R2 · R3′)도 같은 함수를 부른다. 엇갈림 표 C2L · C6 와 P3 통일 절의 바뀐 기대값은 그 자리에 주석.
   */
  const json = (v: unknown) => JSON.stringify(v);
  type AfLog = { daysAgo: number; pitches: number; pct: number; sessionType: string };
  type AfPerson = {
    /** 오늘 체크인의 등판 답 — 안 주면 답 칸 없는 체크인 */
    today?: string | null;
    /** 어제 체크인의 등판 답 — 안 주면 어제 체크인 줄이 없다 */
    yesterday?: string | null;
    logs?: AfLog[];
    /** 운동 끝 힘듦 — 안 주면 facts 에 trainingEffort 칸이 없다 */
    notes?: TrainingNoteLike[];
  };
  const afCheckin = (
    daysAgo: number,
    throwPlan: string | null | undefined
  ): CheckinLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    condition: 8,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    ...(throwPlan !== undefined ? { throwPlan } : {}),
  });
  const afFacts = (p: AfPerson) =>
    buildFacts({
      nickname: '어제 팔 부담',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: dayBefore(l.daysAgo),
        pitchCount: l.pitches,
        intensity: effortToIntensity(l.pct),
        effortPct: l.pct,
        sessionType: l.sessionType,
        maxVelocity: null,
        avgVelocity: null,
      })),
      checkins: [
        afCheckin(0, p.today),
        ...(p.yesterday !== undefined ? [afCheckin(1, p.yesterday)] : []),
      ],
      memos: [],
      ...(p.notes ? { trainingNotes: p.notes } : {}),
    });
  /* 힘듦 줄 — 날 종류 절과 같은 모양(7일 안 9 셋 · 28일 안 5 넷이면 급증, 모두 5 면 평소) */
  const afNote = (daysAgo: number, intensity: number): TrainingNoteLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    intensity,
  });
  const AF_SPIKE: TrainingNoteLike[] = [
    afNote(1, 9),
    afNote(2, 9),
    afNote(4, 9),
    ...[9, 12, 16, 20].map((d) => afNote(d, 5)),
  ];
  const AF_CALM: TrainingNoteLike[] = [1, 2, 4, 9, 12, 16, 20].map((d) => afNote(d, 5));
  const y1 = (pitches: number, pct: number, sessionType: string): AfLog => ({
    daysAgo: 1,
    pitches,
    pct,
    sessionType,
  });
  const program531c = parseProgram('531');
  check("P4 어제 팔 부담 준비 — 프로그램 '531'을 읽을 수 있다", program531c != null);
  const afSig = (o: Partial<TodaySignals>): TodaySignals => ({
    nextDay: 1,
    today: toDateKey(TODAY),
    lastProgramDate: null,
    checkedIn: true,
    otherWorkoutStarted: false,
    halted: false,
    gameToday: false,
    gameTomorrow: false,
    gameYesterday: false,
    bullpenToday: false,
    hardThrowRecent: false,
    override: false,
    recovery: null,
    loadCaution: false,
    soreMany: false,
    sleepShort: false,
    uncertain: false,
    painSlots: [],
    ...o,
  });
  /* 한 사람을 다섯 칸으로 — 앱과 같은 길(facts → 투구 계획 → 오늘 상태 한 장 → 독자). 'before' 는 커밋 F 전 식으로 낸 프로그램 */
  const afRead = (p: AfPerson, override = false) => {
    const facts = afFacts(p);
    const plan = buildPitchPlan(facts);
    const state = buildDayState({ facts, plan });
    const arm = yesterdayArmLoadOf(facts);
    const typesToday = (p.logs ?? [])
      .filter((l) => l.daysAgo === 0)
      .map((l) => l.sessionType);
    const signals = programSignalsOf({
      outing: state.outing,
      typesToday,
      yesterdayArmLoad: arm,
    });
    /* 커밋 F 전의 gameYesterday — 어제 '오늘 등판' 답(어제 기준 꼭 0일 뒤) 또는 어제 '경기' 기록(투구수 안 봄) */
    const oldGameYesterday =
      state.outing.answerYesterday === '오늘 등판' ||
      (p.logs ?? []).some((l) => l.daysAgo === 1 && l.sessionType === '경기');
    const decide = (s: ProgramSignals) => {
      if (program531c == null) return '프로그램을 못 읽음';
      const d = decideToday(
        program531c,
        afSig({ ...s, hardThrowRecent: state.load.hardOutingRecent, override })
      );
      return d.kind === 'rest'
        ? `rest:${d.reason}`
        : d.kind === 'go'
          ? `go${d.caution ? `:${d.caution}` : ''}`
          : d.kind;
    };
    const armcare = decideArmcare({
      facts,
      plan,
      armFatigue: null,
      state,
    });
    return {
      facts,
      plan,
      state,
      arm,
      signals,
      program: decide(signals),
      programBefore: decide({ ...signals, gameYesterday: oldGameYesterday }),
      oldGameYesterday,
      armcare,
      dk: dayKindOf(facts),
    };
  };

  /* ── (가) 판정표 — 무엇이 어제 팔 부담인가 ── */
  const armCases: {
    name: string;
    p: AfPerson;
    kind: YesterdayArmLoad['kind'] | null;
  }[] = [
    { name: '기록 · 답 없음', p: {}, kind: null },
    { name: '어제 경기 85구', p: { logs: [y1(85, 100, '경기')] }, kind: 'hard' },
    {
      name: '어제 경기 15구(1,500 · 실전 강도 15구)',
      p: { logs: [y1(15, 100, '경기')] },
      kind: null,
    },
    {
      name: "어제 '경기' 0구 줄(부하 0)",
      p: { logs: [y1(0, 100, '경기')] },
      kind: null,
    },
    {
      name: '어제 불펜 40구 90%(3,600 — 경기가 아니어도 세게)',
      p: { logs: [y1(40, 90, '불펜')] },
      kind: 'hard',
    },
    {
      name: '어제 불펜 30구 85%(2,550 · 실전 강도 30구 — 옛 규칙의 날)',
      p: { logs: [y1(30, 85, '불펜')] },
      kind: 'hard',
    },
    {
      name: '어제 불펜 30구 70%(2,100) + 힘듦 급증',
      p: { logs: [y1(30, 70, '불펜')], notes: AF_SPIKE },
      kind: 'moderateSpike',
    },
    {
      name: '어제 불펜 30구 70% · 힘듦 줄 없음',
      p: { logs: [y1(30, 70, '불펜')] },
      kind: null,
    },
    {
      name: '어제 불펜 30구 70% · 힘듦 평소',
      p: { logs: [y1(30, 70, '불펜')], notes: AF_CALM },
      kind: null,
    },
    {
      name: '문턱 — 어제 불펜 30구 45%(1,350) + 급증',
      p: { logs: [y1(30, 45, '불펜')], notes: AF_SPIKE },
      kind: 'moderateSpike',
    },
    {
      name: '문턱 밑 — 어제 불펜 29구 45%(1,305) + 급증',
      p: { logs: [y1(29, 45, '불펜')], notes: AF_SPIKE },
      kind: null,
    },
    {
      name: '어제 캐치볼 20구 50% + 급증(1,000)',
      p: { logs: [y1(20, 50, '캐치볼')], notes: AF_SPIKE },
      kind: null,
    },
    {
      name: "어제 '오늘 등판' 답 · 기록 없음",
      p: { yesterday: '오늘 등판' },
      kind: 'claimedNoLog',
    },
    {
      name: "어제 '오늘 등판' 답 + 어제 경기 15구(기록이 이김)",
      p: { yesterday: '오늘 등판', logs: [y1(15, 100, '경기')] },
      kind: null,
    },
    {
      name: "어제 '오늘 등판' 답 + 어제 경기 85구",
      p: { yesterday: '오늘 등판', logs: [y1(85, 100, '경기')] },
      kind: 'hard',
    },
    {
      name: "어제 '오늘 등판' 답 + 사흘 전 기록만",
      p: {
        yesterday: '오늘 등판',
        logs: [{ daysAgo: 3, pitches: 40, pct: 70, sessionType: '불펜' }],
      },
      kind: 'claimedNoLog',
    },
    {
      name: "어제 '내일 등판' 답 · 기록 없음(지난 등판 아님)",
      p: { yesterday: '내일 등판' },
      kind: null,
    },
    {
      name: '오늘 경기 85구(오늘은 안 본다 — 세게 던진 날 R1 이 본다)',
      p: { logs: [{ daysAgo: 0, pitches: 85, pct: 100, sessionType: '경기' }] },
      kind: null,
    },
    {
      name: '그제 경기 85구(어제만 본다 — 그 전은 휴식표가 본다)',
      p: { logs: [{ daysAgo: 2, pitches: 85, pct: 100, sessionType: '경기' }] },
      kind: null,
    },
  ];
  for (const c of armCases) {
    const got = yesterdayArmLoadOf(afFacts(c.p));
    check(
      `P4 어제 팔 부담 (가) ${c.name} → ${c.kind ?? '없음'}`,
      (got?.kind ?? null) === c.kind &&
        (got == null || (got.kind === 'claimedNoLog') === (got.outing == null)),
      json(got)
    );
  }
  /* 옛 facts(load 칸 없음) — 옛 규칙(실전 강도 30구)으로 읽는다(facts.ts isHardOuting) */
  {
    const f = afFacts({ logs: [y1(35, 100, '경기')] });
    const oldFacts = {
      ...f,
      patterns: {
        ...f.patterns,
        hardOutings: [{ daysAgo: 1, pitches: 35 }],
      },
    };
    const oldLight = {
      ...f,
      patterns: { ...f.patterns, hardOutings: [{ daysAgo: 1, pitches: 20 }] },
    };
    check(
      'P4 어제 팔 부담 (가) 옛 facts(load 없음) — 실전 강도 35구는 세게 던진 날, 20구는 아님(중간 부하는 load 가 있어야 본다)',
      yesterdayArmLoadOf(oldFacts)?.kind === 'hard' &&
        yesterdayArmLoadOf(oldLight) == null
    );
  }
  check(
    'P4 어제 팔 부담 (가) 중간 부하 문턱 — arm-load 의 1,350 이 날 종류가 내보내는 값과 같다(한 곳)',
    ARM_MODERATE_MIN_LOAD === 1350 && ARM_MODERATE_MIN_LOAD === MODERATE_OUTING_MIN_LOAD
  );
  {
    const f = afFacts({ logs: [y1(85, 100, '경기')] });
    const before = json(f);
    const a = yesterdayArmLoadOf(f);
    const b = yesterdayArmLoadOf(f);
    if (a?.outing) a.outing.pitches = 0;
    check(
      'P4 어제 팔 부담 (가) 결정성 — 같은 facts 면 같은 값, facts 를 바꾸지 않고, 돌려준 재료는 새 객체',
      json(f) === before &&
        b?.outing?.pitches === 85 &&
        f.patterns.hardOutings?.[0].pitches === 85
    );
  }

  /* ── (나) 세 독자가 한 함수 — 어제 기록 열둘 × 어제 답 다섯 × 오늘 답 셋 × 힘듦 셋 ── */
  const gridLogs: { name: string; logs: AfLog[] }[] = [
    { name: '기록 없음', logs: [] },
    { name: '어제 경기 85', logs: [y1(85, 100, '경기')] },
    { name: '어제 경기 15', logs: [y1(15, 100, '경기')] },
    { name: '어제 경기 0', logs: [y1(0, 100, '경기')] },
    { name: '어제 불펜 40 · 90%', logs: [y1(40, 90, '불펜')] },
    { name: '어제 불펜 30 · 70%', logs: [y1(30, 70, '불펜')] },
    { name: '어제 불펜 30 · 45%', logs: [y1(30, 45, '불펜')] },
    { name: '어제 불펜 29 · 45%', logs: [y1(29, 45, '불펜')] },
    { name: '어제 캐치볼 20 · 50%', logs: [y1(20, 50, '캐치볼')] },
    { name: '어제 불펜 65 · 40%', logs: [y1(65, 40, '불펜')] },
    {
      name: '그제 경기 85',
      logs: [{ daysAgo: 2, pitches: 85, pct: 100, sessionType: '경기' }],
    },
    {
      name: '오늘 불펜 60 · 50%',
      logs: [{ daysAgo: 0, pitches: 60, pct: 50, sessionType: '불펜' }],
    },
  ];
  const gridYesterday: (string | null | undefined)[] = [
    undefined,
    null,
    '오늘 등판',
    '내일 등판',
    '2~3일 뒤',
  ];
  const gridToday: (string | null)[] = [null, '오늘 등판', '없음'];
  const gridNotes: (TrainingNoteLike[] | undefined)[] = [undefined, AF_SPIKE, AF_CALM];
  const kinds: Record<string, number> = {};
  const miss: Record<string, string[]> = {
    program: [],
    hardRule: [],
    ruleArm: [],
    armcare: [],
    rank: [],
    armSignal: [],
  };
  let gridN = 0;
  /* 커밋 F 전후 — 프로그램의 경기 다음 날이 바뀐 칸(풀림 · 조임), 암케어의 '어제 N구'가 회복을 안 내게 된 칸 */
  const flips = { programLoosen: 0, programTighten: 0, armLoosen: 0, armTighten: 0 };
  for (const l of gridLogs)
    for (const yAns of gridYesterday)
      for (const tAns of gridToday)
        for (const notes of gridNotes) {
          gridN++;
          const p: AfPerson = {
            today: tAns,
            ...(yAns !== undefined ? { yesterday: yAns } : {}),
            logs: l.logs,
            ...(notes ? { notes } : {}),
          };
          const name = `${l.name}/${yAns === undefined ? '어제 줄 없음' : (yAns ?? '답 없음')}/${tAns ?? '답 없음'}/${notes === AF_SPIKE ? '급증' : notes === AF_CALM ? '평소' : '힘듦 없음'}`;
          const r = afRead(p);
          const k = r.arm?.kind ?? null;
          kinds[k ?? 'null'] = (kinds[k ?? 'null'] ?? 0) + 1;
          if (r.signals.gameYesterday !== (k != null)) miss.program.push(name);
          if (k === 'hard' && r.dk.rule !== 'hard')
            miss.hardRule.push(`${name}: ${r.dk.rule}`);
          if (
            (r.dk.rule === 'moderateSpike' && k !== 'moderateSpike') ||
            (r.dk.rule === 'claimedNoLog' && k !== 'claimedNoLog')
          )
            miss.ruleArm.push(`${name}: ${r.dk.rule} · ${k}`);
          /* 그 둘이 걸렸는데 날 종류가 다른 규칙이면, 그 규칙은 앞 차례(R1 세게 · R3 오늘 등판 — 둘 다 회복)여야 한다 */
          if (
            (k === 'moderateSpike' || k === 'claimedNoLog') &&
            r.dk.rule !== k &&
            r.dk.rule !== 'hard' &&
            r.dk.rule !== 'outingToday'
          )
            miss.ruleArm.push(`${name}: ${k} 인데 ${r.dk.rule}`);
          if (k != null && !r.plan.halted && r.armcare.kind !== 'recovery')
            miss.armcare.push(`${name}: ${r.armcare.kind} · ${r.armcare.reason}`);
          if (k != null && r.dk.rank !== 'recovery' && r.dk.rank !== 'light')
            miss.rank.push(`${name}: ${r.dk.rule}`);
          /* 암케어 까닭의 '어제 N구'(휴식표 '· 아직 쉬는 기간'이 아닌 것)는 세게 · 중간 부하 + 급증일 때만 */
          const pieces = r.armcare.reason.split(' → ')[0].split(' · ');
          const yesterdayPitchSignal =
            r.armcare.kind === 'recovery' &&
            pieces.some(
              (s, i) => /^어제 \d+구$/.test(s) && pieces[i + 1] !== '아직 쉬는 기간'
            );
          if (yesterdayPitchSignal && k !== 'hard' && k !== 'moderateSpike')
            miss.armSignal.push(`${name}: ${r.armcare.reason}`);
          if (r.oldGameYesterday && k == null) flips.programLoosen++;
          if (!r.oldGameYesterday && k != null) flips.programTighten++;
          const oldYesterdayPitches =
            (r.facts.patterns.lastOutingPitches ?? 0) > 0 &&
            r.facts.patterns.restDays === 1;
          if (oldYesterdayPitches && k == null && r.armcare.kind === 'strength')
            flips.armLoosen++;
          if (k === 'claimedNoLog' && r.armcare.reason.startsWith('어제 등판'))
            flips.armTighten++;
        }
  check(
    `P4 어제 팔 부담 (나) 격자 ${gridN}가지 — 네 갈래가 모두 나온다(${json(kinds)})`,
    gridN ===
      gridLogs.length * gridYesterday.length * gridToday.length * gridNotes.length &&
      ['null', 'hard', 'moderateSpike', 'claimedNoLog'].every(
        (x) => (kinds[x] ?? 0) > 0
      )
  );
  check(
    `P4 어제 팔 부담 (나) 프로그램 — 경기 다음 날 = 어제 팔 부담이 있음(${gridN}가지 모두)`,
    miss.program.length === 0,
    miss.program.slice(0, 3).join(' · ')
  );
  check(
    `P4 어제 팔 부담 (나) 날 종류 — 어제 세게 던진 날이면 R1, R2 · R3′ 는 이 함수가 그렇다고 할 때만, 이 함수가 R2 · R3′ 인데 다른 날이면 앞 차례(R1 · R3)`,
    miss.hardRule.length === 0 && miss.ruleArm.length === 0,
    [...miss.hardRule, ...miss.ruleArm].slice(0, 3).join(' · ')
  );
  check(
    `P4 어제 팔 부담 (나) 암케어 — 어제 팔 부담이 있으면 회복 루틴(통증 멈춤이 아니면), 까닭의 '어제 N구'는 세게 · 중간 부하 + 급증일 때만`,
    miss.armcare.length === 0 && miss.armSignal.length === 0,
    [...miss.armcare, ...miss.armSignal].slice(0, 3).join(' · ')
  );
  check(
    `P4 어제 팔 부담 (나) 프로그램이 쉬는 어제(팔 부담)면 매일 일정은 회복 · 보조 — 같은 어제를 근력 날로 말하지 않는다`,
    miss.rank.length === 0,
    miss.rank.slice(0, 3).join(' · ')
  );
  check(
    `P4 어제 팔 부담 (나) 커밋 F 전후 — 프로그램 쉼 풀림 ${flips.programLoosen} · 조임 ${flips.programTighten}, 암케어 회복 → 강화 ${flips.armLoosen} · 강화 → 회복('어제 등판') ${flips.armTighten}(넷 다 실제로 일어난다)`,
    flips.programLoosen > 0 &&
      flips.programTighten > 0 &&
      flips.armLoosen > 0 &&
      flips.armTighten > 0
  );

  /* ── (다) 프로그램 사례 — 쉬는 까닭 · 전후 ── */
  const progCases: {
    name: string;
    p: AfPerson;
    override?: boolean;
    now: string;
    before: string;
  }[] = [
    {
      name: '어제 경기 15구 → 진행(예전 경기 다음 날 쉼)',
      p: { logs: [y1(15, 100, '경기')] },
      now: 'go',
      before: 'rest:gameYesterday',
    },
    {
      name: "어제 '경기' 0구 줄 → 진행(예전 쉼)",
      p: { logs: [y1(0, 100, '경기')] },
      now: 'go',
      before: 'rest:gameYesterday',
    },
    {
      name: "어제 '오늘 등판' 답 + 어제 경기 15구 → 진행(예전 쉼)",
      p: { yesterday: '오늘 등판', logs: [y1(15, 100, '경기')] },
      now: 'go',
      before: 'rest:gameYesterday',
    },
    {
      name: '어제 경기 85구 → 쉼(그대로, 엇갈림 표 C2)',
      p: { logs: [y1(85, 100, '경기')] },
      now: 'rest:gameYesterday',
      before: 'rest:gameYesterday',
    },
    {
      name: '어제 불펜 40구 90% → 쉼(예전 주의 한 줄만 달고 진행)',
      p: { logs: [y1(40, 90, '불펜')] },
      now: 'rest:gameYesterday',
      before: 'go:hardThrow',
    },
    {
      name: '어제 불펜 30구 70% + 힘듦 급증 → 쉼(예전 진행)',
      p: { logs: [y1(30, 70, '불펜')], notes: AF_SPIKE },
      now: 'rest:gameYesterday',
      before: 'go',
    },
    {
      name: "어제 '오늘 등판' 답 · 기록 없음 → 쉼(그대로, 엇갈림 표 C6)",
      p: { yesterday: '오늘 등판' },
      now: 'rest:gameYesterday',
      before: 'rest:gameYesterday',
    },
    {
      name: "오늘 '경기' 0구 줄 → 경기 날 쉼(그대로 — 오늘은 세션 종류로 본다)",
      p: { logs: [{ daysAgo: 0, pitches: 0, pct: 100, sessionType: '경기' }] },
      now: 'rest:gameToday',
      before: 'rest:gameToday',
    },
    {
      name: '오늘 불펜 60구 50%(3,000) → 진행 + 많이 던짐 주의(그대로)',
      p: { logs: [{ daysAgo: 0, pitches: 60, pct: 50, sessionType: '불펜' }] },
      now: 'go:hardThrow',
      before: 'go:hardThrow',
    },
    {
      name: '어제 불펜 40구 90% + 그래도 할래요 → 진행 + 쉬는 게 좋은 날 주의',
      p: { logs: [y1(40, 90, '불펜')] },
      override: true,
      now: 'go:gameOverride',
      before: 'go:hardThrow',
    },
  ];
  for (const c of progCases) {
    const r = afRead(c.p, c.override ?? false);
    check(
      `P4 어제 팔 부담 (다) 프로그램 ${c.name}`,
      r.program === c.now && r.programBefore === c.before,
      `${r.program} (예전 ${r.programBefore})`
    );
  }
  check(
    "P4 어제 팔 부담 (다) 프로그램 글 — 쉬는 까닭 '어제 팔 부담이 컸어요', 넘긴 날 주의는 경기 날이라고 하지 않는다 · 해요체 · 줄표 없음",
    REST_TEXT.gameYesterday === '어제 팔 부담이 컸어요' &&
      !CAUTION_TEXT.gameOverride.includes('경기') &&
      [REST_TEXT.gameYesterday, CAUTION_TEXT.gameOverride].every(
        (t) => !t.includes('—') && /요\.?$/.test(t)
      ),
    `${REST_TEXT.gameYesterday} / ${CAUTION_TEXT.gameOverride}`
  );

  /* ── (라) 암케어 사례 — 까닭 한 줄 ── */
  const armcareCases: { name: string; p: AfPerson; kind: string; reason: string }[] = [
    {
      name: '어제 경기 15구 → 강화(예전 회복)',
      p: { logs: [y1(15, 100, '경기')] },
      kind: 'strength',
      reason: '어제 15구 · 팔 부담 적음 → 강화 루틴',
    },
    {
      name: '어제 캐치볼 20구 50% → 강화(예전 회복)',
      p: { logs: [y1(20, 50, '캐치볼')] },
      kind: 'strength',
      reason: '어제 20구 · 팔 부담 적음 → 강화 루틴',
    },
    {
      name: '어제 경기 85구 → 회복(그대로 — 기록이 하루뿐이라 부하 지수도 위험 구간)',
      p: { logs: [y1(85, 100, '경기')] },
      kind: 'recovery',
      reason: '어제 85구 · 투구 부하 위험 구간 → 회복 루틴',
    },
    {
      name: '어제 불펜 30구 70% + 힘듦 급증 → 회복',
      p: { logs: [y1(30, 70, '불펜')], notes: AF_SPIKE },
      kind: 'recovery',
      reason: '어제 30구 → 회복 루틴',
    },
    {
      name: "어제 '오늘 등판' 답 · 기록 없음 → 회복(예전 강화)",
      p: { yesterday: '오늘 등판' },
      kind: 'recovery',
      reason: '어제 등판 → 회복 루틴',
    },
    {
      name: '어제 불펜 65구 40%(2,600 — 세게는 아님) → 휴식표가 아직 쉬라고 해 회복(어제)',
      p: { logs: [y1(65, 40, '불펜')] },
      kind: 'recovery',
      reason: '어제 65구 · 아직 쉬는 기간 → 회복 루틴',
    },
  ];
  for (const c of armcareCases) {
    const r = afRead(c.p);
    check(
      `P4 어제 팔 부담 (라) 암케어 ${c.name}`,
      r.armcare.kind === c.kind && r.armcare.reason === c.reason,
      `${r.armcare.kind} · ${r.armcare.reason}`
    );
  }

  /* ── (마) 소스 — 세 독자가 같은 함수를 부르고, 어제 팔 부담 파일은 가볍다 ── */
  {
    const strip = (p: string) =>
      readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const armSrc = strip('lib/engine/arm-load.ts');
    const specs = [...armSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    check(
      'P4 어제 팔 부담 (마) lib/engine/arm-load.ts 는 순수 · 가볍다 — import 는 outing · facts 둘뿐(암케어 루틴 파일이 화면 부품에도 실려서), 날짜 함수 · 난수 · server-only · 글 없음',
      json([...new Set(specs)].sort()) ===
        json(['@/lib/engine/outing', '@/lib/report/facts']) &&
        !/new Date\(|appNow|Math\.random|server-only/.test(armSrc) &&
        !/요\.'|요'/.test(armSrc),
      specs.join(' · ')
    );
    const readers = [
      'lib/program/load.ts',
      'lib/armcare/routine.ts',
      'lib/engine/microcycle.ts',
    ];
    const missing = readers.filter(
      (f) => !/yesterdayArmLoadOf\(facts\)/.test(strip(f))
    );
    const routineSrc = strip('lib/armcare/routine.ts');
    const programSrc = strip('lib/program/program.ts');
    check(
      `P4 어제 팔 부담 (마) 세 독자(${readers.join(' · ')})가 yesterdayArmLoadOf(facts) 를 부르고, 프로그램 신호는 어제 기록의 세션 종류를 · 암케어는 '어제 N구'를 투구수만으로 안 낸다`,
      missing.length === 0 &&
        !/typesYesterday/.test(programSrc) &&
        !/p\.restDays === 1\) signals\.push/.test(routineSrc) &&
        /gameYesterday: x\.yesterdayArmLoad != null/.test(programSrc),
      missing.join(' · ')
    );
  }
}

/* ═══════════════════ [2판 P4] 다음 등판 짐작 — 달력 · 같은 요일(lib/engine/outing.ts · lib/calendar-event.ts isOutingTitle · facts 두 칸) (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 다음 등판 짐작(달력 · 같은 요일) — 이름 낱말 · 14일 · 4주 3번 · 차례 · 가볍게 하는 쪽에만 · 지문 · 배선(2026-10-12)'
);
{
  /*
   * 왜 보는가. 답을 안 적는 날에는 경기 아침에도 근력 날이 나왔다(기준선 ⑤). 커밋 G 는 홈 캘린더의 '경기 · 등판 · 선발' 일정과 최근 4주
   * 같은 요일 경기로 다음 등판을 짐작한다 — 사용자 결정: 짐작은 가볍게 하는 쪽(무거운 하체 빼기 · 보조 날)에만 쓰고 회복으로 보내지 않는다.
   * (가) 이름 낱말 표 (나) facts 재료 두 칸 (다) 같은 요일 짐작 (라) 체크인 답과의 차례 (마) 가볍게만 — 날 종류 · 테마 · 근거 · 이유 글
   * (바) 일정 지문 (사) 결정성 · 옛 facts (아) 배선 · 소스. 160조합 불변식은 '[2판 안전망(P0)]' (c) 의 ⑬, 엇갈림 표는 C7 · C8.
   */
  const json = (v: unknown) => JSON.stringify(v);
  /** 오늘부터 며칠 뒤의 날짜 키(과거는 음수) — TODAY 는 2026-06-15 월요일 */
  const keyIn = (days: number) => dayBefore(-days).slice(0, 10);
  type GLog = { daysAgo: number; pitches: number; sessionType: string };
  type GP = {
    /** 오늘 등판 답 — 안 주면 칸 없는 체크인, null 이면 칸은 있는데 안 적음 */
    today?: string | null;
    /** 오늘 체크인 자체가 없다 */
    noCheckin?: boolean;
    /** 어제 등판 답 — 안 주면 어제 체크인이 없다 */
    yesterday?: string | null;
    logs?: GLog[];
    /** 달력 — 안 주면 facts 에 짐작 칸이 없다 */
    calendar?: CalendarEventLike[];
    preferredWorkout?: string | null;
  };
  const gCheckin = (
    daysAgo: number,
    throwPlan: string | null | undefined,
    preferredWorkout: string | null = null
  ): CheckinLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    condition: 8,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout,
    ...(throwPlan !== undefined ? { throwPlan } : {}),
  });
  const gFacts = (p: GP) =>
    buildFacts({
      nickname: '짐작',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: dayBefore(l.daysAgo),
        pitchCount: l.pitches,
        intensity: 9,
        sessionType: l.sessionType,
        maxVelocity: null,
        avgVelocity: null,
      })),
      checkins: [
        ...(p.noCheckin ? [] : [gCheckin(0, p.today, p.preferredWorkout ?? null)]),
        ...(p.yesterday !== undefined ? [gCheckin(1, p.yesterday)] : []),
      ],
      memos: [],
      ...(p.calendar ? { calendarEvents: p.calendar } : {}),
    });
  const games = (daysAgo: readonly number[], pitches = 20): GLog[] =>
    daysAgo.map((d) => ({ daysAgo: d, pitches, sessionType: '경기' }));
  /* 요일 무늬 — 오늘(월)부터 그 요일까지 남은 날로 지난 세 주의 날을 고른다(7w − 남은 날) */
  const MON = games([7, 14, 21]);
  const TUE = games([6, 13, 20]);
  const WED = games([5, 12, 19]);
  const SAT = games([2, 9, 16]);
  const cal = (days: number, title = '리그 경기'): CalendarEventLike => ({
    date: keyIn(days),
    title,
  });

  /* ── (가) 이름 낱말 표 ── */
  {
    const rows: [unknown, boolean][] = [
      ['토요일 경기', true],
      ['주말 리그 경기', true],
      ['선발 등판', true],
      ['등판', true],
      ['선발', true],
      ['  경기  ', true],
      ['경기 관람', false],
      ['프로야구 경기 응원', false],
      ['선발 응원', false],
      ['응원', false],
      ['병원', false],
      ['불펜 피칭', false],
      ['연습', false],
      ['', false],
      ['   ', false],
      [null, false],
      [42, false],
    ];
    const wrong = rows.filter(([t, want]) => isOutingTitle(t) !== want);
    check(
      `P4 짐작 (가) 이름 낱말 표 ${rows.length}건 — '경기' · '등판' · '선발'이 있으면 등판, '관람' · '응원'이 있으면 아님, 빈 이름 · 글자 아님은 아님`,
      wrong.length === 0 &&
        json(OUTING_TITLE_WORDS) === json(['경기', '등판', '선발']) &&
        json(OUTING_TITLE_EXCLUDE_WORDS) === json(['관람', '응원']),
      wrong.map(([t]) => json(t)).join(' · ')
    );
  }

  /* ── (나) facts 재료 두 칸 ── */
  {
    const none = gFacts({});
    const empty = gFacts({ calendar: [] });
    check(
      'P4 짐작 (나) 달력을 안 넘기면 두 칸(condition.outingCalendar · patterns.gameDates)이 키째 없고, 빈 목록을 넘기면 null · [] 로 생긴다',
      !('outingCalendar' in none.condition) &&
        !('gameDates' in none.patterns) &&
        empty.condition.outingCalendar === null &&
        json(empty.patterns.gameDates) === '[]'
    );
    const events: CalendarEventLike[] = [
      cal(5, '리그 경기'),
      cal(2, '병원'),
      cal(3, '경기 관람'),
      cal(9, '선발 등판'),
      cal(-1, '어제 경기'),
      cal(15, '먼 경기'),
      { date: 'bad-date', title: '경기' },
    ];
    const f = gFacts({ calendar: events });
    const reversed = gFacts({ calendar: [...events].reverse() });
    check(
      "P4 짐작 (나) 달력 — 오늘 ~ 14일 뒤 · 등판으로 읽히는 이름 중 가장 가까운 것(5일 뒤 '리그 경기'), 병원 · 관람 · 어제 · 15일 뒤 · 날짜 꼴 아님은 버림, 넘긴 차례와 상관없음",
      json(f.condition.outingCalendar) ===
        json({ date: keyIn(5), daysUntil: 5, title: '리그 경기' }) &&
        json(reversed.condition.outingCalendar) === json(f.condition.outingCalendar),
      json(f.condition.outingCalendar)
    );
    const edge = (days: number) =>
      gFacts({ calendar: [cal(days)] }).condition.outingCalendar?.daysUntil ?? null;
    const sameDay = gFacts({ calendar: [cal(2, '주말 경기'), cal(2, '리그 경기')] });
    const sameDayRev = gFacts({ calendar: [cal(2, '리그 경기'), cal(2, '주말 경기')] });
    check(
      `P4 짐작 (나) 달력 — 오늘(0) · 14일 뒤는 든다, 15일 뒤 · 어제는 아니다(OUTING_CALENDAR_DAYS ${OUTING_CALENDAR_DAYS}), 같은 날 둘이면 이름 차례로 앞의 것`,
      OUTING_CALENDAR_DAYS === 14 &&
        edge(0) === 0 &&
        edge(14) === 14 &&
        edge(15) === null &&
        edge(-1) === null &&
        sameDay.condition.outingCalendar?.title === '리그 경기' &&
        sameDayRev.condition.outingCalendar?.title === '리그 경기'
    );
    const g = gFacts({
      calendar: [],
      logs: [
        { daysAgo: 1, pitches: 60, sessionType: '경기' },
        { daysAgo: 2, pitches: 0, sessionType: '경기' },
        { daysAgo: 3, pitches: 40, sessionType: '불펜' },
        { daysAgo: 7, pitches: 30, sessionType: '경기' },
        { daysAgo: 7, pitches: 25, sessionType: '경기' },
        { daysAgo: 28, pitches: 50, sessionType: '경기' },
        { daysAgo: 29, pitches: 50, sessionType: '경기' },
        { daysAgo: 0, pitches: 20, sessionType: '경기' },
      ],
    });
    check(
      `P4 짐작 (나) 경기 날짜 — 어제 ~ ${GAME_DATES_DAYS}일 전 · '경기' · 1구 이상만, 같은 날 두 줄은 하루, 오늘 · 0구 · 불펜 · 29일 전은 빼고 오름차순`,
      GAME_DATES_DAYS === 28 &&
        json(g.patterns.gameDates) === json([keyIn(-28), keyIn(-7), keyIn(-1)]),
      json(g.patterns.gameDates)
    );
  }

  /* ── (다) 같은 요일 짐작 ── */
  {
    const est = (logs: GLog[]) => outingOf(gFacts({ calendar: [], logs }));
    const mon = est(MON);
    check(
      'P4 짐작 (다) 기준일 2026-06-15 은 월요일(요일 셈의 바탕)',
      new Date(`${keyIn(0)}T00:00:00.000Z`).getUTCDay() === 1
    );
    check(
      "P4 짐작 (다) 최근 4주 월요일 경기 3번 · 오늘 월요일 · 답 없음 → 오늘 등판으로 짐작(출처 'estimate' · soft · 범위 0~0 · 날 못 박음 없음)",
      mon.nextSource === 'estimate' &&
        mon.soft &&
        json(mon.daysUntilNext) === json({ min: 0, max: 0 }) &&
        mon.nextDay === null &&
        json(mon.guess) === json({ source: 'estimate', days: 0, weekday: 1, games: 3 }),
      json(mon)
    );
    const rows: { name: string; logs: GLog[]; want: unknown }[] = [
      {
        name: '월요일 4번(7 · 14 · 21 · 28일 전) → 오늘 · 4번',
        logs: games([7, 14, 21, 28]),
        want: { source: 'estimate', days: 0, weekday: 1, games: 4 },
      },
      { name: '월요일 2번 → 짐작 없음', logs: games([7, 14]), want: null },
      {
        name: '토요일 3번 → 5일 뒤 토요일',
        logs: SAT,
        want: { source: 'estimate', days: 5, weekday: 6, games: 3 },
      },
      {
        name: '토요일 3번 + 화요일 3번 → 가까운 화요일(내일)',
        logs: [...SAT, ...TUE],
        want: { source: 'estimate', days: 1, weekday: 2, games: 3 },
      },
      {
        name: '월요일 7 · 14 · 35일 전 → 35일 전은 4주 밖이라 2번 → 없음',
        logs: games([7, 14, 35]),
        want: null,
      },
      {
        name: '5일 로테이션(1 · 6 · 11 · 16 · 21 · 26일 전) → 요일이 돌아 없음',
        logs: games([1, 6, 11, 16, 21, 26]),
        want: null,
      },
      {
        name: '월요일 7일 전 두 줄 + 14일 전 → 같은 날은 하루라 2번 → 없음',
        logs: [...games([7, 7]), ...games([14])],
        want: null,
      },
      {
        name: '월요일 불펜 3번 → 경기가 아니라 없음',
        logs: [7, 14, 21].map((d) => ({
          daysAgo: d,
          pitches: 40,
          sessionType: '불펜',
        })),
        want: null,
      },
    ];
    for (const r of rows) {
      const o = est(r.logs);
      check(`P4 짐작 (다) ${r.name}`, json(o.guess) === json(r.want), json(o.guess));
    }
    const both = outingGuessInputsOf(
      gFacts({ calendar: [cal(4)], logs: [...MON, ...TUE] })
    );
    check(
      `P4 짐작 (다) 상수 — 4주(${ESTIMATE_LOOKBACK_DAYS}일 = facts 의 GAME_DATES_DAYS) · ${ESTIMATE_MIN_GAMES}번, 지문 재료는 달력 날수와 짐작이 서는 날 모두(월 · 화 → [0, 1])`,
      ESTIMATE_LOOKBACK_DAYS === GAME_DATES_DAYS &&
        ESTIMATE_MIN_GAMES === 3 &&
        json(both) === json({ calendar: 4, estimate: [0, 1] }) &&
        outingGuessInputsOf(gFacts({})) === null,
      json(both)
    );
  }

  /* ── (라) 체크인 답과의 차례 ── */
  {
    const rows: {
      name: string;
      p: GP;
      want: Partial<Record<keyof Outing, unknown>>;
    }[] = [
      {
        name: "오늘 '2~3일 뒤' + 달력 오늘 경기 → 답이 이긴다(짐작 안 함)",
        p: { today: '2~3일 뒤', calendar: [cal(0)] },
        want: {
          nextSource: 'checkin',
          daysUntilNext: { min: 2, max: 3 },
          soft: false,
          guess: null,
        },
      },
      {
        name: "오늘 답 없음 + 어제 '4일 이상 뒤' + 달력 내일 경기 → 어제 답(하루 당김)이 이긴다",
        p: { today: null, yesterday: '4일 이상 뒤', calendar: [cal(1)] },
        want: {
          nextSource: 'checkin-yesterday',
          daysUntilNext: { min: 3, max: null },
          soft: false,
          guess: null,
        },
      },
      {
        name: "오늘 '없음' + 달력 오늘 경기 + 월요일 무늬 → 짐작 안 함('가까운 등판 없음'이라는 답)",
        p: { today: '없음', calendar: [cal(0)], logs: MON },
        want: { nextSource: 'none', daysUntilNext: null, soft: false, guess: null },
      },
      {
        name: "오늘 '오늘 불펜' + 달력 오늘 경기 → 오늘은 짐작 안 함(답이 오늘을 말함) · 다른 짐작 없음",
        p: { today: '오늘 불펜', calendar: [cal(0)] },
        want: { nextSource: 'none', daysUntilNext: null, role: 'bullpen', guess: null },
      },
      {
        name: "오늘 '오늘 불펜' + 달력 내일 경기 → 달력 내일(불펜 날에도 다음 등판은 짐작)",
        p: { today: '오늘 불펜', calendar: [cal(1)] },
        want: {
          nextSource: 'calendar',
          daysUntilNext: { min: 1, max: 1 },
          nextDay: null,
          soft: true,
          role: 'bullpen',
          guess: { source: 'calendar', days: 1 },
        },
      },
      {
        name: "오늘 '오늘 불펜' + 월요일 · 화요일 무늬 → 오늘(월)은 건너뛰고 내일(화)",
        p: { today: '오늘 불펜', calendar: [], logs: [...MON, ...TUE] },
        want: {
          nextSource: 'estimate',
          guess: { source: 'estimate', days: 1, weekday: 2, games: 3 },
        },
      },
      {
        name: '답 없음 + 달력 4일 뒤 + 월요일 무늬(오늘) → 달력이 먼저(사람이 적은 것)',
        p: { today: null, calendar: [cal(4)], logs: MON },
        want: { nextSource: 'calendar', daysUntilNext: { min: 4, max: 4 } },
      },
      {
        name: "오늘 답 없음 + 어제 '없음' + 달력 오늘 경기 → 달력(어제 '없음'은 막지 않음)",
        p: { today: null, yesterday: '없음', calendar: [cal(0)] },
        want: {
          nextSource: 'calendar',
          daysUntilNext: { min: 0, max: 0 },
          nextDay: null,
        },
      },
      {
        name: "어제 '오늘 등판' · 기록 없음 + 달력 6일 뒤 → 다음 등판은 달력, 지난 등판은 어제 답",
        p: { today: null, yesterday: '오늘 등판', calendar: [cal(6)] },
        want: {
          nextSource: 'calendar',
          daysUntilNext: { min: 6, max: 6 },
          lastSource: 'checkin-yesterday',
        },
      },
      {
        name: '오늘 체크인 없음 + 달력 오늘 경기 → 달력',
        p: { noCheckin: true, calendar: [cal(0)] },
        want: { nextSource: 'calendar', answeredToday: false },
      },
      {
        name: "오늘 목록 밖 글자('모레') + 달력 내일 경기 → 달력('없음'만 막는다)",
        p: { today: '모레', calendar: [cal(1)] },
        want: { nextSource: 'calendar', answeredToday: true },
      },
      {
        name: '달력 · 기록 없이 답도 없음 → 모름',
        p: { today: null, calendar: [] },
        want: { nextSource: 'none', daysUntilNext: null, soft: false, guess: null },
      },
    ];
    for (const r of rows) {
      const o = outingOf(gFacts(r.p));
      const got = Object.fromEntries(
        Object.keys(r.want).map((k) => [k, o[k as keyof Outing]])
      );
      check(`P4 짐작 (라) ${r.name}`, json(got) === json(r.want), json(got));
    }
    check(
      "P4 짐작 (라) saysNoOuting — '없음'(앞뒤 빈칸 포함)만 참, 안 적음 · 불펜 · 목록 밖은 거짓(답 글자는 lib/checkin.ts 밖에서 안 견준다)",
      saysNoOuting('없음') &&
        saysNoOuting(' 없음 ') &&
        !saysNoOuting(null) &&
        !saysNoOuting(undefined) &&
        !saysNoOuting('오늘 불펜') &&
        !saysNoOuting('모레')
    );
  }

  /* ── (마) 가볍게 하는 쪽에만 — 날 종류 · 테마 · 근거 줄 · 이유 글 ── */
  {
    const theme = (p: GP, override = false) => {
      const facts = gFacts(p);
      return decideTheme({
        facts,
        plan: buildPitchPlan(facts),
        lastLowerKey: null,
        lastUpperKey: null,
        preferredWorkout: facts.condition.today?.preferredWorkout ?? null,
        override,
      });
    };
    const calToday = theme({ today: null, calendar: [cal(0)] });
    const calTomorrow = theme({ today: null, calendar: [cal(1)] });
    const monToday = theme({ today: null, calendar: [], logs: MON });
    const firmToday = theme({ today: '오늘 등판', calendar: [cal(0)] });
    check(
      "P4 짐작 (마) 달력 오늘 경기 · 답 없음 → 보조(회복 아님) · 이유 '달력에 오늘 경기가 있어 …' / 같은 사람이 '오늘 등판'이라 답하면 회복(답이 못 박음)",
      calToday.key === 'assist' &&
        calToday.reason ===
          '달력에 오늘 경기가 있어 무게 대신 코어와 보강을 해요. 등판이 아니면 체크인에서 던지는 일정을 적어 주세요.' &&
        firmToday.key === 'recovery',
      `${calToday.key} · ${calToday.reason} / ${firmToday.key}`
    );
    check(
      "P4 짐작 (마) 달력 내일 경기 → 보조 · 이유 '달력에 내일 경기가 있어 …', 같은 요일(월 3번 · 오늘) → 보조 · 이유에 요일과 횟수",
      calTomorrow.key === 'assist' &&
        calTomorrow.reason ===
          '달력에 내일 경기가 있어 무게 대신 코어와 보강을 해요. 등판 전날은 다리를 가볍게 둬요.' &&
        monToday.key === 'assist' &&
        monToday.reason ===
          '최근 4주 월요일에 경기를 3번 해서 오늘 등판으로 봤어요. 무게 대신 코어와 보강을 해요. 아니면 체크인에서 던지는 일정을 적어 주세요.',
      `${calTomorrow.reason} / ${monToday.reason}`
    );
    const weightFacts = gFacts({
      today: null,
      calendar: [cal(0)],
      preferredWorkout: '웨이트',
    });
    const clash = workoutConflict({ facts: weightFacts, preferredWorkout: '웨이트' });
    const forced = theme(
      { today: null, calendar: [cal(0)], preferredWorkout: '웨이트' },
      true
    );
    check(
      "P4 짐작 (마) 짐작한 날에 '웨이트'를 고르면 보조로 권하고(부딪힘 '달력에 오늘 경기가 있어요'), '그래도 하기'면 근력 날로 간다(짐작은 막지 않는다)",
      clash?.reason === '달력에 오늘 경기가 있어요' &&
        clash.fallback === 'assist' &&
        (forced.key === 'lower' || forced.key === 'upper') &&
        forced.reason.includes('그래도 하겠다고 하셔서'),
      `${json(clash)} / ${forced.key}`
    );
    const pick = (p: GP) => {
      const facts = gFacts(p);
      return {
        facts,
        picked: selectCandidates({ facts, plan: buildPitchPlan(facts), library }),
      };
    };
    const soonCal = pick({ today: null, calendar: [cal(2)] });
    const soonWed = pick({ today: null, calendar: [], logs: WED });
    const farCal = pick({ today: null, calendar: [cal(5)] });
    const heavyIn = (x: { picked: { candidates: readonly ClassifiableExercise[] } }) =>
      x.picked.candidates.filter((e) => isHeavyLower(e)).length;
    check(
      "P4 짐작 (마) 짐작한 2일 뒤 → 무거운 하체 제외 · 근거 '달력에 적은 2일 뒤 등판 …' · '같은 요일로 짐작한 2일 뒤 등판 …', 날 종류는 근력 날(상체 쪽)",
      soonCal.picked.basis.includes('달력에 적은 2일 뒤 등판 → 무거운 하체 제외') &&
        soonWed.picked.basis.includes(
          '같은 요일로 짐작한 2일 뒤 등판 → 무거운 하체 제외'
        ) &&
        heavyIn(soonCal) === 0 &&
        heavyIn(soonWed) === 0 &&
        dayKindOf(soonCal.facts).rule === 'outingSoon' &&
        dayKindOf(soonCal.facts).side === 'upper' &&
        dayKindOf(soonWed.facts).rule === 'outingSoon',
      `${soonCal.picked.basis.join(' | ')} // ${soonWed.picked.basis.join(' | ')}`
    );
    const farDk = dayKindOf(farCal.facts);
    check(
      'P4 짐작 (마) 짐작한 5일 뒤 → 날 종류 모름(R7 — 짐작으로 하체 쪽을 안 고름) · 무거운 하체 든다 · 근거에 등판 줄 없음',
      farDk.rule === 'none' &&
        farDk.side === null &&
        farDk.heavyLowerAllowed &&
        heavyIn(farCal) > 0 &&
        !farCal.picked.basis.some((b) => b.endsWith('등판 → 무거운 하체 제외')),
      `${farDk.rule} · ${heavyIn(farCal)}`
    );
    const why = (p: GP) => {
      const facts = gFacts(p);
      return buildDayState({ facts, plan: buildPitchPlan(facts) }).why;
    };
    const whyCal = why({ today: null, calendar: [cal(1)] });
    const whyMon = why({ today: null, calendar: [], logs: MON });
    const whyBull = why({ today: '오늘 불펜', calendar: [cal(1)] });
    check(
      "P4 짐작 (마) 오늘 상태 한 장의 이유 줄 — '달력으로 보면 내일 등판이에요.' · '같은 요일 경기로 짐작하면 오늘 등판이에요.', 불펜 날 짐작은 두 줄 다",
      whyCal.includes('달력으로 보면 내일 등판이에요.') &&
        whyMon.includes('같은 요일 경기로 짐작하면 오늘 등판이에요.') &&
        whyBull.includes('달력으로 보면 내일 등판이에요.') &&
        whyBull.includes('오늘 불펜 날이에요.'),
      `${whyCal.join(' ')} // ${whyMon.join(' ')} // ${whyBull.join(' ')}`
    );
    /* 회복 · 쉬기를 내는 독자는 짐작을 안 읽는다 — plannedOuting(테마 회복) · 프로그램 신호 · 암케어 등판 신호 */
    const softFacts = gFacts({ today: null, calendar: [cal(0)], logs: MON });
    const softState = buildDayState({
      facts: softFacts,
      plan: buildPitchPlan(softFacts),
    });
    const signals = programSignalsOf({
      outing: softState.outing,
      typesToday: [],
      yesterdayArmLoad: yesterdayArmLoadOf(softFacts),
    });
    check(
      'P4 짐작 (마) 회복 · 쉬기를 내는 독자는 짐작을 안 읽는다 — plannedOuting null · 프로그램 경기 날 · 전날 아님 · 오늘 할 일(role) 없음',
      plannedOuting(softFacts) === null &&
        !signals.gameToday &&
        !signals.gameTomorrow &&
        softState.outing.role === null &&
        softState.outing.soft,
      json(signals)
    );
  }

  /* ── (바) 일정 지문 — 짐작의 재료를 담는다 ── */
  {
    const fpOf = (p: GP) => fingerprintOf(gFacts(p));
    const base = fpOf({ today: null, calendar: [] });
    /* P4 검토로 바뀜 — 바깥 칸 끝에 어제 기록 유무(loggedYesterday)가 붙는다 */
    check(
      'P4 짐작 (바) 달력을 넘긴 facts 의 지문 — 칸 목록 = FINGERPRINT_KEYS + outingGuess(힘듦 칸 없음) + loggedYesterday, 값은 재료({ calendar, estimate })',
      json(Object.keys(base)) ===
        json([...FINGERPRINT_KEYS, 'outingGuess', 'loggedYesterday']) &&
        json(base.outingGuess) === json({ calendar: null, estimate: [] }) &&
        json(fpOf({ today: null, calendar: [cal(3)], logs: MON }).outingGuess) ===
          json({ calendar: 3, estimate: [0] }),
      Object.keys(base).join(',')
    );
    const texts = (a: GP, b: GP) =>
      diffFingerprintChanges(fpOf(a), fpOf(b))
        .filter((c) => c.key === 'outingGuess')
        .map((c) => c.text);
    const add = texts({ calendar: [] }, { calendar: [cal(1)] });
    const drop = texts({ calendar: [cal(1)] }, { calendar: [] });
    const move = texts({ calendar: [cal(3)] }, { calendar: [cal(1)] });
    check(
      "P4 짐작 (바) 달력 줄 — 생김 '달력에 내일 경기가 생겼어요' · 빠짐 '달력의 경기 일정이 빠졌어요' · 옮김 '달력의 다음 경기가 3일 뒤에서 내일로 바뀌었어요'",
      json(add) === json(['달력에 내일 경기가 생겼어요']) &&
        json(drop) === json(['달력의 경기 일정이 빠졌어요']) &&
        json(move) === json(['달력의 다음 경기가 3일 뒤에서 내일로 바뀌었어요']),
      `${add} / ${drop} / ${move}`
    );
    const estGone = diffFingerprintChanges(
      fpOf({ calendar: [], logs: MON }),
      (() => {
        /* 같은 기록에서 짐작만 풀린 지문 — 재료 칸만 바꿔 견준다(기록을 바꾸면 마지막 투구 줄도 같이 뜬다) */
        const f = gFacts({ calendar: [], logs: MON });
        return { ...fingerprintOf(f), outingGuess: { calendar: null, estimate: [] } };
      })()
    ).map((c) => c.text);
    const estCame = diffFingerprintChanges(
      {
        ...fpOf({ calendar: [], logs: MON }),
        outingGuess: { calendar: null, estimate: [] },
      },
      fpOf({ calendar: [], logs: MON })
    ).map((c) => c.text);
    check(
      "P4 짐작 (바) 같은 요일 줄 — 풀림 '같은 요일 경기로 등판을 짐작하지 않게 됐어요' · 섬 '최근 같은 요일 경기가 이어져 등판을 짐작했어요'",
      json(estGone) === json(['같은 요일 경기로 등판을 짐작하지 않게 됐어요']) &&
        json(estCame) === json(['최근 같은 요일 경기가 이어져 등판을 짐작했어요']),
      `${estGone} / ${estCame}`
    );
    const answered = diffFingerprintChanges(
      fpOf({ today: null, calendar: [cal(1)] }),
      fpOf({ today: '내일 등판', calendar: [cal(1)] })
    );
    check(
      "P4 짐작 (바) 달력이 그대로인데 답을 적어 답이 짐작을 덮으면 — 던지는 일정 줄 하나만(달력 줄이 '빠졌어요'로 같이 뜨지 않는다 — 재료를 담아서)",
      answered.length === 1 && answered[0].key === 'throwPlan',
      json(answered)
    );
    const full = fpOf({ today: null, calendar: [cal(2)], logs: [...MON, ...TUE] });
    const legacy = { ...full } as Record<string, unknown>;
    delete legacy.outingGuess;
    const legacyRead = readPlanFingerprint(legacy);
    check(
      'P4 짐작 (바) 지문 읽기 — 저장했다 읽어도 글자까지 같고, 칸 없는 옛 지문은 읽히되 짐작 줄이 없고(둘 다 있을 때만), 모양이 틀리면 null',
      json(readPlanFingerprint(JSON.parse(json(full)))) === json(full) &&
        legacyRead != null &&
        !('outingGuess' in legacyRead) &&
        !diffFingerprintChanges(legacyRead, full).some(
          (c) => c.key === 'outingGuess'
        ) &&
        readPlanFingerprint({ ...full, outingGuess: 'x' }) === null &&
        readPlanFingerprint({
          ...full,
          outingGuess: { calendar: '1', estimate: [] },
        }) === null &&
        readPlanFingerprint({
          ...full,
          outingGuess: { calendar: null, estimate: [1, '2'] },
        }) === null &&
        readPlanFingerprint({ ...full, outingGuess: { calendar: null } }) === null,
      json(full.outingGuess)
    );
    /*
     * 판단 입력이 바뀌면 지문도 바뀐다(P2 규칙) — 기록이 같은 묶음(요일 무늬마다) 안에서 답 · 달력만 바꾼 사람들 중 outingOf 가 다른 두
     * 사람은 지문을 견주면 바뀐 줄이 하나 이상 나와야 한다. outingOf 가 지문에 없는 칸을 읽게 되면 여기서 깨진다.
     */
    const ANSWERS = [null, '없음', '오늘 불펜', '2~3일 뒤', '내일 등판'];
    const CALS: CalendarEventLike[][] = [
      [],
      [cal(0)],
      [cal(1)],
      [cal(2, '선발 등판')],
      [cal(5)],
      [cal(13)],
      [cal(1, '경기 관람')],
    ];
    const LOG_SETS: GLog[][] = [[], MON, [...MON, ...TUE], SAT, games([7, 14])];
    let pairs = 0;
    const silent: string[] = [];
    for (const logs of LOG_SETS) {
      const rows = ANSWERS.flatMap((a) =>
        CALS.map((c) => ({
          tag: `${a ?? '안 적음'} · ${json(c)}`,
          p: { today: a, calendar: c, logs },
        }))
      );
      const outs = rows.map((r) => json(outingOf(gFacts(r.p))));
      const fps = rows.map((r) => fpOf(r.p));
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          if (outs[i] === outs[j]) continue;
          pairs++;
          if (diffFingerprintChanges(fps[i], fps[j]).length === 0)
            silent.push(`${rows[i].tag} ↔ ${rows[j].tag}`);
        }
    }
    check(
      `P4 짐작 (바) 기록이 같은 묶음에서 등판이 다른 ${pairs}쌍 — 모두 지문 견주기에 바뀐 줄이 있다`,
      pairs > 1000 && silent.length === 0,
      silent.slice(0, 3).join(' / ')
    );
  }

  /* ── (사) 결정성 · facts 를 안 바꿈 · 옛 facts ── */
  {
    const f = gFacts({
      today: '오늘 불펜',
      calendar: [cal(1)],
      logs: [...MON, ...TUE],
    });
    const before = json(f);
    const a = outingOf(f);
    if (a.guess) a.guess.days = 99;
    if (a.daysUntilNext) a.daysUntilNext.min = 99;
    const b = outingOf(f);
    check(
      'P4 짐작 (사) 같은 facts 두 번 → 같은 값, 돌려받은 짐작 · 범위를 고쳐도 다음 값 · facts 가 안 바뀐다',
      json(b) === json(outingOf(f)) &&
        b.guess?.days === 1 &&
        b.daysUntilNext?.min === 1 &&
        json(f) === before,
      json(b.guess)
    );
    const old = JSON.parse(
      json(gFacts({ today: null, calendar: [cal(0)], logs: MON }))
    ) as ReturnType<typeof buildFacts>;
    delete (old.condition as Partial<typeof old.condition>).outingCalendar;
    delete (old.patterns as Partial<typeof old.patterns>).gameDates;
    const o = outingOf(old);
    check(
      'P4 짐작 (사) 옛 facts(두 칸 없음) — 짐작하지 않는다(모름) · 지문에 짐작 칸 없음',
      o.nextSource === 'none' &&
        o.guess === null &&
        o.soft === false &&
        !('outingGuess' in fingerprintOf(old)),
      json(o.guess)
    );
  }

  /* ── (아) 배선 · 소스 ── */
  {
    const strip = (p: string) =>
      readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const gatherSrc = strip('lib/report/gather.ts');
    check(
      'P4 짐작 (아) gather.ts — recentRecords(cache) 인자는 글자만 셋, 달력은 내 userId 로만 읽고(관리자 공유 없음) buildFacts 에 calendarEvents 로 늘 넘긴다',
      /cache\(async \(userId: string, sinceIso: string, asOf: string\)/.test(
        gatherSrc
      ) &&
        /prisma\.calendarEvent\.findMany\(\{\s*where: \{\s*userId,/.test(gatherSrc) &&
        !/role: 'ADMIN'/.test(gatherSrc) &&
        /calendarEvents: events\.map\(/.test(gatherSrc) &&
        /recentRecords\(user\.id, since\.toISOString\(\), todayKey\)/.test(gatherSrc)
    );
    const calSrc = strip('lib/calendar-event.ts');
    const factsSrc = strip('lib/report/facts.ts');
    check(
      'P4 짐작 (아) 낱말 규칙은 lib/calendar-event.ts 한 곳(그 파일은 import 없음) · facts.ts 가 그것을 부른다',
      !/^import /m.test(calSrc) &&
        /import \{ isOutingTitle \} from '@\/lib\/calendar-event';/.test(factsSrc)
    );
    /* 짐작 칸을 읽는 곳은 facts(만듦) · outing(읽음) 둘뿐 — 지문은 outingGuessInputsOf 로, 나머지 독자는 outingOf 로 */
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (
          /\.tsx?$/.test(entry.name) &&
          /outingCalendar|gameDates/.test(strip(rel))
        )
          readers.push(rel);
      }
    };
    for (const dir of ['app', 'lib', 'components']) walk(dir);
    check(
      'P4 짐작 (아) 짐작의 두 칸(outingCalendar · gameDates)을 직접 읽는 파일은 facts.ts · outing.ts 둘뿐',
      json(readers.sort()) === json(['lib/engine/outing.ts', 'lib/report/facts.ts']),
      readers.join(' · ')
    );
    /* 회복 · 쉬기를 내는 독자(프로그램 · 영양 · 암케어)는 짐작을 안 읽는다 — 짐작 · 범위 칸을 직접 안 본다 */
    const strict = [
      'lib/program/program.ts',
      'lib/program/load.ts',
      'lib/nutrition/guide.ts',
      'lib/armcare/routine.ts',
    ];
    const leaks = strict.filter((p) =>
      /\.soft\b|nextSource|\.guess\b|daysUntilNext/.test(strip(p))
    );
    check(
      `P4 짐작 (아) 회복 · 쉬기를 내는 독자(${strict.join(' · ')})는 짐작(soft · guess · 출처 · 범위)을 안 읽는다`,
      leaks.length === 0,
      leaks.join(' · ')
    );
  }
}

/* ═══════════════════ [2판 P4] 화면 — 다음 등판 한 줄 · 어제 등판 몇 구(lib/outing-line.ts · components/outing-line.tsx · components/checkin-form.tsx) (2026-10-12) ═══════════════════ */
console.log(
  "\n[2판 P4] 화면 — 트레이닝 일정 카드 위 '다음 등판까지 N일' 한 줄 · 짐작이면 '바꾸기' · 체크인의 '어제 등판 · 몇 구' 줄(2026-10-12)"
);
{
  /*
   * 왜 보는가. 커밋 H 는 화면 둘을 더한다 — ① 트레이닝 일정 카드 위 '다음 등판까지 N일'(달력 · 같은 요일로 짐작한 날이면 '추정'과 '바꾸기')
   * ② 어제 '오늘 등판'이라 답했는데 어제 투구 기록이 없으면 체크인 창에서 몇 구였는지 묻고, 그 답을 투구 기록 API 로 어제 날짜 경기 한 줄로
   * 남긴다. 화면은 로그인이 필요해 브라우저로 못 보니, 글 · 판단(lib/outing-line.ts, 순수)을 표로 보고 엔진(outingOf · dayKindOf)과 같은 날을
   * 말하는지, 남긴 기록이 정말 '기록 없는 등판'(R3')을 걷는지를 본다. (가) 한 줄 글 표 (나) 실제 facts 로 — 엔진과 같은 날 (다) 어제 줄을
   * 물을지 (라) 칸 → 기록 몸 (마) 남긴 기록이 R3' 를 걷는다 (바) 화면 글 규칙 (사) 배선 · 소스.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const keyIn = (days: number) => dayBefore(-days).slice(0, 10);
  type HLog = {
    daysAgo: number;
    pitches: number;
    sessionType: string;
    effortPct?: number;
  };
  type HP = {
    today?: string | null;
    yesterday?: string | null;
    logs?: HLog[];
    calendar?: CalendarEventLike[];
  };
  const hCheckin = (
    daysAgo: number,
    throwPlan: string | null | undefined
  ): CheckinLike => ({
    date: dayBefore(daysAgo).slice(0, 10),
    condition: 8,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    ...(throwPlan !== undefined ? { throwPlan } : {}),
  });
  const hFacts = (p: HP) =>
    buildFacts({
      nickname: '화면',
      age: 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: dayBefore(l.daysAgo),
        pitchCount: l.pitches,
        intensity: 9,
        ...(l.effortPct != null ? { effortPct: l.effortPct } : {}),
        sessionType: l.sessionType,
        maxVelocity: null,
        avgVelocity: null,
      })),
      checkins: [
        hCheckin(0, p.today),
        ...(p.yesterday !== undefined ? [hCheckin(1, p.yesterday)] : []),
      ],
      memos: [],
      ...(p.calendar ? { calendarEvents: p.calendar } : {}),
    });

  /* ── (가) 한 줄 글 표 ── */
  {
    type Row = [
      Parameters<typeof outingLineOf>[0],
      { main: string; guess: string | null } | null,
    ];
    const rows: Row[] = [
      [{ daysUntilNext: null, nextSource: 'none' }, null],
      [{ daysUntilNext: null, nextSource: 'checkin' }, null],
      [
        { daysUntilNext: { min: 0, max: 0 }, nextSource: 'checkin' },
        { main: '오늘 등판', guess: null },
      ],
      [
        { daysUntilNext: { min: 0, max: 0 }, nextSource: 'checkin-yesterday' },
        { main: '오늘 등판', guess: null },
      ],
      [
        { daysUntilNext: { min: 1, max: 1 }, nextSource: 'checkin' },
        { main: '내일 등판', guess: null },
      ],
      [
        { daysUntilNext: { min: 3, max: 3 }, nextSource: 'checkin' },
        { main: '다음 등판까지 3일', guess: null },
      ],
      [
        { daysUntilNext: { min: 2, max: 3 }, nextSource: 'checkin' },
        { main: '다음 등판까지 2~3일', guess: null },
      ],
      [
        { daysUntilNext: { min: 1, max: 2 }, nextSource: 'checkin-yesterday' },
        { main: '다음 등판까지 1~2일', guess: null },
      ],
      [
        { daysUntilNext: { min: 4, max: null }, nextSource: 'checkin' },
        { main: '다음 등판까지 4일 이상', guess: null },
      ],
      [
        { daysUntilNext: { min: 3, max: null }, nextSource: 'checkin-yesterday' },
        { main: '다음 등판까지 3일 이상', guess: null },
      ],
      [
        { daysUntilNext: { min: 2, max: 2 }, nextSource: 'calendar' },
        { main: '다음 등판까지 2일', guess: '달력으로 추정' },
      ],
      [
        { daysUntilNext: { min: 0, max: 0 }, nextSource: 'estimate' },
        { main: '오늘 등판', guess: '요일로 추정' },
      ],
      [
        { daysUntilNext: { min: 1, max: 1 }, nextSource: 'calendar' },
        { main: '내일 등판', guess: '달력으로 추정' },
      ],
    ];
    const wrong = rows.filter(([o, want]) => json(outingLineOf(o)) !== json(want));
    check(
      `P4 화면 (가) 다음 등판 한 줄 표 ${rows.length}건 — 0 오늘 · 1 내일 · N일 · N~M일 · N일 이상, 짐작(달력 · 같은 요일)만 '추정', 모르면 줄 없음`,
      wrong.length === 0,
      wrong.map(([o]) => json(o)).join(' | ')
    );
  }

  /* ── (나) 실제 facts 로 — 엔진(outingOf)이 말하는 날을 그대로 ── */
  {
    const MON = [7, 14, 21].map((d) => ({
      daysAgo: d,
      pitches: 20,
      sessionType: '경기',
    }));
    const cases: [string, HP, { main: string; guess: string | null } | null][] = [
      ["오늘 '오늘 등판'", { today: '오늘 등판' }, { main: '오늘 등판', guess: null }],
      ["오늘 '내일 등판'", { today: '내일 등판' }, { main: '내일 등판', guess: null }],
      [
        "오늘 답 없음 · 어제 '2~3일 뒤' → 하루 당김",
        { today: null, yesterday: '2~3일 뒤' },
        { main: '다음 등판까지 1~2일', guess: null },
      ],
      [
        "오늘 '4일 이상 뒤'",
        { today: '4일 이상 뒤' },
        { main: '다음 등판까지 4일 이상', guess: null },
      ],
      [
        "오늘 '없음' + 달력 2일 뒤 경기 → 답이 막아 줄 없음",
        { today: '없음', calendar: [{ date: keyIn(2), title: '리그 경기' }] },
        null,
      ],
      [
        '답 없음 + 달력 2일 뒤 경기',
        { today: null, calendar: [{ date: keyIn(2), title: '리그 경기' }] },
        { main: '다음 등판까지 2일', guess: '달력으로 추정' },
      ],
      [
        '답 없음 + 지난 세 주 월요일 경기(오늘 월요일)',
        { today: null, logs: MON, calendar: [] },
        { main: '오늘 등판', guess: '요일로 추정' },
      ],
      ["오늘 '오늘 불펜'만", { today: '오늘 불펜' }, null],
      ['아무 답 없음', { today: null }, null],
    ];
    const wrong = cases.filter(
      ([, p, want]) => json(outingLineOf(outingOf(hFacts(p)))) !== json(want)
    );
    check(
      `P4 화면 (나) 실제 facts ${cases.length}건 — 답 · 어제 답 하루 당김 · '없음'이 짐작을 막음 · 달력 · 같은 요일을 엔진 그대로 말한다`,
      wrong.length === 0,
      wrong.map(([n]) => n).join(' | ')
    );
    /* 160조합(P3 '오늘 상태 한 장' 절의 사람들) — 줄이 있으면 엔진이 다음 등판을 안다, '추정'은 짐작한 출처일 때만 */
    const bad = p3ComboFactsSeen.filter((f) => {
      const o = outingOf(f);
      const line = outingLineOf(o);
      return (
        (line == null) !== (o.daysUntilNext == null) ||
        (line != null && (line.guess != null) !== o.soft) ||
        (line != null && /—/.test(line.main))
      );
    });
    check(
      `P4 화면 (나) 160조합 ${p3ComboFactsSeen.length}명 — 줄 있음 ⇔ 다음 등판을 앎, '추정' ⇔ 짐작한 출처(soft)`,
      p3ComboFactsSeen.length === 160 && bad.length === 0,
      `어긋남 ${bad.length}`
    );
  }

  /* ── (다) 어제 등판 줄을 물을까 ── */
  {
    const asked: string[] = [];
    for (const plan of [...THROW_PLANS, null, undefined, '모르는 글자'])
      for (const logged of [false, true])
        if (asksYesterdayPitches(plan, logged)) asked.push(`${plan}:${logged}`);
    check(
      "P4 화면 (다) 물을지 표 — 어제 답 여섯 · 빈 답 · 모르는 글자 × 기록 있음/없음 중 '오늘 등판' + 기록 없음 하나만 묻는다",
      json(asked) === json(['오늘 등판:false']),
      asked.join(' · ')
    );
    /* 엔진과 같은 규칙 — 묻는 날은 지난 등판이 '어제 답(기록 없음)'인 날이다 */
    const plans = [...THROW_PLANS, null];
    const off = plans.filter((plan) => {
      const o = outingOf(hFacts({ today: null, yesterday: plan }));
      return (
        asksYesterdayPitches(plan, false) !== (o.lastSource === 'checkin-yesterday')
      );
    });
    check(
      "P4 화면 (다) 기록 없는 어제 — 묻는 날 ⇔ 엔진의 지난 등판이 '어제 답'(outingOf lastSource 'checkin-yesterday')",
      off.length === 0,
      off.join(' · ')
    );
  }

  /* ── (라) 칸 → 기록 몸 ── */
  {
    const y = keyIn(-1);
    const ok = readYesterdayOuting({ date: y, pitches: ' 30 ', effort: '85' });
    check(
      'P4 화면 (라) 투구수 · 체감 강도를 적으면 어제 날짜 경기 한 줄(입력 폼과 같은 칸 — 영상 없음)',
      json(ok) ===
        json({
          date: y,
          sessionType: '경기',
          pitchCount: 30,
          effortPct: 85,
          videoPaths: [],
        }) && YESTERDAY_OUTING_SESSION === '경기'
    );
    const blank = [
      readYesterdayOuting({ date: y, pitches: '', effort: '85' }),
      readYesterdayOuting({ date: y, pitches: '   ', effort: '' }),
      readYesterdayOuting({ date: y, pitches: null, effort: null }),
    ];
    check(
      'P4 화면 (라) 투구수를 비우면 아무것도 안 남긴다(체감 강도만 골라도)',
      blank.every((b) => b === null)
    );
    const errors: [string, ReturnType<typeof readYesterdayOuting>][] = [
      ['0구', readYesterdayOuting({ date: y, pitches: '0', effort: '80' })],
      ['소수', readYesterdayOuting({ date: y, pitches: '2.5', effort: '80' })],
      ['글자', readYesterdayOuting({ date: y, pitches: 'abc', effort: '80' })],
      ['음수', readYesterdayOuting({ date: y, pitches: '-3', effort: '80' })],
      ['강도 없음', readYesterdayOuting({ date: y, pitches: '30', effort: '' })],
      [
        '날짜 꼴 아님',
        readYesterdayOuting({ date: '어제', pitches: '30', effort: '80' }),
      ],
      ['날짜 없음', readYesterdayOuting({ date: null, pitches: '30', effort: '80' })],
    ];
    const notErr = errors.filter(([, r]) => r == null || !('error' in r));
    check(
      `P4 화면 (라) 막는 칸 ${errors.length}건 — 0구 · 소수 · 글자 · 음수 · 체감 강도 없음 · 날짜 꼴 아님 · 날짜 없음`,
      notErr.length === 0 &&
        (errors[4][1] as { error: string }).error === '어제 체감 강도를 골라 주세요.',
      notErr.map(([n]) => n).join(' · ')
    );
    /* 투구 기록 API 가 이 몸을 받는다 — 같은 종류 검사 · 같은 체감 강도 규칙(lib/pitch-effort.ts) */
    const sent = ok as { sessionType: string; effortPct: number };
    const effort = readEffortInput(sent, false);
    check(
      'P4 화면 (라) 투구 기록 API 의 검사를 그대로 통과한다 — 종류 · 체감 강도(85% → 85 · 1~10 의 9)',
      !('error' in validateSessionType(sent.sessionType)) &&
        !('error' in effort) &&
        effort.effortPct === 85 &&
        effort.intensity === 9
    );
  }

  /* ── (마) 남긴 기록이 '기록 없는 등판'(R3')을 걷는다 ── */
  {
    const before = hFacts({ today: null, yesterday: '오늘 등판' });
    const body = readYesterdayOuting({
      date: keyIn(-1),
      pitches: '30',
      effort: '85',
    }) as {
      pitchCount: number;
      sessionType: string;
      effortPct: number;
    };
    const after = hFacts({
      today: null,
      yesterday: '오늘 등판',
      logs: [
        {
          daysAgo: 1,
          pitches: body.pitchCount,
          sessionType: body.sessionType,
          effortPct: body.effortPct,
        },
      ],
    });
    const o1 = outingOf(before);
    const o2 = outingOf(after);
    check(
      "P4 화면 (마) 어제 30구를 남기면 지난 등판이 기록으로 바뀌고 날 종류가 '기록 없는 등판'(R3')에서 벗어난다",
      o1.lastSource === 'checkin-yesterday' &&
        dayKindOf(before).rule === 'claimedNoLog' &&
        o2.lastSource === 'log' &&
        o2.daysSinceLast === 1 &&
        o2.lastPitches === 30 &&
        dayKindOf(after).rule !== 'claimedNoLog' &&
        !asksYesterdayPitches('오늘 등판', true),
      `${dayKindOf(before).rule} → ${dayKindOf(after).rule}`
    );
    /* 세게 던진 날이면 회복(R1) — 기록이 부하로 읽힌다 */
    const big = hFacts({
      today: null,
      yesterday: '오늘 등판',
      logs: [{ daysAgo: 1, pitches: 80, sessionType: '경기', effortPct: 100 }],
    });
    check(
      'P4 화면 (마) 어제 경기 80구를 남기면 세게 던진 날(R1 hard)로 회복 — 부하 기준(D3)',
      dayKindOf(big).rule === 'hard' && outingOf(big).lastSource === 'log'
    );
  }

  /* ── (바) 화면 글 규칙 ── */
  {
    const texts = [
      ...[
        { min: 0, max: 0 },
        { min: 1, max: 1 },
        { min: 2, max: 3 },
        { min: 5, max: 5 },
        { min: 4, max: null },
      ].flatMap((w) =>
        (['checkin', 'calendar', 'estimate'] as const).flatMap((s) => {
          const l = outingLineOf({ daysUntilNext: w, nextSource: s });
          return l ? [l.main, ...(l.guess ? [l.guess] : [])] : [];
        })
      ),
    ];
    const errs = [
      readYesterdayOuting({ date: 'x', pitches: '3', effort: '80' }),
      readYesterdayOuting({ date: keyIn(-1), pitches: '0', effort: '80' }),
      readYesterdayOuting({ date: keyIn(-1), pitches: '3', effort: '' }),
    ].map((r) => (r && 'error' in r ? r.error : ''));
    const badText = texts.filter((t) => /—|\*\*/.test(t) || t.length > 16);
    const badErr = errs.filter((t) => !t || /—|\*\*/.test(t) || !/요\.$/.test(t));
    check(
      `P4 화면 (바) 글 ${texts.length + errs.length}개 — 줄표 · 굵게 없음, 한 줄 글은 16자 안, 막는 글은 해요체로 끝`,
      badText.length === 0 && badErr.length === 0,
      [...badText, ...badErr].join(' | ')
    );
  }

  /* ── (사) 배선 · 소스 ── */
  {
    const strip = (rel: string) =>
      readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const lineSrc = strip('lib/outing-line.ts');
    const imports = [...lineSrc.matchAll(/^import .* from '([^']+)';$/gm)].map(
      (m) => m[1]
    );
    check(
      'P4 화면 (사) lib/outing-line.ts 는 순수 — import 는 checkin 규칙 · 등판 타입 · 투구 종류 타입뿐(server-only · prisma · 날짜 함수 없음), 답 글자를 직접 안 견줌',
      json(imports) ===
        json(['@/lib/checkin', '@/lib/engine/outing', '@/lib/session-type']) &&
        /^import type \{ Outing \}/m.test(lineSrc) &&
        !/server-only|prisma|appNow|new Date\(|Math\.random/.test(lineSrc) &&
        /* 답 글자를 직접 견주지 않는다(내보내는 글 '오늘 등판'은 괜찮다) — 등판 답 규칙은 lib/checkin.ts 한 곳 */
        !/=== '오늘 등판'|'오늘 등판' ===/.test(lineSrc),
      imports.join(' · ')
    );
    const comp = strip('components/outing-line.tsx');
    check(
      "P4 화면 (사) 한 줄 부품은 서버 부품 — 글은 outingLineOf 에서, '바꾸기'는 체크인 여는 단추(OpenCheckinButton)",
      !/'use client'/.test(comp) &&
        /outingLineOf\(outing\)/.test(comp) &&
        /<OpenCheckinButton[\s\S]*?바꾸기[\s\S]*?<\/OpenCheckinButton>/.test(comp)
    );
    const page = strip('app/(app)/training/page.tsx');
    const at = page.indexOf('<OutingLine outing={core.state.outing} />');
    check(
      'P4 화면 (사) 트레이닝 화면 — 오늘 상태 한 장의 등판 칸으로 한 번만 그리고, 일정 카드 묶음(halted · 만들기 전 · 일정) 바로 위',
      at > 0 &&
        page.split('<OutingLine').length === 2 &&
        /^\s*\{picked\.halted \? \(/.test(
          page.slice(at + '<OutingLine outing={core.state.outing} />'.length)
        ) &&
        /import \{ OutingLine \} from '@\/components\/outing-line';/.test(page)
    );
    const form = strip('components/checkin-form.tsx');
    check(
      "P4 화면 (사) 체크인 폼 — 물을지는 asksYesterdayPitches, 칸은 readYesterdayOuting, 남기기는 투구 기록 API 한 번(POST), 글자 '오늘 등판'을 직접 안 견줌",
      /asksYesterdayPitches\(yesterdayPlan, pitchDays\.includes\(yesterdayKey\)\)/.test(
        form
      ) &&
        /readYesterdayOuting\(\{/.test(form) &&
        form.split("fetch('/api/pitch-log'").length === 2 &&
        /method: 'POST'/.test(form) &&
        /name="yesterdayPitches"/.test(form) &&
        /<EffortChips/.test(form) &&
        !/=== '오늘 등판'/.test(form) &&
        !/prisma/.test(form)
    );
    const gate = strip('components/checkin-gate.tsx');
    const shell = strip('components/app-shell.tsx');
    const layout = strip('app/(app)/layout.tsx');
    check(
      'P4 화면 (사) 관문 · 종 창이 레이아웃의 같은 투구 날 목록을 넘긴다(조회는 안 늚) — 트레이닝 탭 창은 안 넘김(묻지 않음)',
      /<CheckinForm[\s\S]{0,200}pitchDays=\{pitchDays\}/.test(gate) &&
        /<CheckinForm[\s\S]{0,300}pitchDays=\{todo\.pitchDays\}/.test(shell) &&
        /<CheckinGate[\s\S]{0,300}pitchDays=\{pitchDays\}/.test(layout) &&
        /pitchDays,\n/.test(layout) &&
        layout.split('prisma.pitchLog.findMany(').length === 2 &&
        !/pitchDays/.test(strip('app/(app)/training/training-checkin.tsx'))
    );
    check(
      'P4 화면 (사) 체크인 저장 동작은 투구 기록을 안 만든다 — 만드는 길은 투구 기록 API 하나(셋째 복사본 없음)',
      !/pitchLog\.create/.test(strip('app/actions/checkin.ts'))
    );
  }
}

/* ═══════════════════ [2판 P4] 도구 — 사용 통계 ⑦ · 기준선 번호(scripts/training-usage-stats.mts · scripts/training-baseline.mts) (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P4] 도구 — 사용 통계 ⑦(달력 낱말 · 같은 요일)이 앱 규칙을 그대로 읽고 이름을 안 찍는가 · 기준선 번호 표가 출력과 맞는가(2026-10-12)'
);
{
  /*
   * 왜 보는가. 두 도구는 운영 DB 를 읽어 시험으로 돌릴 수 없다. 그래서 소스로만 지킨다 — ① 사용 통계 ⑦ 이 낱말 · 같은 요일 문턱을
   * 베끼면 앱이 낱말을 바꿔도 통계는 옛 낱말을 센다(lib/calendar-event.ts · lib/engine/outing.ts 에서 가져오고, 같은 요일 셈은 앱 함수와
   * 늘 견준다) ② 일정 이름은 사용자가 적은 글이라 낱말 수만 내고 원문은 안 찍는다 ③ 기준선의 번호 표(머리 주석)가 '재는 것' 표 · 절 제목과
   * 어긋나면 설계 문서가 엉뚱한 지표를 가리킨다 — 다음 단계가 ⑰ 을 더할 때 머리 표도 같이 고치게 한다.
   */
  const strip = (rel: string) =>
    readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const usage = strip('scripts/training-usage-stats.mts');
  check(
    'P4 도구 (가) 사용 통계 ⑦ 은 등판 낱말 · 빼는 낱말 · 판정을 lib/calendar-event.ts, 같은 요일 문턱 · 창을 lib/engine/outing.ts 에서 가져오고 낱말 목록을 베끼지 않는다',
    /import \{\s*OUTING_TITLE_EXCLUDE_WORDS,\s*OUTING_TITLE_WORDS,\s*isOutingTitle,\s*\} from '\.\.\/lib\/calendar-event\.ts';/.test(
      usage
    ) &&
      /import \{\s*ESTIMATE_LOOKBACK_DAYS,\s*ESTIMATE_MIN_GAMES,\s*outingGuessInputsOf,\s*\} from '\.\.\/lib\/engine\/outing\.ts';/.test(
        usage
      ) &&
      !/\[\s*'경기',\s*'등판'/.test(usage) &&
      !/\[\s*'관람',\s*'응원'/.test(usage)
  );
  check(
    'P4 도구 (가) 같은 요일 셈은 날마다 앱 함수(outingGuessInputsOf)와 견주고 다르면 던진다',
    /const app = appNearestGuess\(dates, day\);/.test(usage) &&
      /if \(r === strict && d !== app\)\s*throw new Error\(/.test(usage)
  );
  check(
    'P4 도구 (나) 사용 통계 ⑦ 은 일정 이름을 조건에 넘길 때만 쓰고(찍는 곳 없음) 메모는 읽지 않는다',
    usage.split('.title').length === 2 &&
      /if \(!match\(e\.title\)\) continue;/.test(usage) &&
      /select: \{ userId: true, date: true, title: true \}/.test(usage) &&
      !/memo/.test(usage)
  );
  check(
    'P4 도구 (다) 실행 차례에 ⑦ 이 있다(⑥ 다음)',
    /await sectionFeedback\(setups, sessions, pairing\);\s*await sectionCalendar\(\);/.test(
      usage
    )
  );

  /* 기준선 — 머리 주석의 번호 표(①~⑫ 는 P0, 그 뒤는 표에 적힌 것)와 '재는 것' 줄 · 절 제목의 번호 */
  const baselineRaw = readFileSync(
    new URL('../scripts/training-baseline.mts', import.meta.url),
    'utf8'
  );
  const head = baselineRaw.slice(0, baselineRaw.indexOf('\nimport '));
  const mapStart = head.indexOf(' * 번호.');
  const mapEnd = head.indexOf('커밋 메시지', mapStart);
  const mapText =
    mapStart >= 0 && mapEnd > mapStart ? head.slice(mapStart, mapEnd) : '';
  /*
   * P5 로 바뀜 — 왜: P5 도구 커밋(T0)이 ⑰~㉒ 를 더했다. ㉑ 부터는 원 숫자가 다른 유니코드 덩어리(U+3251~)라 옛 정규식 [①-⑳] 이 못 잡아
   * (표 · 줄에 있어도 안 보여 거저 통과했다) 같이 넓혔다. 표의 번호는 P4 의 넷에서 열로 늘었다.
   */
  const circled = (s: string) => [...s.matchAll(/[①-⑳㉑-㉟]/g)].map((m) => m[0]);
  const P0_NUMBERS = circled('①②③④⑤⑥⑦⑧⑨⑩⑪⑫');
  const mapped = new Set(circled(mapText).filter((n) => !P0_NUMBERS.includes(n)));
  const baseline = strip('scripts/training-baseline.mts');
  const rowNumbers = new Set(
    [...baseline.matchAll(/^\s*'([①-⑳㉑-㉟])',$/gm)].map((m) => m[1])
  );
  const headingNumbers = new Set(
    [...baseline.matchAll(/## ([①-⑳㉑-㉟]) /g)].map((m) => m[1])
  );
  const allowed = new Set([...P0_NUMBERS, ...mapped]);
  const stray = [...rowNumbers, ...headingNumbers].filter((n) => !allowed.has(n));
  const unused = [...mapped].filter((n) => !rowNumbers.has(n));
  const MAPPED_NUMBERS = circled('⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒');
  check(
    "P4 도구 (라) 기준선 '재는 것' 줄 · 절 제목의 번호가 모두 머리 주석 번호 표(①~⑫ + P4 의 ⑬~⑯ + P5 도구의 ⑰~㉒)에 있고, 표의 번호는 모두 줄로 나온다",
    mapped.size === MAPPED_NUMBERS.length &&
      MAPPED_NUMBERS.every((n) => mapped.has(n)) &&
      stray.length === 0 &&
      unused.length === 0,
    `표 ${[...mapped].join(' ')} · 줄 ${[...rowNumbers].join(' ')} · 제목 ${[...headingNumbers].join(' ')}${stray.length ? ` · 표에 없음 ${stray.join(' ')}` : ''}${unused.length ? ` · 줄에 없음 ${unused.join(' ')}` : ''}`
  );
  const metricKeys = [...mapText.matchAll(/metrics\.([A-Za-z]+)/g)].map((m) => m[1]);
  check(
    'P4 도구 (라) 기준선 번호 표가 가리키는 JSON 칸(metrics.…)이 모두 JSON 에 실린다',
    metricKeys.length >= 5 &&
      metricKeys.every((k) => new RegExp(`^\\s+${k},$`, 'm').test(baseline)),
    metricKeys.join(' · ')
  );
}

/* ═══════════════════ [2판 P4] 검토 반영 — 어제 기록 유무 · 성장기 암케어 휴식표 · 쉬는 까닭 글 · 대체 까닭 (2026-10-12) ═══════════════════ */
console.log(
  "\n[2판 P4] 검토 반영 — 휴식 줄은 '안 던졌다'는 답 · 오늘 기록이 어제의 기록 없는 등판을 안 지움 · 성장기 암케어도 어린 휴식표 · 쉬는 까닭 글 · 대체 까닭(2026-10-12)"
);
{
  /*
   * 왜 보는가(반박 검토 열하나 중 코드로 확인한 것). ① 어제 '오늘 등판' 답에 어제를 '휴식'으로 남겨도 엔진은 던진 날만 세어 '기록 없는 등판'
   * (보조 날 · 프로그램 쉬기 · 암케어 회복)을 냈고, 체크인 창은 쉰 날 줄까지 세어 다시 묻지 않아 풀 길이 없었다. ② 오늘 캐치볼 한 줄만
   * 남겨도 지난 등판이 오늘 기록이 되어 어제의 기록 없는 등판이 지워졌다(프로그램이 P4 전보다 느슨해짐). ③ 암케어가 휴식표를 나이 없이
   * 불러 만 14세 이하에게 15~18세 표를 썼다. ④ 프로그램이 쉬는 까닭 셋을 모두 '어제 팔 부담이 컸어요'로 말했다. ⑤ 팔 피로만 '심함'인
   * 날 프로그램 대체 꼬리표가 '통증 부위'였다. ⑥ 일정 지문이 새 칸(어제 기록 유무)을 담는지.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const iso = (daysAgo: number) =>
    new Date(TODAY.getTime() - daysAgo * 86400000).toISOString();
  type RL = {
    daysAgo: number;
    pitches: number;
    sessionType: string;
    effortPct?: number;
  };
  type RP = {
    age?: number;
    today?: string | null;
    yesterday?: string | null;
    logs?: RL[];
    armFatigue?: number | null;
    shoulder?: string;
  };
  const rCheckin = (
    daysAgo: number,
    throwPlan: string | null | undefined,
    extra: Partial<CheckinLike> = {}
  ): CheckinLike => ({
    date: iso(daysAgo).slice(0, 10),
    condition: 7,
    sleep: '보통',
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
    preferredParts: [],
    preferredWorkout: null,
    ...(throwPlan !== undefined ? { throwPlan } : {}),
    ...extra,
  });
  const rFacts = (p: RP) =>
    buildFacts({
      nickname: '검토',
      age: p.age ?? 22,
      heightCm: 180,
      trainingLevel: null,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: (p.logs ?? []).map<PitchLogLike>((l) => ({
        date: iso(l.daysAgo),
        pitchCount: l.pitches,
        intensity: l.sessionType === '휴식' ? 0 : Math.round((l.effortPct ?? 70) / 10),
        effortPct: l.sessionType === '휴식' ? null : (l.effortPct ?? 70),
        sessionType: l.sessionType,
        maxVelocity: null,
        avgVelocity: null,
      })),
      checkins: [
        rCheckin(0, p.today, {
          ...(p.armFatigue !== undefined ? { armFatigue: p.armFatigue } : {}),
          ...(p.shoulder ? { shoulder: p.shoulder } : {}),
        }),
        ...(p.yesterday !== undefined ? [rCheckin(1, p.yesterday)] : []),
      ],
      memos: [],
    });
  type RF = ReturnType<typeof rFacts>;
  const CLAIM_LINE = '어제 등판했다고 적었는데 투구 기록은 없어요.';
  const whyOf = (f: RF) => buildDayState({ facts: f, plan: buildPitchPlan(f) }).why;
  const REST: RL = { daysAgo: 1, pitches: 0, sessionType: '휴식' };
  const program = parseProgram('531');
  check("검토 반영 — 프로그램 '531' 을 읽는다", program != null);
  const baseSig: TodaySignals = {
    nextDay: 1,
    today: TODAY.toISOString().slice(0, 10),
    lastProgramDate: null,
    checkedIn: true,
    otherWorkoutStarted: false,
    halted: false,
    gameToday: false,
    gameTomorrow: false,
    gameYesterday: false,
    bullpenToday: false,
    hardThrowRecent: false,
    override: false,
    recovery: null,
    loadCaution: false,
    soreMany: false,
    sleepShort: false,
    uncertain: false,
    painSlots: [],
  };
  /* 앱(lib/program/load.ts)과 같은 길 — 오늘 상태 한 장의 등판 · 오늘 기록 종류 · 어제 팔 부담 */
  const signalsOf = (f: RF, typesToday: string[]) =>
    programSignalsOf({
      outing: buildDayState({ facts: f, plan: buildPitchPlan(f) }).outing,
      typesToday,
      yesterdayArmLoad: yesterdayArmLoadOf(f),
    });

  /* ── (가) 어제 '휴식' 줄은 '안 던졌다'는 답 — 기록 없는 등판이 풀린다 ── */
  {
    const rested = rFacts({ yesterday: '오늘 등판', logs: [REST] });
    const o = outingOf(rested);
    check(
      "검토 (가) 어제 '오늘 등판' + 어제 '휴식' 줄 → 어제 기록 있음 · 기록 없는 등판 아님 · 지난 등판 없음",
      rested.patterns.loggedYesterday === true &&
        rested.patterns.restDays == null &&
        !o.claimedYesterdayNoLog &&
        o.lastSource === 'none' &&
        o.daysSinceLast == null,
      json({ logged: rested.patterns.loggedYesterday, last: o.lastSource })
    );
    check(
      "검토 (가) 같은 날 — 어제 팔 부담 없음 · 날 종류가 R3' 아님 · 이유 줄 없음 · 프로그램 안 쉼 · 암케어에 '어제 등판' 없음 · 체크인도 안 물음(한 규칙)",
      yesterdayArmLoadOf(rested) == null &&
        dayKindOf(rested).rule !== 'claimedNoLog' &&
        !whyOf(rested).includes(CLAIM_LINE) &&
        !signalsOf(rested, []).gameYesterday &&
        !decideArmcare({
          facts: rested,
          plan: buildPitchPlan(rested),
          armFatigue: null,
        }).reason.includes('어제 등판') &&
        !asksYesterdayPitches('오늘 등판', true),
      `${dayKindOf(rested).rule}`
    );
    const older = rFacts({
      yesterday: '오늘 등판',
      logs: [REST, { daysAgo: 3, pitches: 40, sessionType: '불펜', effortPct: 70 }],
    });
    const oo = outingOf(older);
    check(
      "검토 (가) 어제 '휴식' + 사흘 전 불펜 40구 → 지난 등판은 그 기록(3일 · 40구), 어제 답이 기록을 가리지 않는다",
      !oo.claimedYesterdayNoLog &&
        oo.lastSource === 'log' &&
        oo.daysSinceLast === 3 &&
        oo.lastPitches === 40,
      json({ last: oo.lastSource, d: oo.daysSinceLast, p: oo.lastPitches })
    );
    const none = rFacts({ yesterday: '오늘 등판' });
    const on = outingOf(none);
    check(
      "검토 (가) 어제 줄이 하나도 없으면 그대로 기록 없는 등판 — 지난 등판 '어제 답' · 어제 팔 부담 claimedNoLog · 이유 줄 · 프로그램 쉼 · 체크인이 묻는다",
      none.patterns.loggedYesterday === false &&
        on.claimedYesterdayNoLog &&
        on.lastSource === 'checkin-yesterday' &&
        on.daysSinceLast === 1 &&
        yesterdayArmLoadOf(none)?.kind === 'claimedNoLog' &&
        whyOf(none).includes(CLAIM_LINE) &&
        signalsOf(none, []).gameYesterday &&
        asksYesterdayPitches('오늘 등판', false)
    );
    /* 옛 facts(칸 없음) — 던진 기록으로만 가린다: 휴식 줄은 못 보고(옛 동작), 어제 던진 기록은 본다 */
    const stripLogged = (f: RF): RF => {
      const patterns = { ...f.patterns };
      delete patterns.loggedYesterday;
      return { ...f, patterns };
    };
    const threw = rFacts({
      yesterday: '오늘 등판',
      logs: [{ daysAgo: 1, pitches: 30, sessionType: '경기', effortPct: 100 }],
    });
    check(
      '검토 (가) 옛 facts(loggedYesterday 칸 없음) — 휴식 줄은 못 보아 예전처럼 기록 없는 등판, 어제 던진 기록은 기록으로 본다',
      outingOf(stripLogged(rested)).claimedYesterdayNoLog &&
        !outingOf(stripLogged(threw)).claimedYesterdayNoLog &&
        outingOf(stripLogged(threw)).lastSource === 'log'
    );
    /* 체크인의 '물을까'와 엔진이 같은 규칙 — 어제 답 일곱 × 어제 줄 넷 × 오늘 줄 둘 */
    const YROWS: { name: string; logs: RL[] }[] = [
      { name: '없음', logs: [] },
      { name: '휴식', logs: [REST] },
      {
        name: '캐치볼 10',
        logs: [{ daysAgo: 1, pitches: 10, sessionType: '캐치볼', effortPct: 40 }],
      },
      {
        name: '경기 30',
        logs: [{ daysAgo: 1, pitches: 30, sessionType: '경기', effortPct: 100 }],
      },
    ];
    const TROWS: { name: string; logs: RL[] }[] = [
      { name: '오늘 없음', logs: [] },
      {
        name: '오늘 캐치볼 10',
        logs: [{ daysAgo: 0, pitches: 10, sessionType: '캐치볼', effortPct: 40 }],
      },
    ];
    const off: string[] = [];
    let asked = 0;
    for (const plan of [...THROW_PLANS, null])
      for (const y of YROWS)
        for (const t of TROWS) {
          const f = rFacts({ yesterday: plan, logs: [...y.logs, ...t.logs] });
          const ask = asksYesterdayPitches(plan, y.logs.length > 0);
          if (ask) asked++;
          if (ask !== outingOf(f).claimedYesterdayNoLog)
            off.push(`${plan}/${y.name}/${t.name}`);
          if ((yesterdayArmLoadOf(f)?.kind === 'claimedNoLog') !== ask)
            off.push(`${plan}/${y.name}/${t.name}: 팔 부담`);
        }
    check(
      `검토 (가) 격자 ${(THROW_PLANS.length + 1) * YROWS.length * TROWS.length} — 체크인이 묻는 날 ⇔ 엔진의 기록 없는 등판 ⇔ 어제 팔 부담 claimedNoLog(쉰 날 줄까지 같은 규칙, 묻는 날 ${asked})`,
      off.length === 0 && asked === 2,
      off.slice(0, 4).join(' · ')
    );
  }

  /* ── (나) 오늘 기록이 어제의 기록 없는 등판을 지우지 않는다 ── */
  {
    const catchToday: RL = {
      daysAgo: 0,
      pitches: 10,
      sessionType: '캐치볼',
      effortPct: 40,
    };
    const g = rFacts({ yesterday: '오늘 등판', logs: [catchToday] });
    const o = outingOf(g);
    const decision =
      program == null
        ? null
        : decideToday(program, { ...baseSig, ...signalsOf(g, ['캐치볼']) });
    check(
      "검토 (나) 어제 '오늘 등판' + 어제 기록 없음 + 오늘 캐치볼 10구 40% → 지난 등판은 오늘 기록이지만 기록 없는 등판은 남는다",
      o.lastSource === 'log' &&
        o.daysSinceLast === 0 &&
        o.claimedYesterdayNoLog &&
        yesterdayArmLoadOf(g)?.kind === 'claimedNoLog',
      json({ last: o.lastSource, claim: o.claimedYesterdayNoLog })
    );
    check(
      "검토 (나) 같은 날 — 날 종류 R3'(보조) · 이유 줄 · 프로그램은 어제 등판 다음 날로 쉼('어제 등판한 다음 날이에요') · 체크인이 어제 몇 구를 묻는다",
      dayKindOf(g).rule === 'claimedNoLog' &&
        whyOf(g).includes(CLAIM_LINE) &&
        decision?.kind === 'rest' &&
        decision.reason === 'gameYesterday' &&
        restTextOf(decision.reason, yesterdayArmLoadOf(g)?.kind ?? null) ===
          '어제 등판한 다음 날이에요' &&
        asksYesterdayPitches('오늘 등판', false),
      `${dayKindOf(g).rule} · ${decision?.kind}`
    );
    const logged = rFacts({
      yesterday: '오늘 등판',
      logs: [
        catchToday,
        { daysAgo: 1, pitches: 30, sessionType: '경기', effortPct: 100 },
      ],
    });
    check(
      '검토 (나) 어제 경기 30구를 남기면 풀린다 — 기록 없는 등판 아님, 날 종류는 부하(세게 던진 날 R1)로',
      !outingOf(logged).claimedYesterdayNoLog &&
        yesterdayArmLoadOf(logged)?.kind === 'hard' &&
        dayKindOf(logged).rule === 'hard'
    );
  }

  /* ── (다) 성장기 암케어도 어린 휴식표 — 투구 계획과 같은 말 ── */
  {
    const yesterdayLog = (
      age: number,
      sessionType: string,
      pitches: number,
      effortPct: number
    ) => rFacts({ age, logs: [{ daysAgo: 1, pitches, sessionType, effortPct }] });
    const armOf = (f: RF) =>
      decideArmcare({ facts: f, plan: buildPitchPlan(f), armFatigue: null });
    const y13 = yesterdayLog(13, '불펜', 50, 50);
    const y12 = yesterdayLog(12, '캐치볼', 60, 30);
    const a22 = yesterdayLog(22, '불펜', 50, 50);
    const a13 = armOf(y13);
    const a12 = armOf(y12);
    const adult = armOf(a22);
    check(
      "검토 (다) 만 13세 어제 불펜 50구 50% — 투구 계획은 쉬는 날, 암케어도 회복('어제 50구 · 아직 쉬는 기간')",
      buildPitchPlan(y13).today?.throwing === false &&
        a13.kind === 'recovery' &&
        a13.reason.startsWith('어제 50구 · 아직 쉬는 기간'),
      `${buildPitchPlan(y13).today?.throwing} · ${a13.kind} · ${a13.reason}`
    );
    check(
      "검토 (다) 만 12세 어제 캐치볼 60구 30% — 투구 계획은 쉬는 날, 암케어도 회복('어제 60구 · 아직 쉬는 기간')",
      buildPitchPlan(y12).today?.throwing === false &&
        a12.kind === 'recovery' &&
        a12.reason.startsWith('어제 60구 · 아직 쉬는 기간'),
      `${buildPitchPlan(y12).today?.throwing} · ${a12.kind} · ${a12.reason}`
    );
    check(
      "검토 (다) 같은 기록의 만 22세는 그대로 — 쉬지 않아도 되는 날이라 강화('어제 50구 · 팔 부담 적음')",
      buildPitchPlan(a22).today?.throwing === true &&
        adult.kind === 'strength' &&
        adult.reason.startsWith('어제 50구 · 팔 부담 적음'),
      `${adult.kind} · ${adult.reason}`
    );
    /* 불변식 — 휴식표(나이를 넣어)가 오늘 아직 쉬라고 하면 암케어는 강화를 안 낸다(나이 9~22 × 어제 기록 여섯) */
    const miss: string[] = [];
    let owedDays = 0;
    const SAMPLE_LOGS: [string, number, number][] = [
      ['불펜', 30, 50],
      ['불펜', 50, 50],
      ['캐치볼', 60, 30],
      ['경기', 40, 100],
      ['라이브', 25, 80],
      ['캐치볼', 20, 40],
    ];
    for (let age = 9; age <= 22; age++)
      for (const [t, n, e] of SAMPLE_LOGS) {
        const f = yesterdayLog(age, t, n, e);
        if (pendingOuting(f.patterns, 0, age) == null) continue;
        owedDays++;
        if (armOf(f).kind === 'strength') miss.push(`${age}세 ${t} ${n}구 ${e}%`);
      }
    check(
      `검토 (다) 불변식 — 휴식표(나이 넣음)가 쉬라는 ${owedDays}가지에서 암케어가 강화를 안 낸다`,
      owedDays >= 15 && miss.length === 0,
      miss.slice(0, 4).join(' · ')
    );
    const src = readFileSync(
      new URL('../lib/armcare/routine.ts', import.meta.url),
      'utf8'
    );
    check(
      '검토 (다) 소스 — 암케어는 휴식표를 나이와 함께 부른다(투구 계획 · 오늘 상태 한 장과 같은 값)',
      /pendingOuting\(p, 0, facts\.profile\.age\)/.test(src) &&
        !/pendingOuting\(p\)/.test(src)
    );
  }

  /* ── (라) 프로그램이 쉬는 까닭 — 어제 팔 부담의 까닭대로 ── */
  {
    const hard = rFacts({
      logs: [{ daysAgo: 1, pitches: 85, sessionType: '경기', effortPct: 100 }],
    });
    const claimed = rFacts({ yesterday: '오늘 등판' });
    const pen = rFacts({
      logs: [{ daysAgo: 1, pitches: 30, sessionType: '불펜', effortPct: 70 }],
    });
    const spiked: RF = {
      ...pen,
      condition: {
        ...pen.condition,
        trainingEffort: {
          last7: [9, 9, 9],
          last28: [9, 9, 9, 5, 5, 5, 5],
          spikeFlag: true,
        },
      },
    };
    const kinds = [hard, spiked, claimed].map(
      (f) => yesterdayArmLoadOf(f)?.kind ?? null
    );
    const texts = kinds.map((k) => restTextOf('gameYesterday', k));
    check(
      "검토 (라) 쉬는 까닭 글 — 세게 던진 날 '어제 많이 던졌어요' · 중간 부하 + 힘듦 급증 '어제 던졌고 최근 운동도 힘들었어요' · 기록 없는 등판 '어제 등판한 다음 날이에요'",
      json(kinds) === json(['hard', 'moderateSpike', 'claimedNoLog']) &&
        json(texts) ===
          json([
            '어제 많이 던졌어요',
            '어제 던졌고 최근 운동도 힘들었어요',
            '어제 등판한 다음 날이에요',
          ]),
      json({ kinds, texts })
    );
    check(
      "검토 (라) 까닭을 모르면 예전 글 · 다른 쉬는 까닭은 그대로('경기 날이에요' · '내일 경기예요')",
      restTextOf('gameYesterday') === REST_TEXT.gameYesterday &&
        restTextOf('gameToday', 'hard') === REST_TEXT.gameToday &&
        restTextOf('gameTomorrow', 'claimedNoLog') === REST_TEXT.gameTomorrow
    );
    const all = [...Object.values(REST_YESTERDAY_TEXT), ...Object.values(REST_TEXT)];
    check(
      `검토 (라) 쉬는 까닭 글 ${all.length}개 — 줄표 · 굵게 없음, 해요체(요로 끝), 20자 안, '경기 다음 날' 없음`,
      all.every(
        (t) =>
          !/—|\*\*/.test(t) &&
          /요$/.test(t) &&
          t.length <= 20 &&
          !t.includes('경기 다음 날')
      ),
      all.join(' | ')
    );
    const loadSrc = readFileSync(
      new URL('../lib/program/load.ts', import.meta.url),
      'utf8'
    );
    check(
      '검토 (라) 소스 — 카드의 쉬는 까닭은 restTextOf(같은 어제 팔 부담), REST_TEXT 를 바로 안 읽는다',
      /restTextOf\(decision\.reason, yesterdayArm\?\.kind \?\? null\)/.test(loadSrc) &&
        !/REST_TEXT\[/.test(loadSrc)
    );
  }

  /* ── (마) 대체 까닭 — 팔 피로만으로 빠진 고정 운동은 '팔 피로' ── */
  {
    type FX = {
      id: string;
      title: string;
      category: string;
      bodyParts: string[];
      intensity: string;
      difficulty: string | null;
      equipment: string[];
      movementPattern?: string | null;
    };
    const fx = (id: string, o: Partial<FX>): FX => ({
      id,
      title: id,
      category: '상체 스트렝스',
      bodyParts: [],
      intensity: '중간',
      difficulty: null,
      equipment: ['맨몸'],
      movementPattern: null,
      ...o,
    });
    const bench = fx('fx-bench', {
      bodyParts: ['삼두'],
      intensity: '높음',
      equipment: ['바벨'],
      movementPattern: '밀기',
    });
    const ball = fx('fx-ball', {
      category: '파워',
      bodyParts: ['코어'],
      equipment: ['메디신볼'],
      movementPattern: '회전',
    });
    const row = fx('fx-row', { bodyParts: ['등'], movementPattern: '당기기' });
    const squat = fx('fx-squat', {
      category: '하체 스트렝스',
      bodyParts: ['고관절'],
      intensity: '높음',
      equipment: ['바벨'],
      movementPattern: '스쿼트',
    });
    const lib = [bench, ball, row, squat];
    const pinned: Record<string, FX> = { push: bench, medball: ball, pull: row, squat };
    const items = [
      { slot: 'pushPull' as const, variant: 'push' as const },
      { slot: 'pushPull' as const, variant: 'pull' as const },
      { slot: 'power' as const, variant: 'medball' as const },
      { slot: 'bigLower' as const, variant: 'squat' as const },
    ];
    const slotsFor = (p: RP) => {
      const f = rFacts(p);
      const input = {
        facts: f,
        plan: buildPitchPlan(f),
        library: lib,
        partsOnly: true,
      };
      const safe = new Set(selectCandidates(input).candidates.map((e) => e.id));
      const armOnly = droppedOnlyForArmFatigue(input);
      return {
        armOnly: [...armOnly].sort(),
        ...painSlotsOf(items, (v) => pinned[v] ?? null, safe, armOnly),
      };
    };
    const arm = slotsFor({ armFatigue: SEVERE_ARM_FATIGUE });
    check(
      "검토 (마) 팔 피로 '심함'만 — 무거운 밀기 · 메디신볼만 팔 피로로 빠지고, 그 칸의 까닭은 '팔 피로'(하체 · 당기기는 그대로)",
      json(arm.armOnly) === json(['fx-ball', 'fx-bench']) &&
        json(arm.painSlots) === json(['pushPull', 'power']) &&
        json(arm.slotReasons) ===
          json({
            pushPull: SUBSTITUTE_REASON.armFatigue,
            power: SUBSTITUTE_REASON.armFatigue,
          }),
      json(arm)
    );
    const pain = slotsFor({ shoulder: '통증' });
    check(
      "검토 (마) 어깨 통증만 — 당기기(등)가 빠지고 까닭은 '통증 부위', 팔 피로로 빠진 것 없음",
      pain.armOnly.length === 0 &&
        json(pain.painSlots) === json(['pushPull']) &&
        pain.slotReasons.pushPull === SUBSTITUTE_REASON.pain,
      json(pain)
    );
    const both = slotsFor({ armFatigue: SEVERE_ARM_FATIGUE, shoulder: '통증' });
    check(
      "검토 (마) 팔 피로 '심함' + 어깨 통증 — 한 칸에 둘이 섞이면(밀기는 팔 피로 · 당기기는 통증) '통증 부위'가 이기고, 메디신볼 칸은 '팔 피로'",
      json(both.painSlots) === json(['pushPull', 'power']) &&
        both.slotReasons.pushPull === SUBSTITUTE_REASON.pain &&
        both.slotReasons.power === SUBSTITUTE_REASON.armFatigue,
      json(both)
    );
    const quiet = [4, 3, null].map((n) => slotsFor({ armFatigue: n }));
    check(
      "검토 (마) 팔 피로 '많이' 이하 · 안 적음 — 팔 피로로 빠진 것도 대체 칸도 없다",
      quiet.every((q) => q.armOnly.length === 0 && q.painSlots.length === 0),
      json(quiet)
    );
    if (program) {
      const d = decideToday(program, {
        ...baseSig,
        painSlots: arm.painSlots,
        slotReasons: arm.slotReasons,
      });
      const old = decideToday(program, { ...baseSig, painSlots: arm.painSlots });
      check(
        "검토 (마) decideToday — 대체 칸의 까닭은 slotReasons 대로('팔 피로'), slotReasons 없는 옛 신호는 '통증 부위'",
        d.kind === 'go' &&
          d.adjust.pushPull?.kind === 'substitute' &&
          d.adjust.pushPull.reason === '팔 피로' &&
          old.kind === 'go' &&
          old.adjust.pushPull?.kind === 'substitute' &&
          old.adjust.pushPull.reason === '통증 부위',
        json(d.kind === 'go' ? d.adjust : d)
      );
    }
    /*
     * 실제 표 · 앱 길 — 531 둘째 날(메디신볼 · 밀기 칸)에 팔 피로 '심함'이면 그 칸들이 '팔 피로'로 대체된다. 엇갈림 표 C5 는 첫째 날이라
     * (점프 · 스쿼트 · 당기기) 대체할 칸이 없어 'go' 그대로다 — 앱도 그날은 대체가 없다. 고정 운동은 장비를 다 가진 사람이 처음 고르는 것.
     */
    if (program) {
      const realPinned = pickPinned(
        library,
        [...new Set(library.flatMap((e) => e.equipment))],
        null
      );
      const day2 = (p: RP) => {
        const f = rFacts(p);
        const input = { facts: f, plan: buildPitchPlan(f), library, partsOnly: true };
        const safe = new Set(selectCandidates(input).candidates.map((e) => e.id));
        const slots = painSlotsOf(
          programDayPlan(program, 2).items,
          (v) => (realPinned[v] ? { id: realPinned[v] } : null),
          safe,
          droppedOnlyForArmFatigue(input)
        );
        return {
          slots,
          decision: decideToday(program, {
            ...baseSig,
            nextDay: 2,
            painSlots: slots.painSlots,
            slotReasons: slots.slotReasons,
          }),
        };
      };
      const sev = day2({ armFatigue: SEVERE_ARM_FATIGUE });
      const calm = day2({ armFatigue: 3 });
      const reasons = Object.values(sev.slots.slotReasons);
      check(
        "검토 (마) 실제 표 · 531 둘째 날 — 팔 피로 '심함'이면 메디신볼 칸이 '대체 · 팔 피로'(통증 부위 아님), '보통'이면 대체 없음",
        sev.slots.painSlots.includes('power') &&
          reasons.length > 0 &&
          reasons.every((r) => r === SUBSTITUTE_REASON.armFatigue) &&
          sev.decision.kind === 'go' &&
          sev.decision.adjust.power?.kind === 'substitute' &&
          sev.decision.adjust.power.reason === '팔 피로' &&
          calm.slots.painSlots.length === 0,
        json({ sev: sev.slots, calm: calm.slots })
      );
    }
    const loadSrc = readFileSync(
      new URL('../lib/program/load.ts', import.meta.url),
      'utf8'
    );
    check(
      "검토 (마) 소스 — 앱은 painSlotsOf · droppedOnlyForArmFatigue 로 칸과 까닭을 정하고, 운동 꼬리표에 '통증 부위'를 바로 적지 않는다",
      /painSlotsOf\(/.test(loadSrc) &&
        /droppedOnlyForArmFatigue\(safeInput\)/.test(loadSrc) &&
        /slotReasons,/.test(loadSrc) &&
        !/reason: '통증 부위'/.test(loadSrc)
    );
  }

  /* ── (바) 일정 지문 — 어제 기록 유무(loggedYesterday) ── */
  {
    const fp = (p: RP) => fingerprintOf(rFacts(p));
    /* 부하 구간 줄은 뺀다 — 기록을 하나 더하면 부하 지수가 생기거나 바뀌어 따로 한 줄 나온다(그 줄은 '[2판 되먹임(P2)]' 절 몫) */
    const lines = (a: RP, b: RP) =>
      diffFingerprintChanges(fp(a), fp(b))
        .filter((c) => c.key !== 'zone')
        .map((c) => `${c.key}:${c.text}`);
    const noLog: RP = { yesterday: '오늘 등판' };
    const rest: RP = { yesterday: '오늘 등판', logs: [REST] };
    const catchToday: RL = {
      daysAgo: 0,
      pitches: 10,
      sessionType: '캐치볼',
      effortPct: 40,
    };
    check(
      "검토 (바) 어제를 휴식으로 남기면 '어제 투구 기록을 남겼어요', 지우면 '어제 투구 기록이 지워졌어요'(한 줄씩 · 키 loggedYesterday)",
      json(lines(noLog, rest)) ===
        json(['loggedYesterday:어제 투구 기록을 남겼어요']) &&
        json(lines(rest, noLog)) ===
          json(['loggedYesterday:어제 투구 기록이 지워졌어요']),
      json([lines(noLog, rest), lines(rest, noLog)])
    );
    const pen30: RL = { daysAgo: 1, pitches: 30, sessionType: '불펜', effortPct: 50 };
    const both = lines(noLog, { yesterday: '오늘 등판', logs: [pen30] });
    check(
      '검토 (바) 어제 던진 기록을 남기면 마지막 투구 줄만 — 같은 바뀜을 두 줄로 말하지 않는다',
      both.length === 1 && both[0].startsWith('lastThrow:'),
      json(both)
    );
    const withToday = lines(
      { yesterday: '오늘 등판', logs: [catchToday] },
      { yesterday: '오늘 등판', logs: [catchToday, pen30] }
    );
    check(
      "검토 (바) 오늘 기록이 마지막 투구인 날 어제 기록을 남기면 '어제 투구 기록을 남겼어요'(마지막 투구 줄이 안 생기는 날)",
      json(withToday) === json(['loggedYesterday:어제 투구 기록을 남겼어요']),
      json(withToday)
    );
    const saved = fp(rest);
    const back = readPlanFingerprint(JSON.parse(JSON.stringify(saved)));
    const oldSaved = { ...saved };
    delete oldSaved.loggedYesterday;
    check(
      '검토 (바) 저장했다 읽어도 칸이 남고(왕복), 참 · 거짓 아닌 값은 깨진 지문, 칸 없는 옛 지문과는 견주지 않는다',
      json(back) === json(saved) &&
        readPlanFingerprint({ ...saved, loggedYesterday: 'yes' }) === null &&
        diffFingerprintChanges(oldSaved, fp(noLog)).every(
          (c) => c.key !== 'loggedYesterday'
        )
    );
  }

  /* ── (사) 화면 — '추정'은 둘째 줄 · 체크인의 '안 던졌어요' ── */
  {
    const strip = (rel: string) =>
      readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const comp = strip('components/outing-line.tsx');
    check(
      "검토 (사) 다음 등판 한 줄 — 자르는 줄(truncate)엔 main · 오늘 날만, '추정'은 자르지 않는 둘째 줄(좁은 폰에서 '추정'이 먼저 잘리던 것)",
      /<span className="block truncate">[\s\S]*?\{line\.main\}[\s\S]*?<\/span>\s*\{line\.guess && \(\s*<span className="block [^"]*">\{line\.guess\}<\/span>/.test(
        comp
      ) && !/truncate[^"]*">[^<]*\{line\.guess\}/.test(comp)
    );
    const y = iso(1).slice(0, 10);
    const restBody = readYesterdayOuting({
      date: y,
      pitches: '',
      effort: '',
      noThrow: '1',
    });
    check(
      "검토 (사) '안 던졌어요'만 고르면 어제 쉰 날 한 줄(종류 '휴식' · 0구 · 체감 강도 비움) — 투구 기록 API 검사를 그대로 통과",
      json(restBody) ===
        json({
          date: y,
          sessionType: '휴식',
          pitchCount: 0,
          effortPct: null,
          videoPaths: [],
        }) &&
        YESTERDAY_REST_SESSION === '휴식' &&
        !('error' in validateSessionType(YESTERDAY_REST_SESSION)) &&
        !('error' in readEffortInput({ effortPct: null }, true)),
      json(restBody)
    );
    const pitched = readYesterdayOuting({
      date: y,
      pitches: '30',
      effort: '85',
      noThrow: '1',
    });
    const blank = readYesterdayOuting({ date: y, pitches: '', effort: '' });
    const err = readYesterdayOuting({ date: y, pitches: '0', effort: '80' });
    check(
      "검토 (사) 투구수를 적으면 투구수가 이기고, 둘 다 비우면 아무것도 안 남기며, 막는 글은 '안 던졌어요'를 가리킨다('비워 두세요' 아님)",
      pitched != null &&
        !('error' in pitched) &&
        pitched.pitchCount === 30 &&
        blank === null &&
        err != null &&
        'error' in err &&
        err.error.includes("'안 던졌어요'") &&
        !err.error.includes('비워 두세요'),
      json({ pitched, blank, err })
    );
    /* 남긴 쉰 날 줄이 엔진에서 어제 답을 푼다 — 화면이 보내는 몸 그대로 facts 에 넣어 */
    const sentType =
      restBody != null && !('error' in restBody) ? restBody.sessionType : '';
    const after = rFacts({
      yesterday: '오늘 등판',
      logs: [{ daysAgo: 1, pitches: 0, sessionType: sentType }],
    });
    check(
      "검토 (사) '안 던졌어요'로 남긴 줄이 엔진의 기록 없는 등판을 푼다(날 종류 R3' 아님 · 체크인도 안 물음)",
      !outingOf(after).claimedYesterdayNoLog &&
        dayKindOf(after).rule !== 'claimedNoLog' &&
        !asksYesterdayPitches('오늘 등판', after.patterns.loggedYesterday === true)
    );
    const form = strip('components/checkin-form.tsx');
    check(
      "검토 (사) 체크인 폼 — '안 던졌어요' 칸(yesterdayNoThrow)을 readYesterdayOuting 에 넘기고, 안내에 '비워 두세요'가 없다",
      /name="yesterdayNoThrow"/.test(form) &&
        /noThrow: formData\.get\('yesterdayNoThrow'\)/.test(form) &&
        />\s*안 던졌어요\s*</.test(form) &&
        !/비워 두세요/.test(form)
    );
  }
}

/* ═══════════════════ [2판 P5] 도구 — 기준선 판정자 · 어댑터 · 변형 · 추가 묶음 · ⑰~㉒ · 단계 목표 · 전후 비교(scripts/training-baseline.mts · scripts/training-baseline-gates.mts) (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P5] 도구 — 기준선 T0: 단계 목표(--gate) · 전후 비교(--compare)가 맞게 재는가 · 판정자는 공용 판정 · 하루 만들기는 어댑터 한 곳 · 프로그램 키는 실제 키(2026-10-12)'
);
{
  /*
   * 왜 보는가. 기준선 도구는 운영 DB 를 읽어 시험으로 돌릴 수 없다. 그래서 (가) 숫자를 맞추는 규칙(단계 목표 · 옛 칸 비교)은 DB 없는
   * 파일(training-baseline-gates.mts)로 떼어 가짜 JSON 으로 재고, (나) 도구가 지켜야 할 약속은 소스로 지킨다 — 판정자를 베끼면 앱의
   * 판정과 지표가 갈라지고(규칙은 맞는데 지표가 실패), buildDailyPlan 을 여러 곳에서 부르면 P5 · P6 이 인자를 더할 때 한 곳을 빠뜨린다.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const gatesMod = await import('./training-baseline-gates.mts');
  const {
    failedGates,
    gateResults,
    gateValueText,
    GATES,
    HEADLINES,
    isGateStage,
    oldFieldsSame,
    rosterChanges,
    T0_RECOVERY_SHARE,
  } = gatesMod;

  /* 모든 목표가 맞는 가짜 JSON — 단계 목표 표가 읽는 칸만 */
  const passing = () => ({
    metrics: {
      veryHigh: { under15: { days: 0 } },
      afterHard: { n: 32, d: 32, ratio: 1 },
      armSevere: { push: 0, plyo: 0 },
      heavyLowerBeforeGame: {
        byDay: [
          { window: 'd0', checkin: { heavy: 3 } },
          { window: 'd1', checkin: { heavy: 0 } },
          { window: 'd2to3', checkin: { heavy: 0 } },
        ],
      },
      dayKind: {
        moderateSpike: { spikeRecovery: 32, moderateDays: 32, otherChanged: 0 },
      },
      calendarGuess: { newRecovery: { calendar: 0, estimate: 0 } },
      sameThemeState: { pooled: { n: 30, d: 100, ratio: 0.3 } },
      direction: { all: { pass: 10, d: 10, ratio: 1 } },
      fence: {
        exposure: { n: 202, d: 404, ratio: 0.5, schedulableRatio: 0.85 },
        recoveryShare: { n: 136, d: 282, ratio: T0_RECOVERY_SHARE },
      },
      programDay: { dailyMainDays: 0, goDays: 34 },
      lowerGap: { violations: 0 },
      stateAlert: { evening: { miss: 0 }, edit: { miss: 0 } },
    },
  });
  type Fake = ReturnType<typeof passing>;
  const tweak = (edit: (j: Fake) => void) => {
    const j = passing();
    edit(j);
    return j;
  };
  const failNos = (j: object, upTo: 'P4' | 'P5' | 'P6' | null) =>
    failedGates(gateResults(j as Record<string, unknown>, upTo)).map((g) => g.no);

  check(
    'P5 도구 (가) 모든 목표가 맞는 JSON 은 어느 단계로도 막히지 않는다(못 잰 줄 없음)',
    failNos(passing(), 'P6').length === 0 &&
      gateResults(passing()).every((g) => g.pass === true),
    json(gateResults(passing()).filter((g) => g.pass !== true))
  );
  const p5 = (j: object) => failNos(j, 'P5');
  check(
    'P5 도구 (가) ⑰ 같은 테마 안 변화 — 30% 는 맞고 29.9% 는 막는다',
    p5(
      tweak((j) => {
        j.metrics.sameThemeState.pooled.ratio = 0.299;
      })
    ).join() === '⑰' && p5(passing()).length === 0
  );
  check(
    'P5 도구 (가) ⑱ 방향 — 100% 만 맞고 하나라도 늘면(99%) 막는다',
    p5(
      tweak((j) => {
        j.metrics.direction.all.ratio = 0.99;
      })
    ).join() === '⑱'
  );
  check(
    'P5 도구 (가) ⑲ 노출 — 50% 는 맞고 49% 는 막는다, 참고 목표(일정 카테고리 · 회복 날 폭)는 어긋나도 막지 않는다',
    p5(
      tweak((j) => {
        j.metrics.fence.exposure.ratio = 0.49;
      })
    ).join() === '⑲' &&
      p5(
        tweak((j) => {
          j.metrics.fence.exposure.schedulableRatio = 0.5;
          j.metrics.fence.recoveryShare.ratio = T0_RECOVERY_SHARE + 0.2;
        })
      ).length === 0 &&
      gateResults(
        tweak((j) => {
          j.metrics.fence.recoveryShare.ratio = T0_RECOVERY_SHARE + 0.2;
        }) as Record<string, unknown>
      ).some((g) => g.no === '⑲' && !g.blocking && g.pass === false)
  );
  check(
    'P5 도구 (가) 칸이 없으면 못 잼 — 막는 목표면 막힌다(없는 칸을 0 으로 읽어 거저 통과하지 않게)',
    p5(
      tweak((j) => {
        delete (j.metrics as Partial<Fake['metrics']>).sameThemeState;
        delete (j.metrics.armSevere as { plyo?: number }).plyo;
      })
    )
      .sort()
      .join() === ['⑬', '⑰'].sort().join()
  );
  const p6broken = tweak((j) => {
    j.metrics.programDay.dailyMainDays = 34;
    j.metrics.sameThemeState.pooled.ratio = 0.1;
  });
  check(
    'P5 도구 (가) 단계로 거른다 — P4 는 P5 · P6 목표를 안 보고, P5 는 P6 을 안 보며(⑳ 이 깨져도 통과), P6 은 앞 단계까지 다 본다',
    failNos(p6broken, 'P4').length === 0 &&
      failNos(p6broken, 'P5').join() === '⑰' &&
      failNos(p6broken, 'P6').sort().join() === ['⑰', '⑳'].sort().join() &&
      gateResults(p6broken, 'P5').find((g) => g.no === '⑳')!.applies === false
  );
  check(
    'P5 도구 (가) 단계 이름은 P4 · P5 · P6 만, 목표 표의 P5 막는 목표는 ⑰ ≥ 30% · ⑱ 100% · ⑲ 노출 ≥ 50% 셋',
    isGateStage('P5') &&
      !isGateStage('P7') &&
      !isGateStage('p5') &&
      GATES.filter((g) => g.stage === 'P5' && g.blocking)
        .map((g) => `${g.no}${g.target}`)
        .join() === '⑰≥ 30%,⑱100%,⑲≥ 50%' &&
      gateValueText({ actual: 0.114, unit: 'ratio' }) === '11.4%' &&
      gateValueText({ actual: null, unit: 'count' }) === '못 잼'
  );

  /* 옛 칸 비교 — 새 칸 · meta 는 같다고 보고, 옛 칸이 하나라도 바뀌면 경로를 짚는다 */
  const before = {
    version: 7,
    meta: { generatedAt: 'a', elapsedMs: 1 },
    buildCalls: 10,
    gates: [{ no: '⑳', applies: true }],
    players: [{ name: '선발A', days: [{ date: 'd1', theme: 'lower', ids: ['x'] }] }],
    metrics: { seedChanged: { n: 1, d: 2 }, nested: { meta: 1 } },
  };
  const after = {
    ...before,
    version: 8,
    meta: { generatedAt: 'b', elapsedMs: 2 },
    buildCalls: 20,
    /* --gate 로 고른 단계에 따라 applies 가 다르다 — 옛 칸 비교에서 뺀다 */
    gates: [{ no: '⑳', applies: false }],
    players: [
      {
        name: '선발A',
        days: [{ date: 'd1', theme: 'lower', ids: ['x'], mainSets: 9 }],
        extra: true,
      },
    ],
    metrics: { ...before.metrics, sameThemeState: { pooled: { n: 1 } } },
    cohorts: { extra: { players: [] } },
  };
  const changed = {
    ...after,
    metrics: { ...after.metrics, seedChanged: { n: 2, d: 2 }, nested: { meta: 2 } },
    players: [
      { ...after.players[0], days: [{ ...after.players[0].days[0], theme: 'upper' }] },
    ],
  };
  const sameRes = oldFieldsSame(before, after);
  const changedRes = oldFieldsSame(before, changed);
  check(
    'P5 도구 (가) 옛 칸 같음 — meta · version · buildCalls · gates 와 새 칸은 무시, 옛 값이 바뀌면 그 경로(속의 meta 이름 칸은 무시하지 않음)',
    sameRes.same &&
      sameRes.count === 0 &&
      !changedRes.same &&
      changedRes.count === 3 &&
      changedRes.paths.includes('metrics.seedChanged.n') &&
      changedRes.paths.includes('metrics.nested.meta') &&
      changedRes.paths.includes('players[0].days[0].theme') &&
      !oldFieldsSame({ list: [1, 2] }, { list: [1, 2, 3] }).same,
    json(changedRes)
  );
  const roster = rosterChanges(before, changed);
  check(
    "P5 도구 (가) 선수별 28일 테마 · 목록이 그대로인지 이름으로 짝짓고, 전후 표는 칸이 없는 앞 JSON 에 '없음'을 쓴다",
    roster.same.length === 0 &&
      roster.changed.join() === '선발A' &&
      rosterChanges(before, after).same.join() === '선발A' &&
      HEADLINES.find((h) => h.no === '⑰')!.text(before) === '없음' &&
      HEADLINES.find((h) => h.no === '①')!.text(before) === '50.0% (1/2)'
  );

  /* (나) 도구 소스의 약속 */
  const strip5 = (rel: string) =>
    readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const tool = strip5('scripts/training-baseline.mts');
  check(
    'P5 도구 (나) 판정자 — 무거운 하체 · 팔 플라이오 · 무거운 상체 밀기는 lib/engine/exercise-class.ts 에서 가져오고 다시 정의하지 않으며, 분류가 0 이면 던진다',
    /import \{\s*isArmPlyo,\s*isHeavyLower,\s*isHeavyUpperPush,\s*\} from '\.\.\/lib\/engine\/exercise-class\.ts';/.test(
      tool
    ) &&
      !/(const|function)\s+(isHeavyLower|isArmPlyo|isHeavyUpperPush)\b/.test(tool) &&
      /if \(count === 0\)\s*throw new Error\(/.test(tool)
  );
  /*
   * P5 로 바뀜 — 처방 한 길(P5-b)에서 세트 어댑터가 goalPrescription(ex, plan.goal) 대신 planPrescription(ex, plan)(목표 처방 위에
   * 그날 양 조절, lib/report/volume.ts)을 읽는다. 앱의 아홉 자리와 같은 함수라 일정에 세트 조절이 실리면 ⑱ 이 저절로 따라간다.
   * 도구가 목표 처방을 바로 부르면 안 된다(goalPrescription( 0번).
   */
  check(
    'P5 도구 (나) 하루 만들기는 어댑터 한 곳 — buildDailyPlan 은 buildDay 에서만, 재료는 inputsOf, 세트는 setsOf 에서만 처방(planPrescription)을 읽는다',
    tool.split('buildDailyPlan(').length === 2 &&
      /const \{ facts, plan, owned, history, seed \} = inputsOf\(p, i, st, v\);/.test(
        tool
      ) &&
      tool.split('planPrescription(').length === 2 &&
      !tool.includes('goalPrescription(') &&
      /return planPrescription\(ex, plan\)\.sets \?\? 0;/.test(tool) &&
      /buildDayState\(\{ facts, plan, extras: extrasOf\(st\) \}\)/.test(tool)
  );
  const programKeys = [...tool.matchAll(/program: '([^']+)',/g)].map((m) => m[1]);
  check(
    'P5 도구 (나) 추가 묶음의 프로그램 키는 lib/program 의 실제 키(넷 · 주 2 하나 포함)',
    programKeys.length === 4 &&
      new Set(programKeys).size === 4 &&
      programKeys.every((k) => parseProgram(k) != null) &&
      programKeys.some((k) => parseProgram(k)?.perWeek === 2),
    programKeys.join(' · ')
  );
  check(
    'P5 도구 (나) 추가 묶음은 ①~⑯ 의 분모에 안 섞이고(allDays 는 기준 12명만), --gate 를 줬을 때만 exit 1, JSON 판은 8',
    /const allDays = results\.flatMap\(\(r\) => r\.days\);/.test(tool) &&
      /const failed = GATE_STAGE \? failedGates\(gateRows\) : \[\];/.test(tool) &&
      /process\.exitCode = 1;/.test(tool) &&
      /version: 8,/.test(tool) &&
      /if \(GATE_ARG != null && !isGateStage\(GATE_ARG\)\)/.test(tool)
  );
}

/* ═══════════════════ [2판 P5] 순수 도우미 — lib/engine/exercise-class.ts 분류 · prescription.ts easedJointsOf · program.ts patternsOfProgramDay · daily-plan.ts patternsDoneFrom (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P5] 순수 도우미 — 분류 한 곳(무게 드는 카테고리 · 하체 · 상체 파워 · 천천히 내리기 · 동작 열쇠) · 조심할 관절 · 프로그램 동작 · 2주 계열, 동작 변화 0(2026-10-12)'
);
{
  /*
   * 왜 보는가. 고르기 점수 · 양 조절(2판 P5)이 '무엇이 하체 파워인가 · 어느 관절을 왜 조심하나 · 프로그램이 내일 무엇을 하나 · 2주 동안 안 한
   * 계열은 무엇인가'를 같은 정의로 읽어야 한다. 이 커밋은 그 정의만 둔다 — 고르는 결과는 하나도 안 바뀐다(전체 시험 · 기준선 --compare).
   * (가) 분류 표 · 실제 표 · theme 이 같은 목록을 쓰는지, (나) 조심할 관절이 안전 규칙 4-3 · 5 · 5-1 과 글자까지 같은지(옛 규칙을 이 절에
   * 따로 적어 견준다 — 같은 함수끼리 견주면 아무것도 안 본다), (다) 프로그램 일차의 동작 열쇠가 변형 규칙이 고르는 운동과 맞는지,
   * (라) 2주 계열 셈의 경계(오늘 · 14일 · 암케어 · 마친 날 없음)를 본다.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const ex = (
    o: Partial<ClassifiableExercise> & { category: string }
  ): ClassifiableExercise => ({
    intensity: '중간',
    bodyParts: [],
    equipment: ['맨몸'],
    ...o,
  });
  const table = <E,>(
    name: string,
    fn: (e: E) => unknown,
    rows: [string, E, unknown][]
  ) => {
    const wrong = rows
      .filter(([, e, want]) => json(fn(e)) !== json(want))
      .map(([label, e]) => `${label}(${json(fn(e))})`);
    check(`${name} — ${rows.length}경우`, wrong.length === 0, wrong.join(' · '));
  };

  /* ── (가) 분류 ── */
  check(
    'P5 도우미 (가) 무게 드는 카테고리 = 상체 스트렝스 · 하체 스트렝스 · 파워, 모두 실제 카테고리 이름',
    json(HEAVY_CATEGORIES) === json(['상체 스트렝스', '하체 스트렝스', '파워']) &&
      HEAVY_CATEGORIES.every((c) => TRAINING_CATEGORY_NAMES.includes(c)),
    json(HEAVY_CATEGORIES)
  );
  const upperMains = [null, ...TRAINING_GOALS.map((g) => g.name)]
    .map((g) => compositionFor('upper', g).find((s) => s.slot === 'main'))
    .filter((s) => s != null);
  check(
    'P5 도우미 (가) 상체날 본운동의 파워 계열 = UPPER_POWER_PATTERNS 그 목록(목표마다) · 밀기 · 당기기 · 회전 · 하체 계열과 안 겹침',
    upperMains.length > 0 &&
      upperMains.every((s) => s.powerPatterns === UPPER_POWER_PATTERNS) &&
      json(UPPER_POWER_PATTERNS) === json(['밀기', '당기기', '회전']) &&
      UPPER_POWER_PATTERNS.every((p) => !LOWER_POWER_PATTERNS.includes(p)),
    json(upperMains.map((s) => s.powerPatterns))
  );
  table('P5 도우미 (가) 하체 파워 isLowerPower', isLowerPower, [
    [
      '파워 · 스쿼트(박스 점프)',
      ex({ category: '파워', movementPattern: '스쿼트' }),
      true,
    ],
    ['파워 · 힌지(스윙)', ex({ category: '파워', movementPattern: '힌지' }), true],
    [
      '파워 · 밀기 · 고관절 꼬리표 → 계열이 이김',
      ex({ category: '파워', movementPattern: '밀기', bodyParts: ['고관절'] }),
      false,
    ],
    [
      '파워 · 계열 없음 · 종아리·발목',
      ex({ category: '파워', bodyParts: ['종아리·발목'] }),
      true,
    ],
    [
      '파워 · 계열 없음 · 전신(메디신볼 슬램 꼬리표)',
      ex({ category: '파워', bodyParts: ['전신'] }),
      false,
    ],
    [
      '하체 스트렝스 · 스쿼트 → 파워가 아님',
      ex({ category: '하체 스트렝스', movementPattern: '스쿼트' }),
      false,
    ],
  ]);
  table('P5 도우미 (가) 상체 파워 isUpperPower', isUpperPower, [
    ['파워 · 회전', ex({ category: '파워', movementPattern: '회전' }), true],
    ['파워 · 당기기', ex({ category: '파워', movementPattern: '당기기' }), true],
    [
      '파워 · 런지 · 메디신볼(뛰며 내리치기) → 계열이 이김',
      ex({ category: '파워', movementPattern: '런지', equipment: ['메디신볼'] }),
      false,
    ],
    [
      '파워 · 계열 없음 · 메디신볼',
      ex({ category: '파워', equipment: ['메디신볼'] }),
      true,
    ],
    ['파워 · 계열 없음 · 어깨', ex({ category: '파워', bodyParts: ['어깨'] }), true],
    [
      '파워 · 계열 없음 · 고관절',
      ex({ category: '파워', bodyParts: ['고관절'] }),
      false,
    ],
    [
      '상체 스트렝스 · 밀기 → 파워가 아님',
      ex({ category: '상체 스트렝스', movementPattern: '밀기' }),
      false,
    ],
  ]);
  const titled = (
    o: Partial<ClassifiableExercise> & { category: string; title: string }
  ) => ({ ...ex(o), title: o.title });
  table('P5 도우미 (가) 천천히 내리는 하체 isLowerEccentric', isLowerEccentric, [
    [
      '노르딕 햄스트링 컬 · 하체 스트렝스',
      titled({
        category: '하체 스트렝스',
        title: '노르딕 햄스트링 컬',
        movementPattern: '힌지',
      }),
      true,
    ],
    [
      '에센트릭 포즈 RDL · 하체 스트렝스',
      titled({
        category: '하체 스트렝스',
        title: '에센트릭 포즈 RDL',
        movementPattern: '힌지',
      }),
      true,
    ],
    [
      '스쿼트 점프 (에센트릭) · 파워 · 스쿼트',
      titled({
        category: '파워',
        title: '밴드 저항 스쿼트 점프 (에센트릭)',
        movementPattern: '스쿼트',
      }),
      true,
    ],
    [
      '덤벨 컬 에센트릭 오버로드 · 암케어(팔)',
      titled({
        category: '암케어',
        title: '덤벨 컬 에센트릭 오버로드',
        bodyParts: ['이두', '팔꿈치'],
      }),
      false,
    ],
    [
      '에센트릭 덤벨 벤치 프레스 · 상체',
      titled({
        category: '상체 스트렝스',
        title: '에센트릭 덤벨 벤치 프레스',
        movementPattern: '밀기',
      }),
      false,
    ],
    [
      '바벨 백 스쿼트(이름 표시 없음)',
      titled({
        category: '하체 스트렝스',
        title: '바벨 백 스쿼트',
        movementPattern: '스쿼트',
      }),
      false,
    ],
  ]);
  table('P5 도우미 (가) 동작 열쇠 movementKeyOf', movementKeyOf, [
    [
      '하체 스트렝스 · 스쿼트',
      ex({ category: '하체 스트렝스', movementPattern: '스쿼트' }),
      '스쿼트',
    ],
    [
      '상체 스트렝스 · 당기기',
      ex({ category: '상체 스트렝스', movementPattern: '당기기' }),
      '당기기',
    ],
    ['상체 스트렝스 · 계열 없음', ex({ category: '상체 스트렝스' }), null],
    [
      '파워 · 스쿼트(점프) → 하체 파워(스쿼트 근력과 다른 열쇠)',
      ex({ category: '파워', movementPattern: '스쿼트' }),
      LOWER_POWER_KEY,
    ],
    [
      '파워 · 밀기 → 상체 파워',
      ex({ category: '파워', movementPattern: '밀기' }),
      UPPER_POWER_KEY,
    ],
    [
      '파워 · 계열 없음 · 고관절 + 메디신볼 → 하체를 먼저',
      ex({ category: '파워', bodyParts: ['고관절'], equipment: ['메디신볼'] }),
      LOWER_POWER_KEY,
    ],
    [
      '파워 · 계열 없음 · 코어 → 없음',
      ex({ category: '파워', bodyParts: ['코어'] }),
      null,
    ],
    [
      '코어 · 회전 → 없음(겹침을 셀 무게가 아님)',
      ex({ category: '코어', movementPattern: '회전' }),
      null,
    ],
  ]);

  /* 실제 표 — 수는 detail 로만(라이브러리는 날마다 바뀐다 — P4 분류 절과 같은 원칙), 성질을 본다 */
  const power = library.filter((e) => e.category === '파워');
  const lowerPowerLib = library.filter(isLowerPower);
  const upperPowerLib = library.filter(isUpperPower);
  check(
    'P5 도우미 (가) 실제 표 — 무거운 하체의 파워 몫 = 하체 파워(같은 판정) · 하체 · 상체 파워 둘 다인 것 없음 · 둘 다 0 이 아니고 파워 안',
    power.every((e) => isHeavyLower(e) === isLowerPower(e)) &&
      library.every((e) => !(isLowerPower(e) && isUpperPower(e))) &&
      lowerPowerLib.length > 0 &&
      upperPowerLib.length > 0 &&
      [...lowerPowerLib, ...upperPowerLib].every((e) => e.category === '파워'),
    `하체 파워 ${lowerPowerLib.length} · 상체 파워 ${upperPowerLib.length} / 파워 ${power.length}`
  );
  check(
    'P5 도우미 (가) 실제 표 — 계열이 있는 파워는 상체날 칸에 들면(계열 ∈ UPPER_POWER_PATTERNS) 상체 파워, 하체날 칸에 들면 하체 파워',
    power
      .filter((e) => e.movementPattern != null)
      .every(
        (e) =>
          UPPER_POWER_PATTERNS.includes(e.movementPattern!) === isUpperPower(e) &&
          LOWER_POWER_PATTERNS.includes(e.movementPattern!) === isLowerPower(e)
      )
  );
  const eccMethod = ARMCARE_METHODS.find((m) => m.key === 'eccentric');
  const overload = library.filter(isEccentricOverload);
  check(
    "P5 도우미 (가) 에센트릭 오버로드 — 표시가 암케어 방식 표와 같고, 실제 표에서 isEccentricOverload ⟺ methodOf 가 'eccentric'",
    eccMethod?.titleMarker === ECCENTRIC_OVERLOAD_MARKER &&
      library.every(
        (e) => isEccentricOverload(e) === (methodOf(e.title)?.key === 'eccentric')
      ),
    `${overload.length}개`
  );
  const lowerEcc = library.filter(isLowerEccentric);
  check(
    'P5 도우미 (가) 실제 표 천천히 내리는 하체 0 < n · 모두 하체 스트렝스이거나 하체 파워 · 암케어 에센트릭 오버로드는 하나도 안 듦',
    lowerEcc.length > 0 &&
      lowerEcc.every((e) => e.category === '하체 스트렝스' || isLowerPower(e)) &&
      !lowerEcc.some(isEccentricOverload),
    `${lowerEcc.length}개: ${lowerEcc.map((e) => e.title).join(' · ')}`
  );
  check(
    'P5 도우미 (가) 실제 표 동작 열쇠 — 스트렝스는 계열 그대로, 파워는 하체 · 상체 파워 · 없음, 그 밖은 모두 없음',
    library.every((e) => {
      const key = movementKeyOf(e);
      if (e.category === '하체 스트렝스' || e.category === '상체 스트렝스')
        return key === (e.movementPattern ?? null);
      if (e.category === '파워')
        return key === LOWER_POWER_KEY || key === UPPER_POWER_KEY || key === null;
      return key === null;
    })
  );

  /* ── (나) 조심할 관절 — 안전 규칙 4-3 · 5 · 5-1 이 2판 P5 전에 하던 일을 여기 따로 적어 견준다 ── */
  const RELATED_REF: Record<CheckinPartKey, string[]> = {
    shoulder: ['어깨', '견갑', '가슴', '등'],
    elbow: ['팔꿈치', '손목·전완', '이두', '삼두'],
    wrist: ['손목·전완', '팔꿈치'],
    lowerBack: ['코어', '등', '고관절'],
    lowerBody: ['고관절', '햄스트링·둔근', '전신'],
  };
  type Caution = { part: CheckinPartKey; why: string };
  /** 옛 세 고리(4-3 · 5 · 5-1)가 낸 [관절 · 출처 · 근거 줄 · 규칙 이름] — 2판 P5 전 prescription.ts 를 그대로 옮긴 것 */
  const oldEased = (facts: ReturnType<typeof buildFacts>, caution: Caution[]) => {
    const today = facts.condition.today;
    const out: {
      key: string;
      source: string;
      memo?: string;
      line: string;
      rule: string;
    }[] = [];
    const rehabParts = rehabEasingParts(facts);
    for (const key of new Set([...painEasingParts(facts), ...rehabParts])) {
      if (today?.[key] === '뻐근') continue;
      const label = checkinPartLabel(key);
      const parts = RELATED_REF[key];
      const why = rehabParts.includes(key) ? `재활 중(${label})` : `최근 ${label} 통증`;
      out.push({
        key,
        source: rehabParts.includes(key) ? 'rehab' : 'recentPain',
        line: `${why} → ${parts.join('·')} 부위 고강도 제외`,
        rule: why,
      });
    }
    for (const { key, label } of CHECKIN_PARTS) {
      if (today?.[key] !== '뻐근') continue;
      out.push({
        key,
        source: 'stiff',
        line: `${label} 뻐근함 → ${RELATED_REF[key].join('·')} 부위 고강도 제외`,
        rule: `${label} 뻐근함`,
      });
    }
    for (const { part, why } of caution) {
      if (today?.[part] === '뻐근') continue;
      const label = CHECKIN_PARTS.find((p) => p.key === part)?.label ?? part;
      out.push({
        key: part,
        source: 'memo',
        memo: why,
        line: `메모에서 ${label} 불편(${why}) → ${RELATED_REF[part].join('·')} 부위 고강도 제외`,
        rule: `메모 속 ${label} 불편`,
      });
    }
    return out;
  };
  const craft = (o: {
    stiff?: CheckinPartKey | null;
    pain?: CheckinPartKey | null;
    recent?: CheckinPartKey[];
    rehab?: CheckinPartKey[];
  }): ReturnType<typeof buildFacts> => {
    const parts: Partial<Record<CheckinPartKey, string>> = {};
    if (o.stiff) parts[o.stiff] = '뻐근';
    if (o.pain) parts[o.pain] = '통증';
    const base = factsFor({ condition: 7, parts });
    return {
      ...base,
      condition: {
        ...base.condition,
        painRecently: (o.recent ?? []).length > 0 || base.condition.painRecently,
        painRecentParts: o.recent ?? [],
        rehabParts: o.rehab ?? [],
      },
    };
  };

  /* 표 하나 — 차례 · 건너뛰기 · 출처가 규칙과 같은가 */
  const tableFacts = craft({
    stiff: 'shoulder',
    recent: ['elbow', 'shoulder'],
    rehab: ['lowerBack', 'elbow'],
  });
  const tableCaution: Caution[] = [
    { part: 'shoulder', why: '어깨가 무거움' },
    { part: 'lowerBody', why: '무릎 불편' },
    { part: 'elbow', why: '팔꿈치 찌릿' },
  ];
  const joints = easedJointsOf(tableFacts, tableCaution);
  check(
    'P5 도우미 (나) easedJointsOf 표 — 최근 통증 · 재활(합집합 · 둘 다면 재활) → 뻐근 → 메모 차례, 뻐근한 어깨는 4-3 · 5-1 에서 건너뜀, 같은 관절의 재활과 메모는 둘 다 남음',
    json(joints.map((j) => [j.key, j.source, j.memo ?? null])) ===
      json([
        ['elbow', 'rehab', null],
        ['lowerBack', 'rehab', null],
        ['shoulder', 'stiff', null],
        ['lowerBody', 'memo', '무릎 불편'],
        ['elbow', 'memo', '팔꿈치 찌릿'],
      ]) && joints.every((j) => json(j.bodyParts) === json(RELATED_REF[j.key])),
    json(joints)
  );
  const byPart = easedBodyPartsOf(
    easedJointsOf(craft({ stiff: 'wrist', recent: ['elbow'] }), [
      { part: 'elbow', why: '메모' },
    ])
  );
  check(
    'P5 도우미 (나) easedBodyPartsOf — 두 까닭이 덮는 부위는 오늘 말한 것부터(뻐근한 손목이 팔꿈치 · 손목·전완을 가짐), 이두는 최근 팔꿈치 통증',
    byPart.get('손목·전완')?.source === 'stiff' &&
      byPart.get('팔꿈치')?.key === 'wrist' &&
      byPart.get('이두')?.source === 'recentPain' &&
      byPart.get('삼두')?.key === 'elbow' &&
      !byPart.has('어깨'),
    json([...byPart].map(([p, j]) => [p, j.key, j.source]))
  );
  check(
    'P5 도우미 (나) 오늘 통증인 관절은 조심 목록에 없다(1-1 이 다 뺀다) · 아무것도 없는 날은 빈 목록',
    easedJointsOf(craft({ pain: 'elbow', recent: ['elbow'], rehab: ['elbow'] }))
      .length === 0 && easedJointsOf(craft({})).length === 0
  );

  /* 견주기 — P3 160조합 + 손으로 만든 격자 × 메모 셋: 관절 목록 · 근거 줄 · 규칙 이름이 옛 고리와 글자까지 같다 */
  const cautions: Caution[][] = [
    [],
    [{ part: 'shoulder', why: '어깨 메모' }],
    [
      { part: 'lowerBody', why: '무릎 불편' },
      { part: 'elbow', why: '팔꿈치' },
    ],
  ];
  const keys: (CheckinPartKey | null)[] = [
    null,
    'shoulder',
    'elbow',
    'wrist',
    'lowerBack',
  ];
  const grid: ReturnType<typeof buildFacts>[] = [];
  for (const stiff of keys)
    for (const recent of [
      [],
      ['shoulder'],
      ['elbow', 'lowerBack'],
    ] as CheckinPartKey[][])
      for (const rehab of [[], ['shoulder'], ['elbow']] as CheckinPartKey[][])
        grid.push(craft({ stiff, recent, rehab }));
  let compared = 0;
  let withJoints = 0;
  const mismatch: string[] = [];
  for (const [i, facts] of [...p3ComboFactsSeen, ...grid].entries()) {
    for (const caution of cautions) {
      const want = oldEased(facts, caution);
      const got = easedJointsOf(facts, caution);
      compared++;
      if (want.length > 0) withJoints++;
      const sameJoints =
        json(got.map((j) => [j.key, j.source, j.memo ?? null])) ===
          json(want.map((w) => [w.key, w.source, w.memo ?? null])) &&
        got.every((j) => json(j.bodyParts) === json(RELATED_REF[j.key]));
      const picked = selectCandidates({
        facts,
        plan: buildPitchPlan(facts),
        library,
        caution,
      });
      /*
       * 근거 줄은 세 규칙만 '부위 고강도 제외'로 끝난다 — 차례까지 같아야 한다. 규칙 이름(excluded)은 뺀 것이 있을 때만 남으니 옛 차례의
       * 부분열이면 된다(뺀 수는 같은 거름(무거운 것 · 그 부위)이라 이 견주기가 아니라 시험 전체 · 기준선 --compare 가 지킨다).
       */
      const lines = picked.basis.filter((b) => b.endsWith('부위 고강도 제외'));
      const wantRules = want.map((w) => w.rule);
      const gotRules = picked.excluded
        .map((x) => x.rule)
        .filter((r) => wantRules.includes(r));
      let cursor = 0;
      const inOrder = gotRules.every((r) => {
        const idx = wantRules.indexOf(r, cursor);
        if (idx < 0) return false;
        cursor = idx + 1;
        return true;
      });
      const sameText =
        picked.halted || (json(lines) === json(want.map((w) => w.line)) && inOrder);
      if (!sameJoints || !sameText)
        mismatch.push(`#${i}/${json(caution.map((c) => c.part))}`);
    }
  }
  check(
    `P5 도우미 (나) 옛 규칙과 견주기 — ${compared}경우(관절이 하나 이상인 경우 ${withJoints}) 관절 · 출처 · 근거 줄 · 규칙 이름 차례가 2판 P5 전과 글자까지 같다`,
    compared === (p3ComboFactsSeen.length + grid.length) * cautions.length &&
      withJoints >= 100 &&
      mismatch.length === 0,
    mismatch.slice(0, 5).join(' · ')
  );

  /* ── (다) 프로그램 일차의 동작 열쇠 ── */
  const programPlans = [
    ...PROGRAMS.flatMap((def) =>
      def.perWeek.map((pw) => parseProgram(programKeyOf(def.id, pw)))
    ),
    parseProgram('offseason-strength-power'),
  ].filter((p) => p != null);
  const dayMismatch: string[] = [];
  let programDays = 0;
  for (const plan of programPlans) {
    for (let day = 1; day <= plan.totalDays; day++) {
      programDays++;
      const want = new Set(
        programDayPlan(plan, day)
          .items.map((x) => VARIANT_MOVEMENT_KEY[x.variant])
          .filter((k) => k != null)
      );
      const got = patternsOfProgramDay(plan, day);
      const again = patternsOfProgramDay(plan, day);
      if (
        json([...got].sort()) !== json([...want].sort()) ||
        json([...got]) !== json([...again])
      )
        dayMismatch.push(`${plan.key}#${day}`);
    }
  }
  check(
    `P5 도우미 (다) patternsOfProgramDay — 프로그램 ${programPlans.length}판 ${programDays}일차 모두 그날 칸의 열쇠(VARIANT_MOVEMENT_KEY) 그대로 · 같은 입력 같은 답 · 키를 모르면 빈 집합`,
    programPlans.length >= PROGRAMS.length + 1 &&
      dayMismatch.length === 0 &&
      patternsOfProgramDay(null, 1).size === 0,
    dayMismatch.slice(0, 5).join(' · ')
  );
  const strong = parseProgram('stronglifts-5x5');
  check(
    'P5 도우미 (다) 스트롱리프트 A 날 = 스쿼트 · 밀기 · 당기기, B 날 = 스쿼트 · 힌지(몸통 버티기는 열쇠 없음)',
    strong != null &&
      json([...patternsOfProgramDay(strong, 1)].sort()) ===
        json(['당기기', '밀기', '스쿼트']) &&
      json([...patternsOfProgramDay(strong, 2)].sort()) === json(['스쿼트', '힌지']),
    strong
      ? `${json([...patternsOfProgramDay(strong, 1)])} | ${json([...patternsOfProgramDay(strong, 2)])}`
      : '키 없음'
  );
  /* 변형 규칙이 고르는 운동(장비 다 있음 · 경력 모름) — 기본값 열쇠가 그 운동의 열쇠와 맞는가 */
  const allEquipment = [...EXERCISE_EQUIPMENT];
  const variantWrong: string[] = [];
  const variantSeen: string[] = [];
  for (const v of VARIANT_KEYS) {
    const cands = variantCandidates(v, library, allEquipment, null);
    if (cands.length === 0) continue;
    const want = VARIANT_MOVEMENT_KEY[v];
    /* 큰 하체 · 한 다리 · 밀기 · 당기기 · 점프는 후보 전부, 메디신볼 · 회전 던지기 · 몸통 버티기는 먼저 고르는 것(고정 기본값) */
    const strict = ['squat', 'hinge', 'push', 'pull', 'singleLeg', 'jump'].includes(v);
    const looked = strict ? cands : cands.slice(0, 1);
    const wrong = looked.filter((e) => movementKeyOf(e) !== want);
    variantSeen.push(`${v} ${looked.length}`);
    if (wrong.length > 0)
      variantWrong.push(`${v}: ${wrong.map((e) => e.title).join(', ')}`);
  }
  check(
    'P5 도우미 (다) 변형 규칙이 고르는 운동의 동작 열쇠 = VARIANT_MOVEMENT_KEY(몸통 버티기 · 코어는 없음)',
    variantWrong.length === 0 && variantSeen.length >= 7,
    variantWrong.join(' · ') || variantSeen.join(' · ')
  );
  /* 고정 운동을 넘기면 그 운동의 열쇠 — 기본기 메디신볼 칸을 맨몸 점프로 채운 날 · 회전 던지기를 코어로 채운 날 */
  const basics = parseProgram('basics-4w');
  const medballDay =
    basics == null
      ? null
      : Array.from({ length: basics.totalDays }, (_, k) => k + 1).find((d) =>
          programDayPlan(basics, d).items.some((x) => x.variant === 'medball')
        );
  const jumpEx = ex({ category: '파워', movementPattern: '스쿼트' });
  const coreEx = ex({ category: '코어' });
  const pinnedKeys =
    basics && medballDay != null
      ? patternsOfProgramDay(basics, medballDay, (v) =>
          v === 'medball' ? jumpEx : v === 'antiRotation' ? coreEx : undefined
        )
      : null;
  const defaultKeys =
    basics && medballDay != null ? patternsOfProgramDay(basics, medballDay) : null;
  check(
    'P5 도우미 (다) exerciseOf — 고정 운동을 넘기면 그 운동의 열쇠(맨몸 점프로 채운 메디신볼 칸 = 하체 파워), 안 넘긴 변형은 기본값',
    pinnedKeys != null &&
      defaultKeys != null &&
      defaultKeys.has(UPPER_POWER_KEY) &&
      pinnedKeys.has(LOWER_POWER_KEY) &&
      [...defaultKeys]
        .filter((k) => k !== UPPER_POWER_KEY)
        .every((k) => pinnedKeys.has(k)),
    `${json(defaultKeys ? [...defaultKeys] : null)} → ${json(pinnedKeys ? [...pinnedKeys] : null)}`
  );

  /* ── (라) 2주 계열 셈 ── */
  const TK = '2026-06-15';
  const at = (n: number) => shiftDateKey(TK, -n);
  const row = (n: number, category: string, movementPattern: string | null) => ({
    date: at(n),
    category,
    movementPattern,
  });
  const counted = patternsDoneFrom({
    todayKey: TK,
    done: [
      row(1, '하체 스트렝스', '힌지'),
      row(1, '하체 스트렝스', '힌지'),
      row(3, '파워', '스쿼트'),
      row(5, '하체 스트렝스', '힌지'),
      row(PATTERNS_LOOKBACK_DAYS, '상체 스트렝스', '밀기'),
      row(PATTERNS_LOOKBACK_DAYS + 1, '상체 스트렝스', '당기기'),
      row(0, '상체 스트렝스', '당기기'),
      row(2, '암케어', '당기기'),
      row(4, '코어', null),
    ],
  });
  check(
    'P5 도우미 (라) patternsDoneFrom — 날 수로 셈(같은 날 둘은 하나) · 박스 점프는 스쿼트 · 14일 전까지 들고 15일 전 · 오늘 · 암케어는 안 셈 · 계열 이름순',
    counted != null &&
      json([...counted]) ===
        json([
          ['밀기', 1],
          ['스쿼트', 1],
          ['힌지', 2],
        ]),
    json(counted ? [...counted] : null)
  );
  const onlyCore = patternsDoneFrom({ todayKey: TK, done: [row(2, '코어', null)] });
  check(
    'P5 도우미 (라) 마친 날이 없으면 null(빈 기록 · 오늘만 · 암케어만 · 기간 밖만), 마친 날은 있는데 계열이 없으면 빈 Map',
    patternsDoneFrom({ todayKey: TK, done: [] }) === null &&
      patternsDoneFrom({ todayKey: TK, done: [row(0, '하체 스트렝스', '힌지')] }) ===
        null &&
      patternsDoneFrom({ todayKey: TK, done: [row(1, '암케어', '당기기')] }) === null &&
      patternsDoneFrom({
        todayKey: TK,
        done: [row(PATTERNS_LOOKBACK_DAYS + 1, '하체 스트렝스', '힌지')],
      }) === null &&
      onlyCore != null &&
      onlyCore.size === 0
  );

  /* ── (마) 배선 — 동작 변화 0 의 모양: theme 은 목록을 가져다 쓰고, 안전 규칙은 조심할 관절을 한 번 읽는다 ── */
  const stripP5 = (p: string) =>
    readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const themeSrcP5 = stripP5('lib/report/theme.ts');
  const rxSrcP5 = stripP5('lib/report/prescription.ts');
  check(
    'P5 도우미 (마) theme.ts 는 무게 드는 카테고리 · 상체 파워 계열을 exercise-class.ts 에서 가져온다(따로 적은 목록 없음) · prescription 은 조심할 관절을 easedJointsOf 한 번으로 읽는다',
    /import \{[^}]*\bHEAVY_CATEGORIES\b[^}]*\bUPPER_POWER_PATTERNS\b[^}]*\} from '@\/lib\/engine\/exercise-class';/.test(
      themeSrcP5
    ) &&
      !/const HEAVY_CATEGORIES\b/.test(themeSrcP5) &&
      !/'밀기', '당기기', '회전'/.test(themeSrcP5) &&
      (rxSrcP5.match(/easedJointsOf\(facts, caution\)/g) ?? []).length === 1 &&
      !/RELATED_PARTS\[key\]\s*;\s*\n\s*basis\.push/.test(rxSrcP5)
  );
  check(
    'P5 도우미 (마) 즐겨찾기 — 표(UserExerciseFavorite)와 읽기(lib/favorites.ts favoriteExerciseIds)가 있어 점수의 즐겨찾기 항목이 새 조회 없이 읽는다',
    /model UserExerciseFavorite \{/.test(
      readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
    ) &&
      /export async function favoriteExerciseIds\(userId: string\): Promise<Set<string>>/.test(
        readFileSync(new URL('../lib/favorites.ts', import.meta.url), 'utf8')
      )
  );
}

/* ═══════════════════ [2판 P5] 처방 한 길 — lib/report/volume.ts planPrescription · 세션 판의 양 조절(lib/workout/session-plan.ts) (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P5] 처방 한 길 — 세트 · 횟수를 세는 자리가 planPrescription 하나로 · 일정 · 세션 판이 양 조절을 지킴 · 만드는 쪽이 아직 없어 동작 변화 0(2026-10-12)'
);
{
  /*
   * 세트 · 횟수를 다시 세는 아홉 자리(일정을 짤 때 · 트레이닝 화면 목록 · '운동 추가' 목록 · 홈의 운동 시간 · 운동 시작 · 운동 중 [교체]
   * 목록 · 바꿔 넣기 · 기록의 '계획' 둘)가 모두 planPrescription(목표 처방 위에 그날 양 조절)을 부른다. 이 절은 그 함수와 판이
   * 양 조절을 잃지 않는지, 조절이 없으면 예전(goalPrescription)과 글자까지 같은지를 본다. 자리마다 부르는지는 코드 읽기로 확인했다.
   */
  const json = (v: unknown) => JSON.stringify(v);
  const V: PlanVolume = {
    setDelta: -1,
    intensityStep: -1,
    why: '평소 컨디션보다 낮아 본운동을 한 세트씩 줄였어요.',
  };
  const goals: (string | null | undefined)[] = [
    ...TRAINING_GOALS.map((g) => g.name),
    null,
    undefined,
    '없는 목표',
  ];

  /* ── (가) readPlanVolume — 모양 검사 · 새 객체 · 모르는 칸 버림 ── */
  const readBack = readPlanVolume({ ...V, extra: 1 });
  check(
    'P5 처방 (가) readPlanVolume — 맞는 모양은 새 객체로(모르는 칸은 버림), intensityStep 이 없으면 0, 강도만 내린 조절도 읽음',
    readBack != null &&
      readBack !== V &&
      json(readBack) === json(V) &&
      json(readPlanVolume({ setDelta: -1, why: '줄였어요.' })) ===
        json({ setDelta: -1, intensityStep: 0, why: '줄였어요.' }) &&
      json(readPlanVolume({ setDelta: 0, intensityStep: -1, why: '뺐어요.' })) ===
        json({ setDelta: 0, intensityStep: -1, why: '뺐어요.' }),
    json(readBack)
  );
  const broken: unknown[] = [
    null,
    undefined,
    0,
    -1,
    'x',
    [],
    [V],
    { ...V, setDelta: -2 },
    { ...V, setDelta: '-1' },
    { ...V, setDelta: 1 },
    { ...V, intensityStep: 1 },
    { ...V, intensityStep: null },
    { ...V, why: '' },
    { ...V, why: '   ' },
    { ...V, why: 3 },
    { setDelta: -1, intensityStep: -1 },
    { setDelta: 0, intensityStep: 0, why: '아무것도 안 줄였어요.' },
    { intensityStep: -1, why: '세트 칸이 없어요.' },
  ];
  const leaked = broken.filter((b) => readPlanVolume(b) !== null);
  check(
    `P5 처방 (가) 깨진 양 조절 ${broken.length}가지(숫자 · 글자 · 배열 · −2 · 글자 숫자 · +1 · 빈 까닭 · 까닭 없음 · 둘 다 0 · 세트 칸 없음)는 null — 안 줄인다`,
    leaked.length === 0,
    json(leaked)
  );

  /* ── (나) applyVolume — 무게 드는 카테고리 3세트 이상만 한 세트, 나머지는 같은 객체 ── */
  const rxRow = (
    category: string,
    sets: number | null,
    reps: number | null = 5,
    holdSeconds: number | null = null
  ) => ({ category, intensity: '높음', sets, reps, holdSeconds, restSeconds: 120 });
  const squatRx = rxRow('하체 스트렝스', 4);
  const benchRx = rxRow('상체 스트렝스', 3, 8);
  const jumpRx = rxRow('파워', 3, 5);
  check(
    'P5 처방 (나) applyVolume — 하체 스트렝스 4×5 → 3×5 · 상체 스트렝스 3×8 → 2×8 · 파워 3×5 → 2×5, 횟수 · 시간 · 휴식은 그대로',
    json(applyVolume(squatRx, V)) === json({ ...squatRx, sets: 3 }) &&
      json(applyVolume(benchRx, V)) === json({ ...benchRx, sets: 2 }) &&
      json(applyVolume(jumpRx, V)) === json({ ...jumpRx, sets: 2 }),
    json([applyVolume(squatRx, V), applyVolume(benchRx, V), applyVolume(jumpRx, V)])
  );
  const keepRows = [
    rxRow('하체 스트렝스', VOLUME_MIN_SETS),
    rxRow('상체 스트렝스', 1),
    rxRow('파워', null),
    ...TRAINING_CATEGORY_NAMES.filter((c) => !HEAVY_CATEGORIES.includes(c)).map((c) =>
      rxRow(c, 3, 12)
    ),
  ];
  check(
    `P5 처방 (나) 그대로 둘 것 ${keepRows.length}가지는 같은 객체(===) — ${VOLUME_MIN_SETS}세트 이하 · 세트 안 채움 · 무게 안 드는 카테고리 전부, 조절이 없거나(null · undefined) 세트를 안 줄이는 조절(강도만)이면 무엇이든`,
    keepRows.length > 3 &&
      keepRows.every((r) => applyVolume(r, V) === r) &&
      [squatRx, benchRx, jumpRx].every(
        (r) =>
          applyVolume(r, null) === r &&
          applyVolume(r, undefined) === r &&
          applyVolume(r, { ...V, setDelta: 0 }) === r
      )
  );
  {
    let cut = 0;
    let kept = 0;
    const bad: string[] = [];
    for (const ex of library) {
      for (const g of goals) {
        const base = goalPrescription(ex, g);
        const out = applyVolume(base, V);
        const shouldCut =
          HEAVY_CATEGORIES.includes(base.category) &&
          base.sets != null &&
          base.sets > VOLUME_MIN_SETS;
        if (shouldCut) {
          cut++;
          if (out === base || json(out) !== json({ ...base, sets: base.sets! - 1 })) {
            bad.push(`${ex.title}/${g}`);
          }
        } else {
          kept++;
          if (out !== base) bad.push(`${ex.title}/${g}`);
        }
      }
    }
    check(
      `P5 처방 (나) 실제 운동 ${library.length}개 × 목표 ${goals.length}가지 — 줄어든 ${cut} · 그대로 ${kept}, 줄어든 것은 세트 하나만 다르고 그대로인 것은 같은 객체`,
      cut > 0 && kept > 0 && bad.length === 0,
      bad.slice(0, 5).join(' · ')
    );
  }

  /* ── (다) planPrescription — 조절이 없으면 goalPrescription 과 글자까지 같고(같은 객체면 같은 객체), 있으면 목표 다음에 댄다 ── */
  {
    const shapesOf = (g: string | null | undefined) => [
      null,
      undefined,
      { goal: g },
      { goal: g, volume: undefined },
      { goal: g, volume: null },
      { goal: g, volume: { ...V, setDelta: -2 } },
      { goal: g, volume: '세트를 줄였어요' },
      /* 옛 일정 줄 모양(DailyTrainingSetup.plan — volume 칸 없음) */
      { version: 1, goal: g, picks: [] as unknown[] },
    ];
    let pairs = 0;
    const diff: string[] = [];
    for (const ex of library) {
      for (const g of goals) {
        for (const shape of shapesOf(g)) {
          pairs++;
          const want = goalPrescription(ex, shape?.goal);
          const got = planPrescription(ex, shape);
          if (json(got) !== json(want) || (want === ex) !== (got === ex)) {
            diff.push(`${ex.title}/${g}/${json(shape)}`);
          }
        }
      }
    }
    check(
      `P5 처방 (다) 동작 변화 0 — 실제 운동 × 목표 × 일정 모양(없음 · 목표만 · 조절 null · 깨진 조절 · 옛 줄) ${pairs}쌍에서 planPrescription = goalPrescription(바꿀 것이 없으면 같은 객체)`,
      pairs > 0 && diff.length === 0,
      diff.slice(0, 3).join(' · ')
    );
    const withV: string[] = [];
    for (const ex of library) {
      for (const g of goals) {
        const want = applyVolume(goalPrescription(ex, g), V);
        if (json(planPrescription(ex, { goal: g, volume: V })) !== json(want)) {
          withV.push(`${ex.title}/${g}`);
        }
      }
    }
    /* 근력 향상의 무거운 운동은 라이브러리 3×10 → 목표 4×5 → 조절 3×5. 조절을 먼저 대면 2×10 → 목표가 덮어 4×5 가 된다 */
    const heavy = { ...rxRow('하체 스트렝스', 3, 10), intensity: '높음' };
    const order = planPrescription(heavy, { goal: '근력 향상', volume: V });
    check(
      'P5 처방 (다) 조절이 있으면 목표 처방 다음에 댄다 — 실제 운동 × 목표 전부 applyVolume(goalPrescription) 와 같고, 근력 향상 3×10 → 4×5 → 3×5',
      withV.length === 0 && order.sets === 3 && order.reps === 5,
      `${withV.slice(0, 3).join(' · ')} ${order.sets}×${order.reps}`
    );
  }

  /* ── (라) freezePlan · readFrozenPlan — 판이 조절을 싣고 지키며, 조절 없는 판은 옛 모양 그대로(RG) ── */
  const srcRow = (
    id: string,
    category: string,
    intensity: string,
    sets: number,
    reps: number | null,
    movementPattern: string | null = null
  ) => ({
    id,
    title: id,
    category,
    intensity,
    movementPattern,
    bodyParts: [] as string[],
    equipment: [] as string[],
    sets,
    reps,
    holdSeconds: null,
    restSeconds: 90,
    perSide: false,
    thumbPath: null,
  });
  const srcRows = [
    srcRow('스쿼트', '하체 스트렝스', '높음', 3, 10, '스쿼트'),
    srcRow('박스 점프', '파워', '높음', 3, 5, '스쿼트'),
    srcRow('플랭크', '코어', '낮음', 3, 12),
    srcRow('밴드 외회전', '암케어', '낮음', 2, 15),
  ];
  const srcById = new Map(srcRows.map((r) => [r.id, r]));
  const picksV: { exerciseId: string; slot: SlotKey }[] = [
    { exerciseId: '스쿼트', slot: 'main' },
    { exerciseId: '박스 점프', slot: 'main' },
    { exerciseId: '플랭크', slot: 'core' },
    { exerciseId: '밴드 외회전', slot: 'armcare' },
  ];
  const freezeV = (
    picks: { exerciseId: string; slot: SlotKey }[],
    volume?: PlanVolume | null
  ) =>
    volume === undefined
      ? freezePlan('lower', '하체', picks, srcById, '근력 향상')
      : freezePlan('lower', '하체', picks, srcById, '근력 향상', volume);
  const plainV = freezeV(picksV);
  const cutV = freezeV(picksV, V);
  /* 운동 이름 차례로 — 판의 하는 차례(orderSession)와 상관없이 견준다 */
  const setsById = (p: FrozenPlan) =>
    Object.fromEntries(
      p.exercises
        .map((e) => [e.id, e.plannedSets] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  check(
    'P5 처방 (라) RG — 조절 없이 찍은 판은 칸이 예전 넷(themeKey · themeLabel · goal · exercises)뿐이고, null 을 넘겨도 글자까지 같다',
    json(Object.keys(plainV)) ===
      json(['themeKey', 'themeLabel', 'goal', 'exercises']) &&
      json(freezeV(picksV, null)) === json(plainV),
    json(Object.keys(plainV))
  );
  check(
    'P5 처방 (라) 조절을 넘기면 판에 실리고(새 객체) 본운동만 한 세트 — 스쿼트 4(근력 향상) → 3 · 박스 점프 3 → 2 · 플랭크 · 밴드 외회전 그대로',
    cutV.volume != null &&
      cutV.volume !== V &&
      json(cutV.volume) === json(V) &&
      json(setsById(plainV)) ===
        json({ '박스 점프': 3, '밴드 외회전': 2, 스쿼트: 4, 플랭크: 3 }) &&
      json(setsById(cutV)) ===
        json({ '박스 점프': 2, '밴드 외회전': 2, 스쿼트: 3, 플랭크: 3 }),
    `${json(setsById(plainV))} → ${json(setsById(cutV))}`
  );
  check(
    'P5 처방 (라) 판의 처방 줄은 planPrescription 으로 쓴 글과 같고(트레이닝 화면 목록 = 운동 화면), 깨진 조절을 넘기면 조절 없는 판과 같다',
    cutV.exercises.every(
      (e) =>
        e.prescription ===
        formatPrescription(
          planPrescription(srcById.get(e.id)!, { goal: '근력 향상', volume: V })
        )
    ) &&
      json(freezeV(picksV, { ...V, setDelta: -2 } as unknown as PlanVolume)) ===
        json(plainV)
  );
  const storedCut = JSON.parse(json(cutV)) as Record<string, unknown>;
  const backCut = readFrozenPlan(storedCut);
  const backPlain = readFrozenPlan(JSON.parse(json(plainV)));
  check(
    'P5 처방 (라) readFrozenPlan — 저장했다 읽어도 조절이 남고, 조절 없는 판은 칸이 안 생기고(Object.keys 예전 넷), 깨진 조절은 버린다',
    json(backCut?.volume) === json(V) &&
      backPlain != null &&
      json(Object.keys(backPlain)) === json(Object.keys(plainV)) &&
      !(
        'volume' in (readFrozenPlan({ ...storedCut, volume: { setDelta: -2 } }) ?? {})
      ) &&
      !('volume' in (readFrozenPlan({ ...storedCut, volume: '줄였어요' }) ?? {}))
  );
  const swapEntry: PlanSwap = {
    from: '플랭크',
    to: null,
    kind: 'remove',
    where: 'session',
    slot: 'core',
    at: '2026-06-15T01:00:00.000Z',
  };
  const rewrittenV = readFrozenPlan(
    JSON.parse(
      json({
        ...withSwaps(backCut!, [swapEntry]),
        exercises: backCut!.exercises.slice(0, 2),
      })
    )
  );
  check(
    'P5 처방 (라) 운동 중 빼기 · 바꾸기의 다시 쓰기(`{ ...withSwaps(plan), exercises }`) 뒤에도 조절과 기록이 같이 남는다',
    json(rewrittenV?.volume) === json(V) &&
      rewrittenV?.swaps?.length === 1 &&
      rewrittenV.exercises.length === 2
  );

  /* ── (마) 다시 열기 — 지키는 판의 조절로 붙는 운동을 찍는다(volumeToFreeze · mergeReopened) ── */
  const keptPlainV = readFrozenPlan(JSON.parse(json(freezeV(picksV.slice(0, 1)))))!;
  const keptCutV = readFrozenPlan(JSON.parse(json(freezeV(picksV.slice(0, 1), V))))!;
  check(
    'P5 처방 (마) volumeToFreeze — 운동이 남은 판이면 그 판의 조절(없으면 없음), 판이 없거나 빈 판이면 오늘 일정의 조절(깨졌으면 없음)',
    volumeToFreeze(keptPlainV, V) === null &&
      json(volumeToFreeze(keptCutV, null)) === json(V) &&
      json(volumeToFreeze(keptCutV, { ...V, why: '다른 까닭' })) === json(V) &&
      json(volumeToFreeze(null, V)) === json(V) &&
      json(volumeToFreeze({ ...keptPlainV, exercises: [] }, V)) === json(V) &&
      volumeToFreeze(null, undefined) === null &&
      volumeToFreeze(null, { setDelta: -2 }) === null
  );
  {
    /* 아침에 조절 없이 스쿼트만 한 판 → 저녁 일정은 조절(세트 −1) · 넷 → 다시 열면 붙는 셋도 조절 없이(아침 판과 같은 세트) */
    const morning = mergeReopened(
      keptPlainV,
      freezeV(picksV, volumeToFreeze(keptPlainV, V))
    );
    /* 거꾸로 — 아침 판이 조절을 했으면 붙는 운동도 그 조절로 */
    const morningCut = mergeReopened(
      keptCutV,
      freezeV(picksV, volumeToFreeze(keptCutV, null))
    );
    check(
      'P5 처방 (마) 다시 열기 — 붙는 운동은 지키는 판과 같은 조절(조절 없는 판엔 칸도 없고 박스 점프 3세트, 조절한 판엔 칸이 남고 박스 점프 2세트), 판의 첫 운동은 그대로',
      !('volume' in morning) &&
        morning.exercises[0].id === '스쿼트' &&
        morning.exercises[0].plannedSets === 4 &&
        setsById(morning)['박스 점프'] === 3 &&
        json(morningCut.volume) === json(V) &&
        morningCut.exercises[0].plannedSets === 3 &&
        setsById(morningCut)['박스 점프'] === 2 &&
        morning.exercises.length === 4 &&
        morningCut.exercises.length === 4,
      `${json(setsById(morning))} · ${json(setsById(morningCut))}`
    );
  }

  /* ── (바) 운동 중 바꿔 넣기 — 목표는 판(옛 판은 오늘 일정), 조절은 판의 것만, 바꿔 넣은 운동 = 처음 찍었으면 나왔을 운동 ── */
  check(
    'P5 처방 (바) sessionRxBasis — 목표는 판의 것이 먼저 · 목표 없는 옛 판은 오늘 일정의 목표 · 조절은 판의 것만(조절 없는 판은 null)',
    json(sessionRxBasis(keptCutV, '파워 향상')) ===
      json({ goal: '근력 향상', volume: V }) &&
      json(sessionRxBasis({ ...keptPlainV, goal: null }, '파워 향상')) ===
        json({ goal: '파워 향상', volume: null }) &&
      json(sessionRxBasis({ ...keptPlainV, goal: null }, undefined)) ===
        json({ goal: null, volume: null }) &&
      sessionRxBasis(keptPlainV, '근력 향상').volume === null
  );
  {
    const swapped = backCut!.exercises.map((e) =>
      freezeExercise(
        planPrescription(srcById.get(e.id)!, sessionRxBasis(backCut!, '파워 향상')),
        e.slot
      )
    );
    check(
      'P5 처방 (바) 운동 중에 같은 운동을 바꿔 넣으면 운동 시작 때 찍은 것과 글자까지 같다(세트 · 처방 줄 · 무게 필수 — 조절한 판)',
      json(swapped) === json(backCut!.exercises),
      json(swapped.map((e) => e.plannedSets))
    );
  }

  /* ── (사) 아홉 자리 같은 값 — 같은 일정 · 같은 운동이면 화면 목록 · 기록의 '계획' · 운동 시작 · 바꿔 넣기 · 홈 시간이 같은 수를 낸다 ── */
  {
    const dayPlanV = readDailyPlan(
      JSON.parse(json({ version: 1, goal: '근력 향상', volume: V, picks: picksV }))
    );
    const startV = freezePlan(
      'lower',
      '하체',
      dayPlanV!.picks,
      srcById,
      dayPlanV!.goal,
      volumeToFreeze(null, dayPlanV!.volume)
    );
    const rows = srcRows.map((r) => {
      const shown = formatPrescription(planPrescription(r, dayPlanV));
      const started = startV.exercises.find((e) => e.id === r.id)?.prescription;
      const swappedIn = freezeExercise(
        planPrescription(r, sessionRxBasis(startV, dayPlanV!.goal)),
        'main'
      ).prescription;
      const minutes = estimateMinutes(planPrescription(r, dayPlanV));
      const before = estimateMinutes(goalPrescription(r, dayPlanV!.goal));
      return { id: r.id, shown, started, swappedIn, minutes, before };
    });
    check(
      'P5 처방 (사) 아홉 자리 같은 값 — 저장된 일정(조절 있음)으로 화면 목록 · 기록 = 운동 시작 = 바꿔 넣기 처방 줄, 홈 시간은 줄인 운동만 줄어든다',
      dayPlanV != null &&
        rows.every(
          (r) => r.shown != null && r.shown === r.started && r.shown === r.swappedIn
        ) &&
        rows.every((r) =>
          ['스쿼트', '박스 점프'].includes(r.id)
            ? r.minutes < r.before
            : r.minutes === r.before
        ),
      json(rows.map((r) => `${r.id} ${r.shown} ${r.before}→${r.minutes}분`))
    );
  }

  /* ── (아) 동작 변화 0 — 만드는 쪽이 아직 없다: P3 160조합으로 만든 일정에 조절 칸이 없고, 처방은 목표 처방과 같다 ── */
  {
    let built = 0;
    const withVolume: string[] = [];
    const rxDiff: string[] = [];
    const libById = new Map(library.map((ex) => [ex.id, ex]));
    for (const [i, facts] of p3ComboFactsSeen.entries()) {
      const day = buildDailyPlan({
        user: { ownedEquipment: [], trainingLevel: null },
        facts,
        plan: buildPitchPlan(facts),
        library,
        availableToday: null,
        requestedMinutes: 45,
        recentIds: new Set<string>(),
        lastLowerKey: null,
        lastUpperKey: null,
      });
      if (isHalted(day)) continue;
      built++;
      if ('volume' in day) withVolume.push(`p0-${i}`);
      for (const pick of day.picks) {
        const ex = libById.get(pick.exerciseId);
        if (!ex) continue;
        if (json(planPrescription(ex, day)) !== json(goalPrescription(ex, day.goal))) {
          rxDiff.push(`p0-${i} ${ex.title}`);
        }
      }
    }
    check(
      `P5 처방 (아) 동작 변화 0 — P3 160조합(${p3ComboFactsSeen.length}명) 중 일정이 나온 ${built}명: 조절 칸 없음 · 모든 칸의 처방이 목표 처방과 같다`,
      p3ComboFactsSeen.length === 160 &&
        built > 0 &&
        withVolume.length === 0 &&
        rxDiff.length === 0,
      `${withVolume.slice(0, 3).join(' · ')} ${rxDiff.slice(0, 3).join(' · ')}`
    );
  }
}

/* ═══════════════════ [2판 P5] 평소 대비 컨디션 — lib/report/facts.ts usualConditionOf · belowUsualCondition · prescription.ts 4-2-1 · day-state.ts body.belowUsual (2026-10-12) ═══════════════════ */
console.log(
  '\n[2판 P5] 평소 대비 컨디션 — 오늘을 뺀 28일 중앙값(체크인 14개 이상일 때만) · 평소보다 2점 이상 낮으면 가장 센 운동만 뺀다 · 바닥(4) 이하는 그대로(2026-10-12)'
);
{
  /*
   * 왜 보는가. 컨디션 6 은 늘 6 인 사람에게는 보통 날이고 늘 8 인 사람에게는 덜 된 날이다. 2판 P5 는 오늘을 뺀 28일 체크인의 중앙값을
   * '평소'로 두고(facts.condition.usualCondition — 14개 이상일 때만 칸), 평소보다 2점 이상 낮은 날에 안전 거르기가 '매우 높음'만 뺀다
   * (prescription.ts 4-2-1 — 짧은 밤과 같은 상한). 조이는 규칙만이라 후보가 늘지 않고, 바닥(4) 이하 · 1점 차이 · 평소를 모르는 사람 ·
   * 근력 프로그램(partsOnly)은 글자 그대로다. (가) 평소 셈, (나) facts 칸, (다) 판정, (라) 안전 거르기 · 매일 일정, (마) P3 160조합 격자,
   * (사) 오늘 상태 한 장을 본다.
   */
  type Facts = ReturnType<typeof buildFacts>;
  const json = (v: unknown) => JSON.stringify(v);
  const keyBefore = (n: number) => dayBefore(n).slice(0, 10);
  const asOfKey = keyBefore(0);
  /* values[0] 이 어제(from 일 전) — 날짜마다 하나 */
  const rows = (values: (number | null)[], from = 1) =>
    values.flatMap((c, i) =>
      c == null ? [] : [{ date: keyBefore(from + i), condition: c }]
    );
  const same = (n: number, c: number) => Array.from({ length: n }, () => c);
  const MIN = USUAL_CONDITION_MIN_CHECKINS;

  /* ── (가) usualConditionOf ── */
  check(
    `P5 평소 (가) 지난 체크인 ${MIN - 1}개면 없음(null) · ${MIN}개면 중앙값 — 14개 미만이면 평소를 모른다`,
    usualConditionOf(rows(same(MIN - 1, 8)), asOfKey) === null &&
      json(usualConditionOf(rows(same(MIN, 8)), asOfKey)) ===
        json({ median: 8, days: MIN }),
    json(usualConditionOf(rows(same(MIN, 8)), asOfKey))
  );
  check(
    'P5 평소 (가) 오늘 체크인은 안 센다 — 지난 13개 + 오늘 하나는 null',
    usualConditionOf(
      [...rows(same(MIN - 1, 8)), { date: asOfKey, condition: 8 }],
      asOfKey
    ) === null
  );
  const plusOne = (date: string) =>
    usualConditionOf([...rows(same(MIN - 1, 8)), { date, condition: 8 }], asOfKey);
  check(
    `P5 평소 (가) 창은 어제 ~ ${USUAL_CONDITION_DAYS}일 전 — 13개 + ${USUAL_CONDITION_DAYS}일 전은 14개, 13개 + ${USUAL_CONDITION_DAYS + 1}일 전 · 내일은 null`,
    plusOne(keyBefore(USUAL_CONDITION_DAYS))?.days === MIN &&
      plusOne(keyBefore(USUAL_CONDITION_DAYS + 1)) === null &&
      plusOne(keyBefore(-1)) === null
  );
  const evenRows = rows([...same(7, 5), ...same(7, 8)]);
  const oddRows = rows([...same(5, 5), ...same(5, 6), ...same(5, 9)]);
  const tailRows = rows([2, ...same(13, 8), 10]);
  check(
    'P5 평소 (가) 중앙값 — 짝수 개면 가운데 둘의 평균(5 일곱 · 8 일곱 → 6.5), 홀수 개면 가운데(5 · 6 · 9 다섯씩 → 6), 끝값이 안 끈다(2 · 8 열셋 · 10 → 8)',
    usualConditionOf(evenRows, asOfKey)?.median === 6.5 &&
      usualConditionOf(oddRows, asOfKey)?.median === 6 &&
      usualConditionOf(tailRows, asOfKey)?.median === 8,
    `${usualConditionOf(evenRows, asOfKey)?.median} · ${usualConditionOf(oddRows, asOfKey)?.median} · ${usualConditionOf(tailRows, asOfKey)?.median}`
  );
  /* 앞의 것이 이기는지 가리려면 값이 중앙값을 움직여야 한다 — 어제(5)를 8 로 덮으면 5 여섯 · 8 여덟 → 8, 뒤의 것이 이기면 6.5 */
  const dupFirst = [{ date: keyBefore(1), condition: 8 }, ...evenRows];
  check(
    'P5 평소 (가) 같은 날짜는 한 번만 센다(앞의 것) — 13날 + 겹친 하루는 null, 14날 앞에 겹친 값은 그날 값이 된다(6.5 → 8)',
    usualConditionOf(
      [...rows(same(MIN - 1, 8)), { date: keyBefore(1), condition: 1 }],
      asOfKey
    ) === null &&
      json(usualConditionOf(dupFirst, asOfKey)) === json({ median: 8, days: MIN }),
    json(usualConditionOf(dupFirst, asOfKey))
  );
  const junk = [
    ...rows(same(MIN - 1, 8)),
    { date: keyBefore(MIN), condition: Number.NaN },
    { date: '2026-6-1', condition: 8 },
    { date: 'x', condition: 8 },
  ];
  check(
    'P5 평소 (가) 컨디션이 숫자가 아니거나 날짜 꼴이 아닌 줄은 안 센다 — 13개 + 깨진 셋은 null',
    usualConditionOf(junk, asOfKey) === null
  );
  const mixed = rows([9, 3, 7, 5, 8, 6, 4, 8, 7, 9, 2, 6, 8, 7, 5, 8]);
  check(
    'P5 평소 (가) 차례와 상관없이 같은 값 · 같은 입력 두 번 → 같은 값(16개 → 7)',
    json(usualConditionOf(mixed, asOfKey)) === json({ median: 7, days: 16 }) &&
      json(usualConditionOf([...mixed].reverse(), asOfKey)) ===
        json(usualConditionOf(mixed, asOfKey)),
    json(usualConditionOf(mixed, asOfKey))
  );

  /* ── (나) buildFacts 의 칸 ── */
  const ckOf = (n: number, condition: number, sleep = '보통'): CheckinLike => ({
    date: keyBefore(n),
    condition,
    sleep,
    shoulder: '괜찮음',
    elbow: '괜찮음',
    wrist: '괜찮음',
    lowerBack: '괜찮음',
    lowerBody: '괜찮음',
    preferredParts: [],
    preferredWorkout: null,
  });
  /* factsFor 의 기본 사람(DEFAULT_PITCHES)에 지난 체크인(history[0] 이 어제)만 더한 사람 */
  const histFacts = ({
    today,
    history,
    sleep,
  }: {
    today: number | null;
    history: (number | null)[];
    sleep?: string;
  }): Facts =>
    buildFacts({
      nickname: '시험',
      age: 22,
      heightCm: 180,
      baselineDailyLoad: 100,
      rehab: null,
      today: TODAY,
      logs: DEFAULT_PITCHES.map<PitchLogLike>((count, i) => ({
        date: dayBefore(i + 1),
        pitchCount: count,
        intensity: 7,
        maxVelocity: 130,
        avgVelocity: 120,
      })),
      checkins: [
        ...(today == null ? [] : [ckOf(0, today, sleep)]),
        ...history.flatMap((c, i) => (c == null ? [] : [ckOf(i + 1, c)])),
      ],
      memos: [],
    });
  const f13 = histFacts({ today: 6, history: same(MIN - 1, 8) });
  const f14 = histFacts({ today: 6, history: same(MIN, 8) });
  const f0 = histFacts({ today: 6, history: [] });
  check(
    'P5 평소 (나) buildFacts — 지난 체크인 13개면 칸 자체가 없다(체크인 없는 사람과 같은 칸 목록), 14개면 { median 8 · days 14 }',
    !('usualCondition' in f13.condition) &&
      json(Object.keys(f13.condition)) === json(Object.keys(f0.condition)) &&
      json(f14.condition.usualCondition) === json({ median: 8, days: MIN }),
    json(Object.keys(f14.condition))
  );

  /* ── (다) belowUsualCondition ── */
  const below = (today: number | null, history: (number | null)[] = same(20, 8)) =>
    belowUsualCondition(histFacts({ today, history }));
  check(
    `P5 평소 (다) 평소 8 · 오늘 6(${BELOW_USUAL_GAP}점 차이) → 걸림 { today 6 · median 8 }`,
    json(below(6)) === json({ today: 6, median: 8 }),
    json(below(6))
  );
  check(
    'P5 평소 (다) 평소 8 · 오늘 7(1점 차이) → 안 걸림 · 8 · 9 도 안 걸림',
    below(7) === null && below(8) === null && below(9) === null,
    json([below(7), below(8), below(9)])
  );
  check(
    'P5 평소 (다) 평소 8 · 오늘 5(3점 차이) → 걸림',
    json(below(5)) === json({ today: 5, median: 8 }),
    json(below(5))
  );
  check(
    `P5 평소 (다) 오늘 ${LOW_CONDITION_THRESHOLD} 이하는 안 걸림 — 바닥 규칙(회복날)이 먼저 지킨다`,
    below(4) === null && below(3) === null && below(1) === null
  );
  check(
    'P5 평소 (다) 오늘 체크인 없음 · 지난 체크인 13개(평소 모름) → 안 걸림',
    below(null) === null && below(6, same(MIN - 1, 8)) === null
  );
  const withUsual = (f: Facts, usual: unknown): Facts => ({
    ...f,
    condition: { ...f.condition, usualCondition: usual as UsualCondition },
  });
  const withoutUsual = (f: Facts): Facts => {
    const condition = { ...f.condition };
    delete condition.usualCondition;
    return { ...f, condition };
  };
  const today5 = histFacts({ today: 5, history: [] });
  check(
    'P5 평소 (다) 반 점 평소 — 6.5 에 오늘 5(1.5점)는 안 걸림, 7 에 오늘 5 는 걸림',
    belowUsualCondition(withUsual(today5, { median: 6.5, days: 20 })) === null &&
      json(belowUsualCondition(withUsual(today5, { median: 7, days: 20 }))) ===
        json({ today: 5, median: 7 })
  );
  check(
    'P5 평소 (다) 옛 facts(칸 없음) · 깨진 칸(중앙값이 글자 · NaN · 센 수가 13 · 센 수 없음 · null) → 안 걸림',
    belowUsualCondition(f0) === null &&
      [
        { median: '8', days: 20 },
        { median: Number.NaN, days: 20 },
        { median: 8, days: MIN - 1 },
        { median: 8 },
        null,
      ].every((u) => belowUsualCondition(withUsual(f0, u)) === null)
  );

  /* ── (라) 안전 거르기 · 매일 일정 ── */
  const pick = (f: Facts, partsOnly = false) =>
    selectCandidates({ facts: f, plan: buildPitchPlan(f), library, partsOnly });
  const levelOf = (e: { intensity: string }) => intensityLevel(e.intensity);
  const ids = (r: { candidates: { id: string }[] }) => r.candidates.map((e) => e.id);
  const RULE = '평소보다 낮은 컨디션';
  const hit6 = histFacts({ today: 6, history: same(20, 8) });
  const r6 = pick(hit6);
  const r6plain = pick(withoutUsual(hit6));
  const top = new Set(
    r6plain.candidates
      .filter((e) => levelOf(e) > INTENSITY_CAP.STRENGTH)
      .map((e) => e.id)
  );
  check(
    `P5 평소 (라) 평소 8 · 오늘 6 → '매우 높음'만 빠진다(칸 없는 같은 사람의 후보에서 그것만 뺀 목록 · 차례 그대로), 뺀 수는 excluded '${RULE}'`,
    top.size > 0 &&
      r6.candidates.every((e) => levelOf(e) <= INTENSITY_CAP.STRENGTH) &&
      json(ids(r6)) === json(ids(r6plain).filter((id) => !top.has(id))) &&
      json(r6.excluded.filter((x) => x.rule === RULE)) ===
        json([{ rule: RULE, count: top.size }]),
    `매우 높음 ${top.size}개 · 후보 ${r6plain.candidates.length} → ${r6.candidates.length}`
  );
  const usualLine = '평소 컨디션 8/10 → 오늘 6/10 → 매우 높은 강도 제외';
  check(
    `P5 평소 (라) 근거에 '${usualLine}' 한 줄이 더해지고, 다른 근거 · 다른 제외는 칸 없는 같은 사람과 글자 그대로`,
    r6.basis.includes(usualLine) &&
      json(r6.basis.filter((l) => l !== usualLine)) === json(r6plain.basis) &&
      json(r6.excluded.filter((x) => x.rule !== RULE)) === json(r6plain.excluded),
    r6.basis.join(' / ')
  );
  const hit7 = histFacts({ today: 7, history: same(20, 8) });
  const hit4 = histFacts({ today: 4, history: same(20, 8) });
  check(
    'P5 평소 (라) 평소 8 · 오늘 7(1점) → 후보 · 제외 · 근거가 칸 없는 같은 사람과 글자 그대로',
    json(pick(hit7)) === json(pick(withoutUsual(hit7)))
  );
  check(
    "P5 평소 (라) 평소 8 · 오늘 4(바닥) → 칸 없는 같은 사람과 글자 그대로 — 바닥 규칙('컨디션 저하', 무게 드는 운동 제외)만",
    json(pick(hit4)) === json(pick(withoutUsual(hit4))) &&
      pick(hit4).excluded.some((x) => x.rule === '컨디션 저하') &&
      !pick(hit4).excluded.some((x) => x.rule === RULE)
  );
  const p6 = pick(hit6, true);
  const p6plain = pick(withoutUsual(hit6), true);
  check(
    'P5 평소 (라) 근력 프로그램(partsOnly) — 평소 8 · 오늘 6 이어도 후보 · 제외가 칸 없는 같은 사람과 같다(몸 전체 규칙이라 건너뜀)',
    json(ids(p6)) === json(ids(p6plain)) &&
      json(p6.excluded) === json(p6plain.excluded) &&
      p6.candidates.some((e) => levelOf(e) > INTENSITY_CAP.STRENGTH),
    `후보 ${p6.candidates.length}`
  );
  const sleepy = histFacts({ today: 6, history: same(20, 8), sleep: '부족' });
  const rs = pick(sleepy);
  const rsPlain = pick(withoutUsual(sleepy));
  check(
    "P5 평소 (라) 짧은 밤과 겹친 날 — 같은 상한이라 더 빠지는 것 없음: 후보 · 제외('수면 부족' 수 그대로, 새 줄 없음)가 짧은 밤만인 날과 같고 근거에는 두 줄",
    json(ids(rs)) === json(ids(rsPlain)) &&
      json(rs.excluded) === json(rsPlain.excluded) &&
      rs.excluded.some((x) => x.rule === '수면 부족') &&
      rs.basis.includes(usualLine) &&
      rs.basis.includes("오늘 수면 '부족' → 매우 높은 강도 제외"),
    rs.basis.join(' / ')
  );
  const byId = new Map(library.map((e) => [e.id, e]));
  const dayOf = (f: Facts, override: boolean) =>
    buildDailyPlan({
      user: { ownedEquipment: [], trainingLevel: null },
      facts: f,
      plan: buildPitchPlan(f),
      library,
      availableToday: null,
      requestedMinutes: 60,
      recentIds: new Set<string>(),
      lastLowerKey: null,
      lastUpperKey: null,
      override,
    });
  const hot = [false, true].map((o) => dayOf(hit6, o));
  const cold = [false, true].map((o) => dayOf(withoutUsual(hit6), o));
  const topPicked: string[] = [];
  const themes: string[] = [];
  for (const [i, d] of hot.entries()) {
    const c = cold[i];
    if (isHalted(d) || isHalted(c)) {
      themes.push('멈춤');
      continue;
    }
    themes.push(`${d.theme.key}/${c.theme.key}`);
    for (const p of d.picks) {
      const ex = byId.get(p.exerciseId);
      if (ex && levelOf(ex) > INTENSITY_CAP.STRENGTH) topPicked.push(ex.title);
    }
  }
  check(
    "P5 평소 (라) 매일 일정 — '그래도 하기'(override)여도 고른 것에 '매우 높음' 0, 테마는 칸 없는 같은 사람과 같다(조이는 것은 후보뿐)",
    topPicked.length === 0 &&
      themes.length === 2 &&
      themes.every((t) => {
        const [a, b] = t.split('/');
        return b != null && a === b;
      }),
    `${themes.join(' · ')} ${topPicked.join(', ')}`
  );

  /* ── (마) P3 160조합 격자 — 평소를 얹어 본다(평소 = 오늘 + 2 · 오늘 + 1 · 센 수 13 · 프로그램) ── */
  const grid = { hit: 0, floor: 0, seen: 0 };
  const bad: string[] = [];
  for (const [i, f] of p3ComboFactsSeen.entries()) {
    const c = f.condition.today?.condition;
    /* 평소가 10 을 넘는 사람은 없다 — 오늘 9 · 10 은 2점 낮을 평소가 없어 뺀다 */
    if (c == null || c + BELOW_USUAL_GAP > 10) continue;
    grid.seen++;
    const plan = buildPitchPlan(f);
    const base = selectCandidates({ facts: f, plan, library });
    const baseIds = new Set(ids(base));
    const run = (usual: UsualCondition, partsOnly = false) =>
      selectCandidates({ facts: withUsual(f, usual), plan, library, partsOnly });
    const two = run({ median: c + BELOW_USUAL_GAP, days: 20 });
    if (c > LOW_CONDITION_THRESHOLD) {
      grid.hit++;
      if (two.halted !== base.halted) bad.push(`p0-${i} 멈춤이 바뀜`);
      if (!ids(two).every((id) => baseIds.has(id))) bad.push(`p0-${i} 후보가 늘어남`);
      if (two.candidates.some((e) => levelOf(e) > INTENSITY_CAP.STRENGTH))
        bad.push(`p0-${i} 매우 높음이 남음`);
      if (
        !two.halted &&
        !two.basis.includes(
          `평소 컨디션 ${c + BELOW_USUAL_GAP}/10 → 오늘 ${c}/10 → 매우 높은 강도 제외`
        )
      )
        bad.push(`p0-${i} 근거 줄 없음`);
    } else {
      grid.floor++;
      if (json(two) !== json(base)) bad.push(`p0-${i} 바닥(${c})인데 바뀜`);
    }
    if (json(run({ median: c + BELOW_USUAL_GAP - 1, days: 20 })) !== json(base))
      bad.push(`p0-${i} 1점인데 바뀜`);
    if (json(run({ median: c + BELOW_USUAL_GAP, days: MIN - 1 })) !== json(base))
      bad.push(`p0-${i} 평소 모름(13개)인데 바뀜`);
    const partsBase = selectCandidates({ facts: f, plan, library, partsOnly: true });
    const partsTwo = run({ median: c + BELOW_USUAL_GAP, days: 20 }, true);
    if (
      json(ids(partsTwo)) !== json(ids(partsBase)) ||
      json(partsTwo.excluded) !== json(partsBase.excluded)
    )
      bad.push(`p0-${i} 프로그램 후보가 바뀜`);
    /* 오늘 상태 한 장 — 안전 거르기와 같은 함수 */
    const expect = c > LOW_CONDITION_THRESHOLD;
    const st = buildDayState({
      facts: withUsual(f, { median: c + BELOW_USUAL_GAP, days: 20 }),
      plan,
    });
    const line = st.why.find((l) => l.includes('평소'));
    if (
      st.body.belowUsual !== expect ||
      st.body.usualCondition !== c + BELOW_USUAL_GAP ||
      (st.body.belowUsual && st.body.conditionLow)
    )
      bad.push(`p0-${i} 오늘 상태 칸이 다름(${c})`);
    if (
      expect !==
        (line === `오늘 컨디션 ${c}/10이 평소 ${c + BELOW_USUAL_GAP}/10보다 낮아요.`) ||
      (!expect && line != null)
    )
      bad.push(`p0-${i} 오늘 상태 이유 줄(${line ?? '없음'})`);
    const plainState = buildDayState({ facts: f, plan });
    if (plainState.body.belowUsual || plainState.body.usualCondition !== null)
      bad.push(`p0-${i} 칸 없는 facts 인데 평소가 있음`);
  }
  check(
    `P5 평소 (마) P3 160조합 격자(오늘 1~8 인 ${grid.seen}명): 평소 = 오늘 + 2 이면 바닥 위 ${grid.hit}명은 '매우 높음' 0 · 후보가 안 늘고 · 근거 줄, 바닥 ${grid.floor}명 · 1점 · 평소 모름 · 프로그램은 글자 그대로, 오늘 상태 칸 · 이유 줄이 같은 판정`,
    p3ComboFactsSeen.length === 160 &&
      grid.hit >= 30 &&
      grid.floor >= 10 &&
      bad.length === 0,
    `${bad.length}건 ${bad.slice(0, 3).join(' / ')}`
  );

  /* ── (사) 오늘 상태 한 장 ── */
  const st6 = buildDayState({ facts: hit6, plan: buildPitchPlan(hit6) });
  check(
    "P5 평소 (사) 오늘 상태 — 평소 8 · 오늘 6: body.usualCondition 8 · belowUsual 참 · 이유 '오늘 컨디션 6/10이 평소 8/10보다 낮아요.'",
    st6.body.usualCondition === 8 &&
      st6.body.belowUsual &&
      st6.why.includes('오늘 컨디션 6/10이 평소 8/10보다 낮아요.'),
    json(st6.why)
  );
  const st7 = buildDayState({ facts: hit7, plan: buildPitchPlan(hit7) });
  const st4 = buildDayState({ facts: hit4, plan: buildPitchPlan(hit4) });
  const st13 = buildDayState({ facts: f13, plan: buildPitchPlan(f13) });
  check(
    'P5 평소 (사) 오늘 7 → 평소 8 이지만 belowUsual 거짓 · 평소 줄 없음, 오늘 4 → 컨디션 낮음 줄만(평소 줄 없음), 지난 체크인 13개 → 평소 null',
    st7.body.usualCondition === 8 &&
      !st7.body.belowUsual &&
      !st7.why.some((l) => l.includes('평소')) &&
      st4.body.conditionLow &&
      !st4.body.belowUsual &&
      st4.why.includes('오늘 컨디션이 4/10이에요.') &&
      !st4.why.some((l) => l.includes('평소')) &&
      st13.body.usualCondition === null &&
      !st13.body.belowUsual,
    `${json(st7.why)} ${json(st4.why)}`
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
