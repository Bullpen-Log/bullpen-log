/**
 * 트레이닝 추천 기준선 — 가상 선수 12명 × 28일을 실제 운동 표로 돌려 잰다.
 *
 *   npm run training:baseline
 *   npm run training:baseline -- --out=<JSON 경로>
 *   npm run training:baseline -- --out=<새 JSON> --compare=<앞 JSON>   전후 표 · '옛 칸 같음'(scripts/training-baseline-gates.mts)
 *   npm run training:baseline -- --gate=P5                             그 단계까지의 막는 목표를 못 맞추면 exit 1
 *
 * 왜 있나. 추천 메커니즘 2판 검토안(docs/designs/training-recommendation-engine.md)이 낸 수치 — 씨앗만 바꾸면 목록
 * 90.9% 바뀜 · 체크인만 바꾸면 30.2% · 같은 설정 새 사용자 둘이 같은 목록 46.9% … — 는 스크래치에서 라이브러리를
 * 재구성해 돌린 것이라 저장소에 없다. 단계(P1~P6 · Y)마다 같은 잣대로 다시 재려면, 실제 운동 표로 도는 도구가 저장소
 * 안에 있어야 한다. 이 파일이 그 잣대다. 수치의 뜻은 아래 '재는 것' 표의 주석에 한 줄씩 적어 두었다.
 *
 * 무엇을 하나. 운동 표만 DB 에서 읽고(읽기만 — 자체 시험과 같은 findMany), 선수 12명의 투구 기록 · 체크인 · '마침'
 * 습관은 대본으로 지어낸다. 날마다 앱이 밟는 길(app/actions/training-setup.ts 의 createDailySetup)과 같은 인자로
 * buildDailyPlan 을 부른다. recentIds · sessionsAgo · lastLowerKey/UpperKey 는 DB 함수(lib/report/gather.ts)를
 * 스크립트에서 못 부르니 같은 뜻을 메모리에서 센다. 무작위가 없어 돌릴 때마다 같은 결과가 나온다.
 *
 * 앱과 다른 점 하나. 앱은 오늘 체크인이 없으면 일정을 만들지 않는다. 여기서는 '가끔' 체크인하는 선수도 날마다
 * 만든다 — 검토안의 336 일정(12 × 28)과 같은 분모로 견주기 위해서다. 그래서 주요 지표는 두 분모로 나란히 낸다:
 * 전체(336)와 '체크인 있는 날'(앱이 실제로 만드는 날). 체크인 없는 날의 수도 따로 센다.
 *
 * 결과는 표(stdout)와 JSON(임시 폴더, --out= 으로 바꿈)으로 남긴다. 지표 · 날별 기록은 돌릴 때마다 같다(무작위 없음,
 * DB 순서도 createdAt 으로 고정) — 바뀌는 것은 JSON 의 meta(만든 시각 · 걸린 시간)뿐이라, 단계 전후를 diff 로 견줄 때는
 * meta 를 빼고 본다.
 *
 * 대본 2판(2026-10-12, 2판 P3). 앱이 등판 답을 간편 체크인에서 받고(D1) 투구 강도를 체감 % 로 받게(D2) 돼, 대본도 그 꼴로 바꿨다 —
 * 체크인마다 등판 답 여섯 중 하나, 투구 기록마다 effortPct(대본 1판 강도 × 10 이라 세게 던진 날 · 부하는 같은 값). 그래서 P2 까지의
 * 표와는 ⑤ · ⑫ 의 정의가 다르고(답을 지운 변형으로 옛 숫자를 같이 낸다), 답이 새로 닿은 선수(선발B · 선발D · 구원A)의 날이
 * 바뀐다. 2판 전후를 견줄 때는 그 셋만 바뀌었는지 본다 — 상세 선수 · 비시즌 · 같은 설정 쌍은 그대로여야 한다.
 *
 * 번호. '재는 것' 표 · 아래 절 제목 · JSON 칸 주석이 같은 번호를 쓴다. ①~⑫ 는 P0(설계 문서 'P0 결과'의 정의), P4 가 넷을 더했다 —
 *   ⑬ 팔 피로 '심함' 변형(커밋 C, metrics.armSevere)   ⑭ 등판 전 무거운 하체(커밋 D, metrics.heavyLowerBeforeGame)
 *   ⑮ 날 종류 · 힘듦 급증 변형(커밋 E, metrics.dayKind) · 등판 답별 테마(metrics.planThemes, P3 부터 있던 표)
 *   ⑯ 다음 등판 짐작(커밋 G, metrics.calendarGuess).
 * P5 의 도구 커밋(T0 — 점수 · 양을 바꾸기 전에 전 값을 잰다)이 여섯을 더했다. 단계 목표(--gate)가 이 번호로 잰다:
 *   ⑰ 같은 테마 안에서 오늘 상태만 바꿈 → 목록 바뀜(metrics.sameThemeState)   ⑱ 방향 검사 넷(metrics.direction)
 *      ⑱ 의 양 조절(2판 P5-d — 세트를 줄인 날 · 줄인 세트 · 나쁜 날 · 근육통 변형에서 줄인 짝, metrics.volume)
 *   ⑲ P5 울타리 — 노출 · 회복 날 비율 · 까닭 없는 회복 · 두 번 뺀 운동(metrics.fence)
 *   ⑳ 프로그램 하는 날의 매일 일정(metrics.programDay)   ㉑ 무거운 하체 48시간(metrics.lowerGap)   ㉒ 상태 바뀜(metrics.stateAlert).
 * 커밋 메시지 · 패치노트가 이 번호로 적혀 있어 다시 매기지 않는다. 다음 단계가 더하는 지표는 ㉓ 부터 잇는다. 자체 시험의 불변식
 * 번호(scripts/training-selftest.mts '[2판 안전망(P0)]' (c) ruleNames)는 따로 매긴 것이라 같은 번호가 다른 것을 뜻한다 — 불변식
 * ⑪ 등판 창 무거운 하체 = 기준선 ⑭ · 불변식 ⑬ 등판 짐작 = 기준선 ⑯ · 불변식 ⑭ ⑯ 팔 피로 = 기준선 ⑬(불변식 ⑫ 근력 날 본운동 후보 ·
 * ⑮ 성장기 쉬는 날은 기준선에 짝이 없다).
 *
 * T0(2판 P5 도구, 2026-10-12)이 바꾼 것 셋. ① 하루 만들기를 inputsOf(앱이 buildDailyPlan 앞에서 모으는 재료 — facts · 투구 계획 · 오늘
 * 상태 한 장 · 이력 · 씨앗 · 바꿔서 뺀 운동)와 buildDay 로 갈랐다 — P5 · P6 이 일정에 넘길 인자를 더할 때 고칠 곳이 여기 한 곳이다.
 * 세트는 setsOf 한 곳으로 읽는다(⑱). ② 대본에 앱이 이미 받는 두 칸을 넣었다 — 체크인하는 날의 팔 피로(경기 다음 날 3 · 그 밖 1,
 * 'HIGH' 4 밑이라 지금 규칙엔 안 걸린다)와 마친 날의 운동 끝 힘듦(늘 6 — 급증이 안 생겨 날 종류가 안 바뀐다). 둘 다 지금은 아무 규칙도
 * 안 바꾸니 ①~⑯ 은 meta · buildCalls 를 빼면 P4 끝 JSON 과 글자까지 같다(--compare 로 확인). 힘듦을 그날 테마로 만들지 않은 까닭은
 * 되먹임(일정 → 힘듦 → 급증 → 일정)이 생겨 바뀐 숫자가 규칙 탓인지 대본 탓인지 못 가르기 때문이다(검토 비판 3 의 29번).
 * ③ 추가 묶음(cohorts.extra, 분모 따로 — ①~⑯ 에 안 섞는다): 근력 프로그램 넷(lib/program 의 실제 키 '531' · 'stronglifts-5x5' ·
 * 'french-contrast' · 'ws4sb:2' — 앱의 판정 길 lib/program/load.ts 를 순수 함수로 그대로 밟는다), 팔 피로가 며칠 이어지는 선수, 힘듦이
 * 치솟는 구원, 같은 운동을 늘 빼는 선수, 센 불펜 · 연전 · 비로 밀린 주말 선발. 무작위가 없어 추가 묶음도 돌릴 때마다 같다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  buildFacts,
  HARD_OUTING_MIN_LOAD,
  NEAR_MAX_EFFORT_PCT,
  type CalendarEventLike,
  type CheckinLike,
} from '../lib/report/facts.ts';
import { buildPitchPlan, YOUTH_AGE_THRESHOLD } from '../lib/report/plan.ts';
import {
  buildDailyPlan,
  isHalted,
  patternsDoneFrom,
  strengthDatesFrom,
  type DailyPlan,
  type PlanScoreInput,
} from '../lib/report/daily-plan.ts';
import {
  CONDITIONING_GOAL,
  minutesChoicesFor,
  painRecoveryReason,
  type ThemeKey,
} from '../lib/report/theme.ts';
import { planPrescription } from '../lib/report/volume.ts';
import {
  droppedOnlyForArmFatigue,
  selectCandidates,
} from '../lib/report/prescription.ts';
import { fingerprintOf, stateChangesOf } from '../lib/report/plan-fingerprint.ts';
import {
  SWAP_LOOKBACK_DAYS,
  swappedOutCounts,
  swappedOutOf,
  withSwaps,
} from '../lib/report/plan-swaps.ts';
import { buildDayState, type DayStateExtras } from '../lib/engine/day-state.ts';
import { yesterdayArmLoadOf } from '../lib/engine/arm-load.ts';
import { programArbiterSignals } from '../lib/engine/arbiter.ts';
import {
  audienceOf,
  dayPlan,
  decideToday,
  painSlotsOf,
  parseProgram,
  patternsOfProgramDay,
  pickPinned,
  programSignalsOf,
  variantCandidates,
  type ProgramPlan,
  type RecoveryReason,
  type TodayDecision,
} from '../lib/program/program.ts';
import {
  failedGates,
  gateResults,
  gateValueText,
  HEADLINES,
  isGateStage,
  oldFieldsSame,
  rosterChanges,
  type BaselineJson,
  type GateStage,
} from './training-baseline-gates.mts';
import { RECENT_DAYS } from '../lib/report/today-pick.ts';
import {
  ALWAYS_OWNED,
  SELECTABLE_EQUIPMENT,
  filterByEquipment,
} from '../lib/report/equipment.ts';
import { TRAINING_LEVEL_NAMES, filterByLevel } from '../lib/report/personalize.ts';
import {
  INTENSITY_CAP,
  intensityLevel,
  MAX_INTENSITY_LEVEL,
} from '../lib/exercise-meta.ts';
import {
  effortPctOf,
  effortToIntensity,
  outingLoadOf,
  shiftDateKey,
  type PitchLogLike,
} from '../lib/pitch-stats.ts';
import {
  HIGH_ARM_FATIGUE,
  HIGH_SORENESS,
  isShortSleep,
  LOW_CONDITION_THRESHOLD,
  nextOutingDays,
  SEVERE_ARM_FATIGUE,
  SEVERE_SORENESS,
  THROW_PLANS,
  type CheckinPartKey,
  type ThrowPlan,
} from '../lib/checkin.ts';
import {
  isArmPlyo,
  isHeavyLower,
  isHeavyUpperPush,
} from '../lib/engine/exercise-class.ts';
import {
  MODERATE_OUTING_MIN_LOAD,
  dayKindOf,
  type DayRule,
} from '../lib/engine/microcycle.ts';
import type { TrainingNoteLike } from '../lib/workout/effort.ts';

const startedAt = Date.now();

/* ------------------------------ 결과를 둘 곳 ------------------------------ */

/**
 * JSON 은 저장소 밖의 임시 폴더에 둔다 — 큰 파일이라 커밋할 것이 아니고, 어느 컴퓨터(노트북 · 김민)에서 돌려도 남의 홈
 * 경로를 만들지 않게 기계마다 제 임시 폴더를 쓴다. 전후를 견주려면 --out= 으로 따로 둔다.
 */
const DEFAULT_OUT = path.join(os.tmpdir(), 'bullpen-log', 'training-baseline.json');
const argOf = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const OUT_PATH = argOf('out') ?? DEFAULT_OUT;
/*
 * 전후 비교 · 단계 목표(2판 P5 도구 T0). 잘못 적은 단계 · 못 읽는 앞 JSON 은 숫자를 내기 전에 멈춘다 — 모르고 지나가면 '목표 통과'를
 * 잘못 믿는다. 앞 JSON 은 DB 를 읽기 전에 먼저 읽는다(틀린 경로면 20초를 기다리지 않게).
 */
const GATE_ARG = argOf('gate');
if (GATE_ARG != null && !isGateStage(GATE_ARG)) {
  throw new Error(`--gate=${GATE_ARG}: P4 · P5 · P6 중 하나여야 한다`);
}
const GATE_STAGE: GateStage | null = GATE_ARG;
const COMPARE_PATH = argOf('compare');
const compareBefore: BaselineJson | null = COMPARE_PATH
  ? (JSON.parse(readFileSync(COMPARE_PATH, 'utf8')) as BaselineJson)
  : null;

/* ------------------------------ 실제 운동 표 ------------------------------ */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
/* 자체 시험(scripts/training-selftest.mts)과 같은 조회 — 앱의 visibleExercises 와 같은 줄이 나온다 */
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
/*
 * 실제 투구 기록의 투구수 · 강도 · 종류(집계용). D2(체감 강도 0~100%) · D3(세게 던진 날 = 투구수 × 강도)의 문턱을 정할 때
 * 대본 숫자만으로는 모자라서, 실제 분포를 참고 표로 곁들인다. userId · date 는 '같은 사람의 같은 날' 기록을 합쳐 날 단위로
 * 세는 데만 쓰고(facts.ts outingByDay 가 날 단위다) 출력하지 않는다 — 이름 · 메모 같은 개인 정보는 읽지 않는다.
 */
const realLogs = await prisma.pitchLog.findMany({
  where: { pitchCount: { gt: 0 } },
  select: {
    userId: true,
    date: true,
    pitchCount: true,
    intensity: true,
    /* 체감 강도(%) — 2판 D2. 옛 줄은 null(세게 던진 날은 intensity × 10 으로 읽는다) */
    effortPct: true,
    sessionType: true,
  },
});
await prisma.$disconnect();

type Exercise = (typeof library)[number];
const byId = new Map<string, Exercise>(library.map((ex) => [ex.id, ex]));

/** '매우 높음'인가 — 이름이 아니라 단계 숫자로 본다(prescription.ts 와 같은 판단) */
const isVeryHigh = (ex: Exercise | undefined) =>
  ex != null && intensityLevel(ex.intensity) >= MAX_INTENSITY_LEVEL;

/*
 * 판정자(2판 P5 도구 T0) — 무거운 하체 · 팔 플라이오 · 무거운 상체 밀기는 P4 가 만든 공용 판정(lib/engine/exercise-class.ts)을 그대로
 * 쓴다. 지표가 앱과 다른 정의로 세면 '규칙은 맞는데 지표가 틀리는' 일이 생긴다(도구 갈래의 첫 탐침은 부위 꼬리표로 갈라 코어 · 보강을
 * 무거운 하체로 셌다 — 5/37 오탐). 판정 자체가 틀리는 것은 자체 시험 '[2판 P4] 운동 분류'의 좁은 판정이 따로 지킨다.
 *
 * '그 부위의 무거운 운동'(⑱ 뻐근 방향)만 여기서 따로 적는다 — 앱에 같은 이름의 판정이 없다. 강도 '높음' 이상이고 그 부위 꼬리표가
 * 곧바로 붙은 운동. 부위 표는 자체 시험 불변식 ②의 DIRECT_PARTS 와 같은 뜻이다('전신'은 넣지 않는다 — 메디신볼 던지기 · 코어에도 붙는다).
 */
const DIRECT_PARTS: Record<CheckinPartKey, readonly string[]> = {
  shoulder: ['어깨', '견갑'],
  elbow: ['팔꿈치'],
  wrist: ['손목·전완'],
  lowerBack: ['코어', '등'],
  lowerBody: ['고관절', '햄스트링·둔근', '종아리·발목'],
};
const isHeavyOnPart = (ex: Exercise, part: CheckinPartKey) =>
  intensityLevel(ex.intensity) >= INTENSITY_CAP.STRENGTH &&
  ex.bodyParts.some((b) => DIRECT_PARTS[part].includes(b));
