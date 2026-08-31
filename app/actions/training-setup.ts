'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { pickMany } from '@/lib/exercise-meta';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import {
  readOwnedEquipment,
  readTrainingGoal,
  readTrainingProfile,
} from '@/lib/report/personalize';
import { buildDailyPlan, isHalted } from '@/lib/report/daily-plan';
import {
  gatherFactsAndPlan,
  lastStrengthDates,
  exerciseSessionsAgo,
  recentExerciseIds,
} from '@/lib/report/gather';
import {
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_MINUTES_CHOICES,
} from '@/lib/report/theme';

/**
 * 트레이닝 화면의 설정과 일정 만들기.
 *
 * 예전에는 경력·목표·장비를 프로필에서 골랐는데, 정작 그 결과를 보는 곳은
 * 트레이닝 화면이라 "왜 이 운동이지?" 싶을 때마다 다른 화면으로 건너가야 했다.
 * 그래서 고르는 곳을 결과 옆으로 옮겼다.
 *
 * 세 가지를 나눠 둔다.
 *   오래 가는 것 — 경력·가지고 있는 장비 (User)
 *   그날만인 것 — 오늘 쓸 수 있는 장비        (DailyTrainingSetup)
 *   눌러야 생기는 것 — 오늘의 운동 일정        (DailyTrainingSetup.plan)
 */

/** 날짜 하나를 DB에 넣을 형태로. 시간대는 서비스 기준(한국)으로 센다. */
function dateOnly(today: Date) {
  return new Date(`${toDateKey(today)}T00:00:00.000Z`);
}

/*
 * 일정은 홈과 트레이닝 두 곳에서 만들 수 있다. 만들고 나면 누른 화면으로
 * 돌아와야 한다 — 트레이닝에서 눌렀는데 홈으로 튕기면 방금 만든 목록을 보러
 * 다시 들어가야 한다.
 *
 * 폼이 보내온 값을 그대로 redirect 에 넘기지는 않는다. 주소를 마음대로 넣을 수
 * 있으면 남의 사이트로 보내는 링크를 만들 수 있다. 아는 곳만 허용한다.
 */
const RETURN_TO = ['/today', '/training'] as const;

function returnPath(formData: FormData): (typeof RETURN_TO)[number] {
  const asked = String(formData.get('returnTo') ?? '');
  return (RETURN_TO as readonly string[]).includes(asked)
    ? (asked as (typeof RETURN_TO)[number])
    : '/today';
}

/**
 * 경력과 목표를 저장한다.
 *
 * 값이 목록에 없으면 readTrainingProfile 이 버린다. 여기서 걸러진 값은
 * 그대로 DB에 남아 운동을 고르는 데 쓰이므로, 걸러내는 일이 중요하다.
 *
 * 장비는 건드리지 않는다 — 그쪽은 saveOwnedEquipment 가 맡는다. 한 폼에 묶여
 * 있던 때는 경력만 고치러 열었다가 저장해도 장비까지 저장돼서, 있지도 않은
 * 장비를 가지고 있다고 남겼다.
 *
 * 이미 만들어 둔 오늘 일정은 건드리지 않는다. 설정을 고쳤다고 눈앞의 일정이
 * 말없이 바뀌면, 하던 운동이 어디 갔는지 알 수 없다. 새 설정으로 받고 싶으면
 * '다시 만들기'를 누르면 된다.
 */
export async function saveTrainingSettings(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await prisma.user.update({
    where: { id: user.id },
    data: readTrainingProfile(formData),
  });

  const back = returnPath(formData);
  revalidatePath('/today');
  revalidatePath('/training');
  redirect(back);
}

/** 가지고 있는 장비만 저장한다. 경력은 건드리지 않는다. */
export async function saveOwnedEquipment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await prisma.user.update({
    where: { id: user.id },
    data: readOwnedEquipment(formData),
  });

  const back = returnPath(formData);
  revalidatePath('/today');
  revalidatePath('/training');
  redirect(back);
}

/**
 * 오늘의 운동 일정을 만든다.
 *
 * 폼에서 오늘 쓸 수 있는 장비와 운동 시간을 함께 받는다. 둘 다 일정을 만드는
 * 재료라 따로 저장했다가 따로 만들 이유가 없다.
 *
 * 통증 등으로 처방을 멈춰야 하는 날에는 아무것도 저장하지 않는다. 그런 날
 * 빈 일정을 남겨두면, 나중에 몸이 괜찮아졌을 때 '이미 만든 날'로 보여서
 * 다시 만들 수가 없다.
 */
/**
 * 저장해 둔 일정에서 운동 id 만 꺼낸다.
 *
 * plan 은 Json 이라 모양을 믿을 수 없다. 기대한 모양이 아니면 빈 목록으로 둔다 —
 * 씨앗이 날짜만 남을 뿐 아무것도 깨지지 않는다.
 */
function readPlanExerciseIds(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') return [];
  const picks = (plan as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];
  return picks
    .map((p) => (p as { exerciseId?: unknown })?.exerciseId)
    .filter((id): id is string => typeof id === 'string');
}

