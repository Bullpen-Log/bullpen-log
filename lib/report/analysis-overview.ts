import { estimateDailyLoad } from '@/lib/baseline';
import { LOOKBACK_DAYS } from '@/lib/report/gather';
import {
  ACWR_ZONES,
  CHRONIC_WINDOW_DAYS,
  MISSING_DAYS_WARNING,
  acwrTrend,
  buildDateRange,
  buildDateRangeOffset,
  computeAcwr,
  countMissingDays,
  findFatigueWindows,
  formatShortDate,
  groupByDay,
  longestThrowStreak,
  pitchLoadByDay,
  summarize,
  toDateKey,
  type AcwrTrendPoint,
  type AcwrZone,
} from '@/lib/pitch-stats';
import { TRAINING_ADVICE, TRAINING_MEANING, type TrainingLoad } from '@/lib/training-load';
import type { Tone } from '@/components/tone';

/**
 * 분석 화면 윗부분의 숫자 — 부하 지수 둘 · 이번 주 투구 · 마지막 투구 · 개인 최고 구속. 웹(app/(app)/coach/overview.tsx)과 아이폰 앱
 * (lib/report/analysis-data.ts → native/src/app/analysis.tsx)이 같은 값을 그린다 — 그리기만 따로(2026-10-18 앱 분석 화면).
 * 서버에서 돈다(gather 의 기간을 읽는다). 앱은 결과(JSON)만 받는다.
 */

export type OverviewLog = {
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  /** 체감 강도 5~100%(2판 D2). 옛 기록 · 쉰 날은 null — groupByDay(intensityOf)가 intensity 로 메운다 */
  effortPct?: number | null;
  maxVelocity: number | null;
  avgVelocity: number | null;
};

export type OverviewUser = {
  nickname: string;
  birthDate: Date | null;
  heightCm: number | null;
  targetVelocity: number | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
};

export type LoadView = {
  /** '투구' 또는 '운동' */
  name: string;
  /** 무엇을 재는 값인지 한 줄로 */
  what: string;
  /** 지수. 아직 못 내면 null */
  ratio: number | null;
  zone: AcwrZone | null;
  /** 지수를 못 낼 때 — 며칠 쌓였고 며칠 더 필요한지 */
  historyDays: number;
  daysNeeded: number;
  /** 문진 추정치가 섞여 있는가 */
  estimated: boolean;
  realWeight: number;
  /** 기록이 하나라도 있는가 */
  hasRecords: boolean;
  /** 지수를 못 낼 때 대신 보여줄 안내 */
  emptyHint: string;
  /** 지금 계산되고 있는 급성·만성 부하 — "어떻게 나온 숫자인가"에 쓴다 */
  acute: number;
  chronic: number;
  /**
   * 이 구간에서 무엇을 하라는 조언.
   *
   * 투구와 운동이 다르다. 투구 쪽 문구를 운동에 그대로 쓰면 "투구량을 줄이세요"가
   * 운동 부하 밑에 붙는다 — 운동을 많이 한 사람에게 던지는 것을 줄이라는 말이 된다.
   */
  advice: string;
  /** 최근 2주 지수 흐름. 요일 때문에 오르내리는 것을 보여주려고 함께 낸다. */
  trend: AcwrTrendPoint[];
  /**
   * 이 구간이 무슨 뜻인지 한 줄로.
   *
   * 조언과 같은 이유로 갈라 둔다. 예전에는 지수 구간표(ACWR_ZONES)의 문장을
   * 둘 다 썼는데, 그 문장이 투구용이라 운동 부하 밑에 "던지고 있습니다"가
   * 붙었다.
   */
  meaning: string;
};

/**
 * 이 날 수 이상 쉬는 날 없이 던졌으면 지수 옆에 알린다.
 *
 * 사흘은 흔하다 — 그것까지 알리면 잔소리가 되어 결국 아무도 안 읽는다.
 * 일주일을 하루도 안 쉬었으면 그때부터는 말할 값어치가 있다.
 */
const STREAK_WARNING = 7;

/** 지난 기간 대비 변화(%) 한 조각 — 반올림해 1% 안이면 '변화 없음' */
export type DeltaView = { dir: -1 | 0 | 1; text: string; tone: Tone };

