'use server';

import { ASSIST_TOOLS, applyAssist } from '@/lib/coach/assist';
import { cardDayOk } from '@/lib/coach/tool-defs';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { coachPaid } from '@/lib/coach-access';
import { ageOn } from '@/lib/analysis-consent';
import { coachAiConsentFor, consentRecordsOf, healthConsentFor } from '@/lib/analysis-consent-store';
import { HEALTH_PURPOSE, healthCutoffOf, historyFloorOf } from '@/lib/health-consent';
import { COACH_AI_CONSENT, COACH_AI_PURPOSE } from '@/lib/coach/ai-consent';
import { AI_BLOCK_TEXT, AI_MIN_AGE, aiGate, capUsdOf, type AiGate } from '@/lib/coach/ai-gate';
import { costMicroOf } from '@/lib/coach/ai-price';
import { ageBandOf, contextBlock, guardPitchReply, scrubCodes, scrubNames, throwsOf, type CoachAiContext, type CoachAiPitchPlan, type CoachAiWorkout } from '@/lib/coach/ai-prompt';
import { loadTrainingToday, type TrainingToday } from '@/lib/report/training-today-data';
import { dailyPitchCap } from '@/lib/report/plan';
import { COACH_MODEL_CHAT, aiKeyReady, chatTurn, type ChatLine } from '@/lib/coach/ai';
import type { CoachAdjust } from '@/lib/coach/adjust';
import { readCards, shownCard, type CoachCard } from '@/lib/coach/card';
import { toolboxOf, type TodayWork } from '@/lib/coach/tools';
import { remakeToday } from '@/lib/coach/today-sync';
import { decideVolume } from '@/lib/report/volume';
import { loadTodayPicker } from '@/lib/report/training-today-data';
import { findFocus } from '@/lib/report/personalize';
import { pickWorkoutKind } from '@/lib/checkin';
import { saveTrainingPrefs } from '@/app/actions/day-cards';
import { addToTodayPlan, removeFromTodayPlan } from '@/app/actions/plan-edit';
import { applyCoachAdjust } from '@/app/actions/coach';
import { COACH_LIMITS, COACH_PRIORITIES, COACH_ROLES, WEEKDAY_LABELS, reasonTextsFor, savedOf, slotLine } from '@/lib/coach/answers';
import { slotProgressOf, slotStateOf } from '@/lib/coach/status';
import { followupReasonText } from '@/lib/coach/followup';
import { coachWeekBase } from '@/lib/coach/today';
import { withTodayCut } from '@/lib/coach/refresh';
import { coachProgressOf, coachRecordsOf } from '@/lib/coach/records';
import {
  applyGoalAnswer,
  goalCardOf,
  goalFromProposal,
  goalLine,
  readGoalAnswer,
  sanitizeGoal,
  type CoachGoalState,
  type GoalCard,
  type GoalOffer,
} from '@/lib/coach/goal';
import { readAct, type CoachAct } from '@/lib/coach/act';
import { goalLogsOf, goalStateOf } from '@/lib/coach/goal-db';
import { loadTrainingDone } from '@/lib/training-week';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { ARM_LEVEL_LABEL, armStatusOf } from '@/lib/report/arm-status';
import { planReasonLines, readDailyPlan } from '@/lib/report/daily-plan';

/**
 * 코치 AI 대화(docs/designs/ai-coach.md 10-6) — 앱 코치 탭의 대화 시트. 답 글 + 바꿀 거리(거른 것만) → 미리보기 · 적용은 조정 단추와 같은 길
 * (app/actions/coach.ts previewCoachAdjust · applyCoachAdjust). AI 가 저장 · 적용하지 않는다.
 * 막는 판정은 lib/coach/ai-gate.ts 하나(국외 이전 동의 · 만 14세 · 열쇠 · 월 상한 · 하루 80마디). 대화는 30일 둔다(크론이 지움).
 * 출시 전 베타에는 모듈째 잠긴다(lib/release-ops.ts 'coach-chat' = 'analysis').
 */

const KEEP_DAYS = 30;
const HISTORY_TURNS = 20;
const MAX_TEXT = 500;

type User = Awaited<ReturnType<typeof requireUser>>;

/**
 * 실제 지금의 한국 날짜의 시작 · 이번 달 시작(UTC 로) — 하루 마디 수(AI_DAILY_CHATS) · 월 상한 셈. CoachLog.createdAt 이 실제 시각이라 시뮬 날짜
 * (appNow) · 기기 시간대로 창을 잡으면 해외 · 시험 계정에서 전날 마디가 세지거나 한도가 안 걸렸다(2026-11-17 검토 [25], 설계 '한국 날짜').
 */
