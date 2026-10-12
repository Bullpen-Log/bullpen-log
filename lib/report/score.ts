/**
 * 고르기 점수 — 트레이닝 추천 2판 P5(2026-10-12, docs/designs/training-recommendation-engine.md · 검토안 4-3).
 *
 * 왜 두는가. 안전 거르기(lib/report/prescription.ts selectCandidates)를 지난 후보는 지금 '오래 안 한 것부터 · 같으면 씨앗'으로만
 * 줄을 선다(theme.ts orderCandidates). 그래서 어깨가 뻐근하다고 한 날 · 내일 등판인 날 · 팔이 피곤한 날에도 같은 줄에서 같은 운동이
 * 뽑혔다(기준선 ⑰: 같은 테마에서 오늘 상태만 바꿨을 때 목록이 바뀐 짝 11.4%, 후보가 같은 짝은 0%). 여기서 오늘 상태를 운동마다
 * 작은 정수로 매겨 '뒤로 · 앞으로'만 정한다. 빼는 일은 하지 않는다 — 빼는 것은 안전 거르기의 몫이고, 점수는 남은 후보의 차례만
 * 바꾼다. 그래서 점수가 틀려도 위험한 운동이 들어오지 않는다.
 *
 * 끼우는 자리(P5-i · P5-j): orderCandidates 의 무리(최근 · 돌아올 때 · 처음 · 이른) 안에서 첫째 키로만 쓴다. 무리 나누기 ·
 * 번갈아 내기 · 안정 분할(목표 · 부위 · 종류)은 점수보다 위에 남고, 동점은 지금 키(오래된 것 · 씨앗 · 원래 차례)가 가른다. 부르는 곳은
 * 일정 만들기 한 곳(lib/report/daily-plan.ts buildDailyPlan — 재료 score 를 넘긴 날만, P5-j)이다. 오늘 뺀 운동은 거기서 최근 사흘 무리처럼
 * 맨 뒤로 보낸다 — −3 만으로는 그 운동이 무리에 혼자 있을 때 차례가 안 바뀐다. 이 파일의 −3 은 그 운동의 이유 글 · 일정 까닭으로 남는다.
 *
 * 항목 일곱(열쇠 하나에 값 하나, 0 이면 안 싣는다)
 *   outing    다음 등판이 2일 안(OUTING_NEAR_DAYS) — 하체 점프(isLowerPower) · 천천히 내리는 하체(isLowerEccentric)   −3
 *   stiff     조심할 관절(뻐근 · 최근 통증 · 재활 · 메모 — prescription.ts easedJointsOf)의 부위를 쓰는 '중간' 이상 운동   −2
 *             회복 날에는 뻐근한 부위를 푸는 가동성 · 회복 운동                                                        +2
 *   arm       팔 피로 '조금'(2) 이상 — 무거운 상체 밀기 · 팔로 던지는 파워 · 손으로 쥐는 '중간' 이상 운동             −2
 *   program   다음 근력 프로그램 날이 내일 안(PROGRAM_NEAR_DAYS) — 그날 프로그램과 같은 동작 열쇠(movementKeyOf)       −3
 *   swapped   오늘 일정에서 뺀 운동 −3, 최근 60일에 두 번 이상 바꿔서 뺀 운동(plan-swaps.ts swappedOutCounts) −2
 *   pattern   2주 동안 한 번도 안 한 큰 동작 계열(스쿼트 · 힌지 · 런지 · 밀기 · 당기기 · 회전 · 운반)의 무게 운동   +2
 *   favorite  즐겨찾기한 운동                                                                                          +1
 *
 * 값을 이렇게 둔 까닭. 등판 · 프로그램 겹침(−3)은 다음 날 몸에 남는 것이라 가장 크게, 몸이 오늘 말한 것(뻐근 · 팔 피로 −2)은 그다음,
 * 사용자의 취향(즐겨찾기 +1)은 동점을 가르는 정도로. 바꿔서 뺀 운동은 '오늘 뺐다'가 가장 분명한 말이라 −3(다시 만들기가 방금 뺀
 * 운동을 되돌리지 않게 — 설계 검토), 지난 기록은 두 번부터 −2.
 *
 * 몸 · 약속을 지키는 항목이 이긴다(2판 P5 검토, 2026-10-13). 지키는 항목(PROTECT_KEYS — 등판 · 조심할 관절 · 팔 · 프로그램 · 뺀 운동의
 * '−')이 하나라도 걸린 운동은 고르는 쪽 항목(계열 +2 · 즐겨찾기 +1 · 회복 날 풀기 +2)을 안 싣는다. 처음에는 그냥 더해 상쇄됐다 — 어깨가
 * 뻐근한 날 즐겨찾기한 덤벨 벤치 프레스(2주 안 한 '밀기')는 −2 +2 +1 = +1 로 덤벨 로우(−2)보다 앞에 섰고, 등판 모레 즐겨찾기한 노르딕
 * 컬은 −3 +2 +1 = 0 으로 전혀 뒤로 가지 않았다. 지키는 항목은 모두 −2 이하라, 걸린 운동의 합은 늘 0 보다 작고 안 걸린 운동은 0 이상이다 —
 * 같은 무리에서 걸린 운동이 안 걸린 운동보다 앞에 서지 않는다(자체 시험 불변식).
 *
 * 빼 둔 것: '오래 안 한 가동성 +1'. 무리가 이미 '오래 안 한 것(돌아올 때 · 처음)'을 앞에 세우므로, 같은 무리 안의 가동성은 모두 같은
 * +1 을 받아 차례를 못 가른다(구간마다 같은 카테고리끼리 겨룬다 — theme.ts pickForTheme). 순서를 못 바꾸는 항목이 이유 글에서
 * '앞에 뒀어요'라고 말하면 거짓이 된다. 근육통(전신)은 부위가 없어 여기 없다 — 안전 거르기(4-1)와 양 조절(세트 −1)이 본다.
 *
 * 순수 파일이다 — DB · server-only · 날짜 함수 · 난수 없음. 같은 입력이면 늘 같은 값이다(parts · detail 의 칸 차례까지). theme.ts 는
 * 타입만 부른다(theme 이 이 파일을 부를 일이 생겨도 순환이 안 되게). 판정은 exercise-class(분류 한 곳) · prescription(조심할 관절)을
 * 그대로 쓴다 — 여기서 정의를 다시 적으면 거르기와 점수가 다른 운동을 말한다.
 */
