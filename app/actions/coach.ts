'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { coachPaid } from '@/lib/coach-access';
import { ageOn, CONSENT_MIN_AGE } from '@/lib/analysis-consent';
import { HEALTH_CONSENT, HEALTH_PURPOSE } from '@/lib/health-consent';
import { healthConsentFor } from '@/lib/analysis-consent-store';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { isHardOuting } from '@/lib/report/facts';
import { outingOf } from '@/lib/engine/outing';
import { YOUTH_AGE_THRESHOLD } from '@/lib/report/plan';
import { BASELINE_WORKOUT_FREQ } from '@/lib/baseline';
import { activeProgram } from '@/lib/program/load';
import { parseProgram, PROGRAMS } from '@/lib/program/program';
import { isOutingTitle } from '@/lib/calendar-event';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { planWeek, suggestProgram, weekdayOf, type DaySlot, type FixedDay, type WeekInput } from '@/lib/coach/week';
import { startProgram } from '@/app/actions/program';
import { slotStateOf } from '@/lib/coach/status';
import { applyAdjust, readAdjust } from '@/lib/coach/adjust';
import { coachSlotOf, coachWeekBase } from '@/lib/coach/today';
import { buildReview, reviewWeekOf, type WeekReview } from '@/lib/coach/review';
import { zonedFormat } from '@/lib/time-zone';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { visibleExercises } from '@/lib/library-cache';
import { movementKeyOf } from '@/lib/engine/exercise-class';
import { loadTrainingDone } from '@/lib/training-week';
import { COACH_STEPS, mergeStep, savedOf, slotLine, type CoachSaved, type CoachStep } from '@/lib/coach/answers';

/**
 * 코치 시작 흐름(앱, docs/designs/ai-coach.md 10-4) — 관문(유료 · 만 14세 · 건강정보 동의) → 질문(화면마다 저장) → 첫 주 미리보기 → 시작.
 * 운동 목록은 짜지 않는다 — 한 주 틀만(lib/coach/week.ts). 그날 운동은 기존 엔진이 만든다(R2).
 * 출시 전 베타에는 모듈째 잠긴다(lib/release-ops.ts 'coach' = /coach 와 같은 'analysis') — 그래서 밝힘 줄(allowFeature)을 두지 않는다.
 */

type Gate = 'free' | 'age' | 'consent' | 'ready';

async function gateOf(user: Awaited<ReturnType<typeof requireUser>>): Promise<{ gate: Gate; healthOk: boolean }> {
  if (!(await coachPaid(user))) return { gate: 'free', healthOk: false };
  const age = ageOn(user.birthDate, appNow());
  /* 만 14세 미만에게 AI 코치는 열지 않는다(U21). 생년월일을 모르면 묻는 대신 막는다 — 나이가 계획(성장기)에 들어가서 */
  if (age == null || age < CONSENT_MIN_AGE) return { gate: 'age', healthOk: false };
  const healthOk = (await healthConsentFor(user.id)).valid;
  return { gate: healthOk ? 'ready' : 'consent', healthOk };
}

/** 첫 화면 — 관문 · 지금 상태 · 저장된 답 · 확인할 내 정보 · 건강정보 동의 문서 */
export async function loadCoachStart() {
  const user = await requireUser();
  const [{ gate }, profile, program] = await Promise.all([
    gateOf(user),
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true, answers: true } }),
    activeProgram(user.id),
  ]);
  const plan = program ? parseProgram(program.programKey) : null;
  return {
    ok: true as const,
    gate,
    status: (profile?.status ?? 'none') as 'none' | 'draft' | 'active' | 'paused',
    answers: savedOf(profile?.answers),
    info: {
      age: ageOn(user.birthDate, appNow()),
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      hand: user.throwingHand,
      level: user.trainingLevel,
      equipment: user.ownedEquipment,
      minutes: user.dailyWorkoutMinutes,
      program: plan ? { name: plan.def.name, perWeek: plan.perWeek } : null,
    },
    health: HEALTH_CONSENT,
  };
}

/** 건강정보 동의(그 자리 동의, U15) — 코치 시작 화면에서 */
export async function agreeHealthConsent(version: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (version !== HEALTH_CONSENT.version) return { error: '동의 내용이 바뀌었어요. 다시 읽고 동의해 주세요.' };
  const age = ageOn(user.birthDate, appNow());
  if (age != null && age < CONSENT_MIN_AGE) return { error: '만 14세 미만은 보호자의 동의가 필요해요.' };
  if ((await healthConsentFor(user.id)).valid) return { ok: true };
  await prisma.analysisConsent.create({ data: { userId: user.id, version: HEALTH_CONSENT.version, source: 'first_use', purpose: HEALTH_PURPOSE } });
  return { ok: true };
}