function windowsOf() {
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return { dayStart: new Date(`${today}T00:00:00+09:00`), monthStart: new Date(`${today.slice(0, 8)}01T00:00:00+09:00`) };
}

async function gateFor(user: User, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<{ gate: AiGate; consented: boolean }> {
  const { dayStart, monthStart } = windowsOf();
  const [consent, month, todayChats] = await Promise.all([
    coachAiConsentFor(user.id),
    db.coachLog.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costMicro: true } }),
    db.coachLog.count({ where: { userId: user.id, kind: 'chat', createdAt: { gte: dayStart } } }),
  ]);
  const gate = aiGate('chat', {
    consent: consent.valid,
    age: ageOn(user.birthDate, appNow()),
    hasKey: aiKeyReady(),
    capUsd: capUsdOf(process.env.COACH_AI_MONTHLY_USD),
    monthCostMicro: month._sum.costMicro ?? 0,
    todayChats,
  });
  return { gate, consented: consent.valid };
}

async function activeCoach(user: User): Promise<boolean> {
  if (!(await coachPaid(user))) return false;
  const p = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true } });
  return p?.status === 'active';
}

type ShownCard = Omit<CoachCard, 'args'>;
/** 카드들 → act 칸(JSON) */
const cardsJson = (cards: CoachCard[]) => ({ cards }) as unknown as Prisma.InputJsonObject;
type ShownMessage = { id: string; role: 'user' | 'coach'; text: string; adjusts: CoachAdjust[]; goal: GoalOffer | null; act: CoachAct | null; cards: ShownCard[] };

/** 투구 기록 초안(옛 대신 해 주기 · 카드)은 그날 그 종류 기록이 이미 있으면 '기록함'으로(남긴 뒤 · 다른 데서 먼저 남긴 것 모두) — 조회 한 번 */
async function markLogged<T extends { act: CoachAct | null; cards: ShownCard[] }>(userId: string, items: T[]): Promise<T[]> {
  const logDates = (m: T) => [...(m.act?.kind === 'log' ? [m.act.date] : []), ...m.cards.flatMap((c) => (c.open?.kind === 'log' ? [c.open.date] : []))];
  const dates = [...new Set(items.flatMap(logDates))];
  if (!dates.length) return items;
  const logs = await prisma.pitchLog.findMany({ where: { userId, date: { in: dates.map(dbDate) } }, select: { date: true, sessionType: true } });
  const have = new Set(logs.map((l) => `${keyOfDbDate(l.date)}|${l.sessionType}`));
  return items.map((m) => ({
    ...m,
    act: m.act?.kind === 'log' && have.has(`${m.act.date}|${m.act.type}`) ? { ...m.act, done: true } : m.act,
    cards: m.cards.map((c) => (c.open?.kind === 'log' && have.has(`${c.open.date}|${c.open.type}`) ? { ...c, done: true } : c)),
  }));
}

/** 대화 시트 — 동의했나 · 막힘 글 · 남은 마디 · 최근 대화(30일, 40마디) */
export async function loadCoachChat() {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { ok: false as const, error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const [{ gate, consented }, rows, profile] = await Promise.all([
    gateFor(user),
    prisma.coachMessage.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - KEEP_DAYS * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, role: true, text: true, adjusts: true, goal: true, act: true },
    }),
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { nudges: true } }),
  ]);
  const shown: ShownMessage[] = rows.reverse().map((m) => ({
    id: m.id,
    role: m.role === 'user' ? 'user' : 'coach',
    text: m.text,
    adjusts: Array.isArray(m.adjusts) ? (m.adjusts as CoachAdjust[]) : [],
    goal: m.goal && typeof m.goal === 'object' ? (m.goal as GoalOffer) : null,
    /* act 칸에는 옛 대신 해 주기 하나 또는 카드들({ cards }, 개인 비서 1단계)이 있다 */
    act: readCards(m.act) ? null : readAct(m.act),
    cards: (readCards(m.act) ?? []).map(shownCard),
  }));
  const messages = await markLogged(user.id, shown);
  return {
    ok: true as const,
    consented,
    consent: COACH_AI_CONSENT,
    block: gate.ok || gate.why === 'consent' ? null : AI_BLOCK_TEXT[gate.why],
    left: gate.ok ? gate.left : 0,
    messages,
    /* 코치가 먼저 말 걸기(자비스 3단계, lib/coach/nudge.ts) 켬 · 끔 */
    nudges: profile?.nudges ?? true,
  };
}

