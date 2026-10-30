import 'server-only';
import type { Prisma } from '@prisma/client';
import { appNow } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { advanceProgramDay } from '@/lib/program/advance';
import {
  dayLabel,
  isOptionalProgramExercise,
  parseProgram,
  setsNeeded,
  type SessionProgramTag,
} from '@/lib/program/program';
import {
  finishNoteOf,
  noteStateOf,
  programStateOf,
  type FinishNote,
  type NoteOutcome,
  type ProgramOutcome,
} from '@/lib/workout/finish-state';

/**
 * 운동 종료의 세 결과 — 판 닫기 · 프로그램 일차 · 그날 강도 · 메모(2026-10-30 확정 시안 08 · 09, 상세 프롬프트 13-A).
 *
 * 예전 finishWorkout 은 판을 닫는 쓰기(조건부)를 마친 뒤 일차 넘기기와 강도 저장을 따로 불렀고, 강도 저장의 오류는 보지 않았다.
 * 그래서 종료만 되고 뒤의 둘이 실패해도 축하 화면은 '절반이 안 돼 다시 해요'(일차가 안 넘어갔으니)처럼 읽혔고, 이미 닫힌 판을 다시
 * 누르면 바로 넘어가 뒤의 둘을 다시 해 볼 길도 없었다.
 *
 * 이제:
 *   - 마칠 때 고른 강도 · 메모를 판 줄(plan JSON 의 finishNote)에 닫기와 같은 쓰기로 남긴다 — 응답을 못 받아도 무엇을 제출했는지 남는다.
 *   - 일차 · 강도는 이 파일의 recoverFollowUps 가 몇 번을 불러도 한 번만 반영한다(일차는 조건부 +1, 강도는 제출값과 저장값을 견줘서).
 *   - 결과는 셋을 따로 읽는다(finishReceipt) — '기준 미달'과 '아직 처리 안 됨(복구 가능)'을 가른다.
 *
 * 읽기(finishReceipt)는 쓰지 않는다 — 완료 화면을 다시 열거나 요약만 다시 읽어도 진도 · 강도가 바뀌지 않게. 복구 쓰기는 사람이 누를 때(recoverFinish)
 * 와 종료 직후뿐이다.
 */

/** 강도 · 메모를 고칠 수 있는 날 — app/actions/exercise-log.ts 의 BACKFILL_DAYS 와 같다 */
const NOTE_BACKFILL_DAYS = 7;
const MEMO_MAX = 1000;

type SessionRow = {
  id: string;
  userId: string;
  date: Date;
  status: string;
  plan: Prisma.JsonValue;
};

export type FinishReceipt = {
  sessionId: string;
  status: 'FINISHED';
  program: ProgramOutcome;
  note: NoteOutcome;
};

export { finishNoteOf, type FinishNote, type NoteOutcome, type ProgramOutcome };

/** 이 판의 프로그램 회차 — 회차 번호가 있으면 그 줄, 없으면(옛 판) 같은 키의 가장 최근 줄 */
async function programRowOf(userId: string, tag: SessionProgramTag, statuses: string[]) {
  return prisma.userTrainingProgram.findFirst({
    where: tag.rowId
      ? { id: tag.rowId, userId, status: { in: statuses } }
      : { userId, programKey: tag.key, status: { in: statuses } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, nextDay: true, status: true },
  });
}

/** 처방 세트 · 남긴 세트 — lib/program/advance.ts 와 같은 셈(선택 운동은 안 센다) */
async function programCounts(sessionId: string, plan: NonNullable<ReturnType<typeof readFrozenPlan>>) {
  const slotted = plan.exercises.filter((e) => e.programSlot && !isOptionalProgramExercise(e));
  const planned = slotted.reduce((n, e) => n + (e.plannedSets ?? 0), 0);
  const logged = await prisma.userExerciseSet.count({
    where: { sessionId, exerciseId: { in: slotted.map((e) => e.id) } },
  });
  return { planned, logged, needed: setsNeeded(planned) };
}

