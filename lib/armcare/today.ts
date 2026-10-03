import 'server-only';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { filterByEquipment } from '@/lib/report/equipment';
import { filterByLevel } from '@/lib/report/personalize';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { armPainSpotsFor, pickArmPain } from '@/lib/checkin';
import {
  armcareBlock,
  bodyStateBlock,
  decideArmcare,
  readArmcareRoutine,
} from '@/lib/armcare/routine';
import {
  buildRehabSession,
  rehabStatus,
  type RehabProgramLike,
  type RehabSession,
  type RehabStatus,
  type RehabWeeklyLike,
} from '@/lib/armcare/rehab';
import {
  loadActiveRehab,
  loadDoneOn,
  loadRehabRecords,
  toRehabLibrary,
} from '@/lib/armcare/rehab-store';

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

/**
 * 진행 중인 재활의 오늘 — 재활 중이면 맞춤 루틴을 짜지 않고 이것을 낸다(재활 2편). 내 루틴은 그대로다.
 *
 *   status   쉬는 날 · 낮춘 날 · 진료 권유 · 단계 올리기 조건 · 카드 한 줄(lib/armcare/rehab.ts 의 rehabStatus)
 *   session  오늘 할 운동(낮춘 날은 아래 단계, 가진 장비로 바꿔 넣음 — buildRehabSession)
 *   doneToday 오늘 체크한 재활 운동 — 재활 운동은 카테고리가 여럿이라 암케어 기록과 따로 읽는다
 *   weeklies  매주 확인 전부 — 팔굽혀 터치 첫 기록 · 지난 확인 한 줄 · 투구 복귀표 열기 시트가 본다
 */
export type RehabToday = {
  id: string;
  program: RehabProgramLike;
  activities: string[];
  status: RehabStatus;
  session: RehabSession;
  doneToday: Set<string>;
  weeklies: RehabWeeklyLike[];
};

async function loadRehabToday(
  user: UserForArmcare,
  todayKey: string,
  library: CachedExercise[]
): Promise<RehabToday | null> {
  const active = await loadActiveRehab(user.id);
  if (!active) return null;
  const { sessions, checkins, weeklies } = await loadRehabRecords(
    user.id,
    active.id,
    todayKey
  );
  const status = rehabStatus({
    program: active.program,
    sessions,
    checkins,
    weeklies,
    todayKey,
  });
  const session = buildRehabSession({
    ...active.program,
    /* 오늘 이미 남겼으면 그때의 운동 그대로 — 오늘 빨강이 나왔다고 한 운동 목록이 바뀌지 않게 */
    lowered: status.today ? status.today.lowered : status.lowered,
    library: toRehabLibrary(library),
    ownedEquipment: user.ownedEquipment,
  });
  const doneToday = await loadDoneOn(
    user.id,
    todayKey,
    session.items.map((it) => it.exerciseId)
  );
  return { ...active, status, session, doneToday, weeklies };
}

export async function loadArmcareToday(user: UserForArmcare, today: Date) {
  const todayKey = toDateKey(today);
  const midnight = new Date(`${todayKey}T00:00:00.000Z`);

  const [{ facts, plan }, library, saved, checkin, logs, rehab] = await Promise.all([
    gatherFactsAndPlan(user, today),
    visibleExercises(),
    prisma.dailyArmcare.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { plan: true },
    }),
    /*
     * 팔 피로는 상세 체크인에만 있어 리포트 자료(facts)에 없다. 팔 통증 자리 · 정도도 같다(통증 루틴 ·
     * 안내 시트만 읽는다). 오늘 줄만 읽는다.
     */
    prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { armFatigue: true, armPainSpots: true, armPainLevel: true },
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
    visibleExercises().then((all) => loadRehabToday(user, todayKey, all)),
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

  /*
   * 오늘 팔(어깨 · 팔꿈치) 통증 — 그 관절이 오늘 '통증'인 날만 있다. 자리는 오늘 '통증'인 관절의 것만 센다
   * (옛 화면으로 고쳐 저장해 남은 자리를 버린다 — lib/checkin.ts 의 armPainSpotsFor).
   */
  const todayParts = facts.condition.today;
  const savedPain = pickArmPain(checkin ?? {});
  const armPain =
    todayParts?.shoulder === '통증' || todayParts?.elbow === '통증'
      ? {
          spots: armPainSpotsFor(todayParts, savedPain.armPainSpots),
          level: savedPain.armPainLevel,
        }
      : null;

  return {
    todayKey,
    midnight,
    facts,
    plan,
    /** 오늘 체크인을 남겼는가. 없으면 만들지 않는다 — 운동 일정과 같은 규칙. */
    hasCheckinToday: facts.condition.today != null,
    decision: decideArmcare({
      facts,
      plan,
      armFatigue: checkin?.armFatigue ?? null,
      armPain,
    }),
    /**
     * 오늘 팔 통증 자리 · 정도 — 어깨 · 팔꿈치가 '통증'인 날만, 아니면 null. 통증 루틴(만들기)과 안내 시트가
     * 같은 값을 본다.
     */
    armPain,
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
    /** 진행 중인 재활의 오늘 — 있으면 맞춤 루틴 자리에 재활 카드가 선다. 없으면 null */
    rehab,
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