/** 코치가 먼저 말 걸기 켜고 끄기(코치 설정) — 목표 · 통증 알림이 모두 이것 하나를 본다 */
export async function setCoachNudges(on: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (typeof on !== 'boolean') return { error: '다시 눌러 주세요.' };
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  await prisma.coachProfile.update({ where: { userId: user.id }, data: { nudges: on } });
  return { ok: true };
}

/** 국외 이전 동의(U43) — 코치 진행 중 · 만 14세 이상만 */
export async function agreeCoachAi(version: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (version !== COACH_AI_CONSENT.version) return { error: '동의 내용이 바뀌었어요. 다시 읽고 동의해 주세요.' };
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const age = ageOn(user.birthDate, appNow());
  if (age == null || age < AI_MIN_AGE) return { error: AI_BLOCK_TEXT.age };
  if ((await coachAiConsentFor(user.id)).valid) return { ok: true };
  await prisma.analysisConsent.create({ data: { userId: user.id, version: COACH_AI_CONSENT.version, source: 'first_use', purpose: COACH_AI_PURPOSE } });
  return { ok: true };
}

/** 'AI 끄기' — 동의를 거두고 대화 기록을 지운다. 코치는 그대로(규칙 · 정해진 문장) */
export async function revokeCoachAi(): Promise<{ ok: true }> {
  const user = await requireUser();
  await prisma.$transaction([
    prisma.analysisConsent.updateMany({ where: { userId: user.id, purpose: COACH_AI_PURPOSE, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.coachMessage.deleteMany({ where: { userId: user.id } }),
    /* 정한 목표도 AI 가 기억하는 것이라 같이 지운다 */
    prisma.coachGoal.deleteMany({ where: { userId: user.id } }),
  ]);
  return { ok: true };
}

/** 대화 지우기(전부) */
export async function clearCoachChat(): Promise<{ ok: true }> {
  const user = await requireUser();
  await prisma.coachMessage.deleteMany({ where: { userId: user.id } });
  return { ok: true };
}

/** 맥락에 넣는 던진 날 창(오늘 포함) */
const THROW_DAYS = 7;

/**
 * 오늘 맥락 덩이 — 코드 · 숫자 · 앱이 정한 문장만(lib/coach/ai-prompt.ts). 이름 · 메모 글 · 영상은 안 넣는다.
 * 2026-11-16 넓힘: AI 가 일정 한 줄과 컨디션만 봐서 '오늘 불펜 했는데?'에 답할 재료가 없었다. 엔진이 이미 읽는 것(최근 투구 기록 · 팔 상태 ·
 * 운동 힘듦 · 오늘 운동의 까닭)과 과제별 완료를 같이 보낸다. 건강정보(체크인 신호 · 팔 상태 · 피할 동작 · 오늘 운동의 까닭)는 건강 동의가 있을 때만.
 * 2026-11-19 넓힘(자비스 1단계): 일정 밖 기록(3D 판정 · 메커니즘 처방 · 구속 · 암케어 · 영양, lib/coach/records.ts)도 — 동의 글 판 2026-11-19.
 */
async function contextOf(
  user: User,
  base: Awaited<ReturnType<typeof coachWeekBase>>,
  age: number
): Promise<{ text: string; health: boolean; goalOpen: boolean; pitch: CoachAiContext['pitchPlan']; work: Omit<TodayWork, 'picker' | 'started'> } | null> {
  const { today, slots, locked } = base;
  if (!slots) return null;
  const weekStart = slots[0].date;
  const healthP = healthConsentFor(user.id);
  const [done, profile, health, checkin, { facts, plan: pitch, state }, logs, setup, records, goalRow, todayScreen, progress] = await Promise.all([
    loadTrainingDone(user.id, weekStart, shiftDateKey(weekStart, 6)),
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true } }),
    healthP,
    prisma.dailyCheckin.findFirst({
      where: { userId: user.id, date: dbDate(today) },
      select: { condition: true, sleepQuality: true, shoulder: true, elbow: true, throwPlan: true },
    }),
    gatherFactsAndPlan(user, appNow()),
    prisma.pitchLog.findMany({
      where: { userId: user.id, date: { gte: dbDate(shiftDateKey(today, -(THROW_DAYS - 1))), lte: dbDate(today) } },
      select: { date: true, sessionType: true, pitchCount: true, intensity: true, effortPct: true },
    }),
    prisma.dailyTrainingSetup.findUnique({ where: { userId_date: { userId: user.id, date: dbDate(today) } }, select: { plan: true } }),
    /* 일정 밖 기록(자비스 1단계) — 건강 동의와 같이 읽으려고 늘 읽고, 영양 할 일 한 줄만 아래에서 동의로 거른다 */
    coachRecordsOf(user, today, appNow()),
    prisma.coachGoal.findUnique({ where: { userId: user.id } }),
    /* 오늘 운동 화면과 같은 목록(개인 비서 2단계) — 못 읽으면 그 줄만 빠진다 */
    loadTrainingToday(user, appNow()).catch(() => null),
    /* 최근 4주 진척(검토 1번, 2026-11-21) — 몸 상태가 섞인 칸은 건강 동의로 거른다 */
    coachProgressOf(user, today, healthP.then((h) => h.valid)),
  ]);
  const saved = savedOf(profile?.answers);
  const outing = slots.find((s) => s.date >= today && (s.items.some((x) => x.kind === 'fixed' && x.what === 'game') || s.reasons.some((r) => r === 'outing' || r === 'outing-soft')));
  const daysTo = outing ? Math.round((Date.parse(`${outing.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  const pain = [...(checkin?.shoulder === '통증' ? ['pain:shoulder'] : []), ...(checkin?.elbow === '통증' ? ['pain:elbow'] : [])];
  const signals: CoachAiContext['signals'] = !health.valid
    ? 'no-consent'
    : !checkin
      ? 'missing'
      : [`condition:${checkin.condition}`, ...(checkin.sleepQuality != null ? [`sleep:${checkin.sleepQuality}`] : []), ...(pain.length ? pain : ['pain:none'])];
  const arm = health.valid ? armStatusOf(facts) : null;
  const plan = readDailyPlan(setup?.plan);
  const ctx: CoachAiContext = {
    today,
    ageBand: ageBandOf(age),
    /* 코드값(starter · velocity)이 아니라 우리말 — 답에 'velocity' 가 새면 scrubCodes 가 '구속 측정'으로 바꿔 뜻이 틀어졌다(2026-11-21 검토) */
    role: COACH_ROLES.find((o) => o.value === saved.role)?.label ?? null,
    priority: COACH_PRIORITIES.find((o) => o.value === saved.priority)?.label ?? null,
    nextOutingInDays: daysTo,
    signals,
    outingAnswer: checkin?.throwPlan ?? null,
    throws: throwsOf(logs.map((l) => ({ ...l, date: keyOfDbDate(l.date) }))),
    loggedToday: logs.some((l) => keyOfDbDate(l.date) === today),
    arm: arm ? { level: ARM_LEVEL_LABEL[arm.level], line: arm.headline } : null,
    efforts: facts.condition.trainingEffort?.last7 ?? [],
    effortSpike: facts.condition.trainingEffort?.spikeFlag ?? false,
    limits: health.valid ? (saved.limits ?? []).map((l) => COACH_LIMITS.find((o) => o.value === l)?.label ?? l) : null,
    todayPlan: plan
      ? {
          theme: plan.theme.label,
          minutes: plan.minutes,
          /* 까닭 글에는 통증 · 컨디션이 섞일 수 있어 건강 동의가 있을 때만 */
          why: health.valid ? [plan.theme.reason, ...(plan.auto?.reason ? [plan.auto.reason] : []), ...planReasonLines(plan)].filter(Boolean).slice(0, 4) : [],
        }
      : null,
    week: withTodayCut(slots, today, facts).map((s, i) => ({
      date: s.date,
      day: WEEKDAY_LABELS[i],
      plan: slotLine(s),
      reasons: reasonTextsFor(s.reasons, health.valid),
      state: slotStateOf(s, done[s.date], today),
      ...slotProgressOf(s, done[s.date]),
      /* 어제 이어보기의 답 — 아팠어요는 지금도 건강 동의가 있을 때만 */
      why: s.followup?.why === 'pain' && !health.valid ? null : followupReasonText(s.followup?.why),
      locked: locked(s.date),
    })),
    records: health.valid || typeof records.food !== 'object' || records.food == null ? records : { ...records, food: { ...records.food, headline: null } },
    progress,
    goal: goalLine(goalStateOf(goalRow), today),
    workout: workoutOf(todayScreen, health.valid),
    /* 투구 계획은 통증 · 재활 신호로 정해져 건강정보다 — 동의가 없으면 공 수를 말하지 않게 '모름' */
    pitchPlan: health.valid ? pitchPlanOf(pitch, age) : 'no-consent',
  };
  /* 오늘 운동 바꾸기의 확인 재료 — 맥락과 같은 값(양 늘리기는 몸 신호 · 통증 확인 전 · 멈춘 계획이면 막는다, 몸 신호가 먼저) */
  const body = decideVolume(state);
  const work = {
    checkedIn: facts.condition.today != null,
    rows: todayScreen?.body.kind === 'plan' ? todayScreen.body.plan.groups.flatMap((g) => g.items.map((i) => ({ id: i.id, title: i.title }))) : [],
    harderBlock: pitch.halted ? '통증 · 재활로 멈춘 계획이에요.' : pitch.needsPainCheck ? '오늘 통증 확인이 먼저예요.' : body ? body.why.join(' ') : null,
    young: age < 16,
  };
  return { text: contextBlock(ctx), health: health.valid, goalOpen: goalRow?.status === 'open', pitch: ctx.pitchPlan, work };
}

/** 앱 투구 계획 → 코치 맥락. 오늘 칸이 없거나(멈춘 계획) 통증 확인 전이면 공 수를 말하지 않는 날 */
function pitchPlanOf(pitch: Awaited<ReturnType<typeof gatherFactsAndPlan>>['plan'], age: number): CoachAiPitchPlan {
  const t = pitch.today;
  const stop = pitch.halted ? (pitch.haltReason ?? '통증 · 재활로 멈춘 계획') : pitch.needsPainCheck ? '통증 확인 전(오늘 체크인 먼저)' : !t ? '오늘 계획 없음' : null;
  return {
    throwing: t?.throwing ?? false,
    min: t?.minPitches ?? null,
    max: t?.maxPitches ?? null,
    minIntensity: t?.minIntensity ?? null,
    maxIntensity: t?.maxIntensity ?? null,
    reason: t?.reason ?? '',
    outing: t?.outing ?? null,
    cap: dailyPitchCap(age),
    stop,
  };
}

/** 오늘 운동 화면 → 코치 맥락(구간 · 운동 이름 · 처방). 멈춘 까닭은 통증이 섞여 건강 동의가 있을 때만 */
function workoutOf(t: TrainingToday | null, health: boolean): CoachAiWorkout | undefined {
  if (!t) return undefined;
  const b = t.body;
  if (b.kind === 'plan')
    return {
      kind: 'plan',
      title: b.plan.title,
      minutes: b.plan.minutes,
      groups: b.plan.groups.map((g) => ({ label: g.label, items: g.items.map((i) => ({ name: i.title, rx: i.prescription, done: i.done })) })),
    };
  if (b.kind === 'make' || b.kind === 'empty') return { kind: 'make', checkedIn: b.make.checkedIn };
  if (b.kind === 'program') return { kind: 'program', text: b.text };
  if (b.kind === 'halted') return { kind: 'halted', reason: health ? b.reason : null };
  return { kind: 'none' };
}

const FALLBACK = {
  refusal: '그 이야기는 도와드리기 어려워요. 훈련이나 기록 이야기를 해 주세요.',
  other: '지금은 답하기 어려워요. 단추로는 계속 바꿀 수 있어요.',
};

/** 한 마디 — 판정 → 맥락 → AI → 비용 기록 → 바꿀 거리 거르기 → 두 마디 저장. 막히면 저장 없이 막힘 글 */
export async function sendCoachMessage(
  text: unknown
): Promise<
  | { ok: true; blocked: string }
  | { ok: true; reply: string; adjusts: CoachAdjust[]; goal: GoalOffer | null; act: CoachAct | null; cards: ShownCard[]; messageId: string; left: number }
  | { error: string }
> {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const said = typeof text === 'string' ? text.trim() : '';
  if (!said) return { error: '할 말을 적어 주세요.' };
  if (said.length > MAX_TEXT) return { error: `${MAX_TEXT}자 안으로 적어 주세요.` };
  /* 막힌 사람(동의 · 나이 · 하루 상한 · 월 비용)은 비싼 자료(3D · 영양 · 구속) 읽기 전에 — 자리 잡기 안에서 한 번 더 본다 */
  const pre = (await gateFor(user)).gate;
  if (!pre.ok) return { ok: true, blocked: AI_BLOCK_TEXT[pre.why] };
  const base = await coachWeekBase(user.id);
  const context = await contextOf(user, base, ageOn(user.birthDate, appNow()) ?? 20);
  if (!context || !base.slots) return { error: '이번 주 일정이 없어요.' };
  /*
   * 마디 자리를 먼저 잡는다 — 사용자별 잠금 안에서 세고 · 빈 기록(실패 · 값 0)을 먼저 만든 뒤 AI 를 부르고, 끝나면 그 기록을 채운다. 예전에는
   * 세고 → AI → 기록 차례라 동시에 보낸 요청이 모두 '오늘 0마디'로 통과했다(2026-11-17 검토 [24]). 월 상한은 값을 모른 채 잡혀 몇 센트 넘을 수 있다(설계).
   */
  const seat = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`coach-chat:${user.id}`}, 0))`;
      const { gate } = await gateFor(user, tx);
      if (!gate.ok) return { blocked: gate.why } as const;
      const log = await tx.coachLog.create({
        data: { userId: user.id, kind: 'chat', model: COACH_MODEL_CHAT, ok: false, ms: 0, inTok: 0, outTok: 0, cacheTok: 0, costMicro: 0 },
        select: { id: true },
      });
      return { left: gate.left, logId: log.id } as const;
    },
    { maxWait: 10_000, timeout: 15_000 }
  );
  if (seat.blocked) return { ok: true, blocked: AI_BLOCK_TEXT[seat.blocked] };

  /* 건강 동의가 없어졌으면 그 앞의 대화는 안 보낸다(앱이 건넨 건강정보가 섞여 있다 — lib/health-consent.ts healthCutoffOf) */
  const floor = historyFloorOf(new Date(Date.now() - KEEP_DAYS * 86_400_000), healthCutoffOf(await consentRecordsOf(user.id, HEALTH_PURPOSE)));
  const history = floor
    ? await prisma.coachMessage.findMany({
        where: { userId: user.id, createdAt: { gte: floor } },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_TURNS,
        select: { role: true, text: true },
      })
    : [];
  const lines: ChatLine[] = history.reverse().map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: m.text }));
  /* 도구 — 읽기는 바로, 바꾸기는 카드만 모은다(lib/coach/tools.ts). 실행은 선수가 카드를 누를 때(applyCoachCard) */
  const cards: CoachCard[] = [];
  let picked: Promise<Awaited<ReturnType<typeof loadTodayPicker>>> | null = null;
  const todayWork: TodayWork = { ...context.work, started: base.locked(base.today), picker: () => (picked ??= loadTodayPicker(user, appNow())) };
  const box = toolboxOf({ user, today: base.today, said, health: context.health, week: base.slots, locked: base.locked, goalOpen: context.goalOpen, cards, todayWork });
  const turn = await chatTurn(lines, context.text, said, box);
  await prisma.coachLog.update({
    where: { id: seat.logId },
    data: {
      model: turn.model,
      ok: turn.ok,
      ms: turn.ms,
      inTok: turn.usage.input_tokens ?? 0,
      outTok: turn.usage.output_tokens ?? 0,
      cacheTok: turn.usage.cache_read_input_tokens ?? 0,
      costMicro: costMicroOf(turn.model, turn.usage),
    },
  });
  const said0 = turn.ok ? scrubCodes(scrubNames(turn.reply)) : turn.why === 'refusal' ? FALLBACK.refusal : FALLBACK.other;
  /* 공 수 안전장치 — 앱 범위 · 하루 한도를 넘게 권하거나 말하면 안 되는 날 권하면 정해진 문장으로 */
  const reply = (turn.ok && guardPitchReply(said0, context.pitch)) || said0;
  /* 실패한 답에는 카드를 붙이지 않는다(되돌기 중간에 모인 것 — 글 없이 단추만 남지 않게) */
  const kept = turn.ok ? cards : [];
  const [, saved] = await prisma.$transaction([
    prisma.coachMessage.create({ data: { userId: user.id, role: 'user', text: said }, select: { id: true } }),
    prisma.coachMessage.create({
      data: { userId: user.id, role: 'coach', text: reply, act: kept.length ? cardsJson(kept) : undefined },
      select: { id: true },
    }),
  ]);
  const [shown] = await markLogged(user.id, [{ act: null, cards: kept.map(shownCard) }]);
  revalidatePath('/coach');
  return { ok: true, reply, adjusts: [], goal: null, act: null, cards: shown.cards, messageId: saved.id, left: Math.max(0, seat.left - 1) };
}

