'use server';

import { appNow } from '@/lib/clock';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { visibleGuides } from '@/lib/library-cache';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { isLevelKey } from '@/lib/mechanics/levels';
import { loadDrillThrowNote } from '@/lib/mechanics/load';
import {
  countFeel,
  finishState,
  freshState,
  isElementName,
  isFeel,
  isFilmVerdict,
  isThrowingDrill,
  levelAdvice,
  programStateJson,
  readProgramState,
  withFilm,
  withThrowLog,
  type DrillThrowNote,
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
  const prevState = prev ? readProgramState(prev.progress) : null;
  const progress = asJson(
    programStateJson({
      ...freshState(level),
      films: prevState?.films ?? [],
      /* 오늘 드릴로 던진 공 알림도 지킨다 — 같은 날 수준을 바꿔도 남길 공은 그대로 */
      throwLog: prevState?.throwLog ?? null,
    })
  );
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
  const note: FilmNote = { session: program.sessionsDone, on: toDateKey(appNow()), verdict };
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
  const guide = (await visibleGuides()).find((g) => g.id === guideId);
  if (!guide) return { error: '드릴을 찾을 수 없어요.' };
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };

  const today = toDateKey(appNow());
  const date = dbDate(today);
  const read = readProgramState(program.progress);
  /*
   * 그날 처음 스로잉 드릴을 했으면 그때 투구 기록의 합을 기억한다 — 그 뒤 합이 늘면 드릴로 던진 공을 남긴 것으로 본다(drillThrowNote).
   * 아침에 불펜을 미리 적어 둔 날도 알림이 뜨게, 시각이 아니라 합으로 견준다(PitchLog 에 고친 시각이 없다).
   */
  const state =
    isThrowingDrill(guide.category) && read.throwLog?.on !== today
      ? withThrowLog(
          read,
          today,
          (await prisma.pitchLog.aggregate({ where: { userId: user.id, date }, _sum: { pitchCount: true } }))._sum
            .pitchCount ?? 0
        )
      : read;
  const next = { ...state, feels: countFeel(state.feels, element, feel, today) };
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
 *
 * partial(2판 P6-5, D5): 어깨 · 팔꿈치 통증으로 던지기 · 메디신볼 드릴을 접고 무브먼트만 하고 마쳤다 — 진행 · 세션 수 ·
 * 마친 날을 그대로 둔다(finishState). 접은 드릴이 든 이 세션은 아프지 않은 날 이어서 한다(올리면 그 드릴을 영영 건너뛴다).
 * 화면만 새로 그려 한 드릴의 체크가 보이게 한다. 자기 진도라 보내온 값을 그대로 믿는다.
 */
export async function finishMechanicsSession(opts?: {
  partial?: boolean;
}): Promise<
  | { ok: true; advice: ReturnType<typeof levelAdvice>; throwNote: DrillThrowNote | null }
  | { error: string }
> {
  const user = await requireUser();
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };
  const state = readProgramState(program.progress);
  if (!state.level) return { error: '수준을 먼저 골라 주세요.' };
  /* 끝 화면의 '드릴로 공 N회 던졌어요' 카드(2026-10-16) */
  const throwNote = await loadDrillThrowNote(user.id, state, toDateKey(appNow()));
  if (opts?.partial === true) {
    revalidatePath(PROGRAM_PATH);
    return { ok: true, advice: null, throwNote };
  }
  const next = finishState(state, false);
  await prisma.mechanicsProgram.update({
    where: { userId: user.id },
    data: {
      progress: asJson(programStateJson(next)),
      sessionsDone: { increment: 1 },
      lastSessionOn: dbDate(toDateKey(appNow())),
    },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true, advice: levelAdvice(next), throwNote };
}

/**
 * '드릴로 공 N회 던졌어요' 카드를 그날 닫는다 — '이미 넣었어요 · 안 적을래요'(2026-10-16). 투구 기록에 남기면 저절로 사라지니
 * 이것은 남기지 않을 때 · 다른 길로 이미 남겼을 때만.
 */
export async function closeDrillThrowNote(): Promise<Result> {
  const user = await requireUser();
  const program = await prisma.mechanicsProgram.findUnique({ where: { userId: user.id } });
  if (!program) return { ok: true };
  const state = readProgramState(program.progress);
  if (!state.throwLog || state.throwLog.on !== toDateKey(appNow())) return { ok: true };
  await prisma.mechanicsProgram.update({
    where: { userId: user.id },
    data: { progress: asJson(programStateJson({ ...state, throwLog: { ...state.throwLog, closed: true } })) },
  });
  revalidatePath(PROGRAM_PATH);
  return { ok: true };
}
