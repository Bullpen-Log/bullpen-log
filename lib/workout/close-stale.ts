import 'server-only';
import { emptiedWhere, summaryPlanOf, summaryUpsertArgs } from '@/lib/workout/summary-core';
import { currentContracts, readSetLoads } from '@/lib/workout/load/server';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { dayStart, isAbandoned, sessionEnd } from '@/lib/workout/stale';
import { advanceProgramDay } from '@/lib/program/advance';
import { isV2Session } from '@/lib/workout/v2/gate';
import { legacyAbandon } from '@/lib/workout/v2/legacy';

/**
 * 판을 닫는 쓰기들 — [운동 종료]와, 떠난 판을 대신 닫을 때가 함께 쓴다.
 *
 * 서버 동작 파일(app/actions/workout.ts)에 두지 않는다. 'use server' 파일에서
 * 내보낸 함수는 화면에서 누구나 부를 수 있는데, 이 함수들은 회원 번호를 인자로
 * 받는다. 로그인을 확인한 서버 코드만 부른다.
 */

type SessionRef = { id: string; date: Date };

/**
 * 판의 세트를 운동 기록(UserExerciseLog)으로 접는 쓰기들.
 *
 * 세트가 진실이고 요약은 거기서 계산한다(lib/workout/summarize.ts). 세트가 하나도
 * 없는 운동은 건드리지 않는다 — 열었다가 아무것도 안 한 운동을 '했다'로 남길 수는
 * 없다. 트랜잭션에 넣을 수 있게 실행하지 않은 채로 돌려준다.
 */
export async function summaryWrites(userId: string, session: SessionRef) {
  const [rows, row] = await Promise.all([
    prisma.userExerciseSet.findMany({
      where: { sessionId: session.id },
      select: { id: true, exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
    }),
    prisma.trainingSession.findUnique({
      where: { id: session.id },
      select: { plan: true },
    }),
  ]);
  /*
   * EX-LOAD01 — 요약의 kg 은 읽기 관문을 지난 '보일 무게'만(lib/workout/load/plan-gate.ts). 맨몸 운동에 옛 앱이 보낸 kg 처럼 계약이 받지
   * 않는 무게는 요약 · 부하 · '최근'으로 올라가지 않는다. 세트 줄의 원래 값은 그대로 남는다.
   * EX-LOAD01 R1 — 계산은 lib/workout/summary-core.ts 한곳(코치 기록 · 격리 시험이 같은 코드). 기구 A · 기구 B 처럼 문맥이 갈린 무게는
   * 한 숫자로 접지 않는다(summarizeSets weightWithheld).
   */
  const frozenPlan = readFrozenPlan(row?.plan);
  const [snapshots, current] = await Promise.all([readSetLoads(rows.map((r) => r.id)), currentContracts(rows.map((r) => r.exerciseId))]);
  const { summaries, emptied } = summaryPlanOf(rows, frozenPlan?.exercises, snapshots, current);

  /*
   * 앞서 접었다가(마침 · 저절로 닫힘) 다시 연 판에서 한 운동의 세트를 모두 지웠으면, 그 운동의 기록 줄도 지운다 — 남겨 두면
   * 부하 · 달력 · '최근'이 안 한 운동을 계속 셈했다(2026-10-16 점검 A6). 판의 운동 가운데 세트가 0 이고 세트 요약(setsDone)이
   * 적힌 줄만 — 체크 목록(saveDone)이 남긴 줄은 setsDone 이 없어 그대로 둔다.
   */
  const cleanup = emptied.length > 0 ? [prisma.userExerciseLog.deleteMany({ where: emptiedWhere(userId, session.date, emptied) })] : [];

  return [...cleanup, ...summaries.map((s) => prisma.userExerciseLog.upsert(summaryUpsertArgs(userId, session.date, s)))];
}

/** 그 판에 마지막으로 남긴 세트의 시각. 세트가 없으면 null */
export async function lastSetAt(sessionId: string): Promise<Date | null> {
  const r = await prisma.userExerciseSet.aggregate({
    where: { sessionId },
    _max: { recordedAt: true },
  });
  return r._max.recordedAt;
}

/**
 * 떠난 판 하나를 닫는다.
 *
 * 상태는 ABANDONED 다(스키마에 처음부터 있던 값). 사람이 [종료]를 누른 판(FINISHED)과
 * 구별해 둔다 — 체감 강도·느낀점이 없는 까닭이 거기 있다. 세트는 마친 판과 똑같이
 * 운동 기록으로 접으므로, 운동 부하·캘린더에는 한 것이 그대로 들어간다.
 *
 * 둘이 동시에 닫으려 해도(두 탭) 상태를 바꾸는 쓰기는 아직 ACTIVE 일 때만 걸린다.
 * 요약 쓰기는 같은 값을 다시 쓰는 것이라 두 번 돌아도 달라지지 않는다.
 */
export async function closeAbandoned(
  userId: string,
  session: SessionRef & { startedAt: Date; mainStartedAt: Date | null },
  last: Date | null,
  now: Date
) {
  /*
   * EX-RX01 R2A — v2 판은 옛 닫기(통째 쓰기)로 닫지 않는다(울타리가 막는다). v2 닫기 명령으로 — 요약 · 프로그램 효과(원래 의무) ·
   * 시간을 한 거래로(마치기와 같은 핵심, 상태만 ABANDONED). 칸이 없으면(적용 전) 안 탄다.
   */
  if (await isV2Session(session.id)) {
    await legacyAbandon(userId, session.id);
    return;
  }
  const end = sessionEnd(session, last, now);
  const writes = await summaryWrites(userId, session);
  await prisma.$transaction([
    ...writes,
    prisma.trainingSession.updateMany({
      where: { id: session.id, status: 'ACTIVE' },
      data: {
        status: 'ABANDONED',
        endedAt: end.endedAt,
        activeSeconds: { increment: end.segmentSeconds },
      },
    }),
  ]);
  /*
   * 프로그램 날이면 일차를 넘긴다(처방 세트 절반 이상일 때만, 한 번만 — lib/program/advance.ts, U4).
   * 화면을 그리기 전에 도는 길이라 실패해도 화면을 막지 않는다. 늦게 온 세트가 절반을 채우면 그때 넘긴다.
   */
  await advanceProgramDay(session.id).catch(() => false);
}

/**
 * 이 사람의 떠난 판을 모두 닫는다. 닫은 개수를 돌려준다.
 *
 * 홈·트레이닝·[운동 시작]·운동 화면·워밍업 화면이 저마다 오늘을 보기 전에 부른다
 * (loadTodayCore, 두 운동 화면). 지난 날짜의 열린 판이 없으면 조회 한 번으로 끝난다
 * — 거의 언제나 그렇다.
 */
export async function closeAbandonedSessions(userId: string, now = appNow()) {
  const open = await prisma.trainingSession.findMany({
    where: { userId, status: 'ACTIVE', date: { lt: dayStart(now) } },
    select: { id: true, date: true, startedAt: true, mainStartedAt: true },
  });

  let closed = 0;
  for (const s of open) {
    const last = await lastSetAt(s.id);
    if (!isAbandoned(s, last, now)) continue;
    await closeAbandoned(userId, s, last, now);
    closed += 1;
  }
  return closed;
}