export async function saveCoachAnswer(step: unknown, value: unknown): Promise<{ ok: true; answers: CoachSaved } | { error: string }> {
  const user = await requireUser();
  const { gate, healthOk } = await gateOf(user);
  if (gate === 'free' || gate === 'age') return { error: '코치를 시작할 수 없어요.' };
  if (!(COACH_STEPS as readonly unknown[]).includes(step) || !value || typeof value !== 'object') return { error: '답을 다시 골라 주세요.' };
  const prev = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true, status: true } });
  const next = mergeStep(savedOf(prev?.answers), step as CoachStep, value as Record<string, unknown>, healthOk);
  if (!next) return { error: '답을 다시 골라 주세요.' };
  await prisma.coachProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, answers: next, status: 'draft' },
    update: { answers: next },
  });
  return { ok: true, answers: next };
}

/** 저장된 답 + 앱의 기록 → 계획기 입력(그 주 월요일부터) */
async function weekInputOf(user: Awaited<ReturnType<typeof requireUser>>, saved: CoachSaved, healthOk: boolean): Promise<WeekInput> {
  const now = appNow();
  const today = toDateKey(now);
  const weekStart = shiftDateKey(today, -weekdayOf(today));
  const weekEnd = shiftDateKey(weekStart, 6);
  const [{ facts }, program, mechanics, events] = await Promise.all([
    gatherFactsAndPlan(user, now),
    activeProgram(user.id),
    prisma.mechanicsProgram.findUnique({ where: { userId: user.id }, select: { id: true } }),
    prisma.calendarEvent.findMany({ where: { userId: user.id, date: { gte: dbDate(weekStart), lte: dbDate(weekEnd) } }, select: { date: true, title: true } }),
  ]);
  const outing = outingOf(facts);
  const lastHard = (facts.patterns.hardOutings ?? []).filter(isHardOuting).sort((a, b) => a.daysAgo - b.daysAgo)[0];
  const t = facts.condition.today;
  const fixed: FixedDay[] = events.filter((e) => isOutingTitle(e.title)).map((e) => ({ date: keyOfDbDate(e.date), kind: 'game' }));
  const freq = BASELINE_WORKOUT_FREQ.find((f) => f.name === user.baselineWorkoutFreq)?.sessionsPerWeek;
  return {
    weekStart,
    today,
    answers: {
      days: saved.days ?? [0, 1, 2, 3, 4, 5],
      minutes: saved.minutes ?? user.dailyWorkoutMinutes ?? 60,
      outingDays: saved.outingDays ?? [],
      outingEvery: saved.outingEvery ?? null,
      teamDays: saved.teamDays ?? [],
    },
    fixed,
    outingDate: outing.nextDay != null ? shiftDateKey(today, outing.nextDay) : null,
    lastOuting: lastHard ? shiftDateKey(today, -lastHard.daysAgo) : null,
    youth: (facts.profile.age ?? 99) < YOUTH_AGE_THRESHOLD,
    /* 건강정보 — 동의가 있을 때만 읽는다(U18) */
    painArm: healthOk && !!t && (t.shoulder === '통증' || t.elbow === '통증'),
    effortSpike: facts.condition.trainingEffort?.spikeFlag ?? false,
    level: user.trainingLevel,
    baselineFreq: freq == null ? null : Math.round(freq),
    program: program ? { perWeek: parseProgram(program.programKey)?.perWeek ?? 3 } : null,
    /* ponytail: 메커니즘 프로그램엔 주당 횟수 칸이 없다 — 주 2번으로 둔다(12세션 순서는 날짜 의무가 아님), 칸이 생기면 그것으로 */
    mechanics: mechanics ? { perWeek: 2 } : null,
  };
}

const programPick = (user: Awaited<ReturnType<typeof requireUser>>, saved: CoachSaved, hasProgram: boolean) => {
  if (hasProgram) return null;
  const pick = suggestProgram({
    age: ageOn(user.birthDate, appNow()),
    level: user.trainingLevel,
    ownedEquipment: user.ownedEquipment,
    basicsDone: false,
    priority: saved.priority ?? null,
    trainingDays: saved.days?.length ?? 0,
  });
  const def = pick ? PROGRAMS.find((p) => p.id === pick.id) : null;
  return pick && def ? { ...pick, name: def.name, why: def.why ?? null } : null;
};

