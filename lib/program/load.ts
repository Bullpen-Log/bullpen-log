import 'server-only';
import { appNow } from '@/lib/clock';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HIGH_SORENESS, SEVERE_SORENESS, isShortSleep } from '@/lib/checkin';
import { yesterdayArmLoadOf } from '@/lib/engine/arm-load';
import {
  arbitrate,
  programArbiterSignals,
  type Arbitration,
  type ProgramSessionToday,
} from '@/lib/engine/arbiter';
import { dayKindOf } from '@/lib/engine/microcycle';
import { lastOutingDateOf } from '@/lib/engine/outing';
import { withProgramCommitment } from '@/lib/engine/day-state';
import { lastStrengthDates } from '@/lib/report/gather';
import { loadHoldProgress } from '@/lib/nutrition/fuel-load';
import { droppedOnlyForArmFatigue, selectCandidates } from '@/lib/report/prescription';
import { LOW_CONDITION_THRESHOLD, painRecoveryReason } from '@/lib/report/theme';
import type { loadTodayCore } from '@/lib/report/today-data';
import type { CachedExercise } from '@/lib/library-cache';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import {
  programTodayFrom,
  type ProgramTodayExercise,
  type ProgramTodayInput,
} from '@/lib/report/daily-plan';
import { estimate1RM } from '@/lib/workout/history';
import { toDateKey } from '@/lib/pitch-stats';
import type { ReportFacts } from '@/lib/report/facts';
import {
  ARM_ACCESSORIES,
  ARM_DEFER_REASON,
  CAUTION_TEXT,
  TM_LOOKBACK_DAYS,
  PROGRAMS,
  SUBSTITUTE_REASON,
  audienceOf,
  basicsDoneEnough,
  daysBetween,
  dayLabel,
  dayPlan,
  decideToday,
  inSeasonKind,
  isOptionalProgramExercise,
  isYouthAge,
  accessoryOccurrence,
  accessoryPick,
  lighterRx,
  painSlotsOf,
  parseProgram,
  planSubtitle,
  prescriptionLine,
  programSignalsOf,
  readPinned,
  ROTATING_VARIANTS,
  rotatedPick,
  variantTurn,
  restTextOf,
  usedVariants,
  variantCandidates,
  variantLabel,
  warmupLine,
  withKind,
  youthRx,
  type ItemRx,
  type Pinned,
  type ProgramPlan,
  type RecoveryReason,
  type SessionKind,
  type SlotAdjust,
  type SlotKind,
  type TodayDecision,
  type VariantKey,
} from '@/lib/program/program';
import {
  historyEntry,
  reasonText,
  tmFromSets,
  weighItem,
  weightKindOf,
  weightTag,
  type HistoryEntry,
  type WeightSuggestion,
} from '@/lib/program/next-weight';

/**
 * 근력 · 파워 프로그램을 DB 와 잇는 곳 — 진행 중인 줄 · 오늘 신호 · 지난 기록을 모아 규칙(program.ts · next-weight.ts)에 넘긴다.
 *
 * 트레이닝 화면의 카드(오늘 N일차)와 운동 시작(app/actions/program.ts)이 같은 것을 읽는다 — 화면에 보인 무게와
 * 얼리는 무게가 같아야 한다(U1.4). 일정(DailyTrainingSetup)에 저장하지 않는다: 고정 운동 · 일차로 정해지는 목록이라
 * 다시 그려도 바뀌지 않고, 몸 상태가 바뀌면 그에 맞게 다시 판정하는 편이 맞다.
 */

export type ProgramRow = Prisma.UserTrainingProgramGetPayload<object>;
type TodayCore = Awaited<ReturnType<typeof loadTodayCore>>;
/**
 * buildProgramDay 가 읽는 오늘 자료 — 트레이닝 화면 · 운동 시작은 loadTodayCore 를 그대로 넘기고, 일정 만들기(app/actions/training-setup.ts
 * generateTodayPlan, 2판 P6-3)는 이미 읽은 facts · 장 · 라이브러리로 만든다(오늘 자료를 두 번 읽지 않게).
 */
export type ProgramDayCore = Pick<
  TodayCore,
  'todayKey' | 'midnight' | 'facts' | 'plan' | 'state' | 'library' | 'hasCheckinToday'
> & { picked: Pick<TodayCore['picked'], 'halted'> };

/** 진행 중인 프로그램(한 사람 하나) */
export async function activeProgram(userId: string): Promise<ProgramRow | null> {
  return prisma.userTrainingProgram.findFirst({
    where: { userId, status: 'active' },
    orderBy: { startedAt: 'desc' },
  });
}

/** 다 끝난 지 사흘 안의 프로그램 — 트레이닝 화면에 '다 마쳤어요' 카드를 그만큼 둔다 */
export async function recentlyDoneProgram(
  userId: string,
  now: Date
): Promise<ProgramRow | null> {
  const since = new Date(now.getTime() - 3 * 86_400_000);
  return prisma.userTrainingProgram.findFirst({
    where: { userId, status: 'done', endedAt: { gte: since } },
    orderBy: { endedAt: 'desc' },
  });
}

const keyOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * 기본기 4주를 다 마친 적이 있는가 — 성인 입문은 마치면 성인 프로그램이 열린다(program.ts 의 profileBlock, 2026-10-09).
 */
export async function hasFinishedBasics(userId: string): Promise<boolean> {
  const ids = PROGRAMS.filter((d) => audienceOf(d) === 'basics').map((d) => d.id);
  const rows = await prisma.userTrainingProgram.findMany({
    where: {
      userId,
      status: 'done',
      programKey: { in: [...ids, ...ids.map((id) => `${id}:2`)] },
    },
    select: { programKey: true, nextDay: true, skippedDays: true },
  });
  /* 다 건너뛴 '마침'은 세지 않는다 — 절반 넘게 실제로 한 판이 하나 있어야(basicsDoneEnough) */
  return rows.some((r) => {
    const plan = parseProgram(r.programKey);
    return plan != null && basicsDoneEnough(plan, r.nextDay, r.skippedDays);
  });
}

