import { appNow } from '@/lib/clock';
import {
  ACUTE_WINDOW_DAYS,
  CHRONIC_WINDOW_DAYS,
  buildDateRange,
  buildDateRangeOffset,
  computeAcwr,
  pitchLoadByDay,
  findFatigueWindows,
  groupByDay,
  intensityOf,
  longestThrowStreak,
  countMissingDays,
  outingLoadOf,
  summarize,
  toDateKey,
  type AcwrResult,
  type PeriodSummary,
  type PitchLogLike,
} from '@/lib/pitch-stats';
import {
  CHECKIN_PARTS,
  hasPain,
  isShortSleep,
  type CheckinPartKey,
  type CheckinParts,
} from '@/lib/checkin';
/* 타입만 — 재활 규칙(운동 목록 등)은 리포트 쪽에 실리지 않게 값은 부르는 쪽(gather.ts)이 만들어 넘긴다 */
import type { RehabFacts } from '@/lib/armcare/rehab';
import { parseThrowMemo } from '@/lib/armcare/rehab-progress';
/* 운동 끝 힘듦(2판 P2) — 순수 파일. 칩 눈금 · 급증 셈은 거기에 두고 여기서는 잇기만 한다 */
import {
  trainingEffortOf,
  type TrainingEffort,
  type TrainingNoteLike,
} from '@/lib/workout/effort';

/**
 * 리포트에 쓰이는 모든 수치를 한곳에 모은다.
 *
 * 여기 있는 값은 전부 코드가 계산한 것이며, AI는 이 값을 읽어
 * 문장으로 풀어쓸 뿐 새로운 숫자를 만들지 않는다.
 */

export type CheckinLike = CheckinParts & {
  date: string;
  condition: number;
  sleep: string;
  /** 오늘 하고 싶다고 고른 운동 부위 */
  preferredParts: string[];
  /** 오늘 하고 싶다고 고른 운동 종류. 안 골랐으면 null */
  preferredWorkout?: string | null;
  /*
   * 어젯밤 잔 시간 · 전신 근육통(1~5) — 간편 체크인의 선택 칸(lib/checkin.ts 의 CheckinBody).
   *
   * 둘 다 있어도 없어도 되는 칸(?)으로 둔다. 칸이 아예 없는 값이 여러 곳에 있다 — 저장해 둔
   * 리포트의 facts, 두 칸이 생기기 전의 기록, 자가 시험이 손으로 만든 체크인(satisfies CheckinLike).
   * 읽는 쪽은 '칸 없음'과 null 을 똑같이 '안 적음'으로 본다: 아무것도 바꾸지 않고 글도 안 붙인다.
   */
  sleepHours?: number | null;
  soreness?: number | null;
  /**
   * 체크인에 적은 던지는 일정(lib/checkin.ts 의 THROW_PLANS — '오늘 등판' · '오늘 불펜' · '내일 등판' · '2~3일 뒤' ·
   * '4일 이상 뒤' · '없음', 2026-10-12 부터 여섯). 매일 운동 계획이 '오늘 등판 · 내일 등판'을 읽는다(theme.ts 의
   * plannedOuting, 2026-10-09). 느슨한 string 인 까닭: 얼린 facts JSON 에 글자로 남고, 답을 날로 읽는 규칙은 nextOutingDays 가
   * 맡는다. 칸이 없거나 null 이면 안 적은 것.
   */
  throwPlan?: string | null;
  /**
   * 팔 피로 1~5(lib/checkin.ts 의 DETAIL_SCALES — 2026-10-12 부터 간편 체크인 칸). 2판 P4 커밋 C 에서 facts 에 넣었다 — 예전에는
   * 오늘 상태 한 장(lib/engine/day-state.ts)이 extras 로 따로 받아 암케어만 읽었는데, 매일 일정의 안전 거르기(prescription.ts 5-2,
   * '심함'이면 무거운 상체 밀기 · 팔 플라이오를 뺀다)와 일정 지문도 읽어야 해서 판단이 보는 facts 한 곳에 둔다.
   * 근육통처럼 선택 칸이다 — 저장해 둔 옛 facts · 자가 시험이 손으로 만든 체크인에는 없고, 칸 없음 · null · 범위 밖은 '안 적음'.
   */
  armFatigue?: number | null;
};

