'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { visibleGuides } from '@/lib/library-cache';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { isLevelKey, SESSIONS_PER_LEVEL } from '@/lib/mechanics/levels';
import {
  countFeel,
  freshState,
  isElementName,
  isFeel,
  isFilmVerdict,
  levelAdvice,
  programStateJson,
  readProgramState,
  withFilm,
  type FilmNote,
} from '@/lib/mechanics/program';

/**
 * 투구 메커니즘 프로그램 — 수준 고르기(바꾸기) · 처음부터 · 드릴 느낌 · 세션 마치기.
 * 규칙은 lib/mechanics/program.ts · levels.ts, 표는 MechanicsProgram(한 사람에 하나). 고른 수준 · 몇 번째 세션 · 느낌은
 * progress(Json) 한 칸에 둔다(DB 구조는 그대로). '했다'는 UserDrillLog 에 남긴다.
 */

type Result = { ok: true } | { error: string };

const PROGRAM_PATH = '/training';

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * 수준을 고른다(처음 시작 · 바꾸기 · 한 번 더) — 그 수준의 1주차 1번째 세션부터, 느낌도 처음부터.
 * 지금까지 마친 세션 수(sessionsDone)와 찍어서 견준 결과(films)는 지킨다 — 세션 번호에 붙는 것이라 수준과 상관없다.
 */
export async function startMechanicsProgram(level: string): Promise<Result> {
  const user = await requireUser();
  if (!isLevelKey(level)) return { error: '알 수 없는 수준이에요.' };
  const prev = await prisma.mechanicsProgram.findUnique({
    where: { userId: user.id },
    select: { progress: true },
  });
  const films = prev ? readProgramState(prev.progress).films : [];
  const progress = asJson(programStateJson({ ...freshState(level), films }));
  await prisma.mechanicsProgram.upsert({
    where: { userId: user.id },
    create: { userId: user.id, focus: null, progress },
    update: { focus: null, progress },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true };
}

/**
 * 찍어서 처음과 견준 결과를 남긴다 — 지금까지 마친 세션 번호(sessionsDone)에 붙여서. 같은 번호면 바꾼다.
 * 세션 끝 화면과 프로그램 칸의 단추(app/(app)/training/film-verdict.tsx)가 부른다.
 */
export async function recordMechanicsFilm(
  verdict: string
): Promise<{ ok: true; note: FilmNote } | { error: string }> {
  const user = await requireUser();
  if (!isFilmVerdict(verdict)) return { error: '알 수 없는 값이에요.' };
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };
  if (program.sessionsDone <= 0) return { error: '세션을 먼저 마쳐 주세요.' };
  const state = readProgramState(program.progress);
  const note: FilmNote = { session: program.sessionsDone, on: toDateKey(new Date()), verdict };
  await prisma.mechanicsProgram.update({
    where: { userId: user.id },
    data: { progress: asJson(programStateJson({ ...state, films: withFilm(state.films, note) })) },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true, note };
}

/** 처음부터 — 프로그램을 지운다(수준 고르기로 돌아간다). 지난 '했다' 기록(UserDrillLog)은 남는다 */
export async function resetMechanicsProgram(): Promise<Result> {
  const user = await requireUser();
  await prisma.mechanicsProgram.deleteMany({ where: { userId: user.id } });
  revalidatePath(PROGRAM_PATH);
  return { ok: true };
}

/**
 * 드릴 하나를 마치고 느낌을 남긴다 — 그 요소의 느낌을 세고(하루 한 번), 오늘 그 드릴을 '했다'로 적는다. 수준은 저절로
 * 바꾸지 않는다(권하기는 세션을 마칠 때).
 *
 * 화면을 다시 그리지 않는다(revalidatePath 없음) — 따라 하기 도중에 서버가 세션을 새로 짜면 하던 차례가 엉킨다. 세션을
 * 마칠 때(finishMechanicsSession) 한 번에 새로 그린다.
 */
export async function recordMechanicsDrill(input: {
  guideId: string;
  element: string;
  feel: string;
}): Promise<Result> {
  const user = await requireUser();
  const { guideId, element, feel } = input;
  if (!isElementName(element) || !isFeel(feel)) return { error: '알 수 없는 값이에요.' };
  if (!(await visibleGuides()).some((g) => g.id === guideId)) {
    return { error: '드릴을 찾을 수 없어요.' };
  }
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };

  const today = toDateKey(new Date());
  const state = readProgramState(program.progress);
  const next = { ...state, feels: countFeel(state.feels, element, feel, today) };
  const date = dbDate(today);
  await prisma.$transaction([
    prisma.mechanicsProgram.update({
      where: { userId: user.id },
      data: { progress: asJson(programStateJson(next)) },
    }),
    prisma.userDrillLog.upsert({
      where: { userId_guideId_date: { userId: user.id, guideId, date } },
      create: { userId: user.id, guideId, date, done: true },
      update: { done: true },
    }),
  ]);
  return { ok: true };
}

/**
 * 세션을 마쳤다 — 이 수준의 다음 세션으로(12번째 다음은 '다 마침'). 권할 것이 있으면 돌려준다(끝 화면이 단추와 함께 보인다).
 */
export async function finishMechanicsSession(): Promise<
  { ok: true; advice: ReturnType<typeof levelAdvice> } | { error: string }
> {
  const user = await requireUser();
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };
  const state = readProgramState(program.progress);
  if (!state.level) return { error: '수준을 먼저 골라 주세요.' };
  const next = { ...state, index: Math.min(state.index + 1, SESSIONS_PER_LEVEL) };
  await prisma.mechanicsProgram.update({
    where: { userId: user.id },
    data: {
      progress: asJson(programStateJson(next)),
      sessionsDone: { increment: 1 },
      lastSessionOn: dbDate(toDateKey(new Date())),
    },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true, advice: levelAdvice(next) };
}
