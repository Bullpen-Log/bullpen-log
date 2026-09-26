import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { filterByEquipment } from '@/lib/report/equipment';
import { filterByLevel } from '@/lib/report/personalize';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import {
  armcareBlock,
  bodyStateBlock,
  decideArmcare,
  readArmcareRoutine,
} from '@/lib/armcare/routine';

/**
 * 오늘의 암케어 화면과 '만들기'가 함께 읽는 자료.
 *
 * 운동 일정의 lib/report/today-data.ts 와 같은 까닭으로 한 곳에서 모은다 — 화면이
 * 보여 주는 권고(회복·강화)와 만들기가 짜는 루틴이 서로 다른 자료를 보면, "회복을
 * 권합니다" 아래 강화 루틴이 생긴다.
 */

/** 이 함수가 들여다보는 회원 항목 */
export type UserForArmcare = {
  id: string;
  nickname: string;
  birthDate: Date | null;
  heightCm: number | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
  trainingLevel: string | null;
  ownedEquipment: string[];
};

/** 오래 안 한 것부터 돌리려고 보는 기간(일) */
const HISTORY_DAYS = 45;

export async function loadArmcareToday(user: UserForArmcare, today: Date) {
  const todayKey = toDateKey(today);
  const midnight = new Date(`${todayKey}T00:00:00.000Z`);

  const [{ facts, plan }, library, saved, checkin, logs] = await Promise.all([
    gatherFactsAndPlan(user, today),
    visibleExercises(),
    prisma.dailyArmcare.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { plan: true },
    }),
    /* 팔 피로는 상세 체크인에만 있어 리포트 자료(facts)에 없다. 오늘 줄만 읽는다. */
    prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { armFatigue: true },
    }),
    prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        completed: true,
        date: {
          gte: new Date(`${shiftDateKey(todayKey, -HISTORY_DAYS)}T00:00:00.000Z`),
          lte: midnight,
        },
        exercise: { category: ARMCARE_CATEGORY },
      },
      select: { exerciseId: true, date: true },
      orderBy: { date: 'desc' },
    }),
  ]);

  /*
   * 캐시에 담긴 운동이 근육 칸을 더하기 전에 담긴 것이면 그 칸이 없을 수 있다
   * (lib/library-cache.ts). 없으면 빈 것으로 읽는다.
   */
  const armcare = library
    .filter((ex) => ex.category === ARMCARE_CATEGORY)
    .map((ex) => ({ ...ex, targetMuscles: ex.targetMuscles ?? [] }));
  /*
   * 가진 장비와 경력으로 거른다. 오늘만 좁혀 둔 장비(운동 일정의 '오늘 쓸 수 있는
   * 장비')는 보지 않는다 — 헬스장에 안 가는 날에도 밴드 암케어는 집에서 한다.
   */
  const usable = filterByEquipment(armcare, user.ownedEquipment);
  const leveled = filterByLevel(usable.pool, user.trainingLevel);

  /* 최근 순으로 왔으므로 운동마다 처음 만나는 줄이 마지막으로 한 날이다 */
  const lastDone = new Map<string, string>();
  for (const log of logs) {
    if (!lastDone.has(log.exerciseId))
      lastDone.set(log.exerciseId, toDateKey(log.date));
  }
  const doneToday = new Set(
    logs.filter((log) => toDateKey(log.date) === todayKey).map((log) => log.exerciseId)
  );
  /* 최근 7일(오늘 포함) — 날마다 암케어를 했는가. 루틴 칸 맨 아래 점 7개가 된다 */
  const doneDates = new Set(logs.map((log) => toDateKey(log.date)));
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDateKey(todayKey, i - 6);
    return { key, done: doneDates.has(key) };
  });

  return {
    todayKey,
    midnight,
    facts,
    plan,
    /** 오늘 체크인을 남겼는가. 없으면 만들지 않는다 — 운동 일정과 같은 규칙. */
    hasCheckinToday: facts.condition.today != null,
    decision: decideArmcare({ facts, plan, armFatigue: checkin?.armFatigue ?? null }),
    /** 오늘 만들어 둔 루틴. 없으면 아직 안 만든 날이다. */
    routine: readArmcareRoutine(saved?.plan),
    /** 루틴에 넣을 수 있는 것 — 장비·경력을 통과한 암케어 운동 */
    candidates: leveled.pool,
    /** 보이는 암케어 운동 전체 — 오늘 체크한 것을 찾을 때 (장비가 바뀌었어도) */
    library: armcare,
    /** 장비 하나만 더 있으면 가장 많이 늘어나는 것 */
    bestAddition: usable.bestAddition,
    lastDone,
    doneToday,
    week,
  };
}

export type ArmcareTodayData = Awaited<ReturnType<typeof loadArmcareToday>>;

/**
 * 지금 몸 상태로 보면 권하지 않는 운동인가 — 루틴 목록(app/(app)/training/armcare-section.tsx)
 * 과 따라하기(app/(session)/armcare/play)가 같은 규칙을 쓴다. 예전에는 목록에만 있어서,
 * 목록에는 '권하지 않는 운동'이 붙는데 따라하기는 말없이 그 운동을 시켰다(2026-09-26 검토).
 *
 * 체크인이 없으면 몸 상태를 모르니 표시하지 않는다. 통증인 날은 운동마다 달지 않고
 * 위에 한 번 알린다.
 *   맞춤 루틴  만들 때와 같은 규칙(armcareBlock) — 만든 뒤 몸 상태가 바뀐 것을 잡는다
 *   내 루틴    몸 상태 몫만(bodyStateBlock) — 팔 근력 운동도 보고, 맞춤 루틴의 강도
 *              한도('높음'을 안 넣는 것)는 몸 상태가 아니라 보지 않는다
 */
export function notAdvised(
  data: ArmcareTodayData,
  ex: CachedExercise,
  forMine: boolean
): boolean {
  if (!data.hasCheckinToday || data.decision.kind === 'rest') return false;
  const candidate = { ...ex, targetMuscles: ex.targetMuscles ?? [] };
  const today = data.facts.condition.today;
  return forMine
    ? bodyStateBlock(candidate, data.decision.kind, today) != null
    : armcareBlock(candidate, data.decision.kind, today) != null;
}
