import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { readFrozenPlan, type FrozenExercise } from '@/lib/workout/session-plan';
import {
  cautiousPrescription,
  suggestFreeWeight,
  type FreeLast,
} from '@/lib/workout/free-weight';

/** 지난 기록을 이만큼 앞까지 본다 — 그보다 오래된 무게는 기준이 못 된다(exercise-recent.ts 와 같은 값) */
const WINDOW_DAYS = 180;

/** 운동마다 읽는 날 수 — 지난번과 그 앞 날(두 번 이어 채웠나, free-weight.ts ③ — 2판 P5-g) */
export const FREE_WEIGHT_DAYS = 2;

/**
 * 프로그램이 아닌 운동의 무게 추천을 판에 얹는다(lib/workout/free-weight.ts) — 운동 시작 · 운동 중 바꾸기 · 더하기가
 * 같이 쓴다. 프로그램 칸의 운동과 무게 없는 운동은 건드리지 않는다. 이미 추천이 있는 운동(프로그램 칸)도 그대로.
 *
 * opts.hold — 양을 줄인 판인가(lib/report/volume.ts holdsWeight(판), 2판 P5-d). 그러면 다 채운 운동도 올리지 않는다(free-weight.ts ⑦).
 * 부르는 쪽이 그 판(세션 판)의 칸으로 정한다 — 오늘 일정이 아니라 판을 보는 까닭은 세트도 판의 조절로 찍기 때문이다(sessionRxBasis).
 *
 * opts.cautious — 조심해서 들 사람인가(free-weight.ts liftCautious — 성장기 · 입문, 2판 P5-g). 그러면 올려도 한 단위만이고, 이 운동들의
 * 처방 줄에 '· 3개 남기고'를 붙인다(추천이 없는 첫 운동도 — 운동 화면이 처방 줄을 그대로 보인다). 부르는 쪽이 facts.profile 로 정한다.
 *
 * opts.holdProgress — 영양 추세 깃발이 선 주의 '올림 멈춤' 글(lib/nutrition/fuel-load.ts loadHoldProgress, 2판 P6-7). 그러면 두 번 이어 채워
 * 올릴 때가 와도 그대로 두고 그 글을 붙인다(free-weight.ts ⑨). 없으면 보통.
 */
export async function withFreeWeights(
  userId: string,
  exercises: readonly FrozenExercise[],
  sessionDate: Date,
  opts: { hold?: boolean; cautious?: boolean; holdProgress?: string } = {}
): Promise<FrozenExercise[]> {
  const todayKey = toDateKey(sessionDate);
  const wanted = exercises.filter(
    (e) => !e.programSlot && e.suggestedKg == null && !e.isHold && e.needsWeight
  );
  if (wanted.length === 0) return [...exercises];

  const recent = await recentDays(
    userId,
    wanted.map((e) => e.id),
    todayKey
  );
  return exercises.map((e) => {
    if (!wanted.includes(e)) return e;
    const days = recent.get(e.id) ?? [];
    const s = suggestFreeWeight({
      equipment: e.equipment,
      bigLower: e.category === '하체 스트렝스',
      plannedSets: e.plannedSets,
      plannedReps: e.plannedReps,
      last: days[0] ?? null,
      prev: days[1] ?? null,
      todayKey,
      hold: opts.hold === true,
      cautious: opts.cautious === true,
      holdProgress: opts.holdProgress,
    });
    const shown = opts.cautious
      ? { ...e, prescription: cautiousPrescription(e.prescription) }
      : e;
    return s ? { ...shown, suggestedKg: s.kg, suggestNote: s.note } : shown;
  });
}

/**
 * 운동마다 세트를 남긴 최근 날 FREE_WEIGHT_DAYS 개(새것부터, 오늘 앞) — 그날 세트와 그날 처방 횟수(그날 세션 판).
 *
 * 운동 · 날 짝을 먼저 고르고 그 날의 세트만 읽는다. 예전에는 180일 세트를 최근 것부터 600줄만 읽어, 자주 하는 운동의 세트가
 * 드문 운동의 지난번을 밀어낼 수 있었다(두 날을 읽으면 더 잘 밀린다). 세트 · 세션 판은 같이 읽는다 — 조회는 둘을 이어 두 번.
 */
async function recentDays(
  userId: string,
  exerciseIds: string[],
  todayKey: string
): Promise<Map<string, FreeLast[]>> {
  const midnight = new Date(`${todayKey}T00:00:00.000Z`);
  const from = new Date(midnight);
  from.setUTCDate(from.getUTCDate() - WINDOW_DAYS);
  const pairs = await prisma.userExerciseSet.groupBy({
    by: ['exerciseId', 'date', 'sessionId'],
    where: {
      userId,
      exerciseId: { in: exerciseIds },
      date: { gte: from, lt: midnight },
    },
  });

  /* 운동마다 최근 날부터 둘 — 세션은 사람 · 날마다 하나라 날과 세션이 짝이다(같은 날이 두 번 오면 앞의 것만) */
  const chosen = new Map<string, { date: Date; sessionId: string }[]>();
  for (const p of [...pairs].sort((a, b) => b.date.getTime() - a.date.getTime())) {
    const list = chosen.get(p.exerciseId) ?? [];
    if (
      list.length >= FREE_WEIGHT_DAYS ||
      list.some((x) => x.date.getTime() === p.date.getTime())
    ) {
      continue;
    }
    list.push({ date: p.date, sessionId: p.sessionId });
    chosen.set(p.exerciseId, list);
  }
  if (chosen.size === 0) return new Map();

  const picked = [...chosen.entries()].flatMap(([exerciseId, list]) =>
    list.map((x) => ({ exerciseId, sessionId: x.sessionId }))
  );
  const [rows, sessions] = await Promise.all([
    prisma.userExerciseSet.findMany({
      where: { userId, OR: picked },
      orderBy: [{ date: 'desc' }, { setNo: 'asc' }],
      select: {
        exerciseId: true,
        sessionId: true,
        date: true,
        weightKg: true,
        reps: true,
      },
    }),
    prisma.trainingSession.findMany({
      where: { userId, id: { in: [...new Set(picked.map((p) => p.sessionId))] } },
      select: { id: true, plan: true },
    }),
  ]);
  const plans = new Map(sessions.map((s) => [s.id, readFrozenPlan(s.plan)]));

  const out = new Map<string, FreeLast[]>();
  for (const [exerciseId, list] of chosen) {
    out.set(
      exerciseId,
      list.map(({ date, sessionId }) => {
        const planned = plans
          .get(sessionId)
          ?.exercises.find((x) => x.id === exerciseId)?.plannedReps;
        return {
          date: toDateKey(date),
          sets: rows
            .filter((r) => r.exerciseId === exerciseId && r.sessionId === sessionId)
            .map((r) => ({ weightKg: r.weightKg, reps: r.reps })),
          /* 판에 없거나 숫자가 아니면 없음 — free-weight.ts 가 오늘 처방으로 잰다 */
          plannedReps: typeof planned === 'number' ? planned : null,
        };
      })
    );
  }
  return out;
}
