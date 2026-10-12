import 'server-only';
import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { strengthDatesFrom, type StrengthDates } from '@/lib/report/daily-plan';
import { SWAP_LOOKBACK_DAYS, swappedOutCounts } from '@/lib/report/plan-swaps';
import { ageFromBirthDate } from '@/lib/profile';
import { estimateDailyLoad } from '@/lib/baseline';
import { buildFacts, type CheckinLike, type MemoNote } from '@/lib/report/facts';
import { buildPitchPlan } from '@/lib/report/plan';
import { pickArmPain, pickCheckinParts } from '@/lib/checkin';
import { buildDayState } from '@/lib/engine/day-state';
import { RECENT_DAYS } from '@/lib/report/today-pick';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { loadRehabFacts, loadRehabPeriods } from '@/lib/armcare/rehab-store';
import { isRehabCheck } from '@/lib/armcare/rehab';

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
    /*
     * 운동 끝 힘듦(2판 P2) — facts.condition.trainingEffort 의 재료. 하루 한 줄 · 45일이라 가볍다. 부하 계산
     * (lib/report/training-acwr.ts)도 같은 표를 읽지만 cache 범위가 달라 합치지 않는다.
     */
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, intensity: true },
      orderBy: { date: 'asc' },
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

  /*
   * 진행 중인 재활(재활 2편) — 투구 계획이 멈추고 웨이트가 그 관절의 무거운 운동을 뺀다(facts.condition.rehab).
   * 스위치(REHAB_ENABLED)를 끄면 읽지 않아 null 이다.
   */
  const [[logs, checkins, notes], rehab] = await Promise.all([
    recentRecords(user.id, since.toISOString()),
    loadRehabFacts(user.id, today),
  ]);

  const todayKey = toDateKey(today);
  const usedLogs = options?.excludeToday
    ? logs.filter((l) => toDateKey(l.date) !== todayKey)
    : logs;
  /* 오늘 힘듦도 오늘 로그와 같은 규칙으로 뺀다 — 아침 계획을 견줄 때 마친 뒤 남긴 힘듦이 섞이지 않게 */
  const usedNotes = options?.excludeToday
    ? notes.filter((n) => n.date.toISOString().slice(0, 10) !== todayKey)
    : notes;

  const facts = buildFacts({
    nickname: user.nickname,
    age: user.birthDate ? ageFromBirthDate(user.birthDate, today) : null,
    heightCm: user.heightCm,
    trainingLevel: user.trainingLevel,
    baselineDailyLoad: estimateDailyLoad(user),
    rehab,
    logs: usedLogs.map((l) => ({
      date: l.date.toISOString(),
      sessionType: l.sessionType,
      pitchCount: l.pitchCount,
      intensity: l.intensity,
      /* 체감 강도(%) — 2판 D2. 옛 줄은 null 이라 facts 는 intensity × 10 으로 읽는다(pitch-stats.ts effortPctOf) */
      effortPct: l.effortPct,
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
      // 잔 시간 · 근육통 — 안 적은 날은 null 이고, 그러면 추천이 아무것도 바꾸지 않는다
      sleepHours: c.sleepHours,
      soreness: c.soreness,
      // 던지는 일정 — 매일 운동 계획이 '오늘 등판 · 내일 등판'을 읽는다(theme.ts 의 plannedOuting)
      throwPlan: c.throwPlan,
    })),
    memos: usedLogs
      .filter((l) => l.memo?.trim())
      .slice(-5)
      .map<MemoNote>((l) => ({
        date: l.date.toISOString().slice(0, 10),
        text: l.memo!.trim(),
      })),
    /* 운동 끝 힘듦(2판 P2) — 날짜는 체크인과 같은 방식(앞 10자리) */
    trainingNotes: usedNotes.map((n) => ({
      date: n.date.toISOString().slice(0, 10),
      intensity: n.intensity,
    })),
    today,
  });
  const plan = buildPitchPlan(facts);

  /*
   * 오늘 상태 한 장(2판 P3, lib/engine/day-state.ts) — facts · plan 에서 다시 읽고, facts 에 없는 팔 피로 · 팔 통증 자리만 오늘 체크인
   * 줄에서 더 꺼낸다. 그 줄은 위 recentRecords(react cache)가 이미 읽은 것이라 조회가 늘지 않는다. 오늘 줄을 찾는 법은 buildFacts 가
   * 오늘 체크인을 찾는 법(날짜 앞 10자리 = 오늘)과 같고, 체크인은 excludeToday 로 거르지 않는 것도 facts 와 같다.
   * 2026-10-12 에는 아무 독자도 이 값을 읽지 않는다 — 다음 단계에서 하나씩 옮긴다(암케어의 따로 읽는 팔 피로 조회도 그때 걷는다).
   */
  const todayCheckin =
    checkins.find((c) => c.date.toISOString().slice(0, 10) === todayKey) ?? null;
  const savedArmPain = todayCheckin ? pickArmPain(todayCheckin) : null;
  const state = buildDayState({
    facts,
    plan,
    extras: {
      armFatigue: todayCheckin?.armFatigue ?? null,
      armPain: savedArmPain
        ? { spots: savedArmPain.armPainSpots, level: savedArmPain.armPainLevel }
        : null,
    },
  });

  return { facts, plan, state, hasLogs: logs.length > 0 };
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
  const sinceKey = shiftDateKey(todayKey, -HISTORY_DAYS);
  const [all, rehab] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: {
        userId,
        completed: true,
        date: {
          gte: new Date(`${sinceKey}T00:00:00.000Z`),
          lte: new Date(`${todayKey}T00:00:00.000Z`),
        },
        /*
         * 암케어는 뺀다. 2026-09-25 부터 암케어는 운동 일정과 따로 매일 하는 루틴이라,
         * 넣으면 밴드 몇 개만 한 날도 '세션'이 되어 본운동이 돌아오는 차례(여섯 세션)가
         * 날로 치면 훨씬 빨리 온다. 암케어 운동은 일정에 안 나오니 셀 까닭도 없다.
         */
        exercise: { category: { not: '암케어' } },
      },
      select: { exerciseId: true, date: true, exercise: { select: { title: true } } },
      orderBy: { date: 'desc' },
    }),
    loadRehabPeriods(userId, sinceKey),
  ]);
  /*
   * 재활(재활 2편)에서 한 체크도 같은 까닭으로 뺀다 — 재활 운동은 카테고리가 여럿이라(모빌리티 크로스바디 스트레칭 ·
   * 파워 메디신볼 던지기) 암케어 거름에 안 걸려, 1단계(매일)에는 스트레칭 하나로 날마다 '세션'이 됐다.
   */
  const logs = all.filter(
    (l) => !isRehabCheck(l.exercise.title, toDateKey(l.date), rehab)
  );

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

