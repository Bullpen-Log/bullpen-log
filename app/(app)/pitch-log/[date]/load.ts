import { appNow } from '@/lib/clock';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { toDateKey } from '@/lib/pitch-stats';
import { armStatusOf } from '@/lib/report/arm-status';
import { loadVelocityDay } from '@/lib/velocity-load';
import { pitchNutritionLine } from '@/lib/nutrition/nudge';
import type { DayClient } from './day-client';

/**
 * 그날 화면이 쓰는 것을 읽는다 — 페이지(/pitch-log/<날짜>)와 팝업(app/(app)/@modal)이
 * 같이 쓴다. 날짜가 꼴이 틀리거나 없는 날이면 null(부르는 쪽이 404).
 */

/** 2026-08-28 같은 꼴만 받는다. 아니면 404 — 아무 글자나 주소에 넣어 볼 수 있다. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PitchDayData = Parameters<typeof DayClient>[0];

export async function loadPitchDay(date: string): Promise<PitchDayData | null> {
  if (!DATE_RE.test(date)) return null;

  /*
   * 날짜로 읽었는데 실제로 없는 날일 수 있다(2026-02-31 같은 것).
   * Date 는 그런 값을 조용히 다음 달로 넘겨 버리므로, 되돌려 찍어 확인한다.
   */
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
    return null;
  }

  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 — 페이지와 팝업이 다 이 길을 지난다 */
  if (featureLocks(user).pitch) redirect(SETUP_PATH.pitch);
  const now = appNow();
  const todayKey = toDateKey(now);

  const [logs, gathered, velocity, nutritionLine] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: at },
      orderBy: { createdAt: 'asc' },
    }),
    /*
     * 지금 팔 상태(위험 · 주의 · 안전, lib/report/arm-status.ts) — 오늘 날짜일 때만. 지난 날짜에 지금 상태를 그때 상태인 양
     * 보일 수는 없다. 오늘 기록까지 넣어 센다 — 남기고 나면(quietRefresh) 방금 던진 양이 곧바로 상태에 든다.
     * 예전엔 오늘 기록을 뺀 아침 계획('40~55구 · 강도 60~80%')과 '계획보다 N구 많아요'였다(2026-10-14 사용자: 몇 구를
     * 던지라고 하지 말고 위험한지 안전한지만).
     */
    date === todayKey ? gatherFactsAndPlan(user, now) : null,
    /* 카메라로 잰 구속 — 세션과 공 하나하나(그날 화면의 '구속 측정' 칸) */
    loadVelocityDay(user.id, at),
    /* 던진 뒤 회복식 한 줄 — 오늘 불펜 · 라이브 · 경기 기록이 있을 때만(lib/nutrition/nudge.ts). 저장 뒤 quietRefresh 로 곧바로 뜬다 */
    pitchNutritionLine(user, date, todayKey),
  ]);

  const todayStatus = gathered ? armStatusOf(gathered.facts) : null;

  return {
    date,
    todayKey,
    todayStatus,
    nutritionLine,
    initialLogs: logs.map((log) => ({ ...log, date: log.date.toISOString() })),
    velocity,
    /* 스피드건 값 칸은 관리자만(2026-10-15 사용자) */
    isAdmin: user.role === 'ADMIN',
  };
}
