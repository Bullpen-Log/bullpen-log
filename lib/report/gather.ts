import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { ageFromBirthDate } from '@/lib/profile';
import { estimateDailyLoad } from '@/lib/baseline';
import { buildFacts, type CheckinLike, type MemoNote } from '@/lib/report/facts';
import { buildPitchPlan } from '@/lib/report/plan';
import { pickCheckinParts } from '@/lib/checkin';
import { RECENT_DAYS } from '@/lib/report/today-pick';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { readDailyPlan } from '@/lib/report/daily-plan';
import type { RecentTrainingDay } from '@/lib/ai/auto-setup-prompt';

/** 부하 계산에 필요한 기간. 4주 만성 부하에 여유를 둔다. */
export const LOOKBACK_DAYS = 45;

/**
 * 최근 45일치 투구 기록과 체크인. 한 요청 안에서는 한 번만 읽는다.
 *
 * 홈 화면이 이 자료를 두 번 필요로 한다 — 오늘 던진 것까지 넣고 낸 계획과,
 * 빼고 낸 계획. 두 계획은 메모리에서 거르기만 다를 뿐 재료가 같은데,
 * 예전에는 똑같은 조회가 정말 두 번 나갔다 (pg_stat_statements 로 확인).
 *
 * 날짜를 Date 가 아니라 문자열로 받는 것은 cache() 때문이다. cache 는 인자가
 * 같은지를 값이 아니라 '같은 자리인지'로 따지는데, new Date() 는 부를 때마다
 * 새 자리라 매번 다른 것으로 본다. 문자열은 값이 같으면 같은 것으로 본다.
 *
 * 화면을 조각내 따로 그리기 시작하면 이 자리가 더 중요해진다 — 조각마다
 * 제 자료를 부르는데, 그때마다 DB 를 가면 쪼갠 만큼 느려진다.
 */
const recentRecords = cache(async (userId: string, sinceIso: string) => {
  const since = new Date(sinceIso);
  return Promise.all([
    prisma.pitchLog.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: 'desc' },
    }),
  ]);
});

type UserForFacts = {
  id: string;
  nickname: string;
  birthDate: Date | null;
  heightCm: number | null;
  baselineFreq: string | null;
  baselineVolume: string | null;
  baselineIntensity: string | null;
  trainingLevel: string | null;
};

/**
 * 리포트·운동 처방이 공통으로 쓰는 자료를 한 번에 모은다.
 *
 * 리포트와 오늘의 운동이 서로 다른 근거로 말하면 안 되므로
 * 같은 함수에서 같은 수치와 같은 계획을 만든다.
 */
export async function gatherFactsAndPlan(
  user: UserForFacts,
  today: Date,
  options?: {
    /**
     * 오늘 남긴 기록을 빼고 계산한다.
     *
     * "오늘 계획대로 던졌나"를 견주려면 오늘 던진 것을 넣기 전의 계획이
     * 필요하다. 넣고 나면 계획이 '휴식'으로 바뀌는데(이미 던졌으니 더 쉬라는
     * 뜻이다), 그걸 아침 계획인 양 견주면 "오늘은 쉬는 게 계획이었습니다"라는
     * 엉뚱한 말이 나온다.
     */
    excludeToday?: boolean;
  }
) {
  const since = new Date(today);
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const [logs, checkins] = await recentRecords(user.id, since.toISOString());

  const todayKey = toDateKey(today);
  const usedLogs = options?.excludeToday
    ? logs.filter((l) => toDateKey(l.date) !== todayKey)
    : logs;

  const facts = buildFacts({
    nickname: user.nickname,
    age: user.birthDate ? ageFromBirthDate(user.birthDate, today) : null,
    heightCm: user.heightCm,
    trainingLevel: user.trainingLevel,
    baselineDailyLoad: estimateDailyLoad(user),
    logs: usedLogs.map((l) => ({
      date: l.date.toISOString(),
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      maxVelocity: l.maxVelocity,
      avgVelocity: l.avgVelocity,
    })),
    checkins: checkins.map<CheckinLike>((c) => ({
      date: c.date.toISOString().slice(0, 10),
      ...pickCheckinParts(c),
      condition: c.condition,
      sleep: c.sleep,
      preferredParts: c.preferredParts,
      preferredWorkout: c.preferredWorkout,
    })),
    memos: usedLogs
      .filter((l) => l.memo?.trim())
      .slice(-5)
      .map<MemoNote>((l) => ({
        date: l.date.toISOString().slice(0, 10),
        text: l.memo!.trim(),
      })),
    today,
  });

  return { facts, plan: buildPitchPlan(facts), hasLogs: logs.length > 0 };
}

