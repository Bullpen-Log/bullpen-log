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

/** 오늘부터 거슬러 올라가 days일치 날짜 키를 오래된 순으로 만든다. */
export function buildDateRange(days: number, today = new Date()): string[] {
  const base = toDateKey(today);
  return Array.from({ length: days }, (_, i) => shiftDateKey(base, i - days + 1));
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
  avgIntensity: number;
  maxVelocity: number | null;
  avgVelocity: number | null;
};

export function summarize(
  byDay: Map<string, DayTotals>,
  dateKeys: string[]
): PeriodSummary {
  const days = dateKeys
    .map((k) => byDay.get(k))
    .filter((d): d is DayTotals => d != null);

  if (days.length === 0) {
    return {
      totalPitches: 0,
      activeDays: 0,
      avgIntensity: 0,
      maxVelocity: null,
      avgVelocity: null,
    };
  }

  const maxVels = days.map((d) => d.maxVelocity).filter((v): v is number => v != null);
  const avgVels = days.map((d) => d.avgVelocity).filter((v): v is number => v != null);

  return {
    totalPitches: days.reduce((sum, d) => sum + d.pitchCount, 0),
    activeDays: days.length,
    avgIntensity:
      days.reduce((sum, d) => sum + d.intensity, 0) / days.length,
    maxVelocity: maxVels.length ? Math.max(...maxVels) : null,
    avgVelocity: avgVels.length
      ? avgVels.reduce((a, b) => a + b, 0) / avgVels.length
      : null,
  };
}
