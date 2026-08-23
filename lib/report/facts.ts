import {
  ACUTE_WINDOW_DAYS,
  CHRONIC_WINDOW_DAYS,
  buildDateRange,
  buildDateRangeOffset,
  computeAcwr,
  findFatigueWindows,
  groupByDay,
  longestThrowStreak,
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
    lastThrowDate: string | null;
    /** 마지막으로 던진 날의 투구수. 필요한 휴식일을 정하는 기준이다 */
    lastOutingPitches: number | null;
    /** 마지막 투구 후 지난 날 수. 기록이 없으면 null */
    restDays: number | null;
    /** 던진 날 기준 하루 평균 투구수 (최근 4주). 계획의 기준선이 된다 */
    baselinePitches: number | null;
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

function daysBetween(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
  );
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

  const lastThrowDate = [...byDay.keys()].sort().at(-1) ?? null;

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
    load: computeAcwr(byDay, today, { seedDailyLoad: baselineDailyLoad }),
    patterns: {
      fatigueWindows: findFatigueWindows(byDay, last28).length,
      longestStreak: longestThrowStreak(byDay, last28),
      lastThrowDate,
      lastOutingPitches: lastThrowDate
        ? (byDay.get(lastThrowDate)?.pitchCount ?? null)
        : null,
      restDays: lastThrowDate ? daysBetween(lastThrowDate, asOf) : null,
      baselinePitches: month.activeDays
        ? Math.round(month.pitchesPerActiveDay)
        : null,
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
