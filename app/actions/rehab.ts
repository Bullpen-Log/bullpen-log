'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { ageFromBirthDate } from '@/lib/profile';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { visibleExercises } from '@/lib/library-cache';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import {
  REHAB_ENABLED,
  WEEKLY_EVERY_DAYS,
  atLeastConditionSeverity,
  buildRehabSession,
  daysBetween,
  firstCkcRecord,
  hasPlyoBall,
  isRehabArea,
  isRehabCondition,
  judgeSession,
  judgeStageTest,
  judgeThrowingOpen,
  normalizeRehabActivities,
  painFreeBallDays,
  rehabSeverity,
  rehabStartBlock,
  rehabStatus,
  REHAB_CONDITIONS,
  sessionResultText,
  stageTestFor,
  startStage,
  throwingOpenedOn,
  weeklyDueState,
  weeklyOutcome,
  type RehabFeel,
  type RehabLeftover,
  type RehabResult,
  type RehabStage,
  type RehabWeeklyLike,
  type RehabWeeklyTest,
  type SidePair,
  type StageTestInput,
  type ThrowingTestRecord,
} from '@/lib/armcare/rehab';
import {
  dayStart,
  loadActiveRehab,
  loadDoneOn,
  loadRehabRecords,
  toRehabLibrary,
} from '@/lib/armcare/rehab-store';

/**
 * 재활 프로그램 저장(재활 2편) — 시작 · 세션 3문항 · 매주 확인 · 투구 복귀표 열기 · 단계 바꾸기 · 진단 받았어요 ·
 * 그만두기 · 끝내기.
 *
 * 규칙은 lib/armcare/rehab.ts 에 있고 화면도 같은 것을 본다. 여기서는 화면을 믿지 않고 한 번 더 따진다 — 나이로 막기,
 * 한 사람에 하나, 단계 시험 통과, 세션 판정, 매주 결과(정도 · 단계 · 줄인 날), 투구 복귀표 열기.
 *
 * 결과는 늘 { ok } 또는 { error } 다. 화면은 orOffline(lib/action-offline.ts)으로 감싸 신호가 끊겨도 한 줄로 알린다.
 */

type Result<T = object> = ({ ok: true } & T) | { error: string };

const OFF = '재활 프로그램을 잠시 멈췄어요.';
const NOT_ACTIVE = '진행 중인 재활이 없어요. 화면을 새로고침해 주세요.';

function refresh() {
  revalidatePath('/training');
  /* 투구 계획 · 홈의 오늘 일정이 재활을 본다(lib/report/gather.ts) */
  revalidatePath('/today');
}

/** 0~10 정수만 */
function painScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
}

/* ─────────────────────────────── 시작 ─────────────────────────────── */

/**
 * 재활을 시작한다 — 부위 · 정도(1편의 세 질문 + 지난 일주일 가장 아팠을 때) · 진단(있으면) · 내 활동 둘.
 * 위험 신호는 체크 칸이 아니라 글로만 보인다(사용자 결정). 진행 중인 재활은 한 사람에 하나.
 */
export async function startRehab(input: {
  area: string;
  level: number;
  worst: number;
  condition: string | null;
  activities: string[];
}): Promise<Result<{ stage: RehabStage }>> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  if (!isRehabArea(input.area)) return { error: '아픈 곳을 골라 주세요.' };
  const level = Number(input.level);
  if (level !== 1 && level !== 2 && level !== 3)
    return { error: '얼마나 아픈지 골라 주세요.' };
  const worst = painScore(input.worst);
  if (worst == null)
    return { error: '지난 일주일 가장 아팠을 때를 0~10 에서 골라 주세요.' };
  const condition =
    input.condition == null
      ? null
      : isRehabCondition(input.condition) &&
          REHAB_CONDITIONS[input.condition].area === input.area
        ? input.condition
        : undefined;
  if (condition === undefined) return { error: '고른 부위에 맞는 진단을 골라 주세요.' };
  const activities = normalizeRehabActivities(input.activities ?? []);
  if (!activities)
    return { error: '내 활동을 두 개 골라 주세요(직접 적기는 20자까지).' };

  const today = new Date();
  const age = user.birthDate ? ageFromBirthDate(user.birthDate, today) : null;
  const block = rehabStartBlock({ age, area: input.area, condition });
  if (block) return { error: block.text };

  const severity = rehabSeverity({ level, worst, condition });
  const stage = startStage(severity);
  const todayKey = toDateKey(today);

  /*
   * 세고 만들기를 한 트랜잭션(직렬화)으로 — 두 창에서 동시에 [시작]을 누르면 둘 다 '없음'을 보고 둘을 만들 수 있다
   * (내 루틴 만들기와 같은 방식, app/actions/armcare.ts). 겹치면 DB 가 한쪽을 되돌린다.
   */
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.userRehabProgram.count({
          where: { userId: user.id, endedAt: null },
        });
        if (existing > 0) return null;
        return tx.userRehabProgram.create({
          data: {
            userId: user.id,
            area: input.area,
            condition,
            severity,
            stage,
            stageStartedAt: dayStart(todayKey),
            activities: activities.map((label) => ({ label })),
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if (!created) return { error: '이미 진행 중인 재활이 있어요.' };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      return { error: '다른 곳에서 동시에 시작하고 있어요. 다시 눌러 주세요.' };
    }
    throw e;
  }

  refresh();
  return { ok: true, stage };
}

