import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HIGH_SORENESS, SEVERE_SORENESS, isShortSleep } from '@/lib/checkin';
import { selectCandidates } from '@/lib/report/prescription';
import {
  LOW_CONDITION_THRESHOLD,
  hardOuting,
  painRecoveryReason,
} from '@/lib/report/theme';
import type { loadTodayCore } from '@/lib/report/today-data';
import type { CachedExercise } from '@/lib/library-cache';
import { readFrozenPlan, type FrozenExercise } from '@/lib/workout/session-plan';
import { estimate1RM } from '@/lib/workout/history';
import {
  CAUTION_TEXT,
  FIRST_PROGRAM,
  REST_TEXT,
  TOTAL_DAYS,
  VARIANT_KEYS,
  VARIANT_LABELS,
  WEIGHTED_SLOTS,
  daysBetween,
  dayLabel,
  daySlotOrder,
  dayVariants,
  decideToday,
  isContrastPower,
  prescriptionLine,
  readPinned,
  setsNeeded,
  slotPrescription,
  variantCandidates,
  warmupLine,
  type Pinned,
  type RecoveryReason,
  type SlotAdjust,
  type SlotKind,
  type SlotRx,
  type TodayDecision,
  type VariantKey,
} from '@/lib/program/program';
import {
  reasonText,
  suggestWeight,
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

/* ─────────────────────────── 오늘 신호 ─────────────────────────── */

async function throwSignals(userId: string, todayKey: string) {
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const [checkins, pitches] = await Promise.all([
    prisma.dailyCheckin.findMany({
      where: { userId, date: { in: [today, yesterday] } },
      select: { date: true, throwPlan: true },
    }),
    prisma.pitchLog.findMany({
      where: { userId, date: { in: [today, yesterday] } },
      select: { date: true, sessionType: true },
    }),
  ]);
  const planOn = (d: Date) =>
    checkins.find((c) => keyOf(c.date) === keyOf(d))?.throwPlan ?? null;
  const typesOn = (d: Date) =>
    pitches.filter((p) => keyOf(p.date) === keyOf(d)).map((p) => p.sessionType);
  const planToday = planOn(today);
  const planYesterday = planOn(yesterday);
  return {
    /* 오늘 등판 · 어제 '내일 등판' · 오늘 경기 기록 */
    gameToday:
      planToday === '오늘 등판' ||
      planYesterday === '내일 등판' ||
      typesOn(today).includes('경기'),
    gameTomorrow: planToday === '내일 등판',
    /* 어제 '오늘 등판' · 어제 경기 기록 */
    gameYesterday: planYesterday === '오늘 등판' || typesOn(yesterday).includes('경기'),
    bullpenToday:
      planToday === '오늘 불펜' ||
      typesOn(today).some((t) => t === '불펜' || t === '라이브'),
  };
}

/** 오늘 운동한 판 — 프로그램 날인지와 상태 */
async function todaySession(userId: string, midnight: Date) {
  const s = await prisma.trainingSession.findUnique({
    where: { userId_date: { userId, date: midnight } },
    select: { id: true, status: true, plan: true },
  });
  if (!s) return null;
  const plan = readFrozenPlan(s.plan);
  return { id: s.id, status: s.status, program: plan?.program ?? null };
}

/* ─────────────────────────── 지난 기록 ─────────────────────────── */

/**
 * 운동마다 지난 프로그램 기록(무게 추천의 기준) — 지난 판(같은 프로그램을 다시 한 경우)도 함께 본다(§13-13).
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
      plan: { path: ['program', 'key'], equals: FIRST_PROGRAM.key },
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

function historyEntry(
  date: string,
  ex: FrozenExercise,
  sets: {
    setNo: number;
    weightKg: number | null;
    reps: number | null;
    rir: number | null;
  }[]
): HistoryEntry {
  const planned = ex.plannedSets ?? sets.length;
  const plannedReps = ex.plannedReps ?? 0;
  const last = sets[sets.length - 1];
  const working = sets.slice(0, planned);
  return {
    date,
    prescribedReps: plannedReps,
    reserve: ex.programSlot?.reserve ?? null,
    light: ex.programSlot?.light ?? false,
    adjusted: ex.programSlot?.adjusted ?? false,
    halfDone: sets.length >= setsNeeded(planned),
    lastWeightKg: last.weightKg,
    lastReps: last.reps,
    rir: last.rir,
    hitReps:
      working.length >= planned && working.every((x) => (x.reps ?? 0) >= plannedReps),
  };
}

/* ─────────────────────────── 오늘 프로그램 날 ─────────────────────────── */

export type ProgramDayRow = {
  slot: SlotKind;
  variant: VariantKey;
  exercise: CachedExercise;
  rx: SlotRx;
  /** 세트 기록 화면의 처방 한 줄 */
  line: string;
  /** '−1세트' 같은 조정 뒤 세트 수 */
  sets: number;
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
  /** 5~7주 대비 짝인가 */
  contrast: boolean;
};

export type ProgramDayView = {
  row: ProgramRow;
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
};

export function progressOf(row: ProgramRow): { completed: number; skipped: number } {
  const passed = Math.min(TOTAL_DAYS, row.nextDay - 1);
  return { completed: Math.max(0, passed - row.skippedDays), skipped: row.skippedDays };
}

/**
 * 오늘 프로그램 날을 만든다. 카드도, 운동 시작도 이것 하나를 쓴다.
 */
export async function buildProgramDay(
  core: TodayCore,
  row: ProgramRow,
  user: { id: string; ownedEquipment: string[]; trainingLevel: string | null }
): Promise<ProgramDayView> {
  const todayKey = core.todayKey;
  const facts = core.facts;
  const [throwing, session] = await Promise.all([
    throwSignals(user.id, todayKey),
    todaySession(user.id, core.midnight),
  ]);

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
  const safe = selectCandidates({
    facts,
    plan: core.plan,
    library: core.library,
    partsOnly: true,
  });
  const safeIds = new Set(safe.candidates.map((e) => e.id));
  const byId = new Map(core.library.map((e) => [e.id, e]));

  const day = Math.min(row.nextDay, TOTAL_DAYS + 1);
  const pinned = readPinned(row.pinned);
  const variants = dayVariants(Math.min(day, TOTAL_DAYS));
  const owned = user.ownedEquipment;

  /* 고정 운동이 숨겨졌으면 같은 칸에서 다시 고른다(§3) */
  const repin: Pinned = {};
  const pinnedFor = (
    v: VariantKey
  ): { ex: CachedExercise | null; repinned: boolean } => {
    const id = pinned[v];
    const ex = id ? byId.get(id) : undefined;
    if (ex) return { ex, repinned: false };
    const next =
      variantCandidates(v, core.library, owned, user.trainingLevel)[0] ?? null;
    if (next) repin[v] = next.id;
    return { ex: next, repinned: next != null };
  };

  const painSlots: SlotKind[] = [];
  for (const slot of daySlotOrder(Math.min(day, TOTAL_DAYS))) {
    const { ex } = pinnedFor(variants[slot]);
    if (ex && !safeIds.has(ex.id)) painSlots.push(slot);
  }

  const decision = decideToday({
    nextDay: row.nextDay,
    today: todayKey,
    lastProgramDate: keyOf(row.lastDoneDate),
    checkedIn: core.hasCheckinToday,
    otherWorkoutStarted: session != null && session.program == null,
    halted: core.picked.halted,
    ...throwing,
    hardThrowRecent: hardOuting(facts) != null,
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
  });

  const { completed, skipped } = progressOf(row);
  const todayState: ProgramDayView['todayState'] =
    session?.program == null
      ? 'none'
      : session.status === 'ACTIVE'
        ? 'active'
        : 'finished';

  const view: ProgramDayView = {
    row,
    decision,
    todayState,
    day,
    dayLabel: day <= TOTAL_DAYS ? dayLabel(day) : '다 마쳤어요',
    completed,
    skipped,
    caution:
      decision.kind === 'go' && decision.caution
        ? CAUTION_TEXT[decision.caution]
        : null,
    restText: decision.kind === 'rest' ? REST_TEXT[decision.reason] : null,
    rows: [],
    dropped: [],
    repin,
  };
  if (day > TOTAL_DAYS) return view;

  /* 하는 날이 아니어도 목록은 만든다 — 쉬는 날 · 체크인 전에는 흐린 미리보기로 보인다 */
  const adjust = decision.kind === 'go' ? decision.adjust : {};
  const gapDays = decision.kind === 'go' ? decision.gapDays : null;
  const week = Math.ceil(day / 3);

  const chosen: {
    slot: SlotKind;
    ex: CachedExercise;
    substituteFor: ProgramDayRow['substituteFor'];
    repinned: boolean;
  }[] = [];
  for (const slot of daySlotOrder(day)) {
    const variant = variants[slot];
    const a = adjust[slot];
    const { ex: pinnedEx, repinned } = pinnedFor(variant);
    if (!pinnedEx) {
      view.dropped.push({
        slot,
        title: variantTitle(variant),
        reason: '할 수 있는 운동이 없어요',
      });
      continue;
    }
    if (a?.kind === 'drop') {
      view.dropped.push({ slot, title: pinnedEx.title, reason: a.reason });
      continue;
    }
    if (a?.kind === 'substitute') {
      const sub = variantCandidates(
        variant,
        core.library,
        owned,
        user.trainingLevel
      ).find((c) => c.id !== pinnedEx.id && safeIds.has(c.id));
      if (!sub) {
        view.dropped.push({ slot, title: pinnedEx.title, reason: '오늘 몸 상태' });
        continue;
      }
      chosen.push({
        slot,
        ex: sub,
        substituteFor: { title: pinnedEx.title, reason: '통증 부위' },
        repinned: false,
      });
      continue;
    }
    chosen.push({ slot, ex: pinnedEx, substituteFor: null, repinned });
  }

  const history = await programHistory(
    user.id,
    chosen.map((c) => c.ex.id),
    todayKey
  );

  for (const c of chosen) {
    const variant = variants[c.slot];
    const rx = slotPrescription(c.slot, variant, week);
    const a = adjust[c.slot] ?? null;
    const lighter = a?.kind === 'lighter';
    const sets = lighter ? Math.max(1, rx.sets - 1) : rx.sets;
    const weighted = WEIGHTED_SLOTS.includes(c.slot);
    const suggestion = weighted
      ? suggestWeight({
          kind: weightKindOf(c.ex.equipment),
          bigLower: c.slot === 'bigLower',
          reps: rx.reps,
          reserve: rx.reserve,
          light: rx.light,
          adjusted: lighter,
          gapDays,
          history: history.get(c.ex.id) ?? [],
        })
      : null;
    view.rows.push({
      slot: c.slot,
      variant,
      exercise: c.ex,
      rx,
      line: prescriptionLine({ ...rx, sets }, c.ex.perSide),
      sets,
      adjust: a,
      substituteFor: c.substituteFor,
      repinned: c.repinned,
      suggestion,
      tag: lighter ? '−10% · −1세트' : suggestion ? weightTag(suggestion) : null,
      reason: suggestion ? reasonText(suggestion) : null,
      warmup:
        c.slot === 'bigLower' && c.ex.equipment.includes('바벨')
          ? warmupLine(suggestion?.kg ?? null)
          : null,
      contrast: c.slot === 'power' && isContrastPower(day),
    });
  }
  return view;
}

function variantTitle(v: VariantKey): string {
  return {
    squat: '스쿼트',
    hinge: '힌지',
    push: '밀기',
    pull: '당기기',
    singleLeg: '한쪽 하체',
    jump: '점프',
    medball: '메디신볼',
    antiRotation: '몸통',
    rotationalThrow: '회전 던지기',
  }[v];
}

/* ─────────────────────────── 화면에 넘길 모양 ─────────────────────────── */

/** 트레이닝 카드(program-card.tsx)가 받는 것 — 날짜 · Json · 라이브러리 줄 없이 글과 숫자만 */
export type ProgramCardProps = {
  name: string;
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
    sets: number;
    reps: number;
    line: string;
    tag: string | null;
    reason: string | null;
    warmup: string | null;
    substituteFor: string | null;
    contrast: boolean;
    first: boolean;
  }[];
  dropped: { title: string; reason: string }[];
  pinned: { variant: VariantKey; label: string; title: string | null }[];
};

