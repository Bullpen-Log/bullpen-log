import 'server-only';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { formatPrescription } from '@/lib/exercise-meta';
import { exercisesByIds, visibleExercises } from '@/lib/library-cache';
import { loadRehabExerciseIds } from '@/lib/armcare/rehab-store';
import { readDailyPlan } from '@/lib/report/daily-plan';
import { planPrescription } from '@/lib/report/volume';
import { SLOT_LABELS, SLOT_ORDER } from '@/lib/report/theme';
import { dailyPlanRested } from '@/lib/report/training-screen';
import { readFrozenPlan } from '@/lib/workout/session-plan';

/**
 * 지난 운동 기록을 날짜별로 읽는다.
 *
 * 달력에는 하루 한 줄만 있으면 된다 — 몇 개 했는지, 강도가 몇이었는지.
 * 운동 하나하나까지 통째로 내려보내면, 하루 열 개씩 한 해를 쌓았을 때
 * 삼천 줄이 화면 열 때마다 따라온다. 자세한 것은 날짜를 눌렀을 때만 부른다.
 */

export type TrainingDaySummary = {
  /** 그날 마친 운동 수 */
  count: number;
  /** 그날 적은 운동 강도 1~10. 안 적었으면 null */
  intensity: number | null;
  /** 느낀점을 남겼는가 */
  hasMemo: boolean;
};

/**
 * 달력에 채울 요약. 키는 YYYY-MM-DD.
 *
 * 최근 열세 달만 읽는다. 투구 일지와 같은 이유다 — 매일 남기는 사람이라면
 * 몇 해 뒤에는 천 줄이 화면 열 때마다 따라온다. 열세 달이면 이번 시즌과
 * 작년 같은 시기까지 넘겨봐도 끊기지 않는다.
 *
 * 그보다 옛날 달로 넘기면 그 달은 빈 달력으로 보인다. 투구 일지처럼 그때
 * 받아 오게 하려면 이 함수도 기간을 받아야 하는데, 운동 기록은 하루 한 줄이라
 * (groupBy) 투구 기록만큼 무겁지 않다. 필요해지면 그때 나눈다.
 */
const SUMMARY_MONTHS = 13;

/** 요약을 읽기 시작하는 날 — 열세 달 전 그달 1일(UTC) */
function summarySince() {
  const now = appNow();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SUMMARY_MONTHS, 1)
  );
}

export async function trainingSummaries(
  userId: string
): Promise<Record<string, TrainingDaySummary>> {
  const since = summarySince();

  const [byDay, notes] = await Promise.all([
    prisma.userExerciseLog.groupBy({
      by: ['date'],
      where: { userId, completed: true, date: { gte: since } },
      _count: { exerciseId: true },
    }),
    prisma.dailyTrainingNote.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, intensity: true, memo: true },
    }),
  ]);

  const out: Record<string, TrainingDaySummary> = {};
  for (const row of byDay) {
    out[toDateKey(row.date)] = {
      count: row._count.exerciseId,
      intensity: null,
      hasMemo: false,
    };
  }
  /*
   * 운동은 하나도 체크 안 했는데 강도만 적은 날도 있다. 그런 날도 달력에
   * 표시해야 한다 — 남긴 것이 있는데 빈칸으로 보이면 저장이 안 된 줄 안다.
   */
  for (const note of notes) {
    const key = toDateKey(note.date);
    const prev = out[key] ?? { count: 0, intensity: null, hasMemo: false };
    out[key] = {
      ...prev,
      intensity: note.intensity,
      hasMemo: Boolean(note.memo?.trim()),
    };
  }
  return out;
}

/**
 * 그날 만들어 둔 운동 일정의 요약 — 캘린더에서 날짜를 누르면 뜨는 자리에 쓴다.
 *
 * 운동 하나하나가 아니라 그날의 테마와, 대충 어떤 종류를 하는 날인지만 둔다.
 * 캘린더는 이 날 저 날 눌러보며 훑는 자리라 '하체 스트렝스 데이 — 가동성 ·
 * 본운동 · 코어'면 충분하고, 목록은 '자세히'에서 본다.
 */
