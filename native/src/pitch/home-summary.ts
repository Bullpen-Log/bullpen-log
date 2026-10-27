import { isRestSession } from '@/lib/session-type';
import type { PitchLog } from './api';

/** 홈의 최근 한 건. 달력에서 고른 달·배열 순서와 무관하며 미래 기록은 제외한다. */
export function latestPitchLog(logs: readonly PitchLog[], today: string): PitchLog | null {
  return logs.reduce<PitchLog | null>((latest, log) => {
    const date = log.date.slice(0, 10);
    if (date > today) return latest;
    if (!latest || date > latest.date.slice(0, 10) || (date === latest.date.slice(0, 10) && log.createdAt > latest.createdAt)) return log;
    return latest;
  }, null);
}

/** 0구만 보고 휴식이라고 추측하지 않는다. 실제 오늘 기록이 모두 휴식일 때만 표시한다. */
export function isRecordedRest(logs: readonly PitchLog[] | null, today: string): boolean {
  const rows = logs?.filter((log) => log.date.slice(0, 10) === today);
  return !!rows?.length && rows.every((log) => isRestSession(log.sessionType));
}