export function programCardProps(
  view: ProgramDayView,
  library: readonly CachedExercise[]
): ProgramCardProps {
  const byId = new Map(library.map((e) => [e.id, e.title]));
  const pinned = { ...readPinned(view.row.pinned), ...view.repin };
  const nextDay = view.day + (view.todayState === 'finished' ? 0 : 1);
  return {
    name: FIRST_PROGRAM.name,
    kind: view.decision.kind,
    todayState: view.todayState,
    day: view.day,
    dayLabel: view.dayLabel,
    nextLabel: nextDay <= TOTAL_DAYS ? dayLabel(nextDay) : null,
    completed: view.completed,
    skipped: view.skipped,
    total: TOTAL_DAYS,
    caution: view.caution,
    restText: view.restText,
    rows: view.rows.map((r) => ({
      id: r.exercise.id,
      title: r.exercise.title,
      slotLabel: VARIANT_LABELS[r.variant],
      kg: r.suggestion?.kg ?? null,
      perHand: weightKindOf(r.exercise.equipment) === 'dumbbell',
      sets: r.sets,
      reps: r.rx.reps,
      line: r.line,
      tag: r.substituteFor ? `대체 · ${r.substituteFor.reason}` : r.tag,
      reason: r.reason,
      warmup: r.warmup,
      substituteFor: r.substituteFor?.title ?? null,
      contrast: r.contrast,
      first: r.suggestion != null && r.suggestion.kg == null,
    })),
    dropped: view.dropped.map((d) => ({ title: d.title, reason: d.reason })),
    pinned: VARIANT_KEYS.map((v) => ({
      variant: v,
      label: VARIANT_LABELS[v],
      title: pinned[v] ? (byId.get(pinned[v] as string) ?? null) : null,
    })),
  };
}