/* ─────────────────────────────── 세션 3문항 ─────────────────────────────── */

const LEFTOVERS: readonly RehabLeftover[] = [0, 1, 2];
const FEELS: readonly RehabFeel[] = ['muscle', 'sharp', 'tingle', 'slip'];

/**
 * 오늘 세션을 남긴다 — 따라하기 끝의 3문항(남은 통증 · 가장 아팠던 정도 · 느낌) → 판정.
 *
 * 하루 한 줄이라 다시 답하면 고친다. 날은 따라하기가 연 날(오늘 또는 어제 — 자정을 넘겨 끝낸 경우)이다.
 * 한 비율(done)은 그날 재활 운동 중 운동 기록(UserExerciseLog)에 체크된 것으로 센다 — 하나도 안 했으면 남기지 않는다.
 * 그날 낮춘 운동으로 했는지는 남기기 전의 상태로 정한다(오늘 줄을 빼고 셈).
 */
export async function saveRehabSession(input: {
  dateKey: string;
  leftover: number;
  pain: number;
  feel: string;
}): Promise<Result<{ result: RehabResult; text: string }>> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  const leftover = LEFTOVERS.find((v) => v === Number(input.leftover));
  if (leftover == null) return { error: '지난번 뒤 남은 통증을 골라 주세요.' };
  const pain = painScore(input.pain);
  if (pain == null) return { error: '가장 아팠던 정도를 0~10 에서 골라 주세요.' };
  const feel = FEELS.find((v) => v === input.feel);
  if (!feel) return { error: '어떤 느낌이었는지 골라 주세요.' };

  const todayKey = toDateKey(new Date());
  const dateKey =
    input.dateKey === shiftDateKey(todayKey, -1) ? input.dateKey : todayKey;

  const active = await loadActiveRehab(user.id);
  if (!active) return { error: NOT_ACTIVE };
  const { program } = active;

  const { sessions, checkins, weeklies } = await loadRehabRecords(
    user.id,
    active.id,
    dateKey
  );
  const before = rehabStatus({
    program,
    sessions: sessions.filter((s) => s.date !== dateKey),
    checkins,
    weeklies,
    todayKey: dateKey,
  });
  const session = buildRehabSession({
    ...program,
    lowered: before.lowered,
    library: toRehabLibrary(await visibleExercises()),
    ownedEquipment: user.ownedEquipment,
  });
  const ids = session.items.map((it) => it.exerciseId);
  const doneIds = await loadDoneOn(user.id, dateKey, ids);
  if (doneIds.size === 0) {
    return {
      error:
        '운동을 하나라도 마쳐야 남길 수 있어요. 체크가 아직 안 갔다면 잠시 뒤 다시 눌러 주세요.',
    };
  }

  const result = judgeSession({ leftover, pain, feel, ...program });
  const data = {
    stage: program.stage,
    leftover,
    pain,
    feel,
    done: Math.round((doneIds.size / ids.length) * 100) / 100,
    result,
    lowered: before.lowered,
  };
  await prisma.userRehabSession.upsert({
    where: { programId_date: { programId: active.id, date: dayStart(dateKey) } },
    create: { programId: active.id, userId: user.id, date: dayStart(dateKey), ...data },
    update: data,
  });

  refresh();
  return {
    ok: true,
    result,
    text: sessionResultText({ result, leftover, pain, feel, stage: program.stage }),
  };
}