import {
  CHECKIN_PARTS,
  armFatigueWord,
  type CheckinPartKey,
  type OutingWindow,
} from '@/lib/checkin';
import type { DayState, ProgramCommitment } from '@/lib/engine/day-state';
import {
  HEAVY_CATEGORIES,
  isArmPlyo,
  isHeavyUpperPush,
  isLowerEccentric,
  isLowerPower,
  movementKeyOf,
  type ClassifiableExercise,
} from '@/lib/engine/exercise-class';
import type { OutingNextSource } from '@/lib/engine/outing';
import {
  INTENSITY_CAP,
  intensityLevel,
  type MOVEMENT_PATTERNS,
} from '@/lib/exercise-meta';
import type { ReportFacts } from '@/lib/report/facts';
import {
  checkinPartLabel,
  easedBodyPartsOf,
  easedJointsOf,
  type EasedJoint,
  type EasedSource,
} from '@/lib/report/prescription';
import type { ThemeKey } from '@/lib/report/theme';

/* ─────────────────────────── 상수 ─────────────────────────── */

export type ScoreKey =
  'outing' | 'stiff' | 'arm' | 'program' | 'swapped' | 'pattern' | 'favorite';

/**
 * 항목 차례 — parts · detail 에 싣는 차례이자, 값의 크기가 같을 때 이유 글이 고르는 차례. 다음 날 몸에 남는 것(등판) → 오늘 몸이
 * 말한 것(관절 · 팔) → 하기로 한 것(프로그램) → 사용자가 한 일(뺌) → 앱이 채우는 것(계열) → 취향(즐겨찾기).
 */
export const SCORE_KEYS: readonly ScoreKey[] = [
  'outing',
  'stiff',
  'arm',
  'program',
  'swapped',
  'pattern',
  'favorite',
];

/**
 * 몸 · 약속을 지키는 항목 — 이 가운데 '−'가 하나라도 걸리면 고르는 쪽 항목(계열 · 즐겨찾기 · 회복 날 풀기)을 안 싣는다(머리 주석).
 * stiff 는 '−'(조심할 관절을 쓴다)일 때만 지키는 항목이고, '+'(회복 날 풀기)는 고르는 쪽이다.
 */
export const PROTECT_KEYS: readonly ScoreKey[] = [
  'outing',
  'stiff',
  'arm',
  'program',
  'swapped',
];

/** 지키는 항목의 '−'가 걸렸나 — 저장된 JSON 도 넘어오니 숫자인지 본다 */
export function hasProtect(parts: ScoreParts | null | undefined): boolean {
  if (!parts || typeof parts !== 'object') return false;
  return PROTECT_KEYS.some((k) => {
    const v = parts[k];
    return typeof v === 'number' && v < 0;
  });
}

/** 항목 값 — 머리 주석의 표 */
export const SCORE_POINTS = {
  outing: -3,
  stiff: -2,
  stiffLoosen: 2,
  arm: -2,
  program: -3,
  swapped: -2,
  swappedToday: -3,
  pattern: 2,
  favorite: 1,
} as const;

/**
 * 다음 등판이 이 날수 안이면 다리에 남는 하체를 뒤로 민다 — 2일. 사흘 넘게 남으면 하체 근력을 해도 등판 날엔 풀린다(검토안 4-2
 * '4일 이상 뒤: 무거운 하체'). 2~3일 뒤는 안전 거르기(2-2, HEAVY_LOWER_BLOCK_WITHIN_DAYS 3)가 무거운 하체를 이미 빼고, 여기서는
 * 거르기를 지난 가벼운 쪽(노르딕 컬 · 에센트릭 포즈 고블렛 스쿼트 같은 천천히 내리는 하체)을 뒤로 민다 — 근육통이 가장 크게 남는다.
 */
export const OUTING_NEAR_DAYS = 2;

/**
 * 팔 피로가 이 값('조금') 이상이면 팔을 많이 쓰는 운동을 뒤로 민다. 눈금 셋의 몫(lib/checkin.ts SEVERE_ARM_FATIGUE 주석): '심함'은
 * 안전 거르기가 빼고, '많이'는 암케어를 회복으로 돌리고, 그 아래는 점수로만 본다.
 */
export const ARM_FATIGUE_MIN = 2;

/**
 * 다음 근력 프로그램 날이 이 날수 안이면 그날과 같은 동작을 뒤로 민다 — 내일(1). 오늘 바벨 스쿼트를 하고 내일 프로그램 스쿼트가
 * 오면 하루 만에 같은 동작이다. 모레(48시간)는 같은 계열을 다시 해도 되는 간격이라 안 민다. 무거운 하체가 이틀 이어지는 것을 0 으로
 * 막는 일은 중재(P6)의 거르기 몫이다 — 점수는 차례만 바꿔서 대안이 없으면 그대로 뽑힌다.
 */
export const PROGRAM_NEAR_DAYS = 1;

/**
 * 최근 이 날수 안에 프로그램 날을 한 번이라도 마친 사람만 프로그램 겹침을 본다 — 10일. 프로그램을 시작해 두고 안 하는 사람에게
 * 몇 주씩 스쿼트가 뒤로 밀리지 않게(설계 검토). 프로그램은 8일 넘게 쉬면 '쉰 기간'으로 본다(program.ts decideToday restGap).
 */
export const PROGRAM_FOLLOW_DAYS = 10;

