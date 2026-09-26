import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { visibleExercises } from '@/lib/library-cache';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { ARMCARE_KIND_TEXT } from '@/lib/armcare/routine';
import { loadArmcareToday } from '@/lib/armcare/today';
import { isRoutineId } from '@/lib/armcare/my-routines';
import { loadMyRoutine } from '@/lib/armcare/my-routines-store';
import { toArmcareViews } from '@/app/(app)/training/armcare-views';
import { ArmcarePlayer, type PlayerItem } from './armcare-player';

const BACK = '/training?view=armcare';

/**
 * 루틴 따라하기 — /armcare/play/today (오늘의 맞춤 루틴), /armcare/play/<내 루틴 id>.
 *
 * 운동 판(/workout/run)처럼 메뉴가 없는 전체 화면이다((session) 틀). 루틴 목록을 읽지
 * 않고 한 운동씩 따라 하게 한다(2026-09-26, armcare-player.tsx).
 *
 * 숨긴 운동과 암케어가 아닌 것은 뺀다 — 루틴 목록이 보여 주는 것과 같다.
 */
export default async function ArmcarePlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const today = new Date();

  let title: string;
  let picks: { exerciseId: string; sets: number }[];
  let doneToday: Set<string>;

  if (id === 'today') {
    const data = await loadArmcareToday(user, today);
    /* 아직 안 만들었거나 통증인 날 — 루틴 칸이 그 까닭을 보여 준다 */
    if (!data.routine || data.decision.kind === 'rest') redirect(BACK);
    title = `오늘의 ${ARMCARE_KIND_TEXT[data.routine.kind].label}`;
    picks = data.routine.items.map((it) => ({
      exerciseId: it.exerciseId,
      sets: it.sets,
    }));
    doneToday = data.doneToday;
  } else if (isRoutineId(id)) {
    const routine = await loadMyRoutine(user.id, id);
    if (!routine) notFound();
    title = routine.name;
    picks = routine.items;
    const logs = await prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        completed: true,
        date: new Date(`${toDateKey(today)}T00:00:00.000Z`),
        exerciseId: { in: routine.items.map((it) => it.exerciseId) },
      },
      select: { exerciseId: true },
    });
    doneToday = new Set(logs.map((l) => l.exerciseId));
  } else {
    notFound();
  }

  const library = await visibleExercises();
  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const usable = picks.filter(
    (p) => byId.get(p.exerciseId)?.category === ARMCARE_CATEGORY
  );
  const views = await toArmcareViews(
    usable.map((p) => byId.get(p.exerciseId)!),
    new Map(usable.map((p) => [p.exerciseId, p.sets]))
  );
  const items: PlayerItem[] = usable.map((p, i) => {
    const ex = byId.get(p.exerciseId)!;
    return {
      exercise: views[i],
      sets: p.sets,
      reps: ex.reps,
      holdSeconds: ex.holdSeconds,
      restSeconds: ex.restSeconds ?? 45,
      perSide: ex.perSide,
      doneBefore: doneToday.has(p.exerciseId),
    };
  });

  return <ArmcarePlayer title={title} backHref={BACK} items={items} />;
}