/**
 * 최근 며칠 안에 마친 운동의 id.
 *
 * 오늘 것은 넣지 않는다. 오늘 한 운동은 목록에 그대로 남아 있어야
 * 완료 표시를 켜고 끌 수 있는데, 여기 섞이면 뒤로 밀려버린다.
 *
 * 오늘의 운동 화면과 리포트가 같은 목록을 내야 하므로 두 곳이 이 함수를
 * 함께 쓴다. 각자 조회하면 기간이 어긋나도 아무도 눈치채지 못한다.
 */
export async function recentExerciseIds(
  userId: string,
  today: Date
): Promise<Set<string>> {
  const todayKey = toDateKey(today);
  const logs = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      completed: true,
      date: {
        gte: new Date(`${shiftDateKey(todayKey, -RECENT_DAYS)}T00:00:00.000Z`),
        lt: new Date(`${todayKey}T00:00:00.000Z`),
      },
    },
    select: { exerciseId: true },
  });
  return new Set(logs.map((l) => l.exerciseId));
}

/**
 * 운동별로 "몇 세션 전에 했는가".
 *
 * recentExerciseIds 가 "최근 사흘에 했나(예/아니오)"만 알려주는 것과 다르다.
 * 그 둘만으로 순서를 정했더니 라이브러리 415개 중 두 달에 29개(7%)만 화면에
 * 나왔다. 사흘이 지나면 다시 맨 앞으로 돌아오기 때문이다.
 *
 * 날짜가 아니라 세션 수로 세는 이유가 있다. 날짜로 세면 매일 하는 사람과 주
 * 2회 하는 사람에게 전혀 다른 뜻이 된다 — '14일'이 한쪽에는 14세션이고
 * 다른 쪽에는 4세션이다. 실제로 재보니 같은 설정으로 한쪽은 넉 달에 167개,
 * 다른 쪽은 81개를 썼다. 세션으로 세면 재등장 리듬이 8.9회와 8.8회로 같아진다.
 *
 * 세션은 '운동을 하나라도 완료한 날'이다. 오늘도 이미 뭔가 했다면 0세션 전이
 * 된다. 한 번도 안 한 운동은 여기 없고, theme.ts 가 따로 값을 매긴다.
 *
 * 기간을 반년으로 둔다. 그보다 예전 것은 사실상 '안 한 것'과 같고, 오래된
 * 기록까지 다 읽으면 몇 년 쓴 사람에게 느려진다.
 */
const HISTORY_DAYS = 180;

export async function exerciseSessionsAgo(
  userId: string,
  today: Date
): Promise<Map<string, number>> {
  const todayKey = toDateKey(today);
  const logs = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      completed: true,
      date: {
        gte: new Date(`${shiftDateKey(todayKey, -HISTORY_DAYS)}T00:00:00.000Z`),
        lte: new Date(`${todayKey}T00:00:00.000Z`),
      },
    },
    select: { exerciseId: true, date: true },
    orderBy: { date: 'desc' },
  });

  /*
   * 운동한 날을 최근 순으로 늘어놓고 번호를 매긴다.
   * 오늘이 0, 그 전 세션이 1 — 그것이 '몇 세션 전'이다.
   */
  const order = new Map<string, number>();
  for (const l of logs) {
    const key = toDateKey(l.date);
    if (!order.has(key)) order.set(key, order.size);
  }

  // 최근 순으로 왔으므로, 운동마다 처음 만나는 줄이 가장 최근 것이다.
  const ago = new Map<string, number>();
  for (const l of logs) {
    if (ago.has(l.exerciseId)) continue;
    ago.set(l.exerciseId, order.get(toDateKey(l.date))!);
  }
  return ago;
}