/** 값이 오르는 게 나쁜 지표(투구량 등)면 invert. 견줄 것이 없으면 null('비교할 이전 기록 없음') */
export function deltaOf(percent: number | null, invert = false): DeltaView | null {
  if (percent == null) return null;
  const rounded = Math.round(percent);
  const flat = Math.abs(rounded) < 1;
  const up = rounded > 0;
  return {
    dir: flat ? 0 : up ? 1 : -1,
    text: flat ? '변화 없음' : `${Math.abs(rounded)}%`,
    tone: flat ? 'neutral' : (up ? !invert : invert) ? 'good' : 'warn',
  };
}

/** 숫자 칸 밑 한 줄 — 경고 · 보통 · 옅게 */
export type StatNote = { text: string; tone: 'warn' | 'muted' | 'faint' };

export type AnalysisOverview = {
  pitching: LoadView;
  training: LoadView;
  /**
   * 투구 지수 밑 경고 — 값이 있을 때만 띄운다. missingDays: 최근 28일 중 기록 없는 날(지수가 낮게 나올 수 있다),
   * throwStreak: 최근 4주 최장 연투(지수가 높지 않아도 쉬는 날을 넣으라고).
   */
  notices: { missingDays: number | null; throwStreak: number | null };
  week: { total: number; tone: Tone; delta: DeltaView | null };
  last: { restDays: number | null; tone: Tone; note: StatNote };
  best: { value: number; date: string; note: StatNote } | null;
  /** 개인 최고 구속이 없을 때의 한 줄 */
  bestEmpty: StatNote;
};

