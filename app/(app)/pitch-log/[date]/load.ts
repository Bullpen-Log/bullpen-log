import { appNow } from '@/lib/clock';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { toDateKey } from '@/lib/pitch-stats';
import { armStatusOf } from '@/lib/report/arm-status';
import { loadVelocityDay, withMissedAttempts } from '@/lib/velocity-load';
import { logPrefillOf, unloggedSessions } from '@/lib/velocity-meta';
import { pitchNutritionLine } from '@/lib/nutrition/nudge';
import { DRILL_THROW_TEXT, readProgramState } from '@/lib/mechanics/program';
import { loadDrillThrowNote } from '@/lib/mechanics/load';
import type { DayClient } from './day-client';

/**
 * 그날 화면이 쓰는 것을 읽는다 — 페이지(/pitch-log/<날짜>)와 팝업(app/(app)/@modal)이
 * 같이 쓴다. 날짜가 꼴이 틀리거나 없는 날이면 null(부르는 쪽이 404).
 */

/** 2026-08-28 같은 꼴만 받는다. 아니면 404 — 아무 글자나 주소에 넣어 볼 수 있다. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PitchDayData = Parameters<typeof DayClient>[0];

/**
 * 트레이닝의 '드릴로 공 N회 던졌어요' 카드가 붙여 오는 ?drill= → 새 기록 칸에 채울 값(2026-10-16). 오늘 날짜일 때만.
 * 숫자는 주소가 아니라 카드와 같은 판정(loadDrillThrowNote)에서 다시 읽는다 — 주소는 아무나 고칠 수 있고, 저장한 뒤
 * 다시 열거나 새로고침해도 카드가 닫혔으면(오늘 투구가 기준보다 늘었으면) 채우지 않는다.
 */
async function drillPrefillOf(
  userId: string,
  search: { drill?: string | string[] } | undefined,
  date: string,
  todayKey: string
) {
  if (!search?.drill || date !== todayKey) return null;
  const program = await prisma.mechanicsProgram.findUnique({
    where: { userId },
    select: { progress: true },
  });
  if (!program) return null;
  const note = await loadDrillThrowNote(userId, readProgramState(program.progress), todayKey);
  if (!note) return null;
  return {
    pitchCount: note.throws,
    effortPct: note.effortPct,
    memo: DRILL_THROW_TEXT.memo(note.throws),
  };
}

export async function loadPitchDay(
  date: string,
  search?: { drill?: string | string[] }
): Promise<PitchDayData | null> {
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

  const [logs, gathered, velocity, nutritionLine, drillPrefill] = await Promise.all([
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
    /* 메커니즘 드릴로 던진 공 — 트레이닝 카드에서 왔고 그 카드가 아직 살아 있을 때만 */
    drillPrefillOf(user.id, search, date, todayKey),
  ]);

  const todayStatus = gathered ? armStatusOf(gathered.facts) : null;

  return {
    date,
    todayKey,
    todayStatus,
    nutritionLine,
    initialLogs: logs.map((log) => ({ ...log, date: log.date.toISOString() })),
    velocity,
    /* 아직 투구 기록으로 안 남긴 구속 측정 — 새 기록 폼을 그 값으로 채워 연다(2026-10-16, 투구 탭 '오늘' 카드가 여기로 데려온다) */
    velocityPrefill: await withMissedAttempts(
      user.id,
      logPrefillOf(
        unloggedSessions(
          velocity,
          logs.map((l) => l.createdAt.toISOString())
        )
      )
    ),
    /* 스피드건 값 칸은 관리자만(2026-10-15 사용자) */
    isAdmin: user.role === 'ADMIN',
    drillPrefill,
  };
}
