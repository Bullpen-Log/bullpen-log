import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { dayLabel, isLightWeek, parseProgram, weekOfDay } from '@/lib/program/program';
import { summarizeSets, totalVolumeKg } from '@/lib/workout/summarize';
import { priorBests } from '@/lib/workout/prior-bests';
import { newRecord } from '@/lib/workout/bests';
import { DoneClient, type DoneRow } from './done-client';

/**
 * 운동을 마친 순간 — 축하 화면.
 *
 * 예전에는 [운동 마치기]를 누르면 곧바로 트레이닝 목록으로 돌아갔다. 한 시간을 쓰고 나서 받는 것이 화면
 * 바뀜뿐이었다. 애플 워치의 운동 요약처럼 링이 그려지며 체크가 뜨고, 세 숫자 · 새 최고 기록 · 한 운동을
 * 보이고 [완료] 하나로 끝낸다(2026-10-01 사용자 '애플처럼 감성있게').
 *
 * 숫자는 트레이닝의 완료 카드(done-card.tsx)와 같은 함수로 접는다 — 여기서 본 숫자와 돌아가서 보는 숫자가
 * 같아야 한다. 새 최고는 운동 중 세트 줄의 '새 최고'와 같은 함수다(lib/workout/bests.ts).
 *
 * 마친 판만 연다. 주소를 직접 쳐서 남의 판이나 아직 하는 판을 열 수 없다. 세트가 하나도 없으면 축하할
 * 것이 없으니 트레이닝으로 보낸다.
 */
export default async function WorkoutDonePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await requireUser();
  const { id } = await searchParams;
  if (typeof id !== 'string' || !id) redirect('/training');

  const session = await prisma.trainingSession.findFirst({
    where: { id, userId: user.id, status: 'FINISHED' },
    select: { id: true, date: true, plan: true, activeSeconds: true },
  });
  if (!session) redirect('/training');

  const sets = await prisma.userExerciseSet.findMany({
    where: { sessionId: session.id },
    orderBy: [{ exerciseId: 'asc' }, { setNo: 'asc' }],
    select: {
      exerciseId: true,
      setNo: true,
      weightKg: true,
      reps: true,
      holdSeconds: true,
      rir: true,
    },
  });
  if (sets.length === 0) redirect('/training');

  const plan = readFrozenPlan(session.plan);
  const frozen = plan?.exercises ?? [];
  const order = new Map(frozen.map((e, i) => [e.id, i]));
  const byId = new Map(frozen.map((e) => [e.id, e]));
  const bests = await priorBests(
    user.id,
    [...new Set(sets.map((s) => s.exerciseId))],
    session.date
  );

  /* 목록 순서대로 — 운동할 때 찍어 둔 목록의 차례. 목록에서 뺀 운동의 세트는 맨 뒤에 */
  const rows: DoneRow[] = summarizeSets(sets)
    .sort((a, b) => (order.get(a.exerciseId) ?? 999) - (order.get(b.exerciseId) ?? 999))
    .map((summary) => {
      const ex = byId.get(summary.exerciseId);
      const prior = bests.get(summary.exerciseId) ?? null;
      const record = ex
        ? newRecord(
            ex,
            sets.filter((s) => s.exerciseId === summary.exerciseId),
            prior
          )
        : null;
      return {
        id: summary.exerciseId,
        title: ex?.title ?? '목록에서 뺀 운동',
        summary,
        record: record && {
          ...record,
          /* 넘기 전의 최고 — '100 → 102.5kg' 처럼 얼마나 넘었는지 */
          before:
            record.kind === 'weight'
              ? (prior?.weightKg ?? null)
              : record.kind === 'reps'
                ? (prior?.reps ?? null)
                : (prior?.holdSeconds ?? null),
        },
      };
    });

  /*
   * 근력 · 파워 프로그램 날이면 — 일차를 넘겼는지, 다음 일차, 운동별 '추천 → 실제 · 여유'(설계 §13-9).
   * 넘기기는 [종료]가 이미 했다(lib/program/advance.ts). 여기서는 결과를 읽기만 한다.
   */
  const programPlan = plan?.program ? parseProgram(plan.program.key) : null;
  const program = plan?.program && programPlan
    ? await (async () => {
        const tag = plan.program as NonNullable<typeof plan.program>;
        const pp = programPlan;
        const last = tag.day >= pp.totalDays;
        const row = await prisma.userTrainingProgram.findFirst({
          where: {
            userId: user.id,
            programKey: tag.key,
            status: { in: ['active', 'done'] },
          },
          orderBy: { startedAt: 'desc' },
          select: { nextDay: true, status: true },
        });
        const advanced =
          row != null && (row.nextDay > tag.day || row.status === 'done');
        const nextWeek = weekOfDay(pp, tag.day + 1);
        const lifts = frozen
          .filter((e) => e.programSlot && e.suggestedKg != null)
          .map((e) => {
            const mine = sets.filter((x) => x.exerciseId === e.id);
            const lastSet = mine[mine.length - 1];
            /* 추천은 본 세트(가장 무거운 세트) 무게 — 실제도 가장 무거운 세트로 견준다 */
            const heaviest = mine.reduce<number | null>(
              (m, x) => (x.weightKg != null && (m == null || x.weightKg > m) ? x.weightKg : m),
              null
            );
            return {
              title: e.title,
              suggested: e.suggestedKg as number,
              actual: heaviest,
              rir: lastSet?.rir ?? null,
            };
          })
          .filter((l) => l.actual != null);
        return {
          headline:
            last && advanced
              ? '프로그램을 다 마쳤어요'
              : advanced
                ? `${dayLabel(pp, tag.day)} 완료 · 다음 ${dayLabel(pp, tag.day + 1)}`
                : `절반이 안 돼 ${dayLabel(pp, tag.day)}를 다시 해요`,
          note: !advanced
            ? null
            : last
              ? '트레이닝 화면에서 다음 프로그램을 골라요.'
              : isLightWeek(pp, nextWeek) && !isLightWeek(pp, tag.week)
                ? '다음 주는 가벼운 주예요. 무게가 낮은 게 맞아요.'
                : nextWeek !== tag.week
                  ? (pp.def.weekNotes?.[nextWeek] ?? null)
                  : null,
          lifts,
        };
      })()
    : null;

  return (
    <DoneClient
      program={program}
      themeLabel={plan?.themeLabel ?? '오늘의 운동'}
      dateLabel={new Intl.DateTimeFormat('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'UTC',
      }).format(session.date)}
      minutes={Math.round(session.activeSeconds / 60)}
      setCount={sets.length}
      volumeKg={totalVolumeKg(sets)}
      rows={rows}
    />
  );
}