/* ─────────────────────────── 오늘 신호 ─────────────────────────── */

/**
 * 오늘 투구 기록의 세션 종류 — 프로그램의 던지는 신호(program.ts programSignalsOf)의 기록 쪽 재료(오늘 '경기' · 불펜 · 라이브).
 *
 * 투구수 · 강도는 고르지 않는다 — 0구로 적은 '경기' 줄도 오늘은 경기로 읽던 예전 그대로다(세게 던졌는지는 오늘 상태 한 장의
 * load.hardOutingRecent 가 facts 로 본다).
 * 어제 기록은 여기서 읽지 않는다 — 2판 P4 커밋 F(D3)부터 '경기 다음 날'은 어제 기록의 세션 종류가 아니라 어제 팔 부담
 * (lib/engine/arm-load.ts yesterdayArmLoadOf, facts 에서)으로 정한다.
 * 등판 답도 여기서 읽지 않는다 — 오늘 상태 한 장(core.state.outing)의 답을 쓴다. 2판 P3(2026-10-12) 전에는 체크인 두 줄을 여기서
 * 따로 읽었는데, 그 줄은 facts 를 만든 같은 45일치 읽기(lib/report/gather.ts)에 이미 들어 있어 같은 값을 두 번 읽었다.
 */
export async function pitchTypesToday(userId: string, todayKey: string) {
  const pitches = await prisma.pitchLog.findMany({
    where: { userId, date: new Date(`${todayKey}T00:00:00.000Z`) },
    select: { sessionType: true },
  });
  return pitches.map((p) => p.sessionType);
}

/** 오늘 운동한 판 — 프로그램 날인지와 상태 */
async function todaySession(userId: string, midnight: Date) {
  const s = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId, date: midnight } },
    select: { id: true, status: true, plan: true },
  });
  if (!s) return null;
  const plan = readFrozenPlan(s.plan);
  return {
    id: s.id,
    status: s.status,
    program: plan?.program ?? null,
    /* 그 판의 운동 — 오늘 프로그램 판이 있는 날 매일 일정이 그대로 싣는다(programTodayOf, 2판 P6-3) */
    exercises: plan?.exercises ?? [],
  };
}

/**
 * 마지막 프로그램 운동 날(어느 프로그램이든) — 새로 시작한 줄은 lastDoneDate 가 없어, 앞 프로그램을 마친 다음 날
 * 바로 1일차를 하거나 다섯 주 쉬고도 예전 무게가 그대로 나왔다. 쉰 기간 · 간격(§6 · §13-25)은 프로그램을 바꿔도 잇는다.
 */