/** 첫 주 미리보기 — 저장하지 않는다. 프로그램이 없으면 제안 하나(U26), 미리보기는 '프로그램 없이' 짠 주와 '프로그램으로' 짠 주 둘 */
export async function previewCoachWeek() {
  const user = await requireUser();
  const { gate, healthOk } = await gateOf(user);
  if (gate === 'free' || gate === 'age') return { error: '코치를 시작할 수 없어요.' } as const;
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true } });
  const saved = savedOf(profile?.answers);
  if (!saved.days?.length) return { error: '운동할 수 있는 요일부터 골라 주세요.' } as const;
  const input = await weekInputOf(user, saved, healthOk);
  const suggested = programPick(user, saved, input.program != null);
  return {
    ok: true as const,
    weekStart: input.weekStart,
    week: planWeek(input),
    hasProgram: input.program != null,
    suggested,
    withProgram: suggested ? planWeek({ ...input, program: { perWeek: suggested.perWeek } }) : null,
  };
}

/** 그 주 틀을 저장 — 같은 주를 다시 맞추면 지난 날 · 사용자가 고친 날은 그대로(planWeek prev) */
async function saveWeek(userId: string, input: WeekInput): Promise<DaySlot[]> {
  const weekStart = dbDate(input.weekStart);
  const old = await prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId, weekStart } }, select: { slots: true } });
  const slots = planWeek({ ...input, prev: old ? (old.slots as unknown as DaySlot[]) : null });
  const fingerprint = createHash('sha1').update(JSON.stringify({ ...input, today: null })).digest('hex').slice(0, 16);
  await prisma.coachWeek.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart, slots, fingerprint },
    update: { slots, fingerprint, generatedAt: new Date() },
  });
  return slots;
}

/** 시작 — 관문을 다시 보고, 고르면 제안 프로그램을 시작하고, 이번 주 틀을 저장한다. 다시 시작(답 고치기)이면 지난 날은 그대로 */
export async function startCoach(input: { program?: unknown }): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const { gate, healthOk } = await gateOf(user);
  if (gate !== 'ready') return { error: gate === 'consent' ? '건강정보 동의가 필요해요.' : '코치를 시작할 수 없어요.' };
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true, status: true } });
  const saved = savedOf(profile?.answers);
  if (!saved.days?.length) return { error: '운동할 수 있는 요일부터 골라 주세요.' };
  let week = await weekInputOf(user, saved, healthOk);
  if (input?.program === true && week.program == null) {
    const pick = programPick(user, saved, false);
    if (!pick) return { error: '맞는 프로그램이 없어요. 프로그램 없이 시작해 주세요.' };
    const started = await startProgram({ programId: pick.id, perWeek: pick.perWeek });
    if ('error' in started) return { error: started.error };
    week = { ...week, program: { perWeek: pick.perWeek } };
  }
  await saveWeek(user.id, week);
  if (profile?.status !== 'active')
    await prisma.coachProfile.update({ where: { userId: user.id }, data: { status: 'active', startedAt: new Date() } });
  revalidatePath('/coach');
  return { ok: true };
}

/**
 * 이번 주 틀(코치 탭 · PC 읽기) + 칸 상태 · 오늘 체크인 했나. 진행 중인데 이번 주 틀이 없으면(새 주) 처음 열 때 짓는다(10-5 — 크론 없이).
 * 건강 동의를 거둔 뒤에도 코치는 이어 간다 — 통증만 안 읽는다(healthOk false).
 */
export async function loadCoachWeek() {
  const user = await requireUser();
  if (!(await coachPaid(user))) return { ok: true as const, week: null, states: null, checkedIn: false, review: null };
  const now = appNow();
  const today = toDateKey(now);
  const weekStart = shiftDateKey(today, -weekdayOf(today));
  const [row, profile, checkin, done] = await Promise.all([
    prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart: dbDate(weekStart) } }, select: { slots: true } }),
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true, answers: true } }),
    prisma.dailyCheckin.findFirst({ where: { userId: user.id, date: dbDate(today) }, select: { id: true } }),
    loadTrainingDone(user.id, weekStart, shiftDateKey(weekStart, 6)),
  ]);
  let week = row ? (row.slots as unknown as DaySlot[]) : null;
  if (!week && profile?.status === 'active') {
    const { gate, healthOk } = await gateOf(user);
    const saved = savedOf(profile.answers);
    if ((gate === 'ready' || gate === 'consent') && saved.days?.length) week = await saveWeek(user.id, await weekInputOf(user, saved, healthOk));
  }
  return {
    ok: true as const,
    today,
    weekStart,
    week,
    states: week ? week.map((s) => slotStateOf(s, done[s.date], today)) : null,
    checkedIn: checkin != null,
    review: profile?.status === 'active' ? await reviewOf(user.id, today, Number(zonedFormat('en-US', { hour: 'numeric', hourCycle: 'h23' }).format(now))) : null,
  };
}

