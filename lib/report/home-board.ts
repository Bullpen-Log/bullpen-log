import { shiftDateKey, weekStartKey } from '@/lib/pitch-stats';
import { loadSignalOf, type ArmLevel, type LoadLike } from '@/lib/report/arm-status';
import { conditionVisualStage } from '@/components/checkin-flow/condition-visual';

/**
 * 앱 홈 아래 칸(오늘 플랜 · 기록 보드)의 숫자 — 순수 계산(DB 없음). 재료는 홈 요약 칸(lib/report/home-today.ts loadHomeFeed)이 이미 읽은
 * 것(lib/report/highlights-load.ts)을 그대로 받는다 — 같은 요청에서 다시 읽지 않는다.
 *
 * 2026-10-27 싱커 홈 개편(시안 1 볼 컨트롤 + 새 하단): 예전 요약 칸의 문장 대신 화면이 날짜 · 단위를 붙여 그릴 값만 낸다.
 * - 주는 월요일부터(weekStartKey — 투구 탭 '이번 주'와 같은 규칙). 이번 주 N일 = 기록이 하나라도 있는 날의 수(한 날 세 번 남겨도 1일).
 * - 기록 = 체크인 · 투구 기록(쉰 날 줄 포함 — 휴식도 기록) · 운동을 하나라도 마친 날. 앞날 · 빈 날은 칸만 있고 벌점처럼 그리지 않는다(화면 몫).
 * - 부하는 팔 상태와 같은 판정(loadSignalOf). 통증 · 회복 안내가 있으면 수치보다 안내가 먼저다(painFirst).
 */
export type BoardDay = {
  date: string;
  checkin: boolean;
  /** 던진 날 'throw' · 쉰 날 줄만 있으면 'rest' · 기록 없음 null */
  pitch: 'throw' | 'rest' | null;
  workout: boolean;
};

export type HomeBoard = {
  /** 이번 주 월요일 */
  weekStart: string;
  week: BoardDay[];
  /** 이번 주(오늘까지) 기록이 있는 날의 수 */
  weekDays: number;
  /** 마지막으로 남긴 투구 기록(쉰 날 포함) */
  lastPitch: { date: string; pitches: number; rested: boolean } | null;
  /** 최고 구속(km/h) — recent = 최근 6주 안에서, all = 6주 안에 없어 그 전 기록에서 */
  bestVelocity: { kmh: number; date: string; scope: 'recent' | 'all' } | null;
  /** 부하 지수 — 4주 기록이 없으면 null(기록 부족) */
  load: { ratio: number; label: string; plain: string; level: ArmLevel; estimated: boolean } | null;
  /** 오늘 체크인 컨디션(1~10) · 체크인 흐름과 같은 5단계 이름. 체크인 전이면 null */
  condition: { value: number; label: string } | null;
};

export type HomeBoardInput = {
  today: string;
  /** 날짜별 투구 기록 — 공 수(쉰 날 줄 빼고) · 쉰 날 줄만 있나. 최근 42일 */
  pitchDays: Record<string, { pitches: number; rest: boolean }>;
  /** 42일 밖의 마지막 기록(창 안에 기록이 없을 때만 씀). 없으면 null */
  olderLastLog: { date: string; pitches: number; rest: boolean } | null;
  velocityByDay: Record<string, number>;
  bestBefore: number | null;
  bestBeforeDate: string | null;
  conditionByDay: Record<string, number>;
  checkinDays: string[];
  /** 운동을 하나라도 마친 날 — 최근 14일 */
  workoutDays: string[];
  load: LoadLike;
};

export function buildHomeBoard(input: HomeBoardInput): HomeBoard {
  const { today, pitchDays, velocityByDay } = input;
  const weekStart = weekStartKey(today);
  const checked = new Set(input.checkinDays);
  const worked = new Set(input.workoutDays);
  const week: BoardDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDateKey(weekStart, i);
    const p = date <= today ? pitchDays[date] : undefined;
    return {
      date,
      checkin: date <= today && checked.has(date),
      pitch: p ? (p.pitches > 0 || !p.rest ? 'throw' : 'rest') : null,
      workout: date <= today && worked.has(date),
    };
  });
  const weekDays = week.filter((d) => d.checkin || d.pitch != null || d.workout).length;

  const logged = Object.keys(pitchDays).filter((k) => k <= today).sort();
  const lastKey = logged.at(-1);
  const lastPitch = lastKey
    ? { date: lastKey, pitches: pitchDays[lastKey].pitches, rested: pitchDays[lastKey].pitches === 0 && pitchDays[lastKey].rest }
    : input.olderLastLog
      ? { date: input.olderLastLog.date, pitches: input.olderLastLog.pitches, rested: input.olderLastLog.pitches === 0 && input.olderLastLog.rest }
      : null;

  /* 최근 6주 최고(같은 값이면 최근 날) — 없으면 그 전의 역대 최고 */
  let recent: { kmh: number; date: string } | null = null;
  for (const [date, kmh] of Object.entries(velocityByDay)) {
    if (date > today) continue;
    if (!recent || kmh > recent.kmh || (kmh === recent.kmh && date > recent.date)) recent = { kmh, date };
  }
  const bestVelocity = recent
    ? { ...recent, scope: 'recent' as const }
    : input.bestBefore != null && input.bestBeforeDate
      ? { kmh: input.bestBefore, date: input.bestBeforeDate, scope: 'all' as const }
      : null;

  const ls = input.load.ratio != null && input.load.zone != null ? loadSignalOf(input.load) : null;
  const load =
    ls && input.load.ratio != null
      ? { ratio: input.load.ratio, label: ls.label, plain: ls.plain, level: ls.level, estimated: !!input.load.estimated }
      : null;

  const c = input.conditionByDay[today];
  const condition = c != null ? { value: c, label: conditionVisualStage(c).shortLabel } : null;

  return { weekStart, week, weekDays, lastPitch, bestVelocity, load, condition };
}