/** 하체·상체를 번갈아 돌리기 위해 살펴보는 기간(일) */
const ROTATION_LOOKBACK_DAYS = 14;

/**
 * 최근 2주 안에 하체/상체 스트렝스를 마지막으로 한 날짜 — 완료 기록이 먼저, 없는 날은 저장된 일정으로.
 *
 * 오늘의 테마(하체 데이·상체 데이)를 번갈아 정하는 데 쓴다.
 * 오늘 것은 넣지 않는다 — 오늘 완료한 운동이 오늘의 테마를 도중에
 * 뒤집으면, 체크할 때마다 목록이 바뀌는 이상한 화면이 된다.
 *
 * 2026-10-11 (P1) 부터 저장된 일정(DailyTrainingSetup.plan)도 본다 — 마침을 안 누르는 사람이 날짜 홀짝 예비 규칙에
 * 떨어져 한쪽에 갇히던 것(기준선 구원B 하체 5 · 상체 0). 규칙은 lib/report/daily-plan.ts 의 strengthDatesFrom 한 곳.
 */
export async function lastStrengthDates(
  userId: string,
  today: Date
): Promise<StrengthDates> {
  const todayKey = toDateKey(today);
  const sinceKey = shiftDateKey(todayKey, -ROTATION_LOOKBACK_DAYS);
  const range = {
    gte: new Date(`${sinceKey}T00:00:00.000Z`),
    lt: new Date(`${todayKey}T00:00:00.000Z`),
  };
  const [logs, rehab, setups] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, completed: true, date: range },
      select: { date: true, exercise: { select: { category: true, title: true } } },
    }),
    loadRehabPeriods(userId, sinceKey),
    /* 그날 저장돼 있던 마지막 일정 — '다시 만들기'를 했으면 마지막 것만 남아 있다(userId_date 하나) */
    prisma.dailyTrainingSetup.findMany({
      where: { userId, date: range, plan: { not: Prisma.DbNull } },
      select: { date: true, plan: true },
    }),
  ]);

  return strengthDatesFrom({
    done: logs
      .map((log) => ({ date: toDateKey(log.date), log }))
      /* 재활에서 한 컬(조트만 컬 — 상체 스트렝스)이 '상체 날을 했다'로 테마를 뒤집지 않게 */
      .filter(({ date, log }) => !isRehabCheck(log.exercise.title, date, rehab))
      .map(({ date, log }) => ({ date, category: log.exercise.category })),
    planned: setups.map((s) => ({ date: toDateKey(s.date), plan: s.plan })),
    todayKey,
  });
}