/* ─────────────────────────────── 단계 바꾸기 ─────────────────────────────── */

/**
 * 단계를 바꾼다 — 단계 시험을 통과해 한 칸 올리기(test), 또는 직접(direct, 언제나 — 설계 8-5).
 *
 * 시험으로 올릴 때는 화면을 믿지 않고 다시 본다: 올리는 조건(최소 기간 · 깨끗한 세션 · 최근 셋 초록 · 심함 밤 통증)과
 * 시험 통과. 바꾸면 그 단계의 날짜를 오늘로, 앞당긴 날을 0으로 — 세션 수는 단계마다 새로 센다.
 */
export async function changeRehabStage(input: {
  to: number;
  via: 'test' | 'direct';
  test?: StageTestInput;
}): Promise<Result<{ stage: RehabStage }> | { error: string; fails: string[] }> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  const active = await loadActiveRehab(user.id);
  if (!active) return { error: NOT_ACTIVE };
  const { program } = active;
  const to = Number(input.to);
  if (![1, 2, 3, 4].includes(to) || to === program.stage) {
    return { error: '바꿀 단계를 다시 골라 주세요.' };
  }
  const todayKey = toDateKey(new Date());

  if (input.via === 'test') {
    if (to !== program.stage + 1) return { error: '단계 시험은 한 칸씩 올려요.' };
    const test = stageTestFor(program.area, program.stage);
    if (!test) return { error: '이 단계는 단계 시험이 없어요.' };
    const { sessions, checkins, weeklies } = await loadRehabRecords(
      user.id,
      active.id,
      todayKey
    );
    const status = rehabStatus({ program, sessions, checkins, weeklies, todayKey });
    if (!status.gate.ready) {
      return {
        error: '아직 올리는 조건이 다 차지 않았어요.',
        fails: status.gate.checks.filter((c) => !c.ok).map((c) => c.label),
      };
    }
    const judged = judgeStageTest(test, input.test ?? {});
    if (!judged.pass)
      return { error: '단계 시험을 통과하지 못했어요.', fails: judged.fails };
  }

  await prisma.userRehabProgram.update({
    where: { id: active.id },
    data: { stage: to, stageStartedAt: dayStart(todayKey), stageShortenDays: 0 },
  });
  refresh();
  return { ok: true, stage: to as RehabStage };
}

/* ─────────────────────────────── 매주 확인 ─────────────────────────────── */

/** ⑤ 단계 시험의 답 — 그 단계에 맞는 것(1단계 rom · 2 · 3단계 strength · 4단계 throwing) */
export type WeeklyTestInput =
  | { kind: 'rom'; painFree: boolean; similar: boolean }
  | {
      kind: 'strength';
      injured: number;
      other: number;
      pain: number;
      /** 팔굽혀 터치 15초 오늘 기록(3번 평균) — 3단계 어깨 부위만 */
      ckc?: number | null;
    }
  | {
      kind: 'throwing';
      push: SidePair;
      drop?: SidePair | null;
      wall?: SidePair | null;
      pain: number;
    };

/** 횟수 · 거리 — 0 이상, 소수 한 자리까지(밀기 거리 · 3번 평균) */
function measure(value: unknown, max = 999): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

function sidePair(value: unknown): SidePair | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const injured = measure(v.injured);
  const other = measure(v.other);
  return injured == null || other == null ? null : { injured, other };
}

/** 그 단계의 ⑤ 시험 — 4단계는 투구 복귀표 열기 */
function expectedTestKind(area: ArmcareAreaKey, stage: RehabStage) {
  return stage === 4 ? 'throwing' : (stageTestFor(area, stage)?.kind ?? null);
}

