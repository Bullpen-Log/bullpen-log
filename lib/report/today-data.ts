import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { selectCandidates } from '@/lib/report/prescription';
import { equipmentForToday, filterByEquipment } from '@/lib/report/equipment';
import { filterByLevel } from '@/lib/report/personalize';
import { readDailyPlan } from '@/lib/report/daily-plan';
import {
  estimateMinutes,
  slotForTheme,
  workoutConflict,
  type ThemeKey,
} from '@/lib/report/theme';

/**
 * 홈과 트레이닝이 함께 쓰는 오늘 자료.
 *
 * 두 화면으로 나누면서 생긴 파일이다. 홈은 "오늘 무엇을 남겼나"를, 트레이닝은
 * "오늘 무엇을 할까"를 보여주는데, 둘 다 같은 것을 근거로 삼는다 — 최근 투구량,
 * 오늘 체크인, 오늘 만들어 둔 일정, 안전 필터를 통과한 운동.
 *
 * 각자 조회하게 두면 언젠가 어긋난다. 홈의 체크리스트가 "운동 3/8"이라고 하는데
 * 트레이닝에는 7개만 있는 식이다. 한쪽만 고치고 다른 쪽을 잊으면 그렇게 된다.
 * 그래서 한 함수에서 한 번에 만든다.
 */

/** 부딪혔을 때 대신 주는 것을 사람 말로. 화면 문구에 그대로 들어간다. */
const FALLBACK_LABEL: Record<ThemeKey, string> = {
  recovery: '회복·가동성',
  assist: '코어·암케어',
  lower: '하체 스트렝스',
  upper: '상체 스트렝스',
};

