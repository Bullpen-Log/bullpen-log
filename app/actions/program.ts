'use server';

import { appNow } from '@/lib/clock';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
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
import { isOpenSession, openSession } from '@/lib/workout/open-session';
import {
  PROGRAMS_ENABLED,
  VARIANT_KEYS,
  audienceOf,
  checkEligibility,
  isYouthAge,
  parseProgram,
  pickPinned,
  pinnedJson,
  programDef,
  programOutline,
  readDaySwaps,
  readPinned,
  startProgramKey,
  usedVariants,
  variantCandidates,
  variantKindOf,
  variantLabel,
  weekOfDay,
  type PerWeek,
  type VariantKind,
  type Pinned,
  type VariantKey,
} from '@/lib/program/program';
import { activeProgram, buildProgramDay, hasFinishedBasics } from '@/lib/program/load';
import { favoriteExerciseIds } from '@/lib/favorites';
import { recentExerciseIds } from '@/lib/report/exercise-recent';
import { selectCandidates } from '@/lib/report/prescription';
import type { SwapChoices } from '@/app/actions/workout';

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
  birthDate?: string | null;
  trainingLevel?: string | null;
  ownedEquipment?: string[] | null;
  /** 고른 운동 — 칸 → 운동 id. 확인 화면에서 '없음'으로 본 칸은 null 로 보낸다 */
  pinned?: Record<string, string | null> | null;
  /**
   * 이 등록 요청의 번호(앱이 만든다, 2026-10-30 시안 04). 같은 번호로 다시 보내면(응답 유실 · 두 번 누름) 새로 만들지 않고 처음 것을 돌려준다.
   * 결과 조회(loadProgramStartStatus)도 이 번호로 한다. 옛 화면은 안 보낸다 — 그때는 예전처럼.
   */
  requestId?: string | null;
  /**
   * 사람이 운동 구성을 확인했다(시안 03 · 04) — 서버가 같은 조건으로 다시 고른 구성이 보낸 것과 다르면(장비 · 경력 · 후보가 그새 바뀜)
   * 조용히 다른 구성으로 등록하지 않고 code 'changed' 와 바뀐 칸을 돌려준다.
   */
  confirm?: boolean;
}): Promise<
  | { ok: true; programKey: string; same?: boolean }
  | { error: string; code?: 'changed' | 'exists' | 'busy'; changed?: { variant: VariantKey; label: string; from: string | null; to: string | null }[] }