/** 주간 리뷰(U37) — 일요일 18시 ~ 월요일, [확인] 전까지. 칸 상태는 기록에서, 힘듦 · 불편 동작은 그날 기록 줄에서(불편은 건강 동의가 있을 때만) */
async function reviewOf(userId: string, today: string, hour: number): Promise<WeekReview | null> {
  const ws = reviewWeekOf(today, hour);
  if (!ws) return null;
  const end = shiftDateKey(ws, 6);
  const row = await prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId, weekStart: dbDate(ws) } }, select: { slots: true, reviewAckAt: true } });
  if (!row || row.reviewAckAt) return null;
  const slots = row.slots as unknown as DaySlot[];
  const [done, notes, consent] = await Promise.all([
    loadTrainingDone(userId, ws, end),
    prisma.dailyTrainingNote.findMany({ where: { userId, date: { gte: dbDate(ws), lte: dbDate(end) } }, select: { date: true, intensity: true, discomfort: true } }),
    healthConsentFor(userId),
  ]);
  const efforts: Record<string, number> = {};
  const discomfort: Record<string, string[]> = {};
  for (const n of notes) {
    const d = keyOfDbDate(n.date);
    efforts[d] = n.intensity;
    if (consent.valid && Array.isArray(n.discomfort))
      discomfort[d] = (n.discomfort as { id?: unknown; move?: unknown }[]).map((x) => String(x.move ?? x.id ?? '')).filter(Boolean);
  }
  return buildReview({ weekStart: ws, slots, states: slots.map((s) => slotStateOf(s, done[s.date], today)), efforts, discomfort });
}

/** 주간 리뷰 [확인] — 그 주 카드를 접는다 */
export async function ackWeeklyReview(weekStart: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (typeof weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { error: '다시 눌러 주세요.' };
  await prisma.coachWeek.updateMany({ where: { userId: user.id, weekStart: dbDate(weekStart), reviewAckAt: null }, data: { reviewAckAt: new Date() } });
  revalidatePath('/coach');
  return { ok: true };
}

/* ─────────── 조정 단추(10-5 U35) — 미리보기 → 적용. 미리본 그 틀일 때만 적용(그새 바뀌었으면 다시 미리보기) ─────────── */

const slotsKey = (slots: unknown) => createHash('sha1').update(JSON.stringify(slots)).digest('hex').slice(0, 16);


export async function previewCoachAdjust(raw: unknown) {
  const user = await requireUser();
  if (!(await coachPaid(user))) return { error: '코치를 쓸 수 없어요.' } as const;
  const adj = readAdjust(raw);
  if (!adj) return { error: '다시 골라 주세요.' } as const;
  const { slots, locked } = await coachWeekBase(user.id);
  if (!slots) return { error: '이번 주 일정이 없어요.' } as const;
  const r = applyAdjust(slots, adj, locked);
  if ('error' in r) return { error: r.error } as const;
  return {
    ok: true as const,
    token: slotsKey(slots),
    changed: r.changed.map((date) => ({
      date,
      before: slotLine(slots.find((s) => s.date === date)!),
      after: slotLine(r.week.find((s) => s.date === date)!),
    })),
  };
}

export async function applyCoachAdjust(raw: unknown, token: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!(await coachPaid(user))) return { error: '코치를 쓸 수 없어요.' };
  const adj = readAdjust(raw);
  if (!adj) return { error: '다시 골라 주세요.' };
  const { weekStart, slots, locked } = await coachWeekBase(user.id);
  if (!slots) return { error: '이번 주 일정이 없어요.' };
  if (token !== slotsKey(slots)) return { error: '그새 일정이 바뀌었어요. 다시 골라 주세요.' };
  const r = applyAdjust(slots, adj, locked);
  if ('error' in r) return { error: r.error };
  /* ponytail: 토큰 확인과 저장 사이가 아주 짧아 한 사람의 겹친 요청만 걱정 — 잠금 없이 둔다, 여럿이 같은 틀을 고치게 되면 조건부 갱신으로 */
  await prisma.coachWeek.update({ where: { userId_weekStart: { userId: user.id, weekStart } }, data: { slots: r.week as unknown as object, generatedAt: new Date() } });
  revalidatePath('/coach');
  return { ok: true };
}