/* ─────────────────────────── 다 마쳤을 때(§13-13) ─────────────────────────── */

export type ProgramResult = {
  name: string;
  completed: number;
  skipped: number;
  weeks: number;
  lifts: { label: string; title: string; from: number | null; to: number | null }[];
};

/**
 * 큰 운동 넷(스쿼트 · 힌지 · 밀기 · 당기기)의 추정 최대 — 처음 6번 중 최고 → 마지막 6번 중 최고.
 * 숫자 그대로 보인다(안 올랐으면 화면이 '이번엔 그대로예요').
 */
export async function programResult(
  row: ProgramRow,
  library: readonly CachedExercise[]
): Promise<ProgramResult> {
  const pinned = readPinned(row.pinned);
  const byId = new Map(library.map((e) => [e.id, e.title]));
  const lifts: VariantKey[] = ['squat', 'hinge', 'push', 'pull'];
  const ids = lifts.map((v) => pinned[v]).filter((id): id is string => !!id);
  const endKey = (row.endedAt ?? new Date()).toISOString().slice(0, 10);
  const history = await programHistory(row.userId, ids, endKey);
  const startKey = row.startedAt.toISOString().slice(0, 10);
  const { completed, skipped } = progressOf(row);
  const best = (list: HistoryEntry[]) =>
    list.reduce<number | null>((m, e) => {
      const v =
        e.lastWeightKg && e.lastReps ? estimate1RM(e.lastWeightKg, e.lastReps) : null;
      return v != null && (m == null || v > m) ? v : m;
    }, null);
  return {
    name: FIRST_PROGRAM.name,
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
          label: VARIANT_LABELS[v],
          title: byId.get(id) ?? '',
          from: best(mine.slice(0, 6)),
          to: best(mine.slice(-6)),
        };
      }),
  };
}