export type PlanDaySummary = {
  /** 테마 이름 — '하체 스트렝스 데이' */
  theme: string;
  /** 무엇을 하는 날인지 — 들어 있는 구간 이름(가동성 · 본운동 · 코어 · 암케어) */
  parts: string[];
  /** 종목 수 */
  count: number;
  /** 대략 걸리는 시간(분) — 만들 때 셈해 둔 값 */
  minutes: number;
};

/**
 * 날짜별 운동 일정 요약. 키는 YYYY-MM-DD. 기간은 운동 요약과 같다(열세 달).
 *
 * 일정(plan)은 만든 날 그대로 남아 있는 것을 읽는다(DailyTrainingSetup.plan).
 * 모양이 옛것이거나 비어 있는 날은 없는 것으로 친다 — 억지로 읽으면 캘린더가
 * 빈 테마 이름을 띄운다.
 *
 * 구간 이름으로 줄이는 것은 서버에서 한다. 일정 한 장에는 근거·안내 글까지 들어
 * 있어서, 통째로 내려보내면 캘린더가 쓰지도 않을 글을 열세 달치 받는다.
 */
export async function planSummaries(
  userId: string
): Promise<Record<string, PlanDaySummary>> {
  const since = summarySince();
  const [rows, programSessions] = await Promise.all([
    prisma.dailyTrainingSetup.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, plan: true },
    }),
    /*
     * 근력 프로그램 판이 있던 날(날짜만 — 판 JSON 은 안 읽는다, lib/program/load.ts lastProgramSessionKey 와 같은 거르기). 그날 매일 일정이 프로그램
     * 날로 짜이지 않았으면 그 일정은 쉰 것이라(dailyPlanRested — 화면이 '오늘 쉬어요'로 숨긴 일정) 캘린더에 그날 일정으로 내지 않는다(2판 P6 검토).
     */
    prisma.trainingSession.findMany({
      where: {
        userId,
        date: { gte: since },
        plan: { path: ['program', 'key'], string_starts_with: '' },
      },
      select: { date: true },
    }),
  ]);
  const programDays = new Set(programSessions.map((s) => toDateKey(s.date)));

  const out: Record<string, PlanDaySummary> = {};
  for (const row of rows) {
    const plan = readDailyPlan(row.plan);
    if (!plan || plan.picks.length === 0) continue;
    if (dailyPlanRested(plan, programDays.has(toDateKey(row.date)))) continue;
    const slots = new Set<string>(plan.picks.map((p) => p.slot));
    out[toDateKey(row.date)] = {
      theme: plan.theme.label,
      parts: [
        ...LEGACY_SLOTS.filter((s) => slots.has(s.key)).map((s) => s.label),
        ...SLOT_ORDER.filter((s) => slots.has(s)).map((s) => SLOT_LABELS[s].label),
      ],
      count: plan.picks.length,
      minutes: plan.estimatedMinutes,
    };
  }
  return out;
}

/*
 * 지금은 없어진 구간 — 예전에 만든 일정에만 남아 있다.
 *
 * 워밍업은 예전에 일정의 맨 앞 구간이었다. 지금은 일정을 만들 때 뽑지 않고 고정
 * 루틴으로 따로 둔다(lib/report/theme.ts 의 구간 설명). 그 전에 만든 날의 일정에는
 * 아직 'warmup' 이 들어 있어서, 지금 구간 목록으로만 읽으면 그날 한 워밍업이 요약에서
 * 조용히 빠진다. 맨 앞에 둔다 — 그날도 먼저 했다.
 */
const LEGACY_SLOTS = [{ key: 'warmup', label: '워밍업' }];