/**
 * 매주 확인을 남긴다(가이드라인 8절) — ① 다치기 전 대비 % ② 이번 주 가장 아팠던 정도 · 밤 · 쉴 때 ③ 내 활동 둘 ④ 던질
 * 자신감 ⑤ 그 단계의 단계 시험(건너뛸 수 있다). 결과(가이드라인 10절 — weeklyOutcome)를 여기서 다시 계산해 프로그램을
 * 고친다: 정도 낮추기 · 기간 줄이기 · 한 단계 내림(그 단계의 날은 오늘 · 줄인 날은 0, changeRehabStage 와 같다).
 *
 * 하루 한 번, 마지막 확인(없으면 시작) 7일 뒤부터 받는다(weeklyDueState). 같은 날 다시 남기게 하면 결과가 두 번 걸린다.
 * 팔굽혀 터치 기록은 test.ckc 에 남고 이 재활의 첫 기록이 '내 첫 기록'이 된다. 4단계의 ⑤가 통과하면 투구 복귀표가 열린다.
 */
export async function saveRehabWeekly(input: {
  normalPct: number;
  worstPain: number;
  nightPain: boolean;
  activities: number[];
  confidence: number;
  test: WeeklyTestInput | null;
}): Promise<
  | { ok: true; lines: string[]; test: { pass: boolean; fails: string[] } | null }
  | { error: string }
> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  const normalPct = Number(input.normalPct);
  if (
    !Number.isInteger(normalPct) ||
    normalPct < 0 ||
    normalPct > 100 ||
    normalPct % 10
  )
    return { error: '다치기 전과 비교해 몇 %인지 골라 주세요.' };
  const worstPain = painScore(input.worstPain);
  if (worstPain == null)
    return { error: '이번 주 가장 아팠던 정도를 0~10 에서 골라 주세요.' };
  if (typeof input.nightPain !== 'boolean')
    return { error: '밤이나 쉴 때 아팠는지 골라 주세요.' };
  const confidence = painScore(input.confidence);
  if (confidence == null) return { error: '던질 자신감을 0~10 에서 골라 주세요.' };

  const active = await loadActiveRehab(user.id);
  if (!active) return { error: NOT_ACTIVE };
  const { program } = active;
  const scores = Array.isArray(input.activities) ? input.activities.map(painScore) : [];
  if (scores.length !== active.activities.length || scores.some((s) => s == null)) {
    return { error: '내 활동마다 0~10 에서 골라 주세요.' };
  }
  const activities = scores as number[];

  const todayKey = toDateKey(new Date());
  const { sessions, checkins, weeklies } = await loadRehabRecords(
    user.id,
    active.id,
    todayKey
  );
  const last = weeklies.at(-1) ?? null;
  if (last?.date === todayKey) return { error: '오늘 확인은 이미 남겼어요.' };
  const due = weeklyDueState({
    startedOn: program.startedOn,
    lastWeeklyOn: last?.date ?? null,
    stage: program.stage,
    todayKey,
  });
  if (!due.allowed) {
    return {
      error: `매주 확인은 지난 확인(없으면 시작한 날) ${WEEKLY_EVERY_DAYS}일 뒤에 해요.`,
    };
  }

  /* ⑤ 단계 시험 — 화면을 믿지 않고 여기서 다시 판정한다 */
  let test: RehabWeeklyTest = { kind: null, pass: false };
  let judged: { pass: boolean; fails: string[] } | null = null;
  if (input.test) {
    const kind = expectedTestKind(program.area, program.stage);
    if (input.test.kind !== kind)
      return { error: '이 단계의 시험이 아니에요. 새로고침해 주세요.' };
    if (input.test.kind === 'rom') {
      const spec = stageTestFor(program.area, program.stage)!;
      if (
        typeof input.test.painFree !== 'boolean' ||
        typeof input.test.similar !== 'boolean'
      )
        return { error: '단계 시험의 두 질문에 답해 주세요.' };
      judged = judgeStageTest(spec, input.test);
      test = {
        kind: 'rom',
        pass: judged.pass,
        painFree: input.test.painFree,
        similar: input.test.similar,
      };
    } else if (input.test.kind === 'strength') {
      const spec = stageTestFor(program.area, program.stage)!;
      const injured = measure(input.test.injured);
      const other = measure(input.test.other);
      const pain = painScore(input.test.pain);
      const ckc =
        spec.kind === 'strength' && spec.ckc && input.test.ckc != null
          ? measure(input.test.ckc, 100)
          : null;
      if (injured == null || other == null || pain == null)
        return { error: '단계 시험의 양쪽 횟수와 통증을 적어 주세요.' };
      judged = judgeStageTest(spec, {
        injured,
        other,
        pain,
        ckcNow: ckc,
        ckcFirst: firstCkcRecord(weeklies),
      });
      test = {
        kind: 'strength',
        pass: judged.pass,
        injured,
        other,
        pain,
        ...(ckc != null ? { ckc } : {}),
      };
    } else {
      const push = sidePair(input.test.push);
      const pain = painScore(input.test.pain);
      const plyo = hasPlyoBall(user.ownedEquipment);
      const drop = plyo ? sidePair(input.test.drop) : null;
      const wall = plyo ? sidePair(input.test.wall) : null;
      if (!push || pain == null || (plyo && (!drop || !wall)))
        return { error: '투구 복귀표 열기 시험을 모두 적어 주세요.' };
      judged = judgeThrowingOpen({
        severity: program.severity,
        painFreeBallDays: painFreeBallDays({ program, sessions, todayKey }),
        daysSinceStart: daysBetween(program.startedOn, todayKey),
        condition: program.condition,
        hasPlyo: plyo,
        push,
        drop,
        wall,
        pain,
        normalPct,
        confidence,
      });
      test = {
        kind: 'throwing',
        pass: judged.pass,
        throwing: { pass: judged.pass, push, drop, wall, pain, on: todayKey },
      };
    }
  }

  const weekly: RehabWeeklyLike = {
    date: todayKey,
    stage: program.stage,
    normalPct,
    worstPain,
    nightPain: input.nightPain,
    activities,
    confidence,
    test,
  };
  const outcome = weeklyOutcome({
    program,
    weekly,
    previous: weeklies,
    sessions,
    checkins,
  });
  const { next } = outcome;
  const changed =
    next.stageChanged ||
    next.severity !== program.severity ||
    next.stageShortenDays !== program.stageShortenDays;

  /*
   * 확인 줄과 프로그램을 한 트랜잭션(직렬화)으로 — 두 창에서 동시에 남기면 둘 다 '오늘 없음'을 보고 결과를 두 번 걸 수 있다.
   * 겹치면 DB 가 한쪽을 되돌린다(시작과 같은 방식).
   */
  try {
    const saved = await prisma.$transaction(
      async (tx) => {
        const already = await tx.userRehabWeekly.count({
          where: { programId: active.id, date: dayStart(todayKey) },
        });
        if (already > 0) return false;
        await tx.userRehabWeekly.create({
          data: {
            programId: active.id,
            userId: user.id,
            date: dayStart(todayKey),
            stage: program.stage,
            normalPct,
            worstPain,
            nightPain: input.nightPain,
            activities,
            confidence,
            test: { ...test, outcome: outcome.record } as Prisma.InputJsonObject,
          },
        });
        if (changed) {
          await tx.userRehabProgram.update({
            where: { id: active.id },
            data: {
              severity: next.severity,
              stage: next.stage,
              stageShortenDays: next.stageShortenDays,
              ...(next.stageChanged ? { stageStartedAt: dayStart(todayKey) } : {}),
            },
          });
        }
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if (!saved) return { error: '오늘 확인은 이미 남겼어요.' };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      return { error: '다른 곳에서 동시에 남기고 있어요. 다시 눌러 주세요.' };
    }
    throw e;
  }

  refresh();
  return { ok: true, lines: outcome.lines, test: judged };
}