/** 최근 60일에 이만큼 바꿔서 뺐으면 뒤로 민다 — 한 번은 그날 장비 · 기분일 수 있다(plan-swaps.ts 머리 주석) */
export const SWAPPED_MIN = 2;

type PatternName = (typeof MOVEMENT_PATTERNS)[number]['name'];

/**
 * 2주 동안 안 했으면 앞으로 당기는 큰 동작 계열. 고립(컬 · 레이즈)과 카프는 뺀다 — 안 했다고 앞으로 당기면 본운동 자리를 보조
 * 운동이 차지한다(exercise-meta.ts MOVEMENT_PATTERNS 의 '고립' 주석과 같은 까닭).
 */
export const NEGLECT_PATTERNS: readonly string[] = [
  '스쿼트',
  '힌지',
  '런지',
  '밀기',
  '당기기',
  '회전',
  '운반',
] satisfies PatternName[];

/**
 * 관절을 푸는 카테고리 — 회복 날에 뻐근한 부위면 앞으로(+2), 그 밖의 날에도 관절 · 팔 항목으로 뒤로 밀지 않는다(푸는 운동을
 * '그 부위를 써서'라고 미루면 거꾸로다).
 */
export const LOOSEN_CATEGORIES: readonly string[] = ['모빌리티', '회복 및 보강'];

/** 쥐는 힘을 쓰는 표시 — 손목·전완 부위 · 운반(파머스 캐리) */
const GRIP_PART = '손목·전완';
const GRIP_PATTERN = '운반';

/** '오늘 이렇게 짰어요' 줄의 최대 수 — 화면은 목표 · 까닭 밑에 짧게(2026-10-12 사용자: "설정이유만, 보기 간편하게") */
export const PLAN_REASONS_MAX = 3;

/* ─────────────────────────── 계약 ─────────────────────────── */

/** 점수를 매길 운동 — 라이브러리 줄 · 캐시 · 자체 시험의 가짜 운동이 모두 넘길 수 있게 좁게 둔다 */
export type ScorableExercise = ClassifiableExercise & { id: string; title: string };

/** 다음 근력 프로그램 날 — 그날의 동작 열쇠(program.ts patternsOfProgramDay)와 며칠 뒤인가 */
export type ProgramNext = { patterns: ReadonlySet<string>; inDays: number };

/**
 * 점수가 보는 오늘 — 부르는 쪽이 한 번 만들어 후보 모두에 쓴다(scoreContextOf). 모든 칸이 '모름'이어도 된다(그 항목이 꺼진다).
 */
export type ScoreContext = {
  /** 오늘 테마 — 회복 날의 '뻐근한 부위 풀기 +2'만 읽는다 */
  theme: ThemeKey;
  /** 부위(BodyPart 이름) → 그 부위를 조심하는 관절(prescription.ts easedBodyPartsOf) */
  eased: ReadonlyMap<string, EasedJoint>;
  /** 다음 등판(오늘 상태 한 장의 outing 칸 그대로), 모르면 null */
  outing: { daysUntilNext: OutingWindow | null; nextSource: OutingNextSource } | null;
  /** 오늘 팔 피로(1~5), 안 적었으면 null */
  armFatigue: number | null;
  /** 다음 근력 프로그램 날(programNextOf), 프로그램이 없거나 안 따르면 null */
  programNext: ProgramNext | null;
  /** 최근 2주에 마친 동작 계열별 날 수(daily-plan.ts patternsDoneFrom) — 마친 날이 없으면 null(항목이 꺼진다) */
  patternsDone14d: ReadonlyMap<string, number> | null;
  /** 최근 60일 운동별 '바꿔서 뺀' 횟수(plan-swaps.ts swappedOutCounts) */
  swappedOut: ReadonlyMap<string, number>;
  /** 오늘 일정에서 바꿔서 뺀 운동(plan-swaps.ts swappedOutOf — '다시 만들기' 전의 일정) */
  swappedOutToday: ReadonlySet<string>;
  /** 즐겨찾기한 운동(lib/favorites.ts favoriteExerciseIds) */
  favoriteIds: ReadonlySet<string>;
};

/** 항목마다 왜 걸렸나 — 이유 글이 읽는다(값만 저장한 옛 줄이면 없을 수 있다) */
export type ScoreDetail = {
  outing?: {
    min: number;
    max: number | null;
    source: OutingNextSource;
    /** 하체 점프 · 천천히 내리는 하체 */
    kind: 'jump' | 'eccentric';
  };
  stiff?: {
    joint: CheckinPartKey;
    source: EasedSource;
    /** 회복 날 푸는 운동이라 앞으로(+2)인가 */
    loosen: boolean;
  };
  arm?: {
    fatigue: number;
    /** 무거운 밀기 · 팔로 던지는 파워 · 손으로 쥐는 운동 */
    kind: 'push' | 'throw' | 'grip';
  };
  program?: { key: string; inDays: number };
  swapped?: { today: boolean; count: number };
  pattern?: { pattern: string };
  favorite?: true;
};

export type ScoreParts = Partial<Record<ScoreKey, number>>;

export type ExerciseScore = {
  /** 항목 값의 합 — 무리 안 차례의 첫째 키(클수록 앞) */
  total: number;
  /** 걸린 항목의 값(0 은 안 싣는다, SCORE_KEYS 차례) */
  parts: ScoreParts;
  detail: ScoreDetail;
};

/* ─────────────────────────── 만들기 ─────────────────────────── */