/** 직전 기간 대비 변화율(%). 견줄 것이 없으면 null */
function changeRate(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** 마지막으로 던진 날로부터 며칠 지났는지 */
function daysSince(dateKey: string, todayKey: string) {
  const [fy, fm, fd] = dateKey.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * 그날(today)까지의 기록으로 셈한다. logs 는 화면이 쓰는 만큼(analysis-data.ts 의 70일), 전체 기간이 필요한 개인 최고 구속은 따로 받는다.
 * totalRecords 는 기록이 하나라도 있는지 가를 전체 건수.
 */
export function analysisOverviewOf({
  logs,
  training,
  bestVelocity,
  user,
  today,
  totalRecords,
}: {
  logs: OverviewLog[];
  training: TrainingLoad;
  bestVelocity: { value: number; date: string } | null;
  user: OverviewUser;
  today: Date;
  totalRecords: number;
}): AnalysisOverview {
  const todayKey = toDateKey(today);
  const byDay = groupByDay(logs);

  const last7 = buildDateRange(7, today);
  const prev7 = buildDateRangeOffset(7, 7, today);
  const last28 = buildDateRange(CHRONIC_WINDOW_DAYS, today);

  const current = summarize(byDay, last7);
  const previous = summarize(byDay, prev7);
  // 가입 문진 추정치가 있으면 기록 첫날부터 지수가 나온다.
  const seedDailyLoad = estimateDailyLoad(user);
  /*
   * 부하 지수는 다른 화면과 같은 기간에서 낸다.
   *
   * 예전에는 이 화면만 기록 전부로 계산했다. 그러면 오래 쓴 사람에게 홈·트레이닝
   * (45일 기준)과 여기가 미세하게 다른 숫자를 보여준다. 같은 이름의 값이
   * 화면마다 다르면 어느 쪽을 믿어야 할지 알 수 없다.
   */
  const acwrFrom = toDateKey(new Date(today.getTime() - LOOKBACK_DAYS * 86400000));
  const acwrByDay = groupByDay(logs.filter((l) => toDateKey(new Date(l.date)) >= acwrFrom));
  const pitchLoads = pitchLoadByDay(acwrByDay);
  const acwr = computeAcwr(pitchLoads, today, { seedDailyLoad });
  /*
   * 최근 2주 지수 흐름. 지수 하나만 보여주면 그 값이 요일 때문에 오르내린다는
   * 것을 알 수가 없어서 함께 낸다.
   */
  const acwrHistory = acwrTrend(pitchLoads, today, 14, { seedDailyLoad });
  const fatigue = findFatigueWindows(byDay, last28);
  const streak = longestThrowStreak(byDay, last28);

  /* 쉰 날(0구) 기록은 던진 날이 아니다 — 예전에는 오늘 '휴식'을 남기면 마지막 투구가 '오늘'로 떴다 */
  const lastThrowKey = [...byDay.values()]
    .filter((d) => d.pitchCount > 0)
    .map((d) => d.dateKey)
    .sort()
    .at(-1);
  const restDays = lastThrowKey ? daysSince(lastThrowKey, todayKey) : null;

  const hasRecords = totalRecords > 0;
  /*
   * 최근 28일 중 기록이 아예 없는 날.
   * 쉰 날을 '휴식'으로 적어 둔 것은 여기 들어가지 않는다 — 그건 진짜 0이다.
   */
  const missingDays = countMissingDays(byDay, last28);

  const restTone: Tone =
    restDays == null ? 'neutral' : restDays === 0 ? 'warn' : restDays >= 7 ? 'info' : 'good';

  /*
   * 부하 지수 둘. 합치지 않고 나란히 둔다 —
   * 투구는 '투구수 × 강도', 운동은 '분 × 강도'라 단위가 다르다.
   */
  const pitching: LoadView = {
    name: '투구',
    what: '지금 던지는 양이 평소보다 얼마나 많은지',
    ratio: acwr.ratio,
    zone: acwr.zone,
    historyDays: acwr.historyDays,
    daysNeeded: acwr.daysNeeded,
    estimated: acwr.estimated,
    realWeight: acwr.realWeight,
    acute: acwr.acute,
    chronic: acwr.chronic,
    advice: acwr.zone ? ACWR_ZONES[acwr.zone].advice : '',
    trend: acwrHistory,
    meaning: acwr.zone ? ACWR_ZONES[acwr.zone].meaning : '',
    hasRecords,
    emptyHint: hasRecords
      ? '지수는 최근 부하를 평소 부하와 견주는 값이에요. 비교할 기준이 아직 없어요.'
      : '투구를 남기면 부하 지수가 나와요.',
  };
  const trainingView: LoadView = {
    name: '운동',
    what: '지금 하는 운동량이 평소보다 얼마나 많은지',
    ratio: training.ratio,
    zone: training.zone,
    historyDays: training.historyDays,
    daysNeeded: training.daysNeeded,
    estimated: training.estimated,
    realWeight: training.realWeight,
    acute: training.acute,
    chronic: training.chronic,
    advice: training.zone ? TRAINING_ADVICE[training.zone] : '',
    trend: training.trend,
    meaning: training.zone ? TRAINING_MEANING[training.zone] : '',
    hasRecords: training.historyDays > 0,
    /*
     * 투구와 마찬가지로, 문진에 '평소 웨이트 빈도'를 답하면 첫날부터 나온다.
     * 안 답한 사람에게는 그 길이 있다는 것을 알려준다.
     */
    emptyHint:
      training.historyDays > 0
        ? '평소 운동량과 견줄 기준이 아직 없어요. 내 정보에서 평소 웨이트 횟수를 답하면 바로 나와요.'
        : '트레이닝에서 운동을 마쳤다고 표시하면 여기에 나와요.',
  };

  return {
    pitching,
    training: trainingView,
    notices: {
      missingDays: missingDays >= MISSING_DAYS_WARNING ? missingDays : null,
      throwStreak: streak >= STREAK_WARNING ? streak : null,
    },
    week: {
      total: current.totalPitches,
      tone: current.totalPitches > previous.totalPitches * 1.3 ? 'warn' : 'neutral',
      delta: deltaOf(changeRate(current.totalPitches, previous.totalPitches), true),
    },
    last: {
      restDays,
      tone: restTone,
      /*
       * 이틀 연속 높은 강도로 던진 것이 연투 일수보다 먼저다.
       * 사흘 가볍게 던진 것보다 이틀 세게 던진 쪽이 팔에 남는다.
       */
      note:
        fatigue.length > 0
          ? { text: `이틀 연속 과부하 ${fatigue.length}회`, tone: 'warn' }
          : streak >= 3
            ? { text: `최장 ${streak}일 연투`, tone: 'warn' }
            : lastThrowKey
              ? { text: `최장 연투 ${streak}일`, tone: 'muted' }
              : { text: '기록 없음', tone: 'faint' },
    },
    /* 목표 구속은 2026-10-10 부터 사용자가 적지 않는다 — 나중에 앱이 계산해 보여 준다 */
    best: bestVelocity
      ? {
          ...bestVelocity,
          note: { text: `${formatShortDate(bestVelocity.date)} 기록`, tone: 'muted' },
        }
      : null,
    bestEmpty: { text: '스피드건이 없으면 비워두세요', tone: 'faint' },
  };
}
