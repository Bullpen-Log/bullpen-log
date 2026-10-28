import { isRestSession } from '@/lib/session-type';
import type { PitchLog } from './api';

/** 0구만 보고 휴식이라고 추측하지 않는다. 실제 오늘 기록이 모두 휴식일 때만 표시한다. */
export function isRecordedRest(logs: readonly PitchLog[] | null, today: string): boolean {
  const rows = logs?.filter((log) => log.date.slice(0, 10) === today);
  return !!rows?.length && rows.every((log) => isRestSession(log.sessionType));
}

/** 최근 몇 개 — 오늘까지, 최근 날 먼저(같은 날이면 나중에 남긴 것 먼저), 같은 기록은 한 번 */
export function recentPitchLogs(logs: readonly PitchLog[], today: string, n: number): PitchLog[] {
  const byId = new Map<string, PitchLog>();
  for (const l of logs) if (l.date.slice(0, 10) <= today) byId.set(l.id, l);
  return [...byId.values()]
    .sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}
