import { SESSION_TYPE_NAMES, isRestSession } from '@/lib/session-type';

/** 연속한 이틀의 체감 강도 합이 이 값을 넘으면 과부하로 본다. */
export const TWO_DAY_INTENSITY_LIMIT = 10;

export type PitchLogLike = {
  date: string; // YYYY-MM-DD 또는 ISO 문자열
  /** 불펜 / 라이브 / 경기 / 캐치볼 / 휴식. 경기는 전력으로 본다(stressFactor) */
  sessionType?: string;
  pitchCount: number;
  intensity: number;
  /** 스피드건이 없어 안 적은 기록은 null */
  maxVelocity: number | null;
  avgVelocity: number | null;
};

/**
 * 이 서비스가 날짜를 세는 기준 시간대.
 *
 * 예전에는 서버와 브라우저가 각자 자기 시간대로 '오늘'을 정했다.
 * 배포된 서버는 UTC로 도는데 선수는 한국에 있어서, 한국 시간 0시부터
 * 9시 사이에는 두 쪽이 서로 다른 날을 오늘이라고 불렀다. 그 시간에
 * 체크인을 하면 방금 남긴 기록을 오늘의 운동이 못 찾는다.
 *
 * 기준을 한 곳에 못박아 어디서 계산하든 같은 날짜가 나오게 한다.
 * 해외에 있어도 한국 날짜를 따른다 — 팀·경기 일정이 한국 기준이라
 * 그쪽이 헷갈리지 않는다.
 */
export const SERVICE_TIME_ZONE = 'Asia/Seoul';