> {
  if (!PROGRAMS_ENABLED) return { error: '지금은 프로그램을 시작할 수 없어요.' };
  const programKey = startProgramKey(input.programId, input.perWeek);
  const def = programDef(input.programId);
  if (!programKey || !def) return { error: '고른 프로그램을 다시 확인해 주세요.' };
  const audience = audienceOf(def);
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const now = appNow();

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
  /*
   * 장비는 시작할 때마다 시트에서 고른다(2026-10-20 김민 — 트레이닝 설정의 '가진 장비'를 없앰). 시트가 보낸 것이 이기고, 안 보냈으면
   * (옛 앱) 저장된 것. 기본기는 아무것도 안 골라도 된다(맨몸만) — 시트의 장비 칸을 지나왔으면(배열) 맨몸으로 저장한다.
   */
  const ownedEquipment =
    input.ownedEquipment && (input.ownedEquipment.length > 0 || audience === 'basics')
      ? [ALWAYS_OWNED, ...pickMany(input.ownedEquipment, SELECTABLE_EQUIPMENT)]
      : user.ownedEquipment;

  const eligible = checkEligibility({
    audience,
    age: birthDate ? ageFromBirthDate(birthDate, now) : null,
    trainingLevel,
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

  const requestId =
    typeof input.requestId === 'string' && /^[\w-]{8,64}$/.test(input.requestId) ? input.requestId : null;

  /* 고정 운동 — 보낸 것 중 후보에 있는 것만 지키고, 나머지는 규칙대로 고른다(안 쓰는 변형도 골라 둔다 — 해가 없다) */
  const library = await visibleExercises();
  const keep: Pinned = readPinned(input.pinned ?? {});
  const pinned = pickPinned(
    library,
    ownedEquipment,
    trainingLevel,
    keep,
    audience,
    isYouthAge(birthDate ? ageFromBirthDate(birthDate, now) : null)
  );

  /*
   * 확인한 구성과 서버가 다시 고른 구성 — 고를 수 있는 칸(보조 칸 빼고)에서 보낸 것과 다르면 등록하지 않고 알린다(시안 03 '장비 변경 후 갱신').
   * 보낸 칸만 견준다(옛 화면은 다 안 보낸다).
   */
  if (input.confirm && input.pinned && typeof input.pinned === 'object') {
    const perWeek = input.perWeek === 2 ? 2 : 3;
    const titleOf = new Map(library.map((e) => [e.id, e.title]));
    const sent = input.pinned as Record<string, unknown>;
    const changed = usedVariants(def, perWeek)
      .filter((v) => variantKindOf(def, v, perWeek) !== 'assist' && Object.prototype.hasOwnProperty.call(sent, v))
      .filter((v) => (typeof sent[v] === 'string' ? sent[v] : null) !== (pinned[v] ?? null))
      .map((v) => ({
        variant: v,
        label: variantLabel(v, audience),
        from: typeof sent[v] === 'string' ? (titleOf.get(sent[v] as string) ?? null) : null,
        to: pinned[v] ? (titleOf.get(pinned[v] as string) ?? null) : null,
      }));
    if (changed.length > 0) {
      return { error: '조건이 바뀌어 운동 구성이 달라졌어요. 바뀐 구성을 확인한 뒤 시작해요.', code: 'changed', changed };
    }
  }

  /* 직렬화 — 두 탭 · 재시도가 동시에 오면 둘 다 '없음'을 보고 진행 중이 둘 생겼다(재활 rehab.ts 와 같은 꼴, 2026-10-18) */
  let result: 'exists' | 'created' | 'same';
  try {
    result = await prisma.$transaction(
      async (tx) => {
        /*
         * 한 사람의 등록은 하나씩 — 결과 조회(loadProgramStartStatus)도 같은 자물쇠를 기다려, 처리 중인 등록을 '없음'으로 읽지 않는다.
         * 트랜잭션이 끝나면 저절로 풀린다(pg_advisory_xact_lock).
         */
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`program-start:${user.id}`}, 0))`;
        /* 진행 중은 한 사람 하나 — Prisma 가 조건 붙은 유일 규칙을 못 적어 트랜잭션 안에서 본다(재활과 같다) */
        const existing = await tx.userTrainingProgram.findFirst({
          where: { userId: user.id, status: 'active' },
          select: { id: true, programKey: true, pinned: true },
        });
        /* 같은 요청을 다시 보낸 것(응답 유실 · 두 번 누름) — 처음 것이 이미 등록했다 */
        if (existing && requestId && requestOf(existing.pinned) === requestId) return 'same' as const;
        /* 모르는 키의 줄(지운 프로그램)은 이어 갈 수 없다 — 바뀜으로 닫고 새로 시작한다 */
        if (existing && parseProgram(existing.programKey) == null) {
          await tx.userTrainingProgram.update({
            where: { id: existing.id },
            data: { status: 'stopped', endedAt: appNow(), endReason: 'switched' },
          });
        } else if (existing) return 'exists' as const;
        await tx.userTrainingProgram.create({
          data: {
            userId: user.id,
            programKey,
            /* 시즌은 묻지 않는다(2026-10-10) — 칸은 옛 줄 때문에 남기고 늘 'off' */
            season: 'off',
            /* 요청 번호는 고정 운동 상자에 함께 — readPinned 는 칸 이름만 읽고, 다음 고정 운동 쓰기(pinnedJson)에서 저절로 빠진다(DB 구조 그대로) */
            pinned: requestId ? { ...pinned, [REQUEST_KEY]: requestId } : pinned,
          },
        });
        const profile: {
          birthDate?: Date;
          trainingLevel?: string;
          ownedEquipment?: string[];
        } = {};
        if (!user.birthDate && birthDate) profile.birthDate = birthDate;
        if (!user.trainingLevel && trainingLevel) profile.trainingLevel = trainingLevel;
        if (ownedEquipment !== user.ownedEquipment && ownedEquipment.length > 0) {
          profile.ownedEquipment = ownedEquipment;
        }
        if (Object.keys(profile).length > 0) {
          await tx.user.update({ where: { id: user.id }, data: profile });
        }
        return 'created' as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
      return { error: '다른 곳에서 동시에 시작하고 있어요. 등록 결과를 확인해 주세요.', code: 'busy' };
    }
    throw e;
  }
  if (result === 'exists') return { error: '이미 진행 중인 프로그램이 있어요.', code: 'exists' };

  revalidatePath('/training');
  return { ok: true, programKey, ...(result === 'same' ? { same: true } : {}) };
}

/** 등록 요청 번호를 담는 칸 — 칸 이름(VariantKey)과 겹치지 않게 */
const REQUEST_KEY = '@request';
const requestOf = (pinned: unknown): string | null => {
  const v = pinned && typeof pinned === 'object' ? (pinned as Record<string, unknown>)[REQUEST_KEY] : null;
  return typeof v === 'string' ? v : null;
};

/**
 * 등록 결과 — 응답을 못 받았을 때 같은 요청 번호로 묻는다(시안 04 '등록 결과 확인 필요'). 등록과 같은 자물쇠를 잡고 읽어, 아직 처리 중인
 * 등록이 있으면 그것이 끝난 뒤의 상태를 본다 — '없음'이 한 번 읽힌 것으로 끝나지 않게. 읽기만 한다.
 */
export async function loadProgramStartStatus(input: { requestId: string }): Promise<
  | { state: 'registered'; programId: string; perWeek: number }
  | { state: 'other'; programId: string | null; name: string }
  | { state: 'none' }
  | { error: string }
> {
  const user = await requireUser();
  const requestId = typeof input?.requestId === 'string' ? input.requestId : '';
  if (!requestId) return { error: '요청을 찾지 못했어요.' };
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`program-start:${user.id}`}, 0))`;
    return tx.userTrainingProgram.findFirst({
      where: { userId: user.id, status: 'active' },
      select: { programKey: true, pinned: true },
    });
  });
  if (!row) return { state: 'none' };
  const plan = parseProgram(row.programKey);
  if (requestOf(row.pinned) === requestId && plan) {
    return { state: 'registered', programId: plan.def.id, perWeek: plan.perWeek };
  }
  return { state: 'other', programId: plan?.def.id ?? null, name: plan?.def.name ?? '진행 중인 프로그램' };
}

