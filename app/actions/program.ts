'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { toDateKey } from '@/lib/pitch-stats';
import { ageFromBirthDate, parseBirthDate } from '@/lib/profile';
import { pickMany } from '@/lib/exercise-meta';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { loadTodayCore } from '@/lib/report/today-data';
import { visibleExercises } from '@/lib/library-cache';
import {
  freezeProgramExercise,
  readFrozenPlan,
  type FrozenPlan,
} from '@/lib/workout/session-plan';
import { openSession } from '@/lib/workout/open-session';
import {
  PROGRAMS_ENABLED,
  VARIANT_KEYS,
  audienceOf,
  checkEligibility,
  parseProgram,
  pickPinned,
  programDef,
  readPinned,
  startProgramKey,
  usedVariants,
  variantCandidates,
  variantLabel,
  weekOfDay,
  type Pinned,
  type ProgramSeason,
  type VariantKey,
} from '@/lib/program/program';
import { activeProgram, buildProgramDay, hasFinishedBasics } from '@/lib/program/load';

/**
 * 근력 · 파워 프로그램의 저장 동작 — 시작 · 운동 시작 · 건너뛰기 · 그만두기 · 오늘 할래요 · 고정 운동 바꾸기.
 * 규칙은 lib/program/program.ts, 오늘 판정과 목록은 lib/program/load.ts 가 만든다. 일차 넘기기는 lib/program/advance.ts.
 * 오류 글은 해요체 한 줄(SafeForm · orOffline 이 화면에 그대로 보인다).
 */

type Result = { ok: true } | { error: string };

/* ─────────────────────────── 시작 ─────────────────────────── */

/**
 * 프로그램을 시작한다(§13-12). 시작 시트에서 받은 것(프로그램 · 주당 횟수 · 시즌 · 비어 있던 경력 · 생년월일 · 장비 · 고정 운동)을
 * [시작] 때 한꺼번에 저장한다 — 중간에 닫으면 프로필은 그대로다.
 */
export async function startProgram(input: {
  programId: string;
  perWeek: number;
  season: ProgramSeason;
  birthDate?: string | null;
  trainingLevel?: string | null;
  ownedEquipment?: string[] | null;
  pinned?: Record<string, string> | null;
}): Promise<Result> {
  if (!PROGRAMS_ENABLED) return { error: '지금은 프로그램을 시작할 수 없어요.' };
  const programKey = startProgramKey(input.programId, input.perWeek);
  const def = programDef(input.programId);
  if (!programKey || !def) return { error: '고른 프로그램을 다시 확인해 주세요.' };
  const audience = audienceOf(def);
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const now = new Date();

  const birthDate =
    user.birthDate ?? (input.birthDate ? parseBirthDate(input.birthDate) : null);
  if (!user.birthDate && input.birthDate && !birthDate) {
    return { error: '생년월일을 다시 확인해 주세요.' };
  }
  const trainingLevel =
    user.trainingLevel ??
    (TRAINING_LEVELS.some((l) => l.name === input.trainingLevel)
      ? (input.trainingLevel ?? null)
      : null);
  /* 기본기는 아무것도 안 골라도 된다(맨몸만) — 시트의 장비 칸을 지나왔으면(배열) 맨몸으로 저장한다 */
  const ownedEquipment =
    user.ownedEquipment.length > 0
      ? user.ownedEquipment
      : input.ownedEquipment &&
          (input.ownedEquipment.length > 0 || audience === 'basics')
        ? [ALWAYS_OWNED, ...pickMany(input.ownedEquipment, SELECTABLE_EQUIPMENT)]
        : [];
  const season = input.season === 'pre' ? 'pre' : input.season === 'off' ? 'off' : null;

  const eligible = checkEligibility({
    audience,
    age: birthDate ? ageFromBirthDate(birthDate, now) : null,
    trainingLevel,
    season,
    ownedEquipment,
    /* 성인 입문만 본다 — 기본기를 마쳤으면 열린다 */
    basicsDone:
      audience === 'adult' && trainingLevel === '입문'
        ? await hasFinishedBasics(user.id)
        : false,
  });
  if (!eligible.ok) {
    return { error: eligible.kind === 'ask' ? eligible.message : eligible.reason };
  }

  /* 고정 운동 — 보낸 것 중 후보에 있는 것만 지키고, 나머지는 규칙대로 고른다(안 쓰는 변형도 골라 둔다 — 해가 없다) */
  const library = await visibleExercises();
  const keep: Pinned = readPinned(input.pinned ?? {});
  const pinned = pickPinned(library, ownedEquipment, trainingLevel, keep, audience);

  const result = await prisma.$transaction(async (tx) => {
    /* 진행 중은 한 사람 하나 — Prisma 가 조건 붙은 유일 규칙을 못 적어 트랜잭션 안에서 본다(재활과 같다) */
    const existing = await tx.userTrainingProgram.findFirst({
      where: { userId: user.id, status: 'active' },
      select: { id: true, programKey: true },
    });
    /* 모르는 키의 줄(지운 프로그램)은 이어 갈 수 없다 — 바뀜으로 닫고 새로 시작한다 */
    if (existing && parseProgram(existing.programKey) == null) {
      await tx.userTrainingProgram.update({
        where: { id: existing.id },
        data: { status: 'stopped', endedAt: new Date(), endReason: 'switched' },
      });
    } else if (existing) return 'exists' as const;
    await tx.userTrainingProgram.create({
      data: {
        userId: user.id,
        programKey,
        season: season as string,
        pinned,
      },
    });
    const profile: {
      birthDate?: Date;
      trainingLevel?: string;
      ownedEquipment?: string[];
    } = {};
    if (!user.birthDate && birthDate) profile.birthDate = birthDate;
    if (!user.trainingLevel && trainingLevel) profile.trainingLevel = trainingLevel;
    if (user.ownedEquipment.length === 0 && ownedEquipment.length > 0) {
      profile.ownedEquipment = ownedEquipment;
    }
    if (Object.keys(profile).length > 0) {
      await tx.user.update({ where: { id: user.id }, data: profile });
    }
    return 'created' as const;
  });
  if (result === 'exists') return { error: '이미 진행 중인 프로그램이 있어요.' };

  revalidatePath('/training');
  return { ok: true };
}