/**
 * 다음 근력 프로그램 날 — 진행 중인 프로그램(오늘 상태 한 장의 commitments.program)과 다음 일차의 동작 열쇠로.
 *
 *   다 마쳤거나 · 마친 날을 모르거나 · 10일(PROGRAM_FOLLOW_DAYS) 넘게 안 했으면 null(안 따르는 프로그램)
 *   오늘 프로그램 날을 마쳤으면 다음은 이르면 모레(어제가 프로그램 날이면 쉬는 규칙 — program.ts decideToday 'spacing')
 *   그 밖에는 이르면 내일 — 어제 했으면 오늘이 쉬는 칸이라 내일이고, 그 전이면 오늘도 될 수 있지만 오늘은 매일 일정을 만드는 날이다
 * 일차의 동작 열쇠는 부르는 쪽이 patternsOfProgramDay(parseProgram(key), nextDay, 고정 운동)로 낸다 — 이 파일이 program.ts 를 안
 * 부르게(프로그램 정의가 크다). 열쇠가 없으면 null.
 */
export function programNextOf({
  commitment,
  patterns,
}: {
  commitment: ProgramCommitment | null | undefined;
  patterns: ReadonlySet<string>;
}): ProgramNext | null {
  if (!commitment || commitment.done) return null;
  const since = commitment.daysSinceLastDone;
  if (since == null || since < 0 || since > PROGRAM_FOLLOW_DAYS) return null;
  if (patterns.size === 0) return null;
  return { patterns: new Set(patterns), inDays: since === 0 ? 2 : 1 };
}

/**
 * 점수가 보는 오늘을 만든다 — 조심할 관절은 안전 거르기와 같은 함수(easedJointsOf · 메모 caution 포함), 등판 · 팔 피로는 오늘 상태
 * 한 장에서. 나머지(프로그램 · 2주 계열 · 뺀 기록 · 즐겨찾기)는 DB 를 읽는 쪽이 넘긴다 — 안 넘기면 그 항목이 꺼진다.
 */
export function scoreContextOf({
  theme,
  facts,
  state,
  caution = [],
  programNext = null,
  patternsDone14d = null,
  swappedOut = new Map(),
  swappedOutToday = new Set(),
  favoriteIds = new Set(),
}: {
  theme: ThemeKey;
  facts: ReportFacts;
  state: Pick<DayState, 'outing' | 'arm'>;
  caution?: readonly { part: CheckinPartKey; why: string }[];
  programNext?: ProgramNext | null;
  patternsDone14d?: ReadonlyMap<string, number> | null;
  swappedOut?: ReadonlyMap<string, number>;
  swappedOutToday?: ReadonlySet<string>;
  favoriteIds?: ReadonlySet<string>;
}): ScoreContext {
  return {
    theme,
    eased: easedBodyPartsOf(easedJointsOf(facts, caution)),
    outing: {
      daysUntilNext: state.outing.daysUntilNext,
      nextSource: state.outing.nextSource,
    },
    armFatigue: state.arm.fatigue,
    programNext,
    patternsDone14d,
    swappedOut,
    swappedOutToday,
    favoriteIds,
  };
}

/** 관절 출처의 차례 — prescription.ts EASED_SOURCE_ORDER 와 같다(오늘 사용자가 직접 말한 것부터) */
const SOURCE_RANK: Record<EasedSource, number> = {
  stiff: 0,
  recentPain: 1,
  rehab: 2,
  memo: 3,
};

/** 운동이 쓰는 부위 가운데 조심하는 관절 하나 — 출처 차례가 앞선 것, 같으면 운동의 부위 차례 */
function easedJointOf(
  ex: ScorableExercise,
  eased: ReadonlyMap<string, EasedJoint>
): EasedJoint | null {
  let best: EasedJoint | null = null;
  for (const part of ex.bodyParts) {
    const joint = eased.get(part);
    if (joint && (!best || SOURCE_RANK[joint.source] < SOURCE_RANK[best.source]))
      best = joint;
  }
  return best;
}

/**
 * 운동 하나의 점수. 같은 운동 · 같은 ctx 면 늘 같은 값이다. ctx 를 바꾸지 않는다.
 */
export function scoreOf(ex: ScorableExercise, ctx: ScoreContext): ExerciseScore {
  const parts: ScoreParts = {};
  const detail: ScoreDetail = {};
  const loosens = LOOSEN_CATEGORIES.includes(ex.category);
  /* 관절에 무게가 실리는가 — 푸는 카테고리가 아니고 '중간' 이상(모르는 강도는 가장 센 쪽 — intensityLevel) */
  const loads = !loosens && intensityLevel(ex.intensity) >= INTENSITY_CAP.MODERATE;

  /* outing */
  const w = ctx.outing?.daysUntilNext ?? null;
  if (ctx.outing && w && w.min <= OUTING_NEAR_DAYS) {
    const kind = isLowerPower(ex) ? 'jump' : isLowerEccentric(ex) ? 'eccentric' : null;
    if (kind) {
      parts.outing = SCORE_POINTS.outing;
      detail.outing = { min: w.min, max: w.max, source: ctx.outing.nextSource, kind };
    }
  }

  /* stiff */
  const joint = easedJointOf(ex, ctx.eased);
  if (joint) {
    if (ctx.theme === 'recovery' && loosens && joint.source === 'stiff') {
      parts.stiff = SCORE_POINTS.stiffLoosen;
      detail.stiff = { joint: joint.key, source: joint.source, loosen: true };
    } else if (loads) {
      parts.stiff = SCORE_POINTS.stiff;
      detail.stiff = { joint: joint.key, source: joint.source, loosen: false };
    }
  }

  /* arm */
  const fatigue = ctx.armFatigue;
  if (fatigue != null && fatigue >= ARM_FATIGUE_MIN) {
    const kind = isHeavyUpperPush(ex)
      ? 'push'
      : isArmPlyo(ex)
        ? 'throw'
        : loads &&
            (ex.bodyParts.includes(GRIP_PART) || ex.movementPattern === GRIP_PATTERN)
          ? 'grip'
          : null;
    if (kind) {
      parts.arm = SCORE_POINTS.arm;
      detail.arm = { fatigue, kind };
    }
  }

  /* program */
  const next = ctx.programNext;
  if (next && next.inDays <= PROGRAM_NEAR_DAYS) {
    const key = movementKeyOf(ex);
    if (key != null && next.patterns.has(key)) {
      parts.program = SCORE_POINTS.program;
      detail.program = { key, inDays: next.inDays };
    }
  }

  /* swapped */
  const today = ctx.swappedOutToday.has(ex.id);
  const count = ctx.swappedOut.get(ex.id) ?? 0;
  if (today || count >= SWAPPED_MIN) {
    parts.swapped = today ? SCORE_POINTS.swappedToday : SCORE_POINTS.swapped;
    detail.swapped = { today, count };
  }

  /* pattern */
  const pattern = ex.movementPattern ?? null;
  if (
    ctx.patternsDone14d &&
    HEAVY_CATEGORIES.includes(ex.category) &&
    pattern != null &&
    NEGLECT_PATTERNS.includes(pattern) &&
    (ctx.patternsDone14d.get(pattern) ?? 0) === 0
  ) {
    parts.pattern = SCORE_POINTS.pattern;
    detail.pattern = { pattern };
  }

  /* favorite */
  if (ctx.favoriteIds.has(ex.id)) {
    parts.favorite = SCORE_POINTS.favorite;
    detail.favorite = true;
  }

  /*
   * 지키는 항목이 이긴다(머리 주석) — '−'가 하나라도 걸렸으면 고르는 쪽 항목을 내린다. 나중에 지우는 까닭: 항목마다 걸리는 때를 위에서
   * 한 번씩만 적으려고(먼저 지키는 항목을 다 본 뒤 고르는 쪽을 보게 줄을 섞으면 칸 차례 SCORE_KEYS 를 따로 맞춰야 한다).
   */
  if (hasProtect(parts)) {
    delete parts.pattern;
    delete detail.pattern;
    delete parts.favorite;
    delete detail.favorite;
    if ((parts.stiff ?? 0) > 0) {
      delete parts.stiff;
      delete detail.stiff;
    }
  }

  const total = SCORE_KEYS.reduce((sum, k) => sum + (parts[k] ?? 0), 0);
  return { total, parts, detail };
}