/** 시트에서 고른 장비(배열로 왔으면)가 이긴다 — 시작할 때마다 고른다(2026-10-20). 안 왔으면 저장된 것, 그것도 없으면 맨몸만 */
function sheetEquipment(saved: string[], input: string[] | null | undefined): string[] {
  if (Array.isArray(input)) return [ALWAYS_OWNED, ...pickMany(input, SELECTABLE_EQUIPMENT)];
  return saved.length > 0 ? saved : [ALWAYS_OWNED];
}

/**
 * 시작 시트 ④ · 고정 운동 바꾸기(§13-17)가 보여 줄 후보. 프로그램을 안 주면 진행 중인 프로그램의 규칙으로(기본기는 바벨 없이).
 */
export async function programChoices(input: {
  variant: VariantKey;
  programId?: string | null;
  ownedEquipment?: string[] | null;
  trainingLevel?: string | null;
  /** 시작 준비에서 받은 생년월일(저장 전) — 후보 · 등록이 같은 나이 기준(성장기)을 쓰게. 저장된 생년월일이 있으면 그것 */
  birthDate?: string | null;
}): Promise<
  { choices: { id: string; title: string; equipment: string[] }[] } | { error: string }
> {
  const user = await requireUser();
  if (!VARIANT_KEYS.includes(input.variant)) return { error: '모르는 칸이에요.' };
  const owned = sheetEquipment(user.ownedEquipment, input.ownedEquipment);
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
      def ? audienceOf(def) : 'adult',
      isYouthAge(ageOfDraft(user.birthDate, input.birthDate))
    ).map((e) => ({
      id: e.id,
      title: e.title,
      equipment: e.equipment,
    })),
  };
}