export type MemoNote = { date: string; text: string };

/**
 * 메모에서 통증으로 볼 만한 표현.
 * 놓치는 것(미탐)이 잘못 잡는 것(오탐)보다 위험하므로 넉넉하게 잡는다.
 * 걸리면 계획을 멈추고, 실제 통증이 아니면 체크인으로 정정하도록 안내한다.
 */
export const PAIN_KEYWORDS = [
  '통증',
  '아프',
  '아팠',
  '아픔',
  '찌릿',
  '저림',
  '저리',
  '시큰',
  '욱신',
  '쑤시',
  '결림',
  '결려',
  'damage',
] as const;

/**
 * 재활 투구 복귀표가 남긴 꼬리표 메모('재활 투구 복귀표 2칸 · 18m · 통증 없음')가 '안 아팠다'는 뜻이면 true.
 *
 * 2026-10-11 (트레이닝 추천 2판 P1 '재활 메모 오탐'). 꼬리표의 '통증 없음'이 부분 일치로 '통증'에 걸려 투구 계획이 멈추고
 * 운동이 회복 수준으로 묶였다 — 재활은 그 메모를 구조로 읽으니(parseThrowMemo) 잃는 정보가 없다. 꼬리표가 통째로 맞을
 * 때만 뺀다(같은 함수 parseThrowMemo — 뒤에 사람이 덧붙인 글이 있으면 꼬리표가 아니라서 통증 단어를 그대로 잡는다).
 * 꼬리표가 통증을 적은 것('몸 풀 때 통증' · '통증 계속' · '던진 뒤 통증')은 실제 통증이라 그대로 잡는다 — 미탐이 오탐보다
 * 위험하다는 이 파일의 원칙. 일반 메모의 '통증 없음'도 지금처럼 잡는다(부정어 처리는 안 한다).
 */
function isPainFreeRehabTag(text: string): boolean {
  const parsed = parseThrowMemo(text);
  return parsed != null && parsed.pain === 'none' && !parsed.laterPain;
}

/** 메모에서 걸린 통증 표현들 (중복 없이) — 재활 복귀표의 '통증 없음' 꼬리표는 뺀다(isPainFreeRehabTag) */
export function findPainKeywords(memos: MemoNote[]): string[] {
  const hits = new Set<string>();
  for (const memo of memos) {
    if (isPainFreeRehabTag(memo.text)) continue;
    const text = memo.text.toLowerCase();
    for (const word of PAIN_KEYWORDS) {
      if (text.includes(word)) hits.add(word);
    }
  }
  return [...hits];
}

