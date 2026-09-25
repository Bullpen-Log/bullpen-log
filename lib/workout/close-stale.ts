import 'server-only';
import { prisma } from '@/lib/prisma';
import { summarizeSets } from '@/lib/workout/summarize';
import { dayStart, isAbandoned, sessionEnd } from '@/lib/workout/stale';

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
  const rows = await prisma.userExerciseSet.findMany({
    where: { sessionId: session.id },
    select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
  });

  return summarizeSets(rows).map((s) =>
    prisma.userExerciseLog.upsert({
      where: {
        userId_exerciseId_date: { userId, exerciseId: s.exerciseId, date: session.date },
      },
      create: {
        userId,
        exerciseId: s.exerciseId,
        date: session.date,
        completed: true,
        setsDone: s.setsDone,
        repsDone: s.repsDone,
        holdSecondsDone: s.holdSecondsDone,
        weightKg: s.weightKg,
      },
      update: {
        completed: true,
        setsDone: s.setsDone,
        repsDone: s.repsDone,
        holdSecondsDone: s.holdSecondsDone,
        weightKg: s.weightKg,
      },
    })
  );
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
}

/**
 * 이 사람의 떠난 판을 모두 닫는다. 닫은 개수를 돌려준다.
 *
 * 홈·트레이닝·[운동 시작]·운동 화면·워밍업 화면이 저마다 오늘을 보기 전에 부른다
 * (loadTodayCore, 두 운동 화면). 지난 날짜의 열린 판이 없으면 조회 한 번으로 끝난다
 * — 거의 언제나 그렇다.
 */
export async function closeAbandonedSessions(userId: string, now = new Date()) {
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