/* ─────────────────────────────── 투구 복귀표 열기 ─────────────────────────────── */

/**
 * 4단계 카드의 [투구 복귀표 열기] — 앉아서 한 팔 메디신볼 밀기 · (플라이오볼이 있으면) 프론 볼 드롭 · 한 팔 90/90 벽 던지기 ·
 * 시험 중 통증을 받고, 정상 대비 % · 자신감은 지난 7일 안의 매주 확인 것을 쓴다(없으면 화면이 매주 확인부터 연다).
 *
 * 통과하면 그 확인 줄의 test.throwing 에 남긴다 — 연 날을 남길 칸이 프로그램에 없고, 열 수 있는지를 매번 다시
 * 계산하려면 시험 기록이 어딘가 있어야 해서 더 단순한 쪽을 골랐다. 표 자체는 기록하지 않는다(가이드라인 11절).
 */
export async function openThrowingProgram(input: {
  push: SidePair;
  drop?: SidePair | null;
  wall?: SidePair | null;
  pain: number;
}): Promise<{ ok: true } | { error: string; fails?: string[] }> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  const active = await loadActiveRehab(user.id);
  if (!active) return { error: NOT_ACTIVE };
  const { program } = active;
  if (program.stage !== 4) return { error: '투구 복귀표는 4단계에서 열어요.' };

  const push = sidePair(input.push);
  const pain = painScore(input.pain);
  const plyo = hasPlyoBall(user.ownedEquipment);
  const drop = plyo ? sidePair(input.drop) : null;
  const wall = plyo ? sidePair(input.wall) : null;
  if (!push || pain == null || (plyo && (!drop || !wall)))
    return { error: '시험 기록을 모두 적어 주세요.' };

  const todayKey = toDateKey(new Date());
  const { sessions, weeklies } = await loadRehabRecords(user.id, active.id, todayKey);
  if (throwingOpenedOn(program, weeklies)) return { ok: true };
  const recent = weeklies.at(-1);
  if (!recent || daysBetween(recent.date, todayKey) >= WEEKLY_EVERY_DAYS) {
    return { error: '먼저 이번 주 확인을 해 주세요.' };
  }

  const judged = judgeThrowingOpen({
    severity: program.severity,
    painFreeBallDays: painFreeBallDays({ program, sessions, todayKey }),
    daysSinceStart: daysBetween(program.startedOn, todayKey),
    condition: program.condition,
    hasPlyo: plyo,
    push,
    drop,
    wall,
    pain,
    normalPct: recent.normalPct,
    confidence: recent.confidence,
  });
  if (!judged.pass)
    return { error: '아직 투구 복귀표를 열 수 없어요.', fails: judged.fails };

  const row = await prisma.userRehabWeekly.findFirst({
    where: { programId: active.id, userId: user.id, date: dayStart(recent.date) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, test: true },
  });
  if (!row) return { error: NOT_ACTIVE };
  const before =
    row.test && typeof row.test === 'object' && !Array.isArray(row.test)
      ? row.test
      : {};
  const throwing: ThrowingTestRecord = {
    pass: true,
    push,
    drop,
    wall,
    pain,
    on: todayKey,
  };
  await prisma.userRehabWeekly.update({
    where: { id: row.id },
    data: { test: { ...before, throwing } as Prisma.InputJsonObject },
  });
  refresh();
  return { ok: true };
}