export type ReportFacts = {
  /** 리포트 기준일 (YYYY-MM-DD) */
  asOf: string;
  profile: {
    nickname: string;
    age: number | null;
    heightCm: number | null;
    /** 웨이트 트레이닝 경력. 안 골랐으면 null (personalize.ts의 TRAINING_LEVELS) */
    trainingLevel: string | null;
  };
  volume: {
    current: PeriodSummary;
    previous: PeriodSummary;
    /** 직전 7일 대비 투구수 변화율(%). 비교 대상이 없으면 null */
    changePercent: number | null;
  };
  load: AcwrResult;
  patterns: {
    /** 최근 4주 안에서 이틀 연속 과부하가 나온 횟수 */
    fatigueWindows: number;
    /** 최근 4주 최장 연투 일수 */
    longestStreak: number;
    /**
     * 최근 4주 중 기록이 아예 없는 날 수.
     *
     * 부하 지수는 이런 날을 0으로 치므로, 많으면 지수가 실제보다 낮게 나온다.
     * 화면에서 그 사실을 밝히는 데 쓴다.
     */
    missingDays: number;
    lastThrowDate: string | null;
    /** 마지막으로 던진 날의 투구수 (화면에 그대로 보여주는 값) */
    lastOutingPitches: number | null;
    /**
     * 마지막으로 던진 날의 전력 환산 투구수.
     *
     * 휴식일은 이 값으로 정한다. 캐치볼 80구와 경기 80구를 같게 보면 안 된다.
     * (lib/pitch-stats.ts 의 INTENSITY_STRESS_FACTOR)
     */
    lastOutingAdjusted: number | null;
    /** 마지막 투구 후 지난 날 수. 기록이 없으면 null */
    restDays: number | null;
    /** 던진 날 기준 하루 평균 투구수 (최근 4주). 계획의 기준선이 된다 */
    baselinePitches: number | null;
    /**
     * 최근에 던진 날들. 가까운 것부터.
     *
     * 마지막 등판 하나만 봐서는 여파를 놓친다. 100구 경기 이틀 뒤에 가벼운
     * 캐치볼을 25구 하면 그것이 '마지막 등판'이 되는데, 전력 환산 18구라
     * 필요한 휴식이 0일로 계산되어 경기의 4일 창이 통째로 사라진다. 회복 투구를
     * 성실히 한 사람일수록 안전장치가 꺼지는 셈이었다.
     */
    recentOutings: { daysAgo: number; pitches: number; adjusted: number }[];
    /**
     * 세게 던졌는지 가릴 재료 — 던진 날마다, 가까운 것부터(이레 안). 판정은 isHardOuting 한 곳(theme.ts 의 hardOuting 이 부른다).
     *
     * 2판 D2(2026-10-12)부터 load = 그날 Σ 투구수 × 체감 강도(%)(lib/pitch-stats.ts 의 outingLoadOf — 경기는 100%),
     * pitches = 그날 던진 공의 합. 그 전에는 '경기이거나 강도 9~10 인 기록의 투구수'만 날마다 더해 pitches 에 담았고
     * load 칸이 없었다 — 그때 저장된 facts 는 load 없이 오고, isHardOuting 이 옛 규칙(pitches ≥ 30)으로 읽는다.
     * nearMaxPitches(경기 · 강도 9~10 인 공의 합)는 2판 P3 검토(2026-10-12)에 더했다 — 85% × 30 처럼 곱이 2,700 밑인 옛 규칙의 날을 지킨다.
     * 이 칸이 아예 생기기 전에 저장된 facts 에는 없다 — 읽는 쪽은 없으면 빈 목록으로 본다.
     */
    hardOutings?: HardOuting[];
  };
  condition: {
    today: CheckinLike | null;
    /** 오늘 체크인에 통증이 있는가 (체크인이 없으면 false) */
    painToday: boolean;
    /** 최근 7일 체크인 중 통증을 표시한 날이 있는가 */
    painRecently: boolean;
    /**
     * 오늘을 뺀 최근 7일 체크인에서 '통증'이라고 한 부위(중복 없이).
     *
     * 오늘은 괜찮다고 했어도 그 부위의 무거운 운동은 며칠 빼려고 둔다(prescription.ts). 오늘 아픈 부위는
     * today 에서 바로 읽는다. 이 칸이 생기기 전에 저장된 facts 에는 없다 — 없으면 빈 목록으로 본다.
     */
    painRecentParts?: CheckinPartKey[];
    /**
     * 진행 중인 재활(lib/armcare/rehab.ts 의 rehabFacts) — 없으면 null. 투구 계획이 이것을 보고 멈춘다(plan.ts).
     * 이 칸이 생기기 전에 저장된 facts 에는 없다 — 없으면 재활이 없는 것으로 본다.
     */
    rehab?: RehabFacts | null;
    /**
     * 재활 1~3단계의 관절(어깨 넷 → shoulder, 팔꿈치 넷 → elbow). 웨이트가 '최근 통증 부위'와 같은 규칙으로
     * 그 부위의 무거운 운동을 빼고 근력 날을 피한다(prescription.ts · theme.ts). 4단계는 풀어서 빈 목록이다.
     */
    rehabParts?: CheckinPartKey[];
    /**
     * 체크인에 적은 던지는 일정 — 오늘 것과 어제 것(CheckinLike.throwPlan). 어제 '내일 등판'이라고 했으면 오늘이 등판이다.
     * 매일 운동 계획이 읽는다(theme.ts 의 plannedOuting). 이 칸이 생기기 전에 저장된 facts 에는 없다 — 없으면 모르는 것으로 본다.
     */
    throwPlanToday?: string | null;
    throwPlanYesterday?: string | null;
    /** 최근 메모에서 통증으로 보이는 표현이 걸렸는가 */
    painWordsInMemo: string[];
    /**
     * 최근 운동 힘듦(DailyTrainingNote.intensity, 2판 P2 — lib/workout/effort.ts 의 trainingEffortOf): 7일 · 28일 안의 값과
     * 급증 깃발(7일 안 3개 이상 · 7일 평균이 28일 평균보다 2 이상 높음). buildFacts 에 trainingNotes 를 안 넘기면 칸이 없다
     * (옛 저장 facts · 기준선 도구 · 자체 시험의 옛 입력과 같은 모양). 아직 아무 규칙도 읽지 않는다 — P5 에서 '경고와 그래도
     * 하기'. 읽게 되면 같은 커밋에서 일정 지문(lib/report/plan-fingerprint.ts)에도 칸을 더한다.
     */
    trainingEffort?: TrainingEffort;
    /** 최근 7일 평균 컨디션 (1~10, 높을수록 좋음) */
    avgCondition: number | null;
    /**
     * 최근 7일 중 잠이 부족한 날 수 — 느낌이 '부족'이거나 잔 시간이 6시간 미만
     * (lib/checkin.ts 의 isShortSleep). 오늘의 판정과 같은 함수를 쓴다.
     */
    poorSleepDays: number;
    checkinDays: number;
  };
  memos: MemoNote[];
};