/** AI 맞춤이 읽는 최근 운동 기간(일) */
const RECENT_TRAINING_DAYS = 7;

/**
 * 최근 며칠 운동한 날 — 그날의 테마·목표와 체감 강도·느낀점.
 *
 * AI 맞춤이 읽는다(lib/ai/auto-setup-prompt.ts). 부하 지수는 '얼마나'만 말하고,
 * "어제 하체를 했고 9/10으로 힘들었고 무릎이 불편했다"는 여기서만 보인다.
 *
 * 운동을 마치며 강도를 남긴 날만 센다 — 일정만 만들고 안 한 날은 뺀다. 오늘은
 * 넣지 않는다. 오늘 일정을 만드는 중이다.
 */
export async function recentTrainingDays(
  userId: string,
  today: Date
): Promise<RecentTrainingDay[]> {
  const todayKey = toDateKey(today);
  const range = {
    gte: new Date(`${shiftDateKey(todayKey, -RECENT_TRAINING_DAYS)}T00:00:00.000Z`),
    lt: new Date(`${todayKey}T00:00:00.000Z`),
  };
  const [notes, setups] = await Promise.all([
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: range },
      select: { date: true, intensity: true, memo: true },
      orderBy: { date: 'desc' },
    }),
    prisma.dailyTrainingSetup.findMany({
      where: { userId, date: range },
      select: { date: true, plan: true },
    }),
  ]);
  const planOf = new Map(setups.map((s) => [toDateKey(s.date), readDailyPlan(s.plan)]));
  return notes.map((n) => {
    const key = toDateKey(n.date);
    const saved = planOf.get(key);
    return {
      date: key,
      label: saved?.theme.label ?? null,
      goal: saved?.goal ?? null,
      intensity: n.intensity,
      memo: n.memo,
    };
  });
}

/** 하체·상체를 번갈아 돌리기 위해 살펴보는 기간(일) */
const ROTATION_LOOKBACK_DAYS = 14;

/**
 * 최근 2주 안에 하체/상체 스트렝스를 완료한 마지막 날짜.
 *
 * 오늘의 테마(하체 데이·상체 데이)를 번갈아 정하는 데 쓴다.
 * 오늘 것은 넣지 않는다 — 오늘 완료한 운동이 오늘의 테마를 도중에
 * 뒤집으면, 체크할 때마다 목록이 바뀌는 이상한 화면이 된다.
 */
export async function lastStrengthDates(
  userId: string,
  today: Date
): Promise<{ lower: string | null; upper: string | null }> {
  const todayKey = toDateKey(today);
  const logs = await prisma.userExerciseLog.findMany({
    where: {
      userId,
      completed: true,
      date: {
        gte: new Date(
          `${shiftDateKey(todayKey, -ROTATION_LOOKBACK_DAYS)}T00:00:00.000Z`
        ),
        lt: new Date(`${todayKey}T00:00:00.000Z`),
      },
    },
    select: { date: true, exercise: { select: { category: true } } },
  });

  let lower: string | null = null;
  let upper: string | null = null;
  for (const log of logs) {
    const key = log.date.toISOString().slice(0, 10);
    if (log.exercise.category === '하체 스트렝스' && (!lower || key > lower)) {
      lower = key;
    }
    if (log.exercise.category === '상체 스트렝스' && (!upper || key > upper)) {
      upper = key;
    }
  }
  return { lower, upper };
}