/* ─────────────────────────── 글 ─────────────────────────── */

/** 마지막 글자에 받침이 있나 — 따옴표 · 가운뎃점 · 빈칸은 건너뛰고 본다. 숫자는 읽는 소리로(영 · 일 · 삼 · 육 · 칠 · 팔) */
function hasFinal(word: string): boolean {
  for (let i = word.length - 1; i >= 0; i--) {
    const c = word.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
    if (c >= 0x30 && c <= 0x39) return '013678'.includes(word[i]);
    if (/[A-Za-z]/.test(word[i])) return false;
  }
  return false;
}

/** 조사를 붙인다 — josa('힌지', '을', '를') → '힌지를' */
function josa(word: string, withFinal: string, withoutFinal: string): string {
  return word + (hasFinal(word) ? withFinal : withoutFinal);
}

/** 관절 이름 여럿 — 체크인 부위 차례, 둘까지(글을 짧게) */
function jointsText(keys: Iterable<CheckinPartKey>): string {
  const set = new Set(keys);
  return CHECKIN_PARTS.filter((p) => set.has(p.key))
    .slice(0, 2)
    .map((p) => checkinPartLabel(p.key))
    .join('·');
}

/** 0 오늘 · 1 내일 · 2 모레, 그 밖은 'n일 뒤' */
function dayWord(days: number): string {
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  if (days === 2) return '모레';
  return `${days}일 뒤`;
}

/**
 * 등판이 가깝다는 앞말 — 어디서 알았는지를 붙인다(오늘 상태 한 장 whyLines 와 같은 갈래). 짐작한 출처(달력 · 같은 요일)는 하루로
 * 못 박힌 날만 온다(outing.ts).
 */
function outingCause(d: NonNullable<ScoreDetail['outing']>): string {
  const exact = d.max === d.min;
  const when = exact
    ? `${dayWord(d.min)} 등판이라`
    : d.max == null
      ? `등판이 ${d.min}일 이상 뒤라`
      : `등판이 ${d.min}~${d.max}일 뒤라`;
  if (d.source === 'calendar') return `달력에 ${dayWord(d.min)} 등판이 있어`;
  if (d.source === 'estimate')
    return `같은 요일 경기로 보면 ${dayWord(d.min)} 등판이라`;
  if (d.source === 'checkin-yesterday') return `어제 답으로 보면 ${when}`;
  return when;
}

const OUTING_OBJECT: Record<NonNullable<ScoreDetail['outing']>['kind'], string> = {
  jump: '하체 점프',
  eccentric: '천천히 내리는 하체 운동',
};

const ARM_OBJECT: Record<NonNullable<ScoreDetail['arm']>['kind'], string> = {
  push: '무거운 밀기',
  throw: '팔로 던지는 파워',
  grip: '손으로 쥐는 운동',
};

/** "팔 피로가 '보통'이라" — 말을 모르면 숫자 */
function armCause(fatigue: number): string {
  const word = armFatigueWord(fatigue) ?? `${fatigue}`;
  return `팔 피로가 '${word}'${hasFinal(word) ? '이라' : '라'}`;
}

/** 관절을 조심하는 까닭 앞말 — 출처마다(재활 관절을 '뻐근하다고 해서'로 말하지 않게) */
function jointCause(source: EasedSource, labels: string): string {
  if (source === 'stiff') return `${josa(labels, '이', '가')} 뻐근하다고 해서`;
  if (source === 'recentPain')
    return `최근 ${josa(labels, '이', '가')} 아팠던 적이 있어`;
  if (source === 'rehab') return `${labels} 재활 중이라`;
  return `메모에 ${josa(labels, '이', '가')} 불편하다고 해서`;
}