function changeRate(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * 등판의 여파를 며칠까지 기억하는가.
 *
 * 휴식일 표의 최댓값이 4일이라 이레면 넉넉하다. 더 길게 들고 있어도 쓰이지
 * 않고, 짧으면 큰 등판이 목록에서 빠져 창이 사라진다.
 */
const OUTING_MEMORY_DAYS = 7;

/**
 * 세게 던진 날 — 그날 던진 공의 투구수 × 체감 강도(%)를 더해 이 값 이상(2판 D2 · D3, 2026-10-12 사용자 결정).
 *
 * 2,700 %·구 = 30구 × 90%. 그 전 규칙('경기, 또는 강도 9~10 으로 그날 합쳐 30구 이상', 2026-10-03 사용자분과 정함)의 바닥을
 * 그대로 옮긴 값이라, 옛 기록(1~10 → ×10)으로 세게 던진 날이던 날은 모두 그대로 세게 던진 날이다 — 경기 · 강도 9~10 의 공
 * 하나가 90 이상을 보태고, 다른 기록은 0 이상을 보탠다.
 * 새로 세게가 되는 날(곱 규칙의 본뜻 — 적게 세게든 많이 가볍게든 팔에 간 양을 본다): 불펜 40구 70%(2,800) · 60구 50%(3,000) ·
 * 경기 25구 + 캐치볼 20구 50%(3,500) · 경기나 강도 10 으로 27~29구(예전엔 30구 미만이라 아니었다).
 * 빠지는 날은 없다: % 로 새로 적은 85% 30구는 곱이 2,550 이지만 DB 에는 '강도 9 · 30구'로 남는다(effortToIntensity 가 올림) —
 * 옛 규칙의 날이라 nearMaxPitches(아래)로 그대로 세게 던진 날이다(2판 P3 검토, 2026-10-12 — 사용자 결정 '강도 9~10 · 30구 와 같은
 * 날이 세게 던진 날로 남게'). 휴식표(stressFactor)도 85% 를 9 쪽(0.95)으로 읽으니 두 독자가 같은 기록을 같게 본다.
 * 경기는 체감과 상관없이 100%(lib/pitch-stats.ts outingLoadOf) — 경기 20구는 2,000 이라 지금처럼 아니다.
 * 이 파일에 두는 까닭: theme.ts 를 부르지 않는 낮은 층이라 기준선 · 사용 통계 도구 · 오늘 상태(day-state)가 그대로 가져다 쓴다.
 */
export const HARD_OUTING_MIN_LOAD = 2700;

/**
 * load 칸이 없는 옛 facts(2026-10-12 전에 저장된 것)를 읽는 문턱 — 그때 pitches 는 '경기이거나 강도 9~10 인 공의 합'이었다.
 * 짧게 몇 개만 세게 던진 날은 다음 날을 막지 않는다(2026-10-03 사용자분과 정함). theme.ts 가 다시 내보낸다.
 */
export const HARD_OUTING_MIN_PITCHES = 30;

/** 거의 전력으로 본다 — 그날 체감 평균이 이 % 이상(옛 강도 9~10). 판정이 아니라 이유 글이 '거의 전력으로'라고 할지만 가른다 */
export const NEAR_MAX_EFFORT_PCT = 90;

/**
 * 옛 규칙의 '거의 전력' 1~10 눈금 — 경기가 아니어도 이 강도 이상이면 nearMaxPitches 에 든다. % 기록은 1~10 으로 내려
 * (effortToIntensity — 85% → 9) 견준다. 저장된 intensity 와 같은 값이라 옛 규칙과 글자 그대로 같은 날을 고른다.
 */
export const NEAR_MAX_INTENSITY = 9;

/** 세게 던졌는지 가릴 재료 한 날(facts.patterns.hardOutings) */
export type HardOuting = {
  daysAgo: number;
  /** 그날 던진 공의 합(옛 facts 는 경기 · 강도 9~10 인 공의 합) */
  pitches: number;
  /** 그날 Σ 투구수 × 체감 강도(%), 경기는 100%(outingLoadOf). 옛 facts 에는 없다 */
  load?: number;
  /**
   * 그날 경기이거나 강도 9~10(85% 이상)으로 던진 공의 합 — 옛 규칙의 재료. 이것이 30구를 넘으면 곱이 2,700 밑이어도 세게
   * 던진 날이다(85% × 30). load 와 같이 실린다. 옛 facts · 옛 지문에는 없다.
   */
  nearMaxPitches?: number;
};

/**
 * 세게 던진 날인가 — load 가 있으면 HARD_OUTING_MIN_LOAD 이상이거나 nearMaxPitches 가 HARD_OUTING_MIN_PITCHES 이상,
 * 없으면(옛 facts) 옛 규칙 HARD_OUTING_MIN_PITCHES
 */
export function isHardOuting(o: HardOuting): boolean {
  return o.load != null
    ? o.load >= HARD_OUTING_MIN_LOAD ||
        (o.nearMaxPitches ?? 0) >= HARD_OUTING_MIN_PITCHES
    : o.pitches >= HARD_OUTING_MIN_PITCHES;
}

/** 거의 전력으로 던진 날인가(글만 가른다) — 옛 facts 는 pitches 가 곧 거의 전력 투구수라 늘 참 */
export function isNearMaxOuting(o: HardOuting): boolean {
  return o.load == null || o.load >= NEAR_MAX_EFFORT_PCT * o.pitches;
}

function daysBetween(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function buildFacts({
  nickname,
  age,
  heightCm,
  trainingLevel = null,
  logs,
  checkins,
  memos,
  baselineDailyLoad = null,
  rehab = null,
  trainingNotes,
  today = appNow(),
}: {
  nickname: string;
  age: number | null;
  heightCm: number | null;
  trainingLevel?: string | null;
  logs: PitchLogLike[];
  checkins: CheckinLike[];
  memos: MemoNote[];
  /** 가입 문진으로 추정한 하루 평균 부하. 부하 지수의 시작점이 된다. */
  baselineDailyLoad?: number | null;
  /** 진행 중인 재활 — 없으면 null(lib/armcare/rehab.ts 의 rehabFacts 로 만든다) */
  rehab?: RehabFacts | null;
  /**
   * 최근 운동 힘듦(DailyTrainingNote — gather.ts 가 45일치를 넘긴다). 안 넘기면 condition.trainingEffort 칸을 만들지 않는다 —
   * 옛 입력(기준선 도구 · 자체 시험)의 결과가 글자 하나 안 바뀌게.
   */
  trainingNotes?: TrainingNoteLike[];
  today?: Date;
}): ReportFacts {
  const asOf = toDateKey(today);
  const byDay = groupByDay(logs);

  const last7 = buildDateRange(ACUTE_WINDOW_DAYS, today);
  const prev7 = buildDateRangeOffset(ACUTE_WINDOW_DAYS, ACUTE_WINDOW_DAYS, today);
  const last28 = buildDateRange(CHRONIC_WINDOW_DAYS, today);

  const current = summarize(byDay, last7);
  const previous = summarize(byDay, prev7);
  const month = summarize(byDay, last28);

  /*
   * 마지막으로 '던진' 날.
   *
   * 기록이 있는 마지막 날이 아니다. 휴식은 0구로 남기는데, 그것까지 세면
   * 어제 휴식을 적은 사람은 마지막 등판이 0구로 덮인다. 그러면 필요한 휴식일이
   * 0이 되어, 그저께 90구를 던졌어도 오늘 아무 제한 없이 계획이 나온다.
   * 휴식을 성실히 적을수록 안전장치가 꺼지는 셈이었다.
   */
  const lastThrowDate =
    [...byDay.entries()]
      .filter(([, d]) => d.pitchCount > 0)
      .map(([key]) => key)
      .sort()
      .at(-1) ?? null;

  /*
   * 세게 던졌는지 가릴 재료 — 날마다 투구수와 투구수 × 체감 강도(%)를 더한다(isHardOuting 이 읽는다).
   * 세션마다 곱해서 더한다. 하루 평균 강도로 곱하면 같은 값이지만, 경기(늘 100%)를 세션 단위로 가려야 해서 기록마다 곱한다.
   * 더하기만 하므로 경기 뒤 가벼운 캐치볼은 그날을 세게 던진 날에서 빼지 않는다(늘 보탠다).
   * 날짜는 groupByDay 와 같은 방식(앞 10자리)으로 센다.
   */
  const outingByDay = new Map<
    string,
    { pitches: number; load: number; nearMaxPitches: number }
  >();
  for (const log of logs) {
    const load = outingLoadOf(log);
    if (load <= 0) continue;
    const key = log.date.slice(0, 10);
    const prev = outingByDay.get(key);
    /*
     * 옛 규칙의 재료 — 경기, 또는 1~10 으로 9 이상. % 기록은 반올림해 견준다(85% = 8.5 → 9, 저장된 intensity 와 같은 값 —
     * effortToIntensity). intensityOf 로 읽어 옛 코드가 남긴 낡은 % 는 안 믿는다(lib/pitch-stats.ts trustedEffortPct).
     */
    const nearMax =
      log.sessionType === '경기' || Math.round(intensityOf(log)) >= NEAR_MAX_INTENSITY;
    outingByDay.set(key, {
      pitches: (prev?.pitches ?? 0) + log.pitchCount,
      load: (prev?.load ?? 0) + load,
      nearMaxPitches: (prev?.nearMaxPitches ?? 0) + (nearMax ? log.pitchCount : 0),
    });
  }

  // 최근 7일 체크인만 컨디션 요약에 쓴다.
  const recentCheckins = checkins.filter((c) => last7.includes(c.date));
  const conditions = recentCheckins.map((c) => c.condition);

  /*
   * 오늘 체크인은 따로 꺼내 둔다.
   *
   * "지금 아픈가"와 "최근에 아팠던 적이 있나"는 다르게 다뤄야 한다.
   * 둘을 뭉뚱그리면, 며칠 전에 한 번 아팠다는 이유로 오늘 멀쩡한 사람의
   * 계획까지 계속 멈춘다.
   */
  const todayCheckin = checkins.find((c) => c.date === asOf) ?? null;
  /* 어제 체크인 — '내일 등판'이라고 적었는지 보려고(plannedOuting) */
  const yesterdayCheckin = checkins.find((c) => daysBetween(c.date, asOf) === 1) ?? null;

  return {
    asOf,
    profile: { nickname, age, heightCm, trainingLevel },
    volume: {
      current,
      previous,
      changePercent: changeRate(current.totalPitches, previous.totalPitches),
    },
    load: computeAcwr(pitchLoadByDay(byDay), today, {
      seedDailyLoad: baselineDailyLoad,
    }),
    patterns: {
      fatigueWindows: findFatigueWindows(byDay, last28).length,
      longestStreak: longestThrowStreak(byDay, last28),
      missingDays: countMissingDays(byDay, last28),
      lastThrowDate,
      lastOutingPitches: lastThrowDate
        ? (byDay.get(lastThrowDate)?.pitchCount ?? null)
        : null,
      lastOutingAdjusted: lastThrowDate
        ? (byDay.get(lastThrowDate)?.adjustedPitches ?? null)
        : null,
      restDays: lastThrowDate ? daysBetween(lastThrowDate, asOf) : null,
      baselinePitches: month.activeDays ? Math.round(month.pitchesPerActiveDay) : null,
      recentOutings: [...byDay.entries()]
        .filter(([, d]) => d.pitchCount > 0)
        .map(([key, d]) => ({
          daysAgo: daysBetween(key, asOf),
          pitches: d.pitchCount,
          adjusted: d.adjustedPitches,
        }))
        .filter((o) => o.daysAgo >= 0 && o.daysAgo <= OUTING_MEMORY_DAYS)
        .sort((a, b) => a.daysAgo - b.daysAgo),
      hardOutings: [...outingByDay]
        .map(([key, o]) => ({
          daysAgo: daysBetween(key, asOf),
          pitches: o.pitches,
          load: o.load,
          nearMaxPitches: o.nearMaxPitches,
        }))
        .filter((o) => o.daysAgo >= 0 && o.daysAgo <= OUTING_MEMORY_DAYS)
        .sort((a, b) => a.daysAgo - b.daysAgo),
    },
    condition: {
      today: todayCheckin,
      painToday: todayCheckin ? hasPain(todayCheckin) : false,
      painRecently: recentCheckins.some(hasPain),
      painRecentParts: CHECKIN_PARTS.filter((p) =>
        recentCheckins.some((c) => c.date !== asOf && c[p.key] === '통증')
      ).map((p) => p.key),
      rehab,
      rehabParts: rehab && rehab.stage <= 3 ? [rehab.joint] : [],
      throwPlanToday: todayCheckin?.throwPlan ?? null,
      throwPlanYesterday: yesterdayCheckin?.throwPlan ?? null,
      painWordsInMemo: findPainKeywords(memos),
      /* 칸은 넘겨받았을 때만 — 조건부 펼침이라 안 넘기면 키 자체가 없다 */
      ...(trainingNotes
        ? { trainingEffort: trainingEffortOf(trainingNotes, asOf) }
        : {}),
      avgCondition: conditions.length
        ? conditions.reduce((a, b) => a + b, 0) / conditions.length
        : null,
      poorSleepDays: recentCheckins.filter(isShortSleep).length,
      checkinDays: recentCheckins.length,
    },
    memos,
  };
}
