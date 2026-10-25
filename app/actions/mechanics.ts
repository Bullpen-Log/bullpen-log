'use server';

import { appNow } from '@/lib/clock';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  newProgression,
  skillStage,
  skillFeedback,
  saveNextDay,
  advanceSkill,
  skillPainToday,
  skillFinished,
  type SkillEvidence,
} from '@/lib/mechanics/progression';
import { DRILL_EQUIPMENT } from '@/lib/exercise-meta';
import { REPORT_CRITERIA } from '@/lib/pitch-3d/v2/report-policy';
import { groupDrills } from '@/lib/mechanics/drills';
import { effortFields } from '@/lib/pitch-effort';
import { withMechanicsTransaction, mechanicsPlanKey } from '@/lib/mechanics/store';
import { requireUser } from '@/lib/dal';
import { visibleGuides, trainingGuides } from '@/lib/library-cache';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate } from '@/lib/nutrition/days';
import { isLevelKey } from '@/lib/mechanics/levels';
import { loadCurrentMechanicsFold, loadMechanicsEquipment, loadMechanicsProgram } from '@/lib/mechanics/load';
import { loadFocusOffer } from '@/lib/mechanics/focus-load';
import {
  countFeel,
  canUseVariant,
  focusWeek,
  focusActive,
  assessMechanicsSession,
  rxWeek,
  finishState,
  freshState,
  isElementName,
  isFeel,
  isFilmVerdict,
  isThrowingDrill,
  isArmLoaded,
  levelAdvice,
  programStateJson,
  readProgramState,
  withFilm,
  withThrowLog,
  practiceInput,
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
  return withMechanicsTransaction(user.id, async (prisma) => {
    if (!isLevelKey(level)) return { error: '알 수 없는 수준이에요.' };
    const prev = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
      select: { progress: true },
    });
    const prevState = prev ? readProgramState(prev.progress) : null;
    const progress = asJson(
      programStateJson({
        ...freshState(level),
        ...(prevState?.gear ? { gear: prevState.gear } : {}),
        films: prevState?.films ?? [],
        practice: prevState?.practice ?? [],
        /* 오늘 드릴로 던진 공 알림도 지킨다 — 같은 날 수준을 바꿔도 남길 공은 그대로 */
        throwLog: prevState?.throwLog ?? null,
        /* 3D 리포트 처방도 지킨다 — 처방은 수준 세션의 드릴 칸만 바꾸는 것이라 수준을 바꿔도 이어 간다 */
        focus: prevState?.focus ?? null,
      })
    );
    const focus = prevState?.focus?.reportId ?? null;
    await prisma.mechanicsProgram.upsert({
      where: { userId: user.id },
      create: { userId: user.id, focus, progress },
      update: { focus, progress },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}

/**
 * 3D 리포트 처방 시작(docs/designs/pitch-3d-report.md 6-4절) — 리포트의 처방 한 장들을 그대로 베껴 progress.focus 에, 리포트 번호는
 * MechanicsProgram.focus 칼럼에(DB 구조 그대로). 처방은 지금 수준 세션의 드릴 칸을 바꾸는 것이라 수준이 있어야 한다 — 아직 안 골랐으면
 * 확인 시트가 함께 고른 수준(level)으로 시작한다. 진행 중인 다른 처방은 새 처방으로 바뀐다(시트가 먼저 묻는다).
 */
export async function startMechanicsFocus(input: { reportId: string; level?: string | null }): Promise<Result> {
  const user = await requireUser();
  const offer = await loadFocusOffer(user, input?.reportId);
  if ('error' in offer) return offer;
  return withMechanicsTransaction(user.id, async (prisma) => {
    const prev = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
      select: { progress: true },
    });
    const prevState = prev ? readProgramState(prev.progress) : null;
    const level = prevState?.level ?? (isLevelKey(input.level) ? input.level : null);
    if (!level) return { error: '수준을 먼저 골라 주세요.' };
    const base = prevState?.level
      ? prevState
      : {
          ...freshState(level),
          films: prevState?.films ?? [],
          throwLog: prevState?.throwLog ?? null,
        };
    const progress = asJson(
      programStateJson({
        ...base,
        attempt: null,
        focus: {
          progression: newProgression(randomUUID(), offer.rx),
          criteria: offer.criteria,
          reportId: offer.reportId,
          jobId: offer.jobId,
          rx: offer.rx,
          startedOn: toDateKey(appNow()),
          done: 0,
        },
      })
    );
    await prisma.mechanicsProgram.upsert({
      where: { userId: user.id },
      create: { userId: user.id, focus: offer.reportId, progress },
      update: { focus: offer.reportId, progress },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}

/**
 * 처방 확인 시트(앱 native/src/app/training-mechanics.tsx ?focus=)가 읽는다 — 웹은 mechanics-section.tsx 가 서버에서 같은 loadFocusOffer 를 부른다.
 * 시트에 그릴 요소 · 집중/보조만 내준다(드릴은 시작할 때 서버가 다시 셈해 베낀다).
 */
export async function loadMechanicsFocusOffer(
  reportId: string
): Promise<{ reportId: string; rx: { element: string; level: 'improve' | 'edge' }[] } | { error: string }> {
  const user = await requireUser();
  const offer = await loadFocusOffer(user, reportId);
  if ('error' in offer) return offer;
  return { reportId: offer.reportId, rx: offer.rx.map((r) => ({ element: r.element, level: r.level })) };
}

/** 처방 끝내기 — 처방 카드를 걷고 지금 수준 세션으로 돌아간다(마친 처방 · 그만두기). 수준 진행은 그대로 */
export async function endMechanicsFocus(): Promise<Result> {
  const user = await requireUser();
  return withMechanicsTransaction(user.id, async (prisma) => {
    const program = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
      select: { progress: true },
    });
    if (!program) return { ok: true };
    const state = readProgramState(program.progress);
    await prisma.mechanicsProgram.update({
      where: { userId: user.id },
      data: {
        focus: null,
        progress: asJson(programStateJson({ ...state, focus: null, attempt: null })),
      },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}

/**
 * 찍어서 처음과 견준 결과를 남긴다 — 지금까지 마친 세션 번호(sessionsDone)에 붙여서. 같은 번호면 바꾼다.
 * 세션 끝 화면과 프로그램 칸의 단추(app/(app)/training/film-verdict.tsx)가 부른다.
 */
export async function recordMechanicsFilm(
  verdict: string,
  feedback?: { comparable?: boolean; transferred?: boolean; response?: string }
): Promise<{ ok: true; note: FilmNote } | { error: string }> {
  const user = await requireUser();
  return withMechanicsTransaction(user.id, async (prisma) => {
    if (!isFilmVerdict(verdict)) return { error: '알 수 없는 값이에요.' };
    const program = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
    });
    if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };
    if (program.sessionsDone <= 0) return { error: '세션을 먼저 마쳐 주세요.' };
    const state = readProgramState(program.progress);
    const note: FilmNote = {
      session: program.sessionsDone,
      on: toDateKey(appNow()),
      verdict,
      level: state.level,
      comparable: feedback?.comparable === true,
      transferred: feedback?.transferred === true,
      response: feedback?.response === 'clear' || feedback?.response === 'pain' ? feedback.response : 'unknown',
    };
    await prisma.mechanicsProgram.update({
      where: { userId: user.id },
      data: {
        progress: asJson(programStateJson({ ...state, films: withFilm(state.films, note) })),
      },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true, note };
  });
}

/** 처음부터 — 프로그램을 지운다(수준 고르기로 돌아간다). 지난 '했다' 기록(UserDrillLog)은 남는다 */
export async function resetMechanicsProgram(): Promise<Result> {
  const user = await requireUser();
  return withMechanicsTransaction(user.id, async (prisma) => {
    await prisma.mechanicsProgram.deleteMany({ where: { userId: user.id } });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
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
  practice?: unknown;
  attemptId?: string;
  requestId?: string;
  skill?: unknown;
}): Promise<{ ok: true; stopReason?: string } | { error: string }> {
  const user = await requireUser();
  const current = await loadMechanicsProgram(user.id);
  const { guideId, element, feel } = input;
  if (!isElementName(element) || !isFeel(feel)) return { error: '알 수 없는 값이에요.' };
  const guide = (await visibleGuides()).find((g) => g.id === guideId);
  if (!guide) return { error: '드릴을 찾을 수 없어요.' };
  const actual = practiceInput(input.practice, guide.category);
  if (!actual)
    return {
      error: '앱을 다시 켜서 업데이트한 뒤, 실제 횟수·체감 강도·통증 여부를 적어 주세요.',
    };
  if ((actual.reps ?? actual.throws) === 0) return { error: '수행한 횟수가 1회 이상일 때 드릴을 완료할 수 있어요.' };
  if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 100)
    return { error: '앱을 업데이트한 뒤 세션을 다시 열어 주세요.' };
  const requestId = input.requestId;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([guideId, element, feel, actual, input.skill ?? null]))
    .digest('hex');
  return withMechanicsTransaction(user.id, async (prisma) => {
    const program = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
    });
    if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };

    const today = toDateKey(appNow());
    const date = dbDate(today);
    const read = readProgramState(program.progress);
    const attempt = read.attempt;
    const receipt = attempt && attempt.id === input.attemptId ? attempt.receipts?.find((r) => r.id === requestId) : null;
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) return { error: '수행 입력이 바뀌었어요. 다시 입력해 주세요.' };
      const stopped = (await loadCurrentMechanicsFold(user.id, prisma)) ?? current.painFold;
      return stopped && isArmLoaded(guide.category) ? { ok: true, stopReason: stopped.reason } : { ok: true };
    }
    if (
      !input.attemptId ||
      !attempt ||
      attempt.requirementsVersion !== 1 ||
      attempt.id !== input.attemptId ||
      attempt.on !== today ||
      attempt.completed ||
      attempt.planKey !== mechanicsPlanKey(program.id, program.sessionsDone, read)
    )
      return {
        error: '세션을 다시 열어 주세요. 이전 화면에서는 새 기록을 저장할 수 없어요.',
      };
    const assigned = attempt.items.find((item) => item.alternatives.some((a) => a.variants.some((v) => v.id === guideId)));
    const feedback = skillFeedback(input.skill);
    if (assigned?.skill && !feedback) return { error: '동작 목표와 실제 투구 전이를 자가 확인해 주세요.' };
    const equipment = await loadMechanicsEquipment(user.id, prisma, read);
    if (!canUseVariant(guide, equipment)) return { error: '이 드릴의 사용 장비가 바뀌었어요. 장비를 확인한 뒤 다시 열어 주세요.' };
    if (!assigned) return { error: '이 세션에 배정된 드릴을 선택해 주세요.' };
    const restriction = (await loadCurrentMechanicsFold(user.id, prisma)) ?? current.painFold;
    if (isArmLoaded(guide.category)) {
      if (restriction) return { error: restriction.reason };
      if (
        read.practice?.some((p) => p.on === today && p.response === 'pain') ||
        (read.attempt?.on === today && !!read.attempt.painGuideIds?.length) ||
        skillPainToday(read.focus?.progression, today)
      )
        return {
          error: '오늘 드릴 중 통증을 기록했어요. 팔에 부하를 주는 드릴은 쉬어요.',
        };
    }
    /*
     * 그날 처음 스로잉 드릴을 했으면 그때 투구 기록의 합을 기억한다 — 그 뒤 합이 늘면 드릴로 던진 공을 남긴 것으로 본다(drillThrowNote).
     * 아침에 불펜을 미리 적어 둔 날도 알림이 뜨게, 시각이 아니라 합으로 견준다(PitchLog 에 고친 시각이 없다).
     */
    const state =
      isThrowingDrill(guide.category) && read.throwLog?.on !== today
        ? withThrowLog(
            read,
            today,
            (
              await prisma.pitchLog.aggregate({
                where: { userId: user.id, date },
                _sum: { pitchCount: true },
              })
            )._sum.pitchCount ?? 0
          )
        : read;
    const practice = actual
      ? [
          ...(state.practice ?? []).filter((p) => !(p.on === today && p.guideId === guideId)).slice(-89),
          { ...actual, recorded: true, guideId, on: today },
        ]
      : state.practice;
    const next = {
      ...state,
      practice,
      attempt: {
        ...attempt,
        ...(assigned?.skill && feedback
          ? {
              skillFeedback: {
                ...attempt.skillFeedback,
                [guideId]: { ...feedback, quality: feel === 'hard' ? ('no' as const) : feedback.quality },
              },
            }
          : {}),
        painGuideIds: [...new Set([...(attempt.painGuideIds ?? []), ...(actual?.response === 'pain' ? [guideId] : [])])],
        doneIds: [...new Set([...attempt.doneIds, guideId])],
        receipts: [...(attempt.receipts ?? []), { id: requestId, fingerprint }],
      },
      feels: countFeel(state.feels, element, feel, today),
    };
    // 날짜·드릴의 합계 하나. 재시도해도 새 투구 기록이 생기지 않는다.
    const hash = createHash('sha256').update(`mechanics:${user.id}:${today}:${guideId}`).digest('hex').slice(0, 32);
    const variant = (8 + (Number.parseInt(hash[16], 16) % 4)).toString(16);
    const pitchId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20)}`;
    const pitching: Prisma.PrismaPromise<unknown>[] =
      isThrowingDrill(guide.category) && actual && !actual.alreadyLogged && actual.throws > 0
        ? [
            prisma.pitchLog.upsert({
              where: { id: pitchId },
              create: {
                id: pitchId,
                userId: user.id,
                date,
                sessionType: '캐치볼',
                pitchCount: actual.throws,
                ...effortFields(actual.effortPct),
                memo: `메커니즘 드릴 · ${guide.title} · 오늘 합계`,
                videoPaths: [],
              },
              update: { pitchCount: actual.throws, ...effortFields(actual.effortPct) },
            }),
          ]
        : isThrowingDrill(guide.category) && actual
          ? [prisma.pitchLog.deleteMany({ where: { id: pitchId, userId: user.id } })]
          : [];
    await Promise.all([
      ...pitching,
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
    const stopped = await loadCurrentMechanicsFold(user.id, prisma);
    return stopped && isArmLoaded(guide.category) ? { ok: true, stopReason: stopped.reason } : { ok: true };
  });
}

/**
 * 세션을 마쳤다 — 이 수준의 다음 세션으로(12번째 다음은 '다 마침'). 권할 것이 있으면 돌려준다(끝 화면이 단추와 함께 보인다).
 *
 * partial(2판 P6-5, D5): 어깨 · 팔꿈치 통증으로 던지기 · 메디신볼 드릴을 접고 무브먼트만 하고 마쳤다 — 진행 · 세션 수 ·
 * 마친 날을 그대로 둔다(finishState). 접은 드릴이 든 이 세션은 아프지 않은 날 이어서 한다(올리면 그 드릴을 영영 건너뛴다).
 * 시작 때 서버가 저장한 배정과 이 세션의 수행 기록으로 완료를 판단한다. partial은 옛 화면 호환 입력이며 완료 판정에 쓰지 않는다.
 */
export async function finishMechanicsSession(opts?: {
  partial?: boolean;
  /** 마치는 세션의 차례(sessionsDone + 1, 화면이 열 때 받은 값) — 응답이 끊겨 '다시 저장'을 눌러도 한 번만 센다 */
  session?: number;
  attemptId?: string;
}): Promise<
  | {
      ok: true;
      status: 'completed' | 'partial';
      message: string | null;
      advice: ReturnType<typeof levelAdvice>;
      throwNote: DrillThrowNote | null;
    }
  | { error: string }
> {
  const user = await requireUser();
  const current = await loadMechanicsProgram(user.id);
  return withMechanicsTransaction(user.id, async (prisma) => {
    const program = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
    });
    if (!program) return { error: '프로그램을 먼저 시작해 주세요.' };
    const state = readProgramState(program.progress);
    if (!state.level) return { error: '수준을 먼저 골라 주세요.' };
    const attempt = state.attempt;
    if (
      !opts?.attemptId ||
      !attempt ||
      attempt.requirementsVersion !== 1 ||
      attempt.id !== opts.attemptId ||
      opts.session !== attempt.session
    )
      return { error: '세션을 다시 열어 주세요. 세션 정보가 바뀌었어요.' };
    // 완료 응답이 유실된 재시도는 날짜·부하가 바뀌어도 같은 완료로 돌려준다.
    if (attempt.completed)
      return {
        ok: true,
        status: 'completed',
        message: null,
        advice: levelAdvice(state),
        throwNote: null,
      };
    if (attempt.on !== toDateKey(appNow()) || attempt.planKey !== mechanicsPlanKey(program.id, program.sessionsDone, state))
      return { error: '날짜나 프로그램이 바뀌었어요. 세션을 다시 열어 주세요.' };
    const requiredItems = attempt.items.filter((item) => item.required !== false);
    const complete =
      requiredItems.length > 0 &&
      requiredItems.every((item) => item.alternatives.some((a) => a.variants.some((v) => attempt.doneIds.includes(v.id))));
    const throwNote = current.throwNote;
    if (!complete) {
      revalidatePath(PROGRAM_PATH);
      return {
        ok: true,
        status: 'partial',
        message: '수행한 드릴은 저장했어요. 남은 드릴이 있어 세션 진행은 유지해요.',
        advice: null,
        throwNote,
      };
    }
    let completedState = finishState(state, false);
    if (completedState.focus?.progression && state.focus && focusActive(state.focus)) {
      const progression = completedState.focus.progression;
      const evidence: SkillEvidence[] = state.focus!.rx.flatMap((r) => {
        const required = attempt.items.filter((i) => i.required !== false && i.skill?.fault === r.fault);
        if (!required.length) return [];
        const ids = required
          .flatMap((i) => i.alternatives.flatMap((a) => a.variants.map((v) => v.id)))
          .filter((id) => attempt.doneIds.includes(id));
        const feedback = ids.map((id) => skillFeedback(attempt.skillFeedback?.[id]));
        const quality = feedback.every((f) => f?.quality === 'yes') ? 'yes' : feedback.some((f) => f?.quality === 'no') ? 'no' : 'unknown';
        const transferred = feedback.every((f) => f?.transferred === 'yes')
          ? 'yes'
          : feedback.some((f) => f?.transferred === 'no')
            ? 'no'
            : 'unknown';
        return [
          {
            id: `${attempt.id}:${r.fault}`,
            fault: r.fault,
            stage: skillStage(progression, r.fault),
            on: attempt.on,
            quality,
            transferred,
            during:
              ids.some((id) => attempt.painGuideIds?.includes(id)) ||
              state.practice?.some((p) => p.on === attempt.on && ids.includes(p.guideId) && p.response === 'pain')
                ? 'pain'
                : 'clear',
            nextDay: 'unknown',
            responseOn: null,
            source: 'self',
          },
        ];
      });
      completedState = {
        ...completedState,
        focus: { ...completedState.focus, progression: { ...progression, evidence: [...progression.evidence, ...evidence] } },
      };
    }
    const next = {
      ...completedState,
      attempt: { ...attempt, completed: true },
    };
    await prisma.mechanicsProgram.update({
      where: { userId: user.id },
      data: {
        progress: asJson(programStateJson(next)),
        sessionsDone: { increment: 1 },
        lastSessionOn: dbDate(toDateKey(appNow())),
      },
    });
    revalidatePath(PROGRAM_PATH);
    return {
      ok: true,
      status: 'completed',
      message:
        next.focus?.progression && state.focus && focusActive(state.focus)
          ? '필수 드릴 수행을 저장했어요. 다음 날 반응을 확인한 뒤 단계 진행을 선택해 주세요.'
          : null,
      advice: levelAdvice(next),
      throwNote,
    };
  });
}

/**
 * '드릴로 공 N회 던졌어요' 카드를 그날 닫는다 — '이미 넣었어요 · 안 적을래요'(2026-10-16). 투구 기록에 남기면 저절로 사라지니
 * 이것은 남기지 않을 때 · 다른 길로 이미 남겼을 때만.
 */
export async function closeDrillThrowNote(): Promise<Result> {
  const user = await requireUser();
  return withMechanicsTransaction(user.id, async (prisma) => {
    const program = await prisma.mechanicsProgram.findUnique({
      where: { userId: user.id },
    });
    if (!program) return { ok: true };
    const state = readProgramState(program.progress);
    if (!state.throwLog || state.throwLog.on !== toDateKey(appNow())) return { ok: true };
    await prisma.mechanicsProgram.update({
      where: { userId: user.id },
      data: {
        progress: asJson(programStateJson({ ...state, throwLog: { ...state.throwLog, closed: true } })),
      },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}

/** 메커니즘에서 오늘 확인한 장비만 저장한다. 다른 운동의 장비 설정은 덮어쓰지 않는다. */
export async function saveMechanicsEquipment(values: string[]): Promise<Result> {
  const user = await requireUser();
  if (!Array.isArray(values) || values.some((v) => !(DRILL_EQUIPMENT as readonly string[]).includes(v)))
    return { error: '알 수 없는 장비예요.' };
  return withMechanicsTransaction(user.id, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId: user.id } });
    if (!row) return { error: '프로그램을 먼저 시작해 주세요.' };
    const state = readProgramState(row.progress);
    await tx.mechanicsProgram.update({
      where: { userId: user.id },
      data: { progress: asJson(programStateJson({ ...state, gear: { on: toDateKey(appNow()), equipment: [...new Set(values)] } })) },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}
export async function convertMechanicsFocus(input: { reportId: string; mode: 'basic' | 'review' }): Promise<Result> {
  const user = await requireUser();
  return withMechanicsTransaction(user.id, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId: user.id } });
    if (!row) return { error: '처방을 먼저 시작해 주세요.' };
    const state = readProgramState(row.progress),
      focus = state.focus;
    if (!focus || focus.reportId !== input.reportId || focus.criteria !== REPORT_CRITERIA)
      return { error: '현재 기준의 리포트를 확인한 뒤 처방을 시작해 주세요.' };
    if (focus.progression) return { ok: true };
    if (input.mode !== 'basic' && input.mode !== 'review') return { error: '시작 단계를 확인해 주세요.' };
    const stages = focus.rx.map((r) => ({ fault: r.fault, stage: rxWeek(r, focusWeek(focus.done))?.stage ?? ('기초' as const) }));
    const progression = newProgression(randomUUID(), focus.rx, (r) =>
      input.mode === 'review' ? stages.find((s) => s.fault === r.fault)!.stage : '기초'
    );
    progression.previous = { done: focus.done, stages };
    await tx.mechanicsProgram.update({
      where: { userId: user.id },
      data: { progress: asJson(programStateJson({ ...state, attempt: null, focus: { ...focus, progression } })) },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}
export async function recordMechanicsNextDay(input: { runId: string; evidenceId: string; response: string }): Promise<Result> {
  const user = await requireUser();
  return withMechanicsTransaction(user.id, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId: user.id } });
    if (!row) return { error: '처방을 찾을 수 없어요.' };
    const state = readProgramState(row.progress),
      focus = state.focus;
    if (!focus?.progression || focus.progression.id !== input.runId) return { error: '처방이 바뀌었어요. 다시 불러와 주세요.' };
    const progression = saveNextDay(focus.progression, input.evidenceId, input.response, toDateKey(appNow()));
    if ('error' in progression) return progression;
    await tx.mechanicsProgram.update({
      where: { userId: user.id },
      data: { progress: asJson(programStateJson({ ...state, focus: { ...focus, progression } })) },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}
export async function advanceMechanicsStage(input: {
  runId: string;
  fault: string;
  from: string;
  evidenceId: string;
  requestId: string;
}): Promise<Result> {
  const user = await requireUser();
  const current = await loadMechanicsProgram(user.id);
  const library = groupDrills(await trainingGuides());
  return withMechanicsTransaction(user.id, async (tx) => {
    const row = await tx.mechanicsProgram.findUnique({ where: { userId: user.id } });
    if (!row) return { error: '처방을 찾을 수 없어요.' };
    const state = readProgramState(row.progress),
      focus = state.focus;
    if (!focus?.progression || focus.progression.id !== input.runId) return { error: '처방이 바뀌었어요. 다시 불러와 주세요.' };
    if (!input.requestId || input.requestId.length > 200) return { error: '단계 전환 정보를 확인해 주세요.' };
    const replay = focus.progression.moves.some((m) => m.id === input.requestId);
    if (!replay) {
      const blocked = (await loadCurrentMechanicsFold(user.id, tx)) ?? current.painFold;
      if (blocked) return { error: blocked.reason };
      if (skillPainToday(focus.progression, toDateKey(appNow()))) return { error: '오늘 통증 반응을 남겨 단계 진행을 보류해요.' };
      if (state.attempt && !state.attempt.completed && state.attempt.on === toDateKey(appNow()) && state.attempt.doneIds.length)
        return { error: '진행 중인 세션을 먼저 마쳐 주세요.' };
    }
    const progression = advanceSkill(focus.progression, input.fault, input.from, input.evidenceId, input.requestId, toDateKey(appNow()));
    if ('error' in progression) return progression;
    if (!replay && !skillFinished(progression)) {
      const equipment = await loadMechanicsEquipment(user.id, tx, state);
      const nextSession = assessMechanicsSession({
        drills: library,
        state: { ...state, focus: { ...focus, progression } },
        owned: equipment,
      });
      if (nextSession.missing.length) return { error: '다음 단계의 필수 드릴과 장비를 확인한 뒤 전환해 주세요.' };
    }
    await tx.mechanicsProgram.update({
      where: { userId: user.id },
      data: { progress: asJson(programStateJson({ ...state, attempt: replay ? state.attempt : null, focus: { ...focus, progression } })) },
    });
    revalidatePath(PROGRAM_PATH);
    return { ok: true };
  });
}