/** 값만 있고 왜는 모를 때(값만 저장한 줄) 쓰는 글 */
function fallbackLine(
  key: ScoreKey,
  value: number,
  ex: { movementPattern?: string | null }
): string {
  switch (key) {
    case 'outing':
      return '등판이 가까워 다리에 남는 운동은 뒤로 뒀어요.';
    case 'stiff':
      return value > 0
        ? '뻐근한 부위를 풀어 주려고 앞에 뒀어요.'
        : '조심할 부위를 써서 뒤로 뒀어요.';
    case 'arm':
      return '팔이 피곤해 팔을 많이 쓰는 운동은 뒤로 뒀어요.';
    case 'program':
      return '근력 프로그램과 같은 동작이라 뒤로 뒀어요.';
    case 'swapped':
      return value <= SCORE_POINTS.swappedToday
        ? '오늘 뺀 운동이라 뒤로 뒀어요.'
        : '여러 번 뺀 운동이라 뒤로 뒀어요.';
    case 'pattern':
      return ex.movementPattern
        ? `2주 동안 ${josa(ex.movementPattern, '을', '를')} 안 해서 앞에 뒀어요.`
        : '2주 동안 안 한 동작이라 앞에 뒀어요.';
    case 'favorite':
      return '즐겨찾기한 운동이라 앞에 뒀어요.';
  }
}

/** 운동 하나에 붙는 한 줄 — 항목 하나(값 · 왜)로 */
function lineFor(
  key: ScoreKey,
  value: number,
  detail: ScoreDetail,
  ex: { movementPattern?: string | null }
): string {
  switch (key) {
    case 'outing': {
      const d = detail.outing;
      if (!d) break;
      return `${outingCause(d)} ${josa(OUTING_OBJECT[d.kind], '은', '는')} 뒤로 뒀어요.`;
    }
    case 'stiff': {
      const d = detail.stiff;
      if (!d) break;
      const label = checkinPartLabel(d.joint);
      return d.loosen
        ? `뻐근한 ${josa(label, '을', '를')} 풀어 주려고 앞에 뒀어요.`
        : `${jointCause(d.source, label)} 뒤로 뒀어요.`;
    }
    case 'arm': {
      const d = detail.arm;
      if (!d) break;
      return `${armCause(d.fatigue)} ${josa(ARM_OBJECT[d.kind], '은', '는')} 뒤로 뒀어요.`;
    }
    case 'program': {
      const d = detail.program;
      if (!d) break;
      /* 날은 말하지 않는다 — inDays 는 '이르면 내일'이라는 짐작이다(programNextOf, 앱은 프로그램 일정을 모른다) */
      return `다음 근력 프로그램에 ${josa(d.key, '이', '가')} 있어 뒤로 뒀어요.`;
    }
    case 'swapped': {
      const d = detail.swapped;
      if (!d) break;
      return d.today
        ? '오늘 뺀 운동이라 뒤로 뒀어요.'
        : `최근 ${d.count}번 뺀 운동이라 뒤로 뒀어요.`;
    }
    case 'pattern': {
      const d = detail.pattern;
      if (!d) break;
      return `2주 동안 ${josa(d.pattern, '을', '를')} 안 해서 앞에 뒀어요.`;
    }
    case 'favorite':
      if (!detail.favorite) break;
      return '즐겨찾기한 운동이라 앞에 뒀어요.';
  }
  return fallbackLine(key, value, ex);
}

/** 값의 크기가 가장 큰 항목 — 같으면 SCORE_KEYS 차례. 걸린 것이 없으면 null */
function strongestKey(parts: ScoreParts): ScoreKey | null {
  let best: ScoreKey | null = null;
  for (const k of SCORE_KEYS) {
    const v = parts[k];
    if (v == null || v === 0) continue;
    if (best == null || Math.abs(v) > Math.abs(parts[best]!)) best = k;
  }
  return best;
}

/**
 * 운동 하나의 이유 한 줄 — 값의 크기가 가장 큰 항목 하나로(같으면 SCORE_KEYS 차례). 걸린 항목이 없으면 null.
 * 해요체 · 줄표 없음 · 60자 안(자체 시험 글 격자가 지킨다). detail 이 없으면(값만 저장한 줄) 항목마다 정해 둔 글로 말한다.
 */
export function reasonLineOf(
  ex: { movementPattern?: string | null },
  score: { parts: ScoreParts; detail?: ScoreDetail }
): string | null {
  const key = strongestKey(score.parts);
  if (key == null) return null;
  return lineFor(key, score.parts[key]!, score.detail ?? {}, ex);
}

/**
 * 목록에 든 운동의 이유 한 줄 — 트레이닝 화면의 운동 줄(2판 P5-k, 2026-10-13). 일정에 저장한 점수(DailyPlan.picks[].score — 값만, 왜는
 * 없어 reasonLineOf 가 항목마다 정해 둔 글로 말한다)를 읽는다.
 *
 * 앞으로 당긴 항목만 말한다 — 합이 0 보다 클 때, 값이 가장 큰 '+' 항목 하나(2주 안 한 계열 · 회복 날 뻐근한 곳 풀기 · 즐겨찾기).
 * 뒤로 민 항목(−)은 이 운동이 목록에 든 까닭이 아니다. 뒤로 밀렸는데도 무리 차례(최근 · 오래 안 한 것)가 앞서거나 그 구간을 채울 다른
 * 후보가 없어 뽑힌 것이라, 목록에 있는 줄에 '뒤로 뒀어요'를 달면 '그런데 왜 있지'가 된다(화면 차례도 점수가 아니라 exercise-order.ts
 * 가 정해 '뒤'에 있지도 않다). 그 신호는 일정 까닭('오늘 이렇게 짰어요' — planReasonsOf)이 그날 한 번 말한다. 합이 0 이하면(뒤로 민 것이
 * 당긴 것만큼 크다) 말하지 않는다 — '앞에 뒀어요'가 참이 아니다. 저장된 JSON 이라 모양이 깨졌으면 null.
 *
 * 점수는 일정을 만들 때 얼린 값이라, 그 뒤 별을 뗀 운동(favorite: false)은 즐겨찾기 몫을 빼고 본다 — '즐겨찾기한 운동이라'가 거짓이 된다.
 * 다른 항목(계열 · 뻐근)은 만든 날의 판단 그대로 말한다(일정 까닭과 같은 원칙 — 다시 셈하지 않는다).
 *
 * 지키는 항목(PROTECT_KEYS)의 '−'가 하나라도 있으면 말하지 않는다(2판 P5 검토) — 지금 scoreOf 는 그런 운동에 '+'를 안 싣지만, 검토 전에
 * 만든 일정은 둘이 함께 저장돼 있다. 어깨를 조심하라고 한 날 그 운동 줄에 '2주 동안 밀기를 안 해서 앞에 뒀어요'가 붙으면 일정 까닭과 어긋난다.
 */
