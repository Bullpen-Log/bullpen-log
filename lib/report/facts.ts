import {
  ACUTE_WINDOW_DAYS,
  CHRONIC_WINDOW_DAYS,
  buildDateRange,
  buildDateRangeOffset,
  computeAcwr,
  pitchLoadByDay,
  findFatigueWindows,
  groupByDay,
  longestThrowStreak,
  countMissingDays,
  summarize,
  toDateKey,
  type AcwrResult,
  type PeriodSummary,
  type PitchLogLike,
} from '@/lib/pitch-stats';
import { hasPain, type CheckinParts } from '@/lib/checkin';

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

/** 메모에서 걸린 통증 표현들 (중복 없이) */
export function findPainKeywords(memos: MemoNote[]): string[] {
  const hits = new Set<string>();
  for (const memo of memos) {
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
  };
  condition: {
    today: CheckinLike | null;
    /** 오늘 체크인에 통증이 있는가 (체크인이 없으면 false) */
    painToday: boolean;
    /** 최근 7일 체크인 중 통증을 표시한 날이 있는가 */
    painRecently: boolean;
    /** 최근 메모에서 통증으로 보이는 표현이 걸렸는가 */
    painWordsInMemo: string[];
    /** 최근 7일 평균 컨디션 (1~10, 높을수록 좋음) */
    avgCondition: number | null;
    /** 최근 7일 중 수면 '부족'인 날 수 */
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
  today = new Date(),
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
    },
    condition: {
      today: todayCheckin,
      painToday: todayCheckin ? hasPain(todayCheckin) : false,
      painRecently: recentCheckins.some(hasPain),
      painWordsInMemo: findPainKeywords(memos),
      avgCondition: conditions.length
        ? conditions.reduce((a, b) => a + b, 0) / conditions.length
        : null,
      poorSleepDays: recentCheckins.filter((c) => c.sleep === '부족').length,
      checkinDays: recentCheckins.length,
    },
    memos,
  };
}