export type TrainingDayDetail = {
  date: string;
  /** 이 날짜를 아직 고칠 수 있는가 (일주일 안) */
  editable: boolean;
  exercises: {
    id: string;
    title: string;
    category: string;
    /** 계획된 세트·횟수 — '3세트 × 10회 · 세트 사이 3분 휴식' */
    planned: string | null;
    /**
     * 마친 것으로 표시했는가.
     *
     * 그날 일정에는 있었지만 체크 안 한 운동도 함께 내려보낸다. 예전에는 완료한
     * 것만 보여줘서, 체크를 깜빡한 날은 목록이 비어 있고 손댈 방법도 없었다.
     */
    done: boolean;
    /** 실제로 적은 만큼. 안 적었으면 null */
    setsDone: number | null;
    repsDone: number | null;
    holdSecondsDone: number | null;
    /**
     * 실제로 든 무게(kg). 안 적었거나 맨몸이면 null.
     *
     * 적는 자리는 있는데 다시 볼 자리가 없었다. 무게는 부하 계산에 쓰이는
     * 값이기도 하지만, 사용자에게는 "지난주에 몇 kg 들었지"가 더 중요하다 —
     * 그걸 모르면 조금씩 올릴 수가 없다.
     */
    weightKg: number | null;
  }[];
  intensity: number | null;
  memo: string | null;
};