/* ─────────────── 정한 목표 이어 묻기(자비스 2단계, lib/coach/goal.ts · 설계 9절) ─────────────── */

/** 순수 상태 → DB 칸(답한 때 · 정한 때는 지금 시각) */
const goalData = (g: CoachGoalState) => ({
  what: g.what,
  trigger: g.trigger,
  checkOn: dbDate(g.checkOn),
  watchFrom: dbDate(g.watchFrom),
  status: g.status,
  feel: g.feel,
  result: g.result,
  laterOn: g.laterOn ? dbDate(g.laterOn) : null,
});

/** 코치 탭의 이어 묻기 카드 — 정한 목표가 없으면 card null. AI 를 부르지 않는다(값 0) */
export async function loadCoachGoal(): Promise<{ ok: true; card: GoalCard | null } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { ok: false, error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const goal = goalStateOf(await prisma.coachGoal.findUnique({ where: { userId: user.id } }));
  if (!goal || goal.status !== 'open') return { ok: true, card: null };
  const today = toDateKey(appNow());
  return { ok: true, card: goalCardOf(goal, await goalLogsOf(user.id, goal, today), today) };
}

/**
 * 목표 제안 실행 — 옛 목표 카드(applyCoachGoal)와 코치 카드(applyCoachCard)가 같이 쓴다. 제안은 서버에 둔 마디에서 읽은 것만 온다.
 * 지금 목표를 정한 뒤로 지난 제안(옛 '그만두기' · 옛 목표)은 새 목표를 덮지 않는다(둘 다 실제 시각). 날이 지났으면 다시 거른다.
 */