export function pickReasonLineOf(
  ex: { movementPattern?: string | null },
  score: { total: number; parts: ScoreParts } | null | undefined,
  { favorite = true }: { favorite?: boolean } = {}
): string | null {
  if (
    !score ||
    typeof score.total !== 'number' ||
    !score.parts ||
    typeof score.parts !== 'object'
  )
    return null;
  if (hasProtect(score.parts)) return null;
  const ahead: ScoreParts = {};
  let total = score.total;
  for (const k of SCORE_KEYS) {
    const v = score.parts[k];
    if (typeof v !== 'number' || !(v > 0)) continue;
    if (k === 'favorite' && !favorite) {
      total -= v;
      continue;
    }
    ahead[k] = v;
  }
  if (!(total > 0)) return null;
  return reasonLineOf(ex, { parts: ahead });
}

/** 오늘 일정에서 점수를 매긴 후보 하나 — 뽑혔는가와 함께 */
export type ScoredCandidate = { score: ExerciseScore; picked: boolean };

/**
 * 일정 까닭 한 줄 — 저장되는 모양(DailyPlan.reasons, 2판 P5 검토). 점수 신호 줄은 어느 항목(key)의 어느 쪽(sign — +1 앞으로 · −1 뒤로)인지
 * 같이 싣는다. 보일 때(daily-plan.ts planReasonLines) 앞으로 당긴 줄을 지금 목록으로 다시 거르려고 — 만든 뒤 그 운동을 빼거나 별을 떼면
 * '앞에 뒀어요'가 거짓이 된다. 양 조절 · 힘듦 넘김 줄(머리 줄)에는 key 가 없다.
 */
export type PlanReason = { text: string; key?: ScoreKey; sign?: 1 | -1 };

/** 일정 한 줄의 신호 — 같은 항목이라도 앞으로(+) · 뒤로(−)는 따로 센다(뻐근한 날 무거운 것은 뒤로, 회복 날 푸는 것은 앞으로) */
type Signal = { key: ScoreKey; sign: 1 | -1; weight: number; text: string };

/**
 * '오늘 이렇게 짰어요' — 일정 전체의 까닭 2~3줄(PLAN_REASONS_MAX), 줄마다 항목 · 쪽과 함께(PlanReason). 글만 필요하면 planReasonsOf.
 *
 * 줄 차례
 *   1. 양 조절의 까닭(volume.why — 세트를 줄였거나 무게를 안 올리는 날만 있다), 힘듦 경고를 넘기고 고른 대로 만든 날의 한 줄 — 하는 양이
 *      바뀐 것이라 먼저
 *   2. 점수 신호 — 값의 크기가 큰 것부터(같으면 SCORE_KEYS 차례).
 *      뒤로 미는 신호(−)는 그 항목이 걸린 후보가 하나도 뽑히지 않았을 때만 말한다(2판 P5 검토). 처음에는 하나라도 걸렸으면 말해, 카드가
 *      '허리가 뻐근하다고 해서 그쪽 운동은 뒤로 뒀어요'라고 하는데 바로 밑 목록에 허리를 쓰는 운동이 있는 날이 있었다(자체 시험 사본 160조합
 *      뒤로 줄 173개 중 9개). 그 구간을 채울 다른 후보가 없어 뽑힌 것이라 '뒤로'는 차례로는 참이어도 읽는 사람에게는 거짓이다.
 *      앞으로 당기는 신호(+)는 뽑힌 운동에 걸렸을 때만 말한다 — 목록에 없는 것을 '앞에 뒀어요'라고 하면 거짓이 된다.
 * 같은 줄은 한 번만. 부르는 쪽은 그날 구간을 두고 겨룬 후보(테마 구성에 드는 것)만 넘긴다 — 상체 날에 하체 점프까지 넘기면 그날과
 * 상관없는 '하체 점프는 뒤로'를 말한다.
 */