/**
 * 최근 60일 안에 '바꿔서 뺀'(교체 · 빼기) 운동별 횟수 — 규칙은 lib/report/plan-swaps.ts 의 swappedOutCounts 한 곳.
 *
 * P5 가 '두 번 이상 바꿔서 뺀 운동 −2' 점수로 읽을 자리(buildDailyPlan → pickForTheme → orderCandidates). 2026-10-12 (P2)
 * 에는 만들어 두기만 하고 앱 경로(generateTodayPlan 의 Promise.all)에 아직 안 끼운다 — 쓰는 곳 없이 조회만 늘지 않게.
 * 오늘을 넣는다(lte) — 오늘 빼고 '다시 만들기'한 날 그 운동이 되돌아오지 않게. recentExerciseIds 가 오늘을 빼는 까닭
 * (체크를 켜고 끄면 목록이 흔들림)은 여기 없다.
 *
 * 세션 판(운동 15개 × 처방 · 부위가 든 수 KB)도 기간 안 것을 거르지 않고 다 읽는다. 세션에서 바꾼 것은 그날 일정에도
 * 같이 적히지만(writeSessionList) 그때 일정 줄이 없으면(프로그램 날 · 일정을 만들기 전에 운동한 날) 세션 판에만 남고,
 * 그 뒤 같은 날 일정을 만들어 거기서 하나를 빼면 일정에도 기록이 생긴다. '일정에 기록이 있는 날짜의 세션 판은 건너뛰기'
 * 는 바로 그 경우에 세션에만 있던 줄을 잃었다(2026-10-12 검토에서 확인 — 아낀 것은 바이트뿐). 같은 줄(날짜 · from ·
 * kind · at)은 swappedOutCounts 가 한 번만 센다.
 */
export async function swappedOutRecently(
  userId: string,
  today: Date
): Promise<Map<string, number>> {
  const todayKey = toDateKey(today);
  const sinceKey = shiftDateKey(todayKey, -SWAP_LOOKBACK_DAYS);
  const range = {
    gte: new Date(`${sinceKey}T00:00:00.000Z`),
    lte: new Date(`${todayKey}T00:00:00.000Z`),
  };
  const [setups, sessions] = await Promise.all([
    prisma.dailyTrainingSetup.findMany({
      where: { userId, date: range, plan: { not: Prisma.DbNull } },
      select: { date: true, plan: true },
    }),
    prisma.trainingSession.findMany({
      where: { userId, date: range },
      select: { date: true, plan: true },
    }),
  ]);
  return swappedOutCounts({
    plans: setups.map((s) => ({ date: toDateKey(s.date), plan: s.plan })),
    sessions: sessions.map((s) => ({ date: toDateKey(s.date), plan: s.plan })),
    sinceKey,
    untilKey: todayKey,
  });
}
