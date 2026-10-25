import 'server-only';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { exercisesByIds } from '@/lib/library-cache';
import { slotForTheme } from '@/lib/report/theme';
import { summaryWrites } from '@/lib/workout/close-stale';
import { freezeExercise, readFrozenPlan, type FrozenPlan } from '@/lib/workout/session-plan';
import {
  ORG_SET_BASE,
  isEmptyOrgPlan,
  orgPlan,
  withOrgExercises,
  withoutEmptyOrgExercises,
  type OrgWorkItem,
} from '@/lib/org/team-work';

/**
 * 코치 운동을 선수의 그날 운동 판에 쓰기(3단계 준비, 규칙은 lib/org/team-work.ts). 서버 동작 파일이 아니다 — 회원 번호를 받으므로
 * 코치 권한 · 선수 공유 동의(트레이닝)를 확인한 서버 코드만 부른다(lib/workout/close-stale.ts 와 같은 까닭).
 *
 * 한 활동(orgEventId)의 코치 세트를 통째로 바꾼다 — items 가 비면 그 활동의 코치 세트를 다 지운다(되돌리기 · 일지 지우기).
 * 판이 없으면 'org' 판(마친 상태)을 만들고, 코치 운동만 있던 판에 세트가 하나도 안 남으면 판째 지운다.
 * 세트를 바꾼 뒤 요약(UserExerciseLog)은 지금처럼 세트에서 다시 셈한다(summaryWrites) — 부하 · 달력 · '최근 운동'이 그대로 따라온다.
 */
export async function writeOrgWork(a: {
  userId: string;
  dateKey: string;
  orgEventId: string;
  enteredById: string;
  items: readonly OrgWorkItem[];
}): Promise<void> {
  const date = new Date(`${a.dateKey}T00:00:00.000Z`);
  const details = await exercisesByIds(a.items.map((i) => i.exerciseId));
  const frozen = details.map((ex) => freezeExercise(ex, slotForTheme(ex, 'lower')));
  const known = new Set(details.map((d) => d.id));
  const items = a.items.filter((i) => known.has(i.exerciseId));

  const sessionId = await prisma.$transaction(async (tx) => {
    let session = await tx.trainingSession.findUnique({
      where: { userId_date: { userId: a.userId, date } },
      select: { id: true, plan: true },
    });
    if (!session) {
      if (items.length === 0) return null;
      const now = appNow();
      session = await tx.trainingSession.create({
        data: { userId: a.userId, date, themeKey: 'org', plan: orgPlan(frozen), status: 'FINISHED', startedAt: now, mainStartedAt: now, endedAt: now },
        select: { id: true, plan: true },
      });
    }
    const id = session.id;

    /* 이 활동의 코치 세트를 통째로 지우고 다시 넣는다. 다른 활동의 코치 세트(같은 날 두 번 · 같은 운동)는 그 번호 뒤부터 */
    await tx.userExerciseSet.deleteMany({ where: { sessionId: id, orgEventId: a.orgEventId } });
    const others = await tx.userExerciseSet.groupBy({
      by: ['exerciseId'],
      where: { sessionId: id, setNo: { gt: ORG_SET_BASE }, exerciseId: { in: items.map((i) => i.exerciseId) } },
      _max: { setNo: true },
    });
    const start = new Map(others.map((o) => [o.exerciseId, o._max.setNo ?? ORG_SET_BASE]));
    if (items.length)
      await tx.userExerciseSet.createMany({
        data: items.flatMap((it) =>
          it.sets.map((s, i) => ({
            sessionId: id,
            userId: a.userId,
            exerciseId: it.exerciseId,
            date,
            setNo: (start.get(it.exerciseId) ?? ORG_SET_BASE) + i + 1,
            weightKg: s.weightKg,
            reps: s.reps,
            holdSeconds: s.holdSeconds,
            enteredById: a.enteredById,
            orgEventId: a.orgEventId,
          }))
        ),
      });

    /* 판 목록 — 새 코치 운동은 뒤에 붙이고, 세트가 안 남은 코치 운동은 뺀다(그 요약 줄도) */
    const plan: FrozenPlan | null = readFrozenPlan(session.plan);
    if (!plan) return id; /* 목록을 못 읽는 판은 목록을 건드리지 않는다 — 세트 · 요약만 */
    const left = await tx.userExerciseSet.findMany({ where: { sessionId: id }, select: { exerciseId: true }, distinct: ['exerciseId'] });
    const { plan: next, dropped } = withoutEmptyOrgExercises(withOrgExercises(plan, frozen.filter((f) => items.some((i) => i.exerciseId === f.id))), new Set(left.map((l) => l.exerciseId)));
    if (dropped.length)
      await tx.userExerciseLog.deleteMany({ where: { userId: a.userId, date, exerciseId: { in: dropped }, setsDone: { not: null } } });
    if (isEmptyOrgPlan(next)) {
      await tx.trainingSession.delete({ where: { id } });
      return null;
    }
    if (next !== plan) await tx.trainingSession.update({ where: { id }, data: { plan: next } });
    return id;
  });

  if (sessionId) await prisma.$transaction(await summaryWrites(a.userId, { id: sessionId, date }));
}