/** 날짜 하나의 자세한 내용. 달력에서 그 날을 눌렀을 때만 부른다. */
export async function trainingDay(
  userId: string,
  dateKey: string
): Promise<TrainingDayDetail> {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  const [allLogs, note, setup, session] = await Promise.all([
    prisma.userExerciseLog.findMany({
      where: { userId, date, completed: true },
      select: {
        exerciseId: true,
        setsDone: true,
        repsDone: true,
        holdSecondsDone: true,
        weightKg: true,
        exercise: {
          select: {
            title: true,
            category: true,
            /* 목표에 맞춘 횟수를 고르는 데 쓴다(goal-prescription.ts) */
            intensity: true,
            sets: true,
            reps: true,
            holdSeconds: true,
            restSeconds: true,
            perSide: true,
          },
        },
      },
    }),
    prisma.dailyTrainingNote.findUnique({
      where: { userId_date: { userId, date } },
      select: { intensity: true, memo: true },
    }),
    /*
     * 그날 만들어 둔 일정. 체크 안 한 운동을 보여주려면 이것이 있어야 한다 —
     * 완료 기록만으로는 "무엇을 하기로 했었나"를 알 수 없다.
     */
    prisma.dailyTrainingSetup.findUnique({
      where: { userId_date: { userId, date } },
      select: { plan: true },
    }),
    /* 그날 운동 판 — 근력 프로그램 판이면 그날 처방이 여기 있다(아래 '계획') */
    prisma.trainingSession.findUnique({
      where: { userId_date: { userId, date } },
      select: { plan: true },
    }),
  ]);

  /*
   * 운동으로 세는 기록만 — 암케어 · 재활에서 한 체크는 그날 상세의 '운동 N개'에서 뺀다(2026-10-16 점검 6번). 트레이닝 탭의
   * 'N종목'(lib/report/today-data.ts strays)과 같은 기준이라 홈 · 달력 · 그날 상세가 같은 수를 말한다.
   */
  const [owner, library] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { ownedEquipment: true } }),
    visibleExercises(),
  ]);
  const rehabIds = await loadRehabExerciseIds(userId, library, owner?.ownedEquipment ?? []);
  const logs = allLogs.filter(
    (l) => l.exercise.category !== '암케어' && !rehabIds.has(l.exerciseId)
  );

  const doneIds = new Set(logs.map((l) => l.exerciseId));
  /*
   * '계획'은 그날 목표 · 양 조절에 맞춘 세트 · 횟수로 적는다 — 그날 트레이닝 화면에 보였던 값(처방 한 길, lib/report/volume.ts).
   * 옛 줄 · 모양이 안 맞는 줄은 null 이라 라이브러리 처방 그대로다(예전과 같음).
   */
  const dayPlan = readDailyPlan(setup?.plan);
  /*
   * 그날 근력 프로그램 판(2판 P6 검토, 2026-10-13). 프로그램 날의 처방(5×5 · % 무게)은 일정이 아니라 판에 얼어 있다 — 일정의 목표가 없어
   * planPrescription 이 라이브러리 기본 처방('3세트 × 8회')을 내면 그날 한 것과 다른 계획이 보였다. 판에 그 운동이 있으면 판의 처방 줄을 쓴다.
   */
  const frozen = readFrozenPlan(session?.plan);
  const programRx = frozen?.program
    ? new Map(frozen.exercises.map((e) => [e.id, e.prescription]))
    : null;
  /**
   * 한 운동의 '계획' 줄 — 프로그램 판에 있으면 그 처방, 프로그램 날 일정(dayPlan.program)인데 판에 없으면 null(라이브러리 처방은 그날 처방이
   * 아니다 — 화면은 null 이면 줄을 안 보인다), 그 밖은 예전처럼 일정의 목표 · 양 조절.
   */
  const plannedLine = (ex: Parameters<typeof planPrescription>[0] & { id: string }) =>
    programRx?.has(ex.id)
      ? (programRx.get(ex.id) ?? null)
      : dayPlan?.program
        ? null
        : formatPrescription(planPrescription(ex, dayPlan));

  /*
   * 그날 일정에는 있었지만 체크 안 한 운동.
   *
   * 완료한 것 뒤에 붙인다. 한 일이 먼저 보이고, 빠뜨린 것이 그 아래 남는다.
   *
   * 그날 근력 프로그램 판이 있는데 일정이 프로그램 날로 짜이지 않았으면(dailyPlanRested — 화면이 '오늘 쉬어요'로 숨긴 일정, 2판 P6 검토) 그 일정의
   * 운동은 할 일이 아니었다 — 홈 링 '운동 n/m' · 캘린더 그날 칸이 화면과 같은 말을 하게 안 센다.
   */
  const rested = dailyPlanRested(dayPlan, frozen?.program != null);
  const plannedIds = rested
    ? []
    : readPlanExerciseIds(setup?.plan).filter((id) => !doneIds.has(id));
  /* 이미 들고 있는 목록에서 고른다 — 몇 개 찾자고 DB 를 한 번 더 묻지 않는다 */
  const missed = await exercisesByIds(plannedIds);

  const todayKey = toDateKey(appNow());

  return {
    date: dateKey,
    /* 앞날은 애초에 못 열고, 일주일이 지나면 고칠 수 없다(exercise-log.ts). */
    editable: dateKey <= todayKey && dateKey >= shiftDateKey(todayKey, -EDITABLE_DAYS),
    exercises: [
      ...logs.map((l) => ({
        id: l.exerciseId,
        title: l.exercise.title,
        category: l.exercise.category,
        planned: plannedLine({ ...l.exercise, id: l.exerciseId }),
        done: true,
        setsDone: l.setsDone,
        repsDone: l.repsDone,
        holdSecondsDone: l.holdSecondsDone,
        weightKg: l.weightKg,
      })),
      ...missed.map((ex) => ({
        id: ex.id,
        title: ex.title,
        category: ex.category,
        planned: plannedLine(ex),
        done: false,
        setsDone: null,
        repsDone: null,
        holdSecondsDone: null,
        weightKg: null,
      })),
    ],
    intensity: note?.intensity ?? null,
    memo: note?.memo ?? null,
  };
}

/** 며칠 전 것까지 고칠 수 있는가. app/actions/exercise-log.ts 와 같은 값이어야 한다. */
const EDITABLE_DAYS = 7;

/**
 * 저장해 둔 일정에서 운동 id 만 꺼낸다.
 *
 * plan 은 Json 이라 모양을 믿을 수 없다. 옛 일정이 남아 있을 수도 있어,
 * 기대한 모양이 아니면 조용히 빈 목록으로 둔다 — 화면이 깨지는 것보다 낫다.
 */
function readPlanExerciseIds(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') return [];
  const picks = (plan as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];
  return picks
    .map((p) => (p as { exerciseId?: unknown })?.exerciseId)
    .filter((id): id is string => typeof id === 'string');
}
