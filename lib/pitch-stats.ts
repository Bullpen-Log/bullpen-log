/** 연속한 이틀의 체감 강도 합이 이 값을 넘으면 과부하로 본다. */
export const TWO_DAY_INTENSITY_LIMIT = 10;

export type PitchLogLike = {
  date: string; // YYYY-MM-DD 또는 ISO 문자열
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

    if (!prev) {
      acc.set(key, {
        dateKey: key,
        pitchCount: log.pitchCount,
        intensity: log.intensity,
        intensitySum,
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