export async function programOutcomeOf(session: SessionRow): Promise<ProgramOutcome> {
  const plan = readFrozenPlan(session.plan);
  const tag = plan?.program ?? null;
  if (!plan || !tag) return { state: 'none' };
  const pp = parseProgram(tag.key);
  if (!pp) return { state: 'unknown', day: tag.day, label: `${tag.day}번 세션`, nextLabel: null, planned: 0, logged: 0, needed: 0, name: '' };
  const [counts, row] = await Promise.all([
    programCounts(session.id, plan),
    programRowOf(session.userId, tag, ['active', 'done', 'stopped']),
  ]);
  return programStateOf({
    day: tag.day,
    totalDays: pp.totalDays,
    label: dayLabel(pp, tag.day),
    nextLabel: tag.day < pp.totalDays ? dayLabel(pp, tag.day + 1) : null,
    name: pp.def.name,
    ...counts,
    row: row ? { nextDay: row.nextDay, status: row.status } : null,
    sessionStatus: session.status,
  });
}

async function dailyNoteOf(userId: string, date: Date) {
  return prisma.dailyTrainingNote.findUnique({
    where: { userId_date: { userId, date: new Date(`${toDateKey(date)}T00:00:00.000Z`) } },
    select: { intensity: true, memo: true, updatedAt: true },
  });
}

export async function noteOutcomeOf(session: SessionRow): Promise<NoteOutcome> {
  const saved = await dailyNoteOf(session.userId, session.date);
  return noteStateOf(finishNoteOf(session.plan), saved);
}

/** 세 결과를 읽기만 한다 */
export async function finishReceipt(session: SessionRow): Promise<FinishReceipt> {
  const [program, note] = await Promise.all([programOutcomeOf(session), noteOutcomeOf(session)]);
  return { sessionId: session.id, status: 'FINISHED', program, note };
}

/**
 * 그날 강도 · 메모를 쓴다 — 메모가 비면 있던 메모를 지우지 않는다(빈 메모로 덮지 않기). 날짜 범위는 saveTrainingNote 와 같다.
 * 부른 쪽이 사람(userId)을 이미 확인했다 — 이 함수는 'use server' 파일 밖에 있어 앱에서 직접 부를 수 없다.
 */
export async function writeDailyNote(
  userId: string,
  dateKey: string,
  intensity: number,
  memo: string | null
): Promise<{ ok: true; intensity: number; memo: string | null } | { error: string }> {
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > 10) {
    return { error: '운동 강도를 1~10 중에서 골라 주세요.' };
  }
  const todayKey = toDateKey(appNow());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey > todayKey) return { error: '날짜가 올바르지 않아요.' };
  if (dateKey < shiftDateKey(todayKey, -NOTE_BACKFILL_DAYS)) {
    return { error: `${NOTE_BACKFILL_DAYS}일이 지난 기록은 고칠 수 없어요.` };
  }
  const text = memo?.trim().slice(0, MEMO_MAX) || null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const row = await prisma.dailyTrainingNote.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, intensity, memo: text },
    update: { intensity, ...(text ? { memo: text } : {}) },
    select: { intensity: true, memo: true },
  });
  return { ok: true, intensity: row.intensity, memo: row.memo };
}

/**
 * 마친 판의 뒤처리를 다시 한다 — 일차 넘기기(조건부라 한 번만)와, 제출했는데 아직 안 남은 강도 · 메모. 몇 번을 불러도 결과가 같다.
 * 판을 다시 닫거나 운동 시간을 더하지 않는다.
 */
export async function recoverFollowUps(session: SessionRow): Promise<FinishReceipt> {
  if (session.status !== 'FINISHED') return finishReceipt(session);
  await advanceProgramDay(session.id).catch(() => false);
  const submitted = finishNoteOf(session.plan);
  if (submitted?.intensity != null) {
    const saved = await dailyNoteOf(session.userId, session.date);
    if (noteStateOf(submitted, saved).state === 'pending') {
      await writeDailyNote(session.userId, toDateKey(session.date), submitted.intensity, submitted.memo).catch(() => null);
    }
  }
  return finishReceipt(session);
}
