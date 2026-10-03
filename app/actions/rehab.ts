'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { ageFromBirthDate } from '@/lib/profile';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { visibleExercises } from '@/lib/library-cache';
import {
  REHAB_ENABLED,
  atLeastConditionSeverity,
  buildRehabSession,
  isRehabArea,
  isRehabCondition,
  judgeSession,
  judgeStageTest,
  normalizeRehabActivities,
  rehabSeverity,
  rehabStartBlock,
  rehabStatus,
  REHAB_CONDITIONS,
  sessionResultText,
  stageTestFor,
  startStage,
  type RehabFeel,
  type RehabLeftover,
  type RehabResult,
  type RehabStage,
  type StageTestInput,
} from '@/lib/armcare/rehab';
import {
  dayStart,
  loadActiveRehab,
  loadDoneOn,
  loadRehabRecords,
  toRehabLibrary,
} from '@/lib/armcare/rehab-store';

/**
 * 재활 프로그램 저장(재활 2편) — 시작 · 세션 3문항 · 단계 바꾸기 · 진단 받았어요 · 그만두기 · 끝내기.
 *
 * 규칙은 lib/armcare/rehab.ts 에 있고 화면도 같은 것을 본다. 여기서는 화면을 믿지 않고 한 번 더 따진다 — 나이로 막기,
 * 한 사람에 하나, 단계 시험 통과, 세션 판정. 매주 확인 저장은 ②번이다.
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

  const { sessions, checkins } = await loadRehabRecords(user.id, active.id, dateKey);
  const before = rehabStatus({
    program,
    sessions: sessions.filter((s) => s.date !== dateKey),
    checkins,
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
    const { sessions, checkins } = await loadRehabRecords(user.id, active.id, todayKey);
    const status = rehabStatus({ program, sessions, checkins, todayKey });
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