/** 트레이닝 운동 화면의 코치 한 줄(하루의 주인 U38) — 코치 진행 중일 때만. 사용자가 그날을 가져갔으면 owner 'user' */
export async function loadCoachToday() {
  const user = await requireUser();
  const slot = await coachSlotOf(user, toDateKey(appNow()));
  if (!slot) return { ok: true as const, coach: null };
  return {
    ok: true as const,
    coach: { line: slotLine(slot), owner: slot.owner, work: slot.items.some((x) => x.kind === 'train' || x.kind === 'program') },
  };
}

/** 코치 메인 [오늘 다시 코치에게] — 사용자가 가져간 오늘을 코치에게 돌려준다. 그날 이미 만든 운동은 그대로(다시 만들면 코치 시간) */
export async function takeBackToday(): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!(await coachPaid(user))) return { error: '코치를 쓸 수 없어요.' };
  const today = toDateKey(appNow());
  const weekStart = dbDate(shiftDateKey(today, -weekdayOf(today)));
  const row = await prisma.coachWeek.findUnique({ where: { userId_weekStart: { userId: user.id, weekStart } }, select: { slots: true } });
  if (!row) return { error: '이번 주 일정이 없어요.' };
  const slots = (row.slots as unknown as DaySlot[]).map((s) => (s.date === today ? { ...s, owner: 'coach' as const } : s));
  await prisma.coachWeek.update({ where: { userId_weekStart: { userId: user.id, weekStart } }, data: { slots: slots as unknown as object } });
  revalidatePath('/coach');
  return { ok: true };
}

/* ─────────── 되먹임(10-5 U36) — 운동 끝 '불편했던 동작'. 건강정보라 코치 진행 중 · 건강 동의가 있을 때만 묻고 저장한다 ─────────── */

type Discomfort = { id: string; move: string | null };

async function discomfortSession(user: Awaited<ReturnType<typeof requireUser>>, sessionId: unknown) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const [profile, session, consent] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true } }),
    prisma.trainingSession.findFirst({ where: { id: sessionId, userId: user.id }, select: { date: true, plan: true } }),
    healthConsentFor(user.id),
  ]);
  if (profile?.status !== 'active' || !session || !consent.valid || !(await coachPaid(user))) return null;
  const plan = readFrozenPlan(session.plan);
  if (!plan) return null;
  const items = [...new Map(plan.exercises.map((e) => [e.id, { id: e.id, name: e.title }])).values()];
  return { date: session.date, items };
}

/** 운동 끝 화면 — 물을까(아니면 ask false) · 그 판의 운동 · 이미 고른 것 */
export async function loadDiscomfortAsk(sessionId: unknown) {
  const user = await requireUser();
  const s = await discomfortSession(user, sessionId);
  if (!s) return { ok: true as const, ask: false, items: [] as { id: string; name: string }[], chosen: [] as string[] };
  const note = await prisma.dailyTrainingNote.findUnique({ where: { userId_date: { userId: user.id, date: s.date } }, select: { discomfort: true } });
  const chosen = Array.isArray(note?.discomfort) ? (note.discomfort as Discomfort[]).map((x) => x.id) : [];
  return { ok: true as const, ask: true, items: s.items, chosen };
}

/** 고른 불편 동작 저장(없음 = 빈 목록) — 그날 힘듦 기록 줄에 붙인다. 움직임 열쇠로 다음 운동에서 같은 동작을 뒤로 미룬다(training-setup.ts) */
export async function saveDiscomfort(sessionId: unknown, ids: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const s = await discomfortSession(user, sessionId);
  if (!s) return { error: '지금은 저장할 수 없어요.' };
  if (!Array.isArray(ids) || ids.length > 30 || !ids.every((x) => typeof x === 'string' && s.items.some((i) => i.id === x)))
    return { error: '오늘 한 운동 중에서 골라 주세요.' };
  const lib = new Map((await visibleExercises()).map((e) => [e.id, e]));
  const list: Discomfort[] = [...new Set(ids as string[])].map((id) => {
    const ex = lib.get(id);
    return { id, move: ex ? movementKeyOf(ex) : null };
  });
  const done = await prisma.dailyTrainingNote.updateMany({ where: { userId: user.id, date: s.date }, data: { discomfort: list } });
  if (done.count === 0) return { error: '힘듦부터 골라 주세요.' };
  return { ok: true };
}