/** 이 함수가 실제로 들여다보는 회원 항목만 적는다. */
export type UserForToday = {
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

export async function loadTodayCore(user: UserForToday, today: Date) {
  const todayKey = toDateKey(today);
  const midnight = new Date(`${todayKey}T00:00:00.000Z`);

  const { facts, plan, hasLogs } = await gatherFactsAndPlan(user, today);

  const [library, doneLogs, todaySetup] = await Promise.all([
    /*
     * 거르는 데 필요한 항목만 가져온다.
     *
     * 예전에는 415개를 통째로 불렀다. 설명 글과 영상 경로까지 딸려와 화면 한 번
     * 여는 데 짐이 컸는데, 정작 그리는 것은 오늘 일정에 담긴 열댓 개뿐이다.
     * 그릴 것은 트레이닝 화면에서 따로 부른다.
     *
     * 세트·횟수까지 가져오는 이유는 '운동 추가' 창 때문이다. 400개를 늘어놓고
     * 고르게 하면서 "몇 세트 몇 회짜리인지"를 안 보여주면 고를 수가 없다.
     * 숫자 다섯 개라 짐이 되지 않는다.
     */
    prisma.exerciseVideo.findMany({
      where: { hiddenAt: null }, // 숨긴 운동은 새 일정에 안 나온다
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        category: true,
        bodyParts: true,
        intensity: true,
        difficulty: true,
        equipment: true,
        sets: true,
        reps: true,
        holdSeconds: true,
        restSeconds: true,
        perSide: true,
      },
    }),
    prisma.userExerciseLog.findMany({
      where: { userId: user.id, date: midnight, completed: true },
      select: {
        exerciseId: true,
        setsDone: true,
        repsDone: true,
        holdSecondsDone: true,
        weightKg: true,
      },
    }),
    /*
     * 오늘 쓸 수 있는 장비와 오늘 만들어 둔 일정.
     * 장비는 날마다 다르므로 프로필의 '가진 것'과 따로 둔다. 이 줄이 없는 날은
     * 아직 안 고른 날이라, 가진 것을 다 쓸 수 있다고 본다.
     */
    prisma.dailyTrainingSetup.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { availableEquipment: true, plan: true, generatedAt: true },
    }),
  ]);

  /*
   * 만들어 둔 일정을 읽기만 한다. 화면을 열 때 새로 만들지 않는다.
   *
   * 예전에는 그렇게 해서, 만든 적도 없는 일정이 늘 떠 있었고 새로고침만 해도
   * 내용이 바뀌었다. 만드는 것은 generateTodayPlan 이 한다.
   */
  const savedPlan = readDailyPlan(todaySetup?.plan);

  const todayEquipment = equipmentForToday(
    user.ownedEquipment,
    todaySetup?.availableEquipment
  );
  /*
   * 오늘 일부러 좁혀 놓았는가. 안내 문구가 달라진다 —
   * 덤벨을 가진 사람에게 "덤벨이 있으면"이라고 말하면 틀린 말이다.
   */
  const narrowedToday = todayEquipment.length < user.ownedEquipment.length;

  /*
   * 가진 장비로 할 수 없는 운동을 안전 필터보다 먼저 뺀다.
   *
   * 뒤에 두면 "안전 규칙을 통과한 20개 중 18개가 장비가 없어 빠졌다" 같은
   * 상태가 되어, 안전 필터가 얼마나 걸렀는지가 실제보다 커 보인다.
   */
  const usable = filterByEquipment(
    library,
    todayEquipment,
    narrowedToday ? user.ownedEquipment : undefined
  );
  /*
   * 경력에 맞는 난이도만 남긴다. 장비와 같은 성격이라 같은 자리에 둔다 —
   * 위험해서가 아니라 아직 할 만한 것이 아니라서 빼는 것이다.
   */
  const leveled = filterByLevel(usable.pool, user.trainingLevel);
  const picked = selectCandidates({ facts, plan, library: leveled.pool });

  /*
   * 오늘 고른 운동 종류가 몸 상태와 부딪히는가.
   *
   * 부딪히면 기본은 가벼운 쪽으로 주되, 알고도 원하면 원한 대로 준다.
   * 화면은 이 값을 보고 경고와 '그래도 하겠다'를 그린다.
   *
   * 통증이 있어 이미 회복으로 정해진 날에는 아무것도 안 내놓는다. 그날은
   * 무엇을 눌러도 회복이라, 되돌릴 수 있는 것처럼 보이면 거짓말이 된다.
   */
  const preferredWorkout = facts.condition.today?.preferredWorkout ?? null;
  const conflict = plan.recovering
    ? null
    : workoutConflict({ facts, preferredWorkout });
  const workoutClash =
    conflict && preferredWorkout
      ? {
          kind: preferredWorkout,
          reason: conflict.reason,
          fallbackLabel: FALLBACK_LABEL[conflict.fallback],
        }
      : null;

  /*
   * 안전만은 볼 때마다 다시 본다.
   *
   * 아침에 일정을 만든 뒤 낮에 통증을 입력할 수 있다. 그때 저장해 둔 목록을
   * 그대로 보여주면, 던지지 말라고 해놓고 데드리프트를 시키는 꼴이 된다.
   * 지금 기준으로 통과하지 못하는 운동은 뺀다.
   *
   * 두 가지는 남긴다.
   *   이미 마친 것   — 감추면 잘못 누른 체크를 풀 수가 없다.
   *   직접 더한 것   — 우리가 고른 것이 아니라 본인이 넣은 것이다. 말없이
   *                   빼면 방금 넣은 운동이 사라지는 셈이라, 대신 표시만 한다.
   */
  const doneIds = new Set(doneLogs.map((d) => d.exerciseId));
  /** 운동별로 실제 얼마나 했는지 — 화면의 입력칸을 채운다 */
  const doneAmounts = new Map(doneLogs.map((d) => [d.exerciseId, d]));
  const safeIds = new Set(picked.candidates.map((ex) => ex.id));
  const planned = (savedPlan?.picks ?? [])
    .filter(
      (p) => safeIds.has(p.exerciseId) || doneIds.has(p.exerciseId) || p.manual
    )
    .map((p) => ({
      ...p,
      /** 지금 몸 상태 기준으로는 권하지 않는 운동인가 */
      unsafe: !safeIds.has(p.exerciseId),
    }));

  /*
   * 오늘 마쳤는데 지금 일정에는 없는 운동.
   *
   * 일정을 '다시 만들기'하면 새로 고른 목록이 저장된다. 그때 아까 체크한 운동이
   * 새 목록에서 빠지면 화면에서 통째로 사라졌다 — 체크를 풀 수도, 그 운동을 볼
   * 수도 없는데 기록은 남아 운동 부하에 그대로 들어갔다. 실제로 '1/8 완료'가
   * '0/8 완료'로 돌아가는 것을 봤다.
   *
   * 위 filter 는 저장된 목록 '안에서만' 걸러서 이 경우를 못 잡는다. 빠진 것을
   * 여기서 도로 넣는다. 슬롯은 그 운동이 어느 자리에 어울리는지로 다시 정한다.
   */
  const inPlan = new Set(planned.map((p) => p.exerciseId));
  const strays = [...doneIds]
    .filter((id) => !inPlan.has(id))
    .map((exerciseId) => {
      const ex = library.find((e) => e.id === exerciseId);
      return {
        exerciseId,
        slot: ex && savedPlan ? slotForTheme(ex, savedPlan.theme.key) : 'main',
        manual: true,
        unsafe: !safeIds.has(exerciseId),
      };
    })
    .filter((p) => library.some((e) => e.id === p.exerciseId));

  const shownPicks = [...planned, ...strays];

  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const shownMinutes = Math.round(
    shownPicks.reduce((sum, p) => {
      const ex = byId.get(p.exerciseId);
      return ex ? sum + estimateMinutes(ex) : sum;
    }, 0)
  );

  return {
    todayKey,
    midnight,
    facts,
    plan,
    hasLogs,
    library,
    todaySetup,
    savedPlan,
    picked,
    doneIds,
    doneAmounts,
    /** 오늘 실제로 보여줄 운동 (안전 재확인을 통과했거나 이미 마친 것) */
    shownPicks,
    /** 일정을 만든 뒤 몸 상태가 바뀌어 빠진 개수 */
    droppedForSafety: (savedPlan?.picks.length ?? 0) - shownPicks.length,
    /** 목록에 남아 있지만 지금은 권하지 않는 운동 수 (직접 더한 것) */
    unsafeShown: shownPicks.filter((p) => p.unsafe).length,
    /*
     * 지금 목록의 실제 소요 시간(분).
     *
     * 만들 때 찍어 둔 값을 쓰면, 운동을 빼도 숫자가 안 바뀐다.
     * 홈과 트레이닝이 같은 숫자를 말해야 하므로 여기서 한 번만 센다.
     */
    shownMinutes,
    /** 오늘 체크인을 남겼는가. 안 남기면 안전 규칙 두 가지가 빠진다. */
    hasCheckinToday: facts.condition.today != null,
    /** 오늘 고른 운동 종류 — 파워 / 웨이트 / 회복. 안 골랐으면 null */
    preferredWorkout,
    /** 고른 종류가 몸 상태와 부딪히는가. 안 부딪히면 null */
    workoutClash,
    /*
     * 장비와 경력 때문에 몇 개가 빠졌는지는 여기서 돌려주지 않는다.
     * 화면에 쓰는 값은 일정을 만들 때 찍어 둔 것(savedPlan.equipment)이라야
     * 맞다. 지금 다시 세면, 아침에 만든 일정 옆에 저녁에 바뀐 숫자가 붙는다.
     */
  };
}