export async function generateTodayPlan(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  /*
   * 오늘 쓸 수 있는 장비. 가지고 있는 것 중에서만 고를 수 있다 — 설정에서
   * 장비를 뺐는데 폼에는 남아 있는 경우가 생긴다.
   */
  const owned = new Set(user.ownedEquipment);
  const chosen = pickMany(
    formData.getAll('availableEquipment').map(String),
    SELECTABLE_EQUIPMENT
  ).filter((name) => owned.has(name));
  /*
   * 하나도 안 고르면 빈 목록으로 둔다. 그러면 '아직 안 고른 날'과 같은 뜻이
   * 되어 가진 것을 다 쓴다. 실수로 다 껐을 때 맨몸 운동만 나오는 것보다 낫다.
   */
  const availableEquipment = chosen.length > 0 ? [ALWAYS_OWNED, ...chosen] : [];

  /*
   * 오늘의 훈련 목표. 목록에 없는 이름이 오면 버리고 지난번 값으로 돌아간다 —
   * 폼은 누구나 고쳐 보낼 수 있고, 목록 밖 이름이 오면 어떤 배분 규칙에도
   * 걸리지 않는 상태가 된다.
   */
  const trainingGoal = readTrainingGoal(formData, user.trainingGoal);

  const rawMinutes = Number.parseInt(String(formData.get('minutes') ?? ''), 10);
  const requestedMinutes = (WORKOUT_MINUTES_CHOICES as readonly number[]).includes(
    rawMinutes
  )
    ? rawMinutes
    : (user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES);

  const today = new Date();
  const { facts, plan } = await gatherFactsAndPlan(user, today);
  const [library, recentIds, sessionsAgo, strengthDates] = await Promise.all([
    prisma.exerciseVideo.findMany({
      // 숨긴 운동은 새 일정에 안 나온다
      where: { hiddenAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    recentExerciseIds(user.id, today),
    /*
     * 운동별로 몇 세션 전에 했는가. 오래 안 한 것부터 내보내려고 함께 읽는다.
     * 이것이 없으면 등록순 앞자리 몇 개만 영원히 돈다.
     */
    exerciseSessionsAgo(user.id, today),
    lastStrengthDates(user.id, today),
  ]);

  /*
   * '다시 만들기'를 누르면 다른 목록이 나오게 한다.
   *
   * 순서를 섞는 씨앗이 날짜뿐이면 같은 날에는 늘 같은 결과가 나온다. 실제로
   * 눌러보니 여덟 개 중 일곱이 그대로였다 — 버튼을 누른 사람 기대와 다르다.
   *
   * 그래서 지금 저장돼 있는 일정을 씨앗에 섞는다. 같은 날이라도 지금 목록과는
   * 다른 것이 나오고, 만들고 나면 그것이 저장되므로 다음에 또 눌러도 계속
   * 달라진다. 아직 아무것도 없으면 날짜만으로 간다.
   */
  const before = await prisma.dailyTrainingSetup.findUnique({
    where: { userId_date: { userId: user.id, date: dateOnly(today) } },
    select: { plan: true },
  });
  const previousIds = readPlanExerciseIds(before?.plan);
  const rotationSeed = [toDateKey(today), ...previousIds].join('|');

  const built = buildDailyPlan({
    user,
    facts,
    plan,
    library,
    availableToday: availableEquipment.length > 0 ? availableEquipment : null,
    requestedMinutes,
    trainingGoal,
    recentIds,
    sessionsAgo,
    rotationSeed,
    lastLowerKey: strengthDates.lower,
    lastUpperKey: strengthDates.upper,
    /*
     * "몸 상태 경고를 봤고 그래도 하겠다."
     *
     * 오늘 하루만의 결정이라 저장하지 않는다. 내일 또 같은 상황이면 경고를
     * 다시 보여주고 다시 고르게 하는 편이 맞다.
     */
    override: formData.get('overrideCondition') === 'on',
  });

  const date = dateOnly(today);

  if (isHalted(built)) {
    // 만들 수 없는 날. 고른 장비만 남기고 일정은 비워 둔다.
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { availableEquipment, plan: Prisma.DbNull, generatedAt: null },
      create: { userId: user.id, date, availableEquipment },
    });
  } else {
    const saved = {
      availableEquipment,
      plan: built as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
    };
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: saved,
      create: { userId: user.id, date, ...saved },
    });
  }

  /*
   * 이 조건을 앞으로도 쓰겠다고 했으면 기본값으로 굳힌다.
   *
   * 굳히지 않아도 목표는 다음에 열 때 미리 짚어져 있다 — 아래에서 늘 저장하기
   * 때문이다. 여기 체크는 '시간'을 굳히는 뜻이다.
   */
  if (formData.get('saveDefaults') === 'on') {
    await prisma.user.update({
      where: { id: user.id },
      data: { dailyWorkoutMinutes: requestedMinutes },
    });
  }

  /*
   * 목표는 체크와 상관없이 늘 남긴다. 다음에 폼을 열었을 때 지난번에 고른
   * 것이 짚여 있어야 매번 처음부터 고르지 않는다. 저장해 둔 값은 기본값일
   * 뿐이고, 그날 고른 것이 일정 안에 함께 저장된다.
   */
  if (trainingGoal !== user.trainingGoal) {
    await prisma.user.update({
      where: { id: user.id },
      data: { trainingGoal },
    });
  }

  const back = returnPath(formData);
  revalidatePath('/today');
  revalidatePath('/training');
  redirect(back);
}
