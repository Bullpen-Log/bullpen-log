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
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { estimate1RM } from '@/lib/workout/history';
import { toDateKey } from '@/lib/pitch-stats';
import {
  CAUTION_TEXT,
  TM_LOOKBACK_DAYS,
  REST_TEXT,
  PROGRAMS,
  audienceOf,
  basicsDoneEnough,
  daysBetween,
  dayLabel,
  dayPlan,
  decideToday,
  lighterRx,
  parseProgram,
  planSubtitle,
  prescriptionLine,
  readPinned,
  usedVariants,
  variantCandidates,
  variantLabel,
  warmupLine,
  type ItemRx,
  type Pinned,
  type ProgramPlan,
  type RecoveryReason,
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
  core: TodayCore,
  row: ProgramRow,
  user: { id: string; ownedEquipment: string[]; trainingLevel: string | null }
): Promise<ProgramDayView | null> {
  const plan = parseProgram(row.programKey);
  if (!plan) return null;
  const todayKey = core.todayKey;
  const facts = core.facts;
  const [throwing, session, lastProgramDate] = await Promise.all([
    throwSignals(user.id, todayKey),
    todaySession(user.id, core.midnight),
    row.lastDoneDate
      ? Promise.resolve(keyOf(row.lastDoneDate))
      : lastProgramSessionKey(user.id, core.midnight),
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

  const day = Math.min(row.nextDay, plan.totalDays + 1);
  const pinned = readPinned(row.pinned);
  /* 다 끝났으면 마지막 날 목록(그리지는 않는다) */
  const items = dayPlan(plan, day).items;
  const owned = user.ownedEquipment;
  /* 기본기는 고르는 규칙이 다르다(바벨 없이) — 다시 고정 · 그날 대체도 같은 규칙으로 */
  const audience = audienceOf(plan.def);

  /* 고정 운동이 숨겨졌으면 같은 칸에서 다시 고른다(§3) */
  const repin: Pinned = {};
  const pinnedFor = (
    v: VariantKey
  ): { ex: CachedExercise | null; repinned: boolean } => {
    const id = pinned[v];
    const ex = id ? byId.get(id) : undefined;
    if (ex) return { ex, repinned: false };
    const next =
      variantCandidates(v, core.library, owned, user.trainingLevel, audience)[0] ?? null;
    if (next) repin[v] = next.id;
    return { ex: next, repinned: next != null };
  };

  const painSlots: SlotKind[] = [];
  for (const x of items) {
    const { ex } = pinnedFor(x.variant);
    if (ex && !safeIds.has(ex.id) && !painSlots.includes(x.slot)) painSlots.push(x.slot);
  }

  const decision = decideToday(plan, {
    nextDay: row.nextDay,
    today: todayKey,
    lastProgramDate,
    checkedIn: core.hasCheckinToday,
    /* 다른 방식이나 다른 프로그램(같은 날 바꿔 시작)으로 오늘 이미 운동했으면 기다린다 */
    otherWorkoutStarted: session != null && session.program?.key !== row.programKey,
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
    restText: decision.kind === 'rest' ? REST_TEXT[decision.reason] : null,
    rows: [],
    dropped: [],
    repin,
  };
  if (day > plan.totalDays) return view;

  /* 하는 날이 아니어도 목록은 만든다 — 쉬는 날 · 체크인 전에는 흐린 미리보기로 보인다 */
  const adjust = decision.kind === 'go' ? decision.adjust : {};
  const gapDays = decision.kind === 'go' ? decision.gapDays : null;

  const chosen: {
    rx: ItemRx;
    ex: CachedExercise;
    substituteFor: ProgramDayRow['substituteFor'];
    repinned: boolean;
  }[] = [];
  for (const rx of items) {
    const { slot, variant } = rx;
    const a = adjust[slot];
    const { ex: pinnedEx, repinned } = pinnedFor(variant);
    if (!pinnedEx) {
      view.dropped.push({
        slot,
        title: variantLabel(variant, audience),
        reason: '할 수 있는 운동이 없어요',
      });
      continue;
    }
    if (a?.kind === 'drop') {
      view.dropped.push({ slot, title: pinnedEx.title, reason: a.reason });
      continue;
    }
    /* 대체는 그 운동이 통증 부위에 걸릴 때만 — 같은 칸의 다른 운동(스쿼트 · 힌지처럼 한 날 둘)은 그대로 */
    if (a?.kind === 'substitute' && !safeIds.has(pinnedEx.id)) {
      const sub = variantCandidates(
        variant,
        core.library,
        owned,
        user.trainingLevel,
        audience
      ).find((c) => c.id !== pinnedEx.id && safeIds.has(c.id));
      if (!sub) {
        view.dropped.push({ slot, title: pinnedEx.title, reason: '오늘 몸 상태' });
        continue;
      }
      chosen.push({
        rx,
        ex: sub,
        substituteFor: { title: pinnedEx.title, reason: '통증 부위' },
        repinned: false,
      });
      continue;
    }
    chosen.push({ rx, ex: pinnedEx, substituteFor: null, repinned });
  }

  const pctIds = chosen.filter((c) => c.rx.mode === 'pct').map((c) => c.ex.id);
  const [history, tms] = await Promise.all([
    programHistory(
      user.id,
      chosen.map((c) => c.ex.id),
      todayKey
    ),
    /* 시작한 날 — 그 사람의 하루(한국 날짜)로 */
    trainingMaxes(user.id, pctIds, toDateKey(row.startedAt), todayKey),
  ]);

  for (const c of chosen) {
    const a = adjust[c.rx.slot] ?? null;
    const lighter = a?.kind === 'lighter' || (a?.kind === 'substitute' && a.lighter === true);
    const rx = lighter ? lighterRx(c.rx) : c.rx;
    const { suggestion, kgs } = weighItem(rx, c.ex, {
      adjusted: lighter,
      gapDays,
      history: history.get(c.ex.id) ?? [],
      tmKg: tms.get(c.ex.id) ?? null,
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

/* ─────────────────────────── 화면에 넘길 모양 ─────────────────────────── */

/** 트레이닝 카드(program-card.tsx)가 받는 것 — 날짜 · Json · 라이브러리 줄 없이 글과 숫자만 */
export type ProgramCardProps = {
  name: string;
  /** 기본기 4주인가 — 카드 머리가 '기본기 프로그램' */
  basics: boolean;
  /** '12회 · 주 3번 · 4주' */
  subtitle: string;
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
  const plan = view.plan;
  const audience = audienceOf(plan.def);
  return {
    name: plan.def.name,
    basics: audience === 'basics',
    subtitle: planSubtitle(plan),
    kind: view.decision.kind,
    todayState: view.todayState,
    day: view.day,
    dayLabel: view.dayLabel,
    nextLabel: nextDay <= plan.totalDays ? dayLabel(plan, nextDay) : null,
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
      first: r.suggestion != null && r.suggestion.kg == null,
    })),
    dropped: view.dropped.map((d) => ({ title: d.title, reason: d.reason })),
    pinned: usedVariants(plan.def).map((v) => ({
      variant: v,
      label: variantLabel(v, audience),
      title: pinned[v] ? (byId.get(pinned[v] as string) ?? null) : null,
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
    const endKey = toDateKey(row.endedAt ?? new Date());
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
  const endKey = toDateKey(row.endedAt ?? new Date());
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