async function applyGoalOffer(userId: string, offer: GoalOffer, offeredAt: Date): Promise<{ ok: true } | { error: string }> {
  const current = await prisma.coachGoal.findUnique({ where: { userId }, select: { setAt: true } });
  if (current && offeredAt < current.setAt) return { error: '지난 제안이에요. 코치에게 다시 말해 주세요.' };
  const today = toDateKey(appNow());
  const p = sanitizeGoal(offer, today);
  if (!p) return { error: '확인할 날이 지났어요. 코치에게 다시 말해 주세요.' };
  if (p.kind === 'drop') {
    await prisma.coachGoal.updateMany({ where: { userId, status: 'open' }, data: { status: 'dropped', answeredAt: new Date() } });
  } else {
    const data = { ...goalData(goalFromProposal(p, today)), setAt: new Date(), answeredAt: null };
    await prisma.coachGoal.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }
  return { ok: true };
}

/** 옛 대화 마디의 목표 카드 [정하기] · [지우기] — 제안은 서버에 둔 마디에서 읽는다(앱이 보낸 값을 믿지 않는다) */
export async function applyCoachGoal(messageId: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  if (typeof messageId !== 'string') return { error: '다시 눌러 주세요.' };
  const m = await prisma.coachMessage.findFirst({ where: { id: messageId, userId: user.id, role: 'coach' }, select: { goal: true, createdAt: true } });
  const offer = m?.goal && typeof m.goal === 'object' ? (m.goal as GoalOffer) : null;
  if (!offer) return { error: '이 제안을 찾지 못했어요.' };
  if (offer.applied) return { ok: true };
  const r = await applyGoalOffer(user.id, offer, m!.createdAt);
  if ('error' in r) return r;
  await prisma.coachMessage.update({ where: { id: messageId }, data: { goal: { ...offer, applied: true } } });
  revalidatePath('/coach');
  return { ok: true };
}

