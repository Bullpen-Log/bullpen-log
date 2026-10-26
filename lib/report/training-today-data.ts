import 'server-only';
import { prisma } from '@/lib/prisma';
import type { getCurrentUser } from '@/lib/dal';
import { favoriteExerciseIds } from '@/lib/favorites';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { planPrescription } from '@/lib/report/volume';
import { planReasonLines } from '@/lib/report/daily-plan';
import { pickReasonLineOf } from '@/lib/report/score';
import { loadTodayCore } from '@/lib/report/today-data';
import { toDateKey } from '@/lib/pitch-stats';
import { TRAINING_SCREEN_TEXT, trainingScreenOf, type TrainingScreen } from '@/lib/report/training-screen';
import { remakeFieldsOf, stateNoticeOf, type StateNotice } from '@/lib/report/state-notice';
import { programDayText } from '@/lib/engine/arbiter';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { summarizeSets, totalVolumeKg, type ExerciseSummary } from '@/lib/workout/summarize';
import { recentAmounts, type PastAmount } from '@/lib/report/exercise-recent';
import { MIN_CANDIDATES } from '@/lib/report/prescription';
import { DEFAULT_WORKOUT_MINUTES, SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/lib/report/theme';
import { orderSession } from '@/lib/report/exercise-order';
import { availableParts } from '@/lib/report/today-pick';
import { exercisesByIds } from '@/lib/library-cache';
import { cautionLabel } from '@/lib/report/auto-setup';
import { GOAL_FOCUSES, TRAINING_LEVELS } from '@/lib/report/personalize';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { ageFromBirthDate } from '@/lib/profile';
import { outingLineOf, type OutingLineText } from '@/lib/outing-line';
import {
  PROGRAMS_ENABLED,
  profileBlock,
  programChoiceList,
  type ProgramBlock,
  type ProgramChoice,
} from '@/lib/program/program';
import {
  activeProgram,
  buildProgramDay,
  hasFinishedBasics,
  programCardProps,
  programResult,
  programTodayOf,
  recentlyDoneProgram,
  type ProgramCardProps,
  type ProgramResult,
} from '@/lib/program/load';
import { loadTrainingStrip, type TrainingStripDay } from '@/lib/training-week';

/**
 * 트레이닝 '운동' 앱 화면(오늘 운동)의 재료 — 아이폰 앱(app/actions/app-training.ts → native/src/app/training-today.tsx)이 읽는다.
 *
 * 웹 화면(app/(app)/training/training-page.tsx 의 기본 칸 — ?view 없음)이 그리는 것과 같은 함수 · 같은 차례로 읽는다: 오늘 셈(loadTodayCore) ·
 * 근력 프로그램 날(buildProgramDay) · 화면 판정(trainingScreenOf) · 상태 바뀜 띠(stateNoticeOf) · 운동 줄(orderSession · planPrescription ·
 * pickReasonLineOf) · 완료 카드(summarizeSets). 웹 쪽을 고치면 여기도 같이 본다(웹 페이지는 서버 부품이라 데이터와 그리기가 한 파일이다).
 * 운동 추가 창의 400개 목록은 창을 열 때 따로 읽는다(loadTodayPicker). 3D 부위는 읽지 않는다.
 *
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */

type TodayUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 운동 줄 하나 — 웹 TodayExercise(exercise-list.tsx)에서 앱이 그리는 칸만 */
export type TodayRow = {
  id: string;
  title: string;
  category: string;
  description: string;
  prescription: string | null;
  thumbUrl: string | null;
  videoPath: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
  done: boolean;
  manual: boolean;
  unsafe: boolean;
  reason: string | null;
  favorite: boolean;
  /** 지난번 기록(가장 최근 하나) — 처음이면 null */
  last: PastAmount | null;
};

/** 구간 하나(워밍업 · 본운동 · 코어 …) — 웹 목록과 같은 차례(SLOT_ORDER), 빈 구간은 없다 */
export type TodayGroup = { slot: SlotKey; label: string; hint: string; items: TodayRow[] };

/** 일정 만들기 자리(아직 안 만든 날 · 남은 운동이 없는 날) — 웹 PlanForm 의 자동 맞춤 칸 */
export type TodayMake = {
  /** 체크인을 남겼나 — 안 남겼으면 체크인 먼저 */
  checkedIn: boolean;
  /** 가진 장비를 한 번도 안 골랐다 — 웹이 먼저 묻는다(앱은 웹으로 보낸다) */
  needsEquipment: boolean;
  /** 오늘 고를 수 있는 장비(가진 것 중 맨몸 빼고) */
  equipment: string[];
  /** 미리 켜 둔 장비 — 오늘 이미 고른 것(없으면 빈 목록 = 맨몸만, 웹과 같다) */
  selected: string[];
  /** 고른 운동 종류가 몸 상태와 부딪힘 */
  clash: { kind: string; reason: string; fallbackLabel: string } | null;
  /** 직접 고르기 칸(웹 PlanForm 의 minutes · defaultMinutes · goal · focus · preferredWorkout · effortSpike · startMode) — 이번에 쓸 시간 */
  minutes: number;
  /** 내 정보에 저장한 기본 시간 */
  defaultMinutes: number;
  /** 지난번에 고른 목표 · 부위(한 번도 안 골랐으면 null) */
  goal: string | null;
  focus: string | null;
  preferredWorkout: string | null;
  /** 최근 운동 힘듦 급증 — 직접 고르기에 경고 한 줄 · '그래도 고른 대로' */
  effortSpike: boolean;
  /** 오늘 직접 골라 만들었으면 다시 만들 때도 직접 고르기로 연다 */
  manual: boolean;
};

/** 근력 프로그램 고르기 · 시작 시트의 재료 — 웹 ProgramStartProps(app/(app)/training/program-start.tsx)와 같은 칸 */
export type TodayProgramStart = {
  programs: ProgramChoice[];
  needBirth: boolean;
  level: string | null;
  levels: { name: string; desc: string }[];
  owned: string[];
  equipment: string[];
  blocked: ProgramBlock | null;
  basicsBlocked: ProgramBlock | null;
  basicsDone: boolean;
};

/** 일정 카드(만든 날) */
export type TodayPlan = {
  title: string;
  minutes: number;
  goal: string | null;
  reason: string;
  reasons: string[];
  /** 자동 맞춤이 통증을 의심했을 때만 — 웹 AutoNote 와 같은 글 */
  autoPain: { summary: string; reason: string; caution: string | null } | null;
  /** 회복 데이라 줄인 시간 */
  cut: { requested: number; minutes: number } | null;
  droppedForSafety: number;
  /** 장비를 한 번도 안 골라 전부 있다고 보고 골랐다 */
  noEquipment: boolean;
  groups: TodayGroup[];
  /** 후보가 빠듯한 날 — '조건에 맞는 운동이 N개뿐' */
  tooFew: { count: number; min: number } | null;
};

/** 일정 자리에 무엇을 그리나 — 웹 페이지의 갈래 그대로 */
export type TodayBody =
  | { kind: 'halted'; reason: string }
  | { kind: 'program'; text: string; planResting: string | null }
  | { kind: 'none' }
  | { kind: 'make'; stale: string | null; make: TodayMake }
  | { kind: 'empty'; dropped: boolean; make: TodayMake }
  | { kind: 'plan'; plan: TodayPlan; make: TodayMake };

export type TrainingToday = {
  today: string;
  /** 최근 7일 — 칸마다 그날 한 것(운동 · 암케어 · 메카닉) */
  strip: TrainingStripDay[];
  programCard: ProgramCardProps | null;
  programDone: ProgramResult | null;
  /** 근력 프로그램 고르기 입구 — 진행 중인 프로그램이 없고 오늘 일정을 아직 안 만든 날만(웹과 같은 조건), 아니면 null */
  programStart: TodayProgramStart | null;
  /** 상태 바뀜 띠 — 띄울 때만(kind 'remake') */
  notice: StateNotice | null;
  /** 띠의 '지금 상태로 다시 만들기'가 보낼 칸(웹 remakeFieldsOf 그대로) */
  remakeFields: [string, string][];
  screen: TrainingScreen;
  resume: boolean;
  done: {
    minutes: number;
    sets: number;
    volumeKg: number;
    lines: { id: string; title: string; summary: ExerciseSummary }[];
  } | null;
  note: { intensity: number | null; memo: string | null };
  outing: OutingLineText | null;
  /** '오늘 하고 싶은 운동' 카드 — 체크인이 있는 날만(웹과 같다). 답은 아직이면 null */
  prefs: { answer: { workout: string | null; parts: string[] } | null; parts: string[] } | null;
  body: TodayBody;
};

export async function loadTrainingToday(user: TodayUser, today: Date): Promise<TrainingToday> {
  /* 웹 페이지와 같은 차례 — 오늘 셈 · 메모 · 별 · 오늘 판을 같이, 프로그램 줄은 오늘 셈(지난 판 닫기) 뒤에 */
  const midnight = new Date(`${toDateKey(today)}T00:00:00.000Z`);
  const [core, trainingNote, favExercises, todaySession] = await Promise.all([
    loadTodayCore(user, today),
    prisma.dailyTrainingNote.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { intensity: true, memo: true },
    }),
    favoriteExerciseIds(user.id),
    prisma.trainingSession.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { id: true, status: true, plan: true, activeSeconds: true },
    }),
  ]);
  const { savedPlan, picked, doneIds, shownPicks, droppedForSafety } = core;
  /*
   * 그릴 운동만 자세히 — 일정에 담긴 것과 오늘 마친 것(웹과 같은 까닭). 지난 양 · 오늘 마친 세트는 프로그램과 상관없어 여기서 바로
   * 읽기 시작한다(예전엔 프로그램 줄 → 프로그램 하루를 다 기다린 뒤 읽어 왕복이 하나 더 쌓였다, 2026-10-18 앱 화면 속도).
   */
  const needed = [...new Set([...shownPicks.map((p) => p.exerciseId), ...doneIds])];
  const detailed = needed.length ? await exercisesByIds(needed) : [];
  const byId = new Map(detailed.map((ex) => [ex.id, ex]));
  const full = shownPicks
    .map((p) => ({
      slot: p.slot,
      manual: p.manual === true,
      unsafe: p.unsafe,
      score: 'score' in p ? p.score : undefined,
      ex: byId.get(p.exerciseId),
    }))
    .filter((p): p is typeof p & { ex: NonNullable<(typeof p)['ex']> } => p.ex != null);

  const pastAmountsP = recentAmounts(
    user.id,
    full.map((p) => p.ex.id),
    today
  );
  const doneSetsP =
    todaySession?.status === 'FINISHED'
      ? prisma.userExerciseSet.findMany({
          where: { sessionId: todaySession.id },
          select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
        })
      : Promise.resolve([]);
  /* 아래에서 기다리기 전에 실패해도 '처리 안 된 실패'로 서버가 넘어지지 않게 — 실패는 아래 Promise.all 이 그대로 받는다 */
  pastAmountsP.catch(() => {});
  doneSetsP.catch(() => {});
  const programRow = PROGRAMS_ENABLED ? await activeProgram(user.id) : null;
  /* 기본기 4주를 마쳤나 — 웹 페이지와 같다(성인 입문만, 진행 중인 줄이 없으면 미리 같이 묻는다) */
  const asksBasics = PROGRAMS_ENABLED && user.trainingLevel === '입문';
  const [programView, doneProgram, strip, basicsEarly] = await Promise.all([
    programRow ? buildProgramDay(core, programRow, user) : Promise.resolve(null),
    PROGRAMS_ENABLED && !programRow ? recentlyDoneProgram(user.id, today) : Promise.resolve(null),
    loadTrainingStrip(user.id, core.todayKey, core.todayKey),
    asksBasics && !programRow ? hasFinishedBasics(user.id) : Promise.resolve(null),
  ]);
  const programCard = programView ? programCardProps(programView, core.library) : null;
  const programDone = doneProgram ? await programResult(doneProgram, core.library) : null;

  const resume = todaySession?.status === 'ACTIVE';
  const finished = todaySession?.status === 'FINISHED';
  const screen = trainingScreenOf({
    halted: picked.halted,
    daily: programView?.arbitration.daily,
    savedPlan,
    shownCount: shownPicks.length,
    programWork: programView ? programTodayOf(programView) != null : false,
  });
  const notice = stateNoticeOf(core.stateChanges, {
    programOwns: screen.programOwns,
    droppedForSafety,
    session: finished ? 'finished' : resume ? 'active' : 'none',
    checkedIn: core.hasCheckinToday,
  });

  const [thumbUrls, pastAmounts, doneSets] = await Promise.all([
    createPlaybackUrls(
      [
        ...full.map((p) => p.ex.thumbPath),
        ...(programCard?.upcoming.flatMap((u) => u.items.map((it) => it.thumbPath)) ?? []),
        ...(programCard?.rows.map((r) => r.thumbPath) ?? []),
      ].filter((p): p is string => !!p)
    ),
    pastAmountsP,
    doneSetsP,
  ]);
  for (const it of [...(programCard?.upcoming.flatMap((u) => u.items) ?? []), ...(programCard?.rows ?? [])]) {
    if (it.thumbPath) it.thumbUrl = thumbUrls[it.thumbPath] ?? null;
  }

  const done = (() => {
    if (!finished || !todaySession) return null;
    const frozen = readFrozenPlan(todaySession.plan)?.exercises ?? [];
    const order = new Map(frozen.map((e, i) => [e.id, i]));
    const titleOf = new Map(frozen.map((e) => [e.id, e.title]));
    return {
      minutes: Math.round(todaySession.activeSeconds / 60),
      sets: doneSets.length,
      volumeKg: totalVolumeKg(doneSets),
      lines: summarizeSets(doneSets)
        .sort((a, b) => (order.get(a.exerciseId) ?? 999) - (order.get(b.exerciseId) ?? 999))
        .map((sum) => ({
          id: sum.exerciseId,
          title: titleOf.get(sum.exerciseId) ?? '목록에서 뺀 운동',
          summary: sum,
        })),
    };
  })();

  const rows = orderSession(full, SLOT_ORDER).map(({ slot, manual, unsafe, score, ex }) => ({
    slot,
    row: {
      id: ex.id,
      title: ex.title,
      category: ex.category,
      description: ex.description,
      prescription: formatPrescription(planPrescription(ex, savedPlan)),
      thumbUrl: ex.referenceVideoId
        ? referenceThumbUrl(ex.referenceVideoId)
        : ex.thumbPath
          ? (thumbUrls[ex.thumbPath] ?? null)
          : null,
      videoPath: ex.videoPath,
      referenceVideoId: ex.referenceVideoId,
      aspectRatio: ex.aspectRatio ?? null,
      done: doneIds.has(ex.id),
      manual,
      unsafe,
      reason: unsafe ? null : pickReasonLineOf(ex, score, { favorite: favExercises.has(ex.id) }),
      favorite: favExercises.has(ex.id),
      last: pastAmounts.get(ex.id)?.[0] ?? null,
    } satisfies TodayRow,
  }));
  const groups: TodayGroup[] = SLOT_ORDER.map((slot) => ({
    slot,
    ...SLOT_LABELS[slot],
    items: rows.filter((r) => r.slot === slot).map((r) => r.row),
  })).filter((g) => g.items.length > 0);

  const savedMinutes = user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES;
  const make = (minutes: number): TodayMake => ({
    checkedIn: core.hasCheckinToday,
    /* 가진 장비 설정을 없앴다(2026-10-20) — 묻지 않고, 오늘 칸에 모든 장비를 켜고 시작한다(앱 PlanForm) */
    needsEquipment: false,
    equipment: [...SELECTABLE_EQUIPMENT],
    selected: core.todaySetup?.availableEquipment.length ? core.todaySetup.availableEquipment : [],
    clash: core.workoutClash,
    minutes,
    defaultMinutes: savedMinutes,
    goal: user.trainingGoal,
    focus: user.trainingFocus,
    preferredWorkout: core.preferredWorkout,
    effortSpike: core.effortSpike,
    manual: savedPlan != null && !savedPlan.auto && !savedPlan.program,
  });

  /* 프로그램 고르기 — 웹 페이지의 programStart 와 같은 셈(오늘 일정을 만든 날은 숨긴다) */
  const basicsDone =
    asksBasics && !programView ? (basicsEarly ?? (await hasFinishedBasics(user.id))) : false;
  const known = {
    age: user.birthDate ? ageFromBirthDate(user.birthDate, today) : null,
    trainingLevel: user.trainingLevel,
    basicsDone,
  };
  const programStart: TodayProgramStart | null =
    PROGRAMS_ENABLED && !programView && savedPlan == null
      ? {
          programs: programChoiceList(),
          needBirth: user.birthDate == null,
          level: user.trainingLevel,
          levels: TRAINING_LEVELS.map((l) => ({ name: l.name, desc: l.desc })),
          owned: user.ownedEquipment,
          equipment: [...SELECTABLE_EQUIPMENT],
          blocked: profileBlock({ audience: 'adult', ...known }),
          basicsBlocked: profileBlock({ audience: 'basics', ...known }),
          basicsDone,
        }
      : null;

  /* 일정 자리 — 웹 페이지의 갈래 차례 그대로(멈춤 > 프로그램 주인 > 안 만든 날 · 스러진 일정 > 남은 것 없음 > 일정) */
  const body: TodayBody = picked.halted
    ? { kind: 'halted', reason: picked.haltReason ?? '통증 신호가 있어 훈련 조언을 만들지 않았어요.' }
    : screen.programOwns
      ? done
        ? { kind: 'none' }
        : {
            kind: 'program',
            text: programDayText(programView?.arbitration.program?.today?.label ?? programView?.dayLabel ?? null),
            planResting: screen.planResting ? TRAINING_SCREEN_TEXT.planResting : null,
          }
      : savedPlan == null || screen.stalePlan
        ? { kind: 'make', stale: screen.stalePlan ? TRAINING_SCREEN_TEXT.stalePlan : null, make: make(savedMinutes) }
        : groups.length === 0
          ? { kind: 'empty', dropped: droppedForSafety > 0, make: make(savedPlan.requestedMinutes) }
          : {
              kind: 'plan',
              make: make(savedPlan.requestedMinutes),
              plan: {
                title: `오늘은 ${savedPlan.theme.label}`,
                minutes: core.shownMinutes,
                goal: savedPlan.goal ?? null,
                reason: savedPlan.auto?.reason ?? savedPlan.theme.reason,
                reasons: planReasonLines(savedPlan, { shown: shownPicks, favoriteIds: favExercises }),
                autoPain: savedPlan.auto?.painSuspected
                  ? {
                      summary: `목표 ${savedPlan.auto.goal} · ${savedPlan.auto.minutes}분${
                        GOAL_FOCUSES.find((f) => f.key === savedPlan.auto?.focus)?.label
                          ? ` · ${GOAL_FOCUSES.find((f) => f.key === savedPlan.auto?.focus)?.label}`
                          : ''
                      }`,
                      reason: savedPlan.auto.reason,
                      caution: savedPlan.auto.caution.length
                        ? savedPlan.auto.caution.map((c) => `${cautionLabel(c.part)}(${c.why})`).join(' · ')
                        : null,
                    }
                  : null,
                cut:
                  savedPlan.minutes < savedPlan.requestedMinutes
                    ? { requested: savedPlan.requestedMinutes, minutes: savedPlan.minutes }
                    : null,
                droppedForSafety,
                /* 가진 장비 설정을 없애 '장비를 안 골라…' 알림은 안 낸다(2026-10-20) — 오늘 고른 장비로 짠다 */
                noEquipment: false,
                groups,
                tooFew: picked.tooFew ? { count: picked.candidates.length, min: MIN_CANDIDATES } : null,
              },
            };

  return {
    today: core.todayKey,
    strip: strip.slice(-7),
    programCard,
    programDone,
    programStart,
    notice: screen.usesPlan && savedPlan && notice.kind === 'remake' ? notice : null,
    remakeFields:
      screen.usesPlan && savedPlan
        ? remakeFieldsOf(savedPlan, { returnTo: '/training', availableToday: core.todaySetup?.availableEquipment })
        : [],
    screen,
    resume,
    done,
    note: { intensity: trainingNote?.intensity ?? null, memo: trainingNote?.memo ?? null },
    outing: outingLineOf(core.state.outing),
    prefs: core.hasCheckinToday ? { answer: core.trainingPrefs, parts: availableParts(core.library) } : null,
    body,
  };
}

