/** 연속한 이틀의 체감 강도 합이 이 값을 넘으면 과부하로 본다. */
export const TWO_DAY_INTENSITY_LIMIT = 10;

export type PitchLogLike = {
  date: string; // YYYY-MM-DD 또는 ISO 문자열
  pitchCount: number;
  intensity: number;
  maxVelocity: number;
  avgVelocity: number | null;
};

/** 로컬 시간대 기준 YYYY-MM-DD */
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDateKey(dateKey: string, offset: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + offset));
}

export function formatShortDate(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export type DayTotals = {
  dateKey: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
};

/**
 * 하루에 여러 번 기록했을 수 있으므로 날짜별로 합친다.
 * 투구수와 강도는 더하고, 최고 구속은 그날의 최댓값을,
 * 평균 구속은 투구수로 가중평균을 낸다.
 */
export function groupByDay(logs: PitchLogLike[]): Map<string, DayTotals> {
  // 가중평균을 내려면 (평균구속 × 투구수)의 합과 그 투구수 합이 필요하다.
  const acc = new Map<
    string,
    DayTotals & { avgWeightedSum: number; avgWeight: number }
  >();

  for (const log of logs) {
    const key = log.date.slice(0, 10);
    const prev = acc.get(key);

    const hasAvg = log.avgVelocity != null;
    const weightedSum = hasAvg ? log.avgVelocity! * log.pitchCount : 0;
    const weight = hasAvg ? log.pitchCount : 0;

    if (!prev) {
      acc.set(key, {
        dateKey: key,
        pitchCount: log.pitchCount,
        intensity: log.intensity,
        maxVelocity: log.maxVelocity,
        avgVelocity: log.avgVelocity,
        avgWeightedSum: weightedSum,
        avgWeight: weight,
      });
      continue;
    }

    const avgWeightedSum = prev.avgWeightedSum + weightedSum;
    const avgWeight = prev.avgWeight + weight;

    acc.set(key, {
      dateKey: key,
      pitchCount: prev.pitchCount + log.pitchCount,
      intensity: prev.intensity + log.intensity,
      maxVelocity: Math.max(prev.maxVelocity ?? 0, log.maxVelocity),
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
  const days = dateKeys
    .map((k) => byDay.get(k))
    .filter((d): d is DayTotals => d != null);

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
    if (byDay.has(key)) {
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
}: {
  days: number;
  current: PeriodSummary;
  previous: PeriodSummary;
  fatigueCount: number;
  streak: number;
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
        detail: `직전 ${days}일 ${previous.maxVelocity}km/h → ${label} ${current.maxVelocity}km/h. 피로가 쌓였는지, 폼이 달라졌는지 영상분석에서 확인해보세요.`,
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

export const ACWR_ZONES: Record<
  AcwrZone,
  { label: string; tone: 'good' | 'info' | 'warn' | 'bad'; advice: string }
> = {
  low: {
    label: '부하 낮음',
    tone: 'info',
    advice: '최근 부하가 평소보다 적습니다. 회복 중이라면 정상이며, 복귀할 때는 한 번에 늘리지 말고 조금씩 올리세요.',
  },
  optimal: {
    label: '적정',
    tone: 'good',
    advice: '평소 쌓아온 양에 맞는 부하입니다. 지금 흐름을 유지해도 좋습니다.',
  },
  caution: {
    label: '주의',
    tone: 'warn',
    advice: '최근 부하가 평소보다 빠르게 올랐습니다. 이번 주는 투구수나 강도를 조금 낮추는 편이 안전합니다.',
  },
  danger: {
    label: '위험',
    tone: 'bad',
    advice: '평소 감당하던 양을 크게 넘었습니다. 투구량을 확실히 줄이고 회복에 시간을 주세요.',
  },
};

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

function sumLoad(byDay: Map<string, DayTotals>, dateKeys: string[]) {
  return dateKeys.reduce((sum, key) => {
    const day = byDay.get(key);
    return sum + (day ? dailyLoad(day) : 0);
  }, 0);
}

/** 두 날짜 키 사이의 일수 (같은 날이면 1) */
function daysBetween(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86_400_000) + 1;
}

export type AcwrResult = {
  /** 최근 7일 부하 합 */
  acute: number;
  /** 최근 28일의 주당 평균 부하 */
  chronic: number;
  /**
   * 급성 ÷ 만성. 기록 기간이 28일에 못 미치면 만성 부하를 신뢰할 수 없어
   * null로 두고 화면에서는 "쌓는 중"으로 보여준다.
   */
  ratio: number | null;
  zone: AcwrZone | null;
  /** 첫 기록부터 오늘까지의 날 수 */
  historyDays: number;
  /** 신뢰할 수 있게 되기까지 남은 날 수 */
  daysNeeded: number;
};

export function computeAcwr(
  byDay: Map<string, DayTotals>,
  today = new Date()
): AcwrResult {
  const todayKey = toDateKey(today);
  const acute = sumLoad(byDay, buildDateRange(ACUTE_WINDOW_DAYS, today));
  const chronicTotal = sumLoad(byDay, buildDateRange(CHRONIC_WINDOW_DAYS, today));
  const chronic = chronicTotal / (CHRONIC_WINDOW_DAYS / ACUTE_WINDOW_DAYS);

  const firstKey = [...byDay.keys()].sort()[0];
  const historyDays = firstKey ? daysBetween(firstKey, todayKey) : 0;
  const daysNeeded = Math.max(0, CHRONIC_WINDOW_DAYS - historyDays);

  // 기간이 모자라거나 평소 부하가 0이면 비율에 의미가 없다.
  if (daysNeeded > 0 || chronic <= 0) {
    return { acute, chronic, ratio: null, zone: null, historyDays, daysNeeded };
  }

  const ratio = acute / chronic;
  return { acute, chronic, ratio, zone: zoneOf(ratio), historyDays, daysNeeded };
}