/**
 * 오늘 운동 바꾸기 카드 실행(개인 비서 2단계) — 운동을 시작한 뒤에는 안 된다(카드를 만든 뒤 시작했어도). 운동량 · 부위 · 종류는 오늘 운동을
 * 같은 만들기 길로 다시 짜고(lib/coach/today-sync.ts remakeToday — 몸 신호 · 안전 규칙이 먼저다), 빼기 · 더하기 · 바꾸기는 운동 화면의 고치기와
 * 같은 동작(plan-edit)이다. 성장기 양 늘리기는 여기서도 다시 막는다.
 */
async function applyTodayChange(user: User, args: Record<string, unknown>): Promise<{ ok: true } | { error: string }> {
  const { today, locked } = await coachWeekBase(user.id);
  if (locked(today)) return { error: '오늘 운동을 이미 시작해서 여기서는 못 바꿔요.' };
  const k = args.kind;
  if (k === 'lighter' || k === 'harder') {
    if (k === 'harder' && (ageOn(user.birthDate, appNow()) ?? 0) < 16) return { error: '성장기는 운동량을 늘리지 않아요.' };
    await remakeToday(user.id, today, { coachVolume: k });
    return { ok: true };
  }
  if (k === 'focus' || k === 'workout') {
    const row = await prisma.dailyTrainingSetup.findUnique({ where: { userId_date: { userId: user.id, date: dbDate(today) } }, select: { preferredWorkout: true, preferredParts: true } });
    const parts = (row?.preferredParts ?? []).filter((p) => !findFocus(p));
    const focus = k === 'focus' ? String(args.focus) : ((row?.preferredParts ?? []).find((p) => findFocus(p)) ?? null);
    const workout = k === 'workout' ? String(args.workout) : pickWorkoutKind(row?.preferredWorkout);
    const saved = await saveTrainingPrefs({ date: today, workout, parts, focus });
    if (!saved.ok) return { error: saved.error };
    await remakeToday(user.id, today, { auto: true });
    return { ok: true };
  }
  const id = (v: unknown) => (typeof v === 'string' ? v : '');
  if (k === 'remove') return removeFromTodayPlan(id(args.id));
  if (k === 'add') return addToTodayPlan(id(args.id));
  if (k === 'swap') {
    const out = await removeFromTodayPlan(id(args.out));
    return 'error' in out ? out : addToTodayPlan(id(args.in));
  }
  return { error: '이 카드는 실행할 수 없어요.' };
}