/** '운동 추가' 창의 운동 하나 — 웹 PickableExercise(add-exercise.tsx)에서 창이 그리는 칸만, 경고는 서버가 미리 센다 */
export type TodayPickItem = {
  id: string;
  title: string;
  category: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  favorite: boolean;
  /** 더하고 나서 목록에 보일 처방(오늘 목표 · 양 조절에 맞춘 것) */
  prescription: string | null;
  /** 이미 오늘 목록에 있다 — 다시 넣을 수 없다 */
  inPlan: boolean;
  /** 오늘 몸 상태에는 권하지 않는다(막지는 않는다) */
  unsafe: boolean;
  /** 가진 장비에 없는 것(맨몸 빼고) */
  missing: string[];
};

/**
 * '운동 추가' 창을 열 때 — 웹 페이지가 AddExercise 에 넘기는 것(pickable · inPlanIds · safeIds · ownedEquipment)과 같은 셈. 400개 남짓이라
 * 화면을 열 때마다 싣지 않고 창을 열 때 한 번 읽는다(오늘 셈을 한 번 더 돈다 — 웹 페이지를 다시 여는 것과 같은 값).
 */
export async function loadTodayPicker(user: TodayUser, today: Date): Promise<TodayPickItem[]> {
  const [core, fav] = await Promise.all([loadTodayCore(user, today), favoriteExerciseIds(user.id)]);
  const inPlan = new Set(core.shownPicks.map((p) => p.exerciseId));
  const safe = new Set(core.safeIds);
  const owned = new Set(user.ownedEquipment);
  return core.library.map((raw) => {
    const ex = planPrescription(raw, core.savedPlan);
    return {
      id: ex.id,
      title: ex.title,
      category: ex.category,
      bodyParts: ex.bodyParts,
      intensity: ex.intensity,
      difficulty: ex.difficulty,
      equipment: ex.equipment,
      favorite: fav.has(ex.id),
      prescription: formatPrescription(ex),
      inPlan: inPlan.has(ex.id),
      unsafe: !safe.has(ex.id),
      missing: ex.equipment.filter((e) => e !== '맨몸' && !owned.has(e)),
    };
  });
}