async function lastProgramSessionKey(userId: string, before: Date): Promise<string | null> {
  const sessions = await prisma.trainingSession.findMany({
    where: {
      userId,
      status: { in: ['FINISHED', 'ABANDONED'] },
      date: { lt: before },
      plan: { path: ['program', 'key'], string_starts_with: '' },
    },
    orderBy: { date: 'desc' },
    take: 10,
    select: { id: true },
  });
  if (sessions.length === 0) return null;
  /* 세트를 남긴 날만 — 열기만 하고 못 한 판으로 '어제 했어요'가 되지 않게 */
  const set = await prisma.userExerciseSet.findFirst({
    where: { userId, sessionId: { in: sessions.map((s) => s.id) } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  return keyOf(set?.date);
}

/* ─────────────────────────── 지난 기록 ─────────────────────────── */

/**
 * 운동마다 지난 프로그램 기록(무게 추천의 기준) — 다른 프로그램 · 지난 판의 것도 함께 본다(§13-13, 프로그램을 바꿔도 무게가 이어진다).
 * 대체로 넣은 운동의 기록은 그 운동 자신의 흐름이다(고정 운동 흐름에는 안 들어간다 — 운동 id 가 다르다).
 */
export async function programHistory(
  userId: string,
  exerciseIds: readonly string[],
  beforeKey: string
): Promise<Map<string, HistoryEntry[]>> {
  const out = new Map<string, HistoryEntry[]>();
  if (exerciseIds.length === 0) return out;
  const sessions = await prisma.trainingSession.findMany({
    where: {
      userId,
      status: { in: ['FINISHED', 'ABANDONED'] },
      date: { lt: new Date(`${beforeKey}T00:00:00.000Z`) },
      /* 프로그램 날 판만(키가 있는 것) */
      plan: { path: ['program', 'key'], string_starts_with: '' },
    },
    orderBy: { date: 'desc' },
    take: 60,
    select: { id: true, date: true, plan: true },
  });
  if (sessions.length === 0) return out;
  const sets = await prisma.userExerciseSet.findMany({
    where: {
      sessionId: { in: sessions.map((s) => s.id) },
      exerciseId: { in: [...exerciseIds] },
    },
    select: {
      sessionId: true,
      exerciseId: true,
      setNo: true,
      weightKg: true,
      reps: true,
      rir: true,
    },
    orderBy: { setNo: 'asc' },
  });
  for (const s of sessions) {
    const plan = readFrozenPlan(s.plan);
    if (!plan) continue;
    for (const ex of plan.exercises) {
      if (!exerciseIds.includes(ex.id) || !ex.programSlot) continue;
      const mine = sets.filter((x) => x.sessionId === s.id && x.exerciseId === ex.id);
      if (mine.length === 0) continue;
      const entry = historyEntry(keyOf(s.date) as string, ex, mine);
      const list = out.get(ex.id) ?? [];
      list.push(entry);
      out.set(ex.id, list);
    }
  }
  return out;
}

/**
 * 운동마다 기준 무게(TM, % 방식) — 시작 전 6주 안의 기록(프로그램 아닌 운동 포함)으로 정해 4주 동안 그대로 둔다.
 * 시작 전 기록이 없으면 프로그램을 시작한 뒤 첫 기록의 날로 정한다. 오늘(아직 하는 중) 기록은 넣지 않는다.
 */
export async function trainingMaxes(
  userId: string,
  exerciseIds: readonly string[],
  startKey: string,
  todayKey: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (exerciseIds.length === 0) return out;
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  /* 시작 뒤 기록은 첫날만 쓴다 — 오래 '진행 중'으로 둔 줄이 기록을 끝없이 읽지 않게 시작 뒤 8주까지만 */
  const after = new Date(start.getTime() + 56 * 86_400_000);
  const sets = await prisma.userExerciseSet.findMany({
    where: {
      userId,
      exerciseId: { in: [...exerciseIds] },
      date: {
        gte: new Date(start.getTime() - TM_LOOKBACK_DAYS * 86_400_000),
        lt: today < after ? today : after,
      },
    },
    select: { exerciseId: true, date: true, weightKg: true, reps: true, rir: true },
  });
  for (const id of exerciseIds) {
    const tm = tmFromSets(
      sets.filter((s) => s.exerciseId === id),
      startKey
    );
    if (tm != null) out.set(id, tm);
  }
  return out;
}

/* ─────────────────────────── 오늘 프로그램 날 ─────────────────────────── */

export type ProgramDayRow = {
  slot: SlotKind;
  variant: VariantKey;
  exercise: CachedExercise;
  /** 그날 처방 — '가볍게'면 세트를 이미 줄인 것 */
  rx: ItemRx;
  /** 세트 기록 화면의 처방 한 줄 */
  line: string;
  /** '−1세트' 같은 조정 뒤 세트 수 */
  sets: number;
  /** 오늘 −10% · 세트 −1(D19) — 통증 대체와 겹친 날도. 얼릴 때 adjusted 로 실어 다음 추천의 기준에서 뺀다(U1.4) */
  lighter: boolean;
  /** % 방식의 세트마다 무게(그 밖은 null) */
  kgs: (number | null)[] | null;
  adjust: SlotAdjust | null;
  /** 고정 운동 대신 그날 대체했으면 그 까닭(§13-6 줄 표시) */
  substituteFor: { title: string; reason: string } | null;
  /** 관리자 숨김으로 같은 칸에서 다시 고정했는가(§13-11 ⑥) */
  repinned: boolean;
  suggestion: WeightSuggestion | null;
  /** 줄 표시('가벼운 주' · '−10% 오늘 컨디션' …) */
  tag: string | null;
  /** 까닭 시트의 한 문장 */
  reason: string | null;
  warmup: string | null;
  /** 앞 운동과 묶음(바로 이어서)이면 그 한 줄 */
  contrast: string | null;
};

export type ProgramDayView = {
  row: ProgramRow;
  plan: ProgramPlan;
  decision: TodayDecision;
  /** 오늘 이미 프로그램 판을 열었는가 · 마쳤는가 */
  todayState: 'none' | 'active' | 'finished';
  day: number;
  dayLabel: string;
  completed: number;
  skipped: number;
  caution: string | null;
  restText: string | null;
  rows: ProgramDayRow[];
  dropped: { slot: SlotKind; title: string; reason: string }[];
  /** 다시 고정해야 할 것(관리자 숨김) — 운동 시작 때 저장한다 */
  repin: Pinned;
  /**
   * 중재(lib/engine/arbiter.ts arbitrate, 2판 P6-3) — 판정 · 오늘 판 · 날 종류 · 예산을 층 차례로 묶은 오늘. 매일 일정(일정 만들기)이 이것으로
   * 오늘이 프로그램 날인지(daily.role 'program')와 하체 · 팔 예산을 읽는다. '그래도 하기'는 프로그램의 것(D24 — 경기 앞뒤 쉬는 날을 넘김)이라
   * 역할이 카드의 판정과 같다. 매일 일정 폼의 '그래도 하기'는 일정 만들기가 따로 넘긴다(daily-plan.ts budget · override).
   */
  arbitration: Arbitration;
  /** 오늘 이 프로그램의 판(열었거나 마침)과 그 판의 운동 — 없으면 null */
  session: (ProgramSessionToday & { exercises: ProgramTodayExercise[] }) | null;
  /** 시즌 중 선발인데 마지막 등판 날을 모른다 — 카드가 물어본다(오늘 날짜 키). 그 밖엔 null */
  askLastOuting: string | null;
};

export function progressOf(
  row: ProgramRow,
  plan: ProgramPlan
): { completed: number; skipped: number } {
  const passed = Math.min(plan.totalDays, row.nextDay - 1);
  return { completed: Math.max(0, passed - row.skippedDays), skipped: row.skippedDays };
}

/**
 * 오늘 프로그램 날을 만든다. 카드도, 운동 시작도 이것 하나를 쓴다. 모르는 프로그램 키면 null.
 */
export async function buildProgramDay(
  core: ProgramDayCore,
  row: ProgramRow,
  user: { id: string; ownedEquipment: string[]; trainingLevel: string | null }
): Promise<ProgramDayView | null> {
  const basePlan = parseProgram(row.programKey);
  if (!basePlan) return null;
  const todayKey = core.todayKey;
  const facts = core.facts;
  const [typesToday, session, lastProgramDate, strengthDates] = await Promise.all([
    pitchTypesToday(user.id, todayKey),
    todaySession(user.id, core.midnight),
    row.lastDoneDate
      ? Promise.resolve(keyOf(row.lastDoneDate))
      : lastProgramSessionKey(user.id, core.midnight),
    /*
     * 매일 일정의 하체 마지막 날 — 하체 예산(어제 하체 날이면 오늘 큰 하체를 가볍게)의 재료(2판 P6-2). 일정 만들기(training-setup.ts)와 같은
     * 조회 · 같은 규칙(완료 기록이 먼저, 없는 날은 저장된 일정). 카드와 운동 시작이 둘 다 여기를 지나 같은 값을 본다(비판 1 빈틈 25).
     */
    lastStrengthDates(user.id, core.midnight),
  ]);

  /* 시즌 중 프로그램이면 오늘 세션 종류를 얹는다(null = 움직임만 하는 날 — 판정이 쉬게 하고, 넘기면 번갈아 차례대로) */
  const kind = inSeasonKindOf(basePlan, facts, lastProgramDate, row.nextDay);
  const plan = withKind(basePlan, kind);

  /*
   * 등판 답은 오늘 상태 한 장에서 — 매일 일정 · 투구 계획 · 암케어가 읽는 것과 같은 답(자체 시험 엇갈림 표가 같은 함수를 부른다).
   * '경기 다음 날'은 어제 팔 부담에서 — 매일 일정의 날 종류 · 암케어 회복 루틴과 같은 함수(2판 P4 커밋 F, D3). 쉬는 까닭 글도 그 까닭대로
   * (restTextOf — 2판 P4 검토).
   */
  const yesterdayArm = yesterdayArmLoadOf(facts);
  const throwing = programSignalsOf({
    outing: core.state.outing,
    typesToday,
    yesterdayArmLoad: yesterdayArm,
  });

  const today = facts.condition.today;
  const zone = facts.load.zone;
  const recovery: RecoveryReason | null =
    zone === 'danger'
      ? 'loadRisk'
      : today && today.condition <= LOW_CONDITION_THRESHOLD
        ? 'lowCondition'
        : today?.soreness != null && today.soreness >= SEVERE_SORENESS
          ? 'soreSevere'
          : null;

  /* 부위 규칙만으로 오늘 할 수 있는 운동(§4 — 몸 전체 상한은 프로그램이 스스로 가볍게 한다) */
  const safeInput = {
    facts,
    plan: core.plan,
    library: core.library,
    partsOnly: true,
  };
  const safe = selectCandidates(safeInput);
  const safeIds = new Set(safe.candidates.map((e) => e.id));
  /* 팔 피로 '심함'만으로 빠진 운동 — 대체 꼬리표를 '통증 부위'가 아니라 '팔 피로'로(2판 P4 검토) */
  const armFatigueOnlyIds = droppedOnlyForArmFatigue(safeInput);
  const byId = new Map(core.library.map((e) => [e.id, e]));

  const day = Math.min(row.nextDay, plan.totalDays + 1);
  const pinned = readPinned(row.pinned);
  /* 다 끝났으면 마지막 날 목록(그리지는 않는다) */
  const items = dayPlan(plan, day).items;
  const owned = user.ownedEquipment;
  /* 기본기는 고르는 규칙이 다르다(바벨 없이) — 다시 고정 · 그날 대체도 같은 규칙으로 */
  const audience = audienceOf(plan.def);
  /* 성장기(만 16세 미만) — 매우 높음 빼고 고르고, 남기는 개수를 늘린다 */
  const youth = isYouthAge(facts.profile.age);

  /* 고정 운동이 숨겨졌으면 같은 칸에서 다시 고른다(§3) — 고르기만(읽기). 다시 고정할 것을 적는 일은 pinnedFor 가 한다 */
  const anchorOf = (
    v: VariantKey
  ): { ex: CachedExercise | null; repinned: boolean } => {
    const id = pinned[v];
    const ex = id ? byId.get(id) : undefined;
    if (ex) return { ex, repinned: false };
    const next =
      variantCandidates(v, core.library, owned, user.trainingLevel, audience, youth)[0] ?? null;
    return { ex: next, repinned: next != null };
  };
  /* 보조 칸은 세션마다 다른 운동(program.ts ROTATING_VARIANTS) — 고정 운동을 첫째로 같은 칸 후보를 그 칸이 나온 차례대로 */
  const pinnedOf = (v: VariantKey): { ex: CachedExercise | null; repinned: boolean } => {
    const got = anchorOf(v);
    if (audience !== 'adult' || !ROTATING_VARIANTS.includes(v) || !got.ex) return got;
    const pool = variantCandidates(v, core.library, owned, user.trainingLevel, audience);
    return { ex: rotatedPick(got.ex, pool, variantTurn(plan, day, v)), repinned: got.repinned };
  };
  const repin: Pinned = {};
  const pinnedFor = (
    v: VariantKey
  ): { ex: CachedExercise | null; repinned: boolean } => {
    const got = pinnedOf(v);
    /* 다시 고정은 고정 운동(첫째)만 — 돌린 차례의 운동을 고정으로 적지 않는다 */
    const anchor = anchorOf(v);
    if (anchor.repinned && anchor.ex) repin[v] = anchor.ex.id;
    return got;
  };

  /*
   * 보조 메뉴 칸 — 고정이 아니라 그 칸 후보를 사람 · 프로그램마다 섞은 차례로 세션마다 다음 것(program.ts accessoryPick, 2026-10-14 사용자:
   * "보조운동은 다양하고 세션마다 다른 걸로"). 그날 본운동과 같은 운동은 안 고른다.
   */
  const mainIds = new Set(
    items.filter((x) => !x.assist).flatMap((x) => {
      const ex = pinnedOf(x.variant).ex;
      return ex ? [ex.id] : [];
    })
  );
  const accessoryOf = new Map<VariantKey, CachedExercise | null>();
  for (const x of items) {
    if (!x.assist || accessoryOf.has(x.variant)) continue;
    accessoryOf.set(
      x.variant,
      accessoryPick(
        x.variant,
        variantCandidates(x.variant, core.library, owned, user.trainingLevel, audience, youth),
        `${user.id}|${row.startedAt.toISOString()}|${x.variant}`,
        accessoryOccurrence(plan, day, x.variant),
        mainIds
      )
    );
  }
  const exOf = (v: VariantKey) => (accessoryOf.has(v) ? (accessoryOf.get(v) ?? null) : pinnedFor(v).ex);

  /* 대체할 칸과 그 까닭 — 자체 시험 엇갈림 표와 같은 함수(program.ts painSlotsOf) */
  const { painSlots, slotReasons } = painSlotsOf(
    items,
    exOf,
    safeIds,
    armFatigueOnlyIds
  );

  /*
   * 중재 신호(2판 P6-2) — 팔 예산(오늘 등판 · 경기 기록 · 세게 던진 날이면 팔로 던지는 변형을 뺌) · 하체 예산(어제 하체 날이면 큰 하체를
   * 가볍게) · 오늘 세게 던진 날 · 오늘 '회복'을 고름(둘 다 쉬는 날). 자체 시험 · 기준선과 같은 함수(lib/engine/arbiter.ts programArbiterSignals)를
   * 같은 오늘 상태 한 장으로 부른다. 장을 만드는 gather.ts 는 프로그램 줄을 안 읽어 여기서 얹는다(day-state.ts withProgramCommitment —
   * 일정 만들기와 같은 꼴). 고정 운동은 읽기만 하는 pinnedOf 로 — 다시 고정할 것을 쓰지 않는 변형까지 적지 않게.
   */
  const arbiterState = withProgramCommitment(core.state, {
    key: row.programKey,
    nextDay: row.nextDay,
    totalDays: plan.totalDays,
    lastDoneDate: keyOf(row.lastDoneDate),
    kind: plan.kind,
  });
  const sessionToday: ProgramSessionToday | null =
    session?.program?.key === row.programKey
      ? {
          state: session.status === 'ACTIVE' ? 'active' : 'finished',
          day: session.program.day,
        }
      : null;
  const arbiter = programArbiterSignals({
    state: arbiterState,
    typesToday,
    lastLowerKey: strengthDates.lower,
    session: sessionToday,
    exerciseOf: (v) => pinnedOf(v).ex,
  });

  const decision = decideToday(plan, {
    nextDay: row.nextDay,
    today: todayKey,
    lastProgramDate,
    checkedIn: core.hasCheckinToday,
    /* 다른 방식이나 다른 프로그램(같은 날 바꿔 시작)으로 오늘 이미 운동했으면 기다린다 */
    otherWorkoutStarted: session != null && session.program?.key !== row.programKey,
    halted: core.picked.halted,
    ...throwing,
    /* 세게 던진 날 — 매일 일정(theme.ts hardOuting)과 같은 값을 오늘 상태 한 장에서(문턱은 facts.ts isHardOuting 한 곳) */
    hardThrowRecent: core.state.load.hardOutingRecent,
    override: keyOf(row.overrideDate) === todayKey,
    recovery,
    loadCaution: zone === 'caution',
    soreMany:
      today?.soreness != null &&
      today.soreness >= HIGH_SORENESS &&
      today.soreness < SEVERE_SORENESS,
    sleepShort: today != null && isShortSleep(today),
    uncertain:
      painRecoveryReason(facts, core.plan) != null ||
      (zone == null && facts.patterns.lastThrowDate != null),
    painSlots,
    slotReasons,
    ...(basePlan.def.inSeason ? { inSeasonMove: kind === null } : {}),
    ...arbiter.signals,
  });

  /*
   * 중재(2판 P6-3) — 판정 · 오늘 판을 넣어 층 차례로 오늘을 정한다. 매일 일정이 읽는다(view.arbitration). 카드와 같은 장 · 같은 신호 ·
   * 같은 '그래도 하기'(D24)라 '하는 날'이 둘이 같다(자체 시험 '[2판 P6] 프로그램 판정 신호' (나) 격자).
   */
  const arbitration = arbitrate({
    state: arbiterState,
    dayKind: dayKindOf(facts),
    programDecision: decision.kind,
    programSession: sessionToday,
    exerciseOf: (v) => pinnedOf(v).ex,
    lastLowerKey: strengthDates.lower,
    typesToday,
    override: keyOf(row.overrideDate) === todayKey,
  });

  const { completed, skipped } = progressOf(row, plan);
  const todayState: ProgramDayView['todayState'] =
    session?.program?.key !== row.programKey
      ? 'none'
      : session.status === 'ACTIVE'
        ? 'active'
        : 'finished';

  const view: ProgramDayView = {
    row,
    plan,
    decision,
    todayState,
    day,
    dayLabel: day <= plan.totalDays ? dayLabel(plan, day) : '다 마쳤어요',
    completed,
    skipped,
    caution:
      decision.kind === 'go' && decision.caution
        ? CAUTION_TEXT[decision.caution]
        : null,
    restText:
      decision.kind === 'rest'
        ? restTextOf(decision.reason, yesterdayArm?.kind ?? null)
        : null,
    rows: [],
    dropped: [],
    repin,
    arbitration,
    askLastOuting:
      basePlan.def.inSeason === 'starter' && decision.kind !== 'done' && lastOutingDateOf(facts) == null
        ? todayKey
        : null,
    session:
      sessionToday && session
        ? {
            ...sessionToday,
            exercises: session.exercises.map((e) => ({
              exerciseId: e.id,
              slot: e.slot,
              sets: e.plannedSets,
              reps: e.plannedReps,
              holdSeconds: e.plannedHoldSeconds,
              restSeconds: e.restSeconds ?? null,
            })),
          }
        : null,
  };
  if (day > plan.totalDays) return view;

  /* 하는 날이 아니어도 목록은 만든다 — 쉬는 날 · 체크인 전에는 흐린 미리보기로 보인다 */
  const adjust = decision.kind === 'go' ? decision.adjust : {};
  const gapDays = decision.kind === 'go' ? decision.gapDays : null;
  /* 팔을 아끼는 날 뺀 변형(2판 P6-2) — 칸이 아니라 변형이라 같은 파워 칸의 점프는 남는다 */
  const deferred = decision.kind === 'go' ? (decision.deferVariants ?? []) : [];

  const chosen: {
    rx: ItemRx;
    ex: CachedExercise;
    substituteFor: ProgramDayRow['substituteFor'];
    repinned: boolean;
  }[] = [];
  for (const rx of items) {
    const { slot, variant } = rx;
    const a = adjust[slot];
    const { ex: pinnedEx, repinned } = rx.assist
      ? { ex: accessoryOf.get(variant) ?? null, repinned: false }
      : pinnedFor(variant);
    if (!pinnedEx) {
      view.dropped.push({
        slot,
        title: variantLabel(variant, audience),
        /* 메디신볼은 필수 장비가 아니다(2026-10-14) — 없으면 그 칸만 빠진다 */
        reason: variant === 'medball' && !owned.includes('메디신볼') ? '메디신볼이 없어 빼요' : '할 수 있는 운동이 없어요',
      });
      continue;
    }
    if (a?.kind === 'drop') {
      view.dropped.push({ slot, title: pinnedEx.title, reason: a.reason });
      continue;
    }
    /* 대체보다 먼저 — 그 칸의 대체 후보도 같은 변형(메디신볼)이라 대체하면 또 던진다 */
    /* 팔을 아끼는 날은 팔 보조(삼두 · 이두 · 전완)도 뺀다 — 던지는 변형만 빼던 것에 더해(2026-10-14) */
    if (deferred.includes(variant) || (deferred.length > 0 && ARM_ACCESSORIES.includes(variant))) {
      view.dropped.push({ slot, title: pinnedEx.title, reason: ARM_DEFER_REASON });
      continue;
    }
    /* 대체는 그 운동이 통증 부위에 걸릴 때만 — 같은 칸의 다른 운동(스쿼트 · 힌지처럼 한 날 둘)은 그대로 */
    if (a?.kind === 'substitute' && !safeIds.has(pinnedEx.id)) {
      const sub = variantCandidates(
        variant,
        core.library,
        owned,
        user.trainingLevel,
        audience,
        youth
      ).find((c) => c.id !== pinnedEx.id && safeIds.has(c.id));
      if (!sub) {
        view.dropped.push({ slot, title: pinnedEx.title, reason: '오늘 몸 상태' });
        continue;
      }
      chosen.push({
        rx,
        ex: sub,
        substituteFor: {
          title: pinnedEx.title,
          reason: armFatigueOnlyIds.has(pinnedEx.id)
            ? SUBSTITUTE_REASON.armFatigue
            : SUBSTITUTE_REASON.pain,
        },
        repinned: false,
      });
      continue;
    }
    chosen.push({ rx, ex: pinnedEx, substituteFor: null, repinned });
  }

  const pctIds = chosen.filter((c) => c.rx.mode === 'pct').map((c) => c.ex.id);
  const [history, tms, holdProgress] = await Promise.all([
    programHistory(
      user.id,
      chosen.map((c) => c.ex.id),
      todayKey
    ),
    /* 시작한 날 — 그 사람의 하루(한국 날짜)로 */
    trainingMaxes(user.id, pctIds, toDateKey(row.startedAt), todayKey),
    /*
     * 영양 추세 깃발(2판 P6-7) — 지난 7일 적게 먹음 · 몸무게 감소 · 컨디션 낮음이 겹친 주면 올림만 멈춘다(next-weight.ts ⑧). 자유 운동 무게
     * (workout.ts)와 같은 읽기(React cache, 문자열 인자)라 카드와 운동 시작이 같은 값을 본다.
     */
    loadHoldProgress(user.id, todayKey),
  ]);

  for (const c of chosen) {
    const a = adjust[c.rx.slot] ?? null;
    const lighter = a?.kind === 'lighter' || (a?.kind === 'substitute' && a.lighter === true);
    const base = lighter ? lighterRx(c.rx) : c.rx;
    /* 성장기는 남기는 개수를 늘린다(program.ts youthRx) — 프로그램 칸의 처방이 운동 화면 · 다음 무게까지 이것으로 간다 */
    const rx = youth ? youthRx(base) : base;
    const { suggestion, kgs } = weighItem(rx, c.ex, {
      adjusted: lighter,
      gapDays,
      history: history.get(c.ex.id) ?? [],
      tmKg: tms.get(c.ex.id) ?? null,
      holdProgress,
    });
    view.rows.push({
      slot: rx.slot,
      variant: rx.variant,
      exercise: c.ex,
      rx,
      line: prescriptionLine(rx, { perSide: c.ex.perSide, kgs: kgs ?? undefined }),
      sets: rx.sets.length,
      lighter,
      kgs,
      adjust: a,
      substituteFor: c.substituteFor,
      repinned: c.repinned,
      suggestion,
      tag: lighter
        ? rx.sets.length < c.rx.sets.length
          ? '−10% · −1세트'
          : '−10%'
        : suggestion
          ? weightTag(suggestion)
          : null,
      reason: suggestion ? reasonText(suggestion) : null,
      /* 준비 세트는 첫 세트 무게까지(5/3/1 처럼 세트마다 오르면 그 첫 세트) */
      warmup:
        rx.slot === 'bigLower' && c.ex.equipment.includes('바벨')
          ? warmupLine(kgs?.[0] ?? suggestion?.kg ?? null)
          : null,
      contrast: null,
    });
  }

  /*
   * 묶음(바로 이어서) — 첫 운동은 짧게 쉬고 짝으로 넘어간다(프렌치 컨트라스트 20초). 짝이 오늘 빠졌으면 첫 운동도
   * 묶음 사이 쉬는 시간으로 쉰다. 짝의 한 줄은 첫 운동이 짧게 쉬면 '번갈아', 길게 쉬면(옛 프로그램 대비) 예전 글.
   */
  view.rows.forEach((r, i) => {
    const at = items.findIndex((x) => x.variant === r.variant);
    const mates: ItemRx[] = [];
    for (let j = at + 1; j < items.length && items[j].group; j++) mates.push(items[j]);
    const prev = view.rows[i - 1];
    if (r.rx.group && prev) {
      r.contrast =
        prev.rx.restSeconds <= BUNDLE_SHORT_REST
          ? '바로 이어서 · 한 세트씩 번갈아 해요'
          : '바로 이어서 · 큰 하체 뒤 2~3분 쉬고';
    }
    if (mates.length > 0 && !view.rows[i + 1]?.rx.group) {
      const rest = Math.max(r.rx.restSeconds, ...mates.map((m) => m.restSeconds));
      if (rest !== r.rx.restSeconds) r.rx = { ...r.rx, restSeconds: rest };
    }
  });
  return view;
}

/** 이만큼 이하로 쉬는 묶음은 '한 세트씩 번갈아' 하는 묶음이다(운동 화면도 같은 값) */
const BUNDLE_SHORT_REST = 30;

/* ─────────────────────────── 매일 일정에 넘길 프로그램 날(2판 P6-3) ─────────────────────────── */

/**
 * 오늘이 근력 프로그램 날이면 그날 운동 — 일정 만들기(app/actions/training-setup.ts)가 매일 일정에 넘긴다(daily-plan.ts programToday, 사용자 결정 D6
 * '프로그램 진행 중이면 그날 매일 일정 = 프로그램 운동 그대로'). 프로그램 날인지는 중재가 정한다(view.arbitration.daily.role — 'program', 결정이
 * 바뀌어 'assist' 길이 되어도 그날 운동은 같다). 운동은
 *   오늘 이 프로그램 판이 있으면(열었거나 마침) 그 판의 운동 — 카드 목록은 마친 뒤 다음 일차의 미리보기라 오늘 한 것이 아니다
 *   하는 날(판정 'go')이면 카드 목록(view.rows — 뺀 칸 · 팔 아끼는 날 뺀 변형 · 대체 · 가볍게 반영) — 운동 시작이 얼리는 것과 같다
 * 그 밖(쉬는 날 · 기다림 · 다 마침)이면 null — 그날은 매일 일정이 예산을 지키며 짠다(planBudgetOf).
 */
export function programTodayOf(view: ProgramDayView): ProgramTodayInput | null {
  /*
   * 규칙은 순수 도우미 하나(lib/report/daily-plan.ts programTodayFrom — 자체 시험이 표로 본다, 2판 P6 검토). 화면(lib/report/training-screen.ts)도
   * 이 값이 있을 때만 프로그램 카드를 주인으로 둔다(programWork) — 일정이 프로그램 날로 짜이는 날과 화면의 프로그램 날이 같다.
   */
  return programTodayFrom(view);
}

/* ─────────────────────────── 화면에 넘길 모양 ─────────────────────────── */

/** 트레이닝 카드(program-card.tsx)가 받는 것 — 날짜 · Json · 라이브러리 줄 없이 글과 숫자만 */
export type ProgramCardProps = {
  name: string;
  /** 기본기 4주인가 — 카드 머리가 '기본기 프로그램' */
  basics: boolean;
  /** '12회 · 주 3번 · 4주' */
  subtitle: string;
  /** 시즌 중 프로그램인가 — 카드 머리가 '시즌 중 프로그램' */
  inSeason: boolean;
  /** 마지막 등판을 물을 날(오늘 날짜 키) — ProgramDayView.askLastOuting */
  askLastOuting: string | null;
  kind: TodayDecision['kind'];
  todayState: ProgramDayView['todayState'];
  day: number;
  dayLabel: string;
  nextLabel: string | null;
  completed: number;
  skipped: number;
  total: number;
  caution: string | null;
  restText: string | null;
  rows: {
    id: string;
    title: string;
    slotLabel: string;
    kg: number | null;
    /** 덤벨 · 케틀벨 */
    perHand: boolean;
    /** '3 × 5' — 세트마다 다르면 '3세트' */
    amount: string;
    line: string;
    tag: string | null;
    reason: string | null;
    warmup: string | null;
    substituteFor: string | null;
    /** 묶음 한 줄(바로 이어서) */
    contrast: string | null;
    /** 선택 운동(메디신볼 던지기) — 건너뛰어도 된다 */
    optional: boolean;
    first: boolean;
  }[];
  dropped: { title: string; reason: string }[];
  pinned: { variant: VariantKey; label: string; title: string | null }[];
  /**
   * 앞으로 할 세션 — 다음 일차부터 끝까지, 그날 운동(고정 운동 이름 · 없으면 칸 이름)과 처방 한 줄(2026-10-14 김민: "현재 세션밖에 안
   * 나와 추후에 어떤 세션을 하는지 모른다"). 무게는 그날 기록으로 정해지니 넣지 않는다.
   */
  upcoming: { day: number; label: string; items: { title: string; line: string }[] }[];
};

export function programCardProps(
  view: ProgramDayView,
  library: readonly CachedExercise[]
): ProgramCardProps {
  const byId = new Map(library.map((e) => [e.id, e.title]));
  const pinned = { ...readPinned(view.row.pinned), ...view.repin };
  const nextDay = view.day + (view.todayState === 'finished' ? 0 : 1);
  const plan = view.plan;
  const audience = audienceOf(plan.def);
  return {
    name: plan.def.name,
    basics: audience === 'basics',
    subtitle: planSubtitle(plan),
    inSeason: plan.def.inSeason != null,
    askLastOuting: view.askLastOuting,
    kind: view.decision.kind,
    todayState: view.todayState,
    day: view.day,
    dayLabel: view.dayLabel,
    /* 시즌 중 다음 세션 종류는 그날 상태로 정해서 아직 모른다 — 번호만 */
    nextLabel:
      nextDay > plan.totalDays ? null : plan.def.inSeason ? `${nextDay}번 세션` : dayLabel(plan, nextDay),
    completed: view.completed,
    skipped: view.skipped,
    total: plan.totalDays,
    caution: view.caution,
    restText: view.restText,
    rows: view.rows.map((r) => ({
      id: r.exercise.id,
      title: r.exercise.title,
      slotLabel: variantLabel(r.variant, audience),
      kg: r.suggestion?.kg ?? null,
      perHand: weightKindOf(r.exercise.equipment) === 'dumbbell',
      amount: r.rx.sets.every(
        (x) => x.reps === r.rx.sets[0].reps && x.pct === r.rx.sets[0].pct && !x.plus
      )
        ? `${r.sets} × ${r.rx.reps}`
        : `${r.sets}세트`,
      line: r.line,
      tag: r.substituteFor ? `대체 · ${r.substituteFor.reason}` : r.tag,
      reason: r.reason,
      warmup: r.warmup,
      substituteFor: r.substituteFor?.title ?? null,
      contrast: r.contrast,
      optional: isOptionalProgramExercise({ programSlot: { variant: r.variant }, equipment: r.exercise.equipment }),
      first: r.suggestion != null && r.suggestion.kg == null,
    })),
    dropped: view.dropped.map((d) => ({ title: d.title, reason: d.reason })),
    pinned: usedVariants(plan.def).map((v) => ({
      variant: v,
      label: variantLabel(v, audience),
      title: pinned[v] ? (byId.get(pinned[v] as string) ?? null) : null,
    })),
    /* 시즌 중은 세션 종류를 그날 상태(등판 며칠 뒤 · 어제 몇 구)로 정해 앞날을 모른다 — 오늘 종류로 앞날을 다 그리면 틀린다 */
    upcoming: (plan.def.inSeason ? [] : Array.from({ length: Math.max(0, plan.totalDays - nextDay + 1) }, (_, k) => nextDay + k)).map((d) => ({
      day: d,
      label: dayLabel(plan, d),
      items: dayPlan(plan, d).items.map((rx) => ({
        /* 보조 칸은 세션마다 바뀌어 미리 이름을 못 박는다 — 칸 이름으로 */
        title:
          (!ROTATING_VARIANTS.includes(rx.variant) &&
            pinned[rx.variant] &&
            byId.get(pinned[rx.variant] as string)) ||
          variantLabel(rx.variant, audience),
        line: prescriptionLine(rx),
      })),
    })),
  };
}

/* ─────────────────────────── 다 마쳤을 때(§13-13) ─────────────────────────── */

export type ProgramResult = {
  name: string;
  /** 기본기 4주 — 무게가 없어 추정 최대 대신 다음 길을 말한다 */
  basics: boolean;
  completed: number;
  skipped: number;
  weeks: number;
  lifts: { label: string; title: string; from: number | null; to: number | null }[];
};

/**
 * 큰 운동(스쿼트 · 힌지 · 밀기 · 당기기 중 그 프로그램이 쓰는 것)의 추정 최대 — 처음 6번 중 최고 → 마지막 6번 중 최고.
 * 숫자 그대로 보인다(안 올랐으면 화면이 '이번엔 그대로예요'). 모르는 프로그램 키면 null.
 */
export async function programResult(
  row: ProgramRow,
  library: readonly CachedExercise[]
): Promise<ProgramResult | null> {
  const plan = parseProgram(row.programKey);
  if (!plan) return null;
  if (audienceOf(plan.def) === 'basics') {
    const { completed, skipped } = progressOf(row, plan);
    const startKey = toDateKey(row.startedAt);
    const endKey = toDateKey(row.endedAt ?? appNow());
    return {
      name: plan.def.name,
      basics: true,
      completed,
      skipped,
      weeks: Math.max(1, Math.ceil(daysBetween(startKey, endKey) / 7)),
      lifts: [],
    };
  }
  const pinned = readPinned(row.pinned);
  const byId = new Map(library.map((e) => [e.id, e.title]));
  const used = usedVariants(plan.def);
  const lifts = (['squat', 'hinge', 'push', 'pull'] as const).filter((v) =>
    used.includes(v)
  );
  const ids = lifts.map((v) => pinned[v]).filter((id): id is string => !!id);
  /* 한국 날짜로 — 기록 · 기준 무게(trainingMaxes)와 같은 하루 */
  const endKey = toDateKey(row.endedAt ?? appNow());
  const history = await programHistory(row.userId, ids, endKey);
  const startKey = toDateKey(row.startedAt);
  const { completed, skipped } = progressOf(row, plan);
  const best = (list: HistoryEntry[]) =>
    list.reduce<number | null>((m, e) => {
      const v =
        e.lastWeightKg && e.lastReps ? estimate1RM(e.lastWeightKg, e.lastReps) : null;
      return v != null && (m == null || v > m) ? v : m;
    }, null);
  return {
    name: plan.def.name,
    basics: false,
    completed,
    skipped,
    weeks: Math.max(1, Math.ceil(daysBetween(startKey, endKey) / 7)),
    lifts: lifts
      .filter((v) => pinned[v])
      .map((v) => {
        const id = pinned[v] as string;
        const mine = (history.get(id) ?? [])
          .filter((e) => e.date >= startKey && !e.light)
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        return {
          label: variantLabel(v),
          title: byId.get(id) ?? '',
          from: best(mine.slice(0, 6)),
          to: best(mine.slice(-6)),
        };
      }),
  };
}

/**
 * 시즌 중 프로그램의 오늘 세션 종류(program.ts inSeasonKind) — 재료는 facts(마지막 경기 날 · 어제 · 그저께 투구 수)와 마지막 프로그램 날.
 * 시즌 중이 아니면 undefined, 움직임만 하는 날이면 null.
 */
export function inSeasonKindOf(
  plan: ProgramPlan,
  facts: ReportFacts,
  lastProgramDate: string | null,
  nextDay: number
): SessionKind | null | undefined {
  const role = plan.def.inSeason;
  if (!role) return undefined;
  const lastGame = lastOutingDateOf(facts);
  const pitchesAgo = (n: number) =>
    facts.patterns.recentOutings.find((o) => o.daysAgo === n)?.pitches ?? 0;
  return inSeasonKind(role, {
    daysSinceGame: lastGame ? daysBetween(lastGame, facts.asOf) : null,
    pitchesYesterday: pitchesAgo(1),
    pitchesTwoDaysAgo: pitchesAgo(2),
    daysSinceLift: lastProgramDate ? daysBetween(lastProgramDate, facts.asOf) : null,
    day: nextDay,
  });
}