/**
 * 코치 카드 실행(개인 비서 1단계) — 카드는 서버에 둔 마디에서 읽고(앱이 보낸 값을 믿지 않는다) 그 도구의 확인을 다시 탄 뒤 실행한다.
 * 화면을 여는 카드(open)는 앱이 연다 — 여기 오지 않는다. 실행하면 카드를 '함'으로.
 */
export async function applyCoachCard(messageId: unknown, cardId: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  if (typeof messageId !== 'string' || typeof cardId !== 'string') return { error: '다시 눌러 주세요.' };
  const m = await prisma.coachMessage.findFirst({ where: { id: messageId, userId: user.id, role: 'coach' }, select: { act: true, createdAt: true } });
  const cards = readCards(m?.act);
  const card = cards?.find((c) => c.id === cardId);
  if (!m || !cards || !card) return { error: '이 카드를 찾지 못했어요.' };
  if (card.done) return { ok: true };
  if (card.open) return { error: '앱에서 여는 카드예요.' };
  if (!cardDayOk(card.tool, toDateKey(m.createdAt), toDateKey(appNow()))) return { error: '지난 날 카드예요. 코치에게 다시 말해 주세요.' };
  const args = (card.args ?? {}) as Record<string, unknown>;
  const r =
    card.tool === 'change_week'
      ? await applyCoachAdjust(args.adjust, args.token)
      : card.tool === 'goal' && args.offer && typeof args.offer === 'object'
        ? await applyGoalOffer(user.id, args.offer as GoalOffer, m.createdAt)
        : card.tool === 'change_today'
          ? await applyTodayChange(user, args)
          : ASSIST_TOOLS.has(card.tool)
            ? await applyAssist(user, card.tool, args)
            : { error: '이 카드는 실행할 수 없어요.' };
  if ('error' in r) return r;
  await prisma.coachMessage.update({ where: { id: messageId }, data: { act: cardsJson(cards.map((c) => (c.id === cardId ? { ...c, done: true } : c))) } });
  revalidatePath('/coach');
  return { ok: true };
}

/** 이어 묻기 카드의 답 — 느낌(+한 줄) · 못 했어요(다음 기회 · 그만두기) · 나중에 */
export async function answerCoachGoal(answer: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const a = readGoalAnswer(answer);
  if (!a) return { error: '다시 골라 주세요.' };
  const goal = goalStateOf(await prisma.coachGoal.findUnique({ where: { userId: user.id } }));
  if (!goal) return { error: '정한 목표가 없어요.' };
  const r = applyGoalAnswer(goal, a, toDateKey(appNow()));
  if ('error' in r) return r;
  const answered = r.next.status !== 'open';
  await prisma.coachGoal.update({ where: { userId: user.id }, data: { ...goalData(r.next), ...(answered ? { answeredAt: new Date() } : {}) } });
  revalidatePath('/coach');
  return { ok: true };
}