/** 팔에 실리는 것(⑱ 팔 피로 방향 · 추가 묶음의 팔 피로 날) — 무거운 상체 밀기 또는 팔 플라이오 */
const isArmLoaded = (ex: Exercise) => isHeavyUpperPush(ex) || isArmPlyo(ex);
const classCounts = {
  heavyLower: library.filter(isHeavyLower).length,
  heavyUpperPush: library.filter(isHeavyUpperPush).length,
  armPlyo: library.filter(isArmPlyo).length,
  heavyOnShoulder: library.filter((ex) => isHeavyOnPart(ex, 'shoulder')).length,
  heavyOnLowerBody: library.filter((ex) => isHeavyOnPart(ex, 'lowerBody')).length,
};
/* 분류가 0 이면 그 분류를 쓰는 지표는 거저 '0 · 100%'가 된다 — 숫자를 내기 전에 멈춘다 */
for (const [name, count] of Object.entries(classCounts)) {
  if (count === 0)
    throw new Error(
      `판정자 ${name} 에 드는 운동이 라이브러리에 없다(지표가 빈 검사가 된다)`
    );
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** 메타 채움률 — 계열 · 난이도 · 강도(기본값 '중간'이 아닌 것) · 부위 · 세트/횟수 · 장비 */
const STRENGTH_OR_POWER = ['하체 스트렝스', '상체 스트렝스', '파워'];
const filledOf = (pool: Exercise[]) => ({
  total: pool.length,
  movementPattern: pool.filter((ex) => !!ex.movementPattern).length,
  difficulty: pool.filter((ex) => ex.difficulty != null).length,
  intensityNotDefault: pool.filter((ex) => ex.intensity !== '중간').length,
  bodyParts: pool.filter((ex) => ex.bodyParts.length > 0).length,
  setsAndReps: pool.filter(
    (ex) => ex.sets != null && (ex.reps != null || ex.holdSeconds != null)
  ).length,
  equipment: pool.filter((ex) => ex.equipment.length > 0).length,
});
const libraryStats = {
  total: library.length,
  byCategory: countBy(library, (ex) => ex.category),
  byIntensity: countBy(library, (ex) => ex.intensity),
  byDifficulty: countBy(library, (ex) => ex.difficulty ?? '(비어 있음)'),
  filled: filledOf(library),
  /* 계열은 스트렝스 · 파워에서만 뜻이 있다(theme.ts 가 그 카테고리에서만 겹침을 본다) */
  filledStrengthPower: filledOf(
    library.filter((ex) => STRENGTH_OR_POWER.includes(ex.category))
  ),
};

/* --------------------------------- 날짜 --------------------------------- */

/** 월요일부터 4주. 고정값이라 언제 돌려도 같은 결과다. */
const START_KEY = '2026-05-04';
const DAYS = 28;
/** 첫날부터 부하 지수 · 등판 여파가 있게 앞서 이만큼의 기록을 깔아 둔다 */
const PREHISTORY_DAYS = 14;
/** lib/report/gather.ts 의 ROTATION_LOOKBACK_DAYS · HISTORY_DAYS 와 같은 값 — DB 함수를 못 부르니 숫자를 옮긴다 */
const ROTATION_LOOKBACK_DAYS = 14;
const HISTORY_DAYS = 180;

const keyOf = (i: number) => shiftDateKey(START_KEY, i);
const dateOf = (i: number) => new Date(`${keyOf(i)}T09:00:00+09:00`);
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * 이름 → uuid 꼴 글자(8-4-4-4-12). 앱의 User.id 는 uuid 라 씨앗에 들어가는 글자 모양을 맞춘다 — 섞기(theme.ts 의 mix,
 * FNV-1a)가 긴 16진수 id 를 받았을 때 실제로 흩어지는지 재는 것이 ④ 의 뜻이다. FNV-1a 를 네 번 돌려 128비트를 만든다.
 */
function uuidOf(name: string): string {
  const hex: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = (0x811c9dc5 ^ round) >>> 0;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push(h.toString(16).padStart(8, '0'));
  }
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/* --------------------------------- 선수 --------------------------------- */

type Role = 'starter-weekly' | 'starter-biweekly' | 'reliever' | 'offseason';
type CheckinHabit = 'simple-daily' | 'detail-daily' | 'sometimes';
/** 숫자면 늘 그 값(같은 설정 쌍에서 쓴다) */
type ConditionPattern = 'high' | 'low' | 'swing' | number;
type DoneHabit = 'always' | 'sometimes' | 'never';
type Kit = 'bodyweight' | 'dumbbell' | 'gym';

type Player = {
  name: string;
  /**
   * 앱의 User.id 자리 — 섞기 씨앗 맨 앞에 들어간다(training-setup.ts, P1). 이름에서 결정적으로 만든 uuid 꼴이라 언제 돌려도
   * 같다. 같은 설정 쌍(④)의 두 사람은 id 가 다르고, 쌍둥이는 같은 id 를 받는다 — 그래야 '설정이 같아도 사람이 다르면 다른
   * 목록'과 '입력이 같으면 같은 목록'을 따로 잰다.
   */
  id: string;
  age: number;
  level: string;
  kit: Kit;
  goal: string;
  minutes: number;
  role: Role;
  checkin: CheckinHabit;
  condition: ConditionPattern;
  done: DoneHabit;
  /** 잔 느낌 — 안 주면 '보통' */
  sleep?: string;
  /*
   * 아래는 추가 묶음(cohorts.extra, 2판 P5 도구 T0)만 쓴다 — 기준 12명 · 같은 설정 쌍은 칸을 비워 둬 대본이 그대로다.
   */
  /** 던지는 날 대본 — 안 주면 역할의 대본(throwOn) */
  throws?: (i: number) => Throw | null;
  /** 등판 답을 적는 날인가 — 안 주면 체크인하는 날 모두 */
  answersOn?: (i: number) => boolean;
  /** 팔 피로(1~5) 대본 — 안 주면 armFatigueOn(경기 다음 날 3 · 그 밖 1) */
  armFatigue?: (i: number) => number;
  /** 운동 끝 힘듦(1~10) 대본 — 안 주면 BASE_EFFORT */
  effort?: (i: number) => number;
  /** 그날 '뻐근'이라 적는 부위 — 안 주면 없음 */
  stiffOn?: (i: number) => CheckinPartKey | null;
  /** 진행하는 근력 프로그램(lib/program 의 키 그대로) — i=0 에 1일차로 시작한다 */
  program?: string;
  /** 일정을 받으면 본운동 첫 칸을 날마다 뺀다(일정 화면의 빼기 — PlanSwap remove) */
  removesFirstMain?: boolean;
  /** 추가 묶음 표의 '무엇을 재나' 한 줄 */
  purpose?: string;
};

const ROLE_LABEL: Record<Role, string> = {
  'starter-weekly': '선발 주1회',
  'starter-biweekly': '선발 격주',
  reliever: '구원',
  offseason: '비시즌',
};
const CHECKIN_LABEL: Record<CheckinHabit, string> = {
  'simple-daily': '매일 간편',
  'detail-daily': '매일 상세',
  sometimes: '가끔',
};
const DONE_LABEL: Record<DoneHabit, string> = {
  always: '늘',
  sometimes: '가끔',
  never: '안 누름',
};
const KIT_LABEL: Record<Kit, string> = {
  bodyweight: '맨몸',
  dumbbell: '덤벨',
  gym: '헬스장',
};
const conditionLabel = (c: ConditionPattern) =>
  typeof c === 'number'
    ? `늘 ${c}`
    : c === 'high'
      ? '늘 높음'
      : c === 'low'
        ? '늘 낮음'
        : '들쭉날쭉';

/**
 * 가진 장비 — 앱이 User.ownedEquipment 에 저장하는 꼴 그대로(readOwnedEquipment · ownedEquipmentToSave: 늘 '맨몸'이 앞에).
 * '맨몸뿐'을 빈 목록으로 두면 안 된다 — filterByEquipment 는 빈 목록을 '아직 안 고른 사람'으로 보고 아무것도 안 걸러서,
 * 맨몸 선수가 바벨 · 케이블 운동까지 다 받는 시뮬레이션이 된다(첫 판의 실수).
 */
function ownedOf(kit: Kit): string[] {
  if (kit === 'bodyweight') return [ALWAYS_OWNED];
  if (kit === 'dumbbell') return [ALWAYS_OWNED, '덤벨', '밴드'];
  return [ALWAYS_OWNED, ...SELECTABLE_EQUIPMENT];
}

/**
 * 가상 선수 12명. 나이 14/15/16/17/22/28 · 경력 입문~상급 · 장비 셋 · 목표 셋 · 역할 넷 · 체크인 습관 셋 · 컨디션 셋 · 마침 습관
 * 셋을 섞었다. 한 축을 재는 선수가 둘 이상 있게 짰다 — 매일 상세 · 매일 간편 · 가끔 체크인하는 선발, 늘 낮은 컨디션 셋, 맨몸 셋.
 * 대본 1판(P0 ~ P2)은 상세만 등판 답을 적어 '답 하는 선발 셋 · 안 하는 선발 셋'이었다. 2판(P3, 2026-10-12)부터는 체크인하는 날이면
 * 모두 답한다(간편에 들어갔다) — 답을 안 적는 경우는 선수를 더하지 않고 ⑤ · ⑫ 의 변형(답만 지움)으로 잰다.
 */
const PLAYER_SPECS: Omit<Player, 'id'>[] = [
  {
    name: '선발A',
    age: 17,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'detail-daily',
    condition: 'high',
    done: 'always',
  },
  {
    name: '선발B',
    age: 22,
    level: '상급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'sometimes',
  },
  {
    name: '선발C',
    age: 16,
    level: '초급',
    kit: 'dumbbell',
    goal: '근력 향상',
    minutes: 45,
    role: 'starter-biweekly',
    checkin: 'detail-daily',
    condition: 'swing',
    done: 'never',
  },
  {
    name: '선발D',
    age: 28,
    level: '상급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 90,
    role: 'starter-biweekly',
    checkin: 'sometimes',
    condition: 'high',
    done: 'always',
  },
  {
    name: '구원A',
    age: 15,
    level: '입문',
    kit: 'bodyweight',
    goal: '컨디셔닝',
    minutes: 45,
    role: 'reliever',
    checkin: 'simple-daily',
    condition: 'swing',
    done: 'sometimes',
  },
  {
    name: '구원B',
    age: 22,
    level: '중급',
    kit: 'dumbbell',
    goal: '파워 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'detail-daily',
    condition: 'high',
    done: 'never',
  },
  {
    name: '구원C',
    age: 17,
    level: '초급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'sometimes',
    condition: 'low',
    done: 'always',
  },
  {
    name: '비시즌A',
    age: 14,
    level: '입문',
    kit: 'bodyweight',
    goal: '근력 향상',
    minutes: 45,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
  },
  {
    name: '비시즌B',
    age: 28,
    level: '중급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: 'low',
    done: 'sometimes',
  },
  {
    name: '비시즌C',
    age: 16,
    level: '입문',
    kit: 'dumbbell',
    goal: '컨디셔닝',
    minutes: 60,
    role: 'offseason',
    checkin: 'sometimes',
    condition: 'swing',
    done: 'never',
  },
  {
    name: '선발E',
    age: 22,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'low',
    done: 'always',
  },
  {
    name: '선발F',
    age: 22,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'detail-daily',
    condition: 'high',
    done: 'never',
  },
];
const PLAYERS: Player[] = PLAYER_SPECS.map((p) => ({ ...p, id: uuidOf(p.name) }));

for (const p of PLAYERS) {
  if (!minutesChoicesFor(p.goal).includes(p.minutes)) {
    throw new Error(`${p.name}: ${p.goal} 에서 고를 수 없는 시간 ${p.minutes}분`);
  }
}

/* --------------------------------- 대본 --------------------------------- */

/**
 * 대본의 투구 기록 한 줄 — 앱이 % 칩으로 받은 기록을 저장하는 꼴 그대로(2판 D2): effortPct 와 그것을 1~10 으로 내린
 * intensity(effortToIntensity)를 같이 둔다. 계산은 앱처럼 effortPctOf · intensityOf · outingLoadOf 로만 읽는다.
 */
type Throw = {
  pitchCount: number;
  intensity: number;
  effortPct: number;
  sessionType: string;
};

/** 체감 강도(%)로 기록 한 줄을 만든다 — intensity 는 앱이 저장할 때처럼 effortToIntensity(5% 단위 → 1~10) */
function thrown(pitchCount: number, effortPct: number, sessionType: string): Throw {
  return {
    pitchCount,
    intensity: effortToIntensity(effortPct),
    effortPct,
    sessionType,
  };
}

/**
 * 역할별 던지는 날. 날 번호(i)만으로 정해진다(앞선 기록 14일 포함). 체감 강도는 대본 1판의 강도(1~10) × 10 이라 세게 던진
 * 날 · 부하 지수가 1판과 같은 값으로 읽힌다(effortPctOf = intensity × 10, intensityOf = effortPct ÷ 10).
 *   선발 주1회  i ≡ 2 (mod 7) 경기 70~90구 90~100% · +2일 불펜 30구 70% · +4일 캐치볼 25구 50%
 *   선발 격주   i ≡ 2 (mod 14) 경기 85구 100% · +3일 불펜 35구 70% · +6일 불펜 30구 70% · +9일 캐치볼 25구 50%
 *   구원        사흘에 한 번 경기 20구와 35구를 번갈아(90%) — 세게 던진 날 문턱(경기 100% 로 2,000 · 3,500 ↔ HARD_OUTING_MIN_LOAD 2,700) 양쪽에 걸치게 · 다음 날 캐치볼 20구 50%
 *   비시즌      안 던진다(최근 투구 기록 없음 → 투구 부하로 거르지 않는 길)
 */
function throwOn(role: Role, i: number): Throw | null {
  if (role === 'starter-weekly') {
    const r = mod(i - 2, 7);
    if (r === 0) {
      const g = mod(Math.round((i - 2) / 7), 6);
      return thrown([70, 80, 90, 85, 75, 88][g], g % 2 === 0 ? 100 : 90, '경기');
    }
    if (r === 2) return thrown(30, 70, '불펜');
    if (r === 4) return thrown(25, 50, '캐치볼');
    return null;
  }
  if (role === 'starter-biweekly') {
    const r = mod(i - 2, 14);
    if (r === 0) return thrown(85, 100, '경기');
    if (r === 3) return thrown(35, 70, '불펜');
    if (r === 6) return thrown(30, 70, '불펜');
    if (r === 9) return thrown(25, 50, '캐치볼');
    return null;
  }
  if (role === 'reliever') {
    const r = mod(i, 3);
    if (r === 0) {
      const odd = mod(Math.round(i / 3), 2) === 1;
      return thrown(odd ? 35 : 20, 90, '경기');
    }
    if (r === 1) return thrown(20, 50, '캐치볼');
    return null;
  }
  return null;
}

/** 컨디션 — 늘 높음 8 · 늘 낮음 3(회복 문턱 LOW_CONDITION_THRESHOLD 아래) · 들쭉날쭉은 이레 주기로 3~9 */
function conditionOn(pattern: ConditionPattern, i: number): number {
  if (typeof pattern === 'number') return pattern;
  if (pattern === 'high') return 8;
  if (pattern === 'low') return 3;
  return [8, 6, 3, 7, 9, 5, 4][mod(i, 7)];
}

/**
 * 다음 경기까지 이만큼 앞을 본다 — 대본에서 경기 사이가 가장 긴 것이 선발 격주의 14일이라, 시즌 중인 선수는 늘 다음 경기를
 * 찾고 비시즌만 못 찾는다('없음').
 */
const OUTING_LOOKAHEAD_DAYS = 14;

/** 그날 던지는 것 — 대본 하나(역할의 대본이든 추가 묶음의 제 대본이든) */
type ThrowScript = (i: number) => Throw | null;
const roleScript =
  (role: Role): ThrowScript =>
  (i) =>
    throwOn(role, i);
/** 선수의 대본 — 추가 묶음은 제 대본(throws), 기준 12명 · 같은 설정 쌍은 역할의 대본 */
const scriptOf = (p: Player): ThrowScript => p.throws ?? roleScript(p.role);

/** 오늘부터 다음 경기까지 남은 날(오늘 경기면 0) — 대본 하나로. 앞을 봐도 경기가 없으면 null */
function nextGameBy(script: ThrowScript, i: number): number | null {
  for (let d = 0; d <= OUTING_LOOKAHEAD_DAYS; d++) {
    if (script(i + d)?.sessionType === '경기') return d;
  }
  return null;
}
/** 오늘부터 다음 경기까지 남은 날(오늘 경기면 0). 앞을 봐도 경기가 없으면 null */
function daysToNextGame(role: Role, i: number): number | null {
  return nextGameBy(roleScript(role), i);
}

/**
 * 체크인의 던지는 일정 답(2판 D1 — 답 여섯, 간편 체크인에 있다). 대본의 경기 날짜를 보고 사람이 고를 답을 고른다:
 *   경기 날 '오늘 등판' · 그 전날 '내일 등판' · 불펜 날 '오늘 불펜' · 다음 경기가 2~3일 뒤 '2~3일 뒤' · 4일 이상 뒤 '4일 이상 뒤' ·
 *   다음 경기가 없음(비시즌) '없음'
 * 불펜이 다음 경기 2~3일 전이어도 '오늘 불펜' — 칩 하나만 고르니 오늘 할 일을 먼저 적는다(lib/checkin.ts 의 차례와 같다).
 * 구원은 '오늘 등판 · 2~3일 뒤 · 내일 등판'만, 선발은 넷 다(불펜 날 포함) 나온다.
 */
function answerBy(script: ThrowScript, i: number): ThrowPlan {
  const next = nextGameBy(script, i);
  if (next === 0) return '오늘 등판';
  if (next === 1) return '내일 등판';
  if (script(i)?.sessionType === '불펜') return '오늘 불펜';
  if (next == null) return '없음';
  return next <= 3 ? '2~3일 뒤' : '4일 이상 뒤';
}

/*
 * 답이 대본과 맞나 — 답을 날로 읽는 앱의 규칙(lib/checkin.ts nextOutingDays)으로 되읽어 다음 경기 날이 그 범위 안인지 본다.
 * '오늘 불펜' · '없음'은 범위가 없다(불펜은 날을 안 정하고, 없음은 다음 경기가 없다). 대본이나 앱 규칙이 바뀌어 어긋나면
 * 숫자를 내기 전에 멈춘다 — 틀린 답으로 잰 기준선은 다음 단계를 잘못 이끈다. 추가 묶음의 제 대본도 같은 검사를 거친다(아래).
 */
function checkAnswers(label: string, script: ThrowScript) {
  for (let i = -PREHISTORY_DAYS; i < DAYS; i++) {
    const answer = answerBy(script, i);
    const next = nextGameBy(script, i);
    const range = nextOutingDays(answer);
    const ok =
      range == null
        ? answer === '오늘 불펜' || (answer === '없음' && next == null)
        : next != null && next >= range.min && (range.max == null || next <= range.max);
    if (!ok)
      throw new Error(
        `${label} ${keyOf(i)}: 답 '${answer}' 이 다음 경기 ${next}일 뒤와 안 맞는다`
      );
  }
}
for (const role of Object.keys(ROLE_LABEL) as Role[]) {
  checkAnswers(ROLE_LABEL[role], roleScript(role));
}

/*
 * 팔 피로 · 운동 끝 힘듦 대본(2판 P5 도구 T0) — 앱이 이미 받는 두 칸이라 기준 묶음에도 넣는다(체크인하는 모든 날에 팔 피로, 마친 날마다
 * 힘듦 — 팔 피로는 2026-10-12 부터 간편 체크인에 있다). 값은 지금 규칙에 안 걸리게 골랐다:
 *   팔 피로   경기 다음 날 3('조금' — HIGH_ARM_FATIGUE 4 밑), 그 밖 1. P5 의 점수가 3 을 읽으면 그때 목록이 움직인다.
 *   힘듦      늘 BASE_EFFORT(6). 날마다 같아 급증(7일 평균 − 28일 평균 ≥ 2)이 안 생긴다 — 급증은 추가 묶음의 힘듦 선수와 ⑮ 변형으로만 잰다.
 */
const BASE_EFFORT = 6;
const AFTER_GAME_ARM_FATIGUE = 3;
const USUAL_ARM_FATIGUE = 1;
function armFatigueOn(p: Player, i: number): number {
  if (p.armFatigue) return p.armFatigue(i);
  return scriptOf(p)(i - 1)?.sessionType === '경기'
    ? AFTER_GAME_ARM_FATIGUE
    : USUAL_ARM_FATIGUE;
}
const effortOn = (p: Player, i: number) => p.effort?.(i) ?? BASE_EFFORT;

type DayLog = { day: number; log: PitchLogLike };
type DayCheckin = { day: number; checkin: CheckinLike };

function logsFor(p: Player): DayLog[] {
  const out: DayLog[] = [];
  const script = scriptOf(p);
  for (let i = -PREHISTORY_DAYS; i < DAYS; i++) {
    const t = script(i);
    if (!t) continue;
    out.push({
      day: i,
      log: { date: keyOf(i), ...t, maxVelocity: null, avgVelocity: null },
    });
  }
  return out;
}

function checkinsFor(p: Player): DayCheckin[] {
  const out: DayCheckin[] = [];
  const script = scriptOf(p);
  for (let i = -PREHISTORY_DAYS; i < DAYS; i++) {
    if (p.checkin === 'sometimes' && mod(i, 3) !== 0) continue;
    const detail = p.checkin === 'detail-daily';
    const stiff = p.stiffOn?.(i) ?? null;
    out.push({
      day: i,
      checkin: {
        date: keyOf(i),
        condition: conditionOn(p.condition, i),
        sleep: p.sleep ?? '보통',
        shoulder: '정상',
        elbow: '정상',
        wrist: '정상',
        lowerBack: '정상',
        lowerBody: '정상',
        ...(stiff ? { [stiff]: '뻐근' } : {}),
        preferredParts: [],
        preferredWorkout: null,
        /*
         * 던지는 일정은 체크인하는 날이면 늘 적는다 — 2판 D1(2026-10-12)로 간편 체크인에 들어가 전신 컨디션 바로 밑에 있다.
         * 대본 1판은 상세만 적어 '간편 · 가끔 = 답 없는 선발'이었다. 답을 안 적는 사람은 선수를 더하지 않고 ⑤ · ⑫ 의 변형
         * (답만 지움 · 기록만 지움)으로 잰다 — 분모 336 을 P0 ~ P2 표와 나란히 두려고. 추가 묶음의 '가끔 답하는' 선수만 예외(answersOn).
         */
        throwPlan: p.answersOn && !p.answersOn(i) ? null : answerBy(script, i),
        /* 팔 피로 — 간편 체크인 칸이라 모든 체크인에(2판 P5 도구 T0, 값은 armFatigueOn 주석) */
        armFatigue: armFatigueOn(p, i),
        /* 잔 시간 · 근육통은 상세 습관만 칸을 만든다 — 간편에서는 고르지 않은 날과 같은 모양 */
        ...(detail ? { sleepHours: 7, soreness: 2 } : {}),
      },
    });
  }
  return out;
}

/** 마침을 누르는 날인가 — 늘 · 사흘에 한 번 · 안 누름 */
function marksDoneOn(habit: DoneHabit, i: number): boolean {
  if (habit === 'always') return true;
  if (habit === 'sometimes') return mod(i, 3) === 0;
  return false;
}

/* ------------------------------ 하루 만들기 ------------------------------ */

type DoneEntry = { id: string; category: string };
type State = {
  logs: DayLog[];
  checkins: DayCheckin[];
  /** 날짜 키 → 그날 마친 운동 */
  done: Map<string, DoneEntry[]>;
  /** 날짜 키 → 그날 저장된 일정(앱의 DailyTrainingSetup.plan — 하루의 첫 만들기, 변형은 저장 안 함) */
  planned: Map<string, DailyPlan>;
  /** 마친 날마다 남긴 운동 끝 힘듦(앱의 DailyTrainingNote — 2판 P2 의 '마침' 뒤 칩) */
  notes: TrainingNoteLike[];
  /**
   * 진행 중인 근력 프로그램(추가 묶음만) — 앱의 UserTrainingProgram 줄의 nextDay · lastDoneDate · pinned(고정 운동). pinned 는 runExtra 가
   * 처음에 한 번 고른다(앱은 시작 화면에서 고정한다) — 고르기 점수의 '내일 프로그램 동작'(2판 P5-j)이 그 운동의 동작 열쇠로 읽는다.
   */
  program?: {
    key: string;
    nextDay: number;
    lastDoneDate: string | null;
    pinned?: Partial<Record<string, string>>;
  };
};

const newState = (p: Player): State => ({
  logs: logsFor(p),
  checkins: checkinsFor(p),
  done: new Map(),
  planned: new Map(),
  notes: [],
  ...(p.program ? { program: { key: p.program, nextDay: 1, lastDoneDate: null } } : {}),
});

/**
 * gather.ts 의 recentExerciseIds · exerciseSessionsAgo · lastStrengthDates 와 같은 뜻.
 * 모두 '오늘 아침'(오늘 마친 것은 아직 없다)에 읽는다.
 */
function historyOf(st: State, i: number) {
  const todayKey = keyOf(i);
  const recentIds = new Set<string>();
  for (let d = i - RECENT_DAYS; d < i; d++) {
    for (const e of st.done.get(keyOf(d)) ?? []) recentIds.add(e.id);
  }

  /* 세션 = 운동을 하나라도 마친 날(암케어 뺌 — gather.ts 와 같다). 최근 순으로 번호 */
  const sinceKey = keyOf(i - HISTORY_DAYS);
  const sessionDays = [...st.done.entries()]
    .filter(
      ([key, entries]) =>
        key >= sinceKey &&
        key <= todayKey &&
        entries.some((e) => e.category !== '암케어')
    )
    .map(([key]) => key)
    .sort()
    .reverse();
  const order = new Map(sessionDays.map((key, at) => [key, at]));
  const sessionsAgo = new Map<string, number>();
  for (const key of sessionDays) {
    for (const e of st.done.get(key) ?? []) {
      if (e.category === '암케어' || sessionsAgo.has(e.id)) continue;
      sessionsAgo.set(e.id, order.get(key)!);
    }
  }

  /* 하체 · 상체 마지막 날 — gather.ts 의 lastStrengthDates 와 같은 규칙(daily-plan.ts 의 strengthDatesFrom): 완료 기록이 먼저, 없는 날은 저장된 일정 */
  /*
   * 2주 동안 마친 동작 계열(2판 P5-j) — gather.ts lastStrengthDates 의 patternsDone14d 와 같은 함수 · 같은 줄(완료 기록, 계열은 운동 표에서).
   * 대본에는 재활 체크가 없어 거를 것이 없다.
   */
  const done: { date: string; category: string; movementPattern: string | null }[] = [];
  const planned: { date: string; plan: unknown }[] = [];
  for (let d = i - ROTATION_LOOKBACK_DAYS; d < i; d++) {
    const key = keyOf(d);
    for (const e of st.done.get(key) ?? [])
      done.push({
        date: key,
        category: e.category,
        movementPattern: byId.get(e.id)?.movementPattern ?? null,
      });
    const plan = st.planned.get(key);
    if (plan) planned.push({ date: key, plan });
  }
  const dates = strengthDatesFrom({ done, planned, todayKey });
  return {
    recentIds,
    sessionsAgo,
    lastLowerKey: dates.lower,
    lastUpperKey: dates.upper,
    patternsDone14d: patternsDoneFrom({ done, todayKey }),
  };
}

/** 한 가지만 바꿔 다시 만들 때 쓰는 손잡이 */
type Variant = {
  /** rotationSeed 뒤에 붙일 글자 */
  seedSuffix?: string;
  age?: number;
  /** 오늘 체크인만 바꾼다 */
  patchCheckin?: (c: CheckinLike) => CheckinLike;
  /** 어제 투구 기록만 바꾼다 */
  patchYesterday?: (log: PitchLogLike) => PitchLogLike;
  /**
   * 체크인의 등판 답을 모두 지운다(오늘 것만이 아니라 어제 것도 — 어제 '내일 등판'이 오늘로 이월되니 오늘 것만 지우면 '답을 안
   * 적는 사람'이 안 된다). ⑤ · ⑫ 가 대본 1판의 '답 없는 선발'을 같은 날 같은 기록으로 다시 잰다.
   */
  clearThrowPlans?: boolean;
  /** 어제 투구 기록을 뺀다 — 등판 답은 적고 기록은 안 남긴 날(⑫) */
  dropYesterdayLog?: boolean;
  /**
   * 운동 끝 힘듦(DailyTrainingNote) — 주면 대본의 힘듦(State.notes) 대신 이것을 buildFacts 에 넘긴다. ⑮ 가 '최근 운동이 힘들었던
   * 사람'을 이 변형으로 잰다(2판 P4 커밋 E). P5 도구 T0 전에는 대본에 힘듦이 없어 이 변형만 칸을 만들었다.
   */
  trainingNotes?: TrainingNoteLike[];
  /**
   * 저녁 — 오늘 던진 기록까지 넣은 facts(㉒ 가 아침에 만든 일정의 지문과 견준다). 앱이면 투구를 남긴 뒤 일정 화면을 다시 연 때다.
   */
  evening?: boolean;
  /**
   * 홈 캘린더 일정(2판 P4 커밋 G) — 주면(빈 목록이어도) buildFacts 에 넘겨 다음 등판 짐작의 두 칸(달력 · 같은 요일 경기 날짜)이 생긴다. 대본의
   * 기본 날은 넘기지 않는다(그래서 12명 · 336 일정은 커밋 G 전과 글자까지 같다) — ⑯ 이 '달력에 경기' · '같은 요일 짐작' 변형으로 잰다.
   */
  calendarEvents?: CalendarEventLike[];
};

let buildCalls = 0;

/** buildDay 가 그날 아침에 만드는 facts — 날 종류(⑮)를 같은 facts 로 읽으려고 떼어 둔다 */
function factsFor(p: Player, i: number, st: State, v: Variant = {}) {
  /* 아침에 만든다 — 오늘 던진 것은 아직 기록에 없다(저녁 변형만 오늘 것까지) */
  const logs = st.logs
    .filter(
      (l) =>
        (v.evening ? l.day <= i : l.day < i) && !(v.dropYesterdayLog && l.day === i - 1)
    )
    .map((l) =>
      l.day === i - 1 && v.patchYesterday ? v.patchYesterday(l.log) : l.log
    );
  const checkins = st.checkins
    .filter((c) => c.day <= i)
    .map((c) => (c.day === i && v.patchCheckin ? v.patchCheckin(c.checkin) : c.checkin))
    .map((c) => (v.clearThrowPlans ? { ...c, throwPlan: null } : c));
  return buildFacts({
    nickname: p.name,
    age: v.age ?? p.age,
    heightCm: 180,
    trainingLevel: p.level,
    /* 가입 문진의 추정 부하 — 자체 시험과 같은 값. 없으면 기록 28일 전까지 부하 지수가 안 나온다 */
    baselineDailyLoad: 100,
    rehab: null,
    today: dateOf(i),
    logs,
    checkins,
    memos: [],
    /*
     * 힘듦은 앱(gather.ts)처럼 늘 넘긴다 — 오늘 줄은 아직 없다(마침 뒤에 남으니까). P5 도구 T0 전에는 변형만 넘겨, 그때와 facts 가
     * condition.trainingEffort 칸 하나만 다르다(급증 깃발은 그대로 false — 대본 힘듦이 늘 같다).
     */
    trainingNotes: v.trainingNotes ?? st.notes.filter((n) => n.date < keyOf(i)),
    ...(v.calendarEvents ? { calendarEvents: v.calendarEvents } : {}),
  });
}

/** 오늘 상태 한 장의 바깥 재료 — 진행 중인 프로그램(추가 묶음만). 앱은 today-data · program/load.ts 가 같은 꼴로 넘긴다 */
function extrasOf(st: State): DayStateExtras {
  if (!st.program) return {};
  const plan = parseProgram(st.program.key);
  return {
    program: {
      key: st.program.key,
      nextDay: st.program.nextDay,
      totalDays: plan?.totalDays ?? null,
      lastDoneDate: st.program.lastDoneDate,
    },
  };
}

/**
 * 하루 만들기의 재료(어댑터 하나, 2판 P5 도구 T0) — 앱이 buildDailyPlan 앞에서 모으는 것을 한 곳에서. 단계마다 일정에 넘길 인자가
 * 늘면(P5 의 오늘 상태 · 세트 조절 · 바꿔서 뺀 운동, P6 의 프로그램 약속) 여기와 buildDay 두 곳만 고친다. 앱과의 짝:
 *   facts       lib/report/gather.ts 의 buildFacts(logs · checkins · trainingNotes · 캘린더) — factsFor
 *   plan        buildPitchPlan(facts) — app/actions/training-setup.ts generateTodayPlan 이 같은 facts 로
 *   state       buildDayState({ facts, plan, extras }) — today-data · program/load.ts 의 오늘 상태 한 장(extras.program 은 추가 묶음만)
 *   owned       User.ownedEquipment(앱이 저장하는 꼴 — ownedOf)
 *   history     gather.ts 의 recentExerciseIds · exerciseSessionsAgo · lastStrengthDates — historyOf
 *   seed        '사용자 id|날짜'(training-setup.ts, 하루의 첫 만들기)
 *   swappedOut  lib/report/plan-swaps.ts swappedOutCounts(저장된 일정, 60일) — 그날 뺀 기록을 남긴 선수(추가 묶음의 바꾸기 선수)만 값이 있다
 * state 는 P5-d 부터 buildDailyPlan 이 받는다(양 조절 — body 의 평소 대비 컨디션 · 짧은 밤 · 근육통, training-setup.ts 와 같은 짝).
 *   score       고르기 점수의 재료(2판 P5-j, training-setup.ts 의 score 와 같은 칸 · 같은 규칙) — 프로그램 다음 일차의 동작 열쇠(진행 중인
 *               프로그램은 state.commitments.program — extrasOf 로 장에 얹힌다), 2주 계열(historyOf), 60일 뺀 횟수(swappedOut), 오늘 뺀 운동
 *               (그날 저장된 일정 — 하루의 첫 만들기라 아침에는 늘 비어 있다), 즐겨찾기(대본에 없다 — 빈 집합).
 */
function inputsOf(p: Player, i: number, st: State, v: Variant = {}) {
  const todayKey = keyOf(i);
  const facts = factsFor(p, i, st, v);
  const plan = buildPitchPlan(facts);
  const state = buildDayState({ facts, plan, extras: extrasOf(st) });
  const swappedOut = swappedOutCounts({
    plans: [...st.planned].map(([date, saved]) => ({ date, plan: saved })),
    sessions: [],
    sinceKey: keyOf(i - SWAP_LOOKBACK_DAYS),
    untilKey: todayKey,
  });
  const history = historyOf(st, i);
  const programPlan = st.program ? parseProgram(st.program.key) : null;
  const pinned = st.program?.pinned ?? {};
  const score: PlanScoreInput = {
    ...(st.program
      ? {
          programPatterns: patternsOfProgramDay(
            programPlan,
            st.program.nextDay,
            (v) => {
              const id = pinned[v];
              return id ? byId.get(id) : undefined;
            }
          ),
        }
      : {}),
    patternsDone14d: history.patternsDone14d,
    swappedOut,
    swappedOutToday: swappedOutOf(st.planned.get(todayKey)),
    favoriteIds: new Set<string>(),
  };
  return {
    facts,
    plan,
    state,
    owned: ownedOf(p.kit),
    history,
    seed: [p.id, todayKey].join('|') + (v.seedSuffix ?? ''),
    swappedOut,
    score,
  };
}

/** 앱(createDailySetup)이 buildDailyPlan 을 부르는 인자 그대로. 멈춘 날(통증 등)은 null */
function buildDay(p: Player, i: number, st: State, v: Variant = {}): DailyPlan | null {
  buildCalls++;
  const { facts, plan, state, owned, history, seed, score } = inputsOf(p, i, st, v);
  const built = buildDailyPlan({
    user: { ownedEquipment: owned, trainingLevel: p.level },
    facts,
    plan,
    library,
    /* 폼이 넘기는 꼴([맨몸, ...오늘 고른 것], training-setup.ts) — 가진 것을 다 골랐다고 보니 owned 와 같다 */
    availableToday: owned,
    requestedMinutes: p.minutes,
    trainingGoal: p.goal,
    trainingFocus: null,
    recentIds: history.recentIds,
    sessionsAgo: history.sessionsAgo,
    /* 하루의 첫 '만들기'는 저장된 일정이 없어 씨앗이 '사용자 id|날짜'다(training-setup.ts, P1 부터 id 가 맨 앞) */
    rotationSeed: seed,
    lastLowerKey: history.lastLowerKey,
    lastUpperKey: history.lastUpperKey,
    /*
     * 직접 고르기(위 trainingGoal · override 와 같은 길)라 힘듦 급증이면 본운동 세트 −1(P5-e) — training-setup.ts 가 '직접 고르기'에서
     * 넘기는 짝 그대로. '그래도 고른 대로'는 안 고른다(override 와 같이 경고를 넘기지 않는 사람).
     */
    reduceForEffort: true,
    overrideEffort: false,
    override: false,
    caution: [],
    /*
     * 오늘 상태 한 장 — training-setup.ts 가 gatherFactsAndPlan 의 state 를 넘기는 것과 같은 짝(양 조절이 body · 힘듦 급증을 읽는다,
     * P5-d · e)
     */
    state,
    /* 고르기 점수의 재료 — training-setup.ts 의 score 와 같은 칸(2판 P5-j) */
    score,
  });
  return isHalted(built) ? null : built;
}

/**
 * 일정 한 칸의 세트(어댑터, 2판 P5 도구 T0) — 앱이 그 운동을 보이고 시작할 때 쓰는 처방(lib/report/volume.ts planPrescription —
 * 목표 처방 위에 그날 양 조절, 일정 화면 · 운동 시작 · 기록이 같은 함수, 2판 P5-b 처방 한 길). 일정에 세트 조절(plan.volume)이 실리면
 * 여기도 저절로 따라간다 — ⑱ 의 세트 방향 검사가 이것을 읽는다.
 */
function setsOf(plan: DailyPlan, pick: DailyPlan['picks'][number]): number {
  const ex = byId.get(pick.exerciseId);
  if (!ex) return 0;
  return planPrescription(ex, plan).sets ?? 0;
}
/** 본운동 세트 합 — 멈춘 날(null)은 0 */
const mainSetsOf = (plan: DailyPlan | null) =>
  plan
    ? plan.picks
        .filter((k) => k.slot === 'main')
        .reduce((s, k) => s + setsOf(plan, k), 0)
    : 0;
/**
 * 양 조절(plan.volume, 2판 P5-d)로 줄인 세트 합 — 조절을 뺀 같은 일정의 세트 합에서 뺀 값(모든 칸). 조절이 없는 날은 null.
 * 같은 setsOf(처방 한 길)를 두 번 읽는다 — 앱이 줄이지 않았으면 냈을 값과 줄인 값.
 */
const volumeSetsCutOf = (plan: DailyPlan | null): number | null => {
  if (!plan || plan.volume == null) return null;
  const plain: DailyPlan = { ...plan, volume: undefined };
  return plan.picks.reduce((s, k) => s + setsOf(plain, k) - setsOf(plan, k), 0);
};
/** 그날 일정에서 판정에 드는 운동 수 — 멈춘 날(null)은 0 */
const countPicks = (plan: DailyPlan | null, isIt: (ex: Exercise) => boolean) =>
  plan
    ? plan.picks.filter((k) => {
        const ex = byId.get(k.exerciseId);
        return ex != null && isIt(ex);
      }).length
    : 0;

const idsOf = (plan: DailyPlan) =>
  plan.picks
    .map((pick) => pick.exerciseId)
    .sort()
    .join(',');
const sameList = (a: DailyPlan | null, b: DailyPlan | null) =>
  a != null && b != null && idsOf(a) === idsOf(b);
const differs = (a: DailyPlan | null, b: DailyPlan | null) => !sameList(a, b);

/* ----------------------------- 체크인 바꾸기 ----------------------------- */

type CheckinVariant = 'condition' | 'part' | 'soreness';
const CHECKIN_VARIANTS: CheckinVariant[] = ['condition', 'part', 'soreness'];
const CHECKIN_VARIANT_LABEL: Record<CheckinVariant, string> = {
  condition: '컨디션 ±2',
  part: '뻐근한 부위 하나 추가',
  soreness: '근육통 변경',
};

/** 컨디션은 1~10 안에서 2 옮기고, 뻐근은 어깨에(이미 뻐근이면 팔꿈치), 근육통은 '많이'(4) 로(이미 4 이상이면 2 로) */
function patchCheckinBy(kind: CheckinVariant): (c: CheckinLike) => CheckinLike {
  if (kind === 'condition') {
    return (c) => ({
      ...c,
      condition: c.condition >= 6 ? c.condition - 2 : c.condition + 2,
    });
  }
  if (kind === 'part') {
    return (c) =>
      c.shoulder === '뻐근' ? { ...c, elbow: '뻐근' } : { ...c, shoulder: '뻐근' };
  }
  return (c) => ({ ...c, soreness: (c.soreness ?? 0) >= 4 ? 2 : 4 });
}

/**
 * ③ 어제 투구 기록만 바꾸는 세 가지. 따로 잰다 — 경기 기록은 체감과 상관없이 100% 로 보므로(pitch-stats.ts outingLoadOf ·
 * stressFactor) '90% → 60%'는 경기 날에 설계상 아무것도 안 바꾼다. 셋을 하나로 섞으면 그 사실이 0% 속에 묻힌다.
 *   double     투구수 두 배(구원 20구 경기 2,000 이 문턱 2,700 을 넘는다)
 *   intensity  체감 90% 이상 → 60%(어제 체감이 90% 이상인 날만 분모 — 이 대본에서는 경기 날뿐이라 0% 가 정답이다)
 *   lighter    경기 → 불펜 · 60%(어제가 경기인 날만 분모 — 같은 공을 '경기가 아닌 날 60%'로 적으면 무엇이 바뀌나. 경기 100% 특례가
 *              빠져 구원 35구 3,500 이 2,100 으로 문턱 밑이 된다 — 종류가 아니라 부하로 가르는 규칙의 증거)
 * 앱이 저장하는 꼴처럼 effortPct 와 intensity 를 같이 바꾼다 — intensity 만 바꾸면 계산(effortPctOf · intensityOf)이 effortPct 를
 * 먼저 읽어 아무것도 안 바뀐다(대본 2판에서 한 번 그렇게 0% 가 나왔다).
 */
type PitchVariant = 'double' | 'intensity' | 'lighter';
const PITCH_VARIANTS: PitchVariant[] = ['double', 'intensity', 'lighter'];
const PITCH_VARIANT_LABEL: Record<PitchVariant, string> = {
  double: '투구수 ×2',
  intensity: '체감 90% 이상 → 60%',
  lighter: '경기 → 불펜 · 60%',
};
/** 바꾼 체감 강도(%) — 대본 1판의 '강도 6' 과 같은 값 */
const LIGHTER_EFFORT_PCT = 60;
function pitchVariantApplies(kind: PitchVariant, t: Throw): boolean {
  if (kind === 'double') return true;
  /* 체감 90% 이상(옛 강도 9~10 과 같은 날) */
  if (kind === 'intensity') return effortPctOf(t) >= NEAR_MAX_EFFORT_PCT;
  return t.sessionType === '경기';
}
function patchYesterdayBy(kind: PitchVariant): (log: PitchLogLike) => PitchLogLike {
  if (kind === 'double') return (log) => ({ ...log, pitchCount: log.pitchCount * 2 });
  const lighter = {
    effortPct: LIGHTER_EFFORT_PCT,
    intensity: effortToIntensity(LIGHTER_EFFORT_PCT),
  };
  if (kind === 'intensity') return (log) => ({ ...log, ...lighter });
  return (log) => ({ ...log, sessionType: '불펜', ...lighter });
}

/**
 * 지금 코드의 '세게 던진 날' — 투구수 × 체감 강도(%) ≥ HARD_OUTING_MIN_LOAD(2,700), 경기는 100%(facts.ts · pitch-stats.ts
 * outingLoadOf 그대로, 2판 D2). 대본은 하루 한 번만 던져 기록 하나 = 그날. 이 대본의 던지는 날(불펜 30 · 35구 7, 캐치볼 20 · 25구 5,
 * 경기 20구 · 35구 · 70~90구)은 옛 규칙(경기 또는 강도 9~10 · 30구)과 같은 날만 세게 던진 날이다 — 전후 수치를 견줄 수 있다.
 * 앱(facts.ts isHardOuting)은 P3 검토부터 옛 규칙의 날(nearMaxPitches ≥ 30 — 85% × 30 같은 날)도 세게로 보는데, 이 대본에는
 * 그런 날(경기가 아닌 85% 이상 30구)이 없어 곱만 봐도 같은 값이다.
 */
function isHardThrow(t: Throw | null): boolean {
  if (!t) return false;
  return outingLoadOf(t) >= HARD_OUTING_MIN_LOAD;
}

/* ------------------------- 오늘 상태 바꾸기(⑰ · ⑱) ------------------------- */

/*
 * 오늘 상태만 바꾸는 변형(2판 P5 도구 T0) — ② 의 체크인 변형(CHECKIN_VARIANTS · checkinChanged)은 P0 부터의 JSON 모양이라 건드리지 않고
 * 여기 따로 둔다. 체크인 있는 날마다 그날 하나만 바꿔 다시 만든다.
 *   stiff   뻐근한 부위 하나 — 하체 날은 하체, 그 밖은 어깨(이미 뻐근이면 팔꿈치). ⑰ · ⑱(그 부위의 무거운 운동이 늘지 않음)
 *   outing  등판까지 남은 날 — '4일 이상 뒤' ↔ '2~3일 뒤', '없음' → '2~3일 뒤'. ⑰
 *   arm3    팔 피로 3('조금' — HIGH 4 밑이라 안전 규칙은 안 걸린다). 이미 3 이상이면 안 바꾼다. ⑰ · ⑱(팔에 실리는 운동이 늘지 않음)
 *   bad     컨디션 −3 + 잠 '부족' — 컨디션이 회복 문턱 위에 남는 날만(회복이 되면 세트를 견줄 것이 없다). ⑱(본운동 세트가 늘지 않음)
 *   sore    근육통 '많이'(HIGH_SORENESS) — 이미 그 이상이면 안 바꾼다. ⑱(본운동 세트가 늘지 않음)
 * ⑰ 은 테마가 그대로인 짝만 분모다 — 테마가 바뀌면 목록이 바뀌는 것이 당연해 '점수가 상태를 읽나'를 못 잰다(테마 바뀐 짝은 따로 센다).
 */
type StateVariant = 'stiff' | 'outing' | 'arm3' | 'bad' | 'sore';
const SAME_THEME_VARIANTS: StateVariant[] = ['stiff', 'outing', 'arm3'];
const STATE_VARIANT_LABEL: Record<StateVariant, string> = {
  stiff: '뻐근한 부위 하나(하체 날은 하체, 그 밖은 어깨)',
  outing: "등판까지 남은 날('4일 이상 뒤' ↔ '2~3일 뒤', '없음' → '2~3일 뒤')",
  arm3: '팔 피로 3(조금)',
  bad: "컨디션 −3 + 잠 '부족'",
  sore: "근육통 '많이'",
};
const OUTING_SWAP: Partial<Record<string, ThrowPlan>> = {
  '4일 이상 뒤': '2~3일 뒤',
  '2~3일 뒤': '4일 이상 뒤',
  없음: '2~3일 뒤',
};
/** 뻐근 변형의 부위 — 하체 날은 하체, 그 밖은 어깨, 이미 뻐근이면 팔꿈치 */
function stiffPartFor(theme: ThemeKey, c: CheckinLike): CheckinPartKey {
  const part: CheckinPartKey = theme === 'lower' ? 'lowerBody' : 'shoulder';
  return c[part] === '뻐근' ? 'elbow' : part;
}
/** 그날 체크인에 그 변형이 해당하면 고칠 함수, 아니면 null */
function stateVariantPatch(
  kind: StateVariant,
  theme: ThemeKey,
  c: CheckinLike
): ((c: CheckinLike) => CheckinLike) | null {
  if (kind === 'stiff') {
    const part = stiffPartFor(theme, c);
    return (x) => ({ ...x, [part]: '뻐근' });
  }
  if (kind === 'outing') {
    const to = OUTING_SWAP[c.throwPlan ?? '없음'];
    return to ? (x) => ({ ...x, throwPlan: to }) : null;
  }
  if (kind === 'arm3') {
    return (c.armFatigue ?? 0) < AFTER_GAME_ARM_FATIGUE
      ? (x) => ({ ...x, armFatigue: AFTER_GAME_ARM_FATIGUE })
      : null;
  }
  if (kind === 'bad') {
    return c.condition - 3 > LOW_CONDITION_THRESHOLD
      ? (x) => ({ ...x, condition: x.condition - 3, sleep: '부족' })
      : null;
  }
  return (c.soreness ?? 0) < HIGH_SORENESS
    ? (x) => ({ ...x, soreness: HIGH_SORENESS })
    : null;
}
/** 체크인 고침 변형(㉒) — 일정을 만든 뒤 컨디션을 회복 문턱 아래(3)로 고친 사람 */
const EDITED_CONDITION = 3;

/* ------------------------------ 시뮬레이션 ------------------------------ */

type DayRecord = {
  date: string;
  theme: ThemeKey;
  label: string;
  ids: string[];
  mainCount: number;
  veryHigh: boolean;
  hasCheckin: boolean;
  seedChanged: boolean;
  remakeChanged: boolean;
  checkinChanged: Partial<Record<CheckinVariant | 'one', boolean>>;
  /** 변형마다 테마 · 목록이 바뀌었나. 그 변형이 어제 기록에 해당하지 않으면 칸이 없다 */
  pitchChanged: Partial<Record<PitchVariant, { theme: boolean; list: boolean }>>;
  /** 오늘 아침 체크인의 컨디션(없으면 null) — 경기 날 근력을 셀 때 낮은 컨디션 때문에 회복이 된 날을 가른다 */
  condition: number | null;
  /** 오늘 체크인의 등판 답(체크인 없는 날 null) — 답별 테마 표에 쓴다 */
  throwPlan: string | null;
  /**
   * ⑤ 경기 날 아침(체크인 있음)에 등판 답을 모두 지우고 다시 만든 테마 — '답을 안 적는 사용자'. null 은 멈춘 날(통증 등).
   * 경기 날 아침이 아니거나 체크인이 없으면 칸이 없다.
   */
  answerClearedTheme?: ThemeKey | null;
  /**
   * ⑫ 어제 경기 기록이 있고 어제 체크인이 '오늘 등판'이던 날 — 등판 답을 모두 지운 변형(기록만 있음)과 어제 기록만 뺀 변형
   * (답만 있음)의 테마. 그런 날이 아니면 칸이 없다.
   */
  afterGame?: { cleared: ThemeKey | null; dropped: ThemeKey | null };
  /**
   * ⑬ 팔 피로 '심함' 변형(2판 P4 커밋 C) — 체크인 있는 날 오늘 체크인에 팔 피로 5 만 얹어 다시 만든 일정의 무거운 상체 밀기 · 팔
   * 플라이오 수(lib/engine/exercise-class.ts 판정)와, 같은 날 원래 일정의 수. 체크인이 없는 날은 칸이 없다. 대본의 체크인에는 팔 피로가
   * 없어 원래 일정은 그대로다 — 이 변형이 '팔이 심하게 지친 아침'을 대신 잰다. 멈춘 날(변형에서만 생길 수 있다)은 null.
   */
  armSevere?: {
    pushBase: number;
    plyoBase: number;
    push: number | null;
    plyo: number | null;
  };
  /**
   * ⑭ 그날 일정의 무거운 하체 수(lib/engine/exercise-class.ts isHeavyLower — 2판 P4 커밋 D)와 대본상 다음 경기까지 남은 날(오늘 경기면 0,
   * 앞 14일에 경기가 없으면 null). 등판 창(안전 거르기 2-2)이 실제로 무거운 하체를 빼는지 대본의 진짜 날짜로 잰다.
   */
  heavyLower: number;
  nextGame: number | null;
  /**
   * ⑮ 그날 아침의 날 종류(lib/engine/microcycle.ts dayKindOf — 2판 P4 커밋 E)와 구원 '짧게'가 걸렸는가(회복 날은 시간을 안 줄인다).
   */
  dayRule: DayRule;
  shorten: boolean;
  /**
   * ⑮ 힘듦 급증 변형 — 체크인 있는 날 '최근 운동이 힘들었던 사람'(7일 안 9 셋 · 28일 안 5 넷)으로 다시 만든 테마. 어제 Σ 투구수 × 체감
   * 강도가 중간(1,350~2,699)인 날만 회복으로 바뀌어야 하고(R2), 그 밖의 날은 그대로여야 한다. 체크인 없는 날은 칸이 없다.
   */
  spikeTheme?: ThemeKey | null;
  /**
   * ⑯ 다음 등판 짐작(2판 P4 커밋 G) — 체크인 있고 앞 14일에 경기가 있는 날, 등판 답을 모두 지운 세 변형: 그대로(cleared — 답을 안 적는 사람),
   * 달력에 다음 경기 하나('리그 경기')를 적음(calendar), 달력은 비우고 같은 요일 짐작만 켬(estimate). 테마와 무거운 하체 수, 같은 요일
   * 짐작이 선 날수(안 섰으면 null). 멈춘 변형은 테마 · 수가 null. 그런 날이 아니면 칸이 없다.
   */
  calendarGuess?: {
    cleared: ThemeKey | null;
    calendar: ThemeKey | null;
    estimate: ThemeKey | null;
    heavyCleared: number | null;
    heavyCalendar: number | null;
    heavyEstimate: number | null;
    estimateDays: number | null;
  };
  age15vs22Differs: boolean;
  age14vs22Differs: boolean;
  /** 그날 일정의 본운동 세트 합(setsOf — ⑱ 의 바닥값) */
  mainSets: number;
  /** 양 조절(2판 P5-d)로 줄인 세트 합(volumeSetsCutOf) — 세트를 줄인 조절이 실린 날만 칸이 있다 */
  volumeSetsCut?: number;
  /** 세트는 그대로 두고 무게만 멈추는 조절(setDelta 0 · intensityStep −1, 2판 P5 검토)이 실린 날 — JSON 에는 안 싣고 metrics.volume.holdOnly 로 센다 */
  volumeHoldOnly?: true;
  /**
   * ⑰ · ⑱ 오늘 상태만 바꾼 변형(2판 P5 도구 T0) — 체크인 있는 날만, 그 변형이 해당하는 날만 칸이 있다.
   *   sameTheme     테마가 그대로인가(멈춘 변형은 false)        listChanged   목록(운동 id 집합)이 바뀌었나
   *   sameExcluded  안전 거르기의 뺀 규칙 · 수(excluded)가 같은가 — 같으면 후보가 같아 목록 차이는 고르는 차례(점수) 몫이다
   *   before/after  그 변형이 재는 수 — stiff 그 부위의 무거운 운동, arm3 팔에 실리는 운동, bad · sore 본운동 세트(outing 은 없음)
   */
  stateVariants?: Partial<
    Record<
      StateVariant,
      {
        halted: boolean;
        sameTheme: boolean;
        listChanged: boolean;
        sameExcluded: boolean;
        before?: number;
        after?: number;
        /** bad · sore 만 — 바꾼 뒤 일정에 양 조절(세트 −1)이 실렸나(2판 P5-d) */
        volumed?: boolean;
      }
    >
  >;
  /**
   * ㉒ 상태 바뀜(2판 P5 도구 T0) — 체크인 있는 날, 아침에 만든 일정의 지문(lib/report/plan-fingerprint.ts fingerprintOf)과 저녁(오늘 던진
   * 기록까지) · 체크인 고침(컨디션 3) facts 를 견준 바뀐 항목(stateChangesOf 의 key), 그 facts 로 다시 만들면 테마나 목록이 달라지나(material).
   * 오늘 안 던진 날의 저녁은 아침과 같아 keys [] · material false.
   */
  stateAlert?: {
    evening: { keys: string[]; material: boolean };
    edit: { keys: string[]; material: boolean };
  };
  /**
   * ⑲ 까닭 없는 회복 — 회복 날인데 테마를 회복으로 보내는 까닭(통증 · '회복' 고름 · 날 종류 회복 · 부하 위험 · 컨디션 ≤ 문턱 · 근육통 심함)이
   * 하나도 없는 날. 점수 · 양 조절이 몰래 회복을 늘리면 여기 잡힌다(지금은 0 이어야 한다).
   */
  unexplainedRecovery: boolean;
  /** 어제 던진 것(대본) */
  yesterday: Throw | null;
  /** 오늘 던질 것(대본) — 경기 당일 아침을 찾는 데 쓴다 */
  today: Throw | null;
};

type PlayerResult = {
  player: Player;
  days: DayRecord[];
  halted: number;
};

const results: PlayerResult[] = [];

/**
 * ⑰ · ⑱ 오늘 상태 변형 하나 — 그날 체크인에 해당하면 다시 만들어 견준 칸, 아니면 undefined. 멈춘 변형은 일정이 없어 수가 0 이다(늘지 않음).
 */
function stateVariantOf(
  kind: StateVariant,
  p: Player,
  i: number,
  st: State,
  base: DailyPlan,
  today: CheckinLike
): NonNullable<DayRecord['stateVariants']>[StateVariant] {
  const patch = stateVariantPatch(kind, base.theme.key, today);
  if (!patch) return undefined;
  const after = buildDay(p, i, st, { patchCheckin: patch });
  const measure =
    kind === 'stiff'
      ? (plan: DailyPlan | null) => {
          const part = stiffPartFor(base.theme.key, today);
          return countPicks(plan, (ex) => isHeavyOnPart(ex, part));
        }
      : kind === 'arm3'
        ? (plan: DailyPlan | null) => countPicks(plan, isArmLoaded)
        : kind === 'bad' || kind === 'sore'
          ? mainSetsOf
          : null;
  return {
    halted: after == null,
    sameTheme: after != null && after.theme.key === base.theme.key,
    listChanged: differs(base, after),
    sameExcluded:
      after != null && JSON.stringify(after.excluded) === JSON.stringify(base.excluded),
    ...(measure ? { before: measure(base), after: measure(after) } : {}),
    /* 세트를 줄인 짝만 — 2판 P5 검토부터 세트는 그대로 두고 무게만 멈추는 조절(setDelta 0)도 실린다(volume.ts volumeForDay) */
    ...(kind === 'bad' || kind === 'sore'
      ? { volumed: after?.volume != null && after.volume.setDelta !== 0 }
      : {}),
  };
}

/**
 * ㉒ 아침 지문과 다른 facts 를 견준다 — 바뀐 항목(stateChangesOf, 앱의 today-data.ts 와 같은 함수)과 그 facts 로 다시 만들면 테마나
 * 목록이 달라지나(씨앗은 아침과 같다 — 다시 만들기의 씨앗까지 바꾸면 늘 달라진다).
 */
function alertOf(
  p: Player,
  i: number,
  st: State,
  base: DailyPlan,
  morningFingerprint: ReturnType<typeof fingerprintOf>,
  v: Variant
): { keys: string[]; material: boolean } {
  const facts = factsFor(p, i, st, v);
  const keys = stateChangesOf({ fingerprint: morningFingerprint }, facts).map(
    (c) => c.key
  );
  const again = buildDay(p, i, st, v);
  return {
    keys,
    material:
      again == null || again.theme.key !== base.theme.key || differs(base, again),
  };
}

for (const p of PLAYERS) {
  const st = newState(p);
  const days: DayRecord[] = [];
  let halted = 0;

  for (let i = 0; i < DAYS; i++) {
    const base = buildDay(p, i, st);
    if (!base) {
      halted++;
      continue;
    }
    const hasCheckin = st.checkins.some((c) => c.day === i);
    const yesterday = throwOn(p.role, i - 1);

    /* ① 씨앗에 글자 하나 · ①' 다시 만들기(사용자 id|날짜|지금 목록 — training-setup.ts 가 하는 것) */
    const seedChanged = differs(base, buildDay(p, i, st, { seedSuffix: 'x' }));
    const remakeChanged = differs(
      base,
      buildDay(p, i, st, {
        seedSuffix: '|' + base.picks.map((k) => k.exerciseId).join('|'),
      })
    );

    /* ② 체크인만 — 세 가지 각각과, 그중 하나(날마다 돌아가며) */
    const checkinChanged: DayRecord['checkinChanged'] = {};
    if (hasCheckin) {
      for (const kind of CHECKIN_VARIANTS) {
        checkinChanged[kind] = differs(
          base,
          buildDay(p, i, st, { patchCheckin: patchCheckinBy(kind) })
        );
      }
      checkinChanged.one = checkinChanged[CHECKIN_VARIANTS[mod(i, 3)]];
    }

    /* ③ 어제 투구 기록만 — 해당하는 변형만 */
    const pitchChanged: DayRecord['pitchChanged'] = {};
    if (yesterday) {
      for (const kind of PITCH_VARIANTS) {
        if (!pitchVariantApplies(kind, yesterday)) continue;
        const changed = buildDay(p, i, st, { patchYesterday: patchYesterdayBy(kind) });
        pitchChanged[kind] = {
          theme: changed == null || changed.theme.key !== base.theme.key,
          list: differs(base, changed),
        };
      }
    }

    /* ⑨ 나이만 — 15↔22(지금 문턱 15 라 같을 것), 14↔22(성장기 규칙이 실제로 갈리는 쌍) */
    const at15 = buildDay(p, i, st, { age: 15 });
    const at22 = buildDay(p, i, st, { age: 22 });
    const at14 = buildDay(p, i, st, { age: 14 });

    /* ⑤ 경기 날 아침(체크인 있음) — 같은 아침에 등판 답만 모두 지우면(답을 안 적는 사람) 무엇이 나오나 */
    const today = throwOn(p.role, i);
    const themeOf = (plan: DailyPlan | null) => plan?.theme.key ?? null;
    const answerClearedTheme =
      today?.sessionType === '경기' && hasCheckin
        ? themeOf(buildDay(p, i, st, { clearThrowPlans: true }))
        : undefined;

    /*
     * ⑫ 경기 다음 날 — 어제 '오늘 등판'이라 답하고 경기 기록도 남긴 날. 답을 지운 변형은 '기록이 다음 날을 정하나',
     * 어제 기록만 뺀 변형은 '답만으로 다음 날을 아나'(엇갈림 표 C6 과 같은 알려진 빈틈 — D3 · P4 가 부하와 답으로 가른다).
     */
    const yesterdayPlan =
      st.checkins.find((c) => c.day === i - 1)?.checkin.throwPlan ?? null;
    const afterGame =
      yesterday?.sessionType === '경기' && yesterdayPlan === '오늘 등판'
        ? {
            cleared: themeOf(buildDay(p, i, st, { clearThrowPlans: true })),
            dropped: themeOf(buildDay(p, i, st, { dropYesterdayLog: true })),
          }
        : undefined;

    /* ⑬ 팔 피로 '심함' — 체크인 있는 날 그 체크인에 팔 피로 5 만 얹은 변형(2판 P4 커밋 C) */
    const armCount = (plan: DailyPlan, isIt: (ex: Exercise) => boolean) =>
      plan.picks.filter((k) => {
        const ex = byId.get(k.exerciseId);
        return ex != null && isIt(ex);
      }).length;
    const severe = hasCheckin
      ? buildDay(p, i, st, {
          patchCheckin: (c) => ({ ...c, armFatigue: SEVERE_ARM_FATIGUE }),
        })
      : null;
    const armSevere = hasCheckin
      ? {
          pushBase: armCount(base, isHeavyUpperPush),
          plyoBase: armCount(base, isArmPlyo),
          push: severe ? armCount(severe, isHeavyUpperPush) : null,
          plyo: severe ? armCount(severe, isArmPlyo) : null,
        }
      : undefined;

    /*
     * ⑮ 날 종류(2판 P4 커밋 E) — 그날 아침 facts 로 읽은 규칙, 그리고 체크인 있는 날 힘듦 급증 변형의 테마. 힘듦 줄은 그날 기준 1 · 2 · 4일
     * 전 9, 9 · 12 · 16 · 20일 전 5 — 앱(gather.ts)처럼 오늘 줄은 없다.
     */
    const dk = dayKindOf(factsFor(p, i, st));
    const spikeNotes: TrainingNoteLike[] = [
      ...[1, 2, 4].map((d) => ({ date: keyOf(i - d), intensity: 9 })),
      ...[9, 12, 16, 20].map((d) => ({ date: keyOf(i - d), intensity: 5 })),
    ];
    const spikeTheme = hasCheckin
      ? themeOf(buildDay(p, i, st, { trainingNotes: spikeNotes }))
      : undefined;

    /*
     * ⑯ 다음 등판 짐작(2판 P4 커밋 G) — 체크인 있고 앞 14일에 경기가 있는 날, 등판 답을 모두 지운 사람(답을 안 적는 사람)에게 달력에 다음
     * 경기 하나를 적어 주면 · 같은 요일 짐작만 켜면 무엇이 나오나. 짐작은 가볍게 하는 쪽에만 — D0 · D−1 은 근력이 보조로, D−2~3 은 무거운
     * 하체가 빠지고, 회복은 늘지 않으며, D−4 이상은 그대로여야 한다. 같은 요일 짐작은 대본 앞 14일 기록(PREHISTORY_DAYS)과 그 뒤 기록으로
     * 선다 — 같은 요일에 경기가 이어지는 선수에게만.
     */
    const nextGameDays = daysToNextGame(p.role, i);
    let calendarGuess: DayRecord['calendarGuess'];
    if (hasCheckin && nextGameDays != null) {
      const heavyOf = (plan: DailyPlan | null) =>
        plan
          ? plan.picks.filter((k) => {
              const ex = byId.get(k.exerciseId);
              return ex != null && isHeavyLower(ex);
            }).length
          : null;
      const cleared = buildDay(p, i, st, { clearThrowPlans: true });
      const withCalendar = buildDay(p, i, st, {
        clearThrowPlans: true,
        calendarEvents: [{ date: keyOf(i + nextGameDays), title: '리그 경기' }],
      });
      const estimateVariant: Variant = { clearThrowPlans: true, calendarEvents: [] };
      const withEstimate = buildDay(p, i, st, estimateVariant);
      const guess = dayKindOf(factsFor(p, i, st, estimateVariant)).outing.guess;
      calendarGuess = {
        cleared: themeOf(cleared),
        calendar: themeOf(withCalendar),
        estimate: themeOf(withEstimate),
        heavyCleared: heavyOf(cleared),
        heavyCalendar: heavyOf(withCalendar),
        heavyEstimate: heavyOf(withEstimate),
        estimateDays: guess?.source === 'estimate' ? guess.days : null,
      };
    }

    /*
     * ⑰ · ⑱ 오늘 상태만 바꾼 변형 · ㉒ 상태 바뀜(2판 P5 도구 T0) — 체크인 있는 날만(앱이 만드는 날). 저장 일정 · 마침 기록은 아침 일정 그대로다.
     */
    const todayCheckin = st.checkins.find((c) => c.day === i)?.checkin ?? null;
    let stateVariants: DayRecord['stateVariants'];
    let stateAlert: DayRecord['stateAlert'];
    if (todayCheckin) {
      stateVariants = {};
      for (const kind of [...SAME_THEME_VARIANTS, 'bad', 'sore'] as StateVariant[]) {
        const row = stateVariantOf(kind, p, i, st, base, todayCheckin);
        if (row) stateVariants[kind] = row;
      }
      const morningFingerprint = fingerprintOf(factsFor(p, i, st));
      stateAlert = {
        /* 오늘 안 던진 날의 저녁은 아침과 같은 facts — 다시 만들지 않는다 */
        evening: today
          ? alertOf(p, i, st, base, morningFingerprint, { evening: true })
          : { keys: [], material: false },
        edit: alertOf(p, i, st, base, morningFingerprint, {
          patchCheckin: (c) => ({ ...c, condition: EDITED_CONDITION }),
        }),
      };
    }

    /* ⑲ 까닭 없는 회복 — 테마를 회복으로 보내는 까닭(theme.ts decideTheme 의 차례)이 하나도 없는 회복 날 */
    const morning = factsFor(p, i, st);
    const morningToday = morning.condition.today;
    const unexplainedRecovery =
      base.theme.key === 'recovery' &&
      painRecoveryReason(morning, buildPitchPlan(morning)) == null &&
      morningToday?.preferredWorkout !== '회복' &&
      dk.rank !== 'recovery' &&
      morning.load.zone !== 'danger' &&
      !(morningToday != null && morningToday.condition <= LOW_CONDITION_THRESHOLD) &&
      !(morningToday?.soreness != null && morningToday.soreness >= SEVERE_SORENESS);

    const ids = base.picks.map((k) => k.exerciseId);
    days.push({
      date: keyOf(i),
      theme: base.theme.key,
      label: base.theme.label,
      ids,
      mainCount: base.picks.filter((k) => k.slot === 'main').length,
      veryHigh: ids.some((id) => isVeryHigh(byId.get(id))),
      hasCheckin,
      seedChanged,
      remakeChanged,
      checkinChanged,
      pitchChanged,
      condition: st.checkins.find((c) => c.day === i)?.checkin.condition ?? null,
      throwPlan: st.checkins.find((c) => c.day === i)?.checkin.throwPlan ?? null,
      ...(answerClearedTheme !== undefined ? { answerClearedTheme } : {}),
      ...(afterGame ? { afterGame } : {}),
      ...(armSevere ? { armSevere } : {}),
      heavyLower: ids.filter((id) => {
        const ex = byId.get(id);
        return ex != null && isHeavyLower(ex);
      }).length,
      nextGame: daysToNextGame(p.role, i),
      dayRule: dk.rule,
      shorten: dk.shorten && base.theme.key !== 'recovery',
      ...(spikeTheme !== undefined ? { spikeTheme } : {}),
      ...(calendarGuess ? { calendarGuess } : {}),
      age15vs22Differs: differs(at15, at22),
      age14vs22Differs: differs(at14, at22),
      mainSets: mainSetsOf(base),
      ...(base.volume != null && base.volume.setDelta !== 0
        ? { volumeSetsCut: volumeSetsCutOf(base) ?? 0 }
        : {}),
      ...(base.volume?.setDelta === 0 ? { volumeHoldOnly: true as const } : {}),
      ...(stateVariants ? { stateVariants } : {}),
      ...(stateAlert ? { stateAlert } : {}),
      unexplainedRecovery,
      yesterday,
      today,
    });

    /* 저장 — 앱은 만든 일정을 그날 DailyTrainingSetup.plan 에 둔다(번갈아 가기의 계획 기록, P1) */
    st.planned.set(keyOf(i), base);
    /* 마침 — 그날 목록을 통째로 마친 것으로 적는다(앱은 운동마다 UserExerciseLog 가 남는다) */
    if (marksDoneOn(p.done, i)) {
      st.done.set(
        keyOf(i),
        ids.map((id) => ({ id, category: byId.get(id)?.category ?? '' }))
      );
      /* 마친 날의 힘듦 칩(2판 P2) — 대본은 늘 같은 값(effortOn) */
      st.notes.push({ date: keyOf(i), intensity: effortOn(p, i) });
    }
  }
  results.push({ player: p, days, halted });
}

/* ------------------------- ④ 같은 설정 새 사용자 쌍 ------------------------- */

/**
 * 경력 · 장비 · 목표 · 시간이 같고 기록이 하나도 없는 새 사용자 둘. 12명 안에는 기록 없는 같은 설정 쌍이 없어 따로 여섯 쌍을
 * 둔다. 두 사람은 앱이 목록을 가르는 데 쓰지 않는 것만 다르다 — 이름 · 나이(22/24, 둘 다 성인) · 컨디션(7/8, 둘 다 문턱 위) ·
 * 잔 느낌. 같은 입력을 똑같이 넣은 쌍(쌍둥이)도 같이 재서 도구 자체가 결정적인지 본다.
 */
const PAIR_SETTINGS: { level: string; kit: Kit; goal: string; minutes: number }[] = [
  { level: '입문', kit: 'bodyweight', goal: '근력 향상', minutes: 45 },
  { level: '초급', kit: 'dumbbell', goal: '근력 향상', minutes: 60 },
  { level: '중급', kit: 'gym', goal: '근력 향상', minutes: 60 },
  { level: '중급', kit: 'gym', goal: '파워 향상', minutes: 75 },
  { level: '상급', kit: 'gym', goal: '파워 향상', minutes: 90 },
  { level: '초급', kit: 'dumbbell', goal: '컨디셔닝', minutes: 45 },
];

function newUser(
  name: string,
  s: (typeof PAIR_SETTINGS)[number],
  who: { age: number; condition: number; sleep: string },
  /** id 를 만들 이름 — 쌍둥이는 원본의 이름을 넘겨 같은 id 를 받는다 */
  idName = name
): Player {
  return {
    name,
    id: uuidOf(idName),
    ...s,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: who.condition,
    sleep: who.sleep,
    done: 'never',
    age: who.age,
  };
}

const pairRows: { setting: string; same: number; twinSame: number; days: number }[] =
  [];
for (const [n, s] of PAIR_SETTINGS.entries()) {
  const a = newUser(`쌍${n + 1}A`, s, { age: 22, condition: 7, sleep: '보통' });
  const b = newUser(`쌍${n + 1}B`, s, { age: 24, condition: 8, sleep: '충분' });
  const twin = newUser(
    `쌍${n + 1}A'`,
    s,
    { age: 22, condition: 7, sleep: '보통' },
    `쌍${n + 1}A`
  );
  const [sa, sb, stw] = [newState(a), newState(b), newState(twin)];
  let same = 0;
  let twinSame = 0;
  for (let i = 0; i < DAYS; i++) {
    /* 마침을 안 누르는 새 사용자라 번갈아 가기는 저장된 일정(계획 기록)으로만 돈다 — 그날 만든 것을 저장해 둔다 */
    const keep = (st: State, built: DailyPlan | null) => {
      if (built) st.planned.set(keyOf(i), built);
      return built;
    };
    const pa = keep(sa, buildDay(a, i, sa));
    if (sameList(pa, keep(sb, buildDay(b, i, sb)))) same++;
    if (sameList(pa, keep(stw, buildDay(twin, i, stw)))) twinSame++;
  }
  pairRows.push({
    setting: `${s.level} · ${KIT_LABEL[s.kit]} · ${s.goal} · ${s.minutes}분`,
    same,
    twinSame,
    days: DAYS,
  });
}

/* ------------------------- 추가 묶음(2판 P5 도구 T0) ------------------------- */

/**
 * 기준 12명으로 못 재는 것을 따로 잰다 — 분모를 따로 두고(cohorts.extra) ①~⑯ 에는 섞지 않는다. 2026-05-04 는 월요일이라 i ≡ 1 화 ·
 * 2 수 · 5 토 · 6 일이다.
 *   프로그램 넷   ⑳ 프로그램 하는 날의 매일 일정 · ㉑ 하체 48시간 — lib/program 의 실제 키, 앱의 판정 길(program/load.ts)을 순수 함수로
 *   팔피로D       팔 피로 5 · 4 가 이어지는 실제 날(경기 다음 날 어깨 뻐근) — ⑬ 의 변형이 아닌 진짜 대본
 *   힘듦E         3주차 내내 힘듦 9(평소 3) — 구원이라 중간 부하 다음 날이 있어 날 종류 R2 가 실제로 걸린다. 날마다 마치니 급증 문턱(7일 평균 −
 *                 28일 평균 ≥ 2)이 넷째 날부터 선다(평소 5 · 월~목 9 로는 28일 평균이 같이 올라 끝내 안 섰다)
 *   바꾸기G       날마다 본운동 첫 칸을 뺀다 — ⑲ 두 번 넘게 뺀 운동이 다시 뽑히나(P5 의 점수가 낮출 몫)
 *   불펜C · 연전B · 달력A   경기가 아닌데 센 불펜(60구 × 75%) · 이틀 연속 등판 · 비로 하루 밀린 주말 선발(답은 사흘에 한 번)
 */
const weekday = (i: number) => mod(i, 7);
const onDays =
  (map: Partial<Record<number, Throw>>): ThrowScript =>
  (i) =>
    map[weekday(i)] ?? null;
const EXTRA_SPECS: Omit<Player, 'id'>[] = [
  {
    name: '프로그램A',
    purpose: "근력 프로그램 '531'(주 3) · 선발 주1회",
    age: 22,
    level: '상급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    program: '531',
  },
  {
    name: '프로그램B',
    purpose: "근력 프로그램 'stronglifts-5x5'(주 3) · 구원(사흘마다)",
    age: 24,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    program: 'stronglifts-5x5',
  },
  {
    name: '프로그램C',
    purpose: "근력 프로그램 'french-contrast'(주 3) · 비시즌",
    age: 28,
    level: '상급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    program: 'french-contrast',
  },
  {
    name: '프로그램D',
    purpose: "근력 프로그램 'ws4sb:2'(주 2) · 선발 격주",
    age: 26,
    level: '상급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'starter-biweekly',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    program: 'ws4sb:2',
  },
  {
    name: '팔피로D',
    purpose:
      '팔 피로가 이어지는 날(경기 다음 날 5 · 이틀 뒤 4, 다음 날 어깨 뻐근) · 수 · 토 구원 30구 × 90%',
    age: 19,
    level: '초급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    throws: onDays({ 2: thrown(30, 90, '경기'), 5: thrown(30, 90, '경기') }),
    armFatigue: (i) =>
      weekday(i - 1) === 2 || weekday(i - 1) === 5
        ? SEVERE_ARM_FATIGUE
        : weekday(i - 2) === 2 || weekday(i - 2) === 5
          ? HIGH_ARM_FATIGUE
          : 2,
    stiffOn: (i) => (weekday(i - 1) === 2 || weekday(i - 1) === 5 ? 'shoulder' : null),
  },
  {
    name: '힘듦E',
    purpose: '운동 힘듦 급증(평소 3, 3주차 9) · 구원(사흘마다)',
    age: 26,
    level: '상급',
    kit: 'gym',
    goal: '파워 향상',
    minutes: 75,
    role: 'reliever',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    effort: (i) => (i >= 14 && i <= 20 ? 9 : 3),
  },
  {
    name: '바꾸기G',
    purpose: '날마다 본운동 첫 칸을 뺌(일정 화면의 빼기) · 비시즌',
    age: 22,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'offseason',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    removesFirstMain: true,
  },
  {
    name: '불펜C',
    purpose: '경기가 아닌데 센 불펜(화 60구 × 75% = 4,500) · 토 경기 70구',
    age: 23,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    throws: onDays({ 1: thrown(60, 75, '불펜'), 5: thrown(70, 100, '경기') }),
  },
  {
    name: '연전B',
    purpose: '이틀 연속 등판(토 · 일 25구 × 95% — 하루씩은 문턱 밑)',
    age: 20,
    level: '중급',
    kit: 'dumbbell',
    goal: '파워 향상',
    minutes: 60,
    role: 'reliever',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'sometimes',
    throws: onDays({ 5: thrown(25, 95, '경기'), 6: thrown(25, 95, '경기') }),
  },
  {
    name: '달력A',
    purpose: '토요일 선발 80구(3주차는 비로 일요일) · 등판 답은 사흘에 한 번',
    age: 22,
    level: '중급',
    kit: 'gym',
    goal: '근력 향상',
    minutes: 60,
    role: 'starter-weekly',
    checkin: 'simple-daily',
    condition: 'high',
    done: 'always',
    /* 3주차(i 14~20)만 토(19) → 일(20) — 같은 요일 짐작이 그 주에 틀린다 */
    throws: (i) =>
      (i >= 14 && i <= 20 ? i === 20 : weekday(i) === 5)
        ? thrown(80, 95, '경기')
        : null,
    answersOn: (i) => mod(i, 3) === 0,
  },
];
const EXTRA_PLAYERS: Player[] = EXTRA_SPECS.map((p) => ({ ...p, id: uuidOf(p.name) }));
for (const p of EXTRA_PLAYERS) {
  if (!minutesChoicesFor(p.goal).includes(p.minutes))
    throw new Error(`${p.name}: ${p.goal} 에서 고를 수 없는 시간 ${p.minutes}분`);
  if (p.throws) checkAnswers(p.name, p.throws);
  if (p.program != null && parseProgram(p.program) == null)
    throw new Error(
      `${p.name}: 모르는 프로그램 키 '${p.program}'(lib/program 의 키가 바뀌었다)`
    );
}

type ProgramDayResult = {
  decision: TodayDecision;
  /** 그날 하는 운동 id(하는 날만 — 뺀 칸 · 대체 반영) */
  ids: string[];
  /** 큰 하체 칸(스쿼트 · 힌지)을 하는가 — 가볍게여도 하체에 무게가 실린다(㉑) */
  bigLower: boolean;
};

/**
 * 근력 프로그램의 오늘 — 앱(lib/program/load.ts buildProgramDay)의 판정 길을 순수 함수로 그대로 밟는다: 던지는 신호(programSignalsOf ·
 * yesterdayArmLoadOf), 세게 던진 날은 오늘 상태 한 장, 회복 까닭 · 부하 · 근육통 · 잠, 대체할 칸(painSlotsOf — 부위 규칙만 거친 후보),
 * 중재 신호(2판 P6-2 — lib/engine/arbiter.ts programArbiterSignals: 팔 · 하체 예산 · 오늘 세게 던진 날 · '회복' 고름, 앱과 같은 함수).
 * 아침이라 오늘 투구 종류는 없다. 다른 방식으로 이미 운동했는지(otherWorkoutStarted)와 '그래도 할래요'(override)는 늘 false.
 * 하는 날 목록은 load.ts 처럼 뺀 칸 · 팔을 아끼는 날 뺀 변형을 건너뛰고, 대체 칸은 같은 변형의 안전한 다른 운동(없으면 건너뜀)으로.
 */
function programDayOf(
  p: Player,
  i: number,
  st: State,
  plan: ProgramPlan,
  pinned: Partial<Record<string, string>>,
  inputs: ReturnType<typeof inputsOf>
): ProgramDayResult {
  const { facts, state } = inputs;
  const pitchPlan = inputs.plan;
  const prog = st.program!;
  const today = facts.condition.today;
  const zone = facts.load.zone;
  const recovery: RecoveryReason | null =
    zone === 'danger'
      ? 'loadRisk'
      : today && today.condition <= LOW_CONDITION_THRESHOLD
        ? 'lowCondition'
        : today?.soreness != null && today.soreness >= SEVERE_SORENESS
          ? 'soreSevere'
          : null;
  const safeInput = { facts, plan: pitchPlan, library, partsOnly: true };
  const safeIds = new Set(selectCandidates(safeInput).candidates.map((e) => e.id));
  const day = Math.min(prog.nextDay, plan.totalDays + 1);
  const items = dayPlan(plan, day).items;
  const { painSlots, slotReasons } = painSlotsOf(
    items,
    (v) => (pinned[v] ? { id: pinned[v]! } : null),
    safeIds,
    droppedOnlyForArmFatigue(safeInput)
  );
  const decision = decideToday(plan, {
    nextDay: prog.nextDay,
    today: keyOf(i),
    lastProgramDate: prog.lastDoneDate,
    checkedIn: today != null,
    otherWorkoutStarted: false,
    halted: selectCandidates({ facts, plan: pitchPlan, library }).halted,
    ...programSignalsOf({
      outing: state.outing,
      typesToday: [],
      yesterdayArmLoad: yesterdayArmLoadOf(facts),
    }),
    hardThrowRecent: state.load.hardOutingRecent,
    override: false,
    recovery,
    loadCaution: zone === 'caution',
    soreMany:
      today?.soreness != null &&
      today.soreness >= HIGH_SORENESS &&
      today.soreness < SEVERE_SORENESS,
    sleepShort: today != null && isShortSleep(today),
    uncertain:
      painRecoveryReason(facts, pitchPlan) != null ||
      (zone == null && facts.patterns.lastThrowDate != null),
    painSlots,
    slotReasons,
    /*
     * 중재 신호(2판 P6-2) — 앱과 같은 함수 · 같은 장(진행 중인 프로그램은 extrasOf 로 이미 얹혔다). 매일 일정의 하체 마지막 날은 historyOf
     * (gather.ts lastStrengthDates 와 같은 규칙). 오늘 프로그램 판은 아침이라 없다.
     */
    ...programArbiterSignals({
      state,
      typesToday: [],
      lastLowerKey: inputs.history.lastLowerKey,
      exerciseOf: (v) => (pinned[v] ? byId.get(pinned[v]!) : undefined),
    }).signals,
  });
  if (decision.kind !== 'go') return { decision, ids: [], bigLower: false };
  const audience = audienceOf(plan.def);
  const deferred = decision.deferVariants ?? [];
  const chosen: { slot: string; id: string }[] = [];
  for (const rx of items) {
    const a = decision.adjust[rx.slot];
    const pinnedId = pinned[rx.variant];
    if (!pinnedId || a?.kind === 'drop' || deferred.includes(rx.variant)) continue;
    if (a?.kind === 'substitute' && !safeIds.has(pinnedId)) {
      const sub = variantCandidates(
        rx.variant,
        library,
        ownedOf(p.kit),
        p.level,
        audience
      ).find((c) => c.id !== pinnedId && safeIds.has(c.id));
      if (sub) chosen.push({ slot: rx.slot, id: sub.id });
      continue;
    }
    chosen.push({ slot: rx.slot, id: pinnedId });
  }
  return {
    decision,
    ids: chosen.map((c) => c.id),
    bigLower: chosen.some((c) => c.slot === 'bigLower'),
  };
}

type ExtraDay = {
  date: string;
  /** 매일 일정의 테마(멈춘 날 null) */
  theme: ThemeKey | null;
  ids: string[];
  mainCount: number;
  mainSets: number;
  heavyLower: number;
  /** 팔에 실리는 운동(무거운 상체 밀기 · 팔 플라이오) 수 */
  armLoaded: number;
  hasCheckin: boolean;
  armFatigue: number | null;
  effortSpike: boolean;
  dayRule: DayRule;
  /** 근력 프로그램(있는 선수만) — 판정(go · rest:까닭 · spacing …) · 일차 · 큰 하체 · 한 운동 */
  program?: { decision: string; day: number; bigLower: boolean; ids: string[] };
  /** 두 번 넘게 뺀 운동(오늘 아침까지) 수와 그중 오늘 일정에 다시 든 수 — 빼는 선수만 */
  removedTwice?: { count: number; picked: number };
};
type ExtraResult = { player: Player; days: ExtraDay[] };

/** 추가 묶음 한 명의 28일 — 프로그램 하는 날은 프로그램을 하고, 그 밖의 날은 매일 일정을 한다 */
function runExtra(p: Player): ExtraResult {
  const st = newState(p);
  const programPlan = p.program != null ? parseProgram(p.program) : null;
  const pinned: Partial<Record<string, string>> = programPlan
    ? pickPinned(library, ownedOf(p.kit), p.level, {}, audienceOf(programPlan.def))
    : {};
  /* 고정 운동을 프로그램 줄에 둔다 — 고르기 점수가 다음 일차의 동작 열쇠를 그 운동으로 읽는다(inputsOf, 2판 P5-j) */
  if (st.program) st.program = { ...st.program, pinned };
  const days: ExtraDay[] = [];
  for (let i = 0; i < DAYS; i++) {
    const key = keyOf(i);
    const inputs = inputsOf(p, i, st);
    const built = buildDay(p, i, st);
    const prog = programPlan
      ? programDayOf(p, i, st, programPlan, pinned, inputs)
      : null;
    const go = prog?.decision.kind === 'go';
    const removedTwiceIds = new Set(
      [...inputs.swappedOut].filter(([, n]) => n >= 2).map(([id]) => id)
    );
    const ids = built ? built.picks.map((k) => k.exerciseId) : [];
    const today = inputs.facts.condition.today;
    days.push({
      date: key,
      theme: built?.theme.key ?? null,
      ids,
      mainCount: built ? built.picks.filter((k) => k.slot === 'main').length : 0,
      mainSets: mainSetsOf(built),
      heavyLower: countPicks(built, isHeavyLower),
      armLoaded: countPicks(built, isArmLoaded),
      hasCheckin: today != null,
      armFatigue: today?.armFatigue ?? null,
      effortSpike: inputs.state.load.effortSpike,
      dayRule: dayKindOf(inputs.facts).rule,
      ...(prog
        ? {
            program: {
              decision:
                prog.decision.kind === 'rest'
                  ? `rest:${prog.decision.reason}`
                  : prog.decision.kind,
              day: st.program!.nextDay,
              bigLower: prog.bigLower,
              ids: prog.ids,
            },
          }
        : {}),
      ...(p.removesFirstMain
        ? {
            removedTwice: {
              count: removedTwiceIds.size,
              picked: ids.filter((id) => removedTwiceIds.has(id)).length,
            },
          }
        : {}),
    });

    if (go && prog) {
      /* 프로그램 날 — 고정 운동을 하고 다음 일차로(lib/program/advance.ts 의 advanceProgramDay 와 같은 뜻) */
      st.done.set(
        key,
        prog.ids.map((id) => ({ id, category: byId.get(id)?.category ?? '' }))
      );
      st.notes.push({ date: key, intensity: effortOn(p, i) });
      st.program = {
        ...st.program!,
        nextDay: st.program!.nextDay + 1,
        lastDoneDate: key,
      };
      continue;
    }
    if (!built) continue;
    /* 일정 화면에서 본운동 첫 칸을 뺀다 — 그날 일정의 기록(PlanSwap remove)으로 남고 마침에서도 빠진다 */
    const removed = p.removesFirstMain
      ? (built.picks.find((k) => k.slot === 'main')?.exerciseId ?? null)
      : null;
    st.planned.set(
      key,
      removed
        ? withSwaps(built, [
            {
              from: removed,
              to: null,
              kind: 'remove',
              where: 'plan',
              slot: 'main',
              at: `${key}T03:00:00.000Z`,
            },
          ])
        : built
    );
    if (marksDoneOn(p.done, i)) {
      st.done.set(
        key,
        ids
          .filter((id) => id !== removed)
          .map((id) => ({ id, category: byId.get(id)?.category ?? '' }))
      );
      st.notes.push({ date: key, intensity: effortOn(p, i) });
    }
  }
  return { player: p, days };
}

const extraResults: ExtraResult[] = EXTRA_PLAYERS.map(runExtra);

/* --------------------------------- 집계 --------------------------------- */

const allDays = results.flatMap((r) => r.days);
const total = allDays.length;
/*
 * 앱이 실제로 일정을 만드는 날 = 오늘 체크인이 있는 날. '가끔' 체크인하는 선수 셋의 나머지 날(54일)은 검토안과 분모를 맞추려
 * 만든 것이라, 주요 지표는 전체와 이 분모를 나란히 찍는다.
 */
const appDays = allDays.filter((d) => d.hasCheckin);
const appTotal = appDays.length;
const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const pct = (n: number, d: number) =>
  d === 0 ? '해당 없음' : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
/** 같은 지표를 두 분모로 — 전체(검토안과 같은 분모) · 체크인 있는 날만(앱이 만드는 날) */
const both = (n: number, d: number, nApp: number, dApp: number) =>
  `${pct(n, d)} · 체크인 있는 날만 ${pct(nApp, dApp)}`;
const ratioPair = (n: number, d: number, nApp: number, dApp: number) => ({
  n,
  d,
  ratio: ratio(n, d),
  app: { n: nApp, d: dApp, ratio: ratio(nApp, dApp) },
});

/* ① 씨앗만 바꿈 → 목록(운동 id 집합)이 바뀐 날 / 336 */
const seedChanged = allDays.filter((d) => d.seedChanged).length;
const remakeChanged = allDays.filter((d) => d.remakeChanged).length;
const seedChangedApp = appDays.filter((d) => d.seedChanged).length;
const remakeChangedApp = appDays.filter((d) => d.remakeChanged).length;

/* ② 체크인만 바꿈 → 목록이 바뀐 날 / 체크인이 있는 날 */
const withCheckin = allDays.filter((d) => d.hasCheckin);
const checkinOne = withCheckin.filter((d) => d.checkinChanged.one).length;
const checkinEach = Object.fromEntries(
  CHECKIN_VARIANTS.map((k) => [
    k,
    withCheckin.filter((d) => d.checkinChanged[k]).length,
  ])
) as Record<CheckinVariant, number>;

/* ③ 어제 투구 기록만 바꿈 → 테마 · 목록이 바뀐 날 / 그 변형이 해당하는 날(어제 기록이 있고, 변형의 조건에 맞는 날) */
const pitchStats = Object.fromEntries(
  PITCH_VARIANTS.map((k) => {
    const rows = allDays.filter((d) => d.pitchChanged[k] != null);
    return [
      k,
      {
        d: rows.length,
        theme: rows.filter((d) => d.pitchChanged[k]!.theme).length,
        list: rows.filter((d) => d.pitchChanged[k]!.list).length,
      },
    ];
  })
) as Record<PitchVariant, { d: number; theme: number; list: number }>;

/* ④ 같은 설정 새 사용자 쌍이 같은 날 같은 목록 / 쌍 × 28일 */
const pairSame = pairRows.reduce((s, r) => s + r.same, 0);
const pairTwinSame = pairRows.reduce((s, r) => s + r.twinSame, 0);
const pairDays = pairRows.reduce((s, r) => s + r.days, 0);

/*
 * ⑤ 경기 날 아침 테마가 하체/상체(근력)인 횟수 / 경기 수.
 *
 * 대본 1판(P0 ~ P2)은 등판 답이 상세 체크인에만 있어 '답 하는 선발(매일 상세) 0/10 · 답 없는 선발(간편 · 가끔) 6/10'으로 갈랐다.
 * 2판 D1 로 간편에도 답이 들어가 체크인하는 날은 모두 답한다 — 그래서 셋으로 가른다:
 *   답 있음     체크인한 경기 아침(이제 모든 습관) — 앱이 실제로 만드는 날
 *   답을 지움   같은 아침에 등판 답만 모두 지운 변형(Variant.clearThrowPlans) — 답을 안 적는 사람. 대본 1판의 '답 없는 선발'과 같은 뜻
 *   체크인 없음 그 아침에 체크인이 없는 경기(선발D 가끔) — 앱이면 일정을 안 만든다. 어제 '내일 등판'이 이월되면 회복이 된다
 * 컨디션이 회복 문턱 이하인 아침은 등판과 상관없이 회복이라, '등판을 알아서'를 셀 때는 문턱 위만 따로 본다(fit).
 */
const isStarter = (p: Player) =>
  p.role === 'starter-weekly' || p.role === 'starter-biweekly';
const isStrengthTheme = (t: ThemeKey | null | undefined) =>
  t === 'lower' || t === 'upper';
/** 테마 분포 — 멈춘 날(통증 등, 변형에서만 생길 수 있다)은 '멈춤' */
const themeCounts = (list: DayRecord[], pick: (d: DayRecord) => ThemeKey | null) =>
  countBy(list, (d) => pick(d) ?? '멈춤');
function gameMornings(pickPlayer: (p: Player) => boolean) {
  const rows = results
    .filter((r) => pickPlayer(r.player))
    .flatMap((r) => r.days.filter((d) => d.today?.sessionType === '경기'));
  const answered = rows.filter((d) => d.hasCheckin);
  const fit = answered.filter((d) => d.condition! > LOW_CONDITION_THRESHOLD);
  const noCheckin = rows.filter((d) => !d.hasCheckin);
  const strength = (list: DayRecord[], pick: (d: DayRecord) => ThemeKey | null) =>
    list.filter((d) => isStrengthTheme(pick(d))).length;
  const base = (d: DayRecord) => d.theme;
  const cleared = (d: DayRecord) => d.answerClearedTheme ?? null;
  return {
    games: rows.length,
    answered: {
      games: answered.length,
      strength: strength(answered, base),
      themes: themeCounts(answered, base),
      fitGames: fit.length,
      fitStrength: strength(fit, base),
    },
    cleared: {
      games: answered.length,
      strength: strength(answered, cleared),
      themes: themeCounts(answered, cleared),
      fitGames: fit.length,
      fitStrength: strength(fit, cleared),
    },
    noCheckin: {
      games: noCheckin.length,
      strength: strength(noCheckin, base),
      themes: themeCounts(noCheckin, base),
    },
  };
}
const gameMorningStarters = gameMornings(isStarter);
const gameMorningAll = gameMornings(() => true);

/*
 * ⑮ 등판 답별 테마(체크인 있는 날) — P3 에서는 새 답 둘('2~3일 뒤' · '4일 이상 뒤')이 '없음'과 같이 읽혔고, P4 커밋 E 부터 날 종류
 * (lib/engine/microcycle.ts R5 · R6)가 가른다. 같은 답의 무거운 하체 수는 ⑭ 표(heavyLowerBeforeGame.byAnswer).
 */
const planThemes = THROW_PLANS.map((plan) => {
  const rows = allDays.filter((d) => d.throwPlan === plan);
  return { plan, days: rows.length, themes: themeCounts(rows, (d) => d.theme) };
});

/*
 * ⑥ 하체 · 상체 한쪽 연속 최대 일수 — 근력 날(lower/upper)만 차례로 보고 같은 쪽이 이어진 가장 긴 줄.
 *
 * liftingOnly 면 본운동이 실제로 있는 날만 센다(P1 ②부터 이 값이 주 지표). 컨디셔닝 목표의 날은 이름이 '컨디셔닝 데이'고 무게
 * 드는 구간이 없는데 key 는 lower/upper 로 남아(theme.ts conditioningDay — 그 쪽 근력은 다음 근력 날로 넘긴다는 화면 글 그대로),
 * key 만 보면 몸에 아무 부하도 안 준 날이 '한쪽 연속'으로 잡힌다. 옛 값(key 기준, 본운동 0 인 날 포함)도 같이 남긴다.
 */
function sideRun(days: DayRecord[], liftingOnly = false) {
  let best = 0;
  let bestSide: ThemeKey | null = null;
  let run = 0;
  let side: ThemeKey | null = null;
  for (const d of days) {
    if (d.theme !== 'lower' && d.theme !== 'upper') continue;
    if (liftingOnly && d.mainCount === 0) continue;
    run = d.theme === side ? run + 1 : 1;
    side = d.theme;
    if (run > best) {
      best = run;
      bestSide = side;
    }
  }
  return { best, bestSide };
}

type PlayerSummary = {
  name: string;
  themes: Record<ThemeKey, number>;
  /** 본운동이 있는 근력 날만(주 지표) */
  sideRun: ReturnType<typeof sideRun>;
  /** key 기준(본운동 0 인 날 포함 — P0 와 같은 셈) */
  sideRunKey: ReturnType<typeof sideRun>;
  emptyMainStrengthDays: number | null;
  veryHighDays: number;
  noCheckinDays: number;
  /** 체크인 있는 날(앱이 만드는 날) 수와 그중 회복 날 — '가끔' 체크인 선수의 회복 비율을 바로 읽으려고 */
  appDays: number;
  recoveryAppDays: number;
  halted: number;
  distinctExercises: number;
};
const summaries: PlayerSummary[] = results.map((r) => ({
  name: r.player.name,
  themes: {
    recovery: r.days.filter((d) => d.theme === 'recovery').length,
    assist: r.days.filter((d) => d.theme === 'assist').length,
    lower: r.days.filter((d) => d.theme === 'lower').length,
    upper: r.days.filter((d) => d.theme === 'upper').length,
  },
  appDays: r.days.filter((d) => d.hasCheckin).length,
  recoveryAppDays: r.days.filter((d) => d.hasCheckin && d.theme === 'recovery').length,
  sideRun: sideRun(r.days, true),
  sideRunKey: sideRun(r.days),
  /* 컨디셔닝 목표는 본운동 구간이 애초에 없다(GOAL_SHAPES) — 그 선수는 세지 않는다(null) */
  emptyMainStrengthDays:
    r.player.goal === CONDITIONING_GOAL
      ? null
      : r.days.filter(
          (d) => (d.theme === 'lower' || d.theme === 'upper') && d.mainCount === 0
        ).length,
  veryHighDays: r.days.filter((d) => d.veryHigh).length,
  noCheckinDays: r.days.filter((d) => !d.hasCheckin).length,
  halted: r.halted,
  distinctExercises: new Set(r.days.flatMap((d) => d.ids)).size,
}));

/* ⑦ 선수별 회복 날 수 / 28 — 위 summaries.themes.recovery */

/*
 * ⑥ 의 '상체 후보 0' — 장비 × 경력만으로 스트렝스 · 파워 후보가 몇 개 남는지(안전 거르기 전). 0 인 칸이 있으면 그 설정의 선수는
 * 그쪽 날에 본운동이 비고, 마침을 눌러도 그쪽 기록이 안 생겨 번갈기가 한쪽에 갇힌다.
 */
const KITS: Kit[] = ['bodyweight', 'dumbbell', 'gym'];
const poolByKitLevel = KITS.flatMap((kit) =>
  TRAINING_LEVEL_NAMES.map((level) => {
    /* ownedOf 가 이미 맨몸을 앞에 둔 앱 저장 꼴이라 그대로 넘긴다 */
    const pool = filterByLevel(
      filterByEquipment(library, ownedOf(kit)).pool,
      level
    ).pool;
    const count = (cat: string) => pool.filter((ex) => ex.category === cat).length;
    return {
      kit,
      level,
      lower: count('하체 스트렝스'),
      upper: count('상체 스트렝스'),
      power: count('파워'),
      total: pool.length,
    };
  })
);

/*
 * ⑧ 라이브러리 노출 — 336 일정에 한 번이라도 뽑힌 운동 / 보이는 운동 전체(카테고리별도).
 * 일정 구성(theme.ts 의 COMPOSITIONS)에 없는 카테고리(암케어는 따로 하는 루틴, 워밍업은 촬영용 이름만)를 뺀 값도 적는다 —
 * 그쪽은 아무리 돌려도 0 이라 전체 비율을 끌어내린다.
 */
const NEVER_SCHEDULED = ['암케어', '워밍업'];
const exposed = new Set(allDays.flatMap((d) => d.ids));
for (const id of exposed) {
  if (NEVER_SCHEDULED.includes(byId.get(id)?.category ?? '')) {
    throw new Error(`일정에 없다고 본 카테고리가 뽑혔다: ${byId.get(id)?.category}`);
  }
}
const schedulable = library.filter((ex) => !NEVER_SCHEDULED.includes(ex.category));
const exposedApp = new Set(appDays.flatMap((d) => d.ids));
const exposureByCategory = Object.fromEntries(
  Object.keys(libraryStats.byCategory).map((cat) => [
    cat,
    {
      exposed: library.filter((ex) => ex.category === cat && exposed.has(ex.id)).length,
      total: libraryStats.byCategory[cat],
    },
  ])
);

/* ⑨ 나이만 15↔22 로 바꾼 쌍의 목록이 다른 날 / 336. 영양은 facts 에 입력 자체가 없다 */
const age15vs22 = allDays.filter((d) => d.age15vs22Differs).length;
const age14vs22 = allDays.filter((d) => d.age14vs22Differs).length;
const age15vs22App = appDays.filter((d) => d.age15vs22Differs).length;
const age14vs22App = appDays.filter((d) => d.age14vs22Differs).length;

/* ⑩ D4 — 16~18세 선수의 일정에 '매우 높음' 강도 운동이 든 날 수(15세는 Y 뒤 성장기가 됐으니 따로 센다 — 0 이어야) */
const veryHighByAge = (pick: (age: number) => boolean) => {
  const rows = results.filter((r) => pick(r.player.age));
  const days = rows.flatMap((r) => r.days);
  const app = days.filter((d) => d.hasCheckin);
  return {
    players: rows.map((r) => `${r.player.name}(${r.player.age})`),
    days: days.filter((d) => d.veryHigh).length,
    total: days.length,
    app: { days: app.filter((d) => d.veryHigh).length, total: app.length },
  };
};
const veryHigh16to18 = veryHighByAge((age) => age >= 16 && age <= 18);
const veryHighAt15 = veryHighByAge((age) => age === 15);
const veryHighUnder15 = veryHighByAge((age) => age < YOUTH_AGE_THRESHOLD);

/* ⑪ D3 — 세게 던진 다음 날(D+1)에 지금 코드가 회복을 낸 날 / 세게 던진 다음 날 */
const afterHard = allDays.filter((d) => isHardThrow(d.yesterday));
const afterHardRecovery = afterHard.filter((d) => d.theme === 'recovery').length;
const afterHardApp = afterHard.filter((d) => d.hasCheckin);
const afterHardRecoveryApp = afterHardApp.filter((d) => d.theme === 'recovery').length;
/* 달력으로 '경기 다음 날'이면서 문턱 밑이라(경기 20구 = 2,000) 세게 던진 날이 아닌 것(구원 20구) — D3 가 가르는 경계 */
const afterLightGame = allDays.filter(
  (d) => d.yesterday?.sessionType === '경기' && !isHardThrow(d.yesterday)
);

/**
 * 투구수 × 체감 강도(%) 분포 — 세게 던진 날 문턱(HARD_OUTING_MIN_LOAD)을 정하고 다시 볼 참고 숫자. 대본과 실제 기록 둘 다.
 * 값은 판정과 같은 outingLoadOf(경기 100%)라 칸 하나가 문턱에서 끊긴다. 대본 1판은 투구수 × 강도(1~10)로 0~900 칸이었다.
 */
const PRODUCT_BUCKETS = [0, 1500, HARD_OUTING_MIN_LOAD, 4500, 6000, 7500, 9000];
const PITCH_BANDS = [
  { label: '30구 미만', min: 0, max: 29 },
  { label: '30~59구', min: 30, max: 59 },
  { label: '60~89구', min: 60, max: 89 },
  { label: '90구 이상', min: 90, max: Infinity },
];
/* 체감 강도(effortPctOf — 옛 줄은 강도 × 10) 칸. % 칩은 5% 단위라 61~64 · 86~89 는 없다 */
const INTENSITY_BANDS = [
  { label: '체감 ≤60%', min: 0, max: 60 },
  { label: '체감 65~85%', min: 61, max: 89 },
  { label: '체감 90~100%', min: 90, max: 100 },
];
type LogShape = {
  pitchCount: number;
  intensity: number;
  /** 체감 강도(%) — 옛 줄 · 대본은 없음(null) */
  effortPct?: number | null;
  sessionType: string | undefined;
  /** '같은 사람의 같은 날' 열쇠 — 날 단위로 합칠 때만 쓴다(출력하지 않는다) */
  dayKey: string;
};
function loadDistribution(logs: LogShape[]) {
  const product: Record<string, number> = {};
  for (let b = 0; b < PRODUCT_BUCKETS.length; b++) {
    const lo = PRODUCT_BUCKETS[b];
    const hi = PRODUCT_BUCKETS[b + 1];
    const label = hi == null ? `${lo}+` : `${lo}~${hi - 1}`;
    product[label] = logs.filter((l) => {
      const v = outingLoadOf({ ...l, sessionType: l.sessionType ?? '' });
      return v >= lo && (hi == null || v < hi);
    }).length;
  }
  const cross: Record<string, Record<string, number>> = {};
  for (const pb of PITCH_BANDS) {
    cross[pb.label] = {};
    for (const ib of INTENSITY_BANDS) {
      cross[pb.label][ib.label] = logs.filter(
        (l) =>
          l.pitchCount >= pb.min &&
          l.pitchCount <= pb.max &&
          effortPctOf(l) >= ib.min &&
          effortPctOf(l) <= ib.max
      ).length;
    }
  }
  /* 기록 한 줄씩 보면 — 한 줄이 그 자체로 지금 규칙(투구수 × 체감 강도 ≥ 2,700, 경기 100%)에 드는 것 */
  const hardLogs = logs.filter(
    (l) =>
      outingLoadOf({ ...l, sessionType: l.sessionType ?? '' }) >= HARD_OUTING_MIN_LOAD
  ).length;
  /*
   * 날 단위 — 지금 코드(facts.ts outingByDay → isHardOuting)가 실제로 판정하는 꼴. 기록마다 투구수 × 체감 강도(%)(경기 100%)를
   * 그날 합쳐 2,700 이상이면 세게 던진 날. 사용 통계 도구(training-usage-stats.mts)와 같은 식이라 두 숫자를 맞댈 수 있다.
   */
  const loadByDay = new Map<string, number>();
  const thrownDays = new Set<string>();
  for (const l of logs) {
    thrownDays.add(l.dayKey);
    const load = outingLoadOf({ ...l, sessionType: l.sessionType ?? '' });
    loadByDay.set(l.dayKey, (loadByDay.get(l.dayKey) ?? 0) + load);
  }
  const hardDays = [...loadByDay.values()].filter(
    (load) => load >= HARD_OUTING_MIN_LOAD
  ).length;
  return {
    count: logs.length,
    /* 체감 강도(%)별 — effortPctOf(옛 줄은 강도 × 10). % 로 적은 줄 수를 따로 둔다(D2 이행이 얼마나 됐나) */
    byEffortPct: countBy(logs, (l) => String(effortPctOf(l))),
    effortPctLogs: logs.filter((l) => l.effortPct != null).length,
    bySessionType: countBy(logs, (l) => l.sessionType ?? '(없음)'),
    product,
    cross,
    hardLogsByCurrentRule: hardLogs,
    thrownDays: thrownDays.size,
    hardDaysByCurrentRule: hardDays,
  };
}
/* 대본은 하루에 한 번만 던지니 날 열쇠 = 선수|날짜(어제 기록이라 날짜는 하루 앞) */
const scriptedLogs: LogShape[] = results.flatMap((r) =>
  r.days
    .filter((d) => d.yesterday != null)
    .map((d) => ({ ...d.yesterday!, dayKey: `${r.player.name}|${d.date}` }))
);
const scriptedDistribution = loadDistribution(scriptedLogs);
/* 날짜는 gather.ts(toISOString) → facts.ts(앞 10자리)와 같은 식으로 자른다 — 시간대에 안 흔들린다 */
const realDistribution = loadDistribution(
  realLogs.map((l) => ({
    pitchCount: l.pitchCount,
    intensity: l.intensity,
    effortPct: l.effortPct,
    sessionType: l.sessionType,
    dayKey: `${l.userId}|${l.date.toISOString().slice(0, 10)}`,
  }))
);

/*
 * ⑫ 경기 다음 날 — 어제 '오늘 등판'이라 답하고 경기 기록도 남긴 날(모든 역할). 대본 1판은 '답 없는 선발 · 답 하는 선발' 둘로
 * 갈라 둘 다 회복 10/10(기록이 있어 답과 무관)이었다. 이제 모두 답하니 같은 날을 두 변형으로 다시 잰다:
 *   기록만(답을 모두 지움)   기록이 다음 날을 정하나 — 대본 1판의 '답 없는 선발'과 같은 뜻
 *   답만(어제 기록을 뺌)     '던졌다고 답했지만 기록은 안 남긴' 다음 날 — 지금 테마는 어제 '오늘 등판'을 안 읽는다(엇갈림 표 C6
 *                            과 같은 알려진 빈틈). D3 · P4 가 부하와 답으로 이 날을 회복 쪽으로 뒤집는다
 * 어제 기록은 있는데 어제 체크인이 없는 날(가끔 체크인 선발D 의 경기 다음 날)은 세지 않고 수만 따로 적는다.
 */
const afterGameRows = allDays.filter((d) => d.afterGame != null);
const afterGameUnanswered = allDays.filter(
  (d) => d.yesterday?.sessionType === '경기' && d.afterGame == null
).length;
const afterGame = {
  count: afterGameRows.length,
  unanswered: afterGameUnanswered,
  themes: themeCounts(afterGameRows, (d) => d.theme),
  cleared: themeCounts(afterGameRows, (d) => d.afterGame!.cleared),
  dropped: themeCounts(afterGameRows, (d) => d.afterGame!.dropped),
  droppedStrength: afterGameRows.filter((d) => isStrengthTheme(d.afterGame!.dropped))
    .length,
  /* 기록이 있으면 회복이던 날(세게 던진 다음 날)만 — 구원 20구처럼 기록이 있어도 근력인 날을 빼고 빈틈의 크기를 본다 */
  recoveryDays: afterGameRows.filter((d) => d.theme === 'recovery').length,
  recoveryDroppedStrength: afterGameRows.filter(
    (d) => d.theme === 'recovery' && isStrengthTheme(d.afterGame!.dropped)
  ).length,
};

/*
 * ⑬ 팔 피로 '심함'(2판 P4 커밋 C) — 체크인 있는 날마다 그 체크인에 팔 피로 5 만 얹은 변형. 원래 일정에 무거운 상체 밀기 · 팔 플라이오가
 * 든 날과 수, 변형에 든 날과 수(안전 거르기 5-2 가 빼니 0 이어야 한다). 멈춘 변형 날은 따로 센다.
 */
const armRows = allDays.filter((d) => d.armSevere != null);
const sumOf = (pick: (a: NonNullable<DayRecord['armSevere']>) => number | null) =>
  armRows.reduce((s, d) => s + (pick(d.armSevere!) ?? 0), 0);
const armSevere = {
  days: armRows.length,
  halted: armRows.filter((d) => d.armSevere!.push == null).length,
  pushDaysBase: armRows.filter((d) => d.armSevere!.pushBase > 0).length,
  pushDays: armRows.filter((d) => (d.armSevere!.push ?? 0) > 0).length,
  plyoDaysBase: armRows.filter((d) => d.armSevere!.plyoBase > 0).length,
  plyoDays: armRows.filter((d) => (d.armSevere!.plyo ?? 0) > 0).length,
  pushBase: sumOf((a) => a.pushBase),
  push: sumOf((a) => a.push),
  plyoBase: sumOf((a) => a.plyoBase),
  plyo: sumOf((a) => a.plyo),
};

/*
 * ⑭ 등판 전 무거운 하체(2판 P4 커밋 D) — 대본의 진짜 다음 경기 날(nextGame)로 날을 가르고, 그날 일정에 무거운 하체가 든 날 · 운동 수를 센다.
 * 안전 거르기 2-2 는 등판 창(오늘 · 내일 · 2~3일 뒤 — 오늘 답, 없으면 어제 답을 하루 당겨)에서 무거운 하체를 뺀다. 그래서 체크인 있는 날의
 * D−1 · D−2~3 은 0 이어야 하고, 체크인 없는 날은 어제 답이 이월될 때만 걸린다. '오늘 불펜'으로 답한 날은 등판 창이 없다(답이 하나라 오늘
 * 할 일을 먼저 적는다 — 알려진 빈틈, 답별 표로 따로 본다). D4 이상은 무거운 하체가 다시 들어와야 한다(굶지 않음 — 하체 날 중 든 날).
 */
type HeavyRow = {
  days: number;
  heavyDays: number;
  heavy: number;
  lower: number;
  lowerHeavyDays: number;
};
const heavyRowOf = (list: DayRecord[]): HeavyRow => ({
  days: list.length,
  heavyDays: list.filter((d) => d.heavyLower > 0).length,
  heavy: list.reduce((s, d) => s + d.heavyLower, 0),
  lower: list.filter((d) => d.theme === 'lower').length,
  lowerHeavyDays: list.filter((d) => d.theme === 'lower' && d.heavyLower > 0).length,
});
const HEAVY_WINDOWS: {
  key: string;
  label: string;
  pick: (g: number | null) => boolean;
}[] = [
  { key: 'd0', label: '경기 날(D0)', pick: (g) => g === 0 },
  { key: 'd1', label: '경기 전날(D−1)', pick: (g) => g === 1 },
  { key: 'd2to3', label: '경기 2~3일 전(D−2 · D−3)', pick: (g) => g === 2 || g === 3 },
  { key: 'd4plus', label: '경기 4일 이상 전(D−4~)', pick: (g) => g != null && g >= 4 },
  { key: 'none', label: '앞 14일 경기 없음(비시즌)', pick: (g) => g == null },
];
const heavyLowerBeforeGame = {
  byDay: HEAVY_WINDOWS.map((w) => {
    const rows = allDays.filter((d) => w.pick(d.nextGame));
    return {
      window: w.key,
      label: w.label,
      checkin: heavyRowOf(rows.filter((d) => d.hasCheckin)),
      noCheckin: heavyRowOf(rows.filter((d) => !d.hasCheckin)),
    };
  }),
  /* 체크인 있는 날의 답별 — 등판 창 답 셋('오늘 등판' · '내일 등판' · '2~3일 뒤')은 0 이어야 한다 */
  byAnswer: THROW_PLANS.map((plan) => ({
    plan,
    ...heavyRowOf(allDays.filter((d) => d.hasCheckin && d.throwPlan === plan)),
  })),
};

/*
 * ⑮ 날 종류(2판 P4 커밋 E) — 체크인 있는 날의 규칙 분포 · 구원 '짧게'가 일정 시간을 줄인 날, 그리고 힘듦 급증 변형. 변형은 어제 대본의
 * Σ 투구수 × 체감 강도가 중간(MODERATE_OUTING_MIN_LOAD 1,350 이상 · 세게 던진 날 2,700 밑)인 날만 회복이 돼야 하고(R2), 그 밖의 날
 * (어제 안 던짐 · 가볍게 · 세게)은 테마가 그대로여야 한다(힘듦 급증만으로는 날을 안 바꾼다 — D3 은 투구 부하와 운동 힘듦이 같이 높을 때).
 */
const spikeRows = allDays.filter((d) => d.spikeTheme !== undefined);
const isModerateYesterday = (d: DayRecord) => {
  const load = d.yesterday ? outingLoadOf(d.yesterday) : 0;
  return load >= MODERATE_OUTING_MIN_LOAD && load < HARD_OUTING_MIN_LOAD;
};
const moderateRows = spikeRows.filter(isModerateYesterday);
const otherSpikeRows = spikeRows.filter((d) => !isModerateYesterday(d));
const dayKind = {
  rulesCheckin: countBy(
    allDays.filter((d) => d.hasCheckin),
    (d) => d.dayRule
  ),
  rulesNoCheckin: countBy(
    allDays.filter((d) => !d.hasCheckin),
    (d) => d.dayRule
  ),
  shortenDays: allDays.filter((d) => d.shorten).length,
  moderateSpike: {
    moderateDays: moderateRows.length,
    baseRecovery: moderateRows.filter((d) => d.theme === 'recovery').length,
    spikeRecovery: moderateRows.filter((d) => d.spikeTheme === 'recovery').length,
    otherDays: otherSpikeRows.length,
    otherChanged: otherSpikeRows.filter((d) => d.spikeTheme !== d.theme).length,
    themesBase: countBy(moderateRows, (d) => d.theme),
  },
};

/*
 * ⑯ 다음 등판 짐작(2판 P4 커밋 G) — 체크인 있고 앞 14일에 경기가 있는 날을 대본의 진짜 다음 경기(nextGame)로 가르고, 답을 지운 날 → 달력에
 * 경기를 적은 변형 · 같은 요일 짐작만 켠 변형의 테마 · 무거운 하체를 센다. 같은 요일 짐작은 선 날 · 맞은 날(짐작한 날 = 실제 다음 경기)도.
 */
const GUESS_WINDOWS = HEAVY_WINDOWS.filter((w) => w.key !== 'none');
const guessRows = allDays.filter((d) => d.calendarGuess !== undefined);
type GuessPick = 'cleared' | 'calendar' | 'estimate';
const guessThemes = (list: DayRecord[], key: GuessPick) =>
  countBy(list, (d) => d.calendarGuess![key] ?? '멈춤');
const heavyDaysOf = (
  list: DayRecord[],
  key: 'heavyCleared' | 'heavyCalendar' | 'heavyEstimate'
) => list.filter((d) => (d.calendarGuess![key] ?? 0) > 0).length;
const calendarGuess = {
  byDay: GUESS_WINDOWS.map((w) => {
    const rows = guessRows.filter((d) => w.pick(d.nextGame));
    return {
      window: w.key,
      label: w.label,
      days: rows.length,
      themes: {
        cleared: guessThemes(rows, 'cleared'),
        calendar: guessThemes(rows, 'calendar'),
        estimate: guessThemes(rows, 'estimate'),
      },
      heavyDays: {
        cleared: heavyDaysOf(rows, 'heavyCleared'),
        calendar: heavyDaysOf(rows, 'heavyCalendar'),
        estimate: heavyDaysOf(rows, 'heavyEstimate'),
      },
    };
  }),
  /* 짐작은 회복을 늘리지 않는다 — 답을 지운 날이 회복이 아닌데 짐작 변형이 회복인 날(0 이어야 한다) */
  newRecovery: {
    calendar: guessRows.filter(
      (d) =>
        d.calendarGuess!.cleared !== 'recovery' &&
        d.calendarGuess!.calendar === 'recovery'
    ).length,
    estimate: guessRows.filter(
      (d) =>
        d.calendarGuess!.cleared !== 'recovery' &&
        d.calendarGuess!.estimate === 'recovery'
    ).length,
  },
  estimate: {
    days: guessRows.length,
    guessed: guessRows.filter((d) => d.calendarGuess!.estimateDays != null).length,
    hit: guessRows.filter(
      (d) =>
        d.calendarGuess!.estimateDays != null &&
        d.calendarGuess!.estimateDays === d.nextGame
    ).length,
    byPlayer: countBy(
      guessRows.filter((d) => d.calendarGuess!.estimateDays != null),
      (d) => results.find((r) => r.days.includes(d))!.player.name
    ),
  },
};

/*
 * ⑰ 같은 테마 안에서 오늘 상태만 바꿈 → 목록 바뀜(2판 P5 도구 T0). 분모는 테마가 그대로인 짝 — 테마가 바뀐 짝 · 멈춘 짝은 따로 센다.
 * 후보 거르기가 같은 짝(sameExcluded — 안전 거르기의 뺀 규칙 · 수가 같다)만의 값도 낸다: 거기서 목록이 바뀌면 그것은 고르는 차례
 * (점수) 몫이다. 검토 비판 3 의 8번이 '점수 갈래의 sameCandidates'를 이 줄로 흡수하라고 했다.
 */
const stateRows = allDays.filter((d) => d.stateVariants != null);
function sameThemeOf(kinds: readonly StateVariant[]) {
  const pairs = stateRows.flatMap((d) =>
    kinds.flatMap((k) => (d.stateVariants![k] ? [d.stateVariants![k]!] : []))
  );
  const same = pairs.filter((v) => v.sameTheme);
  const sameCand = same.filter((v) => v.sameExcluded);
  const n = same.filter((v) => v.listChanged).length;
  return {
    pairs: pairs.length,
    n,
    d: same.length,
    ratio: ratio(n, same.length),
    themeChanged: pairs.filter((v) => !v.halted && !v.sameTheme).length,
    halted: pairs.filter((v) => v.halted).length,
    sameCandidates: {
      n: sameCand.filter((v) => v.listChanged).length,
      d: sameCand.length,
      ratio: ratio(sameCand.filter((v) => v.listChanged).length, sameCand.length),
    },
  };
}
const sameThemeState = {
  ...Object.fromEntries(SAME_THEME_VARIANTS.map((k) => [k, sameThemeOf([k])])),
  pooled: sameThemeOf(SAME_THEME_VARIANTS),
} as Record<StateVariant | 'pooled', ReturnType<typeof sameThemeOf>>;

/*
 * ⑱ 방향 검사 넷 — 나쁜 쪽으로 바꾼 상태가 운동을 늘리지 않는가(조이는 쪽만). 해당하는 짝 중 '뒤 ≤ 앞'인 짝, 그중 실제로 줄어든 짝,
 * 앞에 그것이 있던 짝. 뻐근 · 팔 피로는 모든 짝(테마가 바뀌어도 그 부위 · 팔의 짐이 늘면 안 된다), 세트 둘은 테마가 그대로인 짝만
 * (테마가 바뀌면 세트를 견줄 바탕이 다르다 — 바뀐 짝은 themeChanged 로). 멈춘 변형은 운동이 없으니 '늘지 않음'.
 *   stiff  그 부위(하체 날은 하체, 그 밖은 어깨)의 무거운 운동 수   arm  팔 피로 3 에서 팔에 실리는 운동 수
 *   bad    컨디션 −3 + 잠 부족에서 본운동 세트                      sore 근육통 '많이'에서 본운동 세트
 */
function directionOf(kind: StateVariant, sameThemeOnly: boolean) {
  const all = stateRows.flatMap((d) =>
    d.stateVariants![kind] ? [d.stateVariants![kind]!] : []
  );
  const rows = sameThemeOnly ? all.filter((v) => v.halted || v.sameTheme) : all;
  return {
    d: rows.length,
    pass: rows.filter((v) => (v.after ?? 0) <= (v.before ?? 0)).length,
    reduced: rows.filter((v) => (v.after ?? 0) < (v.before ?? 0)).length,
    had: rows.filter((v) => (v.before ?? 0) > 0).length,
    themeChanged: all.length - rows.length,
  };
}
const directionParts = {
  stiff: directionOf('stiff', false),
  arm: directionOf('arm3', false),
  bad: directionOf('bad', true),
  sore: directionOf('sore', true),
};
const directionAll = Object.values(directionParts).reduce(
  (s, r) => ({ d: s.d + r.d, pass: s.pass + r.pass, reduced: s.reduced + r.reduced }),
  { d: 0, pass: 0, reduced: 0 }
);
const direction = {
  ...directionParts,
  all: { ...directionAll, ratio: ratio(directionAll.pass, directionAll.d) },
};

/*
 * ⑱ 의 양 조절(2판 P5-d, lib/report/volume.ts) — 평소보다 낮은 컨디션 · 짧은 밤 · 근육통 '많이' 이상인 근력 날 본운동 세트 −1.
 *   days      기준 12명 · 체크인 있는 날 중 일정에 조절이 실린 날 · 줄인 세트 합(모든 칸)
 *   offTheme  하체 · 상체 날이 아닌데 실린 날(회복 · 보조 날은 안 줄인다 — 0 이어야 한다)
 *   bad/sore  나쁜 날(컨디션 −3 + 잠 '부족') · 근육통 '많이' 변형에서 테마가 그대로인 근력 날 짝 중 조절이 실린 짝(⑱ 세트 검사의 까닭).
 *             컨디셔닝 목표 선수는 뺀다(무게 드는 운동이 없는 날이라 줄일 세트가 없다 — volumeForDay 가 대지 않는다)
 */
function volumedOf(kind: 'bad' | 'sore') {
  const rows = results
    .filter((r) => r.player.goal !== CONDITIONING_GOAL)
    .flatMap((r) => r.days)
    .flatMap((d) => {
      const v = d.stateVariants?.[kind];
      return v && v.sameTheme && (d.theme === 'lower' || d.theme === 'upper')
        ? [v]
        : [];
    });
  return {
    strengthPairs: rows.length,
    volumed: rows.filter((v) => v.volumed).length,
    ratio: ratio(rows.filter((v) => v.volumed).length, rows.length),
  };
}
const volumeRows = appDays.filter((d) => d.volumeSetsCut != null);
const volume = {
  days: volumeRows.length,
  appDays: appDays.length,
  ratio: ratio(volumeRows.length, appDays.length),
  setsCut: volumeRows.reduce((s, d) => s + (d.volumeSetsCut ?? 0), 0),
  offTheme: allDays.filter(
    (d) => d.volumeSetsCut != null && d.theme !== 'lower' && d.theme !== 'upper'
  ).length,
  /* 무게만 멈춘 날(2판 P5 검토 — 몸 신호가 걸렸는데 줄일 세트가 없고 무게를 적는 운동이 있는 날) */
  holdOnly: appDays.filter((d) => d.volumeHoldOnly).length,
  bad: volumedOf('bad'),
  sore: volumedOf('sore'),
};

/*
 * ⑲ P5 울타리 — 점수 · 양 조절이 라이브러리를 좁히거나(노출) 회복 날을 몰래 늘리지 않는가. 회복 날 비율은 체크인 있는 날(앱이 만드는
 * 날) 기준, 까닭 없는 회복은 DayRecord.unexplainedRecovery, 두 번 넘게 뺀 운동이 다시 뽑힌 날은 추가 묶음의 바꾸기 선수(지금은 차례가
 * 그것을 모른다 — P5 의 점수가 −2 로 내릴 몫).
 */
const recoveryApp = appDays.filter((d) => d.theme === 'recovery').length;
const swapRows = extraResults
  .filter((r) => r.player.removesFirstMain)
  .flatMap((r) => r.days.filter((d) => (d.removedTwice?.count ?? 0) > 0));
const unexplainedRows = results.flatMap((r) =>
  r.days.filter((d) => d.unexplainedRecovery).map(() => r.player.name)
);
const fence = {
  exposure: {
    n: exposed.size,
    d: library.length,
    ratio: ratio(exposed.size, library.length),
    schedulableRatio: ratio(exposed.size, schedulable.length),
  },
  recoveryShare: { n: recoveryApp, d: appTotal, ratio: ratio(recoveryApp, appTotal) },
  unexplainedRecovery: {
    n: unexplainedRows.length,
    byPlayer: countBy(unexplainedRows, (name) => name),
  },
  swappedReturn: {
    n: swapRows.filter((d) => d.removedTwice!.picked > 0).length,
    d: swapRows.length,
    picks: swapRows.reduce((s, d) => s + d.removedTwice!.picked, 0),
  },
};

/*
 * ⑳ 프로그램 하는 날의 매일 일정(D6 — 그날은 프로그램 그대로, 보조 운동도 안 더한다). 지금(P6 전)은 매일 일정이 프로그램을 몰라
 * 같은 날 본운동을 따로 짠다 — 그 날 · 운동 수 · 무거운 하체 든 날. 추가 묶음의 프로그램 선수 넷만.
 */
const programResults = extraResults.filter((r) => r.player.program != null);
const goDaysOf = (r: ExtraResult) => r.days.filter((d) => d.program?.decision === 'go');
const programDay = {
  goDays: programResults.reduce((s, r) => s + goDaysOf(r).length, 0),
  dailyMainDays: programResults.reduce(
    (s, r) => s + goDaysOf(r).filter((d) => d.mainCount > 0).length,
    0
  ),
  dailyMainPicks: programResults.reduce(
    (s, r) => s + goDaysOf(r).reduce((t, d) => t + d.mainCount, 0),
    0
  ),
  dailyHeavyLowerDays: programResults.reduce(
    (s, r) => s + goDaysOf(r).filter((d) => d.heavyLower > 0).length,
    0
  ),
  byPlayer: programResults.map((r) => ({
    name: r.player.name,
    key: r.player.program!,
    goDays: goDaysOf(r).length,
    dailyMainDays: goDaysOf(r).filter((d) => d.mainCount > 0).length,
    decisions: countBy(r.days, (d) => d.program!.decision),
  })),
};

/*
 * ㉑ 무거운 하체 48시간 — 무거운 하체가 이틀 이어진 짝. 기준 12명은 매일 일정끼리(그날 일정의 무거운 하체 — 체크인 없는 날도 일정은
 * 있으니 센다), 프로그램 선수는 프로그램 하는 날의 큰 하체 칸과 그 밖의 날 매일 일정을 한 줄로 세운다. 출처 짝(일정→일정 ·
 * 프로그램→일정 · 일정→프로그램)을 같이 적는다.
 */
type HeavyEvent = { player: string; i: number; date: string; src: 'program' | 'daily' };
/* 날 번호 — 기준 12명의 날 목록은 멈춘 날을 건너뛰어 차례가 날 번호와 다를 수 있다 */
const dayIndexOf = (key: string) =>
  Math.round((Date.parse(key) - Date.parse(START_KEY)) / 86_400_000);
const heavyEvents: HeavyEvent[] = [
  ...results.flatMap((r) =>
    r.days
      .filter((d) => d.heavyLower > 0)
      .map((d) => ({
        player: r.player.name,
        i: dayIndexOf(d.date),
        date: d.date,
        src: 'daily' as const,
      }))
  ),
  ...extraResults.flatMap((r) =>
    r.days.flatMap((d, i): HeavyEvent[] => {
      if (d.program?.decision === 'go')
        return d.program.bigLower
          ? [{ player: r.player.name, i, date: d.date, src: 'program' }]
          : [];
      return d.heavyLower > 0
        ? [{ player: r.player.name, i, date: d.date, src: 'daily' }]
        : [];
    })
  ),
];
const lowerPairs: { player: string; from: string; to: string; src: string }[] = [];
for (let k = 1; k < heavyEvents.length; k++) {
  const a = heavyEvents[k - 1];
  const b = heavyEvents[k];
  if (a.player === b.player && b.i - a.i < 2)
    lowerPairs.push({
      player: a.player,
      from: a.date,
      to: b.date,
      src: `${a.src}→${b.src}`,
    });
}
const lowerGap = {
  violations: lowerPairs.length,
  bySource: countBy(lowerPairs, (x) => x.src),
  byPlayer: countBy(lowerPairs, (x) => x.player),
  pairs: lowerPairs.slice(0, 20),
};

/*
 * ㉒ 상태 바뀜 — 아침에 만든 일정의 지문과 (가) 저녁(오늘 던진 기록까지) (나) 체크인 고침(컨디션 3)을 견준다.
 *   raw       지문이 바뀐 날(stateChangesOf 가 하나라도)        shown     알림을 띄우는 날 — P6 의 알림 규칙이 생기기 전엔 raw 와 같다
 *   material  그 facts 로 다시 만들면 테마나 목록이 달라지는 날  noise     띄우는데 다시 만들어도 같은 날   miss  달라지는데 안 띄우는 날
 */
function alertStats(pick: (d: DayRecord) => { keys: string[]; material: boolean }) {
  const rows = allDays.filter((d) => d.stateAlert != null).map(pick);
  const shown = (r: { keys: string[] }) => r.keys.length > 0;
  return {
    d: rows.length,
    raw: rows.filter(shown).length,
    shown: rows.filter(shown).length,
    material: rows.filter((r) => r.material).length,
    noise: rows.filter((r) => shown(r) && !r.material).length,
    miss: rows.filter((r) => r.material && !shown(r)).length,
    byKey: countBy(
      rows.flatMap((r) => r.keys),
      (key) => key
    ),
  };
}
const stateAlert = {
  evening: alertStats((d) => d.stateAlert!.evening),
  edit: alertStats((d) => d.stateAlert!.edit),
};

/* 추가 묶음 — 선수별 28일 요약 · 팔 피로가 실제로 높은 날 · 힘듦 급증 날 */
const extraSummary = extraResults.map((r) => ({
  name: r.player.name,
  purpose: r.player.purpose ?? '',
  themes: countBy(r.days, (d) => d.theme ?? '멈춤'),
  decisions: r.player.program ? countBy(r.days, (d) => d.program!.decision) : null,
  spikeDays: r.days.filter((d) => d.effortSpike).length,
  spikeThemes: countBy(
    r.days.filter((d) => d.effortSpike),
    (d) => d.theme ?? '멈춤'
  ),
  armSevereDays: r.days.filter((d) => (d.armFatigue ?? 0) >= SEVERE_ARM_FATIGUE).length,
  armSevereLoaded: r.days.filter(
    (d) => (d.armFatigue ?? 0) >= SEVERE_ARM_FATIGUE && d.armLoaded > 0
  ).length,
  armHighDays: r.days.filter((d) => (d.armFatigue ?? 0) >= HIGH_ARM_FATIGUE).length,
  armHighLoaded: r.days.filter(
    (d) => (d.armFatigue ?? 0) >= HIGH_ARM_FATIGUE && d.armLoaded > 0
  ).length,
}));

/* 컨디션 늘 낮음 · 맨몸 늘 마침 — 검토안의 두 줄과 견줄 선수 */
const lowConditionRows = summaries.filter(
  (s) => PLAYERS.find((p) => p.name === s.name)!.condition === 'low'
);
const bodyweightAlwaysRows = summaries.filter((s) => {
  const p = PLAYERS.find((q) => q.name === s.name)!;
  return p.kit === 'bodyweight' && p.done === 'always';
});
const noCheckinDays = allDays.filter((d) => !d.hasCheckin).length;
const haltedDays = results.reduce((s, r) => s + r.halted, 0);

/* --------------------------------- 출력 --------------------------------- */

function table(headers: string[], rows: (string | number | null)[][]): string {
  const line = (cells: (string | number | null)[]) =>
    `| ${cells.map((c) => (c == null ? '' : String(c))).join(' | ')} |`;
  return [
    line(headers),
    `|${headers.map(() => ' --- ').join('|')}|`,
    ...rows.map(line),
  ].join('\n');
}
const n = (v: number | null) => (v == null ? '해당 없음' : `${(v * 100).toFixed(1)}%`);
const sideText = (r: ReturnType<typeof sideRun>) =>
  r.bestSide ? `${r.best}일(${r.bestSide === 'lower' ? '하체' : '상체'})` : '0';
/** 테마 분포 한 줄 — 'recovery 18 · assist 2' */
const themeText = (themes: Record<string, number>) =>
  Object.entries(themes).length
    ? Object.entries(themes)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')
    : '없음';
const veryHighText = (v: ReturnType<typeof veryHighByAge>) =>
  both(v.days, v.total, v.app.days, v.app.total);
/** 회복 날 수 — 가끔 체크인하는 선수는 앱이 만드는 날(체크인 있는 날) 중 수를 곁들인다 */
const recoveryText = (s: PlayerSummary) =>
  s.noCheckinDays > 0
    ? `${s.name} ${s.themes.recovery}/${DAYS}(체크인 있는 ${s.appDays}일 중 ${s.recoveryAppDays})`
    : `${s.name} ${s.themes.recovery}/${DAYS}`;

const out: string[] = [];
out.push(
  `# 트레이닝 추천 기준선 — 가상 선수 ${PLAYERS.length}명 × ${DAYS}일, 실제 운동 표`
);
out.push(
  `\n시작 ${START_KEY} · 일정 ${total}개(멈춤 ${haltedDays}) · 체크인 있는 날 ${appTotal}(앱이 만드는 날) · 체크인 없는 날 ${noCheckinDays}(앱이면 안 만드는 날) · buildDailyPlan ${buildCalls}번`
);

out.push('\n## 라이브러리(보이는 운동)');
out.push(
  table(
    ['항목', '수', '비율'],
    [
      ['전체', libraryStats.total, ''],
      ...Object.entries(libraryStats.byCategory).map(([k, v]) => [
        `카테고리 · ${k}`,
        v,
        n(ratio(v, libraryStats.total)),
      ]),
      ...(
        [
          ['movementPattern 있음', libraryStats.filled.movementPattern],
          [
            'movementPattern 있음(스트렝스 · 파워만)',
            libraryStats.filledStrengthPower.movementPattern,
            libraryStats.filledStrengthPower.total,
          ],
          ['difficulty 있음', libraryStats.filled.difficulty],
          ["intensity 기본값('중간') 아님", libraryStats.filled.intensityNotDefault],
          ['bodyParts 비어 있지 않음', libraryStats.filled.bodyParts],
          ['sets + reps/holdSeconds 있음', libraryStats.filled.setsAndReps],
          ['equipment 비어 있지 않음', libraryStats.filled.equipment],
        ] as [string, number, number?][]
      ).map(([k, v, d]) => [
        k,
        `${v}/${d ?? libraryStats.total}`,
        n(ratio(v, d ?? libraryStats.total)),
      ]),
      ...Object.entries(libraryStats.byIntensity).map(([k, v]) => [
        `강도 · ${k}`,
        v,
        n(ratio(v, libraryStats.total)),
      ]),
    ]
  )
);

out.push('\n## 선수와 28일 결과');
out.push(
  table(
    [
      '#',
      '이름',
      '나이',
      '경력',
      '장비',
      '목표',
      '분',
      '역할',
      '체크인',
      '컨디션',
      '마침',
      '회복(체크인 있는 날만)',
      '보조',
      '하체',
      '상체',
      '한쪽 연속 최대',
      '본운동 0 근력 날',
      '매우 높음 날',
      '쓴 운동 수',
      '체크인 없는 날',
    ],
    results.map((r, at) => {
      const p = r.player;
      const s = summaries[at];
      return [
        at + 1,
        p.name,
        p.age,
        p.level,
        KIT_LABEL[p.kit],
        p.goal,
        p.minutes,
        ROLE_LABEL[p.role],
        CHECKIN_LABEL[p.checkin],
        conditionLabel(p.condition),
        DONE_LABEL[p.done],
        /* 가끔 체크인하는 선수는 앱이 만드는 날의 회복 수를 곁들인다 — 54일 때문에 흐려진 숫자를 그대로 읽지 않게 */
        s.noCheckinDays > 0
          ? `${s.themes.recovery} (${s.appDays}일 중 ${s.recoveryAppDays})`
          : s.themes.recovery,
        s.themes.assist,
        s.themes.lower,
        s.themes.upper,
        /* 본운동 있는 날 기준. key 기준이 다르면(컨디셔닝 — 무게 없는 날의 숨은 키) 괄호로 곁들인다 */
        s.sideRunKey.best === s.sideRun.best
          ? sideText(s.sideRun)
          : `${sideText(s.sideRun)} (키 기준 ${sideText(s.sideRunKey)})`,
        s.emptyMainStrengthDays ?? '(컨디셔닝)',
        s.veryHighDays,
        s.distinctExercises,
        s.noCheckinDays,
      ];
    })
  )
);

out.push('\n## 재는 것');
out.push(
  table(
    ['번호', '재는 것(정의)', '값'],
    [
      [
        '①',
        '씨앗에 글자 하나 더함 → 목록(운동 id 집합)이 바뀐 날 / 전체',
        both(seedChanged, total, seedChangedApp, appTotal),
      ],
      [
        "①'",
        "'다시 만들기'(날짜|지금 목록) → 목록이 바뀐 날 / 전체",
        both(remakeChanged, total, remakeChangedApp, appTotal),
      ],
      [
        '②',
        '체크인만 바꿈(셋 중 하나, 날마다 돌아가며) → 목록이 바뀐 날 / 체크인 있는 날',
        pct(checkinOne, withCheckin.length),
      ],
      ...CHECKIN_VARIANTS.map((k) => [
        '②',
        `  ${CHECKIN_VARIANT_LABEL[k]} 만`,
        pct(checkinEach[k], withCheckin.length),
      ]),
      ...PITCH_VARIANTS.flatMap((k) => [
        [
          '③',
          `어제 투구 기록만 ${PITCH_VARIANT_LABEL[k]} → 테마 바뀜 / 그 변형이 해당하는 날`,
          pct(pitchStats[k].theme, pitchStats[k].d),
        ],
        [
          '③',
          `  ${PITCH_VARIANT_LABEL[k]} → 목록 바뀜`,
          pct(pitchStats[k].list, pitchStats[k].d),
        ],
      ]),
      [
        '④',
        '같은 설정(경력 · 장비 · 목표 · 시간) 새 사용자 둘(이름 · 나이 22/24 · 컨디션 7/8 · 잔 느낌만 다름)이 같은 날 같은 목록 / 쌍 × 28일',
        pct(pairSame, pairDays),
      ],
      ['④', '  입력까지 똑같은 쌍둥이(도구가 결정적인지)', pct(pairTwinSame, pairDays)],
      [
        '⑤',
        '선발의 경기 날 아침(체크인 있음 — 이제 간편 · 상세 모두 등판 답을 적는다) 테마가 하체/상체 / 그런 아침',
        pct(gameMorningStarters.answered.strength, gameMorningStarters.answered.games),
      ],
      [
        '⑤',
        `  그중 아침 컨디션이 회복 문턱(${LOW_CONDITION_THRESHOLD}) 위인 아침만`,
        pct(
          gameMorningStarters.answered.fitStrength,
          gameMorningStarters.answered.fitGames
        ),
      ],
      [
        '⑤',
        '  같은 아침에 등판 답만 모두 지운 변형(답을 안 적는 사람 — 대본 1판의 답 없는 선발)',
        `${pct(gameMorningStarters.cleared.strength, gameMorningStarters.cleared.games)} · 문턱 위만 ${pct(gameMorningStarters.cleared.fitStrength, gameMorningStarters.cleared.fitGames)}`,
      ],
      [
        '⑤',
        "  체크인 없는 경기 아침(앱이면 일정을 안 만든다 — 어제 '내일 등판'이 이월되면 회복)",
        `${pct(gameMorningStarters.noCheckin.strength, gameMorningStarters.noCheckin.games)} · ${themeText(gameMorningStarters.noCheckin.themes)}`,
      ],
      [
        '⑤',
        '모든 역할(선발 · 구원)의 경기 날 아침(체크인 있음) 테마가 하체/상체',
        `${pct(gameMorningAll.answered.strength, gameMorningAll.answered.games)} · 답을 지운 변형 ${pct(gameMorningAll.cleared.strength, gameMorningAll.cleared.games)}(문턱 위만 ${pct(gameMorningAll.cleared.fitStrength, gameMorningAll.cleared.fitGames)})`,
      ],
      [
        '⑥',
        '하체 · 상체 한쪽 연속 최대 일수(본운동이 있는 근력 날만 차례로) — 선수별은 위 표',
        `최대 ${Math.max(...summaries.map((s) => s.sideRun.best))}일`,
      ],
      [
        '⑥',
        '  key 기준(본운동 0 인 날 포함 — P0 와 같은 셈, 컨디셔닝 목표의 숨은 키가 섞인다)',
        `최대 ${Math.max(...summaries.map((s) => s.sideRunKey.best))}일`,
      ],
      [
        '⑥',
        '  맨몸 · 늘 마침 선수',
        bodyweightAlwaysRows
          .map(
            (s) =>
              `${s.name} ${sideText(s.sideRun)}, 본운동 0 근력 날 ${s.emptyMainStrengthDays}`
          )
          .join(' / '),
      ],
      [
        '⑦',
        '회복 날 수 / 28 — 컨디션 늘 낮음 선수(가끔 체크인이면 체크인 있는 날 중 수를 곁들임)',
        lowConditionRows.map(recoveryText).join(' / '),
      ],
      [
        '⑦',
        '  전체 평균',
        `${(summaries.reduce((s, r) => s + r.themes.recovery, 0) / summaries.length).toFixed(1)}/${DAYS}`,
      ],
      [
        '⑧',
        '라이브러리 노출 — 336 일정에 한 번이라도 뽑힌 운동 / 보이는 운동 전체',
        both(exposed.size, library.length, exposedApp.size, library.length),
      ],
      [
        '⑧',
        `  일정 구성에 없는 카테고리(${NEVER_SCHEDULED.join(' · ')})를 뺀 전체 기준`,
        both(exposed.size, schedulable.length, exposedApp.size, schedulable.length),
      ],
      ...Object.entries(exposureByCategory).map(([k, v]) => [
        '⑧',
        `  ${k}`,
        pct(v.exposed, v.total),
      ]),
      [
        '⑨',
        '나이만 15↔22 로 바꾼 쌍의 목록이 다른 날 / 전체',
        both(age15vs22, total, age15vs22App, appTotal),
      ],
      [
        '⑨',
        '  나이만 14↔22(성장기 규칙이 실제로 갈리는 쌍)',
        both(age14vs22, total, age14vs22App, appTotal),
      ],
      [
        '⑨',
        '영양만 바꾼 쌍',
        'facts 에 영양 입력 자체가 없음(buildFacts 가 받지 않는다)',
      ],
      [
        '⑩',
        `D4 — 16~18세 선수(${veryHigh16to18.players.join(' · ')})의 일정에 '매우 높음' 운동이 든 날 / 그들의 일정`,
        veryHighText(veryHigh16to18),
      ],
      [
        '⑩',
        `  15세(${veryHighAt15.players.join(' · ')}) — Y(D4) 뒤 문턱 ${YOUTH_AGE_THRESHOLD} 미만이라 성장기 취급, 0 이어야 한다`,
        veryHighText(veryHighAt15),
      ],
      [
        '⑩',
        `  15세 미만(${veryHighUnder15.players.join(' · ')}) — 0 이어야 한다`,
        veryHighText(veryHighUnder15),
      ],
      [
        '⑪',
        `D3 — 세게 던진 다음 날(투구수 × 체감 강도 ≥ ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')}, 경기 100% 의 다음 날)에 지금 코드가 회복을 낸 날 / 그런 날`,
        both(
          afterHardRecovery,
          afterHard.length,
          afterHardRecoveryApp,
          afterHardApp.length
        ),
      ],
      [
        '⑪',
        `  경기 다음 날인데 문턱 밑이라(경기 20구 = 2,000) 세게 던진 날이 아닌 것(구원 20구)의 테마`,
        themeText(countBy(afterLightGame, (d) => d.theme)),
      ],
      [
        '⑫',
        `경기 다음 날(어제 '오늘 등판'이라 답하고 기록도 남김, 모든 역할 ${afterGame.count}일 — 어제 체크인 없는 ${afterGame.unanswered}일은 뺌) 테마`,
        themeText(afterGame.themes),
      ],
      [
        '⑫',
        '  같은 날 등판 답을 모두 지운 변형(기록만 — 기록이 다음 날을 정하나)',
        themeText(afterGame.cleared),
      ],
      [
        '⑫',
        '  같은 날 어제 기록만 뺀 변형(답만 — 던졌다고 답하고 기록은 안 남김, 엇갈림 표 C6 · 2판 P4 커밋 E 부터 보조 · 코어)',
        `${themeText(afterGame.dropped)} · 근력 ${pct(afterGame.droppedStrength, afterGame.count)} · 기록이 있으면 회복이던 날 중 근력 ${pct(afterGame.recoveryDroppedStrength, afterGame.recoveryDays)}`,
      ],
      [
        '⑬',
        `팔 피로 '심함' 변형(체크인 있는 ${armSevere.days}일에 팔 피로 5 만 얹음) — 무거운 상체 밀기가 든 날: 원래 일정 → 변형(0 이어야 한다, 2판 P4)`,
        `${pct(armSevere.pushDaysBase, armSevere.days)} → ${pct(armSevere.pushDays, armSevere.days)} · 운동 수 ${armSevere.pushBase} → ${armSevere.push}`,
      ],
      [
        '⑬',
        '  같은 변형 — 팔 플라이오(메디신볼 · 플라이오 푸시업 …)가 든 날: 원래 일정 → 변형',
        `${pct(armSevere.plyoDaysBase, armSevere.days)} → ${pct(armSevere.plyoDays, armSevere.days)} · 운동 수 ${armSevere.plyoBase} → ${armSevere.plyo}${armSevere.halted > 0 ? ` · 멈춘 변형 ${armSevere.halted}일` : ''}`,
      ],
      ...heavyLowerBeforeGame.byDay.map((r): (string | number | null)[] => [
        '⑭',
        `등판 전 무거운 하체(2판 P4) — ${r.label}: 무거운 하체가 든 날(체크인 있는 날 · 없는 날)${r.window === 'd4plus' || r.window === 'none' ? ' · 하체 날 중 든 날(굶지 않음)' : ''}`,
        `${pct(r.checkin.heavyDays, r.checkin.days)} 운동 ${r.checkin.heavy} · 없는 날 ${pct(r.noCheckin.heavyDays, r.noCheckin.days)} 운동 ${r.noCheckin.heavy}${r.window === 'd4plus' || r.window === 'none' ? ` · 하체 날 ${pct(r.checkin.lowerHeavyDays + r.noCheckin.lowerHeavyDays, r.checkin.lower + r.noCheckin.lower)}` : ''}`,
      ]),
      [
        '⑮',
        '날 종류(2판 P4) — 체크인 있는 날의 규칙(lib/engine/microcycle.ts dayKindOf)',
        Object.entries(dayKind.rulesCheckin)
          .map(([k, n]) => `${k} ${n}`)
          .join(' · '),
      ],
      [
        '⑮',
        '  체크인 없는 날의 규칙 · 구원 짧게(어제 실전 강도로 20구 넘게 — 회복 날 빼고)가 시간을 줄인 날',
        `${Object.entries(dayKind.rulesNoCheckin)
          .map(([k, n]) => `${k} ${n}`)
          .join(' · ')} · 짧게 ${dayKind.shortenDays}일`,
      ],
      [
        '⑮',
        `  힘듦 급증 변형 — 어제 중간 부하(${MODERATE_OUTING_MIN_LOAD}~${HARD_OUTING_MIN_LOAD - 1}) 날의 회복: 원래 → 변형(D3, 모두 회복이어야 한다)`,
        `${pct(dayKind.moderateSpike.baseRecovery, dayKind.moderateSpike.moderateDays)} → ${pct(dayKind.moderateSpike.spikeRecovery, dayKind.moderateSpike.moderateDays)}`,
      ],
      [
        '⑮',
        '  같은 변형 — 그 밖의 날(어제 안 던짐 · 가볍게 · 세게) 테마가 바뀐 날(0 이어야 한다)',
        pct(dayKind.moderateSpike.otherChanged, dayKind.moderateSpike.otherDays),
      ],
      ...calendarGuess.byDay.map((r): (string | number | null)[] => [
        '⑯',
        `다음 등판 짐작(2판 P4) — ${r.label}, 체크인 있는 ${r.days}일에 등판 답을 지움 → 달력에 경기를 적음 · 같은 요일 짐작만: 테마 / 무거운 하체 든 날`,
        `${themeText(r.themes.cleared)} → 달력 ${themeText(r.themes.calendar)} · 짐작 ${themeText(r.themes.estimate)} / ${r.heavyDays.cleared} → ${r.heavyDays.calendar} · ${r.heavyDays.estimate}`,
      ]),
      [
        '⑯',
        '  짐작으로 새로 회복이 된 날(0 이어야 한다 — 가볍게 하는 쪽은 보조까지) · 달력 · 같은 요일',
        `${calendarGuess.newRecovery.calendar} · ${calendarGuess.newRecovery.estimate}`,
      ],
      [
        '⑯',
        '  같은 요일 짐작이 선 날 · 그중 짐작한 날 = 실제 다음 경기 · 선수별',
        `${pct(calendarGuess.estimate.guessed, calendarGuess.estimate.days)} · 맞음 ${pct(calendarGuess.estimate.hit, calendarGuess.estimate.guessed)} · ${
          Object.entries(calendarGuess.estimate.byPlayer)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ') || '없음'
        }`,
      ],
      [
        '⑰',
        '같은 테마 안에서 오늘 상태만 바꿈(셋을 묶음) → 목록 바뀜 / 테마가 그대로인 짝(2판 P5 — 30% 이상이 목표)',
        `${pct(sameThemeState.pooled.n, sameThemeState.pooled.d)} · 테마 바뀐 짝 ${sameThemeState.pooled.themeChanged} · 멈춘 짝 ${sameThemeState.pooled.halted}`,
      ],
      ...SAME_THEME_VARIANTS.map((k): (string | number | null)[] => [
        '⑰',
        `  ${STATE_VARIANT_LABEL[k]} 만`,
        `${pct(sameThemeState[k].n, sameThemeState[k].d)} · 테마 바뀐 짝 ${sameThemeState[k].themeChanged}`,
      ]),
      [
        '⑰',
        '  그중 후보 거르기가 같은 짝(안전 거르기의 뺀 규칙 · 수가 같다 — 목록 차이는 고르는 차례의 몫)',
        pct(
          sameThemeState.pooled.sameCandidates.n,
          sameThemeState.pooled.sameCandidates.d
        ),
      ],
      [
        '⑱',
        '방향 검사 넷 — 나쁜 쪽으로 바꾼 상태가 운동을 늘리지 않은 짝 / 해당 짝(2판 P5 — 100% 가 목표)',
        `${pct(direction.all.pass, direction.all.d)} · 실제로 줄어든 짝 ${direction.all.reduced}`,
      ],
      ...(
        [
          ['stiff', `${STATE_VARIANT_LABEL.stiff} → 그 부위의 무거운 운동 수`],
          [
            'arm',
            `${STATE_VARIANT_LABEL.arm3} → 팔에 실리는 운동(무거운 상체 밀기 · 팔 플라이오) 수`,
          ],
          ['bad', `${STATE_VARIANT_LABEL.bad} → 본운동 세트(테마가 그대로인 짝)`],
          ['sore', `${STATE_VARIANT_LABEL.sore} → 본운동 세트(테마가 그대로인 짝)`],
        ] as [keyof typeof directionParts, string][]
      ).map(([k, label]): (string | number | null)[] => [
        '⑱',
        `  ${label}`,
        `${pct(direction[k].pass, direction[k].d)} · 줄어든 짝 ${direction[k].reduced} / 앞에 있던 짝 ${direction[k].had}${direction[k].themeChanged ? ` · 테마 바뀐 짝(뺌) ${direction[k].themeChanged}` : ''}`,
      ]),
      [
        '⑱',
        '  양 조절(P5-d) — 체크인 있는 날 중 세트를 줄인 날 · 줄인 세트 합 · 근력 날 밖에 실린 날(0 이어야 한다) · 무게만 멈춘 날(P5 검토)',
        `${pct(volume.days, volume.appDays)} · 줄인 세트 ${volume.setsCut} · 근력 날 밖 ${volume.offTheme} · 무게만 멈춘 날 ${volume.holdOnly}`,
      ],
      [
        '⑱',
        '  양 조절 — 나쁜 날 · 근육통 변형에서 테마가 그대로인 근력 날 짝 중 세트를 줄인 짝',
        `나쁜 날 ${pct(volume.bad.volumed, volume.bad.strengthPairs)} · 근육통 ${pct(volume.sore.volumed, volume.sore.strengthPairs)}`,
      ],
      [
        '⑲',
        'P5 울타리 — 라이브러리 노출(보이는 운동 전체 · 일정에 드는 카테고리만)',
        `${pct(fence.exposure.n, fence.exposure.d)} · ${n(fence.exposure.schedulableRatio)}`,
      ],
      [
        '⑲',
        `  체크인 있는 날 중 회복 날 · 까닭 없는 회복(0 이어야 한다)`,
        `${pct(fence.recoveryShare.n, fence.recoveryShare.d)} · 까닭 없는 회복 ${fence.unexplainedRecovery.n}${
          fence.unexplainedRecovery.n
            ? `(${Object.entries(fence.unexplainedRecovery.byPlayer)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')})`
            : ''
        }`,
      ],
      [
        '⑲',
        '  두 번 넘게 뺀 운동이 그날 일정에 다시 든 날 / 그런 운동이 있던 날(추가 묶음 바꾸기G — P5 의 점수가 낮출 몫)',
        `${pct(fence.swappedReturn.n, fence.swappedReturn.d)} · 다시 든 운동 ${fence.swappedReturn.picks}`,
      ],
      [
        '⑳',
        '프로그램 하는 날 매일 일정에 본운동이 든 날 / 프로그램 하는 날(추가 묶음 프로그램 넷 — D6 뒤 0 이 목표)',
        `${pct(programDay.dailyMainDays, programDay.goDays)} · 본운동 ${programDay.dailyMainPicks}개 · 무거운 하체 든 날 ${programDay.dailyHeavyLowerDays}`,
      ],
      [
        '㉑',
        '무거운 하체가 이틀 이어진 짝(기준 12명 일정끼리 · 프로그램 선수는 프로그램 큰 하체와 일정을 한 줄로 — 0 이 목표)',
        `${lowerGap.violations}${
          lowerGap.violations
            ? ` · ${Object.entries(lowerGap.bySource)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')}`
            : ''
        }`,
      ],
      [
        '㉒',
        `상태 바뀜(가) 저녁 — 오늘 던진 기록을 넣으면 지문이 바뀐 날 · 다시 만들면 달라지는 날 · 띄우는데 같은 날(소음) · 달라지는데 안 띄우는 날(놓침) / 체크인 있는 날`,
        `${stateAlert.evening.raw} · ${stateAlert.evening.material} · ${stateAlert.evening.noise} · ${stateAlert.evening.miss} / ${stateAlert.evening.d}`,
      ],
      [
        '㉒',
        `  (나) 체크인 고침(컨디션 ${EDITED_CONDITION}) — 같은 넷`,
        `${stateAlert.edit.raw} · ${stateAlert.edit.material} · ${stateAlert.edit.noise} · ${stateAlert.edit.miss} / ${stateAlert.edit.d}`,
      ],
    ]
  )
);

out.push(
  `\n## 추가 묶음(2판 P5 도구 T0) — ${EXTRA_PLAYERS.length}명 × ${DAYS}일, 분모 따로(①~⑯ 에 안 섞음)`
);
out.push(
  table(
    [
      '이름',
      '무엇을 재나',
      '28일 테마',
      '프로그램 판정',
      '팔 피로 4+ 날(팔에 실림)',
      '힘듦 급증 날(테마)',
    ],
    extraSummary.map((s) => [
      s.name,
      s.purpose,
      themeText(s.themes),
      s.decisions ? themeText(s.decisions) : '·',
      s.armHighDays
        ? `${s.armHighDays}(${s.armHighLoaded}) · 5 ${s.armSevereDays}(${s.armSevereLoaded})`
        : '·',
      s.spikeDays ? `${s.spikeDays}(${themeText(s.spikeThemes)})` : '·',
    ])
  )
);

out.push(
  "\n## ⑮ 등판 답별 테마(체크인 있는 날) — '2~3일 뒤'는 무거운 하체를 빼고, 하체 · 상체 기록이 없으면 상체 쪽 · '4일 이상 뒤'는 하체 쪽(2판 P4)"
);
out.push(
  table(
    ['등판 답', '날', '테마'],
    planThemes.map((r) => [r.plan, r.days, r.days ? themeText(r.themes) : '·'])
  )
);

out.push(
  "\n## ⑭ 등판 답별 무거운 하체(체크인 있는 날) — '오늘 등판' · '내일 등판' · '2~3일 뒤'는 0 이어야 한다(2판 P4)"
);
out.push(
  table(
    ['등판 답', '날', '무거운 하체가 든 날', '운동 수', '하체 날', '하체 날 중 든 날'],
    heavyLowerBeforeGame.byAnswer.map((r) => [
      r.plan,
      r.days,
      r.heavyDays,
      r.heavy,
      r.lower,
      r.lowerHeavyDays,
    ])
  )
);

out.push('\n## ④ 같은 설정 쌍');
out.push(
  table(
    ['설정', '같은 목록 / 28', '쌍둥이 같은 목록 / 28'],
    pairRows.map((r) => [r.setting, r.same, r.twinSame])
  )
);

out.push(
  '\n## ⑥ 장비 × 경력별 본운동 후보 수(안전 거르기 전) — 0 인 칸이 한쪽 갇힘의 자리'
);
out.push(
  table(
    ['장비', '경력', '하체 스트렝스', '상체 스트렝스', '파워', '전체 후보'],
    poolByKitLevel.map((r) => [
      KIT_LABEL[r.kit],
      r.level,
      r.lower,
      r.upper,
      r.power,
      r.total,
    ])
  )
);

out.push(
  '\n## ⑪ 투구수 × 체감 강도(%, 경기 100%) 분포 — 대본(선수 12명 28일) vs 실제 기록(집계만)'
);
out.push(
  table(
    ['투구수 × 체감 강도', '대본', '실제'],
    Object.keys(scriptedDistribution.product).map((k) => [
      k,
      scriptedDistribution.product[k],
      realDistribution.product[k],
    ])
  )
);
out.push('');
out.push(
  table(
    ['실제 기록 · 투구수 \\ 체감 강도', ...INTENSITY_BANDS.map((b) => b.label)],
    PITCH_BANDS.map((pb) => [
      pb.label,
      ...INTENSITY_BANDS.map((ib) => realDistribution.cross[pb.label][ib.label]),
    ])
  )
);
out.push(
  `\n실제 기록 ${realDistribution.count}건(% 로 적은 줄 ${realDistribution.effortPctLogs}) · 체감 강도(%, 옛 줄은 강도 × 10)별 ${Object.entries(
    realDistribution.byEffortPct
  )
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')} · 종류별 ${Object.entries(realDistribution.bySessionType)
    .map(([k, v]) => `${k}:${v}`)
    .join(
      ' '
    )} · 지금 규칙의 세게 던진 날(같은 사람의 같은 날 기록을 합쳐 투구수 × 체감 강도 ≥ ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')} — facts.ts 와 같은 날 단위) ${pct(realDistribution.hardDaysByCurrentRule, realDistribution.thrownDays)}, 기록 한 줄씩 보면 ${pct(realDistribution.hardLogsByCurrentRule, realDistribution.count)}`
);

/* 검토안 2판 수치 — docs/designs/training-recommendation-engine.md '검토안 요지'와 P0 과제 메모에서 옮김 */
const comparison: { no: string; what: string; review: string; actual: string }[] = [
  {
    no: '①',
    what: '씨앗만 바꿈 → 목록 바뀜',
    review: '90.9%',
    actual: both(seedChanged, total, seedChangedApp, appTotal),
  },
  {
    no: '②',
    what: '체크인만 바꿈 → 목록 바뀜',
    review: '30.2%',
    actual: pct(checkinOne, withCheckin.length),
  },
  {
    no: '③',
    what: '투구 기록만 바꿈 → 테마 바뀜 = 목록 바뀜',
    review: '32.4%',
    actual: PITCH_VARIANTS.map(
      (k) =>
        `${PITCH_VARIANT_LABEL[k]}: 테마 ${pct(pitchStats[k].theme, pitchStats[k].d)} · 목록 ${pct(pitchStats[k].list, pitchStats[k].d)}`
    ).join(' / '),
  },
  {
    no: '④',
    what: '같은 설정 새 사용자 쌍 같은 목록',
    review: '46.9%',
    actual: pct(pairSame, pairDays),
  },
  {
    no: '⑤',
    what: '등판 답 없는 선발의 경기 날 근력',
    review: '10/11',
    /* 대본 2판 — 체크인하면 모두 답하니 '답 없는 선발'은 답을 지운 변형으로 잰다. 답 있는 아침을 나란히 */
    actual: `답을 지운 변형 ${gameMorningStarters.cleared.strength}/${gameMorningStarters.cleared.games}(컨디션 문턱 위만 ${gameMorningStarters.cleared.fitStrength}/${gameMorningStarters.cleared.fitGames}) · 답 있음 ${gameMorningStarters.answered.strength}/${gameMorningStarters.answered.games}`,
  },
  {
    no: '⑥',
    what: '상체 후보 0 일 때 한쪽 갇힘',
    review: '28일 중 21일',
    actual: bodyweightAlwaysRows
      .map((s) => `${s.name} ${sideText(s.sideRun)}`)
      .join(' / '),
  },
  {
    no: '⑦',
    what: '컨디션 늘 낮은 사용자 회복 날',
    review: '19~20/28',
    actual: lowConditionRows.map(recoveryText).join(' / '),
  },
  {
    no: '⑧',
    what: '라이브러리 노출',
    review: '55%',
    actual: `${both(exposed.size, library.length, exposedApp.size, library.length)} · 일정에 들어가는 카테고리만 ${both(exposed.size, schedulable.length, exposedApp.size, schedulable.length)}`,
  },
  {
    no: '⑨',
    what: '영양 · 나이(15↔22) 영향',
    review: '0',
    actual: `나이 ${pct(age15vs22, total)} · 영양 입력 없음`,
  },
];
out.push('\n## 검토안 2판 수치 vs 실제 표');
out.push(
  table(
    ['번호', '재는 것', '검토안 2판', '실제 표'],
    comparison.map((c) => [c.no, c.what, c.review, c.actual])
  )
);

console.log(out.join('\n'));

/* ---------------------------------- JSON ---------------------------------- */

const elapsedMs = Date.now() - startedAt;
const json = {
  /*
   * 3 = 대본 2판(2026-10-12): 체크인마다 등판 답 · 기록에 체감 강도(%) · ⑤ ⑫ 를 변형으로. 2 와 metrics.gameMorning · afterGame 모양이 다르다.
   * 4 = 2판 P4 커밋 C: 날마다 armSevere · metrics.armSevere(⑬ 팔 피로 '심함' 변형)를 더했다(buildCalls 도 그만큼 는다). 3 과 견줄 때는 이 칸을 뺀다.
   * 5 = 2판 P4 커밋 D: 날마다 heavyLower · nextGame · metrics.heavyLowerBeforeGame(⑭ 등판 전 무거운 하체)을 더했다(buildCalls 그대로).
   *     4 와 견줄 때는 이 칸을 뺀다.
   * 6 = 2판 P4 커밋 E: 날마다 dayRule · shorten · spikeTheme, metrics.dayKind(⑮ 날 종류 · 힘듦 급증 변형)를 더했다(buildCalls 는 체크인
   *     있는 날만큼 는다). 5 와 견줄 때는 이 칸을 뺀다.
   * 7 = 2판 P4 커밋 G: 체크인 있고 앞 14일에 경기가 있는 날마다 calendarGuess, metrics.calendarGuess(⑯ 다음 등판 짐작 — 달력 · 같은 요일
   *     변형)를 더했다(buildCalls 는 그런 날마다 셋 는다). 6 과 견줄 때는 이 칸 · buildCalls 를 뺀다 — 나머지는 글자까지 같다.
   * 8 = 2판 P5 도구 T0: 날마다 mainSets · stateVariants · stateAlert · unexplainedRecovery, metrics 의 ⑰~㉒(sameThemeState · direction ·
   *     fence · programDay · lowerGap · stateAlert), cohorts.extra(추가 묶음), gates(단계 목표)를 더했다. 대본에 팔 피로 · 힘듦이 들어갔지만
   *     지금 규칙엔 안 걸려 옛 칸은 meta · version · buildCalls 를 빼고 7 과 글자까지 같다(--compare 의 '옛 칸 같음').
   * 9 = 2판 P5-d 양 조절: 날마다 volumeSetsCut(조절이 실린 날만), stateVariants 의 bad · sore 에 volumed, metrics.volume 을 더했다.
   *     조절이 실린 날은 일정 · mainSets 가 바뀐다(동작 변화 — 8 과 견주면 그 날만 다르다).
   * 10 = 2판 P5 검토: metrics.volume.holdOnly(무게만 멈춘 날)를 더했다. volumeSetsCut · volumed 는 세트를 줄인 조절만 센다(무게만 멈춘
   *     조절 — setDelta 0 — 은 안 센다). 9 와 견줄 때는 이 칸을 뺀다.
   */
  version: 10,
  /* 돌릴 때마다 바뀌는 것은 이 칸뿐 — 단계 전후를 diff 로 견줄 때는 meta 를 빼고 본다 */
  meta: { generatedAt: new Date().toISOString(), elapsedMs },
  startKey: START_KEY,
  days: DAYS,
  appDays: appTotal,
  buildCalls,
  library: libraryStats,
  players: results.map((r, at) => ({
    ...r.player,
    summary: summaries[at],
    days: r.days.map((d) => ({
      date: d.date,
      theme: d.theme,
      label: d.label,
      mainCount: d.mainCount,
      veryHigh: d.veryHigh,
      hasCheckin: d.hasCheckin,
      seedChanged: d.seedChanged,
      remakeChanged: d.remakeChanged,
      checkinChanged: d.checkinChanged,
      pitchChanged: d.pitchChanged,
      age15vs22Differs: d.age15vs22Differs,
      age14vs22Differs: d.age14vs22Differs,
      throwPlan: d.throwPlan,
      answerClearedTheme: d.answerClearedTheme,
      afterGame: d.afterGame,
      armSevere: d.armSevere,
      heavyLower: d.heavyLower,
      nextGame: d.nextGame,
      dayRule: d.dayRule,
      shorten: d.shorten,
      spikeTheme: d.spikeTheme,
      calendarGuess: d.calendarGuess,
      yesterday: d.yesterday,
      today: d.today,
      ids: d.ids,
      mainSets: d.mainSets,
      stateVariants: d.stateVariants,
      stateAlert: d.stateAlert,
      unexplainedRecovery: d.unexplainedRecovery,
    })),
  })),
  metrics: {
    total,
    haltedDays,
    noCheckinDays,
    seedChanged: ratioPair(seedChanged, total, seedChangedApp, appTotal),
    remakeChanged: ratioPair(remakeChanged, total, remakeChangedApp, appTotal),
    checkinOne: {
      n: checkinOne,
      d: withCheckin.length,
      ratio: ratio(checkinOne, withCheckin.length),
    },
    checkinEach: Object.fromEntries(
      CHECKIN_VARIANTS.map((k) => [
        k,
        {
          n: checkinEach[k],
          d: withCheckin.length,
          ratio: ratio(checkinEach[k], withCheckin.length),
        },
      ])
    ),
    pitchChanged: Object.fromEntries(
      PITCH_VARIANTS.map((k) => [
        k,
        {
          ...pitchStats[k],
          themeRatio: ratio(pitchStats[k].theme, pitchStats[k].d),
          listRatio: ratio(pitchStats[k].list, pitchStats[k].d),
        },
      ])
    ),
    pairSame: {
      n: pairSame,
      d: pairDays,
      ratio: ratio(pairSame, pairDays),
      rows: pairRows,
    },
    pairTwinSame: {
      n: pairTwinSame,
      d: pairDays,
      ratio: ratio(pairTwinSame, pairDays),
    },
    gameMorning: { starters: gameMorningStarters, all: gameMorningAll },
    planThemes,
    sideRunMax: Math.max(...summaries.map((s) => s.sideRun.best)),
    sideRunKeyMax: Math.max(...summaries.map((s) => s.sideRunKey.best)),
    exposure: {
      ...ratioPair(exposed.size, library.length, exposedApp.size, library.length),
      schedulable: schedulable.length,
      schedulableRatio: ratio(exposed.size, schedulable.length),
      schedulableRatioApp: ratio(exposedApp.size, schedulable.length),
      byCategory: exposureByCategory,
    },
    poolByKitLevel,
    age15vs22: ratioPair(age15vs22, total, age15vs22App, appTotal),
    age14vs22: ratioPair(age14vs22, total, age14vs22App, appTotal),
    nutrition: '입력 자체가 없음',
    veryHigh: {
      age16to18: veryHigh16to18,
      age15: veryHighAt15,
      under15: veryHighUnder15,
    },
    afterHard: ratioPair(
      afterHardRecovery,
      afterHard.length,
      afterHardRecoveryApp,
      afterHardApp.length
    ),
    afterLightGameThemes: countBy(afterLightGame, (d) => d.theme),
    afterGame,
    armSevere,
    heavyLowerBeforeGame,
    dayKind,
    calendarGuess,
    loadDistribution: { scripted: scriptedDistribution, real: realDistribution },
    /* 2판 P5 도구 T0 — ⑰~㉒(머리 주석의 번호 표) */
    sameThemeState,
    direction,
    volume,
    fence,
    programDay,
    lowerGap,
    stateAlert,
    classCounts,
  },
  comparison,
  /* 추가 묶음 — 분모 따로(①~⑯ 에 안 섞는다). 선수 함수 칸(대본)은 JSON 에 안 실린다 */
  cohorts: {
    extra: {
      players: extraResults.map((r) => ({
        name: r.player.name,
        purpose: r.player.purpose ?? null,
        age: r.player.age,
        level: r.player.level,
        kit: r.player.kit,
        goal: r.player.goal,
        minutes: r.player.minutes,
        role: r.player.role,
        program: r.player.program ?? null,
        days: r.days,
      })),
      summary: extraSummary,
    },
  },
};
/* 단계 목표 — 위 JSON 으로 잰다(scripts/training-baseline-gates.mts). 고른 단계가 없으면 모두 보이기만 한다 */
const gateRows = gateResults(json as unknown as BaselineJson, GATE_STAGE);
const jsonWithGates = { ...json, gates: gateRows };

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(jsonWithGates, null, 2));

const tail: string[] = [];
tail.push(
  `\n## 단계 목표(--gate${GATE_STAGE ? `=${GATE_STAGE} — 그 단계까지의 막는 목표` : ' 없음 — 보이기만'})`
);
tail.push(
  table(
    ['번호', '단계', '재는 것', '목표', '지금', '맞음'],
    gateRows.map((g) => [
      g.no,
      g.stage + (g.blocking ? '' : '(참고)'),
      g.what,
      g.target,
      gateValueText(g),
      g.pass == null ? '못 잼' : g.pass ? '맞음' : g.applies ? '아님' : '아직',
    ])
  )
);
if (compareBefore) {
  /* 전후 비교 — 옛 칸이 글자 그대로인가(새 칸만 더해졌나), 번호마다 대표 값, 28일 테마 · 목록이 그대로인 선수 */
  const same = oldFieldsSame(compareBefore, jsonWithGates);
  const roster = rosterChanges(compareBefore, jsonWithGates as unknown as BaselineJson);
  tail.push(`\n## 전후 비교 — 앞 ${COMPARE_PATH}`);
  tail.push(
    `\n옛 칸 같음 ${same.same}(meta · version · buildCalls · gates 를 빼고, 다른 곳 ${same.count})${same.paths.length ? ` · ${same.paths.join(' · ')}` : ''}`
  );
  tail.push(
    `28일 테마 · 목록이 그대로인 선수 ${roster.same.length}명(${roster.same.join(' · ') || '없음'}) · 바뀐 선수 ${roster.changed.join(' · ') || '없음'}`
  );
  tail.push('');
  tail.push(
    table(
      ['번호', '재는 것', '앞', '뒤'],
      HEADLINES.map((h) => [
        h.no,
        h.what,
        h.text(compareBefore),
        h.text(jsonWithGates as unknown as BaselineJson),
      ])
    )
  );
}
console.log(tail.join('\n'));
console.log(`JSON → ${OUT_PATH}`);
/* --gate 를 줬을 때만 막는다 — 안 주면 늘 0(예전처럼 재기만) */
const failed = GATE_STAGE ? failedGates(gateRows) : [];
if (failed.length > 0) {
  console.log(
    `\n단계 목표 ${GATE_STAGE} 못 맞춤 ${failed.length}개: ${failed.map((g) => `${g.no} ${g.what}(${gateValueText(g)}, 목표 ${g.target})`).join(' / ')}`
  );
  process.exitCode = 1;
}
/* 걸린 시간은 stdout 마지막 줄에만 — 위 표는 돌릴 때마다 같아야 diff 로 견줄 수 있다 */
console.log(`걸린 시간 ${(elapsedMs / 1000).toFixed(1)}초`);