export function planReasonItemsOf({
  scored,
  volume = null,
  overrodeEffort = false,
}: {
  scored: readonly ScoredCandidate[];
  volume?: { why: string } | null;
  overrodeEffort?: boolean;
}): PlanReason[] {
  const head: PlanReason[] = [];
  if (volume?.why) head.push({ text: volume.why });
  if (overrodeEffort)
    head.push({ text: '운동이 힘들었다고 했지만 고른 대로 세트를 그대로 뒀어요.' });

  const signals: Signal[] = [];
  const hits = (key: ScoreKey, sign: 1 | -1, pickedOnly: boolean) =>
    scored.filter(
      (s) =>
        (!pickedOnly || s.picked) &&
        s.score.parts[key] != null &&
        Math.sign(s.score.parts[key]!) === sign
    );
  /** 뒤로 민 후보 — 그 항목이 걸린 후보가 하나라도 뽑혔으면 빈 목록(말하지 않는다) */
  const pushedBack = (key: ScoreKey) => {
    const list = hits(key, -1, false);
    return list.some((s) => s.picked) ? [] : list;
  };
  const weightOf = (list: readonly ScoredCandidate[], key: ScoreKey) =>
    Math.max(...list.map((s) => Math.abs(s.score.parts[key]!)));

  /* outing — 걸린 운동의 창은 모두 같다(ctx 하나), 종류만 모은다 */
  {
    const list = pushedBack('outing').filter((s) => s.score.detail.outing);
    if (list.length > 0) {
      const d = list[0].score.detail.outing!;
      const kinds = new Set(list.map((s) => s.score.detail.outing!.kind));
      const object =
        kinds.size > 1
          ? '하체 점프와 천천히 내리는 운동'
          : OUTING_OBJECT[kinds.has('jump') ? 'jump' : 'eccentric'];
      signals.push({
        key: 'outing',
        sign: -1,
        weight: weightOf(list, 'outing'),
        text: `${outingCause(d)} ${josa(object, '은', '는')} 뒤로 뒀어요.`,
      });
    }
  }

  /* stiff(−) — 출처가 가장 앞선 것 하나로, 그 출처의 관절을 둘까지 */
  {
    const list = pushedBack('stiff').filter((s) => s.score.detail.stiff);
    if (list.length > 0) {
      const source = list
        .map((s) => s.score.detail.stiff!.source)
        .reduce((a, b) => (SOURCE_RANK[b] < SOURCE_RANK[a] ? b : a));
      const labels = jointsText(
        list
          .filter((s) => s.score.detail.stiff!.source === source)
          .map((s) => s.score.detail.stiff!.joint)
      );
      signals.push({
        key: 'stiff',
        sign: -1,
        weight: weightOf(list, 'stiff'),
        text: `${jointCause(source, labels)} 그쪽 운동은 뒤로 뒀어요.`,
      });
    }
  }

  /* arm */
  {
    const list = pushedBack('arm').filter((s) => s.score.detail.arm);
    if (list.length > 0) {
      signals.push({
        key: 'arm',
        sign: -1,
        weight: weightOf(list, 'arm'),
        text: `${armCause(list[0].score.detail.arm!.fatigue)} 팔을 많이 쓰는 운동은 뒤로 뒀어요.`,
      });
    }
  }

  /*
   * program — 겹친 동작 열쇠를 처음 걸린 차례로 둘까지. 날은 말하지 않는다(2판 P5 검토) — inDays 는 '이르면 내일'이라는 짐작이라
   * (programNextOf, 9일 전에 한 사람도 1) '내일 근력 프로그램'은 앱이 지킬 수 없는 말이다.
   */
  {
    const list = pushedBack('program').filter((s) => s.score.detail.program);
    if (list.length > 0) {
      const keys = [...new Set(list.map((s) => s.score.detail.program!.key))].slice(
        0,
        2
      );
      const joined = keys.join('·');
      signals.push({
        key: 'program',
        sign: -1,
        weight: weightOf(list, 'program'),
        text: `다음 근력 프로그램과 겹치는 ${josa(joined, '은', '는')} 뒤로 뒀어요.`,
      });
    }
  }

  /* swapped — 오늘 뺀 것이 있으면 그 말로 */
  {
    const list = pushedBack('swapped').filter((s) => s.score.detail.swapped);
    if (list.length > 0) {
      const today = list.some((s) => s.score.detail.swapped!.today);
      signals.push({
        key: 'swapped',
        sign: -1,
        weight: weightOf(list, 'swapped'),
        text: today ? '오늘 뺀 운동은 뒤로 뒀어요.' : '여러 번 뺀 운동은 뒤로 뒀어요.',
      });
    }
  }

  /* stiff(+) — 회복 날 푸는 운동, 뽑힌 것만 */
  {
    const list = hits('stiff', 1, true).filter((s) => s.score.detail.stiff);
    if (list.length > 0) {
      const labels = jointsText(list.map((s) => s.score.detail.stiff!.joint));
      signals.push({
        key: 'stiff',
        sign: 1,
        weight: weightOf(list, 'stiff'),
        text: `뻐근한 ${josa(labels, '을', '를')} 푸는 운동을 앞에 뒀어요.`,
      });
    }
  }

  /* pattern — 뽑힌 것만, 계열을 처음 걸린 차례로 둘까지 */
  {
    const list = hits('pattern', 1, true).filter((s) => s.score.detail.pattern);
    if (list.length > 0) {
      const names = [...new Set(list.map((s) => s.score.detail.pattern!.pattern))]
        .slice(0, 2)
        .join('·');
      signals.push({
        key: 'pattern',
        sign: 1,
        weight: weightOf(list, 'pattern'),
        text: `2주 동안 안 한 ${josa(names, '을', '를')} 앞에 뒀어요.`,
      });
    }
  }

  /* favorite — 뽑힌 것만 */
  {
    const list = hits('favorite', 1, true);
    if (list.length > 0) {
      signals.push({
        key: 'favorite',
        sign: 1,
        weight: weightOf(list, 'favorite'),
        text: '즐겨찾기한 운동을 앞에 뒀어요.',
      });
    }
  }

  /* 큰 것부터 — 같으면 SCORE_KEYS 차례, 그것도 같으면(뻐근 − · +) 넣은 차례(뒤로 미는 것 먼저). sort 는 안정 정렬이다 */
  const rank = (k: ScoreKey) => SCORE_KEYS.indexOf(k);
  const ordered: PlanReason[] = signals
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) => b.s.weight - a.s.weight || rank(a.s.key) - rank(b.s.key) || a.i - b.i
    )
    .map(({ s }) => ({ text: s.text, key: s.key, sign: s.sign }));

  /* 같은 글은 한 번만 — 먼저 나온 것(머리 줄 · 큰 신호)을 남긴다 */
  const seen = new Set<string>();
  const out: PlanReason[] = [];
  for (const r of [...head, ...ordered]) {
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    out.push(r);
  }
  return out.slice(0, PLAN_REASONS_MAX);
}

/** '오늘 이렇게 짰어요'의 글만 — planReasonItemsOf 의 text(같은 차례 · 같은 상한) */
export function planReasonsOf(
  input: Parameters<typeof planReasonItemsOf>[0]
): string[] {
  return planReasonItemsOf(input).map((r) => r.text);
}