const dateKeyParts = new Intl.DateTimeFormat('en-US', {
  timeZone: SERVICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 한국 시간 기준 YYYY-MM-DD */
export function toDateKey(date: Date) {
  const parts = dateKeyParts.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 연·월·일을 이미 아는 곳(달력 등)에서 쓰는 키 만들기.
 *
 * Date를 만들었다가 되돌리면 만드는 쪽의 시간대를 타므로, UTC로만 계산해
 * 시간대와 무관하게 같은 값이 나오게 한다. 월 넘김(12월 32일 → 1월 1일)은
 * Date.UTC가 알아서 처리한다.
 */
export function dateKeyOf(year: number, monthIndex: number, day: number) {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function shiftDateKey(dateKey: string, offset: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return dateKeyOf(y, m - 1, d + offset);
}

export function formatShortDate(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export type DayTotals = {
  dateKey: string;
  pitchCount: number;
  /**
   * 그날의 체감 강도(1~10). 여러 번 던진 날은 투구수로 가중평균을 낸다.
   *
   * 예전에는 그냥 더했다. 그래서 30구를 강도 7로 두 번 나눠 적으면 강도가
   * 14가 됐고, 부하(투구수 × 강도)가 420이 아니라 840으로 잡혔다. 같은 60구를
   * 한 번에 적은 사람보다 두 배 위험한 것으로 계산된 것이다. 성실하게 나눠
   * 적을수록 손해를 보는 셈이라 반드시 평균이어야 한다.
   */
  intensity: number;
  /**
   * 전력으로 던졌다면 몇 구에 해당하는가.
   *
   * 휴식일을 정할 때 쓴다. 투구수만 보면 캐치볼 80구에도 4일 휴식이 나오고,
   * 부하(투구수 × 강도)로 보면 절반 힘이 절반 부담이라고 보는 셈이라 반대로
   * 위험하다. 자세한 근거는 INTENSITY_STRESS_FACTOR 주석에 적어 두었다.
   */
  adjustedPitches: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
};

/**
 * 하루에 여러 번 기록했을 수 있으므로 날짜별로 합친다.
 *
 * 투구수는 더하고, 강도와 평균 구속은 투구수로 가중평균을 내고,
 * 최고 구속은 그날의 최댓값을 쓴다.
 *
 * 강도를 더하지 않는 이유는 DayTotals.intensity 주석에 적어 두었다.
 */
export function groupByDay(logs: PitchLogLike[]): Map<string, DayTotals> {
  // 가중평균을 내려면 (값 × 투구수)의 합과 그 투구수 합이 필요하다.
  const acc = new Map<
    string,
    DayTotals & { intensitySum: number; avgWeightedSum: number; avgWeight: number }
  >();

  for (const log of logs) {
    const key = log.date.slice(0, 10);
    const prev = acc.get(key);

    const hasAvg = log.avgVelocity != null;
    const weightedSum = hasAvg ? log.avgVelocity! * log.pitchCount : 0;
    const weight = hasAvg ? log.pitchCount : 0;
    // 강도의 가중평균을 내려면 (강도 × 투구수)의 합이 필요하다.
    const intensitySum = log.intensity * log.pitchCount;
    /*
     * 전력 환산은 세션마다 따로 내서 더한다. 하루 평균 강도로 한 번에 내면
     * 불펜 40구(강도 8)와 캐치볼 40구(강도 2)를 강도 5짜리 80구로 뭉개게 된다.
     */
    const adjusted = effortAdjustedPitches(
      log.pitchCount,
      log.intensity,
      log.sessionType
    );

    if (!prev) {
      acc.set(key, {
        dateKey: key,
        pitchCount: log.pitchCount,
        intensity: log.intensity,
        intensitySum,
        adjustedPitches: adjusted,
        maxVelocity: log.maxVelocity,
        avgVelocity: log.avgVelocity,
        avgWeightedSum: weightedSum,
        avgWeight: weight,
      });
      continue;
    }

    const avgWeightedSum = prev.avgWeightedSum + weightedSum;
    const avgWeight = prev.avgWeight + weight;
    const pitchCount = prev.pitchCount + log.pitchCount;
    const totalIntensity = prev.intensitySum + intensitySum;

    acc.set(key, {
      dateKey: key,
      pitchCount,
      // 투구수로 가중한 평균. 이렇게 두면 투구수 × 강도가 세션별 부하의 합과 같다.
      intensity: pitchCount > 0 ? totalIntensity / pitchCount : log.intensity,
      intensitySum: totalIntensity,
      adjustedPitches: prev.adjustedPitches + adjusted,
      // 둘 다 없을 수 있으므로 있는 것만 견준다. 없으면 그대로 null 로 둔다.
      maxVelocity:
        prev.maxVelocity == null
          ? log.maxVelocity
          : log.maxVelocity == null
            ? prev.maxVelocity
            : Math.max(prev.maxVelocity, log.maxVelocity),
      avgVelocity: avgWeight > 0 ? avgWeightedSum / avgWeight : null,
      avgWeightedSum,
      avgWeight,
    });
  }

  // 계산에만 쓰인 보조 필드는 떼어내고 반환한다.
  const result = new Map<string, DayTotals>();
  for (const [key, v] of acc) {
    result.set(key, {
      dateKey: v.dateKey,
      pitchCount: v.pitchCount,
      intensity: v.intensity,
      adjustedPitches: v.adjustedPitches,
      maxVelocity: v.maxVelocity,
      avgVelocity: v.avgVelocity,
    });
  }
  return result;
}

/**
 * 오늘에서 offsetDays만큼 거슬러 올라간 날을 끝으로 하는
 * days일치 날짜 키를 오래된 순으로 만든다.
 */
export function buildDateRangeOffset(
  days: number,
  offsetDays = 0,
  today = new Date()
): string[] {
  const end = shiftDateKey(toDateKey(today), -offsetDays);
  return Array.from({ length: days }, (_, i) => shiftDateKey(end, i - days + 1));
}

/** 오늘부터 거슬러 올라가 days일치 날짜 키를 오래된 순으로 만든다. */
export function buildDateRange(days: number, today = new Date()): string[] {
  return buildDateRangeOffset(days, 0, today);
}

export type FatigueWindow = {
  firstDay: string;
  secondDay: string;
  total: number;
};

/**
 * 연속한 이틀의 강도 합이 한도를 넘는 구간을 찾는다.
 * 최근 구간이 앞에 오도록 정렬해 반환한다.
 */
/** 무엇을 하며 지냈는지 한 줄로 보여주기 위한 종류별 집계 */
export type SessionTypeCount = {
  name: string;
  /** 그 종류로 남긴 기록 수 (휴식은 날 수) */
  count: number;
  /** 그 종류로 던진 공의 합계 */
  pitches: number;
};

type SessionLog = { date: string; sessionType: string; pitchCount: number };

/**
 * 기간 안의 기록을 종류별로 센다.
 *
 * 투구수만 보면 "지난 4주에 무엇을 하며 지냈는지"가 안 보인다. 같은 800구라도
 * 경기 위주였는지 불펜 위주였는지에 따라 몸에 남는 것이 다르다.
 *
 * 한 번도 없는 종류는 빼고 돌려준다. '경기 0회'가 줄줄이 적혀 있으면 정작
 * 한 것이 눈에 안 들어온다.
 */
export function countSessionTypes(
  logs: SessionLog[],
  dateKeys: string[]
): SessionTypeCount[] {
  const within = new Set(dateKeys);
  const byType = new Map<string, { count: number; pitches: number; days: Set<string> }>();

  for (const log of logs) {
    const key = log.date.slice(0, 10);
    if (!within.has(key)) continue;
    const prev = byType.get(log.sessionType) ?? {
      count: 0,
      pitches: 0,
      days: new Set<string>(),
    };
    prev.count += 1;
    prev.pitches += log.pitchCount;
    prev.days.add(key);
    byType.set(log.sessionType, prev);
  }

  return SESSION_TYPE_NAMES.map((name) => {
    const v = byType.get(name);
    if (!v) return { name, count: 0, pitches: 0 };
    /*
     * 쉰 날은 '몇 번'이 아니라 '며칠'이다. 하루에 두 번 적어도 하루 쉰 것이다.
     */
    return {
      name,
      count: isRestSession(name) ? v.days.size : v.count,
      pitches: v.pitches,
    };
  }).filter((t) => t.count > 0);
}

/** 종류별 부하. 같은 투구수라도 어디에 쓴 부하인지가 다르다. */
export type SessionTypeLoad = {
  name: string;
  /** 그 종류에서 나온 부하의 합 (투구수 × 강도) */
  load: number;
  /** 전체 부하에서 차지하는 비율 (0~1) */
  share: number;
};

type LoadLog = SessionLog & { intensity: number };

/**
 * 기간 안의 부하를 종류별로 나눈다.
 *
 * 총 부하만 보면 "무엇 때문에 힘든지"를 알 수 없다. 같은 부하라도 경기에서 온
 * 것과 불펜에서 온 것은 다루는 법이 다르다 — 경기는 내가 양을 못 정하므로,
 * 경기가 늘면 연습을 줄여서 맞춰야 한다.
 *
 * 부하가 0인 종류(휴식)는 빼고 돌려준다.
 */
export function loadBySessionType(
  logs: LoadLog[],
  dateKeys: string[]
): SessionTypeLoad[] {
  const within = new Set(dateKeys);
  const byType = new Map<string, number>();
  let total = 0;

  for (const log of logs) {
    if (!within.has(log.date.slice(0, 10))) continue;
    const load = log.pitchCount * log.intensity;
    if (load <= 0) continue;
    byType.set(log.sessionType, (byType.get(log.sessionType) ?? 0) + load);
    total += load;
  }

  if (total === 0) return [];

  return SESSION_TYPE_NAMES.map((name) => {
    const load = byType.get(name) ?? 0;
    return { name, load, share: load / total };
  }).filter((t) => t.load > 0);
}

/**
 * 경기 부하가 늘었는데 연습을 안 줄인 경우를 잡는 기준.
 *
 * 경기는 내가 던질 양을 정할 수 없다. 그래서 경기가 늘면 연습으로 그만큼
 * 덜어내야 하는데, 시즌에 들어가면 연습량을 그대로 두는 일이 흔하다.
 * 시즌 중 어깨·팔꿈치가 상하는 흔한 경로다.
 */
export const GAME_LOAD_SURGE_RATIO = 1.3;
/** 연습 부하가 이 비율보다 덜 줄었으면 '안 줄인 것'으로 본다. */
export const PRACTICE_KEPT_RATIO = 0.9;
/**
 * 경기가 없다가 생긴 경우, 이 비중 이상이어야 알린다.
 *
 * 연습만 하다 시즌에 들어가는 때가 가장 위험한데, '직전보다 몇 배'로만 보면
 * 직전이 0이라 나눌 수가 없어 이 경우가 통째로 빠진다. 그래서 따로 본다.
 * 다만 한 이닝 몸풀이처럼 적게 던진 것까지 잡으면 잔소리가 되므로 선을 둔다.
 */
export const NEW_GAME_SHARE = 0.2;

/**
 * 최근 28일 중 이 날 수 이상 기록이 비면 화면에 알린다.
 *
 * 일주일쯤은 누구나 빠뜨린다. 그것까지 경고하면 잔소리가 되어 결국 아무도 안
 * 읽는다. 4주 중 열흘이 비면 지수가 눈에 띄게 낮아지므로 그때부터 말한다.
 */
export const MISSING_DAYS_WARNING = 10;

/**
 * 기간 안에서 기록이 아예 없는 날을 센다.
 *
 * 부하 지수는 기록 없는 날을 0으로 치므로, 빠진 날이 많으면 지수가 실제보다
 * 낮게 나온다. 그 사실을 화면에 밝히려고 세어 둔다 — 조용히 낮은 숫자를
 * 보여주면 "더 던져도 된다"는 뜻으로 읽힌다.
 *
 * 쉰 날을 적어 둔 것은 빠진 날이 아니다. 그건 진짜 0이다.
 */
export function countMissingDays(
  byDay: Map<string, DayTotals>,
  dateKeys: string[]
): number {
  return dateKeys.filter((key) => !byDay.has(key)).length;
}

export function findFatigueWindows(
  byDay: Map<string, DayTotals>,
  dateKeys: string[]
): FatigueWindow[] {
  const windows: FatigueWindow[] = [];

  for (let i = 1; i < dateKeys.length; i++) {
    const first = dateKeys[i - 1];
    const second = dateKeys[i];
    const total =
      (byDay.get(first)?.intensity ?? 0) + (byDay.get(second)?.intensity ?? 0);

    if (total > TWO_DAY_INTENSITY_LIMIT) {
      windows.push({ firstDay: first, secondDay: second, total });
    }
  }

  return windows.reverse();
}

export type PeriodSummary = {
  totalPitches: number;
  activeDays: number;
  /** 던진 날 기준 하루 평균 투구수 */
  pitchesPerActiveDay: number;
  maxDailyPitches: number;
  avgIntensity: number;
  peakIntensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
};

const EMPTY_SUMMARY: PeriodSummary = {
  totalPitches: 0,
  activeDays: 0,
  pitchesPerActiveDay: 0,
  maxDailyPitches: 0,
  avgIntensity: 0,
  peakIntensity: 0,
  maxVelocity: null,
  avgVelocity: null,
};

export function summarize(
  byDay: Map<string, DayTotals>,
  dateKeys: string[]
): PeriodSummary {
  /*
   * 쉰 날(투구수 0)은 던진 날에서 뺀다.
   *
   * 안 그러면 '기록한 날 수'와 '던진 날 수'가 섞여, 쉰 날을 성실하게 적을수록
   * 하루 평균 투구수가 낮아 보이고 평균 강도도 내려간다. 기록을 잘 남기는
   * 사람이 손해를 보면 안 된다.
   */
  const days = dateKeys
    .map((k) => byDay.get(k))
    .filter((d): d is DayTotals => d != null && d.pitchCount > 0);

  if (days.length === 0) return EMPTY_SUMMARY;

  const maxVels = days.map((d) => d.maxVelocity).filter((v): v is number => v != null);
  const avgVels = days.map((d) => d.avgVelocity).filter((v): v is number => v != null);
  const totalPitches = days.reduce((sum, d) => sum + d.pitchCount, 0);

  return {
    totalPitches,
    activeDays: days.length,
    pitchesPerActiveDay: totalPitches / days.length,
    maxDailyPitches: Math.max(...days.map((d) => d.pitchCount)),
    avgIntensity: days.reduce((sum, d) => sum + d.intensity, 0) / days.length,
    peakIntensity: Math.max(...days.map((d) => d.intensity)),
    maxVelocity: maxVels.length ? Math.max(...maxVels) : null,
    avgVelocity: avgVels.length
      ? avgVels.reduce((a, b) => a + b, 0) / avgVels.length
      : null,
  };
}

/** 쉬는 날 없이 연달아 던진 최장 일수 */
export function longestThrowStreak(
  byDay: Map<string, DayTotals>,
  dateKeys: string[]
) {
  let longest = 0;
  let run = 0;
  for (const key of dateKeys) {
    // 쉰 날을 적어둔 것은 '던진 날'이 아니므로 연투가 끊긴다.
    const threw = (byDay.get(key)?.pitchCount ?? 0) > 0;
    if (threw) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return longest;
}

export type ReportFinding = {
  tone: 'good' | 'info' | 'warn';
  title: string;
  detail: string;
};

/** 변화율(%)을 낸다. 이전 값이 0이면 비교할 수 없어 null. */
function changeRate(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * 기록을 바탕으로 리포트 코멘트를 만든다.
 * 의학적 판단이 아니라 훈련 부하 관점의 관찰이다.
 */
export function buildReportFindings({
  days,
  current,
  previous,
  fatigueCount,
  streak,
  loadNow = [],
  loadPrev = [],
}: {
  days: number;
  current: PeriodSummary;
  previous: PeriodSummary;
  fatigueCount: number;
  streak: number;
  /** 이번 기간의 종류별 부하 (없으면 그 항목은 건너뛴다) */
  loadNow?: SessionTypeLoad[];
  /** 직전 같은 기간의 종류별 부하 */
  loadPrev?: SessionTypeLoad[];
}): ReportFinding[] {
  const findings: ReportFinding[] = [];
  const label = `최근 ${days}일`;

  // 1) 이틀 연속 부하
  if (fatigueCount > 0) {
    findings.push({
      tone: 'warn',
      title: '이틀 연속 부하가 높았던 구간이 있습니다',
      detail: `${label} 동안 ${fatigueCount}번 나왔습니다. 연속한 이틀의 강도 합이 ${TWO_DAY_INTENSITY_LIMIT}을 넘으면 어깨·팔꿈치에 피로가 쌓이기 쉽습니다. 다음 날은 강도를 낮추거나 쉬는 편이 좋습니다.`,
    });
  } else if (current.activeDays > 0) {
    findings.push({
      tone: 'good',
      title: '연속 부하 관리가 잘 되고 있습니다',
      detail: `${label} 동안 이틀 합산 강도가 ${TWO_DAY_INTENSITY_LIMIT}을 넘은 구간이 없습니다.`,
    });
  }

  // 2) 투구량 변화
  const volumeChange = changeRate(current.totalPitches, previous.totalPitches);
  if (volumeChange != null) {
    const rounded = Math.round(volumeChange);
    if (volumeChange >= 30) {
      findings.push({
        tone: 'warn',
        title: `투구량이 직전 ${days}일보다 ${rounded}% 늘었습니다`,
        detail: `${previous.totalPitches}구 → ${current.totalPitches}구. 갑작스러운 증가는 부상 위험을 높입니다. 주당 증가폭을 완만하게 가져가세요.`,
      });
    } else if (volumeChange <= -30) {
      findings.push({
        tone: 'info',
        title: `투구량이 직전 ${days}일보다 ${Math.abs(rounded)}% 줄었습니다`,
        detail: `${previous.totalPitches}구 → ${current.totalPitches}구. 회복 기간이라면 정상입니다.`,
      });
    } else {
      findings.push({
        tone: 'good',
        title: '투구량이 안정적으로 유지되고 있습니다',
        detail: `직전 ${days}일 대비 ${rounded >= 0 ? '+' : ''}${rounded}% (${previous.totalPitches}구 → ${current.totalPitches}구).`,
      });
    }
  }

  // 3) 구속 변화
  if (current.maxVelocity != null && previous.maxVelocity != null) {
    const diff = current.maxVelocity - previous.maxVelocity;
    const rounded = Math.round(diff * 10) / 10;
    if (diff >= 1) {
      findings.push({
        tone: 'good',
        title: `최고 구속이 ${rounded}km/h 올랐습니다`,
        detail: `직전 ${days}일 ${previous.maxVelocity}km/h → ${label} ${current.maxVelocity}km/h.`,
      });
    } else if (diff <= -2) {
      findings.push({
        tone: 'info',
        title: `최고 구속이 ${Math.abs(rounded)}km/h 떨어졌습니다`,
        detail: `직전 ${days}일 ${previous.maxVelocity}km/h → ${label} ${current.maxVelocity}km/h. 피로가 쌓였는지, 폼이 달라졌는지 영상 분석에서 확인해보세요.`,
      });
    }
  }

  // 4) 휴식 없이 연투
  if (streak >= 3) {
    findings.push({
      tone: 'warn',
      title: `${streak}일 연속으로 던진 구간이 있습니다`,
      detail: '연투가 이어지면 회복이 따라가지 못합니다. 중간에 쉬는 날을 넣어보세요.',
    });
  }

  /*
   * 4-1) 경기가 늘었는데 연습을 안 줄인 경우.
   *
   * 경기는 내가 던질 양을 정할 수 없다. 그래서 경기가 늘면 연습으로 그만큼
   * 덜어내야 하는데, 시즌에 들어가면 연습량을 그대로 두는 일이 흔하다.
   * 총 투구수만 보면 "조금 늘었네" 정도로 보여서 놓치기 쉽다.
   */
  const gameLoad = (list: SessionTypeLoad[]) =>
    list.find((t) => t.name === '경기')?.load ?? 0;
  const totalLoad = (list: SessionTypeLoad[]) =>
    list.reduce((sum, t) => sum + t.load, 0);

  const gameNow = gameLoad(loadNow);
  const gamePrev = gameLoad(loadPrev);
  const practiceNow = totalLoad(loadNow) - gameNow;
  const practicePrev = totalLoad(loadPrev) - gamePrev;

  const gameShare = loadNow.find((t) => t.name === '경기')?.share ?? 0;
  const keptPractice = practiceNow >= practicePrev * PRACTICE_KEPT_RATIO;

  // 없다가 생긴 경우와 늘어난 경우를 나눠 본다. 앞은 나눗셈이 안 된다.
  const gameStarted = gamePrev === 0 && gameShare >= NEW_GAME_SHARE;
  const gameSurged = gamePrev > 0 && gameNow > gamePrev * GAME_LOAD_SURGE_RATIO;

  if (gameNow > 0 && keptPractice && (gameStarted || gameSurged)) {
    const share = Math.round(gameShare * 100);
    findings.push({
      tone: 'warn',
      title: gameStarted
        ? '경기가 시작됐는데 연습량은 그대로입니다'
        : '경기가 늘었는데 연습량은 그대로입니다',
      detail: gameStarted
        ? `${label} 경기 부하가 전체의 ${share}%인데, 연습량은 직전 기간과 비슷합니다. 경기는 던질 양을 내가 정할 수 없으므로, 그만큼 불펜이나 캐치볼을 줄여 균형을 맞추는 편이 좋습니다.`
        : `${label} 경기에서 온 부하가 직전 기간보다 늘어 전체의 ${share}%가 됐습니다. 경기는 던질 양을 내가 정할 수 없으므로, 늘어난 만큼 불펜이나 캐치볼을 줄여 균형을 맞추는 편이 좋습니다.`,
    });
  }

  // 5) 기록 빈도
  if (current.activeDays === 0) {
    findings.push({
      tone: 'info',
      title: `${label} 동안 기록이 없습니다`,
      detail: '투구 기록을 남기면 다음 리포트부터 추이를 볼 수 있습니다.',
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * 급성:만성 부하 비율 (ACWR)
 *
 * 하루 부하를 "투구수 × 체감 강도"로 보고(세션 RPE 방식),
 * 최근 7일 부하를 최근 28일의 주당 평균 부하와 견준다.
 * 스포츠과학에서 널리 쓰이지만 절대 기준은 아니므로 참고 지표로 다룬다.
 * ------------------------------------------------------------------ */

export const ACUTE_WINDOW_DAYS = 7;
export const CHRONIC_WINDOW_DAYS = 28;

/** 이 값을 넘지 않게 유지하는 것을 목표로 본다. */
export const ACWR_TARGET_MAX = 1.3;

export type AcwrZone = 'low' | 'optimal' | 'caution' | 'danger';

/** 게이지 눈금과 설명표에서 같이 쓰는 구간 정보 */
export const ACWR_ZONE_ORDER: AcwrZone[] = ['low', 'optimal', 'caution', 'danger'];

export const ACWR_ZONES: Record<
  AcwrZone,
  {
    /** 게이지 눈금에 쓰는 짧은 이름 */
    short: string;
    label: string;
    range: string;
    tone: 'good' | 'info' | 'warn' | 'bad';
    /** 이 구간이 무슨 뜻인지 한 줄로 */
    meaning: string;
    advice: string;
  }
> = {
  low: {
    short: '낮음',
    label: '부하 낮음',
    range: '0.8 미만',
    tone: 'info',
    meaning: '평소보다 적게 던지고 있습니다.',
    advice: '최근 부하가 평소보다 적습니다. 회복 중이라면 정상이며, 복귀할 때는 한 번에 늘리지 말고 조금씩 올리세요.',
  },
  optimal: {
    short: '적정',
    label: '적정',
    range: '0.8 ~ 1.3',
    tone: 'good',
    meaning: '몸이 감당해온 양 안에서 던지고 있습니다.',
    advice: '평소 쌓아온 양에 맞는 부하입니다. 지금 흐름을 유지해도 좋습니다.',
  },
  caution: {
    short: '주의',
    label: '주의',
    range: '1.3 ~ 1.5',
    tone: 'warn',
    meaning: '평소보다 빠르게 늘고 있습니다.',
    advice: '최근 부하가 평소보다 빠르게 올랐습니다. 이번 주는 투구수나 강도를 조금 낮추는 편이 안전합니다.',
  },
  danger: {
    short: '위험',
    label: '위험',
    range: '1.5 초과',
    tone: 'bad',
    meaning: '평소 감당하던 양을 크게 넘었습니다.',
    advice: '평소 감당하던 양을 크게 넘었습니다. 투구량을 확실히 줄이고 회복에 시간을 주세요.',
  },
};

/** 지수를 일상적인 말로 바꾼다. 숫자만으로는 감이 안 오기 때문이다. */
export function describeRatio(ratio: number) {
  if (ratio >= 0.95 && ratio <= 1.05) return '평소와 비슷한 수준';
  if (ratio > 1.05) return `평소의 ${ratio.toFixed(1)}배`;
  return `평소의 ${Math.round(ratio * 100)}% 수준`;
}

export function zoneOf(ratio: number): AcwrZone {
  if (ratio < 0.8) return 'low';
  if (ratio <= 1.3) return 'optimal';
  if (ratio <= 1.5) return 'caution';
  return 'danger';
}

/** 하루 부하 = 투구수 × 체감 강도 */
export function dailyLoad(day: DayTotals) {
  return day.pitchCount * day.intensity;
}

/* ------------------------------------------------------------------ *
 * 전력 환산 투구수
 *
 * 휴식일 표(Pitch Smart)는 '경기에서 전력으로 던진 투구수' 기준으로 만들어졌다.
 * 그런데 그 표를 종류·강도와 상관없이 그대로 적용하면 캐치볼 80구에도 4일
 * 휴식이 나온다. 그렇다고 부하(투구수 × 강도)로 바꾸면 반대로 위험해진다 —
 * 절반 힘으로 던진 공이 절반 부담일 거라고 보는 셈인데, 연구는 그렇지 않다고
 * 말한다.
 *
 * 실제로 측정된 값은 두 점뿐이다.
 *   50% 노력 → 최대 팔꿈치 외반 토크의 75%  (Fleisig 1996, 대학 투수 27명)
 *   60% 노력 → 79% (73.2 / 92.5 N·m)        (Wolf 2025, 대학 투수 19명)
 *
 * 두 점을 잇는 직선을 100%까지 그으면 한 단계에 0.05씩이고, 이 직선은
 * Fleisig의 75% 노력 지점에서 0.875를 준다(논문 값 0.80~0.85). 실제보다
 * 조금 높게 잡히므로 안전한 쪽으로 어긋난다.
 *
 * 참고: IJSPT 2023 체계적 문헌고찰 — 네 연구 모두 "노력이 커질수록 토크가
 * 커진다"고 밝혔다. 다만 Wolf 2025는 표본이 작아 인접 단계 간 차이를
 * 가려내지는 못했다("유의차 없음"이 "같다"는 뜻은 아니다).
 * ------------------------------------------------------------------ */

/**
 * 체감 강도 → 팔 부담 계수.
 *
 * 5~10은 위 연구에서 나온 값이고, 4 이하는 측정한 연구가 없다.
 *
 * 4 이하를 0에 가깝게 낮추지 않은 이유가 있다. 연구가 보여주는 것은 노력이
 * 줄어도 팔에 가는 힘은 훨씬 덜 준다는 사실이다(절반 힘에도 구속은 최고의
 * 80%가 나온다). 그 흐름대로면 가벼운 던지기도 공짜가 아니다. 근거가 없는
 * 구간에서는 덜 쉬게 만드는 쪽보다 더 쉬게 만드는 쪽으로 틀리는 편이 낫다.
 */
export const INTENSITY_STRESS_FACTOR: Record<number, number> = {
  10: 1.0,
  9: 0.95,
  8: 0.9,
  7: 0.85,
  6: 0.8, // 실측 0.79
  5: 0.75, // 실측
  // ↓ 측정한 연구 없음. 아래는 판단으로 그은 선이다.
  4: 0.7,
  3: 0.6,
  2: 0.5,
  1: 0.4,
};

/** 근거 없는 구간에서도 이 아래로는 내리지 않는다. 던지는 것은 공짜가 아니다. */
export const MIN_STRESS_FACTOR = 0.4;

/**
 * 경기는 강도와 상관없이 전력으로 본다.
 *
 * 연구가 거듭 말하는 것이 "선수의 체감 노력은 실제 부하와 맞지 않는다"는
 * 것인데, 경기에서 특히 그렇다. 던질 양도 강도도 내가 정할 수 없고, 지고 있으면
 * 힘이 더 들어간다. 게다가 휴식일 표 자체가 경기 기준으로 만들어진 것이라,
 * 경기에 계수를 곱하면 그 표를 만든 전제를 흔드는 셈이 된다.
 */
export function stressFactor(intensity: number, sessionType?: string): number {
  if (sessionType === '경기') return 1;
  const rounded = Math.round(intensity);
  if (rounded <= 0) return 0; // 안 던진 날
  return INTENSITY_STRESS_FACTOR[Math.min(10, rounded)] ?? MIN_STRESS_FACTOR;
}

/** 한 세션을 '전력으로 던졌다면 몇 구에 해당하는가'로 바꾼다. */
export function effortAdjustedPitches(
  pitchCount: number,
  intensity: number,
  sessionType?: string
): number {
  return pitchCount * stressFactor(intensity, sessionType);
}

/** 두 날짜 키 사이의 일수 (같은 날이면 1) */
function daysBetween(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * 지수가중이동평균(EWMA)의 가중치.
 * λ = 2 / (기간 + 1). 최근 날짜일수록 크게 반영된다.
 */
const ACUTE_LAMBDA = 2 / (ACUTE_WINDOW_DAYS + 1);
const CHRONIC_LAMBDA = 2 / (CHRONIC_WINDOW_DAYS + 1);

/** 실측 반영률이 이 값을 넘으면 추정 표시를 뗀다. */
export const REAL_WEIGHT_TRUSTED = 0.9;

export type AcwrResult = {
  /** 최근 급성 부하 (주당 환산값 — 화면 표기 호환용) */
  acute: number;
  /** 평소 만성 부하 (주당 환산값) */
  chronic: number;
  /**
   * 급성 ÷ 만성.
   * 문진 기준선이 있으면 기록 첫날부터 나오고,
   * 없으면 예전처럼 28일치가 쌓여야 나온다.
   */
  ratio: number | null;
  zone: AcwrZone | null;
  /** 첫 기록부터 오늘까지의 날 수 */
  historyDays: number;
  /** (기준선 없는 경우) 지수가 나오기까지 남은 날 수 */
  daysNeeded: number;
  /** 문진 추정치가 섞여 있는가 */
  estimated: boolean;
  /** 만성 부하에서 실제 기록이 차지하는 비중 (0~1) */
  realWeight: number;
};

/**
 * 부하 지수를 EWMA로 계산한다.
 *
 * - 급성·만성 모두 하루 부하의 지수가중평균이라 최근일수록 크게 반영된다.
 * - seedDailyLoad(가입 문진 추정치)가 있으면 그 값을 시작점으로 삼아
 *   첫 기록부터 지수를 낼 수 있다. 기록이 쌓일수록 시작점의 영향은
 *   (1-λ)^일수 로 줄어들며, 그 비율을 realWeight로 함께 돌려준다.
 * - 기준선이 없으면 예전과 같은 28일 규칙을 지킨다(첫 주 평균을 시작점으로 사용).
 */
export function computeAcwr(
  byDay: Map<string, DayTotals>,
  today = new Date(),
  opts?: { seedDailyLoad?: number | null }
): AcwrResult {
  const todayKey = toDateKey(today);
  const seed = opts?.seedDailyLoad ?? null;

  const firstKey = [...byDay.keys()].sort()[0];
  const historyDays = firstKey ? daysBetween(firstKey, todayKey) : 0;
  const daysNeeded = Math.max(0, CHRONIC_WINDOW_DAYS - historyDays);

  // 기록이 하나도 없으면 지수를 내지 않는다.
  // (기준선만으로 1.0을 보여주는 건 실측이 아니라 눈속임이다.)
  if (!firstKey) {
    return {
      acute: seed != null ? seed * 7 : 0,
      chronic: seed != null ? seed * 7 : 0,
      ratio: null,
      zone: null,
      historyDays: 0,
      daysNeeded: seed != null ? 0 : CHRONIC_WINDOW_DAYS,
      estimated: seed != null,
      realWeight: 0,
    };
  }

  // 첫 기록일부터 오늘까지 하루씩 EWMA를 갱신한다. 기록 없는 날은 0.
  const days: string[] = [];
  for (let key = firstKey; ; key = shiftDateKey(key, 1)) {
    days.push(key);
    if (key === todayKey || days.length > 400) break;
  }

  // 시작점: 문진 추정치가 있으면 그 값, 없으면 첫 주 실측 평균.
  // (0에서 시작하면 만성이 낮게 잡혀 지수가 부풀어 오른다.)
  let init: number;
  if (seed != null) {
    init = seed;
  } else {
    const firstWeek = days.slice(0, Math.min(7, days.length));
    init =
      firstWeek.reduce((sum, k) => {
        const d = byDay.get(k);
        return sum + (d ? dailyLoad(d) : 0);
      }, 0) / firstWeek.length;
  }

  let acuteEwma = init;
  let chronicEwma = init;
  for (const key of days) {
    const load = byDay.has(key) ? dailyLoad(byDay.get(key)!) : 0;
    acuteEwma = load * ACUTE_LAMBDA + acuteEwma * (1 - ACUTE_LAMBDA);
    chronicEwma = load * CHRONIC_LAMBDA + chronicEwma * (1 - CHRONIC_LAMBDA);
  }

  // 만성 부하에서 시작점(추정 or 첫 주)이 아직 차지하는 비중
  const seedWeight = Math.pow(1 - CHRONIC_LAMBDA, days.length);
  const realWeight = 1 - seedWeight;
  const estimated = seed != null && realWeight < REAL_WEIGHT_TRUSTED;

  // 주당 환산값으로 돌려줘 기존 화면·문구("최근 7일 부하")와 호환한다.
  const acute = acuteEwma * 7;
  const chronic = chronicEwma * 7;

  // 기준선이 없으면 예전 규칙대로 28일을 채워야 지수를 낸다.
  if (seed == null && daysNeeded > 0) {
    return {
      acute,
      chronic,
      ratio: null,
      zone: null,
      historyDays,
      daysNeeded,
      estimated: false,
      realWeight,
    };
  }

  if (chronic <= 0) {
    return {
      acute,
      chronic,
      ratio: null,
      zone: null,
      historyDays,
      daysNeeded: 0,
      estimated,
      realWeight,
    };
  }

  const ratio = acuteEwma / chronicEwma;
  return {
    acute,
    chronic,
    ratio,
    zone: zoneOf(ratio),
    historyDays,
    daysNeeded: 0,
    estimated,
    realWeight,
  };
}