/**
 * 시작 시트 ④ · 고정 운동 바꾸기(§13-17)가 보여 줄 후보. 프로그램을 안 주면 진행 중인 프로그램의 규칙으로(기본기는 바벨 없이).
 */
export async function programChoices(input: {
  variant: VariantKey;
  programId?: string | null;
  ownedEquipment?: string[] | null;
  trainingLevel?: string | null;
}): Promise<
  { choices: { id: string; title: string; equipment: string[] }[] } | { error: string }
> {
  const user = await requireUser();
  if (!VARIANT_KEYS.includes(input.variant)) return { error: '모르는 칸이에요.' };
  const owned =
    user.ownedEquipment.length > 0
      ? user.ownedEquipment
      : [ALWAYS_OWNED, ...pickMany(input.ownedEquipment ?? [], SELECTABLE_EQUIPMENT)];
  const level = user.trainingLevel ?? input.trainingLevel ?? null;
  const def = input.programId
    ? programDef(input.programId)
    : (parseProgram((await activeProgram(user.id))?.programKey ?? '')?.def ?? null);
  const library = await visibleExercises();
  return {
    choices: variantCandidates(
      input.variant,
      library,
      owned,
      level,
      def ? audienceOf(def) : 'adult'
    ).map((e) => ({
      id: e.id,
      title: e.title,
      equipment: e.equipment,
    })),
  };
}

/** 시작 시트 ④ 의 첫 목록 — 아직 시작 전이라 장비 · 경력은 시트에서 고른 값으로. 그 프로그램이 쓰는 변형만 */
export async function previewPinned(input: {
  programId: string;
  ownedEquipment?: string[] | null;
  trainingLevel?: string | null;
}): Promise<{
  pinned: { variant: VariantKey; label: string; id: string | null; title: string | null }[];
}> {
  const user = await requireUser();
  const owned =
    user.ownedEquipment.length > 0
      ? user.ownedEquipment
      : [ALWAYS_OWNED, ...pickMany(input.ownedEquipment ?? [], SELECTABLE_EQUIPMENT)];
  const level = user.trainingLevel ?? input.trainingLevel ?? null;
  const library = await visibleExercises();
  const byId = new Map(library.map((e) => [e.id, e.title]));
  const def = programDef(input.programId);
  const audience = def ? audienceOf(def) : 'adult';
  const pinned = pickPinned(library, owned, level, {}, audience);
  return {
    pinned: (def ? usedVariants(def) : VARIANT_KEYS).map((v) => ({
      variant: v,
      label: variantLabel(v, audience),
      id: pinned[v] ?? null,
      title: pinned[v] ? (byId.get(pinned[v] as string) ?? null) : null,
    })),
  };
}

/* ─────────────────────────── 운동 시작 ─────────────────────────── */

/**
 * 오늘 프로그램 날의 운동을 연다. 카드가 보인 목록 · 무게(lib/program/load.ts)를 그대로 얼린다(U1.4).
 */