/* ─────────────────────────────── 진단 받았어요 ─────────────────────────────── */

/**
 * 나중에 진단을 받았다 — 부위 재활을 병명 재활로 바꾼다. 단계 · 날짜는 그대로, 병명 바닥 기간이 붙는다.
 * 병명이 정한 정도의 바닥(UCL 은 보통 이상)도 맞춘다.
 */
export async function setRehabCondition(condition: string): Promise<Result> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  const active = await loadActiveRehab(user.id);
  if (!active) return { error: NOT_ACTIVE };
  if (
    !isRehabCondition(condition) ||
    REHAB_CONDITIONS[condition].area !== active.program.area
  ) {
    return { error: '이 부위에 맞는 진단을 골라 주세요.' };
  }
  await prisma.userRehabProgram.update({
    where: { id: active.id },
    data: {
      condition,
      severity: atLeastConditionSeverity(active.program.severity, condition),
    },
  });
  refresh();
  return { ok: true };
}

/* ─────────────────────────────── 그만두기 · 끝내기 ─────────────────────────────── */

/**
 * 재활을 마친다 — 'stopped' 그만두기(언제나) · 'done' 끝내기(4단계에서). 기록은 지우지 않는다.
 * 끝내면 웨이트 · 투구 계획 · 암케어가 모두 평소대로 돌아간다.
 */
export async function endRehab(reason: 'done' | 'stopped'): Promise<Result> {
  const user = await requireUser();
  if (!REHAB_ENABLED) return { error: OFF };

  const active = await loadActiveRehab(user.id);
  if (!active) return { error: NOT_ACTIVE };
  if (reason !== 'done' && reason !== 'stopped') return { error: '잘못된 요청입니다.' };
  if (reason === 'done' && active.program.stage !== 4) {
    return {
      error: '재활은 4단계에서 끝낼 수 있어요. 그만두려면 [그만두기]를 눌러 주세요.',
    };
  }
  await prisma.userRehabProgram.update({
    where: { id: active.id },
    data: { endedAt: new Date(), endReason: reason },
  });
  refresh();
  return { ok: true };
}
