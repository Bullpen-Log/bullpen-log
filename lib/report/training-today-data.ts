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
import { SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/lib/report/theme';
import { orderSession } from '@/lib/report/exercise-order';
import { availableParts } from '@/lib/report/today-pick';
import { exercisesByIds } from '@/lib/library-cache';
import { cautionLabel } from '@/lib/report/auto-setup';
import { GOAL_FOCUSES } from '@/lib/report/personalize';
import { outingLineOf, type OutingLineText } from '@/lib/outing-line';
import { PROGRAMS_ENABLED } from '@/lib/program/program';
import {
  activeProgram,
  buildProgramDay,
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
 * 앱이 직접 안 그리는 것(운동 추가 창 · 조건 바꿔 만들기 폼 · 프로그램 고르기 · 3D 부위)은 읽지 않는다 — 앱은 그 칸을 웹으로 보낸다.
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
  | { kind: 'plan'; plan: TodayPlan };

export type TrainingToday = {
  today: string;
  /** 최근 7일 — 칸마다 그날 한 것(운동 · 암케어 · 메커니즘) */
  strip: TrainingStripDay[];
  programCard: ProgramCardProps | null;
  programDone: ProgramResult | null;
  /** 근력 프로그램 고르기 입구 — 진행 중인 프로그램이 없고 오늘 일정을 아직 안 만든 날(웹과 같은 조건) */
  programPick: boolean;
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
  const programRow = PROGRAMS_ENABLED ? await activeProgram(user.id) : null;
  const [programView, doneProgram, strip] = await Promise.all([
    programRow ? buildProgramDay(core, programRow, user) : Promise.resolve(null),
    PROGRAMS_ENABLED && !programRow ? recentlyDoneProgram(user.id, today) : Promise.resolve(null),
    loadTrainingStrip(user.id, core.todayKey, core.todayKey),
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

  /* 그릴 운동만 자세히 — 일정에 담긴 것과 오늘 마친 것(웹과 같은 까닭) */
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

  const [thumbUrls, pastAmounts, doneSets] = await Promise.all([
    createPlaybackUrls(
      [
        ...full.map((p) => p.ex.thumbPath),
        ...(programCard?.upcoming.flatMap((u) => u.items.map((it) => it.thumbPath)) ?? []),
      ].filter((p): p is string => !!p)
    ),
    recentAmounts(
      user.id,
      full.map((p) => p.ex.id),
      today
    ),
    finished && todaySession
      ? prisma.userExerciseSet.findMany({
          where: { sessionId: todaySession.id },
          select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
        })
      : Promise.resolve([]),
  ]);
  for (const it of programCard?.upcoming.flatMap((u) => u.items) ?? []) {
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

  const make = (): TodayMake => ({
    checkedIn: core.hasCheckinToday,
    needsEquipment: user.ownedEquipment.length === 0,
    equipment: user.ownedEquipment.filter((name) => name !== '맨몸'),
    selected: core.todaySetup?.availableEquipment.length ? core.todaySetup.availableEquipment : [],
    clash: core.workoutClash,
  });

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
        ? { kind: 'make', stale: screen.stalePlan ? TRAINING_SCREEN_TEXT.stalePlan : null, make: make() }
        : groups.length === 0
          ? { kind: 'empty', dropped: droppedForSafety > 0, make: make() }
          : {
              kind: 'plan',
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
                noEquipment: user.ownedEquipment.length === 0,
                groups,
                tooFew: picked.tooFew ? { count: picked.candidates.length, min: MIN_CANDIDATES } : null,
              },
            };

  return {
    today: core.todayKey,
    strip: strip.slice(-7),
    programCard,
    programDone,
    programPick: PROGRAMS_ENABLED && !programView && savedPlan == null,
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