export async function startProgramWorkout() {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const now = new Date();
  const core = await loadTodayCore(user, now);
  if (core.picked.halted) redirect('/workout/rest');

  const row = await activeProgram(user.id);
  if (!row) redirect('/training');

  const open = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId: user.id, date: core.midnight } },
  });
  if (open?.status === 'ACTIVE') redirect('/workout/run');

  /* 오늘 이미 마친 이 프로그램 판을 다시 열면 그 판의 목록 그대로(다음 일차 목록을 섞지 않는다). 다른 프로그램 판이면 아래 판정이 '기다림'으로 막는다 */
  const kept = open ? readFrozenPlan(open.plan) : null;
  if (open && kept?.program?.key === row.programKey) {
    redirect(await openSession(user.id, core.midnight, kept, open));
  }

  const view = await buildProgramDay(core, row, user);
  if (!view || view.decision.kind !== 'go' || view.rows.length === 0) redirect('/training');

  /* 관리자 숨김으로 다시 고른 것은 지금 저장한다(§3) */
  if (Object.keys(view.repin).length > 0) {
    await prisma.userTrainingProgram.update({
      where: { id: row.id },
      data: { pinned: { ...readPinned(row.pinned), ...view.repin } },
    });
  }

  const plan: FrozenPlan = {
    /* 날 종류는 늘 'lower'(U5) — 워밍업 · 운동 중 더하기 칸을 정하는 데만 쓴다 */
    themeKey: 'lower',
    themeLabel: `프로그램 · ${view.dayLabel}`,
    goal: null,
    program: {
      key: row.programKey,
      day: view.day,
      week: weekOfDay(view.plan, view.day),
      gapDays: view.decision.gapDays,
    },
    exercises: view.rows.map((r) =>
      freezeProgramExercise(r.exercise, r.rx, {
        substitute: r.substituteFor != null,
        adjusted: r.lighter,
        suggestedKg: r.suggestion?.kg ?? null,
        kgs: r.kgs,
      })
    ),
  };

  redirect(await openSession(user.id, core.midnight, plan, open));
}

/* ─────────────────────────── 하루 조절 ─────────────────────────── */

/** 경기 앞뒤로 쉬는 날을 넘긴다(D24) — 오늘 하루만 */
export async function overrideProgramRest(): Promise<Result> {
  const user = await requireUser();
  const today = new Date(`${toDateKey(new Date())}T00:00:00.000Z`);
  const moved = await prisma.userTrainingProgram.updateMany({
    where: { userId: user.id, status: 'active' },
    data: { overrideDate: today },
  });
  if (moved.count === 0) return { error: '진행 중인 프로그램이 없어요.' };
  revalidatePath('/training');
  return { ok: true };
}

/** 이 날 건너뛰기(§13-16) — 건너뜀으로 세고 다음 일차로. 마지막 일차를 넘으면 끝. */
export async function skipProgramDay(input: { day: number }): Promise<Result> {
  const user = await requireUser();
  const row = await activeProgram(user.id);
  if (!row) return { error: '진행 중인 프로그램이 없어요.' };
  const total = parseProgram(row.programKey)?.totalDays;
  if (total == null) return { error: '이 프로그램은 더 이어 갈 수 없어요. 새로 골라 주세요.' };
  /* 화면이 본 일차일 때만 — 두 번 눌러도 한 번 */
  const moved = await prisma.userTrainingProgram.updateMany({
    where: { id: row.id, status: 'active', nextDay: input.day },
    data: { nextDay: { increment: 1 }, skippedDays: { increment: 1 } },
  });
  if (moved.count === 0)
    return { error: '이미 넘어간 날이에요. 화면을 새로 열어 주세요.' };
  if (input.day >= total) {
    await prisma.userTrainingProgram.update({
      where: { id: row.id },
      data: { status: 'done', endedAt: new Date(), endReason: 'done' },
    });
  }
  revalidatePath('/training');
  return { ok: true };
}

/** 그만두기(§13-16) — 이 판은 끝, 기록은 남는다 */
export async function stopProgram(): Promise<Result> {
  const user = await requireUser();
  const moved = await prisma.userTrainingProgram.updateMany({
    where: { userId: user.id, status: 'active' },
    data: { status: 'stopped', endedAt: new Date(), endReason: 'stopped' },
  });
  if (moved.count === 0) return { error: '진행 중인 프로그램이 없어요.' };
  revalidatePath('/training');
  return { ok: true };
}

/** 고정 운동 바꾸기(§13-17) — 같은 칸 · 같은 계열 후보에서만. 그 운동의 무게 흐름은 새로 시작한다. */
export async function repinProgramExercise(input: {
  variant: VariantKey;
  exerciseId: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!VARIANT_KEYS.includes(input.variant)) return { error: '모르는 칸이에요.' };
  const row = await activeProgram(user.id);
  if (!row) return { error: '진행 중인 프로그램이 없어요.' };
  const library = await visibleExercises();
  const def = parseProgram(row.programKey)?.def;
  const ok = variantCandidates(
    input.variant,
    library,
    user.ownedEquipment,
    user.trainingLevel,
    def ? audienceOf(def) : 'adult'
  ).some((e) => e.id === input.exerciseId);
  if (!ok) return { error: '이 칸에 넣을 수 없는 운동이에요.' };
  await prisma.userTrainingProgram.update({
    where: { id: row.id },
    data: { pinned: { ...readPinned(row.pinned), [input.variant]: input.exerciseId } },
  });
  revalidatePath('/training');
  return { ok: true };
}
