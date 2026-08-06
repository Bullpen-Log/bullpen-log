/**
 * 구속 관련 계산.
 *
 * 이 제품의 사용자가 가장 알고 싶어하는 숫자라 따로 모아둔다.
 * 전부 기록에서 규칙으로 계산하며 추정이나 보정을 넣지 않는다.
 */

export type VelocityLog = {
  /** ISO 문자열 또는 YYYY-MM-DD */
  date: string;
  maxVelocity: number;
  avgVelocity: number | null;
};

export type VelocityPoint = {
  dateKey: string;
  max: number;
  avg: number | null;
  /** 그날까지의 개인 최고 (그래프에 계단선으로 그린다) */
  best: number;
  /** 이 날 개인 최고를 새로 세웠는가 */
  isNewBest: boolean;
};

export type VelocityStats = {
  points: VelocityPoint[];
  /** 전체 기간 개인 최고 */
  best: number | null;
  /** 개인 최고를 세운 날 */
  bestDate: string | null;
  /** 가장 최근 기록의 최고 구속 */
  latest: number | null;
  latestDate: string | null;
  /** 최근 기록이 개인 최고와 같은 날인가 (= 방금 신기록) */
  latestIsBest: boolean;
  /** 최근 5회 평균 vs 그 이전 5회 평균의 차이 (km/h). 자료가 부족하면 null */
  trend: number | null;
};

const TREND_WINDOW = 5;

const dayKey = (iso: string) => iso.slice(0, 10);

/**
 * 기록을 날짜순으로 훑어 구속 추이와 개인 최고를 만든다.
 * 같은 날 여러 번 던졌으면 그날의 최고값 하나로 묶는다.
 */
export function buildVelocityStats(logs: VelocityLog[]): VelocityStats {
  const byDay = new Map<string, { max: number; avgSum: number; avgCount: number }>();

  for (const log of logs) {
    if (!Number.isFinite(log.maxVelocity) || log.maxVelocity <= 0) continue;
    const key = dayKey(log.date);
    const prev = byDay.get(key);
    if (!prev) {
      byDay.set(key, {
        max: log.maxVelocity,
        avgSum: log.avgVelocity ?? 0,
        avgCount: log.avgVelocity != null ? 1 : 0,
      });
      continue;
    }
    prev.max = Math.max(prev.max, log.maxVelocity);
    if (log.avgVelocity != null) {
      prev.avgSum += log.avgVelocity;
      prev.avgCount++;
    }
  }

  const points: VelocityPoint[] = [];
  let best = 0;
  let bestDate: string | null = null;

  for (const dateKey of [...byDay.keys()].sort()) {
    const day = byDay.get(dateKey)!;
    const isNewBest = day.max > best;
    if (isNewBest) {
      best = day.max;
      bestDate = dateKey;
    }
    points.push({
      dateKey,
      max: day.max,
      avg: day.avgCount > 0 ? Math.round((day.avgSum / day.avgCount) * 10) / 10 : null,
      best,
      isNewBest,
    });
  }

  const last = points.at(-1) ?? null;

  // 최근 흐름 — 최근 5회와 그 이전 5회의 평균을 견준다.
  let trend: number | null = null;
  if (points.length >= TREND_WINDOW * 2) {
    const recent = points.slice(-TREND_WINDOW);
    const earlier = points.slice(-TREND_WINDOW * 2, -TREND_WINDOW);
    const mean = (arr: VelocityPoint[]) =>
      arr.reduce((sum, p) => sum + p.max, 0) / arr.length;
    trend = Math.round((mean(recent) - mean(earlier)) * 10) / 10;
  }

  return {
    points,
    best: points.length > 0 ? best : null,
    bestDate,
    latest: last?.max ?? null,
    latestDate: last?.dateKey ?? null,
    latestIsBest: last != null && last.isNewBest,
    trend,
  };
}

/** 목표 구속으로 인정할 범위 (km/h) */
export const TARGET_VELOCITY_MIN = 60;
export const TARGET_VELOCITY_MAX = 180;

export function validateTargetVelocity(
  raw: string
): { error: string } | { value: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };

  const n = Number(trimmed);
  if (!Number.isInteger(n)) return { error: '목표 구속은 정수로 입력해주세요.' };
  if (n < TARGET_VELOCITY_MIN || n > TARGET_VELOCITY_MAX) {
    return {
      error: `목표 구속은 ${TARGET_VELOCITY_MIN}~${TARGET_VELOCITY_MAX}km/h 사이로 입력해주세요.`,
    };
  }
  return { value: n };
}