/** 저장된 생년월일이 먼저, 없으면 준비 화면에서 받은 것(모양이 아니면 null) — 후보 · 구성 · 등록이 같은 나이를 본다 */
function ageOfDraft(saved: Date | null, draft: string | null | undefined): number | null {
  const birth = saved ?? (draft ? parseBirthDate(draft) : null);
  return birth ? ageFromBirthDate(birth) : null;
}

/** 시작 시트 ④ 의 첫 목록 — 아직 시작 전이라 장비 · 경력은 시트에서 고른 값으로. 그 프로그램이 쓰는 변형만 */
export async function previewPinned(input: {
  programId: string;
  ownedEquipment?: string[] | null;
  trainingLevel?: string | null;
  /** 준비 화면의 생년월일(저장 전) — 등록(startProgram)과 같은 나이 기준으로 고른다 */
  birthDate?: string | null;
  /** 고른 주당 횟수 — 주면 그 횟수에서 쓰는 칸만 · 칸의 성격(고정 · 세션마다 · 보조)과 나오는 세션을 같이 준다(시안 03) */
  perWeek?: number | null;
  /** 지금 고른 운동(칸 → id) — 새 조건에서도 후보에 있으면 지키고, 없어진 칸만 다시 고른다(바뀐 칸은 화면이 알린다) */
  keep?: Record<string, string | null> | null;
}): Promise<{
  pinned: {
    variant: VariantKey;
    label: string;
    id: string | null;
    title: string | null;
    equipment?: string[];
    kind?: VariantKind;
    /** 이 칸이 나오는 세션 이름(첫 주 — 'A 날' …) */
    sessions?: string[];
  }[];
}> {
  const user = await requireUser();
  const owned = sheetEquipment(user.ownedEquipment, input.ownedEquipment);
  const level = user.trainingLevel ?? input.trainingLevel ?? null;
  const library = await visibleExercises();
  const byId = new Map(library.map((e) => [e.id, e]));
  const def = programDef(input.programId);
  const audience = def ? audienceOf(def) : 'adult';
  const pinned = pickPinned(
    library,
    owned,
    level,
    readPinned(input.keep ?? {}),
    audience,
    isYouthAge(ageOfDraft(user.birthDate, input.birthDate))
  );
  const perWeek: PerWeek | undefined = input.perWeek === 2 ? 2 : input.perWeek === 3 ? 3 : undefined;
  const outline = def && perWeek ? programOutline(def, perWeek) : null;
  /* 보조 메뉴 칸(고르지 않음) — 구성 확인이 '세션마다 정해요'로 보이게 칸 이름만 더한다 */
  const fixed = def ? usedVariants(def, perWeek) : [...VARIANT_KEYS];
  const assist = outline
    ? [...new Set(outline.sessions.flatMap((x) => x.items.filter((it) => it.kind === 'assist').map((it) => it.variant)))].filter((v) => !fixed.includes(v))
    : [];
  return {
    pinned: [...fixed, ...assist].map((v) => {
      const isAssist = assist.includes(v);
      const ex = !isAssist && pinned[v] ? byId.get(pinned[v] as string) : undefined;
      return {
        variant: v,
        label: variantLabel(v, audience),
        id: isAssist ? null : (pinned[v] ?? null),
        title: ex?.title ?? null,
        ...(def && perWeek
          ? {
              equipment: ex?.equipment ?? [],
              kind: variantKindOf(def, v, perWeek),
              sessions: (outline?.sessions ?? []).filter((x) => x.items.some((it) => it.variant === v)).map((x) => x.label),
            }
          : {}),
      };
    }),
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
  const now = appNow();
  const core = await loadTodayCore(user, now);
  if (core.picked.halted) redirect('/workout/rest');

  const row = await activeProgram(user.id);
  if (!row) redirect('/training');

  const open = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId: user.id, date: core.midnight } },
  });
  /* 목록을 못 읽는 판은 열린 판으로 보지 않는다 — 운동 화면이 닫고 새로 연다(2026-10-16 점검 12번, lib/workout/open-session.ts) */
  if (isOpenSession(open)) redirect('/workout/run');

  /* 오늘 이미 마친 이 프로그램 판을 다시 열면 그 판의 목록 그대로(다음 일차 목록을 섞지 않는다). 다른 프로그램 판이면 아래 판정이 '기다림'으로 막는다 */
  const kept = open ? readFrozenPlan(open.plan) : null;
  if (open && kept?.program?.key === row.programKey) {
    redirect(await openSession(user.id, core.midnight, kept, open));
  }

  const view = await buildProgramDay(core, row, user);
  if (!view || view.decision.kind !== 'go' || view.rows.length === 0)
    redirect('/training');

  /* 관리자 숨김으로 다시 고른 것은 지금 저장한다(§3) */
  if (Object.keys(view.repin).length > 0) {
    await prisma.userTrainingProgram.update({
      where: { id: row.id },
      data: { pinned: pinnedJson(row.pinned, { ...readPinned(row.pinned), ...view.repin }) as Prisma.InputJsonValue },
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
      /* 이 판을 연 회차 — 일차 넘기기 · 완료 화면이 같은 회차만 본다(lib/program/advance.ts) */
      rowId: row.id,
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
  const today = new Date(`${toDateKey(appNow())}T00:00:00.000Z`);
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
  if (total == null)
    return { error: '이 프로그램은 더 이어 갈 수 없어요. 새로 골라 주세요.' };
  /*
   * 그 일차의 판이 열려 있으면 건너뛰지 않는다 — 넘겨 버리면 판은 nextDay 가 안 맞아 일차를 못 넘기고(lib/program/advance.ts)
   * 그날은 '건너뜀'으로 셈됐다(2026-10-16 점검 A4). 마치거나 그만둔 뒤에 건너뛴다.
   */
  const open = await prisma.trainingSession.findFirst({
    where: { userId: user.id, status: 'ACTIVE' },
    select: { plan: true },
  });
  const openProgram = open ? readFrozenPlan(open.plan)?.program : null;
  if (
    openProgram &&
    openProgram.key === row.programKey &&
    openProgram.day === input.day
  ) {
    return { error: '운동 중인 날은 건너뛸 수 없어요. 먼저 마치거나 그만둬 주세요.' };
  }
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
      data: { status: 'done', endedAt: appNow(), endReason: 'done' },
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
    data: { status: 'stopped', endedAt: appNow(), endReason: 'stopped' },
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
    def ? audienceOf(def) : 'adult',
    isYouthAge(user.birthDate ? ageFromBirthDate(user.birthDate) : null)
  ).some((e) => e.id === input.exerciseId);
  if (!ok) return { error: '이 칸에 넣을 수 없는 운동이에요.' };
  await prisma.userTrainingProgram.update({
    where: { id: row.id },
    data: {
      pinned: pinnedJson(row.pinned, { ...readPinned(row.pinned), [input.variant]: input.exerciseId }) as Prisma.InputJsonValue,
    },
  });
  revalidatePath('/training');
  return { ok: true };
}

/**
 * 프로그램 운동 줄의 '바꾸기' 창 — 운동 중 바꾸기 창(workout/run/swap-sheet.tsx)과 같은 모양을 판 없이 낸다. 비슷한 운동은 같은 칸 후보,
 * 즐겨찾기 · 최근 · 찾기(전체)는 운동 중과 같다. 오늘 몸 상태에 안 맞는 운동도 막지 않고 주의만(2026-10-19 사용자 결정).
 */
export async function programSwapChoices(input: {
  exerciseId: string;
  variant: VariantKey;
  withLibrary: boolean;
}): Promise<SwapChoices | { error: string }> {
  const user = await requireUser();
  if (!VARIANT_KEYS.includes(input.variant)) return { error: '모르는 칸이에요.' };
  const row = await activeProgram(user.id);
  if (!row) return { error: '진행 중인 프로그램이 없어요.' };
  const now = appNow();
  const [core, favorites, recentIds] = await Promise.all([
    loadTodayCore(user, now),
    favoriteExerciseIds(user.id),
    recentExerciseIds(user.id, now),
  ]);
  const safety = selectCandidates({ facts: core.facts, plan: core.plan, library: core.library });
  const safeIds = new Set(safety.candidates.map((ex) => ex.id));
  const def = parseProgram(row.programKey)?.def;
  const audience = def ? audienceOf(def) : 'adult';
  const label = variantLabel(input.variant, audience);
  const sameSlot = variantCandidates(
    input.variant,
    core.library,
    user.ownedEquipment,
    user.trainingLevel,
    audience,
    isYouthAge(user.birthDate ? ageFromBirthDate(user.birthDate) : null)
  ).filter((ex) => ex.id !== input.exerciseId && safeIds.has(ex.id));
  return {
    halted: safety.halted ? (safety.haltReason ?? '오늘은 운동을 바꿀 수 없어요.') : null,
    similar: safety.halted ? [] : sameSlot.map((ex) => ({ id: ex.id, reason: `같은 칸(${label}) 운동` })),
    blockedIds: core.library.filter((ex) => !safeIds.has(ex.id)).map((ex) => ex.id),
    favoriteIds: [...favorites],
    recentIds,
    /* 처방은 넣을 때 그 칸 · 그 주의 것으로 정해져 목록에는 안 보인다(운동 중 프로그램 판과 같다) */
    library: input.withLibrary
      ? core.library.map((ex) => ({
          id: ex.id,
          title: ex.title,
          category: ex.category,
          equipment: ex.equipment,
          prescription: null,
        }))
      : null,
  };
}

/**
 * 프로그램 운동 줄을 오늘만 다른 운동으로 — 고정 운동은 그대로, 다음 세션은 원래대로(2026-10-21 김민). exerciseId 가 null 이면 원래대로.
 * 오늘 판(운동 시작)이 이 바꿈을 읽어 얼린다(lib/program/load.ts buildProgramDay). 이미 연 판은 화면이 changeSessionExercise 로 같이 바꾼다.
 */
export async function swapProgramToday(input: {
  variant: VariantKey;
  exerciseId: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!VARIANT_KEYS.includes(input.variant)) return { error: '모르는 칸이에요.' };
  const row = await activeProgram(user.id);
  if (!row) return { error: '진행 중인 프로그램이 없어요.' };
  if (input.exerciseId != null && !(await visibleExercises()).some((ex) => ex.id === input.exerciseId))
    return { error: '운동을 찾을 수 없어요.' };
  const dateKey = toDateKey(appNow());
  const swaps = { ...readDaySwaps(row.pinned, dateKey) };
  if (input.exerciseId) swaps[input.variant] = input.exerciseId;
  else delete swaps[input.variant];
  await prisma.userTrainingProgram.update({
    where: { id: row.id },
    data: { pinned: pinnedJson(row.pinned, readPinned(row.pinned), { dateKey, swaps }) as Prisma.InputJsonValue },
  });
  revalidatePath('/training');
  return { ok: true };
}
